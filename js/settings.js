/* Shared pure settings and domain logic. No browser or DOM dependencies. */
(() => {
  "use strict";
  const defaults = Object.freeze({
    enable: "true",
    enableToggle: "true",
    hotkey: "CTRL F12",
    paranoidhotkey: "ALT P",
    global: "false",
    newPages: "Uncloak",
    sfwmode: "SFW",
    savedsfwmode: "",
    opacity1: "0.05",
    opacity2: "0.5",
    collapseimage: "false",
    showIcon: "true",
    iconType: "coffee",
    iconTitle: "Decreased Productivity",
    disableFavicons: "false",
    hidePageTitles: "false",
    pageTitleText: "Browser",
    enableStickiness: "false",
    maxwidth: "0",
    maxheight: "0",
    showContext: "true",
    showUnderline: "true",
    removeBold: "false",
    showUpdateNotifications: "true",
    font: "Arial",
    customfont: "",
    fontsize: "12",
    s_bg: "FFFFFF",
    s_link: "000099",
    s_table: "cccccc",
    s_text: "000000",
    customcss: "",
    whiteList: [],
    blackList: [],
  });
  const booleans = Object.keys(defaults).filter((key) =>
    ["true", "false"].includes(defaults[key]),
  );
  const enums = {
    newPages: ["Cloak", "Uncloak"],
    sfwmode: ["SFW", "SFW1", "SFW2", "Paranoid", "NSFW"],
    font: [
      "Arial",
      "Calibri",
      "Helvetica",
      "Serif",
      "Monospace",
      "-Unchanged-",
      "-Custom-",
    ],
  };
  function domain(value) {
    value = String(value).trim().toLowerCase().replace(/\.$/, "");
    if (
      !value ||
      value.length > 253 ||
      !/^(?:[a-z0-9*?_-]+(?:\.[a-z0-9*?_-]+)*|\[[a-f0-9:]+\])$/.test(value)
    )
      throw new Error("Invalid domain: " + value);
    return value;
  }
  function matches(host, pattern) {
    host = String(host).toLowerCase().replace(/\.$/, "");
    const source = pattern
      .replace(/[.+^${}()|[\]\\]/g, "\\$&")
      .replace(/\*/g, "[^.]*")
      .replace(/\?/g, "[^.]");
    const regex = new RegExp("^" + source + "$");
    return (
      regex.test(host) || (host.startsWith("www.") && regex.test(host.slice(4)))
    );
  }
  function hostname(url) {
    try {
      return new URL(url).hostname.toLowerCase();
    } catch {
      return "";
    }
  }
  function supported(url) {
    return /^https?:\/\//i.test(url || "");
  }
  function rule(settings, url) {
    const host = hostname(url);
    if (settings.whiteList.some((pattern) => matches(host, pattern)))
      return false;
    if (settings.blackList.some((pattern) => matches(host, pattern)))
      return true;
    return null;
  }
  function enabled(settings, url, override) {
    if (!supported(url)) return false;
    const forced = rule(settings, url);
    if (forced !== null) return forced;
    if (settings.enable !== "true") return false;
    return (
      settings.global === "true" || (override ?? settings.newPages === "Cloak")
    );
  }
  function validate(input, strict = false) {
    const settings = { ...defaults, whiteList: [], blackList: [] };
    for (const [key, raw] of Object.entries(input || {})) {
      if (!Object.hasOwn(defaults, key)) {
        if (strict) throw new Error("Unknown setting: " + key);
        else continue;
      }
      try {
        let value = raw;
        if (key.endsWith("List")) {
          if (typeof value === "string") value = JSON.parse(value);
          if (!Array.isArray(value)) throw new Error("Expected a domain list");
          value = [...new Set(value.map(domain))].sort();
        } else {
          value = String(value);
          if (booleans.includes(key) && !["true", "false"].includes(value))
            throw new Error("Expected true or false");
          if (key === "sfwmode" && value === "true") value = "SFW";
          if (enums[key] && !enums[key].includes(value))
            throw new Error("Invalid choice");
          if (
            /^s_(bg|link|table|text)$/.test(key) &&
            !/^(?:[a-f0-9]{3}|[a-f0-9]{6})$/i.test(value)
          )
            throw new Error("Expected 3 or 6 hex digits");
          if (
            [
              "opacity1",
              "opacity2",
              "fontsize",
              "maxwidth",
              "maxheight",
            ].includes(key)
          ) {
            const number = Number(value),
              min = key === "fontsize" ? 1 : 0;
            const max = key.startsWith("opacity")
              ? 1
              : key === "fontsize"
                ? 200
                : 10000;
            if (
              !value.trim() ||
              !Number.isFinite(number) ||
              number < min ||
              number > max
            )
              throw new Error("Number outside allowed range");
            value = String(number);
          }
          if (key === "iconType" && !/^[a-z0-9-]+$/.test(value))
            throw new Error("Invalid icon name");
          if (["hotkey", "paranoidhotkey"].includes(key)) {
            value = value
              .trim()
              .replace(/\+$/, "PLUS")
              .replace(/\+/g, " ")
              .replace(/\s+/g, " ")
              .toUpperCase();
            const tokens = value.split(" "),
              key = tokens.pop();
            const aliases = {
              UP: "ARROWUP",
              DOWN: "ARROWDOWN",
              LEFT: "ARROWLEFT",
              RIGHT: "ARROWRIGHT",
              ESC: "ESCAPE",
              RETURN: "ENTER",
              SPACEBAR: "SPACE",
              DEL: "DELETE",
            };
            const canonical = aliases[key] || key;
            if (
              tokens.some(
                (token) =>
                  !["CTRL", "CMD", "META", "ALT", "SHIFT", "CTRL/CMD"].includes(
                    token,
                  ),
              ) ||
              !(
                canonical.length === 1 ||
                /^(?:F(?:[1-9]|1[0-9]|2[0-4])|PLUS|SPACE|ENTER|ESCAPE|TAB|ARROW(?:UP|DOWN|LEFT|RIGHT)|BACKSPACE|DELETE|INSERT|HOME|END|PAGEUP|PAGEDOWN)$/.test(
                  canonical,
                )
              )
            )
              throw new Error("Invalid shortcut");
            value = [...tokens, canonical].join(" ");
          }
          if (value.length > (key === "customcss" ? 100000 : 1000))
            throw new Error("Value too long");
        }
        settings[key] = value;
      } catch (error) {
        if (strict) throw new Error(key + ": " + error.message);
      }
    }
    if (
      settings.savedsfwmode &&
      enums.sfwmode.includes(settings.savedsfwmode)
    ) {
      settings.sfwmode = settings.savedsfwmode;
      settings.savedsfwmode = "";
    }
    // A whitelist wins if a legacy export has the same domain in both lists.
    settings.blackList = settings.blackList.filter(
      (item) => !settings.whiteList.includes(item),
    );
    return settings;
  }
  function importSettings(text, current = defaults) {
    let parsed;
    if (text.trim().startsWith("{")) parsed = JSON.parse(text);
    else {
      parsed = {};
      for (const line of text.split(/\r?\n/).filter((line) => line.trim())) {
        const separator = line.indexOf("|");
        if (separator < 1) throw new Error("Expected setting|value");
        const key = line.slice(0, separator).trim();
        if (key === "version") continue;
        parsed[key] = line.slice(separator + 1);
      }
    }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
      throw new Error("Expected a settings object");
    return validate({ ...current, ...parsed }, true);
  }
  function shortcut(event, value) {
    const tokens = value.toUpperCase().split(" "),
      key = tokens.pop();
    const actual =
      event.key === " "
        ? "SPACE"
        : event.key === "+"
          ? "PLUS"
          : event.key.toUpperCase();
    const portable = tokens.includes("CTRL/CMD") || value === "CTRL F12";
    const control = portable
      ? event.ctrlKey || event.metaKey
      : event.ctrlKey === tokens.includes("CTRL") &&
        event.metaKey === (tokens.includes("CMD") || tokens.includes("META"));
    return (
      !event.repeat &&
      actual === key &&
      control &&
      event.altKey === tokens.includes("ALT") &&
      event.shiftKey === tokens.includes("SHIFT")
    );
  }
  const api = {
    defaults,
    validate,
    domain,
    matches,
    hostname,
    supported,
    rule,
    enabled,
    importSettings,
    shortcut,
  };
  globalThis.DPSettings = api;
  if (typeof module !== "undefined") module.exports = api;
})();
