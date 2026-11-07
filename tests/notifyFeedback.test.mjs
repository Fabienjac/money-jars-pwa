import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { handler, buildEmail } = require("../netlify/functions/notifyFeedback.js")._test;

const env = { FEEDBACK_WEBHOOK_SECRET: "s3cret", RESEND_API_KEY: "re_test", FEEDBACK_NOTIFY_TO: "moi@example.com" };
const record = { category: "bug", message: "L'import <plante>\nsur iPhone", email: "paul@example.com", lang: "fr", created_at: "2026-11-07T10:00:00Z" };
const event = (over = {}) => ({
  httpMethod: "POST",
  headers: { "x-webhook-secret": "s3cret" },
  body: JSON.stringify({ type: "INSERT", table: "feedback", record }),
  ...over,
});

function withEnv(fn) {
  return async () => {
    const saved = { ...process.env };
    Object.assign(process.env, env);
    try { await fn(); } finally {
      for (const k of Object.keys(env)) delete process.env[k];
      Object.assign(process.env, saved);
    }
  };
}

test("buildEmail : catégorie, message échappé en HTML, reply-to", () => {
  const m = buildEmail(record);
  assert.match(m.subject, /^\[Money Jars\] 🐞 Bug : L'import <plante>/);
  assert.ok(m.html.includes("&lt;plante&gt;"));
  assert.ok(!m.html.includes("<plante>"));
  assert.equal(m.replyTo, "paul@example.com");
  assert.equal(buildEmail({ ...record, email: null }).replyTo, undefined);
});

test("secret absent ou faux : refusé, rien n'est envoyé", withEnv(async () => {
  let called = false;
  const spy = async () => { called = true; return { ok: true }; };
  assert.equal((await handler(event({ headers: {} }), spy)).statusCode, 401);
  assert.equal((await handler(event({ headers: { "x-webhook-secret": "faux" } }), spy)).statusCode, 401);
  assert.equal(called, false);
}));

test("envoi : appelle Resend avec le bon destinataire", withEnv(async () => {
  let sent;
  const spy = async (url, init) => { sent = { url, init }; return { ok: true }; };
  const res = await handler(event(), spy);
  assert.equal(res.statusCode, 200);
  assert.equal(sent.url, "https://api.resend.com/emails");
  assert.equal(sent.init.headers.Authorization, "Bearer re_test");
  const body = JSON.parse(sent.init.body);
  assert.deepEqual(body.to, ["moi@example.com"]);
  assert.equal(body.reply_to, "paul@example.com");
}));

test("événements autres qu'INSERT ignorés ; erreur Resend → 502 ; config absente → 500", withEnv(async () => {
  let called = false;
  const spy = async () => { called = true; return { ok: true }; };
  const upd = event({ body: JSON.stringify({ type: "UPDATE", record }) });
  assert.deepEqual(JSON.parse((await handler(upd, spy)).body), { ignored: true });
  assert.equal(called, false);
  const bad = async () => ({ ok: false, status: 422, text: async () => "nope" });
  assert.equal((await handler(event(), bad)).statusCode, 502);
  delete process.env.RESEND_API_KEY;
  assert.equal((await handler(event(), spy)).statusCode, 500);
}));
