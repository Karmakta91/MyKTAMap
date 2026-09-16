# QCM de test — v1.95.0 : mode Dossiers, étiquettes à la génération, copie réelle des ZIP

> Pour KARMA, sur https://dev.myktamap.fr après déploiement (ou en local). Chaque question a **une seule bonne réponse attendue**, marquée ✅. Une autre réponse = bug à me remonter avec le numéro de la question.
> Prérequis : au moins 10 plans dans « Mes plans », dont 2 avec l'étiquette « test » (ℹ️ Infos → Tags du plan). Fais un **Ctrl+F5** d'abord (le service worker change de cache en v1.95.0).

---

## A. Le mode Tout ne bouge pas (contrainte stricte)

**A1.** Au chargement de l'accueil, la ligne de titre « 📚 Mes plans » montre :
- a) le titre seul, comme avant
- b) ✅ le titre à gauche et un petit sélecteur **Tout | Dossiers** à droite, « Tout » actif, **sans que la ligne soit plus haute**
- c) une nouvelle rangée sous le titre

**A2.** En mode Tout, par rapport à la v1.94.0, la liste des plans :
- a) ✅ est identique (mêmes lignes, chips, filtre par nom, ⭐, ℹ️) — seul un plan déjà rangé porte une pastille de couleur devant son nom
- b) a perdu les chips d'étiquettes
- c) a un bouton 📁 sur chaque ligne

**A3.** Toujours en mode Tout, la Vue OSM, les Outils et « Ajouter un plan » :
- a) ✅ sont exactement à leur place, même hauteur
- b) ont glissé vers le bas

---

## B. Créer et ranger

**B1.** Clique « Dossiers ». Tu vois :
- a) une liste vide
- b) ✅ tous tes plans sous un en-tête **« Non classés »**, un bouton **➕** et un bouton **☑** apparus dans la ligne de titre, les chips d'étiquettes disparues
- c) la même liste qu'en Tout

**B2.** Clique ➕, tape « Gironde », choisis une couleur, Entrée. Résultat :
- a) ✅ un en-tête « Gironde · 0 » avec sa pastille de couleur, déplié, avec le texte « Aucun plan — glisse un plan ici… »
- b) rien ne se passe
- c) le dossier est créé mais replié

**B3.** Sur une ligne de « Non classés », clique le bouton **📁**, puis « Gironde » dans la feuille. Le plan :
- a) ✅ passe sous « Gironde », le compteur devient 1, une notification « 📁 1 plan(s) déplacé(s) » apparaît, et le dossier reste déplié
- b) s'ouvre (la carte se charge)
- c) disparaît de la liste

**B4.** Clique ☑ : une barre « 0 sélectionné(s) · 📁 Déplacer vers… · Terminer » apparaît **en tête de liste** (elle reste visible quand tu défiles). Clique sur deux lignes de « Non classés », puis « 📁 Déplacer vers… », puis « Gironde ». Résultat :
- a) le premier clic sur une ligne a ouvert le plan
- b) ✅ les deux lignes se sont cochées sans rien ouvrir, elles sont passées dans « Gironde », et la barre de sélection a disparu
- c) une seule ligne a bougé

**B5.** Clique sur l'en-tête « Gironde » (pas sur ⋮). Puis recharge la page (F5) et repasse en Dossiers si besoin. Le dossier :
- a) ✅ s'est replié, et **reste replié après F5** (le repli est mémorisé), la liste s'est rouverte en mode Dossiers (le mode aussi)
- b) s'est replié mais est de nouveau ouvert après F5
- c) le mode est revenu à Tout après F5

**B6.** *(PC uniquement, à la souris)* Prends une ligne de « Non classés » et **glisse-la** sur l'en-tête « Gironde ». Puis, sur une autre ligne, fais un **simple clic** sans bouger.
- a) ✅ le glisser a rangé le plan (l'en-tête s'est surligné en jaune pendant le survol) ; le simple clic a **ouvert** le plan comme avant
- b) le glisser a ouvert le plan au lieu de le ranger
- c) le simple clic n'ouvre plus le plan
> ℹ️ Le glisser HTML5 est le seul geste que mon automate n'a pas pu rejouer : c'est la réponse la plus importante de ce QCM.

