package com.fsck.k9.ui.zeitklar

import android.Manifest
import android.content.Context
import android.content.Intent
import android.database.ContentObserver
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.provider.CalendarContract
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import com.fsck.k9.ui.R
import net.thunderbird.feature.calendar.NativeCalendarSetup
import com.fsck.k9.ui.base.BaseActivity
import net.thunderbird.components.ui.bolt.atom.button.ButtonText
import net.thunderbird.components.ui.bolt.atom.text.TextBodyMedium
import net.thunderbird.components.ui.bolt.atom.text.TextTitleMedium
import net.thunderbird.core.ui.theme.api.FeatureThemeProvider
import org.koin.android.ext.android.inject
import org.koin.androidx.viewmodel.ext.android.viewModel

/** Calendar consent is part of setup, while Google keeps ownership of account authentication. */
class GoogleCalendarSetupActivity : BaseActivity() {
    private val themeProvider: FeatureThemeProvider by inject()
    private val viewModel: GoogleCalendarSetupViewModel by viewModel()
    private val email: String get() = intent.getStringExtra(EXTRA_EMAIL).orEmpty()
    private var observerRegistered = false
    private val calendarObserver = object : ContentObserver(Handler(Looper.getMainLooper())) {
        override fun onChange(selfChange: Boolean) { refresh() }
    }
    private val permission = registerForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) {
        observeCalendars()
        refresh()
    }
    private val accountSetup = registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { refresh() }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            val state by viewModel.state.collectAsState()
            themeProvider.WithTheme {
                Column(
                    modifier = Modifier.fillMaxSize().padding(16.dp).verticalScroll(rememberScrollState()),
                    verticalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    TextTitleMedium(stringResource(R.string.tb_google_calendar_setup_title))
                    if (state.email.isNotBlank()) TextBodyMedium(state.email)
                    TextBodyMedium(stringResource(R.string.tb_google_calendar_setup_intro))
                    TextBodyMedium(stringResource(when (state.status) {
                        GoogleCalendarSetupStatus.CHECKING -> R.string.tb_google_calendar_checking
                        GoogleCalendarSetupStatus.PERMISSION_REQUIRED -> R.string.tb_google_calendar_permission
                        GoogleCalendarSetupStatus.ACCOUNT_SELECTION_REQUIRED -> R.string.tb_google_calendar_choose_account
                        GoogleCalendarSetupStatus.ACCOUNT_REQUIRED -> R.string.tb_google_calendar_account_required
                        GoogleCalendarSetupStatus.DAV_CALENDAR_SELECTION_REQUIRED -> R.string.tb_google_calendar_dav_choose
                        GoogleCalendarSetupStatus.READ_ONLY -> R.string.tb_google_calendar_readonly
                        GoogleCalendarSetupStatus.READY -> R.string.tb_google_calendar_ready
                        GoogleCalendarSetupStatus.ERROR -> R.string.tb_google_calendar_error
                    }))
                    if (state.status == GoogleCalendarSetupStatus.ACCOUNT_SELECTION_REQUIRED) {
                        state.choices.forEach { choice ->
                            ButtonText(text = choice, onClick = {
                                viewModel.onEvent(GoogleCalendarSetupEvent.Refresh(choice))
                            })
                        }
                    }
                    if (state.status == GoogleCalendarSetupStatus.PERMISSION_REQUIRED) {
                        ButtonText(text = stringResource(R.string.tb_google_calendar_allow), onClick = {
                            permission.launch(arrayOf(Manifest.permission.READ_CALENDAR, Manifest.permission.WRITE_CALENDAR))
                        })
                    }
                    if (state.email.isNotBlank() && state.status != GoogleCalendarSetupStatus.READY) {
                        state.davCalendars.forEach { calendar ->
                            ButtonText(text = "${calendar.name} · ${calendar.accountName}", onClick = {
                                viewModel.onEvent(GoogleCalendarSetupEvent.BindDavCalendar(state.email, calendar.id))
                            })
                        }
                    }
                    ButtonText(text = stringResource(R.string.tb_google_calendar_native), onClick = {
                        accountSetup.launch(NativeCalendarSetup.intent(this@GoogleCalendarSetupActivity, state.email))
                    })
                    if (DavCalendarIntegration.installed(this@GoogleCalendarSetupActivity)) {
                        TextBodyMedium(stringResource(R.string.tb_google_calendar_dav_help))
                    }
                    if (state.status != GoogleCalendarSetupStatus.READY &&
                        DavCalendarIntegration.installed(this@GoogleCalendarSetupActivity)) {
                        ButtonText(text = stringResource(R.string.tb_google_calendar_sign_in), onClick = {
                            openDav(if (DavCalendarIntegration.installed(this@GoogleCalendarSetupActivity)) {
                                DavCalendarIntegration.loginIntent(state.email)
                            } else {
                                DavCalendarIntegration.downloadIntent()
                            })
                        })
                        ButtonText(text = stringResource(R.string.tb_google_calendar_sync_settings), onClick = {
                            openDav(if (DavCalendarIntegration.installed(this@GoogleCalendarSetupActivity)) {
                                DavCalendarIntegration.accountsIntent()
                            } else {
                                DavCalendarIntegration.downloadIntent()
                            })
                        })
                    }
                    ButtonText(text = stringResource(R.string.tb_google_calendar_check_again), onClick = { refresh() })
                    ButtonText(text = stringResource(if (state.status == GoogleCalendarSetupStatus.READY) {
                        R.string.tb_google_calendar_done
                    } else {
                        R.string.tb_google_calendar_later
                    }), onClick = { finish() })
                }
            }
        }
    }

    override fun onResume() {
        super.onResume()
        observeCalendars()
        refresh()
    }

    override fun onPause() {
        if (observerRegistered) contentResolver.unregisterContentObserver(calendarObserver)
        observerRegistered = false
        super.onPause()
    }

    private fun observeCalendars() {
        if (observerRegistered || !DeviceCalendarStore.hasReadAccess(this)) return
        runCatching {
            contentResolver.registerContentObserver(CalendarContract.Calendars.CONTENT_URI, true, calendarObserver)
            observerRegistered = true
        }
    }

    private fun refresh() = viewModel.onEvent(
        GoogleCalendarSetupEvent.Refresh(email.ifBlank { viewModel.state.value.email }),
    )

    private fun openDav(request: Intent) {
        runCatching { accountSetup.launch(request) }.onFailure {
            android.widget.Toast.makeText(this, R.string.tb_google_calendar_error, android.widget.Toast.LENGTH_LONG).show()
        }
    }

    companion object {
        private const val EXTRA_EMAIL = "googleCalendarEmail"
        fun intent(context: Context, email: String = ""): Intent =
            Intent(context, GoogleCalendarSetupActivity::class.java).putExtra(EXTRA_EMAIL, email)
    }
}
