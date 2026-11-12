// Sample journal used when the UI runs in a plain browser (no game, no Tauri).

/** A time `hours` from now, so demo missions are always running. */
const ahead = (hours: number) => new Date(Date.now() + hours * 3600000).toISOString().replace(/\.\d+Z$/, "Z");

const at = (s: number) => new Date(Date.UTC(2026, 9, 30, 20, 0, s)).toISOString().replace(".000", "");

export const DEMO_EVENTS: Record<string, unknown>[] = [
  {
    timestamp: at(0),
    event: "Fileheader",
    part: 1,
    language: "French/FR",
    Odyssey: true,
    gameversion: "4.2.0",
    build: "demo",
  },
  { timestamp: at(1), event: "Commander", FID: "F0000000", Name: "Demo" },
  {
    timestamp: at(2),
    event: "Materials",
    Raw: [
      { Name: "carbon", Count: 212 },
      { Name: "iron", Count: 180 },
      { Name: "nickel", Count: 140 },
      { Name: "vanadium", Count: 97 },
      { Name: "chromium", Count: 75 },
      { Name: "zinc", Count: 64 },
      { Name: "germanium", Count: 120 },
      { Name: "manganese", Count: 33 },
      { Name: "niobium", Count: 41 },
      { Name: "tungsten", Count: 12 },
      { Name: "polonium", Count: 4 },
      { Name: "antimony", Count: 9 },
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
  {
    timestamp: at(3),
    event: "LoadGame",
    FID: "F0000000",
    Commander: "Demo",
    Odyssey: true,
    Ship: "krait_mkii",
    Ship_Localised: "Krait Mk II",
    ShipName: "Nightjar",
    ShipIdent: "BK-01",
    GameMode: "Solo",
  },
  {
    timestamp: at(4),
    event: "EngineerProgress",
    Engineers: [
      { Engineer: "Felicity Farseer", EngineerID: 300100, Progress: "Unlocked", RankProgress: 0, Rank: 5 },
      { Engineer: "Elvira Martuuk", EngineerID: 300160, Progress: "Unlocked", RankProgress: 0, Rank: 5 },
      { Engineer: "The Dweller", EngineerID: 300180, Progress: "Unlocked", RankProgress: 40, Rank: 3 },
      { Engineer: "Marco Qwent", EngineerID: 300200, Progress: "Invited" },
    ],
  },
  {
    timestamp: at(5),
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
      {
        Name: "Timbalderis Purple Hand Gang",
        FactionState: "Boom",
        Influence: 0.41,
        ActiveStates: [{ State: "Boom" }],
      },
      { Name: "Independents of Timbalderis", FactionState: "None", Influence: 0.22 },
    ],
  },
  {
    timestamp: at(6),
    event: "ShipLocker",
    Items: [
      { Name: "largecapacitypowerregulator", Name_Localised: "Power Regulator", OwnerID: 0, Count: 3 },
      { Name: "suitschematic", Count: 2, OwnerID: 0 },
    ],
    Components: [
      { Name: "graphene", Count: 24, OwnerID: 0 },
      { Name: "aerogel", Count: 11, OwnerID: 0 },
      { Name: "circuitboard", Count: 7, OwnerID: 0 },
    ],
    Consumables: [
      { Name: "healthpack", Count: 5, OwnerID: 0 },
      { Name: "energycell", Count: 4, OwnerID: 0 },
    ],
    Data: [
      { Name: "weaponinventory", Count: 6, OwnerID: 0 },
      { Name: "topographicalsurveys", Count: 3, OwnerID: 0 },
      { Name: "manufacturinginstructions", Count: 2, OwnerID: 0 },
    ],
  },
  { timestamp: at(7), event: "MaterialCollected", Category: "Raw", Name: "polonium", Count: 2 },
  {
    timestamp: at(8),
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
      {
        Slot: "FrameShiftDrive",
        Item: "int_hyperdrive_size5_class5",
        Engineering: {
          BlueprintName: "FSD_LongRange",
          Level: 5,
          Quality: 1,
          Engineer: "Felicity Farseer",
          ExperimentalEffect: "special_fsd_heavy",
          Modifiers: [{ Label: "FSDOptimalMass", Value: 1692.6, OriginalValue: 1050 }],
        },
      },
      {
        Slot: "TinyHardpoint1",
        Item: "hpt_shieldbooster_size0_class5",
        Engineering: { BlueprintName: "ShieldBooster_HeavyDuty", Level: 3, Quality: 0.4 },
      },
      { Slot: "Slot03_Size5", Item: "int_guardianfsdbooster_size5" },
    ],
  },
  { timestamp: at(9), event: "Cargo", Vessel: "Ship", Count: 12, Inventory: [{ Name: "bromellite", Count: 12 }] },
  { timestamp: at(10), event: "EngineerProgress", Engineer: "Bill Turner", EngineerID: 300010, Progress: "Invited" },
  // ---- activity demo (missions, colonisation, goals, exploration, mining, powerplay) ----
  { timestamp: at(100), event: "Powerplay", Power: "Aisling Duval", Rank: 42, Merits: 18450, TimePledged: 2_600_000 },
  { timestamp: at(101), event: "PowerplayMerits", Power: "Aisling Duval", MeritsGained: 320, TotalMerits: 18770 },
  {
    timestamp: at(102),
    event: "MissionAccepted",
    Faction: "Independents of Timbalderis",
    Name: "Mission_Massacre",
    LocalisedName: "Éliminer des pirates de Purple Hand Gang",
    TargetFaction: "Timbalderis Purple Hand Gang",
    KillCount: 24,
    DestinationSystem: "Timbalderis",
    Expiry: ahead(70),
    Wing: false,
    Influence: "++",
    Reward: 9_850_000,
    MissionID: 9001,
  },
  {
    timestamp: at(103),
    event: "MissionAccepted",
    Faction: "Timbalderis Liberals",
    Name: "Mission_Massacre",
    LocalisedName: "Éliminer des pirates de Purple Hand Gang",
    TargetFaction: "Timbalderis Purple Hand Gang",
    KillCount: 18,
    DestinationSystem: "Timbalderis",
    Expiry: ahead(90),
    Wing: false,
    Influence: "+++",
    Reward: 7_400_000,
    MissionID: 9002,
  },
  {
    timestamp: at(104),
    event: "MissionAccepted",
    Faction: "Independents of Timbalderis",
    Name: "Mission_Massacre",
    LocalisedName: "Éliminer des pirates de Purple Hand Gang",
    TargetFaction: "Timbalderis Purple Hand Gang",
    KillCount: 12,
    DestinationSystem: "Timbalderis",
    Expiry: ahead(110),
    Wing: false,
    Influence: "++",
    Reward: 5_100_000,
    MissionID: 9003,
  },
  {
    timestamp: at(105),
    event: "MissionAccepted",
    Faction: "Timbalderis Liberals",
    Name: "Mission_Delivery_Boom_Wing",
    LocalisedName: "Livrer 720 t d'acier (escadrille)",
    Commodity: "$Steel_Name;",
    Commodity_Localised: "Acier",
    Count: 720,
    DestinationSystem: "Kamadhenu",
    DestinationStation: "Velazquez Port",
    Expiry: ahead(4),
    Wing: true,
    Influence: "++",
    Reward: 24_000_000,
    MissionID: 9004,
  },
  {
    timestamp: at(106),
    event: "MissionAccepted",
    Faction: "Independents of Timbalderis",
    Name: "Mission_Collect_Boom",
    LocalisedName: "Apporter 60 t d'or",
    Commodity: "$Gold_Name;",
    Commodity_Localised: "Or",
    Count: 60,
    DestinationSystem: "Timbalderis",
    DestinationStation: "Levi-Montalcini Gateway",
    Expiry: ahead(46),
    Wing: false,
    Reward: 3_900_000,
    MissionID: 9006,
  },
  {
    timestamp: at(106),
    event: "MissionAccepted",
    Faction: "Timbalderis Liberals",
    Name: "Mission_Mining_Boom",
    LocalisedName: "Miner 30 t de painite",
    Commodity: "$Painite_Name;",
    Commodity_Localised: "Painite",
    Count: 30,
    DestinationSystem: "Timbalderis",
    DestinationStation: "Levi-Montalcini Gateway",
    Expiry: ahead(60),
    Wing: false,
    Reward: 12_500_000,
    MissionID: 9007,
  },
  {
    timestamp: at(106),
    event: "MissionAccepted",
    Faction: "Timbalderis Liberals",
    Name: "Mission_Courier",
    LocalisedName: "Transporter des données confidentielles",
    DestinationSystem: "LHS 3447",
    DestinationStation: "Bluford Orbital",
    Expiry: ahead(30),
    Wing: false,
    Reward: 650_000,
    MissionID: 9005,
  },
  ...[...Array(9)].map((_, i) => ({
    timestamp: at(110 + i),
    event: "Bounty",
    Target: "anaconda",
    VictimFaction: "Timbalderis Purple Hand Gang",
    TotalReward: 410_000,
  })),
  // An AX conflict zone: a few scouts, a Glaive and a Cyclops (Thargoids page).
  {
    timestamp: at(119),
    event: "SupercruiseDestinationDrop",
    Type: "$Warzone_TG_High:#index=1;",
    Type_Localised: "Zone de conflit AX [Intensité élevée]",
    Threat: 0,
  },
  ...[80_000, 80_000, 80_000, 4_500_000, 8_000_000].map((reward) => ({
    timestamp: at(119),
    event: "FactionKillBond",
    Reward: reward,
    AwardingFaction: "$faction_PilotsFederation;",
    AwardingFaction_Localised: "Pilots' Federation",
    VictimFaction: "$faction_Thargoid;",
    VictimFaction_Localised: "Thargoids",
  })),
  {
    timestamp: at(120),
    event: "CargoDepot",
    MissionID: 9004,
    UpdateType: "WingUpdate",
    CargoType: "Steel",
    Count: 0,
    ItemsCollected: 340,
    ItemsDelivered: 340,
    TotalItemsToDeliver: 720,
    Progress: 0.47,
  },
  { timestamp: at(121), event: "RedeemVoucher", Type: "bounty", Amount: 3_690_000 },
  {
    timestamp: at(122),
    event: "MarketSell",
    Type: "platinum",
    Count: 80,
    SellPrice: 226_000,
    TotalSale: 18_080_000,
    AvgPricePaid: 0,
  },
  {
    timestamp: at(123),
    event: "Docked",
    StationName: "Orbital Construction Site: Nadir's Reach",
    StarSystem: "Col 285 Sector AB-C c13-4",
    MarketID: 3700000001,
    StationType: "SpaceConstructionDepot",
  },
  {
    timestamp: at(124),
    event: "ColonisationConstructionDepot",
    MarketID: 3700000001,
    ConstructionProgress: 0.38,
    ConstructionComplete: false,
    ConstructionFailed: false,
    ResourcesRequired: [
      { Name: "$Steel_name;", Name_Localised: "Acier", RequiredAmount: 6320, ProvidedAmount: 2900, Payment: 1500 },
      {
        Name: "$Aluminium_name;",
        Name_Localised: "Aluminium",
        RequiredAmount: 7010,
        ProvidedAmount: 3800,
        Payment: 1200,
      },
      {
        Name: "$CMMComposite_name;",
        Name_Localised: "Composite CMM",
        RequiredAmount: 6100,
        ProvidedAmount: 1200,
        Payment: 6500,
      },
      {
        Name: "$CeramicComposites_name;",
        Name_Localised: "Composites céramiques",
        RequiredAmount: 820,
        ProvidedAmount: 820,
        Payment: 1100,
      },
      { Name: "$Polymers_name;", Name_Localised: "Polymères", RequiredAmount: 790, ProvidedAmount: 120, Payment: 700 },
      { Name: "$Water_name;", Name_Localised: "Eau", RequiredAmount: 670, ProvidedAmount: 670, Payment: 600 },
    ],
  },
  {
    timestamp: at(125),
    event: "Cargo",
    Vessel: "Ship",
    Count: 256,
    Inventory: [{ Name: "steel", Count: 256, Stolen: 0 }],
  },
  // Demo fleet carrier: docked, goods transferred, then the carrier management screen.
  {
    timestamp: at(125),
    event: "Docked",
    StationName: "NADIR'S HOPE X9Z-41K",
    StarSystem: "Col 285 Sector AB-C c13-4",
    MarketID: 3709999999,
    StationType: "FleetCarrier",
  },
  {
    timestamp: at(125),
    event: "CargoTransfer",
    Transfers: [
      { Type: "aluminium", Type_Localised: "Aluminium", Count: 1800, Direction: "tocarrier" },
      { Type: "cmmcomposite", Type_Localised: "CMM Composite", Count: 950, Direction: "tocarrier" },
      { Type: "tritium", Type_Localised: "Tritium", Count: 600, Direction: "tocarrier" },
    ],
  },
  {
    timestamp: at(125),
    event: "CarrierStats",
    CarrierID: 3709999999,
    CarrierType: "FleetCarrier",
    Callsign: "X9Z-41K",
    Name: "NADIR'S HOPE",
    SpaceUsage: { TotalCapacity: 25000, Cargo: 3650 },
  },
  { timestamp: at(125), event: "Undocked", StationName: "NADIR'S HOPE X9Z-41K", MarketID: 3709999999 },
  // Demo squadron carrier: some polymers left there (shown when the Colonisation page's box is ticked).
  {
    timestamp: at(125),
    event: "Docked",
    StationName: "ORBITAL GUILD K2D-7QF",
    StarSystem: "Col 285 Sector AB-C c13-4",
    MarketID: 3709999998,
    StationType: "SquadronCarrier",
  },
  {
    timestamp: at(125),
    event: "CargoTransfer",
    Transfers: [{ Type: "polymers", Type_Localised: "Polymers", Count: 400, Direction: "tocarrier" }],
  },
  { timestamp: at(125), event: "Undocked", StationName: "ORBITAL GUILD K2D-7QF", MarketID: 3709999998 },
  {
    timestamp: at(126),
    event: "CommunityGoal",
    CurrentGoals: [
      {
        CGID: 812,
        Title: "Construction de la station Nouvelle Aube",
        SystemName: "HIP 22460",
        MarketName: "Hale's Rest",
        Expiry: ahead(52),
        IsComplete: false,
        CurrentTotal: 182_450_000,
        PlayerContribution: 42_500,
        NumContributors: 6421,
        TopTier: { Name: "Tier 8", Bonus: "" },
        TopRankSize: 10,
        PlayerInTopRank: false,
        TierReached: "Tier 5",
        PlayerPercentileBand: 25,
        Bonus: 25_000_000,
      },
    ],
  },
  {
    timestamp: at(127),
    event: "FSDJump",
    StarSystem: "Synuefe XR-H d11-102",
    SystemAddress: 3549631072611,
    StarPos: [357.34, -49.16, -74.75],
    JumpDist: 42.6,
    ControllingPower: "Aisling Duval",
    PowerplayState: "Fortified",
    Powers: ["Aisling Duval", "Zemina Torval"],
    PowerplayStateControlProgress: 0.62,
    PowerplayStateReinforcement: 4120,
    PowerplayStateUndermining: 870,
    Factions: [],
  },
  {
    timestamp: at(128),
    event: "Scan",
    ScanType: "Detailed",
    BodyName: "Synuefe XR-H d11-102 1 a",
    BodyID: 12,
    StarSystem: "Synuefe XR-H d11-102",
    SystemAddress: 3549631072611,
    PlanetClass: "Rocky body",
    Atmosphere: "thin carbon dioxide atmosphere",
    AtmosphereType: "CarbonDioxide",
    Volcanism: "",
    MassEM: 0.0352,
    Radius: 1820000,
    SurfaceGravity: 1.71,
    SurfaceTemperature: 178.2,
    SurfacePressure: 3200,
    Landable: true,
    TerraformState: "",
    WasDiscovered: true,
    WasMapped: false,
    WasFootfalled: false,
  },
  {
    timestamp: at(129),
    event: "FSSBodySignals",
    BodyName: "Synuefe XR-H d11-102 1 a",
    BodyID: 12,
    SystemAddress: 3549631072611,
    Signals: [{ Type: "$SAA_SignalType_Biological;", Type_Localised: "Biologique", Count: 3 }],
  },
  {
    timestamp: at(130),
    event: "SAAScanComplete",
    BodyName: "Synuefe XR-H d11-102 1 a",
    BodyID: 12,
    SystemAddress: 3549631072611,
    ProbesUsed: 5,
    EfficiencyTarget: 7,
  },
  {
    timestamp: at(131),
    event: "Scan",
    ScanType: "Detailed",
    BodyName: "Synuefe XR-H d11-102 3",
    BodyID: 15,
    StarSystem: "Synuefe XR-H d11-102",
    SystemAddress: 3549631072611,
    PlanetClass: "High metal content body",
    Atmosphere: "",
    Volcanism: "",
    MassEM: 2.1,
    Radius: 7100000,
    SurfaceGravity: 16.7,
    SurfaceTemperature: 412,
    Landable: false,
    TerraformState: "Terraformable",
    WasDiscovered: false,
    WasMapped: false,
  },
  {
    timestamp: at(132),
    event: "Touchdown",
    Body: "Synuefe XR-H d11-102 1 a",
    BodyID: 12,
    SystemAddress: 3549631072611,
    Latitude: 12.3,
    Longitude: -45.1,
  },
  {
    timestamp: at(133),
    event: "ScanOrganic",
    ScanType: "Analyse",
    Genus: "$Codex_Ent_Bacterial_Genus_Name;",
    Genus_Localised: "Bacterium",
    Species: "$Codex_Ent_Bacterial_06_Name;",
    Species_Localised: "Bacterium Alcyoneum",
    SystemAddress: 3549631072611,
    Body: 12,
  },
  {
    timestamp: at(134),
    event: "ScanOrganic",
    ScanType: "Log",
    Genus: "$Codex_Ent_Stratum_Genus_Name;",
    Genus_Localised: "Stratum",
    Species: "$Codex_Ent_Stratum_07_Name;",
    Species_Localised: "Stratum Tectonicas",
    Variant_Localised: "Stratum Tectonicas - Vert",
    SystemAddress: 3549631072611,
    Body: 12,
  },
  { timestamp: at(135), event: "LaunchDrone", Type: "Prospector" },
  {
    timestamp: at(136),
    event: "ProspectedAsteroid",
    Materials: [
      { Name: "Platinum", Proportion: 31.4 },
      { Name: "Painite", Name_Localised: "Painite", Proportion: 9.8 },
      { Name: "Osmium", Proportion: 6.1 },
    ],
    Content: "$AsteroidMaterialContent_High;",
    Content_Localised: "Élevé",
    Remaining: 100,
  },
  { timestamp: at(137), event: "LaunchDrone", Type: "Collection" },
  ...[...Array(6)].map((_, i) => ({
    timestamp: at(138 + i),
    event: "MiningRefined",
    Type: "$platinum_name;",
    Type_Localised: "Platine",
  })),
];

