package com.fsck.k9.ui.zeitklar

import android.Manifest
import android.content.Context
import android.content.ContentUris
import android.content.ContentValues
import android.content.ContentProviderOperation
import android.content.pm.PackageManager
import android.provider.CalendarContract
import androidx.core.content.ContextCompat
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.time.ZoneOffset
import java.util.Locale

/**
 * Reads calendars that Android already synchronizes and compare-and-set updates
 * explicitly selected writable single events with the user's permission.
 * Account credentials and provider configuration always stay with the
 * Android account/provider that owns them.
 */
data class DeviceCalendar(
    val id: Long,
    val name: String,
    val color: String,
    val provider: String,
    val writable: Boolean,
    val accountName: String = "",
    val accountType: String = "",
    val nativeGoogle: Boolean = false,
)

data class DeviceCalendarEvent(
    val id: Long,
    val title: String,
    val calendarId: Long,
    val calendarName: String,
    val color: String,
    val location: String,
    val allDay: Boolean,
    val start: java.time.LocalDateTime,
    /** End is exclusive for all-day events, matching Android CalendarContract. */
    val end: java.time.LocalDateTime,
)

object DeviceCalendarStore {
    private const val NATIVE_GOOGLE_MARKER = "tbconnect-native-google-v1"
    internal data class EditSnapshot(
        val id: Long,
        val values: Map<String, String?>,
        val calendar: DeviceCalendar,
    )

    internal fun editSnapshot(context: Context, id: Long): EditSnapshot? {
        if (!hasReadAccess(context)) return null
        return context.contentResolver.query(
            ContentUris.withAppendedId(CalendarContract.Events.CONTENT_URI, id),
            DeviceEventVersion.columns.toTypedArray(), null, null, null,
        )?.use { cursor ->
            if (!cursor.moveToFirst()) return@use null
            val values = DeviceEventVersion.columns.associateWith { column ->
                val index = cursor.getColumnIndexOrThrow(column)
                if (cursor.isNull(index)) null else cursor.getString(index)
            }
            val calendar = calendars(context, includeHidden = true).firstOrNull { it.id.toString() == values["calendar_id"] && it.writable }
                ?: return@use null
            EditSnapshot(id, values, calendar)
        }
    }

    internal fun updateEvent(context: Context, snapshot: EditSnapshot, values: ContentValues) {
        require(ContextCompat.checkSelfPermission(context, Manifest.permission.WRITE_CALENDAR) == PackageManager.PERMISSION_GRANTED)
        require(values.getAsLong(CalendarContract.Events.CALENDAR_ID) == snapshot.calendar.id)
        val (where, args) = DeviceEventVersion.selection(snapshot.values)
        val operation = ContentProviderOperation.newUpdate(CalendarContract.Events.CONTENT_URI)
            .withValues(values)
            .withSelection("${CalendarContract.Events._ID}=? AND ($where)", arrayOf(snapshot.id.toString(), *args))
            .withExpectedCount(1)
            .build()
        context.contentResolver.applyBatch(CalendarContract.AUTHORITY, arrayListOf(operation))
    }

    fun hasReadAccess(context: Context): Boolean =
        ContextCompat.checkSelfPermission(context, Manifest.permission.READ_CALENDAR) == PackageManager.PERMISSION_GRANTED

