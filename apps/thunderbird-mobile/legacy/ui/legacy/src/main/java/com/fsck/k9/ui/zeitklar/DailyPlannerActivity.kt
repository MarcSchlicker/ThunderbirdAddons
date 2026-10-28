package com.fsck.k9.ui.zeitklar

import android.content.Context
import android.content.Intent
import android.app.DatePickerDialog
import android.app.TimePickerDialog
import android.content.res.ColorStateList
import android.graphics.Color
import android.graphics.Paint
import android.os.Bundle
import android.view.Menu
import android.view.MenuItem
import android.view.View
import android.widget.Button
import android.widget.CheckBox
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AlertDialog
import androidx.lifecycle.lifecycleScope
import kotlinx.coroutines.CancellationException
import org.koin.android.ext.android.inject
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import androidx.core.content.ContextCompat
import com.fsck.k9.activity.MessageHomeActivity
import com.fsck.k9.ui.R
import com.fsck.k9.ui.base.BaseActivity
import com.google.android.material.bottomnavigation.BottomNavigationView
import com.google.android.material.button.MaterialButton
import com.google.android.material.card.MaterialCardView
import com.google.android.material.checkbox.MaterialCheckBox
import java.time.LocalDate
import java.time.LocalTime
import java.time.format.DateTimeFormatter
import java.util.Locale

/**
 * The first mobile module backed by the Module Bridge protocol. Tasks remain usable
 * offline and are merged per task when one or more paired Thunderbird desktops are
 * reachable again.
 */
class DailyPlannerActivity : BaseActivity() {
    private val nativeCalendar: net.thunderbird.feature.calendar.NativeGoogleCalendar by inject()
    private val manualSyncFeedback by lazy { ManualSyncFeedback(this) {
        showCalendarSyncProblems(this, nativeCalendar, plannerState.connections,
            unknownFailure = nativeSyncFailed, onSettings = {
                startActivity(net.thunderbird.feature.calendar.NativeCalendarSetup.intent(this,
                    settingsIntent = CalendarAccountsActivity.intent(this)))
            })
    } }
    private var nativeSyncFailed = false
    private var manualDesktopRequested = false
    private val plannerDesktopLoop by lazy { CalendarSyncLoop(lifecycleScope) { performPlannerDesktopSync() } }
    private val plannerGoogleLoop by lazy { CalendarSyncLoop(lifecycleScope) { performPlannerGoogleSync() } }
    private lateinit var store: PlannerMobileStore
    private var plannerState = PlannerMobileState.empty()
    private var selectedPlannerDate = LocalDate.now()
    private var newAppointmentDate = LocalDate.now()
    private var newAppointmentTime = LocalTime.of(9, 0)
    private var phoneCalendarReferences: List<PlannerDesktopReference> = emptyList()
    private var phoneCalendarTomorrowCount = 0
    private var phoneCalendarTomorrowReferences: List<PlannerDesktopReference> = emptyList()
    private var lastAutomaticSyncAt = 0L
    private val reminderPermission = registerForActivityResult(androidx.activity.result.contract.ActivityResultContracts.RequestPermission()) {
        ModuleBackgroundSync.schedule(applicationContext)
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setLayout(R.layout.zeitklar_daily_planner_two)
        store = PlannerMobileStore(applicationContext)

        supportActionBar?.apply {
            title = getString(R.string.zeitklar_daily_planner_title)
            setDisplayHomeAsUpEnabled(true)
        }

        bindPlannerTwo()

        findViewById<BottomNavigationView>(R.id.zeitklar_module_navigation).apply {
            selectedItemId = R.id.zeitklar_navigation_daily_planner
            setOnItemSelectedListener { item ->
                when (item.itemId) {
                    R.id.zeitklar_navigation_mail -> {
                        openMail()
                        false
                    }

                    R.id.zeitklar_navigation_modules -> {
                        startActivity(ZeitklarModuleCatalogActivity.intent(this@DailyPlannerActivity))
                        finish()
                        false
                    }

                    R.id.zeitklar_navigation_daily_planner -> true

                    R.id.zeitklar_navigation_calendar -> {
                        startActivity(CalendarModuleActivity.intent(this@DailyPlannerActivity))
                        finish()
                        false
                    }

                    else -> false
                }
            }
        }
    }

    override fun onResume() {
        super.onResume()
        lifecycleScope.launch {
            plannerState = withContext(Dispatchers.IO) { store.load() }
            render()
            refreshPhoneCalendarReferences()
            if (System.currentTimeMillis() - lastAutomaticSyncAt > AUTO_SYNC_INTERVAL_MS) {
                lastAutomaticSyncAt = System.currentTimeMillis()
                synchronize(showResult = false)
            }
        }
    }