export const demoLines = (): string[] => DEMO_EVENTS.map((e) => JSON.stringify(e));

// Small hand-written .binds sample for the browser demo of the Controls page.
const kb = (action: string, key: string, mod?: string) =>
  `<${action}><Primary Device="Keyboard" Key="${key}">${mod ? `<Modifier Device="Keyboard" Key="${mod}" />` : ""}</Primary><Secondary Device="{NoDevice}" Key="" /></${action}>`;
const dev = (action: string, device: string, key: string, secondary?: [string, string]) =>
  `<${action}><Primary Device="${device}" Key="${key}" /><Secondary Device="${secondary?.[0] ?? "{NoDevice}"}" Key="${secondary?.[1] ?? ""}" /></${action}>`;
const axis = (action: string, device: string, key: string, inverted = false) =>
  `<${action}><Binding Device="${device}" Key="${key}" /><Inverted Value="${inverted ? 1 : 0}" /><Deadzone Value="0.00000000" /></${action}>`;

export const DEMO_BINDS = `﻿<?xml version="1.0" encoding="UTF-8" ?>
<Root PresetName="Custom" MajorVersion="4" MinorVersion="2">
  <KeyboardLayout>fr-FR</KeyboardLayout>
  ${axis("RollAxisRaw", "231D0200", "Joy_XAxis")}
  ${axis("PitchAxisRaw", "231D0200", "Joy_YAxis", true)}
  ${axis("YawAxisRaw", "231D0200", "Joy_RZAxis")}
  ${axis("ThrottleAxis", "231D3201", "Joy_ZAxis")}
  ${dev("PrimaryFire", "231D0200", "Joy_1", ["Mouse", "Mouse_1"])}
  ${dev("SecondaryFire", "231D0200", "Joy_2", ["Mouse", "Mouse_2"])}
  ${dev("CycleNextTarget", "231D0200", "Joy_3")}
  ${dev("SelectHighestThreat", "231D0200", "Joy_4")}
  ${dev("CycleFireGroupNext", "231D0200", "Joy_5")}
  ${dev("DeployHardpointToggle", "231D0200", "Joy_6")}
  ${dev("UseBoostJuice", "231D3201", "Joy_7")}
  ${dev("HyperSuperCombination", "231D3201", "Joy_8")}
  ${dev("IncreaseEnginesPower", "231D0200", "Joy_POV1Up")}
  ${dev("IncreaseWeaponsPower", "231D0200", "Joy_POV1Right")}
  ${dev("IncreaseSystemsPower", "231D0200", "Joy_POV1Left")}
  ${dev("ResetPowerDistribution", "231D0200", "Joy_POV1Down")}
  ${dev("FireChaffLauncher", "231D3201", "Joy_12")}
  ${dev("DeployHeatSink", "231D3201", "Joy_13")}
  ${dev("LandingGearToggle", "231D3201", "Joy_20")}
  ${kb("ForwardKey", "Key_Z")}
  ${kb("BackwardKey", "Key_S")}
  ${kb("LeftThrustButton", "Key_Q")}
  ${kb("RightThrustButton", "Key_D")}
  ${kb("UpThrustButton", "Key_R")}
  ${kb("DownThrustButton", "Key_F")}
  ${kb("UseBoostJuice", "Key_Tab")}
  ${kb("GalaxyMapOpen", "Key_M", "Key_LeftShift")}
  ${kb("SystemMapOpen", "Key_M")}
  ${kb("FocusLeftPanel", "Key_1")}
  ${kb("FocusCommsPanel", "Key_2")}
  ${kb("FocusRadarPanel", "Key_3")}
  ${kb("FocusRightPanel", "Key_4")}
  ${kb("PlayerHUDModeToggle", "Key_Comma")}
  ${kb("ToggleCargoScoop", "Key_Home")}
  ${kb("ShipSpotLightToggle", "Key_L")}
  ${kb("NightVisionToggle", "Key_N")}
  ${kb("HumanoidForwardButton", "Key_Z")}
  ${kb("HumanoidBackwardButton", "Key_S")}
  ${kb("HumanoidSprintButton", "Key_LeftShift")}
  ${kb("HumanoidJumpButton", "Key_Space")}
  ${kb("HumanoidCrouchButton", "Key_C")}
  ${kb("HumanoidSelectPrimaryWeaponButton", "Key_1")}
  ${kb("ToggleDriveAssist", "Key_I")}
  ${dev("BuggyPrimaryFireButton", "Mouse", "Mouse_1")}
  ${axis("MouseReset", "{NoDevice}", "")}
  ${dev("PitchUpButton", "GamePad", "Pad_DPadUp")}
  ${dev("PitchDownButton", "GamePad", "Pad_DPadDown")}
  ${dev("UI_Select", "GamePad", "Pad_A")}
  ${dev("UI_Back", "GamePad", "Pad_B")}
  ${dev("CycleNextSubsystem", "GamePad", "Pad_X")}
  ${dev("TargetWingman0", "GamePad", "Pad_Y")}
  ${dev("UseBoostJuice_Buggy", "GamePad", "Pad_RBumper")}
  ${dev("PrimaryFire_Buggy", "GamePad", "Pos_Pad_RTrigger")}
  ${axis("SteeringAxis", "GamePad", "Pad_LStickX")}
  ${axis("BuggyPitchAxis", "GamePad", "Pad_RStickY")}
  ${dev("HeadLookToggle", "GamePad", "Pad_RThumb")}
  ${dev("FocusLeftPanel_Buggy", "GamePad", "Pad_Back")}
</Root>`;
