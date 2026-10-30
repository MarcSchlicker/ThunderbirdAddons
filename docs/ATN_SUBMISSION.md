# Texte und Prüfhinweise für Thunderbird-Reviewer

Diese Unterlagen sind vorbereitet; kein Add-on wurde bereits eingereicht oder freigegeben. [Aktuelle Freigabegrenzen](RELEASE.md) gelten weiter.

## Kalender Raster · 1.4.19

Kurzbeschreibung: Kalender im Stundenraster mit Tages-, Wochen- und Monatsansicht, konfigurierbaren Personen, Filtern und Kalenderfarben.

Testprofil: einen lokalen Kalender und einen künstlichen Termin anlegen, Raster öffnen, Ansichten wechseln, Person in den Einstellungen anlegen/zuordnen, Farbe ändern, Fenster erneut öffnen. Anschließend kontrolliert Termin bearbeiten. Kalenderdaten stammen aus Thunderbird, ein externes Konto ist für diese Basisprüfung nicht nötig. `storage`, `tabs`, `alarms` und Experiment-Schnittstelle dienen Einstellungen, eigener Ansicht und Kalenderzugriff. `accountsRead`, `compose` und `compose.send` gehören zu optionalen konfigurierten E-Mail-Sicherungen. HTTPS-/HTTP-Hosts unterstützen eingerichtete Quellen und die optionale lokale Hub-Verbindung; ihre Erforderlichkeit ist im Review einzeln zu begründen. OpenHolidays und Backups in der Beschreibung und Datenschutzerklärung nennen.

## Tagesplaner · 2.0.10

Kurzbeschreibung: Termine, Aufgaben mit Notizen und vorgemerkte Nachrichten in einem eigenen Thunderbird-Bereich.

Testprofil: Aufgabe mit Datum und Notiz erstellen, verschieben und abschließen. Eine künstliche Mail mit Planen vormerken, im Tagesplan öffnen und entfernen. Eigenen Tab mehrfach öffnen und prüfen, dass keine fremde Kalender-/Mailansicht umgewidmet wird. Speicherung erfolgt lokal; externer Hub ist optional. Mail-/Kalenderzugriff, eigene Tabs, Alarme, Kontextaktionen und Experiment werden für diese Funktionen benötigt. Geräteabgleich benötigt den separat installierten Hub. Offline- und Teilfehler dürfen keinen vollständigen Erfolg melden.

## Mail-Ablage nach Adresse · 1.4.2

Kurzbeschreibung: Ausgewählte Nachrichten anhand der eigenen Mailadresse in konfigurierte Zielordner verschieben.

Testprofil: Testkonto und zwei Testordner verwenden, eigene Adresse zuordnen, künstliche Nachricht auswählen und Ablegen auslösen. Ziel und Gelesenstatus prüfen; anschließend Ungelesen prüfen. Fehlender/gelöschter Zielordner muss einen Hinweis auslösen. Die Aktion verschiebt echte Nachrichten; niemals Reviewer-Produktivmails verwenden. Konten-/Nachrichten-/Ordnerzugriff und Experiment dienen Adresszuordnung, Verschieben und Headeraktionen.

## Modul-Hub · 2.0.30

Kurzbeschreibung: Optionale lokale Verbindung zwischen TB-Connect-Desktopmodulen und Android mit nachvollziehbarem Sende-/Empfangsstatus.

Noch nicht abschließend abgenommen: echter Konten-/Geräterundweg und ausgesetzte QR-Abnahme. Der neue LAN-Transport verwendet NSS-TLS1.2/1.3; die App bindet das genaue Serverzertifikat. HTTP-Adapter sind auf Loopback begrenzt. [Zertifikatserzeugung, Speicherung, Bibliotheksherkunft und synthetische native Prüfungen](HUB_TLS.md). Künstliche Modulstände dienen den automatischen Tests; kein persönlicher Nextcloud-Zugang ist erforderlich. `management`, `downloads`, `storage`, `tabs`, HTTPS-Hosts und Experiment unterstützen Modulkatalog, sichtbare Downloads, lokale Daten, Browseranmeldung und lokalen Server. Keine Ferninstallation ohne Nutzeraktion. Die mitgelieferte QR-Bibliothek ist unverändert MIT-lizenziert; node-forge1.4.2 wird unverändert unter BSD für X.509/PKCS12 verwendet, nicht als TLS-Stack. Originalquellen liegen unter third_party/.

## Gemeinsame Angaben

