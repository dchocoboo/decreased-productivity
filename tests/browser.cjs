"use strict";
const { chromium } = require("playwright");
const http = require("node:http");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const image = fs.readFileSync("img/icon128.png");
const fixture = `<!doctype html><html><head><title>Original title</title><link rel="icon" href="/image.png"><style>body{background:rgb(200,50,50)}img{width:128px;height:128px}#important{opacity:1!important;display:block!important}a{color:red!important}</style></head><body><h1>Modern page fixture</h1><p>Readable text <a href="/next">link</a></p><img id="image" src="/image.png"><img id="important" src="/image.png" style="opacity:1!important;display:block!important"><img id="small" src="/image.png" style="width:24px;height:24px"><video></video><div id="host"></div><input id="editor"><iframe src="http://localhost:PORT/frame"></iframe><script>document.querySelector('#host').attachShadow({mode:'open'}).innerHTML='<p>Shadow content</p><img src="/image.png">';</script></body></html>`;
(async () => {
  execFileSync(process.execPath, ["scripts/build.cjs"]);
  const server = http.createServer((request, response) => {
    if (request.url === "/image.png") {
      response.writeHead(200, { "Content-Type": "image/png" });
      response.end(image);
    } else {
      response.writeHead(200, { "Content-Type": "text/html" });
      response.end(
        fixture
          .replace("PORT", server.address().port)
          .replace(
            /<iframe.*?<\/iframe>/,
            request.url === "/frame" ? "" : "$&",
          ),
      );
    }
  });
  await new Promise((resolve) => server.listen(0, "0.0.0.0", resolve));
  const url = "http://127.0.0.1:" + server.address().port;
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "dp-chromium-"));
  const evidence =
    process.env.DP_EVIDENCE_DIR ||
    "/private/tmp/decreased-productivity-evidence";
  fs.mkdirSync(evidence, { recursive: true });
  const extensionPath = path.resolve("dist/chromium");
  let context;
  try {
    context = await chromium.launchPersistentContext(profile, {
      channel: "chromium",
      headless: true,
      args: [
        "--disable-extensions-except=" + extensionPath,
        "--load-extension=" + extensionPath,
        "--host-resolver-rules=MAP dp.test 127.0.0.1",
        "--no-proxy-server",
      ],
      viewport: { width: 1280, height: 900 },
    });
    context.setDefaultTimeout(10000);
    let worker =
      context.serviceWorkers()[0] ||
      (await context.waitForEvent("serviceworker"));
    const errors = [];
    worker.on("console", (msg) => {
      if (msg.type() === "error") errors.push(msg.text());
    });
    const id = new URL(worker.url()).host;
    console.log("Browser:", context.browser().version(), "Extension:", id);
    const options = await context.newPage();
    options.on("pageerror", (error) => errors.push(error.message));
    await options.goto("chrome-extension://" + id + "/options.html");
    await options.getByText("Settings loaded.", { exact: false }).waitFor();
    assert.match(await options.title(), /Productivity/);
    await options.screenshot({
      path: path.join(evidence, "options-desktop.png"),
      fullPage: false,
    });
    async function patch(patch) {
      await options.evaluate(async (patch) => {
        const result = await request({ type: "save-settings", patch });
        if (result.error) throw new Error(result.error);
        render(result.settings);
      }, patch);
    }
    const page = await context.newPage();
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(url);
    const opacity = () =>
      page.locator("#important").evaluate((el) => getComputedStyle(el).opacity);
    console.log("Initial page loaded");
    assert.equal(await opacity(), "1");
    // Exercise real settings controls and background authorization, then toolbar-equivalent toggle.
    await options.locator("#newPages").selectOption("Cloak");
    await options.getByText("Settings saved.", { exact: true }).waitFor();
    assert.equal(
      await opacity(),
      "1",
      "existing uncloaked tabs stay uncloaked when new-tab default changes",
    );
    console.log("Options saved, invoking toggle");
    await worker.evaluate(async (url) => {
      const [tab] = await chrome.tabs.query({ url: url + "/*" });
      await serialized(() => toggle(tab));
    }, url);
    await page.waitForFunction(
      () =>
        getComputedStyle(document.querySelector("#important")).opacity ===
        "0.05",
    );
    assert.equal(
      await page
        .locator("a")
        .first()
        .evaluate((el) => getComputedStyle(el).color),
      "rgb(0, 0, 153)",
    );
    await page.locator("#image").hover();
    await page.waitForFunction(
      () =>
        getComputedStyle(document.querySelector("#image")).opacity === "0.5",
    );
    await page.mouse.move(0, 0);
    await patch({
      maxwidth: "32",
      maxheight: "32",
      hidePageTitles: "true",
      pageTitleText: 'Safe "title" | <text>',
      disableFavicons: "true",
    });
    await page.waitForFunction(
      () => document.title === 'Safe "title" | <text>',
    );
    await page.waitForFunction(
      () => getComputedStyle(document.querySelector("#small")).opacity === "1",
    );
    await page.evaluate(() => {
      document.title = "Dynamic title";
      const img = document.createElement("img");
      img.id = "dynamic";
      img.src = "/image.png";
      document.body.append(img);
    });
    await page.waitForFunction(
      () => document.title === 'Safe "title" | <text>',
    );
    assert.equal(
      await page
        .locator("#dynamic")
        .evaluate((el) => getComputedStyle(el).opacity),
      "0.05",
    );
    await page.waitForFunction(() =>
      document.querySelector("#host").shadowRoot.querySelector("style"),
    );
    assert.equal(
      await page
        .locator("#host img")
        .evaluate((el) => getComputedStyle(el).opacity),
      "0.05",
    );
    const frame = page.frames().find((frame) => frame.url().includes("/frame"));
    await frame.waitForFunction(
      () =>
        getComputedStyle(document.querySelector("#important")).opacity ===
        "0.05",
    );
    await page.keyboard.press("Alt+p");
    await page.waitForFunction(
      () =>
        getComputedStyle(document.querySelector("#important")).display ===
        "none",
    );
    await page.keyboard.press("Alt+p");
    await page.waitForFunction(
      () =>
        getComputedStyle(document.querySelector("#important")).opacity ===
        "0.05",
    );
    // Exact media mode behavior and user-origin cascade over author inline !important.
    for (const [mode, display, mediaOpacity] of [
      ["SFW1", "none", null],
      ["SFW2", "visible", "1"],
      ["NSFW", "visible", "1"],
    ]) {
      await patch({ sfwmode: mode });
      await page.waitForFunction(
        ({ display, mediaOpacity }) => {
          const media = getComputedStyle(document.querySelector("video"));
          return (
            (display === "visible"
              ? media.display !== "none"
              : media.display === display) &&
            (!mediaOpacity || media.opacity === mediaOpacity)
          );
        },
        { display, mediaOpacity },
      );
    }
    await patch({ sfwmode: "SFW" });
    await patch({ whiteList: ["127.0.0.1"], blackList: [] });
    await page.waitForFunction(
      () =>
        getComputedStyle(document.querySelector("#important")).opacity === "1",
    );
    assert.equal(await page.title(), "Dynamic title");
    assert.equal(
      await page.locator('link[rel="icon"]').getAttribute("href"),
      "/image.png",
    );
    await patch({ whiteList: [], blackList: ["127.0.0.1"], enable: "false" });
    await page.waitForFunction(
      () =>
        getComputedStyle(document.querySelector("#important")).opacity ===
        "0.05",
    );
    await patch({
      enable: "true",
      blackList: [],
      hidePageTitles: "false",
      disableFavicons: "false",
    });
    // Persist explicit uncloak across navigation even when new tabs default to Cloak.
    await page.keyboard.press("Control+F12");
    await page.waitForFunction(
      () =>
        getComputedStyle(document.querySelector("#important")).opacity === "1",
    );
    await page.goto(url + "/next");
    assert.equal(await opacity(), "1");
    const created = await context.newPage();
    await created.goto(url + "/default");
    await created.waitForFunction(
      () =>
        getComputedStyle(document.querySelector("#important")).opacity ===
        "0.05",
    );
    await patch({ newPages: "Uncloak" });
    assert.equal(
      await created
        .locator("#important")
        .evaluate((el) => getComputedStyle(el).opacity),
      "0.05",
    );
    const future = await context.newPage();
    await future.goto(url + "/future");
    assert.equal(
      await future
        .locator("#important")
        .evaluate((el) => getComputedStyle(el).opacity),
      "1",
    );
    // Explicit uncloak survives actual service worker termination and waking.
    const cdp = await context.newCDPSession(options);
    await cdp.send("ServiceWorker.enable");
    let versions = [];
    cdp.on("ServiceWorker.workerVersionUpdated", (event) => {
      versions = event.versions;
    });
    await new Promise((resolve) => setTimeout(resolve, 100));
    const version = versions.find((item) => item.scriptURL === worker.url());
    if (version) {
      await cdp.send("ServiceWorker.stopWorker", {
        versionId: version.versionId,
      });
      await page.reload();
      await page.waitForTimeout(150);
      assert.equal(await opacity(), "1");
      console.log("Worker termination persistence PASS");
    } else throw new Error("Could not obtain worker version for restart test");
    worker =
      context.serviceWorkers()[0] ||
      (await context.waitForEvent("serviceworker"));

    // Fractional imported settings remain valid for unrelated native control saves.
    await patch({ opacity1: "0.33" });
    await options.locator("#showUnderline").uncheck();
    await options.evaluate(() => saving);
    await options.getByText("Settings saved.", { exact: true }).waitFor();
    assert.equal(
      await options.evaluate(
        async () =>
          (await request({ type: "get-settings" })).settings.showUnderline,
      ),
      "false",
    );
    await patch({ opacity1: "0.05", showUnderline: "true" });
    // Global mode and emergency restore apply to every tab, then normal toggle uncloaks all.
    await patch({ global: "true", enable: "true" });
    await page.waitForFunction(
      () =>
        getComputedStyle(document.querySelector("#important")).opacity ===
        "0.05",
    );
    await page.keyboard.press("Alt+p");
    await future.waitForFunction(
      () =>
        getComputedStyle(document.querySelector("#important")).display ===
        "none",
    );
    await page.keyboard.press("Alt+p");
    await future.waitForFunction(
      () =>
        getComputedStyle(document.querySelector("#important")).opacity ===
        "0.05",
    );
    await page.keyboard.press("Control+F12");
    await future.waitForFunction(
      () =>
        getComputedStyle(document.querySelector("#important")).opacity === "1",
    );
    await patch({
      global: "false",
      enable: "true",
      enableStickiness: "true",
      newPages: "Uncloak",
    });
    await worker.evaluate(async (url) => {
      const [tab] = await chrome.tabs.query({ url: url + "/next" });
      await serialized(() => toggle(tab));
    }, url);
    const stickyId = await worker.evaluate(async (url) => {
      const [opener] = await chrome.tabs.query({ url: url + "/next" });
      const child = await chrome.tabs.create({
        url: url + "/sticky",
        openerTabId: opener.id,
      });
      return child.id;
    }, url);
    await new Promise((resolve) => setTimeout(resolve, 200));
    const sticky = context
      .pages()
      .find((item) => item.url() === url + "/sticky");
    await sticky.waitForFunction(
      () =>
        getComputedStyle(document.querySelector("#important")).opacity ===
        "0.05",
    );
    // The safe-open production handler stores state before navigation and redirects retain it.
    const safeId = await worker.evaluate(async (url) => {
      const [opener] = await chrome.tabs.query({ url: url + "/next" });
      const tab = await serialized(() =>
        safeOpen({ linkUrl: url + "/safe" }, opener),
      );
      return tab.id;
    }, url);
    await new Promise((resolve) => setTimeout(resolve, 200));
    const safe = context.pages().find((item) => item.url() === url + "/safe");
    await safe.waitForFunction(
      () =>
        getComputedStyle(document.querySelector("#important")).opacity ===
        "0.05",
    );
    await safe.goto(url + "/safe-redirect");
    await safe.waitForFunction(
      () =>
        getComputedStyle(document.querySelector("#important")).opacity ===
        "0.05",
    );
    await patch({ whiteList: ["127.0.0.1"] });
    await safe.waitForTimeout(150);
    await safe.waitForFunction(
      () =>
        getComputedStyle(document.querySelector("#important")).opacity === "1",
    );
    await patch({ whiteList: [], enableStickiness: "false" });
    // Small images stay exempt when main images collapse, including CSS-defined scaled assets.
    await safe.evaluate(() => {
      const sheet = document.createElement("style");
      sheet.textContent = ".scaled{width:24px;height:24px}";
      document.head.append(sheet);
      const image = document.createElement("img");
      image.src = "/image.png";
      image.id = "scaled";
      image.className = "scaled";
      document.body.append(image);
    });
    await patch({ opacity1: "0", collapseimage: "true" });
    await safe.waitForFunction(
      () =>
        getComputedStyle(document.querySelector("#important")).display ===
          "none" &&
        getComputedStyle(document.querySelector("#scaled")).opacity === "1" &&
        getComputedStyle(document.querySelector("#scaled")).display !== "none",
    );
    await safe.keyboard.press("Alt+p");
    await safe.waitForFunction(
      () =>
        getComputedStyle(document.querySelector("#scaled")).display !== "none",
    );
    await safe.keyboard.press("Alt+p");
    await patch({ opacity1: "0.05", collapseimage: "false" });
    // BFCache/history revisits retain per-document CSS identity and restore original author styling.
    await safe.goto(url + "/history-a");
    await patch({ s_bg: "111111" });
    await safe.goto(url + "/history-b");
    await patch({ s_bg: "222222" });
    await safe.goBack();
    await safe.waitForFunction(
      () =>
        getComputedStyle(document.body).backgroundColor === "rgb(34, 34, 34)",
    );
    await safe.keyboard.press("Control+F12");
    await safe.waitForFunction(
      () =>
        getComputedStyle(document.body).backgroundColor === "rgb(200, 50, 50)",
    );
    await patch({ s_bg: "FFFFFF" });
    // Ordinary insecure HTTP must initialize without secure-context-only randomUUID.
    const insecure = await context.newPage();
    await insecure.goto("http://dp.test:" + server.address().port + "/http");
    assert.equal(await insecure.evaluate(() => isSecureContext), false);
    await insecure.keyboard.press("Control+F12");
    await insecure.waitForFunction(
      () =>
        getComputedStyle(document.querySelector("#important")).opacity ===
        "0.05",
    );
    // Test the actual Chromium offscreen migration routine against extension-origin legacy storage.
    await options.evaluate(() => {
      localStorage.setItem("sfwmode", "SFW2");
      localStorage.setItem("whiteList", '["legacy.example"]');
      localStorage.setItem("pageTitleText", "Legacy | title");
    });
    const migrated = await worker.evaluate(async () => {
      await chrome.storage.local.remove("settings");
      initialization = undefined;
      await initialize();
      return settings();
    });
    assert.equal(migrated.sfwmode, "SFW2");
    assert.deepEqual(migrated.whiteList, ["legacy.example"]);
    assert.equal(migrated.pageTitleText, "Legacy | title");
    await patch({ sfwmode: "SFW", whiteList: [] });
    console.log(
      "Additional global, safe-open, stickiness, collapsed/scaled images, history, insecure HTTP, fractional and offscreen migration checks PASS",
    );
    // Corrupt imports fail without any partial setting mutation.
    await options
      .locator("#settingsimport")
      .fill('{"s_bg":"12345","font":"Calibri"}');
    await options.locator("#importsettings").click();
    await options.locator("#message.error").waitFor();
    assert.equal(await options.locator("#font").inputValue(), "Arial");
    await options.locator("#domain").fill("example.com");
    await options.locator('[data-domain="whitelist"]').click();
    await options.getByRole("button", { name: "Remove example.com" }).waitFor();
    await options.getByRole("button", { name: "Remove example.com" }).click();
    await options
      .getByRole("button", { name: "Remove example.com" })
      .waitFor({ state: "detached" });
    await options.setViewportSize({ width: 390, height: 844 });
    await options.screenshot({
      path: path.join(evidence, "options-mobile.png"),
      fullPage: false,
    });
    assert.equal(
      await options.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      true,
    );
    await created.screenshot({ path: path.join(evidence, "cloaked-page.png") });
    assert.deepEqual(errors, []);
    console.log(
      "PASS real extension settings, toggles, 5 modes, DOM/shadow/iframe, metadata, list precedence, navigation, defaults, worker restart, import and responsive UI.",
    );
  } finally {
    await context?.close();
    server.close();
    fs.rmSync(profile, { recursive: true, force: true });
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
