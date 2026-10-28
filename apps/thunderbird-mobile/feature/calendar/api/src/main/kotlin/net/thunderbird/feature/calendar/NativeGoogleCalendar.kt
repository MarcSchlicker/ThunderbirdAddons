package net.thunderbird.feature.calendar

import android.content.Intent
import net.thunderbird.core.calendar.CalDavCalendar
import net.thunderbird.core.calendar.CalDavSession

/** Embedded Google authorization; no separate sync application owns this session. */
interface NativeGoogleCalendar {
    fun authorizationIntent(email: String): Intent
    suspend fun completeAuthorization(email: String, result: Intent)
    val configurationAvailable: Boolean get() = true
    val accountEmails: List<String> get() = emptyList()
    val calendarProblems: Map<Long, CalendarSyncProblem> get() = emptyMap()
    val activeCalendars: Map<String, Set<String>> get() = emptyMap()
    fun connected(email: String): Boolean
    suspend fun session(email: String): CalDavSession
    suspend fun activate(email: String, calendar: CalDavCalendar): NativeCalendarSyncResult
    suspend fun synchronizeAll(): NativeCalendarSyncResult
    fun ensurePeriodicSync() = scheduleSync()
    fun scheduleSync(force: Boolean = false)
    fun needsSetup(email: String): Boolean = false
    suspend fun calendars(email: String): List<CalDavCalendar> = session(email).use { it.discover() }
}

enum class CalendarAuthError {
    CONFIGURATION,
    API_DISABLED,
    PERMISSION_REQUIRED,
    ACCESS_DENIED,
    RATE_LIMITED,
    CANCELED,
    REAUTHORIZE,
    WRONG_ACCOUNT,
    SERVICE_UNAVAILABLE,
}
class CalendarAuthFailure(val error: CalendarAuthError) : Exception(error.name)

enum class CalendarSyncProblem { CONNECTION, AUTHORIZATION, CONFLICT, READ_ONLY }

/** Counts plus local provider IDs for calendar-specific UI; do not export IDs in diagnostics. */
data class NativeCalendarSyncResult(
    val calendars: Int = 0,
    val uploaded: Int = 0,
    val downloaded: Int = 0,
    val conflicts: Int = 0,
    val failures: Int = 0,
    val reauthorizationRequired: Boolean = false,
    val calendarProblems: Map<Long, CalendarSyncProblem> = emptyMap(),
)

/** Qualifier for an explicitly configured calendar client, independent from mail OAuth. */
const val GOOGLE_CALENDAR_OAUTH_CONFIGURATION = "GoogleCalendarOAuthConfiguration"
