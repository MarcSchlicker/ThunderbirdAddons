const tb = globalThis.messenger || globalThis.browser;

const openButton = document.getElementById("open");
const spaceUrl = tb.runtime.getURL("space/month.html");

async function openFallbackTab() {
  if (tb.tabs?.create) {
    await tb.tabs.create({ url: spaceUrl });
  }
}

openButton.addEventListener("click", async () => {
  try {
    await tb.runtime.sendMessage({ type: "openHourGridSpace" });
  } catch (error) {
    await openFallbackTab();
  }
  window.close();
});
