package com.fsck.k9.ui.zeitklar

import java.time.Instant
import java.time.LocalDateTime
import java.time.ZoneId

internal object CalendarEventTiming {
    private const val MILLIS_PER_SECOND = 1000L
    private const val SECONDS_PER_DAY = 86_400L

    fun displayTime(epochMillis: Long?, fallback: LocalDateTime, allDay: Boolean, zone: ZoneId): LocalDateTime =
        if (allDay || epochMillis == null) fallback else Instant.ofEpochMilli(epochMillis).atZone(zone).toLocalDateTime()

    fun duration(startMillis: Long, endMillis: Long, allDay: Boolean): String {
        require(endMillis > startMillis)
        val seconds = (endMillis - startMillis) / MILLIS_PER_SECOND
        return if (allDay) "P${seconds / SECONDS_PER_DAY}D" else "PT${seconds}S"
    }
}
