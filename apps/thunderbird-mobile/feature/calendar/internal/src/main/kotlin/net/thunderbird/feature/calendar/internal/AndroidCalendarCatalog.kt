package net.thunderbird.feature.calendar.internal

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.provider.CalendarContract
import androidx.core.content.ContextCompat

internal data class DeviceCalendarEntry(
    val id: Long,
    val name: String,
    val account: String,
    val source: String,
    val color: Int,
    val writable: Boolean,
    val selected: Boolean,
)

/** Uses Android's existing signed-in calendar providers. Never handles their credentials or changes their rows. */
internal class AndroidCalendarCatalog(private val context: Context) {
    private val preferences = context.getSharedPreferences("tb_connect_calendar_view", Context.MODE_PRIVATE)

    fun calendars(): List<DeviceCalendarEntry> {
        val permission = ContextCompat.checkSelfPermission(context, Manifest.permission.READ_CALENDAR)
        if (permission != PackageManager.PERMISSION_GRANTED) {
            return emptyList()
        }
        val hidden = preferences.getStringSet("hidden_calendar_ids", emptySet()).orEmpty().toMutableSet()
        val initialized = preferences.getBoolean("device_selection_configured", false)
        val columns = arrayOf(
            "_id",
            "calendar_displayName",
            "account_name",
            "account_type",
            "calendar_color",
            "calendar_access_level",
            "visible",
            "cal_sync1",
        )
        val result = context.contentResolver.query(
            CalendarContract.Calendars.CONTENT_URI,
            columns,
            null,
            null,
            "account_name ASC, calendar_displayName ASC",
        )?.use { cursor ->
            buildList {
                while (cursor.moveToNext()) {
                    val id = cursor.getLong(0)
                    if (!initialized && cursor.getInt(6) == 0) hidden += "phone:$id"
                    val source = when {
                        cursor.getString(7) == AndroidCalendarReplica.MARKER -> "TB-Connect"
                        cursor.getString(3) == "com.google" -> "Google"
                        cursor.getString(3) == "at.bitfire.davdroid" -> "DAVx⁵"
                        cursor.getString(3) == CalendarContract.ACCOUNT_TYPE_LOCAL -> "Lokal"
                        else -> "Android"
                    }
                    add(
                        DeviceCalendarEntry(
                            id,
                            cursor.getString(1).orEmpty(),
                            cursor.getString(2).orEmpty(),
                            source,
                            cursor.getInt(4),
                            cursor.getInt(5) >= CalendarContract.Calendars.CAL_ACCESS_CONTRIBUTOR,
                            "phone:$id" !in hidden,
                        ),
                    )
                }
            }
        }.orEmpty()
        if (!initialized) {
            preferences.edit().putStringSet("hidden_calendar_ids", hidden)
                .putBoolean("device_selection_configured", true).apply()
        }
        return result
    }

    fun setSelected(id: Long, selected: Boolean) {
        val hidden = preferences.getStringSet("hidden_calendar_ids", emptySet()).orEmpty().toMutableSet()
        if (selected) hidden -= "phone:$id" else hidden += "phone:$id"
        preferences.edit().putStringSet("hidden_calendar_ids", hidden).apply()
    }
}
