package com.fsck.k9.ui.zeitklar

import java.time.DayOfWeek
import java.time.LocalDate
import java.time.YearMonth

internal object CalendarMonthGrid {
    private const val CELL_COUNT = 42
    private const val MAX_VISIBLE_DAYS = 370L
    private const val MIN_BODY_HEIGHT = 24
    private const val MINUTES_PER_DAY = 1440

    fun visibleDates(
        first: LocalDate,
        last: LocalDate,
        rangeStart: LocalDate,
        rangeEndExclusive: LocalDate,
    ): List<LocalDate> {
        val start = maxOf(first, rangeStart)
        val end = minOf(last, rangeEndExclusive.minusDays(1))
        if (end < start) return emptyList()
        val count = (java.time.temporal.ChronoUnit.DAYS.between(start, end) + 1).coerceAtMost(MAX_VISIBLE_DAYS).toInt()
        return List(count) { start.plusDays(it.toLong()) }
    }

    fun fittedBodyHeight(viewportHeight: Int, headerHeight: Int): Int =
        (viewportHeight - headerHeight).coerceAtLeast(MIN_BODY_HEIGHT)

    fun minuteOffset(minute: Int, bodyHeight: Int): Int =
        (minute.coerceIn(0, MINUTES_PER_DAY).toLong() * bodyHeight / MINUTES_PER_DAY).toInt()

    fun swipeStep(horizontal: Float, vertical: Float, minimumDistance: Float): Int =
        if (kotlin.math.abs(horizontal) >= minimumDistance &&
            kotlin.math.abs(horizontal) > kotlin.math.abs(vertical) * 1.2f
        ) {
            if (horizontal < 0) 1 else -1
        } else {
            0
        }

    /** Clip a timed event to a half-open time window; noon belongs to the afternoon. */
    fun timeWindow(start: Int, end: Int, windowStart: Int, windowEnd: Int): Pair<Int, Int>? {
        val clippedStart = maxOf(start, windowStart)
        val clippedEnd = minOf(end, windowEnd)
        return if (clippedStart < clippedEnd) clippedStart to clippedEnd else null
    }

    /** Half-open intervals: adjacent appointments share a column, overlaps do not. */
    fun timeColumns(intervals: List<Pair<Int, Int>>): List<Pair<Int, Int>> {
        val result = MutableList(intervals.size) { 0 to 1 }
        val group = mutableListOf<Int>()
        val laneEnds = mutableListOf<Int>()
        fun finishGroup() {
            group.forEach { result[it] = result[it].first to laneEnds.size.coerceAtLeast(1) }
            group.clear()
            laneEnds.clear()
        }
        intervals.indices.sortedBy { intervals[it].first }.forEach { index ->
            val (start, end) = intervals[index]
            if (laneEnds.isNotEmpty() && laneEnds.all { it <= start }) finishGroup()
            val lane = laneEnds.indexOfFirst { it <= start }.takeIf { it >= 0 } ?: laneEnds.size
            if (lane == laneEnds.size) laneEnds.add(end) else laneEnds[lane] = end
            result[index] = lane to 1
            group.add(index)
        }
        finishGroup()
        return result
    }

    /** Six stable weeks work for both Monday-first and Sunday-first calendars. */
    fun dates(month: YearMonth, firstDayOfWeek: DayOfWeek = DayOfWeek.MONDAY): List<LocalDate?> {
        val leadingEmptyCells = (month.atDay(1).dayOfWeek.value - firstDayOfWeek.value + 7) % 7
        return List(CELL_COUNT) { index ->
            val day = index - leadingEmptyCells + 1
            day.takeIf { it in 1..month.lengthOfMonth() }?.let(month::atDay)
        }
    }
}
