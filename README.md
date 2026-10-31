# EDCH — Elite Dangerous Companion Helper

**English** · [Français](README.fr.md) · [Deutsch](README.de.md) · [Español](README.es.md) · [Português (Brasil)](README.pt-BR.md) · [Русский](README.ru.md)

A lightweight companion for **Elite Dangerous** (Windows). It reads the game journal in real time and, for every engineering material, tells you **where to find it, with real clickable systems around you**.

![A material's page: trades and systems in Boom/Expansion (demo data)](docs/materials.png)

## What it does

- **Live inventory**: raw, manufactured and encoded materials, laid out like the material trader (one row per family, grades 1 to 5) with storage gauges. The Odyssey ship locker (data, components, items, consumables) is read from `ShipLocker.json`.
- **Where to find it, with real systems**: every spawn condition becomes a [Spansh](https://spansh.co.uk) search around your position.
  - HGE: populated systems in Boom/Expansion, War, Civil Unrest, Outbreak, Federation or Empire. Faction states that are too old are ignored.
  - Encoded emissions by security level, conflict zones, high energy wakes.
  - Landable planets ranked by raw material %, icy or pristine rings, Guardian and Thargoid sites.
  - Odyssey settlements and known farming sites (Jameson, Dav's Hope, brain trees, crystals…).
  - Click a system: it is copied, ready to paste into the galaxy map. Spansh and Inara links next to it.
- **Nearest material trader** of the right type, with **trade suggestions** computed from your stock (game rates, taking into account what your wishlist reserves).
- **Engineering**: every modification, experimental effect, synthesis, technology broker unlock and Odyssey upgrade, with what you already own.
- **Wishlist**: add modifications (grades, number of rolls, quantity). It works out what is missing and the best trade to cover it.
- **Engineers**: status and rank read from the journal, copyable system, distance, and unlock conditions ticked automatically when the journal can check them (Odyssey locker, cargo, materials).
- **Build import**: paste or pick an **EDSY** or **Coriolis** export (SLEF or Loadout JSON). Every engineered module and its experimental effect goes into the wishlist. You can also start from your current ship.
- **Inara-style search**: where to buy or sell a commodity (by price or distance), a ship, a module (class and rating) or a service (Interstellar Factors, technology broker, material trader…) around you.
- **Navigation**: your ship's jump range (empty, full, laden, right now, simulated cargo), neutron-boosted route via Spansh, and fleet carrier (jumps, tritium and time, as a quick estimate or a detailed Spansh plan with restock stops).
- **Controls & devices**: reads your bindings (active preset, including different presets for ship, SRV and on foot) and draws each device. The keyboard is drawn key by key (QWERTY, AZERTY or QWERTZ) and the Xbox or PlayStation pad with numbered markers. Recognised HOTAS, joysticks and pads (about 45 models: VKB, Virpil, Thrustmaster, Saitek/Logitech, CH…) are shown on the model's picture, with the action written in each button's box. Templates come from EDRefCard and are loaded from its GitHub repository. For an unrecognised model you pick the closest template; otherwise a simple axes / hats / buttons diagram is shown. Every control has its legend and a colour per mode, with Ship / SRV / On foot filters, a search and a printable sheet.
- **Configuration backup**: exports your bindings (and graphics settings) to a zip in Documents\EDCH and restores them in one click. Your current configuration is backed up automatically before every import.
- **Mobile access**: open EDCH on your phone or tablet by scanning a QR code. A local server (off by default) serves the app on your network; only devices that scanned the QR code are let in, because the PC's IP alone isn't enough. "New code" disconnects every device. The interface adapts to phones (bottom navigation, full-screen panels), and wishlist edits on the phone sync back to the PC.
- **Automatic updates**: EDCH checks GitHub for a new release, shows a banner, downloads the installer on request (checksum verified) and restarts itself to finish. Can be turned off in Settings.
- **EDMC-style sync**: live uploads to **EDDN** (markets, outfitting, shipyards, jumps, scans, routes), **EDSM** and **Inara** (with your API key). EDDN's rules are followed: personal data removed, location cross-checked, a rejected message is never resent, nothing from your history.

![A VKB Gladiator with its bindings (demo bindings)](docs/controls.png)

## Languages

EDCH is available in the game's six languages: English (default), French, German, Spanish, Portuguese (Brazil) and Russian. The installer asks for the language and the app picks it up on first launch. You can change it at any time in **Settings → Language**. Material, module, blueprint and effect names follow the game's own translation; control names stay as in the English game.

To add or fix a translation, edit `tools/translations_*.txt` (one line per text: `fr ¦ en ¦ de ¦ es ¦ pt ¦ ru`), then run `python3 tools/gen_locales.py`.

## Install

Download the installer (`.exe` or `.msi`) from [Releases](../../releases), or the portable `edch.exe` from the latest build's artifacts (*Actions* tab). Windows 10/11 already has WebView2.

On first launch the journal folder is detected automatically (`%USERPROFILE%\Saved Games\Frontier Developments\Elite Dangerous`). You can change it in **Settings**.

## Development

Requirements: Node 20+, stable Rust, and the [Tauri prerequisites](https://tauri.app/start/prerequisites/) for Windows.

```bash
npm install
npm test            # builds the UI and runs the tests (journal, trades, Spansh queries, EDDN, bindings)
npm run app:dev     # runs the app
npm run app:build   # Windows installers in src-tauri/target/release/bundle
npm run demo        # UI only, in a browser, with a sample journal
```

Layout:

- `src-tauri/`: Rust backend (journal reading, game JSON files, HTTP calls, option files and zips, opening links). It contains no game logic.
- `src/`: framework-free TypeScript UI.
  - `journal.ts`: commander state from journal events.
  - `sources.ts`: spawn conditions turned into searches.
  - `spansh.ts`: calls and result formatting.
  - `trade.ts`: material trader rates.
  - `eddn.ts`, `uploaders.ts`: EDDN messages, EDSM and Inara.
  - `binds.ts`: `.binds` files and device names.
  - `i18n.ts`: translation layer.
- `tools/gen_data.py`, `tools/gen_binds.py`, `tools/gen_locales.py`: regenerate the data in `public/` (see NOTICE).

A Windows build runs on every push to `main`. To publish a version, push a tag such as `v0.6.0` (or push to `main` a commit whose message contains `[release]`): the Release is published and installed copies offer the update.

## Roadmap

- Frontier login (cAPI, OAuth) for fleet, stock and fleet carrier: needs a Frontier Client ID.
- EDDN: remaining schemas (codexentry, approachsettlement, fssbodysignals, fsssignaldiscovered…).
- Optimised farming route for the wishlist.

## Credits

Data: EDCD/FDevIDs and msarilar/EDEngineer (MIT), via dseelinger/d47 (MIT). Localized game names: Elite Dangerous Almanac (MIT) and EDEngineer. Control names and device templates: EDRefCard (Richard Buckle, MIT). Searches: Spansh (EDDN). Elite Dangerous is a trademark of Frontier Developments plc. Unofficial, non-commercial community tool. Details in [NOTICE](NOTICE).
