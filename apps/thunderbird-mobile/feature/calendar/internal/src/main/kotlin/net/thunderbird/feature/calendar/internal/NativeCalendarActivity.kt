package net.thunderbird.feature.calendar.internal

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Bundle
import android.provider.CalendarContract
import android.provider.Settings
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.core.content.ContextCompat
import androidx.core.content.IntentCompat
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.lifecycleScope
import androidx.lifecycle.repeatOnLifecycle
import kotlinx.collections.immutable.ImmutableList
import kotlinx.collections.immutable.persistentListOf
import kotlinx.collections.immutable.toImmutableList
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import net.thunderbird.components.ui.bolt.atom.Surface
import net.thunderbird.core.ui.theme.api.FeatureThemeProvider
import net.thunderbird.feature.calendar.NativeCalendarSetup
import org.koin.android.ext.android.inject
import org.koin.androidx.viewmodel.ext.android.viewModel

class NativeCalendarActivity : ComponentActivity() {
    private val theme: FeatureThemeProvider by inject()
    private val viewModel: NativeCalendarViewModel by viewModel()
    private val catalog by lazy { AndroidCalendarCatalog(applicationContext) }
    private var direct by mutableStateOf(false)
    private var deviceCalendars by mutableStateOf<ImmutableList<DeviceCalendarEntry>>(persistentListOf())
    private var deviceAccess by mutableStateOf(false)
    private var deviceError by mutableStateOf(false)
    private var deviceLoad: Job? = null
    private val deviceMutex = Mutex()
    private val authorization = registerForActivityResult(ActivityResultContracts.StartActivityForResult()) {
        viewModel.onEvent(NativeCalendarEvent.FinishAuthorization(it.data))
    }
    private val permission =
        registerForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) { granted ->
            if (direct) {
                if (granted.values.all { it } && hasAccess()) {
                    viewModel.onEvent(NativeCalendarEvent.ImportSelected)
                } else {
                    viewModel.onEvent(NativeCalendarEvent.PermissionDenied)
                }
            }
            reloadDeviceCalendars()
        }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        direct = savedInstanceState?.getBoolean("direct") ?: false
        if (direct && viewModel.state.value.email.isBlank()) {
            viewModel.onEvent(NativeCalendarEvent.Load(intent.getStringExtra(NativeCalendarSetup.EMAIL).orEmpty()))
        }
        lifecycleScope.launch {
            repeatOnLifecycle(Lifecycle.State.STARTED) {
                viewModel.authorizationIntents.collect {
                    runCatching { authorization.launch(it) }.onFailure {
                        viewModel.onEvent(NativeCalendarEvent.FinishAuthorization(null))
                    }
                }
            }
        }
        setContent { Content() }
    }

    @Composable
    private fun Content() {
        val state by viewModel.state.collectAsState()
        theme.WithTheme {
            Surface(Modifier.fillMaxSize()) {
                if (direct) {
                    NativeCalendarScreen(
                        state,
                        viewModel::onEvent,
                        onImport = ::requestAccess,
                        onClose = {
                            direct = false
                            reloadDeviceCalendars()
                        },
                    )
                } else {
                    DeviceCalendarScreen(
                        deviceCalendars, deviceAccess, deviceError,
                        onToggle = { id, selected ->
                            catalog.setSelected(id, selected)
                            reloadDeviceCalendars()
                        },
                        onAccess = ::requestAccess, onAddAccount = { openSettings(Settings.ACTION_ADD_ACCOUNT) },
                        onSettings = { openSettings(Settings.ACTION_SYNC_SETTINGS) },
                        onDirect = ::openDirect,
                        onDesktopSettings = if (intent.hasExtra(NativeCalendarSetup.SETTINGS)) {
                            ::openAdvanced
                        } else {
                            null
                        },
                        onClose = { finish() },
                    )
                }
            }
        }
    }

    override fun onResume() {
        super.onResume()
        reloadDeviceCalendars()
    }

    override fun onSaveInstanceState(outState: Bundle) {
        outState.putBoolean("direct", direct)
        super.onSaveInstanceState(outState)
    }

    private fun hasAccess() = listOf(Manifest.permission.READ_CALENDAR, Manifest.permission.WRITE_CALENDAR).all {
        ContextCompat.checkSelfPermission(this, it) == PackageManager.PERMISSION_GRANTED
    }

    private fun requestAccess() = permission.launch(
        arrayOf(Manifest.permission.READ_CALENDAR, Manifest.permission.WRITE_CALENDAR),
    )

    private fun reloadDeviceCalendars() {
        deviceLoad?.cancel()
        deviceLoad = lifecycleScope.launch {
            deviceAccess = hasAccess()
            val result = withContext(Dispatchers.IO) { deviceMutex.withLock { runCatching { catalog.calendars() } } }
            deviceError = result.isFailure
            deviceCalendars = result.getOrDefault(emptyList()).toImmutableList()
        }
    }

    private fun openDirect() {
        direct = true
        viewModel.onEvent(NativeCalendarEvent.Load(intent.getStringExtra(NativeCalendarSetup.EMAIL).orEmpty()))
    }

    private fun openSettings(action: String) {
        val request = Intent(action).putExtra(Settings.EXTRA_AUTHORITIES, arrayOf(CalendarContract.AUTHORITY))
        runCatching { startActivity(request) }
            .onFailure { Toast.makeText(this, R.string.calendar_device_settings_unavailable, Toast.LENGTH_LONG).show() }
    }

    private fun openAdvanced() {
        IntentCompat.getParcelableExtra(intent, NativeCalendarSetup.SETTINGS, Intent::class.java)
            ?.takeIf { it.component?.packageName == packageName }?.let { startActivity(it) }
    }
}
