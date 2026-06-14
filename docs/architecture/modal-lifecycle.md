# 🧰 ModalLifecycle — cycle de vie unifié des modales

> Helper standalone introduit en **v1.44.0-rc1** pour centraliser le tracking
> des ressources d'une modale (timers, listeners, blob URLs, boutons disabled)
> et garantir un cleanup automatique au close. Migration **opt-in et progressive** :
> les modales non-migrées continuent de marcher comme avant.

## 🎯 Pourquoi ce module ?

L'audit modales V2 (juin 2026, workflow adversarial verify) a confirmé **6 patterns récurrents** dispersés dans ~10 modales :

| Pattern | Symptôme | Avant ModalLifecycle |
|---|---|---|
| **1** | `setTimeout` non-tracké → DOM détaché (11 occurrences) | Closure orpheline retient `btn` après close, write dans DOM mort |
| **2** | Listeners dynamiques sans cleanup ni délégation (7 occurrences) | Accumulation transitoire de listeners + closures sur DOM ancien |
| **3** | Theming inline `#8892a4` hardcoded (8+ occurrences) | Illisible en thème clair |
| **4** | Bouton async sans `disabled` (5 occurrences) | Double-clic → 2 async parallèles |
| **5** | `URL.createObjectURL` sans cleanup robuste (3 occurrences) | Blob jamais revoqué si exception |
| **6** | Async callbacks sans guard "modale fermée" | Crash sur `null.addEventListener`, write dans DOM détaché |

Le sprint v1.43.26/27 a corrigé les pires cas individuellement, mais le pattern revenait à chaque nouvelle modale. Cause racine : **pas de cycle de vie unifié**. Chaque modale réinvente son `open/close` artisanal.

## 🏗️ Approche : helper standalone

Pas de classe, pas de mixin invasif. Juste un objet `window.ModalLifecycle` exposant `attach(overlay, opts)` qui retourne une **instance** par modale. La modale **opt-in en remplaçant** ses `addEventListener` / `setTimeout` / `URL.createObjectURL` par les équivalents tracked sur l'instance.

**Garanties** :
- ✅ `close()` 100% idempotent (rebind par erreur → no-op)
- ✅ Tous les `setTimeout` / `setInterval` tracked → cleared au close
- ✅ Tous les listeners tracked via `.on()` / `.delegate()` → removed au close
- ✅ Tous les blob URLs créés via `.createObjectURL()` → revoked au close
- ✅ `.alive` = true tant que `close()` pas appelé ET overlay encore dans le DOM
- ✅ Compatible vanilla JS, IE11+, ~250 lignes, zéro dépendance

## 🚀 Usage typique

```js
function ouvrirMaModale() {
  const overlay = document.createElement("div");
  overlay.className = "kta-readme-modal-overlay";
  overlay.innerHTML = "...";
  document.documentElement.appendChild(overlay);

  // Attache un cycle de vie à l'overlay
  const lc = window.ModalLifecycle.attach(overlay, {
    label: "MaModale",  // pour debug console
    onClose: function() {
      console.log("modale fermée");
    }
  });

  // Pattern A — Escape + backdrop click cleanup auto
  lc.bindEscape(fermer);
  lc.bindBackdropClick(fermer);

  // Pattern Memory leak — listeners cleanup auto
  lc.on(document.getElementById("kta-mon-bouton"), "click", fermer);

  // Event delegation pour DOM dynamique (rebuild via innerHTML)
  lc.delegate(overlay, "click", "[data-action='supprimer']", function(e) {
    const id = this.dataset.id;
    confirm("Supprimer " + id + " ?") && supprimer(id);
  });

  // Pattern 1 — timers tracking auto
  lc.setTimeout(function() {
    /* ne s'exécute pas si fermé entre temps */
    btn.textContent = "✓ Copié";
  }, 1800);

  // Pattern C — async guard "modale fermée"
  try {
    const data = await lc.guard(fetchSomething());
    // si on arrive ici, la modale est encore vivante
    render(data);
  } catch (e) {
    // ModalClosedError = silently return, autre = propager
    if (e instanceof window.ModalLifecycle.ModalClosedError) return;
    throw e;
  }

  // Pattern D — bouton async sans disabled
  lc.on(btn, "click", async function() {
    const release = lc.lockButton(btn, { text: "⏳ Loading…" });
    try {
      await doWork();
    } finally {
      release();
    }
  });

  // Pattern 5 — blob URL auto-revoke
  const url = lc.createObjectURL(myBlob);
  img.src = url;

  function fermer() {
    lc.close();       // cleanup tous timers/listeners/blobs/onClose handlers
    overlay.remove();
  }
}
```

