package net.thunderbird.feature.calendar.internal

import android.Manifest
import android.content.ContentProviderOperation
import android.content.ContentUris
import android.content.ContentValues
import android.content.Context
import android.content.OperationApplicationException
import android.content.pm.PackageManager
import android.net.Uri
import android.provider.CalendarContract
import androidx.core.content.ContextCompat
import java.util.UUID
import net.thunderbird.core.calendar.CalDavCalendar

/** Own LOCAL calendars are synced by TB-Connect, while Android supplies recurrence expansion and editing. */
// Provider ownership, conditional writes and reminder batches share one resolver transaction boundary.
@Suppress("TooManyFunctions")
internal class AndroidCalendarReplica(private val context: Context) : CalendarReplica {
    private val resolver get() = context.contentResolver

    override fun ensureCalendar(email: String, calendar: CalDavCalendar): Long {
        requireAccess()
        val uri = calendarUri(email)
        val existingId = resolver.query(
            uri,
            arrayOf("_id"),
            "account_name=? AND account_type=? AND cal_sync1=? AND cal_sync2=?",
            arrayOf(
                email,
                CalendarContract.ACCOUNT_TYPE_LOCAL,
                MARKER,
                calendar.url,
            ),
            null,
        )?.use { if (it.moveToFirst()) it.getLong(0) else null }
        val values = ContentValues().apply {
            put("account_name", email)
            put("account_type", CalendarContract.ACCOUNT_TYPE_LOCAL)
            put("name", calendar.url)
            put("calendar_displayName", calendar.displayName)
            put("ownerAccount", email)
            put("calendar_color", DEFAULT_COLOR)
            put(
                "calendar_access_level",
                if (calendar.writable) {
                    CalendarContract.Calendars.CAL_ACCESS_CONTRIBUTOR
                } else {
                    CalendarContract.Calendars.CAL_ACCESS_READ
                },
            )
            put("calendar_timezone", "UTC")
            put("visible", 1)
            put("sync_events", 1)
            put("cal_sync1", MARKER)
            put("cal_sync2", calendar.url)
        }
        if (existingId != null) {
            // AOSP interprets selections starting with _id= as a literal numeric ID.
            // Keep the ownership guard first so the compound selection uses the normal SQL path.
            check(resolver.update(uri, values, "cal_sync1=? AND _id=?", arrayOf(MARKER, existingId.toString())) == 1)
            return existingId
        }
        return ContentUris.parseId(requireNotNull(resolver.insert(uri, values)))
    }

    override fun dirty(binding: NativeCalendarBinding): List<ReplicaEvent> =
        rows(binding).filter { it.dirty || it.deleted }

    // Early exits retain a concurrently changed row instead of overwriting it.
    @Suppress("ReturnCount")
    override fun prepareIdentity(binding: NativeCalendarBinding, event: ReplicaEvent): ReplicaEvent? {
        val current = rows(binding).firstOrNull { it.id == event.id } ?: return null
        val parentId = current.values["original_id"]?.toLongOrNull()
        if (parentId != null) {
            val parent = rows(binding).firstOrNull { it.id == parentId } ?: error("MISSING_SERIES")
            val staged = prepareIdentity(binding, parent) ?: return null
            val metadata = ContentValues().apply {
                put("_sync_id", staged.resourceUrl)
                put("uid2445", staged.uid)
                put("sync_data1", staged.eTag)
                put("sync_data2", staged.rawCalendar)
            }
            val (where, args) = selection(current.values)
            if (resolver.update(
                    eventUri(binding),
                    metadata,
                    "_id=? AND ($where)",
                    arrayOf(current.id.toString(), *args),
                ) != 1
            ) {
                return null
            }
            return rows(binding).firstOrNull { it.id == current.id }
        }
        if (current.resourceUrl.isNotBlank()) return current
        val uid = current.uid.ifBlank { UUID.randomUUID().toString() }
        val url = binding.calendar.url.trimEnd('/') + "/${UUID.randomUUID()}.ics"
        val values = ContentValues().apply {
            put("_sync_id", url)
            put("uid2445", uid)
        }
        val (where, args) = selection(current.values)
        if (resolver.update(
                eventUri(binding),
                values,
                "_id=? AND ($where)",
                arrayOf(
                    current.id.toString(),
                    *args,
                ),
            ) != 1
        ) {
            return null
        }
        return rows(binding).firstOrNull { it.id == current.id }
    }

