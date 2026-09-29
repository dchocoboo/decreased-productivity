# Firefox runtime verification checkpoint

- Completed: modernization and Chromium regression suite on master 3203194.
- Completed: isolated installed Firefox148 headed launch diagnosis on macOS27, fails before add-on install; full log /private/tmp/decreased-productivity-firefox-headed.log. No sandbox/profile changes.
- Completed: workflow pushed; Ubuntu Chromium suite, 8 unit regressions and formatting passed. Firefox155 launched and extension loaded with HTTP/HTTPS grants. Smoke failed USER CSS cloak; refining test-only current-tab inputs and explicit error messages, no runtime source change.
- Pending: verify Firefox scoped custom root/descendant override and restoration and real options saves; fix evidenced failures if any.
- Pending: reconcile README evidence, package/format/lint checks, final verified master commit and push.

- Confirmed: original custom CSS browser tests sampled transient AUTHOR styles; requiring USER-opacity proof fails Chromium and Firefox root/ancestor selectors.
- In progress: replace @scope with exact css-tree3.2.1 parser subject gating, preserve author global definitions, strengthen actual-engine regression coverage.

- Completed locally: parsed-gate correction, 10/10 unit tests, strengthened actual Chromium153 suite including pseudo/nesting/globals cleanup, format, package, Firefox lint0warnings/errors, audit0, ZIPmanifest/parser/license parity (300files).
- Pending: real Firefox155 UbuntuCI assertions (root/ancestor, pseudo/nesting/list specificity, restoration and options) before declaring correction verified.
