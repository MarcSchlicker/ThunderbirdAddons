package com.fsck.k9.ui.zeitklar

import android.content.Context
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import android.net.Uri
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import android.util.Log
import org.json.JSONArray
import org.json.JSONObject
import java.io.ByteArrayOutputStream
import java.io.BufferedReader
import java.io.OutputStreamWriter
import java.net.HttpURLConnection
import java.net.Inet4Address
import java.net.InetAddress
import java.net.NetworkInterface
import java.net.URLEncoder
import java.net.URL
import java.security.KeyStore
import java.security.MessageDigest
import java.time.Instant
import java.util.UUID
import java.util.concurrent.ExecutorCompletionService
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

data class PlannerTask(
    val id: String,
    val text: String,
    val emailAddress: String,
    val dueDate: String?,
    val order: Int,
    val done: Boolean,
    val createdAt: String,
    val updatedAt: String,
    val notes: String = "",
) {
    fun toJson(): JSONObject = JSONObject()
        .put("id", id)
        .put("text", text)
        .put("notes", notes)
        .put("emailAddress", emailAddress)
        .put("dueDate", dueDate)
        .put("order", order)
        .put("done", done)
        .put("createdAt", createdAt)
        .put("updatedAt", updatedAt)

    companion object {
        fun fromJson(source: JSONObject, fallbackOrder: Int): PlannerTask? {
            val id = source.optString("id").trim().takeIf { it.isNotEmpty() } ?: return null
            val text = source.optString("text", source.optString("title")).trim().takeIf { it.isNotEmpty() } ?: return null
            return PlannerTask(
                id = id.take(180),
                text = text.take(500),
                notes = source.optString("notes").take(10000),
                emailAddress = source.optString("emailAddress").trim().take(320),
                dueDate = source.optString("dueDate").takeIf { it.matches(Regex("\\d{4}-\\d{2}-\\d{2}")) },
                order = source.optInt("order", fallbackOrder),
                done = source.optBoolean("done", false),
                createdAt = source.optString("createdAt", Instant.EPOCH.toString()),
                updatedAt = source.optString("updatedAt", source.optString("createdAt", Instant.EPOCH.toString())),
            )
        }
    }
}

data class PlannerAppointment(
    val id: String,
    val title: String,
    val date: String,
    val startTime: String,
    val endTime: String,
    val createdAt: String,
    val updatedAt: String,
) {
    fun toJson(): JSONObject = JSONObject()
        .put("id", id)
        .put("title", title)
        .put("date", date)
        .put("startTime", startTime)
        .put("endTime", endTime)
        .put("createdAt", createdAt)
        .put("updatedAt", updatedAt)

    companion object {
        fun fromJson(source: JSONObject): PlannerAppointment? {
            val id = source.optString("id").trim().takeIf { it.isNotEmpty() } ?: return null
            val title = source.optString("title").trim().takeIf { it.isNotEmpty() } ?: return null
            val date = source.optString("date").takeIf { it.matches(Regex("\\d{4}-\\d{2}-\\d{2}")) } ?: return null
            if (runCatching { java.time.LocalDate.parse(date) }.isFailure) return null
            val startTime = source.optString("startTime", "09:00").takeIf { it.matches(Regex("(?:[01]\\d|2[0-3]):[0-5]\\d")) }
                ?: "09:00"
            val endTime = source.optString("endTime", startTime).takeIf { it.matches(Regex("(?:[01]\\d|2[0-3]):[0-5]\\d")) }
                ?: startTime
            return PlannerAppointment(
                id = id.take(180),
                title = title.take(500),
                date = date,
                startTime = startTime,
                endTime = endTime,
                createdAt = source.optString("createdAt", Instant.EPOCH.toString()),
                updatedAt = source.optString("updatedAt", source.optString("createdAt", Instant.EPOCH.toString())),
            )
        }
    }
}

data class PlannerMailReference(
    val id: String,
    val subject: String,
    val sender: String,
    val dueDate: String?,
    val done: Boolean,
) {
    fun displayReference() = PlannerDesktopReference("✉ $subject", sender)
}

data class PlannerDesktopReference(
    val title: String,
    val detail: String,
)

data class PlannerConnection(
    val id: String,
    val name: String,
    val endpoint: String,
    /** Additional private LAN addresses encoded by the Hub in the pairing QR code. */
    val fallbackEndpoints: List<String> = emptyList(),
    val token: String?,
    val mode: Mode,
    val lastMobileSyncAt: String? = null,
    val lastDesktopSyncAt: String? = null,
    val lastAttemptAt: String? = null,
    val lastError: String? = null,
    val workspaceId: String? = null,
    /** Only used by the Nextcloud WebDAV transport; encrypted with the connection state. */
    val username: String? = null,
    /** Human-readable app folder directly in the Nextcloud file root. */
    val appFolder: String? = null,
) {
    enum class Mode { MODULE_BRIDGE, LEGACY_DAILY_PLANNER, NEXTCLOUD }

    fun toJson(): JSONObject = JSONObject()
        .put("id", id)
        .put("name", name)
        .put("endpoint", endpoint)
        .put("fallbackEndpoints", JSONArray().apply { fallbackEndpoints.forEach(::put) })
        .put("token", token)
        .put("mode", mode.name)
        .put("lastMobileSyncAt", lastMobileSyncAt)
        .put("lastDesktopSyncAt", lastDesktopSyncAt)
        .put("lastAttemptAt", lastAttemptAt)
        .put("lastError", lastError)
        .put("workspaceId", workspaceId)
        .put("username", username)
        .put("appFolder", appFolder)

    companion object {
        fun fromJson(source: JSONObject): PlannerConnection? {
            val id = source.optString("id").trim().takeIf { it.isNotEmpty() } ?: return null
            val endpoint = source.optString("endpoint").trim().takeIf { it.isNotEmpty() } ?: return null
            val mode = runCatching { Mode.valueOf(source.optString("mode")) }.getOrNull() ?: return null
            return PlannerConnection(
                id = id,
                name = source.optString("name", "TB-Connect Desktop").take(120),
                endpoint = endpoint,
                fallbackEndpoints = buildList {
                    val alternatives = source.optJSONArray("fallbackEndpoints") ?: JSONArray()
                    for (index in 0 until alternatives.length()) {
                        val alternative = alternatives.optString(index).trim()
                        if (alternative.isNotEmpty() && alternative != endpoint) add(alternative)
                    }
                }.distinct(),
                token = source.optString("token").takeIf { it.isNotEmpty() },
                mode = mode,
                lastMobileSyncAt = source.optString("lastMobileSyncAt").takeIf { it.isNotEmpty() },
                lastDesktopSyncAt = source.optString("lastDesktopSyncAt").takeIf { it.isNotEmpty() },
                lastAttemptAt = source.optString("lastAttemptAt").takeIf { it.isNotEmpty() },
                lastError = source.optString("lastError").takeIf { it.isNotEmpty() },
                workspaceId = source.optString("workspaceId").takeIf { it.isNotEmpty() },
                username = source.optString("username").takeIf { it.isNotEmpty() },
                appFolder = source.optString("appFolder").takeIf { it.isNotEmpty() },
            )
        }
    }
}

/** A declarative module package fetched after a trusted hub tells the app about it. */
data class MobileModuleRecord(
    val id: String,
    val name: String,
    val description: String,
    val entry: String,
    val packageUrl: String? = null,
    val packageSha256: String? = null,
    val inlinePackage: String? = null,
    val packagePayload: String? = null,
    val packageStatus: String = "Download verfügbar",
    val installedAt: String? = null,
) {
    fun toJson(): JSONObject = JSONObject()
        .put("id", id)
        .put("name", name)
        .put("description", description)
        .put("entry", entry)
        .put("packageUrl", packageUrl)
        .put("packageSha256", packageSha256)
        .put("inlinePackage", inlinePackage)
        .put("packagePayload", packagePayload)
        .put("packageStatus", packageStatus)
        .put("installedAt", installedAt)

    companion object {
        fun fromJson(source: JSONObject): MobileModuleRecord? {
            val id = source.optString("id").trim().takeIf { it.isNotEmpty() } ?: return null
            val entry = source.optString("entry").trim().takeIf { it.isNotEmpty() } ?: return null
            val storedStatus = source.optString("packageStatus", "Download verfügbar").take(120)
            return MobileModuleRecord(
                id = id.take(120),
                name = source.optString("name", id).take(120),
                description = source.optString("description").take(500),
                entry = entry.take(80),
                packageUrl = source.optString("packageUrl").takeIf { it.isNotBlank() },
                packageSha256 = source.optString("packageSha256").takeIf { it.isNotBlank() },
                inlinePackage = source.optString("inlinePackage").takeIf { runCatching { JSONObject(it) }.isSuccess },
                packagePayload = source.optString("packagePayload").takeIf { runCatching { JSONObject(it) }.isSuccess },
                // 2.0.0 wrote this status in lower case. Keep existing module
                // installations usable after updating the app.
                packageStatus = if (storedStatus.equals("installiert", ignoreCase = true)) "Installiert" else storedStatus,
                installedAt = source.optString("installedAt").takeIf { it.isNotEmpty() },
            )
        }
    }
}

data class PlannerMobileState(
    val clientId: String,
    val payload: String,
    val connections: List<PlannerConnection>,
    val modulePayloads: Map<String, String> = emptyMap(),
    val mobileModules: List<MobileModuleRecord> = emptyList(),
) {
    fun withConnection(connection: PlannerConnection): PlannerMobileState = copy(
        // A new QR code can contain a different DHCP address for the same
        // desktop.  workspaceId is stable, so use it to replace the old record
        // instead of keeping one reachable and one permanently red entry.
        connections = (connections.filter {
            it.id != connection.id &&
                (connection.workspaceId.isNullOrBlank() || it.workspaceId != connection.workspaceId)
        } + connection).sortedBy { it.name.lowercase() },
    )

    fun withoutConnection(connectionId: String): PlannerMobileState = copy(
        connections = connections.filterNot { it.id == connectionId },
    )

    companion object {
        fun empty(): PlannerMobileState = PlannerMobileState(
            clientId = "mobile-${UUID.randomUUID()}",
            payload = JSONObject()
                .put("version", 1)
                .put("tasks", JSONArray())
                .put("appointments", JSONArray())
                .put("deletedAppointments", JSONArray())
                .put("emails", JSONArray())
                .put("settings", JSONObject())
                .put("updatedAt", Instant.now().toString())
                .toString(),
            connections = emptyList(),
            modulePayloads = emptyMap(),
            mobileModules = emptyList(),
        )
    }
}

