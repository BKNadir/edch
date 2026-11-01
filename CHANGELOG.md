# Changelog

The release build copies the section of the version it publishes into the GitHub release,
and EDCH shows it in the update banner.

## 0.8.4

- Wing missions are linked by their mission id, which is the same for the commander who shares and the one who accepts. Matching on faction, destination and expiry is only a fallback now.
- Accepting a shared mission writes nothing to the journal: EDCH now adds it to your missions as soon as the game sends a cargo depot update for it, completed with what the sharer's EDCH published (title, faction, destination, reward, expiry).
- Delivery and collection wing missions show the wing's progress ("384 / 784 delivered"), updated each time a member with EDCH delivers.
- Wing messages arrive within a second or two: EDCH keeps a live connection to ntfy.sh instead of checking every 15 seconds, and sends changes after 1 second instead of 3.
- Debug log: mission, cargo depot and wing events are logged with their details (mission id, type, progress, members).

## 0.8.3

- The side menu scrolls when the window is too short, so the last pages (About, Settings) are always reachable.
- Notices look the same everywhere: informative ones follow the theme colour, important warnings are red.
- Fixed a blank page when EDCH started on the Missions page.
- The top bar follows the colour theme and OLED mode.

## 0.8.2

- Application logs: EDCH always writes a standard log (one file per start). Logs older than a week are deleted automatically, the last 5 are always kept.
- Settings → Application logs: a debug mode writes a separate, detailed log (it also contains the standard lines), and a button opens the logs folder. API keys are never written to the logs.
- Portable version (`-portable.exe`): no installation needed. It doesn't install updates; when a new version is out, it opens the release page.

## 0.8.1

- The Missions page says it's still in development: the game writes nothing to the journal when a wing mission is shared or received, so tracking shared missions is approximate.
- Inara: while Inara hasn't approved EDCH, the sync log says so clearly and EDCH stops sending until the next start, instead of repeating the error.

## 0.8.0

- The current ship is detected as soon as you change it (shipyard swap, new ship, rename), instead of keeping the previous ship's name until a restart.
- Settings → Appearance: colour themes (Elite, Blue, Green, Purple, Red, High contrast), your own colours, a global OLED mode (pure black) and a button to restore the original colours. The phone follows the PC, and a change made on the phone is saved on the PC.
- Mobile access shows the link next to the QR code, with a copy button.
- Access away from home with Tailscale: EDCH detects it and can put its address in the QR code and the link. A step-by-step guide explains when it's useful (mobile data, public Wi-Fi, cloud gaming) and how to set it up. Remote access isn't EDCH's main purpose: Tailscale is the only option for now, while a built-in solution is developed.

## 0.7.3

- Search results show "You are here" on the system you're in, with how long ago your journal saw it, next to the date of Spansh's data.
- Each search has a "Refresh" button that skips the 10-minute cache.
- The Spansh date has a tooltip explaining where it comes from (data sent by players through EDDN).

## 0.7.2

- Game terms are shown as the game names them in your language (for example "High Grade Emissions" becomes "Émissions d'intensité élevée" in French), instead of English names or abbreviations such as HGE or USS.
- The update banner now shows what's new in the version.

## 0.7.1

- Wing missions are shared only when you choose: a button on each mission, or "share all my wing missions automatically".
- A wingmate's copy of a shared mission is recognised even with another id, another language and no wing flag; you're told when a member accepts a mission you share.
- Sourcing and mining missions: where to buy the goods (price, distance and freshness of the market data, estimated profit) and the nearest mining hotspots.

## 0.7.0

- New pages: Missions (with massacre stacks), shared wing missions with sound or colour notifications, Colonisation, Community goals, Exploration (exobiology and cartography), Mining (prospecting and Merit Miner), Powerplay and Session summary.
