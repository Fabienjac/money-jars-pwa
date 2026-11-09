import { test } from "node:test";
import assert from "node:assert/strict";
import { loadTs } from "./_load.mjs";

const { legalDoc, LEGAL_IDS } = await loadTs("src/legalContent.ts");

const blank = { publisherName: "", legalForm: "", address: "", registration: "", director: "", contactEmail: "", vatNote: "", mediator: "", updated: "2026-11-09" };
const full = { publisherName: "Effivital", legalForm: "association loi 1901", address: "1 rue Test, 75000 Paris", registration: "RNA W000000000", director: "A. Martin", contactEmail: "contact@example.org", vatNote: "TTC", mediator: "CM2C (cm2c.net)", updated: "2026-11-09" };

test("trois documents, chacun avec un titre et des sections non vides, en français comme en anglais", () => {
  assert.deepEqual([...LEGAL_IDS].sort(), ["cgv", "confidentialite", "mentions-legales"]);
  for (const lang of ["fr", "en"]) {
    for (const id of LEGAL_IDS) {
      const d = legalDoc(id, lang, full);
      assert.equal(d.id, id);
      assert.ok(d.title.length > 3);
      assert.ok(d.sections.length >= 4, `${lang}/${id}`);
      for (const s of d.sections) {
        assert.ok(s.h.length > 0);
        assert.ok(s.p.length > 0, `${lang}/${id}/${s.h} sans paragraphe`);
        for (const p of s.p) assert.ok(p.trim().length > 0 && !/undefined|\[object/.test(p), `${lang}/${id}/${s.h}`);
      }
    }
  }
});

test("le français et l'anglais ont la même structure (mêmes sections, même nombre de paragraphes)", () => {
  for (const id of LEGAL_IDS) {
    const fr = legalDoc(id, "fr", full);
    const en = legalDoc(id, "en", full);
    assert.deepEqual(fr.sections.map((s) => s.p.length), en.sections.map((s) => s.p.length), id);
  }
});

test("les champs d'identité vides ne sont pas affichés ; ceux qui sont remplis le sont", () => {
  const empty = legalDoc("mentions-legales", "fr", blank).sections[0];
  assert.equal(empty.h, "Éditeur du service");
  assert.deepEqual(empty.p, []); // tout est vide : aucune ligne
  const withName = legalDoc("mentions-legales", "fr", { ...blank, publisherName: "Effivital" }).sections[0];
  assert.deepEqual(withName.p, ["Éditeur : Effivital"]);
  const filled = legalDoc("mentions-legales", "fr", full).sections[0].p.join("\n");
  for (const v of ["Effivital", "association loi 1901", "1 rue Test", "RNA W000000000", "A. Martin", "contact@example.org"]) assert.ok(filled.includes(v), v);
});

test("sans adresse de contact, on renvoie au formulaire de l'application ; avec, on l'affiche", () => {
  const without = legalDoc("cgv", "fr", blank).sections.at(-1).p[0];
  assert.match(without, /formulaire/);
  const withMail = legalDoc("cgv", "fr", full).sections.at(-1).p[0];
  assert.match(withMail, /contact@example\.org/);
});

test("prix, TVA et médiateur : repris de la configuration", () => {
  const text = (cfg) => legalDoc("cgv", "fr", cfg).sections.map((s) => s.p.join(" ")).join(" ");
  assert.match(text(full), /7,90 € par mois ou 69 € par an TTC/);
  assert.match(text(blank), /7,90 € par mois ou 69 € par an\./);
  assert.match(text(full), /CM2C/);
  assert.doesNotMatch(text(blank), /CM2C/);
});

test("les engagements décrits correspondent à l'application : résiliation depuis les Réglages, export, pas d'IA pour l'import", () => {
  const cgv = legalDoc("cgv", "fr", full).sections.map((s) => s.p.join(" ")).join(" ");
  assert.match(cgv, /Réglages > Compte > Gérer mon abonnement/);
  assert.match(cgv, /14 jours/);
  const priv = legalDoc("confidentialite", "fr", full).sections.map((s) => s.p.join(" ")).join(" ");
  assert.match(priv, /Gemini/);
  assert.match(priv, /aucun service d'intelligence artificielle/);
  assert.match(priv, /télécharger toutes vos données/);
});
