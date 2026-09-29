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
  const backgroundProbe = `\n(async()=>{let error;try{await queue;let config=await settings();await browser.storage.local.set({settings:{...config,newPages:'Uncloak'}});let tab=await browser.tabs.create({url:${JSON.stringify(url)}});async function state(){const result=await browser.scripting.executeScript({target:{tabId:tab.id},func:()=>{let image=document.querySelector('#important');return image?{opacity:getComputedStyle(image).opacity,display:getComputedStyle(image).display,background:getComputedStyle(document.documentElement).backgroundColor,heading:getComputedStyle(document.querySelector('h1')).color,paragraph:getComputedStyle(document.querySelector('p')).color}:null;}});return result[0].result;}async function wait(test){for(let i=0;i<100;i++){try{const value=await state();if(value&&test(value))return;}catch{}await new Promise(r=>setTimeout(r,100));}throw Error('Firefox DOM assertion timed out');}await wait(s=>s.opacity==='1');const original=await state();await serialized(()=>toggle(tab));await wait(s=>s.opacity==='0.05');await serialized(()=>toggle(tab,true));await wait(s=>s.display==='none');await serialized(()=>toggle(tab,true));await wait(s=>s.opacity==='0.05'&&s.display!=='none');config=await settings();await serialized(async()=>{await browser.storage.local.set({settings:{...config,customcss:'html { background: rgb(12, 34, 56) !important; } h1 { color: rgb(23, 45, 67) !important; } @media screen { html body p { color: rgb(34, 56, 78) !important; } }'}});await updateAll();});await wait(s=>s.background==='rgb(12, 34, 56)'&&s.heading==='rgb(23, 45, 67)'&&s.paragraph==='rgb(34, 56, 78)');await serialized(()=>toggle(tab));await wait(s=>s.opacity==='1'&&s.background===original.background&&s.heading===original.heading&&s.paragraph===original.paragraph);await serialized(()=>toggle(tab));await wait(s=>s.opacity==='0.05'&&s.background==='rgb(12, 34, 56)');await serialized(()=>changeDomain('127.0.0.1','whitelist'));await wait(s=>s.opacity==='1');await browser.tabs.create({url:browser.runtime.getURL('options.html?smoke')});}catch(e){error=e.stack;}await fetch(${JSON.stringify(url + "/report")},{method:'POST',body:JSON.stringify({kind:'background',error:error||null,version:navigator.userAgent})});})();`;
  fs.appendFileSync(path.join(directory, "js/background.js"), backgroundProbe);
  fs.appendFileSync(
    path.join(directory, "js/options.js"),
    `\nif(location.search==='?smoke') (async()=>{let error;try{for(let i=0;i<100&&!current;i++)await new Promise(r=>setTimeout(r,50));if(!current)throw Error('Options failed to load');let result=await request({type:'save-settings',patch:{opacity1:'0.33',font:'Calibri'}});if(result.settings.opacity1!=='0.33')throw Error('Options save failed');render(result.settings);document.querySelector('#showUnderline').click();await saving;if((await request({type:'get-settings'})).settings.showUnderline!=='false')throw Error('Fractional settings blocked unrelated checkbox save');}catch(e){error=e.stack;}await fetch(${JSON.stringify(url + "/report")},{method:'POST',body:JSON.stringify({kind:'options',error:error||null})});})();`,
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
