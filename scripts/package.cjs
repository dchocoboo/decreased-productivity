"use strict";
const { execFileSync } = require("node:child_process");
execFileSync(process.execPath, ["scripts/build.cjs"], { stdio: "inherit" });
for (const browser of ["chromium", "firefox"]) {
  execFileSync(
    process.execPath,
    [
      "node_modules/web-ext/bin/web-ext.js",
      "build",
      "--source-dir",
      "dist/" + browser,
      "--artifacts-dir",
      "dist",
      "--filename",
      "decreased-productivity-" + browser + ".zip",
      "--overwrite-dest",
      "--no-config-discovery",
    ],
    { stdio: "inherit" },
  );
}