data class PlannerSyncResult(
    val remotePayload: String,
    val pairedToken: String? = null,
    val desktopSyncAt: String? = null,
    val workspaceId: String? = null,
    val endpoint: String? = null,
    val remoteModulePayloads: Map<String, String> = emptyMap(),
    val mobileModules: List<MobileModuleRecord> = emptyList(),
    val moduleFailures: Set<String> = emptySet(),
)

data class MobileCalendarEvent(
    val id: String,
    val title: String,
    val calendarName: String,
    val color: String,
    val location: String,
    val allDay: Boolean,
    val year: Int,
    val month: Int,
    val day: Int,
    val hour: Int,
    val minute: Int,
    val endYear: Int,
    val endMonth: Int,
    val endDay: Int,
    val endHour: Int,
    val endMinute: Int,
    val calendarId: String = "",
    val startEpochMillis: Long? = null,
    val endEpochMillis: Long? = null,
    val itemId: String = "",
) {
    val startSortKey: String get() = "%04d%02d%02d%02d%02d".format(year, month, day, hour, minute)

    companion object {
        fun fromJson(source: JSONObject): MobileCalendarEvent? {
            val start = source.optJSONObject("start") ?: return null
            val year = start.optInt("year")
            val month = start.optInt("month")
            val day = start.optInt("day")
            if (year !in 2000..2200 || month !in 1..12 || day !in 1..31) return null
            // A remote calendar is outside the app's trust boundary. Reject a
            // date such as 31 February, so rendering one bad event can never
            // crash the entire Calendar module.
            if (runCatching { java.time.LocalDate.of(year, month, day) }.isFailure) return null
            val end = source.optJSONObject("end")
            val endYear = end?.optInt("year", year) ?: year
            val endMonth = end?.optInt("month", month) ?: month
            val endDay = end?.optInt("day", day) ?: day
            if (endYear !in 2000..2200 || endMonth !in 1..12 || endDay !in 1..31) return null
            if (runCatching { java.time.LocalDate.of(endYear, endMonth, endDay) }.isFailure) return null
            return MobileCalendarEvent(
                id = source.optString("id", "calendar-$year-$month-$day").take(220),
                title = source.optString("title", "(Ohne Titel)").take(500),
                calendarName = source.optString("calendarName").take(120),
                color = source.optString("calendarColor").takeIf { it.matches(Regex("#[0-9a-fA-F]{6}")) }
                    ?: "#6558E8",
                location = source.optString("location").take(200),
                allDay = source.optBoolean("allDay", false),
                year = year,
                month = month,
                day = day,
                hour = start.optInt("hour", 0).coerceIn(0, 23),
                minute = start.optInt("minute", 0).coerceIn(0, 59),
                endYear = endYear,
                endMonth = endMonth,
                endDay = endDay,
                endHour = end?.optInt("hour", 0)?.coerceIn(0, 23) ?: 0,
                endMinute = end?.optInt("minute", 0)?.coerceIn(0, 59) ?: 0,
                calendarId = source.optString("calendarId"),
                itemId = source.optString("itemId"),
                startEpochMillis = start.optLong("epochMillis").takeIf { start.has("epochMillis") && it > 0 },
                endEpochMillis = end?.optLong("epochMillis")?.takeIf { end.has("epochMillis") && it > 0 },
            )
        }
    }
}

/** A credential-free desktop calendar profile shown in the mobile sign-in flow. */
data class MobileCalendarSource(
    val id: String,
    val name: String,
    val provider: String,
    val endpointHint: String,
    val readOnly: Boolean,
) {
    companion object {
        fun fromJson(source: JSONObject): MobileCalendarSource? {
            val id = source.optString("id").trim().takeIf { it.isNotEmpty() }?.take(220) ?: return null
            val name = source.optString("name", "(Ohne Namen)").trim().ifEmpty { "(Ohne Namen)" }.take(160)
            val provider = source.optString("provider", source.optString("type", "Thunderbird-Kalender"))
                .trim()
                .ifEmpty { "Thunderbird-Kalender" }
                .take(120)
            // The Desktop only sends a sanitized host hint. Keep the same
            // boundary on mobile so an unexpected profile can never surface a
            // complete URL, query, or credential-like string in the UI.
            val endpointHint = source.optString("endpointHint")
                .trim()
                .takeIf { it.matches(Regex("[A-Za-z0-9.-]{1,253}")) }
                .orEmpty()
            return MobileCalendarSource(
                id = id,
                name = name,
                provider = if (provider.equals("gdata", ignoreCase = true) ||
                    provider.equals("google", ignoreCase = true)) "Google Calendar" else provider,
                endpointHint = endpointHint,
                readOnly = source.optBoolean("readOnly", false),
            )
        }
    }
}

private const val CALENDAR_MODULE_ID = "de.tbconnect.modules.calendar"

/**
 * Keeps module data and pairing tokens encrypted at rest using a per-app Android
 * Keystore key. The endpoint itself is only accepted when it is a local network
 * address, so a pairing code cannot redirect a user to an Internet host.
 */
