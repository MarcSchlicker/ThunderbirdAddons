package com.fsck.k9.ui.zeitklar

import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.os.Bundle
import android.view.View
import android.widget.LinearLayout
import android.widget.TextView
import android.widget.Toast
import androidx.lifecycle.lifecycleScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import androidx.core.graphics.ColorUtils
import com.fsck.k9.activity.MessageHomeActivity
import com.fsck.k9.ui.R
import com.fsck.k9.ui.base.BaseActivity
import com.google.android.material.bottomnavigation.BottomNavigationView
import com.google.android.material.button.MaterialButton
import com.google.android.material.card.MaterialCardView
import com.google.android.material.color.MaterialColors
import java.time.format.DateTimeFormatter

/** The TB Connect home screen for connections and mobile modules. */
class ZeitklarModuleCatalogActivity : BaseActivity() {
    private lateinit var store: PlannerMobileStore
    private var plannerState = PlannerMobileState.empty()
    private var connectionSyncRunning = false

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setLayout(R.layout.zeitklar_module_catalog)
        store = PlannerMobileStore(applicationContext)

        supportActionBar?.title = getString(R.string.zeitklar_modules_title)

        findViewById<View>(R.id.zeitklar_connections_add).setOnClickListener {
            startActivity(ModuleConnectionsActivity.intent(this, startAdd = true))
        }
        findViewById<View>(R.id.zeitklar_module_daily_planner).setOnClickListener {
            startActivity(DailyPlannerActivity.intent(this))
        }
        findViewById<View>(R.id.zeitklar_module_calendar).setOnClickListener {
            startActivity(CalendarModuleActivity.intent(this))
        }

        val previewListener = View.OnClickListener {
            Toast.makeText(this, R.string.zeitklar_module_preview_message, Toast.LENGTH_SHORT).show()
        }
        findViewById<View>(R.id.zeitklar_module_language).setOnClickListener(previewListener)
        findViewById<View>(R.id.zeitklar_module_todos).setOnClickListener(previewListener)
        findViewById<View>(R.id.zeitklar_module_mail_filer).setOnClickListener(previewListener)

