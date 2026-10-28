package com.fsck.k9.ui.zeitklar

/** Compare-and-set selection; column names are internal constants, never user input. */
internal object DeviceEventVersion {
    val columns = listOf("calendar_id", "title", "eventLocation", "dtstart", "dtend", "allDay", "rrule", "rdate")

    fun selection(snapshot: Map<String, String?>): Pair<String, Array<String>> {
        require(snapshot.keys == columns.toSet())
        val args = mutableListOf<String>()
        val sql = columns.joinToString(" AND ") { column ->
            snapshot[column]?.let { args.add(it); "$column=?" } ?: "$column IS NULL"
        }
        return sql to args.toTypedArray()
    }
}
