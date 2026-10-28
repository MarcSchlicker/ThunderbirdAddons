package com.fsck.k9.ui.zeitklar

import androidx.lifecycle.lifecycleScope
import com.fsck.k9.ui.R
import com.fsck.k9.ui.base.BaseActivity
import com.google.android.material.dialog.MaterialAlertDialogBuilder
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import net.thunderbird.feature.calendar.CalendarSyncProblem
import net.thunderbird.feature.calendar.NativeGoogleCalendar

internal fun showCalendarSyncProblems(
    host: BaseActivity,
    nativeCalendar: NativeGoogleCalendar,
    connections: List<PlannerConnection>,
    knownCalendars: List<DeviceCalendar> = emptyList(),
    pendingSetup: Boolean = false,
    unknownFailure: Boolean = false,
    onSettings: () -> Unit,
) {
    host.lifecycleScope.launch {
        val catalog = withContext(Dispatchers.IO) {
            runCatching {
                if (DeviceCalendarStore.hasReadAccess(host)) DeviceCalendarStore.calendars(host, includeHidden = true)
                else emptyList()
            }.getOrDefault(emptyList())
        }
        val names = (knownCalendars + catalog).associateBy { it.id }
        val problems = nativeCalendar.calendarProblems
        val lines = problems.map { (id, problem) ->
            val name = names[id]?.name ?: host.getString(R.string.tb_sync_unknown_calendar, id)
            val detail = when (problem) {
                CalendarSyncProblem.AUTHORIZATION -> R.string.tb_calendar_warning_auth
                CalendarSyncProblem.CONFLICT -> R.string.tb_calendar_warning_conflict
                CalendarSyncProblem.READ_ONLY -> R.string.tb_calendar_warning_read_only
                CalendarSyncProblem.CONNECTION -> R.string.tb_calendar_warning_connection
            }
            "$name\n${host.getString(detail)}"
        }.toMutableList()
        connections.filter { !it.lastError.isNullOrBlank() }.forEach {
            lines += host.getString(R.string.tb_sync_peer_failed, it.name)
        }
        if (pendingSetup && problems.isEmpty()) lines += host.getString(R.string.tb_sync_setup_pending)
        if (unknownFailure && problems.isEmpty()) lines += host.getString(R.string.tb_sync_unknown_failure)
        if (host.isFinishing || host.isDestroyed) return@launch
        MaterialAlertDialogBuilder(host).setTitle(R.string.tb_sync_problems)
            .setMessage(lines.joinToString("\n\n").ifBlank { host.getString(R.string.tb_sync_no_problems) })
            .setPositiveButton(android.R.string.ok, null)
            .setNeutralButton(R.string.tb_calendar_sources_and_warnings) { _, _ -> onSettings() }
            .show()
    }
}
