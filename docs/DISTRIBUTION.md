# Veröffentlichung: Thunderbird und Android

Stand: 28. Oktober 2026.

## Thunderbird-Add-ons

Das offizielle Verzeichnis ist [addons.thunderbird.net](https://addons.thunderbird.net/). Im [Entwicklerbereich](https://addons.thunderbird.net/en-US/developers/) anmelden und je Erweiterung einen Eintrag anlegen. Vier XPIs bedeuten vier Einträge; Versionsupdates gehören anschließend in den bestehenden Eintrag mit unveränderter Add-on-ID.

Für die Einreichung vorbereiten:

1. Normales XPI mit deaktivierter Testdiagnose, korrekter Version, Lizenz und vollständigen Drittanbieterhinweisen.
2. Kurze Beschreibung, ausführliche Funktionserklärung, eigene Screenshots ohne persönliche Daten, Support-/Quelllink und Datenschutzangaben.
3. Lesbaren Quellcode und genaue Buildschritte bereitstellen; der Hub übernimmt die MIT-QR-Bibliothek unverändert aus dem Tagesplaner. Kein Remote-Code wird zur Ausführung nachgeladen.
4. Reviewer-Hinweise zu Experiment-Schnittstellen, benötigten Rechten, Testprofil und künstlichen Daten. Optionale Anbieter nicht mit privaten Zugangsdaten demonstrieren.
5. Tatsächlich geprüfte Thunderbird-Versionen angeben; eine Mindestversion im Manifest beweist nicht die Kompatibilität aller späteren Releases.
6. Die [Reviewrichtlinie](https://thunderbird.github.io/atn-review-policy/) prüfen, XPI hochladen, Validierung und manuelle Prüfung abwarten. Erst nach Freigabe ist der Katalogeintrag verfügbar.

Alle vier Erweiterungen verwenden Experiments und benötigen daher nach der Richtlinie eine manuelle Prüfung. [Experiments](https://developer.thunderbird.net/add-ons/mailextensions) haben weitreichenden Zugriff. Die Richtlinie verlangt verschlüsselte Kanäle für sensible Daten: der derzeitige Hub-HTTP-Transport ist vor einer solchen Einreichung ein offener Punkt. Die übrigen Erweiterungen können unabhängig ohne Hub verwendet und separat eingereicht werden.

## Android-App im selben Projekt

Die App gehört in das gemeinsame GitHub-Repository und später als APK in dasselbe [GitHub Release](https://github.com/MarcSchlicker/ThunderbirdAddons/releases). Eine APK ist keine Desktop-Erweiterung und wird nicht als XPI im Thunderbird-Katalog eingereicht. In den Katalogbeschreibungen kann die passende App-Dokumentation verlinkt werden.

Eine spätere Android-Store-Verteilung ist ein eigener Vorgang. Vor einem öffentlichen APK-/Store-Release müssen eigene Paketkennung, Signierung, Updateweg, Providerfreigaben, Datenschutz und Markenprüfung abgeschlossen sein. Das [Upstream-Projekt](https://github.com/thunderbird/thunderbird-android#forking) verlangt für Forks eigene OAuth-Konfigurationen und unterschiedliche Redirect-URIs. Die bisherige Test-APK wird deshalb nicht als Produktionsrelease hochgeladen.

Der GitHub-Entwurf enthält die App bereits als Bestandteil mit Quellen und dokumentiertem Teststand. Die Freigabeschritte stehen in [RELEASE.md](RELEASE.md). Ein Entwurf, ein öffentlicher Quellstand und eine Katalogfreigabe sind getrennte Zustände.

Konkrete Beschreibungstexte, Berechtigungsgründe und künstliche Prüfschritte: [Einreichungsunterlagen](ATN_SUBMISSION.md).
