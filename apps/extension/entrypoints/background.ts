export default defineBackground(() => {
  browser.commands.onCommand.addListener(async (command) => {
    if (command !== "toggle-capture") return;

    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) return;

    browser.tabs.sendMessage(tab.id, { type: "toggle-capture" });
  });

  browser.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.type !== "capture") return;

    browser.tabs
      .captureVisibleTab({ format: "png" })
      .then((dataUrl) => sendResponse({ dataUrl }))
      .catch((err) => sendResponse({ error: String(err) }));

    return true; // 非同期レスポンスのために必要
  });
});
