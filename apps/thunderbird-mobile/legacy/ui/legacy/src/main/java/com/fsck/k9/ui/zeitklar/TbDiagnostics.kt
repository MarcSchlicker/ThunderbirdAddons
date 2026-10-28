package com.fsck.k9.ui.zeitklar

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.os.Build
import androidx.core.content.ContextCompat
import com.fsck.k9.ui.BuildConfig
import java.io.File
import java.time.Instant
import java.util.UUID
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.TimeoutCancellationException
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.ensureActive
import kotlinx.coroutines.runInterruptible
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeout
import org.json.JSONArray
import org.json.JSONObject

internal object TbDiagnosticsPolicy {
    fun enabled(releaseName: String): Boolean = releaseName.matches(Regex("test_[A-Za-z0-9._-]{1,64}"))
    fun safeVersion(value: String): String =
        value.takeIf { it.matches(Regex("[0-9][A-Za-z0-9.+_-]{0,63}")) } ?: "unknown"
}

internal enum class TbDiagnosticStatus { PASSED, FAILED, SKIPPED }
internal enum class TbDiagnosticCode {
    OK, NOT_RUN, CHECK_FAILED, TIMEOUT, CANCELED, NOT_GRANTED, NETWORK_UNAVAILABLE, MANUAL_REQUIRED,
    NO_CALENDARS, NO_WRITABLE_CALENDAR,
}
internal data class TbDiagnosticResult(
    val id: String,
    val status: TbDiagnosticStatus = TbDiagnosticStatus.SKIPPED,
    val code: TbDiagnosticCode = TbDiagnosticCode.NOT_RUN,
    val durationMs: Long = 0,
)
internal data class TbDiagnosticReport(
    val version: String,
    val releaseName: String,
    val build: String,
    val platform: String,
    val checks: List<TbDiagnosticResult>,
    val runId: String = UUID.randomUUID().toString(),
    val startedAt: String = Instant.now().toString(),
    val finishedAt: String? = null,
    val canceled: Boolean = false,
) {
    fun json(): String = JSONObject().apply {
        put("schemaVersion", 1)
        put("runId", runId)
        put("startedAt", startedAt)
        put("finishedAt", finishedAt ?: JSONObject.NULL)
        put("app", "tb-connect-android")
        put("version", TbDiagnosticsPolicy.safeVersion(version))
        put("releaseName", releaseName.takeIf(TbDiagnosticsPolicy::enabled) ?: "release")
        put("build", build.takeIf { it.matches(Regex("[A-Za-z0-9._-]{1,64}")) } ?: "local")
        put("platform", platform.takeIf { it.matches(Regex("Android [0-9]{1,3}")) } ?: "Android")
        put("trigger", "button")
        put("canceled", canceled)
        put("checks", JSONArray().apply {
            checks.forEach { check ->
                put(JSONObject().apply {
                    put("id", check.id.takeIf { it.matches(Regex("[a-z0-9-]{1,80}")) } ?: "unknown-check")
                    put("status", check.status.name.lowercase())
                    put("code", check.code.name)
                    put("durationMs", check.durationMs)
                })
            }
        })
    }.toString(2)
}
internal data class TbDiagnosticCheck(val id: String, val run: suspend () -> TbDiagnosticResult)

internal class TbDiagnosticsRunner(private val context: Context) {
    fun initialReport(): TbDiagnosticReport {
        val info = context.packageManager.getPackageInfo(context.packageName, 0)
        return TbDiagnosticReport(
            version = info.versionName.orEmpty(), releaseName = BuildConfig.TB_RELEASE_NAME,
            build = BuildConfig.TB_BUILD_ID, platform = "Android ${Build.VERSION.SDK_INT}",
            checks = checks().map { TbDiagnosticResult(it.id) },
        )
    }

    suspend fun run(initial: TbDiagnosticReport, update: (TbDiagnosticReport) -> Unit): TbDiagnosticReport =
        execute(initial, checks(), update)

