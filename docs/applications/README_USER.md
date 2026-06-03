# 📗 MyKTAMap — Guide Utilisateur

> Ce guide est destiné aux utilisateurs de l'application. Il explique comment utiliser chaque fonction, comment préparer votre téléphone pour une sortie terrain, et rappelle les règles essentielles concernant la discrétion des données.

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

---

### 🌐 Migration vers `myktamap.fr`

L'application change de domaine officiel. À partir du **15 juillet 2026**, la nouvelle adresse sera **`myktamap.fr`** (au lieu de l'actuelle `myktamap.fr`).

**Comment es-tu informé ?**

Une **alerte info permanente** (badge 🚨 bleu) est diffusée via le système d'alertes publiques. Tu la consultes quand tu veux en cliquant sur le badge 🚨 dans le header du loader. L'alerte affiche la date de coupure + la checklist complète des données à exporter avant migration.

**Que faire pour migrer mes données ?**

Tes données (liste de plans, sessions, préférences) sont **liées au domaine** (règle de sécurité web — origins isolés). Elles ne suivront PAS automatiquement. Tu dois agir avant la coupure :

1. **📚 Exporte ta liste de plans** : dans le loader, section **📚 Mes plans** → bouton **💾** → télécharge un fichier `.config` qui contient tous tes plans enregistrés (métadatas + références). Sur le nouveau domaine, tu importeras ce `.config` via le bouton **📂** au même endroit.
2. **💾 Exporte tes sessions** : sur chaque plan ouvert, utilise **💾 Sauvegarde session** (Full ou Avancé) → télécharge un `.json` par session (annotations, tracés, zones, points perso en cours).
3. **📦 Garde tes ZIPs de plans** que tu avais importés. Les blobs locaux stockés dans le navigateur ne sont pas exportables — il faudra ré-importer les ZIPs manuellement sur le nouveau domaine via le drag-and-drop habituel.
4. **Au 15 juillet 2026** : va sur `myktamap.fr` → importe le `.config` de liste de plans + ré-importe les ZIPs + importe les `.json` de session sur chaque plan correspondant.
5. **📱 Si tu avais installé l'app sur ton écran d'accueil** (PWA) : tu devras supprimer l'ancienne icône manuellement puis réinstaller depuis `myktamap.fr` (les origins étant différents, l'icône installée pointe sur l'ancien domaine).

