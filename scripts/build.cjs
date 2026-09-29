"use strict";
const fs = require("node:fs");
const path = require("node:path");
const manifest = JSON.parse(fs.readFileSync("manifest.json"));
for (const browser of ["chromium", "firefox"]) {
  const output = path.join("dist", browser);
  fs.rmSync(output, { recursive: true, force: true });
  fs.mkdirSync(output, { recursive: true });
  for (const name of [
    "js",
    "css",
    "img",
    "_locales",
    "options.html",
    "updated.html",
    "migration.html",
  ])
    fs.cpSync(name, path.join(output, name), { recursive: true });
  const target = structuredClone(manifest);
  if (browser === "firefox") {
    delete target.minimum_chrome_version;
    target.background = {
      scripts: ["js/settings.js", "js/style.js", "js/background.js"],
    };
    target.permissions = target.permissions.filter(
      (name) => name !== "offscreen",
    );
    target.browser_specific_settings = {
      gecko: {
        id: "decreased-productivity@dchocoboo.github.io",
        strict_min_version: "146.0",
        data_collection_permissions: { required: ["none"] },
      },
    };
  }
  fs.writeFileSync(
    path.join(output, "manifest.json"),
    JSON.stringify(target, null, 2) + "\n",
  );
  console.log("Built " + output);
}
