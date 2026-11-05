# EDCH architecture

EDCH is a [Tauri v2](https://tauri.app/) desktop app. The window shows a web page written in
TypeScript without a framework or bundler; a small Rust backend gives it what a web page can't do
(read the game's files, make HTTP requests to other sites, run a local server for phones).

All the game logic lives in TypeScript. The Rust side moves bytes: journal lines, files, HTTP
answers. It never interprets game data.

```
┌──────────────────────── Window (webview) ─────────────────────────┐
│  dist/index.html → js/boot.js → js/app/main.js …                  │
│  TypeScript UI: pages, game logic, state                          │
└───────────────▲───────────────────────────────┬───────────────────┘
                │ events (journal lines,        │ commands (invoke):
                │ status, companion files)      │ HTTP, files, server…
┌───────────────┴───────────────────────────────▼───────────────────┐
│  Rust backend (src-tauri/src)                                     │
│  journal · http · options · remote · ntfy · update · app · logs   │
└───────────────────────────────────────────────────────────────────┘
        │ reads                          │ serves the same page
  Saved Games\…\Elite Dangerous     phones and second screens (remote access)
```

## Data flow

```
Game journal ──► Rust journal.rs ──► platform/bridge ──► app/journalFeed
                                                              │
                     game/journal (commander) ◄───────────────┤
                     game/activity (missions, exploration…) ◄─┘
                                       │
                                       ▼
                                  state/store ──► views/<page> ──► ui/
                                       ▲               │
       services/ (Spansh, EDSM…) ──────┘    features/ ◄┘ (calculations)
```

1. `src-tauri/src/journal.rs` replays the latest journals at start-up, then follows the newest
   one and sends its lines in batches. It also sends the companion files the game rewrites
   (`Status.json`, `Cargo.json`, `Market.json`, `ShipLocker.json`…).
2. `app/journalFeed.ts` applies them: `game/journal` turns events into the commander's state
   (location, ship, materials, cargo, engineers), `game/activity` into what outlives a session
   (missions, colonisation, exploration, exobiology, carriers, mining, Powerplay). Live events
   also go to the data sharing services (`services/sync/`) and the live features
   (`features/missions/live.ts`).
3. `state/store.ts` holds everything (with the settings and the wishlist) and tells its
   subscribers when it changes. The shown page redraws.

On a phone paired with the PC (remote access), there is no journal: `app/remote.ts` follows the
PC's state through the local server. In a plain browser (`npm run demo`), a demo journal is used.

## Front end (`src/`)

The code is in layers. **A module may import from its own layer or from a layer below it,
never from a layer above.** `tools/check-layers.cjs` enforces it (run by `npm test` and CI);
`import type` is allowed everywhere since it disappears at run time.

| Layer (lowest first) | What it holds | Examples |
| --- | --- | --- |
| `platform/` | What touches the computer: calls to Rust, logs, translations, version | `bridge.ts`, `logger.ts`, `i18n.ts`, `version.ts` |
| `game/` | The game itself, pure functions: journal events → state, game data, demo journal | `journal/`, `activity/`, `data.ts`, `exobio.ts`, `types.ts` |
| `state/` | The app's state and settings | `store.ts`, `context.ts`, `themeSettings.ts`, `syncSettings.ts` |
| `ui/` | Shared display pieces: DOM helper, dialogs, banners, theme, menu, formats | `dom.ts`, `dialog.ts`, `alerts.ts`, `notifier.ts`, `menu/` |
| `services/` | Other sites and servers | `spansh.ts`, `edsm.ts`, `eddn.ts`, `sync/` (EDDN, EDSM, Inara uploaders), `wing.ts`, `remoteServer.ts` |
| `features/` | Calculations and logic behind the pages, without the page itself | `navigation/`, `engineers/`, `materials/`, `mining/`, `controls/`, `missions/` |
| `views/` | One folder per page (`index.ts` is the page), plus `shared/` and `detail/` (right panel) | `views/navigation/`, `views/settings/cards/` |
| `app/` | Start-up and wiring: layout, top bar, journal feed, remote access | `main.ts`, `shell.ts`, `header.ts`, `journalFeed.ts`, `remote.ts` |

`src/boot.ts`, the entry point, picks the language and loads its texts **before** importing the
rest of the app (`import("./app/main.js")`), so every module, including module-level constants,
can call `t()`. Changing the language reloads the page.

### Pages

A page is a class implementing `View` (`state/context.ts`):

```ts
export class ExampleView implements View {
  constructor(private ctx: Ctx) {}
  mount(root: HTMLElement) { /* first draw into root */ }
  update() { /* the store changed: redraw what depends on it */ }
}
```

`ctx` gives the game data (`ctx.game`), the store (`ctx.store`) and the sync services
(`ctx.sync`). Each page draws into its own container (`div.view-host`), so a page you left that
redraws late (a Spansh answer arriving, a timer) never draws over the current one.

DOM is built with `h()` from `ui/dom.ts`: `h("button.primary", { onclick }, icon("pin"), "text")`.

**To add a page:** create `views/<page>/index.ts`, add it to `createViews()` in `app/shell.ts`
and to `NAV` (with its group and icon) in `ui/menu/pages.ts`, add its texts to the locale files
(see [TRANSLATING.md](TRANSLATING.md)), and its styles to `public/styles.css` (below).

### Translations

[i18next](https://www.i18next.com/), vendored in `vendor/i18next/`. App texts are
`t("namespace.key", { variables })` with the texts in `public/locales/<lang>.json`; game names
(materials, modules, blueprints) come from the game's own translations in
`public/locales/game.<lang>.json`. Errors from the Rust side are codes translated by
`backendMessage()`. Details: [TRANSLATING.md](TRANSLATING.md).

### Styles (`public/styles.css`)

All the styles are in **one file**, `public/styles.css` (the root of the page, next to
`index.html`, which is the only place that loads it). It is cut into sections, each starting with a
`/* ==== NAME ==== */` banner: base (colours, element defaults), layout, forms, then the pages,
phones, panels, banners, menu.

**The order matters**: when two rules of the same specificity set the same property, the later one
wins, and several rules rely on that. Don't move existing rules around.

- Styles for one page go to that page's section, at its end.
- Phone rules (`@media (max-width: 760px)`) go next to the rules they change, or in the PHONES
  section when they must win over most pages.
- Colours always come from the CSS variables of the BASE section (set by the theme).
- Form fields and buttons have one look, defined once in the FORMS section: fields (`select`,
  `input`, `textarea`) get it automatically, buttons through `button.primary` / `button.ghost` (and
  `.small`). Pages only set their layout (width, flex), never their own colours, borders or sizes.
  Two heights exist: 36px, and 28px for compact places (lists, chips, toolbars).

## Backend (`src-tauri/src/`)

| Module | Role |
| --- | --- |
| `lib.rs` | Start-up: plugins, state, the list of commands the UI can call |
| `journal.rs` | Journal folder, replay and tail of the journal, companion files, archive scan |
| `http.rs` | HTTP requests for the UI, to an allow-list of hosts only |
| `options.rs` | The game's option files (bindings, graphics): list, read, export, import |
| `paths.rs` | Where the game's files are (Proton prefixes on Linux) and EDCH's Documents folder |
| `system.rs` | Clipboard, opening links and files, portable build, installer language |
| `app.rs` | Window behaviour, tray, is the game running, launching the game |
| `remote.rs` | Local web server for phones and second screens (pairing, state, actions) |
| `ntfy.rs` | Wing missions shared through ntfy.sh (encrypted) |
| `update.rs` | Update check, download and install from GitHub releases |
| `logs.rs` | Log files (standard and debug), with private data removed |

Windows and Linux differences stay inside the backend, behind `#[cfg(target_os = "…")]`: journal
and options folders (Proton prefixes on Linux), opening links (`rundll32` / `xdg-open`), the game
process check (process snapshot on Windows, `/proc` on Linux). Both are built by CI.

Errors the user can see are returned as codes (`"fileNotFound"`, `"network: <detail>"`); the UI
shows them in the user's language. Add a `backend.<code>` text for every new one.

## Privacy rules

These hold everywhere, front end and backend:

- Logs never contain API keys, the remote access secret (QR code), the wing code, the Windows
  user name or home folder, full IP addresses, the Wi-Fi name, or anything typed in a field.
  `logs.rs` (`sanitize`, `redact`) and `platform/logger.ts` enforce it; keep using them.
- API keys and paths are never sent to phones (`app/remote.ts`, `snapshot`).
- EDCH never reads or changes the game's code or data files; it only reads the journal and
  companion files, and the option files the user exports or imports.

## Checks

`npm test` builds the app and runs:

- `prettier --check` (formatting, config in `.prettierrc.json`),
- `tools/check-layers.cjs` (the layer rule above),
- `tools/i18n/check.cjs` (translations: missing texts, variables, unused keys),
- the unit tests in `test/` (`node --test`).

CI (`.github/workflows/build.yml`) runs them, then builds Windows and Linux, with `cargo fmt
--check` and `cargo clippy`.
