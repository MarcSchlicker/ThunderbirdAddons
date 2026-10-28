package net.thunderbird.feature.calendar.internal

import android.content.Context
import android.content.Intent
import android.net.Uri
import androidx.work.Constraints
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import io.ktor.client.HttpClient
import io.ktor.client.engine.cio.CIO
import io.ktor.client.plugins.HttpTimeout
import io.ktor.client.request.get
import io.ktor.client.request.header
import io.ktor.client.statement.bodyAsText
import io.ktor.http.HttpHeaders
import io.ktor.http.isSuccess
import java.net.URI
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicLong
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withTimeout
import net.openid.appauth.AuthState
import net.openid.appauth.AuthorizationException
import net.openid.appauth.AuthorizationRequest
import net.openid.appauth.AuthorizationResponse
import net.openid.appauth.AuthorizationService
import net.openid.appauth.AuthorizationServiceConfiguration
import net.openid.appauth.ResponseTypeValues
import net.openid.appauth.TokenResponse
import net.thunderbird.core.calendar.CalDavCalendar
import net.thunderbird.core.calendar.CalDavClientFactory
import net.thunderbird.core.calendar.CalDavSession
import net.thunderbird.core.common.oauth.OAuthConfigurationProvider
import net.thunderbird.feature.calendar.CalendarAuthError
import net.thunderbird.feature.calendar.CalendarAuthFailure
import net.thunderbird.feature.calendar.NativeCalendarSyncResult
import net.thunderbird.feature.calendar.NativeGoogleCalendar
import org.json.JSONObject

