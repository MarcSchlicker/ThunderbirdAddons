package com.fsck.k9.ui.zeitklar

import android.Manifest
import android.app.Application
import android.content.pm.ProviderInfo
import android.provider.CalendarContract
import androidx.test.core.app.ApplicationProvider
import assertk.assertThat
import assertk.assertions.isEqualTo
import assertk.assertions.isFalse
import kotlinx.coroutines.runBlocking
import net.thunderbird.core.android.testing.RobolectricTest
import org.junit.Before
import org.junit.Test
import org.robolectric.Shadows.shadowOf
import org.robolectric.shadows.ShadowContentResolver

class TbCalendarDiagnosticsTest : RobolectricTest() {
    private val context = ApplicationProvider.getApplicationContext<Application>()
    private val provider = DeviceCalendarEditTest.FakeCalendarProvider()

    @Before
    fun setup() {
        shadowOf(context).grantPermissions(Manifest.permission.READ_CALENDAR, Manifest.permission.WRITE_CALENDAR)
        provider.attachInfo(context, ProviderInfo().apply { authority = CalendarContract.AUTHORITY })
        ShadowContentResolver.registerProviderInternal(CalendarContract.AUTHORITY, provider)
    }

    private fun report() = runBlocking {
        val runner = TbDiagnosticsRunner(context)
        runner.run(runner.initialReport()) {}
    }

    @Test
    fun hiddenWritableCalendarIsRecognizedWithoutChangingEventsOrExportingNames() {
        val report = report()
        assertThat(report.checks.single { it.id == "device-calendar-write-access" }.code)
            .isEqualTo(TbDiagnosticCode.OK)
        assertThat(report.json().contains("Hidden Google calendar")).isFalse()
        assertThat(report.json().contains("com.google")).isFalse()
        assertThat(provider.updates).isEqualTo(0)
        assertThat(provider.inserts).isEqualTo(0)
    }

    @Test
    fun readOnlyCalendarReportsTheProviderRestriction() {
        provider.writable = false
        val result = report().checks.single { it.id == "device-calendar-write-access" }
        assertThat(result.code).isEqualTo(TbDiagnosticCode.NO_WRITABLE_CALENDAR)
        assertThat(result.status).isEqualTo(TbDiagnosticStatus.FAILED)
    }

    @Test
    fun missingWritePermissionIsDistinctFromAReadOnlyCalendar() {
        shadowOf(context).denyPermissions(Manifest.permission.WRITE_CALENDAR)
        val result = report().checks.single { it.id == "device-calendar-write-access" }
        assertThat(result.code).isEqualTo(TbDiagnosticCode.NOT_GRANTED)
        assertThat(result.status).isEqualTo(TbDiagnosticStatus.SKIPPED)
    }

    @Test
    fun missingCalendarIsNotReportedAsWritable() {
        provider.hasCalendars = false
        val result = report().checks.single { it.id == "device-calendar-write-access" }
        assertThat(result.code).isEqualTo(TbDiagnosticCode.NO_CALENDARS)
        assertThat(result.status).isEqualTo(TbDiagnosticStatus.SKIPPED)
    }
}
