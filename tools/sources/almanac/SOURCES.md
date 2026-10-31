# Localized game-name catalogues

These catalogues keep the canonical English display names already published by the
ships, equipment, materials and commodities data domains and add only localized values
carried explicitly by accepted sources. Where a catalogue holds display prose rather
than a name, the owning domain publishes no English for it and all six values are the
source's own.
They are deliberately sparse: absence means that no accepted source carried a value, and
the lookup API returns `null` for that locale rather than treating English as a
translation.

**Six locales are stored: `en`, `de`, `es`, `fr`, `pt` and `ru`.** Several accepted
sources publish more — Italian, Hungarian, Georgian and Simplified Chinese among them —
and those values are deliberately not carried: the project supports those six languages
and no others. That is a decision about this catalogue, not a gap in any source, so
re-deriving a catalogue from its source must drop the other columns again rather than
restore them. Every locale is stored under a bare language tag; a regional or script tag
resolves to its language.

**`pt` is Brazilian Portuguese.** Every accepted source publishes exactly one Portuguese
column and it is the Brazilian one: Odyssey Materials Helper's CSVs and EDSY's
`lang-pt.json` carry Brazilian spellings, EDDI's only populated Portuguese resource file
is `Modules.pt-BR.resx` (its `pt-PT` sibling is an empty stub), and Frontier's own
in-game localisation ships pt-BR and no European Portuguese. Storing it under the bare
tag follows the rule above, so `pt-PT` resolves to Brazilian Portuguese.

## `module-names.jsonc`

- **Acquired:** 2026-08-30 UTC.
- **In-game localisation revision:** none published; the game ships no immutable
  identifier for its localisation tables. The acquired table is the evidence.
- **Derivation:** every current module symbol and English name comes from the four
  `data/ships/modules-*.jsonc` catalogues, which stay authoritative for canonical
  English. Each symbol joins case-insensitively to the in-game module localisation
  identity, which carries a `name`, a `longname` and an `info` string per locale. The
  join is exact and total over the symbols the acquired table covers: every one of them
  resolves. The **unreleased** Large Planetary Vehicle Hangars postdate that table
  (§`data/ships/SOURCES.md`) and are joined to a later observation of the same
  localisation identities instead, acquired 2026-09-02 UTC: it names
  `Int_LargeBuggyBay_Size{2,4,6}_Class3` and their `_Free` twins in all six locales. It
  does not name the Mk II line, whose three records carry English alone.
  - **`longname` is the name taken.** It is the outfitting list's full name and equals
    the canonical English on 1,041 of the symbols, where `name` — the abbreviated panel
    form — equals it on 726. **Both totals were counted over the 1,199-symbol set that
    preceded the removal of the five plain size-8 drives (§`data/ships/SOURCES.md`), and
    are not re-derived here:** the in-game localisation table is not vendored, so whether
    those five sat inside either total cannot be checked from this repository. Read them
    as upper bounds over the current symbol set until the table is re-acquired. `name` is taken
    only where a longname is a template rather than a name, which is the cargo racks,
    fuel tanks and corrosion-resistant racks whose longname carries a capacity.
  - **Aliasing is followed.** A localisation value may be a `$Other_Key;` pointer rather
    than text; roughly three thousand of the keys are. Each is followed to the entry
    holding real text before anything is stored, and a value still carrying a `$` token
    after that is not a name and is rejected.
  - **The `(Free)` grants have no name of their own** — theirs is a template wrapping the
    base module's. Their canonical English is already the base module's, so they share
    its record. This covers the six Vessel Hangar grants and the three unreleased Large
    Planetary Vehicle Hangar grants, observed as "Large Planetary Vehicle Hangar (Free)"
    and its five translations — each the base name plus a rendered marker.
- **The in-game table is authoritative over the EDDI and EDSY joins.** It carries 349
  values absent from those registries and differs from them in 3,135 cells across 324
  distinct record-and-locale pairs: 73 differ only in letter case, 10 only in punctuation
  or accents, and 241 in wording. Many of the last are the game being specific where the
  registries are general — Russian `Двигатели` is `Маневровые двигатели`, Brazilian
  Portuguese `Propulsores` becomes `Propulsores de desempenho melhorado`.
- **The least abbreviated spelling is the one stored**, as it is in
  `material-names.jsonc`. The outfitting panel shortens a label that will not fit, and
  that is a rendering rather than a different translation, so where the panel abbreviates
  the longest unabbreviated spelling available for that module and locale is taken
  instead — the catalogue's own previous value where it had one, otherwise the source's
  other field. French `Laser à impuls.` is stored as `Laser à impulsion`, Russian
  `Разбрас-ль дип. отражателей` as `Разбрасыватель дипольных отражателей`. An
  unabbreviated candidate is rejected when it is so much shorter that it is plainly a
  different label rather than the same one spelled out: German `EGM` does not replace
  `Elektr. Gegenmaßnahmen`. **Ten values remain abbreviated** because no source spells
  them out — the Mk II gravity-optimised thrusters in four locales, the Advanced
  Planetary Approach Suite in three, and three others — and there the alternative is a
  bare `Schubdüsen` or `Propulseurs` that loses what distinguishes the module. The
  unreleased Large Planetary Vehicle Hangar's Russian
  `Крупный гараж для планет. транспорта` joins them: its `планет.` is the only spelling
  observed, and expanding it to match the shipped hangar's `планетарного` would be this
  repository writing the translation rather than reading it.
