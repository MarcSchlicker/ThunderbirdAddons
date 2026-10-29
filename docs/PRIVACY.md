# Daten und Datenschutz

Stand: 28. Oktober 2026. Diese Information beschreibt den vorliegenden Quellstand und seine Grenzen.

## Desktop

Einstellungen, Personen-/Kalenderzuordnungen, Aufgaben, Notizen und Mailverweise werden im jeweiligen Thunderbird-Profil gespeichert. Mailverweise können Betreff, Absender und Nachrichtenkennung enthalten. Kalenderbearbeitung schreibt an den in Thunderbird eingerichteten Anbieter. Die Mail-Ablage verschiebt markierte Nachrichten in die vom Nutzer gewählten Ordner. Profil und Sicherungen sind entsprechend vertraulich zu behandeln.

## Geräteabgleich

Der optionale Modul-Hub überträgt ausgewählte Kalender-/Planerdaten und Mailmetadaten an gekoppelte Geräte. Ab Hub2.0.30/App2.0.61 nutzt die mobile Verbindung HTTPS mit TLS1.2/1.3. Die App prüft das exakte Zertifikat des sichtbar freigegebenen Desktops und dessen Gültigkeit. Der private Hub-Schlüssel liegt in Thunderbirds NSS-Profil, die Verbindung und der Fingerabdruck im geschützten Android-Speicher. Es wird kein allgemein vertrauenswürdiges CA-Zertifikat installiert. [Technischer Ablauf und Testgrenzen](HUB_TLS.md).

Der lokale HTTP-Dienst auf TCP47832 ist ausschließlich vom eigenen PC über Loopback erreichbar und dient vorhandenen Desktopadaptern. Mobile Geräte nutzen standardmäßig TLS47833. Ein TLS-Fehler aktiviert keinen unverschlüsselten Netzwerkersatz. Produktions-Android sperrt HTTP; ältere unverschlüsselte Testkopplungen werden nicht still als neue TLS-Freigabe übernommen. Keine öffentliche Portfreigabe für den Hub einrichten.

Kalenderrechte werden sichtbar über Android angefragt. Google-Freigaben und Tokens sind von der Desktopanmeldung getrennt. Anmeldungen werden nicht kopiert; vorhandene Test-App-Daten werden beim parallelen Produktionsbuild nicht gelöscht. Anbieter können eine erneute Anmeldung verlangen. Ein Google-Mailzugang umfasst nicht automatisch Kalenderrechte.

## Optionale externe Verbindungen

- Nextcloud: HTTPS-Login-Flow und WebDAV; ein widerrufbares App-Passwort liegt im Thunderbird-Passwortspeicher bzw. geschützten Android-Speicher. Keine zusätzliche Ende-zu-Ende-Verschlüsselung des gespeicherten JSON. Für diesen Release ausschließlich mit künstlichen Daten geprüft.
- OpenHolidays: Land, Region und Zeitraum an den Feiertagsdienst; keine Personenfilter. Der Dienst kann technisch die anfragende IP-Adresse sehen.
- Modulquellen: Abruf der vom Nutzer eingerichteten HTTPS-Beschreibungen und Paketdownloads; Installationen bleiben sichtbar.
- E-Mail-Sicherungen: nur nach Einrichtung; können Kalenderdaten enthalten und gehen an die gewählten Empfänger.

Der vorliegende App-Build bindet für Telemetrie die No-op-Implementierung ein. Der Android-Unterbau enthält außerdem weitere Mailanbieter- und optionale Thunderbird-Dienste. Deren vollständige Datenwege werden durch diese Kurzbeschreibung nicht ersetzt; vor einer öffentlichen App-Binärfreigabe müssen Buildkonfiguration, Dienstaktivierung und dazugehörige Datenschutzhinweise abschließend geprüft werden. Es wird keine pauschale Telemetrie-Freiheit des gesamten Upstream-Builds behauptet.

## Diagnose, Entfernen und Kontakt

Diagnose ist in normalen Add-on-Paketen deaktiviert. Testpakete erzeugen nur auf Nutzeraktion lokale technische Ergebnisse; Export vor Weitergabe prüfen. Keine vollständigen Mail-/Kalenderlogs oder Bildschirmaufnahmen öffentlich hochladen. Ein Entfernen eines Add-ons löscht keine Providerkonten. Lokale und entfernte Daten sowie widerrufbare Providerfreigaben müssen bei Bedarf getrennt entfernt werden.

Projektkontakt: [GitHub Issues](https://github.com/MarcSchlicker/ThunderbirdAddons/issues). Für Konten-/Datenschutzanfragen keine Zugangsdaten in öffentliche Issues schreiben. Eine abschließende Verantwortlichen- und Kontaktangabe für Store-Veröffentlichungen ist noch bereitzustellen.

Ab Tagesplaner2.0.10 ist der frühere automatische direkte Handy-HTTP-/Discovery-Weg abgeschaltet. Mobile Verbindungen erfolgen bewusst über den TLS-Hub; alte Daten und Tokens werden nicht gelöscht. Die getrennten Volltexte je Erweiterung für den Thunderbird-Katalog stehen unter [ATN-Einreichungsunterlagen](ATN_SUBMISSION.md#vollständige-datenschutztexte-für-das-atn-formular).
