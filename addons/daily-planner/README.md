# Tagesplaner

Termine, Aufgaben und eingeplante Mails in einer Übersicht für Thunderbird. Der Tagesplaner liest vorhandene Thunderbird-Kalender und benötigt das Kalender-Raster nicht.

## Funktionen

- Aufgaben mit Datum, mehrzeiligen Notizen und Erledigt-Status.
- Bereiche für überfällige Einträge, heute, morgen und undatierte Aufgaben.
- Aufgaben bearbeiten, sortieren und per Drag-and-drop umplanen.
- Nachrichten über **Planen** oder das Kontextmenü einem Datum zuordnen.
- Eingeplante Mails aus der Übersicht wieder öffnen.
- Optional beim Thunderbird-Start oder zu konfigurierten Zeiten anzeigen.
- Helle und dunkle Darstellung.

## Installation und Bedienung

Benötigt Thunderbird **128 oder neuer**.

1. Mit `./build-xpi.ps1` ein XPI bauen.
2. Thunderbird → **Add-ons und Themes** → Zahnrad → **Add-on aus Datei installieren …**.
3. Das XPI auswählen und den Zugriffshinweis lesen.
4. Den **Tagesplaner** über die linke Seitenleiste öffnen.

Die [Bedienungsanleitung](BEDIENUNG.md) erklärt Aufgaben und Mail-Verknüpfungen. Startverhalten und tägliche Wechselzeiten lassen sich unter **Einstellungen** ändern.

## Daten und optionale Verbindungen

Aufgaben, Notizen, Einstellungen und Mail-Verweise liegen im lokalen Add-on-Speicher. Bei eingeplanten Nachrichten werden Metadaten wie Betreff, Absender und Ordner gespeichert, keine Nachrichtentexte oder Anhänge. Die ursprünglichen Nachrichten verbleiben in ihren Mailkonten.

Die optionale Geräteverbindung kann Planerdaten an gekoppelte Geräte übertragen. Für den gemeinsamen Modulabgleich ist der separat installierte **TB-Connect Modul-Hub** erforderlich. Hub und Android-App sind nicht Teil dieses Repositories; die lokale Planung funktioniert unabhängig davon. Die direkte lokale Verbindung bleibt zur Kompatibilität erhalten.

## Entwicklung

```powershell
node ./tests/core.test.js
./build-xpi.ps1 -OutputPath ./build/Tagesplaner.xpi
```

Die Oberfläche läuft als Thunderbird-Erweiterung und enthält keine fingierte Browser-Datenquelle. Kalenderzugriff und optionale lokale Geräteverbindungen verwenden eine interne Thunderbird-Experiment-Schnittstelle. Automatisierte Tests ersetzen keine Bedienprüfung in Thunderbird.
