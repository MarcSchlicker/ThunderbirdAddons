"use strict";

const tb = globalThis.messenger || globalThis.browser;
const token = new URLSearchParams(location.search).get("token");
const dateInput = document.querySelector("#due-date");
const status = document.querySelector("#status");

dateInput.value = new Date().toLocaleDateString("sv-SE");

document.querySelector("#cancel").addEventListener("click", () => window.close());

document.querySelector("#date-form").addEventListener("submit", async event => {
  event.preventDefault();
  if (!token || !dateInput.value) {
    status.textContent = "Bitte die Mail erneut auswählen und ein Datum festlegen.";
    return;
  }
  for (const control of document.querySelectorAll("button, input")) {
    control.disabled = true;
  }
  status.textContent = "Wird eingeplant …";
  try {
    const result = await tb.runtime.sendMessage({
      type: "confirmPendingEmailDate",
      token,
      dueDate: dateInput.value
    });
    if (!result?.ok) {
      throw new Error(result?.error || "Einplanen fehlgeschlagen.");
    }
    status.textContent = "Mail wurde eingeplant.";
    setTimeout(() => window.close(), 600);
  } catch (error) {
    status.textContent = error?.message || String(error);
    for (const control of document.querySelectorAll("button, input")) {
      control.disabled = false;
    }
  }
});
