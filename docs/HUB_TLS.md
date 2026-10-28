# Verschlüsselte Desktop-Verbindung

Ab Modul-Hub 2.0.30 und App 2.0.61 verwendet die mobile Verbindung HTTPS mit TLS 1.2 oder 1.3. Der TCP-Transport stammt aus Thunderbirds NSS (`nsITLSServerSocket`), nicht aus einer JavaScript-TLS-Implementierung.

## Vertrauen und Speicherung

Der Hub erzeugt einmal je Thunderbird-Profil ein eigenes RSA-3072-Schlüsselpaar und ein selbst signiertes Serverzertifikat. Die native WebCrypto-API erzeugt den Schlüssel. Das unveränderte node-forge 1.4.2 kodiert X.509/PKCS12; Originalquellen und Lizenz liegen unter third_party/node-forge-1.4.2. Das passwortgeschützte Importpaket wird nur vorübergehend im Profil angelegt und anschließend entfernt. Der private Schlüssel bleibt in Thunderbirds NSS-Schlüsselspeicher; vorhandene Zertifikats-/CA-Vertrauensregeln werden nicht erweitert. Der Schutz dieses Speichers hängt auch vom Profilzugriff und einem eventuell eingerichteten Hauptpasswort ab.

Eine öffentliche Metadatendatei im Profil enthält Zertifikatskennung und SHA-256-Fingerabdruck. Neustarts verwenden dieselbe Identität. Fehlende oder abgelaufene Identitäten werden nicht still ersetzt. Das Zertifikat ist fünf Jahre gültig; eine Erneuerung verlangt eine bewusste neue Gerätefreigabe.

Der sichtbare Kopplungscode enthält HTTPS-Adresse und Zertifikatsfingerabdruck. Die App speichert den Fingerabdruck zusammen mit der vorhandenen geschützten Verbindung. Sie prüft den exakten Server-Zertifikatshash und die Zertifikatsgültigkeit, bevor sie Daten sendet. Ein anderer oder abgelaufener Schlüssel wird abgewiesen. Ein IP-Wechsel ersetzt die Serveridentität nicht. Es gibt keinen Trust-all-Manager und keinen Klartext-Fallback für eine bereits an ein Zertifikat gebundene Verbindung.

## Ports und bestehende Installationen

Bei Standardkonfiguration ist HTTP 47832 ausschließlich an die Loopback-Adresse gebunden; die lokalen Desktopmodule nutzen diese Schnittstelle weiterhin auf demselben PC. Mobilgeräte verwenden TLS 47833. Bei einem selbst gewählten Basisport liegt TLS am folgenden Port. TLS-Startfehler sperren die mobile Verbindung und erscheinen im Hub; sie öffnen keinen unverschlüsselten Netzwerkersatz. Gleichzeitige Starts sind serialisiert; Deaktivieren während der Zertifikatserstellung darf keinen Listener nachträglich öffnen.

Die neue Produktions-App hat eine eigene Paketkennung. Die bisherige Test-App und ihre Daten werden nicht deinstalliert oder automatisch migriert. Bestehende alte HTTP-Kopplungen erhalten nicht ungeprüft ein neues Zertifikatsvertrauen. Für den neuen Hub und die neue App ist einmal eine sichtbare TLS-Gerätefreigabe nötig. Die reale QR-/POCO-Abnahme ist für diesen Release weiterhin ausgesetzt; es wurde keine neue Nutzerkopplung durchgeführt. Passwörter und Google-Sitzungen vom Desktop werden nicht auf Android kopiert.

## Wiederholbare Prüfung ohne persönliche Konten

```powershell
node --test addons/mobile-module-bridge/tests/secure-transport.test.cjs
./addons/mobile-module-bridge/tests/native-tls-smoke.ps1
```

Der zweite Befehl startet eine vorhandene Thunderbird-Installation mit einem neuen, getrennten Profil, künstlichem Workspace und Testzertifikat im Hintergrund. Er prüft echte TLS-1.2-/1.3-Verbindungen sowie einen falschen Fingerabdruck und beendet ausschließlich diesen Testprozess. Das persönliche Thunderbird-Profil wird nicht geöffnet oder verändert. `build/native-tls-smoke.json` enthält nur synthetische Prüfergebnisse; temporäre Profile und lokale Fixture-Metadaten bleiben außerhalb der Veröffentlichung.

Mit `-KeepRunning` bleibt der synthetische Server für den Android-Gerätetest aktiv. Die zusätzliche lokale `.fixture.json` enthält Prozess und Profilpfad und ist kein öffentlicher Diagnoseanhang. Den Prozess anschließend nur nach Abgleich von PID und Profilargument beenden.

Der Android-Test `NativeHubTransportDeviceTest` verwendet ein frisches Emulatorprofil, die bekannten künstlichen Fixture-Werte und die Parameter hubPort/hubFingerprint. Er sendet eine künstliche Aufgabe, empfängt die vorbereitete Desktop-Aufgabe und prüft die Ablehnung eines falschen Zertifikats. Er liest keine echten Mails oder Kalender. Dieser Nachweis ersetzt keine reale Google-/Nextcloud-/POCO-Abnahme.

Der native TLS-Nachweis wurde mit Thunderbird153.5.1 unter Windows ausgeführt. Das prüft den Transport auf dieser Version; daraus folgt keine vollständige manuelle Prüfung aller vier Erweiterungen oder aller Versionen ab128.
