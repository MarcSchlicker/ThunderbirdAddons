package net.thunderbird.android.auth

import assertk.assertThat
import assertk.assertions.isEqualTo
import kotlin.test.Test

class TbCalendarOAuthConfigurationProviderTest {
    @Test
    fun missingClientNeverFallsBackToMailIdentity() {
        val testSubject = TbCalendarOAuthConfigurationProvider("", APPLICATION_ID)
        assertThat(testSubject.getConfiguration("imap.gmail.com")).isEqualTo(null)
    }

    @Test
    fun configuredCalendarClientUsesOwnIdentityAndTheActualPackageRedirect() {
        val testSubject = TbCalendarOAuthConfigurationProvider(CLIENT_ID, APPLICATION_ID)
        val configuration = requireNotNull(testSubject.getConfiguration("imap.gmail.com"))
        assertThat(configuration.clientId).isEqualTo(CLIENT_ID)
        assertThat(configuration.redirectUri).isEqualTo("$APPLICATION_ID:/oauth2redirect")
        assertThat(configuration.authorizationEndpoint).isEqualTo("https://accounts.google.com/o/oauth2/v2/auth")
        assertThat(configuration.tokenEndpoint).isEqualTo("https://oauth2.googleapis.com/token")
        assertThat(
            configuration.scopes,
        ).isEqualTo(listOf("https://www.googleapis.com/auth/calendar", "openid", "email"))
        assertThat(testSubject.getConfiguration("example.invalid")).isEqualTo(null)
    }

    @Test
    fun invalidClientIdentifiersDoNotProduceAnAuthorizationConfiguration() {
        for (client in listOf("not-a-client", "https://example.invalid", "$CLIENT_ID\n", "\"$CLIENT_ID\"")) {
            val testSubject = TbCalendarOAuthConfigurationProvider(client, APPLICATION_ID)
            assertThat(testSubject.getConfiguration("imap.gmail.com")).isEqualTo(null)
        }
    }

    @Test
    fun calendarConfigurationDoesNotModifyMailConfiguration() {
        val factory = TbOAuthConfigurationFactory()
        val before = factory.createConfigurations()
        val testSubject = TbCalendarOAuthConfigurationProvider(CLIENT_ID, APPLICATION_ID)
        testSubject.getConfiguration("imap.gmail.com")
        assertThat(factory.createConfigurations()).isEqualTo(before)
        val mail = before.entries.single { "imap.gmail.com" in it.key }.value
        assertThat(mail.scopes).isEqualTo(listOf("https://mail.google.com/"))
        assertThat(mail.clientId == CLIENT_ID).isEqualTo(false)
    }

    private companion object {
        const val APPLICATION_ID = "net.thunderbird.android.debug"
        const val CLIENT_ID = "123456789012-tbconnecttest.apps.googleusercontent.com"
    }
}
