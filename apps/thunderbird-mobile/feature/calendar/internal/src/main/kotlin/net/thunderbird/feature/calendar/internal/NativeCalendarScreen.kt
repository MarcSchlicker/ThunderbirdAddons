package net.thunderbird.feature.calendar.internal

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
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
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.ColorFilter
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.unit.dp
import net.thunderbird.components.ui.bolt.atom.Checkbox
import net.thunderbird.components.ui.bolt.atom.Surface
import net.thunderbird.components.ui.bolt.atom.button.ButtonFilled
import net.thunderbird.components.ui.bolt.atom.button.ButtonText
import net.thunderbird.components.ui.bolt.atom.card.CardFilled
import net.thunderbird.components.ui.bolt.atom.text.TextBodyMedium
import net.thunderbird.components.ui.bolt.atom.text.TextBodySmall
import net.thunderbird.components.ui.bolt.atom.text.TextTitleLarge
import net.thunderbird.components.ui.bolt.atom.text.TextTitleMedium
import net.thunderbird.components.ui.bolt.atom.textfield.TextFieldOutlinedEmailAddress
import net.thunderbird.components.ui.bolt.theme.BoltTheme
import net.thunderbird.core.calendar.CalDavCalendar
import net.thunderbird.feature.calendar.CalendarAuthError

@Composable
internal fun NativeCalendarScreen(
    state: NativeCalendarState,
    onEvent: (NativeCalendarEvent) -> Unit,
    onImport: () -> Unit,
    onClose: () -> Unit,
) {
    val list = rememberLazyListState()
    LaunchedEffect(state.activationCode, state.report) {
        if (state.activationCode != null || state.report != null) list.animateScrollToItem(0)
    }
    Column(Modifier.fillMaxSize()) {
        Row(Modifier.fillMaxWidth().padding(horizontal = 12.dp), verticalAlignment = Alignment.CenterVertically) {
            ButtonText(stringResource(R.string.calendar_manage_back), onClose)
            TextBodySmall(stringResource(R.string.calendar_manage_provider), color = BoltTheme.colors.onSurfaceVariant)
        }
        LazyColumn(
            Modifier.weight(1f),
            state = list,
            contentPadding = PaddingValues(20.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            item {
                TextTitleLarge(stringResource(R.string.calendar_manage_title))
                TextBodyMedium(
                    stringResource(R.string.calendar_manage_intro),
                    modifier = Modifier.padding(top = 6.dp),
                    color = BoltTheme.colors.onSurfaceVariant,
                )
            }
            item { AccountCard(state, onEvent) }
            item { ConnectionStatus(state) }
            if (state.authorized) {
                val active = state.calendars.filter { it.url in state.activeUrls }
                if (active.isNotEmpty()) {
                    item { SectionTitle(R.string.calendar_manage_active, active.size) }
                    items(active, key = { it.url }) { CalendarCard(it, state, onEvent) }
                }
                val available = state.calendars.filter { it.url !in state.activeUrls }
                item { SectionTitle(R.string.calendar_manage_available, available.size) }
                if (available.isEmpty()) item { TextBodySmall(stringResource(R.string.calendar_manage_all_added)) }
                items(available, key = { it.url }) { CalendarCard(it, state, onEvent) }
                item { ManagementActions(state, onEvent) }
            }
        }
        ImportFooter(state, onEvent, onImport, onClose)
    }
}

@Composable
private fun AccountCard(state: NativeCalendarState, onEvent: (NativeCalendarEvent) -> Unit) {
    CardFilled(Modifier.fillMaxWidth(), shape = RoundedCornerShape(20.dp)) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                Image(
                    painterResource(R.drawable.tb_calendar_account_icon),
                    null,
                    Modifier.size(36.dp),
                    colorFilter = ColorFilter.tint(BoltTheme.colors.primary),
                )
                Column(Modifier.weight(1f)) {
                    TextTitleMedium(stringResource(R.string.calendar_manage_provider))
                    TextBodySmall(
                        stringResource(
                            if (state.authorized) {
                                R.string.calendar_manage_signed_in
                            } else {
                                R.string.calendar_manage_sign_in_needed
                            },
                        ),
                        color = BoltTheme.colors.onSurfaceVariant,
                    )
                }
            }
            if (state.authorized) {
                TextBodyMedium(state.email)
                TextBodySmall(
                    stringResource(R.string.calendar_manage_remembered),
                    color = BoltTheme.colors.onSurfaceVariant,
                )
            } else {
                TextFieldOutlinedEmailAddress(
                    state.email,
                    { onEvent(NativeCalendarEvent.ChangeEmail(it)) },
                    modifier = Modifier.fillMaxWidth(),
                    label = stringResource(R.string.native_calendar_email),
                    isEnabled = state.status != NativeCalendarStatus.BUSY,
                )
            }
            AccountSwitcher(state, onEvent)
        }
    }
}

