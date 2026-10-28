package net.thunderbird.feature.calendar.internal

import org.junit.Assert.assertEquals
import org.junit.Test

/** Synthetic fixtures only: no accounts, provider access, network requests or personal events. */
class IcsEventCodecDeviceTest {
    @Test
    fun utcEventParsesOnAndroid() {
        assertEquals(1, IcsEventCodec().decode(calendar("DTSTART:20261024T100000Z\r\nDTEND:20261024T110000Z")).size)
    }

    @Test
    fun berlinEventParsesOnAndroid() {
        assertEquals(
            1,
            IcsEventCodec().decode(
                calendar(
                    "DTSTART;TZID=Europe/Berlin:20261024T100000\r\nDTEND;TZID=Europe/Berlin:20261024T110000",
                ),
            ).size,
        )
    }

    @Test
    fun allDayEventParsesOnAndroid() {
        assertEquals(
            1,
            IcsEventCodec().decode(
                calendar(
                    "DTSTART;VALUE=DATE:20261024\r\nDTEND;VALUE=DATE:20261025",
                ),
            ).size,
        )
    }

    private fun calendar(fields: String) = "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//TB-Connect Test//DE\r\n" +
        "BEGIN:VEVENT\r\nUID:synthetic-device-test\r\nDTSTAMP:20261024T000000Z\r\n$fields\r\n" +
        "END:VEVENT\r\nEND:VCALENDAR\r\n"
}
