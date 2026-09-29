# Browser modernization checkpoint — 2026-09-29

- [x] Clone upstream master; inspect legacy features and official browser migration documentation.
- [x] Implement Manifest V3 Chromium worker and Firefox event-background variant.
- [x] Preserve settings, domain lists, all five modes, shortcuts, stickiness, title/favicon behavior and reversible page styling.
- [x] Replace obsolete options dependencies; validate/import/export settings and preserve translations.
- [x] Add regression tests, extension browser integration and packaging validation.
- [x] Verify rendered options desktop/mobile and dynamic page behavior; record screenshots outside repository.
- [ ] Review final diff, document installation/limitations and make verified commits.

Original upstream: 0.46.56.12. No existing local changes. Browser plugin not available; Playwright fallback selected. Source references: Chrome extension service-worker migration and storage API; MDN background manifest documentation. No iOS app present.

Verification: 7/7 unit regressions; comprehensive actual bundled Chromium 153.0.8010.12 extension integration passed (2026-09-29), including service-worker termination, offscreen legacy migration, history restoration, insecure HTTP, global/per-tab/media/domain/options flows and desktop/mobile UI. Firefox package lint: zero errors/notices/warnings. npm audit: zero vulnerabilities. Screenshots: /private/tmp/decreased-productivity-evidence/.

Remaining: final independent review, installation documentation, package ZIPs, verified commits. Actual Firefox runtime remains unverified: isolated web-ext runs with installed Firefox148 and bundled Firefox155 could not open the debugger port (ECONNREFUSED); installed browser stderr included sandbox_extension_issue_file_to_process Operation not permitted. The reproducible harness remains available for another host; no sandbox disabled.
