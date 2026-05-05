// src/components/VoiceSpendingModal.tsx
// Modal de saisie vocale d'une dépense — Web Speech API + Gemini + appendSpending
import React, { useState, useRef, useEffect, useCallback } from "react";
import { appendSpending } from "../api";
import { loadTags } from "../tagsUtils";
import { loadAccounts } from "../accountsUtils";

const JAR_KEYS = ["NEC", "FFA", "LTSS", "PLAY", "EDUC", "GIFT"] as const;
const JAR_LABELS: Record<string, string> = {
  NEC: "🏠 Nécessités", FFA: "🌱 Liberté Fin.", LTSS: "🏦 Épargne LT",
  PLAY: "🎮 Fun", EDUC: "📚 Éducation", GIFT: "🎁 Don",
};

type Step = "idle" | "recording" | "transcribed" | "parsing" | "confirm" | "saving" | "done" | "error";

interface ParsedSpending {
  description: string;
  amount: number;
  date: string;    // YYYY-MM-DD
  jar: string;
  tags: string[];
  account: string;
  currency: string;
}

interface Props {
  onClose: () => void;
  onSaved?: () => void;
}

// Détection Web Speech API
const getSpeechRecognition = (): any => {
  if (typeof window === "undefined") return null;
  return (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition || null;
};

export const VoiceSpendingModal: React.FC<Props> = ({ onClose, onSaved }) => {
  const [step, setStep] = useState<Step>("idle");
  const [transcript, setTranscript] = useState("");
  const [interimText, setInterimText] = useState("");
  const [parsed, setParsed] = useState<ParsedSpending | null>(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [saved, setSaved] = useState(false);

  const recognitionRef = useRef<any>(null);
  const tags = loadTags();
  const accounts = loadAccounts();

  const hasSpeechAPI = !!getSpeechRecognition();

  // ── Dictée vocale ──────────────────────────────────────────────────────────

  const startRecording = useCallback(() => {
    const SR = getSpeechRecognition();
    if (!SR) return;

    const rec = new SR();
    rec.lang = "fr-FR";
    rec.continuous = false;
    rec.interimResults = true;
    rec.maxAlternatives = 1;

    rec.onstart = () => setStep("recording");
    rec.onresult = (e: any) => {
      let final = "";
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) final += e.results[i][0].transcript;
        else interim += e.results[i][0].transcript;
      }
      if (final) setTranscript(t => (t + " " + final).trim());
      setInterimText(interim);
    };
    rec.onend = () => {
      setInterimText("");
      setStep(prev => (prev === "recording" ? "transcribed" : prev));
    };
    rec.onerror = (e: any) => {
      console.error("SpeechRecognition error:", e.error);
      setInterimText("");
      if (e.error !== "aborted") {
        setErrorMsg(`Erreur reconnaissance vocale : ${e.error}`);
        setStep("error");
      }
    };

    recognitionRef.current = rec;
    rec.start();
  }, []);

  const stopRecording = useCallback(() => {
    recognitionRef.current?.stop();
  }, []);

  // ── Analyse Gemini ─────────────────────────────────────────────────────────

  const analyzeText = useCallback(async (text: string) => {
    setStep("parsing");
    setErrorMsg("");
    try {
      const today = new Date().toISOString().slice(0, 10);
      const res = await fetch("/.netlify/functions/parseVoiceSpending", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, today }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || `Erreur ${res.status}`);
      setParsed(data as ParsedSpending);
      setStep("confirm");
    } catch (e: any) {
      setErrorMsg(e.message || "Erreur d'analyse");
      setStep("error");
    }
  }, []);

  // ── Sauvegarde ─────────────────────────────────────────────────────────────

  const handleSave = async () => {
    if (!parsed) return;
    setStep("saving");
    try {
      // Convertit YYYY-MM-DD en DD/MM/YYYY pour Google Sheets
      const [y, m, d] = parsed.date.split("-");
      const dateForSheet = `${d}/${m}/${y}`;

      await appendSpending({
        date: dateForSheet,
        description: parsed.description,
        amount: parsed.amount,
        jar: parsed.jar,
        account: parsed.account,
        tags: parsed.tags.join(","),
      });
      setStep("done");
      setSaved(true);
      setTimeout(() => {
        onSaved?.();
        onClose();
      }, 1500);
    } catch (e: any) {
      setErrorMsg(e.message || "Erreur de sauvegarde");
      setStep("error");
    }
  };

  // ── Formatage date pour affichage ──────────────────────────────────────────

  const formatDateDisplay = (iso: string) => {
    if (!iso) return "";
    const [y, m, d] = iso.split("-");
    return `${d}/${m}/${y}`;
  };

  // ── Rendu ──────────────────────────────────────────────────────────────────

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 3000,
        background: "rgba(0,0,0,0.55)", backdropFilter: "blur(4px)",
        display: "flex", alignItems: "flex-end", justifyContent: "center",
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        background: "var(--bg-card)", borderRadius: "24px 24px 0 0",
        padding: "24px 20px 40px", width: "100%", maxWidth: 540,
        boxShadow: "0 -8px 40px rgba(0,0,0,0.18)",
        maxHeight: "92vh", overflowY: "auto",
      }}>
        {/* Handle */}
        <div style={{ width: 36, height: 4, borderRadius: 2, background: "#E5E5EA", margin: "0 auto 20px" }} />

        {/* Titre */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
          <div>
            <div style={{ fontSize: 20, fontWeight: 700, color: "var(--text-main)" }}>🎙️ Saisie vocale</div>
            <div style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 2 }}>
              Dites votre dépense en langage naturel
            </div>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 22, cursor: "pointer", color: "var(--text-muted)", padding: 4 }}>✕</button>
        </div>

        {/* ═══ ÉTAPE 1 : Microphone ═══ */}
        {(step === "idle" || step === "recording" || step === "transcribed") && (<>

          {/* Bouton micro */}
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16, padding: "8px 0 20px" }}>
            {!hasSpeechAPI ? (
              <div style={{ padding: "16px 20px", background: "#FFF5E6", borderRadius: 12, fontSize: 14, color: "#FF9500", textAlign: "center" }}>
                ⚠️ La reconnaissance vocale n'est pas disponible sur ce navigateur.<br />
                <span style={{ fontSize: 12, color: "var(--text-muted)" }}>Utilisez Chrome ou Safari.</span>
              </div>
            ) : (
              <>
                <button
                  onMouseDown={startRecording}
                  onTouchStart={e => { e.preventDefault(); startRecording(); }}
                  onClick={step === "recording" ? stopRecording : (step === "idle" ? startRecording : undefined)}
                  style={{
                    width: 88, height: 88, borderRadius: "50%", border: "none",
                    background: step === "recording"
                      ? "radial-gradient(circle, #FF3B30 0%, #CC2020 100%)"
                      : "radial-gradient(circle, #FF2D78 0%, #CC1960 100%)",
                    boxShadow: step === "recording"
                      ? "0 0 0 8px rgba(255,59,48,0.2), 0 4px 20px rgba(255,59,48,0.5)"
                      : "0 4px 20px rgba(255,45,120,0.4)",
                    fontSize: 36, cursor: "pointer",
                    transition: "all 0.2s",
                    animation: step === "recording" ? "pulse 1.2s ease-in-out infinite" : "none",
                  }}
                >
                  {step === "recording" ? "⏹" : "🎙️"}
                </button>
                <div style={{ fontSize: 14, fontWeight: 600, color: step === "recording" ? "#FF3B30" : "var(--text-muted)" }}>
                  {step === "recording" ? "En cours… Appuyez pour arrêter" : "Appuyez pour parler"}
                </div>
              </>
            )}
          </div>

          {/* Texte transcrit */}
          {(transcript || interimText) && (
            <div style={{ background: "var(--bg-body)", borderRadius: 14, padding: "14px 16px", marginBottom: 16, minHeight: 60 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)", marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.5 }}>
                Texte reconnu
              </div>
              <div style={{ fontSize: 16, color: "var(--text-main)", lineHeight: 1.5 }}>
                {transcript}
                {interimText && <span style={{ color: "var(--text-muted)", fontStyle: "italic" }}> {interimText}</span>}
              </div>
            </div>
          )}

          {/* Saisie manuelle si pas de speech API */}
          {!hasSpeechAPI && (
            <textarea
              placeholder="Tapez votre dépense ici…&#10;Ex : J'ai acheté des fruits au marché pour 45,70 en cash"
              value={transcript}
              onChange={e => { setTranscript(e.target.value); setStep("transcribed"); }}
              style={{
                width: "100%", minHeight: 100, padding: "12px 14px",
                border: "1.5px solid var(--border-color)", borderRadius: 12,
                fontSize: 15, background: "var(--bg-card)", color: "var(--text-main)",
                resize: "vertical", outline: "none", marginBottom: 16, boxSizing: "border-box",
              }}
            />
          )}

          {/* Bouton analyser */}
          {step === "transcribed" && transcript && (
            <button
              onClick={() => analyzeText(transcript)}
              style={{
                width: "100%", padding: "16px", borderRadius: 14, border: "none",
                background: "linear-gradient(135deg, #FF2D78, #CC1960)",
                color: "#fff", fontSize: 17, fontWeight: 700, cursor: "pointer",
                boxShadow: "0 4px 16px rgba(255,45,120,0.35)",
              }}
            >
              ✨ Analyser avec l'IA
            </button>
          )}
        </>)}

        {/* ═══ ÉTAPE 2 : Analyse en cours ═══ */}
        {step === "parsing" && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16, padding: "32px 0" }}>
            <div style={{ width: 48, height: 48, borderRadius: "50%", border: "4px solid #E5E5EA", borderTopColor: "#FF2D78", animation: "spin 0.8s linear infinite" }} />
            <div style={{ fontSize: 16, fontWeight: 600, color: "var(--text-main)" }}>Analyse en cours…</div>
            <div style={{ fontSize: 13, color: "var(--text-muted)", textAlign: "center", maxWidth: 280 }}>
              Gemini analyse votre texte pour détecter le montant, les tags et la jarre
            </div>
            <div style={{ background: "var(--bg-body)", borderRadius: 12, padding: "12px 16px", fontSize: 14, color: "var(--text-muted)", fontStyle: "italic", maxWidth: "100%" }}>
              « {transcript} »
            </div>
          </div>
        )}

        {/* ═══ ÉTAPE 3 : Confirmation ═══ */}
        {step === "confirm" && parsed && (
          <ConfirmForm
            parsed={parsed}
            tags={tags}
            accounts={accounts}
            transcript={transcript}
            onSave={handleSave}
            onRetry={() => { setTranscript(""); setParsed(null); setStep("idle"); }}
            onChange={setParsed}
            formatDateDisplay={formatDateDisplay}
          />
        )}

        {/* ═══ ÉTAPE 4 : Sauvegarde ═══ */}
        {step === "saving" && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16, padding: "32px 0" }}>
            <div style={{ width: 48, height: 48, borderRadius: "50%", border: "4px solid #E5E5EA", borderTopColor: "#34C759", animation: "spin 0.8s linear infinite" }} />
            <div style={{ fontSize: 16, fontWeight: 600, color: "var(--text-main)" }}>Enregistrement…</div>
          </div>
        )}

        {/* ═══ ÉTAPE 5 : Succès ═══ */}
        {step === "done" && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16, padding: "32px 0" }}>
            <div style={{ fontSize: 64 }}>✅</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: "#34C759" }}>Dépense enregistrée !</div>
            {parsed && (
              <div style={{ fontSize: 28, fontWeight: 800, color: "#1C1C1E" }}>{parsed.amount.toFixed(2)} €</div>
            )}
          </div>
        )}

        {/* ═══ ERREUR ═══ */}
        {step === "error" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16, padding: "8px 0" }}>
            <div style={{ background: "#FFEDED", borderRadius: 12, padding: "16px", color: "#FF3B30", fontSize: 14 }}>
              ⚠️ {errorMsg}
            </div>
            <button
              onClick={() => { setStep("idle"); setErrorMsg(""); }}
              style={{ padding: "14px", borderRadius: 12, border: "1.5px solid var(--border-color)", background: "var(--bg-card)", fontSize: 15, fontWeight: 600, cursor: "pointer", color: "var(--text-main)" }}
            >
              Recommencer
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

