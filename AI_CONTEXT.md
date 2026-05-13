# MyKTAMap — Documentation utilisateur (version enrichie pour assistance IA)

> Document généré le **{{DATE}}** (build {{BUILD}}) par l'application MyKTAMap pour servir de **source de référence** à un assistant IA. Le lecteur (humain ou IA) doit considérer le contenu ci-dessous comme **la seule documentation officielle disponible** de l'application.
>
> Ce fichier est servi tel quel depuis la racine de l'app : `AI_CONTEXT.md`. Pour l'enrichir, éditer directement ce fichier — aucun re-déploiement de code n'est nécessaire, le service worker se chargera de propager la mise à jour.

---

## ⚖️ Mentions légales

- **Auteur** : Flavien VIDAL (alias KARMA)
- **Site officiel** : https://myktamap.is-underground.fr
- **Licence** : **CC BY-NC-SA 4.0** — Attribution, NonCommercial, ShareAlike
  - Usage non commercial autorisé avec attribution + partage à l'identique
  - **Usage commercial strictement interdit** sans accord écrit préalable de l'auteur
- **Code source** : **non distribué publiquement** (pas de dépôt ouvert). Toute personne consultant ce document n'a accès qu'à la documentation utilisateur — pas au code, pas à l'app live, pas aux données.
- **Collaboration** : **ouverte sur demande** (contributions, ports, intégrations, retours terrain). Contact via le site officiel.

> ⚠️ Toute reproduction, modification, redistribution ou utilisation commerciale de cette documentation ou de l'application sans accord écrit préalable de l'auteur expose à des poursuites pour contrefaçon (art. L.335-2 du Code de la propriété intellectuelle).

---

## ⛔ INSTRUCTIONS CRITIQUES À L'IA — À LIRE AVANT TOUTE RÉPONSE

> 🛑 **RÈGLE ABSOLUE — TOLÉRANCE ZÉRO À L'HALLUCINATION**
>
> Tu réponds **EXCLUSIVEMENT** à partir du texte présent dans ce document. Si une information n'est pas littéralement écrite dans le document fourni, **elle n'existe pas dans MyKTAMap**, point final.
>
> Tu ne dois **JAMAIS** :
> - Inventer une fonctionnalité, un type de zone, un type de point, un mode, un bouton, une option, un format de fichier, etc.
> - Extrapoler par analogie avec d'autres applications de cartographie (Google Maps, QGIS, Mapbox, etc.).
> - Compléter une liste en ajoutant des éléments "logiques" qui ne sont pas dans le document.
> - Supposer qu'une fonctionnalité existe parce qu'elle "devrait" exister ou parce que c'est "courant".
> - Reformuler le périmètre de l'app au-delà de ce que la doc décrit.
>
> Si l'utilisateur te demande quelque chose qui n'est pas dans le document, **dis-le explicitement** : *"Cette fonctionnalité n'est pas décrite dans la documentation que j'ai. Vérifie directement dans l'app ou contacte l'auteur via https://myktamap.is-underground.fr."*

---

### 🔒 Procédure de vérification AVANT de répondre

Pour **chaque** question :

1. **Cherche le terme** mentionné par l'utilisateur dans **tout le document** (préambule + survol des fonctionnalités + doc utilisateur + glossaire + recettes + FAQ). Considère aussi les **synonymes** raisonnables : "mode urgence" ≡ "Je suis perdu" ≡ "perdu" ; "itinéraire" ≡ "trajet" ≡ "navigation" ; "session" ≡ "annotations" ; etc.
2. Si le terme apparaît dans le survol, une recette, la doc ou la FAQ → réponds à partir de ce contexte, sans extrapoler au-delà.
3. Si le terme n'apparaît **nulle part** dans le document même après vérification des synonymes → la fonctionnalité n'existe probablement pas, dis-le clairement.
4. **Cite la section** du document où l'info est trouvée (ex : *"D'après la recette J..."* ou *"D'après la section '⬛ Tracer des zones'..."*).

⚠️ **Ne dis JAMAIS "ça n'existe pas" sans avoir vérifié dans toutes les sections** (en particulier le **survol des fonctionnalités principales** ci-dessous et les **recettes** plus bas, qui contiennent les fonctionnalités modernes ajoutées récemment).

---

### 📋 Liste exhaustive des éléments qui EXISTENT (anti-hallucination)

