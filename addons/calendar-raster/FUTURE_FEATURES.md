# Zukuenftige Funktionen

Diese Datei beschreibt geplante Erweiterungen fuer `Kalender Raster`.
Die Eintraege sind Anforderungen und noch nicht implementiert, solange sie nicht
ausdruecklich als abgeschlossen markiert wurden.

## Status

- `[ ]` vorgemerkt
- `[~]` in Arbeit
- `[x]` umgesetzt und getestet

## Prioritaet 1

### [x] Profilabhaengige Ansicht

- `Tage ausblenden` wird pro Ansichtsprofil gespeichert.
- `Wochenende schmaler` wird pro Ansichtsprofil gespeichert.
- Das Tagesraster bleibt ausschliesslich Bestandteil eines Ansichtsprofils.
- `Standard` bleibt das neutrale, immer vorhandene Standardprofil.
- Beim Wechsel des Profils werden Tagesraster, ausgeblendete Tage und
  Wochenendbreite gemeinsam angewendet.

### [x] Stabile Shift-Tagesansicht

- Die vergroesserte Tagesansicht funktioniert auch ohne laufenden
  Ziehvorgang.
- Beim Druecken von `Shift` wird der Tag unter dem Mauszeiger festgehalten.
- Solange `Shift` gedrueckt bleibt, darf eine Bewegung des Mauszeigers nicht zu
  einem anderen Tag wechseln.
- Nach dem Loslassen wird die Festlegung aufgehoben. Erst ein erneutes Druecken
  von `Shift` waehlt den dann unter dem Mauszeiger liegenden Tag.
- Beim Ziehen eines Termins bleibt die vergroesserte Ansicht ein gueltiges
  Ablageziel.

### [x] Termin in der Shift-Tagesansicht aufziehen

- Ein neuer Termin kann durch Aufziehen eines Zeitbereichs erstellt werden.
- Diese Funktion ist nur in der vergroesserten Shift-Tagesansicht aktiv.
- Beim Aufziehen werden Startzeit, Endzeit und Dauer direkt angezeigt.
- Erst nach dem Aufziehen wird Thunderbirds normaler Dialog fuer einen neuen
  Termin mit dem ausgewaehlten Zeitraum geoeffnet.
- Das Zeitraster des aktiven Profils bestimmt den sichtbaren Bereich.

### [x] Praezises Verschieben mit sichtbarer Zielzeit

- Das gerade bewegte Terminelement zeigt jederzeit die vorgeschlagene neue
  Start- und Endzeit, nicht nur die urspruengliche Uhrzeit.
- Die Vorschau und die tatsaechlich gespeicherte Uhrzeit muessen identisch sein.
- In der Shift-Tagesansicht wird die Zielzeit aus der vergroesserten Zeitskala
  berechnet.
- Beim Wechsel auf einen anderen Tag bleibt die bisherige Uhrzeit erhalten,
  solange nicht innerhalb des Tagesrasters auf eine neue Uhrzeit gezeigt wird.
- Mehrtaegige Vorschauen zeigen weiterhin die gesamte neue Spanne.

### [x] Rueckgaengig mit Strg+Z

- `Strg+Z` macht mindestens die letzte Kalenderaktion des Add-ons rueckgaengig.
- Unterstuetzt werden Verschieben, Wechsel des Zielkalenders und Entfernen aus
  der Add-on-Ansicht. Neu angelegte Termine werden erst im Thunderbird-Dialog
  gespeichert und bleiben deshalb in Thunderbirds eigener Rueckgaengig-Historie.
- Vor jeder Aenderung werden die fuer die Wiederherstellung erforderlichen
  Originaldaten gespeichert.
- Eine kurze Rueckmeldung zeigt, welche Aktion rueckgaengig gemacht wurde.
- Fehler beim Rueckgaengigmachen duerfen den Originaltermin nicht weiter
  veraendern und werden in der Diagnose dokumentiert.

### [x] Kalender hinzufuegen