    override fun onCreateOptionsMenu(menu: Menu): Boolean {
        menu.add(0, MENU_SYNC, 0, R.string.tb_sync_button).apply {
            icon = ContextCompat.getDrawable(this@DailyPlannerActivity, R.drawable.tb_calendar_sync)
                ?.mutate()?.apply { setTint(color(R.color.zeitklar_text)) }
            setShowAsAction(MenuItem.SHOW_AS_ACTION_ALWAYS)
        }
        menu.add(0, 99, 1, "Aufgaben-Erinnerung")
        TbDiagnosticsActivity.addMenu(menu)
        return true
    }

    override fun onOptionsItemSelected(item: MenuItem): Boolean {
        if (item.itemId == TbDiagnosticsActivity.MENU_ID) {
            TbDiagnosticsActivity.open(this)
            return true
        }
        if (item.itemId == 99) {
            showReminderSettings()
            return true
        }
        return when (item.itemId) {
            android.R.id.home -> {
                finish()
                true
            }

            MENU_SYNC -> {
                synchronize(showResult = true)
                true
            }

            else -> super.onOptionsItemSelected(item)
        }
    }

    private fun bindPlannerTwo() {
        findViewById<Button>(R.id.zeitklar_planner_two_date_button).setOnClickListener {
            pickDate(selectedPlannerDate) { date ->
                selectedPlannerDate = date
                newAppointmentDate = date
                render()
                refreshPhoneCalendarReferences()
            }
        }
        findViewById<Button>(R.id.zeitklar_planner_two_task_date).setOnClickListener {
            pickDate(selectedPlannerDate) { date ->
                selectedPlannerDate = date
                render()
                refreshPhoneCalendarReferences()
            }
        }
        findViewById<Button>(R.id.zeitklar_planner_two_tomorrow).setOnClickListener {
            selectedPlannerDate = LocalDate.now().plusDays(1)
            newAppointmentDate = selectedPlannerDate
            render()
            refreshPhoneCalendarReferences()
        }
        findViewById<Button>(R.id.zeitklar_planner_two_event_date).setOnClickListener {
            pickDate(newAppointmentDate) { date ->
                newAppointmentDate = date
                render()
            }
        }
        findViewById<Button>(R.id.zeitklar_planner_two_event_time).setOnClickListener {
            pickTime(newAppointmentTime) { time ->
                newAppointmentTime = time
                render()
            }
        }
        findViewById<Button>(R.id.zeitklar_planner_two_event_add).setOnClickListener {
            val input = findViewById<EditText>(R.id.zeitklar_planner_two_event_input)
            val title = input.text.toString().trim()
            if (title.isEmpty()) {
                input.error = getString(R.string.zeitklar_appointment_required)
                return@setOnClickListener
            }
            val end = newAppointmentTime.plusHours(1)
            plannerState = store.addAppointment(
                plannerState,
                title,
                newAppointmentDate.toString(),
                timeKey(newAppointmentTime),
                timeKey(end),
            )
            store.save(plannerState)
            input.text?.clear()
            selectedPlannerDate = newAppointmentDate
            render()
            synchronize(showResult = false)
        }
        findViewById<Button>(R.id.zeitklar_planner_two_task_add).setOnClickListener {
            val taskInput = findViewById<EditText>(R.id.zeitklar_planner_two_task_input)
            val emailInput = findViewById<EditText>(R.id.zeitklar_planner_two_email_input)
            val text = taskInput.text.toString().trim()
            if (text.isEmpty()) {
                taskInput.error = getString(R.string.zeitklar_task_required)
                return@setOnClickListener
            }
            plannerState = store.addTask(plannerState, text, selectedPlannerDate.toString(), emailInput.text.toString())
            store.save(plannerState)
            taskInput.text?.clear()
            emailInput.text?.clear()
            render()
            synchronize(showResult = false)
        }
    }

    private fun render() {
        renderPlannerTwo(store.tasks(plannerState))
        renderOverviewSections()
    }

    private fun showReminderSettings() {
        val preferences = getSharedPreferences("tb_connect_reminders", MODE_PRIVATE)
        val minute = preferences.getInt("minute_of_day", 540)
        AlertDialog.Builder(this).setTitle("Aufgaben-Erinnerung")
            .setMessage("Tägliche Erinnerung an fällige offene Aufgaben. Android kann sie im Energiesparmodus verzögern.")
            .setNeutralButton("Aus") { _, _ -> preferences.edit().putBoolean("enabled", false).apply() }
            .setNegativeButton(android.R.string.cancel, null)
            .setPositiveButton("Uhrzeit wählen") { _, _ ->
                TimePickerDialog(this, { _, hour, minuteOfHour ->
                    preferences.edit().putBoolean("enabled", true).putInt("minute_of_day", hour * 60 + minuteOfHour).remove("last_day").apply()
                    if (android.os.Build.VERSION.SDK_INT >= 33 && ContextCompat.checkSelfPermission(this, android.Manifest.permission.POST_NOTIFICATIONS) != android.content.pm.PackageManager.PERMISSION_GRANTED) {
                        reminderPermission.launch(android.Manifest.permission.POST_NOTIFICATIONS)
                    }
                    ModuleBackgroundSync.schedule(applicationContext)
                }, minute / 60, minute % 60, true).show()
            }.show()
    }

