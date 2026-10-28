package com.fsck.k9.ui.zeitklar

import assertk.assertThat
import assertk.assertions.hasSize
import assertk.assertions.isEqualTo
import assertk.assertions.isNull
import java.time.DayOfWeek
import java.time.LocalDate
import java.time.YearMonth
import org.junit.Test

class CalendarMonthGridTest {
    @Test
    fun horizontalSwipeChangesOnePeriodButTapsAndVerticalScrollDoNot() {
        val testSubject = CalendarMonthGrid
        assertThat(testSubject.swipeStep(-100f, 5f, 24f)).isEqualTo(1)
        assertThat(testSubject.swipeStep(100f, 5f, 24f)).isEqualTo(-1)
        assertThat(testSubject.swipeStep(10f, 5f, 24f)).isEqualTo(0)
        assertThat(testSubject.swipeStep(30f, 100f, 24f)).isEqualTo(0)
    }
    @Test
    fun noonBoundarySplitsSpanningEventsAndDoesNotDuplicateAdjacentEvents() {
        val testSubject = CalendarMonthGrid
        assertThat(testSubject.timeWindow(690, 750, 0, 720)).isEqualTo(690 to 720)
        assertThat(testSubject.timeWindow(690, 750, 720, 1440)).isEqualTo(720 to 750)
        assertThat(testSubject.timeWindow(720, 780, 0, 720)).isNull()
        assertThat(testSubject.timeWindow(660, 720, 720, 1440)).isNull()
        assertThat(testSubject.timeWindow(0, 1440, 720, 1440)).isEqualTo(720 to 1440)
    }

    @Test
    fun longEventsOnlyExpandInsideVisibleRangeEvenYearsAfterTheirStart() {
        val testSubject = CalendarMonthGrid
        val dates = testSubject.visibleDates(LocalDate.of(2020, 1, 1), LocalDate.of(2030, 1, 1),
            LocalDate.of(2026, 10, 1), LocalDate.of(2026, 11, 1))
        assertThat(dates).hasSize(31)
        assertThat(dates.first()).isEqualTo(LocalDate.of(2026, 10, 1))
        assertThat(dates.last()).isEqualTo(LocalDate.of(2026, 10, 31))
    }

    @Test
    fun fullDayFitsViewportAndKeepsMidnightVisible() {
        val testSubject = CalendarMonthGrid
        val body = testSubject.fittedBodyHeight(637, 78)
        assertThat(body + 78).isEqualTo(637)
        assertThat(testSubject.minuteOffset(0, body)).isEqualTo(0)
        assertThat(testSubject.minuteOffset(1440, body)).isEqualTo(body)
        assertThat(testSubject.minuteOffset(720, body)).isEqualTo(body / 2)
    }

    @Test
    fun deviceEventSelectionUsesParametersAndNullChecks() {
        val testSubject = DeviceEventVersion
        val snapshot = DeviceEventVersion.columns.associateWith { if (it == "title") "Robert');--" else null }
        val (sql, args) = testSubject.selection(snapshot)
        assertThat(sql.contains("Robert")).isEqualTo(false)
        assertThat(sql.contains("dtend IS NULL")).isEqualTo(true)
        assertThat(args.toList()).isEqualTo(listOf("Robert');--"))
    }
    @Test
    fun overlappingAppointmentsUseSeparateColumnsButAdjacentOnesDoNot() {
        val testSubject = CalendarMonthGrid
        val result = testSubject.timeColumns(listOf(540 to 600, 570 to 630, 630 to 690))
        assertThat(result).isEqualTo(listOf(0 to 2, 1 to 2, 0 to 1))
    }

    @Test
    fun timeColumnsHandleEmptyDayAndNestedAppointments() {
        val testSubject = CalendarMonthGrid
        assertThat(testSubject.timeColumns(emptyList())).isEqualTo(emptyList())
        assertThat(testSubject.timeColumns(listOf(480 to 1020, 540 to 600, 600 to 660)))
            .isEqualTo(listOf(0 to 2, 1 to 2, 1 to 2))
    }

    @Test
    fun reminderSkipsCompletedFutureAndUndatedTasks() {
        val date = LocalDate.of(2026, 10, 16)
        fun task(id: String, due: String?, done: Boolean = false) = PlannerTask(
            id = id, text = id, emailAddress = "", dueDate = due, order = 0,
            done = done, createdAt = "", updatedAt = "",
        )
        val testSubject = PlannerReminderWorker
        val result = testSubject.dueTasks(listOf(
            task("overdue", "2026-10-15"), task("today", "2026-10-16"),
            task("future", "2026-10-17"), task("done", "2026-10-16", true), task("undated", null),
        ), date)
        assertThat(result.map { it.id }).isEqualTo(listOf("overdue", "today"))
    }
    @Test
    fun monthStartingOnSundayUsesMondayFirstColumnOrder() {
        val dates = CalendarMonthGrid.dates(YearMonth.of(2026, 3))

        assertThat(dates).hasSize(42)
        assertThat(dates[5]).isNull()
        assertThat(dates[6]).isEqualTo(LocalDate.of(2026, 3, 1))
        assertThat(dates[36]).isEqualTo(LocalDate.of(2026, 3, 31))
        assertThat(dates[37]).isNull()
    }

    @Test
    fun leapYearContainsFebruaryTwentyNinth() {
        val dates = CalendarMonthGrid.dates(YearMonth.of(2028, 2))

        assertThat(dates.filterNotNull().last()).isEqualTo(LocalDate.of(2028, 2, 29))
    }

    @Test
    fun sundayFirstGridPlacesSundayAtTheFirstColumn() {
        val dates = CalendarMonthGrid.dates(YearMonth.of(2026, 3), DayOfWeek.SUNDAY)

        assertThat(dates).hasSize(42)
        assertThat(dates[0]).isEqualTo(LocalDate.of(2026, 3, 1))
        assertThat(dates[30]).isEqualTo(LocalDate.of(2026, 3, 31))
    }
}
