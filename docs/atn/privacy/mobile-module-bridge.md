# TB-Connect Modul-Hub – Datenschutz

Stand: 29. Oktober 2026; Hub2.0.30.

Der Modul-Hub verwaltet ausgewählte TB-Connect-Module, Verbindungsangaben und deren Synchronisationsstände im lokalen Thunderbird-Profil. Bei einem eingerichteten Abgleich verarbeitet er die von den Desktopmodulen bereitgestellten Aufgaben, Notizen, Kalenderdaten und Mail-Verweise. Dazu können Titel, Zeiten, Ort/Beschreibung, Kalenderzuordnungen, Erledigt-/Löschstatus sowie Mailbetreff, Absender und Nachrichtenkennungen gehören. Diese Angaben sind vertraulich und werden zur Bereitstellung der gewählten Module verwendet.

Empfänger des Geräteabgleichs sind die bewusst verbundenen Mobilgeräte beziehungsweise der vom Nutzer ausgewählte Nextcloud-Server. Es gibt dafür kein zusätzliches zentrales TB-Connect-Entwicklerkonto. Desktopmodule verwenden eine Loopback-Schnittstelle auf demselben PC. Mobile Verbindungen ab Hub2.0.30/App2.0.61 verwenden natives TLS1.2/1.3 und den in der App gespeicherten genauen Desktop-Zertifikatfingerabdruck. Die Verbindung benötigt außerdem das Kopplungstoken. Keine öffentliche Portfreigabe für den Hub einrichten.

Der Hub erstellt ein eigenes Zertifikat und einen privaten Schlüssel je Thunderbird-Profil. Der Schlüssel wird im NSS-Schlüsselspeicher des Profils abgelegt; ein passwortgeschütztes temporäres Importpaket wird anschließend entfernt. Eine Metadatendatei enthält Zertifikatskennung und öffentlichen Fingerabdruck. Es wird kein allgemein vertrauenswürdiges CA-Zertifikat installiert. Profil und Kopplungscode müssen gegen fremden Zugriff geschützt werden.

Bei eingerichtetem Nextcloud-Zugang verwendet der Hub HTTPS-Anmeldung und WebDAV/CalDAV. Ein widerrufbares App-Passwort liegt im Thunderbird-Passwortspeicher. Synchronisierte JSON-Daten auf dem Server sind nicht zusätzlich Ende-zu-Ende-verschlüsselt. Der Serverbetreiber erhält technisch die IP-Adresse und die angefragten Daten. Seine Zugriffs- und Löschregeln gelten ergänzend. Für den aktuellen Release ist Nextcloud nur trocken geprüft.

Bei bewusst hinzugefügten Modulquellen ruft der Hub die eingegebenen HTTPS-Beschreibungen und ausgewählten Paketdownloads ab. Der jeweilige Server erhält die anfragende IP-Adresse und URL; bei GitHub-Quellen ist GitHub ein Empfänger dieser Abrufdaten. Fremder ausführbarer Code wird nicht automatisch als mobiles Modul nachgeladen. Add-on-Installationen bleiben eine sichtbare Nutzeraktion. Technische Verbindungsstände können Zeitstempel, Geräteadresse und Fehlerkategorie enthalten.

Der Hub kopiert keine Google- oder Mailanmeldung vom Desktop auf Android. Mobilgeräte erteilen ihre persönlichen Anbieterfreigaben selbst. Normale Module haben keine aktive Testdiagnose; freiwillig exportierte technische Pakete werden nicht automatisch an den Entwickler geschickt und müssen vor einer Weitergabe geprüft werden.

Profil, verbundene Geräte und Server können getrennte Datenkopien besitzen. Verbindungen, App-Passwörter, Anbieterfreigaben und entfernte Kopien sind bei Bedarf getrennt zu widerrufen beziehungsweise zu löschen. Das Entfernen des Hubs löscht keine ursprünglichen Mails oder Kalenderkonten.

Kontakt für Projektfragen: https://github.com/MarcSchlicker/ThunderbirdAddons/issues. Keine Kopplungscodes, Tokens, Passwörter oder privaten Inhalte in öffentliche Meldungen aufnehmen.
