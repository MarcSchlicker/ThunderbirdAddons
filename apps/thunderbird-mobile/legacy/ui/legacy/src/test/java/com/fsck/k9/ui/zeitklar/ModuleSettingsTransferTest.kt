package com.fsck.k9.ui.zeitklar

import assertk.assertThat
import assertk.assertions.isEqualTo
import org.junit.Test
import java.time.Instant
import java.time.LocalDateTime
import java.time.ZoneId

class ModuleSettingsTransferTest {
    @Test
    fun `desktop editor converts an instant rather than treating desktop wall time as phone time`() {
        val testSubject = CalendarEventTiming
        val desktopTime = LocalDateTime.of(2026, 10, 16, 12, 0)
        val epoch = Instant.parse("2026-10-16T10:00:00Z").toEpochMilli()
        assertThat(testSubject.displayTime(epoch, desktopTime, false, ZoneId.of("America/New_York")))
            .isEqualTo(LocalDateTime.of(2026, 10, 16, 6, 0))
        assertThat(testSubject.displayTime(epoch, desktopTime, true, ZoneId.of("America/New_York")))
            .isEqualTo(desktopTime)
    }
    @Test
    fun `recurring events have a provider compatible duration`() {
        val testSubject = CalendarEventTiming
        assertThat(testSubject.duration(0, 3_600_000, false)).isEqualTo("PT3600S")
        assertThat(testSubject.duration(0, 172_800_000, true)).isEqualTo("P2D")
    }
    @Test
    fun `export excludes credentials identifiers and search history`() {
        val testSubject = ModuleSettingsTransfer
        val result = testSubject.sanitize(mapOf(
            "week_starts_sunday" to true,
            "zone_MONTH" to "Europe/Berlin",
            "accessToken" to "secret",
            "password" to "secret",
            "calendar_query" to "private appointment",
            "desktop_binding_42" to "private calendar",
        ))
        assertThat(result).isEqualTo(mapOf("week_starts_sunday" to true, "zone_MONTH" to "Europe/Berlin"))
    }

    @Test
    fun `invalid types and unknown timezones cannot enter preferences`() {
        val testSubject = ModuleSettingsTransfer
        assertThat(testSubject.sanitize(mapOf("large_month_text" to "true", "zone_DAY" to "malicious")))
            .isEqualTo(emptyMap())
    }

    @Test
    fun `query matches location calendar title and ignores surrounding whitespace`() {
        val testSubject = ModuleSettingsTransfer
        assertThat(testSubject.matches(" BERLIN ", "Meeting", "Work", "Berlin Office")).isEqualTo(true)
        assertThat(testSubject.matches("meeting", "Meeting", "Work", "Berlin")).isEqualTo(true)
        assertThat(testSubject.matches("work", "Meeting", "Work", "Berlin")).isEqualTo(true)
        assertThat(testSubject.matches("absent", "Meeting", "Work", "Berlin")).isEqualTo(false)
    }
}
