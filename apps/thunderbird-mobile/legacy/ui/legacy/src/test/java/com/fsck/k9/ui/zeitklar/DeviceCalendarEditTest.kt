package com.fsck.k9.ui.zeitklar

import android.Manifest
import android.app.Application
import android.content.ContentProvider
import android.content.ContentValues
import android.content.OperationApplicationException
import android.content.pm.ProviderInfo
import android.database.Cursor
import android.database.MatrixCursor
import android.net.Uri
import android.provider.CalendarContract
import androidx.test.core.app.ApplicationProvider
import assertk.assertThat
import assertk.assertions.isEqualTo
import net.thunderbird.core.android.testing.RobolectricTest
import org.junit.Before
import org.junit.Test
import org.robolectric.Shadows.shadowOf
import org.robolectric.shadows.ShadowContentResolver

class DeviceCalendarEditTest : RobolectricTest() {
    private val context = ApplicationProvider.getApplicationContext<Application>()
    private val provider = FakeCalendarProvider()

    @Before
    fun setup() {
        shadowOf(context).grantPermissions(Manifest.permission.READ_CALENDAR, Manifest.permission.WRITE_CALENDAR)
        provider.attachInfo(context, ProviderInfo().apply { authority = CalendarContract.AUTHORITY })
        ShadowContentResolver.registerProviderInternal(CalendarContract.AUTHORITY, provider)
    }

    private fun snapshot() = DeviceCalendarStore.EditSnapshot(
        42, DeviceEventVersion.columns.associateWith { if (it == "calendar_id") "1" else null },
        DeviceCalendar(1, "Local test", "#168a63", "Local", true),
    )

    @Test
    fun updateUsesExistingRowAndNeverInsertsADuplicate() {
        val testSubject = DeviceCalendarStore
        testSubject.updateEvent(context, snapshot(), ContentValues().apply {
            put(CalendarContract.Events.CALENDAR_ID, 1L)
            put(CalendarContract.Events.TITLE, "Changed")
        })
        assertThat(provider.lastUri).isEqualTo(CalendarContract.Events.CONTENT_URI)
        val (where, args) = DeviceEventVersion.selection(snapshot().values)
        assertThat(provider.lastSelection).isEqualTo("_id=? AND ($where)")
        assertThat(provider.lastArgs).isEqualTo(listOf("42", *args))
        assertThat(provider.updates).isEqualTo(1)
        assertThat(provider.inserts).isEqualTo(0)
    }

    @Test(expected = OperationApplicationException::class)
    fun concurrentChangeIsRejectedWhenCompareAndSetMatchesNoRows() {
        provider.affectedRows = 0
        DeviceCalendarStore.updateEvent(context, snapshot(), ContentValues().apply {
            put(CalendarContract.Events.CALENDAR_ID, 1L)
        })
    }

    @Test
    fun movingAnEventToAnotherCalendarIsRejectedBeforeWriting() {
        val failure = runCatching {
            DeviceCalendarStore.updateEvent(context, snapshot(), ContentValues().apply {
                put(CalendarContract.Events.CALENDAR_ID, 2L)
            })
        }.exceptionOrNull()
        assertThat(failure is IllegalArgumentException).isEqualTo(true)
        assertThat(provider.updates).isEqualTo(0)
    }

    @Test
    fun hiddenButWritableCalendarDoesNotMakeItsExistingEventReadOnly() {
        val testSubject = DeviceCalendarStore
        assertThat(testSubject.editSnapshot(context, 42)?.calendar?.id).isEqualTo(1L)
    }

    @Test
    fun providerReadOnlyCalendarStillCannotBeEdited() {
        provider.writable = false
        assertThat(DeviceCalendarStore.editSnapshot(context, 42)).isEqualTo(null)
    }

    internal class FakeCalendarProvider : ContentProvider() {
        var affectedRows = 1
        var updates = 0
        var inserts = 0
        var lastUri: Uri? = null
        var lastSelection: String? = null
        var lastArgs: List<String> = emptyList()
        var writable = true
        var hasCalendars = true
        var accountName = "user@example.invalid"
        var accountType = "com.google"
        var calendarMarker: String? = null
        override fun onCreate() = true
        override fun getType(uri: Uri): String? = null
        override fun query(
            uri: Uri,
            projection: Array<out String>?,
            selection: String?,
            selectionArgs: Array<out String>?,
            sortOrder: String?,
        ): Cursor {
            val columns = requireNotNull(projection)
            return MatrixCursor(columns).apply {
                if (uri.path?.startsWith("/calendars") == true) {
                    if (selection == null && hasCalendars) addRow(columns.map {
                        when (it) {
                            "_id" -> 1L
                            "calendar_displayName" -> "Hidden Google calendar"
                            "calendar_color" -> 0
                            "account_type" -> accountType
                            "cal_sync1" -> calendarMarker
                            "account_name" -> accountName
                            "calendar_access_level" -> if (writable) 700 else 200
                            "visible" -> 0
                            else -> null
                        }
                    })
                } else {
                    addRow(columns.map { if (it == "calendar_id") "1" else null })
                }
            }
        }
        override fun delete(uri: Uri, selection: String?, selectionArgs: Array<out String>?) = 0
        override fun insert(uri: Uri, values: ContentValues?): Uri? { inserts++; return uri }
        override fun update(
            uri: Uri,
            values: ContentValues?,
            selection: String?,
            selectionArgs: Array<out String>?,
        ): Int {
            require(uri.pathSegments.size == 1 || selection.isNullOrBlank()) {
                "Selection not permitted for individual event URI"
            }
            lastUri = uri
            lastSelection = selection
            lastArgs = selectionArgs?.toList().orEmpty()
            updates++
            return affectedRows
        }
    }
}
