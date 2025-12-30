// src/components/ImportSuccessScreen.tsx
import React from "react";

interface ImportSuccessScreenProps {
  successCount: number;
  errorCount: number;
  isImporting: boolean;
  onClose: () => void;
}

export const ImportSuccessScreen: React.FC<ImportSuccessScreenProps> = ({
  successCount,
  errorCount,
  isImporting,
  onClose,
}) => {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "rgba(0, 0, 0, 0.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 2000,
        padding: "16px",
      }}
    >
      <div
        style={{
          backgroundColor: "var(--bg-card)",
          borderRadius: "24px",
          boxShadow: "0 20px 60px rgba(0, 0, 0, 0.3)",
          maxWidth: "500px",
          width: "100%",
          padding: "40px",
          textAlign: "center",
        }}
      >
        {isImporting ? (
          // État : Importation en cours
          <>
            {/* Animation de chargement */}
            <div
              style={{
                width: "80px",
                height: "80px",
                margin: "0 auto 24px",
                border: "4px solid var(--border-color)",
                borderTop: "4px solid var(--jar-nec)",
                borderRadius: "50%",
                animation: "spin 1s linear infinite",
              }}
            />
            <style>{`
              @keyframes spin {
                0% { transform: rotate(0deg); }
                100% { transform: rotate(360deg); }
              }
            `}</style>

            <h2
              style={{
                margin: "0 0 12px",
                fontSize: "24px",
                fontWeight: "700",
                color: "var(--text-main)",
              }}
            >
              Importation en cours...
            </h2>
            <p
              style={{
                margin: 0,
                fontSize: "15px",
                color: "var(--text-muted)",
                lineHeight: 1.6,
              }}
            >
              Veuillez patienter pendant l'envoi de vos transactions.
            </p>
          </>
        ) : (
          // État : Importation terminée
          <>
            {/* Icône de succès */}
            <div
              style={{
                width: "80px",
                height: "80px",
                margin: "0 auto 24px",
                backgroundColor: errorCount === 0 ? "#34C759" : "#FF9500",
                borderRadius: "50%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "48px",
              }}
            >
              {errorCount === 0 ? "✓" : "⚠"}
            </div>

            <h2
              style={{
                margin: "0 0 12px",
                fontSize: "24px",
                fontWeight: "700",
                color: "var(--text-main)",
              }}
            >
              {errorCount === 0 ? "Importation réussie !" : "Importation terminée"}
            </h2>

            <p
              style={{
                margin: "0 0 24px",
                fontSize: "16px",
                color: "var(--text-main)",
                lineHeight: 1.6,
              }}
            >
              <strong style={{ fontSize: "20px", color: "#34C759" }}>
                {successCount}
              </strong>{" "}
              transaction{successCount > 1 ? "s" : ""} importée{successCount > 1 ? "s" : ""} avec succès
              {errorCount > 0 && (
                <>
                  <br />
                  <span style={{ color: "#FF3B30" }}>
                    {errorCount} échec{errorCount > 1 ? "s" : ""}
                  </span>
                </>
              )}
            </p>

            {/* Bouton Retour à l'accueil */}
            <button
              onClick={onClose}
              style={{
                width: "100%",
                padding: "16px 24px",
                borderRadius: "12px",
                border: "none",
                background: "linear-gradient(135deg, #34C759 0%, #28a745 100%)",
                color: "white",
                fontSize: "16px",
                fontWeight: "700",
                cursor: "pointer",
                transition: "transform 0.2s",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = "scale(1.02)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = "scale(1)";
              }}
            >
              Retour à l'accueil
            </button>
          </>
        )}
      </div>
    </div>
  );
};
