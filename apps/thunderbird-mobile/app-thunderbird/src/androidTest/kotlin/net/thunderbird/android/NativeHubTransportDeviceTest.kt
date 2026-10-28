package net.thunderbird.android

import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import com.fsck.k9.ui.zeitklar.PlannerConnection
import com.fsck.k9.ui.zeitklar.PlannerMobileState
import com.fsck.k9.ui.zeitklar.PlannerSyncClient
import java.time.Instant
import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Assume.assumeTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith

/** Opt-in synthetic cross-process test against the isolated Thunderbird fixture; never reads mail or calendars. */
@RunWith(AndroidJUnit4::class)
class NativeHubTransportDeviceTest {
    private lateinit var connection: PlannerConnection

    @Before
    fun requireSyntheticFixture() {
        val arguments = InstrumentationRegistry.getArguments()
        val port = arguments.getString("hubPort")?.toIntOrNull()
        val fingerprint = arguments.getString("hubFingerprint")
        assumeTrue(port != null && fingerprint?.matches(Regex("[a-f0-9]{64}")) == true)
        connection = PlannerConnection(
            id = "synthetic-hub",
            name = "Synthetic TLS fixture",
            endpoint = "https://10.0.2.2:$port",
            token = "synthetic-token",
            mode = PlannerConnection.Mode.MODULE_BRIDGE,
            workspaceId = "synthetic-workspace",
            tlsFingerprint = fingerprint,
        )
    }

    @Test
    fun sendsSyntheticTaskAndReceivesTheMergedStateViaNativeTls() {
        val now = Instant.now().toString()
        val task = JSONObject().put("id", "synthetic-android-tls-task").put("text", "Synthetic Android TLS task")
            .put("createdAt", now).put("updatedAt", now).put("done", false).put("emailAddress", "")
        val state = JSONObject().put("version", 1).put("updatedAt", now).put("tasks", JSONArray().put(task))
            .put("emails", JSONArray()).put("deletedTaskIds", JSONArray()).put("settings", JSONObject())
        val result = PlannerSyncClient.sync(
            InstrumentationRegistry.getInstrumentation().targetContext,
            PlannerMobileState("synthetic-android", state.toString(), listOf(connection)),
            connection,
        )
        assertTrue(result.remotePayload.contains("synthetic-android-tls-task"))
        assertTrue(result.remotePayload.contains("synthetic-desktop-tls-task"))
    }

    @Test
    fun aDifferentCertificateIsRejectedByTheRealAndroidTlsStack() {
        try {
            PlannerSyncClient.sync(
                InstrumentationRegistry.getInstrumentation().targetContext,
                PlannerMobileState("synthetic-android", "{\"version\":1,\"tasks\":[]}", emptyList()),
                connection.copy(tlsFingerprint = "0".repeat(64), workspaceId = null),
            )
            fail("Wrong certificate was accepted")
        } catch (expected: javax.net.ssl.SSLException) {
            assertTrue(expected.message.orEmpty().isNotEmpty())
        }
    }
}
