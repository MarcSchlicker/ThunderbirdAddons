package com.fsck.k9.ui.zeitklar

import android.Manifest
import android.content.ContentUris
import android.content.ContentValues
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Bundle
import android.provider.CalendarContract
import android.view.MenuItem
import android.view.View
import android.widget.Toast
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.content.ContextCompat
import androidx.lifecycle.lifecycleScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.json.JSONObject
import org.koin.android.ext.android.inject
import net.thunderbird.feature.calendar.NativeGoogleCalendar
import com.fsck.k9.ui.R
import com.fsck.k9.ui.base.BaseActivity
import com.google.android.material.button.MaterialButton
import com.google.android.material.dialog.MaterialAlertDialogBuilder
import com.google.android.material.switchmaterial.SwitchMaterial
import com.google.android.material.textfield.TextInputEditText
import java.time.LocalDate
import java.time.LocalTime
import java.time.ZoneId
import java.time.ZoneOffset
import java.time.format.DateTimeFormatter
import java.util.Locale

/**
 * Creates events and edits existing single events on Android or through the
 * Desktop Hub. Series and invitation management stay with the calendar provider.
 */
class CalendarEventEditorActivity : BaseActivity() {
    private val nativeCalendar: NativeGoogleCalendar by inject()
    private var selectedDate = LocalDate.now()
    private var selectedEndDate = LocalDate.now()
    private var startTime = LocalTime.of(9, 0)
    private var endTime = LocalTime.of(10, 0)
    private var writableCalendars: List<DeviceCalendar> = emptyList()
    private var selectedCalendar: DeviceCalendar? = null
    private var recurrenceRule: String? = null
    private var reminderMinutes: Int? = DEFAULT_REMINDER_MINUTES
    private var editInvitationsAfterSave = false
    private var desktopEvent: MobileCalendarEvent? = null
    private var desktopConnection: PlannerConnection? = null
    private var deviceSnapshot: DeviceCalendarStore.EditSnapshot? = null
    private val providerEditor = registerForActivityResult(ActivityResultContracts.StartActivityForResult()) {
        if (selectedCalendar?.nativeGoogle == true) nativeCalendar.scheduleSync(force = true)
        setResult(RESULT_OK)
        finish()
    }