**Pendant la transition (jusqu'au 15 juillet 2026)** : les 2 domaines fonctionneront en parallèle. Tu peux continuer à utiliser ce site comme avant, et migrer à ton rythme.

**Après le 15 juillet 2026** : l'ancien domaine affichera une page de transition qui te redirigera automatiquement vers `myktamap.fr`. La PWA installée se désactivera automatiquement à son prochain check de mise à jour (≤24h après la coupure).

---

## 🚀 Premiers pas

### 🗝️ Accès restreint — Code communautaire

L'application est protégée par un **mot de passe unique commun** à tous les utilisateurs autorisés. Le code te sera communiqué par l'auteur (forum, message direct, etc.).

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

### 👤 Profil utilisateur

Un **bandeau profil** s'affiche en haut de l'écran d'accueil, juste sous le header. Il regroupe ton identité visuelle et des statistiques configurables sur ton usage de l'app.

**Ce que tu vois sur le bandeau** :

- **Avatar** : photo perso (carrée, ~64 px) OU initiale colorée auto-générée si pas de photo. La couleur de l'initiale est choisie déterministiquement (via hash djb2 du surnom) parmi une palette de 10 couleurs de la charte — ton avatar reste donc visuellement stable d'une session à l'autre tant que tu ne changes pas de surnom.
- **Surnom** : ton pseudo (modifiable). Par défaut "Cataphile" au premier lancement.
- **Stats compactes** *(visibles dès que l'écran fait ≥ 380 px de large)* — désormais **configurables** depuis la modale Profil (voir plus bas). Par défaut :
  - ⏱️ **Temps de session** : durée écoulée depuis le démarrage de l'app sur cette session
  - 💾 **Sauvegarde** : taille réelle des données MyKTAMap stockées localement (voir plus bas)

> 💡 **Charte light theme** : en mode clair, le fond du bandeau profil s'aligne sur les cards "Mes plans" pour une intégration visuelle propre.

**Modifier ton profil** :

Clic sur le bandeau profil → modale **👤 Mon profil** :

- **✏️ Surnom** : tape ce que tu veux (lettres / chiffres / espace). Sert uniquement à personnaliser l'affichage local.
- **📷 Photo** : choisis une image depuis ta galerie. L'app la **compresse automatiquement** (512 px côté long max, JPEG qualité 88 %) avant stockage IndexedDB pour ne pas saturer ton quota navigateur.
- **🗑️ Reset profil** : bouton de remise à zéro (modale de confirmation charte — pas de `confirm()` natif système). Vide le surnom + photo + compteurs.

#### 📊 Grid stats

La modale Profil affiche **6 cells de stats globales** :

| Cell | Description |
|---|---|
| 🗂️ **N plans** | Nombre de plans dans ton registre (serveur + locaux) |
| 💾 **N sessions** | Nombre total de sessions sauvegardées (per-plan slots) |
| ⭐ **N favoris** | Nombre cumulé de points marqués favoris, tous plans confondus |
| 📦 **N snapshots** | Nombre de snapshots de session backups en IndexedDB (max 10 FIFO) |
| 📸 **N photos POI** | Nombre de photos attachées à des points + taille totale |
| 💾 **N MB sauvegarde** | **Taille réelle des données MyKTAMap** (localStorage avec préfixe MyKTAMap + 6 stores IndexedDB connus). Hors Cache PWA volatile (qui n'est pas une donnée user). |

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

- **Calcul ciblé MyKTAMap** : on additionne uniquement les entrées localStorage avec préfixe `myktamap_*` + les 6 stores IndexedDB connus de l'app (handles, blobs, backups, photos, etc.). Le Cache PWA volatile (qui contient le code JS/CSS de l'app et n'est PAS une donnée user) est **exclu** du calcul.
- **Cache 30 s** : le calcul est cumulé puis mis en cache 30 secondes pour ne pas réinterroger IndexedDB en boucle quand tu ouvres/fermes des modales rapidement.
- **Tooltip** : "Taille des données MyKTAMap (LS + IDB)" + précision "hors Cache PWA".

Résultat : la valeur est **stable, prévisible, et reflète vraiment ce que tu as cartographié**.

**Import / export du profil** :

Ton profil est inclus dans l'**Export Avancé** des sessions (onglet 🎨 Avancé → section "Identité user"). Pratique pour transférer ton identité visuelle vers un autre appareil. À l'import d'un profil :

- Un toast modal te suggère un **reload** de la page pour que l'avatar et le surnom soient correctement mis à jour partout dans l'UI (header, sidebar, etc.)

> 🔒 **100 % local** : ton surnom et ta photo restent dans ton navigateur (IndexedDB). Rien n'est envoyé à un serveur. L'export profil est explicite et contrôlé par toi.

#### 💼 Édition pro — importer une licence

Si l'auteur t'a remis un fichier **`Licence-pro.json`** (par mail, canal privé, etc.) suite à une demande de licence professionnelle, tu peux l'**importer directement** dans ton navigateur depuis la modale profil pour activer l'édition pro **sur cet appareil uniquement**.

**Section dédiée dans la modale Mon profil** :

- **Si tu es en mode communautaire** (état par défaut) : un bouton **📂 Importer une licence pro** apparaît. Au clic, file picker `.json` → tu sélectionnes ton fichier → validation immédiate → toast de confirmation. Le mode pro est activé : le footer du loader bascule (✓ Licence pro active), le splash affiche « Édition professionnelle », les écrans gates retirent le lien « Licence pro » (redondant désormais).
- **Si une licence locale est active** : un bouton **🗑️ Retirer la licence locale** permet de revenir au mode communautaire. La licence reste disponible dans le fichier original si tu veux la ré-importer plus tard.
- **Si une licence serveur est active** (instance déployée par un admin avec `Licence-pro.json` à la racine du serveur) : badge ✓ seul, pas de bouton — c'est l'administrateur du serveur qui décide.

**Format du fichier** : JSON minimum `{"instance":"pro","license_hash":"MKTM-LIC-..."}`. Si le hash est manquant ou mal formé (regex stricte `MKTM-LIC-` + 32 caractères hexadécimaux), le fichier est refusé avec message d'erreur.

**🆕 Voie d'accès au premier chargement** : si tu installes MyKTAMap pour la première fois sur un nouvel appareil (= écran de saisie du **code communautaire** au boot), sous le formulaire du code tu trouveras désormais un second bloc séparé par « ou » avec un bouton **📂 Importer ma licence pro**. Au clic, file picker `.json` → tu sélectionnes ton fichier → si OK l'app entre **direct en mode pro** (pas besoin de saisir le code communautaire). Pratique pour les utilisateurs pro qui découvrent l'app : pas besoin de demander le code communautaire à un tiers, la licence pro est un canal d'accès légitime en soi.

> 🔒 **100 % local** : le fichier de licence est lu par le navigateur via `FileReader` puis persisté dans `localStorage`. Il n'est **jamais envoyé à un serveur**, jamais transmis. Aucune connexion réseau n'est ajoutée.

> ⚖️ **Valeur juridique** : le hash `MKTM-LIC-...` qui figure dans le fichier est **nominatif** — lié à un contrat précis entre l'auteur et le titulaire de la licence. **Sa reproduction ou son partage à un tiers non autorisé constitue une infraction contractuelle** (l'auteur peut faire valoir ses droits). Le mécanisme côté navigateur reste cosmétique : il ne vérifie pas cryptographiquement le hash, c'est la signature du contrat qui fait foi.

### 📚 Gestion de votre liste de plans

L'application mémorise tous les plans que vous chargez, qu'ils viennent du serveur ou de votre disque local.

**Sur l'écran d'accueil :**

| Symbole | Signification |
|---|---|
| 🌐 | Plan serveur (sous-dossier de `data/`) |
| 💾 | Plan ZIP local |
| ✅ | Plan local **mémorisé dans l'app** (rechargement instantané, fonctionne hors-ligne) |
| 🔐 | Plan local avec **accès permanent autorisé** (Chrome/Edge desktop) |
| 📁 | Plan local sans persistance — re-sélection requise au chargement |

**Actions disponibles** sur chaque ligne (3 boutons) :

- **ℹ️** — ouvre une fenêtre **Infos détaillées** sur cette archive (id interne, nom, version, auteur, type, fichier source, taille, persistance, mode V1/V2/multi-niveau, préset performance, dates d'ajout et d'ouverture). Pratique pour vérifier ce que l'app sait du plan sans le charger.
- **▶️** — charge le plan
- **✕** — retire le plan de la liste (ne supprime pas le fichier ZIP sur votre disque, juste l'entrée dans la liste)

**Boutons en haut de la liste :**

- **💾 Exporter ma liste** — télécharge un fichier `myktamap_plans_AAAAMMJJ.config` que vous pouvez sauvegarder ou partager.
- **📂 Charger une liste** — importe un fichier de liste précédemment exporté. Trois choix : Remplacer, Fusionner, ou Annuler.

**Filtre d'affichage** :

- **🌐 Afficher les plans serveur** — cochez/décochez ce toggle au-dessus de la liste pour masquer les plans serveur découverts automatiquement (test1, test2, démos…) et ne voir que vos plans persos. **Préservé** entre les sessions (localStorage). Décocher ne supprime rien — recocher → les plans réapparaissent intacts.

> 💡 **Astuce** — Si vous changez de PC ou de téléphone, exportez votre liste sur l'ancien appareil puis importez-la sur le nouveau pour retrouver tous vos plans en un clic. Note : les autorisations d'accès aux fichiers ne sont pas portables (vous devrez re-sélectionner les ZIP locaux la première fois sur le nouvel appareil). À la re-sélection, si vous fournissez un ZIP dans un autre mode (ex: vous aviez ce plan en V2 mais le ZIP est un V1), un message d'avertissement vous le signale clairement avant de continuer.

### 🔐 Éviter de re-sélectionner le ZIP à chaque ouverture

Selon votre plateforme, deux options de persistance s'affichent sous la zone d'import :

#### Sur Chrome / Edge (PC)

Cliquez sur **🔐 Autoriser l'accès permanent au fichier**. Le navigateur retient une référence vers votre ZIP. Aux prochaines ouvertures du plan depuis votre liste, le rechargement se fait en **0 ou 1 clic** (Chrome peut redemander une confirmation rapide après un redémarrage du navigateur).

#### Sur mobile, Firefox, Safari

L'option **💾 Mémoriser ce plan dans l'app** est **cochée par défaut**. Le ZIP est copié dans l'espace local du navigateur. Aux prochaines ouvertures :

- **0 clic**, le plan se charge directement
- Fonctionne **hors-ligne** (le ZIP est dans le navigateur, pas besoin de retrouver le fichier)
- Recommandé sur **mobile**

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

1. **🖼️ Tiling de l'image (par plan)** — segmented control 5 presets (voir détail ci-dessous), qui choisit comment l'image principale est découpée en mémoire au chargement. Mémorisé **par plan** (un plan en Performance, un autre en Qualité, etc.).

2. **🚀 Mode Performance ULTRA (tracés / markers)** — 7 toggles d'optimisation qui ne touchent **PAS** à l'image (déjà couvert par le Tiling ci-dessus) mais à tout le reste (polylines, popups, intersections, auto-save, viewport culling, limite dézoom mobile). Préférence **globale**, conservée entre sessions. Voir section "🚀 Optimiser ton plan" plus bas pour le détail.

3. **🛠️ Debug** — toggle **🐛 Logs détaillés** (verbose mode) **+ bouton 📋 Afficher les logs** qui ouvre directement la modale buffer des logs capturés. Utile pour consulter les logs sans avoir à charger un plan d'abord (ex : si tu cherches à diagnostiquer un bug bloquant au chargement).

4. **🔒 Confidentialité & Audit** — section dédiée à la transparence : journal réseau live, doc « Que fait l'app sur le réseau ? », et toggle « Mode hors-ligne strict ». Voir section dédiée plus bas.

5. **🎨 Affichage** — toggles d'interface :
   - **⚪ Afficher les ronds aux intersections de tracés** — affiche un cercle plein coloré au croisement de 2 tracés. Décocher pour aérer visuellement les plans très denses. Effet immédiat.
   - **🔆 Garder l'écran allumé** — empêche la mise en veille automatique de ton écran tant que MyKTAMap est ouvert (Wake Lock API). Utile en sortie cataphile pour ne pas avoir à toucher le tel toutes les 30 sec. Re-acquisition auto au retour d'arrière-plan (visibilitychange). Toggle masqué automatiquement sur les navigateurs qui ne supportent pas l'API (Firefox notamment). Le même toggle est aussi accessible dans **⚙️ Réglages** en mode carte (cf section dédiée).

6. **📚 Plans serveur** — checkbox **"🚫 Ne pas charger les plans serveur au démarrage"** :
   - **Désactive l'auto-discovery** du fichier `data/index.json` au boot de l'app — l'app ne va plus interroger le serveur pour lister les plans de démo ou les plans publics hébergés.
   - **Masque le toggle "🌐 Afficher plans serveur"** du home (devient inutile puisqu'il n'y a plus rien à afficher).
   - **Exclut les plans `type === "server"` des stats agrégées** de la modale Profil → ne fausse plus le count "Plans visités" avec des plans que tu n'utilises jamais.
   - **Reload requis** pour effet complet (l'auto-discovery se fait au splash, pas en cours de session).
   - **Default OFF** (rétrocompatibilité absolue — l'app continue d'auto-découvrir les plans serveur tant que tu n'as pas explicitement coché cette case).

   > 💡 **Cas d'usage** : tu utilises MyKTAMap uniquement avec tes propres plans locaux et tu ne veux pas voir les plans de démo / tests du serveur qui polluent ta liste. Coche cette case → reload → ta liste 📚 Mes plans ne contient plus que TES plans.

7. **🔐 Code d'accès local (PIN / Face ID)** — verrouille l'app à chaque démarrage par un code 4-6 chiffres + Face ID / Touch ID si l'appareil le supporte. 100 % local (jamais envoyé sur Internet). 5 tentatives ratées = lockout définitif. Aucune recovery en cas d'oubli. Voir section dédiée **🔐 Code d'accès local (PIN / Face ID)** plus bas pour le détail complet (activation, modification, désactivation, lockout).

8. **🔄 Mise à jour — Forcer la mise à jour douce** — re-télécharge la dernière version du code (purge du cache PWA, garde tes données et tes plans). Utile si tu suspectes que ton app reste sur une vieille version après une release. Ne touche **jamais** à tes plans, ta session active, ton code communautaire ni ton PIN local. **Confirmation obligatoire avant déclenchement** (modale bleue qui détaille ce qui est préservé + besoin d'une connexion Internet active).

9. **💥 Tout réinitialiser (reset complet)** — purge totale (cache + localStorage + IndexedDB + plans). Reset le code d'accès communautaire **ET** le PIN local si configuré. **Double confirmation requise.** Action irréversible.

**Organisation** : **tout est regroupé dans une seule modale ⚙️ Configuration**, accessible depuis le header du loader. Le bouton 🏗️ Générer un plan reste visible directement dans la home (pas dans la modale Configuration) car c'est une action de création, pas un réglage.

### 🎚️ Mode performance — 5 presets

Le bloc **Mode performance** dans le chargeur permet de choisir comment afficher votre plan, avec 5 modes présentés comme un sélecteur (à la manière du DLSS dans les jeux vidéo) :

| Bouton | Pour quel cas ? |
|---|---|
| 💤 **Désactivé** | **Aucun découpage du tout.** Image affichée brute (qualité native, mais ⚠️ peut planter sur mobile pour les très gros plans). À utiliser uniquement si vous savez que votre appareil tient. |
| 🔄 **Auto** *(défaut)* | L'app décide selon la taille du fichier — activé si le plan dépasse 60 Mo. **Recommandé pour la plupart des cas.** |
| 🌟 **Qualité** | Plans très détaillés à zoomer profondément. **Recommandé sur PC desktop** avec assez de RAM. Image plus nette. |
| 🎯 **Équilibré** | Compromis entre netteté et fluidité. Reproduit le mode "Performance" historique de l'app. |
| ⚡ **Performance** | **Mobile faible**, plans très lourds, urgence terrain. Image un peu plus floue mais charge bien plus vite. |

Cliquez sur un bouton avant de charger — la description sous le sélecteur change pour vous expliquer ce qu'il fait.

**Le réglage est mémorisé pour chaque plan** : si vous chargez un plan en "Performance", la prochaine fois que vous l'ouvrirez via 📚 Mes plans, il s'ouvrira directement en "Performance". Pour changer le réglage d'un plan déjà mémorisé, ré-importez son ZIP en sélectionnant un autre mode dans le sélecteur.

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
  - **En landscape mobile**, les sous-menus se déplient **horizontalement vers l'intérieur de l'écran** (plus ergonomique sur tablette/smartphone en paysage). Le zoom +/- reste vertical (convention universelle).
- **🧭 Boussole d'orientation** :
  - En portrait : en **bas-gauche** au-dessus du footer
  - En landscape : en **bas-centrée** (pour ne pas cacher les icônes latérales)
- **Boutons ≡ de réduction** en haut de chaque sidebar (▾ déployé, ▸/◂ replié) — gagne de la place sans arrêter les modes actifs
- **Modale "Détails de la session"** : un clic sur les compteurs du header ouvre une vue d'ensemble :
  - Tous tes points (avec tag, coordonnées, niveau si multi-niveau)
  - Tracés groupés par type (Principal/Secondaire/Chemin/Jonction) avec compteur + distance totale par type
  - Zones groupées par type
  - Mesures actives (📐 mesure simple, 🗺️ itinéraire avec waypoints, 🧭 tracker)
- **Modale "Changer de plan" refondue** : carte highlight du plan en cours avec badge `● ACTIF`, liste des plans récents avec animation au survol, gros bouton bleu "📚 Voir tous mes plans" en bas
- **Générateur de plan retiré du mode carte** : reste accessible **uniquement depuis la home** via 🏗️ Générer un plan (création hors du mode carte)

### 💾 Sauvegarde automatique de votre session

Vos **annotations en cours** (points ajoutés, tracés, zones, mesures) sont automatiquement sauvegardées en arrière-plan toutes les ~1,5 secondes. Ainsi, si vous fermez l'application et la rouvrez via **▶️ Reprendre**, votre travail est restauré.

**Comment ça marche :**
- À chaque modification, votre session est sauvegardée dans le navigateur (un seul "slot" — la session courante remplace la précédente)
- Au prochain lancement, si vous cliquez sur **▶️ Reprendre [nom du plan]**, votre session est restaurée — une **fenêtre centrée** vous confirme avec le détail (*"3 points · 1 tracé · 2 zones"*)
- La fenêtre vous propose deux actions : **🗑️ Effacer la session** (commencer ce plan avec une session vierge) ou **✓ Continuer** (garder la session restaurée). Cliquer en dehors ou appuyer sur Échap = Continuer.

**Important :**
- Si vous **chargez un autre plan** entre deux ouvertures, la session précédente est perdue (un seul slot, dernière session active "gagne")
- Le **chemin du tracker** n'est pas restauré (le tracker étant expérimental, ressusciter une trail figée serait trompeur)
- Le **💥 Tout réinitialiser** efface aussi votre session sauvegardée
- Pour conserver une session importante au-delà de l'auto-save, utilisez **⬆️ Exporter la session JSON** (sauvegarde explicite que vous pouvez ré-importer plus tard)

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

L'application utilise un **Service Worker** qui met en cache automatiquement tous les fichiers nécessaires (interface, images, données). Au premier chargement avec connexion Internet, tout est sauvegardé localement.

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
- **📁 Re-sélectionner le ZIP** (plans locaux) — ouvre votre explorateur de fichiers pour retrouver le ZIP. Si vous avez activé "Mémoriser ce plan dans l'app" ou "Accès permanent", la persistance sera **automatiquement restaurée** après la nouvelle sélection
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
- Comment vérifier toi-même via les DevTools de ton navigateur (F12 → Network)
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
🌐 48.85661° N, 2.35222° E  📋
```

- Affiché juste après la description (ligne nouvelle).
- Format **décimal 5 chiffres** (~1 m de précision).
- Bouton **📋** : copie les coordonnées dans le presse-papier (format `lat, lng` prêt à coller dans Google Maps, OsmAnd, SMS de localisation, etc.).
- Visible pour les **points de session ET les points des data layers** (puits, véhicules, etc.).
- **Pas affiché** pour les tracés / zones / structures (ce sont des géométries multi-points, pas une coordonnée unique).
- Si le plan **n'est pas calibré**, la ligne n'apparaît pas (rétro-compat absolue).

> 💡 **Cas d'usage typique** : en sortie cataphile, tu trouves un puits non répertorié, tu l'ajoutes via ✏️, tu cliques dessus → tu peux instantanément copier ses coords GPS pour les envoyer à un binôme par SMS ou pour les pointer plus tard dans Google Earth.

---

## 🧭 Présentation de l'interface

Tous les outils sont accessibles depuis la **barre latérale droite**, organisée en 11 groupes :

| Groupe | Icône | À quoi ça sert |
|---|---|---|
| **Aide / Doc / Légende** | 📚 | Aide, documentation, légende des icônes |
| **Paramètres** | ⚙️ | Réglages, calibrage de l'échelle, debug *(clic direct)* |
| **Recherche** | 🔍 | Trouver rapidement un point sur le plan *(clic direct)* |
| **Charger / Import** | ⬇️ | Importer une session, éditer un fichier JSON, changer de plan |
| **Créer / Modifier plan** | 🏗️ | Générateur de plan *(clic direct)* |
| **Enregistrer** | ⬆️ | Enregistrer ta session (3 modes), exporter le plan en image |
| **Tracker** | 🧭 | Démarrer / arrêter le tracking, recaler ta position |
| **Mesure** | 📐 | Mesurer une distance, effacer |
| **Édition de points** | ✏️ | Ajouter tes propres points, effacer |
| **Tracés** | 🛣️ | Tracer routes principales, secondaires, chemins, **calculer la distance totale** |

> 💡 **Calque "Mes annotations"** dans la modale ≡ Filtres (en haut à droite de la carte, bouton trois barres horizontales — modale unifiée custom MyKTAMap) : ce calque regroupe tes points ajoutés et zones tracées en session. Décocher la case les masque, recocher les réaffiche. **L'itinéraire, la mesure, le tracker** ne sont pas affectés (cycle de vie propre).
| **Zones** | ⬛ | Tracer des zones de remblais, effondrement ou eau |

**Comment ça marche :**

- **Un seul groupe ouvert à la fois** — appuyer sur un autre groupe ferme le précédent
- **Quand un mode est actif** (mesure, ajout, route, zone, recalage), le groupe **reste ouvert** pour que tu puisses accéder rapidement aux actions associées (effacer un point, etc.). L'icône principale change pour refléter le mode en cours
- **Toucher en dehors** du groupe ouvert le ferme automatiquement
- **Sur mobile en paysage**, la barre devient scrollable verticalement si elle dépasse de l'écran

### 🔄 Changer rapidement de plan via le titre

Le **titre du plan en cours** affiché en haut de l'écran est **cliquable** : il ouvre un petit menu déroulant avec :

- **📚 PLANS RÉCENTS** — les 3 derniers plans que tu as ouverts (hors plan en cours)
- **📚 Tous mes plans…** — pour revenir à l'écran d'accueil avec la liste complète

Au clic sur un plan dans le menu :

- Si ta **session est vierge** (aucune annotation, route, zone ou mesure) → le plan se charge **directement** sans confirmation
- Si tu as **des modifications en cours** → une fenêtre t'avertit avec la **liste exacte** de ce que tu vas perdre :
  ```
  ⚠️ Session en cours
  Vous avez des modifications non enregistrées :
     • 5 points ajoutés
     • 2 tracés
     • 1 zone
  Charger « Plan Test 1 » va vous faire perdre ces modifications.
  [Annuler]   [Charger quand même]
  ```

> 💡 Cette fonction te permet de basculer entre tes plans favoris en **2 clics** sans repasser par l'écran d'accueil. Pour fermer le menu sans rien faire : clique ailleurs ou appuie sur **Échap**.

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
  │ icn │ PA1  Puits Aération
  │     │   Puits · aeration · ouvert · x:4843 y:2002
  └─────┘
  ...

🛣️ TRACÉS (3)
  ┌─────┐
  │ 🛣️  │ Tracé Principal session #1
  │     │   Session · Principal · Niv 0 · 8 pts
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

### 🧭 Panneau latéral Tracker

Le bouton **🧭 Tracker** ouvre un **panneau latéral (flyout)** adjacent au bouton principal. C'est lisible, stable visuellement, et toutes les sous-actions sont accessibles sans scroll, même sur mobile.

**Sous-actions disponibles dans le flyout** (ordre fixe) :

| Icône | Action |
|---|---|
| **▶️** / **⏹️** | Play / Stop tracking (l'icône bascule dynamiquement selon l'état) |
| **🧭** | Boussole (widget rose des vents) |
| **📍** | Recalage position |
| **🗺️** | Calculer un itinéraire |
| **🎬** | Replay de session tracker |
| **🔥** | Heatmap — voir section dédiée |
| **⛑️** | Je suis perdu — **bouton à fond ROUGE** (signal danger) |
| **🚨** | Mode urgence XL — **bouton à fond ROUGE** (signal danger) |

> 🚨 **Les 2 modes urgence sont délibérément placés en FIN de panneau avec un fond rouge vif** pour les rendre instantanément identifiables visuellement. En situation de stress, tu sais où regarder.

### ▶️ Démarrer le tracking

Appuyez sur **▶️** pour démarrer.

**Au premier démarrage de la session**, une popup d'avertissement s'affiche pour rappeler que le tracker est un **module expérimental** : il sert à valider le calibrage / la détection de pas / la formule de heading, **pas à se localiser réellement**. Cliquez sur **« J'ai compris — Démarrer »** pour continuer (la popup ne réapparaîtra plus avant le prochain reload de la page). Sur Mobile, la demande de permission iOS / Android pour les capteurs s'affiche ensuite — acceptez-la.

Une icône apparaît sur le plan à votre position de départ. Elle se déplace au fur et à mesure de votre marche, et un tracé enregistre votre chemin parcouru.

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

### 🎬 Replay de session tracker

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

Le bouton **🔥 Heatmap** dans le flyout **🧭 Tracker** ouvre une modale qui dessine une **carte de densité** par-dessus ton plan. Pratique pour visualiser d'un coup d'œil les **zones les plus fréquentées** (passages clés) vs celles peu utilisées.

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

**Comment ça marche :**

- **Live update** : chaque toggle (case cochée/décochée) applique le filtre **immédiatement** sur la carte (anti-flicker debounce 200 ms pour les plans denses).
- **Sections accordéon** : clic sur l'en-tête d'une section pour replier/déplier. Toutes ouvertes par défaut.
- **Boutons rapides par section** : `👁️ Tout` et `🚫 Aucun` pour basculer tous les éléments d'un coup.
- **Bouton 🔄 Tout afficher** (footer) : reset tous les filtres runtime (tags + types) à leur état neutre (= tout visible). Ne touche PAS aux toggles M-LVL ni aux calques image/data — chacun gardé indépendant.
- **Status footer** : compte les filtres actifs en bas (`Filtres actifs : tags, tracés`) en jaune si au moins un actif, gris si tout neutre.

**Persistance par plan** :

Les filtres tags + types sont **sauvegardés dans la session du plan** (`SessionPersist`). Si tu actives "masquer les puits" sur le plan A, puis tu changes pour le plan B, puis tu reviens sur A → tes filtres sont **automatiquement restaurés**. Chaque plan a ses propres filtres.

**Synchronisation M-LVL bidirectionnelle** :

La section 🏗️ M-LVL de la modale Filtres **cohabite** avec la pastille M-LVL et la modale Niveaux classique. Toute action d'un côté est répercutée de l'autre :

- Tu coches `Niv 1` dans la modale Filtres → la modale Niveaux et la carte sont mises à jour.
- Tu utilises la pastille M-LVL pour changer de niveau actif → si la modale Filtres est ouverte, sa section 🏗️ se rafraîchit en live.

> 💡 **Cas d'usage typique** : tu travailles sur une grande carrière avec beaucoup de tags. Tu n'es intéressé que par les puits ouverts (tags `peo` et `cao`) pour planifier un parcours d'aération. Ouvre ≡ Filtres → section 🏷️ Tags → clique 🚫 Aucun puis recoche `peo` + `cao`. La carte affiche seulement ces 2 catégories. Sauvegardé automatiquement pour ce plan.

> 📌 **Compatibilité** : les sessions enregistrées avant l'arrivée de cette fonctionnalité sont restaurées sans filtre actif (= tout visible). La première interaction avec la modale crée l'état et le persiste à la prochaine sauvegarde automatique (≤ 1.5 s).

> ⚠️ **Le tracé en cours est toujours visible** : si tu es en train de tracer une route et que tu décoches son type dans le filtre, **le tracé courant reste visible** pour ne pas te perdre. Les autres tracés du même type sont masqués comme prévu. Idem pour zones et structures en cours.

### ⚙️ Réglages du tracker

Accédez aux réglages via le bouton **⚙️ Paramètres** de la barre latérale :

- **Échelle (px/m)** : rapport pixels/mètres réels — bouton **🎯** à côté pour calibrer
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

Le mode actif est affiché à côté du temps estimé dans le label bottomleft. Le choix est persisté entre sessions (localStorage). Tu peux changer de mode à tout moment via la modale, le temps se met à jour instantanément.

**Mode navigation** — quand un itinéraire est déjà actif et que vous rouvrez **🗺️ Calculer un itinéraire**, la modale bascule en **mode navigation** :

- Boutons rapides **⏮️ Début** (centre la carte sur le 1er waypoint avec un cercle cyan flash), **⏭️ Fin** (idem pour le dernier), **🔁 Tour complet** (zoom pour voir tout le tracé).
- Bouton **🎯** sur chaque waypoint pour aller le voir directement.
- **🔄 Recalculer** repasse en mode édition (les waypoints sont conservés, vous pouvez les retoucher).
- **❌ Effacer l'itinéraire** retire complètement le tracé.

**Tolérance** : l'algorithme accepte que vos points de départ ou d'arrivée soient un peu **à côté** des routes — il les snappe automatiquement sur le réseau le plus proche. Si plusieurs roads se croisent visuellement mais sans partager exactement un même point (cas typique d'un tracé fait à la main), l'app gère aussi les **jonctions à 15 px près** pour tracer le chemin sans coupure.

> 💡 **Astuce** : si vous voulez voir uniquement le tracé sans le label distance, fermez la modale puis ré-ouvrez-la en mode navigation pour utiliser les boutons de pilotage.

#### 🚫 Préférences d'évitement

Dans la modale itinéraire, une section repliable **🚫 Préférences d'évitement (optionnel)** permet de définir des contraintes **souples** que le pathfinder essaiera de respecter :

| Type | Description |
|---|---|
| **📍 Points à éviter** | **3 méthodes** au choix : (a) recherche autocomplete dans le champ texte, (b) saisie par ID exact, (c) **📍 Cliquer sur la carte** : bascule en mode clic, chaque clic sur la map ajoute un point. Chips orange avec ✕ pour retirer. |
| **🏷️ Tags à éviter** | Clique un chip pour le toggler. Tous les points portant ce tag seront évités (ex: tu actives `pa` → tous les puits aération sont évités). |
| **📏 Marge** | Distance autour des points évités (px, défaut 100). Tout segment de route à moins de cette marge est exclu du graphe. |

**Comportement** :
- ✅ Si possible, l'itinéraire évite tout (= calcul normal)
- ⚠️ Si aucun chemin alternatif n'existe → l'app calcule quand même en passant par ces points et affiche un message orange `⚠️ Impossible d'éviter : X, Y` au-dessus du résultat
- ❌ Si même le fallback échoue (= vraie absence de chemin) → message d'erreur classique

**Différence avec ⛔ Zone Inaccessible** :
- ⛔ Zone = contrainte **dure** (jamais relâchée même en fallback)
- 🚫 Évitement = contrainte **souple** (fallback possible avec message)

**Persistance** : tes préférences sont sauvegardées par plan (localStorage). Au prochain calcul sur le même plan, elles sont restaurées. Bouton **🗑️ Reset** pour tout effacer.

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

   Le choix est persisté entre sessions (localStorage). Si la zone est déjà affichée sur la carte, changer de preset la recalcule instantanément.

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

- 📍 **Position XL** : coordonnées plan affichées en énorme caractères (lisible à un mètre du téléphone)
- 🧭 **Boussole géante** : cap (sens de marche) avec aiguille tournée en temps réel, mise à jour live via les capteurs d'orientation du téléphone
- 🗺️ **Minimap auto-focus** : zoom serré (~20-50 m d'horizon) centré en permanence sur ta position. Affiche en arrière-plan les **roads / zones / structures du plan** — utile pour repérer chemins, sorties, dangers à proximité immédiate
- ☑️ **Toggle 🗺️ Itinéraire** : checkbox dans l'en-tête. Par défaut **décochée** (protection anti-crash sur très gros plans). Coche-la pour réafficher ton itinéraire actif dans la minimap — rendu en **cyan vif + halo blanc** pour rester visible sur le fond zoomé serré. Préférence persistée entre 2 ouvertures du mode urgence.
- 🔋 **Batterie** : le bloc 🔋 ÉTAT affiche le niveau de batterie en temps réel quand l'API est dispo (Chromium uniquement). Critique en mode panique — tu sais immédiatement combien de temps il te reste avant que le tel ne s'éteigne.
- 🌗 **Thèmes** : sombre par défaut, clair en option (selon l'environnement extérieur — pénombre vs lumière vive)
- 🔋 **Wake Lock** : l'écran ne s'éteint pas automatiquement tant que le mode est actif (pas besoin de toucher le téléphone toutes les 30 sec pour le réveiller)
- 📱 **Paysage** : la minimap se recadre correctement quand tu tournes le téléphone à l'horizontale ou inverses le portrait — fini les décalages au passage rotation.

**Quand l'utiliser ?**
- Tu paniques à un croisement et tu as besoin de te re-orienter rapidement
- Tu cherches un détail visuel sur le plan (un pilier, un puits) qui devrait être tout près
- Tu veux vérifier que tu vas dans la bonne direction (cap boussole)
- Tu dois lire ta position en grand pour la transmettre à quelqu'un (radio, SMS) sans plisser les yeux

**Permissions** : la première fois, le navigateur demande l'accès aux **capteurs d'orientation** du téléphone (pour la boussole). Accepte — sans ça, la boussole reste figée.

**Sortie** : appuie sur le ✕ en haut à droite pour fermer le mode.

### 🚨 Mode Secours

Outil opérationnel pour **assigner méthodiquement des équipes de secours** à des zones de recherche d'un plan cataphile. Cas d'usage : une personne est portée disparue dans un réseau dense, plusieurs équipes arrivent en surface, le PC secours doit coordonner « qui ratisse quoi » avec un briefing clair et imprimable.

> 💡 **Différent du ⛑️ Je suis perdu** : ⛑️ c'est *toi* qui es perdu, tu cherches à te retrouver. **🚨 Mode Secours** c'est *quelqu'un d'autre* qui est perdu, tu organises les équipes qui vont le chercher.

#### Accès

Bouton 🚨 dans le groupe **🧭 Tracker** (flyout urgences), à côté de ⛑️ Je suis perdu et 🚨 Panique. Fond rouge urgence cohérent.

#### Workflow

1. **Liste des scénarios** — Tu vois tous les scénarios sauvegardés pour ce plan (max 10, FIFO).
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
| ⬛ Définir zone | Choix : (a) polygone multi-clic + double-clic pour fermer, OU (b) sélection de tracés au clic (re-clic = retirer, highlight rouge pour les sélectionnés) |
| 🗺️ Calc. itinéraire | Calcule automatiquement le chemin le plus court entre entrée et sortie en suivant les galeries existantes (via Pathfinder), affiche distance + durée estimée (vitesse 0.5 m/s méthodique) |

#### Visualisation carte

Bouton **🗺️ Voir sur carte** dans le header de l'édit. Affiche pour chaque équipe (couleur dédiée) :
- Zone polygone (fillOpacity 30 %) OU halo couleur sur les tracés sélectionnés
- Marker 📍 Entrée (cercle border vert + fill couleur équipe)
- Marker 🚪 Sortie (cercle border rouge + fill couleur équipe)
- Itinéraire suggéré (polyline dashed couleur équipe)

Auto-refresh à chaque modif. Re-cliquer le bouton pour masquer.

#### Multi-scénarios par plan

Tu peux préparer **plusieurs hypothèses** simultanées (« si Marc parti par l'Est » vs « si par le Sud »). Bouton 🗐 Dupliquer pour cloner un scénario et tester une variante sans perdre l'original. Cap 10 scénarios par plan (au-delà, le plus ancien est purgé automatiquement).

#### Exports

**📄 PDF imprimable** : 1 page A4 portrait par équipe avec bandeau couleur + sections Contexte/Membres/Mission/Itinéraire + cadre Observations vide 60mm (à remplir au stylo au retour terrain). Filename `Secours_<nom_scénario>_<date>.pdf`.

**🌍 KMZ géolocalisé** : embarque le scénario complet dans un fichier annexe du KMZ (`myktamap-extras.json > secoursPlan`). Pré-requis : plan déjà calibré KMZ (cf modale Export sessions onglet 🌍 KMZ). MyKTAMap peut re-importer le KMZ et recharger le scénario tel quel. Filename `Secours_<nom_scénario>_<date>.kmz`.

Les sections ci-dessous détaillent les fonctionnalités avancées : intégrations cross-app (KML, Lost Mode, heatmap, etc.), exploitation terrain temps réel (vues Live par rôle, statuts, rapports), et consolidation cross-device (import de rapports d'équipiers).

> 💡 **Le partage opérateur ↔ équipes** passe par le **rapport `.mkmsec.report.json`** classique (échange de fichier device-à-device).

> 💡 **Recommandation terrain** : prépare un ou deux scénarios **AVANT** incident sur tes plans favoris pour identifier les frictions du workflow (où sont les accès, comment découper le réseau, quels niveaux par équipe). Pendant un vrai incident, tu seras en mode urgence et l'app doit être prête à dégainer en 30 secondes.

### 🚨 Mode Secours — Multi-phases

Un scénario peut désormais **séquencer plusieurs phases** avec debrief intercalé entre chaque. Cas d'usage terrain typique : *Phase 1 = une équipe balaye TOUS les roulages principaux sans entrer dans les chambres d'exploitation → retour de l'équipe → debrief au PC → Phase 2 = X équipes ciblent les chambres d'exploitation avec les infos remontées de Phase 1.*

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
2. **Auto-détection** : dès que **toutes les équipes participantes ont marqué leur étape Sortie comme `completedAt`**, le bouton passe en **vert pulsant** + un toast assistant t'avertit (« ✅ Toutes les équipes sont sorties — la phase est prête à clore »). L'Op garde la décision finale.
3. **Clic « ✓ Phase terminée »** → modale debrief : textarea libre (5000 caractères max) pour saisir les enseignements de la phase (équipes rentrées, points trouvés, zones à explorer en priorité, contraintes apparues). Ce debrief sera intercalé dans le rapport final entre les sections de chaque phase.
4. **Valide « ✓ Terminer la phase »** → la phase actuelle est **archivée** (deep clone, jamais d'écrasement, historique préservé) + `phase.endedAt` posé
5. **Si une phase suivante existe** → enchaînement automatique sur modale **« 🚀 Démarrer phase X+1 ? »** avec récap des équipes participantes
6. **Tu confirmes** → la nouvelle phase démarre, les étapes des équipes participantes sont **reconstruites depuis leur parcours ACTUEL** (donc si tu as modifié `entrée/sortie/intermédiaires` d'une équipe entre P1 et P2, les nouvelles étapes en tiennent compte)
7. **Si aucune phase suivante** → `confirm()` natif « Arrêter complètement le plan ? » (équivalent ⏹️ Terminer le plan)

**🔍 Garde-fous historique** :

- `terminerPhase` ne supprime **JAMAIS** d'étapes — elle les archive dans `s.execution.etapesArchive[phaseIdx]` en deep clone
- Une phase déjà démarrée ne peut plus être supprimée depuis l'UI (filet de sécurité)
- Une phase active dans l'exécution ne peut pas être supprimée (passe par « ✓ Phase terminée » d'abord)
- Le toast d'auto-détection ne se répète pas (un seul affichage par phase)

> 💡 **Modèle hybride équipes ↔ phases** : tes équipes sont définies **une seule fois** au scénario (avec membres, couleur OTAN, parcours). La participation à chaque phase est gérée par checkbox dans la modale phase. Une même équipe peut participer à plusieurs phases successives — au passage de phase, ses étapes sont reset selon son parcours actuel (donc tu peux modifier le parcours entre P1 et P2 pour adapter à ce qui a été découvert).

> 💡 **Bouton « ➕ Ajouter une phase » aussi disponible à chaud** depuis le footer Live Op (pendant l'exécution), pas seulement depuis la vue Edit. Pratique quand le debrief de P1 fait apparaître le besoin d'une P3 imprévue.

### 🚨 Mode Secours — Intégrations cross-app

Ces intégrations font du Mode Secours un outil de coordination opérationnelle complet :

#### 🌍 KML cross-app (Google Earth, OsmAnd, Avenza…)

Le KMZ exporté contient désormais un Folder racine `🚨 Secours` parfaitement structuré pour les apps tierces :

```
📁 Secours — Recherche Marc 26/05
   ├── 📁 🚨 Équipe Alpha
   │   ├── 📁 📍 Points (5)           ← toggle ON/OFF dans Google Earth
   │   ├── 📁 ⬛ Zone de recherche
   │   └── 📁 🗺️ Itinéraire
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

Si le disparu utilisait MyKTAMap et a exporté sa session avec timeline tracker, la heatmap montre directement où il a passé du temps.

#### 🏗️ Auto-création 1 équipe par niveau (M-LVL)

Sur les plans multi-niveau, bouton conditionnel **🏗️ Auto : 1 équipe par niveau (N)** dans la section Équipes. Crée auto N équipes nommées `Niveau RDC / +1 / -1...` avec couleurs auto-cyclées. Tu poses ensuite zones + waypoints sur chaque niveau séparément en changeant le niveau actif via la pastille M-LVL topleft.

#### ⭐ Favoris en accès rapide

Dans la mini-modale "📍 Choisir un point", tes favoris du plan apparaissent désormais en chips cliquables (max 8) AU-DESSUS de la recherche autocomplete. 1 clic = waypoint appliqué (skip search + clic carte).

Particulièrement utile pour les scénarios urgence où tu veux créer rapidement plusieurs équipes avec les mêmes 3-4 puits d'accès connus.

#### 🛑 Pause configurable cross-feature

Nouvelle section dans la modale 🗺️ Itinéraire :

```
🛑 Pause entre les arrêts
☑️ Inclure une pause entre chaque arrêt intermédiaire
   Durée par pause : [15] min
```

Default checked + 15 min (= comportement préservé). Modifiable → s'applique aussi au calc des durées Mode Secours (cross-feature).

> ⚠️ Comme tous les outils numériques en sous-sol : **garde une boussole physique** et une carte papier dans ta poche. Le téléphone peut tomber en panne, le magnétomètre peut être faussé par du métal local, le tracker peut dériver. Le 🚨 est une aide à la lecture rapide d'infos, pas un substitut à la préparation.

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
│ 🚨 Équipe Alpha · Étape 3/5     ⏱️ 14h 23min         │
├─────────────────────────────────────────────────────┤
│  ✓ ━ ✓ ━ ↻ ━ ○ ━ ○                                  │ ← stepper
│  cliquable, couleur statut par étape                │
├─────────────────────────────────────────────────────┤
│ 📍 ÉTAPE 3 — Puits aération Nord                    │
│ Statut : 🟢 RAS                                      │
│                                                      │
│ 📝 Observations à cette étape :                     │
│ [galerie centrale rien à signaler]                  │
│                                                      │
│ ⚡ Saisie rapide :                                  │
│ [🟢 RAS] [🟡 Suspect] [⬛ Bloqué] [🔵 Indice]       │
│ [🟠 Aide demandée] [🟣 Demi-tour] [🚨 Victime !]    │
│                                                      │
│ [📸 Photo (0/5)]  [🎯 Recentrer carte]              │
├─────────────────────────────────────────────────────┤
│ [← Étape précédente]  [Étape suivante →]            │
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

**Photos** : appui « 📸 Photo (X/5) » → caméra arrière auto sur mobile (`capture="environment"`) OU galerie. Max 5 photos par étape, compression auto JPEG q85 max 1920px. Cliquer une miniature → viewer plein écran avec swipe + zoom.

**Auto-save** : observations sauvées au blur du textarea ET au changement d'étape. Pas besoin de bouton « Sauver ».

**Auto-statut RAS** : passer à l'étape suivante sans avoir mis de statut explicite → marqué automatiquement « 🟢 RAS » (suppose que tu as fait l'étape sans rien à signaler). Re-clic statut possible si besoin.

#### 👤 Vue Live — Mode OPÉRATEUR SURFACE (vue d'ensemble)

Pour le PC chef qui coordonne plusieurs équipes en parallèle :

```
┌─────────────────────────────────────────────────────┐
│ 👤 Opérateur surface · 3 équipes  ⏱️ 02h 14min       │
├─────────────────────────────────────────────────────┤
│  ┌──────────────────┐  ┌──────────────────┐         │
│  │ 🔴 Alpha    3/5  │  │ 🔵 Bravo    1/4  │         │
│  │ ████████░░ 60%   │  │ ███░░░░░░░ 25%   │         │
│  │ 🟢 RAS           │  │ 🟠 Aide demandée  │         │
│  │ « RAS galerie    │  │ « Eau au sol,    │         │
│  │ centrale »       │  │ niveau monte »   │         │
│  │ ⏱️ 14:23         │  │ ⏱️ 14:18         │         │
│  │ [👁️ Détails]     │  │ [👁️ Détails]     │         │
│  │ [🚨 Prendre main]│  │ [🚨 Prendre main]│         │
│  └──────────────────┘  └──────────────────┘         │
│  ┌──────────────────┐                               │
│  │ 🟢 Charlie  ✓T   │ ← équipe Terminée (grisée)    │
│  └──────────────────┘                               │
├─────────────────────────────────────────────────────┤
│ [⏸️ Pause] [🗺️ Carte globale] [📤 Rapport global]   │
│ [Voir édition] [⏹️ Terminer le plan]                │
└─────────────────────────────────────────────────────┘
```

**Cards spéciales** avec signaux visuels forts :

- 🚨 **Victime trouvée** → card **ROUGE CLIGNOTANTE** (animation 1.2s, urgence absolue, tu ne peux PAS la rater)
- 🟠 **Aide demandée** → orange + lueur (renfort à envoyer)
- ✓ **Terminée** → grisée opacity 0.75 (toutes étapes complétées)

**Bouton « 👁️ Détails »** → mini-modale read-only avec liste chronologique des étapes de l'équipe (ts + statut emoji + obs).

**Bouton « 🚨 Prendre la main »** → bascule vers la vue Équipier focalisée sur cette équipe spécifique. Tu deviens TEMPORAIREMENT l'équipier d'Alpha pour saisir une observation détaillée à sa place (cas typique : tu es au PC chef mais tu reçois un appel radio d'Alpha qui te dicte ses obs).

**Retour facile** : une fois en mode Équipier après « Prendre la main », un bouton **« 👤 Retour Opérateur »** apparaît dans le footer. Au clic → retour à la vue d'ensemble Opérateur intacte (les flags `_previousRole` survivent reload + plan switch).

**Bouton « 🗺️ Voir carte globale »** : masque la modale + render l'overlay carte avec toutes les zones + waypoints + itinéraires des équipes en couleurs OTAN.

#### 🚑 Vue Live — Mode SECOURISTE LIBRE (notes en vrac)

Pour le renfort ponctuel / la reconnaissance sans équipe pré-assignée :

```
┌─────────────────────────────────────────────────────┐
│ 🚑 Secouriste libre · 12 notes  ⏱️ 01h 47min         │
├─────────────────────────────────────────────────────┤
│ 📝 Ajouter une note                                  │
│ [galerie nord rien à signaler]                      │
│ ⚡ Statut associé :                                 │
│ [🟢 RAS] [🟡 Suspect] [⬛ Bloqué] [🔵 Indice]       │
│ [🟠 Aide] [🟣 Demi-tour] [🚨 Victime !]             │
├─────────────────────────────────────────────────────┤
│ 12. 🟢 RAS · ⏱️ 16:42:18                       [✕]  │
│     « Croisement Est, RAS, on continue »            │
│                                                      │
│ 11. 🟡 Suspect · ⏱️ 16:38:05                   [✕]  │
│     « Bruit d'eau qui coule, source ?? »            │
│                                                      │
│ ... (chronologique DESC)                            │
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

Le timer ⏱️ affiché en haut de chaque vue Live est calculé depuis le `startedAt` MOINS le temps de pause cumulé. Tu peux mettre en pause avec le bouton **« ⏸️ Pause »** (le timer fige) puis reprendre avec **« ▶️ Reprendre »** — la durée de pause n'est PAS comptabilisée.

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
   - Importe le `.mkmsec.json` de l'opérateur (cohérence IDs équipe)
   - Lance le plan → vue Live Équipe → renseigne obs + statuts + photos par étape
   - **Au retour surface** : génère son rapport via « 📤 Rapport » dans le footer Live Équipe → format **`.mkmsec.report.json`** → exporte le fichier (download local)

3. **Côté Opérateur (retour terrain)** :
   - Récupère les 3 rapports `.mkmsec.report.json` (un par équipe) via le canal de son choix (AirDrop, mail, clé USB, Discord)
   - Dans la vue Live Opérateur → bouton **« 📥 Importer rapport équipier »** dans le footer
   - File picker → sélectionne le fichier → modale preview qui montre : nom équipe ciblée, nombre d'étapes à fusionner, photos, et **conflits détectés** (étapes côté op déjà renseignées qui vont être fusionnées)
   - Confirme l'import → l'app fait un **snapshot AVANT** (backup d'urgence) puis fusionne :
     - Observations **concaténées avec séparateur daté** (aucune perte)
     - Statut **le plus sévère retenu**
     - Photos **importées avec déduplication**
   - Modale résultat avec stats détaillées (X étapes fusionnées, Y photos importées, Z avertissements éventuels)
   - Répète pour les 2 autres équipes

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

| Raccourci | Action |
|---|---|
| **Ctrl+Z** (`Cmd+Z` Mac) | Annuler la dernière action |
| **Ctrl+Y** (`Cmd+Y` Mac) | Rétablir l'action annulée |
| **Ctrl+Shift+Z** (`Cmd+Shift+Z` Mac) | Rétablir (alternative) |

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

- ❌ **Photos** attachées aux points : leur suppression reste **irréversible** (les blobs sont effacés de la base IndexedDB locale, pas restaurables)
- ❌ **Imports de session** : un import qui écrase ta session n'est pas annulable via Ctrl+Z (utilise l'auto-save SessionPersist pour récupérer)
- ❌ **Tracker** (mode capteurs en temps réel)
- ❌ **Mesure de distance** (= outil éphémère, pas une mutation persistante)

### Cycle de vie de l'historique

- **RAM only** : l'historique est gardé en mémoire vive uniquement, **perdu au reload** de la page (c'est volontaire, pour éviter de bloater le stockage local).
- **Reset au changement de plan** : si tu charges un autre plan, l'historique est vidé (logique : tu ne veux pas annuler une action faite sur un autre plan).
- **Limite 50 actions** : au-delà, les plus anciennes sont oubliées (FIFO).
- **Une nouvelle action efface le redo** : si tu fais 5 undo puis poses un nouveau point, le redo devient impossible (logique de branche d'historique).

---

## 🪫 Indicateur de batterie

L'app surveille en temps réel le niveau de batterie du téléphone (quand le navigateur expose cette info) et affiche un indicateur compact à 3 endroits :

| Endroit | Apparence |
|---|---|
| **En-tête** de l'interface (à côté des compteurs session) | Chip compact `⚡ 78%` (en charge, vert) ou `🪫 23%` (en décharge, couleur selon niveau) |
| **Footer** de la modale 📋 Session active | Ligne `🔋 État · 🪫 23% · Discharging` |
| **Bloc 🔋 ÉTAT** du mode urgence 🚨 | Label long `🪫 23% · décharge` |

### Niveaux et couleurs

| % | Couleur | Comportement |
|---|---|---|
| ≥ 50 % | Vert / neutre | OK |
| 20-49 % | Jaune-orange | Surveille |
| 10-19 % | Orange foncé + toast `🪫 Batterie faible — pense à recharger` (1 fois) |
| 5-9 % | Rouge + toast `🪫 Batterie critique — sortie recommandée` (1 fois) |
| < 5 % | Rouge pulsant + toast `🚨 Batterie critique — moins de 5%` (1 fois) |

Chaque seuil n'envoie son toast **qu'une seule fois** par cycle de décharge (pas de spam si tu oscilles autour de 10 %, 12 %, 9 %, etc.). Le compteur de seuils est reset dès que tu repasses en charge ou que tu remontes au-dessus de 50 %.

### Compatibilité navigateur

L'app utilise l'**API Battery Status** standard du navigateur. Cette API n'est **plus disponible partout** :

| Navigateur | Support |
|---|---|
| Chrome Android / PC | ✅ Oui |
| Edge Android / PC | ✅ Oui |
| Samsung Internet | ✅ Oui |
| Safari iOS / macOS | ❌ Non (l'API a été retirée pour des raisons de privacy / fingerprinting) |
| Firefox récent | ❌ Non (l'API a été désactivée par défaut) |

> 🪫 **Si l'API n'est pas dispo** sur ton téléphone, la chip batterie est **simplement masquée** — aucun message d'erreur ne s'affiche. C'est normal sur iOS. Tu vois quand même le niveau dans le mode urgence si tu tiens à l'avoir en grand.

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

> **Comment ça marche** : l'app applique la formule de Shoelace aux coordonnées plan et convertit en m² via l'échelle calibrée du plan (`APP_CONFIG.scale` en px/m). La précision dépend donc de la calibration initiale du plan (`📏 ÉCHELLE` dans ⚙️ Réglages).

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

Appuyez sur **🗑️** (à côté de ✏️). Une fenêtre s'ouvre avec deux options :

| Option | Effet |
|---|---|
| **↩️ Dernier point** | Supprime le point le plus récemment ajouté |
| **🗑️ Tous les points** | Efface tous les points ajoutés manuellement (irréversible) |
| Annuler | Ferme la fenêtre sans rien supprimer |

> Tu peux retirer plusieurs points un par un en cliquant successivement **🗑️ → ↩️ Dernier point**.

> ⚠️ **Tous les points** ne supprime que les points que **tu** as ajoutés — les points du plan original restent intacts.

### ✏️ Modifier un point existant

Cliquez sur un marker que vous avez ajouté → la popup affiche le bouton **✏️ Modifier** (bleu). Il ouvre la même fenêtre que pour l'ajout, **pré-remplie** avec le nom, le type, la description et les photos déjà attachées (si applicable).

Tu peux changer ce que tu veux puis **💾 Enregistrer**. Si tu renommes le point ET qu'il a des photos, les photos suivent automatiquement (migration interne transparente).

### 📸 Photos attachées aux points

Tu peux attacher jusqu'à **5 photos par point** (limite anti-saturation stockage navigateur). 100 % local — aucune photo n'est envoyée sur Internet.

**Au moment de l'ajout ou de la modification** d'un point, la section **📸 Photos (N/5)** propose 2 boutons :

| Bouton | Effet |
|---|---|
| **📷 Prendre photo** | Ouvre directement la caméra (sur mobile) pour shooter une nouvelle photo |
| **🖼️ Depuis la galerie** | Ouvre le sélecteur de fichiers (mobile et PC), tu peux choisir plusieurs photos d'un coup |

**Compression auto** : les photos sont compressées avant stockage (1920 px côté long max, qualité JPEG 85 %). Une photo brute de 5-10 Mo passe à ~200-500 Ko. Pour 5 photos = ~2 Mo par point.

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
- Stockage local navigateur (IndexedDB) — quota ~50-200 Mo selon le device. Un toast d'avertissement t'avertit si tu approches du quota
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

C'est une **contrainte dure** — jamais relâchée. Si tu veux une contrainte **souple** (éviter si possible, sinon passer quand même avec un message), utilise plutôt les **🚫 Préférences d'évitement** dans la modale itinéraire (voir section dédiée plus bas).

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

### 💾 Enregistrer une session

Appuyez sur **⬆️ → 💾**. Une modale s'ouvre avec **3 onglets** au choix :

#### 🚀 Full
Exporte tout en un seul fichier `devmap-session` (points ajoutés, tracés, zones, structures).
Pratique pour sauvegarder ta session et la reprendre plus tard.

> 📌 La mesure de distance n'est pas incluse en mode Full.

> 🧭 **Tracker inclus en Full** : si le tracker est actif (ou a été utilisé pendant cette session), sa **position actuelle + chemin parcouru + timeline complète + timestamp de démarrage** sont embarqués dans le payload sous `session.tracker`. À la ré-importation, ta session de tracking est **fidèlement restaurée** (timeline + replay possible). Si le tracker n'a jamais été activé, le champ est simplement absent (rétro-compat).

#### 🎨 Avancé
Sélection précise de ce que tu veux exporter :

- ✏️ **Points ajoutés** + cases par tag (avec icône miniature) + une catégorie spéciale `(sans tag)` pour les points sans tags. Tu peux donc exporter par exemple uniquement les points avec le tag `pa` ou `danger`.
- 🛣️ **Tracés** + cases par type (principaux, secondaires, chemins)
- ⬛ **Zones** + cases par type (eau, remblais, effondrement, inaccessible)
- 🏛️ **Structures** + cases par type (piliers / mur / fronts)
- 🧭 **Tracker** *(en option)* — si coché, la case affiche en temps réel un compteur : *« timeline N évt · tracé M pts »*. À l'export inclut : position actuelle + chemin parcouru + timeline complète + timestamp de démarrage. Re-import restaure tout via `setTrackingTimeline` → ton replay 🎬 est fonctionnel après ré-import.
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

### 🖼️ Exporter en PNG/JPG

Appuyez sur **⬆️ → 🖼️ Plan en image**. Une modale s'ouvre avec deux modes :

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
- **Résolution** : Originale, ½ ou ¼ (utile pour les très gros plans)
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
- **🖼️ Image de base & calques** — case « Image plan de base » + 1 case par `imageLayers[]` du plan (calques d'image type légende, annotations photo, etc.). Pré-cochage = visibilité actuelle sur la carte.
- **📊 Calques de données** — 1 case par `dataLayers[]` du plan (puits, véhicules, chemins, structure embedded, etc.). Le calque `editor` apparaît avec un label spécial « Mes annotations (= calque session) ».
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

Appuyez sur **⬆️ → 💾** puis l'onglet **🌍 KMZ**. Génère un fichier `.kmz` ouvrable dans n'importe quelle appli de cartographie terrain compatible KML.

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

#### Aperçu live

Au fur et à mesure que tu remplis les champs, un bloc **🌐 Aperçu coins** s'affiche avec :
- Les 4 coins de ton plan calculés en (lat, lng) — ↖️ ↗️ ↙️ ↘️
- L'**échelle** calculée (mètres par pixel) et la **rotation** (°)
- Un lien **🔗 Voir le centre sur Google Maps** pour vérifier visuellement que le centre du plan tombe bien là où tu attendais (vérif connexion internet auto avant ouverture)

#### Contenu à inclure (granularité fine)

Pareil que le mode Image Avancé : cases parent + sous-cases pour un contrôle précis.

- 🖼️ **Image plan** (GroundOverlay) + slider **Opacité 0-100%** (défaut 60%) — permet de voir la cartographie satellite/OSM sous ton plan dans Google Earth
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

Ton calibrage 2 points est sauvegardé **par plan** (localStorage). Au prochain export du même plan, les 8 champs sont déjà pré-remplis — tu ajustes si besoin et tu re-télécharges. Si tu changes de plan ou repars à zéro, tu n'as qu'à re-saisir.

> ⚠️ **Limites de la précision** : la transformation est une **similarity 2D** (rotation + scale uniforme + translation). Sur des plans globalement plats et rigides, c'est suffisant. Sur des plans très étendus ou non-rigides (déformations locales), attends-toi à une légère dérive aux extrémités opposées au calibrage. Une version future pourra supporter 3+ points (least squares) pour plus de précision si besoin.

> ⚠️ **Comme pour l'export PNG**, vérifie que ton KMZ ne révèle pas d'informations sensibles avant de le partager publiquement (carrière privée, accès restreint…).

---

## ⬇️ Charger / Import

> Le groupe **⬇️ Charger / Import** de la barre latérale contient les actions d'import.

### 📥 Importer une session

Appuyez sur **⬇️ → 📥 Importer une session** pour ouvrir la fenêtre d'import. Une modale s'affiche :

1. **Glissez-déposez** votre fichier `devmap-session.json` dans la zone, ou cliquez pour le sélectionner
2. Un **aperçu** s'affiche : nombre de points ajoutés, nombre de tracés, nombre de zones, nombre de points de mesure
3. Un **avertissement** vous prévient que l'import remplacera votre session en cours — pensez à exporter avant si nécessaire
4. Cliquez sur **Importer** pour valider, ou **Annuler** pour fermer sans rien changer

### 📊 Éditer un fichier JSON

Appuyez sur **⬇️ → 📊 Éditer un fichier JSON** pour ouvrir l'éditeur de tableau. Permet de modifier en masse les points d'un calque ou d'une session.

#### Ouverture

1. **Glissez-déposez** un fichier `.json` (calque de données type `puit.json`, ou session `devmap-session.json`)
2. Le format est détecté automatiquement
3. Le tableau s'affiche avec une colonne par champ détecté

#### Édition

- **Cliquez sur une cellule** pour la modifier (sauf l'ID, en lecture seule)
- **Tab** : passe à la cellule suivante
- **Entrée** : passe à la ligne suivante (même colonne)
- **Échap** : annule la modification en cours
- **Coordonnées** : si X ou Y est hors du plan, la cellule devient rouge avec un avertissement ⚠
- **Tags** : cliquez sur la cellule pour ouvrir un sélecteur multi-tags avec aperçu des icônes. Tu peux aussi créer un nouveau tag à la volée

#### Actions

- **🔍 Recherche** : filtre toutes les colonnes
- **Trier** : clique sur l'en-tête d'une colonne (asc → desc → annulé)
- **Sélection multiple** : checkbox + Maj+clic pour une plage
- **+ Ajouter ligne** : nouvelle ligne vide en bas
- **📋 Dupliquer** : copie les lignes sélectionnées
- **🗑️ Supprimer** : retire les lignes sélectionnées (confirmation requise)
- **📍 Voir sur la carte** : affiche les points sélectionnés en orange clignotant sur le plan

#### Sauvegarde

Bouton **💾 Sauvegarder** → 3 choix :

| Option | Effet |
|---|---|
| **📥 Télécharger** | Récupère le fichier `.json` modifié |
| **🗺️ Remplacer le calque** | Met à jour le calque correspondant en mémoire (si format `data` et calque chargé sur le plan en cours) |
| **✏️ Remplacer la session** | Remplace les points ajoutés de la session en cours (si format `editorPoints`) |

> ⚠️ Si vous fermez la fenêtre avec des modifications non sauvegardées, une confirmation vous propose de sauvegarder, quitter sans sauvegarder, ou continuer l'édition.

### 🗂️ Changer de plan

Appuyez sur **⬇️ → 🗂️ Changer de plan** pour revenir à votre liste de plans (l'écran d'accueil **📚 Mes plans**) et en charger un autre. Les données non exportées seront perdues — **exportez votre session avant de changer**.

Depuis cet écran, vous pouvez :

- Cliquer sur **▶️ Reprendre** pour relancer le plan que vous venez de quitter
- Choisir un autre plan dans **Mes plans** (clic direct ou bouton ▶️ de la ligne)
- Charger un nouveau ZIP via la zone d'import
- Importer/Exporter votre liste de plans

---

## 🏗️ Créer ou modifier un plan

> Accessible directement via le bouton **🏗️** de la barre latérale (clic direct, pas de sous-menu).

Appuyez sur **🏗️** pour ouvrir le générateur. Deux onglets disponibles :

### 📄 Nouveau plan

Formulaire vierge. Renseignez :

- **Informations** : nom, version, auteur
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

Dans la section **📊 Calques de données** du générateur, un encadré jaune doré propose **📦 Choisir un ZIP datalayer…**. Il sert à **récupérer en un coup** les calques + photos d'un autre plan, exportés via **💾 Enregistrer la session → 🔄 Conversion → ✏️→🗂️ Session vers data layer** (avec la case 📸 Photos cochée pour les inclure).

**Cas d'usage typique** :
1. KARMA voit un copain qui a annoté un plan (points + tracés + zones + structures + photos) et qui exporte un `data_<plan>.zip` via la Conversion
2. Tu copies ce ZIP sur ton appareil (Drive, AirDrop, USB…)
3. Dans le générateur, mode **Modifier existant** OU **Nouveau plan**, tu cliques le bouton 📦 Choisir un ZIP datalayer
4. Le ZIP est parsé → des **calques data layer sont créés automatiquement** : `points` (points du copain), `roads` (tracés), `zones` (zones), `structure` (piliers/fronts). Si le ZIP contenait des photos, elles sont **gardées en mémoire** pour être embarquées au moment de la génération.
5. Message vert "✅ N calque(s) créé(s) : points (X), roads (Y), zones (Z), structure (W) · 📸 M photos"
6. Tu **📦 Générer le ZIP** comme d'habitude → le plan final contient tes calques d'origine (si Modifier) + les calques importés + le dossier `data/photos/` avec les blobs
7. Au chargement de ce plan par n'importe quel utilisateur, les photos sont restaurées automatiquement dans IndexedDB et apparaissent dans les popups des markers

**Comportement** :
- **Mode Nouveau** : les calques importés deviennent les calques data du plan (la liste UI est vidée et remplie avec les calques du ZIP)
- **Mode Modifier** : les calques existants du plan source sont **préservés** ; les calques du ZIP importé s'ajoutent avec **suffixe `_imported_<N>`** si conflit d'id (= n'écrase jamais les calques d'origine). Photos IDB du plan courant **merge** avec photos du ZIP (déduplication par photoId).

> 📸 **Format du ZIP datalayer** attendu : c'est exactement ce que produit la **Conversion session → data layer** quand tu coches "📸 Inclure les photos attachées" (granularité Basique ou Fine peu importe). Contient `points.json` + `roads.json` + `zones.json` + `structure.json` (selon ce qui était présent dans la session source) + `photos/_index.json` + `photos/<photoId>.jpg`.

### 📸 Inclure les photos attachées au plan

En mode **Modifier existant**, si le plan que tu charges a déjà des **photos attachées à ses points** (stockées en IndexedDB locale via l'éditeur), une case **📸 Inclure les photos attachées (N · X Mo)** apparaît dans la section "🖼️ Images principales" du formulaire.

- **Cochée par défaut** : les photos IDB du plan sont embarquées dans le ZIP plan généré sous `data/photos/<photoId>.jpg`. Tu peux ainsi partager le plan complet (annotations + photos) à un autre appareil.
- **Décochée** : le ZIP plan généré ne contient pas les photos. Plus léger en taille, mais l'utilisateur qui importe le ZIP ne récupèrera pas les photos.

Au chargement de ce ZIP plan par n'importe quel autre utilisateur : les photos sont **restaurées automatiquement** dans IndexedDB sous le planId local + un toast discret "📸 N photos restaurées depuis le plan" confirme.

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

Au chargement d'un plan V2, tu peux choisir **Mode performance : Désactivé** dans la modale **⚙️ Configuration** du loader. Dans ce cas, le runtime ignore les tuiles et charge directement l'**image source** (`baseImage` du ZIP, gardée intacte) comme un plan V1 classique.

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

### 6. ⚡ Mode performance — choisir le bon preset

Au chargement d'un plan, tu peux choisir parmi 5 presets dans le loader :

| Preset | Pour quel cas |
|---|---|
| **💤 Désactivé** | Petit plan ≤ 4 000 px, desktop puissant. **Risque de crash sur Safari iOS au-delà de 8 000 px** |
| **🔄 Auto** (défaut) | Comportement intelligent — tuile si fichier > 60 Mo. ✅ Bon choix par défaut |
| **🌟 Qualité** | Images haute définition, perf à fond (desktop/laptop) |
| **🎯 Équilibré** | Bon compromis qualité/perf, recommandé sur la plupart des mobiles modernes |
| **⚡ Performance** | Vieux mobile, plan très gros, priorité absolue à la stabilité |

> 💡 Le preset est mémorisé **par plan** : tu peux avoir un plan en mode Performance pour ton vieux téléphone et un autre en Qualité pour ton iPad.

### 6 bis. 🚀 Mode Performance ULTRA — pour les vrais gros plans qui crashent

Si malgré le mode Performance, ton plan crashe encore (typiquement plans 4000+ × 2000+ pixels avec beaucoup de tracés), ouvre **⚙️ Réglages → section "🚀 Mode Performance ULTRA"** et active le **toggle master 🚀 ULTRA**. Il active 6 optimisations agressives simultanément.

> ⚠️ Ces optims **ne touchent PAS à l'image** (déjà gérée par le mode performance ci-dessus). Elles ciblent les éléments vectoriels (tracés, points, calculs).

**Les 6 toggles individuels** (activables séparément si tu veux affiner) :

| Toggle | Effet | Trade-off |
|---|---|---|
| 🪜 **Décimer les tracés au dézoom** | Simplifie les polylines au zoom out | Tracés moins lisses au dézoom |
| ⚡ **Désactiver animations zoom/pan** | Transitions instantanées au lieu d'animées | Visuel plus abrupt — **reload requis** |
| 🎯 **Désactiver cercles intersections** | Plus de cercles aux carrefours au-delà de 50 routes (vs 200) | Carrefours moins visibles |
| 🚫 **Désactiver popups sur calques de données** | Pas de popup au clic sur les markers des calques (puits, etc.) | Utilise 🔍 Recherche pour interagir |
| 🐢 **Auto-save lent (30s)** | Sauvegarde toutes les 30s au lieu de 1.5s | Risque de perdre 30s de modifs si crash |
| 👁️ **Ne rendre que les tracés visibles** | Skip les routes hors écran | Pop-in léger au pan |

**Comment t'en servir** :

- **Si l'app crashe encore** → coche **🚀 ULTRA** (active tout). Effet immédiat (sauf "animations" qui demande un reload).
- **Si tu veux affiner** → garde ULTRA décoché et active manuellement les toggles selon ce que tu veux sacrifier. Par exemple : tu peux activer juste **🐢 Auto-save lent** et **👁️ Viewport culling** pour gagner pas mal sans rien perdre visuellement.
- **Pour revenir au comportement normal** → décoche **🚀 ULTRA** (ça décoche tout) ou décoche individuellement.

**Persistance** : les toggles sont mémorisés dans ton navigateur (préférence globale, pas par plan). Ils restent activés entre sessions.

> 💡 Combo recommandé pour les très gros plans : 🚀 ULTRA + mode performance ⚡ Performance au chargement + image source ≤ 8000 px / JPEG q85.

### 7. 📱 Spécifique mobile

- **iPhone PWA** (installé sur écran d'accueil) gère mieux les gros plans qu'iPhone Safari direct
- **Android Chrome** est généralement plus tolérant qu'iOS pour la mémoire
- En cas de crash : ⚙️ Réglages → **🐛 Logs détaillés** → ON pour diagnostiquer

### 8. 💾 Sauvegarde régulière

Les plans très gros peuvent occasionner des **kills mémoire silencieux** sur iOS — l'OS tue l'onglet sans prévenir pour récupérer de la RAM. L'app détecte ce kill au reboot et te montre un toast d'avertissement.

> 📌 **Réflexe** : exporte ta session (💾 Enregistrer la session) tous les 10-15 minutes de travail intensif. L'auto-save localStorage protège déjà contre la plupart des cas, mais un export externe reste le plus sûr.

### Récap rapide

✅ **Pour un plan optimal** :
- Image base **JPEG qualité 85** ≤ 8 000 px de côté
- 1 ou 2 calques image max
- Routes **dessinées dans le PNG** + calque JSON masqué pour le pathfinder
- Points répartis dans 2-3 calques de données toggleables
- Preset **🎯 Équilibré** par défaut, **⚡ Performance** pour les vieux mobiles

---

## 🤖 Aide IA

> Accessible via le groupe **📚 Aide / Doc / Légende → 🤖 Aide IA**.

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

> Accessible via le groupe **📚 Aide / Doc / Légende → 🗺️ Légende**.

Affiche la légende complète des icônes et tracés, regroupés par catégorie : **🕳️ Puits**, **🪜 Accès** (puits à échelon, escaliers, cavages), **⚠️ Signalétique**, **🛣️ Tracés** et **⬛ Zones**.

> 💡 La légende affiche **toutes les icônes que l'application sait reconnaître**, même si votre plan en cours ne les utilise pas. C'est pratique pour découvrir les types disponibles avant d'ajouter vos points.

---

## ⚙️ Réglages (en mode carte, par plan)

> Accessible directement via le bouton **⚙️** de la barre latérale (clic direct, pas de sous-menu).
>
> Cette modale est focus **par plan** (réglages liés à ce plan ouvert). Pour les **réglages globaux** (interface, PIN, reset, etc.), passe par **⚙️ Configuration** sur la page d'accueil — cf section dédiée plus haut. La séparation est volontaire : Réglages = ce qui concerne CE plan, Configuration = ce qui concerne l'app.

Accédez aux paramètres en cliquant sur **⚙️** :

### 🧭 Tracking (spécifique au plan)
- **Position initiale du tracker** : coordonnées de départ X/Y
- **Détection des pas** : sensibilité (`stepThreshold`), taille du pas (`stepLength`), cooldown anti-rebond
- **Échelle (px/m)** avec bouton **🎯 Calibrer** : calcule l'échelle correcte à partir d'une distance mesurée

### 🔍 Affichage (préférence globale, partagée entre tous les plans)
- **Icônes adaptatives au zoom** (`scaledMarkers`) : les icônes des points (puits, accès, signalétique, etc.) gardent une taille relative au plan constante. Au dézoom, elles rétrécissent ; au zoom in, elles grossissent. Reload requis au toggle.
- **Afficher les ronds aux intersections de tracés** : cercle plein coloré au croisement de 2 tracés. Décocher pour aérer visuellement les plans très denses. Effet immédiat (sans reload).
- **🔆 Garder l'écran allumé** : active la Wake Lock API pour empêcher la mise en veille automatique de l'écran tant que l'app est ouverte. Re-acquisition auto au retour d'arrière-plan. Masqué si le navigateur ne supporte pas l'API. Le même toggle est aussi disponible dans **⚙️ Configuration** sur la page d'accueil.

### 🎬 Mode présentation

- **🎬 Lancer le mode présentation** : bouton en **haut** de la modale Réglages. Active un mode plein écran sans UI (pour démos / projection), accessible d'un seul bouton tactile.
- La touche **F** est disponible comme raccourci PC.

### 🎯 Pickers géoréférencement

Les pickers 2-points (calibrage GPS pour KMZ / GPX) sont disponibles dans **⚙️ Réglages → onglet Géoréférencement** (en plus de la modale **Enregistrer session → 🌍 KMZ**) :

- **🔍 Recherche d'un point** sur le plan pour auto-remplir x/y
- **📍 Clic carte** pour pointer une position directement
- Saisie manuelle lat/lng GPS pour finaliser le calibrage

Le calibrage saisi ici est partagé avec les exports KMZ / GPX du même plan (persistance par plan via localStorage). Pratique pour valider ton calibrage **hors flow d'export** (par exemple en début de session terrain).

### 🛠️ Debug
- **🐛 Logs détaillés** : active le verbose mode (logs capteurs tracker + tiling + détections). Utile pour diagnostiquer un problème.
- Affichage du **mode performance** du plan en cours (💤 Désactivé / 🔄 Auto / 🌟 Qualité / 🎯 Équilibré / ⚡ Performance) — read-only ici, modifiable au prochain chargement du plan via le sélecteur du loader.

### Actions
- **Appliquer** : sauvegarde les changements
- **🐛 Logs** : affiche les journaux de débogage capturés
- **Réinitialiser** : remet les valeurs par défaut pour CE plan (ne supprime rien — c'est différent de **💥 Tout réinitialiser** dans ⚙️ Configuration loader, qui purge tout)

> 💡 **Le mode performance ne se modifie qu'au chargement du plan** (sélecteur 5 presets dans le chargeur → ⚙️ Configuration → 🖼️ Tiling). Réglages affiche juste celui en cours.

> ⚠️ **Pour activer / modifier le code d'accès local (PIN / Face ID)**, il faut passer par **⚙️ Configuration sur la page d'accueil** — la section 🔐 Code d'accès local n'est PAS dans ⚙️ Réglages (par design — réglage critique global, pas par plan).

### 🎯 Calibrer l'échelle

Si l'appli te donne une distance différente de la réalité (par exemple 100 m affichés alors que tu sais qu'il y a 150 m sur le terrain) :

1. Mesure la distance dans l'appli avec **📐**
2. Ouvre **⚙️ → 🎯 Calibrer**
3. Saisis la **distance affichée** (100) et la **distance réelle** (150)
4. La nouvelle échelle s'affiche en temps réel
5. Clique **Appliquer** → la valeur est injectée dans le champ Échelle
6. Clique **Appliquer** dans la modale Réglages pour valider

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

> ⚠️ **C'est une barrière d'usage, pas un chiffrement des données.** Le verrouillage empêche l'ouverture normale de l'app, mais un attaquant motivé peut bypass via les DevTools. Les photos et sessions restent stockées en clair dans le navigateur. C'est exactement le même niveau de sécurité que le code d'accès communautaire existant — assumé honnêtement.

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

### Lockout : 5 tentatives ratées

Pour des raisons de sécurité, après **5 codes incorrects à la suite**, l'app est verrouillée **définitivement** sur un écran rouge sans bouton de sortie. La seule façon de récupérer l'accès est de **💥 Tout réinitialiser** depuis l'écran d'accueil (perte de la session en cours et des plans non mémorisés).

> Les biométries ratées ne comptent **pas** dans les 5 tentatives — la spec WebAuthn gère son propre lockout natif côté device. Tu peux annuler un Face ID par erreur sans craindre d'épuiser tes essais.

---

## 🔧 Réinitialiser

En cas de problème ou pour forcer une mise à jour, utilisez **⚙️ → 🗑️ Réinitialiser**. Cette action désinscrit le Service Worker, vide le cache et recharge l'application.

> ⚠️ Effectuez cette action uniquement avec une connexion Internet disponible. Sans réseau, l'application sera inutilisable jusqu'au prochain rechargement complet.

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
Utilisez **⚙️ → 🔄 Forcer la mise à jour** (mise à jour douce, conserve toutes vos données). Si insuffisant : **⚙️ → 🗑️ Réinitialiser** (purge totale, dernière option). La mise à jour douce est rapide grâce à un pré-téléchargement en arrière-plan.

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

- 🍃 **[Leaflet](https://leafletjs.com/)** — moteur cartographique interactif. Cœur de l'affichage des plans.
- 📦 **[JSZip](https://stuk.github.io/jszip/)** — lecture et écriture des archives `.zip` côté navigateur (plans, sessions, exports).
- 📤 **[jsPDF](https://github.com/parallax/jsPDF)** — génération de PDF imprimables (A0 → A4, portrait/paysage).
- 🧭 **Algorithme de Dijkstra** (1959) — calcul du plus court chemin pour les itinéraires assistés.
- 🌐 **[GPX 1.1 standard](https://www.topografix.com/gpx.asp)** — format d'échange avec TopoDroid, OsmAnd, Strava, Garmin et l'écosystème outdoor.
- 🛡️ **[Web standards](https://developer.mozilla.org/)** — Service Worker, IndexedDB, WebAuthn, FileSystemAccess API. Maintenus par des milliers de personnes qu'on ne croisera jamais et à qui on doit énormément.

### À l'écosystème PWA

Aux navigateurs (Chromium, Firefox, Safari, leur fork mobile) qui implémentent les standards modernes du web et permettent à une simple page de fonctionner comme une app native sans dépendance à un store.

### À l'assistant de développement

Une bonne partie du code de cette version a été co-écrite avec **Claude (Anthropic)**, assistant IA qui a accompagné le développement sur des dizaines de sessions. C'est un outil au même titre que Leaflet ou JSZip — utile, documenté honnêtement, et qui ne remplace ni la vision ni les décisions finales (toujours côté humain).

### À toi qui lis ce guide

Pour avoir pris 10 minutes à lire au lieu de cliquer aveuglément. C'est exactement l'état d'esprit que ces lieux demandent — **prendre le temps, comprendre avant d'agir, respecter ce qu'on ne maîtrise pas encore**.

> Si tu veux contribuer — un retour bug, une suggestion, un coup de main sur la doc — passe par l'issue tracker du repo ou les canaux habituels de la communauté.

---

**Crédits librairies & algorithmes** — 🍃 Leaflet (cartographie interactive) · 📦 JSZip (lecture/écriture des archives ZIP) · 📤 jsPDF (export PDF imprimable) · 🧭 Dijkstra (calcul du plus court chemin pour les itinéraires) · 🌐 GPX 1.1 (échange outdoor).

*MyKTAMap — Guide Utilisateur*
*Ces lieux sont fragiles. La discrétion est une forme de respect.*
