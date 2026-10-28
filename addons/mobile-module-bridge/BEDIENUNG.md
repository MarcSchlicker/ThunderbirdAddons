# TB-Connect Modul-Hub – Funktionen und Bedienung

Der Hub verbindet Thunderbird mit TB-Connect und stellt Daten mehrerer Module bereit.
Die XPI in Thunderbird über **Add-ons und Themes → Zahnrad → Add-on aus Datei installieren**
installieren. Anschließend den Hub über das Handy-Symbol in der Seitenleiste öffnen.

## Lokal koppeln

**Gerät koppeln** erzeugt einen fünf Minuten gültigen QR-Code. Diesen in der Android-App unter
**TB Connect → Verbindung → +** scannen. Die erkannte private PC-Adresse wird verwendet;
bei mehreren Netzwerkadaptern die tatsächlich erreichbare Adresse auswählen.
WLAN, Hotspot oder ein eigenes VPN funktionieren nur, wenn die Geräte einander erreichen und
die Firewall den Hub-Port zulässt. Die manuelle Codeeingabe ist eine Alternative zum Scanner.

Die Geräteübersicht zeigt Namen und letzte Abgleiche. Modulstatus unterscheidet Desktop-Daten,
Kontakt und bestätigten mobilen Empfang. **Aktualisieren** beziehungsweise **Modulstatus abrufen**
holt den aktuellen Stand. **Zugänge erneuern** widerruft den bisherigen gemeinsamen Zugang;
betroffene Mobilgeräte müssen neu gekoppelt werden.

## Nextcloud

Die HTTPS-Basisadresse eintragen, **Im Browser anmelden** wählen und den Zugriff auf der
Nextcloud-Seite erlauben. Zum Hub zurückkehren: er prüft die Anmeldung automatisch.
Alternativ ein Nextcloud-App-Passwort hinterlegen. Bei manueller Eingabe den tatsächlichen
Anmeldenamen verwenden. Auf dem Handy dasselbe Konto und denselben App-Ordner wählen.

Der Ordner **Thunderbird** wird direkt in den eigenen Dateien angelegt. Der Hub gleicht bei
geöffnetem Thunderbird jede Minute sowie auf Wunsch manuell ab. Gleichzeitige Dateiänderungen
werden über ETags erkannt. Eine Browser-Anmeldung ist noch kein erfolgreicher Datenabgleich.
Bei **403** die Dateizugriffsberechtigung des App-Passworts, Ordnerrechte und Serverregeln prüfen;
bei **401** die Anmeldung erneuern. Zugangsdaten bleiben im Thunderbird-Passwortspeicher.

## Echte Nextcloud-Kalender

Nach der Anmeldung **Kalender abrufen** wählen. Einen bestehenden Kalender in Thunderbird
hinzufügen oder mit Name und Farbe einen neuen anlegen. Wiederholtes Hinzufügen erzeugt
keinen zweiten lokalen Kalender. Thunderbird übernimmt die CalDAV-Synchronisierung.
Die App erhält die Termine beim Modulabgleich. Ein eigenständiger Android-CalDAV-Dienst
ist nicht Teil des Hubs. Das Entfernen der Hub-Verbindung entfernt keine separat angemeldeten
Thunderbird-Kalender; deren Zugang in Thunderbird beziehungsweise Nextcloud separat widerrufen.

## Module bereitstellen

Der Katalog zeigt bekannte und erkannte Desktop-Module. Eine HTTPS-Adresse einer
`tb-connect-module.json` oder eines unterstützten GitHub-Repositories hinzufügen, um weitere
Beschreibungen einzulesen. **Für Mobil bereitstellen** bietet das Paket beim nächsten Abgleich
am Handy an. Der Installationsstand bleibt sichtbar. XPI-Downloads werden anschließend
in Thunderbird manuell bestätigt. Vorschauen sind als solche gekennzeichnet.

Eigene Module: [Modulbeschreibung](../../docs/MODULE_AUTHORING.md) und
[Datenschnittstelle](../../docs/MODULE_BRIDGE_PROTOCOL.md).
Build: `./build-xpi.ps1`. Die technische [README](README.md) beschreibt Tests und Grenzen.
