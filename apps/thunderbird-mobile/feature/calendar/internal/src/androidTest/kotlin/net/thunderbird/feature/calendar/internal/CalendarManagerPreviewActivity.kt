package net.thunderbird.feature.calendar.internal

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import kotlinx.collections.immutable.ImmutableList
import kotlinx.collections.immutable.persistentListOf
import kotlinx.collections.immutable.toImmutableList
import net.thunderbird.components.ui.bolt.atom.Surface
import net.thunderbird.components.ui.bolt.theme.thunderbird.ThunderbirdBoltTheme

/** Test APK only. Renders the actual production UI with synthetic data and no account/provider access. */
class CalendarManagerPreviewActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        val dark = intent.getBooleanExtra("dark", false)
        setTheme(
            if (dark) android.R.style.Theme_Material_NoActionBar else android.R.style.Theme_Material_Light_NoActionBar,
        )
        super.onCreate(savedInstanceState)
        setContent {
            var calendars by remember { mutableStateOf<ImmutableList<DeviceCalendarEntry>>(FIXTURES) }
            ThunderbirdBoltTheme(darkTheme = dark) {
                Surface {
                    DeviceCalendarScreen(
                        calendars, true, false,
                        onToggle = { id, selected ->
                            calendars =
                                calendars.map {
                                    if (it.id ==
                                        id
                                    ) {
                                        it.copy(selected = selected)
                                    } else {
                                        it
                                    }
                                }.toImmutableList()
                        }, onAccess = {}, onAddAccount = {}, onSettings = {}, onDirect = {}, onDesktopSettings = {},
                        onClose = { finish() },
                    )
                }
            }
        }
    }

    companion object {
        private val FIXTURES = persistentListOf(
            DeviceCalendarEntry(1, "Arbeit", "konto@example.invalid", "Google", -12541700, true, true),
            DeviceCalendarEntry(2, "Privat", "konto@example.invalid", "Google", -16738680, true, false),
            DeviceCalendarEntry(3, "Team", "cloud@example.invalid", "DAVx⁵", -1097532, false, true),
        )
    }
}
