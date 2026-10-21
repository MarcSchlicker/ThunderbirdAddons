const tb = globalThis.messenger || globalThis.browser;
const t = globalThis.calendarI18n?.t || (key => key);
const UI_LOCALE = globalThis.calendarI18n?.locale || "de-DE";

const DEFAULT_PROFILES = [
  {
    id: "standard",
    name: t("profileStandard"),
    effect: "none",
    workStartHour: 8,
    workEndHour: 17,
    viewMode: "full",
    customStartHour: 8,
    customEndHour: 22,
    hiddenWeekdays: [],
    compactWeekends: false,
    builtIn: true
  },
  {
    id: "work",
    name: t("profileWork"),
    effect: "work",
    workStartHour: 8,
    workEndHour: 17,
    viewMode: "full",
    customStartHour: 8,
    customEndHour: 22,
    hiddenWeekdays: [],
    compactWeekends: false,
    builtIn: true
  },
  {
    id: "leisure",
    name: t("profileLeisure"),
    effect: "leisure",
    workStartHour: 8,
    workEndHour: 17,
    viewMode: "full",
    customStartHour: 8,
    customEndHour: 22,
    hiddenWeekdays: [],
    compactWeekends: false,
    builtIn: true
  }
];

const form = document.getElementById("profile-form");
const title = document.getElementById("profile-title");
const nameInput = document.getElementById("profile-name");
const effectInput = document.getElementById("profile-effect");
const workStartInput = document.getElementById("work-start");
const workEndInput = document.getElementById("work-end");
const workTimeFields = document.getElementById("work-time-fields");
const viewModeInput = document.getElementById("profile-view-mode");
const customStartInput = document.getElementById("custom-start");
const customEndInput = document.getElementById("custom-end");
const customTimeFields = document.getElementById("custom-time-fields");
const weekdayOptions = document.getElementById("profile-weekday-options");
const compactWeekendsInput = document.getElementById("profile-compact-weekends");
const deleteButton = document.getElementById("delete-profile");
const cancelButton = document.getElementById("cancel-profile");
const status = document.getElementById("profile-status");

let profiles = [];
let currentProfile = null;

function clampHour(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.min(24, Math.round(number))) : fallback;
}

function normalizeProfile(profile) {
  const defaultProfile = DEFAULT_PROFILES.find(entry => entry.id === profile?.id);
  const fallback = defaultProfile || DEFAULT_PROFILES[0];
  let workStart = clampHour(profile?.workStartHour, fallback.workStartHour);
  let workEnd = clampHour(profile?.workEndHour, fallback.workEndHour);
  if (workEnd <= workStart) {
    workEnd = Math.min(24, workStart + 1);
  }
  let customStart = clampHour(profile?.customStartHour, fallback.customStartHour);
  let customEnd = clampHour(profile?.customEndHour, fallback.customEndHour);
  if (customEnd <= customStart) {
    customEnd = Math.min(24, customStart + 1);
  }
  const hiddenWeekdays = Array.isArray(profile?.hiddenWeekdays)
    ? [...new Set(profile.hiddenWeekdays.map(Number).filter(day => day >= 0 && day <= 6))]
    : [...fallback.hiddenWeekdays];
  return {
    id: String(profile?.id || `profile-${Date.now().toString(36)}`),
    name: String(profile?.name || fallback.name || "Neues Profil").trim() || "Neues Profil",
    effect: ["none", "work", "leisure"].includes(profile?.effect)
      ? profile.effect
      : fallback.effect,
    workStartHour: workStart,
    workEndHour: workEnd,
    viewMode: profile?.viewMode === "custom" ? "custom" : "full",
    customStartHour: customStart,
    customEndHour: customEnd,
    hiddenWeekdays,
    compactWeekends: Boolean(profile?.compactWeekends ?? fallback.compactWeekends),
    builtIn: Boolean(defaultProfile || profile?.builtIn)
  };
}

function normalizeProfiles(values) {
  const supplied = Array.isArray(values) ? values.map(normalizeProfile) : [];
  const defaults = DEFAULT_PROFILES.map(defaultProfile => {
    const existing = supplied.find(profile => profile.id === defaultProfile.id);
    return normalizeProfile(existing || defaultProfile);
  });
  return [
    ...defaults,
    ...supplied.filter(
      profile => !DEFAULT_PROFILES.some(defaultProfile => defaultProfile.id === profile.id)
    )
  ];
}

