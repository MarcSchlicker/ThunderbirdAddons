package com.fsck.k9.ui.zeitklar

import java.net.HttpURLConnection
import java.net.URL
import java.security.MessageDigest
import java.security.cert.CertificateException
import java.security.cert.X509Certificate
import java.util.Date
import javax.net.ssl.HttpsURLConnection
import javax.net.ssl.SSLContext
import javax.net.ssl.X509TrustManager

/** Trust is bound to the certificate delivered by the visible desktop pairing code, never to arbitrary LAN peers. */
internal object HubTls {
    fun normalizeFingerprint(value: String?): String? = value?.replace(":", "")?.lowercase()
        ?.takeIf { it.matches(Regex("[0-9a-f]{64}")) }

    fun requireSecureEndpoint(url: URL, fingerprint: String?, allowLegacyHttp: Boolean) {
        require(url.userInfo == null && url.ref == null && url.query == null) { "Ungültige Hub-Adresse." }
        if (url.protocol == "https") {
            require(normalizeFingerprint(fingerprint) != null) {
                "Der Zertifikat-Fingerabdruck fehlt. Bitte den Desktop-Zugang bestätigen."
            }
        } else {
            require(url.protocol == "http" && allowLegacyHttp && fingerprint.isNullOrBlank()) {
                "Diese App benötigt eine verschlüsselte Desktop-Verbindung (HTTPS)."
            }
            val parts = url.host.split('.').mapNotNull(String::toIntOrNull)
            val privateAddress = parts.size == 4 && parts.all { it in 0..255 } &&
                (parts[0] == 10 || parts[0] == 127 || parts[0] == 192 && parts[1] == 168 ||
                    parts[0] == 172 && parts[1] in 16..31)
            require(privateAddress || url.host == "localhost") { "Unverschlüsselter Testzugang nur im privaten Netz." }
        }
    }

    fun configure(connection: HttpURLConnection, fingerprint: String?, allowLegacyHttp: Boolean): HttpURLConnection {
        requireSecureEndpoint(connection.url, fingerprint, allowLegacyHttp)
        if (connection is HttpsURLConnection) {
            val manager = trustManager(requireNotNull(normalizeFingerprint(fingerprint)))
            val context = SSLContext.getInstance("TLS").apply { init(null, arrayOf(manager), null) }
            connection.sslSocketFactory = context.socketFactory
            // A DHCP change must not replace identity: the exact paired leaf is the authority.
            connection.hostnameVerifier = javax.net.ssl.HostnameVerifier { _, session ->
                runCatching {
                    val certificates = session.peerCertificates.map { it as X509Certificate }.toTypedArray()
                    manager.checkServerTrusted(certificates, "RSA")
                    true
                }.getOrDefault(false)
            }
        }
        return connection
    }

    internal fun trustManager(fingerprint: String, now: () -> Date = ::Date): X509TrustManager {
        val normalized = requireNotNull(normalizeFingerprint(fingerprint))
        val expected = normalized.chunked(2).map { it.toInt(16).toByte() }.toByteArray()
        return object : X509TrustManager {
            override fun getAcceptedIssuers(): Array<X509Certificate> = emptyArray()

            override fun checkClientTrusted(chain: Array<out X509Certificate>?, authType: String?) {
                throw CertificateException("Client authentication is not supported")
            }

            override fun checkServerTrusted(chain: Array<out X509Certificate>?, authType: String?) {
                val certificate = chain?.firstOrNull() ?: throw CertificateException("Missing hub certificate")
                certificate.checkValidity(now())
                val actual = MessageDigest.getInstance("SHA-256").digest(certificate.encoded)
                if (!MessageDigest.isEqual(expected, actual)) throw CertificateException("Hub certificate mismatch")
            }
        }
    }
}