- **A rendered capacity or grant marker is not a name.** A longname may carry a module's
  own capacity or a `(Free)` marker — `Anti-Korrosions-Frachtgestell (KAP.: 1)` — which
  describes one module rather than naming the family, so it is rejected and the source's
  other field is read instead.
- **One record per canonical English name.** Where the source distinguishes in another
  locale what English spells the same way, the reading most symbols share is stored:
  `Lightweight Alloy` and `Reinforced Alloy` are singular on most hulls and plural on the
  rest, and the singular is kept, which is also the number the English carries.
  `Hatch Breaker Limpet Controller` is specific on most symbols and generic on one, and
  the specific is kept.
  The Anaconda Mk II's five `Mk II Ablative` armour names, read in the Anaconda Mk II
  observation (data/ships/SOURCES.md), differ from the Caspian Explorer's in German,
  Spanish and French. Each reading has one symbol, so no
  reading has a majority, and the Caspian Explorer's record is kept. The Mk II armour
  therefore shows the Caspian Explorer's names in those three locales.
- **Coverage:** complete. Every symbol carries all six locales — but five of those
  values are **constructed rather than read**; see the manual correction below.
- **Manual corrections:** the **Mk II** Large Planetary Vehicle Hangar's five non-English
  names are built, not sourced. Nothing acquired names that unreleased module in any
  locale but English, and rather than leave the lookups answering `null` the repository
  owner chose to form each as the plain hangar's own translation with `Mk II` appended —
  `Großer Planetenfahrzeug-Hangar Mk II`, `Hangar de vehículo planetario Mk II`,
  `Grand hangar des véhicules planétaires Mk II`,
  `Hangar de veículo planetário grande Mk II`,
  `Крупный гараж для планет. транспорта Mk II`. Four locales have a precedent for that
  shape in the shipped Mk II Vessel Hangar and Mk II Cargo Rack, which suffix `Mk II`;
  **German does not** — Frontier writes `Mk-II-Schiffshangar` for the hangar and
  `Frachtgestell für Mk II` for the rack, so the German value here matches neither and is
  the likeliest of the five to be wrong. A real localisation reading on release replaces
  all five; none is evidence of what Frontier publishes.

## `blueprint-names.jsonc`

- **Acquired:** EDSY 2026-08-14 UTC; in-game modification names 2026-08-23 and
  2026-09-13 UTC.
- **EDSY revision:** commit `e446fbe6e4597dea7ab0bd3105b9a36642388040`;
  database version `424009901`, last-modified marker `20260810`.
- **In-game localisation revision:** none published; the game ships no immutable
  identifier for its localisation tables. The acquired table is the evidence.
- **Derivation:** each current key and its English name comes from
  `data/ships/blueprints.jsonc`. Names remain keyed per blueprint because a single
  English phrase can have different grammatical translations for different module
  families. The Frontier symbol joins case-insensitively to the in-game modification
  name table, which supplies every locale for the recipes it names. The rest
  are ids this repository keys separately because their numbers differ, where the game
  offers only the generic recipe's menu entry and so publishes only its name: each takes
  the locales of the generic id it shadows — `AFM_Shielded`, `Refineries_Shielded` and
  the four limpet-controller Shielded recipes from `Misc_Shielded`, the four
  `LightWeight` and four `Reinforced` limpet recipes from `Misc_LightWeight` and
  `Misc_Reinforced`, `MC_Overcharged` from `Weapon_Overcharged`, and `Scanner_LongRange`
  and `Scanner_WideAngle` from `Sensor_LongRange` and `Sensor_WideAngle`. The last three
  of those pairs are the same shadowing `blueprint-journal-names.jsonc` already records,
  where the game writes the generic id for a recipe this repository keys specifically.
  Only the English differs between a shadowing id and its generic: the Almanac's own
  canonical name is kept, as it is for every other blueprint. Where EDSY and the in-game
  table disagree the in-game value is kept, as everywhere else in this repository: it
  differs for ten values across four locales, all of them wording, none of them meaning.
- **Coverage:** complete. Every blueprint carries all six locales.
- **Manual corrections:** two values in the in-game table carry a stray leading or
  trailing ASCII space, marked in the acquired table and removed here so a successful
  lookup is already trimmed like every other catalogue name: French `FSD_FastBoot` (which
  EDSY carries with the same trailing space) and German `Railgun_LongShot`. The
  Portuguese `GuardianModule_Sturdy` and `GuardianWeapon_Sturdy` values carry a literal
  `<br>` line break for the in-game layout, which is stored as a single space.
- **These Mercenary blueprint names come from direct in-game observation:**
  `BeamLaser_Overloaded`, `BurstLaser_Regenerative`, `Cannon_ForceImpact` and
  `SeekerMissileRackLarge_ExposingMissiles` carry all six observed locales. English uses
  the catalogue's short-name style. The other locales keep the observed strings.

## `experimental-effect-names.jsonc`

- **Acquired:** 2026-08-30 UTC.
- **In-game localisation revision:** none published; the game ships no immutable
  identifier for its localisation tables. The acquired table is the evidence.
