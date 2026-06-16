import React from "react";
import { useAuth } from "../contexts/AuthContext";

const LINK_MONTHLY = "https://buy.stripe.com/7sY14m7g13Ur6Bl0hL7g404";
const LINK_YEARLY  = "https://buy.stripe.com/cNi5kC2ZLfD94td7Kd7g403";

export function PaywallModal() {
  const { subscription, signOut, user } = useAuth();

  if (!subscription || subscription.isActive) return null;

  const isExpiredTrial = subscription.plan === "trial";

  const monthlyUrl = user ? `${LINK_MONTHLY}?client_reference_id=${user.id}` : LINK_MONTHLY;
  const yearlyUrl  = user ? `${LINK_YEARLY}?client_reference_id=${user.id}`  : LINK_YEARLY;

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 9999,
      background: "rgba(0,0,0,0.7)",
      display: "flex", alignItems: "center", justifyContent: "center",
      padding: "20px",
      backdropFilter: "blur(6px)",
    }}>
      <div style={{
        background: "var(--bg-card)",
        borderRadius: "24px",
        padding: "36px 28px",
        maxWidth: "380px",
        width: "100%",
        textAlign: "center",
        boxShadow: "0 20px 60px rgba(0,0,0,0.3)",
      }}>
        <div style={{ fontSize: "52px", marginBottom: "16px" }}>🏺</div>

        <h2 style={{ fontSize: "22px", fontWeight: "700", color: "var(--text-main)", margin: "0 0 10px" }}>
          {isExpiredTrial ? "Votre essai est terminé" : "Abonnement inactif"}
        </h2>

        <p style={{ color: "var(--text-muted)", fontSize: "15px", lineHeight: "1.6", margin: "0 0 28px" }}>
          {isExpiredTrial
            ? "Vous avez profité de 14 jours gratuits. Continuez à pratiquer la méthode des 6 bocaux avec Money Jars."
            : "Votre abonnement a expiré. Renouvelez pour continuer à utiliser l'application."
          }
        </p>

        {/* Pricing */}
        <div style={{
          background: "var(--bg-body)",
          borderRadius: "16px",
          padding: "20px",
          marginBottom: "20px",
        }}>
          <div style={{ fontSize: "32px", fontWeight: "800", color: "var(--text-main)" }}>
            7,90€
            <span style={{ fontSize: "16px", fontWeight: "500", color: "var(--text-muted)" }}>/mois</span>
          </div>
          <div style={{ fontSize: "13px", color: "var(--text-muted)", marginTop: "4px" }}>
            ou 69€/an · Annulable à tout moment
          </div>
          <div style={{ marginTop: "14px", display: "flex", flexDirection: "column", gap: "6px", textAlign: "left" }}>
            {["Import IA (PDF, CSV, Excel)", "Saisie vocale", "Analytics complets", "Détection d'abonnements", "Crypto & multi-devises"].map(f => (
              <div key={f} style={{ fontSize: "14px", color: "var(--text-main)", display: "flex", gap: "8px", alignItems: "center" }}>
                <span style={{ color: "#34C759" }}>✓</span> {f}
              </div>
            ))}
          </div>
        </div>

        <a
          href={monthlyUrl}
          style={{
            display: "block",
            width: "100%",
            padding: "15px",
            borderRadius: "14px",
            border: "none",
            background: "linear-gradient(135deg, #007AFF 0%, #0062CC 100%)",
            color: "white",
            fontSize: "16px",
            fontWeight: "700",
            cursor: "pointer",
            marginBottom: "10px",
            textDecoration: "none",
            boxSizing: "border-box",
          }}
        >
          S'abonner — 7,90€/mois
        </a>

        <a
          href={yearlyUrl}
          style={{
            display: "block",
            width: "100%",
            padding: "13px",
            borderRadius: "14px",
            border: "1.5px solid var(--border-color, #e5e5ea)",
            background: "transparent",
            color: "var(--text-main)",
            fontSize: "15px",
            fontWeight: "600",
            cursor: "pointer",
            marginBottom: "16px",
            textDecoration: "none",
            boxSizing: "border-box",
          }}
        >
          Plan annuel — 69€/an (−27%)
        </a>

        <button
          type="button"
          onClick={signOut}
          style={{
            background: "none", border: "none", cursor: "pointer",
            color: "var(--text-muted)", fontSize: "14px",
          }}
        >
          Se déconnecter
        </button>
      </div>
    </div>
  );
}