    override fun acknowledge(binding: NativeCalendarBinding, event: ReplicaEvent, eTag: String, rawCalendar: String) {
        // Advance server metadata even if the user edited during upload, then clear dirty only for
        // the uploaded snapshot.
        val metadata = ContentValues().apply {
            put("sync_data1", eTag)
            put("sync_data2", rawCalendar)
        }
        val oldTag = event.eTag
        val tagWhere = if (oldTag == null) "sync_data1 IS NULL" else "sync_data1=?"
        val tagArgs = if (oldTag == null) emptyArray() else arrayOf(oldTag)
        val count = resolver.update(
            eventUri(binding),
            metadata,
            "calendar_id=? AND _sync_id=? AND $tagWhere",
            arrayOf(binding.id.toString(), event.resourceUrl, *tagArgs),
        )
        if (count < 1) return
        val snapshot = event.values + mapOf("sync_data1" to eTag, "sync_data2" to rawCalendar)
        val (where, args) = selection(snapshot)
        val reminderUri = syncUri(CalendarContract.Reminders.CONTENT_URI, binding.email)
        val operations = arrayListOf(
            ContentProviderOperation.newAssertQuery(reminderUri).withSelection(
                "event_id=? AND method IN (0,1)",
                arrayOf(event.id.toString()),
            ).withExpectedCount(event.reminders.size).build(),
        )
        event.reminders.groupingBy { it }.eachCount().forEach { (minutes, count) ->
            operations += ContentProviderOperation.newAssertQuery(reminderUri).withSelection(
                "event_id=? AND method IN (0,1) AND minutes=?",
                arrayOf(event.id.toString(), minutes.toString()),
            ).withExpectedCount(count).build()
        }
        operations += ContentProviderOperation.newUpdate(eventUri(binding))
            .withValues(
                ContentValues().apply {
                    put("dirty", 0)
                    if (event.values["original_id"] != null && event.deleted) {
                        put("deleted", 0)
                        put("eventStatus", 2)
                    }
                },
            )
            .withSelection("_id=? AND ($where)", arrayOf(event.id.toString(), *args)).withExpectedCount(1).build()
        try {
            resolver.applyBatch(CalendarContract.AUTHORITY, operations)
        } catch (_: OperationApplicationException) {
            // A newer local edit stays dirty; the server ETag checkpoint above remains valid.
        }
    }

    override fun removeUploadedDeletion(binding: NativeCalendarBinding, event: ReplicaEvent) {
        val (where, args) = selection(event.values)
        val operations = arrayListOf<ContentProviderOperation>()
        if (event.values["original_id"] == null) {
            operations += ContentProviderOperation.newAssertQuery(eventUri(binding))
                .withSelection("original_id=? AND dirty=1 AND deleted=0", arrayOf(event.id.toString()))
                .withExpectedCount(0).build()
        }
        operations += ContentProviderOperation.newDelete(eventUri(binding))
            .withSelection("_id=? AND ($where)", arrayOf(event.id.toString(), *args))
            .withExpectedCount(1).build()
        try {
            resolver.applyBatch(CalendarContract.AUTHORITY, operations)
        } catch (_: OperationApplicationException) {
            // A concurrent undelete or occurrence edit remains queued, even if the server accepted DELETE.
        }
    }

    // Dirty resources and unchanged resources are separate safety exits in the reconciliation loop.
    @Suppress("LoopWithTooManyJumpStatements")
    override fun applyRemote(binding: NativeCalendarBinding, objects: List<RemoteCalendarObject>) {
        val before = rows(binding)
        for (bundle in objects) {
            val existing = before.filter { it.resourceUrl == bundle.source.url }
            if (existing.any { it.dirty || it.deleted }) {
                resolver.update(
                    eventUri(binding),
                    ContentValues().apply {
                        put(
                            "sync_data2",
                            bundle.source.calendarData,
                        )
                    },
                    "calendar_id=? AND _sync_id=? AND sync_data1=?",
                    arrayOf(binding.id.toString(), bundle.source.url, bundle.source.eTag),
                )
                continue
            }
            val previous = existing.firstOrNull { it.values["original_id"] == null }
            if (previous?.eTag == bundle.source.eTag && previous.rawCalendar == bundle.source.calendarData) continue
            applyBundle(binding, bundle, existing)
        }
        // Deletion is only considered after a complete, validated server listing.
        val present = objects.map { it.source.url }.toSet()
        val protected = before.filter { it.dirty || it.deleted }.map { it.resourceUrl }.toSet()
        for (url in before.map { it.resourceUrl }.distinct()) {
            if (url.isBlank() || url in present || url in protected) continue
            val operations = arrayListOf(cleanResourceAssertion(binding, url))
            operations += ContentProviderOperation.newDelete(eventUri(binding)).withSelection(
                "calendar_id=? AND _sync_id=?",
                arrayOf(binding.id.toString(), url),
            ).build()
            resolver.applyBatch(CalendarContract.AUTHORITY, operations)
        }
    }

