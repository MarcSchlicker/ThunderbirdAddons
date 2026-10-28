# Release-Vorbereitung · 28. Oktober 2026

Status: **Entwurf, nicht als stabile Version freigegeben.** Enthalten sind vier Desktop-Erweiterungen und die Android-App samt Quellcode. Der Entwurf benennt den letzten geprüften Entwicklungsstand; keine bisherige Test-APK wird automatisch nach Release kopiert.

| Komponente | Stand | Lizenz |
| --- | --- | --- |
| Kalender Raster | 1.4.19 | MPL 2.0 |
| Tagesplaner | 2.0.9 | MPL 2.0 |
| Mail-Ablage | 1.4.2 | MPL 2.0 |
| Modul-Hub | 2.0.29 | MPL 2.0; QR-Bibliothek MIT |
| Android-App | 2.0.60-SNAPSHOT / Code 61, Teststand | Apache 2.0; Fremdlizenzen erhalten |

## Änderungen

- Sichtbarer Tagesplan in der App mit zwei Zeitspalten und direktem Terminaufruf.
- Warnungen bei den betroffenen Kalendern; keine allgemeinen falschen Warnsymbole.
- Manuelles Senden/Empfangen mit getrennten Ergebnissen und ehrlichen Teilfehlern.
- Tagesplaner gruppiert vorgemerkte Desktop-Mails und Aufgaben nach Datum.
- Verspätete Desktop-Syncantworten erhalten neuere lokale Mail-/Aufgabenänderungen.
- Abschließender Desktop-Empfang nach der Handyphase; Empfangsfehler verhindern Erfolgsmeldung.
- Eigene Personen-Konfiguration und native Kalenderfarben am Desktop.

## Prüfstand und Freigabe

Am zugrunde liegenden Entwicklungsstand bestanden 38 Node-Tests und sechs GitHub-Checks. Im bereinigten öffentlichen Release-Baum wurden die 38 Node-Tests erneut erfolgreich ausgeführt; eigene Dokumentlinks, JavaScript und JSON bestanden ebenfalls. Alle vier normalen XPIs wurden mit beigefügten Lizenztexten gebaut; der automatische Paketcheck bestätigt deaktivierte Testdiagnose sowie MIT-Hinweise in Tagesplaner und Hub. FÃ¼r die unverÃ¤nderte App bestanden zuletzt 23 gezielte Android-Ansichts-/Rastertests. Sichtbarer Tagesdialog und das Verschwinden des falschen oberen Warnsymbols wurden am GerÃ¤t bestÃ¤tigt. Das ist keine Gesamtfreigabe. Android-Detekt meldet weiterhin 542 Befunde, Lint 4771 Warnungen bei null Fehlern. Instrumentierung und vollstÃ¤ndiger Upstream-Gesamtbuild wurden nicht abgeschlossen.

Noch offen vor stabiler Binärfreigabe:

- Neue Desktoppakete in Thunderbird installieren und realen Sende-/Empfangsrundweg sowie Mailerhalt mit der App prüfen; das Testgerät ist aktuell nicht verfügbar.
- Kalenderfarbe über Neustart/Anbieterabgleich und echte kalenderbezogene Fehleranzeige abnehmen.
- Nextcloud mit erreichbarem Server in beide Richtungen prüfen; bisher nur Trockenprüfungen. QR-Neukopplung bleibt ausgesetzt.
- Android: eigene Produktions-Paketkennung, dauerhaft eigener Signierschlüssel und Update-/Migrationsweg; eigene Mail-OAuth-Clients statt Upstream-Konfiguration. Kalender-OAuth-Testkonfiguration vor Produktionsverteilung ablösen.
- Android: aktive Upstream-Dienste/Datenschutz und sichtbare Markenverwendung final prüfen. Normale Appvariante mit deaktivierter Testdiagnose bauen und am Gerät abnehmen.
- Modul-Hub: verschlüsselten Transport für sensible Daten und Thunderbird-Reviewanforderungen klären/umsetzen; aktuelles lokales HTTP ist keine TLS-Verbindung.

Keine offenen Issues werden durch diese Vorbereitung automatisch geschlossen. [Veröffentlichungswege](DISTRIBUTION.md), [Lizenzen](../LICENSING.md), [Datenschutz](PRIVACY.md).
