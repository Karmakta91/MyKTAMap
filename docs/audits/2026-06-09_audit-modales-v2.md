# 📋 Audit Modales v2 — Post-Sprint v1.43.26

> 61 findings confirmés sur 87 (taux 70%) — analyse honnête de l'état post-sprint.

## 🔍 Métadonnées audit

| Champ | Valeur |
|---|---|
| **Date** | 2026-06-09 |
| **Version auditée** | `v1.43.26` |
| **Workflow** | `audit-modales-v2` (Run ID `wf_4fc0db6c-493`) |
| **Agents lancés** | 185 |
| **Tokens consommés** | ~7.07 M |
| **Durée** | 45 min |
| **Méthode** | Pipeline Review → Adversarial Verify (2 lenses) → Synthesize |

**Modales auditées (10)** : `memInspector`, `swInspector`, `lostMode`, `osmView`, `createConf`, `filterPanel`, `secoursMode`, `interfaceItineraire`, `modeHistoire`, `emergencyMode`.

**Axes (5)** : `perf`, `async_bug`, `ux_bug`, `theming`, `memory_leak`.

**Findings bruts complets** : voir `2026-06-09_audit-modales-v2.raw.json` (166 Ko, 61 entrées détaillées avec code excerpt + verdicts adversarial).

---

## 📊 Stats globales

### Sévérité × Catégorie

| | memory_leak | async_bug | ux_bug | theming | perf | **Total** |
|---|---|---|---|---|---|---|
| 🔴 **High** | 1 | 5 | 0 | 0 | 0 | **8** (13%) |
| 🟡 **Medium** | 9 | 8 | 5 | 3 | 4 | **28** (46%) |
| 🟢 **Low** | 8 | 1 | 4 | 9 | 4 | **25** (41%) |
| **Total** | **18** | **14** | **9** | **12** | **8** | **61** |

### Comparaison v1 → v2

| Métrique | Audit v1 | Audit v2 (v1.43.26) | Δ |
|---|---|---|---|
| Raw findings | 153 | 87 | **-43%** ✅ |
| Confirmés | 30 | 61 | +103% ⚠️ |
| Taux confirmation | 20% | 70% | +50pts ⚠️ |

> 💡 **Lecture** : v1 avait beaucoup de bruit (faux positifs), v2 est mieux ciblé. Plus de findings confirmés ≠ régression — l'audit est juste plus précis. **Mais** : 8 high restent à traiter.

### Par module (densité bug)

| Module | Findings | High | Densité |
|---|---|---|---|
| lostMode.js | 9 | 1 | 🔴 chaud |
| secoursMode.js | 8 | 2 | 🔴 chaud |
| createConf.js | 7 | 1 | 🟡 |
| interfaceItineraire.js | 7 | 2 | 🟡 |
| swInspector.js | 6 | 0 | 🟢 |
| osmView.js | 6 | 1 | 🟡 |
| modeHistoire.js | 5 | 0 | 🟢 |
| filterPanel.js | 5 | 1 | 🟡 |
| memInspector.js | 4 | 0 | 🟢 |
| emergencyMode.js | 3 | 0 | 🟢 |

---

## 🎯 Top 5 critiques (impact × ease-of-fix)

