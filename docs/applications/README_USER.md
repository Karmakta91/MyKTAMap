# 📗 MyKTAMap — Guide Utilisateur

---

## 📖 Le topo

### D'où ça vient

MyKTAMap est née d'un besoin simple : avoir, **dans la poche**, une carte cataphile **fiable, hors-ligne, et qui ne fuite pas**. Pas un app store qui demande l'accès à tes contacts pour afficher un plan. Pas un site qui te traque dès que tu cliques. Pas un cloud qui décide demain de t'envoyer une newsletter ou de revendre tes traces.

Juste un fichier `.zip` qui contient le plan, ouvert dans un onglet de navigateur, qui marche **sans réseau**, et qui te laisse **entièrement le contrôle** sur ce que tu fais avec.

### À qui ça s'adresse

À celles et ceux qui descendent. Cataphiles parisiens, spéléos amateurs, urbexeurs prudents, secouristes formés au milieu souterrain, chercheurs en patrimoine — bref, à toute personne qui a un usage **légitime et respectueux** de ces lieux et qui veut un outil qui ne mette personne en danger (ni les gens ni les lieux).

L'app n'a **aucune ambition de remplacer** les vieux plans papier annotés, les sorties guidées par les anciens, la transmission orale, la mémoire collective. Elle vient **en complément**, comme un calque numérique qu'on superpose à ces savoirs — pas un substitut.

### La philosophie

- 🌐 **100 % hors-ligne par défaut** — l'app fonctionne sans réseau une fois le plan chargé. Tu peux la lancer en avion, dans le métro, ou à 30 m sous terre.
- 🔒 **Zéro télémétrie** — aucun service tiers n'est appelé pour te suivre. Les seuls accès extérieurs sont la vérification des mises à jour et, si un de tes plans est calibré GPS, le fond de carte OpenStreetMap de la Vue OSM (active par défaut, désactivable dans ⚙️ Configuration) : aucune donnée de tes plans n'y part. L'auditeur peut vérifier dans `🔒 Audit réseau`.
- 📦 **Propriété des données** — tes annotations, tes photos, tes mesures sont stockées **localement**, dans le navigateur. Personne d'autre que toi n'y a accès. Tu peux tout exporter à tout moment (`💾 Enregistrer session`) et tout effacer en 2 clics (`💥 Tout réinitialiser`).
- 🤝 **Code ouvert** — la licence est `CC BY-NC-SA 4.0`. Tu peux lire le code, l'auditer. Pas de boîte noire, pas de marketing.
- ⚖️ **Discrétion = respect** — un plan partagé n'importe comment, c'est un lieu fragilisé. L'app ne contient aucun plan par défaut ; c'est à chaque utilisateur de charger les siens, et de **ne pas les diffuser** au-delà du cercle de confiance.

### Ce que l'app n'est pas

- ❌ **Pas un GPS sous terre** — la géolocalisation native ne marche pas sous roche. Le « tracker » de l'app est un **podomètre + direction** qui dérive vite ; il faut recaler régulièrement.
- ❌ **Pas une garantie de sécurité** — la carte donne le chemin, pas l'oxygène. Tu restes seul·e juge des risques (effondrements, eau, gaz, fatigue).
- ❌ **Pas un annuaire** — l'app ne référence pas les lieux. Elle affiche ce que tu lui donnes, point.
- ❌ **Pas un réseau social** — pas de compte, pas de profil, pas de partage en un clic. Tu choisis à qui tu envoies ton `.zip`, et comment.

---

## 🙏 Remerciements

MyKTAMap n'existerait pas sans le travail, le savoir et la patience de beaucoup de monde. Ce projet est porté par **une seule personne** côté développement (KARMA), mais il s'appuie sur des **communautés**, des **outils libres**, et des **gens** qui ont pris le temps de transmettre.

### À la communauté cataphile

Aux anciens qui ont relevé les galeries au crayon, plan en main, génération après génération. Aux passionnés qui ont compilé, numérisé, recoupé, vérifié. À celles et ceux qui transmettent — en sortie, en cours d'initiation, en chuchotant à un débutant « non, par là, pas par là ». MyKTAMap n'est qu'un **outil de plus** dans cette longue chaîne. Sans vos plans, sans vos histoires, sans votre vigilance, cette app n'aurait rien à afficher.

### Aux beta-testeurs et testeuses terrain

À celles et ceux qui ont accepté de descendre avec une version `1.x.y-beta` instable, de remonter avec des screenshots de bugs, de signaler les frictions UX, de proposer des features impossibles à imaginer depuis un bureau. Aux quelques camarades qui ont testé chaque release sous terre, dans le noir, dans le froid, et qui ont pris la peine de raconter ce qui clochait. Vos retours ont façonné chaque hotfix — sans vous, l'app serait restée un prototype confortable depuis un canapé.

### Aux outils libres

MyKTAMap repose entièrement sur des **briques open-source**. Sans ces projets, l'app n'existerait simplement pas :

