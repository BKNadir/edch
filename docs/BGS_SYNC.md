# BGS report for a squadron bot

The BGS page keeps what you did for a minor faction (`game/activity/bgs.ts`). EDCH's Discord bot (named **EDCH** in
Discord; its own repository, `edch-discord`), added to a squadron's server, gathers these reports so teammates see each
other's work with `/bgs summary`. EDCH sends them only when the member pasted the key `/bgs link`
gave them and ticked the switch (Sync → Connect to the Discord bot): every 15 minutes, the actions
since the last report that concern the squadron's faction (`features/bgs/botSync.ts`). It is the
only place BGS data leaves the PC in BGS or Invisible mode, by the member's choice.

The bot keeps nothing itself: it writes the reports to the private `#edch-sync` channel of the
squadron's Discord server (admins only), and a readable line per system in `#edch-bgs` (the
`BGS` role). EDCH reaches only the shared bot and a squadron's own bot the member
confirmed (`src-tauri/src/discord_bot.rs`); the key is never written to the logs.

The report is built by `bgsReport()` in `src/features/bgs/report.ts`.

## Format (version 1)

```json
{
  "schema": "edch.bgs.report",
  "version": 1,
  "generatedAt": "2026-11-13T18:00:00.000Z",
  "faction": "Faction name",
  "from": "2026-11-12T15:00:00.000Z",
  "to": "2026-11-13T15:00:00.000Z",
  "app": "0.10.13",
  "actions": [
    { "at": "2026-11-12T16:02:11Z", "kind": "mission", "system": "System", "influence": 3, "credits": 1200000, "against": false },
    { "at": "2026-11-12T16:30:40Z", "kind": "bounty", "system": "System", "credits": 350000, "against": false }
  ]
}
```

- `schema` and `version`: the bot checks them first and ignores a report it doesn't know.
- `from` / `to`: the period covered, `[from, to)` in UTC (for example one BGS day, tick to tick).
- `actions`: oldest first, only those of the faction. `kind` is one of `mission`, `missionFailed`,
  `missionAbandoned`, `bounty`, `combatBond`, `trade`, `blackMarket`, `exploration`, `crime`.
  - `influence`: missions only, the number of "+" the game shows, negative when the mission lowers
    the faction.
  - `credits`: reward, voucher, trade profit or cartography sold; absent for crimes and failures.
  - `against`: the action lowers the faction.

## What is not in it

No commander name, no ship, no position other than the system of each action, no API key. The bot
links a report to a member through its own sign-in, not through the report.
