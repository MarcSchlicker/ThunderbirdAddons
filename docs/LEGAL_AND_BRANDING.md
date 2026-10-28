# TB-Connect: Herkunft, Marke und Veröffentlichung

## Klare Produktidentität

TB-Connect ist eine unabhängige, nicht offizielle Anwendung. In der sichtbaren Produktidentität verwendet dieses Projekt:

- den Namen **TB-Connect**;
- ein eigenes, neu erstelltes App-Symbol;
- den Add-on-Namen **TB-Connect Modul-Hub**;
- eigene Modul- und Protokollkennungen wie `de.tbconnect.modules.*` und `tb-connect-module-bridge/1`.

Die Anwendung, die Website, Screenshots, Store-Einträge und Werbematerial dürfen nicht den Namen Thunderbird, Mozilla-Logos oder Thunderbird-Logos als eigene Marke verwenden und dürfen keine Zugehörigkeit oder Unterstützung durch Mozilla nahelegen. Zulässig und nötig ist eine sachliche Herkunftsangabe, etwa: „Basiert auf den offenen Quellen von Thunderbird für Android; nicht offiziell und nicht verbunden.“

Thunderbird und die zugehörigen Logos sind Mozilla-Marken. Mozilla verlangt für veränderte Forks eine eigene sichtbare Bezeichnung und eigene Logos. Siehe die offiziellen [Markenrichtlinien](https://www.mozilla.org/en-US/foundation/trademarks/policy/) und die [Markenliste](https://www.mozilla.org/en-US/foundation/trademarks/list/).

## Open Source bleibt erhalten

Die Android-Quellen unter `apps/thunderbird-mobile/` stammen aus Thunderbird für Android. Deren Apache-2.0-Lizenz und `NOTICE` liegen unverändert in diesem Verzeichnis und müssen bei Weitergabe erhalten bleiben. Eigene Änderungen müssen die vorhandenen Lizenz- und Copyright-Hinweise respektieren.

Die technische Nutzung der Quellbasis bedeutet nicht, dass Thunderbird als Produktname oder Logo für TB-Connect verwendet werden darf.

## Wichtig für eine öffentliche Veröffentlichung

Die lokale Debug-APK behält momentan die Upstream-Paketkennung und die vorhandene OAuth-Konfiguration, damit die vorhandenen Mail- und Login-Funktionen beim Testen nicht eingeschränkt werden. Das ist **kein** Freigabezustand für einen öffentlichen Store-Release.

Vor einer öffentlichen Verteilung müssen Verantwortliche insbesondere:

1. eine eigene Android-Paketkennung, einen eigenen Release-Schlüssel und ein eigenes Update-Schema festlegen;
2. für Gmail, Microsoft, Yahoo, AOL und weitere aktivierte Provider eigene OAuth-Clients sowie passende Redirect-URIs registrieren;
3. alle sichtbaren Store-Texte, Screenshots, Hilfeseiten und das About-Fenster auf TB-Connect prüfen;
4. eine Datenschutzinformation und eine Kontaktadresse für TB-Connect bereitstellen;
5. die aktuellen Provider- und Store-Regeln sowie die Lizenzpflichten vor dem Release prüfen lassen.

Das senkt die naheliegenden Marken- und Lizenzrisiken deutlich, ersetzt aber keine Rechtsberatung für einen kommerziellen oder öffentlichen Release.

## Desktop-Kompatibilität

Der TB-Connect Modul-Hub ist ein eigenständiges Add-on, das in kompatiblen Thunderbird-Desktop-Versionen installiert werden kann. Diese Kompatibilitätsaussage ist keine Produktzugehörigkeit. In einer öffentlichen Beschreibung soll stets zusätzlich stehen: „Nicht offiziell und nicht mit Mozilla oder Thunderbird verbunden.“