/** Calendar consent uses an explicitly configured calendar identity, independent from mail and DAVx5. */
class GoogleCalendarAuthorization(
    private val context: Context,
    private val configurationProvider: OAuthConfigurationProvider,
    private val clientFactory: CalDavClientFactory,
) : NativeGoogleCalendar {
    private val secrets: CalendarSecretStore = AndroidCalendarSecretStore(context)
    private val synchronization by lazy { NativeCalendarSync(this, secrets, AndroidCalendarReplica(context)) }
    private val lastScheduled = AtomicLong(-SCHEDULE_INTERVAL_MS)
    private val authService = AuthorizationService(context.applicationContext)
    private val userInfoClient = HttpClient(CIO) {
        followRedirects = false
        install(HttpTimeout) {
            requestTimeoutMillis = TIMEOUT_MS
            connectTimeoutMillis = CONNECT_TIMEOUT_MS
        }
    }

    override fun authorizationIntent(email: String): Intent {
        require(email.isNotBlank())
        val configuration = configurationProvider.getConfiguration("imap.gmail.com")
            ?: throw CalendarAuthFailure(CalendarAuthError.CONFIGURATION)
        val request = CalendarAuthorizationPolicy.authorizationRequest(configuration, email)
        secrets.write(
            "pending",
            JSONObject().put("email", email).put("state", request.state)
                .put(
                    "request",
                    request.jsonSerializeString(),
                ).put(
                    "createdAt",
                    System.currentTimeMillis(),
                ).toString(),
        )
        return authService.getAuthorizationRequestIntent(request)
    }

    // Independent rejection gates must precede storing credentials.
    @Suppress("ThrowsCount")
    override suspend fun completeAuthorization(email: String, result: Intent) {
        val pending = secrets.read("pending")?.let(::JSONObject)
            ?: throw CalendarAuthFailure(CalendarAuthError.CANCELED)
        secrets.remove("pending")
        val response = AuthorizationResponse.fromIntent(result)
            ?: throw CalendarAuthFailure(CalendarAuthError.CANCELED)
        CalendarAuthorizationPolicy.validatePending(
            email,
            pending.getString("email"),
            pending.getString("state"),
            response.state,
            pending.getLong("createdAt"),
            System.currentTimeMillis(),
        )
        val expected = AuthorizationRequest.jsonDeserialize(pending.getString("request"))
        if (!CalendarAuthorizationPolicy.matchesConfiguration(expected, calendarConfiguration)) {
            throw CalendarAuthFailure(CalendarAuthError.CANCELED)
        }
        if (expected.clientId != response.request.clientId || expected.redirectUri != response.request.redirectUri ||
            expected.codeVerifier != response.request.codeVerifier
        ) {
            throw CalendarAuthFailure(CalendarAuthError.CANCELED)
        }
        val token = exchangeCalendarAuthorizationCode(authService, response, TIMEOUT_MS)
        CalendarAuthorizationPolicy.validateGrantedScope(token.scope ?: response.scope)
        val state = AuthState(response, token, null)
        val accessToken = state.accessToken ?: throw CalendarAuthFailure(CalendarAuthError.REAUTHORIZE)
        val verified = userInfoClient.get("https://openidconnect.googleapis.com/v1/userinfo") {
            header(HttpHeaders.Authorization, "Bearer $accessToken")
        }
        if (!verified.status.isSuccess()) throw CalendarAuthFailure(CalendarAuthError.SERVICE_UNAVAILABLE)
        val identity = JSONObject(verified.bodyAsText())
        CalendarAuthorizationPolicy.validateIdentity(
            email,
            identity.optString("email"),
            identity.optBoolean("email_verified"),
        )
        secrets.write(accountKey(email), state.jsonSerializeString())
        secrets.remove("reauthorize:$email")
    }

    private val calendarConfiguration get() = configurationProvider.getConfiguration("imap.gmail.com")

    override val configurationAvailable: Boolean get() = calendarConfiguration != null

    override val accountEmails: List<String> get() {
        val preferred = secrets.read("preferred-account")
        return secrets.keys().filter { it.startsWith("account:") }.map { it.removePrefix("account:") }
            .sortedWith(compareBy<String> { it != preferred }.thenBy { it })
    }

    override val activeCalendars: Map<String, Set<String>> get() = synchronization.activeCalendars

    override fun connected(email: String): Boolean = runCatching {
        val configuration = calendarConfiguration ?: return@runCatching false
        val state = secrets.read(accountKey(email))?.let(AuthState::jsonDeserialize)
        secrets.read("reauthorize:$email") == null && state?.isAuthorized == true &&
            state.lastAuthorizationResponse?.request?.let {
                CalendarAuthorizationPolicy.matchesConfiguration(it, configuration)
            } == true
    }.getOrDefault(false)

    override suspend fun session(email: String): CalDavSession {
        if (!connected(email)) throw CalendarAuthFailure(CalendarAuthError.REAUTHORIZE)
        val base = URI("https", "apidata.googleusercontent.com", "/caldav/v2/$email/user", null).toString()
        val transport = clientFactory.open(base) { freshToken(email) }
        return object : CalDavSession by transport {
            override suspend fun discover(): List<CalDavCalendar> =
                GoogleCalendarDirectory(userInfoClient) { freshToken(email) }.calendars()
        }
    }

    override fun needsSetup(email: String): Boolean = secrets.read("calendar-change:$email") != null

    override suspend fun calendars(email: String): List<CalDavCalendar> = session(email).use { session ->
        session.discover().also {
            synchronization.acknowledgeCalendarList(email, it)
            secrets.write("preferred-account", email.lowercase())
        }
    }

    override suspend fun activate(email: String, calendar: CalDavCalendar): NativeCalendarSyncResult =
        synchronization.activate(email, calendar).also { scheduleSync() }

    override val calendarProblems get() = synchronization.calendarProblems

    override suspend fun synchronizeAll(): NativeCalendarSyncResult = synchronization.synchronizeAll()

    override fun scheduleSync(force: Boolean) {
        if (secrets.read("calendar-bindings") == null) return
        val now = android.os.SystemClock.elapsedRealtime()
        val previous = lastScheduled.get()
        if (!force && now - previous < SCHEDULE_INTERVAL_MS) return
        lastScheduled.set(now)
        val constraints = Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build()
        val manager = WorkManager.getInstance(context.applicationContext)
        ensurePeriodicSync()
        manager.enqueueUniqueWork(
            "tb-native-calendar-immediate",
            if (force) ExistingWorkPolicy.APPEND_OR_REPLACE else ExistingWorkPolicy.KEEP,
            OneTimeWorkRequestBuilder<NativeCalendarWorker>().setConstraints(constraints).build(),
        )
    }

    override fun ensurePeriodicSync() {
        if (secrets.read("calendar-bindings") == null) return
        val constraints = Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build()
        val manager = WorkManager.getInstance(context.applicationContext)
        manager.enqueueUniquePeriodicWork(
            "tb-native-calendar-periodic",
            ExistingPeriodicWorkPolicy.KEEP,
            PeriodicWorkRequestBuilder<NativeCalendarWorker>(
                PERIODIC_SYNC_MINUTES,
                TimeUnit.MINUTES,
            ).setConstraints(constraints).build(),
        )
    }

    private suspend fun freshToken(email: String): String = withTimeout(TIMEOUT_MS) {
        val state = secrets.read(accountKey(email))?.let(AuthState::jsonDeserialize)
            ?: throw CalendarAuthFailure(CalendarAuthError.REAUTHORIZE)
        suspendCancellableCoroutine { continuation ->
            state.performActionWithFreshTokens(authService) { accessToken, _, error ->
                if (!continuation.isActive) return@performActionWithFreshTokens
                if (error != null || accessToken == null) {
                    val revoked = error?.error == "invalid_grant" || (error == null && accessToken == null)
                    if (revoked) secrets.write("reauthorize:$email", "true")
                    continuation.resumeWithException(
                        CalendarAuthFailure(
                            if (revoked) CalendarAuthError.REAUTHORIZE else CalendarAuthError.SERVICE_UNAVAILABLE,
                        ),
                    )
                } else {
                    runCatching { secrets.write(accountKey(email), state.jsonSerializeString()) }
                        .onSuccess { continuation.resume(accessToken) }
                        .onFailure {
                            continuation.resumeWithException(CalendarAuthFailure(CalendarAuthError.SERVICE_UNAVAILABLE))
                        }
                }
            }
        }
    }

    companion object {
        private const val PERIODIC_SYNC_MINUTES = 15L
        private const val SCHEDULE_INTERVAL_MS = 90_000L
        private const val TIMEOUT_MS = 20_000L
        private const val CONNECT_TIMEOUT_MS = 10_000L
        private fun accountKey(email: String) = "account:" + email.lowercase()
    }
}

private suspend fun exchangeCalendarAuthorizationCode(
    authService: AuthorizationService,
    response: AuthorizationResponse,
    timeoutMillis: Long,
): TokenResponse = withTimeout(timeoutMillis) {
    suspendCancellableCoroutine { continuation ->
        authService.performTokenRequest(response.createTokenExchangeRequest()) {
                token,
                error: AuthorizationException?,
            ->
            if (!continuation.isActive) return@performTokenRequest
            if (error != null ||
                token == null
            ) {
                continuation.resumeWithException(CalendarAuthFailure(CalendarAuthError.REAUTHORIZE))
            } else {
                continuation.resume(token)
            }
        }
    }
}