        findViewById<BottomNavigationView>(R.id.zeitklar_module_navigation).apply {
            selectedItemId = R.id.zeitklar_navigation_modules
            setOnItemSelectedListener { item ->
                when (item.itemId) {
                    R.id.zeitklar_navigation_mail -> {
                        openMail()
                        false
                    }

                    R.id.zeitklar_navigation_modules -> true

                    R.id.zeitklar_navigation_daily_planner -> {
                        startActivity(DailyPlannerActivity.intent(this@ZeitklarModuleCatalogActivity))
                        false
                    }

                    R.id.zeitklar_navigation_calendar -> {
                        startActivity(CalendarModuleActivity.intent(this@ZeitklarModuleCatalogActivity))
                        false
                    }

                    else -> false
                }
            }
        }
    }

    override fun onResume() {
        super.onResume()
        ModuleBackgroundSync.schedule(applicationContext)
        lifecycleScope.launch {
            plannerState = withContext(Dispatchers.IO) { store.load() }
            renderAll()
            synchronizeConnections(showResult = false)
        }
    }

    private fun renderAll() {
        renderConnections()
        renderNativeModules()
        renderDownloadedModules()
    }

    private fun renderConnections() {
        val summary = findViewById<TextView>(R.id.zeitklar_connections_summary)
        findViewById<TextView>(R.id.zeitklar_connections_vpn_status).text = getString(
            if (PlannerMobileStore.isVpnActive(applicationContext)) {
                R.string.zeitklar_connections_vpn_active
            } else {
                R.string.zeitklar_connections_vpn_inactive
            },
        )
        val list = findViewById<LinearLayout>(R.id.zeitklar_connections_list)
        list.removeAllViews()
        if (plannerState.connections.isEmpty()) {
            summary.text = getString(R.string.zeitklar_connections_no_desktop)
            return
        }

        val reachable = plannerState.connections.count(::isReachable)
        summary.text = getString(R.string.zeitklar_desktop_reachability, reachable, plannerState.connections.size)
        plannerState.connections.forEach { connection -> list.addView(connectionCard(connection)) }
    }

    private fun connectionCard(connection: PlannerConnection): View {
        val reachable = isReachable(connection)
        val statusColor = if (reachable) Color.rgb(31, 122, 68) else Color.rgb(190, 49, 49)
        val surfaceColor = MaterialColors.getColor(this, com.google.android.material.R.attr.colorSurface, Color.WHITE)
        return MaterialCardView(this).apply {
            radius = dp(20).toFloat()
            cardElevation = 0f
            strokeWidth = dp(1)
            strokeColor = statusColor
            setCardBackgroundColor(ColorUtils.blendARGB(surfaceColor, statusColor, 0.11f))
            layoutParams = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT,
            ).apply { topMargin = dp(12) }
            addView(LinearLayout(this@ZeitklarModuleCatalogActivity).apply {
                orientation = LinearLayout.VERTICAL
                setPadding(dp(16), dp(14), dp(16), dp(14))

                addView(LinearLayout(this@ZeitklarModuleCatalogActivity).apply {
                    orientation = LinearLayout.HORIZONTAL
                    gravity = android.view.Gravity.CENTER_VERTICAL
                    addView(TextView(this@ZeitklarModuleCatalogActivity).apply {
                        text = connection.name
                        setTextAppearance(com.google.android.material.R.style.TextAppearance_Material3_TitleMedium)
                        layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
                    })
                    addView(TextView(this@ZeitklarModuleCatalogActivity).apply {
                        text = getString(
                            when {
                                reachable -> R.string.zeitklar_connection_connected
                                connection.lastAttemptAt == null -> R.string.zeitklar_connection_pending
                                else -> R.string.zeitklar_connection_disconnected
                            },
                        )
                        setTextAppearance(com.google.android.material.R.style.TextAppearance_Material3_LabelLarge)
                        setTextColor(statusColor)
                    })
                })

                addView(TextView(this@ZeitklarModuleCatalogActivity).apply {
                    text = connectionDetails(connection)
                    setTextAppearance(com.google.android.material.R.style.TextAppearance_Material3_BodyMedium)
                    setPadding(0, dp(5), 0, 0)
                })
                addView(TextView(this@ZeitklarModuleCatalogActivity).apply {
                    text = connection.endpoint
                    setTextAppearance(com.google.android.material.R.style.TextAppearance_Material3_BodySmall)
                    setPadding(0, dp(4), 0, 0)
                })

                addView(LinearLayout(this@ZeitklarModuleCatalogActivity).apply {
                    orientation = LinearLayout.HORIZONTAL
                    setPadding(0, dp(10), 0, 0)
                    addView(connectionActionButton(getString(R.string.zeitklar_connection_refresh)) {
                        synchronizeConnections(showResult = true, onlyConnectionId = connection.id)
                    })
                    addView(connectionActionButton(getString(R.string.zeitklar_connection_settings)) {
                        startActivity(ModuleConnectionsActivity.intent(this@ZeitklarModuleCatalogActivity, connection.id))
                    }.apply {
                        (layoutParams as LinearLayout.LayoutParams).marginStart = dp(8)
                    })
                })
            })
        }
    }

    private fun connectionActionButton(label: String, action: () -> Unit): MaterialButton = MaterialButton(this).apply {
        text = label
        minHeight = 0
        minimumHeight = 0
        layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
        setOnClickListener { action() }
    }

    private fun synchronizeConnections(showResult: Boolean, onlyConnectionId: String? = null) {
        if (connectionSyncRunning) return
        val targets = plannerState.connections.filter { onlyConnectionId == null || it.id == onlyConnectionId }
        if (targets.isEmpty()) return
        connectionSyncRunning = true
        findViewById<TextView>(R.id.zeitklar_connections_progress).apply {
            text = getString(R.string.zeitklar_connection_checking)
            visibility = View.VISIBLE
        }

        val initialState = plannerState
        Thread {
            var latest = initialState
            var failures = 0
            var recovered = false
            targets.forEach { original ->
                val connection = latest.connections.firstOrNull { it.id == original.id } ?: original
                val attemptedAt = now()
                try {
                    val result = PlannerSyncClient.sync(applicationContext, latest, connection)
                    recovered = recovered || (result.endpoint != null && result.endpoint != connection.endpoint)
                    latest = store.mergeModuleSync(
                        store.mergeRemotePayload(latest, result.remotePayload),
                        result,
                    ).withConnection(
                        connection.copy(
                            endpoint = result.endpoint ?: connection.endpoint,
                            token = result.pairedToken ?: connection.token,
                            workspaceId = result.workspaceId ?: connection.workspaceId,
                            lastMobileSyncAt = attemptedAt,
                            lastDesktopSyncAt = result.desktopSyncAt,
                            lastAttemptAt = attemptedAt,
                            lastError = null,
                        ),
                    )
                } catch (error: Exception) {
                    failures += 1
                    latest = latest.withConnection(
                        connection.copy(lastAttemptAt = attemptedAt, lastError = connectionErrorText(error)),
                    )
                }
            }
            plannerState = latest
            store.save(latest)
            runOnUiThread {
                connectionSyncRunning = false
                findViewById<TextView>(R.id.zeitklar_connections_progress).visibility = View.GONE
                renderAll()
                if (showResult) {
                    Toast.makeText(
                        this,
                        if (failures == 0) getString(R.string.zeitklar_sync_success)
                        else getString(R.string.zeitklar_sync_partial, failures),
                        Toast.LENGTH_LONG,
                    ).show()
                }
                if (recovered) Toast.makeText(this, R.string.zeitklar_connection_recovered, Toast.LENGTH_LONG).show()
            }
        }.start()
    }

    private fun renderNativeModules() {
        val calendar = store.moduleByEntry(plannerState, "calendar")
        findViewById<TextView>(R.id.zeitklar_module_calendar_status).text = when {
            calendar == null -> getString(R.string.zeitklar_module_built_in)
            calendar.packageStatus == "Installiert" && calendar.installedAt != null ->
                getString(R.string.zeitklar_module_installed_at, calendar.installedAt.replace("T", " ").take(16))
            else -> calendar.packageStatus
        }
    }

    private fun openOrInstallNativeModule(entry: String, open: () -> Unit) {
        val state = store.load()
        val module = store.moduleByEntry(state, entry)
        when {
            module == null -> Toast.makeText(this, R.string.zeitklar_module_not_provided, Toast.LENGTH_LONG).show()
            module.packageStatus == "Installiert" -> open()
            else -> installNativeModule(entry, open)
        }
    }

    private fun installNativeModule(entry: String, open: () -> Unit) {
        Toast.makeText(this, R.string.zeitklar_module_installing, Toast.LENGTH_SHORT).show()
        Thread {
            try {
                plannerState = store.installModule(store.load(), entry)
                store.save(plannerState)
                runOnUiThread {
                    renderAll()
                    Toast.makeText(this, R.string.zeitklar_module_ready, Toast.LENGTH_SHORT).show()
                    open()
                }
            } catch (error: Exception) {
                plannerState = store.markModuleInstallFailed(store.load(), entry, error.message ?: "Unbekannter Fehler")
                store.save(plannerState)
                runOnUiThread {
                    renderAll()
                    Toast.makeText(
                        this,
                        getString(R.string.zeitklar_module_install_failed, error.message ?: "Unbekannter Fehler"),
                        Toast.LENGTH_LONG,
                    ).show()
                }
            }
        }.start()
    }

    private fun renderDownloadedModules() {
        val modules = plannerState.mobileModules.filter {
            it.entry !in setOf("daily-planner", "calendar", "daily-planner-copy")
        }
        val heading = findViewById<TextView>(R.id.zeitklar_downloaded_modules_heading)
        val container = findViewById<LinearLayout>(R.id.zeitklar_downloaded_modules)
        heading.visibility = if (modules.isEmpty()) View.GONE else View.VISIBLE
        container.removeAllViews()
        modules.forEach { module ->
            container.addView(TextView(this).apply {
                text = "${module.name}\n${module.description}\n${module.packageStatus}"
                setTextAppearance(com.google.android.material.R.style.TextAppearance_Material3_BodyMedium)
                setPadding(dp(18), dp(18), dp(18), dp(18))
                setOnClickListener {
                    Toast.makeText(
                        this@ZeitklarModuleCatalogActivity,
                        R.string.zeitklar_module_native_view_required,
                        Toast.LENGTH_LONG,
                    ).show()
                }
            })
        }
    }

    private fun isReachable(connection: PlannerConnection): Boolean =
        connection.lastAttemptAt != null && connection.lastMobileSyncAt != null && connection.lastError.isNullOrBlank()

    private fun connectionDetails(connection: PlannerConnection): String = when {
        !connection.lastError.isNullOrBlank() -> connection.lastError
        isReachable(connection) -> getString(
            R.string.zeitklar_desktop_sync_stamp,
            connection.name,
            formatTimestamp(connection.lastMobileSyncAt),
            formatTimestamp(connection.lastDesktopSyncAt),
        )
        else -> getString(R.string.zeitklar_desktop_sync_pending, connection.name)
    }

    private fun connectionErrorText(error: Exception): String {
        val detail = (error.message ?: "").replace(Regex("\\s+"), " ").trim()
        return when {
            detail.contains("unexpected", ignoreCase = true) -> getString(R.string.zeitklar_connection_error_unexpected)
            detail.contains("ungültiger kopplungscode", ignoreCase = true) ->
                getString(R.string.zeitklar_connection_error_expired_code)
            detail.contains("timed out", ignoreCase = true) || detail.contains("refused", ignoreCase = true) ->
                getString(R.string.zeitklar_connection_error_unreachable)
            detail.isEmpty() -> getString(R.string.zeitklar_connection_error_unreachable)
            else -> detail.take(160)
        }
    }

    private fun formatTimestamp(value: String?): String {
        val instant = PlannerMobileStore.parseTimestamp(value) ?: return getString(R.string.zeitklar_never)
        return DateTimeFormatter.ofPattern("dd.MM. HH:mm")
            .withZone(java.time.ZoneId.systemDefault())
            .format(instant)
    }

    private fun openMail() {
        startActivity(
            Intent(this, MessageHomeActivity::class.java).apply {
                addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP)
            },
        )
        finish()
    }

    private fun dp(value: Int): Int = (value * resources.displayMetrics.density).toInt()

    private fun now(): String = java.time.Instant.now().toString()

    companion object {
        fun intent(context: Context): Intent = Intent(context, ZeitklarModuleCatalogActivity::class.java)
    }
}
