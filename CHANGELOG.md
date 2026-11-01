# Changelog

The release build copies the section of the version it publishes into the GitHub release,
and EDCH shows it in the update banner.

## 0.10.3

- Fixed: after a visit to Colonisation (and on some other pages that wait for Spansh, EDSM or Inara), the page could come back by itself over the one you were on, for example over Navigation. A page you left now stays closed, and Colonisation stops refreshing your carriers' markets once you leave it.

## 0.10.2

- Neutron routes for the Caspian Explorer: its Mk II drive gets ×6 from neutron stars instead of ×4. EDCH now tells Spansh, so routes use far fewer jumps. On the Navigation page the "Neutron boost ×6" box is ticked by itself when your ship has that drive, and can be unticked to plot for another ship. The engineer tour uses it too.
- Navigation: "Use my current ship" fills in the departure, your current jump range and the neutron boost from the ship you are flying.
- The Windows installer now shows what EDCH sends and to whom (Spansh, EDSM, EDDN, Inara, ntfy, GitHub) and how to turn each one off, followed by the MIT licence.
- New code signing policy page with the privacy policy, linked from the README, ahead of free code signing by the SignPath Foundation (application in progress). Signed builds will stop Windows Defender from wrongly flagging the installer.
- The loading spinner showed as a thin line in some places (engineer tour, searches): it is round again everywhere.
- Phones: the Controls page no longer runs past the right edge (search bar, notices), and the Mining search form wraps instead of being cut off.

## 0.10.1

- Navigation: when you arrive in a system of the ship route, the next one can be copied automatically, ready to paste into the galaxy map.
- New Settings → Game and search → Navigation card: auto-copy for the Navigation route, auto-copy for the engineer tour (moved here from the Engineers card), and a notification when the next jump is copied.
- Controls: the keyboard drawn by default follows the app's language (AZERTY in French, QWERTZ in German, QWERTY otherwise; ANSI in English, ISO otherwise). The switch is still there and your choice is kept.
- About: a word from the author, CMDR MDLuffy.

## 0.10.0