    private fun renderPlannerTwo(tasks: List<PlannerTask>) {
        val dateKey = selectedPlannerDate.toString()
        val dayText = DateTimeFormatter
            .ofPattern("EEEE, d. MMMM", Locale.GERMAN)
            .format(selectedPlannerDate)
            .replaceFirstChar { it.titlecase(Locale.GERMAN) }
        // The desktop planner keeps permanent items and overdue tasks visible
        // underneath the selected day. The mobile view must not make a synced
        // task disappear merely because its date is already in the past.
        val datedTasks = tasks.filter { it.dueDate == dateKey }
        val dayTasks = tasks.filter { task ->
            task.dueDate == dateKey || task.dueDate == null || isOverdue(task)
        }
        findViewById<TextView>(R.id.zeitklar_planner_date).text = dayText
        findViewById<Button>(R.id.zeitklar_planner_two_date_button).text = getString(R.string.zeitklar_planner_two_pick_date_value, dateKey)
        findViewById<Button>(R.id.zeitklar_planner_two_task_date).text =
            getString(R.string.zeitklar_new_item_date, formattedDate(dateKey))
        findViewById<Button>(R.id.zeitklar_planner_two_event_date).text =
            getString(R.string.zeitklar_new_item_date, formattedDate(newAppointmentDate.toString()))
        findViewById<Button>(R.id.zeitklar_planner_two_event_time).text = timeKey(newAppointmentTime)
        findViewById<TextView>(R.id.zeitklar_planner_two_open_count).text =
            getString(R.string.zeitklar_task_count, dayTasks.count { !it.done })
        renderTaskGroup(
            R.id.zeitklar_planner_two_tasks,
            R.id.zeitklar_planner_two_task_count,
            dayTasks,
        )
        // The section combines dated, permanent and overdue work.
        findViewById<TextView>(R.id.zeitklar_planner_two_task_count).text =
            getString(R.string.zeitklar_planner_two_count_tasks, dayTasks.size)
        val calendarEvents = (store.calendarReferences(plannerState, dateKey) + phoneCalendarReferences)
            .distinctBy { "${it.title}|${it.detail}" }
        val appointments = store.appointments(plannerState).filter { it.date == dateKey }
        findViewById<TextView>(R.id.zeitklar_planner_two_event_count).text =
            getString(R.string.zeitklar_planner_two_count_events, calendarEvents.size + appointments.size)
        renderPlannerEvents(appointments, calendarEvents)
        val mails = store.plannedEmailReferences(plannerState, dateKey)
        findViewById<TextView>(R.id.zeitklar_planner_two_mail_count).text = getString(R.string.zeitklar_planner_two_count_mails, mails.size)
        renderPlannerTwoReferences(R.id.zeitklar_planner_two_mails, mails, R.string.zeitklar_planner_two_mails_empty)
        val tomorrow = selectedPlannerDate.plusDays(1).toString()
        val tomorrowEvents = store.calendarReferences(plannerState, tomorrow).size +
            phoneCalendarTomorrowCount +
            store.appointments(plannerState).count { it.date == tomorrow }
        val tomorrowTasks = tasks.count { it.dueDate == tomorrow && !it.done }
        findViewById<Button>(R.id.zeitklar_planner_two_tomorrow).text =
            getString(R.string.zeitklar_planner_two_tomorrow_summary, tomorrowEvents, tomorrowTasks)
    }

    private fun renderOverviewSections() {
        val container = findViewById<LinearLayout>(R.id.tb_planner_sections)
        container.removeAllViews()
        val showCompleted = runCatching {
            org.json.JSONObject(plannerState.payload).optJSONObject("settings")?.optBoolean("showCompleted", true) != false
        }.getOrDefault(true)
        val tasks = store.tasks(plannerState).filter { showCompleted || !it.done }
        val mails = store.plannedEmailItems(plannerState).filter { showCompleted || !it.done }
        plannerOverview(tasks, mails, selectedPlannerDate, LocalDate.now()).forEach { section ->
            val content = LinearLayout(this).apply {
                orientation = LinearLayout.VERTICAL
                val inset = resources.getDimensionPixelSize(R.dimen.tb_calendar_nav_medium)
                setPadding(inset, inset, inset, inset)
            }
            val (kicker, title) = overviewHeading(section)
            content.addView(overviewText(kicker, com.google.android.material.R.style.TextAppearance_Material3_LabelSmall))
            content.addView(overviewText(title, com.google.android.material.R.style.TextAppearance_Material3_TitleLarge))
            section.tasks.sortedWith(compareBy<PlannerTask> { it.done }.thenBy { it.order }).forEach {
                content.addView(taskRow(it))
            }
            section.mails.forEach { content.addView(referenceCard(it.displayReference())) }
            val calendar = section.date?.let { date ->
                val phone = if (date == selectedPlannerDate) phoneCalendarReferences else phoneCalendarTomorrowReferences
                (store.calendarReferences(plannerState, date.toString()) + phone).distinctBy { "${it.title}|${it.detail}" }
            }.orEmpty()
            val appointments = store.appointments(plannerState).filter { it.date == section.date?.toString() }
            calendar.forEach { content.addView(referenceCard(it)) }
            appointments.forEach { content.addView(appointmentCard(it)) }
            if (section.tasks.isEmpty() && section.mails.isEmpty() && calendar.isEmpty() && appointments.isEmpty()) {
                content.addView(overviewText(getString(R.string.tb_planner_empty),
                    com.google.android.material.R.style.TextAppearance_Material3_BodyMedium))
            }
            container.addView(MaterialCardView(this).apply {
                setCardBackgroundColor(color(R.color.zeitklar_surface))
                radius = resources.getDimension(R.dimen.tb_calendar_nav_medium)
                cardElevation = 0f
                addView(content)
                layoutParams = LinearLayout.LayoutParams(-1, -2).apply {
                    topMargin = resources.getDimensionPixelSize(R.dimen.tb_calendar_nav_small)
                }
            })
        }
    }

