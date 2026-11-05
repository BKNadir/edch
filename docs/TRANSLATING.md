# Translating EDCH

EDCH uses [i18next](https://www.i18next.com/) (MIT, vendored in `vendor/i18next/`, see its
`README.txt`). There are two kinds of text:

| Kind | Where | How it is shown |
| --- | --- | --- |
| App texts (buttons, help, messages…) | `public/locales/<lang>.json` | `t("namespace.key", { variables })` |
| Game names (materials, modules, blueprints…) | `public/locales/game.<lang>.json`, built by `tools/gen_game_locales.py` | `gameName(englishName)`, or automatically when a text node is exactly a game name |

Languages: `en` (reference and fallback), `fr`, `de`, `es`, `pt` (Brazilian Portuguese), `ru`.

## Fixing or adding a translation

Edit the language's file in `public/locales/`. Keys are grouped by namespace, which is usually the
source file that uses them (`navigation`, `settings`…), or `common` for texts used in several
places:

```json
{
  "navigation": {
    "refuelStops_one": "Refuelling needed at {{count}} waypoint.",
    "refuelStops_other": "Refuelling needed at {{count}} waypoints."
  }
}
```

- Keep the `{{variables}}` exactly as they are in English; their order may change.
- Plurals use i18next's suffixes (`_one`, `_few`, `_many`, `_other`, following each language's
  rules). A language whose sentence works for every number (Russian "событий: {{count}}") can use
  the plain key without a suffix.
- Game terms in app texts must use the names the localized game shows (for example the French
  "Récupérateur de carburant", "Injection FSD").
- A text missing in a language falls back to English.

Run `npm run i18n:check` (also part of `npm test` and CI). It reports keys used in the code but
missing in English, keys missing in a language, variables that differ from English, and keys the
code no longer uses.

## Adding a text in the code

1. Pick a key: `<namespace>.<camelCaseName>`, the namespace being the file's name (or `common`).
2. Add it to **every** `public/locales/<lang>.json` (English at least; the check lists the others).
3. Use it: `t("navigation.refuelStops", { count: stops.length })`. Pass numbers (not formatted
   strings) as `count`, so that plurals work.

Notes:

- `t()` can be called anywhere, including module-level constants: `src/boot.ts` loads the language
  before the rest of the app is imported. Changing the language reloads the page.
- Never put data in `t()`: journal event names, commodity names, identifiers compared in code and
  anything saved in settings stay as plain strings.
- Errors from the Rust side are codes (`"fileNotFound"`, `"network: <detail>"`); `bridge.ts` turns
  them into `backend.<code>` texts (`{{detail}}` holds what follows the colon). Add a
  `backend.<code>` key for every new Rust error the user can see.
- Logs stay in English and are not translated.

## Tools

- `node tools/i18n/check.cjs` — the check described above.
- `node tools/i18n/rename-keys.cjs old.key=new.key …` — moves or renames keys in every language
  and in `src/`.
- `node tools/i18n/rename-vars.cjs namespace.key old=new …` — renames a `{{variable}}` of a key in
  every language and in its `t()` calls.
