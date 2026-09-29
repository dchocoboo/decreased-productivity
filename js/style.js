(() => {
  "use strict";
  const visible = "__dp_small_image";
  const parser =
    globalThis.csstree ||
    (typeof require === "function" ? require("css-tree") : null);
  function gatedCSS(text, token) {
    const tree = parser.parse(text, { parseValue: false });
    const gate = parser.parse(
      ':where(:root[data-dp-cloaked="' +
        token +
        '"],:root[data-dp-cloaked="' +
        token +
        '"] *)',
      { context: "selector" },
    ).children.first;
    parser.walk(tree, {
      enter(node, item, list) {
        if (
          node.type === "Atrule" &&
          ![
            "media",
            "supports",
            "layer",
            "container",
            "scope",
            "starting-style",
            "document",
            "-moz-document",
            "namespace",
          ].includes(node.name.toLowerCase())
        ) {
          // Keep grouping rules and sheet-local namespace mappings. Global definitions,
          // imports and unknown at-rules remain only in the removable AUTHOR sheet.
          list.remove(item);
          return parser.walk.skip;
        }
        if (node.type !== "Rule") return;
        if (node.prelude?.type !== "SelectorList") {
          // CSS Tree retains unsupported/invalid selectors as Raw. Never send them ungated.
          console.warn(
            "Decreased Productivity skipped an unsupported custom CSS selector.",
          );
          list.remove(item);
          return parser.walk.skip;
        }
        node.prelude.children.forEach((selector) => {
          let pseudo;
          selector.children.forEach((part, entry) => {
            if (
              !pseudo &&
              (part.type === "PseudoElementSelector" ||
                (part.type === "PseudoClassSelector" &&
                  ["before", "after", "first-line", "first-letter"].includes(
                    part.name.toLowerCase(),
                  )))
            )
              pseudo = entry;
          });
          selector.children.insertData(parser.clone(gate), pseudo);
        });
      },
    });
    return parser.generate(tree);
  }
  function signature(config, paranoid = false) {
    let hash = 2166136261;
    for (const char of JSON.stringify([config, paranoid])) {
      hash ^= char.charCodeAt(0);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(16);
  }
  function css(config, paranoid = false, userOrigin = false) {
    const font =
      config.font === "-Custom-" ? config.customfont || "Arial" : config.font;
    const face = ["Serif", "Monospace"].includes(font)
      ? font.toLowerCase()
      : JSON.stringify(font) + ",sans-serif";
    const fontRule =
      font === "-Unchanged-"
        ? ""
        : `font-family:${face}!important;font-size:${config.fontsize}px!important;`;
    const all = ":where(:scope,:root,:host,*)",
      images = 'img,canvas,input[type="image"],svg,image',
      media = "video,audio,object,embed";
    let text = `${all}{background-color:#${config.s_bg}!important;background-image:none!important;color:#${config.s_text}!important;border-color:#${config.s_table}!important;box-shadow:none!important;text-shadow:none!important;${fontRule}${config.removeBold === "true" ? "font-weight:normal!important;" : ""}}\n`;
    text += `a,a *{color:#${config.s_link}!important;}a{text-decoration:${config.showUnderline === "true" ? "underline" : "none"}!important;}\n`;
    text += `input,textarea,select,button{border:1px solid #${config.s_table}!important;}*::before,*::after{background-image:none!important;}::selection{background:#888!important;color:white!important;}\n`;
    const mode = paranoid ? "Paranoid" : config.sfwmode;
    if (mode === "Paranoid")
      text += `${images},${media},iframe{display:none!important;}\n`;
    else if (mode !== "NSFW") {
      const targets = images + ",iframe" + (mode === "SFW" ? "," + media : "");
      if (Number(config.opacity1) === 0 && config.collapseimage === "true")
        text += `${targets}{display:none!important;}\n`;
      else
        text += `${targets}{opacity:${config.opacity1}!important;} :is(${targets}):hover{opacity:${config.opacity2}!important;}\n`;
      if (mode === "SFW1") text += `${media},iframe{display:none!important;}\n`;
    }
    text += `img.${visible}{display:initial!important;visibility:visible!important;opacity:1!important;}\n`;
    if (userOrigin) {
      const token = signature(config, paranoid);
      // Built-ins and custom rules use the same zero-specificity subject gate.
      // Parse separately so malformed custom CSS cannot disable the built-in cloak.
      let custom = "";
      try {
        custom = gatedCSS(config.customcss, token);
      } catch (error) {
        console.warn(
          "Decreased Productivity skipped invalid custom CSS:",
          error.message,
        );
      }
      return gatedCSS(text, token) + custom;
    }
    return text + config.customcss;
  }
  globalThis.DPStyle = { css, signature, gatedCSS };
  if (typeof module !== "undefined")
    module.exports = { css, signature, gatedCSS };
})();
