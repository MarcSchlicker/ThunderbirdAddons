package com.fsck.k9.ui.zeitklar

import assertk.assertThat
import assertk.assertions.isEqualTo
import assertk.assertions.isFalse
import assertk.assertions.isTrue
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.runBlocking
import org.json.JSONObject
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class TbDiagnosticsTest {
    @Test
    fun onlyExplicitTestPrefixEnablesDiagnosis() {
        assertThat(TbDiagnosticsPolicy.enabled("test_diagnostics")).isTrue()
        listOf("release", "TEST_diagnostics", "snapshot", "not_test_build", "test_", "test_x/path").forEach {
            assertThat(TbDiagnosticsPolicy.enabled(it)).isFalse()
        }
    }
    @Test
    fun failedCheckDoesNotExportExceptionOrOtherSensitiveMetadata() = runBlocking {
        val secret = "private@example.invalid/token?secret=sentinel"
        val initial = TbDiagnosticReport(secret, secret, secret, secret, listOf(TbDiagnosticResult("fixture")))
        val report = TbDiagnosticsRunner.execute(initial, listOf(TbDiagnosticCheck("fixture") { error(secret) }), update = {})
        val json = report.json()
        assertThat(json.contains(secret)).isFalse()
        val decoded = JSONObject(json).getJSONArray("checks").getJSONObject(0)
        assertThat(decoded.getString("status")).isEqualTo("failed")
        assertThat(decoded.getString("code")).isEqualTo("CHECK_FAILED")
    }
    @Test
    fun timeoutCancelsCheckAndRunsItsFinallyBeforeReturning() = runBlocking {
        var cleaned = false
        val report = TbDiagnosticsRunner.execute(
            TbDiagnosticReport("2.0.41", "test_fixture", "fixture", "Android 35", listOf(TbDiagnosticResult("fixture"))),
            listOf(TbDiagnosticCheck("fixture") {
                try { delay(10_000); error("unreachable") } finally { cleaned = true }
            }), update = {}, timeoutMs = 500, dispatcher = Dispatchers.Unconfined,
        )
        assertThat(cleaned).isTrue()
        assertThat(report.checks.single().code).isEqualTo(TbDiagnosticCode.TIMEOUT)
    }
    @Test
    fun successfulAndManualChecksRemainDistinctAfterJsonRoundtrip() = runBlocking {
        val checks = listOf(
            TbDiagnosticCheck("fixture") { TbDiagnosticsRunner.result("fixture", TbDiagnosticCode.OK) },
            TbDiagnosticCheck("manual") { TbDiagnosticsRunner.result("manual", TbDiagnosticCode.MANUAL_REQUIRED) },
        )
        val report = TbDiagnosticsRunner.execute(
            TbDiagnosticReport("2.0.41", "test_fixture", "fixture", "Android 35", checks.map { TbDiagnosticResult(it.id) }),
            checks, update = {},
        )
        val decoded = JSONObject(report.json()).getJSONArray("checks")
        assertThat(decoded.getJSONObject(0).getString("status")).isEqualTo("passed")
        assertThat(decoded.getJSONObject(1).getString("status")).isEqualTo("skipped")
    }
}