Lizenz im Einreichungsformular: MPL 2.0 für den eigenen Desktopcode, mit separaten MIT-Hinweisen. Source: dieses Repository zum jeweiligen Release-Commit. Bauen: Windows, PowerShell, tar.exe, `./scripts/prepare-release.ps1`; keine Transpilation des eigenen Desktopcodes. `npm ci`, Playwright und `npm test` werden für die Tests benötigt, nicht zum Ausführen der Add-ons. Testdiagnose ist in normalen Paketen deaktiviert. Alle vier Add-ons enthalten Experiments, daher manuelle Prüfung und weitreichende Berechtigungswarnung. Screenshots müssen aus einem sauberen Testprofil stammen; noch keine persönlichen Aufnahmen zur Einreichung übernehmen.

Support: öffentliche Projekt-Issues, Datenschutz: docs/PRIVACY.md. Thunderbird-Mindestversion laut Manifest 128; nativer TLS-Transport synthetisch mit Thunderbird153.5.1 geprüft; vollständige manuelle Add-on-/Versionsabnahme vor Einreichung ergänzen. Store-Verfügbarkeit oder eine bestandene manuelle Review wird hier nicht behauptet.


## Vollständige Datenschutztexte für das ATN-Formular

Die ATN-Richtlinie verlangt den vollständigen, auf die einzelne Erweiterung bezogenen Text im Datenschutzfeld. Ein bloßer Link genügt nicht. Die folgenden Texte können nach fachlicher Prüfung als jeweiliger Volltext übernommen werden:

- [Kalender Raster](atn/privacy/calendar-raster.md)
- [Tagesplaner](atn/privacy/daily-planner.md)
- [Mail-Ablage](atn/privacy/mail-address-filer.md)
- [Modul-Hub](atn/privacy/mobile-module-bridge.md)

Die endgültige Betreiber-/Datenschutzkontaktangabe bleibt vor Einreichung zu ergänzen. Die Texte sind keine Bestätigung einer bereits erfolgten ATN- oder rechtlichen Freigabe. Keine persönlichen Daten in Screenshots oder Reviewer-Zugänge übernehmen.

## Vorprüfung29.10.2026

Mozilla addons-linter10.15.0 meldete im bisherigen Tagesplaner2.0.9 DUPLICATE_XPI_ENTRY. Ursache: THIRD_PARTY_NOTICES.md zweimal in der tar-Dateiliste. In2.0.10 korrigiert; Paketbau und gemeinsame Paketvorbereitung weisen doppelte Pfade nun zurück. Neue Regression baut tatsächlich ein XPI und prüft dessen Eintragsliste.

Das Werkzeug verwendet Firefox-Schemas. Thunderbird-Experiments und Mailberechtigungen werden damit nicht vollständig verstanden. MANIFEST_FIELD_PRIVILEGED, Firefox-only MISSING_DATA_COLLECTION_PERMISSIONS und nicht erkannte Thunderbird-Mailrechte sind daher keine automatische ATN-Ablehnung. Keine Firefox-Zertifikatsrechte hinzufügen, um diese Meldungen zu verstecken. Originales node-forge und die QR-SVG-Erzeugung benötigen menschliche Quellprüfung; enthaltene Bibliotheken bleiben unverändert. Die lokale Vorprüfung ist keine ATN-Servervalidierung oder manuelle Review.

Zusätzlich wurde ein älterer direkter Planer-LAN-Listener entdeckt und ab2.0.10 abgeschaltet. Er erzeugt keine neuen HTTP-Kopplungscodes oder UDP-Freigaben; erhaltene native Kompatibilitätsschnittstellen sind auf Loopback begrenzt. Mobile Einrichtung erfolgt bewusst über den TLS-Hub. Aufgaben, Konten und gespeicherte Kopplungstokens werden nicht gelöscht.


## ATN-Korrektur 30.10.2026: Experiment-Versionsgrenze

ATN meldete die fehlende strict_max_version. Alle vier Experiment-Erweiterungen begrenzen die Kompatibilität nun auf153.* bei unverändertem Minimum128.0. Neue Versionen: Raster1.4.20, Tagesplaner2.0.11, Mail-Ablage1.4.3, Hub2.0.32. Die Obergrenze folgt dem tatsächlich für native Prüfungen verwendeten Thunderbird153.5.1; keine Vollabnahme jeder Version128–153 behaupten. Paketvorbereitung weist Experiments ohne begrenzte Obergrenze zurück. Alle vier tatsächlichen XPIs auf die Grenze geprüft; erneute ATN-Servervalidierung bleibt nötig. Keine manuelle Katalogfreigabe vorwegnehmen. Quelle: https://developer.thunderbird.net/add-ons/mailextensions.
