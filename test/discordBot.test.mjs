// EDCH-Discord keys as EDCH reads them: which bot, server and member (the signature is the bot's
// to check); anything that isn't such a key, or names a bot without https, is refused.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readBotKey } from "../dist/js/services/discordBot.js";

const payload = (claims) => Buffer.from(JSON.stringify(claims)).toString("base64url");
const key = (claims, signature = "c2lnbmF0dXJl") => `edch1.${payload(claims)}.${signature}`;
const CLAIMS = {
  b: "https://edch-discord.example.workers.dev",
  g: "1200000000000000001",
  c: "1500000000000000001",
  u: "1300000000000000002",
  t: 1_763_000_000,
};

test("bot key: the bot, server and member it names", () => {
  assert.deepEqual(readBotKey(` ${key(CLAIMS)} `), {
    bot: "https://edch-discord.example.workers.dev",
    guildId: "1200000000000000001",
    userId: "1300000000000000002",
    issuedAt: new Date(1_763_000_000_000).toISOString(),
  });
});

test("bot key: other texts, plain http or odd addresses refused", () => {
  assert.equal(readBotKey("hello"), null);
  assert.equal(readBotKey(key(CLAIMS).replace("edch1", "edch2")), null);
  assert.equal(readBotKey(key({ ...CLAIMS, b: "http://bot.example.org" })), null);
  assert.equal(readBotKey(key({ ...CLAIMS, b: "https://bot.example.org/v1?x" })), null);
  assert.equal(readBotKey(key({ ...CLAIMS, g: "server" })), null);
  assert.equal(readBotKey(key(CLAIMS, "not base64!")), null);
});
