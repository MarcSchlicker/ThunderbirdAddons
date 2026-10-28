package net.thunderbird.feature.calendar.internal

import assertk.assertThat
import assertk.assertions.isEqualTo
import java.time.Instant
import org.junit.Test

class IcsEventCodecTest {
    private val testSubject = IcsEventCodec()

    @Test
    fun allDayEndRemainsExclusiveAndUtc() {
        val event = testSubject.decode(calendar("DTSTART;VALUE=DATE:20261023\r\nDTEND;VALUE=DATE:20261025")).single()
        assertThat(event.values["allDay"]).isEqualTo("1")
        assertThat(event.values["dtstart"]).isEqualTo(Instant.parse("2026-10-23T00:00:00Z").toEpochMilli().toString())
        assertThat(event.values["dtend"]).isEqualTo(Instant.parse("2026-10-25T00:00:00Z").toEpochMilli().toString())
    }

    @Test
    fun timezoneBeforeDstTransitionIsPreserved() {
        val event = testSubject.decode(
            calendar(
                "DTSTART;TZID=Europe/Berlin:20261023T100000\r\nDTEND;TZID=Europe/Berlin:20261023T110000",
            ),
        ).single()
        assertThat(event.values["dtstart"]).isEqualTo(Instant.parse("2026-10-23T08:00:00Z").toEpochMilli().toString())
    }

    @Test
    fun foldedUnicodeTitleIsUnfoldedByIcal4j() {
        val event = testSubject.decode(
            calendar("DTSTART:20261023T100000Z\r\nDTEND:20261023T110000Z\r\nSUMMARY:GrÃ¼ÃŸe\r\n  aus KÃ¶ln"),
        ).single()
        assertThat(event.values["title"]).isEqualTo("GrÃ¼ÃŸe aus KÃ¶ln")
    }

    @Test
    fun editingSingleEventPreservesUidUnknownPropertiesAndAttendees() {
        val raw = calendar(
            "DTSTART:20261023T100000Z\r\nDTEND:20261023T110000Z\r\n" +
                "X-KEEP:sentinel\r\nATTENDEE:mailto:guest@example.invalid",
        )
        val before = testSubject.decode(raw).single()
        val row = ReplicaEvent(1L, before.values + mapOf("title" to "Changed", "sync_data2" to raw))
        val changed = testSubject.encode(row)
        assertThat(changed.contains("X-KEEP:sentinel")).isEqualTo(true)
        assertThat(changed.contains("guest@example.invalid")).isEqualTo(true)
        val after = testSubject.decode(changed).single()
        assertThat(after.values["uid2445"]).isEqualTo("stable-uid")
        assertThat(after.values["title"]).isEqualTo("Changed")
    }

    @Test
    fun newEventHasOneStableUidAndRoundTripsWithoutCopy() {
        val row = ReplicaEvent(
            1L,
            testSubject.decode(calendar("DTSTART:20261023T100000Z\r\nDTEND:20261023T110000Z"))
                .single().values + mapOf("title" to "New"),
        )
        val result = testSubject.decode(testSubject.encode(row))
        assertThat(result.size).isEqualTo(1)
        assertThat(result.single().values["uid2445"]).isEqualTo("stable-uid")
    }

    @Test
    fun recurringEventAndExceptionMapToOneSeriesAndOneOriginalInstance() {
        val raw = "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Test//DE\r\n" +
            "BEGIN:VEVENT\r\nUID:series\r\nDTSTART:20261023T100000Z\r\nDTEND:20261023T110000Z\r\n" +
            "RRULE:FREQ=DAILY;COUNT=3\r\nEND:VEVENT\r\n" +
            "BEGIN:VEVENT\r\nUID:series\r\nRECURRENCE-ID:20261024T100000Z\r\n" +
            "DTSTART:20261024T120000Z\r\nDTEND:20261024T130000Z\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n"
        val result = testSubject.decode(raw)
        assertThat(result.size).isEqualTo(2)
        assertThat(result.first().values["rrule"]).isEqualTo("FREQ=DAILY;COUNT=3")
        assertThat(result.first().values["duration"]).isEqualTo("PT1H")
        assertThat(result.last().originalTime).isEqualTo(Instant.parse("2026-10-24T10:00:00Z").toEpochMilli())
    }

    @Test
    fun seriesEditKeepsRuleAndExistingException() {
        val raw = series()
        val root = testSubject.decode(raw).first()
        val result = testSubject.decode(
            testSubject.encode(
                ReplicaEvent(
                    1L,
                    root.values + mapOf("title" to "Changed series", "sync_data2" to raw),
                ),
            ),
        )
        assertThat(result.size).isEqualTo(2)
        assertThat(result.first().values["rrule"]).isEqualTo("FREQ=DAILY;COUNT=3")
        assertThat(result.first().values["title"]).isEqualTo("Changed series")
        assertThat(result.last().values["title"]).isEqualTo("Exception")
    }

