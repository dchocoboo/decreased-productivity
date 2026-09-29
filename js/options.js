"use strict";
const extension = globalThis.browser || chrome;
let current;
let saving = Promise.resolve();
const form = document.getElementById("settings-form");
const message = document.getElementById("message");
function notify(text, error = false) {
  message.textContent = text;
  message.classList.toggle("error", error);
}
async function request(payload) {
  const result = await extension.runtime.sendMessage(payload);
  if (result.error) throw new Error(result.error);
  return result;
}
function enqueue(task) {
  saving = saving.then(task).catch((error) => notify(error.message, true));
  return saving;
}
function read() {
  const patch = {};
  for (const key of Object.keys(DPSettings.defaults)) {
    const element = document.getElementById(key);
    if (element && !key.endsWith("List"))
      patch[key] =
        element.type === "checkbox" ? String(element.checked) : element.value;
  }
  return patch;
}
function render(config, loadFields = true) {
  current = config;
  if (loadFields)
    for (const [key, value] of Object.entries(config)) {
      const element = document.getElementById(key);
      if (element && !key.endsWith("List")) {
        if (element.type === "checkbox") element.checked = value === "true";
        else element.value = value;
      }
    }
  for (const key of ["whiteList", "blackList"]) {
    const list = document.getElementById(key);
    list.replaceChildren();
    if (!config[key].length) {
      const empty = document.createElement("li");
      empty.textContent = extension.i18n.getMessage("empty");
      list.append(empty);
    }
    for (const domain of config[key]) {
      const item = document.createElement("li"),
        name = document.createElement("span"),
        remove = document.createElement("button");
      name.textContent = domain;
      remove.textContent = "Remove";
      remove.type = "button";
      remove.setAttribute("aria-label", "Remove " + domain);
      remove.addEventListener("click", () =>
        enqueue(async () => {
          render(
            (await request({ type: "domain", domain, action: "remove" }))
              .settings,
            false,
          );
          notify("Domain removed.");
        }),
      );
      item.append(name, remove);
      list.append(item);
    }
  }
  document.getElementById("settingsexport").value = JSON.stringify(
    config,
    null,
    2,
  );
  preview();
}
function preview() {
  const draft = DPSettings.validate({ ...current, ...read() }),
    node = document.getElementById("preview");
  node.style.backgroundColor = "#" + draft.s_bg;
  node.style.color = "#" + draft.s_text;
  node.style.borderColor = "#" + draft.s_table;
  node.style.fontSize = draft.fontsize + "px";
  node.style.fontFamily =
    draft.font === "-Custom-"
      ? draft.customfont
      : draft.font === "-Unchanged-"
        ? "system-ui"
        : draft.font;
  node.querySelector("a").style.color = "#" + draft.s_link;
  node.querySelector("a").style.textDecoration =
    draft.showUnderline === "true" ? "underline" : "none";
  node.querySelector("h3").style.fontWeight =
    draft.removeBold === "true" ? "normal" : "bold";
  const image = node.querySelector("img");
  image.style.opacity = draft.sfwmode === "NSFW" ? "1" : draft.opacity1;
  image.style.visibility = draft.sfwmode === "Paranoid" ? "hidden" : "visible";
  image.onmouseenter = () => {
    image.style.opacity = draft.sfwmode === "NSFW" ? "1" : draft.opacity2;
  };
  image.onmouseleave = () => {
    image.style.opacity = draft.sfwmode === "NSFW" ? "1" : draft.opacity1;
  };
}
function save(patch) {
  return enqueue(async () => {
    if (!form.reportValidity()) return;
    DPSettings.validate({ ...current, ...patch }, true);
    render((await request({ type: "save-settings", patch })).settings, false);
    notify(extension.i18n.getMessage("saved"));
  });
}
form.addEventListener("submit", (event) => {
  event.preventDefault();
  save(read());
});
form.addEventListener("change", (event) => {
  const key = event.target.id;
  if (Object.hasOwn(DPSettings.defaults, key))
    save({
      [key]:
        event.target.type === "checkbox"
          ? String(event.target.checked)
          : event.target.value,
    });
});
form.addEventListener("input", preview);
for (const button of document.querySelectorAll("[data-domain]"))
  button.addEventListener("click", () => {
    const domain = document.getElementById("domain").value;
    enqueue(async () => {
      render(
        (
          await request({
            type: "domain",
            domain,
            action: button.dataset.domain,
          })
        ).settings,
        false,
      );
      document.getElementById("domain").value = "";
      notify("Domain list saved.");
    });
  });
