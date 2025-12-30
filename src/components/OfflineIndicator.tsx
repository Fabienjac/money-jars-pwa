// src/components/OfflineIndicator.tsx
import React, { useState, useEffect } from 'react';
import { offlineManager, OfflineState } from '../offlineManager';

export const OfflineIndicator: React.FC = () => {
  const [state, setState] = useState<OfflineState>(offlineManager.getState());

  useEffect(() => {
    const unsubscribe = offlineManager.subscribe(setState);
    return unsubscribe;
  }, []);

  const handleSync = () => {
    offlineManager.syncPendingTransactions();
  };

  if (state.isOnline && state.pendingTransactions.length === 0) {
    return null; // Masquer si en ligne et rien en attente
  }

  return (
    <div
      style={{
        position: 'fixed',
        top: '16px',
        right: '16px',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        padding: '12px 16px',
        borderRadius: '12px',
        backgroundColor: state.isOnline ? '#34C759' : '#FF9500',
        color: 'white',
        boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
        fontSize: '14px',
        fontWeight: '600',
      }}
    >
      {/* Icône de statut */}
      <div
        style={{
          width: '8px',
          height: '8px',
          borderRadius: '50%',
          backgroundColor: 'white',
          animation: state.isOnline ? 'pulse 2s infinite' : 'none',
        }}
      />

      {/* Message */}
      <div>
        {state.isOnline ? (
          <>
            {state.pendingTransactions.length > 0 ? (
              <>
                🔄 Synchronisation de {state.pendingTransactions.length} transaction(s)...
              </>
            ) : (
              <>✅ En ligne</>
            )}
          </>
        ) : (
          <>
            📴 Hors ligne
            {state.pendingTransactions.length > 0 && (
              <> • {state.pendingTransactions.length} en attente</>
            )}
          </>
        )}
      </div>

      {/* Bouton sync manuel */}
      {state.isOnline && state.pendingTransactions.length > 0 && (
        <button
          onClick={handleSync}
          style={{
            padding: '6px 12px',
            borderRadius: '8px',
            border: 'none',
            backgroundColor: 'rgba(255,255,255,0.2)',
            color: 'white',
            fontSize: '12px',
            fontWeight: '600',
            cursor: 'pointer',
            transition: 'all 0.2s',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.3)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.2)';
          }}
        >
          Synchroniser
        </button>
      )}

      {/* Animation pulse */}
      <style>{`
        @keyframes pulse {
          0%, 100% {
            opacity: 1;
          }
          50% {
            opacity: 0.5;
          }
        }
      `}</style>
    </div>
  );
};
