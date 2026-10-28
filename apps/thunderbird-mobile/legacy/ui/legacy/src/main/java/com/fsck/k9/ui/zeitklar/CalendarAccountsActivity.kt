package com.fsck.k9.ui.zeitklar

import android.Manifest
import androidx.activity.result.contract.ActivityResultContracts
import net.thunderbird.feature.calendar.NativeCalendarSetup
import org.koin.android.ext.android.inject
import java.time.LocalDate
import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.os.Bundle
import android.provider.CalendarContract
import android.provider.Settings
import android.view.MenuItem
import android.view.View
import android.widget.LinearLayout
import android.widget.TextView
import android.widget.Toast
import androidx.core.content.ContextCompat
import androidx.lifecycle.lifecycleScope
import com.fsck.k9.ui.R
import com.fsck.k9.ui.base.BaseActivity
import com.google.android.material.button.MaterialButton
import com.google.android.material.card.MaterialCardView
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/** Shows desktop-imported profiles and delegates sign-in to Android's account settings. */
class CalendarAccountsActivity : BaseActivity() {
    private val googleAccounts: GoogleCalendarSetupRepository by inject()
    private val permissions = registerForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) {
        renderDeviceCalendars()
    }
    private lateinit var store: PlannerMobileStore
    private var sources = emptyList<MobileCalendarSource>()
    private var loadJob: Job? = null
    private var calendarsJob: Job? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setLayout(R.layout.zeitklar_calendar_accounts)
        store = PlannerMobileStore(applicationContext)
        supportActionBar?.apply {
            title = getString(R.string.zeitklar_calendar_accounts_title)
            setDisplayHomeAsUpEnabled(true)
        }
        findViewById<View>(R.id.zeitklar_calendar_add_account).setOnClickListener {
            openGoogleCalendar()
        }
        findViewById<View>(R.id.tb_calendar_allow_access).setOnClickListener {
            permissions.launch(arrayOf(Manifest.permission.READ_CALENDAR, Manifest.permission.WRITE_CALENDAR))
        }
        findViewById<View>(R.id.tb_calendar_manage_other_accounts).setOnClickListener { openAndroidAccountSetup() }
    }

    override fun onResume() {
        super.onResume()
        loadJob?.cancel()
        loadJob = lifecycleScope.launch {
            try {
                sources = withContext(Dispatchers.IO) {
                    store.calendarSources(store.load())
                }
                renderImportedSources()
                renderDeviceCalendars()
            } catch (error: CancellationException) {
                throw error
            } catch (_: Exception) {
                Toast.makeText(this@CalendarAccountsActivity, R.string.generic_loading_error, Toast.LENGTH_LONG).show()
            }
        }
    }

    override fun onPause() {
        loadJob?.cancel()
        calendarsJob?.cancel()
        super.onPause()
    }

    override fun onOptionsItemSelected(item: MenuItem): Boolean = when (item.itemId) {
        android.R.id.home -> {
            finish()
            true
        }

        else -> super.onOptionsItemSelected(item)
    }

    private fun renderImportedSources() {
        val list = findViewById<LinearLayout>(R.id.zeitklar_calendar_imported_accounts)
        list.removeAllViews()
        if (sources.isEmpty()) {
            list.addView(TextView(this).apply {
                text = getString(R.string.zeitklar_calendar_no_imports)
                setTextAppearance(com.google.android.material.R.style.TextAppearance_Material3_BodyMedium)
                setTextColor(ContextCompat.getColor(this@CalendarAccountsActivity, R.color.zeitklar_muted))
            })
            return
        }
        sources.forEach { source ->
            list.addView(importedSourceCard(source), LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT,
            ).apply { bottomMargin = dp(10) })
        }
    }

    private fun renderDeviceCalendars() {
        calendarsJob?.cancel()
        val list = findViewById<LinearLayout>(R.id.zeitklar_calendar_device_accounts)
        list.removeAllViews()
        if (!DeviceCalendarStore.hasReadAccess(this)) {
            list.addView(infoText(getString(R.string.zeitklar_calendar_read_permission_required)))
            return
        }
        calendarsJob = lifecycleScope.launch {
            try {
                val calendars = withContext(Dispatchers.IO) { DeviceCalendarStore.calendars(applicationContext, includeHidden = true) }
                list.removeAllViews()
                findViewById<TextView>(R.id.tb_calendar_access_summary).text =
                    "${calendars.count { it.writable }} bearbeitbar · ${calendars.count { !it.writable }} nur lesen · ${sources.size} vom Desktop"
                if (calendars.isEmpty()) {
                    list.addView(infoText(getString(R.string.zeitklar_calendar_no_device_calendars)))
                    return@launch
                }
                calendars.forEach { calendar ->
                    list.addView(deviceCalendarCard(
                        calendar,
                        hasSameNameOnDesktop = boundDesktopId(calendar.id) != null,
                    ), LinearLayout.LayoutParams(
                        LinearLayout.LayoutParams.MATCH_PARENT,
                        LinearLayout.LayoutParams.WRAP_CONTENT,
                    ).apply { bottomMargin = dp(10) })
                }
            } catch (error: CancellationException) {
                throw error
            } catch (_: Exception) {
                list.removeAllViews()
                list.addView(infoText(getString(R.string.generic_loading_error)))
            }
        }
    }

    private fun infoText(text: String): TextView = TextView(this).apply {
        this.text = text
        setTextAppearance(com.google.android.material.R.style.TextAppearance_Material3_BodyMedium)
        setTextColor(ContextCompat.getColor(this@CalendarAccountsActivity, R.color.zeitklar_muted))
    }

    /** Explicit assignment uses stable IDs; identical names never imply identity. */
    private fun deviceCalendarCard(calendar: DeviceCalendar, hasSameNameOnDesktop: Boolean): MaterialCardView = MaterialCardView(this).apply {
        setCardBackgroundColor(ContextCompat.getColor(this@CalendarAccountsActivity, R.color.zeitklar_surface))
        strokeColor = ContextCompat.getColor(this@CalendarAccountsActivity, R.color.zeitklar_line)
        strokeWidth = dp(1)
        radius = dp(18).toFloat()
        cardElevation = 0f
        addView(LinearLayout(this@CalendarAccountsActivity).apply {
            gravity = android.view.Gravity.CENTER_VERTICAL
            orientation = LinearLayout.HORIZONTAL
            setPadding(dp(16), dp(14), dp(16), dp(14))
            addView(calendarSourceBadge(calendar.provider, calendar.color))
            addView(LinearLayout(this@CalendarAccountsActivity).apply {
                orientation = LinearLayout.VERTICAL
                addView(TextView(this@CalendarAccountsActivity).apply {
                    text = calendar.name
                    setTextAppearance(com.google.android.material.R.style.TextAppearance_Material3_TitleMedium)
                    setTextColor(ContextCompat.getColor(this@CalendarAccountsActivity, R.color.zeitklar_text))
                })
                addView(TextView(this@CalendarAccountsActivity).apply {
                    text = listOf(
                        calendar.provider,
                        getString(
                            if (hasSameNameOnDesktop) R.string.zeitklar_calendar_on_desktop
                            else R.string.zeitklar_calendar_phone_only,
                        ),
                        getString(if (calendar.writable) R.string.zeitklar_calendar_writable else R.string.zeitklar_calendar_read_only),
                    ).joinToString(" · ")
                    setTextAppearance(com.google.android.material.R.style.TextAppearance_Material3_BodySmall)
                    setTextColor(ContextCompat.getColor(this@CalendarAccountsActivity, R.color.zeitklar_muted))
                    setPadding(0, dp(4), 0, 0)
                })
                if (calendar.writable) addView(MaterialButton(this@CalendarAccountsActivity).apply {
                    text = getString(R.string.zeitklar_calendar_new_event_short)
                    setOnClickListener {
                        startActivity(CalendarEventEditorActivity.intent(this@CalendarAccountsActivity, LocalDate.now(), calendar.id))
                    }
                })
                addView(MaterialButton(this@CalendarAccountsActivity).apply {
                    text = "Desktop-Zuordnung ändern"
                    setOnClickListener { chooseDesktopCalendar(calendar) }
                })
            }, LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f).apply { marginStart = dp(12) })
        })
    }

    private fun importedSourceCard(source: MobileCalendarSource): MaterialCardView = MaterialCardView(this).apply {
        setCardBackgroundColor(ContextCompat.getColor(this@CalendarAccountsActivity, R.color.zeitklar_surface))
        strokeColor = ContextCompat.getColor(this@CalendarAccountsActivity, R.color.zeitklar_line)
        strokeWidth = dp(1)
        radius = dp(18).toFloat()
        cardElevation = 0f
        addView(LinearLayout(this@CalendarAccountsActivity).apply {
            gravity = android.view.Gravity.CENTER_VERTICAL
            orientation = LinearLayout.HORIZONTAL
            setPadding(dp(16), dp(14), dp(16), dp(14))
            addView(calendarSourceBadge(source.provider, sourceColor(source.id)))
            addView(LinearLayout(this@CalendarAccountsActivity).apply {
                orientation = LinearLayout.VERTICAL
                addView(TextView(this@CalendarAccountsActivity).apply {
                    text = source.name
                    setTextAppearance(com.google.android.material.R.style.TextAppearance_Material3_TitleMedium)
                    setTextColor(ContextCompat.getColor(this@CalendarAccountsActivity, R.color.zeitklar_text))
                })
                addView(TextView(this@CalendarAccountsActivity).apply {
                    text = if (source.endpointHint.isBlank()) {
                        getString(R.string.zeitklar_calendar_imported_provider_without_host, source.provider)
                    } else {
                        getString(R.string.zeitklar_calendar_imported_provider, source.provider, source.endpointHint)
                    }
                    setTextAppearance(com.google.android.material.R.style.TextAppearance_Material3_BodySmall)
                    setTextColor(ContextCompat.getColor(this@CalendarAccountsActivity, R.color.zeitklar_muted))
                    setPadding(0, dp(4), 0, 0)
                })
                addView(infoText(if (source.readOnly) "Desktop-Kalender · nur lesen" else
                    "Desktop-Kalender · für direkte Bearbeitung Konto verbinden und zuordnen"))
                addView(MaterialButton(this@CalendarAccountsActivity).apply {
                    text = if (source.provider == "Google Calendar") getString(R.string.tb_calendar_connect_google)
                        else getString(R.string.tb_calendar_other_providers)
                    setOnClickListener {
                        if (source.provider == "Google Calendar") openGoogleCalendar() else openAndroidAccountSetup(source)
                    }
                }, LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.WRAP_CONTENT,
                    LinearLayout.LayoutParams.WRAP_CONTENT,
                ).apply { topMargin = dp(8) })
            }, LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f).apply { marginStart = dp(12) })
        })
    }

    private fun boundDesktopId(id: Long): String? = getSharedPreferences("tb_connect_calendar_view", MODE_PRIVATE)
        .getString("desktop_binding_$id", null)
        ?.takeIf { bound -> sources.any { it.id == bound } }

    private fun chooseDesktopCalendar(calendar: DeviceCalendar) {
        val labels = arrayOf("Keine Zuordnung · getrennt anzeigen") + sources.map { "${it.name} · ${it.provider} · ${it.id.takeLast(8)}" }
        val chosen = sources.indexOfFirst { it.id == boundDesktopId(calendar.id) } + 1
        com.google.android.material.dialog.MaterialAlertDialogBuilder(this)
            .setTitle("${calendar.name} · Desktop-Kalender")
            .setSingleChoiceItems(labels, chosen) { dialog, which ->
                val editor = getSharedPreferences("tb_connect_calendar_view", MODE_PRIVATE).edit()
                if (which == 0) editor.remove("desktop_binding_${calendar.id}")
                else editor.putString("desktop_binding_${calendar.id}", sources[which - 1].id)
                editor.apply()
                dialog.dismiss()
                renderDeviceCalendars()
            }.setNegativeButton(android.R.string.cancel, null).show()
    }

    /** Generic provider initials plus the calendar colour, never copied service logos. */
    private fun calendarSourceBadge(label: String, color: String): TextView = TextView(this).apply {
        text = label.trim().split(Regex("\\s+")).filter { it.isNotBlank() }.take(2)
            .joinToString("") { it.first().uppercaseChar().toString() }.ifBlank { "K" }
        gravity = android.view.Gravity.CENTER
        setTypeface(typeface, Typeface.BOLD)
        textSize = 11f
        setTextColor(if (luminance(color) > 170) Color.rgb(20, 26, 45) else Color.WHITE)
        background = GradientDrawable().apply {
            shape = GradientDrawable.OVAL
            setColor(runCatching { Color.parseColor(color) }.getOrDefault(ContextCompat.getColor(this@CalendarAccountsActivity, R.color.zeitklar_accent)))
        }
        layoutParams = LinearLayout.LayoutParams(dp(42), dp(42))
        contentDescription = label
    }

    private fun sourceColor(value: String): String {
        val palette = listOf("#1967D2", "#00856A", "#8A4CC7", "#C45135", "#556987")
        return palette[Math.floorMod(value.hashCode(), palette.size)]
    }

    private fun luminance(value: String): Double {
        val color = runCatching { Color.parseColor(value) }.getOrDefault(Color.rgb(0, 111, 214))
        return (Color.red(color) * 0.299) + (Color.green(color) * 0.587) + (Color.blue(color) * 0.114)
    }

    private fun openGoogleCalendar() {
        lifecycleScope.launch {
            val accounts = withContext(Dispatchers.IO) { googleAccounts.choices() }
            startActivity(NativeCalendarSetup.intent(this@CalendarAccountsActivity, accounts.singleOrNull().orEmpty()))
        }
    }

    private fun openAndroidAccountSetup(source: MobileCalendarSource? = null) {
        if (source?.provider == "Google Calendar") {
            startActivity(GoogleCalendarSetupActivity.intent(this))
            return
        }
        val intent = Intent(Settings.ACTION_ADD_ACCOUNT).apply {
            putExtra(Settings.EXTRA_AUTHORITIES, arrayOf(CalendarContract.AUTHORITY))
            if (source?.provider == "Google Calendar") {
                putExtra(Settings.EXTRA_ACCOUNT_TYPES, arrayOf("com.google"))
            }
        }
        try {
            startActivity(intent)
            Toast.makeText(this, R.string.zeitklar_calendar_account_settings_opened, Toast.LENGTH_LONG).show()
        } catch (_: Exception) {
            Toast.makeText(this, R.string.zeitklar_calendar_account_settings_unavailable, Toast.LENGTH_LONG).show()
        }
    }

    private fun dp(value: Int): Int = (value * resources.displayMetrics.density).toInt()

    private fun normalizedCalendarName(value: String): String = value
        .trim()
        .lowercase()
        .replace(Regex("\\s+"), " ")

    companion object {
        fun intent(context: Context): Intent = Intent(context, CalendarAccountsActivity::class.java)
    }
}
