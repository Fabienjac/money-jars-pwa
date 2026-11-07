import React, { useState } from "react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../contexts/AuthContext";
import { t as tr, useLang, JAR_LABELS, type TKey } from "../i18n";

const DEFAULT_JARS = [
  { key: "NEC",  emoji: "🏠", percent: 55 },
  { key: "FFA",  emoji: "💰", percent: 10 },
  { key: "LTSS", emoji: "🎯", percent: 10 },
  { key: "PLAY", emoji: "🎉", percent: 10 },
  { key: "EDUC", emoji: "📚", percent: 10 },
  { key: "GIFT", emoji: "🎁", percent: 5 },
] as const;
const jarName = (k: string) => JAR_LABELS[k as keyof typeof JAR_LABELS];
const jarDesc = (k: string) => tr(`onb.desc.${k}` as TKey);

type Step = "knows_method" | "intro" | "config";

interface Props {
  onComplete: () => void;
}

export function OnboardingFlow({ onComplete }: Props) {
  useLang();
  const { user } = useAuth();
  const [step, setStep] = useState<Step>("knows_method");
  const [percents, setPercents] = useState<Record<string, number>>(
    Object.fromEntries(DEFAULT_JARS.map(j => [j.key, j.percent]))
  );
  const [saving, setSaving] = useState(false);

  const total = Object.values(percents).reduce((s, v) => s + v, 0);
  const isValid = Math.abs(total - 100) < 0.01;

  function setPercent(key: string, val: number) {
    setPercents(prev => ({ ...prev, [key]: Math.max(0, Math.min(100, val)) }));
  }

  async function saveAndGo(customPercents?: Record<string, number>) {
    if (!user) return;
    setSaving(true);

    const p = customPercents ?? percents;
    const rows = DEFAULT_JARS.map(j => ({
      user_id:         user.id,
      jar_key:         j.key,
      percent:         p[j.key],
      initial_balance: 0,
    }));

    await supabase.from("jar_settings").upsert(rows, { onConflict: "user_id,jar_key" });
    setSaving(false);
    onComplete();
  }

  // Raccourci : "Oui" → sauvegarde les % par défaut et va direct au dashboard
  async function saveDefaults() {
    const defaults = Object.fromEntries(DEFAULT_JARS.map(j => [j.key, j.percent]));
    await saveAndGo(defaults);
  }

  // ── Étape 1 : Connais-tu la méthode ? ───────────────────────────────────────
  if (step === "knows_method") {
    return (
      <Wrapper>
        <div style={{ fontSize: "64px", marginBottom: "16px" }}>🏺</div>
        <h1 style={h1}>{tr("onb.welcome")}</h1>
        <p style={sub}>{tr("onb.knowQ")}</p>

        <div style={{ display: "flex", flexDirection: "column", gap: "12px", width: "100%", maxWidth: 340 }}>
          <button style={btnPrimary} onClick={saveDefaults} disabled={saving}>
            {saving ? tr("onb.configuring") : tr("onb.yes")}
          </button>
          <button style={btnSecondary} onClick={() => setStep("intro")}>
            {tr("onb.no")}
          </button>
        </div>
        <p style={{ fontSize: "12px", color: "var(--text-muted)", marginTop: "12px" }}>
          {tr("onb.defaultsNote")}<br/>
          {tr("onb.adjustLater")}
        </p>
      </Wrapper>
    );
  }

  // ── Étape 2 : Introduction à la méthode ─────────────────────────────────────
  if (step === "intro") {
    return (
      <Wrapper>
        <div style={{ fontSize: "48px", marginBottom: "12px" }}>💡</div>
        <h1 style={h1}>{tr("onb.methodTitle")}</h1>
        <p style={{ ...sub, marginBottom: "24px" }}>
          {tr("onb.imagine")}
          {tr("onb.eachRole")}
        </p>

        <div style={{ width: "100%", maxWidth: 380, display: "flex", flexDirection: "column", gap: "10px", marginBottom: "28px" }}>
          {DEFAULT_JARS.map(j => (
            <div key={j.key} style={{
              display: "flex", alignItems: "center", gap: "14px",
              background: "var(--bg-card)", borderRadius: "14px", padding: "14px 16px",
            }}>
              <span style={{ fontSize: "28px", flexShrink: 0 }}>{j.emoji}</span>
              <div>
                <div style={{ fontWeight: "700", fontSize: "15px", color: "var(--text-main)" }}>
                  {jarName(j.key)} <span style={{ color: "var(--text-muted)", fontWeight: "500" }}>· {j.percent}%</span>
                </div>
                <div style={{ fontSize: "13px", color: "var(--text-muted)", marginTop: "2px" }}>{jarDesc(j.key)}</div>
              </div>
            </div>
          ))}
        </div>

        <button style={{ ...btnPrimary, maxWidth: 340 }} onClick={() => setStep("config")}>
          {tr("onb.configure")}
        </button>
      </Wrapper>
    );
  }

  // ── Étape 3 : Configuration des % ───────────────────────────────────────────
  return (
    <Wrapper>
      <div style={{ fontSize: "40px", marginBottom: "12px" }}>⚙️</div>
      <h1 style={h1}>{tr("onb.splitTitle")}</h1>
      <p style={{ ...sub, marginBottom: "8px" }}>
        {tr("onb.adjust")}
      </p>
      <p style={{
        fontSize: "14px",
        fontWeight: "600",
        color: isValid ? "#16a34a" : "#dc2626",
        marginBottom: "20px",
      }}>
        {tr("onb.total", { total })} {isValid ? "✓" : tr("onb.missing", { n: 100 - total })}
      </p>

      <div style={{ width: "100%", maxWidth: 380, display: "flex", flexDirection: "column", gap: "10px", marginBottom: "28px" }}>
        {DEFAULT_JARS.map(j => (
          <div key={j.key} style={{
            display: "flex", alignItems: "center", gap: "12px",
            background: "var(--bg-card)", borderRadius: "14px", padding: "14px 16px",
          }}>
            <span style={{ fontSize: "24px", flexShrink: 0 }}>{j.emoji}</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: "600", fontSize: "14px", color: "var(--text-main)" }}>{jarName(j.key)}</div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <button
                type="button"
                onClick={() => setPercent(j.key, percents[j.key] - 5)}
                style={stepBtn}
              >−</button>
              <span style={{ minWidth: "38px", textAlign: "center", fontWeight: "700", fontSize: "16px", color: "var(--text-main)" }}>
                {percents[j.key]}%
              </span>
              <button
                type="button"
                onClick={() => setPercent(j.key, percents[j.key] + 5)}
                style={stepBtn}
              >+</button>
            </div>
          </div>
        ))}
      </div>

      <div style={{ display: "flex", gap: "12px", width: "100%", maxWidth: 380 }}>
        <button style={{ ...btnSecondary, flex: 1 }} onClick={() => setStep("intro")}>
          {tr("onb.back")}
        </button>
        <button
          style={{ ...btnPrimary, flex: 2, opacity: !isValid || saving ? 0.5 : 1 }}
          disabled={!isValid || saving}
          onClick={() => saveAndGo()}
        >
          {saving ? tr("onb.saving") : tr("onb.go")}
        </button>
      </div>
    </Wrapper>
  );
}

