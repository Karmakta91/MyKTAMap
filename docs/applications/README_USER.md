# 📗 MyKTAMap — Guide Utilisateur

> Ce guide est destiné aux utilisateurs de l'application. Il explique comment utiliser chaque fonction, comment préparer votre téléphone pour une sortie terrain, et rappelle les règles essentielles concernant la discrétion des données.

---

## 🔴 Avertissements importants

### ⚖️ Conditions d'utilisation & avertissement légal

Au **premier lancement**, une page de **conditions d'utilisation** rappelle que MyKTAMap est un **outil de repérage et de cartographie**, pas une incitation à pénétrer dans des lieux interdits. Elle doit être **lue et acceptée une fois** (case à cocher + « J'accepte »).

- L'accès à de nombreux sites souterrains — notamment le **réseau des anciennes carrières de Paris** — est **interdit** (arrêté préfectoral du 2 novembre 1955) et **passible d'amende** (135 € à 375 €).
- Toute intrusion dans un lieu privé ou interdit engage votre **seule responsabilité**.
- Le **texte intégral** (arrêté du 2 novembre 1955 + réponse ministérielle Sénat n° 03710 du 05/06/2025) est consultable depuis la page, et à tout moment via le lien **⚖️ Conditions d'utilisation** dans le pied de page de l'accueil.

> Les explorations clandestines sont dangereuses (égarement, éboulement, chute dans des puits) et illégales. Respectez la loi, les propriétaires et votre sécurité.

---

### 🔐 Confidentialité des données — à lire en premier

MyKTAMap est un outil de cartographie de terrain qui peut contenir des informations sensibles : **localisation précise d'entrées, de puits, de passages, de structures souterraines.**

Ces données, si elles étaient rendues publiques, pourraient :

- Faciliter l'accès de personnes non averties à des lieux dangereux
- Provoquer une sur-fréquentation qui dégrade ces espaces fragiles
- Exposer les utilisateurs à des poursuites légales
- Mettre en danger des personnes non équipées

**Règles à respecter absolument :**

- Ne jamais partager les fichiers de données (`data/*.json`) en dehors de votre groupe de confiance
- Ne jamais publier de captures d'écran montrant des coordonnées ou des localisations précises
- Ne jamais laisser l'application ouverte et visible sur un appareil accessible à des tiers

> Ces lieux appartiennent à leur histoire. Leur préservation dépend de la discrétion de ceux qui les fréquentent.

---

### ⚠️ Avertissement sur le tracker de position

Le module de déplacement simulé est **expérimental**. Il repose sur les capteurs inertiels du téléphone (accéléromètre + gyroscope) pour estimer votre position sans GPS — technique appelée **PDR (Pedestrian Dead Reckoning)**.

**Limites à connaître avant utilisation :**

- La dérive s'accumule avec le temps : plus vous marchez, plus l'erreur grandit
- La précision varie fortement selon les téléphones et la façon de tenir l'appareil
- Les changements d'altitude (escaliers, échelles, puits) ne sont pas pris en compte
- Le tracker **ne remplace pas** une boussole physique, un fil d'Ariane ou une carte papier
- En souterrain, ne faites jamais confiance à votre seul téléphone pour vous localiser

**Le tracker est une aide visuelle, pas un système de navigation fiable.**

Utilisez toujours le **recalage manuel** (bouton 📍) dès que vous identifiez un repère connu sur le plan.

**Pour toute sortie souterraine, emportez toujours :**
- Une carte papier ou une version imprimée du plan
- Une boussole physique
- Une lampe frontale avec piles de rechange

---

### 🚨 Alertes publiques (diffusion en temps réel)

L'application supporte un système d'**alertes publiques** diffusées par l'auteur à la communauté en cas de situation à risque (incendie en cataphilie, fermeture d'accès, gaz toxiques, etc.).

**Comment ça se manifeste** :

- Au lancement de l'app (après le splash), si une alerte est active côté serveur, une **modale rouge pulsante** s'affiche avec titre, message principal et liste de consignes.
- **Niveaux** :
  - 🚨 **emergency** (rouge pulsant + `!` qui clignote) — situation critique, à lire impérativement
  - ⚠️ **warning** (orange) — info importante, attention requise
  - ℹ️ **info** (bleu) — annonce neutre, simple notification
- **Acquittement** : cliquer **"J'ai compris"** stocke la confirmation dans votre navigateur. La modale ne ré-apparaîtra plus tant que l'alerte reste la même.
- **Si une nouvelle alerte est publiée** (ou la même est ré-éditée par l'auteur), elle ré-apparaîtra automatiquement au prochain reload.

**Multi-alertes** : plusieurs alertes peuvent coexister (ex: alerte migration domaine + alerte incendie ponctuelle). Elles s'affichent en cascade au lancement (priorité : emergency → warning → info, plus récente d'abord). Chacune s'acquitte individuellement avec son propre bouton "J'ai compris".

**Bouton 🚨 dans le loader** (à gauche du 📖 Documentation) — **couleur dynamique selon le niveau max actif** :

| État | Apparence du badge 🚨 |
|---|---|
| Au moins 1 alerte `emergency` non acquittée | 🚨 **rouge pulsant** |
| Sinon, au moins 1 `warning` | 🚨 **orange** |
| Sinon, seulement `info` | 🚨 **bleu discret** |
| Aucune alerte active | 🚨 **gris neutre** |

**Pastille compteur** : si plusieurs alertes non acquittées coexistent, un petit cercle rouge avec le chiffre apparaît en haut-droite du badge.

Au clic, le bouton 🚨 force le re-affichage de TOUTES les alertes actives en cascade (même celles déjà acquittées) :

| État serveur | Modale affichée |
|---|---|
| Alertes actives | Cascade des alertes triées par priorité |
| Aucune alerte active | **Modale verte sobre** "✅ Aucune alerte en cours" |
| Hors ligne | Modale neutre "📡 Vérification impossible — réessayez avec du réseau" |

> 💡 Si vous voyez encore l'alerte en mémoire après plusieurs jours mais voulez vérifier l'état officiel, cliquez 🚨 — vous saurez immédiatement si la situation est toujours d'actualité ou si elle est résolue.

> ⚠️ Ce système est destiné à des alertes **importantes pour la sécurité de la communauté**. Il ne sert pas à des messages commerciaux ou promotionnels.

### 🛡️ Plans révoqués (kill-switch anti-fuite)

Si un plan ZIP **fuite massivement** (= il a été diffusé hors de son groupe de confiance — Telegram public, forum, site warez…), l'auteur peut le **révoquer** : son empreinte est ajoutée à une liste publique côté serveur (`denylist.json`). L'application refusera alors automatiquement de l'ouvrir chez **tous les utilisateurs**.

**Comment ça se passe pour toi si tu télécharges un plan révoqué par erreur** :

1. Tu importes le ZIP dans l'app (loader principal OU générateur « Modifier un plan existant »)
2. **Avant** d'ouvrir le ZIP, l'app calcule son **empreinte SHA-256** (localement, sur ton appareil)
3. Si l'empreinte matche un plan révoqué, une **modale rouge bloquante** s'affiche :
   - Titre : « ⛔ Plan révoqué »
   - **Motif** : raison textuelle donnée par l'auteur (ex: « Fuite publique constatée le 05/06/2026 sur Telegram »)
   - **Date d'ajout** à la liste de blocage
   - **Empreinte SHA-256** (12 premiers + 8 derniers chars, anti-doxxing)
   - Bouton « Compris, supprimer ce plan » → le plan est retiré automatiquement de ta liste, la page se recharge
4. Le plan **n'est jamais ouvert** sur ton appareil

**Privacy stricte** :
- ✅ **Aucune empreinte n'est envoyée au serveur**. Seule la liste publique des plans révoqués est téléchargée, et la comparaison se fait 100% sur ton appareil.
- ✅ L'auteur ne sait pas quels plans tu possèdes (= zéro tracking).
- ✅ La liste `denylist.json` est publique : tu peux l'auditer toi-même à `https://myktamap.fr/denylist.json` (idem instance pro).

**Cache & propagation** :
- La liste de révocations est rafraîchie au boot de l'app puis mise en cache 24h.
- En cas d'ajout urgent par l'auteur, la propagation est **immédiate** pour tous les users qui rouvrent l'app, et max 24h pour les autres.
- En cas d'**absence de réseau**, l'app utilise la dernière liste connue (= le mécanisme reste actif offline).

**Limitation assumée** : seules les fuites **byte-perfect** sont bloquées (= le ZIP exact). Si un attaquant ré-emballe le ZIP avec un autre outil ou modifie 1 byte, l'empreinte change. C'est suffisant pour bloquer la **diffusion accidentelle** d'un ZIP qui circule, mais pas une dérivation active intentionnelle (= friction max acceptable).

> 💡 **Pour les auteurs de plans qui veulent révoquer un ZIP** : contacte KARMA (auteur de l'app) avec l'empreinte SHA-256 de ton ZIP (commande : `sha256sum ton-plan.zip`) + un motif court. La révocation est appliquée côté serveur sous quelques jours.

#### 🔄 Audit automatique au démarrage

Si un plan que **tu avais déjà importé** est révoqué par l'auteur APRÈS ton import (entre 2 sessions), l'app le détecte automatiquement au prochain démarrage :

- ~2 secondes après le boot, en arrière-plan, l'app calcule l'empreinte SHA-256 de chacun de tes plans locaux et compare à la liste publique
- Si un match → le plan est **automatiquement supprimé** de ta liste
- Une **modale orange** s'affiche listant les plans révoqués (nom + motif + date + empreinte tronquée) + bouton « Compris »
- L'empreinte est mise en cache dans ta liste de plans → les boots suivants sont quasi-instantanés (pas de re-calcul)

> ✅ **Privacy** : tout reste local, comme à l'import. Aucune empreinte n'est envoyée au serveur.


---

## 🚀 Premiers pas

### 🗝️ Accès restreint — Code communautaire

L'application est protégée par un **mot de passe unique commun** à tous les utilisateurs autorisés. Le code te sera communiqué par l'auteur (forum, message direct, etc.).

> 🌍 En haut de cet écran, un sélecteur **FR · EN · ES** te permet de choisir ta langue **dès le premier lancement** (pré-sélectionnée d'après celle de ton navigateur) — l'écran se traduit immédiatement et toute l'app suit, tutoriel compris.

**À la première installation** (ou après un reset complet) :
1. Le splash s'affiche normalement (3,5 secondes)
2. Un écran **🗝️ Accès restreint** apparaît avec un champ de saisie
3. Saisis le code → clique **🔓 Déverrouiller**
4. Si correct → l'app se charge normalement et tu n'as plus besoin de re-saisir
5. Si incorrect → message rouge, tu as 4 tentatives restantes

**Avant de faire un reset complet** : la modale de confirmation affiche le code en clair pour que tu puisses le re-saisir au prochain démarrage. **Note-le ou copie-le avant de cliquer "Réinitialiser"**, sinon tu ne pourras plus rentrer.

> 🛡️ **Niveau de sécurité** : c'est une **barrière communautaire**, pas une vraie authentification. Le code source de l'app est public sur GitHub. Cette gate sert à décourager les passants et cadrer un cercle d'utilisateurs avertis, pas à protéger des données sensibles.

### 📱 Installer l'application sur Mobile (Iphone/Android)

MyKTAMap peut être installée comme application native sur Mobile — sans passer par l'App Store/Play Store :

1. Ouvrez `myktamap.fr` dans **chrome/safari**
2. Appuyez sur le bouton de partage ↑ en bas de l'écran
3. Sélectionnez **"Sur l'écran d'accueil"**
4. Confirmez — une icône apparaît sur votre écran d'accueil
5. Lancez toujours l'application depuis cette icône

> L'application fonctionne ainsi en mode plein écran, sans la barre du navigateur.

### 📥 Installer l'application sur PC

MyKTAMap peut être installée comme application native sur PC egalement — sans installer un exécutable.

1. Ouvrez `myktamap.fr` dans **chrome**
2. Appuyez sur le bouton "Installer" à coté de l'URL
3. Confirmez — une icône apparaît sur votre bureau
4. Lancez toujours l'application depuis cette icône


### 🎬 Animation au démarrage

Au lancement de l'application (ouverture de l'app PWA, refresh de la page, premier accès), une **animation de bienvenue** s'affiche pendant environ 3,5 secondes :

- **Logo** MyKTAMap (rose des vents jaune)
- **Titre** et sous-titre
- **Barre de chargement** dorée
- **Signature de l'auteur** et mention de licence

Cette animation **n'apparaît qu'une seule fois par session**. Si vous changez de plan via 🗂️ ou ▶️ Reprendre, elle ne se ré-affiche pas — vous restez dans votre session active.

> Pour la revoir, fermez l'application puis relancez-la depuis votre icône d'accueil (PWA) ou rafraîchissez la page (F5 sur PC).

### 📦 Charger un plan

Au démarrage, l'application affiche un **écran d'accueil** qui regroupe :

- **▶️ Reprendre [nom]** — relance le dernier plan utilisé en 1 clic.
- **📚 Mes plans** — la liste de tous les plans que vous avez déjà chargés (serveur ou ZIP local), triée du plus récemment ouvert au plus ancien. Les plans serveur disponibles sont **auto-découverts** au démarrage et apparaissent ici.
- **📦 Charger un nouveau plan** — pour ajouter un ZIP à votre liste.
- **🏗️ Générer un plan** — ouvre le générateur de plan from scratch.

**Trois manières d'ajouter un plan :**

1. **Importer un ZIP local** — glissez-déposez votre archive sur la zone prévue, ou cliquez pour la sélectionner. Cliquez ensuite sur **Charger le plan**. Le plan s'ajoute automatiquement à votre liste pour les prochaines fois.
2. **Cliquer sur un plan déjà connu** — dans **📚 Mes plans**, un clic relance directement un plan déjà ouvert (serveur 🌐 ou local 💾).
3. **🏗️ Générer un plan** — bouton dédié dans la home pour créer un plan from scratch.

> 🔄 **Réimporter un plan que tu as regénéré* — si le ZIP que tu importes porte le **même nom et le même auteur** qu'un plan déjà dans ta liste mais une **version différente**, l'app te pose la question au lieu d'empiler un doublon :
> - **🔄 Mettre à jour** — l'entrée existante est remplacée (nom, version, taille, archive mémorisée). Ta **session, tes notes et tes liaisons inter-plan sont conservées**. Les photos ne sont remplacées que si le nouveau ZIP en contient.
> - **➕ Garder les deux** — les deux versions cohabitent dans la liste.
> - **Annuler** (ou ✕ / Échap / clic à côté) — rien n'est touché. C'est toujours le choix par défaut : jamais d'écrasement accidentel.
>
> À savoir : si le ZIP a **exactement le même nom ET la même version**, il met à jour l'entrée existante sans rien demander. Aucune question non plus pour les plans serveur ni quand tu re-sélectionnes le fichier d'un plan précis depuis ta liste.

### 🗺️ Convertir un fichier SIG (QGIS…) en plan
Tu as des données dans un logiciel SIG et tu veux les exploiter dans MyKTAMap ? Dépose ton export **directement sur la zone « 📦 Charger un nouveau plan » de l'accueil** — celle où tu déposes déjà tes ZIP : l'app reconnaît le format et ouvre **« Convertir depuis un SIG »**. Ça marche aussi depuis la zone d'import du **🏗️ Générateur**.

**Formats acceptés** : `.geojson`, `.json`, `.kml`, `.kmz` (vectoriel). Points, tracés et zones sont repris.

**Pas besoin d'image de plan** : si tu n'as que des données vectorielles, l'app **génère un fond vierge automatiquement calé** sur les coordonnées de ton fichier — tes annotations tombent au bon endroit. Tu pourras remplacer ce fond par une vraie image plus tard via 🏗️ **Modifier un plan**.

**Tes appellations sont respectées.** Un fichier SIG a sa propre nomenclature (`CANALISATION`, `galerie_tech`, `ZH`…). Un **écran de correspondance** te laisse choisir la colonne qui porte le type, puis dire à quoi chaque valeur correspond dans MyKTAMap. Les valeurs évidentes sont pré-remplies — vérifie-les, rien n'est imposé. Les valeurs listées sont **séparées par famille** : celles trouvées sur des polygones te proposent des types de zone, jamais des types de tracé.

> ⚠️ **Ton fichier doit être en coordonnées GPS classiques (WGS84 / EPSG:4326).** Dans QGIS : *Exporter → Enregistrer les entités sous…* puis choisis **EPSG:4326** dans le champ SCR.

> 📐 **Lambert 93 converti automatiquement* — si ton export QGIS est en **Lambert 93** (EPSG:2154, le système officiel français : des coordonnées en **mètres** comme 650000 / 6860000, pas en degrés), l'app le **reconnaît et le convertit** toute seule. Un bandeau te dit combien de coordonnées ont été reprojetées : vérifie que la position obtenue correspond bien à ton site avant de continuer. Les **autres** projections (UTM, Web Mercator…) restent refusées — réexporte alors depuis QGIS en **EPSG:4326 (WGS84)**.

> 🗺️ **Relevés de carrière : ce que l'import sait faire**
> 
> - **Un niveau par étage.** Si ton fichier porte une colonne de niveau (`niveau`, `level`, `etage`…), choisis-la dans « Colonne du niveau » : chaque objet garde son étage, et un aperçu te montre la répartition **avant** de générer. Coche « Une couleur par niveau » pour que chaque étage ait sa teinte — sans ça, six étages superposés se confondent. Tu peux **renommer et recolorer** chaque niveau avec le bouton 🏷️ sans quitter l'écran. Tout ce que tu changes là est **conservé dans le plan généré** — y compris les types que tu renommes, masques, recolores ou ajoutes toi-même. ⚠️ Si l'écran affiche « Légende réinitialisée », c'est qu'un changement de correspondance a périmé tes noms : rouvre 🏷️ avant de générer.
> - **Chaque type va où tu veux.** La forme d'un objet dans le fichier ne dit pas ce qu'il est : un polygone peut être une zone, un pilier, un mur — ou un **front de taille**, si son auteur l'a dessiné fermé. Chaque valeur peut viser n'importe quelle famille dans le menu déroulant.
> - **La hauteur du plan est calculée**, tu ne donnes que la largeur. C'est ce qui garantit que le plan ne sort pas du cadre : avec des proportions libres, le contenu débordait. Au-delà d'une certaine taille, un avertissement apparaît (fond vide possible sur iPhone, ou génération lourde) — c'est un **conseil**, pas un blocage.
> 
> ⚠️ **Si tu as créé un plan depuis un GPX ou un SIG avec une ancienne version de l'app** : son **échelle était fausse** (une valeur fixe sans rapport avec le terrain), donc les distances mesurées dessus aussi. Régénère-le depuis le fichier d'origine pour repartir sur des mesures justes. Les plans faits à partir d'une image scannée ne sont pas concernés.


>
> Un fichier dans une **autre** projection (UTM, Web Mercator…) sera **refusé**, avec le nombre de coordonnées fautives et la manip à faire. C'est volontaire : accepter en silence des coordonnées qu'on ne sait pas interpréter placerait ton site à des milliers de kilomètres, sans le moindre avertissement. *(Le Lambert 93, lui, est reconnu et converti — voir juste au-dessus.)*

**À savoir** : les trous (anneaux intérieurs) des polygones sont ignorés — MyKTAMap n'a pas de zone à trous. Au-delà de 20 000 objets, l'import est refusé : filtre ta couche dans QGIS avant d'exporter.

*Non gérés* : Shapefile et GeoPackage. Ils exigeraient des bibliothèques lourdes, incompatibles avec la promesse « 100 % hors-ligne, sans installation ». Réexporte en GeoJSON depuis QGIS, c'est deux clics.

### 👤 Profil utilisateur

Un **bandeau profil** s'affiche en haut de l'écran d'accueil, juste sous le header. Il regroupe ton identité visuelle et des statistiques configurables sur ton usage de l'app.

**Ce que tu vois sur le bandeau** :

- **Avatar** : photo perso (carrée, ~64 px) OU initiale colorée auto-générée si pas de photo. La couleur de l'initiale est choisie déterministiquement parmi une palette de 10 couleurs de la charte — ton avatar reste donc visuellement stable d'une session à l'autre tant que tu ne changes pas de surnom.
- **Surnom** : ton pseudo (modifiable). Par défaut "Cataphile" au premier lancement.
- **🏅 Rang** : un **badge** (de *Touriste* à *Grand Maître*) calculé selon ton **temps passé** dans l'app, le **nombre de plans** explorés et les **km de galerie** cartographiés. Il se matérialise par un **anneau coloré** autour de la photo + une **médaille** en coin + le **nom du rang sous ton pseudo**. Le détail (les 3 métriques + la progression « Encore X pour le rang suivant » + un score) est dans la fiche profil. *(100 % local et fun — ça ne débloque rien, c'est juste pour le plaisir.)*
- **🏆 Hauts faits** : **38 succès** à débloquer. **8 familles × 4 paliers** (🥉🥈🥇👑) — *Cartographe* (plans), *Géomètre* (plans géoréférencés), *Marcheur des profondeurs* (km), *Rat de cave* (temps), *Pointilleux* (POIs), *Traceur* (tracés), *Zoneur* (zones), *Bâtisseur* (structures) — **+ 6 « 🎉 Spéciaux » one-shot** : *Touche-à-tout* (un peu de tout), *Centurion* (score ≥ 100), *Taupe* (utilisé le tracker), *Spéléo multi-niveaux*, *Marathon souterrain* (session tracker > 4 h), *Complétiste* (tout le reste). Un **toast** te prévient au déblocage, la grille **N/38** est dans la fiche profil. Tu peux aussi afficher ton **score** et ton **nombre de hauts faits** dans les stats du bandeau d'accueil (section 🎨 *Stats du bandeau*).
- **Stats compactes** *(visibles dès que l'écran fait ≥ 380 px de large)* — désormais **configurables** depuis la modale Profil (voir plus bas). Par défaut :
  - ⏱️ **Temps de session** : durée écoulée depuis le démarrage de l'app sur cette session
  - 💾 **Sauvegarde** : taille réelle des données MyKTAMap stockées localement (voir plus bas)

> 💡 **Charte light theme** : en mode clair, le fond du bandeau profil s'aligne sur les cards "Mes plans" pour une intégration visuelle propre.

#### 🖼️ Fond d'écran de l'accueil

Dans la modale **Profil** (clique le bandeau), tout en bas avant les boutons d'export, tu peux mettre **ta propre image en fond de l'écran d'accueil** à la place de la couleur du thème.

Trois réglages, et ils comptent :

- **🖼️ Choisir une image** — n'importe quelle photo. Elle est réduite et ré-encodée à l'ajout, ce qui **supprime au passage ses métadonnées**, dont le lieu de prise de vue.
- **Voile** — assombrit (ou éclaircit, en thème clair) l'image pour que les textes restent lisibles par-dessus. À 0 % l'image est nue, à 100 % tu retrouves le fond uni d'avant. Par défaut 55 %.
- **Cadrage ↔ / ↕** — l'écran ne montre **jamais toute la photo** : elle est agrandie pour couvrir, le reste est coupé. En portrait sur un téléphone, une photo paysage ne laisse voir qu'environ un quart de sa largeur. Ces curseurs choisissent **quelle partie reste visible**. Seul celui de l'axe qui dépasse a un effet — l'autre ne fait rien, c'est normal.

**🗑️ Retirer** revient à la couleur du thème.

> 💡 L'image reste **sur ton appareil**, dans le même stockage que ton avatar. Elle disparaît si tu réinitialises ton profil.
>
> ⚠️ Elle **ne voyage pas encore** avec l'export de profil : sur un nouvel appareil, il faudra la remettre.

**Modifier ton profil** :

Clic sur le bandeau profil → modale **👤 Mon profil** :

- **✏️ Surnom** : tape ce que tu veux (lettres / chiffres / espace). Sert uniquement à personnaliser l'affichage local.
- **📷 Photo** : choisis une image depuis ta galerie. L'app la **compresse automatiquement** (512 px côté long max, JPEG qualité 88 %) avant de l'enregistrer sur ton appareil, pour ne pas saturer ton quota navigateur.
- **🗑️ Reset profil** : bouton de remise à zéro (avec confirmation). Vide le surnom + photo + compteurs.

#### 📊 Grid stats

La modale Profil affiche **6 cells de stats globales** :

| Cell | Description |
|---|---|
| 🗂️ **N plans** | Nombre de plans dans ton registre (serveur + locaux) |
| 💾 **N sessions** | Nombre total de sessions sauvegardées (per-plan slots) |
| ⭐ **N favoris** | Nombre cumulé de points marqués favoris, tous plans confondus |
| 📦 **N snapshots** | Nombre de sauvegardes de session gardées sur cet appareil (max 10 **par plan** — au-delà, les plus anciens sont effacés) |
| 📸 **N photos POI** | Nombre de photos attachées à des points + taille totale |
| 💾 **N MB sauvegarde** | **Taille réelle des données MyKTAMap** (tout ce que MyKTAMap a enregistré dans ton navigateur). Hors Cache PWA volatile (qui n'est pas une donnée user). |

#### 📊 Mes plans

Section **"📊 Mes plans"** sous la grid : **table progressive** qui liste chaque plan de ton registre avec :

- 📍 **POIs** : nombre de points (count session + count embedded dans les data layers)
- 🛣️ **Tracés** : nombre de tracés (idem session + embedded)
- ↔ **Distance totale** : somme cumulée en m ou km si le plan est calibré (sinon affichée en pixels)
- Footer **cumul global** sur tous les plans

> ⚠️ **Marqueur "partial"** : un plan que tu n'as **jamais ouvert dans cette release** apparaît avec un badge ⚠️ orange. Ses data layers ne sont pas encore en cache → seuls les counts session (locaux à l'app) sont disponibles. **Solution** : ouvre le plan une fois, le cache se remplit automatiquement, et la prochaine fois que tu rouvres la modale Profil, la row devient complète.

La table se construit **séquentiellement** (un plan à la fois) pour ne pas saturer la mémoire — comportement anti-crash sur mobile pour les utilisateurs avec 20+ plans en registre.

#### 📊 Répartition par catégorie

Section **"📊 Répartition par catégorie"** : **4 camemberts SVG** agrégés cross-plan qui donnent une vision globale de ta cartographie :

| Camembert | Découpage |
|---|---|
| 📍 **Points par tag** | Tous les points (session + embedded) regroupés par tag (puits aération, accès ouvert, salle, etc.) |
| 🛣️ **Tracés par type** | Principal / Secondaire / Chemin / Jonction interniveau |
| ⬛ **Zones par type** | Eau / Remblais / Effondrement / Inaccessible |
| 🏛️ **Structures par type** | Piliers (1ère / 2e masse) / Murs / Fronts de taille |

Le rendu visuel est **identique** à celui du camembert de la page **Stats Globales** d'un plan ouvert — même palette de couleurs, **mais avec une différence importante** :

> 💡 **Labels par défaut TOUJOURS** : sur cette section cross-plan home, on affiche les libellés **génériques built-in** (`Principal`, `Secondaire`, `Chemin`, `Jonction` pour les tracés ; `Eau`, `Remblais`, `Effondrement`, `Inaccessible` pour les zones). Si tu as renommé un type dans la légende d'un plan spécifique (par exemple « principal » → « route de surface » sur ton plan A), ce renommage **n'apparaît PAS ici** — c'est volontaire pour garder une vision cohérente cross-plan. Le renommage local reste visible normalement dans la modale Stats Globales **in-plan** du plan A.

> 📌 **Limitation cache** : pour les plans **jamais rouverts récemment**, seules les annotations de **session** (stockées localement) sont contribuées aux camemberts — pas les data layers embarqués du ZIP (les `data/*.json`). Si tu vois des "secondaire" / "level -1" qui te paraissent manquants, **rouvre le plan une fois** : le cache complet (incluant les data layers embarqués) sera regénéré automatiquement après ~800 ms. Au prochain retour à la home, les camemberts seront à jour.

Au fur et à mesure que tu ouvres tes plans et que leurs data layers se chargent, les camemberts s'enrichissent automatiquement avec les breakdowns réels.

#### 🎨 Stats du bandeau accueil

Section **"🎨 Stats du bandeau accueil"** : **choisis quelles stats apparaissent** dans le bandeau profil de la home (1 à 3 stats max).

**Pool disponible actuellement** :
- ⏱️ **Temps de session** : durée écoulée depuis le démarrage de l'app
- 💾 **Sauvegarde** : taille des données MyKTAMap stockées localement
- 🗺️ **Plans visités** : nombre de plans présents dans ton registre

**Règles** :
- **Cap dur de 3 stats max** : tu ne peux pas en activer plus de 3, même si tu coches plus
- **Au moins 1 stat requise** : tu ne peux pas tout décocher (le bandeau aurait un vide gênant)
- **Defaults** : `["time", "storage"]` (Temps + Sauvegarde) — choix terrain de KARMA

**Mise à jour instantanée** : le bandeau home se re-render **live** dès que tu coches/décoches sans avoir besoin de recharger la page.

#### 💾 Stat sauvegarde

La stat "Sauvegarde" (visible dans le bandeau home + dans la grid de la modale Profil) reflète la **taille réelle de tes données MyKTAMap** :

- **Calcul ciblé MyKTAMap** : on additionne uniquement ce que MyKTAMap a écrit dans ton navigateur — les clés `myktamap_*` et les 6 bases locales de l'app (handles, blobs, backups, photos, etc.). Le Cache PWA volatile (qui contient le code JS/CSS de l'app et n'est PAS une donnée user) est **exclu** du calcul.
- **Cache 30 s** : le calcul est cumulé puis mis en cache 30 secondes pour ne pas réinterroger le stockage en boucle quand tu ouvres/fermes des modales rapidement.
- **Tooltip** : "Taille des données MyKTAMap (LS + IDB)" + précision "hors Cache PWA".

Résultat : la valeur est **stable, prévisible, et reflète vraiment ce que tu as cartographié**.

**Import / export du profil** :

Ton profil est inclus dans l'**Export Avancé** des sessions (onglet 🎨 Avancé → section "Identité user"). Pratique pour transférer ton identité visuelle vers un autre appareil. À l'import d'un profil :

- Un toast modal te suggère un **reload** de la page pour que l'avatar et le surnom soient correctement mis à jour partout dans l'UI (header, sidebar, etc.)

**📄 Les PDF du Mode Histoire voyagent aussi** :

La fenêtre d'export gagne une case **📄 PDF du Mode Histoire**, **décochée par défaut**. Cochée, tes documents partent avec le profil et sont **remis en place à l'import**, avec leur nom et leur date d'origine. Sans elle, un profil réimporté arrivait avec tes notes libres mais **sans les documents** — l'onglet 📖 Récits était à moitié vide sans que rien ne l'explique.

> ⚠️ **Décochée par défaut, et pour une bonne raison** : un seul plan peut porter jusqu'à **100 Mo** de PDF. Le poids estimé s'affiche à côté de la case et compte dans le total de la fenêtre — au-delà du seuil, l'app demande confirmation avant d'exporter.
>
> 💡 Réimporter deux fois le même profil ne crée **pas** de doublons : chaque document reprend sa place.

> 🔒 **Sur une installation qui ne propose que les plans de son serveur** — celles où le bloc « Charger un nouveau plan » est absent —, l'**import de profil est refusé**, avec un message qui l'explique. Deux raisons : il rapporterait des plans que cette installation ne propose pas, et surtout il transporte vos préférences d'affichage — un profil où « afficher les plans du serveur » était décoché **vidait la liste**, sans laisser de réglage visible pour la retrouver. L'**export**, lui, reste disponible : votre carnet, vos sessions et vos notes vous appartiennent et sortent quand vous voulez.

**📦 Profil complet avec les archives de plans** :

L'export de profil peut désormais **embarquer les archives ZIP des plans mémorisés dans l'app**. Dans la fenêtre d'export, une section « 📦 Archives de plans » liste tes plans mémorisés avec leur taille : coche ceux que tu veux emporter (rien n'est coché par défaut) — l'export devient alors un fichier **`.zip` « profil complet »** au lieu du JSON habituel. À l'import sur un autre appareil, les archives sont **réinjectées et rattachées à leurs plans** : plus besoin de re-déposer les ZIP un par un.

- **Garde-fou de taille** : au-delà de ~50 Mo sur iPhone/iPad (Safari fragile sur les gros téléchargements) ou ~500 Mo ailleurs, un avertissement rouge demande une **confirmation explicite** — rien n'est bloqué, tu décides.
- **Honnêteté sur l'éviction** : si le navigateur a supprimé une archive pour libérer de la place (le flag « mémorisé » peut survivre à l'éviction), l'export te **liste les plans concernés** au lieu de produire un zip silencieusement incomplet.
- En mode **Fusionner** à l'import, un plan qui a déjà son archive sur l'appareil **garde la sienne** ; en mode **Remplacer**, celle du profil gagne. Un échec de stockage (quota plein) est signalé **par plan**, le reste continue.
- Les plans en « re-sélection » (et les anciennes entrées en « accès permanent au fichier ») n'apparaissent pas dans la liste : leur ZIP vit sur ton disque, pas dans l'app — il n'y a rien à embarquer.

> 🔒 **100 % local** : ton surnom et ta photo restent dans ton navigateur. Rien n'est envoyé à un serveur. L'export profil est explicite et contrôlé par toi.

#### 💼 Édition pro — importer une licence

Si l'auteur t'a remis un fichier **`Licence-pro.json`** (par mail, canal privé, etc.) suite à une demande de licence professionnelle, tu peux l'**importer directement** dans ton navigateur depuis la modale profil pour activer l'édition pro **sur cet appareil uniquement**.

**Section dédiée dans la modale Mon profil** :

- **Si tu es en mode communautaire** (état par défaut) : un bouton **📂 Importer une licence pro** apparaît. Au clic, file picker `.json` → tu sélectionnes ton fichier → validation immédiate → toast de confirmation. Le mode pro est activé : le footer du loader bascule (✓ Licence pro active), le splash affiche « Édition professionnelle », les écrans gates retirent le lien « Licence pro » (redondant désormais).
- **Si une licence locale est active** : un bouton **🗑️ Retirer la licence locale** permet de revenir au mode communautaire. La licence reste disponible dans le fichier original si tu veux la ré-importer plus tard.
- **Si une licence serveur est active** (instance déployée par un admin avec `Licence-pro.json` à la racine du serveur) : badge ✓ seul, pas de bouton — c'est l'administrateur du serveur qui décide.

**Format du fichier** : JSON minimum `{"instance":"pro","license_hash":"MKTM-LIC-..."}`. Si le hash est manquant ou mal formé (format strict `MKTM-LIC-` + 32 caractères hexadécimaux), le fichier est refusé avec message d'erreur.

**🆕 Voie d'accès au premier chargement** : si tu installes MyKTAMap pour la première fois sur un nouvel appareil (= écran de saisie du **code communautaire** au boot), sous le formulaire du code tu trouveras désormais un second bloc séparé par « ou » avec un bouton **📂 Importer ma licence pro**. Au clic, file picker `.json` → tu sélectionnes ton fichier → si OK l'app entre **direct en mode pro** (pas besoin de saisir le code communautaire). Pratique pour les utilisateurs pro qui découvrent l'app : pas besoin de demander le code communautaire à un tiers, la licence pro est un canal d'accès légitime en soi.

> 🔒 **100 % local** : le fichier de licence est lu par le navigateur puis conservé dans ton stockage local. Il n'est **jamais envoyé à un serveur**, jamais transmis. Aucune connexion réseau n'est ajoutée.

> ⚖️ **Valeur juridique** : le hash `MKTM-LIC-...` qui figure dans le fichier est **nominatif** — lié à un contrat précis entre l'auteur et le titulaire de la licence. **Sa reproduction ou son partage à un tiers non autorisé constitue une infraction contractuelle** (l'auteur peut faire valoir ses droits). Le mécanisme côté navigateur reste cosmétique : il ne vérifie pas cryptographiquement le hash, c'est la signature du contrat qui fait foi.

### 📚 Gestion de votre liste de plans

L'application mémorise tous les plans que vous chargez, qu'ils viennent du serveur ou de votre disque local.

**Sur l'écran d'accueil :**

| Symbole | Signification |
|---|---|
| 🌐 | Plan serveur (sous-dossier de `data/`) |
| 💾 | Plan ZIP local |
| ✅ | Plan local **mémorisé dans l'app** (rechargement instantané, fonctionne hors-ligne) |
| 🔐 | Ancienne entrée en **accès permanent** (mécanisme retiré le 15/09/2026 — à sa prochaine re-sélection, le plan passe en ✅ mémorisé) |
| 📁 | Plan local sans persistance — re-sélection requise au chargement |

#### 💾 Rendre un plan serveur disponible hors-ligne

Un plan **local** vit déjà dans ton navigateur : il fonctionne hors-ligne sans rien faire. Un plan **serveur**, non — et jusqu'ici il ne survivait que par le cache automatique de l'app, ce qui **ne suffisait pas** :

- l'app ne garde qu'un nombre limité de fichiers récents, et **un gros plan dépasse ce nombre à lui seul** : il chassait ses propres morceaux en se chargeant. Hors-ligne, tu n'avais pas une erreur mais une carte **trouée** ;
- seules les tuiles que tu avais **affichées** étaient gardées — ouvrir un plan sans zoomer n'en gardait qu'un niveau ;
- et **chaque mise à jour de l'app remettait tout à zéro**.

Ouvre la fiche **ℹ️ Infos** d'un plan serveur : une section **💾 Disponibilité hors-ligne** te propose de **tout télécharger** — image, données et **toutes les tuiles de tous les niveaux de zoom** — dans un espace réservé qui **survit aux mises à jour**.

| Ce que tu vois | Ce que ça veut dire |
|---|---|
| **Non téléchargé** + bouton ⬇️ | Seul ce que tu as affiché est gardé, sans garantie |
| **✅ Disponible hors-ligne** + ↻ / 🗑️ | Tout est là. Le bouton de téléchargement **a disparu** — il est devenu « Mettre à jour » |
| **⚠️ Incomplet — n sur N** + ⬇️ | Téléchargement interrompu, ou fichiers effacés par le navigateur : le bouton **revient** pour compléter |
| **✅ Disponible, mais n introuvable(s)** + ↻ | Le serveur n'a pas fourni certains fichiers déclarés par le plan. L'app **te dit lesquels** : le plan est utilisable, et tu peux corriger ton déploiement puis « Réessayer » |

**🔎 Et l'app te dit si le serveur a changé**. Un plan téléchargé est servi depuis ton téléphone, sans jamais redemander au serveur — pratique, mais il pouvait rester périmé **sans que rien ne le dise**. À l'ouverture de la fiche, l'app vérifie maintenant, fichier par fichier, si quelque chose a bougé côté serveur et affiche l'un des trois verdicts : **⚠️ Mise à jour disponible**, **✓ À jour**, ou **Impossible de vérifier** (hors-ligne, ou plan téléchargé avant cette version). *Elle ne dit jamais « à jour » sans avoir réellement vérifié.*

> 💡 **L'état est lu du cache réel, pas d'une case mémorisée.** Si le navigateur fait le ménage dans son stockage, l'app le voit et te repropose le téléchargement — au lieu d'afficher « disponible » sur du vide et de te le faire découvrir en cavité.

**Actions disponibles** sur chaque ligne :

- **⭐/☆** — épingle/désépingle le plan en tête de liste
- **ℹ️** — ouvre une fenêtre **Infos détaillées** sur cette archive (id interne, nom, version, auteur, type, fichier source, taille, persistance, mode V1/V2/multi-niveau, préset performance, dates d'ajout et d'ouverture), le **✏️ renommage d'affichage** *(nom local, 40 caractères max, pratique pour différencier deux plans homonymes ; champ vide = retour au nom d'origine ; le vrai nom du plan reste utilisé pour les vérifications de fichier)*, l'édition des **🏷️ tags**, et — en fin de fenêtre — le bouton **🗑️ Retirer de la liste** *(le ✕ des lignes a disparu : la suppression demande confirmation ici, fini le retrait accidentel)*. Retirer un plan n'efface pas le fichier ZIP sur votre disque, mais supprime l'archive éventuellement mémorisée dans l'app. Si le plan a des **documents d'histoire** (PDF du Mode Histoire), la confirmation propose une case **« Supprimer aussi ses documents (X Mo) »**, décochée : laissée telle quelle, ils restent lisibles dans 📔 Mon carnet → 📖 Récits.
- **Clic sur la ligne** — charge le plan

**Boutons en haut de la liste :**

- **💾 Exporter ma liste** — télécharge un fichier `myktamap_plans_AAAAMMJJ.config` que vous pouvez sauvegarder ou partager.
- **📂 Charger une liste** — importe un fichier de liste précédemment exporté. Trois choix : Remplacer, Fusionner, ou Annuler.

**Filtres d'affichage & organisation** :

- **🌐 Afficher les plans serveur** — cochez/décochez ce toggle au-dessus de la liste pour masquer les plans serveur découverts automatiquement (test1, test2, démos…) et ne voir que vos plans persos. **Préservé** entre les sessions (sur cet appareil). Décocher ne supprime rien — recocher → les plans réapparaissent intacts.
- **📁 Dossiers** — à droite du titre « 📚 Mes plans », un sélecteur **Tout | Dossiers** (toujours visible). En mode **Dossiers**, ta liste se range en sections que tu crées toi-même (➕ dans la ligne de titre) : « Gironde », « Calcaire », ce que tu veux, avec une **couleur** par dossier, reprise en pastille devant le nom du plan dans les deux modes. Un plan est dans **un seul** dossier ; les autres sont dans « Non classés », en dernier. Pour ranger : **☑ Sélectionner** un ou plusieurs plans puis « Déplacer vers… » (la barre reste en tête de liste), ou **glisser** la ligne sur l'en-tête d'un dossier : à la souris sur PC, ou au doigt par un **appui long** (la ligne se soulève après une demi-seconde ; un doigt qui bouge tout de suite fait défiler la liste, comme d'habitude). Les en-têtes se replient ; ⋮ sur un en-tête = renommer, couleur, monter/descendre, supprimer (ses plans repassent en Non classés, **aucun plan n'est jamais supprimé**). **🏷️ Règle par étiquette** : dans ⋮, « inclut aussi les plans étiquetés… » range tout seul les plans qui portent l'étiquette, les prochains aussi — et en mode Tout, des chips cochées proposent « 📁 Créer un dossier depuis ces étiquettes ». Déplacer un plan à la main l'emporte toujours sur une règle. La **pastille** devant le nom dit lequel des deux s'applique : **pleine** = rangé explicitement (à la main, par l'import multiple ou par le serveur), **creuse** = venu par une règle — il suit ses étiquettes, retire l'étiquette et il quitte le dossier. Les dossiers **voyagent avec ton profil** ; un serveur (ConfAdmin) peut en proposer : ceux-là ne se renomment ni ne se suppriment tant que le serveur les déclare, mais tu restes libre d'y déplacer ou d'en sortir un plan. L'import multiple 📦 propose « Ranger dans : » pour tout un lot. Le mode Tout est l'écran habituel, inchangé.
- **🔎 Filtrer par nom** — un champ au-dessus de la liste filtre en direct pendant la frappe. Filtre d'affichage pur, remis à zéro au prochain passage sur l'accueil.
- **⭐ Épingler** — l'étoile de chaque ligne remonte le plan **en tête de liste** (les épinglés gardent entre eux le tri « dernier ouvert »). Re-clic pour désépingler.
- **🖼️ Tuilage de ce plan** — le sélecteur qui vivait au-dessus du bouton « Charger ce plan » **a disparu** : l'app décide seule (« Auto »), ce qu'elle faisait déjà pour la quasi-totalité des plans. Il n'agissait en réalité que sur les plans **non découpés à la génération (V1)** de très grande taille ; sur un plan déjà découpé, « Désactivé » ne changeait rien. Le réglage vit désormais dans **ℹ️ Infos**, et **uniquement pour les plans qu'il concerne** — et contrairement à l'ancien, il est **mémorisé** pour ce plan au lieu de repartir à zéro à chaque démarrage.
- **🔒 Sur une installation protégée, aucune licence pro n'ouvre à la place du mot de passe** — si l'installation a défini son mot de passe, ni **ton propre** fichier de licence importé, ni la licence fournie **par l'installation elle-même**, ne déverrouille l'app : le mot de passe reste demandé. Ta licence peut activer le **mode pro**, mais l'accès passe par le mot de passe. (Une installation qui n'a **pas** de mot de passe, elle, s'ouvre toujours directement avec la licence.)
- **🔑 Le mot de passe de l'instance à l'écran de code** — si l'app t'est servie par une instance qui a défini **son** mot de passe (association, club), c'est **celui-là** qu'il te faut : sur une instance protégée, le code communautaire n'ouvre pas. Si le déployeur change ou retire son mot de passe, l'app te le redemande **au démarrage suivant** — mais **hors ligne, ton accès reste valable** : une coupure réseau ne t'enferme jamais dehors. ⚠️ *Comme le code communautaire, c'est une barrière **sociale**, pas une authentification : l'empreinte du mot de passe est dans un fichier public.*
- **🔎 « Retrouver les noms »** — si un camembert affiche encore un type personnalisé sous son identifiant (`cust-…`), un bouton apparaît sous le graphique. Il va chercher le nom **dans tes plans eux-mêmes**, sans que tu aies à les ouvrir un par un : pour un plan de ton serveur, il demande son descriptif à ce serveur ; pour un plan local, il lit l'archive déjà mémorisée. **Il annonce combien de plans il va lire, et ne part qu'au clic.** Les noms trouvés sont gardés **définitivement** — l'opération ne se refait pas, même après une mise à jour.
- **🏷️ Filtrer tes statistiques par étiquette** — au-dessus des camemberts du profil, une rangée d'étiquettes. **Un clic** ne garde que les plans qui la portent, **un deuxième** les exclut, **un troisième** revient à zéro. **Tous les camemberts suivent** — c'est là tout l'intérêt : sortir ton atlas départemental pour voir ce que tu as vraiment relevé ailleurs. Si un plan porte une étiquette incluse *et* une exclue, il est **écarté** : l'exclusion l'emporte toujours. Un nouveau camembert **« Plans par étiquette »** montre la répartition, avec une part « Sans étiquette » qui te dit ce qu'il te reste à taguer. Ce filtre n'est **pas mémorisé** : il repart à zéro chaque fois que tu rouvres la fenêtre.
- **🏷️ Types personnalisés dans les statistiques** — les camemberts du profil affichaient vos types personnels sous leur identifiant interne (`cust-…`) au lieu de leur nom. Leur nom vit **dans le plan** : l'app le mémorise à la **première ouverture** de celui-ci depuis cette version. Un plan jamais rouvert garde donc son identifiant, et une note sous le camembert vous le dit — ouvrez-le une fois, et son nom apparaît.
- **🏷️ Tags** — donnez des étiquettes à vos plans (« Paris 13 », « GTech », « à finir »…) via **ℹ️ Infos → Tags du plan** (saisie libre, séparées par des virgules — 12 max de 24 caractères). Elles s'affichent sous le nom du plan, et dès qu'un plan est tagué, une rangée de **chips-filtres** apparaît au-dessus de la liste : cliquez une ou plusieurs chips pour ne voir que ces plans (un plan matche s'il porte **au moins un** des tags choisis). Les tags vivent **dans l'app** (un ZIP généré avec le champ **🏷️ Étiquettes** du Générateur les **propose** à l'import, sans jamais écraser celles que vous avez posées) mais suivent l'**export de profil** et l'export 💾 de la liste.
  - **🌐 Les plans d'un serveur peuvent arriver déjà étiquetés** — si le déployeur a rempli les étiquettes dans sa liste de plans, elles s'affichent et se filtrent comme les vôtres, sans rien faire. **Les vôtres restent prioritaires** : dès que vous éditez les étiquettes d'un plan, le serveur ne les touche plus jamais, ni au démarrage suivant ni aux suivants. Et **effacer est un choix** : si vous videz le champ, elles ne repousseront pas. Pour revenir aux étiquettes du serveur, il n'y a rien à faire de spécial — retirez le plan de la liste, il sera redécouvert avec.

> 💡 **Astuce** — Si vous changez de PC ou de téléphone, exportez votre liste sur l'ancien appareil puis importez-la sur le nouveau pour retrouver tous vos plans en un clic. Note : les autorisations d'accès aux fichiers ne sont pas portables (vous devrez re-sélectionner les ZIP locaux la première fois sur le nouvel appareil). À la re-sélection, si vous fournissez un ZIP dans un autre mode (ex: vous aviez ce plan en V2 mais le ZIP est un V1), un message d'avertissement vous le signale clairement avant de continuer.

### 🔐 Éviter de re-sélectionner le ZIP à chaque ouverture

Par défaut, l'app **mémorise chaque plan au premier chargement** : le ZIP est copié dans l'espace local du navigateur, rien à cocher sur l'accueil. Le réglage vit dans **⚙️ Configuration de l'accueil → « 💾 Mémoriser le plan dans l'app au premier chargement »** (activé par défaut ; désactivé, le ZIP est redemandé à chaque ouverture). Aux prochaines ouvertures :

- **0 clic**, le plan se charge directement
- Fonctionne **hors-ligne** (le ZIP est dans le navigateur, pas besoin de retrouver le fichier)
- Recommandé sur **mobile**

> ℹ️ **Le bouton « 🔐 Autoriser l'accès permanent au fichier » (Chrome/Edge) a été retiré le 15/09/2026.** Il faisait doublon : le ZIP était de toute façon copié dans l'app, et la référence vers le fichier n'était jamais utilisée. Les plans qui l'avaient continuent de s'ouvrir ; à leur prochaine re-sélection, ils passent en « mémorisé ».

> ⚠️ **Limites de stockage** :
> - **iPhone (Safari classique)** : ~50 Mo, peut être effacé après inactivité prolongée
> - **iPhone (PWA installée)** : jusqu'à 1 Go, persistant
> - **Android Chrome** : plusieurs Go disponibles
> - **PC** : très large
>
> Pour une persistance maximale sur iPhone, **installez l'application en PWA** (voir section 📱) avant de mémoriser vos plans.

> ⚠️ Si le quota est dépassé, un avertissement s'affiche et le plan reste utilisable mais demandera une re-sélection à chaque ouverture.

### 🗂️ Découverte automatique des plans serveur

Si l'application est hébergée sur un serveur avec plusieurs plans dans `data/` (par exemple `data/test1/`, `data/test2/`...), elle peut les détecter automatiquement via un fichier `data/index.json` :

**Format minimal** :
```json
{ "plans": ["test1", "test2"] }
```

**Format détaillé** (recommandé pour afficher les noms tout de suite) :
```json
{
  "plans": [
    { "id": "test1", "path": "data/test1", "name": "Plan Test 1", "version": "V1" },
    { "id": "test2", "path": "data/test2", "name": "Plan Test 2", "version": "V1" }
  ]
}
```

Au démarrage, ces plans apparaissent dans **Mes plans** marqués comme « découvert » et peuvent être chargés d'un clic.

### ⚙️ Modale "Configuration" (chargeur)

Sur la page d'accueil, un **bouton ⚙️ Configuration** dans le header du loader (à côté de 📖 Documentation et 🚨 Alertes) ouvre une modale unique qui regroupe tous les réglages du chargeur (tiling, performance, debug, mise à jour, reset) :

> **Ordre des sections dans la modale (de haut en bas, identique au UI)** :

1. **🌍 Application** — le **sélecteur de langue** de toute l'app (🇫🇷 Français · 🇬🇧 English · 🇪🇸 Español). C'est désormais le **seul endroit** où on la change en cours d'usage : elle a quitté ⚙️ Réglages du mode carte, où elle laissait croire qu'elle ne concernait que le plan ouvert — et où elle proposait de redémarrer l'app au pire moment, en pleine cavité. Elle reste choisissable sur l'écran de déverrouillage, avant d'entrer.

2. **🧩 Fonctionnalités optionnelles** — **🎬 Replay du tracker**, **🔥 Heatmap**, **🔋 Niveau de batterie** et **📳 Vibration haptique**, toutes **désactivées par défaut** (voir le chapitre du même nom). Une option coupée n'affiche rien **et n'écoute plus le capteur**. Quand le système refuse le capteur — la vibration sur iPhone, par exemple — l'option reste **affichée mais grisée, avec la raison**, plutôt que de disparaître sans explication.

> 🗺️ **La Vue OSM est active par défaut**. Si tu as au moins un plan calibré GPS, l'accueil affiche ta carte au-dessus d'un fond OpenStreetMap — et **demande donc ce fond à `tile.openstreetmap.org` dès son chargement**, sans clic. **Aucune donnée de tes plans ne sort** : seules les coordonnées des tuiles que tu regardes sont demandées, le reste est dessiné par-dessus sur ton appareil. Un bandeau te le dit la première fois. Pour la couper : la case ci-dessus. **Si tu l'avais déjà décochée, elle le reste** — un refus n'est jamais réécrasé. Et rien ne part en **mode hors-ligne strict**, en **incognito**, ou si aucun plan n'est calibré.

> 🖼️ **Le tuilage de l'image n'est pas dans cette modale** — et il n'est plus non plus sur l'écran de chargement. Il était passé par les deux, sans jamais trouver sa place : il ne concerne en pratique que les plans **non découpés à la génération**, et sur les autres il ne changeait rien. Il vit désormais dans **ℹ️ Infos** du plan, seulement pour les plans concernés, et il y est enfin **mémorisé**.
>
> 🚀 **Les toggles Performance ULTRA non plus**. Ils s'affichaient ici mais **ne sauvegardaient rien** — ce sont des réglages **par plan** : ils se règlent dans **⚙️ Réglages**, une fois le plan ouvert. Voir « 🚀 Optimiser ton plan » plus bas.

3. **🛠️ Mode Développeur** — remplace l'ancienne section Debug. Protégé par **mot de passe** à la première activation (avec avertissement de responsabilité). Une fois actif : toggle **🐛 Logs détaillés**, bouton **📋 Afficher les logs** (le buffer, consultable même sans plan chargé), et **📚 Documentation technique** — toute la doc du projet (architecture, backlog, maths…) lisible dans l'app (en ligne uniquement). Le réglage logs des ⚙️ Réglages en mode carte a été retiré : tout se pilote ici.

4. **🔒 Confidentialité & Audit** — section dédiée à la transparence : journal réseau live, doc « Que fait l'app sur le réseau ? », et toggle « Mode hors-ligne strict ». Voir section dédiée plus bas.

5. **🎨 Affichage** — toggles d'interface :
   - **🔎 Icônes qui grossissent au zoom**, **📌 Ancrer les panneaux d'outils au bouton**, **🧲 Magnétisme au dessin** et son **rayon** — ces quatre-là valent pour **tous tes plans**. Ils vivaient dans ⚙️ Réglages du mode carte, où on les changeait depuis un plan sans savoir qu'on les changeait partout.
   - **🔆 Garder l'écran allumé** — empêche la mise en veille automatique de ton écran tant que MyKTAMap est ouvert (Wake Lock API). Utile en sortie cataphile pour ne pas avoir à toucher le tel toutes les 30 sec. Re-acquisition auto au retour d'arrière-plan (visibilitychange). Toggle masqué automatiquement sur les navigateurs qui ne supportent pas l'API (Firefox notamment). Le même toggle est aussi accessible dans **⚙️ Réglages** en mode carte (cf section dédiée).

> 📊 **Voir l'état mémoire** — dans cette même modale, un bouton **« 📊 Voir l'état mémoire »** ouvre l'**inspecteur** : ce que l'app occupe sur ton appareil (clés de stockage triées par taille, bases de données, cache de l'application, quota du navigateur) et ce qui est chargé à l'instant. Un bouton **📋 Copier le rapport** produit un texte prêt à coller pour signaler un problème.

> ❓ **Bouton d'aide dans les fenêtres** — pose un petit **❓** dans la ligne de titre des fenêtres qui ont une page d'aide : ⚙️ Réglages, 📊 Détails de la session, 🧭 menu Tracker, ⬆️ Enregistrer, ⬇️ Charger, ≡ Légende, 🔍 Recherche, 🚨 Secours, 📖 Mode Histoire, 🏗️ Générateur, 📔 Carnet, 🌍 Vue OSM, 👤 Profil, ℹ️ Infos du plan. Un appui ouvre **directement la bonne page**, sans passer par le groupe ❓ Aide. Décoche si tu préfères une interface sans cette icône : elle disparaît aussitôt, même des fenêtres déjà ouvertes.
>
> 🔔 **Notifications** — les petits messages qui apparaissent en bas de l'écran. Trois positions : **Toutes** (chaque geste est confirmé), **Essentielles** (**réglage de départ** ; plus de messages qui confirment un geste que tu viens de faire, comme « 2 plans déplacés » ou « copié » ; les messages d'état restent, sans vibration), **Silence** (seuls les messages importants : batterie faible, capteurs refusés, erreurs). Les **alertes du serveur** et les fenêtres qui te demandent une décision ne sont **jamais** coupées. Au chargement d'un plan, les messages « session restaurée, filtres, photos » sortent désormais en un seul.

> 📔 **Tenir un carnet de mes sorties** — chaque plan que tu ouvres devient une **sortie** archivée dans 📔 Mon carnet (durée, distance, ajouts, photos). Décoché, l'app n'ouvre plus rien toute seule et la sortie en cours s'arrête ; ce qui est déjà dans le carnet reste, et tu peux toujours en démarrer une à la demande depuis **📊 Détails de la session**. *(Réglage déplacé ici depuis ⚙️ Réglages du mode carte : il vaut pour tous tes plans, et le carnet s'ouvre depuis l'accueil.)*

> 🌍 **Langue de l'application** : MyKTAMap est traduit en **3 langues — Français, English, Español**. Le sélecteur de langue (drapeau + nom complet) est dans **⚙️ Configuration → 🌍 Application**, tout en haut de la modale. Le changement s'applique tout de suite, sans recharger l'app. *À savoir* : la **Documentation** (ce guide) et le **tutoriel de bienvenue** existent dans les **3 langues** — ils suivent ta langue d'app automatiquement, et le bouton drapeau en haut de la fenêtre Documentation te laisse basculer 🇫🇷 / 🇬🇧 / 🇪🇸 quand tu veux. L'**Aide intégrée** (le 📚 de la barre latérale en mode carte) aussi. À chaque changement de langue, un message te propose de **redémarrer l'app** pour une bascule 100 % propre (au choix). 💡 En **mode incognito**, ta langue d'interface est désormais **conservée** (les autres données restent, elles, totalement oubliées).

> 💡 L'option « Afficher les ronds aux intersections de tracés » n'est **pas dans Configuration home** mais dans **⚙️ Réglages en mode carte** (per-plan). Chaque plan a maintenant son propre réglage — pratique pour désactiver les cercles uniquement sur tes plans très denses sans toucher les autres.

6. **📚 Plans serveur** — checkbox **"🚫 Ne pas charger les plans serveur au démarrage"** :
   - **Désactive l'auto-discovery** du fichier `data/index.json` au boot de l'app — l'app ne va plus interroger le serveur pour lister les plans de démo ou les plans publics hébergés.
   - **Masque le toggle "🌐 Afficher plans serveur"** du home (devient inutile puisqu'il n'y a plus rien à afficher).
   - **Exclut les plans serveur des stats agrégées** de la modale Profil → ne fausse plus le count "Plans visités" avec des plans que tu n'utilises jamais.
   - **Reload requis** pour effet complet (l'auto-discovery se fait au splash, pas en cours de session).
   - **Default OFF** (rétrocompatibilité absolue — l'app continue d'auto-découvrir les plans serveur tant que tu n'as pas explicitement coché cette case).

   > 💡 **Cas d'usage** : tu utilises MyKTAMap uniquement avec tes propres plans locaux et tu ne veux pas voir les plans de démo / tests du serveur qui polluent ta liste. Coche cette case → reload → ta liste 📚 Mes plans ne contient plus que TES plans.

7. **🔐 Code d'accès local (PIN / Face ID)** — verrouille l'app à chaque démarrage par un code 4-6 chiffres + Face ID / Touch ID si l'appareil le supporte. 100 % local (jamais envoyé sur Internet). 5 codes faux = verrou **temporaire** (10 min, puis 1 h, 6 h, 24 h), jamais définitif. Aucune récupération du code en cas d'oubli. Voir section dédiée **🔐 Code d'accès local (PIN / Face ID)** plus bas pour le détail complet (activation, modification, désactivation, lockout).

8. **🔄 Mise à jour — Forcer la mise à jour douce** — re-télécharge la dernière version du code (purge du cache PWA, garde tes données et tes plans). Utile si tu suspectes que ton app reste sur une vieille version après une release. Ne touche **jamais** à tes plans, ta session active, ton code communautaire ni ton PIN local. **Confirmation obligatoire avant déclenchement** (modale bleue qui détaille ce qui est préservé + besoin d'une connexion Internet active).

9. **💥 Tout réinitialiser (reset complet)** — purge totale : le cache, tout ce qui est enregistré dans ton navigateur, et tes plans. Reset le code d'accès communautaire **ET** le PIN local si configuré. **Double confirmation requise.** Action irréversible.

**Organisation** : **tout est regroupé dans une seule modale ⚙️ Configuration**, accessible depuis le header du loader. Le bouton 🏗️ Générer un plan reste visible directement dans la home (pas dans la modale Configuration) car c'est une action de création, pas un réglage.

### 🎚️ Découpage de l'image — l'app décide

**Il n'y a plus rien à régler ici.** Le bandeau *« 🖼️ Tuilage pour ce chargement »*, qui vivait juste au-dessus
du bouton **▶️ Charger ce plan**, **a été retiré** : l'app découpe automatiquement les plans trop grands pour
être affichés d'un bloc, et c'était déjà ce qu'elle faisait pour la quasi-totalité d'entre eux.

> 🩸 **Pourquoi il est parti.** Il ne servait qu'aux plans **non découpés à la génération** (« V1 ») et de très
> grande taille. Sur un plan **déjà découpé** — le cas courant, et la méthode conseillée — « Désactivé »
> **ne changeait rien** : le plan utilise toujours ses morceaux. Il occupait donc la place la plus visible de
> l'écran de chargement pour un effet quasi nul. Et il n'était **pas mémorisé** : il repartait sur « Auto » à
> chaque démarrage de l'app — un réglage qui s'oublie tout seul n'en est pas un.

**Où il est passé** : dans **ℹ️ Infos** du plan, et **uniquement pour les plans que ça concerne** — s'il
n'apparaît pas, c'est que votre plan est déjà découpé et que le réglage n'aurait aucun effet. Là, il est
**mémorisé pour ce plan** et s'applique à tous ses chargements suivants.

| Choix | Ce qu'il fait |
|---|---|
| 🔄 **Auto** *(défaut)* | Découpe automatiquement les plans trop grands pour être affichés d'un bloc. **C'est le bon choix dans tous les cas.** |
| 💤 **Désactivé** | Aucun découpage : l'image entière d'un coup. Qualité native sur PC, mais ⚠️ **peut faire planter le téléphone** sur un très grand plan — un message vous prévient si c'est le cas. |

> 🩸 **Il y avait 5 boutons auparavant** (🌟 Qualité, 🎯 Équilibré, ⚡ Performance). Ils ne réglaient que
> le découpage fait **par le navigateur au chargement**, qui ne concerne que les plans **anciens**. Sur un plan
> **déjà découpé à la génération**, ils ne changeaient **strictement rien**, alors que l'app affichait « Plus
> net. Recommandé sur PC desktop. ». Ils ont été retirés.

> 🩸 **Et « Auto » protégeait moins bien que les autres, alors que c'était le défaut.** Il se décidait sur le
> **poids du fichier** (60 Mo) quand les autres se décidaient sur la **taille en pixels**. Un plan de 100
> millions de pixels bien compressé pèse ~15 Mo : « Auto » ne le découpait pas, et l'app pouvait planter sur
> iPhone. Corrigé : c'est désormais la taille en pixels qui décide.

### 🎨 L'interface en mode carte

> MyKTAMap utilise une interface en mode carte **claire, tactile et adaptée mobile-first**. La page d'accueil PC est en plein écran, les modales s'agrandissent sur grand écran, et le splash affiche la signature KARMA animée + les crédits des librairies (🍃 Leaflet · 📦 JSZip · 📤 jsPDF · 🧭 Dijkstra).

**Présentation visuelle** :

- **🌟 Header bar persistant en haut** (44px sticky) :
  - Rose des vents cliquable à gauche — retour à la home (avec garde-fou si session modifiée)
  - Nom du plan + version au centre, **cliquable** pour ouvrir la modale **"🗂 Changer de plan"** (avec carte highlight du plan en cours + liste des récents + CTA "Voir tous mes plans")
  - **Compteurs cliquables** à droite : 📍 points · 🛣 tracés · ⬛ zones — au clic, modale **"📊 Détails de la session"** qui liste tous tes éléments avec leurs infos
- **📊 Status bar en bas** (52px, s'agrandit dynamiquement) — regroupe en permanence les mesures live :
  - 📐 Mesure simple (si ≥ 2 points posés)
  - 📏 Distance totale des tracés (si surlignage magenta actif) — **cliquable pour ouvrir la modale**
  - 🗺️ Itinéraire (distance + temps + mode) — **cliquable pour ouvrir la modale Itinéraire**
  - 🧭 Tracker GPS — **boussole LED ON (vert) / OFF (rouge)** toujours visible
  - Si tout est actif et que ça ne tient pas, le footer **s'agrandit automatiquement et passe à la ligne** — aucune info coupée
  - Gros bouton ▾▴ à droite pour réduire / agrandir le footer manuellement
- **Sidebars unifiées gauche/droite** — chaque côté est une **seule barre verticale continue** :
  - **Gauche** : ⊞ Layers · − + Zoom · 🏗 Niveau · ≡ collapse · 📚 Doc · ⚙ Réglages · ⬇ Charger · ⬆ Save
  - **Droite** : ≡ collapse · 🔍 Recherche · ✏️ Édition · 📐 Mesure · 🛣 Tracés · ⬛ Zones · 🧭 Tracker
  - **Panneaux d'outils** : ils s'ouvrent **centrés à l'écran** (Tracés, Zones, Structures, comme le Tracker et les Filtres) ; l'option « 🪟 Ancrer les panneaux d'outils au bouton » (⚙️ Configuration) restaure l'ancrage au bouton.
- **🧭 Boussole d'orientation** :
  - En portrait : en **bas-gauche** au-dessus du footer
  - En landscape : en **bas-centrée** (pour ne pas cacher les icônes latérales)
- **Boutons ≡ de réduction** en haut de chaque sidebar (▾ déployé, ▸/◂ replié) — gagne de la place sans arrêter les modes actifs
- **Modale "📊 Détails de la session"** : un clic sur les compteurs du header ouvre le **tableau de bord** du plan :
  - En tête, **✅ Enregistré il y a N s** (rouge si la sauvegarde échoue)
  - Stats agrégées, et répartition par niveau en multi-niveau
  - Tous tes points (tag, coordonnées, niveau), les tracés par type avec distance, les zones, les structures, les photos
  - Les autres mesures (📐 mesure, 🗺️ itinéraire et ses étapes, 🧭 suivi)
  - **📔 Sortie en cours** : 🏁 Clôturer, 🧭 Affiner le tracé, ouvrir le carnet. **Si aucune sortie n'est en cours**, un bouton **📔 Démarrer une sortie** en ouvre une sur ce plan — il fonctionne même quand « Tenir un carnet de mes sorties » est décoché dans ⚙️ Réglages, et c'est alors le seul moyen d'en enregistrer une. Une seule sortie à la fois : tant qu'une tourne, le bouton laisse la place à 🏁 Clôturer.
  - **⭐ Favoris** : exporter ceux de ce plan ou de tous, importer
  - **📦 Backups récents** de ce plan : ↻ Restaurer, 📆 Snapshot maintenant, 🗑️ Tout vider — chaque suppression demande confirmation
  - Le bouton **📊 Stats globales** (rapport copiable, CSV, PDF)
- **Modale "Changer de plan" refondue** : carte highlight du plan en cours avec badge `● ACTIF`, liste des plans récents avec animation au survol, gros bouton bleu "📚 Voir tous mes plans" en bas
- **Générateur de plan retiré du mode carte** : reste accessible **uniquement depuis la home** via 🏗️ Générer un plan (création hors du mode carte)

### 💾 Sauvegarde automatique de votre session

Vos **annotations en cours** (points ajoutés, tracés, zones, mesures) sont automatiquement sauvegardées en arrière-plan toutes les ~1,5 secondes. Ainsi, si vous fermez l'application et la rouvrez via **▶️ Reprendre**, votre travail est restauré.

**Comment ça marche :**
- À chaque modification, votre session est sauvegardée dans le navigateur, **dans un emplacement propre à chaque plan** : travailler sur un autre plan n'écrase plus la session du premier
- Au prochain lancement, si vous cliquez sur **▶️ Reprendre [nom du plan]**, votre session est restaurée — une **fenêtre centrée** vous confirme avec le détail (*"3 points · 1 tracé · 2 zones"*)
- La fenêtre vous propose deux actions : **🗑️ Effacer la session** (commencer ce plan avec une session vierge) ou **✓ Continuer** (garder la session restaurée). Cliquer en dehors ou appuyer sur Échap = Continuer.

**Important :**
- Chaque plan garde sa propre session : revenir sur un plan quitté restaure ce que vous y aviez laissé
- Le **chemin du tracker** n'est pas restauré (le tracker étant expérimental, ressusciter une trail figée serait trompeur)
- Le **💥 Tout réinitialiser** efface aussi votre session sauvegardée
- Pour conserver une session importante au-delà de l'auto-save, utilisez **⬆️ Exporter la session JSON** (sauvegarde explicite que vous pouvez ré-importer plus tard)

### 📔 Mon carnet — l'historique de vos sorties

La sauvegarde automatique ci-dessus garde **l'état courant** d'un plan. Le **carnet**, lui, garde **l'histoire** : chaque fois que vous explorez un plan, une **sortie** est archivée avec sa date, sa durée, la distance parcourue et ce que vous avez ajouté. Effacer une session ne supprime pas les sorties déjà rangées au carnet.

**Y accéder :** tuile **📔 Mon carnet** sur l'écran d'accueil, dans la carte « 🧰 Outils » (grille sous « 📦 Ajouter un plan », visible aussi sur mobile). Aucun plan à charger. Depuis un plan : modale **Session** → section **📔 Sortie en cours**.

**Ce que contient une sortie :**
- la date, la **durée** (du départ à la fin pour une sortie de terrain ; temps d'utilisation de l'app pour du travail sur plan) et la **distance parcourue** au tracker,
- le nombre de **points, tracés, zones et structures ajoutés**,
- le **tracé de votre déplacement** (mini-carte dans la fiche),
- les **photos prises pendant la sortie** (le carnet ne les recopie pas : il pointe vers vos photos existantes — si vous en supprimez une, sa vignette devient « 🚫 »),
- une **note libre** que vous écrivez quand vous voulez, même des semaines plus tard.

**🚶 Sortie terrain ou 🖥️ travail sur plan ?**

Le carnet fait la différence tout seul, et c'est important : préparer un plan chez soi n'est pas une sortie.

- Si vous vous êtes **déplacé** pendant la session → **sortie terrain**. Un seul **« 📍 Je suis ici »** suffit : vous affirmez être physiquement passé par un point, c'est une sortie, même tracker éteint.
- Si vous n'avez fait qu'**annoter sans bouger** → **travail sur plan**, rangé dans une section repliée à part, en bas du carnet.
- Les **totaux** en haut du carnet (nombre de sorties, temps, distance) ne comptent **que le terrain** — le temps passé à dessiner à la maison n'a rien à y faire.
- L'app s'est trompée ? Ouvrez la fiche et cliquez **🚶 Classer en sortie terrain** (ou l'inverse). Depuis un plan, les mêmes boutons **🚶 / 🖥️** sont dans la modale **Session**, section 📔, à côté de « Clôturer ma sortie ». Votre correction est définitive, elle ne sera jamais recalculée.

**📏 La distance quand vous n'utilisez pas le podomètre**

Vous naviguez souvent sans le tracker : vous marchez, et de temps en temps vous faites **« 📍 Je suis ici »** sur un point. L'app **relie ces repères entre eux** pour estimer ce que vous avez parcouru — et elle suit les **galeries** pour le faire, pas la ligne droite (dans un réseau labyrinthique, la ligne droite raconterait n'importe quoi).

Concrètement : vous partez de **A**, vous passez par **C**, puis vous rejoignez **B** → l'app compte A→C, puis C→B.

- Cette distance est toujours **annoncée comme estimée** (« 820 m dont 600 estimés ») : elle ne se fait jamais passer pour une mesure.
- ⏱️ **Pendant la sortie, le chiffre est volontairement prudent** : l'app compte à vol d'oiseau, pour que « 📍 Je suis ici » reste **instantané** sous terre. Le calcul qui suit les galeries se fait **une seule fois, quand la sortie est rangée dans le carnet** — c'est pourquoi la distance **augmente** à ce moment-là. Sur un très grand plan, l'app peut renoncer à ce calcul final : elle garde alors la distance à vol d'oiseau plutôt que de se figer.
- 🧭 **Le bouton « Affiner le tracé »** (modale **Session**, section 📔) fait le calcul **quand vous voulez**, sans attendre la fin : il recalcule la distance **et redessine le trajet** en suivant les galeries entre vos repères. Le compteur à côté indique combien de tronçons attendent. Sur un plan très volumineux, l'app prévient que ça va la bloquer quelques secondes et vous laisse décider.
- ⚠️ **Ce trajet redessiné est une reconstitution, pas un relevé.** L'app suppose que vous êtes allé d'un repère à l'autre par le chemin le plus court : un détour, une galerie explorée puis abandonnée, un demi-tour n'y apparaîtront pas. Il s'affiche donc **dans la fiche de la sortie uniquement**, avec la mention qui va bien — vos **exports GPX/KMZ et la heatmap gardent le tracé réellement enregistré**, jamais la reconstitution.
- Si le podomètre **a** mesuré entre deux repères, c'est lui qui compte — jamais les deux à la fois.
- Un **clic sur la carte** pour corriger votre position ne compte pas comme un trajet, et une **traversée de portail** vers un autre plan non plus.

**Quand une session est-elle archivée ?**
- **Automatiquement** quand vous quittez le plan (changement de plan ou retour à l'accueil) — mais pas tout de suite : la sortie est d'abord **mise en pause 2 heures** (revenez sur le même plan et elle reprend, cf. « Reprise » plus bas). Passé ce délai, elle est archivée si **l'une** de ces conditions est remplie :
  - **50 m parcourus** (mesurés au podomètre ou estimés entre vos « 📍 Je suis ici »),
  - **ou** 10 minutes de travail réel **et** au moins une annotation.
  - En dessous, rien n'est conservé — ouvrir un plan 20 secondes pour vérifier un détail ne pollue pas le carnet.
- **À la main** avec **🏁 Clôturer ma sortie** : elle est rangée sans condition, et une nouvelle démarre aussitôt. Pratique pour découper une longue journée en étapes — et c'est le geste sûr si vous tenez à garder une session courte.

**📖 L'onglet Récits — vos notes et PDF de plan, enfin réunis**

Le **Mode Histoire** (note libre + PDF) vit dans l'écran d'un plan : pour relire vos notes sur une carrière, il faut charger la carrière. Le second onglet du carnet, **📖 Récits**, les rassemble **tous plans confondus, sans rien charger** :

- la liste montre chaque plan ayant une note ou un PDF, avec un extrait de la note ;
- ouvrir une fiche affiche la note **mise en forme** (Markdown) et permet de la **modifier sur place** — c'est bien la même note que dans le Mode Histoire du plan, pas une copie ;
- les **documents PDF** du plan sont listés : clic pour ouvrir, 🗑️ pour supprimer, **➕ Ajouter un PDF** pour en joindre un nouveau — le tout sans charger le plan.
- 📕 Un PDF **livré dans le ZIP du plan** apparaît ici aussi, dès que tu as ouvert ce plan **une fois** : l'app en garde une copie sur ton appareil. Tu peux la supprimer comme un document à toi ; rouvrir le plan la remet.

**Bon à savoir :**
- Le carnet **démarre vide** : il ne peut pas reconstituer les sorties d'avant son arrivée, elles n'ont jamais été enregistrées en tant que telles.
- Tout est **strictement local** à votre appareil (aucun envoi, aucun compte). Chaque sortie est supprimable individuellement depuis sa fiche.
- Au-delà de **500 sorties**, les plus anciennes sont effacées automatiquement.
- Le carnet **est inclus dans l'export de profil** : changer d'appareil via l'export de profil transporte votre historique de sorties.

### 🧙 Générateur : assistant pas-à-pas

Le **Générateur** (🏗️) vous guide désormais **étape par étape**, comme un installateur : chaque page ne montre qu'une chose (nom, image, calques…), les étapes optionnelles se **passent** d'un clic, et un **résumé final** vous montre ce qui est rempli, passé ou manquant — avec des avertissements utiles (ex. sans géoréférencement GPS, pas de Vue OSM ni d'export KMZ) **avant** de générer. Un ZIP importé pré-remplit toutes les étapes : vous ne faites que relire. Les habitués retrouvent l'ancien affichage complet via **🗒️ Tout afficher** (choix mémorisé).

### 🔽 Pied de page repliable

La petite **flèche** sous l'écran d'accueil replie le pied de page (copyright, liens, crédits) pour gagner de la place — il n'en reste qu'une ligne minimale « © MyKTAMap · version ». Re-cliquez pour le déplier. Votre choix est mémorisé et voyage avec l'export de profil.

### 🐛 Logs détaillés (mode debug)

Le bouton **🐛 Logs détaillés** dans la modale **⚙️ Configuration** du chargeur active un mode verbose :
- Logs supplémentaires dans la console (capteurs du tracker, étapes du tiling)
- Affichage des **chiffres techniques** sous le sélecteur Mode performance (tailles de tuile, qualité JPEG, seuil de déclenchement)

Utile pour signaler un problème ou comprendre ce qu'il se passe sous le capot. Désactivé par défaut. Réglage aussi accessible depuis ⚙️ Réglages > Logs détaillés.

### ⚠️ Si l'application s'arrête brusquement

Sur smartphone, le système d'exploitation (iOS / Android) peut **fermer brutalement les applications qui consomment trop de mémoire**. Quand ça arrive, la prochaine fois que vous lancez MyKTAMap, une **fenêtre rouge "ATTENTION — ARRÊT BRUTAL DÉTECTÉ"** apparaît juste après le splash pour vous prévenir.

La fenêtre détaille :
- **Pourquoi** ça s'est produit (mémoire saturée la plupart du temps)
- **Comment éviter que ça recommence** : fermer les autres applications en arrière-plan, baisser le mode performance dans le loader, éviter d'ouvrir trop d'onglets de navigateur en parallèle, garder le smartphone à jour, exporter régulièrement votre session pour ne rien perdre

Si vous voyez cette fenêtre **régulièrement**, c'est le signe qu'il faut **réduire le mode performance** (Performance < Équilibré < Qualité, niveau de RAM décroissant).

### 📡 Utilisation hors connexion

MyKTAMap fonctionne **entièrement hors connexion** une fois le plan chargé une première fois.

L'application installe un **composant hors-ligne** (un « Service Worker ») qui met en cache automatiquement tous les fichiers nécessaires (interface, images, données). Au premier chargement avec connexion Internet, tout est sauvegardé localement.

**Pour préparer une sortie hors connexion :**

1. Ouvrez l'application **avant de partir**, avec une connexion disponible
2. Chargez votre plan complet — sur mobile, **cochez « 💾 Mémoriser dans l'app »** pour pouvoir le ré-ouvrir sans re-sélectionner le fichier
3. Naviguez quelques secondes pour que tous les fichiers soient mis en cache
4. Vous pouvez maintenant fermer l'application et passer en zone sans réseau — elle restera fonctionnelle

> Si une nouvelle version est disponible avec connexion, l'application se mettra à jour automatiquement au prochain chargement.

### ⚠️ Si un plan ne charge plus

Si vous cliquez sur un plan dans votre liste et qu'une fenêtre **« ⚠️ Plan introuvable »** apparaît, c'est que les données de ce plan ne sont plus accessibles. Causes typiques :

- **Vidage du cache** du navigateur (les ZIP mémorisés ont été supprimés)
- **Import d'une liste depuis un autre appareil** (la liste a été restaurée mais pas les ZIP eux-mêmes)
- **Réinstallation de l'application** ou changement de navigateur
- **Plan serveur déplacé/supprimé** (404)
- **Quota de stockage atteint** (le navigateur a purgé les données automatiquement)

La fenêtre vous propose 3 actions :

- **🔄 Réessayer** (plans serveur uniquement) — utile si le serveur était temporairement indisponible
- **📁 Re-sélectionner le ZIP** (plans locaux) — ouvre votre explorateur de fichiers pour retrouver le ZIP. Si le plan était mémorisé (ou en ancien « Accès permanent »), la persistance sera **automatiquement restaurée** après la nouvelle sélection
- **🗑️ Retirer de la liste** — si vous ne possédez plus le plan, supprimez son entrée de votre liste

> 💡 **Conseil** : exportez régulièrement votre liste via 💾 (icône en haut à droite de **📚 Mes plans**) pour pouvoir la restaurer en cas de souci.

### 💥 Tout réinitialiser

Si vous voulez remettre l'application **à l'état initial** (comme un premier lancement), un bouton **💥 Tout réinitialiser** est disponible à deux endroits :

- Dans **⚙️ Réglages** depuis l'application
- Dans **⚙️ Configuration** sur l'écran d'accueil (loader)

⚠️ **Cette action est irréversible** et efface :
- Le cache de l'application (mode hors-ligne désactivé jusqu'à reconnexion)
- Votre **liste de plans** (entrées supprimées)
- Les **ZIP mémorisés dans le navigateur** (perdus)
- Vos **préférences** (mode performance par plan, options de tracker, logs détaillés, etc.)

L'application demande **deux confirmations** avant d'exécuter le reset, et vous rappelle d'**exporter votre liste** au préalable si vous souhaitez la conserver.

> 📡 **Vérification connexion** : avant la première confirmation, l'application teste rapidement votre connexion Internet (max 5 secondes). Si vous êtes **hors ligne**, une **fenêtre rouge supplémentaire** vous prévient que l'application sera **inutilisable** après le reset (le cache vide ne pourra pas être rerempli sans réseau). Reconnectez-vous au Wi-Fi ou aux données mobiles avant de relancer le reset, ou cliquez "Continuer quand même" si vous savez ce que vous faites.

> Utile en cas de souci persistant, ou pour tester l'application "comme un nouvel utilisateur" lorsque vous publiez ou partagez votre travail.

### 🔒 Confidentialité & Audit réseau

**MyKTAMap est une application 100 % client-side. Aucune de tes annotations, sessions, plans ou données personnelles n'est jamais envoyée à un serveur, ni à un service tiers.** Et tu peux le vérifier toi-même.

La section **🔒 Confidentialité & Audit** dans la modale ⚙️ Configuration du loader te propose trois outils :

#### 📋 Voir le journal réseau

Ouvre un tableau en temps réel qui logue **toutes** les requêtes réseau émises par l'application (méthode, URL, catégorie, statut, et surtout s'il y a un *body* — c'est-à-dire des données envoyées).

Tu peux :
- **📋 Copier** le journal en JSON dans le presse-papier
- **📥 Exporter** le journal en fichier `.json` (à partager / archiver / faire auditer)
- **🗑️ Vider** le buffer

**À surveiller** : si tu vois apparaître une requête `POST`, `PUT`, `PATCH`, `DELETE`, `sendBeacon`, `WebSocket` ou `EventSource`, ou une URL externe (catégorie en rouge) autre que le ping de connectivité Google → **contacte l'auteur immédiatement** (Instagram **@karma_kta** ou **contact@myktamap.fr**) : ça contredirait la promesse de cette page.

#### 📖 Que fait l'app sur le réseau ?

Une fenêtre qui détaille :
- Le modèle technique (PWA pure, pas de backend)
- La **liste blanche** complète et nominative des URLs que l'app peut contacter
- Comment vérifier toi-même avec les outils de développement de ton navigateur (touche F12, onglet Réseau)
- Comment la Content Security Policy (CSP) du serveur protège en plus

Un bouton 📄 te permet d'ouvrir la **documentation complète** (`docs/NETWORK_AUDIT.md`) dans un nouvel onglet.

#### 🔒 Mode hors-ligne strict (opt-in)

Coche cette case si tu veux une **garantie active** côté navigateur : toute requête sortante non whitelistée sera **bloquée AVANT d'atteindre le réseau** (le navigateur reçoit une exception, pas un timeout).

Une fois activé :
- Un badge orange `🔒 MODE HORS-LIGNE STRICT ACTIF` apparaît dans le footer de la page d'accueil
- L'app continue de fonctionner normalement (annotations, calculs, exports PNG/KMZ, navigation, multi-niveau, itinéraire, tracker…)
- Seuls les pings de mise à jour vers Internet sont coupés (mais l'app reste utilisable avec sa version actuelle)

Le toggle est **persistant** (survit aux reloads et fermetures d'onglet) jusqu'à ce que tu le décoches ou que tu fasses un reset complet.

> 🛡️ **Niveau de garantie** : c'est une **triple protection** :
> 1. L'archi PWA rend la collecte techniquement impossible (pas de backend)
> 2. Le module d'audit JS logue + peut bloquer côté client
> 3. La Content Security Policy du serveur demande au navigateur lui-même de refuser toute connexion non autorisée
>
> Tu n'es jamais obligé de croire l'auteur sur parole : tout est vérifiable.

---

## 🌍 Vue OSM plein écran — recherche intégrée

Le bouton **⛶** du widget Vue OSM s'appelle désormais **« Ouvrir le mode OSM »** : la carte passe en plein écran. Une **barre de recherche** y apparaît :

- elle est posée **dans la ligne de titre « 🌍 Vue OSM »**, donc disponible aussi sur le widget réduit de l'accueil ;
- elle cherche **un plan** (parmi vos plans géoréférencés) ou **un point** (les POI de ces plans) — taper, cliquer un résultat, la carte vole dessus avec un marqueur ;
- **100 % local** : la recherche lit vos propres plans, aucune adresse internet n'est interrogée ;
- seuls les plans **géoréférencés** apparaissent — un plan sans calibrage GPS est invisible en mode OSM (calibrez-le via le Générateur ou les Réglages).
- ⚠️ **Un plan jamais ouvert n'y apparaît pas non plus, même s'il est calibré**. La calibration voyage **dans le plan**, mais l'app ne la lit qu'à sa **première ouverture** : avant ça, elle ne peut pas savoir. **Ouvrez chaque plan une fois** et ceux qui sont calés apparaîtront tout seuls. Le message d'accueil de la Vue OSM le dit désormais au lieu d'annoncer « aucun plan géoréférencé », qui était faux dans ce cas.

**📏 Mesurer sur la carte OSM** — en mode OSM, l'outil de mesure donne une **distance** et une **surface** en cliquant sur la carte. Une mesure faite ici ne dépend d'**aucun calibrage** : les coordonnées sont déjà géographiques, elle est donc plus fiable qu'une mesure faite sur le plan.

**🎯 Coordonnées de surface** — un clic sur la carte OSM donne la **latitude et la longitude du point situé juste au-dessus**, copiables d'un bouton. C'est ce qu'on transmet à une équipe qui arrive par la surface.

**🗂️ Plusieurs plans en même temps* — le panneau « Plans affichés » du mode OSM permet de **superposer vos plans géoréférencés** : ➕ pour en ajouter un, ▲▼ pour choisir qui passe dessus/dessous, un curseur d'**opacité par plan**, ✕ pour retirer. Le plan marqué ◉ est le « principal » (celui du sélecteur du haut). Toute cette gestion vit dans une **modale dédiée** ouverte par le bouton **≡** du bandeau (rien ne masque la carte) : réglages d'**affichage globaux**, **filtre par tag** (agrégé sur tous les plans affichés), et la pile des plans. Les anciennes rangées sous le sélecteur (opacité, cases, tags) ont disparu du widget — la carte y gagne leur hauteur. Chaque ligne y porte aussi **5 mini-boutons de filtrage propres au plan** (🖼️ image, 📍 POI, 🛣️ routes, 🌐 zones, 🏛️ structures) — les réglages globaux d'affichage vivent dans la même modale (section Affichage), les deux niveaux se combinent. Idéal pour afficher deux secteurs voisins par-dessus un plan d'ensemble, en ne gardant par exemple que les POI de l'un et l'image de l'autre. **🏷️ Et l'ajout par ÉTIQUETTE** : sous « Plans », une rangée de chips liste les étiquettes portées par **au moins deux** de tes plans géoréférencés (celles que tu saisis dans ta bibliothèque), avec un compteur « 3/12 ». Un clic **affiche tous** les plans de l'étiquette, un second clic **les retire** — indispensable dès qu'un atlas découpé en produit vingt. La casse est ignorée (« Gironde » et « GIRONDE » sont la même étiquette), et au-delà de 3 plans affichés l'app demande confirmation en annonçant le compte : les plans se chargent ensuite **un par un**, la carte se remplit progressivement.

Au premier lancement du mode, un message rappelle que l'affichage de plans complets peut être plus lent sur mobile — et un second apparaît si vous affichez **plus de 3 plans** à la fois.

> 👁️ **Calques masqués par défaut* — un calque de données livré « décoché » dans le ZIP d'un plan (donc masqué à l'ouverture en mode carte) est rendu comme les autres : tu le masques ou l'affiches avec les filtres existants (chips de catégorie globaux et par plan, filtre par tag). La Vue OSM de l'écran plan n'est pas concernée — elle a toujours suivi les calques réellement affichés sur ta carte.

> 🔍 **Net au zoom* — dans l'aperçu OSM de l'accueil, zoomer sur un plan charge automatiquement des **tuiles plus détaillées** (seulement la zone que tu regardes, plans tuilés V2). Rien à régler, et aucune requête réseau en plus : les tuiles viennent du fichier du plan, déjà sur ton appareil.

> 🎨 **Tes couleurs partout* — les couleurs de légende que tu personnalises (≡ Légende → ✏️ Modifier) s'affichent désormais **aussi sur le fond OSM** : mode plein écran ET aperçu de l'accueil, et en multi-plans chaque plan garde **ses propres** couleurs.

## 📖 Mode Histoire — Note libre + PDF du plan

Le bouton **📖** dans la barre du haut (à gauche de la batterie 🔋) ouvre une modale à deux onglets propre à chaque plan. C'est ton **carnet d'exploration personnel** pour chaque site souterrain.

### 📝 Note libre (Markdown)

Un carnet de notes texte sauvegardé tout seul pendant que tu tapes. Idéal pour écrire l'histoire du site, des anecdotes, ta to-do d'exploration, des points à vérifier. **Une note par plan**, conservée même après reload ou fermeture de l'app.

La note supporte le **Markdown** :
- Par défaut tu vois le **rendu propre** (titres en couleur, gras, listes, liens cliquables, citations).
- Clique sur **✏️ Éditer** pour modifier la source ; une mini barre d'outils t'aide à insérer la mise en forme : **B**old · *I*talic · H1 · H2 · • Liste · 🔗 Lien · `</>` code · ❝ citation.
- Clique sur **👁 Aperçu** pour revoir le rendu.
- Tout MD que tu tapes (`**gras**`, `# Titre`, `- item`…) est interprété au rendu.

> 🎨 **Icônes de tes plans (v1.97.9)** — si tu as généré des plans entre juin et septembre 2026, l'icône « Point d'entrée du plan » pouvait ne rien afficher : l'app la remplace maintenant par celle qu'elle embarque, et **régénérer le plan** répare le fichier pour de bon. Au passage, ouvrir un plan **régénéré** ne déclenche plus la vingtaine de requêtes inutiles qu'il fallait pour retrouver ses icônes.

### 📚 Histoire (PDF) — **plusieurs documents par plan**

Tu peux maintenant garder **jusqu'à 10 documents PDF par plan**. Rapport de 2019, plan papier scanné, article de presse, relevé topo : tout tient au même endroit.

- Une **liste de documents** s'affiche au-dessus de la visionneuse dès qu'il y en a plusieurs ; clique un document pour l'ouvrir.
- **📥 Importer** ajoute un document (il ne remplace rien). **🗑️ Retirer** supprime celui qui est affiché.
- L'auteur du plan peut embarquer des PDF dans le ZIP — **plusieurs** (le Générateur accepte maintenant une liste de fichiers) : ils apparaissent en tête de liste (📕). Leur présence ne t'empêche pas d'ajouter tes propres documents.
- 📕 **Ces documents du plan sont recopiés sur ton appareil** à la première ouverture : c'est ce qui les fait apparaître dans **📔 Mon carnet → 📖 Récits** sans charger le plan. Tu peux les **retirer** comme les tiens — et si tu rouvres le plan, ils reviennent (c'est le plan qui les fournit).
- Garde-fous : **10 documents maximum** par plan, avertissement au-delà de **25 Mo** cumulés, refus au-delà de **100 Mo**. L'espace occupé apparaît dans **Stockage**.
- Sur iPhone, un bouton **↗️ Ouvrir dans un onglet** sort le document en plein écran natif si l'affichage intégré n'est pas dispo.
- Tes documents sont aussi listés, ajoutables et supprimables depuis **📔 Mon carnet → 📖 Récits**, sans charger le plan.

### 📦 Inclus dans l'export de session

Quand tu fais 💾 Enregistrer session, ta note libre Markdown ET **tous tes documents PDF** du Mode Histoire sont embarqués dans le fichier `.mkmsession.zip`. À la ré-importation (sur un autre appareil, ou pour partager avec un binôme), ils sont **ajoutés** au plan courant — un import n'écrase plus le document déjà en place. Compatible rétrocompat (un vieux fichier avec un seul PDF reste lisible).

En mode **anonymisé**, note + PDF sont volontairement omis du ZIP (peuvent contenir des infos perso).

> 🔒 **100 % offline** — la note et le PDF restent sur ton appareil. Rien n'est envoyé sur Internet.

---

## 🚨 Mode Sortie d'urgence — Trouver la sortie la plus proche

> 🧭 Cet outil te ramène dehors. Si tu cherches plutôt à **te repérer** (⛑️ Je suis perdu), un **écran très lisible** (mode panique) ou à **coordonner des équipes** (Mode Secours), tout cela vit plus bas, dans le chapitre Secours.

Le bouton **🚨** dans la barre du haut (entre 📖 Mode Histoire et la batterie 🔋) déclenche un calcul d'itinéraire vers la **sortie la plus proche** depuis ta position actuelle.

**Cas d'usage** : tu es sous terre, tu veux ressortir **maintenant**, sans réfléchir (blessé·e, batterie qui tombe, panne d'éclairage, simplement perdu·e). Tu tapes sur le bouton (ou tu le déclenches à la voix), l'app fait le reste.

### Comment ça marche

1. Tape sur **🚨** dans la barre du haut (bouton rouge, à part des compteurs) **OU** dis « **sortie** », « **où est la sortie** », « **comment sortir** » via la commande vocale 🎤.
2. L'app scanne tous les POIs du plan ayant un tag de sortie ouverte :
   - `cao` → **C**avage **O**uvert
   - `peo` → **P**uits à **É**chelon **O**uvert
   - `eso` → **E**scalier de **S**ervice **O**uvert
   - `entrée` → tout POI marqué comme entrée connue, **et** le tag intégré « 🚪 Point d'entrée du plan »
3. Pour chaque candidate, l'app calcule le **vrai chemin navigable** via le pathfinder (gère les murs ET les jonctions inter-niveaux).
4. Une modale compacte s'affiche avec :
   - La sortie la plus proche + sa distance + son niveau si multi-étages
   - Un bouton **🧭 Tracer l'itinéraire** (réutilise le moteur Mode Itinéraire classique)
   - 🪧 Une fois tracé, le **bandeau de guidage** te dit quoi faire à chaque croisement — **sans croix** en sortie d'urgence, même si le guidage est coupé. Si tu t'écartes, son bouton devient **« Sortie la plus proche d'ici »** (voir « 🪧 Guidage » dans l'itinéraire)
   - Un dépliable **Voir les N autres sorties** trié par distance

### Versions fermées volontairement ignorées

Les codes `caf` / `pef` / `esf` (cavages, puits, escaliers **fermés**) sont **exclus** car non-traversables en pratique. Si tu marques un POI comme fermé, l'app ne te suggérera jamais d'aller dedans.

Si une sortie est affichée avec la mention **« Distance à vol d'oiseau — chemin non vérifié »** (carte en pointillés), ça veut dire que le pathfinder **n'a pas pu calculer un chemin** : la distance est mesurée en ligne droite. Ces sorties sont reléguées sous un séparateur **« Non confirmées »** dans la liste, et si **aucune** sortie n'a de chemin vérifié, un bandeau rouge te le dit avant tout. Méfie-toi : une telle sortie peut être inaccessible en pratique (murs, étage isolé).

### Origine du calcul

L'app part de ta **position à l'instant T**, sans te poser de question, dès que le suivi est actif **ou** que tu t'es situé au moins une fois depuis l'ouverture du plan (« 📍 Je suis ici » sur un point, recalage sur la carte, arrivée par un portail, ou une session restaurée qui contenait un recalage). La modale te dit d'où part le calcul : *« depuis ta position (suivi actif) »*, *« depuis ta dernière position confirmée, il y a N min »* ou *« depuis le point que tu as tapé »*.

**Un seul cas où l'app te demande « Où es-tu ? »** : tu n'as **jamais** confirmé ta position depuis l'ouverture du plan (elle vaut encore le point de départ du plan). Un bandeau apparaît, tu **tapes ta position sur la carte** (ça marche même en visant un repère existant), et le calcul part de là — ce tap **recale aussi le suivi**, donc « Tracer l'itinéraire », « Y aller » et l'écran Urgence XL partent de la même position. Avant, dans ce cas, l'app calculait en silence depuis l'entrée du plan en la présentant comme ta position.

### Multi-niveau natif

Si tu es au niveau 2 et que la sortie la plus proche est au niveau 0, l'itinéraire **traverse automatiquement les jonctions inter-niveaux** définies par l'auteur du plan. Le résultat affiche le niveau de la sortie cible (badge "N0", "N1", "N2"…).

### Feedback haptique

- Sortie trouvée → vibration discrète de confirmation (si activée dans Configuration)
- Aucune sortie identifiée → vibration d'alerte + message explicatif rappelant les tags attendus

> 🔒 **100 % offline** — le calcul se fait sur ton appareil (filtrage POIs + pathfinder côté client). Aucune requête réseau.

---

## 🗺️ Lire le plan

Une fois le plan chargé :

- **Pincer / zoomer** pour agrandir ou réduire la vue
- **Glisser** pour se déplacer sur le plan
- **Cliquer** sur une icône pour afficher les informations du point
- **Double-cliquer** sur une icône pour zoomer rapidement dessus avec une animation smooth (= raccourci équivalent au bouton "Y aller" du popup)

Les boutons **+** et **−** en haut à gauche permettent de zoomer. Le contrôle de calques en haut à droite permet d'afficher ou masquer des couches d'informations.

> 📐 **Taille des icônes adaptative** : la taille des icônes s'adapte automatiquement au niveau de zoom. Au dézoom, elles rétrécissent pour garder leur taille proportionnelle au plan. Tu peux désactiver ce comportement dans ⚙️ Réglages → 🔍 Affichage → "📐 Adapter la taille des icônes au zoom" si tu préfères le comportement Leaflet par défaut (icônes taille écran fixe).

### 🌐 Coordonnées GPS dans les popups

Si ton plan est **calibré GPS** (cf. section "Exporter en KMZ géolocalisé" pour le calibrage 2 points), un nouvel élément apparaît dans les popups des points :

```
📌 Nom du point
[Description si présente]
🌐 48.85661° N, 2.35222° E 📋
```

- Affiché juste après la description (ligne nouvelle).
- Format **décimal 5 chiffres** (~1 m de précision).
- Bouton **📋** : copie les coordonnées dans le presse-papier (format `lat, lng` prêt à coller dans Google Maps, OsmAnd, SMS de localisation, etc.).
- Visible pour les **points de session ET les points des data layers** (puits, véhicules, etc.).
- **Pas affiché** pour les tracés / zones / structures (ce sont des géométries multi-points, pas une coordonnée unique).
- Si le plan **n'est pas calibré**, la ligne n'apparaît pas (rétro-compat absolue).

> 💡 **Cas d'usage typique** : en sortie cataphile, tu trouves un puits non répertorié, tu l'ajoutes via ✏️, tu cliques dessus → tu peux instantanément copier ses coords GPS pour les envoyer à un binôme par SMS ou pour les pointer plus tard dans Google Earth.

### 🌀 Liaisons inter-plan

Tu peux **lier un point d'un plan à un point d'un autre plan** — comme un « portail » entre deux réseaux qui se touchent (deux carrières voisines, ou un plan général et un plan de détail).

**Créer une liaison** :
1. Clique sur un point (session **ou** data layer) → dans la fiche, bouton **« 🌀 Lier à un autre plan »**.
2. Choisis le **plan cible** dans ta bibliothèque, puis **recherche le point** d'arrivée (par nom, id ou tag) — pas besoin d'ouvrir l'autre plan, ses points sont lus sur place.
3. La liaison est créée **dans les deux sens** : elle apparaît dans la fiche des deux points.

**Sur la carte** : à toi de choisir si un point lié se voit ou non. Par défaut, **rien ne le distingue** (il garde son tag et son icône habituels). Si tu veux le marquer visuellement, donne-lui le nouveau **tag « Portail »** : il prend alors une **icône vortex dédiée** (anneau doré, spirale bleue). *(L'ancien badge doré automatique a été retiré.)*

**🌀 Mes liaisons** : sur l'**accueil**, le bouton **« 🌀 Mes liaisons »** liste toutes tes liaisons (tous plans confondus) : état de chaque côté (⛔ si le plan n'est pas sur l'appareil), bouton **➜** pour aller directement à l'un des deux points, **🗑️** pour supprimer. Si les données d'un plan sont injoignables (serveur hors-ligne…), l'app te le dit clairement au lieu d'afficher « 0 points ».

> 📐 **« Écart de calage »* — chaque liaison peut afficher une distance en mètres. **Ce n'est pas une distance à parcourir.** Les deux bouts d'un portail désignent le **même endroit physique**, vu depuis deux plans différents : si tes deux plans sont bien géoréférencés, ces deux bouts devraient tomber exactement au même endroit sur la carte du monde. L'écart affiché mesure de combien ils ratent — autrement dit, **la qualité de ton calage**. Plus le chiffre est petit, mieux c'est. C'est le seul endroit de l'app qui peut te le dire, parce qu'il faut **deux** géoréférencements pour le révéler.
> 
> - Le chiffre n'apparaît que si **les deux** plans sont géoréférencés. Sinon **rien** ne s'affiche : la mesure est impossible, et écrire « 0 » te ferait croire à un calage parfait.
> - **Aucune couleur, aucun seuil** — volontairement. 20 m d'écart, c'est énorme sur une petite carrière et négligeable sur un réseau de 5 km. Le chiffre t'est donné, c'est toi qui juges avec ton échelle en tête.
> - En **Vue OSM** (plein écran → 🎚️ Filtres → 🌀), tu retrouves la même mesure sous forme de liste **classée du pire au meilleur** : ce qui mérite un recalage est en haut. Un clic cadre les deux bouts de la liaison sur la carte.
> - Un écart qui te paraît aberrant vient presque toujours du **géoréférencement d'un des deux plans**, pas de la liaison elle-même.


**🕸️ Vue Graphe** : dans la même fenêtre, bascule **📋 Liste ⇄ 🕸️ Graphe** — ta bibliothèque dessinée en **réseau** : chaque plan est une bulle (badges V2/M-LVL, compteur de liaisons, anneau doré sur le plan en cours, ⛔ grisé si absent de l'appareil), chaque frontière un trait dont **l'épaisseur suit le nombre de liaisons**. Les plans sans liaison sont rangés dans une bande en bas. **Clique une bulle** pour ouvrir le plan (arrivée sur son premier portail), **clique un trait** pour voir le détail des liaisons de cette frontière (la liste se filtre), et **déplace les bulles** au doigt pour arranger la vue à ta façon.

**Utiliser une liaison** : dans la fiche du point, ligne 🌀 avec le plan et le point de destination → bouton **➜** → confirmation → l'app **change de plan** (ta session actuelle est sauvegardée automatiquement), **bascule sur le niveau du point d'arrivée** (plans multi-niveaux) et te dépose **directement dessus** (flash bleu). Si un filtre de tags masque le point d'arrivée, un avertissement s'affiche — tes filtres ne sont jamais modifiés.

**📍 Recalage automatique à l'arrivée** : quand tu **traverses physiquement** un portail (bouton ➜ d'une liaison, ou « Prendre le portail » d'un itinéraire inter-plan), ta **position tracker est recalée sur le point d'arrivée** du plan cible — tu ES là, l'app le sait. La recherche multi-plans et le gestionnaire ne recalent **pas** (consulter un point ≠ s'y déplacer). Et si un itinéraire est actif sur le plan d'arrivée, il se replanifie depuis le portail.

**🧭 Itinéraire inter-plan** : demande un itinéraire vers un point **d'un autre plan** relié par un portail — depuis la modale **Itinéraire** (bouton « 🌐 Destination sur un autre plan ») ou la **recherche multi-plans** (bouton 🧭 sur un résultat distant). L'app compare les portails disponibles au **coût réel**, affiche le trajet en étapes (« ① Rejoindre 🌀 Puits nord — 450 m · ② Traverser · ③ Rejoindre la salle — 300 m · Total ≈ 750 m ») et **trace le trajet sur ton plan**. Les évitements (zones, points, tags) de **chaque plan** sont respectés. Si c'est impossible (aucun portail, plan hors-ligne, destination isolée du réseau…), un message t'explique **précisément pourquoi**.

**🚶 Le trajet suit ton rythme** : le bouton du résumé s'appelle « **🗺️ C'est parti** » — il ne te téléporte pas. Tu **marches** ton trajet (avec la validation d'étapes « 📍 Je suis ici » et la replanification au recalage — **l'app demande confirmation** avant de recalculer, le calcul pouvant être long sur les grands plans), et la traversée se propose quand tu es **au portail** : bouton flottant « **🌀 Portail suivant (X m)** » (fermable — « 📍 Je suis ici » sur le point-portail le fait réapparaître), ou bouton ➜ du popup du point-portail. À chaque traversée, la suite se trace automatiquement de l'autre côté, jusqu'à destination.

**🧭 Tes étapes d'abord** : pose tes **points de passage** dans la modale Itinéraire (curiosité X, Y…) puis choisis la destination distante — le trajet passe par **toutes tes étapes dans l'ordre, avant le portail**.

**🌀 À travers plusieurs plans** : coche « **🌀 Itinéraire via plusieurs plans** » dans la recherche multi-plans (choix mémorisé, décoché par défaut) → l'app peut calculer un trajet qui **traverse des plans intermédiaires** (A → B → C, jusqu'à 3 traversées), en comparant toutes les combinaisons de portails au coût réel. Un plan intermédiaire injoignable est écarté (et nommé si plus aucun chemin ne passe). Chaque arrivée trace le tronçon du plan et te propose le portail suivant.

**🔄 Fiches toujours à jour** : si tu renommes ou déplaces un point lié, les fiches de liaisons (des deux côtés) se **mettent à jour automatiquement** à la prochaine ouverture du plan concerné.

**↩️ Revenir en arrière** : après un passage de portail (ou un saut de recherche multi-plans), un bouton flottant **« ↩️ Retour : <plan> »** apparaît en bas de l'écran pendant 15 secondes — un clic te ramène au plan **et à la vue exacte** d'où tu venais (niveau et zoom compris). Les sauts s'empilent : enchaîne 3 portails, tu peux faire 3 retours.

**↩️ Bouton Retour discret** : si le bouton te gêne, deux nouvelles commandes dessus — **[–]** le réduit en **mini-pastille ↩️** discrète en bas à droite (elle reste jusqu'à son expiration, un clic la ré-agrandit), **[✕]** le ferme **et oublie les retours empilés** (fermer, c'est renoncer à la chaîne de retours). Ton choix [–] est retenu : une fois réduit, les prochains retours arrivent directement en mini-pastille.

**Bon à savoir** :
- Un point peut porter **plusieurs liaisons** (point « hub »).
- Si le plan de destination n'est **pas sur ton appareil**, la liaison s'affiche quand même (⛔) — ajoute le plan pour pouvoir « y aller ».
- **Supprimer un point** supprime aussi ses liaisons (des deux côtés).
- Les liaisons **voyagent avec l'export de session** (elles sont restaurées à l'import sur un autre appareil).
- Un plan distribué (« data layer ») peut embarquer des liaisons prêtes à l'emploi : tu peux les **utiliser**, pas les modifier.

### 🔎 Recherche multi-plans

Cherche un point dans **tous les plans de ta bibliothèque** d'un coup, sans les ouvrir un par un :

- **Depuis l'accueil** : la **barre de recherche 🔎 en haut de l'écran**, au centre de l'en-tête. **Les résultats apparaissent en direct sous la barre** dès 2 caractères (plans + points, avec le badge du plan) — cliquer un résultat charge le plan et centre la carte. **Entrée** ou 🔎 ouvre la recherche complète. Sur mobile, la barre occupe la 2e ligne de l'en-tête.
- **Depuis la carte** : ouvre la recherche (Ctrl+K ou 🔍) → bouton **« 🌐 Chercher dans tous les plans »** en bas — ta saisie en cours est conservée.

L'app lit les points (session + calques de données) de chaque plan **sur place**, avec la progression affichée (« Lecture 2/5 : Oise… »). Chaque résultat porte le **badge du plan** où il se trouve. Un clic : confirmation (si un plan est ouvert), chargement du bon plan, bascule sur le bon niveau et centrage sur le point — avec le bouton ↩️ Retour pour revenir.

---

## 🧭 Présentation de l'interface

L'interface est organisée en **13 groupes** répartis sur les **deux barres latérales** — à gauche : ⭐ Favoris, 📚 Aide, ⚙️ Réglages, ⬇️ Charger, ⬆️ Enregistrer, ⏪ Historique ; à droite : 🔍 Recherche, 🧭 Tracker, 📐 Mesure, ✏️ Édition, 🛣️ Tracés, ⬛ Zones, 🏛️ Structures :

| Groupe | Icône | À quoi ça sert |
|---|---|---|
| **Favoris** | ⭐ | Tes points mis en favori, accessibles en un clic |
| **Aide / Documentation / Légende** | 📚 | Aide, documentation, légende des icônes |
| **Réglages** | ⚙️ | Réglages du plan : échelle, Nord, géoréférencement, tracker, performance… *(clic direct)* |
| **Recherche** | 🔍 | Trouver rapidement un point sur le plan *(clic direct)* |
| **Charger / Import** | ⬇️ | Importer une session ou un GPX, éditeur de données du plan |
| **Enregistrer** | ⬆️ | Exporter ta session, le plan en image, ou un PDF imprimable |
| **Historique** | ⏪ | Annuler (`Ctrl+Z`) / Rétablir (`Ctrl+Y`) |
| **Tracker** | 🧭 | **Menu plein écran** : démarrer / arrêter le tracking, recaler, Ma position, verrou sur tracé, itinéraire, replay, heatmap, Mode perdu, Mode Secours |
| **Mesure** | 📐 | Mesurer une distance ou une surface, effacer |
| **Édition de points** | ✏️ | Ajouter tes propres points *(clic direct — interrupteur ON/OFF)* |
| **Tracés** | 🛣️ | Tracer routes principales, secondaires, chemins, jonctions, **calculer la distance totale** |
| **Zones** | ⬛ | Tracer des zones de remblais, effondrement, eau ou inaccessibles |
| **Structures** | 🏛️ | Piliers, murs et fronts de taille |

> ⚠️ **Le Générateur de plan n'est PAS dans cette barre.** Créer ou modifier un plan se fait **depuis l'accueil**, bouton **🏗️ Générer un plan** — les actions de création vivent hors du mode carte.

> 💡 **Calque « Mes annotations »** dans la modale ≡ Filtres (en haut à droite de la carte, bouton trois barres horizontales) : il regroupe **tout ce que tu ajoutes** — points, tracés, zones, structures. Le décocher masque tes ajouts d'un coup sans rien supprimer.

**Comment ça marche :**

- **Un seul groupe ouvert à la fois** — appuyer sur un autre groupe ferme le précédent
- **Quand un mode est actif** (mesure, ajout, route, zone, recalage), le groupe **reste ouvert** pour que tu puisses accéder rapidement aux actions associées (effacer un point, etc.). L'icône principale change pour refléter le mode en cours
- **Toucher en dehors** du groupe ouvert le ferme automatiquement
- **Sur mobile en paysage**, la barre devient scrollable verticalement si elle dépasse de l'écran

> 🛡️ **Ouvrir une fenêtre coupe l'outil en cours* — si tu es en **mesure, édition de points, tracé, zone, structure ou recalage** et que tu ouvres une modale par-dessus (Réglages, Filtres, Documentation, Mode Secours…), le mode se désarme tout seul. Avant, il restait actif derrière : en refermant, tes clics sur la carte partaient dans l'outil sans que rien ne le rappelle, et le bouton restait allumé sans effet. **Le tracker n'est jamais coupé** (il tourne en fond, ce n'est pas un mode de clic), et la fiche d'un point que tu viens de poser ne coupe pas l'édition — tu peux enchaîner tes points normalement.

### 🎨 Personnaliser la légende (renommer, masquer, couleurs, types custom)

Ouvre **≡ Légende** (groupe 📚 Aide / Documentation / Légende) puis **✏️ Modifier**. Pour chaque type de tracé, zone ou structure :

- **Renommer** : tape ton libellé (ex. « Principal » → « Grande galerie »). Il s'affiche partout : légende, popups, stats, filtres.
- **🎨 Changer la couleur** : un carré de couleur par ligne — et pour les **zones et piliers/murs, deux carrés** : fond et **bordure indépendante**. La couleur s'applique **partout** — carte, exports image/PDF, KMZ, statistiques, rapport de session — immédiatement, sans recharger. Un bouton **↺** remet fond ET bordure d'origine. Détails : sans bordure choisie, une zone la dérive automatiquement (version plus foncée) et un pilier/mur garde son contour noir (le défaut historique) ; la zone *Inaccessible* recolorée perd ses hachures (motif fixe) au profit d'un aplat. Les **entrées personnalisées** se modifient de la même façon, à chaud.
- **👁️ Masquer** : la case retire l'entrée **de la boîte de légende uniquement** — rien ne disparaît de la carte. Pour masquer des objets de la carte, c'est le panneau **🔍 Filtres**.
- **➕ Ajouter une entrée custom** : crée tes propres types (tracé, zone, structure, icône) avec leur couleur. Ils deviennent dessinables depuis la barre latérale, et une icône custom est proposée dans l'éditeur de point. **Raccourci** : dans le menu **Tracés**, **Zones** ou **Structures**, la ligne **➕ Nouveau type…** ouvre la même fenêtre ; le type créé est aussitôt sélectionné, tu peux dessiner directement.
- **🗑️ Supprimer un type custom** : si des objets dessinés l'utilisent encore, l'app te préviens avec le décompte avant de confirmer.

> 🧳 **Ta légende voyage avec tes exports** : un calque de données exporté emporte la définition des types qu'il utilise, et le générateur la récupère à l'import (ce qui existe déjà dans le plan garde la priorité). Le JSON de session et le ZIP Avancé l'emportent aussi.
>
> ⚠️ **Bandeau « types orphelins »** : si des objets utilisent un type qui n'existe plus dans la légende (entrée supprimée, vieux calque), la modale ≡ Légende l'affiche en tête avec le compte — ces objets sortent en couleur de repli tant que tu n'as pas recréé ou réimporté l'entrée.

Tout est sauvegardé automatiquement dans ta session, **par plan**.

### 🔄 Changer rapidement de plan via le titre

Le **titre du plan en cours** affiché en haut de l'écran est **cliquable** : il ouvre la fenêtre **« 🗂 Changer de plan »** — carte du plan en cours (badge `● ACTIF`), les **3 derniers plans** ouverts, et un bouton **📚 Voir tous mes plans** qui ramène à l'accueil. La **rose des vents 🧭** à gauche du titre ramène directement à l'accueil.

Au clic sur un plan, ta session en cours est **sauvegardée automatiquement** (auto-save + snapshot) avant le changement : il n'y a plus d'avertissement « modifications perdues ». Fermer sans rien faire : ✕, clic à côté ou **Échap**.

---

## 🔍 Recherche unifiée

Le bouton **🔍** dans la barre latérale **OU** le raccourci clavier **Ctrl+K** (`Cmd+K` sur Mac) ouvre la fenêtre de recherche.

> 🔍 La recherche couvre **4 catégories** : 📍 Points · 🛣️ Tracés · ⬛ Zones · 🏛️ Structures (piliers / mur / fronts).

### 🔎 Ce qu'on peut chercher

**Pour les points** :
- Le **nom** (ex: "Puits Aération")
- L'**identifiant** (ex: "PA1")
- Un **tag** (ex: "pa", "danger", "elec")
- La **description**
- L'**état**

**Pour les tracés / zones / structures** :
- Le **label** (auto-généré du type "Tracé Principal #3" ou "Pilier 1ère masse #1" si pas explicite)
- Le **type** en français (`Principal`, `Eau`, `Pilier 1ère masse`...)
- Le **niveau** (en mode multi-niveau)

**🌐 Coordonnées GPS** *(uniquement si le plan est géoréférencé)* :
- Colle directement un couple de coordonnées au **format Google Maps** : `48.680831, 2.158843`
- L'app convertit en position sur le plan via le calibrage GPS du plan
- Si un **POI existe dans 50 px autour** → carte verte "🎯 Aller au point" avec distance affichée
- Sinon → carte bleue "➕ Créer un point ici" → ouvre le formulaire de saisie pré-rempli sur cette position (= 3 clics au total depuis Maps : Ctrl+K · Coller · Créer)
- Hors plan ou plan non calibré → message d'erreur explicite (orange / rouge)

La recherche est **insensible aux accents et à la casse** — taper "aeration" trouvera aussi "Aération".

### ⚙️ Comment ça marche

1. **Ouvre** : cliquez sur **🔍** OU tape **Ctrl+K** (Cmd+K)
2. (Optionnel) Cochez des **chips de filtre** sous le champ
3. Tapez votre recherche dans le champ — les résultats s'affichent en temps réel
4. Naviguez avec les flèches **↑** / **↓** ou avec le curseur
5. Validez avec **Entrée** ou par un clic
6. La carte se centre sur l'élément :
   - **Point** → cercle orange autour + popup d'information
   - **Tracé** ou **front** → polyline jaune en pointillés 4 sec + popup info
   - **Zone** ou **pilier / mur** → polygon jaune transparent 4 sec + popup info

> 🔁 **Re-tape Ctrl+K** quand la modale est déjà ouverte → elle se ferme. Pratique pour aller-retour rapide.

### 🎚️ Filtres (Catégorie + Calques + Tags)

Sous le champ de recherche, jusqu'à trois lignes de chips :

- **Catégorie** : 4 chips `📍 Points (N)` · `🛣️ Tracés (M)` · `⬛ Zones (K)` · `🏛️ Structures (L)` avec compteur par catégorie. Cliquez pour activer (jaune) ou désactiver. Aucun chip actif = toutes les catégories visibles. Cette ligne n'apparaît que si **au moins 2 catégories ont du contenu** sur le plan.
- **Calques** : un chip par calque (Puits, Carrière, Mes ajouts, etc.) — **uniquement pour les points** (les autres catégories n'ont pas de notion "calque").
- **Tags** : un chip par tag rencontré dans les points (pa, ouvert, fermé, aeration, etc.) — **uniquement pour les points**.

**Logique de combinaison** :
- **Plusieurs chips dans la même ligne** = OR (n'importe lequel)
- **Entre les lignes** = ET
- Le champ texte reste un filtre supplémentaire (en ET)

Le bouton **✕ Effacer les filtres** apparaît à droite du compteur quand au moins un chip est actif. Les filtres sont **réinitialisés à chaque ouverture** de la fenêtre.

### 📊 Rendu groupé

Les résultats sont **regroupés par catégorie** avec des en-têtes :

```
📍 POINTS (12)
  ┌─────┐
  │ icn │ PA1 Puits Aération
  │ │ Puits · aeration · ouvert · x:4843 y:2002
  └─────┘
  ...

🛣️ TRACÉS (3)
  ┌─────┐
  │ 🛣️ │ Tracé Principal session #1
  │ │ Session · Principal · Niv 0 · 8 pts
  └─────┘
  ...

⬛ ZONES (1)
  ...

🏛️ STRUCTURES (2)
  ...
```

### 🧭 Périmètre

La recherche couvre :
- **Points** : tous les calques de données du plan (puits, véhicules, etc.) + tes points ajoutés (session)
- **Tracés** : ta session + les routes embarquées dans les data layers
- **Zones** : idem
- **Structures** : idem

---

## 📍 Tracker de position

> Tous les boutons du tracker se trouvent dans le groupe **🧭 Tracker** de la barre latérale.

### 🧭 Menu Tracker (modale plein écran)

Le bouton **🧭 Tracker** ouvre une **modale plein écran de grosses tuiles**, rangées en trois sections : **Suivi**, **Outils**, **Urgence**. Chaque tuile ferme la modale en agissant.

**Tuiles disponibles** :

| Icône | Action |
|---|---|
| **▶️** / **⏹️** | Play / Stop tracking (l'icône bascule dynamiquement selon l'état) |
| **🧭** | Boussole (widget rose des vents) |
| **📍** | Recalage position |
| **🎯** | **Ma position** — recentre la carte sur toi |
| **🔓** | **Suspendre le verrou sur tracé** — temporairement (30 s → 10 min) |
| **🗺️** | Calculer un itinéraire |
| **🗺️** | **Plan orienté** — la carte tourne avec toi pendant le suivi |
| **🪧** | **Guidage de l'itinéraire** — Auto / Jamais (bandeau « Dans 40 m, tourner à gauche ») |
| **🎬** | Replay de session tracker — *optionnel, voir 🧩 Fonctionnalités optionnelles* |
| **🔥** | Heatmap — *optionnel, voir 🧩 Fonctionnalités optionnelles* |
| **⛑️** | Je suis perdu — **bouton à fond ROUGE** (signal danger) |
| **🚨** | Mode urgence XL — **bouton à fond ROUGE** (signal danger) |
| **🚨** | Mode Secours — plans de recherche (équipes + zones), **fond ROUGE** |

> 🚨 **Les 3 tuiles d'urgence (⛑️ Je suis perdu, 🚨 Mode urgence XL, 🚨 Mode Secours) forment la section Urgence, en bas, sur fond rouge vif.** Le bouton **🚨 Sortie d'urgence** (sortie la plus proche), lui, est dans la **barre du haut**, à 1 tap.

> 🧭 **Barre du bas** : le voyant 🧭 affiche **ON · 👣 pas · distance** en direct pendant le suivi, et **un tap dessus ouvre le menu Tracker**. Au démarrage du suivi, la fenêtre d'avertissement propose **🔆 Garder l'écran allumé** (pré-coché) : un écran qui s'éteint, ce sont des pas perdus. Le bouton **≡ Filtres** porte une pastille avec le nombre de filtres actifs (niveaux compris) ; au rechargement d'un plan, un message te dit si des filtres ont été restaurés. Dans **📊 Détails de la session**, la première ligne dit **« ✅ Enregistré il y a N s »** (rouge si la sauvegarde échoue).

> 🆕 **Sur le terrain** :
> - **🎯 Ma position** : recentre la carte sur ta position courante (utile après avoir navigué ailleurs sur le plan).
> - **🔓 Suspendre le verrou sur tracé** : si le « verrouillage sur tracé » (navigation intelligente) est activé et que tu **sors du réseau de galeries** (ex. entrer dans une cave), tu peux le couper temporairement (**30 s / 1 min / 10 min / jusqu'à réactivation**) sans passer par les réglages. Un **compte à rebours 🔓 s'affiche dans la barre du bas**, à côté du voyant tracker ON/OFF ; touche-le pour réactiver (confirmation demandée).
> - **⚙️ Réglages avancés** : dans ⚙️ Réglages → *Navigation & Tracker*, la **tolérance latérale** et le **poids du cap** du verrou sont réglables (pour ajuster le comportement aux jonctions). La taille d'un pas, le seuil et le cooldown sont désormais **bornés** pour éviter les valeurs aberrantes. ⚠️ Réglages experts — règle d'abord l'échelle m/px du plan.

### ▶️ Démarrer le tracking

Appuyez sur **▶️** pour démarrer.

**Au premier démarrage de la session**, une popup d'avertissement s'affiche pour rappeler que le tracker est un **module expérimental** : il sert à valider le calibrage / la détection de pas / la formule de heading, **pas à se localiser réellement**. Cliquez sur **« J'ai compris — Démarrer »** pour continuer (la popup ne réapparaîtra plus avant le prochain reload de la page). Sur Mobile, la demande de permission iOS / Android pour les capteurs s'affiche ensuite — acceptez-la.

Une icône apparaît sur le plan à votre position de départ. Elle se déplace au fur et à mesure de votre marche, et un tracé enregistre votre chemin parcouru.


> #### 🧭 « Plan orienté » — la carte tourne avec toi
>
> Dans le menu 🧭 Tracker, la tuile **🗺️ Plan orienté** change la façon dont la carte se comporte pendant le suivi : au lieu que l'icône pivote sur un plan fixe, **c'est la carte qui tourne**, pour que ta direction de marche pointe toujours vers le haut de l'écran (comme un GPS de voiture).
>
> - **Désactivé par défaut**, et ton choix est retenu sur cet appareil.
> - Ça ne tourne **que pendant le suivi** : à l'arrêt du tracker, la carte revient droite.
> - La carte **te suit** : si tu la déplaces à la main pour regarder ailleurs, un bouton **🎯 Recentrer** apparaît pour revenir sur toi (il apparaît aussi sans ce mode, dès que ta position sort de l'écran).
> - Les textes restent lisibles : les mesures et les fiches de points ne se retournent pas avec la carte.
> - La carte se remet droite toute seule dès que tu prends un outil qui demande de cliquer (mesure, dessin, recalage) ou que tu ouvres un mode plein écran.
>
> ⚠️ La rotation suit ta boussole : **près de grandes masses métalliques** (rails, ferraillage, structures), elle peut devenir approximative — comme le reste du tracker.

> 🧭 **Icône directionnelle** : pendant le tracking actif, l'icône (cône bleu + dot blanc, style GPS) **tourne en temps réel pour pointer dans la direction de marche** — calculée depuis le heading du téléphone (même source que la boussole 🧭). Au repos (tracker arrêté ou recalage seul), l'icône pointe Nord (pose neutre). Smoothing intégré pour éviter le tremblement.

Appuyez sur **⏹️** pour arrêter.

> ⚠️ **Important** : la dérive cumulative est inévitable. Recalez votre position manuellement (📍 ci-dessous) tous les ~50m sur un point reconnu du plan. Les armatures métalliques des carrières et galeries faussent fortement le magnétomètre du téléphone — une vraie boussole physique reste indispensable.

### 🧭 Boussole — vérifier la cohérence du heading

Le bouton **🧭** dans le groupe **🧭 Tracker** affiche une **rose des vents flottante** en haut à gauche de la carte (sous les boutons de zoom). La rose contre-tourne en temps réel pour que le **N pointe toujours vers le vrai Nord**.

> 🧭 La rose dédiée à la boussole affiche **N/S/E/W marqués clairement** + une flèche rouge sur le Nord, pour une lecture facile. Le logo MyKTAMap reste utilisé pour le splash/loader (identité visuelle).

**Comment vérifier que tout est cohérent ?**

Tenez le téléphone à plat dans la main, écran face à vous, **bord supérieur du téléphone dans votre direction de marche** (pose "boussole"). En tournant sur vous-même :

| Direction de marche | Le N de la rose doit être... |
|---|---|
| Nord 🧭 | En haut (12h) |
| Est ➡️ | À gauche (9h) |
| Sud 🧭 | En bas (6h) |
| Ouest ⬅️ | À droite (3h) |

Si l'orientation est cohérente, le tracker enregistre correctement vos déplacements. Sinon, suspectez une perturbation magnétique (armatures, ferraille, sol) — recalez via 📍 dès que possible et limitez la confiance dans le tracé.

> 🧭 La boussole et la rotation de l'icône tracker fonctionnent correctement en **mode landscape** (téléphone tenu à l'horizontale) et en **portrait inversé** : recalage instantané dès que vous tournez votre téléphone, le N reste en haut visuel quelle que soit l'orientation. Les 4 orientations sont couvertes.

**Cliquez sur le widget** pour ouvrir un **affichage agrandi** plein écran (rose 240px + cardinal en gros + angle exact). Pratique pour valider de loin ou faire une démo. Refermer via ✕, Échap ou en cliquant à côté.

Le widget reste affiché même quand le tracker est à l'arrêt — vous pouvez l'utiliser pour valider la boussole sans démarrer le tracking. ✕ du widget pour le fermer entièrement.

### 📍 Recaler sa position

La position calculée dérive inévitablement. Dès que vous reconnaissez un repère sur le plan :

1. Appuyez sur **📍** — le bouton s'allume en vert
2. Appuyez sur le point du plan correspondant à votre position réelle
3. L'icône se déplace à l'emplacement choisi et le tracé repart de zéro
4. Le mode recalage se referme automatiquement après le clic et l'icône directionnelle (cône bleu) reprend la main — plus besoin de re-cliquer sur 📍 pour désactiver le mode

> Un seul mode peut être actif à la fois : mesure, ajout de point, tracé de route ou recalage.

### ≡ Modale Filtres unifiée

Le bouton **≡ trois barres horizontales** en haut à droite de la carte ouvre la **modale Filtres unifiée**, une fenêtre qui regroupe **7 sections** de filtrage :

| Section | Filtre quoi |
|---|---|
| 🖼️ **Calques d'image** | Image de base + calques additionnels (légende, signalétique, etc.) |
| 📊 **Calques de données** | Les calques `puits`, `vehicule`, `cataphile`, `editor` (= Mes annotations), etc. |
| 🏗️ **Niveaux M-LVL** *(si plan multi-niveau)* | Niveau actif (dessin) + niveaux visibles (multi-sélection) — **synchronisé** avec la modale Niveaux classique |
| 🏷️ **Tags des points** | Filtre par tag (puits aération, salle, chatière...). Liste auto = tags **réellement présents** dans le plan avec compteur. |
| 🛣️ **Types de tracés** | Principal / Secondaire / Chemin / Jonction + customs |
| ⬛ **Types de zones** | Eau / Remblais / Effondrement / Inaccessible + customs |
| 🏛️ **Types de structures** | Pilier 1ère masse / Pilier 2è masse / Mur / Front 1 / Front 2 + customs |

> 🔄 **Corriger un calque de données** — un calque livré dans le ZIP du plan est en **lecture seule** : tu peux le masquer, pas l’éditer. Chaque ligne de la section **📊 Calques de données** porte donc un bouton **« 🔄 Modifier »** : son contenu passe dans ta session, où tous tes outils s’appliquent — en particulier **🔄 Convertir cet objet**, pour changer un front de taille en galerie sur un relevé importé. Le calque d’origine se **masque tout seul** (sa case affiche « en cours de modification — afficher quand même », que tu peux recocher pour comparer les deux). **« ↩️ Restaurer »** annule tout ; **« 💾 Exporter »** te rend un fichier corrigé à redonner au plan via 🏗️ Générateur → « Modifier un plan », en cliquant **« Choisir » sur la ligne de ce calque** — il REMPLACE l’ancien contenu, aucun doublon n’est possible.
>
> ⚠️ **Ce que l’app t’annonce avant d’agir** : le poids que la copie prendra dans ta session (un gros relevé dépasse le mégaoctet, la limite du navigateur tourne autour de 5 Mo tous plans confondus) et la place déjà occupée. À l’export, elle te dit aussi combien d’objets **que tu as dessinés toi-même** ne partent pas — ils n’appartiennent pas à ce calque. Et « Effacer la session » **restaure** les calques ouverts à la modification : la copie et le masquage tombent ensemble.

> 🧳 **Plusieurs calques à la fois, et changement d’appareil** : chaque objet copié garde le nom de son calque d’origine. « 💾 Exporter » sur un calque ne sort donc **que ce calque**, même si d’autres sont ouverts en même temps. L’export de session complet emporte tout ; quand tu le **réimportes** (sur le même plan, même sur un autre téléphone), l’app remet en modification les calques dont elle retrouve la copie — elle te le dit — et réaffiche ceux qui n’en ont plus. Une session venue d’un **autre plan** n’a pas ces calques : ses objets deviennent les tiens.

**Comment ça marche :**

- **Live update** : chaque toggle (case cochée/décochée) applique le filtre **immédiatement** sur la carte.
- **Sections accordéon** : clic sur l'en-tête d'une section pour replier/déplier. Toutes ouvertes par défaut.
- **Boutons rapides par section** : `👁️ Tout` et `🚫 Aucun` pour basculer tous les éléments d'un coup.
- **Bouton 🔄 Tout afficher** (footer) : reset tous les filtres runtime (tags + types) à leur état neutre (= tout visible). Ne touche PAS aux toggles M-LVL ni aux calques image/data — chacun gardé indépendant.
- **Status footer** : compte les filtres actifs en bas (`Filtres actifs : tags, tracés`) en jaune si au moins un actif, gris si tout neutre.

**Persistance par plan** :

Les filtres tags + types sont **sauvegardés dans la session du plan**. Si tu actives "masquer les puits" sur le plan A, puis tu changes pour le plan B, puis tu reviens sur A → tes filtres sont **automatiquement restaurés**. Chaque plan a ses propres filtres.

**Synchronisation M-LVL bidirectionnelle** :

La section 🏗️ M-LVL de la modale Filtres **cohabite** avec la pastille M-LVL et la modale Niveaux classique. Toute action d'un côté est répercutée de l'autre :

- Tu coches `Niv 1` dans la modale Filtres → la modale Niveaux et la carte sont mises à jour.
- Tu utilises la pastille M-LVL pour changer de niveau actif → si la modale Filtres est ouverte, sa section 🏗️ se rafraîchit en live.

> 💡 **Cas d'usage typique** : tu travailles sur une grande carrière avec beaucoup de tags. Tu n'es intéressé que par les puits ouverts (tags `peo` et `cao`) pour planifier un parcours d'aération. Ouvre ≡ Filtres → section 🏷️ Tags → clique 🚫 Aucun puis recoche `peo` + `cao`. La carte affiche seulement ces 2 catégories. Sauvegardé automatiquement pour ce plan.

> 📌 **Compatibilité** : les sessions enregistrées avant l'arrivée de cette fonctionnalité sont restaurées sans filtre actif (= tout visible). La première interaction avec la modale crée l'état et le persiste à la prochaine sauvegarde automatique (≤ 1.5 s).

> ⚠️ **Le tracé en cours est toujours visible** : si tu es en train de tracer une route et que tu décoches son type dans le filtre, **le tracé courant reste visible** pour ne pas te perdre. Les autres tracés du même type sont masqués comme prévu. Idem pour zones et structures en cours.

### ⚙️ Réglages du tracker

Accédez aux réglages via le bouton **⚙️ Réglages** de la barre latérale :

- **Échelle (px/m)** : rapport pixels/mètres réels — bouton **🎯** à côté pour calibrer
- 👣 **Taille d'un pas, seuil de détection et cooldown sont les vôtres, pas ceux du plan** : réglés une fois, ils valent pour **tous vos plans** sur cet appareil, et voyagent avec votre profil. Le Générateur ne les propose plus (un plan n'a pas de foulée), et un ancien plan qui en portait est simplement ignoré. « Réinitialiser » les ramène aux valeurs d'usine de l'app.
- **Taille d'un pas (m)** : longueur estimée de votre foulée (≈ 0,7 m)
- **Seuil de détection** : sensibilité du détecteur de pas
- **Cooldown (ms)** : délai minimum entre deux pas
- **Position initiale X / Y** : point de départ de l'icône au chargement

> 🧭 **Saisie assistée de la position de départ** — plus besoin de taper les coordonnées à la main. Sous les champs X / Y, deux boutons :
> - **🔍 Choisir via un point** : recherche un point existant (par nom, identifiant ou tag) et le sélectionne comme position de départ.
> - **📍 Cliquer sur la carte** : la fenêtre de réglages se masque, vous cliquez l'endroit voulu sur le plan, et les coordonnées se remplissent automatiquement (bouton **Annuler** pour ressortir sans choisir).
>
> Même logique de saisie que le géoréférencement. Pensez à **💾 Sauvegarder** pour conserver le réglage.

### 🧭 Navigation intelligente (caler la position sur les tracés)

Sous terre, le GPS satellite ne fonctionne pas : le tracker estime votre position avec **vos pas + la boussole**, ce qui **dérive** avec le temps. Si votre plan contient un **réseau de tracés**, la **navigation intelligente** recale en continu votre position estimée **sur la galerie la plus proche** pour compenser cette imprécision.

**Activation** : ⚙️ Configuration → **« 🧭 Navigation intelligente »** → cochez « Caler la position sur les tracés ». **Désactivée par défaut**, réversible à tout moment.

- Quand vous **avancez**, la position suit la galerie ; aux **intersections**, la branche qui correspond à votre **cap** (direction de marche) est choisie.
- Si vous **sortez des galeries tracées** (zone pas encore cartographiée), retour **automatique** au mode classique, puis recalage dès que vous revenez près d'un tracé.
- **Sans réseau de tracés** sur le plan, l'option est **sans effet**.
- Réglage fin possible (tolérance de calage) — demandez si vous voulez l'ajuster.

> 💡 Le **recalage manuel (📍)** reste votre meilleur ami : dès que vous reconnaissez un repère, recalez — la navigation intelligente repart alors d'une base saine.

> 🧭 **Votre tracé est conservé** : il est **redessiné au rechargement** de l'application (reconstruit depuis l'historique de la session), et le récap **📊 Statistiques** affiche votre **distance parcourue + nombre de pas**.

### 🗺️ Calculer un itinéraire

Le bouton **🗺️** dans le groupe **🧭 Tracker** ouvre la modale d'itinéraire. Elle calcule le **chemin le plus court** entre 2 ou plusieurs points en empruntant les **routes existantes** du plan (à la fois celles que vous avez tracées et celles présentes dans les calques de données).

**Pour tracer un itinéraire :**

> 💡 **Bouton 🧭 Ma position** — ajoute ta position tracker actuelle comme waypoint (snapshot figé). Pratique si tu marches dans la cata avec le tracker actif et tu veux calculer un itinéraire qui démarre d'où tu es. Si tu as recalé ta position au début, c'est cette position recalée qui est utilisée.

> 🚀 **Astuce perf** : si tes routes sont déjà dessinées en dur sur le PNG du plan, tu peux **masquer le calque des routes** dans le contrôle des couches Leaflet (haut-droite). Tu gardes la lisibilité visuelle (le PNG montre les routes) ET tu gagnes en perf de rendu (Leaflet ne dessine pas les polylines des données par-dessus). Le module **🗺️ Itinéraire continue de fonctionner** : il utilise toutes les routes du calque, qu'elles soient affichées ou non.

1. Ouvrez la modale **🗺️ Calculer un itinéraire**
2. Choisissez vos **points de passage** de 2 façons (combinables) :
   - **📍 Mode clic carte** : la modale se réduit à un mini-bandeau "Mode clic actif", cliquez sur la carte pour poser chaque waypoint (markers cyan numérotés). Bouton **✓ Terminer** pour revenir à la modale.
   - **🔍 Recherche** : tapez le nom, l'id ou un tag d'un point existant ; cliquez dans la liste de suggestions pour l'ajouter.
3. Vous pouvez **retirer** un waypoint avec le bouton ✕ à droite de chaque ligne.
4. Cliquez **🎯 Calculer l'itinéraire** : un tracé **cyan néon** apparaît, l'app vous indique la **distance totale en mètres** et le nombre de tronçons traversés.
5. **💾 Enregistrer** garde l'itinéraire dans la session, **❌ Effacer** le retire.

**Étiquette de distance** : tant qu'un itinéraire est actif, un petit label **🗺️ Itinéraire : XX m · ⏱️ temps · 🚶 mode vitesse** s'affiche en bas à gauche de la carte, juste au-dessus du label de mesure de distance classique.

**🏃 Vitesse de marche estimée** (segmented control dans la modale) — 4 presets pour ajuster l'estimation du temps de parcours :

| Mode | Vitesse | Quand l'utiliser |
|---|---|---|
| 🤕 **Blessé** | 2 km/h | Progression entravée, très lent, terrain accidenté |
| 🐌 **Lente** | 3 km/h | Prudente, étroitures, exploration, transport de matos |
| 🚶 **Normale** | 5 km/h | Défaut, allure standard de marche cataphile |
| 🏃 **Rapide** | 7 km/h | Allure soutenue, parcours connu, retour rapide |

Le mode actif est affiché à côté du temps estimé dans le label bottomleft. Le choix est persisté entre sessions (sur cet appareil). Tu peux changer de mode à tout moment via la modale, le temps se met à jour instantanément.

**Mode navigation** — quand un itinéraire est déjà actif et que vous rouvrez **🗺️ Calculer un itinéraire**, la modale bascule en **mode navigation** :

- Boutons rapides **⏮️ Début** (centre la carte sur le 1er waypoint avec un cercle cyan flash), **⏭️ Fin** (idem pour le dernier), **🔁 Tour complet** (zoom pour voir tout le tracé).
- Bouton **🎯** sur chaque waypoint pour aller le voir directement.
- **🔄 Recalculer** repasse en mode édition (les waypoints sont conservés, vous pouvez les retoucher).
- **❌ Effacer l'itinéraire** retire complètement le tracé.

**Tolérance** : l'algorithme accepte que vos points de départ ou d'arrivée soient un peu **à côté** des routes — il les snappe automatiquement sur le réseau le plus proche. Si plusieurs roads se croisent visuellement mais sans partager exactement un même point (cas typique d'un tracé fait à la main), l'app gère aussi les **jonctions à 15 px près** pour tracer le chemin sans coupure.

> 💡 **Astuce** : si vous voulez voir uniquement le tracé sans le label distance, fermez la modale puis ré-ouvrez-la en mode navigation pour utiliser les boutons de pilotage.

#### 🔄 Itinéraire vivant — replanification au recalage + validation d'étapes

Pendant une sortie réelle, le tracker peut dériver et le téléphone passe du temps verrouillé dans la poche. L'itinéraire s'adapte tout seul à chaque **recalage de position** :

- **Recale ta position** (clic carte en mode recalage, bouton **📍 Je suis ici** d'un point, ou arrivée par un portail) → l'itinéraire actif est **automatiquement recalculé depuis ta nouvelle position**. Ta position devient le nouveau point 0, les étapes restantes sont conservées **dans l'ordre que tu avais planifié**, tes préférences d'évitement sont respectées.
- **Valide ton passage à une étape** : touche **📍 Je suis ici** sur un point qui fait partie de ton itinéraire → l'étape est **validée** (marker **✓ vert** sur la carte, ligne rayée dans la modale), exclue des prochains calculs, et l'itinéraire repart de là. **L'ordre est libre** : tu peux visiter l'étape 3 avant la 1, l'app valide ce que TU fais, pas ce qu'elle propose.
- **Toutes les étapes validées** (y compris ta sortie) → petit message « 🎉 Itinéraire terminé » et le tracé s'efface. Ton tracé tracker, lui, reste affiché.
- Le recalage **clic carte** ne valide jamais d'étape (il est approximatif par nature) : il replanifie seulement.
- Les étapes validées **survivent au reload et au verrouillage du téléphone** (sauvegardées avec la session).

> 💡 En pratique : planifie ta sortie (moi → curiosité X → curiosité Y → sortie), marche, et à chaque point atteint touche **📍 Je suis ici** sur son popup. L'app coche, recalcule, et t'indique toujours le chemin depuis là où tu es vraiment.

#### 🪧 Guidage — « Dans 40 m, tourner à gauche » (depuis v1.98.0)

Quand le **tracker est actif** et qu'un **itinéraire est tracé** (depuis la modale, un « 🧭 Y aller » sur un point ou la sortie d'urgence), un **bandeau** apparaît tout seul en haut de la carte et te dit quoi faire :

- **« Dans 40 m, tourner à gauche »**, **« Continuer sur 120 m »**, puis **« Maintenant : tourner à gauche »** à l'approche. En petit dessous, la consigne suivante (« Puis tourner à droite »).
- **Seulement aux croisements** : tant qu'il n'y a qu'une galerie à suivre, le guidage se tait, même si elle tourne. Il ne dit jamais « la 3e à gauche » (les tracés ne montrent pas toutes les ouvertures réelles) : toujours une **distance**.
- **Deux galeries proches** → « prendre la branche de gauche / de droite ». Au passage d'une jonction de niveau → « monter / descendre vers le niveau N ».
- **Grands carrefours** : plusieurs croisements rapprochés (à 5 m ou moins l'un de l'autre) comptent comme **un seul carrefour**, avec **une seule consigne** donnée à son entrée. À partir de **4 galeries**, un **petit schéma** remplace la flèche : chaque galerie est un trait, celle d'où tu viens en pointillé en bas, **celle à prendre en doré**. Si un point nommé se trouve dans le carrefour, son nom ouvre la consigne.
- **Hors tracé au départ** → « Rejoindre le tracé : ~12 m », avec une **flèche** qui pointe vers la galerie la plus proche, par rapport à ton téléphone.
- **Distances** : nettes avec la **🧭 Navigation intelligente** (⚙️ Réglages → Navigation & tracker) ; sans elle, elles sont **approximatives** (« ~40 m », arrondies à 10 m), parce que la position vient du podomètre et dérive.

**Tu t'écartes ou tu fais demi-tour ?** Le bandeau passe en orange (« Hors itinéraire ? » / « Demi-tour ? ») et propose **[Je suis ici]** (touche l'endroit où tu es, l'itinéraire se recalcule depuis là), **[Recalculer d'ici]** et **[Ignorer]** (plus d'alerte jusqu'à ton retour sur le chemin). Rien n'est recalculé sans toi : une dérive du podomètre ressemble à un écart.

**Toucher le bandeau** ouvre la **🪧 Feuille de route** : toutes les consignes avec leurs distances (touche une ligne pour voir l'endroit). Elle est aussi accessible **sans tracker**, depuis la modale Itinéraire (bouton « 🪧 Feuille de route »), pour préparer une sortie.

**La croix ✕** masque le bandeau **pour cet itinéraire** ; il revient au suivant. Pour le couper **pour de bon** : menu 🧭 Tracker → **🪧 Guidage de l'itinéraire**.

**Trajet à vol d'oiseau** : si ton départ, une étape ou ton arrivée est à côté des galeries, le bout de trajet jusqu'à la plus proche est dessiné **en pointillé** et **compté** dans la distance (une étape hors tracé compte aller et retour). Au-delà de **50 m**, l'app te prévient : ce trajet n'est pas une galerie connue, vérifie ta position. Sur un plan **sans aucun tracé**, l'itinéraire ne peut pas être calculé : l'app le dit dès le lancement.

> 🚨 **En sortie d'urgence**, le bandeau n'a **pas de croix** et s'affiche même si le guidage est coupé ; en cas d'écart, le bouton devient **« Sortie la plus proche d'ici »**. L'**écran d'urgence XL** reprend la consigne en gros.

#### 🚫 Préférences d'évitement

Dans la modale itinéraire, une section repliable **🚫 Préférences d'évitement (optionnel)** permet de définir des contraintes **souples** que le pathfinder essaiera de respecter :

| Type | Description |
|---|---|
| **📍 Points à éviter** | **3 méthodes** au choix : (a) recherche autocomplete dans le champ texte, (b) saisie par ID exact, (c) **📍 Cliquer sur la carte** : bascule en mode clic, chaque clic sur la map ajoute un point. Chips orange avec ✕ pour retirer. |
| **🏷️ Tags à éviter** | Clique un chip pour le toggler. Tous les points portant ce tag seront évités (ex: tu actives `pa` → tous les puits aération sont évités). |
| **⬛ Zones à éviter** | Coche un **type de zone** dans la liste (Eau, Effondrement, tes types personnalisés…) pour que l'itinéraire **contourne** toutes les zones de ce type. Les zones **⛔ inaccessibles** n'apparaissent pas ici : elles sont infranchissables par défaut (contrainte dure, relâchable par la case « Respecter les zones inaccessibles » de cette même fenêtre). |
| **📏 Marge** | Distance autour des points évités (px, défaut 100). Tout segment de route à moins de cette marge est exclu du graphe. |

**Comportement** :
- ✅ Si possible, l'itinéraire évite tout (= calcul normal)
- ⚠️ Si aucun chemin alternatif n'existe → l'app calcule quand même en passant par ces points et affiche un message orange `⚠️ Impossible d'éviter : X, Y` au-dessus du résultat
- ❌ Si même le fallback échoue (= vraie absence de chemin) → message d'erreur classique

**Différence avec ⛔ Zone Inaccessible** :
- ⛔ Zone = contrainte **dure par défaut** — relâchable par la case « Respecter les zones inaccessibles » de la modale Itinéraire. Le Mode Secours et « Perdu », eux, les respectent toujours.
- 🚫 Évitement = contrainte **souple** (fallback possible avec message)

**Persistance** : tes préférences sont sauvegardées par plan (sur cet appareil). Au prochain calcul sur le même plan, elles sont restaurées. Bouton **🗑️ Reset** pour tout effacer.

> 🧭 **Par où commencer, selon ta situation.** Les pages qui suivent couvrent quatre outils différents. Celui dont tu as besoin dépend de ce qui t'arrive :
>
> | Ta situation | L'outil | Où |
> |---|---|---|
> | Je veux **la sortie la plus proche**, tout de suite | 🚨 Sortie d'urgence | section « Mode Sortie d'urgence », plus haut |
> | **Je ne sais plus où je suis**, mais je sais par où je suis passé | ⛑️ Je suis perdu | juste en dessous |
> | Je panique, j'ai besoin d'un **écran lisible en gros** | 🚨 Mode urgence « panique » | juste après |
> | **Je coordonne des équipes** qui cherchent quelqu'un | 🚨 Mode Secours | le reste de ce chapitre |
>
> Les quatre sont indépendants. Le Mode Secours est le seul qui demande une préparation : équipes déclarées, zones assignées.

### ⛑️ Mode urgence — "Je suis perdu"

Le bouton **⛑️** orange dans le groupe **🧭 Tracker** ouvre le mode urgence. Il estime la **zone probable où vous pouvez être maintenant** à partir de votre dernière position connue, du temps écoulé et d'**indices visuels** que vous observez autour de vous.

> ⚠️ **Le mode urgence est une aide géométrique. Il ne remplace PAS** : un fil d'Ariane, une boussole, une lampe avec piles de rechange, une carte papier, et la règle d'or de prévenir quelqu'un avant la sortie. Si vous êtes vraiment perdu : restez calme, ne paniquez pas, économisez votre lumière, et signalez votre position si vous avez du réseau.

**Comment ça marche :**

1. **📍 Dernière position connue** — renseignez où vous étiez sûr d'être il y a X minutes :
   - 🔎 **Recherche** d'un point existant par nom/id (ex: "PA1", "salle", "épure XYZ")
   - 📍 **Clic carte** — clic direct sur la carte pour placer un repère
   - 🧭 **Position tracker** — utilise la position actuelle du tracker s'il est actif

2. **⏱️ Temps écoulé** — slider de 1 à 90 minutes (1h30 max). Au-delà, la zone devient si large que le mode n'est plus pertinent — privilégiez alors un signalement de secours réel.

3. **🏃 Vitesse de marche présumée** — un segmented control 4 presets. Le rayon final = `vitesse × temps`. Les valeurs km/h sont **les mêmes que le mode itinéraire** pour la cohérence (un preset "Normale" représente la même vitesse partout dans l'app).

   | Preset | Vitesse | Rayon pour 10 min | Quand l'utiliser |
   |---|---|---|---|
   | 🤕 **Blessé** | 2 km/h | ~333 m | Progression entravée, très lent, marche hésitante |
   | 🐌 **Lente** | 3 km/h | ~500 m | Marche prudente, étroitures, exploration |
   | 🚶 **Normale** *(défaut)* | 5 km/h | ~833 m | Allure standard de marche |
   | 🏃 **Rapide** | 7 km/h | ~1167 m | Parcours connu, marche soutenue |

   Le choix est persisté entre sessions (sur cet appareil). Si la zone est déjà affichée sur la carte, changer de preset la recalcule instantanément.

4. **🔮 Indices visuels (optionnel mais très utile)** — texte libre, séparé par virgule ou retour ligne. Exemples : *"bidon eau, épure bélier, salle bleue, puits cassé, escalier descend"*. L'app cherche ces mots dans le **nom**, la **description** et les **tags** de tous les points du plan (calques et points session combinés).

5. Cliquez **🎯 Calculer la zone**.

**Ce qui apparaît sur la carte :**

| Élément | Signification |
|---|---|
| **Cercle orange pulsant** | Zone de recherche (rayon = vitesse × temps) |
| **📍 vert pulsant** | Votre dernière position connue |
| **🔮 violet pulsant** | Indice texte qui matche ET est **dans la zone** (le plus important) |
| **· gris** | Indice texte qui matche mais est **hors zone** (exclu) |
| **Cercle violet intérieur** | Localisation probable affinée (barycentre des indices in-zone) — apparaît seulement s'il y a au moins 1 match in-zone |

**⚠️ Si la zone dépasse les bornes du plan** (rayon trop grand vs taille du plan), une bande d'alerte orange dans les résultats vous le signale : *"Le rayon dépasse la taille du plan — tu pourrais être n'importe où"*. Diminuez le temps écoulé ou affinez avec des indices.

**Actions disponibles dans les résultats :**

- **📋 Copier le rapport** — copie un texte structuré dans le presse-papiers (plan, position, temps, indices, loc affinée, timestamp) pour partager par SMS, radio ou tout autre moyen de communication.
- **✅ Supprimer la zone et sauvegarder ma position supposée** — retire la zone de recherche de la carte ET ajoute un point éditeur permanent (icône ⚠️ danger) à la localisation probable. Tu peux ensuite l'exporter ou le convertir comme n'importe quel autre point.
- **🗑️ Effacer la zone et fermer** — retire la zone et les markers de la carte sans sauvegarder de point.

**👁️ Fermer la modale sans effacer la zone** : le bouton **👁️ Fermer** (et la croix ✕ en haut, et le clic en dehors de la modale) ferment juste la modale. La zone reste visible sur la carte pour que vous puissiez explorer ; rouvrir **⛑️** restaure tous vos paramètres précédents.

> 💡 **Cas d'usage type** — vous êtes sorti(e) du dernier puits identifié il y a 20 minutes, vous marchez depuis sans tracker, et vous voyez maintenant *"une épure 'Bélier' sur le mur, et un bidon d'eau au sol"*. Ouvrez ⛑️, sélectionnez le puits comme dernière position, mettez 20 min, tapez `bélier, bidon` dans les indices. L'app vous montre la zone probable et — s'il y a un point nommé "épure Bélier" dans le plan qui tombe dans la zone — un cercle violet à cet endroit.

#### 📚 Bonnes pratiques quand on est perdu

Le mode ⛑️ inclut un **bloc dépliable "📚 Bonnes pratiques"** en haut de la modale (clique pour ouvrir). Il regroupe les conseils essentiels en 6 sections, à lire calmement si la situation l'exige :

**🧘 Garde ton calme (d'abord)** — Stop. Inspire. La panique fait perdre les repères et gaspille lumière + énergie. Mange/bois un peu si tu as quelque chose.

**🗺️ Orientation** — **Reviens sur tes pas** plutôt que chercher à atteindre ta destination (statistiquement plus fiable). Cherche les **axes principaux** (roulages, galeries droites, voies ferrées) qui mènent à des repères connus. **Utilise une boussole physique** — pas celle du téléphone (faussée par le sol et les armatures). **Écoute les bruits** : circulation, métro, eau qui coule = indice de direction.

**🔦 Lumière & ressources** — Mode économie immédiatement. Garde une lampe de secours. Hydrate-toi un peu mais économise.

**📡 Communication** — Si tu **captes du réseau** (souvent près des puits / regards) → préviens quelqu'un en surface AVANT que ta batterie meure. Utilise le bouton **📋 Copier le rapport** pour préparer un message tout fait avec ta dernière position + le temps écoulé.

**📍 Si tu décides d'attendre** — Pose-toi à un endroit **identifiable** (puits numéroté, salle nommée). Reste où tu es si **personne ne sait que tu es là**. Marque ton emplacement pour qu'on te trouve.

**⚠️ À ne pas faire** — Ne suis pas l'eau (diaclases dangereuses). Ne tente pas un passage inconnu juste parce qu'il "monte". Ne te fie pas au tracker téléphone (il dérive sous stress).

> ⚠️ Ces conseils sont des **principes généraux** issus de la pratique cataphile. Ils ne remplacent pas la formation, l'équipement et le bon sens. La règle d'or reste : prévenir quelqu'un en surface AVANT la sortie, avec heure de retour estimée.

### 🚨 Mode urgence "panique"

> 💡 **Ne pas confondre avec ⛑️ "Je suis perdu"** : le ⛑️ calcule une zone théorique (où tu peux être à partir d'une dernière position connue + temps écoulé). Le 🚨, lui, suppose que **tu SAIS où tu es** (le tracker l'affiche), mais que **tu paniques et tu as besoin d'infos vitales en gros pour réagir vite**.

Le bouton **🚨** rouge dans le groupe **🧭 Tracker** ouvre un mode "panique" plein écran qui regroupe en un coup d'œil :

- 📍 **Une seule position, en énorme** (lisible à un mètre du téléphone) : les coordonnées **GPS** si ton plan est géoréférencé — ce sont celles qu'on dicte à des secours — sinon la position **X / Y du plan**. Jamais les deux : le titre du bloc dit laquelle tu lis. Sous les chiffres, une ligne précise si c'est ta position suivie, ta dernière position connue, ou la **position de départ du plan jamais confirmée**.
- 🧭 **Boussole géante** : cap (sens de marche) avec aiguille tournée en temps réel, mise à jour live via les capteurs d'orientation du téléphone
- 🪧 **La consigne du guidage en gros** (depuis v1.98.0) : si un itinéraire est tracé et le suivi actif, la prochaine consigne (« Dans 40 m, tourner à gauche », schéma des grands carrefours) s'affiche en haut de l'écran. En cas d'écart, un bouton **« Voir les choix sur la carte »** te ramène au bandeau et à ses boutons
- 🗺️ **Minimap auto-focus** : zoom serré (~20-50 m d'horizon) centré en permanence sur ta position. Affiche en arrière-plan les **roads / zones / structures du plan** — utile pour repérer chemins, sorties, dangers à proximité immédiate
  Elle utilise les **couleurs de ta légende** : si tu as repeint un type ou créé tes propres types, tu les reconnais ici comme sur la carte.
  Ton **itinéraire actif** y est toujours tracé (cyan vif + halo blanc, pour rester visible sur ce fond très zoomé), et la carte **s'oriente** comme la carte principale si tu as activé le mode « plan orienté ».
- 📋 **« Copier ma position »** : un bouton carré **à droite des chiffres** (les chiffres eux-mêmes marchent aussi — c'est là que le doigt va d'abord). Il devient ✅ le temps de te confirmer la copie. Si ton plan est géoréférencé, il copie **les coordonnées seules** — `48.823328, 2.322915` — le format qui se colle tel quel dans un SMS, dans Google Maps ou dans Plans, sans rien avoir à nettoyer. Sinon il copie le **nom du plan et ta position X/Y**, qui ne parle qu'à quelqu'un qui a le même plan. À garder sous la main dès que tu captes un peu de réseau. ⚠️ *Le doute reste à l'écran, pas dans le message : si ta position n'a jamais été confirmée, la ligne sous les chiffres te le dit — dis-le aussi à qui tu écris.*
- 🔋 **Une ligne d'état en haut à droite** : ton **niveau de batterie** (seulement si ton navigateur l'expose et si tu n'as pas décoché le réglage — sinon rien du tout, pas de « ? » ; critique ici : tu sais combien de temps il te reste avant que le téléphone s'éteigne), l'état du **tracker** et celui de la **boussole**. Le **nom du plan** est juste sous le titre 🚨. *L'échelle du plan n'y est plus (v1.97.11) : c'est un chiffre de calibrage, il se lit dans ⚙️ Réglages, pas quand on cherche où l'on est.*
- 🌗 **Thème** : l'écran suit celui de l'app (sombre ou clair). Il n'y a plus de bouton dédié — un seul réglage, dans ⚙️ Configuration de l'accueil.
- 🔋 **Wake Lock** : l'écran ne s'éteint pas automatiquement tant que le mode est actif (pas besoin de toucher le téléphone toutes les 30 sec pour le réveiller)
- 📱 **Paysage** : la minimap se recadre correctement quand tu tournes le téléphone, et la mise en page change — position à gauche, carte à droite sur toute la hauteur.
- 🗺️ **Tout tient dans un écran** : plus rien à faire défiler, et **la carte prend toute la place gagnée** (mesuré : elle a doublé de hauteur sur un téléphone en portrait).

**Quand l'utiliser ?**
- Tu paniques à un croisement et tu as besoin de te re-orienter rapidement
- Tu cherches un détail visuel sur le plan (un pilier, un puits) qui devrait être tout près
- Tu veux vérifier que tu vas dans la bonne direction (cap boussole)
- Tu dois lire ta position en grand pour la transmettre à quelqu'un (radio, SMS) sans plisser les yeux

**Permissions** : la première fois, le navigateur demande l'accès aux **capteurs d'orientation** du téléphone (pour la boussole). Accepte — sans ça, la boussole reste figée.

**Sortie** : le gros bouton **↩️ SORTIR DU MODE URGENCE** en bas de l'écran — il reste collé en bas, tu n'as jamais à le chercher. Sur ordinateur, la touche **Échap** fait la même chose.

### 🚨 Mode Secours

Outil opérationnel pour **assigner méthodiquement des équipes de secours** à des zones de recherche d'un plan cataphile. Cas d'usage : une personne est portée disparue dans un réseau dense, plusieurs équipes arrivent en surface, le PC secours doit coordonner « qui ratisse quoi » avec un briefing clair et imprimable.

> 💡 **Différent du ⛑️ Je suis perdu** : ⛑️ c'est *toi* qui es perdu, tu cherches à te retrouver. **🚨 Mode Secours** c'est *quelqu'un d'autre* qui est perdu, tu organises les équipes qui vont le chercher.

#### Accès

Bouton 🚨 dans le menu **🧭 Tracker** (section urgences, en bas), à côté de ⛑️ Je suis perdu et 🚨 Panique. Fond rouge urgence cohérent.

#### Workflow

1. **Liste des scénarios** — Tu vois tous les scénarios sauvegardés pour ce plan (max 10, les plus anciens sont effacés — jamais un scénario en cours, celui que tu as ouvert, ni une intervention terminée dont aucun rapport n'est encore sorti de l'appareil).
2. **➕ Nouveau scénario** — Stepper léger : Nom + Notes contexte + Heure d'incident.
3. **Édition free-form** — 3 sections accordéon :
   - **📝 Contexte** : nom, heure d'incident, notes (ex: « Marc parti vers 14h pour vérifier galerie Est… »)
   - **🚨 Équipes** : ajoute autant d'équipes que nécessaire. Pour chaque équipe : nom (auto Alpha/Bravo/Charlie...), couleur (palette OTAN 10 couleurs fixe), membres (CSV), entrée/sortie (clic carte), zone (polygone OU sélection de tracés), itinéraire suggéré (calc auto via Pathfinder)
   - **📤 Export** : PDF imprimable (1 page/équipe) + KMZ géolocalisé (cross-app)

#### Modes interactifs map

| Bouton | Action |
|---|---|
| 📍 Entrée | 1 clic carte = capture la position d'entrée de l'équipe |
| 🚪 Sortie | 1 clic carte = capture la position de sortie |
| ⬛ Définir zone | Choix : (a) polygone multi-clic + double-clic pour fermer, OU (b) sélection de tracés au clic : la galerie la plus proche, parmi les niveaux affichés, est prise (re-clic = retirer, surlignée en rouge). Les galeries du plan sont retrouvées à l'identique sur tout téléphone qui a le même plan ; un tracé ajouté à la main sur un seul appareil n'existe que sur celui-ci. Les calques masqués restent sélectionnables |
| 🗺️ Calc. itinéraire | Calcule automatiquement le chemin le plus court entre entrée et sortie en suivant les galeries existantes (via Pathfinder), affiche distance + durée estimée selon les réglages **⏱️ Durées estimées** du plan de secours (vitesse de fouille 1,5 km/h et pause 0 par défaut, modifiables) |

> 🔁 **Pendant l'intervention** : une équipe ajoutée en renfort, ou dont tu modifies l'entrée, la sortie ou les étapes, reçoit tout de suite ses étapes. Ce qui a déjà été saisi (statut, observations, photos) reste sur la même étape, même si deux étapes portent le même nom. Retirer une étape déjà renseignée demande une confirmation, et c'est **refusé** si elle signale « Aide demandée » ou « Victime trouvée » : change d'abord son statut. Remise plus tard **dans la même phase**, l'étape retrouve ce qui y avait été saisi (après un changement de phase, elle repart vide ; ses saisies restent dans l'historique de la phase close). Si une équipe signale « Aide demandée » ou « Victime trouvée » sur une étape que tu avais retirée entre-temps, l'import de son rapport **remet le point dans son parcours**, à sa place, et te l'annonce en rouge ; si le point ne peut pas être remis (équipe qui n'est plus dans la phase en cours), l'alerte rouge s'affiche quand même. ⚠️ **Après une mise à jour de l'application, réimporte le plan sur chaque téléphone avant l'intervention** : un téléphone qui avait importé le plan avec une ancienne version (avant la v1.98.5) envoie des rapports que le PC ne peut pas fusionner. **Relancer** un plan terminé efface l'intervention précédente, photos comprises : une confirmation le rappelle, exporte son rapport avant. « Tous les POI de la zone » ajoute les étapes de proche en proche, pour éviter les allers-retours.

> 🗺️ **Sur la carte, pendant l'intervention** : en **lançant le plan en mode équipe**, tu es **placé à l'entrée de ton équipe** — automatiquement si ta position n'était pas encore confirmée, sinon l'app te le propose (« Me placer à l'entrée » / « Garder ma position »). Au lancement, **un seul message** résume tout (plan lancé, placé à l'entrée, plan pas disponible hors-ligne) et ne bloque plus les boutons dessous ; relancer un scénario déjà joué repart de zéro (plus de faux retards hérités de la veille). Fermer la fenêtre du Mode Secours ne retire plus rien — ta zone et ton tracé restent affichés (l'équipier voit son équipe, l'opérateur toutes), même après un rechargement. En bas de l'écran, une pastille rouge **« 🚨 Secours · Alpha · 3/8 › »** rappelle que l'intervention tourne et où tu en es : un toucher te ramène **directement aux étapes** à valider. En préparation : les équipes se **replient** (▾/▸ ou « Tout replier ») ; en dessinant une zone, celles des autres équipes s'affichent en pointillé pour caler les limites ; toucher un POI pour choisir l'entrée, la sortie ou une étape **le prend comme point** (sa fiche ne s'ouvre plus) ; un point sans nom s'affiche en **coordonnées GPS** si le plan est géoréférencé ; « Auto : 1 équipe par niveau » ignore les niveaux vides, et les listes de niveaux marquent « (vide) » ceux où il n'y a rien (toujours choisissables).

> 🚒 **Ce que le terrain a changé (v1.98.24)** : **🚑 Évacuer** propose aussi les **accès de tes équipes** (« Accès n° 3 (Charlie, Delta) — à ouvrir par la surface » s'il est fermé), classés par distance réelle, et plus seulement les sorties taguées du plan. L'opérateur voit en tête **« X engagés · Y sous terre · Z manquants »** et est prévenu au lancement des équipes **sans effectif** ; à la rentrée, le nombre de **remontés n'est plus prérempli** (il faut compter). Chaque équipe peut avoir une **heure de retour impérative** (fiche d'équipe) qui prime sur la durée estimée, et le chef se saisit même sans liste de membres. Les durées distinguent la **vitesse d'approche** (hors zone) de la **vitesse de fouille** (dans la zone) et comptent les raccords à vol d'oiseau. **Valider une étape recale ta position** sur elle (sans rien demander à moins de 30 m, avec une question au-delà ; jamais pour « Bloqué » ou « Demi-tour ») et **« Suivre mon parcours » démarre le suivi**. Une étape a **un seul numéro** partout (E, 1…N, S) ; passer à la suivante sans statut la note **« Passée, non renseignée »** (plus RAS). Au calcul, **toutes les étapes à plus de 25 m d'une galerie** sont listées, et le rappel reste sur la fiche. L'**écran XL** affiche aussi les longs itinéraires. Le briefing pompiers dit **quel accès c'est et s'il faut l'ouvrir**, et imprime chef, effectif et retour impératif.

> 📊 **Couverture honnête (v1.98.25)** : le bloc **📊 Couverture** donne, **par niveau**, la longueur de galeries, la part **dans une zone**, la part **sur un parcours** (galeries qu'un itinéraire d'équipe emprunte vraiment : c'est ce qui sera fouillé) et la longueur affectée à deux équipes. Sur un réseau réel, « 86 % dans une zone » peut n'être que « 24 % sur un parcours ». **🗺️ Surligner les galeries hors parcours** les montre en rouge sur la carte (niveau affiché) pour préparer la phase suivante ; un second clic les retire. Sur un plan multiniveau, une zone **vaut au niveau où tu l'as dessinée** (case « Zone sur tous les niveaux » sur la fiche d'équipe pour l'étendre), et le calcul d'itinéraire prévient quand des galeries d'un autre niveau passent sous la zone sans qu'aucun parcours n'y aille.

> 🚑 **Victime, retards et rappel** : une étape passée en **« Victime trouvée »** donne une **position** (celle de l'étape, niveau compris) — **📍 Préciser sur la carte** l'ajuste, **🚑 Évacuer** ouvre la Sortie d'urgence depuis la victime, et un **✚ rouge** la marque sur la carte, pour tous. L'opérateur la voit en bandeau en tête de sa vue, et le rapport l'imprime en premier. Chaque équipe a son **heure de départ** (**▶️ Départ**, sinon le lancement) et son **heure de retour prévue** (départ + durée estimée) : **orange** passé l'heure, **rouge** après la marge (30 min par défaut, réglable dans ⏱️ Durées estimées) — les équipes en retard remontent en tête, la pastille du bas change de couleur, un message et une vibration préviennent. **✅ Rentrée** arrête le chrono. **📢 Rappel général** (ou 📢 Rappeler, par équipe) marque les équipes encore sous terre comme rappelées, avec l'heure. ⚠️ **L'app ne prévient personne** — il n'y a pas de réseau sous terre : transmets l'ordre par radio ou à la voix. Départ, rentrée, rappel et position précisée voyagent dans le rapport d'équipe.

> 🧭 **Guidage pas à pas du parcours** : dans la vue de ton équipe, **🧭 Suivre mon parcours** transforme le parcours en itinéraire de l'app — le bandeau de guidage (« Dans 40 m, tourner à gauche »), la feuille de route et l'écran XL te mènent d'étape en étape (active le suivi 🧭). Les étapes que tu valides sont cochées sur l'itinéraire ; si tu t'écartes, **Recalculer** repart d'ici vers la **prochaine étape non faite**, en contournant toujours les zones des autres équipes. En arrivant sur une étape, un message et une vibration te préviennent, et la pastille 🚨 t'ouvre directement cette étape. Le **PDF de briefing** imprime aussi, pour chaque équipe, sa **feuille de route** carrefour par carrefour (changements de niveau compris) — calcule l'itinéraire de l'équipe pour l'obtenir.

> 👥 **Chef, effectif, remontés et main courante** : chaque équipe a un **👤 chef** (choisi parmi ses membres) et un **effectif**. À **✅ Rentrée**, l'app demande **combien sont remontés** : en dessous de l'effectif, une **alerte rouge « N personne(s) manquante(s) »** reste affichée (et la pastille du bas passe au rouge) tant que le compte n'est pas corrigé. La **📜 main courante** (vue opérateur) note tout, heure par heure : lancement, statuts, victime, départs, rentrées, rappels, imports, phases — plus tes propres notes (appel radio, décision). Elle voyage dans les rapports d'équipe et s'imprime en annexe du rapport. Le **rapport du secouriste libre** s'importe désormais comme celui d'une équipe : ses notes rejoignent la main courante, à leur heure.

> 🗂️ **Préparer et relancer** : à la clôture d'une phase, le **parcours prévu** de chaque équipe est gardé — replanifier la phase suivante ne l'efface plus, et le rapport affiche le parcours de chaque phase. Dans la vue édition, le bloc **📊 Couverture** (calculé à l'ouverture) donne la **part des galeries couvertes** par les zones, les **POI situés dans la zone d'une équipe mais hors de son parcours**, et les **POI visités par plusieurs équipes** — une aide à la lecture, rien n'est affecté automatiquement. Au lancement, l'app te **prévient si le plan n'est pas entièrement disponible hors-ligne** sur l'appareil (plan serveur non téléchargé). Dans la vue de l'équipe, trois raccourcis : **🚪 Sortie d'urgence**, **🆘 Écran XL**, **⛑️ Je suis perdu** — absents, comme « Suivre mon parcours », quand l'opérateur de surface **prend la main** pour relayer une équipe : ils agiraient sur son propre appareil.

#### Visualisation carte

Bouton **🗺️ Voir sur carte** dans le header de l'édit. Affiche pour chaque équipe (couleur dédiée) :
- Zone polygone (fillOpacity 30 %) OU halo couleur sur les tracés sélectionnés
- Marker 📍 Entrée (cercle border vert + fill couleur équipe)
- Marker 🚪 Sortie (cercle border rouge + fill couleur équipe)
- Itinéraire suggéré (polyline dashed couleur équipe)

Auto-refresh à chaque modif. Re-cliquer le bouton pour masquer.

#### Multi-scénarios par plan

Tu peux préparer **plusieurs hypothèses** simultanées (« si Marc parti par l'Est » vs « si par le Sud »). Bouton 🗐 Dupliquer pour cloner un scénario et tester une variante sans perdre l'original. Cap 10 scénarios par plan : au-delà, le plus ancien est purgé automatiquement — sauf un scénario en cours, celui que tu as ouvert, le plus récent, ou une intervention terminée dont aucun rapport (PDF ou fichier) n'est encore sorti de l'appareil.

#### Exports

**📄 PDF imprimable** : 1 page A4 portrait par équipe (une 2e si la liste des étapes est longue) avec bandeau couleur + sections Contexte/Membres/Mission/Itinéraire + cadre Observations vide 60mm (à remplir au stylo au retour terrain). Filename `Secours_<nom_scénario>_<date>.pdf`.

**🌍 KMZ géolocalisé** : embarque le scénario complet dans un fichier annexe du KMZ (`myktamap-extras.json > secoursPlan`). Pré-requis : plan déjà calibré KMZ (cf modale Export sessions onglet 🌍 KMZ). MyKTAMap peut re-importer le KMZ et recharger le scénario tel quel. Filename `Secours_<nom_scénario>_<date>.kmz`.

Les sections ci-dessous détaillent les fonctionnalités avancées : intégrations cross-app (KML, Lost Mode, heatmap, etc.), exploitation terrain temps réel (vues Live par rôle, statuts, rapports), et consolidation cross-device (import de rapports d'équipiers).

> 💡 **Le partage opérateur ↔ équipes** passe par le **rapport `.mkmsec.report.json`** classique (échange de fichier device-à-device).

> 💡 **Recommandation terrain** : prépare un ou deux scénarios **AVANT** incident sur tes plans favoris pour identifier les frictions du workflow (où sont les accès, comment découper le réseau, quels niveaux par équipe). Pendant un vrai incident, tu seras en mode urgence et l'app doit être prête à dégainer en 30 secondes.

### 🚨 Mode Secours — Multi-phases

Un scénario peut **séquencer plusieurs phases** avec debrief intercalé entre chaque. Cas d'usage terrain typique : *Phase 1 = une équipe balaye TOUS les roulages principaux sans entrer dans les chambres d'exploitation → retour de l'équipe → debrief au PC → Phase 2 = X équipes ciblent les chambres d'exploitation avec les infos remontées de Phase 1.*

> 💡 **Si tu n'utilises pas le multi-phases**, ne change rien : ton scénario reste avec **1 seule phase implicite** et le comportement est strictement identique au comportement précédent. Aucune pollution visuelle (badges et boutons multi-phases n'apparaissent QUE si tu crées effectivement 2+ phases).

**🔧 Créer et gérer les phases (vue Edit du scénario)** :

- Section **📋 Phases (N)** sous la section Équipes
- Bouton **➕ Ajouter une phase** → modale création :
  - Saisis un nom (ex : *« Phase 2 — Chambres Est »*)
  - Coche les **équipes participantes** à cette phase (modèle hybride : tes équipes sont définies une seule fois au scénario, puis tu coches case par case "participe à cette phase")
- Bouton ✏️ pour renommer une phase ou modifier la sélection d'équipes
- Bouton 🗑️ pour supprimer (refusé si c'est la dernière phase, si elle est active dans l'exécution, ou si elle a déjà été démarrée → l'historique est préservé)

**🏷️ Badge sticky dans les 3 vues Live** : un badge ambré « **📋 Phase 1 1/N** » apparaît dans le header des vues Équipe / Opérateur / Secouriste libre dès qu'il y a 2 phases ou plus. Affiche le nom de la phase active + sa position.

**✓ Terminer une phase + debrief (Opérateur uniquement)** :

1. Pendant la phase active, le footer Live Op affiche un nouveau bouton **« ✓ Phase terminée »** ambré (visible seulement si multi-phase)
2. **Auto-détection** : dès que **toutes les équipes participantes ont marqué leur étape Sortie comme terminée**, le bouton passe en **vert pulsant** + un toast assistant t'avertit (« ✅ Toutes les équipes sont sorties — la phase est prête à clore »). L'Op garde la décision finale.
3. **Clic « ✓ Phase terminée »** → modale debrief : textarea libre (5000 caractères max) pour saisir les enseignements de la phase (équipes rentrées, points trouvés, zones à explorer en priorité, contraintes apparues). Ce debrief sera intercalé dans le rapport final entre les sections de chaque phase.
4. **Valide « ✓ Terminer la phase »** → la phase actuelle est **archivée** (jamais d'écrasement, historique préservé)
5. **Si une phase suivante existe** → enchaînement automatique sur modale **« 🚀 Démarrer phase X+1 ? »** avec récap des équipes participantes
6. **Tu confirmes** → la nouvelle phase démarre, les étapes des équipes participantes sont **reconstruites depuis leur parcours ACTUEL** (donc si tu as modifié `entrée/sortie/intermédiaires` d'une équipe entre P1 et P2, les nouvelles étapes en tiennent compte)
7. **Si aucune phase suivante** → une confirmation « Arrêter complètement le plan ? » (équivalent ⏹️ Terminer le plan)

**🔍 Garde-fous historique** :

- Clore une phase ne supprime **JAMAIS** d'étapes — elles sont archivées telles quelles
- Une phase déjà démarrée ne peut plus être supprimée depuis l'UI (filet de sécurité)
- Une phase active dans l'exécution ne peut pas être supprimée (passe par « ✓ Phase terminée » d'abord)
- Le toast d'auto-détection ne se répète pas (un seul affichage par phase)

> 💡 **Modèle hybride équipes ↔ phases** : tes équipes sont définies **une seule fois** au scénario (avec membres, couleur OTAN, parcours). La participation à chaque phase est gérée par checkbox dans la modale phase. Une même équipe peut participer à plusieurs phases successives — au passage de phase, ses étapes sont reset selon son parcours actuel (donc tu peux modifier le parcours entre P1 et P2 pour adapter à ce qui a été découvert).

> 💡 **Bouton « ➕ Ajouter une phase » aussi disponible à chaud** depuis le footer Live Op (pendant l'exécution), pas seulement depuis la vue Edit. Pratique quand le debrief de P1 fait apparaître le besoin d'une P3 imprévue.

### 🚨 Mode Secours — Intégrations cross-app

Ces intégrations font du Mode Secours un outil de coordination opérationnelle complet :

#### 🌍 KML cross-app (Google Earth, OsmAnd, Avenza…)

Le KMZ exporté contient un Folder racine `🚨 Secours` parfaitement structuré pour les apps tierces :

```
📁 Secours — Recherche Marc 26/05
   ├── 📁 🚨 Équipe Alpha
   │ ├── 📁 📍 Points (5) ← toggle ON/OFF dans Google Earth
   │ ├── 📁 ⬛ Zone de recherche
   │ └── 📁 🗺️ Itinéraire
   └── 📁 🚨 Équipe Bravo (idem)
```

- Plan d'arrière-plan en GroundOverlay 60% opacity (lecture simultanée plan + zones)
- Auto-calc des itinéraires manquants AVANT l'export (1 clic = KMZ complet)
- 43 styles couleur OTAN (10 équipes × 4 catégories + 3 styles fixes entrée/sortie/boucle)

#### ⛑️→🚨 Workflow Lost Mode → Secours

Dans la modale ⛑️ Mode urgence "Je suis perdu", nouveau bouton :

```
🚨 Lancer un plan de secours (équipes + zones)
```

Au clic, l'app **crée automatiquement un scénario Mode Secours** avec :
- Nom auto `Recherche - 26/05/2026 14:32`
- Heure d'incident calculée depuis le temps écoulé du Lost Mode
- Dernière position connue + zone d'incertitude (rayon + cercle pointillé sur la carte)
- Notes auto avec vitesse de marche, rayon, indices saisis

→ Workflow naturel : tu cherches quelqu'un → tu lances Lost Mode → tu cliques 🚨 → tu coordonnes les équipes.

#### 🚫 Anti-chevauchement entre équipes

Quand tu calcules l'itinéraire d'une équipe, les **waypoints + zones des autres équipes** deviennent automatiquement des "préférences éviter" pour Pathfinder. Résultat : les itinéraires se contournent au lieu de se croiser, pas de relais involontaire.

Si vraiment pas le choix (passage unique partagé), toast warn `⚠️ Itinéraire traverse N point(s) d'autres équipes — vérifie les chevauchements`.

#### 🔥 Heatmap d'activité dans Mode Secours

Nouveau bloc orange "🔍 Outils d'analyse" dans la section Contexte avec bouton **🔥 Afficher la heatmap d'activité**. Visualise les zones où le tracker a enregistré du passage → utile pour identifier les zones probables à fouiller en priorité.

> 🧩 Ce bloc reste disponible **même si l'option 🔥 Heatmap est désactivée** : elle ne retire que la tuile du menu Tracker.

Si le disparu utilisait MyKTAMap et a exporté sa session avec timeline tracker, la heatmap montre directement où il a passé du temps.

#### 🏗️ Auto-création 1 équipe par niveau (M-LVL)

Sur les plans multi-niveau, bouton conditionnel **🏗️ Auto : 1 équipe par niveau (N)** dans la section Équipes. Crée auto N équipes nommées `Niveau RDC / +1 / -1...` avec couleurs auto-cyclées. Tu poses ensuite zones + waypoints sur chaque niveau séparément en changeant le niveau actif via la pastille M-LVL topleft.

#### ⭐ Favoris en accès rapide

Dans la mini-modale "📍 Choisir un point", tes favoris du plan apparaissent en chips cliquables (max 8) AU-DESSUS de la recherche autocomplete. 1 clic = waypoint appliqué (skip search + clic carte).

Particulièrement utile pour les scénarios urgence où tu veux créer rapidement plusieurs équipes avec les mêmes 3-4 puits d'accès connus.

#### 🛑 Pause entre les arrêts (itinéraire)

Nouvelle section dans la modale 🗺️ Itinéraire :

```
🛑 Pause entre les arrêts
☑️ Inclure une pause entre chaque arrêt intermédiaire
   Durée par pause : [15] min
```

Default checked + 15 min (= comportement préservé). ⚠️ Depuis la v1.98.11, cette pause ne concerne **plus** le Mode Secours : chaque plan de secours a ses propres réglages (bloc **⏱️ Durées estimées** : vitesse de fouille et pause par étape), transmis aux équipes avec le plan.

> ⚠️ Comme tous les outils numériques en sous-sol : **garde une boussole physique** et une carte papier dans ta poche. Le téléphone peut tomber en panne, le magnétomètre peut être faussé par du métal local, le tracker peut dériver. Le 🚨 est une aide à la lecture rapide d'infos, pas un substitut à la préparation.

### 🚨 Mode Secours × 🌍 Vue OSM — Coordination secours externes

Le Mode Secours est intégré avec la Vue OSM pour fournir aux **secours externes** (pompiers, GRIMP, SDIS) tout ce qu'il leur faut pour intervenir sur le site sans connaître les lieux.

#### 🚪 Tag « Point d'entrée du plan »

Nouveau tag built-in disponible dans la catégorie **🚨 Secours** de la légende et de l'éditeur de POI. Marque la (les) entrée(s) principale(s) du site pour les secours :

- Icône SVG vectorielle (porte jaune sur fond noir)
- Apparaît automatiquement dans le PDF Briefing pompiers (section « POI critiques »)
- Visible sur la Vue OSM aussi (avec sa géoréférence GPS)

> Pour taguer un POI : édite-le → menu Tag → catégorie « 🚨 Secours » → « 🚪 Point d'entrée du plan ». Tu peux avoir plusieurs entrées (entrée nord/sud/etc.).

#### 📍 GPS surface des équipes

Dans la fiche d'une équipe (Mode Secours → édition équipe), nouveau champ **📍 GPS surface** :

```
📍 GPS surface : [48.8566, 2.3522 ]
                  ↑ format : lat, lng (décimal WGS84)
```

Renseigne la position GPS du PC secours, du lieu de rendez-vous avec les pompiers, ou tout point d'intérêt en surface lié à cette équipe. Optionnel.

→ Cette donnée alimente le **PDF Briefing pompiers** (lien OSM clickable par équipe) et reste dans l'export `.mkmsec.json`.

#### 🌍 Vue OSM accessible partout dans Mode Secours

Le bouton **🌍 Vue OSM** est présent dans :
- La vue Édition (bandeau scénario)
- Les 3 vues Live : 👤 Opérateur surface, 🚨 Équipier, 🚑 Secouriste libre

Plus besoin de revenir à l'édition pour montrer la position du plan sur OpenStreetMap aux pompiers qui débarquent en cours de mission.

#### 🚒 Briefing pompiers PDF dédié

Nouveau bouton **🚒 Briefing pompiers** dans tous les bandeaux Mode Secours. Génère un PDF dédié spécialement conçu pour les secours externes, contenant :

| Section | Contenu |
|---------|---------|
| **ACCÈS SURFACE** | En tête : le plan **recadré sur les accès** des équipes (sans POI), un **repère numéroté** par accès, et un tableau N° · accès (entrée, sortie ou les deux) · équipes · **GPS + lien de carte cliquable**. Deux équipes qui partent du même accès n'ont qu'un numéro. Pense à **nommer tes entrées** (« Plaque rue X ») : sinon le tableau dit « Accès sans nom » |
| **INFOS** | Nom scénario · nom plan · date génération |
| **LOCALISATION** | Coordonnées GPS centre + bbox + **lien OpenStreetMap cliquable** + **lien Google Maps cliquable** |
| **EQUIPES SUR PLACE** | Pour chaque équipe : nom + membres + GPS surface (si renseigné) + lien OSM individuel par équipe |
| **POI CRITIQUES** | Les accès du plan, avec leur niveau : d'abord les **ouverts** (🚪 points d'entrée, cavages, puits à échelons, escaliers de service — les mêmes que la Sortie d'urgence), puis les **fermés** (que pompiers et IGC peuvent ouvrir). Liste tirée des points tagués du plan (jusqu'en v1.98.6, ce bloc restait vide) |

> 💡 **Comment utiliser** : Le PDF s'imprime ou s'envoie par mail/Signal au chef de groupe pompiers AVANT son arrivée. Sur place, il clique les liens depuis son tél/PC pour ouvrir OSM ou Google Maps centrés sur ton site. Aucune installation MyKTAMap nécessaire chez lui.

#### 📤 Page « Briefing surface » dans le rapport post-mission

Le rapport PDF post-mission (généré au bouton 📤 Rapport) inclut une page « BRIEFING SURFACE » avec les mêmes infos, carte des accès en tête (la vue OpenStreetMap du plan entier, illisible sur un A4, n'y figure plus ; dans le briefing pompiers, elle reste en option, POI décochés par défaut). Sur les cartes d'équipe, une entrée et une sortie posées au même accès (à moins de 10 m) ne font plus qu'un repère « ENTRÉE / SORTIE ». Au calcul d'un itinéraire, une étape posée loin de toute galerie est nommée (« L'étape « Puits 2 » est à 68 m du tracé le plus proche ») : corrige-la avant de descendre. Utile pour debrief géographique avec les pompiers ou archivage du dossier d'intervention.

#### 🏷️ Filtre tags Vue OSM

Les chips de filtre par tag de la modale Vue OSM listent **tous les tags présents** dans le plan, alignés avec le widget Vue OSM Home.

#### 💾 Save Offline — Vue OSM hors-ligne

Tu pars en sortie cataphile, ou tu te prépares à un Mode Secours dans une zone à cellular pourri ? Tu peux **télécharger la carte OpenStreetMap autour de ton plan à l'avance**, et la consulter **sans Internet** une fois sur place.

**À quoi ça sert** :

- Tu ouvres la Vue OSM sur le terrain même sans réseau (sortie souterraine prolongée, Mode Secours en zone blanche, batterie qui force le mode avion data…)
- Le fond de carte (rues, contours, repères de surface) reste affiché normalement → tu sais où tu es par rapport au plan sans dépendre de la 4G
- Particulièrement utile **pour les pompiers / SDIS** auxquels tu présentes la Vue OSM à l'arrivée : la carte s'affiche immédiatement, pas d'attente de chargement

**Comment l'activer** :

Un bouton **💾 Save Offline** est disponible dans le bandeau de la Vue OSM. **Un clic suffit** :

1. L'app télécharge les tuiles OpenStreetMap visibles autour de ton plan + quelques niveaux de zoom proches
2. Le bandeau affiche après le téléchargement : **📦 N tuiles · X MB** (= ce qui est disponible sur ton appareil)
3. Tu peux refaire un clic plus tard si tu zoomes sur une autre zone que tu veux aussi sauvegarder

> 💡 **Max ~200 tuiles par clic** (~5-10 MB) : c'est une limite stricte pour respecter la politique d'usage OpenStreetMap (= service gratuit financé par les dons, donc pas d'abus). Si tu veux sauvegarder une zone très large, fais plusieurs clics en déplaçant la vue.

**Où c'est dispo** :

Le bouton 💾 Save Offline est présent dans **3 contextes** — et le cache est **partagé** entre les trois :

| Contexte | Quand l'utiliser |
|---|---|
| **🌍 Vue OSM modale** (mode carte) | Tu prépares une sortie : tu ouvres la Vue OSM, tu cadres la zone, tu cliques 💾 |
| **🌍 Widget OSM de l'accueil** | Tu prépares tes plans depuis la home sans avoir à charger un plan en mode carte |
| **🚨 Mode Secours** (bandeaux Création + Live) | Tu déclenches une mission : un coup de 💾 et toute l'équipe a la zone sur l'appareil avant de descendre |

> ✅ **Cache partagé** : tu télécharges UNE fois → c'est dispo partout, pas de doublon. Pas besoin de recommencer le téléchargement à chaque mode.

**Comportement intelligent hors-ligne** :

Quand l'app détecte que t'as pas d'Internet, elle adapte le comportement de l'icône 🌍 selon ce qui est dispo sur ton appareil :

| Internet | Plan sauvegardé | Icône 🌍 | Action |
|---|---|---|---|
| ✅ | – | visible | ouverture normale |
| ❌ | ✅ | visible | ouverture directe depuis ton appareil (pas de test ping) |
| ❌ | ❌ | masqué | re-connexion nécessaire — message clair "Plan non disponible hors-ligne, clique 💾 quand connecté" |

Concrètement : si t'as sauvegardé ton plan la veille au Wi-Fi, l'icône 🌍 reste visible le lendemain en cellular pourri et la modale s'ouvre **direct** sans tenter un test réseau qui ralentirait tout. Si t'as oublié de sauvegarder, l'app te le dit clairement plutôt que de te laisser tourner en rond.

**🔒 Tout reste local et privé** :

- Les tuiles téléchargées sont **stockées 100 % sur ton appareil** (ton navigateur / la PWA installée)
- **Rien n'est jamais transmis** à un serveur tiers, ni à l'auteur, ni à OpenStreetMap après le téléchargement initial
- Aucune trace de ce que tu sauvegardes n'est tracée
- Au prochain reset complet (💥 Tout réinitialiser), les tuiles sauvegardées sont effacées avec le reste

> 💡 **Astuce sortie cataphile** : la veille de la sortie, ouvre la Vue OSM sur ton tel à la maison (Wi-Fi), zoome sur la zone de l'entrée + les rues autour, clique **💾 Save Offline**. Le lendemain en surface au point de RDV, même en cellular faible, la carte s'affiche instantanément.

### 🚨 Mode Secours — Exploitation terrain temps réel

Le scénario a **2 états distincts** :

1. 📝 **CRÉATION** — Vue Édition. Tu prépares tes équipes, leurs parcours, leurs zones, les itinéraires suggérés.
2. 🚀 **EXÉCUTION** — Vue Live temps réel. L'équipe est PARTIE, tu suis ses observations étape par étape, tu commentes en live.

Tu bascules d'un état à l'autre via le **bouton « 🚀 Lancer le plan de secours »** dans la vue Édition.

#### 🚀 Lancement du plan + sélection du rôle

Un nouveau bandeau dynamique apparaît en haut de la vue Édition :

| État du bandeau | Quand | Boutons |
|---|---|---|
| Gris « Ajoute au moins une équipe… » | 0 équipe définie | Aucun |
| **Jaune CTA « 🚀 Lancer »** | Au moins 1 équipe | 🚀 Lancer le plan de secours |
| **Vert « 🟢 PLAN ACTIF — <Rôle> »** | Plan lancé en cours | ▶️ Reprendre vue Live · 📤 Rapport · ⏹️ Arrêter |
| **Bleu « 📦 PLAN TERMINÉ »** | Plan arrêté (historique) | 📤 Voir rapport historique · 🚀 Relancer |

Au clic « 🚀 Lancer », **modale sélection rôle** avec 3 choix :

```
◉ 👤 Opérateur de surface
   Tu coordonnes depuis le PC chef. Tu vois toutes les équipes en
   parallèle, tu peux éditer leurs observations en supervision.

○ 🚨 Équipe sur le terrain : [Alpha ▾]
   Tu fais partie d'une équipe assignée. Tu suis ton parcours étape
   par étape et tu commentes en live.

○ 🚑 Secouriste libre
   Tu interviens sans équipe pré-assignée (renfort ponctuel, recon).
   Tu prends des notes libres avec timestamps.
```

> 💡 Tu pourras changer de rôle plus tard sans perdre les observations.

#### 🚨 Vue Live — Mode ÉQUIPIER (step-by-step)

Pour le secouriste sur le terrain qui suit son parcours :

```
┌─────────────────────────────────────────────────────┐
│ 🚨 Équipe Alpha · Étape 3/5 ⏱️ 14h 23min │
├─────────────────────────────────────────────────────┤
│ ✓ ━ ✓ ━ ↻ ━ ○ ━ ○ │ ← stepper
│ cliquable, couleur statut par étape │
├─────────────────────────────────────────────────────┤
│ 📍 ÉTAPE 3 — Puits aération Nord │
│ Statut : 🟢 RAS │
│ │
│ 📝 Observations à cette étape : │
│ [galerie centrale rien à signaler] │
│ │
│ ⚡ Saisie rapide : │
│ [🟢 RAS] [🟡 Suspect] [⬛ Bloqué] [🔵 Indice] │
│ [🟠 Aide demandée] [🟣 Demi-tour] [🚨 Victime !] │
│ │
│ [📸 Photo (0/5)] [🎯 Recentrer carte] │
├─────────────────────────────────────────────────────┤
│ [← Étape précédente] [Étape suivante →] │
│ [⏸️ Pause] [📤 Rapport] [Voir édition] [⏹️ Terminer] │
└─────────────────────────────────────────────────────┘
```

**8 statuts cliquables** (couleurs gravées dans la charte) :

| Emoji | Label | Quand l'utiliser |
|---|---|---|
| • | Pending | (statut par défaut avant interaction) |
| 🟢 | RAS | Rien à signaler |
| 🟡 | Suspect | Traces / bruits / odeur inhabituels |
| ⬛ | Bloqué | Passage impraticable (effondrement, eau) |
| 🔵 | Indice | Objet / vestige trouvé |
| 🟠 | Aide demandée | Renfort matériel / humain demandé |
| 🟣 | Demi-tour forcé | Parcours abandonné, retour anticipé |
| 🚨 | **Victime trouvée** | **Urgence absolue** — déclenche signal rouge clignotant côté PC |

**Photos** : appui « 📸 Photo (X/5) » → caméra arrière auto sur mobile OU galerie. Max 5 photos par étape, compression auto JPEG q85 max 1920px. Cliquer une miniature → viewer plein écran avec swipe + zoom.

**Auto-save** : observations sauvées au blur du textarea ET au changement d'étape. Pas besoin de bouton « Sauver ».

**Auto-statut RAS** : passer à l'étape suivante sans avoir mis de statut explicite → marqué automatiquement « 🟢 RAS » (suppose que tu as fait l'étape sans rien à signaler). Re-clic statut possible si besoin.

#### 👤 Vue Live — Mode OPÉRATEUR SURFACE (vue d'ensemble)

Pour le PC chef qui coordonne plusieurs équipes en parallèle :

```
┌─────────────────────────────────────────────────────┐
│ 👤 Opérateur surface · 3 équipes ⏱️ 02h 14min │
├─────────────────────────────────────────────────────┤
│ ┌──────────────────┐ ┌──────────────────┐ │
│ │ 🔴 Alpha 3/5 │ │ 🔵 Bravo 1/4 │ │
│ │ ████████░░ 60% │ │ ███░░░░░░░ 25% │ │
│ │ 🟢 RAS │ │ 🟠 Aide demandée │ │
│ │ « RAS galerie │ │ « Eau au sol, │ │
│ │ centrale » │ │ niveau monte » │ │
│ │ ⏱️ 14:23 │ │ ⏱️ 14:18 │ │
│ │ [👁️ Détails] │ │ [👁️ Détails] │ │
│ │ [🚨 Prendre main]│ │ [🚨 Prendre main]│ │
│ └──────────────────┘ └──────────────────┘ │
│ ┌──────────────────┐ │
│ │ 🟢 Charlie ✓T │ ← équipe Terminée (grisée) │
│ └──────────────────┘ │
├─────────────────────────────────────────────────────┤
│ [⏸️ Pause] [🗺️ Carte globale] [📤 Rapport global] │
│ [Voir édition] [⏹️ Terminer le plan] │
└─────────────────────────────────────────────────────┘
```

**Cards spéciales** avec signaux visuels forts :

- 🚨 **Victime trouvée** → card **ROUGE CLIGNOTANTE** (animation 1.2s, urgence absolue, tu ne peux PAS la rater)
- 🟠 **Aide demandée** → orange + lueur (renfort à envoyer)
- ✓ **Terminée** → grisée opacity 0.75 (toutes étapes complétées)

**Bouton « 👁️ Détails »** → mini-modale read-only avec liste chronologique des étapes de l'équipe (ts + statut emoji + obs).

**Bouton « 🚨 Prendre la main »** → bascule vers la vue Équipier focalisée sur cette équipe spécifique. Tu deviens TEMPORAIREMENT l'équipier d'Alpha pour saisir une observation détaillée à sa place (cas typique : tu es au PC chef mais tu reçois un appel radio d'Alpha qui te dicte ses obs). La vue s'ouvre sur la **première étape non terminée de cette équipe**, même si tu étais plus loin chez une autre.

**Retour facile** : une fois en mode Équipier après « Prendre la main », un bouton **« 👤 Retour Opérateur »** apparaît dans le footer. Au clic → retour à la vue d'ensemble Opérateur intacte (le retour reste possible après un rechargement ou un changement de plan).

**Bouton « 🗺️ Voir carte globale »** : masque la modale + render l'overlay carte avec toutes les zones + waypoints + itinéraires des équipes en couleurs OTAN.

#### 🚑 Vue Live — Mode SECOURISTE LIBRE (notes en vrac)

Pour le renfort ponctuel / la reconnaissance sans équipe pré-assignée :

```
┌─────────────────────────────────────────────────────┐
│ 🚑 Secouriste libre · 12 notes ⏱️ 01h 47min │
├─────────────────────────────────────────────────────┤
│ 📝 Ajouter une note │
│ [galerie nord rien à signaler] │
│ ⚡ Statut associé : │
│ [🟢 RAS] [🟡 Suspect] [⬛ Bloqué] [🔵 Indice] │
│ [🟠 Aide] [🟣 Demi-tour] [🚨 Victime !] │
├─────────────────────────────────────────────────────┤
│ 12. 🟢 RAS · ⏱️ 16:42:18 [✕] │
│ « Croisement Est, RAS, on continue » │
│ │
│ 11. 🟡 Suspect · ⏱️ 16:38:05 [✕] │
│ « Bruit d'eau qui coule, source ?? » │
│ │
│ ... (chronologique DESC) │
└─────────────────────────────────────────────────────┘
```

Pas de stepper, pas d'étapes structurées. Juste un fil de notes horodatées avec statut. Pratique pour les missions où le parcours n'est pas planifié à l'avance (renfort qui arrive en cours, équipe de reconnaissance, etc.).

#### 📤 Rapport au fil des étapes

À tout moment pendant l'exécution ET après l'arrêt du plan, tu peux générer un rapport via le bouton **« 📤 Rapport »** présent dans :

- Le footer de chaque vue Live (scope adapté au rôle courant)
- Le bandeau vue Édition (si execution active OU terminée)

3 formats au choix dans la modale unifiée :

| Format | Cas d'usage |
|---|---|
| 📄 **PDF imprimable A4** | Briefing global page 1 + page texte étapes par équipe + page photos en grille 2 cols. Idéal pour rapport papier / impression / archivage / passation papier au pompier. |
| 📦 **`.mkmsec.report.json`** | Data structuré autonome (photos en base64 si cochée). Re-importable sur le device opérateur surface (consolidation cross-device, voir section dédiée). |
| 📋 **Texte plain** | Markdown-like copié au presse-papier. Pour partage Discord / SMS / mail rapide. |

**3 scopes selon ton rôle** :

- 👤 **Mode Opérateur** → « 📤 Rapport global » : TOUTES les équipes + leurs étapes + photos
- 🚨 **Mode Équipier** → « 📤 Rapport » : SON équipe uniquement (parcours individuel)
- 🚑 **Mode Secouriste libre** → « 📤 Rapport » : SES notes libres chronologiques

**Aperçu compact** en haut de la modale : titre rôle + nombre étapes + % progression + durée. **Checkbox « 📸 Inclure les photos »** COCHÉE par défaut (avec hint dynamique compteur). Toast feedback à chaque action.

**Rapport généré à l'instant** : reflète l'état COURANT du scénario. Réutilisable autant de fois que nécessaire. Idéal pour :
- Briefing en cours de mission (snapshot intermédiaire à imprimer pour la relève)
- Passation cross-device (export JSON → mail / clé USB → import sur PC opérateur)
- Rapport final post-mission (PDF imprimable + archivage)

#### ⏱️ Timer global avec pause juste

Le timer ⏱️ affiché en haut de chaque vue Live est calculé depuis le démarrage MOINS le temps de pause cumulé. Tu peux mettre en pause avec le bouton **« ⏸️ Pause »** (le timer fige) puis reprendre avec **« ▶️ Reprendre »** — la durée de pause n'est PAS comptabilisée.

**Re-render 1×/seconde** sans flash visuel, sans perte de focus dans la textarea observations en cours de saisie. Permet de garder le rapport temps-réel précis pendant des missions longues (h+).

#### 🎬 Cycle complet typique

```
1. 📝 Création scénario (vue Édition)
   ├─ Ajout équipes Alpha/Bravo/Charlie (couleurs OTAN)
   ├─ Pour chaque équipe : parcours entrée → étapes → sortie
   ├─ Zones de recherche (polygone OU tracés sélectionnés)
   ├─ Itinéraires auto-calc Pathfinder (avoidances cross-équipes)
   └─ Export PDF / KMZ / .mkmsec.json pour briefing initial

2. 🚀 Lancement (modale sélection rôle)
   └─ Bascule en vue Live selon rôle choisi

3. 🚨 Exécution (vue Live)
   ├─ Mode Équipier : suit parcours step-by-step + observations + photos
   ├─ Mode Opérateur : vue d'ensemble cards + supervision + prise main
   └─ Mode Secouriste libre : notes en vrac chronologiques

4. 📤 Rapport au fil des étapes (n fois)
   ├─ PDF imprimable pour relève / passation papier
   ├─ JSON pour consolidation cross-device
   └─ Texte presse-papier pour Discord / mail rapide

5. ⏹️ Arrêt du plan (bandeau « 📦 PLAN TERMINÉ »)
   ├─ Observations conservées comme historique
   ├─ Bouton « 📤 Voir le rapport historique » réutilisable
   └─ Bouton « 🚀 Relancer » si re-mission
```

#### 📥 Consolidation cross-device

Au retour terrain, chaque équipier peut **partager son rapport** avec l'opérateur surface qui l'**importe et fusionne** ses observations dans le tableau de supervision.

**Workflow type — opération avec 3 équipes** :

1. **Côté Opérateur (surface, AVANT incident)** :
   - Prépare le scénario (équipes Alpha / Bravo / Charlie + parcours + zones)
   - Lance le plan (🚀) → vue Live Opérateur surface
   - Transmet le scénario aux équipiers via export `.mkmsec.json` classique (mail / clé USB / AirDrop)

2. **Côté chaque Équipier (terrain)** :
   - Importe le `.mkmsec.json` de l'opérateur : l'import garde les identifiants du PC, c'est ce qui permettra à l'opérateur d'accepter son rapport. Si le plan est **déjà** sur le téléphone (plan mis à jour par l'opérateur), l'aperçu propose **« Remplacer »** (coché : garde le lien avec l'opérateur, mais efface les statuts, observations et photos déjà saisis sur ce téléphone) ou **« Importer comme copie »** (nouveau scénario, dont le rapport sera refusé par l'opérateur)
   - Lance le plan → vue Live Équipe → renseigne obs + statuts + photos par étape
   - **Au retour surface** : génère son rapport via « 📤 Rapport » dans le footer Live Équipe → format **`.mkmsec.report.json`** → exporte le fichier (download local)

3. **Côté Opérateur (retour terrain)** :
   - Récupère les 3 rapports `.mkmsec.report.json` (un par équipe) via le canal de son choix (AirDrop, mail, clé USB, Discord)
   - Dans la vue Live Opérateur → bouton **« 📥 Importer rapport équipier »** dans le footer
   - File picker → sélectionne le fichier → modale preview qui montre : nom équipe ciblée, nombre d'étapes à fusionner, photos, et **conflits détectés** (étapes côté op déjà renseignées qui vont être fusionnées)
   - Confirme l'import → l'app fait un **snapshot AVANT** (backup d'urgence) puis fusionne :
     - Observations **concaténées avec séparateur daté** (aucune perte)
     - Statut **le plus grave retenu** ; à gravité égale, **le plus récent** — un « RAS » rapporté par l'équipe remplace « en attente », une victime n'est jamais rétrogradée
     - Photos **importées avec déduplication**
   - Modale résultat avec stats détaillées (X étapes fusionnées, Y photos importées, Z avertissements éventuels)
   - Répète pour les 2 autres équipes
   - ⚠️ **Rapport arrivé après un changement de phase** : s'il porte sur une phase déjà close, il est rangé dans **l'historique de cette phase** — jamais dans la phase en cours — et l'app le signale en orange (en rouge s'il contient « Aide demandée » ou « Victime trouvée »)
   - 🧭 **Signalement sur une étape que tu as retirée** : il n'est pas perdu — il s'affiche en orange à l'import et figure dans la section **« Signalements hors parcours »** du rapport final
   - 🗺️ **Plan modifié depuis l'envoi** : si le plan a changé de version (ou a été retracé) depuis l'export du scénario, l'aperçu d'import te prévient et compte les tracés de zone qu'il ne retrouve plus
   - 📚 Le **rapport final** reprend aussi les étapes des **phases closes**, phase par phase

4. **Visualisation post-fusion** :
   - Sur la card de chaque équipe Op : chip bleu « 📥 importé » apparaît si au moins une étape a reçu de la consolidation
   - Dans la modale « Détails équipe » (read-only) : chip « 📥 importé » sur chaque étape concernée + tooltip avec date import + version app source

**Sécurité de l'import** : refuse si scope ≠ équipier (les rapports opérateur global ou secouriste libre ne sont pas fusionnables), si le scénario d'origine est différent, si l'équipe est absente du scénario actif, ou si aucune exécution n'est en cours côté op. **Plan différent côté équipier** → warning (pas erreur, on conserve les obs textuelles).

**Undo** : un snapshot SessionBackups est créé **automatiquement AVANT** chaque import. En cas d'erreur, restaure depuis **📊 Détails de session → Backups récents** (titre : « Avant import rapport équipier <nom> »).

> ⚠️ Important : **les équipes doivent être enregistrées côté Opérateur AVANT le lancement** du plan (pas de création silencieuse à l'import). Si tu prépares ton scénario avec Alpha / Bravo / Charlie mais qu'un équipier exporte sous le nom « Delta » créé localement, l'import sera rejeté — il fallait recevoir Delta dans le scénario initial.

---

## ⏪ Undo / Redo

Tu peux **annuler** et **rétablir** tes actions sur le plan, jusqu'à **50 actions en arrière**.

### Raccourcis clavier (recommandé)

> ⌨️ **Appuie sur `?` à tout moment** pour afficher la liste complète des raccourcis (cheatsheet).

| Raccourci | Action |
|---|---|
| **?** | Afficher tous les raccourcis (cheatsheet) |
| **E / M / Z / S / T / P** | Ouvrir Édition / Mesure / Zones / Structures / Tracker / Tracés |
| **L / B / R** | Légende / Boussole / Recherche |
| **Ctrl+K** (`Cmd+K` Mac) | Recherche (alternative à R) |
| **TAB / Entrée** | Dans un menu d'outils ouvert : parcourir les options / valider la sélection |
| **F** | Mode présentation (Échap pour sortir) |
| **Ctrl+Z** (`Cmd+Z` Mac) | Annuler la dernière action |
| **Ctrl+Y** (`Cmd+Y` Mac) | Rétablir l'action annulée |
| **Ctrl+Shift+Z** (`Cmd+Shift+Z` Mac) | Rétablir (alternative) |
| **Échap** | Fermer le menu / la fenêtre |

> 💡 Les raccourcis ne se déclenchent pas si tu es en train de taper dans un champ texte — pour ne pas casser l'undo natif du navigateur dans les inputs.

### Boutons dans la sidebar

Un nouveau groupe **⏪ Historique** apparaît dans la **sidebar gauche, en dernière position** (juste sous **⬆️ Enregistrer**, après Doc / Paramètres / Charger / Enregistrer). Il contient 2 sous-actions :
- ⏪ **Annuler** (= Ctrl+Z)
- ⏩ **Rétablir** (= Ctrl+Y)

Les boutons sont **grisés** (opacité réduite + curseur barré) quand il n'y a rien à annuler / rétablir. Cliquer sur un bouton grisé affiche quand même un toast court (« Rien à annuler. » / « Rien à rétablir. ») pour confirmer l'action vide.

### Ce qui est couvert

- ✏️ **Points** : ajout, modification (nom/tag/desc/level), suppression dernier, suppression au clic
- 🛣️ **Tracés** : chaque clic posant un sommet (= 1 entrée) + suppression dernier + suppression au clic + "Tous les tracés"
- ⬛ **Zones** : idem + fermeture par retour au 1er point
- 🏛️ **Structures** : idem (piliers, mur, fronts)

Chaque action déclenche un **toast discret** en bas : `↩ Annulé : Pose du point PA1` ou `↪ Refait : Suppression de Zone Eau`.

### Ce qui n'est PAS couvert

- ❌ **Photos** attachées aux points : leur suppression reste **irréversible** (les fichiers sont effacés du stockage local de ton navigateur, sans retour possible)
- ❌ **Imports de session** : un import qui écrase ta session n'est pas annulable via Ctrl+Z (utilise la sauvegarde automatique de session pour récupérer)
- ❌ **Tracker** (mode capteurs en temps réel)
- ❌ **Mesure de distance** (= outil éphémère, pas une mutation persistante)

### Cycle de vie de l'historique

- **RAM only** : l'historique est gardé en mémoire vive uniquement, **perdu au reload** de la page (c'est volontaire, pour éviter de bloater le stockage local).
- **Reset au changement de plan** : si tu charges un autre plan, l'historique est vidé (logique : tu ne veux pas annuler une action faite sur un autre plan).
- **Limite 50 actions** : au-delà, les plus anciennes sont oubliées.
- **Une nouvelle action efface le redo** : si tu fais 5 undo puis poses un nouveau point, le redo devient impossible (logique de branche d'historique).

---

## 🧩 Fonctionnalités optionnelles

Quatre fonctions secondaires sont **désactivées par défaut**, pour garder l'application légère : on n'active que ce qui sert. Elles se règlent dans **⚙️ Configuration** de l'accueil, groupe **🧩 Fonctionnalités optionnelles** — ou dans **⚙️ Réglages** une fois un plan ouvert : c'est le même réglage, il vaut pour **tous les plans**.

| Option | Par défaut | Ce que ça ajoute |
|---|---|---|
| **🎬 Replay du tracker** | désactivé | La tuile 🎬 dans le menu 🧭 Tracker : rejouer sa session de suivi, exporter la timeline en CSV |
| **🔥 Heatmap** | désactivé | La tuile 🔥 dans le menu 🧭 Tracker : carte de densité de passage |
| **🔋 Niveau de batterie** | désactivé | La charge restante en haut de l'écran, et les alertes sous 20 %, 10 % et 5 % |
| **📳 Vibration haptique** | désactivé | Un retour tactile sur certaines actions |

> ⚡ **Replay et Heatmap agissent tout de suite** : la tuile apparaît ou disparaît à la prochaine ouverture du menu 🧭 Tracker. **La batterie, elle, prend effet au prochain lancement** : l'écoute du capteur se met en place au démarrage de l'app, et il n'existe aucun moyen propre de la retirer en cours de route — l'app te le dit plutôt que de faire semblant.

> 🔋 **Tu utilisais l'indicateur de batterie ?** Il était actif par défaut jusqu'ici ; la mise à jour qui a créé ce groupe l'a **désactivé une fois** chez tout le monde. Recoche-le : ton choix est ensuite conservé.

> 🚨 **Le Mode Secours garde sa heatmap d'activité** (contexte d'un scénario) même quand l'option 🔥 Heatmap est décochée : seule la tuile du menu Tracker disparaît.

### ⛔ « Capteur refusé »

Si la batterie ou la vibration s'affiche **grisée** avec « Capteur refusé par iOS » ou « par cet appareil », ce n'est ni un bug ni un oubli : **ton système ne donne pas ce capteur aux pages web**. Apple ne fournit ni la vibration ni le niveau de batterie à un site, même installé en application.

> 💡 Avant, ces options étaient simplement **cachées** — impossible de savoir si elles n'existaient pas ou si le téléphone les refusait. Elles s'affichent maintenant, avec la raison.

### 🎬 Replay de session tracker

> 🧩 **Fonctionnalité optionnelle** — à activer dans ⚙️ Configuration › 🧩 Fonctionnalités optionnelles.

Le bouton **🎬** dans le groupe **🧭 Tracker** ouvre la modale **Replay**. Elle te permet de **rejouer ta session de tracking** depuis le début, avec une timeline interactive et l'export en CSV.

**Comment ça marche** :

- Pendant que tu fais du tracking, l'app enregistre en interne une **timeline** : pour chaque pas PDR appliqué, chaque recalage manuel, et l'instant de démarrage, elle stocke `(timestamp_epoch_ms, x_plan, y_plan, type)`.
- Au clic sur 🎬, une modale plein écran s'ouvre avec :
  - **Slider timeline** (gauche → droite = début → fin)
  - Boutons **⏮ Restart · ▶️ Play · ⏸ Pause · ⏭ End**
  - Sélecteur de **vitesse** : 0.5× · 1× · 2× · 5× · 10×
  - Bouton **💾 Export CSV**
  - Bouton **⛶** pour basculer en mode compact (bottom sheet) qui libère la carte
- À l'appui sur **▶️ Play**, la modale **bascule automatiquement en mode compact** — tu vois la carte en grand pendant que le marker jaune rejoue tes pas. Le trail (ligne) s'allonge au fur et à mesure.

**Raccourcis clavier** :

| Touche | Action |
|---|---|
| Espace | Play / Pause |
| ← | Reculer de 1s |
| → | Avancer de 1s |
| Échap | Fermer la modale |

**Bouton 💾 Export CSV** produit un fichier `.csv` à 5 colonnes (ou 6 en M-LVL) :

```
timestamp_ms_epoch,delta_ms_since_start,x_plan,y_plan,type[,level]
```

- `type` = `start` (démarrage tracking), `pdr` (pas PDR appliqué), `recalage` (recalage manuel)
- Ouvrable dans Excel / LibreOffice / Numbers / Python pandas / R / etc.

**Cas des recalages** : un recalage = téléportation. Visuellement, le trail saute (pas de ligne entre le point N et N+1 si type = recalage) pour ne pas afficher une ligne droite qui n'a pas de réalité géographique.

**Reset** : la timeline est remise à zéro au changement de plan ou au reload (RAM-only).

### 🔥 Heatmap — densité de passage

> 🧩 **Fonctionnalité optionnelle** — à activer dans ⚙️ Configuration › 🧩 Fonctionnalités optionnelles.

Le bouton **🔥 Heatmap** dans le menu **🧭 Tracker** ouvre une modale qui dessine une **carte de densité** par-dessus ton plan. Pratique pour visualiser d'un coup d'œil les **zones les plus fréquentées** (passages clés) vs celles peu utilisées.

> 📌 **Pertinence** : la heatmap s'appuie sur une interpolation le long des segments + une normalisation par histogramme + des filtres sur la timeline tracker, pour un rendu fidèle de la fréquentation réelle.

#### 🗂️ 6 sources cochables (combinables)

Tu choisis ce qui contribue à la chaleur affichée :

| Source | Contenu |
|---|---|
| 🧭 **Tracker timeline** | Tous les points de ta session de tracking (filtré : skip recalages = téléport, skip starts, skip gaps > 5 min) |
| 📍 **Points session** | Tes points ajoutés via l'éditeur |
| 🛣️ **Tracés session** | Tes routes (Principal / Secondaire / Chemin) tracées en session |
| ⬛ **Zones session** | Tes zones (eau / remblais / effondrement / inaccessible) |
| 🏛️ **Structures session** | Tes piliers / murs / fronts |
| 📊 **Calques de données** | Tous les éléments embarqués dans les data layers du plan (points + roads + zones + structures + fronts) |

#### 🎚️ Réglages live

Deux sliders en bas de la modale, mise à jour temps réel :

| Slider | Plage | Effet |
|---|---|---|
| **Rayon** | 10 - 120 px | Étalement du "blob" autour de chaque point. Petit = précis local, grand = vision macro |
| **Intensité** | 0.2× - 3.0× | Multiplicateur global. Si tout est trop pâle → augmente. Si tout est saturé rouge → baisse |

#### 🏗️ Filtre par niveau M-LVL

Si ton plan est **multi-niveau** (carrière avec plusieurs étages — RDC, sous-sol, mezzanine, etc.), une nouvelle section **"🏗️ Niveaux à inclure"** apparaît dans la modale Heatmap.

- **Chips par niveau** : une pastille cliquable par niveau disponible dans le plan (`Niv -2`, `Niv -1`, `Niv 0`, `Niv 1`...)
- **Pré-sélection** : les niveaux **actuellement visibles** sur la carte sont pré-cochés automatiquement
- **Bouton ⇅ Tout** : (dé)coche tout d'un clic
- **Effet** : la heatmap restreint la collecte aux items qui appartiennent aux niveaux sélectionnés. Pratique pour générer une heatmap dédiée au RDC uniquement (par exemple), ou pour comparer la densité entre 2 étages sans pollution croisée.

> 💡 **Cas d'usage** : tu veux comparer la fréquentation du RDC vs le sous-sol → 2 heatmaps successives avec filtre dédié → screenshot de chaque → tu vois immédiatement l'asymétrie.

> 📌 Si ton plan n'est **pas** multi-niveau, cette section n'apparaît pas du tout.

#### 🎯 Algorithmes (pourquoi c'est pertinent maintenant)

- **Interpolation le long des segments** : pour les tracés / zones / structures polylines / timeline tracker, l'app distribue des points de chaleur **le long du chemin** au lieu d'un seul point par sommet. Résultat : tu vois de vraies **traînées continues**, pas des "perles" espacées.
- **Normalisation par histogramme** : le pixel le plus dense de l'image = rouge pur, le moins dense = bleu pur, gradient lissé entre. **Auto-adaptatif** : pas besoin de régler manuellement les seuils, ça marche aussi bien sur un plan de 20 points que sur un plan de 5000.
- **Filtre timeline tracker** : skip les téléportations (recalages), les starts, et les gaps > 5 min (pause sans bouger ne doit pas générer de chaleur fantôme).

#### 💡 Cas d'usage

- **Identifier les axes principaux** d'une carrière : ce qui ressort rouge = par où tu passes vraiment, vs ce qui ressort bleu = exploré une fois
- **Audit de complétude** : zones bleues = sous-cartographiées → prochain objectif terrain
- **Présentation visuelle** d'une session : screenshot heatmap + commentaire pour partager une vision macro du plan exploré

> ⚠️ La heatmap est **purement visuelle** (overlay canvas). Elle n'altère ni le plan, ni les annotations, ni les exports. Ferme la modale pour la masquer.

### 🪫 Indicateur de batterie

> 🧩 **Fonctionnalité optionnelle** — à activer dans ⚙️ Configuration › 🧩 Fonctionnalités optionnelles.

L'app surveille en temps réel le niveau de batterie du téléphone (quand le navigateur expose cette info) et affiche un indicateur compact à 3 endroits :

| Endroit | Apparence |
|---|---|
| **En-tête** de l'interface (à côté des compteurs session) | Chip compact `⚡ 78%` (en charge, vert) ou `🪫 23%` (en décharge, couleur selon niveau) |
| **Footer** de la modale 📋 Session active | Ligne `🔋 État · 🪫 23% · Discharging` |
| **Bloc 🔋 ÉTAT** du mode urgence 🚨 | Label long `🪫 23% · décharge` |

#### Niveaux et couleurs

| % | Couleur | Comportement |
|---|---|---|
| ≥ 50 % | Vert / neutre | OK |
| 20-49 % | Jaune-orange | Surveille |
| 10-19 % | Orange foncé + toast `🪫 Batterie faible — pense à recharger` (1 fois) |
| 5-9 % | Rouge + toast `🪫 Batterie critique — sortie recommandée` (1 fois) |
| < 5 % | Rouge pulsant + toast `🚨 Batterie critique — moins de 5%` (1 fois) |

Chaque seuil n'envoie son toast **qu'une seule fois** par cycle de décharge (pas de spam si tu oscilles autour de 10 %, 12 %, 9 %, etc.). Le compteur de seuils est reset dès que tu repasses en charge ou que tu remontes au-dessus de 50 %.

#### Compatibilité navigateur

L'app utilise l'**API Battery Status** standard du navigateur. Cette API n'est **plus disponible partout** :

| Navigateur | Support |
|---|---|
| Chrome Android / PC | ✅ Oui |
| Edge Android / PC | ✅ Oui |
| Samsung Internet | ✅ Oui |
| Safari iOS / macOS | ❌ Non (l'API a été retirée pour des raisons de privacy / fingerprinting) |
| Firefox récent | ❌ Non (l'API a été désactivée par défaut) |

> 🪫 **Si l'API n'est pas dispo** sur ton téléphone, la chip batterie est **simplement masquée** — aucun message d'erreur ne s'affiche. C'est normal sur iOS. **Le mode urgence 🚨 ne l'affiche pas non plus** (v1.97.11) : sans capteur il n'y a rien à montrer, et un « ? » à la place d'un niveau de batterie sur l'écran qu'on ouvre quand elle lâche ne rassure personne. Le reste de l'état (tracker, boussole) est intact. Même chose si tu décoches ⚙️ **🔋 Niveau de batterie**.

### 📳 Vibration haptique

Une petite vibration confirme les actions : étape d'itinéraire atteinte, recalage, validation d'une étape, alertes du Mode Secours (équipe en retard, membres manquants).

> 🚨 **Les alertes de survie vibrent toujours**, même option coupée : sortie d'urgence trouvée ou introuvable, alerte critique diffusée. Tout le reste — y compris le Mode Secours — suit ton réglage.

> 📵 **iOS ne donne pas ce capteur aux pages web** : sur iPhone, l'option s'affiche grisée (voir « Capteur refusé » plus haut).

---

## 📊 Statistiques de session

La modale **📋 Session active** (accessible depuis l'en-tête, chip 📊 sur mobile) affiche un bloc de statistiques en tête de modale.

### Ce que tu vois

| Stat | Valeur |
|---|---|
| **Total annotations** | Somme de tous les éléments (points + tracés + zones + structures) |
| **Breakdown par type** | 📍 N points · 🛣️ M tracés · ⬛ K zones · 🏛️ L structures |
| **Distance totale** | Somme des longueurs des tracés (auto m → km au-delà de 1 000 m) |
| **Surface totale** | Somme des aires des zones (auto m² → ha au-delà de 10 000 m²) |
| **Photos POI** | Nombre de photos attachées aux points |
| **Durée session** | Temps écoulé depuis le démarrage de l'app sur ce plan (`HH:MM:SS`) |

En **multi-niveau (M-LVL)**, un breakdown additionnel par niveau s'affiche (ex: `Niveau -1: 12 pts · 3 tracés` / `Niveau 0: 45 pts · 8 tracés`).

### Partager le résumé

2 boutons en bas du bloc stats :

- **📋 Copier** : copie un résumé texte dans le presse-papier (formaté pour Discord, SMS, mail)
- **💾 Export TXT** : télécharge un fichier `.txt` avec le même contenu

Pratique pour faire un point de session avec ton binôme à la sortie, ou pour archiver l'état d'avancement de la cartographie.

---

## 📐 Mesure de distance et ⬛ Mesure de surface

> Tous les boutons de mesure se trouvent dans le groupe **📐 Mesure** de la barre latérale.

### 📐 Mode Distance (par défaut)

1. Appuyez sur **📐** — le mode mesure s'active (bouton vert)
2. Cliquez sur le plan pour poser des points
3. La distance totale s'affiche en bas à gauche, en mètres (`📐 Distance: X m`)

### ⬛ Mode Surface

1. Dans le groupe **📐 Mesure**, appuyez sur le toggle **📏/⬛** pour basculer en mode surface
2. Cliquez sur le plan pour dessiner un **polygone** (au moins 3 points)
3. L'aire s'affiche en bas à gauche, en m² (`⬛ Surface: X m²`)
4. Au-delà de 10 000 m², l'app affiche automatiquement en hectares (ha)

> **Comment ça marche** : l'app convertit la surface en m² via l'échelle calibrée du plan. La précision dépend donc de la calibration initiale du plan (`📏 ÉCHELLE` dans ⚙️ Réglages).

### ❌ Effacer la mesure

Appuyez sur **❌**. Une fenêtre s'ouvre avec deux options :

| Option | Effet |
|---|---|
| **↩️ Dernier point** | Annule uniquement le dernier point cliqué (idéal en cas d'erreur de clic) |
| **🗑️ Toute la mesure** | Efface tous les points et remet la distance/surface à zéro |
| Annuler | Ferme la fenêtre sans rien supprimer |

> Tu peux retirer plusieurs points un par un en cliquant successivement **❌ → ↩️ Dernier point**.

> 💾 Le mode (distance/surface) et les points sont persistés dans la sauvegarde session — au reload ou import session, ta mesure en cours est restaurée à l'identique.

---

## ✏️ Ajouter des points

> Le bouton **✏️ Édition** de la barre latérale est un **clic direct** : 1 clic = toggle ON/OFF du mode ajout. En ON (icône surlignée), chaque clic sur la carte pose un nouveau point.
>
> Pour **supprimer un point** : clic sur le marker → popup → bouton **🗑️ Supprimer ce point**. Pour annuler : <code>Ctrl+Z</code>.

1. Appuyez sur **✏️** — le mode ajout s'active (bouton vert)
2. Cliquez sur le plan à l'emplacement souhaité
3. Une fenêtre s'ouvre. Renseignez :
   - **Nom** (obligatoire)
   - **Type** : choisissez parmi les tags existants, **— Aucun tag —** (icône par défaut), ou **➕ Créer un nouveau tag…**
   - **Description** (optionnel)
4. Validez avec **✅ Ajouter**

### 🎨 Types d'icônes disponibles

L'application propose un set d'icônes par défaut, regroupées par catégorie :

| Catégorie | Types disponibles |
|---|---|
| 🕳️ **Puits** | Aération, Bouché, Comblé, Au sol / Bassin, Extraction |
| 🪜 **Accès** | Puits à échelon (ouvert / fermé), Escalier service (ouvert / fermé), Cavage (ouvert / fermé) |
| ⚠️ **Signalétique** | Salle, Chatière, Passage, Danger, Information, Électricité, Épure, Véhicule |

> 💡 Les icônes **Accès** suivent un code couleur intuitif : **vert = ouvert**, **rouge = fermé**. Pratique pour repérer en un coup d'œil les passages utilisables.

### 🏷️ Créer un nouveau tag

Si le type que vous voulez n'existe pas encore, sélectionnez **➕ Créer un nouveau tag…**. Saisissez un nom court (lettres, chiffres, underscore ou tiret uniquement) — par exemple `fontaine`, `arche` ou `ruine_2`.

Le nouveau tag est ajouté à votre session et utilisera l'icône par défaut. Pour personnaliser son icône définitivement, modifiez le plan via **🏗️ Créer / Modifier plan**.

### 🗑️ Effacer les points

La suppression se fait **directement sur le point**, pas depuis la barre d'outils : clic sur le marker → popup → **🗑️ Supprimer ce point**.

| Ce que tu veux | Comment |
|---|---|
| Retirer **un** point | Clic sur le marker → **🗑️ Supprimer ce point** |
| Annuler la suppression | `Ctrl+Z` (ou ↩️ dans la barre) |
| **Tout** effacer | ⚙️ **Effacer la session** — remet le plan à zéro (points, tracés, zones, structures) |

> ℹ️ Le bouton 🗑️ n'apparaît que sur **tes** points. Ceux qui viennent du plan lui-même ou d'un calque de données sont en lecture seule : pour en retirer un, ouvre d'abord son calque à la modification depuis 🔍 **Filtres**, puis exporte le calque corrigé.

> 💡 Il n'y a **pas** de bouton 🗑️ à côté de ✏️ : le groupe Édition est un simple interrupteur (mode ajout ON/OFF).

### ✏️ Modifier un point existant

Cliquez sur un marker que vous avez ajouté → la popup affiche le bouton **✏️ Modifier** (bleu). Il ouvre la même fenêtre que pour l'ajout, **pré-remplie** avec le nom, le type, la description et les photos déjà attachées (si applicable).

Tu peux changer ce que tu veux puis **💾 Enregistrer**. Si tu renommes le point ET qu'il a des photos, les photos suivent automatiquement (migration interne transparente).

### 📌 Repositionner un point mal posé

Tu as posé un point à peu près au bon endroit, et tu veux le recaler ? Clic sur le marker → popup → **📌 Repositionner**.

La popup se ferme et un bandeau apparaît en haut : **« Clique la nouvelle position de … »**. Le prochain clic sur la carte y déplace le point. Un bouton **Annuler** est là si tu changes d'avis, et rien ne bouge tant que tu n'as pas cliqué.

Ce que le point **garde** : son nom, son type, sa description, ses photos, son niveau (il ne change pas d'étage), et son appartenance à un calque si tu l'as ouvert à la modification. Seule sa position change.

Le déplacement est **annulable** par ↩️ comme n'importe quelle autre action.

> ℹ️ Le bouton n'apparaît que sur **tes** points (ceux de ta session). Un point qui vient d'un calque de données est en lecture seule — pour le repositionner, ouvre d'abord son calque à la modification depuis 🔍 Filtres.

### 📸 Photos attachées aux points

Tu peux attacher jusqu'à **5 photos par point** (limite anti-saturation stockage navigateur). 100 % local — aucune photo n'est envoyée sur Internet.

**Au moment de l'ajout ou de la modification** d'un point, la section **📸 Photos (N/5)** propose 2 boutons :

| Bouton | Effet |
|---|---|
| **📷 Prendre photo** | Ouvre directement la caméra (sur mobile) pour shooter une nouvelle photo |
| **🖼️ Depuis la galerie** | Ouvre le sélecteur de fichiers (mobile et PC), tu peux choisir plusieurs photos d'un coup |

**Compression auto** : les photos sont compressées avant stockage (1920 px côté long max, qualité JPEG 85 %). Une photo brute de 5-10 Mo passe à ~200-500 Ko. Pour 5 photos = ~2 Mo par point.

**🔒 Métadonnées nettoyées** : **toute** photo est ré-encodée à l'ajout, même déjà petite — les métadonnées cachées du fichier (**EXIF : position GPS de la prise de vue, date, modèle d'appareil**) sont systématiquement supprimées. Rien de tout ça n'entre dans l'app ni ne sort dans un export. Les petites photos sont ré-encodées sans redimensionnement à qualité haute (dégradation invisible).

**🛡️ Export anonymisé + photos** : dans 💾 Enregistrer session → 📦 Full, la case « 🛡️ Anonymiser pour partage public » accepte maintenant les photos : chacune est **ré-encodée sans métadonnées** (y compris les photos ajoutées avant l'arrivée de cette protection) et **renommée** (`photo-anon-1`, `photo-anon-2`…), rattachée aux codes anonymisés des points (`📍 POI salle #1`…). Une photo qui ne peut pas être ré-encodée est **exclue** de l'export — jamais embarquée telle quelle. La note libre et le PDF Histoire restent exclus de l'export anonymisé.

**Retirer une photo** : clic sur la croix ✕ rouge en haut à droite de la miniature → elle apparaît grisée avec hachures rouges (marquée à supprimer). Si tu changes d'avis, clic sur la flèche verte ↺ pour annuler. La vraie suppression n'a lieu qu'au moment où tu **💾 Enregistres**.

**Si tu annules** la fenêtre d'édition au lieu de sauvegarder, **les photos que tu venais d'ajouter sont effacées** (cleanup auto). Les marquages à supprimer sont au contraire **annulés** — la photo reste.

**Visualisation** :

1. Dans la **popup** du marker (clic carte) : une rangée de miniatures 44×44 apparaît, avec le compteur "📸 N photos". Tap sur une miniature → ouvre le **viewer plein écran**.
2. Dans le **viewer plein écran** :
   - **Mobile** : pince à 2 doigts pour zoomer (1× à 4×), glisser pour déplacer, swipe horizontal pour passer à la photo précédente / suivante
   - **PC** : molette pour zoomer, drag souris pour déplacer, flèches `← →` ou boutons `◂ ▸` overlay pour naviguer, `Échap` pour fermer
3. Dans l'app : un compteur **📸 N** s'affiche dans la barre du haut (avec les autres compteurs 📍 / 🛣 / ⬛ / 🏛️). Clic dessus → modale "📊 Détails de la session" avec breakdown par point.

**Partage / sauvegarde** : les photos sont **incluses** dans :
- 💾 Enregistrer session → onglet 📦 Full / 🎨 Avancé / 🔄 Conversion → cocher "📸 Inclure les photos"
- Re-import session ZIP → photos automatiquement restaurées
- 📦 Générateur ZIP plan (mode Modifier) → option "📸 Inclure les photos attachées"
- À la création d'un nouveau plan via le générateur, bouton "📦 Importer un datalayer ZIP en un clic" → tu peux récupérer les points + photos exportés depuis un autre plan

**Limites techniques** :
- Stockage local du navigateur — quota ~50-200 Mo selon le device. Un toast d'avertissement t'avertit si tu approches du quota
- Sur **iOS Safari standalone PWA**, le navigateur peut purger l'IDB en cas de manque d'espace ou de désinstall — exporte régulièrement tes plans + photos pour les sécuriser
- En cas de reset complet de l'app (💥 Tout réinitialiser), **toutes les photos sont effacées** (cohérent avec le wipe complet)

---

## 🛣️ Tracer des routes

> Tous les boutons de tracé se trouvent dans le groupe **🛣️ Tracés** de la barre latérale.

- **🟩 Route principale** — vert vif
- **🟪 Route secondaire** — violet
- **🟨 Chemin** — jaune
- **🪜 Jonction interniveau** — magenta pointillé (avec des ronds blancs aux extrémités). **Apparaît uniquement si le plan est en mode multi-niveau** — sert à relier deux étages (escalier, pente raide, puits interne). Voir la section **🏗️ Mode multi-niveau** plus bas pour les détails.

Pour tracer : appuyez sur le bouton correspondant → cliquez sur le plan pour poser des points → appuyez à nouveau pour arrêter.

### 📏 Distance totale des tracés

Le bouton **📏 Distance totale** dans le groupe **🛣️ Tracés** ouvre une fenêtre qui calcule la **somme des longueurs** de tous vos tracés visibles, avec un filtre par type.

**Comment ça marche :**

1. Appuyez sur **📏** — la fenêtre s'ouvre avec 3 cases cochées (Principal, Secondaire, Chemin)
2. Décochez les types que vous voulez exclure du calcul
3. Le **total en mètres** se met à jour instantanément, et les tracés inclus sont **surlignés en magenta** sur la carte (halo lumineux pour bien les voir)
4. Pour chaque type, la fenêtre affiche le **nombre de tracés** et leur **longueur cumulée**
5. Deux options de sortie :
   - **✓ Fermer (garder le surlignage)** — la fenêtre se ferme mais le **surlignage magenta reste affiché** sur la carte. Vous pouvez explorer la carte avec les tronçons toujours visibles, et re-cliquer **📏** pour rouvrir la fenêtre (les filtres précédents sont conservés).
   - **❌ Effacer le surlignage** — retire le halo magenta de la carte ET ferme la fenêtre.

> 💡 Le calcul inclut **toutes** les routes visibles : celles que vous avez tracées dans la session ET celles présentes dans les **calques de données** activés. Si vous masquez un calque dans le contrôle des couches, ses routes sortent automatiquement du calcul.
>
> ℹ️ Cette mesure est **uniquement à l'écran** — elle n'apparaît pas dans la légende de l'export image PNG.

### 🧹 Effacer un tracé

Appuyez sur **🧹**. Une fenêtre s'ouvre avec trois options :

| Option | Effet |
|---|---|
| **↩️ Dernier point du tracé** | Annule uniquement le dernier point cliqué sur le tracé en cours (idéal pour corriger un point mal placé) |
| **✂️ Dernier tracé entier** | Supprime le dernier tracé complet (utile si tu veux refaire un tracé sans toucher aux précédents) |
| **🗑️ Tous les tracés** | Efface absolument tous les tracés (irréversible) |
| Annuler | Ferme la fenêtre sans rien supprimer |

> Exemple d'usage : tu traces une route principale, tu te trompes sur le dernier virage. Clique **🧹 → ↩️ Dernier point du tracé** pour reculer d'un point, puis continue ton tracé normalement.

> 💡 **Jonctions interniveau (mode multi-niveau)** : les jonctions 🪜 sont traitées comme des tracés normaux par 🧹. **Dernier tracé entier** supprime la dernière jonction si elle est la plus récente ; **Tous les tracés** efface routes ET jonctions ; **Sélection au clic** fonctionne aussi sur une jonction.

---

## ⬛ Tracer des zones

> Tous les boutons de zones se trouvent dans le groupe **⬛ Zones** de la barre latérale.

Permet de dessiner des **surfaces fermées** pour annoter des espaces particuliers du plan : remblais, zones effondrées, plans d'eau, ou zones inaccessibles qui bloquent le calcul d'itinéraire.

| Type | Icône | Couleur | Effet pathfinder |
|---|---|---|---|
| **Remblais** | ⬛ | Gris foncé | Aucun |
| **Effondrement** | 🟥 | Rouge | Aucun |
| **Eau** | 🟦 | Bleu | Aucun |
| **Inaccessible** | ⛔ | Hachures rouge sombre / noir | 🚫 **BLOQUE** — l'itinéraire ne passera jamais par cette zone |

### ✏️ Comment tracer une zone

1. Appuyez sur l'icône du type voulu (⬛, 🟥, 🟦 ou ⛔) — le mode s'active
2. Cliquez sur le plan pour poser les points (au moins 3)
3. Pour fermer la zone, **deux options** :
   - **Re-cliquer sur le premier point** (un cercle apparaît dessus dès que 3 points sont posés)
   - **Appuyer sur ✅** — ferme la zone à l'endroit du dernier point
4. La zone se remplit automatiquement avec sa couleur

> Pendant le tracé, les segments apparaissent en pointillé. Une fois fermée, la zone devient pleine.

### ⛔ Zone "Inaccessible" — bloque l'itinéraire

Trace une zone de type **⛔ Inaccessible** sur une partie du plan que tu veux **interdire au pathfinder** (effondrement récent qui rend le passage dangereux, eau profonde, passage non balisé, etc.).

**Effet** : tout itinéraire calculé qui aurait traversé cette zone passera désormais par un autre chemin. Si aucun autre chemin n'existe, le calcul échoue avec un message clair.

C'est une **contrainte dure par défaut**, mais tu peux la relâcher : la case « Respecter les zones inaccessibles » de la modale Itinéraire est cochée d'origine ; la décocher laisse le trajet les traverser. ⚠️ Le **Mode Secours** et le mode « Perdu » les respectent en toutes circonstances — une préférence de confort n'élargit pas un périmètre de secours. Si tu veux une contrainte **souple** (éviter si possible, sinon passer quand même avec un message), utilise plutôt les **🚫 Préférences d'évitement** dans la modale itinéraire (voir section dédiée plus bas).

**Multi-niveau** : la zone ⛔ bloque uniquement les segments du **même niveau** (cohérent avec le filtre niveau). Une zone inaccessible au Niv 0 n'affecte pas l'itinéraire au Niv -1.

**Indépendant du toggle calque** : même si tu décoches le calque zones dans le contrôle des couches, la zone reste prise en compte par le pathfinder.

### 🧱 Ordre d'affichage

Les zones se superposent dans cet ordre, indépendamment de l'ordre de tracé :

1. **Eau** (en arrière-plan)
2. **Remblais** (au-dessus de l'eau)
3. **Effondrement** (au-dessus)
4. **Inaccessible** (au-dessus de tout — pour bien voir les zones bloquantes)

Cela permet par exemple de tracer un effondrement par-dessus un remblais sans qu'il soit masqué.

### 🧹 Effacer une zone

Appuyez sur **🧹**. Une fenêtre s'ouvre avec ces options :

| Option | Effet |
|---|---|
| **↩️ Annuler le dernier point** | Sur la zone en cours, ou sur la dernière zone fermée |
| **✂️ Dernière zone (en cours OU fermée)** | Supprime la zone que tu es en train de dessiner si elle existe, sinon la dernière fermée |
| **🎯 Sélectionner une zone à supprimer** | Active un mode où tu cliques sur une zone de la carte pour la supprimer |
| **🗑️ Toutes les zones** | Efface absolument tout (irréversible) |

---

## 🏛️ Structures (piliers, murs, fronts de taille)

Spécifique aux **carrières souterraines** : les structures permettent de cartographier les éléments physiques porteurs (piliers de soutènement, murs) et l'avancement du front d'exploitation (fronts de taille). Indépendant des tracés et des zones — c'est une 4ème couche d'annotation.

> Tous les boutons sont dans le groupe **🏛️ Structures** de la barre latérale.

### 5 sous-types disponibles

| Type | Icône | Forme | Couleur | Usage typique |
|---|---|---|---|---|
| 🟡 **Pilier 1ère masse** | polygone | jaune | Pilier porteur du niveau supérieur (calcaire 1ère masse) |
| 🟠 **Pilier 2e masse** | polygone | orange | Pilier du niveau inférieur (calcaire 2e masse). En mode multi-niveau, auto-taggé au niveau -1 |
| 🔵 **Mur** | polygone | bleu | Mur de pierre sèche, parpaing, soutènement maçonné |
| 🟨 **Front de taille 1ère masse** | polyligne | jaune (trait) | Front d'exploitation niveau supérieur — c'est une LIGNE, pas un polygone fermé |
| 🟧 **Front de taille 2e masse** | polyligne | orange (trait) | Front d'exploitation niveau inférieur. En mode multi-niveau, auto-taggé au niveau -1 |

### Dessiner une structure

1. Clique le sous-type souhaité (🟡 / 🟠 / 🔵 / 🟧 / 🟨) — il devient actif (allumé)
2. Clique successivement sur la carte pour ajouter les points
3. **Piliers + Murs (polygones)** : minimum 3 points. Pour terminer, re-clique sur l'icône allumée → ferme automatiquement le polygone (relie le dernier point au premier)
4. **Fronts de taille (polylignes)** : minimum 2 points. Pour terminer, re-clique sur l'icône allumée → valide la ligne sans la fermer

Pendant le dessin, l'aperçu se met à jour en temps réel. La couleur et la transparence sont fixes par type.

### 🧹 Effacer les structures

Appuyez sur **🧹** dans le groupe Structures :

| Option | Effet |
|---|---|
| **↩️ Annuler le dernier point** | Sur la structure en cours, ou sur la dernière structure |
| **✂️ Dernière structure (en cours OU fermée)** | Supprime celle en train d'être dessinée si présente, sinon la dernière validée |
| **🎯 Sélectionner une structure à supprimer** | Mode clic carte — sélectionne celle à effacer en cliquant dessus ou près de son bord |
| **🗑️ Toutes les structures** | Efface absolument tout (irréversible) |

> 💡 Le mode "🎯 Sélectionner" est pratique pour effacer une structure précise au milieu d'un plan riche, sans avoir à compter le "dernier ajouté".

### Différence avec les zones

| | Zones (⬛) | Structures (🏛️) |
|---|---|---|
| Forme | Polygone fermé uniquement | Polygone OU polyligne selon le type |
| Couleurs | Eau / Remblais / Effondrement / Inaccessible | Pilier 1/2 / Mur / Front 1/2 |
| Effet pathfinder | ⛔ Inaccessible **bloque** l'itinéraire | Aucun (lecture seule) |
| Usage typique | Délimiter des zones de terrain (eau stagnante, etc.) | Cartographier l'architecture souterraine (piliers, murs, avancement) |

> 🏗️ **Mode multi-niveau** : les Piliers 2e masse et Fronts de taille 2e masse sont **automatiquement taggés au niveau -1** à leur création (l'app considère que la 2e masse est en dessous). Les autres types prennent le niveau actif courant. Tu peux modifier les niveaux a posteriori via l'éditeur JSON.

---

## 🫧 La bulle d'un objet — note, conversion, suppression

Un clic sur **un tracé, une zone ou une structure que tu as dessinés** ouvre une petite bulle. Elle vaut pour les trois familles, avec le même contenu.

| Élément | À quoi ça sert |
|---|---|
| **Zone de texte** | Une note libre, sur plusieurs lignes si tu veux — l'état du passage, une observation, un rappel |
| **💾 Sauver la note** | Enregistre la note. La bulle se referme toute seule |
| **🔄 Convertir** | Change le **type** de l'objet, et au besoin sa **famille** |
| **🗑️ Supprimer** | Retire l'objet. En rouge, sur sa propre ligne |

### 📍 La bulle d'un point

Un tap sur un **marqueur** (un point du plan ou un point que tu as ajouté) ouvre sa bulle : nom, type, note, et une rangée de boutons.

| Bouton | À quoi ça sert |
|---|---|
| **📍 Je suis ici** | Recale le suivi sur ce point. C'est aussi ce qui **confirme ta position** : ensuite, 🚨 Sortie d'urgence et 🧭 Y aller partent de là sans rien demander |
| **🧭 Y aller** | Calcule un itinéraire depuis ta position jusqu'à ce point |
| **➕ Itinéraire** | Ajoute le point comme étape d'un itinéraire (en cours ou à créer) |
| **☆ Favori** | Ajoute ou retire le point de ⭐ Favoris |
| **🔊 Lire la note** | Lit la note à voix haute (synthèse vocale locale) |
| **📋 GPS** | Coordonnées GPS copiables, si le plan est géoréférencé |
| **📸 Miniatures** | Les photos attachées, tap = plein écran |
| **🌀 Liaisons** | Les liaisons inter-plan qui partent de ce point |

Sur **tes propres points** (ceux de ta session) s'ajoutent **✏️ Modifier**, **📌 Repositionner** (tape ensuite la nouvelle position sur la carte) et, sur sa propre ligne rouge, **🗑️ Supprimer** — annulable avec ⏪.

### 🔄 Convertir — changer un objet de type, ou de famille

Le cas typique : sur un relevé importé du SIG, un **front de taille** est en fait une **galerie**. Tant qu'il reste une structure, il n'entre pas dans le calcul d'itinéraire — le calculateur ne lit que les tracés. Le convertir en tracé le fait entrer dans le graphe.

La fenêtre ne propose que des cibles **compatibles avec la forme** de l'objet : une **ligne** (tracé, front de taille) ne peut devenir qu'une autre ligne, une **surface fermée** (zone, pilier, mur) qu'une autre surface fermée. On ne peut pas transformer un trait en polygone : il n'y a rien pour le refermer.

L'objet garde tout le reste — sa géométrie, son niveau, sa note.

### 🏁 Ta distance quand le podomètre n'a rien vu

Téléphone en poche, le podomètre ne compte presque rien. Mais chaque **📍 Je suis ici** que tu poses sur un point du plan laisse un **repère daté**. L'app relie ces repères **en suivant tes galeries** — le même calcul que pour un itinéraire — et en tire la distance réellement parcourue entre eux.

Concrètement : repère à 12 h, repère à 12 h 30, repère à 13 h → l'app calcule A→B→C dans les galeries, pas à vol d'oiseau.

#### 🏁 Le dernier trajet, celui qu'on oubliait

Un tronçon n'est calculé qu'au moment où le repère **suivant** arrive. Donc tout ce que tu marches **après ton dernier repère** n'était compté par personne.

Quand tu appuies sur **🏁 Clôturer ma sortie**, l'app te demande **où tu es ressorti**. Un clic sur la carte, et le dernier trajet entre dans le total. Tu peux **Passer** si tu clôtures depuis chez toi.

#### Ce que la fiche te dit du chiffre

| Ce qui est écrit | Ce que ça veut dire |
|---|---|
| *dont 900 m calculés dans les galeries entre 6 repères* | Le trajet a été reconstitué sur tes tracés — c'est fiable |
| *dont 900 m à vol d'oiseau entre 6 repères (non affinés)* | Ligne droite entre les repères — **sous-estimé**, parfois de beaucoup |

> ⚠️ **Ce que ce calcul ne sait pas faire** : il prend le chemin **le plus court** entre deux repères, pas forcément le tien. Allers-retours, culs-de-sac explorés, hésitations — tout ça est sous-estimé. Et sans aucun « Je suis ici », il n'y a rien à relier : la distance restera celle du podomètre.

### ⏱️ La durée d'une sortie

Une sortie **terrain** est comptée **du départ à la fin**, pas au temps où l'app était ouverte. C'est ce que tu veux dire quand tu dis « on est restés 3 h » : le téléphone rangé dans la poche compte, l'app mise en veille aussi.

La fiche te donne aussi le **temps où l'app était ouverte**, juste en dessous. Ce n'est pas un doublon : il dit ce que vaut la mesure. *3 h de sortie pour 12 min d'app*, c'est un podomètre qui n'a presque rien vu — la distance affichée est donc à prendre avec des pincettes.

> ℹ️ Une session de **travail sur plan** garde le temps d'usage : on laisse un plan ouvert toute une soirée sans le regarder, la durée réelle n'y voudrait rien dire.

#### ✏️ Corriger une fin oubliée

Si tu n'as pas cliqué sur **🏁 Clôturer ma sortie** en ressortant, l'app ne sait pas quand tu es sorti : elle prend le dernier moment où elle était vivante — souvent celui où le téléphone l'a mise en veille. La durée est alors sous-évaluée.

Ouvre la fiche de la sortie → **✏️ Corriger la fin**, et saisis l'heure réelle. La durée est recalculée aussitôt.

> ℹ️ Le **temps d'app ouverte** n'est jamais modifié : c'est une mesure, pas une déclaration. Et une fin antérieure au départ est refusée.

### 🔁 Une sortie coupée en plusieurs — reprise et fusion

Si tu quittes MyKTAMap pendant une sortie — changer de musique, prendre un appel — le téléphone peut **décharger l'app** pour libérer de la mémoire. Auparavant, revenir dessus démarrait une **nouvelle** sortie : une seule vraie sortie ressortait en deux ou trois au carnet, chacune avec un bout des compteurs.

**Maintenant elle reprend toute seule.** Au retour, si la sortie précédente sur le même plan a été interrompue de cette façon il y a moins de **45 minutes**, l'app la **continue** au lieu d'en ouvrir une autre. Un message te le dit.

**Et si tu ouvres un autre plan en route** — pour le montrer à quelqu'un, vérifier un passage — ta sortie est **mise en pause**, pas terminée. Reviens sur le plan de ta sortie dans les **2 heures** : elle **reprend** là où elle en était, compteurs et tracé compris. Au-delà, elle est rangée au carnet comme d'habitude. Pour une sortie de terrain, le temps passé sur l'autre plan **compte** dans sa durée (mesurée du départ à la fin) : tu étais toujours sous terre. ⚠️ Le **suivi**, lui, s'arrête quand tu changes de plan : à la reprise d'une sortie de terrain, l'app te propose **« ▶️ Relancer le suivi »** — un toucher suffit.

> ℹ️ Une sortie que tu as **clôturée toi-même** (🏁) n'est jamais recollée. L'app ne reprend que ce qui a été coupé *malgré toi*.

#### 🔗 Recoller des sorties déjà coupées

Pour celles d'avant, ou si le délai a été dépassé : 📔 **Mon carnet** → **🔗 Fusionner des sorties** → coche celles à réunir (au moins 2) → **Fusionner**.

| Ce qui est réuni | Comment |
|---|---|
| Durée, distance, pas, ajouts | Additionnés |
| Durée totale | Du **début de la première à la fin de la dernière**, trous compris |
| Notes | Empilées, séparées par un trait |
| Photos, tracés, niveaux | Réunis |
| Terrain / bureau | Si **un seul** morceau était du terrain, l'ensemble l'est |

> ⚠️ **Irréversible** : les sorties d'origine disparaissent du carnet. L'app demande confirmation — c'est le seul geste du carnet qui efface quelque chose.

### 🪟 Où s'ouvrent les panneaux d'outils

Les panneaux **Tracés**, **Zones** et **Structures** s'ouvrent **centrés à l'écran**, comme le Tracker et les Filtres.

> 🐛 **Pourquoi ça a changé** — ils étaient collés au haut de leur bouton. Plus leur liste s'allonge — un plan importé ajoute un type par niveau —, plus ils descendaient, jusqu'à passer sous le bas de l'écran sur téléphone : les derniers boutons devenaient inatteignables.

Si tu préfères l'ancien affichage, coche **🪟 Ancrer les panneaux d'outils au bouton** dans ⚙️ **Configuration** (page d'accueil). C'est confortable sur grand écran, où la place ne manque pas — déconseillé sur téléphone.

### 🎯 Convertir plusieurs objets d'un coup

Sur un relevé importé, il est fréquent d'avoir **des dizaines** d'objets mal typés — tous les fronts de taille d'un niveau qui sont en fait des galeries, par exemple. Les reprendre un par un serait interminable.

Dans la fenêtre de conversion, clique **🎯 Sélectionner plusieurs objets à convertir**. La fenêtre s'efface et un bandeau apparaît :

| Geste | Effet |
|---|---|
| **Clic sur un objet** | L'ajoute à la sélection (elle s'affiche en bleu pointillé) |
| **Re-clic sur un objet sélectionné** | Le retire — pour corriger une erreur de visée sans tout recommencer |
| **➕ Tous les « type » du niveau affiché** | Étend la sélection à **tous** les objets du même type que le dernier ajouté |
| **✅ Convertir (N)** | Rouvre la fenêtre de choix, avec le lot |
| **Annuler** | Abandonne la sélection |

**⛔ On ne mélange pas les lignes et les surfaces fermées.** Si ta sélection est faite de **lignes** (tracés, fronts de taille), cliquer une **zone** ou un **pilier** est refusé — et le bandeau te dit pourquoi. C'est la même règle que pour une conversion simple : il n'existe aucune cible commune, on ne referme pas un trait.

En revanche **tu peux mélanger les familles** tant que la forme est la même : des fronts de taille (structures) et des chemins (tracés) sont tous deux des lignes, tu peux les convertir ensemble en galeries.

Les objets qui sont **déjà** du type choisi sont simplement laissés tels quels — le message de fin te dit combien ont été convertis et combien étaient déjà bons.

> 💡 Tout le lot s'annule d'un **seul** `Ctrl+Z`. Ce n'est pas N conversions, c'est une seule.

### 🗑️ Supprimer

**Pas de fenêtre de confirmation** : c'est `Ctrl+Z` qui rattrape, comme pour un point, et le message qui s'affiche te le rappelle. Le bouton est **rouge et sur sa propre ligne**, à l'écart du « Sauver », pour qu'on ne le clique pas par mégarde.

> ℹ️ Ces trois actions ne s'affichent que sur **tes** objets. Un objet qui vient d'un calque de données ouvre une bulle en **lecture seule** : pour le corriger ou le supprimer, ouvre d'abord son calque à la modification depuis 🔍 **Filtres**, puis exporte le calque corrigé.

## 🏗️ Mode multi-niveau (carrières multi-étages)

Certaines carrières / galeries ont **plusieurs niveaux empilés physiquement** (Glacière, Capucins, sites avec étages). Le mode multi-niveau permet de gérer ces plans correctement : chaque tracé/zone/point appartient à un niveau, et le pathfinder ne traverse pas magiquement d'un niveau à l'autre par les croisements visuels 2D.

> 📚 **Cohérence visuelle des niveaux** : quand le mode multi-niveau est activé, les tracés sont automatiquement empilés selon leur niveau — une galerie au Niveau 0 apparaît toujours **AU-DESSUS** d'une galerie au Niveau -1, et celle au Niveau +1 au-dessus du Niveau 0. Au sein du même niveau : Chemin (en arrière) < Secondaire < Principal (au-dessus). L'itinéraire calculé et les zones inaccessibles ⛔ passent toujours au-dessus de tout pour rester visibles.

> ⚠️ **Mode optionnel** — désactivé par défaut. La plupart des carrières sont mono-niveau, le mode classique suffit. Active-le **uniquement** pour les vraies carrières multi-étages.

### Activer le mode pour un plan

**2 façons** :

1. **À la création/modification d'un plan** (via 📦 Créer un plan ou ✏️ Modifier un plan existant) : coche la case **🏗️ Plan multi-niveau (avancé)** dans la section "Informations du plan". Le ZIP généré contient le flag → à l'import, le mode s'active automatiquement.

2. **Manuellement dans plan-config.json** : ajoute `"multiLevel": true` dans la section `plan`, sauvegarde, recharge le plan.

> 🔧 **Activation par le générateur** : pour activer le mode multi-niveau sur un plan existant, **passe par le générateur** : 🏗️ Modifier un plan existant → coche **🏗️ Plan multi-niveau** → 📦 Génère le ZIP mis à jour → recharge-le. Ça force une déclaration explicite et évite les incohérences entre état runtime et `plan-config.json`.

> 💡 Si tu veux désactiver le mode multi-niveau d'un plan, passe aussi par le générateur (décoche la case et re-génère). Les tracés existants gardent leur info de niveau dans le JSON (cachée si la feature est OFF) — réactiver plus tard sans rien perdre.

### La pastille "Niveau actif"

Quand le mode est activé, une **pastille jaune** affichant le chiffre du niveau actif (`0` au démarrage, par exemple `[0]`) apparaît **sous les boutons de zoom Leaflet** (haut-gauche de la carte, juste en-dessous des `+` `-`). Clique dessus pour ouvrir la **modale Niveaux**.

> 💡 Si tu actives plus tard le widget 🧭 Boussole alors que le mode multi-niveau est actif, la boussole se positionne automatiquement **en-dessous de la pastille** pour ne pas se chevaucher.

### La modale Niveaux

Deux sections :

#### 🎯 Niveau actif (pour dessiner)

Boutons radio `[ − ] [-2] [-1] [0] [1] [2] [ + ]` (5 niveaux par défaut, symétriques autour de 0). Le niveau cliqué devient le **niveau actif** : tous les nouveaux tracés, zones, points éditeur que tu vas dessiner seront tagués avec ce niveau.

**Convention numérique** :
- **`0`** = niveau de référence (= les éléments sans niveau taggué — typiquement les plans créés avant l'arrivée du multi-niveau). C'est ton RDC / la galerie principale.
- **`1, 2, 3...`** = étages supérieurs / niveaux au-dessus du RDC
- **`-1, -2, -3...`** = sous-sols / niveaux en-dessous du RDC

⚠️ **Changer de niveau actif annule tout tracé en cours** (si tu avais commencé une route principale au Niv 0 et tu switches sur Niv -1, le tracé en cours disparaît). C'est exprès pour éviter qu'un tracé soit à cheval sur 2 niveaux.

⚠️ **Reset visibles** : changer de niveau actif coche **uniquement ce niveau** dans la section "Niveaux visibles" en dessous (mode focalisé par défaut).

**2 boutons d'extension** :
- **[ + ]** (à droite) : ajoute un niveau supérieur (max + 1). Utile pour des étages au-dessus.
- **[ − ]** (à gauche) : ajoute un niveau inférieur (min − 1). Utile pour des sous-sols additionnels.

💡 **Auto-extension** : si tu charges un plan dont les data layers contiennent déjà des éléments à des niveaux hors du range par défaut (ex : un puits taggué `level: 4`), l'app étend automatiquement la liste des niveaux disponibles pour que tu puisses les sélectionner/filtrer.

#### 👁️ Niveaux visibles (filtre)

Checkboxes par niveau. Les tracés/zones/points de niveaux **non cochés** sont cachés sur la carte (opacity 0). Les jonctions interniveau restent visibles si **au moins un** de leurs endpoints touche un niveau coché.

**🏗️ Le plan principal EST le niveau 0** : décocher le niveau **0** masque aussi **l'image principale du plan** (tuiles comprises) — tu peux enfin regarder un étage seul (ex. uniquement le calque du niveau -1 transparent), sans le fond du niveau 0 qui pollue la superposition. Re-coche 0 et il revient. Sans mode multi-niveau, le plan principal n'est jamais masqué.

**🫥 Transparence des calques de niveau** : pour que la superposition ait un sens, chaque calque de niveau (≠ 0) doit être un **PNG avec fond transparent**. Le générateur t'avertit désormais à la génération si un calque de niveau est opaque (JPEG, ou PNG au fond aplati) — il masquerait tout ce qui est en dessous.

Boutons rapides :
- **Tous** : coche tous les niveaux disponibles
- **Actif seul** : coche uniquement le niveau actif

### 🪜 Tracer une jonction interniveau

Pour relier deux niveaux physiquement (escalier, pente raide, puits interne, échelle entre étages), tu utilises la sous-action **🪜 Jonction interniveau** dans le groupe **🛣️ Tracés**.

> ⚠️ **Visibilité conditionnelle** : le bouton 🪜 n'apparaît **que si le mode multi-niveau est activé** sur le plan courant. Si tu ne le vois pas, vérifie d'abord que la pastille jaune `[N]` est bien visible en haut-gauche.

**Procédure pas-à-pas** :

1. Ouvre le groupe accordéon **🛣️ Tracés** dans la barre latérale.
2. Clique sur la sous-action **🪜 Jonction interniveau**.
3. Une **modale s'ouvre** avec 2 sélecteurs : `Niveau de départ` et `Niveau d'arrivée`. Par défaut, "départ" = ton niveau actif. Choisis le second niveau, puis clique **OK**.
4. Le mode tracé démarre. **Clique sur la carte** pour poser autant de points que tu veux (comme une polyline normale). Tu peux suivre la forme exacte de l'escalier ou tracer une simple diagonale.
5. **Appuie à nouveau sur 🪜** pour valider et sortir du mode tracé.
6. La jonction apparaît en **magenta pointillé** avec un **rond blanc+magenta** à chacune des 2 extrémités.

**Sémantique des 2 niveaux** : *départ* et *arrivée* sont **symétriques** côté pathfinder — peu importe lequel tu mets en premier, l'itinéraire traverse la jonction dans les 2 sens. Choisis l'ordre qui te semble naturel (ex: un escalier qui descend du Niv 1 au Niv 0 → `départ: 1, arrivée: 0` ; un puits qui descend du Niv 0 au Niv -1 → `départ: 0, arrivée: -1`).

**Visibilité d'une jonction** : reste affichée si **au moins un** de ses 2 niveaux est dans la liste des niveaux visibles. Exemple : jonction `0 ↔ 1`, filtre `[0]` actif → jonction visible (car 0 dans le filtre). Filtre `[2]` → jonction cachée.

**Cas particulier : une seule jonction = un seul passage logique**. Si dans la réalité il y a 2 escaliers entre les mêmes niveaux, trace **2 jonctions distinctes** aux 2 endroits physiques. Le pathfinder choisira automatiquement la plus courte selon le trajet demandé.

> 💡 **Important pour le pathfinder** : les jonctions sont les **seuls bridges** entre niveaux. Si tu veux qu'un itinéraire passe du Niv 0 au Niv 1, tu **DOIS** tracer une jonction entre ces 2 niveaux à l'endroit physique du passage (escalier réel). Sans jonction, le pathfinder refuse de traverser même si visuellement 2 tracés se croisent à l'écran.

### 🧹 Effacer une jonction

Les jonctions s'effacent **exactement comme les autres tracés** via la sous-action 🧹 :
- **🎯 Sélection au clic** → clique sur la jonction → confirme la suppression
- **✂️ Dernier tracé entier** → si la jonction est le dernier tracé fait, elle est supprimée
- **🗑️ Tous les tracés** → efface absolument tout (routes + jonctions)

### Ajouter du niveau aux calques image

Dans le **🏗️ Générateur de plan**, chaque calque image (légende, hachures, etc.) a un champ **🏗️ Niveau** (visible uniquement quand `🏗️ Plan multi-niveau` est cochée). Indique-y le niveau auquel le calque appartient (entier, défaut `0`).

**Au runtime** : le calque est automatiquement affiché/masqué selon ton filtre "Niveaux visibles" dans la modale Niveaux. La modale fait **autorité** sur le checkbox Leaflet du contrôle des couches → si tu décoches manuellement un calque, le changement de niveau ré-applique l'état correct.

**Rétro-compat** : si tu modifies un ZIP existant qui n'avait pas de `level` sur ses calques image, ils s'affichent à `0` dans le générateur — modifie-les pour les répartir par niveau si besoin.

### Ajouter du niveau aux data layers

Les calques de données existants (`puits.json`, `cataphile.json`, etc.) peuvent aussi avoir des items tagués par niveau. Ajoute manuellement `"level": N` dans le JSON :

```json
{
  "data": [
    { "id": "PA1", "nom": "Puits Aération Niv 1", "x": 100, "y": 200, "tags": ["pa"], "level": 1 }
  ],
  "roads": [
    { "type": "principal", "level": 0, "points": [{"x":1,"y":2}, ...] }
  ],
  "zones": [
    { "type": "eau", "level": 0, "points": [...] }
  ]
}
```

Items sans `level` → traités comme `level: 0` (rétro-compat avec tes JSON existants).

### Exporter avec choix des niveaux

**Mode rapide** (🖼️ → ⚡ Mode rapide) : exporte ce qui est actuellement visible (WYSIWYG, suit ton filtre).

**Mode avancé** (🖼️ → 🎨 Mode avancé) : nouvelle section **🏗️ Niveaux à exporter** avec checkboxes par niveau. **Indépendant** du filtre map → tu peux filtrer la map sur [Niv 0] mais exporter [Niv 0+1+2] en cochant les 3 boxes. Pré-coché sur ce qui est actuellement visible pour éviter les surprises.

### Plans existants (rétro-compat)

Si tu charges un plan qui **n'a pas** activé le mode multi-niveau :
- Aucun bouton niveau, aucune sous-action 🪜, comportement strictement identique
- Tes anciennes sessions / exports continuent de fonctionner sans modification

Si tu actives le mode sur un plan existant :
- Tous les tracés/zones/points sans niveau sont considérés comme **Niv 0**
- Tu peux commencer à ajouter des tracés Niv 1, 2… qui coexistent avec les anciens (au Niv 0)

---

## ⬆️ Sauvegarder et partager

> Tous les boutons d'export se trouvent dans le groupe **⬆️ Enregistrer** de la barre latérale.

### 📤 Exporter

Appuyez sur **⬆️ → 💾**. Une modale s'ouvre avec **5 onglets** : 🚀 Full · 🎨 Avancé · 🔄 Conversion · 🔗 Fusion · 📡 Export externe :

#### 🚀 Full
Exporte tout en un seul fichier `.json` (ou `.zip` si tu coches les photos) : points ajoutés, tracés, zones, structures, mesures, tracé du suivi.
Pratique pour sauvegarder ta session et la reprendre plus tard.

> 📌 La mesure de distance n'est pas incluse en mode Full.

> 🧭 **Tracker inclus en Full** : si le tracker est actif (ou a été utilisé pendant cette session), sa **position actuelle + chemin parcouru + timeline complète + timestamp de démarrage** sont embarqués dans le payload sous `session.tracker`. À la ré-importation, ta session de tracking est **fidèlement restaurée** (timeline + replay possible). Si le tracker n'a jamais été activé, le champ est simplement absent (rétro-compat).

#### 🎨 Avancé
Sélection précise de ce que tu veux exporter :

- ✏️ **Points ajoutés** + cases par tag (avec icône miniature) + une catégorie spéciale `(sans tag)` pour les points sans tags. Tu peux donc exporter par exemple uniquement les points avec le tag `pa` ou `danger`.
- 🛣️ **Tracés** + cases par type (principaux, secondaires, chemins)
- ⬛ **Zones** + cases par type (eau, remblais, effondrement, inaccessible)
- 🏛️ **Structures** + cases par type (piliers / mur / fronts)
- 🧭 **Tracker** *(en option)* — si coché, la case affiche en temps réel un compteur : *« timeline N évt · tracé M pts »*. À l'export inclut : position actuelle + chemin parcouru + timeline complète + timestamp de démarrage. Re-import restaure tout → ton replay 🎬 est fonctionnel après ré-import.
- 👤 **Identité user** — case dédiée pour inclure ton **profil** (surnom + photo + compteurs). Utile pour migrer ton identité visuelle vers un autre appareil. À l'import, un toast modal suggère un reload pour que le bandeau profil soit mis à jour partout dans l'UI.

**Format de sortie** au choix :
- 📄 **Un seul fichier session** (.json — réimportable comme une sauvegarde classique)
- 📦 **ZIP multi-fichiers** (un fichier par catégorie : `session_points.json`, `session_roads.json`, etc.)

#### 🔄 Conversion
Convertit ta session en **calque de données** prêt à intégrer dans un plan définitif via le fichier `plan-config.json`.

Cases à cocher : Points / Tracés / Zones / Structures (avec **filtrage par tag** pour les points, comme en Avancé).

> 📌 **Le tracker est volontairement IGNORÉ en mode Conversion**. Le tracker est par nature **éphémère et expérimental** (PDR sujet à dérive) — le figer en data layer permanent serait trompeur pour les futurs utilisateurs du plan. Si tu veux archiver une session de tracking, utilise le mode **Full** ou **Avancé** (= ré-importable comme session, pas figé dans le plan).

**Granularité** au choix :
- 📄 **Basique** : 1 fichier par catégorie (`points.json`, `roads.json`, `zones.json`)
- 🔬 **Fine** : 1 fichier par type (`zones_eau.json`, `zones_remblais.json`, `roads_principal.json`, etc.)

Téléchargement direct si 1 seul fichier, ZIP sinon.

> 💡 La conversion est utile pour figer une partie de ton travail dans un plan permanent. Une fois converties en data layer, ces données ne sont plus modifiables depuis l'application.

#### 🔗 Fusion (fusionner plusieurs data layers)
Tu construis un gros plan en **plusieurs sessions** et tu te retrouves avec plein de fichiers (`Point1.json`, `Point2.json`, `Road1.json`…) ? L'onglet **🔗 Fusion** les **regroupe en un seul jeu par type**.

- Glisse/sélectionne **N fichiers** data layer (`.json` et/ou `.zip`, cumulables).
- L'app les **concatène par catégorie** : tous les points → `points.json`, tous les tracés → `roads.json`, toutes les zones → `zones.json`, toutes les structures → `structure.json`.
- Un **aperçu** affiche les totaux et te **prévient** si des identifiants de points sont en double (les doublons sont conservés tels quels).
- **Télécharge** le résultat (un ZIP, ou un `.json` direct s'il n'y a qu'une seule catégorie), prêt à déposer dans le dossier de ton plan.

Accessible **sans plan ouvert** depuis l'accueil : **📊 Éditeur de données → 🔗 Fusionner des calques de données**. **100 % local**, aucune donnée envoyée.

### 🖼️ Exporter en PNG/JPG

Appuyez sur **⬆️ → 🖼️ Exporter le plan en image**. Une modale s'ouvre avec deux modes :

#### ⚡ Export rapide
Tout est inclus automatiquement : plan complet, tous les calques visibles, points, tracés, zones, position et chemin du tracker. Format PNG résolution originale. Un seul clic sur **Télécharger**.

#### 🎨 Export avancé
Pour un contrôle précis sur tout ce que tu exportes :

- **Calques d'image** — coche/décoche chaque calque (légende du plan, annotations, etc.)
- **Calques de données** — coche les couches à inclure (puits, véhicules, etc.). Les zones et tracés embarqués dans ces calques sont aussi exportés.
- **Annotations** — choisis quoi inclure parmi tes points, tracés, zones, mesure, position et chemin du tracker
- **Légende intégrée** — ajoute une légende stylisée directement sur le plan exporté :
  - **Position** : 4 coins (haut-gauche, haut-droit, bas-gauche, bas-droit) ou **personnalisée** (clique 🎯 puis sur le plan pour placer le coin haut-gauche de la légende)
  - **Style** : Opaque / Semi-transparent / Filigrane
  - **Taille** : Compact / Standard / Large
  - **Contenu** : Icônes / Tracés / Zones / Tag tracker / Métadonnées du plan (nom, version, auteur, date)
- **Format** : PNG ou JPEG (qualité 90%, fichier plus léger)
- **Résolution** : Originale, ½ ou ¼. L’app pré-coche la plus grande qui reste raisonnable (sur un très gros plan, ½ ou ¼) et affiche sous le choix la taille de l’image et la mémoire qu’elle demandera ; au-delà, un avertissement s’affiche. Sur iPhone/iPad, les résolutions que Safari ne peut pas créer sont grisées
- **Aperçu** : un mini-canvas se met à jour en temps réel pour visualiser le résultat

> ⚠️ Avant de partager cette image, vérifiez qu'elle ne révèle pas d'informations sensibles.

### 📤 Exporter en PDF imprimable

Appuyez sur **⬆️ → 📤 PDF imprimable**. Génère un PDF prêt à imprimer avec header (titre + métadonnées) et légende positionnable.

**Cas d'usage typiques** :
- 🖨️ Impression papier pour emporter sur le terrain (A4, A3, voire grands formats)
- 📧 Partage par email à un collègue qui n'a pas l'app
- 📁 Archive durable d'une session importante

#### 📐 Formats supportés

| Format | Dimensions | Usage typique |
|---|---|---|
| **A0** | 841×1189 mm | Plotter pro, affiche murale |
| **A1** | 594×841 mm | Grand format, atelier |
| **A2** | 420×594 mm | Affiche, présentation |
| **A3** | 297×420 mm | Papier A3 |
| **A4** | 210×297 mm | Papier standard *(défaut paysage)* |

× **Portrait** ou **Paysage** (10 combinaisons total).

#### 🗂️ Choix de contenu

Comme l'export PNG avancé, tu coches exactement ce que tu veux inclure :

- **📦 Annotations de session** — Points / Tracés / Zones / Structures (compteurs en temps réel basés sur ta session)
- **🖼️ Image de base & calques** — case « Image plan de base » + 1 case par calque d'image du plan (calques d'image type légende, annotations photo, etc.). Pré-cochage = visibilité actuelle sur la carte.
- **📊 Calques de données** — 1 case par calque de données du plan (puits, véhicules, chemins, structure embedded, etc.). Le calque de tes annotations apparaît avec un libellé spécial « Mes annotations (= calque session) ».
- **🎨 Mise en page** — case Header (titre + métadonnées en haut)
- **📏 Qualité** — Standard ×1 (défaut, recommandé A3/A4) · HD ×2 (fichier plus lourd, recommandé A0/A1) · Brouillon ×0.5

> ⚠️ A0/A1 + qualité ×2 peut prendre 30-60 sec sur mobile (gros canvas).

#### 🗗️ Légende — overlay 4-coins

Au lieu d'un footer dédié, la légende est posée comme un overlay sur le plan, au coin de ton choix. Configure dans la section **🗺️ Légende** :

- **Activer** : checkbox « Inclure la légende posée sur le plan »
- **📍 Position** : 4 radios — ↖ Haut-gauche · ↗ Haut-droite · ↙ Bas-gauche *(défaut)* · ↘ Bas-droite
- **📏 Taille** : Compact (icônes 16px) · Standard (22px) · Large (30px)
- **🎨 Style** :
  - **Pro fond blanc** *(défaut)* — adapté impression papier (texte foncé, accent bleu marine)
  - **Sombre opaque** — fond charte dark, accent jaune
  - **Sombre semi-transp.** — laisse voir le plan en transparence sous la légende
  - **Filigrane discret** — version la plus discrète

La légende contient automatiquement :
- 🕳️ Puits + 🪜 Accès + ⚠️ Signalétique (icônes des points effectivement présents sur le plan)
- 🛣️ Tracés (par type)
- ⬛ Zones (par type)
- 🏛️ Structures (piliers / mur / fronts)

> 🎯 **Filtre par usage réel** : un icône / type n'apparaît dans la légende QUE s'il est présent au moins une fois sur le plan exporté. Tu n'auras pas un type « Pilier 2e masse » affiché si tu n'en as dessiné aucun.

#### 📛 Crédits

Le PDF généré porte la signature `Généré par MyKTAMap · CC BY-NC-SA 4.0 · myktamap.fr` en bas à droite. Nom du fichier : `<plan>_<date>.pdf`.

> ⚠️ **Aucun emoji dans le texte natif PDF** (la lib jsPDF utilise Helvetica latin1 qui ne supporte pas Unicode). Les emojis dans la légende sont OK car celle-ci est rendue en image canvas avant d'être collée dans le PDF.

---

### 🌍 Exporter en KMZ géolocalisé (Google Earth, OsmAnd, Locus, Avenza)

Appuyez sur **⬆️ → 💾** puis l'onglet **📡 Export externe** (KMZ). Génère un fichier `.kmz` ouvrable dans n'importe quelle appli de cartographie terrain compatible KML.

Cas d'usage typiques :
- Visualiser ton plan dans **Google Earth** par-dessus l'imagerie satellite
- Charger dans **OsmAnd / Locus / Avenza** pour navigation terrain hors-ligne
- Partager avec un collègue qui n'a pas MyKTAMap mais a un viewer KML

#### Calibrage par 2 points GPS

Le KMZ a besoin de savoir **où ton plan se trouve sur le globe**. Tu lui donnes 2 couples (point sur ton plan ↔ coordonnées GPS réelles), l'app calcule la transformation rotation+échelle+translation et positionne tout correctement.

Pour chaque point (A et B), 3 méthodes au choix :
- **🔍 Chercher un point** : tape un nom dans la barre, clique le résultat → les coords plan x/y sont auto-remplies. Tu n'as plus qu'à renseigner les coordonnées GPS correspondantes.
- **📍 Cliquer carte** : la modale se réduit, tu cliques sur la carte là où tu connais les coords GPS → x/y plan auto-remplies. Renseigne les coords GPS.
- **Saisie manuelle** des 3 champs (Plan x, Plan y, **GPS (lat, lng)**).

> 🌐 **Format GPS** : le champ `GPS (lat, lng)` accepte directement le **format Google Maps natif** (`48.680831, 2.158843`). Tu peux copier les coords depuis Google Maps (clic droit → copier les coordonnées) et coller le tout dans le champ — pas besoin de séparer en 2 champs lat / lng. Si le format est invalide, le champ devient rouge avec un message explicite. Le même format est accepté **partout** dans l'app (recherche Ctrl+K · Settings KMZ · création de plan géoréférencé).

> 💡 **Conseil** : choisis 2 points **éloignés** sur le plan (idéalement aux extrémités opposées) — plus la distance AB est grande, meilleure est la précision de la transformation. L'app refuse si AB fait moins de 50 px sur le plan ou moins de 1 mètre IRL.

> 📐 **Point C (optionnel) — pour les plans déformés** : si ton plan est un **assemblage** qui se projette mal (étiré dans un sens, échelles différentes en X et Y), ajoute un **3e point** dans ⚙️ Réglages → Géoréférencement (ou dans le générateur) : l'app passe alors sur une transformation qui **corrige la déformation globale** — vue OSM, exports KMZ/GPX et Mode Secours en profitent tous. Choisis C **loin de la ligne A-B** (un C aligné n'apporte rien et est refusé). À savoir : ça corrige une déformation *d'ensemble* — si chaque morceau de l'assemblage a sa propre erreur, le résultat s'améliore mais ne peut pas être parfait partout. Laisse C vide si ton plan se projette déjà bien : rien ne change.

#### Aperçu live

Au fur et à mesure que tu remplis les champs, un bloc **🌐 Aperçu coins** s'affiche avec :
- Les 4 coins de ton plan calculés en (lat, lng) — ↖️ ↗️ ↙️ ↘️
- L'**échelle** calculée (mètres par pixel) et la **rotation** (°)
- Un lien **🔗 Voir le centre sur Google Maps** pour vérifier visuellement que le centre du plan tombe bien là où tu attendais (vérif connexion internet auto avant ouverture)

#### Contenu à inclure (granularité fine)

Pareil que le mode Image Avancé : cases parent + sous-cases pour un contrôle précis.

- 🖼️ **Image plan** (GroundOverlay) + slider **Opacité 0-100%** (défaut 60%) — permet de voir la cartographie satellite/OSM sous ton plan dans Google Earth. Les images au-delà de ~8 000 px sont **automatiquement réduites** (Google Earth les tronquait en silence) — un plan tuilé V2 est recomposé depuis ses tuiles ; si la réduction est impossible, l'app te demande avant d'exporter.
- 📍 **Points** + sous-cases par tag avec icônes et compteurs (session + data layers)
- 🛣️ **Tracés** + sous-cases Principaux / Secondaires / Chemins
- ⬛ **Zones** + sous-cases Eau / Remblais / Effondrement / Inaccessible
- 🪜 **Jonctions interniveau** (si plan multi-niveau)
- 🗺️ **Itinéraire actif** (si calculé)

Tu peux par exemple exporter uniquement les **puits d'aération** sans les chemins, ou seulement les **zones inaccessibles** pour fournir un layer de danger à un viewer externe.

#### Niveaux à inclure (si multi-niveau)

Section dédiée avec chips pour filtrer par niveau. Par défaut tous les niveaux dispo sont cochés (1 Folder KML par niveau dans le fichier).

#### Téléchargement

Clic **Télécharger** → fichier `MyKTAMap_<NomDuPlan>_<date>.kmz` téléchargé.

#### Persistance du calibrage

Ton calibrage 2 points est sauvegardé **par plan** (sur cet appareil). Au prochain export du même plan, les 8 champs sont déjà pré-remplis — tu ajustes si besoin et tu re-télécharges. Si tu changes de plan ou repars à zéro, tu n'as qu'à re-saisir.

> ⚠️ **Limites de la précision** : la transformation est une **similarity 2D** (rotation + scale uniforme + translation). Sur des plans globalement plats et rigides, c'est suffisant. Sur des plans très étendus ou non-rigides (déformations locales), attends-toi à une légère dérive aux extrémités opposées au calibrage. Une version future pourra supporter 3+ points (least squares) pour plus de précision si besoin.

> ⚠️ **Comme pour l'export PNG**, vérifie que ton KMZ ne révèle pas d'informations sensibles avant de le partager publiquement (carrière privée, accès restreint…).

---

## ⬇️ Charger / Import

> Le groupe **⬇️ Charger / Import** de la barre latérale contient les actions d'import.

### 📥 Importer un fichier (session ou GPX)

Appuyez sur **⬇️ → 📥 Importer** : le choix du fichier s'ouvre directement, l'app reconnaît son type.

**Session MyKTAMap** (`.json`, ou `.zip` avec photos) — **remplace** votre session en cours :

1. Un **aperçu** s'affiche : nombre de points ajoutés, nombre de tracés, nombre de zones, nombre de points de mesure
2. Un **avertissement** vous prévient que l'import remplacera votre session en cours — une sauvegarde automatique est prise juste avant
3. Cliquez sur **Importer** pour valider, ou **Annuler** pour fermer sans rien changer

**Fichier GPX** (`.gpx` de TopoDroid, OsmAnd, Avenza, Strava, Garmin…) — **ajoute** ses waypoints (points) et tracks (tracés) à votre session. Le plan doit être **calibré GPS** (📡 Export externe). Un aperçu précède l'ajout, et **Ctrl+Z** l'annule.

### 📊 Éditeur de données du plan

Appuyez sur **⬇️ → 📊 Éditeur de données du plan** (en mode carte) **ou** sur le bouton **📊 Éditeur de données** de l'accueil pour ouvrir l'éditeur en tableau. Vous pouvez **voir, modifier et exporter** les données du plan (points, tracés, zones, structures).

> ℹ️ Depuis l'**accueil**, aucun plan n'est encore chargé : seules les sources **📦 ZIP** et **📄 JSON** sont proposées (pas de « plan en cours »).

#### Ouverture — 3 sources

1. **🗺️ Plan en cours** — liste les calques de données du plan ouvert (puits, accès, tracés, zones…). Choisissez-en un à éditer.
2. **📦 Importer un ZIP** — récupère la liste des calques de données d'un plan complet (`.zip`).
3. **📄 Importer un fichier JSON** — un seul fichier de données ou de session (glisser-déposer).
4. **🔁 Convertir la résolution** — outil autonome pour **migrer tes données d'un ancien scan vers un nouveau scan du même plan**. Donne les deux résolutions (saisie ou 📷 auto-détection depuis les images — même géantes), un ou plusieurs fichiers `.json`, et récupère-les convertis. Si le nouveau scan n'a pas les mêmes marges : ajoute un **repère commun** aux deux plans (le même pilier lu sur chacun) — la conversion se cale exactement dessus, avec rotation optionnelle ; **deux repères** et l'échelle + la rotation sont déduites toutes seules. Ce qui n'est pas dans le fichier (liaisons inter-plans, géoref, échelle du plan) reste à refaire sur le nouveau plan.
5. **🧹 Dédoublonner les données** — retire les **sommets identiques consécutifs** accumulés dans les tracés, zones, structures et mesures d'un fichier `.json` (calque de données ou session exportée) : un ancien bug du mode « clic carte » pouvait en empiler plusieurs par clic — invisibles à l'écran, mais ils gonflent les fichiers et les exports. Choisis un ou plusieurs fichiers, récupère-les nettoyés en `_dedup.json` avec le compte de ce qui a été retiré. Les points (POI) ne sont **jamais touchés** — deux points volontairement superposés restent distincts.

Si une source contient plusieurs jeux de données, un **sélecteur** s'affiche (chacun avec son nombre d'éléments). Le tableau s'ouvre ensuite avec une colonne par champ détecté.

#### Édition

- **Cliquez sur une cellule** pour la modifier (sauf l'ID, en lecture seule)
- **Tab** : passe à la cellule suivante · **Entrée** : ligne suivante (même colonne) · **Échap** : annule
- **Coordonnées** : si X ou Y est hors du plan, la cellule devient rouge avec un avertissement ⚠
- **Tags** : cliquez sur la cellule pour ouvrir un sélecteur multi-tags avec aperçu des icônes (création de tag à la volée possible)
- **🔒 Tracés / zones / structures** : vous pouvez éditer la **note** (description), le **type** et le **niveau**, mais la **géométrie** (la colonne `points`) reste en **lecture seule** — pour la redessiner, utilisez les outils de tracé sur la carte.

#### Actions *(points uniquement)*

- **🔍 Recherche** filtre toutes les colonnes · **Trier** : clic en-tête (asc → desc → annulé) · **Sélection multiple** : checkbox + Maj+clic
- **+ Ajouter ligne** · **📋 Dupliquer** · **🗑️ Supprimer** (confirmation) · **📍 Voir sur la carte** (points sélectionnés en orange clignotant)

#### Sauvegarde *(jamais de chargement en direct pour les données du plan)*

Bouton **💾 Sauvegarder** :

| Cas | Effet |
|---|---|
| **Données du plan** (points / tracés / zones / structures) | **📥 Télécharger** le fichier `.json` modifié. ⚠️ Pour les **appliquer**, réimportez ce fichier dans le **Générateur** (🏗️) — l'éditeur ne modifie jamais le plan en direct sur la carte. |
| **Session** (vos annotations en cours) | **📥 Télécharger** **ou** **✏️ Remplacer la session en cours** (mise à jour live de vos points de session). |

> ⚠️ Si vous fermez la fenêtre avec des modifications non sauvegardées, une confirmation vous propose de sauvegarder, quitter sans sauvegarder, ou continuer l'édition.

### 🗂️ Changer de plan

Ce bouton **n'est plus dans le menu ⬇️**. Pour changer de plan : touche la **rose des vents 🧭** (accueil) ou le **titre du plan** (fenêtre « Changer de plan », cf. plus haut) dans la barre du haut. Ta session est **sauvegardée automatiquement** avant le changement.

Depuis cet écran, vous pouvez :

- Cliquer sur **▶️ Reprendre** pour relancer le plan que vous venez de quitter
- Choisir un autre plan dans **Mes plans** (clic direct ou bouton ▶️ de la ligne)
- Charger un nouveau ZIP via la zone d'import
- Importer/Exporter votre liste de plans

---

## 🏗️ Créer ou modifier un plan

> Accessible directement via le bouton **🏗️** de la barre latérale (clic direct, pas de sous-menu).

Appuyez sur **🏗️** pour ouvrir le générateur. Deux onglets disponibles :

### 📦 Importer plusieurs plans d'un coup

Le bouton **📦 Importer plusieurs plans**, dans la section **🧰 Outils** de l'accueil, ajoute autant d'archives ZIP que tu veux à ta liste — **sans en ouvrir aucune**. Tu ouvriras celle que tu veux ensuite, depuis la liste.

L'écran se lit en trois temps :

1. **Tu choisis** tes fichiers.
2. **Tu vois ce qui va se passer**, ligne par ligne : ce qui sera ajouté, ce qui est déjà dans ta liste, ce qui est refusé et pourquoi. Le résumé donne le poids total, ce qui sera copié dans l'app, et la place restante.
3. **Tu lances.** Les plans entrent un par un, avec le nom en cours affiché, puis un bilan : ajoutés, ignorés, refusés.

**Si un plan est déjà dans ta liste**, tu choisis une fois pour tout le lot : le laisser tel quel, le remplacer, ou garder les deux. Par défaut il est laissé tel quel — un import n'écrase rien sans que tu le demandes.

> 💾 **La place est annoncée avant.** Le stockage d'un navigateur tient entre 50 et 200 Mo selon l'appareil. Si ton lot ne rentre pas, l'app refuse de commencer et te dit combien il manque. Si la place s'épuise en cours de route, elle **s'arrête net** : les plans déjà ajoutés sont gardés, et le bilan dit où ça s'est arrêté.
>
> 📁 **« Ranger dans : »** — choisis le dossier de « Mes plans » qui recevra tout le lot (ou « ➕ Nouveau dossier… », nommé sur place). Par défaut, les plans arrivent en « Non classés ».
>
> 💾 **« Précharger le ZIP » (case cochée par défaut, elle suit le réglage « Mémoriser le plan dans l'app au premier chargement » de ⚙️ Configuration de l'accueil)** : l'app garde le fichier, et chaque plan importé **s'ouvre depuis la liste sans que tu aies à resélectionner son ZIP**. Décoche-la si tu veux seulement remplir ta liste sans rien ranger : rien n'est copié, la place n'est plus un sujet, et le ZIP te sera demandé à la première ouverture de chaque plan (comme pour un plan restauré depuis un profil).

> 🔒 **100 % local** : tout se lit et se range **dans ton navigateur**. Aucun octet n'est envoyé nulle part, et ça marche hors ligne.

### 🗺️ Déposer un GeoTIFF

Si tu as calé ton plan dans **QGIS**, exporte-le en **GeoTIFF** (`.tif` / `.tiff`) : l'image **et** son calage voyagent dans le même fichier. Choisis-le comme image de plan — dans le Générateur ou directement depuis l'écran d'accueil — et l'app fait le reste :

- elle **lit le calage écrit dans le fichier** et remplit le **géoréférencement GPS** toute seule ;
- elle en déduit l'**échelle** (px/m) et l'**emprise** du plan, affichées dans le message de confirmation ;
- elle convertit l'image en PNG pour la suite (aucun navigateur de bureau n'affiche un TIFF), puis le tuilage et le ZIP se déroulent comme d'habitude.

**Tu n'as plus à ressaisir les deux points GPS** que tu venais de poser dans QGIS.

> ✅ **Ce qui est lu** : compression **LZW, Deflate ou aucune** · **8 bits par canal** · **gris, RVB ou RVBA** · image **en bandes** · calage **nord en haut, sans rotation** · coordonnées en **Lambert 93, Web Mercator ou WGS84**.
>
> ❌ **Ce qui est refusé l'est toujours en clair**, avec ce qu'il faut changer à l'export : BigTIFF, image tuilée, canaux séparés, palette / CMJN / YCbCr, prédicteur inhabituel, calage tourné, système de coordonnées non géré. Un message te dit précisément quoi réexporter — l'app ne devine jamais à ta place.

> 🔒 **100 % local** : le fichier est lu et converti **dans ton navigateur**. Aucun octet n'est envoyé nulle part.

### 📄 Nouveau plan

Formulaire vierge. Renseignez :

- **Informations** : nom, version, auteur, **🏷️ étiquettes** (séparées par des virgules, 12 max de 24 caractères — même saisie que dans ℹ️ Infos). Elles voyagent dans le ZIP et sont **proposées** à qui l'importe : si tu as déjà posé tes propres étiquettes sur ce plan, elles restent les tiennes, même en réimportant une nouvelle version. Le champ existe aussi dans les conversions KMZ, GPX et SIG.
- **Image principale** (obligatoire) — les **dimensions du plan sont auto-détectées** dès que vous choisissez votre fichier. Un encadré affiche les dimensions et la taille en Mo, avec des **avertissements rouges** si l'image dépasse 10 000 px de côté ou 30 Mo (risque de crash mémoire sur mobile / ZIP très lourd).
- **Carte de collision** (optionnelle)

- **Position initiale du tracker** (groupe 🧭 Tracking) — **auto-centrée** au milieu du plan (W/2 × H/2) dès que l'image principale est chargée. Vous pouvez modifier ces valeurs manuellement si vous voulez démarrer le tracker à un endroit précis. Bouton **🎯 Recentrer la position de départ** disponible pour réappliquer le centre à tout moment.
- **Calques image** supplémentaires (légendes, annotations) — jusqu'à 10
- **Calques de données** JSON — jusqu'à 10 (créés vides si non fournis)
- **Paramètres de tracking** : position de départ, échelle, sensibilité
- **Icônes & Tags** : gestionnaire dynamique
  - Cliquez **↺ Charger défauts** pour pré-remplir avec les icônes standards
  - Cliquez **+ Ajouter un tag** pour créer un type personnalisé
  - Pour chaque tag, choisissez une icône personnalisée ou laissez le chemin par défaut
  - Les tags `default` et `track` sont obligatoires (système)

Le calque **Ajouts** (`editor.json`) est toujours inclus automatiquement.

Cliquez sur **📦 Générer le ZIP** — l'archive est prête.

### 📂 Modifier existant

Importez un ZIP existant — le formulaire se pré-remplit automatiquement avec sa configuration. Modifiez ce que vous voulez (ajouter des tags, changer les icônes, ajouter des calques, etc.) et cliquez sur **📦 Générer le ZIP** pour télécharger la version modifiée.

> Pratique pour ajouter de nouvelles icônes à un plan déjà en circulation, ou pour ajuster la position initiale du tracker.

### 🎨 Image vierge

Si tu veux créer un plan **from scratch** sans image source (par exemple pour dessiner uniquement des piliers / fronts de taille / tracés sur un canvas vide), tu peux générer une **image vierge**.

Dans la section **🖼️ Images principales** du générateur, 2 modes radio :

| Mode | Effet |
|---|---|
| **📷 Depuis une image** (par défaut) | Upload classique d'un PNG / JPG / WebP |
| **🎨 Image vierge** | L'app génère un canvas vide aux dimensions et couleur que tu choisis |

Quand tu sélectionnes **Image vierge** :

- **Largeur** et **Hauteur** en pixels (500 min, 12 000 max — limites anti-crash mémoire mobile)
- **Couleur de fond** :
  - ⬜ **Blanc** : style papier — utile pour dessiner des plans architecturaux
  - ▫️ **Gris clair** : neutre, écrit moins agressivement
  - ⬛ **Noir** : style fond sombre (terrain dans l'obscurité, dessin trace blanche dessus)
  - 🌫️ **Gris foncé** : entre neutre et sombre
- Bouton **🎨 Générer l'image** : l'app crée le canvas + l'injecte automatiquement comme image principale. Les dimensions du plan se règlent en conséquence.

Tu peux ensuite ajouter tes calques de données (vides), tracking, icônes et **📦 Générer le ZIP** comme pour un plan normal. Une fois le plan chargé dans l'app, dessine ce que tu veux (piliers, fronts de taille, tracés, points) via les outils habituels.

> 💡 **Cas typique** : un cartographe qui visite une carrière à explorer, sans plan papier existant, peut générer un plan vierge 4000×4000 noir à son arrivée, puis dessiner au fur et à mesure (avec le tracker comme repère). À la fin, le ZIP est partageable.

### 📦 Importer un datalayer ZIP en un clic

Dans la section **📊 Calques de données** du générateur, un encadré jaune doré propose **📦 Choisir un ZIP datalayer…**. Il sert à **récupérer en un coup** les calques + photos d'un autre plan, exportés via **📤 Exporter → 🔄 Conversion → ✏️→🗂️ Session vers data layer** (avec la case 📸 Photos cochée pour les inclure).

**Cas d'usage typique** :
1. KARMA voit un copain qui a annoté un plan (points + tracés + zones + structures + photos) et qui exporte un `data_<plan>.zip` via la Conversion
2. Tu copies ce ZIP sur ton appareil (Drive, AirDrop, USB…)
3. Dans le générateur, mode **Modifier existant** OU **Nouveau plan**, tu cliques le bouton 📦 Choisir un ZIP datalayer
4. Le ZIP est parsé → des **calques data layer sont créés automatiquement** : `points` (points du copain), `roads` (tracés), `zones` (zones), `structure` (piliers/fronts). Si le ZIP contenait des photos, elles sont **gardées en mémoire** pour être embarquées au moment de la génération.
5. Message vert "✅ N calque(s) créé(s) : points (X), roads (Y), zones (Z), structure (W) · 📸 M photos"
6. Tu **📦 Générer le ZIP** comme d'habitude → le plan final contient tes calques d'origine (si Modifier) + les calques importés + le dossier `data/photos/` avec les blobs
7. Au chargement de ce plan par n'importe quel utilisateur, les photos sont restaurées automatiquement sur son appareil et apparaissent dans les popups des markers

**Comportement** :
- **Mode Nouveau** : les calques importés deviennent les calques data du plan (la liste UI est vidée et remplie avec les calques du ZIP)
- **Mode Modifier** : les calques existants du plan source sont **préservés** ; les calques du ZIP importé s'ajoutent avec **suffixe `_imported_<N>`** si conflit d'id (= n'écrase jamais les calques d'origine). Photos IDB du plan courant **merge** avec photos du ZIP (déduplication par photoId).

> 📸 **Format du ZIP datalayer** attendu : c'est exactement ce que produit la **Conversion session → data layer** quand tu coches "📸 Inclure les photos attachées" (granularité Basique ou Fine peu importe). Contient `points.json` + `roads.json` + `zones.json` + `structure.json` (selon ce qui était présent dans la session source) + `photos/_index.json` + `photos/<photoId>.jpg`.

### 📸 Inclure les photos attachées au plan

En mode **Modifier existant**, si le plan que tu charges a déjà des **photos attachées à ses points** (enregistrées sur ton appareil par l'éditeur), une case **📸 Inclure les photos attachées (N · X Mo)** apparaît dans la section "🖼️ Images principales" du formulaire.

- **Cochée par défaut** : les photos IDB du plan sont embarquées dans le ZIP plan généré sous `data/photos/<photoId>.jpg`. Tu peux ainsi partager le plan complet (annotations + photos) à un autre appareil.
- **Décochée** : le ZIP plan généré ne contient pas les photos. Plus léger en taille, mais l'utilisateur qui importe le ZIP ne récupèrera pas les photos.

Au chargement de ce ZIP plan par n'importe quel autre utilisateur : les photos sont **restaurées automatiquement** sur l'appareil, sous l'identifiant local du plan + un toast discret "📸 N photos restaurées depuis le plan" confirme.

> ⚠️ Si tu décoches **ET** que tu as aussi importé un datalayer ZIP avec photos (cf. section précédente), seules les photos du datalayer importé seront embarquées. La case 📸 contrôle UNIQUEMENT les photos IDB du plan courant.

### 🧱 Convertir en V2 tuile (performance)

Si ton plan est lourd (image > 50 Mo, dimensions > 8000 px), tu peux le convertir en **plan tuilé V2** pour réduire massivement la conso mémoire au runtime. Le système découpe l'image en tuiles 512×512 sur 4 niveaux de zoom (Google Maps-like) — à tout moment, seules les tuiles du niveau de zoom courant sont chargées en RAM.

**Workflow** :

La case 🧱 Convertir en V2 apparaît dans le formulaire dès que tu as **uploadé une image principale**, que tu sois en mode **Nouveau plan** OU en **Modifier existant** (pas besoin de passer par un ZIP V1 source).

1. **Nouveau plan** : choisir une image principale → la case 🧱 apparaît<br>
   OU **Modifier existant** : uploader ton ZIP V1 (la case 🧱 est dispo)
2. Cocher la case **☑️ 🧱 Convertir en V2 tuile (performance)** (encadré violet)
3. **Modal d'avertissement** : la conversion est lourde (CPU + RAM). Lis le message, clique **J'ai compris — Continuer** (ou **Annuler (décocher)** si tu veux y réfléchir). Voir section "PC vs mobile" plus bas.
4. Remplir le reste du formulaire (nom, version, calques, tracking, etc.)
5. Cliquer **📦 Générer le ZIP** → overlay de progression "Niveau z=−N · X / Y tuiles (Z%)"
6. ZIP téléchargé avec suffixe `_v2` (ex: `plan_xxx_v2.zip`)
7. **Re-importer ce ZIP via le loader** → le mode V2 s'active automatiquement (badge violet `V2` sur la carte plan)

**Auto-crop intégré** : si ton image source a beaucoup de marges blanches (typique des plans scannés papier), le générateur détecte automatiquement le bbox du contenu utile et tuile uniquement cette zone. Tu gagnes en taille de ZIP + en netteté au zoom max. Si l'image est déjà bien cadrée, pas de crop.

**🫥 Transparence conservée** : si ton image source est un **PNG/WebP avec de la vraie transparence** (fond alpha), le générateur ne rajoute **plus de fond sombre** : les tuiles gardent la transparence (format WebP, ou PNG selon le navigateur). Résultat : derrière les zones transparentes tu vois le fond sombre de la carte — et dans la **Vue OSM**, la carte OpenStreetMap apparaît **à travers ton plan**. La détection est automatique (elle regarde les pixels, pas l'extension du fichier — un PNG dont le fond a déjà été aplati reste traité en opaque). Sur une source transparente, l'auto-crop ci-dessus est **désactivé** pour ne jamais décaler tes points/tracés/géoréférencement. **Plans V2 existants** : le fond a été cuit dans leurs tuiles à l'époque — régénère une fois (Modifier → recocher V2) pour en profiter ; sans régénération ils continuent de marcher comme avant.

**Trade-offs** :

| ✅ Gains | ⚠️ Coûts |
|---|---|
| Conso mémoire massivement réduite (~16 MB max au lieu de l'image entière en RAM) | Conversion lente (1-5 min selon la taille de l'image) |
| Idéal pour mobile (Safari iOS, gros plans qui crashent en V1) | Le ZIP final contient plus de fichiers (les tuiles) mais ~même poids total qu'un PNG/JPEG unique |
| Navigation plus fluide au pan/zoom | Léger flash visuel au changement de niveau de zoom (swap des tuiles) |
| Auto-crop des marges blanches | Black border visible quand on dezoome très très loin (au-delà des bords) |

**Modifier un plan déjà V2** : la case est **pré-cochée** par défaut → les tuiles seront régénérées avec les nouvelles modifs. Si tu décoches, downgrade explicite V2 → V1 (les tuiles ne sont pas reportées dans le nouveau ZIP).

#### 💻 PC vs 📱 Mobile pour la conversion

> ⚠️ **Important** — c'est le sujet du modal d'avertissement qui apparaît quand tu coches la case.

| Plateforme | Décodage image source | Recommandation |
|---|---|---|
| 💻 **Ordinateur** (Windows / macOS / Linux) | Aucune limite mémoire en pratique. Conversion 1-5 min selon taille. | ✅ **Recommandé** pour la génération |
| 📱 **Mobile** (iOS / Android) | Plafonné à **~500 Mo de RAM** pour la PWA. Crash quasi-garanti sur image >50 Mo ou >8K px. | ❌ Éviter — **mais** le ZIP V2 généré sur PC s'importe sans coût sur mobile (c'est tout l'intérêt de V2) |

> 💡 **Workflow recommandé** : génère le ZIP V2 une fois pour toutes sur ton PC, puis partage-le sur ton téléphone (Drive, AirDrop, etc.). Le téléphone l'importe en quelques secondes et tu profites du runtime tuilé sans coût mémoire au boot.

#### 🎛️ Désactiver le tuilage à la lecture (V2 → V1 brut)

Au chargement d'un plan V2, tu peux choisir **Mode performance : Désactivé** dans la modale **⚙️ Configuration** du loader. Dans ce cas, le runtime ignore les tuiles et charge directement l'**image source** du ZIP, gardée intacte, comme un plan V1 classique.

Use cases :
- Comparer le rendu V2 vs V1 sur le même plan
- Bypass temporaire si tu vois un comportement bizarre du système de tuiles (debug)

⚠️ Ce mode charge toute l'image en RAM → susceptible de crasher sur mobile pour les gros plans (c'est ce que V2 évite normalement).

> 💡 **À tester en priorité** sur ton plus gros plan qui crashe sur mobile, ou avant de partager un plan lourd à quelqu'un avec un téléphone modeste.

---

## 🚀 Optimiser ton plan pour la performance

Un plan léger se charge plus vite, navigue plus fluide et **réduit fortement le risque de crash mémoire sur mobile**. Voici les bonnes pratiques par ordre d'impact.

### 1. 🖼️ Image principale — limiter les dimensions

L'image base est le **plus gros consommateur mémoire**. Sur mobile, le navigateur alloue un canvas de la taille de l'image entière.

| Dimensions | Comportement | Recommandation |
|---|---|---|
| ≤ 4 000 × 4 000 px | OK partout | ✅ Idéal |
| 4 000 - 8 000 px | OK desktop, dézoom limité sur mobile | ⚠️ Acceptable |
| 8 000 - 16 000 px | Risque de crash sur mobile bas/moyenne gamme | ⚠️ Force le tuilage (mode Performance) |
| > 16 000 px | Crash quasi-garanti sur mobile | ❌ À éviter |

**Astuce** : si ton plan source est gigantesque, redimensionne à 6 000-8 000 px de côté max avec un éditeur d'image (GIMP, Photoshop, [Squoosh](https://squoosh.app/) en ligne). Tu perds un peu de détail au zoom maximum mais tu gagnes énormément en stabilité.

### 2. 📦 Format de l'image — JPEG vs PNG

| Format | Quand l'utiliser | Poids typique (8000×6000 px) |
|---|---|---|
| **JPEG** (qualité 80-90 %) | Photos, scans, plans avec dégradés | ~3-8 Mo ✅ |
| **PNG** | Plans avec transparence ou aplats nets | ~15-50 Mo ⚠️ |
| **WebP** | Compromis qualité/poids (Chrome/Firefox/Safari modernes) | ~2-5 Mo ✅✅ |

> 💡 Pour un plan de carrière classique avec des routes dessinées par-dessus une couleur unie, le **JPEG qualité 85** divise le poids par 5 à 10 sans perte visuelle perceptible.

### 3. 🗂️ Calques image — limiter le nombre

Chaque calque image supplémentaire (légende, annotations, etc.) **multiplie la mémoire utilisée**. Le visiteur charge tous les calques même s'il en masque une partie.

| Nombre de calques image | Recommandation |
|---|---|
| 1 (image base seule) | ✅ Optimal |
| 2-3 | ⚠️ Acceptable si chacun est ≤ 2 Mo |
| 4+ | ❌ À éviter — fusionne dans le PNG base |

**Alternative** : si tu as des éléments décoratifs (légende, repères), **intègre-les directement dans l'image base** plutôt que d'en faire des calques séparés. Tu perds la possibilité de les masquer mais tu gagnes en perf.

### 4. 🛣️ Routes — intégrer dans le PNG si nombreuses

Les routes JSON (Principal/Secondaire/Chemin) sont rendues par Leaflet en surcouche vectorielle. Au-delà de **~50 routes**, le navigateur peut ramer au pan/zoom.

**Stratégie pour les gros plans** :
1. Trace les routes dans ton éditeur d'image (GIMP/Photoshop) **directement sur le PNG**
2. Garde un calque JSON minimaliste avec les routes invisibles côté visuel mais utilisable par le module **🗺️ Itinéraire** (le pathfinder utilise toutes les routes du calque, **même masquées**)
3. Dans le contrôle des couches Leaflet, **décoche le calque JSON des routes** → tu vois les routes via le PNG, l'app ne dessine pas les polylines vectorielles → gros gain perf
4. L'itinéraire continue de fonctionner

> 🎯 Cette technique permet d'avoir **des centaines de tronçons** sur le plan sans aucun impact perf au pan/zoom.

### 5. 📍 Points — limiter les calques de données denses

Chaque calque JSON de points (`puits.json`, `chatieres.json`, etc.) crée des markers Leaflet. Au-delà de **~500 markers visibles simultanément**, ça peut ralentir le rendu sur mobile.

| Nombre de markers | Recommandation |
|---|---|
| ≤ 200 | ✅ OK |
| 200-500 | ⚠️ OK desktop, prudence mobile |
| 500-2000 | ⚠️ Sépare en plusieurs calques de données toggleables |
| > 2000 | ❌ Considère un mode "regroupement" (clustering, future feature) |

**Astuce** : sépare tes points en plusieurs calques de données (ex: `puits.json`, `passages.json`, `électricité.json`) pour que l'utilisateur puisse en masquer ceux qui l'intéressent moins.

### 6. ⚡ Découpage de l'image — Auto, sauf raison contraire

⚠️ **Ce réglage n'est plus sur l'écran de chargement.** Il vit dans **ℹ️ Infos** du plan,
et **seulement pour un plan non découpé à la génération** — sur un plan V2 il n'aurait aucun effet, donc il ne
s'affiche pas. Bonne nouvelle : il y est **mémorisé pour ce plan**, alors que l'ancien sélecteur repartait sur
Auto à chaque démarrage.

Deux choix :

| Choix | Pour quel cas |
|---|---|
| **🔄 Auto** (défaut) | Découpe dès que l'image dépasse 4 096 × 4 096 px, ou que le fichier dépasse 60 Mo. ✅ **Le bon choix, sauf raison précise.** |
| **💤 Désactivé** | Petit plan sur desktop puissant, quand tu veux la qualité native sans aucun ré-encodage. **⚠️ Risque de plantage sur Safari iOS au-delà de 8 000 px** — un message te prévient. **Sans effet sur un plan déjà découpé** (V2), qui utilise toujours ses morceaux. |

> 🩸 **Ce qui a changé, et pourquoi.** Les presets 🌟 Qualité / 🎯 Équilibré / ⚡ Performance ont été **retirés** : ils ne réglaient que le découpage fait par le navigateur au chargement, qui ne concerne que les plans **V1**. Sur un plan **V2** — le cas courant — ils ne changeaient **rien du tout**.
> Et « Auto » se décidait sur le **poids du fichier**, pas sur la taille en pixels : un plan de 100 Mpx bien compressé (~15 Mo) **n'était pas découpé** et pouvait faire planter l'iPhone, alors que « Qualité » l'aurait découpé. Le défaut était donc le mode le **moins** protecteur. Corrigé.

> 💡 Le choix est mémorisé **par plan** : il vaut pour tous ses chargements suivants, jusqu'à ce que tu le changes. *(Auparavant, le sélecteur du chargeur ne l'était pas et repartait sur Auto à chaque démarrage.)*

### 6 bis. 🚀 Mode Performance ULTRA — pour les vrais gros plans qui crashent

Si malgré le mode Performance, ton plan crashe encore (typiquement plans 4000+ × 2000+ pixels avec beaucoup de tracés), ouvre **⚙️ Réglages → section "🚀 Mode Performance ULTRA"** et active le **toggle master 🚀 ULTRA**. Il active 6 optimisations agressives simultanément.

> 🆕 **Trois choses à savoir** :
> - **Réglage PAR PLAN** : cocher ULTRA ici ne concerne QUE le plan ouvert. Tes autres plans ne sont pas impactés. Après la mise à jour, les plans qui avaient ULTRA repartent désactivés — recoche-le sur ceux qui en ont besoin.
> - **Tes points de session sont sacrés** : les POI que tu ajoutes à la main (✏️) restent **toujours affichés**, même avec l'option « Ne rendre que les éléments visibles » active — seul l'affichage des milliers de points des calques de données est allégé.
> - **Message à l'ouverture** : quand des optimisations sont actives sur un plan, un message te le rappelle au chargement — un affichage « allégé » (tracés simplifiés, popups data désactivés…) n'est pas un bug.

> ⚠️ Ces optims **ne touchent PAS à l'image** (déjà gérée par le mode performance ci-dessus). Elles ciblent les éléments vectoriels (tracés, points, calculs).

**Les 6 toggles individuels** (activables séparément si tu veux affiner) :

| Toggle | Effet | Trade-off |
|---|---|---|
| 🪜 **Décimer les tracés au dézoom** | Simplifie les polylines au zoom out | Tracés moins lisses au dézoom |
| ⚡ **Désactiver animations zoom/pan** | Transitions instantanées au lieu d'animées | Visuel plus abrupt — **reload requis** |
| 🎯 **Désactiver cercles intersections** | Plus de cercles aux carrefours au-delà de 50 routes (vs 500) | Carrefours moins visibles |
| 🚫 **Désactiver popups sur calques de données** | Pas de popup au clic sur les markers des calques (puits, etc.) | Utilise 🔍 Recherche pour interagir |
| 🐢 **Auto-save lent (30s)** | Sauvegarde toutes les 30s au lieu de 1.5s | Risque de perdre 30s de modifs si crash |
| 👁️ **Ne rendre que les tracés visibles** | Skip les routes hors écran | Pop-in léger au pan |

**Comment t'en servir** :

- **Si l'app crashe encore** → coche **🚀 ULTRA** (active tout). Effet immédiat (sauf "animations" qui demande un reload).
- **Si tu veux affiner** → garde ULTRA décoché et active manuellement les toggles selon ce que tu veux sacrifier. Par exemple : tu peux activer juste **🐢 Auto-save lent** et **👁️ Ne rendre que les éléments visibles** pour gagner pas mal sans rien perdre visuellement.
- **Pour revenir au comportement normal** → décoche **🚀 ULTRA** (ça décoche tout) ou décoche individuellement.

**Persistance** : les toggles sont mémorisés dans ton navigateur (préférence globale, pas par plan). Ils restent activés entre sessions.

> 💡 Combo recommandé pour les très gros plans : 🚀 ULTRA + mode performance ⚡ Performance au chargement + image source ≤ 8000 px / JPEG q85.

### 7. 📱 Spécifique mobile

- **iPhone PWA** (installé sur écran d'accueil) gère mieux les gros plans qu'iPhone Safari direct
- **Android Chrome** est généralement plus tolérant qu'iOS pour la mémoire
- En cas de crash : ⚙️ Configuration (accueil) → **🛠️ Mode Développeur** → logs détaillés pour diagnostiquer

### 8. 💾 Sauvegarde régulière

Les plans très gros peuvent occasionner des **kills mémoire silencieux** sur iOS — l'OS tue l'onglet sans prévenir pour récupérer de la RAM. L'app détecte ce kill au reboot et te montre un toast d'avertissement.

> 📌 **Réflexe** : exporte ta session (📤 Exporter) tous les 10-15 minutes de travail intensif. La sauvegarde automatique sur cet appareil protège déjà contre la plupart des cas, mais un export externe reste le plus sûr.

### Récap rapide

✅ **Pour un plan optimal** :
- Image base **JPEG qualité 85** ≤ 8 000 px de côté
- 1 ou 2 calques image max
- Routes **dessinées dans le PNG** + calque JSON masqué pour le pathfinder
- Points répartis dans 2-3 calques de données toggleables
- Preset **🎯 Équilibré** par défaut, **⚡ Performance** pour les vieux mobiles

---

### 🎓 Revoir le tutoriel

Le tutoriel d'accueil (27 cartes) **se rejoue à tout moment** : ouvre **📖 Documentation** et touche le bouton **🎓** dans la ligne de titre, à côté du choix de langue. Il n'y a rien à réinstaller ni à réinitialiser.

### 🔎 Chercher dans la documentation

Cette documentation est longue. En haut de la modale 📖, un champ **🔎 Chercher** cherche dans **tout le texte** : les occurrences sont surlignées, **Entrée** ou ↓ passe à la suivante, le compteur indique « i / n », et les entrées du sommaire sans résultat s'estompent. Les accents ne comptent pas : « reglages » trouve « Réglages ». La recherche du hub ❓ Aide, elle, cherche dans les titres **et** le contenu des sections.

## 🤖 Aide IA

> Accessible depuis **📖 Documentation** : bouton **🤖** dans la ligne de titre, à côté du choix de langue — donc aussi depuis l'accueil.

Télécharge un fichier `.md` qui résume tout ce que l'app permet de faire (cette doc + une FAQ + des instructions pour l'IA). Donne-le à **n'importe quelle IA conversationnelle** (ChatGPT, Claude, Gemini, Perplexity, Le Chat, Copilot, etc.) — elle pourra répondre à toutes tes questions sur MyKTAMap avec un contexte précis.

**Comment utiliser** :

1. Clique sur 🤖 Aide IA → bouton **📥 Télécharger le contexte (.md)**
2. Le fichier `MyKTAMap-AI-Context-AAAA-MM-JJ.md` arrive dans tes téléchargements
3. Ouvre l'IA de ton choix → colle le fichier en début de conversation
4. Pose tes questions normalement : *"Comment ajouter un point ?"*, *"Mon plan plante, pourquoi ?"*, etc.

> 🔒 **Confidentialité** : le fichier ne contient QUE la documentation — aucune donnée personnelle (pas de tes plans, points, sessions, etc.). Tu peux le partager sans risque.

> 💰 **Note** : l'IA utilisée peut être payante ou avoir des quotas selon le service. MyKTAMap reste gratuit — l'aide IA est juste une façon de tirer parti d'une IA externe.

---

## 🗺️ Légende

> Accessible via le groupe **📚 Aide / Documentation / Légende → 🗺️ Légende**.

Affiche la légende complète des icônes et tracés, regroupés par catégorie : **🕳️ Puits**, **🪜 Accès** (puits à échelon, escaliers, cavages), **⚠️ Signalétique**, **🛣️ Tracés** et **⬛ Zones**.

> 💡 La légende affiche **toutes les icônes que l'application sait reconnaître**, même si votre plan en cours ne les utilise pas. C'est pratique pour découvrir les types disponibles avant d'ajouter vos points.

---

## ⚙️ Réglages (en mode carte, par plan)

> Accessible directement via le bouton **⚙️ Réglages** de la barre latérale (clic direct, pas de sous-menu).
>
> Cette modale est focus **par plan**. Pour les **réglages globaux** (langue, thème, PIN, reset, icônes au zoom, magnétisme…), passe par **⚙️ Configuration** sur la page d'accueil — cf section dédiée plus haut. La séparation est volontaire : Réglages = ce qui concerne CE plan, Configuration = ce qui concerne l'app.

### ✓ Tout s'enregistre dès la modification

Il n'y a **plus de bouton Appliquer** : chaque champ s'enregistre dès que tu le modifies (un éclair vert le confirme). Une valeur **hors bornes** passe en rouge, un message dit les bornes, et **rien n'est écrit** — l'ancienne valeur reste. Tu fermes avec **Échap**, **✕** ou **Fermer** : rien n'est perdu.

Chaque groupe porte sa **portée** dans son titre — **📍 ce plan** ou **🌍 tous les plans** — et se **replie** d'un tap sur le titre (choix mémorisé). Sur téléphone, seuls les titres s'affichent à l'ouverture, sauf le premier groupe.

### 🌍 Application *(🌍 tous les plans)*
- **🎬 Activer le mode présentation** : plein écran sans interface (démos / projection). Touche **F** sur PC ; sortie par **F** / **Échap** ou le bouton flottant ✕.
- **🏠 Réglés depuis l'accueil** *(lecture seule)* : langue, thème, icônes adaptatives au zoom, ancrage des panneaux, magnétisme au dessin, **carnet des sorties**. Leur valeur se lit ici ; le bouton **🏠 Aller à l'accueil pour les modifier** quitte le plan (ta session est conservée) et t'amène à ⚙️ Configuration.

### 📐 Plan : échelle & géolocalisation *(📍 ce plan)*
- **Échelle (px/m)** avec bouton **🎯 Calibrer** (cf. plus bas). Une échelle nulle ou négative est refusée.
- **🧭 Calibration du Nord** : utile quand le HAUT du plan n'est pas le Nord vrai. Champ angle [0,360[ ou bouton **📐 Calibrer (2 clics)** (Sud puis Nord sur la carte). Effet immédiat sur le tracker ; la boussole physique continue de pointer le vrai Nord. **↺ Reset** pour revenir à 0.
- **🌐 Géoréférencement GPS** : l'état s'affiche dans le groupe (« non géoréférencé », « ✅ points A et B », « A, B et C », « B estimé ») et le bouton **🌐 Ouvrir le géoréférencement…** ouvre sa **propre fenêtre** : points A / B (+ C optionnel) avec **🔍 Chercher un point**, **📍 Cliquer carte** et **🧭 Estimer B**, puis **💾 Sauvegarder** / **🗑️ Effacer** (confirmation). Le calibrage saisi ici est partagé avec les exports KMZ / GPX du plan et pré-remplit 📡 Export externe.

> 💡 **Auteur de plan** : pour embarquer durablement le Nord ou un **PDF Histoire** dans le ZIP du plan (cross-utilisateurs), passe par le **générateur avancé**. Pour un PDF Histoire chargé côté session, utilise le bouton d'import de la modale **📖 Mode Histoire** (status bar).

### 📍 Navigation & tracker *(📍 ce plan)*
- **Position initiale du tracker** : X/Y, ou **🔍 Choisir via un point**, ou **📍 Cliquer sur la carte**. Dès que le point de départ change, le suivi **repart de là** (le parcours en cours est effacé) — un message le dit.
- **Détection des pas** : longueur du pas [0 ; 1,5 m], seuil [10 ; 30], délai [300 ; 3 000 ms]. Hors bornes, rien n'est enregistré.
- **🧭 Navigation intelligente** (calage sur les tracés) : interrupteur (un message confirme), tolérance latérale [1 ; 50 m], poids du cap [0 ; 5].

### 🎨 Affichage *(📍/🌍 selon la ligne)*
- **⚪ Afficher les ronds aux intersections** *(ce plan)* — effet immédiat, sauvegardé par plan.
- **🔆 Garder l'écran allumé** *(tous les plans)* — Wake Lock, ré-acquis au retour d'arrière-plan. Aussi dans ⚙️ Configuration.
- **🎤 Commandes vocales (BETA)** *(tous les plans)*.
- Si ton navigateur ne prend pas en charge le wake lock ou le vocal (Firefox), la ligne reste **visible, grisée, avec la raison** — comme les capteurs ci-dessous.

### 🚀 Performance *(📍 ce plan)*
- **🚀 Mode ULTRA** applique 7 optimisations d'un coup, ou une à une (décimation des tracés, animations, cercles, popups, auto-save lent, rendu du visible, limite de dézoom mobile). Détail dans la section Performance plus haut.
- Sur un plan **multi-niveau** : **🏗️ Afficher tous les niveaux au lancement** (pris en compte au prochain chargement du plan).

### 🧩 Fonctionnalités optionnelles *(🌍 tous les plans)*
- **🎬 Replay du tracker**, **🔥 Heatmap**, **🔋 Niveau de batterie** et **📳 Vibration haptique**, désactivés par défaut. Un capteur refusé par l'appareil (ou par iOS) s'affiche grisé, avec la raison.

### 🔒 Confidentialité & sécurité *(🌍 tous les plans)*
- **🕵️ Mode incognito** : ouvre une nouvelle fenêtre qui n'écrit rien sur l'appareil.

### 🛠️ Système & maintenance *(📍 ce plan)*
- Affichage du **mode performance** du plan en cours — lecture seule ici (il se choisit dans ℹ️ Infos, pour un plan non tuilé V2). Les logs détaillés vivent dans ⚙️ Configuration (accueil) → 🛠️ Mode Développeur.

### Actions
- **↺ Valeurs par défaut** : remet **les réglages de CE plan** (échelle, podomètre, point de départ, navigation intelligente, Nord) aux valeurs du plan et replace le suivi au départ — **confirmation demandée**. Les réglages de l'accueil ne bougent pas. Différent de **💥 Tout réinitialiser** dans ⚙️ Configuration, qui purge tout.
- **Fermer** (ou Échap, ou ✕) — rien à valider.

> ⚠️ **Pour activer / modifier le code d'accès local (PIN / Face ID)**, il faut passer par **⚙️ Configuration sur la page d'accueil** — la section 🔐 Code d'accès local n'est PAS dans ⚙️ Réglages (par design — réglage critique global, pas par plan).

### 🎯 Calibrer l'échelle

Si l'appli te donne une distance différente de la réalité (par exemple 100 m affichés alors que tu sais qu'il y a 150 m sur le terrain) :

1. Mesure la distance dans l'appli avec **📐**
2. Ouvre **⚙️ → 🎯 Calibrer**
3. Saisis la **distance affichée** (100) et la **distance réelle** (150)
4. La nouvelle échelle s'affiche en temps réel
5. Clique **Appliquer** → la valeur est injectée dans le champ Échelle **et enregistrée aussitôt** (plus rien à valider)

> Plus tu calibres sur une longue distance, plus le résultat sera précis.

---

## 🏷️ Badge version dans le footer (chargeur)

Au bas du chargeur, à côté de la mention de licence, un petit **badge version** affiche la version actuelle de l'application installée.

**Deux états visuels** :

| État | Affichage | Action au clic |
|---|---|---|
| **Vous êtes à jour** | numéro de version en gris discret | Modale "✅ Déjà à jour" — affiche la version installée + date de publication + **notes de cette version** (changelog) |
| **Mise à jour disponible** | `version installée → nouvelle version` en **bleu clignotant** | Modale "🔔 Mise à jour disponible" — propose une mise à jour douce (préserve plans et sessions) ou un reset complet |

Quand une nouvelle version est dispo, le badge **clignote en bleu** pour attirer l'attention sans agresser visuellement. Au clic, vous pouvez choisir d'agir immédiatement (mise à jour douce ou reset complet) ou de remettre à plus tard (snooze 24h).

> 💡 Le badge bypasse le snooze 24h : si vous avez cliqué "Plus tard" il y a quelques minutes mais que vous changez d'avis, cliquez le badge pour relancer la modale de mise à jour.

> 💡 Si vous êtes déjà à jour, cliquer le badge affiche tout de même les notes de la dernière version — pratique pour relire ce qui a été changé dans la mise à jour que vous avez installée.

---

## 🔐 Code d'accès local (PIN / Face ID)

Verrouille l'app à chaque démarrage avec un PIN 4-6 chiffres, **Face ID** ou **Touch ID** si ton appareil le supporte. 100 % local — aucun mot de passe n'est envoyé sur Internet, aucune récupération possible en cas d'oubli.

> ⚠️ **C'est une barrière d'usage, pas un chiffrement des données.** Le verrouillage empêche l'ouverture normale de l'app, mais un attaquant motivé peut le contourner avec les outils de développement du navigateur. Les photos et sessions restent stockées en clair dans le navigateur. C'est exactement le même niveau de sécurité que le code d'accès communautaire existant — assumé honnêtement.

### Activer le PIN

1. Depuis la page d'accueil (chargeur) → bouton **⚙️ Configuration** en haut à droite
2. Descends à la section **🔐 Code d'accès local**
3. Clique **🔐 Activer le code d'accès**
4. Choisis ton code (4 à 6 chiffres) puis confirme-le une seconde fois
5. Si ton appareil supporte la biométrie (iPhone Face ID, iPad Touch ID, Android empreinte, Windows Hello…) une demande "Activer aussi la biométrie ?" apparaît. Accepter = au prochain démarrage tu déverrouilles d'un coup d'œil ou d'un doigt (sans saisir le code)

> 📝 **Note bien ton code** quelque part de sûr. Aucune récupération n'est possible en cas d'oubli — tu serais obligé de tout réinitialiser (perte session + plans non mémorisés).

### Au prochain démarrage de l'app

L'écran de verrouillage apparaît automatiquement après le splash :

- **Avec biométrie** : la demande Face ID / Touch ID apparaît immédiatement. Tu peux aussi annuler et saisir ton PIN à la place.
- **Sans biométrie** : tu saisis directement ton PIN via le clavier numérique. Le dernier chiffre saisi est visible 0,5 s puis remplacé par ● (pattern iOS).

### Modifier le PIN

⚙️ Configuration → 🔐 Code d'accès local → **✏️ Modifier le code**. Validation par biométrie OU code actuel, puis saisie du nouveau PIN 2 fois.

### Désactiver le PIN

⚙️ Configuration → 🔐 Code d'accès local → **🔓 Désactiver**. Confirmation par biométrie OU code actuel. L'app ne demande plus de code au démarrage suivant.

### Verrou temporaire : 5 codes faux

Après **5 codes incorrects à la suite**, l'app se verrouille **temporairement** : 10 min la première fois, puis 1 h, 6 h et 24 h à chaque nouvelle série de 5 erreurs. Un compte à rebours s'affiche et le pavé revient tout seul à la fin du délai ; un code juste remet tout à zéro. Il n'y a **aucun bouton de reset** sur cet écran et aucune récupération du code en cas d'oubli — si tu l'as vraiment perdu, il reste **💥 Tout réinitialiser** depuis l'écran d'accueil (perte de la session en cours et des plans non mémorisés). Le délai suit l'horloge du téléphone.

> Les biométries ratées ne comptent **pas** dans les 5 tentatives — la spec WebAuthn gère son propre lockout natif côté device. Tu peux annuler un Face ID par erreur sans craindre d'épuiser tes essais.

---

## 🔧 Réinitialiser

En cas de problème ou pour forcer une mise à jour, utilisez **⚙️ Configuration (page d'accueil) → 💥 Tout réinitialiser**. Cette action retire le composant hors-ligne (Service Worker) et le Service Worker, vide le cache et recharge l'application.

> ⚠️ Effectuez cette action uniquement avec une connexion Internet disponible. Sans réseau, l'application sera inutilisable jusqu'au prochain rechargement complet.

---

## 🐳 Self-host avec Docker

Si tu veux faire tourner MyKTAMap **sur ton propre matériel** (PC, Raspberry Pi, NAS, serveur dédié) — pour l'avoir disponible sur ton réseau local, garantir le 100 % offline, ou simplement par curiosité — il existe désormais une **image Docker prête à l'emploi**.

### En une commande

```bash
docker run -d --name myktamap -p 8443:8443 ghcr.io/karmakta91/myktamap:latest
```

Puis ouvre **`https://localhost:8443/`** dans ton navigateur. Au premier accès, ton navigateur va t'avertir d'un **certificat non reconnu** (c'est normal, l'image génère un certificat auto-signé au démarrage). Clique sur **« Paramètres avancés » → « Continuer vers localhost »** pour accepter, et l'app s'affiche.

### Multi-plateforme

L'image est buildée pour 2 architectures :
- **amd64** (PC Intel/AMD desktop ou serveur)
- **arm64** (Raspberry Pi 4/5 en 64-bit, Synology ARM, Apple Silicon)

Docker détecte automatiquement la bonne version au `pull`.

### Bonus : tes propres plans

Pour persister tes plans entre les redémarrages du conteneur :

```bash
docker run -d --name myktamap \
  -p 8443:8443 \
  -v /chemin/vers/tes/plans:/usr/share/nginx/html/data/plans \
  ghcr.io/karmakta91/myktamap:latest
```

### Bonus : ton propre certificat TLS

Si tu as un certificat valide (Let's Encrypt avec un domaine local, autorité interne, etc.), tu peux le monter en volume au lieu d'utiliser celui auto-signé :

```bash
docker run -d --name myktamap \
  -p 8443:8443 \
  -v /chemin/vers/tes/certs:/etc/nginx/certs \
  ghcr.io/karmakta91/myktamap:latest
```

Le volume doit contenir `server.crt` + `server.key`.

### Bonus : accès via un nom de domaine local

```bash
docker run -d --name myktamap \
  -p 8443:8443 \
  -e MKM_HOSTNAME=myktamap.local \
  ghcr.io/karmakta91/myktamap:latest
```

Le certificat auto-signé inclura `myktamap.local` dans les noms autorisés. Pratique si tu as un DNS local (Pi-hole, AdGuard Home) qui résout ce nom vers ton hôte.

### Mises à jour

Pour passer à une nouvelle version :

```bash
docker pull ghcr.io/karmakta91/myktamap:latest
docker stop myktamap && docker rm myktamap
docker run -d --name myktamap -p 8443:8443 ghcr.io/karmakta91/myktamap:latest
```

Tu peux aussi **pinner** une version exacte au lieu de `latest` :
- `ghcr.io/karmakta91/myktamap:v1.36.0` — cette version exacte, immutable
- `ghcr.io/karmakta91/myktamap:1.36` — dernier patch de la 1.36.x
- `ghcr.io/karmakta91/myktamap:1` — dernier minor de la 1.x

### Limites

- **Service Worker + certificat auto-signé** : certains navigateurs (Chromium, Safari) refusent d'installer le Service Worker si le certificat n'est pas reconnu. Si l'app fonctionne mais semble "ne pas se cacher" pour le mode offline, accepte l'avertissement de sécurité d'abord, puis recharge.
- **Conflit de ports** : si tu as déjà un autre service sur `8443` côté hôte, change le mapping : `-p 9443:8443` par exemple.
- **Pas de mises à jour automatiques** : tu décides quand `docker pull`. Pour de l'auto-update, regarde [Watchtower](https://github.com/containrrr/watchtower).

> 🔒 **Aucune donnée envoyée ailleurs**. L'image embarque l'app vanilla, exactement comme la version officielle, mais servie depuis ton propre matériel. C'est même un peu plus offline-friendly que la prod (pas de fetch occasionnel vers `gstatic.com` pour le ping de connectivité — l'audit réseau reste actif si tu veux vérifier).

> 📖 **Tu n'as jamais utilisé Docker ?** Un guide pas-à-pas dédié existe : **[`docs/applications/DOCKER_INSTALL.md`](DOCKER_INSTALL.md)** — installation Docker Desktop (Windows/Mac/Linux), démarrage du daemon, troubleshooting des erreurs courantes (cert auto-signé, conflits de port, WSL 2), alternatives sans Docker.

> 📚 **Détails techniques** : voir `docs/architecture/docker-selfhost.md` dans le dépôt GitHub.

---

## 🆘 En cas de problème

**Le plan ne se charge pas**
Vérifiez que `plan-config.json` est bien à la racine de votre archive ZIP, et que tous les fichiers référencés sont présents.

**L'image du plan est floue**
Selon le preset choisi, la résolution de travail est réduite (`Performance` plus que `Équilibré`, qui est plus que `Qualité`). Si votre appareil a assez de mémoire, basculez en **🌟 Qualité** au prochain chargement pour une image plus nette.

**Le tracker dérive trop vite**
Recalez votre position fréquemment. Ajustez l'échelle et la taille du pas dans les réglages.

**L'application crash sur Mobile avec un JPEG volumineux**
Choisissez **⚡ Performance** dans le sélecteur Mode performance avant de charger le plan.

**Un mode reste actif sans le vouloir**
Appuyez à nouveau sur le bouton actif (en vert) pour le désactiver.

**L'application ne se met pas à jour après une nouvelle version**
Utilisez **⚙️ Configuration (page d'accueil) → 🔄 Forcer la mise à jour** (mise à jour douce, conserve toutes vos données). Si insuffisant : **⚙️ Configuration → 💥 Tout réinitialiser** (purge totale, dernière option). La mise à jour douce est rapide grâce à un pré-téléchargement en arrière-plan.

**📡 App bloquée après une mise à jour douce**
Si après une mise à jour l'app reste coincée (loader sans CSS, page blanche, assets mal chargés), la cause la plus fréquente est un **edge CDN GitHub Pages qui sert un contenu corrompu** (mauvais MIME, asset tronqué) pour la zone géographique courante. Premier réflexe avant tout reset : **désactive ton VPN s'il est actif et change de réseau** (4G ↔ Wi-Fi ↔ autre Wi-Fi). Le simple fait de basculer d'IP/edge CDN suffit souvent à débloquer.

**🆘 Reset d'urgence sans toucher aux données**
Si l'app est totalement coincée même après changement de réseau, deux options préservant tes plans / sessions / photos / prefs :

1. **Kill switch URL** : ouvre dans un **onglet privé** Chrome/Safari (PAS la PWA) :
   ```
   https://myktamap.fr/?killsw=1
   ```
   → désinscrit le Service Worker + vide tous les caches HTTP/PWA → message succès → reload normal.

2. **Page de reset autonome** : si l'URL ne suffit pas (cache HTML coincé) :
   ```
   https://myktamap.fr/killsw.html
   ```
   → page standalone 100 % inline (CSS/JS), zéro dépendance, fonctionne même si tout le reste de l'app est cassé. Affiche 3 étapes (SW désinscrit, caches purgés, prêt à recharger) + bouton "🚀 Recharger l'app".

> ⚠️ Ces deux outils **ne suppriment AUCUNE donnée utilisateur** (plans mémorisés, sessions per-plan, photos POI, photos Mode Secours, backups, préférences). Ils ne purgent que le cache des fichiers de l'app (HTML / CSS / JS / icônes). En cas de doute, **📤 Exporter le profil** AVANT pour avoir un backup.

**Problème non résolu**
Ouvrez **⚙️ → 🐛 Logs**, copiez les journaux et transmettez-les à l'équipe technique.

---

## 📖 Le topo

> *Une carte n'a jamais remplacé la sortie. Elle aide juste à ne pas se perdre.*

### D'où ça vient

MyKTAMap est née d'un besoin simple : avoir, **dans la poche**, une carte cataphile **fiable, hors-ligne, et qui ne fuite pas**. Pas un app store qui demande l'accès à tes contacts pour afficher un plan. Pas un site qui te traque dès que tu cliques. Pas un cloud qui décide demain de t'envoyer une newsletter ou de revendre tes traces.

Juste un fichier `.zip` qui contient le plan, ouvert dans un onglet de navigateur, qui marche **sans réseau**, et qui te laisse **entièrement le contrôle** sur ce que tu fais avec.

### À qui ça s'adresse

À celles et ceux qui descendent. Cataphiles parisiens, spéléos amateurs, urbexeurs prudents, secouristes formés au milieu souterrain, chercheurs en patrimoine — bref, à toute personne qui a un usage **légitime et respectueux** de ces lieux et qui veut un outil qui ne mette personne en danger (ni les gens ni les lieux).

L'app n'a **aucune ambition de remplacer** les vieux plans papier annotés, les sorties guidées par les anciens, la transmission orale, la mémoire collective. Elle vient **en complément**, comme un calque numérique qu'on superpose à ces savoirs — pas un substitut.

### La philosophie

- 🌐 **100 % hors-ligne par défaut** — l'app fonctionne sans réseau une fois le plan chargé. Tu peux la lancer en avion, dans le métro, ou à 30 m sous terre.
- 🔒 **Zéro télémétrie** — aucun service tiers n'est appelé pour te suivre. Le seul fetch externe possible est la mise à jour du code de l'app (et tu peux le couper). L'auditeur peut vérifier dans `🔒 Audit réseau`.
- 📦 **Propriété des données** — tes annotations, tes photos, tes mesures sont stockées **localement**, dans le navigateur. Personne d'autre que toi n'y a accès. Tu peux tout exporter à tout moment (`💾 Enregistrer session`) et tout effacer en 2 clics (`💥 Tout réinitialiser`).
- 🤝 **Code ouvert** — la licence est `CC BY-NC-SA 4.0`. Tu peux lire le code, l'auditer. Pas de boîte noire, pas de marketing.
- ⚖️ **Discrétion = respect** — un plan partagé n'importe comment, c'est un lieu fragilisé. L'app ne contient aucun plan par défaut ; c'est à chaque utilisateur de charger les siens, et de **ne pas les diffuser** au-delà du cercle de confiance.

### Ce que l'app n'est pas

- ❌ **Pas un GPS sous terre** — la géolocalisation native ne marche pas sous roche. Le « tracker » de l'app est un **podomètre + direction** qui dérive vite ; il faut recaler régulièrement.
- ❌ **Pas une garantie de sécurité** — la carte donne le chemin, pas l'oxygène. Tu restes seul·e juge des risques (effondrements, eau, gaz, fatigue).
- ❌ **Pas un annuaire** — l'app ne référence pas les lieux. Elle affiche ce que tu lui donnes, point.
- ❌ **Pas un réseau social** — pas de compte, pas de profil, pas de partage en un clic. Tu choisis à qui tu envoies ton `.zip`, et comment.

> Si tu cherches une appli grand public clé-en-main avec des avis et des étoiles, ce n'est pas ici. Si tu cherches un outil qui te laisse maître de tes données et de ton anonymat sous terre, **bienvenue**.

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
- 🌍 **[OpenStreetMap](https://www.openstreetmap.org/) & ses contributeurs** — sous licence **[ODbL](https://opendatacommons.org/licenses/odbl/)** pour les données et **[CC BY-SA 2.0](https://creativecommons.org/licenses/by-sa/2.0/)** pour la cartographie. Données cartographiques mondiales affichées dans la **Vue OSM** (modale plan + widget HOME) **uniquement quand tu l'actives via l'opt-in dédié**. L'app affiche l'attribution `© OpenStreetMap contributors` dans le coin de chaque carte OSM, **comme la licence ODbL l'exige**. Hébergement des tuiles : **[OSM Foundation](https://wiki.osmfoundation.org/wiki/Privacy_Policy)** (fondation non-commerciale, politique de logs publique, pas de tracking publicitaire). Sans ce bien commun monumental — bâti depuis 2004 par des **milliers de bénévoles** qui cartographient le monde rue par rue — la Vue OSM n'existerait pas.
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

*MyKTAMap — Guide Utilisateur*
*Ces lieux sont fragiles. La discrétion est une forme de respect.*
