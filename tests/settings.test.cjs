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

test("gated USER sheets isolate exact generations and preserve custom specificity", () => {
  const config = settings.validate({ customcss: "h1{color:red!important}" }),
    next = { ...config, sfwmode: "Paranoid" };
  assert.notEqual(style.signature(config), style.signature(next));
  assert.doesNotMatch(style.css(config, false, true), /@scope/);
  assert.match(
    style.css(config, false, true),
    /h1:where\(:root\[data-dp-cloaked=/,
  );
  assert.match(style.css(config, false, true), /\{color:red!important\}/);
});

test("parsed gates preserve root ancestry, lists, functional commas and pseudo-elements", () => {
  const output = style.gatedCSS(
    'html body p::before,:root > body,:is(html,[data-x="a,b"]):before { content:"test"; } @media screen { p::selection { color:red!important } } @supports(display:grid) { h1 { &::after { content:"nested" } } }',
    "abc",
  );
  assert.match(output, /html body p:where\([^{}]+\)::before/);
  assert.match(output, /:root>body:where\(/);
  assert.match(output, /:is\(html,\[data-x="a,b"\]\):where\([^{}]+\):before/);
  assert.match(output, /p:where\([^{}]+\)::selection/);
  assert.match(output, /&:where\([^{}]+\)::after/);
});
test("USER copy excludes global definitions and skips raw invalid selectors", () => {
  const config = settings.validate({
    customcss:
      '@font-face{font-family:Demo;src:local(Arial)} @keyframes spin{to{opacity:0}} @property --demo{syntax:"<color>";inherits:false;initial-value:red} @layer priority; @layer priority { h1{color:red!important} } ???{color:blue!important}',
  });
  const output = style.css(config, false, true);
  assert.doesNotMatch(output, /@font-face|@keyframes|@property|\?\?\?/);
  assert.match(output, /@layer priority;/);
  assert.match(output, /@layer priority\{h1:where/);
  assert.match(style.css(config), /@font-face/);
  assert.match(output, /opacity:0.05!important/);
});