class PlannerMobileStore(context: Context) {
    private val preferences = context.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE)

    fun load(): PlannerMobileState {
        val encoded = preferences.getString(PAYLOAD_KEY, null) ?: return PlannerMobileState.empty()
        cachedSnapshot?.takeIf { it.first == encoded }?.let { return it.second }
        return try {
            val state = fromJson(JSONObject(decrypt(encoded)))
            val filtered = removeKnownDiagnosticTask(state)
            if (filtered != state) save(filtered)
            cachedSnapshot = encoded to filtered
            filtered
        } catch (error: Exception) {
            preferences.edit().remove(PAYLOAD_KEY).apply()
            PlannerMobileState.empty()
        }
    }

    fun save(state: PlannerMobileState) {
        if (cachedSnapshot?.second == state && preferences.getString(PAYLOAD_KEY, null) == cachedSnapshot?.first) return
        val encoded = encrypt(toJson(state).toString())
        preferences.edit().putString(PAYLOAD_KEY, encoded).apply()
        cachedSnapshot = encoded to state
    }

    fun saveNextcloudLogin(flow: PlannerSyncClient.NextcloudLoginFlow, folder: String) {
        val pending = JSONObject()
            .put("serverUrl", flow.serverUrl).put("loginUrl", flow.loginUrl)
            .put("pollEndpoint", flow.pollEndpoint).put("pollToken", flow.pollToken)
            .put("startedAt", flow.startedAt).put("folder", folder)
        check(preferences.edit().putString("nextcloud_pending_login", encrypt(pending.toString())).commit()) {
            "Die laufende Nextcloud-Anmeldung konnte nicht gesichert werden."
        }
    }

    fun pendingNextcloudLogin(): Pair<PlannerSyncClient.NextcloudLoginFlow, String>? {
        val encoded = preferences.getString("nextcloud_pending_login", null) ?: return null
        return runCatching {
            val value = JSONObject(decrypt(encoded))
            PlannerSyncClient.NextcloudLoginFlow(
                serverUrl = value.getString("serverUrl"), loginUrl = value.getString("loginUrl"),
                pollEndpoint = value.getString("pollEndpoint"), pollToken = value.getString("pollToken"),
                startedAt = value.getLong("startedAt"),
            ) to value.optString("folder", "Thunderbird")
        }.getOrNull()
    }

    fun clearNextcloudLogin() {
        preferences.edit().remove("nextcloud_pending_login").commit()
    }

    fun tasks(state: PlannerMobileState): List<PlannerTask> = tasksFromPayload(payloadObject(state))

    fun appointments(state: PlannerMobileState): List<PlannerAppointment> = appointmentsFromPayload(payloadObject(state))

    /**
     * Deletion markers are retained and merged just like task edits.  This is
     * deliberate: a device that was offline before a delete must not restore
     * its older copy of the task during its next sync.
     */
    private fun deletedTaskMarkers(state: PlannerMobileState): Map<String, String> {
        val source = payloadObject(state).optJSONArray("deletedTasks") ?: JSONArray()
        val markers = linkedMapOf<String, String>()
        for (index in 0 until source.length()) {
            val item = source.optJSONObject(index) ?: continue
            val id = item.optString("id").trim().takeIf { it.isNotEmpty() } ?: continue
            val deletedAt = item.optString("deletedAt").takeIf { parseTimestamp(it) != null } ?: continue
            val current = markers[id]
            if (current == null || timestamp(deletedAt) >= timestamp(current)) markers[id] = deletedAt
        }
        return markers
    }

    private fun deletedAppointmentMarkers(state: PlannerMobileState): Map<String, String> {
        val source = payloadObject(state).optJSONArray("deletedAppointments") ?: JSONArray()
        val markers = linkedMapOf<String, String>()
        for (index in 0 until source.length()) {
            val item = source.optJSONObject(index) ?: continue
            val id = item.optString("id").trim().takeIf { it.isNotEmpty() } ?: continue
            val deletedAt = item.optString("deletedAt").takeIf { parseTimestamp(it) != null } ?: continue
            val current = markers[id]
            if (current == null || timestamp(deletedAt) >= timestamp(current)) markers[id] = deletedAt
        }
        return markers
    }

    fun desktopReferences(state: PlannerMobileState, dueDate: String?): List<PlannerDesktopReference> =
        plannedEmailReferences(state, dueDate) + calendarReferences(state, dueDate)

    fun plannedEmailItems(state: PlannerMobileState): List<PlannerMailReference> {
        val emails = payloadObject(state).optJSONArray("emails") ?: JSONArray()
        return (0 until emails.length()).mapNotNull { index ->
            val email = emails.optJSONObject(index) ?: return@mapNotNull null
            val date = email.optString("dueDate").takeIf {
                runCatching { java.time.LocalDate.parse(it) }.isSuccess
            }
            PlannerMailReference(
                email.optString("id").ifBlank { "mail:$index" },
                email.optString("subject", "(Ohne Betreff)"),
                email.optString("author", email.optString("sender", "Eingeplante Mail")),
                date, email.optBoolean("done", false),
            )
        }.distinctBy { it.id }
    }

    fun plannedEmailReferences(state: PlannerMobileState, dueDate: String?): List<PlannerDesktopReference> =
        plannedEmailItems(state).filter { it.dueDate == dueDate }.map { it.displayReference() }

    fun calendarReferences(state: PlannerMobileState, dueDate: String?): List<PlannerDesktopReference> {
        if (dueDate == null) return emptyList()
        val payload = payloadObject(state)
        val references = mutableListOf<PlannerDesktopReference>()
        if (dueDate != null) {
            val calendar = if (state.modulePayloads.containsKey(CALENDAR_MODULE_ID)) calendarPayload(state)
                else payload.optJSONObject("calendar")
            val events = calendar?.optJSONArray("events") ?: JSONArray()
            for (index in 0 until events.length()) {
                val event = events.optJSONObject(index) ?: continue
                val start = event.optJSONObject("start") ?: event
                val eventDate = "%04d-%02d-%02d".format(
                    start.optInt("year"),
                    start.optInt("month"),
                    start.optInt("day"),
                )
                if (eventDate != dueDate) continue
                val time = if (event.optBoolean("allDay", false)) "Ganztägig" else "%02d:%02d".format(
                    start.optInt("hour"),
                    start.optInt("minute"),
                )
                val calendar = event.optString("calendarName")
                references += PlannerDesktopReference("▣ ${event.optString("title", "(Ohne Titel)")}", listOf(time, calendar).filter { it.isNotEmpty() }.joinToString(" · "))
            }
        }
        return references
    }

    fun addTask(state: PlannerMobileState, text: String, dueDate: String?, emailAddress: String = ""): PlannerMobileState {
        val tasks = tasks(state).toMutableList()
        val timestamp = Instant.now().toString()
        val order = tasks.filter { it.dueDate == dueDate }.maxOfOrNull { it.order }?.plus(1) ?: 0
        tasks += PlannerTask(
            id = "task-${UUID.randomUUID()}",
            text = text.take(500),
            emailAddress = emailAddress.trim().take(320),
            dueDate = dueDate,
            order = order,
            done = false,
            createdAt = timestamp,
            updatedAt = timestamp,
        )
        return withTasks(state, tasks)
    }

    fun updateTask(state: PlannerMobileState, id: String, transform: (PlannerTask) -> PlannerTask): PlannerMobileState {
        val tasks = tasks(state).map { task -> if (task.id == id) transform(task) else task }
        return withTasks(state, tasks)
    }

    fun deleteTask(state: PlannerMobileState, id: String): PlannerMobileState = withTasks(
        state,
        tasks(state).filterNot { it.id == id },
        deletedTaskMarkers(state).toMutableMap().apply { put(id, Instant.now().toString()) },
    )

    fun addAppointment(
        state: PlannerMobileState,
        title: String,
        date: String,
        startTime: String,
        endTime: String,
    ): PlannerMobileState {
        val timestamp = Instant.now().toString()
        val items = appointments(state).toMutableList()
        items += PlannerAppointment(
            id = "appointment-${UUID.randomUUID()}",
            title = title.trim().take(500),
            date = date,
            startTime = startTime,
            endTime = endTime,
            createdAt = timestamp,
            updatedAt = timestamp,
        )
        return withAppointments(state, items)
    }

    fun updateAppointment(
        state: PlannerMobileState,
        id: String,
        transform: (PlannerAppointment) -> PlannerAppointment,
    ): PlannerMobileState = withAppointments(
        state,
        appointments(state).map { item -> if (item.id == id) transform(item) else item },
    )

    fun deleteAppointment(state: PlannerMobileState, id: String): PlannerMobileState = withAppointments(
        state,
        appointments(state).filterNot { it.id == id },
        deletedAppointmentMarkers(state).toMutableMap().apply { put(id, Instant.now().toString()) },
    )

    private fun removeKnownDiagnosticTask(state: PlannerMobileState): PlannerMobileState {
        val allTasks = tasks(state)
        val keptTasks = allTasks.filterNot { it.id == "task-diagnostic" }
        return if (keptTasks.size == allTasks.size) state else withTasks(state, keptTasks)
    }

    fun mergeRemotePayload(state: PlannerMobileState, remotePayload: String): PlannerMobileState {
        val remote = runCatching { JSONObject(remotePayload) }.getOrNull() ?: return state
        val localTasks = tasks(state).associateBy { it.id }
        val remoteTasks = tasksFromPayload(remote).associateBy { it.id }
        val deletionMarkers = deletedTaskMarkers(state).toMutableMap()
        val remoteDeleted = remote.optJSONArray("deletedTasks") ?: JSONArray()
        for (index in 0 until remoteDeleted.length()) {
            val deletion = remoteDeleted.optJSONObject(index) ?: continue
            val id = deletion.optString("id").trim().takeIf { it.isNotEmpty() } ?: continue
            val deletedAt = deletion.optString("deletedAt").takeIf { parseTimestamp(it) != null } ?: continue
            val current = deletionMarkers[id]
            if (current == null || timestamp(deletedAt) >= timestamp(current)) deletionMarkers[id] = deletedAt
        }
        val merged = LinkedHashMap<String, PlannerTask>()
        (localTasks.keys + remoteTasks.keys).forEach { id ->
            val local = localTasks[id]
            val incoming = remoteTasks[id]
            val chosen = when {
                local == null -> incoming
                incoming == null -> local
                timestamp(incoming.updatedAt) >= timestamp(local.updatedAt) -> incoming
                else -> local
            }
            if (chosen != null && timestamp(chosen.updatedAt) > timestamp(deletionMarkers[id] ?: "")) {
                merged[id] = chosen
            }
        }
        remote.put("tasks", JSONArray().apply { merged.values.forEach { put(it.toJson()) } })
        remote.put("deletedTasks", JSONArray().apply {
            deletionMarkers.forEach { (id, deletedAt) -> put(JSONObject().put("id", id).put("deletedAt", deletedAt)) }
        })
        val localAppointments = appointments(state).associateBy { it.id }
        val remoteAppointments = appointmentsFromPayload(remote).associateBy { it.id }
        val deletedAppointments = deletedAppointmentMarkers(state).toMutableMap()
        val remoteDeletedAppointments = remote.optJSONArray("deletedAppointments") ?: JSONArray()
        for (index in 0 until remoteDeletedAppointments.length()) {
            val deletion = remoteDeletedAppointments.optJSONObject(index) ?: continue
            val id = deletion.optString("id").trim().takeIf { it.isNotEmpty() } ?: continue
            val deletedAt = deletion.optString("deletedAt").takeIf { parseTimestamp(it) != null } ?: continue
            val current = deletedAppointments[id]
            if (current == null || timestamp(deletedAt) >= timestamp(current)) deletedAppointments[id] = deletedAt
        }
        val mergedAppointments = LinkedHashMap<String, PlannerAppointment>()
        (localAppointments.keys + remoteAppointments.keys).forEach { id ->
            val local = localAppointments[id]
            val incoming = remoteAppointments[id]
            val chosen = when {
                local == null -> incoming
                incoming == null -> local
                timestamp(incoming.updatedAt) >= timestamp(local.updatedAt) -> incoming
                else -> local
            }
            if (chosen != null && timestamp(chosen.updatedAt) > timestamp(deletedAppointments[id] ?: "")) {
                mergedAppointments[id] = chosen
            }
        }
        remote.put("appointments", JSONArray().apply { mergedAppointments.values.forEach { put(it.toJson()) } })
        remote.put("deletedAppointments", JSONArray().apply {
            deletedAppointments.forEach { (id, deletedAt) -> put(JSONObject().put("id", id).put("deletedAt", deletedAt)) }
        })
        remote.put("updatedAt", Instant.now().toString())
        return state.copy(payload = remote.toString())
    }

    fun mergeModuleSync(state: PlannerMobileState, result: PlannerSyncResult): PlannerMobileState {
        val payloads = state.modulePayloads.toMutableMap()
        result.remoteModulePayloads.forEach { (moduleId, payload) ->
            if (runCatching { JSONObject(payload) }.isSuccess) payloads[moduleId] = payload
        }
        val previous = state.mobileModules.associateBy { it.id }
        val records = result.mobileModules.map { incoming ->
            val current = previous[incoming.id]
            // A catalog refresh must not turn an already installed package back
            // into "Download verfügbar". Keep its local install marker while
            // refreshing the visible metadata from the Hub.
            if (current?.packageStatus == "Installiert" &&
                (current.packageUrl == incoming.packageUrl || incoming.packageUrl.isNullOrBlank())) {
                incoming.copy(
                    packagePayload = current.packagePayload,
                    packageStatus = current.packageStatus,
                    installedAt = current.installedAt,
                )
            } else {
                incoming
            }
        }.associateBy { it.id }
            .let { incoming -> previous.filterKeys { it !in incoming.keys } + incoming }
            .values
            .sortedBy { it.name.lowercase() }
        return state.copy(modulePayloads = payloads, mobileModules = records)
    }

    fun isModuleInstalled(state: PlannerMobileState, entry: String): Boolean = state.mobileModules.any {
        it.entry == entry && it.packageStatus == "Installiert"
    }

    fun moduleByEntry(state: PlannerMobileState, entry: String): MobileModuleRecord? =
        state.mobileModules.firstOrNull { it.entry == entry }

    /** Installs only a declarative package. Native code always remains in the APK. */
    fun installModule(state: PlannerMobileState, entry: String): PlannerMobileState {
        val record = moduleByEntry(state, entry)
            ?: throw IllegalArgumentException("Dieses Modul wurde vom Hub noch nicht bereitgestellt.")
        val payload = PlannerSyncClient.installMobilePackage(record)
        val installed = record.copy(
            packagePayload = payload,
            packageStatus = "Installiert",
            installedAt = Instant.now().toString(),
        )
        return state.copy(mobileModules = state.mobileModules.map { if (it.id == record.id) installed else it })
    }

    fun markModuleInstallFailed(state: PlannerMobileState, entry: String, message: String): PlannerMobileState = state.copy(
        mobileModules = state.mobileModules.map { module ->
            if (module.entry == entry) module.copy(packageStatus = "Fehler: ${message.take(100)}") else module
        },
    )

    fun calendarPayload(state: PlannerMobileState): JSONObject = runCatching {
        JSONObject(state.modulePayloads[CALENDAR_MODULE_ID] ?: "")
    }.getOrElse { JSONObject().put("events", JSONArray()).put("calendars", JSONArray()) }

    fun calendarEvents(state: PlannerMobileState): List<MobileCalendarEvent> {
        val events = calendarPayload(state).optJSONArray("events") ?: JSONArray()
        return buildList {
            for (index in 0 until events.length()) {
                events.optJSONObject(index)?.let(MobileCalendarEvent.Companion::fromJson)?.let(::add)
            }
        }.sortedWith(compareBy({ it.startSortKey }, { it.title.lowercase() }))
    }

    fun calendarSources(state: PlannerMobileState): List<MobileCalendarSource> {
        val calendars = calendarPayload(state).optJSONArray("calendars") ?: JSONArray()
        return buildList {
            for (index in 0 until calendars.length()) {
                calendars.optJSONObject(index)?.let(MobileCalendarSource.Companion::fromJson)?.let(::add)
            }
        }.distinctBy { it.id }.sortedBy { it.name.lowercase() }
    }

    private fun withTasks(
        state: PlannerMobileState,
        tasks: List<PlannerTask>,
        deletedTasks: Map<String, String> = deletedTaskMarkers(state),
    ): PlannerMobileState {
        val payload = payloadObject(state)
        payload.put("tasks", JSONArray().apply { tasks.forEach { put(it.toJson()) } })
        payload.put("deletedTasks", JSONArray().apply {
            deletedTasks.forEach { (id, deletedAt) -> put(JSONObject().put("id", id).put("deletedAt", deletedAt)) }
        })
        payload.put("updatedAt", Instant.now().toString())
        return state.copy(payload = payload.toString())
    }

    private fun withAppointments(
        state: PlannerMobileState,
        appointments: List<PlannerAppointment>,
        deletedAppointments: Map<String, String> = deletedAppointmentMarkers(state),
    ): PlannerMobileState {
        val payload = payloadObject(state)
        payload.put("appointments", JSONArray().apply { appointments.forEach { put(it.toJson()) } })
        payload.put("deletedAppointments", JSONArray().apply {
            deletedAppointments.forEach { (id, deletedAt) -> put(JSONObject().put("id", id).put("deletedAt", deletedAt)) }
        })
        payload.put("updatedAt", Instant.now().toString())
        return state.copy(payload = payload.toString())
    }

    private fun payloadObject(state: PlannerMobileState): JSONObject = runCatching { JSONObject(state.payload) }
        .getOrElse { JSONObject(PlannerMobileState.empty().payload) }

    private fun tasksFromPayload(payload: JSONObject): List<PlannerTask> {
        val source = payload.optJSONArray("tasks") ?: JSONArray()
        return buildList {
            for (index in 0 until source.length()) {
                source.optJSONObject(index)?.let { PlannerTask.fromJson(it, index) }?.let(::add)
            }
        }
    }

    private fun appointmentsFromPayload(payload: JSONObject): List<PlannerAppointment> {
        val source = payload.optJSONArray("appointments") ?: JSONArray()
        return buildList {
            for (index in 0 until source.length()) {
                source.optJSONObject(index)?.let(PlannerAppointment.Companion::fromJson)?.let(::add)
            }
        }
    }

    private fun toJson(state: PlannerMobileState): JSONObject = JSONObject()
        .put("clientId", state.clientId)
        .put("payload", state.payload)
        .put("connections", JSONArray().apply { state.connections.forEach { put(it.toJson()) } })
        .put("modulePayloads", JSONObject().apply { state.modulePayloads.forEach { (id, payload) -> put(id, payload) } })
        .put("mobileModules", JSONArray().apply { state.mobileModules.forEach { put(it.toJson()) } })

    private fun fromJson(source: JSONObject): PlannerMobileState {
        val clientId = source.optString("clientId").takeIf { it.isNotEmpty() } ?: "mobile-${UUID.randomUUID()}"
        val payload = source.optString("payload").takeIf { runCatching { JSONObject(it) }.isSuccess }
            ?: PlannerMobileState.empty().payload
        val connections = buildList {
            val sourceConnections = source.optJSONArray("connections") ?: JSONArray()
            for (index in 0 until sourceConnections.length()) {
                sourceConnections.optJSONObject(index)?.let(PlannerConnection.Companion::fromJson)?.let(::add)
            }
        }
        val modulePayloads = buildMap {
            val sourcePayloads = source.optJSONObject("modulePayloads") ?: JSONObject()
            sourcePayloads.keys().forEach { key ->
                sourcePayloads.optString(key).takeIf { runCatching { JSONObject(it) }.isSuccess }?.let { put(key, it) }
            }
        }
        val mobileModules = buildList {
            val sourceModules = source.optJSONArray("mobileModules") ?: JSONArray()
            for (index in 0 until sourceModules.length()) {
                sourceModules.optJSONObject(index)?.let(MobileModuleRecord.Companion::fromJson)?.let(::add)
            }
        }
        return PlannerMobileState(clientId, payload, connections, modulePayloads, mobileModules)
    }

    private fun encrypt(value: String): String {
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.ENCRYPT_MODE, key())
        val encrypted = cipher.doFinal(value.toByteArray(Charsets.UTF_8))
        return listOf(cipher.iv, encrypted).joinToString(".") { Base64.encodeToString(it, Base64.NO_WRAP) }
    }

    private fun decrypt(value: String): String {
        val parts = value.split('.', limit = 2)
        require(parts.size == 2) { "Ungültiger lokaler Planner-Speicher." }
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(
            Cipher.DECRYPT_MODE,
            key(),
            GCMParameterSpec(128, Base64.decode(parts[0], Base64.NO_WRAP)),
        )
        return cipher.doFinal(Base64.decode(parts[1], Base64.NO_WRAP)).toString(Charsets.UTF_8)
    }

    private fun key(): SecretKey {
        val keyStore = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        (keyStore.getKey(KEY_ALIAS, null) as? SecretKey)?.let { return it }
        return KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore").run {
            init(
                KeyGenParameterSpec.Builder(
                    KEY_ALIAS,
                    KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT,
                ).setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                    .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                    .build(),
            )
            generateKey()
        }
    }

    companion object {
        private const val PREFERENCES = "zeitklar_daily_planner_secure"
        private const val PAYLOAD_KEY = "encrypted_state"
        @Volatile private var cachedSnapshot: Pair<String, PlannerMobileState>? = null
        private const val KEY_ALIAS = "zeitklar_daily_planner_state_v1"

        fun parseTimestamp(value: String?): Instant? = runCatching { Instant.parse(value) }.getOrNull()

        fun isVpnActive(context: Context): Boolean {
            val connectivity = context.getSystemService(ConnectivityManager::class.java) ?: return false
            return connectivity.allNetworks.any { network ->
                connectivity.getNetworkCapabilities(network)?.hasTransport(NetworkCapabilities.TRANSPORT_VPN) == true
            }
        }

        private fun timestamp(value: String): Long = parseTimestamp(value)?.toEpochMilli() ?: 0L
    }
}

