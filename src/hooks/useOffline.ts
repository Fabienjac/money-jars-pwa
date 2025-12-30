// src/hooks/useOffline.ts
import { useState, useEffect } from 'react';
import { offlineManager, OfflineState } from '../offlineManager';

export const useOffline = () => {
  const [state, setState] = useState<OfflineState>(offlineManager.getState());

  useEffect(() => {
    const unsubscribe = offlineManager.subscribe(setState);
    return unsubscribe;
  }, []);

  return {
    isOnline: state.isOnline,
    pendingCount: state.pendingTransactions.length,
    lastSync: state.lastSync,
    cachedTransactions: state.cachedTransactions,
    
    // Méthodes
    addPendingTransaction: (type: 'spending' | 'revenue', data: any) => 
      offlineManager.addPendingTransaction(type, data),
    
    syncNow: () => offlineManager.syncPendingTransactions(),
    
    cacheTransactions: (transactions: any[]) => 
      offlineManager.cacheTransactions(transactions),
    
    getCachedTransactions: () => offlineManager.getCachedTransactions(),
    
    clearCache: () => offlineManager.clearCache(),
  };
};
