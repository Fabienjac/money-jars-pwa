import { test } from "node:test";
import assert from "node:assert/strict";
import { loadTs } from "./_load.mjs";

const { HELP_TOPICS, helpKeys, isHelpTopic, OPEN_HELP_EVENT } = await loadTs("src/helpTopics.ts");
const fr = (await loadTs("src/i18n/fr.ts")).default;
const en = (await loadTs("src/i18n/en.ts")).default;

test("chaque fiche d'aide existe en français et en anglais, sans texte vide", () => {
  for (const topic of HELP_TOPICS) {
    for (const key of helpKeys(topic)) {
      assert.ok(typeof fr[key] === "string" && fr[key].trim(), `fr manque : ${key}`);
      assert.ok(typeof en[key] === "string" && en[key].trim(), `en manque : ${key}`);
    }
  }
});

test("pas de paragraphe en trop : help.<sujet>.p(N+1) n'existe pas", () => {
  for (const topic of HELP_TOPICS) {
    assert.equal(fr[`help.${topic.id}.p${topic.paragraphs + 1}`], undefined, `fr : paragraphe non listé pour ${topic.id}`);
    assert.equal(en[`help.${topic.id}.p${topic.paragraphs + 1}`], undefined, `en : paragraphe non listé pour ${topic.id}`);
  }
});

test("les mots en gras (**…**) sont bien refermés dans chaque texte", () => {
  for (const lang of [fr, en]) {
    for (const topic of HELP_TOPICS) {
      for (const key of helpKeys(topic)) assert.equal((lang[key].match(/\*\*/g) || []).length % 2, 0, key);
    }
  }
});

test("isHelpTopic et identifiants uniques", () => {
  assert.equal(isHelpTopic("jars"), true);
  assert.equal(isHelpTopic("autre"), false);
  assert.equal(new Set(HELP_TOPICS.map((t) => t.id)).size, HELP_TOPICS.length);
  assert.equal(OPEN_HELP_EVENT, "mjars:openHelp");
});
