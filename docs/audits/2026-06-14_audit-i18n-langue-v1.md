# 🌍 Audit i18n / mode langue — v1.46.3 (14/06/2026)

> **Scope** : système multilingue FR/EN/ES ajouté en v1.45→v1.46.3 (perf · UI · robustesse).
> **Process** : 3 agents *find* (perf, UI, robustesse) + 1 agent *verify* adversarial.
> **Bilan** : 20 findings · **0 réfuté** (16 confirmed, 4 partial sévérité revue) · aucun faux positif.
> Brut machine-readable : [`2026-06-14_audit-i18n-langue-v1.raw.json`](./2026-06-14_audit-i18n-langue-v1.raw.json)

| Sévérité finale | Nb |
|---|---|
| 🔴 critical | 2 |
| 🟠 high | 3 |
| 🟡 medium | 5 |
| ⚪ low | 9 |
| ℹ️ info | 1 |

## ✅ Constat rassurant (vérifié)

**Aucune dette de dico** : parité **4171 clés fr = en = es**, **ES 100 %**, et **155/155** clés littérales `_t("...")` du code existent dans les 3 langues (échantillon préfixes à risque : `pin.setup.*`, `home.privacy.*`, `home.profile.*`, `home.maint.*`, `oom.*`, `battery.*` → 0 manquante). Les bugs « clé brute » vécus (`pin.setup.changeBtn`…) sont **100 % cache SW périmé + fallback fragile**, pas un trou de traduction.

---

## 🔴 CRITICAL — à corriger avant de considérer la refonte config finie

### C1 · En-têtes de groupe config illisibles en thème CLAIR
`js/interfaceConfig.js` (×7 : 723/756/814/862/959/964/993) + `index.html` (×5 : 594/611/662/779/877)

Les 12 en-têtes `.kta-cfg-group-titre` ont **`color:#f4c542` en inline**. En thème clair, la modale config passe à `--kta-light-bg-elevated` **#fdf8eb** (crème) → jaune sur crème ≈ **1.4:1** (sous WCAG AA, quasi invisible). Aggravé par : **aucune classe CSS `.kta-cfg-group-titre`** n'existe (grep = 0) → l'inline ne peut être surchargé sans `!important`. **Toute la structure de la refonte config est illisible en mode clair.**

→ **Fix** : extraire le style inline vers une vraie classe `.kta-cfg-group-titre` (CSS) + variante `body.kta-theme-light` avec l'accent foncé `--kta-light-accent-hover` (#d9a82e), comme `.kta-aide-section-titre` (style.css:14020).

---

## 🟠 HIGH

### H1 · `I18n.t()` renvoie la CLÉ BRUTE sur clé manquante — cause racine
`js/langManager.js:153` — fallback terminal `return key`. Si une clé manque dans le dico **chargé** (cache périmé, oubli, faute), l'user voit `pin.setup.changeBtn` au lieu d'un texte. **Levier 1-point** : durcir `t()` pour renvoyer un fallback lisible (ex. humaniser le dernier segment, ou re-fetch silencieux du dico si online) → couvre automatiquement les 39 helpers `_t` (H2) + le helper incognito.

### H2 · 39 helpers `_t = window.I18n.t : k=>k` propagent la clé brute
`index.html` (39 occurrences, 1441→6048). Le fallback inline `function(k){return k;}` ne sert QUE si `window.I18n` est absent (jamais en pratique) → dès qu'I18n existe, une clé manquante ressort **brute** dans les modales innerHTML. Couvert par le fix H1.

### H3 · Popup POI construit EAGER par marker au chargement du plan
`js/utils.js:1694` — `buildPointPopupHtml` (~10-12 `t()`) est appelé **par marker à l'import**, pas à l'ouverture du popup. Sur gros plan = ~10×N `t()` pour des popups jamais ouverts. Mitigé partiellement (`PerfUltra.noTooltips`, batch 50) mais réel hors mode ULTRA. → **Fix** : construction *lazy* du popup sur `popupopen`.

---

## 🟡 MEDIUM (résumé)

- **M1 · Barre d'actions Réglages PLAN en FR codé en dur** — `interfaceConfig.js:1027-1029` : « Reset / Appliquer / 🐛 Logs » sans `I18n.t()` → 3 mots FR au milieu d'une UI EN/ES. *(Trou i18n très visible.)*
- **M2 · `getLang()` → `localStorage.getItem` à chaque `t()`** — `langManager.js:138` : pas de cache (la langue ne change qu'au `setLang`). *(Accès RAM ~µs, coût modéré — mémoïser la langue active en variable module.)*
- **M3 · Labels preset perf tronqués en ES sur mobile** — `style.css:6238` : « Desactivado/Rendimiento/Equilibrado » coupés en « Desact… ». *(Réduire le font-size mobile ou autoriser le wrap.)*
- **M4 · `check-i18n.js` aveugle aux alias `_t(...)`** — ne détecte que `I18n.t(` → des clés manquantes appelées via `_t` passent inaperçues. *(Étendre la détection ou imposer `I18n.t` partout.)*

## ⚪ LOW (cosmétique / latent)

`.kta-cfg-lang-hint` sans variante thème clair · double emoji 🌍 rapproché (en-tête « Application » + label « Langue ») HOME · rendu incognito au load (atténué par re-refresh à l'ouverture) · rebuild index recherche par frappe (points cachés → impact faible) · section PIN non re-traduite à chaud sur changement de langue · etc. (voir raw.json).

---

## 🎯 Plan d'action (TODO priorisée)

- [ ] **P0 — C1** : classe CSS `.kta-cfg-group-titre` + variante thème clair (#d9a82e). *Sans ça, la refonte config est cassée en clair.*
- [ ] **P1 — H1** : durcir `I18n.t()` (fallback lisible sur clé manquante) → règle H1+H2+incognito d'un coup.
- [ ] **P1 — H3** : popup POI lazy (`popupopen`).
- [ ] **P2 — M1** : i18n de la barre d'actions Réglages PLAN.
- [ ] **P2 — M2** : mémoïser `getLang()`.
- [ ] **P2 — M3** : fix troncature labels preset ES mobile.
- [ ] **P2 — M4** : étendre `check-i18n.js` aux alias `_t(...)` (ferme l'angle mort qui a masqué les clés brutes).
- [ ] **P3 — LOW** : variantes thème clair manquantes + cosmétique.

## 🔑 Patterns transverses

1. **Raw-key sur clé manquante** = la fragilité #1 (H1+H2+incognito). Un seul fix dans `t()`.
2. **Thème clair = angle mort récurrent** : tout nouvel élément i18n (en-têtes de groupe, hint langue) oublie sa variante claire.
3. **Couverture d'audit incomplète** : `check-i18n` ne voit ni le FR codé en dur (réglé par `find-hardcoded-fr.js`) ni les alias `_t(...)` → 2 angles morts à fermer pour un filet complet.
