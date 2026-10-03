# ❓ Audit de l'aide intégrée — v1 (03/10/2026)

> **Objet** : les 35 fiches du hub ❓ (`aide.sec.<slug>.titre / .html`, fr/en/es) + 15 clés d'interface (`aide.ui.*`,
> `aide.cat.*`, `aide.intro`), leur rangement (`js/interfaceDocs.js` : `AIDE_SECTIONS`, `AIDE_CATEGORIES`,
> `AIDE_PAR_MODALE`). 67 k caractères de texte FR (hors balisage).
> **Demande KARMA** : même démarche que l'audit du guide (`2026-10-03_audit-guide-utilisateur-v1.md`) ; priorité :
> éviter l'indigestion. Une aide = une **référence rapide** par fonction, pas un second guide.
> **Méthode** : 3 lectures intégrales en parallèle (12 + 12 + 11 fiches + clés d'interface), chaque affirmation
> confrontée au code (preuves fichier:ligne) et au guide réécrit. Lecture seule.

---

## 0. À corriger d'abord

| # | Problème | Où |
|---|---|---|
| A1 | **Donnée réelle** : le nom d'un réseau souterrain réel sert d'exemple d'homonymes | `bibliotheque-plans` ×3 |
| A2 | **Indice de localisation** : un nom de département — celui que le code donne aux relevés réels — sert d'exemple d'étiquette ; une anecdote d'export situe le site | `vue-osm` ×3, `gen.infos.tagsPlaceholder`, `home.plans.folders.rulePlaceholder` ; `enregistrer` |
| A3 | Coordonnées d'exemple historiques (banlieue sud) au lieu de l'exemple neutre du guide | `recherche` ×3 (+ `docs/architecture/tracking.md`, `AI_CONTEXT.md`) |
| A4 | **Le guide réécrit porte encore 4 erreurs** : batterie dans le pied d'une fenêtre retirée ; repère « à gauche de la batterie » (désactivée par défaut) ; règle de réimport d'un plan périmée depuis v1.79.1 (tout ZIP de même nom qu'un plan local pose la question, `homeLoader.js:427-444`) ; vibration de la Sortie d'urgence conditionnée à l'option (elle vibre toujours, classe urgence, `sortieUrgence.js:259,272`) | `README_USER` ×3 |

## 1. Diagnostic

- **Faits faux dans plus de 20 fiches**, recopiés à l'identique en EN et ES. Les plus nets (preuves dans les rapports) :
  favoris « non exportés » (ils s'exportent, `favoris.js:221`) ; PIN « seule solution : réinstaller » (verrou
  temporaire, `pinLock.js:59`) ; podomètre « par plan » (global) ; bouton « Exporter ta liste » disparu ; « l'export de
  profil n'embarque pas les archives » (il les embarque) ; SIG « plafond 20 000 » (alerte 20 000, refus 60 000) ;
  Tracker « 11 actions » (13 tuiles, 3 sections) ; 2e masse « niveau −1 » (niveau actif −1) ; distance totale « calques
  visibles, 3 cases » (tous les calques, types personnalisés compris) ; itinéraire vivant « propose toujours un recalcul »
  (coupe derrière sur le trajet) ; « Mode panique » (libellé réel : Mode urgence — Affichage XL) ; pied de la fenêtre de
  session et « 📋 Session active » (devenue « 📊 Détails de la session ») ; PDF Histoire « non supprimable » ; ✕ des
  liaisons « choix retenu » (c'est « – ») ; renvois de dépannage vers « CDN GitHub Pages ».
- **Rangement incohérent** : `zones` dans « Données & session », `depannage` et `sortie-urgence` dans « Outils
  carte », `code-acces` (OFF par défaut) en « Prise en main », `creer-modifier-plan` en « Système ».
- **Fiches manquantes** : ⛑️ Je suis perdu, 🚨 Mode urgence — Affichage XL (noyés dans `tracker`, 6,9 k), 🗺️
  Itinéraire et 🪧 Guidage (dans `mesure`), 🧹 Corriger (convertir / supprimer, répété dans 3 fiches), 🏗️ Multi-niveau.
- **Bruit** : historique (« désormais », « 🆕 », « avant »), jargon (SHA-256, WebAuthn, PDR, IndexedDB, pathfinder,
  polyline, codes `cao/peo/eso`), comptages, défensif — mêmes motifs que le guide.
- **Volume** : `mode-secours` 10,9 k, `tracker` 6,9 k, `charger-import` 5,6 k, `carnet` 5,2 k, `liaisons` 5,1 k.
- **Parité** : `legende` EN à 52 % du FR ; `import-sig` ES dit l'inverse du FR (routage libre) ; `charger-import` EN
  incomplet.
- **Hub** : titre « Référence des boutons » et intro périmés (le hub présente des fiches par fonction).

## 2. Cible

**8 catégories, alignées sur le guide** : 🚀 Prise en main · 🆘 Urgence · 🗺️ Carte et recherche · 📍 Se repérer et
itinéraire · ✏️ Annoter · 📔 Mes données et partage · ⚙️ Réglages et dépannage · 🔭 Pour aller plus loin (fonctions
désactivées par défaut, Mode Secours, créateurs de plans).

**5 fiches nouvelles** : `je-suis-perdu`, `urgence-xl`, `itineraire`, `corriger`, `multi-niveau`. Aucun slug existant
n'est renommé ni supprimé (le ❓ contextuel et le code y renvoient) : les doublons sont résolus par le contenu.
❓ contextuel à étendre aux fenêtres Itinéraire, Sortie d'urgence, Je suis perdu, Conversion (si leur en-tête le permet).

**Volume** : 67 k → ~30 k FR. Chaque fiche : ce que fait la fonction, où est le bouton, l'essentiel en quelques lignes,
puis « → 📖 Documentation » pour le détail.

## 3. Lots

| Lot | Contenu |
|---|---|
| **A1** | §0 : données réelles (aide, dictionnaires d'interface, docs d'architecture, AI_CONTEXT) + les 4 erreurs du guide |
| **A2** | Rangement : 8 catégories, 5 fiches nouvelles (squelette), ❓ contextuel étendu |
| **A3** | Réécriture des 40 fiches fr/en/es (corrections de §1 comprises, règles d'écriture de l'audit du guide §2) |
| **Contrôle final** | Hub ouvert dans un navigateur (3 langues) : chaque fiche s'ouvre, recherche, ❓ contextuels, aucune erreur JS |

## 4. État (03/10/2026) — lots appliqués

| Lot | Commit | Résultat |
|---|---|---|
| A1 | `f51e63d` | Exemples neutres (aide, dictionnaires, SELFHOST, AI_CONTEXT, NETWORK_AUDIT, tracking.md) ; 4 erreurs du guide corrigées |
| A2 | `fbce47a` | 8 catégories, 5 fiches nouvelles, ❓ contextuel sur 20 fenêtres ; `check-aide-contextuelle` cherche l'en-tête dans le fichier qui crée la modale |
| A3 | `31d8dec` | 35 fiches réécrites fr/en/es (4 agents, faits vérifiés dans le code) : texte FR des 40 fiches 71 k → 36 k |
| Contrôle final | (ce commit) | Navigateur fr/en/es : titre, 8 catégories, 41 lignes, chaque fiche rendue, recherche, ❓ Itinéraire et Je suis perdu, aucune erreur JS ; pré-commit vert. Erreurs relevées en relisant le code, corrigées : guide (PIN oublié : l'accueil reste inaccessible derrière le verrou ; « 📤 Exporter CSV » ; « 📦 Ajouter un plan » ; réglage du carnet dans ⚙️ Configuration ; 🌍 sans condition de tuiles ; ≡ Filtres) et dictionnaires (tutoriel carte 6, import de profil, pied d'export de profil qui niait les archives, exemple d'étiquettes localisant, infobulle de l'éditeur de légende) |

Cible de ~30 k non atteinte (36 k) : plusieurs fiches à 1-1,3 k gardent un parcours complet plutôt qu'un renvoi. Reliquats : `docs/BACKLOG.md`.