object PlannerSyncClient {
    fun editDesktopCalendar(context: Context, connection: PlannerConnection, request: JSONObject): JSONObject {
        require(connection.mode == PlannerConnection.Mode.MODULE_BRIDGE) { "Für Kalenderänderungen ist eine lokale Hub-Verbindung erforderlich." }
        val token = requireNotNull(connection.token) { "Der Hub-Zugang fehlt." }
        return postJson(context, connection.endpoint.trimEnd('/') + "/v1/calendar-edit",
            request.put("protocol", MODULE_PROTOCOL), mapOf("x-tb-connect-module-token" to token))
    }
    data class NextcloudLoginFlow(
        val serverUrl: String,
        val loginUrl: String,
        val pollEndpoint: String,
        val pollToken: String,
        val startedAt: Long = System.currentTimeMillis(),
    )

    data class NextcloudLoginCredentials(
        val serverUrl: String,
        val username: String,
        val appPassword: String,
    )

    private const val MODULE_PROTOCOL = "tb-connect-module-bridge/1"
    private const val NEXTCLOUD_PROTOCOL = "tb-connect-nextcloud/1"
    private const val NEXTCLOUD_STATE_FILE = "tb-connect-sync.json"
    private const val NEXTCLOUD_MANIFEST_FILE = "tb-connect-manifest.json"
    private const val DEFAULT_NEXTCLOUD_APP_FOLDER = "Thunderbird"
    private const val MAX_NEXTCLOUD_BYTES = 1024 * 1024
    private const val MODULE_ID = "de.tbconnect.modules.daily-planner"
    private const val MOBILE_PACKAGE_FORMAT = "tb-connect-mobile-package/1"
    private const val MAX_MOBILE_PACKAGE_BYTES = 256 * 1024