    private fun cleanResourceAssertion(binding: NativeCalendarBinding, url: String) =
        ContentProviderOperation.newAssertQuery(eventUri(binding)).withSelection(
            "calendar_id=? AND _sync_id=? AND (dirty=1 OR deleted=1)",
            arrayOf(binding.id.toString(), url),
        ).withExpectedCount(0).build()

    private fun applyBundle(
        binding: NativeCalendarBinding,
        bundle: RemoteCalendarObject,
        existing: List<ReplicaEvent>,
    ) {
        val operations = arrayListOf(cleanResourceAssertion(binding, bundle.source.url))
        val master = existing.firstOrNull { it.values["original_id"] == null }
        val primary = bundle.events.single { it.originalTime == null }
        appendEvent(operations, binding, bundle, primary, master, null)
        for (event in bundle.events.filter { it.originalTime != null }) {
            val previous = existing.firstOrNull { it.values["originalInstanceTime"] == event.originalTime.toString() }
            appendEvent(operations, binding, bundle, event, previous, master?.id)
        }
        val instances = bundle.events.mapNotNull { it.originalTime?.toString() }.toSet()
        existing.filter { it.values["original_id"] != null && it.values["originalInstanceTime"] !in instances }
            .forEach {
                val (where, args) = selection(it.values)
                operations += ContentProviderOperation.newDelete(eventUri(binding)).withSelection(
                    "_id=? AND ($where)",
                    arrayOf(it.id.toString(), *args),
                ).withExpectedCount(1).build()
            }
        resolver.applyBatch(CalendarContract.AUTHORITY, operations)
    }

    private fun appendEvent(
        operations: ArrayList<ContentProviderOperation>,
        binding: NativeCalendarBinding,
        bundle: RemoteCalendarObject,
        event: IcsEvent,
        previous: ReplicaEvent?,
        masterId: Long?,
    ) {
        val eventIndex = operations.size
        operations += upsertOperation(binding, bundle, event, previous, masterId)
        val remindersUri = syncUri(CalendarContract.Reminders.CONTENT_URI, binding.email)
        if (previous != null) {
            operations += ContentProviderOperation.newDelete(remindersUri)
                .withSelection("event_id=?", arrayOf(previous.id.toString())).build()
        }
        for (minutes in event.reminders) {
            val operation = ContentProviderOperation.newInsert(remindersUri)
                .withValue("minutes", minutes).withValue("method", CalendarContract.Reminders.METHOD_ALERT)
            if (previous == null) {
                operation.withValueBackReference("event_id", eventIndex)
            } else {
                operation.withValue("event_id", previous.id)
            }
            operations += operation.build()
        }
    }

    private fun upsertOperation(
        binding: NativeCalendarBinding,
        bundle: RemoteCalendarObject,
        event: IcsEvent,
        previous: ReplicaEvent?,
        masterId: Long?,
    ): ContentProviderOperation {
        val values = contentValues(event.values).apply {
            put("calendar_id", binding.id)
            put("_sync_id", bundle.source.url)
            put("sync_data1", bundle.source.eTag)
            put("sync_data2", bundle.source.calendarData)
            put("dirty", 0)
            put("deleted", 0)
            put("hasAlarm", if (event.reminders.isEmpty()) 0 else 1)
            if (event.originalTime != null) {
                put("originalInstanceTime", event.originalTime)
                put("original_sync_id", bundle.source.url)
                put(
                    "originalAllDay",
                    bundle.events.first { it.originalTime == null }.values["allDay"]?.toIntOrNull() ?: 0,
                )
                if (masterId != null) put("original_id", masterId)
            }
        }
        val operation = if (previous == null) {
            ContentProviderOperation.newInsert(eventUri(binding))
        } else {
            val (where, args) = selection(previous.values)
            ContentProviderOperation.newUpdate(eventUri(binding)).withSelection(
                "_id=? AND ($where)",
                arrayOf(previous.id.toString(), *args),
            ).withExpectedCount(1)
        }
        operation.withValues(values)
        if (event.originalTime != null && masterId == null) operation.withValueBackReference("original_id", 1)
        return operation.build()
    }

