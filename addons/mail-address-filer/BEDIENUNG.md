# Mail-Ablage nach Adresse – Funktionen und Bedienung

Die XPI in Thunderbird installieren. In den Add-on-Einstellungen für jede eigene Mailadresse
einen vorhandenen Zielordner wählen und **Einstellungen speichern** drücken.
Bei eingehender Post bestimmt die Empfängeradresse, bei gesendeter Post die Absenderadresse
die Ablage. Hat ein Konto nur eine eigene Adresse, kann diese als Rückfall verwendet werden.

In einer geöffneten Mail oder Mehrfachauswahl stehen **Ablegen** und **Ungelesen** zur Verfügung.
**Ablegen** markiert die Auswahl als gelesen und verschiebt sie in die zugeordneten Ordner.
Fehlt eine Zuordnung, wird vor dem Verschieben abgebrochen. **Ungelesen** ändert nur den Lesestatus.
Archivieren und Spam bleiben im Menü **Mehr** erreichbar; Löschen bleibt eine eigene Aktion.

Nach dem Umbenennen oder Entfernen eines Zielordners die Zuordnung erneut prüfen.
Das Add-on führt die Ablage über die sichtbaren Aktionen aus; es ist kein automatischer
Eingangsfilter. Eine mobile Regelbearbeitung ist nicht vorhanden.

Build: `./build-xpi.ps1`. Entwicklung und Tests: [README](README.md).