    fun connectionFromPairingCode(code: String): PlannerConnection {
        val uri = Uri.parse(code.trim())
        return when (uri.scheme) {
            "tb-connect", "thunderbird-module" -> {
                val endpoint = localEndpoint(uri.getQueryParameter("host"))
                val fallbackEndpoints = uri.getQueryParameter("hosts")
                    ?.split(',')
                    ?.mapNotNull { candidate -> runCatching { localEndpoint(candidate.trim()) }.getOrNull() }
                    ?.filterNot { it == endpoint }
                    ?.distinct()
                    ?: emptyList()
                val session = uri.getQueryParameter("session")?.takeIf { it.isNotEmpty() }
                    ?: throw IllegalArgumentException("Der Kopplungscode enthält keine Sitzung.")
                val secret = uri.getQueryParameter("secret")?.takeIf { it.isNotEmpty() }
                    ?: throw IllegalArgumentException("Der Kopplungscode enthält kein Geheimnis.")
                PlannerConnection(
                    id = endpoint,
                    name = uri.getQueryParameter("name") ?: "TB-Connect Desktop",
                    endpoint = endpoint,
                    fallbackEndpoints = fallbackEndpoints,
                    token = "$session.$secret",
                    mode = PlannerConnection.Mode.MODULE_BRIDGE,
                )
            }

            "zeitklar" -> PlannerConnection(
                id = localEndpoint(uri.getQueryParameter("host")),
                name = "TB-Connect Desktop (direkt)",
                endpoint = localEndpoint(uri.getQueryParameter("host")),
                token = uri.getQueryParameter("token")?.takeIf { it.isNotEmpty() }
                    ?: throw IllegalArgumentException("Der Kopplungscode enthält keinen Zugang.") ,
                mode = PlannerConnection.Mode.LEGACY_DAILY_PLANNER,
            )

            else -> throw IllegalArgumentException("Der Kopplungscode gehört nicht zu TB-Connect.")
        }
    }

    /**
     * Creates a second, Internet-capable transport without weakening the
     * private-LAN checks of QR pairing. The caller stores the app password in
     * PlannerMobileStore, which is encrypted with an Android Keystore key.
     */
    fun nextcloudConnection(
        serverUrl: String,
        username: String,
        appPassword: String,
        appFolder: String = DEFAULT_NEXTCLOUD_APP_FOLDER,
    ): PlannerConnection {
        val endpoint = nextcloudBaseUrl(serverUrl)
        val user = username.trim().takeIf { it.isNotEmpty() }
            ?: throw IllegalArgumentException("Der Nextcloud-Benutzername fehlt.")
        require(!user.contains('\n') && !user.contains('\r')) { "Der Nextcloud-Benutzername ist ungültig." }
        require(appPassword.isNotBlank()) { "Das Nextcloud-App-Passwort fehlt." }
        val folder = nextcloudAppFolder(appFolder)
        return PlannerConnection(
            id = "nextcloud:$endpoint:$user:$folder",
            name = "Nextcloud · $folder",
            endpoint = endpoint,
            token = appPassword,
            mode = PlannerConnection.Mode.NEXTCLOUD,
            username = user,
            appFolder = folder,
        )
    }

    /**
     * Initiates Nextcloud's documented Login Flow v2. The normal account
     * password stays on the Nextcloud page; this client receives only its
     * own revocable app password through the one-time polling endpoint.
     */
    fun startNextcloudLogin(serverUrl: String): NextcloudLoginFlow {
        val baseUrl = nextcloudBaseUrl(serverUrl)
        val connection = openAnonymousNextcloudConnection("$baseUrl/index.php/login/v2").apply {
            requestMethod = "POST"
            setRequestProperty("Accept", "application/json")
        }
        try {
            val status = connection.responseCode
            val body = nextcloudResponseBody(connection, status)
            if (status !in 200..299) {
                throw IllegalStateException(nextcloudLoginResponseError(status, "Starten der Browser-Anmeldung"))
            }
            val payload = runCatching { JSONObject(body) }
                .getOrElse { throw IllegalStateException("Nextcloud liefert beim Start der Anmeldung keine gültige Antwort.") }
            val loginUrl = payload.optString("login").trim()
            val poll = payload.optJSONObject("poll")
            val pollEndpoint = poll?.optString("endpoint").orEmpty().trim()
            val pollToken = poll?.optString("token").orEmpty().trim()
            validateNextcloudFlowUrl(loginUrl, baseUrl, "Anmeldeseite")
            validateNextcloudFlowUrl(pollEndpoint, baseUrl, "Anmelde-Endpunkt")
            require(pollToken.isNotEmpty()) { "Nextcloud hat keinen Anmeldecode geliefert." }
            return NextcloudLoginFlow(
                serverUrl = baseUrl,
                loginUrl = loginUrl,
                pollEndpoint = pollEndpoint,
                pollToken = pollToken,
            )
        } finally {
            connection.disconnect()
        }
    }

    /** Polls the one-time Nextcloud Login Flow v2 endpoint for up to 20 minutes. */
    fun waitForNextcloudLogin(flow: NextcloudLoginFlow): NextcloudLoginCredentials {
        repeat(600) {
            check(System.currentTimeMillis() - flow.startedAt < 20 * 60 * 1000L) {
                "Die Nextcloud-Anmeldung ist abgelaufen. Bitte starte sie erneut."
            }
            val connection = openAnonymousNextcloudConnection(flow.pollEndpoint).apply {
                requestMethod = "POST"
                doOutput = true
                setRequestProperty("Content-Type", "application/x-www-form-urlencoded")
                setRequestProperty("Accept", "application/json")
            }
            try {
                OutputStreamWriter(connection.outputStream, Charsets.UTF_8).use {
                    it.write("token=" + URLEncoder.encode(flow.pollToken, Charsets.UTF_8.name()))
                }
                val status = connection.responseCode
                if (status == 404) {
                    Thread.sleep(2_000)
                    return@repeat
                }
                val body = nextcloudResponseBody(connection, status)
                if (status !in 200..299) {
                    throw IllegalStateException(nextcloudLoginResponseError(status, "Prüfen der Browser-Anmeldung"))
                }
                val payload = runCatching { JSONObject(body) }
                    .getOrElse { throw IllegalStateException("Nextcloud liefert nach der Anmeldung keine gültige Antwort.") }
                val endpoint = payload.optString("server", flow.serverUrl)
                require(nextcloudBaseUrl(endpoint) == nextcloudBaseUrl(flow.serverUrl)) {
                    "Nextcloud hat eine andere Serveradresse geliefert. Bitte die endgültige Cloud-Adresse neu einrichten."
                }
                val username = payload.optString("loginName").trim()
                val appPassword = payload.optString("appPassword")
                return NextcloudLoginCredentials(
                    serverUrl = nextcloudBaseUrl(endpoint),
                    username = username.takeIf { it.isNotEmpty() }
                        ?: throw IllegalStateException("Nextcloud hat keinen Benutzernamen geliefert."),
                    appPassword = appPassword.takeIf { it.isNotEmpty() }
                        ?: throw IllegalStateException("Nextcloud hat kein App-Passwort geliefert."),
                )
            } finally {
                connection.disconnect()
            }
        }
        throw IllegalStateException("Die Nextcloud-Anmeldung wurde nicht innerhalb von 20 Minuten bestätigt.")
    }

    fun sync(context: Context, state: PlannerMobileState, connection: PlannerConnection): PlannerSyncResult {
        if (connection.mode == PlannerConnection.Mode.NEXTCLOUD) {
            return syncNextcloud(context, state, connection)
        }
        var lastError: Exception? = null
        // A PC can have WLAN, Ethernet, hotspot and WireGuard adapters at the
        // same time.  The QR code carries all private candidates.  Try each
        // of them before doing the (slower) subnet discovery fallback.
        val candidates = (listOf(connection.endpoint) + connection.fallbackEndpoints).distinct()
        for (endpoint in candidates) {
            try {
                return syncDirect(context, state, connection.copy(endpoint = endpoint))
                    .copy(endpoint = endpoint)
            } catch (error: Exception) {
                lastError = error
            }
        }

        val workspaceId = connection.workspaceId
        if (connection.mode != PlannerConnection.Mode.MODULE_BRIDGE || workspaceId.isNullOrBlank()) {
            throw (lastError ?: IllegalStateException("Der Desktop ist nicht erreichbar."))
        }

        val recoveredEndpoint = findEndpointOnCurrentWifi(context, workspaceId, connection.endpoint)
            ?: throw (lastError ?: IllegalStateException("Der Desktop ist nicht erreichbar."))
        return syncModuleBridge(context, state, connection.copy(endpoint = recoveredEndpoint)).copy(endpoint = recoveredEndpoint)
    }

    private fun syncDirect(context: Context, state: PlannerMobileState, connection: PlannerConnection): PlannerSyncResult = when (connection.mode) {
        PlannerConnection.Mode.MODULE_BRIDGE -> syncModuleBridge(context, state, connection).copy(endpoint = connection.endpoint)
        PlannerConnection.Mode.LEGACY_DAILY_PLANNER -> syncLegacyPlanner(context, state, connection).copy(endpoint = connection.endpoint)
        PlannerConnection.Mode.NEXTCLOUD -> syncNextcloud(context, state, connection).copy(endpoint = connection.endpoint)
    }

