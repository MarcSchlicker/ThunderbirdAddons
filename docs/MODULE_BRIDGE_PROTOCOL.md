# TB-Connect Modul-Hub – Datenschnittstelle

## Zweck und Stand

Der **TB-Connect Modul-Hub** ist das verpflichtende Desktop-Add-on, sobald ein Modul Daten zwischen TB-Connect Desktop und TB-Connect Mobil austauschen soll. Er ist bewusst ein eigenes Add-on und kein versteckter Teil des Tagesplaners:

- Er zeigt die unterstützten Desktop-Add-ons und ergänzte Modulquellen an.
- Er verwaltet Kopplungen zu mehreren Mobilgeräten oder weiteren TB-Connect-Desktops.
- Er hält pro Modul den gemeinsamen JSON-Zustand und die letzten Synchronisierungszeitpunkte fest.
- Der Tagesplaner und der Kalender sind die ersten Adapter für diese Schnittstelle.
- Version 2 verteilt zusätzlich einen deklarativen Mobilkatalog. Dadurch kann
  der Desktop ein Modul gezielt für das nächste Mobil-Synchronisieren
  bereitstellen, ohne dass das Mobilgerät Fremdcode ausführt.

Das Add-on liegt unter [`addons/mobile-module-bridge`](../addons/mobile-module-bridge). Der Tagesplaner meldet sich über eine reine Loopback-Verbindung beim Hub an. Fehlt der Hub, bleibt die frühere direkte Tagesplaner-Verbindung auf Port `47830` als Kompatibilitätsweg verfügbar; neue Module setzen dagegen den Hub voraus.

## Installation und Kopplung

1. Im Desktop-Mailprogramm zuerst `tb-connect-modul-hub.xpi` installieren und **TB-Connect Modul-Hub** öffnen.
2. Falls nötig, die passende Modul-XPI installieren, z. B. den Tagesplaner.
3. Im Modul-Hub **Gerät koppeln** wählen. Der sichtbare QR-Code ist fünf Minuten gültig.
4. Auf TB-Connect Mobil **Module** → **Verbindungen** öffnen und den QR-Code scannen. **Code eingeben** ist die Alternative.
5. Bei jedem verbundenen Desktop zeigt die mobile App zwei Stempel: den letzten erfolgreichen Abgleich des Mobilgeräts und den vom Desktop bestätigten Zeitpunkt. Der Modul-Hub zeigt denselben Stand je Gerät.

### Module installieren und für Mobil bereitstellen

Der Bereich **Unterstützte Module** enthält drei unterschiedliche Stände:

- **Desktop installiert**: Das Add-on ist in Thunderbird aktiv und kann Daten an
  den Hub liefern.
- **XPI herunterladen**: Der Hub öffnet einen normalen Speichern-Dialog für die
  XPI. Anschließend muss sie über Thunderbirds sichtbares **Add-on aus Datei
  installieren …** bestätigt werden. Eine Erweiterung darf keine andere XPI
  still installieren; das ist absichtlich eine Thunderbird-Sicherheitsgrenze.
- **Für Mobil bereitstellen**: Der Hub markiert das Modul im gekoppelten
  Mobilkatalog. Der Hub zeigt anschließend einen Fortschrittsbalken je
  verbundenem Mobilgerät. Beim nächsten Abgleich erscheint in TB-Connect Mobil
  zunächst **Download verfügbar**. Erst nach dem sichtbaren Klick wird das
  deklarative Paket installiert und als **Installiert** zurückgemeldet.

Zusätzlich werden alle im Thunderbird-Profil erkannten Erweiterungen angezeigt.
Ohne `tb-connect-module.json` bleiben sie bewusst als *erkannt*, aber erhalten
keinen Datenzugriff oder Mobil-Button.

Ein weiteres Notebook oder ein zweiter Desktop wird identisch gekoppelt. Die mobile App gleicht beim manuellen Synchronisieren alle gespeicherten Desktops nacheinander ab. Nicht erreichbare Desktops bleiben sichtbar und bekommen keinen neuen Stempel. Im Hub werden Mobilgeräte fortlaufend nummeriert; ihr Anzeigename kann dort frei gesetzt werden und bleibt beim nächsten Abgleich erhalten.

