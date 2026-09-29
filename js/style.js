(() => {
  "use strict";
  const visible = "__dp_small_image";
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
      // All ordinary rules share a scope, preserving custom selector specificity and source order.
      return (
        '@scope (:root[data-dp-cloaked="' +
        signature(config, paranoid) +
        '"]) {\n' +
        text +
        config.customcss +
        "\n}"
      );
    }
    return text + config.customcss;
  }
  globalThis.DPStyle = { css, signature };
  if (typeof module !== "undefined") module.exports = { css, signature };
})();