    private fun syncModuleBridge(context: Context, state: PlannerMobileState, connection: PlannerConnection): PlannerSyncResult {
        val secretParts = connection.token?.split('.', limit = 2) ?: emptyList()
        val isPairing = secretParts.size == 2 && secretParts[0].isNotEmpty() && secretParts[1].isNotEmpty()
        val localPlannerPayload = JSONObject(state.payload)
        val response = postModuleState(
            context = context,
            endpoint = connection.endpoint,
            clientId = state.clientId,
            moduleId = MODULE_ID,
            moduleState = localPlannerPayload,
            token = connection.token,
            pairingSession = if (isPairing) secretParts[0] else null,
            pairingSecret = if (isPairing) secretParts[1] else null,
            moduleInstallations = moduleInstallations(state),
        )
        val remote = response.optJSONObject("state") ?: JSONObject(state.payload)
        val pairedToken = response.optString("token").takeIf { it.isNotEmpty() }
        val syncToken = pairedToken ?: connection.token
        val remoteModules = mutableMapOf<String, String>()
        val failedModules = mutableSetOf<String>()
        val receivedVersions = mutableMapOf(MODULE_ID to response.optString("updatedAt"))
        val moduleRecords = moduleRecords(response.optJSONArray("moduleCatalog") ?: JSONArray())
        // The calendar renderer is part of TB-Connect itself. A declarative
        // package changes catalogue metadata only; it must never decide
        // whether a linked phone receives calendar data or imported access
        // profiles from Thunderbird Desktop.
        if (!syncToken.isNullOrBlank()) {
            val localCalendar = runCatching { JSONObject(state.modulePayloads[CALENDAR_MODULE_ID] ?: "") }
                .getOrElse { JSONObject().put("version", 1).put("events", JSONArray()) }
            runCatching {
                postModuleState(
                    context = context,
                    endpoint = connection.endpoint,
                    clientId = state.clientId,
                    moduleId = CALENDAR_MODULE_ID,
                    moduleState = localCalendar,
                    token = syncToken,
                    moduleInstallations = moduleInstallations(state),
                )
            }.onSuccess { calendarResponse ->
                calendarResponse.optJSONObject("state")?.let { remoteModules[CALENDAR_MODULE_ID] = it.toString() }
                receivedVersions[CALENDAR_MODULE_ID] = calendarResponse.optString("updatedAt")
            }.onFailure { error ->
                failedModules += CALENDAR_MODULE_ID
                // The primary /v1/pair response already contains the permanent
                // access token. A temporary failure of one optional module must
                // never discard that successful desktop connection.
                Log.w("TBConnectSync", "Kalenderabgleich fehlgeschlagen; Desktop-Verbindung bleibt erhalten.", error)
            }
        }
        val result = PlannerSyncResult(
            remotePayload = remote.toString(),
            pairedToken = pairedToken,
            desktopSyncAt = response.optString("serverSyncAt").takeIf { it.isNotEmpty() },
            workspaceId = response.optString("workspaceId").takeIf { it.isNotEmpty() },
            remoteModulePayloads = remoteModules,
            moduleFailures = failedModules,
            mobileModules = moduleRecords,
        )
        val store = PlannerMobileStore(context)
        store.save(store.mergeModuleSync(store.mergeRemotePayload(store.load(), result.remotePayload), result))
        if (!syncToken.isNullOrBlank()) {
            receivedVersions.filterValues { it.isNotBlank() }.forEach { (module, version) ->
                runCatching {
                    postJson(context, connection.endpoint.trimEnd('/') + "/v1/ack", JSONObject()
                        .put("protocol", MODULE_PROTOCOL).put("moduleId", module)
                        .put("client", JSONObject().put("id", state.clientId))
                        .put("receivedUpdatedAt", version), mapOf("x-tb-connect-module-token" to syncToken))
                }
            }
        }
        return result
    }

    private fun postModuleState(
        context: Context,
        endpoint: String,
        clientId: String,
        moduleId: String,
        moduleState: JSONObject,
        token: String?,
        pairingSession: String? = null,
        pairingSecret: String? = null,
        moduleInstallations: JSONArray = JSONArray(),
    ): JSONObject {
        val isPairing = !pairingSession.isNullOrBlank() && !pairingSecret.isNullOrBlank()
        val payload = JSONObject()
            .put("protocol", MODULE_PROTOCOL)
            .put("moduleId", moduleId)
            .put("client", JSONObject().put("id", clientId).put("name", "TB-Connect Mobil").put("kind", "mobile"))
            .put("moduleInstallations", moduleInstallations)
            .put("updatedAt", moduleState.optString("updatedAt", Instant.now().toString()))
            .put("state", moduleState)
        val headers = mutableMapOf("content-type" to "application/json")
        val path = if (isPairing) {
            payload.put("sessionId", pairingSession).put("pairingSecret", pairingSecret)
            "/v1/pair"
        } else {
            headers["x-tb-connect-module-token"] = token
                ?: throw IllegalArgumentException("Für diesen Desktop fehlt der Zugang.")
            "/v1/sync"
        }
        return postJson(context, endpoint.trimEnd('/') + path, payload, headers)
    }

    private fun moduleRecords(catalog: JSONArray): List<MobileModuleRecord> = buildList {
        for (index in 0 until catalog.length()) {
            val source = catalog.optJSONObject(index) ?: continue
            val id = source.optString("id").trim().takeIf { it.isNotEmpty() } ?: continue
            val mobile = source.optJSONObject("mobile") ?: continue
            val entry = mobile.optString("entry").trim().takeIf { it.isNotEmpty() } ?: continue
            if (mobile.optBoolean("preview", false)) continue
            val name = source.optString("name", id).take(120)
            val description = source.optString("description").take(500)
            val packageInfo = mobile.optJSONObject("package")
            val packageUrl = packageInfo?.optString("url").takeIf { !it.isNullOrBlank() }
            val expectedHash = packageInfo?.optString("sha256").takeIf { !it.isNullOrBlank() }
            val inlinePackage = packageInfo?.optJSONObject("inline")?.toString()
            add(
                MobileModuleRecord(
                    id = id.take(120),
                    name = name,
                    description = description,
                    entry = entry.take(80),
                    packageUrl = packageUrl,
                    packageSha256 = expectedHash,
                    inlinePackage = inlinePackage,
                    packageStatus = "Download verfügbar",
                ),
            )
        }
    }

    private fun moduleInstallations(state: PlannerMobileState): JSONArray = JSONArray().apply {
        state.mobileModules.forEach { module ->
            put(JSONObject()
                .put("id", module.id)
                .put("entry", module.entry)
                .put("status", module.packageStatus)
                .put("installedAt", module.installedAt))
        }
    }

    fun installMobilePackage(record: MobileModuleRecord): String {
        val inline = record.inlinePackage?.let(::JSONObject)
        if (inline != null) return validateMobilePackage(inline, record.id, record.entry)
        val url = record.packageUrl ?: throw IllegalArgumentException("Das Modul enthält kein Mobil-Paket.")
        return downloadMobilePackage(url, record.packageSha256.orEmpty(), record.id, record.entry)
    }

    private fun downloadMobilePackage(urlValue: String, expectedHash: String, expectedId: String, expectedEntry: String): String {
        val url = URL(urlValue)
        require(url.protocol == "https") { "Mobil-Pakete müssen HTTPS verwenden." }
        val connection = (url.openConnection() as? HttpURLConnection)
            ?: throw IllegalArgumentException("Mobil-Paket verwendet kein HTTP.")
        connection.apply {
            requestMethod = "GET"
            instanceFollowRedirects = false
            connectTimeout = 8_000
            readTimeout = 10_000
        }
        try {
            require(connection.responseCode in 200..299) { "Mobil-Paket antwortet mit ${connection.responseCode}." }
            val body = connection.inputStream.use { stream ->
                val output = ByteArrayOutputStream()
                val buffer = ByteArray(8 * 1024)
                while (true) {
                    val count = stream.read(buffer)
                    if (count <= 0) break
                    require(output.size() + count <= MAX_MOBILE_PACKAGE_BYTES) { "Mobil-Paket ist größer als 256 KiB." }
                    output.write(buffer, 0, count)
                }
                output.toByteArray()
            }
            if (expectedHash.isNotBlank()) {
                val actual = MessageDigest.getInstance("SHA-256").digest(body).joinToString("") { "%02x".format(it) }
                require(actual.equals(expectedHash, ignoreCase = true)) { "Mobil-Paket stimmt nicht mit der Prüfsumme überein." }
            }
            return validateMobilePackage(JSONObject(body.toString(Charsets.UTF_8)), expectedId, expectedEntry)
        } finally {
            connection.disconnect()
        }
    }

    private fun validateMobilePackage(packageJson: JSONObject, expectedId: String, expectedEntry: String): String {
        require(packageJson.optString("format") == MOBILE_PACKAGE_FORMAT) { "Unbekanntes Mobil-Paketformat." }
        require(packageJson.optString("id") == expectedId) { "Mobil-Paket gehört zu einem anderen Modul." }
        require(packageJson.optString("entry") == expectedEntry) { "Mobil-Paket passt nicht zur Modulansicht." }
        require(packageJson.optString("renderer", "native") == "native") { "Mobil-Pakete dürfen nur native Ansichten beschreiben." }
        return packageJson.toString()
    }

    private data class NextcloudSnapshot(
        val value: JSONObject,
        val etag: String?,
        val exists: Boolean,
    )

