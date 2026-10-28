package net.thunderbird.feature.calendar.internal

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec
import org.json.JSONObject

internal interface CalendarSecretStore {
    fun keys(): Set<String> = emptySet()
    fun read(key: String): String?
    fun write(key: String, value: String)
    fun remove(key: String)
}

/** Uses the same Android Keystore AES-GCM storage model as the existing paired-module store. */
internal class AndroidCalendarSecretStore(context: Context) : CalendarSecretStore {
    private val preferences = context.getSharedPreferences("tb_native_calendar", Context.MODE_PRIVATE)

    @Synchronized
    override fun keys(): Set<String> = readAll().keys().asSequence().toSet()

    @Synchronized
    override fun read(key: String): String? = readAll().optString(key).takeIf { it.isNotEmpty() }

    @Synchronized
    override fun write(key: String, value: String) = save(readAll().put(key, value))

    @Synchronized
    override fun remove(key: String) {
        val values = readAll()
        values.remove(key)
        save(values)
    }

    private fun readAll(): JSONObject {
        val data = preferences.getString("sealed", null) ?: return JSONObject()
        val parts = data.split('.')
        check(parts.size == 2)
        val cipher = Cipher.getInstance(TRANSFORMATION)
        cipher.init(Cipher.DECRYPT_MODE, encryptionKey(), GCMParameterSpec(TAG_BITS, decode(parts[0])))
        return JSONObject(String(cipher.doFinal(decode(parts[1])), Charsets.UTF_8))
    }

    private fun save(values: JSONObject) {
        val cipher = Cipher.getInstance(TRANSFORMATION)
        cipher.init(Cipher.ENCRYPT_MODE, encryptionKey())
        val sealed = encode(cipher.iv) + "." + encode(cipher.doFinal(values.toString().toByteArray(Charsets.UTF_8)))
        check(preferences.edit().putString("sealed", sealed).commit())
    }

    private fun encryptionKey(): SecretKey {
        val store = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        (store.getKey(KEY_ALIAS, null) as? SecretKey)?.let { return it }
        return KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore").run {
            init(
                KeyGenParameterSpec.Builder(KEY_ALIAS, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
                    .setBlockModes(
                        KeyProperties.BLOCK_MODE_GCM,
                    ).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                    .setRandomizedEncryptionRequired(true).build(),
            )
            generateKey()
        }
    }

    companion object {
        private const val TRANSFORMATION = "AES/GCM/NoPadding"
        private const val KEY_ALIAS = "tb_native_calendar_session_v1"
        private const val TAG_BITS = 128
        private fun encode(value: ByteArray) = Base64.encodeToString(value, Base64.NO_WRAP)
        private fun decode(value: String) = Base64.decode(value, Base64.NO_WRAP)
    }
}
