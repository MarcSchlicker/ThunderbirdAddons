package com.fsck.k9.ui.zeitklar

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import java.time.Instant
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Job
import kotlinx.coroutines.NonCancellable
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

internal data class TbDiagnosticsState(
    val report: TbDiagnosticReport? = null,
    val running: Boolean = false,
    val historyFailed: Boolean = false,
    val runFailed: Boolean = false,
)
internal sealed interface TbDiagnosticsEvent {
    data object Start : TbDiagnosticsEvent
    data object Cancel : TbDiagnosticsEvent
}
internal class TbDiagnosticsViewModel(private val runner: TbDiagnosticsRunner) : ViewModel() {
    private val mutableState = MutableStateFlow(TbDiagnosticsState())
    val state = mutableState.asStateFlow()
    private var job: Job? = null

    fun onEvent(event: TbDiagnosticsEvent) {
        when (event) {
            TbDiagnosticsEvent.Start -> start()
            TbDiagnosticsEvent.Cancel -> job?.cancel()
        }
    }

    private fun start() {
        if (mutableState.value.running) return
        mutableState.value = TbDiagnosticsState(running = true)
        job = viewModelScope.launch {
            try {
                val initial = runner.initialReport()
                if (!TbDiagnosticsPolicy.enabled(initial.releaseName)) return@launch
                runner.run(initial) { mutableState.value = mutableState.value.copy(report = it) }
            } catch (_: CancellationException) {
                mutableState.value.report?.let { report ->
                    mutableState.value = mutableState.value.copy(report = report.copy(
                        canceled = true, finishedAt = Instant.now().toString(),
                        checks = report.checks.map {
                            if (it.code == TbDiagnosticCode.NOT_RUN) it.copy(code = TbDiagnosticCode.CANCELED) else it
                        },
                    ))
                }
            } catch (_: Exception) {
                mutableState.value = mutableState.value.copy(runFailed = true)
            } finally {
                withContext(NonCancellable) {
                    mutableState.value.report?.let { report ->
                        runCatching { runner.save(report) }.onFailure {
                            mutableState.value = mutableState.value.copy(historyFailed = true)
                        }
                    }
                    mutableState.value = mutableState.value.copy(running = false)
                }
            }
        }
    }
}