    /**
     * Synchronize the same module envelope that the local Hub uses, but place
     * it in a dedicated WebDAV app folder. A failed conditional write is
     * retried from a fresh read so concurrent phone/desktop changes are merged
     * rather than silently overwritten.
     */
    private fun syncNextcloud(context: Context, state: PlannerMobileState, connection: PlannerConnection): PlannerSyncResult {
        val username = connection.username?.trim().takeIf { !it.isNullOrEmpty() }
            ?: throw IllegalArgumentException("Für Nextcloud fehlt der Benutzername.")
        val password = connection.token?.takeIf { it.isNotEmpty() }
            ?: throw IllegalArgumentException("Für Nextcloud fehlt das App-Passwort.")
        val baseUrl = nextcloudBaseUrl(connection.endpoint)
        val folder = nextcloudAppFolder(connection.appFolder)
        val store = PlannerMobileStore(context)

        // Verify the authenticated WebDAV root first. Without this, a missing
        // synchronization file and a failed login can both look like a 404.
        NextcloudDav.prepareFolder(nextcloudUserRootUrl(baseUrl, username),
            nextcloudFileUrl(baseUrl, username, folder, ""), username, password)

        for (attempt in 0 until 3) {
            val remote = readNextcloudSnapshot(baseUrl, username, password, folder)
            val snapshot = remote.value
            val modules = snapshot.optJSONObject("modules") ?: JSONObject().also { snapshot.put("modules", it) }
            val remotePlanner = modules.optJSONObject(MODULE_ID)?.optJSONObject("state") ?: JSONObject()
            val mergedState = store.mergeRemotePayload(state, remotePlanner.toString())
            val now = Instant.now().toString()

            modules.put(MODULE_ID, JSONObject()
                .put("state", JSONObject(mergedState.payload))
                .put("updatedAt", now)
                .put("lastWriter", state.clientId)
                .put("lastSyncAt", now))
            val clients = snapshot.optJSONObject("clients") ?: JSONObject().also { snapshot.put("clients", it) }
            clients.put(state.clientId, JSONObject()
                .put("id", state.clientId)
                .put("name", "TB-Connect Mobil")
                .put("kind", "mobile")
                .put("lastSyncAt", now))
            snapshot.put("format", NEXTCLOUD_PROTOCOL)
            snapshot.put("appFolder", folder)
            snapshot.put("revision", snapshot.optInt("revision", 0) + 1)
            snapshot.put("updatedAt", now)

            // The app folder has already been created with standard WebDAV MKCOL.
            val manifestStatus = putNextcloudJson(
                baseUrl,
                username,
                password,
                folder,
                NEXTCLOUD_MANIFEST_FILE,
                JSONObject()
                    .put("format", NEXTCLOUD_PROTOCOL)
                    .put("kind", "tb-connect-app-folder")
                    .put("appFolder", folder)
                    .put("updatedAt", now),
            )
            if (manifestStatus !in 200..299) {
                throw IllegalStateException(nextcloudResponseError(manifestStatus, "Einrichten des Ordners"))
            }
            val condition = if (remote.exists) {
                remote.etag?.let { "If-Match" to it }
                    ?: throw IllegalStateException("Nextcloud hat keine Dateiversion für den sicheren Abgleich geliefert.")
            } else {
                "If-None-Match" to "*"
            }
            val stateStatus = putNextcloudJson(
                baseUrl,
                username,
                password,
                folder,
                NEXTCLOUD_STATE_FILE,
                snapshot,
                condition,
            )
            if (stateStatus == 412) continue
            if (stateStatus !in 200..299) {
                throw IllegalStateException(nextcloudResponseError(stateStatus, "Speichern"))
            }
            val remoteModules = buildMap {
                modules.optJSONObject(CALENDAR_MODULE_ID)?.optJSONObject("state")?.let { put(CALENDAR_MODULE_ID, it.toString()) }
            }
            return PlannerSyncResult(
                remotePayload = mergedState.payload,
                desktopSyncAt = now,
                workspaceId = "nextcloud:$folder",
                endpoint = baseUrl,
                remoteModulePayloads = remoteModules,
                mobileModules = moduleRecords(snapshot.optJSONArray("catalog") ?: JSONArray()),
            )
        }
        throw IllegalStateException("Der Nextcloud-Zustand wurde gleichzeitig geändert. Bitte erneut synchronisieren.")
    }

    private fun readNextcloudSnapshot(
        baseUrl: String,
        username: String,
        password: String,
        appFolder: String,
    ): NextcloudSnapshot {
        val connection = openNextcloudConnection(nextcloudFileUrl(baseUrl, username, appFolder, NEXTCLOUD_STATE_FILE), username, password).apply {
            requestMethod = "GET"
        }
        try {
            val status = connection.responseCode
            if (status == 404) return NextcloudSnapshot(newNextcloudSnapshot(appFolder), null, false)
            val body = nextcloudResponseBody(connection, status)
            if (status !in 200..299) {
                throw IllegalStateException(nextcloudResponseError(status, "Lesen"))
            }
            val snapshot = runCatching { JSONObject(body) }
                .getOrElse { throw IllegalStateException("Die Nextcloud-Synchronisationsdatei enthält kein gültiges JSON.") }
            val format = snapshot.optString("format")
            require(format.isEmpty() || format == NEXTCLOUD_PROTOCOL) { "Der Nextcloud-Ordner enthält kein kompatibles TB-Connect-Datenformat." }
            return NextcloudSnapshot(snapshot, connection.getHeaderField("ETag"), true)
        } finally {
            connection.disconnect()
        }
    }

    private fun putNextcloudJson(
        baseUrl: String,
        username: String,
        password: String,
        appFolder: String,
        filename: String,
        payload: JSONObject,
        condition: Pair<String, String>? = null,
    ): Int {
        val connection = openNextcloudConnection(nextcloudFileUrl(baseUrl, username, appFolder, filename), username, password).apply {
            requestMethod = "PUT"
            doOutput = true
            setRequestProperty("Content-Type", "application/json; charset=utf-8")
            condition?.let { (name, value) -> setRequestProperty(name, value) }
        }
        try {
            OutputStreamWriter(connection.outputStream, Charsets.UTF_8).use { it.write(payload.toString()) }
            return connection.responseCode
        } finally {
            connection.disconnect()
        }
    }

    private fun openNextcloudConnection(url: String, username: String, password: String): HttpURLConnection =
        (URL(url).also { require(it.protocol == "https") { "Die Nextcloud-Adresse muss HTTPS verwenden." } }.openConnection() as? HttpURLConnection)
            ?.apply {
                instanceFollowRedirects = false
                connectTimeout = 10_000
                readTimeout = 15_000
                setRequestProperty("Authorization", "Basic " + Base64.encodeToString("$username:$password".toByteArray(Charsets.UTF_8), Base64.NO_WRAP))
            }
            ?: throw IllegalStateException("Die Nextcloud-Adresse verwendet kein HTTPS.")

    private fun openAnonymousNextcloudConnection(url: String): HttpURLConnection =
        (URL(url).also { require(it.protocol == "https") { "Die Nextcloud-Adresse muss HTTPS verwenden." } }.openConnection() as? HttpURLConnection)
            ?.apply {
                instanceFollowRedirects = false
                connectTimeout = 10_000
                readTimeout = 15_000
            }
            ?: throw IllegalStateException("Die Nextcloud-Adresse verwendet kein HTTPS.")

    private fun validateNextcloudFlowUrl(value: String, serverUrl: String, field: String) {
        val url = runCatching { URL(value) }
            .getOrElse { throw IllegalStateException("Nextcloud liefert für $field keine gültige HTTPS-Adresse.") }
        require(url.protocol == "https") { "Nextcloud liefert für $field keine HTTPS-Adresse." }
        require(url.protocol == URL(serverUrl).protocol && url.authority == URL(serverUrl).authority) {
            "Nextcloud liefert für $field eine Adresse außerhalb dieser Cloud."
        }
    }

    private fun nextcloudResponseError(status: Int, phase: String): String = when (status) {
        401 -> "Nextcloud lehnt die Anmeldung ab (401). Prüfe Benutzername und ein neu erzeugtes Nextcloud-App-Passwort."
        403 -> "Nextcloud verweigert $phase (403). Prüfe Dateizugriff des App-Passworts, Ordnerrechte und die Zugriffsregeln des Servers."
        301, 302, 303, 307, 308 -> "Nextcloud leitet die Adresse um ($status). Trage die HTTPS-Basisadresse ein, die nach dem Öffnen der Cloud im Browser angezeigt wird."
        404 -> "Nextcloud findet den WebDAV-Pfad nicht (404). Prüfe die Basisadresse und den exakten Anmeldenamen."
        else -> "Nextcloud antwortet beim $phase mit $status."
    }

    private fun nextcloudLoginResponseError(status: Int, phase: String): String = when (status) {
        401, 403 -> "Nextcloud lehnt die Browser-Anmeldung ab ($status). Prüfe die Cloud-Adresse oder lasse den Login Flow v2 auf dem Server zu."
        301, 302, 303, 307, 308 -> "Nextcloud leitet die Adresse um ($status). Trage die HTTPS-Adresse ein, die dein Browser nach dem Öffnen der Cloud zeigt."
        404 -> "Diese Nextcloud bietet den Browser-Anmeldefluss nicht an (404). Aktualisiere Nextcloud oder nutze ein App-Passwort in den erweiterten Einstellungen."
        else -> "Nextcloud antwortet beim $phase mit $status."
    }

    private fun nextcloudResponseBody(connection: HttpURLConnection, status: Int): String {
        val stream = if (status in 200..299) connection.inputStream else connection.errorStream ?: return ""
        return stream.use { input ->
            val output = ByteArrayOutputStream()
            val buffer = ByteArray(8 * 1024)
            while (true) {
                val count = input.read(buffer)
                if (count <= 0) break
                require(output.size() + count <= MAX_NEXTCLOUD_BYTES) { "Die Nextcloud-Synchronisationsdatei ist größer als 1 MiB." }
                output.write(buffer, 0, count)
            }
            output.toString(Charsets.UTF_8.name())
        }
    }

    private fun newNextcloudSnapshot(appFolder: String): JSONObject = JSONObject()
        .put("format", NEXTCLOUD_PROTOCOL)
        .put("appFolder", appFolder)
        .put("revision", 0)
        .put("modules", JSONObject())
        .put("catalog", JSONArray())
        .put("clients", JSONObject())

    private fun nextcloudBaseUrl(value: String): String {
        val raw = value.trim()
        val candidate = if (raw.isNotEmpty() && !Regex("^[A-Za-z][A-Za-z0-9+.-]*:").containsMatchIn(raw)) {
            "https://$raw"
        } else {
            raw
        }
        val url = runCatching { URL(candidate) }
            .getOrElse { throw IllegalArgumentException("Die Nextcloud-Adresse ist ungültig.") }
        require(url.protocol == "https") { "Die Nextcloud-Adresse muss HTTPS verwenden." }
        require(url.userInfo.isNullOrBlank() && url.query.isNullOrBlank() && url.ref.isNullOrBlank()) {
            "Die Nextcloud-Adresse darf keine Zugangsdaten, Suche oder Fragment enthalten."
        }
        var path = url.path.orEmpty().trimEnd('/')
        when {
            path.endsWith("/remote.php/dav", ignoreCase = true) -> path = path.dropLast("/remote.php/dav".length)
            path.contains("/remote.php/", ignoreCase = true) -> throw IllegalArgumentException("Gib die Basisadresse deiner Nextcloud ein, nicht einen WebDAV-Unterpfad.")
        }
        return buildString {
            append(url.protocol)
            append("://")
            append(url.authority)
            if (path.isNotBlank()) append(path)
        }
    }

