import React from 'react';

export type TabKey = 'spending' | 'revenue' | 'history' | 'totals';

interface Props {
  active: TabKey;
  onChange: (tab: TabKey) => void;
}

const labels: Record<TabKey, string> = {
  spending: '+ Dépense',
  revenue: '+ Revenu',
  history: 'Historique',
  totals: 'Jarres',
};

export const NavBar: React.FC<Props> = ({ active, onChange }) => {
  return (
    <nav
      style={{
        display: 'flex',
        gap: 8,
        padding: '8px 12px',
        borderBottom: '1px solid #ddd',
        position: 'sticky',
        top: 0,
        background: '#fff',
        zIndex: 10,
      }}
    >
      {Object.entries(labels).map(([key, label]) => {
        const k = key as TabKey;
        const isActive = k === active;
        return (
          <button
            key={k}
            onClick={() => onChange(k)}
            style={{
              flex: 1,
              padding: '8px 4px',
              borderRadius: 999,
              border: isActive ? '1px solid #222' : '1px solid #ccc',
              background: isActive ? '#222' : '#f5f5f5',
              color: isActive ? '#fff' : '#333',
              fontSize: 14,
            }}
          >
            {label}
          </button>
        );
      })}
    </nav>
  );
};
