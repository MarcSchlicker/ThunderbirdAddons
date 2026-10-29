# Kalender Raster – Datenschutz

Stand: 29. Oktober 2026.

Kalender Raster verarbeitet die in Thunderbird verfügbaren Termine zur Anzeige und Bearbeitung. Dazu gehören Titel, Zeiten, Beschreibung, Ort, Kalenderzuordnung und gegebenenfalls Teilnehmerdaten. Personenfilter, sichtbare Kalender, Farben und Einstellungen werden im lokalen Thunderbird-Profil gespeichert. Bewusste Änderungen an Terminen oder Kalendern werden über den bereits in Thunderbird eingerichteten Kalenderanbieter abgeglichen; dessen Datenschutzhinweise gelten ergänzend.

Bei selbst hinzugefügten Kalender-URLs ruft die Erweiterung die angegebene Adresse ab. Dabei erhält deren Betreiber technisch die IP-Adresse und die angefragte URL. Eine URL kann selbst einen privaten Freigabeschlüssel enthalten; solche Adressen deshalb vertraulich behandeln. Bei Verwendung der Feiertagsfunktion werden Land, gegebenenfalls Region und Zeitraum bei openholidaysapi.org abgefragt. Eigene Termine und Personenfilter werden für diese Feiertagsabfrage nicht übertragen. Importierte lokale iCal-Dateien werden im Profil verarbeitet.

Die optionale E-Mail-Sicherung enthält Erweiterungseinstellungen, Personen-/Kalenderzuordnungen und Kalender-Metadaten wie Name, Farbe und Sichtbarkeit. Sie wird über die ausgewählte Thunderbird-Identität an den eingestellten Empfänger vorbereitet beziehungsweise nach ausdrücklicher Einrichtung automatisch versendet. Der JSON-Anhang ist nicht zusätzlich verschlüsselt. Zugangsdaten und OAuth-Tokens sind nicht Bestandteil des vorgesehenen Sicherungsformats. Ein Prüfsummenwert dient der Integritätsprüfung, nicht der Verschlüsselung.

Der optionale TB-Connect Modul-Hub kann ausgewählte Kalender- und Einstellungsdaten an gekoppelte Geräte oder den vom Nutzer eingerichteten Nextcloud-Server übertragen. Die lokale Desktop-Verbindung zum Hub bleibt auf dem eigenen Rechner; die mobile Verbindung ab Hub2.0.30 verwendet TLS mit Zertifikatbindung. Ohne eingerichteten Hub ist dieser Geräteabgleich nicht verfügbar. Persönliche Zugänge werden dadurch nicht automatisch vom Desktop auf ein Mobilgerät übernommen.

In normalen Paketen ist die lokale Testdiagnose deaktiviert. Testpakete mit test_-Namen erstellen technische Prüfergebnisse nur auf Nutzeraktion; eine Weitergabe erfolgt nicht automatisch. Exportierte Sicherungen und Diagnosepakete können vertrauliche Angaben enthalten und sollten vor einer Weitergabe geprüft werden.

Erweiterungsdaten liegen im Thunderbird-Profil; externe Kalenderdaten bleiben beim eingerichteten Anbieter, Sicherungen beim gewählten Empfänger. Profile, exportierte Dateien, externe Kopien und Anbieterfreigaben müssen getrennt verwaltet beziehungsweise entfernt werden. Das Entfernen der Erweiterung löscht keine Kalenderkonten oder bereits versendeten Sicherungen.

Kontakt für Projektfragen: https://github.com/MarcSchlicker/ThunderbirdAddons/issues. Keine Zugangsdaten oder privaten Kalenderinhalte in öffentliche Meldungen aufnehmen.