- In der linken Kalenderleiste gibt es eine Aktion `Kalender hinzufuegen`.
- Nach Moeglichkeit wird Thunderbirds eigener Kalender-Assistent bzw. dieselbe
  interne Kalenderfunktion wie in der regulaeren Kalenderansicht verwendet.
- Der neue Kalender erscheint sowohl in Thunderbird als auch in dieser
  Add-on-Ansicht; es wird keine getrennte Kalenderverwaltung aufgebaut.
- Name, Farbe, Anbieter, Adresse und Anmeldedaten werden von Thunderbird
  verwaltet.

### [x] Sicherheitsabfrage beim Entfernen

- Das Kreuz neben einem Kalender oeffnet vor dem Entfernen eine Bestaetigung.
- Der Dialog nennt den betroffenen Kalender und erklaert, dass er nur aus der
  Add-on-Ansicht entfernt wird.
- Die Aktion bleibt unter `Weitere Einstellungen` wiederherstellbar.

## Prioritaet 2

### [x] Suche und Filter in der oberen Leiste

- Eine kompakte Suche erscheint in der oberen Werkzeugleiste, ohne die
  Monatsauswahl zu dominieren.
- Ein Trichter-Symbol oeffnet die erweiterten Filter.
- Filter: Kalender, Kalendertyp, ganztags/mit Uhrzeit und Suchtext.
- Kategorien und Ort bleiben fuer einen folgenden Ausbau vorgemerkt.
- Aktive Filter werden knapp am Trichter kenntlich gemacht und koennen mit
  einer Aktion zurueckgesetzt werden.
- Die Suche veraendert nur die Anzeige und niemals die Kalenderdaten.

### [x] Kontextmenue fuer Termine

- Rechtsklick auf einen Termin oeffnet ein Kontextmenue.
- Erste Funktionen: Bearbeiten, Duplizieren, in einen Kalender verschieben und
  Details anzeigen.
- `Duplizieren` uebernimmt alle sinnvollen Termininformationen und oeffnet vor
  dem Speichern den normalen Thunderbird-Termindialog.

### [x] Termin auf einen anderen Kalender ziehen

- Ein Termin kann auf einen Kalender in der linken Leiste gezogen werden.
- Titel, Beschreibung, Ort, Teilnehmer, Erinnerung, Kategorien,
  Wiederholungsinformationen und Zeitraum bleiben soweit von Thunderbird
  unterstuetzt erhalten.
- Waehrend des Ziehens zeigen Vorschau und Terminelement bereits Farbe und Name
  des Zielkalenders.
- Die Aenderung ist mit `Strg+Z` rueckgaengig zu machen.
- Unter `Weitere Einstellungen` kann diese Funktion deaktiviert werden.

### [x] Tages- und Wochenansicht

- Die Zeitraum-Auswahl erhaelt zusaetzlich `Tag` und `Woche`.
- Beide Ansichten verwenden die Einstellungen des aktiven Profils.
- Navigation, Suche, Filter, Verschieben, Bearbeiten und Shift-Tagesansicht
  verhalten sich konsistent zu Monat und `4 Wochen`.

### [x] Englische Benutzeroberflaeche

- Bei deutscher Thunderbird-Sprache wird Deutsch verwendet.
- Bei allen anderen Sprachen wird mindestens Englisch als Rueckfall verwendet.
- Sichtbare Texte, Tooltips, Dialoge, Fehlermeldungen und Diagnosebezeichnungen
  werden ueber eine gemeinsame Lokalisierung gepflegt.
- Datums-, Zeit- und Wochenformat folgen der Thunderbird-Sprache bzw. Region.

### [x] Kontrast und Farben

- Unter `Weitere Einstellungen` koennen Kontrast und Darstellungsfarben
  angepasst werden.
- Vorgesehen sind mindestens `System`, `Normal` und `Hoher Kontrast`.
- Termintexte, Fokusrahmen, Rasterlinien und Profilmarkierungen muessen in allen
  Varianten lesbar bleiben.
- Die Einstellung darf Kalenderfarben nicht dauerhaft veraendern.

## Prioritaet 3

