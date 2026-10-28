package com.fsck.k9.ui.zeitklar

import net.thunderbird.feature.calendar.CalendarSyncProblem
import net.thunderbird.feature.calendar.NativeCalendarSetup
import net.thunderbird.feature.calendar.NativeCalendarSyncResult
import android.Manifest
import android.content.Context
import android.content.Intent
import android.database.ContentObserver
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.provider.CalendarContract
import android.text.TextUtils
import android.view.Gravity
import android.view.Menu
import android.view.MenuItem
import android.view.MotionEvent
import android.view.View
import android.widget.FrameLayout
import android.widget.GridLayout
import android.widget.LinearLayout
import android.widget.EditText
import android.widget.PopupMenu
import android.widget.ScrollView
import android.widget.TextView
import android.widget.Toast
import androidx.activity.addCallback
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.content.ContextCompat
import androidx.core.graphics.ColorUtils
import com.google.android.material.button.MaterialButtonToggleGroup
import androidx.lifecycle.lifecycleScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import org.json.JSONObject
import org.koin.android.ext.android.inject
import com.google.android.material.button.MaterialButton
import com.fsck.k9.activity.MessageHomeActivity
import com.fsck.k9.ui.R
import com.fsck.k9.ui.base.BaseActivity
import com.google.android.material.bottomnavigation.BottomNavigationView
import com.google.android.material.card.MaterialCardView
import com.google.android.material.dialog.MaterialAlertDialogBuilder
import java.time.DayOfWeek
import java.time.LocalDate
import java.time.YearMonth
import java.time.format.DateTimeFormatter
import java.util.Locale

