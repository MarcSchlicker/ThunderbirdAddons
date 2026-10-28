package net.thunderbird.feature.calendar.internal

import android.content.Intent
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.receiveAsFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import net.thunderbird.core.calendar.CalDavCalendar
import net.thunderbird.feature.calendar.CalendarAuthFailure
import net.thunderbird.feature.calendar.NativeCalendarSyncResult
import net.thunderbird.feature.calendar.NativeGoogleCalendar

internal enum class NativeCalendarStatus { CONSENT_REQUIRED, BUSY, SELECT_CALENDAR, CONNECTED, ERROR, WRONG_ACCOUNT }
internal data class NativeCalendarState(
    val email: String = "",
    val accounts: List<String> = emptyList(),
    val authorized: Boolean = false,
    val activeUrls: Set<String> = emptySet(),
    val selectedUrls: Set<String> = emptySet(),
    val status: NativeCalendarStatus = NativeCalendarStatus.CONSENT_REQUIRED,
    val calendars: List<CalDavCalendar> = emptyList(),
    val report: NativeCalendarSyncResult? = null,
    val activationCode: String? = null,
    val authError: net.thunderbird.feature.calendar.CalendarAuthError? = null,
)
internal sealed interface NativeCalendarEvent {
    data class Load(val email: String) : NativeCalendarEvent
    data class ChangeEmail(val email: String) : NativeCalendarEvent
    data class FinishAuthorization(val data: Intent?) : NativeCalendarEvent
    data class ToggleCalendar(val url: String) : NativeCalendarEvent
    data object ImportSelected : NativeCalendarEvent
    data object PermissionDenied : NativeCalendarEvent
    data object Authorize : NativeCalendarEvent
    data object Synchronize : NativeCalendarEvent
}

