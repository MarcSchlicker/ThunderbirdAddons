# Release-Vorbereitung Â· 28. Oktober 2026

Status: **Entwurf, nicht als stabile Version freigegeben.** Enthalten sind vier Desktop-Erweiterungen und die Android-App samt Quellcode. Der Entwurf benennt den letzten geprÃ¼ften Entwicklungsstand; keine bisherige Test-APK wird automatisch nach Release kopiert.

| Komponente | Stand | Lizenz |
| --- | --- | --- |
| Kalender Raster | 1.4.19 | MPL 2.0 |
| Tagesplaner | 2.0.9 | MPL 2.0 |
| Mail-Ablage | 1.4.2 | MPL 2.0 |
| Modul-Hub | 2.0.29 | MPL 2.0; QR-Bibliothek MIT |
| Android-App | 2.0.60-SNAPSHOT / Code 61, Teststand | Apache 2.0; Fremdlizenzen erhalten |

## Ã„nderungen

- Sichtbarer Tagesplan in der App mit zwei Zeitspalten und direktem Terminaufruf.
- Warnungen bei den betroffenen Kalendern; keine allgemeinen falschen Warnsymbole.
- Manuelles Senden/Empfangen mit getrennten Ergebnissen und ehrlichen Teilfehlern.
- Tagesplaner gruppiert vorgemerkte Desktop-Mails und Aufgaben nach Datum.
- VerspÃ¤tete Desktop-Syncantworten erhalten neuere lokale Mail-/AufgabenÃ¤nderungen.
- AbschlieÃŸender Desktop-Empfang nach der Handyphase; Empfangsfehler verhindern Erfolgsmeldung.
- Eigene Personen-Konfiguration und native Kalenderfarben am Desktop.

## PrÃ¼fstand und Freigabe

Am zugrunde liegenden Entwicklungsstand bestanden 38 Node-Tests und sechs GitHub-Checks. Im bereinigten öffentlichen Release-Baum wurden die 38 Node-Tests erneut erfolgreich ausgeführt; eigene Dokumentlinks, JavaScript und JSON bestanden ebenfalls. Alle vier normalen XPIs wurden mit beigefügten Lizenztexten gebaut; der automatische Paketcheck bestätigt deaktivierte Testdiagnose sowie MIT-Hinweise in Tagesplaner und Hub. FÃ¼r die unverÃ¤nderte App bestanden zuletzt 23 gezielte Android-Ansichts-/Rastertests. Sichtbarer Tagesdialog und das Verschwinden des falschen oberen Warnsymbols wurden am GerÃ¤t bestÃ¤tigt. Das ist keine Gesamtfreigabe. Android-Detekt meldet weiterhin 542 Befunde, Lint 4771 Warnungen bei null Fehlern. Instrumentierung und vollstÃ¤ndiger Upstream-Gesamtbuild wurden nicht abgeschlossen.

Noch offen vor stabiler BinÃ¤rfreigabe:

- Neue Desktoppakete in Thunderbird installieren und realen Sende-/Empfangsrundweg sowie Mailerhalt mit der App prÃ¼fen; das TestgerÃ¤t ist aktuell nicht verfÃ¼gbar.
- Kalenderfarbe Ã¼ber Neustart/Anbieterabgleich und echte kalenderbezogene Fehleranzeige abnehmen.
- Nextcloud mit erreichbarem Server in beide Richtungen prÃ¼fen; bisher nur TrockenprÃ¼fungen. QR-Neukopplung bleibt ausgesetzt.
- Android: eigene Produktions-Paketkennung, dauerhaft eigener SignierschlÃ¼ssel und Update-/Migrationsweg; eigene Mail-OAuth-Clients statt Upstream-Konfiguration. Kalender-OAuth-Testkonfiguration vor Produktionsverteilung ablÃ¶sen.
- Android: aktive Upstream-Dienste/Datenschutz und sichtbare Markenverwendung final prÃ¼fen. Normale Appvariante mit deaktivierter Testdiagnose bauen und am GerÃ¤t abnehmen.
- Modul-Hub: verschlÃ¼sselten Transport fÃ¼r sensible Daten und Thunderbird-Reviewanforderungen klÃ¤ren/umsetzen; aktuelles lokales HTTP ist keine TLS-Verbindung.

Keine offenen Issues werden durch diese Vorbereitung automatisch geschlossen. [VerÃ¶ffentlichungswege](DISTRIBUTION.md), [Lizenzen](../LICENSING.md), [Datenschutz](PRIVACY.md).
