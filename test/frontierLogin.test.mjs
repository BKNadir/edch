// The Frontier login's offline part: PKCE secrets, the login page's address, the return link.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  belongsTo,
  challengeOf,
  FRONTIER_REDIRECT_URI,
  loginPageUrl,
  newLogin,
  readReturnLink,
} from "../dist/js/features/frontier/login.js";

test("frontier login: the PKCE challenge is base64url(SHA-256(verifier)) (RFC 7636's example)", async () => {
  assert.equal(
    await challengeOf("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"),
    "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM",
  );
});

test("frontier login: new secrets each time, usable in a URL", async () => {
  const a = await newLogin();
  const b = await newLogin();
  assert.notEqual(a.verifier, b.verifier);
  assert.notEqual(a.state, b.state);
  assert.match(a.verifier, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(a.challenge, await challengeOf(a.verifier));
});

test("frontier login: the login page asks for auth and capi with PKCE, back to the return page", async () => {
  const login = await newLogin();
  const url = new URL(loginPageUrl("client-123", login));
  assert.equal(url.origin + url.pathname, "https://auth.frontierstore.net/auth");
  const p = url.searchParams;
  assert.equal(p.get("client_id"), "client-123");
  assert.equal(p.get("scope"), "auth capi");
  assert.equal(p.get("response_type"), "code");
  assert.equal(p.get("code_challenge"), login.challenge);
  assert.equal(p.get("code_challenge_method"), "S256");
  assert.equal(p.get("state"), login.state);
  assert.equal(p.get("redirect_uri"), FRONTIER_REDIRECT_URI);
  assert.equal(FRONTIER_REDIRECT_URI, "https://bknadir.github.io/edch/auth/");
  // The verifier itself never leaves EDCH before the code comes back.
  assert.ok(!url.href.includes(login.verifier));
});

test("frontier login: only a sane return link of the login under way is taken", async () => {
  const login = await newLogin();
  const back = readReturnLink(`  edch://frontier/?code=abc-123&state=${login.state}\n`);
  assert.deepEqual(back, { code: "abc-123", state: login.state });
  assert.ok(belongsTo(back, login));
  assert.ok(!belongsTo({ code: "abc", state: "someone-else" }, login));
  assert.ok(!belongsTo(back, undefined));
  assert.equal(readReturnLink("edch://frontier?code=a&state=b")?.code, "a");
  assert.equal(readReturnLink("https://bknadir.github.io/edch/auth/?code=a&state=b"), null);
  assert.equal(readReturnLink("edch://frontier/?code=a"), null);
  assert.equal(readReturnLink("edch://frontier/?code=<x>&state=b"), null);
  assert.equal(readReturnLink("edomh://edsy/?code=a&state=b"), null);
});
