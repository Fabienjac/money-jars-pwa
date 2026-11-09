import React, { useState } from "react";
import { t as tr, useLang, setLang, LANGS, localeTag } from "../i18n";
import { LEGAL_IDS } from "../legalContent";
import { legalLabel } from "./LegalPage";

const fmtEur = (n: number) =>
  new Intl.NumberFormat(localeTag(), { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n);

interface Props {
  onStart: () => void;
}

export function LandingPage({ onStart }: Props) {
  const lang = useLang();
  const [showVideo, setShowVideo] = useState(false);

  return (
    <div style={{
      minHeight: "100dvh",
      background: "linear-gradient(160deg, #0a0a1a 0%, #0d1b2a 50%, #0a0a1a 100%)",
      color: "#fff",
      fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      overflowX: "hidden",
    }}>

      {/* ── Navigation ───────────────────────────────────────────────────── */}
      <nav style={{
        display: "flex", justifyContent: "space-between", alignItems: "center",
        padding: "18px 16px", maxWidth: "900px", margin: "0 auto", gap: "8px",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <span style={{ fontSize: "28px" }}>🏺</span>
          <span style={{ fontSize: "18px", fontWeight: "700", color: "#fff", whiteSpace: "nowrap" }}>Money Jars</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <div style={{ display: "flex", gap: "4px" }}>
            {LANGS.map(l => (
              <button
                key={l.code}
                type="button"
                onClick={() => setLang(l.code)}
                aria-pressed={lang === l.code}
                style={{
                  padding: "6px 9px", borderRadius: "8px", fontSize: "12px", fontWeight: "700", cursor: "pointer",
                  border: "1px solid rgba(255,255,255,0.2)",
                  background: lang === l.code ? "rgba(255,255,255,0.15)" : "transparent",
                  color: lang === l.code ? "#fff" : "rgba(255,255,255,0.55)",
                }}
              >
                {l.code.toUpperCase()}
              </button>
            ))}
          </div>
        <button
          onClick={onStart}
          style={{
            padding: "10px 18px", borderRadius: "20px", border: "1px solid rgba(255,255,255,0.3)",
            background: "rgba(255,255,255,0.1)", color: "#fff", fontSize: "14px", whiteSpace: "nowrap",
            fontWeight: "600", cursor: "pointer", backdropFilter: "blur(10px)",
          }}
        >
          {tr("lp.signIn")}
        </button>
        </div>
      </nav>

      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <section style={{
        textAlign: "center", padding: "60px 24px 80px",
        maxWidth: "700px", margin: "0 auto",
      }}>
        <div style={{
          display: "inline-block", padding: "6px 16px", borderRadius: "20px",
          background: "rgba(0, 122, 255, 0.15)", border: "1px solid rgba(0, 122, 255, 0.4)",
          fontSize: "13px", color: "#60a5fa", marginBottom: "28px", fontWeight: "600",
        }}>
          {tr("lp.badge")}
        </div>

        <h1 style={{
          fontSize: "clamp(34px, 6vw, 56px)", fontWeight: "800",
          lineHeight: "1.1", margin: "0 0 24px",
          background: "linear-gradient(135deg, #fff 0%, #a0c4ff 100%)",
          WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
        }}>
          {tr("lp.h1a")}<br />{tr("lp.h1b")}
        </h1>

        <p style={{
          fontSize: "18px", color: "rgba(255,255,255,0.65)",
          lineHeight: "1.7", margin: "0 0 42px",
        }}>
          {tr("lp.heroText")}
        </p>

        <div style={{ display: "flex", gap: "14px", justifyContent: "center", flexWrap: "wrap" }}>
          <button
            onClick={onStart}
            style={{
              padding: "16px 36px", borderRadius: "50px", border: "none",
              background: "linear-gradient(135deg, #007AFF 0%, #0062CC 100%)",
              color: "#fff", fontSize: "17px", fontWeight: "700",
              cursor: "pointer", boxShadow: "0 8px 32px rgba(0,122,255,0.4)",
            }}
          >
            {tr("lp.ctaTrial")}
          </button>
          <p style={{ width: "100%", fontSize: "13px", color: "rgba(255,255,255,0.4)", margin: "4px 0 0" }}>
            {tr("lp.noCard")}
          </p>
        </div>
      </section>

      {/* ── App preview ──────────────────────────────────────────────────── */}
      <section style={{
        maxWidth: "420px", margin: "0 auto 80px",
        padding: "0 24px",
      }}>
        <div style={{
          background: "linear-gradient(160deg, #1a1a2e 0%, #16213e 100%)",
          borderRadius: "32px", padding: "28px 24px",
          border: "1px solid rgba(255,255,255,0.08)",
          boxShadow: "0 40px 80px rgba(0,0,0,0.5)",
        }}>
          <p style={{ fontSize: "11px", color: "rgba(255,255,255,0.4)", margin: "0 0 8px", textTransform: "uppercase", letterSpacing: "1px" }}>
            {tr("lp.previewKicker")}
          </p>
          <h2 style={{ fontSize: "28px", fontWeight: "800", margin: "0 0 20px" }}>{tr("lp.previewTitle")}</h2>

          {[
            { label: tr("lp.jarNEC"), pct: 55, color: "#FF6B6B", amount: fmtEur(1375) },
            { label: tr("lp.jarFFA"), pct: 10, color: "#FFD93D", amount: fmtEur(250) },
            { label: tr("lp.jarLTSS"), pct: 10, color: "#6BCB77", amount: fmtEur(250) },
            { label: tr("lp.jarPLAY"), pct: 10, color: "#4D96FF", amount: fmtEur(250) },
            { label: tr("lp.jarEDUC"), pct: 10, color: "#C77DFF", amount: fmtEur(250) },
            { label: tr("lp.jarGIFT"), pct: 5, color: "#FF9F43", amount: fmtEur(125) },
          ].map(jar => (
            <div key={jar.label} style={{ marginBottom: "12px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
                <span style={{ fontSize: "12px", color: "rgba(255,255,255,0.7)" }}>{jar.label}</span>
                <span style={{ fontSize: "12px", color: "#fff", fontWeight: "600" }}>{jar.amount}</span>
              </div>
              <div style={{ background: "rgba(255,255,255,0.08)", borderRadius: "6px", height: "6px" }}>
                <div style={{
                  width: `${jar.pct}%`, height: "6px", borderRadius: "6px",
                  background: jar.color,
                }} />
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Pour ceux qui connaissent ─────────────────────────────────────── */}
      <section style={{
        maxWidth: "900px", margin: "0 auto 80px", padding: "0 24px",
        display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "20px",
      }}>
        <div style={{
          background: "rgba(0,122,255,0.08)", borderRadius: "24px", padding: "32px 28px",
          border: "1px solid rgba(0,122,255,0.2)",
          gridColumn: "span 1",
        }}>
          <div style={{ fontSize: "36px", marginBottom: "16px" }}>🎓</div>
          <h3 style={{ fontSize: "20px", fontWeight: "700", margin: "0 0 12px" }}>
            {tr("lp.knowTitle")}
          </h3>
          <p style={{ fontSize: "15px", color: "rgba(255,255,255,0.65)", lineHeight: "1.6", margin: 0 }}>
            {tr("lp.knowText1")}<strong>{tr("lp.knowStrong")}</strong>{tr("lp.knowText2")}
          </p>
        </div>

        <div style={{
          background: "rgba(108,203,119,0.08)", borderRadius: "24px", padding: "32px 28px",
          border: "1px solid rgba(108,203,119,0.2)",
        }}>
          <div style={{ fontSize: "36px", marginBottom: "16px" }}>🌱</div>
          <h3 style={{ fontSize: "20px", fontWeight: "700", margin: "0 0 12px" }}>
            {tr("lp.newTitle")}
          </h3>
          <p style={{ fontSize: "15px", color: "rgba(255,255,255,0.65)", lineHeight: "1.6", margin: 0 }}>
            {tr("lp.newText1")}<strong>{tr("lp.newStrong")}</strong>{tr("lp.newText2")}
          </p>
        </div>
      </section>

      {/* ── Features ─────────────────────────────────────────────────────── */}
      <section style={{ maxWidth: "900px", margin: "0 auto 80px", padding: "0 24px" }}>
        <h2 style={{ textAlign: "center", fontSize: "32px", fontWeight: "800", marginBottom: "48px" }}>
          {tr("lp.featuresTitle")}
        </h2>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "20px" }}>
          {[
            { icon: "📂", title: tr("lp.f1t"), desc: tr("lp.f1d") },
            { icon: "🎙️", title: tr("lp.f2t"), desc: tr("lp.f2d") },
            { icon: "📊", title: tr("lp.f3t"), desc: tr("lp.f3d") },
            { icon: "🛟", title: tr("lp.f7t"), desc: tr("lp.f7d") },
            { icon: "🔄", title: tr("lp.f4t"), desc: tr("lp.f4d") },
            { icon: "₿", title: tr("lp.f5t"), desc: tr("lp.f5d") },
            { icon: "📱", title: tr("lp.f6t"), desc: tr("lp.f6d") },
          ].map(f => (
            <div key={f.title} style={{
              background: "rgba(255,255,255,0.04)", borderRadius: "20px", padding: "28px 24px",
              border: "1px solid rgba(255,255,255,0.08)",
            }}>
              <div style={{ fontSize: "32px", marginBottom: "14px" }}>{f.icon}</div>
              <h3 style={{ fontSize: "17px", fontWeight: "700", margin: "0 0 10px" }}>{f.title}</h3>
              <p style={{ fontSize: "14px", color: "rgba(255,255,255,0.6)", lineHeight: "1.6", margin: 0 }}>{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Vos données vous appartiennent ───────────────────────────────── */}
      <section style={{ maxWidth: "900px", margin: "0 auto 80px", padding: "0 24px" }}>
        <h2 style={{ textAlign: "center", fontSize: "32px", fontWeight: "800", marginBottom: "40px" }}>
          {tr("lp.trustTitle")}
        </h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "16px" }}>
          {[
            { icon: "🏦", title: tr("lp.trust1t"), desc: tr("lp.trust1d") },
            { icon: "📤", title: tr("lp.trust2t"), desc: tr("lp.trust2d") },
            { icon: "🗑️", title: tr("lp.trust3t"), desc: tr("lp.trust3d") },
            { icon: "✋", title: tr("lp.trust4t"), desc: tr("lp.trust4d") },
          ].map(x => (
            <div key={x.title} style={{
              background: "rgba(108,203,119,0.06)", borderRadius: "18px", padding: "22px 20px",
              border: "1px solid rgba(108,203,119,0.18)",
            }}>
              <div style={{ fontSize: "26px", marginBottom: "10px" }}>{x.icon}</div>
              <h3 style={{ fontSize: "16px", fontWeight: "700", margin: "0 0 8px" }}>{x.title}</h3>
              <p style={{ fontSize: "14px", color: "rgba(255,255,255,0.6)", lineHeight: "1.55", margin: 0 }}>{x.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Pricing ──────────────────────────────────────────────────────── */}
      <section style={{
        maxWidth: "480px", margin: "0 auto 80px", padding: "0 24px", textAlign: "center",
      }}>
        <h2 style={{ fontSize: "32px", fontWeight: "800", marginBottom: "12px" }}>
          {tr("lp.pricingTitle")}
        </h2>
        <p style={{ color: "rgba(255,255,255,0.55)", marginBottom: "36px", fontSize: "16px" }}>
          {tr("lp.pricingSub")}
        </p>

        <div style={{
          background: "rgba(0,122,255,0.1)", borderRadius: "28px", padding: "40px 32px",
          border: "1px solid rgba(0,122,255,0.3)",
        }}>
          <div style={{
            display: "inline-block", padding: "4px 14px", borderRadius: "12px",
            background: "rgba(0,122,255,0.2)", fontSize: "13px", color: "#60a5fa",
            marginBottom: "20px", fontWeight: "600",
          }}>
            {tr("lp.pricingBadge")}
          </div>

          <div style={{ display: "flex", gap: "12px", justifyContent: "center", flexWrap: "wrap", margin: "0 0 28px" }}>
            <div style={{ flex: "1 1 130px", padding: "16px 12px", borderRadius: "18px", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)" }}>
              <div style={{ fontSize: "12px", color: "rgba(255,255,255,0.55)", marginBottom: "6px", textTransform: "uppercase", letterSpacing: "0.5px" }}>{tr("lp.planMonthly")}</div>
              <div style={{ fontSize: "32px", fontWeight: "900", lineHeight: 1.1 }}>
                {tr("pw.price")}<span style={{ fontSize: "14px", fontWeight: "500", color: "rgba(255,255,255,0.55)" }}>{tr("pw.perMonth")}</span>
              </div>
            </div>
            <div style={{ flex: "1 1 130px", padding: "16px 12px", borderRadius: "18px", background: "rgba(0,122,255,0.16)", border: "1px solid rgba(0,122,255,0.5)" }}>
              <div style={{ fontSize: "12px", color: "#93c5fd", marginBottom: "6px", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                {tr("lp.planYearly")} · {tr("lp.yearlySave")}
              </div>
              <div style={{ fontSize: "32px", fontWeight: "900", lineHeight: 1.1 }}>
                69€<span style={{ fontSize: "14px", fontWeight: "500", color: "rgba(255,255,255,0.55)" }}>{tr("lp.perYear")}</span>
              </div>
            </div>
          </div>

          {[tr("pw.f1"), tr("pw.f2"), tr("pw.f3"), tr("pw.f4"), tr("pw.f5"), tr("lp.f6list")].map(f => (
            <div key={f} style={{
              display: "flex", alignItems: "center", gap: "10px",
              marginBottom: "10px", textAlign: "left",
            }}>
              <span style={{ color: "#34C759", fontSize: "18px", flexShrink: 0 }}>✓</span>
              <span style={{ fontSize: "15px", color: "rgba(255,255,255,0.8)" }}>{f}</span>
            </div>
          ))}

          <button
            onClick={onStart}
            style={{
              width: "100%", padding: "16px", borderRadius: "16px", border: "none",
              background: "linear-gradient(135deg, #007AFF 0%, #0062CC 100%)",
              color: "#fff", fontSize: "17px", fontWeight: "700",
              cursor: "pointer", marginTop: "28px",
              boxShadow: "0 8px 24px rgba(0,122,255,0.4)",
            }}
          >
            {tr("lp.startTrial")}
          </button>
          <p style={{ fontSize: "13px", color: "rgba(255,255,255,0.45)", margin: "14px 0 0" }}>{tr("lp.cancelNote")}</p>
        </div>
      </section>

      {/* ── FAQ ──────────────────────────────────────────────────────────── */}
      <section style={{ maxWidth: "720px", margin: "0 auto 80px", padding: "0 24px" }}>
        <h2 style={{ textAlign: "center", fontSize: "32px", fontWeight: "800", marginBottom: "32px" }}>
          {tr("lp.faqTitle")}
        </h2>
        {[1, 2, 3, 4, 5, 6, 7, 8].map(n => (
          <details key={n} className="lp-faq">
            <summary>{tr(`lp.faq${n}q` as "lp.faq1q")}</summary>
            <p>{tr(`lp.faq${n}a` as "lp.faq1a")}</p>
          </details>
        ))}
      </section>

      {/* ── Footer ───────────────────────────────────────────────────────── */}
      <footer style={{
        textAlign: "center", padding: "32px 24px",
        borderTop: "1px solid rgba(255,255,255,0.06)",
        color: "rgba(255,255,255,0.35)", fontSize: "13px",
      }}>
        <p style={{ margin: "0 0 8px" }}>
          <span style={{ marginRight: "4px" }}>🏺</span> Money Jars · {tr("lp.by")}{" "}
          <a href="https://association.effivital.org" target="_blank" rel="noopener noreferrer"
            style={{ color: "rgba(255,255,255,0.5)", textDecoration: "none" }}>
            Effivital
          </a>
        </p>
        <p style={{ margin: "0 0 14px" }}>
          {tr("lp.credit")}
        </p>
        <nav aria-label={tr("lp.legalTitle")} style={{ display: "flex", gap: "8px 18px", justifyContent: "center", flexWrap: "wrap" }}>
          {LEGAL_IDS.map(id => (
            <a key={id} href={`#${id}`} style={{ color: "rgba(255,255,255,0.5)", textDecoration: "underline" }}>{legalLabel(id)}</a>
          ))}
        </nav>
      </footer>
    </div>
  );
}
