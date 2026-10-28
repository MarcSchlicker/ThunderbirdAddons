package com.fsck.k9.ui.zeitklar

import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch

/** Visible-calendar polling, with one operation at a time and an explicit follow-up after an edit. */
internal class CalendarSyncLoop(
    private val scope: CoroutineScope,
    private val intervalMillis: Long = DEFAULT_INTERVAL_MS,
    private val operation: suspend () -> Unit,
) {
    private companion object {
        const val DEFAULT_INTERVAL_MS = 30_000L
    }

    private var polling: Job? = null
    private var running: Job? = null
    private var followUp = false

    fun start() {
        if (polling?.isActive == true) return
        polling = scope.launch {
            while (isActive) {
                request()
                delay(intervalMillis)
            }
        }
    }

    fun request(afterRunning: Boolean = false) {
        if (running?.isActive == true) {
            followUp = followUp || afterRunning
            return
        }
        running = scope.launch {
            do {
                followUp = false
                operation()
            } while (followUp)
        }
    }

    fun stop() {
        polling?.cancel()
        polling = null
    }
}