    private fun rows(binding: NativeCalendarBinding): List<ReplicaEvent> {
        requireAccess()
        return resolver.query(
            eventUri(binding),
            COLUMNS.toTypedArray(),
            "calendar_id=?",
            arrayOf(binding.id.toString()),
            null,
        )
            ?.use { cursor ->
                buildList {
                    while (cursor.moveToNext()) {
                        val values = COLUMNS.associateWith { column ->
                            val index = cursor.getColumnIndexOrThrow(column)
                            if (cursor.isNull(index)) null else cursor.getString(index)
                        }
                        val id = cursor.getLong(cursor.getColumnIndexOrThrow("_id"))
                        add(ReplicaEvent(id, values - "_id", reminders(binding, id)))
                    }
                }
            }.orEmpty()
    }

    private fun reminders(binding: NativeCalendarBinding, eventId: Long): List<Int> = resolver.query(
        syncUri(CalendarContract.Reminders.CONTENT_URI, binding.email),
        arrayOf("minutes"),
        "event_id=? AND method IN (0,1)",
        arrayOf(eventId.toString()),
        "minutes ASC",
    )?.use { cursor -> buildList { while (cursor.moveToNext()) add(cursor.getInt(0)) } }.orEmpty()

    private fun eventUri(binding: NativeCalendarBinding): Uri {
        requireAccess()
        val owned = resolver.query(
            calendarUri(binding.email),
            arrayOf("_id"),
            "_id=? AND account_name=? AND account_type=? AND cal_sync1=? AND cal_sync2=?",
            arrayOf(
                binding.id.toString(),
                binding.email,
                CalendarContract.ACCOUNT_TYPE_LOCAL,
                MARKER,
                binding.calendar.url,
            ),
            null,
        )
            ?.use { it.moveToFirst() } == true
        check(owned) { "CALENDAR_OWNERSHIP_CHANGED" }
        return syncUri(CalendarContract.Events.CONTENT_URI, binding.email)
    }
    private fun calendarUri(email: String) = syncUri(CalendarContract.Calendars.CONTENT_URI, email)
    private fun syncUri(uri: Uri, email: String) = uri.buildUpon()
        .appendQueryParameter(CalendarContract.CALLER_IS_SYNCADAPTER, "true")
        .appendQueryParameter(
            "account_name",
            email,
        ).appendQueryParameter(
            "account_type",
            CalendarContract.ACCOUNT_TYPE_LOCAL,
        ).build()

    private fun requireAccess() {
        check(
            listOf(Manifest.permission.READ_CALENDAR, Manifest.permission.WRITE_CALENDAR).all {
                ContextCompat.checkSelfPermission(context, it) == PackageManager.PERMISSION_GRANTED
            },
        ) { "CALENDAR_PERMISSION_REQUIRED" }
    }

    companion object {
        const val MARKER = "tbconnect-native-google-v1"
        private const val DEFAULT_COLOR = -12627531
        internal val COLUMNS = listOf(
            "_id",
            "calendar_id",
            "title",
            "description",
            "eventLocation",
            "dtstart",
            "dtend",
            "eventTimezone",
            "allDay",
            "hasAlarm",
            "rrule",
            "rdate",
            "exrule",
            "exdate",
            "duration",
            "original_id",
            "originalAllDay",
            "originalInstanceTime",
            "eventStatus",
            "deleted", "dirty", "_sync_id", "sync_data1", "sync_data2", "uid2445",
        )
        private fun contentValues(values: Map<String, String?>) = ContentValues().apply {
            values.forEach { (key, value) -> if (value == null) putNull(key) else put(key, value) }
        }
        private fun selection(values: Map<String, String?>): Pair<String, Array<String>> {
            require(values.keys.all { it in COLUMNS })
            val args = mutableListOf<String>()
            return values.entries.joinToString(" AND ") { (key, value) ->
                if (value == null) {
                    "$key IS NULL"
                } else {
                    args += value
                    "$key=?"
                }
            } to args.toTypedArray()
        }
    }
}
