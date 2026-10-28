# Eigene TB-Connect-Module erstellen

Der Modul-Hub verwendet absichtlich kleine, deklarative Dateien. Ein Modul
erhält dadurch einen Eintrag mit Logo, einen kontrollierten XPI-Download für
Thunderbird und optional ein Mobil-Paket – ohne dass ein Git-Repository Code in
TB-Connect Mobil ausführen kann.

## Minimaler Repository-Aufbau

```text
mein-modul/
├── tb-connect-module.json
├── assets/logo-square.png
├── release/mein-modul.xpi            # optional: Thunderbird-Add-on
└── tb-connect-mobile.json            # optional: mobile Beschreibung
```

Im Hub kann entweder die direkte HTTPS-Adresse der
`tb-connect-module.json` oder `https://github.com/<konto>/<repository>`
eingegeben werden. Für die zweite Form wird die Datei im `main`-Branch erwartet.
Alle relativen Adressen werden relativ zu der Manifestdatei aufgelöst.

## `tb-connect-module.json`

```json
{
  "schemaVersion": 1,
  "id": "de.beispiel.mein-modul",
  "name": "Mein Modul",
  "description": "Eine kurze, verständliche Beschreibung.",
  "icon": "assets/logo-square.png",
  "transport": "tb-connect-module-bridge-v1",
  "desktop": {
    "extensionId": "mein-modul@example.local",
    "install": { "xpi": "release/mein-modul.xpi" }
  },
  "mobile": {
    "entry": "mein-modul",
    "minimumAppVersion": 2,
    "package": {
      "url": "tb-connect-mobile.json",
      "sha256": "optionale-kleinbuchstaben-sha256-pruefsumme"
    }
  },
  "permissions": ["mein-modul.state.read", "mein-modul.state.write"]
}
```

`id` ist dauerhaft und besteht nur aus Buchstaben, Ziffern, Punkt, Unterstrich
oder Bindestrich. Das Logo ist erforderlich und sollte quadratisch sein. `desktop`
und `mobile` sind jeweils optional, aber mindestens einer der beiden Bereiche
muss vorhanden sein. URLs müssen HTTPS verwenden.

Die Schaltfläche **XPI herunterladen** öffnet bewusst einen Speichern-Dialog;
der Nutzer installiert die Datei anschließend selbst in Thunderbird. Das schützt
vor stillen Erweiterungsinstallationen.

## Mobil-Paket

```json
{
  "format": "tb-connect-mobile-package/1",
  "id": "de.beispiel.mein-modul",
  "entry": "mein-modul",
  "version": 1,
  "renderer": "native",
  "dataContract": "tb-connect-module-bridge/1"
}
```

Beim nächsten Abgleich lädt die App das Paket über HTTPS (maximal 256 KiB),
prüft ID, Einstieg und – falls angegeben – SHA-256 und speichert es lokal. Die
App führt keine Skripte, APKs oder HTML aus diesem Paket aus. Damit eine Karte
wirklich geöffnet werden kann, muss die installierte TB-Connect-Mobilversion
eine native Ansicht für `entry` enthalten. Das mitgelieferte Kalendermodul nutzt
beispielsweise `entry: "calendar"`.

## JSON-Daten austauschen

Der Hub stellt einen Zustand je `moduleId` bereit. Ein Desktop-Adapter sendet
auf `POST /v1/desktop-sync` nur über Loopback; Mobilgeräte senden auf
`POST /v1/sync` mit dem Kopplungstoken. Das gemeinsame Schema lautet:

```json
{
  "protocol": "tb-connect-module-bridge/1",
  "moduleId": "de.beispiel.mein-modul",
  "client": { "id": "desktop-mein-modul", "name": "Dieser Thunderbird", "kind": "desktop" },
  "updatedAt": "2026-08-27T12:00:00Z",
  "state": { "version": 1 }
}
```

Sende nur den eigenen JSON-Namensraum. Keine Mailinhalte, Passwörter,
OAuth-Tokens, Provider-URLs oder privaten Schlüssel. Das vollständige
Protokoll einschließlich Kopplung, Netzwerkgrenzen und Konflikten steht in
[`MODULE_BRIDGE_PROTOCOL.md`](MODULE_BRIDGE_PROTOCOL.md).
