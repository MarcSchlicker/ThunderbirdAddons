package net.thunderbird.android.auth

import assertk.assertThat
import assertk.assertions.isEqualTo
import kotlin.test.Test
import kotlin.test.assertFailsWith

class TbProductionOAuthConfigurationTest {
    @Test
    fun productionNeverFallsBackToUpstreamClients() {
        val testSubject = TbOAuthConfigurationFactory(production = true, clients = emptyMap())
        assertThat(testSubject.createConfigurations().isEmpty()).isEqualTo(true)
    }

    @Test
    fun ownGoogleClientPreservesScopesAndUsesOwnRedirect() {
        val testSubject = TbOAuthConfigurationFactory(
            production = true,
            applicationId = "eu.mschlicker.tbconnect",
            clients = mapOf("imap.gmail.com" to "own-google-client"),
        )
        val configurations = testSubject.createConfigurations()
        assertThat(configurations.size).isEqualTo(1)
        val google = configurations.values.single()
        assertThat(google.clientId).isEqualTo("own-google-client")
        assertThat(google.redirectUri).isEqualTo("eu.mschlicker.tbconnect:/oauth2redirect")
        assertThat(google.scopes).isEqualTo(listOf("https://mail.google.com/"))
    }

    @Test
    fun debugKeepsPreviouslyAvailableProviders() {
        val testSubject = TbOAuthConfigurationFactory(production = false, clients = emptyMap())
        assertThat(testSubject.createConfigurations().size).isEqualTo(7)
    }

    @Test
    fun upstreamClientCannotBeMistakenForOwnProductionClient() {
        val upstream = TbOAuthConfigurationFactory(production = false).createConfigurations()
            .entries.single { "imap.gmail.com" in it.key }.value.clientId
        val testSubject = TbOAuthConfigurationFactory(production = true, clients = mapOf("imap.gmail.com" to upstream))
        assertFailsWith<IllegalArgumentException> { testSubject.createConfigurations() }
    }

    @Test
    fun malformedConfigurationCannotChangeRedirectOrInjectFields() {
        val testSubject = TbOAuthConfigurationFactory(
            production = true,
            clients = mapOf("imap.gmail.com" to "client\nmalformed"),
        )
        assertFailsWith<IllegalArgumentException> { testSubject.createConfigurations() }
    }
}
