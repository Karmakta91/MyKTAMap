# MyKTAMap — Documentation utilisateur (version enrichie pour assistance IA)

<!--
  ✏️ POUR L'ÉDITEUR DE CE FICHIER — invisible pour l'utilisateur (l'app retire tous les commentaires HTML) :
  Rôle : contexte AUTONOME, en français, destiné à une IA externe (ChatGPT, Claude…). L'app le télécharge
  depuis `docs/applications/AI_CONTEXT.md` (modale 🤖 Aide IA, js/interfaceDocs.js), le FILTRE par profil,
  remplace les jetons DATE / BUILD (entre doubles accolades), et peut insérer un bloc « État de
  l'installation » juste avant la ligne finale « Fin du document. » en gras (à garder telle quelle). Il est aussi publié tel quel sur le site de documentation.
  À ne pas confondre avec README_USER.md (+ .en / .es) = guide HUMAIN en 3 langues, modale 📖 Documentation,
  qui n'est PAS injecté ici : ce fichier doit se suffire à lui-même (ne pas retirer une info au motif
  qu'elle est aussi dans README_USER).
  Profils : un marqueur `@@PROFIL usage,diagnostic` (en commentaire HTML seul sur sa ligne, minuscules,
  virgules) s'applique jusqu'au marqueur suivant. Profils : usage · diagnostic · plans · tous (= commun ;
  tout ce qui précède le premier marqueur est commun). Le profil « complet » garde tout.
  Règles : (1) toute nouvelle recette/FAQ reçoit un marqueur ; (2) les listes fermées anti-hallucination
  et le survol restent en zone commune ; (3) décrire l'ÉTAT ACTUEL de l'app, sans historique de versions
  ni détail d'implémentation (sauf ce qui sert au diagnostic) ; (4) aucune donnée réelle (réseau, plan,
  lieu) ; (5) rester sous ~250 Ko pour être lisible par les IA.
-->

> Document généré le **{{DATE}}** (build {{BUILD}}) par l'application MyKTAMap pour servir de **source de référence** à un assistant IA. Le lecteur (humain ou IA) doit considérer le contenu ci-dessous comme **la seule documentation officielle disponible** de l'application.

---

## ⚖️ Mentions légales

- **Auteur** : Flavien VIDAL (alias KARMA)
- **Site officiel** : https://myktamap.fr
- **Documentation en ligne** : https://doc.myktamap.fr (guide utilisateur, installer sa propre copie, ce que l'app envoie sur le réseau, sécurité) — lien aussi en fin du guide 📖
- **Licence** : **CC BY-NC-SA 4.0** — Attribution, NonCommercial, ShareAlike
  - Usage non commercial autorisé avec attribution + partage à l'identique
  - **Usage commercial strictement interdit** sans accord écrit préalable de l'auteur
- **Code source** : **public sur GitHub** (`Karmakta91/MyKTAMap`, licence CC BY-NC-SA 4.0 — usage commercial interdit sans accord). Les **données des plans** (relevés de terrain) n'y sont pas : elles restent chez leurs auteurs.
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
> Si l'utilisateur te demande quelque chose qui n'est pas dans le document, **dis-le explicitement** : *"Cette fonctionnalité n'est pas décrite dans la documentation que j'ai. Vérifie directement dans l'app ou contacte l'auteur via Instagram **@karma_kta** ou par email **contact@myktamap.fr** (usage pro / licence : **pro.myktamap.fr/presentation/**)."*

---

### 🔒 Procédure de vérification AVANT de répondre

Pour **chaque** question :

1. **Cherche le terme** mentionné par l'utilisateur dans **tout le document** (préambule + survol des fonctionnalités + glossaire + recettes + FAQ). Considère aussi les **synonymes** raisonnables : "mode urgence" ≡ "Je suis perdu" ≡ "perdu" (l'écran XL position + cap s'appelle **🔆 Affichage XL** ; 🚨 désigne la Sortie d'urgence) ; "itinéraire" ≡ "trajet" ≡ "navigation" ; "session" ≡ "annotations" ; etc.
2. Si le terme apparaît dans le survol, une recette, la doc ou la FAQ → réponds à partir de ce contexte, sans extrapoler au-delà.
3. Si le terme n'apparaît **nulle part** dans le document même après vérification des synonymes → la fonctionnalité n'existe probablement pas, dis-le clairement.
4. **Cite la section** du document où l'info est trouvée (ex : *"D'après la recette ⛑️ Mode urgence — Je suis perdu..."* ou *"D'après la section '⬛ Tracer des zones'..."*).

⚠️ **Ne dis JAMAIS "ça n'existe pas" sans avoir vérifié dans toutes les sections** (en particulier le **survol des fonctionnalités principales** ci-dessous et les **recettes** plus bas, qui contiennent les fonctionnalités modernes ajoutées récemment).

---

### 📋 Liste exhaustive des éléments qui EXISTENT (anti-hallucination)

> Cette liste te sert d'**ancrage** sur les **listes fermées** (types de zones, types de tracés, modes performance, etc.). Pour ces listes : tout ce qui n'est PAS listé ici **n'existe pas**.
>
> ⚠️ **Pour les fonctionnalités générales** (modes, outils, sections d'interface), la référence = ce survol + les **recettes** + la **FAQ** plus bas. Si l'utilisateur demande une fonctionnalité introuvable ici même après recherche de synonymes, réponds qu'elle n'est **pas couverte par le contexte fourni** et renvoie vers la **Documentation intégrée** de l'app (bouton 📖 de l'écran d'accueil) — sans affirmer qu'elle n'existe pas si le doute subsiste.

**Fonctionnalités principales** (survol — détails dans les recettes et la FAQ) :
- 🗂️ **Multi-plans** : registre de plans, import ZIP, auto-discovery serveur, modale "Plan introuvable", titre cliquable plan switcher
- 🔍 **Recherche de points** par nom / id / tag, avec filtres calques et tags, insensible aux accents
- 📐 **Réparation des plans aux réglages impossibles** : une valeur numérique du `plan-config` hors des bornes que l'écran de saisie autorise (échelle ≤ 0 ou non numérique, dimensions ≤ 0, départ négatif ou hors du plan) est **ignorée au chargement** et remplacée par la valeur d'usine, avec un avertissement en console. Le fichier du plan n'est pas modifié.
- 🧭 **Tracker PDR** (expérimental) : suivi de position inertiel sur mobile (comptage de pas + boussole), **sans GPS**. Pendant le suivi, l'icône (cône bleu) pointe la direction de marche. Mode 📍 **Recalage** pour recaler sa position : clic carte, ou « 📍 Je suis ici » depuis un point. Sous-actions : 🎯 Ma position (recentre la carte) · 🔓 Suspendre le verrou sur tracé (30 s / 1 min / 10 min, compte-à-rebours dans la barre du bas). Au rechargement d'une session, le tracker repart de la dernière position connue. Réglages avancés dans ⚙️ → Navigation & Tracker (tolérance du verrou…) ; taille de pas, seuil de détection et cooldown sont des réglages **de la personne** (⚙️ Réglages → « 👣 Détection des pas »), valables pour tous les plans de l'appareil et transportés par l'export de profil. Le menu du groupe 🧭 s'ouvre en modal plein écran : sections Suivi / Outils / Urgence + bande de statut (distance, pas).
- 🗺️ **Mode « Plan orienté »** (tuile Outils du menu 🧭 Tracker) : pendant le suivi, c'est la **carte qui tourne** pour que la direction de marche pointe vers le haut de l'écran (convention GPS auto), au lieu de l'icône qui pivote sur un plan fixe. **OFF par défaut**, choix mémorisé par appareil. Ne tourne **que tracking actif** ; la carte revient droite à l'arrêt, quand un outil « clic carte » est armé (mesure, dessin, recalage, pickers) ou qu'un mode plein écran s'ouvre (perdu / présentation / Secours / urgence / replay). La carte suit la position ; un déplacement manuel fait apparaître **🎯 Recentrer** (ce bouton existe aussi sans le mode, dès que la position sort de l'écran) ; il se place au-dessus des flottants du bas (« ↩️ Retour » d'un saut de portail, « portail suivant »…). Les textes restent droits (mesures, fiches de points), les icônes des points tournent avec la carte, le zoom à deux doigts se fait entre les doigts. Dépend de la boussole : approximatif près de grandes masses métalliques, comme le reste du tracker. Pendant ce mode, les tuiles du fond hors écran ne sont pas affichées (économie mémoire).
- ⌨️ **Raccourcis clavier** : 1 touche par outil — **E** Édition · **M** Mesure · **Z** Zones · **S** Structures · **T** Tracker · **P** Tracés · **L** Légende · **B** Boussole · **R** (ou Ctrl+K) Recherche · **F** présentation · **Ctrl+Z / Ctrl+Y** annuler/refaire · **Échap** ferme la modale active. **`?`** affiche la liste complète (cheatsheet). Navigation clavier dans les menus d'outils (TAB, flèches, Entrée).
- ❓ **Aide intégrée** : la modale ❓ du HOME est un hub — une fiche courte par fonction, en 8 catégories alignées sur le guide (Prise en main · Urgence · Carte et recherche · Se repérer et itinéraire · Annoter · Mes données et partage · Réglages et dépannage · Pour aller plus loin), barre de recherche (titres et contenu) ; chaque fiche s'ouvre en sous-modale avec ← Retour et renvoie au guide pour le détail. Les fenêtres qui ont une page d'aide portent un **❓** dans leur ligne de titre, qui ouvre directement leur fiche (désactivable : ⚙️ Configuration de l'accueil → 🎨 Affichage → « ❓ Bouton d'aide dans les fenêtres »).
- 🏅 **Rangs de profil** : 6 rangs — Touriste · 🥉 Novice · 🥈 Confirmé · 🥇 Expert · 🏅 Maître · ⚜️ Grand Maître — atteints par seuils fixes sur les 3 métriques À LA FOIS (plans ouverts ET temps passé ET km cartographiés ; ex. Grand Maître = 25 plans + 60 h + 200 km). Affichage : anneau coloré autour de l'avatar + nom du rang + médaille en coin de photo. Le « score » (plans+heures+km) est purement décoratif, il n'influence pas le rang.
- 🏆 **Hauts faits** : **38 succès** — 8 familles × 4 paliers (Cartographe · Géomètre · Marcheur · Rat de cave · Pointilleux · Traceur · Zoneur · Bâtisseur) + 6 spéciaux (Touche-à-tout · Centurion · Taupe · Spéléo multi-niveaux · Marathon · Complétiste). Débloqués automatiquement selon les compteurs (toast à chaque déblocage), grille N/38 dans la fiche profil. 100 % local.
- 🗺️ **Itinéraire** : pathfinder Dijkstra entre 2+ waypoints, label distance + temps estimé en bas-gauche. 2 types de contraintes :
  - ⛔ **Zones inaccessibles** (DUR par défaut) : tout segment de route traversant une zone polygonale de type `inaccessible` est exclu du graphe — l'itinéraire passe forcément à côté. Relâchable seulement par la case « Respecter les zones inaccessibles » de la modale Itinéraire (cochée d'origine) ; le Mode Secours et « Je suis perdu » les respectent toujours.
  - 🚫 **Préférences d'évitement** (SOUPLE) : configurées dans la modale itinéraire (section repliable "🚫 Préférences d'évitement"). On peut éviter des **points précis** (par recherche / ID / clic carte), des **tags entiers** (ex: tous les `pa` / Puits Aération), ou des **types de zones** (checklist "⬛ Zones à éviter", **1 case par type** : Eau, Effondrement, types personnalisés… ; cocher un type fait contourner toutes ses zones ; les zones `inaccessible` n'y figurent pas, elles sont déjà une contrainte DURE). Marge configurable (défaut 100px). **Fallback 2 passes** : si pas de chemin en évitant, l'app tente sans les évitements et affiche un message orange "⚠️ Impossible d'éviter : X, Y". Persisté par plan.
  - Un **puits entre deux étages** est compté pour sa vraie longueur dès que les **profondeurs des niveaux** sont renseignées (sinon il est mesuré à plat) ; l'itinéraire peut alors préférer un détour à plat. Le trajet **à vol d'oiseau** entre une étape et la galerie la plus proche est dessiné **en pointillé** et **compté** dans la distance (alerte au-delà de 50 m).
  - 📊 **Profil en long** : bouton du panneau d'itinéraire une fois le trajet calculé ; exige des profondeurs de niveaux renseignées **et** une échelle calibrée (sinon l'écran le dit).
  - ⚡ Sur un gros relevé (~9 000 sommets), un itinéraire se calcule en une fraction de seconde ; idem pour la zone atteignable du Mode Perdu et la sortie d'urgence.
