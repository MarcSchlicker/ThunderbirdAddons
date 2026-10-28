package net.thunderbird.feature.calendar.internal

import assertk.assertThat
import assertk.assertions.isEqualTo
import net.thunderbird.core.android.testing.RobolectricTest
import net.thunderbird.core.common.oauth.OAuthConfiguration
import net.thunderbird.feature.calendar.CalendarAuthError
import net.thunderbird.feature.calendar.CalendarAuthFailure
import org.junit.Test

class CalendarAuthorizationPolicyTest : RobolectricTest() {
    private val testSubject = CalendarAuthorizationPolicy

    @Test
    fun matchingPendingRequestIsAccepted() {
        testSubject.validatePending(EMAIL, EMAIL, "state", "state", 0L, 10L)
    }

    @Test
    fun unrelatedResponseCannotCompletePendingCalendarLogin() {
        val error = runCatching { testSubject.validatePending(EMAIL, EMAIL, "state", "forged", 0L, 10L) }
        assertThat((error.exceptionOrNull() as CalendarAuthFailure).error).isEqualTo(CalendarAuthError.CANCELED)
    }

    @Test
    fun responseForAnotherTargetCannotReplaceExistingAccount() {
        val error =
            runCatching { testSubject.validatePending("other@example.invalid", EMAIL, "state", "state", 0L, 10L) }
        assertThat((error.exceptionOrNull() as CalendarAuthFailure).error).isEqualTo(CalendarAuthError.CANCELED)
    }

    @Test
    fun expiredOrFuturePendingRequestIsRejected() {
        for (now in listOf(-1L, 600_001L)) {
            val error = runCatching { testSubject.validatePending(EMAIL, EMAIL, "state", "state", 0L, now) }
            assertThat((error.exceptionOrNull() as CalendarAuthFailure).error).isEqualTo(CalendarAuthError.CANCELED)
        }
    }

    @Test
    fun loginHintAloneDoesNotProveGoogleAccountIdentity() {
        val error = runCatching { testSubject.validateIdentity(EMAIL, "other@example.invalid", true) }
        assertThat((error.exceptionOrNull() as CalendarAuthFailure).error).isEqualTo(CalendarAuthError.WRONG_ACCOUNT)
    }

    @Test
    fun unverifiedEmailIsNotAccepted() {
        val error = runCatching { testSubject.validateIdentity(EMAIL, EMAIL, false) }
        assertThat((error.exceptionOrNull() as CalendarAuthFailure).error).isEqualTo(CalendarAuthError.WRONG_ACCOUNT)
    }

    @Test
    fun verifiedMatchingEmailIsAcceptedCaseInsensitively() {
        testSubject.validateIdentity(EMAIL.uppercase(), EMAIL, true)
    }

    @Test
    fun mailOnlyConsentDoesNotCountAsCalendarConsent() {
        val error = runCatching { testSubject.validateGrantedScope("https://mail.google.com/ openid email") }
        assertThat((error.exceptionOrNull() as CalendarAuthFailure).error).isEqualTo(CalendarAuthError.REAUTHORIZE)
    }

    @Test
    fun calendarConsentIsAccepted() {
        testSubject.validateGrantedScope(CalendarAuthorizationPolicy.scopes.joinToString(" "))
    }

    @Test
    fun authorizationUsesConfiguredAppIdentityAndExplicitPkce() {
        val configuration = OAuthConfiguration(
            "configured-client",
            listOf("mail-only"),
            "https://accounts.google.com/o/oauth2/v2/auth",
            "https://oauth2.googleapis.com/token",
            "tbconnect:/oauth",
        )
        val request = testSubject.authorizationRequest(configuration, EMAIL)
        assertThat(request.additionalParameters["access_type"]).isEqualTo("offline")
        assertThat(request.prompt).isEqualTo("consent")
        assertThat(request.clientId).isEqualTo("configured-client")
        assertThat(request.redirectUri.toString()).isEqualTo("tbconnect:/oauth")
        assertThat(request.loginHint).isEqualTo(EMAIL)
        assertThat(request.codeVerifier?.length?.let { it >= 43 }).isEqualTo(true)
        assertThat(request.codeVerifierChallengeMethod).isEqualTo("S256")
        assertThat(request.scope).isEqualTo(testSubject.scopes.joinToString(" "))
        assertThat(configuration.scopes).isEqualTo(listOf("mail-only"))
    }

    @Test
    fun storedRequestCannotMoveToAnotherClientOrRedirect() {
        val configuration = OAuthConfiguration(
            "calendar-client",
            emptyList(),
            "https://accounts.google.com/o/oauth2/v2/auth",
            "https://oauth2.googleapis.com/token",
            "tbconnect:/oauth",
        )
        val request = testSubject.authorizationRequest(configuration, EMAIL)
        assertThat(testSubject.matchesConfiguration(request, configuration)).isEqualTo(true)
        assertThat(testSubject.matchesConfiguration(request, configuration.copy(clientId = "other-client")))
            .isEqualTo(false)
        assertThat(testSubject.matchesConfiguration(request, configuration.copy(redirectUri = "other:/oauth")))
            .isEqualTo(false)
        assertThat(testSubject.matchesConfiguration(request, null)).isEqualTo(false)
    }

    companion object {
        private const val EMAIL = "user@example.invalid"
    }
}
