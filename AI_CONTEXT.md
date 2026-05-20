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
- 🧭 **Tracker PDR** (expérimental) : tracking inertiel mobile, mode 📍 Recalage. **Icône directionnelle (depuis v158-v161)** : pendant le tracking actif, l'icône (cône GPS bleu) tourne en temps réel pour pointer dans la direction de marche, calculée depuis le heading du téléphone (même source que la boussole 🧭). Au repos (tracking off) ou après recalage sans démarrer le tracking, l'icône pointe Nord (pose neutre). Smoothing exponentiel + throttle 2° + transition CSS 0.3s pour absorber le jitter du magnétomètre.
- 🗺️ **Itinéraire** : pathfinder Dijkstra entre 2+ waypoints, label distance + temps estimé en bas-gauche. **Depuis v169 (Karma_dev)** : 2 nouvelles contraintes possibles :
  - ⛔ **Zones inaccessibles** (DUR) : tout segment de route traversant une zone polygonale de type `inaccessible` est exclu du graphe — l'itinéraire passe forcément à côté. Jamais relâché.
  - 🚫 **Préférences d'évitement** (SOUPLE) : configurées dans la modale itinéraire (section repliable "🚫 Préférences d'évitement"). On peut éviter des **points précis** (par recherche / ID) ou des **tags entiers** (ex: tous les `pa` / Puits Aération). Marge configurable (défaut 100px). **Fallback 2 passes** : si pas de chemin en évitant, l'app tente sans les évitements et affiche un message orange "⚠️ Impossible d'éviter : X, Y" pour informer l'user. Persisté par plan via localStorage.
- ⛑️ **Mode urgence "Je suis perdu"** (sous-action du groupe 🧭 Tracker) : estime une zone de recherche à partir de dernière position + temps écoulé + indices visuels texte ; affiche cercle orange, markers violets pour les indices in-zone ; bloc dépliable "📚 Bonnes pratiques" ; rapport copiable
- 📐 **Mesure de distance simple** (clic-clic, label bas-gauche)
- 📏 **Distance totale des tracés** (filtre par type, highlight magenta)
- ✏️ **Édition de points** (ajout, modification, suppression via popup)
- 🛣️ **Tracés / Roads** : Principal / Secondaire / Chemin / Itinéraire
- ⬛ **Zones** : Remblais / Effondrement / Eau
- 💾 **Sauvegarde session** : Full / Avancé / Conversion (session → data layer)
- 🖼️ **Export PNG** : Mode rapide / Mode avancé (avec légende, calques au choix, résolution)
- 🌍 **Export KMZ géolocalisé** (depuis v170) : nouvel onglet dans 💾 Export Session. Calibrage par **2 points** (saisie x/y plan + lat/lng GPS pour chacun, via recherche / clic carte / saisie manuelle). L'app calcule une transformation affine 2D (rotation + scale + translation) et génère un fichier `.kmz` ouvrable dans Google Earth, OsmAnd, Locus, Avenza... Image plan en transparence configurable (slider 0-100%, défaut 60%). Granularité fine du contenu : sous-cases parent/enfants par tag de point, type de tracé, type de zone (pattern identique à l'Export PNG Avancé). Inclut session + embedded data layers. Calibrage persisté par plan (localStorage). Compatible multi-niveau (1 Folder KML par niveau).
- 🎚️ **Refonte UX loader** (depuis v172) : la liste 📚 Mes plans a été simplifiée et enrichie :
  - **Toggle "🌐 Afficher les plans serveur"** persisté par localStorage — l'user peut cacher les plans serveur découverts auto (test1, test2, démos…) pour ne voir que ses plans persos. Recocher = ils réapparaissent intacts (filtre d'affichage seulement, pas de suppression).
  - **Badges modes V1/V2/M-LVL + storage (✅/🔐/📁) sur ligne 2** (sous le nom). Avant : sur la même ligne que le nom → noms longs tronqués prématurément. Maintenant : nom prend toute la largeur, badges groupés en bas pour scan visuel rapide.
  - **Bouton ℹ️ Infos détaillées** par plan : nouvelle modale qui liste TOUS les attributs (id, nom, version, auteur, type, fichier source, taille, persistance, mode, perfPreset, dates) sous forme de tableau 2 colonnes. Remplace l'affichage compact sub/date qui surchargeait la liste.
  - **"💾 Mémoriser ce plan dans l'app" coché par défaut** sur mobile/Safari/Firefox (avant : décoché par défaut → l'user oubliait souvent → re-sélection requise à chaque chargement).
- 📐 **Réglages responsive PC** (depuis v172) : la modale ⚙️ Réglages passe en layout 2 colonnes sur ≥1024px (pattern identique à la modale Doc/Aide). Sur mobile : strictement inchangée (1 colonne 440px).
- 🗝️ **Accès restreint communautaire** (depuis v173) : barrière au démarrage, l'app demande un mot de passe unique commun à tous les users autorisés. Vérifié 1 fois à la 1ère installation, mémorisé en localStorage ensuite. Re-demandé après reset complet (le mdp est alors affiché dans la modale Reset pour ne pas perdre l'accès). 5 tentatives ratées → lockout permanent jusqu'à désinstallation manuelle de l'app. Barrière SOCIALE / communautaire — ne remplace PAS une vraie auth (le code source HTML/JS est public).
- 🛣️ **Mode urgence "Je suis perdu" enrichi** (depuis v173) : en plus du cercle de zone théorique, l'app affiche désormais en rouge clair tous les segments de routes physiquement atteignables depuis la dernière position connue, dans la limite du rayon (= vitesse × temps). Algorithme isochrone Dijkstra "budget". Multi-niveau via jonctions interniveau. Cas dégénérés gérés explicitement (no-roads / snap-too-far / empty-graph). Bonus rapport copiable enrichi "🛣️ Portée max sur le réseau : ~X m parcourable (N segments)".
- 🛡️ **PerfUltra "Limiter dézoom mobile"** (depuis v173) : 7ème toggle dans le mode Performance ULTRA. Coché par défaut = comportement v172 (limite anti-OOM). Décoché = traite le mobile comme un PC dans le calcul minZoom (gagne 1-2 niveaux de dézoom selon taille du plan). Reload requis. Premier toggle PerfUltra avec default true.
- 📐 **Icônes adaptatives au zoom** (depuis v1.7.1) : les icônes des points (puits, accès, signalétique, etc.) gardent une taille relative au plan constante au lieu de la taille écran fixe Leaflet par défaut. Au dézoom, elles rétrécissent ; au zoom in, elles grossissent. Clamp 0.25 → 2× pour éviter les extrêmes (invisible ou énorme). Toggle dans ⚙️ Réglages → 🔍 Affichage (default ON, reload requis pour changement).
- 🔍 **Double-clic sur un marker → zoom flyTo** (depuis v1.7.1) : un seul clic ouvre le popup (inchangé), un double-clic rapide (< 500ms) fait un flyTo smooth (0.6s) sur le point au zoom +2 clampé. Le popup éventuel est fermé pendant le flyTo. Ne s'applique pas au tracker ni au mode urgence (comportements spécifiques préservés).
- 🔢 **Nouveau format de version semver-like** (depuis v1.7.1) : passage de vNNN (v173) à vX.Y.Z (v1.7.1). X = MAJOR (1 actuel, 2 quand backend), Y = MINOR (évolutions majeures), Z = PATCH (debug/UX). Mapping rétroactif des MINOR dans le README.md journal.
- 🔒 **Privacy & Audit** (depuis v1.8.0) : module de transparence + vérifiabilité construit pour répondre à la méfiance légitime du milieu cataphile. MyKTAMap est 100% client-side (aucun backend, aucune DB serveur, aucun analytics, aucun cookie de tracking) — ce module rend cette promesse **vérifiable par l'utilisateur lui-même**. Section **🔒 Confidentialité & Audit** dans la modale ⚙️ Configuration du loader avec : (1) **📋 Voir le journal réseau** = tableau live de toutes les requêtes fetch/XHR/sendBeacon/WebSocket/EventSource émises par l'app, exportable en JSON ; (2) **📖 Que fait l'app sur le réseau ?** = doc inline avec liste blanche commentée + lien vers `docs/NETWORK_AUDIT.md` ; (3) **🔒 Mode hors-ligne strict** = toggle opt-in qui bloque ACTIVEMENT toute requête non-whitelistée (l'app reste 100% fonctionnelle ; badge orange dans le footer du loader quand actif). Whitelist hardcodée à 2 entrées : (a) same-origin = l'app elle-même, (b) `gstatic.com/generate_204` = ping connectivité no-cors aucune donnée envoyée. **Aucun POST/PUT/PATCH/DELETE/sendBeacon/WebSocket/EventSource n'est jamais émis par l'app.** Double protection via CSP Nginx stricte (`connect-src 'self' https://www.gstatic.com`) qui demande au navigateur lui-même de refuser toute connexion non-whitelistée.
- 🎨 **Refonte UX page d'accueil** (depuis v1.7.3) :
  - **Nouveau titre stylisé** : `📦 MyKTAMap` (basique) remplacé par un lockup graphique avec logo `mkm-full.png` (rose des vents jaune, drop-shadow halo) + "MyKTAMap" en grand + tagline "Cartographie souterraine" (remplace "Cartographie terrain" partout). Hover pulse, responsive vertical mobile / horizontal ≥1024px.
  - **Bouton ⚙️ Configuration** dans le header du loader (à côté de 📖 Documentation et 🚨 Alertes) qui ouvre une **modale unique** regroupant tout ce qui était éparpillé : Tiling, ULTRA, toggle 🐛 Logs détaillés + bouton **📋 Afficher les logs** *(nouveau)*, 🔄 **Force update douce** *(nouveau)*, 💥 Tout réinitialiser. Symétriquement, le bouton 🗑️ Réinitialiser est retiré de la modale ⚙️ Réglages in-app (map mode) — le reset complet n'est désormais accessible que depuis la modale ⚙️ Configuration du loader.
  - **🔄 Force update douce** : re-télécharge la dernière version du code (purge cache PWA) mais **garde tes données** (plans, sessions, localStorage, unlock gate). Différent de `💥 Tout réinitialiser` qui purge tout.
  - **🏗️ Générer un plan** reste directement visible dans la home (action de création, pas un réglage).
  - **📥 Conf exemple** déplacé en icône dans le modal du Générateur (section "Charger un ZIP existant"). Plus logique : c'est un outil du générateur.
  - **Section "⚙️ Plus d'options"** supprimée.
  - **Footer copyright épuré** : `© 2026 Flavien VIDAL [signature karma.png]` → `© 2026 [signature karma.png]`. Seule la mention texte "Flavien VIDAL" est retirée ; l'image signature `karma.png` est conservée comme identité visible du copyright. Le nom civil reste présent dans les headers JS et meta tags (valeur légale préservée).
  - **Retrait du toggle M-LVL du menu ⚙️ Réglages** : le multi-niveau s'active désormais **uniquement** via le générateur ou par édition manuelle de `plan-config.json`. Cascade `PlanRegistry[id].multiLevel` reste lue pour rétro-compat des users qui avaient toggle avant v1.7.3.
