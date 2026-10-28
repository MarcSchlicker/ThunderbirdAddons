package net.thunderbird.core.calendar.internal

import at.bitfire.dav4jvm.ktor.DavCalendar
import at.bitfire.dav4jvm.ktor.DavResource
import at.bitfire.dav4jvm.ktor.exception.DavException
import at.bitfire.dav4jvm.ktor.responses
import at.bitfire.dav4jvm.property.caldav.CalDAV
import at.bitfire.dav4jvm.property.caldav.CalendarData
import at.bitfire.dav4jvm.property.caldav.CalendarHomeSet
import at.bitfire.dav4jvm.property.webdav.CurrentUserPrincipal
import at.bitfire.dav4jvm.property.webdav.CurrentUserPrivilegeSet
import at.bitfire.dav4jvm.property.webdav.DisplayName
import at.bitfire.dav4jvm.property.webdav.GetETag
import at.bitfire.dav4jvm.property.webdav.ResourceType
import at.bitfire.dav4jvm.property.webdav.WebDAV
import io.ktor.client.HttpClient
import io.ktor.client.engine.HttpClientEngine
import io.ktor.client.engine.cio.CIO
import io.ktor.client.plugins.HttpSend
import io.ktor.client.plugins.HttpTimeout
import io.ktor.client.plugins.plugin
import io.ktor.http.Headers
import io.ktor.http.HttpHeaders
import io.ktor.http.Url
import io.ktor.http.content.TextContent
import java.io.IOException
import java.net.URI
import java.net.URISyntaxException
import java.util.concurrent.atomic.AtomicLong
import java.util.logging.Handler
import java.util.logging.Level
import java.util.logging.LogRecord
import java.util.logging.Logger
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.toList
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import net.thunderbird.core.calendar.CalDavCalendar
import net.thunderbird.core.calendar.CalDavClientFactory
import net.thunderbird.core.calendar.CalDavError
import net.thunderbird.core.calendar.CalDavFailure
import net.thunderbird.core.calendar.CalDavObject
import net.thunderbird.core.calendar.CalDavSession
import org.xmlpull.v1.XmlPullParserException

/** Uses the maintained DAVx5 protocol library without its application, Hilt graph or user interface. */
class DefaultCalDavClientFactory : CalDavClientFactory {
    override fun open(baseUrl: String, accessToken: suspend () -> String): CalDavSession =
        Dav4jvmCalDavClient(baseUrl, accessToken, CIO.create())
}

