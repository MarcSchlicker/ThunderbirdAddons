package com.fsck.k9.ui.zeitklar

import assertk.assertThat
import assertk.assertions.isEqualTo
import kotlinx.coroutines.delay
import kotlinx.coroutines.test.advanceTimeBy
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import org.junit.Test

@OptIn(kotlinx.coroutines.ExperimentalCoroutinesApi::class)
class CalendarSyncLoopTest {
    @Test
    fun visibleCalendarRefreshesWithoutLeavingTheScreenAndStopsWhenHidden() = runTest {
        var calls = 0
        val loop = CalendarSyncLoop(this) { calls++ }
        loop.start()
        loop.start()
        runCurrent()
        assertThat(calls).isEqualTo(1)
        advanceTimeBy(30_000)
        runCurrent()
        assertThat(calls).isEqualTo(2)
        loop.stop()
        advanceTimeBy(90_000)
        runCurrent()
        assertThat(calls).isEqualTo(2)
    }

    @Test
    fun busyPollingDoesNotQueueWorkButAnEditGetsExactlyOneFollowUp() = runTest {
        var calls = 0
        var active = 0
        var maximum = 0
        val loop = CalendarSyncLoop(this) {
            calls++
            active++
            maximum = maxOf(maximum, active)
            delay(60_000)
            active--
        }
        loop.start()
        runCurrent()
        advanceTimeBy(30_000)
        runCurrent()
        loop.request(afterRunning = true)
        loop.request(afterRunning = true)
        advanceTimeBy(30_000)
        runCurrent()
        assertThat(calls).isEqualTo(2)
        assertThat(maximum).isEqualTo(1)
        loop.stop()
        advanceTimeBy(60_000)
        runCurrent()
        assertThat(active).isEqualTo(0)
        assertThat(calls).isEqualTo(2)
    }
    @Test
    fun aSlowDesktopDoesNotBlockTheGoogleCalendarRefresh() = runTest {
        var nativeCalls = 0
        var desktopCalls = 0
        val google = CalendarSyncLoop(this) { nativeCalls++ }
        val desktop = CalendarSyncLoop(this) { desktopCalls++; delay(300_000) }
        google.start()
        desktop.start()
        runCurrent()
        advanceTimeBy(30_000)
        runCurrent()
        assertThat(nativeCalls).isEqualTo(2)
        assertThat(desktopCalls).isEqualTo(1)
        google.stop()
        desktop.stop()
        advanceTimeBy(300_000)
        runCurrent()
    }

}
