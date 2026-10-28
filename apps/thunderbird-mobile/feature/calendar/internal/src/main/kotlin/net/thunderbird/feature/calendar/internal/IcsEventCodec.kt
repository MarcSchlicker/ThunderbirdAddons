package net.thunderbird.feature.calendar.internal

import java.io.StringReader
import java.time.Duration
import java.time.Instant
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.OffsetDateTime
import java.time.ZoneId
import java.time.ZoneOffset
import java.time.ZonedDateTime
import java.time.format.DateTimeFormatter
import java.time.temporal.Temporal
import net.fortuna.ical4j.data.CalendarBuilder
import net.fortuna.ical4j.model.Parameter
import net.fortuna.ical4j.model.ParameterList
import net.fortuna.ical4j.model.Property
import net.fortuna.ical4j.model.component.VAlarm
import net.fortuna.ical4j.model.component.VEvent
import net.fortuna.ical4j.model.property.Action
import net.fortuna.ical4j.model.property.DateListProperty
import net.fortuna.ical4j.model.property.DateProperty
import net.fortuna.ical4j.model.property.Description
import net.fortuna.ical4j.model.property.DtEnd
import net.fortuna.ical4j.model.property.DtStamp
import net.fortuna.ical4j.model.property.DtStart
import net.fortuna.ical4j.model.property.ExDate
import net.fortuna.ical4j.model.property.ExRule
import net.fortuna.ical4j.model.property.Location
import net.fortuna.ical4j.model.property.RDate
import net.fortuna.ical4j.model.property.RRule
import net.fortuna.ical4j.model.property.RecurrenceId
import net.fortuna.ical4j.model.property.Status
import net.fortuna.ical4j.model.property.Summary
import net.fortuna.ical4j.model.property.Trigger
import net.fortuna.ical4j.model.property.Uid
import net.fortuna.ical4j.model.Calendar as ICalendar

/** ical4j parses and serializes complete objects, retaining unknown properties, alarms and time zones. */
internal class IcsEventCodec {
    fun decode(raw: String): List<IcsEvent> {
        require(raw.length <= MAX_CALENDAR_CHARS)
        val events = CalendarBuilder().build(StringReader(raw)).getComponents<VEvent>("VEVENT")
        require(events.isNotEmpty())
        val primary = events.single { value(it, "RECURRENCE-ID") == null }
        val uid = requireNotNull(value(primary, "UID"))
        return events.map { event ->
            require(value(event, "UID") == uid)
            val startProperty = requireNotNull(event.getProperty<Property>("DTSTART").orElse(null))
            val start = temporal(startProperty)
            val allDay = start is LocalDate
            val end = event.getProperty<Property>("DTEND").orElse(null)?.let(::temporal)
            val duration = event.getProperty<Property>("DURATION").orElse(null)?.value
            val startMillis = epoch(start)
            val endMillis = end?.let(::epoch) ?: duration?.let { startMillis + Duration.parse(it).toMillis() }
                ?: if (allDay) startMillis + DAY_MILLIS else startMillis
            require(endMillis >= startMillis)
            val recurrence = event.getProperty<Property>("RECURRENCE-ID").orElse(null)?.let(::temporal)?.let(::epoch)
            val declaredZone = startProperty.getParameter<Parameter>("TZID").orElse(null)?.value
            val zone = declaredZone ?: (start as? ZonedDateTime)?.zone?.id?.takeUnless { it == "Z" }
                ?: if (start is LocalDateTime) ZoneId.systemDefault().id else "UTC"
            val repeated = value(event, "RRULE") != null || value(event, "RDATE") != null
            val fields = linkedMapOf<String, String?>(
                "title" to value(event, "SUMMARY").orEmpty(), "description" to value(event, "DESCRIPTION").orEmpty(),
                "eventLocation" to value(event, "LOCATION").orEmpty(), "dtstart" to startMillis.toString(),
                "dtend" to if (repeated) null else endMillis.toString(),
                "duration" to if (repeated) Duration.ofMillis(endMillis - startMillis).toString() else null,
                "allDay" to if (allDay) "1" else "0", "eventTimezone" to if (allDay) "UTC" else zone,
                "rrule" to value(event, "RRULE"), "rdate" to dateList(event, "RDATE"),
                "exrule" to value(event, "EXRULE"), "exdate" to dateList(event, "EXDATE"), "uid2445" to uid,
                "eventStatus" to if (value(event, "STATUS") == "CANCELLED") "2" else "1",
            )
            val reminders = event.getComponents<VAlarm>("VALARM").mapNotNull(::reminderMinutes)
            IcsEvent(fields, recurrence, reminders)
        }.sortedBy { it.originalTime != null }
    }

