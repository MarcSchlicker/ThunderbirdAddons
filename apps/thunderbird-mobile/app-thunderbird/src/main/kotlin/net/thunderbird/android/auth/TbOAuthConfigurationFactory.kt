package net.thunderbird.android.auth

import net.thunderbird.android.BuildConfig
import net.thunderbird.core.common.oauth.OAuthConfiguration
import net.thunderbird.core.common.oauth.OAuthConfigurationFactory

/** Keeps existing debug logins intact; production only uses explicitly configured TB-Connect clients. */
@Suppress("ktlint:standard:max-line-length")
class TbOAuthConfigurationFactory(
    private val production: Boolean = BuildConfig.BUILD_TYPE != "debug",
    private val applicationId: String = BuildConfig.APPLICATION_ID,
    private val clients: Map<String, String> = mapOf(
        "imap.gmail.com" to BuildConfig.TB_MAIL_GOOGLE_CLIENT_ID,
        "outlook.office365.com" to BuildConfig.TB_MAIL_MICROSOFT_CLIENT_ID,
        "imap.mail.yahoo.com" to BuildConfig.TB_MAIL_YAHOO_CLIENT_ID,
        "imap.aol.com" to BuildConfig.TB_MAIL_AOL_CLIENT_ID,
        "imap.fastmail.com" to BuildConfig.TB_MAIL_FASTMAIL_CLIENT_ID,
        "mail.thundermail.com" to BuildConfig.TB_MAIL_THUNDERMAIL_CLIENT_ID,
    ),
) : OAuthConfigurationFactory {
    override fun createConfigurations(): Map<List<String>, OAuthConfiguration> = mapOf(
        createAolConfiguration(),
        createFastmailConfiguration(),
        createGmailConfiguration(),
        createMicrosoftConfiguration(),
        createYahooConfiguration(),
        createThundermailConfiguration(),
        createThundermailStageConfiguration(),
    ).let { configurations ->
        if (!production) {
            configurations
        } else {
            configurations.mapNotNull { (hosts, configuration) ->
                val client = clients[hosts.first()].orEmpty().trim()
                if (client.isEmpty()) {
                    null
                } else {
                    require(client != configuration.clientId) { "Production must use its own mail OAuth client" }
                    require(client.matches(Regex("[A-Za-z0-9._~+/=-]{1,1024}"))) { "Invalid mail OAuth client" }
                    val separator = if (hosts.first() == "imap.gmail.com") ":/" else "://"
                    hosts to
                        configuration.copy(clientId = client, redirectUri = "$applicationId${separator}oauth2redirect")
                }
            }.toMap()
        }
    }

    private fun createAolConfiguration(): Pair<List<String>, OAuthConfiguration> =
        listOf("imap.aol.com", "smtp.aol.com") to OAuthConfiguration(
            clientId = buildVariantValue(
                debug = "dj0yJmk9MVJGcHpSejNUcTU3JmQ9WVdrOWMwMHhjSFZqTkhR" +
                    "bWNHbzlNQT09JnM9Y29uc3VtZXJzZWNyZXQmc3Y9MCZ4PWNk",
                release = "dj0yJmk9QTVYM0I0RGQ0VDFBJmQ9WVdrOVNYcFphVWRVYVhn" +
                    "bWNHbzlNQT09JnM9Y29uc3VtZXJzZWNyZXQmc3Y9MCZ4PTA1",
                beta = "dj0yJmk9UjJhdndGbFpCUnlxJmQ9WVdrOU9GbHVUVkpoT1d3" +
                    "bWNHbzlNQT09JnM9Y29uc3VtZXJzZWNyZXQmc3Y9MCZ4PWU3",
                daily = "dj0yJmk9Rk11R2pTTlF0TlZGJmQ9WVdrOVYxcElTMHBwWVZB" +
                    "bWNHbzlNQT09JnM9Y29uc3VtZXJzZWNyZXQmc3Y9MCZ4PWVm",
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
                debug = "dj0yJmk9bXRhTkZod2xmY3JrJmQ9WVdrOVUyUTRXRGQ0Tlc4" +
                    "bWNHbzlNQT09JnM9Y29uc3VtZXJzZWNyZXQmc3Y9MCZ4PTkx",
                release = "dj0yJmk9SW1VbkV0R0FJYU1mJmQ9WVdrOU1Hc3dlSEp3YzNF" +
                    "bWNHbzlNQT09JnM9Y29uc3VtZXJzZWNyZXQmc3Y9MCZ4PWNk",
                beta = "dj0yJmk9Rjc5SXlhQjltcjhnJmQ9WVdrOVkxTmtZbmxDVjNr" +
                    "bWNHbzlNQT09JnM9Y29uc3VtZXJzZWNyZXQmc3Y9MCZ4PThm",
                daily = "dj0yJmk9TTQ2U1JNTlBPQXdJJmQ9WVdrOWVIaHdkMFU0V0hZ" +
                    "bWNHbzlNQT09JnM9Y29uc3VtZXJzZWNyZXQmc3Y9MCZ4PTBi",
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

    private fun buildVariantValue(
        debug: String,
        release: String,
        beta: String,
        daily: String,
    ): String = when (BuildConfig.BUILD_TYPE) {
        "debug" -> debug
        "beta" -> beta
        "daily" -> daily
        else -> release
    }
}
