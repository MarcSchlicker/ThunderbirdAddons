# Tagesplaner – Datenschutz

Stand: 29. Oktober 2026; ab Version2.0.10.

Der Tagesplaner speichert Aufgaben, Notizen, Zuordnungen, Termine, Löschmarker und Einstellungen im lokalen Thunderbird-Profil. Für eingeplante Nachrichten werden Mail-Verweise mit Metadaten wie Betreff, Absender, Konto/Ordner und Nachrichtenkennung gespeichert. Vollständige Nachrichtentexte und Anhänge werden dafür nicht in den Planer übernommen; die Nachrichten verbleiben im eingerichteten Mailkonto. Das Entfernen eines Planer-Verweises löscht nicht die ursprüngliche Nachricht.

Die Kalenderübersicht liest die in Thunderbird sichtbaren Kalender. Das Öffnen einer vorgemerkten Mail verwendet das vorhandene Thunderbird-Konto. Dessen Anbieter- und Datenschutzeinstellungen gelten weiterhin. Erinnerungen werden lokal eingerichtet.

Nur bei eingerichtetem TB-Connect Modul-Hub werden Planerdaten, Kalenderübersichten und ausgewählte Mailmetadaten zwischen Desktop und verbundenen Geräten beziehungsweise dem vom Nutzer gewählten Nextcloud-Server abgeglichen. Dazu gehören Aufgabentext, Notizen, Datums-/Zeitangaben, Erledigtstatus, Löschmarker und Mail-Verweise. Mailverweise sind selbst vertrauliche Informationen, auch ohne Nachrichtentext.

Die lokale Desktop-Schnittstelle zum Hub verwendet ausschließlich Loopback auf dem eigenen Rechner. Mobile Verbindungen ab Hub2.0.30/App2.0.61 verwenden TLS und die Bindung an das bewusst freigegebene Desktopzertifikat. Ab Tagesplaner2.0.10 startet die frühere direkte unverschlüsselte Handy-Verbindung nicht mehr; alte direkte Kopplungen müssen später bewusst über den Hub ersetzt werden. Vorhandene Aufgaben oder Konten werden dadurch nicht gelöscht.

Normale Pakete haben keine aktive Testdiagnose. Testpakete mit test_-Namen erzeugen technische lokale Prüfergebnisse nur auf Nutzeraktion; ein Export wird nicht automatisch an den Entwickler gesendet. Eigene Exporte und Sicherungen sind vertraulich zu behandeln.

Lokale Daten liegen im Profil, synchronisierte Kopien auf den bewusst verbundenen Geräten oder dem eigenen Server. Diese Kopien müssen bei Bedarf getrennt entfernt werden; das Entfernen der Erweiterung löscht keine ursprünglichen Mails, Kalenderkonten oder entfernten Kopien.

Kontakt für Projektfragen: https://github.com/MarcSchlicker/ThunderbirdAddons/issues. Keine Mails, Tokens oder privaten Kalenderdaten in öffentliche Meldungen aufnehmen.
