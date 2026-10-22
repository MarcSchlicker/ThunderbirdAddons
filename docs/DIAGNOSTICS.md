# Testdiagnose und Release-Namen

## Ein Schalter für Testpakete

**Nur ein beim Bauen eingebetteter Release-Name mit dem Präfix `test_` aktiviert die Diagnose.** Groß-/Kleinschreibung ist relevant. Beispiele:

| Release-Name | Diagnose |
| --- | --- |
| `test_2026_10_21` | aktiviert |
| `test_diagnostics` | aktiviert |
| `release` | deaktiviert |
| `snapshot-2026-10-21` | deaktiviert |
| `TEST_diagnostics` | deaktiviert |
| `v2_test_diagnostics` | deaktiviert |

Nach `test_` folgen 1–64 Buchstaben, Zahlen, Punkte, Unterstriche oder Bindestriche. Normale Builds verwenden standardmäßig `release`. Fehlende oder ungültige Build-Metadaten aktivieren die Diagnose nicht.

Der GitHub-Release-Titel ist keine Laufzeiteinstellung: **Ein fertiges XPI oder APK nachträglich umzubenennen schaltet die Diagnose nicht um.** Beim Bauen muss derselbe Release-Name übergeben werden, unter dem das Paket veröffentlicht werden soll. Eine andere Konfiguration erfordert einen neuen Build.

## Desktop-Pakete bauen

Aus dem Repository-Ordner in PowerShell:

```powershell
./addons/calendar-raster/build-xpi.ps1 -ReleaseName test_2026_10_21 -OutputPath "$PWD/dist/Kalender-Raster-test.xpi"
./addons/daily-planner/build-xpi.ps1 -ReleaseName test_2026_10_21 -OutputPath "$PWD/dist/Tagesplaner-test.xpi"
./addons/mail-address-filer/build-xpi.ps1 -ReleaseName test_2026_10_21 -OutputPath "$PWD/dist/Mail-Ablage-test.xpi"
```

Normale Pakete mit `-ReleaseName release` oder ohne diesen Parameter bauen. Der Diagnoseknopf ist dann deaktiviert. Testpakete tragen die Testkennung zusätzlich im Add-on-Namen. Add-on-ID und Datenformat bleiben gleich; das Testpaket ist kein getrenntes Thunderbird-Profil.

Die Buildskripte schreiben `diagnostics/build-info.json` in das Paket. Sie enthalten Release-Name und Git-Kennung, soweit verfügbar. `-dirty` kennzeichnet uncommittete Änderungen, `source` einen Build ohne Git-Kennung. Die Quelldateien werden beim Paketieren nicht verändert.

## Knopf verwenden

- **Kalender Raster:** `Diagnose` in der Werkzeugleiste oder im Add-on-Popup.
- **Tagesplaner:** `Diagnose` rechts oben.
- **Mail-Ablage:** `Diagnose` in den Add-on-Einstellungen.

1. **Diagnose → Diagnose starten** wählen.
2. Ergebnisse und die **Exportvorschau** ansehen.
3. Bei Bedarf **Kopieren** oder **Diagnose exportieren** wählen.
4. Die JSON-Datei zur Untersuchung weitergeben. Es gibt keinen automatischen Upload.

Während eines Laufs ist ein weiterer Start gesperrt. **Abbrechen** beendet den Worker. Jede Einzelprüfung hat ein Zeitlimit von fünf Sekunden. Beim Timeout wird der Worker ebenfalls beendet; ausstehende Ergebnisse werden verworfen. Die temporäre Testdatenbank wird anschließend gelöscht. Fehlgeschlagene Bereinigung wird als eigener Fehler protokolliert.

## Was geprüft wird

- Versions-/Buildkennung und ausdrücklicher Testmodus.
- Vorhandene Thunderbird-Experiment-Schnittstelle; bei Kalender/Planer deren kleiner Statusaufruf.
- Struktur ausgewählter Konfigurationsfelder, ohne deren Werte zu protokollieren.
- Schreiben und Lesen in einer eigenen temporären IndexedDB-Datenbank; keine produktiven Einstellungen werden verändert.
- Kleine Prüfungen der echten Planer- beziehungsweise Ablagelogik mit neutralen Testdaten.

