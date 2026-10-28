package com.fsck.k9.ui.zeitklar

import assertk.assertThat
import assertk.assertions.isEqualTo
import org.junit.Test

class ManualSyncResultTest {
    @Test
    fun waitsForBothIndependentTransports() {
        val result = ManualSyncResult()
        result.put("calendar", SyncPart(SyncPartStatus.SUCCESS, "Calendar received"))
        result.put("calendar", SyncPart(SyncPartStatus.SUCCESS, "Calendar received again"))
        assertThat(result.complete).isEqualTo(false)
        result.put("desktop", SyncPart(SyncPartStatus.SUCCESS, "Desktop replied"))
        assertThat(result.complete).isEqualTo(true)
        assertThat(result.status).isEqualTo(SyncPartStatus.SUCCESS)
    }

    @Test
    fun failedReceptionCannotBeReportedAsCompleteSuccess() {
        val result = ManualSyncResult()
        result.put("calendar", SyncPart(SyncPartStatus.SUCCESS, "Google received"))
        result.put("desktop", SyncPart(SyncPartStatus.FAILED, "Desktop calendar missing"))
        assertThat(result.status).isEqualTo(SyncPartStatus.FAILED)
        assertThat(result.message.contains("Desktop calendar missing")).isEqualTo(true)
    }

    @Test
    fun noConfiguredTransportDoesNotClaimACompletedExchange() {
        val result = ManualSyncResult()
        result.put("calendar", SyncPart(SyncPartStatus.SKIPPED, "No account"))
        result.put("desktop", SyncPart(SyncPartStatus.SKIPPED, "No desktop"))
        assertThat(result.complete).isEqualTo(true)
        assertThat(result.status).isEqualTo(SyncPartStatus.SKIPPED)
    }
}
