import React, { useState } from "react";
import { useAuth } from "../contexts/AuthContext";

type Mode = "login" | "signup";

export function AuthScreen() {
  const { signInWithEmail, signUpWithEmail, signInWithGoogle } = useAuth();
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setLoading(true);

    const fn = mode === "login" ? signInWithEmail : signUpWithEmail;
    const { error } = await fn(email, password);

    setLoading(false);
    if (error) {
      setError(translateError(error));
    } else if (mode === "signup") {
      setInfo("Vérifie ta boîte mail pour confirmer ton compte, puis connecte-toi.");
      setMode("login");
    }
  }

  async function handleGoogle() {
    setError(null);
    setLoading(true);
    const { error } = await signInWithGoogle();
    setLoading(false);
    if (error) setError(translateError(error));
  }

  return (
    <div style={{
      minHeight: "100dvh",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      padding: "24px",
      background: "var(--bg-body)",
    }}>
      {/* Logo / titre */}
      <div style={{ textAlign: "center", marginBottom: "40px" }}>
        <div style={{ fontSize: "56px", marginBottom: "12px" }}>🏺</div>
        <h1 style={{ fontSize: "28px", fontWeight: "700", color: "var(--text-main)", margin: 0 }}>
          Money Jars
        </h1>
        <p style={{ color: "var(--text-muted)", margin: "8px 0 0", fontSize: "15px" }}>
          La méthode des 6 bocaux dans votre poche
        </p>
      </div>

      {/* Card */}
      <div style={{
        width: "100%",
        maxWidth: "380px",
        background: "var(--bg-card)",
        borderRadius: "20px",
        padding: "28px 24px",
        boxShadow: "0 4px 24px rgba(0,0,0,0.08)",
      }}>
        {/* Tabs */}
        <div style={{
          display: "flex",
          background: "var(--bg-body)",
          borderRadius: "12px",
          padding: "4px",
          marginBottom: "24px",
        }}>
          {(["login", "signup"] as Mode[]).map(m => (
            <button
              key={m}
              type="button"
              onClick={() => { setMode(m); setError(null); setInfo(null); }}
              style={{
                flex: 1,
                padding: "9px",
                borderRadius: "9px",
                border: "none",
                cursor: "pointer",
                fontWeight: "600",
                fontSize: "14px",
                background: mode === m ? "var(--bg-card)" : "transparent",
                color: mode === m ? "var(--text-main)" : "var(--text-muted)",
                boxShadow: mode === m ? "0 1px 4px rgba(0,0,0,0.1)" : "none",
                transition: "all 0.2s",
              }}
            >
              {m === "login" ? "Connexion" : "Créer un compte"}
            </button>
          ))}
        </div>

        {/* Bouton Google */}
        <button
          type="button"
          onClick={handleGoogle}
          disabled={loading}
          style={{
            width: "100%",
            padding: "13px",
            borderRadius: "12px",
            border: "1.5px solid var(--border-color, #e5e5ea)",
            background: "var(--bg-card)",
            color: "var(--text-main)",
            fontSize: "15px",
            fontWeight: "600",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "10px",
            marginBottom: "20px",
          }}
        >
          <svg width="18" height="18" viewBox="0 0 18 18">
            <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/>
            <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z" fill="#34A853"/>
            <path d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05"/>
            <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335"/>
          </svg>
          Continuer avec Google
        </button>

        {/* Séparateur */}
        <div style={{
          display: "flex",
          alignItems: "center",
          gap: "12px",
          marginBottom: "20px",
        }}>
          <div style={{ flex: 1, height: "1px", background: "var(--border-color, #e5e5ea)" }} />
          <span style={{ color: "var(--text-muted)", fontSize: "13px" }}>ou</span>
          <div style={{ flex: 1, height: "1px", background: "var(--border-color, #e5e5ea)" }} />
        </div>

        {/* Formulaire email */}
        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: "14px" }}>
            <input
              type="email"
              placeholder="Email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              style={inputStyle}
            />
          </div>
          <div style={{ marginBottom: "20px" }}>
            <input
              type="password"
              placeholder="Mot de passe"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              minLength={6}
              style={inputStyle}
            />
          </div>

          {error && (
            <div style={{
              padding: "12px",
              borderRadius: "10px",
              background: "#fef2f2",
              color: "#dc2626",
              fontSize: "14px",
              marginBottom: "16px",
            }}>
              {error}
            </div>
          )}

          {info && (
            <div style={{
              padding: "12px",
              borderRadius: "10px",
              background: "#f0fdf4",
              color: "#16a34a",
              fontSize: "14px",
              marginBottom: "16px",
            }}>
              {info}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              width: "100%",
              padding: "14px",
              borderRadius: "12px",
              border: "none",
              background: "linear-gradient(135deg, #007AFF 0%, #0062CC 100%)",
              color: "white",
              fontSize: "16px",
              fontWeight: "700",
              cursor: loading ? "not-allowed" : "pointer",
              opacity: loading ? 0.7 : 1,
            }}
          >
            {loading ? "…" : mode === "login" ? "Se connecter" : "Créer mon compte"}
          </button>
        </form>

        {/* Mention essai */}
        {mode === "signup" && (
          <p style={{
            textAlign: "center",
            color: "var(--text-muted)",
            fontSize: "13px",
            marginTop: "16px",
            marginBottom: 0,
          }}>
            14 jours gratuits · Sans carte bancaire
          </p>
        )}
      </div>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "13px 14px",
  borderRadius: "12px",
  border: "1.5px solid var(--border-color, #e5e5ea)",
  background: "var(--bg-body)",
  color: "var(--text-main)",
  fontSize: "15px",
  outline: "none",
  boxSizing: "border-box",
};

function translateError(msg: string): string {
  if (msg.includes("Invalid login credentials")) return "Email ou mot de passe incorrect.";
  if (msg.includes("Email not confirmed")) return "Confirme d'abord ton email (vérifie ta boîte mail).";
  if (msg.includes("User already registered")) return "Ce compte existe déjà. Connecte-toi.";
  if (msg.includes("Password should be at least")) return "Le mot de passe doit faire au moins 6 caractères.";
  return msg;
}
