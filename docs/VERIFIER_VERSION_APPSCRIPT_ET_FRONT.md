# Vérifier la version Apps Script et que le front envoie bien le POST

## 1. Vérifier que la **nouvelle version** du script est utilisée

### Option A : Ajouter une version dans la réponse du script

En haut du fichier Apps Script, avec **SPREADSHEET_ID** et **API_KEY**, ajoute :

```javascript
const SCRIPT_VERSION = 'v2-accounts-2025-02-25';
```

Puis dans **`getAccountsFromSheet`**, ajoute `_scriptVersion` dans les deux return :

```javascript
function getAccountsFromSheet(ss) {
  const sh = ss.getSheetByName('Accounts');
  if (!sh) return { accounts: [], _scriptVersion: SCRIPT_VERSION };
  // ... tout le code existant ...
  return { accounts: accounts, _scriptVersion: SCRIPT_VERSION };
}
```

**Sauvegarde** puis **Déployer > Gérer les déploiements > Modifier (crayon) > Version : Nouvelle version > Déployer**.

Ensuite, ouvre dans le navigateur (en étant connecté avec la clé) :

```
https://comforting-clafoutis-10a1f3.netlify.app/.netlify/functions/gsheetProxy?action=getAccounts&key=MoneyApp_2025_fabien_secret
```

Si la réponse JSON contient **`"_scriptVersion": "v2-accounts-2025-02-25"`**, c’est bien la nouvelle version du script qui tourne.

---

### Option B : Vérifier le déploiement dans l’éditeur Apps Script

1. Ouvre ton projet Apps Script.
2. **Déployer > Gérer les déploiements**.
3. Clique sur le **crayon** (Modifier) à côté du déploiement « Web app ».
4. Regarde **Version** :
   - Si c’est **« Head»** → chaque sauvegarde du script est utilisée (pas besoin de « Nouvelle version »).
   - Si c’est **« Version X »** → seules les déploiements avec « Nouvelle version » mettent à jour le code.
5. Pour forcer la nouvelle version : **Version > Nouvelle version**, donne un nom (ex. « Avec setAccounts »), puis **Déployer**.

L’URL du déploiement (ex. `https://script.google.com/macros/s/.../exec`) ne change pas ; c’est le **code exécuté** qui est celui de la version que tu viens de déployer.

---

## 2. Vérifier que le **front** envoie bien le POST (dernière version déployée)

### A. Dernière version du code sur Netlify

1. Les changements (setAccounts, logs, etc.) doivent être **committés et poussés** sur Git.
2. Netlify doit avoir **rebuild** le site (onglet « Deploys » sur Netlify).
3. Ensuite, **vide le cache du navigateur** ou ouvre le site en **navigation privée** pour être sûr de charger le bon JS.

### B. Voir si le POST part bien

1. Ouvre l’app :  
   `https://comforting-clafoutis-10a1f3.netlify.app/`
2. Ouvre les **outils de développement** (F12).
3. Onglet **Console** (pas Réseau).
4. Va dans **Réglages**, ajoute un compte (nom + icône puis « Ajouter »).
5. Dans la console, tu devrais voir une ligne du type :  
   **`setAccounts: envoi de X compte(s) vers https://...gsheetProxy`**

- Si tu **vois** ce message → le front envoie bien le POST ; regarde alors l’onglet **Réseau**, filtre par `gsheetProxy`, et cherche une requête en **POST** (pas GET).
- Si tu **ne vois pas** ce message → soit le site chargé est une ancienne version (cache / pas de nouveau déploiement), soit le clic n’exécute pas ce code (autre bouton / autre écran).

### C. Tester le POST à la main (pour être sûr que le script réagit)

Dans la **Console** du navigateur (toujours sur ton site Netlify), colle et exécute :

```javascript
fetch('https://comforting-clafoutis-10a1f3.netlify.app/.netlify/functions/gsheetProxy', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    key: 'MoneyApp_2025_fabien_secret',
    action: 'setAccounts',
    accounts: [
      { id: 'test_1', name: 'Compte test', icon: '💳', color: '' }
    ]
  })
})
.then(r => r.json())
.then(data => console.log('Réponse script:', data))
.catch(err => console.error('Erreur:', err));
```

- Si la réponse contient **`ok: true`** (et éventuellement **`written: 1`**) → le script reçoit bien le POST et écrit dans le Sheet ; le problème vient du front (ancienne version ou clic qui ne déclenche pas l’appel).
- Si la réponse contient **`error: 'missing accounts'`** → le body n’arrive pas correctement au script (à vérifier côté Netlify / proxy).
- Si tu as une **erreur réseau** ou **CORS** → problème d’URL ou de configuration Netlify.

---

## 3. Résumé

| À vérifier | Où / comment |
|------------|----------------|
| Nouvelle version du script | GET `?action=getAccounts&key=...` → réponse avec `_scriptVersion` ou Déployer > Gérer les déploiements > Version = Nouvelle version |
| Nouvelle version du front | Git poussé + Netlify rebuild + cache navigateur vidé ou navigation privée |
| Le POST part bien | Console : message « setAccounts: envoi de X compte(s)… » + Réseau : requête POST vers gsheetProxy |
| Le script reçoit le POST | Test manuel avec le `fetch` ci-dessus dans la console |

Une fois ces points vérifiés, tu sais soit que c’est la nouvelle version du script qui est utilisée, soit que le front n’envoie pas encore le POST (et dans ce cas, la cause est côté déploiement / cache du front).
