package com.fsck.k9.ui.zeitklar

import java.net.HttpURLConnection
import java.net.URL
import java.security.MessageDigest
import java.security.cert.CertificateException
import java.security.cert.CertificateFactory
import java.security.cert.X509Certificate
import java.util.Date
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertNull

class HubTlsTest {
    private val certificate = requireNotNull(javaClass.getResourceAsStream("/zeitklar/hub-test-cert.der")).use {
        CertificateFactory.getInstance("X.509").generateCertificate(it) as X509Certificate
    }
    private val fingerprint = MessageDigest.getInstance("SHA-256").digest(certificate.encoded)
        .joinToString("") { "%02x".format(it) }

    @Test
    fun productionRefusesPlaintextBeforeSendingData() {
        val connection = object : HttpURLConnection(URL("http://192.168.1.2:47832/v1/sync")) {
            override fun connect(): Unit = error("Must never connect")
            override fun disconnect() = Unit
            override fun usingProxy(): Boolean = false
        }
        assertFailsWith<IllegalArgumentException> { HubTls.configure(connection, null, allowLegacyHttp = false) }
        HubTls.configure(connection, null, allowLegacyHttp = true)
        assertFailsWith<IllegalArgumentException> {
            HubTls.configure(connection, fingerprint, allowLegacyHttp = true)
        }
        assertFailsWith<IllegalArgumentException> {
            HubTls.requireSecureEndpoint(URL("http://public.example.invalid/v1/sync"), null, allowLegacyHttp = true)
        }
    }

    @Test
    fun httpsNeedsAValidPairingFingerprintAndRejectsCredentialUrls() {
        assertFailsWith<IllegalArgumentException> {
            HubTls.requireSecureEndpoint(URL("https://192.168.1.2:47833/v1/sync"), null, false)
        }
        assertFailsWith<IllegalArgumentException> {
            HubTls.requireSecureEndpoint(URL("https://user:pass@192.168.1.2/v1/sync"), fingerprint, false)
        }
        HubTls.requireSecureEndpoint(URL("https://192.168.1.2:47833/v1/sync"), fingerprint, false)
        assertNull(HubTls.normalizeFingerprint("invalid"))
        assertEquals(fingerprint, HubTls.normalizeFingerprint(fingerprint.uppercase().chunked(2).joinToString(":")))
    }

    @Test
    fun onlyTheExactPairedLeafIsTrusted() {
        val now = { Date(certificate.notBefore.time + 1000L) }
        HubTls.trustManager(fingerprint, now).checkServerTrusted(arrayOf(certificate), "RSA")
        assertFailsWith<CertificateException> {
            HubTls.trustManager("0".repeat(64), now).checkServerTrusted(arrayOf(certificate), "RSA")
        }
        assertFailsWith<CertificateException> {
            HubTls.trustManager(fingerprint, now).checkServerTrusted(emptyArray(), "RSA")
        }
    }

    @Test
    fun expiredOrNotYetValidLeafIsRejectedEvenWhenThePinMatches() {
        for (date in listOf(Date(certificate.notBefore.time - 1000L), Date(certificate.notAfter.time + 1000L))) {
            assertFailsWith<CertificateException> {
                HubTls.trustManager(fingerprint) { date }.checkServerTrusted(arrayOf(certificate), "RSA")
            }
        }
    }
}
