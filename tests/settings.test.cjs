"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const settings = require("../js/settings.js");
const style = require("../js/style.js");
test("domain matching is anchored and whitelist wins", () => {
  assert.equal(settings.matches("example.com.evil.com", "example.com"), false);
  assert.equal(settings.matches("www.example.com", "example.com"), true);
  assert.equal(settings.matches("a.example.com", "*.example.com"), true);
  assert.equal(settings.matches("example.com", "*.example.com"), false);
  assert.equal(settings.matches("aa.example.com", "?.example.com"), false);
  const config = settings.validate({
    whiteList: ["*.example.com"],
    blackList: ["a.example.com"],
  });
  assert.equal(settings.enabled(config, "https://a.example.com", true), false);
});
test("manual uncloak wins default Cloak and disabled blacklists remain cloaked", () => {
  const config = settings.validate({ newPages: "Cloak", enable: "true" });
  assert.equal(settings.enabled(config, "https://example.com", false), false);
  assert.equal(
    settings.enabled(config, "https://example.com", undefined),
    true,
  );
  assert.equal(
    settings.enabled(
      { ...config, enable: "false", blackList: ["example.com"] },
      "https://example.com",
      false,
    ),
    true,
  );
  assert.equal(settings.enabled(config, "chrome://settings", true), false);
});
test("import is atomic, preserves pipes and empty lists, rejects invalid values", () => {
  const config = settings.importSettings(
    'whiteList|[]\nblackList|[]\npageTitleText|a|b\ncustomcss|div::before {content:"a|b";}',
  );
  assert.equal(config.pageTitleText, "a|b");
  assert.match(config.customcss, /a\|b/);
  assert.deepEqual(config.whiteList, []);
  for (const input of [
    "null",
    "[]",
    '{"s_bg":"12345"}',
    '{"opacity1":"NaN"}',
    '{"whiteList":["<script>"]}',
    '{"unknown":1}',
  ])
    assert.throws(() => settings.importSettings(input));
  assert.deepEqual(settings.importSettings(JSON.stringify(config)), config);
});
test("legacy emergency export restores configured mode", () => {
  assert.equal(
    settings.validate({ sfwmode: "Paranoid", savedsfwmode: "SFW2" }).sfwmode,
    "SFW2",
  );
  assert.equal(settings.validate({ sfwmode: "Paranoid" }).sfwmode, "Paranoid");
});
test("generic fonts and all media modes generate valid selectors", () => {
  const css = style.css(
    settings.validate({ font: "Monospace", sfwmode: "SFW2" }),
  );
  assert.match(css, /font-family:monospace!important/);
  assert.match(css, /iframe\{opacity/);
  assert.match(
    style.css(settings.defaults, true),
    /iframe\{display:none!important/,
  );
});
test("shortcuts ignore repeats and exact modifiers matter", () => {
  const event = {
    key: "F12",
    ctrlKey: true,
    metaKey: false,
    altKey: false,
    shiftKey: false,
    repeat: false,
  };
  assert.equal(settings.shortcut(event, "CTRL F12"), true);
  assert.equal(
    settings.shortcut({ ...event, shiftKey: true }, "CTRL F12"),
    false,
  );
  assert.equal(
    settings.shortcut({ ...event, repeat: true }, "CTRL F12"),
    false,
  );
});

test("legacy shortcut punctuation and aliases survive validation", () => {
  const config = settings.validate(
    { hotkey: "CTRL +", paranoidhotkey: "alt up" },
    true,
  );
  assert.equal(config.hotkey, "CTRL PLUS");
  assert.equal(config.paranoidhotkey, "ALT ARROWUP");
  assert.equal(
    settings.shortcut(
      {
        key: "F12",
        metaKey: true,
        ctrlKey: false,
        altKey: false,
        shiftKey: false,
        repeat: false,
      },
      "CTRL F12",
    ),
    true,
  );
});

test("scoped USER sheets isolate exact generations and preserve custom rules", () => {
  const config = settings.validate({ customcss: "h1{color:red!important}" }),
    next = { ...config, sfwmode: "Paranoid" };
  assert.notEqual(style.signature(config), style.signature(next));
  assert.match(style.css(config, false, true), /^@scope/);
  assert.match(style.css(config, false, true), /h1\{color:red!important\}/);
});