    fun encode(event: ReplicaEvent): String {
        val raw = event.rawCalendar ?: "BEGIN:VCALENDAR\r\nVERSION:2.0\r\n" +
            "PRODID:-//TB-Connect//Calendar//DE\r\nBEGIN:VEVENT\r\nUID:placeholder\r\n" +
            "DTSTAMP:20000101T000000Z\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n"
        val calendar = CalendarBuilder().build(StringReader(raw))
        val component = selectComponent(calendar, event)
        val allDay = event.values["allDay"] == "1"
        val start = Instant.ofEpochMilli(requireNotNull(event.values["dtstart"]).toLong())
        val end = event.values["dtend"]?.let { Instant.ofEpochMilli(it.toLong()) }
            ?: start.plus(Duration.parse(requireNotNull(event.values["duration"])))
        require(!end.isBefore(start))
        component.replace<VEvent>(Uid(event.uid))
        component.replace<VEvent>(Summary(event.values["title"].orEmpty()))
        component.replace<VEvent>(Location(event.values["eventLocation"].orEmpty()))
        component.replace<VEvent>(Description(event.values["description"].orEmpty()))
        component.replace<VEvent>(DtStamp(Instant.now()))
        component.removeAll<VEvent>("DURATION")
        writeDates(component, event, start, end, allDay)
        writeRecurrence(component, event)
        val status = if (event.values["original_id"] != null &&
            event.deleted
        ) {
            "CANCELLED"
        } else {
            when (event.values["eventStatus"]) {
                "2" -> "CANCELLED"
                "0" -> "TENTATIVE"
                else -> "CONFIRMED"
            }
        }
        component.replace<VEvent>(Status(status))
        component.getComponents<VAlarm>("VALARM").filter { reminderMinutes(it) != null }.forEach {
            component.remove<VEvent>(it)
        }
        event.reminders.distinct().forEach { minutes ->
            require(minutes >= 0)
            val alarm = VAlarm(Duration.ofMinutes(-minutes.toLong()))
            alarm.add<VAlarm>(Action("DISPLAY"))
            alarm.add<VAlarm>(Description(event.values["title"].orEmpty()))
            component.add<VEvent>(alarm)
        }
        return calendar.toString()
    }

    private fun selectComponent(calendar: ICalendar, event: ReplicaEvent): VEvent {
        val components = calendar.getComponents<VEvent>("VEVENT")
        val primary = components.single { value(it, "RECURRENCE-ID") == null }
        if (event.values["original_id"] == null) return primary
        val original = requireNotNull(event.values["originalInstanceTime"]).toLong()
        return components.firstOrNull {
            it.getProperty<Property>("RECURRENCE-ID").orElse(null)?.let(::temporal)?.let(::epoch) == original
        } ?: createException(calendar, primary, original, event)
    }

    private fun createException(calendar: ICalendar, primary: VEvent, original: Long, event: ReplicaEvent): VEvent {
        val exception = primary.copy() as VEvent
        exception.removeAll<VEvent>("RRULE", "RDATE", "EXRULE", "EXDATE")
        if (event.values["originalAllDay"] == "1") {
            exception.replace<VEvent>(
                RecurrenceId(
                    LocalDate.ofInstant(
                        Instant.ofEpochMilli(original),
                        ZoneOffset.UTC,
                    ),
                ),
            )
        } else {
            exception.replace<VEvent>(RecurrenceId(Instant.ofEpochMilli(original)))
        }
        calendar.add<ICalendar>(exception)
        return exception
    }

