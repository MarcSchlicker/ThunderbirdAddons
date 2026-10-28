package net.thunderbird.android.auth

import net.thunderbird.core.common.oauth.OAuthConfiguration
import net.thunderbird.core.common.oauth.OAuthConfigurationProvider

/** An explicitly configured TB-Connect calendar client; mail OAuth is never a fallback. */
internal class TbCalendarOAuthConfigurationProvider(
    private val clientId: String,
    private val applicationId: String,
) : OAuthConfigurationProvider {
    override fun getConfiguration(hostname: String): OAuthConfiguration? {
        if (hostname != "imap.gmail.com" || !CLIENT_ID.matches(clientId)) return null
        return OAuthConfiguration(
            clientId = clientId,
            scopes = listOf("https://www.googleapis.com/auth/calendar", "openid", "email"),
            authorizationEndpoint = "https://accounts.google.com/o/oauth2/v2/auth",
            tokenEndpoint = "https://oauth2.googleapis.com/token",
            redirectUri = "$applicationId:/oauth2redirect",
        )
    }

    private companion object {
        val CLIENT_ID = Regex("[0-9]+-[a-z0-9]+[.]apps[.]googleusercontent[.]com")
    }
}
