# VerÃ¶ffentlichung: Thunderbird und Android

Stand: 28. Oktober 2026.

## Thunderbird-Add-ons

Das offizielle Verzeichnis ist [addons.thunderbird.net](https://addons.thunderbird.net/). Im [Entwicklerbereich](https://addons.thunderbird.net/en-US/developers/) anmelden und je Erweiterung einen Eintrag anlegen. Vier XPIs bedeuten vier EintrÃ¤ge; Versionsupdates gehÃ¶ren anschlieÃŸend in den bestehenden Eintrag mit unverÃ¤nderter Add-on-ID.

FÃ¼r die Einreichung vorbereiten:

1. Normales XPI mit deaktivierter Testdiagnose, korrekter Version, Lizenz und vollstÃ¤ndigen Drittanbieterhinweisen.
2. Kurze Beschreibung, ausfÃ¼hrliche FunktionserklÃ¤rung, eigene Screenshots ohne persÃ¶nliche Daten, Support-/Quelllink und Datenschutzangaben.
3. Lesbaren Quellcode und genaue Buildschritte bereitstellen; der Hub Ã¼bernimmt die MIT-QR-Bibliothek unverÃ¤ndert aus dem Tagesplaner. Kein Remote-Code wird zur AusfÃ¼hrung nachgeladen.
4. Reviewer-Hinweise zu Experiment-Schnittstellen, benÃ¶tigten Rechten, Testprofil und kÃ¼nstlichen Daten. Optionale Anbieter nicht mit privaten Zugangsdaten demonstrieren.
5. TatsÃ¤chlich geprÃ¼fte Thunderbird-Versionen angeben; eine Mindestversion im Manifest beweist nicht die KompatibilitÃ¤t aller spÃ¤teren Releases.
6. Die [Reviewrichtlinie](https://thunderbird.github.io/atn-review-policy/) prÃ¼fen, XPI hochladen, Validierung und manuelle PrÃ¼fung abwarten. Erst nach Freigabe ist der Katalogeintrag verfÃ¼gbar.

Alle vier Erweiterungen verwenden Experiments und benÃ¶tigen daher nach der Richtlinie eine manuelle PrÃ¼fung. [Experiments](https://developer.thunderbird.net/add-ons/mailextensions) haben weitreichenden Zugriff. Die Richtlinie verlangt verschlÃ¼sselte KanÃ¤le fÃ¼r sensible Daten: der derzeitige Hub-HTTP-Transport ist vor einer solchen Einreichung ein offener Punkt. Die Ã¼brigen Erweiterungen kÃ¶nnen unabhÃ¤ngig ohne Hub verwendet und separat eingereicht werden.

## Android-App im selben Projekt

Die App gehÃ¶rt in das gemeinsame GitHub-Repository und spÃ¤ter als APK in dasselbe [GitHub Release](https://github.com/MarcSchlicker/ThunderbirdAddons/releases). Eine APK ist keine Desktop-Erweiterung und wird nicht als XPI im Thunderbird-Katalog eingereicht. In den Katalogbeschreibungen kann die passende App-Dokumentation verlinkt werden.

Eine spÃ¤tere Android-Store-Verteilung ist ein eigener Vorgang. Vor einem Ã¶ffentlichen APK-/Store-Release mÃ¼ssen eigene Paketkennung, Signierung, Updateweg, Providerfreigaben, Datenschutz und MarkenprÃ¼fung abgeschlossen sein. Das [Upstream-Projekt](https://github.com/thunderbird/thunderbird-android#forking) verlangt fÃ¼r Forks eigene OAuth-Konfigurationen und unterschiedliche Redirect-URIs. Die bisherige Test-APK wird deshalb nicht als Produktionsrelease hochgeladen.

Der GitHub-Entwurf enthÃ¤lt die App bereits als Bestandteil mit Quellen und dokumentiertem Teststand. Die Freigabeschritte stehen in [RELEASE.md](RELEASE.md). Ein Entwurf, ein Ã¶ffentlicher Quellstand und eine Katalogfreigabe sind getrennte ZustÃ¤nde.

Konkrete Beschreibungstexte, Berechtigungsgründe und künstliche Prüfschritte: [Einreichungsunterlagen](ATN_SUBMISSION.md).
