// Settings of the link to Hailport, the voice assistant (Settings page). The token Hailport gives
// when the user approves EDCH is kept apart from the settings, under its own key: it never goes
// to phones, into the logs, or into what EDCH tells Hailport.

/** Hailport's default port (Hailport → Apps). */
export const DEFAULT_HAILPORT_PORT = 47615;

export interface HailportSettings {
  /** Connect to Hailport while EDCH runs (off by default: nothing is attempted until then). */
  enabled: boolean;
  /** The port Hailport listens on, on this PC (127.0.0.1). */
  port: number;
}

export const DEFAULT_HAILPORT: HailportSettings = {
  enabled: false,
  port: DEFAULT_HAILPORT_PORT,
};

/** A port EDCH accepts for Hailport: a whole number from 1024 to 65535, else the default. */
export function validHailportPort(value: unknown): number {
  const port = Number(value);
  return Number.isInteger(port) && port >= 1024 && port <= 65535 ? port : DEFAULT_HAILPORT_PORT;
}

/** The settings as saved, checked (an old or edited save can't break the link). */
export function validHailportSettings(value: unknown): HailportSettings {
  const saved = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  return { enabled: saved.enabled === true, port: validHailportPort(saved.port ?? DEFAULT_HAILPORT_PORT) };
}

const TOKEN_KEY = "edch.hailportToken";
/** Hailport's tokens: up to 128 characters of A-Z a-z 0-9 - _ (docs/HAILPORT.md). */
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;

/** The token Hailport gave EDCH, if any. */
export function loadHailportToken(): string | undefined {
  try {
    const token = localStorage.getItem(TOKEN_KEY) ?? "";
    return TOKEN_PATTERN.test(token) ? token : undefined;
  } catch {
    return undefined;
  }
}

/** Keeps the token Hailport gave (or forgets it with null). Returns false when it isn't valid. */
export function saveHailportToken(token: string | null): boolean {
  if (token !== null && !TOKEN_PATTERN.test(token)) return false;
  try {
    if (token === null) localStorage.removeItem(TOKEN_KEY);
    else localStorage.setItem(TOKEN_KEY, token);
  } catch {
    /* kept for this session only: Hailport will ask again next time */
  }
  return true;
}
