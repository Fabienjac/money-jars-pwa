/* ========================================
   RÉGLAGES
   ======================================== */

.settings-page {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.settings-section {
  margin-bottom: 16px;
}

.settings-section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  margin-bottom: 8px;
}

.settings-section h3 {
  margin: 0;
  font-size: 18px;
}

.settings-helper {
  margin: 0 0 12px;
  font-size: 13px;
  color: var(--text-muted);
}

.settings-total-badge {
  font-size: 13px;
  background: rgba(148, 163, 184, 0.15);
  padding: 6px 10px;
  border-radius: 999px;
}

.settings-total-ok {
  color: #22c55e;
}

.settings-total-error {
  color: #ef4444;
}

.settings-jars-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 12px;
}

.settings-jar-card {
  border-radius: 18px;
  padding: 14px 16px;
  background: rgba(248, 250, 252, 0.85);
  border: 1px solid rgba(226, 232, 240, 0.9);
}

.app-shell.dark .settings-jar-card {
  background: rgba(15, 23, 42, 0.6);
  border-color: rgba(51, 65, 85, 0.9);
}

.settings-jar-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  margin-bottom: 8px;
}

.settings-jar-key {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 1px;
  color: var(--text-muted);
  margin: 0;
}

.settings-jar-label {
  margin: 2px 0 0;
  font-size: 15px;
}

.settings-jar-fields {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
  margin-top: 8px;
}

.settings-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 12px;
}

.settings-field span {
  color: var(--text-muted);
}

.settings-input-with-suffix {
  display: flex;
  align-items: center;
  border-radius: 12px;
  border: 1px solid var(--border-color);
  padding: 4px 8px;
  background: var(--bg-card);
}

.settings-input-with-suffix input {
  border: none;
  background: transparent;
  flex: 1;
  font-size: 14px;
  padding: 4px 0;
}

.settings-input-with-suffix .suffix {
  font-size: 12px;
  color: var(--text-muted);
  margin-left: 4px;
}

.settings-actions {
  margin-top: 14px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.settings-warning {
  font-size: 12px;
  color: #ea580c;
}

.settings-empty {
  font-size: 13px;
  color: var(--text-muted);
  margin: 8px 0 14px;
}

.settings-rules-list {
  list-style: none;
  padding: 0;
  margin: 0 0 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.settings-rule-item {
  border-radius: 14px;
  padding: 10px 12px;
  border: 1px solid var(--border-color);
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.settings-rule-main {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
}

.settings-rule-kind {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.8px;
  color: var(--text-muted);
}

.settings-rule-keyword {
  font-weight: 600;
}

.settings-rule-jar {
  font-size: 12px;
  color: var(--text-muted);
}

.settings-rule-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.settings-rule-chip {
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 999px;
  background: rgba(148, 163, 184, 0.18);
}

.settings-rule-form {
  margin-top: 8px;
  border-top: 1px dashed var(--border-color);
  padding-top: 10px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.settings-rule-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 10px;
}

@media (min-width: 768px) {
  .settings-jars-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .settings-rule-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
