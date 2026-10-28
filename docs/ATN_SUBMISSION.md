# Texte und Prüfhinweise für Thunderbird-Reviewer

Diese Unterlagen sind vorbereitet; kein Add-on wurde bereits eingereicht oder freigegeben. [Aktuelle Freigabegrenzen](RELEASE.md) gelten weiter.

## Kalender Raster · 1.4.19

Kurzbeschreibung: Kalender im Stundenraster mit Tages-, Wochen- und Monatsansicht, konfigurierbaren Personen, Filtern und Kalenderfarben.

Testprofil: einen lokalen Kalender und einen künstlichen Termin anlegen, Raster öffnen, Ansichten wechseln, Person in den Einstellungen anlegen/zuordnen, Farbe ändern, Fenster erneut öffnen. Anschließend kontrolliert Termin bearbeiten. Kalenderdaten stammen aus Thunderbird, ein externes Konto ist für diese Basisprüfung nicht nötig. `storage`, `tabs`, `alarms` und Experiment-Schnittstelle dienen Einstellungen, eigener Ansicht und Kalenderzugriff. `accountsRead`, `compose` und `compose.send` gehören zu optionalen konfigurierten E-Mail-Sicherungen. HTTPS-/HTTP-Hosts unterstützen eingerichtete Quellen und die optionale lokale Hub-Verbindung; ihre Erforderlichkeit ist im Review einzeln zu begründen. OpenHolidays und Backups in der Beschreibung und Datenschutzerklärung nennen.

## Tagesplaner · 2.0.9

Kurzbeschreibung: Termine, Aufgaben mit Notizen und vorgemerkte Nachrichten in einem eigenen Thunderbird-Bereich.

Testprofil: Aufgabe mit Datum und Notiz erstellen, verschieben und abschließen. Eine künstliche Mail mit Planen vormerken, im Tagesplan öffnen und entfernen. Eigenen Tab mehrfach öffnen und prüfen, dass keine fremde Kalender-/Mailansicht umgewidmet wird. Speicherung erfolgt lokal; externer Hub ist optional. Mail-/Kalenderzugriff, eigene Tabs, Alarme, Kontextaktionen und Experiment werden für diese Funktionen benötigt. Geräteabgleich benötigt den separat installierten Hub. Offline- und Teilfehler dürfen keinen vollständigen Erfolg melden.

## Mail-Ablage nach Adresse · 1.4.2

Kurzbeschreibung: Ausgewählte Nachrichten anhand der eigenen Mailadresse in konfigurierte Zielordner verschieben.

Testprofil: Testkonto und zwei Testordner verwenden, eigene Adresse zuordnen, künstliche Nachricht auswählen und Ablegen auslösen. Ziel und Gelesenstatus prüfen; anschließend Ungelesen prüfen. Fehlender/gelöschter Zielordner muss einen Hinweis auslösen. Die Aktion verschiebt echte Nachrichten; niemals Reviewer-Produktivmails verwenden. Konten-/Nachrichten-/Ordnerzugriff und Experiment dienen Adresszuordnung, Verschieben und Headeraktionen.

## Modul-Hub · 2.0.29

Kurzbeschreibung: Optionale lokale Verbindung zwischen TB-Connect-Desktopmodulen und Android mit nachvollziehbarem Sende-/Empfangsstatus.

Noch nicht für die Katalogeinreichung freigegeben: HTTP-Transport sensibler Daten, ausstehender echter Rundweg und ausgesetzte QR-Abnahme. Künstliche Modulstände dienen den automatischen Tests; kein persönlicher Nextcloud-Zugang ist erforderlich. `management`, `downloads`, `storage`, `tabs`, HTTPS-Hosts und Experiment unterstützen Modulkatalog, sichtbare Downloads, lokale Daten, Browseranmeldung und lokalen Server. Keine Ferninstallation ohne Nutzeraktion. Die mitgelieferte QR-Bibliothek ist unverändert MIT-lizenziert.

## Gemeinsame Angaben

Lizenz im Einreichungsformular: MPL 2.0 für den eigenen Desktopcode, mit separaten MIT-Hinweisen. Source: dieses Repository zum jeweiligen Release-Commit. Bauen: Windows, PowerShell, tar.exe, `./scripts/prepare-release.ps1`; keine Transpilation des eigenen Desktopcodes. `npm ci`, Playwright und `npm test` werden für die Tests benötigt, nicht zum Ausführen der Add-ons. Testdiagnose ist in normalen Paketen deaktiviert. Alle vier Add-ons enthalten Experiments, daher manuelle Prüfung und weitreichende Berechtigungswarnung. Screenshots müssen aus einem sauberen Testprofil stammen; noch keine persönlichen Aufnahmen zur Einreichung übernehmen.

Support: öffentliche Projekt-Issues, Datenschutz: docs/PRIVACY.md. Thunderbird-Mindestversion laut Manifest 128; tatsächlich geprüfte Version vor Einreichung ausdrücklich ergänzen. Store-Verfügbarkeit oder eine bestandene manuelle Review wird hier nicht behauptet.