**B7.** *(Téléphone ou mode tactile)* Pose le doigt sur une ligne **sans bouger** pendant une demi-seconde, puis glisse-la sur l'en-tête d'un dossier et relâche. Ensuite, glisse tout de suite le doigt sur la liste.
- a) ✅ la ligne se soulève (petite vibration) **sans que son texte se surligne ni qu'un menu de copie apparaisse**, une seule copie suit le doigt (la ligne d'origine n'est plus qu'une empreinte pointillée), **le doigt collé en haut ou en bas de l'écran fait défiler la liste** pendant le geste (et s'arrête à la fin de « Mes plans », sans continuer vers la Vue OSM), l'en-tête se surligne, le plan est rangé au relâcher ; et le geste immédiat fait **défiler** la liste normalement
- b) la ligne ne se soulève jamais (seul 📁 range)
- c) la liste ne défile plus du tout après le premier geste

---

## C. ⋮ Options d'un dossier

**C1.** ⋮ sur « Gironde » → change le nom en « Gironde Sud », choisis une autre couleur, ferme. Résultat :
- a) ✅ l'en-tête et les pastilles des plans du dossier prennent le nouveau nom et la nouvelle couleur immédiatement
- b) le nom change mais pas la couleur
- c) il faut F5

**C2.** Crée un deuxième dossier « Calcaire ». ⋮ sur « Calcaire » → ▲ (Monter). Puis ⋮ → 🗑️ Supprimer → confirme.
- a) ✅ « Calcaire » est passé au-dessus de « Gironde Sud », puis a disparu ; **ses plans (s'il en avait) sont revenus dans « Non classés »**, aucun plan n'a disparu de la liste
- b) la suppression a aussi retiré des plans de « Mes plans »
- c) Monter n'a rien fait

**C3.** ⋮ sur « Gironde Sud » → essaie de le renommer exactement comme un autre dossier existant (crée « Silex » avant, puis tente « silex »).
- a) ✅ refus, message « Ce nom est déjà pris par un autre dossier. »
- b) deux dossiers « Silex » coexistent

---

## D. Règles par étiquette (marche 2)

**D1.** Repasse en **Tout**. Coche la chip « test ». Un bouton **📁+** apparaît en bout de bandeau de chips. Clique-le.
- a) ✅ l'app bascule en Dossiers, un dossier « test » existe, **déplié**, contenant tous les plans étiquetés « test », leur pastille a un **contour** (rangés par règle)
- b) rien ne se passe
- c) le dossier est créé vide

**D2.** Dans ℹ️ Infos d'un plan **non** étiqueté, ajoute l'étiquette « test », enregistre, reviens à la liste (Dossiers).
- a) ✅ ce plan est entré tout seul dans le dossier « test »
- b) il reste en Non classés

**D3.** Sur un plan du dossier « test » (rangé par règle), bouton 📁 → « Non classés ». Puis ⋮ sur « test » → vérifie que la règle « test » est toujours là.
- a) ✅ le plan est sorti et **reste** en Non classés même si la règle est intacte (exclusion mémorisée) ; le remettre avec 📁 → « test » le fait revenir
- b) le plan revient tout seul dans « test » au rendu suivant
- c) la règle a été effacée

**D4.** ⋮ sur « Gironde Sud » → champ « 🏷️ Règle » : tape « test », ferme. Puis regarde où sont les plans « test ».
- a) ✅ les plans « test » **rangés à la main** dans un autre dossier n'ont pas bougé ; ceux qui étaient en Non classés sont entrés dans le **premier** dossier (dans l'ordre) qui porte la règle
- b) tous les plans « test » ont été arrachés de leur dossier manuel

---

## E. Import multiple et Générateur

