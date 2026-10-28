package com.fsck.k9.ui.zeitklar

import okhttp3.Credentials
import okhttp3.OkHttpClient
import okhttp3.Request
import java.net.HttpURLConnection
import java.util.concurrent.TimeUnit

/** DAV methods unsupported by HttpURLConnection, using the project's existing HTTP library. */
internal object NextcloudDav {
    private const val CONNECT_TIMEOUT_SECONDS = 10L
    private const val CALL_TIMEOUT_SECONDS = 20L
    private const val HTTP_MULTI_STATUS = 207
    private val client by lazy {
        OkHttpClient.Builder().followRedirects(false).followSslRedirects(false)
            .connectTimeout(CONNECT_TIMEOUT_SECONDS, TimeUnit.SECONDS)
            .callTimeout(CALL_TIMEOUT_SECONDS, TimeUnit.SECONDS).build()
    }

    fun prepareFolder(root: String, folderUrl: String, username: String, password: String) {
        require(root.startsWith("https://") && folderUrl.startsWith(root))
        prepareFolder { method, folder ->
            val request = Request.Builder().url(if (folder) folderUrl else root)
                .header("Authorization", Credentials.basic(username, password, Charsets.UTF_8))
                .header("Depth", "0").method(method, null).build()
            client.newCall(request).execute().use { it.code }
        }
    }

    internal fun prepareFolder(request: (String, Boolean) -> Int) {
        checkStatus(request("PROPFIND", false), "Anmeldetest", setOf(HTTP_MULTI_STATUS))
        val created = request("MKCOL", true)
        if (created == HttpURLConnection.HTTP_BAD_METHOD) {
            checkStatus(request("PROPFIND", true), "Prüfen des App-Ordners", setOf(HTTP_MULTI_STATUS))
        } else {
            checkStatus(created, "Anlegen des App-Ordners", setOf(HttpURLConnection.HTTP_CREATED))
        }
    }

    private fun checkStatus(status: Int, phase: String, accepted: Set<Int>) {
        check(status in accepted) {
            when (status) {
                HttpURLConnection.HTTP_UNAUTHORIZED ->
                    "Nextcloud-Anmeldung abgelehnt (401). Bitte ein gültiges App-Passwort verwenden."
                HttpURLConnection.HTTP_FORBIDDEN ->
                    "Nextcloud verweigert den Zugriff beim $phase (403). Dateizugriff des App-Passworts und Ordnerrechte prüfen."
                else -> "Nextcloud: $phase fehlgeschlagen (HTTP $status)."
            }
        }
    }
}
