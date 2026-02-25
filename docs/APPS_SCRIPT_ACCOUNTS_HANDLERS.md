# Code Apps Script à ajouter : comptes (Accounts & RevenueAccounts)

Copie ce bloc dans ton fichier Apps Script **dans la fonction `handle`**, avec les autres `if (action === '...')`, et ajoute les **2 fonctions helper** à la fin du fichier.

---

## 1. Dans `handle(e, method)`, après `if (action === 'setSplit') { ... }` et avant `return json({ error: 'unknown action' });` :

```javascript
    if (action === 'getAccounts') {
      return json(getAccountsFromSheet(ss));
    }
    if (action === 'setAccounts') {
      const accounts = body.accounts;
      if (accounts === undefined || accounts === null) {
        return json({ ok: false, error: 'missing accounts', hint: 'Body must contain { action: "setAccounts", accounts: [...] }' });
      }
      if (!Array.isArray(accounts)) {
        return json({ ok: false, error: 'accounts must be an array', received: typeof accounts });
      }
      return json(setAccountsToSheet(ss, accounts));
    }
    if (action === 'getRevenueAccounts') {
      return json(getRevenueAccountsFromSheet(ss));
    }
    if (action === 'setRevenueAccounts') {
      return json(setRevenueAccountsToSheet(ss, body.accounts || []));
    }
```

---

## 2. À la fin du fichier (avant ou après les autres helpers), ajoute ces 4 fonctions :

```javascript
/***** ACCOUNTS (onglet Accounts) *****/
function getAccountsFromSheet(ss) {
  const sh = ss.getSheetByName('Accounts');
  if (!sh) return { accounts: [] };
  const values = sh.getDataRange().getValues();
  if (!values || values.length < 2) return { accounts: [] };
  const header = values[0].map(function(c) { return String(c || '').toLowerCase(); });
  const idCol = header.indexOf('id') >= 0 ? header.indexOf('id') : 0;
  const nameCol = header.indexOf('name') >= 0 ? header.indexOf('name') : 1;
  const iconCol = header.indexOf('icon') >= 0 ? header.indexOf('icon') : 2;
  const colorCol = header.indexOf('color') >= 0 ? header.indexOf('color') : 3;
  const accounts = [];
  for (var i = 1; i < values.length; i++) {
    var row = values[i];
    var id = String(row[idCol] || '').trim();
    var name = String(row[nameCol] || '').trim();
    if (!id && !name) continue;
    accounts.push({
      id: id || 'acc_' + i,
      name: name || 'Compte ' + i,
      icon: row[iconCol] != null ? String(row[iconCol]).trim() : undefined,
      color: row[colorCol] != null ? String(row[colorCol]).trim() : undefined
    });
  }
  return { accounts: accounts };
}

function setAccountsToSheet(ss, accounts) {
  if (!accounts || !Array.isArray(accounts)) return { ok: false, error: 'invalid accounts' };
  try {
    var sh = ss.getSheetByName('Accounts');
    if (!sh) sh = ss.insertSheet('Accounts');
    var rows = [['id', 'name', 'icon', 'color']];
    for (var i = 0; i < accounts.length; i++) {
      var a = accounts[i];
      rows.push([
        a.id || '',
        a.name || '',
        a.icon != null ? String(a.icon) : '',
        a.color != null ? String(a.color) : ''
      ]);
    }
    sh.clearContents();
    if (rows.length > 0) {
      sh.getRange(1, 1, rows.length, 4).setValues(rows);
    }
    return { ok: true, written: rows.length - 1 };
  } catch (err) {
    return { ok: false, error: String(err.message || err) };
  }
}

/***** REVENUE ACCOUNTS (onglet RevenueAccount) *****/
function getRevenueAccountsFromSheet(ss) {
  const sh = ss.getSheetByName('RevenueAccount') || ss.getSheetByName('RevenueAccounts');
  if (!sh) return { accounts: [] };
  const values = sh.getDataRange().getValues();
  if (!values || values.length < 2) return { accounts: [] };
  const header = values[0].map(function(c) { return String(c || '').toLowerCase(); });
  const idCol = header.indexOf('id') >= 0 ? header.indexOf('id') : 0;
  const nameCol = header.indexOf('name') >= 0 ? header.indexOf('name') : 1;
  const typeCol = header.indexOf('type') >= 0 ? header.indexOf('type') : 2;
  const iconCol = header.indexOf('icon') >= 0 ? header.indexOf('icon') : 3;
  const colorCol = header.indexOf('color') >= 0 ? header.indexOf('color') : 4;
  const accounts = [];
  for (var i = 1; i < values.length; i++) {
    var row = values[i];
    var id = String(row[idCol] || '').trim();
    var name = String(row[nameCol] || '').trim();
    if (!id && !name) continue;
    accounts.push({
      id: id || 'rev_' + i,
      name: name || 'Revenu ' + i,
      type: row[typeCol] != null ? String(row[typeCol]).trim() : undefined,
      icon: row[iconCol] != null ? String(row[iconCol]).trim() : undefined,
      color: row[colorCol] != null ? String(row[colorCol]).trim() : undefined
    });
  }
  return { accounts: accounts };
}

function setRevenueAccountsToSheet(ss, accounts) {
  if (!accounts || !Array.isArray(accounts)) return { ok: false, error: 'invalid accounts' };
  var sh = ss.getSheetByName('RevenueAccount') || ss.getSheetByName('RevenueAccounts');
  if (!sh) sh = ss.insertSheet('RevenueAccount');
  var rows = [['id', 'name', 'type', 'icon', 'color']];
  for (var i = 0; i < accounts.length; i++) {
    var a = accounts[i];
    rows.push([
      a.id || '',
      a.name || '',
      a.type != null ? a.type : '',
      a.icon != null ? a.icon : '',
      a.color != null ? a.color : ''
    ]);
  }
  sh.clearContents();
  sh.getRange(1, 1, rows.length, 5).setValues(rows);
  return { ok: true };
}
```

---

## 3. Déploiement

Le code utilise l’onglet **RevenueAccount** (singulier). Si le tien s’appelle **RevenueAccounts**, remplace `RevenueAccount` par `RevenueAccounts` dans les deux fonctions.

Puis **redéploie** ton Apps Script : Exécutable > Gérer les déploiements > Modifier > Nouvelle version.