    @Test
    fun exceptionEditKeepsSeriesAndOriginalInstanceIdentity() {
        val raw = series()
        val exception = testSubject.decode(raw).last()
        val result = testSubject.decode(
            testSubject.encode(
                ReplicaEvent(
                    2L,
                    exception.values + mapOf(
                        "title" to "Changed occurrence",
                        "original_id" to "1",
                        "originalAllDay" to "0",
                        "originalInstanceTime" to exception.originalTime.toString(),
                        "sync_data2" to raw,
                    ),
                ),
            ),
        )
        assertThat(result.size).isEqualTo(2)
        assertThat(result.first().values["title"]).isEqualTo("Root")
        assertThat(result.last().values["title"]).isEqualTo("Changed occurrence")
        assertThat(result.last().originalTime).isEqualTo(exception.originalTime)
    }

    @Test
    fun newExceptionIsAddedToSameResourceWithoutReplacingTheSeries() {
        val raw = series()
        val root = testSubject.decode(raw).first()
        val original = Instant.parse("2026-10-25T10:00:00Z").toEpochMilli()
        val values = root.values + mapOf(
            "original_id" to "1",
            "originalAllDay" to "0",
            "originalInstanceTime" to original.toString(),
            "sync_data2" to raw,
            "dtstart" to original.toString(),
            "dtend" to (original + 3_600_000L).toString(),
            "title" to "New exception",
        )
        val result = testSubject.decode(testSubject.encode(ReplicaEvent(3L, values)))
        assertThat(result.size).isEqualTo(3)
        assertThat(result.first().values["rrule"]).isEqualTo("FREQ=DAILY;COUNT=3")
        assertThat(result.single { it.originalTime == original }.values["rrule"]).isEqualTo(null)
    }

    @Test
    fun deletedOccurrenceBecomesCancelledExceptionInsteadOfDeletingWholeSeries() {
        val raw = series()
        val exception = testSubject.decode(raw).last()
        val values = exception.values + mapOf(
            "original_id" to "1",
            "originalAllDay" to "0",
            "originalInstanceTime" to exception.originalTime.toString(),
            "sync_data2" to raw,
            "deleted" to "1",
        )
        val result = testSubject.decode(testSubject.encode(ReplicaEvent(2L, values)))
        assertThat(result.first().values["rrule"]).isEqualTo("FREQ=DAILY;COUNT=3")
        assertThat(result.last().values["eventStatus"]).isEqualTo("2")
    }

    @Test
    fun recurringLocalTimezoneRemainsLocalAcrossSerialization() {
        val raw = calendar(
            "DTSTART;TZID=Europe/Berlin:20261023T100000\r\n" +
                "DTEND;TZID=Europe/Berlin:20261023T110000\r\nRRULE:FREQ=DAILY;COUNT=4",
        )
        val first = testSubject.decode(raw).single()
        val updated = testSubject.encode(ReplicaEvent(1L, first.values + mapOf("sync_data2" to raw)))
        assertThat(updated.lineSequence().first { it.startsWith("DTSTART") })
            .isEqualTo("DTSTART;TZID=Europe/Berlin:20261023T100000")
        assertThat(testSubject.decode(updated).single().values["dtstart"]).isEqualTo(first.values["dtstart"])
    }

    @Test
    fun malformedObjectCannotReachProviderOrDeletionReconciliation() {
        assertThat(runCatching { testSubject.decode("not an iCalendar") }.isFailure).isEqualTo(true)
    }

    @Test
    fun displayReminderIsImportedAndCanBeChangedWithoutLosingOtherProperties() {
        val raw = calendar(
            "DTSTART:20261023T100000Z\r\nDTEND:20261023T110000Z\r\n" +
                "BEGIN:VALARM\r\nACTION:DISPLAY\r\nTRIGGER:-PT15M\r\nDESCRIPTION:Alert\r\nEND:VALARM",
        )
        val decoded = testSubject.decode(raw).single()
        assertThat(decoded.reminders).isEqualTo(listOf(15))
        val changed = testSubject.encode(ReplicaEvent(1L, decoded.values + mapOf("sync_data2" to raw), listOf(5)))
        assertThat(testSubject.decode(changed).single().reminders).isEqualTo(listOf(5))
    }

    companion object {
        internal fun series(): String = "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Test//DE\r\n" +
            "BEGIN:VEVENT\r\nUID:series\r\nSUMMARY:Root\r\nDTSTART:20261023T100000Z\r\n" +
            "DTEND:20261023T110000Z\r\nRRULE:FREQ=DAILY;COUNT=3\r\nEND:VEVENT\r\n" +
            "BEGIN:VEVENT\r\nUID:series\r\nSUMMARY:Exception\r\nRECURRENCE-ID:20261024T100000Z\r\n" +
            "DTSTART:20261024T120000Z\r\nDTEND:20261024T130000Z\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n"

        internal fun calendar(fields: String) = "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Test//DE\r\n" +
            "BEGIN:VEVENT\r\nUID:stable-uid\r\nDTSTAMP:20261001T000000Z\r\n$fields\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n"
    }
}
