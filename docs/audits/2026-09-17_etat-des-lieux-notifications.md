# État des lieux — popups et notifications non sollicitées

> Demande KARMA, 17/09/2026 : *« on a beaucoup de popups d'information inutiles ; état des lieux, puis une option pour les désactiver »*. Exclusion posée par KARMA : **les alertes serveur** (messages à la communauté, comme l'incendie de Méry) ne sont jamais coupées. **Aucun code** dans ce document.
> Base : grep exhaustif de `js/` le 17/09/2026 (v1.96.0 dans l'arbre).
> ✅ **Livré le jour même en v1.96.0** (recos 1, 3, 5 : trois positions, vibration qui suit, regroupement au chargement ; reco 2 amendée par KARMA après coup : défaut « Essentielles ») — `js/oomGuard.js`, `scripts/check-notifs.js`. Restent au backlog : reco 4 (192 boîtes natives, par lots) et reco 6 (journal des notifications).

---

## 1. Les canaux, mesurés

| Canal | Volume | Nature | Où ça sort |
|---|---|---|---|
| `OOMGuard.showToast(msg, type)` — **le toast central** | **118 appels**, dans 35 modules | `info` ×46 · `warn` ×34 · `error` ×6 · sans type (= warn) ×32 | Bandeau bas, auto-fermé 6 s (info) / 10 s (warn, error), file d'attente derrière le splash, **vibration** sur warn/error |
| `alert()` **natif** | **171 appels** | validations et erreurs (Générateur 40+, éditeur, exports…) | Boîte système bloquante, hors charte, non traduite dans son habillage |
| `confirm()` **natif** | **21 appels** | décisions restantes non migrées vers `ktaConfirm` | idem |
| `ktaConfirm()` | 19 appels | décisions (supprimer, écraser, quitter) | Modale charte — **pas une information**, hors sujet |
| `setStatus()` | 68 appels | ligne d'état du chargeur | Pas une popup — hors sujet |
| Toasts « maison » à côté du central | `osmView._toast` (8, dans l'overlay OSM), `batteryGuard` (2), `journalUi._toast`, `secoursMode._toast`, `interfaceItineraire._toastIti`, `homeProfile._toastAchievement` | même rôle, implémentation ou habillage propres | La plupart **reroutent** vers le central ; `osmView` a son propre DOM dans l'overlay |
| Modales d'information au démarrage | `oomGuard` (kill OOM, crash V2), `loaderSwModals` (mise à jour disponible, accès hors-ligne), `firstRunFlow` (tutoriel, PIN, opt-in OSM), `alertChecker` (**alertes serveur — exclues**), avertissement perf OSM (1re ouverture), avertissement > 3 plans | une par situation | Modales charte, la plupart **one-shot** |

Ce que ça dit : un seul goulot réel, `OOMGuard.showToast`, et **une dette parallèle qui n'a rien à voir avec le bruit** : 192 boîtes natives `alert`/`confirm` qui n'obéissent à aucun réglage, bloquent l'écran, et ne portent pas la charte. La migration v171 (« modale custom au lieu de confirm ») n'a couvert que la re-sélection de ZIP.

---

## 2. Ce que disent les toasts (classement par utilité)

**A — Confirmation d'un geste que l'utilisateur vient de faire** (il a cliqué, il voit le résultat à l'écran) — *≈ 45 %, candidats au silence* :
copie dans le presse-papiers OK, export OK, point supprimé, annulé / refait, « rien à annuler », plan déplacé vers un dossier, liaison créée / retirée, calque rapatrié / restitué, instantané créé / ignoré, sauvegardes purgées, favori retiré, objets convertis, tronçon tracé, PDF / KMZ généré, haut fait débloqué, mode présentation activé, verrou de tracé réactivé, géoréf enregistrée, Nord calibré, veille d'écran coupée…

**B — Information sans action possible, mais que l'utilisateur doit savoir** — *≈ 40 %, à garder en « essentiel »* :
batterie à 20 % puis 10 %, session restaurée / filtres restaurés au chargement (N filtres actifs), stockage plein, tracker masqué par le niveau affiché, niveau changé automatiquement, zoom limité sur mobile, photos restaurées depuis le ZIP, OSM hors-ligne sans cache / strict / incognito, « plus de 3 plans, ça peut ramer », import kiosque refusé, liaison cachée par un filtre.

**C — Erreurs** — *≈ 15 %, jamais coupées* :
capteurs refusés, export KMZ / PDF échoué, restauration échouée, presse-papiers indisponible, module indisponible, pas de calibrage GPS.

Le déclencheur sépare mieux que le niveau : **presque tous les « info » suivent un clic**, presque tous les « warn » arrivent **seuls** (chargement, capteur, batterie). Le niveau `info` est déjà, de fait, la catégorie « confirmation de geste » — c'est ce qui rend l'option simple.

---

## 3. Les vrais irritants (à l'usage)

1. **Le rechargement d'un plan parle trop** : session restaurée, filtres restaurés, photos restaurées, niveau, tracker masqué peuvent s'empiler en trois ou quatre toasts, avec vibration pour les warn.
2. **Les confirmations de gestes évidents** : le plan qu'on vient de déplacer est sous les yeux ; « 📁 1 plan(s) déplacé(s) » n'apprend rien. Idem copier, annuler, refaire.
3. **La vibration** suit le type (warn/error), pas l'importance : « filtres restaurés » vibre comme « batterie 10 % ».
4. **Les 171 `alert()`** : chacun bloque tout l'écran, y compris en pleine saisie du Générateur, et aucun réglage ne les touche.
5. **Deux DOM de toast** (central et OSM) : même message, deux habillages selon l'écran.

---

## 4. L'option proposée

Un seul réglage, dans ⚙️ Configuration de l'accueil (famille du ❓ d'aide et du 💾 Mémoriser), trois positions :

| Position | Toasts `info` (gestes) | Toasts `warn` (état) | `error` | Modales actionnables (OOM, mise à jour, plan introuvable) | Alertes serveur |
|---|---|---|---|---|---|
| **Tout** (défaut, comportement actuel) | ✅ | ✅ + vibration | ✅ | ✅ | ✅ |
| **Essentiel** *(reco par défaut à terme)* | ❌ | ✅ sans vibration | ✅ | ✅ | ✅ |
| **Silence** | ❌ | ❌ sauf marqués `important` (batterie 10 %, stockage plein, capteurs refusés) | ✅ | ✅ | ✅ |

Principe d'implémentation, pour que ça tienne : **un seul goulot**. Le filtre vit dans `OOMGuard.showToast` ; les toasts maison doivent passer par lui (l'`osmView._toast` garde son DOM mais demande la permission au central). Un appel peut porter `{ important: true }` pour survivre au mode Silence. Les alertes serveur ne passent pas par les toasts : elles restent hors de portée du réglage **par construction**, pas par exception. Une option du kiosque n'a pas lieu d'être : c'est le confort de chaque personne.

Ce que l'option **ne règle pas** : les 192 boîtes natives. Elles sont hors du goulot. Deux voies, à trancher à part :
- **a)** migrer par lots vers `ktaConfirm` (décisions) et toasts `error` (validations) — travail mécanique mais long (171 sites), à faire module par module avec un garde-fou « aucun `alert(` nouveau » ;
- **b)** poser un `window.alert` et `window.confirm` de remplacement (modale charte, promesse) une fois pour toutes, sans toucher aux 192 sites — rapide, mais `confirm` natif est synchrone et le remplacement ne peut pas l'être : les 21 `confirm(` devraient être migrés quand même.

---

## 5. Décisions à prendre (KARMA)

1. **Positions du réglage** : trois (Tout / Essentiel / Silence) — reco · deux (Tout / Essentiel)
2. **Défaut** : Tout, comportement actuel — reco pour ne pas changer l'existant sans le dire · Essentiel
3. **Vibration** : suit le réglage (Essentiel = plus de vibration sur les warn) — reco · reste liée au type
4. **Les 192 `alert`/`confirm` natifs** : chantier séparé, voie a) par lots — reco · voie b) remplacement global · rien pour l'instant
5. **Rechargement d'un plan** : regrouper les toasts de restauration en UN seul (« Session restaurée · 3 filtres · 12 photos ») — reco, indépendant du réglage · laisser
6. **Journal des notifications** (une cloche qui garde les toasts coupés, consultable) : plus tard — reco · dans le même lot · jamais

Effort `[Probable]` : l'option seule ≈ ½ journée (goulot, trois positions, reroutage OSM, marqueur `important`, réglage, doc 4 axes, garde-fou « tout toast passe par le goulot »). Le regroupement au rechargement ≈ ½ journée. La migration des natifs : plusieurs jours, par lots.