    private fun writeDates(component: VEvent, event: ReplicaEvent, start: Instant, end: Instant, allDay: Boolean) {
        if (allDay) {
            component.replace<VEvent>(DtStart(LocalDate.ofInstant(start, ZoneOffset.UTC)))
            component.replace<VEvent>(DtEnd(LocalDate.ofInstant(end, ZoneOffset.UTC)))
            return
        }
        val zone = ZoneId.of(event.values["eventTimezone"] ?: "UTC")
        if (zone.normalized() == ZoneOffset.UTC) {
            component.replace<VEvent>(DtStart(start))
            component.replace<VEvent>(DtEnd(end))
        } else {
            component.replace<VEvent>(DtStart(start.atZone(zone)))
            component.replace<VEvent>(DtEnd(end.atZone(zone)))
        }
    }

    private fun writeRecurrence(component: VEvent, event: ReplicaEvent) {
        component.removeAll<VEvent>("RRULE", "RDATE", "EXRULE", "EXDATE")
        if (event.values["original_id"] != null) return
        event.values["rrule"]?.takeIf(String::isNotBlank)?.let { component.add<VEvent>(RRule<Temporal>(it)) }
        event.values["rdate"]?.takeIf(String::isNotBlank)?.let {
            component.add<VEvent>(
                RDate<Temporal>(
                    ParameterList(),
                    it,
                ),
            )
        }
        event.values["exrule"]?.takeIf(String::isNotBlank)?.let {
            component.add<VEvent>(
                ExRule<Temporal>(
                    ParameterList(),
                    it,
                ),
            )
        }
        event.values["exdate"]?.takeIf(String::isNotBlank)?.let { component.add<VEvent>(ExDate<Temporal>(it)) }
    }

    private fun reminderMinutes(alarm: VAlarm): Int? {
        val display = alarm.getProperty<Property>("ACTION").orElse(null)?.value == "DISPLAY"
        val amount = alarm.getProperty<Trigger>("TRIGGER").orElse(null)?.duration as? Duration
        if (!display || amount == null) return null
        return if (amount.seconds <= 0 && amount.seconds % SECONDS_PER_MINUTE == 0L) {
            (-amount.toMinutes()).takeIf { it <= Int.MAX_VALUE }?.toInt()
        } else {
            null
        }
    }

    private fun value(event: VEvent, name: String) = event.getProperty<Property>(name).orElse(null)?.value
    private fun temporal(property: Property): Temporal = requireNotNull((property as DateProperty<*>).date)
    private fun epoch(value: Temporal): Long = when (value) {
        is Instant -> value.toEpochMilli()
        is ZonedDateTime -> value.toInstant().toEpochMilli()
        is OffsetDateTime -> value.toInstant().toEpochMilli()
        is LocalDate -> value.atStartOfDay(ZoneOffset.UTC).toInstant().toEpochMilli()
        is LocalDateTime -> value.atZone(ZoneId.systemDefault()).toInstant().toEpochMilli()
        else -> error("UNSUPPORTED_DATE")
    }
    private fun dateList(event: VEvent, name: String): String? = event.getProperties<Property>(name)
        .flatMap { (it as DateListProperty<*>).dates }.takeIf { it.isNotEmpty() }?.joinToString(",") { date ->
            if (date is LocalDate) {
                DateTimeFormatter.BASIC_ISO_DATE.format(date)
            } else {
                UTC_DATE.format(Instant.ofEpochMilli(epoch(date)))
            }
        }

    companion object {
        private const val SECONDS_PER_MINUTE = 60L
        private const val MAX_CALENDAR_CHARS = 4_000_000
        private const val DAY_MILLIS = 86_400_000L
        private val UTC_DATE = DateTimeFormatter.ofPattern("yyyyMMdd'T'HHmmss'Z'").withZone(ZoneOffset.UTC)
    }
}
