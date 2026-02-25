// src/revenueSourcesUtils.ts

// Même clé que revenueAccountsUtils pour que l'importateur voie les comptes ajoutés dans Réglages
const REVENUE_ACCOUNTS_KEY = "mjars:revenueAccounts";

export interface RevenueSource {
  id: string;
  name: string;
  icon: string;
  category?: string;
  type?: string;
}

/**
 * Charge les sources de revenus depuis localStorage
 * Compatible avec revenueAccountsUtils.ts utilisé dans SettingsView
 */
export function loadRevenueSources(): RevenueSource[] {
  try {
    const stored = localStorage.getItem(REVENUE_ACCOUNTS_KEY);
    
    if (stored) {
      const accounts = JSON.parse(stored);
      console.log('✅ Sources de revenus chargées depuis localStorage (' + REVENUE_ACCOUNTS_KEY + '):', accounts);
      
      if (Array.isArray(accounts)) {
        return accounts.map((acc: any) => ({
          id: acc.id || acc.name?.toLowerCase().replace(/\s+/g, '_') || '',
          name: acc.name || '',
          icon: acc.icon || '💰',
          type: acc.type || '',
          category: acc.type || '',
        }));
      }
    }
    
    console.log('⚠️ Aucune source trouvée dans localStorage (clé: ' + REVENUE_ACCOUNTS_KEY + '), utilisation des sources par défaut');
  } catch (error) {
    console.error('❌ Erreur chargement sources revenus:', error);
  }

  // Sources par défaut si rien trouvé
  return getDefaultRevenueSources();
}

/**
 * Sources de revenus par défaut
 */
export function getDefaultRevenueSources(): RevenueSource[] {
  return [
    { 
      id: 'dtsmoney', 
      name: 'Dtsmoney', 
      icon: '💰', 
      type: 'Passive',
      category: 'Passive'
    },
    { 
      id: 'lgmcorp_fabien', 
      name: 'LGMCorp Fabien', 
      icon: '💎', 
      type: 'Passive Income',
      category: 'Passive Income'
    },
    { 
      id: 'lgmcorp_margot', 
      name: 'LGMCorp Margot', 
      icon: '💎', 
      type: 'Passive Income',
      category: 'Passive Income'
    },
    { 
      id: 'lgmcorp_lise', 
      name: 'LGMCorp Lise', 
      icon: '💎', 
      type: 'Passive Income',
      category: 'Passive Income'
    },
    { 
      id: 'ushare', 
      name: 'Ushare', 
      icon: '🎯', 
      type: 'Business Income',
      category: 'Business Income'
    },
  ];
}

/**
 * Sauvegarde les sources de revenus dans localStorage
 * Compatible avec revenueAccountsUtils
 */
export function saveRevenueSources(sources: RevenueSource[]): void {
  try {
    // Convertir au format RevenueAccount pour compatibilité
    const accounts = sources.map(s => ({
      id: s.id,
      name: s.name,
      icon: s.icon,
      type: s.type || s.category,
    }));
    
    localStorage.setItem(REVENUE_ACCOUNTS_KEY, JSON.stringify(accounts));
    console.log('✅ Sources sauvegardées dans localStorage (' + REVENUE_ACCOUNTS_KEY + ')');
  } catch (error) {
    console.error('❌ Erreur sauvegarde sources revenus:', error);
  }
}