    private fun nextcloudAppFolder(value: String?): String {
        val folder = value?.trim().takeUnless { it.isNullOrEmpty() } ?: DEFAULT_NEXTCLOUD_APP_FOLDER
        require(folder.matches(Regex("[A-Za-z0-9][A-Za-z0-9._ -]{0,63}")) && folder != "." && folder != "..") {
            "Der App-Ordner ist ungültig."
        }
        return folder
    }

    private fun nextcloudUserRootUrl(baseUrl: String, username: String): String =
        "$baseUrl/remote.php/dav/files/${Uri.encode(username)}/"

    private fun nextcloudFileUrl(baseUrl: String, username: String, appFolder: String, filename: String): String =
        "${nextcloudUserRootUrl(baseUrl, username)}${Uri.encode(appFolder)}/${Uri.encode(filename)}"

    private fun syncLegacyPlanner(context: Context, state: PlannerMobileState, connection: PlannerConnection): PlannerSyncResult {
        val response = postJson(
            context,
            connection.endpoint.trimEnd('/') + "/sync",
            JSONObject().put("snapshot", JSONObject().put("state", JSONObject(state.payload))),
            mapOf(
                "content-type" to "application/json",
                "x-zeitklar-token" to (connection.token ?: throw IllegalArgumentException("Für diesen Desktop fehlt der Zugang.")),
            ),
        )
        val snapshot = response.optJSONObject("snapshot") ?: JSONObject()
        val remote = snapshot.optJSONObject("state") ?: JSONObject(state.payload)
        return PlannerSyncResult(
            remotePayload = remote.toString(),
            desktopSyncAt = snapshot.optString("generatedAt").takeIf { it.isNotEmpty() },
        )
    }

    private fun postJson(context: Context, endpoint: String, payload: JSONObject, headers: Map<String, String>): JSONObject {
        val url = URL(endpoint)
        val localWifi = wifiForLocalEndpoint(context, url)
        val firstAttempt = openHttpConnection(localWifi, url)
        return try {
            postJson(firstAttempt, payload, headers)
        } catch (localError: Exception) {
            // A WireGuard address deliberately has no matching physical Wi-Fi
            // network and uses Android's default VPN route. For a local Wi-Fi
            // address, retrying the default route covers VPNs that explicitly
            // route that local subnet themselves.
            if (localWifi == null) throw localError
            postJson(openHttpConnection(null, url), payload, headers)
        }
    }

    private fun postJson(connection: HttpURLConnection, payload: JSONObject, headers: Map<String, String>): JSONObject {
        connection.apply {
            requestMethod = "POST"
            instanceFollowRedirects = false
            connectTimeout = 8_000
            readTimeout = 10_000
            doOutput = true
            headers.forEach { (name, value) -> setRequestProperty(name, value) }
        }
        try {
            OutputStreamWriter(connection.outputStream, Charsets.UTF_8).use { it.write(payload.toString()) }
            val stream = if (connection.responseCode in 200..299) connection.inputStream else connection.errorStream
            val body = BufferedReader(stream.reader(Charsets.UTF_8)).use { it.readText() }
            if (connection.responseCode !in 200..299) {
                val message = runCatching { JSONObject(body).optString("error") }.getOrDefault("")
                throw IllegalStateException(message.ifEmpty { "TB-Connect Desktop antwortet mit ${connection.responseCode}." })
            }
            return JSONObject(body)
        } finally {
            connection.disconnect()
        }
    }

    private fun localEndpoint(rawValue: String?): String {
        val value = rawValue?.trim().orEmpty()
        val url = runCatching { URL(value) }.getOrElse { throw IllegalArgumentException("Die Desktop-Adresse ist ungültig.") }
        require(url.protocol == "http") { "Die lokale Modul-Schnittstelle verwendet eine HTTP-Adresse im privaten Netz." }
        require(isPrivateAddress(url.host)) { "Der Kopplungscode darf nur auf eine private Netzwerkadresse zeigen." }
        return value.trimEnd('/')
    }

    /**
     * A DHCP lease can change the desktop IP while the pairing token remains valid.
     * On a failed request we therefore probe only the current /24 private network
     * without sending credentials. A candidate is used only after it identifies the
     * exact workspace created during pairing; the regular authenticated sync then
     * updates the stored endpoint.
     */
    private fun findEndpointOnCurrentWifi(context: Context, workspaceId: String, failedEndpoint: String): String? {
        val failedPort = runCatching { URL(failedEndpoint).port }.getOrDefault(-1).let { if (it in 1..65535) it else 47832 }
        val localAddress = currentWifiPrivateIpv4Address(context) ?: return null
        val octets = localAddress.address.map { it.toInt() and 0xff }
        if (octets.size != 4) return null

        val ownHost = octets[3]
        val prefix = "${octets[0]}.${octets[1]}.${octets[2]}."
        val executor = Executors.newFixedThreadPool(24)
        return try {
            val completion = ExecutorCompletionService<String?>(executor)
            val candidates = (1..254).filter { it != ownHost }.iterator()
            var inFlight = 0

            repeat(24) {
                if (candidates.hasNext()) {
                    val host = "$prefix${candidates.next()}"
                    completion.submit { healthMatchesWorkspace(context, "http://$host:$failedPort", workspaceId) }
                    inFlight += 1
                }
            }

            val deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(8)
            while (inFlight > 0 && System.nanoTime() < deadline) {
                val remaining = deadline - System.nanoTime()
                val result = completion.poll(maxOf(1, remaining), TimeUnit.NANOSECONDS)
                if (result != null) {
                    inFlight -= 1
                    result.get()?.let { return it }
                    if (candidates.hasNext()) {
                        val host = "$prefix${candidates.next()}"
                        completion.submit { healthMatchesWorkspace(context, "http://$host:$failedPort", workspaceId) }
                        inFlight += 1
                    }
                }
            }
            null
        } catch (_: Exception) {
            null
        } finally {
            executor.shutdownNow()
        }
    }

    private fun healthMatchesWorkspace(context: Context, endpoint: String, workspaceId: String): String? {
        return try {
            val url = URL("$endpoint/v1/health")
            val connection = openHttpConnection(wifiForLocalEndpoint(context, url), url).apply {
                requestMethod = "GET"
                instanceFollowRedirects = false
                connectTimeout = 550
                readTimeout = 550
            }
            try {
                if (connection.responseCode !in 200..299) return null
                val body = BufferedReader(connection.inputStream.reader(Charsets.UTF_8)).use { it.readText() }
                if (JSONObject(body).optString("workspaceId") == workspaceId) endpoint else null
            } finally {
                connection.disconnect()
            }
        } catch (_: Exception) {
            null
        }
    }

    /**
     * Android VPNs may install the default route and inadvertently capture a
     * same-WLAN desktop address. Bind only same-subnet connections to the real
     * Wi-Fi network; VPN addresses (for example WireGuard's 10.x range) retain
     * their normal VPN route.
     */
    private fun wifiForLocalEndpoint(context: Context, url: URL): Network? {
        val endpoint = runCatching { InetAddress.getByName(url.host) as? Inet4Address }.getOrNull() ?: return null
        val manager = context.getSystemService(ConnectivityManager::class.java) ?: return null
        return manager.allNetworks.firstOrNull { network ->
            val capabilities = manager.getNetworkCapabilities(network) ?: return@firstOrNull false
            capabilities.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) &&
                !capabilities.hasTransport(NetworkCapabilities.TRANSPORT_VPN) &&
                (manager.getLinkProperties(network)?.linkAddresses?.any { link ->
                    val local = link.address as? Inet4Address ?: return@any false
                    isInSameIpv4Subnet(endpoint, local, link.prefixLength)
                } == true)
        }
    }

    private fun openHttpConnection(network: Network?, url: URL): HttpURLConnection =
        ((network?.openConnection(url) ?: url.openConnection()) as? HttpURLConnection)
            ?: throw IllegalStateException("Die TB-Connect-Adresse verwendet kein HTTP.")

    private fun currentWifiPrivateIpv4Address(context: Context): Inet4Address? {
        val manager = context.getSystemService(ConnectivityManager::class.java) ?: return null
        return manager.allNetworks.asSequence()
            .filter { network ->
                val capabilities = manager.getNetworkCapabilities(network)
                capabilities?.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) == true &&
                    !capabilities.hasTransport(NetworkCapabilities.TRANSPORT_VPN)
            }
            .flatMap { network -> manager.getLinkProperties(network)?.linkAddresses?.asSequence() ?: emptySequence() }
            .mapNotNull { it.address as? Inet4Address }
            .firstOrNull { address -> isPrivateAddress(address.hostAddress) }
    }

    private fun isInSameIpv4Subnet(endpoint: Inet4Address, local: Inet4Address, prefixLength: Int): Boolean {
        if (prefixLength !in 1..32) return false
        val endpointValue = endpoint.address.fold(0L) { value, byte -> (value shl 8) or (byte.toLong() and 0xff) }
        val localValue = local.address.fold(0L) { value, byte -> (value shl 8) or (byte.toLong() and 0xff) }
        val mask = if (prefixLength == 32) 0xffffffffL else (0xffffffffL shl (32 - prefixLength)) and 0xffffffffL
        return (endpointValue and mask) == (localValue and mask)
    }

    private fun isPrivateAddress(host: String): Boolean {
        val parts = host.split('.').mapNotNull { it.toIntOrNull() }
        if (parts.size != 4 || parts.any { it !in 0..255 }) return false
        return parts[0] == 10 ||
            (parts[0] == 100 && parts[1] in 64..127) ||
            (parts[0] == 172 && parts[1] in 16..31) ||
            (parts[0] == 192 && parts[1] == 168)
    }
}