    private fun overviewText(value: String, appearance: Int): TextView = TextView(this).apply {
        text = value
        setTextAppearance(appearance)
        setTextColor(color(R.color.zeitklar_text))
    }

    private fun overviewHeading(section: PlannerOverviewSection): Pair<String, String> {
        val today = LocalDate.now()
        val kind = when (section.kind) {
            PlannerOverviewKind.OVERDUE -> R.string.tb_planner_overdue_kicker
            PlannerOverviewKind.UNDATED -> R.string.tb_planner_undated
            else -> when (section.date) {
                today -> R.string.tb_planner_today
                today.plusDays(1) -> R.string.tb_planner_tomorrow
                else -> if (section.kind == PlannerOverviewKind.NEXT_DAY) R.string.tb_planner_next_day
                    else R.string.tb_planner_selected_day
            }
        }
        val title = when (section.kind) {
            PlannerOverviewKind.OVERDUE -> getString(R.string.tb_planner_overdue)
            PlannerOverviewKind.UNDATED -> getString(R.string.tb_planner_permanent)
            else -> section.date!!.format(DateTimeFormatter.ofPattern("EEEE, d. MMMM", Locale.GERMAN))
                .replaceFirstChar { it.titlecase(Locale.GERMAN) }
        }
        return getString(kind) to title
    }

    private fun renderPlannerEvents(
        appointments: List<PlannerAppointment>,
        calendarEvents: List<PlannerDesktopReference>,
    ) {
        val container = findViewById<LinearLayout>(R.id.zeitklar_planner_two_events)
        container.removeAllViews()
        appointments.sortedWith(compareBy({ it.startTime }, { it.title.lowercase() })).forEach {
            container.addView(appointmentCard(it))
        }
        calendarEvents.forEach { container.addView(referenceCard(it)) }
        if (appointments.isEmpty() && calendarEvents.isEmpty()) {
            container.addView(TextView(this).apply {
                text = getString(R.string.zeitklar_planner_two_events_empty)
                setTextAppearance(com.google.android.material.R.style.TextAppearance_Material3_BodyMedium)
                setTextColor(color(R.color.zeitklar_muted))
                setPadding(dp(4), dp(8), dp(4), dp(8))
            })
        }
    }

    private fun refreshPhoneCalendarReferences() {
        if (!DeviceCalendarStore.hasReadAccess(this)) {
            phoneCalendarReferences = emptyList()
            phoneCalendarTomorrowCount = 0
            return
        }
        val selectedDate = selectedPlannerDate
        val tomorrow = LocalDate.now().plusDays(1)
        Thread {
            val selected = DeviceCalendarStore.eventsForDate(applicationContext, selectedDate)
            val tomorrowReferences = DeviceCalendarStore.eventsForDate(applicationContext, tomorrow)
            runOnUiThread {
                if (selectedPlannerDate == selectedDate) {
                    phoneCalendarReferences = selected
                    phoneCalendarTomorrowReferences = tomorrowReferences
                    phoneCalendarTomorrowCount = tomorrowReferences.size
                    render()
                }
            }
        }.start()
    }

