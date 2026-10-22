# Thunderbird Add-ons

**Den Kalender im Blick. Aufgaben an einem Ort. Mails mit einem Klick abgelegt.**

Drei eigenständige Erweiterungen für Thunderbird. Jede lässt sich einzeln installieren und verwenden.

| Erweiterung | Dafür ist sie da | Quellstand |
| --- | --- | --- |
| [Kalender Raster](addons/calendar-raster/README.md) | Kalender im Zeitraster, Ansichtsprofile, Personenvergleich und Arbeitszeiten | 1.4.15 |
| [Tagesplaner](addons/daily-planner/README.md) | Termine, Aufgaben mit Notizen und eingeplante Nachrichten in einer Übersicht | 2.0.6 |
| [Mail-Ablage nach Adresse](addons/mail-address-filer/README.md) | Nachrichten anhand der eigenen Mailadresse in zugeordnete Ordner verschieben | 1.4.2 |

## Schnellstart

Voraussetzung: **Thunderbird 128 oder neuer**. Die Erweiterungen verwenden interne Thunderbird-Experiment-Schnittstellen und benötigen entsprechend weitreichenden Zugriff auf Thunderbird. Die Mail-Ablage verschiebt Nachrichten; der Kalender kann vorhandene Termine bearbeiten. Für den ersten Versuch empfiehlt sich ein Testprofil.

Dieses Repository enthält Quellcode und Buildskripte. Es gibt noch keine als Release freigegebenen Installationspakete. Unter Windows mit PowerShell und `tar.exe` aus dem Repository-Ordner bauen:

```powershell
./addons/calendar-raster/build-xpi.ps1 -OutputPath "$PWD/dist/Kalender-Raster.xpi"
./addons/daily-planner/build-xpi.ps1 -OutputPath "$PWD/dist/Tagesplaner.xpi"
./addons/mail-address-filer/build-xpi.ps1 -OutputPath "$PWD/dist/Mail-Ablage.xpi"
```

Anschließend in Thunderbird **Add-ons und Themes → Zahnrad → Add-on aus Datei installieren …** öffnen und das gewünschte XPI auswählen. Die Anleitungen erklären die ersten Schritte:

- [Kalender, Personen und Filter](addons/calendar-raster/BEDIENUNG.md)
- [Aufgaben und Mails planen](addons/daily-planner/BEDIENUNG.md)
- [Adressbezogene Ablage einrichten](addons/mail-address-filer/BEDIENUNG.md)

## Was lässt sich damit machen?

### Kalender Raster

Ein eigener Kalenderbereich mit Tag, Woche, Monat und vier Wochen. Termine stehen an ihrer Uhrzeit; jeder Tag besitzt zwei Zeitspalten. Profile steuern Arbeits- und Freizeitansichten. Kalender lassen sich Personen zuordnen und vergleichen. Urlaub und Feiertage beeinflussen die dargestellte Arbeitszeit. Bearbeitung und Synchronisation der eigentlichen Termine bleiben bei Thunderbird und seinen Kalenderanbietern.

### Tagesplaner

Eine gemeinsame Übersicht für anstehende Termine, Aufgaben und Nachrichten, die noch bearbeitet werden sollen. Aufgaben können Datum und Notizen erhalten, verschoben und abgehakt werden. Mit **Planen** wird eine Mail in den Tagesplan aufgenommen; aus dem Plan lässt sich die ursprüngliche Nachricht wieder öffnen.

### Mail-Ablage nach Adresse

Für jede eigene Mailadresse einen Zielordner festlegen. **Ablegen** markiert ausgewählte Nachrichten als gelesen und verschiebt sie in die passenden Ordner. **Ungelesen** setzt ihren Lesestatus zurück. Die Ablage wird bewusst ausgelöst; sie ist kein automatischer Eingangsfilter.

## Daten und Verbindungen

Einstellungen und Zuordnungen werden im jeweiligen Thunderbird-Profil gespeichert. Kalender und Nachrichten bleiben in den eingerichteten Konten. Der Tagesplaner speichert Aufgaben, Notizen und Mail-Metadaten lokal.

Optionale Funktionen haben eigene Datenwege:

- **Feiertage:** Kalender Raster fragt Land, Region und Zeitraum bei [OpenHolidays](https://www.openholidaysapi.org/de/) ab. Die Feiertagsdaten stehen unter ODbL.
- **Sicherungen:** Kalender Raster kann Sicherungen exportieren und nach Einrichtung per E-Mail versenden. Dabei können Kalenderdaten übertragen werden.
- **Geräteabgleich:** Tagesplaner und Kalender können mit einem separat installierten **TB-Connect Modul-Hub** zusammenarbeiten. Hub, Nextcloud-Anmeldung und Android-App sind nicht Teil dieses Repositories. Die drei Desktop-Erweiterungen funktionieren ohne diese Zusatzkomponenten.

## Diagnose in Testpaketen

Release-Namen mit Präfix `test_` aktivieren einen Knopf für lokale technische Prüfungen und bereinigte JSON-Protokolle. Normale Pakete bleiben deaktiviert. [Buildschalter, Bedienung und Grenzen](docs/DIAGNOSTICS.md).

## Entwicklung und Tests

Für die automatisierten Prüfungen ist **Node.js 22 oder neuer** vorgesehen; zusätzliche npm-Pakete sind nicht nötig.

```powershell
node ./scripts/check.cjs
```

Der Check prüft JavaScript-Syntax, JSON-Dateien, lokale Dokumentationslinks und die vorhandenen Funktionstests. Vor einer Veröffentlichung zusätzlich die erzeugten XPIs in Thunderbird prüfen. Die Tests ersetzen keine Abnahme mit echten Kalender- oder Mailkonten.

Fehlerberichte sind über die [GitHub Issues](https://github.com/MarcSchlicker/ThunderbirdAddons/issues) willkommen. Bitte Erweiterung, Version, Thunderbird-Version und nachvollziehbare Schritte nennen; persönliche Kalenderdaten, Nachrichten und Zugangsdaten vor dem Anhängen entfernen.

## Lizenzierung und Drittanbieter

Für den eigenen Projektcode ist derzeit keine projektweite Lizenz angegeben. Vorhandene Drittanbieter-Lizenzhinweise bleiben unverändert; der Tagesplaner enthält einen MIT-lizenzierten [QR-Code-Generator](addons/daily-planner/THIRD_PARTY_NOTICES.md).

Dieses Projekt ist unabhängig und nicht offiziell mit Mozilla oder Thunderbird verbunden. Thunderbird ist eine Marke der jeweiligen Rechteinhaber.

## Installation per Kommando

Mit dem vorhandenen Projektpilot-Installationshelfer können geprüfte XPIs ohne Dateidialog an Thunderbird übergeben werden. Der CLI-Client zeigt Wartestatus, Abbruch und bestätigten Installationserfolg. Siehe [Installationsschnittstelle](docs/THUNDERBIRD_INSTALLATION_API.md).
