package com.fsck.k9.ui.zeitklar

import assertk.assertThat
import assertk.assertions.isEqualTo
import org.junit.Test

class NextcloudDavTest {
    @Test
    fun firstSyncCreatesFolderBeforeWriting() {
        val calls = mutableListOf<String>()
        val testSubject = NextcloudDav
        testSubject.prepareFolder { method, folder ->
            calls += "$method:$folder"
            if (method == "MKCOL") 201 else 207
        }
        assertThat(calls).isEqualTo(listOf("PROPFIND:false", "MKCOL:true"))
    }

    @Test
    fun existingFolderIsVerifiedInsteadOfTreatingEvery405AsSuccess() {
        val calls = mutableListOf<String>()
        NextcloudDav.prepareFolder { method, folder ->
            calls += "$method:$folder"
            if (method == "MKCOL") 405 else 207
        }
        assertThat(calls.last()).isEqualTo("PROPFIND:true")
    }

    @Test(expected = IllegalStateException::class)
    fun forbiddenFolderDoesNotBecomeAConnectedState() {
        NextcloudDav.prepareFolder { _, folder -> if (folder) 403 else 207 }
    }

    @Test(expected = IllegalStateException::class)
    fun wrongPasswordStopsBeforeFolderCreation() {
        NextcloudDav.prepareFolder { _, _ -> 401 }
    }
}
