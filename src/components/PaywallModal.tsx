import React from "react";
import { useAuth } from "../contexts/AuthContext";

const LEMONSQUEEZY_BASE_URL = import.meta.env.VITE_LEMONSQUEEZY_CHECKOUT_URL as string | undefined;

export function PaywallModal() {
  const { subscription, signOut, user } = useAuth();

  // Ajoute le user_id en custom data pour que le webhook sache quel user a payé
  const LEMONSQUEEZY_URL = LEMONSQUEEZY_BASE_URL && user
    ? `${LEMONSQUEEZY_BASE_URL}?checkout[custom][user_id]=${user.id}`
    : LEMONSQUEEZY_BASE_URL;
  if (!subscription || subscription.isActive) return null;

  const isExpiredTrial = subscription.plan === "trial";
  const isCancelled = subscription.plan === "cancelled" || subscription.plan === "expired";

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

        {LEMONSQUEEZY_URL ? (
          <a
            href={LEMONSQUEEZY_URL}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: "block",
              width: "100%",
              padding: "15px",
              borderRadius: "14px",
              background: "linear-gradient(135deg, #007AFF 0%, #0062CC 100%)",
              color: "white",
              fontSize: "16px",
              fontWeight: "700",
              textDecoration: "none",
              marginBottom: "12px",
            }}
          >
            S'abonner maintenant
          </a>
        ) : (
          <div style={{ padding: "14px", background: "#fef9c3", borderRadius: "12px", color: "#854d0e", fontSize: "14px", marginBottom: "12px" }}>
            Lien de paiement non configuré (VITE_LEMONSQUEEZY_CHECKOUT_URL)
          </div>
        )}

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