    private val calendarPermissions = registerForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions(),
    ) { permissions ->
        if (permissions[Manifest.permission.READ_CALENDAR] == true &&
            permissions[Manifest.permission.WRITE_CALENDAR] == true
        ) {
            loadCalendars()
        } else {
            Toast.makeText(this, R.string.zeitklar_calendar_create_permission_required, Toast.LENGTH_LONG).show()
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setLayout(R.layout.zeitklar_calendar_event_editor)
        selectedDate = intent.getStringExtra(EXTRA_DATE)
            ?.let { runCatching { LocalDate.parse(it) }.getOrNull() }
            ?: LocalDate.now()
        selectedEndDate = selectedDate
        desktopEvent = intent.getStringExtra(EXTRA_DESKTOP_EVENT)?.let { MobileCalendarEvent.fromJson(JSONObject(it)) }
        desktopEvent?.let { event ->
            desktopConnection = PlannerMobileStore(this).load().connections.firstOrNull {
                it.id == intent.getStringExtra(EXTRA_CONNECTION_ID)
            }
            val localStart = CalendarEventTiming.displayTime(event.startEpochMillis,
                LocalDate.of(event.year, event.month, event.day).atTime(event.hour, event.minute),
                event.allDay, ZoneId.systemDefault())
            val localEnd = CalendarEventTiming.displayTime(event.endEpochMillis,
                LocalDate.of(event.endYear, event.endMonth, event.endDay).atTime(event.endHour, event.endMinute),
                event.allDay, ZoneId.systemDefault())
            selectedDate = localStart.toLocalDate()
            selectedEndDate = localEnd.toLocalDate().let { if (event.allDay) it.minusDays(1) else it }
            startTime = localStart.toLocalTime()
            endTime = localEnd.toLocalTime()
            findViewById<TextInputEditText>(R.id.zeitklar_calendar_event_title).setText(event.title)
            findViewById<TextInputEditText>(R.id.zeitklar_calendar_event_location).setText(event.location)
            findViewById<SwitchMaterial>(R.id.zeitklar_calendar_event_all_day).apply {
                isChecked = event.allDay
                isEnabled = false
            }
            findViewById<View>(R.id.zeitklar_calendar_event_calendar).isEnabled = false
            listOf(
                R.id.zeitklar_calendar_event_repeat, R.id.zeitklar_calendar_event_reminder,
                R.id.tb_connect_calendar_event_invitations,
            )
                .forEach { findViewById<View>(it).visibility = View.GONE }
        }

        supportActionBar?.apply {
            title = getString(if (desktopEvent != null || intent.hasExtra(EXTRA_DEVICE_EVENT_ID))
                R.string.tb_connect_event_edit_title else R.string.zeitklar_calendar_create_title)
            setDisplayHomeAsUpEnabled(true)
        }
        findViewById<MaterialButton>(R.id.zeitklar_calendar_event_date).setOnClickListener {
            pickDate(isEnd = false)
        }
        findViewById<MaterialButton>(R.id.zeitklar_calendar_event_end_date).setOnClickListener {
            pickDate(isEnd = true)
        }
        findViewById<MaterialButton>(R.id.zeitklar_calendar_event_start).setOnClickListener {
            pickTime(isStart = true)
        }
        findViewById<MaterialButton>(R.id.zeitklar_calendar_event_end).setOnClickListener {
            pickTime(isStart = false)
        }
        findViewById<MaterialButton>(R.id.zeitklar_calendar_event_calendar).setOnClickListener {
            showCalendarPicker()
        }
        findViewById<MaterialButton>(R.id.zeitklar_calendar_event_repeat).setOnClickListener {
            showRepeatPicker()
        }
        findViewById<MaterialButton>(R.id.zeitklar_calendar_event_reminder).setOnClickListener {
            showReminderPicker()
        }
        findViewById<MaterialButton>(R.id.tb_connect_calendar_event_invitations).setOnClickListener {
            editInvitationsAfterSave = !editInvitationsAfterSave
            updateForm()
        }
        findViewById<SwitchMaterial>(R.id.zeitklar_calendar_event_all_day).setOnCheckedChangeListener { _, _ ->
            updateForm()
        }
        findViewById<MaterialButton>(R.id.zeitklar_calendar_event_save).setOnClickListener {
            saveEvent()
        }
        updateForm()
        if (desktopEvent == null) ensureCalendarAccess()
    }

    override fun onOptionsItemSelected(item: MenuItem): Boolean = when (item.itemId) {
        android.R.id.home -> {
            finish()
            true
        }

        else -> super.onOptionsItemSelected(item)
    }

    private fun ensureCalendarAccess() {
        if (hasCalendarAccess()) {
            loadCalendars()
        } else {
            calendarPermissions.launch(
                arrayOf(Manifest.permission.READ_CALENDAR, Manifest.permission.WRITE_CALENDAR),
            )
        }
    }

    private fun hasCalendarAccess(): Boolean = listOf(
        Manifest.permission.READ_CALENDAR, Manifest.permission.WRITE_CALENDAR,
    ).all { ContextCompat.checkSelfPermission(this, it) == PackageManager.PERMISSION_GRANTED }

    private fun loadCalendars() {
        Thread {
            val calendars = DeviceCalendarStore.calendars(applicationContext, includeHidden = true).filter { it.writable }
            val eventId = intent.getLongExtra(EXTRA_DEVICE_EVENT_ID, -1)
            val snapshot = if (eventId >= 0) runCatching {
                DeviceCalendarStore.editSnapshot(applicationContext, eventId)
            }.getOrNull() else null
            runOnUiThread {
                if (eventId >= 0) {
                    if (snapshot == null) {
                        Toast.makeText(this, R.string.tb_connect_device_edit_unavailable, Toast.LENGTH_LONG).show()
                        finish()
                        return@runOnUiThread
                    }
                    if (!snapshot.values["rrule"].isNullOrBlank() || !snapshot.values["rdate"].isNullOrBlank() ||
                        snapshot.values["dtend"]?.toLongOrNull() == null || snapshot.values["dtstart"]?.toLongOrNull() == null) {
                        openProviderEditor(eventId)
                        return@runOnUiThread
                    }
                    applyDeviceSnapshot(snapshot)
                }
                val priorId = selectedCalendar?.id ?: intent.getLongExtra(EXTRA_CALENDAR_ID, -1L)
                writableCalendars = calendars
                selectedCalendar = calendars.firstOrNull { it.id == priorId } ?: calendars.firstOrNull()
                updateForm()
                if (calendars.isEmpty()) {
                    Toast.makeText(this, R.string.zeitklar_calendar_create_unavailable, Toast.LENGTH_LONG).show()
                }
            }
        }.start()
    }

    private fun applyDeviceSnapshot(snapshot: DeviceCalendarStore.EditSnapshot) {
        deviceSnapshot = snapshot
        selectedCalendar = snapshot.calendar
        val allDay = snapshot.values["allDay"] == "1"
        val zone = if (allDay) ZoneOffset.UTC else ZoneId.systemDefault()
        fun dateTime(column: String) = java.time.Instant.ofEpochMilli(requireNotNull(snapshot.values[column]).toLong())
            .atZone(zone).toLocalDateTime()
        val start = dateTime("dtstart")
        val end = dateTime("dtend")
        selectedDate = start.toLocalDate()
        selectedEndDate = end.toLocalDate().let { if (allDay) it.minusDays(1) else it }
        startTime = start.toLocalTime()
        endTime = end.toLocalTime()
        findViewById<TextInputEditText>(R.id.zeitklar_calendar_event_title).setText(snapshot.values["title"].orEmpty())
        findViewById<TextInputEditText>(R.id.zeitklar_calendar_event_location).setText(snapshot.values["eventLocation"].orEmpty())
        findViewById<SwitchMaterial>(R.id.zeitklar_calendar_event_all_day).isChecked = allDay
        findViewById<View>(R.id.zeitklar_calendar_event_calendar).isEnabled = false
        listOf(R.id.zeitklar_calendar_event_repeat, R.id.zeitklar_calendar_event_reminder)
            .forEach { findViewById<View>(it).visibility = View.GONE }
        supportActionBar?.setTitle(R.string.tb_connect_event_edit_title)
    }

    private fun openProviderEditor(eventId: Long) {
        runCatching {
            providerEditor.launch(Intent(Intent.ACTION_EDIT).setDataAndType(
                ContentUris.withAppendedId(CalendarContract.Events.CONTENT_URI, eventId), "vnd.android.cursor.item/event",
            ))
        }.onFailure {
            Toast.makeText(this, R.string.tb_connect_invitations_unavailable, Toast.LENGTH_LONG).show()
            finish()
        }
    }

    private fun updateForm() {
        val dateFormat = DateTimeFormatter.ofPattern("EEE, dd. MMMM yyyy", Locale.getDefault())
        val timeFormat = DateTimeFormatter.ofPattern("HH:mm", Locale.getDefault())
        findViewById<MaterialButton>(R.id.zeitklar_calendar_event_date).text =
            getString(R.string.zeitklar_calendar_create_date_value, selectedDate.format(dateFormat))
        findViewById<MaterialButton>(R.id.zeitklar_calendar_event_end_date).text =
            getString(R.string.tb_connect_calendar_end_date, selectedEndDate.format(dateFormat))
        findViewById<MaterialButton>(R.id.zeitklar_calendar_event_start).text =
            getString(R.string.zeitklar_calendar_create_start_value, startTime.format(timeFormat))
        findViewById<MaterialButton>(R.id.zeitklar_calendar_event_end).text =
            getString(R.string.zeitklar_calendar_create_end_value, endTime.format(timeFormat))
        findViewById<MaterialButton>(R.id.zeitklar_calendar_event_calendar).text = desktopEvent?.calendarName
            ?: selectedCalendar?.let { "${it.name}\n${it.provider}" }
            ?: getString(R.string.zeitklar_calendar_create_pick_calendar)
        findViewById<MaterialButton>(R.id.zeitklar_calendar_event_repeat).text = getString(
            R.string.zeitklar_calendar_create_repeat_value,
            getString(recurrenceLabelRes(recurrenceRule)),
        )
        findViewById<MaterialButton>(R.id.zeitklar_calendar_event_reminder).text = getString(
            R.string.zeitklar_calendar_create_reminder_value,
            reminderMinutes?.let { reminderLabel(it) } ?: getString(R.string.zeitklar_calendar_create_reminder_none),
        )
        findViewById<MaterialButton>(R.id.tb_connect_calendar_event_invitations).apply {
            text = getString(
                if (editInvitationsAfterSave) R.string.tb_connect_invitations_enabled else R.string.tb_connect_invitations,
            )
            isSelected = editInvitationsAfterSave
        }
        val allDay = findViewById<SwitchMaterial>(R.id.zeitklar_calendar_event_all_day).isChecked
        findViewById<View>(R.id.zeitklar_calendar_event_time_row).visibility = if (allDay) View.GONE else View.VISIBLE
    }

    private fun pickDate(isEnd: Boolean) {
        val current = if (isEnd) selectedEndDate else selectedDate
        android.app.DatePickerDialog(
            this,
            { _, year, month, day ->
                val chosen = LocalDate.of(year, month + 1, day)
                if (isEnd) {
                    selectedEndDate = chosen.coerceAtLeast(selectedDate)
                } else {
                    val duration = java.time.temporal.ChronoUnit.DAYS.between(selectedDate, selectedEndDate)
                    selectedDate = chosen
                    selectedEndDate = chosen.plusDays(duration.coerceAtLeast(0))
                }
                updateForm()
            },
            current.year,
            current.monthValue - 1,
            current.dayOfMonth,
        ).show()
    }

    private fun pickTime(isStart: Boolean) {
        val current = if (isStart) startTime else endTime
        android.app.TimePickerDialog(
            this,
            { _, hour, minute ->
                if (isStart) {
                    startTime = LocalTime.of(hour, minute)
                    if (selectedEndDate == selectedDate && endTime <= startTime) {
                        val end = selectedDate.atTime(startTime).plusHours(1)
                        selectedEndDate = end.toLocalDate()
                        endTime = end.toLocalTime()
                    }
                } else {
                    endTime = LocalTime.of(hour, minute)
                    if (selectedEndDate == selectedDate && endTime <= startTime) {
                        selectedEndDate = selectedDate.plusDays(1)
                    }
                }
                updateForm()
            },
            current.hour,
            current.minute,
            true,
        ).show()
    }

    private fun showCalendarPicker() {
        if (writableCalendars.isEmpty()) {
            Toast.makeText(this, R.string.zeitklar_calendar_create_unavailable, Toast.LENGTH_LONG).show()
            return
        }
        val choices = writableCalendars.map { "${it.name}\n${it.provider}" }.toTypedArray()
        val selectedIndex = writableCalendars.indexOfFirst { it.id == selectedCalendar?.id }.coerceAtLeast(0)
        MaterialAlertDialogBuilder(this)
            .setTitle(R.string.zeitklar_calendar_create_pick_calendar)
            .setSingleChoiceItems(choices, selectedIndex) { dialog, which ->
                selectedCalendar = writableCalendars[which]
                updateForm()
                dialog.dismiss()
            }
            .show()
    }

    private fun showRepeatPicker() {
        val rules = listOf<String?>(null, "FREQ=DAILY", "FREQ=WEEKLY", "FREQ=MONTHLY", "FREQ=YEARLY")
        val labels = rules.map { getString(recurrenceLabelRes(it)) }.toTypedArray()
        val selectedIndex = rules.indexOf(recurrenceRule).coerceAtLeast(0)
        MaterialAlertDialogBuilder(this)
            .setTitle(R.string.zeitklar_calendar_create_repeat)
            .setSingleChoiceItems(labels, selectedIndex) { dialog, which ->
                recurrenceRule = rules[which]
                updateForm()
                dialog.dismiss()
            }
            .show()
    }

    private fun showReminderPicker() {
        val values = listOf<Int?>(null, 0, 5, 15, 30, 60, 24 * 60)
        val labels = values.map { minutes ->
            minutes?.let(::reminderLabel) ?: getString(R.string.zeitklar_calendar_create_reminder_none)
        }.toTypedArray()
        val selectedIndex = values.indexOf(reminderMinutes).coerceAtLeast(0)
        MaterialAlertDialogBuilder(this)
            .setTitle(R.string.zeitklar_calendar_create_reminder)
            .setSingleChoiceItems(labels, selectedIndex) { dialog, which ->
                reminderMinutes = values[which]
                updateForm()
                dialog.dismiss()
            }
            .show()
    }

    private fun saveEvent() {
        val titleInput = findViewById<TextInputEditText>(R.id.zeitklar_calendar_event_title)
        val title = titleInput.text?.toString()?.trim().orEmpty()
        if (title.isEmpty()) {
            titleInput.error = getString(R.string.zeitklar_calendar_create_title_required)
            return
        }
        if (desktopEvent != null) {
            saveDesktopEvent(title)
            return
        }
        val calendar = selectedCalendar
        if (calendar == null) {
            Toast.makeText(this, R.string.zeitklar_calendar_create_calendar_required, Toast.LENGTH_LONG).show()
            return
        }
        if (!hasCalendarAccess()) {
            ensureCalendarAccess()
            return
        }
        val allDay = findViewById<SwitchMaterial>(R.id.zeitklar_calendar_event_all_day).isChecked
        val location = findViewById<TextInputEditText>(R.id.zeitklar_calendar_event_location)
            .text?.toString()?.trim().orEmpty()
        val zone = if (allDay) ZoneOffset.UTC else ZoneId.systemDefault()
        val start = (if (allDay) selectedDate.atStartOfDay() else selectedDate.atTime(startTime)).atZone(zone)
        val end = (if (allDay) selectedEndDate.plusDays(1).atStartOfDay() else selectedEndDate.atTime(endTime))
            .atZone(zone)
        if (end <= start) {
            Toast.makeText(this, R.string.tb_connect_calendar_invalid_end, Toast.LENGTH_LONG).show()
            return
        }
        val values = ContentValues().apply {
            put(CalendarContract.Events.CALENDAR_ID, calendar.id)
            put(CalendarContract.Events.TITLE, title)
            put(CalendarContract.Events.EVENT_LOCATION, location)
            put(CalendarContract.Events.ALL_DAY, if (allDay) 1 else 0)
            recurrenceRule?.let { put(CalendarContract.Events.RRULE, it) }
            put(CalendarContract.Events.DTSTART, start.toInstant().toEpochMilli())
            put(CalendarContract.Events.EVENT_TIMEZONE, if (allDay) "UTC" else zone.id)
            if (recurrenceRule != null) {
                // CalendarProvider requires DURATION instead of DTEND for a series.
                put(CalendarContract.Events.DURATION, CalendarEventTiming.duration(
                    start.toInstant().toEpochMilli(), end.toInstant().toEpochMilli(), allDay,
                ))
            } else {
                put(CalendarContract.Events.DTEND, end.toInstant().toEpochMilli())
            }
        }
        deviceSnapshot?.let { snapshot ->
            findViewById<View>(R.id.zeitklar_calendar_event_save).isEnabled = false
            lifecycleScope.launch {
                val result = withContext(Dispatchers.IO) { runCatching { DeviceCalendarStore.updateEvent(applicationContext, snapshot, values) } }
                findViewById<View>(R.id.zeitklar_calendar_event_save).isEnabled = true
                result.onSuccess {
                    if (calendar.nativeGoogle) nativeCalendar.scheduleSync(force = true)
                    if (editInvitationsAfterSave) openProviderEditor(snapshot.id) else {
                        setResult(RESULT_OK)
                        finish()
                    }
                }.onFailure {
                    MaterialAlertDialogBuilder(this@CalendarEventEditorActivity)
                        .setMessage(R.string.tb_connect_device_edit_conflict)
                        .setPositiveButton(android.R.string.ok, null).show()
                }
            }
            return
        }
        runCatching { contentResolver.insert(CalendarContract.Events.CONTENT_URI, values) }
            .onSuccess { uri ->
                if (uri == null) {
                    Toast.makeText(this, R.string.zeitklar_calendar_create_failed, Toast.LENGTH_LONG).show()
                } else {
                    reminderMinutes?.let { minutes ->
                        saveReminder(ContentUris.parseId(uri), minutes)
                    }
                    if (calendar.nativeGoogle) nativeCalendar.scheduleSync(force = true)
                    setResult(RESULT_OK)
                    Toast.makeText(this, R.string.zeitklar_calendar_create_saved, Toast.LENGTH_SHORT).show()
                    if (editInvitationsAfterSave) {
                        // Provider UI owns participant permissions, invitation sending and RSVP.
                        // This visible action never sends invitations on TB-Connect's own behalf.
                        runCatching {
                            startActivity(
                                Intent(Intent.ACTION_EDIT).setDataAndType(uri, "vnd.android.cursor.item/event"),
                            )
                        }.onFailure {
                            Toast.makeText(this, R.string.tb_connect_invitations_unavailable, Toast.LENGTH_LONG).show()
                        }
                    }
                    finish()
                }
            }
            .onFailure {
                Toast.makeText(this, R.string.zeitklar_calendar_create_failed, Toast.LENGTH_LONG).show()
            }
    }

    private fun saveDesktopEvent(title: String) {
        val event = desktopEvent ?: return
        val connection = desktopConnection
        if (connection == null) {
            Toast.makeText(this, R.string.tb_connect_desktop_edit_local_required, Toast.LENGTH_LONG).show()
            return
        }
        val zone = if (event.allDay) ZoneOffset.UTC else ZoneId.systemDefault()
        val start = (if (event.allDay) selectedDate.atStartOfDay() else selectedDate.atTime(startTime)).atZone(zone)
        val end = (if (event.allDay) selectedEndDate.plusDays(1).atStartOfDay() else selectedEndDate.atTime(endTime))
            .atZone(zone)
        if (end <= start) {
            Toast.makeText(this, R.string.tb_connect_calendar_invalid_end, Toast.LENGTH_LONG).show()
            return
        }
        val location = findViewById<TextInputEditText>(R.id.zeitklar_calendar_event_location).text?.toString().orEmpty()
        val button = findViewById<View>(R.id.zeitklar_calendar_event_save)
        button.isEnabled = false
        lifecycleScope.launch {
            val result = withContext(Dispatchers.IO) {
                runCatching {
                    PlannerSyncClient.editDesktopCalendar(applicationContext, connection, JSONObject()
                        .put("action", "update").put("calendarId", event.calendarId).put("itemId", event.itemId)
                        .put("expectedVersion", intent.getStringExtra(EXTRA_EDIT_VERSION))
                        .put("title", title).put("location", location)
                        .put("startMillis", start.toInstant().toEpochMilli())
                        .put("endMillis", end.toInstant().toEpochMilli()))
                }
            }
            button.isEnabled = true
            result.onSuccess {
                setResult(RESULT_OK)
                Toast.makeText(
                    this@CalendarEventEditorActivity, R.string.zeitklar_calendar_create_saved, Toast.LENGTH_LONG,
                ).show()
                finish()
            }.onFailure {
                MaterialAlertDialogBuilder(this@CalendarEventEditorActivity)
                    .setTitle(R.string.tb_connect_desktop_event_edit)
                    .setMessage(it.message ?: getString(R.string.zeitklar_calendar_create_failed))
                    .setPositiveButton(android.R.string.ok, null).show()
            }
        }
    }

    /** A failed reminder must not discard an event successfully stored by its provider. */
    private fun saveReminder(eventId: Long, minutes: Int) {
        runCatching {
            contentResolver.insert(
                CalendarContract.Reminders.CONTENT_URI,
                ContentValues().apply {
                    put(CalendarContract.Reminders.EVENT_ID, eventId)
                    put(CalendarContract.Reminders.MINUTES, minutes)
                    put(CalendarContract.Reminders.METHOD, CalendarContract.Reminders.METHOD_ALERT)
                },
            )
        }
    }

    private fun recurrenceLabelRes(rule: String?): Int = when (rule) {
        "FREQ=DAILY" -> R.string.zeitklar_calendar_create_repeat_daily
        "FREQ=WEEKLY" -> R.string.zeitklar_calendar_create_repeat_weekly
        "FREQ=MONTHLY" -> R.string.zeitklar_calendar_create_repeat_monthly
        "FREQ=YEARLY" -> R.string.zeitklar_calendar_create_repeat_yearly
        else -> R.string.zeitklar_calendar_create_repeat_none
    }

    private fun reminderLabel(minutes: Int): String = when (minutes) {
        0 -> getString(R.string.zeitklar_calendar_create_reminder_at_time)
        5 -> getString(R.string.zeitklar_calendar_create_reminder_minutes, 5)
        15 -> getString(R.string.zeitklar_calendar_create_reminder_minutes, 15)
        30 -> getString(R.string.zeitklar_calendar_create_reminder_minutes, 30)
        60 -> getString(R.string.zeitklar_calendar_create_reminder_hour)
        24 * 60 -> getString(R.string.zeitklar_calendar_create_reminder_day)
        else -> getString(R.string.zeitklar_calendar_create_reminder_minutes, minutes)
    }

    companion object {
        private const val EXTRA_DATE = "date"
        private const val EXTRA_CALENDAR_ID = "preferredCalendarId"
        private const val EXTRA_DESKTOP_EVENT = "desktopEvent"
        private const val EXTRA_CONNECTION_ID = "desktopConnectionId"
        private const val EXTRA_EDIT_VERSION = "editVersion"
        private const val EXTRA_DEVICE_EVENT_ID = "deviceEventId"
        private const val DEFAULT_REMINDER_MINUTES = 15

        fun intent(context: Context, date: LocalDate, calendarId: Long = -1L): Intent = Intent(context, CalendarEventEditorActivity::class.java)
            .putExtra(EXTRA_DATE, date.toString()).putExtra(EXTRA_CALENDAR_ID, calendarId)

        fun desktopIntent(context: Context, connectionId: String, event: JSONObject, version: String): Intent =
            Intent(context, CalendarEventEditorActivity::class.java)
                .putExtra(EXTRA_DESKTOP_EVENT, event.toString())
                .putExtra(EXTRA_CONNECTION_ID, connectionId)
                .putExtra(EXTRA_EDIT_VERSION, version)

        fun deviceIntent(context: Context, eventId: Long): Intent = Intent(context, CalendarEventEditorActivity::class.java)
            .putExtra(EXTRA_DEVICE_EVENT_ID, eventId)
    }
}
