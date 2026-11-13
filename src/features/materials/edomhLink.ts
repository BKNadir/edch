// EDOMH links: "edomh://edsy/?<data>" and "edomh://coriolis/?<data>", made by EDSY's and
// Coriolis's "Export to EDOMH" buttons for Odyssey Materials Helper. The data is the build's
// engineering as JSON, deflated (zlib) and in URL-safe base64:
//   { version: 1, ship: "smallcombat01_nx", name: "", items: [
//       { item: "int_powerplant_size5_class5", blueprint: "powerplant_boosted", grade: 5,
//         highestGradePercentage: 1 },
//       { item: "hpt_shieldbooster_size0_class5", blueprint: "special_shieldbooster_thermic" } ] }
// An entry without a grade is the experimental effect of the module entry just before it.
// Decoded here into the journal's Loadout shape, so the build importer reads it like any other.

type Json = Record<string, any>;

/** Bounds: a link is a few kilobytes, its JSON a few tens; a ship has well under 100 slots. */
const MAX_LINK_CHARS = 64 * 1024;
const MAX_JSON_BYTES = 512 * 1024;
const MAX_ITEMS = 300;

/** The link's kind ("edsy", "coriolis"…) and data, or null when it isn't an EDOMH link. */
export function parseEdomhLink(text: string): { kind: string; data: string } | null {
  const link = text.trim();
  if (link.length > MAX_LINK_CHARS) return null;
  const match = /^edomh:\/\/([a-z]+)\/?\?([A-Za-z0-9_\-+/=%]+)$/i.exec(link);
  return match ? { kind: match[1].toLowerCase(), data: decodeURIComponent(match[2]) } : null;
}

/** URL-safe base64 → bytes. */
function base64Bytes(data: string): Uint8Array {
  const normal = data.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normal + "===".slice((normal.length + 3) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

/** Inflates zlib data, refusing more than MAX_JSON_BYTES. */
async function inflate(bytes: Uint8Array): Promise<string> {
  const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(new DecompressionStream("deflate"));
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > MAX_JSON_BYTES) {
      await reader.cancel();
      throw new Error("too large");
    }
    chunks.push(value);
  }
  const all = new Uint8Array(size);
  let at = 0;
  for (const chunk of chunks) {
    all.set(chunk, at);
    at += chunk.length;
  }
  return new TextDecoder().decode(all);
}

/**
 * The build of an EDOMH link as a journal Loadout ({ Ship, ShipName, Modules[] with
 * Engineering }), or null when the link isn't one EDCH can read (another kind, broken data).
 */
export async function decodeEdomhLink(text: string): Promise<Json | null> {
  const parsed = parseEdomhLink(text);
  if (!parsed || (parsed.kind !== "edsy" && parsed.kind !== "coriolis")) return null;
  try {
    return edomhToLoadout(JSON.parse(await inflate(base64Bytes(parsed.data))));
  } catch {
    return null;
  }
}

/** The EDOMH build JSON as a journal Loadout (pure, for tests). */
export function edomhToLoadout(build: Json): Json | null {
  if (!build || typeof build !== "object" || !Array.isArray(build.items)) return null;
  const text = (value: unknown) => (typeof value === "string" ? value.slice(0, 120) : "");
  const modules: Json[] = [];
  for (const entry of build.items.slice(0, MAX_ITEMS)) {
    const item = text(entry?.item);
    const blueprint = text(entry?.blueprint);
    if (!item || !blueprint) continue;
    const grade = Number(entry.grade);
    if (Number.isInteger(grade) && grade >= 1 && grade <= 5) {
      modules.push({ Item: item, Slot: "", Engineering: { BlueprintName: blueprint, Level: grade } });
      continue;
    }
    // An experimental effect: it belongs to the module entry just before it.
    const owner = modules.at(-1);
    if (owner && owner.Item === item && !owner.Engineering.ExperimentalEffect)
      owner.Engineering.ExperimentalEffect = blueprint;
    else modules.push({ Item: item, Slot: "", Engineering: { ExperimentalEffect: blueprint } });
  }
  if (!modules.length) return null;
  return { Ship: text(build.ship), ShipName: text(build.name), Modules: modules };
}
