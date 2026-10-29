# Mail-Ablage nach Adresse – Datenschutz

Stand: 29. Oktober 2026.

Mail-Ablage nach Adresse liest die in Thunderbird eingerichteten Konten, Identitäten und Ordner, um eigene Mailadressen einem vom Nutzer ausgewählten Ablageordner zuzuordnen. Diese Zuordnungen und Einstellungen werden im lokalen Thunderbird-Profil gespeichert.

Bei einer bewussten Ablageaktion verarbeitet die Erweiterung die ausgewählten Nachrichten und ihre Metadaten zur Bestimmung des Ablageziels. Sie verschiebt die Nachrichten über Thunderbird in den konfigurierten Ordner und ändert je nach Einstellung den Gelesen-/Ungelesenstatus. Das kann bei einem serverseitigen Ordner eine Synchronisierung mit dem bereits eingerichteten Mailanbieter auslösen. Es wird kein zusätzlicher Entwickler-Mailserver als Ablageziel verwendet. Die eigentlichen Nachrichten verbleiben unter der Kontrolle des eingerichteten Mailkontos und seiner Anbieterregeln.

Die Erweiterung führt keinen eigenen Kalender-/Geräteabgleich durch und besitzt keine mobile Oberfläche. Sie überträgt nicht eigenständig Mailinhalte an den TB-Connect Hub. Die Kopfzeilen-Schaltfläche und Benachrichtigungen dienen ausschließlich der sichtbaren Ablagefunktion und deren Fehlermeldungen.

Die lokale Testdiagnose ist in normalen Paketen deaktiviert. Testpakete mit test_-Namen können auf Nutzeraktion technische Prüfergebnisse erzeugen. Es erfolgt kein automatischer Versand dieser Ergebnisse an den Entwickler. Exportierte Diagnosepakete vor einer freiwilligen Weitergabe auf vertrauliche Angaben prüfen.

Erweiterungseinstellungen befinden sich im Thunderbird-Profil. Bereits verschobene Nachrichten bleiben in den gewählten Mailordnern; das Entfernen der Erweiterung verschiebt sie nicht zurück und löscht keine Mailkonten. Zuordnungen, Profilkopien und exportierte Dateien können unabhängig verwaltet werden.

Kontakt für Projektfragen: https://github.com/MarcSchlicker/ThunderbirdAddons/issues. Keine Zugangsdaten oder Nachrichteninhalte in öffentliche Meldungen aufnehmen.
