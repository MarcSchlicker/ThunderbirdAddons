package net.thunderbird.feature.calendar.internal

import android.content.Intent
import assertk.assertThat
import assertk.assertions.isEqualTo
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.test.runTest
import net.thunderbird.core.android.testing.RobolectricTest
import net.thunderbird.core.calendar.CalDavCalendar
import net.thunderbird.core.calendar.CalDavError
import net.thunderbird.core.calendar.CalDavFailure
import net.thunderbird.core.calendar.CalDavObject
import net.thunderbird.core.calendar.CalDavSession
import net.thunderbird.feature.calendar.CalendarSyncProblem
import net.thunderbird.feature.calendar.NativeCalendarSyncResult
import net.thunderbird.feature.calendar.NativeGoogleCalendar
import org.junit.Test

class NativeCalendarSyncTest : RobolectricTest() {
    private val remote = FakeSession()
    private val replica = FakeReplica()
    private val secrets = MemorySecrets().apply {
        write(
            "calendar-bindings",
            """
        [{"id":7,"email":"user@example.invalid",
        "url":"https://cloud.example.invalid/work/","name":"Work","writable":true}]
            """.trimIndent(),
        )
    }
    private val google = FakeGoogle(remote)
    private val testSubject = NativeCalendarSync(google, secrets, replica)

    @Test
    fun updateKeepsResourceIdentityAndUsesKnownServerVersion() = runTest {
        replica.event = event()
        val result = testSubject.synchronizeAll()
        assertThat(result.uploaded).isEqualTo(1)
        assertThat(remote.lastUrl).isEqualTo(EVENT)
        assertThat(remote.lastETag).isEqualTo("\"v1\"")
        assertThat(replica.acknowledged).isEqualTo(1)
    }

    @Test
    fun conflictRetainsDirtyChangeAndDoesNotApplyPartialRemoteSnapshot() = runTest {
        replica.event = event()
        remote.uploadError = CalDavFailure(CalDavError.CONFLICT, 412)
        val result = testSubject.synchronizeAll()
        assertThat(result.conflicts).isEqualTo(1)
        assertThat(result.calendarProblems).isEqualTo(mapOf(7L to CalendarSyncProblem.CONFLICT))
        assertThat(replica.acknowledged).isEqualTo(0)
        assertThat(replica.applied).isEqualTo(0)
        assertThat(replica.event?.dirty).isEqualTo(true)
    }

    @Test
    fun incompleteDownloadDoesNotTriggerLocalDeletionPass() = runTest {
        remote.readError = CalDavFailure(CalDavError.NETWORK)
        val result = testSubject.synchronizeAll()
        assertThat(result.failures).isEqualTo(1)
        assertThat(replica.applied).isEqualTo(0)
    }

    @Test
    fun problemBelongsToItsCalendarPersistsAndClearsAfterSuccessfulSync() = runTest {
        remote.readError = CalDavFailure(CalDavError.NETWORK)
        testSubject.synchronizeAll()
        val restarted = NativeCalendarSync(google, secrets, replica)
        assertThat(restarted.calendarProblems).isEqualTo(mapOf(7L to CalendarSyncProblem.CONNECTION))
        remote.readError = null
        restarted.synchronizeAll()
        assertThat(restarted.calendarProblems).isEqualTo(emptyMap())
    }

    @Test
    fun readOnlyServerDoesNotUploadQueuedLocalChanges() = runTest {
        remote.writable = false
        replica.event = event()
        val result = testSubject.synchronizeAll()
        assertThat(result.uploaded).isEqualTo(0)
        assertThat(result.failures).isEqualTo(1)
        assertThat(replica.acknowledged).isEqualTo(0)
    }

    @Test
    fun deletionWithoutETagNeverDeletesRemoteObject() = runTest {
        replica.event = event(mapOf("deleted" to "1", "sync_data1" to null))
        val result = testSubject.synchronizeAll()
        assertThat(result.failures).isEqualTo(1)
        assertThat(remote.deleted).isEqualTo(0)
        assertThat(replica.removed).isEqualTo(0)
    }

