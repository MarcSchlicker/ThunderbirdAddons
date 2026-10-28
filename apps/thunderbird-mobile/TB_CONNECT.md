# TB-Connect für Android

TB-Connect ergänzt die Thunderbird-für-Android-Quellbasis um Kalender, Tagesplaner und die Verbindung zum Desktop-Modul-Hub. Diese App ist Teil des gemeinsamen TB-Connect-Projekts; sie wird als Android-APK bereitgestellt, nicht als Thunderbird-XPI.

## Funktionsumfang

Mailkonten, Kalenderzugänge und Kalenderauswahl, bearbeitbare eigene Einzeltermine bei vorhandenen Rechten, Monats-/Wochen-/Tagesübersicht, bildschirmfüllender Tagesplan mit zwei Zeitspalten, Aufgaben und Desktop-Mailverweise. Konten bleiben lokal gespeichert; Anbieter können eine erneute Freigabe verlangen. Google-Testfreigaben sind keine unbegrenzt gültige Produktionsfreigabe. Ein Google-Mailzugang schaltet Kalenderrechte nicht automatisch frei. Wiederholungsserien und fremde schreibgeschützte Kalender sind eingeschränkt.

Der manuelle Abgleich zeigt Teilfehler; ein Kalenderproblem wird am betroffenen Kalender angezeigt und lässt sich dort stummschalten. Das ändert keine Rechte oder Anbieterfehler. Drittanbieter-Syncadapter und Hintergrundabrufe unterliegen Androids Einschränkungen.

## Build

Voraussetzungen und SDK-/JDK-Versionen stehen in [Upstream README](README.md) und den Gradle-Dateien. Aus diesem Ordner:

```powershell
./gradlew.bat :app-thunderbird:assembleFossDebug '-Ptb.performanceBuild=true' '-Ptb.releaseName=test_diagnostics'
```

Ergebnis: `app-thunderbird/build/outputs/apk/foss/debug/app-thunderbird-foss-debug.apk`. Das ist ein Testbuild. Nur Release-Namen mit `test_` aktivieren die lokale Diagnose. Ein öffentlicher Produktionsbuild benötigt die in [Release-Status](../../docs/RELEASE.md) aufgeführten Freigaben; bloßes Umbenennen macht aus der Test-APK keinen Release.

Bestehende Installationen nur mit derselben Paketkennung und Signatur aktualisieren. Ein Wechsel zur späteren eigenen Produktionskennung ist eine getrennte Migration; nicht deinstallieren oder App-Daten löschen, um eine Installation zu erzwingen.

## Herkunft

Basiert auf Thunderbird für Android / K-9 Mail. TB-Connect-Änderungen: Modul-Hub-Anbindung, Kalender, Tagesplaner und eigene sichtbare Identität. Die Änderungen sind im öffentlichen Git-Verlauf nachvollziehbar; [LICENSE](LICENSE) und [NOTICE](NOTICE) gelten unverändert. Fremde Datei- und Bibliothekslizenzen bleiben erhalten. [Datenschutz](../../docs/PRIVACY.md).
