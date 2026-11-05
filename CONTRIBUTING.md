# Contributing to EDCH

Thanks for helping! Start with [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md): it explains how the
code is organised and the rules that keep it that way.

## Setup

```bash
npm install
npm test            # build, formatting, layer and translation checks, unit tests
npm run demo        # UI only, in a browser, with a demo journal
npm run app:dev     # the desktop app (needs Rust and the Tauri prerequisites)
npm run format      # formats everything with Prettier
```

## Code conventions

- **English everywhere** in the code: names, comments, logs, commit messages. Texts shown to the
  user go through `t()` (see [docs/TRANSLATING.md](docs/TRANSLATING.md)).
- **Names say what things are.** `camelCase` for variables and functions, `PascalCase` for classes,
  interfaces and types, `UPPER_SNAKE_CASE` for module-level constants. No one-letter names except
  loop indexes and tiny callbacks (`(a, b) => a - b`). Maps of labels end in `_LABELS`.
- **One header comment per file**: what the module is for, in a few lines. Exported functions get
  a `/** … */` comment when their name doesn't say everything.
- **Comments explain why**, not what the next line does.
- **Layers**: import only from your layer or the ones below (`npm run lint` tells you).
- **Formatting**: Prettier (`npm run format`), `printWidth` 120. Rust: `cargo fmt` (same width).
- **No new dependency** without a good reason: the front end has none at run time except i18next.
- **Privacy**: never log keys, secrets, user names, paths, IP addresses or typed text
  ([docs/ARCHITECTURE.md](docs/ARCHITECTURE.md#privacy-rules)).

## Releasing

1. Write the version's changes at the top of [CHANGELOG.md](CHANGELOG.md), in English: that
   section becomes the release notes and the update banner's text.
2. Bump the version in `package.json`, `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml`,
   `src/platform/version.ts` and `test/v02.test.mjs`.
3. Test builds: push to a branch named `prerelease/…`. CI publishes a GitHub pre-release
   (`v<version>-pre.<run>`), which installed copies are never offered as an update.
4. Release: push to `main` a commit whose message contains `[release]` (or push a `v<version>`
   tag). CI publishes the release; installed copies offer the update.
