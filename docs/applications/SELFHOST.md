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
- Un **sous-titre à vous** (ex. « Gironde ») sur l'écran de démarrage et l'accueil — et sur les PDF exportés.
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
   - propose sous-titre + les 2 réglages kiosque ;
   - vous fait télécharger l'`index.json` final → déposez-le en `data/index.json`.
4. **C'est en ligne.** Les visiteurs voient vos plans, votre sous-titre, vos liaisons.

## Le fichier `data/index.json` (référence rapide)

```json
{
  "config": {
    "subtitle": "Gironde",
    "serverPlansOnly": true,
    "disableGenerator": true
  },
  "plans": [
    { "id": "carrieres-nord", "path": "data/carrieres-nord", "name": "Carrières Nord",
      "version": "V2.1", "author": "Asso X", "multiLevel": true, "tiledV2": true }
  ],
  "liaisons": { "version": 1, "links": [ /* généré par confadmin — ne pas écrire à la main */ ] }
}
```

- Tous les blocs sont **optionnels** sauf `plans`. Un champ inconnu est ignoré (vieilles versions comprises).
- `subtitle` : remplace « Cartographie souterraine » (démarrage, accueil, en-tête des PDF exportés). Le nom MyKTAMap reste.
- `serverPlansOnly` : masque l'import de plans (dropzone « Ajouter un plan ») et les réglages serveur devenus inutiles.
- `disableGenerator` : masque le Générateur dans les Outils.
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
