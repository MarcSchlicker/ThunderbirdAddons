package net.thunderbird.core.calendar.internal

import assertk.assertThat
import assertk.assertions.isEqualTo
import io.ktor.client.engine.mock.MockEngine
import io.ktor.client.engine.mock.respond
import io.ktor.http.HttpHeaders
import io.ktor.http.HttpStatusCode
import io.ktor.http.headersOf
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.test.runTest
import net.thunderbird.core.calendar.CalDavError
import net.thunderbird.core.calendar.CalDavFailure
import org.junit.Test

class Dav4jvmCalDavClientTest {
    @Test
    fun discoverFollowsPrincipalAndReturnsOnlyCalendarsWithExplicitWritePrivileges() = runTest {
        var requests = 0
        val engine = MockEngine { request ->
            assertThat(request.method.value).isEqualTo("PROPFIND")
            val content = when (requests++) {
                0 -> response(
                    "/dav/",
                    "<d:current-user-principal><d:href>/principal/</d:href></d:current-user-principal>",
                )

                1 -> response(
                    "/principal/",
                    "<c:calendar-home-set><d:href>/calendars/</d:href></c:calendar-home-set>",
                )

                else -> response(
                    "/calendars/work/",
                    """
                    <d:resourcetype><d:collection/><c:calendar/></d:resourcetype>
                    <d:displayname>Work</d:displayname>
                    <d:current-user-privilege-set>
                        <d:privilege><d:write-content/></d:privilege>
                    </d:current-user-privilege-set>
                    """.trimIndent(),
                ) + response("/calendars/readonly/", "<d:resourcetype><c:calendar/></d:resourcetype>")
            }
            respond(xml(content), HttpStatusCode.MultiStatus, headersOf(HttpHeaders.ContentType, "application/xml"))
        }
        val testSubject = Dav4jvmCalDavClient(BASE, { "test-token" }, engine)
        testSubject.use {
            val result = it.discover()
            assertThat(result.size).isEqualTo(2)
            assertThat(result.first().writable).isEqualTo(true)
            assertThat(result.last().writable).isEqualTo(false)
            assertThat(requests).isEqualTo(3)
        }
    }

    @Test
    fun calendarQueryUsesDav4jvmParserAndPreservesOpaqueETagAndCalendarData() = runTest {
        val engine = MockEngine { request ->
            assertThat(request.method.value).isEqualTo("REPORT")
            respond(
                xml(
                    response(
                        "/calendars/work/a.ics",
                        "<d:getetag>\"v1\"</d:getetag>" + "<c:calendar-data>BEGIN:VCALENDAR</c:calendar-data>",
                    ),
                ),
                HttpStatusCode.MultiStatus,
                headersOf(HttpHeaders.ContentType, "application/xml"),
            )
        }
        val testSubject = Dav4jvmCalDavClient(BASE, { "test-token" }, engine)
        testSubject.use {
            val item = it.events(CALENDAR).single()
            assertThat(item.eTag).isEqualTo("\"v1\"")
            assertThat(item.calendarData).isEqualTo("BEGIN:VCALENDAR")
        }
    }

    @Test
    fun createUsesIfNoneMatchToPreventOverwritingAnExistingResource() = runTest {
        val engine = MockEngine { request ->
            assertThat(request.headers[HttpHeaders.IfNoneMatch]).isEqualTo("*")
            assertThat(request.headers[HttpHeaders.IfMatch]).isEqualTo(null)
            assertThat(request.headers[HttpHeaders.Authorization]).isEqualTo("Bearer test-token")
            respond("", HttpStatusCode.Created, headersOf(HttpHeaders.ETag, "\"created\""))
        }
        val testSubject = Dav4jvmCalDavClient(BASE, { "test-token" }, engine)
        testSubject.use { assertThat(it.put(EVENT, "BEGIN:VCALENDAR", null)).isEqualTo("\"created\"") }
    }

    @Test
    fun updateRejectsConcurrentServerChangeWithoutLeakingServerContents() = runTest {
        val engine = MockEngine { request ->
            assertThat(request.headers[HttpHeaders.IfMatch]).isEqualTo("\"v1\"")
            respond("SECRET_SENTINEL", HttpStatusCode.PreconditionFailed)
        }
        val testSubject = Dav4jvmCalDavClient(BASE, { "test-token" }, engine)
        testSubject.use {
            val failure = runCatching {
                it.put(
                    EVENT,
                    "BEGIN:VCALENDAR",
                    "\"v1\"",
                )
            }.exceptionOrNull() as CalDavFailure
            assertThat(failure.error).isEqualTo(CalDavError.CONFLICT)
            assertThat(failure.httpStatus).isEqualTo(412)
            assertThat(failure.message).isEqualTo("CONFLICT")
            assertThat(failure.cause).isEqualTo(null)
        }
    }

    @Test
    fun deleteRequiresTheKnownETag() = runTest {
        val engine = MockEngine { request ->
            assertThat(request.method.value).isEqualTo("DELETE")
            assertThat(request.headers[HttpHeaders.IfMatch]).isEqualTo("\"v1\"")
            respond("", HttpStatusCode.NoContent)
        }
        val testSubject = Dav4jvmCalDavClient(BASE, { "test-token" }, engine)
        testSubject.use { it.delete(EVENT, "\"v1\"") }
    }

