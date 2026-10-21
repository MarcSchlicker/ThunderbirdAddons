(() => {
  const api = globalThis.messenger || globalThis.browser;
  const language = String(api?.i18n?.getUILanguage?.() || navigator.language || "de").toLowerCase();
  const isGerman = language.startsWith("de");
  const locale = isGerman ? language : "en-US";
  const dictionaries = {
    de: {
      appName: "Kalender Raster",
      calendar: "Kalender",
      settings: "Einstellungen",
      filter: "Filter",
      reset: "Zuruecksetzen",
      search: "Suchen",
      period: "Zeitraum",
      day: "Tag",
      week: "Woche",
      month: "Monat",
      fourWeeks: "4 Wochen",
      profile: "Profil",
      newProfile: "Neues Profil",
      profiles: "Ansichtsprofile",
      edit: "Bearbeiten",
      moreSettings: "Weitere Einstellungen",
      appearance: "Darstellung",
      system: "System",
      standard: "Standard",
      highContrast: "Hoher Kontrast",
      accentColor: "Akzentfarbe",
      dragToCalendar: "Termin auf Kalender ziehen",
      restoreCalendars: "Entfernte Kalender wieder anzeigen",
      printPdf: "Als PDF drucken",
      diagnose: "Diagnose",
      previous: "Voriger Zeitraum",
      current: "Aktueller Zeitraum",
      next: "Naechster Zeitraum",
      eventKind: "Terminart",
      allEvents: "Alle Termine",
      timedEvents: "Mit Uhrzeit",
      allDayEvents: "Ganztags",
      calendars: "Kalender",
      calendarTypes: "Personen & Kategorien",
      people: "Personen",
      categories: "Kategorien",
      myself: "Ich",
      calendarPeople: "Personen des Kalenders",
      normalView: "Normalansicht",
      comparison: "Vergleich",
      peopleComparisonHint: "Wähle dich und beliebig viele weitere Personen. Jede Auswahl bleibt in ihrer eigenen Farbe sichtbar.",
      ownCalendars: "Meine Kalender",
      personRelationship: "Beziehung",
      personRelationshipself: "Ich",
      personRelationshippartner: "Partner/in",
      personRelationshipfriend: "Freund/in",
      personRelationshipcolleague: "Kollege/in",
      personRelationshipother: "Andere Person",
      birthdayCalendar: "Geburtstage",
      vacationCalendar: "Urlaub",
      addCalendar: "Kalender hinzufuegen",
      manageCalendars: "Kalender verwalten und sichern",
      addCalendarType: "Person oder Kategorie hinzufuegen",
      calendarTypeDialogNew: "Person oder Kategorie hinzufuegen",
      calendarTypeDialogEdit: "Person oder Kategorie bearbeiten",
      calendarTypeHint: "Ordne links einen Kalender per Drag-and-drop einer Person oder Kategorie zu. Ihre Gruppenfarbe wird nur verwendet, wenn der entsprechende Filter aktiv ist.",
      editEvent: "Bearbeiten",
      duplicateEvent: "Duplizieren",
      moveToCalendar: "In Kalender verschieben",
      profileStandard: "Standard",
      profileWork: "Arbeit",
      profileLeisure: "Freizeit",
      workingTime: "Arbeitszeit",
      leisureTime: "Freizeit",
      noMarking: "ohne Markierung",
      profileEditor: "Ansichtsprofil",
      profileDescription: "Darstellung und Tagesraster dieses Profils",
      name: "Name",
      timeMarker: "Zeitmarkierung",
      noMarker: "Keine Markierung",
      workHighlight: "Arbeitszeit hervorheben",
      leisureHighlight: "Freizeit hervorheben",
      workFrom: "Arbeitszeit von",
      until: "Bis",
      dayGrid: "Tagesraster",
      periodRange: "Zeitraum",
      fullDay: "24 Stunden",
      custom: "Benutzerdefiniert",
      from: "Von",
      days: "Tage",
      hideDaySuffix: " ausblenden",
      compactWeekend: "Wochenende schmaler",
      cancel: "Abbrechen",
      save: "Speichern",
      removeProfile: "Profil entfernen",
      openCalendar: "Kalender oeffnen",
      popupHint: "Eigener Tab in der linken Leiste",
      popupText: "Links in Thunderbirds Spaces-Leiste erscheint ein neuer Eintrag Kalender. Falls er nicht sichtbar ist, oeffne ihn hier einmal direkt.",
      addCalendarDialog: "Kalender hinzufuegen",
      close: "Schliessen",
      removeCalendarConfirm: "{calendar} wird nur aus dieser Add-on-Ansicht entfernt. Der Thunderbird-Kalender bleibt erhalten. Fortfahren?",
      calendarWizardOpened: "Thunderbirds Kalender-Assistent wurde geoeffnet",
      undoShortcut: "Strg+Z zum Rueckgaengigmachen",
      nothingToUndo: "Keine Add-on-Aktion zum Rueckgaengigmachen",
      actionUndone: "Aktion rueckgaengig gemacht",
      copyPrepared: "Kopie im Thunderbird-Editor vorbereitet",
      movedToCalendar: "Termin nach {calendar} verschoben",
      targetCalendar: "Zielkalender",
      unnamedCalendar: "(Ohne Namen)"
    },
    en: {
      appName: "Calendar Grid",
      calendar: "Calendar",
      settings: "Settings",
      filter: "Filter",
      reset: "Reset",
      search: "Search",
      period: "Period",
      day: "Day",
      week: "Week",
      month: "Month",
      fourWeeks: "4 weeks",
      profile: "Profile",
      newProfile: "New profile",
      profiles: "View profiles",
      edit: "Edit",
      moreSettings: "More settings",
      appearance: "Appearance",
      system: "System",
      standard: "Standard",
      highContrast: "High contrast",
      accentColor: "Accent color",
      dragToCalendar: "Drag events to calendars",
      restoreCalendars: "Show removed calendars again",
      printPdf: "Print as PDF",
      diagnose: "Diagnostics",
      previous: "Previous period",
      current: "Current period",
      next: "Next period",
      eventKind: "Event type",
      allEvents: "All events",
      timedEvents: "With time",
      allDayEvents: "All day",
      calendars: "Calendars",
      calendarTypes: "People & categories",
      people: "People",
      categories: "Categories",
      myself: "Me",
      calendarPeople: "Calendar people",
      normalView: "Normal view",
      comparison: "Comparison",
      peopleComparisonHint: "Choose yourself and any number of other people. Each selection stays in its own colour.",
      ownCalendars: "My calendars",
      personRelationship: "Relationship",
      personRelationshipself: "Me",
      personRelationshippartner: "Partner",
      personRelationshipfriend: "Friend",
      personRelationshipcolleague: "Colleague",
      personRelationshipother: "Other person",
      birthdayCalendar: "Birthdays",
      vacationCalendar: "Vacation",
      addCalendar: "Add calendar",
      manageCalendars: "Manage calendars and backups",
      addCalendarType: "Add person or category",
      calendarTypeDialogNew: "Add person or category",
      calendarTypeDialogEdit: "Edit person or category",
      calendarTypeHint: "Drag a calendar on the left onto a person or category. Its group colour is used only while the matching filter is active.",
      editEvent: "Edit",
      duplicateEvent: "Duplicate",
      moveToCalendar: "Move to calendar",
      profileStandard: "Standard",
      profileWork: "Work",
      profileLeisure: "Leisure",
      workingTime: "Working hours",
      leisureTime: "Leisure time",
      noMarking: "no marking",
      profileEditor: "View profile",
      profileDescription: "Display and day grid for this profile",
      name: "Name",
      timeMarker: "Time marking",
      noMarker: "No marking",
      workHighlight: "Highlight working hours",
      leisureHighlight: "Highlight leisure time",
      workFrom: "Working hours from",
      until: "Until",
      dayGrid: "Day grid",
      periodRange: "Period",
      fullDay: "24 hours",
      custom: "Custom",
      from: "From",
      days: "Days",
      hideDaySuffix: " hidden",
      compactWeekend: "Narrow weekends",
      cancel: "Cancel",
      save: "Save",
      removeProfile: "Remove profile",
      openCalendar: "Open calendar",
      popupHint: "Dedicated tab in the left sidebar",
      popupText: "A new Calendar entry appears in Thunderbird's Spaces toolbar. If it is not visible, open it directly here once.",
      addCalendarDialog: "Add calendar",
      close: "Close",
      removeCalendarConfirm: "{calendar} will only be removed from this add-on view. The Thunderbird calendar remains unchanged. Continue?",
      calendarWizardOpened: "Thunderbird's calendar assistant has opened",
      undoShortcut: "Press Ctrl+Z to undo",
      nothingToUndo: "There is no add-on action to undo",
      actionUndone: "Action undone",
      copyPrepared: "Copy prepared in Thunderbird's event editor",
      movedToCalendar: "Event moved to {calendar}",
      targetCalendar: "Target calendar",
      unnamedCalendar: "(Unnamed calendar)"
    }
  };
  const messages = isGerman ? dictionaries.de : dictionaries.en;

  function t(key, values = {}) {
    let text = messages[key] || dictionaries.de[key] || key;
    for (const [name, value] of Object.entries(values)) {
      text = text.replaceAll(`{${name}}`, String(value));
    }
    return text;
  }

  function text(selector, key) {
    const element = document.querySelector(selector);
    if (element) {
      element.textContent = t(key);
    }
  }

  function labelFor(id, key) {
    const element = document.getElementById(id)?.closest("label")?.querySelector("span");
    if (element) {
      element.textContent = t(key);
    }
  }

  function accessible(selector, key) {
    const element = document.querySelector(selector);
    if (element) {
      element.title = t(key);
      element.setAttribute("aria-label", t(key));
    }
  }

  function localizeDocument() {
    document.documentElement.lang = isGerman ? "de" : "en";
    text("#settings-toggle", "settings");
    text("#filter-panel h2", "filter");
    text("#reset-filters", "reset");
    text("#new-view-profile", "newProfile");
    text("#settings-panel .settings-subheading h3", "profiles");
    text(".calendar-sidebar-header h2", "calendars");
    text("#calendar-people-heading", "calendarPeople");
    text(".calendar-people-header span", "normalView");
    text("#filter-people-heading", "people");
    text(".filter-person-comparison header span", "comparison");
    text(".filter-person-comparison p", "peopleComparisonHint");
    text("#filter-panel .filter-group:first-of-type summary", "calendars");
    text("#filter-panel .filter-group:last-of-type summary", "categories");
    text("#advanced-settings > summary", "moreSettings");
    text("#restore-removed-calendars", "restoreCalendars");
    text("#manage-calendars-settings", "manageCalendars");
    text("#export-pdf", "printPdf");
    text("#diagnose", "diagnose");
    text("#context-edit-event", "editEvent");
    text("#context-duplicate-event", "duplicateEvent");
    text("#calendar-dialog h2", "addCalendarDialog");
    text("#calendar-type-dialog .dialog-hint", "calendarTypeHint");
    labelFor("calendar-type-relationship", "personRelationship");
    const relationship = document.getElementById("calendar-type-relationship");
    if (relationship) {
      const options = {
        self: "personRelationshipself",
        partner: "personRelationshippartner",
        friend: "personRelationshipfriend",
        colleague: "personRelationshipcolleague",
        other: "personRelationshipother"
      };
      for (const [value, key] of Object.entries(options)) {
        const option = relationship.querySelector(`option[value='${value}']`);
        if (option) option.textContent = t(key);
      }
    }
    accessible("#previous", "previous");
    accessible("#today", "current");
    accessible("#next", "next");
    accessible("#filter-toggle", "filter");
    accessible("#add-calendar", "addCalendar");
    accessible("#manage-calendars", "manageCalendars");
    accessible("#add-calendar-type", "addCalendarType");
    accessible("#close-calendar-dialog", "close");
    accessible("#close-day-zoom", "close");
    accessible("#close-calendar-type-dialog", "close");
    accessible("#close-diagnose-dialog", "close");
    text("#profile-form h1", "profileEditor");
    text("#profile-form header p", "profileDescription");
    text("#profile-form section:nth-of-type(2) h2", "dayGrid");
    text("#profile-form section:nth-of-type(3) h2", "days");
    text("#delete-profile", "removeProfile");
    text("#cancel-profile", "cancel");
    text("#profile-form button[type='submit']", "save");
    text("#open", "openCalendar");
    text("#settings-form h1", "appName");
    text("#settings-form header p", "popupHint");
    text("#settings-form .hint", "popupText");
    const search = document.getElementById("event-search");
    if (search) {
      search.placeholder = t("search");
      search.setAttribute("aria-label", t("search"));
    }
    const period = document.getElementById("period-mode");
    if (period) {
      period.closest("label")?.querySelector("span")?.replaceChildren(t("period"));
      const options = { day: "day", week: "week", month: "month", "four-weeks": "fourWeeks" };
      for (const [value, key] of Object.entries(options)) {
        const option = period.querySelector(`option[value='${value}']`);
        if (option) option.textContent = t(key);
      }
    }
    const profile = document.getElementById("view-profile");
    if (profile) profile.closest("label")?.querySelector("span")?.replaceChildren(t("profile"));
    const kind = document.getElementById("filter-event-kind");
    if (kind) {
      kind.closest("label")?.querySelector("span")?.replaceChildren(t("eventKind"));
      const options = { all: "allEvents", timed: "timedEvents", "all-day": "allDayEvents" };
      for (const [value, key] of Object.entries(options)) {
        const option = kind.querySelector(`option[value='${value}']`);
        if (option) option.textContent = t(key);
      }
    }
    labelFor("theme-mode", "appearance");
    labelFor("accent-color", "accentColor");
    const theme = document.getElementById("theme-mode");
    if (theme) {
      const options = { system: "system", standard: "standard", "high-contrast": "highContrast" };
      for (const [value, key] of Object.entries(options)) {
        const option = theme.querySelector(`option[value='${value}']`);
        if (option) option.textContent = t(key);
      }
    }
    const dragLabel = document.getElementById("drag-calendar-move")?.closest("label")?.querySelector("span");
    if (dragLabel) dragLabel.textContent = t("dragToCalendar");
    labelFor("profile-name", "name");
    labelFor("profile-effect", "timeMarker");
    labelFor("profile-view-mode", "periodRange");
    labelFor("work-start", "workFrom");
    labelFor("work-end", "until");
    labelFor("custom-start", "from");
    labelFor("custom-end", "until");
    const compactWeekend = document
      .getElementById("profile-compact-weekends")
      ?.closest("label")
      ?.querySelector("span");
    if (compactWeekend) compactWeekend.textContent = t("compactWeekend");
    const effect = document.getElementById("profile-effect");
    if (effect) {
      const options = { none: "noMarker", work: "workHighlight", leisure: "leisureHighlight" };
      for (const [value, key] of Object.entries(options)) {
        const option = effect.querySelector(`option[value='${value}']`);
        if (option) option.textContent = t(key);
      }
    }
    const grid = document.getElementById("profile-view-mode");
    if (grid) {
      const options = { full: "fullDay", custom: "custom" };
      for (const [value, key] of Object.entries(options)) {
        const option = grid.querySelector(`option[value='${value}']`);
        if (option) option.textContent = t(key);
      }
    }
  }

  globalThis.calendarI18n = { t, locale, isGerman, localizeDocument };
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", localizeDocument, { once: true });
  } else {
    localizeDocument();
  }
})();
