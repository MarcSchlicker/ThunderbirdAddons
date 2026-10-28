package net.thunderbird.feature.calendar.internal

import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import net.thunderbird.core.calendar.CalDavCalendar
import net.thunderbird.core.calendar.CalDavError
import net.thunderbird.core.calendar.CalDavFailure
import net.thunderbird.core.calendar.CalDavSession
import net.thunderbird.feature.calendar.CalendarAuthFailure
import net.thunderbird.feature.calendar.CalendarSyncProblem
import net.thunderbird.feature.calendar.NativeCalendarSyncResult
import net.thunderbird.feature.calendar.NativeGoogleCalendar
import org.json.JSONArray
import org.json.JSONObject

internal class NativeCalendarSync(
    private val google: NativeGoogleCalendar,
    private val secrets: CalendarSecretStore,
    private val replica: CalendarReplica,
    private val codec: IcsEventCodec = IcsEventCodec(),
) {
    private val mutex = Mutex()

    suspend fun activate(email: String, requested: CalDavCalendar): NativeCalendarSyncResult = mutex.withLock {
        activationStep(CalendarActivationStage.SESSION) { google.session(email) }.use { session ->
            val calendar = activationStep(CalendarActivationStage.DISCOVERY) {
                session.discover().single { it.url == requested.url }
            }
            val objects = activationStep(CalendarActivationStage.DOWNLOAD) { session.events(calendar.url) }
            val remote = activationStep(CalendarActivationStage.PARSE) {
                objects.map { RemoteCalendarObject(it, codec.decode(it.calendarData)) }
            }
            val binding = activationStep(CalendarActivationStage.DEVICE_CALENDAR) {
                val id = replica.ensureCalendar(email, calendar)
                NativeCalendarBinding(id, email, calendar).also {
                    saveBindings(bindings().filterNot { old -> old.id == id } + it)
                }
            }
            activationStep(CalendarActivationStage.DEVICE_EVENTS) { replica.applyRemote(binding, remote) }
            NativeCalendarSyncResult(calendars = 1, downloaded = remote.size)
        }
    }

    suspend fun synchronizeAll(): NativeCalendarSyncResult = mutex.withLock {
        var result = NativeCalendarSyncResult()
        val currentBindings = try {
            bindings()
        } catch (_: Exception) {
            return@withLock NativeCalendarSyncResult(failures = 1)
        }
        for (binding in currentBindings) {
            try {
                val one = synchronize(binding)
                result = result.copy(
                    calendars = result.calendars + 1,
                    uploaded = result.uploaded + one.uploaded,
                    downloaded = result.downloaded + one.downloaded,
                    failures = result.failures + one.failures,
                    calendarProblems = result.calendarProblems + one.calendarProblems,
                )
            } catch (error: CancellationException) {
                throw error
            } catch (_: CalendarAuthFailure) {
                result = result.copy(
                    failures = result.failures + 1,
                    reauthorizationRequired = true,
                    calendarProblems = result.calendarProblems + (binding.id to CalendarSyncProblem.AUTHORIZATION),
                )
            } catch (error: CalDavFailure) {
                result = if (error.error == CalDavError.CONFLICT || error.error == CalDavError.NOT_FOUND) {
                    result.copy(
                        conflicts = result.conflicts + 1,
                        calendarProblems = result.calendarProblems + (binding.id to CalendarSyncProblem.CONFLICT),
                    )
                } else {
                    result.copy(
                        failures = result.failures + 1,
                        calendarProblems = result.calendarProblems + (binding.id to CalendarSyncProblem.CONNECTION),
                    )
                }
            } catch (_: Exception) {
                // Parser/provider errors can contain personal contents. Never export them or delete the local queue.
                result = result.copy(
                    failures = result.failures + 1,
                    calendarProblems = result.calendarProblems + (binding.id to CalendarSyncProblem.CONNECTION),
                )
            }
        }
        secrets.write(
            "calendar-problems",
            JSONObject().apply {
                result.calendarProblems.forEach { (id, problem) -> put(id.toString(), problem.name) }
            }.toString(),
        )
        return result
    }

    val calendarProblems: Map<Long, CalendarSyncProblem> get() = runCatching {
        val saved = JSONObject(secrets.read("calendar-problems") ?: "{}")
        saved.keys().asSequence().mapNotNull { key ->
            val id = key.toLongOrNull() ?: return@mapNotNull null
            val problem = runCatching { CalendarSyncProblem.valueOf(saved.getString(key)) }.getOrNull()
            problem?.let { id to it }
        }.toMap()
    }.getOrDefault(emptyMap())

    private suspend fun synchronize(binding: NativeCalendarBinding): NativeCalendarSyncResult =
        google.session(binding.email).use { session ->
            val calendars = session.discover()
            recordDiscovery(binding, calendars)
            val calendar = calendars.firstOrNull { it.url == binding.calendar.url }
                ?: throw CalDavFailure(CalDavError.NOT_FOUND)
            check(replica.ensureCalendar(binding.email, calendar) == binding.id)
            val current = binding.copy(calendar = calendar)
            var uploaded = 0
            val uploadOrder = compareBy<ReplicaEvent> { it.values["original_id"] != null }.thenBy { it.id }
            val dirty = replica.dirty(current).sortedWith(uploadOrder)
            if (calendar.writable) {
                for (event in dirty) uploaded += upload(session, current, event)
            }
            val remote = readRemote(session, calendar.url)
            replica.applyRemote(current, remote)
            NativeCalendarSyncResult(
                calendars = 1,
                uploaded = uploaded,
                downloaded = remote.size,
                failures = if (!calendar.writable && dirty.isNotEmpty()) 1 else 0,
                calendarProblems = if (!calendar.writable && dirty.isNotEmpty()) {
                    mapOf(binding.id to CalendarSyncProblem.READ_ONLY)
                } else {
                    emptyMap()
                },
            )
        }

    private suspend fun upload(
        session: CalDavSession,
        binding: NativeCalendarBinding,
        original: ReplicaEvent,
    ): Int {
        if (original.deleted && original.resourceUrl.isBlank() && original.values["original_id"] == null) {
            replica.removeUploadedDeletion(binding, original)
            return 0
        }
        val event = replica.prepareIdentity(binding, original)
        if (event != null) {
            if (event.deleted && event.values["original_id"] == null) {
                val editedOccurrence = replica.dirty(binding).any {
                    it.values["original_id"] == event.id.toString() && !it.deleted
                }
                if (editedOccurrence) throw CalDavFailure(CalDavError.CONFLICT)
                // An unknown ETag must never turn into an unconditional remote deletion.
                session.delete(event.resourceUrl, requireNotNull(event.eTag))
                replica.removeUploadedDeletion(binding, event)
            } else {
                val data = codec.encode(event)
                val tag = session.put(event.resourceUrl, data, event.eTag)
                replica.acknowledge(binding, event, tag, data)
            }
        }
        return if (event != null) 1 else 0
    }

    private suspend fun readRemote(session: CalDavSession, url: String): List<RemoteCalendarObject> =
        session.events(url).map { RemoteCalendarObject(it, codec.decode(it.calendarData)) }

    fun acknowledgeCalendarList(email: String, calendars: List<CalDavCalendar>) {
        secrets.write("calendar-list:$email", JSONArray(calendars.map { it.url }).toString())
        secrets.remove("calendar-change:$email")
    }

    private fun recordDiscovery(binding: NativeCalendarBinding, calendars: List<CalDavCalendar>) {
        val seen = secrets.read("calendar-list:${binding.email}")?.let(::JSONArray) ?: return
        val known = (0 until seen.length()).map { seen.getString(it) }.toSet()
        val urls = calendars.map { it.url }.toSet()
        if (urls.any { it !in known } || (binding.calendar.url in known && binding.calendar.url !in urls)) {
            secrets.write("calendar-change:${binding.email}", "true")
        }
    }

    val activeCalendars: Map<String, Set<String>> get() = bindings()
        .groupBy { it.email.lowercase() }.mapValues { (_, values) -> values.map { it.calendar.url }.toSet() }

    private fun bindings(): List<NativeCalendarBinding> {
        val values = JSONArray(secrets.read(BINDINGS) ?: "[]")
        return (0 until values.length()).map { index ->
            val value = values.getJSONObject(index)
            NativeCalendarBinding(
                value.getLong("id"),
                value.getString("email"),
                CalDavCalendar(
                    value.getString("url"),
                    value.getString("name"),
                    value.getBoolean("writable"),
                ),
            )
        }
    }

    private fun saveBindings(values: List<NativeCalendarBinding>) {
        val array = JSONArray()
        values.forEach { binding ->
            val value = JSONObject().apply {
                put("id", binding.id)
                put("email", binding.email)
                put("url", binding.calendar.url)
                put("name", binding.calendar.displayName)
                put("writable", binding.calendar.writable)
            }
            array.put(value)
        }
        secrets.write(BINDINGS, array.toString())
    }

    companion object {
        private const val BINDINGS = "calendar-bindings"
    }
}
