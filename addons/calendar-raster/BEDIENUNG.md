# Kalender Raster – Funktionen und Bedienung

Die XPI über Thunderbirds Add-on-Verwaltung installieren. **Kalender** in der linken
Seitenleiste öffnet das Raster. Monat, vier Wochen, Woche, Tag und Zoom bieten unterschiedliche
Zeitbereiche. Ein Doppelklick auf freie Zeit erstellt einen Termin; auf einen Termin öffnet
er dessen Bearbeitung. Beschreibbare Termine lassen sich ziehen. Anbieterrechte bleiben wirksam.

## Kalender und Kategorien

Die linke Liste gruppiert Kalender nach Kategorien, etwa **Meine Kalender**, **Geburtstag**
und **Urlaub**. Das Auge blendet sie in dieser Ansicht ein oder aus. Entfernen aus der Ansicht
löscht keinen Kalender; über die Einstellungen lässt er sich wiederherstellen.
Die Kalenderverwaltung bietet Umbenennen, Farbe, Standardkalender und Anbieteroptionen.
Abmelden beziehungsweise tatsächliches Löschen sind eigene, ausdrücklich bestätigte Aktionen.

## Personen

Unterhalb der Kalenderliste **Personen des Kalenders** aufklappen. Personen mit Name,
Initiale, Farbe und Beziehung anlegen. Über die Personenzuordnung eines Kalenders festlegen,
wem er gehört; gemeinsame Kalender können mehreren Personen gehören. Nicht zugeordnete
Kalender gehören zu **Ich**. Die Initialen hinter einem Kalender zeigen seine Zuordnung.

Das Personenauge steuert die normale Ansicht. Der Arbeitszeit-Pseudokalender hat ein eigenes
Auge und bleibt unabhängig sichtbar. Er ist eine Darstellung, kein erzeugter Termin.
Unter **Person bearbeiten** die allgemeine Arbeitszeit sowie bei Bedarf einzelne Wochentage
einstellen. Dort liegt auch **Feiertagsregion**; neue Personen zunächst speichern.
Der hinzugefügte Feiertagskalender gehört dieser Person und zur Kategorie **Urlaub**.
Urlaub und Feiertage setzen ihre Arbeitszeit für die betroffenen Tage aus.

Die Feiertagsauswahl verwendet die [OpenHolidays API](https://www.openholidaysapi.org/de/)
unter [ODbL](https://www.openholidaysapi.org/de/faq/). Übermittelt werden Region und Zeitraum,
keine Personennamen. Ein Feed enthält den bei der Einrichtung gewählten Jahresbereich;
für später liegende Jahre die Region im gewünschten Jahr aktualisieren.

## Personen vergleichen

Oben **Filter → Personen** öffnen und zwei oder mehr Personen auswählen. Der Vergleich
verwendet Personenfarben; gemeinsame Kalender haben eine gemeinsame Vergleichsfarbe.
Außerhalb dieses Modus gelten wieder die normalen Kalenderfarben. Die Vergleichsauswahl
und die Augen der normalen Ansicht sind unabhängig voneinander.

## Nextcloud und Sicherungen

**Einstellungen → Nextcloud-Kalender verbinden oder anlegen** öffnet den TB-Connect-Hub.
Dort anmelden und vorhandene Kalender hinzufügen oder neue anlegen. Hub ab 2.0.24 verwenden.
Sicherungen können als geprüfte JSON-Datei exportiert und wiederhergestellt werden.
E-Mail-Sicherungen sind optional und enthalten Kalenderdaten: Empfänger bewusst auswählen.

Build: `./build-xpi.ps1`. Technische Details und weitere Optionen: [README](README.md).


## Personen verwalten und wieder anzeigen

Unter **Einstellungen → Personen** vorhandene Personen bearbeiten oder neue hinzufügen. **Personen im Kalender wieder anzeigen** öffnet die Personenliste und leert deren Suchfilter. Vorhandene Namen, Farben, Arbeitszeiten und Kalenderzuordnungen bleiben erhalten. Tatsächlich gelöschte Personen benötigen eine vorhandene Sicherung; dieser Knopf stellt nur die Ansicht wieder her.
