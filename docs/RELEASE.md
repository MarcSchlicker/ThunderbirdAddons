# Gemeinsamer Release-Kandidat · 28. Oktober 2026

Status: **Entwurf, noch keine stabile öffentliche Binärfreigabe.** App und vier Desktop-Erweiterungen gehören zum gemeinsamen Satz. Die App ist nun ein eigener signierter, optimierter Produktionskandidat; fehlende Anbieter-/Nutzerabnahmen werden dadurch nicht ersetzt.

| Komponente | Stand | Lizenz |
| --- | --- | --- |
| Kalender Raster | 1.4.19 | MPL 2.0 |
| Tagesplaner | 2.0.9 | MPL 2.0 |
| Mail-Ablage | 1.4.2 | MPL 2.0 |
| Modul-Hub | 2.0.30 | MPL 2.0; QR-MIT und node-forge-BSD separat |
| Android-App | 2.0.61 / Code 62 | Apache 2.0; Fremdlizenzen erhalten |

## Neu fertiggestellt

- Eigene Produktionskennung eu.mschlicker.tbconnect und eigener dauerhafter Signierschlüssel; die bisherige Testinstallation bleibt getrennt erhalten.
- Normaler Release-Name mit deaktivierter Testdiagnose, DEBUG=false und R8-Optimierung. Produktions-HTTP gesperrt.
- Produktion verwendet nur konfigurierte eigene Mail-OAuth-Clients; vorhandene Debug-Zugänge bleiben erhalten.
- Natives Hub-HTTPS mit TLS 1.2/1.3 und exakter Zertifikatbindung auf Android. HTTP-Desktopadapter nur noch auf Loopback. Start-/Abbruchrennen abgesichert.
- Eigene Kennzeichnung des Begrüßungsbildschirms statt falscher Produktzugehörigkeit; ursprüngliche Urheberhinweise bleiben in Quellen und Lizenzanzeige erhalten.
- Optionales Kamera-Hardwaremerkmal, damit Installation keine zwingende Kamera voraussetzt.
- Wiederholbare synthetische native Thunderbird-TLS-Prüfung sowie Android-Emulatorprüfung mit künstlichen Aufgaben.

Die bereits enthaltenen Kalender-/Planerverbesserungen bleiben erhalten: vollständiger Tagesplan, gezielte Kalenderwarnungen, explizites Senden/Empfangen, vorgemerkte Desktop-Mails sowie Schutz lokaler Änderungen vor verspäteten Syncantworten.

## Prüfstand

Am neuen Stand bestanden 114 ausgewählte Android-JVM-Tests (36 Legacy-Ansicht/Editor/TLS, 9 OAuth, 69 Kalender). Vier TLS-Policytests wurden nach der letzten Verschärfung separat erneut geprüft. Native Thunderbird-Verbindungen mit TLS 1.2 und 1.3 sowie falschem Pin bestanden im getrennten Testprofil. Zwei echte Android-Instrumentierungstests im frischen API-34-Emulator bestanden: künstliche Aufgabe senden und vorbereitete Desktop-Aufgabe empfangen; falsches Zertifikat abweisen.

Signatur, eigene Paketkennung, deaktivierter Debug-/Diagnosemodus und desugarter Zeitzonenprovider wurden am optimierten APK-Artefakt geprüft. Der Produktionskandidat ließ sich separat im Emulator installieren und ohne Crash starten. Die finale Begrüßung mit eigenem TC-Logo und Unabhängigkeitshinweis wurde am optimierten Paket im leeren Emulator visuell geprüft. Keine Installation oder Datenlöschung am POCO und keine Kopie nach Release/.

Die vollständige Android-Analyse ist weiterhin nicht insgesamt grün: letzter Release-Lint 0 Fehler, 5934 Warnungen und 2 Hinweise; App-Detekt 0 Befunde, Legacy-Detekt 552 Befunde. Kein Befund in HubTls. Der vorhandene Legacy-Rückstand wird nicht versteckt. Die Zahlen beziehen sich auf den beschriebenen Prüflauf, nicht auf eine manuelle Abnahme aller Funktionen.

## Vor stabiler Veröffentlichung offen

- Eigener Google-Android-Produktionsclient mit Zustimmung erstellt; bestehender Testclient erhalten. Google-App weiterhin Testmodus, öffentliche Anbieterfreigabe und Gmail-Bereich noch offen.
- Eigener Client ist in der neu gebauten APK enthalten; persönliche Google-Mail/Kalender-Freigabe tatsächlich prüfen; andere nicht konfigurierte OAuth-Anbieter ausdrücklich begrenzen.
- Neuen Desktop-/App-Satz mit sichtbarer TLS-Gerätefreigabe und echten eigenen Konten abnehmen. Bestehende Konten und Test-App nicht löschen, um eine Installation zu erzwingen.
- Kalenderfarben über Neustart/Anbieterabgleich, echte kalenderbezogene Warnungen und reale Mailverweise prüfen.
- Nextcloud bleibt bisher ausschließlich trocken geprüft; reale QR-/POCO-Abnahme bleibt ausgesetzt.
- Thunderbird-Katalogeinreichung durchführen und manuelle Review abwarten; noch keine Katalogfreigabe behaupten.

Keine Issues werden durch Paketbau oder Emulatorprüfungen automatisch geschlossen. [Android-Build](ANDROID_RELEASE.md), [Hub-TLS](HUB_TLS.md), [Veröffentlichung](DISTRIBUTION.md), [Datenschutz](PRIVACY.md).

## Aktualisierung Google-Produktionsclient

Der freigegebene eigene Android-Client ist registriert und über scripts/google-oauth-production.json reproduzierbar konfiguriert. production_google_tls_20261028 bestand neun OAuth- und vier TLS-Tests sowie den optimierten signierten Paketbau. Finale APK-SHA256: 2ace60a6a3483f03518f0cc82d1af42f8c765971067100a27b2587d9130756db. Im eigenen leeren Emulator aktualisiert, gestartet und TC-Begrüßung visuell geprüft; Crashbuffer leer. Das bestätigt keine persönliche Google-Anmeldung. Gmail-Bereich noch nicht deklariert; Google weiterhin Testmodus.
