package com.fsck.k9.ui.zeitklar

import java.time.ZoneId

/** Explicit allowlist: never export the encrypted store, account data, tokens or search history. */
internal object ModuleSettingsTransfer {
    const val FORMAT = "tb-connect-settings/1"
    const val PREFERENCES = "tb_connect_calendar_view"
    const val MAX_BYTES = 65_536
    private val flags = setOf("week_starts_sunday", "large_month_text")
    private val zones = setOf("zone_YEAR", "zone_MONTH", "zone_WEEK", "zone_DAY")

    fun sanitize(values: Map<String, *>): Map<String, Any> = buildMap {
        values.forEach { (key, value) ->
            when {
                key in flags && value is Boolean -> put(key, value)
                key in zones && value is String && value in ZoneId.getAvailableZoneIds() -> put(key, value)
            }
        }
    }

    fun matches(query: String, title: String, calendar: String, location: String): Boolean =
        query.isBlank() || listOf(title, calendar, location).any { it.contains(query.trim(), ignoreCase = true) }
}