function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      minHeight: "100dvh",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "flex-start",
      padding: "48px 20px 40px",
      background: "var(--bg-body)",
      overflowY: "auto",
      textAlign: "center",
    }}>
      {children}
    </div>
  );
}

const h1: React.CSSProperties = {
  fontSize: "24px",
  fontWeight: "700",
  color: "var(--text-main)",
  margin: "0 0 10px",
};

const sub: React.CSSProperties = {
  fontSize: "15px",
  color: "var(--text-muted)",
  maxWidth: "340px",
  lineHeight: "1.5",
  margin: "0 0 24px",
};

const btnPrimary: React.CSSProperties = {
  width: "100%",
  padding: "15px",
  borderRadius: "14px",
  border: "none",
  background: "linear-gradient(135deg, #007AFF 0%, #0062CC 100%)",
  color: "white",
  fontSize: "16px",
  fontWeight: "700",
  cursor: "pointer",
};

const btnSecondary: React.CSSProperties = {
  width: "100%",
  padding: "15px",
  borderRadius: "14px",
  border: "1.5px solid var(--border-color, #e5e5ea)",
  background: "transparent",
  color: "var(--text-main)",
  fontSize: "15px",
  fontWeight: "600",
  cursor: "pointer",
};

const stepBtn: React.CSSProperties = {
  width: "32px",
  height: "32px",
  borderRadius: "8px",
  border: "1.5px solid var(--border-color, #e5e5ea)",
  background: "var(--bg-body)",
  color: "var(--text-main)",
  fontSize: "18px",
  cursor: "pointer",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  flexShrink: 0,
};
