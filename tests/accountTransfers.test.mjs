import { test } from "node:test";
import assert from "node:assert/strict";
import { loadTs } from "./_load.mjs";

const { checkAccountTransfer, parseTransferAmount, transferFlows, accountBalance, convertTransferAmount } = await loadTs("src/accountTransfers.ts");

test("contrôle : comptes manquants, même compte (casse et espaces ignorés), montant invalide", () => {
  assert.equal(checkAccountTransfer({ from: "Keystone", to: "Redotpay", amount: 100 }), null);
  assert.equal(checkAccountTransfer({ from: "", to: "Redotpay", amount: 100 }), "empty");
  assert.equal(checkAccountTransfer({ from: "Keystone", to: "   ", amount: 100 }), "empty");
  assert.equal(checkAccountTransfer({ from: "Keystone", to: " KEYSTONE ", amount: 100 }), "sameAccount");
  assert.equal(checkAccountTransfer({ from: "Keystone", to: "Redotpay", amount: 0 }), "amount");
  assert.equal(checkAccountTransfer({ from: "Keystone", to: "Redotpay", amount: -5 }), "amount");
  assert.equal(checkAccountTransfer({ from: "Keystone", to: "Redotpay", amount: NaN }), "amount");
  assert.equal(checkAccountTransfer({ from: "Keystone", to: "Redotpay", amount: 0.004 }), "amount");
});

test("montant saisi : virgule, point, espaces ; le reste est refusé", () => {
  assert.equal(parseTransferAmount("1500"), 1500);
  assert.equal(parseTransferAmount("1 500,50"), 1500.5);
  assert.equal(parseTransferAmount("1500.5"), 1500.5);
  assert.equal(parseTransferAmount("1 500,5"), 1500.5);
  assert.ok(Number.isNaN(parseTransferAmount("")));
  assert.ok(Number.isNaN(parseTransferAmount("abc")));
  assert.ok(Number.isNaN(parseTransferAmount("-5")));
  assert.ok(Number.isNaN(parseTransferAmount("1,2,3")));
});

test("flux : entrées et sorties par compte, casse et espaces ignorés, nom le plus fréquent", () => {
  const flows = transferFlows([
    { from: "Keystone", to: "Redotpay VIRT", amount: 1000 },
    { from: "KEYSTONE", to: "Redotpay VIRT", amount: 500.25 },
    { from: "Keystone ", to: "Revolut", amount: 200 },
    { from: "Revolut", to: "Redotpay  VIRT", amount: 50 },
  ]);
  const by = Object.fromEntries(flows.map((f) => [f.key, f]));
  assert.equal(by["keystone"].out, 1700.25);
  assert.equal(by["keystone"].in, 0);
  assert.equal(by["keystone"].name, "Keystone");
  assert.equal(by["redotpay virt"].in, 1550.25);
  assert.equal(by["revolut"].in, 200);
  assert.equal(by["revolut"].out, 50);
  assert.equal(flows.length, 3);
});

test("flux : virements invalides ignorés (montant ≤ 0, même compte), pas de dérive flottante", () => {
  const flows = transferFlows([
    { from: "A", to: "B", amount: 0.1 },
    { from: "A", to: "B", amount: 0.2 },
    { from: "A", to: "A", amount: 999 },
    { from: "A", to: "B", amount: -50 },
    { from: "A", to: "B", amount: 0 },
  ]);
  const a = flows.find((f) => f.key === "a");
  assert.equal(a.out, 0.3);
  assert.equal(flows.find((f) => f.key === "b").in, 0.3);
  assert.deepEqual(transferFlows([]), []);
});

test("solde d'un compte : reçu + virements reçus − dépensé − virements envoyés", () => {
  // Cas réel : Redotpay reçoit 0 en revenus, dépense 23 762, et a été approvisionné par Keystone
  assert.equal(accountBalance({ received: 0, spent: 23762, transfersIn: 24000 }), 238);
  assert.equal(accountBalance({ received: 30472, spent: 0, transfersOut: 24000 }), 6472);
  assert.equal(accountBalance({ received: 100, spent: 40 }), 60);
  assert.equal(accountBalance({ received: 0.3, spent: 0.1, transfersOut: 0.2 }), 0);
});

test("les virements ne créent ni ne détruisent d'argent : la somme des soldes reste celle sans virement", () => {
  const flows = transferFlows([{ from: "Keystone", to: "Redotpay", amount: 24000 }, { from: "Redotpay", to: "Cash", amount: 150.5 }]);
  const base = { keystone: { received: 30472, spent: 0 }, redotpay: { received: 0, spent: 23762 }, cash: { received: 0, spent: 20 } };
  let withT = 0;
  let without = 0;
  for (const [k, v] of Object.entries(base)) {
    const f = flows.find((x) => x.key === k);
    withT += accountBalance({ ...v, transfersIn: f?.in, transfersOut: f?.out });
    without += accountBalance(v);
  }
  assert.equal(Math.round(withT * 100), Math.round(without * 100));
});

test("virement dans une autre devise : le cours est exigé, la conversion arrondie au centime", () => {
  const base = { from: "Keystone", to: "Redotpay" };
  assert.equal(checkAccountTransfer({ ...base, amount: 500, foreign: true, rate: 0.86 }), null);
  assert.equal(checkAccountTransfer({ ...base, amount: 500, foreign: true, rate: null }), "rate");
  assert.equal(checkAccountTransfer({ ...base, amount: 500, foreign: true }), "rate");
  assert.equal(checkAccountTransfer({ ...base, amount: 500, foreign: true, rate: 0 }), "rate");
  assert.equal(checkAccountTransfer({ ...base, amount: 500, foreign: true, rate: NaN }), "rate");
  assert.equal(checkAccountTransfer({ ...base, amount: 0, foreign: true, rate: 0.86 }), "amount");
  assert.equal(checkAccountTransfer({ ...base, amount: 0.001, foreign: true, rate: 0.5 }), "amount"); // < 1 centime une fois converti
  assert.equal(checkAccountTransfer({ ...base, amount: 500 }), null); // devise de référence : pas de cours
  assert.equal(checkAccountTransfer({ from: "", to: "B", amount: 5, foreign: true, rate: 1 }), "empty"); // les autres contrôles passent d'abord
  assert.equal(convertTransferAmount(472.89, 0.8624), 407.82);
  assert.equal(convertTransferAmount(1000, 0.86), 860);
  assert.equal(convertTransferAmount(0.1, 3), 0.3);
  assert.ok(Number.isNaN(convertTransferAmount(100, null)));
  assert.ok(Number.isNaN(convertTransferAmount(100, 0)));
  assert.ok(Number.isNaN(convertTransferAmount(-1, 0.9)));
});
