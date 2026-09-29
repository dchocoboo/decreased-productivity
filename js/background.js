/* Event listeners are registered synchronously; durable storage is the source of truth. */
"use strict";
if (typeof importScripts === "function")
  importScripts("settings.js", "style.js");
const extension = globalThis.browser || chrome;
let queue = Promise.resolve();
function serialized(task) {
  const result = queue.then(task);
  queue = result.catch(console.error);
  return result;
}
let initialization;
async function initialize() {
  if (!initialization)
    initialization = (async () => {
      const stored = await extension.storage.local.get("settings");
      if (stored.settings) return;
      let legacy = {};
      if (typeof localStorage !== "undefined") legacy = { ...localStorage };
      else if (extension.offscreen) {
        try {
          if (!(await extension.offscreen.hasDocument()))
            await extension.offscreen.createDocument({
              url: "migration.html",
              reasons: ["LOCAL_STORAGE"],
              justification:
                "Preserve existing Decreased Productivity settings when upgrading to Manifest V3.",
            });
          legacy = await extension.runtime.sendMessage({
            type: "read-legacy-storage",
            target: "migration",
          });
        } finally {
          if (await extension.offscreen.hasDocument())
            await extension.offscreen.closeDocument();
        }
      }
      await extension.storage.local.set({
        settings: DPSettings.validate(legacy),
      });
    })().catch((error) => {
      initialization = undefined;
      throw error;
    });
  return initialization;
}
async function settings() {
  await initialize();
  return DPSettings.validate(
    (await extension.storage.local.get("settings")).settings,
  );
}
async function states() {
  return (await extension.storage.session.get("tabs")).tabs || {};
}
async function setState(id, state) {
  const tabs = await states();
  if (state == null) delete tabs[id];
  else tabs[id] = state;
  await extension.storage.session.set({ tabs });
}
async function ensureTabState(tab) {
  const config = await settings(),
    tabs = await states(),
    current = tabs[tab.id];
  if (current && current.source !== "default") return;
  let enabled = current?.enabled ?? config.newPages === "Cloak",
    source = "default";
  if (config.enableStickiness === "true" && tab.openerTabId) {
    const opener = await extension.tabs.get(tab.openerTabId).catch(() => null);
    if (
      opener &&
      DPSettings.enabled(config, opener.url, tabs[opener.id]?.enabled)
    ) {
      enabled = true;
      source = "inherited";
    }
  }
  if (!current || current.enabled !== enabled || current.source !== source)
    await setState(tab.id, { enabled, source });
}
async function response(tab) {
  const config = await settings(),
    tabs = await states();
  return {
    type: "apply",
    settings: config,
    enabled: DPSettings.enabled(config, tab.url, tabs[tab.id]?.enabled),
    paranoid:
      config.global === "true"
        ? Boolean(
            (await extension.storage.session.get("globalParanoid"))
              .globalParanoid,
          )
        : tabs[tab.id]?.paranoid || false,
  };
}
async function updateTab(tab) {
  if (!tab?.id) return;
  const payload = await response(tab);
  const icon = payload.settings.iconType;
  try {
    await extension.action.setIcon({
      tabId: tab.id,
      path:
        "img/addressicon/" +
        icon +
        (payload.enabled ? "" : "-disabled") +
        ".png",
    });
  } catch {
    await extension.action
      .setIcon({
        tabId: tab.id,
        path:
          "img/addressicon/coffee" +
          (payload.enabled ? "" : "-disabled") +
          ".png",
      })
      .catch(() => {});
  }
  await extension.action
    .setTitle({
      tabId: tab.id,
      title:
        payload.settings.iconTitle +
        (payload.enabled ? " — cloaked" : " — uncloaked"),
    })
    .catch(() => {});
  // No receiver is normal on protected browser pages, closed tabs and before document_start.
  await extension.tabs.sendMessage(tab.id, payload).catch(() => {});
}
async function updateAll() {
  await Promise.all((await extension.tabs.query({})).map(updateTab));
}
async function menus() {
  const config = await settings();
  await extension.contextMenus.removeAll();
  for (const [id, key] of [
    ["whitelist", "whitelistdomain"],
    ["blacklist", "blacklistdomain"],
    ["remove", "removelist"],
  ]) {
    extension.contextMenus.create({
      id,
      title: extension.i18n.getMessage(key),
      contexts: ["action"],
      documentUrlPatterns: ["http://*/*", "https://*/*"],
    });
  }
  if (config.showContext === "true")
    extension.contextMenus.create({
      id: "safe-open",
      title: extension.i18n.getMessage("opensafely"),
      contexts: ["link", "image"],
      targetUrlPatterns: ["http://*/*", "https://*/*"],
    });
  extension.contextMenus.create({
    id: "options",
    title: extension.i18n.getMessage("dpoptions"),
    contexts: ["action"],
  });
}
async function toggle(tab, paranoid = false) {
  if (!tab || !DPSettings.supported(tab.url)) return;
  const config = await settings(),
    all = await states(),
    old = all[tab.id] || {};
  if (config.global === "true")
    old.paranoid = Boolean(
      (await extension.storage.session.get("globalParanoid")).globalParanoid,
    );
  if (paranoid || old.paranoid) {
    const next = paranoid ? !old.paranoid : false;
    if (config.global === "true") {
      await extension.storage.session.set({ globalParanoid: next });
    } else
      await setState(tab.id, {
        enabled: true,
        paranoid: next,
        source: "manual",
      });
    if (config.enable !== "true")
      await extension.storage.local.set({
        settings: { ...config, enable: "true" },
      });
    if (config.global === "true" || config.enable !== "true") await updateAll();
    else await updateTab(tab);
    return;
  }
  if (config.global === "true") {
    await extension.storage.local.set({
      settings: {
        ...config,
        enable: config.enable === "true" ? "false" : "true",
      },
    });
    await updateAll();
  } else {
    const current = DPSettings.enabled(config, tab.url, old.enabled);
    await setState(tab.id, { ...old, enabled: !current, source: "manual" });
    if (config.enable !== "true")
      await extension.storage.local.set({
        settings: { ...config, enable: "true" },
      });
    if (config.enable !== "true") await updateAll();
    else await updateTab(tab);
  }
}
async function changeDomain(domain, action) {
  const config = await settings(),
    value = DPSettings.domain(domain);
  config.whiteList = config.whiteList.filter((item) => item !== value);
  config.blackList = config.blackList.filter((item) => item !== value);
  if (action === "whitelist") config.whiteList.push(value);
  if (action === "blacklist") config.blackList.push(value);
  await extension.storage.local.set({
    settings: DPSettings.validate(config, true),
  });
  await updateAll();
  return config;
}
async function handle(request, sender) {
  if (request.type === "get-settings") return { settings: await settings() };
  if (request.type === "get-state" && sender.tab) {
    // sender.tab.url is always the top-level URL, including cross-origin subframe requests.
    await serialized(async () =>
      ensureTabState(await extension.tabs.get(sender.tab.id)),
    );
    return response(await extension.tabs.get(sender.tab.id));
  }
  if (["toggle", "paranoid"].includes(request.type) && sender.tab)
    return serialized(() => toggle(sender.tab, request.type === "paranoid"));
  if (request.type === "sync-style" && sender.tab)
    return serialized(async () => {
      const tab = await extension.tabs.get(sender.tab.id),
        payload = await response(tab);
      const key =
          tab.id +
          ":" +
          (sender.documentId || request.documentKey || sender.frameId),
        saved = (await extension.storage.session.get("css")).css || {};
      const target =
        sender.documentId && !globalThis.browser
          ? { tabId: tab.id, documentIds: [sender.documentId] }
          : { tabId: tab.id, frameIds: [sender.frameId] };
      if (saved[key])
        await extension.scripting
          .removeCSS({ target, css: saved[key], origin: "USER" })
          .catch(() => {});
      if (payload.enabled) {
        saved[key] = DPStyle.css(payload.settings, payload.paranoid, true);
        await extension.scripting
          .insertCSS({ target, css: saved[key], origin: "USER" })
          .catch(() => {});
      } else delete saved[key];
      await extension.storage.session.set({ css: saved });
      return {};
    });
  const trusted =
    sender.id === extension.runtime.id &&
    sender.url?.split(/[?#]/)[0] === extension.runtime.getURL("options.html");
  if (!trusted)
    throw new Error("This operation requires the extension options page.");
  if (request.type === "save-settings")
    return serialized(async () => {
      const next = DPSettings.validate(
        { ...(await settings()), ...request.patch },
        true,
      );
      await extension.storage.local.set({ settings: next });
      await menus();
      await updateAll();
      return { settings: next };
    });
  if (request.type === "domain")
    return serialized(async () => ({
      settings: await changeDomain(request.domain, request.action),
    }));
  throw new Error("Unknown request");
}
async function safeOpen(info, tab) {
  const url = info.linkUrl || info.srcUrl;
  if (!DPSettings.supported(url)) return;
  const config = await settings();
  if (config.enable !== "true")
    await extension.storage.local.set({
      settings: { ...config, enable: "true" },
    });
  // Create about:blank first so state is persisted before the target can execute content scripts.
  const created = await extension.tabs.create({
    url: "about:blank",
    openerTabId: tab.id,
  });
  await setState(created.id, { enabled: true, source: "safe-open" });
  await extension.tabs.update(created.id, { url });
  return created;
}
extension.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.target === "migration") return false;
  handle(request, sender).then(sendResponse, (error) =>
    sendResponse({ error: error.message }),
  );
  return true;
});
extension.action.onClicked.addListener((tab) => {
  serialized(() => toggle(tab));
});
extension.contextMenus.onClicked.addListener((info, tab) => {
  serialized(async () => {
    if (info.menuItemId === "options")
      return extension.runtime.openOptionsPage();
    if (info.menuItemId === "safe-open") {
      return safeOpen(info, tab);
    }
    if (DPSettings.supported(tab?.url))
      await changeDomain(DPSettings.hostname(tab.url), info.menuItemId);
  });
});
extension.tabs.onCreated.addListener((tab) => {
  serialized(async () => {
    await ensureTabState(await extension.tabs.get(tab.id));
    await updateTab(tab);
  });
});
extension.tabs.onUpdated.addListener((id, change, tab) => {
  if (change.status || change.url)
    serialized(async () => {
      await ensureTabState(tab);
      await updateTab(tab);
    });
});
extension.tabs.onRemoved.addListener((id) => {
  serialized(async () => {
    await setState(id, null);
    const stored = (await extension.storage.session.get("css")).css || {};
    for (const key of Object.keys(stored))
      if (key.startsWith(id + ":")) delete stored[key];
    await extension.storage.session.set({ css: stored });
  });
});
extension.runtime.onStartup.addListener(() => {
  serialized(async () => {
    await extension.storage.session.clear();
    await menus();
    await updateAll();
  });
});
extension.runtime.onInstalled.addListener((details) => {
  serialized(async () => {
    await initialize();
    await menus();
    // Reach pages already open at installation/update. The content script has a duplicate guard.
    const tabs = await extension.tabs.query({});
    await Promise.all(
      tabs
        .filter((tab) => DPSettings.supported(tab.url))
        .map((tab) =>
          extension.scripting
            .executeScript({
              target: { tabId: tab.id, allFrames: true },
              files: ["js/settings.js", "js/style.js", "js/dp.js"],
            })
            .catch(() => {}),
        ),
    );
    await updateAll();
    if (
      details.reason === "update" &&
      (await settings()).showUpdateNotifications === "true"
    )
      await extension.tabs.create({
        url: extension.runtime.getURL("updated.html"),
        active: false,
      });
  });
});