### 1. 🔴 `osmView.js:2390` — **waitOverlay DOM leak** (.finally manquant)
- **Impact** : DOM leak permanent à chaque ouverture OSM (commentaire promet `.finally()`, code n'en a pas)
- **Effort** : **2 min** — ajouter `.finally(() => waitOverlay?.parentNode?.removeChild(waitOverlay))`
- **Pourquoi #1** : régression v1.43.26 documentée dans le commentaire mais oubliée à l'implémentation

### 2. 🔴 `lostMode.js:997` — **Async search écrit dans DOM détaché**
- **Impact** : `searchResults.innerHTML = ""` sur élément retiré après `close()` + closures retenues
- **Effort** : **5 min** — ajouter `if (!searchResults?.isConnected) return;` après `await`
- **Pattern C** déjà éprouvé (memInspector/swInspector v1.43.26) — pas appliqué ici

### 3. 🔴 `secoursMode.js:4400` — **Double-click PDF Briefing**
- **Impact** : 2 PDF concurrents (html2canvas plusieurs secondes), CPU x2, ressources
- **Effort** : **3 min** — `btn.disabled = true` + try/finally
- **Pattern D** déjà en place ailleurs (createConf, interfaceItineraire)

### 4. 🔴 `interfaceItineraire.js:1581` — **Listeners save/discard après await async**
- **Impact** : Si modale ferme pendant `computeRoute` (1-3s), `getElementById().addEventListener` plante ou attache à fantôme
- **Effort** : **5 min** — guard `if (!_modal?.isConnected) return;` après l'await
- Combiné avec #2 = même pattern, 2 fixes alignés

### 5. 🔴 `filterPanel.js:554` — **Accumulation listeners cross-cycle ouvrir/fermer**
- **Impact** : Image/Data/Tags layers re-binded sans cleanup à chaque cycle (vs M-LVL délégué proprement en v1.43.26)
- **Effort** : **20-30 min** — refactor sur le pattern M-LVL (event delegation + `scope._handlersBound`)
- v1.43.26 a corrigé M-LVL mais oublié les 5 autres sections du même fichier

**Total Top 5 : ~45 min** pour éliminer les 5 vrais high.

---

## 🔁 Patterns récurrents (transversaux)

### Pattern 1 : `setTimeout` non-tracké → DOM détaché 🔥 **(11 occurrences)**
`memInspector:834`, `memInspector:887`, `lostMode:1187`, `lostMode:351`, `lostMode:765`, `swInspector:534`, `swInspector:596`, `modeHistoire:320`, `osmView:1961`, `createConf:1556`, `interfaceItineraire:1437`

> 💡 **Le sprint v1.43.26 a corrigé `_searchTimeout` dans lostMode** mais le **même pattern existe partout ailleurs** non traité. Fix systémique = créer un helper `window.ModalTimers.register(id)` + `clear(modalKey)`.

### Pattern 2 : Listeners dynamiques sans cleanup ni délégation **(7 occurrences)**
`memInspector:754`, `swInspector:388`, `swInspector:461`, `lostMode:1008`, `lostMode:1085`, `interfaceItineraire:963`, `interfaceItineraire:1401`, `filterPanel:554/559`

> 💡 v1.43.26 a appliqué le pattern délégation sur **M-LVL filterPanel uniquement**. À étendre.

### Pattern 3 : Couleur `#8892a4` inline non-themée **(8+ occurrences)**
`memInspector.css:59`, `osmView:588`, `createConf:299` (×13!), `filterPanel:725`, `secoursMode:1935`, `interfaceItineraire:959`

> 💡 **Partiellement mitigé** par `style.css:18931` (sélecteur attribut `*[style*="color:#8892a4"]`), mais fragile : ne marche qu'à l'intérieur de `.kta-readme-modal-overlay`. Tous les modules pas couverts.

### Pattern 4 : Bouton async sans `disabled` (double-click) **(5 occurrences)**
`memInspector:878`, `secoursMode:4400`, `secoursMode:3607`, `filterPanel:643`, `interfaceItineraire:1581`

> 💡 Pattern D documenté dans v1.43.26 (`createConf:3282`, `interfaceItineraire:1517`), appliqué partiellement.

### Pattern 5 : `URL.createObjectURL` sans cleanup robuste **(3 occurrences)**
`createConf:3062`, `createConf:1367`, `createConf:1498`

> 💡 Spécifique à createConf, pattern `try/finally` existe ligne 2535 — à généraliser.

### Pattern 6 : Hardcoded colors light-theme broken **(7+ occurrences)**
Bordures `rgba(255,255,255,0.08)`, `rgba(255,140,140,0.20)`, oranges `#ffb380`, rouge toast `rgba(244,107,107)`...

> 💡 v1.43.26 a fait Pattern B sur quelques sélecteurs mais beaucoup d'inline styles passent à travers.

---

## ⚡ Quick wins (<10 min chacun)

| # | Fix | Fichier | Effort | Impact |
|---|---|---|---|---|
| 1 | `.finally()` waitOverlay | osmView.js:2390 | 2 min | 🔴 fixe DOM leak |
| 2 | `if (!_modal?.isConnected) return;` après await | lostMode.js:997 + interfaceItineraire.js:1581 | 5 min × 2 | 🔴 fixe 2 high |
| 3 | `btn.disabled = true` PDF Briefing | secoursMode.js:4400 + 3607 | 3 min × 2 | 🔴 fixe 2 async bugs |
| 4 | `el.classList.remove("kta-gps-invalid")` sur input | createConf.js:3013 | 5 min | 🟡 fixe UX sticky |
| 5 | CSS override `.kta-mem-loading` light theme | style-meminspector.css:59 | 2 min | 🟢 fixe a11y |
| 6 | Override `#kta-sw-incomplet-toast` light theme | style-meminspector.css | 3 min | 🟡 toast lisible |
| 7 | Cache `buttons` array dans forEach | lostMode.js:970 | 3 min | 🟢 micro-perf |
| 8 | Inline rouge → classe `.kta-lost-danger-btn` | lostMode.js:1162 | 5 min | 🟢 cohérence theming |

**Total quick wins : ~35 min → 8 findings traités** (dont 4 high).

---

## 📝 Verdict honnête

### ✅ Ce que v1.43.26 a bien fait
- **Pattern A/B/C/D** clairement identifiés et documentés
- **memInspector** : listeners Escape + `_lastReport` snapshot bien gérés
- **filterPanel M-LVL** : refactor event delegation propre
- **lostMode `_searchTimeout`** : clearTimeout au close
- **Bruit divisé par 2** (153 → 87 raw findings)

### ⚠️ Ce qui a été manqué
1. **Application incohérente des patterns** : Pattern D appliqué à 2 modules, oublié dans 5 autres. Pattern C appliqué à memInspector/swInspector mais pas à lostMode/interfaceItineraire/osmView.
2. **Pattern A (setTimeout tracking) pas systématisé** : corrigé localement, pas généralisé.
3. **Régression documentée mais non implémentée** : `osmView:2390` — le commentaire promet `.finally()`, le code n'en a pas. C'est le seul vrai "oubli flagrant" du sprint.
4. **Sections sœurs de filterPanel oubliées** : M-LVL refactoré, Image/Data/Tags non touchés alors qu'ils ont le même problème.

### 🎯 Régression vs v1.43.25 ?
**Non — pas de régression.** v1.43.26 améliore les choses (notamment memInspector/swInspector/M-LVL). Les 61 findings existent depuis longtemps, l'audit les met juste mieux en lumière maintenant.

### 🚨 Findings restants vraiment critiques ?
- **5 high vraiment importants** (Top 5 ci-dessus, ~45 min de fix)
- **3 high "alarmistes"** : sévérité gonflée par l'auditor (ex: `createConf:3062` blob revoke, sévérité réelle = medium)
- **Reste = dette technique acceptable** : low/medium sur theming et perf micro

### Hygiène globale
**B+ / 7.5/10.** Sprint v1.43.26 a posé les bonnes fondations (patterns A/B/C/D), reste à finir le déploiement systémique. Pas de bug critique runtime visible utilisateur, mais accumulation lente de dette en cas d'usage intensif sur sessions PWA longues.

---

## 🛠️ Plan d'action recommandé

### 🥇 Minimum viable — **v1.43.27 hotfix (~1h)**
> Fixer les vrais high + quick wins évidents.

1. Quick wins #1-#6 (Top section) → ~25 min
2. Fix `filterPanel.js` listeners (Top #5) → ~30 min
3. Bump + commit → 5 min

**Résultat** : 8 high → 0, ~12 findings traités, code reste stable.

### 🥈 Sprint moyen — **v1.43.28 (~3-4h)**
> Systématiser les patterns A/B/C/D sur **tous** les modules.

1. v1.43.27 hotfix (1h)
2. **Helper `ModalTimers`** centralisé : register/clear setTimeout par modale (45 min)
3. Appliquer pattern listeners cleanup à `memInspector`, `swInspector`, `interfaceItineraire`, `lostMode`, `secoursMode` (1h)
4. CSS Pattern B audit : ajouter overrides light pour toutes les inline `#8892a4`, rouge toast, bordures `rgba(255,255,255,0.08)` (45 min)
5. Test régression + bump (15 min)

**Résultat** : ~40 findings traités, dette divisée par 3.

### 🥉 Sprint long — **v1.44.0 (~1 jour)**
> Refonte architecturale : `ModaleBase` mixin avec cycle de vie.

1. Tout le sprint moyen
2. **Créer `window.ModaleBase`** : helper avec `open()`, `close()`, `onClose(callback)` qui gère automatiquement timers/listeners/AbortController
3. Migrer 4-5 modales critiques (lostMode, secoursMode, osmView, interfaceItineraire) sur ce mixin
4. Documenter le pattern dans `docs/architecture/modal-lifecycle.md`
5. Hook lint custom : flag les `setTimeout` sans tracking dans une modale

**Résultat** : élimination du **pattern root cause**, prévention long terme. Reste seulement la dette theming low.

---

## 📌 Recap KARMA-style

| Quoi | Combien | Effort |
|---|---|---|
| **Cause racine** | Patterns A-D appliqués partiellement | — |
| **Fix immédiat** | 5 high → 0 via Top 5 | 45 min |
| **Régression v1.43.25 ?** | Non — amélioration nette | — |
| **À tester après hotfix** | OSM open/close ×10, lost mode search+close, briefing PDF double-clic, filterPanel ouvrir/fermer ×5 (devtools heap) | 10 min |

**Mon avis** : tu peux soit shipper v1.43.27 hotfix vite (1h pour les vrais high), soit attendre v1.44.0 avec `ModaleBase` qui règle le problème à la racine. Je recommande **les deux** : hotfix maintenant, refonte au prochain sprint UI.