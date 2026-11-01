# Changelog

The release build copies the section of the version it publishes into the GitHub release,
and EDCH shows it in the update banner.

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
