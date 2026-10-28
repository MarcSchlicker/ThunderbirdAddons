package net.thunderbird.feature.calendar.internal

import assertk.assertThat
import assertk.assertions.isEqualTo
import io.ktor.client.HttpClient
import io.ktor.client.engine.mock.MockEngine
import io.ktor.client.engine.mock.respond
import io.ktor.http.HttpStatusCode
import kotlinx.coroutines.test.runTest
import net.thunderbird.core.android.testing.RobolectricTest
import net.thunderbird.feature.calendar.CalendarAuthError
import net.thunderbird.feature.calendar.CalendarAuthFailure
import org.junit.Test

class GoogleCalendarDirectoryTest : RobolectricTest() {
    @Test
    fun googleRolesAllowEditingWithoutWebDavAclAndRetainReadOnlySharing() = runTest {
        val engine = MockEngine { request ->
            assertThat(request.url.host).isEqualTo("www.googleapis.com")
            assertThat(request.headers["Authorization"]).isEqualTo("Bearer test-token")
            respond(
                """{"items":[
                {"id":"owner@example.invalid","summary":"Own","accessRole":"owner"},
                {"id":"shared@example.invalid","summary":"Shared","accessRole":"writer"},
                {"id":"read@example.invalid","summary":"Read","accessRole":"reader"},
                {"id":"busy@example.invalid","accessRole":"freeBusyReader"}
            ]}""",
            )
        }
        HttpClient(engine).use { client ->
            val testSubject = GoogleCalendarDirectory(client) { "test-token" }
            val calendars = testSubject.calendars()
            assertThat(calendars.map { it.writable }).isEqualTo(listOf(true, true, false))
            assertThat(calendars.first().url)
                .isEqualTo("https://apidata.googleusercontent.com/caldav/v2/owner@example.invalid/events")
        }
    }

    @Test
    fun allPagesAreRequiredBeforeTheCalendarDirectoryIsReturned() = runTest {
        var calls = 0
        val engine = MockEngine { request ->
            calls++
            if (calls == 1) {
                respond("""{"items":[],"nextPageToken":"next page"}""")
            } else {
                assertThat(request.url.parameters["pageToken"]).isEqualTo("next page")
                respond("""{"items":[{"id":"later@example.invalid","accessRole":"writer"}]}""")
            }
        }
        HttpClient(engine).use { client ->
            assertThat(GoogleCalendarDirectory(client) { "test-token" }.calendars().single().writable).isEqualTo(true)
        }
        assertThat(calls).isEqualTo(2)
    }

    @Test
    fun unknownForbiddenReasonDoesNotClaimTheApiIsDisabled() = runTest {
        val engine = MockEngine { respond("private server body", HttpStatusCode.Forbidden) }
        HttpClient(engine).use { client ->
            val error = runCatching { GoogleCalendarDirectory(client) { "test-token" }.calendars() }.exceptionOrNull()
            assertThat((error as CalendarAuthFailure).error).isEqualTo(CalendarAuthError.ACCESS_DENIED)
            assertThat(error.message).isEqualTo("ACCESS_DENIED")
        }
    }

    @Test
    fun googleReasonsAreMappedWithoutExposingServerMessages() = runTest {
        val cases = mapOf(
            "accessNotConfigured" to CalendarAuthError.API_DISABLED,
            "SERVICE_DISABLED" to CalendarAuthError.API_DISABLED,
            "insufficientPermissions" to CalendarAuthError.PERMISSION_REQUIRED,
            "ACCESS_TOKEN_SCOPE_INSUFFICIENT" to CalendarAuthError.PERMISSION_REQUIRED,
            "rateLimitExceeded" to CalendarAuthError.RATE_LIMITED,
            "userRateLimitExceeded" to CalendarAuthError.RATE_LIMITED,
            "quotaExceeded" to CalendarAuthError.RATE_LIMITED,
            "private@example.invalid" to CalendarAuthError.ACCESS_DENIED,
        )
        for ((reason, expected) in cases) {
            val engine = MockEngine {
                respond(
                    """{"error":{"message":"private server text","errors":[{"reason":"$reason"}],
                    "details":[{"@type":"type.googleapis.com/google.rpc.ErrorInfo","reason":"$reason"}]}}""",
                    HttpStatusCode.Forbidden,
                )
            }
            HttpClient(engine).use { client ->
                val error = runCatching { GoogleCalendarDirectory(client) { "test-token" }.calendars() }
                    .exceptionOrNull() as CalendarAuthFailure
                assertThat(error.error).isEqualTo(expected)
                assertThat(error.message).isEqualTo(expected.name)
                assertThat(error.cause).isEqualTo(null)
            }
        }
    }

    @Test
    fun tooManyRequestsDoesNotAskForAnotherLogin() = runTest {
        val engine = MockEngine { respond("private server body", HttpStatusCode.TooManyRequests) }
        HttpClient(engine).use { client ->
            val error = runCatching { GoogleCalendarDirectory(client) { "test-token" }.calendars() }
                .exceptionOrNull() as CalendarAuthFailure
            assertThat(error.error).isEqualTo(CalendarAuthError.RATE_LIMITED)
        }
    }

    @Test
    fun malformedOrOversizedForbiddenRepliesRemainGenericAndPrivate() = runTest {
        for (body in listOf("private body", "x".repeat(16_385))) {
            val engine = MockEngine { respond(body, HttpStatusCode.Forbidden) }
            HttpClient(engine).use { client ->
                val error = runCatching { GoogleCalendarDirectory(client) { "test-token" }.calendars() }
                    .exceptionOrNull() as CalendarAuthFailure
                assertThat(error.error).isEqualTo(CalendarAuthError.ACCESS_DENIED)
                assertThat(error.message).isEqualTo("ACCESS_DENIED")
            }
        }
    }

    @Test
    fun revokedGoogleGrantRequiresAuthorizationAgain() = runTest {
        val engine = MockEngine { respond("private server body", HttpStatusCode.Unauthorized) }
        HttpClient(engine).use { client ->
            val error = runCatching { GoogleCalendarDirectory(client) { "test-token" }.calendars() }.exceptionOrNull()
            assertThat((error as CalendarAuthFailure).error).isEqualTo(CalendarAuthError.REAUTHORIZE)
        }
    }
}
