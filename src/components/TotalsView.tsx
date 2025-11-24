import React, { useEffect, useState } from 'react';
import { fetchTotals } from '../api';
import { JarKey, TotalsResponse } from '../types';

const JAR_LABELS: Record<JarKey, string> = {
  NEC: 'Nécessités',
  FFA: 'Liberté Financière',
  LTSS: 'Épargne Long Terme',
  PLAY: 'Plaisir',
  EDUC: 'Éducation',
  GIFT: 'Don',
};

export const TotalsView: React.FC = () => {
  const [data, setData] = useState<TotalsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetchTotals();
      setData(res);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  return (
    <div style={{ padding: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <h2>Jarres (totaux)</h2>
        <button onClick={load} disabled={loading}>
          ↻ Rafraîchir
        </button>
      </div>

      {loading && <p>Chargement...</p>}
      {error && <p style={{ color: 'red' }}>{error}</p>}
      {!data && !loading && !error && <p>Pas encore de données.</p>}

      {data && (
        <>
          <p>
            Revenus totaux : <strong>{data.totalRevenues.toFixed(2)} €</strong>
          </p>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
              gap: 12,
              marginTop: 12,
            }}
          >
            {(Object.keys(data.jars) as JarKey[]).map((jar) => {
              const j = data.jars[jar];
              const split = data.split[jar] * 100;
              return (
                <div
                  key={jar}
                  style={{
                    border: '1px solid #ddd',
                    borderRadius: 12,
                    padding: 12,
                    background: '#fafafa',
                  }}
                >
                  <h3 style={{ marginTop: 0, marginBottom: 4 }}>{jar}</h3>
                  <p style={{ margin: 0, fontSize: 12 }}>
                    {JAR_LABELS[jar]} — {split.toFixed(1)}% prévu
                  </p>
                  <hr />
                  <p style={{ margin: '4px 0' }}>
                    Revenus : <strong>{j.revenues.toFixed(2)} €</strong>
                  </p>
                  <p style={{ margin: '4px 0' }}>
                    Dépenses : <strong>{j.spendings.toFixed(2)} €</strong>
                  </p>
                  <p style={{ margin: '4px 0' }}>
                    Solde :{' '}
                    <strong style={{ color: j.net >= 0 ? 'green' : 'red' }}>
                      {j.net.toFixed(2)} €
                    </strong>
                  </p>
                  <p style={{ margin: '4px 0', fontSize: 12, opacity: 0.8 }}>
                    Part réelle des revenus : {j.revPct.toFixed(1)}%
                  </p>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
};
