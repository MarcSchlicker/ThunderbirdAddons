package com.fsck.k9.ui.zeitklar

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import androidx.core.content.ContextCompat
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.fsck.k9.Preferences
import net.thunderbird.feature.calendar.NativeGoogleCalendar
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

internal enum class GoogleCalendarSetupStatus {
    CHECKING, PERMISSION_REQUIRED, ACCOUNT_SELECTION_REQUIRED, ACCOUNT_REQUIRED, DAV_CALENDAR_SELECTION_REQUIRED, READ_ONLY, READY, ERROR,
}
internal data class GoogleCalendarSetupState(
    val email: String = "",
    val choices: List<String> = emptyList(),
    val davCalendars: List<DeviceCalendar> = emptyList(),
    val status: GoogleCalendarSetupStatus = GoogleCalendarSetupStatus.CHECKING,
)
internal sealed interface GoogleCalendarSetupEvent {
    data class Refresh(val email: String) : GoogleCalendarSetupEvent
    data class BindDavCalendar(val email: String, val calendarId: Long) : GoogleCalendarSetupEvent
}

internal class GoogleCalendarSetupRepository(
    private val context: Context,
    private val preferences: Preferences,
    private val nativeGoogle: NativeGoogleCalendar? = null,
) {
    private val bindings = context.getSharedPreferences("google_calendar_dav_bindings", Context.MODE_PRIVATE)

    fun davCalendars(): List<DeviceCalendar> = DeviceCalendarStore.calendars(context, includeHidden = true)
        .filter { it.accountType == DavCalendarIntegration.ACCOUNT_TYPE && it.writable }

    fun bindDavCalendar(email: String, calendarId: Long) {
        require(email.isNotBlank())
        val calendar = davCalendars().first { it.id == calendarId }
        bindings.edit().putString(email.lowercase(), fingerprint(calendar)).apply()
    }

    private fun fingerprint(calendar: DeviceCalendar) = "${calendar.id}:${calendar.accountType}:${calendar.accountName}"

    fun emails(): List<String> = preferences.getAccounts().filter {
        it.incomingServerSettings.host.lowercase() in GOOGLE_MAIL_HOSTS
    }.map { it.email.trim() }.filter { it.isNotEmpty() }.distinct()

    fun choices(): List<String> {
        val deviceEmails = if (DeviceCalendarStore.hasReadAccess(context)) {
            DeviceCalendarStore.calendars(context, includeHidden = true)
                .filter { it.accountType == "com.google" || it.nativeGoogle }.map { it.accountName }
        } else emptyList()
        return (emails() + deviceEmails).filter { it.isNotBlank() }.distinctBy { it.lowercase() }
    }

    fun read(email: String): GoogleCalendarSetupStatus {
        val canWrite = ContextCompat.checkSelfPermission(context, Manifest.permission.WRITE_CALENDAR) ==
            PackageManager.PERMISSION_GRANTED
        if (!DeviceCalendarStore.hasReadAccess(context) || !canWrite) {
            return GoogleCalendarSetupStatus.PERMISSION_REQUIRED
        }
        val allCalendars = DeviceCalendarStore.calendars(context, includeHidden = true)
        val binding = bindings.getString(email.lowercase(), null)
        val calendars = allCalendars.filter {
            (it.accountType == "com.google" && it.accountName.equals(email, ignoreCase = true)) ||
                (it.nativeGoogle && it.accountName.equals(email, ignoreCase = true) && nativeGoogle?.connected(email) == true) ||
                (it.accountType == DavCalendarIntegration.ACCOUNT_TYPE && fingerprint(it) == binding)
        }
        return when {
            email.isBlank() -> GoogleCalendarSetupStatus.ACCOUNT_SELECTION_REQUIRED
            calendars.any { it.writable } -> GoogleCalendarSetupStatus.READY
            calendars.isNotEmpty() -> GoogleCalendarSetupStatus.READ_ONLY
            allCalendars.any { it.accountType == DavCalendarIntegration.ACCOUNT_TYPE && it.writable } ->
                GoogleCalendarSetupStatus.DAV_CALENDAR_SELECTION_REQUIRED
            else -> GoogleCalendarSetupStatus.ACCOUNT_REQUIRED
        }
    }

    fun pendingEmail(): String? = emails().firstOrNull {
        read(it) != GoogleCalendarSetupStatus.READY || nativeGoogle?.needsSetup(it) == true
    }

    companion object {
        val GOOGLE_MAIL_HOSTS = setOf("imap.gmail.com", "imap.googlemail.com", "pop.gmail.com", "pop.googlemail.com")
    }
}

internal class GoogleCalendarSetupViewModel(private val repository: GoogleCalendarSetupRepository) : ViewModel() {
    private val mutableState = MutableStateFlow(GoogleCalendarSetupState())
    val state = mutableState.asStateFlow()
    private var refreshJob: Job? = null

    fun onEvent(event: GoogleCalendarSetupEvent) {
        when (event) {
            is GoogleCalendarSetupEvent.BindDavCalendar -> {
                viewModelScope.launch {
                    val bound = withContext(Dispatchers.IO) {
                        runCatching { repository.bindDavCalendar(event.email, event.calendarId) }.isSuccess
                    }
                    if (bound) onEvent(GoogleCalendarSetupEvent.Refresh(event.email))
                    else mutableState.value = mutableState.value.copy(status = GoogleCalendarSetupStatus.ERROR)
                }
            }
            is GoogleCalendarSetupEvent.Refresh -> {
                refreshJob?.cancel()
                mutableState.value = GoogleCalendarSetupState(event.email)
                refreshJob = viewModelScope.launch {
                    val result = withContext(Dispatchers.IO) {
                        runCatching {
                            val choices = repository.choices()
                            val email = event.email.ifBlank { choices.singleOrNull().orEmpty() }
                            GoogleCalendarSetupState(email, choices, repository.davCalendars(), repository.read(email))
                        }.getOrDefault(GoogleCalendarSetupState(event.email, status = GoogleCalendarSetupStatus.ERROR))
                    }
                    mutableState.value = result
                }
            }
        }
    }
}
