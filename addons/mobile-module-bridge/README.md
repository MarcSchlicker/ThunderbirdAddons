# TB-Connect Modul-Hub

[Funktionen und Bedienung](BEDIENUNG.md)

Ab 2.0.24 wird der App-Ordner ausdrücklich per WebDAV `MKCOL` angelegt und ein
vorhandener Ordner geprüft. Es besteht keine Abhängigkeit vom optionalen
Auto-Mkcol-Header. Solange Thunderbird läuft, erfolgt der Cloud-Abgleich alle
60 Sekunden; parallele Aufrufe teilen denselben laufenden Abgleich.
HTTP 403 wird als fehlende Berechtigung und mit der betroffenen Phase angezeigt.
Referenz: [Nextcloud WebDAV](https://docs.nextcloud.com/server/stable/developer_manual/client_apis/WebDAV/basic.html).

Dieses verpflichtende Desktop-Add-on stellt den token-geschützten Datenhub für TB-Connect-Module bereit: lokal im privaten Netz und optional über Nextcloud-WebDAV.

## Was es macht

- Zeigt unterstützte Desktop-Add-ons, erkannte Thunderbird-Erweiterungen und zusätzliche HTTPS-/GitHub-Modulquellen.
- Koppelt mehrere Mobilgeräte und weitere Desktops primär über einen kurzlebigen QR-Code; der Textcode ist nur die Alternative.
- Erkennt der Desktop seine WLAN-Adresse nicht automatisch, wird diese vor dem Koppeln einmal im Hub eingetragen. Dadurch kann der QR-Code nie einen unbrauchbaren Platzhalter enthalten; die private IPv4-Adresse bleibt nur lokal im Add-on gespeichert.
- Speichert einen JSON-Zustand pro Modul und zeigt die letzten Abgleichzeiten.
- Stellt ausgewählte Module beim nächsten Abgleich für Mobil bereit und lädt Desktop-XPIs nur nach einer sichtbaren Nutzeraktion herunter.
- Überträgt Kalenderdaten direkt aus Thunderbirds Kalenderdienst, sobald Kalender Raster aktiv ist.
- Kann denselben Modulzustand optional über Nextcloud-WebDAV abgleichen. Für jede App entsteht dabei direkt im eigenen Nextcloud-Dateibereich ein getrennter Ordner wie `Thunderbird` oder `Trackerapp`. Die Einrichtung startet Nextcloud Login Flow v2 im Standardbrowser: Das normale Passwort bleibt auf der Nextcloud-Seite, der Hub speichert nur das daraus erzeugte, widerrufbare App-Passwort im Thunderbird-Passwortspeicher.
- Akzeptiert Desktop-Adapter nur lokal über `127.0.0.1`; Geräte im Netzwerk benötigen einen Kopplungstoken.

Das Protokoll, das feste Paketformat `tb-connect-module.json` und die Sicherheitsgrenzen sind in [`docs/MODULE_BRIDGE_PROTOCOL.md`](../../docs/MODULE_BRIDGE_PROTOCOL.md) beschrieben. Eine kopierbare Anleitung für eigene Module steht in [`docs/MODULE_AUTHORING.md`](../../docs/MODULE_AUTHORING.md).

Die aktuelle Portnummer ist TCP `47832`. Das Add-on ist für Thunderbird 128 oder neuer ausgelegt; es ist kein offizielles Mozilla- oder Thunderbird-Add-on.

## Nextcloud-Anmeldung und Wiederaufnahme

Nextcloud Login Flow v2 liefert das App-Passwort nur einmal. Der Hub speichert es
deshalb vor dem ersten WebDAV-Abgleich im Thunderbird-Passwortspeicher. Auf
Thunderbird 153 nutzt er die asynchronen Login-Manager-Methoden; ältere Versionen
werden über den vorhandenen API-Fallback unterstützt. Modulstände werden als
getrennte, serialisierte Änderungen gespeichert, damit ein laufender Modulabgleich
die Anmeldung nicht mit einem älteren Zustand überschreibt.

Android sichert den laufenden Login verschlüsselt im Keystore-geschützten Speicher
und nimmt ihn beim erneuten Öffnen der Verbindungsansicht wieder auf. Nach Erhalt
der Freigabe bleibt die Verbindung auch dann erhalten, wenn der erste WebDAV-Abgleich
fehlschlägt. „Aktiv“ bedeutet einen erfolgreichen Datenabgleich; ein nur gespeicherter
Zugang oder ein fehlgeschlagener Abgleich wird gesondert dargestellt.

Regressionstest: `node addons/mobile-module-bridge/tests/nextcloud-login.test.cjs`.
Der Test prüft moderne und ältere Passwortspeicher-Methoden sowie parallele
Modul-/Login-Speicherung. Er ersetzt keinen Login mit einem echten Nextcloud-Konto.

Referenz: [Nextcloud Login Flow v2](https://docs.nextcloud.com/server/stable/developer_manual/client_apis/LoginFlow/index.html#login-flow-v2).

## Nextcloud-CalDAV ab 2.0.23

Nach der Browser-Anmeldung: **Nextcloud-Kalender → Kalender abrufen**. Ein
vorhandener Kalender lässt sich ohne Duplikat in Thunderbird hinzufügen. Mit
Namen und Farbe kann nach Bestätigung auch ein echter Kalender direkt in
Nextcloud angelegt und eingebunden werden. Wiederholungsversuche verwenden
dieselbe Anfrage-ID, damit ein verlorener Antwortweg keine zweite Anlage auslöst.

Die Erkennung läuft über DAV-Benutzerprinzipal und Kalenderbereich, nicht über
einen aus dem Anzeigenamen geratenen Benutzerpfad. Nur HTTPS-Adressen im
konfigurierten Nextcloud-Ursprung/-Unterverzeichnis sind zulässig; Weiterleitungen
und fremde Hrefs erhalten keine Zugangsdaten. XML-Entitäten werden abgelehnt,
Anzeigenamen escaped und vorhandene Kalender nie überschrieben.

Thunderbirds eigener CalDAV-Anbieter verwaltet danach Cache, Synchronisation und
Anmeldung. Sein App-Passwort bleibt im Thunderbird-Passwortspeicher und wird
nicht an Android oder Kalender Raster geschickt. Das Entfernen der **Hub**-
Verbindung entfernt nicht automatisch native Thunderbird-Kalender oder deren
separat gespeicherten Anbieterzugang. Ein Widerruf des App-Passworts in Nextcloud
beendet beide Zugriffe.

Mobil erhält die Kalender weiter über die Hub-Projektion. Dies ist **kein** neuer
eigenständiger Android-CalDAV-Syncadapter. Der Knopf unter Kalender Raster →
Einstellungen öffnet diesen Bereich im Hub. Ein echter Konto-/Provider-Abgleich
muss nach XPI-Installation noch abgenommen werden.

Tests: `tests/caldav-registration.test.cjs`; `tests/caldav-discovery.test.cjs`
benötigt den vorhandenen Playwright-Testbrowser (auf Windows optional
`PW_BROWSER_CHANNEL=msedge`). Es werden ausschließlich Testantworten verwendet.

Quelle für den DAV-Endpunkt: [Nextcloud-Handbuch](https://docs.nextcloud.com/server/stable/admin_manual/issues/general_troubleshooting.html).

## Bestätigte Modulrevision

Ein erfolgreicher Kontakt ist noch keine Datenbestätigung. Android speichert den
empfangenen Zustand und bestätigt anschließend dessen `updatedAt` über `/v1/ack`.
Eine alte Bestätigung gilt nicht für eine neuere Revision. Die Modulkarte wird
erst grün, wenn alle Geräte, die dieses Modul als installiert melden, die aktuelle
Revision bestätigt haben. Ein noch nicht installiertes Modul zählt nicht als
erfolgreiche Installation; Downloadfehler werden rot angezeigt.

Auch ein Merge mit einem älteren Offline-Snapshot erzeugt bei geänderten Daten
eine neue Revision, damit alte Empfangsbestätigungen nicht weitergelten.

Regressionstests:
`node addons/mobile-module-bridge/tests/nextcloud-login.test.cjs` und
`node addons/mobile-module-bridge/tests/dashboard-status.test.cjs`.

Ab 2.0.22 können einzelne Desktop-Termine von Android 2.0.33 aus nach einer
Versionsprüfung geändert werden. Die Schnittstelle und Grenzen (lokaler Hub,
keine Serien-/Kalenderwechsel, kein stilles Überschreiben) stehen im
[Protokoll](../../docs/MODULE_BRIDGE_PROTOCOL.md#desktop-termine-bearbeiten-ab-hub-2022--android-2033).

## Cloud-Merge ab 2.0.26

Der Hintergrundkontext besitzt einen eigenen Zeitparser für den Cloud-Merge.
Beim lokalen Abschluss eines Uploads werden inzwischen gespeicherte Änderungen
und Löschmarker erneut berücksichtigt; sie gelangen beim folgenden Abgleich
in die Cloud. `tests/nextcloud-sync.test.cjs` reproduziert beide Fehler vor ihrer
Korrektur und prüft neue Aufgaben sowie paralleles Löschen mit Fixtures.
Die reale Browser-Freigabe und ein Test in beide Richtungen bleiben erforderlich.

## Lizenz und Datenschutz

Eigener Code: [MPL 2.0](LICENSE). [Lizenzübersicht](../../LICENSING.md), [Datenschutz](../../docs/PRIVACY.md) und [Release-Status](../../docs/RELEASE.md).


## Download-Paketierung ab Hub 2.0.31

Quellbeschreibungen und installierbare XPIs verwenden getrennte HTTPS-Basen. `build-xpi.ps1 -DownloadBaseUrl` benennt ausschließlich die Basis für mobile JSON-Beschreibungen. Erst `-XpiBaseUrl` aktiviert Desktop-Downloads. Der Builder erzeugt Namen wie daily-planner-2.0.10.xpi aus den jeweiligen aktuellen Manifesten; dieselben Namen erzeugt scripts/prepare-release.ps1. Alte fest eingetragene Release-Pfade werden nicht verwendet.

Ohne XpiBaseUrl bleiben Desktop-Downloads deaktiviert, auch wenn eine Quellbasis angegeben ist. Ohne Quellbasis bleiben die eingebetteten mobilen Beschreibungen verfügbar. Beide Basen müssen HTTPS verwenden und dürfen keine Zugangsdaten, Query oder Fragmente enthalten. Nur eine tatsächliche öffentliche Release-Assetbasis konfigurieren; ein GitHub-Entwurf ist kein öffentlich erreichbarer Download. Der Build prüft die Adressstruktur, nicht die externe Erreichbarkeit oder eine Store-Freigabe.

Prüfung: `node --test addons/mobile-module-bridge/tests/download-catalog.test.cjs` im Projektordner. Windows baut tatsächliche XPI-Dateien und liest den erzeugten Katalog; künstliche URLs werden nicht abgerufen. Gesamter Desktopstand: 49 Tests erfolgreich. Kein echter Download oder automatische Installation.
