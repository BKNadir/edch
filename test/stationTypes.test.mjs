// Station types → the kind of icon shown, from the journal's and Spansh's spellings.

import { test } from "node:test";
import assert from "node:assert/strict";
import { stationKind } from "../dist/js/game/stationTypes.js";

test("station kinds from the journal and from Spansh", () => {
  const cases = [
    ["Coriolis", "coriolis"],
    ["Coriolis Starport", "coriolis"],
    ["Orbis Starport", "orbis"],
    ["Bernal", "ocellus"],
    ["Ocellus Starport", "ocellus"],
    ["Dodec Starport", "dodec"],
    ["AsteroidBase", "asteroidBase"],
    ["Asteroid base", "asteroidBase"],
    ["Outpost", "outpost"],
    ["MegaShip", "megaship"],
    ["Mega ship", "megaship"],
    ["FleetCarrier", "fleetCarrier"],
    ["Drake-Class Carrier", "fleetCarrier"],
    ["SquadronCarrier", "squadronCarrier"],
    ["CraterOutpost", "planetaryOutpost"],
    ["Planetary Outpost", "planetaryOutpost"],
    ["CraterPort", "planetaryPort"],
    ["Planetary Port", "planetaryPort"],
    ["SurfaceStation", "planetaryPort"],
    ["OnFootSettlement", "settlement"],
    ["Odyssey Settlement", "settlement"],
    ["SpaceConstructionDepot", "constructionDepot"],
    ["Planetary Construction Depot", "constructionDepot"],
  ];
  for (const [type, kind] of cases) assert.equal(stationKind(type), kind, type);
  assert.equal(stationKind("Something new"), undefined);
  assert.equal(stationKind(undefined), undefined);
  assert.equal(stationKind(42), undefined);
});
