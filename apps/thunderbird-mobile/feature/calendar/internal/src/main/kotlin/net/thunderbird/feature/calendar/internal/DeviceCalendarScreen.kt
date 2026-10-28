package net.thunderbird.feature.calendar.internal

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.ColorFilter
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import kotlinx.collections.immutable.ImmutableList
import net.thunderbird.components.ui.bolt.atom.Checkbox
import net.thunderbird.components.ui.bolt.atom.button.ButtonFilled
import net.thunderbird.components.ui.bolt.atom.button.ButtonText
import net.thunderbird.components.ui.bolt.atom.card.CardFilled
import net.thunderbird.components.ui.bolt.atom.text.TextBodyMedium
import net.thunderbird.components.ui.bolt.atom.text.TextBodySmall
import net.thunderbird.components.ui.bolt.atom.text.TextTitleLarge
import net.thunderbird.components.ui.bolt.atom.text.TextTitleMedium
import net.thunderbird.components.ui.bolt.theme.BoltTheme

@Suppress("LongParameterList")
@Composable
internal fun DeviceCalendarScreen(
    calendars: ImmutableList<DeviceCalendarEntry>,
    access: Boolean,
    error: Boolean,
    onToggle: (Long, Boolean) -> Unit,
    onAccess: () -> Unit,
    onAddAccount: () -> Unit,
    onSettings: () -> Unit,
    onDirect: () -> Unit,
    onDesktopSettings: (() -> Unit)?,
    onClose: () -> Unit,
) {
    Column(Modifier.fillMaxSize()) {
        Row(Modifier.fillMaxWidth().padding(horizontal = 12.dp), verticalAlignment = Alignment.CenterVertically) {
            ButtonText(stringResource(R.string.calendar_manage_back), onClose)
            TextBodySmall(stringResource(R.string.calendar_device_heading), color = BoltTheme.colors.onSurfaceVariant)
        }
        LazyColumn(
            Modifier.weight(1f),
            contentPadding = PaddingValues(20.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            item { DeviceHeader(calendars) }
            if (!access) {
                item {
                    CardFilled(Modifier.fillMaxWidth()) {
                        Column(Modifier.padding(16.dp)) {
                            TextBodyMedium(stringResource(R.string.calendar_device_permission))
                            ButtonFilled(
                                stringResource(R.string.calendar_device_allow),
                                onAccess,
                                Modifier.padding(top = 12.dp),
                            )
                        }
                    }
                }
            }
            if (error) {
                item {
                    TextBodyMedium(stringResource(R.string.calendar_device_error), color = BoltTheme.colors.error)
                }
            }
            calendars.groupBy { it.account to it.source }.forEach { (account, entries) ->
                item(key = "account:$account") {
                    Column(Modifier.padding(top = 16.dp, bottom = 4.dp)) {
                        TextTitleMedium(account.first.ifBlank { stringResource(R.string.calendar_device_local) })
                        TextBodySmall(account.second, color = BoltTheme.colors.onSurfaceVariant)
                    }
                }
                items(entries, key = { it.id }) { DeviceCalendarRow(it, onToggle) }
            }
            if (access && calendars.isEmpty()) item { TextBodyMedium(stringResource(R.string.calendar_device_empty)) }
            item { DeviceAccountActions(onAddAccount, onSettings, onDirect, onDesktopSettings) }
        }
        ButtonFilled(
            stringResource(R.string.calendar_manage_done),
            onClose,
            Modifier.fillMaxWidth().padding(horizontal = 20.dp, vertical = 12.dp),
        )
    }
}

@Composable
private fun DeviceHeader(calendars: ImmutableList<DeviceCalendarEntry>) {
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            Image(
                painterResource(R.drawable.tb_calendar_account_icon),
                null,
                Modifier.size(40.dp),
                colorFilter = ColorFilter.tint(BoltTheme.colors.primary),
            )
            TextTitleLarge(stringResource(R.string.calendar_manage_title))
        }
        TextBodyMedium(stringResource(R.string.calendar_device_intro), color = BoltTheme.colors.onSurfaceVariant)
        TextBodySmall(
            stringResource(R.string.calendar_device_count, calendars.count { it.selected }, calendars.size),
            color = BoltTheme.colors.primary,
        )
    }
}

@Composable
private fun DeviceCalendarRow(calendar: DeviceCalendarEntry, onToggle: (Long, Boolean) -> Unit) {
    CardFilled(
        Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(16.dp),
        onClick = { onToggle(calendar.id, !calendar.selected) },
    ) {
        Row(
            Modifier.padding(horizontal = 14.dp, vertical = 10.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Box(Modifier.size(12.dp).background(Color(calendar.color), CircleShape))
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                TextBodyMedium(calendar.name.ifBlank { stringResource(R.string.calendar_manage_unnamed) })
                TextBodySmall(
                    stringResource(
                        if (calendar.writable) {
                            R.string.native_calendar_writable
                        } else {
                            R.string.native_calendar_readonly
                        },
                    ),
                    color = BoltTheme.colors.onSurfaceVariant,
                )
            }
            Checkbox(calendar.selected, onCheckedChange = null)
        }
    }
}

@Composable
private fun DeviceAccountActions(
    onAddAccount: () -> Unit,
    onSettings: () -> Unit,
    onDirect: () -> Unit,
    onDesktopSettings: (() -> Unit)?,
) {
    Column(Modifier.padding(top = 12.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
        ButtonFilled(stringResource(R.string.calendar_device_add), onAddAccount, Modifier.fillMaxWidth())
        ButtonText(stringResource(R.string.calendar_device_settings), onSettings)
        TextBodySmall(stringResource(R.string.calendar_device_provider_hint), color = BoltTheme.colors.onSurfaceVariant)
        ButtonText(stringResource(R.string.calendar_device_direct), onDirect)
        onDesktopSettings?.let { ButtonText(stringResource(R.string.calendar_device_advanced), it) }
    }
}
