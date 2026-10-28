# Daten und Datenschutz

Stand: 28. Oktober 2026. Diese Information beschreibt den vorliegenden Quellstand und seine Grenzen.

## Desktop

Einstellungen, Personen-/Kalenderzuordnungen, Aufgaben, Notizen und Mailverweise werden im jeweiligen Thunderbird-Profil gespeichert. Mailverweise können Betreff, Absender und Nachrichtenkennung enthalten. Kalenderbearbeitung schreibt an den in Thunderbird eingerichteten Anbieter. Die Mail-Ablage verschiebt markierte Nachrichten in die vom Nutzer gewählten Ordner. Profil und Sicherungen sind entsprechend vertraulich zu behandeln.

## Geräteabgleich

Der optionale Modul-Hub überträgt ausgewählte Kalender-/Planerdaten und Mailmetadaten an gekoppelte Geräte. Der Hub nutzt einen lokalen HTTP-Dienst auf TCP 47832 mit Kopplungstoken. **Der HTTP-Transport selbst ist nicht verschlüsselt.** Ein Token ist keine Transportverschlüsselung. Kein Portforwarding und keine Nutzung in ungeschützten Netzen; für externen Zugriff ist ein eigenes geschütztes Netz erforderlich. Eine allgemeine sichere öffentliche Hub-Freigabe und die Erfüllung der Thunderbird-Reviewvorgaben für diesen Transport sind noch offen. QR-Neukopplung ist für diesen Release noch nicht abgenommen.

Android speichert die Verbindung mit Android-Keystore-Schutz; das schützt nicht den HTTP-Transport. Kalenderrechte werden über Android angefragt. Google-Kalenderanmeldung führt zur Anbieterfreigabe; OAuth-Tokens gehören nicht in Logs oder Fehlerberichte. Anmeldungen vom Desktop werden nicht kopiert. Kalenderdaten gehen bei aktiviertem Anbieterabgleich an den jeweils gewählten Anbieter.

## Optionale externe Verbindungen

- Nextcloud: HTTPS-Login-Flow und WebDAV; ein widerrufbares App-Passwort liegt im Thunderbird-Passwortspeicher bzw. geschützten Android-Speicher. Keine zusätzliche Ende-zu-Ende-Verschlüsselung des gespeicherten JSON. Für diesen Release ausschließlich mit künstlichen Daten geprüft.
- OpenHolidays: Land, Region und Zeitraum an den Feiertagsdienst; keine Personenfilter. Der Dienst kann technisch die anfragende IP-Adresse sehen.
- Modulquellen: Abruf der vom Nutzer eingerichteten HTTPS-Beschreibungen und Paketdownloads; Installationen bleiben sichtbar.
- E-Mail-Sicherungen: nur nach Einrichtung; können Kalenderdaten enthalten und gehen an die gewählten Empfänger.

Der Android-Unterbau enthält weitere Mailanbieter- und optionale Thunderbird-Dienste. Deren vollständige Datenwege werden durch diese Kurzbeschreibung nicht ersetzt; vor einer öffentlichen App-Binärfreigabe müssen Buildkonfiguration, Dienstaktivierung und dazugehörige Datenschutzhinweise abschließend geprüft werden. Es wird keine pauschale Telemetrie-Freiheit des gesamten Upstream-Builds behauptet.

## Diagnose, Entfernen und Kontakt

Diagnose ist in normalen Add-on-Paketen deaktiviert. Testpakete erzeugen nur auf Nutzeraktion lokale technische Ergebnisse; Export vor Weitergabe prüfen. Keine vollständigen Mail-/Kalenderlogs oder Bildschirmaufnahmen öffentlich hochladen. Ein Entfernen eines Add-ons löscht keine Providerkonten. Lokale und entfernte Daten sowie widerrufbare Providerfreigaben müssen bei Bedarf getrennt entfernt werden.

Projektkontakt: [GitHub Issues](https://github.com/MarcSchlicker/ThunderbirdAddons/issues). Für Konten-/Datenschutzanfragen keine Zugangsdaten in öffentliche Issues schreiben. Eine abschließende Verantwortlichen- und Kontaktangabe für Store-Veröffentlichungen ist noch bereitzustellen.
