// The Frontier login (OAuth2 with PKCE), the part that needs no network: the one-time secrets of
// a login, the address of Frontier's login page, and reading the return link. Frontier sends the
// player to EDCH's return page (GitHub Pages, branch gh-pages), which opens an edch:// link with
// a one-time code; EDCH then trades the code for the player's tokens (services, once Frontier has
// activated EDCH's client).
//
// PKCE: EDCH proves it started the login with a secret it kept (the verifier) instead of a
// client secret, which an app on the player's PC couldn't keep. Only the Client ID is needed.

/** Frontier's login page. */
export const FRONTIER_AUTH_URL = "https://auth.frontierstore.net/auth";
/** Where Frontier sends the player back: exactly the address registered in the Developer Zone. */
export const FRONTIER_REDIRECT_URI = "https://bknadir.github.io/edch/auth/";
/** What EDCH asks for: who the player is, and the Companion API (commander, fleet carrier). */
export const FRONTIER_SCOPE = "auth capi";

/** A login under way: its secrets live only in memory, for this login only. */
export interface PendingLogin {
  /** The PKCE secret, sent with the code to prove the login is EDCH's. */
  verifier: string;
  /** Its SHA-256, sent to Frontier at the start. */
  challenge: string;
  /** A random value Frontier sends back, so a link EDCH didn't ask for is refused. */
  state: string;
}

/** What the return link carries. */
export interface LoginReturn {
  code: string;
  state: string;
}

/** Bytes as base64url without padding (what PKCE uses). */
function base64Url(bytes: Uint8Array): string {
  let text = "";
  for (const byte of bytes) text += String.fromCharCode(byte);
  return btoa(text).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** `length` random bytes as base64url. */
function randomText(length: number): string {
  return base64Url(crypto.getRandomValues(new Uint8Array(length)));
}

/** The PKCE challenge of a verifier: base64url(SHA-256(verifier)). */
export async function challengeOf(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return base64Url(new Uint8Array(digest));
}

/** New secrets for a login. */
export async function newLogin(): Promise<PendingLogin> {
  // 32 random bytes: a 43-character verifier, the shortest PKCE allows and plenty.
  const verifier = randomText(32);
  return { verifier, challenge: await challengeOf(verifier), state: randomText(24) };
}

/** The address of Frontier's login page for `login`, opened in the player's browser. */
export function loginPageUrl(clientId: string, login: PendingLogin): string {
  const params = new URLSearchParams({
    audience: "all",
    scope: FRONTIER_SCOPE,
    response_type: "code",
    client_id: clientId,
    code_challenge: login.challenge,
    code_challenge_method: "S256",
    state: login.state,
    redirect_uri: FRONTIER_REDIRECT_URI,
  });
  return `${FRONTIER_AUTH_URL}?${params.toString()}`;
}

/** What a code or state looks like (the return page lets nothing else through either). */
const SANE = /^[A-Za-z0-9._~-]{1,512}$/;

/**
 * The code and state of a return link (`edch://frontier/?code=…&state=…`), opened by the return
 * page or pasted by the player; null for anything else.
 */
export function readReturnLink(text: string): LoginReturn | null {
  const link = text.trim();
  const match = /^edch:\/\/frontier\/?\?(.*)$/i.exec(link);
  if (!match) return null;
  const params = new URLSearchParams(match[1]);
  const code = params.get("code") ?? "";
  const state = params.get("state") ?? "";
  return SANE.test(code) && SANE.test(state) ? { code, state } : null;
}

/** Whether a return belongs to the login under way (a link EDCH didn't ask for is refused). */
export function belongsTo(back: LoginReturn, login: PendingLogin | undefined): boolean {
  return login !== undefined && back.state === login.state;
}
