# Android-Produktionsbuild

## Getrennte Identitäten

| Kanal | Paketkennung | Signatur |
| --- | --- | --- |
| Bestehende Entwicklung/Test | net.thunderbird.android.debug | bisheriger Debug-Schlüssel |
| Produktionskandidat ab 2.0.61 | eu.mschlicker.tbconnect | eigener dauerhafter RSA-3072-Release-Schlüssel |

Die Produktions-App wird parallel installiert. Sie überschreibt oder löscht die Test-App und deren Android-Keystore-Daten nicht. Ein automatischer Transfer von Konten, Tokens und Kopplungen zwischen den getrennten App-Sandboxes findet nicht statt. Eine spätere Migration benötigt einen ausdrücklich geprüften Importweg.

Der Release-Schlüssel liegt nur lokal unter apps/thunderbird-mobile/.signing/. Der vorhandene Gradle-Signiervertrag nutzt tb.release.signing.properties. Keystore und Signierkonfiguration müssen privat gesichert werden; ohne den bisherigen Schlüssel ist ein normales Update derselben Produktions-App nicht möglich. Sie gehören niemals ins Git, Quellarchiv, XPI oder APK-Asset. Einen Schlüssel nicht überschreiben, um einen Build zu reparieren.

Öffentlicher Zertifikatfingerabdruck SHA-256:

`8B:7C:9B:FB:20:F6:CB:6E:17:9B:07:43:C2:9B:9F:DD:16:1A:1E:79:9B:91:DB:8F:62:BA:29:83:DF:32:23:EA`

Für die eigene Google-Android-Registrierung ist SHA-1:

`E6:D6:4A:88:43:06:65:AC:00:7D:79:C4:0F:8D:8C:0C:74:52:FF:A6`

Ein Zertifikatfingerabdruck ist öffentlich; er ersetzt nicht den geheimen Signierschlüssel.

## Eigene OAuth-Konfiguration

Produktionsvarianten verwenden ausschließlich explizit konfigurierte eigene Mail-Clients. Ohne Client wird der betreffende OAuth-Anbieter nicht angeboten; es erfolgt kein Rückfall auf Thunderbird-Clients. Die bestehende Debug-Anmeldung bleibt unverändert. Ein Client muss zur tatsächlichen Produktionskennung, Signatur und Redirect-URI passen. Keine Client-Secrets in eine öffentliche Android-App einbauen.

Google-Kalender: tb.googleCalendarClientId / TB_GOOGLE_CALENDAR_CLIENT_ID.
Mail: tb.mailGoogleClientId, tb.mailMicrosoftClientId, tb.mailYahooClientId, tb.mailAolClientId, tb.mailFastmailClientId und tb.mailThundermailClientId. Alternativ die entsprechenden TB_MAIL_GOOGLE_CLIENT_ID, TB_MAIL_MICROSOFT_CLIENT_ID usw. Umgebungsvariablen.

Kalender und Google-Mail benötigen unterschiedliche Freigabebereiche, auch wenn ein eigener Android-Client beide verwenden darf. Die öffentliche Nutzung kann eine Anbieterprüfung verlangen. Ein registrierter Client allein ist kein Nachweis für veröffentlichte oder dauerhaft freigegebene Google-Zugänge. Bereits eingerichtete Android-Kalenderanbieter bleiben ein gesonderter Kontenweg.

Die Cloud-Registrierung der neuen Produktionsidentität ist noch offen. Der bisherige Debug-Kalenderclient wird dafür nicht zweckentfremdet. Unterstützte Mailanbieter ohne eigene OAuth-Registrierung ausdrücklich benennen; keine funktionierende Anmeldung behaupten.

## Bauen

Mit eingerichtetem eigenem Schlüssel, JDK/SDK und eigenen Google-Clients:

```powershell
./scripts/build-android-release.ps1 -BuildId eigene_gepruefte_revision
```

Das Skript liest die beiden Google-Client-IDs aus den genannten Umgebungsvariablen oder Parametern, führt die OAuth-/TLS-Policytests aus und baut assembleFossRelease mit eigener Signatur, normalem Release-Namen und R8. Fehlende Schlüssel oder Google-Konfiguration brechen vor der Paketübernahme ab. Für einen ausdrücklich unvollständigen lokalen Kandidaten gibt es -AllowIncompleteOAuth; daraus folgt keine öffentliche Freigabe.

Die APK und ihr Status landen gesammelt unter Testpakete/Release-Kandidaten. Gleichnamige Pakete mit anderem Hash werden nicht überschrieben. Kein automatischer Export nach Release/, keine Installation und kein Veröffentlichen. Der normale Release-Name deaktiviert die Testdiagnose. DEBUG ist false; Klartext-HTTP ist für den Produktionsbuild gesperrt. Bewusst vom Nutzer installierte CAs für eigene Mail-/Cloudserver bleiben berücksichtigt; der Hub verwendet zusätzlich seine exakte Zertifikatbindung.

## Kalenderspezifischer Release-Nachweis

R8 benötigt eine eng begrenzte Diagnoseausnahme für java.time.zone.ZoneRulesProvider, weil der Typ aus desugar_jdk_libs_nio stammt und nicht aus android.jar. In der optimierten APK ist die Definition j$.time.zone.ZoneRulesProvider vorhanden; die iCal4j-Unterklasse verweist darauf. Eine nicht aufgelöste java.time.zone.ZoneRulesProvider-Referenz darf nicht in der DEX verbleiben. Es wird nicht pauschal java.time.* unterdrückt. org.joda.convert.ToString ist eine optionale reine Konvertierungsannotation.

Zusätzlich: Signatur mit apksigner prüfen, Manifestkennung und deaktivierte Debug-/Klartextflags kontrollieren, APK auf einem sauberen Emulator starten und Konto-/Sync-/Updatewege am vorgesehenen Gerät abnehmen. Der Emulator ersetzt keine persönliche Anbieterfreigabe. [Release-Status](RELEASE.md), [Hub-TLS](HUB_TLS.md), [Datenschutz](PRIVACY.md).
