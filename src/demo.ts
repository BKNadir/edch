// Sample journal used when the UI runs in a plain browser (no game, no Tauri).

const t = (s: number) => new Date(Date.UTC(2026, 9, 30, 20, 0, s)).toISOString().replace(".000", "");

export const DEMO_EVENTS: Record<string, unknown>[] = [
  { timestamp: t(0), event: "Fileheader", part: 1, language: "French/FR", Odyssey: true, gameversion: "4.2.0", build: "demo" },
  { timestamp: t(1), event: "Commander", FID: "F0000000", Name: "Demo" },
  {
    timestamp: t(2),
    event: "Materials",
    Raw: [
      { Name: "carbon", Count: 212 }, { Name: "iron", Count: 180 }, { Name: "nickel", Count: 140 }, { Name: "vanadium", Count: 97 },
      { Name: "chromium", Count: 75 }, { Name: "zinc", Count: 64 }, { Name: "germanium", Count: 120 }, { Name: "manganese", Count: 33 },
      { Name: "niobium", Count: 41 }, { Name: "tungsten", Count: 12 }, { Name: "polonium", Count: 4 }, { Name: "antimony", Count: 9 },
    ],
    Manufactured: [
      { Name: "protoradiolicalloys", Name_Localised: "Proto Radiolic Alloys", Count: 12 },
      { Name: "improvisedcomponents", Name_Localised: "Improvised Components", Count: 100 },
      { Name: "militarygradealloys", Name_Localised: "Military Grade Alloys", Count: 100 },
      { Name: "protoheatradiators", Name_Localised: "Proto Heat Radiators", Count: 94 },
      { Name: "mechanicalcomponents", Name_Localised: "Mechanical Components", Count: 150 },
      { Name: "configurablecomponents", Name_Localised: "Configurable Components", Count: 88 },
      { Name: "heatexchangers", Name_Localised: "Heat Exchangers", Count: 40 },
      { Name: "chemicalmanipulators", Name_Localised: "Chemical Manipulators", Count: 17 },
      { Name: "focuscrystals", Name_Localised: "Focus Crystals", Count: 52 },
      { Name: "exquisitefocuscrystals", Name_Localised: "Exquisite Focus Crystals", Count: 3 },
    ],
    Encoded: [
      { Name: "shieldpatternanalysis", Name_Localised: "Aberrant Shield Pattern Analysis", Count: 150 },
      { Name: "decodedemissiondata", Name_Localised: "Decoded Emission Data", Count: 120 },
      { Name: "adaptiveencryptors", Name_Localised: "Adaptive Encryptors Capture", Count: 21 },
      { Name: "fsdtelemetry", Name_Localised: "Anomalous FSD Telemetry", Count: 66 },
      { Name: "dataminedwake", Name_Localised: "Datamined Wake Exceptions", Count: 8 },
    ],
  },
  { timestamp: t(3), event: "LoadGame", FID: "F0000000", Commander: "Demo", Odyssey: true, Ship: "krait_mkii", Ship_Localised: "Krait Mk II", ShipName: "Nightjar", ShipIdent: "BK-01", GameMode: "Solo" },
  {
    timestamp: t(4),
    event: "EngineerProgress",
    Engineers: [
      { Engineer: "Felicity Farseer", EngineerID: 300100, Progress: "Unlocked", RankProgress: 0, Rank: 5 },
      { Engineer: "Elvira Martuuk", EngineerID: 300160, Progress: "Unlocked", RankProgress: 0, Rank: 5 },
      { Engineer: "The Dweller", EngineerID: 300180, Progress: "Unlocked", RankProgress: 40, Rank: 3 },
      { Engineer: "Marco Qwent", EngineerID: 300200, Progress: "Invited" },
    ],
  },
  {
    timestamp: t(5),
    event: "Location",
    Docked: true,
    StationName: "Levi-Montalcini Gateway",
    StarSystem: "Timbalderis",
    SystemAddress: 1,
    StarPos: [-41.5, -7.84375, 102.28125],
    SystemAllegiance: "Independent",
    SystemSecurity: "$SYSTEM_SECURITY_medium;",
    SystemSecurity_Localised: "Sécurité moyenne",
    SystemEconomy_Localised: "Industrielle",
    Population: 4_200_000,
    SystemFaction: { Name: "Timbalderis Purple Hand Gang", FactionState: "Boom" },
    Factions: [
      { Name: "Timbalderis Purple Hand Gang", FactionState: "Boom", Influence: 0.41, ActiveStates: [{ State: "Boom" }] },
      { Name: "Independents of Timbalderis", FactionState: "None", Influence: 0.22 },
    ],
  },
  {
    timestamp: t(6),
    event: "ShipLocker",
    Items: [{ Name: "largecapacitypowerregulator", Name_Localised: "Power Regulator", OwnerID: 0, Count: 3 }, { Name: "suitschematic", Count: 2, OwnerID: 0 }],
    Components: [{ Name: "graphene", Count: 24, OwnerID: 0 }, { Name: "aerogel", Count: 11, OwnerID: 0 }, { Name: "circuitboard", Count: 7, OwnerID: 0 }],
    Consumables: [{ Name: "healthpack", Count: 5, OwnerID: 0 }, { Name: "energycell", Count: 4, OwnerID: 0 }],
    Data: [{ Name: "weaponinventory", Count: 6, OwnerID: 0 }, { Name: "topographicalsurveys", Count: 3, OwnerID: 0 }, { Name: "manufacturinginstructions", Count: 2, OwnerID: 0 }],
  },
  { timestamp: t(7), event: "MaterialCollected", Category: "Raw", Name: "polonium", Count: 2 },
  {
    timestamp: t(8),
    event: "Loadout",
    Ship: "krait_mkii",
    ShipID: 7,
    ShipName: "Nightjar",
    ShipIdent: "BK-01",
    UnladenMass: 548.6,
    CargoCapacity: 64,
    MaxJumpRange: 46.2,
    FuelCapacity: { Main: 32, Reserve: 0.63 },
    Modules: [
      { Slot: "FrameShiftDrive", Item: "int_hyperdrive_size5_class5", Engineering: { BlueprintName: "FSD_LongRange", Level: 5, Quality: 1, Engineer: "Felicity Farseer", ExperimentalEffect: "special_fsd_heavy", Modifiers: [{ Label: "FSDOptimalMass", Value: 1692.6, OriginalValue: 1050 }] } },
      { Slot: "TinyHardpoint1", Item: "hpt_shieldbooster_size0_class5", Engineering: { BlueprintName: "ShieldBooster_HeavyDuty", Level: 3, Quality: 0.4 } },
      { Slot: "Slot03_Size5", Item: "int_guardianfsdbooster_size5" },
    ],
  },
  { timestamp: t(9), event: "Cargo", Vessel: "Ship", Count: 12, Inventory: [{ Name: "bromellite", Count: 12 }] },
  { timestamp: t(10), event: "EngineerProgress", Engineer: "Bill Turner", EngineerID: 300010, Progress: "Invited" },
];

export const demoLines = (): string[] => DEMO_EVENTS.map((e) => JSON.stringify(e));
