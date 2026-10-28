package com.fsck.k9.ui.zeitklar

import android.graphics.Bitmap
import android.graphics.Canvas
import android.os.Bundle
import android.view.View
import android.widget.TextView
import assertk.assertThat
import assertk.assertions.isEqualTo
import com.fsck.k9.controller.push.PushController
import com.fsck.k9.ui.R
import com.fsck.k9.ui.base.AppLanguageManager
import com.google.android.material.bottomnavigation.BottomNavigationView
import com.google.android.material.button.MaterialButtonToggleGroup
import java.io.File
import java.time.LocalDateTime
import net.thunderbird.core.android.testing.RobolectricTest
import net.thunderbird.core.ui.theme.api.Theme
import net.thunderbird.core.ui.theme.manager.ThemeManager
import net.thunderbird.feature.calendar.NativeGoogleCalendar
import org.junit.After
import org.junit.Test
import org.koin.core.context.startKoin
import org.koin.core.context.stopKoin
import org.koin.dsl.module
import org.mockito.kotlin.doReturn
import org.mockito.kotlin.mock
import org.robolectric.Robolectric
import org.robolectric.Shadows.shadowOf
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

/** Actual CalendarModuleActivity rendering, isolated from real accounts and providers. */
@Config(qualifiers = "de-rDE-w393dp-h852dp-mdpi", sdk = [35])
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class CalendarAppearanceTest : RobolectricTest() {
    @After
    fun tearDown() = stopKoin()

    @Test
    fun lightCalendarHasDirectViewsAndTodayShortcutWithSyntheticAppointments() = renderCalendar(false)

    @Test
    @Config(qualifiers = "de-rDE-w393dp-h852dp-night-mdpi")
    fun darkCalendarKeepsTheSameNavigationAndReadableLayout() = renderCalendar(true)

    private fun renderCalendar(dark: Boolean) {
        installDependencies(dark)
        val saved = Bundle().apply {
            putString("calendar_mode", "MONTH")
            putString("calendar_date", "2026-10-24")
        }
        val controller = Robolectric.buildActivity(CalendarModuleActivity::class.java).create(saved).start().visible()
        val testSubject = controller.get()
        val field = CalendarModuleActivity::class.java.getDeclaredField("deviceEvents").apply { isAccessible = true }
        val appointments = listOf(
            event(1, "Projektbesprechung", "#4169D9", 24, 9),
            event(2, "Mittagspause", "#21866E", 24, 12),
            event(3, "Sport", "#C95C44", 24, 18),
            event(4, "Planung", "#8855BA", 20, 10),
            event(5, "Mehrtagestest", "#21866E", 20, 9).copy(end = java.time.LocalDateTime.of(2026, 10, 22, 17, 0)),
        )
        field.set(testSubject, appointments)
        val render = CalendarModuleActivity::class.java.getDeclaredMethod("render").apply { isAccessible = true }
        render.invoke(testSubject)
        val navigation = testSubject.findViewById<BottomNavigationView>(
            R.id.zeitklar_module_navigation,
        )
        val planner = testSubject.layoutInflater.inflate(R.layout.zeitklar_daily_planner_two, null)
            .findViewById<BottomNavigationView>(R.id.zeitklar_module_navigation)
        for (state in listOf(intArrayOf(android.R.attr.state_enabled, android.R.attr.state_checked),
            intArrayOf(android.R.attr.state_enabled), intArrayOf())) {
            assertThat(planner.itemIconTintList!!.getColorForState(state, 0))
                .isEqualTo(navigation.itemIconTintList!!.getColorForState(state, 0))
            assertThat(planner.itemTextColor!!.getColorForState(state, 0))
                .isEqualTo(navigation.itemTextColor!!.getColorForState(state, 0))
        }
        val modes = testSubject.findViewById<MaterialButtonToggleGroup>(R.id.tb_calendar_view_modes)
        assertThat(modes.checkedButtonId).isEqualTo(R.id.tb_calendar_mode_month)
        assertThat((modes.parent.parent as View).visibility).isEqualTo(View.GONE)
        checkCalendarSemantics(testSubject)
        capture(testSubject.findViewById(R.id.coordinator_layout), "month", dark)
        for ((id, name) in listOf(R.id.tb_calendar_mode_day to "day", R.id.tb_calendar_mode_week to "week",
            R.id.tb_calendar_mode_year to "year")) {
            testSubject.findViewById<View>(id).performClick()
            val pending = CalendarModuleActivity::class.java.getDeclaredField("deviceLoadJob").apply {
                isAccessible = true
            }
            (pending.get(testSubject) as? kotlinx.coroutines.Job)?.cancel()
            field.set(testSubject, appointments)
            render.invoke(testSubject)
            assertThat(modes.checkedButtonId).isEqualTo(id)
            val title = testSubject.findViewById<TextView>(R.id.zeitklar_calendar_month_title)
            assertThat(title.text.toString().contains("Heute")).isEqualTo(false)
            capture(testSubject.findViewById(R.id.coordinator_layout), name, dark)
            if (name == "day") {
                val scroll = testSubject.findViewById<androidx.core.widget.NestedScrollView>(R.id.zeitklar_calendar_scroll)
                assertThat(scroll.getChildAt(0).height <= scroll.height).isEqualTo(true)
                val appointment = descendants(scroll).first {
                    it.isClickable && it.contentDescription?.contains("Sport") == true
                }
                appointment.performClick()
                val editor = shadowOf(testSubject).nextStartedActivityForResult.intent
                assertThat(editor.getLongExtra("deviceEventId", -1)).isEqualTo(3L)
            }
        }
        controller.stop().destroy()
    }

    private fun checkCalendarSemantics(testSubject: CalendarModuleActivity) {
        val actionMenu = androidx.appcompat.view.menu.MenuBuilder(testSubject)
        testSubject.onCreateOptionsMenu(actionMenu)
        assertThat(actionMenu.size()).isEqualTo(3)
        val rows = CalendarModuleActivity::class.java.getDeclaredField("renderedEvents").apply {
            isAccessible = true
        }.get(testSubject) as List<*>
        fun property(event: Any, name: String) = event.javaClass.getDeclaredField(name).apply {
            isAccessible = true
        }.get(event)
        val middle = rows.filterNotNull().first {
            property(it, "title") == "Mehrtagestest" && property(it, "day") == 21
        }
        assertThat(property(middle, "allDay")).isEqualTo(true)
        for (day in listOf(20, 22)) {
            val boundary = rows.filterNotNull().first {
                property(it, "title") == "Mehrtagestest" && property(it, "day") == day
            }
            assertThat(property(boundary, "allDay")).isEqualTo(false)
        }
        CalendarModuleActivity::class.java.getDeclaredField("nativeCalendarFailure").apply {
            isAccessible = true
            set(testSubject, true)
        }
        val warningMenu = androidx.appcompat.view.menu.MenuBuilder(testSubject)
        testSubject.onCreateOptionsMenu(warningMenu)
        assertThat(warningMenu.size()).isEqualTo(3)
        assertThat(warningMenu.findItem(9) == null).isEqualTo(true)
    }

    @Test
    fun addCalendarOpensEmbeddedGoogleSetupAndAccountsOverviewUsesExplicitSources() {
        installDependencies(false)
        val controller = Robolectric.buildActivity(CalendarAccountsActivity::class.java).create().start().visible()
        val testSubject = controller.get()
        CalendarAccountsActivity::class.java.getDeclaredField("sources").apply {
            isAccessible = true
            set(testSubject, listOf(MobileCalendarSource("fixture", "Projektkalender", "Google Calendar", "", false)))
        }
        CalendarAccountsActivity::class.java.getDeclaredMethod("renderImportedSources").apply {
            isAccessible = true
        }.invoke(testSubject)
        capture(testSubject.findViewById(R.id.coordinator_layout), "accounts", false)
        testSubject.findViewById<View>(R.id.zeitklar_calendar_add_account).performClick()
        var request: android.content.Intent? = null
        val deadline = System.nanoTime() + java.util.concurrent.TimeUnit.SECONDS.toNanos(3)
        while (request == null && System.nanoTime() < deadline) {
            shadowOf(android.os.Looper.getMainLooper()).idle()
            request = shadowOf(testSubject).nextStartedActivity
            if (request == null) Thread.sleep(10)
        }
        assertThat(request?.component?.className)
            .isEqualTo("net.thunderbird.feature.calendar.internal.NativeCalendarActivity")
        controller.stop().destroy()
    }

    @Test
    fun chosenCalendarViewSurvivesActivityRestart() {
        installDependencies(false)
        val first = Robolectric.buildActivity(CalendarModuleActivity::class.java).create().start().visible()
        capture(first.get().findViewById(R.id.tb_calendar_drawer), "drawer-closed", false)
        val menu = androidx.appcompat.view.menu.MenuBuilder(first.get())
        first.get().onOptionsItemSelected(menu.add(0, android.R.id.home, 0, "Menü"))
        val drawer = first.get().findViewById<androidx.drawerlayout.widget.DrawerLayout>(R.id.tb_calendar_drawer)
        // Robolectric has no continuously drawn window; advance DrawerLayout's real settling frames.
        repeat(60) {
            shadowOf(android.os.Looper.getMainLooper()).idleFor(java.time.Duration.ofMillis(16))
            drawer.computeScroll()
        }
        capture(drawer, "drawer", false)
        assertThat(drawer.isDrawerVisible(android.view.Gravity.START)).isEqualTo(true)
        val content = first.get().findViewById<android.widget.LinearLayout>(R.id.tb_calendar_drawer_content)
        for (index in 0 until content.childCount) {
            val button = content.getChildAt(index) as? com.google.android.material.button.MaterialButton ?: continue
            assertThat(button.text.any { it.isLetter() }).isEqualTo(true)
        }
        val week = content.findViewWithTag<com.google.android.material.button.MaterialButton>("WEEK")
        assertThat(week.text.isNotBlank()).isEqualTo(true)
        week.performClick()
        first.stop().destroy()
        val second = Robolectric.buildActivity(CalendarModuleActivity::class.java).create().start().visible()
        assertThat(second.get().findViewById<MaterialButtonToggleGroup>(R.id.tb_calendar_view_modes).checkedButtonId)
            .isEqualTo(R.id.tb_calendar_mode_week)
        second.stop().destroy()
    }

    @Test
    fun warningCanBeMutedForOneCalendarWithoutHidingAnother() {
        installDependencies(false, mapOf(7L to net.thunderbird.feature.calendar.CalendarSyncProblem.CONNECTION))
        val controller = Robolectric.buildActivity(CalendarModuleActivity::class.java).create().start().visible()
        val activity = controller.get()
        val rowMethod = CalendarModuleActivity::class.java.getDeclaredMethod(
            "calendarFilterRow", String::class.java, String::class.java,
            Set::class.java, Set::class.java, Map::class.java,
        ).apply { isAccessible = true }
        val muted = mutableSetOf<String>()
        val row = rowMethod.invoke(activity, "phone:7", "Testkalender", mutableSetOf<String>(), muted,
            mapOf(7L to net.thunderbird.feature.calendar.CalendarSyncProblem.CONNECTION)) as android.widget.LinearLayout
        val toggle = row.getChildAt(row.childCount - 1) as com.google.android.material.switchmaterial.SwitchMaterial
        toggle.isChecked = false
        assertThat(muted).isEqualTo(setOf("phone:7"))
        assertThat(row.getChildAt(1).visibility).isEqualTo(View.GONE)
        val second = rowMethod.invoke(activity, "phone:8", "Weiterer Testkalender", mutableSetOf<String>(), muted,
            mapOf(8L to net.thunderbird.feature.calendar.CalendarSyncProblem.CONNECTION)) as android.widget.LinearLayout
        val secondChoice = second.getChildAt(0) as androidx.appcompat.widget.AppCompatCheckBox
        assertThat(secondChoice.compoundDrawables[2] != null).isEqualTo(true)
        assertThat(second.getChildAt(1).visibility).isEqualTo(View.VISIBLE)
        controller.stop().destroy()
    }

    @Test
    fun dayTapOpensLargePlanAndUnabridgedAgenda() = renderDayPlan(false)

    @Test
    @Config(qualifiers = "de-rDE-w393dp-h852dp-night-mdpi")
    fun dayPlanKeepsTheSameDetailsInDarkTheme() = renderDayPlan(true)

    @Test
    @Config(qualifiers = "de-rDE-w852dp-h393dp-land-mdpi")
    fun landscapeDayDialogKeepsAVisibleTimeline() = renderDayPlan(false)

    private fun renderDayPlan(dark: Boolean) {
        installDependencies(dark)
        val saved = Bundle().apply {
            putString("calendar_mode", "MONTH")
            putString("calendar_date", "2026-10-24")
        }
        val controller = Robolectric.buildActivity(CalendarModuleActivity::class.java).create(saved).start().visible()
        val activity = controller.get()
        val appointments = dayPlanAppointments()
        CalendarModuleActivity::class.java.getDeclaredField("deviceEvents").apply {
            isAccessible = true
            set(activity, appointments)
        }
        CalendarModuleActivity::class.java.getDeclaredMethod("render").apply { isAccessible = true }.invoke(activity)
        val root = activity.findViewById<View>(R.id.coordinator_layout)
        val day = descendants(root).first {
            it.isClickable && it.contentDescription?.contains("2026-10-24") == true
        }
        day.performClick()
        val dialog = org.robolectric.shadows.ShadowDialog.getLatestDialog()
        val plan = dialog.window!!.decorView.findViewWithTag<CalendarDayPlanView>("day-plan-root")
        assertThat(plan != null).isEqualTo(true)
        val windowContent = dialog.window!!.decorView
        val viewportWidth = activity.resources.displayMetrics.widthPixels
        val viewportHeight = activity.resources.displayMetrics.heightPixels
        repeat(3) {
            windowContent.measure(View.MeasureSpec.makeMeasureSpec(viewportWidth, View.MeasureSpec.EXACTLY),
                View.MeasureSpec.makeMeasureSpec(viewportHeight, View.MeasureSpec.EXACTLY))
            windowContent.layout(0, 0, viewportWidth, viewportHeight)
            shadowOf(android.os.Looper.getMainLooper()).idle()
        }
        assertThat(plan.height >= viewportHeight - 48).isEqualTo(true)
        assertThat(plan.findViewWithTag<View>("day-plan-timeline").height > viewportHeight / 4).isEqualTo(true)
        capture(windowContent, "day-plan-timeline", dark, viewportWidth, viewportHeight)
        val timeline = plan.findViewWithTag<View>("day-plan-timeline")
        assertThat(descendants(timeline).any { it is android.widget.ScrollView }).isEqualTo(false)
        for (firstHour in listOf(0, 12)) {
            val column = plan.findViewWithTag<CalendarTimeGridColumn>("day-plan-hours-$firstHour")
            assertThat(column.height > 0).isEqualTo(true)
            assertThat(column.bottom <= timeline.height).isEqualTo(true)
            for (index in 0 until column.childCount) {
                val child = column.getChildAt(index)
                assertThat(child.top >= 0 && child.bottom <= column.height).isEqualTo(true)
            }
        }
        plan.findViewWithTag<View>("day-plan-agenda-tab").performClick()
        capture(windowContent, "day-plan-agenda", dark, viewportWidth, viewportHeight)
        val agenda = plan.findViewWithTag<View>("day-plan-agenda")
        val texts = descendants(agenda).filterIsInstance<TextView>()
        assertThat(texts.any { it.text.toString() == "Termin 25" }).isEqualTo(true)
        assertThat(texts.any { it.text.contains("Besprechungsraum") }).isEqualTo(true)
        assertThat(texts.any { it.text.toString() == "21:00 – 24:00" }).isEqualTo(true)
        assertThat(texts.any { it.text.toString() == "Ganztägiger Termin" }).isEqualTo(true)
        val title = texts.first { it.text.toString() == appointments.first().title }
        if (viewportWidth < viewportHeight) assertThat(title.layout.lineCount > 2).isEqualTo(true)
        assertThat((0 until title.layout.lineCount).all { title.layout.getEllipsisCount(it) == 0 }).isEqualTo(true)
        assertThat(title.ellipsize == null).isEqualTo(true)
        val changed = appointments.map { if (it.id == 25L) it.copy(title = "Aktualisierter Termin") else it }
        CalendarModuleActivity::class.java.getDeclaredField("deviceEvents").apply {
            isAccessible = true
            set(activity, changed)
        }
        CalendarModuleActivity::class.java.getDeclaredMethod("render").apply { isAccessible = true }.invoke(activity)
        assertThat(descendants(agenda).filterIsInstance<TextView>().any {
            it.text.toString() == "Aktualisierter Termin"
        }).isEqualTo(true)
        assertThat(agenda.visibility).isEqualTo(View.VISIBLE)
        val editable = descendants(agenda).first {
            it.isClickable && it.contentDescription?.contains("Aktualisierter Termin") == true
        }
        editable.performClick()
        val editor = shadowOf(activity).nextStartedActivityForResult.intent
        assertThat(editor.component!!.className).isEqualTo(CalendarEventEditorActivity::class.java.name)
        assertThat(editor.getLongExtra("deviceEventId", -1)).isEqualTo(25L)
        dialog.dismiss()
        controller.stop().destroy()
    }

    private fun dayPlanAppointments(): List<DeviceCalendarEvent> {
        val longTitle = "Vollständiger Termin mit ausführlicher Beschreibung, die auch bei schmaler Ansicht " +
            "weiterhin lesbar bleiben soll und in der Terminliste keinesfalls abgeschnitten werden darf."
        return (1L..25L).map { id ->
            event(id, if (id == 1L) longTitle else "Termin $id", "#4169D9", 24, 8 + (id % 12).toInt())
                .copy(location = "Besprechungsraum")
        } + listOf(
            event(26, "Bis Mitternacht", "#21866E", 24, 21)
                .copy(end = LocalDateTime.of(2026, 10, 25, 0, 0)),
            event(27, "Ganztägiger Termin", "#8855BA", 24, 0)
                .copy(allDay = true, end = LocalDateTime.of(2026, 10, 25, 0, 0)),
        )
    }

    private fun descendants(root: View): List<View> = buildList {
        add(root)
        if (root is android.view.ViewGroup) for (index in 0 until root.childCount) {
            addAll(descendants(root.getChildAt(index)))
        }
    }

    @Test
    fun warningRequiresAnUnmutedCalendarProblemAndOpensItsSettingsRow() {
        installDependencies(false, mapOf(7L to net.thunderbird.feature.calendar.CalendarSyncProblem.CONNECTION))
        val controller = Robolectric.buildActivity(CalendarModuleActivity::class.java).create().start().visible()
        val activity = controller.get()
        CalendarModuleActivity::class.java.getDeclaredField("deviceCalendars").apply {
            isAccessible = true
            set(activity, listOf(DeviceCalendar(7, "Betroffener Testkalender", "#4169D9", "Google", true),
                DeviceCalendar(8, "Unbetroffener Testkalender", "#21866E", "Google", true)))
        }
        val menu = androidx.appcompat.view.menu.MenuBuilder(activity)
        activity.onCreateOptionsMenu(menu)
        assertThat(menu.findItem(9) != null).isEqualTo(true)
        activity.onOptionsItemSelected(menu.findItem(9))
        val dialog = org.robolectric.shadows.ShadowDialog.getLatestDialog()
        val checks = descendants(dialog.window!!.decorView)
            .filterIsInstance<androidx.appcompat.widget.AppCompatCheckBox>()
        val affected = checks.first { it.text.contains("Betroffener") }
        val healthy = checks.first { it.text.contains("Unbetroffener") }
        assertThat(affected.compoundDrawables[2] != null).isEqualTo(true)
        assertThat(healthy.compoundDrawables[2] == null).isEqualTo(true)
        val toggle = descendants(affected.parent as View)
            .filterIsInstance<com.google.android.material.switchmaterial.SwitchMaterial>().single()
        toggle.isChecked = false
        assertThat(affected.compoundDrawables[2] == null).isEqualTo(true)
        toggle.isChecked = true
        assertThat(affected.compoundDrawables[2] != null).isEqualTo(true)
        toggle.isChecked = false
        (dialog as androidx.appcompat.app.AlertDialog).getButton(android.content.DialogInterface.BUTTON_POSITIVE).performClick()
        shadowOf(android.os.Looper.getMainLooper()).idle()
        val after = androidx.appcompat.view.menu.MenuBuilder(activity)
        activity.onCreateOptionsMenu(after)
        assertThat(after.findItem(9) == null).isEqualTo(true)
        activity.getSharedPreferences("tb_connect_calendar_view", android.content.Context.MODE_PRIVATE)
            .edit().remove("muted_calendar_warnings").commit()
        dialog.dismiss()
        controller.stop().destroy()
    }

    @Test
    fun plannerOverviewShowsDesktopMailsInAllFourSections() = renderPlannerOverview(false)

    @Test
    @Config(qualifiers = "de-rDE-w393dp-h852dp-night-mdpi")
    fun darkPlannerOverviewShowsTheSameMailSections() = renderPlannerOverview(true)

    private fun renderPlannerOverview(dark: Boolean) {
        installDependencies(dark)
        val controller = Robolectric.buildActivity(DailyPlannerActivity::class.java).create().start().visible()
        val testSubject = controller.get()
        val today = java.time.LocalDate.now()
        val payload = org.json.JSONObject().put("tasks", org.json.JSONArray()).put("emails", org.json.JSONArray())
        listOf(today.minusDays(1).toString(), today.toString(), null, today.plusDays(1).toString()).forEachIndexed { index, date ->
            payload.getJSONArray("emails").put(org.json.JSONObject().put("id", "mail-$index")
                .put("subject", "Desktop Mail $index").put("author", "Synthetic sender")
                .put("dueDate", date ?: org.json.JSONObject.NULL).put("done", false))
        }
        DailyPlannerActivity::class.java.getDeclaredField("plannerState").apply { isAccessible = true }
            .set(testSubject, PlannerMobileState.empty().copy(payload = payload.toString()))
        DailyPlannerActivity::class.java.getDeclaredMethod("render").apply { isAccessible = true }.invoke(testSubject)
        val sections = testSubject.findViewById<android.widget.LinearLayout>(R.id.tb_planner_sections)
        assertThat(sections.childCount).isEqualTo(4)
        fun labels(view: View): List<String> = when (view) {
            is TextView -> listOf(view.text.toString())
            is android.view.ViewGroup -> (0 until view.childCount).flatMap { labels(view.getChildAt(it)) }
            else -> emptyList()
        }
        val text = labels(sections)
        for (title in listOf("Überfällige Mails & Aufgaben", "HEUTE", "OHNE TERMIN", "Ewige To-do-Liste", "MORGEN")) {
            assertThat(text.any { it == title }).isEqualTo(true)
        }
        for (index in 0..3) assertThat(text.count { it.contains("Desktop Mail $index") }).isEqualTo(1)
        sections.measure(View.MeasureSpec.makeMeasureSpec(393, View.MeasureSpec.EXACTLY),
            View.MeasureSpec.makeMeasureSpec(0, View.MeasureSpec.UNSPECIFIED))
        sections.layout(0, 0, 393, sections.measuredHeight)
        val bitmap = Bitmap.createBitmap(393, sections.height, Bitmap.Config.ARGB_8888)
        sections.draw(Canvas(bitmap))
        val file = File("build/calendar-ui/planner-${if (dark) "dark" else "light"}.png")
        requireNotNull(file.parentFile).mkdirs()
        file.outputStream().use { bitmap.compress(Bitmap.CompressFormat.PNG, 100, it) }
        bitmap.recycle()
        controller.stop().destroy()
    }

    private fun installDependencies(
        dark: Boolean,
        problems: Map<Long, net.thunderbird.feature.calendar.CalendarSyncProblem> = emptyMap(),
    ) {
        val theme = mock<ThemeManager> {
            on { appThemeResourceId } doReturn if (dark) {
                com.google.android.material.R.style.Theme_Material3_Dark_NoActionBar
            } else com.google.android.material.R.style.Theme_Material3_Light_NoActionBar
            on { appTheme } doReturn if (dark) Theme.DARK else Theme.LIGHT
        }
        val language = AppLanguageManager(
            systemLocaleManager = mock(),
            displayCoreSettingsPreferenceManager = mock(),
        )
        startKoin {
            modules(module {
                single { theme }
                single { language }
                single { mock<PushController>() }
                single { mock<NativeGoogleCalendar> { on { calendarProblems } doReturn problems } }
                single { mock<GoogleCalendarSetupRepository>() }
            })
        }
    }

    private fun capture(view: View, mode: String, dark: Boolean, widthPixels: Int = 393, heightPixels: Int = 852) {
        val width = View.MeasureSpec.makeMeasureSpec(widthPixels, View.MeasureSpec.EXACTLY)
        val height = View.MeasureSpec.makeMeasureSpec(heightPixels, View.MeasureSpec.EXACTLY)
        repeat(2) {
            view.measure(width, height)
            view.layout(0, 0, widthPixels, heightPixels)
            shadowOf(android.os.Looper.getMainLooper()).idle()
        }
        fun inspect(child: View) {
            if (child is TextView && child.text.contains("Projektbesprechung")) {
                assertThat(child.width > 1).isEqualTo(true)
            }
            if (child is android.view.ViewGroup) for (i in 0 until child.childCount) inspect(child.getChildAt(i))
        }
        inspect(view)
        val bitmap = Bitmap.createBitmap(widthPixels, heightPixels, Bitmap.Config.ARGB_8888)
        view.draw(Canvas(bitmap))
        val file = File("build/calendar-ui/$mode-${if (dark) "dark" else "light"}.png")
        requireNotNull(file.parentFile).mkdirs()
        file.outputStream().use { bitmap.compress(Bitmap.CompressFormat.PNG, 100, it) }
        bitmap.recycle()
    }

    private fun event(id: Long, title: String, color: String, day: Int, hour: Int) = DeviceCalendarEvent(
        id, title, 1L, "Testkalender", color, "", false,
        LocalDateTime.of(2026, 10, day, hour, 0), LocalDateTime.of(2026, 10, day, hour + 1, 0),
    )
}
