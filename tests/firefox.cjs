"use strict";
// Run the actual Firefox extension in a disposable copy/profile. Test probes never ship.
const { spawn, execFileSync } = require("node:child_process");
const fs = require("node:fs"),
  os = require("node:os"),
  path = require("node:path"),
  http = require("node:http");
const binary =
  process.env.FIREFOX_BINARY ||
  "/Applications/Firefox.app/Contents/MacOS/firefox";
(async () => {
  execFileSync(process.execPath, ["scripts/build.cjs"]);
  const image = fs.readFileSync("img/icon128.png");
  const reports = {};
  let resolveReports, rejectReports;
  const done = new Promise((resolve, reject) => {
    resolveReports = resolve;
    rejectReports = reject;
  });
  const server = http.createServer((req, res) => {
    if (req.url.startsWith("/report")) {
      let body = "";
      req.on("data", (chunk) => (body += chunk));
      req.on("end", () => {
        const report = JSON.parse(body);
        reports[report.kind] = report;
        res.end("ok");
        console.log("Firefox", report);
        if (report.error) rejectReports(new Error(report.error));
        else if (reports.background && reports.options) resolveReports();
      });
    } else if (req.url === "/image.png") {
      res.writeHead(200, { "Content-Type": "image/png" });
      res.end(image);
    } else {
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(
        '<!doctype html><html><head><title>Firefox fixture</title></head><body><h1>Firefox fixture</h1><p>Scoped text</p><img id="important" src="/image.png" style="opacity:1!important;display:block!important;width:128px;height:128px"></body></html>',
      );
    }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const url = "http://127.0.0.1:" + server.address().port;
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "dp-firefox-test-"));
  fs.cpSync("dist/firefox", directory, { recursive: true });
  const backgroundProbe = async function (fixtureURL) {
    let error, stage, permissions;
    try {
      await queue;
      permissions = await browser.permissions.getAll();
      let config = await settings();
      await browser.storage.local.set({
        settings: { ...config, newPages: "Uncloak" },
      });
      const tab = await browser.tabs.create({ url: fixtureURL });
      async function state() {
        const result = await browser.scripting.executeScript({
          target: { tabId: tab.id },
          func: () => {
            const image = document.querySelector("#important");
            return image
              ? {
                  opacity: getComputedStyle(image).opacity,
                  display: getComputedStyle(image).display,
                  background: getComputedStyle(document.documentElement)
                    .backgroundColor,
                  heading: getComputedStyle(document.querySelector("h1")).color,
                  paragraph: getComputedStyle(document.querySelector("p"))
                    .color,
                }
              : null;
          },
        });
        return result[0].result;
      }
      async function wait(name, test) {
        stage = name;
        let last, lastError;
        for (let i = 0; i < 100; i++) {
          try {
            last = await state();
            if (last && test(last)) return;
          } catch (failure) {
            lastError = failure.stack || String(failure);
          }
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
        throw Error(
          name +
            " timed out: " +
            JSON.stringify({ last, lastError, permissions }),
        );
      }
      await wait("Original page", (value) => value.opacity === "1");
      const original = await state();
      await serialized(() => toggle(tab));
      await wait("USER CSS cloak", (value) => value.opacity === "0.05");
      await serialized(() => toggle(tab, true));
      await wait("Paranoid", (value) => value.display === "none");
      await serialized(() => toggle(tab, true));
      await wait(
        "Paranoid restoration",
        (value) => value.opacity === "0.05" && value.display !== "none",
      );
      config = await settings();
      await serialized(async () => {
        await browser.storage.local.set({
          settings: {
            ...config,
            customcss:
              "html { background: rgb(12, 34, 56) !important; } h1 { color: rgb(23, 45, 67) !important; } @media screen { html body p { color: rgb(34, 56, 78) !important; } }",
          },
        });
        await updateAll();
      });
      await wait(
        "Scoped custom root/descendant CSS",
        (value) =>
          value.background === "rgb(12, 34, 56)" &&
          value.heading === "rgb(23, 45, 67)" &&
          value.paragraph === "rgb(34, 56, 78)",
      );
      await serialized(() => toggle(tab));
      await wait(
        "Uncloak custom CSS restoration",
        (value) =>
          value.opacity === "1" &&
          value.background === original.background &&
          value.heading === original.heading &&
          value.paragraph === original.paragraph,
      );
      await serialized(() => toggle(tab));
      await wait(
        "Recloak custom CSS",
        (value) =>
          value.opacity === "0.05" && value.background === "rgb(12, 34, 56)",
      );
      await serialized(() => changeDomain("127.0.0.1", "whitelist"));
      await wait("Whitelist", (value) => value.opacity === "1");
      await browser.tabs.create({
        url: browser.runtime.getURL("options.html?smoke"),
      });
    } catch (failure) {
      error = failure.stack;
    }
    await fetch(fixtureURL + "/report", {
      method: "POST",
      body: JSON.stringify({
        kind: "background",
        error: error || null,
        stage,
        permissions,
        version: navigator.userAgent,
      }),
    });
  };
  const optionsProbe = async function (fixtureURL) {
    let error;
    try {
      for (let i = 0; i < 100 && !current; i++)
        await new Promise((resolve) => setTimeout(resolve, 50));
      if (!current) throw Error("Options failed to load");
      const result = await request({
        type: "save-settings",
        patch: { opacity1: "0.33", font: "Calibri" },
      });
      if (result.settings.opacity1 !== "0.33")
        throw Error("Options save failed");
      render(result.settings);
      document.querySelector("#showUnderline").click();
      await saving;
      if (
        (await request({ type: "get-settings" })).settings.showUnderline !==
        "false"
      )
        throw Error("Fractional settings blocked unrelated checkbox save");
    } catch (failure) {
      error = failure.stack;
    }
    await fetch(fixtureURL + "/report", {
      method: "POST",
      body: JSON.stringify({ kind: "options", error: error || null }),
    });
  };
  fs.appendFileSync(
    path.join(directory, "js/background.js"),
    "\n(" + backgroundProbe.toString() + ")(" + JSON.stringify(url) + ");",
  );
  fs.appendFileSync(
    path.join(directory, "js/options.js"),
    "\nif(location.search==='?smoke') (" +
      optionsProbe.toString() +
      ")(" +
      JSON.stringify(url) +
      ");",
  );
  const child = spawn(
    process.execPath,
    [
      "node_modules/web-ext/bin/web-ext.js",
      "run",
      "--source-dir",
      directory,
      "--firefox",
      binary,
      ...(process.env.DP_FIREFOX_HEADED === "1" ? [] : ["--args=-headless"]),
      "--no-input",
      "--no-reload",
      "--no-config-discovery",
      "--verbose",
    ],
    { cwd: process.cwd(), detached: true, stdio: ["ignore", "pipe", "pipe"] },
  );
  console.log(
    "Firefox launch mode:",
    process.env.DP_FIREFOX_HEADED === "1" ? "headed" : "headless",
    "binary:",
    binary,
  );
  let output = "";
  child.stdout.on("data", (chunk) => {
    output += chunk;
    if (process.env.DP_FIREFOX_VERBOSE) process.stdout.write(chunk);
  });
  child.stderr.on("data", (chunk) => {
    output += chunk;
    if (process.env.DP_FIREFOX_VERBOSE) process.stderr.write(chunk);
  });
  child.once("error", rejectReports);
  child.once("exit", (code, signal) => {
    if (code !== 0)
      rejectReports(
        new Error(
          "Firefox runner exited " +
            code +
            " " +
            signal +
            "\n" +
            output.slice(0, 3500) +
            "\n" +
            output.slice(-2500),
        ),
      );
  });
  let timeout;
  try {
    await Promise.race([
      done,
      new Promise((_, reject) => {
        timeout = setTimeout(
          () =>
            reject(
              Error(
                "Firefox runtime timeout\n" +
                  output.slice(0, 3500) +
                  "\n" +
                  output.slice(-2500),
              ),
            ),
          45000,
        );
      }),
    ]);
    for (const report of Object.values(reports))
      if (report.error) throw Error(report.error);
    console.log(
      "PASS actual Firefox extension background, USER CSS/custom scoped root restoration, Paranoid restore, whitelist and options/fractional save.",
    );
  } finally {
    clearTimeout(timeout);
    if (process.env.DP_FIREFOX_LOG)
      fs.writeFileSync(process.env.DP_FIREFOX_LOG, output);
    try {
      process.kill(-child.pid, "SIGTERM");
    } catch {}
    server.close();
    fs.rmSync(directory, { recursive: true, force: true });
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
