# Kalender Raster

Ein eigener Kalenderbereich für Thunderbird mit Tages-, Wochen-, Monats- und Vierwochenansicht. Das Raster nutzt vorhandene Thunderbird-Kalender und deren Zugriffsrechte.

## Funktionen

- Zwei Zeitspalten pro Tag, konfigurierbare Ansichtsprofile und Kalenderfarben.
- Kalender und Kategorien filtern, Personen zuordnen und gemeinsame Belegungen vergleichen.
- Arbeitszeiten je Person und Wochentag; Urlaub und Feiertage berücksichtigen.
- Termine über Thunderbirds Dialoge erstellen, bearbeiten und verschieben.
- Kalenderverwaltung sowie Export und Wiederherstellung von Sicherungen.
- Deutsche und englische Oberfläche.

## Installation und Bedienung

Benötigt Thunderbird **128 oder neuer**. Das Add-on verwendet interne Thunderbird-Schnittstellen; neue Thunderbird-Versionen können Anpassungen erfordern.

1. Mit `./build-xpi.ps1` ein XPI bauen.
2. Thunderbird → **Add-ons und Themes** → Zahnrad → **Add-on aus Datei installieren …**.
3. Das XPI auswählen und den Zugriffshinweis lesen.
4. **Kalender** in der linken Seitenleiste öffnen.

Die [Bedienungsanleitung](BEDIENUNG.md) beschreibt Personen, Filter und Sicherungen.

## Daten und optionale Verbindungen

Kalender bleiben bei ihren eingerichteten Anbietern. Ansichtsprofile und Zuordnungen liegen im Thunderbird-Profil. Kalenderänderungen und Löschaktionen wirken auf die jeweiligen Kalender; das Ausblenden im Raster löscht keine Termine.

Die optionale Feiertagsauswahl verwendet die [OpenHolidays API](https://www.openholidaysapi.org/de/). Dafür werden Land, Region und Zeitraum abgefragt; Personennamen werden nicht mitgesendet. Die Daten stehen unter [ODbL](https://www.openholidaysapi.org/de/faq/).

Optionale E-Mail-Sicherungen können Kalenderdaten enthalten. Empfänger und Zeitplan werden selbst eingerichtet; der automatische Versand ist standardmäßig ausgeschaltet.

Die Nextcloud-Aktion benötigt den separat installierten **TB-Connect Modul-Hub**. Der Hub und die Android-App sind nicht Teil dieses Repositories. Das Kalender-Raster funktioniert ohne sie; die Nextcloud-Anmeldung übernimmt der Hub.

## Entwicklung

```powershell
node ./test-person-calendar.cjs
./build-xpi.ps1 -OutputPath ./build/Kalender-Raster.xpi
```

Zum temporären Laden in Thunderbird **Add-ons debuggen → Temporäres Add-on laden …** öffnen und `manifest.json` auswählen. Automatisierte Tests ersetzen keine Bedienprüfung in Thunderbird.

## Testdiagnose

Mit `-ReleaseName test_diagnostics` gebaute Pakete aktivieren den Diagnoseknopf. Normale Pakete bleiben deaktiviert. [Anleitung und Protokollformat](../../docs/DIAGNOSTICS.md).