// ── Sous-composant formulaire de confirmation ──────────────────────────────

interface ConfirmFormProps {
  parsed: ParsedSpending;
  tags: ReturnType<typeof loadTags>;
  accounts: ReturnType<typeof loadAccounts>;
  transcript: string;
  onSave: () => void;
  onRetry: () => void;
  onChange: (p: ParsedSpending) => void;
  formatDateDisplay: (iso: string) => string;
}

const ConfirmForm: React.FC<ConfirmFormProps> = ({
  parsed, tags, accounts, transcript, onSave, onRetry, onChange, formatDateDisplay,
}) => {
  const tag = (id: string) => tags.find(t => t.id === id);

  const toggleTag = (id: string) => {
    onChange({
      ...parsed,
      tags: parsed.tags.includes(id) ? parsed.tags.filter(t => t !== id) : [...parsed.tags, id],
    });
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {/* Texte source */}
      <div style={{ background: "var(--bg-body)", borderRadius: 10, padding: "10px 14px", fontSize: 13, color: "var(--text-muted)", fontStyle: "italic" }}>
        « {transcript} »
      </div>

      {/* Montant — gros */}
      <div style={{ background: "linear-gradient(135deg, #FF2D78, #CC1960)", borderRadius: 16, padding: "20px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.75)", fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5 }}>Montant détecté</div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 4, marginTop: 4 }}>
            <input
              type="number"
              step="0.01"
              value={parsed.amount}
              onChange={e => onChange({ ...parsed, amount: parseFloat(e.target.value) || 0 })}
              style={{
                fontSize: 38, fontWeight: 800, color: "#fff", background: "transparent",
                border: "none", outline: "none", width: 140, letterSpacing: "-0.5px",
              }}
            />
            <span style={{ fontSize: 20, color: "rgba(255,255,255,0.85)", fontWeight: 600 }}>€</span>
          </div>
        </div>
        {/* Date */}
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.75)", marginBottom: 4 }}>Date</div>
          <input
            type="date"
            value={parsed.date}
            onChange={e => onChange({ ...parsed, date: e.target.value })}
            style={{ fontSize: 14, fontWeight: 700, color: "#fff", background: "rgba(255,255,255,0.15)", border: "none", borderRadius: 8, padding: "6px 10px", outline: "none" }}
          />
        </div>
      </div>

      {/* Description */}
      <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <span style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 0.5 }}>Description</span>
        <input
          type="text"
          value={parsed.description}
          onChange={e => onChange({ ...parsed, description: e.target.value })}
          style={{ padding: "11px 14px", border: "1.5px solid var(--border-color)", borderRadius: 12, fontSize: 15, background: "var(--bg-card)", color: "var(--text-main)", outline: "none" }}
        />
      </label>

      {/* Jarre + Compte côte à côte */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 0.5 }}>Jarre</span>
          <select
            value={parsed.jar}
            onChange={e => onChange({ ...parsed, jar: e.target.value })}
            style={{ padding: "10px 12px", border: "1.5px solid var(--border-color)", borderRadius: 12, fontSize: 14, background: "var(--bg-card)", color: "var(--text-main)", outline: "none" }}
          >
            {JAR_KEYS.map(k => (
              <option key={k} value={k}>{JAR_LABELS[k]}</option>
            ))}
          </select>
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 0.5 }}>Compte</span>
          <select
            value={parsed.account}
            onChange={e => onChange({ ...parsed, account: e.target.value })}
            style={{ padding: "10px 12px", border: "1.5px solid var(--border-color)", borderRadius: 12, fontSize: 14, background: "var(--bg-card)", color: "var(--text-main)", outline: "none" }}
          >
            {accounts.map(a => (
              <option key={a.id} value={a.name}>{a.icon} {a.name}</option>
            ))}
          </select>
        </label>
      </div>

      {/* Tags */}
      <div>
        <span style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 0.5 }}>Tags</span>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 8 }}>
          {tags.map(t => {
            const active = parsed.tags.includes(t.id);
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => toggleTag(t.id)}
                style={{
                  padding: "7px 14px", borderRadius: 20, border: `1.5px solid ${active ? t.color : "var(--border-color)"}`,
                  background: active ? `${t.color}18` : "var(--bg-card)",
                  color: active ? t.color : "var(--text-muted)",
                  fontSize: 13, fontWeight: 600, cursor: "pointer",
                }}
              >
                {t.emoji} {t.name}
              </button>
            );
          })}
        </div>
      </div>

      {/* Boutons */}
      <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
        <button
          onClick={onRetry}
          style={{ flex: 1, padding: "14px", borderRadius: 14, border: "1.5px solid var(--border-color)", background: "var(--bg-card)", fontSize: 15, fontWeight: 600, cursor: "pointer", color: "var(--text-muted)" }}
        >
          🔄 Recommencer
        </button>
        <button
          onClick={onSave}
          style={{
            flex: 2, padding: "14px", borderRadius: 14, border: "none",
            background: "linear-gradient(135deg, #34C759, #25A244)",
            color: "#fff", fontSize: 15, fontWeight: 700, cursor: "pointer",
            boxShadow: "0 4px 14px rgba(52,199,89,0.4)",
          }}
        >
          ✅ Enregistrer
        </button>
      </div>
    </div>
  );
};

export default VoiceSpendingModal;
