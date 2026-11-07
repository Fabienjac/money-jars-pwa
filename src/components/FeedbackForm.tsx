// src/components/FeedbackForm.tsx
// Formulaire de suggestion : catégorie, message libre, e-mail facultatif pour recevoir une réponse.
import React, { useState } from "react";
import { useT, useLang } from "../i18n";
import { sendFeedback, type FeedbackCategory } from "../api";

const CATEGORIES: FeedbackCategory[] = ["idea", "bug", "ux"];
const MAX_LENGTH = 2000;
const MIN_LENGTH = 3;

interface Props {
  onClose: () => void;
}

const FeedbackForm: React.FC<Props> = ({ onClose }) => {
  const t = useT();
  const lang = useLang();
  const [category, setCategory] = useState<FeedbackCategory>("idea");
  const [message, setMessage] = useState("");
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [error, setError] = useState("");

  const trimmed = message.trim();
  const emailOk = email.trim() === "" || /^\S+@\S+\.\S+$/.test(email.trim());
  const canSend = trimmed.length >= MIN_LENGTH && emailOk && status !== "sending";

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSend) return;
    setStatus("sending");
    setError("");
    const res = await sendFeedback({ category, message: trimmed, email: email.trim() || undefined, lang });
    if (res.ok) {
      setStatus("sent");
    } else {
      setStatus("error");
      setError(res.error || t("fb.error"));
    }
  };

  if (status === "sent") {
    return (
      <section className="settings-section feedback-panel" role="status">
        <h3 className="settings-section-title">🙏 {t("fb.thanksTitle")}</h3>
        <p className="settings-section-desc">{t("fb.thanks")}</p>
        <button type="button" className="settings-btn settings-btn-secondary feedback-close" onClick={onClose}>
          {t("fb.close")}
        </button>
      </section>
    );
  }

  return (
    <form className="settings-section feedback-panel" onSubmit={submit}>
      <h3 className="settings-section-title">💡 {t("fb.title")}</h3>
      <p className="settings-section-desc">{t("fb.desc")}</p>

      <div className="rsf-accounts" role="radiogroup" aria-label={t("fb.category")}>
        {CATEGORIES.map((c) => (
          <button
            key={c}
            type="button"
            role="radio"
            aria-checked={category === c}
            className={`rsf-account${category === c ? " active" : ""}`}
            onClick={() => setCategory(c)}
          >
            {t(`fb.cat.${c}` as const)}
          </button>
        ))}
      </div>

      <label className="feedback-label" htmlFor="fb-message">{t("fb.message")}</label>
      <textarea
        id="fb-message"
        className="feedback-field feedback-textarea"
        value={message}
        maxLength={MAX_LENGTH}
        rows={5}
        placeholder={t("fb.messagePlaceholder")}
        onChange={(e) => setMessage(e.target.value)}
      />
      <div className="feedback-count">{message.length}/{MAX_LENGTH}</div>

      <label className="feedback-label" htmlFor="fb-email">{t("fb.email")}</label>
      <input
        id="fb-email"
        className="feedback-field"
        type="email"
        inputMode="email"
        autoComplete="email"
        value={email}
        placeholder={t("fb.emailPlaceholder")}
        onChange={(e) => setEmail(e.target.value)}
      />
      {!emailOk && <div className="feedback-error">{t("fb.emailInvalid")}</div>}

      {status === "error" && <div className="feedback-error" role="alert">{error}</div>}

      <div className="settings-btn-group">
        <button type="button" className="settings-btn settings-btn-secondary" onClick={onClose}>
          {t("fb.cancel")}
        </button>
        <button type="submit" className="settings-btn settings-btn-primary" disabled={!canSend}>
          {status === "sending" ? t("fb.sending") : t("fb.send")}
        </button>
      </div>
    </form>
  );
};

export default FeedbackForm;
