/* Reversible cloak for modern dynamic pages. No page JavaScript is evaluated. */
(() => {
  "use strict";
  if (globalThis.__decreasedProductivityLoaded) return;
  globalThis.__decreasedProductivityLoaded = true;
  const extension = globalThis.browser || chrome;
  const styleId = "__dp_cloak_style",
    visible = "__dp_small_image";
  const documentKey =
    crypto.randomUUID?.() ||
    Array.from(crypto.getRandomValues(new Uint32Array(4)), (n) =>
      n.toString(16),
    ).join("-");
  const roots = new Set([document]),
    styles = new Map(),
    icons = new Map();
  let config = DPSettings.defaults,
    active = false,
    paranoid = false,
    originalTitle = null,
    blankIcon = null;
  let scheduled = false;
  const observer = new MutationObserver((records) => {
    // Preserve the latest real SPA title, rather than only the initial document title.
    if (
      active &&
      config.hidePageTitles === "true" &&
      document.title !== config.pageTitleText
    )
      originalTitle = document.title;
    schedule();
  });
  function observe(root) {
    observer.observe(root, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: [
        "href",
        "rel",
        "src",
        "width",
        "height",
        "class",
        "style",
      ],
    });
  }
  function walk(root) {
    const parent = root === document ? document.documentElement : root;
    if (!parent) return;
    let style = styles.get(root);
    if (!style?.isConnected) {
      style = document.createElement("style");
      style.id = styleId;
      style.textContent = DPStyle.css(config, paranoid);
      styles.set(root, style);
      parent.append(style);
    }
    for (const image of root.querySelectorAll("img")) {
      const box = image.getBoundingClientRect();
      const computed = getComputedStyle(image);
      const width = box.width || parseFloat(computed.width) || image.width,
        height = box.height || parseFloat(computed.height) || image.height;
      const small =
        Number(config.maxwidth) > 0 &&
        Number(config.maxheight) > 0 &&
        width > 0 &&
        height > 0 &&
        width <= Number(config.maxwidth) &&
        height <= Number(config.maxheight);
      if (image.classList.contains(visible) !== small)
        image.classList.toggle(visible, small);
    }
    for (const element of root.querySelectorAll("*")) {
      if (element.shadowRoot) {
        if (!roots.has(element.shadowRoot)) {
          roots.add(element.shadowRoot);
          observe(element.shadowRoot);
        }
        walk(element.shadowRoot);
      }
    }
  }
  function metadata() {
    if (window !== window.top) return;
    if (config.hidePageTitles === "true") {
      if (originalTitle === null) originalTitle = document.title;
      if (document.title !== config.pageTitleText)
        document.title = config.pageTitleText;
    } else if (originalTitle !== null) {
      document.title = originalTitle;
      originalTitle = null;
    }
    if (config.disableFavicons === "true" && document.head) {
      for (const link of document.querySelectorAll("link[rel]")) {
        if (
          link !== blankIcon &&
          /(?:^|\s)(?:icon|apple-touch-icon)(?:\s|$)/i.test(link.rel)
        ) {
          icons.set(link, link.rel);
          link.removeAttribute("rel");
        }
      }
      if (!blankIcon?.isConnected) {
        blankIcon = document.createElement("link");
        blankIcon.rel = "icon";
        blankIcon.href =
          'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg"/>';
        document.head.append(blankIcon);
      }
    } else restoreIcons();
  }
  function restoreIcons() {
    blankIcon?.remove();
    blankIcon = null;
    for (const [link, rel] of icons)
      if (link.isConnected && !link.hasAttribute("rel")) link.rel = rel;
    icons.clear();
  }
  function refresh() {
    scheduled = false;
    if (!active) return;
    if (
      document.documentElement &&
      !document.documentElement.hasAttribute("data-dp-cloaked")
    )
      document.documentElement.setAttribute("data-dp-cloaked", "");
    walk(document);
    metadata();
  }
  function schedule() {
    if (!scheduled && active) {
      scheduled = true;
      setTimeout(refresh, 80);
    }
  }
  function remove() {
    observer.disconnect();
    document.documentElement?.removeAttribute("data-dp-cloaked");
    for (const [root, style] of styles) {
      style.remove();
      for (const image of root.querySelectorAll("img." + visible))
        image.classList.remove(visible);
    }
    styles.clear();
    roots.clear();
    roots.add(document);
    restoreIcons();
    if (originalTitle !== null) {
      document.title = originalTitle;
      originalTitle = null;
    }
  }
  function apply(payload) {
    remove();
    config = payload.settings;
    active = Boolean(payload.enabled);
    paranoid = Boolean(payload.paranoid);
    if (active) {
      document.documentElement?.setAttribute("data-dp-cloaked", "");
      observe(document);
      refresh();
    }
    extension.runtime
      .sendMessage({ type: "sync-style", documentKey })
      .catch(() => {});
  }
  extension.runtime.onMessage.addListener((payload) => {
    if (payload.type === "apply") apply(payload);
  });
  window.addEventListener("resize", schedule);
  document.addEventListener("load", schedule, true);
  // Shadow roots attached to existing elements are not mutation events. Discover them during normal UI interaction.
  document.addEventListener("pointerover", schedule, true);
  document.addEventListener(
    "keydown",
    (event) => {
      if (
        config.enableToggle !== "true" ||
        event.defaultPrevented ||
        event.isComposing
      )
        return;
      const target = event.composedPath()[0];
      if (
        target?.isContentEditable ||
        ["INPUT", "TEXTAREA", "SELECT"].includes(target?.tagName)
      )
        return;
      let type;
      if (DPSettings.shortcut(event, config.paranoidhotkey)) type = "paranoid";
      else if (DPSettings.shortcut(event, config.hotkey)) type = "toggle";
      if (type) {
        event.preventDefault();
        event.stopPropagation();
        extension.runtime.sendMessage({ type }).catch(() => {});
      }
    },
    true,
  );
  function sync() {
    extension.runtime
      .sendMessage({ type: "get-state" })
      .then((payload) => {
        if (!payload.error) apply(payload);
      })
      .catch(() => {});
  }
  window.addEventListener("pageshow", (event) => {
    if (event.persisted) sync();
  });
  sync();
})();