/** Public only for the app-common Koin composition boundary. UI state remains internal. */
class NativeCalendarViewModel(
    private val google: NativeGoogleCalendar,
    private val ioDispatcher: CoroutineDispatcher = Dispatchers.IO,
) : ViewModel() {
    private val current = MutableStateFlow(NativeCalendarState())
    internal val state = current.asStateFlow()
    private val effects = Channel<Intent>(Channel.BUFFERED)
    internal val authorizationIntents = effects.receiveAsFlow()
    private var job: Job? = null

    internal fun onEvent(event: NativeCalendarEvent) {
        when (event) {
            is NativeCalendarEvent.ChangeEmail -> {
                job?.cancel()
                current.value = NativeCalendarState(email = event.email.trim(), accounts = current.value.accounts)
            }

            is NativeCalendarEvent.Load -> {
                operation { refresh(event.email.trim()) }
            }

            NativeCalendarEvent.Authorize -> operation {
                effects.send(google.authorizationIntent(current.value.email.trim()))
            }

            is NativeCalendarEvent.FinishAuthorization -> operation {
                if (event.data == null) {
                    refresh(current.value.email)
                    return@operation
                }
                google.completeAuthorization(current.value.email, event.data)
                refresh(current.value.email)
            }

            is NativeCalendarEvent.ToggleCalendar -> toggleCalendar(event.url)

            NativeCalendarEvent.ImportSelected -> operation { importSelected() }

            NativeCalendarEvent.PermissionDenied -> {
                current.value =
                    current.value.copy(
                        status = NativeCalendarStatus.ERROR,
                        activationCode = "DEVICE_CALENDAR_PERMISSION",
                    )
            }

            NativeCalendarEvent.Synchronize -> operation { synchronize() }
        }
    }

    private fun toggleCalendar(url: String) {
        val state = current.value
        if (state.status == NativeCalendarStatus.BUSY || url in state.activeUrls ||
            state.calendars.none { it.url == url }
        ) {
            return
        }
        val selected = if (url in state.selectedUrls) state.selectedUrls - url else state.selectedUrls + url
        current.value = state.copy(selectedUrls = selected)
    }

    private suspend fun importSelected() {
        val requested = current.value.calendars.filter {
            it.url in current.value.selectedUrls && it.url !in current.value.activeUrls
        }
        var total = NativeCalendarSyncResult()
        for (calendar in requested) {
            val report = google.activate(current.value.email, calendar)
            check(report.calendars > 0 && report.failures == 0 && report.conflicts == 0)
            total = total.copy(
                calendars = total.calendars + report.calendars,
                downloaded = total.downloaded + report.downloaded,
            )
            current.value = current.value.copy(
                activeUrls = current.value.activeUrls + calendar.url,
                selectedUrls = current.value.selectedUrls - calendar.url,
                report = total,
            )
        }
        current.value = current.value.copy(
            status = if (current.value.activeUrls.isEmpty()) {
                NativeCalendarStatus.SELECT_CALENDAR
            } else {
                NativeCalendarStatus.CONNECTED
            },
        )
    }

    private suspend fun synchronize() {
        val report = google.synchronizeAll()
        current.value = current.value.copy(
            status = when {
                report.reauthorizationRequired || !google.connected(
                    current.value.email,
                ) -> NativeCalendarStatus.CONSENT_REQUIRED

                report.calendars == 0 -> NativeCalendarStatus.SELECT_CALENDAR

                report.failures == 0 && report.conflicts == 0 -> NativeCalendarStatus.CONNECTED

                else -> NativeCalendarStatus.ERROR
            },
            authorized = !report.reauthorizationRequired && google.connected(current.value.email),
            report = report,
        )
    }

    private suspend fun refresh(requestedEmail: String) {
        val accounts = google.accountEmails
        val email = requestedEmail.ifBlank { accounts.firstOrNull().orEmpty() }
        val authorized = google.connected(email)
        val active = google.activeCalendars[email.lowercase()].orEmpty()
        current.value =
            current.value.copy(
                email = email,
                accounts = accounts,
                authorized = authorized,
                activeUrls = active,
                calendars = emptyList(),
                selectedUrls = emptySet(),
                report = null,
            )
        val calendars = if (authorized) google.calendars(email) else emptyList()
        current.value = NativeCalendarState(
            email = email,
            accounts = accounts,
            authorized = authorized,
            activeUrls = active,
            status = when {
                !authorized -> NativeCalendarStatus.CONSENT_REQUIRED
                active.isNotEmpty() -> NativeCalendarStatus.CONNECTED
                else -> NativeCalendarStatus.SELECT_CALENDAR
            },
            calendars = calendars,
        )
    }

    private fun operation(action: suspend () -> Unit) {
        job?.cancel()
        current.value = current.value.copy(status = NativeCalendarStatus.BUSY, authError = null, activationCode = null)
        job = viewModelScope.launch {
            try {
                withContext(ioDispatcher) {
                    if (!google.configurationAvailable) {
                        throw CalendarAuthFailure(net.thunderbird.feature.calendar.CalendarAuthError.CONFIGURATION)
                    }
                    action()
                }
            } catch (error: CancellationException) {
                throw error
            } catch (error: CalendarActivationFailure) {
                current.value = current.value.copy(status = NativeCalendarStatus.ERROR, activationCode = error.code)
            } catch (error: CalendarAuthFailure) {
                current.value = current.value.copy(
                    authError = error.error,
                    authorized = current.value.authorized && error.error !in setOf(
                        net.thunderbird.feature.calendar.CalendarAuthError.REAUTHORIZE,
                        net.thunderbird.feature.calendar.CalendarAuthError.PERMISSION_REQUIRED,
                        net.thunderbird.feature.calendar.CalendarAuthError.WRONG_ACCOUNT,
                    ),
                    status = if (error.error ==
                        net.thunderbird.feature.calendar.CalendarAuthError.WRONG_ACCOUNT
                    ) {
                        NativeCalendarStatus.WRONG_ACCOUNT
                    } else {
                        NativeCalendarStatus.ERROR
                    },
                )
            } catch (_: Exception) {
                current.value = current.value.copy(status = NativeCalendarStatus.ERROR)
            }
        }
    }
}
