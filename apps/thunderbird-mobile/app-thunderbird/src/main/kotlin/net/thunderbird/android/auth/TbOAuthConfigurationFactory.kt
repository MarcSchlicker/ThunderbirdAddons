package net.thunderbird.android.auth

import net.thunderbird.android.BuildConfig
import net.thunderbird.core.common.oauth.OAuthConfiguration
import net.thunderbird.core.common.oauth.OAuthConfigurationFactory

/**
 * Preserves the upstream mail-provider OAuth support for each Android build type.
 * TB-Connect changes the visible product identity, not the mail capabilities.
 */
@Suppress("ktlint:standard:max-line-length")
class TbOAuthConfigurationFactory : OAuthConfigurationFactory {
    override fun createConfigurations(): Map<List<String>, OAuthConfiguration> = mapOf(
        createAolConfiguration(),
        createFastmailConfiguration(),
        createGmailConfiguration(),
        createMicrosoftConfiguration(),
        createYahooConfiguration(),
        createThundermailConfiguration(),
        createThundermailStageConfiguration(),
    )

    private fun createAolConfiguration(): Pair<List<String>, OAuthConfiguration> =
        listOf("imap.aol.com", "smtp.aol.com") to OAuthConfiguration(
            clientId = buildVariantValue(
                debug = "dj0yJmk9MVJGcHpSejNUcTU3JmQ9WVdrOWMwMHhjSFZqTkhRbWNHbzlNQT09JnM9Y29uc3VtZXJzZWNyZXQmc3Y9MCZ4PWNk",
                release = "dj0yJmk9QTVYM0I0RGQ0VDFBJmQ9WVdrOVNYcFphVWRVYVhnbWNHbzlNQT09JnM9Y29uc3VtZXJzZWNyZXQmc3Y9MCZ4PTA1",
                beta = "dj0yJmk9UjJhdndGbFpCUnlxJmQ9WVdrOU9GbHVUVkpoT1d3bWNHbzlNQT09JnM9Y29uc3VtZXJzZWNyZXQmc3Y9MCZ4PWU3",
                daily = "dj0yJmk9Rk11R2pTTlF0TlZGJmQ9WVdrOVYxcElTMHBwWVZBbWNHbzlNQT09JnM9Y29uc3VtZXJzZWNyZXQmc3Y9MCZ4PWVm",
            ),
            scopes = listOf("mail-w"),
            authorizationEndpoint = "https://api.login.aol.com/oauth2/request_auth",
            tokenEndpoint = "https://api.login.aol.com/oauth2/get_token",
            redirectUri = "${BuildConfig.APPLICATION_ID}://oauth2redirect",
        )

    private fun createFastmailConfiguration(): Pair<List<String>, OAuthConfiguration> =
        listOf("imap.fastmail.com", "smtp.fastmail.com") to OAuthConfiguration(
            clientId = "353e41ae",
            scopes = listOf("https://www.fastmail.com/dev/protocol-imap", "https://www.fastmail.com/dev/protocol-smtp"),
            authorizationEndpoint = "https://api.fastmail.com/oauth/authorize",
            tokenEndpoint = "https://api.fastmail.com/oauth/refresh",
            redirectUri = "${BuildConfig.APPLICATION_ID}://oauth2redirect",
        )

    private fun createGmailConfiguration(): Pair<List<String>, OAuthConfiguration> =
        listOf("imap.gmail.com", "imap.googlemail.com", "smtp.gmail.com", "smtp.googlemail.com") to OAuthConfiguration(
            clientId = buildVariantValue(
                debug = "560629489500-no2mlau7e4vn3psh5esaiodgri09jrj9.apps.googleusercontent.com",
                release = "560629489500-kta4qnt6vrf1bj8ljcohj7cvbbqguauf.apps.googleusercontent.com",
                beta = "560629489500-u95g9r3m604k2f1uqb5c7mo27coj8g9i.apps.googleusercontent.com",
                daily = "560629489500-hbru1fssmec60eoa22b8k8l5tbmj0sc1.apps.googleusercontent.com",
            ),
            scopes = listOf("https://mail.google.com/"),
            authorizationEndpoint = "https://accounts.google.com/o/oauth2/v2/auth",
            tokenEndpoint = "https://oauth2.googleapis.com/token",
            redirectUri = "${BuildConfig.APPLICATION_ID}:/oauth2redirect",
        )