internal class Dav4jvmCalDavClient(
    baseUrl: String,
    accessToken: suspend () -> String,
    engine: HttpClientEngine,
) : CalDavSession {
    private val mutationMutex = Mutex()

    @Volatile private var mutationTarget: Url? = null
    private val base = safeUrl(baseUrl).also { libraryLogger.level = Level.WARNING }

    // Library HTTP/XML debug output can contain PII. No parent handlers or body logging are enabled.
    private val silentLogger = Logger.getAnonymousLogger().apply {
        level = Level.OFF
        useParentHandlers = false
    }
    private val client = HttpClient(engine) {
        followRedirects = false
        install(HttpTimeout) {
            requestTimeoutMillis = REQUEST_TIMEOUT_MS
            connectTimeoutMillis = CONNECT_TIMEOUT_MS
        }
    }.apply {
        plugin(HttpSend).intercept { request ->
            val target = trustedUrl(request.url.build().toString())
            if (request.method.value in setOf("PUT", "DELETE") && target != mutationTarget) unsafe()
            val token = accessToken()
            if (token.isBlank() || token.any { it == '\r' || it == '\n' }) {
                throw CalDavFailure(CalDavError.AUTHENTICATION)
            }
            request.headers.remove(HttpHeaders.Authorization)
            request.headers.append(HttpHeaders.Authorization, "Bearer $token")
            execute(request)
        }
    }

    override suspend fun discover(): List<CalDavCalendar> = guarded {
        val initial = resource(base).propfind(0, WebDAV.CurrentUserPrincipal, CalDAV.CalendarHomeSet)
            .responses().toList().firstOrNull { it.isSuccess() } ?: invalid()
        val homes = initial[CalendarHomeSet::class.java]?.hrefs.orEmpty().ifEmpty {
            val principal = initial[CurrentUserPrincipal::class.java]?.href ?: invalid()
            resource(resolve(initial.href, principal)).propfind(0, CalDAV.CalendarHomeSet)
                .responses().toList().flatMap { it[CalendarHomeSet::class.java]?.hrefs.orEmpty() }
        }
        if (homes.isEmpty()) invalid()
        homes.flatMap { home ->
            resource(resolve(initial.href, home)).propfind(
                1,
                WebDAV.ResourceType,
                WebDAV.DisplayName,
                WebDAV.CurrentUserPrivilegeSet,
            ).responses().toList().filter {
                it.isSuccess() && it[ResourceType::class.java]?.types?.contains(CalDAV.Calendar) == true
            }.map { response ->
                val privileges = response[CurrentUserPrivilegeSet::class.java]
                CalDavCalendar(
                    trustedUrl(response.href.toString()).toString(),
                    response[DisplayName::class.java]?.displayName.orEmpty(),
                    privileges?.mayWriteContent == true,
                )
            }
        }.distinctBy { it.url }
    }

    override suspend fun events(calendarUrl: String): List<CalDavObject> = guarded {
        val collection = trustedUrl(calendarUrl)
        DavCalendar(client, collection, silentLogger).calendarQuery(
            "VEVENT",
            null,
            null,
            setOf(WebDAV.GetETag, CalDAV.CalendarData),
        ).responses().map { response ->
            if (!response.isSuccess()) invalid()
            val resourceUrl = trustedMember(collection, response.href.toString())
            val etag = strongETag(response[GetETag::class.java]?.rawETag ?: invalid())
            val data = response[CalendarData::class.java]?.iCalendar ?: invalid()
            CalDavObject(resourceUrl.toString(), etag, data)
        }.toList()
    }

    override suspend fun put(
        resourceUrl: String,
        calendarData: String,
        previousETag: String?,
    ): String = guarded {
        mutation(resourceUrl) { target ->
            val headers = Headers.build {
                if (previousETag == null) {
                    append(HttpHeaders.IfNoneMatch, "*")
                } else {
                    append(HttpHeaders.IfMatch, strongETag(previousETag))
                }
            }
            resource(target).put(TextContent(calendarData, DavCalendar.MIME_ICALENDAR_UTF8), headers) {
                // Missing ETag is not a successful synchronization checkpoint.
                strongETag(it.headers[HttpHeaders.ETag] ?: invalid())
            }
        }
    }

    override suspend fun delete(
        resourceUrl: String,
        previousETag: String,
    ) = guarded {
        mutation(resourceUrl) { target ->
            resource(target).delete(
                Headers.build {
                    append(HttpHeaders.IfMatch, strongETag(previousETag))
                },
            ) { Unit }
        }
    }

    private suspend fun <T> mutation(url: String, action: suspend (Url) -> T): T = mutationMutex.withLock {
        val target = trustedUrl(url)
        mutationTarget = target
        try {
            action(target)
        } finally {
            mutationTarget = null
        }
    }

    override fun close() = client.close()

    private fun resource(url: Url) = DavResource(client, url, silentLogger)
    private fun resolve(parent: Url, href: String) = trustedUrl(URI(parent.toString()).resolve(href).toString())

    private fun trustedUrl(value: String): Url {
        val url = safeUrl(value)
        if (url.protocol != base.protocol || url.host != base.host || url.port != base.port) {
            unsafe()
        }
        return url
    }

    private fun trustedMember(collection: Url, value: String): Url {
        val url = trustedUrl(value)
        val prefix = collection.encodedPath.trimEnd('/') + "/"
        if (!url.encodedPath.startsWith(prefix) || url.encodedPath == prefix) {
            unsafe()
        }
        return url
    }

    @Suppress("SwallowedException") // Upstream errors can contain credentials, URLs and calendar data.
    private suspend fun <T> guarded(block: suspend () -> T): T = try {
        val before = parseWarnings.get()
        val result = block()
        if (parseWarnings.get() != before) invalid()
        result
    } catch (error: CancellationException) {
        throw error
    } catch (error: CalDavFailure) {
        throw error
    } catch (error: DavException) {
        val code = when (error.statusCode) {
            401 -> CalDavError.AUTHENTICATION
            403 -> CalDavError.FORBIDDEN
            404 -> CalDavError.NOT_FOUND
            409, 412 -> CalDavError.CONFLICT
            else -> CalDavError.INVALID_RESPONSE
        }
        throw CalDavFailure(code, error.statusCode)
    } catch (_: XmlPullParserException) {
        invalid()
    } catch (_: IOException) {
        throw CalDavFailure(CalDavError.NETWORK)
    }

    companion object {
        private val parseWarnings = AtomicLong()

        // Count skipped/invalid XML warnings without retaining or forwarding any personal log text.
        private val libraryLogger = Logger.getLogger("at.bitfire.dav4jvm").apply {
            level = Level.WARNING
            useParentHandlers = false
            addHandler(object : Handler() {
                override fun publish(record: LogRecord) {
                    parseWarnings.incrementAndGet()
                }
                override fun flush() = Unit
                override fun close() = Unit
            })
        }
        private const val MIN_ETAG_CHARACTER = 0x21
        private fun unsafe(): Nothing = throw CalDavFailure(CalDavError.UNSAFE_URL)
        private const val REQUEST_TIMEOUT_MS = 20_000L
        private const val CONNECT_TIMEOUT_MS = 10_000L
        private fun invalid(): Nothing = throw CalDavFailure(CalDavError.INVALID_RESPONSE)
        private fun safeUrl(value: String): Url {
            val uri = try {
                URI(value)
            } catch (_: URISyntaxException) {
                unsafe()
            }
            if (uri.scheme != "https" || uri.host.isNullOrBlank()) unsafe()
            if (uri.rawUserInfo != null || uri.rawQuery != null || uri.rawFragment != null) {
                unsafe()
            }
            if (uri.normalize() != uri || uri.path.split('/').any { it == "." || it == ".." }) unsafe()
            return Url(value)
        }
        private fun strongETag(value: String): String {
            if (value.startsWith("W/") || value.length < 2) invalid()
            if (!value.startsWith('"') || !value.endsWith('"')) invalid()
            if (value.substring(1, value.lastIndex).any { it == '"' || it.code < MIN_ETAG_CHARACTER }) invalid()
            return value
        }
    }
}
