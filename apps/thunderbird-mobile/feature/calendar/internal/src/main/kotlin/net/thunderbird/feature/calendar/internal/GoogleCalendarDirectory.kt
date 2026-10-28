package net.thunderbird.feature.calendar.internal

import io.ktor.client.HttpClient
import io.ktor.client.request.get
import io.ktor.client.request.header
import io.ktor.client.statement.bodyAsText
import io.ktor.http.HttpHeaders
import io.ktor.http.HttpStatusCode
import java.net.URI
import net.thunderbird.core.calendar.CalDavCalendar
import net.thunderbird.feature.calendar.CalendarAuthError
import net.thunderbird.feature.calendar.CalendarAuthFailure
import org.json.JSONObject

/** Google does not expose WebDAV ACL. CalendarList accessRole is the authoritative permission source. */
internal class GoogleCalendarDirectory(
    private val client: HttpClient,
    private val accessToken: suspend () -> String,
) {
    suspend fun calendars(): List<CalDavCalendar> {
        val result = linkedMapOf<String, CalDavCalendar>()
        val pages = mutableSetOf<String>()
        var page = ""
        do {
            check(pages.add(page) && pages.size <= MAX_PAGES)
            val response = client.get(ENDPOINT) {
                header(HttpHeaders.Authorization, "Bearer ${accessToken()}")
                url.parameters.append("maxResults", "250")
                if (page.isNotEmpty()) url.parameters.append("pageToken", page)
            }
            val raw = response.bodyAsText()
            requireSuccess(response.status, raw)
            check(raw.length <= MAX_RESPONSE_CHARS)
            val data = JSONObject(raw)
            val items = data.getJSONArray("items")
            for (index in 0 until items.length()) {
                val item = items.getJSONObject(index)
                val role = item.optString("accessRole")
                if (!item.optBoolean("deleted") && role in READABLE_ROLES) {
                    val id = item.getString("id")
                    val url = calendarUrl(id)
                    result[url] = CalDavCalendar(
                        url,
                        item.optString("summaryOverride").ifBlank {
                            item.optString("summary").ifBlank { id }
                        },
                        role in WRITABLE_ROLES,
                    )
                }
            }
            page = data.optString("nextPageToken")
        } while (page.isNotBlank())
        return result.values.toList()
    }

    private fun requireSuccess(status: HttpStatusCode, body: String) {
        val error = when (status) {
            HttpStatusCode.OK -> null
            HttpStatusCode.Unauthorized -> CalendarAuthError.REAUTHORIZE
            HttpStatusCode.Forbidden -> forbiddenError(body)
            HttpStatusCode.TooManyRequests -> CalendarAuthError.RATE_LIMITED
            else -> CalendarAuthError.SERVICE_UNAVAILABLE
        }
        if (error != null) throw CalendarAuthFailure(error)
    }

    /** Only fixed reason codes leave this function. Never retain messages, metadata, or response causes. */
    private fun forbiddenError(body: String): CalendarAuthError {
        if (body.length > MAX_ERROR_CHARS) return CalendarAuthError.ACCESS_DENIED
        val reasons = runCatching {
            val error = JSONObject(body).getJSONObject("error")
            buildSet {
                for (key in listOf("errors", "details")) {
                    val items = error.optJSONArray(key) ?: continue
                    for (index in 0 until items.length()) {
                        add(items.optJSONObject(index)?.optString("reason").orEmpty())
                    }
                }
            }
        }.getOrDefault(emptySet())
        return when {
            reasons.any { it in API_DISABLED_REASONS } -> CalendarAuthError.API_DISABLED
            reasons.any { it in PERMISSION_REASONS } -> CalendarAuthError.PERMISSION_REQUIRED
            reasons.any { it in LIMIT_REASONS } -> CalendarAuthError.RATE_LIMITED
            else -> CalendarAuthError.ACCESS_DENIED
        }
    }

    private fun calendarUrl(id: String): String {
        require(id.isNotBlank() && id !in listOf(".", ".."))
        require(id.none { it == '/' || it == '\\' || it.isISOControl() })
        return URI("https", "apidata.googleusercontent.com", "/caldav/v2/$id/events", null).toString()
    }

    companion object {
        private const val ENDPOINT = "https://www.googleapis.com/calendar/v3/users/me/calendarList"
        private const val MAX_PAGES = 100
        private const val MAX_ERROR_CHARS = 16_384
        private val API_DISABLED_REASONS = setOf("accessNotConfigured", "SERVICE_DISABLED")
        private val PERMISSION_REASONS = setOf("insufficientPermissions", "ACCESS_TOKEN_SCOPE_INSUFFICIENT")
        private val LIMIT_REASONS =
            setOf("rateLimitExceeded", "userRateLimitExceeded", "quotaExceeded", "dailyLimitExceeded")
        private const val MAX_RESPONSE_CHARS = 2_000_000
        private val WRITABLE_ROLES = setOf("owner", "writer", "writerWithoutPrivateAccess")
        private val READABLE_ROLES = WRITABLE_ROLES + "reader"
    }
}
