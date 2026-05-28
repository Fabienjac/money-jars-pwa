import React, { useState } from "react";

interface Props {
  onStart: () => void;
}

export function LandingPage({ onStart }: Props) {
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
        padding: "18px 24px", maxWidth: "900px", margin: "0 auto",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <span style={{ fontSize: "28px" }}>🏺</span>
          <span style={{ fontSize: "18px", fontWeight: "700", color: "#fff" }}>Money Jars</span>
        </div>
        <button
          onClick={onStart}
          style={{
            padding: "10px 22px", borderRadius: "20px", border: "1px solid rgba(255,255,255,0.3)",
            background: "rgba(255,255,255,0.1)", color: "#fff", fontSize: "14px",
            fontWeight: "600", cursor: "pointer", backdropFilter: "blur(10px)",
          }}
        >
          Se connecter
        </button>
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
          ✦ La méthode des 6 bocaux de T. Harv Eker
        </div>

        <h1 style={{
          fontSize: "clamp(34px, 6vw, 56px)", fontWeight: "800",
          lineHeight: "1.1", margin: "0 0 24px",
          background: "linear-gradient(135deg, #fff 0%, #a0c4ff 100%)",
          WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
        }}>
          Vos finances,<br />enfin organisées
        </h1>

        <p style={{
          fontSize: "18px", color: "rgba(255,255,255,0.65)",
          lineHeight: "1.7", margin: "0 0 42px",
        }}>
          Money Jars est la seule app conçue spécifiquement pour pratiquer
          la méthode des 6 bocaux au quotidien. Importez vos relevés bancaires,
          parlez à votre téléphone, suivez votre liberté financière.
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
            Essayer 14 jours gratuitement
          </button>
          <p style={{ width: "100%", fontSize: "13px", color: "rgba(255,255,255,0.4)", margin: "4px 0 0" }}>
            Sans carte bancaire · Annulable à tout moment
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
            SYSTÈME DES 6 JARS
          </p>
          <h2 style={{ fontSize: "28px", fontWeight: "800", margin: "0 0 20px" }}>Mes Finances</h2>

          {[
            { label: "NEC — Nécessités", pct: 55, color: "#FF6B6B", amount: "1 375€" },
            { label: "FFA — Liberté fin.", pct: 10, color: "#FFD93D", amount: "250€" },
            { label: "LTSS — Épargne", pct: 10, color: "#6BCB77", amount: "250€" },
            { label: "PLAY — Plaisir", pct: 10, color: "#4D96FF", amount: "250€" },
            { label: "EDUC — Formation", pct: 10, color: "#C77DFF", amount: "250€" },
            { label: "GIFT — Don", pct: 5, color: "#FF9F43", amount: "125€" },
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
        display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px",
      }}>
        <div style={{
          background: "rgba(0,122,255,0.08)", borderRadius: "24px", padding: "32px 28px",
          border: "1px solid rgba(0,122,255,0.2)",
          gridColumn: "span 1",
        }}>
          <div style={{ fontSize: "36px", marginBottom: "16px" }}>🎓</div>
          <h3 style={{ fontSize: "20px", fontWeight: "700", margin: "0 0 12px" }}>
            Vous connaissez la méthode
          </h3>
          <p style={{ fontSize: "15px", color: "rgba(255,255,255,0.65)", lineHeight: "1.6", margin: 0 }}>
            Vous avez lu "Secrets of the Millionaire Mind" ou participé à un séminaire Harv Eker.
            Money Jars est l'outil que vous cherchez pour <strong>vivre la méthode au quotidien</strong>,
            pas seulement en théorie.
          </p>
        </div>

        <div style={{
          background: "rgba(108,203,119,0.08)", borderRadius: "24px", padding: "32px 28px",
          border: "1px solid rgba(108,203,119,0.2)",
        }}>
          <div style={{ fontSize: "36px", marginBottom: "16px" }}>🌱</div>
          <h3 style={{ fontSize: "20px", fontWeight: "700", margin: "0 0 12px" }}>
            Vous découvrez la méthode
          </h3>
          <p style={{ fontSize: "15px", color: "rgba(255,255,255,0.65)", lineHeight: "1.6", margin: 0 }}>
            La méthode des 6 bocaux a transformé des millions de vies financières depuis 20 ans.
            L'app vous guide pas à pas pour <strong>comprendre et appliquer</strong> immédiatement.
          </p>
        </div>
      </section>

      {/* ── Features ─────────────────────────────────────────────────────── */}
      <section style={{ maxWidth: "900px", margin: "0 auto 80px", padding: "0 24px" }}>
        <h2 style={{ textAlign: "center", fontSize: "32px", fontWeight: "800", marginBottom: "48px" }}>
          Tout ce dont vous avez besoin
        </h2>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "20px" }}>
          {[
            { icon: "🤖", title: "Import IA", desc: "Importez vos relevés Revolut, BNP, Crédit Agricole... L'IA lit le PDF et classe chaque transaction automatiquement." },
            { icon: "🎙️", title: "Saisie vocale", desc: "\"J'ai dépensé 45€ en courses\" → ajouté instantanément. Parlez, l'app s'occupe du reste." },
            { icon: "📊", title: "Analytics complets", desc: "Graphiques de vos bocaux mois par mois. Voyez votre progression vers la liberté financière." },
            { icon: "🔄", title: "Détection d'abonnements", desc: "Spotify, Netflix, salle de sport... L'app repère automatiquement vos charges récurrentes." },
            { icon: "₿", title: "Crypto & multi-devises", desc: "Revenus en Bitcoin, USDC, ETH ? Conversion automatique au taux historique du jour." },
            { icon: "📱", title: "PWA — Comme une app native", desc: "Installez sur iPhone ou Android. Fonctionne hors-ligne. Aucun téléchargement depuis un store." },
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

      {/* ── Pricing ──────────────────────────────────────────────────────── */}
      <section style={{
        maxWidth: "480px", margin: "0 auto 80px", padding: "0 24px", textAlign: "center",
      }}>
        <h2 style={{ fontSize: "32px", fontWeight: "800", marginBottom: "12px" }}>
          Simple et transparent
        </h2>
        <p style={{ color: "rgba(255,255,255,0.55)", marginBottom: "36px", fontSize: "16px" }}>
          Un seul plan, tout inclus. Aucune surprise.
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
            14 jours gratuits · Sans CB
          </div>

          <div style={{ fontSize: "56px", fontWeight: "900", lineHeight: 1 }}>
            7,90€
            <span style={{ fontSize: "20px", fontWeight: "500", color: "rgba(255,255,255,0.55)" }}>/mois</span>
          </div>
          <div style={{ fontSize: "15px", color: "rgba(255,255,255,0.5)", margin: "8px 0 32px" }}>
            ou 69€/an · Annulable à tout moment
          </div>

          {["Import IA (PDF, CSV, Excel)", "Saisie vocale", "Analytics complets", "Détection d'abonnements", "Crypto & multi-devises", "Mises à jour incluses"].map(f => (
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
            Commencer l'essai gratuit
          </button>
        </div>
      </section>

      {/* ── Footer ───────────────────────────────────────────────────────── */}
      <footer style={{
        textAlign: "center", padding: "32px 24px",
        borderTop: "1px solid rgba(255,255,255,0.06)",
        color: "rgba(255,255,255,0.35)", fontSize: "13px",
      }}>
        <p style={{ margin: "0 0 8px" }}>
          <span style={{ marginRight: "4px" }}>🏺</span> Money Jars · par{" "}
          <a href="https://association.effivital.org" target="_blank" rel="noopener noreferrer"
            style={{ color: "rgba(255,255,255,0.5)", textDecoration: "none" }}>
            Effivital
          </a>
        </p>
        <p style={{ margin: 0 }}>
          La méthode des 6 bocaux est une création de T. Harv Eker.
        </p>
      </footer>
    </div>
  );
}