**E1.** 📦 Importer plusieurs plans → l'écran montre, au-dessus de « Précharger le ZIP » :
- a) ✅ un sélecteur « 📁 Ranger dans : » avec Non classés, tes dossiers, et « ➕ Nouveau dossier… » (qui dévoile un champ de nom)
- b) rien de nouveau

**E2.** Importe 2 ZIP avec « ➕ Nouveau dossier… » nommé « Lot import ». Après « Voir mes plans » :
- a) ✅ un dossier « Lot import » contient les 2 plans, **et** ils s'ouvrent depuis la liste sans resélectionner leur ZIP
- b) les plans sont en Non classés
- c) la liste redemande le ZIP à l'ouverture

**E3.** Générateur → 📋 Informations du plan : après « Auteur », un champ **🏷️ Étiquettes**. Génère un plan avec « qcm, test » et importe-le.
- a) ✅ dans la liste, le plan porte les étiquettes « qcm » et « test », et entre tout seul dans le dossier « test »
- b) le champ n'existe pas
- c) les étiquettes n'apparaissent pas

**E4.** Sur ce plan, change ses étiquettes à la main (ℹ️ Infos → « mien »), puis réimporte le **même ZIP**. Ses étiquettes sont :
- a) ✅ « mien » (les tiennes gagnent, le fichier propose)
- b) « qcm, test » (le fichier a écrasé)

**E5.** ⚙️ Configuration de l'accueil → la case **« 💾 Mémoriser le plan dans l'app au premier chargement »** est :
- a) ✅ présente (section du Carnet), cochée, et il n'y a **plus** ni case « Mémoriser » ni bouton « 🔐 Autoriser l'accès permanent » sur l'accueil
- b) absente
- c) l'accueil a encore la case ou le bouton

**E6.** Charge un ZIP depuis l'accueil, reviens à la liste, **déplace ou renomme le ZIP sur ton disque**, puis clique le plan dans la liste.
- a) ✅ il s'ouvre (vraie copie dans l'app)
- b) « Données du plan introuvables » ou « archive illisible »

---

## F. Profil et serveur

**F1.** Exporte ton profil, puis importe-le en mode **Fusionner** sur le même appareil.
- a) ✅ aucun dossier en double, tes plans sont restés où ils étaient
- b) les dossiers sont doublés (« Gironde Sud » ×2)

**F2.** *(Si tu as une instance kiosque avec ConfAdmin)* Déclare un dossier « Serveur » dans ConfAdmin (section 📁 1 bis), range un plan dedans, publie l'index, ouvre l'app.
- a) ✅ le dossier apparaît avec un 🌐 ; ⋮ dessus montre « Dossier défini par le serveur… », nom et suppression grisés ; tu peux quand même déplacer le plan ailleurs, et après un rechargement **il y reste**
- b) le plan revient dans le dossier serveur au rechargement
- c) tu peux renommer/supprimer le dossier serveur

**F3.** *(Idem)* Coche « Ouvrir Mes plans en mode Dossiers par défaut » dans ConfAdmin, republie, ouvre l'app dans un **navigateur vierge** (ou après reset), puis clique « Tout ».
- a) ✅ la liste s'ouvre en Dossiers ; après ton clic sur « Tout », elle rouvre en Tout à chaque fois (ton choix prime)
- b) elle rouvre toujours en Dossiers malgré ton clic

---

## G. Documentation

**G1.** 📖 Documentation et ❓ Aide (bibliothèque de plans) : cherche « (v1. » ou « depuis v1 ».
- a) ✅ aucune mention de numéro de version dans les textes
- b) il en reste (dis-moi où)

**G2.** Générateur, mode Avancé, « Tout afficher » : la section 🧭 Tracking est :
- a) ✅ sous « Charger un fichier », à côté d'« Informations du plan »
- b) encore au-dessus de « Charger un fichier »

---

Réponds-moi au format `A1:b B3:a …` pour les écarts seulement — tout ce que tu ne cites pas est considéré ✅.