- 🧭 **Boussole + tracker landscape OK** (depuis v172) : avant, en mode landscape (et portrait inversé), le widget boussole et la rotation de l'icône tracker indiquaient un Nord décalé de ±90° (ou 180°). Cause : DeviceOrientationEvent renvoie α/β/γ par rapport aux axes du device, pas par rapport à l'orientation visuelle de l'écran. Fix : variable `_screenAngle` (lue depuis `screen.orientation.angle` + fallback iOS `window.orientation`) ajoutée au heading brut. Recalage instantané quand l'user tourne son tel (event `orientationchange`). Couvre les 4 orientations (portrait, landscape-left, landscape-right, portrait inversé).
- 🎨 **Modales de re-sélection ZIP refondues** (depuis v172) : remplacement des `confirm()` natifs OS par 2 modales custom respectant la charte graphique :
  - **🚫 Nom différent** (rouge) : si l'user re-sélectionne un ZIP dont le `plan.name` ne correspond pas au plan ciblé → REFUS DÉFINITIF (1 seul bouton "J'ai compris"). Avant : "Charger quand même ?" qui créait des incohérences silencieuses. Pour vraiment charger ce ZIP : passer par 📦 Charger un nouveau plan.
  - **⚠️ Mode différent** (orange/warning) : si les flags `tiledV2`/`multiLevel` du ZIP diffèrent du registre → modale explicite avec carte par discordance (Avant → Maintenant). 2 boutons Annuler / Continuer.
