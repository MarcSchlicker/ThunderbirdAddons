package com.fsck.k9.ui.zeitklar

import android.content.Intent
import net.thunderbird.core.calendar.CalDavCalendar
import net.thunderbird.core.calendar.CalDavSession
import net.thunderbird.feature.calendar.NativeGoogleCalendar
import net.thunderbird.feature.calendar.NativeCalendarSyncResult
import android.Manifest
import android.app.Application
import android.content.pm.ProviderInfo
import android.provider.CalendarContract
import androidx.test.core.app.ApplicationProvider
import assertk.assertThat
import assertk.assertions.isEqualTo
import com.fsck.k9.Preferences
import net.thunderbird.core.android.testing.RobolectricTest
import org.json.JSONObject
import org.junit.Before
import org.junit.Test
import org.mockito.kotlin.mock
import org.robolectric.Shadows.shadowOf
import org.robolectric.shadows.ShadowContentResolver

class GoogleCalendarSetupTest : RobolectricTest() {
    private val context = ApplicationProvider.getApplicationContext<Application>()
    private val provider = DeviceCalendarEditTest.FakeCalendarProvider()
    private val repository = GoogleCalendarSetupRepository(context, mock<Preferences>())

    @Before
    fun setup() {
        context.getSharedPreferences("google_calendar_dav_bindings", Application.MODE_PRIVATE).edit().clear().commit()
        shadowOf(context).grantPermissions(Manifest.permission.READ_CALENDAR, Manifest.permission.WRITE_CALENDAR)
        provider.attachInfo(context, ProviderInfo().apply { authority = CalendarContract.AUTHORITY })
        ShadowContentResolver.registerProviderInternal(CalendarContract.AUTHORITY, provider)
    }

    @Test
    fun nativeCalendarRequiresOwnMarkerAndLiveAuthorization() {
        provider.accountType = CalendarContract.ACCOUNT_TYPE_LOCAL
        provider.calendarMarker = "tbconnect-native-google-v1"
        val google = FakeNativeGoogle()
        val testSubject = GoogleCalendarSetupRepository(context, mock<Preferences>(), google)
        assertThat(testSubject.read("user@example.invalid")).isEqualTo(GoogleCalendarSetupStatus.READY)
        google.authorized = false
        assertThat(testSubject.read("user@example.invalid")).isEqualTo(GoogleCalendarSetupStatus.ACCOUNT_REQUIRED)
        google.authorized = true
        provider.calendarMarker = null
        assertThat(testSubject.read("user@example.invalid")).isEqualTo(GoogleCalendarSetupStatus.ACCOUNT_REQUIRED)
    }

    private class FakeNativeGoogle : NativeGoogleCalendar {
        var authorized = true
        override fun connected(email: String) = authorized
        override fun authorizationIntent(email: String): Intent = error("Not used")
        override suspend fun completeAuthorization(email: String, result: Intent) = Unit
        override suspend fun session(email: String): CalDavSession = error("Not used")
        override suspend fun activate(email: String, calendar: CalDavCalendar): NativeCalendarSyncResult = error("Not used")
        override suspend fun synchronizeAll() = NativeCalendarSyncResult()
        override fun scheduleSync(force: Boolean) = Unit
    }

    @Test
    fun matchingGoogleAccountWithWritableCalendarIsReadyEvenWhenHidden() {
        assertThat(repository.read("USER@example.invalid")).isEqualTo(GoogleCalendarSetupStatus.READY)
    }

    @Test
    fun anUnspecifiedAccountCannotBeReportedAsConnected() {
        assertThat(repository.read("")).isEqualTo(GoogleCalendarSetupStatus.ACCOUNT_SELECTION_REQUIRED)
    }

    @Test
    fun anotherGoogleAccountCannotConfirmTheConfiguredMailAccount() {
        assertThat(repository.read("other@example.invalid")).isEqualTo(GoogleCalendarSetupStatus.ACCOUNT_REQUIRED)
    }

    @Test
    fun anotherProviderWithTheSameEmailCannotConfirmGoogleSignIn() {
        provider.accountType = "local"
        assertThat(repository.read("user@example.invalid")).isEqualTo(GoogleCalendarSetupStatus.ACCOUNT_REQUIRED)
    }

    @Test
    fun revokedPermissionIsDetectedOnTheNextCheck() {
        assertThat(repository.read("user@example.invalid")).isEqualTo(GoogleCalendarSetupStatus.READY)
        shadowOf(context).denyPermissions(Manifest.permission.WRITE_CALENDAR)
        assertThat(repository.read("user@example.invalid")).isEqualTo(GoogleCalendarSetupStatus.PERMISSION_REQUIRED)
    }

    @Test
    fun readOnlyAndNewlySyncedCalendarsAreRechecked() {
        provider.writable = false
        assertThat(repository.read("user@example.invalid")).isEqualTo(GoogleCalendarSetupStatus.READ_ONLY)
        provider.writable = true
        assertThat(repository.read("user@example.invalid")).isEqualTo(GoogleCalendarSetupStatus.READY)
    }

    @Test
    fun desktopGoogleProviderProfilesOfferGoogleSetup() {
        val profile = MobileCalendarSource.fromJson(JSONObject().put("id", "desktop-id").put("provider", "GDATA"))
        assertThat(profile?.provider).isEqualTo("Google Calendar")
    }
    @Test
    fun davAccountNameAloneDoesNotConfirmGoogleIdentity() {
        provider.accountType = DavCalendarIntegration.ACCOUNT_TYPE
        assertThat(repository.read("user@example.invalid"))
            .isEqualTo(GoogleCalendarSetupStatus.DAV_CALENDAR_SELECTION_REQUIRED)
    }

    @Test
    fun explicitDavBindingUsesCalendarIdentityAndRechecksWritePermission() {
        provider.accountType = DavCalendarIntegration.ACCOUNT_TYPE
        repository.bindDavCalendar("USER@example.invalid", 1L)
        assertThat(repository.read("user@example.invalid")).isEqualTo(GoogleCalendarSetupStatus.READY)
        assertThat(repository.read("other@example.invalid"))
            .isEqualTo(GoogleCalendarSetupStatus.DAV_CALENDAR_SELECTION_REQUIRED)
        provider.writable = false
        assertThat(repository.read("user@example.invalid")).isEqualTo(GoogleCalendarSetupStatus.READ_ONLY)
    }

    @Test
    fun removedOrReplacedDavAccountInvalidatesItsBinding() {
        provider.accountType = DavCalendarIntegration.ACCOUNT_TYPE
        repository.bindDavCalendar("user@example.invalid", 1L)
        provider.accountName = "replacement"
        assertThat(repository.read("user@example.invalid"))
            .isEqualTo(GoogleCalendarSetupStatus.DAV_CALENDAR_SELECTION_REQUIRED)
        provider.hasCalendars = false
        assertThat(repository.read("user@example.invalid")).isEqualTo(GoogleCalendarSetupStatus.ACCOUNT_REQUIRED)
    }

    @Test
    fun davLoginIntentTargetsVerifiedExportedActivityWithoutCredentials() {
        val request = DavCalendarIntegration.loginIntent("user@example.invalid")
        assertThat(request.component?.packageName).isEqualTo("at.bitfire.davdroid")
        assertThat(request.component?.className).isEqualTo("at.bitfire.davdroid.ui.setup.LoginActivity")
        assertThat(request.getStringExtra("username")).isEqualTo("user@example.invalid")
        assertThat(request.hasExtra("password")).isEqualTo(false)
        assertThat(request.data).isEqualTo(null)
    }

}
