# MyKTAMap — Documentation utilisateur (version enrichie pour assistance IA)

<!--
  ✏️ POUR L'ÉDITEUR DE CE FICHIER (KARMA / Claude) — invisible pour l'user :
  Ce template est BALISÉ PAR PROFILS pour la modale 🤖 Aide IA (interfaceDocs.js).
  Un marqueur `@@PROFIL usage,diagnostic` (en commentaire HTML sur sa propre ligne) s'applique jusqu'au marqueur
  suivant. Profils : usage · diagnostic · plans · tous (= commun, défaut en tête
  de fichier). Le JS filtre à la génération et retire les marqueurs.
  Règles : (1) toute nouvelle recette/FAQ doit recevoir un marqueur ; (2) les
  listes fermées anti-hallucination et le survol restent en zone commune ; (3) la
  doc utilisateur intégrale n'est PLUS injectée ici (placeholder {{README_USER}}
  supprimé v1.69.0) — garder ce fichier sous ~150 Ko pour rester lisible par les IA.
-->

> Document généré le **{{DATE}}** (build {{BUILD}}) par l'application MyKTAMap pour servir de **source de référence** à un assistant IA. Le lecteur (humain ou IA) doit considérer le contenu ci-dessous comme **la seule documentation officielle disponible** de l'application.
>
> Ce fichier est servi tel quel par l'app : `docs/AI_CONTEXT.md` (déplacé dans `docs/` depuis v1.8.0, avant à la racine). Pour l'enrichir, éditer directement ce fichier — aucun re-déploiement de code n'est nécessaire, le service worker se chargera de propager la mise à jour.

---

## ⚖️ Mentions légales

- **Auteur** : Flavien VIDAL (alias KARMA)
- **Site officiel** : https://myktamap.fr
- **Licence** : **CC BY-NC-SA 4.0** — Attribution, NonCommercial, ShareAlike
  - Usage non commercial autorisé avec attribution + partage à l'identique
  - **Usage commercial strictement interdit** sans accord écrit préalable de l'auteur
- **Code source** : **non distribué publiquement** (pas de dépôt ouvert). Toute personne consultant ce document n'a accès qu'à la documentation utilisateur — pas au code, pas à l'app live, pas aux données.
- **Collaboration** : **ouverte sur demande** (contributions, ports, intégrations, retours terrain). Contact via Instagram **@karma_kta** — ou par email **contact@myktamap.fr** (notamment pour tout usage professionnel / commercial).

> ⚠️ Toute reproduction, modification, redistribution ou utilisation commerciale de cette documentation ou de l'application sans accord écrit préalable de l'auteur expose à des poursuites pour contrefaçon (art. L.335-2 du Code de la propriété intellectuelle).

---

## ⛔ INSTRUCTIONS CRITIQUES À L'IA — À LIRE AVANT TOUTE RÉPONSE

> 🛑 **RÈGLE ABSOLUE — TOLÉRANCE ZÉRO À L'HALLUCINATION**
>
> Tu réponds **EXCLUSIVEMENT** à partir du texte présent dans ce document. Si une information n'est pas littéralement écrite dans le document fourni, **elle n'existe pas dans MyKTAMap**, point final.
>
> 🌍 **LANGUE DE RÉPONSE** : ce document est rédigé en français, mais tu réponds **TOUJOURS dans la langue employée par l'utilisateur** (français, anglais, espagnol ou autre).
>
> Tu ne dois **JAMAIS** :
> - Inventer une fonctionnalité, un type de zone, un type de point, un mode, un bouton, une option, un format de fichier, etc.
> - Extrapoler par analogie avec d'autres applications de cartographie (Google Maps, QGIS, Mapbox, etc.).
> - Compléter une liste en ajoutant des éléments "logiques" qui ne sont pas dans le document.
> - Supposer qu'une fonctionnalité existe parce qu'elle "devrait" exister ou parce que c'est "courant".
> - Reformuler le périmètre de l'app au-delà de ce que la doc décrit.
>
> Si l'utilisateur te demande quelque chose qui n'est pas dans le document, **dis-le explicitement** : *"Cette fonctionnalité n'est pas décrite dans la documentation que j'ai. Vérifie directement dans l'app ou contacte l'auteur via Instagram **@karma_kta** ou par email **contact@myktamap.fr** (usage pro / licence : **pro.myktamap.fr**)."*

---

### 🔒 Procédure de vérification AVANT de répondre

Pour **chaque** question :

1. **Cherche le terme** mentionné par l'utilisateur dans **tout le document** (préambule + survol des fonctionnalités + glossaire + recettes + FAQ). Considère aussi les **synonymes** raisonnables : "mode urgence" ≡ "Je suis perdu" ≡ "perdu" ; "itinéraire" ≡ "trajet" ≡ "navigation" ; "session" ≡ "annotations" ; etc.
2. Si le terme apparaît dans le survol, une recette, la doc ou la FAQ → réponds à partir de ce contexte, sans extrapoler au-delà.
3. Si le terme n'apparaît **nulle part** dans le document même après vérification des synonymes → la fonctionnalité n'existe probablement pas, dis-le clairement.
4. **Cite la section** du document où l'info est trouvée (ex : *"D'après la recette ⛑️ Mode urgence — Je suis perdu..."* ou *"D'après la section '⬛ Tracer des zones'..."*).

⚠️ **Ne dis JAMAIS "ça n'existe pas" sans avoir vérifié dans toutes les sections** (en particulier le **survol des fonctionnalités principales** ci-dessous et les **recettes** plus bas, qui contiennent les fonctionnalités modernes ajoutées récemment).

---

### 📋 Liste exhaustive des éléments qui EXISTENT (anti-hallucination)

