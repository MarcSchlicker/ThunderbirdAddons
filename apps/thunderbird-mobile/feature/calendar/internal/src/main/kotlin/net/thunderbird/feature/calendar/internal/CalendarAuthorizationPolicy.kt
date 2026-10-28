package net.thunderbird.feature.calendar.internal

import android.net.Uri
import net.openid.appauth.AuthorizationRequest
import net.openid.appauth.AuthorizationServiceConfiguration
import net.openid.appauth.CodeVerifierUtil
import net.openid.appauth.ResponseTypeValues
import net.thunderbird.core.common.oauth.OAuthConfiguration
import net.thunderbird.feature.calendar.CalendarAuthError
import net.thunderbird.feature.calendar.CalendarAuthFailure

internal object CalendarAuthorizationPolicy {
    const val CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar"
    val scopes = listOf(CALENDAR_SCOPE, "openid", "email")
    private const val PENDING_LIFETIME_MS = 600_000L

    fun authorizationRequest(configuration: OAuthConfiguration, email: String): AuthorizationRequest =
        AuthorizationRequest.Builder(
            AuthorizationServiceConfiguration(
                Uri.parse(configuration.authorizationEndpoint),
                Uri.parse(configuration.tokenEndpoint),
            ),
            configuration.clientId,
            ResponseTypeValues.CODE,
            Uri.parse(configuration.redirectUri),
        ).setScopes(scopes).setLoginHint(email)
            .setAdditionalParameters(mapOf("access_type" to "offline", "include_granted_scopes" to "true"))
            .setPrompt("consent")
            .setCodeVerifier(CodeVerifierUtil.generateRandomCodeVerifier()).build()

    fun matchesConfiguration(request: AuthorizationRequest, configuration: OAuthConfiguration?): Boolean =
        configuration != null && request.clientId == configuration.clientId &&
            request.redirectUri.toString() == configuration.redirectUri

    fun validatePending(
        requestedEmail: String,
        pendingEmail: String,
        expectedState: String,
        returnedState: String?,
        createdAt: Long,
        now: Long,
    ) {
        if (expectedState.isBlank()) throw CalendarAuthFailure(CalendarAuthError.CANCELED)
        if (requestedEmail != pendingEmail || expectedState != returnedState ||
            now - createdAt !in 0..PENDING_LIFETIME_MS
        ) {
            throw CalendarAuthFailure(CalendarAuthError.CANCELED)
        }
    }

    fun validateIdentity(requestedEmail: String, returnedEmail: String, verified: Boolean) {
        if (!verified || requestedEmail.isBlank() || !requestedEmail.equals(returnedEmail, ignoreCase = true)) {
            throw CalendarAuthFailure(CalendarAuthError.WRONG_ACCOUNT)
        }
    }

    fun validateGrantedScope(grantedScope: String?) {
        if (grantedScope != null && CALENDAR_SCOPE !in grantedScope.split(' ')) {
            throw CalendarAuthFailure(CalendarAuthError.REAUTHORIZE)
        }
    }
}