## 📋 API complète

| Méthode | Description |
|---|---|
| `attach(overlayEl, opts)` | Crée une instance. `opts.label` pour debug, `opts.onClose` callback custom. |
| `.alive` | `true` tant que `close()` non appelé ET `overlay.isConnected === true` |
| `.closed` | inverse de `.alive` au sens "manuel" : `true` dès que `close()` a été appelé |
| `.el` | référence à l'overlay racine |
| `.bindEscape(closeFn)` | Listener `keydown` Escape sur document, auto-removed au close. Default closeFn = `this.close`. |
| `.bindBackdropClick(closeFn)` | Listener click sur overlay, exécute closeFn si `e.target === overlay`. |
| `.on(target, event, handler, opts)` | Wrapper `addEventListener` tracked. |
| `.delegate(scope, event, selector, handler)` | Event delegation propre. `this` dans handler = élément matché. |
| `.setTimeout(fn, delay)` | `setTimeout` tracked + cleared au close + skip exec si déjà closed au moment du fire. |
| `.setInterval(fn, delay)` | Idem pour `setInterval`. |
| `.clearTimeout(id)` / `.clearInterval(id)` | Cancel explicite + untrack. |
| `.guard(promise)` | Wrap qui throw `ModalClosedError` au `.then()` si `.alive === false` post-await. |
| `.lockButton(btn, {text})` | Disable + change texte. Retourne `release({text})` à appeler en `finally`. |
| `.createObjectURL(blob)` / `.revokeObjectURL(url)` | Blob URLs tracked. |
| `.onClose(fn)` | Ajoute un callback au close. Cumulable. |
| `.close()` | Idempotent. Cleanup tous timers/intervals/listeners/blobs + appel `onClose` handlers. |

## 🛡️ Bonnes pratiques

### ✅ DO

- **Toujours** appeler `lc.close()` AVANT `overlay.remove()` dans ton `fermer()`.
- **Toujours** utiliser `lc.on()` / `lc.setTimeout()` / `lc.createObjectURL()` au lieu des natifs dans les modales migrées.
- **Toujours** wrap les async avec `lc.guard()` quand le code post-await touche au DOM.
- **Toujours** capturer `release` du `lockButton` et l'appeler en `finally`.
- Pour les sous-modales (modale au-dessus d'une autre), crée un **sous-lifecycle séparé** (`window.ModalLifecycle.attach(subOverlay, ...)`) avec son propre `close()`.

### ❌ DON'T

- **Ne pas** créer `_lc` au scope module si la modale peut avoir plusieurs instances ouvertes en parallèle. Préférer le scope local de `ouvrir()`.
- **Ne pas** mélanger des `addEventListener` natifs avec `lc.on()` dans la même modale → cleanup partiel = leak résiduel.
- **Ne pas** appeler `lc.close()` plusieurs fois explicitement par sécurité — c'est idempotent, c'est inutile.
- **Ne pas** oublier le `try/catch ModalClosedError` quand tu utilises `lc.guard()` : sinon le throw remonte jusqu'à la console.

## 🗓️ Plan de migration

| Phase | Modales | Statut |
|---|---|---|
| **rc1** (v1.44.0) | `memInspector`, `swInspector` | ✅ migrées |
| **rc2** (v1.44.0) | `lostMode`, `secoursMode` (sous-modales) | ⏳ à venir |
| **v1.44.1+** | `osmView`, `interfaceItineraire`, `createConf` | progressif |
| **v1.44.2+** | `filterPanel`, `modeHistoire`, `emergencyMode` | progressif |

Les modales non-migrées **continuent de fonctionner sans rien faire** : le helper n'impose rien à qui ne l'appelle pas.

## 🧪 Tests heap (recommandé après migration)

1. DevTools → **Memory** → **Take heap snapshot** (« Avant »)
2. Ouvre/ferme la modale migrée × 30 (rapide)
3. Force GC : bouton 🗑️ DevTools
4. **Take heap snapshot** (« Après »)
5. Vérifier : `Detached HTMLDivElement` ~stable (pas de croissance linéaire avec N ouvertures)

## 🔗 Code source

- Helper : `js/modalLifecycle.js`
- Pilotes : `js/memInspector.js`, `js/swInspector.js`
- Audit V2 d'où sont issus les patterns : `docs/audits/2026-06-09_audit-modales-v2.md`