Der Kalender hat keinen eigenständigen Worker-Domänentest; dieser Schritt wird ausdrücklich übersprungen. Echte Kontoabgleiche, Kalender-Schreibzugriff, Verschieben von Mails, Benachrichtigungen und sichtbare Bedienabläufe werden ebenfalls **nicht** durch diese lokalen Tests abgenommen. Sie bleiben als `skipped` mit `MANUAL_REQUIRED` oder `NOT_AVAILABLE` sichtbar.

Host-Abfragen lesen ausschließlich Konfiguration/Schnittstellenbereitschaft. Thunderbird-API-Aufrufe selbst lassen sich nicht über einen AbortSignal abbrechen. Der auf Ergebnisse wartende Worker wird deshalb beendet; spätere Antworten werden ignoriert. Diese Abfragen verändern keine Produktivdaten.

## Protokoll und Datenschutz

Das JSON-Paket enthält Schema-Version, Lauf-ID, Zeitpunkt, App-/Paketversion, Release- und Buildkennung, Plattform und Auslöser. Jeder Prüfschritt enthält ID, `passed`/`failed`/`skipped`, Dauer und einen festen Fehlercode.

Es werden keine beliebigen Konsolenausgaben, Exception-Texte oder Stacktraces übernommen. Mails, Termine, Namen, Zugangsdaten, Serveradressen und lokale Dateipfade gehören nicht in das Paket. Ein absichtlich gesetzter Fehler mit solchen Testwerten wird im Browser-Regressionslauf auf Abwesenheit geprüft.

Nur die letzten zehn Diagnoseberichte bleiben im lokalen Add-on-Speicher. Gespeicherte Berichte werden vor der Weiterverwendung auf das erlaubte Format geprüft. Exportiert wird der aktuell sichtbare Bericht.

```powershell
node ./scripts/summarize-diagnostics.cjs ./diagnose.json
```

Der Auswerter liest das JSON als Daten, validiert Statuswerte und gibt Zähler sowie feste Kennungen aus. Inhalte werden nicht als Befehle ausgeführt.

## Automatisierte Prüfung

```powershell
node ./scripts/check.cjs
node ./scripts/test-diagnostics.cjs
```

Der zweite Lauf benötigt Playwright und einen installierten Microsoft-Edge-Browser. Über `PW_BROWSER_CHANNEL` kann ein anderer unterstützter Kanal gewählt werden. Er führt die echten Diagnoseknöpfe, Worker, IndexedDB, Timeout-/Abbruchlogik und JSON-Downloads in einem isolierten Browser aus; Thunderbird-Host-APIs sind dabei simuliert. Das ersetzt keine XPI-Abnahme in Thunderbird.

## Android

Die separate TB-Connect-Android-App verwendet denselben Schalter beim Gradle-Build:

```powershell
./gradlew.bat :app-thunderbird:assembleFossDebug -Ptb.releaseName=test_diagnostics -Ptb.buildId=local-diagnostics -Ptb.performanceBuild=true
```

Ohne `-Ptb.releaseName` ist der Knopf deaktiviert. Die Kennung wird als BuildConfig-Wert einkompiliert. Unter Kalender, Tagesplaner oder Verbindungen im Menü **Diagnose** öffnen. Die Compose-Oberfläche bietet Start, Abbruch, Vorschau, Kopieren und Android-Dateiexport. Die App-Quellen sind nicht Teil dieses öffentlichen Add-on-Repositories.

Native Prüfungen decken Buildkennung, registrierte Module, Kalenderberechtigung, Netzwerkbereitschaft, einen isolierten Datei-Roundtrip und Zeitraster-Grenzfälle ab. Sie schreiben weder Kalender noch Konten. Fehlende Kalenderberechtigung wird übersprungen, fehlende validierte Netzwerkverbindung als Fehler gemeldet. Nextcloud-Datenaustausch und Google-Kalender-Schreiben bleiben ausdrücklich manuell. Coroutine-Timeouts brechen kooperative Prüfungen ab; lokale Dateioperationen laufen interruptibel und räumen ihren eigenen Testinhalt im `finally` auf.

Es gibt keinen automatischen Starttest und keinen automatischen Export. Ein erfolgreicher Diagnosebericht ist eine lokale technische Prüfung, keine Bestätigung eines vollständigen Geräte- oder Kontoabgleichs.
