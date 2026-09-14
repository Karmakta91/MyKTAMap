# 🧭 Audit ergonomie MyKTAMap — v1.90.17 — 13/09/2026

> **Persona** : ergonome de métier, usage **privé**, à l'aise avec le numérique, connaît vaguement OsmAnd / Organic Maps / Locus / Gaia. Pas développeur.
> **Méthode** : lecture du code et de la doc par 8 agents (1 parcours, 6 zones, 1 doc ↔ app) + vérification manuelle par Claude des 7 bloquants et des compteurs. **Aucune exécution de l'app** : tout constat est ancré dans un fichier lu, mais l'effet à l'écran reste à confirmer sur appareil quand il est tagué [Probable]/[Supposition].
> **Recoupé** avec `docs/BACKLOG.md` (ouvert / enterré), `docs/architecture/ui.md` §88 (audit UX de juin) et `docs/audits/2026-06-09_audit-modales-v2.md`.
> **Sans code** : les noms de fichiers ne servent qu'à retrouver l'endroit.

---

## 0. La vérité qui dérange, en 5 lignes

1. **Les deux fonctions de sécurité (« Y aller », « Sortie d'urgence ») calculent depuis le point de départ du plan si l'utilisateur ne s'est jamais recalé, et le présentent comme sa position.** La branche « clique où tu es » existe dans le code et est **inatteignable**. [Certain, vérifié]
2. **Un refus de permission capteurs sur iOS laisse le tracker affiché ON et totalement inerte.** Rien ne le dit. [Certain, vérifié]
3. **Quatre actions détruisent des données sans filet** : import de session (pas de snapshot alors que la doc le promet), « Tout réinitialiser » (liste 4 postes, en efface 9 dont photos et carnet), Reset des Réglages (efface le parcours tracker, collé à Appliquer), « Effacer la session » au chargement (1 tap). [Certain, vérifié]
4. **La politique « alert/confirm natifs migrés au fil de l'eau » perd du terrain** : 101 alert + 29 confirm en juin, **177 alert + 60 confirm** aujourd'hui.
5. **Tout ce qui sert sous terre est OFF par défaut** (écran allumé, vibration, magnétisme, calage sur tracés, vocal) ; **le seul opt-in ON par défaut est celui qui touche le réseau** (Vue OSM). L'app est riche, mais les 5 gestes de terrain (je suis ici · play/stop · point rapide · urgence · filtres) coûtent 2 à 4 taps sur des cibles de 24 à 32 px.

**Décisions déjà prises par KARMA (13/09)** : lockout PIN **et** gate mot de passe → temporisation (10 min, 1 h, escalade), jamais de blocage définitif. Consigné, retiré des recommandations ouvertes (§2 B7).

---

## 1. Chiffres clés

| Mesure | Valeur | Source |
|---|---|---|
| Constats bruts (8 agents) | ~130 | rapports par zone |
| Constats UX retenus après dédoublonnage | 100 (7 bloquants · 61 quick wins · 28 moyens · 4 lourds) | §2-5 |
| Écarts doc ↔ app | 36 (dont 17 « documenté mais faux », tous quick win) | §6 |
| Manques vs SIG grand public (32 fonctionnalités vérifiées) | 22 nouveaux · 4 enterrés non reproposés · 3 déjà au backlog | §7 |
| dont **bloquants** | 7 | §2 |
| dont **quick wins** (< 1 h chacun) | 61 | §4 |
| `alert()` natifs / `confirm()` natifs | **177 / 60** (juin : 101 / 29 ; 31/08 : 55 confirm) | grep 13/09 |
| Cibles tactiles < 44 px sur les commandes principales | sidebar 32 px (28 en paysage), chips header 36×24, ≡ Filtres 30×30, boutons de bulle ≈ 26, ✕ modales ≈ 22 | `css/style.css` |
| Contrôles principaux avec `title` | 25 / 25 (mais `title` = invisible au doigt) | inventaire |
| Modales avec un bouton d'aide contextuelle « ? » | **0** | inventaire |
| Réglages fantômes | 2 (multi-niveau codé jamais rendu ; « tous les niveaux au lancement » documenté sans case) | inventaire |
| Opt-in structurants OFF par défaut | 5 (wake lock, vibration, magnétisme, nav intelligente, vocal) | `config.js`, `wakeLock.js`, `voiceCommand.js` |

---

## 2. Les 7 bloquants (sécurité ou perte de données) — tous vérifiés par Claude

| # | Constat | Où | Effort | Backlog |
|---|---|---|---|---|
| **B1** | **Position par défaut présentée comme la position de l'utilisateur.** Le tracker « a toujours une position » (départ du plan). « Y aller », « Sortie d'urgence » et l'écran Urgence XL l'utilisent sans distinguer « confirmée » de « par défaut ». La branche « pas de tracker → clique ta position » de Sortie d'urgence est **morte**, et si on la ranimait, son bouton « Tracer l'itinéraire » retomberait sur le même test et échouerait en `alert()` (cul-de-sac, constaté par un 2ᵉ agent). | `tracking.js`, `sortieUrgence.js`, `interfaceItineraire.js` | **quick win** : drapeau « position jamais confirmée » ; dans ce cas Sortie d'urgence / Y aller ouvrent d'abord le picker « Où es-tu ? » (déjà codé) ; badge « position par défaut » sur le marqueur ; « Tracer » réutilise le chemin déjà calculé | nouveau |
| **B2** | **Permission capteurs refusée = tracker ON mais inerte.** La demande iOS ne traite que « granted » (pas de branche refus, pas de catch), et le démarrage n'attend pas la réponse : pastille verte, icône ⏹️, zéro pas à jamais. Même silence côté boussole. | `tracking.js`, `interface.js`, `compass.js` | **quick win** : consommer la promesse ; sur refus ne pas démarrer et afficher la modale chartée « capteurs refusés » avec le chemin de réactivation iOS (`ktaCapteurRefuse` existe déjà) | nouveau (`tracking.md` §24 note déjà l'absence de `DeviceOrientationEvent.requestPermission`) |
| **B3** | **Import de session : tout est écrasé sans snapshot**, photos du plan purgées en base avant réinjection, aucune entrée d'historique. Or `sessionBackups.js` liste « import qui écrase » parmi ses déclencheurs prévus, et l'UI le promet (« avant chaque action destructive »). L'import GPX, lui, est annulable. | `interfaceImportExport.js` | **quick win** : snapshot « avant import » attendu en tête du handler + toast « ancienne session dans 📦 Backups » | nouveau |
| **B4** | **« Tout réinitialiser » liste 4 postes et en détruit 9** : la modale annonce cache, plans, session, préférences ; l'exécution supprime **toutes** les bases (photos, backups, carnet, profil, PDF Histoire, photos Secours, tuiles OSM) et les hauts faits. Aucun export proposé avant. | `interfaceMaintenance.js` | **quick win** (texte : les 9 postes avec compteurs réels) + **moyen** (bouton « Exporter mon profil d'abord », l'export existe) | nouveau |
| **B5** | **Stockage saturé : un seul toast de 10 s, puis silence.** Le drapeau anti-spam n'est réarmé qu'après un save réussi ; le toast peut être remplacé par n'importe quel autre. Deux heures de travail peuvent partir sans qu'aucun signal persistant n'existe. | `sessionPersist.js`, `oomGuard.js` | **moyen** : bandeau persistant non fermable tant que le save échoue + réarmement périodique | nouveau |
| **B6** | **Reset des Réglages efface le parcours tracker sans confirmation**, et le bouton est collé à « Appliquer ». Il remet aussi la position au départ du plan. Le commentaire voisin explique qu'on a retiré le reset *complet* d'ici « pour limiter les déclenchements accidentels ». | `interfaceConfig.js` | **quick win** : `ktaConfirm` listant ce qui est perdu, renommer « ↺ Valeurs par défaut », éloigner d'Appliquer ; idéalement ne plus toucher au tracker | nouveau |
| **B7** | **Verrou PIN et gate mot de passe : 5 erreurs = app définitivement morte**, sous terre, hors réseau, sans bouton de sortie (la promesse de déverrouillage reste en attente pour toujours ; l'écran propose « réinstaller » ou « Instagram »). | `pinLock.js`, `unlockGate.js` | **moyen** — **DÉCIDÉ par KARMA 13/09** : temporisation escaladée (10 min, 1 h…) pour les deux gates. Point à trancher à l'implémentation : base de temps non contournable par un changement d'heure du téléphone | décision prise |

---

## 3. Les 7 patterns transverses (ce qui explique 80 % des constats)

| # | Pattern | Occurrences relevées | Déjà connu ? |
|---|---|---|---|
| **T1** | **Fonction silencieuse** : un `return` sans message quand une condition manque. L'utilisateur tape, rien ne se passe, il retape. | 🧹 Effacer à vide (×3), sélection multiple refusée, carnet désactivé, magnétisme OFF, nav intelligente OFF, chip Sortie sans module, favori dont le point a disparu, permission capteurs refusée, vocal non supporté (ligne masquée), wake lock non supporté (ligne masquée), Vue OSM (bouton qui disparaît sans raison), mode urgence perdu au rechargement | nouveau comme pattern |
| **T2** | **Défaut OFF sur ce qui sert sous terre** : wake lock, vibration (basculé OFF en v1.85.2), magnétisme, calage sur tracés, vocal. Rien ne les propose au moment utile (démarrage du tracker, premier tracé). | 5 réglages | v1.85.2 = décision pour la vibration ; le reste nouveau |
| **T3** | **Cibles tactiles < 44 px** partout où ça compte : sidebar 32/28 px, chips header 36×24 (dont **le bouton Sortie d'urgence**), ≡ Filtres 30×30, bulle POI 26 px × 7 boutons, ✕ modales 22 px, ✕ présentation 36 px à 45 % d'opacité. | ~8 familles | nouveau |
| **T4** | **Destructif sans filet** (ni confirmation, ni historique, ni toast Annuler) | suppression d'un point, Effacer la session (modale restauration), Reset réglages, Effacer le géoréférencement, import session, snapshot unitaire, zone/pilier abandonnés au changement de type, « Remplacer la session » (tableau), « Tout réinitialiser » (liste incomplète), photos supprimées non rendues par Ctrl+Z | nouveau |
| **T5** | **Dialogues natifs** : 177 `alert` + 60 `confirm`, dont 26 alert dans l'export, 17 dans le parcours PIN, 15 confirm dans le Mode Secours (arrêt de plan, suppression d'équipe). Plusieurs servent de **feedback de succès** ou affichent des noms de modules JS. | 177 + 60 | **déjà connu** (BACKLOG D-confirm, ui.md §88 UX1/UX6) — **fait nouveau : la tendance est à la hausse** |
| **T6** | **Vocabulaire et icônes en collision** : 🚨 ×4 (Sortie d'urgence, Mode urgence XL, Mode Secours, alertes), 🧭 ×5 (groupe Tracker, boussole, Y aller, chip footer, nav intelligente), 📍 ×3, 🗺️ ×2 ; Tracker / tracking / Suivi / Position / « Tracking GPS » ; Session / Sortie / Carnet / Snapshots-Backups ; Configuration vs Réglages ; Verrou sur tracé vs Navigation intelligente ; ⬆️ « Enregistrer » qui exporte. | ~12 doublons | nouveau |
| **T7** | **État invisible hors modale** : filtres actifs, pas/distance du tracker, plan de secours en cours, heatmap posée, verrou suspendu, mode d'édition armé, « enregistré / dernier backup », position par défaut, itinéraire restauré sans ses étapes. | 9 états | nouveau |

---

## 4. Quick wins — 61 constats (< 1 h chacun), classés par valeur pour le terrain (Q1, Q2, Q56, Q57 rappellent des bloquants)

Légende : 🔴 sécurité · 🟠 perte de données · 🟡 friction quotidienne · ⚪ cohérence. Confiance [Certain] sauf mention.

### 4.1 Sécurité et navigation (à faire en premier)

| # | Quick win | Où |
|---|---|---|
| Q1 🔴 | **B1** drapeau « position jamais confirmée » → picker « Où es-tu ? » avant Sortie d'urgence / Y aller ; badge sur le marqueur | `tracking.js`, `sortieUrgence.js` |
| Q2 🔴 | **B2** refus capteurs → ne pas démarrer + modale chartée avec chemin iOS | `tracking.js`, `interface.js` |
| Q3 🔴 | **Sortie d'urgence ignore le tag intégré « Point d'entrée du plan »** : le module cherche littéralement `entrée`, le tag intégré s'appelle `entree_plan`, la normalisation ne retire pas l'accent. Un plan balisé avec l'outil prévu pour ça n'a « aucune sortie identifiée ». | `sortieUrgence.js` |
| Q4 🔴 | **Une sortie « à vol d'oiseau » est présentée comme atteignable** : quand le pathfinder échoue, la distance euclidienne est gardée avec un « ≈ » gris de 12 px expliqué en `title` (invisible au doigt). Sans module Pathfinder, toutes le sont. → libellé en toutes lettres + séparateur « non confirmées » + bandeau si toutes | `sortieUrgence.js` |
| Q5 🔴 | **Bouton Sortie d'urgence = chip de 36×24 px** entre 📖, 📊, 🌍, 🔋 ; padding 2 px et icône 11 px sous 380 px. → ≥ 44 px, fond rouge permanent, isolé des chips d'information | `refonteInterface.js`, `css/style.css` |
| Q6 🔴 | **Icônes et noms des 4 notions d'urgence** : ⛑️ « Je suis perdu », 🚨 « Mode urgence — Affichage XL », 🚨 « Mode Secours — Plans de recherche », 🚨 header « Sortie ». → 🚪 Trouver une sortie · 🔦 Écran secours (ma position) · 🧑‍🚒 Coordonner des équipes · ⛑️ Je suis perdu | `interface.js`, `refonteInterface.js` |
| Q7 🔴 | **Commandes vocales : « où est la sortie » / « trouve la sortie » ouvrent la recherche ; « sortie d'urgence » ouvre l'écran XL ; « au secours » ouvre le planificateur.** Premier motif enregistré gagne, « recherche » et « urgence » sont enregistrés avant « sortie ». → enregistrer les vitales en premier ou scorer par spécificité ; retirer « urgence » des motifs génériques | `voiceCommand.js` |
| Q8 🔴 | **Vocal hors ligne = « Erreur : network »** pendant 2,5 s (la reconnaissance passe par un service distant, non dit). → message dédié + griser le micro hors ligne | `voiceCommand.js` |
| Q9 🟡 | **Wake lock OFF, rangé dans Affichage, jamais proposé** au démarrage du tracker. → case pré-cochée « garder l'écran allumé » dans la modale de démarrage, ou toggle dupliqué dans Navigation & Tracker | `wakeLock.js`, `interfaceConfig.js` |
| Q10 🟡 | **Vibration OFF (décision v1.85.2) rend muets tous les retours d'urgence et de navigation** (sortie trouvée, aucune sortie, alerte, étape validée, recalage). → sans re-litiger le défaut confort : **exception pour la classe urgence** ; corriger l'aide du réglage qui décrit l'état inverse du défaut (« Décocher = silence total ») | `config.js`, `utils.js`, `lang/fr.json` |
| Q11 🟡 | **Footer : « 🧭 ON » seul, rafraîchi toutes les 2 s, non cliquable** (l'infobulle promet « cliquer pour gérer »). Pas et distance ne se lisent qu'en rouvrant la modale Tracker, en instantané figé. → « 🧭 ON · 👣 128 · 96 m », clic = Play/Stop, appui long = modale | `refonteInterface.js`, `interface.js` |
| Q12 🟡 | **Après rechargement, l'itinéraire réapparaît sans ses étapes** ① ② ③ ni ses ✓ : seul le tracé cyan est restauré, les pastilles ne reviennent qu'en rouvrant la modale. → appeler le redessin des étapes après la restauration (les flags `done` sont déjà persistés) | `sessionPersist.js`, `interfaceItineraire.js` |
| Q13 🟡 | **Échecs d'itinéraire en langage moteur** : « Impossible de snap le waypoint #2 sur le réseau ». → nommer le point de l'utilisateur et proposer l'action (« *Puits Nord* est trop loin d'une galerie tracée — rapproche-le ou trace la liaison ») | `pathfinder.js`, `lang/fr.json` |
| Q14 🟡 | **Confirmation modale à chaque « Je suis ici » pendant un itinéraire** (décision v1.76.2, coût de calcul). → case « toujours recalculer » mémorisée, ou toast non bloquant « Itinéraire périmé — Recalculer » ; recalcul auto sous un seuil de taille | `interfaceItineraire.js` |
| Q15 🟡 | **Avertissement tracker à chaque rechargement** (drapeau en mémoire seulement ; iOS décharge souvent la PWA). → persister « vu » ou 1×/jour | `interface.js` |
| Q16 🟡 | **Tracker invisible si son niveau est décoché** (opacité 0, sans message). → fantôme semi-transparent ou toast « ta position est au niveau −1, masqué — Afficher » | `tracking.js` |
| Q17 🟡 | **Suspendre le verrou : aucun toast**, seul retour = compte à rebours dans une barre repliable ; « ∞ » ne rappelle jamais rien ; désynchronisation probable au changement de plan [Probable]. → toast à la suspension et à la réactivation, réinit au chargement d'un plan | `interface.js` |
| Q18 ⚪ | **« Tracking GPS » dans une app sans GPS**, « module expérimental » dans l'avertissement alors que Carnet, itinéraire, sortie d'urgence s'appuient dessus ; **« Verrou sur tracé » (menu) vs « Navigation intelligente » (réglages)** = une fonction, deux noms ; `alert()` natif si inactif. → « Suivi de position (pas + boussole) », un seul nom (« Suivi des galeries »), tuile grisée avec sous-titre | `lang/fr.json`, `interface.js` |
| Q19 ⚪ | **Deux boutons de bulle jamais traduits** : « 📍 Je suis ici » et « 🧭 Y aller » sont en dur en français alors que la clé `iti.wp.jeSuisIci` existe. | `utils.js` |
| Q20 🟡 | **Alertes publiques consultables uniquement depuis le HOME** (badge et bouton disparaissent une fois le plan chargé). → badge d'alerte dans le header carte | `homeConfig.js`, `alertChecker.js` |
| Q21 🟡 | **Chip Sortie d'urgence muet si le module n'est pas chargé** (`console.warn` seulement ; les 3 tuiles équivalentes affichent au moins une alerte). → toast « recharger l'app » | `refonteInterface.js` |
| Q22 🟡 | **Mode Perdu laisse sa zone orange sur la carte** après ✕ / fond / « Fermer » ; « Effacer la zone » n'existe qu'en bas des résultats. → toujours visible dans le pied dès qu'une zone existe | `lostMode.js` |

### 4.2 Édition (terrain, une main)

| # | Quick win | Où |
|---|---|---|
| Q23 🟠 | **Supprimer un point depuis sa bulle : ni historique, ni confirmation, ni toast.** Ctrl+Z ensuite applique un instantané antérieur (peut ressusciter le point *et* annuler autre chose). Le commentaire de `convertirObjet.js` suppose le contraire. → snapshot avant + toast « Point supprimé — Annuler » | `editor.js`, `utils.js` |
| Q24 🟠 | **Retaper la pastille de type : valide un tracé, DÉTRUIT une zone ou un pilier en cours** ; changer de type en cours de zone = même destruction, sans historique. → uniformiser sur le comportement tracé, ou toast « Zone abandonnée — Annuler » | `zones.js`, `structures.js`, `road.js` |
| Q25 🟠 | **Deux façons de fermer une zone, deux résultats** : re-clic sur le 1ᵉʳ sommet = historique écrit + outil éteint ; bouton ✅ du flyout = pas d'historique, **outil reste armé** (le tap suivant démarre une nouvelle zone). Idem structures. → même chemin pour les deux | `interface.js`, `zones.js` |
| Q26 🟡 | **Fermer une zone en re-tapant le 1ᵉʳ sommet : tolérance de 5 unités-plan** (= 1 px écran dézoomé). L'utilisateur croit que ça ne marche pas. La suppression au clic, elle, utilise 20 px. → tolérance en pixels écran (≥ 24) [Supposition sur le cercle visuel promis par le README] | `zones.js`, `structures.js` |
| Q27 🟡 | **Le picker « Repositionner » survit à l'activation d'un outil de dessin** (non enregistré dans le registre des modes) : une pression peut poser un sommet **et** téléporter le point. → l'enregistrer dans `_modesActifs` [Certain sur le code, Probable sur l'enchaînement] | `editor.js`, `interface.js` |
| Q28 🟡 | **Picker Nord : un clic sur un marqueur ou une zone est perdu** (le picker n'utilise pas la classe de floater commune, donc le ré-émetteur de clic reste inerte ; on calibre souvent en visant un repère connu). → ajouter la classe `kta-iti-floater` à l'encart, bénéfice hérité comme pour « Repositionner » | `northPicker.js` |
| Q29 🟡 | **Sommets de tracé posés au `mousedown`**, tout le reste au `click` : à la souris, glisser la carte en mode tracé pose un sommet. Un commentaire évoque des polylignes fantômes qui avaleraient le clic → comprendre avant d'aligner. [Certain handler / Probable effet] | `road.js` |
| Q30 🟡 | **Aucun retour haptique en dessin** : le helper de vibration est utilisé par tracker, itinéraire, alertes, secours — jamais par l'édition. → `.light()` par sommet, `.double()` à la fermeture (préférence déjà gérée) | `road.js`, `zones.js`, `structures.js`, `editor.js` |
| Q31 🟡 | **🧹 Effacer ne répond rien à vide** (×3, `return` sec) alors que ✅ voisin affiche une modale chartée ; les modes « supprimer au clic » utilisent un `alert()` natif dans le même cas. → griser ou même modale | `interface.js` |
| Q32 ⚪ | **« Annulable via ⏪ Ctrl+Z » sur un téléphone** (toast de suppression, description de « Tout effacer »). → « ⏪ Annuler (barre de gauche) » ou toast cliquable | `utils.js`, `lang/fr.json` |
| Q33 🟡 | **Calibrer un calque image : pas de retour d'un clic** (4 clics enchaînés, seul « Recommencer » qui efface tout) + 5 `alert()`. → « ↩ Annuler le dernier point » | `imageLayerCalibrationPicker.js`, `createConf.js` |

### 4.3 Lecture, filtres, données

| # | Quick win | Où |
|---|---|---|
| Q34 🟡 | **Filtres actifs invisibles hors modale et restaurés en silence** au rechargement : un POI masqué se lit « il n'existe pas ». → pastille/compteur sur ≡ + toast au restore « Filtres du plan restaurés — ≡ pour les lever » | `filterPanel.js`, `interface.js`, `sessionPersist.js` |
| Q35 🟡 | **« 🔄 Tout afficher » n'efface pas les filtres de niveaux, et le statut affirme « Aucun filtre actif ».** → inclure les niveaux dans le reset et dans le statut | `filterPanel.js` |
| Q36 🟡 | **Vue OSM sur plan V1 : bouton visible, `alert()` natif en impasse** avec une procédure Générateur impossible sur le terrain ; la condition V2 n'est pas dans `isAvailable()`. → l'ajouter (le chip disparaît, cohérent) et déplacer l'explication au HOME | `osmView.js` |
| Q37 ⚪ | **Vue OSM « opt-in » dans le vocabulaire mais ON par défaut (v1.90.2)**, et son `confirm()` de consentement n'est atteignable qu'à l'état « coupé », où le bouton n'existe plus (le bandeau HOME l'assume : « notification, pas consentement préalable »). → trancher le vocabulaire ; supprimer le confirm mort. Décision v1.90.2 respectée. | `osmView.js`, `osmHomePreview.js` |
| Q38 🟡 | **Cibles : ≡ Filtres 30×30 en haut à droite** (le point le plus dur au pouce), chips 📖 / 🌍 36×24. → plancher 44×44 par padding/pseudo-élément | `css/style-filtres.css`, `css/style.css` |
| Q39 ⚪ | **La légende renvoie vers « 🔍 Filtres »** alors que le contrôle réel est ≡ et que 🔍 est la Recherche ; « 🔄 Reset session » seul anglicisme. → « ≡ Filtres », « Réinitialiser la session » | `lang/fr.json` |
| Q40 🟡 | **Favori dont le point a disparu / est filtré : recentrage muet sur du vide.** → toast avec cause probable | `interface.js` |
| Q41 🟡 | **Stats globales : 5 `alert()` pour les 4 exports** ; entrée enfouie au milieu de la modale Session. → toasts + sous-action directe | `statsGlobales.js`, `refonteInterface.js` |
| Q42 🟡 | **Recherche multi-plans : `alert()` si bibliothèque vide, pont proposé même avec un seul plan, 60 résultats tronqués sans le dire.** | `crossPlanSearch.js`, `searchPoints.js` |
| Q43 🟡 | **Mode présentation : ✕ de sortie 36 px à 45 % d'opacité** (opacité 1 au survol, inexistant au doigt) ; entrée mobile = Réglages → Affichage → bouton. → 44 px, 0,75 ; sous-action visible | `presentationMode.js`, `css/style.css` |
| Q44 🟠 | **« 🗑️ Effacer la session » dans la modale de restauration : 1 tap, aucune confirmation**, détruit aussi les corrections de calques rapatriés (la même destruction depuis les Filtres a **deux** `ktaConfirm`). → `ktaConfirm` chiffré + toast « dans 📦 Backups » | `sessionPersist.js` |
| Q45 🟠 | **Supprimer un snapshot unitaire : aucune confirmation** (« Tout vider » en a une) ; corbeille collée à Restaurer. → toast Annuler 5 s | `refonteInterface.js` |
| Q46 🟡 | **Rien ne dit « enregistré », ni l'heure du dernier backup** ; `savedAt` est écrit mais jamais affiché. → ligne en tête de Détails de session « ✅ Enregistré il y a 3 s · dernier backup 14 h 07 », rouge si échec | `refonteInterface.js`, `sessionPersist.js` |
| Q47 🟠 | **Une sortie tracker-seule est refusée à l'export (« session vide »)** : le test ignore `trackerTimeline` alors que `sessionPersist` a été corrigé pour ce cas précis (v1.28.0). Le résumé de l'onglet Full n'affiche ni structures ni tracker. | `sessionExporter.js` |
| Q48 ⚪ | **L'aide d'import promet « remplacer ou fusionner » ; seul « remplacer » existe** (« un import est un remplacement, pas un merge », dit le code). → retirer la promesse | `lang/fr.json`, `interfaceImportExport.js` |
| Q49 🟡 | **Carnet : enregistre chaque sortie sans opt-in, l'interrupteur existe mais n'est câblé nulle part, et la clé voyage dans l'import de profil** (importer le profil d'un ami peut couper le carnet en silence). → toggle dans les réglages + exclure la clé du mode REPLACE | `journal.js`, `profileExportImport.js` |
| Q50 🟡 | **Sortie « trop maigre » (< 50 m et < 10 min) supprimée sans un mot.** → toast au teardown + 🏁 Clôturer visible en permanence | `journal.js` |
| Q51 ⚪ | **Descriptif des backups faux** : « 10 snapshots tous plans confondus » alors que c'est 10 **par plan** et que la liste est filtrée sur le plan courant. | `lang/fr.json` |
| Q52 🟡 | **Mise à jour marquée « vue » avant d'être appliquée** : si la MAJ douce échoue (réseau), plus jamais de proposition. → marquer au succès | `updateChecker.js` |
| Q53 ⚪ | **Erreurs profil « Échec : » + message technique brut** (×5). → messages typés comme pour les photos POI | `homeProfile.js` |
| Q54 ⚪ | **Session / Sortie / Carnet / Snapshots** = 4 mots pour « mon travail » ; **⬆️ « Enregistrer » exporte, ⬇️ « Charger » importe** (convention inversée). → « 📤 Exporter / Partager », « 📥 Importer », « ma sortie » + « historique » | `lang/fr.json` |
| Q55 🟡 | **Clôturer une sortie est en 6ᵉ section d'une modale de statistiques.** → tuile « 🏁 Terminer ma sortie » dans le menu Tracker et dans la modale de retour au HOME | `refonteInterface.js` |

### 4.4 Réglages, HOME, premier lancement

| # | Quick win | Où |
|---|---|---|
| Q56 🟠 | **B6** Reset des Réglages : confirmation + renommage + éloigner d'Appliquer | `interfaceConfig.js` |
| Q57 🟠 | **B4** « Tout réinitialiser » : les 9 postes avec compteurs | `interfaceMaintenance.js` |
| Q58 🟠 | **« 🗑️ Effacer » le géoréférencement supprime la calibration persistée sans confirmation** (fruit d'un relevé de surface ; déverrouille OSM, KMZ, GPX). → `ktaConfirm` ou scinder « Vider les champs » / « Supprimer le calibrage » | `interfaceConfig.js` |
| Q59 🟠 | **Le générateur de plan (jusqu'à 11 pages) se ferme d'un clic sur le fond**, sans confirmation ni brouillon. → `ktaConfirm` dès qu'un champ est rempli, fond inerte | `createConf.js` |
| Q60 ⚪ | **Réglages fantômes** : « Activer le mode multi-niveau » codé mais jamais rendu ; « Afficher tous les niveaux au lancement » documenté dans l'aide comme une case, jamais rendue ; « Distance d'accrochage (px) » absente des 3 docs ; toggle « Commandes vocales (BETA) » non décrit. → brancher ou retirer, documenter | `interfaceConfig.js`, `perfUltra.js`, `lang/fr.json` |
| Q61 ⚪ | **Wake lock et vocal masqués sans message si non supportés** (Firefox), alors que batterie/vibration, deux sections plus bas, sont affichés désactivés avec la raison (`ktaCapteurRefuse`). → même traitement | `interfaceConfig.js` |
| Q62 🟡 | **HOME vide : liste et recherche disparaissent sans message**, « Charger ce plan » actif sans fichier, outils avancés au premier plan. → bloc « Commencer » (importer / convertir SIG / générer / exemple), bouton grisé [Certain état vide / Supposition : masqué en prod par les plans serveur] | `homeLoader.js` |
| Q63 ⚪ | **Logo et titre du header = deux chemins vers le changement de plan** ; README décrit encore l'ancienne modale « perdre ces modifications ». | `refonteInterface.js`, README_USER |
| Q64 ⚪ | **Cheatsheet raccourcis inatteignable depuis l'accueil** et ouverte par « ? » (touche inexistante au doigt) ; elle documente aussi Espace/flèches du Replay qui concernent tout le monde. | `shortcutsCheatsheet.js`, `interfaceDocs.js` |
| Q65 ⚪ | **Pastille niveau = « 0 » sans libellé** ; bascule auto au franchissement d'une jonction signalée par un toast de 6 s seulement. → « Niv. 0 » + pastille colorée 3 s | `interfaceConfig.js` |

---

## 5. Chantiers moyens (1 j) et lourds (refonte)

### 5.1 Moyens — 28 constats

| # | Chantier | Zone | Pourquoi ça compte |
|---|---|---|---|
| M1 | **B5** bandeau persistant « sauvegarde impossible » | Données | perte silencieuse de 2 h |
| M2 | **B7** temporisation PIN + gate (décidé) | Sécurité | app morte sous terre |
| M3 | **Tracker coupé à chaque changement de plan** (y compris traversée physique d'un portail), sans le dire | Navigation | on marche 20 min « suivi » à tort |
| M4 | **Boussole : « N 0° » = aucun signal** (permission refusée, capteur absent) ; avertissement armatures seulement en modale plein écran | Navigation | boussole qui ment en carrière |
| M5 | **Démarrage vocal du tracker sans permission ni avertissement**, icône ▶️ qui ment (état UI ≠ moteur) | Navigation | canal vocal = gants |
| M6 | **Podomètre : 5 nombres bruts sans unité, « seuil » = accélération gravité incluse (borne min 10 au ras de g)**, aucun compteur live, aucune calibration guidée | Navigation | lié au BACKLOG podomètre (décision en attente) |
| M7 | **Garde batterie : conseils sans bouton** (« active Perf ULTRA et stoppe le tracker » = deux menus à retrouver à 10 %) | Navigation | |
| M8 | **Play/Stop/Recalage à 2 taps dans une modale de 10 tuiles** qui se ferme à chaque action (Play + Recalage = 4 taps) | Navigation | geste le plus fréquent |
| M9 | **Mode Secours : plan actif invisible modale fermée, et fermer efface le calque des équipes** ; aucun chip persistant ; 15 `confirm()` natifs dont « arrêter le plan » | Sécurité | opération réelle en cours |
| M10 | **Mode urgence XL ne survit pas au rechargement** (purge mémoire iOS = retour carte normale sans explication) | Sécurité | |
| M11 | **« Je suis perdu » = formulaire de 5 rubriques avant tout résultat** (outil d'analyse pour chercher *un autre*, nommé comme un bouton de panique) → raccourci « maintenant » pré-rempli | Sécurité | |
| M12 | **TTS jamais utilisé là où les yeux sont pris** (seul appelant : lire la note d'un POI) → énoncer sortie et cap | Sécurité | |
| M13 | **Vocal : opt-in enfoui dans Réglages → Affichage** ; proposer dans la préparation de sortie | Sécurité | |
| M14 | **Nom de point obligatoire, id = nom, aucune unicité** (deux « P1 » partagent leurs photos [Probable]) → nom auto « Point 7 », « Ajouter et continuer » | Édition | 5 repères en 20 s |
| M15 | **Bulle POI : 7 boutons de 26 px sur 3 rangées**, « Je suis ici » de la taille de « Favori » → 2 actions primaires + « ⋯ » | Édition | |
| M16 | **Mode actif invisible** (surbrillance d'une icône de 32 px) alors que les modes secondaires ont un bandeau bas → bandeau unique « ✏️ Ajout de point — ✕ Quitter / ✅ Terminer / ↩ Dernier point » | Édition | résout aussi « terminer un tracé exige de rouvrir le menu » |
| M17 | **Undo ne rend pas les photos supprimées**, sans avertir au Valider → « N photo(s) seront supprimées définitivement » | Édition | |
| M18 | **« Remplacer la session » (tableau) hors historique + `alert()`** | Édition | |
| M19 | **Sélection multiple à 4 niveaux** (éteindre l'outil → tap objet → note → Convertir → Sélection multiple), refus muet ; une seule action groupée (conversion), pas sur les POI | Édition | |
| M20 | **Type de point en `<select>` texte sans icône**, tags système mêlés aux tags terrain → grille d'icônes + 6 récents | Édition | |
| M21 | **Sidebar 36/30 px, libellés = `title` seulement** → 44 px sur pointeur grossier + libellé sous l'emoji pour les outils destructifs | Édition | |
| M22 | **Heatmap enfouie dans Tracker, aucun état visible, sortie par le même chemin à 3 niveaux** | Lecture | |
| M23 | **Favori non retirable depuis la liste** (et définitivement irretirable si son point a été supprimé) | Lecture | |
| M24 | **Thème non réglable une fois le plan chargé** (retiré du mode carte en v1.14.2 ; relance l'app ; l'en-tête du module décrit encore le toggle) | Lecture | buée, fatigue, frontale |
| M25 | **Vue OSM disparaît sans dire pourquoi** (5 conditions en un booléen ; le cas « pas de géoréf » est le plus réparable et le moins expliqué) → bouton grisé avec raison au tap | Lecture | |
| M26 | **Légende inerte** → ligne cliquable = bascule du filtre | Lecture | |
| M27 | **Export : 5 onglets dont Conversion et Fusion (outils de mainteneur)** ; 3 entrées « Exporter » dans le même menu ; 26 `alert()` ; GPX derrière 8 champs de calibrage | Données | |
| M28 | **Réglages : ~50 contrôles en un scroll, moitié appliquée au clic, moitié au bouton « Appliquer »** tout en bas (fermer par la croix perd l'échelle en silence) ; **création de plan finit dans « Téléchargements »** sans « Charger maintenant » ; **langue** impose de quitter le plan | Réglages | |

### 5.2 Lourds — 4 chantiers qui changeraient l'usage

| # | Chantier | Constats absorbés |
|---|---|---|
| **L1 — Mode terrain** | Une bascule à 1 tap qui réduit l'écran à 5 gestes en cibles de 48 px : **Je suis ici · Play/Stop · Point rapide · Urgence (choix à 3 tuiles géantes) · Filtres**, le reste derrière « ⋯ ». Bandeau d'état unique. C'est la réponse au contexte « une main, gants, noir » ; aujourd'hui 18 icônes de 32 px encadrent la carte sur mobile. | T3, T7, M8, M15, M16, M21 |
| **L2 — Point rapide + bulle allégée** | Tap = point avec le dernier tag, nom auto, grille d'icônes, « Ajouter et continuer », bulle réduite à 2 actions + « ⋯ ». Divise par deux le coût de chaque annotation. | M14, M15, M20, Q23 |
| **L3 — Un seul modèle « ma sortie »** | Un vocabulaire (sortie / historique), un écran « Terminer ma sortie » = clôture + partage (fichier / image / PDF) + carnet, un import à une modale, premier lancement réduit (27 cartes → 6-8, PIN proposé au 3ᵉ lancement). | T6, Q54, Q55, M27 |
| **L4 — Un seul écran de réglages avec portée explicite** | « Réglages » partout ; chaque ligne marquée « ce plan » / « tous les plans » ; les globaux visibles depuis le plan en lecture seule avec lien ; groupes repliés ; géoréférencement dans son propre écran ; application immédiate partout ; « Maintenance » replié. | M28, Q60, Q61 |

> Correctif 14/09/2026 : les références « P… » citées à l'origine dans cette colonne ne correspondaient à aucune ligne du rapport (numérotation interne des agents, non reprise) ; elles ont été retirées. Arbitrage KARMA du 14/09 : L1 et L2 écartés (l'écran et la pose de point conviennent), L4 lancé, L3 à concevoir ensemble — une **sortie** terrain se fait *dans* une **session** et se clôture sans la fermer : deux objets distincts, à ne pas fusionner.

---

## 6. Écart doc ↔ app — 36 constats

**Le fait qui résume tout** : le même fait est rédigé jusqu'à **5 fois** (README_USER, aide intégrée, AI_CONTEXT, tutoriel, textes UI) et sur le sujet le plus banal, le nombre d'onglets de la modale Exporter, on trouve **4 valeurs** (3, 4, 5, « onglet KMZ »). Ce n'est pas une coquille : c'est la conséquence mécanique du modèle « append-only × 5 sources ». ~200 mentions extraites, ~80 vérifiées par grep ; ce qui n'est pas listé ici est **conforme** (splash 3,5 s, 5 photos/point, undo 50, touche F, replay, 3 langues, 27 cartes…).

### 6.1 Documenté mais absent ou différent (17) — tous quick win

| # | Constat | Sources fautives | Confiance |
|---|---|---|---|
| D1 | **Onglets Exporter : 3 / 4 / 5 / « onglet KMZ » / « onglet GPX » selon la source.** Réel : 5 (Full · Avancé · Conversion · Fusion · 📡 Export externe), aucun onglet KMZ ni GPX. | README ×2, tutoriel, AI_CONTEXT ×4 | Certain |
| D2 | **Menu Tracker décrit comme un « flyout » à 10 sous-actions en « ordre fixe »** (README, tutoriel) ; réel : modale plein écran à 3 sections, 11 tuiles dont Mode Secours. L'aide, elle, est juste. | README §1186, tutoriel c14 | Certain |
| D3 | **« ⬇️ → 🗂️ Changer de plan »** : sous-action retirée depuis v1.8.1 ; le retour passe par la rose des vents / le titre. | README §3074, aide `charger-import` | Certain |
| D4 | **Clic sur le titre : « modale » (§595) vs « petit menu déroulant » (§1063)** à 470 lignes d'écart, sans renvoi. Réel : modale. | README | Certain |
| D5 | **Vue OSM : « opt-in : tu l'actives toi-même »** (aide, tutoriel « Autoriser », AI_CONTEXT ×9, texte UI `secours.osm.raisonOptin`) alors qu'elle est **active par défaut depuis v1.90.2** ; le README, lui, le dit bien. **C'est le seul écran qui sort sur Internet : écart de confidentialité, pas cosmétique.** | aide, tutoriel c24, AI_CONTEXT, fr.json | Certain |
| D6 | **« ⚙️ → 🗑️ Réinitialiser » et « ⚙️ → Forcer la mise à jour » attribués aux Réglages du mode carte** ; 80 lignes plus haut le README dit l'inverse (« n'est plus ici, passe par Configuration »). Réel : Configuration accueil. En dépannage, mauvaise modale au pire moment. | README §3522, §3630 | Certain |
| D7 | **« ⚙️ Réglages → onglet Géoréférencement »** : la modale n'a aucun onglet (section à défilement). Sur mobile on cherche une barre d'onglets et on ne scrolle pas. | README §3426 | Certain |
| D8 | Position des boutons du header (📖 « à gauche de 🔋 », 🚨 « entre 📖 et 🔋 ») : 🌍 s'intercale sur plan géoréférencé. | aide `histoire`, `sortie-urgence` | Certain |
| D9 | **Libellés cités de travers** : « Aide / Doc / Légende », « 🖼️ Plan en image », « 📥 Importer une session », « 💾 Sauvegarde session → Enregistrer la session », « ⬇️ Charger → 📤 GPX » (pas de sous-action GPX), « 🎬 Lancer le mode présentation ». Recherche visuelle du mot exact impossible ; chemins inventés pour l'IA. | README ×3, AI_CONTEXT ×2 | Certain |
| D10 | **« Tous les outils dans la barre latérale droite, 13 groupes »** : 7 sont à gauche. C'est LE tableau de référence de l'interface. | README §1014 | Certain |
| D11 | **Snapshots « toutes plans confondus » (texte UI) et « TOUTES tes sessions… même supprimés » (tutoriel)** : réel 10 **par plan**, purgés à la suppression du plan. Faux sentiment de sécurité. | fr.json `backups_desc`, tutoriel c23 | Certain |
| D12 | **Tutoriel : « DevTools → Application → stockage local → myktamap_backups »** : c'est une base IndexedDB, et l'app a une UI de restauration décrite 2 lignes plus haut. | tutoriel c23 | Certain |
| D13 | « 4 styles » de légende PDF : réel 3 PDF + 3 image (listes fusionnées). | tutoriel c22, aide | Probable |
| D14 | AI_CONTEXT « Générer un plan → Modifier existant → **onglet** Icônes » : assistant pas-à-pas, pas d'onglets. | AI_CONTEXT | Probable |
| D15 | « fichier `devmap-session` » : c'est la valeur interne du champ `type`, pas un nom de fichier. | README §2822 | Certain |
| D16 | Panneaux d'outils « horizontaux vers l'intérieur » (§595) vs « centrés à l'écran » (§2643, v1.85.1). Réel : centrés, ancrage opt-in. | README | Probable |
| D17 | « Mode OSM » (titre §825) vs « Vue OSM » (24 mentions). | README | Probable |

### 6.2 Présent mais non documenté

| # | Constat | Effort |
|---|---|---|
| D18 | **Boutons de la bulle POI « Y aller », « ➕ Itinéraire », « Lire la note à voix haute »** : 0 mention dans les 3 sources (le README a pourtant une section « La bulle d'un objet »). Trois raccourcis terrain invisibles. | moyen |
| D19 | **Modale 📊 Détails de session** devenue le hub (favoris export/import, stats agrégées, répartition par niveau, snapshot manuel, carnet) ; la doc la présente encore comme 4 puces. | moyen |
| D20 | **Le tutoriel lui-même** : aucun moyen documenté d'y revenir (bouton 🎓 dans l'en-tête de la Documentation, jamais mentionné). | quick win |
| D29-34 | Inventaire réglages : « Afficher tous les niveaux au lancement » décrit dans l'aide comme une case, **aucune case n'existe** · « Distance d'accrochage (px) » : 0 occurrence · toggle « Commandes vocales (BETA) » non décrit · aide `parametres` : « 6 optims » / « 7 toggles » (réel 1 méta + 7), seuil « 50 vs 500 » vs hint « 50 vs 200 », « persistance globale » de Perf ULTRA (réel : par plan) · aide profil « 38 succès » vs 32 · modules absents de README_USER : mesure OSM, coordonnées de surface, lecture vocale, inspecteur mémoire · calibration du Nord, tolérance latérale, poids du cap : README seul. | quick win |

### 6.3 Sections obsolètes qui se contredisent (README_USER)

| # | Constat |
|---|---|
| D21 | **Mode Secours = 5 sections empilées (528 lignes, 14 % du document)**, chacune ouvrant par « désormais » ; les 3 vues Live décrites 3 fois avec des boutons différents. Fusion nécessaire (moyen). |
| D22 | **« Phase » a deux sens** : étapes opérationnelles du scénario (README) vs jalons de développement « Phase 3 (v1.24.0) » (AI_CONTEXT). Un assistant IA répondra à côté. → renommer les jalons dev « lot ». |
| D23-25 | Tracker (§1182 vs §1014), Réglages (§3438 vs §3522/§3630), sidebar/panneaux (§595 vs §1014 vs §2643) : voir D2, D6, D10, D16. |

### 6.4 Jargon, navigabilité, aide contextuelle

| # | Constat |
|---|---|
| D26 | **Jargon dans README_USER** : IndexedDB ×13, Leaflet ×13, localStorage ×10, Service Worker ×5, SHA-256 ×4, PDR ×4, `plan-config.json` ×4, WebAuthn, WYSIWYG, DevTools, payload. Bon point : 0 nom de fichier `js/`, 0 « O(N) », 0 « viewport culling ». → « dans ton navigateur », « podomètre », « tel quel à l'écran ». |
| D27 | **Modale Documentation** : sommaire H2/H3 + scrollspy existent, mais **aucune recherche plein texte**, sommaire **caché par défaut sous 1 100 px** (= tout mobile), 79 H4 hors sommaire, 193 entrées, 3 739 lignes ≈ 200 écrans de téléphone. **Non raisonnable en modale mobile.** L'aide intégrée a une recherche, mais sur 30 titres seulement, sans accents. |
| D35 | **Aucune modale n'a de bouton d'aide contextuelle** ; l'aide intégrée dit elle-même « n'en a plus ». 25/25 contrôles principaux ont un `title`, invisible au doigt. |
| D36 | Les `title` du mode carte sont résolus à la construction : **non re-traduits** au changement de langue à chaud. |
| D28 | **À venir** : la décision PIN/gate (temporisation) touchera au moins 5 emplacements rédactionnels (README §3512, aide `code-acces`, AI_CONTEXT ×2, textes `pin.gate.*`) : cas d'école du problème de stratégie ci-dessous. |

### 6.5 Divergence des sources sur un même sujet

| Sujet | README_USER | Aide intégrée | AI_CONTEXT | Tutoriel | Code |
|---|---|---|---|---|---|
| Onglets Exporter | 3 (liste 4) + « onglet KMZ » | 5 | « onglet KMZ », « onglet GPX » | 4 | **5** |
| Menu Tracker | flyout, 10, ordre fixe | modale 3 sections | « menu Tracker » | flyout | **modale, 11 tuiles** |
| Vue OSM | active par défaut | opt-in | opt-in ×9 | « Autoriser » | **défaut ON** |
| Snapshots | 10 par plan | — | — | tous plans, même supprimés | **10 par plan, purgés** |
| Côté des groupes | droite (13) | — | « gauche → Charger » | gauche | **7 gauche / 6 droite** |

### 6.6 TOP 8 corrections doc (quick wins, par impact)

1. **D5** aligner aide, tutoriel, AI_CONTEXT et `secours.osm.raisonOptin` sur « active par défaut, désactivable dans Configuration » : **écart de confidentialité, en premier**.
2. **D1** « 5 onglets » partout ; « onglet 📡 Export externe » à la place de « KMZ » / « GPX ».
3. **D3** retirer « 🗂️ Changer de plan » (README + aide).
4. **D2** réécrire README §1186-1210 (modale 3 sections, 11 tuiles) ; corriger « flyout » du tutoriel.
5. **D6** « ⚙️ Configuration (accueil) » dans README §3522 / §3630.
6. **D11 + D12** texte UI « pour ce plan » ; tutoriel : supprimer « même supprimés » et la phrase DevTools.
7. **D4 + D16** supprimer README §1063-1086 et la puce « landscape → horizontal » de §595, renvoyer vers §2643.
8. **D10** README §1014 : « deux barres : gauche (Favoris → Historique), droite (Tracker → Structures) ».

### 6.7 Avis sur la stratégie doc (5 lignes)

1. **Le modèle actuel ne peut pas converger** : 5 rédactions du même fait, un bump = 5 fichiers, append-only qui empile « désormais » sur « désormais ». D1 et D21 sont des preuves, pas des accidents.
2. **Une seule source, trois rendus** : découper README_USER en fichiers par sujet (≤ 300 lignes) ; l'aide intégrée devient un index de cartes qui **renvoie vers l'ancre** du sujet au lieu de réécrire ; AI_CONTEXT = concaténation générée des mêmes fichiers + préambule anti-hallucination. Le tutoriel garde 27 cartes courtes **sans chiffres ni chemins** (il cite « flyout », « 4 onglets », « DevTools » : trois erreurs pour un support censé être stable).
3. **Passer de « journal » à « état courant »** : supprimer les « depuis v1.xx » de plus de 6 mois, fusionner les sections empilées, viser ≤ 1 500 lignes. C'est déjà la règle pour `version.json`.
4. **Outiller comme pour les icônes** : un garde-fou pré-commit qui extrait les libellés en gras des chemins « X → Y » et vérifie leur existence dans `fr.json` aurait attrapé D3, D6, D7, D9, D14. Le repo a déjà ce réflexe (`check-icon-catalog`, `check-style-canon`).
5. **Mobile d'abord pour la modale** : recherche plein texte avec surlignage + sommaire en chips repliables. Sans ça, réduire à 1 500 lignes ne suffira pas.

---

## 7. Ce qui manque — regard SIG grand public (32 fonctionnalités vérifiées par grep, recoupées au backlog)

**Présent et solide (ne pas reproposer)** : snapshots de session (10/plan, auto 5 min), profil en long, grande boussole (modale), export/import de profil complet (avec archives ZIP), statistiques (plan + carnet + rapport PDF), export CSV/tableau, fusion de sessions (existe, BACKLOG le rappelle).

**Enterré au backlog — ne pas reproposer** : plein écran iPhone via API Fullscreen (2 rollbacks) · QR de partage (Secours, densité) · Import/Export Live · traversée de portail en Vue OSM. **Décision de conception active** : EXIF des photos détruit volontairement (confidentialité) → pas de photo géolocalisée.

**Déjà au backlog** : import VisualTopo `.tro` (à lancer), Shapefile (basse priorité), podomètre / mode poche (étude faite, décision en attente).

| # | Manque | Pour qui / scénario | Valeur | Effort | Conflit | Statut |
|---|---|---|---|---|---|---|
| N1 | **Échelle graphique sur la carte** (le contrôle Leaflet existe dans la lib, jamais activé ; l'échelle px/m est connue) | tout le monde, lecture de distance à l'œil | forte | **quick win** | aucun | nouveau |
| N2 | **Indicateur de sauvegarde** (= Q46) | terrain, « puis-je quitter ? » | forte | quick win | aucun | nouveau |
| N3 | **Mode gants / taille des cibles réglable** (une variable de taille + réglage) | terrain | forte | moyen | aucun | nouveau (= T3) |
| N4 | **Verrou tactile anti-touchers accidentels** (téléphone en poche pendant le suivi) | mode poche | forte | quick win | aucun | nouveau — **pertinent pour l'étude podomètre/poche du backlog** |
| N5 | **HUD « distance / temps restant » permanent en navigation** (aujourd'hui seulement modale ouverte, rafraîchi au re-rendu) | itinéraire | forte | moyen | aucun | nouveau |
| N6 | **Calibration guidée du pas** (« marche 10 m, tape ici ») ; le motif picker existe pour l'échelle, pas pour le pas | tracker | forte | moyen | aucun | backlog podomètre (partiel) |
| N7 | **Rappel / alarme de temps ou de distance** (ex. « tu es sous terre depuis 3 h ») ; seul système de seuil = batterie | sécurité solo | moyenne | moyen | aucun | nouveau |
| N8 | **Recherche plein texte dans l'aide** (titres seulement aujourd'hui, sans normalisation d'accents) | doc | moyenne | quick win | aucun | nouveau |
| N9 | **Mode rouge / atténuation** (préserver l'adaptation à l'obscurité ; thème sombre ≠ mode nuit) | spéléo | moyenne | quick win (filtre CSS) | aucun | nouveau |
| N10 | **Notes vocales sur un point** (MediaRecorder hors ligne, stockage IDB comme les photos) | mains prises | moyenne | moyen | aucun | nouveau |
| N11 | **Rotation de la carte selon le cap (heading-up)** | navigation | moyenne | **lourd** (CRS.Simple, aucun plugin vendored) | perf / vanilla | nouveau |
| N12 | **Partage d'un seul point ou itinéraire** (fichier unitaire, texte) ; aucune Web Share API, aucun lien profond (offline oblige) | usage privé entre amis | moyenne | moyen | offline (pas de lien serveur) | QR enterré pour Secours — un point seul tiendrait dans un QR léger, **fait nouveau à soumettre**, pas à décider ici |
| N13 | **Ouvrir un fichier depuis le système / partager vers MyKTAMap** (`file_handlers`, `share_target`, `shortcuts` absents du manifest) | mobile | moyenne | quick win (manifest) | support inégal (PWA installée) | nouveau |
| N14 | **Multi-sélection : suppression / déplacement / niveau groupés** (aujourd'hui conversion seule, pas sur les POI) | correction après import SIG | moyenne | moyen | aucun | nouveau |
| N15 | **Chronomètre de sortie live** (durée mesurée mais texte figé, lisible seulement en modale) | terrain | faible-moyenne | quick win | aucun | nouveau |
| N16 | **Mode gaucher / position de la barre** (le code sait déjà placer les flyouts selon le côté, jamais exposé) | gauchers | faible-moyenne | quick win | aucun | nouveau |
| N17 | **Unités impériales** (un seul formateur, aucun paramètre) | public non-FR | faible | quick win | aucun | nouveau |
| N18 | **Aller à des coordonnées plan / créer un point par x,y** | bureau | faible | quick win | aucun | nouveau |
| N19 | **Croquis à main levée** ; clé orpheline `myktamap_freehand_prefs_v1` dans l'export de profil (vestige à nettoyer) | annotation libre | faible | lourd | perf | nouveau (nettoyage = quick win) |
| N20 | **Accessibilité** : 70 `aria-label` pour 115 k lignes, 1 dans `index.html`, aucun skip link ; focus non restauré à la fermeture des modales (audit modales v2) | lecteur d'écran, clavier | moyenne | lourd | aucun | **déjà connu** (ui.md §88 UX8) |
| N21 | **Dossiers / collections de favoris** (liste plate par plan) | gros plans | faible | moyen | aucun | nouveau |
| N22 | **Alertes sonores / TTS sur les événements de sécurité** (= M12) | mains/yeux pris | moyenne | moyen | aucun | nouveau |

---

## 8. Ce qui est bien conçu — à ne pas casser

1. **Le motif « mode clic carte » avec bandeau bas d'écran** (itinéraire, géoréférencement, repositionner, fin de sortie, suppression ciblée) : la modale s'efface, la carte reste, un bouton Terminer/Annuler, le clic capturé même sur un marqueur. **C'est le composant à généraliser (M16), pas à remplacer.**
2. **« 📍 Je suis ici » et « 🧭 Y aller » depuis n'importe quelle bulle**, recalage auto-désarmé, replanification au recalage, validation d'étape par coordonnées exactes. Il ne manque que le drapeau B1.
3. **Le filet de données** : auto-save par plan, 10 snapshots, modale de changement de plan qui *rassure* au lieu de menacer, « Reprendre » sur le HOME.
4. **L'écran Mode Urgence XL** : bouton de sortie plein format, Échap, bascule 🌑/🔆 lampe d'appoint, wake lock, permission capteurs demandée sur geste utilisateur.
5. **Incognito** : bordure violette au-dessus de tout mais transparente aux clics, badge, titre d'onglet, charte de garde-fou avant activation, flush de session avant lancement.
6. **La restitution d'un calque rapatrié : trois issues, jamais deux** (« exporter d'abord ? » puis « restituer quand même ? »), avec le coût chiffré avant. Le code écrit la règle : « un choix destructeur ne doit pas partager un bouton avec un choix sûr ». **C'est le standard que B3, B4, B6, Q44 doivent atteindre.**
7. **Photos POI** : vignette d'attente, compteur N/5, ✕ réversible jusqu'au Valider, nettoyage à l'annulation, messages distincts quota point / quota appareil.
8. **Modales Service Worker** : « ce qui est conservé », « effets », « conditions » ; kill SW **refusé** hors ligne sans « continuer quand même ».
9. **Suppression d'un plan** : retirée de la liste (trop facile à toucher), au fond de la fiche ℹ️, confirmation qui énumère ce qui part et ce qui reste.
10. **Capteurs indisponibles affichés désactivés avec la raison** (batterie, vibration) ; **wake lock qui attend le résultat réel** avant d'annoncer.
11. **Profil en long honnête** : sans échelle il le dit, sans profondeurs il propose le bouton de saisie au lieu d'une ligne plate.
12. **Recherche multi-plans** : « analyse en cours » ≠ « aucun résultat », progression plan par plan, scan interrompu à la fermeture.
13. **Mode présentation qui prévoit sa sortie** (✕ flottant safe-area, toast listant les 3 sorties, raccourcis désactivés pendant la démo).
14. **Curseur de précision** par interception centralisée des 6 drapeaux de mode ; **formulaire de point exempté** de la coupure automatique des modes (5 points d'affilée sans réarmer).
15. **Repositionnement sans drag** (justifié : un touchmove sur marqueur deviendrait un déplacement accidentel), picker explicite, re-recherche du point au clic.
16. **Modales 🧹 chiffrées** (4 portées, compteurs, destructif en rouge, Annuler en bas).
17. **« Aucune sortie trouvée »** explique quels tags sont reconnus ; indicateur de chargement peint avant le batch de calculs.
18. **Pavé PIN** dimensionné pour des doigts engourdis (police 22, padding 16, ✓ explicite, dernier chiffre visible 0,5 s, doc accessible depuis le verrou).

---

## 9. Recoupement backlog — ce qui était déjà connu

| Sujet | Statut backlog | Ce que cet audit ajoute |
|---|---|---|
| `alert()`/`confirm()` natifs (D-confirm, ui.md UX1/UX6) | connu, « au fil de l'eau » | **la tendance est à la hausse** (101+29 → 177+60) ; 3 foyers concentrent le risque terrain : Secours (15 confirm), export (26 alert), PIN (17 alert) |
| Podomètre / mode poche | étude faite, décision en attente | M6 (seuil = gravité incluse, sans unité), N4 (verrou tactile), N6 (calibration guidée) sont des entrées de cette décision |
| Magnétisme D0 | décision v1.74.0 (cercles OFF) | non re-litigé ; l'audit note seulement que le magnétisme OFF est **silencieux** (T1) |
| Vibration OFF v1.85.2 | décision | non re-litigé ; **exception urgence** proposée (Q10) |
| Vue OSM ON par défaut v1.90.2 | décision | non re-litigé ; **vocabulaire « opt-in » et confirm mort** à nettoyer (Q37) |
| Recalcul d'itinéraire confirmé v1.76.2 | décision | Q14 propose une case « toujours », pas un retour en arrière |
| Plein écran iPhone, QR Secours, Live, portail OSM | enterrés | **non reproposés** ; N12 signale un fait nouveau (QR d'un point seul), à soumettre, pas à décider |
| a11y (UX8) | reporté | N20, chiffres réactualisés |
| D3 « Mes annotations » ne masque pas les roads | bloqué sur mesure KARMA | distinct de Q34 (filtres invisibles) |

---

## 10. Ordre de marche proposé

**Je ne recommande pas de sprint « ergonomie » global.** Je recommande 3 lots courts, chacun mesurable, avant de toucher aux chantiers lourds.

1. **Lot Sécurité (½ j)** : B1, B2, Q3, Q4, Q5, Q6, Q7, Q8, Q10 (exception urgence), Q20, Q21. Vérifiable au harnais + 1 test appareil iOS (refus de permission).
2. **Lot Filets de données (½ j)** : B3, B4 (texte), B6, Q23, Q24, Q25, Q44, Q45, Q47, Q49, Q58, Q59. Chaque item = un `ktaConfirm` ou un snapshot, le composant existe.
3. **Lot État visible (½ j)** : Q34, Q35, Q11, Q12, Q46, Q16, Q17, Q9 (wake lock au démarrage). Rend l'app lisible en marchant.
4. **Lot Doc (½ j, sans code)** : D5 (Vue OSM « opt-in » → « active par défaut », écart de confidentialité), D1, D3, D2, D6, D11 + D12, D4 + D16, D10, plus le nettoyage des réglages fantômes (Q60). À faire **avant** le prochain bump, sinon la règle « bump = sync docs » propage du faux.
5. **Puis** M2 (temporisation PIN + gate, décidée), B5, et seulement ensuite L1 (mode terrain), qui absorbe une dizaine de constats et mérite un topo à part. La stratégie doc (§6.7, une source / trois rendus + garde-fou pré-commit) est un chantier séparé, à trancher par KARMA.

**Risque du lot 1** : Q1 (drapeau position) touche le tracker et la sortie d'urgence, deux chemins critiques sans test runtime ici. À valider sur appareil avant release, pas seulement au harnais.
