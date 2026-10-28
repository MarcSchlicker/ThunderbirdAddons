package net.thunderbird.feature.calendar.internal

import net.thunderbird.core.calendar.CalDavCalendar
import net.thunderbird.core.calendar.CalDavObject

internal data class NativeCalendarBinding(val id: Long, val email: String, val calendar: CalDavCalendar)
internal data class ReplicaEvent(
    val id: Long,
    val values: Map<String, String?>,
    val reminders: List<Int> = emptyList(),
) {
    val resourceUrl get() = values["_sync_id"].orEmpty()
    val eTag get() = values["sync_data1"]?.takeIf(String::isNotBlank)
    val rawCalendar get() = values["sync_data2"]?.takeIf(String::isNotBlank)
    val deleted get() = values["deleted"] == "1"
    val dirty get() = values["dirty"] == "1"
    val uid get() = values["uid2445"].orEmpty()
}
internal data class IcsEvent(
    val values: Map<String, String?>,
    val originalTime: Long? = null,
    val reminders: List<Int> = emptyList(),
)
internal data class RemoteCalendarObject(val source: CalDavObject, val events: List<IcsEvent>)

internal interface CalendarReplica {
    fun ensureCalendar(email: String, calendar: CalDavCalendar): Long
    fun dirty(binding: NativeCalendarBinding): List<ReplicaEvent>
    fun prepareIdentity(binding: NativeCalendarBinding, event: ReplicaEvent): ReplicaEvent?
    fun acknowledge(binding: NativeCalendarBinding, event: ReplicaEvent, eTag: String, rawCalendar: String)
    fun removeUploadedDeletion(binding: NativeCalendarBinding, event: ReplicaEvent)
    fun applyRemote(binding: NativeCalendarBinding, objects: List<RemoteCalendarObject>)
}