/** Combines the active desktop projection with calendars already synchronized by Android. */
class CalendarModuleActivity : BaseActivity() {
    private val nativeCalendar: net.thunderbird.feature.calendar.NativeGoogleCalendar by inject()
    private val googleSetupRepository: GoogleCalendarSetupRepository by inject()
    private var googleSetupJob: Job? = null
    private var calendarObserverRegistered = false
    private val accountCalendarObserver = object : ContentObserver(Handler(Looper.getMainLooper())) {
        override fun onChange(selfChange: Boolean) {
            providerReloadJob?.cancel()
            providerReloadJob = lifecycleScope.launch {
                delay(PROVIDER_RELOAD_DEBOUNCE_MS)
                checkGoogleCalendarSetup()
                loadDeviceCalendarData(force = true)
            }
        }
    }
    private lateinit var store: PlannerMobileStore
    private var plannerState = PlannerMobileState.empty()
    private var visibleMonth = YearMonth.now()
    private var selectedDate = LocalDate.now()
    private var deviceEvents: List<DeviceCalendarEvent> = emptyList()
    private var deviceCalendars: List<DeviceCalendar> = emptyList()
    private var renderedEvents: List<CalendarGridEvent> = emptyList()
    private var nativeCalendarFailure = false
    private var calendarSetupPending = false
    private var dayPlanDate: LocalDate? = null
    private var dayPlanView: CalendarDayPlanView? = null
    private var dayPlanDialog: androidx.appcompat.app.AppCompatDialog? = null
    private var eventDetailsDialog: androidx.appcompat.app.AlertDialog? = null
    private val mutedCalendarWarnings: Set<String> get() = calendarViewPreferences
        .getStringSet("muted_calendar_warnings", emptySet()).orEmpty()
    private var calendarPermissionRequested = false
    private var viewMode = CalendarViewMode.MONTH
    private var loadedDeviceRangeKey = ""
    private var loadingDeviceRangeKey = ""
    private var deviceLoadJob: Job? = null
    private val deviceLoadMutex = Mutex()
    private val manualSyncFeedback by lazy { ManualSyncFeedback(this) { showSyncProblems() } }
    private var showSynchronizationResult = false
    private var showDesktopSynchronizationResult = false
    private val calendarSyncLoop by lazy { CalendarSyncLoop(lifecycleScope) { performSynchronization() } }
    private val desktopSyncLoop by lazy { CalendarSyncLoop(lifecycleScope) { performDesktopSynchronization() } }
    private var providerReloadJob: Job? = null
    private var resumeRefreshJob: Job? = null
    private val calendarViewPreferences by lazy {
        getSharedPreferences(CALENDAR_VIEW_PREFERENCES, Context.MODE_PRIVATE)
    }
    private var calendarQuery = ""
    private var hiddenCalendarNames: Set<String> = emptySet()
    private val calendarZone: java.time.ZoneId
        get() = runCatching { java.time.ZoneId.of(calendarViewPreferences.getString("zone_${viewMode.name}", java.time.ZoneId.systemDefault().id)) }
            .getOrDefault(java.time.ZoneId.systemDefault())
    private val calendarPermissionLauncher = registerForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        if (granted) {
            registerAccountCalendarObserver()
            loadDeviceCalendarData(force = true)
        } else {
            Toast.makeText(this, R.string.zeitklar_calendar_read_permission_required, Toast.LENGTH_LONG).show()
            render()
        }
    }
    private val calendarEventEditorLauncher = registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
        loadDeviceCalendarData(force = true)
        if (result.resultCode == RESULT_OK) {
            synchronize(showResult = false, afterEdit = true)
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setLayout(R.layout.zeitklar_calendar)
        store = PlannerMobileStore(applicationContext)
        viewMode = runCatching {
            CalendarViewMode.valueOf(savedInstanceState?.getString("calendar_mode")
                ?: calendarViewPreferences.getString("view_mode", CalendarViewMode.MONTH.name).orEmpty())
        }.getOrDefault(CalendarViewMode.MONTH)
        selectedDate = savedInstanceState?.getString("calendar_date")?.let {
            runCatching { LocalDate.parse(it) }.getOrNull()
        } ?: LocalDate.now()
        visibleMonth = YearMonth.from(selectedDate)
        calendarQuery = calendarViewPreferences.getString(KEY_CALENDAR_QUERY, "").orEmpty()
        hiddenCalendarNames = calendarViewPreferences.getStringSet(KEY_HIDDEN_CALENDAR_NAMES, emptySet())
            ?.toSet()
            .orEmpty()

        supportActionBar?.apply {
            title = getString(R.string.zeitklar_module_calendar_title)
            setDisplayHomeAsUpEnabled(true)
            setHomeAsUpIndicator(R.drawable.tb_calendar_menu)
            setHomeActionContentDescription(R.string.tb_calendar_open_navigation)
        }
        configureDrawerBack()
        findViewById<View>(R.id.tb_calendar_add_event).setOnClickListener {
            openCalendarEventEditor(selectedDate)
        }
        listOf(
            R.id.tb_calendar_mode_day to CalendarViewMode.DAY,
            R.id.tb_calendar_mode_week to CalendarViewMode.WEEK,
            R.id.tb_calendar_mode_month to CalendarViewMode.MONTH,
            R.id.tb_calendar_mode_year to CalendarViewMode.YEAR,
        ).forEach { (id, mode) ->
            findViewById<View>(id).setOnClickListener { selectViewMode(mode) }
        }
        findViewById<androidx.appcompat.widget.Toolbar>(R.id.toolbar).apply {
            val foreground = ContextCompat.getColor(this@CalendarModuleActivity, R.color.tb_calendar_text)
            navigationIcon?.setTint(foreground)
            overflowIcon?.setTint(foreground)
        }
        findViewById<View>(R.id.zeitklar_calendar_previous).setOnClickListener {
            moveMonth(-1)
        }
        findViewById<View>(R.id.zeitklar_calendar_next).setOnClickListener {
            moveMonth(1)
        }
        findViewById<androidx.core.widget.NestedScrollView>(R.id.zeitklar_calendar_scroll).post {
            findViewById<androidx.core.widget.NestedScrollView>(R.id.zeitklar_calendar_scroll).scrollTo(0, 0)
        }

        findViewById<View>(R.id.zeitklar_calendar_scroll).addOnLayoutChangeListener { _, left, top, right, bottom, oldLeft, oldTop, oldRight, oldBottom ->
            if ((right - left != oldRight - oldLeft || bottom - top != oldBottom - oldTop) && bottom > top &&
                (viewMode != CalendarViewMode.YEAR)) {
                renderCalendar(renderedEvents)
            }
        }
        findViewById<View>(R.id.zeitklar_calendar_month_title).setOnClickListener {
            showViewModeMenu(it)
        }
        findViewById<BottomNavigationView>(R.id.zeitklar_module_navigation).apply {
            selectedItemId = R.id.zeitklar_navigation_calendar
            setOnItemSelectedListener { item ->
                when (item.itemId) {
                    R.id.zeitklar_navigation_mail -> {
                        openMail()
                        false
                    }

                    R.id.zeitklar_navigation_modules -> {
                        startActivity(ZeitklarModuleCatalogActivity.intent(this@CalendarModuleActivity))
                        finish()
                        false
                    }

                    R.id.zeitklar_navigation_daily_planner -> {
                        startActivity(DailyPlannerActivity.intent(this@CalendarModuleActivity))
                        finish()
                        false
                    }

                    R.id.zeitklar_navigation_calendar -> true

                    else -> false
                }
            }
        }
    }

    private fun configureDrawerBack() {
        onBackPressedDispatcher.addCallback(this) {
            val drawer = findViewById<androidx.drawerlayout.widget.DrawerLayout>(R.id.tb_calendar_drawer)
            if (drawer.isDrawerOpen(androidx.core.view.GravityCompat.START)) drawer.closeDrawer(androidx.core.view.GravityCompat.START) else {
                isEnabled = false
                onBackPressedDispatcher.onBackPressed()
            }
        }
    }

    override fun onSaveInstanceState(outState: Bundle) {
        outState.putString("calendar_mode", viewMode.name)
        outState.putString("calendar_date", selectedDate.toString())
        super.onSaveInstanceState(outState)
    }

    override fun onResume() {
        super.onResume()
        findViewById<View>(R.id.toolbar).post { manualSyncFeedback.showPending() }
        hiddenCalendarNames = calendarViewPreferences.getStringSet(KEY_HIDDEN_CALENDAR_NAMES, emptySet()).orEmpty().toSet()
        resumeRefreshJob?.cancel()
        resumeRefreshJob = lifecycleScope.launch {
            plannerState = withContext(Dispatchers.IO) { store.load() }
            withContext(Dispatchers.IO) { nativeCalendar.ensurePeriodicSync() }
            render()
            checkGoogleCalendarSetup()
            registerAccountCalendarObserver()
            ensureDeviceCalendarAccess(force = true)
            calendarSyncLoop.start()
            desktopSyncLoop.start()
        }
    }

    override fun onPause() {
        resumeRefreshJob?.cancel()
        calendarSyncLoop.stop()
        desktopSyncLoop.stop()
        providerReloadJob?.cancel()
        if (calendarObserverRegistered) {
            contentResolver.unregisterContentObserver(accountCalendarObserver)
            calendarObserverRegistered = false
        }
        googleSetupJob?.cancel()
        super.onPause()
    }

    override fun onDestroy() {
        manualSyncFeedback.close()
        eventDetailsDialog?.dismiss()
        dayPlanDialog?.dismiss()
        super.onDestroy()
    }

    private fun registerAccountCalendarObserver() {
        if (calendarObserverRegistered || !DeviceCalendarStore.hasReadAccess(this)) return
        runCatching {
            contentResolver.registerContentObserver(CalendarContract.Calendars.CONTENT_URI, true, accountCalendarObserver)
            contentResolver.registerContentObserver(CalendarContract.Events.CONTENT_URI, true, accountCalendarObserver)
            calendarObserverRegistered = true
        }
    }

    private fun checkGoogleCalendarSetup() {
        googleSetupJob?.cancel()
        googleSetupJob = lifecycleScope.launch {
            val email = withContext(Dispatchers.IO) {
                runCatching { googleSetupRepository.pendingEmail() }.getOrNull()
            }
            val googleSources = store.calendarSources(plannerState).filter { it.provider == "Google Calendar" }
            val bindings = calendarViewPreferences.all.filterKeys { it.startsWith("desktop_binding_") }.values.toSet()
            val hasNewDesktopSource = googleSources.any { it.id !in bindings }
            calendarSetupPending = email != null || hasNewDesktopSource
            invalidateOptionsMenu()
            findViewById<MaterialButton>(R.id.tb_google_calendar_setup_notice).apply {
                visibility = View.GONE
                text = getString(if (email != null) R.string.tb_google_calendar_pending else R.string.tb_google_calendar_new_source)
                setOnClickListener {
                    if (email != null) startActivity(GoogleCalendarSetupActivity.intent(this@CalendarModuleActivity, email))
                    else startActivity(NativeCalendarSetup.intent(this@CalendarModuleActivity,
                        settingsIntent = CalendarAccountsActivity.intent(this@CalendarModuleActivity)))
                }
            }
        }
    }

    override fun onCreateOptionsMenu(menu: Menu): Boolean {
        val foreground = ContextCompat.getColor(this, R.color.tb_calendar_text)
        menu.add(0, MENU_SYNC, 0, R.string.tb_sync_button).apply {
            icon = ContextCompat.getDrawable(this@CalendarModuleActivity, R.drawable.tb_calendar_sync)
                ?.mutate()?.apply { setTint(foreground) }
            setShowAsAction(MenuItem.SHOW_AS_ACTION_ALWAYS)
        }
        menu.add(0, MENU_FILTER, 0, R.string.zeitklar_calendar_filter).apply {
            icon = ContextCompat.getDrawable(this@CalendarModuleActivity, R.drawable.tb_calendar_filter)
                ?.mutate()?.apply { setTint(foreground) }
            setShowAsAction(MenuItem.SHOW_AS_ACTION_ALWAYS)
        }
        menu.add(0, MENU_CURRENT_DATE, 1, R.string.tb_calendar_current_date).apply {
            icon = ContextCompat.getDrawable(this@CalendarModuleActivity, R.drawable.tb_calendar_today)
                ?.mutate()?.apply { setTint(foreground) }
            setShowAsAction(MenuItem.SHOW_AS_ACTION_ALWAYS)
        }
        if (hasCalendarWarning()) {
            menu.add(0, MENU_CONNECTION_STATUS, 2, R.string.tb_calendar_connection_warning).apply {
                icon = ContextCompat.getDrawable(this@CalendarModuleActivity, R.drawable.tb_calendar_warning)
                setShowAsAction(MenuItem.SHOW_AS_ACTION_ALWAYS)
            }
        }
        return true
    }

    private fun hasCalendarWarning(): Boolean = nativeCalendar.calendarProblems.keys.any {
        "phone:$it" !in mutedCalendarWarnings
    }

    private fun showCalendarNavigation() {
        val drawer = findViewById<androidx.drawerlayout.widget.DrawerLayout>(R.id.tb_calendar_drawer)
        val content = findViewById<LinearLayout>(R.id.tb_calendar_drawer_content)
        content.removeAllViews()
        fun heading(label: Int) {
            content.addView(TextView(this).apply {
                setText(label)
                setTextColor(ContextCompat.getColor(context, R.color.tb_calendar_muted))
                setPadding(
                    resources.getDimensionPixelSize(R.dimen.tb_calendar_nav_inset),
                    resources.getDimensionPixelSize(R.dimen.tb_calendar_nav_large),
                    resources.getDimensionPixelSize(R.dimen.tb_calendar_nav_inset),
                    resources.getDimensionPixelSize(R.dimen.tb_calendar_nav_small),
                )
                setTextAppearance(com.google.android.material.R.style.TextAppearance_Material3_TitleMedium)
            })
        }
        fun action(label: Int, iconId: Int, selected: Boolean = false, tagValue: String? = null, run: () -> Unit) {
            content.addView(MaterialButton(this).apply {
                setText(label)
                tag = tagValue
                setIconResource(iconId)
                iconTint = android.content.res.ColorStateList.valueOf(
                    ContextCompat.getColor(context, R.color.tb_calendar_text),
                )
                setTextColor(ContextCompat.getColor(context, R.color.tb_calendar_text))
                backgroundTintList = android.content.res.ColorStateList.valueOf(
                    if (selected) {
                        ContextCompat.getColor(context, R.color.tb_calendar_background)
                    } else Color.TRANSPARENT,
                )
                gravity = Gravity.START or Gravity.CENTER_VERTICAL
                isAllCaps = false
                minHeight = resources.getDimensionPixelSize(R.dimen.tb_calendar_nav_row)
                cornerRadius = resources.getDimensionPixelSize(R.dimen.tb_calendar_nav_inset)
                layoutParams = LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT,
                )
                setOnClickListener {
                    drawer.closeDrawer(androidx.core.view.GravityCompat.START)
                    run()
                }
            })
        }
        heading(R.string.zeitklar_calendar_choose_view)
        CalendarViewMode.entries.forEach { mode ->
            action(mode.labelRes, R.drawable.tb_calendar_today, mode == viewMode, mode.name) { selectViewMode(mode) }
        }
        heading(R.string.zeitklar_module_calendar_title)
        for ((id, label, icon) in listOf(
            Triple(MENU_NEW_EVENT, R.string.tb_calendar_create_event, R.drawable.tb_calendar_add),
            Triple(MENU_SYNC, R.string.tb_calendar_sync_now, R.drawable.tb_calendar_sync),
            Triple(MENU_ACCOUNTS, R.string.tb_calendar_accounts, R.drawable.tb_calendar_nav_calendar),
            Triple(MENU_SEARCH, R.string.zeitklar_calendar_search, R.drawable.tb_calendar_search),
            Triple(
                MENU_DISPLAY_OPTIONS, R.string.zeitklar_calendar_display_options, android.R.drawable.ic_menu_preferences,
            ),
            Triple(MENU_GOOGLE_SETUP, R.string.tb_google_calendar_setup_title, R.drawable.tb_calendar_add),
            Triple(MENU_FILTER, R.string.tb_calendar_sources_and_warnings, R.drawable.tb_calendar_filter),
        )) {
            action(label, icon) {
                val item = androidx.appcompat.widget.PopupMenu(this, findViewById(R.id.toolbar)).menu.add(0, id, 0, label)
                onOptionsItemSelected(item)
            }
        }
        val diagnosticMenu = androidx.appcompat.widget.PopupMenu(this, findViewById(R.id.toolbar)).menu
        TbDiagnosticsActivity.addMenu(diagnosticMenu)
        if (diagnosticMenu.size() > 0) {
            action(R.string.tb_calendar_diagnostics, android.R.drawable.ic_menu_info_details) {
                TbDiagnosticsActivity.open(this)
            }
        }
        drawer.openDrawer(androidx.core.view.GravityCompat.START)
    }

    override fun onOptionsItemSelected(item: MenuItem): Boolean = when (item.itemId) {
        TbDiagnosticsActivity.MENU_ID -> {
            TbDiagnosticsActivity.open(this)
            true
        }
        android.R.id.home -> {
            showCalendarNavigation()
            true
        }
        MENU_CONNECTION_STATUS -> {
            showCalendarFilterDialog()
            true
        }

        MENU_SYNC -> {
            synchronize(showResult = true)
            true
        }

        MENU_NEW_EVENT -> {
            openCalendarEventEditor(selectedDate)
            true
        }

        MENU_ACCOUNTS -> {
            startActivity(NativeCalendarSetup.intent(this, settingsIntent = CalendarAccountsActivity.intent(this)))
            true
        }

        MENU_SEARCH -> {
            showSearchDialog()
            true
        }

        MENU_FILTER -> {
            showCalendarFilterDialog()
            true
        }

        MENU_CURRENT_DATE -> {
            selectedDate = LocalDate.now()
            visibleMonth = YearMonth.from(selectedDate)
            render()
            loadDeviceCalendarData(force = true)
            true
        }

        MENU_GOOGLE_SETUP -> {
            startActivity(GoogleCalendarSetupActivity.intent(this))
            true
        }

        MENU_DISPLAY_OPTIONS -> {
            showDisplayOptions()
            true
        }

        else -> super.onOptionsItemSelected(item)
    }

    private fun render() {
        invalidateOptionsMenu()
        val events = calendarGridEvents()
        renderedEvents = events
        dayPlanDate?.let { date -> dayPlanView?.updateEntries(dayPlanEntries(date)) }
        renderCalendar(events)
        val payload = store.calendarPayload(plannerState)
        val syncStamp = payload.optString("generatedAt")
            .takeIf { it.isNotBlank() }
            ?.let { getString(R.string.zeitklar_calendar_updated, formatTimestamp(it)) }
            ?: getString(R.string.zeitklar_calendar_not_synced)
        val visibleEvents = events.filter { it.year == visibleMonth.year && it.month == visibleMonth.monthValue }
        val selectedEvents = events.filter {
            it.year == selectedDate.year && it.month == selectedDate.monthValue && it.day == selectedDate.dayOfMonth
        }
        val summary = when {
            selectedEvents.isNotEmpty() -> resources.getQuantityString(
                R.plurals.zeitklar_calendar_selected_day_summary,
                selectedEvents.size,
                selectedDate.format(DateTimeFormatter.ofPattern("dd.MM.", Locale.getDefault())),
                selectedEvents.size,
            )
            visibleEvents.isEmpty() -> getString(R.string.zeitklar_calendar_month_empty)
            else -> resources.getQuantityString(
                R.plurals.zeitklar_calendar_month_event_summary,
                visibleEvents.size,
                visibleEvents.size,
            )
        }
        val filterSummary = buildList {
            if (calendarQuery.isNotBlank()) add(getString(R.string.zeitklar_calendar_search_active, calendarQuery))
            if (hiddenCalendarNames.isNotEmpty()) add(getString(R.string.zeitklar_calendar_filter_active, hiddenCalendarNames.size))
        }
        findViewById<TextView>(R.id.zeitklar_calendar_event_summary).text =
            (listOf(summary) + filterSummary + syncStamp).joinToString(" · ")
    }

    private fun moveMonth(offset: Int) {
        selectedDate = when (viewMode) {
            CalendarViewMode.MONTH -> selectedDate.plusMonths(offset.toLong())
            CalendarViewMode.WEEK -> selectedDate.plusWeeks(offset.toLong())
            CalendarViewMode.DAY -> selectedDate.plusDays(offset.toLong())
            CalendarViewMode.YEAR -> selectedDate.plusYears(offset.toLong())
        }
        visibleMonth = YearMonth.from(selectedDate)
        render()
        loadDeviceCalendarData()
    }

    private var swipeDownX = 0f
    private var swipeDownY = 0f
    private var calendarSwipeStarted = false

    override fun dispatchTouchEvent(event: MotionEvent): Boolean {
        when (event.actionMasked) {
            MotionEvent.ACTION_DOWN -> {
                swipeDownX = event.rawX
                swipeDownY = event.rawY
                val bounds = android.graphics.Rect()
                val drawer = findViewById<androidx.drawerlayout.widget.DrawerLayout>(R.id.tb_calendar_drawer)
                calendarSwipeStarted = if (drawer.isDrawerVisible(androidx.core.view.GravityCompat.START)) false else {
                    findViewById<View>(R.id.zeitklar_calendar_scroll)?.getGlobalVisibleRect(bounds) == true &&
                        bounds.contains(event.rawX.toInt(), event.rawY.toInt())
                }
            }
            MotionEvent.ACTION_UP -> {
                val drawer = findViewById<androidx.drawerlayout.widget.DrawerLayout>(R.id.tb_calendar_drawer)
                val step = if (calendarSwipeStarted && !drawer.isDrawerVisible(androidx.core.view.GravityCompat.START)) {
                    CalendarMonthGrid.swipeStep(event.rawX - swipeDownX, event.rawY - swipeDownY, dp(24).toFloat())
                } else {
                    0
                }
                calendarSwipeStarted = false
                if (step != 0) {
                    // Child chips receive DOWN too. Cancel their click before changing the period.
                    val cancel = MotionEvent.obtain(event).apply { action = MotionEvent.ACTION_CANCEL }
                    super.dispatchTouchEvent(cancel)
                    cancel.recycle()
                    moveMonth(step)
                    return true
                }
            }
            MotionEvent.ACTION_CANCEL -> calendarSwipeStarted = false
        }
        return super.dispatchTouchEvent(event)
    }
    private fun selectViewMode(mode: CalendarViewMode) {
        viewMode = mode
        visibleMonth = YearMonth.from(selectedDate)
        calendarViewPreferences.edit().putString("view_mode", mode.name).apply()
        render()
        loadDeviceCalendarData()
    }

    private fun showViewModeMenu(anchor: View) {
        PopupMenu(this, anchor).apply {
            CalendarViewMode.entries.forEach { mode ->
                menu.add(0, mode.ordinal, mode.ordinal, getString(mode.labelRes))
            }
            setOnMenuItemClickListener { item ->
                selectViewMode(CalendarViewMode.entries[item.itemId])
                true
            }
            show()
        }
    }

    private fun showSearchDialog() {
        val input = EditText(this).apply {
            hint = getString(R.string.zeitklar_calendar_search_hint)
            setSingleLine(true)
            setText(calendarQuery)
            setSelection(text.length)
        }
        val horizontalPadding = dp(20)
        val container = FrameLayout(this).apply {
            setPadding(horizontalPadding, 0, horizontalPadding, 0)
            addView(input)
        }
        MaterialAlertDialogBuilder(this)
            .setTitle(R.string.zeitklar_calendar_search)
            .setView(container)
            .setNegativeButton(android.R.string.cancel, null)
            .setNeutralButton(R.string.zeitklar_calendar_search_clear) { _, _ ->
                calendarQuery = ""
                calendarViewPreferences.edit().remove(KEY_CALENDAR_QUERY).apply()
                render()
            }
            .setPositiveButton(android.R.string.ok) { _, _ ->
                calendarQuery = input.text?.toString()?.trim().orEmpty().take(100)
                calendarViewPreferences.edit().putString(KEY_CALENDAR_QUERY, calendarQuery).apply()
                render()
            }
            .show()
    }

    private fun showCalendarFilterDialog() {
        val problems = nativeCalendar.calendarProblems
        val calendars = (deviceCalendars.map {
            "phone:${it.id}" to "${it.name} · ${it.accountName.ifBlank { it.provider }}"
        } +
            store.calendarSources(plannerState).map { "desktop:${it.id}" to "${it.name} · Desktop" })
            .distinctBy { it.first }.sortedWith(compareBy<Pair<String, String>> {
                it.first.removePrefix("phone:").toLongOrNull()?.let(problems::containsKey) != true
            }.thenBy { it.second.lowercase(Locale.getDefault()) })
        if (calendars.isEmpty()) {
            Toast.makeText(this, R.string.zeitklar_calendar_filter_empty, Toast.LENGTH_SHORT).show()
            return
        }
        val hiddenNames = hiddenCalendarNames.toMutableSet()
        val muted = mutedCalendarWarnings.toMutableSet()
        val inset = resources.getDimensionPixelSize(R.dimen.tb_calendar_nav_medium)
        val rows = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(inset, 0, inset, 0)
        }
        for ((key, label) in calendars) {
            rows.addView(calendarFilterRow(key, label, hiddenNames, muted, problems))
        }
        MaterialAlertDialogBuilder(this)
            .setTitle(R.string.tb_calendar_sources_and_warnings)
            .setView(FrameLayout(this).apply {
                val available = this@CalendarModuleActivity.findViewById<View>(android.R.id.content).height.takeIf { it > 0 }
                    ?: resources.displayMetrics.heightPixels
                rows.measure(View.MeasureSpec.makeMeasureSpec(resources.displayMetrics.widthPixels,
                    View.MeasureSpec.AT_MOST), View.MeasureSpec.makeMeasureSpec(0, View.MeasureSpec.UNSPECIFIED))
                addView(ScrollView(context).apply { addView(rows) }, FrameLayout.LayoutParams(
                    FrameLayout.LayoutParams.MATCH_PARENT, minOf(rows.measuredHeight, available / 2),
                ))
            })
            .setNegativeButton(android.R.string.cancel, null)
            .setNeutralButton(R.string.zeitklar_calendar_filter_show_all) { _, _ ->
                hiddenCalendarNames = emptySet()
                calendarViewPreferences.edit().remove(KEY_HIDDEN_CALENDAR_NAMES).apply()
                render()
            }
            .setPositiveButton(android.R.string.ok) { _, _ ->
                hiddenCalendarNames = hiddenNames.toSet()
                calendarViewPreferences.edit().putStringSet(KEY_HIDDEN_CALENDAR_NAMES, hiddenCalendarNames)
                    .putStringSet("muted_calendar_warnings", muted).apply()
                render()
            }
            .show()
    }

    private fun calendarFilterRow(
        key: String,
        label: String,
        hiddenNames: MutableSet<String>,
        muted: MutableSet<String>,
        problems: Map<Long, CalendarSyncProblem>,
    ): View {
        val inset = resources.getDimensionPixelSize(R.dimen.tb_calendar_nav_inset)
        val entry = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(0, inset, 0, inset)
        }
        val problem = key.removePrefix("phone:").toLongOrNull()?.let { problems[it] }
        val calendarChoice = androidx.appcompat.widget.AppCompatCheckBox(this).apply {
            text = label
            fun warningIcon() = if (problem != null && key !in muted) R.drawable.tb_calendar_warning else 0
            setCompoundDrawablesWithIntrinsicBounds(0, 0, warningIcon(), 0)
            compoundDrawablePadding = resources.getDimensionPixelSize(R.dimen.tb_calendar_nav_small)
            isChecked = key !in hiddenNames
            setOnCheckedChangeListener { _, checked ->
                if (checked) hiddenNames.remove(key) else hiddenNames.add(key)
            }
        }
        entry.addView(calendarChoice)
        val warningView = problem?.let { issue ->
            TextView(this).apply {
                visibility = if (key in muted) View.GONE else View.VISIBLE
                setText(when (issue) {
                    CalendarSyncProblem.AUTHORIZATION -> R.string.tb_calendar_warning_auth
                    CalendarSyncProblem.CONFLICT -> R.string.tb_calendar_warning_conflict
                    CalendarSyncProblem.READ_ONLY -> R.string.tb_calendar_warning_read_only
                    else -> R.string.tb_calendar_warning_connection
                })
                setTextColor(ContextCompat.getColor(context, R.color.tb_calendar_text))
                compoundDrawablePadding = resources.getDimensionPixelSize(R.dimen.tb_calendar_nav_small)
                val side = resources.getDimensionPixelSize(R.dimen.tb_calendar_nav_small)
                val vertical = resources.getDimensionPixelSize(R.dimen.tb_calendar_nav_tiny)
                setPadding(side, vertical, side, vertical)
                entry.addView(this)
            }
        }
        if (problem != null) entry.addView(com.google.android.material.switchmaterial.SwitchMaterial(this).apply {
            setText(R.string.tb_calendar_show_warnings)
            isChecked = key !in muted
            setOnCheckedChangeListener { _, checked ->
                if (checked) muted.remove(key) else muted.add(key)
                warningView?.visibility = if (checked) View.VISIBLE else View.GONE
                calendarChoice.setCompoundDrawablesWithIntrinsicBounds(0, 0,
                    if (checked) R.drawable.tb_calendar_warning else 0, 0)
            }
        })
        return entry
    }

    private fun showDisplayOptions() {
        val weekStart = getString(
            if (weekStartDay == DayOfWeek.MONDAY) R.string.zeitklar_calendar_week_start_monday
            else R.string.zeitklar_calendar_week_start_sunday,
        )
        val monthText = getString(
            if (isLargeMonthText) R.string.zeitklar_calendar_month_text_large
            else R.string.zeitklar_calendar_month_text_standard,
        )
        MaterialAlertDialogBuilder(this)
            .setTitle(R.string.zeitklar_calendar_display_options)
            .setItems(
                arrayOf(
                    getString(R.string.zeitklar_calendar_week_start_value, weekStart),
                    getString(R.string.zeitklar_calendar_month_text_value, monthText),
                    "Zeitzone (${getString(viewMode.labelRes)}): ${calendarZone.id}",
                ),
            ) { _, which ->
                when (which) {
                    0 -> showWeekStartPicker()
                    1 -> showMonthTextSizePicker()
                    2 -> showTimeZonePicker()
                }
            }
            .show()
    }

    private fun showWeekStartPicker() {
        val days = arrayOf(
            getString(R.string.zeitklar_calendar_week_start_monday),
            getString(R.string.zeitklar_calendar_week_start_sunday),
        )
        MaterialAlertDialogBuilder(this)
            .setTitle(R.string.zeitklar_calendar_week_start)
            .setSingleChoiceItems(days, if (weekStartDay == DayOfWeek.MONDAY) 0 else 1) { dialog, which ->
                calendarViewPreferences.edit()
                    .putBoolean(KEY_WEEK_STARTS_SUNDAY, which == 1)
                    .apply()
                dialog.dismiss()
                loadedDeviceRangeKey = ""
                render()
                loadDeviceCalendarData()
            }
            .show()
    }

    private fun showTimeZonePicker() {
        val zones = java.time.ZoneId.getAvailableZoneIds().sorted()
        MaterialAlertDialogBuilder(this)
            .setTitle("Zeitzone · ${getString(viewMode.labelRes)}")
            .setSingleChoiceItems(zones.toTypedArray(), zones.indexOf(calendarZone.id)) { dialog, which ->
                calendarViewPreferences.edit().putString("zone_${viewMode.name}", zones[which]).apply()
                loadedDeviceRangeKey = ""
                loadingDeviceRangeKey = ""
                dialog.dismiss()
                render()
                loadDeviceCalendarData(force = true)
            }.setNegativeButton(android.R.string.cancel, null).show()
    }

    private fun showMonthTextSizePicker() {
        val sizes = arrayOf(
            getString(R.string.zeitklar_calendar_month_text_standard),
            getString(R.string.zeitklar_calendar_month_text_large),
        )
        MaterialAlertDialogBuilder(this)
            .setTitle(R.string.zeitklar_calendar_month_text)
            .setSingleChoiceItems(sizes, if (isLargeMonthText) 1 else 0) { dialog, which ->
                calendarViewPreferences.edit()
                    .putBoolean(KEY_LARGE_MONTH_TEXT, which == 1)
                    .apply()
                dialog.dismiss()
                render()
            }
            .show()
    }

    private fun renderCalendar(events: List<CalendarGridEvent>) {
        val title = displayTitle()
        supportActionBar?.setTitle(R.string.zeitklar_module_calendar_title)
        findViewById<TextView>(R.id.zeitklar_calendar_month_title).text = title
        findViewById<MaterialButtonToggleGroup>(R.id.tb_calendar_view_modes).check(
            when (viewMode) {
                CalendarViewMode.DAY -> R.id.tb_calendar_mode_day
                CalendarViewMode.WEEK -> R.id.tb_calendar_mode_week
                CalendarViewMode.MONTH -> R.id.tb_calendar_mode_month
                CalendarViewMode.YEAR -> R.id.tb_calendar_mode_year
            },
        )
        when (viewMode) {
            CalendarViewMode.MONTH -> renderMonthGrid(events)
            CalendarViewMode.WEEK -> renderWeekGrid(events)
            CalendarViewMode.DAY -> renderDayGrid(events)
            CalendarViewMode.YEAR -> renderYearGrid(events)
        }
    }

    private fun displayTitle(): String = when (viewMode) {
        CalendarViewMode.MONTH -> visibleMonth.atDay(1).format(DateTimeFormatter.ofPattern("MMMM yyyy", Locale.getDefault()))
            .replaceFirstChar { if (it.isLowerCase()) it.titlecase(Locale.getDefault()) else it.toString() }
        CalendarViewMode.WEEK -> selectedDate.format(DateTimeFormatter.ofPattern("'Woche' w · MMMM yyyy", Locale.getDefault()))
        CalendarViewMode.DAY -> selectedDate.format(DateTimeFormatter.ofPattern("EEEE, d. MMMM", Locale.getDefault()))
        CalendarViewMode.YEAR -> selectedDate.year.toString()
    }

    private fun renderMonthGrid(events: List<CalendarGridEvent>) {
        val locale = Locale.getDefault()
        val eventsByDate = events.groupBy { LocalDate.of(it.year, it.month, it.day) }
        val grid = findViewById<GridLayout>(R.id.zeitklar_calendar_grid)
        grid.removeAllViews()
        grid.columnCount = 7
        val monthDates = CalendarMonthGrid.dates(visibleMonth, weekStartDay)
        val weekRows = (monthDates.indexOfLast { it != null } / 7) + 1
        grid.rowCount = weekRows + 1
        findViewById<FrameLayout>(R.id.zeitklar_calendar_event_overlay).removeAllViews()
        val weekdayHeight = dp(32)
        val viewport = findViewById<View>(R.id.zeitklar_calendar_scroll).height
        val dayCellHeight = ((viewport - weekdayHeight) / weekRows).coerceAtLeast(dp(84))
        val visibleLanes = ((dayCellHeight - dp(44)) / dp(EVENT_BAR_HEIGHT_DP + 2))
            .coerceIn(1, MAX_VISIBLE_EVENT_LANES)

        val weekdays = (0..6).map { weekStartDay.plus(it.toLong()) }
        weekdays.forEachIndexed { column, dayOfWeek ->
            grid.addView(TextView(this).apply {
                text = dayOfWeek.getDisplayName(java.time.format.TextStyle.SHORT, locale).take(2).uppercase(locale)
                textSize = 11f
                gravity = Gravity.CENTER
                setTypeface(typeface, Typeface.BOLD)
                setTextColor(ContextCompat.getColor(this@CalendarModuleActivity, R.color.tb_calendar_muted))
                layoutParams = gridCellLayoutParams(column = column, row = 0, height = weekdayHeight)
            })
        }

        val today = LocalDate.now()
        monthDates.take(weekRows * 7).forEachIndexed { index, date ->
            val column = index % 7
            val row = index / 7 + 1
            val dayEvents = date?.let { eventsByDate[it].orEmpty() }.orEmpty()
            grid.addView(LinearLayout(this).apply {
                orientation = LinearLayout.VERTICAL
                // A flat, connected raster keeps neighbouring segments of a
                // multi-day appointment visually together across the week.
                setPadding(dp(2), dp(2), dp(2), dp(2))
                background = calendarCellBackground(
                    isSelected = date == selectedDate,
                )
                if (date != null) {
                    addView(TextView(this@CalendarModuleActivity).apply {
                        text = date.dayOfMonth.toString()
                        gravity = Gravity.CENTER
                        textSize = 13f
                        includeFontPadding = false
                        setTypeface(typeface, Typeface.BOLD)
                        val isToday = date == today
                        setTextColor(ContextCompat.getColor(this@CalendarModuleActivity,
                            if (isToday) R.color.tb_calendar_on_accent else R.color.tb_calendar_text))
                        if (isToday) background = GradientDrawable().apply {
                            shape = GradientDrawable.OVAL
                            setColor(ContextCompat.getColor(this@CalendarModuleActivity, R.color.tb_calendar_accent))
                        }
                        layoutParams = LinearLayout.LayoutParams(dp(28), dp(28)).apply {
                            gravity = Gravity.CENTER_HORIZONTAL
                        }
                    })
                    val overflow = dayEvents.count { it.lane >= visibleLanes }
                    if (overflow > 0) {
                        addView(View(this@CalendarModuleActivity), LinearLayout.LayoutParams(1, 0, 1f))
                        addView(TextView(this@CalendarModuleActivity).apply {
                            text = "+$overflow"
                            gravity = Gravity.CENTER
                            textSize = 10f
                            setTextColor(ContextCompat.getColor(this@CalendarModuleActivity, R.color.tb_calendar_muted))
                        }, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, dp(16)))
                    }
                    isFocusable = true
                    contentDescription = getString(R.string.tb_connect_calendar_day_description, date.toString(), dayEvents.size)
                    setOnClickListener {
                        selectedDate = date
                        render()
                        showDayPlan(date)
                    }
                }
                layoutParams = gridCellLayoutParams(column = column, row = row, height = dayCellHeight)
            })
        }
        // Event views are placed above the entire raster, rather than inside
        // individual day cells. A multi-day event is therefore one real bar
        // across consecutive columns instead of several touching fragments.
        grid.post { renderMonthEventBars(events, weekdayHeight, dayCellHeight, visibleLanes) }
    }

    private fun renderMonthEventBars(
        events: List<CalendarGridEvent>,
        weekdayHeight: Int,
        dayCellHeight: Int,
        visibleLanes: Int,
    ) {
        if (viewMode != CalendarViewMode.MONTH) return
        val grid = findViewById<GridLayout>(R.id.zeitklar_calendar_grid)
        val overlay = findViewById<FrameLayout>(R.id.zeitklar_calendar_event_overlay)
        overlay.removeAllViews()
        if (grid.width == 0) return
        val dayIndex = CalendarMonthGrid.dates(visibleMonth, weekStartDay)
            .mapIndexedNotNull { index, date -> date?.let { it to index } }
            .toMap()
        val widthPerDay = grid.width / 7f
        val eventBarHeight = dp(EVENT_BAR_HEIGHT_DP)
        val dayNumberSpace = dp(DAY_NUMBER_SPACE_DP)

        events.filter { event -> LocalDate.of(event.year, event.month, event.day) in dayIndex }
            .filter { it.lane < visibleLanes }
            .groupBy { it.seriesId }
            .values
            .forEach { series ->
                series.sortedBy { LocalDate.of(it.year, it.month, it.day) }
                    .groupBy { event -> dayIndex.getValue(LocalDate.of(event.year, event.month, event.day)) / 7 }
                    .forEach { (weekRow, rowSegments) ->
                        val ordered = rowSegments.sortedBy { dayIndex.getValue(LocalDate.of(it.year, it.month, it.day)) }
                        val first = ordered.first()
                        val firstIndex = dayIndex.getValue(LocalDate.of(first.year, first.month, first.day))
                        val lastIndex = dayIndex.getValue(LocalDate.of(ordered.last().year, ordered.last().month, ordered.last().day))
                        val startColumn = firstIndex % 7
                        val endColumn = lastIndex % 7
                        val isSeriesStart = first.startsToday
                        val isSeriesEnd = !ordered.last().continuesAfter
                        val bar = eventBar(first, isSeriesStart, isSeriesEnd)
                        bar.setOnClickListener {
                            selectedDate = LocalDate.of(first.year, first.month, first.day)
                            render()
                            showDayOverview(selectedDate, events.filter { event ->
                                LocalDate.of(event.year, event.month, event.day) == selectedDate
                            })
                        }
                        overlay.addView(bar, FrameLayout.LayoutParams(
                            ((endColumn - startColumn + 1) * widthPerDay).toInt().coerceAtLeast(dp(20)) - dp(2),
                            eventBarHeight,
                        ).apply {
                            leftMargin = (startColumn * widthPerDay).toInt() + dp(1)
                            topMargin = weekdayHeight + weekRow * dayCellHeight + dayNumberSpace + first.lane * (eventBarHeight + dp(2))
                        })
                    }
            }
    }

    private fun eventBar(event: CalendarGridEvent, isSeriesStart: Boolean, isSeriesEnd: Boolean): TextView = TextView(this).apply {
        text = buildString {
            if (!event.allDay && isSeriesStart) append("%02d:%02d ".format(event.hour, event.minute))
            append(event.title)
        }
        ellipsize = TextUtils.TruncateAt.END
        setSingleLine(true)
        maxLines = 1
        gravity = Gravity.CENTER_VERTICAL
        includeFontPadding = false
        setPadding(dp(3), 0, dp(2), 0)
        textSize = if (isLargeMonthText) 12f else 10f
        setTypeface(typeface, Typeface.BOLD)
        setTextColor(eventChipTextColor(event.color))
        background = GradientDrawable().apply {
            val radius = dp(4).toFloat()
            cornerRadii = floatArrayOf(
                if (isSeriesStart) radius else 0f,
                if (isSeriesStart) radius else 0f,
                if (isSeriesEnd) radius else 0f,
                if (isSeriesEnd) radius else 0f,
                if (isSeriesEnd) radius else 0f,
                if (isSeriesEnd) radius else 0f,
                if (isSeriesStart) radius else 0f,
                if (isSeriesStart) radius else 0f,
            )
            setColor(eventFill(event.color))
            setStroke(dp(1), safeEventColor(event.color))
        }
        isFocusable = true
        contentDescription = eventDescription(event)
    }

    private fun renderWeekGrid(events: List<CalendarGridEvent>) {
        renderTimeGrid(events, (0..6).map { startOfWeek(selectedDate).plusDays(it.toLong()) })
    }

    private fun renderDayGrid(events: List<CalendarGridEvent>) {
        renderTimeGrid(events, listOf(selectedDate, selectedDate))
    }

    private fun renderTimeGrid(events: List<CalendarGridEvent>, dates: List<LocalDate>) {
        val splitDay = viewMode == CalendarViewMode.DAY
        val grid = configureGrid(columns = 1, rows = 1)
        val row = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL }
        val allDayRows = dates.maxOfOrNull { date -> eventsForDate(events, date).count { it.allDay }.coerceAtMost(3) } ?: 0
        val headerHeight = dp(40 + allDayRows * 19)
        val viewport = findViewById<View>(R.id.zeitklar_calendar_scroll).height.takeIf { it > 0 }
            ?: (resources.displayMetrics.heightPixels / 2)
        val bodyHeight = CalendarMonthGrid.fittedBodyHeight(viewport, headerHeight)
        findViewById<androidx.core.widget.NestedScrollView>(R.id.zeitklar_calendar_scroll).scrollTo(0, 0)
        dates.forEachIndexed { columnIndex, date ->
            val firstHour = if (splitDay) columnIndex * 12 else 0
            val lastHour = if (splitDay) firstHour + 12 else 24
            val windowStart = firstHour * 60
            val windowEnd = lastHour * 60
            fun offset(minute: Int): Int {
                val relativeMinute = (minute - windowStart).coerceIn(0, windowEnd - windowStart)
                return (relativeMinute.toLong() * bodyHeight / (windowEnd - windowStart)).toInt()
            }
            if (columnIndex == 0 || splitDay) {
                row.addView(LinearLayout(this).apply {
                    orientation = LinearLayout.VERTICAL
                    addView(TextView(this@CalendarModuleActivity), LinearLayout.LayoutParams(dp(30), headerHeight))
                    for (hour in firstHour until lastHour) {
                        addView(TextView(this@CalendarModuleActivity).apply {
                            text = "%02d".format(hour)
                            textSize = 10f
                            gravity = Gravity.TOP or Gravity.CENTER_HORIZONTAL
                            setTextColor(ContextCompat.getColor(this@CalendarModuleActivity, R.color.tb_calendar_muted))
                        }, LinearLayout.LayoutParams(dp(30), offset((hour + 1) * 60) - offset(hour * 60)))
                    }
                })
            }
            val daily = eventsForDate(events, date)
            val column = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
            column.addView(LinearLayout(this).apply {
                orientation = LinearLayout.VERTICAL
                addView(TextView(this@CalendarModuleActivity).apply {
                    text = if (splitDay) {
                        getString(
                            if (columnIndex == 0) R.string.zeitklar_calendar_morning else R.string.zeitklar_calendar_afternoon,
                        )
                    } else {
                        date.format(DateTimeFormatter.ofPattern("EE\nd.MM."))
                    }
                    textSize = if (splitDay) 13f else 10f
                    gravity = Gravity.CENTER
                    setTextColor(ContextCompat.getColor(this@CalendarModuleActivity, R.color.tb_calendar_text))
                    setOnClickListener { showDayPlan(date) }
                })
                if (!splitDay || columnIndex == 0) {
                    daily.filter { it.allDay }.take(3).forEach { addView(eventChip(it)) }
                }
            }, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, headerHeight))
            val canvas = CalendarTimeGridColumn(this)
            for (hour in firstHour until lastHour) {
                canvas.addView(TextView(this).apply {
                    background = calendarCellBackground(isSelected = false)
                    setOnClickListener { openCalendarEventEditor(date) }
                    contentDescription = "$date ${hour}:00"
                }, FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT,
                    offset((hour + 1) * 60) - offset(hour * 60)).apply { topMargin = offset(hour * 60) })
            }
            val visibleEvents = daily.filter { !it.allDay }.mapNotNull { event ->
                val start = if (event.continues) 0 else event.hour * 60 + event.minute
                val end = if (event.continuesAfter || event.endDate.isAfter(date)) 1440 else event.endHour * 60 + event.endMinute
                CalendarMonthGrid.timeWindow(
                    start, end.coerceAtLeast(start + 15).coerceAtMost(1440), windowStart, windowEnd,
                )
                    ?.let { event to it }
            }.sortedBy { it.second.first }
            val placements = CalendarMonthGrid.timeColumns(visibleEvents.map { it.second })
            visibleEvents.forEachIndexed { index, (event, interval) ->
                val (start, end) = interval
                val (lane, lanes) = placements[index]
                val chip = eventChip(event).apply {
                    text = "%02d:%02d\n%s".format(start / 60, start % 60, event.title)
                    maxLines = 4
                    textSize = if (splitDay) 12f else 9f
                    androidx.core.widget.TextViewCompat.setAutoSizeTextTypeUniformWithConfiguration(
                        this, 7, if (splitDay) 12 else 9, 1, android.util.TypedValue.COMPLEX_UNIT_SP,
                    )
                    gravity = Gravity.TOP
                    setOnClickListener {
                        if (splitDay) editDayEvent(event, date) else showDayOverview(date, listOf(event))
                    }
                }
                val top = offset(start)
                val height = (offset(end) - top).coerceAtLeast(dp(8)).coerceAtMost((bodyHeight - top).coerceAtLeast(1))
                canvas.addAppointment(chip, top, height, lane, lanes)
            }
            column.addView(canvas, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, bodyHeight))
            row.addView(column, LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f))
        }
        grid.addView(row, gridCellLayoutParams(0, 0, headerHeight + bodyHeight))
    }

    private fun renderYearGrid(events: List<CalendarGridEvent>) {
        val grid = configureGrid(columns = 3, rows = 4)
        val locale = Locale.getDefault()
        (1..12).forEach { month ->
            val yearMonth = YearMonth.of(selectedDate.year, month)
            val monthEvents = events.filter { it.year == yearMonth.year && it.month == yearMonth.monthValue }
            val cell = LinearLayout(this).apply {
                orientation = LinearLayout.VERTICAL
                setPadding(dp(5), dp(5), dp(5), dp(5))
                background = calendarCellBackground(
                    isSelected = visibleMonth == yearMonth,
                )
                addView(TextView(this@CalendarModuleActivity).apply {
                    text = yearMonth.atDay(1).format(DateTimeFormatter.ofPattern("MMMM", locale))
                    setTypeface(typeface, Typeface.BOLD)
                    textSize = 12f
                    setTextColor(ContextCompat.getColor(this@CalendarModuleActivity, R.color.tb_calendar_text))
                })
                val days = GridLayout(this@CalendarModuleActivity).apply {
                    columnCount = 7
                    rowCount = 6
                }
                CalendarMonthGrid.dates(yearMonth, weekStartDay).forEachIndexed { index, date ->
                    days.addView(TextView(this@CalendarModuleActivity).apply {
                        text = date?.dayOfMonth?.toString().orEmpty()
                        gravity = Gravity.CENTER
                        textSize = 8f
                        val dateEvents = date?.let { renderedDate -> monthEvents.filter { event ->
                            event.year == renderedDate.year && event.month == renderedDate.monthValue && event.day == renderedDate.dayOfMonth
                        } }.orEmpty()
                        val hasEvent = dateEvents.isNotEmpty()
                        if (hasEvent) {
                            background = GradientDrawable().apply {
                                cornerRadius = dp(3).toFloat()
                                setColor(safeEventColor(dateEvents.first().color))
                            }
                            setTextColor(eventChipTextColor(dateEvents.first().color))
                        } else {
                            setTextColor(ContextCompat.getColor(this@CalendarModuleActivity, R.color.tb_calendar_muted))
                        }
                        layoutParams = GridLayout.LayoutParams(
                            GridLayout.spec(index / 7),
                            GridLayout.spec(index % 7, 1f),
                        ).apply {
                            width = 0
                            height = dp(17)
                        }
                    })
                }
                addView(days, LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.MATCH_PARENT,
                    LinearLayout.LayoutParams.WRAP_CONTENT,
                ).apply { topMargin = dp(4) })
                setOnClickListener {
                    visibleMonth = yearMonth
                    selectedDate = yearMonth.atDay(1)
                    viewMode = CalendarViewMode.MONTH
                    render()
                    loadDeviceCalendarData()
                }
            }
            grid.addView(cell.apply {
                layoutParams = gridCellLayoutParams((month - 1) % 3, (month - 1) / 3, dp(164))
            })
        }
    }

    private fun configureGrid(columns: Int, rows: Int): GridLayout = findViewById<GridLayout>(R.id.zeitklar_calendar_grid).apply {
        removeAllViews()
        columnCount = columns
        rowCount = rows
        this@CalendarModuleActivity.findViewById<FrameLayout>(R.id.zeitklar_calendar_event_overlay).removeAllViews()
    }

    private fun agendaDayCell(date: LocalDate, events: List<CalendarGridEvent>, compact: Boolean): LinearLayout = LinearLayout(this).apply {
        orientation = LinearLayout.VERTICAL
        setPadding(dp(4), dp(5), dp(4), dp(4))
        background = calendarCellBackground(
            isSelected = date == selectedDate,
        )
        addView(TextView(this@CalendarModuleActivity).apply {
            text = if (compact) date.dayOfMonth.toString() else date.format(DateTimeFormatter.ofPattern("EEEE, d. MMMM", Locale.getDefault()))
            setTypeface(typeface, Typeface.BOLD)
            gravity = if (compact) Gravity.START else Gravity.CENTER_HORIZONTAL
            textSize = if (compact) 12f else 18f
            setTextColor(ContextCompat.getColor(this@CalendarModuleActivity, R.color.tb_calendar_text))
        })
        if (events.isEmpty()) {
            addView(TextView(this@CalendarModuleActivity).apply {
                text = getString(R.string.zeitklar_calendar_day_empty)
                textSize = if (compact) 9f else 14f
                setTextColor(ContextCompat.getColor(this@CalendarModuleActivity, R.color.tb_calendar_muted))
                setPadding(0, dp(8), 0, 0)
            })
        } else {
            events.sortedWith(compareBy<CalendarGridEvent> { it.lane }.thenBy { !it.allDay }.thenBy { it.hour }.thenBy { it.minute })
                .take(if (compact) 10 else 18)
                .forEach { event -> addView(eventChip(event)) }
        }
        setOnClickListener {
            selectedDate = date
            render()
            showDayPlan(date)
        }
    }

    private fun eventsForDate(events: List<CalendarGridEvent>, date: LocalDate): List<CalendarGridEvent> = events.filter {
        it.year == date.year && it.month == date.monthValue && it.day == date.dayOfMonth
    }

    private fun eventChip(event: CalendarGridEvent): TextView = TextView(this).apply {
        text = buildString {
            if (!event.allDay && event.startsToday) append("%02d:%02d ".format(event.hour, event.minute))
            append("${calendarBadge(event.calendarName)} · ")
            append(event.title)
        }
        ellipsize = TextUtils.TruncateAt.END
        maxLines = 1
        gravity = Gravity.CENTER_VERTICAL
        setPadding(dp(2), 0, dp(2), 0)
        textSize = 9f
        setTypeface(typeface, Typeface.BOLD)
        setTextColor(eventChipTextColor(event.color))
        background = GradientDrawable().apply {
            val radius = dp(4).toFloat()
            // Square inner ends make successive pieces of a multi-day event
            // look like one bar despite the seven-column phone grid.
            cornerRadii = floatArrayOf(
                if (event.startsToday) radius else 0f,
                if (event.startsToday) radius else 0f,
                if (event.continuesAfter) 0f else radius,
                if (event.continuesAfter) 0f else radius,
                if (event.continuesAfter) 0f else radius,
                if (event.continuesAfter) 0f else radius,
                if (event.startsToday) radius else 0f,
                if (event.startsToday) radius else 0f,
            )
            setColor(eventFill(event.color))
            setStroke(dp(1), safeEventColor(event.color))
        }
        layoutParams = LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT,
            dp(18),
        ).apply {
            topMargin = dp(1)
        }
        isFocusable = true
        contentDescription = eventDescription(event)
        if (viewMode == CalendarViewMode.DAY) setOnClickListener { editDayEvent(event, selectedDate) }
    }

    private fun eventDescription(event: CalendarGridEvent): String = listOf(
        event.title, event.calendarName, LocalDate.of(event.year, event.month, event.day).toString(),
        if (event.allDay) getString(R.string.zeitklar_calendar_create_all_day) else "%02d:%02d".format(event.hour, event.minute),
        event.endDate.toString(), "%02d:%02d".format(event.endHour, event.endMinute), event.location,
    ).filter { it.isNotBlank() }.joinToString(", ")

    private fun calendarBadge(calendarName: String): String {
        val cleaned = calendarName.trim()
        if (cleaned.isBlank()) return "K"
        return cleaned
            .split(Regex("\\s+"))
            .filter { it.isNotBlank() }
            .take(2)
            .joinToString("") { word -> word.first().uppercaseChar().toString() }
            .take(2)
    }

    private fun gridCellLayoutParams(column: Int, row: Int, height: Int): GridLayout.LayoutParams =
        GridLayout.LayoutParams(
            GridLayout.spec(row),
            GridLayout.spec(column, 1f),
        ).apply {
            width = 0
            // The caller passes an already converted pixel height. Converting
            // it to dp a second time would make the scrollable month raster
            // overflow on high-density phones.
            this.height = height
            setMargins(0, 0, 0, 0)
        }

    private fun calendarCellBackground(isSelected: Boolean): GradientDrawable =
        GradientDrawable().apply {
            // Quiet cells leave calendar colors to the appointments; selection remains visible.
            setColor(ContextCompat.getColor(this@CalendarModuleActivity,
                if (isSelected) R.color.tb_calendar_accent_soft else R.color.tb_calendar_surface))
            setStroke(dp(1), ContextCompat.getColor(this@CalendarModuleActivity, R.color.tb_calendar_line))
        }

    private fun eventFill(value: String): Int = ColorUtils.blendARGB(
        safeEventColor(value) or Color.BLACK, ContextCompat.getColor(this, R.color.tb_calendar_surface), 0.85f,
    )

    private fun safeEventColor(value: String): Int = runCatching { Color.parseColor(value) }.getOrDefault(
        ContextCompat.getColor(this, R.color.tb_calendar_accent),
    )

    private fun eventChipTextColor(value: String): Int {
        val color = safeEventColor(value)
        return if (ColorUtils.calculateContrast(color or Color.BLACK, eventFill(value)) >= 4.5) color or Color.BLACK
        else ContextCompat.getColor(this, R.color.tb_calendar_text)
    }

    private fun ensureDeviceCalendarAccess(force: Boolean = false) {
        if (DeviceCalendarStore.hasReadAccess(this)) {
            loadDeviceCalendarData(force = force)
        } else if (!calendarPermissionRequested) {
            calendarPermissionRequested = true
            calendarPermissionLauncher.launch(Manifest.permission.READ_CALENDAR)
        }
    }

    private fun loadDeviceCalendarData(force: Boolean = false) {
        val range = deviceEventRange()
        if (!force && loadingDeviceRangeKey == range.key) return
        deviceLoadJob?.cancel()
        loadingDeviceRangeKey = ""
        if (!force && loadedDeviceRangeKey == range.key) return
        loadingDeviceRangeKey = range.key
        val zone = calendarZone
        deviceLoadJob = lifecycleScope.launch {
            try {
                // Coalesce rapid swipes and serialize provider calls. Cancelling an
                // obsolete request must never apply its result to the new month.
                delay(DEVICE_LOAD_DEBOUNCE_MS)
                val (calendars, events) = withContext(Dispatchers.IO) {
                    deviceLoadMutex.withLock {
                        DeviceCalendarStore.calendars(applicationContext, includeHidden = true) to
                            DeviceCalendarStore.eventsForRange(applicationContext, range.start, range.endExclusive, zone)
                    }
                }
                if (deviceEventRange().key == range.key) {
                    deviceEvents = events
                    deviceCalendars = calendars
                    loadedDeviceRangeKey = range.key
                    render()
                }
            } catch (error: CancellationException) {
                throw error
            } catch (_: Exception) {
                Toast.makeText(this@CalendarModuleActivity, R.string.generic_loading_error, Toast.LENGTH_SHORT).show()
            } finally {
                if (deviceLoadJob == coroutineContext[Job]) loadingDeviceRangeKey = ""
            }
        }
    }

    private fun deviceEventRange(): CalendarDateRange {
        val range = when (viewMode) {
        CalendarViewMode.MONTH -> CalendarDateRange(
            start = visibleMonth.atDay(1),
            endExclusive = visibleMonth.plusMonths(1).atDay(1),
            key = "month:$visibleMonth",
        )
        CalendarViewMode.WEEK -> {
            val start = startOfWeek(selectedDate)
            CalendarDateRange(start, start.plusWeeks(1), "week:$start")
        }
        CalendarViewMode.DAY -> CalendarDateRange(selectedDate, selectedDate.plusDays(1), "day:$selectedDate")
        CalendarViewMode.YEAR -> {
            val start = LocalDate.of(selectedDate.year, 1, 1)
            CalendarDateRange(start, start.plusYears(1), "year:${selectedDate.year}")
        }
        }
        return range.copy(key = "${range.key}:${calendarZone.id}")
    }

    private fun calendarGridEvents(applyFilters: Boolean = true): List<CalendarGridEvent> {
        val mappedDesktopIds = deviceCalendars.mapNotNull {
            calendarViewPreferences.getString("desktop_binding_${it.id}", null)
        }.toSet()
        val desktopEvents = store.calendarEvents(plannerState).filter { it.calendarId !in mappedDesktopIds }.map {
            val start = it.startEpochMillis?.let { epoch -> java.time.Instant.ofEpochMilli(epoch).atZone(calendarZone).toLocalDateTime() }
                ?: java.time.LocalDateTime.of(it.year, it.month, it.day, it.hour, it.minute)
            val end = it.endEpochMillis?.let { epoch -> java.time.Instant.ofEpochMilli(epoch).atZone(calendarZone).toLocalDateTime() }
                ?: java.time.LocalDateTime.of(it.endYear, it.endMonth, it.endDay, it.endHour, it.endMinute)
            CalendarGridEvent(
                id = "desktop:${it.id}",
                title = it.title,
                calendarName = it.calendarName,
                color = it.color,
                allDay = it.allDay,
                year = start.year, month = start.monthValue, day = start.dayOfMonth,
                hour = start.hour, minute = start.minute,
                endDate = end.toLocalDate(), endHour = end.hour, endMinute = end.minute,
                calendarKey = "desktop:${it.calendarId}",
                location = it.location,
                desktopEvent = it,
            )
        }
        val phoneEvents = deviceEvents.map {
            CalendarGridEvent(
                id = "phone:${it.id}",
                title = it.title,
                calendarName = it.calendarName,
                color = it.color,
                allDay = it.allDay,
                year = it.start.year,
                month = it.start.monthValue,
                day = it.start.dayOfMonth,
                hour = it.start.hour,
                minute = it.start.minute,
                endDate = it.end.toLocalDate(),
                endHour = it.end.hour,
                endMinute = it.end.minute,
                calendarKey = "phone:${it.calendarId}",
                location = it.location,
                deviceEventId = it.id,
            )
        }
        // Prefer the provider that runs on the phone when it represents the
        // same event as the desktop projection: Android supplies the exact
        // local calendar colour the user has chosen.
        val range = deviceEventRange()
        val expandedEvents = (phoneEvents + desktopEvents)
            .filter { it.endDate >= range.start && LocalDate.of(it.year, it.month, it.day) < range.endExclusive }
            .distinctBy {
                listOf(
                    it.id, it.calendarKey, it.year, it.month, it.day,
                    it.hour, it.minute, it.endDate, it.endHour, it.endMinute, it.allDay,
                ).joinToString("|")
            }
            .flatMap(::expandMultiDayEvent)
            .filter {
                val date = LocalDate.of(it.year, it.month, it.day)
                date >= range.start && date < range.endExclusive
            }
        return assignEventLanes(
            if (applyFilters) expandedEvents.filter(::matchesActiveFilters) else expandedEvents,
        )
    }

    private fun matchesActiveFilters(event: CalendarGridEvent): Boolean {
        if (event.calendarKey in hiddenCalendarNames) return false
        return ModuleSettingsTransfer.matches(calendarQuery, event.title, event.calendarName, event.location)
    }

    private fun normalizeCalendarName(value: String): String = value
        .trim()
        .lowercase(Locale.getDefault())
        .replace(Regex("\\s+"), " ")

    private val weekStartDay: DayOfWeek
        get() = if (calendarViewPreferences.getBoolean(KEY_WEEK_STARTS_SUNDAY, false)) DayOfWeek.SUNDAY else DayOfWeek.MONDAY

    private val isLargeMonthText: Boolean
        get() = calendarViewPreferences.getBoolean(KEY_LARGE_MONTH_TEXT, false)

    private fun startOfWeek(date: LocalDate): LocalDate =
        date.minusDays(((date.dayOfWeek.value - weekStartDay.value + 7) % 7).toLong())

    private fun expandMultiDayEvent(event: CalendarGridEvent): List<CalendarGridEvent> {
        val firstDay = LocalDate.of(event.year, event.month, event.day)
        var lastDay = event.endDate
        if (event.allDay || (event.endHour == 0 && event.endMinute == 0 && lastDay.isAfter(firstDay))) {
            lastDay = lastDay.minusDays(1)
        }
        if (lastDay.isBefore(firstDay)) lastDay = firstDay
        val range = deviceEventRange()
        return CalendarMonthGrid.visibleDates(firstDay, lastDay, range.start, range.endExclusive).map { date ->
            event.copy(
                id = "${event.id}:$date",
                year = date.year,
                month = date.monthValue,
                day = date.dayOfMonth,
                allDay = event.allDay || (date > firstDay && date < lastDay),
                continues = date > firstDay,
                startsToday = date == firstDay,
                continuesAfter = date < lastDay,
            )
        }
    }

    /**
     * Calendar cells are rendered independently, therefore a normal sort
     * would make a long appointment jump up and down from one day to another.
     * Reserve the first free lane for each complete event series instead.
     */
    private fun assignEventLanes(events: List<CalendarGridEvent>): List<CalendarGridEvent> {
        val occupied = mutableMapOf<LocalDate, MutableSet<Int>>()
        val lanes = mutableMapOf<String, Int>()
        events.groupBy { it.seriesId }
            .toList()
            .sortedBy { (_, segments) ->
                segments.minOf { LocalDate.of(it.year, it.month, it.day) }
            }
            .forEach { (seriesId, segments) ->
                val dates = segments.map { LocalDate.of(it.year, it.month, it.day) }
                var lane = 0
                while (dates.any { date -> lane in occupied[date].orEmpty() }) lane += 1
                lanes[seriesId] = lane
                dates.forEach { date -> occupied.getOrPut(date) { mutableSetOf() }.add(lane) }
            }
        return events.map { event -> event.copy(lane = lanes[event.seriesId] ?: 0) }
    }

    private fun openCalendarEventEditor(date: LocalDate) {
        calendarEventEditorLauncher.launch(CalendarEventEditorActivity.intent(this, date))
    }

    private fun dayPlanEntries(date: LocalDate): List<CalendarDayPlanEntry> =
        eventsForDate(renderedEvents, date).map { event ->
            CalendarDayPlanEntry(
                event.id, event.title, event.calendarName, safeEventColor(event.color), event.allDay,
                if (event.continues) 0 else event.hour * MINUTES_PER_HOUR + event.minute,
                if (event.continuesAfter || event.endDate.isAfter(date)) MINUTES_PER_DAY else event.endHour * MINUTES_PER_HOUR + event.endMinute,
                event.location,
            )
        }

    private fun editDayEvent(event: CalendarGridEvent, date: LocalDate) {
        val calendar = deviceCalendars.firstOrNull { "phone:${it.id}" == event.calendarKey }
        when {
            event.deviceEventId != null && calendar?.writable != false ->
                calendarEventEditorLauncher.launch(CalendarEventEditorActivity.deviceIntent(this, event.deviceEventId))
            event.desktopEvent?.itemId?.isNotBlank() == true -> selectDesktopForEdit(event.desktopEvent)
            else -> showDayOverview(date, listOf(event))
        }
    }

    private fun showDayPlan(date: LocalDate) {
        dayPlanDialog?.dismiss()
        dayPlanDate = date
        val view = CalendarDayPlanView(this, date, dayPlanEntries(date), onOpen = { id ->
            eventsForDate(renderedEvents, date).firstOrNull { it.id == id }?.let { editDayEvent(it, date) }
        }, onCreate = { openCalendarEventEditor(date) }, onClose = { dayPlanDialog?.dismiss() })
        dayPlanView = view
        // AlertDialog's custom panel measures weighted children as wrap-content and collapses the timeline.
        dayPlanDialog = androidx.appcompat.app.AppCompatDialog(this).apply {
                supportRequestWindowFeature(android.view.Window.FEATURE_NO_TITLE)
                setContentView(view, android.view.ViewGroup.LayoutParams(
                    android.view.ViewGroup.LayoutParams.MATCH_PARENT,
                    android.view.ViewGroup.LayoutParams.MATCH_PARENT,
                ))
                window?.setBackgroundDrawable(android.graphics.drawable.ColorDrawable(
                    ContextCompat.getColor(this@CalendarModuleActivity, R.color.tb_calendar_surface),
                ))
                val activeDialog = this
                setOnDismissListener {
                    if (dayPlanDialog === activeDialog) {
                        dayPlanDate = null
                        dayPlanView = null
                        dayPlanDialog = null
                    }
                }
                show()
                window?.setLayout(
                    android.view.ViewGroup.LayoutParams.MATCH_PARENT,
                    android.view.ViewGroup.LayoutParams.MATCH_PARENT,
                )
            }
    }

    /**
     * The monthly grid deliberately remains compact. Tapping a day opens this
     * readable agenda instead of forcing event titles into seven narrow columns.
     */
    private fun showDayOverview(date: LocalDate, events: List<CalendarGridEvent>) {
        val scroll = ScrollView(this)
        val content = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(4), dp(2), dp(4), dp(2))
        }
        if (events.isEmpty()) {
            content.addView(TextView(this).apply {
                text = getString(R.string.zeitklar_calendar_day_empty)
                setTextAppearance(com.google.android.material.R.style.TextAppearance_Material3_BodyLarge)
                setTextColor(ContextCompat.getColor(this@CalendarModuleActivity, R.color.tb_calendar_muted))
                setPadding(dp(12), dp(18), dp(12), dp(18))
            })
        } else {
            events.sortedWith(compareBy<CalendarGridEvent> { !it.allDay }.thenBy { it.hour }.thenBy { it.minute })
                .forEach { event ->
                    content.addView(dayOverviewCard(event), LinearLayout.LayoutParams(
                        LinearLayout.LayoutParams.MATCH_PARENT,
                        LinearLayout.LayoutParams.WRAP_CONTENT,
                    ).apply { bottomMargin = dp(8) })
                }
        }
        scroll.addView(content)
        val dateText = date.format(DateTimeFormatter.ofPattern("EEEE, d. MMMM", Locale.getDefault()))
        eventDetailsDialog?.dismiss()
        eventDetailsDialog = MaterialAlertDialogBuilder(this)
            .setTitle("${getString(R.string.zeitklar_calendar_day_overview)} · $dateText")
            .setView(scroll)
            .setNegativeButton(android.R.string.cancel, null)
            .setPositiveButton(R.string.zeitklar_calendar_day_create) { _, _ ->
                openCalendarEventEditor(date)
            }
            .show().apply {
                val activeDialog = this
                setOnDismissListener { if (eventDetailsDialog === activeDialog) eventDetailsDialog = null }
            }
    }

    private fun dayOverviewCard(event: CalendarGridEvent): MaterialCardView = MaterialCardView(this).apply {
        setCardBackgroundColor(ContextCompat.getColor(this@CalendarModuleActivity, R.color.tb_calendar_surface))
        strokeColor = safeEventColor(event.color)
        strokeWidth = dp(2)
        radius = dp(16).toFloat()
        cardElevation = 0f
        addView(LinearLayout(this@CalendarModuleActivity).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(14), dp(12), dp(14), dp(12))
            addView(TextView(this@CalendarModuleActivity).apply {
                text = event.title
                setTextAppearance(com.google.android.material.R.style.TextAppearance_Material3_TitleMedium)
                setTextColor(ContextCompat.getColor(this@CalendarModuleActivity, R.color.tb_calendar_text))
            })
            addView(TextView(this@CalendarModuleActivity).apply {
                val extendsPastDay = event.endDate.isAfter(LocalDate.of(event.year, event.month, event.day))
                val time = when {
                    event.allDay -> getString(R.string.zeitklar_calendar_all_day)
                    else -> "%02d:%02d – %02d:%02d".format(
                        if (event.continues) 0 else event.hour, if (event.continues) 0 else event.minute,
                        if (extendsPastDay) HOURS_PER_DAY else event.endHour, if (extendsPastDay) 0 else event.endMinute,
                    )
                }
                text = listOf(time, event.calendarName, event.location).filter { it.isNotBlank() }.joinToString(" · ")
                setTextAppearance(com.google.android.material.R.style.TextAppearance_Material3_BodyMedium)
                setTextColor(ContextCompat.getColor(this@CalendarModuleActivity, R.color.tb_calendar_muted))
                setPadding(0, dp(5), 0, 0)
            })
            event.desktopEvent?.takeIf { it.itemId.isNotBlank() }?.let { source ->
                addView(MaterialButton(this@CalendarModuleActivity).apply {
                    text = getString(R.string.tb_connect_desktop_event_edit)
                    setOnClickListener {
                        eventDetailsDialog?.dismiss()
                        selectDesktopForEdit(source)
                    }
                })
            }
            event.deviceEventId?.let { id ->
                addView(MaterialButton(this@CalendarModuleActivity).apply {
                    text = getString(R.string.tb_connect_event_edit_title)
                    setOnClickListener {
                        eventDetailsDialog?.dismiss()
                        calendarEventEditorLauncher.launch(CalendarEventEditorActivity.deviceIntent(this@CalendarModuleActivity, id))
                    }
                })
            }
        })
    }

    private fun selectDesktopForEdit(event: MobileCalendarEvent) {
        val connections = store.load().connections.filter { it.mode == PlannerConnection.Mode.MODULE_BRIDGE }
        if (connections.isEmpty()) {
            Toast.makeText(this, R.string.tb_connect_desktop_edit_local_required, Toast.LENGTH_LONG).show()
            return
        }
        MaterialAlertDialogBuilder(this)
            .setTitle(R.string.tb_connect_desktop_event_edit)
            .setItems(connections.map { it.name }.toTypedArray()) { _, index ->
                val connection = connections[index]
                lifecycleScope.launch {
                    val result = withContext(Dispatchers.IO) {
                        runCatching { PlannerSyncClient.editDesktopCalendar(applicationContext, connection, JSONObject()
                            .put("action", "read").put("calendarId", event.calendarId).put("itemId", event.itemId)) }
                    }
                    result.onSuccess { response ->
                        calendarEventEditorLauncher.launch(CalendarEventEditorActivity.desktopIntent(
                            this@CalendarModuleActivity, connection.id, response.getJSONObject("event"), response.getString("editVersion"),
                        ))
                    }.onFailure {
                        MaterialAlertDialogBuilder(this@CalendarModuleActivity)
                            .setMessage(it.message ?: getString(R.string.zeitklar_calendar_create_failed))
                            .setPositiveButton(android.R.string.ok, null).show()
                    }
                }
            }.show()
    }

    private fun dp(value: Int): Int = (value * resources.displayMetrics.density).toInt()

    private fun showSyncProblems() {
        showCalendarSyncProblems(this, nativeCalendar, plannerState.connections, deviceCalendars,
            calendarSetupPending, nativeCalendarFailure, onSettings = { showCalendarFilterDialog() })
    }

    private suspend fun synchronizeNativeCalendar(): NativeCalendarSyncResult? {
        val report = try {
            withContext(Dispatchers.IO) { nativeCalendar.synchronizeAll() }
        } catch (cancelled: CancellationException) {
            throw cancelled
        } catch (_: Exception) {
            nativeCalendarFailure = true
            invalidateOptionsMenu()
            return null
        }
        nativeCalendarFailure = report.failures > 0 || report.conflicts > 0
        invalidateOptionsMenu()
        loadDeviceCalendarData(force = true)
        checkGoogleCalendarSetup()
        return report
    }

    private fun synchronize(showResult: Boolean, afterEdit: Boolean = false) {
        if (showResult && !manualSyncFeedback.begin()) return
        showSynchronizationResult = showSynchronizationResult || showResult
        showDesktopSynchronizationResult = showDesktopSynchronizationResult || showResult
        calendarSyncLoop.request(afterRunning = afterEdit || showResult)
        desktopSyncLoop.request(afterRunning = afterEdit || showResult)
    }

    private suspend fun performSynchronization() {
        val showResult = showSynchronizationResult
        showSynchronizationResult = false
        val report = synchronizeNativeCalendar()
        if (showResult) {
            val status = when {
                report == null || report.failures > 0 || report.conflicts > 0 -> SyncPartStatus.FAILED
                report.calendars == 0 -> SyncPartStatus.SKIPPED
                else -> SyncPartStatus.SUCCESS
            }
            val message = when {
                report == null -> getString(R.string.tb_sync_native_failed)
                report.calendars == 0 && status == SyncPartStatus.SKIPPED -> getString(R.string.tb_sync_no_native)
                else -> getString(R.string.tb_native_calendar_sync_report,
                    report.uploaded, report.downloaded, report.conflicts, report.failures)
            }
            manualSyncFeedback.finish("calendar", SyncPart(status, message))
        }
    }

    private suspend fun performDesktopSynchronization() {
        val showResult = showDesktopSynchronizationResult
        showDesktopSynchronizationResult = false
        if (plannerState.connections.isEmpty()) {
            if (showResult) manualSyncFeedback.finish("desktop",
                SyncPart(SyncPartStatus.SKIPPED, getString(R.string.tb_sync_no_desktop)))
            return
        }
        val (latest, failures) = try {
            withContext(Dispatchers.IO) { synchronizeDesktopConnections() }
        } catch (cancelled: CancellationException) {
            throw cancelled
        } catch (_: Exception) {
            nativeCalendarFailure = true
            invalidateOptionsMenu()
            if (showResult) manualSyncFeedback.finish("desktop",
                SyncPart(SyncPartStatus.FAILED, getString(R.string.tb_sync_desktop_failed)))
            return
        }
        plannerState = latest
        render()
        checkGoogleCalendarSetup()
        if (showResult) {
            val details = latest.connections.joinToString("\n") { connection ->
                getString(if (connection.lastError.isNullOrBlank()) R.string.tb_sync_peer_ok else R.string.tb_sync_peer_failed,
                    connection.name)
            }
            manualSyncFeedback.finish("desktop", SyncPart(
                if (failures == 0) SyncPartStatus.SUCCESS else SyncPartStatus.FAILED, details,
            ))
        }
    }

    // Legacy transports may fail through IO, JSON or authentication adapters; contain the error at this boundary.
    @Suppress("TooGenericExceptionCaught")
    private fun synchronizeDesktopConnections(): Pair<PlannerMobileState, Int> {
        var latest = store.load()
        var failures = 0
        latest.connections.forEach { connection ->
            val attemptedAt = now()
            try {
                val result = PlannerSyncClient.sync(applicationContext, latest, connection)
                val moduleFailure = result.moduleFailures.isNotEmpty()
                if (moduleFailure) failures++
                latest = store.mergeModuleSync(
                    store.mergeRemotePayload(latest, result.remotePayload),
                    result,
                ).withConnection(
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

    private fun formatTimestamp(value: String): String = PlannerMobileStore.parseTimestamp(value)
        ?.let { DateTimeFormatter.ofPattern("dd.MM. HH:mm").withZone(java.time.ZoneId.systemDefault()).format(it) }
        ?: getString(R.string.zeitklar_never)

    companion object {
        private const val MENU_NEW_EVENT = 1
        private const val MENU_SYNC = 2
        private const val MENU_ACCOUNTS = 3
        private const val MENU_SEARCH = 4
        private const val MENU_FILTER = 5
        private const val MENU_DISPLAY_OPTIONS = 6
        private const val MENU_GOOGLE_SETUP = 7
        private const val MENU_CURRENT_DATE = 8
        private const val MENU_CONNECTION_STATUS = 9
        private const val MAX_VISIBLE_EVENT_LANES = 4
        private const val EVENT_BAR_HEIGHT_DP = 18
        private const val DAY_NUMBER_SPACE_DP = 32
        private const val PROVIDER_RELOAD_DEBOUNCE_MS = 200L
        private const val HOURS_PER_DAY = 24
        private const val MINUTES_PER_HOUR = 60
        private const val MINUTES_PER_DAY = HOURS_PER_DAY * MINUTES_PER_HOUR
        private const val DEVICE_LOAD_DEBOUNCE_MS = 100L
        private const val CALENDAR_VIEW_PREFERENCES = "tb_connect_calendar_view"
        private const val KEY_CALENDAR_QUERY = "calendar_query"
        private const val KEY_HIDDEN_CALENDAR_NAMES = "hidden_calendar_ids"
        private const val KEY_WEEK_STARTS_SUNDAY = "week_starts_sunday"
        private const val KEY_LARGE_MONTH_TEXT = "large_month_text"

        fun intent(context: Context): Intent = Intent(context, CalendarModuleActivity::class.java)
    }
}

private enum class CalendarViewMode(val labelRes: Int) {
    YEAR(R.string.zeitklar_calendar_view_year),
    MONTH(R.string.zeitklar_calendar_view_month),
    WEEK(R.string.zeitklar_calendar_view_week),
    DAY(R.string.zeitklar_calendar_view_day),
}

private data class CalendarDateRange(
    val start: LocalDate,
    val endExclusive: LocalDate,
    val key: String,
)

private data class CalendarGridEvent(
    val id: String,
    val title: String,
    val calendarName: String,
    val color: String,
    val allDay: Boolean,
    val year: Int,
    val month: Int,
    val day: Int,
    val hour: Int,
    val minute: Int,
    val endDate: LocalDate,
    val endHour: Int,
    val endMinute: Int,
    val continues: Boolean = false,
    val startsToday: Boolean = true,
    val continuesAfter: Boolean = false,
    val lane: Int = 0,
    val seriesId: String = id,
    val calendarKey: String = "",
    val location: String = "",
    val desktopEvent: MobileCalendarEvent? = null,
    val deviceEventId: Long? = null,
)