    private fun checks(): List<TbDiagnosticCheck> = listOf(
        check("build-metadata") { TbDiagnosticsPolicy.enabled(BuildConfig.TB_RELEASE_NAME) },
        check("required-modules") {
            listOf(CalendarModuleActivity::class.java, ModuleConnectionsActivity::class.java,
                DailyPlannerActivity::class.java, ZeitklarModuleCatalogActivity::class.java).all {
                context.packageManager.getActivityInfo(android.content.ComponentName(context, it), 0)
                true
            }
        },
        TbDiagnosticCheck("calendar-permission") {
            val granted = ContextCompat.checkSelfPermission(context, Manifest.permission.READ_CALENDAR) ==
                PackageManager.PERMISSION_GRANTED
            result("calendar-permission", if (granted) TbDiagnosticCode.OK else TbDiagnosticCode.NOT_GRANTED)
        },
        TbDiagnosticCheck("device-calendar-write-access") {
            val readGranted = DeviceCalendarStore.hasReadAccess(context)
            val writeGranted = ContextCompat.checkSelfPermission(context, Manifest.permission.WRITE_CALENDAR) ==
                PackageManager.PERMISSION_GRANTED
            val code = if (!readGranted || !writeGranted) {
                TbDiagnosticCode.NOT_GRANTED
            } else {
                val calendars = DeviceCalendarStore.calendars(context, includeHidden = true)
                when {
                    calendars.isEmpty() -> TbDiagnosticCode.NO_CALENDARS
                    calendars.any { it.writable } -> TbDiagnosticCode.OK
                    else -> TbDiagnosticCode.NO_WRITABLE_CALENDAR
                }
            }
            result("device-calendar-write-access", code)
        },
        TbDiagnosticCheck("network-state") {
            val manager = context.getSystemService(ConnectivityManager::class.java)
            val capabilities = manager.getNetworkCapabilities(manager.activeNetwork)
            val validated = capabilities?.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED) == true
            result("network-state", if (validated) TbDiagnosticCode.OK else TbDiagnosticCode.NETWORK_UNAVAILABLE)
        },
        check("storage-roundtrip") {
            runInterruptible(Dispatchers.IO) {
                val probe = File.createTempFile("tb-diagnostics-", ".tmp", context.cacheDir)
                try {
                    val expected = ByteArray(128) { it.toByte() }
                    probe.writeBytes(expected)
                    probe.readBytes().contentEquals(expected)
                } finally { require(probe.delete()) }
            }
        },
        check("calendar-time-layout") {
            CalendarMonthGrid.timeWindow(PROBE_START, PROBE_END, 0, NOON) == (PROBE_START to NOON) &&
                CalendarMonthGrid.timeWindow(PROBE_START, PROBE_END, NOON, DAY_END) == (NOON to PROBE_END) &&
                CalendarMonthGrid.swipeStep(PROBE_SWIPE_DISTANCE, 0f, PROBE_SWIPE_THRESHOLD) == 1
        },
        TbDiagnosticCheck("nextcloud-real-sync") { result("nextcloud-real-sync", TbDiagnosticCode.MANUAL_REQUIRED) },
        TbDiagnosticCheck("google-calendar-write") {
            result("google-calendar-write", TbDiagnosticCode.MANUAL_REQUIRED)
        },
    )

    suspend fun save(report: TbDiagnosticReport) = withContext(Dispatchers.IO) {
        val directory = File(context.filesDir, "tb-diagnostics")
        check(directory.isDirectory || directory.mkdirs())
        File(directory, "${report.runId}.json").writeText(report.json())
        directory.listFiles()?.filter { it.name.matches(Regex("[a-f0-9-]{36}\\.json")) }
            ?.sortedByDescending(File::lastModified)?.drop(HISTORY_LIMIT)?.forEach { it.delete() }
    }

    private fun check(id: String, run: suspend () -> Boolean) = TbDiagnosticCheck(id) {
        result(id, if (run()) TbDiagnosticCode.OK else TbDiagnosticCode.CHECK_FAILED)
    }

    companion object {
        // Synthetic event crossing noon (11:30–12:30), measured in minutes.
        private const val PROBE_START = 690
        private const val PROBE_END = 750
        private const val NOON = 720
        private const val DAY_END = 1440
        private const val PROBE_SWIPE_DISTANCE = -100f
        private const val PROBE_SWIPE_THRESHOLD = 24f
        private const val HISTORY_LIMIT = 10
        private const val CHECK_TIMEOUT_MS = 5_000L
        fun result(id: String, code: TbDiagnosticCode): TbDiagnosticResult = TbDiagnosticResult(
            id, when (code) {
                TbDiagnosticCode.OK -> TbDiagnosticStatus.PASSED
                TbDiagnosticCode.NOT_GRANTED, TbDiagnosticCode.MANUAL_REQUIRED,
                TbDiagnosticCode.CANCELED, TbDiagnosticCode.NOT_RUN, TbDiagnosticCode.NO_CALENDARS -> TbDiagnosticStatus.SKIPPED
                else -> TbDiagnosticStatus.FAILED
            }, code,
        )
        suspend fun execute(
            initial: TbDiagnosticReport,
            checks: List<TbDiagnosticCheck>,
            update: (TbDiagnosticReport) -> Unit,
            timeoutMs: Long = CHECK_TIMEOUT_MS,
            dispatcher: CoroutineDispatcher = Dispatchers.Default,
        ): TbDiagnosticReport {
            var report = initial
            update(report)
            for ((index, check) in checks.withIndex()) {
                currentCoroutineContext().ensureActive()
                val started = System.nanoTime()
                val result = try {
                    withTimeout(timeoutMs) { withContext(dispatcher) { check.run() } }
                } catch (_: TimeoutCancellationException) {
                    result(check.id, TbDiagnosticCode.TIMEOUT)
                } catch (error: CancellationException) {
                    throw error
                } catch (_: Exception) {
                    result(check.id, TbDiagnosticCode.CHECK_FAILED)
                }
                val results = report.checks.toMutableList()
                results[index] = result.copy(durationMs = (System.nanoTime() - started) / 1_000_000)
                report = report.copy(checks = results)
                update(report)
            }
            return report.copy(finishedAt = Instant.now().toString()).also(update)
        }
    }
}
