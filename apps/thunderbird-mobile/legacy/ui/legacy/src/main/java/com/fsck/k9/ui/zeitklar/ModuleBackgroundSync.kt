package com.fsck.k9.ui.zeitklar

import android.content.Context
import android.util.Log
import androidx.work.Constraints
import androidx.work.ExistingWorkPolicy
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.Worker
import androidx.work.WorkerParameters
import java.time.Instant
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicLong
import android.os.SystemClock
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch

/**
 * Android schedules periodic work opportunistically; 15 minutes is the platform
 * minimum. Foreground screens still sync immediately, while this worker keeps
 * paired modules fresh when TB-Connect is in the background.
 */
class ModuleBackgroundSyncWorker(
    appContext: Context,
    workerParameters: WorkerParameters,
) : Worker(appContext, workerParameters) {
    override fun doWork(): Result {
        val store = PlannerMobileStore(applicationContext)
        var state = store.load()
        if (state.connections.isEmpty()) {
            Log.i(LOG_TAG, "Kein Hintergrundabgleich: kein Desktop verbunden.")
            return Result.success()
        }

        Log.i(LOG_TAG, "Starte Hintergrundabgleich für ${state.connections.size} Desktop-Verbindung(en).")
        var failures = 0
        state.connections.forEach { connection ->
            val attemptedAt = Instant.now().toString()
            try {
                val result = PlannerSyncClient.sync(applicationContext, state, connection)
                if (result.moduleFailures.isNotEmpty()) failures++
                state = store.mergeModuleSync(
                    store.mergeRemotePayload(state, result.remotePayload),
                    result,
                ).withConnection(
                    connection.copy(
                        endpoint = result.endpoint ?: connection.endpoint,
                        workspaceId = result.workspaceId ?: connection.workspaceId,
                        lastMobileSyncAt = attemptedAt,
                        lastDesktopSyncAt = result.desktopSyncAt,
                        lastAttemptAt = attemptedAt,
                        lastError = if (result.moduleFailures.isNotEmpty()) {
                            applicationContext.getString(com.fsck.k9.ui.R.string.tb_sync_module_failed)
                        } else null,
                    ),
                )
            } catch (error: Exception) {
                failures += 1
                Log.w(LOG_TAG, "Hintergrundabgleich mit ${connection.name} fehlgeschlagen", error)
                state = state.withConnection(
                    connection.copy(lastAttemptAt = attemptedAt, lastError = error.message?.take(160) ?: "Synchronisierung fehlgeschlagen"),
                )
            }
        }
        store.save(state)
        return if (failures == state.connections.size) {
            Log.w(LOG_TAG, "Hintergrundabgleich fehlgeschlagen (${state.connections.size}/${state.connections.size}).")
            Result.retry()
        } else {
            Log.i(LOG_TAG, "Hintergrundabgleich abgeschlossen; Fehler: $failures.")
            Result.success()
        }
    }
}

object ModuleBackgroundSync {
    private val schedulingScope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
    private val lastScheduledAt = AtomicLong(-90_000L)
    private const val UNIQUE_WORK_NAME = "tb-connect-module-background-sync"
    private const val UNIQUE_IMMEDIATE_WORK_NAME = "tb-connect-module-sync-on-open"

    fun schedule(context: Context) {
        val now = SystemClock.elapsedRealtime()
        val previous = lastScheduledAt.get()
        if (now - previous < 90_000L || !lastScheduledAt.compareAndSet(previous, now)) return
        val application = context.applicationContext
        schedulingScope.launch { enqueue(application) }
    }

    private fun enqueue(context: Context) {
        val workManager = WorkManager.getInstance(context.applicationContext)
        workManager.enqueueUniquePeriodicWork("tb-connect-task-reminders", ExistingPeriodicWorkPolicy.KEEP,
            PeriodicWorkRequestBuilder<PlannerReminderWorker>(15, TimeUnit.MINUTES).build())
        val request = PeriodicWorkRequestBuilder<ModuleBackgroundSyncWorker>(15, TimeUnit.MINUTES)
            .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
            .build()
        workManager.enqueueUniquePeriodicWork(
            UNIQUE_WORK_NAME,
            ExistingPeriodicWorkPolicy.KEEP,
            request,
        )

        // A periodic Android job can be delayed by power management. Queue one immediate
        // pass when TB-Connect is opened so that the visible status is current.
        val immediateRequest = OneTimeWorkRequestBuilder<ModuleBackgroundSyncWorker>()
            .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
            .build()
        workManager.enqueueUniqueWork(
            UNIQUE_IMMEDIATE_WORK_NAME,
            ExistingWorkPolicy.KEEP,
            immediateRequest,
        )
    }
}

private const val LOG_TAG = "TBConnectSync"

/** Local-only reminder, deliberately independent of network synchronization. */
class PlannerReminderWorker(context: Context, parameters: WorkerParameters) : Worker(context, parameters) {
    override fun doWork(): Result {
        val preferences = applicationContext.getSharedPreferences("tb_connect_reminders", Context.MODE_PRIVATE)
        val manager = androidx.core.app.NotificationManagerCompat.from(applicationContext)
        if (!preferences.getBoolean("enabled", false)) {
            manager.cancel(REMINDER_ID)
            return Result.success()
        }
        val now = java.time.LocalDateTime.now()
        val today = now.toLocalDate().toString()
        val afterTime = now.hour * 60 + now.minute >= preferences.getInt("minute_of_day", 540)
        if (android.os.Build.VERSION.SDK_INT >= 33 && androidx.core.content.ContextCompat.checkSelfPermission(
                applicationContext, android.Manifest.permission.POST_NOTIFICATIONS,
            ) != android.content.pm.PackageManager.PERMISSION_GRANTED
        ) return Result.success()
        val store = PlannerMobileStore(applicationContext)
        val due = dueTasks(store.tasks(store.load()), now.toLocalDate())
        if (due.isEmpty()) {
            manager.cancel(REMINDER_ID)
            return Result.success()
        }
        if (!afterTime || preferences.getString("last_day", null) == today || !manager.areNotificationsEnabled()) return Result.success()
        if (android.os.Build.VERSION.SDK_INT >= 26) {
            manager.createNotificationChannel(android.app.NotificationChannel("planner_tasks", "Tagesplaner-Aufgaben", android.app.NotificationManager.IMPORTANCE_DEFAULT))
        }
        val intent = android.app.PendingIntent.getActivity(applicationContext, REMINDER_ID,
            DailyPlannerActivity.intent(applicationContext), android.app.PendingIntent.FLAG_UPDATE_CURRENT or android.app.PendingIntent.FLAG_IMMUTABLE)
        val notification = androidx.core.app.NotificationCompat.Builder(applicationContext, "planner_tasks")
            .setSmallIcon(com.fsck.k9.ui.R.drawable.ic_zeitklar_planner)
            .setContentTitle("Tagesplaner")
            .setContentText("${due.size} offene Aufgabe(n) sind fällig.")
            .setContentIntent(intent).setAutoCancel(true)
            .setVisibility(androidx.core.app.NotificationCompat.VISIBILITY_PRIVATE).build()
        manager.notify(REMINDER_ID, notification)
        preferences.edit().putString("last_day", today).apply()
        return Result.success()
    }

    companion object {
        private const val REMINDER_ID = 48732
        internal fun dueTasks(tasks: List<PlannerTask>, date: java.time.LocalDate): List<PlannerTask> = tasks.filter {
            !it.done && it.dueDate?.let { value -> runCatching { !java.time.LocalDate.parse(value).isAfter(date) }.getOrDefault(false) } == true
        }
    }
}
