package net.thunderbird.feature.calendar.internal

import android.Manifest
import android.content.ContentProvider
import android.content.ContentValues
import android.content.Context
import android.content.pm.ProviderInfo
import android.database.Cursor
import android.database.MatrixCursor
import android.net.Uri
import android.provider.CalendarContract
import assertk.assertThat
import assertk.assertions.isEqualTo
import net.thunderbird.core.android.testing.RobolectricTest
import org.junit.Before
import org.junit.Test
import org.robolectric.RuntimeEnvironment
import org.robolectric.Shadows.shadowOf
import org.robolectric.shadows.ShadowContentResolver

class AndroidCalendarCatalogTest : RobolectricTest() {
    private val context = RuntimeEnvironment.getApplication()
    private val preferences get() = context.getSharedPreferences("tb_connect_calendar_view", Context.MODE_PRIVATE)
    private val testSubject = AndroidCalendarCatalog(context)

    @Before
    fun setup() {
        preferences.edit().clear().commit()
        shadowOf(context).grantPermissions(Manifest.permission.READ_CALENDAR)
        val provider = SyntheticCalendars()
        provider.attachInfo(context, ProviderInfo().apply { authority = CalendarContract.AUTHORITY })
        ShadowContentResolver.registerProviderInternal(CalendarContract.AUTHORITY, provider)
    }

    @Test
    fun existingAndroidAccountsAndRightsAreReadWithoutNewLogin() {
        val calendars = testSubject.calendars()
        assertThat(calendars.map { it.account }).isEqualTo(listOf("saved@example.invalid", "saved@example.invalid"))
        assertThat(calendars.map { it.writable }).isEqualTo(listOf(true, false))
        assertThat(calendars.map { it.selected }).isEqualTo(listOf(true, false))
    }

    @Test
    fun selectionSurvivesNewCatalogInstanceWithoutChangingProviderRows() {
        testSubject.calendars()
        testSubject.setSelected(1, false)
        testSubject.setSelected(2, true)
        assertThat(AndroidCalendarCatalog(context).calendars().map { it.selected }).isEqualTo(listOf(false, true))
    }

    @Test
    fun deviceSelectionPreservesExistingDesktopFilters() {
        preferences.edit().putStringSet("hidden_calendar_ids", setOf("desktop:source")).commit()
        testSubject.calendars()
        testSubject.setSelected(1, false)
        val hidden = preferences.getStringSet("hidden_calendar_ids", emptySet()).orEmpty()
        assertThat("desktop:source" in hidden).isEqualTo(true)
    }

    private class SyntheticCalendars : ContentProvider() {
        override fun onCreate() = true
        override fun getType(uri: Uri): String? = null
        override fun query(
            uri: Uri,
            projection: Array<out String>?,
            selection: String?,
            selectionArgs: Array<out String>?,
            sortOrder: String?,
        ): Cursor = MatrixCursor(projection).apply {
            addRow(arrayOf<Any?>(1, "Work", "saved@example.invalid", "com.google", -16776961, 700, 1, null))
            addRow(arrayOf<Any?>(2, "Shared", "saved@example.invalid", "com.google", -16711936, 200, 0, null))
        }
        override fun insert(uri: Uri, values: ContentValues?): Uri = error("Provider must remain unchanged")
        override fun update(
            uri: Uri,
            values: ContentValues?,
            selection: String?,
            selectionArgs: Array<out String>?,
        ): Int =
            error("Provider must remain unchanged")
        override fun delete(uri: Uri, selection: String?, selectionArgs: Array<out String>?): Int =
            error("Provider must remain unchanged")
    }
}