for (const button of document.querySelectorAll("[data-clear]"))
  button.addEventListener("click", () => {
    if (confirm("Clear this domain list?"))
      save({ [button.dataset.clear]: [] });
  });
for (const button of document.querySelectorAll("[data-record]"))
  button.addEventListener("click", () => {
    const input = document.getElementById(button.dataset.record);
    input.focus();
    notify("Press the shortcut to record. Escape cancels.");
    function record(event) {
      event.preventDefault();
      event.stopPropagation();
      if (["Control", "Meta", "Alt", "Shift"].includes(event.key)) return;
      input.removeEventListener("keydown", record);
      if (event.key === "Escape") {
        notify("Recording cancelled.");
        return;
      }
      input.value = [
        event.ctrlKey && "CTRL",
        event.metaKey && "CMD",
        event.altKey && "ALT",
        event.shiftKey && "SHIFT",
        event.key === " " ? "SPACE" : event.key.toUpperCase(),
      ]
        .filter(Boolean)
        .join(" ");
      save({ [input.id]: input.value });
    }
    input.addEventListener("keydown", record);
  });
document.getElementById("importsettings").addEventListener("click", () =>
  enqueue(async () => {
    const parsed = DPSettings.importSettings(
      document.getElementById("settingsimport").value,
      current,
    );
    render((await request({ type: "save-settings", patch: parsed })).settings);
    document.getElementById("settingsimport").value = "";
    notify(extension.i18n.getMessage("importsuccessoptions"));
  }),
);
document.getElementById("savetxt").addEventListener("click", () => {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(current, null, 2)], { type: "application/json" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download =
    "dp-settings-" + new Date().toISOString().slice(0, 10) + ".json";
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});
document
  .getElementById("close")
  .addEventListener("click", () => window.close());
document.getElementById("preset").addEventListener("change", (event) => {
  const presets = {
    "white-blue": ["FFFFFF", "000000", "000099", "cccccc"],
    "white-gray": ["FFFFFF", "AAAAAA", "AAAAAA", "AAAAAA"],
    "white-green": ["FFFFFF", "000000", "008000", "cccccc"],
    "gray-blue": ["EEEEEE", "000000", "000099", "cccccc"],
    "red-blue": ["FFEEE3", "555555", "7F75AA", "cccccc"],
    brown: ["2c2c2c", "e5e9a8", "5cb0cc", "7f7f7f"],
    "black-blue": ["000000", "FFFFFF", "3366FF", "333333"],
    "black-green": ["000000", "FFFFFF", "00FF00", "333333"],
    "black-red": ["000000", "FFFFFF", "FF0000", "333333"],
    "black-pink": ["000000", "FFFFFF", "FF1CAE", "333333"],
  };
  if (!presets[event.target.value]) return;
  const patch = Object.fromEntries(
    ["s_bg", "s_text", "s_link", "s_table"].map((key, index) => [
      key,
      presets[event.target.value][index],
    ]),
  );
  for (const [key, value] of Object.entries(patch))
    document.getElementById(key).value = value;
  preview();
  save(patch);
});
for (const element of document.querySelectorAll("[data-i18n]")) {
  const text = extension.i18n.getMessage(element.dataset.i18n);
  if (text) element.textContent = text;
}
request({ type: "get-settings" })
  .then((result) => {
    render(result.settings);
    notify("Settings loaded. Changes save automatically.");
  })
  .catch((error) => notify(error.message, true));