TB-Connect Mobil gleicht beim Öffnen einer Modulansicht sofort ab und plant bei
vorhandener Verbindung zusätzlich einen Hintergrundabgleich. Android erlaubt
diesen periodischen Job frühestens ungefähr alle 15 Minuten und kann ihn bei
Energiesparen verschieben; deshalb ersetzt er keinen sichtbaren manuellen
Abgleich.

## Netz und Sicherheit

| Zweck | Port | Richtung |
| --- | ---: | --- |
| Modul-Hub v1 | TCP `47832` | Mobilgerät/anderer Desktop → Thunderbird Desktop |
| früher Tagesplaner-Kompatibilitätsweg | TCP `47830` | Mobilgerät → Thunderbird Desktop |
| frühere Tagesplaner-Suche | UDP `47831` | Mobilgerät ↔ Thunderbird Desktop |

Die aktuelle Hub-Kopplung verwendet einen sichtbaren QR-Code mit kurzlebigem Inhalt statt eines dauerhaft offenen Suchdienstes. Das ist robuster in isolierten WLANs und erlaubt, für jeden Desktop den richtigen Endpunkt zu sehen. Der Textcode im aufgeklappten Bereich ist nur die Alternative. Zugelassen sind ausschließlich private IPv4-Netze (`10/8`, `100.64/10`, `172.16/12`, `192.168/16`), also auch WireGuard- und Bluetooth-PAN-Adressen. Öffentliche Internet-Adressen lehnt die mobile App ab.

Der Kopplungscode enthält eine kurzlebige Sitzung. Beim ersten erfolgreichen Austausch erhält das Gerät einen zufälligen, dauerhaften Zugangscode. Dieser liegt zusammen mit dem Tagesplaner-Zustand verschlüsselt im Android Keystore. Falls genau diese HTTP-Antwort unterwegs verloren geht, darf derselbe Client die noch gültige Sitzung wiederholen; der Hub gibt dann denselben Zugang zurück. Andere Geräte können eine bereits verwendete Sitzung nicht übernehmen. **Zugänge erneuern** im Desktop-Hub macht alle bisherigen Codes ungültig; die Geräte müssen danach neu gekoppelt werden.

Der Transport ist für private WLANs, Bluetooth-PAN und ein eigenes VPN gedacht. Er ist kein Internetdienst und ersetzt kein Ende-zu-Ende-verschlüsseltes Synchronisationssystem. In fremden oder offenen WLANs sollte stattdessen ein eigenes VPN verwendet werden.

## Optionale Nextcloud-WebDAV-Synchronisation

Zusätzlich zur privaten WLAN-Brücke kann TB-Connect denselben Modulzustand über eine eigene Nextcloud-Instanz abgleichen. Das ist ein **zweiter Transport**, nicht der Ersatz für QR-Kopplung: Lokales WLAN, Hotspot und WireGuard bleiben ohne Cloud nutzbar.

### Einrichten

