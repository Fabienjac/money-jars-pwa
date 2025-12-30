// src/components/TransactionEditor.tsx
import React, { useState } from "react";
import { JarKey } from "../types";
import { TagSelector } from "./TagSelector";
import { TagList } from "./TagBadge";
import { tagsToString, tagsFromString } from "../tagsUtils";

interface Transaction {
  date: string;
  description: string;
  amount: number;
  currency?: string;
  suggestedJar?: JarKey;
  suggestedAccount?: string;
  selected?: boolean;
  tags?: string;
}

interface Account {
  name: string;
  emoji: string;
}

interface TransactionEditorProps {
  transaction: Transaction;
  onSave: (updatedTransaction: Transaction) => void;
  onCancel: () => void;
  accounts: Account[];
}

export const TransactionEditor: React.FC<TransactionEditorProps> = ({
  transaction,
  onSave,
  onCancel,
  accounts,
}) => {
  const [editedTx, setEditedTx] = useState<Transaction>({ ...transaction });
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>(
    tagsFromString(transaction.tags)
  );

  const jars: JarKey[] = ["NEC", "FFA", "LTSS", "PLAY", "EDUC", "GIFT"];

  const jarLabels: Record<JarKey, string> = {
    NEC: "Nécessités",
    FFA: "Liberté Financière",
    LTSS: "Épargne Long Terme",
    PLAY: "Loisirs",
    EDUC: "Éducation",
    GIFT: "Dons",
  };

  const handleSave = () => {
    const updatedTransaction = {
      ...editedTx,
      tags: tagsToString(selectedTagIds),
    };
    onSave(updatedTransaction);
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "rgba(0, 0, 0, 0.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
        padding: "16px",
      }}
      onClick={onCancel}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          backgroundColor: "var(--bg-card)",
          borderRadius: "20px",
          boxShadow: "0 20px 60px rgba(0, 0, 0, 0.3)",
          maxWidth: "600px",
          width: "100%",
          maxHeight: "90vh",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: "20px 24px",
            borderBottom: "1px solid var(--border-color)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <h3
            style={{
              margin: 0,
              fontSize: "20px",
              fontWeight: "700",
              color: "var(--text-main)",
            }}
          >
            ✏️ Éditer la transaction
          </h3>
          <button
            onClick={onCancel}
            style={{
              border: "none",
              background: "none",
              color: "var(--text-muted)",
              fontSize: "24px",
              cursor: "pointer",
              padding: "4px",
              lineHeight: 1,
            }}
          >
            ×
          </button>
        </div>

        {/* Content */}
        <div
          style={{
            padding: "24px",
            overflowY: "auto",
            flex: 1,
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
            {/* Date */}
            <div>
              <label
                style={{
                  display: "block",
                  fontSize: "14px",
                  fontWeight: "600",
                  color: "var(--text-main)",
                  marginBottom: "8px",
                }}
              >
                📅 Date
              </label>
              <input
                type="date"
                value={editedTx.date}
                onChange={(e) =>
                  setEditedTx({ ...editedTx, date: e.target.value })
                }
                style={{
                  width: "100%",
                  padding: "12px 16px",
                  borderRadius: "12px",
                  border: "1px solid var(--border-color)",
                  backgroundColor: "var(--bg-body)",
                  color: "var(--text-main)",
                  fontSize: "14px",
                }}
              />
            </div>

            {/* Description */}
            <div>
              <label
                style={{
                  display: "block",
                  fontSize: "14px",
                  fontWeight: "600",
                  color: "var(--text-main)",
                  marginBottom: "8px",
                }}
              >
                📝 Description
              </label>
              <input
                type="text"
                value={editedTx.description}
                onChange={(e) =>
                  setEditedTx({ ...editedTx, description: e.target.value })
                }
                style={{
                  width: "100%",
                  padding: "12px 16px",
                  borderRadius: "12px",
                  border: "1px solid var(--border-color)",
                  backgroundColor: "var(--bg-body)",
                  color: "var(--text-main)",
                  fontSize: "14px",
                }}
              />
            </div>

            {/* Montant */}
            <div>
              <label
                style={{
                  display: "block",
                  fontSize: "14px",
                  fontWeight: "600",
                  color: "var(--text-main)",
                  marginBottom: "8px",
                }}
              >
                💰 Montant
              </label>
              <div style={{ display: "flex", gap: "8px" }}>
                <input
                  type="number"
                  step="0.01"
                  value={editedTx.amount}
                  onChange={(e) =>
                    setEditedTx({ ...editedTx, amount: parseFloat(e.target.value) || 0 })
                  }
                  style={{
                    flex: 1,
                    padding: "12px 16px",
                    borderRadius: "12px",
                    border: "1px solid var(--border-color)",
                    backgroundColor: "var(--bg-body)",
                    color: "var(--text-main)",
                    fontSize: "14px",
                  }}
                />
                <div
                  style={{
                    padding: "12px 20px",
                    borderRadius: "12px",
                    backgroundColor: "rgba(0, 122, 255, 0.1)",
                    color: "var(--jar-nec)",
                    fontSize: "14px",
                    fontWeight: "700",
                    display: "flex",
                    alignItems: "center",
                  }}
                >
                  {editedTx.currency || "EUR"}
                </div>
              </div>
            </div>

            {/* Jar */}
            <div>
              <label
                style={{
                  display: "block",
                  fontSize: "14px",
                  fontWeight: "600",
                  color: "var(--text-main)",
                  marginBottom: "12px",
                }}
              >
                🏺 Jar
              </label>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(3, 1fr)",
                  gap: "8px",
                }}
              >
                {jars.map((jar) => (
                  <button
                    key={jar}
                    onClick={() => setEditedTx({ ...editedTx, suggestedJar: jar })}
                    style={{
                      padding: "12px",
                      borderRadius: "12px",
                      border:
                        editedTx.suggestedJar === jar
                          ? `2px solid var(--jar-${jar.toLowerCase()})`
                          : "1px solid var(--border-color)",
                      background:
                        editedTx.suggestedJar === jar
                          ? `var(--jar-${jar.toLowerCase()})`
                          : "var(--bg-body)",
                      color: editedTx.suggestedJar === jar ? "white" : "var(--text-main)",
                      fontSize: "13px",
                      fontWeight: "700",
                      cursor: "pointer",
                      transition: "all 0.2s",
                    }}
                  >
                    {jarLabels[jar]}
                  </button>
                ))}
              </div>
            </div>

            {/* Compte */}
            <div>
              <label
                style={{
                  display: "block",
                  fontSize: "14px",
                  fontWeight: "600",
                  color: "var(--text-main)",
                  marginBottom: "12px",
                }}
              >
                💳 Compte
              </label>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(2, 1fr)",
                  gap: "8px",
                }}
              >
                {accounts.map((account) => (
                  <button
                    key={account.name}
                    onClick={() =>
                      setEditedTx({ ...editedTx, suggestedAccount: account.name })
                    }
                    style={{
                      padding: "12px",
                      borderRadius: "12px",
                      border:
                        editedTx.suggestedAccount === account.name
                          ? "2px solid var(--jar-nec)"
                          : "1px solid var(--border-color)",
                      background:
                        editedTx.suggestedAccount === account.name
                          ? "rgba(0, 122, 255, 0.1)"
                          : "var(--bg-body)",
                      color: "var(--text-main)",
                      fontSize: "13px",
                      fontWeight: "600",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                      transition: "all 0.2s",
                    }}
                  >
                    <span style={{ fontSize: "20px" }}>{account.emoji}</span>
                    <span>{account.name}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Tags */}
            <div>
              <label
                style={{
                  display: "block",
                  fontSize: "14px",
                  fontWeight: "600",
                  color: "var(--text-main)",
                  marginBottom: "12px",
                }}
              >
                🏷️ Tags
              </label>
              <TagSelector
                selectedTags={selectedTagIds}
                onChange={setSelectedTagIds}
                compact={false}
              />
            </div>

            {/* Tags sélectionnés */}
            {selectedTagIds.length > 0 && (
              <div
                style={{
                  padding: "16px",
                  borderRadius: "12px",
                  backgroundColor: "rgba(0, 122, 255, 0.05)",
                  border: "1px solid rgba(0, 122, 255, 0.2)",
                }}
              >
                <p
                  style={{
                    margin: "0 0 8px",
                    fontSize: "13px",
                    color: "var(--text-muted)",
                    fontWeight: "600",
                  }}
                >
                  Tags sélectionnés :
                </p>
                <TagList tagIds={selectedTagIds} size="medium" />
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div
          style={{
            padding: "16px 24px",
            borderTop: "1px solid var(--border-color)",
            display: "flex",
            gap: "12px",
          }}
        >
          <button
            onClick={onCancel}
            style={{
              flex: 1,
              padding: "14px",
              borderRadius: "12px",
              border: "1px solid var(--border-color)",
              background: "var(--bg-body)",
              color: "var(--text-main)",
              fontSize: "15px",
              fontWeight: "600",
              cursor: "pointer",
            }}
          >
            Annuler
          </button>
          <button
            onClick={handleSave}
            style={{
              flex: 1,
              padding: "14px",
              borderRadius: "12px",
              border: "none",
              background: "linear-gradient(135deg, #34C759 0%, #28a745 100%)",
              color: "white",
              fontSize: "15px",
              fontWeight: "700",
              cursor: "pointer",
            }}
          >
            Enregistrer
          </button>
        </div>
      </div>
    </div>
  );
};