    @Test
    fun missingETagCannotBeCommittedAsSuccessfulUpload() = runTest {
        val engine = MockEngine { respond("", HttpStatusCode.Created) }
        val testSubject = Dav4jvmCalDavClient(BASE, { "test-token" }, engine)
        testSubject.use {
            assertThat((runCatching { it.put(EVENT, "data", null) }.exceptionOrNull() as CalDavFailure).error)
                .isEqualTo(CalDavError.INVALID_RESPONSE)
        }
    }

    @Test
    fun foreignOriginRedirectIsBlockedBeforeCredentialsOrRequestReachIt() = runTest {
        var calls = 0
        val engine = MockEngine {
            calls++
            respond(
                "",
                HttpStatusCode.TemporaryRedirect,
                headersOf(HttpHeaders.Location, "https://evil.example.invalid/event.ics"),
            )
        }
        val testSubject = Dav4jvmCalDavClient(BASE, { "test-token" }, engine)
        testSubject.use {
            assertThat((runCatching { it.delete(EVENT, "\"v1\"") }.exceptionOrNull() as CalDavFailure).error)
                .isEqualTo(CalDavError.UNSAFE_URL)
            assertThat(calls).isEqualTo(1)
        }
    }

    @Test
    fun unsafeBaseUrlsNeverSendAnyRequest() {
        for (url in listOf(
            "http://cloud.example.invalid/",
            "https://user:pass@cloud.example.invalid/",
            "https://cloud.example.invalid/?token=secret",
        )) {
            val failure = runCatching {
                Dav4jvmCalDavClient(url, { "secret" }, MockEngine { error("No request expected") })
            }
            assertThat((failure.exceptionOrNull() as CalDavFailure).error).isEqualTo(CalDavError.UNSAFE_URL)
        }
    }

    @Test
    fun weakETagNeverTriggersAnUnconditionalOverwrite() = runTest {
        val testSubject = Dav4jvmCalDavClient(BASE, { "test-token" }, MockEngine { error("No request expected") })
        testSubject.use {
            assertThat((runCatching { it.put(EVENT, "data", "W/\"v1\"") }.exceptionOrNull() as CalDavFailure).error)
                .isEqualTo(CalDavError.INVALID_RESPONSE)
        }
    }

    @Test
    fun authenticationFailureIsMappedToFixedCode() = runTest {
        val testSubject = Dav4jvmCalDavClient(
            BASE,
            { "test-token" },
            MockEngine {
                respond("PRIVATE_RESPONSE", HttpStatusCode.Unauthorized)
            },
        )
        testSubject.use {
            assertThat((runCatching { it.events(CALENDAR) }.exceptionOrNull() as CalDavFailure).error)
                .isEqualTo(CalDavError.AUTHENTICATION)
        }
    }

    @Test
    fun cancellationIsPropagatedInsteadOfBeingReportedAsServerFailure() = runTest {
        val testSubject = Dav4jvmCalDavClient(
            BASE,
            { throw CancellationException("cancel") },
            MockEngine { error("No request expected") },
        )
        testSubject.use {
            assertThat(runCatching { it.events(CALENDAR) }.exceptionOrNull() is CancellationException).isEqualTo(true)
        }
    }

    @Test
    fun sameOriginMutationRedirectCannotWriteAnotherCalendar() = runTest {
        var calls = 0
        val engine = MockEngine {
            calls++
            respond("", HttpStatusCode.TemporaryRedirect, headersOf(HttpHeaders.Location, "/other-calendar/a.ics"))
        }
        val testSubject = Dav4jvmCalDavClient(BASE, { "test-token" }, engine)
        testSubject.use {
            val failure = runCatching { it.delete(EVENT, "\"v1\"") }.exceptionOrNull() as CalDavFailure
            assertThat(failure.error).isEqualTo(CalDavError.UNSAFE_URL)
            assertThat(calls).isEqualTo(1)
        }
    }

    @Test
    fun invalidHrefCannotBecomeAnAuthoritativeEmptyCalendarListing() = runTest {
        val engine = MockEngine {
            respond(
                xml(response("http://[invalid", "<d:getetag>\"v1\"</d:getetag>")),
                HttpStatusCode.MultiStatus,
                headersOf(HttpHeaders.ContentType, "application/xml"),
            )
        }
        val testSubject = Dav4jvmCalDavClient(BASE, { "test-token" }, engine)
        testSubject.use {
            assertThat((runCatching { it.events(CALENDAR) }.exceptionOrNull() as CalDavFailure).error)
                .isEqualTo(CalDavError.UNSAFE_URL)
        }
    }

    companion object {
        private const val BASE = "https://cloud.example.invalid/dav/"
        private const val CALENDAR = "https://cloud.example.invalid/calendars/work/"
        private const val EVENT = "https://cloud.example.invalid/calendars/work/a.ics"
        private fun xml(body: String) = """
            <?xml version="1.0"?>
            <d:multistatus xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">$body</d:multistatus>
        """.trimIndent().trim()
        private fun response(href: String, props: String) = """
            <d:response><d:href>$href</d:href><d:propstat><d:prop>$props</d:prop>
            <d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response>
        """.trimIndent()
    }
}
