package net.thunderbird.core.calendar

/** A factory owns HTTP resources; credentials are requested for each authenticated operation. */
fun interface CalDavClientFactory {
    fun open(baseUrl: String, accessToken: suspend () -> String): CalDavSession
}

interface CalDavSession : AutoCloseable {
    suspend fun discover(): List<CalDavCalendar>
    suspend fun events(calendarUrl: String): List<CalDavObject>
    suspend fun put(resourceUrl: String, calendarData: String, previousETag: String?): String
    suspend fun delete(resourceUrl: String, previousETag: String)
}

/** Calendar and event content must never be written to logs or diagnostics. */
data class CalDavCalendar(val url: String, val displayName: String, val writable: Boolean)
data class CalDavObject(val url: String, val eTag: String, val calendarData: String)

enum class CalDavError { AUTHENTICATION, FORBIDDEN, CONFLICT, NOT_FOUND, NETWORK, INVALID_RESPONSE, UNSAFE_URL }

/** Contains fixed technical codes only; upstream exceptions may contain credentials or event contents. */
class CalDavFailure(val error: CalDavError, val httpStatus: Int? = null) : Exception(error.name)
