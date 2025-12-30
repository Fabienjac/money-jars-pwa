// src/offlineManager.ts

export interface PendingTransaction {
  id: string;
  type: 'spending' | 'revenue';
  data: any;
  timestamp: number;
  retryCount: number;
}

export interface OfflineState {
  isOnline: boolean;
  pendingTransactions: PendingTransaction[];
  lastSync: number | null;
  cachedTransactions: any[];
}

const STORAGE_KEY = 'offline_data';
const CACHE_KEY = 'cached_transactions';
const MAX_RETRY = 3;

export class OfflineManager {
  private state: OfflineState;
  private listeners: ((state: OfflineState) => void)[] = [];

  constructor() {
    this.state = this.loadState();
    this.setupConnectivityListeners();
  }

  // Charger l'état depuis localStorage
  private loadState(): OfflineState {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        return JSON.parse(stored);
      }
    } catch (e) {
      console.error('Erreur chargement état offline:', e);
    }

    return {
      isOnline: navigator.onLine,
      pendingTransactions: [],
      lastSync: null,
      cachedTransactions: [],
    };
  }

  // Sauvegarder l'état dans localStorage
  private saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state));
      this.notifyListeners();
    } catch (e) {
      console.error('Erreur sauvegarde état offline:', e);
    }
  }

  // Configurer les listeners de connectivité
  private setupConnectivityListeners() {
    window.addEventListener('online', () => {
      console.log('🌐 Connexion rétablie');
      this.state.isOnline = true;
      this.saveState();
      this.syncPendingTransactions();
    });

    window.addEventListener('offline', () => {
      console.log('📴 Hors ligne');
      this.state.isOnline = false;
      this.saveState();
    });

    // Vérifier immédiatement
    this.state.isOnline = navigator.onLine;
  }

  // Ajouter une transaction à la file d'attente
  addPendingTransaction(type: 'spending' | 'revenue', data: any): string {
    const id = `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const pending: PendingTransaction = {
      id,
      type,
      data,
      timestamp: Date.now(),
      retryCount: 0,
    };

    this.state.pendingTransactions.push(pending);
    this.saveState();

    console.log(`📝 Transaction ajoutée à la file (${type}):`, id);

    // Si en ligne, essayer de synchroniser immédiatement
    if (this.state.isOnline) {
      this.syncPendingTransactions();
    }

    return id;
  }

  // Synchroniser les transactions en attente
  async syncPendingTransactions() {
    if (!this.state.isOnline || this.state.pendingTransactions.length === 0) {
      return;
    }

    console.log(`🔄 Synchronisation de ${this.state.pendingTransactions.length} transaction(s)...`);

    const toSync = [...this.state.pendingTransactions];
    const failed: PendingTransaction[] = [];

    for (const pending of toSync) {
      try {
        console.log(`📤 Envoi transaction ${pending.id}...`);
        
        // Préparer les données selon le type
        const payload = pending.type === 'spending' 
          ? {
              action: 'append',
              type: 'spending',
              row: pending.data,
            }
          : {
              action: 'append',
              type: 'revenue',
              row: pending.data,
            };

        const response = await fetch('/.netlify/functions/gsheetProxy', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

        if (response.ok) {
          console.log(`✅ Transaction ${pending.id} synchronisée`);
          // Retirer de la file
          this.state.pendingTransactions = this.state.pendingTransactions.filter(
            t => t.id !== pending.id
          );
        } else {
          console.error(`❌ Échec sync ${pending.id}: ${response.status}`);
          pending.retryCount++;
          
          if (pending.retryCount < MAX_RETRY) {
            failed.push(pending);
          } else {
            console.error(`❌ Transaction ${pending.id} abandonnée après ${MAX_RETRY} tentatives`);
          }
        }
      } catch (error) {
        console.error(`❌ Erreur sync ${pending.id}:`, error);
        pending.retryCount++;
        
        if (pending.retryCount < MAX_RETRY) {
          failed.push(pending);
        }
      }

      // Petit délai entre chaque transaction
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    // Mettre à jour avec les transactions échouées
    this.state.pendingTransactions = failed;
    this.state.lastSync = Date.now();
    this.saveState();

    if (failed.length === 0) {
      console.log('✅ Toutes les transactions synchronisées !');
    } else {
      console.warn(`⚠️ ${failed.length} transaction(s) en échec`);
    }
  }

  // Ajouter des transactions au cache
  cacheTransactions(transactions: any[]) {
    this.state.cachedTransactions = transactions;
    this.saveState();
    console.log(`💾 ${transactions.length} transaction(s) mises en cache`);
  }

  // Récupérer les transactions en cache
  getCachedTransactions(): any[] {
    return this.state.cachedTransactions;
  }

  // Obtenir l'état actuel
  getState(): OfflineState {
    return { ...this.state };
  }

  // S'abonner aux changements d'état
  subscribe(listener: (state: OfflineState) => void) {
    this.listeners.push(listener);
    // Appeler immédiatement avec l'état actuel
    listener(this.getState());
    
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }

  // Notifier tous les listeners
  private notifyListeners() {
    this.listeners.forEach(listener => listener(this.getState()));
  }

  // Vider le cache
  clearCache() {
    this.state.cachedTransactions = [];
    this.saveState();
    console.log('🗑️ Cache vidé');
  }

  // Vider la file d'attente (avec confirmation)
  clearPendingTransactions() {
    this.state.pendingTransactions = [];
    this.saveState();
    console.log('🗑️ File d\'attente vidée');
  }

  // Obtenir le nombre de transactions en attente
  getPendingCount(): number {
    return this.state.pendingTransactions.length;
  }

  // Vérifier si en ligne
  isOnline(): boolean {
    return this.state.isOnline;
  }
}

// Instance singleton
export const offlineManager = new OfflineManager();