    @Suppress("MissingPermission")
    fun calendars(context: Context, includeHidden: Boolean = false): List<DeviceCalendar> {
        if (!hasReadAccess(context)) return emptyList()
        val projection = arrayOf(
            CalendarContract.Calendars._ID,
            CalendarContract.Calendars.CALENDAR_DISPLAY_NAME,
            CalendarContract.Calendars.CALENDAR_COLOR,
            CalendarContract.Calendars.ACCOUNT_TYPE,
            CalendarContract.Calendars.ACCOUNT_NAME,
            CalendarContract.Calendars.CAL_SYNC1,
            CalendarContract.Calendars.CALENDAR_ACCESS_LEVEL,
            CalendarContract.Calendars.VISIBLE,
        )
        return runCatching {
            context.contentResolver.query(
                CalendarContract.Calendars.CONTENT_URI,
                projection,
                if (includeHidden) null else "${CalendarContract.Calendars.VISIBLE}=1",
                null,
                "${CalendarContract.Calendars.CALENDAR_DISPLAY_NAME} COLLATE NOCASE ASC",
            )?.use { cursor ->
                buildList {
                    val idIndex = cursor.getColumnIndexOrThrow(CalendarContract.Calendars._ID)
                    val nameIndex = cursor.getColumnIndexOrThrow(CalendarContract.Calendars.CALENDAR_DISPLAY_NAME)
                    val colorIndex = cursor.getColumnIndexOrThrow(CalendarContract.Calendars.CALENDAR_COLOR)
                    val providerIndex = cursor.getColumnIndexOrThrow(CalendarContract.Calendars.ACCOUNT_TYPE)
                    val accessIndex = cursor.getColumnIndexOrThrow(CalendarContract.Calendars.CALENDAR_ACCESS_LEVEL)
                    while (cursor.moveToNext()) {
                        add(
                            DeviceCalendar(
                                id = cursor.getLong(idIndex),
                                name = cursor.getString(nameIndex).orEmpty().ifBlank { "(Ohne Namen)" }.take(160),
                                color = calendarColor(cursor.getInt(colorIndex)),
                                provider = if (cursor.getString(cursor.getColumnIndexOrThrow(
                                    CalendarContract.Calendars.CAL_SYNC1,
                                )) == NATIVE_GOOGLE_MARKER) "Google Calendar · TB-Connect"
                                    else providerLabel(cursor.getString(providerIndex)),
                                nativeGoogle = cursor.getString(cursor.getColumnIndexOrThrow(
                                    CalendarContract.Calendars.CAL_SYNC1,
                                )) == NATIVE_GOOGLE_MARKER,
                                accountType = cursor.getString(providerIndex).orEmpty(),
                                accountName = cursor.getString(cursor.getColumnIndexOrThrow(
                                    CalendarContract.Calendars.ACCOUNT_NAME,
                                )).orEmpty(),
                                writable = cursor.getInt(accessIndex) >= CalendarContract.Calendars.CAL_ACCESS_CONTRIBUTOR,
                            ),
                        )
                    }
                }
            }.orEmpty()
        }.getOrDefault(emptyList())
    }

    @Suppress("MissingPermission")
    fun eventsForMonth(context: Context, month: java.time.YearMonth): List<DeviceCalendarEvent> =
        eventsBetween(context, month.atDay(1), month.plusMonths(1).atDay(1))

    /** A calendar view only reads the range it currently needs. */
    fun eventsForRange(context: Context, startDate: LocalDate, endDateExclusive: LocalDate, zone: ZoneId = ZoneId.systemDefault()): List<DeviceCalendarEvent> =
        eventsBetween(context, startDate, endDateExclusive, zone)

    @Suppress("MissingPermission")
    fun eventsForDate(context: Context, date: LocalDate): List<PlannerDesktopReference> =
        eventsBetween(context, date, date.plusDays(1)).map { event ->
            val time = if (event.allDay) "Ganztägig" else "%02d:%02d".format(event.start.hour, event.start.minute)
            PlannerDesktopReference(
                title = "▣ ${event.title}",
                detail = listOf(time, event.calendarName).filter { it.isNotBlank() }.joinToString(" · "),
            )
        }

