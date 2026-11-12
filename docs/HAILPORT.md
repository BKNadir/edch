# EDCH and Hailport

Hailport is a voice assistant for the PC. Programs declare commands,
events and their current state; Hailport understands what the user says, runs the commands and
speaks the answers. EDCH is one of these programs. This page describes EDCH's side; the protocol
itself is Hailport's "integration protocol, version 1" (`INTEGRATION.md` in Hailport's
repository).

## How it is built

| Where | What |
| --- | --- |
| `src-tauri/src/hailport.rs` | The WebSocket to `ws://127.0.0.1:<port>/v1`, from Rust because Hailport refuses web pages (they send an `Origin` header). It only moves messages; it never logs them. Built with the `hailport` Cargo feature (on by default). |
| `src-tauri/src/hailport_off.rs` | The same commands without the feature: they say Hailport isn't offered. The portable exe is built with `--no-default-features`, so it has no WebSocket code (it can't count on Hailport being installed). |
| `src/platform/bridge.ts` | `hailportAvailable`, `hailportConnect`, `hailportSend`, `hailportDisconnect`, `onHailport`. |
| `src/services/hailport/protocol.ts` | The messages, their checks and Hailport's limits (64 KB per message, 4 KB of context or data, 300 characters to speak). |
| `src/services/hailport/client.ts` | The session: hello and approval, the token, `register` then `context` after every `welcome`, commands (long ones answered at once, then a `notify`), and when to connect again (close codes). |
| `src/services/hailport/status.ts` | Where the link stands, for the Settings page. |
| `src/features/hailport/commands.ts` | The commands EDCH declares, and how each one runs. |
| `src/features/hailport/events.ts` | The events (from the live journal) and the context. |
| `src/app/hailport.ts` | Wiring: starts and stops the link with its setting, passes the journal events. |
| `src/views/settings/cards/hailport.ts` | Settings → General: switch, port, state. |
| `src/state/hailportSettings.ts` | `enabled` (off by default) and `port` (47615 by default); the token, kept under its own key. |

## Commands

| Command | Parameters | What it does |
| --- | --- | --- |
| `open_page` | `page` (the menu's pages) | Opens a page. |
| `copy_next_system` | — | Copies the next system of the route in progress. |
| `plot_route` | `destination` | Plots the exact route with Spansh (long: the answer comes as a `notify`). |
| `find_nearest` | `service` (material traders, Interstellar Factors, technology broker…) | Nearest station with that service (long). |
| `material_count` | `material` | How many of a material or Odyssey item you have. |
| `missions_summary` | — | Missions in progress, those ending within the hour, total reward. |
| `colonisation_needs` | — | What the construction sites still need. |
| `set_share_mode` | `mode` (`normal`, `bgs`, `invisible`) | What EDCH shares with EDDN, EDSM and Inara. Asks for a spoken confirmation. |
| `clear_notifications` | — | Clears EDCH's notifications. |

## Events

`docked`, `undocked`, `jump_completed` (with the jumps left of the route), `route_finished`,
`mission_completed`, `mission_expiring` (less than 30 minutes left, told once),
`construction_complete`. `docked`, `route_finished`, `mission_expiring` and
`construction_complete` are suggested for announcing; the user decides in Hailport.

## Context

Location (system, station, docked, body), ship, jump range, fuel, cargo total and capacity, next
system and jumps left, missions in progress, construction sites, sharing mode, whether the game
runs.

## Privacy

- Off by default; nothing is attempted until the user turns it on. Hailport listens on
  127.0.0.1 only.
- Never sent: the commander's name, the wing and its members, API keys, the remote access secret,
  Hailport's token. Hailport may pass what EDCH sends to the online language model the user chose.
- The token is kept apart from the settings (`edch.hailportToken`): it never goes to phones or
  into the logs.
- Logs keep the command names and the link's state, never message contents.

## Languages

Descriptions and spoken texts follow Hailport's language when EDCH has it (en, fr, de, es, pt, ru),
else English. The keys are in the `hailport` namespace of `public/locales/<lang>.json`.