@Composable
private fun AccountSwitcher(state: NativeCalendarState, onEvent: (NativeCalendarEvent) -> Unit) {
    var showAccounts by remember { mutableStateOf(false) }
    Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
        if (state.accounts.isNotEmpty()) {
            ButtonText(
                stringResource(R.string.calendar_manage_switch_account),
                { showAccounts = !showAccounts },
                enabled = state.status != NativeCalendarStatus.BUSY,
            )
        }
        if (state.authorized) {
            ButtonText(
                stringResource(R.string.calendar_manage_add_account),
                { onEvent(NativeCalendarEvent.ChangeEmail("")) },
                enabled =
                state.status != NativeCalendarStatus.BUSY,
            )
        }
    }
    if (showAccounts) {
        state.accounts.forEach { email ->
            ButtonText(
                email,
                {
                    showAccounts = false
                    onEvent(NativeCalendarEvent.Load(email))
                },
                enabled = state.status != NativeCalendarStatus.BUSY,
            )
        }
    }
}

@Composable
private fun SectionTitle(title: Int, count: Int) {
    Row(Modifier.fillMaxWidth().padding(top = 12.dp), verticalAlignment = Alignment.CenterVertically) {
        TextTitleMedium(stringResource(title), modifier = Modifier.weight(1f))
        TextBodySmall(count.toString(), color = BoltTheme.colors.onSurfaceVariant)
    }
}

