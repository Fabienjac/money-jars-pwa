import { test } from "node:test";
import assert from "node:assert/strict";
import { computeLifestyle, isExtraordinary, lifestyleFetchFrom, tagTotalsThisYear } from "../src/lifestyle.ts";

const none = new Set<string>();
const voyage = new Set(["voyage"]);

test("isExtraordinary : une étiquette suffit, espaces tolérés, ensemble vide = jamais", () => {
  assert.equal(isExtraordinary("alimentaire, voyage", voyage), true);
  assert.equal(isExtraordinary("alimentaire", voyage), false);
  assert.equal(isExtraordinary("", voyage), false);
  assert.equal(isExtraordinary(undefined, voyage), false);
  assert.equal(isExtraordinary("voyage", none), false);
});

test("moyenne par jour : début d'année, extraordinaires exclues", () => {
  // 10 jours (1er → 10 janv.) ; 100 € courants + 500 € de voyage
  const rows = [
    { date: "2026-01-01", amount: 60, tags: "alimentaire" },
    { date: "2026-01-05", amount: 40, tags: "" },
    { date: "2026-01-06", amount: 500, tags: "voyage" },
  ];
  const s = computeLifestyle(rows, voyage, "2026-01-10")!;
  assert.equal(s.days, 10);
  assert.equal(s.total, 600);
  assert.equal(s.extraordinary, 500);
  assert.equal(s.extraordinaryCount, 1);
  assert.equal(s.perDay, 10); // (600 − 500) / 10
  assert.equal(s.perDayAll, 60);
  assert.equal(s.last30, null); // moins de 30 jours : pas de tendance
  assert.equal(s.status, null);
});

test("la période démarre à la première dépense de l'année si elle est plus tardive", () => {
  const rows = [{ date: "2026-03-01", amount: 90, tags: "" }];
  const s = computeLifestyle(rows, none, "2026-03-10")!;
  assert.equal(s.startDate, "2026-03-01");
  assert.equal(s.days, 10);
  assert.equal(s.perDay, 9);
});

test("tendance : 30 derniers jours vs moyenne depuis janvier", () => {
  // 1er janv. → 30 janv. : 10 €/jour ; puis le train de vie grimpe à 20 €/jour sur les 30 derniers jours
  const rows: { date: string; amount: number; tags?: string }[] = [];
  for (let d = 1; d <= 30; d++) rows.push({ date: `2026-01-${String(d).padStart(2, "0")}`, amount: 10 });
  const today = "2026-04-10"; // 100 jours depuis le 1er janv.
  for (let i = 0; i < 30; i++) {
    const dt = new Date(Date.UTC(2026, 3, 10) - i * 86_400_000).toISOString().slice(0, 10);
    rows.push({ date: dt, amount: 20 });
  }
  rows.push({ date: "2026-04-01", amount: 3000, tags: "voyage" }); // exclue de tout
  const s = computeLifestyle(rows, voyage, today)!;
  assert.equal(s.days, 100);
  assert.equal(s.last30!.perDay, 20);
  assert.equal(s.last30!.extraordinary, 3000);
  assert.equal(s.perDay, (300 + 600) / 100); // 9 €/jour
  assert.equal(s.status, "up");
  assert.ok(s.deltaPct! > 100);
});

test("tendance stable / en baisse selon l'écart de ±10 %", () => {
  const base = (recent: number) => {
    const rows: { date: string; amount: number }[] = [];
    for (let d = 0; d < 100; d++) {
      const dt = new Date(Date.UTC(2026, 3, 10) - d * 86_400_000).toISOString().slice(0, 10);
      rows.push({ date: dt, amount: d < 30 ? recent : 10 });
    }
    return computeLifestyle(rows, none, "2026-04-10")!;
  };
  assert.equal(base(10).status, "stable");
  assert.equal(base(10.5).status, "stable");
  assert.equal(base(5).status, "down");
  assert.equal(base(15).status, "up");
});

test("dépenses futures, lignes invalides et année précédente ignorées ; aucune donnée = null", () => {
  const rows = [
    { date: "2025-12-31", amount: 999 },
    { date: "2026-02-01", amount: 30 },
    { date: "2026-12-01", amount: 999 }, // futur
    { date: "n'importe quoi", amount: 5 },
    { date: "2026-02-02", amount: Number.NaN },
  ];
  const s = computeLifestyle(rows, none, "2026-02-10")!;
  assert.equal(s.total, 30);
  assert.equal(computeLifestyle([], none, "2026-02-10"), null);
  assert.equal(computeLifestyle([{ date: "2025-05-05", amount: 10 }], none, "2026-02-10"), null);
});

test("lifestyleFetchFrom : début d'année, ou 29 jours avant en janvier", () => {
  assert.equal(lifestyleFetchFrom("2026-11-07"), "2026-01-01");
  assert.equal(lifestyleFetchFrom("2026-01-10"), "2025-12-12");
});

test("tagTotalsThisYear : cumul par étiquette sur l'année en cours", () => {
  const rows = [
    { date: "2026-02-01", amount: 100, tags: "voyage,loisirs" },
    { date: "2026-02-02", amount: 20, tags: "loisirs" },
    { date: "2025-12-01", amount: 999, tags: "voyage" },
  ];
  assert.deepEqual(tagTotalsThisYear(rows, "2026-03-01"), { voyage: 100, loisirs: 120 });
});
