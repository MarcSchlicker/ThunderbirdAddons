"use strict";

const tb = globalThis.messenger || globalThis.browser;
const status = document.querySelector("#status");

function setDisabled(disabled) {
  for (const candidate of document.querySelectorAll("button, input")) {
    candidate.disabled = disabled;
  }
}

for (const button of document.querySelectorAll("main button[data-target]")) {
  button.addEventListener("click", async () => {
    setDisabled(true);
    status.textContent = "Wird eingeplant …";
    try {
      const result = await tb.runtime.sendMessage({
        type: "markActiveMessages",
        target: button.dataset.target
      });
      if (!result?.ok) {
        throw new Error(result?.error || "Einplanen fehlgeschlagen.");
      }
      status.textContent = `${result.count} ${result.count === 1 ? "Mail" : "Mails"} eingeplant.`;
      setTimeout(() => window.close(), 650);
    } catch (error) {
      status.textContent = error?.message || String(error);
      setDisabled(false);
    }
  });
}

const customDate = document.querySelector("#custom-date");
customDate.value = new Date().toLocaleDateString("sv-SE");

document.querySelector("#custom-date-form").addEventListener("submit", async event => {
  event.preventDefault();
  if (!customDate.value) {
    return;
  }
  setDisabled(true);
  status.textContent = "Wird eingeplant …";
  try {
    const result = await tb.runtime.sendMessage({
      type: "markActiveMessagesForDate",
      dueDate: customDate.value
    });
    if (!result?.ok) {
      throw new Error(result?.error || "Einplanen fehlgeschlagen.");
    }
    status.textContent = `${result.count} ${result.count === 1 ? "Mail" : "Mails"} eingeplant.`;
    setTimeout(() => window.close(), 650);
  } catch (error) {
    status.textContent = error?.message || String(error);
    setDisabled(false);
  }
});

document.querySelector("#open-planner").addEventListener("click", async () => {
  await tb.runtime.sendMessage({ type: "openPlannerSpace" });
  window.close();
});
