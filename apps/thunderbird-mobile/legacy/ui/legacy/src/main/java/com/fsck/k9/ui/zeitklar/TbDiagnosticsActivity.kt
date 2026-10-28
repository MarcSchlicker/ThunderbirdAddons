package com.fsck.k9.ui.zeitklar

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.os.Bundle
import android.view.Menu
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.foundation.verticalScroll
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.lifecycle.lifecycleScope
import com.fsck.k9.ui.BuildConfig
import com.fsck.k9.ui.R
import com.fsck.k9.ui.base.BaseActivity
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import net.thunderbird.components.ui.bolt.atom.button.ButtonText
import net.thunderbird.components.ui.bolt.atom.text.TextBodyMedium
import net.thunderbird.components.ui.bolt.atom.text.TextBodySmall
import net.thunderbird.components.ui.bolt.atom.text.TextTitleMedium
import net.thunderbird.core.ui.theme.api.FeatureThemeProvider
import org.koin.android.ext.android.inject
import org.koin.androidx.viewmodel.ext.android.viewModel

class TbDiagnosticsActivity : BaseActivity() {
    private val themeProvider: FeatureThemeProvider by inject()
    private val viewModel: TbDiagnosticsViewModel by viewModel()
    private val export = registerForActivityResult(ActivityResultContracts.CreateDocument("application/json")) { uri ->
        val report = viewModel.state.value.report?.json()
        if (uri != null && report != null) lifecycleScope.launch {
            runCatching {
                withContext(Dispatchers.IO) {
                    requireNotNull(contentResolver.openOutputStream(uri)).use { it.write(report.toByteArray(Charsets.UTF_8)) }
                }
            }.onFailure {
                android.widget.Toast.makeText(this@TbDiagnosticsActivity, R.string.tb_diagnostics_export_failed,
                    android.widget.Toast.LENGTH_LONG).show()
            }
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            val state by viewModel.state.collectAsState()
            val enabled = TbDiagnosticsPolicy.enabled(BuildConfig.TB_RELEASE_NAME)
            themeProvider.WithTheme {
                Column(
                    modifier = Modifier.fillMaxSize().padding(16.dp).verticalScroll(rememberScrollState()),
                    verticalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    TextTitleMedium(stringResource(R.string.tb_diagnostics_title))
                    TextBodyMedium(stringResource(if (enabled) R.string.tb_diagnostics_explanation else R.string.tb_diagnostics_disabled))
                    ButtonText(text = stringResource(R.string.tb_diagnostics_start), enabled = enabled && !state.running,
                        onClick = { viewModel.onEvent(TbDiagnosticsEvent.Start) })
                    ButtonText(text = stringResource(R.string.tb_diagnostics_cancel), enabled = state.running,
                        onClick = { viewModel.onEvent(TbDiagnosticsEvent.Cancel) })
                    ButtonText(text = stringResource(R.string.tb_diagnostics_copy), enabled = state.report != null && !state.running,
                        onClick = { getSystemService(ClipboardManager::class.java).setPrimaryClip(
                            ClipData.newPlainText("TB-Connect Diagnose", state.report?.json().orEmpty()),
                        ) })
                    ButtonText(text = stringResource(R.string.tb_diagnostics_export), enabled = state.report != null && !state.running,
                        onClick = { export.launch("tb-connect-diagnose.json") })
                    state.report?.let { report ->
                        TextBodyMedium(stringResource(R.string.tb_diagnostics_summary,
                            report.checks.count { it.status == TbDiagnosticStatus.PASSED },
                            report.checks.count { it.status == TbDiagnosticStatus.FAILED },
                            report.checks.count { it.status == TbDiagnosticStatus.SKIPPED }))
                    }
                    state.report?.checks?.find { it.id == "device-calendar-write-access" }?.let { check ->
                        val message = when (check.code) {
                            TbDiagnosticCode.OK -> R.string.tb_diagnostics_calendar_writable
                            TbDiagnosticCode.NOT_GRANTED -> R.string.tb_diagnostics_calendar_permission
                            TbDiagnosticCode.NO_CALENDARS -> R.string.tb_diagnostics_calendar_missing
                            TbDiagnosticCode.NO_WRITABLE_CALENDAR -> R.string.tb_diagnostics_calendar_readonly
                            else -> null
                        }
                        message?.let { TextBodyMedium(stringResource(it)) }
                    }
                    if (state.running) TextBodyMedium(stringResource(R.string.tb_diagnostics_running))
                    if (state.runFailed) TextBodyMedium(stringResource(R.string.tb_diagnostics_run_failed))
                    if (state.historyFailed) TextBodyMedium(stringResource(R.string.tb_diagnostics_history_failed))
                    TextBodyMedium(stringResource(R.string.tb_diagnostics_preview))
                    SelectionContainer { TextBodySmall(state.report?.json() ?: stringResource(R.string.tb_diagnostics_no_report)) }
                    ButtonText(text = stringResource(R.string.tb_diagnostics_back), onClick = { finish() })
                }
            }
        }
    }

    companion object {
        const val MENU_ID = 19090
        private const val MENU_ORDER = 90
        fun addMenu(menu: Menu) {
            menu.add(0, MENU_ID, MENU_ORDER, R.string.tb_diagnostics_title).isEnabled =
                TbDiagnosticsPolicy.enabled(BuildConfig.TB_RELEASE_NAME)
        }
        fun open(context: Context) { context.startActivity(Intent(context, TbDiagnosticsActivity::class.java)) }
    }
}
