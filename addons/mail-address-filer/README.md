# Mail-Ablage nach Adresse

Nachrichten mit einem Klick in den passenden Ordner verschieben. FÃ¼r jede eigene Mailadresse lÃ¤sst sich ein vorhandener Zielordner festlegen.

## Funktionen

- **Ablegen** markiert ausgewÃ¤hlte Nachrichten als gelesen und verschiebt sie in ihre zugeordneten Ordner.
- **Ungelesen** setzt den Lesestatus zurÃ¼ck.
- UnterstÃ¼tzt geÃ¶ffnete Nachrichten und Mehrfachauswahl.
- Erkennt die eigene Adresse bei eingehender Post Ã¼ber die EmpfÃ¤nger und bei gesendeter Post Ã¼ber den Absender.
- Bricht vor dem Verschieben ab, wenn eine notwendige Zuordnung fehlt.

Es gibt keinen automatischen Eingangsfilter: Die Ablage wird Ã¼ber die sichtbare Aktion ausgelÃ¶st.

## Installation und Einrichtung

BenÃ¶tigt Thunderbird **128 oder neuer**.

1. Mit `./build-xpi.ps1` ein XPI bauen.
2. Thunderbird â†’ **Add-ons und Themes** â†’ Zahnrad â†’ **Add-on aus Datei installieren â€¦**.
3. Das XPI auswÃ¤hlen und den Zugriffshinweis lesen.
4. In den Einstellungen fÃ¼r jede eigene Mailadresse einen vorhandenen Zielordner auswÃ¤hlen und speichern.

Die [Bedienungsanleitung](BEDIENUNG.md) beschreibt Ablage, Lesestatus und Ordnerwechsel. Nach dem Umbenennen oder Entfernen eines Zielordners die Zuordnung prÃ¼fen.

## Daten und Berechtigungen

Adress- und Ordnerzuordnungen werden im lokalen Add-on-Speicher abgelegt. Das Add-on verwendet Thunderbird-APIs, um Konten und Nachrichten zu lesen, den Lesestatus zu Ã¤ndern und Nachrichten zu verschieben. Es besitzt keinen eigenen Cloud-Dienst.

Die Anordnung der SchaltflÃ¤chen in der Nachrichtenansicht nutzt eine interne Thunderbird-Experiment-Schnittstelle. Neue Thunderbird-Versionen kÃ¶nnen Anpassungen erfordern. Das Add-on benÃ¶tigt weder Kalender-Raster noch Tagesplaner oder TB-Connect.

## Entwicklung

```powershell
node ./test-routing.js
node ./test-background.js
node ./test-header-layout.js
./build-xpi.ps1 -OutputPath ./build/Mail-Ablage.xpi
```

Automatisierte Tests ersetzen keine BedienprÃ¼fung mit einem Thunderbird-Testprofil.

## Testdiagnose

Mit `-ReleaseName test_diagnostics` gebaute Pakete aktivieren den Diagnoseknopf. Normale Pakete bleiben deaktiviert. [Anleitung und Protokollformat](../../docs/DIAGNOSTICS.md).

## Lizenz und Datenschutz

Eigener Code: [MPL 2.0](LICENSE). [Lizenzübersicht](../../LICENSING.md), [Datenschutz](../../docs/PRIVACY.md) und [Release-Status](../../docs/RELEASE.md).