1. Im Modul-Hub unter **Nextcloud** nur die Basisadresse (etwa `cloud.beispiel.de` oder `https://cloud.beispiel.de`) und den App-Ordner eingeben und **In Nextcloud anmelden** wählen. Eine Adresse ohne Protokoll wird sicher als HTTPS ergänzt. In TB-Connect Mobil ist dieselbe Einrichtung unter **Module → Verbindungen → Nextcloud einrichten** verfügbar.
2. TB-Connect startet [Nextcloud Login Flow v2](https://docs.nextcloud.com/server/stable/developer_manual/client_apis/LoginFlow/index.html) auf der echten Nextcloud-Anmeldeseite. Dort erfolgt Anmeldung einschließlich 2FA; das normale Konto-Passwort wird nicht an TB-Connect übergeben.
3. Nach der Freigabe erhält jede Installation ein separates, widerrufbares Nextcloud-App-Passwort und prüft damit den WebDAV-Zugang, bevor sie Daten schreibt. Der Anmeldecode verfällt nach 20 Minuten.
3. Als App-Ordner eignet sich für diese App `Thunderbird`. Eine weitere App verwendet einfach einen anderen Ordner, zum Beispiel `Trackerapp`.

Der erste erfolgreiche Abgleich legt automatisch diese Dateien an:

```text
Thunderbird/                   # oder Trackerapp, …
  tb-connect-manifest.json     # Ordnerkennung, ohne Geheimnisse
  tb-connect-sync.json         # versionierter Modulzustand
```

Die Grundlage ist der authentisierte Nextcloud-WebDAV-Pfad `/remote.php/dav/files/<benutzer>/…`. Der Hub und die App prüfen dort zunächst die Anmeldung und legen den gewählten App-Ordner direkt im eigenen Nextcloud-Dateibereich an. Sie schreiben mit dem Nextcloud-Header `X-NC-WebDAV-AutoMkcol: 1`, sodass der Ordner nicht vorher manuell angelegt werden muss. HTTPS ist zwingend; Weiterleitungen werden nicht verfolgt, damit ein App-Passwort nicht an eine andere Adresse gelangt.

### Datenformat und Konflikte

`tb-connect-sync.json` nutzt das Format `tb-connect-nextcloud/1`:

```json
{
  "format": "tb-connect-nextcloud/1",
  "appFolder": "Thunderbird",
  "revision": 12,
  "updatedAt": "2026-10-11T10:00:00Z",
  "modules": {
    "de.tbconnect.modules.daily-planner": {
      "state": { "tasks": [], "appointments": [] },
      "updatedAt": "2026-10-11T10:00:00Z"
    }
  },
  "catalog": [],
  "clients": {}
}
```

Vor dem Schreiben wird die Datei gelesen. Ihr `ETag` kommt als `If-Match` beziehungsweise `If-None-Match` zurück in die Schreibanfrage. Ändert ein anderes Gerät die Datei gleichzeitig, liest TB-Connect erneut und vereinigt die Daten statt blind zu überschreiben. Der Tagesplaner vereinigt Aufgaben, App-Termine und ihre Löschmarker pro ID und Zeitstempel. Der Kalender bleibt desktopgeführt; ein Telefon darf einen aktuellen Thunderbird-Kalender nicht mit seinem Cache ersetzen.

Das Passwort selbst erscheint weder in den Nextcloud-Dateien noch in Logs. Der Desktop legt es im Thunderbird-Passwortspeicher ab; auf Android liegt der gesamte Verbindungsdatensatz, einschließlich App-Passwort, AES-GCM-verschlüsselt hinter einem Android-Keystore-Schlüssel. Nextcloud schützt die Dateien über das Konto, aber der Transport fügt **keine** zusätzliche Ende-zu-Ende-Verschlüsselung des JSON-Inhalts hinzu. Wer den Zugriff entziehen will, widerruft das jeweilige App-Passwort in Nextcloud und entfernt die Verbindung lokal.

### Wechselnde WLAN-IP

Nach einer erfolgreichen ersten Kopplung speichert TB-Connect zusätzlich die
`workspaceId` der Hub-Antwort. Der QR-Code enthält absichtlich nur die aktuell
ausgewählte Adresse: Das hält ihn klein und zuverlässig lesbar. Der Hub ermittelt
die Windows-Netzadressen direkt über Thunderbirds Netzwerkdienst; ein gespeicherter
manueller Wert wird nur erneut benutzt, solange er noch erkannt wird. Ist die
Adresse später nicht erreichbar, tastet die App einmalig nur das aktuelle private
`/24`-Netz über `GET /v1/health` ab. Dieser Check enthält keinen Token und ein
Treffer wird nur akzeptiert, wenn seine `workspaceId` exakt dem gekoppelten Desktop
entspricht. Erst danach folgt der gewöhnliche token-geschützte Abgleich, der die
gespeicherte Adresse aktualisiert. Ältere Verbindungen ohne Workspace-ID werden in
**Module → Verbindungen** klar als nicht erreichbar angezeigt und müssen einmal
neu gekoppelt werden.

## HTTP-Protokoll v1

Basisadresse: `http://<private-desktop-adresse>:47832`

Alle Antworten sind JSON und enthalten keine Mailinhalte. Die maximale Anfragegröße beträgt 1 MiB.

### Erste Kopplung

`POST /v1/pair`

```json
{
  "protocol": "tb-connect-module-bridge/1",
  "sessionId": "kurzlebige-sitzung",
  "pairingSecret": "kurzlebiges-geheimnis",
  "moduleId": "de.tbconnect.modules.daily-planner",
  "client": {
    "id": "mobile-…",
    "name": "TB-Connect Mobil",
    "kind": "mobile"
  },
  "updatedAt": "2026-08-17T12:00:00Z",
  "state": {
    "version": 1,
    "tasks": [],
    "appointments": [],
    "deletedTasks": [],
    "deletedAppointments": []
  }
}
```

Eine erfolgreiche Antwort liefert den gemeinsamen `state`, `updatedAt`, `serverSyncAt` und einmalig `token`. Das Gerät speichert diesen Token verschlüsselt. Seit Hub 2.0 enthält die Antwort außerdem `moduleCatalog`: die für Mobil bereitgestellten, deklarativen Module. Die App lädt dazugehörige Datenpakete nur über HTTPS, wenn kein mitgeliefertes Hub-Paket als Offline-Fallback vorhanden ist. Auch dieses Fallback ist reines JSON, kommt nur über den token-geschützten Hub und wird vor der Installation geprüft.

### Regelmäßiger Abgleich

`POST /v1/sync` mit Header `X-TB-Connect-Module-Token: <token>` und demselben Nachrichtenschema (ohne Sitzungswerte). Der Hub speichert den Zustand pro `moduleId` und gibt den aktuellsten bekannten Zustand zurück.

### Inhalt des QR-Codes

Der Desktop erzeugt lokal eine URL im folgenden Format. Sie wird nicht an einen externen QR-Dienst übertragen:

```text
tb-connect://pair?host=http%3A%2F%2F192.168.1.10%3A47832&session=<kurzlebige-sitzung>&secret=<kurzlebiges-geheimnis>&v=3
```

Die Mobil-App akzeptiert beim Scan nur das Schema `tb-connect://pair` und prüft anschließend, dass der Endpunkt eine private Netzwerkadresse ist. Sitzung und Geheimnis sind fünf Minuten gültig und werden nach erfolgreicher Kopplung durch einen dauerhaften lokalen Zugangstoken ersetzt. Eine wiederholte Anfrage derselben Mobilinstallation bleibt bis zum Ablauf der Sitzung idempotent, damit ein verlorenes HTTP-Paket nicht zu einem unbrauchbaren Code führt.

Der Desktop-Adapter eines installierten Moduls darf ausschließlich über `POST /v1/desktop-sync` auf `127.0.0.1` den eigenen Zustand einreichen. Dadurch kann kein Netzgerät ohne Token als Desktop-Modul schreiben.

### Konflikte

Der Hub löst den Gesamtzustand nach `updatedAt` auf. Der Tagesplaner löst Aufgaben und in TB-Connect angelegte Termine zusätzlich pro Eintrags-ID nach `updatedAt` auf. So bleibt eine auf dem Handy erledigte Aufgabe erhalten, wenn auf dem Desktop parallel eine andere Aufgabe hinzugefügt wird. Gleicher Eintrag zur gleichen Zeit: der spätere Zeitstempel gewinnt. Jede Löschung wird als dauerhafter `deletedTasks`- beziehungsweise `deletedAppointments`-Tombstone mit `id` und `deletedAt` abgeglichen. Ein älteres Offline-Gerät kann den Eintrag deshalb nicht wiederherstellen; nur ein absichtlich neu angelegter Eintrag mit neuer ID erscheint wieder.

## Modul-Paket und Katalog

Ein Repository stellt eine Datei mit dem festen Namen **`tb-connect-module.json`** bereit. Im Hub kann entweder ihre direkte HTTPS-Adresse oder die URL eines GitHub-Repositories angegeben werden; bei GitHub wird `main/tb-connect-module.json` verwendet. Beispiel:

```json
{
  "schemaVersion": 1,
  "id": "de.example.my-module",
  "name": "Mein Modul",
  "description": "Kurze Beschreibung.",
  "icon": "assets/logo-square.png",
  "transport": "tb-connect-module-bridge-v1",
  "desktop": {
    "extensionId": "my-module@example.local",
    "install": { "xpi": "release/my-module.xpi" }
  },
  "mobile": {
    "entry": "my-module",
    "minimumAppVersion": 2,
    "package": { "url": "tb-connect-mobile.json", "sha256": "optional-hex-sha256" }
  },
  "permissions": ["my-module.state.read", "my-module.state.write"]
}
```

Alle relativen URLs werden relativ zur Manifestdatei aufgelöst und müssen HTTPS
sein. `icon` muss ein quadratisches Logo referenzieren. Der Katalog lädt nur die
Beschreibung und zeigt ihre Installationsinformation. Thunderbird verlangt
weiterhin eine sichtbare XPI-Installation, und Android darf keine fremden
nativen Module aus einem Git-Repository nachladen.

Ein Mobil-Paket ist deshalb **kein APK und kein JavaScript-Bundle**, sondern ein
begrenztes JSON-Dokument:

```json
{
  "format": "tb-connect-mobile-package/1",
  "id": "de.example.my-module",
  "entry": "my-module",
  "version": 1,
  "renderer": "native",
  "dataContract": "tb-connect-module-bridge/1"
}
```

TB-Connect Mobil prüft Format, Modul-ID, Einstieg und optionale SHA-256-Summe,
speichert höchstens 256 KiB und führt daraus keinen Code aus. Eine Karte für ein
solches Modul wird im Mobilkatalog angezeigt; öffnen kann sie erst, wenn die
installierte App eine passende native Ansicht für `entry` enthält. Damit können
auch reine Mobilmodule verteilt und sichtbar gemacht werden, ohne die
Android-Sicherheitsgrenze zu umgehen.

### Installations- und Gerätestatus

Ein Mobilgerät sendet bei jedem erfolgreichen Abgleich optional
`moduleInstallations`. Jeder Eintrag enthält nur `id`, `entry`, `status` und
`installedAt`. Der Hub gibt diese Werte mit `status.peers[]` an Desktop-Adapter
zurück. Dadurch kann ein Add-on sehen, ob und wie viele Handys verbunden sind,
ohne Zugriff auf ihre Inhalte zu erhalten. Der Hub markiert einen seit mehr als
20 Minuten nicht aktualisierten Mobilstatus rot; ein expliziter Paketfehler wird
sofort rot dargestellt.

### Datenverträge der mitgelieferten Module

| Modul | Richtung | JSON-Zustand |
| --- | --- | --- |
| Tagesplaner | Desktop ↔ Mobil | `tasks`, in TB-Connect angelegte `appointments`, eingeplante `emails`, Einstellungen und ein rollierender 32-Tage-Ausschnitt der Thunderbird-Kalender. Aufgaben und App-Termine werden pro ID nach `updatedAt` vereinigt; Löschungen bleiben als Tombstones erhalten. |
| Kalender | Thunderbird Desktop → Mobil | sichtbare Kalender, jeweils mit `id`, `name`, `provider`, `endpointHint` (nur Hostname) und Schreibschutz, sowie maximal 1.500 Termininstanzen im Zeitraum vom Vormonat bis zum übernächsten Monat. Mobil ist absichtlich lesend und kann den Desktop-Kalender nicht überschreiben. |

Der Kalenderkanal wird nur aktiviert, wenn **Kalender Raster** auf dem Desktop
aktiv ist. Die Daten kommen direkt aus Thunderbirds Kalenderdienst; Passwörter,
OAuth-Tokens, Mailtexte und Kalender-Provider-URLs gehören nicht in den
Modulzustand. `endpointHint` ist ausschließlich ein bereinigter Hostname, nie
eine vollständige URL, ein Nutzername, ein Pfad oder ein Geheimnis.

In **Kalender → Zugänge** zeigt TB-Connect die vom Desktop gemeldeten
Kalenderprofile. Der Button **In Android anmelden** öffnet die sichere
System-Kontoverwaltung von Android; bei Google wird Google direkt vorgewählt.
Für CalDAV oder andere Anbieter muss auf dem Telefon ein kompatibler
Kalender-Provider eingerichtet sein. Desktop-Zugangsdaten werden bewusst nicht
kopiert oder übertragen.

Ein Modul, das Daten austauscht, implementiert einen Adapter für das oben beschriebene Protokoll. Es sendet nur seinen eigenen JSON-Namensraum und darf weder Passwörter noch Mailtexte oder OAuth-Tokens in den Modulzustand schreiben.

## Daten in Mailordnern

Technisch kann IMAP auch JSON als Anhang einer Nachricht speichern. Das ist aber kein guter Standard-Datenspeicher: Provider wie Gmail indizieren, begrenzen und verändern Nachrichtenabläufe. Die Modul-Brücke nutzt deshalb lokalen verschlüsselten Gerätespeicher plus den lokalen Desktop-Hub. Ein späterer optionaler IMAP-Export müsste als eigene, verschlüsselte Funktion mit Konfliktanzeige umgesetzt werden und darf normale Mails nie überschreiben.

## Prüfung

### Desktop-Termine bearbeiten ab Hub 2.0.22 / Android 2.0.33

`POST /v1/calendar-edit` benötigt immer den regulären Header
`x-tb-connect-module-token`; ein QR-Sitzungsgeheimnis reicht nicht aus.
Beide Aktionen senden `protocol: "tb-connect-module-bridge/1"`, `calendarId`
und `itemId` (native UID, ausdrücklich nicht der Anzeigename oder Hash-ID).

- `action: "read"`: lädt den aktuellen Termin direkt aus dem Desktop-Kalender.
  Antwort: `event` und `editVersion`, ein SHA-256-Fingerabdruck der aktuellen ICS.
- `action: "update"`: zusätzlich `expectedVersion`, `title`, `location`,
  `startMillis` und `endMillis` (UTC-Epoch-Millisekunden). Der Hub vergleicht den
  aktuellen ICS-Fingerabdruck vor dem Schreiben; Abweichungen liefern HTTP 409.
  Er ruft anschließend `modifyItem(copy, original)` auf, sodass zusätzlich die
  Konfliktkontrolle des Kalenderanbieters gilt. Kein Force-Overwrite.

Unbekannte Tokens erhalten 401. Unbekannte/ausgeblendete, schreibgeschützte
Kalender und Serien werden abgewiesen. Die erste Umsetzung erlaubt einzelne
Termine einschließlich mehrtägiger Dauer; Ganztag bleibt Ganztag und benötigt
volle UTC-Tage. Unterstützte Jahre: 2000–2200. Kalenderwechsel, Serienänderungen
und Einladungsversand bleiben in Thunderbird. Änderungen werden nicht offline
oder über Nextcloud gepuffert: dafür ist eine erreichbare lokale Hub-Verbindung
erforderlich. Die App lässt den gewünschten Desktop vor dem Öffnen auswählen.
Der Editor rechnet zeitgebundene Termine anhand ihrer UTC-Zeitpunkte in die
Gerätezeitzone um; lokale Desktop-Uhrzeiten werden nicht als Handy-Uhrzeit
interpretiert. Ganztagsdaten bleiben davon ausgenommen.

Nach einer Änderung liest der Hub die Kalenderprojektion erneut. Ein älterer
Kalendercache im Tagesplaner darf diese Projektion nicht zurückrollen, auch wenn
zwischenzeitlich eine neuere Aufgabe gespeichert wurde. Regressionstests:
`addons/mobile-module-bridge/tests/calendar-edit.test.cjs` und
`addons/mobile-module-bridge/tests/nextcloud-login.test.cjs`.

### Bestätigter Mobil-Empfang ab Hub 2.0.20 / Android 2.0.32

Ein Kontakt oder eine versandte HTTP-Antwort ist noch kein Empfangsbeleg. Android
speichert die empfangenen Modulzustände verschlüsselt und sendet danach pro Modul
`POST /v1/ack` mit demselben Zugangstoken im Header `x-tb-connect-module-token`.
Der JSON-Body enthält `protocol: "tb-connect-module-bridge/1"`, `moduleId`,
`client: { id }` und `receivedUpdatedAt` aus der vorangegangenen Sync-Antwort.
Nur wenn diese Version exakt dem Hub-Zustand entspricht, antwortet der Hub 200
und setzt `moduleReceipts[moduleId].confirmedAt` und `confirmedUpdatedAt`.
Veraltete Versionen erhalten 409; unerlaubte Tokens erhalten 401. Der nächste
normale Abgleich kann die Bestätigung wiederholen. Ältere Apps bleiben nutzbar,
zeigen im neuen Hub aber erst nach einem App-Update bestätigten Empfang.

Die neue Kalenderprojektion führt für zeitgebundene Start-/Endwerte zusätzlich
`epochMillis` (UTC-Millisekunden) und durchgehend `calendarId`. Kalenderzuordnung
und Filter dürfen niemals aus einer Namensgleichheit abgeleitet werden.

- Android: `apps/thunderbird-mobile` → `./gradlew :app-thunderbird:assembleFossDebug`
- Tagesplaner-Kern: `node addons/daily-planner/tests/core.test.js`
- Tagesplaner-XPI: `powershell -ExecutionPolicy Bypass -File addons/daily-planner/build-xpi.ps1`

Für einen realen Abgleich müssen Desktop und Mobilgerät über dasselbe private WLAN, ein geroutetes eigenes VPN oder Bluetooth-PAN erreichbar sein. Für den ersten Desktop-Hub-Test muss die Firewall TCP `47832` für private Netze zulassen.
