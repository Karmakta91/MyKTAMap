# 🏗️ SELFHOST — Héberger votre instance MyKTAMap (mode « kiosque »)

> Guide pour déployer une instance MyKTAMap avec **vos plans pré-installés** —
> l'archétype : une asso qui publie les plans de son secteur pour ses membres.
> Aucun backend, aucune base de données : **des fichiers statiques, c'est tout.**

---

## Ce que vous obtenez

- Votre copie de MyKTAMap, servie par n'importe quel hébergement de fichiers
  (mutualisé FTP, GitHub Pages, nginx, Docker — cf. section Docker du README utilisateur).
- Vos plans visibles dès l'ouverture dans « 📚 Mes plans » (badge 🌐), chargés en 1 clic.
- Vos **liaisons inter-plan** (portails) livrées d'office à tous les visiteurs.
- Un **sous-titre à vous** (ex. « Club spéléo du Nord ») sur l'écran de démarrage et l'accueil — et sur les PDF exportés.
- Optionnel : masquer l'import de plans et/ou le Générateur pour une interface « consultation ».
- Les visiteurs gardent TOUTES leurs données en local (sessions, carnet, notes, photos) : rien ne transite par votre serveur.

## Étapes

1. **Récupérer l'app** : téléchargez une release (ou clonez le repo) et déposez tout le contenu sur votre hébergement.
2. **Préparer vos plans** : chaque plan est un ZIP généré par MyKTAMap (Générateur, ou export d'un plan existant).
   Décompressez chaque ZIP dans `data/<id>/` — le dossier doit contenir `plan-config.json` à sa racine.
   L'`<id>` est à vous (minuscules, sans espace) : `data/carrieres-nord/`, `data/reseau-sud/`…
3. **Générer `data/index.json`** : ouvrez **`confadmin.html`** à la racine de votre instance
   (ex. `https://votre-site.fr/confadmin.html`). La page :
   - lit vos ZIPs (localement, rien n'est envoyé) et pré-remplit la liste des plans ;
   - récupère vos liaisons (profil du navigateur ou export de profil) et **remappe les identifiants**
     vers ceux de votre instance — indispensable, les ids locaux n'existent que sur votre appareil ;
   - propose sous-titre, les 2 réglages kiosque, et un **mot de passe d'accès propre à votre instance**
     (seul son **hash SHA-256** part dans le fichier — le mot de passe lui-même ne quitte pas votre navigateur) ;
   - permet de **taguer chaque plan** (colonne « Tags », séparés par des virgules) — ces étiquettes
     arrivent chez vos visiteurs et alimentent les chips-filtres de leur accueil ;
   - sait **reprendre un `index.json` déjà en ligne** (bouton « 📂 Reprendre un index.json existant ») :
     pour corriger un nom ou une étiquette, **inutile de redéposer vos ZIP** — les liaisons du fichier
     repris sont conservées telles quelles ;
   - vous fait télécharger l'`index.json` final → déposez-le en `data/index.json`.
4. **C'est en ligne.** Les visiteurs voient vos plans, votre sous-titre, vos liaisons.

## Le fichier `data/index.json` (référence rapide)

```json
{
  "config": {
    "subtitle": "Club spéléo du Nord",
    "serverPlansOnly": true,
    "disableGenerator": true,
    "accessHash": "89e39e…（SHA-256 du mot de passe, 64 caractères hexadécimaux）"
  },
  "plans": [
    { "id": "carrieres-nord", "path": "data/carrieres-nord", "name": "Carrières Nord",
      "version": "V2.1", "author": "Asso X", "multiLevel": true, "tiledV2": true,
      "tags": ["calcaire", "carrière"] }
  ],
  "liaisons": { "version": 1, "links": [ /* généré par confadmin — ne pas écrire à la main */ ] }
}
```

- Tous les blocs sont **optionnels** sauf `plans`. Un champ inconnu est ignoré (vieilles versions comprises).
- `subtitle` : remplace « Cartographie souterraine » (démarrage, accueil, en-tête des PDF exportés). Le nom MyKTAMap reste.
- `serverPlansOnly` : masque l'import de plans (dropzone « Ajouter un plan ») et les réglages serveur devenus inutiles.
- `disableGenerator` : masque le Générateur dans les Outils.
- `serverConnection` (v2.0.0) : **réservé aux instances qui greffent des modules de connexion à un serveur.**
  Un kiosque n'en a pas besoin : sans ce champ, l'app affiche « Base de données : désactivée » dans son pied de page.
  Forme : `{ "state": "on", "api": "https://api.exemple.org", "modules": ["pro/sync.js"] }` — `api` en
  `https://` (elle peut vivre sur un autre domaine que l'app : ajoutez alors son origine à `connect-src`
  dans votre CSP), `modules` = chemins **sur le même site que l'app** (20 max). Dans cette version, l'app
  **ne contacte pas** `api` et **ne charge aucun module** : elle affiche seulement l'état à vos visiteurs —
  « Licence requise » tant qu'aucun `Licence-pro.json` n'est posé à la racine, « Configurée, aucun module »
  sinon, « Configuration invalide » (en rouge, visible de tous) si le champ est mal formé. ConfAdmin
  (bloc 🔌, replié) écrit ce champ avec les mêmes règles et refuse de télécharger un index invalide.
  Contrat complet : `docs/architecture/community-server-line.md` §3.
- `plans[].tags` : étiquettes proposées pour ce plan (**12 max, 24 caractères chacune** ; au-delà, l'app
  rogne). Elles s'affichent sous le nom du plan chez le visiteur et servent ses chips-filtres.
  **L'index propose, l'utilisateur dispose** : dès qu'un visiteur édite les étiquettes d'un plan, les
  vôtres ne l'écrasent plus jamais — et s'il vide le champ, elles ne repoussent pas. Vous restez maître
  de celles que **vous** avez posées : les retirer de votre index les retire chez lui.
- ⚠️ **`serverPlansOnly` refuse aussi l'import de profil** (depuis v1.90.1). Un profil rapporterait des
  plans que votre instance ne propose pas, et surtout il transporte les préférences d'affichage : importé
  avec « afficher les plans du serveur » décoché, il **vidait l'accueil** — et la case pour le rétablir est
  justement masquée par le mode. L'**export** de profil, lui, reste ouvert : les données du visiteur lui
  appartiennent.
- `accessHash` : SHA-256 d'un **mot de passe propre à votre instance**. Vos visiteurs peuvent alors ouvrir
  l'app avec **ce** mot de passe, **et lui seul** : dès que vous en publiez un, le code communautaire
  n'ouvre plus votre instance (v1.90.7). 🩸 *Sinon quiconque connaît le code communautaire — distribué
  largement, il ouvre la prod qui n'héberge rien — ouvrirait votre instance, et le mot de passe ne
  protégerait rien.*
  - 🔒 **Et aucune licence pro ne contourne ce mot de passe** (v1.90.8, complété v1.90.9) : dès que vous
    publiez un `accessHash`, ni un `Licence-pro.json` importé par le visiteur, ni celui que **vous** servez
    (`/Licence-pro.json` côté serveur) n'ouvre l'app sans le mot de passe. 🩸 *Le vôtre est fetché par TOUS
    les visiteurs : le laisser bypasser aurait rendu votre mot de passe muet — tout le monde serait entré.*
    La licence accorde le **mode pro** (les outils d'édition) APRÈS la saisie du mot de passe ; elle n'est
    plus une clé d'accès.
  Pratique pour un club : vous distribuez votre mot de passe à vos membres sans avoir à leur transmettre
  celui de la communauté.
  - 🔒 **Ce que ça vaut, exactement.** `index.json` est un fichier **public** : n'importe qui peut le
    télécharger et tenter de retrouver le mot de passe hors ligne. C'est **exactement** la situation du code
    communautaire, dont le hash est lisible sur GitHub depuis toujours — le niveau de protection ne baisse
    donc pas, mais **il ne monte pas non plus**. C'est une barrière **sociale** (« il faut connaître le
    code »), **jamais une authentification**. N'y mettez rien que vous ne diriez pas à voix haute.
  - **Le changer** re-demande le mot de passe à vos visiteurs **dès leur prochain lancement de l'app** (v2.6.0) — jamais au milieu de
    leur session. **Le retirer** de l'index re-demande aussi. En revanche, un visiteur **hors ligne** garde
    son accès : une coupure réseau ne doit pas enfermer quelqu'un dehors.
- ⚠️ Ces réglages **allègent l'interface**, ils ne « sécurisent » rien : MyKTAMap community n'est pas bridable, par principe.

## À savoir

- **Propagation** : `index.json` est relu au réseau à chaque démarrage — vos modifications
  (plan ajouté, sous-titre changé) apparaissent au prochain lancement des visiteurs, sans manipulation.
- **Hors-ligne** : l'app elle-même marche offline dès la première visite. Un plan, lui, doit avoir été
  **ouvert une fois en ligne** pour être disponible hors-ligne sur l'appareil du visiteur.
- **Liaisons** : elles sont fusionnées dans le registre local du visiteur (il peut créer les siennes en plus).
  Une liaison retirée de votre `index.json` ne disparaît pas chez ceux qui l'ont déjà reçue.
- **Mise à jour de l'app** : re-déposez simplement les fichiers d'une release plus récente ;
  votre `data/` et votre `index.json` ne bougent pas.
- **Licence** : MyKTAMap est sous **CC BY-NC-SA 4.0** — l'usage commercial d'une instance
  nécessite un accord préalable de l'auteur (KARMA).
