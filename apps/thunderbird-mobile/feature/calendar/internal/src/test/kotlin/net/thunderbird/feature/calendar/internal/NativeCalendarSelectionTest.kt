package net.thunderbird.feature.calendar.internal

import android.content.Intent
import assertk.assertThat
import assertk.assertions.isEqualTo
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import net.thunderbird.core.android.testing.RobolectricTest
import net.thunderbird.core.calendar.CalDavCalendar
import net.thunderbird.core.calendar.CalDavSession
import net.thunderbird.feature.calendar.NativeCalendarSyncResult
import net.thunderbird.feature.calendar.NativeGoogleCalendar
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class NativeCalendarSelectionTest : RobolectricTest() {
    @Test
    fun reopeningRestoresSavedAccountAndActiveCalendarWithoutConsent() = verify { google, testSubject ->
        google.active = setOf(FIRST.url)
        testSubject.onEvent(NativeCalendarEvent.Load(""))
        advanceUntilIdle()
        assertThat(testSubject.state.value.email).isEqualTo(EMAIL)
        assertThat(testSubject.state.value.authorized).isEqualTo(true)
        assertThat(testSubject.state.value.activeUrls).isEqualTo(setOf(FIRST.url))
        assertThat(testSubject.state.value.selectedUrls).isEqualTo(emptySet())
        assertThat(testSubject.state.value.status).isEqualTo(NativeCalendarStatus.CONNECTED)
    }

    @Test
    fun onlySelectedCalendarsAreImported() = verify { google, testSubject ->
        testSubject.onEvent(NativeCalendarEvent.Load(""))
        advanceUntilIdle()
        testSubject.onEvent(NativeCalendarEvent.ToggleCalendar(SECOND.url))
        testSubject.onEvent(NativeCalendarEvent.ImportSelected)
        advanceUntilIdle()
        assertThat(google.imported).isEqualTo(listOf(SECOND.url))
        assertThat(testSubject.state.value.activeUrls).isEqualTo(setOf(SECOND.url))
        assertThat(testSubject.state.value.selectedUrls).isEqualTo(emptySet())
    }

    @Test
    fun partialFailurePreservesSuccessfulImportAndRemainingSelection() = verify { google, testSubject ->
        google.failUrl = SECOND.url
        testSubject.onEvent(NativeCalendarEvent.Load(""))
        advanceUntilIdle()
        testSubject.onEvent(NativeCalendarEvent.ToggleCalendar(FIRST.url))
        testSubject.onEvent(NativeCalendarEvent.ToggleCalendar(SECOND.url))
        testSubject.onEvent(NativeCalendarEvent.ImportSelected)
        advanceUntilIdle()
        assertThat(testSubject.state.value.activeUrls).isEqualTo(setOf(FIRST.url))
        assertThat(testSubject.state.value.selectedUrls).isEqualTo(setOf(SECOND.url))
        assertThat(testSubject.state.value.status).isEqualTo(NativeCalendarStatus.ERROR)
        assertThat(testSubject.state.value.authorized).isEqualTo(true)
    }

    @Test
    fun accountChangeCannotDisplayPreviousAccountsCalendarsAfterFailure() = verify { google, testSubject ->
        testSubject.onEvent(NativeCalendarEvent.Load(""))
        advanceUntilIdle()
        google.failList = true
        testSubject.onEvent(NativeCalendarEvent.Load("other@example.invalid"))
        advanceUntilIdle()
        assertThat(testSubject.state.value.email).isEqualTo("other@example.invalid")
        assertThat(testSubject.state.value.calendars).isEqualTo(emptyList())
    }

    private fun verify(block: suspend TestScope.(FakeGoogle, NativeCalendarViewModel) -> Unit) = runTest {
        val dispatcher = StandardTestDispatcher(testScheduler)
        Dispatchers.setMain(dispatcher)
        try {
            val google = FakeGoogle()
            block(google, NativeCalendarViewModel(google, dispatcher))
        } finally {
            Dispatchers.resetMain()
        }
    }

    private class FakeGoogle : NativeGoogleCalendar {
        var active = emptySet<String>()
        var failUrl = ""
        var failList = false
        val imported = mutableListOf<String>()
        override val accountEmails get() = listOf(EMAIL)
        override val activeCalendars get() = mapOf(EMAIL to active)
        override fun connected(email: String) = email.contains('@')
        override suspend fun calendars(email: String): List<CalDavCalendar> {
            check(!failList)
            return listOf(FIRST, SECOND)
        }
        override suspend fun activate(email: String, calendar: CalDavCalendar): NativeCalendarSyncResult {
            if (calendar.url == failUrl) throw CalendarActivationFailure("PARSE_FAILED")
            imported += calendar.url
            return NativeCalendarSyncResult(calendars = 1)
        }
        override fun authorizationIntent(email: String): Intent = error("No repeated sign-in expected")
        override suspend fun completeAuthorization(email: String, result: Intent) = Unit
        override suspend fun session(email: String): CalDavSession = error("Not used")
        override suspend fun synchronizeAll() = NativeCalendarSyncResult()
        override fun scheduleSync(force: Boolean) = Unit
    }

    companion object {
        private const val EMAIL = "saved@example.invalid"
        private val FIRST = CalDavCalendar("https://example.invalid/one/", "Work", true)
        private val SECOND = CalDavCalendar("https://example.invalid/two/", "Team", false)
    }
}