> Cette liste te sert d'**ancrage** sur les **listes fermées** (types de zones, types de tracés, modes performance, etc.). Pour ces listes : tout ce qui n'est PAS listé ici **n'existe pas**.
>
> ⚠️ **Pour les fonctionnalités générales** (modes, outils, sections d'interface, recettes), la doc complète plus bas est la référence — la liste ci-dessous est non exhaustive sur ce plan, juste un **survol**. Si l'utilisateur demande une fonctionnalité qui n'est pas dans le survol, **cherche dans la doc complète et les recettes** avant de répondre "n'existe pas".

**Fonctionnalités principales** (survol — détails dans la doc + recettes) :
- 🗂️ **Multi-plans** : registre de plans, import ZIP, auto-discovery serveur, modale "Plan introuvable", titre cliquable plan switcher
- 🔍 **Recherche de points** par nom / id / tag, avec filtres calques et tags, insensible aux accents
- 🧭 **Tracker PDR** (expérimental) : tracking inertiel mobile, mode 📍 Recalage
- 🗺️ **Itinéraire** : pathfinder Dijkstra entre 2+ waypoints, label distance + temps estimé en bas-gauche
- ⛑️ **Mode urgence "Je suis perdu"** (sous-action du groupe 🧭 Tracker) : estime une zone de recherche à partir de dernière position + temps écoulé + indices visuels texte ; affiche cercle orange, markers violets pour les indices in-zone ; bloc dépliable "📚 Bonnes pratiques" ; rapport copiable
- 📐 **Mesure de distance simple** (clic-clic, label bas-gauche)
- 📏 **Distance totale des tracés** (filtre par type, highlight magenta)
- ✏️ **Édition de points** (ajout, modification, suppression via popup)
- 🛣️ **Tracés / Roads** : Principal / Secondaire / Chemin / Itinéraire
- ⬛ **Zones** : Remblais / Effondrement / Eau
- 💾 **Sauvegarde session** : Full / Avancé / Conversion (session → data layer)
- 🖼️ **Export PNG** : Mode rapide / Mode avancé (avec légende, calques au choix, résolution)
- 🏗️ **Générateur de plan** : Nouveau plan / Modifier existant (ZIP)
- ⚙️ **Réglages** : calibrage échelle, debug, reset complet, etc.
- 🚀 **Mode Performance ULTRA** (dans ⚙️ Réglages) : 6 toggles d'optimisation agressifs pour gros plans / appareils faibles — décimation tracés, désactivation animations Leaflet, abaissement seuil intersections, skip popups data-layer, auto-save lent, viewport culling. Préset ULTRA bloc ou ajustement individuel. N'affecte PAS l'image (gérée par mode performance au chargement).
- 🤖 **Aide IA** : téléchargement de ce fichier de contexte
- 🔔 **Détection de mise à jour** : version.json + popup avec choix mise à jour douce / reset complet
- 🚨 **Alertes publiques** : système de diffusion d'alertes (incendie, fermeture, gaz toxiques...) via fichier `alert.json` côté serveur. Modale rouge pulsante après le splash. Bouton 🚨 dans le header du loader pour re-consulter à tout moment.
- 🏗️ **Générateur de plan** : auto-détection des dimensions de l'image principale + warnings si > 10000 px / > 30 Mo. Position initiale tracker auto-centrée (W/2 × H/2) au choix de l'image, avec bouton 🎯 Recentrer.

**Types de zones** (exhaustif — il n'en existe que 3) :
- **Remblais** (gris foncé, ⬛)
- **Effondrement** (rouge, 🟥)
- **Eau** (bleu, 🟦)

→ Il n'y a **PAS** de zone "brûlée", "incendiée", "dangereuse", "interdite", "fumée", "sèche", "gelée", "humide" ou autre. Strictement Remblais / Effondrement / Eau.

**Types de tracés / routes** (exhaustif — il n'en existe que 4) :
- **Principal** (rouge épais)
- **Secondaire** (orange moyen)
- **Chemin** (jaune fin)
- **Itinéraire** (cyan néon, calculé automatiquement — pas tracé à la main)

**Types de points / icônes built-in** (liste fermée) :
- Puits : `pa` (Aération), `pb` (Bouchon), `pc` (Communication), `pe` (Égout), `ps` (Spéléo)
- Accès : `peo`/`pef` (Puits Entrée Ouvert/Fermé), `eso`/`esf` (Entrée Souterraine Ouvert/Fermé), `cao`/`caf` (Carrière Accès Ouvert/Fermé)
- Signalétique : `salle` (house), `chatiere`, `passage`, `danger`, `info`, `elec`, `epure`
- Véhicule, tracker, etc.

→ L'utilisateur **peut créer des tags custom** via 🏗️ Générer un plan, mais en sortie de boîte, seuls les tags ci-dessus existent.

**Modes performance** (exhaustif — il n'en existe que 5) :
- **Off** — pas de tiling (risqué sur mobile pour grosses images)
- **Auto** — tile si l'image fait > 60 Mo
- **Qualité** — tile dès que nécessaire, params haute qualité
- **Équilibré** — défaut
- **Performance** — params agressifs pour mobile

**Formats de fichiers manipulés** (exhaustif) :
- Plans : `.zip` (archive de plan)
- Sessions : `.json` (export de session)
- Images : `.png` ou `.jpg` (image base + calques)
- Données : `.json` (puits, vehicule, editor, etc.)

**Aucune autre fonctionnalité, type, ou format que ce qui est listé ici ou décrit dans la doc ci-dessous ne fait partie de MyKTAMap.**

---

## 📌 Préambule

Ce fichier contient la documentation utilisateur officielle de MyKTAMap. Pour répondre aux questions de l'utilisateur :

1. Réponds **uniquement** à partir du contenu de ce document. Si l'info n'est pas présente, dis-le clairement ("non couvert par la documentation") plutôt que d'inventer.
2. Tu n'as **aucun accès** au code source, au site officiel, à l'app en cours d'exécution, ni aux données de l'utilisateur. Si on te demande "regarde le code/le site/mon plan", explique-le.
3. Cite les **icônes et libellés exacts** de l'app quand tu donnes des étapes (ex : *Clique sur ✏️ Édition de points*).
4. Pour les sujets hors MyKTAMap (météo, autre app), redirige poliment.

### 💬 Modèles de réponse à utiliser

**Quand l'utilisateur demande une fonctionnalité qui n'existe pas** :
> *"Non, MyKTAMap ne propose pas de [X]. Les seules [zones/types/modes] disponibles sont [liste exacte d'après la doc]. Si tu veux suggérer cette fonctionnalité, contacte l'auteur via le site officiel."*

**Quand tu n'es pas sûr** :
> *"Je ne trouve pas d'information claire à ce sujet dans la documentation fournie. Pour confirmation, vérifie directement dans l'app ou contacte l'auteur."*

**Quand on te demande d'accéder à une source externe** :
> *"Je n'ai accès qu'à la documentation utilisateur fournie ici. Je ne peux ni lire le code source (non distribué publiquement), ni naviguer sur le site, ni voir ton app."*

---

# 📖 Documentation utilisateur officielle

{{README_USER}}

---

# 📚 Glossaire des termes

| Terme | Définition |
|---|---|
| **Plan** | Carte d'un site souterrain ou industriel, basée sur une image (PNG/JPEG) + données associées (points, routes, zones). |
| **Calque** | Couche d'éléments superposable sur le plan : image (légende, collision) ou données (puits, points custom, etc.). Activable/désactivable via le contrôle Layers de Leaflet. |
| **Mes annotations** | Calque spécial qui regroupe tout ce que l'utilisateur a ajouté pendant sa session : points éditeur, tracés (routes), zones. |
| **Session** | Ensemble des modifications faites par l'utilisateur sur un plan donné (points ajoutés, tracés, zones, mesures). Auto-sauvegardée localement. |
| **Tracker (PDR)** | Module expérimental qui estime la position de l'utilisateur via les capteurs inertiels du téléphone (accéléromètre + gyroscope), sans GPS. PDR = Pedestrian Dead Reckoning. |
| **Recalage** | Action de remettre manuellement le tracker à une position connue sur le plan (clic sur un point repère) pour corriger la dérive. |
| **Itinéraire** | Trajet calculé automatiquement entre 2+ waypoints en suivant le réseau de routes existant sur le plan (algorithme Dijkstra). |
| **Waypoint** | Point de passage de l'itinéraire (début, étapes intermédiaires, fin). |
| **Puits** | Accès vertical (échelle, échelons) entre 2 niveaux. Souvent classés Aération (PA) / Communication (PC) / Bouchon (PB) / Égout (PE) / Spéléo (PS). |
| **Cataphile** | Personne qui explore les anciennes carrières souterraines de Paris (et par extension, tout site souterrain abandonné). |
| **Mode performance / preset** | Réglage qui contrôle la quantité de mémoire et de calcul utilisée pour afficher le plan. 5 niveaux : Off / Auto / Qualité / Équilibré / Performance. |
| **Tiling** | Découpage de l'image principale en tuiles plus petites pour éviter de charger une seule grosse image en mémoire (évite les crashes sur mobile). |
| **ZIP de plan** | Archive contenant toutes les données d'un plan (images + JSON + config). Format de partage entre utilisateurs. |
| **Loader** | Écran d'accueil de l'app (avant chargement d'un plan). Affiche la liste des plans connus + options de chargement. |
| **Service Worker** | Mécanisme PWA qui met les fichiers de l'app en cache pour fonctionnement hors connexion. |

---

# 🍳 Recettes — workflows fréquents pas-à-pas

### A. Première utilisation sur mobile

1. Ouvre https://myktamap.is-underground.fr dans Safari (iOS) ou Chrome (Android).
2. Ajoute l'app à l'écran d'accueil (iOS : bouton Partager → "Sur l'écran d'accueil" / Android : menu ⋮ → "Installer l'application").
3. Relance depuis l'icône installée — l'app devient autonome (PWA, fonctionne hors connexion une fois les assets cachés).
4. Au premier lancement, le loader propose les plans de démo (test1 / test2). Clique l'un d'eux → ✅ Charger.

### B. Charger ton propre plan (depuis un ZIP)

1. Dans le loader, trouve la zone "Glisse ton archive ZIP ici" (ou clique pour parcourir).
2. Sélectionne ton fichier `.zip`.
3. (Optionnel) Choisis un preset de performance dans le segmented control (Auto par défaut).
4. ✅ Charger.
5. Le plan apparaît. Sa fiche est désormais dans le registre — la prochaine fois, clique-la directement.

### C. Ajouter un point sur la carte

1. Dans la barre latérale, ouvre le groupe **✏️ Édition de points**.
2. Active le mode (bouton devient vert ✓).
3. Clique sur la carte à l'endroit voulu — une modale s'ouvre.
4. Saisis le nom, choisis un type (puits, info, salle…) et éventuellement une description.
5. ✅ Ajouter.
6. Le point est sauvegardé automatiquement dans la session (auto-save toutes les 1.5s).

### D. Tracer une route

1. Ouvre le groupe **🛣️ Tracés / Routes**.
2. Choisis le type : Principal (rouge épais) / Secondaire (orange moyen) / Chemin (jaune fin).
3. Clique successivement sur la carte pour poser les points de la polyline.
4. Bouton **✓ Valider** dans le floater pour sauvegarder le tracé.
5. Bouton **❌ Annuler** pour repartir de zéro avant validation.

### E. Calculer un itinéraire entre 2 points

1. **Pré-requis** : il faut un réseau de routes (Principal/Secondaire/Chemin) reliant les 2 points, soit dans ta session, soit dans les calques de données du plan.
2. Ouvre le groupe **🧭 Tracker** → **🗺️ Calculer un itinéraire**.
3. Ajoute des waypoints :
   - Soit en tapant un nom dans la barre de recherche (autocomplete des points existants).
   - Soit en cliquant directement sur la carte (mode clic activé via toggle).
4. Quand tu as ≥ 2 waypoints, clique **🎯 Calculer**.
5. Le trajet apparaît en cyan néon. Distance + temps estimé + mode de vitesse actif sont affichés en bas à gauche.
6. **Vitesse de marche** : segmented control dans la modale, 4 presets :
   - 🍺 **Bourré** (2 km/h) — très lent, hésitant
   - 🐌 **Lente** (3 km/h) — prudente, étroitures
   - 🚶 **Normale** (5 km/h, défaut) — allure standard
   - 🏃 **Rapide** (7 km/h) — parcours connu
   Le mode est persisté entre sessions (localStorage `myktamap_iti_walking_preset`). Le label bottom-left affiche le mode actif avec son icône à côté de la distance et du temps.
7. Pour modifier : utilise les boutons 🔄 Recalculer ou ❌ Effacer.

### F. Sauvegarder et partager une session

1. Ouvre le groupe **💾 Sauvegarde session**.
2. Clique **💾 Enregistrer la session** (mode Full / Avancé selon besoin).
3. Un fichier `.json` est téléchargé.
4. Envoie-le à ton interlocuteur (mail, cloud, USB).
5. Côté destinataire : ouvrir le même plan → **📥 Importer une session** → sélectionner le `.json`.

### G. Créer un plan from scratch

1. Loader → ⚙️ Plus d'options → **🏗️ Générer un plan**.
2. Choisis "📄 Nouveau plan".
3. Upload une image (PNG ou JPEG, idéalement ≤ 8000 px de côté).
4. Définis l'échelle (combien de mètres font N pixels — clique 2 points distants sur l'image).
5. Configure les calques, les icônes par défaut, etc.
6. **📦 Générer le ZIP** — l'archive est téléchargée.
7. Recharge le ZIP via le loader pour utiliser le plan.

### H. Optimiser un plan qui plante sur mobile

1. Identifie ce qui pèse : taille image base, nombre de calques, nombre de routes, nombre de points.
2. Solutions par ordre d'impact :
   - **Réduis l'image base** (≤ 8000 px, JPEG qualité 85 au lieu de PNG).
   - **Diminue le nombre de calques image** (fusionne légendes + collision dans l'image base si possible).
   - **Intègre les routes dans l'image** si tu as > 200 tracés (deviennent statiques, plus interactives mais ne consomment plus de mémoire vive).
   - **Choisis le preset ⚡ Performance** au chargement.
3. Regénère le ZIP via 🏗️ Modifier existant.

### J. ⛑️ Mode urgence — Je suis perdu (estimer une position en cataphilie)

> Mots-clés : "je suis perdu", "mode urgence", "estimer ma position", "perdu dans la cata", "zone de recherche", "où je peux être", "rayon de recherche probable", "secours", "alerte", "localisation approximative".

**Cas d'usage** : tu es sorti(e) sans tracker actif ou il a dérivé, tu sais où tu étais il y a X minutes, et tu veux estimer où tu peux être maintenant. L'app calcule un cercle de probabilité et croise avec les indices visuels que tu observes autour de toi.

1. Sidebar → **🧭 Tracker** → **⛑️ Je suis perdu — Mode urgence** (bouton orange distinctif).
2. La modale s'ouvre. Renseigne :
   - **📍 Dernière position connue** (3 méthodes au choix) :
     - Recherche autocomplete d'un point existant (rapide si tu te souviens d'un nom : "PA1", "salle X").
     - **📍 Clic carte** → la modale se met en retrait, tu cliques sur la carte.
     - **🧭 Position tracker** → utilise la position du tracker si il est actif.
   - **⏱️ Temps écoulé** depuis cette position (slider 1-480 min, défaut 30 min).
   - **🏃 Vitesse de marche présumée** — segmented control 4 presets, **mêmes valeurs que le mode itinéraire** (cohérence UX entre les deux modules). Rayon final = `vitesse × temps`, pas de marge de sécurité. Choix persisté en localStorage (`myktamap_lost_preset`).
     - 🍺 **Bourré** : 2 km/h — très lent, confus, désorienté
     - 🐌 **Lente** : 3 km/h — prudente, étroitures, exploration
     - 🚶 **Normale** *(défaut)* : 5 km/h — allure standard de marche
     - 🏃 **Rapide** : 7 km/h — parcours connu, marche soutenue
   - **Temps écoulé** : slider de 1 à 90 min (1h30 max). Au-delà, la zone devient non pertinente.
   - **🔮 Indices visuels** (optionnel mais TRÈS utile) : texte libre, exemples *"bidon eau, épure bélier, puits cassé"*. L'app cherche ces mots dans le nom, la description et les tags de tous les points du plan.
3. Clique **🎯 Calculer la zone**.
4. Résultats affichés sur la carte :
   - **Cercle orange pulsant** : zone de recherche (rayon = vitesse × temps × incertitude).
   - **Marker vert pulsant 📍** : ta dernière position connue.
   - **Markers violets 🔮 pulsants** : indices qui matchent ET sont dans la zone.
   - **Markers gris ·** : indices qui matchent MAIS sont hors zone (exclus).
   - **Cercle violet intérieur** (si ≥ 1 match in-zone) : localisation probable affinée (barycentre des indices in-zone).
5. Actions disponibles dans les résultats :
   - **📋 Copier le rapport** : copie un texte structuré (plan, position, temps, indices, loc affinée, timestamp) — utile pour partager avec quelqu'un par SMS/radio.
   - **✅ Supprimer la zone et sauvegarder ma position supposée** : retire la zone de recherche ET crée un point éditeur permanent (icône ⚠️ danger) à la localisation probable. Le point devient exportable/convertible comme tout autre point.
   - **🔄 Recalculer** : modifie les paramètres et relance sans repartir de zéro.
   - **🗑️ Effacer la zone et fermer** : retire la zone et les markers de la carte sans sauvegarder de point.
   - **👁️ Fermer** (ou ✕ ou clic backdrop) : ferme juste la modale, garde la zone visible sur la carte pour explorer.

**⚠️ Limitations à connaître** (l'app le rappelle dans le rapport) :
- L'estimation est purement géométrique (cercle isotrope). Elle **ne suit pas le réseau de routes**.
- Le tracker reste **expérimental** et dérive — la position tracker comme "dernière position connue" peut elle-même être imprécise.
- **Cette fonction ne remplace PAS une opération de secours réelle** (fil d'Ariane, boussole, lampe de rechange, carte papier).
- L'app fonctionne en local — aucune communication avec des secours externes n'est faite automatiquement. Le rapport copié est à toi de l'envoyer (SMS, radio cataphile, etc.).

**📚 Bonnes pratiques intégrées dans la modale** — accordion dépliable en haut de la modale ⛑️, 6 sections de conseils pratiques cataphiles. À recommander à l'utilisateur en situation d'urgence :

1. **🧘 Garde ton calme** : Stop. Inspire. La panique fait perdre les repères et gaspille lumière + énergie. Mange/bois un peu si possible.
2. **🗺️ Orientation** : Reviens sur tes pas (plus fiable que de chercher à atteindre une destination). Cherche les axes principaux (roulages, galeries droites, voies ferrées). Utilise une boussole physique (pas celle du téléphone, faussée). Écoute les bruits (circulation, métro, eau).
3. **🔦 Lumière & ressources** : Mode économie immédiatement. Garde une lampe de secours. Hydrate-toi mais économise.
4. **📡 Communication** : Si tu captes du réseau (puits / regards) → préviens quelqu'un en surface AVANT que la batterie meure. Le bouton 📋 Copier le rapport prépare un message tout fait.
5. **📍 Si tu décides d'attendre** : Pose-toi à un endroit identifiable (puits numéroté, salle nommée). Reste où tu es si personne ne sait que tu es là. Marque ton emplacement.
6. **⚠️ À ne pas faire** : Ne suis pas l'eau (diaclases dangereuses). Ne tente pas un passage inconnu juste parce qu'il "monte". Ne te fie pas au tracker téléphone (il dérive sous stress).

### I. Intégrer définitivement ta session dans le ZIP du plan (annotations permanentes)

> Mots-clés associés à cette recette (pour les recherches IA) : "importer la session dans le ZIP", "rendre les annotations permanentes", "session définitive", "figer mes points / tracés / zones dans le plan", "convertir session en data", "intégrer mes annotations au plan", "session → calque de données", "comment importer ma session en définitif", "graver dans le plan".

**Cas d'usage** : tu as ajouté des points, tracés et zones pendant ta session, et tu veux qu'ils fassent **définitivement** partie du ZIP du plan (visibles pour quiconque chargera ce ZIP, sans avoir à importer une session séparée).

**⚠️ Il n'existe PAS de bouton "importer une session dans le ZIP" direct.** Le workflow se fait en 2 étapes :

1. **Convertir** la session en calques de données :
   - Ouvre le groupe **💾 Sauvegarde session** → bouton **💾 Enregistrer la session**.
   - Dans la modale, choisis l'onglet **🔄 Conversion** (3ème onglet, après Full et Avancé).
   - Coche ce que tu veux figer : Points / Tracés / Zones (avec filtrage par tag pour les points).
   - Choisis la **granularité** : Basique (1 fichier par catégorie) ou Fine (1 fichier par type).
   - Télécharge le ou les fichiers `.json` générés (ex : `points.json`, `roads.json`, `zones_eau.json`, etc.).

2. **Intégrer** ces JSON dans le ZIP du plan :
   - Loader → ⚙️ Plus d'options → **🏗️ Générer un plan** → **📂 Modifier existant**.
   - Importe le ZIP actuel du plan.
   - Ajoute les fichiers `.json` issus de la conversion comme **calques de données** (data layers).
   - Clique **📦 Générer le ZIP** — le nouveau ZIP contient maintenant tes annotations comme données figées.

**⚠️ Effet de bord** : une fois converties, ces données deviennent **non modifiables depuis l'app** (elles font partie du plan, pas de la session). Pour les modifier, il faudra refaire un cycle Conversion → Modifier existant.

**Différence avec 📥 Importer une session** : cette dernière fonction (groupe ⬇️ Charger / Import) charge un `.json` de session **temporairement** dans la session active — les données restent modifiables et liées à la session, pas au plan. Pour du définitif, il faut la Conversion.

---

# ❓ FAQ — questions et solutions

### Le tracker dérive énormément après quelques pas

Le tracker PDR est **expérimental**. La dérive est inévitable, mais peut être réduite :

- **Calibre l'échelle** dans ⚙️ Réglages → "Calibrer l'échelle" (clique 2 points dont tu connais la distance réelle).
- **Recale ta position régulièrement** : mode 📍 Recalage (clic sur un point connu) ou bouton 📍 Je suis ici depuis le popup d'un point.
- **Tiens le téléphone bien orienté** (écran face à toi, dans le sens de la marche).
- **Évite de remettre le téléphone en poche** pendant le tracking.

### Mon plan crash au chargement / au dézoom

Saturation mémoire — typique des gros plans sur mobile. Solutions par ordre d'impact :

1. **Choisis le preset ⚡ Performance** dans le loader avant de charger.
2. **Active le 🚀 Mode Performance ULTRA** : ouvre ⚙️ Réglages → section "🚀 Mode Performance ULTRA" → coche le toggle **🚀 ULTRA**. Il active 6 optimisations agressives qui ne touchent pas l'image mais réduisent drastiquement la charge des tracés/markers/intersections :
   - 🪜 Décimer les tracés au dézoom
   - ⚡ Désactiver animations zoom/pan (reload requis)
   - 🎯 Désactiver cercles intersections (seuil 50 routes vs 200)
   - 🚫 Désactiver popups sur calques de données
   - 🐢 Auto-save lent (30s)
   - 👁️ Ne rendre que les tracés visibles (viewport culling)
   Tu peux aussi activer ces toggles individuellement si tu veux affiner.
3. Si l'app a déjà crashé, l'OOMGuard affiche une modale d'avertissement au prochain reload.
4. Active 🐛 Logs détaillés (loader → Plus d'options) puis recharge → consulte la modale 🐛 pour voir où ça plante.
5. À terme : optimise le plan (voir recette H ci-dessus).

### J'ai perdu ma session quand j'ai fermé l'app

L'auto-sauvegarde (1.5s) couvre normalement ce cas. Si tu ne la retrouves pas :

- Vérifie que tu rouvres bien le **même plan** (même nom + version exacte).
- La session n'est PAS partagée entre plans différents.
- Si tu as changé de plan entre-temps, la session de l'ancien plan est purgée.
- Pour plus de sécurité long-terme : exporte ta session régulièrement via 💾 Enregistrer la session (fichier .json).

### Le module Itinéraire dit "aucun chemin trouvé"

Le pathfinder a besoin d'un **réseau de routes connectées** :

- Vérifie qu'il y a des tracés (Principal/Secondaire/Chemin) entre tes waypoints.
- Les routes peuvent être dans la session OU dans les calques de données du plan (visibles ou masquées — toutes sont prises en compte).
- L'app connecte automatiquement les routes qui se croisent visuellement (tolérance 15 px). Si rien ne se touche, il faut tracer une route de raccordement.

### J'ai vu une modale rouge au démarrage avec "🚨 ALERTE", c'est quoi ?

C'est le système d'**alertes publiques** de MyKTAMap. L'auteur peut diffuser des messages d'alerte à toute la communauté en cas de situation à risque (incendie en cataphilie, fermeture d'accès, gaz toxiques, etc.) en éditant le fichier `alert.json` côté serveur.

**3 niveaux** :
- **🚨 emergency** : rouge pulsant, situation critique (gaz, incendie, accident)
- **⚠️ warning** : orange, info importante (perturbation, événement)
- **ℹ️ info** : bleu, annonce neutre

Lis attentivement le message + la liste de consignes, puis clique **"J'ai compris"** pour acquitter. La modale ne réapparaîtra plus tant que l'alerte est la même.

Si tu veux re-consulter l'alerte plus tard, clique le bouton **🚨** dans le header du loader (à gauche du 📖). Il te montrera l'état actuel — soit l'alerte rouge si toujours active, soit une modale verte **"✅ Aucune alerte en cours"** si la situation est revenue à la normale.

### Je veux vérifier s'il y a encore une alerte active

Clique le bouton **🚨** dans le header du loader (à gauche du 📖 Documentation). Trois réponses possibles :
- Modale rouge "🚨 ALERTE" → alerte toujours active, lis les consignes
- Modale verte "✅ Aucune alerte en cours" → situation revenue à la normale
- Modale "📡 Vérification impossible" → tu es hors ligne, réessaie avec du réseau

### Je suis perdu dans la cata, comment l'app peut m'aider ?

**MyKTAMap propose un mode urgence** ⛑️ qui estime ta position probable à partir de :
- Ta dernière position connue (point sur le plan)
- Le temps écoulé depuis (en minutes)
- Optionnellement : des indices visuels que tu observes ("bidon eau", "épure bélier", etc.)

**Accès** : sidebar → **🧭 Tracker** → **⛑️ Je suis perdu — Mode urgence** (bouton orange).

L'app calcule un cercle de recherche (rayon = vitesse moyenne × temps × facteur d'incertitude) et cherche tes indices dans les points du plan. Les indices qui matchent ET tombent dans le cercle sont mis en évidence en violet pulsant, et leur barycentre te donne une "localisation probable affinée".

**Tu peux copier un rapport texte** structuré (📋) pour le partager avec quelqu'un en surface (SMS, radio).

**⚠️ Important** :
- C'est une estimation géométrique, pas une localisation GPS. Précision ≈ rayon du cercle.
- Ça ne remplace **pas** une opération de secours réelle. Fil d'Ariane, boussole, carte papier et lampe de rechange restent obligatoires.
- Aucune communication automatique avec les secours — c'est à toi d'envoyer le rapport.

Voir la **recette J** dans la section "🍳 Recettes" pour la procédure détaillée.

### Je n'arrive pas à importer ma session définitivement dans le ZIP / Comment rendre mes annotations permanentes ?

**Il n'y a pas de bouton direct** pour importer une session dans le ZIP — c'est volontaire. Le workflow correct est en **2 étapes** :

1. **🔄 Convertir** ta session en data layers :
   - Groupe **💾 Sauvegarde session** → **💾 Enregistrer la session** → onglet **🔄 Conversion** (3ème onglet).
   - Coche Points / Tracés / Zones à figer → télécharge les fichiers `.json` générés.

2. **🏗️ Modifier existant** pour intégrer ces JSON dans le ZIP :
   - Loader → ⚙️ Plus d'options → 🏗️ Générer un plan → **📂 Modifier existant**.
   - Importe ton ZIP actuel → ajoute les `.json` de l'étape 1 comme data layers → **📦 Générer le ZIP**.

**Ne confonds pas** :
- **📥 Importer une session** (groupe ⬇️ Charger / Import) → charge **temporairement** dans la session (modifiable, lié à la session).
- **🔄 Conversion + 🏗️ Modifier existant** → fige **définitivement** dans le ZIP (non modifiable depuis l'app après).

Voir aussi la **recette I** dans la section "🍳 Recettes" pour la procédure détaillée.

### Comment partager un plan avec un ami ?

1. Loader → ⚙️ Plus d'options → 🏗️ Générer un plan → "Modifier existant" → sélectionne ton plan.
2. Si rien à modifier, clique directement **📦 Générer le ZIP**.
3. Envoie le `.zip`.
4. L'ami le charge via la zone drop du loader.

### Comment ajouter un nouveau type d'icône (ex: "fontaine") ?

Via 🏗️ Générer un plan → "Modifier existant" → onglet Icônes → ajoute un tag custom (nom + image PNG 50×50 transparent) → regénère.

### L'app me dit "⚠️ ARRÊT BRUTAL DÉTECTÉ" au démarrage

L'OOMGuard a détecté que la session précédente a été tuée par le système (OOM — out of memory).

- C'est normal sur mobile avec un gros plan.
- Pour éviter la prochaine fois : baisse le preset performance, réduis l'image base, ferme les autres apps.

### Je veux utiliser MyKTAMap commercialement (entreprise, prestation payante)

L'usage commercial est **interdit par défaut** (licence CC BY-NC-SA 4.0). Une licence commerciale séparée est nécessaire. Contacte l'auteur via le site officiel pour discuter.

### Je voudrais contribuer au projet (code, traduction, retour terrain)

La collaboration est **ouverte sur demande**. Contacte l'auteur via le site officiel en décrivant ce que tu veux apporter — chaque contribution nécessite un accord écrit préalable (cohérence du projet, respect de la licence).

### Puis-je consulter le code source ?

Le code source n'est **pas distribué publiquement**. Il n'existe pas de dépôt Git ouvert. Pour toute question technique précise, l'auteur reste joignable via le site officiel.

---

**Fin du document.** Les questions au-delà de ce périmètre ne sont pas couvertes — l'assistant IA doit explicitement le signaler plutôt que d'inventer.
