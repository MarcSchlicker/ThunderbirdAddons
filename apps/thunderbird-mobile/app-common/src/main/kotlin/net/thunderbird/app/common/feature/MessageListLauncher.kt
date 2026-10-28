package net.thunderbird.app.common.feature

import android.content.Context
import app.k9mail.feature.launcher.FeatureLauncherExternalContract
import com.fsck.k9.Preferences
import com.fsck.k9.activity.MessageHomeActivity
import com.fsck.k9.ui.zeitklar.GoogleCalendarSetupActivity

internal class MessageListLauncher(
    private val context: Context,
    private val preferences: Preferences,
) : FeatureLauncherExternalContract.MessageListLauncher {
    override fun launch(accountUuid: String?) {
        if (accountUuid != null) {
            MessageHomeActivity.launch(context, accountUuid)
            val account = preferences.getAccount(accountUuid)
            if (account?.incomingServerSettings?.host?.lowercase() in GOOGLE_MAIL_HOSTS) {
                context.startActivity(
                    GoogleCalendarSetupActivity.intent(context, account?.email.orEmpty()).apply {
                        addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK)
                    },
                )
            }
        } else {
            MessageHomeActivity.launch(context)
        }
    }

    companion object {
        private val GOOGLE_MAIL_HOSTS = setOf(
            "imap.gmail.com",
            "imap.googlemail.com",
            "pop.gmail.com",
            "pop.googlemail.com",
        )
    }
}
