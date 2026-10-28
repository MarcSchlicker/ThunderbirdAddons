package net.thunderbird.feature.calendar.internal

import android.Manifest
import android.app.Application
import android.content.ContentProvider
import android.content.ContentProviderOperation
import android.content.ContentProviderResult
import android.content.ContentUris
import android.content.ContentValues
import android.content.pm.ProviderInfo
import android.database.Cursor
import android.database.sqlite.SQLiteDatabase
import android.net.Uri
import android.provider.CalendarContract
import assertk.assertThat
import assertk.assertions.isEqualTo
import net.thunderbird.core.android.testing.RobolectricTest
import net.thunderbird.core.calendar.CalDavCalendar
import net.thunderbird.core.calendar.CalDavObject
import org.junit.Before
import org.junit.Test
import org.robolectric.RuntimeEnvironment
import org.robolectric.Shadows.shadowOf
import org.robolectric.shadows.ShadowContentResolver

class AndroidCalendarReplicaTest : RobolectricTest() {
    private val context = RuntimeEnvironment.getApplication()
    private val provider = SqlCalendarProvider()
    private val testSubject = AndroidCalendarReplica(context)
    private val codec = IcsEventCodec()
    private lateinit var binding: NativeCalendarBinding

    @Before
    fun setup() {
        shadowOf(context).grantPermissions(Manifest.permission.READ_CALENDAR, Manifest.permission.WRITE_CALENDAR)
        provider.attachInfo(context, ProviderInfo().apply { authority = CalendarContract.AUTHORITY })
        ShadowContentResolver.registerProviderInternal(CalendarContract.AUTHORITY, provider)
        val id = testSubject.ensureCalendar(EMAIL, CALENDAR)
        binding = NativeCalendarBinding(id, EMAIL, CALENDAR)
    }

    @Test
    fun uploadedSeriesDeletionPreservesConcurrentOccurrenceEdit() {
        testSubject.applyRemote(binding, listOf(bundle("Server", "v1")))
        val master = provider.firstId("events")
        provider.edit(master, "Deleted series", true)
        provider.update(
            CalendarContract.Events.CONTENT_URI,
            ContentValues().apply { put("deleted", 1) },
            "_id=?",
            arrayOf(master.toString()),
        )
        val snapshot = testSubject.dirty(binding).single()
        provider.insert(
            CalendarContract.Events.CONTENT_URI,
            ContentValues().apply {
                put("calendar_id", binding.id)
                put("original_id", master)
                put("title", "Concurrent occurrence edit")
                put("dirty", 1)
                put("deleted", 0)
            },
        )
        testSubject.removeUploadedDeletion(binding, snapshot)
        assertThat(provider.count("events")).isEqualTo(2)
    }

    @Test
    fun calendarActivationReusesIdentityAndRefreshesServerWriteAccess() {
        val id = testSubject.ensureCalendar(EMAIL, CALENDAR.copy(writable = false))
        assertThat(id).isEqualTo(binding.id)
        assertThat(provider.count("calendars")).isEqualTo(1)
        assertThat(provider.value("calendars", id, "calendar_access_level")).isEqualTo("200")
    }

    @Test
    fun remoteUpdateRetainsExistingEventRowInsteadOfCreatingCopy() {
        testSubject.applyRemote(binding, listOf(bundle("First", "v1")))
        val id = provider.firstId("events")
        testSubject.applyRemote(binding, listOf(bundle("Changed", "v2")))
        assertThat(provider.count("events")).isEqualTo(1)
        assertThat(provider.firstId("events")).isEqualTo(id)
        assertThat(provider.value("events", id, "title")).isEqualTo("Changed")
    }

    @Test
    fun queuedLocalChangeIsPreservedDuringRemoteRefresh() {
        testSubject.applyRemote(binding, listOf(bundle("Server", "v1")))
        val id = provider.firstId("events")
        provider.edit(id, "Local", true)
        testSubject.applyRemote(binding, listOf(bundle("Remote changed", "v2")))
        assertThat(provider.value("events", id, "title")).isEqualTo("Local")
        assertThat(testSubject.dirty(binding).size).isEqualTo(1)
    }

    @Test
    fun uploadAcknowledgementPreservesEditMadeWhileRequestWasInFlight() {
        testSubject.applyRemote(binding, listOf(bundle("Server", "v1")))
        val id = provider.firstId("events")
        provider.edit(id, "First edit", true)
        val snapshot = testSubject.dirty(binding).single()
        provider.edit(id, "Second edit", true)
        testSubject.acknowledge(binding, snapshot, "\"v2\"", RAW)
        assertThat(provider.value("events", id, "title")).isEqualTo("Second edit")
        assertThat(provider.value("events", id, "sync_data1")).isEqualTo("\"v2\"")
        assertThat(provider.value("events", id, "dirty")).isEqualTo("1")
    }

