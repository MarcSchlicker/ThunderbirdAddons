package net.thunderbird.feature.calendar.internal

import android.content.Context
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import net.thunderbird.feature.calendar.NativeGoogleCalendar
import org.koin.core.component.KoinComponent
import org.koin.core.component.inject

class NativeCalendarWorker(context: Context, parameters: WorkerParameters) :
    CoroutineWorker(
        context,
        parameters,
    ),
    KoinComponent {
    private val calendar: NativeGoogleCalendar by inject()
    override suspend fun doWork(): Result {
        val result = calendar.synchronizeAll()
        return if (result.failures > 0 && !result.reauthorizationRequired) Result.retry() else Result.success()
    }
}
