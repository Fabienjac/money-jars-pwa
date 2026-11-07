import { test } from "node:test";
import assert from "node:assert/strict";
import { classifySupport, urlBase64ToUint8Array } from "../src/pushSupport.ts";

const base = { hasKey: true, hasServiceWorker: true, hasPushManager: true, hasNotification: true, isIOS: false, isStandalone: false };

test("support : clé absente = fonction non configurée, quel que soit l'appareil", () => {
  assert.equal(classifySupport({ ...base, hasKey: false }), "not-configured");
});

test("support : navigateur complet = ok ; iPhone dans Safari (sans PushManager) = installer l'app ; ailleurs = non géré", () => {
  assert.equal(classifySupport(base), "ok");
  assert.equal(classifySupport({ ...base, hasPushManager: false, isIOS: true, isStandalone: false }), "needs-install");
  assert.equal(classifySupport({ ...base, isIOS: true, isStandalone: true }), "ok");
  assert.equal(classifySupport({ ...base, hasPushManager: false }), "unsupported");
  assert.equal(classifySupport({ ...base, hasServiceWorker: false, isIOS: true, isStandalone: true }), "unsupported");
});

test("clé VAPID base64url → octets (alphabet URL, remplissage manquant)", () => {
  // « ??>> » en base64 classique = "Pz8+Pg==" ; en base64url sans remplissage = "Pz8-Pg"
  assert.deepEqual([...urlBase64ToUint8Array("Pz8-Pg")], [63, 63, 62, 62]);
  assert.deepEqual([...urlBase64ToUint8Array("Pz8-Pg==")], [63, 63, 62, 62]);
  assert.equal(urlBase64ToUint8Array("").length, 0);
});