- 🏗️ **Générateur de plan** : Nouveau plan / Modifier existant (ZIP)
- ⚙️ **Réglages** : calibrage échelle, debug, reset complet, etc.
- 🚀 **Mode Performance ULTRA** (dans ⚙️ Réglages) : 6 toggles d'optimisation agressifs pour gros plans / appareils faibles — décimation tracés, désactivation animations Leaflet, abaissement seuil intersections, skip popups data-layer, auto-save lent, viewport culling. Préset ULTRA bloc ou ajustement individuel. N'affecte PAS l'image (gérée par mode performance au chargement).
- 🤖 **Aide IA** : téléchargement de ce fichier de contexte
- 🔔 **Détection de mise à jour** : version.json + popup avec choix mise à jour douce / reset complet
- 🏷️ **Badge version cliquable** dans le footer du loader : affiche la version installée. Clignote en bleu si une nouvelle version est dispo (passage à la version cible visible : `v150 → v151`). Au clic, force la modale d'update (bypass snooze 24h). Si déjà à jour, affiche les notes de la version installée.
- 🚨 **Alertes publiques** : système de diffusion d'alertes (incendie, fermeture, gaz toxiques, migration domaine...) via fichier `alert.json` côté serveur. Modales colorées selon niveau (`emergency` rouge / `warning` orange / `info` bleu) affichées en cascade après le splash. **Multi-alertes supporté depuis v163** : plusieurs alertes peuvent être actives simultanément (chacune acquittable individuellement). Bouton 🚨 dans le header du loader pour re-consulter à tout moment, avec **coloration dynamique** selon le niveau max actif + pastille compteur si N > 1 alertes.
- 🌐 **Migration domaine vers myktamap.fr** (depuis v163) : annoncée pour le **15 juillet 2026**. L'annonce est diffusée via une alerte `info` permanente dans `alert.json` (cf système d'alertes publiques) — visible via le badge 🚨 bleu dans le loader, l'utilisateur consulte quand il veut. Les 2 domaines cohabitent pendant ~2 mois pour laisser le temps d'exporter sessions et plans manuellement. Cf recette M.
- 🏗️ **Générateur de plan** : auto-détection des dimensions de l'image principale + warnings si > 10000 px / > 30 Mo. Position initiale tracker auto-centrée (W/2 × H/2) au choix de l'image, avec bouton 🎯 Recentrer.
- 🧭 **Boussole / widget Nord** (depuis v147) : sous-action 🧭 dans le groupe Tracker → affiche une rose des vents flottante en haut-gauche sous le zoom. La rose tourne en temps réel pour pointer vers le vrai Nord. Clic dessus → modal plein écran avec la rose en grand + angle cardinal exact. Outil de debug pour valider que le heading du téléphone est cohérent.
- ⚠️ **Popup avertissement au démarrage du tracker** (depuis v147) : au premier ▶️ Play de chaque session, modal qui rappelle que le module est expérimental et ne doit pas servir à se localiser en situation réelle. iOS-safe (requestPermission appelé synchronement dans le click handler).
- 🏗️ **Mode multi-niveau** (depuis v148, déclaration via générateur depuis v1.7.3) : opt-in par plan pour les carrières multi-étages (Glacière, Capucins). **Activable uniquement via le générateur de plan** (case 🏗️ Plan multi-niveau au moment de la création/modification du plan) ou par édition manuelle de `plan-config.json` (`plan.multiLevel: true`). Le toggle ⚙️ Réglages pour activer/désactiver sur un plan déjà chargé a été retiré en v1.7.3 — passer obligatoirement par le générateur force une déclaration explicite et évite les états incohérents. Une fois activé : pastille jaune `[N]` (numéro du niveau actif) sous le zoom, modale avec 2 sections (niveau actif single + niveaux visibles multi-select). Nouveau type de tracé **🪜 Jonction interniveau** (magenta pointillé) qui sert de bridge unique entre 2 niveaux. Le pathfinder est niveau-aware : ne traverse plus les croisements visuels 2D entre niveaux différents (utilise uniquement les jonctions). Items session (roads, zones, points) tagués par niveau au moment de la création, filtré au rendu.
- 🧱 **Tiling V2** (depuis v149) : système de tuilage Google Maps-like pour réduire la conso mémoire au runtime sur gros plans (>50 Mo). Génération via le générateur de plan (case 🧱 Convertir en V2 tuile) — disponible en mode Nouveau OU Modifier dès qu'une image est uploadée (depuis v151). Runtime Option B : N L.imageOverlay par niveau de zoom, swap on zoomend (~16 MB max en RAM à tout moment). Auto-crop des marges blanches intégré. Modal d'avertissement avant la conversion (lourde — recommandé sur PC plutôt que mobile).
- 🏷️ **Badges de mode sur la liste de plans** (depuis v150) : chaque ligne plan dans le loader affiche un ou deux chips de mode — `V1` (gris classique), `M-LVL` (jaune multi-niveau), `V2` (violet tuilé). Plusieurs badges peuvent coexister (un V2 peut être aussi multi-niveau).
- 🌀 **Overlay de chargement plein écran** (depuis v152) : quand un plan se charge (extraction ZIP, indexation tuiles V2 toutes les 50 tuiles, init carte), une modale centrée avec spinner + message d'étape s'affiche au-dessus du splash. Avant v152, le statut était écrit en petit en bas du loader, peu visible sur gros plans.
- ❌ **Erreur explicite en cas d'échec de génération V2** (depuis v152) : modale rouge plein écran qui détaille la cause du crash (drawImage / toBlob / saturation mémoire) avec les coordonnées de la tuile en échec + conseils actionnables (PC vs mobile, réduire l'image source, convertir en JPEG q85). Plus jamais d'erreur silencieuse pendant la conversion V2.
- 🛡️ **Détection automatique des crashs durant la génération V2** (depuis v152) : un flag localStorage est posé avant la conversion et retiré dans le `finally`. Si le navigateur kill la page pendant la génération (OOM mobile typique), le flag reste → au prochain démarrage de l'app, modale spécifique **"🧱❌ Génération V2 interrompue"** avec rappel des solutions (PC, réduire image, fermer apps en arrière-plan).