    @Test
    fun newEventIdentityIsDurableBeforeFirstNetworkWrite() = runTest {
        replica.event = event(mapOf("_sync_id" to null, "sync_data1" to null))
        remote.uploadError = CalDavFailure(CalDavError.NETWORK)
        testSubject.synchronizeAll()
        testSubject.synchronizeAll()
        assertThat(replica.prepared).isEqualTo(1)
        assertThat(remote.urls.distinct().size).isEqualTo(1)
        assertThat(replica.acknowledged).isEqualTo(0)
    }

    @Test
    fun deletedNeverUploadedEventOnlyRemovesLocalQueueEntry() = runTest {
        replica.event = event(mapOf("deleted" to "1", "_sync_id" to null))
        testSubject.synchronizeAll()
        assertThat(replica.removed).isEqualTo(1)
        assertThat(remote.deleted).isEqualTo(0)
    }

    @Test
    fun invalidCalendarIsRejectedBeforeCreatingAnyProviderCalendar() = runTest {
        remote.raw = "invalid"
        assertThat(runCatching { testSubject.activate(EMAIL, remote.calendar()) }.isFailure).isEqualTo(true)
        assertThat(replica.ensured).isEqualTo(0)
    }

    @Test
    fun cancellationRemainsCancellation() = runTest {
        remote.readError = CancellationException("test")
        assertThat(
            runCatching {
                testSubject.synchronizeAll()
            }.exceptionOrNull() is CancellationException,
        ).isEqualTo(true)
    }

    @Test
    fun repeatedActivationReusesExistingCalendarBinding() = runTest {
        testSubject.activate(EMAIL, remote.calendar())
        testSubject.activate(EMAIL, remote.calendar())
        assertThat(org.json.JSONArray(secrets.read("calendar-bindings")).length()).isEqualTo(1)
    }

    @Test
    fun activationReportsDownloadFailureWithoutPersonalData() = runTest {
        remote.readError = CalDavFailure(CalDavError.FORBIDDEN, 403)
        val error = runCatching { testSubject.activate(EMAIL, remote.calendar()) }.exceptionOrNull()
        assertThat(error?.message).isEqualTo("DOWNLOAD_FORBIDDEN_403")
        assertThat(error?.cause).isEqualTo(null)
        assertThat(replica.ensured).isEqualTo(0)
        assertThat(replica.applied).isEqualTo(0)
    }

    @Test
    fun activationReportsInvalidCalendarBeforeChangingDeviceData() = runTest {
        remote.raw = "private calendar contents that must never be exported"
        val error = runCatching { testSubject.activate(EMAIL, remote.calendar()) }.exceptionOrNull()
        assertThat(error?.message).isEqualTo("PARSE_FAILED")
        assertThat(error?.cause).isEqualTo(null)
        assertThat(replica.ensured).isEqualTo(0)
        assertThat(replica.applied).isEqualTo(0)
    }

    @Test
    fun activationPreservesCancellation() = runTest {
        remote.readError = CancellationException("private upstream text")
        val error = runCatching { testSubject.activate(EMAIL, remote.calendar()) }.exceptionOrNull()
        assertThat(error is CancellationException).isEqualTo(true)
        assertThat(replica.ensured).isEqualTo(0)
    }

    @Test
    fun devicePermissionFailureDoesNotRetainUpstreamDetails() = runTest {
        val error = runCatching {
            activationStep(CalendarActivationStage.DEVICE_CALENDAR) {
                throw SecurityException("private account and provider details")
            }
        }.exceptionOrNull()
        assertThat(error?.message).isEqualTo("DEVICE_CALENDAR_PERMISSION")
        assertThat(error?.cause).isEqualTo(null)
    }

