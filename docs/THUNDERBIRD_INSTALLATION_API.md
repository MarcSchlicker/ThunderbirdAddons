# Thunderbird ohne Maus aktualisieren

Der Client nutzt die vorhandene lokale Projektpilot-Installationsschnittstelle und den bereits installierten Thunderbird-Helfer. Es wird kein zweiter Installationsdienst angelegt. Projektpilot und Thunderbird müssen laufen; das Projekt muss in Projektpilot freigegeben sein.

## Befehle im Projektordner

```powershell
node scripts/install-thunderbird.cjs status
node scripts/install-thunderbird.cjs install "addons/calendar-raster/build/Kalender-Raster-1.4.15-test_diagnostics.xpi"
node scripts/install-thunderbird.cjs wait <Auftrags-ID>
```

`install` übergibt genau ein Paket und gibt die Auftrags-ID aus. Der vorhandene Helfer zeigt die Paketkennung, Version und Berechtigungen in Thunderbird. Die Bestätigung lässt sich mit Tab und Enter bedienen; kein Dateidialog ist mehr nötig. Der Client umgeht die Bestätigung nicht. Bereits installierte Pakete werden nicht automatisch erneut eingereiht.

`wait` wartet höchstens 60 Sekunden. Exitcode 0 bedeutet vom Helfer bestätigte Installation; 1 bedeutet Fehler/Abbruch; 2 bedeutet weiterhin ausstehend. Nach Zeitablauf bleibt derselbe Auftrag bestehen: nochmals `wait` oder `status`, nicht erneut `install`. Eine ausstehende Installation oder eine Netzwerkfehlermeldung ist kein Erfolg. Nur bei einem fehlgeschlagenen/abgebrochenen Auftrag bewusst neu starten.

## Schnittstelle und Grenzen

- Endpunkt aus `%LOCALAPPDATA%/Projektpilot/data/endpoint.json`; abweichende Datei mit `TB_CONNECT_INSTALLER_ENDPOINT_FILE`.
- Nur `http://127.0.0.1:<Port>`, keine Weiterleitungen. Anfrage-Timeout fünf Sekunden.
- `GET /api/health`, `GET /api/installations/state`, `POST /api/thunderbird/install` mit JSON `{ "path": "absoluter XPI-Pfad" }`.
- Der Client akzeptiert ausschließlich echte Pfade innerhalb dieses Projekts und XPI-Dateien bis 64 MB. Projektpilot prüft zusätzlich seine Projektfreigabe.
- Der vorhandene Server kopiert das Paket pro Auftrag; der Helfer prüft SHA-256, Kennung und Version, bevor er installiert. Der Client liest oder veröffentlicht keine Kopplungsschlüssel.
- Kein direktes Schreiben ins Thunderbird-Profil, keine Datenlöschung, kein automatisches Downgrade und keine Release-Veröffentlichung durch diesen Client. Eine ältere Paketversion wird vom Client nicht selbst erkannt; deshalb stets das aktuelle geprüfte Paket auswählen.
- Installationsmeldungen ersetzen keine Funktionsabnahme. Nextcloud bleibt laut Nutzer wegen abgeschalteter PHP-Installation im Trockenlauf.

## Prüfung

`node --test scripts/test-install-thunderbird.cjs`: lokale Endpunktbegrenzung, Projektpfadgrenze, nicht verbundener Helfer, doppelte Aufträge, Timeout sowie bestätigte Erfolgs-/Fehler-/Abbruchzustände mit simulierten API-Antworten. Ein echter Installationslauf wird separat dokumentiert; kein automatischer Test installiert ein Add-on in das Nutzerprofil.

Realer Statuscheck am 22.10.2026: vorhandener Projektpilot 1.11.0 gestartet, API erreichbar, `connected: true`, `helperPrepared: true`. Keine erneute Paketinstallation. Historische Aufträge sind kein Inventar aktuell installierter Versionen.
