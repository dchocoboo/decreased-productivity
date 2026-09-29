"use strict";
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.target === "migration" && request.type === "read-legacy-storage")
    sendResponse({ ...localStorage });
});