> Cette liste te sert d'**ancrage** sur les **listes fermées** (types de zones, types de tracés, modes performance, etc.). Pour ces listes : tout ce qui n'est PAS listé ici **n'existe pas**.
>
> ⚠️ **Pour les fonctionnalités générales** (modes, outils, sections d'interface), la référence = ce survol + les **recettes** + la **FAQ** plus bas. Si l'utilisateur demande une fonctionnalité introuvable ici même après recherche de synonymes, réponds qu'elle n'est **pas couverte par le contexte fourni** et renvoie vers la **Documentation intégrée** de l'app (bouton 📖 de l'écran d'accueil) — sans affirmer qu'elle n'existe pas si le doute subsiste.

**Fonctionnalités principales** (survol — détails dans la doc + recettes) :
- 🗂️ **Multi-plans** : registre de plans, import ZIP, auto-discovery serveur, modale "Plan introuvable", titre cliquable plan switcher
- 🔍 **Recherche de points** par nom / id / tag, avec filtres calques et tags, insensible aux accents
- 🧭 **Tracker PDR** (expérimental) : suivi de position inertiel sur mobile (comptage de pas + boussole), **sans GPS**. Pendant le suivi, l'icône (cône bleu) pointe la direction de marche. Mode 📍 **Recalage** pour recaler sa position : clic carte, ou « 📍 Je suis ici » depuis un point. Sous-actions : 🎯 Ma position (recentre la carte) · 🔓 Suspendre le verrou sur tracé (30 s / 1 min / 10 min, compte-à-rebours dans la barre du bas). Au rechargement d'une session, le tracker repart de la dernière position connue. Réglages avancés dans ⚙️ → Navigation & Tracker (taille de pas, tolérance du verrou…). Le menu du groupe 🧭 s'ouvre en modal plein écran : sections Suivi / Outils / Urgence + bande de statut (distance, pas).
- ⌨️ **Raccourcis clavier** : 1 touche par outil — **E** Édition · **M** Mesure · **Z** Zones · **S** Structures · **T** Tracker · **P** Tracés · **L** Légende · **B** Boussole · **R** (ou Ctrl+K) Recherche · **F** présentation · **Ctrl+Z / Ctrl+Y** annuler/refaire · **Échap** ferme la modale active. **`?`** affiche la liste complète (cheatsheet). Navigation clavier dans les menus d'outils (TAB, flèches, Entrée).
- ❓ **Aide intégrée** : la modale ❓ du HOME est un hub — sommaire en 6 catégories + barre de recherche ; chaque rubrique s'ouvre en sous-modale avec bouton ← Retour.
- 🏅 **Rangs de profil** (depuis v1.52.0) : 6 rangs — Touriste · 🥉 Novice · 🥈 Confirmé · 🥇 Expert · 🏅 Maître · ⚜️ Grand Maître — atteints par seuils fixes sur les 3 métriques À LA FOIS (plans ouverts ET temps passé ET km cartographiés ; ex. Grand Maître = 25 plans + 60 h + 200 km). Affichage : anneau coloré autour de l'avatar + nom du rang + médaille en coin de photo. Le « score » (plans+heures+km) est purement décoratif, il n'influence pas le rang.
- 🏆 **Hauts faits** (depuis v1.53.0) : **38 succès** — 8 familles × 4 paliers (Cartographe · Géomètre · Marcheur · Rat de cave · Pointilleux · Traceur · Zoneur · Bâtisseur) + 6 spéciaux (Touche-à-tout · Centurion · Taupe · Spéléo multi-niveaux · Marathon · Complétiste). Débloqués automatiquement selon les compteurs (toast à chaque déblocage), grille N/38 dans la fiche profil. 100 % local.
- 🗺️ **Itinéraire** : pathfinder Dijkstra entre 2+ waypoints, label distance + temps estimé en bas-gauche. **Depuis v169 (Karma_dev)** : 2 nouvelles contraintes possibles :
  - ⛔ **Zones inaccessibles** (DUR) : tout segment de route traversant une zone polygonale de type `inaccessible` est exclu du graphe — l'itinéraire passe forcément à côté. Jamais relâché.
  - 🚫 **Préférences d'évitement** (SOUPLE) : configurées dans la modale itinéraire (section repliable "🚫 Préférences d'évitement"). On peut éviter des **points précis** (par recherche / ID), des **tags entiers** (ex: tous les `pa` / Puits Aération), ou — **depuis v1.48.0** — des **types de zones** (checklist "⬛ Zones à éviter", **1 case par type** : Eau, Effondrement, types personnalisés… ; cocher un type fait contourner toutes ses zones ; les zones de type `inaccessible` n'y figurent pas, elles sont déjà une contrainte DURE). Marge configurable (défaut 100px). **Fallback 2 passes** : si pas de chemin en évitant, l'app tente sans les évitements et affiche un message orange "⚠️ Impossible d'éviter : X, Y" pour informer l'user. Persisté par plan via localStorage.
- 🔄 **Itinéraire vivant** (depuis v1.61.0) : à chaque **recalage de position** (clic carte en mode recalage, bouton « 📍 Je suis ici » d'un point, arrivée par un portail), l'itinéraire actif est **recalculé automatiquement depuis la nouvelle position** (étapes restantes conservées dans l'ordre planifié, préférences d'évitement respectées). « 📍 Je suis ici » sur un point qui est une **étape de l'itinéraire** = **validation de passage** (marker ✓ vert, ligne rayée dans la modale, étape exclue des calculs suivants) — dans **n'importe quel ordre** (l'app valide ce que l'utilisateur fait, pas ce qu'elle propose). Toutes les étapes validées → message « 🎉 Itinéraire terminé » + tracé effacé (le tracé tracker reste). Les validations survivent au reload (persistées avec la session). Le recalage clic carte ne valide jamais (approximatif) : il replanifie seulement.
- ⛑️ **Mode urgence "Je suis perdu"** (sous-action du groupe 🧭 Tracker) : estime une zone de recherche à partir de dernière position + temps écoulé + indices visuels texte ; affiche cercle orange, markers violets pour les indices in-zone ; bloc dépliable "📚 Bonnes pratiques" ; rapport copiable
- 🚨 **Mode urgence "panique"** (depuis v1.10.1) : affichage plein écran simplifié avec position XL + boussole géante + minimap auto-focus + Wake Lock. **Depuis v1.12.0** : toggle ☑️ 🗺️ Itinéraire dans l'en-tête (persistance localStorage `myktamap_emergency_show_iti_v1`, défaut OFF pour protection anti-crash sur gros plan, rendu cyan vif + halo blanc quand activé) + bloc 🔋 ÉTAT affiche le niveau batterie en temps réel + minimap recadre correctement à la rotation paysage (3 retries invalidateSize cascade).
- 🚨 **Mode Secours** (depuis v1.22.0) : coordination d'équipes de recherche en cas d'incident souterrain. Bouton 🚨 dans le menu 🧭 Tracker. Multi-scénarios par plan (max 10). Deux états : **CRÉATION** (contexte, équipes avec parcours entrée/étapes/sortie, couleurs OTAN Alpha→Juliet, phases successives) puis **EXÉCUTION temps réel** (« 🚀 Lancer le plan de secours ») avec 3 rôles — 👤 Opérateur surface (vue globale multi-équipes) · 🚨 Équipier (parcours pas-à-pas, statuts d'étape : RAS 🟢 / Suspect 🟡 / Bloqué ⬛ / Indice 🔵 / Aide demandée 🟠 / Demi-tour 🟣 / Victime trouvée 🚨) · 🚑 Secouriste libre (notes chronologiques). Photos par étape (max 5), timer global avec pause. **Rapports** : PDF imprimable · fichier `.mkmsec.report.json` partageable (consolidation cross-appareil à l'import) · texte presse-papier. Partage de scénario entre appareils via `.mkmsec.json`. Briefing pompiers PDF avec carte OSM si le plan est géoréférencé. 100 % local.
- 🎬 **Replay tracker** (depuis v1.12.0) : bouton 🎬 dans le groupe 🧭 Tracker. Ouvre une modale plein écran avec slider timeline + play/pause/restart/end + vitesse 0.5×→10× + raccourcis clavier (Espace, ← →, Échap). Mode compact (bottom sheet) activé auto au Play. Trail multi-segments (skip téléportations sur recalage). Bouton 💾 Export CSV produit fichier 5 colonnes `timestamp_ms_epoch,delta_ms_since_start,x_plan,y_plan,type[,level]`. Reset au plan switch (RAM-only).
- 🪫 **Indicateur batterie** (depuis v1.12.0) : chip ⚡/🪫 dans l'en-tête nouvelle interface (à côté compteurs session), footer modale Session active, bloc 🔋 ÉTAT mode urgence. Warnings graduels 20%/10%/5% via toast (1 fois par seuil par cycle décharge). Battery Status API — dispo Chromium uniquement (Android, PC). Si API indispo (Safari iOS, Firefox) : chip masquée sans erreur.
- 📊 **Stats session enrichies** (depuis v1.12.0) : modale 📋 Session active affiche total annotations + breakdown par type (📍/🛣️/⬛/🏛️) + distance cumulée tracés + surface cumulée zones + photos POI + durée session. Multi-niveau (M-LVL) : breakdown additionnel par niveau. Boutons 📋 Copier + 💾 Export TXT pour partager.
- 🏗️ **Plan principal = niveau 0** (depuis v1.67.0) : décocher le niveau 0 dans la modale Niveaux masque aussi l'image principale du plan (tuiles comprises) — permet de regarder un étage seul, la superposition multi-niveau garde son sens. Sans multi-niveau, le plan principal n'est jamais masqué. Le générateur avertit (non-bloquant) si un calque de niveau ≠ 0 n'a pas de canal alpha (JPEG ou PNG aplati) : il masquerait tout ce qui est dessous.
- 🎨 **Thème clair / sombre** (depuis v1.13.0) : bascule ☀️/🌙 à 2 endroits synchronisés — sidebar gauche → ⚙️ Paramètres (en mode carte) et modale Configuration du HOME. Application instantanée partout (accueil, carte, modales, alertes, popups). Palette claire beige « cataphile ». Restent volontairement sombres : le splash d'intro et le viewer photos plein écran.
- 🌍 **Interface multilingue** (depuis v1.46.0, espagnol ajouté en v1.46.1) : l'interface (menus, réglages, modes, messages) est disponible en **3 langues — Français / English / Español** (espagnol 100 % traduit). Sélecteur de langue (drapeau + nom complet FR / EN / ES) dans **⚙️ Configuration → 🌍 Application**, tout en haut de la modale, **et** sur l’écran de déverrouillage. *(depuis v1.85.4)* Il n’est **plus** dans ⚙️ Réglages du mode carte : il pilote toute l’application, pas le plan ouvert. Bascule en live, sans reload. **Doc utilisateur, Aide intégrée et onboarding restent en FR/EN uniquement** : un utilisateur en espagnol voit l'interface en ES mais ces contenus longs s'affichent en **anglais par défaut**.
- 📐 **Mesure de distance** (clic-clic, label `📐 Distance: X m` en bas-gauche)
- ⬛ **Mesure de surface** (depuis v1.12.0) : toggle 📏/⬛ dans le groupe 📐 Mesure. Polygone clic-clic, calcul d'aire par formule de Shoelace appliquée aux coordonnées plan, conversion m² via `APP_CONFIG.scale`. Label adaptatif `⬛ Surface: X m²` (auto bascule en ha au-delà de 10 000 m²). Persistance complète dans la sauvegarde session.
- 📏 **Distance totale des tracés** (filtre par type, highlight magenta)
- ✏️ **Édition de points** (ajout, modification, suppression via popup). **Depuis v1.10.0** : modale d'édition unifiée ajout/modification + section 📸 Photos attachées (capture / galerie / viewer plein écran avec pinch-zoom + swipe nav). Max 5 photos par point.
- 📸 **Photos POI** (depuis v1.10.0) : jusqu'à 5 photos par point (capture caméra ou galerie), compression automatique, stockage 100 % local (IndexedDB — jamais envoyées sur Internet). Métadonnées EXIF (position GPS de prise de vue, date, appareil) **systématiquement supprimées** à l'ajout (v1.63.0) ; l'export anonymisé peut inclure les photos (ré-encodées, renommées). Viewer plein écran : pinch-zoom, swipe entre photos. Incluses dans les exports (session ZIP, KMZ, générateur).
- 🔐 **Code d'accès local PIN/Face ID** (depuis v1.10.0, optionnel) : PIN 4-6 chiffres + biométrie Face ID/Touch ID via WebAuthn. Activable depuis ⚙️ Configuration de la home uniquement. 100 % local (hash SHA-256 + salt, stocké localStorage). Barrière UX, PAS un chiffrement des données. 5 tentatives ratées = lockout définitif. Cf section dédiée plus bas.
- 🛣️ **Tracés / Roads** : Principal / Secondaire / Chemin / Itinéraire
- ⬛ **Zones** : Remblais / Effondrement / Eau / Inaccessible. Depuis v1.10.0 : la "Dernière zone fermée" priorise la zone EN COURS si elle existe (avant : skippée → impossible de supprimer une zone en cours d'un coup)
- 🏛️ **Structures** (depuis v1.9.3) : 5 types — Pilier 1ère masse 🟡 / Pilier 2e masse 🟠 / Mur 🔵 (polygones) + Front de taille 1ère masse 🟨 / 2e masse 🟧 (polylignes). Architecture souterraine (piliers porteurs, murs, avancement d'exploitation). Aucun effet pathfinder (lecture seule). 4 modes de suppression depuis v1.10.0 (incl. ✂️ "en cours OU fermée" + 🎯 sélection au clic carte hybride polygon/polyline). **🔧 v1.10.1 (KARMA hotfix2)** : couleurs des fronts ALIGNÉES sur les piliers — front-1 jaune comme pilier-1 (1ère masse), front-2 orange comme pilier-2 (2e masse). Avant inversées par erreur.
- 🌍 **Mode OSM** (depuis v1.70.0) : le ⛶ du widget Vue OSM ouvre le **mode OSM** plein écran, avec une **barre de recherche 100 % locale** — elle trouve un plan géoréférencé ou un POI de ces plans et centre la carte dessus (aucune recherche d'adresse : rien ne sort sur internet). Seuls les plans **géoréférencés** y apparaissent. Avertissement performance à la première ouverture. **Multi-plans (depuis v1.71.0)** : le panneau « 🗂️ Plans affichés » superpose plusieurs plans géoréférencés — ➕ ajouter, ▲▼ ordre dessus/dessous, opacité PAR plan, ✕ retirer ; le plan ◉ est le principal (sélecteur du bandeau, seul non-retirable) ; TOUTE la gestion vit dans la **modale « 🎚️ Plans & filtres »** (bouton **≡** du bandeau) : interrupteurs d'affichage **globaux** (Plan/POI/Routes/Zones/Struct — il n'y a PLUS de cases ni de slider sous le sélecteur du widget), **filtre par tag agrégé sur tous les plans affichés**, et la pile (ordre, opacité par plan, 5 mini-boutons de filtrage par plan — visibilité effective = global ET par-plan) ; la **barre de recherche** est dans la ligne de titre « 🌍 Vue OSM », disponible aussi sur le widget réduit ; avertissement au-delà de 3 plans. Tout reste local (lecture des ZIP sur l'appareil). 🏷️ **AJOUT PAR ÉTIQUETTE DE PLAN (depuis v1.84.0)** : dans cette même modale, section « 🏷️ Afficher par étiquette de plan », une rangée de chips liste les étiquettes (`plan.tags`, saisies dans la bibliothèque, cf. « Tags ») portées par **au moins deux** plans géoréférencés, avec un compteur « 3/12 ». **Un clic affiche TOUS les plans de l'étiquette, un second clic les retire** — c'est la réponse au cas « j'ai découpé un atlas départemental en vingt plans ». ⚠️ **NE PAS CONFONDRE avec « 🏷️ Filtrer par tag » de la même modale** : ce filtre-là porte sur les **POI à l'intérieur** des plans affichés, celui-ci choisit **quels plans** sont affichés. **Détails à donner si on demande** : la casse est ignorée (« Gironde » et « GIRONDE » = une seule étiquette) ; une étiquette portée par **un seul** plan n'a pas de chip (le sélecteur ➕ suffit) ; au-delà de 3 plans affichés l'app **demande confirmation** en annonçant le compte, puis charge les plans **un par un** (la carte se remplit progressivement — ce n'est pas un blocage) ; le plan principal ◉ n'est jamais retiré par un clic d'étiquette. **Si un utilisateur ne voit pas la section** : ses plans ne sont pas étiquetés, ou aucune étiquette n'est portée par deux plans géoréférencés — les étiquettes se saisissent dans ℹ️ Infos → « Tags du plan ».
- 💾 **Sauvegarde session** : Full / Avancé / Conversion (session → data layer)
- 📔 **Le Carnet** (depuis v1.69.0) : historique des **sorties**, à ne pas confondre avec la sauvegarde de session (qui garde l'ÉTAT courant d'un plan) — le carnet garde l'HISTOIRE et n'est pas effacé quand une session l'est. Une sortie = date + durée réellement passée dans l'app + distance parcourue au tracker + compteurs d'ajouts (points/tracés/zones/structures) + photos prises + tracé du déplacement + note libre éditable à tout moment. **Accès** : bouton **📔 Mon carnet** sur l'accueil (sans charger de plan) ; depuis un plan : modale Session → section **📔 Sortie en cours**. La modale carnet a **2 onglets** : **📔 Sorties** (l'historique décrit ici) et **📖 Récits** — ce dernier remonte la **note libre et le PDF du Mode Histoire de chaque plan**, jusqu'ici consultables uniquement plan chargé : ils sont listés tous plans confondus, la note s'affiche en Markdown et s'édite sur place (c'est la même note que dans le Mode Histoire, pas une copie). Exception à signaler : un PDF **livré dans le ZIP du plan** n'apparaît pas dans les Récits (il faut charger le plan). **🚶 terrain vs 🖥️ bureau** (règle à connaître, elle change ce que l'user voit) : une session où l'user s'est déplacé est une **sortie terrain** — **un seul « 📍 Je suis ici » suffit à la classer terrain**, même tracker éteint ; une session sans aucun déplacement (annotations seules, typiquement du travail à la maison) est classée **travail sur plan** et rangée dans une section repliée à part. Les **totaux du carnet ne comptent que le terrain**. Classement automatique, **corrigeable à la main** depuis la fiche du carnet **ou depuis un plan** (modale Session → section 📔, boutons 🚶/🖥️) — correction définitive, jamais recalculée. **Archivage** : automatique en quittant le plan si **l'une** des deux conditions est remplie — **50 m parcourus** (mesurés ou estimés, cf. ci-dessous) **OU** **10 min actives ET au moins un ajout** ; en dessous rien n'est conservé — ou manuel via **🏁 Clôturer ma sortie** (gardée sans condition, une nouvelle session démarre aussitôt).

📏 **Distance estimée entre les « 📍 Je suis ici »** (règle à connaître : elle explique un chiffre que l'user voit) : quand l'user navigue **sans le podomètre** et pose des « 📍 Je suis ici » en chemin, l'app relie ces repères pour estimer la distance parcourue, **en suivant les galeries du réseau** (et non la ligne droite, qui sous-estimerait massivement dans un labyrinthe ; repli ligne droite si un repère n'est raccordé à aucune galerie). Exemple : départ A → « je suis ici » en C → « je suis ici » en B, l'app compte A→C puis C→B. Cette part est **toujours annoncée comme estimée** (« 820 m dont 600 estimés ») dans la modale Tracker, les 📊 Stats globales et la fiche du carnet — elle ne se fait jamais passer pour une mesure. **Jamais compté comme trajet** : un clic carte pour corriger sa position, et une traversée de portail vers un autre plan. Si le podomètre a mesuré entre deux repères, c'est **lui** qui compte (jamais les deux à la fois).

⏱️ **Quand le calcul a lieu** (depuis v1.79.6 — à savoir si l'user s'étonne que sa distance change) : **pendant** la sortie, l'app compte à vol d'oiseau pour que « 📍 Je suis ici » reste instantané ; le calcul qui suit les galeries se fait **une fois, à l'archivage de la sortie** — la distance **augmente donc** à ce moment-là. Sur un plan très volumineux l'app renonce à ce calcul final et garde le vol d'oiseau plutôt que de se figer. 🧭 Le bouton **« Affiner le tracé »** (modale Session → section 📔) lance ce calcul à la demande, sans attendre la fin ; il affiche le nombre de tronçons en attente et se grise quand il n'y a rien à faire. ⚠️ Il **redessine aussi le trajet** en suivant les galeries : cette reconstitution suppose le chemin le plus court entre deux repères, donc **un détour ou un demi-tour n'y figure pas**. Elle s'affiche **dans la fiche de la sortie uniquement** (avec sa mention) — les **exports GPX/KMZ et la heatmap gardent le tracé réellement enregistré**.
- 📄 **Mode Histoire — plusieurs PDF par plan** (depuis v1.69.0) : jusqu'à **10 documents** par plan (avant : un seul, et un nouvel import écrasait le précédent). Les PDF déjà importés sont conservés (migration automatique). Les PDF **embarqués dans le ZIP** (le Générateur en accepte **plusieurs** depuis v1.71.0) apparaissent en tête de liste, consultables mais non supprimables — et sa présence **n'empêche plus** d'ajouter ses propres documents (c'était le cas avant). Garde-fous : avertissement au-delà de 25 Mo cumulés par plan, refus au-delà de 100 Mo. Ajout/suppression possibles depuis le Mode Histoire (plan chargé) **et** depuis 📔 Mon carnet → 📖 Récits. À l'export de session, **tous** les documents partent dans le ZIP ; à l'import ils sont **ajoutés** (plus d'écrasement). **Limites à annoncer honnêtement** : le carnet démarre VIDE en v1.69.0 (aucune reconstitution rétroactive possible) ; les photos ne sont pas dupliquées (références seulement — une photo supprimée affiche 🚫) ; purge automatique au-delà de 500 sorties. **Correction d'une info périmée** : le carnet **EST** inclus dans l'export/import de profil **depuis v1.74.0** (section à part entière, cochée par défaut — changer d'appareil transporte bien l'historique des sorties) ; et **depuis v1.81.0 les PDF du Mode Histoire voyagent aussi** — case « 📄 PDF du Mode Histoire » dans la fenêtre d'export, **décochée par défaut** (un plan peut porter 100 Mo de documents). **À savoir pour assister** : si un user dit « mes PDF ne sont pas revenus », demander s'il a coché la case à l'EXPORT — décochée, rien n'est parti, et l'import ne peut rien restaurer. 100 % local, aucun envoi.
- 🧙 **Générateur = assistant pas-à-pas** (depuis v1.72.1) : le Générateur (🏗️) guide étape par étape — Accueil (importer un ZIP / télécharger l'exemple / choisir Simple ou Avancé), puis pages Suivant/Précédent (les optionnelles se **Passent**), champs vérifiés à chaque étape, et **Résumé final** qui liste ce qui est rempli/passé/manquant + avertissements (ex. sans géoréférencement → Vue OSM et KMZ indisponibles). Un ZIP importé pré-remplit toutes les étapes. Bouton 🗒️ « Tout afficher » = ancien affichage une-page (mémorisé).
- 🗺️ **Convertir depuis un SIG** (depuis v1.75.0) : un export de logiciel SIG (QGIS…) devient un plan MyKTAMap. **Formats acceptés : `.geojson`, `.json`, `.kml`, `.kmz` vectoriel.** Points, tracés et zones sont repris. **OÙ ÇA SE LANCE (question fréquente)** : on dépose le fichier sur la zone **« 📦 Charger un nouveau plan » de l'écran d'accueil** — la même que pour les ZIP de plan — et le panneau « Convertir depuis un SIG » s'ouvre tout seul. Ça marche aussi depuis la zone d'import du **🏗️ Générateur**. ⚠️ Avant v1.75.2, l'accueil REFUSAIT ces fichiers (« le fichier doit être une archive .zip ») et seul le Générateur fonctionnait : si un user décrit ce refus, il est sur une version antérieure. **Pas besoin d'image de plan** : un fond vierge est généré et automatiquement calé sur les coordonnées du fichier ; l'user pourra le remplacer par une vraie image via « Modifier un plan ». **Écran de correspondance** : l'user choisit la colonne qui porte le type, puis dit à quoi chaque valeur de son fichier correspond dans MyKTAMap ; les valeurs reconnues sont pré-remplies mais **jamais imposées**, et les choix proposés sont **séparés par famille de géométrie** (un polygone ne se voit jamais proposer un type de tracé). ⚠️ **Contrainte à annoncer systématiquement** : le fichier doit être en **WGS84 / EPSG:4326** (coordonnées GPS classiques). Dans QGIS : *Exporter → Enregistrer les entités sous…* puis EPSG:4326 dans le champ SCR. Un fichier en **Lambert 93** (EPSG:2154) est **converti automatiquement depuis la v1.82.0** — un bandeau annonce le nombre de coordonnées reprojetées, et il faut vérifier que la position obtenue correspond bien au site. **Toute AUTRE projection** (UTM, Web Mercator…) est **refusée**, avec le nombre de coordonnées fautives — c'est volontaire, l'accepter placerait le plan à des milliers de kilomètres sans avertissement. **Limites à annoncer honnêtement** : trous (anneaux intérieurs) des polygones ignorés ; plafond 20 000 objets ; **Shapefile et GeoPackage NON gérés** (ils exigeraient des bibliothèques lourdes, incompatibles avec le 100 % hors-ligne — la réponse à donner est « réexporte en GeoJSON depuis QGIS »). 100 % local : aucun service de conversion, aucun géocodeur, aucune donnée envoyée.
- 🖼️ **Fond d'écran de l'accueil** (depuis v1.75.0) : l'user peut mettre **sa propre image** en fond de l'écran d'accueil à la place de la couleur du thème. Se règle dans la modale **Profil**, tout en bas avant les boutons d'export. **Trois réglages** : le **voile** (assombrit — ou éclaircit en thème clair — l'image pour garder les textes lisibles ; 0 % = image nue, 100 % = fond uni d'avant, défaut 55 %) et le **cadrage ↔ / ↕**. ⚠️ **Point à expliquer si on demande pourquoi la photo est coupée** : l'écran ne montre **jamais toute l'image** — elle est agrandie pour couvrir tout l'espace, le débord est rogné ; en portrait sur un téléphone, une photo paysage ne laisse voir qu'environ **un quart de sa largeur**. Les curseurs de cadrage choisissent quelle partie reste visible, et **seul celui de l'axe qui dépasse a un effet** (l'autre ne fait rien, c'est normal, pas un bug). L'image reste **sur l'appareil**, dans le même stockage que l'avatar, et disparaît si l'user réinitialise son profil. Son ré-encodage à l'ajout **supprime ses métadonnées**, dont le lieu de prise de vue. **Limite** : elle **ne voyage pas encore** avec l'export de profil.
- 📦 **Profil complet avec archives** (depuis v1.79.0) : la fenêtre d'export de profil a une section « 📦 Archives de plans » — cocher des plans mémorisés transforme l'export en **fichier .zip « profil complet »** (au lieu du JSON) qui embarque leurs archives ; à l'import elles sont réinjectées et rattachées automatiquement. **À savoir pour assister** : rien n'est coché par défaut ; garde-fou de taille avec confirmation (50 Mo iOS / 500 Mo ailleurs, jamais de blocage dur) ; une archive évincée par le navigateur est LISTÉE à l'export (pas de zip incomplet silencieux) ; en import « Fusionner » un plan qui a déjà son archive locale la garde ; quota plein = échec par plan avec bilan, le reste continue ; les plans en accès-fichier/re-sélection n'apparaissent pas (rien à embarquer, leur ZIP est sur le disque).
- 💾 **Récupérer le ZIP d'un plan** (depuis v1.75.0) : pour un plan isolé sans passer par l'export de profil. Si l'user a perdu le ZIP d'origine, il peut le **retélécharger depuis l'app** : modale **ℹ️ Infos** du plan → bouton **💾 Télécharger le ZIP**. **Ne fonctionne que si le plan a été « mémorisé dans l'app »** — sur un plan en « accès permanent au fichier » ou en re-sélection, le bouton est **grisé** avec l'explication (l'app ne détient rien, le fichier vit sur le disque de l'user). Autre cas à connaître : si le navigateur a **évincé l'archive** sous pression de quota, un message le dit franchement et il faut réimporter le ZIP d'origine. Plans serveur : pas de bouton, ils sont retéléchargeables.
- 🎨 **Couleur des types de la légende** (depuis v1.76.1) : l'user peut **changer la couleur** de chaque type built-in (tracés Principal/Secondaire/Chemin, zones Eau/Remblais/Effondrement/Inaccessible, structures Piliers/Mur/Fronts) : **≡ Légende → ✏️ Modifier**, un carré de couleur par ligne. La couleur s'applique **partout et immédiatement** — carte, exports image/PDF, KMZ, statistiques, rapport de session — sans recharger. Bouton **↺** = retour à la couleur d'origine. **Détails à expliquer si on demande** : les zones et piliers/murs ont **deux carrés** (fond + **bordure indépendante**) ; sans bordure choisie, une zone la dérive toute seule (teinte plus foncée) et un pilier/mur reste **noir** (défaut historique, modifiable depuis v1.76.1) ; les **entrées custom** s'éditent à chaud comme les built-in ; la zone **Inaccessible** recolorée **perd ses hachures** (le motif est une image fixe, non recolorable) et devient un aplat ; l'émoji du titre des **popups** (🟩…) ne suit pas la couleur choisie (limitation connue, cosmétique). Sauvegardé **par plan** dans la session. Un auteur de plan peut aussi livrer ses couleurs au niveau du plan (Générateur mode Avancé → 🏷️ Légende du plan).
- 🌍 **Overlay KMZ des grands plans** (depuis v1.76.4) : au-delà de ~8 192 px de côté, l'image du GroundOverlay est **réduite automatiquement** à l'export KMZ (Google Earth tronquait silencieusement au-delà de sa limite de texture) — plan **V2** : recomposée depuis la pyramide de tuiles (niveau ≤ 4 096 px) ; non-V2 décodable : downscale ; irréductible : l'app **demande** avant d'exporter (overlay amputé sinon) et conseille la conversion V2. Toast d'information quand une réduction a eu lieu.
- 🔍 **Netteté du widget OSM de l'accueil** (depuis v1.77.0) : zoomer dans l'aperçu OSM de l'accueil charge automatiquement des **tuiles plus détaillées** du plan (seulement la zone visible, plans tuilés V2 uniquement) — avant, le plan restait flou au zoom alors qu'il était net dans le mode OSM plein écran. Rien à configurer, aucune requête réseau supplémentaire (les tuiles viennent du ZIP déjà sur l'appareil). Si un user signale un plan flou au zoom dans l'aperçu : vérifier que le plan est **tuilé V2** (un plan V1 n'a pas de pyramide de tuiles).
- 🎨 **Couleurs personnalisées sur fond OSM** (depuis v1.77.0) : les couleurs de légende choisies par l'user (cf « Couleur des types de la légende ») s'appliquent désormais **aussi** dans les vues OSM — le mode OSM plein écran ET l'aperçu de l'accueil, chaque plan de la pile multi-plans avec **ses propres** couleurs. Avant, ces vues affichaient toujours les couleurs par défaut (ex. galerie principale verte malgré une couleur choisie).
- 🛠️ **Mode Développeur** (depuis v1.76.3) : ⚙️ Configuration HOME → section protégée par **mot de passe** (première activation, avertissement de responsabilité, 5 essais max). Contient : toggle **logs détaillés** (l'ancien réglage des ⚙️ Réglages carte a été retiré), **📋 Afficher les logs**, et **📚 Documentation technique** — les 22 documents du repo (README, BACKLOG, MATHS, RELEASE_GATE, architecture/) lisibles dans une modale liste→lecture (en ligne uniquement ; hors-ligne = message explicite).
- 🧭 **Confirmation de replanification** (depuis v1.76.3) : recaler sa position avec un itinéraire actif **demande confirmation** avant de recalculer (« Recalculer » / « Garder l'itinéraire ») — le calcul peut être long sur les grands plans. Exception : la validation de la dernière étape clôt l'itinéraire directement.
- 🔁 **Convertir la résolution** (depuis v1.76.2) : dans **📊 Éditeur de données**, une carte « Convertir la résolution » ouvre un outil autonome qui **migre les fichiers de données d'un ancien scan vers un nouveau scan du même plan** : résolutions source/destination (saisie ou 📷 auto-détection, images géantes OK), un ou plusieurs `.json`, téléchargés convertis en `_conv.json`. **Recalage optionnel** si les marges diffèrent : 1 repère commun (`xA,yA → xB,yB`) cloue la transformation + rotation optionnelle (° horaire) ; **2 repères** = échelle et rotation déduites (mêmes maths que le géoref). Refus nets : repère incomplet, repères à moins de 10 px. **Non converti** (à refaire sur le nouveau plan) : liaisons inter-plans, géoref, échelle.
- 🌍 **Choix de langue dès le premier écran** (depuis v1.79.4) : la gate du mot de passe porte un sélecteur **FR · EN · ES** (pré-sélectionné sur la langue du navigateur) — il pilote la langue **globale** de l'app, tout le funnel suit (gate légale, tutoriel, home). Et le **tutoriel est enfin multilingue** (26 cartes fr/en/es) : il suit la langue globale — son ancien toggle interne 🇫🇷/🇬🇧 a disparu (la modale Documentation garde le sien). **À savoir pour assister** : un user es voit désormais TOUT l'onboarding en espagnol ; changer de langue en cours de tutoriel = sortir et passer par ⚙️ Configuration.
- 📚 **Trois contenus longs, DEUX régimes différents — ne pas les confondre** (à jour v1.80.0) : **① la Documentation** (📖, ce guide) existe en **FR, EN et ES** — elle suit la langue de l'app, et son bouton drapeau permet de basculer entre les trois à tout moment (choix local, mémorisé). **② Le tutoriel** de bienvenue : FR/EN/ES aussi, mais il suit la langue **globale** sans toggle propre. **③ L'Aide intégrée** (❓, le 📚 de la barre latérale en mode carte) est elle aussi en **FR, EN et ES** depuis v1.80.0 (son contenu a été migré du code vers les dictionnaires). Elle suit la langue **globale** de l'app et **n'a plus de sélecteur de drapeaux** — comme le tutoriel. **Si un hispanophone signale « c'est en anglais »** : depuis v1.80.0 les trois contenus sont en espagnol. Faire préciser lequel, puis vérifier ① la langue de l'app (⚙️ Configuration) et ② pour la Documentation seulement, le bouton drapeau en haut de sa fenêtre (son choix est local et mémorisé, il peut avoir été mis sur 🇬🇧). Sur une version antérieure à v1.80.0, l'Aide en anglais était le comportement normal. ⚠️ Ne jamais affirmer que l'app entière est en espagnol : l'**interface** l'est à 100 %, ces contenus longs sont un cas à part.
- ❓ **Aide intégrée — deux réparations visibles** (v1.80.0) : la fiche **« 👤 Mode profil »** n'apparaissait dans aucune ligne du hub (elle était collée à « 📚 Bibliothèque de plans », qui servait les deux sujets d'un coup) — elle a désormais sa propre entrée. Et la **version anglaise ne documentait pas la bibliothèque de plans** (épinglage, tags, filtre, renommage, suppression — livrés en v1.78.0/v1.79.1) : la section a été écrite. **À savoir pour assister** : si un user dit « je ne trouve pas l'aide sur le profil / sur les tags », il est probablement sur une version antérieure à v1.80.0.
- 🕳 **« Mon itinéraire est plus long qu'avant »** (v1.83.0) : c'est attendu, et c'est une **correction**. Un puits entre deux étages était mesuré **à plat** — sa longueur dans le plan, pas sa vraie longueur. Dès que les profondeurs des niveaux sont renseignées, il est compté pour ce qu'il est. L'itinéraire proposé peut aussi **changer de chemin** : un détour à plat devient parfois plus court qu'une descente. **Sans profondeurs renseignées, rien ne change.**
- 📉 **« Où est-ce que je saisis la profondeur des niveaux ? »** (v1.83.0) : deux endroits. Au **Générateur**, sous la case multi-niveau (profondeur du niveau 0 et pas entre étages) — la valeur voyage alors avec le plan. Ou dans un plan ouvert : la pastille **`Niv X`** sur la carte, puis **📉 Profondeur des niveaux** en bas de la fenêtre. La saisie par plan **prime** sur celle du Générateur. ⚠️ La pastille n'existe que si le plan est **multi-niveau**.
- 📊 **« Je n'ai pas de profil en long »** (v1.83.0) : il faut deux choses — des **profondeurs renseignées** (voir ci-dessus) et une **échelle calibrée** sur le plan. Sans l'une ou l'autre, l'écran le dit au lieu d'afficher un graphe vide. Le bouton est dans le panneau d'itinéraire, une fois le trajet calculé.
- 🌍 **« Mon KMZ flottait au-dessus du sol dans Google Earth »** (corrigé en v1.83.0) : l'altitude était écrite à zéro, le relevé se posait donc **à la surface**. Il descend maintenant à sa profondeur, **si elle est renseignée**. À noter : le **GPX n'a volontairement pas d'altitude** — le champ `<ele>` y désigne une hauteur au-dessus du niveau de la mer, que l'app ne peut pas connaître ; la profondeur est écrite dans la description du point.
- 👣 **« Mon compteur de pas monte alors que je ne bouge pas »** (corrigé en v1.82.1) : c'était un vrai bug, sur les plans créés depuis un **GPX, un KMZ ou un SIG**. Le seuil de détection du podomètre y était écrit à 1,2 au lieu de 13 ; or la mesure inclut la gravité (~9,81 au repos), donc le seuil était franchi **en permanence** — un pas toutes les 280 ms téléphone posé, soit près de 10 km/h de distance imaginaire. **Les plans déjà créés sont réparés automatiquement à l'ouverture**, il n'y a rien à régénérer. Les distances déjà enregistrées dans le Carnet, elles, restent fausses : elles ne peuvent pas être recalculées après coup.
- 💾 **« Mes réglages de pas reviennent par défaut »** (corrigé en v1.82.1) : la taille du pas, le seuil, le cooldown et la position de départ n'étaient enregistrés nulle part. Ils sont désormais conservés **par plan** — un réglage fait sur une carrière ne déborde pas sur les autres.
- 🏗️ **« Il manque des étages à l'ouverture du plan »** (changé en v1.82.1) : l'app n'affichait que les niveaux -1, 0 et +1. Elle les affiche maintenant **tous**. Pour revenir à l'ancien comportement — utile sur un gros relevé qui rame — décocher « Afficher tous les niveaux au lancement » dans les réglages de performance du menu d'accueil. La Vue OSM suit le même choix.
- 📏 **« Mes distances ont changé après la mise à jour »** (v1.82.0) : c'est attendu, et c'est une **correction**. Sur les plans créés par l'import **SIG ou GPX**, l'échelle était figée à une valeur en dur sans rapport avec le terrain — les distances affichées étaient donc fausses, parfois d'un facteur 15. Elles sont désormais justes. **Un plan créé AVANT la mise à jour garde son ancienne échelle** : il faut le régénérer depuis le fichier source. Les plans faits à partir d'une image scannée ne sont pas concernés.
- 🗺️ **Import d'un export QGIS / SIG** (v1.82.0) : le **Lambert 93** (le système français, coordonnées en mètres type 650000 / 6860000) est maintenant **converti automatiquement** — un bandeau dit combien de coordonnées ont été reprojetées, et il faut vérifier que la position obtenue correspond bien au site. Les **autres** projections (UTM, Web Mercator) restent refusées : il faut réexporter en EPSG:4326. L'écran permet aussi de choisir une **colonne de niveau** (chaque étage garde le sien, avec sa couleur) et de ranger chaque type dans la famille voulue — un polygone peut devenir une zone, un pilier ou un front de taille. **Si un utilisateur dit « tout est sur un seul niveau »** : la colonne de niveau n'a pas été choisie à l'import. 🏷️ **La légende personnalisée sur cet écran** (bouton « Nommer et colorer les niveaux ») **part EN ENTIER dans le plan généré depuis la v1.83.1** : noms et couleurs des types, entrées masquées, entrées ajoutées à la main. ⚠️ Avant la v1.83.1, seuls les noms des niveaux survivaient — renommer un type built-in, en masquer un ou en ajouter un était perdu à la génération, sans message : **si un user décrit cette perte, il est sur une version antérieure**. **Si l'écran affiche « Légende réinitialisée »** : un changement de correspondance a périmé les noms saisis (l'identifiant d'une entrée encode le routage), il faut rouvrir 🏷️ avant de générer — sinon le plan sort avec les libellés par défaut.
- 🏗️ **Vue OSM : filtrer par niveau** (v1.82.0) : sur un plan multi-niveaux, les étages étaient tous dessinés les uns sur les autres. Des boutons d'étage sont apparus dans les filtres (🎚️) ; un premier clic **isole** l'étage choisi. **Si quelqu'un dit « il manque des structures en Vue OSM »** sur une version antérieure : c'était un bug (les types personnalisés en ligne étaient exclus), corrigé en v1.82.0 — mettre à jour et régénérer le plan.
- 📐 **« Écart de calage » d'une liaison — ce que c'est, et ce que ce n'est PAS** (v1.81.0) : dans 🌀 **Mes liaisons** et dans les filtres de la **Vue OSM**, chaque liaison entre deux plans peut afficher un écart en mètres. **Ce n'est pas une distance à parcourir** : les deux bouts d'un portail désignent le **même endroit physique** vu depuis deux plans, donc l'écart mesure à quel point les deux plans sont mal calés l'un par rapport à l'autre. **Plus le chiffre est petit, mieux c'est.** Il n'apparaît que si **les deux** plans sont géoréférencés — sinon rien ne s'affiche (ce n'est pas un bug : la mesure est impossible, et afficher « 0 » laisserait croire à un calage parfait). **Aucun code couleur** : 20 m est énorme sur une petite carrière et négligeable sur un réseau de 5 km — c'est à l'utilisateur de juger avec son échelle. Si un chiffre paraît aberrant, la piste est **le géoréférencement d'un des deux plans**, pas la liaison.
- 📝 **Vue OSM de l'accueil : le travail de session s'affiche** (v1.81.0) : avant, cet écran ne montrait que ce qui est **enregistré dans le plan** — les points, tracés, zones et structures créés en cours de session restaient invisibles, ce qui faisait croire à une perte de données. Ils apparaissent maintenant, et leur fiche précise « Session en cours — pas encore dans le plan ». Un bouton **📝 Session** permet de les masquer pour comparer. **Si un utilisateur d'une version antérieure dit « mes points ont disparu de la Vue OSM »** : ils ne sont pas perdus, c'est ce comportement — mettre à jour, ou vérifier le plan en mode carte. ⚠️ Un plan dont le fichier n'est plus récupérable n'affiche rien du tout, session comprise.
- 🌀 **Icônes « portail » invisibles en Vue OSM** (corrigé en v1.81.0) : sur les versions antérieures, un point portant le tag **portail** (ou **entrée de plan**) s'affichait en Vue OSM comme un **petit rond jaune** au lieu de son icône. Mise à jour = correctif. ⚠️ À ne pas confondre avec le cas normal : le marquage d'un point lié est un **choix de l'utilisateur** — un point lié garde le tag qu'on lui a donné, il faut poser le tag « portail » soi-même pour obtenir l'icône vortex.
- 🏷️ **Organisation de la liste de plans** (depuis v1.78.0) : trois outils au-dessus/dans la liste 📚 Mes plans de l'accueil — **🔎 filtre par nom** (live, remis à zéro à chaque visite), **⭐ épinglage** (l'étoile de la ligne remonte le plan en tête, re-clic pour désépingler), **🏷️ tags** (édition dans ℹ️ Infos → « Tags du plan », saisie séparée par virgules, 12 max de 24 caractères ; chips-filtres au-dessus de la liste dès qu'un plan est tagué, multi-sélection en OU). **À savoir pour assister** : les tags/épinglages vivent dans l'app (registre local) — ils ne voyagent PAS avec un ZIP partagé, mais suivent l'export de profil et l'export 💾 de la liste (.config) ; la rangée de chips est invisible tant qu'aucun plan n'est tagué (pas un bug) ; les filtres nom/tags sont temporaires (session). **Suppression = purge des données associées** (v1.79.3) : retirer un plan via ℹ️ Infos supprime AUSSI sa session auto, son géoréférencement, ses photos et ses backups (le confirm liste tout) ; sont CONSERVÉS le carnet, les récits (PDF/notes Histoire) et les liaisons — l'historique survit aux plans. **Backups : FIFO 10 PAR PLAN** (v1.79.3 — avant : 10 tous plans confondus). **🧹 Données orphelines** (v1.79.3) : dans ⚙️ Configuration → 📊 État mémoire, une section liste les données (sessions, géoref, archives, photos, backups) liées à des plans qui ne sont plus dans la liste (profil ancien) et PROPOSE leur nettoyage — jamais automatique, car une session orpheline redevient utile si l'user réimporte le ZIP ; carnet et récits exclus par design. **Le ✕ de suppression a disparu des lignes** (v1.78.0) : la suppression vit en FIN de la fenêtre ℹ️ Infos (bouton 🗑️ + confirmation) — si un user cherche « comment retirer un plan », c'est là ; retirer n'efface pas le ZIP du disque mais purge l'archive mémorisée dans l'app, les tags et l'épinglage. **✏️ Renommer un plan** (v1.79.1) : dans ℹ️ Infos, section « Renommer l'affichage » — nom LOCAL (différencier deux plans homonymes, cas « deux Catacombes d'auteurs différents ») ; le vrai nom du plan-config n'est PAS modifié (les vérifications de re-sélection de ZIP et la détection de doublon s'y réfèrent toujours) ; champ vide = retour au nom d'origine ; le filtre 🔎 de la liste matche les DEUX noms ; suit l'export de profil. **Popup doublon** (v1.79.1) : à l'import frais d'un ZIP dont le nom matche un plan local existant, la popup « Ce plan existe déjà » propose TOUJOURS Mettre à jour / Garder les deux / annuler (avant : silencieusement écrasé si même version) ; « Garder les deux » avec nom+version identiques suffixe l'identifiant interne.
- 🧹 **Dédoublonner les données** (depuis v1.77.0) : dans **📊 Éditeur de données**, carte « Dédoublonner les données » — retire les **sommets identiques consécutifs** (x, y et niveau) des tracés, zones, structures et mesures d'un ou plusieurs `.json` (calque ou session exportée), téléchargés nettoyés en `_dedup.json` avec bilan chiffré. Contexte : un bug du mode « clic carte » (corrigé en v1.77.0) empilait N sommets confondus par clic dans les sessions dessinées après plusieurs changements de plan sans recharger la page — invisibles à l'écran, fichiers/exports gonflés. **À savoir pour assister** : les POI ne sont jamais touchés (superposition volontaire légitime) ; un objet n'est supprimé que si le nettoyage l'a vidé (tracé/ligne < 2 sommets, zone/polygone < 3), jamais un objet déjà petit sans doublon ; deux sommets même x/y mais niveaux différents sont conservés.
- 🎯 **Relever les coordonnées GPS de surface** (depuis v1.85.0) : **en Vue OSM uniquement** (aperçu de l'accueil ET plein écran d'un plan ouvert), un bouton 🎯 arme un mode où **un clic sur la carte donne la latitude et la longitude du point de surface**, avec un bouton pour les copier. **Pourquoi seulement là** : en mode plan un clic donne des pixels, qu'il faudrait projeter par le géoréférencement ; en Vue OSM la carte est géographique, la coordonnée est directe. ⚠️ **Réserve à annoncer** : la coordonnée est exacte pour le point de la carte, mais « juste au-dessus de cette galerie » dépend du **géoréférencement du plan** qui la porte — un plan mal calé déplace ses galeries, pas la carte. 100 % local : aucun géocodeur, aucune requête, la copie va dans le presse-papier.
- 📏 **Mesurer en Vue OSM** (v1.83.0, étendu au mode plan en v1.85.0) : distance géodésique et surface, en cliquant sur la carte. Disponible dans **les deux** vues OSM depuis la v1.85.0 (avant : aperçu de l'accueil seulement). **À annoncer si on demande** : une mesure faite là est **structurellement plus fiable** qu'en mode plan, car elle ne dépend d'aucun calibrage d'échelle. Les deux outils (📏 et 🎯) sont **exclusifs** : armer l'un désarme l'autre.
- 🔄 **Corriger un calque de données sans quitter la carte** (depuis v1.85.0) : un **calque de données** (le relevé livré dans le ZIP du plan) est en **lecture seule** et ne peut pas s’éditer en place — il est dessiné une seule fois au chargement, sans mécanisme de re-rendu. Pour le corriger : **🔍 Filtres → section Calques → bouton « 🔄 Modifier »**. Son contenu est copié dans la session, où tous les outils habituels s’appliquent (notamment **🔄 Convertir cet objet** : sur la fiche d’un tracé, d’une zone ou d’une structure de SESSION, un bouton change son type et au besoin sa famille — un front de taille devient une galerie, une zone devient un pilier. **Règle stricte** : un vecteur OUVERT ne peut devenir que tracé ou front de taille, un vecteur FERMÉ que zone ou pilier/mur ; la traversée est refusée, car fermer ou ouvrir une géométrie serait inventer de la donnée relevée sur le terrain. La géométrie, le niveau et la note sont conservés. ⚠️ Ne marche PAS sur un objet de calque de données : il faut d’abord le rapatrier, cf. ci-dessus). Le calque d’origine est alors **masqué automatiquement** et sa case porte « (en cours de modification — afficher quand même) » : c’est ce qui évite de voir les objets en double. **« ↩️ Restaurer »** annule tout et retire la copie ; **« 💾 Exporter »** produit un fichier à redonner au plan — dans 🏗️ Générateur → « Modifier un plan », sur **la ligne de ce calque**, bouton « Choisir ». La ligne EST le calque, donc le fichier REMPLACE l’ancien contenu : aucun doublon n’est possible. **Détails à donner si on demande** : l’app **annonce le poids avant** (un gros relevé peut peser plus d’1 Mo dans la session, dont la limite navigateur est d’environ 5 Mo tous plans confondus) ; les objets que l’utilisateur a **dessinés lui-même** pendant la session ne partent PAS dans l’export du calque (ils ne lui appartiennent pas) et leur nombre est annoncé ; **« Effacer la session » restaure** les calques ouverts à la modification (sinon le relevé disparaîtrait) ; si la copie de session est introuvable au chargement, l’app **réaffiche le calque** au lieu de le masquer. **Si un utilisateur dit « je vois tout en double »** : il a re-coché la case du calque remplacé — c’est volontairement possible, pour comparer avant/après.
- 🧳 **La légende voyage avec les exports** (depuis v1.76.1) : un **calque de données** exporté depuis une session emporte la **définition des types custom qu'il utilise** (noms, couleurs, géométries) — le Générateur la récupère au ré-import (**ce qui existe déjà dans le plan garde la priorité**, un calque n'écrase jamais la légende de l'auteur). Le JSON de session et le ZIP Avancé (`session_legend.json`) l'emportent aussi, et l'option « Légende personnalisée » des exports KMZ/GPX embarque désormais **plan + session fusionnés** (avant : plan seul → option grisée pour une légende créée en session, cas de tout utilisateur terrain). **Si des objets utilisent un type disparu** (entrée supprimée, vieux calque d'avant v1.76.1, ou type brut hérité type « Bas »), la modale ≡ Légende l'annonce par un **bandeau ⚠️ « types orphelins »** avec le compte et un bouton **« ➕ Lier »** par type : il ouvre la dialog d'ajout pré-remplie avec l'identifiant EXACT du type (catégorie verrouillée) — l'entrée créée raccroche immédiatement les objets. Sans liaison, ces objets sortent en couleur de repli (blanc/gris).
- 📐 **Géoréférencement — 3e point optionnel** (depuis v1.73.0) : en plus des 2 points de calibrage GPS historiques (A et B), un **point C facultatif** dans ⚙️ Réglages → Géoréférencement (ou dans le Générateur). Avec C, l'app corrige la **déformation globale** du plan (échelles X/Y différentes, cisaillement) — utile sur un **assemblage** de plusieurs plans qui se projette mal. En profitent : la Vue OSM, les exports KMZ/GPX et le Mode Secours. **Contrainte** : C doit être **loin de la ligne A-B** (un C aligné est refusé). **Limite à annoncer honnêtement** : ça corrige une déformation d'ensemble — si chaque morceau de l'assemblage a sa propre erreur, le résultat s'améliore sans être parfait partout. Sans point C, le comportement est **strictement identique** à avant.
- 🏗️ **Mode serveur « kiosque »** (depuis v1.73.0) : une instance auto-hébergée (association, club, site) peut personnaliser son **sous-titre** et **masquer l'import de plans et/ou le Générateur** pour ne proposer que ses propres plans. Si un user constate que le bloc « Charger un nouveau plan » ou le bouton 🏗️ est absent, ce n'est **pas un bug** : c'est le choix du déployeur de cette instance. Les outils et les données personnelles de l'user restent intacts (mais **depuis v1.90.1, l'import de profil est refusé** quand `serverPlansOnly` est actif — l'export, lui, reste ouvert). Config via le fichier `data/index.json` du serveur (page `confadmin.html` pour le générer) — **aucun backend, aucune donnée envoyée**.
- 🔄 **Réimport d'un plan regénéré** (depuis v1.73.1) : importer un ZIP de **même nom + même auteur** qu'un plan déjà présent dans la liste mais de **version différente** ouvre un choix — **🔄 Mettre à jour** (l'entrée existante et son archive mémorisée sont remplacées ; **session, notes et liaisons inter-plan conservées** ; photos remplacées seulement si le nouveau ZIP en contient), **➕ Garder les deux** (comportement d'avant), ou **Annuler** (choix par défaut sur ✕ / Échap / clic à côté — jamais d'écrasement accidentel). À savoir : nom **ET** version identiques = mise à jour directe sans question (comportement historique). Pas de question pour les plans serveur ni à la re-sélection du fichier d'un plan précis depuis la liste.
- 🛡️ **Une modale coupe l'outil en cours** (depuis v1.73.1) : ouvrir une fenêtre (Réglages, Filtres, Documentation, Mode Secours…) pendant une **mesure, édition de points, tracé, zone, structure ou recalage** désarme le mode. Avant, il restait armé derrière la fenêtre → clics fantômes sur la carte à la fermeture. Le **tracker n'est jamais coupé** (il tourne en fond, ce n'est pas un mode de clic), et la fiche d'un point qu'on vient de poser n'interrompt pas l'édition (enchaînement de points préservé).
- 👁️ **Vue OSM — calques masqués par défaut** (corrigé en v1.73.1) : un calque de données livré « décoché » dans le ZIP d'un plan était **totalement invisible en Vue OSM**, sans aucun moyen de l'afficher (la Vue OSM n'a pas de case par calque). Il est désormais rendu comme les autres et se filtre via les chips de catégorie (globaux et par plan) ou les tags. La Vue OSM ouverte **depuis un plan chargé** n'est pas concernée : elle a toujours suivi les calques réellement affichés sur la carte.
- 📊 **Éditeur de données du plan** (refondu v1.48.0, **4e source v1.69.0**) : édition en tableau depuis 🗺️ plan en cours, 📦 ZIP de plan, 📄 fichier JSON seul (depuis le HOME : ZIP et JSON uniquement), plus **🔗 Fusionner des calques de données** — cette dernière entrée a quitté l'accueil en v1.69.0 pour rejoindre l'éditeur (allègement du HOME) ; elle combine plusieurs fichiers de calques en un seul, sans toucher au plan. Les points s'éditent entièrement ; tracés/zones/structures : note, type et niveau seulement (géométrie en lecture seule). Les modifications se téléchargent en `.json` à réimporter dans le Générateur 🏗️ — jamais appliquées en direct ; seule la session peut être remplacée en live.
- 🖼️ **Export PNG** : Mode rapide / Mode avancé (avec légende, calques au choix, résolution)
- 🌍 **Export KMZ géolocalisé** (depuis v170) : onglet de 💾 Export Session. Calibrage par 2 points (x/y plan ↔ lat/lng GPS), puis génération d'un `.kmz` ouvrable dans Google Earth, OsmAnd, Locus, Avenza… Transparence du plan réglable, contenu sélectionnable finement (par tag, type de tracé, type de zone), multi-niveau géré (1 dossier par niveau). Calibrage mémorisé par plan.
- 📤📥 **Import + Export GPX** (depuis v1.14.0) : format GPX 1.1 standard (TopoDroid, OsmAnd, Avenza, Garmin…). Même calibrage GPS que le KMZ. Export : 💾 → onglet 📤 GPX. Import : sidebar gauche → ⬇️ Charger → 📤 GPX (aperçu avant confirmation, annulable Ctrl+Z). Un aller-retour MyKTAMap↔MyKTAMap préserve niveaux et types de tracés.
- 🎚️ **Refonte UX loader** (depuis v172) : la liste 📚 Mes plans a été simplifiée et enrichie :
  - **Toggle "🌐 Afficher les plans serveur"** persisté par localStorage — l'user peut cacher les plans serveur découverts auto (test1, test2, démos…) pour ne voir que ses plans persos. Recocher = ils réapparaissent intacts (filtre d'affichage seulement, pas de suppression).
  - **Badges modes V1/V2/M-LVL + storage (✅/🔐/📁) sur ligne 2** (sous le nom). Depuis v1.71.0 : le **numéro de version n'est plus affiché dans la liste** (il vit dans la modale ℹ️ Informations), et il n'y a **plus de bouton ▶️** — cliquer n'importe où sur la ligne du plan le charge (les boutons restants : ℹ️ infos, ✕ retirer). Les titres longs passent sur 2 lignes au lieu d'être tronqués.
  - **Bouton ℹ️ Infos détaillées** par plan : nouvelle modale qui liste TOUS les attributs (id, nom, version, auteur, type, fichier source, taille, persistance, mode, perfPreset, dates) sous forme de tableau 2 colonnes. Remplace l'affichage compact sub/date qui surchargeait la liste.
  - **"💾 Mémoriser ce plan dans l'app" coché par défaut** sur mobile/Safari/Firefox (avant : décoché par défaut → l'user oubliait souvent → re-sélection requise à chaque chargement).
- 📐 **Réglages responsive PC** (depuis v172) : la modale ⚙️ Réglages passe en layout 2 colonnes sur ≥1024px (pattern identique à la modale Doc/Aide). Sur mobile : strictement inchangée (1 colonne 440px).
- 🗝️ **Accès restreint communautaire** (depuis v173) : barrière au démarrage, l'app demande un mot de passe unique commun à tous les users autorisés. Vérifié 1 fois à la 1ère installation, mémorisé en localStorage ensuite. Re-demandé après reset complet (le mdp est alors affiché dans la modale Reset pour ne pas perdre l'accès). 5 tentatives ratées → lockout permanent jusqu'à désinstallation manuelle de l'app. Barrière SOCIALE / communautaire — ne remplace PAS une vraie auth (le code source HTML/JS est public).
- 🛣️ **« Je suis perdu » enrichi** (depuis v173) : en plus du cercle de zone théorique, l'app surligne en rouge clair les segments de galeries réellement atteignables depuis la dernière position connue dans le temps écoulé (calcul sur le réseau de tracés, multi-niveau géré) + portée max affichée dans le rapport copiable.
- 🛡️ **PerfUltra "Limiter dézoom mobile"** (depuis v173) : 7ème toggle dans le mode Performance ULTRA. Coché par défaut = comportement v172 (limite anti-OOM). Décoché = traite le mobile comme un PC dans le calcul minZoom (gagne 1-2 niveaux de dézoom selon taille du plan). Reload requis. Premier toggle PerfUltra avec default true.
- 📐 **Icônes adaptatives au zoom** (depuis v1.7.1) : les icônes des points (puits, accès, signalétique, etc.) gardent une taille relative au plan constante au lieu de la taille écran fixe Leaflet par défaut. Au dézoom, elles rétrécissent ; au zoom in, elles grossissent. Clamp 0.25 → 2× pour éviter les extrêmes (invisible ou énorme). Toggle dans ⚙️ Réglages → 🔍 Affichage (default ON, reload requis pour changement).
- 🔍 **Double-clic sur un marker → zoom flyTo** (depuis v1.7.1) : un seul clic ouvre le popup (inchangé), un double-clic rapide (< 500ms) fait un flyTo smooth (0.6s) sur le point au zoom +2 clampé. Le popup éventuel est fermé pendant le flyTo. Ne s'applique pas au tracker ni au mode urgence (comportements spécifiques préservés).
- 🔢 **Nouveau format de version semver-like** (depuis v1.7.1) : passage de vNNN (v173) à vX.Y.Z (v1.7.1). X = MAJOR (1 actuel, 2 quand backend), Y = MINOR (évolutions majeures), Z = PATCH (debug/UX). Mapping rétroactif des MINOR dans le README.md journal.
  - 🪫 **V2.1 — Indicateur de batterie + alertes graduelles**. Module `js/batteryGuard.js` (~280 lignes IIFE) → `window.BatteryGuard = { init, forceCheck, getState, onChange, getStatusLabel, isAvailable }`. Source : Battery Status API (`navigator.getBattery()`) dispo Chromium uniquement (Android/PC). Affichage à 3 endroits : chip header (à côté des compteurs session, sortie de la zone hover sidebar), footer modale 📋 Session active, bloc 🔋 ÉTAT du mode urgence. Warnings graduels 20%/10%/5% via toast `OOMGuard.showToast` + persistance localStorage par seuil par cycle de décharge (pas de spam). Anti-flicker : throttle 5s entre `change` events + polling 30s de secours. Gracieux fallback si API absente (Safari iOS, Firefox récents) : `display: none` complet sans message d'erreur. Permissions-Policy nginx `battery=(self)` ajouté à `docs/nginx-csp-config.conf`. Sync forcée au boot : 4 attempts cascade dans `main.js > lancerApplication` (immédiat + 300ms + 1s + 3s).
  - 📊 **V2.2 — Stats session enrichies + ⬛ Mesure de surface (bonus)**. Stats agrégées dans la modale 📋 Session active : total + breakdown par type (📍/🛣️/⬛/🏛️) + distance cumulée des tracés (auto m→km) + **surface cumulée des zones** (auto m²→ha) + photos POI + durée session (`window._sessionStartTs` posé dans `main.js > lancerApplication`). Multi-niveau (M-LVL) : breakdown additionnel par niveau. Boutons 📋 Copier + 💾 Export TXT. Helpers ajoutés à `js/utils.js` : `formatSurface(m2, dec)`, `polygonArea(points)` (shoelace plan), `polygonAreaM2(points)` (via `APP_CONFIG.scale`). **Bonus surface** : refonte `js/measure.js` avec 2 modes — 📐 distance (legacy polyline) + ⬛ surface (polygone shoelace). Toggle 📏/⬛ dans groupe Mesure. Label adaptatif `📐 Distance: X m` ou `⬛ Surface: X m²`. API publique : `window.setMeasureMode("distance"|"surface")`, `window.getMeasureValue()`. Persistance complète dans `sessionPersist.js` (champs `measureMode` + `measurePoints`, restore order : `setMeasureMode` AVANT `setMeasurePoints`).
  - 🎬 **V2.3 — Replay tracker + Export CSV**. Instrumentation `js/tracking.js` : `_trackingTimeline = []`, `_trackingStartTs = null`, `_pushTimelinePoint(type)` helper (type ∈ `{start, pdr, recalage}`). 4 sites instrumentés : `startTracking`, click recalage, `avancer` (PDR pas applied), `recalerTrackerSurPoint`. API publique exposée : `window.getTrackingTimeline()`, `getTrackingStartTs()`, `getTrackingDistanceM()`, `resetTrackingTimeline()`. Nouveau module `js/trackerReplay.js` (~500 lignes IIFE) → `window.TrackerReplay = { ouvrir, fermer, exporterCSV }`. Modale plein écran avec slider timeline + play/pause/restart/end + vitesse 0.5×→10× + raccourcis clavier (Espace, ← →, Échap). Mode compact (bottom sheet) activé auto au Play pour libérer la carte. Bouton ⛶ toggle compact/normal manuel. Trail multi-segments (skip recalage = téléportation). Marker mobile `L.circleMarker` jaune. Export CSV : `timestamp_ms_epoch,delta_ms_since_start,x_plan,y_plan,type[,level]`. Reset dans `main.js > _libererRessourcesPlanPrecedent` au plan switch.
  - 🔥 **V2.4 — Heatmap** : module `js/heatmap.js` (~380 lignes IIFE) — ⚠️ **ACTIF** (désactivé en v1.12.0, **RÉACTIVÉ en v1.21.2** sur décision KARMA ; état revérifié dans le code le 01/08/2026 : chargé par `index.html`, présent dans `sw.js > ASSETS_TO_CACHE`, bouton 🔥 dans le menu Tracker, consommé par 13 modules). Visualise la **densité de points** sur le plan : canvas overlay + gradient bleu→vert→jaune→rouge. **3 sources togglables** (timeline du tracker / points ajoutés en session / points des calques de données), sliders rayon (10-120 px) et intensité (0.2-3×). Également intégrée au **Mode Secours** (bloc Heatmap avec bouton ⚙️ Régler). Accès : menu 🧭 Tracker → 🔥.
  - 🩹 **Fixes v1.12.0** : 🚨 mode urgence rotation paysage (3 retries `invalidateSize` cascade 80/300/700ms + refit bounds + CSS `@media orientation: landscape`) · 🚨 mode urgence crash gros plan + itinéraire (skip itinéraire >500 pts, sinon décimation 1 pt/N pour cap 100 pts, cap total 5000 pts) · 🚨 toggle ☑️ 🗺️ **Itinéraire dans la minimap** (header, persistance localStorage `myktamap_emergency_show_iti_v1`, rendu cyan vif weight 6 + halo blanc weight 10) · 🧭 bouton 📍 **Recalage** : auto-close après click + restore explicite `g.btnPrincipal.dataset.iconeOriginale` avant `_setGroupeModeActif(tracker, true, null)` qui ne touche pas l'icône sinon · 🔐 modale PIN proposal hauteur fixée (`.kta-pin-proposal-boite { height: auto !important; max-height: 90vh !important }` pour override `.kta-readme-modal-boite { height: 88vh }`) · 📱 en-tête mobile : 5 compteurs (📍/🛣️/⬛/🏛️/📸) regroupés en 1 chip 📊 cliquable ouvrant la modale Session · 🪫 chip batterie sortie de `kta-refonte-counters-btn` pour ne pas être surlignée en hover sidebar · 🪫 chip masquée complète (display: none) si API indispo au lieu d'afficher `?` · ⚡⚡ double éclair fix (emoji retiré de `_formatLabel`, gardé uniquement dans `_computeEmoji`).
  - 📤 Export PDF dans **⬆️ Enregistrer → 📤 PDF imprimable**. Formats A0/A1/A2/A3/A4 × portrait/paysage. Calques granulaires (1 case par `imageLayers` + 1 case par `dataLayers` du plan, pré-cochage = visibilité actuelle). Légende = overlay 4-coins (↖/↗/↙/↘) avec 3 tailles (compact 16px / standard 22px / large 30px) et 4 styles (Pro fond blanc *défaut* / sombre opaque / sombre semi / filigrane). Pipeline canvas réutilise `_genererCanvasExport` via wrapper public `window.MyKTAMapExporterGenererCanvas`. Mojibake emoji jsPDF Helvetica contourné par rendu de la légende en image canvas avant collage. Module : `js/pdfExport.js`, ~700 lignes, lib `lib/jspdf.umd.min.js`.
  - 🔍 Recherche unifiée (Ctrl/Cmd+K depuis n'importe où dans l'app) — couvre désormais 4 catégories : 📍 Points · 🛣️ Tracés · ⬛ Zones · 🏛️ Structures (session + embedded data layers). Résultats groupés par catégorie avec compteurs. Nouveau filtre "Catégorie" en plus des filtres legacy "Calques" et "Tags" (points-only). Au clic : centre + flash polyline dashed jaune (tracés/fronts) ou polygon transparent (zones/piliers/mur) 4 sec + popup info. Module : `js/searchPoints.js`, 832→1050 lignes. API publique (`SearchPoints.getAllPoints`/`findByQuery`) inchangée pour préserver Pathfinder + Itinéraire.
  - 🏛️ Fix structures embedded : trou découvert post-update v1.9.3, les piliers/mur/fronts dessinés dans un data layer (`structure.json`) étaient visibles sur la map mais manquaient dans `utils.js > telechargerPlan` (export PNG rapide ⚡) ET dans `exporter.js > _genererCanvasExport` (export PNG avancé 🎨 + PDF 📤). Désormais inclus partout, avec tri Z correct (mur < pilier-2 < pilier-1 < front-2 < front-1) + filtre WYSIWYG niveau.
  - 🗺️ Légende enrichie : section 🏛️ Structures dans la légende in-app (interface.js > afficherLegende), dans la légende exportée PNG (case `leg_c_structures` dans la modale Avancé), et dans le PDF (automatique via canvas).
  - 🌐 Migration domaine : 34 fichiers patchés (modules JS, HTML, docs, LICENSE). 2 préservés volontairement : `docs/nginx-redirect-old-domain.conf` (conf serveur de transition) + `docs/alert-migration-domaine-sauvegarde.json` (archive alerte).
  - 🚨 Mode urgence : `MINIMAP_ZOOM_OFFSET` ajusté à 5 (équilibre lisibilité ↔ horizon ~20-50m).
  - 🖼️ Modale Export images renommée : « Exporter le plan » → « Exporter en PNG/JPG » pour clairement distinguer du nouveau « Exporter en PDF imprimable ».
- 🧭 **Calibration Nord par plan** (v1.37.0) : le générateur avancé permet de définir l'angle du Nord réel du plan (un plan scanné est rarement orienté Nord en haut) ; la boussole et le tracker en tiennent compte automatiquement.

- 📖 **PDF Histoire — générateur avancé (v1.37.0)** : permission d'embarquer un PDF Histoire directement depuis le générateur avancé (section dédiée après Géoréférencement, input file `accept="application/pdf"`, embed dans `data/histoire.pdf` + écriture `plan.histoirePdf = "data/histoire.pdf"`). Conservation du PDF existant en mode Modifier via `_plannerOrigAssets` + `dataset.existing`, bouton "🗑 Retirer" pour intent explicite. **Pas de duplication dans Réglages map mode** : le mécanisme d'import côté session (modale 📖 Mode Histoire onglet PDF, v1.34.20) reste l'entrée unique pour charger un PDF localement. Distinction d'usage : générateur = embarquement durable cross-utilisateurs (dans le ZIP du plan) ; modale Mode Histoire = override session per-navigateur (IDB locale).

- 🎨 **Nouvelle interface en mode carte (refonte v1.9.1, polish v1.9.2 le 2026-05-22)** : la nouvelle interface est **activée par défaut**. Polish v1.9.2 = loader PC plein écran edge-to-edge, toutes les modales agrandies sur PC (Doc/Aide/Config/Légende multi-cols/Session/Tableau/Export), toggle « ⚪ Afficher les ronds aux intersections de tracés » (initialement dans ⚙️ Configuration home — **déplacé per-plan dans ⚙️ Réglages mode carte depuis v1.36.2**, clé LS `myktamap_plan_prefs_<planId>.showRoadIntersections` + cascade per-plan→global→default. Bug fix associé : seuil `ROAD_INTERSECTION_MAX_ROADS` 200→500 dans `js/road.js` qui sautait silencieusement le calcul sur plans denses type Catacombes 2024+), tracker rotation continue sans saut au Nord, splash KARMA animé lettre par lettre + crédits 🍃 Leaflet · 📦 JSZip · 🧭 Dijkstra (algo pathfinder), background Leaflet aligné à la charte. Elle comprend :
  - **Header bar sticky 44px** en haut avec rose des vents cliquable (retour home avec garde-fou si session modifiée), nom du plan **cliquable** qui ouvre la modale refondue "🗂 Changer de plan" (carte highlight du plan en cours avec badge `● ACTIF` vert, liste des récents avec hover doré et flèche qui glisse, gros CTA bleu "📚 Voir tous mes plans" en bas), et compteurs cliquables (📍 points · 🛣 tracés · ⬛ zones) qui ouvrent une modale "📊 Détails de la session" listant tous les éléments avec leurs infos détaillées (nom/tag/coord pour les points, type/nb/distance par type pour les tracés et zones, mesures actives).
  - **Sidebars unifiées** gauche (Doc/Settings/Charger/Save) et droite (Recherche/Édition/Mesure + accordéons Tracés/Zones/Tracker) — barre verticale continue sans gap, sous-actions s'empilent en dessous au lieu d'apparaître à côté.
  - **Sous-actions horizontales en landscape mobile** (depuis v1.9.1) : sur petit écran horizontal, les sous-menus se déplient vers l'intérieur de l'écran (sidebar gauche → vers la droite, sidebar droite → vers la gauche) au lieu de descendre. Le zoom +/- natif Leaflet reste vertical (convention universelle).
  - **Boutons ▾/▸/◂** de réduction en haut de chaque sidebar pour gagner de la place à l'écran sans arrêter les modes actifs.
  - **Status bar sticky 52px** en bas qui regroupe les mesures live (📐 mesure · 📏 distance totale CLIQUABLE → ouvre modale · 🗺️ itinéraire CLIQUABLE → ouvre modale · 🧭 tracker GPS LED ON vert / OFF rouge), repliable via gros bouton ▾▴ (40×36px depuis v1.9.1).
  - **Footer dynamique** (depuis v1.9.1) : si toutes les stats sont actives en même temps et que ça ne tient pas en largeur, le footer **wrap sur plusieurs lignes** et s'agrandit en hauteur. La carte, la boussole et les sidebars suivent automatiquement via la variable CSS partagée `--kta-statusbar-h` (mise à jour par JS via ResizeObserver sur le status bar).
  - **🧭 Boussole d'orientation** : en portrait → bottom-left au-dessus du footer ; en landscape → **bottom-center** (pour ne pas cacher les icônes latérales des sidebars). Activée via 🧭 Tracker → 🧭 Boussole.
  - **Centrage du titre du plan** : en portrait, centrage flex classique (titre centré dans la largeur restante). En landscape, **CSS Grid `1fr auto 1fr`** pour centrage géométrique ABSOLU (peu importe l'asymétrie de largeur entre home et compteurs).
  - **Générateur de plan retiré du mode carte** — reste accessible uniquement depuis la home via 🏗️ Générer un plan.
  - **Menu ⬇️ Charger / Import allégé** (depuis v1.9.1) : retrait du sous-action "🗂️ Changer de plan" (doublon avec la rose des vents et le titre cliquable).
  - **⚙️ Configuration du loader réorganisée** (depuis v1.9.1) : ordre Confidentialité → Affichage (toggle ancienne interface) → Force update → Reset, pour que Force update et Tout réinitialiser se suivent directement (gradation purge cache → purge totale plus lisible).
  - L'user peut **opt-out** : ⚙️ Configuration (home) ou ⚙️ Réglages (map) → 🎨 Affichage → cocher "📜 Utiliser l'ancienne interface (classique v1.8.x)". Reload requis. Le choix est mémorisé entre sessions.
- 🔒 **Privacy & Audit** (depuis v1.8.0) : app 100 % offline-first — aucune donnée utilisateur n'est envoyée sur Internet. Modale 🔒 Audit réseau dans le HOME : liste exhaustive des requêtes possibles (toutes vers le propre domaine de l'app + tuiles OpenStreetMap uniquement si la Vue OSM est activée en opt-in), guide de vérification soi-même, mode hors-ligne strict.
- 🎨 **Refonte UX page d'accueil** (depuis v1.7.3) :
  - **Nouveau titre stylisé** : `📦 MyKTAMap` (basique) remplacé par un lockup graphique avec logo `mkm-full.png` (rose des vents jaune, drop-shadow halo) + "MyKTAMap" en grand + tagline "Cartographie souterraine" (remplace "Cartographie terrain" partout). Hover pulse, responsive vertical mobile / horizontal ≥1024px.
  - **Bouton ⚙️ Configuration** dans le header du loader (à côté de 📖 Documentation et 🚨 Alertes) qui ouvre une **modale unique** regroupant tout ce qui était éparpillé : toggle 🐛 Logs détaillés + bouton **📋 Afficher les logs** *(nouveau)*, 🔄 **Force update douce** *(nouveau)*, 💥 Tout réinitialiser. Symétriquement, le bouton 🗑️ Réinitialiser est retiré de la modale ⚙️ Réglages in-app (map mode) — le reset complet n'est désormais accessible que depuis la modale ⚙️ Configuration du loader.
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
- 🏗️ **Générateur de plan** : Nouveau plan / Modifier existant (ZIP) — depuis v1.10.0, 2 nouvelles features :
  - **🎨 Image vierge** (depuis v1.9.3) : alternative à l'upload d'une image source. L'app génère un canvas vide aux dimensions choisies (500-12000 px) avec couleur de fond au choix (⬜ Blanc / ▫️ Gris clair / ⬛ Noir / 🌫️ Gris foncé). Utile pour dessiner un plan from scratch (piliers / fronts / tracés) sans image source — typique pour les cartographes qui visitent une carrière sans plan existant.
  - **📦 Importer un datalayer ZIP en un clic** (v1.10.0) : encadré doré dans la section Calques de données. Permet d'injecter en 1 clic les calques (points / tracés / zones / structures) + photos d'un ZIP datalayer exporté depuis un autre plan via Conversion session→data. Mode Nouveau = remplit la liste. Mode Modifier = AJOUTE avec suffixe `_imported_<N>` si conflit d'id (préserve les calques existants). Photos IDB du plan courant **merge** avec celles du ZIP (déduplication par photoId).
  - **📸 Inclure les photos attachées** (v1.10.0) : case visible en mode Modifier uniquement, cochée par défaut si le plan a des photos IDB. Embed automatique dans `data/photos/` du ZIP plan généré. Au load par un autre user, les photos sont restaurées automatiquement en IDB local + toast discret.
- ⚙️ **Réglages** : calibrage échelle, debug, reset complet, etc.
- 🚀 **Mode Performance ULTRA** (dans ⚙️ Réglages) : 6 toggles d'optimisation agressifs pour gros plans / appareils faibles — décimation tracés, désactivation animations Leaflet, abaissement seuil intersections, skip popups data-layer, auto-save lent, viewport culling. Préset ULTRA bloc ou ajustement individuel. N'affecte PAS l'image (gérée par mode performance au chargement).
- 🤖 **Aide IA** : téléchargement de ce fichier de contexte
- 🔔 **Détection de mise à jour** : version.json + popup avec choix mise à jour douce / reset complet
- 🏷️ **Badge version cliquable** dans le footer du loader : affiche la version installée. Clignote en bleu si une nouvelle version est dispo (passage à la version cible visible : `v150 → v151`). Au clic, force la modale d'update (bypass snooze 24h). Si déjà à jour, affiche les notes de la version installée.
- 🚨 **Alertes publiques** : système de diffusion d'alertes (incendie, fermeture, gaz toxiques, migration domaine...) via fichier `alert.json` côté serveur. Modales colorées selon niveau (`emergency` rouge / `warning` orange / `info` bleu) affichées en cascade après le splash. **Multi-alertes supporté depuis v163** : plusieurs alertes peuvent être actives simultanément (chacune acquittable individuellement). Bouton 🚨 dans le header du loader pour re-consulter à tout moment, avec **coloration dynamique** selon le niveau max actif + pastille compteur si N > 1 alertes.
- 🌐 **Migration domaine vers myktamap.fr** (depuis v163) : annoncée pour le **15 juillet 2026**. L'annonce est diffusée via une alerte `info` permanente dans `alert.json` (cf système d'alertes publiques) — visible via le badge 🚨 bleu dans le loader, l'utilisateur consulte quand il veut. Les 2 domaines cohabitent pendant ~2 mois pour laisser le temps d'exporter sessions et plans manuellement. Cf recette « 🌐 Migration vers myktamap.fr ».
- 🏗️ **Générateur de plan** : auto-détection des dimensions de l'image principale + warnings si > 10000 px / > 30 Mo. Position initiale tracker auto-centrée (W/2 × H/2) au choix de l'image, avec bouton 🎯 Recentrer.
- 🧭 **Boussole / widget Nord** (depuis v147) : sous-action 🧭 dans le groupe Tracker → affiche une rose des vents flottante en haut-gauche sous le zoom. La rose tourne en temps réel pour pointer vers le vrai Nord. Clic dessus → modal plein écran avec la rose en grand + angle cardinal exact. Outil de debug pour valider que le heading du téléphone est cohérent.
- ⚠️ **Popup avertissement au démarrage du tracker** (depuis v147) : au premier ▶️ Play de chaque session, modal qui rappelle que le module est expérimental et ne doit pas servir à se localiser en situation réelle. iOS-safe (requestPermission appelé synchronement dans le click handler).
- 🏗️ **Mode multi-niveau** (depuis v148) : pour les carrières multi-étages — chaque élément (point, tracé, zone, structure, calque image) porte un niveau (ex. 0, -1, -2) ; la modale 🏗️ Niveaux filtre l'affichage par étage (le plan principal se masque comme niveau 0 depuis v1.67.0). Jonctions inter-niveaux (puits, escaliers) reliant les réseaux de tracés pour l'itinéraire. Se déclare dans le Générateur (case multi-niveau + niveau par calque).
- 🏷️ **Les plans d'un serveur peuvent arriver ÉTIQUETÉS (depuis v1.90.1)** : `index.json > plans[].tags` (édité dans `confadmin.html`). Contrat : **l'index propose, l'utilisateur dispose** — les étiquettes du serveur ne sont écrites que si l'user n'a pas édité les siennes, et vider le champ est un CHOIX qui survit aux démarrages suivants. Si un user demande « d'où viennent ces étiquettes que je n'ai pas mises », la réponse est : de la liste de plans de son serveur.
- 🔒 **Import de profil REFUSÉ en mode serveur uniquement (depuis v1.90.1)** : sur une instance `serverPlansOnly`, l'import de profil est bloqué avec un message explicite. Il rapportait des plans locaux que le mode masque, et surtout il transporte `myktamap_loader_show_server_plans` — à `false`, il vidait l'accueil alors que la case correspondante est justement cachée par le mode kiosque. L'**export** reste disponible. Si un user dit « je ne peux pas importer mon profil », vérifier d'abord si son instance est un kiosque : **ce n'est pas un bug**.
- 💾 **Télécharger un plan serveur pour le hors-ligne depuis la LISTE (depuis v1.90.0)** : un bouton sur la ligne du plan (serveur uniquement), avec quatre états lus du cache réel — ⬇️ télécharger · ⬇️ compléter · ↻ réessayer · ↻ mettre à jour quand tout est là. Il naît caché : tant que l état n est pas lu, il n existe pas.
- 🌐 **La Vue OSM du HOME affiche enfin les plans SERVEUR (depuis v1.89.0)** : le widget passait exclusivement par le ZIP du plan (FS Access ou IndexedDB), qu'un plan servi n'a pas — il ne rendait donc aucun calque. Il lit maintenant le `plan-config.json` et les calques en HTTP, avec la même résolution de chemins qu'au chargement réel, et les tuiles à la racine sondée.
- 🧹 **Le plan de démo n'est plus pré-caché (depuis v1.88.5)** : ses ~2 Mo partaient à l'installation chez tout le monde, et surtout il était *inévinçable* — tester le hors-ligne avec lui donnait un faux « ça marche ». Il se comporte désormais comme n'importe quel plan servi.
- 🩸 **Un plan issu d'un import SIG/GPX/KMZ s'affiche enfin en mode serveur (depuis v1.88.4)** : ces trois importateurs écrivaient leurs fichiers dans `data/` du ZIP mais les déclaraient **sans le préfixe** dans le plan-config. Invisible en import local (l'asset est retrouvé par son nom de base), fatal en serveur (404 sur l'image et les calques). Corrigé aux sources, et les plans déjà déployés sont rattrapés : un nom de fichier nu est résolu vers `<dossier du plan>/data/<nom>`, la mise en page de toute archive produite par l'app.
- 🧱 **Les tuiles d'un plan V2 servi sont SONDÉES (depuis v1.88.3)** : la racine était dérivée du dossier de l'image, ce qui suppose que l'image et les tuiles ont bougé ensemble lors du déploiement. Faux — le générateur écrit toujours les tuiles dans `<plan>/data/tiles`, alors que l'image peut avoir été remontée d'un cran par une recette de déploiement plus ancienne. D'où « sur certains plans ça marche, d'autres non » avec des ZIP identiques. L'app essaie désormais les candidats dans l'ordre (tilesDir explicite → `<plan>/data/tiles` → à côté de l'image → `<plan>/tiles`) en demandant une tuile témoin à chacun.
- 🧹 **Un plan serveur retiré du serveur disparaît de la liste (depuis v1.88.2)** : jusque-là, l'auto-découverte n'ajoutait jamais qu'elle ne retirait, donc un plan sorti de `data/index.json` restait affiché indéfiniment et partait même dans l'export de profil. Il est maintenant élagué au démarrage — uniquement les plans **serveur auto-découverts**, uniquement après un accès réussi à l'index (un serveur injoignable ne vide rien), et **sans toucher aux données associées** (sessions, photos, géoréf restent).
- 🔎 **Savoir qu'un plan hors-ligne est périmé (depuis v1.88.0)** : un plan pré-téléchargé est servi depuis son cache dédié, que **rien ne purge** — il pouvait rester périmé indéfiniment. À l'ouverture de sa fiche, l'app envoie des requêtes **conditionnelles** (ETag / Last-Modified, retenus au téléchargement dans le manifeste v3) sur tous les fichiers **sauf les tuiles** — elles dérivent de l'image, qui est sondée. Trois verdicts : ⚠️ mise à jour disponible · ✓ à jour · **inconnu** si aucune sonde n'a abouti (on ne conclut jamais sans preuve). 🩸 *Le champ `version` de `index.json` n'est PAS utilisable comme signal : il est saisi à la main et diverge déjà de celui du plan-config dans le repo (V1 vs V2). Le générateur n'écrit aucun horodatage.* Détail : `docs/TILING.md` §8.
- 💾 **Rendre un plan serveur disponible hors-ligne (depuis v1.87.0)** : fiche ℹ️ Infos du plan → section « Disponibilité hors-ligne ». Télécharge image + données + **toutes** les tuiles de tous les niveaux dans un cache dédié (`myktamap-plan-<id>`) que le Service Worker **exclut de l'éviction et de la purge au bump**. Avant, le cache au vol plafonnait à 800 entrées en FIFO — un plan V2 de 20000×12000 fait 1275 tuiles, dont 960 pour le seul niveau z=0 : il s'évinçait lui-même, et hors-ligne la carte était **trouée**. **Quatre** états lus du **cache réel**, jamais d'un drapeau *(4ᵉ ajouté en v1.87.1)* : **absent** → bouton ⬇️ ; **complet** → le bouton de téléchargement disparaît et devient « ↻ Mettre à jour » ; **partiel** → tout ce que le serveur possède est là, mais N fichiers déclarés par le plan sont introuvables chez lui : l'app **les nomme** et propose « ↻ Réessayer » ; **incomplet** → téléchargement interrompu, « ⬇️ Compléter ». 🩸 *Le « partiel » existe parce que sans lui, un plan déclarant un fichier non déployé restait « incomplet » à vie, sans jamais dire lequel.* Détail : `docs/TILING.md` §7.
- 🌐 **Déployer un plan sur un serveur (depuis v1.86.1)** : il suffit de **dézipper le ZIP tel quel** dans `data/<nom>/` et de déclarer le plan dans `data/index.json`. Avant, tout renvoyait 404 sauf le `plan-config.json` : le générateur y écrit des chemins relatifs **au ZIP** (`data/MonPlan.png`) qui étaient résolus depuis la **racine du site**. Ils sont maintenant préfixés par le dossier du plan (sauf s'ils le contiennent déjà — les déploiements réécrits à la main sont intacts). Les icônes **personnalisées** d'un plan servi sont résolues depuis la v1.87.2 : à l'ouverture, chaque `icon/…` déclaré est **réellement demandé** dans le dossier du plan et n'est retenu que s'il répond 200 (sinon on garde celle de l'app, à la racine). 🩸 *La v1.86.2 tranchait sur le catalogue `TAGS_BUILTIN` — faux : il liste des tags de POI, pas les icônes de l'app, et `icon/iconetrack.png` cassait sur tout plan serveur.* Détail : `docs/TILING.md` §5.
- 🖼️ **Le sélecteur de tuilage est REPLIÉ par défaut (depuis v1.88.1)** : un bandeau « 🖼️ Tuilage pour ce chargement : Auto » dans la carte de chargement, qu'on déplie au clic. Déplié en permanence, il faisait déborder la colonne sur le footer à 125 % de zoom. La valeur courante reste lisible sans déplier.
- 🖼️ **Découpage de l'image — 2 choix depuis v1.86.0** : le sélecteur du chargeur (dans la carte de chargement, au-dessus du bouton Charger) ne propose plus que **🔄 Auto** (défaut) et **💤 Désactivé**. Les presets Qualité / Équilibré / Performance ont été retirés : ils ne réglaient que le découpage fait par le navigateur au chargement (plans V1) et ne changeaient **rien** sur un plan déjà découpé (V2). Un plan V2 **utilise toujours ses tuiles** — « Désactivé » y est ignoré. « Auto » décide désormais sur la **taille en pixels** (4096²) et non plus sur le poids du fichier, ce qui protège enfin les grands plans bien compressés. Un plan V2 **servi par un serveur** trouve ses tuiles (avant : carte blanche). Détail complet : `docs/TILING.md`.
- 🧱 **Tiling V2** (depuis v149) : système de tuilage Google Maps-like pour réduire la conso mémoire au runtime sur gros plans (>50 Mo). Génération via le générateur de plan (case 🧱 Convertir en V2 tuile) — disponible en mode Nouveau OU Modifier dès qu'une image est uploadée (depuis v151). Runtime Option B : N L.imageOverlay par niveau de zoom, swap on zoomend (~16 MB max en RAM à tout moment). Auto-crop des marges blanches intégré. Modal d'avertissement avant la conversion (lourde — recommandé sur PC plutôt que mobile).
- 🫥 **Transparence des plans** (depuis v1.62.0) : une image source PNG/WebP avec vrai canal alpha est tuilée SANS fond ajouté — les calques se superposent proprement. Les plans générés avant v1.62 avec un fond noir doivent être régénérés depuis leur source d'origine pour en profiter.
- 🏷️ **Badges de mode sur la liste de plans** (depuis v150) : chaque ligne plan dans le loader affiche un ou deux chips de mode — `V1` (gris classique), `M-LVL` (jaune multi-niveau), `V2` (violet tuilé). Plusieurs badges peuvent coexister (un V2 peut être aussi multi-niveau).
- 🌀 **Overlay de chargement plein écran** (depuis v152) : quand un plan se charge (extraction ZIP, indexation tuiles V2 toutes les 50 tuiles, init carte), une modale centrée avec spinner + message d'étape s'affiche au-dessus du splash. Avant v152, le statut était écrit en petit en bas du loader, peu visible sur gros plans.
- ❌ **Erreur explicite en cas d'échec de génération V2** (depuis v152) : modale rouge plein écran qui détaille la cause du crash (drawImage / toBlob / saturation mémoire) avec les coordonnées de la tuile en échec + conseils actionnables (PC vs mobile, réduire l'image source, convertir en JPEG q85). Plus jamais d'erreur silencieuse pendant la conversion V2.
- 🛡️ **Détection automatique des crashs durant la génération V2** (depuis v152) : un flag localStorage est posé avant la conversion et retiré dans le `finally`. Si le navigateur kill la page pendant la génération (OOM mobile typique), le flag reste → au prochain démarrage de l'app, modale spécifique **"🧱❌ Génération V2 interrompue"** avec rappel des solutions (PC, réduire image, fermer apps en arrière-plan).


**Autres fonctionnalités notables** (une ligne chacune — détails dans les recettes / la Documentation intégrée 📖 de l'app) :
- 🌍 **Vue OSM** (depuis v1.39.0, opt-in) : projette le plan calibré sur une carte OpenStreetMap (modale 🌍 en mode carte + widget sur le HOME) ; **💾 Save Offline** met en cache les tuiles OSM (max 200/clic) pour un usage hors-ligne.
- 📖 **Mode Histoire** : bouton 📖 dans la barre du haut — carnet de notes libre par plan (éditeur Markdown léger, sauvegarde auto) + visionneuse de PDF embarqué ou importé.
- 🎤 **Commande vocale** (opt-in) + 🔊 **lecture vocale des notes** d'un point (bouton dans le popup) — 100 % local, voix du téléphone.
- 📳 **Vibrations haptiques** (opt-in, non supporté iPhone) : confirmations discrètes terrain (waypoint atteint, recalage, alertes).
- ⭐ **Favoris** de points + 🔥 **Heatmap** de densité + 📈 **Stats globales** du profil (tous plans confondus).
- 🛟 **Snapshots automatiques de session** (filet anti-perte, restauration depuis la modale Session) + ↩️ **Undo/Redo global** (Ctrl+Z / Ctrl+Y).
- 🕶️ **Mode Incognito** (session jetable, rien n'est persisté) + 🧠 **Inspecteur mémoire** + 🧰 **Inspecteur Service Worker** (Configuration).
- 🎓 **Tutoriel d'onboarding** en cartes au premier lancement (rejouable depuis la Documentation).
- ≡ **Modale Filtres unifiée** en mode carte : cocher/décocher calques de données, calques image, tags, avec « 🔄 Tout afficher ».
- 👤 **Profil utilisateur** : pseudo + avatar + bandeau de stats du HOME ; **export/import du profil complet** (préférences, favoris, sessions, snapshots, liaisons entre plans, photos en option) pour migrer d'appareil.
- ⛔ **Liste de révocation** (kill-switch) : un plan diffusé puis révoqué par l'auteur est bloqué au chargement (vérification 100 % locale par empreinte).
- 🌀 **Liaisons inter-plan / portails** (v1.57+) : lier un point d'un plan à un point d'un autre plan, navigation par portail avec bouton Retour, gestionnaire « Mes liaisons » (liste + vue graphe « réseau de plans »), itinéraire inter-plan et multi-hop (cf « Nouveautés récentes » en fin de document).

**Types de zones** (exhaustif — il n'en existe que 4 depuis v169 / Karma_dev) :
- **Remblais** (gris foncé, ⬛)
- **Effondrement** (rouge, 🟥)
- **Eau** (bleu, 🟦)
- **Inaccessible** (hachures rouge sombre / noir 45°, ⛔) — *nouveau v169*. Zone BLOQUANTE pour le pathfinder **par défaut, mais relâchable depuis la v1.82.0** (case « Respecter les zones inaccessibles » dans la modale Itinéraire, cochée d'origine ; le Mode Secours et « Perdu » les respectent toujours) : tout segment de route qui la traverse est retiré du graphe → l'itinéraire calculé ne passera jamais par cette zone. Multi-niveau : ne bloque que les segments du même niveau. Contrainte DURE par défaut — relâchable depuis la v1.82.0 (case « Respecter les zones inaccessibles », modale Itinéraire, cochée d’origine). Le Mode Secours et « Perdu » la gardent toujours.

→ Il n'y a **PAS** de zone "brûlée", "incendiée", "dangereuse", "fumée", "sèche", "gelée", "humide" ou autre. Strictement Remblais / Effondrement / Eau / Inaccessible.

**Types de tracés / routes** (exhaustif — il n'en existe que 5, dont 1 conditionnel) :
- **Principal** (vert épais)
- **Secondaire** (violet moyen)
- **Chemin** (jaune fin)
- **Itinéraire** (cyan néon, calculé automatiquement — pas tracé à la main)
- **Jonction interniveau** (polyline magenta pointillée + ronds blanc/magenta aux 2 extrémités) — UNIQUEMENT disponible si le plan a le mode **multi-niveau** activé. Polyline multi-points (comme un tracé normal) qui sert de bridge unique entre 2 niveaux pour le pathfinder. Sémantique `fromLevel`/`toLevel` symétrique (pathfinder traverse dans les 2 sens). S'efface comme un tracé normal via 🧹.

**Types de structures** (exhaustif — il n'en existe que 5, depuis v1.9.3) :
- **🟡 Pilier 1ère masse** (polygone, fill jaune) — pilier porteur du niveau supérieur
- **🟠 Pilier 2e masse** (polygone, fill orange) — pilier du niveau inférieur. Auto-taggé `level = -1` en mode multi-niveau
- **🔵 Mur** (polygone, fill bleu) — mur de pierre sèche, parpaing, soutènement maçonné
- **🟨 Front de taille 1ère masse** (polyligne, trait jaune) — front d'exploitation niveau supérieur (LIGNE pas polygone). Couleur alignée sur pilier-1 jaune (depuis v1.10.1).
- **🟧 Front de taille 2e masse** (polyligne, trait orange) — front d'exploitation niveau inférieur. Auto-taggé `level = -1`. Couleur alignée sur pilier-2 orange (depuis v1.10.1).

→ Il n'y a **PAS** d'autre type de structure. Pas de "voûte", "galerie", "puits maçonné", "consolidation béton" etc. Strictement ces 5 types. Le groupe sidebar est **🏛️ Structures**. Aucun effet pathfinder (lecture seule, c'est différent des zones inaccessibles ⛔ qui bloquent l'itinéraire). 4 modes de suppression (depuis v1.10.0) : ↩️ Annuler dernier point / ✂️ Dernière structure (en cours OU fermée) / 🎯 Sélectionner au clic carte (hybride polygon/polyline) / 🗑️ Toutes.

**📸 Photos POI** (depuis v1.10.0, backend IDB-first) :
- Max **5 photos par point** (limite anti-saturation IndexedDB navigateur, configurable via `MAX_PHOTOS_PER_POINT` dans `js/photos.js`)
- Compression auto : canvas → JPEG q85, côté long max 1920 px. Une photo brute de 5-10 Mo passe à ~200-500 Ko
- Stockage **100 % local** dans IndexedDB (`myktamap_photos` v1, store `photos`, indexes `by_plan` + `by_plan_point`). **Jamais envoyé sur Internet**, jamais lu par l'auteur — cohérent avec la promesse no-backend
- UI éditeur : section "📸 Photos (N/5)" dans la modale d'édition POI avec grille 3 cols PC / 2 cols mobile, miniatures 80×80, spinner pendant compression, ✕ rouge marque pending delete + ↺ vert pour annuler
- 2 boutons d'ajout : `📷 Prendre photo` (caméra mobile via `capture="environment"`) + `🖼️ Depuis la galerie` (file picker, sélection multiple)
- Popup marker : miniatures 44×44 cliquables (img directes) + compteur "📸 N photos". Tap → viewer plein écran
- Viewer plein écran (`window.MyKTAMapPhotoViewer`) : pinch-zoom 1-4×, pan, swipe horizontal pour navigation entre photos, flèches `← →` ou boutons `◂ ▸` overlay, raccourcis clavier PC (`Échap` ferme, `+ - 0` zoom, etc.)
- Header bar refonte : 5e compteur **📸** (lecture async IDB) à côté de 📍 / 🛣 / ⬛ / 🏛️. Clic → modale "📊 Détails de la session" avec breakdown par point + total Mo
- Inclus dans tous les exports (session Full / Avancé / Conversion / Générateur ZIP plan) — format unifié `photos/_index.json` + blobs. Re-import automatique au load
- **⚠️ Pas d'envoi sur Internet** — c'est une des invariantes garanties par le module Privacy & Audit. WebAuthn et IndexedDB sont 100% local navigateur.

**🔐 Code d'accès local PIN/Face ID** (depuis v1.10.0, optionnel) :
- Module `js/pinLock.js` → `window.MyKTAMapPinLock`
- Couche PERSO optionnelle par-dessus l'`UnlockGate` communautaire (qui reste actif). PIN 4-6 chiffres + biométrie Face ID/Touch ID via WebAuthn natif
- **Modèle de sécurité honnête** : c'est une **barrière UX**, PAS un chiffrement des données. Les photos et sessions restent en clair en IDB/localStorage. Cohérent avec UnlockGate et la promesse no-backend
- Hash `SHA-256(salt + pin)` via `crypto.subtle.digest`, salt random 16 bytes (`crypto.getRandomValues`). Stocké en `localStorage["myktamap_pin_v1"]`. **Jamais envoyé sur Internet**
- WebAuthn : `authenticatorAttachment: "platform"` (Face ID / Touch ID / Windows Hello — pas de clé USB roaming), challenge random côté client (no backend = compromis assumé)
- Activation/modification/désactivation **uniquement dans ⚙️ Configuration de la home** (cohérent avec la philo "réglages critiques loader-only" de v1.7.3). PAS de section dans ⚙️ Réglages map mode
- 5 tentatives PIN ratées consécutives = **lockout définitif**. Pour sortir : réinstaller l'app OU contacter l'auteur via Instagram **@karma_kta** ou **contact@myktamap.fr** (il ne pourra rien faire — aucune donnée serveur — mais le canal existe). Biométrie ratée n'incrémente PAS le compteur
- **Proposition d'activation one-shot** au 1er lancement post-update v1.10.0 : modale qui invite à activer. Refus → flag `myktamap_pin_proposal_done_v1` set, plus jamais re-proposé (l'user doit aller dans ⚙️ Configuration manuellement)
- Aucune recovery en cas d'oubli (= cohérent UnlockGate, philosophie no-backend)
- Boot : `main.js > initApp` ouvre la gate APRÈS UnlockGate (séquentiel), avant tout chargement de plan

**🏗️ Mode multi-niveau — niveaux visibles par défaut** (depuis v1.10.0, KARMA) :
- Au chargement d'un plan **avec multiLevel activé** : `visibleLevels` = `[-1, 0, +1]` (filtré par `availableLevels` disponibles)
- Avant v1.10.0 : default était `[0]` strict
- En single-level : `[0]` strict (rétrocompat absolue, comportement inchangé)
- Le default `availableLevels` est `[-2, -1, 0, +1, +2]` (symétrique autour de 0)

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
> *"Non, MyKTAMap ne propose pas de [X]. Les seules [zones/types/modes] disponibles sont [liste exacte d'après la doc]. Si tu veux suggérer cette fonctionnalité, contacte l'auteur via Instagram **@karma_kta** — ou par email **contact@myktamap.fr** (notamment pour tout usage professionnel / commercial)."*

**Quand tu n'es pas sûr** :
> *"Je ne trouve pas d'information claire à ce sujet dans la documentation fournie. Pour confirmation, vérifie directement dans l'app ou contacte l'auteur via Instagram **@karma_kta** ou **contact@myktamap.fr**."*

**Quand on te demande d'accéder à une source externe** :
> *"Je n'ai accès qu'à la documentation utilisateur fournie ici. Je ne peux ni lire le code source (non distribué publiquement), ni naviguer sur le site, ni voir ton app."*

---

# 📖 Documentation utilisateur complète

> La documentation utilisateur intégrale (~250 Ko) n'est **volontairement pas incluse** dans ce fichier, pour qu'il reste entièrement lisible par une IA (les très gros fichiers sont tronqués ou lus par extraits par la plupart des assistants). Le **survol des fonctionnalités** ci-dessus, le **glossaire**, les **recettes** et la **FAQ** couvrent l'essentiel du support.
>
> Si une question sort de ce périmètre, réponds : *« Ce point n'est pas couvert par le contexte fourni — consulte la Documentation intégrée de l'app (bouton **📖 Documentation** de l'écran d'accueil), ou re-télécharge un contexte avec le profil adapté depuis la modale 🤖 Aide IA. »*

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

<!-- @@PROFIL tous -->
# 🍳 Recettes — workflows fréquents pas-à-pas

<!-- @@PROFIL usage -->
### Première utilisation sur mobile

1. Ouvre https://myktamap.fr dans Safari (iOS) ou Chrome (Android).
2. Ajoute l'app à l'écran d'accueil (iOS : bouton Partager → "Sur l'écran d'accueil" / Android : menu ⋮ → "Installer l'application").
3. Relance depuis l'icône installée — l'app devient autonome (PWA, fonctionne hors connexion une fois les assets cachés).
4. Au premier lancement, le loader propose les plans de démo (test1 / test2). Clique l'un d'eux → ✅ Charger.

<!-- @@PROFIL usage,plans -->
### Charger ton propre plan (depuis un ZIP)

1. Dans le loader, trouve la zone "Glisse ton archive ZIP ici" (ou clique pour parcourir).
2. Sélectionne ton fichier `.zip`.
3. (Optionnel) Choisis un preset de performance dans le segmented control (Auto par défaut).
4. ✅ Charger.
5. Le plan apparaît. Sa fiche est désormais dans le registre — la prochaine fois, clique-la directement.

<!-- @@PROFIL usage -->
### Ajouter un point sur la carte

1. Dans la barre latérale, clique sur l'icône **✏️ Édition** (depuis v1.21.3 c'est un **clic direct** = toggle ON/OFF, plus de menu déroulant).
2. L'icône devient surlignée — le mode ajout est actif.
3. Clique sur la carte à l'endroit voulu — une modale s'ouvre.
4. Saisis le nom, choisis un type (puits, info, salle…) et éventuellement une description.
5. ✅ Ajouter.
6. Le point est sauvegardé automatiquement dans la session (auto-save toutes les 1.5s).
7. Re-clic sur ✏️ pour sortir du mode.

**Distance d'une sortie quand le podomètre n'a rien vu** : chaque « 📍 Je suis ici » **sur un point** pose une ancre ; entre deux ancres sans aucun pas podomètre, la distance est comblée, puis rejouée sur le réseau de tracés par le **même Dijkstra que l'itinéraire** (`affinerEstimationsTracker`, v1.79.6). Depuis la v1.85.2 : **🏁 Clôturer demande où tu es ressorti** (facultatif) pour fermer le dernier tronçon, l'affinage de la clôture manuelle ignore le plafond de 20 000 sommets, et la fiche distingue « calculé dans les galeries » de « à vol d'oiseau ». ⚠️ Un clic carte LIBRE (`src: "click"`) n'alimente jamais cette distance — seul le chemin `recalerTrackerSurPoint` compte.

**Où se règle quoi** (depuis v1.85.3) : la config du **mode plan** ne contient que ce qui concerne CE plan (échelle, géoréf, Nord, multi-niveau, tracker, ronds aux intersections, **navigation intelligente** — devenue par plan) ; la config de l'**accueil** porte les réglages globaux (taille des icônes au zoom, ancrage des panneaux, magnétisme + rayon, langue, thème, plans serveur). ⚠️ Trois réglages globaux restent accessibles en mode plan parce qu'on les ajuste en cavité — écran allumé, vibration, batterie — et leur libellé dit « s'applique à tous tes plans ». Les toggles Perf ULTRA sont **par plan** et ne s'affichent plus à l'accueil (ils n'y persistaient rien).

**Options via capteur** (⚙️ Paramètres, depuis v1.85.2) : rubrique dédiée regroupant **🔋 Niveau de batterie** (défaut ON — décocher retire l'icône ET coupe `getBattery()`, l'écoute cesse) et **📳 Vibration haptique** (défaut **OFF** depuis v1.85.2). ⚠️ Un capteur indisponible n'est plus masqué : la ligne s'affiche désactivée avec « ⛔ Capteur refusé par iOS » (ou par l'appareil). iOS n'expose ni `navigator.vibrate` ni `navigator.getBattery` aux pages web.

**Durée d'une sortie** (depuis v1.85.2) : une sortie **terrain** est comptée du **départ à la fin** (`wallMs`), pas au temps d'app ouverte — le téléphone en poche ne compte pas, l'app tuée par iOS non plus. Une session **bureau** garde le temps d'usage (`activeMs`) : on laisse un plan ouvert toute la soirée sans le regarder. La fiche affiche les deux. Si la sortie n'a pas été clôturée avec 🏁, sa fin est le dernier instant où l'app était vivante : 📔 fiche → **✏️ Corriger la fin** permet de saisir l'heure réelle (`activeMs` n'est jamais modifié).

**Une sortie coupée en plusieurs au carnet** (corrigé v1.85.2) : quitter la PWA pour une autre appli la fait décharger par iOS ; au retour l'app rebootait et ouvrait une sortie NEUVE. Elle **reprend** désormais toute seule si la précédente, sur le même plan, a été interrompue par un kill (`closedBy: "crash"`) il y a moins de 45 min. Une sortie clôturée à la main n'est JAMAIS recollée. Pour les sorties déjà coupées : 📔 Mon carnet → **🔗 Fusionner des sorties** → cocher → Fusionner (irréversible, confirmé).

**Où s'ouvrent les panneaux d'outils** (depuis v1.85.1) : les panneaux **Tracés / Zones / Structures** s'ouvrent **centrés à l'écran**, comme le Tracker et les Filtres. Avant, ils étaient ancrés au haut de leur bouton et passaient sous le bas de l'écran sur téléphone dès que leur liste s'allongeait (un plan importé ajoute un type par niveau). ⚙️ **Paramètres** → « 🪟 Ancrer les panneaux d'outils au bouton » rend l'ancien comportement — utile sur grand écran.

**Pour convertir PLUSIEURS objets d'un coup** : bulle d'un objet → 🔄 Convertir → **🎯 Sélectionner plusieurs objets à convertir** → clic sur la carte pour ajouter (re-clic pour retirer), **➕ Tous les « type » du niveau affiché** pour étendre, puis ✅ Convertir. La sélection ne mélange PAS lignes et surfaces fermées (le refus est expliqué). Tout le lot s'annule en UN `Ctrl+Z`.

**Pour supprimer un tracé / une zone / une structure** : clic sur l'objet → sa bulle → **🗑️ Supprimer** (ligne rouge, sous « Sauver la note » et « Convertir »). Pas de confirmation : `Ctrl+Z` annule, et le message le rappelle. Réservé aux objets de SESSION — un objet de calque de données ouvre une bulle en lecture seule.

**Pour repositionner un point** : clic sur le marker → popup → **📌 Repositionner** → le prochain clic sur la carte y déplace le point (bandeau en haut avec Annuler). Le point garde nom, type, description, photos, niveau et son appartenance de calque ; seule la position change, et le déplacement est annulable par ↩️. Bouton réservé aux points de SESSION — un point de calque de données est en lecture seule (l'ouvrir à la modification d'abord).

**Pour supprimer un point** : clic sur le marker → popup → bouton **🗑️ Supprimer ce point**. Pour annuler : `Ctrl+Z`.

<!-- @@PROFIL usage -->
### Tracer une route

1. Ouvre le groupe **🛣️ Tracés / Routes**.
2. Choisis le type : Principal (rouge épais) / Secondaire (orange moyen) / Chemin (jaune fin).
3. Clique successivement sur la carte pour poser les points de la polyline.
4. Bouton **✓ Valider** dans le floater pour sauvegarder le tracé.
5. Bouton **❌ Annuler** pour repartir de zéro avant validation.

<!-- @@PROFIL usage -->
### Calculer un itinéraire entre 2 points

1. **Pré-requis** : il faut un réseau de routes (Principal/Secondaire/Chemin) reliant les 2 points, soit dans ta session, soit dans les calques de données du plan.
2. Ouvre le groupe **🧭 Tracker** → **🗺️ Calculer un itinéraire**.
3. Ajoute des waypoints :
   - Soit en tapant un nom dans la barre de recherche (autocomplete des points existants).
   - Soit en cliquant directement sur la carte (mode clic activé via toggle).
4. Quand tu as ≥ 2 waypoints, clique **🎯 Calculer**.
5. Le trajet apparaît en cyan néon. Distance + temps estimé + mode de vitesse actif sont affichés en bas à gauche.
6. **Vitesse de marche** : segmented control dans la modale, 4 presets :
   - 🤕 **Blessé** (2 km/h) — progression entravée, très lent
   - 🐌 **Lente** (3 km/h) — prudente, étroitures
   - 🚶 **Normale** (5 km/h, défaut) — allure standard
   - 🏃 **Rapide** (7 km/h) — parcours connu
   Le mode est persisté entre sessions (localStorage `myktamap_iti_walking_preset`). Le label bottom-left affiche le mode actif avec son icône à côté de la distance et du temps.
7. Pour modifier : utilise les boutons 🔄 Recalculer ou ❌ Effacer.

<!-- @@PROFIL usage -->
### Sauvegarder et partager une session

1. Ouvre le groupe **💾 Sauvegarde session**.
2. Clique **💾 Enregistrer la session** (mode Full / Avancé selon besoin).
3. Un fichier `.json` est téléchargé.
4. Envoie-le à ton interlocuteur (mail, cloud, USB).
5. Côté destinataire : ouvrir le même plan → **📥 Importer une session** → sélectionner le `.json`.

<!-- @@PROFIL plans -->
### Créer un plan from scratch

1. Loader → bouton **🏗️ Générer un plan** (directement visible dans la home depuis v1.7.3).
2. Choisis "📄 Nouveau plan".
3. Upload une image (PNG ou JPEG, idéalement ≤ 8000 px de côté).
4. Définis l'échelle (combien de mètres font N pixels — clique 2 points distants sur l'image).
5. Configure les calques, les icônes par défaut, etc.
6. **📦 Générer le ZIP** — l'archive est téléchargée.
7. Recharge le ZIP via le loader pour utiliser le plan.

<!-- @@PROFIL diagnostic,plans -->
### Optimiser un plan qui plante sur mobile

1. Identifie ce qui pèse : taille image base, nombre de calques, nombre de routes, nombre de points.
2. Solutions par ordre d'impact :
   - **Convertis en V2 tuilé** (depuis v149) : 🏗️ Générateur → uploader l'image (ou le ZIP V1 existant) → cocher 🧱 **Convertir en V2 tuile (performance)** → 📦 Générer. Solution la plus efficace pour les gros plans : runtime tuilé Google Maps-like, ~16 MB max en RAM au lieu de l'image entière. ⚠️ Génération **lourde** (CPU + RAM), faire la conversion sur PC plutôt que mobile (cf modal d'avertissement à la coche).
   - **Réduis l'image base** (≤ 8000 px, JPEG qualité 85 au lieu de PNG).
   - **Diminue le nombre de calques image** (fusionne légendes + collision dans l'image base si possible).
   - **Intègre les routes dans l'image** si tu as > 200 tracés (deviennent statiques, plus interactives mais ne consomment plus de mémoire vive).
   - **Choisis le preset ⚡ Performance** au chargement.
3. Regénère le ZIP via 🏗️ Modifier existant.

<!-- @@PROFIL usage,plans -->
### 🏗️ Activer le mode multi-niveau (carrière multi-étages)

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

<!-- @@PROFIL plans,diagnostic -->
### 🧱 Convertir un plan V1 en V2 tuilé (performance)

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

<!-- @@PROFIL diagnostic -->
### 🌐 Migration vers `myktamap.fr` (depuis v163)

> Mots-clés : "changement de domaine", "nouvelle adresse", "myktamap.fr", "is-underground.fr", "déménagement", "ancienne adresse".

**Contexte** : MyKTAMap change de domaine officiel. La nouvelle adresse `myktamap.fr` remplacera `myktamap.fr` à partir du **15 juillet 2026**.

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

<!-- @@PROFIL usage -->
### 🚫 Bloquer un itinéraire par zone "Inaccessible" (depuis v169 / Karma_dev)

> Mots-clés : "bloquer itinéraire", "zone interdite", "éviter une zone", "rendre inaccessible", "interdire le passage", "zone bloquante".

**Cas d'usage** : tu veux qu'un calcul d'itinéraire ne passe pas par une certaine zone (effondrement récent, eau profonde, passage dangereux non balisé, etc.). C'est une contrainte **dure par défaut**, relâchable depuis la v1.82.0 par la case « Respecter les zones inaccessibles » (modale Itinéraire, cochée d'origine) ; le Mode Secours et « Perdu » la gardent en toutes circonstances.

1. Dans la barre latérale, ouvre le groupe **⬛ Zones**.
2. Clique la sous-action **⛔ Zone inaccessible**.
3. Clique sur la carte pour poser les sommets du polygone (au moins 3).
4. Re-clique sur le 1er point ou appuie sur ✅ Fermer pour clôturer.

La zone apparaît avec un **motif hachures rouge sombre / noir** à 45°. Tout itinéraire calculé qui aurait traversé cette zone passera désormais par un autre chemin. Si aucun autre chemin n'existe, l'itinéraire échoue avec un message "Aucun chemin trouvé".

**Multi-niveau** : la zone bloque uniquement les segments de route du **même niveau** (cohérent avec le filtre niveau). Une zone inaccessible au niveau 0 n'affecte pas l'itinéraire au niveau -1.

**Indépendant de la visibilité** : même si tu décoches le calque zones dans le contrôle des couches, la zone bloque toujours le pathfinder.

---

<!-- @@PROFIL usage -->
### 🚫 Préférences d'évitement (points / tags) — depuis v169 / Karma_dev

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

<!-- @@PROFIL usage,plans -->
### 🌍 Exporter en KMZ géolocalisé (Google Earth, OsmAnd, Locus, Avenza) — depuis v170

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

<!-- @@PROFIL usage -->
### ⛑️ Mode urgence — Je suis perdu (estimer une position en cataphilie)

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
     - 🤕 **Blessé** : 2 km/h — progression entravée, très lent, marche hésitante
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

<!-- @@PROFIL plans -->
### Intégrer définitivement ta session dans le ZIP du plan (annotations permanentes)

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

<!-- @@PROFIL usage -->
## 🌀 Recette : lier deux plans entre eux (liaisons inter-plan, depuis v1.57.0)

**Objectif** : créer un « portail » entre un point d'un plan X et un point d'un plan Y (deux réseaux qui se touchent, ou plan général ↔ plan de détail), puis naviguer de l'un à l'autre en un clic.

1. **Préparer** : les deux plans doivent être dans la bibliothèque (ajoutés depuis l'accueil). Les deux points (départ et arrivée) doivent exister — n'importe quel point convient : point de session (✏️) **ou** point d'un calque de données.
2. **Créer la liaison** : ouvre le plan X → clique le point de départ → dans sa fiche, bouton **🌀 Lier à un autre plan** → choisis le plan Y dans la liste → recherche le point d'arrivée (par nom, id ou tag — les points du plan Y sont lus **sans l'ouvrir**) → clique-le. C'est fait.
3. **Résultat** : la liaison est **bidirectionnelle** (visible dans la fiche des DEUX points, sur les deux plans). Un point peut porter plusieurs liaisons. **Marquage visuel au choix** (depuis v1.59.0) : par défaut rien ne distingue un point lié ; donne-lui le **tag « Portail »** pour son **icône vortex dédiée** (anneau doré, spirale bleue).
4. **Utiliser** : fiche du point → ligne 🌀 « plan · point » → bouton **➜** → confirmation → l'app change de plan (la session actuelle est sauvegardée automatiquement), **bascule sur le niveau du point d'arrivée** et centre la vue dessus (flash bleu).
4 ter. **Recalage à l'arrivée** (depuis v1.61.0) : traverser physiquement un portail (bouton ➜ d'une liaison, « Prendre le portail » d'un itinéraire inter-plan) **recale la position tracker sur le point d'arrivée** du plan cible. La recherche multi-plans et le gestionnaire ne recalent pas (consulter un point ≠ s'y déplacer). Si un itinéraire est actif sur le plan d'arrivée, il se replanifie depuis le portail.
4 bis-2. **v1.64.0 — le trajet suit le rythme réel** : le résumé se termine par « 🗺️ C'est parti » (plus de téléportation au calcul) — l'utilisateur MARCHE son trajet (validation d'étapes « 📍 Je suis ici », replanification au recalage), et la traversée se propose au portail : bouton flottant « 🌀 Portail suivant (dist) » (fermable, re-proposé par « 📍 Je suis ici » sur le point-portail) ou bouton ➜ du popup. Les points de passage posés dans la modale Itinéraire sont visités AVANT le portail, dans l'ordre. **Multi-hop** : case « 🌀 Itinéraire via plusieurs plans » dans la recherche multi-plans (mémorisée, décochée par défaut) → trajets à travers des plans intermédiaires (A → B → C, 3 traversées max, toutes combinaisons de portails comparées au coût réel) ; chaque arrivée trace le tronçon du plan et propose le portail suivant ; un plan intermédiaire injoignable est écarté et nommé si plus aucun chemin ne passe.
4 bis. **Itinéraire inter-plan** (depuis v1.60.0) : depuis la modale **Itinéraire** (« 🌐 Destination sur un autre plan ») ou la **recherche multi-plans** (bouton 🧭 sur un résultat distant), demande un trajet vers un point d'un autre plan. L'app compare les portails disponibles au coût réel, affiche les étapes (portail + distances de chaque côté + total en mètres), trace le chemin jusqu'au portail, puis **trace automatiquement la suite** à la traversée. Les évitements de chaque plan sont respectés. En cas d'impossibilité, le message explique précisément la cause (aucun portail — en crée un d'abord ; plan hors-ligne ; destination isolée du réseau ; « pas de liaison directe mais un chemin existe via tel plan »).
5. **Supprimer** : bouton 🗑️ sur la ligne de liaison (des deux côtés), ou supprime le point — ses liaisons partent avec.

**Bon à savoir** :
- Plan de destination absent de l'appareil → la liaison s'affiche avec ⛔ ; ajoute le plan pour pouvoir « y aller ».
- Les liaisons **voyagent avec l'export de session** (restaurées à l'import, fusion sans doublon).
- Un plan distribué peut embarquer des liaisons **prêtes à l'emploi** dans ses calques de données : utilisables, non modifiables.
- Si un **filtre de tags** masque le point d'arrivée, un avertissement s'affiche (l'app ne modifie jamais tes filtres).
- Les liaisons sont stockées localement (`myktamap_interplan_links_v1`) — comme tout le reste, **rien ne quitte l'appareil**.
- **↩️ Retour** (v1.58.0) : après un saut, un bouton flottant « Retour : <plan> » (15 s, bas de l'écran) ramène au plan et à la **vue exacte** d'origine (niveau + zoom). Les sauts s'empilent (3 portails = 3 retours). **Réductible/fermable** (v1.61.0) : [–] le réduit en mini-pastille ↩️ discrète (clic = ré-agrandir), [✕] le ferme et vide la pile de retours (v1.73.0 — fermer = renoncer à la chaîne) ; le choix [–] est mémorisé pour les prochains sauts.
- **🕸️ Vue « réseau de plans »** (v1.65.0) : dans « 🌀 Mes liaisons », bascule 📋 Liste ⇄ 🕸️ Graphe — la bibliothèque dessinée en réseau (plans = bulles avec badges V2/M-LVL + compteur de liaisons, anneau doré sur le plan courant, ⛔ grisé si absent de l'appareil, plans sans liaison en bande dédiée ; frontières = traits dont l'épaisseur suit le nombre de liaisons). Clic bulle = ouvrir le plan (arrivée sur son premier portail), clic trait = liste filtrée aux liaisons de cette frontière, bulles déplaçables. 100 % local, rendu SVG sans bibliothèque.
- **🌐 Recherche multi-plans** (v1.58.0) : cherche un point dans **tous les plans de la bibliothèque** — depuis l'accueil (**barre de recherche 🔎 au centre de l'en-tête** : depuis v1.72.1 les résultats apparaissent **en direct sous la barre** dès 2 caractères — plans et points, clic = chargement du plan et centrage ; Entrée ou 🔎 = recherche complète en modale) ou via la recherche Ctrl+K (bouton « Chercher dans tous les plans », saisie conservée). Chaque résultat porte le badge de son plan ; un clic charge le plan, bascule sur le bon niveau et centre la vue.

---

<!-- @@PROFIL tous -->
# ❓ FAQ — questions et solutions

<!-- @@PROFIL usage,diagnostic -->
### Le tracker dérive énormément après quelques pas

Le tracker PDR est **expérimental**. La dérive est inévitable, mais peut être réduite :

- **Calibre l'échelle** dans ⚙️ Réglages → "Calibrer l'échelle" (clique 2 points dont tu connais la distance réelle).
- **Recale ta position régulièrement** : mode 📍 Recalage (clic sur un point connu) ou bouton 📍 Je suis ici depuis le popup d'un point.
- **Tiens le téléphone bien orienté** (écran face à toi, dans le sens de la marche).
- **Évite de remettre le téléphone en poche** pendant le tracking.

<!-- @@PROFIL diagnostic -->
### Mon plan crash au chargement / au dézoom

Saturation mémoire — typique des gros plans sur mobile. Solutions par ordre d'impact :

1. **Convertis ton plan en V2 tuilé** (depuis v149, solution la plus efficace) : 🏗️ Générateur → cocher 🧱 Convertir en V2 tuile → 📦 Générer → réimporter le ZIP V2. La conso mémoire passe de "image entière en RAM" à ~16 MB max au runtime. Conversion **lourde**, à faire sur PC plutôt que mobile (cf recette « 🧱 Convertir un plan V1 en V2 tuilé »).
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
6. À terme : optimise le plan (voir la recette « Optimiser un plan qui plante sur mobile »).

<!-- @@PROFIL usage,diagnostic -->
### C'est quoi les badges V1 / M-LVL / V2 sur les lignes de la liste de plans ?

Indicateurs visuels du **mode** de chaque plan dans le loader (depuis v150) :

- **V1** (gris discret) : plan classique, image entière chargée en RAM au boot. Mode par défaut historique.
- **M-LVL** (jaune) : plan **multi-niveau**, contient des éléments tagués par niveau + le mode est activé (`plan.multiLevel: true`). Carrière multi-étages. Cf glossaire et recette « 🏗️ Activer le mode multi-niveau ».
- **V2** (violet) : plan **tuilé V2**, image découpée en tuiles 512×512 sur 4 niveaux de zoom. Conso mémoire massivement réduite au runtime. Cf glossaire et recette « 🧱 Convertir un plan V1 en V2 tuilé ».

Plusieurs badges peuvent coexister sur un même plan (un V2 peut aussi être multi-niveau). Couleur cohérente avec les UI internes : jaune = niveau (pastille `[N]`), violet = V2 (checkbox planner).

<!-- @@PROFIL usage,diagnostic -->
### Le tracker ne pointe pas dans la bonne direction sur ma carrière (boussole déraille)

C'est probablement une perturbation magnétique. Les armatures métalliques (rails, ferraille, plaques d'égout) faussent fortement le magnétomètre du téléphone.

1. **Active la boussole de validation** : groupe 🧭 Tracker → sous-action 🧭 Afficher la boussole. Elle affiche une rose des vents en haut-gauche qui tourne pour pointer vers le vrai Nord. Marche dehors / en surface, déraille parfois en sous-sol.
2. **Recale manuellement** le tracker dès que tu reconnais un repère sur le plan : 📍 Mode recalage → clic sur le point reconnu.
3. **Utilise une vraie boussole physique** en parallèle — c'est la recommandation officielle (le tracker est un outil de debug, pas de localisation fiable, cf popup d'avertissement au démarrage).

<!-- @@PROFIL diagnostic -->
### J'ai perdu ma session quand j'ai fermé l'app

L'auto-sauvegarde (1.5s) couvre normalement ce cas. Si tu ne la retrouves pas :

- Vérifie que tu rouvres bien le **même plan** (même nom + version exacte).
- La session n'est PAS partagée entre plans différents — mais depuis v1.16.1 **chaque plan a son propre emplacement** : changer de plan n'écrase plus la session du précédent, tu la retrouves en revenant dessus.
- Pour plus de sécurité long-terme : exporte ta session régulièrement via 💾 Enregistrer la session (fichier .json).
- Même si la session est perdue, la **sortie** correspondante reste dans **📔 Mon carnet** (depuis v1.69.0) avec sa date, sa durée, sa distance et ses compteurs — le carnet n'est pas effacé avec la session. En revanche il n'archive PAS les points/tracés eux-mêmes : il ne remplace pas un export.

<!-- @@PROFIL usage,diagnostic -->
### Le module Itinéraire dit "aucun chemin trouvé"

Le pathfinder a besoin d'un **réseau de routes connectées** :

- Vérifie qu'il y a des tracés (Principal/Secondaire/Chemin) entre tes waypoints.
- Les routes peuvent être dans la session OU dans les calques de données du plan (visibles ou masquées — toutes sont prises en compte).
- L'app connecte automatiquement les routes qui se croisent visuellement (tolérance 15 px). Si rien ne se touche, il faut tracer une route de raccordement.

<!-- @@PROFIL diagnostic -->
### J'ai vu une modale rouge au démarrage avec "🚨 ALERTE", c'est quoi ?

C'est le système d'**alertes publiques** de MyKTAMap. L'auteur peut diffuser des messages d'alerte à toute la communauté en cas de situation à risque (incendie en cataphilie, fermeture d'accès, gaz toxiques, etc.) en éditant le fichier `alert.json` côté serveur.

**3 niveaux** :
- **🚨 emergency** : rouge pulsant, situation critique (gaz, incendie, accident)
- **⚠️ warning** : orange, info importante (perturbation, événement)
- **ℹ️ info** : bleu, annonce neutre

Lis attentivement le message + la liste de consignes, puis clique **"J'ai compris"** pour acquitter. La modale ne réapparaîtra plus tant que l'alerte est la même.

Si tu veux re-consulter l'alerte plus tard, clique le bouton **🚨** dans le header du loader (à gauche du 📖). Il te montrera l'état actuel — soit l'alerte rouge si toujours active, soit une modale verte **"✅ Aucune alerte en cours"** si la situation est revenue à la normale.

<!-- @@PROFIL diagnostic -->
### C'est quoi le petit badge `v143` (ou similaire) en bas du loader ?

C'est le **badge version** de l'application. Il indique la version actuellement installée chez toi.

**État normal** : gris discret avec bordure subtile. Au clic, affiche une modale compacte avec :
- La version installée (en monospace vert)
- La date de publication
- Les **notes de cette version** (changelog de ce que tu utilises actuellement)

**État "mise à jour disponible"** : le badge devient **bleu et clignote**, et affiche la transition (ex: `v141 → v143`). Au clic, ouvre la modale **🔔 Mise à jour disponible** avec les choix Mise à jour douce / Reset complet.

> 💡 Tu peux cliquer le badge à tout moment pour relancer la modale d'update — pratique si tu avais cliqué "Plus tard" et que tu changes d'avis.

<!-- @@PROFIL diagnostic -->
### Je veux vérifier s'il y a encore une alerte active

Clique le bouton **🚨** dans le header du loader (à gauche du 📖 Documentation). Trois réponses possibles :
- Modale rouge "🚨 ALERTE" → alerte toujours active, lis les consignes
- Modale verte "✅ Aucune alerte en cours" → situation revenue à la normale
- Modale "📡 Vérification impossible" → tu es hors ligne, réessaie avec du réseau

<!-- @@PROFIL usage -->
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

Voir la recette **« ⛑️ Mode urgence — Je suis perdu »** dans la section "🍳 Recettes" pour la procédure détaillée.

<!-- @@PROFIL plans -->
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

Voir aussi la recette **« Intégrer définitivement ta session dans le ZIP du plan »** dans la section "🍳 Recettes" pour la procédure détaillée.

<!-- @@PROFIL usage -->
### Comment partager un plan avec un ami ?

1. Loader → **🏗️ Générer un plan** → "Modifier existant" → sélectionne ton plan.
2. Si rien à modifier, clique directement **📦 Générer le ZIP**.
3. Envoie le `.zip`.
4. L'ami le charge via la zone drop du loader.

<!-- @@PROFIL plans -->
### Comment ajouter un nouveau type d'icône (ex: "fontaine") ?

Via 🏗️ Générer un plan → "Modifier existant" → onglet Icônes → ajoute un tag custom (nom + image PNG 50×50 transparent) → regénère.

<!-- @@PROFIL diagnostic -->
### L'app me dit "⚠️ ARRÊT BRUTAL DÉTECTÉ" au démarrage

L'OOMGuard a détecté que la session précédente a été tuée par le système (OOM — out of memory).

- C'est normal sur mobile avec un gros plan.
- Pour éviter la prochaine fois : baisse le preset performance, réduis l'image base, ferme les autres apps.

<!-- @@PROFIL diagnostic,plans -->
### L'app me dit "🧱❌ Génération V2 interrompue" au démarrage

Variante spécifique du détecteur de kill OOM (depuis v152), focalisée sur la **génération V2**. Tu avais lancé une conversion V2 (case 🧱 du générateur) et le navigateur a tué la page pendant la conversion — typique sur mobile avec une image source > 8K×8K.

**Solutions** (par ordre d'efficacité) :
1. **Refaire la conversion sur PC** plutôt que mobile (plafond mémoire navigateur 4-8 Go au lieu de ~500 Mo iOS).
2. **Réduire l'image source** (la passer en JPEG qualité 85, dimensions ≤ 8000 px de côté).
3. **Fermer toutes les autres apps** en arrière-plan avant de relancer la conversion sur mobile.

<!-- @@PROFIL diagnostic,plans -->
### J'ai eu une modale rouge "❌ Échec de génération" pendant la conversion V2

Depuis v152, la génération V2 attrape toutes les erreurs internes (drawImage, toBlob, saturation mémoire) au lieu de planter silencieusement.

La modale t'indique la **cause exacte** (avec les coordonnées de la tuile qui a échoué : `(z, col, k)`) + des **conseils actionnables**. Lis le message et applique le conseil :
- Erreurs `drawImage` ou `toBlob` → typiquement OOM, baisse la taille de l'image source ou passe sur PC.
- Erreur "saturation mémoire" → idem, plafond du navigateur atteint.

<!-- @@PROFIL tous -->
### Je veux utiliser MyKTAMap commercialement (entreprise, prestation payante)

L'usage commercial est **interdit par défaut** (licence CC BY-NC-SA 4.0). Une licence commerciale séparée est nécessaire. Contacte l'auteur via Instagram **@karma_kta** — ou par email **contact@myktamap.fr** (notamment pour tout usage professionnel / commercial) pour discuter.

<!-- @@PROFIL tous -->
### Je voudrais contribuer au projet (code, traduction, retour terrain)

La collaboration est **ouverte sur demande**. Contacte l'auteur via Instagram **@karma_kta** — ou par email **contact@myktamap.fr** (notamment pour tout usage professionnel / commercial) en décrivant ce que tu veux apporter — chaque contribution nécessite un accord écrit préalable (cohérence du projet, respect de la licence).

<!-- @@PROFIL tous -->
### Puis-je consulter le code source ?

Le code source n'est **pas distribué publiquement**. Il n'existe pas de dépôt Git ouvert. Pour toute question technique précise, l'auteur reste joignable via Instagram **@karma_kta** — ou par email **contact@myktamap.fr** (notamment pour tout usage professionnel / commercial).

<!-- @@PROFIL usage -->
### Exporter en PDF imprimable (depuis v1.10.3)

> Mots-clés : "exporter en PDF", "imprimer le plan", "PDF imprimable", "format A0/A1/A2/A3/A4", "PDF portrait paysage", "PDF avec légende", "papier", "impression terrain", "PDF Google Earth", "PDF Avenza", "carte papier", "atlas papier".

**Accès** : ⬆️ **Enregistrer** → 📤 **Exporter en PDF imprimable** (bouton à côté de l'export PNG).

**Modale options** :
1. **📐 Taille** : A0 / A1 / A2 / A3 / A4 (5 radios) — défaut A4
2. **↔️ Orientation** : Portrait / Paysage (2 radios) — défaut Paysage
3. **📦 Annotations de session** : Points / Tracés / Zones / Structures (compteurs live, cases grisées si 0)
4. **🖼️ Image de base & calques** : checkbox Image plan + 1 case par `imageLayers[]` du plan
5. **📊 Calques de données** : 1 case par `dataLayers[]` du plan (puits, vehicules, structure…). Le calque "editor" apparaît marqué `(= calque session)`. Pré-cochage = visibilité actuelle sur la carte.
6. **🎨 Mise en page** : checkbox Header (titre + métadonnées)
7. **🗺️ Légende** :
   - Toggle "Inclure la légende posée sur le plan"
   - Position : ↖ Haut-gauche · ↗ Haut-droite · ↙ Bas-gauche *(défaut)* · ↘ Bas-droite
   - Taille : Compact (icônes 16px) · Standard (22px) · Large (30px)
   - Style : 🆕 **Pro fond blanc** *(défaut, impression papier)* · Sombre opaque · Sombre semi-transp. · Filigrane discret
8. **📏 Qualité** : Standard ×1 *(recommandé A3/A4)* · HD ×2 *(recommandé A0/A1, fichier plus lourd)* · Brouillon ×0.5

**Pipeline interne** : `_genererCanvasPlan(opts)` appelle `window.MyKTAMapExporterGenererCanvas` (réutilise le canvas de l'export PNG avancé) → encode JPEG q88 → `pdf.addImage(...)`. La légende est rendue séparément via `window.MyKTAMapExporterGenererCanvasLegende` puis collée en overlay PNG au coin choisi.

**Filename** : `<plan>_<date>.pdf`

**Crédit footer** (1 ligne discrète en bas à droite) : `Généré par MyKTAMap · CC BY-NC-SA 4.0 · myktamap.fr`

**Limitations connues** :
- jsPDF Helvetica n'a que la couverture Latin-1 — **aucun emoji dans le texte natif PDF**. Les emojis dans la légende OK car la légende est une image canvas raster avant collage.
- A0/A1 + qualité ×2 : 30-60 sec de génération sur mobile (gros canvas).
- Pas de footer dédié (la légende est en overlay sur le plan) — on gagne ~25-40% de zone plan vs un footer fixe.

<!-- @@PROFIL usage -->
### Undo / Redo global Ctrl+Z / Ctrl+Y (depuis v1.11.0)

> Mots-clés : "annuler", "undo", "Ctrl+Z", "Cmd+Z", "rétablir", "redo", "Ctrl+Y", "annuler ma dernière action", "j'ai supprimé par erreur", "j'ai cliqué par accident", "remettre comme avant", "historique des actions", "annuler le tracé", "annuler le point", "récupérer un point supprimé", "raccourci clavier annuler".

**Accès** :
- **Raccourcis clavier global** (recommandé) :
  - **Ctrl+Z** ou **Cmd+Z** → annuler
  - **Ctrl+Y** ou **Cmd+Y** → rétablir
  - **Ctrl+Shift+Z** ou **Cmd+Shift+Z** → rétablir (convention Mac/Linux)
- **Boutons sidebar** : nouveau groupe **⏪ Historique** avec 2 sous-actions ⏪ Annuler / ⏩ Rétablir, auto-grisées quand la pile est vide

**Ce que l'undo couvre** :
- ✏️ Editor points : ajout, modification (nom/tag/desc/level), suppression dernier, suppression au clic
- 🛣️ Tracés : chaque clic posant un sommet, suppression dernier, suppression au clic, "Tous les tracés"
- ⬛ Zones : idem + fermeture par retour au 1er point
- 🏛️ Structures : idem (piliers polygon + fronts polyline)

**Ce que l'undo NE couvre PAS** :
- ❌ **Photos POI** : leur suppression reste **irréversible** (les blobs sont effacés de IndexedDB locale, pas restaurables). Décision design : restore exigerait un cache RAM des blobs qui explose vite sur photos haute résolution.
- ❌ **Import de session** : un import qui écrase ta session n'est pas Ctrl+Z-able (race conditions). Utiliser SessionPersist (auto-save toutes les 1.5s) pour récupérer si problème.
- ❌ **Tracker** : capteurs temps réel, pas une mutation persistante
- ❌ **Mesure** : outil éphémère, pas dans le périmètre "session"

**Caractéristiques** :
- **Limite** : 50 actions max (FIFO — au-delà, les plus anciennes sont oubliées)
- **Granularité** : action atomique (1 clic = 1 annulable, pas un groupe)
- **Persistance** : RAM only (perdu au reload). Cohérent avec philosophie "session active = par session de travail".
- **Reset auto au plan switch** : changer de plan vide l'historique (pas d'undo cross-plan)
- **Toast feedback** : `↩ Annulé : Pose du point PA1` ou `↪ Refait : Suppression de Zone Eau #2` (via `OOMGuard.showToast`)
- **Save SessionPersist forcé** après chaque undo/redo (pas perdu si reload juste après)

**Anti-vol focus clavier** : Ctrl+Z est intercepté UNIQUEMENT si l'utilisateur n'est pas en train de taper dans un INPUT/TEXTAREA/contenteditable. Ça permet de garder l'undo natif du navigateur fonctionnel dans les champs texte.

**API publique** (pour les futurs modules à instrumenter) :
- `window.HistoryManager.captureState()` → renvoie `{editorPoints, roads, zones, structures}` deep clone
- `window.HistoryManager.record(label, beforeState)` → push une entrée
- `window.HistoryManager.recordAction(label, mutationFn)` → helper combinant capture + run + record
- `window.HistoryManager.undo()` / `redo()` / `canUndo()` / `canRedo()` / `reset()` / `onChange(cb)`

**Conseil à donner à l'utilisateur** :
- "Je viens de supprimer un point par erreur" → Ctrl+Z immédiatement
- "Je veux récupérer la session précédente" → ⚠️ Ctrl+Z ne suffit PAS si tu as reload la page entre temps. Utiliser SessionPersist (toast bleu au boot proposant de restaurer).
- "Je veux annuler une suppression de photo" → ⚠️ **impossible**, c'est irréversible. Re-importer le ZIP du plan si tu as une sauvegarde.

<!-- @@PROFIL usage -->
### Mode urgence "panique" 🚨 — différent de ⛑️ "Je suis perdu" (depuis v1.10.1)

> Mots-clés : "mode panique", "je panique", "affichage XL", "position en grand", "mode urgence rapide", "boussole géante", "panic mode", "mode 911", "info vitale en gros", "écran lisible loin", "minimap urgence", "differencier mode urgence", "🚨 vs ⛑️".

**⚠️ Distinction importante** : il existe **deux modes urgence distincts** dans MyKTAMap, ne pas les confondre :

| | ⛑️ Je suis perdu | 🚨 Mode panique |
|---|---|---|
| Hypothèse | Tu **NE SAIS PAS** où tu es | Tu **SAIS** où tu es (le tracker l'affiche) |
| Objectif | Estimer une zone probable | Lire vite des infos vitales en gros |
| Calcul | Cercle = vitesse × temps, intersection avec indices visuels | Aucun calcul — affichage XL en temps réel |
| Sortie utile | Zone orange + indices violets + rapport texte copiable | Coords XL + cap boussole géant + minimap focus |
| Quand l'utiliser | "Je n'ai plus aucun repère depuis 30 min" | "Je panique à un croisement, j'ai besoin de me re-orienter vite" |
| Module source | `js/lostMode.js` | `js/emergencyMode.js` (v1.10.1) |

**Accès 🚨 panique** : sidebar → **🧭 Tracker** → bouton rouge **🚨** (à côté du ⛑️ orange).

**Ce que le mode affiche** :
- 📍 **Position XL** : coordonnées plan en énormes caractères (lisible à 1 m du téléphone — situation où tu ne veux pas plisser les yeux ni approcher)
- 🧭 **Boussole géante avec aiguille tournée** : sens de marche basé sur le magnétomètre + accéléromètre. Mise à jour live via les capteurs d'orientation du téléphone (DeviceOrientationEvent).
- 🗺️ **Minimap auto-focus** centrée en permanence sur le tracker (~20-50 m d'horizon à zoom 5). Affiche les **roads + zones + structures du plan en arrière-plan** pour repérer chemins/sorties/dangers à proximité immédiate.
- 🌗 **Thèmes** : sombre par défaut, basculement clair possible (à choisir selon la luminosité extérieure).
- 🔋 **Wake Lock** activé : l'écran ne s'éteint pas tant que le mode est actif.

**Permissions** : `DeviceOrientationEvent.requestPermission()` (iOS) déclenché au 1er Play du mode si pas déjà accordé. Sans permission, la boussole reste figée mais la position XL + la minimap continuent de marcher (le tracker est indépendant des capteurs d'orientation).

**Wake Lock** : `navigator.wakeLock.request("screen")` posé à l'ouverture du mode, relâché à la fermeture (✕).

**Quand recommander chacun** :
- L'utilisateur dit "je suis perdu", "je ne sais plus où je suis", "je veux estimer ma zone" → ⛑️ Je suis perdu
- L'utilisateur dit "je panique", "j'ai besoin d'infos vite en gros", "je dois lire ma position pour la transmettre", "je veux me re-orienter au plus vite" → 🚨 Mode panique
- L'utilisateur peut aussi enchaîner les deux : utiliser le ⛑️ pour estimer une zone, puis le 🚨 pour avancer dans la zone en gardant un œil sur le cap

**Limitations** :
- Le 🚨 suppose que le tracker est actif et donne une position fiable. Sur un plan où le tracker n'est pas démarré, le mode panique reste utilisable mais la "position XL" reste vide / désactivée.
- Comme tout l'app : aucune transmission automatique vers les secours. Pour communiquer, tu lis tes coords XL et tu les envoies par SMS/radio toi-même.
- La boussole utilise le magnétomètre, **faussée à proximité de structures métalliques** (béton armé, voies ferrées). Vérifier la cohérence en pivotant le téléphone sur place avant de se fier au cap.

<!-- @@PROFIL usage -->
### 🚨 Mode Secours — Coordination d'équipes de recherche (depuis v1.22.0 + Phase 3 v1.24.0)

> Mots-clés : "plan de secours", "équipe de recherche", "coordonner les secours", "GRIMP pompiers spéléo", "carte d'opération", "opérateur surface", "secouriste libre", "équipier terrain", "stepper d'étape", "rapport au fil de l'eau", "victime trouvée", "Demi-tour forcé", "Pending RAS Suspect Bloqué Indice Aide", "Live Mode", "mode exécution temps réel", "couleurs OTAN Alpha Bravo Charlie Delta Echo Foxtrot Golf Hotel India Juliet", ".mkmsec.json", ".mkmsec.report.json", "Lancer le plan de secours", "Prendre la main", "👤 Retour Opérateur".

**Distinction des 3 modes "urgence" MyKTAMap** :

| | ⛑️ Je suis perdu | 🚨 Mode panique | 🚨 Mode Secours |
|---|---|---|---|
| Hypothèse | Je NE SAIS PAS où je suis | Je SAIS où je suis (tracker actif) | UN AUTRE est perdu, on l'organise |
| Cible | Moi-même | Moi-même | Équipe(s) de recherche |
| Sortie utile | Cercle zone probable + indices | Coords XL + boussole géante | Plan multi-équipes coordonné + rapport |
| Quand | "J'ai perdu mes repères" | "Je panique à un croisement" | "Marc est porté disparu, on organise les secours" |
| Module | `js/lostMode.js` | `js/emergencyMode.js` | `js/secoursMode.js` + `js/secoursPhotos.js` |

**Accès** : sidebar → flyout urgences (groupe 🧭 Tracker) → bouton rouge **🚨 Mode Secours**.

#### Architecture conceptuelle — 2 états du scénario

Un scénario Mode Secours a 2 états :

1. 📝 **CRÉATION** (vue Édition) — préparation/planning. Tu définis équipes + parcours + zones + itinéraires. Phases 1+2 (v1.22.0 + v1.23.x).
2. 🚀 **EXÉCUTION** (vue Live temps réel) — incident déclenché. Tu suis les observations terrain. Phase 3 (v1.24.0+).

Bascule via le **bouton « 🚀 Lancer le plan de secours »** dans la vue Édition.

#### Workflow type complet

```
1. PRÉ-INCIDENT (préparation sur table)
   ├─ Création scénario nommé "Test - Glacière oct 2026" (calibration équipe)
   ├─ Équipes Alpha/Bravo/Charlie (couleurs OTAN auto)
   ├─ Parcours : entrée + intermédiaires + sortie + zone + itinéraire auto-calc
   └─ Export PDF + KMZ pour briefing initial

2. INCIDENT RÉEL → Lancement
   ├─ Clic 🚨 Mode Secours → re-créer scénario "Recherche Marc 26/05/2026"
   ├─ (Optionnel) clic 🚨 depuis Lost Mode → auto-pre-fill lastKnownPoint + zone d'incertitude
   ├─ Clic « 🚀 Lancer le plan » → modale sélection rôle
   │   ◉ 👤 Opérateur surface (PC chef)
   │   ○ 🚨 Équipe Alpha (secouriste assigné)
   │   ○ 🚑 Secouriste libre (renfort sans équipe)
   └─ Bascule en vue Live selon rôle

3. EXÉCUTION TEMPS RÉEL (vue Live)
   ├─ Équipier terrain : suit parcours step-by-step, commente chaque étape,
   │  prend photos via 📸 (max 5/étape, IDB local dédié),
   │  clique 1 des 7 statuts rapides (RAS/Suspect/Bloqué/Indice/Aide/Demi-tour/Victime),
   │  navigation prev/next entre étapes (auto-RAS au passage sans statut)
   ├─ Opérateur surface : vue d'ensemble cards multi-équipes, voit en live le statut
   │  le + sévère de chaque équipe + dernière obs snippet, peut "Prendre la main"
   │  sur une équipe pour saisir une obs à sa place (puis bouton « 👤 Retour Opérateur »)
   └─ Secouriste libre : notes en vrac chronologiques DESC avec timestamps

4. RAPPORT AU FIL DES ÉTAPES (à tout moment)
   ├─ Bouton « 📤 Rapport » dans chaque vue Live (scope adapté au rôle)
   ├─ 3 formats au choix :
   │   📄 PDF imprimable A4 → impression / archivage / passation papier
   │   📦 .mkmsec.report.json → consolidation cross-device (v1.26.0 future)
   │   📋 Texte presse-papier → Discord/SMS/mail rapide
   └─ Rapport reflète l'état COURANT, réutilisable autant de fois

5. ARRÊT DU PLAN
   ├─ Clic « ⏹️ Terminer le plan »
   ├─ Bandeau « 📦 PLAN TERMINÉ » apparaît dans vue Édition
   ├─ Observations conservées comme historique
   └─ « 📤 Voir le rapport historique » + « 🚀 Relancer » disponibles
```

#### 7+1 statuts d'étape (TABLEAU_STATUTS extensible)

| Emoji | ID | Label | Couleur | Severity | Signal |
|---|---|---|---|---|---|
| • | `pending` | En attente | gris | 0 | Statut par défaut |
| 🟢 | `ras` | RAS | vert | 0 | Rien à signaler |
| 🟡 | `suspect` | Suspect | jaune | 1 | Traces / bruits / odeurs |
| ⬛ | `bloque` | Bloqué | gris foncé | 1 | Passage impraticable |
| 🔵 | `indice` | Indice | bleu | 1 | Objet / vestige trouvé |
| 🟠 | `aide` | Aide demandée | orange | 2 | Renfort matériel / humain |
| 🟣 | `demi-tour` | Demi-tour forcé | violet | 1 | Parcours abandonné |
| 🚨 | `victime` | **Victime trouvée** | rouge | 3 | **URGENCE ABSOLUE** — déclenche rouge clignotant côté PC |

Severity 0-3 utilisée pour tri/escalade dans la vue Opérateur (card prend la couleur du statut le + sévère parmi toutes les étapes).

#### Persistance & stockage

| Donnée | Stockage | Détail |
|---|---|---|
| Scénarios | `localStorage["myktamap_secours_v1_<planId>"]` | Multi-scénarios par plan, cap 10 FIFO |
| Photos étapes | IDB `myktamap_secours_photos` v1 | Store dédié séparé du POI, 3 indexes scenarioId+equipeId+stepIdx |
| Pause cross-feature | `localStorage["myktamap_iti_pause_enabled"]` + `_minutes` | Partagé avec itinéraire principal |
| Calibration KMZ géoref | `localStorage["myktamap_calib_<planId>"]` | Format FLAT `{pointA: {x,y,lat,lng}, pointB: {x,y,lat,lng}}` (cf §32.7 corrigé en §68) |

#### Quand recommander chacun des 3 rôles

- L'utilisateur dit "je suis le chef de l'opération", "je coordonne depuis la surface", "je vois toutes les équipes" → **👤 Opérateur surface**
- L'utilisateur dit "je fais partie de l'équipe X", "je descends avec Alpha", "je suis mon parcours" → **🚨 Équipier**
- L'utilisateur dit "j'arrive en renfort", "je n'ai pas d'équipe assignée", "je fais de la reconnaissance" → **🚑 Secouriste libre**

#### Limitations (pour anticiper questions user)

- **Single-device pour l'instant** : chaque rôle tient son propre suivi en local. La consolidation cross-device (= opérateur surface importe les rapports des équipes au retour pour fusionner) viendra en v1.26.0.
- **QR code share — ABANDONNÉ** (v1.25.3-hotfix17, Phase 4 rollback) : la voie QR Code testée en hotfix8→16 a été abandonnée. Le scan post-compression WhatsApp / Telegram s'avérait trop fragile sur les payloads denses (briefing 2-3 KB en QR v25+, MIN_CELL_PX 8 demandé par jsQR). Le partage entre devices passe par le rapport `.mkmsec.report.json` (export sur device émetteur → import sur device récepteur par mail/clé USB/AirDrop au retour surface).
- **Pas de transmission automatique vers les secours externes** : c'est un outil de coordination INTERNE à ton équipe. Pour appeler les pompiers/GRIMP, tu utilises ton téléphone normal.
- **Photos compressées localement** : max 1920px côté long + JPEG q85 → ~200-400 KB par photo (au lieu de 3-5 MB raw smartphone). Pas de fallback "qualité originale" — choix volontaire pour limiter l'IDB.
- **Plan switch préserve l'execution active** : tu peux switcher entre plans avec un Mode Secours en cours, l'execution reste intact dans le scénario du plan source (cohérent persistance per-plan).

#### Format `.mkmsec.json` vs `.mkmsec.report.json`

| | `.mkmsec.json` (v1.23.4) | `.mkmsec.report.json` (v1.25.0) |
|---|---|---|
| Type | `myktamap-secours-scenario` | `myktamap-secours-report` |
| Contenu | Définition du scénario (équipes, parcours, zones) | Snapshot d'exécution (observations, statuts, photos) |
| Cas d'usage | Partage de la PRÉPARATION (avant incident) | Partage des OBSERVATIONS (pendant/après mission) |
| Photos | Non (pas pertinent pré-incident) | Oui (en base64 si checkbox cochée) |
| Re-import | Restaure le scénario (nouvel id, modale preview) | Pas encore, prévu v1.26.0 consolidation |
| Format version | `MKMSEC_FORMAT_VERSION = 1` | `REPORT_FORMAT_VERSION = 1` |

<!-- @@PROFIL usage -->
### Recherche unifiée — 4 catégories + Ctrl+K (depuis v1.10.3)

> Mots-clés : "rechercher un tracé", "rechercher une zone", "rechercher une structure", "rechercher un pilier", "recherche rapide", "command palette", "Ctrl+K", "Cmd+K", "raccourci recherche", "raccourci clavier recherche", "barre de recherche", "filtre par catégorie".

**Avant v1.10.3** : la recherche ne couvrait que les **points** (data layers + session).

**Depuis v1.10.3** : la recherche couvre **4 catégories** :
- 📍 **Points** : data layers + session (comportement préservé)
- 🛣️ **Tracés** : session + embedded (auto-label "Tracé Principal #3" si pas de label)
- ⬛ **Zones** : session + embedded (auto-label "Zone Eau #1")
- 🏛️ **Structures** : session + embedded (auto-label "Pilier 1ère masse #2")

**Accès** :
- Bouton **🔍** dans la barre latérale droite (comme avant)
- 🆕 **Raccourci clavier Ctrl+K** (`Cmd+K` sur Mac) — depuis n'importe où dans l'app. Toggle : ferme la modale si elle est déjà ouverte.
- Anti-vol de focus : Ctrl+K ne se déclenche pas si l'user est en train de taper dans un input/textarea (sauf si la modale recherche est déjà ouverte → on autorise le close).

**UX modale** :
- Champ search en haut, focus auto à l'ouverture
- Sous le champ : filtres chips en 3 lignes (selon disponibilité du contenu) :
  - **🆕 Catégorie** : 4 chips `📍 Points (N) · 🛣️ Tracés (M) · ⬛ Zones (K) · 🏛️ Structures (L)` avec compteur live. Affiché uniquement si ≥ 2 catégories ont du contenu.
  - **Calques** (points-only) : chip par data layer
  - **Tags** (points-only) : chip par tag
- Résultats **groupés par catégorie** avec headers `📍 POINTS (12)`, `🛣️ TRACÉS (3)`, etc.
- Cases grisées si compteur = 0

**Au clic d'un résultat** :
- **Point** → centre + popup marker + cercle jaune 3 sec *(inchangé v1.7.x)*
- **Tracé / front de taille** → centre sur centroïde + polyline jaune dashed 4 sec + popup info
- **Zone / pilier / mur** → centre + polygon jaune transparent 4 sec + popup info
- Popup info : label + type FR (`Principal`, `Pilier 1ère masse`...) + niveau M-LVL si actif + nb points + layer d'origine

**Champs cherchés** :
- Points : nom + id + tags + description + état
- Roads/Zones/Structures : label + type + label FR du type + niveau

**Limitations connues** :
- Le filtre "Calque" et "Tag" ne s'applique QUE aux points (les tracés/zones/structures n'ont pas de structure équivalente).
- API publique `SearchPoints.getAllPoints()` et `findByQuery()` continuent de retourner du format point-only (pour préserver Pathfinder + Itinéraire). Le format unifié 4-cat est strictement interne au module.

---

<!-- @@PROFIL usage -->
### Recherche par coordonnées GPS (depuis v1.25.3-hotfix18)

> Mots-clés : "rechercher par GPS", "coller des coordonnées", "format Google Maps", "lat lng", "48.6 2.1", "créer un point GPS", "où est cette coordonnée", "navigation Maps vers plan".

**Format accepté** : `48.680831, 2.158843` (= format natif Google Maps quand on clique droit "copier les coordonnées"). Plages valides : `[-90, 90] × [-180, 180]`. Le code refuse les formats DMS (`48°40'51"N`), UTM, MGRS (cf §70.7 CLAUDE.md — décision KARMA pour MVP).

**Conditions d'utilisation** :
- Le **plan doit être géoréférencé** (calibrage 2 points GPS configuré dans ⚙️ Paramètres → Géoréférencement ou via Settings KMZ ou à la création du plan)
- L'app détecte le format dans la barre Ctrl+K via regex stricte + validation plage

**4 cas gérés** (cards UI distinctes) :
1. **Plan non calibré** → card orange "⚠️ Plan non géoréférencé" avec lien "⚙️ Calibrer"
2. **Format invalide** (lat hors plage, etc.) → recherche texte standard (parseGpsCoords renvoie null)
3. **Coordonnées hors plan** (en dehors du rectangle calibré) → card rouge "🚫 Hors plan" avec détails px
4. **POI dans 50 px** → card verte "🎯 Aller au point" avec nom POI + distance
5. **Aucun POI proche** → card bleue "➕ Créer un point ici" → ouvre formulaire de saisie pré-rempli

<!-- @@PROFIL usage -->
### Input GPS combiné (depuis v1.25.3-hotfix21)

> Mots-clés : "champ GPS combiné", "coller coords GPS dans Settings", "format lat,lng partout", "input unique géoréférencement".

**Avant hotfix21** : 2 champs séparés `GPS lat` + `GPS lng` (type number) dans 3 modales (Settings création/modif plan, Modale KMZ Export, Settings KMZ paramétrage). User devait coller à 2 endroits différents.

**Depuis hotfix21** : 1 seul champ `GPS (lat, lng)` (type text) qui accepte le format Google Maps directement. Validation live (border rouge + message si format invalide au blur). Stockage interne **inchangé** : toujours FLAT `pointA: {x, y, lat, lng}`.

API JS pour étendre à d'autres modales : `window.formatGpsCoords(lat, lng) → string` + `window.attacherGpsValidationCombo(input, { errorEl }) → { validate(), parse() }`. Cf §70 CLAUDE.md.

<!-- @@PROFIL diagnostic -->
### Kill switch d'urgence + soft update optimisé (v1.25.3-hotfix19/20/21)

> Mots-clés : "PWA bloquée", "iOS coincée", "killsw", "reset SW", "purge cache app", "mise à jour douce lente".

**Outils ajoutés pour récupération app coincée après MAJ douce** :
- **`?killsw=1`** (hotfix19) : query param URL qui déclenche une IIFE inline dans `index.html` AVANT tout autre script — désinscrit SW + purge tous les caches `caches.delete()` + alert succès + reload. Préserve localStorage / IDB / sessionStorage / cookies.
- **`/killsw.html`** (hotfix20) : page standalone à la racine, CSS+JS 100 % inline, zéro dépendance. Le SW a un bypass `network-only + no-store` pour `/killsw.html` (cf sw.js fetch handler) → toujours servie fraîche depuis le réseau. 3 étapes UI (SW unregister, caches delete, ready to reload).
- **Cause root identifiée par KARMA (mai 2026)** : un long marathon de debug iOS PWA bloqué après MAJ douce a finalement été tracé à un **VPN actif aux US** qui faisait servir le contenu depuis un edge CDN GitHub Pages pourri (mauvais MIME / asset tronqué). Premier réflexe à recommander avant toute investigation SW/iOS : **désactiver VPN + changer de réseau (4G ↔ Wi-Fi)** pour basculer d'edge CDN. Le kill switch ne sert qu'en backup si le changement réseau ne suffit pas.

**Mise à jour douce optimisée** (hotfix21) : `mettreAJourCodeSeul()` réécrit dans `js/interface.js`. Au lieu de `await reg.update()` qui bloquait 30s-2min pendant l'install du nouveau SW, on lance update() en fire-and-forget + on demande le `CACHE_NAME` courant au SW via `MessageChannel` + on purge SEULEMENT les anciens caches (préserve le cache courant pré-rempli). Au reload, le SW retrouve ses assets en cache → pas de re-download de ~100 fichiers. Gain : 45s-3min → 3-10s typique. Cf §71 CLAUDE.md pour le pattern complet.

<!-- @@PROFIL usage -->
### Import `.mkmsec.report.json` — Consolidation cross-device (v1.26.0)

> Mots-clés : "fusionner observations équipiers", "import rapport équipier", "consolidation cross-device", "partager observations entre devices", "récupérer données équipe sur PC chef", "remplacement QR rollbacked", ".mkmsec.report.json", "tableau supervision opérateur".

**Avant v1.26.0** : la Phase 3 fonctionnait **single-device** — chaque rôle tenait son propre suivi en local. Aucun moyen natif de fusionner les obs des équipiers retour terrain dans le tableau opérateur (la voie QR Share Phase 4 avait été testée puis rollbacked en v1.25.3-hotfix17).

**Depuis v1.26.0** : l'opérateur surface peut **importer le `.mkmsec.report.json`** d'un équipier (généré par la vue Live Équipe → bouton 📤 Rapport scope=équipier depuis v1.25.0) et **fusionner ses obs / statuts / photos** dans le tableau de supervision.

**Workflow type** :
1. Op prépare scénario + lance plan → distribue `.mkmsec.json` aux équipiers
2. Chaque équipier renseigne ses étapes côté terrain (single-device)
3. Au retour surface : équipier exporte son rapport `.mkmsec.report.json` (transmission via AirDrop / mail / clé USB / Discord — peu importe le canal)
4. Op ouvre vue Live → bouton **« 📥 Importer rapport équipier »** → file picker → modale preview → fusion

**Politique de fusion** :
- Observations : concaténation datée `existant + "\n\n--- 📥 Import Équipier <ts> ---\n" + importé` (aucune perte d'info)
- Statut : plus sévère via `TABLEAU_STATUTS.severity`
- Photos : push avec dédup par id (idempotent)
- Flag `_importedFrom` sur chaque étape mutée (chip UI + traçabilité)
- Audit log dans `s.execution._importLog: []`
- Snapshot SessionBackups AVANT (= undo)

**Refus à l'import** : scope ≠ "equipe" / scenario.id différent / equipe.id absent côté op / pas d'exécution active. Plan différent → warning (pas erreur).

**Limites connues** :
- 1 équipier à la fois (pas de batch import multi-fichiers en v1.26.0 — extensible cf §72.7 CLAUDE.md)
- Scope "secouriste" (notes libres) non supporté (extensible)
- Pas d'inverse formel de la fusion (undo via restauration snapshot SessionBackups uniquement)

**API JS publique nouvelle** : `window.MyKTAMapSecoursPhotos.importPhotoFromDataUrl({ id, scenarioId, equipeId, stepIdx, mime, dataUrl, sourceScenarioId }) → Promise<{ id, status: "imported"|"already-present" }>`. Préserve l'id source pour dédup, skip compression (déjà compressée à l'export), idempotent.

**Pour étendre** (cf §72.7 CLAUDE.md) :
- Batch import → `<input multiple>` + loop séquentiel
- Scope secouriste → append-only dans `_notes_libres` avec dédup par id
- Preview-only mode (read-only sans fusion) → toggle dans modale preview

---

<!-- @@PROFIL tous -->
### 🗓️ Version actuelle : {{BUILD}} (contexte généré le {{DATE}})

Nouveautés majeures récentes (résumé — le détail de chaque fonctionnalité est dans le survol en tête de document) :

- **v1.57 → v1.60** : liaisons inter-plan (portails 🌀 entre plans), recherche multi-plans, itinéraire inter-plan, mode Performance ULTRA par plan.
- **v1.61** : itinéraire vivant — replanification automatique à chaque recalage de position + validation d'étapes via « 📍 Je suis ici », dans n'importe quel ordre.
- **v1.62** : plans transparents — les images sources avec canal alpha sont tuilées sans fond ajouté (tuiles WebP/PNG).
- **v1.63** : confidentialité photos — métadonnées EXIF systématiquement supprimées ; l'export anonymisé peut inclure les photos.
- **v1.64** : itinéraire multi-hop (traverser plusieurs plans via les portails, case à cocher opt-in dans la recherche multi-plans) + points de passage avant le portail + bouton « 🗺️ C'est parti ».
- **v1.65** : vue « réseau de plans » — graphe visuel des plans et de leurs liaisons dans le gestionnaire Mes liaisons.
- **v1.67** : superposition multi-niveau — le plan principal se masque comme un calque niveau 0 ; le générateur avertit si un calque de niveau n'a pas de transparence. L'export du profil inclut le registre des liaisons.
- **v1.68** : écran d'accueil optimisé mobile (« Reprendre » en avant, liste des plans repliée sur les 5 récents, outils dans un menu 🧰). **v1.68.1** : correctif d'affichage des traductions au démarrage.

---

**Fin du document.** Les questions au-delà de ce périmètre ne sont pas couvertes — l'assistant IA doit explicitement le signaler plutôt que d'inventer.
