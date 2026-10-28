package net.thunderbird.feature.calendar.internal

import kotlinx.coroutines.CancellationException
import net.thunderbird.core.calendar.CalDavFailure
import net.thunderbird.feature.calendar.CalendarAuthFailure

internal enum class CalendarActivationStage { SESSION, DISCOVERY, DOWNLOAD, PARSE, DEVICE_CALENDAR, DEVICE_EVENTS }

/** Fixed diagnostic codes only. Never retain server bodies, event contents, URLs or upstream causes. */
internal class CalendarActivationFailure(val code: String) : Exception(code)

internal suspend fun <T> activationStep(stage: CalendarActivationStage, action: suspend () -> T): T = try {
    action()
} catch (error: CancellationException) {
    throw error
} catch (error: CalendarAuthFailure) {
    throw error
} catch (error: CalDavFailure) {
    val status = error.httpStatus?.takeIf { it in 100..599 }?.let { "_$it" }.orEmpty()
    throw CalendarActivationFailure("${stage.name}_${error.error.name}$status")
} catch (_: SecurityException) {
    throw CalendarActivationFailure("${stage.name}_PERMISSION")
} catch (_: Exception) {
    throw CalendarActivationFailure("${stage.name}_FAILED")
}
