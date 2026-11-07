// src/components/ImportReadSettings.tsx
// Résumé de la façon dont le fichier est lu (dates, nombres, sens des montants) + correction manuelle.
import React, { useState } from "react";
import { t as tr, useLang, localeTag } from "../i18n";
import type { DateOrder, ReadOptions, Reading } from "../importNormalize";
import { parseDate } from "../importNormalize";

interface Props {
  reading: Reading;
  options: ReadOptions;
  onChange: (next: ReadOptions) => void;
}

const dateLabel = (o: DateOrder) =>
  o === "DMY" ? tr("imp.read.dmy") : o === "MDY" ? tr("imp.read.mdy") : tr("imp.read.ymd");

export const ImportReadSettings: React.FC<Props> = ({ reading, options, onChange }) => {
  useLang();
  const [open, setOpen] = useState(reading.ambiguous);

  const numLabel = reading.decimal === "," ? "1 234,56" : "1,234.56";
  const signLabel = reading.expenseSign === "negative" ? tr("imp.read.signNeg") : tr("imp.read.signPos");

  const selectStyle: React.CSSProperties = {
    width: "100%",
    padding: "10px 12px",
    borderRadius: "10px",
    border: "1px solid var(--border-color)",
    background: "var(--bg-body)",
    color: "var(--text-main)",
    fontSize: "14px",
  };
  const labelStyle: React.CSSProperties = {
    display: "block",
    fontSize: "12px",
    fontWeight: 600,
    color: "var(--text-muted)",
    marginBottom: "4px",
  };

  let example: string | null = null;
  if (reading.sampleDate) {
    const iso = parseDate(reading.sampleDate, reading.order);
    if (iso) {
      const d = new Date(`${iso}T12:00:00`);
      example = tr("imp.read.example", {
        sample: reading.sampleDate,
        result: d.toLocaleDateString(localeTag(), { day: "numeric", month: "long", year: "numeric" }),
      });
    }
  }

  return (
    <div
      style={{
        margin: "12px 16px 0",
        padding: "10px 14px",
        borderRadius: "12px",
        border: `1px solid ${reading.ambiguous ? "#FF9500" : "var(--border-color)"}`,
        background: "var(--bg-body)",
        fontSize: "13px",
        color: "var(--text-main)",
      }}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        style={{
          display: "flex",
          width: "100%",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "8px",
          background: "none",
          border: "none",
          padding: 0,
          cursor: "pointer",
          color: "inherit",
          textAlign: "left",
          fontSize: "13px",
        }}
      >
        <span>
          <strong>{tr("imp.read.title")}</strong>
          {" · "}
          {tr("imp.read.summary", { date: dateLabel(reading.order), num: numLabel, sign: signLabel })}
        </span>
        <span aria-hidden>{open ? "▾" : "▸"}</span>
      </button>

      {reading.ambiguous && (
        <p style={{ margin: "8px 0 0", color: "#FF9500", fontWeight: 600 }}>
          {tr("imp.read.ambiguous", { sample: reading.sampleDate ?? "", fmt: dateLabel(reading.order) })}
        </p>
      )}

      {open && (
        <div style={{ marginTop: "12px", display: "grid", gap: "12px" }}>
          <div>
            <label style={labelStyle}>{tr("imp.read.date")}</label>
            <select
              style={selectStyle}
              value={options.dateOrder}
              onChange={(e) => onChange({ ...options, dateOrder: e.target.value as ReadOptions["dateOrder"] })}
            >
              <option value="auto">{tr("imp.read.auto")}</option>
              <option value="DMY">{tr("imp.read.dmy")}</option>
              <option value="MDY">{tr("imp.read.mdy")}</option>
              <option value="YMD">{tr("imp.read.ymd")}</option>
            </select>
            {example && <p style={{ margin: "4px 0 0", color: "var(--text-muted)" }}>{example}</p>}
          </div>
          <div>
            <label style={labelStyle}>{tr("imp.read.number")}</label>
            <select
              style={selectStyle}
              value={options.decimal}
              onChange={(e) => onChange({ ...options, decimal: e.target.value as ReadOptions["decimal"] })}
            >
              <option value="auto">{tr("imp.read.auto")}</option>
              <option value=",">{tr("imp.read.decComma")}</option>
              <option value=".">{tr("imp.read.decDot")}</option>
            </select>
          </div>
          <div>
            <label style={labelStyle}>{tr("imp.read.sign")}</label>
            <select
              style={selectStyle}
              value={options.expenseSign}
              onChange={(e) => onChange({ ...options, expenseSign: e.target.value as ReadOptions["expenseSign"] })}
            >
              <option value="auto">{tr("imp.read.auto")}</option>
              <option value="negative">{tr("imp.read.signNeg")}</option>
              <option value="positive">{tr("imp.read.signPos")}</option>
            </select>
          </div>
        </div>
      )}
    </div>
  );
};