- 🔄 **Itinéraire vivant** : à chaque **recalage de position** (clic carte en mode recalage, bouton « 📍 Je suis ici » d'un point, arrivée par un portail), l'itinéraire actif peut être **recalculé depuis la nouvelle position** (étapes restantes conservées dans l'ordre planifié, préférences d'évitement respectées). Un recalage loin du trajet **demande confirmation** (« Recalculer » / « Garder l'itinéraire » / « 🗑️ Supprimer l'itinéraire ») ; « 📍 Je suis ici » sur un point à **≤ 8 m du trajet** coupe simplement la partie déjà faite et valide les étapes dépassées, sans question. « 📍 Je suis ici » sur un point qui est une **étape de l'itinéraire** = **validation de passage** (marker ✓ vert, ligne rayée dans la modale, étape exclue des calculs suivants) — dans **n'importe quel ordre**. Toutes les étapes validées → message « 🎉 Itinéraire terminé » + tracé effacé (le tracé tracker reste). Les validations survivent au reload. Le recalage clic carte ne valide jamais (approximatif) : il replanifie seulement.
- 🪧 **Guidage de l'itinéraire** : itinéraire tracé + position connue (tracker actif, **ou** un simple « 📍 Je suis ici » sur un point — on peut avancer de plaque en plaque sans podomètre) → un **bandeau** en haut de la carte dit « Dans 40 m, tourner à gauche », « Continuer sur 120 m », « Maintenant : … » (+ la consigne suivante). Il ne parle **qu'aux croisements** (une galerie qui tourne sans choix possible ne se dit pas), toujours en **mètres** — jamais « la 3e à gauche », car les tracés ne montrent pas toutes les ouvertures réelles ; sans 🧭 Navigation intelligente les distances sont **approximatives** (« ~ », arrondies à 10 m). Un **grand carrefour** (croisements à 5 m ou moins l'un de l'autre) = **une** consigne à son entrée, avec un **schéma** dès 4 galeries (celle à prendre en doré, l'arrivée en pointillé en bas). S'écarter ou faire demi-tour → alerte orange **[Je suis ici] [Recalculer d'ici] [Ignorer]** — jamais de recalcul automatique. Toucher le bandeau = **🪧 Feuille de route** (aussi dans la modale Itinéraire, sans tracker). **Croix ✕** = coupe le guidage (la tuile 🪧 du menu Tracker s'éteint, la retoucher le rallume sur le même itinéraire, sans recalcul) ; coupure définitive : menu 🧭 Tracker → « 🪧 Guidage de l'itinéraire ». **Itinéraire inter-plans** : le bandeau annonce les croisements de chaque plan traversé ; la feuille de route détaille le plan courant jusqu'au portail, puis une ligne par plan suivant (« Puis 🌀 portail → plan : 350 m, 4 croisements ») ; l'étape du plan suivant n'est tracée **que si l'utilisateur prend le portail** (supprimer ou remplacer l'itinéraire, ou ouvrir le plan suivant autrement, abandonne la suite). En **sortie d'urgence** : bandeau sans croix, affiché même si le guidage est coupé, et « Sortie la plus proche d'ici » en cas d'écart ; l'**écran XL** reprend la consigne. Plan **sans aucun tracé** → pas d'itinéraire possible, l'app le dit au lancement.
- 🧱 **Fond d'un gros plan chargé à la demande** : seules les tuiles du fond proches de l'écran sont affichées et téléchargées ; en déplaçant la carte, les suivantes arrivent. **À savoir pour assister** : un bord de fond qui apparaît une fraction de seconde après un déplacement rapide est normal ; une zone qui RESTE vide n'est pas normale — faire remonter avec le plan et le zoom.
- 🖼️ **Export image** : la fenêtre d'export pré-coche la plus grande résolution qui reste sous ~64 millions de pixels (un très gros plan part donc en ½ ou ¼), affiche la taille et la mémoire estimée, et avertit au-delà — le choix reste libre. Sur iPhone/iPad, les résolutions au-delà de 16,7 millions de pixels sont grisées (Safari refuse de les créer). **À savoir pour assister** : « mon export est en ½ » n'est pas un bug — il suffit de cocher Originale. **Export anonymisé** : les points sont nommés « 📍 POI <tag> #N », les liaisons inter-plan n'y figurent pas, les photos peuvent être incluses (ré-encodées, renommées).
- 🆔 **Identifiants des objets** : chaque point, tracé, zone et structure porte un identifiant permanent (`uid`) et une date de modification (`updatedAt`), posés automatiquement — invisibles à l'écran et dans le tableur, présents dans les exports JSON, absents des exports anonymisés, KMZ et GPX. Si un user voit ces champs dans un fichier exporté, c'est normal : ne pas les modifier à la main. Un export complet contient aussi `tombstones` (identifiants des éléments supprimés, gardés 90 jours) : une fusion ou un réimport ne fait pas revenir un élément supprimé. La **fusion de sessions** ne double pas un même élément présent dans deux fichiers (la version la plus récente gagne) ; deux éléments différents portant le même NOM restent deux éléments (alerte « noms en double »). Photos, favoris, liaisons inter-plan et étapes de Secours sont rattachés à l'identifiant du point (supprimer un point n'affecte pas un **homonyme**).
- 🔁 **Changer de plan en cours de sortie la met en PAUSE** : montrer un autre plan ne termine pas la sortie du carnet. Revenir sur son plan dans les **2 heures** → la même sortie reprend (compteurs et tracé compris) ; au-delà, elle est rangée au carnet comme d'habitude. Le **suivi**, lui, s'arrête à chaque changement de plan : à la reprise d'une sortie de terrain, l'app propose **« ▶️ Relancer le suivi »** (un toucher — pas de relance automatique, iOS exige un geste). Une sortie clôturée à la main (🏁) n'est jamais reprise.
- 🎨 **Icônes** : une icône introuvable **se replie sur celle de l'app** partout (carte, filtres, favoris, recherche, exports, légende). Un plan généré par une ancienne version du Générateur pouvait avoir l'icône « Point d'entrée du plan » cassée : l'app ignore la valeur fautive à l'ouverture ; régénérer le plan la corrige dans le fichier.
- 📕 **Documents livrés avec un plan → visibles dans le Carnet** : un PDF embarqué dans le ZIP par le Générateur (mode Histoire) est **copié sur l'appareil** à la fin du chargement du plan, donc il apparaît dans 📔 Mon carnet → 📖 Récits **sans charger le plan**. La copie est **supprimable** comme un document importé, et **rouvrir le plan la recrée**. Elle n'apparaît jamais en double dans le Mode Histoire.
- ⛑️ **Mode urgence "Je suis perdu"** (sous-action du groupe 🧭 Tracker) : estime une zone de recherche à partir de dernière position + temps écoulé + indices visuels texte ; affiche cercle orange, surligne en rouge clair les galeries réellement atteignables dans le temps écoulé (calcul sur le réseau de tracés, multi-niveau géré), markers violets pour les indices in-zone ; bloc dépliable "📚 Bonnes pratiques" ; rapport copiable (portée max incluse).
- 🔆 **Affichage XL** (« mode panique ») : plein écran simplifié — mini-carte interactive + boussole géante + prochaine consigne du guidage + Wake Lock. **Aucune coordonnée affichée en permanence** (ni X/Y du plan, ni GPS) : toute la place va à la **mini-carte**, qu'on déplace et zoome au doigt ; dès qu'on la bouge, le suivi se met en pause et elle revient **Nord en haut** ; **🎯 Recentrer** reprend le suivi et l'orientation (elle s'oriente si le mode « plan orienté » est actif). Elle montre zones, structures, tracés, itinéraire (décimé, cyan vif + halo blanc) et les **points** du plan et de l'utilisateur (niveau affiché), avec les **couleurs de la légende personnalisée**. Un appui sur un point ouvre une bulle (nom, type, note) avec **📍 Je suis ici** (même effet que dans la bulle de la carte : position confirmée, validation d'étape, replanification) puis recentre. **Plan géoréférencé seulement** : icône 📋 au bout de la ligne d'état (en haut à droite) → bulle avec les coordonnées GPS en très gros (à dicter), l'état de la position (suivie / dernière connue / départ du plan jamais confirmé) et **📋 Copier ma position** (`lat, lng` nus, collables dans un SMS ou une app de carte — volontairement sans heure, cap ni nom de plan). Plan non géoréférencé : pas d'icône. La ligne d'état porte batterie (seulement si le capteur existe et que le réglage est coché) / tracker / boussole. Échap ferme d'abord la bulle, puis l'écran. Le thème suit celui de l'app ; la mini-carte se recadre à la rotation paysage ; le bouton SORTIR reste collé en bas.
- 🚑 **Mode Secours** : coordination d'équipes de recherche en cas d'incident souterrain. Bouton 🚑 dans le menu 🧭 Tracker. Multi-scénarios par plan (max 10 ; la purge n'efface jamais un scénario en cours, celui ouvert, ni une intervention terminée tant qu'aucun rapport n'en est sorti). Deux états : **CRÉATION** (contexte, équipes avec parcours entrée/étapes/sortie, couleurs OTAN Alpha→Juliet, phases successives, chef + effectif par équipe, départ / retour prévu, durées d'approche (hors zone) et de fouille (zone, vitesse de fouille 1,5 km/h par défaut)) puis **EXÉCUTION temps réel** (« 🚀 Lancer le plan de secours ») avec 3 rôles — 👤 Opérateur surface (vue globale multi-équipes) · 🚨 Équipier (parcours pas-à-pas, statuts d'étape : RAS 🟢 / Suspect 🟡 / Bloqué ⬛ / Indice 🔵 / Aide demandée 🟠 / Demi-tour 🟣 / Victime trouvée 🚨) · 🚑 Secouriste libre (notes chronologiques). Photos par étape (max 5), timer global avec pause. Points clés à connaître pour assister :
  - **Pendant l'intervention** : fermer la fenêtre laisse la zone et le tracé sur la carte ; pastille rouge « 🚑 Secours · Alpha · 3/8 › » dans la barre d'état (un toucher ouvre la vue live) ; équipes repliables ; une équipe avec victime passe en tête chez l'opérateur.
  - **« Victime trouvée »** = position (point de l'étape, niveau compris, ou « 📍 Préciser ») + marqueur ✚ + bandeau opérateur + **« 🚑 Évacuer »** (Sortie d'urgence depuis la victime, qui propose aussi les accès des équipes ; demande d'abord les options brancard : zones à éviter, eau et remblais cochés, zones inaccessibles levables en dernier recours — si la fenêtre dit qu'un chemin traverse une zone évitée, c'est qu'aucun ne l'évite).
  - **Retards et rappel** : retour prévu par équipe (heure impérative possible), orange puis rouge après une marge réglable (30 min), pastille et toast ; « ✅ Rentrée » demande le nombre de remontés — en dessous de l'effectif, alerte rouge « personne(s) manquante(s) » ; « 📢 Rappel général » / par équipe ; bilan opérateur « engagés · sous terre · manquants ». **Le rappel et les alertes ne sont PAS transmis aux autres téléphones** (aucun réseau) : l'ordre passe par radio ; départ, rentrée, rappel et position précisée voyagent dans le rapport d'équipe.
  - **Main courante** horodatée (automatique + notes libres de l'opérateur), fusionnée depuis les rapports, en annexe du rapport.
  - **« 🧭 Suivre mon parcours »** (vue équipier) fait du parcours l'itinéraire de l'app (bandeau de guidage, feuille de route, XL) ; il faut le suivi 🧭 actif pour être guidé. Lancer en mode équipe place le suivi à l'entrée de l'équipe. Une étape validée vaut recalage (silencieux à moins de 30 m, question au-delà). Raccourcis Sortie d'urgence / 🔆 Affichage XL / Je suis perdu dans la vue équipe (absents quand l'opérateur « prend la main » sur une équipe : ils agiraient sur son propre appareil).
  - **Étapes modifiées en cours d'intervention** : retirer une étape déjà renseignée demande confirmation ; c'est refusé si elle porte « Aide demandée » ou « Victime trouvée » (changer d'abord son statut — voulu, pas un bug). Chaque point de passage a une identité propre (un homonyme ailleurs est un autre point). « Dupliquer » crée une variante sans l'exécution en cours ; « Relancer » demande confirmation car il efface les photos de l'intervention précédente.
  - **📊 Couverture** (par niveau) : part des galeries dans une zone et sur un parcours, POI dans une zone mais hors parcours, POI visités par plusieurs équipes, surlignage rouge des galeries hors parcours.
  - **Zone « tracés »** : un clic prend la galerie la plus proche des niveaux affichés ; la zone est enregistrée par l'empreinte de la géométrie — un tracé du plan **modifié** en sort (resélectionner la zone après une mise à jour du plan).
  - **Rapports** : PDF imprimable (page « Accès surface » en tête, cartes d'équipe, feuille de route de chaque équipe une fois son itinéraire calculé) · fichier `.mkmsec.report.json` partageable (consolidation à l'import par l'opérateur ; un rapport d'une phase close est rangé dans l'historique de cette phase) · texte presse-papier. Partage de scénario entre appareils via `.mkmsec.json` (déposable aussi sur « 📦 Ajouter un plan » à l'accueil : l'app ouvre le bon plan et enchaîne import et lancement). Briefing pompiers PDF avec carte OSM si le plan est géoréférencé ; il liste les accès du plan (un briefing sans accès = aucun point du plan n'est tagué entrée, cavage, puits ou escalier). Avertissement au lancement si le plan serveur n'est pas entièrement hors-ligne.
  - **Conseil terrain** : importer le même plan (même version) sur chaque téléphone avant l'intervention ; l'import d'un rapport prévient si le plan a changé de version depuis l'export. 100 % local.
- 🎬 **Replay tracker** : **fonctionnalité optionnelle, désactivée par défaut** (à cocher dans ⚙️ Configuration › 🧩 Fonctionnalités optionnelles) ; une fois activée, tuile 🎬 du menu 🧭 Tracker. Ouvre une modale plein écran avec slider timeline + play/pause/restart/end + vitesse 0.5×→10× + raccourcis clavier (Espace, ← →, Échap). Mode compact (bottom sheet) activé auto au Play. Trail multi-segments (sauts de recalage non reliés). Bouton 💾 Export CSV (colonnes `timestamp_ms_epoch,delta_ms_since_start,x_plan,y_plan,type[,level]`). Remis à zéro au changement de plan (non persisté).
- 🪫 **Indicateur batterie** (fonctionnalité optionnelle « 🔋 Niveau de batterie ») : chip ⚡/🪫 dans l'en-tête, footer de la modale Session, ligne d'état de l'Affichage XL. Avertissements 20 % / 10 % / 5 % via toast (1 fois par seuil). Dispo seulement sur Chromium (Android, PC) ; Safari iOS et Firefox n'exposent pas la batterie : rien n'est affiché.
- 📊 **Stats session** : la modale 📊 Détails de la session affiche total annotations + répartition par type (📍/🛣️/⬛/🏛️) + distance cumulée tracés + surface cumulée zones + photos POI + durée session. Multi-niveau : répartition par niveau. Boutons 📋 Copier + 💾 Export TXT.
- 🏗️ **Plan principal = niveau 0** : décocher le niveau 0 dans la modale Niveaux masque aussi l'image principale du plan (tuiles comprises) — permet de regarder un étage seul. Sans multi-niveau, le plan principal n'est jamais masqué. Le générateur avertit (non-bloquant) si un calque de niveau ≠ 0 n'a pas de canal alpha (JPEG ou PNG aplati) : il masquerait tout ce qui est dessous.
- 🎨 **Thème clair / sombre** : bascule ☀️/🌙 dans ⚙️ Configuration de l'accueil (lisible depuis un plan dans « 🏠 Réglés depuis l'accueil »). Application instantanée partout. Palette claire beige « cataphile ». Restent volontairement sombres : le splash d'intro et le viewer photos plein écran.
- 🌍 **Interface multilingue** : l'interface est disponible en **3 langues — Français / English / Español**. Sélecteur de langue (drapeau + nom FR / EN / ES) dans **⚙️ Configuration → 🌍 Application**, tout en haut, **et** sur l'écran d'entrée (pré-sélectionné sur la langue du navigateur). Il pilote toute l'application. Bascule en live, sans reload. Les dates (rapports, PDF, stats) suivent la langue.
- 📚 **Trois contenus longs — ne pas les confondre** : **① la Documentation** (📖) existe en **FR, EN et ES** ; elle suit la langue de l'app, et son bouton drapeau permet de basculer entre les trois (choix local, mémorisé — il peut avoir été mis sur 🇬🇧). **② Le tutoriel** de bienvenue : FR/EN/ES, suit la langue globale, sans sélecteur propre (changer de langue = sortir du tutoriel et passer par ⚙️ Configuration). **③ L'Aide intégrée** (❓) : FR/EN/ES, suit la langue globale, sans sélecteur. **Si un hispanophone signale « c'est en anglais »** : faire préciser lequel, puis vérifier la langue de l'app et, pour la Documentation, son bouton drapeau.
- 📐 **Mesure de distance** (clic-clic, label `📐 Distance: X m` en bas-gauche) et ⬛ **Mesure de surface** : toggle 📏/⬛ dans le groupe 📐 Mesure ; label `⬛ Surface: X m²` (bascule en ha au-delà de 10 000 m²). Sauvegardées avec la session.
- 📏 **Distance totale des tracés** (filtre par type, highlight magenta)
- ✏️ **Édition de points** : modale d'édition unifiée ajout/modification + section 📸 Photos attachées.
- 📸 **Photos POI** : jusqu'à 5 photos par point (capture caméra ou galerie), compression automatique, stockage 100 % local (IndexedDB — jamais envoyées sur Internet). Métadonnées EXIF (position GPS de prise de vue, date, appareil) **systématiquement supprimées** à l'ajout. Une photo est rangée sous l'**identifiant** de son point (elle le suit s'il est renommé). Rouvrir un plan importé (ZIP) qui contient des photos ne touche pas aux photos que l'user a ajoutées. Si plusieurs points portent le même nom et qu'une ancienne photo n'a pas pu être rattachée, elle apparaît dans la bulle de chacun avec un **cadre orange pointillé** et un bouton **📌 Photo N : c'est ce point** : ce n'est pas un bug, l'user choisit — rien n'est supprimé. Viewer plein écran : pinch-zoom, swipe entre photos. Incluses dans les exports (session ZIP, KMZ, générateur). **🧰 Outils > 📸 Mes photos** (accueil) : galerie de toutes les photos de l'appareil, plan par plan, rangées par point. **Supprimer un point ne supprime pas ses photos** : elles apparaissent dans le groupe « ⚠️ Sans point », d'où l'user peut **🔗 Rattacher** (à un autre point), **♻️ Recréer le point**, **💾 Enregistrer** (ZIP) ou **🗑️ Supprimer** (avec confirmation). Un plan dont les points ne sont pas lisibles d'ici (archive absente, serveur injoignable) affiche « à vérifier à l'ouverture du plan », pas « sans point ». Un signal discret prévient à l'ouverture d'un plan qui a des photos sans point.
- 🔐 **Code d'accès local PIN/Face ID** (optionnel) : PIN 4-6 chiffres + biométrie Face ID/Touch ID via WebAuthn. Activable depuis ⚙️ Configuration de l'accueil uniquement. 100 % local. Barrière UX, PAS un chiffrement des données. 5 codes faux = verrou **temporaire** (10 min, puis 1 h, 6 h, 24 h), jamais définitif ; aucune récupération du code (en dernier recours : 💥 Tout réinitialiser). Cf section dédiée plus bas.
- 🛣️ **Tracés / Roads** : Principal / Secondaire / Chemin / Itinéraire (+ Jonction interniveau en multi-niveau)
- ⬛ **Zones** : Remblais / Effondrement / Eau / Inaccessible. « Dernière zone fermée » supprime la zone EN COURS si elle existe.
- 🏛️ **Structures** : 5 types — Pilier 1ère masse 🟡 / Pilier 2e masse 🟠 / Mur 🔵 (polygones) + Front de taille 1ère masse 🟨 / 2e masse 🟧 (polylignes). Architecture souterraine (piliers porteurs, murs, avancement d'exploitation). Aucun effet pathfinder (lecture seule). 4 modes de suppression (↩️ dernier point / ✂️ dernière structure, en cours OU fermée / 🎯 sélection au clic carte / 🗑️ toutes).
- 🌍 **Mode OSM** : le ⛶ du widget Vue OSM ouvre le **mode OSM** plein écran, avec une **barre de recherche 100 % locale** — elle trouve un plan géoréférencé ou un POI de ces plans et centre la carte dessus (aucune recherche d'adresse : rien ne sort sur internet). Seuls les plans **géoréférencés** y apparaissent. Avertissement performance à la première ouverture. **Multi-plans** : le panneau « 🗂️ Plans affichés » superpose plusieurs plans géoréférencés — ➕ ajouter, ▲▼ ordre dessus/dessous, opacité PAR plan, ✕ retirer ; le plan ◉ est le principal (sélecteur du bandeau, seul non-retirable) ; TOUTE la gestion vit dans la **modale « 🎚️ Plans & filtres »** (bouton **≡** du bandeau) : interrupteurs d'affichage **globaux** (Plan/POI/Routes/Zones/Struct), **filtre par tag agrégé sur tous les plans affichés**, boutons d'**étage** sur un plan multi-niveaux (un premier clic isole l'étage), et la pile (ordre, opacité par plan, 5 mini-boutons de filtrage par plan — visibilité effective = global ET par-plan) ; la **barre de recherche** est dans la ligne de titre « 🌍 Vue OSM », disponible aussi sur le widget réduit ; avertissement au-delà de 3 plans. Tout reste local (lecture des ZIP sur l'appareil). Un calque livré « décoché » dans le ZIP d'un plan est rendu comme les autres et se filtre via les chips. Le travail de **session** (points, tracés, zones, structures non encore dans le plan) s'affiche aussi, avec la mention « Session en cours — pas encore dans le plan » ; le bouton **📝 Session** le masque. Les **couleurs de légende personnalisées** s'appliquent, chaque plan de la pile avec les siennes. Zoomer dans l'aperçu de l'accueil charge des tuiles plus détaillées (plans tuilés V2 uniquement — un plan V1 reste flou au zoom). Après un aller-retour dans un plan, le widget de l'accueil s'ouvre sur le plan quitté. 🏷️ **AJOUT PAR ÉTIQUETTE DE PLAN** : dans cette même modale, section « 🏷️ Afficher par étiquette de plan », une rangée de chips liste les étiquettes (`plan.tags`, saisies dans la bibliothèque ou **proposées par le ZIP** depuis le champ 🏷️ Étiquettes du Générateur) portées par **au moins deux** plans géoréférencés, avec un compteur « 3/12 ». **Un clic affiche TOUS les plans de l'étiquette, un second clic les retire**. ⚠️ **NE PAS CONFONDRE avec « 🏷️ Filtrer par tag » de la même modale** : ce filtre-là porte sur les **POI à l'intérieur** des plans affichés, celui-ci choisit **quels plans** sont affichés. **Détails à donner si on demande** : la casse est ignorée ; une étiquette portée par **un seul** plan n'a pas de chip (le sélecteur ➕ suffit) ; au-delà de 3 plans affichés l'app **demande confirmation**, puis charge les plans **un par un** (la carte se remplit progressivement — ce n'est pas un blocage) ; le plan principal ◉ n'est jamais retiré par un clic d'étiquette. **Si un utilisateur ne voit pas la section** : ses plans ne sont pas étiquetés, ou aucune étiquette n'est portée par deux plans géoréférencés — les étiquettes se saisissent dans ℹ️ Infos → « Tags du plan ».
- 🎯 **Relever les coordonnées GPS de surface** : **en Vue OSM uniquement** (aperçu de l'accueil ET plein écran d'un plan ouvert), un bouton 🎯 arme un mode où **un clic sur la carte donne la latitude et la longitude du point de surface**, avec un bouton pour les copier. ⚠️ **Réserve à annoncer** : la coordonnée est exacte pour le point de la carte, mais « juste au-dessus de cette galerie » dépend du **géoréférencement du plan** qui la porte. 100 % local.
- 📏 **Mesurer en Vue OSM** : distance géodésique et surface, dans les deux vues OSM. Une mesure faite là ne dépend d'aucun calibrage d'échelle. Les deux outils (📏 et 🎯) sont **exclusifs** : armer l'un désarme l'autre.
- 📐 **« Écart de calage » d'une liaison** : dans 🌀 **Mes liaisons** et dans les filtres de la **Vue OSM**, chaque liaison entre deux plans peut afficher un écart en mètres. **Ce n'est pas une distance à parcourir** : les deux bouts d'un portail désignent le **même endroit physique** vu depuis deux plans, donc l'écart mesure à quel point les deux plans sont mal calés l'un par rapport à l'autre. **Plus le chiffre est petit, mieux c'est.** Il n'apparaît que si **les deux** plans sont géoréférencés. **Aucun code couleur** : c'est à l'utilisateur de juger avec son échelle. Si un chiffre paraît aberrant, la piste est **le géoréférencement d'un des deux plans**, pas la liaison.
- ⬆️ **Enregistrer → 💾 Exporter** : 5 onglets — 🚀 Full · 🎨 Avancé · 🔄 Conversion · 🔗 Fusion · 📡 Export externe (Conversion = session → data layer ; Export externe = KMZ / GPX). Dans 🚀 Full / 🎨 Avancé, le bloc « 🔎 Ne garder que » filtre par période de dernière modification (et, sur une installation reliée, par « Créé par ») ; le compte « N retenue(s) sur M » dit ce qui part.
- 📔 **Le Carnet** : historique des **sorties**, à ne pas confondre avec la sauvegarde de session (qui garde l'ÉTAT courant d'un plan) — le carnet garde l'HISTOIRE et n'est pas effacé quand une session l'est. Une sortie = date + durée + distance parcourue + compteurs d'ajouts (points/tracés/zones/structures) + photos prises + tracé du déplacement + note libre éditable à tout moment. **Accès** : bouton **📔 Mon carnet** sur l'accueil (sans charger de plan) ; depuis un plan : 📊 Détails de la session → section **📔 Sortie en cours** (Clôturer, Affiner, ouvrir le carnet ; **« 📔 Démarrer une sortie »** quand aucune n'est en cours — il marche même carnet désactivé, une seule sortie à la fois). Le réglage « 📔 Tenir un carnet de mes sorties » est dans ⚙️ Configuration de l'accueil → 🔒 Confidentialité. La modale carnet a **2 onglets** : **📔 Sorties** et **📖 Récits** — ce dernier remonte la **note libre et les PDF du Mode Histoire de chaque plan**, tous plans confondus ; la note s'affiche en Markdown et s'édite sur place (c'est la même note que dans le Mode Histoire). **🚶 terrain vs 🖥️ bureau** (règle à connaître) : une session où l'user s'est déplacé est une **sortie terrain** — **un seul « 📍 Je suis ici » suffit à la classer terrain**, même tracker éteint ; une session sans aucun déplacement est classée **travail sur plan** et rangée dans une section repliée à part. Les **totaux du carnet ne comptent que le terrain**. Classement automatique, **corrigeable à la main** (fiche du carnet ou section 📔, boutons 🚶/🖥️) — correction définitive. **Durée** : une sortie terrain est comptée du **départ à la fin** (téléphone en poche compris) ; une session bureau garde le temps d'usage ; la fiche affiche les deux ; sans 🏁, la fin est le dernier instant où l'app était vivante — **✏️ Corriger la fin** permet de saisir l'heure réelle. **Archivage** : en quittant le plan, la sortie est d'abord **mise en pause 2 h** (retour sur le même plan = reprise) ; passé ce délai, archivée automatiquement si **50 m parcourus** (mesurés ou estimés) **OU** **10 min actives ET au moins un ajout** ; en dessous rien n'est conservé — ou manuel via **🏁 Clôturer ma sortie** (gardée sans condition ; l'app demande, facultativement, où l'user est ressorti pour fermer le dernier tronçon). Si iOS a déchargé l'app en arrière-plan, la sortie **reprend** au retour (même plan, coupure de moins de 45 min) ; une sortie clôturée à la main n'est jamais recollée. Sorties coupées en plusieurs : 📔 Mon carnet → **🔗 Fusionner des sorties** (irréversible, confirmé). **Limites** : purge automatique au-delà de 500 sorties ; les photos ne sont pas dupliquées (une photo supprimée affiche 🚫). Le carnet voyage avec l'export/import de profil.

📏 **Distance estimée entre les « 📍 Je suis ici »** (règle à connaître : elle explique un chiffre que l'user voit) : quand l'user navigue **sans le podomètre** et pose des « 📍 Je suis ici » en chemin, l'app relie ces repères pour estimer la distance parcourue, **en suivant les galeries du réseau** (repli ligne droite si un repère n'est raccordé à aucune galerie). Exemple : départ A → « je suis ici » en C → « je suis ici » en B, l'app compte A→C puis C→B. Cette part est **toujours annoncée comme estimée** (« 820 m dont 600 estimés ») dans la modale Tracker, les 📊 Stats globales et la fiche du carnet. **Jamais compté comme trajet** : un clic carte pour corriger sa position, et une traversée de portail vers un autre plan. Si le podomètre a mesuré entre deux repères, c'est **lui** qui compte (jamais les deux à la fois).

⏱️ **Quand le calcul a lieu** (à savoir si l'user s'étonne que sa distance change) : **pendant** la sortie, l'app compte à vol d'oiseau pour que « 📍 Je suis ici » reste instantané ; le calcul qui suit les galeries se fait **une fois, à l'archivage de la sortie** — la distance **augmente donc** à ce moment-là. Sur un plan très volumineux l'app renonce à ce calcul final (sauf clôture manuelle) et garde le vol d'oiseau ; la fiche distingue « calculé dans les galeries » de « à vol d'oiseau ». 🧭 Le bouton **« Affiner le tracé »** (section 📔) lance ce calcul à la demande ; il affiche le nombre de tronçons en attente et se grise quand il n'y a rien à faire. ⚠️ Il **redessine aussi le trajet** en suivant les galeries : cette reconstitution suppose le chemin le plus court entre deux repères, donc **un détour ou un demi-tour n'y figure pas**. Elle s'affiche **dans la fiche de la sortie uniquement** — les **exports GPX/KMZ et la heatmap gardent le tracé réellement enregistré**.
- 📄 **Mode Histoire — plusieurs PDF par plan** : jusqu'à **10 documents** par plan. Les PDF **embarqués dans le ZIP** (le Générateur en accepte plusieurs) apparaissent en tête de liste, consultables mais non supprimables, et n'empêchent pas d'ajouter ses propres documents. Garde-fous : avertissement au-delà de 25 Mo cumulés par plan, refus au-delà de 100 Mo. Ajout/suppression possibles depuis le Mode Histoire (plan chargé) **et** depuis 📔 Mon carnet → 📖 Récits. À l'export de session, **tous** les documents partent dans le ZIP ; à l'import ils sont **ajoutés**. Export de profil : case « 📄 PDF du Mode Histoire », **décochée par défaut** (un plan peut porter 100 Mo de documents). **À savoir pour assister** : si un user dit « mes PDF ne sont pas revenus », demander s'il a coché la case à l'EXPORT — décochée, rien n'est parti. 100 % local.
- 🧙 **Générateur = assistant pas-à-pas** : le Générateur (🏗️) guide étape par étape — Accueil (importer un ZIP / télécharger l'exemple / choisir Simple ou Avancé), puis pages Suivant/Précédent (les optionnelles se **Passent**), champs vérifiés à chaque étape, et **Résumé final** qui liste ce qui est rempli/passé/manquant + avertissements (ex. sans géoréférencement → Vue OSM et KMZ indisponibles). Un ZIP importé pré-remplit toutes les étapes. Bouton 🗒️ « Tout afficher » = affichage une-page (mémorisé). Sur iPhone / iPad, un plan vierge du Générateur est limité à ~16 Mpx (≈ 4 096 × 4 096).
- 🗺️ **Convertir depuis un SIG** : un export de logiciel SIG (QGIS…) devient un plan MyKTAMap. **Formats acceptés : `.geojson`, `.json`, `.kml`, `.kmz` vectoriel.** Points, tracés et zones sont repris. **OÙ ÇA SE LANCE (question fréquente)** : on dépose le fichier sur la zone **« 📦 Charger un nouveau plan » de l'écran d'accueil** — la même que pour les ZIP de plan — et le panneau « Convertir depuis un SIG » s'ouvre tout seul. Ça marche aussi depuis la zone d'import du **🏗️ Générateur**. **Pas besoin d'image de plan** : un fond vierge est généré et automatiquement calé sur les coordonnées du fichier ; l'user pourra le remplacer par une vraie image via « Modifier un plan ». **Écran de correspondance** : l'user choisit la colonne qui porte le type, puis dit à quoi chaque valeur de son fichier correspond dans MyKTAMap ; les valeurs reconnues sont pré-remplies mais **jamais imposées**, et les choix proposés sont **séparés par famille de géométrie** (un polygone peut devenir une zone ou un pilier, jamais un tracé). Une **colonne de niveau** peut être choisie (chaque étage garde le sien — **si un utilisateur dit « tout est sur un seul niveau »**, elle n'a pas été choisie). Le bouton « Nommer et colorer les niveaux » (🏷️) définit une légende personnalisée qui part **en entier** dans le plan généré ; si l'écran affiche « Légende réinitialisée », un changement de correspondance a périmé les noms saisis — rouvrir 🏷️ avant de générer. ⚠️ **Projection** : le fichier doit être en **WGS84 / EPSG:4326** (coordonnées GPS classiques) ; le **Lambert 93** (EPSG:2154) est **converti automatiquement** (un bandeau annonce le nombre de coordonnées reprojetées — vérifier que la position obtenue correspond au site). **Toute AUTRE projection** (UTM, Web Mercator…) est **refusée**, avec le nombre de coordonnées fautives — dans QGIS : *Exporter → Enregistrer les entités sous…* puis EPSG:4326. L'échelle du plan généré est calculée depuis les coordonnées (distances justes). **Limites à annoncer honnêtement** : trous (anneaux intérieurs) des polygones ignorés ; plafond 20 000 objets ; **Shapefile et GeoPackage NON gérés** (« réexporte en GeoJSON depuis QGIS »). 100 % local : aucun service de conversion, aucun géocodeur, aucune donnée envoyée.
- 🗺️ **GeoTIFF calé** : un `.tif` / `.tiff` calé sous QGIS se dépose tel quel comme image de plan (Générateur ou écran d'accueil) : l'app lit le **calage écrit dans le fichier** et pose le géoréférencement, l'échelle (px/m) et l'emprise sans rien demander. Formats lus : compression **LZW, Deflate ou aucune**, **8 bits par canal**, **gris / RVB / RVBA**, organisation **en bandes**, calage **sans rotation** (nord en haut), CRS **Lambert 93, Web Mercator ou WGS84**. Tout le reste est **refusé en le nommant**, avec quoi réexporter (BigTIFF, image tuilée, canaux séparés, palette / CMJN / YCbCr, prédicteur autre qu'horizontal, calage en rotation, CRS non géré…). **100 % local**.
- 🖼️ **Fond d'écran de l'accueil** : l'user peut mettre **sa propre image** en fond de l'écran d'accueil à la place de la couleur du thème. Se règle dans la modale **Profil**, tout en bas avant les boutons d'export. **Trois réglages** : le **voile** (assombrit — ou éclaircit en thème clair — l'image pour garder les textes lisibles ; 0 % = image nue, 100 % = fond uni, défaut 55 %) et le **cadrage ↔ / ↕**. ⚠️ **Point à expliquer si on demande pourquoi la photo est coupée** : l'écran ne montre **jamais toute l'image** — elle est agrandie pour couvrir tout l'espace, le débord est rogné ; en portrait sur un téléphone, une photo paysage ne laisse voir qu'environ **un quart de sa largeur**. **Seul le curseur de l'axe qui dépasse a un effet** (l'autre ne fait rien, c'est normal). L'image reste **sur l'appareil**, disparaît si l'user réinitialise son profil, et son ré-encodage **supprime ses métadonnées**. **Limite** : elle **ne voyage pas** avec l'export de profil.
- 📦 **Profil complet avec archives** : la fenêtre d'export de profil a une section « 📦 Archives de plans » — cocher des plans mémorisés transforme l'export en **fichier .zip « profil complet »** (au lieu du JSON) qui embarque leurs archives ; à l'import elles sont réinjectées et rattachées automatiquement. **À savoir pour assister** : rien n'est coché par défaut ; garde-fou de taille avec confirmation (50 Mo iOS / 500 Mo ailleurs, jamais de blocage dur) ; une archive évincée par le navigateur est LISTÉE à l'export ; en import « Fusionner » un plan qui a déjà son archive locale la garde ; quota plein = échec par plan avec bilan, le reste continue ; les plans non mémorisés n'apparaissent pas (rien à embarquer, leur ZIP est sur le disque).
- 💾 **Récupérer le ZIP d'un plan** : si l'user a perdu le ZIP d'origine, il peut le **retélécharger depuis l'app** : modale **ℹ️ Infos** du plan → bouton **💾 Télécharger le ZIP**. **Ne fonctionne que si le plan a été « mémorisé dans l'app »** — sinon le bouton est **grisé** avec l'explication. Si le navigateur a **évincé l'archive** sous pression de quota, un message le dit franchement et il faut réimporter le ZIP d'origine. Plans serveur : pas de bouton, ils sont retéléchargeables.
- 🎨 **Couleur des types de la légende** : l'user peut **changer la couleur** de chaque type built-in (tracés Principal/Secondaire/Chemin, zones Eau/Remblais/Effondrement/Inaccessible, structures Piliers/Mur/Fronts) : **≡ Légende → ✏️ Modifier**, un carré de couleur par ligne. La couleur s'applique **partout et immédiatement** — carte, exports image/PDF, KMZ, statistiques, Vue OSM, rapport de session — sans recharger. Bouton **↺** = retour à la couleur d'origine. **Détails à expliquer si on demande** : les zones et piliers/murs ont **deux carrés** (fond + **bordure indépendante**) ; sans bordure choisie, une zone la dérive toute seule (teinte plus foncée) et un pilier/mur reste **noir** ; les **entrées custom** s'éditent à chaud comme les built-in ; la zone **Inaccessible** recolorée **perd ses hachures** et devient un aplat ; l'émoji du titre des **popups** (🟩…) ne suit pas la couleur choisie (limitation cosmétique). Sauvegardé **par plan** dans la session. Un auteur de plan peut aussi livrer ses couleurs au niveau du plan (Générateur mode Avancé → 🏷️ Légende du plan).
- 🧳 **La légende voyage avec les exports** : un **calque de données** exporté depuis une session emporte la **définition des types custom qu'il utilise** (noms, couleurs, géométries) — le Générateur la récupère au ré-import (**ce qui existe déjà dans le plan garde la priorité**). Le JSON de session et le ZIP Avancé l'emportent aussi, et l'option « Légende personnalisée » des exports KMZ/GPX embarque **plan + session fusionnés**. **Si des objets utilisent un type disparu**, la modale ≡ Légende l'annonce par un **bandeau ⚠️ « types orphelins »** avec le compte et un bouton **« ➕ Lier »** par type : il ouvre la dialog d'ajout pré-remplie avec l'identifiant EXACT du type — l'entrée créée raccroche immédiatement les objets. Sans liaison, ces objets sortent en couleur de repli (blanc/gris).
- 🌍 **Overlay KMZ des grands plans** : au-delà de ~8 192 px de côté, l'image du GroundOverlay est **réduite automatiquement** à l'export KMZ (Google Earth tronquait silencieusement au-delà de sa limite de texture) — plan **V2** : recomposée depuis la pyramide de tuiles ; non-V2 décodable : réduite ; irréductible : l'app **demande** avant d'exporter et conseille la conversion V2. L'altitude des objets reflète la **profondeur des niveaux si elle est renseignée** (le relevé descend sous la surface dans Google Earth). Le **GPX n'a volontairement pas d'altitude** (`<ele>` désigne une hauteur au-dessus du niveau de la mer, que l'app ne peut pas connaître) ; la profondeur est écrite dans la description du point.
- 📉 **Profondeur des niveaux** (plans multi-niveaux) : deux endroits pour la saisir. Au **Générateur**, sous la case multi-niveau (profondeur du niveau 0 et pas entre étages) — la valeur voyage avec le plan. Ou dans un plan ouvert : la pastille **`Niv X`** sur la carte, puis **📉 Profondeur des niveaux** en bas de la fenêtre. La saisie par plan **prime** sur celle du Générateur. Sans profondeurs renseignées, itinéraires et exports mesurent à plat.
- 🛠️ **Mode Développeur** : ⚙️ Configuration de l'accueil → section protégée par **mot de passe** (première activation, avertissement de responsabilité, 5 essais max). Contient : toggle **logs détaillés**, **📋 Afficher les logs**, **🔧 Voir l'état du cache (Service Worker)** (inspecteur détaillé, fichier par fichier, de ce que résume la pastille hors-ligne) et **🏗️ ConfAdmin**. La documentation technique du projet ne se lit pas dans l'app.
- 🔁 **Convertir la résolution** : dans **📊 Éditeur de données**, une carte « Convertir la résolution » ouvre un outil autonome qui **migre les fichiers de données d'un ancien scan vers un nouveau scan du même plan** : résolutions source/destination (saisie ou 📷 auto-détection), un ou plusieurs `.json`, téléchargés convertis en `_conv.json`. **Recalage optionnel** si les marges diffèrent : 1 repère commun (`xA,yA → xB,yB`) + rotation optionnelle (° horaire) ; **2 repères** = échelle et rotation déduites. Refus nets : repère incomplet, repères à moins de 10 px. **Non converti** (à refaire sur le nouveau plan) : liaisons inter-plans, géoref, échelle.
- 🧹 **Dédoublonner les données** : dans **📊 Éditeur de données**, carte « Dédoublonner les données » — retire les **sommets identiques consécutifs** (x, y et niveau) des tracés, zones, structures et mesures d'un ou plusieurs `.json` (calque ou session exportée), téléchargés nettoyés en `_dedup.json` avec bilan chiffré. Utile pour des fichiers gonflés par des sommets confondus invisibles à l'écran. Les POI ne sont jamais touchés ; un objet n'est supprimé que si le nettoyage l'a vidé (tracé/ligne < 2 sommets, zone/polygone < 3) ; deux sommets même x/y mais niveaux différents sont conservés.
- 🔄 **Corriger un calque de données sans quitter la carte** : un **calque de données** (le relevé livré dans le ZIP du plan) est en **lecture seule** et ne peut pas s'éditer en place. Pour le corriger : **🔍 Filtres → section Calques → bouton « 🔄 Modifier »**. Son contenu est copié dans la session, où tous les outils habituels s'appliquent (notamment **🔄 Convertir cet objet** : sur la fiche d'un tracé, d'une zone ou d'une structure de SESSION, un bouton change son type et au besoin sa famille — un front de taille devient une galerie, une zone devient un pilier. **Règle stricte** : un vecteur OUVERT ne peut devenir que tracé ou front de taille, un vecteur FERMÉ que zone ou pilier/mur ; la traversée est refusée, car fermer ou ouvrir une géométrie serait inventer de la donnée relevée sur le terrain. La géométrie, le niveau et la note sont conservés. ⚠️ Ne marche PAS sur un objet de calque de données : il faut d'abord le rapatrier). Le calque d'origine est alors **masqué automatiquement** et sa case porte « (en cours de modification — afficher quand même) » : c'est ce qui évite de voir les objets en double. **« ↩️ Restaurer »** annule tout et retire la copie ; **« 💾 Exporter »** produit un fichier à redonner au plan — dans 🏗️ Générateur → « Modifier un plan », sur **la ligne de ce calque**, bouton « Choisir ». La ligne EST le calque, donc le fichier REMPLACE l'ancien contenu : aucun doublon n'est possible. **Détails à donner si on demande** : l'app **annonce le poids avant** (un gros relevé peut peser plus d'1 Mo dans la session ; les sessions vivent en IndexedDB — place accordée au site par le navigateur — et non dans le localStorage limité à ~5 Mo, qui ne reste qu'en repli si IndexedDB est refusé) ; les objets que l'utilisateur a **dessinés lui-même** ne partent PAS dans l'export du calque et leur nombre est annoncé ; **« Effacer la session » restaure** les calques ouverts à la modification ; si la copie de session est introuvable au chargement, l'app **réaffiche le calque**. **Plusieurs calques ouverts en même temps** : chaque objet copié porte la marque de son calque, l'export d'un calque ne sort QUE ses objets. **Export de session complet puis réimport** : le fichier emporte les objets marqués ; à l'import, l'app remet en modification les calques dont elle retrouve la copie (« N calque(s) remis en modification »), réaffiche ceux qui n'en ont plus, et retire la marque des calques absents du plan ouvert. **Si un utilisateur dit « je vois tout en double »** : il a re-coché la case du calque remplacé — c'est volontairement possible, pour comparer avant/après.
- 📐 **Géoréférencement — 3e point optionnel** : en plus des 2 points de calibrage GPS (A et B), un **point C facultatif** dans ⚙️ Réglages → Géoréférencement (ou dans le Générateur). Avec C, l'app corrige la **déformation globale** du plan (échelles X/Y différentes, cisaillement) — utile sur un **assemblage** de plusieurs plans qui se projette mal. En profitent : la Vue OSM, les exports KMZ/GPX et le Mode Secours. **Contrainte** : C doit être **loin de la ligne A-B** (un C aligné est refusé). **Limite à annoncer honnêtement** : ça corrige une déformation d'ensemble — si chaque morceau de l'assemblage a sa propre erreur, le résultat s'améliore sans être parfait partout.
- 🧭 **Calibration Nord par plan** : le générateur avancé permet de définir l'angle du Nord réel du plan (un plan scanné est rarement orienté Nord en haut) ; la boussole et le tracker en tiennent compte automatiquement.
- 🏗️ **Mode serveur « kiosque »** : une instance auto-hébergée (association, club, site) peut personnaliser son **sous-titre** et **masquer l'import de plans et/ou le Générateur** pour ne proposer que ses propres plans. Si un user constate que le bloc « Charger un nouveau plan » ou le bouton 🏗️ est absent, ce n'est **pas un bug** : c'est le choix du déployeur de cette instance. Les outils et les données personnelles de l'user restent intacts, mais l'**import de profil** est refusé en mode « plans du serveur uniquement » (l'export reste ouvert). Config via le fichier `data/index.json` du serveur (page `confadmin.html` pour le générer) — **aucun backend, aucune donnée envoyée**. Une installation peut aussi déclarer un plan par son **ZIP** (`"zip": "data/x.zip"`) : il est téléchargé à l'ouverture, gardé sur l'appareil selon « Mémoriser », retéléchargé seulement s'il a changé. Les plans d'un serveur peuvent arriver **étiquetés** et **rangés en dossiers** : l'index propose, l'utilisateur dispose (ses propres choix ne sont jamais écrasés).
- 🔌 **Pastille « connexion serveur »** : en bas de l'accueil, à côté du numéro de version. Sur **myktamap.fr** elle affiche **« Base de données : désactivée »** — ce site n'a ni base de données ni backend, et n'en aura jamais ; toutes les données de l'user restent sur son appareil. Une installation indépendante peut déclarer une connexion serveur dans son `data/index.json` (`config.serverConnection`) : la pastille affiche alors « Licence requise » (orange), « Configurée, aucun module » (bleu) ou « Configuration invalide » (rouge) — **sans module de connexion installé, aucun de ces états n'active quoi que ce soit** : l'app ne contacte aucun serveur. Toucher la pastille ouvre « Que fait l'app sur le réseau ? » avec l'explication de l'état ; sur une installation **reliée**, cette fenêtre propose aussi la page de transparence de l'installation (c'est elle qui dit ce que le serveur reçoit et garde). Si un user voit « Configuration invalide » ou « Licence requise », ce n'est **pas un bug de l'app** : il doit prévenir la personne qui gère l'installation. Sous 380 px de large, seule l'icône 🔌 avec un point de couleur reste visible.
- 🧩 **Installations reliées à une base de données** (jamais myktamap.fr) : une installation indépendante peut greffer des modules de connexion (comptes). Ce qu'il faut savoir pour assister :
  - **Pastille** : « connectée » (vert) ou « injoignable » (orange : pas de réseau ou serveur arrêté — l'user continue de travailler sur son appareil, ses modifications partiront au retour ; un plan s'ouvre alors depuis sa copie gardée). Un téléchargement de plan sans réponse est abandonné (15 à 20 s) avec le message « connexion perdue ».
  - **Accès** : l'écran d'entrée est celui du **compte** de l'installation. « Installation indisponible » = le module de connexion n'a pas pu se charger — l'accès reste fermé exprès ; réessayer, sinon prévenir le gestionnaire. « Licence de l'installation invalide » (licence absente, expirée ou refusée, pastille « Licence refusée par le serveur ») = l'app reste **fermée**, jamais rouverte en mode communautaire : prévenir le gestionnaire, qui dépose une licence valide (l'écran propose aussi « 💼 Découvrir ou renouveler la licence pro »). Bloqué à l'écran de connexion : la pastille sous la carte dit si la base répond (la toucher pour revérifier), 📖 ouvre la documentation et 🆘 le dépannage. Hors ligne, l'app s'ouvre sur le dernier compte.
  - **Compte** : la carte profil de l'accueil affiche le compte connecté (pseudo et rôle : Admin, Créateur, Lecteur) ; actions du compte (mot de passe, déconnexion) en tête de 👤 Mon profil, rangées en rubriques par l'installation, « Se déconnecter » à part en bas ; l'installation peut aussi ajouter une rubrique à l'Aide intégrée ; gestion des comptes (admin) dans ⚙️ Configuration. **Se déconnecter efface de l'appareil** les données de ce compte (ce qui n'est pas envoyé est signalé avant) ; « Tout réinitialiser » déconnecte aussi. Le mode incognito y est indisponible (grisé, expliqué).
  - **Plans ☁️** : icône ☁️, progression de téléchargement ; sur la ligne : **💾** = le garder sur l'appareil, **⬇️** = nouvelle version, **✅** = gardé et à jour. Un plan local se **publie** depuis sa fiche ℹ️ (« ☁️ Publier ce plan ») ; l'app propose ensuite de remplacer la copie locale par la version ☁️ (annotations, photos, favoris et liaisons suivent ; refusé si la version ☁️ a déjà une session). Badge « 👥 N » / « ✏️ N » sur un plan ☁️ = d'autres comptes l'ont ouvert / le modifient.
  - **Droits** : avec le droit « lire », ni ✏️ ni 🗑️, outils de dessin grisés (« Lecture seule »), import de session et Ctrl+Z / Ctrl+Y refusés, fiche des objets en lecture ; une fenêtre l'annonce à l'ouverture — ce n'est pas un bug : demander le droit « modifier » à l'administrateur. L'export d'un plan ☁️ est réservé à son propriétaire (et à l'admin). Une action réservée à un autre poste du Mode Secours (ex. rentrée = chef) est refusée avec un message.
  - **Travail à plusieurs** : après des modifications d'autres comptes, ⏪ Annuler repart de zéro (« Historique d'annulation vidé » — annuler aurait effacé leur travail) ; une fiche ouverte sur un point modifié par un autre demande « Garder ma version ? » ; la fiche d'un objet peut afficher « Créé par X · modifié par Y ».
  - **👥 Équipe** (bouton sous ⭐ Favoris) : qui est sur le plan (« ✏️ en édition » / « 👁️ consulte »), sa position SUR LE PLAN (pas de GPS : celle de son suivi) s'il la partage, avec 📍 Centrer, 👁 Suivre, 〰 trace. **📡 Partager ma position sur ce plan** : fenêtre Tracker, section Suivi (positions visibles seulement des membres d'un groupe commun). **« 🧭 Montrer mon itinéraire à l'équipe »** (fenêtre Itinéraire) : choix distinct ; retiré à l'effacement de l'itinéraire, au changement de plan, à la déconnexion, au plus tard 24 h après ; les itinéraires des autres s'affichent en pointillés jaunes, en lecture seule. Un chef d'équipe peut envoyer son itinéraire à un membre.
  - **Mode Secours relié** : « 👥 Poste PC… » et « 👥 Comptes de l'équipe… » (chef ★), puis « 🚨 Déclencher l'intervention » (Admin ou Créateur) : bandeau rouge chez les comptes affectés (✅ Vu, ➡️ Rejoindre mon poste, 📡 partager sa position), tableau partagé étape par étape (hors réseau : envoyé au retour), photos d'étape, appel nominal, retards signalés, rapport, ⏹ Terminer avec un motif. L'effectif d'une équipe se calcule seul (saisi, sinon le plus grand de membres nommés et comptes reliés).
- 🔄 **Réimport d'un plan regénéré** : importer un ZIP de **même nom + même auteur** qu'un plan déjà présent mais de **version différente** ouvre un choix — **🔄 Mettre à jour** (l'entrée et son archive mémorisée sont remplacées ; **session, notes et liaisons inter-plan conservées** ; photos remplacées seulement si le nouveau ZIP en contient), **➕ Garder les deux**, ou **Annuler** (choix par défaut sur ✕ / Échap / clic à côté — jamais d'écrasement accidentel). Même nom et même version : la popup « Ce plan existe déjà » propose aussi Mettre à jour / Garder les deux / annuler. Pas de question pour les plans serveur ni à la re-sélection du fichier d'un plan précis depuis la liste.
- 🛡️ **Une modale coupe l'outil en cours** : ouvrir une fenêtre (Réglages, Filtres, Documentation, Mode Secours…) pendant une **mesure, édition de points, tracé, zone, structure ou recalage** désarme le mode (pas de clics fantômes à la fermeture). Le **tracker n'est jamais coupé**, et la fiche d'un point qu'on vient de poser n'interrompt pas l'édition.
- 📊 **Éditeur de données du plan** : édition en tableau depuis 🗺️ plan en cours, 📦 ZIP de plan, 📄 fichier JSON seul (depuis le HOME : ZIP et JSON uniquement), plus **🔗 Fusionner des calques de données** (combine plusieurs fichiers de calques en un seul, sans toucher au plan). Les points s'éditent entièrement ; tracés/zones/structures : note, type et niveau seulement (géométrie en lecture seule). Les modifications se téléchargent en `.json` à réimporter dans le Générateur 🏗️ — jamais appliquées en direct ; seule la session peut être remplacée en live.
- 🖼️ **Export PNG** : Mode rapide / Mode avancé (avec légende, calques au choix, résolution)
- 🌍 **Export KMZ géolocalisé** : onglet 📡 Export externe de 💾 Exporter. Calibrage par 2 points (x/y plan ↔ lat/lng GPS), puis génération d'un `.kmz` ouvrable dans Google Earth, OsmAnd, Locus, Avenza… Transparence du plan réglable, contenu sélectionnable finement (par tag, type de tracé, type de zone), multi-niveau géré (1 dossier par niveau). Calibrage mémorisé par plan.
- 📤📥 **Import + Export GPX** : format GPX 1.1 standard (TopoDroid, OsmAnd, Avenza, Garmin…). Même calibrage GPS que le KMZ. Export : ⬆️ Enregistrer → 💾 Exporter → onglet 📡 Export externe → GPX. Import : sidebar gauche → ⬇️ Charger → 📥 Importer → choisir le `.gpx` (le même bouton prend aussi les sessions `.json`/`.zip` : l'extension décide ; une session REMPLACE, un GPX AJOUTE — aperçu avant confirmation, annulable Ctrl+Z). Un aller-retour MyKTAMap↔MyKTAMap préserve niveaux et types de tracés.
- 📚 **Liste « Mes plans » (accueil)** :
  - **Toggle "🌐 Afficher les plans du site"** (mémorisé) — cacher les plans posés sur le site (démos, relevé fictif…) pour ne voir que ses plans persos ; recocher = ils réapparaissent intacts (filtre d'affichage seulement). Une installation peut les masquer par défaut ; le choix de l'user prime.
  - **Badges** V1/V2/M-LVL + stockage (✅/🔐/📁) sous le nom. Cliquer n'importe où sur la ligne charge le plan ; la version du plan se lit dans ℹ️ Infos. Un plan **non mémorisé** (📁) porte un **💾** : il redemande le ZIP (refusé si ce n'est pas le même plan) et le mémorise, sans l'ouvrir.
  - **ℹ️ Infos détaillées** par plan : tous les attributs (id, nom, version, auteur, type, fichier source, taille, persistance, mode, dates), étiquettes, renommage, tuilage (plans non V2), disponibilité hors-ligne (plans serveur), téléchargement du ZIP, suppression.
  - **Mémorisation du plan** : réglage **⚙️ Configuration de l'accueil → « 💾 Mémoriser le plan dans l'app au premier chargement »**, activé par défaut — rien à cocher sur l'accueil. Désactivé, le ZIP est redemandé à chaque ouverture.
  - **Organisation** : **🔎 filtre par nom** (live, remis à zéro à chaque visite, matche aussi le nom local), **⭐ épinglage** (remonte le plan en tête), **🏷️ tags** (ℹ️ Infos → « Tags du plan », séparés par virgules, 12 max de 24 caractères ; chips-filtres au-dessus de la liste dès qu'un plan est tagué, multi-sélection en OU). Les tags/épinglages vivent dans l'app : ils ne voyagent PAS avec un ZIP partagé, mais suivent l'export de profil et l'export 💾 de la liste (.config). Le Générateur et ses convertisseurs (KMZ, GPX, SIG) ont aussi un champ **🏷️ Étiquettes** écrit dans le ZIP et **proposé** à l'import : des étiquettes posées à la main ne sont jamais écrasées par un ZIP.
  - **✏️ Renommer un plan** (ℹ️ Infos, « Renommer l'affichage ») : nom LOCAL (différencier deux plans homonymes) ; le vrai nom du plan-config n'est PAS modifié ; champ vide = retour au nom d'origine.
  - **Suppression** : en FIN de la fenêtre ℹ️ Infos (bouton 🗑️ + confirmation) ; elle purge aussi la session, le géoréférencement, les photos, les backups, l'archive mémorisée, les tags et l'épinglage ; sont CONSERVÉS le carnet, les récits et les liaisons. Si le plan a des PDF du Mode Histoire, une case « Supprimer aussi ses documents (X Mo) », **décochée par défaut**, est proposée. Le ZIP sur le disque n'est jamais touché. **Backups** : 10 par plan (FIFO). **🧹 Données orphelines** : ⚙️ Configuration → 📊 État mémoire liste les données liées à des plans qui ne sont plus dans la liste et PROPOSE leur nettoyage — jamais automatique.
  - **Mode Dossiers** : sélecteur **Tout | Dossiers** à droite du titre « 📚 Mes plans ». En mode Dossiers : sections créées par l'utilisateur (➕), couleur par dossier, un plan dans **un seul** dossier, « Non classés » en dernier ; ⋮ = renommer, couleur, monter/descendre, supprimer (**ses plans repassent en Non classés, aucun plan n'est jamais supprimé**). **Ranger** : ☑ Sélectionner puis « Déplacer vers… » (il n'y a pas de bouton par ligne), ou glisser la ligne sur un dossier — à la souris, ou au doigt par **appui long** (~0,5 s immobile ; un doigt qui bouge tout de suite fait défiler la liste — **à expliquer si un utilisateur dit « le glisser ne marche pas sur mobile »**). **Règle par étiquette** (⋮ → « inclut aussi les plans étiquetés… »). Un déplacement à la main l'emporte toujours (sur une règle, et sur le serveur) ; la pastille devant le nom : pleine = rangement explicite (main, import multiple, serveur), creuse = placé par une règle d'étiquette. Les dossiers proposés par le serveur sont verrouillés (ni renommables ni supprimables) mais l'utilisateur peut toujours déplacer un plan. Les dossiers voyagent avec le profil.
  - **📦 Importer plusieurs plans** (🧰 Outils de l'accueil) : N archives ZIP entrent dans la liste **une par une, sans qu'aucune ne s'ouvre** ; l'app affiche d'abord le plan d'action, le poids total et la place restante, **refuse de commencer** si ça ne rentre pas et **s'arrête net** en gardant ce qui est entré si la place s'épuise. Doublons : laisser tel quel (défaut), remplacer, ou garder les deux. Case « 💾 Précharger le ZIP » (défaut = réglage de mémorisation) ; décochée, le ZIP est demandé à la première ouverture. « Ranger dans : » pour le lot.
  - **🌐 Plans serveur** : un plan retiré du serveur disparaît de la liste (seulement après un accès réussi à l'index, sans toucher aux données associées). Bouton de **téléchargement hors-ligne** sur la ligne et dans ℹ️ Infos → « Disponibilité hors-ligne » : image + données + **toutes** les tuiles dans un cache dédié, jamais purgé par une mise à jour. Quatre états lus du **cache réel** : **absent** (⬇️), **complet** (« ↻ Mettre à jour »), **partiel** (des fichiers déclarés par le plan sont introuvables sur le serveur : l'app **les nomme**, « ↻ Réessayer »), **incomplet** (téléchargement interrompu, « ⬇️ Compléter »). À l'ouverture de la fiche, l'app vérifie si le plan hors-ligne est **périmé** : ⚠️ mise à jour disponible · ✓ à jour · **inconnu** si aucune vérification n'a abouti.
  - **Modales de re-sélection ZIP** : **🚫 Nom différent** (le ZIP re-sélectionné ne correspond pas au plan ciblé → refus, pour charger ce ZIP passer par 📦 Charger un nouveau plan) ; **⚠️ Mode différent** (flags V2/multi-niveau du ZIP différents du registre → carte Avant → Maintenant, Annuler / Continuer).
- 🌐 **Déployer un plan sur un serveur** (auto-hébergement) : il suffit de **dézipper le ZIP tel quel** dans `data/<nom>/` et de déclarer le plan dans `data/index.json` ; les chemins sont résolus depuis le dossier du plan, les tuiles V2 sont trouvées automatiquement, les icônes personnalisées sont prises dans le dossier du plan si elles y existent (sinon celles de l'app).
- 📐 **Réglages responsive PC** : la modale ⚙️ Réglages passe en layout 2 colonnes sur ≥1024px. Sur mobile : 1 colonne.
- 🔑 **Écran d'entrée** : au premier lancement (et après « 💥 Tout réinitialiser »), MyKTAMap propose simplement **Continuer** (avec le choix de langue) ; le choix est retenu sur l'appareil. Il n'y a **plus de code communautaire**. **Seule une installation qui publie SON mot de passe** (`index.json > config.accessHash`, posé par ConfAdmin) le demande, et **il est le SEUL qui ouvre** : une licence pro ne le remplace pas (si un user dit « j'ai une licence pro mais l'app me demande quand même un mot de passe » : **ce n'est pas un bug**). Si l'installation le change, il est redemandé au démarrage suivant ; hors connexion, l'accès reste valable. ⚠️ Barrière **sociale**, jamais une authentification. Mot de passe faux 5 fois = verrou temporaire (10 min, 1 h, 6 h, 24 h), jamais définitif. L'utilisateur ne peut pas importer de licence lui-même : seule la licence posée sur le serveur par le gestionnaire compte.
- 📐 **Icônes adaptatives au zoom** : les icônes des points gardent une taille relative au plan constante (elles rétrécissent au dézoom, grossissent au zoom ; bornées 0,25 → 2×). Réglage global dans ⚙️ Configuration de l'accueil (défaut activé, reload requis).
- 🔍 **Double-clic sur un marker → zoom** : un clic ouvre le popup, un double-clic rapide zoome en douceur sur le point (zoom +2). Ne s'applique pas au tracker ni à l'Affichage XL.
- 🔢 **Format de version** : vX.Y.Z (X = majeure, Y = évolutions, Z = correctifs). Le numéro installé se lit sur le badge en bas de l'accueil.
- 📄 **Export PDF imprimable** : ⬆️ Enregistrer → 📤 PDF imprimable. Formats A0/A1/A2/A3/A4 × portrait/paysage, calques au choix, légende posée dans un coin (3 tailles, 4 styles). Cf FAQ « Exporter en PDF imprimable ».
- 🔍 **Recherche unifiée** (Ctrl/Cmd+K) : 📍 Points · 🛣️ Tracés · ⬛ Zones · 🏛️ Structures (session + calques de données), résultats groupés par catégorie. Cf FAQ « Recherche unifiée ».
- 🗺️ **Légende** : section 🏛️ Structures dans la légende de l'app, dans la légende exportée PNG et dans le PDF.
- 📖 **PDF Histoire dans le générateur avancé** : le générateur avancé permet d'embarquer des PDF Histoire dans le ZIP du plan (section dédiée après Géoréférencement ; en mode Modifier, les PDF existants sont conservés, bouton "🗑 Retirer" pour les enlever). Distinction d'usage : générateur = embarquement durable pour tous les utilisateurs du ZIP ; modale 📖 Mode Histoire = documents ajoutés localement sur l'appareil.
- 🎨 **Interface en mode carte** :
  - **Header bar** en haut avec rose des vents cliquable (retour accueil avec garde-fou si session modifiée), nom du plan **cliquable** qui ouvre la modale "🗂 Changer de plan" (plan en cours avec badge `● ACTIF`, liste des récents, bouton "📚 Voir tous mes plans"), et compteurs cliquables (📍 points · 🛣 tracés · ⬛ zones · 🏛️ structures · 📸 photos, regroupés en 1 chip 📊 sur mobile) qui ouvrent **📊 Détails de la session** : « ✅ Enregistré il y a N s », stats agrégées, répartition par niveau, points / tracés / zones / structures / photos, autres mesures, 📔 sortie en cours, ⭐ favoris (export / import), 📦 backups du plan (Restaurer, Snapshot maintenant, Tout vider), jauge 💾 Mémoire des sessions, bouton 📊 Stats globales.
  - **Sidebars** gauche (Doc/Réglages/Charger/Enregistrer) et droite (Recherche/Édition/Mesure + accordéons Tracés/Zones/Tracker) ; sous-actions empilées, dépliées vers l'intérieur de l'écran en paysage mobile ; boutons ▾/▸/◂ pour réduire une sidebar sans arrêter les modes actifs. Les panneaux **Tracés / Zones / Structures** s'ouvrent **centrés à l'écran** (option ⚙️ Configuration de l'accueil → « 🪟 Ancrer les panneaux d'outils au bouton » pour l'ancrage au bouton, utile sur grand écran).
  - **Status bar** en bas (📐 mesure · 📏 distance totale · 🗺️ itinéraire · 🧭 suivi « ON · 👣 pas · distance », un tap ouvre le menu Tracker), repliable, qui passe sur plusieurs lignes si besoin.
  - **🧭 Boussole d'orientation** : en portrait en bas à gauche au-dessus du footer ; en paysage en bas au centre. Activée via 🧭 Tracker → 🧭 Boussole.
  - **La bulle d'un point** (tap sur un marqueur) : 📍 Je suis ici (recale le suivi et confirme la position), 🧭 Y aller (itinéraire), ➕ Itinéraire (ajouter comme étape), ☆ Favori, 🔊 Lire la note, 📋 GPS si géoréférencé, 📸 miniatures, 🌀 liaisons ; sur les points de la session seulement : ✏️ Modifier, 📌 Repositionner, 🗑️ Supprimer (annulable ⏪).
  - **Pastille « N filtres actifs »** sur ≡ (niveaux compris) et message si des filtres sont restaurés au rechargement ; bandeau persistant si le stockage est saturé.
  - **⚪ Ronds aux intersections de tracés** : réglage par plan dans ⚙️ Réglages ; au-delà de 500 tracés (50 en mode ULTRA), le calcul est sauté pour ne pas figer l'app.
  - Le **Générateur de plan** n'est accessible que depuis l'accueil (🏗️ Générer un plan).
- ⚙️ **Réglages (mode carte)** : un seul écran à portée explicite, sans bouton « Appliquer » — **chaque réglage s'enregistre dès sa modification** (éclair vert ; hors bornes = rouge + message, rien d'écrit) ; Échap, ✕ ou Fermer ferment sans rien perdre. Huit groupes (🌍 Application · 📐 Plan · 📍 Navigation & tracker · 🎨 Affichage · 🚀 Performance · 🛰️ Capteurs · 🔒 Confidentialité · 🛠️ Système), chaque titre porte sa portée (**📍 ce plan** / **🌍 tous les plans**) et se replie d'un tap. Bloc **🏠 Réglés depuis l'accueil** (langue, thème, icônes au zoom, panneaux, magnétisme, carnet — en lecture seule + bouton vers l'accueil). Le **🌐 Géoréférencement GPS** a sa propre fenêtre, ouverte depuis le groupe Plan. **↺ Valeurs par défaut** ne touche que CE plan. Trois réglages globaux restent modifiables en mode plan parce qu'on les ajuste en cavité — écran allumé, vibration, batterie — et leur libellé dit « s'applique à tous tes plans ». Fonctions non supportées par le navigateur (ex. wake lock, commandes vocales sur Firefox) : ligne visible, grisée, avec la raison.
- 🧩 **Fonctionnalités optionnelles** (⚙️ Configuration de l'accueil **et** ⚙️ Réglages du plan, même réglage, tous plans) : **toutes désactivées par défaut** — **🎬 Replay du tracker** et **🔥 Heatmap** (tuiles du menu Tracker, effet immédiat), **🔋 Niveau de batterie** (décocher retire l'icône et coupe la lecture du niveau ; effet au prochain lancement — si l'utilisateur ne voit plus sa batterie, c'est ce réglage), **📳 Vibration haptique** (les alertes de survie vibrent quand même) et **🕵️ Mode incognito** (bouton qui ouvre une session jetable). Un capteur indisponible n'est pas masqué : la ligne s'affiche désactivée avec « ⛔ Capteur refusé par iOS » (ou par l'appareil) — iOS n'expose ni la vibration ni la batterie aux pages web.
- 🔒 **Privacy & Audit** : app 100 % offline-first — aucune donnée utilisateur n'est envoyée sur Internet. Modale 🔒 Audit réseau dans le HOME : liste exhaustive des requêtes possibles (toutes vers le propre domaine de l'app + tuiles OpenStreetMap si la Vue OSM est active), guide de vérification soi-même (📋 journal réseau + F12). Il n'y a **pas** de « mode hors-ligne strict » ; pour ne contacter aucun tiers, on décoche la case 🗺️ Vue OSM (l'incognito la coupe aussi).
- 🗺️ **La Vue OSM est ACTIVE PAR DÉFAUT** : la clé `myktamap_osm_view_opt_in` est tri-état — `"1"` accepté, `"0"` **refusé explicitement (jamais réécrasé)**, absent → actif. ⚠️ Conséquence réseau à savoir avant de répondre : le widget de l'accueil demande son fond à `tile.openstreetmap.org` **au chargement, sans clic**, pour qui a au moins un plan géoréférencé — mais **aucune donnée de plan ne sort**. Restent bloquants et prioritaires : incognito, hors-ligne réel, aucun plan géoréférencé. Si un user dit « je n'ai jamais activé ça » : c'est le défaut, un bandeau l'annonce, et la case de ⚙️ Configuration → 🗺️ Vue OSM la coupe définitivement.
- 🏠 **Page d'accueil** : logo + "MyKTAMap" + tagline "Cartographie souterraine" ; « Reprendre » en avant, liste des plans, barre de recherche 🔎 multi-plans au centre de l'en-tête, outils dans un menu 🧰 (📦 Importer plusieurs plans, 📸 Mes photos…). **⚙️ Configuration** (en-tête, à côté de 📖 Documentation et 🚨 Alertes) regroupe les réglages globaux ; son groupe 🛠️ Système & maintenance a un bouton **🆘 Dépannage** qui range du plus doux au plus radical **🔄 Forcer la mise à jour** (re-télécharge le code, **garde les données** : plans, sessions, préférences) → **🆘 Ouvrir l'outil Kill SW** → **💥 Tout réinitialiser** (purge tout), plus l'adresse de la page de secours `killsw.html`. **🏗️ Générer un plan** reste directement visible. Le multi-niveau s'active **uniquement** via le générateur ou par édition de `plan-config.json` (pas de case dans ⚙️ Réglages).
- 🏗️ **Générateur de plan** : Nouveau plan / Modifier existant (ZIP). Auto-détection des dimensions de l'image principale + avertissements si > 10000 px / > 30 Mo ; position initiale du tracker auto-centrée, avec bouton 🎯 Recentrer.
  - **🎨 Image vierge** : alternative à l'upload d'une image source — canvas vide aux dimensions choisies (500-12000 px) avec fond au choix (⬜ Blanc / ▫️ Gris clair / ⬛ Noir / 🌫️ Gris foncé), ou transparent. Utile pour dessiner un plan from scratch.
  - **📦 Importer un datalayer ZIP en un clic** (section Calques de données) : injecte les calques (points / tracés / zones / structures) + photos d'un ZIP datalayer exporté depuis un autre plan. Mode Nouveau = remplit la liste ; mode Modifier = AJOUTE avec suffixe `_imported_<N>` si conflit d'id.
  - **📸 Inclure les photos attachées** : case visible en mode Modifier, cochée par défaut si le plan a des photos ; embarquées dans le ZIP et restaurées automatiquement chez qui le charge.
  - **🎨 Fond sous le plan** : le Générateur peut conseiller un fond (noir, blanc, gris) affiché sous un plan transparent ; réglable par plan dans ⚙️ Réglages › Affichage › « 🎨 Fond sous le plan ».
- 🚀 **Mode Performance ULTRA** (⚙️ Réglages → 🚀 Performance, **par plan**) : un interrupteur maître « 🚀 Mode ULTRA (active tout) » + 6 cases — 🪜 Décimer les tracés au dézoom · ⚡ Désactiver animations zoom/pan (reload requis) · 🎯 Désactiver cercles intersections · 🚫 Désactiver popups sur calques de données · 🐢 Auto-save lent (30 s) · 🛡️ Limiter le dézoom sur mobile (anti-crash mémoire, **coché par défaut** ; décoché, le mobile est traité comme un PC pour le dézoom, reload requis). Le maître active aussi « Ne rendre que ce qui est proche de l'écran » (sans case séparée). Toutes les autres cases sont décochées par défaut. N'affecte PAS l'image du plan. **À savoir pour assister** : avec ULTRA, des tracés apparaissent en bord d'écran pendant un déplacement — c'est le réglage, pas un bug. Sur un plan multi-niveau, la case « 🏗️ Afficher tous les niveaux au lancement » (cochée par défaut) est dans le même groupe.
- 🤖 **Aide IA** : téléchargement de ce fichier de contexte — bouton 🤖 dans la ligne de titre de la 📖 Documentation, à côté du choix de langue (donc aussi depuis l'accueil)
- 🔔 **Détection de mise à jour** : popup « Mise à jour douce » / « Plus tard » (le reset complet n'y est pas : seulement dans ⚙️ Configuration → 🆘 Dépannage, en dernier recours)
- 🏷️ **Badge version cliquable** dans le footer de l'accueil : affiche la version installée (format `vX.Y.Z`). Clignote en bleu si une nouvelle version est dispo (passage visible : `v2.13.1 → v2.13.2`). Au clic, force la modale d'update. Si déjà à jour, affiche les notes de la version installée.
- 🔔 **Notifications** : ⚙️ Configuration de l'accueil → « 🔔 Notifications », trois positions. **Toutes** = chaque geste confirmé. **Essentielles** (**défaut**) = plus de petits messages qui confirment un geste (déplacé, copié, annulé, exporté…), les messages d'état (batterie 20 %, filtres restaurés…) restent mais sans vibration. **Silence** = seuls batterie 10 %, capteurs refusés, stockage plein et les erreurs. **Jamais coupés** : les alertes publiques, les fenêtres qui demandent une décision, les erreurs. **Si un utilisateur dit « je ne vois plus les petits messages »** : vérifier ce réglage.
- 🚨 **Alertes publiques** : système de diffusion d'alertes (incendie, fermeture, gaz toxiques…) via fichier `alert.json` côté serveur. Modales colorées selon niveau (`emergency` rouge / `warning` orange / `info` bleu) affichées en cascade après le splash ; plusieurs alertes peuvent être actives simultanément (chacune acquittable individuellement). Bouton 🚨 dans le header de l'accueil pour re-consulter à tout moment, avec **coloration dynamique** selon le niveau max actif + pastille compteur si N > 1 alertes.
- 🧭 **Boussole / widget Nord** : sous-action 🧭 dans le groupe Tracker → rose des vents flottante qui tourne en temps réel pour pointer vers le Nord. Clic dessus → modal plein écran avec la rose en grand + angle cardinal exact. Tient compte de l'orientation de l'écran (portrait, paysage, inversé). Outil de vérification du cap du téléphone.
- ⚠️ **Avertissement au démarrage du tracker** : au premier ▶️ Play de chaque session, modal qui rappelle que le module est expérimental et ne doit pas servir seul à se localiser en situation réelle. La permission capteurs est demandée à ce moment (refus = message, pas de faux « ON») ; « Garder l'écran allumé » est proposé.
- 🚨 **Sortie d'urgence et « Y aller »** partent de la position **à l'instant T** ; si la position n'a jamais été confirmée sur ce plan (jamais de « Je suis ici », de recalage ni d'arrivée par portail), l'app demande « Où es-tu ? » d'un tap sur la carte (qui recale aussi le suivi). Les sorties « à vol d'oiseau » sont dites en toutes lettres.
- 🏗️ **Mode multi-niveau** : pour les carrières multi-étages — chaque élément (point, tracé, zone, structure, calque image) porte un niveau (ex. 0, -1, -2) ; la modale 🏗️ Niveaux filtre l'affichage par étage. Jonctions inter-niveaux (puits, escaliers) reliant les réseaux de tracés pour l'itinéraire. Se déclare dans le Générateur (case multi-niveau + niveau par calque).
- 🔎 **Stats du profil** : camemberts de répartition (tous plans), avec un **filtre par étiquette** (chips à 3 états : neutre → inclure → exclure ; l'exclusion l'emporte ; filtre non mémorisé) et un camembert « Plans par étiquette ». Les **types personnalisés** y apparaissent sous leur nom, mémorisé à l'ouverture de chaque plan ; un plan jamais ouvert depuis garde l'identifiant (`cust-…`) — le bouton **« Retrouver les noms »** (sur clic uniquement, il annonce le nombre de plans à lire) relit les plans et range les noms.
- 🖼️ **Tuilage d'un plan non V2** : le réglage n'est **pas** sur l'écran de chargement. Il vit dans ℹ️ Infos du plan (« 🖼️ Tuilage de ce plan »), **seulement pour un plan non tuilé V2**, et y est mémorisé. Deux choix : **🔄 Auto** (défaut — découpe l'image dès qu'elle dépasse 4096² pixels ou 60 Mo) et **💤 Désactivé**. Un plan V2 **utilise toujours ses tuiles** — si un user cherche le réglage sur un plan V2, il est absent : **ce n'est pas un bug**.
- 🧱 **Tiling V2** : système de tuilage type Google Maps pour réduire la consommation mémoire sur gros plans. Génération via le générateur de plan (case 🧱 Convertir en V2 tuilé) — en mode Nouveau OU Modifier dès qu'une image est fournie. Seules les tuiles du niveau de zoom courant sont en mémoire. Auto-crop des marges blanches intégré. Modal d'avertissement avant la conversion (lourde — recommandé sur PC plutôt que mobile).
- 🫥 **Transparence des plans** : une image source PNG/WebP avec vrai canal alpha est tuilée SANS fond ajouté — les calques se superposent proprement. Un plan généré autrefois avec un fond noir doit être régénéré depuis sa source pour en profiter.
- 🏷️ **Badges de mode sur la liste de plans** : `V1` (gris), `M-LVL` (jaune multi-niveau), `V2` (violet tuilé). Plusieurs badges peuvent coexister.
- 🌀 **Overlay de chargement plein écran** : pendant le chargement d'un plan (extraction ZIP, indexation des tuiles, init carte), une modale centrée avec spinner + message d'étape.
- ❌ **Erreur explicite en cas d'échec de génération V2** : modale rouge qui détaille la cause (drawImage / toBlob / saturation mémoire) avec la tuile en échec + conseils (PC vs mobile, réduire l'image source, JPEG q85).
- 🛡️ **Détection des crashs durant la génération V2** : si le navigateur tue la page pendant la génération (manque de mémoire, typique sur mobile), au prochain démarrage une modale **"🧱❌ Génération V2 interrompue"** rappelle les solutions.


**Autres fonctionnalités notables** (une ligne chacune — détails dans les recettes / la Documentation intégrée 📖 de l'app) :
- 🌍 **Vue OSM** (active par défaut, se coupe dans ⚙️ Configuration → 🗺️ Vue OSM (OpenStreetMap) ; l'incognito la coupe aussi) : projette le plan calibré sur une carte OpenStreetMap (modale 🌍 en mode carte + widget sur le HOME) ; **💾 Save Offline** met en cache les tuiles OSM (max 200/clic) pour un usage hors-ligne.
- 📖 **Mode Histoire** : bouton 📖 dans la barre du haut — carnet de notes libre par plan (éditeur Markdown léger, sauvegarde auto) + visionneuse de PDF embarqués ou importés.
- 🎤 **Commande vocale** (opt-in, **en français uniquement** : le bouton 🎤 n'apparaît que si l'app est en
  français) + 🔊 **lecture vocale des notes** d'un point (bouton dans le popup) — 100 % local, voix du téléphone. « où est la sortie » / « trouve la sortie » ouvrent la sortie d'urgence.
- 📳 **Vibrations haptiques** (fonctionnalité optionnelle, non supportée sur iPhone) : confirmations discrètes terrain (waypoint atteint, recalage, alertes).
- ⭐ **Favoris** de points + 🔥 **Heatmap** de densité (optionnelle : densité des points sur le plan, 3 sources — timeline du tracker / points de session / points des calques — rayon et intensité réglables ; aussi dans le Mode Secours) + 📈 **Stats globales** du profil (tous plans confondus).
- 🛟 **Snapshots automatiques de session** (filet anti-perte, restauration depuis 📊 Détails de la session → 📦 Backups ; un snapshot est pris avant chaque import de session) + ↩️ **Undo/Redo global** (Ctrl+Z / Ctrl+Y). Confirmations avant d'effacer la session, les réglages d'un plan, un géoréférencement, un snapshot ; une zone ou un pilier en cours est fermé, pas détruit, quand on change d'outil.
- 🕶️ **Mode Incognito** (session jetable, rien n'est persisté) + 🧠 **Inspecteur mémoire** (Configuration) + 🧰 **Inspecteur Service Worker** (🛠️ Mode Développeur seulement).
- 📡 **Pastille « hors-ligne »** (accueil, accolée au numéro de version en bas) : 🟢 verte = tous les fichiers de l'app sont enregistrés pour le hors-ligne ; 🔴 rouge = fichiers manquants → la toucher (avec du réseau) les retélécharge, avec progression, et un 📥 rouge le rappelle dans l'en-tête de l'accueil ; 🟠 orange = enregistrement en cours, ou manquants sans réseau ; ⚪ grise = pas de service worker (navigation privée, incognito, premier chargement). L'app répare déjà le cache en silence ~5 s après l'accueil ; la pastille montre le résultat. Si un utilisateur demande « suis-je prêt à descendre ? » : pastille verte + plan mémorisé (et, pour un plan serveur, téléchargé pour le hors-ligne).
- 🎓 **Tutoriel d'onboarding** au premier lancement (rejouable depuis 📖 Documentation → 🎓) : une dizaine de cartes courtes, dans l'ordre du guide — bienvenue (les données restent sur le téléphone), avant de descendre (installer, charger son plan avec du réseau), charger un plan, urgence (Sortie d'urgence, Affichage XL, Je suis perdu), se repérer dans l'app, chercher, suivre sa position, itinéraire et guidage, annoter, ses données, réglages et aide. Le reste est dans le guide et l'Aide ❓.
- 📖 **Documentation** : recherche plein texte (surlignage, Entrée / ↓ = suivant, compteur i / n, accents ignorés).
- ≡ **Modale Filtres unifiée** en mode carte : cocher/décocher calques de données, calques image, tags, avec « 🔄 Tout afficher ».
- 👤 **Profil utilisateur** : pseudo + avatar + bandeau de stats du HOME ; **export/import du profil complet** (préférences, favoris, sessions, snapshots, carnet, liaisons entre plans, dossiers, photos et PDF en option) pour migrer d'appareil. Les **plans d'une organisation (☁️)** et tout ce qui les touche ne partent pas dans le fichier et ne sont pas restaurés par un import (ils se récupèrent en se connectant à l'organisation). L'import ne reprend que les préférences qu'un export produit.
- ⛔ **Liste de révocation** (kill-switch) : un plan diffusé puis révoqué par l'auteur est bloqué au chargement (vérification 100 % locale par empreinte).
- 🌀 **Liaisons inter-plan / portails** : lier un point d'un plan à un point d'un autre plan, navigation par portail avec bouton Retour, gestionnaire « Mes liaisons » (liste + vue graphe « réseau de plans »), itinéraire inter-plan et multi-hop (cf recette « Lier deux plans entre eux »).

**Types de zones** (exhaustif — il n'en existe que 4) :
- **Remblais** (gris foncé, ⬛)
- **Effondrement** (rouge, 🟥)
- **Eau** (bleu, 🟦)
- **Inaccessible** (hachures rouge sombre à 45°, ⛔). Zone BLOQUANTE pour le pathfinder **par défaut** : tout segment de route qui la traverse est retiré du graphe → l'itinéraire calculé ne passe pas par cette zone. Relâchable seulement par la case « Respecter les zones inaccessibles » de la modale Itinéraire (cochée d'origine) ; le Mode Secours et « Je suis perdu » la respectent toujours. Multi-niveau : ne bloque que les segments du même niveau.

→ Il n'y a **PAS** de zone "brûlée", "incendiée", "dangereuse", "fumée", "sèche", "gelée", "humide" ou autre. Strictement Remblais / Effondrement / Eau / Inaccessible (plus les types personnalisés qu'un plan ou une session peut définir dans sa légende).

**Types de tracés / routes** (exhaustif — il n'en existe que 5, dont 1 conditionnel) :
- **Principal** (vert)
- **Secondaire** (violet)
- **Chemin** (jaune)
- **Itinéraire** (cyan, pointillé, calculé automatiquement — pas tracé à la main)
- **Jonction interniveau** (polyline magenta pointillée + ronds blanc/magenta aux 2 extrémités) — UNIQUEMENT disponible si le plan a le mode **multi-niveau** activé. Polyline multi-points (comme un tracé normal) qui sert de passage entre 2 niveaux pour le pathfinder, dans les 2 sens. S'efface comme un tracé normal via 🧹.

**Types de structures** (exhaustif — il n'en existe que 5) :
- **🟡 Pilier 1ère masse** (polygone, fond jaune, bordure noire) — pilier porteur du niveau supérieur
- **🟠 Pilier 2e masse** (polygone, fond orange, bordure noire) — pilier du niveau inférieur. Auto-taggé `level = -1` en mode multi-niveau
- **🔵 Mur** (polygone, fond bleu foncé, bordure noire) — mur de pierre sèche, parpaing, soutènement maçonné
- **🟨 Front de taille 1ère masse** (polyligne épaisse jaune) — front d'exploitation niveau supérieur (LIGNE pas polygone), même couleur que le pilier 1ère masse.
- **🟧 Front de taille 2e masse** (polyligne épaisse orange) — front d'exploitation niveau inférieur. Auto-taggé `level = -1`. Même couleur que le pilier 2e masse.

→ Il n'y a **PAS** d'autre type de structure. Pas de "voûte", "galerie", "puits maçonné", "consolidation béton" etc. Strictement ces 5 types. Le groupe sidebar est **🏛️ Structures**. Aucun effet pathfinder (lecture seule, c'est différent des zones inaccessibles ⛔ qui bloquent l'itinéraire). 4 modes de suppression : ↩️ Annuler dernier point / ✂️ Dernière structure (en cours OU fermée) / 🎯 Sélectionner au clic carte / 🗑️ Toutes.

**📸 Photos POI** :
- Max **5 photos par point** (limite anti-saturation du stockage navigateur)
- Compression auto : JPEG q85, côté long max 1920 px. Une photo brute de 5-10 Mo passe à ~200-500 Ko
- Stockage **100 % local** dans IndexedDB. **Jamais envoyé sur Internet**, jamais lu par l'auteur
- UI éditeur : section "📸 Photos (N/5)" dans la modale d'édition POI avec grille de miniatures, spinner pendant compression, ✕ rouge marque la suppression + ↺ vert pour annuler
- 2 boutons d'ajout : `📷 Prendre photo` (caméra mobile) + `🖼️ Depuis la galerie` (sélection multiple)
- Popup marker : miniatures cliquables + compteur "📸 N photos". Tap → viewer plein écran
- Viewer plein écran : pinch-zoom 1-4×, pan, swipe horizontal entre photos, flèches `← →` ou boutons `◂ ▸`, raccourcis clavier PC (`Échap` ferme, `+ - 0` zoom)
- Compteur **📸** dans la barre du haut. Clic → 📊 Détails de la session avec répartition par point + total Mo
- Inclus dans les exports (session Full / Avancé / Conversion / Générateur ZIP plan) — re-import automatique au chargement

**🔐 Code d'accès local PIN/Face ID** (optionnel) :
- Couche PERSO optionnelle par-dessus l'écran d'entrée. PIN 4-6 chiffres + biométrie Face ID/Touch ID/Windows Hello via WebAuthn natif (pas de clé USB)
- **Modèle de sécurité honnête** : c'est une **barrière UX**, PAS un chiffrement des données. Les photos et sessions restent en clair dans le stockage du navigateur
- Hash SHA-256 salé, stocké localement. **Jamais envoyé sur Internet**
- Activation/modification/désactivation **uniquement dans ⚙️ Configuration de l'accueil**. PAS de section dans ⚙️ Réglages du mode carte
- 5 tentatives PIN ratées consécutives = **verrou temporaire** (10 min, puis 1 h, 6 h, 24 h à chaque nouvelle série), compte à rebours à l'écran, retour automatique au pavé à l'expiration ; un code juste remet tout à zéro. Aucun bouton de reset sur cet écran, aucune récupération du code (100 % local, l'auteur ne peut rien faire). En dernier recours : 💥 Tout réinitialiser depuis l'accueil.
- **Proposition d'activation** une seule fois, à la fin du premier lancement : refus → plus jamais re-proposé (l'user doit aller dans ⚙️ Configuration manuellement)
- Démarrage : la saisie du PIN est demandée après l'écran d'entrée, avant tout chargement de plan

**🏗️ Mode multi-niveau — niveaux visibles par défaut** :
- Au chargement d'un plan **avec multiLevel activé** : **tous les niveaux** sont affichés. Pour revenir à `[-1, 0, +1]` (utile sur un gros relevé qui rame) : décocher « 🏗️ Afficher tous les niveaux au lancement » (⚙️ Réglages → 🚀 Performance). La Vue OSM suit le même choix.
- En single-level : `[0]` strict
- Le défaut `availableLevels` est `[-2, -1, 0, +1, +2]` (symétrique autour de 0), étendu automatiquement aux niveaux présents dans le plan

**Types de points / icônes built-in** (liste fermée) :
- Puits : `pa` (Puits Aération), `pc` (Puits Comblé), `pb` (Puits Bouché), `pe` (Puits au sol / Bassin), `ps` (Puits extraction), `peo` / `pef` (Puits à échelon ouvert / fermé)
- Accès : `eso` / `esf` (Escalier service ouvert / fermé), `cao` / `caf` (Cavage ouvert / fermé)
- Signalétique et repères : `salle` (Salle), `chatiere` (Chatière), `passage` (Passage), `danger` (Danger), `info` (Information), `elec` (Électricité), `epure` (Épure), `plaque` (Plaque indication — panneau beige sur poteau, pour repérer les plaques et panneaux de direction)
- Divers : `vehicule` (Véhicule), `portail` (Portail — liaison inter-plan, icône vortex), `entree_plan` (🚪 Point d'entrée du plan)

→ L'utilisateur **peut créer des tags custom** via 🏗️ Générer un plan, mais en sortie de boîte, seuls les 22 tags ci-dessus existent.

**Modes de tuilage de l'image** (exhaustif — il n'en existe que 2, et seulement pour un plan non tuilé V2, dans ℹ️ Infos du plan) :
- **🔄 Auto** — défaut : découpe l'image au chargement si elle dépasse 4096² pixels ou 60 Mo
- **💤 Désactivé** — pas de découpage (risqué sur mobile pour les grosses images ; un avertissement s'affiche)

→ Il n'y a **PAS** de presets « Qualité / Équilibré / Performance » à choisir, ni de sélecteur sur l'écran de chargement. Un plan **V2** utilise toujours ses tuiles.

**Modes de plan** (3 modes orthogonaux, peuvent coexister) :
- **V1** (mode classique) — défaut. Image entière chargée au chargement, éventuellement découpée par le navigateur (cf modes de tuilage). Badge `V1` gris.
- **Multi-niveau / M-LVL** — opt-in via `plan.multiLevel: true` dans `plan-config.json` (case du Générateur). Tracés, zones, points et tracker tagués par niveau. Pastille de niveau sous le zoom + filtre visibles + jonctions interniveau. Badge `M-LVL` jaune.
- **V2 tuilé** — opt-in via `plan.tiledV2: true` + section `tiling` dans `plan-config.json` (case 🧱 du Générateur). Image pré-découpée en tuiles 512×512 sur 4 niveaux de zoom. Badge `V2` violet.

**Formats de fichiers manipulés** (exhaustif) :
- Plans : `.zip` (archive de plan) ; liste de plans : `.config`
- Sessions : `.json` (export de session) ou `.zip` (session avec photos / PDF)
- Profil : `.json` ou `.zip` (« profil complet » avec archives de plans)
- Images de plan : formats d'image courants (`.png`, `.jpg`, `.webp`…) et `.tif`/`.tiff` (GeoTIFF calé)
- Données : `.json` (calques : puits, vehicule, editor, etc.)
- Import SIG : `.geojson`, `.json`, `.kml`, `.kmz` (vectoriel)
- Terrain géoréférencé : `.kmz` et `.gpx` — export, et import (déposés sur l'accueil ou le Générateur, ils créent un plan ; un `.gpx` peut aussi s'ajouter à la session d'un plan ouvert)
- Documents : `.pdf` (Mode Histoire, export PDF imprimable, rapports Secours)
- Mode Secours : `.mkmsec.json` (scénario) et `.mkmsec.report.json` (rapport d'équipe)
- Replay tracker : `.csv` (export) ; stats de session : `.txt` (export)

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
> *"Je n'ai accès qu'à la documentation utilisateur fournie ici. Je ne peux ni lire le code source (il est public sur GitHub, mais je n'y ai pas accès d'ici), ni naviguer sur le site, ni voir ton app."*

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
| **Calque** | Couche d'éléments superposable sur le plan : image (légende, collision) ou données (puits, points custom, etc.). Activable/désactivable via la modale ≡ Filtres. |
| **Mes annotations** | Calque spécial qui regroupe tout ce que l'utilisateur a ajouté pendant sa session : points éditeur, tracés (routes), zones, structures. |
| **Session** | Ensemble des modifications faites par l'utilisateur sur un plan donné (points ajoutés, tracés, zones, mesures). Auto-sauvegardée localement. |
| **Tracker (PDR)** | Module expérimental qui estime la position de l'utilisateur via les capteurs inertiels du téléphone (accéléromètre + gyroscope), sans GPS. PDR = Pedestrian Dead Reckoning. |
| **Recalage** | Action de remettre manuellement le tracker à une position connue sur le plan (clic sur un point repère) pour corriger la dérive. |
| **Itinéraire** | Trajet calculé automatiquement entre 2+ waypoints en suivant le réseau de routes existant sur le plan (algorithme Dijkstra). |
| **Waypoint** | Point de passage de l'itinéraire (début, étapes intermédiaires, fin). |
| **Puits** | Accès vertical (échelle, échelons) entre 2 niveaux ou vers la surface. Tags built-in : Aération (`pa`), Comblé (`pc`), Bouché (`pb`), Puits au sol / Bassin (`pe`), Extraction (`ps`), Puits à échelon ouvert / fermé (`peo` / `pef`). |
| **Cataphile** | Personne qui explore les anciennes carrières souterraines de Paris (et par extension, tout site souterrain abandonné). |
| **Tuilage Auto / Désactivé** | Réglage de découpage de l'image d'un plan non tuilé V2 (ℹ️ Infos du plan). 2 choix seulement : 🔄 Auto (défaut) / 💤 Désactivé. Ne pas confondre avec le **Mode Performance ULTRA** (⚙️ Réglages), qui allège tracés, animations et popups. |
| **Tiling** | Découpage de l'image principale en tuiles plus petites pour éviter de charger une seule grosse image en mémoire (évite les crashes sur mobile). |
| **V1 (plan classique)** | Plan où l'image principale est chargée intégralement en mémoire au chargement ; le réglage de tuilage (Auto / Désactivé) décide d'un éventuel découpage par le navigateur. Mode par défaut. |
| **V2 (plan tuilé)** | Plan où l'image est pré-découpée en tuiles 512×512 sur 4 niveaux de zoom dans le ZIP (`data/tiles/z<N>/x<col>_y<-k>.jpg`). Au runtime, seules les tuiles du niveau de zoom courant, proches de l'écran, sont en mémoire. Opt-in via le générateur de plan (case 🧱). |
| **Mode multi-niveau / M-LVL** | Opt-in par plan pour gérer les carrières multi-étages. Tracés/zones/points/tracker/calques image tagués par niveau, filtre runtime. Jonctions interniveau (🪜) = seuls bridges entre niveaux pour le pathfinder. **Niveaux supportés** : entiers positifs ET négatifs autour de 0. Défaut `[-2, -1, 0, 1, 2]` (sous-sols typiques + RDC + étages supérieurs). Auto-extension au chargement si les data layers ou image layers contiennent des niveaux hors range. **Tri visuel** : une galerie au niveau N apparaît toujours AU-DESSUS d'une galerie au niveau N-1 (cohérence physique). Au sein du même niveau : chemin (en arrière) < secondaire < principal < jonction. Itinéraire et zones inaccessibles toujours au-dessus de tout. Le générateur (📦 Créer un plan) expose un champ "🏗️ Niveau" à côté de chaque calque image, visible uniquement quand `🏗️ Plan multi-niveau` est cochée. |
| **Jonction interniveau** | Tracé spécial (type `jonction`, magenta pointillé) qui relie 2 niveaux d'un plan multi-niveau. Le pathfinder s'en sert exclusivement pour passer d'un niveau à l'autre — les croisements visuels 2D entre niveaux différents ne comptent pas. Sémantique `fromLevel`/`toLevel` symétrique (traverse dans les 2 sens). |
| **Niveau actif** | Niveau courant utilisé pour DESSINER les nouveaux tracés/zones/points dans un plan multi-niveau. Affiché dans la pastille de niveau sous le zoom (`Niv 0`, `Niv -1`…). Clic → modale Niveaux. |
| **Niveaux visibles** | Liste des niveaux affichés sur la carte (filtre runtime, multi-select). Les éléments dont le `level` n'est pas dans cette liste sont masqués (opacity 0). Les jonctions sont affichées si au moins un de leurs endpoints touche un niveau visible. |
| **Auto-crop** | Étape automatique du générateur V2 qui détecte les marges blanches autour du contenu utile et tuile uniquement la zone non-blanche. Les dims `imageWidth/Height` reflètent la zone croppée. |
| **ZIP de plan** | Archive contenant toutes les données d'un plan (images + JSON + config). Format de partage entre utilisateurs. |
| **Accueil (loader)** | Écran d'accueil de l'app (avant chargement d'un plan). Affiche la liste des plans connus + la zone de chargement d'un nouveau plan. |
| **Service Worker** | Mécanisme PWA qui met les fichiers de l'app en cache pour fonctionnement hors connexion. |

---

<!-- @@PROFIL tous -->
# 🍳 Recettes — workflows fréquents pas-à-pas

<!-- @@PROFIL usage -->
### Première utilisation sur mobile

1. Ouvre https://myktamap.fr dans Safari (iOS) ou Chrome (Android).
2. Ajoute l'app à l'écran d'accueil (iOS : bouton Partager → "Sur l'écran d'accueil" / Android : menu ⋮ → "Installer l'application").
3. Relance depuis l'icône installée — l'app devient autonome (PWA, fonctionne hors connexion une fois les assets cachés).
4. Au premier lancement, la liste « 📚 Mes plans » peut proposer les plans de démonstration posés sur le site. Clique l'un d'eux pour le charger, ou charge ton propre ZIP.

<!-- @@PROFIL usage,plans -->
### Charger ton propre plan (depuis un ZIP)

1. Sur l'accueil, trouve la zone « 📦 Charger un nouveau plan » (glisser-déposer, ou clic pour parcourir).
2. Sélectionne ton fichier `.zip` (la même zone accepte aussi `.kmz`, `.gpx`, `.geojson`, `.kml`, `.tif` pour créer un plan par conversion).
3. Le plan se charge. Il est désormais dans la liste « 📚 Mes plans » — et, si le réglage « 💾 Mémoriser le plan dans l'app au premier chargement » est actif (défaut), il se rouvrira sans redemander le ZIP.

<!-- @@PROFIL usage -->
### Ajouter un point sur la carte

1. Dans la barre latérale, clique sur l'icône **✏️ Édition** (clic direct = mode ON/OFF ; raccourci **E**).
2. L'icône devient surlignée — le mode ajout est actif.
3. Clique sur la carte à l'endroit voulu — une modale s'ouvre.
4. Saisis le nom, choisis un type (puits, info, salle…) et éventuellement une description.
5. ✅ Ajouter.
6. Le point est sauvegardé automatiquement dans la session (sauvegarde automatique toutes les 1,5 s).
7. Re-clic sur ✏️ pour sortir du mode.

**Où se règle quoi** : ⚙️ Réglages du **mode plan** ne contient que ce qui concerne CE plan (échelle, géoréf, Nord, multi-niveau, tracker, ronds aux intersections, **navigation intelligente**, Performance ULTRA) ; ⚙️ Configuration de l'**accueil** porte les réglages globaux (taille des icônes au zoom, ancrage des panneaux, magnétisme + rayon, langue, thème, plans du site, notifications, carnet). ⚠️ Trois réglages globaux restent accessibles en mode plan parce qu'on les ajuste en cavité — écran allumé, vibration, batterie — et leur libellé dit « s'applique à tous tes plans ».

**Où s'ouvrent les panneaux d'outils** : les panneaux **Tracés / Zones / Structures** s'ouvrent **centrés à l'écran**, comme le Tracker et les Filtres. ⚙️ Configuration de l'accueil → « 🪟 Ancrer les panneaux d'outils au bouton » les ancre à leur bouton — utile sur grand écran.

**Pour convertir PLUSIEURS objets d'un coup** : bulle d'un objet → 🔄 Convertir → **🎯 Sélectionner plusieurs objets à convertir** → clic sur la carte pour ajouter (re-clic pour retirer), **➕ Tous les « type » du niveau affiché** pour étendre, puis ✅ Convertir. La sélection ne mélange PAS lignes et surfaces fermées (le refus est expliqué). Tout le lot s'annule en UN `Ctrl+Z`.

**Pour supprimer un tracé / une zone / une structure** : clic sur l'objet → sa bulle → **🗑️ Supprimer** (ligne rouge, sous « Sauver la note » et « Convertir »). Pas de confirmation : `Ctrl+Z` annule, et le message le rappelle. Réservé aux objets de SESSION — un objet de calque de données ouvre une bulle en lecture seule.

**Pour repositionner un point** : clic sur le marker → popup → **📌 Repositionner** → le prochain clic sur la carte y déplace le point (bandeau en haut avec Annuler). Le point garde nom, type, description, photos, niveau et son appartenance de calque ; seule la position change, et le déplacement est annulable par ↩️. Bouton réservé aux points de SESSION — un point de calque de données est en lecture seule (l'ouvrir à la modification d'abord).

**Pour supprimer un point** : clic sur le marker → popup → bouton **🗑️ Supprimer ce point**. Pour annuler : `Ctrl+Z`.

<!-- @@PROFIL usage -->
### Tracer une route

1. Ouvre le groupe **🛣️ Tracés / Routes**.
2. Choisis le type : Principal (vert) / Secondaire (violet) / Chemin (jaune) — ou un type personnalisé de la légende du plan.
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
   Le mode est mémorisé entre sessions. Le label bottom-left affiche le mode actif avec son icône à côté de la distance et du temps.
7. Pour modifier : utilise les boutons 🔄 Recalculer ou ❌ Effacer.

<!-- @@PROFIL usage -->
### Sauvegarder et partager une session

1. Ouvre le groupe **⬆️ Enregistrer**.
2. Clique **💾 Exporter** → onglet 🚀 Full (ou 🎨 Avancé pour choisir le contenu).
3. Un fichier `.json` est téléchargé (`.zip` si la session contient des photos ou des PDF du Mode Histoire).
4. Envoie-le à ton interlocuteur (mail, cloud, USB).
5. Côté destinataire : ouvrir le même plan → groupe **⬇️ Charger** → **📥 Importer un fichier (session ou GPX)** → sélectionner le fichier (une session REMPLACE la session en cours, après aperçu ; un snapshot est pris avant).

<!-- @@PROFIL plans -->
### Créer un plan from scratch

1. Accueil → bouton **🏗️ Générer un plan**.
2. Choisis "📄 Nouveau plan".
3. Upload une image (PNG ou JPEG, idéalement ≤ 8000 px de côté).
4. Définis l'échelle (combien de mètres font N pixels — clique 2 points distants sur l'image).
5. Configure les calques, les icônes par défaut, etc.
6. **📦 Générer le ZIP** — l'archive est téléchargée.
7. Charge le ZIP depuis l'accueil pour utiliser le plan.

<!-- @@PROFIL diagnostic,plans -->
### Optimiser un plan qui plante sur mobile

1. Identifie ce qui pèse : taille image base, nombre de calques, nombre de routes, nombre de points.
2. Solutions par ordre d'impact :
   - **Convertis en V2 tuilé** : 🏗️ Générateur → uploader l'image (ou le ZIP V1 existant) → cocher 🧱 **Convertir en V2 tuile (performance)** → 📦 Générer. Solution la plus efficace pour les gros plans : runtime tuilé Google Maps-like, seules les tuiles proches de l'écran en mémoire au lieu de l'image entière. ⚠️ Génération **lourde** (CPU + RAM), faire la conversion sur PC plutôt que mobile (cf modal d'avertissement à la coche).
   - **Réduis l'image base** (≤ 8000 px, JPEG qualité 85 au lieu de PNG).
   - **Diminue le nombre de calques image** (fusionne légendes + collision dans l'image base si possible).
   - **Intègre les routes dans l'image** si tu as > 200 tracés (deviennent statiques, plus interactives mais ne consomment plus de mémoire vive).
   - **Active le 🚀 Mode Performance ULTRA** du plan (⚙️ Réglages → 🚀 Performance).
3. Regénère le ZIP via 🏗️ Modifier existant.

<!-- @@PROFIL usage,plans -->
### 🏗️ Activer le mode multi-niveau (carrière multi-étages)

> Pour les carrières / galeries avec plusieurs niveaux empilés physiquement (carrières à étages). Mode opt-in désactivé par défaut. Cf glossaire `Mode multi-niveau`.

1. **Active la feature** (2 voies) :
   - **Via le générateur de plan** (recommandé) : 📦 Créer/Modifier un plan → cocher 🏗️ Plan multi-niveau (avancé) dans la section "Informations du plan" → 📦 Générer → ZIP avec le flag pré-activé. À l'import, le mode s'active automatiquement.
   - **Manuellement** dans `plan-config.json` : ajouter `"multiLevel": true` dans la section `plan`
   - ⚠️ Il n'y a pas de case dans ⚙️ Réglages pour activer le mode sur un plan déjà chargé — pour activer le mode sur un plan existant, il faut soit le ré-importer dans le générateur en cochant la case, soit éditer son `plan-config.json` manuellement avant de le re-charger.
2. Une fois activé, une **pastille de niveau** (`Niv 0`) apparaît sous les boutons de zoom (haut-gauche). Le mode propose par défaut **5 niveaux symétriques** : `-2, -1, 0, 1, 2`. 0 reste le niveau de référence (= éléments sans `level`).
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

1. **Recommandé sur PC** (conversion lourde : ~256 Mo de mémoire pour une image 8K). Sur mobile, risque de crash pendant la génération (mémoire très limitée sur iOS).
2. Ouvrir le 🏗️ Générateur de plan.
3. **Mode Nouveau** : uploader ton image principale + remplir le formulaire → la case 🧱 Convertir en V2 tuile apparaît automatiquement.<br>
   **Mode Modifier existant** : uploader ton ZIP V1 → la case 🧱 est dispo.
4. Cocher **☑️ 🧱 Convertir en V2 tuile (performance)** → modal d'avertissement (CPU/RAM/durée + PC vs mobile) → **J'ai compris — Continuer**.
5. Compléter le reste du formulaire si nécessaire (nom, version, calques, tracking, etc.).
6. Cliquer **📦 Générer le ZIP** → overlay de progression "Niveau z=−N · X / Y tuiles (Z%)" (1-5 min selon image).
7. ZIP téléchargé avec suffixe `_v2`. Le réimporter depuis l'accueil → le mode V2 s'active automatiquement (badge violet `V2` sur la ligne du plan). Un plan V2 utilise toujours ses tuiles (pas de retour au mode V1 par un réglage).
8. **Si la génération échoue** :
   - **Erreur attrapée** → modale rouge "❌ Échec de génération" qui détaille la cause (drawImage, toBlob, saturation mémoire) + conseils. Lis le message et applique le conseil correspondant (PC, image plus petite, JPEG q85).
   - **Crash silencieux** (navigateur kill la page sans erreur) → au prochain reload de l'app, modale rouge "🧱❌ Génération V2 interrompue" t'avertit. Cause typique : manque de mémoire sur mobile.

<!-- @@PROFIL diagnostic -->
### 🌐 Changer d'adresse, de navigateur ou d'appareil (transférer ses données)

> Mots-clés : "changement de domaine", "nouvelle adresse", "myktamap.fr", "is-underground.fr", "ancienne adresse", "changer de téléphone", "changer de navigateur", "transférer mes données".

**Contexte** : l'adresse officielle de l'app est **myktamap.fr** (l'app a changé d'adresse en juillet 2026). Les données de l'app (liste de plans, sessions, préférences, photos) sont stockées **dans le navigateur, pour une adresse donnée** : elles ne suivent PAS automatiquement vers une autre adresse, un autre navigateur ou un autre appareil (isolation des sites par les navigateurs — règle web non contournable).

**Pour transférer ses données** :
1. **👤 Exporter le profil** (modale Profil → export) : préférences, favoris, sessions, snapshots, carnet, liaisons entre plans, dossiers ; photos et PDF du Mode Histoire en option ; et, en cochant des plans dans « 📦 Archives de plans », leurs ZIP (fichier `.zip` « profil complet »).
2. **Importer ce fichier** sur la nouvelle adresse / le nouvel appareil (même modale Profil).
3. À défaut : **📚 Exporter la liste de plans** (accueil → section « 📚 Mes plans » → bouton 💾 → fichier `.config`, réimport via 📂 au même endroit), exporter chaque session (⬆️ Enregistrer → 💾 Exporter) et garder les ZIP des plans pour les réimporter.
4. **📱 Si l'app était installée** depuis une ancienne adresse (PWA sur écran d'accueil) : supprimer l'ancienne icône et réinstaller depuis `myktamap.fr`.

---

<!-- @@PROFIL usage -->
### 🚫 Bloquer un itinéraire par zone "Inaccessible"

> Mots-clés : "bloquer itinéraire", "zone interdite", "éviter une zone", "rendre inaccessible", "interdire le passage", "zone bloquante".

**Cas d'usage** : tu veux qu'un calcul d'itinéraire ne passe pas par une certaine zone (effondrement récent, eau profonde, passage dangereux non balisé, etc.). C'est une contrainte **dure par défaut**, relâchable par la case « Respecter les zones inaccessibles » (modale Itinéraire, cochée d'origine) ; le Mode Secours et « Perdu » la gardent en toutes circonstances.

1. Dans la barre latérale, ouvre le groupe **⬛ Zones**.
2. Clique la sous-action **⛔ Zone inaccessible**.
3. Clique sur la carte pour poser les sommets du polygone (au moins 3).
4. Re-clique sur le 1er point ou appuie sur ✅ Fermer pour clôturer.

La zone apparaît avec un **motif hachuré rouge sombre** à 45°. Tout itinéraire calculé qui aurait traversé cette zone passera désormais par un autre chemin. Si aucun autre chemin n'existe, l'itinéraire échoue avec un message "Aucun chemin trouvé".

**Multi-niveau** : la zone bloque uniquement les segments de route du **même niveau** (cohérent avec le filtre niveau). Une zone inaccessible au niveau 0 n'affecte pas l'itinéraire au niveau -1.

**Indépendant de la visibilité** : même si tu masques les zones dans les filtres, la zone bloque toujours le pathfinder.

---

<!-- @@PROFIL usage -->
### 🚫 Préférences d'évitement (points / tags / types de zones)

> Mots-clés : "éviter un point", "éviter un tag", "préférences itinéraire", "contournement", "ne pas passer par", "marge d'évitement".

**Cas d'usage** : tu veux que l'itinéraire calculé évite si possible un point spécifique (ex: PA12 que tu sais bloqué temporairement) ou tous les points d'un type donné (ex: tous les `danger`). Contrainte **souple** : si pas d'alternative, l'app calcule quand même en passant par les points évités et te prévient.

1. Ouvre la modale **🗺️ Itinéraire** (groupe 🧭 Tracker → 🗺️ Calculer un itinéraire).
2. Déplie la section **🚫 Préférences d'évitement (optionnel)** en cliquant le titre.
3. **Points à éviter** (3 méthodes au choix) :
   - **Recherche autocomplete** : tape un nom dans le champ et clique le résultat
   - **Saisie par ID** : tape l'ID exact dans le champ texte et clique "+ Ajouter par ID"
   - **Clic carte** : bouton **📍 Cliquer sur la carte** → la modale se réduit en floater orange et chaque clic sur la carte ajoute un point d'évitement. Bouton ✓ Terminer pour revenir à la modale.
   - Les points ajoutés apparaissent en chips orange avec ✕ pour retirer
4. **Tags à éviter** :
   - Clique sur un chip de tag pour le toggler (gris → orange)
   - Tous les points du plan portant ce tag seront évités
5. **Types de zones à éviter** : checklist « ⬛ Zones à éviter », une case par type (Eau, Effondrement, types personnalisés… — pas Inaccessible, déjà bloquante).
6. **Marge (px)** : tout segment de route à moins de cette distance d'un point évité est exclu du graphe (défaut 100px).
7. Ajoute tes waypoints + clique **🎯 Calculer**.

**Résultat du calcul** :
- ✅ Cas idéal : l'itinéraire passe en évitant tout, tu vois juste la distance + temps habituels.
- ⚠️ Cas fallback : un message orange "⚠️ Impossible d'éviter : X, Y" apparaît si l'app a dû passer à proximité de certains points évités (= aucun chemin alternatif possible). L'itinéraire est quand même tracé.
- ❌ Cas erreur : "Aucun chemin trouvé" si même le fallback échoue (réseau de routes disconnect ou zone inaccessible bloque tout).

**Persistance** : tes préférences d'évitement sont sauvegardées par plan. Au prochain calcul sur le même plan, elles sont restaurées. Bouton **🗑️ Reset** pour tout effacer.

**Différence dur/souple** :
| Type | Hard/soft | Fallback |
|---|---|---|
| ⛔ Zone inaccessible | Dur | ❌ Jamais relâché automatiquement (seulement en décochant « Respecter les zones inaccessibles ») |
| 🚫 Point / tag évité | Souple | ✅ Fallback + message si pas d'alternative |

---

<!-- @@PROFIL usage,plans -->
### 🌍 Exporter en KMZ géolocalisé (Google Earth, OsmAnd, Locus, Avenza)

> Mots-clés : "export KMZ", "Google Earth", "OsmAnd", "Locus", "Avenza", "KML", "géolocalisé", "géoréférencé", "calibrage GPS", "lat lng", "coordonnées GPS", "exporter pour application terrain".

**Cas d'usage** : tu veux ouvrir ton plan + tes annotations (points, tracés, zones) dans une appli de cartographie terrain qui supporte le KML (Google Earth, OsmAnd, Locus, Avenza, ArcGIS Earth…). L'app calcule la transformation rotation+échelle+translation à partir de **2 points** dont tu connais à la fois les coords plan (x, y en pixels) ET les coords GPS réelles (lat, lng en degrés).

1. Ouvre **⬆️ Enregistrer → 💾 Exporter** → onglet **📡 Export externe** → KMZ.
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

**Persistance** : ton calibrage 2 points est sauvegardé par plan (c'est le même géoréférencement que ⚙️ Réglages → Géoréférencement, avec un point C optionnel). Au prochain export du même plan, les 8 champs sont pré-remplis — tu ajustes si besoin et tu re-télécharges.

**Conseils calibrage** :
- Choisis 2 points dont tu es **sûr** des coords GPS (entrée de carrière reconnaissable, plaque IGC visible depuis Google Maps Street View…)
- Plus AB est long sur le plan, meilleure est la précision de la transformation
- 2 points suffisent pour un plan globalement plat et rigide ; sur un plan déformé (assemblage), un **3e point C** (⚙️ Réglages → Géoréférencement) corrige la déformation d'ensemble

**Compatibilité** :
- ✅ **Google Earth** (web et desktop) : recommandé, support natif gx:LatLonQuad
- ✅ **OsmAnd** (Android, iOS) : supporte KMZ + KML
- ✅ **Locus Map** (Android) : idem
- ✅ **Avenza Maps** (Android, iOS) : idem
- ✅ **ArcGIS Earth, QGIS** : support KML

**Inclusion data layers** : le KMZ inclut **session + embedded**. Si ton plan a des roads/zones/points dans `chemin.json`, `puits.json` etc., ils sortent aussi (contrairement aux exports Full/Avancé/Conversion, qui ne contiennent que la session).

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
   - **⏱️ Temps écoulé** depuis cette position (slider de 1 à 90 min — 1 h 30 max, au-delà la zone devient non pertinente ; défaut 30 min).
   - **🏃 Vitesse de marche présumée** — segmented control 4 presets, **mêmes valeurs que le mode itinéraire** (cohérence UX entre les deux modules). Rayon final = `vitesse × temps`, pas de marge de sécurité. Choix mémorisé.
     - 🤕 **Blessé** : 2 km/h — progression entravée, très lent, marche hésitante
     - 🐌 **Lente** : 3 km/h — prudente, étroitures, exploration
     - 🚶 **Normale** *(défaut)* : 5 km/h — allure standard de marche
     - 🏃 **Rapide** : 7 km/h — parcours connu, marche soutenue
   - **🔮 Indices visuels** (optionnel mais TRÈS utile) : texte libre, exemples *"bidon eau, épure bélier, puits cassé"*. L'app cherche ces mots dans le nom, la description et les tags de tous les points du plan.
3. Clique **🎯 Calculer la zone**.
4. Résultats affichés sur la carte :
   - **Cercle orange pulsant** : zone de recherche théorique (rayon = vitesse × temps).
   - **Galeries surlignées en rouge clair** : les tronçons du réseau de tracés réellement atteignables depuis la dernière position dans le temps écoulé (multi-niveau géré) — la portée max figure dans le rapport.
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
- Le cercle est purement géométrique ; les galeries surlignées suivent le réseau de tracés **tel qu'il est dessiné** — une galerie absente du plan n'est pas comptée.
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
   - Ouvre le groupe **⬆️ Enregistrer** → bouton **💾 Exporter**.
   - Dans la modale, choisis l'onglet **🔄 Conversion** (après 🚀 Full et 🎨 Avancé ; les deux derniers onglets sont 🔗 Fusion et 📡 Export externe).
   - Coche ce que tu veux figer : Points / Tracés / Zones (avec filtrage par tag pour les points).
   - Choisis la **granularité** : Basique (1 fichier par catégorie) ou Fine (1 fichier par type).
   - Télécharge le ou les fichiers `.json` générés (ex : `points.json`, `roads.json`, `zones_eau.json`, etc.).

2. **Intégrer** ces JSON dans le ZIP du plan :
   - Accueil → **🏗️ Générer un plan** → **📂 Modifier existant**.
   - Importe le ZIP actuel du plan.
   - Ajoute les fichiers `.json` issus de la conversion comme **calques de données** (data layers).
   - Clique **📦 Générer le ZIP** — le nouveau ZIP contient maintenant tes annotations comme données figées.

**⚠️ Effet de bord** : une fois converties, ces données font partie du plan (calque de données en lecture seule). Pour les corriger plus tard : 🔍 Filtres → section Calques → **🔄 Modifier** (copie le calque dans la session, puis 💾 Exporter le calque corrigé), ou refaire un cycle Conversion → Modifier existant.

**Différence avec 📥 Importer un fichier** : cette fonction (groupe ⬇️ Charger) charge un `.json` de session **temporairement** dans la session active — les données restent modifiables et liées à la session, pas au plan. Pour du définitif, il faut la Conversion.

---

<!-- @@PROFIL usage -->
## 🌀 Recette : lier deux plans entre eux (liaisons inter-plan)

**Objectif** : créer un « portail » entre un point d'un plan X et un point d'un plan Y (deux réseaux qui se touchent, ou plan général ↔ plan de détail), puis naviguer de l'un à l'autre en un clic.

1. **Préparer** : les deux plans doivent être dans la bibliothèque (ajoutés depuis l'accueil). Les deux points (départ et arrivée) doivent exister — n'importe quel point convient : point de session (✏️) **ou** point d'un calque de données.
2. **Créer la liaison** : ouvre le plan X → clique le point de départ → dans sa fiche, bouton **🌀 Lier à un autre plan** → choisis le plan Y dans la liste → recherche le point d'arrivée (par nom, id ou tag — les points du plan Y sont lus **sans l'ouvrir**) → clique-le. C'est fait.
3. **Résultat** : la liaison est **bidirectionnelle** (visible dans la fiche des DEUX points, sur les deux plans). Un point peut porter plusieurs liaisons. **Marquage visuel au choix** : par défaut rien ne distingue un point lié ; donne-lui le **tag « Portail »** pour son **icône vortex dédiée** (anneau doré, spirale bleue).
4. **Utiliser** : fiche du point → ligne 🌀 « plan · point » → bouton **➜** → confirmation → l'app change de plan (la session actuelle est sauvegardée automatiquement), **bascule sur le niveau du point d'arrivée** et centre la vue dessus (flash bleu).
5. **Itinéraire inter-plan** : depuis la modale **Itinéraire** (« 🌐 Destination sur un autre plan ») ou la **recherche multi-plans** (bouton 🧭 sur un résultat distant), demande un trajet vers un point d'un autre plan. L'app compare les portails disponibles au coût réel, affiche les étapes (portail + distances de chaque côté + total en mètres), trace le chemin jusqu'au portail, puis **trace la suite** quand tu prends le portail. Les évitements de chaque plan sont respectés. En cas d'impossibilité, le message explique précisément la cause (aucun portail — en crée un d'abord ; plan hors-ligne ; destination isolée du réseau ; « pas de liaison directe mais un chemin existe via tel plan »).
6. **Le trajet suit le rythme réel** : le résumé se termine par « 🗺️ C'est parti » — l'utilisateur MARCHE son trajet (validation d'étapes « 📍 Je suis ici », replanification au recalage), et la traversée se propose au portail : bouton flottant « 🌀 Portail suivant (dist) » (fermable, re-proposé par « 📍 Je suis ici » sur le point-portail) ou bouton ➜ du popup. Les points de passage posés dans la modale Itinéraire sont visités AVANT le portail, dans l'ordre. **Multi-hop** : case « 🌀 Itinéraire via plusieurs plans » dans la recherche multi-plans (mémorisée, décochée par défaut) → trajets à travers des plans intermédiaires (A → B → C, 3 traversées max, toutes combinaisons de portails comparées au coût réel) ; chaque arrivée trace le tronçon du plan et propose le portail suivant ; un plan intermédiaire injoignable est écarté et nommé si plus aucun chemin ne passe.
7. **Recalage à l'arrivée** : traverser physiquement un portail (bouton ➜ d'une liaison, « Prendre le portail » d'un itinéraire inter-plan) **recale la position tracker sur le point d'arrivée** du plan cible. La recherche multi-plans et le gestionnaire ne recalent pas (consulter un point ≠ s'y déplacer). Si un itinéraire est actif sur le plan d'arrivée, il se replanifie depuis le portail.
8. **Supprimer** : bouton 🗑️ sur la ligne de liaison (des deux côtés), ou supprime le point — ses liaisons partent avec.

**Bon à savoir** :
- Plan de destination absent de l'appareil → la liaison s'affiche avec ⛔ ; ajoute le plan pour pouvoir « y aller ».
- Les liaisons **voyagent avec l'export de session et l'export de profil** (restaurées à l'import, fusion sans doublon).
- Un plan distribué peut embarquer des liaisons **prêtes à l'emploi** dans ses calques de données : utilisables, non modifiables.
- Si un **filtre de tags** masque le point d'arrivée, un avertissement s'affiche (l'app ne modifie jamais tes filtres).
- Les liaisons sont stockées localement — comme tout le reste, **rien ne quitte l'appareil**.
- **↩️ Retour** : après un saut, un bouton flottant « Retour : <plan> » (15 s, bas de l'écran) ramène au plan et à la **vue exacte** d'origine (niveau + zoom). Les sauts s'empilent (3 portails = 3 retours). **Réductible/fermable** : [–] le réduit en mini-pastille ↩️ discrète (clic = ré-agrandir), [✕] le ferme et vide la pile de retours (fermer = renoncer à la chaîne) ; le choix [–] est mémorisé pour les prochains sauts.
- **🕸️ Vue « réseau de plans »** : dans « 🌀 Mes liaisons », bascule 📋 Liste ⇄ 🕸️ Graphe — la bibliothèque dessinée en réseau (plans = bulles avec badges V2/M-LVL + compteur de liaisons, anneau doré sur le plan courant, ⛔ grisé si absent de l'appareil, plans sans liaison en bande dédiée ; frontières = traits dont l'épaisseur suit le nombre de liaisons). Clic bulle = ouvrir le plan (arrivée sur son premier portail), clic trait = liste filtrée aux liaisons de cette frontière, bulles déplaçables. 100 % local.
- **🌐 Recherche multi-plans** : cherche un point dans **tous les plans de la bibliothèque** — depuis l'accueil (**barre de recherche 🔎 au centre de l'en-tête** : les résultats apparaissent **en direct sous la barre** dès 2 caractères — plans et points, clic = chargement du plan et centrage ; Entrée ou 🔎 = recherche complète en modale) ou via la recherche Ctrl+K (bouton « Chercher dans tous les plans », saisie conservée). Chaque résultat porte le badge de son plan ; un clic charge le plan, bascule sur le bon niveau et centre la vue.

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

1. **Convertis ton plan en V2 tuilé** (solution la plus efficace) : 🏗️ Générateur → cocher 🧱 Convertir en V2 tuilé → 📦 Générer → réimporter le ZIP V2. La mémoire utilisée passe de « image entière » à « seules les tuiles proches de l'écran ». Conversion **lourde**, à faire sur PC plutôt que mobile (cf recette « 🧱 Convertir un plan V1 en V2 tuilé »).
2. **Plan non tuilé V2** : vérifie que le tuilage du plan est sur **🔄 Auto** (ℹ️ Infos du plan → « 🖼️ Tuilage de ce plan ») et non sur Désactivé.
3. **Active le 🚀 Mode Performance ULTRA** (par plan) : ouvre ⚙️ Réglages → groupe « 🚀 Performance » → coche **🚀 Mode ULTRA (active tout)**. Il active des optimisations agressives qui ne touchent pas l'image mais réduisent drastiquement la charge des tracés/markers/intersections :
   - 🪜 Décimer les tracés au dézoom
   - ⚡ Désactiver animations zoom/pan (reload requis)
   - 🎯 Désactiver cercles intersections (calcul sauté au-delà de 50 tracés au lieu de 500)
   - 🚫 Désactiver popups sur calques de données
   - 🐢 Auto-save lent (30s)
   - 👁️ Ne rendre que ce qui est proche de l'écran (inclus dans ULTRA, sans case séparée)
   Les cases s'activent aussi une par une si tu veux affiner. La case 🛡️ « Limiter le dézoom sur mobile » (cochée par défaut) protège aussi contre les crashs au dézoom : ne pas la décocher sur un gros plan.
4. Si l'app a déjà crashé, une modale d'avertissement (« ⚠️ ARRÊT BRUTAL DÉTECTÉ ») s'affiche au prochain démarrage.
5. Pour un diagnostic avancé : ⚙️ Configuration de l'accueil → 🛠️ Mode Développeur (protégé par mot de passe) → active les **logs détaillés**, recharge, puis **📋 Afficher les logs** pour voir où ça plante. Sans mode développeur, la modale 🤖 Aide IA peut joindre un bloc « État de l'installation » avec les dernières erreurs.
6. À terme : optimise le plan (voir la recette « Optimiser un plan qui plante sur mobile »).

<!-- @@PROFIL usage,diagnostic -->
### C'est quoi les badges V1 / M-LVL / V2 sur les lignes de la liste de plans ?

Indicateurs visuels du **mode** de chaque plan dans la liste de l'accueil :

- **V1** (gris discret) : plan classique, image entière chargée en mémoire au chargement. Mode par défaut.
- **M-LVL** (jaune) : plan **multi-niveau**, contient des éléments tagués par niveau + le mode est activé (`plan.multiLevel: true`). Carrière multi-étages. Cf glossaire et recette « 🏗️ Activer le mode multi-niveau ».
- **V2** (violet) : plan **tuilé V2**, image découpée en tuiles 512×512 sur 4 niveaux de zoom. Conso mémoire massivement réduite au runtime. Cf glossaire et recette « 🧱 Convertir un plan V1 en V2 tuilé ».

Plusieurs badges peuvent coexister sur un même plan (un V2 peut aussi être multi-niveau). Couleur cohérente avec le reste de l'interface : jaune = niveau, violet = V2.

<!-- @@PROFIL usage,diagnostic -->
### Le tracker ne pointe pas dans la bonne direction sur ma carrière (boussole déraille)

C'est probablement une perturbation magnétique. Les armatures métalliques (rails, ferraille, plaques d'égout) faussent fortement le magnétomètre du téléphone.

1. **Active la boussole de validation** : groupe 🧭 Tracker → sous-action 🧭 Afficher la boussole. Elle affiche une rose des vents en haut-gauche qui tourne pour pointer vers le vrai Nord. Marche dehors / en surface, déraille parfois en sous-sol.
2. **Recale manuellement** le tracker dès que tu reconnais un repère sur le plan : 📍 Mode recalage → clic sur le point reconnu.
3. **Utilise une vraie boussole physique** en parallèle — c'est la recommandation officielle (le tracker est un outil de debug, pas de localisation fiable, cf popup d'avertissement au démarrage).

<!-- @@PROFIL diagnostic -->
### J'ai perdu ma session quand j'ai fermé l'app

L'auto-sauvegarde (toutes les 1,5 s ; 30 s avec l'option « Auto-save lent ») couvre normalement ce cas. Si tu ne la retrouves pas :

- Vérifie que tu rouvres bien le **même plan** (même nom + version exacte).
- La session n'est PAS partagée entre plans différents — **chaque plan a son propre emplacement** : changer de plan n'écrase pas la session du précédent, tu la retrouves en revenant dessus.
- Regarde **📊 Détails de la session → 📦 Backups** : des snapshots automatiques permettent de restaurer un état antérieur (y compris les lignes « 📂 autre version de ce plan »).
- Pour plus de sécurité long-terme : exporte ta session régulièrement via ⬆️ Enregistrer → 💾 Exporter (fichier `.json`, ou `.zip` s'il y a des photos).
- Même si la session est perdue, la **sortie** correspondante reste dans **📔 Mon carnet** avec sa date, sa durée, sa distance et ses compteurs — le carnet n'est pas effacé avec la session. En revanche il n'archive PAS les points/tracés eux-mêmes : il ne remplace pas un export.

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

Si tu veux re-consulter l'alerte plus tard, clique le bouton **🚨** dans l'en-tête de l'accueil (à côté du 📖). Il te montrera l'état actuel — soit l'alerte rouge si toujours active, soit une modale verte **"✅ Aucune alerte en cours"** si la situation est revenue à la normale.

<!-- @@PROFIL diagnostic -->
### C'est quoi le petit badge `v2.13.2` (ou similaire) en bas de l'accueil ?

C'est le **badge version** de l'application. Il indique la version actuellement installée chez toi.

**État normal** : gris discret avec bordure subtile. Au clic, affiche une modale compacte avec :
- La version installée (en monospace vert)
- La date de publication
- Les **notes de cette version** (changelog de ce que tu utilises actuellement)

**État "mise à jour disponible"** : le badge devient **bleu et clignote**, et affiche la transition (ex: `v2.13.1 → v2.13.2`). Au clic, ouvre la modale **🔔 Mise à jour disponible** (Mise à jour douce / Plus tard).

**État "⏳"** (ambre, sans clignoter, ex: `v2.13.1 ⏳`) : la mise à jour est **déjà acceptée** mais l'ancien code est encore chargé (fréquent sur iPhone avec l'app installée). Ce n'est pas une nouvelle demande : fermer complètement l'app puis la rouvrir, ou cliquer le badge → « Relancer la mise à jour douce ».

**Si un user dit « la mise à jour m'est demandée à chaque ouverture » ou « mes points ont disparu »** : vérifier d'abord la **💾 Mémoire des sessions** (📊 Détails de la session) — les sessions vivent en IndexedDB (place accordée à l'app par le navigateur, une part de l'espace libre de l'appareil, partagée avec plans, photos et backups ; une ancienne copie localStorage éventuelle est gardée 30 jours après la migration automatique). Seul un navigateur qui refuse IndexedDB (certaines navigations privées) les garde dans le localStorage limité à ~5 Mo — la jauge dit lequel. Pleine, plus rien ne se sauvegarde : exporter la session (💾 Enregistrer session), effacer la session ou les photos d'un vieux plan, retirer un plan inutile. Points disparus : regarder **📦 Backups** (y compris les lignes « 📂 autre version de ce plan »). Ne **jamais** conseiller le reset complet, qui efface aussi photos et backups.

> 💡 Tu peux cliquer le badge à tout moment pour relancer la modale d'update — pratique si tu avais cliqué "Plus tard" et que tu changes d'avis.

<!-- @@PROFIL diagnostic -->
### Je veux vérifier s'il y a encore une alerte active

Clique le bouton **🚨** dans l'en-tête de l'accueil (à côté du 📖 Documentation). Trois réponses possibles :
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

L'app calcule un cercle de recherche (rayon = vitesse de marche × temps), surligne les galeries atteignables dans ce temps en suivant le réseau de tracés, et cherche tes indices dans les points du plan. Les indices qui matchent ET tombent dans le cercle sont mis en évidence en violet pulsant, et leur barycentre te donne une "localisation probable affinée".

**Tu peux copier un rapport texte** structuré (📋) pour le partager avec quelqu'un en surface (SMS, radio).

**⚠️ Important** :
- C'est une estimation, pas une localisation GPS. Précision ≈ rayon du cercle.
- Ça ne remplace **pas** une opération de secours réelle. Fil d'Ariane, boussole, carte papier et lampe de rechange restent obligatoires.
- Aucune communication automatique avec les secours — c'est à toi d'envoyer le rapport.

Voir la recette **« ⛑️ Mode urgence — Je suis perdu »** dans la section "🍳 Recettes" pour la procédure détaillée.

<!-- @@PROFIL plans -->
### Je n'arrive pas à importer ma session définitivement dans le ZIP / Comment rendre mes annotations permanentes ?

**Il n'y a pas de bouton direct** pour importer une session dans le ZIP — c'est volontaire. Le workflow correct est en **2 étapes** :

1. **🔄 Convertir** ta session en data layers :
   - Groupe **⬆️ Enregistrer** → **💾 Exporter** → onglet **🔄 Conversion**.
   - Coche Points / Tracés / Zones à figer → télécharge les fichiers `.json` générés.

2. **🏗️ Modifier existant** pour intégrer ces JSON dans le ZIP :
   - Accueil → **🏗️ Générer un plan** → **📂 Modifier existant**.
   - Importe ton ZIP actuel → ajoute les `.json` de l'étape 1 comme data layers → **📦 Générer le ZIP**.

**Ne confonds pas** :
- **📥 Importer un fichier** (groupe ⬇️ Charger) → charge **temporairement** dans la session (modifiable, lié à la session).
- **🔄 Conversion + 🏗️ Modifier existant** → fige **définitivement** dans le ZIP (corrigeable ensuite via 🔍 Filtres → Calques → 🔄 Modifier).

Voir aussi la recette **« Intégrer définitivement ta session dans le ZIP du plan »** dans la section "🍳 Recettes" pour la procédure détaillée.

<!-- @@PROFIL usage -->
### Comment partager un plan avec un ami ?

1. Accueil → **🏗️ Générer un plan** → "Modifier existant" → sélectionne ton plan (ou, si le plan est mémorisé, ℹ️ Infos du plan → **💾 Télécharger le ZIP**).
2. Si rien à modifier, clique directement **📦 Générer le ZIP**.
3. Envoie le `.zip`.
4. L'ami le charge via la zone « 📦 Charger un nouveau plan » de l'accueil.

<!-- @@PROFIL plans -->
### Comment ajouter un nouveau type d'icône (ex: "fontaine") ?

Via 🏗️ Générer un plan → "Modifier existant" → section 🎨 Icônes & Tags → ajoute un tag custom (nom + image PNG 50×50 transparent) → regénère.

<!-- @@PROFIL diagnostic -->
### L'app me dit "⚠️ ARRÊT BRUTAL DÉTECTÉ" au démarrage

L'app a détecté que la session précédente a été tuée par le système (manque de mémoire).

- C'est normal sur mobile avec un gros plan.
- Pour éviter la prochaine fois : convertis le plan en V2 tuilé, active le 🚀 Mode Performance ULTRA du plan, réduis l'image de base, ferme les autres apps.

<!-- @@PROFIL diagnostic,plans -->
### L'app me dit "🧱❌ Génération V2 interrompue" au démarrage

Variante spécifique du détecteur d'arrêt brutal, focalisée sur la **génération V2**. Tu avais lancé une conversion V2 (case 🧱 du générateur) et le navigateur a tué la page pendant la conversion — typique sur mobile avec une image source > 8K×8K.

**Solutions** (par ordre d'efficacité) :
1. **Refaire la conversion sur PC** plutôt que mobile (bien plus de mémoire disponible pour le navigateur).
2. **Réduire l'image source** (la passer en JPEG qualité 85, dimensions ≤ 8000 px de côté).
3. **Fermer toutes les autres apps** en arrière-plan avant de relancer la conversion sur mobile.

<!-- @@PROFIL diagnostic,plans -->
### J'ai eu une modale rouge "❌ Échec de génération" pendant la conversion V2

La génération V2 attrape les erreurs internes (drawImage, toBlob, saturation mémoire) au lieu de planter silencieusement.

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

Oui : le code source de l'application est **public sur GitHub** (`Karmakta91/MyKTAMap`), sous licence **CC BY-NC-SA 4.0** — on peut le lire, l'étudier et l'héberger soi-même, mais tout usage commercial demande l'accord de l'auteur. Les relevés de terrain (les plans) n'y sont pas. La documentation complète est sur **doc.myktamap.fr**. Pour toute question technique précise, l'auteur reste joignable via Instagram **@karma_kta** — ou par email **contact@myktamap.fr** (notamment pour tout usage professionnel / commercial).

<!-- @@PROFIL usage -->
### Exporter en PDF imprimable

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

**Rendu** : le plan est dessiné comme pour l'export PNG avancé puis placé dans le PDF ; la légende est rendue en image et collée au coin choisi.

**Filename** : `<plan>_<date>.pdf`

**Crédit footer** (1 ligne discrète en bas à droite) : `Généré par MyKTAMap · CC BY-NC-SA 4.0 · myktamap.fr`

**Limitations connues** :
- La police du PDF ne couvre que l'alphabet latin — **aucun emoji dans le texte natif du PDF**. Les emojis de la légende passent, car la légende est collée en image.
- A0/A1 + qualité ×2 : 30-60 sec de génération sur mobile (gros canvas).
- Pas de footer dédié (la légende est en overlay sur le plan) — on gagne ~25-40% de zone plan vs un footer fixe.

<!-- @@PROFIL usage -->
### Undo / Redo global Ctrl+Z / Ctrl+Y

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
- ❌ **Photos POI** : leur suppression reste **irréversible** (les photos sont effacées du stockage local).
- ❌ **Import de session** : un import qui remplace ta session n'est pas annulable par Ctrl+Z — mais un **snapshot** est pris juste avant : 📊 Détails de la session → 📦 Backups → Restaurer. (L'import d'un **GPX**, qui ajoute à la session, s'annule par Ctrl+Z.)
- ❌ **Tracker** : capteurs temps réel, pas une mutation persistante
- ❌ **Mesure** : outil éphémère, pas dans le périmètre "session"

**Caractéristiques** :
- **Limite** : 50 actions max (FIFO — au-delà, les plus anciennes sont oubliées)
- **Granularité** : action atomique (1 clic = 1 annulable, pas un groupe)
- **Persistance** : en mémoire seulement (perdu au rechargement de la page).
- **Reset auto au plan switch** : changer de plan vide l'historique (pas d'undo cross-plan)
- **Message de confirmation** : `↩ Annulé : Pose du point PA1` ou `↪ Refait : Suppression de Zone Eau #2` (selon le réglage 🔔 Notifications)
- **Sauvegarde immédiate** de la session après chaque annulation/rétablissement
- Sur une installation reliée, des modifications d'autres comptes vident l'historique (message « Historique d'annulation vidé »)

**Anti-vol focus clavier** : Ctrl+Z est intercepté UNIQUEMENT si l'utilisateur n'est pas en train de taper dans un INPUT/TEXTAREA/contenteditable. Ça permet de garder l'undo natif du navigateur fonctionnel dans les champs texte.

**Conseil à donner à l'utilisateur** :
- "Je viens de supprimer un point par erreur" → Ctrl+Z immédiatement
- "Je veux récupérer la session précédente" → ⚠️ Ctrl+Z ne suffit PAS si tu as rechargé la page entre-temps. Utiliser 📊 Détails de la session → 📦 Backups (snapshots automatiques).
- "Je veux annuler une suppression de photo" → ⚠️ **impossible**, c'est irréversible. Re-importer le ZIP du plan si tu as une sauvegarde.

<!-- @@PROFIL usage -->
### 🔆 Affichage XL (« mode panique ») — différent de ⛑️ "Je suis perdu"

> Mots-clés : "mode panique", "je panique", "affichage XL", "position en grand", "mode urgence rapide", "boussole géante", "panic mode", "mode 911", "info vitale en gros", "écran lisible loin", "minimap urgence", "differencier mode urgence", "🔆 vs ⛑️", "XL display", "Vista XL".

**⚠️ Distinction importante** : deux outils distincts dans MyKTAMap, ne pas les confondre (et ni l'un ni l'autre n'est la 🚨 Sortie d'urgence) :

| | ⛑️ Je suis perdu | 🔆 Affichage XL |
|---|---|---|
| Hypothèse | Tu **NE SAIS PAS** où tu es | Tu **SAIS** où tu es (le tracker l'affiche) |
| Objectif | Estimer une zone probable | Lire vite des infos vitales en gros |
| Calcul | Cercle = vitesse × temps + galeries atteignables + indices visuels | Aucun calcul — affichage XL en temps réel |
| Sortie utile | Zone orange + galeries atteignables + indices violets + rapport texte copiable | Minimap interactive + cap boussole géant + coords GPS à la demande (📋) |
| Quand l'utiliser | "Je n'ai plus aucun repère depuis 30 min" | "Je panique à un croisement, j'ai besoin de me re-orienter vite" |

**Accès 🔆 Affichage XL** : sidebar → **🧭 Tracker** → tuile rouge **🔆 Affichage XL (position + cap)** (à côté du ⛑️ orange). EN « XL display », ES « Vista XL ».

**Ce que le mode affiche** :
- 🗺️ **Minimap interactive** centrée sur le tracker (~20-50 m d'horizon). Affiche **roads + zones + structures + itinéraire + points** (du plan et de l'utilisateur, niveau affiché) pour repérer chemins/sorties/dangers à proximité. Déplacer / zoomer au doigt met le suivi en pause (carte Nord en haut) ; **🎯 Recentrer** le reprend.
- 📍 **Appui sur un point** → bulle (nom, type, note) avec **📍 Je suis ici** : recale le tracker sur le point, comme la bulle de la carte principale — c'est le moyen de corriger une dérive sans quitter l'écran.
- 🧭 **Boussole géante** posée sur la position : cap basé sur la boussole du téléphone, mis à jour en direct.
- 🪧 **Prochaine consigne du guidage** si un itinéraire est actif.
- 📋 **Coordonnées GPS (plan géoréférencé seulement)** : icône 📋 en haut à droite → bulle avec les coordonnées en énormes caractères (lisibles à 1 m, pour les dicter), la mention « jamais confirmée » si c'est le cas, et un bouton Copier (`lat, lng`). Plan non géoréférencé : pas d'icône, aucune coordonnée.
- 🌗 **Thème** : suit celui de l'app (sombre / clair).
- 🔋 **Wake Lock** activé : l'écran ne s'éteint pas tant que le mode est actif.

**Permissions** : sur iOS, l'accès aux capteurs d'orientation est demandé à l'ouverture du mode s'il n'est pas déjà accordé. Sans permission, la boussole reste figée mais la mini-carte continue de marcher.

**Wake Lock** : l'écran reste allumé du début à la fin du mode (fermeture : ↩️ QUITTER L'AFFICHAGE XL ou Échap) ; non disponible sur certains navigateurs.

**Quand recommander chacun** :
- L'utilisateur dit "je suis perdu", "je ne sais plus où je suis", "je veux estimer ma zone" → ⛑️ Je suis perdu
- L'utilisateur dit "je panique", "j'ai besoin d'infos vite en gros", "je dois lire ma position pour la transmettre", "je veux me re-orienter au plus vite" → 🔆 Affichage XL
- L'utilisateur peut aussi enchaîner les deux : utiliser le ⛑️ pour estimer une zone, puis le 🔆 pour avancer dans la zone en gardant un œil sur le cap

**Limitations** :
- Le 🔆 suppose que le tracker donne une position fiable. Sans position, la minimap reste sur le plan entier et la bulle 📋 affiche « aucune position ».
- Comme toute l'app : aucune transmission automatique vers les secours. Pour communiquer, tu ouvres la bulle 📋 (plan géoréférencé), tu dictes ou copies tes coordonnées et tu les envoies par SMS/radio toi-même.
- La boussole utilise le magnétomètre, **faussée à proximité de structures métalliques** (béton armé, voies ferrées). Vérifier la cohérence en pivotant le téléphone sur place avant de se fier au cap.

<!-- @@PROFIL usage -->
### 🚑 Mode Secours — Coordination d'équipes de recherche

> Mots-clés : "plan de secours", "équipe de recherche", "coordonner les secours", "GRIMP pompiers spéléo", "carte d'opération", "opérateur surface", "secouriste libre", "équipier terrain", "stepper d'étape", "rapport au fil de l'eau", "victime trouvée", "Demi-tour forcé", "Pending RAS Suspect Bloqué Indice Aide", "Live Mode", "mode exécution temps réel", "couleurs OTAN Alpha Bravo Charlie Delta Echo Foxtrot Golf Hotel India Juliet", ".mkmsec.json", ".mkmsec.report.json", "Lancer le plan de secours", "Prendre la main", "👤 Retour Opérateur".

**Distinction des 3 modes "urgence" MyKTAMap** :

| | ⛑️ Je suis perdu | 🔆 Affichage XL | 🚑 Mode Secours |
|---|---|---|---|
| Hypothèse | Je NE SAIS PAS où je suis | Je SAIS où je suis (tracker actif) | UN AUTRE est perdu, on l'organise |
| Cible | Moi-même | Moi-même | Équipe(s) de recherche |
| Sortie utile | Cercle zone probable + indices | Coords XL + boussole géante | Plan multi-équipes coordonné + rapport |
| Quand | "J'ai perdu mes repères" | "Je panique à un croisement" | "Marc est porté disparu, on organise les secours" |

**Accès** : sidebar → menu 🧭 Tracker (section Urgence) → bouton rouge **🚑 Mode Secours**.

#### Les 2 états d'un scénario

1. 📝 **CRÉATION** (vue Édition) — préparation sur table : équipes + parcours + zones + itinéraires.
2. 🚀 **EXÉCUTION** (vue Live temps réel) — incident déclenché : on suit les observations terrain.

Bascule via le **bouton « 🚀 Lancer le plan de secours »** dans la vue Édition.

#### Workflow type complet

```
1. PRÉ-INCIDENT (préparation sur table)
   ├─ Création d'un scénario nommé (ex. "Exercice — secteur nord")
   ├─ Équipes Alpha/Bravo/Charlie (couleurs OTAN auto), chef + effectif
   ├─ Parcours : entrée + étapes + sortie + zone + itinéraire calculé
   └─ Export PDF (briefing) + partage du scénario .mkmsec.json aux équipes

2. INCIDENT RÉEL → Lancement
   ├─ Clic 🚑 Mode Secours → scénario existant ou nouveau ("Recherche Marc")
   ├─ (Optionnel) depuis « Je suis perdu » → dernière position + zone pré-remplies
   ├─ Clic « 🚀 Lancer le plan » → choix du rôle
   │   ◉ 👤 Opérateur surface (PC chef)
   │   ○ 🚨 Équipe Alpha (équipier assigné)
   │   ○ 🚑 Secouriste libre (renfort sans équipe)
   └─ Bascule en vue Live selon le rôle

3. EXÉCUTION TEMPS RÉEL (vue Live)
   ├─ Équipier terrain : suit son parcours étape par étape, commente chaque étape,
   │  prend des photos 📸 (max 5/étape), choisit 1 des 7 statuts rapides,
   │  navigue entre les étapes (« Passée, non renseignée » si aucun statut),
   │  « 🧭 Suivre mon parcours » pour être guidé (suivi 🧭 actif requis)
   ├─ Opérateur surface : cartes multi-équipes (statut le plus grave + dernière
   │  observation), retards, rappel, bilan engagés / sous terre / manquants,
   │  main courante ; peut « Prendre la main » sur une équipe pour saisir à sa
   │  place (relais radio), puis « 👤 Retour Opérateur »
   └─ Secouriste libre : notes chronologiques horodatées

4. RAPPORT (à tout moment)
   ├─ Bouton « 📤 Rapport » dans chaque vue Live (contenu adapté au rôle)
   ├─ 3 formats :
   │   📄 PDF imprimable → impression / archivage / passation papier
   │   📦 .mkmsec.report.json → à importer chez l'opérateur (consolidation)
   │   📋 Texte presse-papier → SMS / messagerie
   └─ Le rapport reflète l'état COURANT, réutilisable autant de fois

5. ARRÊT DU PLAN
   ├─ Clic « ⏹️ Terminer le plan »
   ├─ Bandeau « 📦 PLAN TERMINÉ » dans la vue Édition
   ├─ Observations conservées comme historique
   └─ « 📤 Voir le rapport historique » + « 🚀 Relancer » (confirmation : efface
      les photos de l'intervention précédente)
```

#### 7 statuts d'étape (+ « en attente »)

| Emoji | Statut | Couleur | Gravité | Signal |
|---|---|---|---|---|
| • | En attente | gris | 0 | Statut par défaut |
| 🟢 | RAS | vert | 0 | Rien à signaler |
| 🟡 | Suspect | jaune | 1 | Traces / bruits / odeurs |
| ⬛ | Bloqué | gris foncé | 1 | Passage impraticable |
| 🔵 | Indice | bleu | 1 | Objet / vestige trouvé |
| 🟠 | Aide demandée | orange | 2 | Renfort matériel / humain |
| 🟣 | Demi-tour forcé | violet | 1 | Parcours abandonné |
| 🚨 | **Victime trouvée** | rouge | 3 | **URGENCE ABSOLUE** — alerte rouge côté opérateur, « 🚑 Évacuer » |

La gravité sert au tri et à l'escalade dans la vue Opérateur (la carte d'une équipe prend la couleur de son statut le plus grave).

#### Stockage

Tout est **local à l'appareil** : scénarios rangés par plan (10 max), photos d'étape dans un stockage dédié (séparé des photos de points). Rien n'est envoyé sur Internet (sauf, sur une installation reliée à une base de données, le Mode Secours relié — cf survol).

#### Quand recommander chacun des 3 rôles

- L'utilisateur dit "je suis le chef de l'opération", "je coordonne depuis la surface", "je vois toutes les équipes" → **👤 Opérateur surface**
- L'utilisateur dit "je fais partie de l'équipe X", "je descends avec Alpha", "je suis mon parcours" → **🚨 Équipier**
- L'utilisateur dit "j'arrive en renfort", "je n'ai pas d'équipe assignée", "je fais de la reconnaissance" → **🚑 Secouriste libre**

#### Limitations (pour anticiper les questions)

- **Pas de réseau sous terre** : chaque téléphone tient son suivi en local ; l'opérateur importe ensuite les rapports `.mkmsec.report.json` des équipes et les fusionne (cf « Import d'un rapport d'équipe » ci-dessous). Le rappel et les alertes de l'opérateur ne partent pas automatiquement vers les équipes : l'ordre passe par radio.
- **Pas de partage par QR code** : le partage entre appareils passe par les fichiers `.mkmsec.json` (scénario) et `.mkmsec.report.json` (rapport), transmis par mail, clé USB, AirDrop, messagerie…
- **Pas de transmission automatique vers les secours externes** : c'est un outil de coordination INTERNE. Pour appeler les pompiers / secours spécialisés, on utilise son téléphone normalement.
- **Photos compressées localement** : max 1920 px côté long, JPEG q85 → ~200-400 Ko par photo. Pas d'option « qualité originale ».
- **Changer de plan** ne perd pas une exécution en cours : elle reste dans le scénario de son plan.

#### Format `.mkmsec.json` vs `.mkmsec.report.json`

| | `.mkmsec.json` | `.mkmsec.report.json` |
|---|---|---|
| Contenu | Définition du scénario (équipes, parcours, zones) | État d'exécution (observations, statuts, photos, départ / rentrée, notes) |
| Cas d'usage | Partage de la PRÉPARATION (avant incident) | Partage des OBSERVATIONS (pendant / après mission) |
| Photos | Non | Oui (si la case est cochée à l'export) |
| Import | Restaure le scénario (aperçu ; si le plan est déjà sur le téléphone, « Remplacer » garde les identifiants de l'opérateur — indispensable pour que ses rapports soient acceptés ensuite) ; déposable aussi sur « 📦 Ajouter un plan » à l'accueil | Fusion dans le tableau de l'opérateur (vue Live → « 📥 Importer rapport équipier ») |

<!-- @@PROFIL usage -->
### Recherche unifiée — 4 catégories + Ctrl+K

> Mots-clés : "rechercher un tracé", "rechercher une zone", "rechercher une structure", "rechercher un pilier", "recherche rapide", "command palette", "Ctrl+K", "Cmd+K", "raccourci recherche", "raccourci clavier recherche", "barre de recherche", "filtre par catégorie".

La recherche couvre **4 catégories** :
- 📍 **Points** : calques de données + session
- 🛣️ **Tracés** : session + calques de données (libellé auto "Tracé Principal #3" si pas de nom)
- ⬛ **Zones** : session + calques de données (libellé auto "Zone Eau #1")
- 🏛️ **Structures** : session + calques de données (libellé auto "Pilier 1ère masse #2")

**Accès** :
- Bouton **🔍** dans la barre latérale droite, ou touche **R**
- **Raccourci clavier Ctrl+K** (`Cmd+K` sur Mac) — depuis n'importe où dans l'app. Re-presser ferme la modale.
- Ctrl+K ne se déclenche pas si l'user est en train de taper dans un champ texte (sauf si la modale recherche est déjà ouverte → fermeture).

**Modale** :
- Champ de recherche en haut, focus auto à l'ouverture
- Sous le champ : filtres en chips (selon le contenu disponible) :
  - **Catégorie** : `📍 Points (N) · 🛣️ Tracés (M) · ⬛ Zones (K) · 🏛️ Structures (L)` avec compteur live. Affiché uniquement si ≥ 2 catégories ont du contenu.
  - **Calques** (points seulement) : chip par calque de données
  - **Tags** (points seulement) : chip par tag
- Résultats **groupés par catégorie** (`📍 POINTS (12)`, `🛣️ TRACÉS (3)`…) ; recherche insensible aux accents
- Bouton « Chercher dans tous les plans » (recherche multi-plans, saisie conservée)

**Au clic d'un résultat** :
- **Point** → centre + popup + cercle jaune 3 s
- **Tracé / front de taille** → centre + ligne jaune pointillée 4 s + popup info
- **Zone / pilier / mur** → centre + polygone jaune transparent 4 s + popup info
- Popup info : nom + type (`Principal`, `Pilier 1ère masse`…) + niveau si multi-niveau + nombre de sommets + calque d'origine

**Champs cherchés** :
- Points : nom + id + tags + description + état
- Tracés / zones / structures : nom + type + libellé du type + niveau

**Limitation** : les filtres « Calques » et « Tags » ne s'appliquent qu'aux points.

---

<!-- @@PROFIL usage -->
### Recherche par coordonnées GPS

> Mots-clés : "rechercher par GPS", "coller des coordonnées", "format Google Maps", "lat lng", "48.6 2.1", "créer un point GPS", "où est cette coordonnée", "navigation Maps vers plan".

**Format accepté** : décimal `48.856600, 2.352200` (= format de Google Maps quand on fait clic droit → copier les coordonnées). Plages valides : latitude `[-90, 90]`, longitude `[-180, 180]`. Les formats DMS (`48°40'51"N`), UTM et MGRS ne sont **pas** reconnus (le texte est alors cherché comme un nom).

**Conditions d'utilisation** :
- Le **plan doit être géoréférencé** (calibrage GPS dans ⚙️ Réglages → Géoréférencement, à l'export KMZ ou à la création du plan)
- Taper ou coller les coordonnées dans la recherche (Ctrl+K)

**Cas gérés** (cartes de résultat distinctes) :
1. **Plan non géoréférencé** → carte « ⚠️ Plan non géoréférencé » avec lien pour calibrer
2. **Format invalide** (latitude hors plage, etc.) → recherche texte standard
3. **Calibrage invalide** → carte d'erreur
4. **Coordonnées hors plan** (en dehors de l'emprise calibrée) → carte « 🚫 Hors plan »
5. **Point du plan à moins de 50 px** → carte « 🎯 Aller au point » avec nom + distance
6. **Aucun point proche** → carte « ➕ Créer un point ici » → formulaire de saisie pré-rempli

<!-- @@PROFIL usage -->
### Saisie des coordonnées GPS (champ unique)

> Mots-clés : "champ GPS combiné", "coller coords GPS dans Settings", "format lat,lng partout", "input unique géoréférencement".

Partout où l'app demande une coordonnée GPS (géoréférencement du plan, export KMZ, Générateur), c'est **un seul champ** `GPS (lat, lng)` qui accepte directement le format collé depuis Google Maps (`48.856600, 2.352200`). Validation en direct : bordure rouge + message si le format est invalide.

<!-- @@PROFIL diagnostic -->
### App bloquée après une mise à jour (kill switch, page de secours)

> Mots-clés : "PWA bloquée", "iOS coincée", "killsw", "reset SW", "purge cache app", "mise à jour douce lente".

**Premier réflexe** : désactiver un éventuel **VPN** et **changer de réseau** (4G ↔ Wi-Fi), puis fermer complètement l'app et la rouvrir — un réseau qui sert des fichiers corrompus peut bloquer la mise à jour.

**Outils de récupération, du plus doux au plus radical** (⚙️ Configuration de l'accueil → 🆘 Dépannage) :
1. **🔄 Forcer la mise à jour** : re-télécharge le code de l'app, **garde les données** (plans, sessions, préférences, photos).
2. **🆘 Ouvrir l'outil Kill SW** : ouvre la page de secours `killsw.html` (vérifie d'abord la connexion).
3. **💥 Tout réinitialiser** : dernier recours, efface TOUT (plans mémorisés, sessions, photos, backups, préférences). Ne jamais le conseiller avant d'avoir exporté ce qui peut l'être.

**Si l'app ne s'ouvre plus du tout** :
- **`/killsw.html`** (ex. `https://myktamap.fr/killsw.html`) : page autonome, toujours servie fraîche depuis le réseau ; elle désinscrit le service worker et vide les caches de l'app, puis propose de recharger. **Préserve les données** (plans mémorisés, sessions, photos, préférences).
- **`?killsw=1`** ajouté à l'adresse de l'app (ex. `https://myktamap.fr/?killsw=1`) : même effet, au démarrage de l'app.

**Mise à jour douce** : elle ne purge que les anciens caches et réutilise ceux déjà préparés : quelques secondes en général. Si le badge de version reste en « ⏳ », fermer complètement l'app puis la rouvrir.

<!-- @@PROFIL usage -->
### Import d'un rapport d'équipe `.mkmsec.report.json` — consolidation chez l'opérateur

> Mots-clés : "fusionner observations équipiers", "import rapport équipier", "consolidation cross-device", "partager observations entre devices", "récupérer données équipe sur PC chef", "remplacement QR rollbacked", ".mkmsec.report.json", "tableau supervision opérateur".

Sans réseau sous terre, chaque téléphone tient son propre suivi. L'opérateur surface **importe le `.mkmsec.report.json`** d'un équipier (ou d'un secouriste libre) et **fusionne** ses observations, statuts, photos, départ / rentrée et notes dans le tableau de supervision.

**Workflow type** :
1. L'opérateur prépare le scénario et distribue le `.mkmsec.json` aux équipiers. ⚠️ Sur un téléphone qui a déjà le plan, l'aperçu d'import propose **« Remplacer »** : c'est ce choix qui garde les identifiants de l'opérateur (il efface toutefois les statuts, observations et photos déjà saisis sur ce téléphone). Un scénario importé « comme copie » produit des rapports **refusés** (« scénario différent » / « équipe absente »).
2. Chaque équipier renseigne ses étapes sur le terrain.
3. Au retour en surface : l'équipier exporte son rapport `.mkmsec.report.json` (AirDrop, mail, clé USB, messagerie — peu importe le canal).
4. L'opérateur ouvre la vue Live → **« 📥 Importer rapport équipier »** → choisit le fichier → aperçu → fusion.

**Règles de fusion** :
- Observations : ajoutées à la suite, datées, sans perte (`--- 📥 Import Équipier <date> ---`)
- Statut : le plus grave l'emporte ; à gravité égale, le plus récent. Une victime n'est jamais rétrogradée.
- Étapes reconnues par l'**identité du point** de passage (puis position, puis libellé)
- Photos : ajoutées sans doublon (réimporter le même rapport ne duplique rien)
- Les étapes modifiées par un import portent une marque visible ; un journal des imports est tenu
- Un **snapshot** de la session est pris AVANT la fusion (annulation via 📊 Détails de la session → 📦 Backups)
- Rapport d'une **phase déjà close** → rangé dans l'historique de cette phase (avis orange, alerte rouge si aide/victime), jamais dans la phase en cours
- « Aide » / « victime » signalée sur une étape retirée côté opérateur → le point est remis dans le parcours et une alerte rouge s'affiche
- Rapport de **secouriste libre** → ses notes vont dans la main courante (avec confirmation)

**Refus à l'import** : rapport d'opérateur, scénario différent, équipe absente chez l'opérateur, aucune exécution en cours. Plan d'une autre version → avertissement (pas un refus).

**Limites** :
- Un fichier à la fois (pas d'import groupé)
- Pas d'annulation directe de la fusion : passer par la restauration du snapshot

---

<!-- @@PROFIL tous -->
### 🗓️ Version actuelle : {{BUILD}} (contexte généré le {{DATE}})

Ce document décrit l'état de l'app pour la version ci-dessus. L'app détecte les nouvelles versions et propose de les installer (fenêtre « Mise à jour disponible », badge de version en bas de l'accueil) ; les nouveautés sont résumées dans cette fenêtre et dans les notes affichées au clic sur le badge. Si l'utilisateur décrit un comportement différent de ce document, lui demander d'abord sa version (badge) et de mettre l'app à jour.

---

**Fin du document.** Les questions au-delà de ce périmètre ne sont pas couvertes — l'assistant IA doit explicitement le signaler plutôt que d'inventer.