function syncConditionalFields() {
  workTimeFields.hidden = effectInput.value === "none";
  customTimeFields.hidden = viewModeInput.value !== "custom";
}

function buildWeekdayOptions() {
  const formatter = new Intl.DateTimeFormat(UI_LOCALE, { weekday: "short" });
  const days = [1, 2, 3, 4, 5, 6, 0].map(value => [
    value,
    formatter.format(new Date(2024, 0, value === 0 ? 7 : value))
  ]);
  weekdayOptions.replaceChildren();
  for (const [value, labelText] of days) {
    const label = document.createElement("label");
    label.className = "profile-check-setting";
    const input = document.createElement("input");
    input.type = "checkbox";
    input.dataset.weekday = String(value);
    const text = document.createElement("span");
    text.textContent = `${labelText}${t("hideDaySuffix")}`;
    label.append(input, text);
    weekdayOptions.appendChild(label);
  }
}

function fillForm(profile, isNew) {
  currentProfile = profile;
  title.textContent = isNew ? t("newProfile") : profile.name;
  nameInput.value = profile.name;
  effectInput.value = profile.effect;
  workStartInput.value = String(profile.workStartHour);
  workEndInput.value = String(profile.workEndHour);
  viewModeInput.value = profile.viewMode;
  customStartInput.value = String(profile.customStartHour);
  customEndInput.value = String(profile.customEndHour);
  for (const input of weekdayOptions.querySelectorAll("input[type='checkbox']")) {
    input.checked = profile.hiddenWeekdays.includes(Number(input.dataset.weekday));
  }
  compactWeekendsInput.checked = Boolean(profile.compactWeekends);
  deleteButton.hidden = isNew || profile.builtIn;
  syncConditionalFields();
}

function profileFromForm() {
  return normalizeProfile({
    ...currentProfile,
    name: nameInput.value,
    effect: effectInput.value,
    workStartHour: workStartInput.value,
    workEndHour: workEndInput.value,
    viewMode: viewModeInput.value,
    customStartHour: customStartInput.value,
    customEndHour: customEndInput.value,
    hiddenWeekdays: Array.from(
      weekdayOptions.querySelectorAll("input[type='checkbox']:checked"),
      input => Number(input.dataset.weekday)
    ),
    compactWeekends: compactWeekendsInput.checked
  });
}

async function init() {
  const saved = await tb.storage.local.get({
    viewProfiles: DEFAULT_PROFILES,
    activeViewProfileId: "standard"
  });
  profiles = normalizeProfiles(saved.viewProfiles);
  buildWeekdayOptions();
  const profileId = new URLSearchParams(location.search).get("profileId") || "new";
  if (profileId === "new") {
    fillForm(
      normalizeProfile({
        id: `profile-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
        name: t("newProfile"),
        effect: "none",
        viewMode: "full",
        builtIn: false
      }),
      true
    );
  } else {
    const profile = profiles.find(entry => entry.id === profileId);
    if (!profile) {
      status.textContent = "Das Profil wurde nicht gefunden.";
      form.querySelector('button[type="submit"]').disabled = true;
      return;
    }
    fillForm(profile, false);
  }
  nameInput.focus();
  nameInput.select();
}

effectInput.addEventListener("change", syncConditionalFields);
viewModeInput.addEventListener("change", syncConditionalFields);
cancelButton.addEventListener("click", () => window.close());

form.addEventListener("submit", async event => {
  event.preventDefault();
  const profile = profileFromForm();
  const index = profiles.findIndex(entry => entry.id === profile.id);
  if (index >= 0) {
    profiles = profiles.map(entry => (entry.id === profile.id ? profile : entry));
  } else {
    profiles = [...profiles, profile];
  }
  await tb.storage.local.set({
    viewProfiles: profiles,
    activeViewProfileId: profile.id,
    profileSettingsVersion: 3
  });
  window.close();
});

deleteButton.addEventListener("click", async () => {
  if (!currentProfile || currentProfile.builtIn) {
    return;
  }
  profiles = profiles.filter(profile => profile.id !== currentProfile.id);
  const saved = await tb.storage.local.get({ activeViewProfileId: "standard" });
  await tb.storage.local.set({
    viewProfiles: profiles,
    activeViewProfileId:
      saved.activeViewProfileId === currentProfile.id
        ? "standard"
        : saved.activeViewProfileId,
    profileSettingsVersion: 3
  });
  window.close();
});

init().catch(error => {
  status.textContent = error?.message || String(error);
});
