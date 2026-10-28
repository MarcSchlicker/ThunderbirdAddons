"use strict";

/*
 * The built-in catalog is deliberately declarative. More modules are added by
 * loading a reviewed tb-connect-module.json descriptor from HTTPS or a GitHub
 * repository. Native Android views are named here, but no repository can ship
 * executable Android code into TB-Connect Mobil.
 */
// Set through build-xpi.ps1 -DownloadBaseUrl when publishing a distribution.
const TB_CONNECT_REPOSITORY = "";
const downloadUrl = path => TB_CONNECT_REPOSITORY ? `${TB_CONNECT_REPOSITORY}/${path}` : null;

globalThis.ModuleBridgeCatalog = Object.freeze([
  {
    id: "de.tbconnect.modules.daily-planner",
    name: "Tagesplaner",
    description: "Aufgaben, Kalendertermine und eingeplante Mails auf Desktop und Mobilgerät.",
    icon: "icons/module-bridge.svg",
    transport: "tb-connect-module-bridge-v1",
    desktop: {
      extensionId: "daily-planner@example.local",
      install: { xpi: downloadUrl("Release/Tagesplaner-2.0.4.xpi") }
    },
    mobile: {
      entry: "daily-planner",
      package: {
        url: downloadUrl("addons/daily-planner/tb-connect-mobile.json"),
        inline: {
          format: "tb-connect-mobile-package/1",
          id: "de.tbconnect.modules.daily-planner",
          entry: "daily-planner",
          version: 2,
          renderer: "native",
          dataContract: "tb-connect-module-bridge/1",
          capabilities: ["planner.state.read", "planner.state.write"]
        }
      }
    },
    bundled: true
  },
  {
    id: "de.tbconnect.modules.calendar",
    name: "Kalender",
    description: "Thunderbird-Kalender und Termine in einer mobilen, synchronisierten Agenda.",
    icon: "icons/module-bridge.svg",
    transport: "tb-connect-module-bridge-v1",
    desktop: {
      extensionId: "hour-grid-month-view@example.local",
      install: { xpi: downloadUrl("Release/Kalender-Raster-1.4.12.xpi") }
    },
    mobile: {
      entry: "calendar",
      package: {
        url: downloadUrl("addons/calendar-raster/tb-connect-mobile.json"),
        inline: {
          format: "tb-connect-mobile-package/1",
          id: "de.tbconnect.modules.calendar",
          entry: "calendar",
          version: 3,
          renderer: "native",
          dataContract: "tb-connect-module-bridge/1",
          capabilities: ["calendar.events.read", "calendar.calendars.read", "calendar.access-profiles.read"]
        }
      }
    },
    bundled: true
  },
  {
    id: "de.tbconnect.modules.mail-address-filer",
    name: "Mail-Ablage nach Adresse",
    description: "Legt Nachrichten in adressbezogene Ordner ab. Dieses Desktop-Modul hat derzeit keine mobile Oberfläche.",
    icon: "icons/module-bridge.svg",
    transport: "tb-connect-module-bridge-v1",
    desktop: {
      extensionId: "mail-address-filer@example.local",
      install: { xpi: downloadUrl("Release/Mail-Ablage-nach-Adresse-1.4.0.xpi") }
    },
    mobile: null,
    bundled: true
  },
  {
    id: "de.tbconnect.modules.language-preview",
    name: "Sprachkorrektur",
    description: "Beispiel für ein reines Mobilmodul. Eine Oberfläche kann später als native TB-Connect-Mobilansicht ergänzt werden.",
    icon: "icons/module-bridge.svg",
    transport: "tb-connect-module-bridge-v1",
    desktop: null,
    mobile: { entry: "language", preview: true },
    bundled: true
  }
]);
