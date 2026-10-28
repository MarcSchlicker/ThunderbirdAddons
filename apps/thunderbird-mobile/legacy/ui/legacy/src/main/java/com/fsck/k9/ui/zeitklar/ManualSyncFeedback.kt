package com.fsck.k9.ui.zeitklar

import android.widget.Toast
import androidx.fragment.app.FragmentActivity
import androidx.lifecycle.Lifecycle
import com.fsck.k9.ui.R
import com.google.android.material.dialog.MaterialAlertDialogBuilder

internal enum class SyncPartStatus { SUCCESS, FAILED, SKIPPED }
internal data class SyncPart(val status: SyncPartStatus, val message: String)
internal class ManualSyncResult {
    private val parts = linkedMapOf<String, SyncPart>()
    fun put(key: String, part: SyncPart) { parts[key] = part }
    val complete get() = parts.keys.containsAll(listOf("calendar", "desktop"))
    val status get() = when {
        parts.values.any { it.status == SyncPartStatus.FAILED } -> SyncPartStatus.FAILED
        parts.values.any { it.status == SyncPartStatus.SUCCESS } -> SyncPartStatus.SUCCESS
        else -> SyncPartStatus.SKIPPED
    }
    val message get() = parts.values.joinToString("\n\n") { it.message }
}

/** One explicit run, with honest partial/no-account results instead of a successful local refresh. */
internal class ManualSyncFeedback(private val host: FragmentActivity, private val onProblems: () -> Unit) {
    private var run: ManualSyncResult? = null
    private var pending: ManualSyncResult? = null
    private var dialog: androidx.appcompat.app.AlertDialog? = null

    fun begin(): Boolean {
        if (run != null) return false
        run = ManualSyncResult()
        Toast.makeText(host, R.string.tb_sync_started, Toast.LENGTH_SHORT).show()
        return true
    }

    fun finish(key: String, part: SyncPart) {
        val current = run ?: return
        current.put(key, part)
        if (!current.complete) return
        run = null
        pending = current
        showPending()
    }

    fun showPending() {
        if (!host.lifecycle.currentState.isAtLeast(Lifecycle.State.RESUMED) ||
            host.isFinishing || host.isDestroyed) return
        val result = pending ?: return
        pending = null
        dialog?.dismiss()
        val title = when (result.status) {
            SyncPartStatus.SUCCESS -> R.string.tb_sync_finished
            SyncPartStatus.FAILED -> R.string.tb_sync_incomplete
            SyncPartStatus.SKIPPED -> R.string.tb_sync_no_connection
        }
        val builder = MaterialAlertDialogBuilder(host).setTitle(title).setMessage(result.message)
            .setPositiveButton(android.R.string.ok, null)
        if (result.status == SyncPartStatus.FAILED) {
            builder.setNeutralButton(R.string.tb_sync_show_problems) { _, _ -> onProblems() }
        }
        dialog = builder.show()
    }

    fun close() { dialog?.dismiss(); dialog = null }
}