- Wishlist: each line shows the engineer to visit, and their name copies the workshop's system. For a modification, the nearest engineer you know who reaches the wanted grade, otherwise the best grade available (an engineer's own maximum counts, even if your rank with them is lower for now). For an experimental effect, simply the nearest engineer you know. Engineers you know but haven't unlocked are marked "to unlock"; a click shows what the game asks for. When nobody you know can do a line, the line turns red.
- Engineer tour: the stops of the wishlist, nearest first from where you are, with what to do at each one and the materials still missing (stops you can't complete yet are greyed out). Spansh plots each leg with your ship's jump range, so the jumps really follow one another.
- Optional: copy the next jump of the tour as soon as you arrive in a system of the route.
- When the game applies a modification or an experimental effect, the matching wishlist line moves on by itself, and is removed once done.
- The Bubble and Colonia are kept apart: engineers of the other region are left out, and the tour has a maximum length.
- New Settings → Game and search → Engineers card to turn each of these on or off.
- New "Day (light)" theme. With a light background the whole interface switches to dark text, and colours too light (or too dark) to read are adjusted by themselves.

## 0.9.9

- Clicking an engineer copies the system of their workshop: on the engineer's name in Engineers, and wherever engineers are listed (Engineering, wishlist).
- Searches ignore accents and case everywhere ("energie" finds "Énergie"). On the Search page, a name can be typed in the app's language or in English, or only partly: EDCH finds the game's name, or lists the names that match when there are several. An older, slower answer no longer replaces the latest search.
- The controls search also looks at the text shown on screen, the group and the internal name of each command.
- Controls: choose your keyboard (AZERTY, QWERTY, QWERTZ) and its format (ISO with the L-shaped Enter and the extra key next to left Shift, or ANSI). By default EDCH follows the layout written in the bindings file.

## 0.9.8

- Click the EDCH logo to fold the side menu away (and click it again to bring it back). It stays folded at the next start.
- Full screen button in the top bar: only the current page, without the menu and the top bar. Esc (or the "Exit full screen" button) brings everything back; F11 also toggles it.
- "Open this page alone in the browser" button, for a second screen. It appears while the remote access server is on, since that server serves the page.
- "Mobile access" is now called "Remote access": it serves the phone, a tablet, or any browser.
- New option in Settings → Game and search: from the phone, also copy to the phone's clipboard. The PC's clipboard always gets it.

## 0.9.7

- On the phone, copying (a system name, for example) no longer touches the phone's clipboard: the text only goes to the clipboard of the PC running EDCH, where the game is.

## 0.9.6

- Settings are split into tabs: General, Game and search, Display, Notifications, Advanced. The last tab opened is remembered.
- Every notification option is now in Settings → Notifications: sound and colour, the tab, wing notifications (new mission, acceptance, everyone accepted, a member leaving) and the mining alert. The Missions and Mining pages link there.

## 0.9.5

- Notifications settings moved to Settings. The side tab is now called "Notifications" and gathers every notification: wing, mining, available updates, start-up problems… The latest come first, then the missions overview.
- "Hide the tab" really hides it now (it kept showing). The sound still plays if it's ticked.
- The phone can change the notification settings too.

## 0.9.4

- Inara has approved EDCH: Inara sync works, and the "in development" notice on the Synchronisation page is gone.
- Mining (prospecting and Merit Miner): "where to mine" comes first, in green, then "where to sell", in blue. Each hotspot shows the planet (a link to its Spansh page), the ring, the ring type, its reserve, the number of hotspots and the distance from arrival.
- Mining: each mineral shows how it's mined (laser, subsurface with displacement missiles, core with seismic charges).
- Mining: when nothing is found within the search radius, EDCH widens it (up to 2,000 ly) and says so; if there's still nothing, it says you'll have to go further, with a fleet carrier for example.
- Prospecting tab: a "Where to mine" finder for any mineral, nearest hotspots first, with the best places to sell it.

## 0.9.3

- Top bar: EDCH shows whether Elite Dangerous (or its launcher) is running, and a "Launch Elite" button starts it through Steam, Epic Games or a launcher of your choice (Frontier's, MinEdLauncher…), set in Settings. It works from the phone too.
- What's new is shown after an update (can be turned off in Settings), and from About or Settings at any time.
- Settings → Pages and display: hide the pages you don't use from the menu, pick the start page and the interface size. It applies on the phone as well, and can be changed from either.
- Settings → Application: what the window's close button does: quit, minimise to the taskbar, hide in the notification area (EDCH keeps running), or ask before quitting.
- EDCH only runs once: launching it again brings the open window to the front.

## 0.9.2

- The window reopens where you left it: position, size, maximised or full screen.
- Problems found at start-up are shown in a red banner, like the update offer: game journal missing or unreadable, mobile access port unavailable, journal history unreadable, wing connection failing, an upload refused by EDDN or EDSM, or an unexpected error. Each has a button to the right page and one to open the logs.
- Settings: "Updates" moved up, right after the language.

## 0.9.1

- Linux: each release now also has an AppImage, a .deb, an .rpm, a PKGBUILD for Arch Linux and an experimental Flatpak. EDCH finds the game's journal and options in Steam's Proton folder (native, Flatpak or Snap Steam, any Steam library). On Linux, updates open the release page.
- Colonisation: a fleet carrier's market now comes first from your own journal: Market.json is read as soon as you open the carrier's market, and every purchase or sale there updates it at once. Spansh is only asked when your own data is more than 5 minutes old, and only used if it is newer.
- Debug log: docking, market, trades at a carrier, transfers and carrier stats are logged with their details.

## 0.9.0

- Exploration → Cartography: what EDSM knows about the system you're in: bodies already reported (and how many were never sent), who discovered the main star, the estimated value with and without mapping, and the most valuable bodies. A system EDSM has never seen is flagged: you may be the first.
- About: a "Report a bug" section with the steps (debug mode, logs folder, GitHub issue pre-filled with your version) and exactly what a log contains and never contains.
- Logs are cleaned automatically, on every line and in every file: no Windows user name or personal folder path, no full IP addresses, no Wi-Fi name, no pairing or wing codes, no long tokens or Frontier ids. API keys and typed text were already never written.
- Colonisation and Synchronisation say they're still in development, like Missions (carrier holds are estimates until the Frontier API connection; Inara hasn't approved EDCH yet).

## 0.8.9

- Colonisation: each carrier (yours and your squadron's) also shows its market as Spansh last saw it, what it sells with its stock and what it buys, with the data's age. EDCH checks again every 5 minutes while the page is open. The "Carriers" column uses the higher of the journal estimate and the stock on sale.
- Inara doesn't let apps read a carrier's hold, so it can't be used for this; the only complete source would be Frontier's own API (Frontier account login), which EDCH doesn't use yet.

## 0.8.8

- Wing: when a member closes EDCH, their EDCH tells the others on its way out (an encrypted "leaving" message prepared in advance, sent even as the window closes). Leaving the wing in game does the same, and EDCH shares again when you join a wing.
- Wing: a notification says when a member closed EDCH, left the wing in game or stopped sharing (can be turned off). Members who left stay shown, greyed out with the reason, for 10 minutes.
- Wing: a member who sends nothing for 45 minutes (crash, PC asleep) is now considered gone, instead of after 2 hours.

## 0.8.7

- Colonisation: the ship's hold is always up to date (EDCH now reads Cargo.json, which the game rewrites after every purchase, sale or delivery; the journal often only gives the total).
- Colonisation: a "Holds" panel shows the ship's hold, your fleet carrier's and your squadron carrier's, side by side, with the goods your construction sites need highlighted, and a "Carriers" column in each site's table.
- A carrier's hold is rebuilt from the journal (ship ↔ carrier transfers, tritium deposited as fuel, purchases and sales on its market), as the game never lists it. Your carrier's total comes from the carrier management screen; what can't be identified is shown as such.

## 0.8.6

- Mobile access: the "PC address" list shows the PC's connections a phone can use, Ethernet, Wi-Fi, Tailscale and VPNs, with the network's name ("Wi-Fi (ASUS)"), and the QR code and the link follow the one you pick. Hyper-V, WSL and other virtual adapters are left out. The Tailscale checkbox is gone: pick the Tailscale address in the list. The "away from home" section moved to the bottom of the page.

- Clickable references: a module name (engineers' specialities, materials' "used in" list, wishlist) opens Engineering on that module; a commodity (missions, recipes) opens the search for where to buy it; a system name is copied, and opens Navigation with it as destination when "Clicking a system also opens Navigation" is ticked in Settings.
- A system clicked on the phone is also copied to the PC's clipboard, ready to paste in the galaxy map.

## 0.8.5

- Turning the local server (mobile access) off and on again no longer fails with "port 47800 unavailable (os error 10048)": the port is now really released when the server stops.
- Error log: warnings and errors also go to a separate `edch-error_….log`, next to the standard log, created only when something goes wrong. The debug log still contains everything.
- Debug log: every action is logged (clicks, settings changed, pages opened), every call to the app's backend with its duration, and phone requests. Errors shown on screen (red lines, red notices, toasts) are logged too. API keys and typed text are never logged.
- Standard log: also records notifications, wing link start/stop, journal archive reading and actions coming from the phone.

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
