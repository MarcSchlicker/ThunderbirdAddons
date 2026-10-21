# Tagesplaner – Funktionen und Bedienung

Die XPI in Thunderbird installieren und den Tagesplaner öffnen. Ein bereits geöffnetes
Planerfenster wird wiederverwendet. Die Übersicht enthält heutige und kommende Termine,
eingeplante Mails sowie Aufgaben; undatierte Einträge bleiben in der dauerhaften Liste.

## Aufgaben und Termine

Eine Aufgabe mit Titel und optionalem Datum anlegen. **Bearbeiten** öffnet Titel, Notiz und
Datum. Das Kästchen markiert sie als erledigt, **Löschen** entfernt sie mit einem Löschmarker
für den Geräteabgleich. App-Termine besitzen Start-/Endzeit und Datum. Kommende Termine
aus Thunderbirds Kalendern werden zusätzlich angezeigt; deren Bearbeitung erfolgt im Kalender.

## Mails einplanen

Im Kontextmenü einer Nachricht **Zum Tagesplaner** wählen und sie einem Datum oder der
dauerhaften Liste zuordnen. **Öffnen** führt zur Mail. Einträge können neu datiert oder aus
dem Plan entfernt werden; das ist unabhängig vom Löschen der eigentlichen Nachricht.
Aufgaben können einen optionalen Mailbezug enthalten.

## Mit Android abgleichen

Den TB-Connect Modul-Hub installieren und dort das Handy lokal oder über Nextcloud verbinden.
In der App **Tagesplaner** öffnen oder aktualisieren. Aufgaben, Notizen, App-Termine und
Löschmarker werden abgeglichen. Bei mehreren Geräten nach Änderungen erneut synchronisieren.
Ein grüner Kontakt allein ist noch kein bestätigter Datenempfang: den Modulstatus im Hub prüfen.

Die mobilen Erinnerungen werden auf dem Handy eingerichtet und durch Android ausgelöst.
Desktop-Mailreferenzen benötigen die passende Nachricht beziehungsweise das passende Konto.
Build: `./build-xpi.ps1`; Einrichtung und Grenzen: [README](README.md).