    internal class MemorySecrets : CalendarSecretStore {
        private val values = mutableMapOf<String, String>()
        override fun read(key: String) = values[key]
        override fun write(key: String, value: String) {
            values[key] = value
        }
        override fun remove(key: String) {
            values.remove(key)
        }
    }

    private class FakeGoogle(private val remote: CalDavSession) : NativeGoogleCalendar {
        override fun authorizationIntent(email: String): Intent = error("Not used")
        override suspend fun completeAuthorization(email: String, result: Intent) = Unit
        override fun connected(email: String) = true
        override suspend fun session(email: String) = remote
        override suspend fun activate(
            email: String,
            calendar: CalDavCalendar,
        ): NativeCalendarSyncResult = error("Not used")
        override suspend fun synchronizeAll(): NativeCalendarSyncResult = error("Not used")
        override fun scheduleSync(force: Boolean) = Unit
    }

    private class FakeSession : CalDavSession {
        var writable = true
        var raw = RAW
        var uploadError: Exception? = null
        var readError: Exception? = null
        var lastUrl: String? = null
        var lastETag: String? = null
        var deleted = 0
        val urls = mutableListOf<String>()
        fun calendar() = CalDavCalendar(CALENDAR, "Work", writable)
        override suspend fun discover() = listOf(calendar())
        override suspend fun events(calendarUrl: String): List<CalDavObject> {
            readError?.let { throw it }
            return listOf(CalDavObject(EVENT, "\"v2\"", raw))
        }
        override suspend fun put(resourceUrl: String, calendarData: String, previousETag: String?): String {
            lastUrl = resourceUrl
            lastETag = previousETag
            urls += resourceUrl
            uploadError?.let { throw it }
            raw = calendarData
            return "\"v2\""
        }
        override suspend fun delete(resourceUrl: String, previousETag: String) {
            deleted++
        }
        override fun close() = Unit
    }

    private class FakeReplica : CalendarReplica {
        var event: ReplicaEvent? = null
        var ensured = 0
        var acknowledged = 0
        var applied = 0
        var removed = 0
        var prepared = 0
        override fun ensureCalendar(email: String, calendar: CalDavCalendar): Long {
            ensured++
            return 7L
        }
        override fun dirty(binding: NativeCalendarBinding) = listOfNotNull(event?.takeIf { it.dirty || it.deleted })
        override fun prepareIdentity(binding: NativeCalendarBinding, event: ReplicaEvent): ReplicaEvent {
            if (event.resourceUrl.isNotEmpty()) return event
            prepared++
            return event.copy(values = event.values + mapOf("_sync_id" to EVENT)).also { this.event = it }
        }
        override fun acknowledge(
            binding: NativeCalendarBinding,
            event: ReplicaEvent,
            eTag: String,
            rawCalendar: String,
        ) {
            acknowledged++
            this.event = event.copy(values = event.values + mapOf("dirty" to "0"))
        }
        override fun removeUploadedDeletion(
            binding: NativeCalendarBinding,
            event: ReplicaEvent,
        ) {
            removed++
            this.event =
                null
        }
        override fun applyRemote(binding: NativeCalendarBinding, objects: List<RemoteCalendarObject>) {
            applied++
        }
    }

    companion object {
        private const val EMAIL = "user@example.invalid"
        private const val CALENDAR = "https://cloud.example.invalid/work/"
        private const val EVENT = "https://cloud.example.invalid/work/a.ics"
        private val RAW = IcsEventCodecTest.calendar("DTSTART:20261023T100000Z\r\nDTEND:20261023T110000Z")
        private fun event(extra: Map<String, String?> = emptyMap()) = ReplicaEvent(
            1L,
            IcsEventCodec().decode(RAW).single().values +
                mapOf("_sync_id" to EVENT, "sync_data1" to "\"v1\"", "dirty" to "1") +
                extra,
        )
    }
}