- **Derivation:** each current key and its English name comes from
  `data/ships/experimental-effects.jsonc`, which stays authoritative for canonical
  English. The Frontier symbol joins to the in-game experimental-effect name table,
  which supplies every locale for all of them. Where it and EDSY disagree, the in-game value
  is kept, as everywhere else in this repository. It supplies six values EDSY does not
  carry — all five non-English `special_super_penetrator` names and the German
  `special_weapon_rateoffire` — and changes two EDSY already carried: German
  `special_regeneration_sequence` is "Regenerationssequenz" (EDSY
  "Regenerierungssequenz") and Brazilian Portuguese `special_lock_breaker` is "Quebra da
  Trava do Alvo" (EDSY "Quebra de Trava de Alvo"). Every other value agrees.
- **The three `_cooled` variants take their base effect's names.**
  `special_feedback_cascade_cooled`, `special_plasma_slug_cooled` and
  `special_super_penetrator_cooled` are pre-engineered rail-gun variants the game does
  not name separately, so the source marks them as carrying the base effect's entry.
  Each takes those values, exactly as a shadowing blueprint id takes its generic's.
- **Coverage:** complete. Every effect carries all six locales.
- **Manual corrections:** the source appends a `†` to every marked cell of the three
  `_cooled` variants above; it is the acquisition's own shadow marker rather than part of
  a name, and is removed here.

## `material-names.jsonc`

- **Acquired:** 2026-08-16 UTC.
- **Odyssey Materials Helper revision:** commit
  `23343c453938e724f317c56e9eb7db0dbfa71f78`.
- **Derivation:** each current symbol and its canonical English name comes
  from the three `data/materials/materials-*.jsonc` catalogues. The lower-cased symbol
  joins directly to the final component of Odyssey Materials Helper's message key in
  `locale/material/horizons/{raw,manufactured,encoded}.csv`; only that row's explicit
  localized columns are copied. The source's English column is not copied because the
  owning materials catalogues remain authoritative for canonical names. The canonical
  English values therefore omit the source's parenthetical Guardian and Thargoid
  category labels where the owning catalogue does; localized columns remain verbatim
  source values.
