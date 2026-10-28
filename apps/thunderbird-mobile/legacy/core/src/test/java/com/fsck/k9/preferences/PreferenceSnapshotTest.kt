package com.fsck.k9.preferences

import assertk.assertThat
import assertk.assertions.isEqualTo
import net.thunderbird.core.android.preferences.TestStoragePersister
import net.thunderbird.core.logging.testing.TestLogger
import net.thunderbird.core.preference.DefaultPreferenceChangeBroker
import net.thunderbird.core.preference.PreferenceScope
import net.thunderbird.core.preference.interaction.DefaultInteractionSettingsPreferenceManager
import net.thunderbird.core.preference.interaction.InteractionSettingKey
import net.thunderbird.core.preference.storage.Storage
import net.thunderbird.core.preference.storage.StoragePersister
import net.thunderbird.core.preference.storage.StorageUpdater
import org.junit.Test

class PreferenceSnapshotTest {
    private val logger = TestLogger()
    private val backing = TestStoragePersister(logger)
    private val counting = CountingPersister(backing)
    private val updater = StorageUpdater { update -> update(backing.loadValues()) }

    @Test
    fun `initial settings use one database snapshot rather than one read per field`() {
        val testSubject = createManager()

        testSubject.getConfig()

        assertThat(counting.loads).isEqualTo(1)
    }

    @Test
    fun `change notification reads a fresh snapshot without caching stale settings`() {
        val testSubject = createManager()
        val updated = !testSubject.getConfig().isConfirmDelete
        backing.createStorageEditor(updater)
            .putBoolean(InteractionSettingKey.ConfirmDelete.value, updated)
            .commit()

        testSubject.receive(PreferenceScope.INTERACTION)

        assertThat(testSubject.getConfig().isConfirmDelete).isEqualTo(updated)
        assertThat(counting.loads).isEqualTo(2)
    }

    private fun createManager() = DefaultInteractionSettingsPreferenceManager(
        logger = logger,
        storagePersister = counting,
        storageEditor = backing.createStorageEditor(updater),
        preferenceChangeBroker = DefaultPreferenceChangeBroker(),
    )

    private class CountingPersister(private val delegate: StoragePersister) : StoragePersister by delegate {
        var loads = 0

        override fun loadValues(): Storage {
            loads++
            return delegate.loadValues()
        }
    }
}
