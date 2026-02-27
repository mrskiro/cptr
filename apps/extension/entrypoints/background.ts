export default defineBackground(() => {
  browser.commands.onCommand.addListener(async (command) => {
    if (command !== "toggle-capture") return;

    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) return;

    browser.tabs.sendMessage(tab.id, { type: "toggle-capture" });
  });
});
