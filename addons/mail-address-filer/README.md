# Mail-Ablage nach Adresse

Nachrichten mit einem Klick in den passenden Ordner verschieben. Für jede eigene Mailadresse lässt sich ein vorhandener Zielordner festlegen.

## Funktionen

- **Ablegen** markiert ausgewählte Nachrichten als gelesen und verschiebt sie in ihre zugeordneten Ordner.
- **Ungelesen** setzt den Lesestatus zurück.
- Unterstützt geöffnete Nachrichten und Mehrfachauswahl.
- Erkennt die eigene Adresse bei eingehender Post über die Empfänger und bei gesendeter Post über den Absender.
- Bricht vor dem Verschieben ab, wenn eine notwendige Zuordnung fehlt.

Es gibt keinen automatischen Eingangsfilter: Die Ablage wird über die sichtbare Aktion ausgelöst.

## Installation und Einrichtung

Benötigt Thunderbird **128 oder neuer**.

1. Mit `./build-xpi.ps1` ein XPI bauen.
2. Thunderbird → **Add-ons und Themes** → Zahnrad → **Add-on aus Datei installieren …**.
3. Das XPI auswählen und den Zugriffshinweis lesen.
4. In den Einstellungen für jede eigene Mailadresse einen vorhandenen Zielordner auswählen und speichern.

Die [Bedienungsanleitung](BEDIENUNG.md) beschreibt Ablage, Lesestatus und Ordnerwechsel. Nach dem Umbenennen oder Entfernen eines Zielordners die Zuordnung prüfen.

## Daten und Berechtigungen

Adress- und Ordnerzuordnungen werden im lokalen Add-on-Speicher abgelegt. Das Add-on verwendet Thunderbird-APIs, um Konten und Nachrichten zu lesen, den Lesestatus zu ändern und Nachrichten zu verschieben. Es besitzt keinen eigenen Cloud-Dienst.

Die Anordnung der Schaltflächen in der Nachrichtenansicht nutzt eine interne Thunderbird-Experiment-Schnittstelle. Neue Thunderbird-Versionen können Anpassungen erfordern. Das Add-on benötigt weder Kalender-Raster noch Tagesplaner oder TB-Connect.

## Entwicklung

```powershell
node ./test-routing.js
node ./test-background.js
node ./test-header-layout.js
./build-xpi.ps1 -OutputPath ./build/Mail-Ablage.xpi
```

Automatisierte Tests ersetzen keine Bedienprüfung mit einem Thunderbird-Testprofil.

## Testdiagnose

Mit `-ReleaseName test_diagnostics` gebaute Pakete aktivieren den Diagnoseknopf. Normale Pakete bleiben deaktiviert. [Anleitung und Protokollformat](../../docs/DIAGNOSTICS.md).

## Lizenz und Datenschutz

Eigener Code: [MPL 2.0](LICENSE). [Lizenzübersicht](../../LICENSING.md), [Datenschutz](../../docs/PRIVACY.md) und [Release-Status](../../docs/RELEASE.md).