@Composable
private fun CalendarCard(calendar: CalDavCalendar, state: NativeCalendarState, onEvent: (NativeCalendarEvent) -> Unit) {
    val active = calendar.url in state.activeUrls
    val selected = calendar.url in state.selectedUrls
    val shape = RoundedCornerShape(16.dp)
    val description = stringResource(
        if (active) {
            R.string.calendar_manage_on_device
        } else {
            if (selected) R.string.calendar_manage_selected else R.string.calendar_manage_not_selected
        },
    )
    val border = if (selected) Modifier.border(1.dp, BoltTheme.colors.primary, shape) else Modifier
    CardFilled(
        Modifier.fillMaxWidth().then(border).semantics { stateDescription = description },
        shape = shape,
        onClick = if (active || state.status == NativeCalendarStatus.BUSY) {
            null
        } else {
            ({ onEvent(NativeCalendarEvent.ToggleCalendar(calendar.url)) })
        },
    ) {
        Row(
            Modifier.padding(horizontal = 12.dp, vertical = 10.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Box(
                Modifier.size(10.dp).background(
                    if (calendar.writable) {
                        BoltTheme.colors.primary
                    } else {
                        BoltTheme.colors.onSurfaceVariant
                    },
                    CircleShape,
                ),
            )
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                TextBodyMedium(calendar.displayName.ifBlank { stringResource(R.string.calendar_manage_unnamed) })
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
            if (active) {
                TextBodySmall(stringResource(R.string.calendar_manage_on_device), color = BoltTheme.colors.primary)
            } else {
                Checkbox(selected, onCheckedChange = null, enabled = state.status != NativeCalendarStatus.BUSY)
            }
        }
    }
}

@Composable
private fun ConnectionStatus(state: NativeCalendarState) {
    when {
        state.status == NativeCalendarStatus.BUSY -> TextBodyMedium(stringResource(R.string.native_calendar_busy))

        state.status == NativeCalendarStatus.ERROR || state.status == NativeCalendarStatus.WRONG_ACCOUNT -> ErrorStatus(
            state,
        )

        state.report != null -> TextBodySmall(
            stringResource(
                R.string.calendar_manage_result,
                state.report.calendars,
                state.report.downloaded,
                state.report.uploaded,
            ),
            color = BoltTheme.colors.onSurfaceVariant,
        )
    }
}

@Composable
private fun ErrorStatus(state: NativeCalendarState) {
    var details by remember(state.activationCode) { mutableStateOf(false) }
    CardFilled(Modifier.fillMaxWidth()) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            TextTitleMedium(stringResource(R.string.calendar_manage_error), color = BoltTheme.colors.error)
            TextBodySmall(
                stringResource(
                    when (state.authError) {
                        CalendarAuthError.CONFIGURATION -> R.string.native_calendar_configuration_error
                        CalendarAuthError.API_DISABLED -> R.string.native_calendar_api_disabled
                        CalendarAuthError.PERMISSION_REQUIRED -> R.string.native_calendar_permission_required
                        CalendarAuthError.RATE_LIMITED -> R.string.native_calendar_rate_limited
                        CalendarAuthError.WRONG_ACCOUNT -> R.string.native_calendar_wrong_account
                        else -> R.string.native_calendar_error
                    },
                ),
            )
            state.activationCode?.let { code ->
                ButtonText(stringResource(R.string.calendar_manage_details), { details = !details })
                if (details) TextBodySmall(code)
            }
        }
    }
}

@Composable
private fun ManagementActions(state: NativeCalendarState, onEvent: (NativeCalendarEvent) -> Unit) {
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
        ButtonText(
            stringResource(R.string.calendar_manage_refresh),
            { onEvent(NativeCalendarEvent.Load(state.email)) },
            enabled = state.status != NativeCalendarStatus.BUSY,
        )
        if (state.activeUrls.isNotEmpty()) {
            ButtonText(
                stringResource(R.string.native_calendar_sync),
                { onEvent(NativeCalendarEvent.Synchronize) },
                enabled = state.status != NativeCalendarStatus.BUSY,
            )
        }
    }
}

@Composable
private fun ImportFooter(
    state: NativeCalendarState,
    onEvent: (NativeCalendarEvent) -> Unit,
    onImport: () -> Unit,
    onClose: () -> Unit,
) {
    Surface(Modifier.fillMaxWidth()) {
        Column(
            Modifier.padding(horizontal = 20.dp, vertical = 12.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            if (state.authorized && state.selectedUrls.isNotEmpty()) {
                TextBodySmall(
                    stringResource(R.string.calendar_manage_selection_hint),
                    color = BoltTheme.colors.onSurfaceVariant,
                )
                ButtonFilled(
                    stringResource(R.string.calendar_manage_import, state.selectedUrls.size),
                    onImport,
                    modifier = Modifier.fillMaxWidth(),
                    enabled = state.status != NativeCalendarStatus.BUSY,
                )
            } else if (state.authorized) {
                ButtonFilled(
                    stringResource(R.string.calendar_manage_done),
                    onClose,
                    modifier = Modifier.fillMaxWidth(),
                    enabled = state.status != NativeCalendarStatus.BUSY,
                )
            } else {
                ButtonFilled(
                    stringResource(R.string.calendar_manage_connect),
                    {
                        onEvent(NativeCalendarEvent.Authorize)
                    },
                    modifier = Modifier.fillMaxWidth(),
                    enabled =
                    state.email.contains('@') && state.status != NativeCalendarStatus.BUSY &&
                        state.authError !in setOf(CalendarAuthError.CONFIGURATION, CalendarAuthError.API_DISABLED),
                )
            }
        }
    }
}
