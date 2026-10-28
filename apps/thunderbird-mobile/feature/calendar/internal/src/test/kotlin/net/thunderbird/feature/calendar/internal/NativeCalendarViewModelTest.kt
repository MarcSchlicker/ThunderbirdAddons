package net.thunderbird.feature.calendar.internal

import android.content.Intent
import assertk.assertThat
import assertk.assertions.isEqualTo
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import net.thunderbird.core.android.testing.RobolectricTest
import net.thunderbird.core.calendar.CalDavCalendar
import net.thunderbird.core.calendar.CalDavSession
import net.thunderbird.feature.calendar.CalendarAuthError
import net.thunderbird.feature.calendar.NativeCalendarSyncResult
import net.thunderbird.feature.calendar.NativeGoogleCalendar
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class NativeCalendarViewModelTest : RobolectricTest() {
    @Test
    fun emptySyncWithoutConsentNeverClaimsConnected() = verifyStatus(false, NativeCalendarStatus.CONSENT_REQUIRED)

    @Test
    fun consentWithoutActivatedCalendarStillRequiresSelection() =
        verifyStatus(true, NativeCalendarStatus.SELECT_CALENDAR)

    @Test
    fun revokedAuthorizationRequiresConsentEvenAfterEarlierSuccessfulSync() = runTest {
        val dispatcher = StandardTestDispatcher(testScheduler)
        Dispatchers.setMain(dispatcher)
        try {
            val google = FakeGoogle(true)
            google.result = NativeCalendarSyncResult(calendars = 1, reauthorizationRequired = true)
            val testSubject = NativeCalendarViewModel(google, dispatcher)
            testSubject.onEvent(NativeCalendarEvent.Synchronize)
            advanceUntilIdle()
            assertThat(testSubject.state.value.status).isEqualTo(NativeCalendarStatus.CONSENT_REQUIRED)
        } finally {
            Dispatchers.resetMain()
        }
    }

    @Test
    fun missingAppClientDoesNotAskTheUserForConsent() = runTest {
        val dispatcher = StandardTestDispatcher(testScheduler)
        Dispatchers.setMain(dispatcher)
        try {
            val google = FakeGoogle(false, configured = false)
            val testSubject = NativeCalendarViewModel(google, dispatcher)
            testSubject.onEvent(NativeCalendarEvent.Load("user@example.invalid"))
            advanceUntilIdle()
            assertThat(testSubject.state.value.status).isEqualTo(NativeCalendarStatus.ERROR)
            assertThat(testSubject.state.value.authError).isEqualTo(CalendarAuthError.CONFIGURATION)
        } finally {
            Dispatchers.resetMain()
        }
    }

    private fun verifyStatus(connected: Boolean, expected: NativeCalendarStatus) = runTest {
        val dispatcher = StandardTestDispatcher(testScheduler)
        Dispatchers.setMain(dispatcher)
        try {
            val testSubject = NativeCalendarViewModel(FakeGoogle(connected), dispatcher)
            testSubject.onEvent(NativeCalendarEvent.Synchronize)
            advanceUntilIdle()
            assertThat(testSubject.state.value.status).isEqualTo(expected)
        } finally {
            Dispatchers.resetMain()
        }
    }

    private class FakeGoogle(
        private val authorized: Boolean,
        private val configured: Boolean = true,
    ) : NativeGoogleCalendar {
        var result = NativeCalendarSyncResult()
        override val configurationAvailable get() = configured
        override fun connected(email: String) = authorized
        override suspend fun synchronizeAll() = result
        override fun authorizationIntent(email: String): Intent = error("Not used")
        override suspend fun completeAuthorization(email: String, result: Intent) = Unit
        override suspend fun session(email: String): CalDavSession = error("Not used")
        override suspend fun activate(
            email: String,
            calendar: CalDavCalendar,
        ): NativeCalendarSyncResult = error("Not used")
        override fun scheduleSync(force: Boolean) = Unit
    }
}
