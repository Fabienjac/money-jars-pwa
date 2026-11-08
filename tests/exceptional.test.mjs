import { test } from "node:test";
import assert from "node:assert/strict";
import { loadTs } from "./_load.mjs";

// exceptional.ts importe d'autres modules de src : on le charge via le bundleur de test
const { addTagTo, suggestExceptional } = await loadTs("src/exceptional.ts");

const none = new Set();
let seq = 0;
const row = (date, amount, description = "Courses", tags = "", subscription = "") => ({
  id: ++seq, date, amount, description, tags, subscription,
});

// 20 petites dépenses de 12 € sur les 20 premiers jours de janvier
const base = () => Array.from({ length: 20 }, (_, i) => row(`2026-01-${String(i + 1).padStart(2, "0")}`, 12, `Magasin ${i}`));

test("une grosse dépense isolée est proposée, avec son multiple de la dépense habituelle", () => {
  const rows = [...base(), row("2026-01-12", 480, "Billet avion")];
  const s = suggestExceptional({ rows, extraordinaryTags: none, dismissed: none, today: "2026-01-20" });
  assert.equal(s.length, 1);
  assert.equal(s[0].description, "Billet avion");
  assert.equal(s[0].amount, 480);
  assert.equal(s[0].times, 40);
  assert.equal(s[0].date, "2026-01-12");
});

test("rien d'anormal : aucune proposition", () => {
  assert.deepEqual(suggestExceptional({ rows: base(), extraordinaryTags: none, dismissed: none, today: "2026-01-20" }), []);
});

test("pas assez de données : on ne propose rien (médiane peu fiable)", () => {
  const few = [row("2026-01-02", 10), row("2026-01-03", 10), row("2026-01-20", 900, "Voyage")];
  assert.deepEqual(suggestExceptional({ rows: few, extraordinaryTags: none, dismissed: none, today: "2026-01-20" }), []);
  // assez de lignes mais moins de 14 jours
  const dense = Array.from({ length: 20 }, () => row("2026-01-05", 12));
  dense.push(row("2026-01-06", 900, "Voyage"));
  assert.deepEqual(suggestExceptional({ rows: dense, extraordinaryTags: none, dismissed: none, today: "2026-01-10" }), []);
});

test("déjà étiquetée « exceptionnelle », écartée, abonnement ou libellé régulier : jamais proposée", () => {
  const tagged = row("2026-01-12", 480, "Billet avion", "voyage");
  const dismissed = row("2026-01-13", 500, "Canapé");
  const sub = row("2026-01-14", 600, "Assurance", "", "annuel");
  const rows = [...base(), tagged, dismissed, sub];
  const s = suggestExceptional({
    rows,
    extraordinaryTags: new Set(["voyage"]),
    dismissed: new Set([String(dismissed.id)]),
    today: "2026-01-20",
  });
  assert.deepEqual(s, []);

  // un loyer payé 3 mois différents n'est pas exceptionnel, même s'il est gros
  const rent = ["2026-01-02", "2026-02-02", "2026-03-02"].map((d) => row(d, 800, "Loyer appartement"));
  const more = Array.from({ length: 20 }, (_, i) => row(`2026-03-${String(i + 1).padStart(2, "0")}`, 12, `Shop ${i}`));
  assert.deepEqual(suggestExceptional({ rows: [...rent, ...more], extraordinaryTags: none, dismissed: none, today: "2026-03-20" }), []);
});

test("au plus 3 propositions, les plus grosses d'abord ; seulement l'année en cours et jusqu'à aujourd'hui", () => {
  const rows = [
    ...base(),
    row("2026-01-03", 300, "A"), row("2026-01-04", 700, "B"), row("2026-01-05", 500, "C"), row("2026-01-06", 400, "D"),
    row("2025-12-20", 5000, "Année passée"), // année précédente
    row("2026-01-25", 9000, "Futur"), // après aujourd'hui
  ];
  const s = suggestExceptional({ rows, extraordinaryTags: none, dismissed: none, today: "2026-01-20" });
  assert.deepEqual(s.map((x) => x.description), ["B", "C", "D"]);
});

test("le seuil suit aussi la dépense moyenne par jour : un train de vie élevé relève la barre", () => {
  // médiane 12 (seuil 120) mais beaucoup de grosses dépenses courantes : moyenne par jour haute
  const rows = [...base(), ...Array.from({ length: 6 }, (_, i) => row(`2026-01-${String(i + 2).padStart(2, "0")}`, 400, `Resto ${i}`))];
  const s = suggestExceptional({ rows, extraordinaryTags: none, dismissed: none, today: "2026-01-20" });
  // moyenne/jour = (240 + 2400)/20 = 132 → seuil 396 ; 400 le franchit juste
  assert.equal(s.length, 3);
  const higher = [...rows, row("2026-01-08", 395, "Presque")];
  assert.ok(!suggestExceptional({ rows: higher, extraordinaryTags: none, dismissed: none, today: "2026-01-20" }).some((x) => x.description === "Presque"));
});

test("addTagTo : ajoute sans doublon ni séparateur parasite", () => {
  assert.equal(addTagTo("", "exceptionnel"), "exceptionnel");
  assert.equal(addTagTo(null, "exceptionnel"), "exceptionnel");
  assert.equal(addTagTo("a, b", "exceptionnel"), "a,b,exceptionnel");
  assert.equal(addTagTo("a,exceptionnel", "exceptionnel"), "a,exceptionnel");
});