    @Test
    fun unchangedUploadedSnapshotBecomesClean() {
        testSubject.applyRemote(binding, listOf(bundle("Server", "v1")))
        val id = provider.firstId("events")
        provider.edit(id, "Edit", true)
        testSubject.acknowledge(binding, testSubject.dirty(binding).single(), "\"v2\"", RAW)
        assertThat(testSubject.dirty(binding).size).isEqualTo(0)
    }

    @Test
    fun ownershipMismatchPreventsReadingOrChangingAnotherCalendar() {
        provider.db.update(
            "calendars",
            ContentValues().apply { put("cal_sync1", "other-app") },
            "_id=?",
            arrayOf(binding.id.toString()),
        )
        assertThat(runCatching { testSubject.dirty(binding) }.isFailure).isEqualTo(true)
        assertThat(provider.count("events")).isEqualTo(0)
    }

    @Test
    fun authoritativeRemoteDeletionOnlyRemovesCleanManagedEvents() {
        testSubject.applyRemote(binding, listOf(bundle("Server", "v1")))
        testSubject.applyRemote(binding, emptyList())
        assertThat(provider.count("events")).isEqualTo(0)
    }

    @Test
    fun dirtySeriesExceptionProtectsEntireResourceFromRemoteDeletion() {
        val series = seriesBundle()
        testSubject.applyRemote(binding, listOf(series))
        val child = provider.db.query("events", arrayOf("_id"), "original_id IS NOT NULL", null, null, null, null)
            .use {
                it.moveToFirst()
                it.getLong(0)
            }
        provider.edit(child, "Pending exception", true)
        testSubject.applyRemote(binding, emptyList())
        assertThat(provider.count("events")).isEqualTo(2)
        assertThat(provider.value("events", child, "title")).isEqualTo("Pending exception")
    }

    @Test
    fun concurrentUndeleteIsNotRemovedByOlderDeleteAcknowledgement() {
        testSubject.applyRemote(binding, listOf(bundle("Server", "v1")))
        val id = provider.firstId("events")
        provider.db.update(
            "events",
            ContentValues().apply {
                put(
                    "dirty",
                    1,
                )
                put(
                    "deleted",
                    1,
                )
            },
            "_id=?",
            arrayOf(id.toString()),
        )
        val snapshot = testSubject.dirty(binding).single()
        provider.db.update("events", ContentValues().apply { put("deleted", 0) }, "_id=?", arrayOf(id.toString()))
        testSubject.removeUploadedDeletion(binding, snapshot)
        assertThat(provider.count("events")).isEqualTo(1)
    }

    @Test
    fun uploadReceiptDoesNotClearReminderChangedDuringRequest() {
        val source = bundle("Server", "v1")
        testSubject.applyRemote(binding, listOf(source))
        val id = provider.firstId("events")
        provider.edit(id, "Edit", true)
        val snapshot = testSubject.dirty(binding).single()
        provider.db.insert(
            "reminders",
            null,
            ContentValues().apply {
                put(
                    "event_id",
                    id,
                )
                put(
                    "minutes",
                    10,
                )
                put(
                    "method",
                    1,
                )
            },
        )
        testSubject.acknowledge(binding, snapshot, "\"v2\"", RAW)
        assertThat(provider.value("events", id, "dirty")).isEqualTo("1")
        assertThat(provider.value("events", id, "sync_data1")).isEqualTo("\"v2\"")
    }

    @Test
    fun exceptionUploadAdvancesSharedETagWithoutClearingOtherLocalEdits() {
        testSubject.applyRemote(binding, listOf(seriesBundle()))
        val child = provider.db.query("events", arrayOf("_id"), "original_id IS NOT NULL", null, null, null, null)
            .use {
                it.moveToFirst()
                it.getLong(0)
            }
        provider.edit(child, "Edited occurrence", true)
        val prepared = requireNotNull(testSubject.prepareIdentity(binding, testSubject.dirty(binding).single()))
        testSubject.acknowledge(binding, prepared, "\"v2\"", codec.encode(prepared))
        val master = provider.firstId("events")
        assertThat(provider.value("events", master, "sync_data1")).isEqualTo("\"v2\"")
        assertThat(provider.value("events", child, "sync_data1")).isEqualTo("\"v2\"")
        assertThat(provider.value("events", child, "dirty")).isEqualTo("0")
    }

    private fun bundle(title: String, tag: String): RemoteCalendarObject {
        val raw = RAW.replace("SUMMARY:Server", "SUMMARY:$title")
        return RemoteCalendarObject(CalDavObject(EVENT, "\"$tag\"", raw), codec.decode(raw))
    }