    private fun createMicrosoftConfiguration(): Pair<List<String>, OAuthConfiguration> =
        listOf("outlook.office365.com", "smtp.office365.com", "smtp-mail.outlook.com") to OAuthConfiguration(
            clientId = "e6f8716e-299d-4ed9-bbf3-453f192f44e5",
            scopes = listOf(
                "profile",
                "openid",
                "email",
                "https://outlook.office.com/IMAP.AccessAsUser.All",
                "https://outlook.office.com/SMTP.Send",
                "offline_access",
            ),
            authorizationEndpoint = "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
            tokenEndpoint = "https://login.microsoftonline.com/common/oauth2/v2.0/token",
            redirectUri = buildVariantValue(
                debug = "msauth://net.thunderbird.android.debug/eaXDuh6T3KFWjcJhsoaObT9OayU%3D",
                release = "msauth://net.thunderbird.android/S9nqeF27sTJcEfaInpC%2BDHzHuCY%3D",
                beta = "msauth://net.thunderbird.android.beta/oXQR8QkspkdQCotvApfiBQiPQBU%3D",
                daily = "msauth://net.thunderbird.android.daily/KUkL9b7kcXs%2FtgmDCGD54ka8Bow%3D",
            ),
        )

    private fun createYahooConfiguration(): Pair<List<String>, OAuthConfiguration> =
        listOf("imap.mail.yahoo.com", "smtp.mail.yahoo.com") to OAuthConfiguration(
            clientId = buildVariantValue(
                debug = "dj0yJmk9bXRhTkZod2xmY3JrJmQ9WVdrOVUyUTRXRGQ0Tlc4bWNHbzlNQT09JnM9Y29uc3VtZXJzZWNyZXQmc3Y9MCZ4PTkx",
                release = "dj0yJmk9SW1VbkV0R0FJYU1mJmQ9WVdrOU1Hc3dlSEp3YzNFbWNHbzlNQT09JnM9Y29uc3VtZXJzZWNyZXQmc3Y9MCZ4PWNk",
                beta = "dj0yJmk9Rjc5SXlhQjltcjhnJmQ9WVdrOVkxTmtZbmxDVjNrbWNHbzlNQT09JnM9Y29uc3VtZXJzZWNyZXQmc3Y9MCZ4PThm",
                daily = "dj0yJmk9TTQ2U1JNTlBPQXdJJmQ9WVdrOWVIaHdkMFU0V0hZbWNHbzlNQT09JnM9Y29uc3VtZXJzZWNyZXQmc3Y9MCZ4PTBi",
            ),
            scopes = listOf("mail-w"),
            authorizationEndpoint = "https://api.login.yahoo.com/oauth2/request_auth",
            tokenEndpoint = "https://api.login.yahoo.com/oauth2/get_token",
            redirectUri = "${BuildConfig.APPLICATION_ID}://oauth2redirect",
        )

    private fun createThundermailConfiguration(): Pair<List<String>, OAuthConfiguration> =
        listOf("mail.tb.pro", "mail.thundermail.com") to OAuthConfiguration(
            clientId = "mobile-android-thunderbird",
            scopes = listOf("openid", "profile", "email", "offline_access"),
            authorizationEndpoint = "https://auth.tb.pro/realms/tbpro/protocol/openid-connect/auth",
            tokenEndpoint = "https://auth.tb.pro/realms/tbpro/protocol/openid-connect/token",
            redirectUri = "${BuildConfig.APPLICATION_ID}://oauth2redirect",
        )

    private fun createThundermailStageConfiguration(): Pair<List<String>, OAuthConfiguration> =
        listOf("mail.stage-thundermail.com") to OAuthConfiguration(
            clientId = "mobile-android-thunderbird",
            scopes = listOf("openid", "profile", "email", "offline_access"),
            authorizationEndpoint = "https://auth-stage.tb.pro/realms/tbpro/protocol/openid-connect/auth",
            tokenEndpoint = "https://auth-stage.tb.pro/realms/tbpro/protocol/openid-connect/token",
            redirectUri = "${BuildConfig.APPLICATION_ID}://oauth2redirect",
        )

    private fun buildVariantValue(debug: String, release: String, beta: String, daily: String): String = when (BuildConfig.BUILD_TYPE) {
        "debug" -> debug
        "beta" -> beta
        "daily" -> daily
        else -> release
    }
}