- 🍃 **[Leaflet](https://leafletjs.com/)** *(BSD 2-Clause)* — moteur cartographique interactif. Cœur de l'affichage des plans. Merci à **Vladimir Agafonkin** et aux nombreux contributeurs du projet.
- 🔄 **[Leaflet.ImageOverlay.Rotated](https://github.com/IvanSanchez/Leaflet.ImageOverlay.Rotated)** *(BSD 2-Clause, vendored)* — plugin qui projette une image comme parallélogramme via 3 coins (transform CSS matrix). Utilisé pour le calage **2 ancres** des calques image et pour la projection des plans MyKTAMap **sur la Vue OSM**. Merci à **Iván Sánchez Ortega** pour ce plugin élégant.
- 📦 **[JSZip](https://stuk.github.io/jszip/)** *(MIT/GPL au choix)* — lecture et écriture des archives `.zip` côté navigateur (plans, sessions, exports, extraction partielle pour la mini-carte de la HOME). Merci à **Stuart Knightley** et aux contributeurs.
- 📤 **[jsPDF](https://github.com/parallax/jsPDF)** *(MIT)* — génération de PDF imprimables (A0 → A4, portrait/paysage, page miniature Mode Secours, embed Mode Histoire).
- 📸 **[html2canvas](https://html2canvas.hertzen.com/)** *(MIT, vendored)* — capture du rendu DOM en image (canvas → PNG). Utilisée pour intégrer la **carte OSM Leaflet** dans les PDF **« Briefing pompiers »** du Mode Secours : pile graphique webgl + tiles + overlays + plan projeté, le tout figé en une image embarquée dans le PDF remis aux secours externes. Merci à **Niklas von Hertzen** et aux contributeurs.
- 🌍 **[OpenStreetMap](https://www.openstreetmap.org/) & ses contributeurs** — sous licence **[ODbL](https://opendatacommons.org/licenses/odbl/)** pour les données et **[CC BY-SA 2.0](https://creativecommons.org/licenses/by-sa/2.0/)** pour la cartographie. Données cartographiques mondiales affichées dans la **Vue OSM** (modale plan + widget HOME) **dès qu'un de tes plans est calibré GPS** (active par défaut, désactivable dans ⚙️ Configuration). L'app affiche l'attribution `© OpenStreetMap contributors` dans le coin de chaque carte OSM, **comme la licence ODbL l'exige**. Hébergement des tuiles : **[OSM Foundation](https://wiki.osmfoundation.org/wiki/Privacy_Policy)** (fondation non-commerciale, politique de logs publique, pas de tracking publicitaire). Sans ce bien commun monumental — bâti depuis 2004 par des **milliers de bénévoles** qui cartographient le monde rue par rue — la Vue OSM n'existerait pas.
- 🧭 **Algorithme de Dijkstra** (1959) — calcul du plus court chemin pour les itinéraires assistés. Edsger W. Dijkstra (1930-2002) : merci pour cette idée vieille de plus de 60 ans qui sous-tend encore Google Maps, OpenStreetMap routing, et chaque GPS du monde.
- 🌐 **[GPX 1.1 standard](https://www.topografix.com/gpx.asp)** — format d'échange avec TopoDroid, OsmAnd, Strava, Garmin et l'écosystème outdoor.
- 🛡️ **[Web standards](https://developer.mozilla.org/)** — Service Worker, IndexedDB, WebAuthn, FileSystemAccess API, Geolocation API. Maintenus par des milliers de personnes qu'on ne croisera jamais et à qui on doit énormément.

> 📜 **Conformité licences** : les fichiers vendored (`lib/leaflet/`, `lib/leaflet-imageoverlay-rotated.js`, `lib/jszip.min.js`, `lib/jspdf.umd.min.js`, `lib/html2canvas.min.js`) conservent leur header de licence d'origine. Pour le détail réseau (quand chaque ressource est contactée), voir l'**[Audit réseau](./NETWORK_AUDIT.md)** (accessible aussi depuis la modale Audit dans l'app).

### À l'écosystème PWA

Aux navigateurs (Chromium, Firefox, Safari, leur fork mobile) qui implémentent les standards modernes du web et permettent à une simple page de fonctionner comme une app native sans dépendance à un store.

### À l'assistant de développement

Une bonne partie du code de cette version a été co-écrite avec **Claude (Anthropic)**, assistant IA qui a accompagné le développement sur des dizaines de sessions. C'est un outil au même titre que Leaflet ou JSZip — utile, documenté honnêtement, et qui ne remplace ni la vision ni les décisions finales (toujours côté humain).

### À toi qui lis ce guide

Pour avoir pris 10 minutes à lire au lieu de cliquer aveuglément. C'est exactement l'état d'esprit que ces lieux demandent — **prendre le temps, comprendre avant d'agir, respecter ce qu'on ne maîtrise pas encore**.

> Si tu veux contribuer — un retour bug, une suggestion, un coup de main sur la doc — passe par l'issue tracker du repo ou les canaux habituels de la communauté.

---

**Crédits librairies & algorithmes** — 🍃 Leaflet (cartographie interactive) · 🔄 Leaflet.ImageOverlay.Rotated (calage 2 ancres + projection Vue OSM) · 📦 JSZip (lecture/écriture des archives ZIP) · 📤 jsPDF (export PDF imprimable) · 📸 html2canvas (capture DOM pour PDF Briefing pompiers) · 🌍 OpenStreetMap & contributeurs (données ODbL, Vue OSM opt-in) · 🧭 Dijkstra (calcul du plus court chemin pour les itinéraires) · 🌐 GPX 1.1 (échange outdoor).

---

## 🔴 Avertissements importants

### 🔐 Confidentialité des données — à lire en premier

MyKTAMap est un outil de cartographie de terrain qui peut contenir des informations sensibles : **localisation précise d'entrées, de puits, de passages, de structures souterraines.**

Ces données, si elles étaient rendues publiques, pourraient :

- Faciliter l'accès de personnes non averties à des lieux dangereux
- Provoquer une sur-fréquentation qui dégrade ces espaces fragiles
- Exposer les utilisateurs à des poursuites légales
- Mettre en danger des personnes non équipées

**Règles à respecter absolument :**

- Ne partage jamais tes plans ni tes fichiers de données en dehors de ton groupe de confiance
- Ne publie jamais de capture d'écran montrant des coordonnées ou des emplacements précis
- Ne laisse jamais l'app ouverte et visible sur un appareil accessible à des tiers

> Ces lieux appartiennent à leur histoire. Leur préservation dépend de la discrétion de ceux qui les fréquentent.

### ⚠️ Avertissement sur le tracker de position

Le tracker estime ta position **sans GPS**, à partir des capteurs de mouvement du téléphone (accéléromètre et gyroscope). Il est **expérimental** :

- l'erreur grandit à mesure que tu marches ;
- la précision varie beaucoup selon le téléphone et la façon de le tenir ;
- les changements de niveau (escaliers, échelles, puits) ne sont pas pris en compte.

**C'est une aide visuelle, pas un système de navigation fiable.** Recale-le (**📍 Mode recalage**, menu 🧭 Tracker) dès que tu reconnais un repère sur le plan. Ce qu'il faut emporter quoi qu'il arrive : « 🆘 En cas d'urgence sous terre ».

### 🚨 Alertes publiques (diffusion en temps réel)

L'auteur peut diffuser à toute la communauté des **alertes de sécurité** : incendie, fermeture d'accès, gaz toxiques… Jamais de message commercial.

- **Au lancement**, une alerte en cours s'affiche avec ses consignes : **rouge pulsant** = situation critique, à lire impérativement ; **orange** = information importante ; **bleu** = simple annonce. S'il y en a plusieurs, une liste les classe de la plus grave à la moins grave.
- **J'ai compris** la range : elle ne revient que si l'auteur la modifie ou en publie une nouvelle.
- **Le bouton 🚨 de l'écran d'accueil** (à gauche de 📖) prend la couleur de l'alerte non lue la plus grave (gris s'il n'y en a pas), avec leur nombre s'il y en a plusieurs. Un appui réaffiche toutes les alertes en cours, même lues — ou **Aucune alerte en cours**, ou **Vérification impossible** hors ligne : de quoi savoir si une vieille alerte tient toujours.

### 🔒 Confidentialité & Audit réseau

**Tes annotations, sessions, plans et données personnelles restent sur ton appareil : rien n'est envoyé à un serveur ni à un service tiers.**

L'app ne contacte que son propre site (chargement, mises à jour, alertes, test de connexion) et OpenStreetMap, qui fournit le fond de la **Vue OSM** — active par défaut, à couper dans ⚙️ Configuration. OpenStreetMap voit donc les zones que tu consultes, mais aucune donnée de tes plans.

Pour le vérifier toi-même : ⚙️ Configuration (écran d'accueil) › **🔒 Confidentialité & Audit** :

- **📋 Voir le journal réseau** — toutes les requêtes de l'app en direct, et si elles envoient des données ; à copier, exporter ou vider. Si une requête envoie des données, ou si une adresse extérieure autre qu'OpenStreetMap apparaît (en rouge), **préviens l'auteur** : Instagram **@karma_kta** ou **contact@myktamap.fr**.
- **📖 Que fait l'app sur le réseau ?** — la liste des adresses que l'app peut contacter et comment vérifier avec ton navigateur (F12, onglet Réseau).
- **🔌 La pastille « Serveur : désactivé »**, en bas de l'accueil à côté du numéro de version, dit si l'installation que tu utilises parle à un serveur. Sur myktamap.fr, c'est « désactivé », et ça le restera : ce site n'a pas de serveur applicatif. Une installation indépendante (club, équipe) peut en déclarer un : la pastille change alors de couleur et de texte. Touche-la pour lire son état et ouvrir la liste ci-dessus.

---

## 🚀 Premiers pas

### 📱 Installer l'application sur Mobile (iPhone/Android)

MyKTAMap s'installe comme une application, sans passer par l'App Store ni le Play Store :

1. Ouvre `myktamap.fr` dans Safari (iPhone) ou Chrome (Android).
2. Bouton de partage ↑ (Safari) ou menu ⋮ (Chrome) → **Sur l'écran d'accueil**, puis confirme.
3. Lance toujours l'app depuis l'icône créée : elle s'ouvre en plein écran, sans la barre du navigateur.

> ⚠️ **Sur iPhone, installe l'app avant de mémoriser tes plans** : dans Safari sans installation, l'espace est réduit (~50 Mo) et peut être effacé après une longue inactivité ; installée, elle dispose d'environ 1 Go durable. Android et PC offrent plusieurs Go. Si l'espace manque, un avertissement s'affiche : le plan reste utilisable, mais il faudra re-sélectionner son fichier à chaque ouverture.

### 📥 Installer l'application sur PC

Dans Chrome, ouvre `myktamap.fr`, clique sur **Installer** à droite de la barre d'adresse et confirme. Lance ensuite l'app depuis l'icône créée sur ton bureau.

### 📦 Charger un plan

L'écran d'accueil propose :

- **▶️ Reprendre [nom]** — rouvre le dernier plan utilisé.
- **📚 Mes plans** — tous les plans déjà ouverts (🌐 serveur ou 💾 local), du plus récent au plus ancien ; les plans disponibles sur le serveur y apparaissent d'eux-mêmes. Un appui rouvre le plan.
- **📦 Ajouter un plan** — glisse ton fichier ZIP sur la zone (ou appuie dessus pour le choisir), puis **▶️ Charger ce plan**. Le plan rejoint ta liste.
- **🏗️ Générer un plan** — crée un plan à partir de zéro.

> 🔄 **Réimporter un plan regénéré** — si ton ZIP porte le **même nom** qu'un plan de ta liste (quels que soient l'auteur et la version), l'app te demande quoi faire au lieu d'écraser ou d'empiler un doublon :
> - **🔄 Mettre à jour** — remplace l'entrée existante. Ta session, tes notes et tes liaisons entre plans sont conservées ; les photos ne sont remplacées que si le nouveau ZIP en contient.
> - **➕ Garder les deux** — les deux versions cohabitent dans la liste.
> - **Annuler** (ou ✕, Échap, appui à côté) — rien n'est touché. C'est le choix par défaut.

### 📡 Utilisation hors connexion

Une fois ouvert avec du réseau, MyKTAMap fonctionne **entièrement hors connexion** : l'app garde sur ton appareil tout ce dont elle a besoin.

**Pour préparer une sortie :**

1. Ouvre l'app **avant de partir**, avec une connexion.
2. Charge ton plan. Il est mémorisé dans l'app au premier chargement (réglage **💾 Mémoriser le plan dans l'app au premier chargement** de ⚙️ Configuration, actif par défaut) : tu le rouvriras depuis **📚 Mes plans** sans re-sélectionner le fichier.
3. Parcours le plan quelques secondes, puis tu peux couper le réseau : l'app reste fonctionnelle.

La **pastille** à côté du numéro de version, en bas de l'accueil, te dit si l'app est prête : **verte**, tout est enregistré pour le hors-ligne ; **rouge**, des fichiers manquent — touche-la avec du réseau pour tout enregistrer (un **📥** rouge le rappelle aussi en haut de l'accueil). **Orange** : enregistrement en cours, ou pas de réseau pour le terminer ; **grise** : l'état ne peut pas être vérifié (navigation privée, mode incognito, tout premier chargement).

Quand une nouvelle version existe et que tu as du réseau, l'app te propose de la mettre à jour.

---

## 🆘 En cas d'urgence sous terre

🧭 **Par où commencer, selon ta situation :**

| Ta situation | L'outil | Où le trouver |
|---|---|---|
| Je veux **sortir au plus vite** | 🚨 Sortie d'urgence | bouton 🚨 de la barre du haut |
| Je sais où je suis, mais je panique : il me faut **ma position et mon cap en très gros** | 🚨 Mode urgence — Affichage XL | menu 🧭 Tracker, bouton rouge |
| **Je ne sais plus où je suis** | ⛑️ Je suis perdu | menu 🧭 Tracker, bouton orange |
| **Quelqu'un d'autre est perdu**, je coordonne des équipes | 🚑 Mode Secours | 🔭 Pour aller plus loin › 🚑 Mode Secours |

### 🎒 Les réflexes, avant tout outil

- **Préviens toujours quelqu'un en surface avant de descendre**, avec ton heure de retour estimée. C'est la règle d'or.
- Emporte une **carte papier** (ou le plan imprimé), une **boussole physique** — celle du téléphone est faussée par le sol et les armatures métalliques —, un fil d'Ariane si besoin, et une **lampe frontale avec piles de rechange**, plus une lampe de secours.
- Sous terre, ne compte jamais sur ton seul téléphone : il peut tomber en panne, sa batterie s'épuiser, son tracker dériver.
- Si tu captes du réseau (souvent près des puits et des regards), préviens quelqu'un en surface **avant** que ta batterie ne meure.

### 🚨 Sortie d'urgence — trouver la sortie la plus proche

Pour ressortir **tout de suite**, sans réfléchir : blessure, batterie faible, panne de lumière. Tape **🚨** dans la barre du haut (à droite, à côté de 📖 Mode Histoire), ou dis « **sortie** », « **où est la sortie** » ou « **comment sortir** » à la commande vocale 🎤.

**Ce que l'app cherche** : les points marqués comme sortie ouverte — **Cavage ouvert** (`cao`), **Puits à échelon ouvert** (`peo`), **Escalier service ouvert** (`eso`) — ainsi que ceux marqués `entrée` et le tag intégré « 🚪 Point d'entrée du plan ». Les versions **fermées** (`caf`, `pef`, `esf`) sont ignorées : un point marqué fermé ne te sera jamais proposé. Si le plan n'a aucune sortie reconnue, un message te rappelle ces tags.

**Ce qui s'affiche** : l'app calcule le **vrai chemin** par les galeries, y compris d'un niveau à l'autre par les jonctions du plan. La fenêtre **🚨 Sortie d'urgence** montre la plus proche, sa distance et son niveau (N0, N1…), un bouton **🧭 Tracer l'itinéraire** et un dépliant **▾ Voir les N autres sorties**, classées par distance.

- Une fois l'itinéraire tracé, le **bandeau de guidage** te dit quoi faire à chaque croisement ; en sortie d'urgence il ne se ferme pas, même si le guidage est coupé. Si tu t'écartes, son bouton devient **Sortie la plus proche d'ici** (voir « 🪧 Guidage » dans l'itinéraire).
- Une sortie marquée **Distance à vol d'oiseau — chemin non vérifié** (carte en pointillés) n'a pas de chemin calculé : elle est rangée sous **Non confirmées**, et si aucune sortie n'a de chemin vérifié, un bandeau rouge le dit d'abord. Méfie-toi : elle peut être inaccessible (murs, étage isolé).

**D'où part le calcul** : de ta position actuelle, dès que le suivi est actif ou que tu t'es situé une fois depuis l'ouverture du plan (« 📍 Je suis ici », recalage, portail, session restaurée) ; la fenêtre précise laquelle. Si tu ne t'es **jamais** situé, l'app demande **Où es-tu ?** : tape ta position sur la carte. Ce tap recale aussi le suivi, pour que l'itinéraire et l'Affichage XL partent du même endroit.

Une vibration confirme la sortie trouvée ou t'alerte s'il n'y en a aucune, même si **📳 Vibration haptique** est désactivée. Tout se calcule sur ton appareil, sans réseau.

### 🚨 Mode urgence — Affichage XL

Tu sais où tu es, mais tu paniques et il te faut l'essentiel **en très gros** : te ré-orienter, repérer un puits tout proche, vérifier ton cap, dicter ta position à quelqu'un. Dans le menu **🧭 Tracker**, le bouton rouge **🚨 Mode urgence — Affichage XL (position + cap)** ouvre un écran plein écran qui tient sans défiler :

- 🗺️ **Une mini-carte** qui occupe presque tout l'écran, très zoomée et centrée sur toi, aux **couleurs de ta légende**, avec ton itinéraire, **les points du plan et les tiens** (du niveau affiché), et la même orientation que la carte en mode « plan orienté ».
- 🖐️ **Tu peux la déplacer et zoomer au doigt** pour regarder plus loin. Dès que tu la bouges, elle cesse de te suivre et se remet **Nord en haut** ; le bouton **🎯 Recentrer** la ramène sur toi, reprend le suivi et l'orientation.
- 📍 **Tu reconnais un point ?** Touche-le : une bulle affiche son nom, son type et sa note. **📍 Je suis ici** recale ton suivi dessus, exactement comme la bulle d'un point sur la carte — le moyen de corriger une dérive sans quitter l'écran. La carte se recentre alors sur toi.
- 🧭 **Une boussole géante** posée sur ta position, qui indique ton cap en temps réel. La première fois, le navigateur demande l'accès aux capteurs d'orientation : accepte, sinon elle reste figée.
- 🪧 **La prochaine consigne du guidage en gros** (« Dans 40 m, tourner à gauche »), si un itinéraire est tracé et le suivi actif. En cas d'écart, **Voir les choix sur la carte** te ramène au bandeau.
- 🔋 **Une ligne d'état** en haut à droite : ta batterie (si **🔋 Niveau de batterie** est activé dans ⚙️ Configuration), l'état du tracker et de la boussole. Le nom du plan est sous le titre.
- 📋 **Tes coordonnées GPS, si ton plan est géoréférencé** : l'icône 📋 au bout de la ligne d'état ouvre une bulle qui les affiche **en très gros**, lisibles à un mètre — celles qu'on dicte aux secours —, avec une ligne qui précise s'il s'agit de ta position suivie, de ta dernière position connue, ou de la **position de départ du plan, jamais confirmée**. Son bouton **📋 Copier ma position** copie les coordonnées seules (`48.856600, 2.352200`), prêtes à coller dans un SMS ou une app de cartes. ⚠️ Si ta position n'a jamais été confirmée, la bulle le dit mais pas le message : dis-le aussi à qui tu écris. Plan non géoréférencé : pas d'icône, aucune coordonnée n'est affichée.

L'écran suit le thème de l'app, ne se met pas en veille tant qu'il est ouvert et tient aussi en paysage. Pour en sortir : le gros bouton **↩️ SORTIR DU MODE URGENCE**, toujours en bas, ou **Échap** sur ordinateur (si une bulle est ouverte, Échap ferme d'abord la bulle).

### ⛑️ Je suis perdu

Tu ne sais plus où tu es. Dans le menu **🧭 Tracker**, le bouton orange **⛑️ Je suis perdu — Mode urgence** estime la **zone où tu peux te trouver**, à partir de ta dernière position sûre, du temps écoulé et de ce que tu vois autour de toi. C'est une aide géométrique : elle ne remplace pas les réflexes ci-dessus.

#### 📚 D'abord, les bonnes pratiques

Le bloc dépliable **📚 Bonnes pratiques**, en haut de la fenêtre, les rappelle :

- **🧘 Garde ton calme (d'abord)** — arrête-toi, respire. La panique fait perdre les repères et gaspille lumière et énergie. Mange ou bois un peu si tu as de quoi.
- **🗺️ Orientation** — **reviens sur tes pas** plutôt que de chercher à atteindre ta destination. Cherche les **axes principaux** (roulages, galeries droites, voies ferrées) qui mènent à des repères connus. Fais le point à la boussole à chaque carrefour. **Écoute** : circulation, métro, eau qui coule indiquent une direction.
- **🔦 Lumière & ressources** — passe ta lampe en économie tout de suite, garde ta lampe de secours, bois un peu mais économise.
- **📡 Communication** — dès que tu captes, préviens la surface : **📋 Copier le rapport** prépare le message.
- **📍 Si tu décides d'attendre** — pose-toi à un endroit **identifiable** (puits numéroté, salle nommée) et marque ton emplacement pour qu'on te trouve. Reste sur place si **personne ne sait que tu es là**.
- **⚠️ À ne pas faire** — ne suis pas l'eau (les diaclases mènent à des passages dangereux), ne tente pas un passage inconnu parce qu'il « monte », ne te fie pas au tracker (il dérive, surtout sous stress).

Ces principes généraux ne remplacent ni la formation ni l'équipement.

#### 🎯 Estimer la zone

1. **📍 Dernière position connue** — là où tu étais sûr d'être : cherche un point du plan par son nom, ou **📍 Clic carte**, ou **🧭 Position tracker** si le suivi est actif.
2. **⏱️ Temps écoulé** — de 1 à 90 minutes. Au-delà, la zone devient trop large : mieux vaut donner l'alerte.
3. **🏃 Vitesse de marche présumée** — le rayon de la zone vaut vitesse × temps. Ces vitesses sont les mêmes que celles de l'itinéraire, et ton choix est gardé sur cet appareil.

| Choix | Vitesse | Rayon pour 10 min |
|---|---|---|
| 🤕 **Blessé** — progression entravée | 2 km/h | ~333 m |
| 🐌 **Lente** — étroitures, exploration | 3 km/h | ~500 m |
| 🚶 **Normale** *(défaut)* | 5 km/h | ~833 m |
| 🏃 **Rapide** — parcours connu | 7 km/h | ~1167 m |

4. **🔮 Indices visuels** (facultatif mais très utile) — ce que tu vois, séparé par des virgules : *bidon d'eau, épure bélier, puits cassé*. L'app les cherche dans le nom, la description et les tags de tous les points du plan.
5. Appuie sur **🎯 Calculer la zone**.

**Sur la carte** :

| Élément | Signification |
|---|---|
| **Cercle orange pulsant** | La zone de recherche |
| **📍 vert pulsant** | Ta dernière position connue |
| **🔮 violet pulsant** | Un indice trouvé **dans la zone** — le plus important |
| **· gris** | Un indice trouvé **hors zone**, écarté |
| **Cercle violet intérieur** | Ta position la plus probable, au centre des indices de la zone (s'il y en a au moins un) |

Si la zone dépasse le plan, un bandeau orange le signale (« tu pourrais être n'importe où ») : réduis le temps ou ajoute des indices. Changer de vitesse recalcule la zone aussitôt.

**Exemple** — parti du dernier puits connu il y a 20 min, tu vois une épure « Bélier » et un bidon : choisis le puits, 20 min, `bélier, bidon`. Si un point « épure Bélier » tombe dans la zone, un cercle violet le désigne.

**Ensuite** :

- **📋 Copier le rapport** — un message tout prêt (plan, position, temps, indices, position probable, heure) à envoyer par SMS ou radio.
- **✅ Supprimer la zone et sauvegarder ma position supposée** — retire la zone et pose un point ⚠️ à la position probable, que tu peux exporter comme n'importe quel point.
- **🗑️ Effacer la zone et fermer** — retire tout, sans créer de point.
- **👁️ Fermer** (ou ✕, ou appui à côté) — ferme la fenêtre mais laisse la zone sur la carte pour explorer ; rouvrir ⛑️ retrouve tes réglages.

---

## 🗺️ Utiliser la carte

### 🧭 Présentation de l'interface

**En haut**, une barre fixe :

- la **rose des vents** à gauche ramène à l'accueil ;
- le **nom du plan** ouvre **🗂 Changer de plan** (voir plus bas) ;
- les **compteurs** 📍 points · 🛣️ tracés · ⬛ zones · 🏛️ structures · 📸 photos ouvrent **📊 Détails de la session** ;
- à droite : **📖** Mode Histoire, **🌍** Vue OSM (plan géoréférencé), **🚨** Sortie d'urgence, **🔋** batterie.

**En bas**, une barre d'état regroupe ce qui est en cours : 📐 mesure, 📏 distance totale des tracés, 🗺️ itinéraire (distance, temps, allure — touche-le pour ouvrir l'itinéraire) et le voyant **🧭 tracker** (ON · pas · distance pendant le suivi ; touche-le pour ouvrir le menu Tracker). Elle passe à la ligne si tout ne tient pas ; le bouton ▾▴ la réduit.

**Sur les côtés**, les deux barres latérales portent les outils. L'interface est organisée en **13 groupes** répartis sur les **deux barres latérales** — à gauche : ⭐ Favoris, 📚 Aide, ⚙️ Réglages, ⬇️ Charger, ⬆️ Enregistrer, ⏪ Historique ; à droite : 🔍 Recherche, 🧭 Tracker, 📐 Mesure, ✏️ Édition, 🛣️ Tracés, ⬛ Zones, 🏛️ Structures :

| Groupe | Icône | À quoi ça sert |
|---|---|---|
| **Favoris** | ⭐ | Tes points mis en favori, accessibles en un clic |
| **Aide / Documentation / Légende** | 📚 | Aide, documentation, légende des icônes |
| **Réglages** | ⚙️ | Réglages du plan : échelle, Nord, géoréférencement, tracker, affichage… *(clic direct)* |
| **Recherche** | 🔍 | Trouver un point, un tracé, une zone ou une structure *(clic direct)* |
| **Charger / Import** | ⬇️ | Importer une session ou un GPX, éditeur de données du plan |
| **Enregistrer** | ⬆️ | Exporter ta session, le plan en image, ou un PDF imprimable |
| **Historique** | ⏪ | Annuler (`Ctrl+Z`) / Rétablir (`Ctrl+Y`) |
| **Tracker** | 🧭 | **Menu plein écran** de tuiles : suivi, recalage, Ma position, boussole, itinéraire, guidage, urgences |
| **Mesure** | 📐 | Mesurer une distance ou une surface, effacer |
| **Édition de points** | ✏️ | Ajouter tes propres points *(clic direct — interrupteur ON/OFF)* |
| **Tracés** | 🛣️ | Tracer galeries principales, secondaires, chemins, jonctions, **calculer la distance totale** |
| **Zones** | ⬛ | Tracer des zones de remblais, effondrement, eau ou inaccessibles |
| **Structures** | 🏛️ | Piliers, murs et fronts de taille |

**Comment ça marche :**

- **Un seul groupe ouvert à la fois** ; toucher à côté le ferme.
- **Pendant un mode** (mesure, ajout de point, tracé, zone, recalage), le groupe reste ouvert et son icône montre le mode en cours. Un seul mode est actif à la fois.
- **Ouvrir une fenêtre par-dessus** (Réglages, Filtres, Documentation…) coupe le mode en cours. Le tracker, lui, continue de tourner, et la fiche d'un point que tu viens de poser ne coupe pas l'édition.
- Les panneaux Tracés, Zones et Structures s'ouvrent au centre de l'écran.
- Le bouton **≡** en haut de chaque barre la replie sans arrêter les modes actifs ; en paysage sur mobile, la barre défile si elle dépasse.

#### 📊 Détails de la session

Un clic sur les compteurs du haut ouvre le **tableau de bord** du plan :

- en tête, **✅ Enregistré il y a N s** (en rouge si la sauvegarde échoue) ;
- les totaux (et la répartition par niveau sur un plan multi-niveau), puis tous tes points, tracés, zones, structures et photos ;
- les autres mesures : 📐 mesure, 🗺️ itinéraire et ses étapes, 🧭 suivi ;
- **📔 Sortie en cours** : 🏁 Clôturer, 🧭 Affiner le tracé, ouvrir le carnet. Si aucune sortie n'est en cours, le bouton **📔 Démarrer une sortie** en ouvre une sur ce plan — y compris quand « Tenir un carnet de mes sorties » est décoché dans ⚙️ Configuration (c'est alors le seul moyen d'en enregistrer une). Une seule sortie à la fois ;
- **⭐ Favoris** : exporter ceux de ce plan ou de tous, importer ;
- **📦 Backups récents** de ce plan : ↻ Restaurer, 📆 Snapshot maintenant, 🗑️ Tout vider — chaque suppression demande confirmation ;
- le bouton **📊 Stats globales** (rapport copiable, CSV, PDF).

### 🗺️ Lire le plan

- **Pincer** pour zoomer, **glisser** pour te déplacer (ou les boutons **+** / **−** en haut à gauche).
- **Toucher une icône** ouvre la fiche du point ; **double-toucher** zoome dessus (comme le bouton « Y aller » de la fiche).
- Les icônes rapetissent au dézoom pour rester à l'échelle du plan. Pour garder une taille fixe : ⚙️ Réglages → 🎨 Affichage → « 📐 Adapter la taille des icônes au zoom ».

#### 🌐 Coordonnées GPS dans les fiches

Si ton plan est **géoréférencé**, la fiche de chaque point (les tiens comme ceux du plan) affiche ses coordonnées, par exemple `🌐 48.85660° N, 2.35220° E`, à environ 1 m près. Le bouton **📋** les copie au format `lat, lng`, prêt à coller dans une application de cartes ou un SMS — pratique pour transmettre l'emplacement d'un puits que tu viens d'ajouter. Les tracés, zones et structures n'ont pas de coordonnée unique, donc pas de ligne GPS. Plan non géoréférencé : pas de ligne.

#### 🔄 Changer de plan

Le **nom du plan**, en haut, ouvre **🗂 Changer de plan** : le plan en cours, les plans récents, et **📚 Voir tous mes plans** pour revenir à l'accueil. Au changement, ta session est **sauvegardée automatiquement**. Pour fermer sans rien faire : ✕, clic à côté ou **Échap**.

### ≡ Filtres

Le bouton **≡** en haut à droite de la carte ouvre **≡ Filtres d'affichage**. Chaque case agit tout de suite sur la carte :

| Section | Ce qu'elle filtre |
|---|---|
| 🖼️ **Calques d'image** | L'image du plan et ses calques additionnels |
| 📊 **Calques de données** | Les calques livrés avec le plan, et **Mes annotations** (tout ce que tu as ajouté : le décocher masque tes ajouts sans rien supprimer) |
| 🏗️ **Niveaux M-LVL** | Plans multi-niveaux : niveau actif (pour dessiner) et niveaux visibles — synchronisé avec la fenêtre Niveaux |
| 🏷️ **Tags des points** | Les tags réellement présents sur le plan, avec leur compteur |
| 🛣️ ⬛ 🏛️ **Types** | Types de tracés, de zones et de structures, y compris les tiens |

- Chaque section se replie, et a ses boutons **👁️ Tout** / **🚫 Aucun**.
- **🔄 Tout afficher** remet les tags et les types à « tout visible », sans toucher aux niveaux ni aux calques.
- En bas, **Filtres actifs : …** rappelle ce qui est filtré ; le bouton ≡ signale aussi quand des éléments sont masqués.
- Les filtres sont **mémorisés par plan** : tu les retrouves en revenant sur ce plan, et un message te le signale.
- Ce que tu es en train de dessiner reste visible, même si tu décoches son type.

*Exemple : pour ne voir que deux sortes de puits, 🏷️ Tags → 🚫 Aucun, puis recoche les deux tags voulus.*

> 🔄 **Corriger un calque de données** — un calque livré avec le plan se masque mais ne s'édite pas. Le bouton **🔄 Modifier** de sa ligne le copie dans ta session, où tous tes outils s'appliquent (par exemple 🔄 Convertir cet objet) ; l'original se masque (« en cours de modification — afficher quand même » permet de comparer). Avant d'agir, l'app t'annonce la place que prendra la copie (le navigateur tolère environ 5 Mo, tous plans confondus). **↩️ Restaurer** abandonne tes modifications ; **💾 Exporter** produit le fichier corrigé de **ce calque seul**, à redonner au plan via 🏗️ Générateur → « Modifier un plan », bouton « Choisir » sur la ligne du calque : il remplace l'ancien contenu. Ce que tu as dessiné toi-même n'en fait pas partie (l'app te dit combien d'objets restent hors du fichier). Effacer la session restaure les calques ouverts à la modification ; réimporter ta session sur ce plan les remet en modification.

### 🗺️ Légende

**📚 Aide / Documentation / Légende → Légende** affiche toutes les icônes que l'app reconnaît (même celles que ton plan n'utilise pas), ainsi que les tracés et les zones, rangés par catégorie.

#### 🎨 Personnaliser la légende

Dans la Légende, **✏️ Modifier**. Pour chaque type de tracé, zone ou structure :

- **Renommer** : ton libellé (« Principal » → « Grande galerie ») s'affiche partout — légende, fiches, statistiques, filtres.
- **🎨 Couleur** : un carré par ligne ; deux pour les zones, piliers et murs (fond et bordure). La couleur s'applique aussitôt partout : carte, exports image, PDF et KMZ, statistiques, Vue OSM. **↺** rétablit les couleurs d'origine. Sans bordure choisie, une zone prend une version plus foncée de son fond ; une zone *Inaccessible* recolorée perd ses hachures.
- **👁️ Masquer** retire l'entrée de la boîte de légende seulement. Pour masquer des objets sur la carte, c'est **≡ Filtres**.
- **➕ Ajouter une entrée** crée ton propre type (tracé, zone, structure, icône) avec sa couleur, aussitôt dessinable. Raccourci : la ligne **Nouveau type…** des menus Tracés, Zones et Structures, qui sélectionne le type créé.
- **🗑️ Supprimer** un type à toi : si des objets l'utilisent encore, l'app t'annonce combien avant de confirmer.

Tout est sauvegardé **par plan**, et voyage avec tes exports (session, calque de données, ZIP Avancé). Si des objets utilisent un type absent de la légende, un bandeau en tête de la Légende les compte : ils s'affichent en couleur de repli jusqu'à ce que tu recrées ou réimportes l'entrée.

---

## 🔍 Recherche unifiée

Le bouton **🔍** de la barre latérale, ou **Ctrl+K** (`Cmd+K` sur Mac), ouvre **🔍 Recherche unifiée**. Ctrl+K à nouveau la referme.

### ⚙️ Comment ça marche

1. Tape ta recherche : les résultats s'affichent au fil de la frappe, **rangés par catégorie** — 📍 Points · 🛣️ Tracés · ⬛ Zones · 🏛️ Structures.
2. Choisis avec **↑** / **↓** puis **Entrée**, ou touche un résultat.
3. La carte se centre dessus : un cercle autour d'un point, un surlignage de quelques secondes pour un tracé, une zone ou une structure, et sa fiche s'ouvre.

**Ce qui est cherché** : pour un point, son nom, son identifiant, ses tags, sa description et son état ; pour un tracé, une zone ou une structure, son nom, son type et son niveau. La recherche couvre tes ajouts **et** les calques livrés avec le plan. Elle ignore les accents et les majuscules (« aeration » trouve « Aération »).

**Filtres sous le champ** (remis à zéro à chaque ouverture) :

- **Catégorie** — Points, Tracés, Zones, Structures, avec leur compteur ;
- **Calques** et **Tags** — pour les points seulement.

Plusieurs choix sur une même ligne s'additionnent (l'un **ou** l'autre) ; d'une ligne à l'autre, ils se combinent (l'un **et** l'autre). **✕ Effacer les filtres** les retire.

### 🌐 Coller des coordonnées GPS

Sur un plan **géoréférencé**, colle des coordonnées au format `48.856600, 2.352200` (copiées depuis une application de cartes) :

- un point existe tout près → **🎯 Aller au point** ;
- sinon → **➕ Créer un point ici**, qui ouvre la fiche d'un nouveau point à cet endroit.

Si la position tombe hors du plan, ou si le plan n'est pas géoréférencé, un message le dit (avec un raccourci vers ⚙️ Réglages → 🌐 Géoréférencement).

### 🔎 Recherche multi-plans

Pour chercher un point dans **tous tes plans** sans les ouvrir :

- **depuis l'accueil** : la barre de recherche 🔎 en haut de l'écran. Les résultats (plans et points) s'affichent dès 2 caractères ; **Entrée** ou 🔎 ouvre la recherche complète ;
- **depuis la carte** : dans la recherche, le bouton **Chercher dans tous les plans**, qui garde ta saisie.

L'app lit les points de chaque plan sur place, en affichant sa progression. Chaque résultat porte le **nom de son plan**. Un clic ouvre le bon plan, sur le bon niveau, centré sur le point (après confirmation si un plan est déjà ouvert) ; le bouton **↩️ Retour** te ramène d'où tu viens.

---

## 📍 Tracker de position

Le tracker estime ta position **sans GPS**, avec les capteurs de mouvement du téléphone (pas et direction). Tous ses boutons sont dans le groupe **🧭 Tracker**.

### 🧭 Menu Tracker

Le bouton **🧭 Tracker** (ou le voyant 🧭 de la barre du bas) ouvre une **modale plein écran de grosses tuiles**, en trois sections. Chaque tuile ferme la modale en agissant.

| Section | Tuiles |
|---|---|
| **Suivi** | ▶️ / ⏹️ Démarrer / arrêter · 📍 Mode recalage · 🎯 Ma position (recentre la carte sur toi) · 🔓 Suspendre le verrou sur tracé |
| **Outils** | 🧭 Boussole · 🗺️ Calculer un itinéraire · 🪧 Guidage de l'itinéraire · 🗺️ Plan orienté |
| **Urgence** (fond rouge) | ⛑️ Je suis perdu · 🚨 Mode urgence XL · 🚨 Mode Secours — voir 🆘 En cas d'urgence sous terre |

Navigation intelligente (verrou sur tracé), plan orienté, itinéraire via plusieurs plans, replay et heatmap sont des options désactivées par défaut → 🔭 Pour aller plus loin.

### ▶️ Démarrer le suivi

1. Touche **▶️**. La première fois après chaque rechargement de l'app, une fenêtre rappelle que le tracker est **expérimental** (il dérive) et propose **🔆 Garder l'écran allumé**, cochée d'office : un écran qui s'éteint, ce sont des pas perdus. Valide avec **J'ai compris — Démarrer**.
2. Sur téléphone, accepte l'accès aux capteurs de mouvement.
3. Ton icône (un cône bleu) apparaît au point de départ et pointe dans ta direction de marche (vers le Nord quand le suivi est arrêté) ; un tracé enregistre ton chemin.
4. **⏹️** arrête le suivi.

> ⚠️ La dérive s'accumule : **recale-toi environ tous les 50 m** sur un repère du plan. Les armatures métalliques faussent la boussole du téléphone — garde une vraie boussole.

### 📍 Recaler sa position

Dès que tu reconnais un repère :

1. Touche **📍** (le bouton s'allume) ;
2. touche l'endroit du plan où tu te trouves.

L'icône s'y place, le tracé repart de là et le mode se referme tout seul. Autre façon : le bouton **📍 Je suis ici** dans la fiche d'un point.

### 🧭 Boussole

La tuile **🧭** affiche une rose des vents en haut à gauche de la carte, même tracker arrêté. Son **N** pointe toujours vers le Nord, dans toutes les orientations du téléphone. Touche-la pour l'agrandir (cap en gros et angle exact) ; ✕ la ferme.

**Pour vérifier les capteurs**, tiens le téléphone à plat, le haut dans ta direction de marche :

| Tu marches vers… | Le N de la rose est… |
|---|---|
| le Nord | en haut |
| l'Est | à gauche |
| le Sud | en bas |
| l'Ouest | à droite |

Si ça ne colle pas, le champ magnétique est perturbé (ferraille, armatures) : recale-toi dès que possible et méfie-toi du tracé.

### ⚙️ Réglages du tracker

Dans **⚙️ Réglages → 📍 Navigation & tracker** :

- **🧭 Position initiale du tracker** (propre à ce plan) : saisis X / Y, ou utilise **🔍 Choisir via un point** (recherche par nom, identifiant ou tag) ou **📍 Cliquer sur la carte**. Pense à sauvegarder.
- **👣 Détection des pas** — **Taille d'un pas (m)** (environ 0,7 m), **Seuil de détection** (sensibilité), **Cooldown (ms)** (délai minimum entre deux pas). Ces réglages valent pour **tous tes plans** sur cet appareil et voyagent avec ton profil.

Tout repose sur l'**échelle** du plan (⚙️ Réglages → 📐 Plan : échelle & géolocalisation, bouton 🎯 pour la calculer d'après une mesure réelle) : vérifie-la en premier.

---

## 🗺️ Calculer un itinéraire

La tuile **🗺️ Calculer un itinéraire** du menu Tracker calcule le **chemin le plus court** entre plusieurs points, en suivant les tracés du plan (les tiens et ceux livrés avec le plan).

1. Ajoute tes **📍 Points de passage**, dans l'ordre :
   - **📍 Mode clic carte** : la fenêtre se réduit, touche la carte pour poser chaque point, puis **✓ Terminer** ;
   - **🔍 recherche** d'un point existant (nom, identifiant, tag) ;
   - **🧭 Ma position** : ta position tracker du moment.
   Le ✕ d'une ligne retire le point.
2. **🎯 Calculer l'itinéraire** : le trajet apparaît en cyan, avec sa distance et son temps estimé.
3. **💾 Enregistrer comme itinéraire** le garde dans ta session ; **❌ Effacer** le retire.

Tant qu'un itinéraire est actif, la barre du bas affiche **🗺️ distance · temps · allure** ; touche-la pour rouvrir la fenêtre.

**🏃 Vitesse de marche estimée** (mémorisée sur cet appareil) :

| Allure | Vitesse | Quand |
|---|---|---|
| 🤕 **Blessé** | 2 km/h | Progression entravée, terrain accidenté |
| 🐌 **Lente** | 3 km/h | Prudence, étroitures, exploration |
| 🚶 **Normale** | 5 km/h | Allure standard (par défaut) |
| 🏃 **Rapide** | 7 km/h | Allure soutenue, parcours connu |

**🛑 Pause entre les arrêts** (case à cocher) ajoute une durée de pause à chaque étape intermédiaire dans le temps estimé.

**Itinéraire déjà tracé ?** La fenêtre s'ouvre en navigation : **⏮️ Début**, **⏭️ Fin**, **🔁 Tour complet**, 🎯 sur chaque étape pour la voir, **🔄 Recalculer l'itinéraire** pour retoucher les étapes, **❌ Effacer l'itinéraire**.

**Départ ou étape à côté des galeries** : le bout de trajet jusqu'à la galerie la plus proche est dessiné **en pointillé** et compté dans la distance (aller et retour pour une étape). Au-delà de **50 m**, l'app te prévient : ce n'est pas une galerie connue, vérifie la position. Un plan **sans aucun tracé** ne permet pas de calculer d'itinéraire.

### 🔄 Itinéraire vivant

L'itinéraire suit tes recalages :

- **Tu te recales sur le trajet** (bouton **📍 Je suis ici** d'un point à moins de 8 m du trajet, ou arrivée par un portail) : la partie déjà faite est retirée, les étapes dépassées sont validées, la distance restante se met à jour. Rien n'est recalculé : c'est instantané.
- **Tu te recales ailleurs** : l'app te propose **Recalculer** depuis ta nouvelle position (les étapes restantes gardent ton ordre et tes évitements), **Garder l'itinéraire** tel quel, ou **🗑️ Supprimer l'itinéraire**.
- **📍 Je suis ici sur une étape** la **valide** (✓ vert sur la carte, ligne rayée dans la fenêtre), dans l'ordre que tu veux. Un recalage par clic sur la carte ne valide jamais d'étape.
- **Toutes les étapes validées** : « 🎉 Itinéraire terminé », le trajet s'efface (ton tracé de suivi reste).

Les étapes validées sont gardées avec ta session, même si le téléphone se verrouille ou si l'app recharge.

*En pratique : planifie moi → curiosité X → curiosité Y → sortie, marche, et touche 📍 Je suis ici à chaque point atteint.*

### 🪧 Guidage

Dès qu'un **itinéraire est tracé** et que ta position est connue — tracker en marche, ou simplement un **📍 Je suis ici** sur un point — un **bandeau** en haut de la carte te dit quoi faire :

- **« Dans 40 m, tourner à gauche »**, **« Continuer sur 120 m »**, puis **« Maintenant : tourner à gauche »** ; en dessous, la consigne suivante (« Puis tourner à droite »).
- Il ne parle qu'**aux croisements**, toujours avec une distance (jamais « la 3e à gauche »). Deux galeries proches : « prendre la branche de gauche / de droite ». Jonction de niveau : « monter / descendre vers le niveau N ».
- Plusieurs croisements très rapprochés comptent comme **un seul carrefour**, avec une seule consigne. À partir de 4 galeries, un **petit schéma** montre celle à prendre (en doré) ; si un point nommé s'y trouve, son nom ouvre la consigne.
- **Hors tracé au départ** : « Rejoindre le tracé : ~12 m », avec une flèche vers la galerie la plus proche.
- Les distances sont **approximatives** (« ~40 m », arrondies à 10 m) : la position vient du podomètre et dérive.

**Tu t'écartes ou tu fais demi-tour ?** Le bandeau passe en orange (« Hors itinéraire ? » / « Demi-tour ? ») et propose **Je suis ici** (touche l'endroit où tu es), **Recalculer d'ici** ou **Ignorer**. Rien n'est recalculé sans toi.

**Toucher le bandeau** ouvre la **🪧 Feuille de route** : toutes les consignes et leurs distances (touche une ligne pour voir l'endroit). Elle s'ouvre aussi depuis la fenêtre Itinéraire, sans tracker, pour préparer une sortie.

**Le ✕ du bandeau coupe le guidage** ; la tuile **🪧 Guidage de l'itinéraire** du menu Tracker le rallume, sans recalcul.

> 🚨 En **sortie d'urgence**, le bandeau n'a pas de ✕ et s'affiche même guidage coupé ; en cas d'écart, il propose **Sortie la plus proche d'ici**. L'Affichage XL reprend la consigne en gros.

### 🚫 Préférences d'évitement

La section repliable **🚫 Préférences d'évitement (optionnel)** de la fenêtre Itinéraire fixe ce que l'itinéraire doit **contourner si possible** :

- **📍 Points à éviter** : par recherche, par identifiant exact, ou **📍 Cliquer sur la carte** ;
- **🏷️ Tags à éviter** : touche un tag pour éviter tous les points qui le portent ;
- **⬛ Zones à éviter** : coche un type de zone (Eau, Effondrement, tes types…) ;
- **📏 Marge** : la distance gardée autour des points évités.

S'il n'existe aucun autre chemin, l'itinéraire passe quand même et l'affiche : **⚠️ Impossible d'éviter : …**. Tes préférences sont mémorisées par plan ; **🗑️ Reset tous les évitements** les efface.

Les **zones inaccessibles ⛔**, elles, ne sont **jamais traversées**, sauf si tu décoches **Respecter les zones inaccessibles** (utile sur un relevé incomplet). Je suis perdu et le Mode Secours les respectent toujours.

---

## 🌀 Liaisons inter-plan

Une liaison relie **un point d'un plan à un point d'un autre plan** — un « portail » entre deux réseaux qui se touchent, ou entre un plan général et un plan de détail.

**Créer une liaison** : dans la fiche d'un point, **🌀 Lier à un autre plan** → choisis le plan cible → cherche le point d'arrivée (nom, identifiant ou tag ; inutile d'ouvrir l'autre plan). La liaison apparaît dans la fiche des **deux** points. Un point peut en porter plusieurs.

**Sur la carte**, un point lié garde son icône. Pour le repérer, donne-lui le tag **Portail** (icône de vortex).

**Utiliser une liaison** : dans la fiche, ligne 🌀 → **➜** → confirmation. L'app sauvegarde ta session, ouvre l'autre plan, passe au bon niveau et te pose sur le point d'arrivée. Ton **tracker y est recalé** (tu as physiquement traversé), et un itinéraire actif sur ce plan repart du portail. Un bouton **↩️ Retour : <plan>** te ramène à la vue d'où tu venais, pendant 15 secondes ; les retours s'empilent. Sur ce bouton, **–** le réduit en pastille (choix mémorisé) et **✕** le ferme en oubliant les retours.

**🌀 Mes liaisons** (sur l'accueil) liste toutes tes liaisons : ➜ pour aller à un bout, 🗑️ pour supprimer, ⛔ si un plan manque sur l'appareil. Deux affichages :

- **Liste** — avec, quand les deux plans sont géoréférencés, l'**Écart de calage** : la distance entre les deux bouts, qui désignent le même endroit réel. Ce n'est pas une distance à parcourir : plus elle est petite, meilleur est ton géoréférencement. Un écart aberrant vient presque toujours du géoréférencement d'un des deux plans. La Vue OSM classe ces écarts du pire au meilleur.
- **Graphe** — ta bibliothèque en réseau : une bulle par plan, un trait par frontière (plus épais avec plus de liaisons). Touche une bulle pour ouvrir le plan, un trait pour voir ses liaisons ; déplace les bulles au doigt.

### 🧭 Itinéraire vers un autre plan

Depuis la fenêtre Itinéraire (**Destination sur un autre plan**) ou un résultat de la recherche multi-plans (bouton 🧭) : l'app choisit le portail le plus court, affiche le trajet en étapes et le trace sur ton plan. Tes points de passage sont parcourus d'abord, dans l'ordre ; les évitements de chaque plan sont respectés. Si c'est impossible, un message dit pourquoi.

**C'est parti** ne te téléporte pas : tu marches (validation des étapes et recalcul comme d'habitude), puis tu traverses au portail avec le bouton flottant **🌀 Portail suivant** ou le ➜ du point-portail. La suite se trace de l'autre côté. Si tu ouvres le plan suivant autrement, ou si tu remplaces l'itinéraire, la suite est abandonnée. La 🪧 Feuille de route résume les plans suivants (« Puis 🌀 portail → plan : 350 m, 4 croisements »).

**Bon à savoir** : renommer ou déplacer un point lié met ses liaisons à jour ; supprimer un point supprime ses liaisons ; les liaisons voyagent avec l'export de session ; celles livrées avec un plan s'utilisent mais ne se modifient pas.

---

## 🌍 Vue OSM

La Vue OSM pose tes plans **géoréférencés** sur la carte OpenStreetMap, avec leurs points, tracés, zones et structures, dans tes couleurs de légende. Elle est **active par défaut** : le fond de carte vient d'OpenStreetMap, qui voit donc les zones que tu regardes ; aucune donnée de tes plans ne sort. Pour la couper : ⚙️ Configuration.

- **Sur l'accueil**, le widget **🌍 Vue OSM** ; son bouton **⛶** ouvre le mode OSM en plein écran.
- **Sur un plan**, le bouton **🌍** de la barre du haut (plans géoréférencés).
- Un plan n'y apparaît qu'une fois **ouvert au moins une fois** : c'est à l'ouverture que l'app lit son géoréférencement.
- **Hors connexion** : **💾 Sauvegarder hors-ligne** télécharge à l'avance les tuiles de la zone visible.
- Zoomer sur un plan affiche des images plus détaillées, lues dans le fichier du plan déjà sur ton appareil. Les calques livrés masqués s'y affichent et se filtrent comme les autres.

**Recherche** : la barre de la ligne de titre cherche un plan ou un point de tes plans géoréférencés ; la carte vole dessus. Elle lit tes plans, sans rien demander à Internet.

**📏 Mesurer** : en mode OSM, l'outil de mesure donne une distance et une surface ; elles ne dépendent d'aucun calibrage de plan.

**🎯 Coordonnées de surface** : un clic sur la carte donne la latitude et la longitude du point juste au-dessus, avec un bouton Copier — c'est ce qu'on transmet à une équipe qui arrive par la surface. Leur justesse dépend du calage du plan.

**🗂️ Plusieurs plans à la fois** : le bouton **≡** du bandeau ouvre une fenêtre avec les réglages d'affichage, le filtre par tag et la pile des plans affichés :

- ➕ ajouter un plan, ▲▼ le passer dessus ou dessous, un curseur d'**opacité** par plan, ✕ le retirer ; ◉ marque le plan principal ;
- sur chaque ligne, 5 mini-boutons masquent l'image, les points, les tracés, les zones ou les structures de ce plan ;
- **par étiquette** : les étiquettes partagées par au moins deux de tes plans géoréférencés apparaissent en puces ; un clic affiche tous leurs plans, un second les retire. Au-delà de 3 plans, l'app demande confirmation et les charge un par un (plus lent sur mobile).

---

## 📖 Mode Histoire

Le bouton **📖** de la barre du haut (à droite, à côté de 🚨) ouvre ton **carnet d'exploration** propre à chaque plan, en deux onglets.

### 📝 Note libre

Une note par plan, **sauvegardée pendant que tu tapes**. Elle s'affiche mise en forme ; **✏️ Éditer** ouvre le texte, avec une barre d'outils (gras, italique, titres, liste, lien, code, citation), et **👁 Aperçu** revient au rendu. La note accepte le Markdown (`**gras**`, `# Titre`, `- élément`).

### 📚 Documents PDF

Jusqu'à **10 documents PDF par plan** : rapport, plan papier scanné, article, relevé topo…

- **📥 Importer un PDF** en ajoute un ; **🗑️ Retirer** supprime celui affiché. La liste apparaît dès qu'il y en a plusieurs.
- Les documents livrés avec le plan (📕) passent en tête de liste. Ils sont copiés sur ton appareil à la première ouverture ; si tu les retires, ils reviennent à la prochaine ouverture du plan.
- Avertissement au-delà de **25 Mo** cumulés, refus au-delà de **100 Mo**.
- Sur iPhone, **↗️ Ouvrir dans un onglet** affiche le document en plein écran.
- Tes documents se consultent aussi depuis **📔 Mon carnet → 📖 Récits**, sans charger le plan.

**Export** : la note et les documents partent avec l'export de session et sont **ajoutés** au plan à la réimportation (rien n'est écrasé). L'export **anonymisé** les laisse de côté. Tout reste sur ton appareil.

---

## ✏️ Ajouter des points

Le bouton **✏️** de la barre latérale allume ou éteint le mode ajout. Allumé, chaque tap sur la carte pose un point :

1. Appuie sur **✏️** (il se surligne), puis tape l'emplacement sur le plan
2. Renseigne le **Nom** (obligatoire), le **Type** et, si tu veux, une **Description**
3. Valide avec **✅ Ajouter**

**Le type** donne l'icône du point. Les types sont rangés par familles — 🕳️ Puits, 🪜 Accès (**vert = ouvert, rouge = fermé**), ⚠️ Signalétique, 🚨 Secours — et la 🗺️ Légende les montre tous. **— Aucun tag (défaut) —** garde l'icône par défaut. **➕ Créer un nouveau tag…** ajoute un type à ta session : un nom court en minuscules, chiffres, `_` ou `-` (ex. `fontaine`) ; il prend l'icône par défaut.

### ✏️ Modifier ou repositionner un point

Sur **tes** points, la bulle du point propose :

- **✏️ Modifier** — rouvre la fenêtre pré-remplie (nom, type, description, photos), puis **💾 Enregistrer**. Si tu renommes un point, ses photos le suivent.
- **📌 Repositionner** — un bandeau « Clique la nouvelle position de … » s'affiche : le prochain tap y déplace le point. Le point garde tout le reste (nom, type, photos, niveau). **Annuler** dans le bandeau abandonne.

Les deux s'annulent avec ⏪ (`Ctrl+Z`). Pour retirer un point : **🗑️ Supprimer ce point**, dans sa bulle (voir 🧹 Effacer et corriger).

### 📸 Photos attachées aux points

Jusqu'à **5 photos par point**, gardées sur ton appareil uniquement. Dans la fenêtre d'ajout ou de modification, section **📸 Photos** :

- **📷 Prendre photo** ouvre l'appareil photo (mobile) ; **🖼️ Depuis la galerie** permet d'en choisir plusieurs d'un coup.
- Chaque photo est **compressée** (une photo de plusieurs Mo pèse ensuite quelques centaines de Ko) et **nettoyée** : position GPS de la prise de vue, date et modèle d'appareil sont effacés avant d'entrer dans l'app.
- **Retirer une photo** : la croix ✕ rouge de la miniature la marque à supprimer, la flèche verte ↺ annule. Rien n'est effacé avant **💾 Enregistrer**.
- **Fermer sans enregistrer** efface les photos que tu venais d'ajouter et annule les marquages.

**Les voir** : la bulle du point montre les miniatures — un tap ouvre le plein écran (pince ou molette pour zoomer, glisser pour passer à la suivante, `← →` et `Échap` sur PC). Le compteur **📸** de la barre du haut ouvre le détail de la session.

**Les emporter** : coche la case 📸 des photos dans ⬆️ → **🚀 Full**, **🎨 Avancé** ou **🔄 Conversion** ; un fichier réimporté restaure ses photos. Avec **🛡️ Anonymiser pour partage public**, chaque photo est renommée et rattachée au code anonyme de son point ; une photo qui ne peut pas être nettoyée est exclue.

> ⚠️ Les photos occupent le stockage du navigateur (de quelques dizaines à quelques centaines de Mo selon l'appareil) ; un avertissement s'affiche près de la limite. Sur iPhone, le système peut vider ce stockage s'il manque de place : exporte régulièrement. **💥 Tout réinitialiser** efface aussi les photos, et leur suppression ne s'annule pas.

---

## 🛣️ Tracer des routes

Dans le groupe **🛣️ Tracés** :

- **🟩 Route principale**, **🟪 Route secondaire**, **🟨 Chemin**
- **🪜 Jonction interniveau** — sur un plan multi-niveau seulement (voir 🏗️ Mode multi-niveau)

Appuie sur un type, tape le plan point par point, puis re-appuie sur le type (ou sur **✅ Valider le tracé en cours**) pour terminer.

### 📏 Distance totale des tracés

**📏 Distance totale** additionne la longueur de tous les tracés du plan — les tiens et ceux des calques de données, même masqués — avec une case par type et, pour chacun, le nombre de tracés et leur longueur. Le total se met à jour à chaque case, et les tronçons comptés sont surlignés en magenta. **✓ Fermer (garder le surlignage)** laisse le surlignage sur la carte (re-appuie sur 📏 pour rouvrir, tes cases sont gardées) ; **❌ Effacer le surlignage** le retire. Ce total reste à l'écran : il n'entre pas dans l'export image.

---

## ⬛ Tracer des zones

Dans le groupe **⬛ Zones**, des surfaces fermées pour annoter le plan :

| Type | Aspect | Effet sur l'itinéraire |
|---|---|---|
| ⬛ **Remblais** | gris foncé | aucun |
| 🟥 **Effondrement** | rouge | aucun |
| 🟦 **Eau** | bleu | aucun |
| ⛔ **Inaccessible** | hachures rouge sombre / noir | **bloque** le passage |

Appuie sur un type, pose au moins 3 points (en pointillé), puis ferme la zone : **re-tape le premier point** (un cercle l'entoure dès le 3e point) ou appuie sur **✅ Fermer la zone en cours**. Quel que soit l'ordre de tracé, l'eau s'affiche dessous, puis les remblais, les effondrements, et l'inaccessible par-dessus tout.

### ⛔ Zone « Inaccessible » — bloque l'itinéraire

Une zone ⛔ interdit son passage à l'itinéraire (effondrement récent, eau profonde…) : le calcul cherche un autre chemin, ou échoue en le disant. Elle ne bloque que **son niveau**, et reste prise en compte même si tu masques le calque des zones.

La case **Respecter les zones inaccessibles** de la fenêtre Itinéraire (cochée d'origine) permet de la relâcher. Le **Mode Secours** et « Je suis perdu » la respectent toujours. Pour « éviter si possible », utilise plutôt les **🚫 Préférences d'évitement** de l'itinéraire.

---

## 🏛️ Structures (piliers, murs, fronts de taille)

Pour les carrières : les éléments porteurs et l'avancement de l'exploitation, dans le groupe **🏛️ Structures**. Elles n'ont aucun effet sur l'itinéraire.

| Type | Forme | Couleur |
|---|---|---|
| 🟡 **Pilier 1ère masse** | surface fermée | jaune |
| 🟠 **Pilier 2e masse** | surface fermée | orange |
| 🔵 **Mur** (pierre sèche, maçonnerie) | surface fermée | bleu |
| 🟨 **Front de taille 1ère masse** | ligne | trait jaune |
| 🟧 **Front de taille 2e masse** | ligne | trait orange |

Appuie sur un type, tape les points, puis re-appuie sur le type allumé (ou sur **✅ Fermer la structure en cours**) : un pilier ou un mur (3 points minimum) se referme sur son premier point, un front de taille (2 points minimum) reste une ligne ouverte.

Sur un plan multi-niveau, les éléments de **2e masse** se rangent automatiquement **un niveau sous le niveau actif** ; les autres prennent le niveau actif.

---

## 🧹 Effacer et corriger

Les groupes **🛣️ Tracés**, **⬛ Zones** et **🏛️ Structures** ont chacun un bouton **🧹 Effacer** avec les mêmes choix :

| Choix | Effet |
|---|---|
| **↩️ Dernier point** | Retire le dernier point posé — pour corriger un tap raté sans recommencer |
| **✂️ Dernier tracé / zone / structure** | Supprime l'objet en cours de dessin, sinon le dernier terminé |
| **🎯 Sélectionner … à supprimer** | Tape l'objet sur la carte (ou près de son bord) pour le supprimer |
| **🗑️ Tous les tracés / zones / structures** | Vide toute la famille |

Les jonctions 🪜 s'effacent comme les autres tracés.

**Un objet précis** : sa bulle porte un bouton **🗑️ Supprimer** ; pour un point, c'est **🗑️ Supprimer ce point**. Pas de fenêtre de confirmation : tout s'annule avec ⏪ (`Ctrl+Z`).

**Tout le plan** : quand tu rouvres un plan, la fenêtre « Session précédente restaurée » propose **🗑️ Effacer la session** (points, tracés, zones, structures, mesures et tracé du suivi ; une copie reste dans 📦 Backups).

> ℹ️ Seuls **tes** objets s'effacent. Ceux du plan ou d'un calque de données sont en lecture seule : ouvre d'abord leur calque à la modification depuis ≡ **Filtres**, puis exporte le calque corrigé.

---

## 🫧 La bulle d'un objet — note, conversion, suppression

Un tap sur **un tracé, une zone ou une structure que tu as dessinés** ouvre sa bulle :

| Élément | À quoi ça sert |
|---|---|
| **Zone de texte** | Une note libre — état du passage, observation, rappel |
| **💾 Sauver la note** | Enregistre la note et referme la bulle |
| **🔄 Convertir** | Change le **type** de l'objet, et au besoin sa **famille** |
| **🗑️ Supprimer** | Retire l'objet (en rouge, sur sa propre ligne) |

Un objet venu d'un calque de données ouvre une bulle en lecture seule.

### 📍 La bulle d'un point

Un tap sur un **marqueur** affiche son nom, son type, sa note et ces boutons :

| Bouton | À quoi ça sert |
|---|---|
| **📍 Je suis ici** | Recale le suivi sur ce point et **confirme ta position** : 🚨 Sortie d'urgence et 🧭 Y aller partent ensuite de là |
| **🧭 Y aller** | Calcule un itinéraire depuis ta position jusqu'à ce point |
| **➕ Itinéraire** | Ajoute le point comme étape d'un itinéraire |
| **☆ Favori** | Ajoute ou retire le point de ⭐ Favoris |
| **🔊** | Lit la note à voix haute |
| **📋** | Coordonnées GPS à copier, si le plan est géoréférencé |
| **📸 Miniatures** | Les photos attachées |
| **🌀 Liaisons** | Les liaisons inter-plan qui partent de ce point |

Sur **tes** points s'ajoutent **✏️ Modifier**, **📌 Repositionner** et, sur une ligne rouge, **🗑️ Supprimer ce point**.

### 🔄 Convertir — changer un objet de type, ou de famille

Cas typique : sur un relevé importé, un **front de taille** est en fait une **galerie**. L'itinéraire ne se calcule que sur les tracés : le convertir en tracé le fait entrer dans le calcul.

Seules les cibles de **même forme** sont proposées : une **ligne** (tracé, front de taille) devient une autre ligne, une **surface fermée** (zone, pilier, mur) une autre surface. L'objet garde sa géométrie, son niveau et sa note.

### 🎯 Convertir plusieurs objets d'un coup

Dans la fenêtre de conversion, **🎯 Sélectionner plusieurs objets à convertir** affiche un bandeau :

- **tape un objet** pour l'ajouter (bleu pointillé), re-tape-le pour le retirer ;
- **➕ Tous les « type » du niveau affiché** ajoute tous les objets du même type que le dernier ajouté ;
- **✅ Convertir (N)** ouvre le choix du type pour tout le lot ; **Annuler** abandonne.

Le lot ne mélange pas lignes et surfaces fermées (le bandeau refuse et explique pourquoi), mais il peut mélanger les familles : fronts de taille et chemins, tous des lignes, deviennent ensemble des galeries. Les objets déjà du bon type restent tels quels, et le message final les compte. Un seul `Ctrl+Z` annule tout le lot.

---

## ⏪ Annuler / Rétablir

Tes **50 dernières actions** sur le plan s'annulent et se rétablissent :

- **`Ctrl+Z`** (`Cmd+Z` sur Mac) annule ; **`Ctrl+Y`** ou **`Ctrl+Shift+Z`** rétablit ;
- ou le groupe **⏪ Historique**, en bas de la barre latérale : **⏪ Annuler** et **⏩ Rétablir** (grisés quand il n'y a rien à faire).

Un message en bas de l'écran dit ce qui a été annulé ou refait (« ↩ Annulé : Pose du point … »).

**Ce qui s'annule** : ajout, modification, déplacement et suppression de points ; chaque point posé d'un tracé, d'une zone ou d'une structure, leur fermeture, leur suppression (y compris « Tous ») ; les conversions.

**Ce qui ne s'annule pas** : la suppression d'une photo, l'import d'une session, le suivi de position, la mesure.

L'historique est **oublié** quand tu recharges la page ou changes de plan, et une nouvelle action après des annulations efface ce qu'il restait à rétablir.

> ⌨️ Sur PC, **`?`** affiche tous les raccourcis : `E` Édition, `M` Mesure, `Z` Zones, `S` Structures, `T` Tracker, `P` Tracés, `L` Légende, `B` Boussole, `R` ou `Ctrl+K` Recherche, `F` mode présentation, `Échap` pour fermer ; dans un menu d'outils ouvert, `Tab` parcourt les choix et `Entrée` valide. Ils ne réagissent pas pendant que tu tapes dans un champ.

---

## 📐 Mesure de distance et ⬛ de surface

Dans le groupe **📐 Mesure** :

- **📐 Distance** — tape des points ; le total s'affiche en bas à gauche, avec la longueur de chaque segment et les angles.
- **⬛ Surface** — tape au moins 3 points ; l'aire s'affiche en m², puis en hectares au-delà de 10 000 m².

Les deux mesures coexistent : passer de l'une à l'autre ne les efface pas, et le prochain tap va à celle qui est allumée. Leur précision dépend de l'échelle du plan (calibrée dans ⚙️ Réglages). Elles sont gardées avec ta session.

**❌ Effacer** propose **↩️ Dernier point** (sur la mesure allumée), **🗑️ Toute la distance 📐**, **🗑️ Toute la surface ⬛** ou **Tout effacer (📐 + ⬛)**.

---

## 🏗️ Mode multi-niveau (carrières à étages)

Sur un plan multi-niveau, chaque point, tracé, zone et structure appartient à un **niveau**, et l'itinéraire ne passe d'un niveau à l'autre que par une **jonction** — jamais parce que deux galeries se croisent à l'écran. Les galeries s'empilent dans l'ordre des niveaux (le niveau 0 par-dessus le −1).

Numérotation : **0** = niveau de référence, **1, 2…** au-dessus, **−1, −2…** en dessous.

### 🎯 Le niveau actif et la modale Niveaux

Une **pastille jaune** sous les boutons de zoom affiche le **niveau actif**. Un tap ouvre la modale **🏗️ Niveaux** :

- **🎯 Niveau actif (pour dessiner)** — tout ce que tu dessines prend ce niveau. **[ − ]** et **[ + ]** ajoutent un niveau en dessous ou au-dessus. Changer de niveau actif **annule le tracé en cours** et n'affiche plus que ce niveau.
- **👁️ Niveaux visibles (filtre)** — coche les niveaux à afficher (**Tous** / **Actif seul**). Décocher le **0** masque aussi l'image principale du plan, pour regarder un étage seul. Une jonction reste visible si l'un de ses deux niveaux l'est.

Si le plan contient des éléments à d'autres niveaux, la liste s'étend d'elle-même. Les mêmes réglages existent dans ≡ **Filtres**. À l'export image, **🎨 Avancé → 🏗️ Niveaux à exporter** choisit les niveaux indépendamment de l'affichage.

### 🪜 Tracer une jonction interniveau

Une jonction relie deux niveaux à l'endroit réel du passage (escalier, pente, puits, échelle) :

1. **🛣️ Tracés → 🪜 Jonction interniveau**
2. Choisis le **Niveau de départ** (ton niveau actif, d'origine) et le **Niveau d'arrivée** (l'ordre est indifférent : l'itinéraire l'emprunte dans les deux sens), puis **OK — Tracer la jonction**
3. Tape autant de points que tu veux, puis re-appuie sur **🪜** pour valider

Elle apparaît en magenta pointillé, un rond à chaque bout. **Sans jonction, aucun itinéraire ne change de niveau.** Deux escaliers entre les mêmes niveaux = deux jonctions : l'itinéraire prend la plus courte. Elle s'efface comme un tracé (🧹 Effacer et corriger).

### 🛠️ Côté créateur du plan

Le mode multi-niveau, le niveau de chaque calque image et celui des éléments des calques de données sont réglés par le créateur du plan dans le Générateur → 🔭 Pour aller plus loin › 🏗️ Créer ou modifier un plan. Sur un plan qui ne l'a pas activé, rien de tout cela n'apparaît ; activé plus tard, les éléments existants sont au niveau 0.

---

## 📔 Mes sorties et mes données

### 💾 Sauvegarde automatique

Tes annotations (points, tracés, zones, structures, mesures) s'enregistrent toutes seules dans le navigateur, à chaque modification, **séparément pour chaque plan** : revenir sur un plan quitté retrouve ce que tu y avais laissé.

À la réouverture (**▶️ Reprendre** sur l'accueil), une fenêtre résume ce qui a été restauré (« 3 points · 1 tracé · 2 zones ») et propose **🗑️ Effacer la session** (repartir de zéro sur ce plan) ou **✓ Continuer**. Échap ou un clic à côté = Continuer.

- Le chemin du tracker n'est pas restauré : relance le suivi et recale-toi.
- Pour garder une session à part, ou la passer à un autre appareil : **⬆️ Enregistrer → 💾 Exporter** (voir « ⬆️ Sauvegarder et partager »).

### 📔 Mon carnet — l'historique de tes sorties

La sauvegarde automatique garde **l'état** d'un plan ; le **carnet** garde **l'histoire** : chaque passage sur un plan devient une **sortie**, avec sa date, sa durée, la distance parcourue, ce que tu as ajouté, le tracé de ton déplacement (mini-carte), les photos prises pendant la sortie et une note libre que tu peux écrire quand tu veux. Effacer une session ne touche pas aux sorties déjà rangées.

**Y accéder :** tuile **📔 Mon carnet** dans la carte « 🧰 Outils » de l'accueil, sans charger de plan. Depuis un plan : **📊 Détails de la session** → section **📔 Sortie en cours**, avec les boutons **📔 Démarrer une sortie**, **🏁 Clôturer ma sortie** et **Affiner le tracé**.

**🚶 Sortie terrain ou 🖥️ travail sur plan ?** L'app fait la différence seule :
- tu t'es **déplacé** (tracker, ou un seul **📍 Je suis ici**) → **sortie terrain** ;
- tu as seulement **annoté sans bouger** → **travail sur plan**, rangé à part en bas du carnet.

Les totaux du carnet (sorties, temps, distance) ne comptent que le terrain. L'app s'est trompée ? Ouvre la fiche → **Classer en sortie terrain** (ou **Classer en travail sur plan**) ; les mêmes boutons 🚶 / 🖥️ sont dans 📊 Détails de la session. Ta correction n'est jamais recalculée.

**Quand une sortie est-elle rangée ?**
- **Automatiquement**, quand tu quittes le plan : elle est d'abord **mise en pause 2 heures** (voir « Reprise » ci-dessous), puis archivée si tu as parcouru **au moins 50 m**, **ou** travaillé **10 minutes** avec au moins un ajout. En dessous, rien n'est gardé : ouvrir un plan 20 secondes ne pollue pas le carnet.
- **À la main**, avec **🏁 Clôturer ma sortie** : elle est rangée sans condition et une nouvelle démarre. Pratique pour découper une journée en étapes.

L'interrupteur **📔 Tenir un carnet de mes sorties** est dans **⚙️ Configuration** (accueil), activé au départ. Décoché, plus rien ne s'ouvre tout seul ; tu peux toujours lancer une sortie avec **📔 Démarrer une sortie**.

#### 🏁 La distance quand le podomètre n'a rien vu

Téléphone en poche, le podomètre compte peu. Chaque **📍 Je suis ici** laisse un **repère daté**, et l'app relie ces repères **en suivant les galeries** (pas en ligne droite) : de A à C puis de C à B, elle compte A→C puis C→B.

- Pendant la sortie, le chiffre est **prudent** (à vol d'oiseau), pour que « Je suis ici » reste instantané. Le calcul dans les galeries se fait quand la sortie est rangée : la distance **augmente** à ce moment-là. Sur un très gros plan, l'app peut garder le vol d'oiseau plutôt que de se figer.
- **Affiner le tracé** fait ce calcul quand tu veux, et redessine le trajet dans la fiche. Sur un plan très volumineux, l'app prévient qu'elle va se bloquer quelques secondes et te laisse décider.
- À la clôture, l'app te demande **où tu es ressorti** : un clic sur la carte, et le dernier tronçon (après ton dernier repère) entre dans le total. **Passer** si tu clôtures depuis chez toi.
- Si le podomètre a mesuré entre deux repères, c'est lui qui compte, jamais les deux. Un clic sur la carte pour corriger ta position, ou le passage d'une liaison vers un autre plan, ne comptent pas comme un trajet.

La fiche dit d'où vient le chiffre :

| Ce qui est écrit | Ce que ça veut dire |
|---|---|
| *dont 900 m calculés dans les galeries entre 6 repères* | Trajet reconstitué sur tes tracés : fiable |
| *dont 900 m à vol d'oiseau entre 6 repères (non affinés)* | Ligne droite : **sous-estimé**, parfois de beaucoup |

> ⚠️ C'est une **reconstitution**, pas un relevé : l'app suppose le chemin le plus court entre deux repères. Détours, culs-de-sac, demi-tours sont sous-estimés. Le trajet redessiné n'apparaît que dans la fiche : tes exports et la heatmap gardent le tracé réellement enregistré. Sans aucun « Je suis ici », il ne reste que le podomètre.

#### ⏱️ La durée d'une sortie

Une sortie **terrain** est comptée **du départ à la fin** : téléphone en poche ou app en veille, le temps compte. Juste en dessous, la fiche donne le **temps d'app ouverte** : *3 h de sortie pour 12 min d'app*, c'est un podomètre qui n'a presque rien vu. Une session de **travail sur plan** garde, elle, le temps d'usage.

Tu as oublié **🏁 Clôturer ma sortie** en ressortant ? L'app a pris le dernier moment où elle était active, souvent la mise en veille du téléphone. Ouvre la fiche → **✏️ Corriger la fin** et saisis l'heure réelle : la durée est recalculée. Le temps d'app ouverte, lui, ne change pas, et une fin antérieure au départ est refusée.

#### 🔁 Sortie interrompue : reprise et fusion

- **L'app a été fermée par le téléphone** (un appel, une autre appli) : si tu reviens sur le même plan dans les **45 minutes**, la sortie **continue** au lieu d'en ouvrir une autre. Un message te le dit.
- **Tu ouvres un autre plan en route** : ta sortie est **mise en pause**. Reviens sur son plan dans les **2 heures** et elle reprend, compteurs et tracé compris ; le temps passé ailleurs compte dans sa durée. Le suivi, lui, s'arrête au changement de plan : à la reprise, l'app propose **▶️ Relancer le suivi**.
- Une sortie que tu as **clôturée toi-même** n'est jamais reprise.

Pour réunir des sorties déjà coupées : **📔 Mon carnet → 🔗 Fusionner des sorties**, coche-les (au moins 2) → **Fusionner**. Durées, distances, pas et ajouts s'additionnent ; la durée va du début de la première à la fin de la dernière ; les notes s'empilent ; photos et tracés sont réunis ; si un seul morceau était du terrain, l'ensemble l'est.

> ⚠️ **Irréversible** : les sorties d'origine disparaissent. L'app demande confirmation.

#### 📖 L'onglet Récits

Le second onglet du carnet, **📖 Récits**, rassemble les notes et les PDF du **Mode Histoire** de **tous tes plans, sans en charger aucun** : la note s'affiche mise en forme et se **modifie sur place** (c'est la même note que dans le plan), les PDF s'ouvrent, se suppriment (🗑️) ou s'ajoutent (**➕ Ajouter un PDF**). Un PDF fourni dans le ZIP d'un plan apparaît ici dès que tu as ouvert ce plan une fois.

**Bon à savoir :** tout reste sur ton appareil ; chaque sortie se supprime depuis sa fiche ; au-delà de **500 sorties**, les plus anciennes sont effacées ; le carnet voyage avec l'export de profil.

### 📊 Statistiques de session

En tête de **📊 Détails de la session** (en-tête de l'écran, ou la puce 📊 sur mobile) :

| Stat | Contenu |
|---|---|
| **Total** | Points + tracés + zones + structures, avec le détail par type |
| **Distance** | Longueur cumulée des tracés (en km au-delà de 1 000 m) |
| **Surface** | Aire cumulée des zones (en ha au-delà de 10 000 m²) |
| **Photos** | Photos attachées aux points |
| **Durée** | Temps écoulé depuis l'ouverture du plan |

Sur un plan multi-niveau, une répartition par niveau s'ajoute. **Copier** met un résumé texte dans le presse-papier (pour un message à ton binôme) ; **Exporter en TXT** le télécharge.

### 👤 Profil

Le **bandeau profil**, en haut de l'accueil, montre ton **avatar** (ta photo, ou ton initiale sur une couleur qui ne change pas tant que ton surnom ne change pas), ton **surnom** (modifiable) et une à trois statistiques. Un appui ouvre la fenêtre **👤 Profil** : surnom, photo, **🖼️ Fond d'écran de l'accueil**, ton **rang** et tes **🏆 Hauts faits**.

#### 📊 Tes statistiques

- **Compteurs** : plans, sessions, favoris, sauvegardes de session (10 au plus par plan, les plus anciennes partent), photos, et place occupée par tes données MyKTAMap.
- **📊 Mes plans** : un tableau, plan par plan, des points, tracés et de la distance (en m ou km si le plan est calibré), avec un total. Il se remplit un plan après l'autre pour ménager la mémoire. Un plan marqué ⚠️ n'a pas encore été ouvert : seules ses annotations sont comptées ; ouvre-le une fois pour compléter sa ligne.
- **📊 Répartition par catégorie** : des camemberts tous plans confondus (points par icône, tracés, zones, structures par type). Ils affichent les noms d'origine des types : un renommage fait dans la légende d'un plan reste visible dans les statistiques de ce plan. Même règle qu'au-dessus : un plan jamais ouvert ne compte que ses annotations.
- **🏷️ Filtre par étiquette**, au-dessus des camemberts : un clic garde les plans qui portent l'étiquette, un deuxième les exclut, un troisième revient à zéro ; tous les camemberts suivent, et l'exclusion l'emporte. Le camembert « Plans par étiquette » montre ce qu'il te reste à étiqueter. Le filtre repart à zéro à chaque ouverture.
- Un type personnalisé affiché par un identifiant (`cust-…`) ? Ouvre son plan une fois, ou touche **🔎 Retrouver les noms** : l'app lit tes plans sans les ouvrir un par un, après ton accord ; les noms trouvés sont gardés.
- **🎨 Stats du bandeau d'accueil** : choisis de 1 à 3 stats parmi ⏱️ Temps total, 💾 Sauvegarde et 🗺️ Plans visités, entre autres (au départ : temps et sauvegarde). Le bandeau suit aussitôt.

#### 📤 Exporter et importer ton profil

Dans la fenêtre Profil, **📤 Exporter mon profil** produit un fichier qui transporte tout vers un autre appareil : liste de plans et dossiers, préférences, favoris, sessions, sauvegardes, carnet, identité. Tu coches les sections ; la taille estimée s'affiche. Le code d'accès et le PIN ne sont jamais exportés.

- **PDF du Mode Histoire** : décochés au départ, car un plan peut en porter jusqu'à 100 Mo. Cochés, ils sont remis en place à l'import, sans doublon si tu réimportes.
- **Archives de plans** : coche les plans mémorisés à emporter (rien n'est coché au départ) ; l'export devient un `.zip` « profil complet » et l'import rattache chaque archive à son plan. Au-delà d'environ 50 Mo sur iPhone/iPad (500 Mo ailleurs), l'app demande confirmation. Si le navigateur a supprimé une archive, l'export te dit lesquelles manquent. Les plans en « re-sélection » n'y figurent pas : leur ZIP est sur ton disque, pas dans l'app.

**📥 Importer un profil** te laisse choisir les sections et le mode : **🔄 Merge** ajoute sans écraser (recommandé), **♻️ Replace** vide d'abord les sections cochées. En Merge, un plan qui a déjà son archive sur l'appareil garde la sienne. Un rechargement de l'app est proposé à la fin. Sur une installation qui ne propose que les plans de son serveur, l'import de profil est refusé (il pourrait masquer ces plans) ; l'export reste possible.

---

## ⬆️ Sauvegarder et partager

Tous les exports sont dans le groupe **⬆️ Enregistrer** de la barre latérale. Avant de partager une image, un PDF ou un KMZ, vérifie qu'il ne révèle rien de sensible (accès, lieu privé).

### 📤 Exporter ta session

**⬆️ → 💾 Exporter** ouvre une fenêtre à cinq onglets :

- **🚀 Full** — toute la session en un fichier, à réimporter plus tard : points, tracés, zones, structures, mesures et suivi du tracker (position, chemin, chronologie : le replay fonctionne après réimport). `.json`, ou `.zip` si tu coches les photos. L'option **🛡️ Anonymiser pour partage public** remplace les noms par des codes et retire le suivi.
- **🎨 Avancé** — tu choisis : points (par icône, y compris « sans tag »), tracés, zones et structures (par type), mesures, tracker (un compteur montre ce qu'il contient). Sortie en **un seul fichier session** réimportable, ou en **ZIP multi-fichiers** (un par catégorie).
- **🔄 Conversion** — transforme ta session en **calque de données** à intégrer à un plan (voir « 🏗️ Créer ou modifier un plan »). Même choix par catégorie et par icône ; granularité **Basique** (un fichier par catégorie) ou **Fine** (un fichier par type). Le tracker n'est jamais converti : une dérive figée dans un plan tromperait ses futurs utilisateurs. Une fois converties, ces données ne se modifient plus depuis l'app.
- **🔗 Fusion** — regroupe plusieurs calques de données (`.json` ou `.zip`, issus de plusieurs sessions) en un seul jeu par catégorie. Un aperçu donne les totaux et signale les identifiants de points en double (gardés tels quels). Aussi accessible sans plan ouvert : **📊 Éditeur de données → 🔗 Fusionner des calques de données**.
- **📡 Export externe** — KMZ ou GPX, voir plus bas.

### 🖼️ Exporter en image

**⬆️ → 🖼️ Exporter le plan en image**, deux modes :

- **⚡ Export rapide** — tout ce qui est visible (plan, calques, annotations, tracker), en PNG à la résolution d'origine. Un clic sur **Télécharger**.
- **🎨 Export avancé** — tu coches les calques d'image, les calques de données et tes annotations, et tu règles :
  - une **légende** posée sur le plan : position (un des 4 coins, ou 🎯 n'importe où), style (Opaque / Semi-transparent / Filigrane), taille (Compact / Standard / Large), contenu (icônes, tracés, zones, tag du tracker, nom, version, auteur et date du plan) ; ses libellés se personnalisent ;
  - le **format** : PNG, ou JPEG (plus léger) ;
  - la **résolution** : Originale, ½ ou ¼. L'app pré-coche la plus grande qui reste raisonnable et indique la taille et la mémoire nécessaires ; sur iPhone/iPad, les résolutions impossibles sont grisées.
  - Un aperçu se met à jour en direct.

### 🖨️ Exporter en PDF imprimable

**⬆️ → 📤 Exporter en PDF imprimable** : un PDF à imprimer pour le terrain, à envoyer à quelqu'un qui n'a pas l'app, ou à archiver.

- **Format** : A0 à A4, portrait ou paysage (A4 paysage au départ).
- **Contenu** : tes annotations, l'image du plan et ses calques, les calques de données, un en-tête (titre et informations du plan).
- **Qualité** : Standard ×1 (A3/A4), Haute définition ×2 (A0/A1, fichier plus lourd), Brouillon ×0,5. A0/A1 en ×2 peut prendre 30 à 60 secondes sur mobile.
- **🗺️ Légende** posée dans un coin (bas-gauche au départ), en trois tailles et quatre styles : **Pro (fond blanc)** pour l'impression (au départ), Sombre opaque, Sombre semi-transparent, Filigrane discret. Elle ne liste que ce qui figure vraiment sur le plan exporté.

Le PDF porte la mention « Généré par MyKTAMap · CC BY-NC-SA 4.0 · myktamap.fr » et s'appelle `<plan>_<date>.pdf`.

### 🌍 Exporter vers une autre app (KMZ, GPX)

**⬆️ → 💾 Exporter → 📡 Export externe** produit :
- un **KMZ** : ton plan et tes annotations posés sur le globe, pour **Google Earth**, **OsmAnd**, **Locus** ou **Avenza** ;
- un **GPX** : points et tracés, pour TopoDroid, OsmAnd, Strava… et réimportable dans MyKTAMap avec ses niveaux.

**Le plan doit être géoréférencé** : deux points dont tu connais les coordonnées GPS. Les champs sont pré-remplis avec le géoréférencement du plan (voir « ⚙️ Réglages ») et s'enregistrent pour ce plan. Pendant la saisie, un **🌐 Aperçu coins** donne la position des 4 coins, l'échelle, la rotation, et un lien **🔗 Voir le centre sur Google Maps** pour vérifier.

Contenu du KMZ :
- **🖼️ Image plan**, avec une **opacité** réglable (60 % au départ) pour voir le fond satellite au travers. Une très grande image est réduite automatiquement ; si c'est impossible, l'app te demande avant d'exporter.
- **📍 Points** (par icône), **🛣️ Tracés**, **⬛ Zones** et **🏛️ Structures** (par type), **🪜 Jonctions interniveau**, **🗺️ Itinéraire actif**, et sur un plan multi-niveau, les **🏗️ niveaux** à inclure (tous au départ, un dossier par niveau).

Tu peux ainsi n'exporter que les puits, ou que les zones inaccessibles. **Télécharger** produit `MyKTAMap_<plan>_<date>.kmz`.

> 💡 La projection est fidèle sur un plan régulier ; un plan étiré ou assemblé peut dériver aux extrémités. Un **point C**, dans le géoréférencement du plan, corrige ce type de déformation.

---

## ⬇️ Charger / Import

### 📥 Importer un fichier (session ou GPX)

**⬇️ Charger / Import → 📥 Importer un fichier** ouvre le choix du fichier ; l'app reconnaît son type.

- **Session MyKTAMap** (`.json`, ou `.zip` avec photos) : elle **remplace** ta session en cours. Un aperçu montre ce qu'elle contient ; une sauvegarde de ta session actuelle est prise juste avant. **Importer** pour valider, **Annuler** pour ne rien changer.
- **Fichier GPX** (TopoDroid, OsmAnd, Avenza, Strava, Garmin…) : ses points et tracés **s'ajoutent** à ta session. Le plan doit être géoréférencé. Un aperçu précède l'ajout, et **Ctrl+Z** l'annule.

Pour changer de plan, touche la **rose des vents 🧭** (retour à l'accueil) ou le **titre du plan** dans la barre du haut ; ta session est enregistrée avant le changement.

---

## ⚙️ Mes plans et réglages

### 📚 Ta liste de plans

L'accueil garde tous les plans que tu as chargés, depuis un serveur ou depuis ton appareil. Un appui sur la ligne charge le plan.

| Symbole | Signification |
|---|---|
| 🌐 | Plan proposé par le serveur |
| 💾 | Plan ZIP chargé depuis ton appareil |
| ✅ | Plan **mémorisé dans l'app** : rechargement immédiat, même hors connexion |
| 📁 | Plan non mémorisé : il faut re-sélectionner son ZIP à chaque chargement |
| 🔐 | Ancienne entrée « accès permanent » : à la prochaine re-sélection, elle passe en ✅ |

La mémorisation se règle dans **⚙️ Configuration** (« 💾 Mémoriser le plan dans l'app au premier chargement », activé au départ).

**Sur chaque ligne :**
- **⭐** épingle le plan en tête de liste (re-clic pour le retirer).
- **ℹ️** ouvre la fiche du plan : ses informations (version, auteur, taille, mode, dates…), un **✏️ nom d'affichage** local (40 caractères, vide = nom d'origine), ses **🏷️ Tags du plan** (séparés par des virgules, 12 au plus), le **Tuilage de ce plan** pour les très grandes images non découpées, la **💾 Disponibilité hors-ligne** d'un plan serveur, et **🗑️ Retirer de la liste**. Retirer un plan ne touche pas au ZIP sur ton disque, mais efface son archive mémorisée, sa session, son géoréférencement, ses photos et ses sauvegardes ; ses PDF d'histoire restent dans 📔 Mon carnet → 📖 Récits, sauf si tu coches leur suppression.

**Au-dessus de la liste :**
- **🔎 Filtrer par nom…** filtre pendant la frappe.
- **🌐 Afficher les plans serveur** masque ou réaffiche les plans découverts sur le serveur (rien n'est supprimé, le choix est gardé).
- Dès qu'un plan porte une étiquette, des **puces-filtres** apparaissent : touche-en une ou plusieurs pour ne voir que ces plans.

> 🌐 Les plans d'un serveur peuvent arriver déjà étiquetés. Dès que tu modifies les étiquettes d'un plan, ce sont les tiennes qui comptent, même vides. Pour retrouver celles du serveur, retire le plan de la liste : il sera redécouvert avec.

#### 📁 Ranger tes plans en dossiers

À droite de « 📚 Mes plans », le sélecteur **Tout | Dossiers**. En mode **Dossiers**, crée tes dossiers (➕), chacun avec une couleur reprise en pastille devant le nom du plan. Un plan est dans un seul dossier ; les autres vont dans « Non classés ».

- **Ranger** : **☑ Sélectionner** un ou plusieurs plans puis « Déplacer vers… », ou **glisser** la ligne sur un dossier (à la souris, ou au doigt après un appui long).
- **⋮** sur un dossier : renommer, couleur, ordre, supprimer (ses plans repassent en Non classés, aucun plan n'est supprimé).
- **🏷️ Règle par étiquette** (dans ⋮) : le dossier accueille tout seul les plans qui portent ces étiquettes. En mode Tout, des puces cochées proposent **📁 Créer un dossier depuis ces étiquettes**. Un rangement à la main l'emporte sur une règle ; la pastille est **pleine** pour un rangement explicite, **creuse** pour une règle.
- Les dossiers voyagent avec ton profil. Un serveur peut en proposer : tu ne peux ni les renommer ni les supprimer, mais tu y ranges ce que tu veux. L'import de plusieurs plans propose « Ranger dans : ».

#### 💾 Rendre un plan serveur disponible hors-ligne

Un plan **mémorisé** fonctionne déjà hors connexion. Un plan **serveur**, non : seul ce que tu as affiché est gardé, sans garantie, et un gros plan peut revenir **troué**. Dans sa fiche **ℹ️**, section **💾 Disponibilité hors-ligne**, **⬇️ Rendre disponible hors-ligne** télécharge tout (image, données, toutes les tuiles de tous les zooms) dans un espace qui survit aux mises à jour de l'app.

| Ce que tu vois | Ce que ça veut dire |
|---|---|
| **Non téléchargé** + ⬇️ | Seul ce que tu as affiché est gardé, sans garantie |
| **✅ Disponible hors-ligne** + ↻ / 🗑️ | Tout est là ; **↻ Mettre à jour** remplace le téléchargement |
| **⚠️ Téléchargement incomplet** + ⬇️ | Interrompu, ou fichiers effacés par le navigateur : complète-le |
| **✅ Disponible, mais des fichiers sont introuvables** + ↻ | Le serveur n'a pas fourni certains fichiers ; l'app les liste, le plan reste utilisable |

À l'ouverture de la fiche, l'app vérifie si le serveur a changé : **⚠️ Mise à jour disponible**, **✓ À jour**, ou **Impossible de vérifier** (hors connexion). Elle ne dit jamais « à jour » sans avoir vérifié, et si le navigateur a fait le ménage, elle te repropose le téléchargement.

### ⚙️ Configuration (accueil) — toute l'app

Le bouton **⚙️** en haut de l'accueil ouvre **⚙️ Configuration** : les réglages qui valent pour **tous tes plans**.

- **🌍 Application** — la **langue** : Français, English, Español. Elle s'applique tout de suite, guide et tutoriel compris ; le drapeau de la fenêtre 📖 Documentation change la langue du seul guide. Elle se choisit aussi sur l'écran de déverrouillage, et reste gardée en mode incognito.
- **🎨 Affichage** :
  - **📐 Adapter la taille des icônes au zoom** (activé au départ) ;
  - **❓ Bouton d'aide dans les fenêtres** (activé) : un ❓ dans le titre des fenêtres qui ont une page d'aide, qui ouvre directement la bonne page ;
  - **🔔 Notifications** : **Toutes**, **Essentielles** (au départ : plus de message pour confirmer un geste que tu viens de faire) ou **Silence** (seulement l'important : batterie faible, capteur refusé, erreurs). Les alertes du serveur et les fenêtres qui attendent une décision ne sont jamais coupées ;
  - **🪟 Ancrer les panneaux d'outils au bouton** : les panneaux Tracés, Zones et Structures s'ouvrent collés à leur bouton au lieu d'être centrés (confortable sur grand écran, déconseillé sur téléphone) ;
  - **🧲 Magnétisme au dessin** et sa distance : un clic proche d'un point existant s'y colle, pour que tes galeries se rejoignent vraiment ;
  - **☀️ Thème clair** ;
  - **🔆 Garder l'écran allumé** tant que l'app est ouverte. Le tracker propose aussi de l'activer à son démarrage.
- **🧩 Fonctionnalités optionnelles** — Replay, Heatmap, batterie et vibration, toutes désactivées au départ : voir « 🔭 Pour aller plus loin ».
- **🔒 Confidentialité & sécurité** :
  - **📔 Tenir un carnet de mes sorties** (activé, voir « 📔 Mon carnet ») ;
  - **💾 Mémoriser le plan dans l'app au premier chargement** (activé) ;
  - **🕵️ Mode incognito** : ouvre une nouvelle fenêtre où rien n'est enregistré ;
  - **🔐 Code d'accès local** (PIN, Face ID) : voir « 🔭 Pour aller plus loin » ;
  - **🔒 Confidentialité & Audit** : **📋 Voir le journal réseau**, **📖 Que fait l'app sur le réseau ?** et la case **🗺️ Vue OSM** (voir « 🔴 Avertissements importants ») — l'app n'envoie aucune de tes données ; le seul site extérieur qu'elle contacte est OpenStreetMap (fond de carte de la Vue OSM), que cette case coupe, et le journal réseau te le montre ;
  - **📚 Plans serveur** : **🚫 Ne pas charger les plans serveur au démarrage**, si tu n'utilises que tes propres plans (après rechargement, ils disparaissent de la liste et des statistiques).
- **🛠️ Système & maintenance** :
  - **🛠️ Mode Développeur** (protégé par mot de passe) : voir « 🔭 Pour aller plus loin » ;
  - **📊 Voir l'état mémoire** : ce que l'app occupe sur ton appareil, avec **📋 Copier le rapport** pour signaler un problème ;
  - **🆘 Dépannage** : une fenêtre qui range, du plus doux au plus radical, **🔄 Forcer la mise à jour**, **🆘 Ouvrir l'outil Kill SW** et **💥 Tout réinitialiser** — voir « 🆘 En cas de problème ».

### ⚙️ Réglages (en mode carte) — ce plan

Le bouton **⚙️ Réglages** de la barre latérale ouvre les réglages du **plan ouvert**. Chaque groupe annonce sa portée — **📍 ce plan** ou **🌍 tous les plans** — et se replie d'un appui sur son titre.

#### ✓ Tout s'enregistre dès la modification

Pas de bouton Appliquer : chaque champ s'enregistre aussitôt (un éclair vert le confirme). Une valeur hors limites passe en rouge, le message donne les limites et l'ancienne valeur reste. **Échap**, **✕** ou **Fermer** : rien n'est perdu.

- **🌍 Application** — **Activer le mode présentation** (plein écran sans interface ; touche **F** sur PC ; sortie par **F**, **Échap** ou le ✕ flottant). **🏠 Réglés depuis l'accueil** montre en lecture les réglages de ⚙️ Configuration, avec un bouton pour y aller (ta session est gardée).
- **📐 Plan : échelle & géolocalisation** *(ce plan)* :
  - **Échelle**, avec **🎯** pour la calibrer (voir ci-dessous) ;
  - **🧭 Calibration du Nord**, si le haut du plan n'est pas le Nord : un angle, ou **📐 Calibrer (2 clics)** (Sud puis Nord sur la carte), **↺ Reset** pour revenir à 0. La boussole, elle, montre toujours le vrai Nord ;
  - **🌐 Géoréférencement GPS** : son état s'affiche (non géoréférencé, points A et B, A, B et C, B estimé) et **🌐 Ouvrir le géoréférencement…** ouvre sa fenêtre. Pour les points A et B : **🔍 Chercher un point** ou **📍 Cliquer carte** remplit la position sur le plan, puis tu colles les coordonnées GPS au format Google Maps (`48.856600, 2.352200`). Choisis-les **éloignés** l'un de l'autre. **Estimer B** déduit B de A, de l'échelle et du Nord : une estimation, à vérifier en Vue OSM. Le **📐 Point C (optionnel)**, loin de la ligne A-B, corrige un plan déformé (assemblage étiré) pour la Vue OSM, les exports et le Mode Secours. **💾 Sauvegarder le calibrage** / **🗑️ Effacer**. Ce géoréférencement sert à la Vue OSM, aux exports KMZ et GPX et à l'import GPX.
- **📍 Navigation & tracker** *(📍/🌍 selon la ligne)* :
  - **🧭 Position initiale du tracker** *(ce plan)* : X/Y, **🔍 Choisir via un point** ou **📍 Cliquer sur la carte**. Changer le départ fait repartir le suivi de là (le parcours en cours est effacé) ;
  - **👣 Détection des pas** *(tous les plans)* : longueur du pas (0 à 1,5 m), seuil (10 à 30), délai (300 à 3 000 ms) ;
  - **🧭 Navigation intelligente** *(ce plan)* : voir « 🔭 Pour aller plus loin ».
- **🎨 Affichage** — **⚪ Afficher les ronds aux intersections** *(ce plan)* ; **🎤 Commandes vocales (BETA)** *(tous les plans)* : un bouton 🎤 pour piloter l'app à la voix, dis « aide » pour la liste des commandes. Une option que ton navigateur ne gère pas reste visible, grisée, avec la raison.
- **🚀 Performance** *(ce plan)* — le **🚀 Mode ULTRA** pour les gros plans qui font planter le téléphone (voir « 🔭 Pour aller plus loin ») ; sur un plan multi-niveau, **🏗️ Afficher tous les niveaux au lancement**.
- **🧩 Fonctionnalités optionnelles** et **🔒 Confidentialité & sécurité** — les mêmes cases que dans ⚙️ Configuration (options, mode incognito).
- **🛠️ Système & maintenance** — le **mode performance** du plan, en lecture seule.

En bas, **↺ Valeurs par défaut** (après confirmation) remet ce plan à ses valeurs d'origine (échelle, départ, navigation intelligente, ronds, Nord), la détection des pas aux valeurs de l'app, et replace le suivi au départ. Les réglages de l'accueil ne bougent pas.

#### 🎯 Calibrer l'échelle

L'app affiche 100 m là où tu sais qu'il y en a 150 ?

1. Mesure la distance avec **📐**.
2. **⚙️ Réglages → 🎯** à côté de l'échelle.
3. Saisis la distance affichée (100) et la distance réelle (150) : la nouvelle échelle s'affiche.
4. **Appliquer** : elle est enregistrée aussitôt.

Plus la distance mesurée est longue, plus le résultat est précis.

---

## 📚 Aide et documentation

### 🎓 Revoir le tutoriel

Le tutoriel d'accueil se rejoue à tout moment : **📖 Documentation** → bouton **🎓** dans la ligne de titre, à côté du choix de langue.

### 🔎 Chercher dans la documentation

En haut de la fenêtre 📖, le champ **🔎 Chercher** cherche dans tout le texte : les résultats sont surlignés, **Entrée** ou ↓ passe au suivant, le compteur indique « i / n » et le sommaire estompe les parties sans résultat. Les accents ne comptent pas : « reglages » trouve « Réglages ». La recherche du groupe ❓ Aide cherche dans les titres et le contenu des pages d'aide.

### 🤖 Aide IA

Dans **📖 Documentation**, le bouton **🤖** (ligne de titre) télécharge un fichier `.md` qui décrit tout ce que fait l'app : ce guide, une FAQ et des consignes pour l'IA.

1. **📥 Télécharger le contexte (.md)**.
2. Ouvre l'IA conversationnelle de ton choix (ChatGPT, Claude, Gemini, Le Chat…) et joins-lui le fichier en début de conversation.
3. Pose tes questions : *« Comment ajouter un point ? »*, *« Mon plan plante, pourquoi ? »*.

Le fichier ne contient que la documentation, aucune de tes données : tu peux le partager. L'IA, elle, peut être payante selon le service.

---

## 🆘 En cas de problème

### 💥 L'application s'arrête brusquement

Sur téléphone, le système ferme les applis qui prennent trop de mémoire. Au lancement suivant, une fenêtre rouge **« ATTENTION — ARRÊT BRUTAL DÉTECTÉ »** te l'explique. Pour éviter que ça recommence :
- ferme les autres applis et les onglets inutiles ;
- active le **🚀 Mode ULTRA** sur ce plan (**⚙️ Réglages → 🚀 Performance**) ;
- exporte régulièrement ta session ;
- si ça continue sur le même plan, il doit être **découpé à la génération** : demande-le à son créateur.

### ⚠️ Un plan ne charge pas

Une fenêtre **« ⚠️ Plan introuvable »** veut dire que ses données ne sont plus accessibles : navigateur vidé ou stockage plein, liste importée d'un autre appareil sans les ZIP, changement de navigateur, plan retiré du serveur. Trois choix :
- **🔄 Réessayer** (plan serveur momentanément injoignable) ;
- **📁 Re-sélectionner le ZIP** (plan local) : s'il était mémorisé, il le redevient ;
- **🗑️ Retirer de la liste**, si tu n'as plus le plan.

Un ZIP refusé au chargement est sans doute incomplet ou abîmé : redemande-le à son créateur. Un plan peut aussi avoir été **révoqué** par son auteur : voir « 🔭 Pour aller plus loin → 🛡️ Plans révoqués ».

### 🔍 L'image du plan est floue

Sur un très grand plan non découpé, l'app réduit l'image pour qu'elle tienne en mémoire. Pour une image nette, le plan doit être découpé à la génération : demande-le à son créateur.

### 🧭 Le tracker dérive trop vite

Recale ta position souvent (**📍 Je suis ici**), vérifie l'échelle (🎯 ci-dessus) et la longueur du pas (**⚙️ Réglages → 📍 Navigation & tracker**).

### 🔘 Un mode reste actif

Touche à nouveau le bouton actif (en vert) pour le couper.

### 🔑 Le code d'accès est refusé

Si l'app t'est fournie par une installation qui a son propre mot de passe (association, club), c'est **ce mot de passe** qu'il faut : le code communautaire n'ouvre pas, et une licence pro non plus. Si l'installation le change, l'app le redemande au démarrage suivant ; hors connexion, ton accès reste valable.

### 🔄 L'app ne se met pas à jour, ou reste bloquée

Dans l'ordre, en gardant tes données :
1. **⚙️ Configuration → 🆘 Dépannage → 🔄 Forcer la mise à jour** : retélécharge l'app sans toucher à tes plans, sessions, préférences ni codes. Une connexion est nécessaire.
2. Si l'app reste coincée (page blanche, accueil sans mise en forme) : vérifie ta connexion (coupe ton VPN, change de réseau), puis **⚙️ Configuration → 🆘 Dépannage → 🆘 Ouvrir l'outil Kill SW**.
3. Si l'app ne s'ouvre même plus : ouvre la **page de secours** dans un onglet privé du navigateur (pas l'app installée) : **https://myktamap.fr/killsw.html** (son adresse est aussi rappelée en bas de la fenêtre 🆘 Dépannage). Elle vide le cache de l'app **sans toucher à tes données** (plans, sessions, photos) et propose **🚀 Recharger l'app**.

Ces outils ne suppriment **aucune** donnée (plans mémorisés, sessions, photos, carnet, préférences). Par précaution, **📤 Exporter mon profil** avant.

### 💥 Tout réinitialiser

**⚙️ Configuration → 🆘 Dépannage → 💥 Tout réinitialiser** remet l'app à l'état d'un premier lancement. **Irréversible** : il efface ta liste de plans et leurs archives, tes sessions et leurs sauvegardes, les photos, le carnet et les PDF d'histoire, ton profil (rang, hauts faits, avatar, fond d'écran), les scénarios du Mode Secours, tes préférences, ton PIN, et l'app elle-même (à retélécharger).

- La première fenêtre propose **📤 Exporter mon profil d'abord**.
- Elle affiche aussi le **code d'accès communautaire**, redemandé au redémarrage : **note-le avant de confirmer**, sinon tu ne pourras plus entrer.
- Deux confirmations sont demandées. Fais-le **avec une connexion** : si tu es hors ligne, une fenêtre rouge te prévient que l'app sera inutilisable jusqu'au retour du réseau.

À ne pas confondre avec **↺ Valeurs par défaut** de ⚙️ Réglages, qui ne touche qu'aux réglages du plan ouvert.

### ✉️ Problème non résolu

Écris à **contact@myktamap.fr** : ce que tu faisais, ton téléphone et ton navigateur, et une capture si possible (le rapport de **📊 Voir l'état mémoire** aide aussi).

---

## 🔭 Pour aller plus loin

Ce chapitre regroupe ce dont tu n'as pas besoin au quotidien : les **fonctions désactivées par défaut** (à activer si elles te servent), le **Mode Secours**, les outils **pour les créateurs de plans**, puis l'**hébergement et l'administration** (serveur, licence pro, plans révoqués, journaux de diagnostic).

### 🧩 Fonctionnalités optionnelles

Quatre fonctions secondaires sont **désactivées par défaut**, pour garder l'application légère. Elles se cochent dans **⚙️ Configuration** de l'accueil, groupe **🧩 Fonctionnalités optionnelles**, ou dans **⚙️ Réglages** une fois un plan ouvert : c'est le même réglage, valable pour **tous les plans**.

| Option | Ce que ça ajoute |
|---|---|
| **🎬 Replay du tracker** | La tuile 🎬 du menu 🧭 Tracker : rejouer ta session de suivi |
| **🔥 Heatmap** | La tuile 🔥 du menu 🧭 Tracker : carte de densité de passage |
| **🔋 Niveau de batterie** | La charge restante en haut de l'écran, et une alerte sous 20 %, 10 % et 5 % |
| **📳 Vibration haptique** | Une petite vibration qui confirme certaines actions |

> ⚡ Replay et Heatmap apparaissent ou disparaissent à la prochaine ouverture du menu 🧭 Tracker. La batterie prend effet au **prochain lancement** de l'app.

#### ⛔ « Capteur refusé »

Si la batterie ou la vibration s'affiche **grisée** avec « Capteur refusé par iOS » ou « par cet appareil », c'est que **ton système ne donne pas ce capteur aux pages web**. Apple ne fournit ni la vibration ni le niveau de batterie à un site, même installé en application.

#### 🎬 Replay du tracker

La tuile **🎬** du menu **🧭 Tracker** ouvre une fenêtre plein écran qui **rejoue ta session de suivi** : le marqueur jaune refait ton trajet et la trace s'allonge au fur et à mesure.

- **Commandes** : curseur de temps, ⏮ ▶️ ⏸ ⏭, vitesse de 0.5× à 10×. Au ▶️, la fenêtre se réduit en bas de l'écran pour laisser voir la carte (bouton **⛶** pour basculer).
- **Clavier** : Espace = lecture / pause · ← → = reculer / avancer d'une seconde · Échap = fermer.
- **📤 Exporter CSV** : un tableau horodaté des positions (démarrage, chaque pas, chaque recalage, et le niveau sur un plan multi-niveau), lisible dans un tableur.
- Un recalage est un saut : aucune ligne n'est dessinée entre l'ancienne et la nouvelle position.
- La session rejouée n'est **pas conservée** : elle repart à zéro au rechargement de l'app ou au changement de plan.

#### 🔥 Heatmap

La tuile **🔥 Heatmap** du menu **🧭 Tracker** colore le plan selon la fréquentation : **rouge = très fréquenté, bleu = peu exploré**. L'échelle s'adapte toute seule au plan.

- **Sources** (combinables) : le trajet du tracker, tes points, tracés, zones et structures de session, et les données du plan. Les recalages, les démarrages et les pauses de plus de 5 min ne produisent pas de chaleur.
- **Rayon** et **Intensité** se règlent en direct : si tout est pâle, monte l'intensité ; si tout est rouge, baisse-la.
- Sur un **plan multi-niveau**, une ligne **🏗️ Niveaux à inclure** permet de n'en garder que certains (les niveaux visibles sont pré-cochés) : pratique pour comparer deux étages.
- Usages : repérer les axes vraiment empruntés, ou les secteurs sous-cartographiés à revoir sur le terrain.

La heatmap est **purement visuelle** : elle ne modifie ni le plan, ni tes annotations, ni les exports. Ferme la fenêtre pour la masquer.

> 🚨 Le **Mode Secours** garde sa propre heatmap d'activité, que cette option soit cochée ou non.

#### 🔋 Niveau de batterie

L'indicateur apparaît en haut de l'écran (`⚡ 78%` en charge, `🪫 23%` en décharge, couleur selon le niveau) et dans l'**affichage XL d'urgence**.

| Niveau | Alerte |
|---|---|
| 20 % | Message : pense au Mode Performance ULTRA pour économiser |
| 10 % | Message : active ULTRA et envisage d'arrêter le tracker, gourmand en capteurs |
| 5 % | Fenêtre rouge **🪫 Batterie critique** : sauvegarde ta session, note ta position, envisage de remonter |

Chaque alerte ne s'affiche **qu'une fois** par décharge ; elles repartent à zéro quand tu remets le téléphone en charge.

Le niveau de batterie n'est donné aux pages web que par **Chrome, Edge et Samsung Internet**. Sur **Safari (iPhone, iPad, Mac)** et **Firefox**, l'indicateur reste masqué, y compris dans l'affichage XL d'urgence.

#### 📳 Vibration haptique

Une petite vibration confirme les actions : étape d'itinéraire atteinte, recalage, validation d'une étape, alertes du Mode Secours (équipe en retard, membres manquants).

> 🚨 **Les alertes de survie vibrent toujours**, même option décochée : sortie d'urgence trouvée ou introuvable, alerte critique diffusée.

Sur iPhone, l'option est grisée (voir « Capteur refusé » ci-dessus).

### 🧭 Navigation intelligente

Le tracker estime ta position avec **tes pas et la boussole**, ce qui **dérive** avec le temps. Si ton plan contient des **tracés de galeries**, la navigation intelligente recale en continu ta position **sur la galerie la plus proche**.

**Activation** : **⚙️ Réglages** → **📍 Navigation & tracker** → **🧭 Caler la position sur les tracés**. **Désactivée par défaut**, et réglée **pour chaque plan** : elle dépend de la qualité des tracés de ce plan.

- En avançant, ta position suit la galerie ; à un **croisement**, l'app choisit la branche qui correspond à ta direction de marche.
- Si tu sors des galeries tracées, le tracker repasse en mode classique, puis se recale dès que tu reviens près d'un tracé.
- Sans tracés sur le plan, l'option n'a aucun effet.
- Deux réglages experts l'accompagnent : la **tolérance latérale** (distance au tracé avant de décrocher) et le **poids du cap** aux croisements. En cas de souci, remets leurs valeurs par défaut.

> 💡 Le **recalage manuel (📍)** reste ton meilleur allié : dès que tu reconnais un repère, recale-toi, la navigation intelligente repart d'une base saine.

### 🗺️ « Plan orienté » — la carte tourne avec toi

Dans le menu 🧭 Tracker, la tuile **🗺️ Plan orienté** fait **tourner la carte** pendant le suivi, pour que ta direction de marche pointe toujours vers le haut de l'écran, comme un GPS de voiture.

- **Désactivé par défaut** ; ton choix est retenu sur cet appareil.
- La carte ne tourne **que pendant le suivi** et se remet droite à l'arrêt du tracker.
- Elle **te suit** : si tu la déplaces à la main, un bouton **🎯 Recentrer** te ramène sur ta position.
- Les textes restent lisibles : mesures et fiches de points ne tournent pas avec la carte.
- La carte se remet droite dès que tu prends un outil qui demande de cliquer (mesure, dessin, recalage) ou que tu ouvres un mode plein écran.

⚠️ La rotation suit ta boussole : **près de grandes masses métalliques** (rails, ferraillage), elle peut devenir approximative, comme le reste du tracker.

### 🔐 Code d'accès local (PIN / Face ID)

Verrouille l'app à chaque démarrage avec un code de 4 à 6 chiffres, ou **Face ID / Touch ID / empreinte / Windows Hello** si ton appareil le permet. Tout reste sur l'appareil : rien n'est envoyé sur Internet, et **aucune récupération n'est possible en cas d'oubli**.

> ⚠️ **C'est une barrière d'usage, pas un chiffrement.** Elle empêche d'ouvrir l'app normalement, mais tes photos et sessions restent lisibles dans le navigateur par quelqu'un qui s'y connaît.

**Activer** : depuis l'accueil, **⚙️ Configuration** → **🔐 Code d'accès local** → **🔐 Activer le code d'accès**. Choisis ton code, confirme-le, puis accepte la biométrie si elle t'est proposée. **Note ton code** en lieu sûr.

**Au démarrage**, l'écran de verrouillage suit l'écran de démarrage : la biométrie se lance d'elle-même (tu peux l'annuler et saisir ton code), sinon tu tapes ton code. Pour reverrouiller, ferme complètement l'app (ou recharge la page) : le code est redemandé à l'ouverture suivante.

**Modifier ou désactiver** : même section, **✏️ Modifier le code** ou **🔓 Désactiver**, après validation par biométrie ou par le code actuel.

**5 codes faux à la suite** verrouillent l'app **temporairement** : 10 min, puis 1 h, 6 h et 24 h à chaque nouvelle série. Un compte à rebours s'affiche et le pavé revient seul à la fin du délai ; un code juste remet tout à zéro. Les échecs de biométrie ne comptent pas. Un code oublié ne se récupère pas : seul l'effacement des données du site dans les réglages du navigateur lève le verrou, et il efface tout (plans, sessions, carnet).

### 🚑 Mode Secours — coordonner une recherche

> **Pour qui** : celui qui organise la recherche d'une personne disparue sous terre, et les équipes qui descendent la chercher.
>
> **Quand** : quelqu'un d'autre est perdu. Si c'est *toi* qui es perdu, c'est ⛑️ Je suis perdu.
>
> **Prérequis** : le **même plan** sur chaque téléphone, disponible **hors-ligne** — il n'y a pas de réseau sous terre.
>
> **Prépare-le à froid** : monte un ou deux scénarios sur tes plans habituels avant tout incident. Le jour J, l'app doit être prête en 30 secondes.

Ouverture : menu **🧭 Tracker** → en bas, sur fond rouge, **🚨 Mode Secours — Plans de recherche (équipes + zones)**.

#### 🧭 Comment ça s'organise

Trois rôles, chacun sur son téléphone :

| Rôle | Qui | Ce qu'il fait |
|---|---|---|
| 👤 **Opérateur de surface** | le PC, en surface | prépare le scénario, suit toutes les équipes, consigne tout, rassemble les rapports |
| 🚨 **Équipe sur le terrain** | chaque équipe qui descend | suit son parcours étape par étape, note ce qu'elle voit |
| 🚑 **Secouriste libre** | un renfort sans équipe assignée | prend des notes horodatées, sans parcours |

Le cycle : **préparer** le scénario → le **transmettre** aux équipes avant de descendre → **suivre** l'intervention → **clore** et faire le rapport.

#### 🧰 1. Préparer un scénario

##### 📝 Créer un scénario

- **➕ Nouveau scénario** : un nom, l'heure de l'incident et des notes de contexte (facultatives).
- **Depuis ⛑️ Je suis perdu** : le bouton **🚨 Lancer un plan de secours (équipes + zones)** crée le scénario tout prêt — dernière position connue, zone d'incertitude (cercle sur la carte), heure de l'incident et notes déduites. Il faut d'abord y avoir défini une dernière position connue.
- **🗐 Dupliquer** clone un scénario pour tester une autre hypothèse (« parti par l'est » / « parti par le sud ») sans toucher l'original.
- **10 scénarios par plan** au plus : au-delà, le plus ancien est effacé. Jamais un scénario en cours, celui que tu as ouvert, le plus récent, ni une intervention terminée dont aucun rapport n'est encore sorti du téléphone.

Le scénario s'édite en trois blocs : **📝 Contexte de l'incident**, **🚨 Équipes**, **📤 Exporter ce scénario**. Dans le Contexte, **🔍 Outils d'analyse → 🔥 Afficher la heatmap d'activité** montre où l'activité a été enregistrée (suivi, points, tracés) : si la personne disparue utilisait MyKTAMap et t'a transmis sa session, tu vois où elle est passée.

##### 👥 Les équipes

**➕ Ajouter une équipe**, puis sur sa fiche :

- **Nom** (laisse vide : Alpha, Bravo, Charlie…) et **🎨 Couleur**, parmi 10 couleurs fixes ;
- **👥 Membres** (séparés par des virgules), **👤 Chef**, **Effectif** — c'est l'effectif qui permet de compter les présents à la rentrée ;
- **Retour impératif** : heure fixée par le chef (autonomie des éclairages, relève), elle prime sur la durée estimée pour les alertes de retard ;
- **Niveau** de référence sur un plan multiniveau (ou « Sans niveau » si l'équipe change d'étage) ;
- **📍 GPS surface** (facultatif, cf. § 4).

Sur un plan multiniveau, **🏗️ Auto : 1 équipe par niveau** crée une équipe par niveau qui contient quelque chose. Les équipes se replient (▾/▸, « ▸ Tout replier ») pour garder la liste lisible.

##### 🗺️ Parcours, zone et itinéraire

- **🗺️ Parcours** : touche **Entrée**, **➕ Ajouter une étape intermédiaire**, puis **Sortie**. Pour chaque point : tes **⭐ favoris** du plan en un toucher, la recherche, ou **📍 Cliquer sur la carte** (le point s'aimante au POI le plus proche). Toucher un POI le prend comme point, sans ouvrir sa fiche. Même entrée et même sortie = boucle. Depuis la recherche de l'app, le bouton 📌 assigne un point à une équipe en deux touchers.
- **⬛ Définir zone** : soit un **polygone** (un toucher par sommet, double-toucher pour fermer), soit une **sélection de tracés** (touche chaque galerie, re-touche pour la retirer). Les zones des autres équipes s'affichent en pointillé pour caler les limites. Une galerie du plan se retrouve à l'identique sur tous les téléphones qui ont ce plan ; un tracé ajouté à la main sur un seul appareil n'existe que sur lui. Sur un plan multiniveau, la zone vaut **au niveau où tu l'as dessinée** — coche « Zone sur tous les niveaux » pour l'étendre.
- **✨ POI de la zone** ajoute tous les points de la zone comme étapes, de proche en proche depuis l'entrée.
- **🗺️ Calc. itinéraire** calcule le chemin par les galeries, de l'entrée à la sortie en passant par les étapes, avec distance et durée. Il **contourne les étapes et les zones des autres équipes** ; s'il ne peut pas, il le signale. Il liste aussi **les étapes à plus de 25 m d'une galerie** : corrige-les avant de descendre. Il prévient enfin quand des galeries d'un autre niveau passent sous la zone sans qu'aucun parcours n'y descende.
- **⏱️ Durées estimées** (réglages propres au scénario, transmis avec lui) : **vitesse d'approche** hors de la zone (3 km/h par défaut), **vitesse de fouille** dans la zone (1,5 km/h), **pause par étape** (0) et **alerte rouge après** (30 min de retard).
- **🗺️ Voir sur carte** affiche zones, entrées, sorties et itinéraires de toutes les équipes, chacune dans sa couleur.

##### 📊 Vérifier la couverture

Le bloc **📊 Couverture** donne, par niveau : la longueur de galeries, la part **dans une zone**, la part **sur un parcours** et la longueur affectée à deux équipes. Seule la part « sur un parcours » sera réellement fouillée : 86 % des galeries dans une zone peut ne faire que 24 % sur un parcours. Il liste aussi les POI situés dans la zone d'une équipe mais hors de son parcours, et ceux visités par plusieurs équipes. **🗺️ Surligner les galeries hors parcours** les montre en rouge au niveau affiché, pour préparer la phase suivante. C'est une aide à la lecture : rien n'est affecté automatiquement.

##### 📋 Plusieurs phases

Une intervention peut s'enchaîner en phases, avec un debrief entre chaque — par exemple, phase 1 : une équipe balaie les axes principaux ; phase 2 : plusieurs équipes fouillent les chambres signalées. Sans besoin, ignore-les : un scénario a toujours une phase, et les boutons de phase n'apparaissent qu'à partir de deux.

Dans **📋 Phases**, **➕ Ajouter une phase** : un nom, puis coche les **équipes participantes**. Les équipes sont définies une fois pour tout le scénario ; une même équipe peut participer à plusieurs phases. ✏️ renomme ou change les équipes ; 🗑️ supprime, sauf la dernière phase, la phase active ou une phase déjà démarrée. Pendant l'intervention, une pastille ambrée en tête des vues rappelle la phase active et son rang.

#### 📤 2. Transmettre avant de descendre

- **📤 Export .mkmsec.json** : envoie ce fichier à chaque équipe (messagerie, mail, câble). Sur son téléphone, l'équipe ouvre 🚨 Mode Secours → **📥 Importer un plan**, vérifie l'aperçu, puis **✓ Importer ce scénario**. L'import garde le lien avec le PC : c'est ce qui permettra à l'opérateur d'accepter son rapport. Si le scénario est déjà sur le téléphone, choisis **Remplacer** (recommandé : garde le lien, mais efface les saisies d'intervention déjà faites sur ce téléphone) plutôt qu'**Importer comme copie** (le rapport de cette copie sera refusé). L'aperçu prévient si le fichier vient d'un autre plan ou d'une autre version du plan.
- ⚠️ **Après une mise à jour de l'application, réimporte le scénario sur chaque téléphone avant l'intervention** : sinon le PC peut ne pas réussir à fusionner les rapports.
- **Hors-ligne** : au lancement, l'app prévient si le plan n'est pas entièrement disponible hors-ligne sur l'appareil ; télécharge-le depuis **ℹ️ Infos du plan** avant de descendre. Pour la carte de surface, ouvre la **🌍 Vue OSM** tant que tu as du réseau et touche **💾 Sauvegarder hors-ligne** (détails dans la section Vue OSM).
- **📄 Export PDF (1 page/équipe)** : une fiche par équipe, à imprimer ou à garder sur le téléphone — contexte, membres, chef et effectif, retour impératif, mission, carte de la zone, étapes, **feuille de route** carrefour par carrefour (changements de niveau compris, si l'itinéraire est calculé) et un cadre « Observations » à remplir au stylo.
- **🌍 Export KMZ géolocalisé** : le scénario pour Google Earth, OsmAnd ou Avenza — un dossier par équipe (points, zone, itinéraire) sur le plan en fond. Les itinéraires manquants sont calculés avant l'export, et MyKTAMap relit ce KMZ avec le scénario. Il faut un plan calibré avec deux points GPS (onglet 🌍 KMZ de l'export de session).

#### 🔦 3. Sur le terrain

##### 🚀 Lancer et choisir son rôle

**🚀 Lancer le plan de secours** (bandeau en tête du scénario), puis choisis ton rôle : 👤 Opérateur de surface, 🚨 Équipe sur le terrain (et laquelle), ou 🚑 Secouriste libre. Tu peux changer de rôle plus tard sans perdre ce qui a été saisi.

En rôle équipe, tu es **placé à l'entrée de ton équipe** — d'office si ta position n'était pas encore confirmée, sinon l'app te le propose (« Me placer à l'entrée » / « Garder ma position »). Un message unique résume le lancement.

Fermer la fenêtre ne retire rien : ta zone et ton parcours restent sur la carte (l'équipe voit la sienne, l'opérateur toutes), même après un rechargement. En bas de l'écran, la pastille **🚨 Secours · Alpha · 3/8 ›** rappelle que l'intervention tourne ; la toucher te ramène aux étapes à valider. **⏸️ Pause** fige le chronomètre, **▶️ Reprendre** le relance : le temps de pause n'est pas compté.

##### 🚨 Côté équipe

La vue montre ton parcours étape par étape (Entrée, 1…N, Sortie — le même numéro partout). À chaque étape, des **📝 observations** (enregistrées toutes seules) et un **statut** :

| Statut | Quand |
|---|---|
| • En attente | pas encore traitée |
| 🟢 RAS | rien à signaler |
| 🟡 Suspect | traces, bruit, odeur inhabituels |
| ⬛ Bloqué | passage impraticable (effondrement, eau) |
| 🔵 Indice | objet ou trace trouvé |
| 🟠 Aide demandée | renfort humain ou matériel |
| 🟣 Demi-tour forcé | parcours abandonné, retour anticipé |
| 🚨 **Victime trouvée** | urgence absolue : carte rouge clignotante chez l'opérateur |
| ⚪ Passée, non renseignée | posé par l'app quand tu passes à l'étape suivante sans choisir de statut — une étape sautée n'est pas une étape fouillée |

- **📸 Photo** : jusqu'à 5 par étape, appareil photo ou galerie ; touche une miniature pour l'agrandir.
- **Valider une étape te recale dessus** (avec RAS, Suspect, Indice, Aide demandée ou Victime trouvée) : sans rien demander à moins de 30 m, avec une question au-delà. Jamais avec Bloqué ou Demi-tour forcé : tu n'y es pas arrivé.
- **🧭 Suivre mon parcours (guidage pas à pas)** transforme le parcours en itinéraire guidé : bandeau « Dans 40 m, tourner à gauche », feuille de route et écran XL te mènent d'étape en étape, et le suivi 🧭 démarre. Les étapes validées sont cochées ; si tu t'écartes, **Recalculer** repart vers la prochaine étape non faite, toujours en contournant les zones des autres équipes. À l'arrivée sur une étape, un message et une vibration te préviennent, et la pastille 🚨 ouvre cette étape. Il faut que l'itinéraire de l'équipe ait été calculé.
- Trois raccourcis en cas de pépin : **🚪 Sortie d'urgence**, **🆘 Écran XL**, **⛑️ Je suis perdu**.
- **▶️ Départ** note ton heure de départ (sinon, celle du lancement) ; **✅ Rentrée** arrête le chrono à la remontée.

##### 👤 Côté opérateur

- En tête : **« X engagé(s) · Y sous terre · Z manquant(s) à la rentrée »**. Au lancement, l'app signale les équipes sans effectif : à leur rentrée, personne ne serait compté.
- Une carte par équipe : progression, dernier statut, dernière observation. **🚨 Victime trouvée** → carte rouge clignotante ; **🟠 Aide demandée** → orange ; équipe terminée → grisée. **👁️ Détails** montre toutes ses étapes.
- **Retards** : chaque équipe a une heure de retour prévue (départ + durée estimée, ou son retour impératif). Passé cette heure, sa carte passe en **orange** ; après la marge, en **rouge**. Les équipes en retard remontent en tête, la pastille du bas change de couleur, un message et une vibration préviennent.
- **✅ Rentrée** : l'app demande **combien sont remontés** (rien n'est prérempli : compte). En dessous de l'effectif, l'alerte rouge **« N PERSONNE(S) MANQUANTE(S) »** reste affichée, pastille comprise, tant que le compte n'est pas corrigé (**Corriger le compte**).
- **📢 Rappel général** (ou **📢 Rappeler** pour une équipe) marque les équipes encore sous terre comme rappelées, avec l'heure. ⚠️ **L'app ne prévient personne** — pas de réseau sous terre : transmets l'ordre toi-même, par radio ou à la voix.
- **🚨 Prendre la main** : un appel radio d'une équipe ? Tu passes dans sa vue, sur sa première étape non terminée, pour saisir à sa place ; **👤 Retour Opérateur** te ramène. Dans ce cas, Suivre mon parcours, Sortie d'urgence, Écran XL et Je suis perdu sont absents : ils agiraient sur ton propre téléphone.
- **📜 Main courante** : tout y est noté à l'heure — lancement, statuts, victime, départs, rentrées, rappels, imports, phases — plus tes notes (appel radio, décision). Elle s'imprime en annexe du rapport.
- **Modifier pendant l'intervention** : une équipe ajoutée en renfort, ou dont tu changes l'entrée, la sortie ou les étapes, reçoit tout de suite ses étapes. Ce qui a été saisi reste sur la même étape. Retirer une étape déjà renseignée demande une confirmation, et c'est refusé si elle signale Aide demandée ou Victime trouvée : change d'abord son statut. Remise dans la même phase, l'étape retrouve ses saisies.

Le 🚑 **secouriste libre** n'a ni parcours ni étapes : il ajoute des notes, chacune avec un statut et l'heure. Son rapport s'importe comme celui d'une équipe, et ses notes rejoignent la main courante.

##### 🚑 Victime trouvée

Une étape passée en **Victime trouvée** donne une position : celle de l'étape, niveau compris. **📍 Préciser sur la carte** l'ajuste. Un **✚ rouge** la marque sur la carte, pour tous ; l'opérateur la voit en bandeau en tête de sa vue, et le rapport l'imprime en premier.

**🚑 Évacuer** ouvre la Sortie d'urgence depuis la victime : sorties du plan et accès des équipes, classés par distance réelle (« Accès n° 3 (Charlie, Delta) — à ouvrir par la surface » s'il est fermé).

#### 🚒 4. Secours extérieurs

- **🚒 Briefing pompiers** (dans tous les bandeaux du Mode Secours) produit un PDF pour les pompiers, à imprimer ou à leur envoyer avant leur arrivée — aucune installation chez eux :
  - **ACCÈS SURFACE** : le plan cadré sur les accès des équipes, un repère numéroté par accès, et un tableau N° · accès (entrée, sortie ou les deux) · équipes · GPS et lien de carte cliquable. Il dit quel accès il faut ouvrir par la surface. **Nomme tes entrées** (« Plaque rue X »), sinon le tableau dit « Accès sans nom » ;
  - **LOCALISATION** : coordonnées du centre du plan, liens OpenStreetMap et Google Maps ;
  - **ÉQUIPES SUR PLACE** : membres, chef, effectif, retour impératif, GPS surface ;
  - **POI CRITIQUES** : les accès du plan avec leur niveau, ouverts d'abord, puis fermés (que pompiers et services compétents peuvent ouvrir).
  
  Tu choisis les couches de la carte OSM du PDF ; les sections texte sont toujours incluses.
- **📍 GPS surface** (fiche d'équipe) : la position du PC, du point de rendez-vous ou de tout lieu de surface lié à l'équipe, en « latitude, longitude » (ex. 48.856600, 2.352200). Elle figure au briefing avec un lien de carte.
- **🚪 Point d'entrée du plan** : ce tag (catégorie 🚨 Secours de l'éditeur de POI) marque les entrées principales ; elles apparaissent dans les POI critiques et sur la Vue OSM.
- **🌍 Vue OSM**, présente dans le bandeau du scénario et dans les trois vues, montre le plan sur OpenStreetMap aux secours qui arrivent. Il faut un plan géoréférencé.

#### 📦 5. Clore et faire le rapport

##### 🏁 Clore une phase

En vue opérateur, **✓ Phase terminée** (affiché dès qu'il y a 2 phases). Quand toutes les équipes de la phase ont validé leur sortie, le bouton passe au vert et un message t'avertit ; la décision reste la tienne. Saisis le **debrief** (équipes rentrées, points trouvés, zones à explorer en priorité), puis **✓ Terminer la phase** : la phase est archivée, rien n'est effacé, et son parcours prévu est gardé. S'il existe une phase suivante, l'app propose de la démarrer : les étapes de ses équipes repartent de leur parcours **actuel** — tu peux donc l'ajuster pendant le debrief. Sinon, elle propose d'arrêter le plan. **➕ Ajouter une phase** est aussi disponible en cours d'intervention.

##### 📥 Importer les rapports des équipes

1. Au retour, chaque équipe touche **📤 Rapport** → fichier **.mkmsec.report.json** et l'envoie à l'opérateur.
2. L'opérateur, plan lancé, touche **📥 Importer rapport équipier** : l'aperçu montre l'équipe, le nombre d'étapes et de photos, et les conflits avec ce qu'il a déjà saisi.
3. **✓ Importer et fusionner** : observations mises bout à bout avec la date (rien n'est perdu), statut le plus grave retenu (à égalité, le plus récent ; une victime n'est jamais rétrogradée), photos ajoutées sans doublon. La carte de l'équipe porte « 📥 importé ».

L'import est refusé si l'équipe n'existait pas dans le scénario de l'opérateur au lancement, si le fichier vient d'un autre scénario, ou si c'est un rapport global d'opérateur. Un rapport qui porte sur une phase déjà close est rangé dans l'historique de cette phase, et l'app le signale. Un signalement « Aide demandée » ou « Victime trouvée » sur une étape que tu avais retirée remet le point dans le parcours de l'équipe et s'affiche en rouge ; sinon, il figure dans « Signalements hors parcours » du rapport.

**Annuler un import** : une sauvegarde est faite juste avant ; restaure-la depuis **📊 Détails de session → 📦 Backups récents** (« Avant import rapport équipier … »).

##### 📄 Rapport final

**📤 Rapport** (chaque vue, et le bandeau du scénario) génère à tout moment l'état actuel, en trois formats : **PDF imprimable** (photos en annexe), fichier **.mkmsec.report.json** (photos si « 📸 Inclure les photos » est coché), ou **Copier texte** pour un message rapide. L'opérateur obtient toutes les équipes, une équipe son parcours, le secouriste ses notes.

Le PDF de l'opérateur ouvre sur les victimes, puis reprend chaque phase (parcours prévu, étapes, debrief), les signalements hors parcours, une page « BRIEFING SURFACE » avec la carte des accès, et la main courante en annexe.

**⏹️ Terminer le plan** arrête l'intervention ; le bandeau passe à **📦 PLAN TERMINÉ** avec **📤 Voir le rapport historique** et **🚀 Relancer**. ⚠️ Relancer efface l'intervention précédente, photos et rapports reçus compris : exporte son rapport avant.


### 🏗️ Créer ou modifier un plan

Le bouton **🏗️** de la barre latérale ouvre le **Générateur** (**📦 Créer / Modifier un plan**), qui produit l'archive ZIP d'un plan.

#### 🧙 Le Générateur

- **🧙 Assistant** : le Générateur avance **étape par étape** (nom, image, calques…). Les étapes optionnelles se passent d'un clic (**⏭ Passer**), et un **✅ Résumé avant génération** montre ce qui est rempli, passé ou manquant, avec des avertissements utiles (par exemple : sans géoréférencement GPS, ni Vue OSM ni export KMZ / GPX). **🗒️ Tout afficher** montre au contraire tout le formulaire d'un coup ; ton choix est mémorisé.
- **🚀 Simple / ⚙️ Avancé** : le mode Simple se limite à l'essentiel (image, nom, version, V2, multi-niveau) et charge les icônes par défaut ; le mode Avancé donne accès à toutes les options.
- **📂 Charger un fichier** accepte un **ZIP MyKTAMap** (pour le modifier), un **KMZ**, un **GPX**, un **export SIG** (`.geojson`, `.kml`) ou un **GeoTIFF**. Sinon, remplis le formulaire pour créer un plan de zéro.

Une fois prêt, **📦 Générer le ZIP** télécharge l'archive.

#### 📄 Nouveau plan

- **Informations** : nom, version, auteur, **🏷️ étiquettes** (séparées par des virgules, 12 au plus). Elles voyagent dans le ZIP et sont **proposées** à qui l'importe, sans remplacer les étiquettes qu'il a déjà posées.
- **Image principale** (obligatoire) : ses dimensions sont lues automatiquement, avec un avertissement rouge au-delà de 10 000 px de côté ou de 30 Mo.
- **Carte de collision** (optionnelle).
- **Position de départ du tracker** : centrée automatiquement sur le plan ; **🎯 Recentrer la position de départ** la remet au centre.
- **Calques image** (légendes, annotations) et **calques de données** : jusqu'à 10 de chaque. Le calque **Ajouts** est toujours inclus.
- **Paramètres de tracking** : position de départ, échelle, sensibilité.
- **Icônes & tags** : **↺ Charger défauts** pré-remplit les icônes standard, **+ Ajouter un tag** crée un type à toi. Les tags `default` et `track` sont obligatoires.

#### 📂 Modifier un plan existant

Charge le ZIP du plan dans **📂 Charger un fichier** : le formulaire se remplit avec sa configuration. Change ce que tu veux (tags, icônes, calques, position de départ…) puis **📦 Générer le ZIP**.

Si le plan a des **photos attachées à ses points** sur ton appareil, la case **📸 Inclure les photos attachées** (cochée par défaut) les embarque dans le ZIP. Celui qui ouvre ce plan retrouve les photos dans les bulles des points. Décochée, le ZIP est plus léger, sans photos.

#### 🎨 Image vierge

Pour dessiner un plan **sans image source**, choisis **Image vierge** au lieu de **Depuis une image** dans **🖼️ Images principales** :

- **largeur** et **hauteur** de 500 à 12 000 px ;
- **couleur de fond** : blanc, gris clair, gris foncé ou noir ;
- **🎨 Générer l'image vide** l'installe comme image principale.

Termine le formulaire et génère le ZIP comme d'habitude, puis dessine piliers, fronts, tracés et points avec les outils de la carte.

> 💡 Exemple : dans une carrière sans plan papier, un fond noir de 4 000 × 4 000 px, complété au fil de l'exploration avec le tracker comme repère.

#### 📦 Récupérer les calques et photos d'un autre plan

Dans **📊 Calques de données**, **📦 Choisir un ZIP datalayer…** importe d'un coup les annotations d'une autre personne : points, tracés, zones, structures et photos. Ce ZIP s'obtient dans **📤 Exporter → 🔄 Conversion → Session vers data layer**, case 📸 photos cochée pour les inclure.

- Les calques sont créés automatiquement ; un message vert en donne le détail.
- Sur un plan **existant**, tes calques sont **conservés** : ceux du ZIP s'ajoutent à côté sans jamais les écraser, et les photos sont fusionnées.
- Génère le ZIP : à l'ouverture du plan, chacun retrouve les photos dans les bulles des points.

#### 🗺️ Partir d'un GeoTIFF

Si tu as calé ton plan dans **QGIS**, exporte-le en **GeoTIFF** (`.tif`) : l'image et son calage voyagent dans le même fichier. Choisis-le comme image de plan, dans le Générateur ou depuis l'accueil : l'app remplit le **géoréférencement GPS**, en déduit l'**échelle** et l'**emprise**, puis convertit l'image pour la suite. Tu n'as rien à ressaisir.

> ✅ **Accepté** : compression LZW, Deflate ou aucune · 8 bits par canal · gris, RVB ou RVBA · image en bandes · nord en haut, sans rotation · Lambert 93, Web Mercator ou WGS84.
>
> ❌ **Refusé**, avec un message qui dit quoi changer à l'export : BigTIFF, image tuilée, canaux séparés, palette / CMJN / YCbCr, calage tourné, autre système de coordonnées.

#### 🗺️ Convertir un fichier SIG (QGIS…)

Dépose ton export **sur la zone « 📦 Ajouter un plan » de l'accueil** ou dans le Générateur : l'app ouvre **🗺️ Convertir depuis un SIG**. Formats : `.geojson`, `.json`, `.kml`, `.kmz`. Points, tracés et zones sont repris.

- **Pas besoin d'image** : l'app crée un fond vierge calé sur les coordonnées du fichier. Tu pourras le remplacer par une vraie image plus tard.
- **Tes appellations sont respectées** : un écran de correspondance te fait choisir la colonne qui porte le type, puis à quoi correspond chaque valeur (`CANALISATION`, `galerie_tech`…). Les valeurs évidentes sont pré-remplies, et chacune peut viser n'importe quelle famille : un polygone peut être une zone, un pilier, un mur ou un front de taille.
- **Un niveau par étage** : si le fichier a une colonne de niveau, choisis-la dans « Colonne du niveau ». Un aperçu montre la répartition, « Une couleur par niveau » donne une teinte à chaque étage, et le bouton 🏷️ renomme et recolore les niveaux. Tout ce que tu règles là est conservé dans le plan généré. Si l'écran affiche « Légende réinitialisée », rouvre 🏷️ avant de générer.
- **Tu ne donnes que la largeur** : la hauteur est calculée pour que rien ne déborde. Au-delà d'une certaine taille, un avertissement apparaît, sans bloquer.

> 📐 **Coordonnées** : WGS84 (EPSG:4326) ou **Lambert 93** (EPSG:2154, converti automatiquement ; un bandeau t'invite à vérifier la position obtenue). Toute autre projection est refusée, avec la manip à faire : dans QGIS, *Exporter → Enregistrer les entités sous…*, SCR **EPSG:4326**.

À savoir : les trous des polygones sont ignorés ; au-delà de 20 000 objets, un avertissement s'affiche, et au-delà de 60 000 l'import est refusé (filtre ta couche dans QGIS). Shapefile et GeoPackage ne sont pas lus : réexporte en GeoJSON.

> ⚠️ Un plan créé depuis un GPX ou un SIG avec une version antérieure de l'app a une **échelle fausse**, et donc des distances fausses : régénère-le depuis le fichier d'origine. Les plans faits à partir d'une image ne sont pas concernés.

#### 🧱 Convertir en V2 tuilé

Pour un plan lourd (image de plus de 50 Mo ou de plus de 8 000 px), la case **🧱 Convertir en V2 tuile (performance)** découpe l'image en **tuiles** : l'app ne charge plus que les morceaux affichés, ce qui réduit fortement la mémoire utilisée.

1. Choisis une image principale, ou charge le ZIP du plan à convertir : la case apparaît.
2. Coche-la et lis l'avertissement : la conversion est lourde.
3. **📦 Générer le ZIP** : une barre de progression suit le découpage (de 1 à 5 min). Le ZIP téléchargé porte le suffixe `_v2`.
4. Importe ce ZIP : le plan s'ouvre en V2 (badge violet `V2`).

- Les **marges blanches** d'un plan scanné sont rognées automatiquement.
- Une image **PNG / WebP transparente** garde sa transparence : dans la Vue OSM, la carte apparaît à travers ton plan. Pour un plan V2 généré avant ce traitement, régénère-le une fois pour en profiter.
- Sur un plan **déjà V2**, la case est pré-cochée et les tuiles sont refaites ; la décocher repasse le plan en image unique.
- Inconvénients : un léger flash au changement de niveau de zoom, et un bord noir quand on dézoome très loin.

> 💻 **Fais la conversion sur ordinateur.** Sur téléphone, le navigateur manque de mémoire et plante presque à coup sûr sur une grande image. Le ZIP V2 généré sur PC s'ouvre ensuite sans effort sur mobile.

#### 📦 Importer plusieurs plans d'un coup

Dans la section **🧰 Outils** de l'accueil, **📦 Importer plusieurs plans** ajoute autant d'archives ZIP que tu veux à ta liste, **sans en ouvrir aucune**.

1. **Choisis** tes fichiers.
2. **Relis** ce qui va se passer, ligne par ligne : ajouté, déjà présent, refusé (et pourquoi), avec le poids total et la place restante.
3. **Lance** : les plans entrent un par un, puis un bilan s'affiche.

- **Plan déjà dans ta liste** : un seul choix pour tout le lot, le laisser tel quel (par défaut), le remplacer ou garder les deux.
- **📁 Ranger dans :** choisis le dossier de « Mes plans » qui reçoit le lot (par défaut « Non classés »).
- **💾 Précharger le ZIP** (cochée par défaut, comme « Mémoriser le plan dans l'app au premier chargement ») : l'app garde les fichiers, et chaque plan s'ouvre ensuite **sans resélectionner son ZIP**. Décochée, rien n'est copié et le ZIP te sera demandé à la première ouverture.
- **La place est vérifiée avant** : si le lot ne rentre pas, l'import ne commence pas et l'app te dit combien il manque. Si la place s'épuise en route, l'import s'arrête net et garde les plans déjà ajoutés.

### 🚀 Optimiser ton plan

Un plan léger se charge plus vite, se parcourt plus fluide et **plante beaucoup moins sur mobile**. Les conseils ci-dessous vont du plus efficace au moins efficace.

#### 🖼️ L'image principale

C'est elle qui consomme le plus de mémoire.

| Plus grand côté | Comportement |
|---|---|
| jusqu'à 4 000 px | ✅ OK partout |
| 4 000 à 8 000 px | ⚠️ OK sur ordinateur, dézoom limité sur mobile |
| 8 000 à 16 000 px | ⚠️ Plantages possibles sur mobile : convertis en V2 tuilé |
| au-delà | ❌ Plantage quasi certain sur mobile |

- **Redimensionne** une image géante à 6 000 - 8 000 px de côté (GIMP, Photoshop, [Squoosh](https://squoosh.app/)) : un peu moins de détail au zoom maximum, beaucoup plus de stabilité.
- **Format** : JPEG qualité 80 - 90 % pour un scan ou un plan avec dégradés (souvent 5 à 10 fois plus léger qu'un PNG, sans différence visible) ; WebP, encore plus léger ; PNG seulement pour la transparence ou des aplats nets.

#### 🗂️ Calques, tracés et points

- **Calques image** : chacun ajoute de la mémoire, même masqué. Un seul, c'est l'idéal ; deux ou trois de 2 Mo maximum restent acceptables. Intègre plutôt légende et repères dans l'image principale.
- **Tracés** : au-delà d'une cinquantaine, le déplacement de la carte peut ralentir. Pour un très grand réseau, dessine les galeries **directement dans l'image** et garde le calque de tracés **masqué** : l'itinéraire s'en sert quand même.
- **Points** : au-delà de quelques centaines affichés à la fois, le rendu ralentit sur mobile. Répartis-les dans plusieurs calques de données (puits, passages…) que chacun peut masquer.

#### ✂️ Découpage de l'image

Une très grande image est **découpée en tuiles** au chargement pour ne pas saturer la mémoire. Le réglage se trouve dans **ℹ️ Infos** du plan, ligne **🖼️ Tuilage de ce plan**, et n'apparaît que pour un plan **qui n'a pas été converti en V2** (un plan V2 est déjà découpé). Il est mémorisé pour ce plan.

| Choix | Effet |
|---|---|
| **Auto** (par défaut) | Découpe dès que l'image dépasse 4 096 × 4 096 px ou 60 Mo. ✅ Le bon choix dans presque tous les cas. |
| **Désactivé** | Image entière d'un coup, qualité native sur ordinateur. ⚠️ Peut faire planter un téléphone sur un très grand plan ; un message te prévient. |

#### 🚀 Mode Performance ULTRA

Si un gros plan plante ou rame encore, ouvre **⚙️ Réglages** → **🚀 Performance**. **🚀 Mode ULTRA (active tout)** allège tout ce qui n'est pas l'image : tracés, points, calculs. Ce réglage vaut **pour le plan ouvert seulement**, sur cet appareil.

| Option | Effet | Contrepartie |
|---|---|---|
| 🪜 **Décimer les tracés au dézoom** | Simplifie les tracés vus de loin | Tracés moins lisses au dézoom |
| ⚡ **Désactiver animations zoom/pan** | Transitions instantanées | Rechargement requis |
| 🎯 **Désactiver cercles intersections** | Plus de cercles aux carrefours au-delà de 50 tracés (au lieu de 500) | Carrefours moins visibles |
| 🚫 **Désactiver popups sur calques données** | Plus de bulle au clic sur les points des calques de données | Passe par 🔍 Recherche |
| 🐢 **Auto-save lent (30s)** | Sauvegarde toutes les 30 s | Jusqu'à 30 s perdues en cas de plantage |
| 👁️ **Ne rendre que les éléments visibles** | Ignore tracés et points hors écran | Léger temps d'apparition en déplaçant la carte |
| 🛡️ **Limiter le dézoom sur mobile** | Plafonne le dézoom sur téléphone. **Cochée par défaut** | Pas de vue d'ensemble complète sur mobile ; rechargement requis |

- ULTRA coche tout ; le décocher décoche tout. Tu peux aussi n'activer que certaines options, par exemple **🐢** et **👁️** pour un bon gain sans perte visible.
- **Tes points de session restent toujours affichés**, quelles que soient les options.
- Quand des optimisations sont actives, un message te le rappelle à l'ouverture du plan : un affichage allégé n'est pas un bug.
- Sur un plan multi-niveau, **🏗️ Afficher tous les niveaux au lancement** (même groupe, hors ULTRA, coché par défaut) peut être décoché pour n'ouvrir que les niveaux -1, 0 et +1.

#### 📱 Sur mobile

- Sur iPhone, l'app **installée sur l'écran d'accueil** tient mieux les gros plans que Safari ; Android Chrome est en général plus tolérant qu'iOS.
- iOS peut fermer l'app sans prévenir pour récupérer de la mémoire ; l'app te le signale au redémarrage. Lors d'un gros travail d'annotation, **exporte ta session** (📤 Exporter) tous les quarts d'heure.
- Pour diagnostiquer un plantage, voir **🐛 Logs détaillés** plus bas.

#### ✅ En résumé

- Image en **JPEG qualité 85**, 8 000 px de côté au plus.
- Un ou deux calques image au maximum.
- Gros réseau : galeries **dessinées dans l'image**, calque de tracés masqué pour l'itinéraire.
- Points répartis dans quelques calques de données.
- Gros plan : **converti en V2 tuilé** ; appareil faible : **🚀 ULTRA**.

### 📊 Éditeur de données du plan

**⬇️ → 📊 Éditeur de données du plan** sur la carte, ou **📊 Éditeur de données** sur l'accueil, ouvre un tableau pour **voir, modifier et exporter** les points, tracés, zones et structures d'un plan.

#### 📂 Ouvrir

- **🗺️ Plan en cours** : les calques de données du plan ouvert (absent depuis l'accueil, où aucun plan n'est chargé).
- **📦 Importer un ZIP** : les calques d'un plan complet.
- **📄 Importer un fichier JSON** : un fichier de données ou de session.
- **🔁 Convertir la résolution** : passe tes fichiers de données d'un ancien scan à un nouveau scan du même plan. Indique les deux résolutions (ou laisse l'app les lire dans les images) ; si les marges diffèrent, ajoute un **repère commun** (le même pilier sur les deux plans), ou **deux**, et l'échelle et la rotation sont déduites. Liaisons inter-plans, géoréférencement et échelle restent à refaire sur le nouveau plan.
- **🧹 Dédoublonner les données** : retire les sommets identiques consécutifs des tracés, zones, structures et mesures, invisibles mais qui alourdissent les fichiers. Tu récupères un fichier `_dedup.json` et le compte de ce qui a été retiré ; les points ne sont jamais touchés.

Si la source contient plusieurs jeux de données, un sélecteur te laisse choisir.

#### ✏️ Modifier

- **Clique une cellule** pour la modifier (sauf l'identifiant). **Tab** : cellule suivante · **Entrée** : ligne suivante · **Échap** : annuler.
- Une coordonnée hors du plan passe en **rouge**.
- La cellule **Tags** ouvre un sélecteur avec aperçu des icônes ; tu peux y créer un tag.
- Pour les tracés, zones et structures, la **note**, le **type** et le **niveau** se modifient, mais pas la **géométrie** : redessine-la sur la carte.
- Pour les points : recherche dans toutes les colonnes, tri par clic sur l'en-tête, sélection multiple (case + Maj+clic), **+ Ajouter ligne**, **📋 Dupliquer**, **🗑️ Supprimer**, **📍 Voir sur la carte**.

#### 💾 Enregistrer

| Ce que tu édites | **💾 Sauvegarder** |
|---|---|
| **Données du plan** | Télécharge le fichier `.json` modifié. Pour l'appliquer, réimporte-le dans le **Générateur** : l'éditeur ne change jamais le plan affiché. |
| **Ta session** | Télécharge le fichier, ou **✏️ Remplacer la session en cours** pour appliquer tout de suite. |

Si tu fermes avec des modifications non sauvegardées, l'app te propose de sauvegarder, de quitter sans sauvegarder ou de continuer.

### 🖥️ Héberger l'app sur ton serveur

Pour installer MyKTAMap sur ta propre machine (PC, Raspberry Pi, NAS, serveur de club) et la servir sur ton réseau local.

#### 🐳 Avec Docker

```bash
docker run -d --name myktamap -p 8443:8443 ghcr.io/karmakta91/myktamap:latest
```

Ouvre ensuite **`https://localhost:8443/`**. Le navigateur signale un **certificat non reconnu** (l'image en génère un à son démarrage) : accepte-le via **« Paramètres avancés » → « Continuer »**, puis recharge la page pour que l'app fonctionne hors connexion.

Si le port `8443` est déjà pris sur ta machine, change la partie gauche : `-p 9443:8443`. Les mises à jour ne sont pas automatiques : c'est toi qui décides quand récupérer la nouvelle image.

L'image sert exactement la même app que le site officiel, depuis ton matériel ; rien n'est envoyé ailleurs.

> 📖 Installer Docker, garder tes plans entre deux redémarrages, utiliser ton propre certificat ou un nom de domaine local, mettre à jour, résoudre les erreurs courantes : tout est dans le guide **[`docs/applications/DOCKER_INSTALL.md`](DOCKER_INSTALL.md)**.

#### 🗂️ Proposer les plans du serveur

Si ton serveur héberge des plans dans `data/` (par exemple `data/test1/`, `data/test2/`), un fichier `data/index.json` les fait apparaître automatiquement dans **Mes plans**, marqués « découvert », chargeables d'un clic :

```json
{
  "plans": [
    { "id": "test1", "path": "data/test1", "name": "Plan Test 1", "version": "V1" },
    { "id": "test2", "path": "data/test2", "name": "Plan Test 2", "version": "V1" }
  ]
}
```

La forme courte `{ "plans": ["test1", "test2"] }` fonctionne aussi ; la forme détaillée affiche les noms tout de suite.

### 💼 Édition pro — importer une licence

Si l'auteur t'a remis un fichier **`Licence-pro.json`**, il active l'édition pro **sur cet appareil**.

- **Depuis ton profil** : **📂 Importer une licence pro**, puis choisis le fichier. Le bas de l'accueil affiche ✓ Licence pro active et l'écran de démarrage « Édition professionnelle ». **🗑️ Retirer la licence locale** te ramène au mode communautaire ; tu peux réimporter le fichier plus tard.
- **Au tout premier lancement**, sur l'écran du code communautaire, **📂 Importer ma licence pro** fait entrer directement en mode pro, sans ce code.
- Sur une instance où l'administrateur a installé la licence sur le serveur, ton profil affiche simplement ✓, sans bouton.

Un fichier mal formé est refusé avec un message. Le fichier est lu dans ton navigateur et n'est envoyé nulle part.

> ⚖️ La licence est **nominative** : la partager avec un tiers non autorisé enfreint le contrat passé avec l'auteur.

### 🛡️ Plans révoqués

Quand un plan a été diffusé hors de son groupe de confiance (forum, réseau social public…), son auteur peut le **révoquer** : l'app refuse alors de l'ouvrir, chez tout le monde.

- **À l'import d'un plan révoqué**, une fenêtre rouge **⛔ Plan révoqué** s'affiche avec le motif et la date. Le plan n'est pas ouvert : touche **Compris, supprimer ce plan** pour le retirer de ta liste.
- **Si un plan déjà dans ta liste est révoqué plus tard**, l'app le retire au démarrage suivant et une fenêtre orange te le signale (nom, motif, date) ; touche **Compris**.

Il n'y a rien d'autre à faire.

> 🔒 L'app télécharge la liste publique des plans révoqués et la compare **sur ton appareil** : personne ne sait quels plans tu possèdes. Hors connexion, la dernière liste connue s'applique.

### 🐛 Logs détaillés

Dans **⚙️ Configuration** de l'accueil → **🛠️ Mode Développeur** (protégé par mot de passe), **🐛 Logs détaillés** ajoute des informations dans la console du navigateur (capteurs du tracker, découpage de l'image). Utile pour signaler un problème. Désactivé par défaut. Le mode développeur contient aussi **🔧 Voir l'état du cache (Service Worker)** : le détail, fichier par fichier, de ce que résume la pastille hors-ligne.

---

*MyKTAMap — Guide Utilisateur*
*Ces lieux sont fragiles. La discrétion est une forme de respect.*