- **Second source, the in-game material localisation tables**, acquired 2026-08-30 UTC;
  the game publishes no immutable identifier for them, so the acquired table is the
  evidence. It covers every material in all six locales and, as everywhere else in
  this repository, wins where the two disagree. That fills the values Odyssey Materials
  Helper did not carry and restyles others it did: most are the French apostrophe
  (the in-game tables use `'` throughout, as every other catalogue here does, where
  Odyssey Materials Helper uses `’`), the next largest group is Spanish names the helper title-cased
  (`Fragmento Caústico` against the game's `Fragmento cáustico`), and the rest are
  wording.
- **Coverage:** complete. Every material carries all six locales.
- **Manual corrections:** six of the in-game values are the outfitting UI's own
  abbreviations, shortened to fit its widget rather than translated differently —
  `Comp. de destroços Guardian` against the helper's `Componentes de destroços Sentinela
  Guardian`, and likewise for `Guardian_Sentinel_WeaponParts` (French and Brazilian
  Portuguese), `Guardian_TechComponent` (French and Brazilian Portuguese) and
  `HeatConductionWiring` (Spanish). The unabbreviated value is kept in each.
- **`Guardian_Sentinel_WreckageComponents` drops `Sentinel` in every locale**, following
  the owning catalogue's rename (see `data/materials/SOURCES.md`). Its Brazilian
  Portuguese is the one value here taken from neither source verbatim: the in-game table
  abbreviates it to `Comp. de destroços Guardian` to fit the widget, so the whole word is
  kept as it is for the other abbreviated labels above, giving
  `Componentes de destroços Guardian`.

## `micro-resource-names.jsonc`

- **Acquired:** 2026-08-16 UTC.
- **Odyssey Materials Helper revision:** commit
  `23343c453938e724f317c56e9eb7db0dbfa71f78`.
- **Supplemental source:** in-game verification, acquired 2026-08-16 UTC; immutable
  revision unavailable.
- **Derivation:** each current symbol and its canonical English name comes
  from the four `data/materials/micro-resources-*.jsonc` catalogues. The 196 FDevIDs-backed
  records join directly to the final component of Odyssey Materials Helper's message key
  in `locale/material/odyssey/{asset,consumable,data,good}.csv`; only that row's explicit
  localized columns are copied. All but two of the in-game-backed records also have
  rows in Odyssey Materials Helper, the exceptions being `PowerVirus` and
  `SmallCapacityPowerRegulator`. Every in-game-backed record takes the explicit in-game
  `name` values for German, Spanish, French and Russian. In both cases the owning
  catalogue remains authoritative for canonical English names.
- **Second source, the in-game micro-resource localisation tables**, acquired
  2026-08-30 UTC; the game publishes no immutable identifier for them, so the acquired
  table is the evidence. It covers all but one symbol in all six locales and wins where the
  two disagree, on the same footing as the material tables above. That fills every
  remaining value — including the Brazilian Portuguese for `PowerVirus` and
  `SmallCapacityPowerRegulator`, which no registry carries — and restyles others, mostly
  the French apostrophe and the French Powerplay term, which the game
  lower-cases (`Données classifiées de puissance`).
  `PowerMegashipData` is absent from the micro-resource table and appears in the material
  one; its values are taken from there.
- **Coverage:** complete. Every micro resource carries all six locales.
- **Manual corrections:** five in-game values are layout, not names. Four German
  consumables carry a `<br>` inside a compound word that the UI wraps —
  `Energie-<br>zelle`, `Splitter-<br>granate`, `Schild-<br>unterbrecher` and
  `Schild-<br>generator` — and the French `Amm_Grenade_EMP` is abbreviated to
  `Neutralisat. de bouclier` to fit its widget. The whole word is kept in each:
  `Energiezelle`, `Splittergranate`, `Schildunterbrecher`, `Schildgenerator` and
  `Neutralisateur de bouclier`.

## `module-family-names.jsonc`

- **Acquired:** 2026-08-23 UTC.
- **In-game localisation revision:** none published; the game ships no immutable
  identifier for its localisation tables. The acquired table is the evidence.
- **Derivation:** each of the 77 family ids and its canonical English name is projected
  from `data/ships/module-families.jsonc`, whose own derivation is recorded in
  `data/ships/SOURCES.md`. 58 of them are named by an in-game outfitting category, and
  those categories' explicit German, Spanish, French, Brazilian Portuguese and Russian
  labels are copied verbatim. The join is on family identity rather than on English
  string equality, because the English column of the in-game table *is* the canonical
  English name the ships catalogue took from it.
- **Coverage:** English covers every family; the five other locales cover only the
  families the in-game outfitting screen names. The families without a source-backed
  label are: `axMissileRacks`, `axMultiCannons`, `cargoHatches`,
  `causticSinkLaunchers`, `guardianGaussCannons`, `guardianHybridPowerDistributors`,
  `guardianHybridPowerPlants`, `guardianNaniteTorpedoPylons`, `guardianPlasmaChargers`,
  `guardianShardCannons`, `guardianShieldReinforcementPackages`,
  `miningMultiLimpetControllers`, `remoteReleaseFlakLaunchers`,
  `remoteReleaseFlechetteLaunchers`, `shockCannons`, `shutdownFieldNeutralisers`,
  `subSurfaceDisplacementMissiles`, `subSurfaceExtractionMissiles` and `xenoScanners`.
- **Manual corrections:** none.

## `experimental-effect-descriptions.jsonc`

- **Acquired:** 2026-08-30 UTC.
- **In-game localisation revision:** none published; the game ships no immutable
  identifier for its localisation tables. The acquired table is the evidence.
- **Derivation:** each current key comes from
  `data/ships/experimental-effects.jsonc`; the Frontier symbol joins to the in-game
  experimental-effect description table, which supplies every locale for all of them.
  All six values, English included, are the source's verbatim.
- **This catalogue does not project the ships catalogue's `description`.** The two
  answer different questions and are deliberately different strings. An effect's
  `description` in `data/ships/experimental-effects.jsonc` is a mechanical note that
  states what the `modifiers` list cannot — that High Yield Shell deals 50/50
  kinetic/explosive damage with module splash, say — and most effects need no
  such note and carry none. What the game shows a player is display prose that names no
  magnitudes ("Modified munitions that convert a portion of damage to explosive …"), and
  it exists for every effect. Projecting one onto the other would have cost the
  mechanical notes their numbers; storing the display prose here keeps each field doing
  its own job, and the ships catalogue is unchanged.
- **Coverage:** complete. Every effect carries all six locales.
- **Manual corrections:** 26 of the source's descriptions begin with one or more
  bracketed tokens — `[ShieldRegen]`, and `[SnsrBlinding][Heat]` on
  `special_radiant_canister`. A token is byte-identical across all six locales and is
  left untranslated in each, so it is an identifier the game's client consumes rather
  than text meant for a player; the tokens are removed here. The `†` shadow marker
  described under `experimental-effect-names.jsonc` is removed from descriptions too.

## `pre-engineered-variant-names.jsonc`

- **Acquired:** 2026-08-18 UTC; Merc-shop names 2026-08-22, 2026-08-30 and
  2026-09-13 UTC.
- **Derivation:** every compound identity and English name comes from
  `data/ships/pre-engineered.jsonc`. An identity combines the base module symbol,
  blueprint, optional experimental effect and acquisition route. When a variant name
  exactly matches its base module's canonical name, it reuses that record from
  `module-names.jsonc`; each distinct display record is stored once. Fixed reward
  names such as the three `Decorative_*` festive launchers remain canonical English.
- **The Merc-shop rows carry the shop's own names** — the shop
  sells a "Far-Reaching Abrasion Blaster", not an Abrasion Blaster — so they do not reuse
  their base module's record. All six locales are supplied by the repository owner from
  the in-game shop listing; no registry publishes them. The Brazilian Portuguese column
  was acquired 2026-08-30 UTC and agrees byte-for-byte with the five columns already
  stored, which it does not change.
- **A tech-broker unlock may carry an unlock marker**, and some do — see
  `data/ships/SOURCES.md`. Those names are not their base module's, so they do not reuse
  its record. Where the marker is a manufacturer (`Sirius`, `Azimuth`) or a version
  (`V1`) it is not a translatable word, so the localized value is that marker composed
  with the base module's own localized name: German `Suchraketenrampe V1`, Spanish
  `Sirius Lanzamisiles AX`. Composition can only reach as far as the base module does,
  which is why `Frame Shift Drive (SCO) V1` has Brazilian Portuguese and Russian only and
  `Azimuth Enhanced AX Multi-Cannon` lacks Spanish and French: those are the base
  modules' own gaps, not new ones.
- **Six records carry a translation composed in this repository rather than taken from a
  source, and are the only values in `data/i18n/` that are.** They are marked here
  because the rest of this directory is explicit source values, and a reader is entitled
  to know which is which. The game does not publish either phrase in a form this
  repository can join to:
  - The three `Modified` Guardian weapons. Unlike `Sirius`, `Azimuth` and `V1`, `Modified`
    is a translatable word, so it cannot simply be composed with the base module's
    localized name. Each locale's adjective agrees with the base noun it qualifies —
    German `Modifizierter Guardian-Plasmalader` against `Modifizierte Guardian-Gausskanone`,
    Russian `Модифицированная пушка Гаусса` against `Модифицированное осколочное орудие`.
  - The three `Decorative_*` festive launchers. The game does not translate their names,
    so `Festive` and the colour are rendered in each locale and qualify the base module's
    own localized name.

  Replace any of the twelve with a source-backed value the moment one is published.
- **Coverage:** English, Brazilian Portuguese and Russian cover every variant. Ordinary
  names inherit the explicit localized values available for their base
  module; the Merc-shop names carry all six locales. The German, Spanish and French gaps
  that remain are their base modules' own — the SCO drive and the Enhanced AX
  Multi-Cannon carry no value in those locales for composition to build on.
- **Manual corrections:** none.

## `suit-names.jsonc`

- **Acquired:** 2026-09-01 UTC.
- **In-game localisation revision:** none published; the game ships no immutable
  identifier for its localisation tables. The acquired table is the evidence.
- **Derivation:** the four suit families and their canonical English names come from
  `data/equipment/suits.jsonc`, which stays authoritative for canonical English. Each
  family's grade symbols join case-insensitively to the in-game suit localisation
  identity, which carries a `name`, a `longname` and an `info` string per locale. The
  join is exact and total: every grade symbol resolves.
  - **`name` is the value taken.** It is the suit's own name and equals the canonical
    English on all four families.
  - **The manufacturer is not part of the name.** `longname` prefixes one —
    `Remlok Maverick Suit`, `Supratech Artemis Suit`, `Manticore Dominator Suit` — which
    names a Pioneer Supplies listing rather than the suit, so it is rejected the way a
    rendered capacity is in `module-names.jsonc`. The brand is a proper noun the game
    leaves in English in every locale, so composing it back on costs nothing but the
    name it would displace.
- **A suit is named per family, not per grade.** Every grade of a family carries
  byte-identical values in all six locales, so one record is stored per family and
  `nameKeys` maps the family id and every grade symbol onto it. Both forms a consumer
  holds therefore resolve: `Suit.family` and the `utilitysuit_class3` a journal line
  writes. The flight suit has a single grade whose symbol *is* the family id, so it
  contributes one identifier where the other families contribute their family id and
  each grade symbol.
- **Coverage:** complete. Every identifier carries all six locales.
- **Two suits are not stored**, because `data/equipment/suits.jsonc` does not carry them:
  the five `specialistsuit_class{1..5}` grades, which the source does name
  (`Specialist Suit`, listed as `Remlok Paragon Specialist Suit`), and `hyperspacesuit`,
  which carries no text at all. Storing a name for equipment no catalogue owns would
  leave a lookup answering for something the library cannot otherwise describe.
- **Manual corrections:** none.

## `suit-descriptions.jsonc`

- **Acquired:** 2026-09-01 UTC.
- **In-game localisation revision:** none published; the game ships no immutable
  identifier for its localisation tables. The acquired table is the evidence.
- **Derivation:** the same four families and the same identifier set as
  `suit-names.jsonc`, joined to the `info` string of the in-game suit localisation
  identity. All six values, English included, are the source's verbatim: the owning
  catalogue publishes no description for a suit, so there is no canonical English here
  to be authoritative for.
- **This is display prose, not the suit's stats.** `data/equipment/suits.jsonc` answers
  what a suit does — shield strength, battery capacity, both resistance sets — and the
  description answers what it is for, naming no figure at all. Neither is projected onto
  the other.
- **Coverage:** complete. Every identifier carries all six locales, and every grade of a
  family shares its record exactly as in `suit-names.jsonc`.
- **The Specialist Suit grades carry no description at all**, which is a second reason
  they are absent here beyond the owning catalogue not carrying them.
- **Manual corrections:** none. The English keeps the source's own mixed apostrophes
  (`Manticore's`, `a user’s`); they are the game's prose and are stored as published.

## `personal-weapon-descriptions.jsonc`

- **Acquired:** 2026-09-01 UTC.
- **In-game localisation revision:** none published; the game ships no immutable
  identifier for its localisation tables. The acquired table is the evidence.
- **Derivation:** every current weapon symbol comes from `data/equipment/weapons.jsonc`.
  Each joins case-insensitively to the in-game weapon localisation identity and takes its
  `info` string; the join is exact and total. All six values, English included, are the
  source's verbatim, because the owning catalogue publishes no weapon description.
- **No sibling name catalogue exists**, and that is a decision rather than a gap — see
  §Names this repository deliberately does not localize.
- **Coverage:** complete. Every weapon carries all six locales.
- **Two entries the source carries are not stored:** `wpn_h_launcher_rocket_sauto`
  (`Karma HL-9`), the heavy rocket launcher no current catalogue owns, and
  `wpn_m_submachinegun_kinetic_burst`, which the table lists with no text at all.
- **Manual corrections:** none.

## `personal-modification-names.jsonc`

- **Acquired:** 2026-09-01 UTC.
- **In-game localisation revision:** none published; the game ships no immutable
  identifier for its localisation tables. The acquired table is the evidence.
- **Derivation:** every recipe symbol and its canonical English name comes from
  `data/equipment/modifications.jsonc`, which stays authoritative for canonical English.
  A symbol joins case-insensitively to the in-game modification identity as
  `humanoidmod_<symbol>`, which carries a `name` and a `description` per locale.
- **The nine technology-specific recipes share the entry the game publishes.** Greater
  Range, Headshot Damage and Improved Hip Fire Accuracy are one engineering option each
  in game; this repository keys the Kinetic, Laser and Plasma recipes separately because
  their material costs differ (§`data/equipment/SOURCES.md`). The `_kinetic`, `_laser`
  and `_plasma` suffix is dropped before the join, so each of the three takes its generic
  entry's locales — exactly as a shadowing blueprint id takes its generic's in
  `blueprint-names.jsonc`. A smaller set of source entries therefore covers every recipe,
  and the catalogue stores them once each: `nameKeys` maps a recipe symbol onto the entry the
  game publishes, as `module-names.jsonc` maps a module symbol onto a shared name.
- **That shape is about visibility, not bytes.** Storing each shared entry three times
  instead costs about the same, because the duplicate name records weigh roughly what
  the `nameKeys` map does; the descriptions save about a fifteenth. What the
  deduplicated form buys is that the sharing is stated in the data, rather than sitting in
  six duplicate records a later edit could silently pull apart.
- **`Headshot Damage` is the one English value the game spells differently.** The in-game
  menu reads `Headshot damage`; the owning catalogue's canonical `Headshot Damage` is
  kept, as canonical English is kept everywhere in this directory. The lower-case
  `Stowed reloading` the owning catalogue already carries *is* the game's own spelling
  and agrees with it.
- **Coverage:** complete. Every recipe carries all six locales.
- **One in-game modification is not stored:** `humanoidmod_suit_headshotresistance`
  (`Increased Helmet Protection`), which `data/equipment/modifications.jsonc` does not
  carry as a recipe.
- **Manual corrections:** two German names are the engineering panel's own layout rather
  than translations. `Kampf-Bewegungs-geschwindigkeit` and `Geräusch-unterdrückung` break
  a compound word mid-noun, leaving a lower-case second half no German spelling has. The
  whole word is kept in each, as it is for the wrapped consumables in
  `micro-resource-names.jsonc`: `Kampfbewegungsgeschwindigkeit` and
  `Geräuschunterdrückung`.

## `personal-modification-descriptions.jsonc`

- **Acquired:** 2026-09-01 UTC.
- **In-game localisation revision:** none published; the game ships no immutable
  identifier for its localisation tables. The acquired table is the evidence.
- **Derivation:** the same recipe symbols as `personal-modification-names.jsonc`,
  joined the same way and sharing the generic entry across the nine technology-specific
  recipes for the same reason. Each takes the identity's `description` string. All six
  values, English included, are the source's verbatim.
- **This is display prose, not the recipe's magnitudes.** The game says a modification
  "allows more ammo to be carried for each weapon" and never how much more; the
  `modifiers` list in `data/equipment/modifications.jsonc` is what states the multiplier,
  and the two are deliberately different strings. It is also the only account of the ten
  recipes whose `modifiers` list is empty — some switch a capability on, the rest move a
  stat the panel puts no number on (§`data/equipment/SOURCES.md`).
- **Coverage:** complete. Every recipe carries all six locales.
- **Manual corrections:** none. The French
  `weapon_backpackreloading` description keeps the non-breaking space the source sets
  between a figure and its unit (`5 secondes`), which is French typography rather than
  layout.

## `personal-tool-names.jsonc`

- **Acquired:** 2026-09-03 UTC.
- **In-game localisation revision:** none published; the game ships no immutable
  identifier for its localisation tables. The acquired table is the evidence.
- **Derivation:** every tool id and its canonical English name comes from
  `data/equipment/tools.jsonc`, which stays authoritative for canonical English. Each id
  joins by name to the tool's row in the in-game localisation table, which carries a
  `name` per locale. The join is exact and total: every id resolves, and every row's
  English `name` equals the canonical English.
- **The library id is the only key.** The localisation table keys a tool row by an
  internal identity no journal field carries (§`data/equipment/SOURCES.md`), so a
  consumer never holds one and it is not stored. The library id is the single identifier
  both `getPersonalToolName` and `getPersonalToolById` take, and a second key set would
  let one of the two answer where the other cannot.
- **A value equal to the English is the game's own.** The game leaves `Arc Cutter` in
  English in German, Spanish, French and Brazilian Portuguese, and `Genetic Sampler` in
  German; Russian translates both. Storing them verbatim is what the sparse contract
  requires: the lookup answers with a source value and never manufactures an English
  fallback.
- **Coverage:** complete. Every tool carries all six locales.
- **Manual corrections:** none.

## `commodity-names.jsonc`

- **Acquired:** 2026-09-03 UTC.
- **In-game localisation revision:** none published; the game ships no immutable
  identifier for its localisation tables. The acquired table is the evidence.
- **Derivation:** every symbol and canonical English name comes from
  `data/commodities/commodities.jsonc` and `rare-commodities.jsonc`, which stay
  authoritative for canonical English. Each symbol joins case-insensitively to the
  in-game commodity localisation identity, which carries a `name` and an `info` string
  per locale. `name` is the value taken. The join is exact and total: every commodity the
  two catalogues hold resolves. The game also names commodity units no catalogue here
  carries (§`data/commodities/SOURCES.md`); a name with no owning record is not stored,
  so the key set is the catalogues' and not the game's.
- **Standard and rare share one catalogue here**, because they share one symbol space
  and the game names them from one table.
- **The owning catalogues win the six English disagreements**, as this file's opening
  rule requires. The game's English name is the shorter or the differently cased
  spelling in all but the last of them: `Drones` keeps `Limpets` against `Limpet`,
  `LowTemperatureDiamond` keeps `Low Temperature Diamonds` against
  `Low Temp. Diamonds`, `AerialEdenApple`,
  `WatersOfShintara` and `HIPOrganophosphates` keep their `of`, `of` and `HIP` against
  `Of`, `Of` and `Hip`, and `ThargoidPod` keeps `Xenobiological Prison Pod` against
  `Thargoid Bio-storage Capsule`. The last is a different name rather than a different
  spelling, and it is the one to revisit first if the owning catalogue is ever re-derived
  from the game.
- **Nine stored non-English values are the game's own abbreviations** — the German
  `Fortschr. Katalysatoren` and `Histor. Kamorin-Waffen`, the Spanish
  `Interconect. de eyector térmico` and `Conductos de transf. de energía`, the French
  `Sys. surveillance animale`, `Sys. enrichissement sols` and
  `Interconnexion dissipateur therm.`, and the Russian
  `Агенты нервно-паралит. действия` and `Детали оборон. беспилотников` — and they stay
  abbreviated because no source spells them out. This is the same position
  `module-names.jsonc` records for its own abbreviated labels. The English `H.E. Suits`
  is not one of them: it is the owning catalogue's own name.
- **Coverage:** complete. Every commodity carries all six locales, and no commodity has
  five non-English values all byte-identical to its English, so no commodity name is a
  proper noun the game leaves alone.
- **The registry's `info` prose is not stored.** Each commodity also carries an `info`
  string per locale — the market panel's production, consumption and description text. A
  commodity description catalogue would take those six values verbatim, the way
  `suit-descriptions.jsonc` does; none exists, so the prose is absent rather than
  partial.
- **Manual corrections:** one. The Spanish `BuckyballBeerMats` is published as
  `"Posavasos Buckyball "` with a trailing space, which is layout and not part of the
  name; it is stored trimmed. Every other value is verbatim.

## `codex-region-names.jsonc`

- **Acquired:** 2026-09-10 UTC.
- **In-game localisation revision:** none published; the game ships no immutable
  identifier for its localisation tables. The acquired table is the evidence, and its
  SHA-256 is
  `b280c66219b2fc6d6e92120f013247fdd2404a8a7614e59c0d79a23f300ae51e`.
- **Derivation:** every region id and canonical English name comes from
  `data/astro/galactic-regions.jsonc`, which stays authoritative for the id set. Each id
  joins to the in-game codex localisation identity `$Codex_RegionName_<id>;`, which
  carries one name per locale. The join is exact and total: every region resolves, and
  the acquired table names no region the astro catalogue does not carry.
- **The catalogue is keyed by the region id, not by the English name.** The id is the
  region's stable identity and the name is the value being translated, so a corrected
  English name cannot orphan its translations. The correction below is the reason
  this matters rather than a hypothetical.
- **The game wins the one English disagreement, against this file's opening rule.** The
  astro catalogue's region names are transcribed from EliteDangerousRegionMap's
  `RegionMap.png`, which reads the game's own codex names rather than naming the regions
  itself, so it is not an independent authority the way a ships or commodities catalogue
  is. The game's English is `The Formidine Rift`; German, Portuguese and Russian repeat
  it, Spanish drops the article and French translates the name. The transcription dropped
  the article, and The Veils, The Conduit, The Abyss and The Void all keep theirs
  upstream. The astro catalogue is corrected to the game's English
  (§`data/astro/SOURCES.md`) and the two agree on every other region.
- **Coverage:** complete. Every region carries all six locales. French translates most of
  the regions; German, Spanish, Portuguese and Russian translate few and otherwise carry
  the English name, which is the game's own value and not a fallback this project
  manufactured. Izanami, Temple, Mare Somnia, Xibalba and Tenebrae are spelled alike in
  all six, so those are proper nouns the game leaves alone.
- **Some differences look like defects and are the source's own values.** A locale that
  carries the English name does not always carry it byte for byte:
  - **The possessive apostrophe is mixed.** Newton's Vault, Aquila's Halo, Lyra's Song and
    Kepler's Crest carry `U+2019` in German, Spanish, Portuguese and Russian, against the
    English `U+0027`. This is the position `suit-descriptions.jsonc` already records for
    its own mixed apostrophes.
  - **Achilles's Altar differs by the possessive as well as the glyph.** German, Spanish,
    Portuguese and Russian carry `Achilles’ Altar` — `U+2019` and no trailing `s` —
    against the English `Achilles's Altar`.
  - **Russian carries `Ori-Cygnus Arm` for Orion-Cygnus Arm.** It is the game's string,
    and nothing here expands it.
  A fixture pins one of each, so normalising them fails a test rather than changing the
  data quietly.
- **The acquired table's region grid is not stored, because this repository already has
  it.** The table carries a run-length region raster and a per-region border polygon
  beside the names. The raster reproduces `data/astro/galactic-region-cells.jsonc`
  cell for cell — the same region ids over the same 2048-by-2048 grid, with the same
  projection — and the borders are that raster's own outline, traced on cell edges and
  quantised to 1/32 light year against the cells' 1/64. Neither carries a fact the cells
  do not, so importing either would be a second copy of one geometry. Re-deriving this
  catalogue must take the names alone.
- **The `$Codex_RegionName_<id>;` keys are not stored, and that is a decision rather than
  a gap.** The key states the region id inside its own name, so a journal `CodexEntry`
  yields the id by reading the number out of the key. A key column would restate what the
  key already carries, and would have to be re-derived every time this catalogue is.
  Storing the id alone is the smaller record.
- **Manual corrections:** none. Every value is stored verbatim.

## Names this repository deliberately does not localize

No catalogues are stored for the following names, either because the game does not
translate them — storing English under five more keys would say otherwise — or because no
record in this repository is keyed by them.

- **Ship names and manufacturers.** Odyssey Materials Helper and EDSY each publish a
  per-locale ship column, and every value either one publishes is byte-for-byte the
  canonical English name: a hull name is a proper noun the game leaves alone, and so is
  a manufacturer's. No source publishes a localized manufacturer label at all.
  `data/ships/ships.jsonc` is the one place to read both strings.
- **Engineering-group labels.** An engineering group is this repository's own partition
  of the modules that share one menu; the game heads that menu with the module's
  outfitting family and publishes no group label of its own. EDSY's `mtype-*` values are
  outfitting labels reached by a name join and disagree with
  `module-family-names.jsonc` in 22 places on wording. A group therefore
  carries no name at all — see the header of `data/ships/engineering-options.jsonc` — and
  a consumer names one by joining a module's `familyId` to `module-family-names.jsonc`.
- **Handheld personal-weapon names.** The in-game weapon localisation table publishes all
  six locales for every weapon, and every non-English value
  is byte-for-byte the English: `Karma P-15`, `TK Aphelion` and `Manticore Executioner`
  are product names the game leaves alone, exactly as it does a hull's. `PersonalWeapon`
  in `data/equipment/weapons.jsonc` is the one place to read the name; the weapons'
  *descriptions* are prose and are localized, in `personal-weapon-descriptions.jsonc`.
- **Personal-equipment manufacturers.** `Supratech`, `Remlok`, `Manticore` and
  `Kinematic Armaments` are byte-for-byte identical in all six locales wherever the game
  names them, which is why `suit-names.jsonc` stores a suit's own name and not the
  outfitting list's manufacturer-prefixed listing.
- **Suit and weapon stat labels, the on-foot loadout panel's rows other than the weapon
  mounts, and engineer dialogue.** These are the second reason rather than the first: the
  game does publish all six locales for each, and none of them names a record in any
  catalogue here. A stat label names a field of `Suit` or `PersonalWeapon`, a panel row
  names a line of the on-foot loadout screen, and an engineer's line is spoken flavour
  attached to an offer. Storing them would mean inventing keys this repository does not
  otherwise own, so a consumer that needs a field label supplies its own. The weapon-mount
  rows are outside this conclusion: `Suit.mounts` carries Frontier's own journal
  `SlotName` for each one, so a mount row names a record this repository holds and its
  localization is a gap rather than an invented key. **The slot and restriction labels
  are a separate gap**: no source translates them at all. §Known gaps records both.

## Known gaps

Localized coverage follows the accepted sources and is not complete for every catalogue or
stored locale. A language absent from every catalogue is the locale decision
recorded above rather than a gap. The accepted sources carry only canonical English for
the outfitting-family labels listed above, slot and restriction labels, the suit
weapon-mount labels, fixed reward names, and structured loadout, calculation, SLEF and
edit messages. An accepted source that publishes the missing values closes each of
those gaps, except the last: the structured messages are this library's own English
text, which no source publishes.

Every suit, handheld weapon, tool and modification the personal-equipment catalogues
hold is complete in all six locales. That area carries these gaps:

- **The suit weapon-mount labels are English only.** The game publishes all six locales
  for them, so the values exist to be read. A reading of the in-game localisation table
  for the five non-English locales closes it.