**Types de zones** (exhaustif — il n'en existe que 4 depuis v169 / Karma_dev) :
- **Remblais** (gris foncé, ⬛)
- **Effondrement** (rouge, 🟥)
- **Eau** (bleu, 🟦)
- **Inaccessible** (hachures rouge sombre / noir 45°, ⛔) — *nouveau v169*. Zone BLOQUANTE pour le pathfinder : tout segment de route qui la traverse est retiré du graphe → l'itinéraire calculé ne passera jamais par cette zone. Multi-niveau : ne bloque que les segments du même niveau. Contrainte DURE — jamais relâchée même en fallback.

→ Il n'y a **PAS** de zone "brûlée", "incendiée", "dangereuse", "fumée", "sèche", "gelée", "humide" ou autre. Strictement Remblais / Effondrement / Eau / Inaccessible.

**Types de tracés / routes** (exhaustif — il n'en existe que 5, dont 1 conditionnel) :
- **Principal** (vert épais)
- **Secondaire** (violet moyen)
- **Chemin** (jaune fin)
- **Itinéraire** (cyan néon, calculé automatiquement — pas tracé à la main)
- **Jonction interniveau** (polyline magenta pointillée + ronds blanc/magenta aux 2 extrémités) — UNIQUEMENT disponible si le plan a le mode **multi-niveau** activé. Polyline multi-points (comme un tracé normal) qui sert de bridge unique entre 2 niveaux pour le pathfinder. Sémantique `fromLevel`/`toLevel` symétrique (pathfinder traverse dans les 2 sens). S'efface comme un tracé normal via 🧹.

**Types de points / icônes built-in** (liste fermée) :
- Puits : `pa` (Aération), `pb` (Bouchon), `pc` (Communication), `pe` (Égout), `ps` (Spéléo)
- Accès : `peo`/`pef` (Puits Entrée Ouvert/Fermé), `eso`/`esf` (Entrée Souterraine Ouvert/Fermé), `cao`/`caf` (Carrière Accès Ouvert/Fermé)
- Signalétique : `salle` (house), `chatiere`, `passage`, `danger`, `info`, `elec`, `epure`, `plaque` (panneau beige sur poteau — pour repérer les plaques IGC, panneaux directions cataphiles, etc., depuis v152)
- Véhicule, tracker, etc.

→ L'utilisateur **peut créer des tags custom** via 🏗️ Générer un plan, mais en sortie de boîte, seuls les tags ci-dessus existent.

**Modes performance** (exhaustif — il n'en existe que 5) :
- **Off** — pas de tiling (risqué sur mobile pour grosses images). Sur un plan V2, ce mode force le fallback à l'image source `baseImage` (V1-like) au lieu du runtime tuilé.
- **Auto** — tile si l'image fait > 60 Mo
- **Qualité** — tile dès que nécessaire, params haute qualité
- **Équilibré** — défaut
- **Performance** — params agressifs pour mobile

**Modes de plan** (3 modes orthogonaux, peuvent coexister) :
- **V1** (mode classique) — défaut. Image entière chargée en RAM. Modes performance et tiling preset au chargement. Badge `V1` gris.
- **Multi-niveau / M-LVL** — opt-in via `plan.multiLevel: true` dans `plan-config.json`. Tracés, zones, points et tracker tagués par niveau. Pastille `[N]` sous le zoom + filtre visibles + jonctions interniveau. Badge `M-LVL` jaune.
- **V2 tuilé** — opt-in via `plan.tiledV2: true` + section `tiling` dans `plan-config.json`. Image découpée en tuiles 512×512 sur 4 niveaux de zoom (Google Maps-like). Runtime swap on zoomend. Badge `V2` violet.

**Formats de fichiers manipulés** (exhaustif) :
- Plans : `.zip` (archive de plan)
- Sessions : `.json` (export de session)
- Images : `.png` ou `.jpg` (image base + calques)
- Données : `.json` (puits, vehicule, editor, etc.)
- **Export terrain géoréférencé** : `.kmz` (depuis v170, Google Earth / OsmAnd / Locus / Avenza)

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
| **V1 (plan classique)** | Plan où l'image principale est chargée intégralement en RAM au boot. Modes performance preset déterminent un éventuel tuilage runtime. Défaut historique. |
| **V2 (plan tuilé)** | Plan où l'image est pré-découpée en tuiles 512×512 sur 4 niveaux de zoom dans le ZIP (`data/tiles/z<N>/x<col>_y<-k>.jpg`). Au runtime, seules les tuiles du niveau de zoom courant sont en RAM (~16 MB max). Opt-in via le générateur de plan (case 🧱). |
| **Mode multi-niveau / M-LVL** | Opt-in par plan pour gérer les carrières multi-étages. Tracés/zones/points/tracker/**image layers (depuis v162)** tagués par niveau, filtre runtime. Jonctions interniveau (🪜) = seuls bridges entre niveaux pour le pathfinder. **Niveaux supportés (depuis v154)** : entiers positifs ET négatifs autour de 0. Défaut `[-2, -1, 0, 1, 2]` (sous-sols typiques + RDC + étages supérieurs). Auto-extension au chargement si les data layers ou image layers contiennent des niveaux hors range. **Tri Z visuel (depuis v169)** : une galerie au niveau N apparaît toujours AU-DESSUS d'une galerie au niveau N-1 (cohérence physique). Au sein du même niveau : chemin (en arrière) < secondaire < principal < jonction. Itinéraire et zones inaccessibles toujours au-dessus de tout. Le générateur (📦 Créer un plan) expose un champ "🏗️ Niveau" à côté de chaque calque image, visible uniquement quand `🏗️ Plan multi-niveau` est cochée. |
| **Jonction interniveau** | Tracé spécial (type `jonction`, magenta pointillé) qui relie 2 niveaux d'un plan multi-niveau. Le pathfinder s'en sert exclusivement pour passer d'un niveau à l'autre — les croisements visuels 2D entre niveaux différents ne comptent pas. Sémantique `fromLevel`/`toLevel` symétrique (traverse dans les 2 sens). |
| **Niveau actif** | Niveau courant utilisé pour DESSINER les nouveaux tracés/zones/points dans un plan multi-niveau. Affiché dans la pastille jaune `[N]` sous le zoom Leaflet (peut être négatif : `-1`, `-2`, etc.). Click → modale de changement. |
| **Niveaux visibles** | Liste des niveaux affichés sur la carte (filtre runtime, multi-select). Les éléments dont le `level` n'est pas dans cette liste sont masqués (opacity 0). Les jonctions sont affichées si au moins un de leurs endpoints touche un niveau visible. |
| **Auto-crop** | Étape automatique du générateur V2 qui détecte les marges blanches autour du contenu utile et tuile uniquement la zone non-blanche. Les dims `imageWidth/Height` reflètent la zone croppée. |
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

1. Loader → bouton **🏗️ Générer un plan** (directement visible dans la home depuis v1.7.3).
2. Choisis "📄 Nouveau plan".
3. Upload une image (PNG ou JPEG, idéalement ≤ 8000 px de côté).
4. Définis l'échelle (combien de mètres font N pixels — clique 2 points distants sur l'image).
5. Configure les calques, les icônes par défaut, etc.
6. **📦 Générer le ZIP** — l'archive est téléchargée.
7. Recharge le ZIP via le loader pour utiliser le plan.

### H. Optimiser un plan qui plante sur mobile

1. Identifie ce qui pèse : taille image base, nombre de calques, nombre de routes, nombre de points.
2. Solutions par ordre d'impact :
   - **Convertis en V2 tuilé** (depuis v149) : 🏗️ Générateur → uploader l'image (ou le ZIP V1 existant) → cocher 🧱 **Convertir en V2 tuile (performance)** → 📦 Générer. Solution la plus efficace pour les gros plans : runtime tuilé Google Maps-like, ~16 MB max en RAM au lieu de l'image entière. ⚠️ Génération **lourde** (CPU + RAM), faire la conversion sur PC plutôt que mobile (cf modal d'avertissement à la coche).
   - **Réduis l'image base** (≤ 8000 px, JPEG qualité 85 au lieu de PNG).
   - **Diminue le nombre de calques image** (fusionne légendes + collision dans l'image base si possible).
   - **Intègre les routes dans l'image** si tu as > 200 tracés (deviennent statiques, plus interactives mais ne consomment plus de mémoire vive).
   - **Choisis le preset ⚡ Performance** au chargement.
3. Regénère le ZIP via 🏗️ Modifier existant.

### K. 🏗️ Activer le mode multi-niveau (carrière multi-étages)

> Pour les carrières / galeries avec plusieurs niveaux empilés physiquement (Glacière, Capucins, etc.). Mode opt-in désactivé par défaut. Cf glossaire `Mode multi-niveau`.

1. **Active la feature** (2 voies, depuis v1.7.3) :
   - **Via le générateur de plan** (recommandé) : 📦 Créer/Modifier un plan → cocher 🏗️ Plan multi-niveau (avancé) dans la section "Informations du plan" → 📦 Générer → ZIP avec le flag pré-activé. À l'import, le mode s'active automatiquement.
   - **Manuellement** dans `plan-config.json` : ajouter `"multiLevel": true` dans la section `plan`
   - ⚠️ Le toggle ⚙️ Réglages pour activer le mode sur un plan déjà chargé a été retiré en v1.7.3 — pour activer le mode sur un plan existant, il faut soit le ré-importer dans le générateur en cochant la case, soit éditer son `plan-config.json` manuellement avant de le re-charger.
2. Une fois activé, une **pastille `[0]` jaune** apparaît sous les boutons de zoom (haut-gauche). Le mode affiche par défaut **5 niveaux symétriques** : `-2, -1, 0, 1, 2`. 0 reste le niveau de référence (= éléments sans `level` taggué, ex: tous les plans v147 et avant).
3. **Trace au niveau 0** comme d'habitude (routes/zones/points). Pour les **sous-sols (sub-cellars)**, change le niveau actif vers `-1` ou `-2`. Pour les **étages supérieurs**, vers `1` ou `2`.
4. **Pour changer de niveau actif** : clique la pastille → modale Niveaux → sélecteur "Niveau actif" → choisis le numéro voulu (peut être négatif : `[-1]`, `[-2]`). La pastille se met à jour et le filtre passe sur ce niveau (les autres niveaux disparaissent visuellement).
5. **Étendre le range au-delà de [-2, 2]** : 2 boutons d'extension dans la modale Niveaux :
   - `[ + ]` (à droite) → ajoute le prochain niveau supérieur (max+1)
   - `[ − ]` (à gauche) → ajoute le prochain niveau inférieur (min−1)
   Ex: cliquer `[ + ]` étend `[-2, -1, 0, 1, 2]` en `[-2, -1, 0, 1, 2, 3]`. Idem `[ − ]` ajoute `-3`. **Auto-extension** : si tu charges un plan dont les data layers ont déjà des niveaux hors range (ex: ancienne session avec `level: 4`), l'app étend automatiquement `availableLevels` pour que ces éléments soient sélectionnables.
6. **Pour relier deux niveaux** (escalier, pente, puits interne) : groupe 🛣️ Tracés → **🪜 Jonction interniveau** → modale → choisir départ/arrivée (ex: `-1` vers `0`, ou `0` vers `1`, peu importe l'ordre — sémantique symétrique) → OK → clic N points sur la carte → la jonction est tracée en magenta pointillé avec des ronds blanc+magenta aux extrémités. Sans jonction, le pathfinder ne peut pas passer d'un niveau à l'autre.
7. **Filtrer ce que tu vois** : modale Niveaux → section "Niveaux visibles" → cocher/décocher les niveaux. Boutons rapides `Tous` (tout afficher) / `Actif seul` (focaliser).

### L. 🧱 Convertir un plan V1 en V2 tuilé (performance)

> Pour les gros plans (>50 Mo image, >8000 px) qui plantent sur mobile. La conversion V2 découpe l'image en tuiles 512×512 sur 4 niveaux de zoom → runtime charge seulement les tuiles du niveau visible. Cf glossaire `V2 (plan tuilé)`.

1. **Recommandé sur PC** (conversion lourde : décodage image source + drawImage de N tuiles, ~256 Mo RAM pour image 8K). Sur mobile, risque de crash pendant la génération (iOS plafonné à ~500 MB).
2. Ouvrir le 🏗️ Générateur de plan.
3. **Mode Nouveau** : uploader ton image principale + remplir le formulaire → la case 🧱 Convertir en V2 tuile apparaît automatiquement.<br>
   **Mode Modifier existant** : uploader ton ZIP V1 → la case 🧱 est dispo.
4. Cocher **☑️ 🧱 Convertir en V2 tuile (performance)** → modal d'avertissement (CPU/RAM/durée + PC vs mobile) → **J'ai compris — Continuer**.
5. Compléter le reste du formulaire si nécessaire (nom, version, calques, tracking, etc.).
6. Cliquer **📦 Générer le ZIP** → overlay de progression "Niveau z=−N · X / Y tuiles (Z%)" (1-5 min selon image).
7. ZIP téléchargé avec suffixe `_v2`. Le réimporter via le loader → le mode V2 s'active automatiquement (badge violet `V2` sur la carte plan).
8. **Bypass temporaire** : si tu veux comparer V2 vs V1, charge le plan V2 avec **Mode performance : Désactivé** au loader → l'app charge l'image source directement comme V1.
9. **Si la génération échoue** (depuis v152) :
   - **Erreur attrapée** → modale rouge "❌ Échec de génération" qui détaille la cause (drawImage, toBlob, saturation mémoire) + conseils. Lis le message et applique le conseil correspondant (PC, image plus petite, JPEG q85).
   - **Crash silencieux** (navigateur kill la page sans erreur) → au prochain reload de l'app, modale rouge "🧱❌ Génération V2 interrompue" t'avertit. Cause typique : OOM sur mobile (plafond ~500 Mo iOS).

### M. 🌐 Migration vers `myktamap.fr` (depuis v163)

> Mots-clés : "changement de domaine", "nouvelle adresse", "myktamap.fr", "is-underground.fr", "déménagement", "ancienne adresse".

**Contexte** : MyKTAMap change de domaine officiel. La nouvelle adresse `myktamap.fr` remplacera `myktamap.is-underground.fr` à partir du **15 juillet 2026**.

**Sur l'ancien domaine** (jusqu'au 15 juillet 2026) :
- Modal pédagogique au premier lancement (rappel) + alerte info permanente via le badge 🚨
- L'utilisateur peut continuer à utiliser le site normalement
- Aucune perte de données si l'utilisateur agit avant la coupure

**Que faire pour migrer ses données** (la liste de plans, les sessions et les préférences sont liées au domaine — elles ne suivront PAS automatiquement) :
1. **📚 Exporter la liste de plans** : loader → section "📚 Mes plans" → bouton 💾 → télécharge un fichier `.config` (métadatas + références des plans connus). Réimport via le bouton 📂 au même endroit sur le nouveau domaine.
2. **💾 Exporter ses sessions** via 💾 Sauvegarde session sur chaque plan (Full ou Avancé) → télécharge un `.json` par session (annotations, tracés, zones, points perso en cours)
3. **📦 Garder les ZIPs** des plans importés pour les ré-importer manuellement sur `myktamap.fr` (les blobs locaux stockés en IndexedDB ne sont pas exportables)
4. **Au 15 juillet 2026** : aller sur `myktamap.fr` → importer le `.config` de liste + ré-importer les ZIPs + importer les `.json` de session sur chaque plan correspondant
5. **📱 Si l'app était installée** (PWA sur écran d'accueil) : supprimer l'ancienne icône manuellement + réinstaller depuis `myktamap.fr`

**Important** : la migration des sessions/plans est **manuelle**. Le système ne transfère pas automatiquement les données entre les 2 domaines pour des raisons de sécurité (isolation des origins par les navigateurs — règle web non-contournable).

---

### N. 🚫 Bloquer un itinéraire par zone "Inaccessible" (depuis v169 / Karma_dev)

> Mots-clés : "bloquer itinéraire", "zone interdite", "éviter une zone", "rendre inaccessible", "interdire le passage", "zone bloquante".

**Cas d'usage** : tu veux qu'un calcul d'itinéraire ne passe JAMAIS par une certaine zone (effondrement récent, eau profonde, passage dangereux non balisé, etc.). C'est une contrainte **dure** — jamais relâchée même en cas de fallback.

1. Dans la barre latérale, ouvre le groupe **⬛ Zones**.
2. Clique la sous-action **⛔ Zone inaccessible**.
3. Clique sur la carte pour poser les sommets du polygone (au moins 3).
4. Re-clique sur le 1er point ou appuie sur ✅ Fermer pour clôturer.

La zone apparaît avec un **motif hachures rouge sombre / noir** à 45°. Tout itinéraire calculé qui aurait traversé cette zone passera désormais par un autre chemin. Si aucun autre chemin n'existe, l'itinéraire échoue avec un message "Aucun chemin trouvé".

**Multi-niveau** : la zone bloque uniquement les segments de route du **même niveau** (cohérent avec le filtre niveau). Une zone inaccessible au niveau 0 n'affecte pas l'itinéraire au niveau -1.

**Indépendant de la visibilité** : même si tu décoches le calque zones dans le contrôle des couches, la zone bloque toujours le pathfinder.

---

### O. 🚫 Préférences d'évitement (points / tags) — depuis v169 / Karma_dev

> Mots-clés : "éviter un point", "éviter un tag", "préférences itinéraire", "contournement", "ne pas passer par", "marge d'évitement".

**Cas d'usage** : tu veux que l'itinéraire calculé évite si possible un point spécifique (ex: PA12 que tu sais bloqué temporairement) ou tous les points d'un type donné (ex: tous les `danger`). Contrainte **souple** : si pas d'alternative, l'app calcule quand même en passant par les points évités et te prévient.

1. Ouvre la modale **🗺️ Itinéraire** (groupe 🧭 Tracker → 🗺️ Calculer un itinéraire).
2. Déplie la section **🚫 Préférences d'évitement (optionnel)** en cliquant le titre.
3. **Points à éviter** (3 méthodes au choix) :
   - **Recherche autocomplete** : tape un nom dans le champ et clique le résultat
   - **Saisie par ID** : tape l'ID exact dans le champ texte et clique "+ Ajouter par ID"
   - **Clic carte** (depuis fix audit) : bouton **📍 Cliquer sur la carte** → la modale se réduit en floater orange et chaque clic sur la carte ajoute un point d'évitement. Bouton ✓ Terminer pour revenir à la modale.
   - Les points ajoutés apparaissent en chips orange avec ✕ pour retirer
4. **Tags à éviter** :
   - Clique sur un chip de tag pour le toggler (gris → orange)
   - Tous les points du plan portant ce tag seront évités
5. **Marge (px)** : tout segment de route à moins de cette distance d'un point évité est exclu du graphe (défaut 100px).
6. Ajoute tes waypoints + clique **🎯 Calculer**.

**Résultat du calcul** :
- ✅ Cas idéal : l'itinéraire passe en évitant tout, tu vois juste la distance + temps habituels.
- ⚠️ Cas fallback : un message orange "⚠️ Impossible d'éviter : X, Y" apparaît si l'app a dû passer à proximité de certains points évités (= aucun chemin alternatif possible). L'itinéraire est quand même tracé.
- ❌ Cas erreur : "Aucun chemin trouvé" si même le fallback échoue (réseau de routes disconnect ou zone inaccessible bloque tout).

**Persistance** : tes préférences d'évitement sont sauvegardées en localStorage par plan. Au prochain calcul sur le même plan, elles sont restaurées. Bouton **🗑️ Reset** pour tout effacer.

**Différence dur/souple** :
| Type | Hard/soft | Fallback |
|---|---|---|
| ⛔ Zone inaccessible | Dur | ❌ Jamais relâché |
| 🚫 Point / tag évité | Souple | ✅ Fallback + message si pas d'alternative |

---

### P. 🌍 Exporter en KMZ géolocalisé (Google Earth, OsmAnd, Locus, Avenza) — depuis v170

> Mots-clés : "export KMZ", "Google Earth", "OsmAnd", "Locus", "Avenza", "KML", "géolocalisé", "géoréférencé", "calibrage GPS", "lat lng", "coordonnées GPS", "exporter pour application terrain".

**Cas d'usage** : tu veux ouvrir ton plan + tes annotations (points, tracés, zones) dans une appli de cartographie terrain qui supporte le KML (Google Earth, OsmAnd, Locus, Avenza, ArcGIS Earth…). L'app calcule la transformation rotation+échelle+translation à partir de **2 points** dont tu connais à la fois les coords plan (x, y en pixels) ET les coords GPS réelles (lat, lng en degrés).

1. Ouvre **💾 Export Session** → onglet **🌍 KMZ**.
2. **Calibrage Point A** :
   - Méthode 1 : **🔍 Chercher un point** → tape un nom dans la barre, clique le résultat → x/y plan auto-remplis. Tu n'as plus qu'à renseigner les lat/lng GPS réelles correspondantes.
   - Méthode 2 : **📍 Cliquer carte** → la modale se réduit, clique sur la carte là où tu connais les coords GPS → x/y plan auto-remplis. Renseigne lat/lng GPS.
   - Méthode 3 : Saisie manuelle directe des 4 champs x/y/lat/lng.
3. **Calibrage Point B** : pareil, choisis un point **éloigné** du Point A (idéalement aux extrémités opposées du plan pour maximiser la précision). L'app refuse si `|AB_plan| < 50 px` ou `|AB_gps| < 1 m`.
4. **🌐 Aperçu coins** s'affiche live au fur et à mesure que tu remplis : les 4 coins du plan calculés en (lat, lng), + échelle (mètres/pixel) + rotation (°). Lien **🔗 Voir le centre sur Google Maps** pour vérifier visuellement (vérif connexion internet auto avant ouverture).
5. **📦 Contenu à inclure** (pattern identique à l'Export PNG Avancé) :
   - 🖼️ **Image plan** (GroundOverlay) + slider **Opacité** (0-100%, défaut 60% — permet de voir l'OSM/satellite sous le plan)
   - 📍 **Points** (parent) + sous-cases par tag avec icônes et compteurs
   - 🛣️ **Tracés** (parent) + sous-cases Principaux / Secondaires / Chemins
   - ⬛ **Zones** (parent) + sous-cases Eau / Remblais / Effondrement / Inaccessible
   - 🪜 **Jonctions interniveau** (si plan multi-niveau)
   - 🗺️ **Itinéraire actif** (si calculé)
6. **🏗️ Niveaux à inclure** (si multi-niveau) : chips pour filtrer. Par défaut : tous les niveaux dispo (1 Folder KML par niveau).
7. Clique **Télécharger** → fichier `MyKTAMap_<plan>_<date>.kmz` téléchargé.

**Persistance** : ton calibrage 2 points est sauvegardé en localStorage par plan (clé `myktamap_kmz_calib_<planId>`). Au prochain export du même plan, les 8 champs sont pré-remplis — tu ajustes si besoin et tu re-télécharges.

**Conseils calibrage** :
- Choisis 2 points dont tu es **sûr** des coords GPS (entrée de carrière reconnaissable, plaque IGC visible depuis Google Maps Street View…)
- Plus AB est long sur le plan, meilleure est la précision de la transformation
- 2 points seulement suffisent pour un plan globalement plat et rigide ; sur des plans très étendus ou non-rigides, attends-toi à une légère dérive aux extrémités opposées (math affine simple, pas de correction non-linéaire)

**Compatibilité** :
- ✅ **Google Earth** (web et desktop) : recommandé, support natif gx:LatLonQuad
- ✅ **OsmAnd** (Android, iOS) : supporte KMZ + KML
- ✅ **Locus Map** (Android) : idem
- ✅ **Avenza Maps** (Android, iOS) : idem
- ✅ **ArcGIS Earth, QGIS** : support KML

**Inclusion data layers** : le KMZ inclut **session + embedded**. Si ton plan a des roads/zones/points dans `chemin.json`, `puits.json` etc., ils sortent aussi (contrairement aux exports Full/Avancé/Conversion qui sont session-only par design).

---

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
   - Loader → **🏗️ Générer un plan** → **📂 Modifier existant**.
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

1. **Convertis ton plan en V2 tuilé** (depuis v149, solution la plus efficace) : 🏗️ Générateur → cocher 🧱 Convertir en V2 tuile → 📦 Générer → réimporter le ZIP V2. La conso mémoire passe de "image entière en RAM" à ~16 MB max au runtime. Conversion **lourde**, à faire sur PC plutôt que mobile (cf recette L).
2. **Choisis le preset ⚡ Performance** dans le loader avant de charger.
3. **Active le 🚀 Mode Performance ULTRA** : ouvre ⚙️ Réglages → section "🚀 Mode Performance ULTRA" → coche le toggle **🚀 ULTRA**. Il active 6 optimisations agressives qui ne touchent pas l'image mais réduisent drastiquement la charge des tracés/markers/intersections :
   - 🪜 Décimer les tracés au dézoom
   - ⚡ Désactiver animations zoom/pan (reload requis)
   - 🎯 Désactiver cercles intersections (seuil 50 routes vs 200)
   - 🚫 Désactiver popups sur calques de données
   - 🐢 Auto-save lent (30s)
   - 👁️ Ne rendre que les tracés visibles (viewport culling)
   Tu peux aussi activer ces toggles individuellement si tu veux affiner.
4. Si l'app a déjà crashé, l'OOMGuard affiche une modale d'avertissement au prochain reload.
5. Active 🐛 Logs détaillés (loader → ⚙️ Configuration → 🛠️ Debug, ou ⚙️ Réglages in-app) puis recharge → consulte la modale 🐛 pour voir où ça plante.
6. À terme : optimise le plan (voir recette H ci-dessus).

### C'est quoi les badges V1 / M-LVL / V2 sur les lignes de la liste de plans ?

Indicateurs visuels du **mode** de chaque plan dans le loader (depuis v150) :

- **V1** (gris discret) : plan classique, image entière chargée en RAM au boot. Mode par défaut historique.
- **M-LVL** (jaune) : plan **multi-niveau**, contient des éléments tagués par niveau + le mode est activé (`plan.multiLevel: true`). Carrière multi-étages. Cf glossaire et recette K.
- **V2** (violet) : plan **tuilé V2**, image découpée en tuiles 512×512 sur 4 niveaux de zoom. Conso mémoire massivement réduite au runtime. Cf glossaire et recette L.

Plusieurs badges peuvent coexister sur un même plan (un V2 peut aussi être multi-niveau). Couleur cohérente avec les UI internes : jaune = niveau (pastille `[N]`), violet = V2 (checkbox planner).

### Le tracker ne pointe pas dans la bonne direction sur ma carrière (boussole déraille)

C'est probablement une perturbation magnétique. Les armatures métalliques (rails, ferraille, plaques d'égout) faussent fortement le magnétomètre du téléphone.

1. **Active la boussole de validation** : groupe 🧭 Tracker → sous-action 🧭 Afficher la boussole. Elle affiche une rose des vents en haut-gauche qui tourne pour pointer vers le vrai Nord. Marche dehors / en surface, déraille parfois en sous-sol.
2. **Recale manuellement** le tracker dès que tu reconnais un repère sur le plan : 📍 Mode recalage → clic sur le point reconnu.
3. **Utilise une vraie boussole physique** en parallèle — c'est la recommandation officielle (le tracker est un outil de debug, pas de localisation fiable, cf popup d'avertissement au démarrage).

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

### C'est quoi le petit badge `v143` (ou similaire) en bas du loader ?

C'est le **badge version** de l'application. Il indique la version actuellement installée chez toi.

**État normal** : gris discret avec bordure subtile. Au clic, affiche une modale compacte avec :
- La version installée (en monospace vert)
- La date de publication
- Les **notes de cette version** (changelog de ce que tu utilises actuellement)

**État "mise à jour disponible"** : le badge devient **bleu et clignote**, et affiche la transition (ex: `v141 → v143`). Au clic, ouvre la modale **🔔 Mise à jour disponible** avec les choix Mise à jour douce / Reset complet.

> 💡 Tu peux cliquer le badge à tout moment pour relancer la modale d'update — pratique si tu avais cliqué "Plus tard" et que tu changes d'avis.

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
   - Loader → **🏗️ Générer un plan** → **📂 Modifier existant**.
   - Importe ton ZIP actuel → ajoute les `.json` de l'étape 1 comme data layers → **📦 Générer le ZIP**.

**Ne confonds pas** :
- **📥 Importer une session** (groupe ⬇️ Charger / Import) → charge **temporairement** dans la session (modifiable, lié à la session).
- **🔄 Conversion + 🏗️ Modifier existant** → fige **définitivement** dans le ZIP (non modifiable depuis l'app après).

Voir aussi la **recette I** dans la section "🍳 Recettes" pour la procédure détaillée.

### Comment partager un plan avec un ami ?

1. Loader → **🏗️ Générer un plan** → "Modifier existant" → sélectionne ton plan.
2. Si rien à modifier, clique directement **📦 Générer le ZIP**.
3. Envoie le `.zip`.
4. L'ami le charge via la zone drop du loader.

### Comment ajouter un nouveau type d'icône (ex: "fontaine") ?

Via 🏗️ Générer un plan → "Modifier existant" → onglet Icônes → ajoute un tag custom (nom + image PNG 50×50 transparent) → regénère.

### L'app me dit "⚠️ ARRÊT BRUTAL DÉTECTÉ" au démarrage

L'OOMGuard a détecté que la session précédente a été tuée par le système (OOM — out of memory).

- C'est normal sur mobile avec un gros plan.
- Pour éviter la prochaine fois : baisse le preset performance, réduis l'image base, ferme les autres apps.

### L'app me dit "🧱❌ Génération V2 interrompue" au démarrage

Variante spécifique du détecteur de kill OOM (depuis v152), focalisée sur la **génération V2**. Tu avais lancé une conversion V2 (case 🧱 du générateur) et le navigateur a tué la page pendant la conversion — typique sur mobile avec une image source > 8K×8K.

**Solutions** (par ordre d'efficacité) :
1. **Refaire la conversion sur PC** plutôt que mobile (plafond mémoire navigateur 4-8 Go au lieu de ~500 Mo iOS).
2. **Réduire l'image source** (la passer en JPEG qualité 85, dimensions ≤ 8000 px de côté).
3. **Fermer toutes les autres apps** en arrière-plan avant de relancer la conversion sur mobile.

### J'ai eu une modale rouge "❌ Échec de génération" pendant la conversion V2

Depuis v152, la génération V2 attrape toutes les erreurs internes (drawImage, toBlob, saturation mémoire) au lieu de planter silencieusement.

La modale t'indique la **cause exacte** (avec les coordonnées de la tuile qui a échoué : `(z, col, k)`) + des **conseils actionnables**. Lis le message et applique le conseil :
- Erreurs `drawImage` ou `toBlob` → typiquement OOM, baisse la taille de l'image source ou passe sur PC.
- Erreur "saturation mémoire" → idem, plafond du navigateur atteint.

### Je veux utiliser MyKTAMap commercialement (entreprise, prestation payante)

L'usage commercial est **interdit par défaut** (licence CC BY-NC-SA 4.0). Une licence commerciale séparée est nécessaire. Contacte l'auteur via le site officiel pour discuter.

### Je voudrais contribuer au projet (code, traduction, retour terrain)

La collaboration est **ouverte sur demande**. Contacte l'auteur via le site officiel en décrivant ce que tu veux apporter — chaque contribution nécessite un accord écrit préalable (cohérence du projet, respect de la licence).

### Puis-je consulter le code source ?

Le code source n'est **pas distribué publiquement**. Il n'existe pas de dépôt Git ouvert. Pour toute question technique précise, l'auteur reste joignable via le site officiel.

---

**Fin du document.** Les questions au-delà de ce périmètre ne sont pas couvertes — l'assistant IA doit explicitement le signaler plutôt que d'inventer.
