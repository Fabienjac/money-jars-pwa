// Dans src/types.ts, ajoutez le champ tags à SpendingRow

export interface SpendingRow {
  date: string;
  jar: string;
  account: string;
  amount: number;
  description: string;
  tags?: string; // ✅ AJOUTER CETTE LIGNE
}
