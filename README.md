# EDCH — Elite Dangerous Companion Helper

**English** · [Français](README.fr.md) · [Deutsch](README.de.md) · [Español](README.es.md) · [Português (Brasil)](README.pt-BR.md) · [Русский](README.ru.md)

A lightweight companion for **Elite Dangerous** (Windows). It reads the game journal in real time and, for every engineering material, tells you **where to find it, with real clickable systems around you**.

## ⚠️ Read this first

**EDCH is not a replacement for the community's other tools.** It is an independent project, unrelated to [EDMarketConnector](https://github.com/EDCD/EDMarketConnector), [Odyssey Materials Helper](https://github.com/jixxed/ed-odyssey-materials-helper), [EDEngineer](https://github.com/msarilar/EDEngineer), Inara, Spansh or any other project, and not affiliated with Frontier Developments. If one of those tools works for you, keep using it: they are older, more complete and proven by thousands of players.

**EDCH was largely written by an AI (Claude, by Anthropic), overseen by a developer** who decides the features, tests and approves every release. The tool may be incomplete or contain bugs or inaccurate data. If you find any, please open an [issue](../../issues).

**EDCH would not work without other people's work.** Its data, translations and searches come from projects built and maintained by volunteers in the community: Spansh, EDDN and EDCD, EDSM, Inara, EDEngineer, Odyssey Materials Helper, Elite Dangerous Almanac, EDRefCard, EDSY, Coriolis… If EDCH is useful to you, please thank them, support them or contribute to their projects. Details are in [Credits](#credits) and in [NOTICE](NOTICE).

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
- **Missions**: every active mission with its objective, destination, time left and progress; stacked massacre missions with the kills each issuing faction still needs.
- For sourcing and mining missions, where to get the goods: stations ranked on price, distance and freshness of the market data, with the estimated profit, and the nearest hotspots for mining missions.
- **Shared wing missions**: wing members who use EDCH type the same code and see who accepted which shared mission: you choose which missions to share (or share them all automatically). Messages go through ntfy.sh, end-to-end encrypted with that code. A sound and/or a flashing side tab (no Windows pop-ups) tells you when someone has a mission you don't, or when the whole wing has accepted it.
- **Colonisation**: each construction depot with what is left to deliver, what is in your hold, the trips needed and a one-click search for where to buy each commodity.
- **Community goals**: your contribution, reward band and tier for the goals you joined; all current goals through Inara with your API key.
- **Exploration**: value of unsold cartographic data, exobiology sampling help (distance from the previous samples against the colony range), possible species and values for each planet with biological signals, unsold analyses.
- **Mining**: live prospector results with alerts for your targets and motherlodes, session tonnage; a Merit Miner-style search for where to mine and sell in your power's systems.
- **Powerplay and session**: merits this week and this session, current system's Powerplay state; credits earned by activity since you logged in.
- **Mobile access**: open EDCH on your phone or tablet by scanning a QR code. A local server (off by default) serves the app on your network; only devices that scanned the QR code are let in, because the PC's IP alone isn't enough. "New code" disconnects every device. The interface adapts to phones (bottom navigation, full-screen panels), and wishlist edits on the phone sync back to the PC.
- **Automatic updates**: EDCH checks GitHub for a new release, shows a banner, downloads the installer on request (checksum verified) and restarts itself to finish. Can be turned off in Settings.
- **EDMC-style sync**: live uploads to **EDDN** (markets, outfitting, shipyards, jumps, scans, routes), **EDSM** and **Inara** (with your API key). EDDN's rules are followed: personal data removed, location cross-checked, a rejected message is never resent, nothing from your history.

![A VKB Gladiator with its bindings (demo bindings)](docs/controls.png)

## Data and privacy

EDCH reads your game journal on your PC. Here is everything that leaves it, and where to:

- **Spansh**: your searches (system, material, commodity…) and your position as their starting point.
- **EDDN** (on by default, like EDMC; can be turned off in Sync): market, outfitting, shipyard, jump and scan data, with your personal details removed, as EDDN requires.
- **EDSM and Inara**: nothing unless you enter your own API key in Sync. Your keys stay on your PC.
- **ntfy.sh** (only if you enable wing sharing): your wing missions, encrypted with the wing code before leaving your PC.
- **GitHub**: only to check whether a new version exists (can be turned off in Settings).
- **Mobile access**: stays on your local network; off by default and protected by the QR code.

Nothing else is collected or sent. Your settings, keys and wishlist are stored in `%LOCALAPPDATA%\EDCompanionHelper`.

## Languages

EDCH is available in the game's six languages: English (default), French, German, Spanish, Portuguese (Brazil) and Russian. The installer asks for the language and the app picks it up on first launch. You can change it at any time in **Settings → Language**. Material, module, blueprint and effect names follow the game's own translation; control names stay as in the English game.

To add or fix a translation, edit `tools/translations_*.txt` (one line per text: `fr ¦ en ¦ de ¦ es ¦ pt ¦ ru`), then run `python3 tools/gen_locales.py`.

## Install

Download the installer (`.exe` or `.msi`) from [Releases](../../releases), or the portable `edch.exe` from the latest build's artifacts (*Actions* tab). Windows 10/11 already has WebView2.

The installer isn't digitally signed (a certificate is expensive for a free tool), so Windows SmartScreen may show "Windows protected your PC" the first time. Click **More info**, then **Run anyway**. Later updates are offered inside EDCH.

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

A Windows build runs on every push to `main`. To publish a version, push a tag such as `v0.8.1` (or push to `main` a commit whose message contains `[release]`): the Release is published and installed copies offer the update. Write the version's changes in [CHANGELOG.md](CHANGELOG.md) first: that section becomes the release notes shown in the update banner.

## Roadmap

- Frontier login (cAPI, OAuth) for fleet, stock and fleet carrier: needs a Frontier Client ID.
- EDDN: remaining schemas (codexentry, approachsettlement, fssbodysignals, fsssignaldiscovered…).
- Optimised farming route for the wishlist.

## Credits

Data: EDCD/FDevIDs and msarilar/EDEngineer (MIT), via dseelinger/d47 (MIT). Localized game names: Elite Dangerous Almanac (MIT) and EDEngineer. Control names and device templates: EDRefCard (Richard Buckle, MIT). Searches: Spansh (EDDN). Elite Dangerous is a trademark of Frontier Developments plc. Unofficial, non-commercial community tool. Details in [NOTICE](NOTICE).