    @Suppress("MissingPermission")
    private fun eventsBetween(context: Context, startDate: LocalDate, endDateExclusive: LocalDate, zone: ZoneId = ZoneId.systemDefault()): List<DeviceCalendarEvent> {
        if (!hasReadAccess(context)) return emptyList()
        val begin = startDate.atStartOfDay(zone).toInstant().toEpochMilli()
        val end = endDateExclusive.atStartOfDay(zone).toInstant().toEpochMilli()
        val uri = CalendarContract.Instances.CONTENT_URI.buildUpon()
            .appendPath(begin.toString())
            .appendPath(end.toString())
            .build()
        val projection = arrayOf(
            CalendarContract.Instances.EVENT_ID,
            CalendarContract.Instances.TITLE,
            CalendarContract.Instances.CALENDAR_ID,
            CalendarContract.Instances.CALENDAR_DISPLAY_NAME,
            CalendarContract.Instances.CALENDAR_COLOR,
            CalendarContract.Instances.EVENT_LOCATION,
            CalendarContract.Instances.ALL_DAY,
            CalendarContract.Instances.BEGIN,
            CalendarContract.Instances.END,
        )
        return runCatching {
            context.contentResolver.query(
                uri,
                projection,
                null,
                null,
                "${CalendarContract.Instances.BEGIN} ASC",
            )?.use { cursor ->
                buildList {
                    val idIndex = cursor.getColumnIndexOrThrow(CalendarContract.Instances.EVENT_ID)
                    val titleIndex = cursor.getColumnIndexOrThrow(CalendarContract.Instances.TITLE)
                    val calendarIdIndex = cursor.getColumnIndexOrThrow(CalendarContract.Instances.CALENDAR_ID)
                    val calendarNameIndex = cursor.getColumnIndexOrThrow(CalendarContract.Instances.CALENDAR_DISPLAY_NAME)
                    val colorIndex = cursor.getColumnIndexOrThrow(CalendarContract.Instances.CALENDAR_COLOR)
                    val locationIndex = cursor.getColumnIndexOrThrow(CalendarContract.Instances.EVENT_LOCATION)
                    val allDayIndex = cursor.getColumnIndexOrThrow(CalendarContract.Instances.ALL_DAY)
                    val beginIndex = cursor.getColumnIndexOrThrow(CalendarContract.Instances.BEGIN)
                    val endIndex = cursor.getColumnIndexOrThrow(CalendarContract.Instances.END)
                    while (cursor.moveToNext()) {
                        val allDay = cursor.getInt(allDayIndex) != 0
                        val instant = Instant.ofEpochMilli(cursor.getLong(beginIndex))
                        val start = if (allDay) {
                            instant.atZone(ZoneOffset.UTC).toLocalDate().atStartOfDay()
                        } else {
                            instant.atZone(zone).toLocalDateTime()
                        }
                        val endInstant = Instant.ofEpochMilli(cursor.getLong(endIndex))
                        val end = if (allDay) {
                            endInstant.atZone(ZoneOffset.UTC).toLocalDate().atStartOfDay()
                        } else {
                            endInstant.atZone(zone).toLocalDateTime()
                        }
                        add(
                            DeviceCalendarEvent(
                                id = cursor.getLong(idIndex),
                                title = cursor.getString(titleIndex).orEmpty().ifBlank { "(Ohne Titel)" }.take(500),
                                calendarId = cursor.getLong(calendarIdIndex),
                                calendarName = cursor.getString(calendarNameIndex).orEmpty().take(160),
                                color = calendarColor(cursor.getInt(colorIndex)),
                                location = cursor.getString(locationIndex).orEmpty().take(200),
                                allDay = allDay,
                                start = start,
                                end = end,
                            ),
                        )
                    }
                }
            }.orEmpty()
        }.getOrDefault(emptyList())
    }

    private fun providerLabel(accountType: String?): String = when (accountType.orEmpty().lowercase()) {
        "com.google" -> "Google Calendar"
        "bitfire.at.davdroid" -> "DAVx⁵"
        "com.android.exchange" -> "Exchange"
        "com.android.calendar" -> "Lokaler Android-Kalender"
        else -> accountType.orEmpty().ifBlank { "Android-Kalender" }.take(120)
    }

    /** CalendarContract exposes colours as packed signed ints, not CSS strings. */
    private fun calendarColor(value: Int): String = "#%06X".format(Locale.ROOT, value and 0x00FFFFFF)
}
