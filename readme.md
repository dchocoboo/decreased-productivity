# Decreased Productivity

Discreet page styling for modern browsers: configurable colors and fonts, faded or hidden images and multimedia, title and favicon replacement, and independent tab or global toggles. Originally by Andrew Y.; original icon artwork and translations are retained.

This source version is **1.0.0** and uses Manifest V3. The old store listings are historical and have not been updated or published by this task.

## Install locally

Node.js 22 or later is needed for development and packaging; the extension itself has no runtime dependencies.

```sh
npm ci
npm run build
npm run package  # Optional Chromium and Firefox ZIPs in dist/
```

- **Chrome / Edge:** open `chrome://extensions` or `edge://extensions`, enable Developer mode, click **Load unpacked**, and select `dist/chromium`. Pin DP from the browser’s extensions menu. Click its icon to toggle the current tab, or right-click it for Options and domain-list actions. Minimum Chromium version: 120.
- **Firefox desktop 146 or newer:** open `about:debugging#/runtime/this-firefox`, choose **Load Temporary Add-on**, and select `dist/firefox/manifest.json`. Grant website access when Firefox asks. Temporary installation lasts until Firefox restarts. Permanent installation in normal Firefox requires Mozilla signing; the supplied ZIP is a source package, not a signed add-on.
- **Safari:** this repository does not supply a Safari extension/app. Safari requires an Xcode Safari Web Extension conversion, Apple signing and separate validation.

An unpacked installation has its own extension identity. Existing settings from a store-installed copy will not automatically appear in a new unpacked copy; export from the old copy and import in the new Options page. An update retaining the same extension identity migrates legacy extension-origin localStorage automatically without deleting the old values.

## Features and behavior

- All five original modes: Paranoid hides images/multimedia, SFW0 fades both, SFW1 fades images and hides multimedia, SFW2 fades images while keeping native multimedia visible, and NSFW keeps media visible while restyling the page.
- Per-tab state survives navigation and service-worker suspension. **New tabs by default** affects future tabs. Enable Stickiness makes tabs opened by a cloaked tab inherit cloaking; explicit manual uncloak is preserved.
- Whitelisted domains are always uncloaked. Blacklisted domains are always cloaked, including when Enable is unticked. A whitelist wins conflicts. Matches cover the whole hostname, so `example.com` does not match `example.com.evil.com`; `*.example.com` matches subdomains and `?` matches a single character.
- **Safely open in new tab** records the cloak state before navigating to a link or image. This is a presentation feature, not a promise that content is safe or that navigation is private.
- Default toggle: **Ctrl/Cmd + F12**. Emergency Paranoid: **Alt + P**. Press the emergency shortcut again, or the normal shortcut, to restore the configured mode and remain cloaked. Global mode applies the emergency mode to all tabs. Custom shortcuts accept modifier keys, punctuation, function keys and navigation keys. Shortcuts operate inside ordinary web pages and skip editable controls; browser/OS-reserved shortcuts may take precedence.
- Images within both configured displayed width and height limits remain visible. Setting either limit to zero disables the exception. Dynamic images, CSS resizing and open shadow roots are handled; closed shadow roots cannot be inspected.
- Options save automatically and validate before persisting. JSON export preserves multiline CSS and separator characters. Legacy `setting|value` exports are accepted; malformed imports do not partially overwrite settings.
- Toolbar visibility is controlled by browser pinning. The original Show DP Icon value is retained for legacy imports and displayed as a disabled preference.

Settings are stored locally in this browser profile. Tab and emergency state are session data and reset when the browser restarts; durable settings and domain lists remain. No analytics, external scripts, remote code or network service is used by the extension.

Browser-owned pages, extension-store pages and other protected documents cannot be restyled. Native PDF viewers, closed shadow DOM and unusual page-specific rendering can require separate site adjustments. Open shadow roots are discovered during DOM changes, load and pointer interaction. The extension preserves site layout and focuses on presentation; it does not implement bespoke fixes for every website.

## Development and verification

```sh
npm test                     # Pure settings, domain, shortcut and stylesheet regressions
npx playwright install chromium
npm run test:browser         # Real extension in isolated bundled Chromium
npm run lint:firefox         # Mozilla manifest/package validator
npm run test:firefox         # Actual Firefox extension in temporary copy/profile
npm run format:check
npm audit
```

`npm run test:browser` runs the real worker, options and content scripts. It covers option controls, all modes, hover, inline `!important`, cross-origin frames, open shadow DOM, dynamic title/favicon restoration, manual/default tab state, global toggles, safe-open and stickiness, service-worker termination, history restoration, ordinary insecure HTTP, atomic import and actual legacy offscreen migration. Screenshots are saved outside the repository under `/private/tmp/decreased-productivity-evidence` by default; override with `DP_EVIDENCE_DIR`.

The Firefox harness uses a disposable source copy with test-only probes and a separate profile. Set `FIREFOX_BINARY=/path/to/firefox npm run test:firefox` on other systems. Set `DP_FIREFOX_VERBOSE=1` for launch diagnostics. Test probes are never included in build outputs.

Verified on 2026-09-29: comprehensive real bundled Chromium **153.0.8010.12** suite, **8/8** pure unit regressions, desktop 1280×900 and mobile 390×844 Options UI, Mozilla lint with zero warnings/errors and npm audit with zero vulnerabilities. Personal Chrome and Edge profiles were not changed. Firefox runtime validation was attempted with installed Firefox **148.0** and bundled Firefox **155.0**, but this host could not open the isolated debugger port (`ECONNREFUSED`; installed Firefox also reported `sandbox_extension_issue_file_to_process ... Operation not permitted`). The Firefox package is lint-validated; actual Firefox extension behavior remains unverified on this host. Safari and Android were not tested.

Custom CSS is appended after built-in rules at the same stylesheet origin, so specific `!important` custom rules can override cloak defaults. Ordinary style rules are scoped to the active configuration. CSS global declarations such as font-face and keyframe names retain browser-defined global behavior; fetched resources cannot be “unloaded” after use.

## Browser API references

- [Chrome Manifest V3 service-worker migration](https://developer.chrome.com/docs/extensions/develop/migrate/to-service-workers)
- [Mozilla Firefox 146 CSS scope support](https://developer.mozilla.org/en-US/docs/Mozilla/Firefox/Releases/146)
- [Chrome storage API](https://developer.chrome.com/docs/extensions/reference/api/storage)
- [Mozilla background manifest differences](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/background)
- [Playwright Chrome extensions: use bundled Chromium](https://playwright.dev/docs/chrome-extensions)

Original historical project links: [Chrome Web Store](https://chrome.google.com/webstore/detail/decreased-productivity/nlbpiflhmdcklcbihngeffpmoklbiooj) and [Firefox Add-ons](https://addons.mozilla.org/firefox/addon/decreased-productivity-andryou/).
