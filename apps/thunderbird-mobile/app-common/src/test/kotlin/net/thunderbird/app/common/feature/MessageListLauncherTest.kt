package net.thunderbird.app.common.feature

import android.app.Application
import assertk.assertThat
import assertk.assertions.isEqualTo
import assertk.assertions.isNull
import com.fsck.k9.Preferences
import com.fsck.k9.activity.MessageHomeActivity
import com.fsck.k9.mail.AuthType
import com.fsck.k9.mail.ConnectionSecurity
import com.fsck.k9.mail.ServerSettings
import com.fsck.k9.ui.zeitklar.GoogleCalendarSetupActivity
import net.thunderbird.core.android.account.LegacyAccountDto
import net.thunderbird.core.android.testing.RobolectricTest
import org.junit.Test
import org.mockito.kotlin.doReturn
import org.mockito.kotlin.mock
import org.robolectric.RuntimeEnvironment
import org.robolectric.Shadows.shadowOf

class MessageListLauncherTest : RobolectricTest() {
    private val context: Application = RuntimeEnvironment.getApplication()

    private fun preferences(host: String): Preferences {
        val settings = ServerSettings(
            "imap",
            host,
            993,
            ConnectionSecurity.SSL_TLS_REQUIRED,
            AuthType.XOAUTH2,
            "user@example.invalid",
            null,
            null,
        )
        val account = mock<LegacyAccountDto> {
            on { email } doReturn "user@example.invalid"
            on { incomingServerSettings } doReturn settings
        }
        return mock { on { getAccount("fixture-account") } doReturn account }
    }

    @Test
    fun googleAccountSetupOpensCalendarSetupForTheSameAccountAfterMail() {
        MessageListLauncher(context, preferences("imap.gmail.com")).launch("fixture-account")
        // Robolectric exposes the most recently started activity first.
        val calendar = shadowOf(context).nextStartedActivity
        val mail = shadowOf(context).nextStartedActivity
        assertThat(mail.component?.className).isEqualTo(MessageHomeActivity::class.java.name)
        assertThat(calendar.component?.className).isEqualTo(GoogleCalendarSetupActivity::class.java.name)
        assertThat(calendar.getStringExtra("googleCalendarEmail")).isEqualTo("user@example.invalid")
    }

    @Test
    fun unrelatedMailProviderDoesNotOpenGoogleSetup() {
        MessageListLauncher(context, preferences("imap.example.invalid")).launch("fixture-account")
        assertThat(shadowOf(context).nextStartedActivity.component?.className)
            .isEqualTo(MessageHomeActivity::class.java.name)
        assertThat(shadowOf(context).nextStartedActivity).isNull()
    }

    @Test
    fun normalMessageListLaunchDoesNotRestartTheSetupWizard() {
        MessageListLauncher(context, preferences("imap.gmail.com")).launch(null)
        assertThat(shadowOf(context).nextStartedActivity.component?.className)
            .isEqualTo(MessageHomeActivity::class.java.name)
        assertThat(shadowOf(context).nextStartedActivity).isNull()
    }
}
