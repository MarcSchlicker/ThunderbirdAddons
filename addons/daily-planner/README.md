# Tagesplaner

Termine, Aufgaben und eingeplante Mails in einer Ãœbersicht fÃ¼r Thunderbird. Der Tagesplaner liest vorhandene Thunderbird-Kalender und benÃ¶tigt das Kalender-Raster nicht.

## Funktionen

- Aufgaben mit Datum, mehrzeiligen Notizen und Erledigt-Status.
- Bereiche fÃ¼r Ã¼berfÃ¤llige EintrÃ¤ge, heute, morgen und undatierte Aufgaben.
- Aufgaben bearbeiten, sortieren und per Drag-and-drop umplanen.
- Nachrichten Ã¼ber **Planen** oder das KontextmenÃ¼ einem Datum zuordnen.
- Eingeplante Mails aus der Ãœbersicht wieder Ã¶ffnen.
- Optional beim Thunderbird-Start oder zu konfigurierten Zeiten anzeigen.
- Helle und dunkle Darstellung.

## Installation und Bedienung

BenÃ¶tigt Thunderbird **128 oder neuer**.

1. Mit `./build-xpi.ps1` ein XPI bauen.
2. Thunderbird â†’ **Add-ons und Themes** â†’ Zahnrad â†’ **Add-on aus Datei installieren â€¦**.
3. Das XPI auswÃ¤hlen und den Zugriffshinweis lesen.
4. Den **Tagesplaner** Ã¼ber die linke Seitenleiste Ã¶ffnen.

Die [Bedienungsanleitung](BEDIENUNG.md) erklÃ¤rt Aufgaben und Mail-VerknÃ¼pfungen. Startverhalten und tÃ¤gliche Wechselzeiten lassen sich unter **Einstellungen** Ã¤ndern.

## Daten und optionale Verbindungen

Aufgaben, Notizen, Einstellungen und Mail-Verweise liegen im lokalen Add-on-Speicher. Bei eingeplanten Nachrichten werden Metadaten wie Betreff, Absender und Ordner gespeichert, keine Nachrichtentexte oder AnhÃ¤nge. Die ursprÃ¼nglichen Nachrichten verbleiben in ihren Mailkonten.

Die optionale GerÃ¤teverbindung kann Planerdaten an gekoppelte GerÃ¤te Ã¼bertragen. FÃ¼r den gemeinsamen Modulabgleich ist der separat installierte **TB-Connect Modul-Hub** erforderlich. Hub und Android-App sind ebenfalls Teil dieses Repositories; die lokale Planung funktioniert unabhÃ¤ngig davon. Die direkte lokale Verbindung bleibt zur KompatibilitÃ¤t erhalten.

## Entwicklung

```powershell
node ./tests/core.test.js
./build-xpi.ps1 -OutputPath ./build/Tagesplaner.xpi
```

Kalenderzugriff und optionale lokale GerÃ¤teverbindungen verwenden eine interne Thunderbird-Experiment-Schnittstelle. Automatisierte Tests ersetzen keine BedienprÃ¼fung in Thunderbird.

## Testdiagnose

Mit `-ReleaseName test_diagnostics` gebaute Pakete aktivieren den Diagnoseknopf. Normale Pakete bleiben deaktiviert. [Anleitung und Protokollformat](../../docs/DIAGNOSTICS.md).


### Eigener Tab

Beim Ã–ffnen aktiviert der Tagesplaner einen vorhandenen Tab mit exakt seiner eigenen URL. Fehlt dieser, wird ein neuer Tab angelegt. Ein aktiver Kalender-, Mail- oder sonstiger Tab wird dafÃ¼r niemals umgewidmet. Regression: `node --test addons/daily-planner/tests/navigation.test.cjs`. Nach einem Update Kalender geÃ¶ffnet lassen â†’ Tagesplaner Ã¶ffnen â†’ Kalender bleibt unverÃ¤ndert erreichbar; erneutes Ã–ffnen aktiviert denselben Tagesplaner.

## Lizenz und Datenschutz

Eigener Code: [MPL 2.0](LICENSE). [LizenzÃ¼bersicht](../../LICENSING.md), [Datenschutz](../../docs/PRIVACY.md) und [Release-Status](../../docs/RELEASE.md).