### [x] Eigenstaendige Kalenderverwaltung

- Ein eigenes Fenster verwaltet Thunderbird- und Add-on-Kalender gemeinsam.
- Kalender koennen umbenannt, eingefaerbt, aktiviert, im Raster ein- oder
  ausgeblendet und als Standard gesetzt werden.
- Erweiterte Anbieteroptionen sowie Thunderbirds Assistent fuer neue Kalender
  werden direkt aus dem Verwaltungsfenster geoeffnet.
- Kalender koennen abgemeldet oder, wenn der Anbieter es unterstuetzt, samt
  lokalen Daten entfernt werden. Der letzte Kalender bleibt geschuetzt.
- Das normale Thunderbird-Kalenderfenster ist fuer diese Verwaltungsaufgaben
  nicht mehr erforderlich.

### [x] Regelmaessiges E-Mail-Backup

- Das Backup ist eine freiwillige Funktion unter `Weitere Einstellungen` und
  standardmaessig ausgeschaltet.
- Moegliche Intervalle: manuell, taeglich, woechentlich und monatlich.
- Absenderidentitaet und eigene Empfaengeradresse sind auswaehlbar.
- Gesichert werden Add-on-Einstellungen, Ansichtsprofile, Kalendertypen,
  Gruppenzuordnungen, Sichtbarkeit, ausgeblendete Tage, externe
  Kalenderkonfigurationen und wiederherstellbare Kalender-Metadaten.
- Kalenderinhalte verbleiben bei den eingebundenen Kalenderdiensten. Importierte
  ICS-Inhalte des Add-ons werden mitgesichert; Zugangsdaten und Provider-Caches
  werden bewusst nicht kopiert.
- Passwoerter, OAuth-Tokens und andere Anmeldegeheimnisse werden niemals im
  Klartext exportiert. Standardmaessig werden sie ausgeschlossen.
- Das Backup wird als versionierte Datei angehaengt und enthaelt Pruefsumme,
  Erstellungszeit und Add-on-Version.
- Eine zusaetzliche Verschluesselung mit eigenem Backup-Passwort bleibt fuer
  einen spaeteren Ausbau vorgemerkt.
- Eine Wiederherstellung zeigt vor dem Import eine Zusammenfassung und
  ueberschreibt keine bestehenden Kalender ohne Bestaetigung.
- Versand- und Wiederherstellungsfehler werden in der Diagnose dokumentiert.

## Aufraeumen der Einstellungen

### [x] Diagnose und Neuladen

- `Diagnose` wird nach `Weitere Einstellungen` verschoben.
- Der separate Knopf `Neu laden` wird entfernt.
- Die Aktion `Aktueller Monat` springt zum aktuellen Zeitraum und laedt dessen
  Daten erneut.

## Weitere Ideen ohne feste Zusage

- Einstellbare Einrastung auf 5, 10, 15 oder 30 Minuten.
- Sichtbare Warnung bei Terminkonflikten.
- Kompakte Tagesagenda fuer den ausgewaehlten Tag.
- Automatischer Profilwechsel nach Wochentag und Uhrzeit.
- Profilbezogener PDF-Export.
- Frei-/Belegt-Zusammenfassung mehrerer Kalender.
- Vollstaendige Tastatursteuerung und barrierearme Navigation.
- Erinnerungs- und Wiederholungssymbole.
- Optionale Reisezeit vor oder nach Terminen.
- Import und Export einzelner Ansichtsprofile.

## Umsetzungshinweise

- Kalenderdaten bleiben in Thunderbird die fuehrende Datenquelle.
- Neue Funktionen muessen mit lokalen, CalDAV- und Provider-Kalendern getestet
  werden.
- Vor jeder neuen XPI-Version erfolgen Archivpruefung und Installationstest in
  einem getrennten Thunderbird-Profil.
- Verhaltensaenderungen erhalten Diagnoseeintraege mit Arbeitsschritt,
  Kalender-ID, Terminreferenz und technischer Fehlermeldung, jedoch ohne
  vertrauliche Inhalte.