    private fun appointmentCard(item: PlannerAppointment): View = MaterialCardView(this).apply {
        radius = dp(12).toFloat()
        cardElevation = 0f
        setCardBackgroundColor(color(R.color.zeitklar_surface_soft))
        layoutParams = LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT,
            LinearLayout.LayoutParams.WRAP_CONTENT,
        ).apply { bottomMargin = dp(8) }
        addView(LinearLayout(this@DailyPlannerActivity).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(14), dp(10), dp(10), dp(7))
            addView(TextView(this@DailyPlannerActivity).apply {
                text = "${item.startTime}–${item.endTime}   ${item.title}"
                setTextAppearance(com.google.android.material.R.style.TextAppearance_Material3_TitleSmall)
                setTextColor(color(R.color.zeitklar_text))
            })
            addView(TextView(this@DailyPlannerActivity).apply {
                text = getString(R.string.zeitklar_appointment_source_mobile)
                setTextAppearance(com.google.android.material.R.style.TextAppearance_Material3_BodySmall)
                setTextColor(color(R.color.zeitklar_muted))
            })
            addView(LinearLayout(this@DailyPlannerActivity).apply {
                gravity = android.view.Gravity.END
                addView(compactButton(getString(R.string.zeitklar_task_edit)) { showEditAppointmentDialog(item) })
                addView(compactButton(getString(R.string.zeitklar_task_delete), danger = true) {
                    plannerState = store.deleteAppointment(plannerState, item.id)
                    store.save(plannerState)
                    render()
                    synchronize(showResult = false)
                })
            })
        })
    }

    private fun renderPlannerTwoReferences(containerId: Int, references: List<PlannerDesktopReference>, emptyString: Int) {
        val container = findViewById<LinearLayout>(containerId)
        container.removeAllViews()
        if (references.isEmpty()) {
            container.addView(TextView(this).apply {
                text = getString(emptyString)
                setTextAppearance(com.google.android.material.R.style.TextAppearance_Material3_BodyMedium)
                setTextColor(color(R.color.zeitklar_muted))
                setPadding(dp(4), dp(8), dp(4), dp(8))
            })
            return
        }
        references.forEach { reference ->
            container.addView(referenceCard(reference))
        }
    }

    private fun renderTaskGroup(containerId: Int, countId: Int, tasks: List<PlannerTask>) {
        findViewById<TextView>(countId).text = getString(R.string.zeitklar_task_count, tasks.count { !it.done })
        val container = findViewById<LinearLayout>(containerId)
        container.removeAllViews()
        if (tasks.isEmpty()) {
            container.addView(TextView(this).apply {
                text = getString(R.string.zeitklar_daily_planner_empty)
                setTextAppearance(com.google.android.material.R.style.TextAppearance_Material3_BodyMedium)
                setTextColor(color(R.color.zeitklar_muted))
                setPadding(dp(4), dp(10), dp(4), dp(12))
            })
            return
        }
        tasks.sortedWith(
            compareBy<PlannerTask> { it.done }
                .thenBy { !isOverdue(it) }
                .thenBy { it.order }
                .thenBy { it.createdAt },
        ).forEach { task ->
            container.addView(taskRow(task))
        }
    }

    private fun taskRow(task: PlannerTask): View {
        val content = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(12), dp(10), dp(12), dp(8))
        }
        val titleLine = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = android.view.Gravity.CENTER_VERTICAL
        }
        titleLine.addView(MaterialCheckBox(this).apply {
            text = task.text
            isChecked = task.done
            setTextAppearance(com.google.android.material.R.style.TextAppearance_Material3_TitleSmall)
            setTextColor(color(if (task.done) R.color.zeitklar_muted else R.color.zeitklar_text))
            buttonTintList = checkboxColors()
            if (task.done) paintFlags = paintFlags or Paint.STRIKE_THRU_TEXT_FLAG
            layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
            setOnCheckedChangeListener { _, isChecked ->
                plannerState = store.updateTask(plannerState, task.id) { it.copy(done = isChecked, updatedAt = now()) }
                store.save(plannerState)
                render()
                synchronize(showResult = false)
            }
            setOnLongClickListener {
                showEditTaskDialog(task)
                true
            }
        })
        content.addView(titleLine)
        if (task.notes.isNotBlank()) {
            content.addView(TextView(this).apply {
                text = task.notes
                setTextColor(color(R.color.zeitklar_muted))
                setPadding(dp(42), dp(5), 0, dp(5))
            })
        }
        content.addView(TextView(this).apply {
            val overdue = isOverdue(task)
            text = if (overdue) {
                getString(R.string.zeitklar_task_overdue, formattedDate(task.dueDate.orEmpty()))
            } else if (task.dueDate == null) {
                getString(R.string.zeitklar_task_without_date)
            } else {
                getString(R.string.zeitklar_task_due_on, formattedDate(task.dueDate))
            }
            setTextAppearance(com.google.android.material.R.style.TextAppearance_Material3_LabelMedium)
            setTextColor(color(if (overdue) R.color.zeitklar_danger else R.color.zeitklar_accent_strong))
            background = roundedBackground(R.color.zeitklar_accent_soft, 999)
            setPadding(dp(9), dp(4), dp(9), dp(4))
            layoutParams = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.WRAP_CONTENT,
                LinearLayout.LayoutParams.WRAP_CONTENT,
            ).apply {
                marginStart = dp(42)
                topMargin = dp(2)
            }
        })
        if (task.emailAddress.isNotBlank()) {
            content.addView(TextView(this).apply {
                text = task.emailAddress
                setTextAppearance(com.google.android.material.R.style.TextAppearance_Material3_BodySmall)
                setTextColor(color(R.color.zeitklar_muted))
                setPadding(dp(42), dp(5), 0, dp(2))
            })
        }

        val actions = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = android.view.Gravity.END
            setPadding(0, dp(5), 0, 0)
        }
        actions.addView(compactButton(getString(R.string.zeitklar_task_edit)) { showEditTaskDialog(task) })
        actions.addView(compactButton(getString(R.string.zeitklar_task_date)) { showTaskDatePicker(task) })
        actions.addView(compactButton(getString(R.string.zeitklar_task_delete), danger = true) { deleteTask(task.id) })
        content.addView(actions)

        return MaterialCardView(this).apply {
            radius = dp(12).toFloat()
            cardElevation = 0f
            strokeWidth = dp(1)
            strokeColor = color(R.color.zeitklar_line)
            setCardBackgroundColor(color(R.color.zeitklar_surface_soft))
            alpha = if (task.done) 0.72f else 1f
            layoutParams = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT,
            ).apply { bottomMargin = dp(8) }
            addView(content)
        }
    }

    private fun compactButton(text: String, danger: Boolean = false, action: () -> Unit): MaterialButton =
        MaterialButton(this).apply {
        this.text = text
        textSize = 11f
        isAllCaps = false
        minHeight = 0
        minimumHeight = 0
        minWidth = 0
        minimumWidth = 0
        insetTop = 0
        insetBottom = 0
        cornerRadius = dp(8)
        backgroundTintList = ColorStateList.valueOf(Color.TRANSPARENT)
        rippleColor = ColorStateList.valueOf(color(R.color.zeitklar_accent_soft))
        setTextColor(color(if (danger) R.color.zeitklar_danger else R.color.zeitklar_muted))
        setPadding(dp(7), 0, dp(7), 0)
        layoutParams = LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.WRAP_CONTENT,
            dp(32),
        ).apply { marginStart = dp(2) }
        setOnClickListener { action() }
    }

    private fun referenceCard(reference: PlannerDesktopReference): View = MaterialCardView(this).apply {
        radius = dp(12).toFloat()
        cardElevation = 0f
        strokeWidth = 0
        setCardBackgroundColor(color(R.color.zeitklar_surface_soft))
        layoutParams = LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT,
            LinearLayout.LayoutParams.WRAP_CONTENT,
        ).apply { bottomMargin = dp(8) }
        addView(LinearLayout(this@DailyPlannerActivity).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(14), dp(11), dp(14), dp(11))
            addView(TextView(this@DailyPlannerActivity).apply {
                text = reference.title.removePrefix("â–£ ").removePrefix("âœ‰ ")
                setTextAppearance(com.google.android.material.R.style.TextAppearance_Material3_TitleSmall)
                setTextColor(color(R.color.zeitklar_text))
            })
            addView(TextView(this@DailyPlannerActivity).apply {
                text = reference.detail
                setTextAppearance(com.google.android.material.R.style.TextAppearance_Material3_BodySmall)
                setTextColor(color(R.color.zeitklar_muted))
                setPadding(0, dp(4), 0, 0)
            })
        })
    }

    private fun checkboxColors(): ColorStateList = ColorStateList(
        arrayOf(
            intArrayOf(android.R.attr.state_checked),
            intArrayOf(-android.R.attr.state_checked),
        ),
        intArrayOf(color(R.color.zeitklar_teal), color(R.color.zeitklar_muted)),
    )

    private fun roundedBackground(colorId: Int, radiusDp: Int) =
        android.graphics.drawable.GradientDrawable().apply {
            setColor(color(colorId))
            cornerRadius = dp(radiusDp).toFloat()
        }

    private fun isOverdue(task: PlannerTask): Boolean = !task.done && task.dueDate
        ?.let { value -> runCatching { LocalDate.parse(value).isBefore(LocalDate.now()) }.getOrDefault(false) }
        ?: false

    private fun formattedDate(value: String): String = runCatching {
        DateTimeFormatter.ofPattern("dd.MM.yyyy").format(LocalDate.parse(value))
    }.getOrDefault(value)

    private fun timeKey(value: LocalTime): String = DateTimeFormatter.ofPattern("HH:mm").format(value)

    private fun pickDate(current: LocalDate, onPicked: (LocalDate) -> Unit) {
        DatePickerDialog(
            this,
            { _, year, month, day -> onPicked(LocalDate.of(year, month + 1, day)) },
            current.year,
            current.monthValue - 1,
            current.dayOfMonth,
        ).show()
    }

    private fun pickTime(current: LocalTime, onPicked: (LocalTime) -> Unit) {
        TimePickerDialog(
            this,
            { _, hour, minute -> onPicked(LocalTime.of(hour, minute)) },
            current.hour,
            current.minute,
            true,
        ).show()
    }

    private fun color(id: Int): Int = ContextCompat.getColor(this, id)

    private fun dp(value: Int): Int = (value * resources.displayMetrics.density).toInt()

    private fun moveTask(id: String, dueDate: String?) {
        plannerState = store.updateTask(plannerState, id) { it.copy(dueDate = dueDate, updatedAt = now()) }
        store.save(plannerState)
        render()
        synchronize(showResult = false)
    }

    private fun deleteTask(id: String) {
        plannerState = store.deleteTask(plannerState, id)
        store.save(plannerState)
        render()
        synchronize(showResult = false)
    }

    private fun showEditTaskDialog(task: PlannerTask) {
        val content = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(48, 0, 48, 0)
        }
        val input = EditText(this).apply {
            hint = getString(R.string.zeitklar_planner_two_task_hint)
            setText(task.text)
        }
        val emailInput = EditText(this).apply {
            hint = getString(R.string.zeitklar_planner_two_email_hint)
            inputType = android.text.InputType.TYPE_TEXT_VARIATION_EMAIL_ADDRESS
            setText(task.emailAddress)
        }
        val notesInput = EditText(this).apply {
            hint = "Notizen zur Aufgabe"
            setText(task.notes)
            minLines = 3
            inputType = android.text.InputType.TYPE_CLASS_TEXT or android.text.InputType.TYPE_TEXT_FLAG_MULTI_LINE
            filters = arrayOf(android.text.InputFilter.LengthFilter(10000))
        }
        var dueDate = task.dueDate?.let { runCatching { LocalDate.parse(it) }.getOrNull() }
        val dateButton = MaterialButton(this).apply {
            text = dueDate?.let { getString(R.string.zeitklar_new_item_date, formattedDate(it.toString())) }
                ?: getString(R.string.zeitklar_task_without_date)
            setOnClickListener {
                pickDate(dueDate ?: selectedPlannerDate) { selected ->
                    dueDate = selected
                    text = getString(R.string.zeitklar_new_item_date, formattedDate(selected.toString()))
                }
            }
        }
        val noDateButton = MaterialButton(this).apply {
            text = getString(R.string.zeitklar_move_someday)
            setOnClickListener {
                dueDate = null
                dateButton.text = getString(R.string.zeitklar_task_without_date)
            }
        }
        content.addView(input)
        content.addView(emailInput)
        content.addView(notesInput)
        content.addView(dateButton)
        content.addView(noDateButton)
        AlertDialog.Builder(this)
            .setTitle(R.string.zeitklar_task_edit)
            .setView(content)
            .setNegativeButton(android.R.string.cancel, null)
            .setPositiveButton(android.R.string.ok) { _, _ ->
                val text = input.text.toString().trim()
                if (text.isNotEmpty()) {
                    plannerState = store.updateTask(plannerState, task.id) {
                        it.copy(
                            text = text,
                            emailAddress = emailInput.text.toString().trim(),
                            notes = notesInput.text.toString(),
                            dueDate = dueDate?.toString(),
                            updatedAt = now(),
                        )
                    }
                    store.save(plannerState)
                    render()
                    synchronize(showResult = false)
                }
            }
            .show()
    }

    private fun showEditAppointmentDialog(item: PlannerAppointment) {
        val content = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(24), 0, dp(24), 0)
        }
        val titleInput = EditText(this).apply {
            hint = getString(R.string.zeitklar_appointment_title_hint)
            setText(item.title)
        }
        var date = runCatching { LocalDate.parse(item.date) }.getOrDefault(selectedPlannerDate)
        var start = runCatching { LocalTime.parse(item.startTime) }.getOrDefault(LocalTime.of(9, 0))
        val dateButton = MaterialButton(this).apply {
            text = getString(R.string.zeitklar_new_item_date, formattedDate(date.toString()))
            setOnClickListener {
                pickDate(date) { selected ->
                    date = selected
                    text = getString(R.string.zeitklar_new_item_date, formattedDate(selected.toString()))
                }
            }
        }
        val timeButton = MaterialButton(this).apply {
            text = getString(R.string.zeitklar_appointment_time, timeKey(start))
            setOnClickListener {
                pickTime(start) { selected ->
                    start = selected
                    text = getString(R.string.zeitklar_appointment_time, timeKey(selected))
                }
            }
        }
        content.addView(titleInput)
        content.addView(dateButton)
        content.addView(timeButton)
        AlertDialog.Builder(this)
            .setTitle(R.string.zeitklar_task_edit)
            .setView(content)
            .setNegativeButton(android.R.string.cancel, null)
            .setPositiveButton(android.R.string.ok) { _, _ ->
                val title = titleInput.text.toString().trim()
                if (title.isNotEmpty()) {
                    plannerState = store.updateAppointment(plannerState, item.id) {
                        it.copy(
                            title = title,
                            date = date.toString(),
                            startTime = timeKey(start),
                            endTime = timeKey(start.plusHours(1)),
                            updatedAt = now(),
                        )
                    }
                    store.save(plannerState)
                    selectedPlannerDate = date
                    render()
                    synchronize(showResult = false)
                }
            }
            .show()
    }

    private fun showTaskDatePicker(task: PlannerTask) {
        val current = task.dueDate?.let { runCatching { LocalDate.parse(it) }.getOrNull() } ?: selectedPlannerDate
        DatePickerDialog(
            this,
            { _, year, month, day -> moveTask(task.id, LocalDate.of(year, month + 1, day).toString()) },
            current.year,
            current.monthValue - 1,
            current.dayOfMonth,
        ).show()
    }

    override fun onDestroy() {
        manualSyncFeedback.close()
        super.onDestroy()
    }

    private fun synchronize(showResult: Boolean) {
        if (showResult) {
            if (!manualSyncFeedback.begin()) return
            manualDesktopRequested = true
            plannerGoogleLoop.request(afterRunning = true)
        }
        plannerDesktopLoop.request(afterRunning = true)
    }

    private suspend fun performPlannerGoogleSync() {
        val report = try {
            withContext(Dispatchers.IO) { nativeCalendar.synchronizeAll() }
        } catch (cancelled: CancellationException) {
            throw cancelled
        } catch (_: Exception) { null }
        nativeSyncFailed = report == null || report.failures > 0 || report.conflicts > 0
        val status = when {
            nativeSyncFailed -> SyncPartStatus.FAILED
            report?.calendars == 0 -> SyncPartStatus.SKIPPED
            else -> SyncPartStatus.SUCCESS
        }
        val message = when {
            report == null -> getString(R.string.tb_sync_native_failed)
            status == SyncPartStatus.SKIPPED -> getString(R.string.tb_sync_no_native)
            else -> getString(R.string.tb_native_calendar_sync_report,
                report.uploaded, report.downloaded, report.conflicts, report.failures)
        }
        refreshPhoneCalendarReferences()
        manualSyncFeedback.finish("calendar", SyncPart(status, message))
    }

    private suspend fun performPlannerDesktopSync() {
        val showResult = manualDesktopRequested
        manualDesktopRequested = false
        if (plannerState.connections.isEmpty()) {
            if (showResult) manualSyncFeedback.finish("desktop",
                SyncPart(SyncPartStatus.SKIPPED, getString(R.string.tb_sync_no_desktop)))
            return
        }
        val outcome = try {
            withContext(Dispatchers.IO) { exchangePlannerConnections() }
        } catch (cancelled: CancellationException) {
            throw cancelled
        } catch (_: Exception) {
            if (showResult) manualSyncFeedback.finish("desktop",
                SyncPart(SyncPartStatus.FAILED, getString(R.string.tb_sync_desktop_failed)))
            return
        }
        plannerState = outcome.first
        render()
        if (showResult) {
            val details = plannerState.connections.joinToString("\n") {
                getString(if (it.lastError.isNullOrBlank()) R.string.tb_sync_peer_ok else R.string.tb_sync_peer_failed, it.name)
            }
            manualSyncFeedback.finish("desktop", SyncPart(
                if (outcome.second == 0) SyncPartStatus.SUCCESS else SyncPartStatus.FAILED, details,
            ))
        }
    }

    // IO, JSON and legacy authentication adapters share this transport boundary.
    @Suppress("TooGenericExceptionCaught")
    private fun exchangePlannerConnections(): Pair<PlannerMobileState, Int> {
        var latest = store.load()
        var failures = 0
        latest.connections.forEach { connection ->
            val attemptedAt = now()
            try {
                val result = PlannerSyncClient.sync(applicationContext, latest, connection)
                val moduleFailure = result.moduleFailures.isNotEmpty()
                if (moduleFailure) failures += 1
                latest = store.mergeModuleSync(store.mergeRemotePayload(latest, result.remotePayload), result).withConnection(
                    connection.copy(
                        endpoint = result.endpoint ?: connection.endpoint,
                        workspaceId = result.workspaceId ?: connection.workspaceId,
                        lastMobileSyncAt = attemptedAt,
                        lastDesktopSyncAt = result.desktopSyncAt,
                        lastAttemptAt = attemptedAt,
                        lastError = if (moduleFailure) getString(R.string.tb_sync_module_failed) else null,
                    ),
                )
            } catch (error: Exception) {
                failures += 1
                latest = latest.withConnection(
                    connection.copy(
                        lastAttemptAt = attemptedAt,
                        lastError = connectionErrorText(error),
                    ),
                )
            }
        }
        store.save(latest)
        return latest to failures
    }

    private fun connectionErrorText(error: Exception): String =
        (error.message ?: getString(R.string.zeitklar_sync_error, ""))
            .replace(Regex("\\s+"), " ")
            .take(160)

    private fun openMail() {
        startActivity(
            Intent(this, MessageHomeActivity::class.java).apply {
                addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP)
            },
        )
        finish()
    }

    private fun now(): String = java.time.Instant.now().toString()

    companion object {
        private const val MENU_SYNC = 1
        private const val AUTO_SYNC_INTERVAL_MS = 90_000L

        fun intent(context: Context): Intent = Intent(context, DailyPlannerActivity::class.java)
    }
}