    private fun seriesBundle(): RemoteCalendarObject {
        val raw = "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Test//DE\r\n" +
            "BEGIN:VEVENT\r\nUID:series\r\nDTSTART:20261023T100000Z\r\nDTEND:20261023T110000Z\r\n" +
            "RRULE:FREQ=DAILY;COUNT=3\r\nEND:VEVENT\r\n" +
            "BEGIN:VEVENT\r\nUID:series\r\nRECURRENCE-ID:20261024T100000Z\r\n" +
            "DTSTART:20261024T120000Z\r\nDTEND:20261024T130000Z\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n"
        return RemoteCalendarObject(CalDavObject(EVENT, "\"v1\"", raw), codec.decode(raw))
    }

    private class SqlCalendarProvider : ContentProvider() {
        lateinit var db: SQLiteDatabase
        override fun onCreate(): Boolean {
            db = SQLiteDatabase.create(null)
            db.execSQL(
                """CREATE TABLE calendars (_id INTEGER PRIMARY KEY AUTOINCREMENT,
                account_name TEXT, account_type TEXT, name TEXT, calendar_displayName TEXT, ownerAccount TEXT,
                calendar_color INTEGER, calendar_access_level INTEGER, calendar_timezone TEXT,
                visible INTEGER, sync_events INTEGER, cal_sync1 TEXT, cal_sync2 TEXT)""",
            )
            val columns = AndroidCalendarReplica.COLUMNS.filter { it != "_id" }.joinToString(",") { "$it TEXT" }
            db.execSQL(
                """CREATE TABLE events (_id INTEGER PRIMARY KEY AUTOINCREMENT,
                $columns, original_sync_id TEXT)""",
            )
            db.execSQL(
                """CREATE TABLE reminders (_id INTEGER PRIMARY KEY AUTOINCREMENT,
                event_id INTEGER, minutes INTEGER, method INTEGER)""",
            )
            return true
        }
        override fun getType(uri: Uri): String? = null
        override fun query(
            uri: Uri,
            projection: Array<out String>?,
            selection: String?,
            selectionArgs: Array<out String>?,
            sortOrder: String?,
        ): Cursor =
            db.query(table(uri), projection, selection, selectionArgs, null, null, sortOrder)
        override fun insert(uri: Uri, values: ContentValues?): Uri = ContentUris.withAppendedId(
            uri,
            db.insertOrThrow(table(uri), null, values),
        )
        override fun update(
            uri: Uri,
            values: ContentValues?,
            selection: String?,
            selectionArgs: Array<out String>?,
        ): Int {
            // AOSP treats any calendar selection starting with _id= as a literal numeric ID.
            if (table(uri) == "calendars" && selection?.startsWith("_id=") == true && selection != "_id=?") {
                selection.substring(4).toLong()
            }
            return db.update(table(uri), values, selection, selectionArgs)
        }
        override fun delete(
            uri: Uri,
            selection: String?,
            selectionArgs: Array<out String>?,
        ): Int = db.delete(
            table(uri),
            selection,
            selectionArgs,
        )
        override fun applyBatch(operations: ArrayList<ContentProviderOperation>): Array<ContentProviderResult> {
            db.beginTransaction()
            return try {
                super.applyBatch(operations).also { db.setTransactionSuccessful() }
            } finally {
                db.endTransaction()
            }
        }
        fun count(table: String) = db.rawQuery(
            "SELECT COUNT(*) FROM $table",
            null,
        ).use {
            it.moveToFirst()
            it.getInt(0)
        }
        fun firstId(table: String) = db.rawQuery(
            "SELECT _id FROM $table ORDER BY _id",
            null,
        ).use {
            it.moveToFirst()
            it.getLong(0)
        }
        fun value(table: String, id: Long, column: String): String? = db.query(
            table,
            arrayOf(column),
            "_id=?",
            arrayOf(id.toString()),
            null,
            null,
            null,
        ).use {
            it.moveToFirst()
            if (it.isNull(0)) null else it.getString(0)
        }
        fun edit(id: Long, title: String, dirty: Boolean) {
            db.update(
                "events",
                ContentValues().apply {
                    put("title", title)
                    put("dirty", if (dirty) 1 else 0)
                },
                "_id=?",
                arrayOf(id.toString()),
            )
        }
        private fun table(uri: Uri) = requireNotNull(uri.pathSegments.firstOrNull()).also {
            require(it in setOf("events", "calendars", "reminders"))
        }
    }

    companion object {
        private const val EMAIL = "user@example.invalid"
        private const val EVENT = "https://cloud.example.invalid/work/a.ics"
        private val CALENDAR = CalDavCalendar("https://cloud.example.invalid/work/", "Work", true)
        private val RAW =
            IcsEventCodecTest.calendar("SUMMARY:Server\r\nDTSTART:20261023T100000Z\r\nDTEND:20261023T110000Z")
    }
}
