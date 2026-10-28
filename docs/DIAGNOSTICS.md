# Testdiagnose

Kalender Raster, Tagesplaner und Mail-Ablage aktivieren die Diagnose ausschließlich, wenn beim Bauen `-ReleaseName test_<name>` angegeben wird. Beispiel: `./addons/daily-planner/build-xpi.ps1 -ReleaseName test_diagnostics`.

Normale Pakete verwenden `release`; der Diagnoseknopf ist dann deaktiviert. Entscheidend ist die eingebettete Datei `diagnostics/build-info.json`, nicht der nachträglich umbenannte Dateiname. Der Hub hat keinen entsprechenden Diagnoseknopf. Android nutzt `-Ptb.releaseName=test_diagnostics`; ohne `test_` bleibt die Testdiagnose deaktiviert.

Die Diagnose prüft technische Voraussetzungen mit künstlichen Daten. Sie ersetzt keine Konto-/Geräteabnahme und versendet nicht selbständig persönliche Testdaten. Exporte bleiben lokal, bis der Nutzer sie bewusst teilt.
