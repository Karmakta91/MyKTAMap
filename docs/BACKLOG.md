# 📋 Backlog — MyKTAMap

> Fichier de travail KARMA ↔ Claude : **seulement le travail ouvert**, rangé par horizon. Pas un journal (`README.md`
> et les commits le sont) : une entrée soldée est **supprimée**, pas barrée (`git log -p docs/BACKLOG.md`).
> Ailleurs : les pistes et leur déclencheur → `docs/IDEES.md` ; les sujets enterrés, acceptés, les leçons et les
> décisions closes → `docs/DECISIONS_FERMEES.md` (à lire avant de reproposer un sujet).

## Avant de traiter une entrée

- **Vérifier avant d'agir.** Un inventaire sourcé depuis la doc s'est révélé **faux à 30 %** : une entrée ancienne
  pose une limite qu'une entrée plus récente lève. Niveau de preuve dans le corps : ✅ **vérifié** dans le code
  (date), ⚠️ **doc seule**, 🔬 **hypothèse**. Avant d'agir : `grep` le symbole dans `js/`, vérifier `index.html`
  et `sw.js > ASSETS_TO_CACHE`. Dans les deux sens : une entrée soldée qui traîne fait reproposer un chantier fait.
  **Reclore le jour même.**
- **Tester sur appareil APRÈS un bump** : un téléphone garde l'ancien JS jusqu'au changement de `CACHE_NAME`. La
  validation iOS/Safari d'un changement de rendu vit dans `docs/RELEASE_GATE.md`.
- **Format** (lu par `scripts/check-backlog.js`, avertissement au pre-commit, et par la vue du backlog) :
  - sections, dans cet ordre : `## Maintenant` (**10 entrées au plus**), `## Ensuite`, `## Plus tard`,
    `## Entrant` (demandes reçues pendant un lot, triées au point suivant) ; ce préambule ne porte que des règles ;
  - une entrée = une puce `- **Titre** — corps`, **3 lignes au plus** (au-delà : un lien vers l'étude ou la doc),
    puis ses métadonnées en un seul bloc entre accents graves (sur une ou plusieurs lignes), champs séparés par
    ` · ` : `qui: Claude · action: … · fini: … · depuis: 20/10/2026 · taille: S` ;
  - `qui` = qui fait la **prochaine** action (`KARMA` | `Claude`) · `action` = cette action, concrète ·
    `fini` = critère de fin vérifiable · `depuis` = date d'ouverture JJ/MM/AAAA, jamais réécrite au ménage ·
    `taille` = `XS` | `S` | `M` | `L` ; facultatif : `lot` (branche du lot en vol). Aucun accent grave dans
    une valeur ;
  - dans `## Entrant`, les métadonnées sont facultatives : le tri les pose.

## Maintenant

- **Train : sortir la v2.18 en prod** — bump v2.18.0 posé le 18/10, des commits sont arrivés après (les notes ne
  décrivent plus ce qui part). Porte : `docs/RELEASE_GATE.md`.
  `qui: KARMA · action: geler Karma_dev, faire refaire les notes de v2.18.0, vérifier la prise d'export limité
  · fini: main mergé, etat-sites.ps1 vert · depuis: 18/10/2026 · taille: M`
- **Vue OSM : points sous les tuiles du plan** — 🔬 KARMA (plan multi-niveau, iPhone PWA et PC) : une partie des POI
  paraît derrière les tuiles ; case 🖼️ Plan décochée ou opacité 0 % → nettes. ✅ Non reproduit au harnais (Chromium).
  Journal d'enquête : `git log -S"sous les tuiles" -- docs/BACKLOG.md`.
  `qui: KARMA · action: donner le parcours exact (navigateur PC, changement de niveau ou de plan, réouverture)
  · fini: reproduit et corrigé, ou fermé « non reproduit » avec ce parcours · depuis: 16/10/2026 · taille: S`
- **Retour testeur « inutilisable dans les seconds niveaux »** — retour prod ; on ne sait pas ce qui est cassé (plan,
  itinéraire, lisibilité ?). La jauge de stockage et les alertes de saturation sont livrées depuis.
  `qui: KARMA · action: demander au testeur le plan et le geste · fini: symptôme reproductible écrit, ou entrée fermée
  · depuis: 10/10/2026 · taille: XS`
- **Sonar : faux positifs à accepter** — `mdParser.js` ×2 (caractères de contrôle = balises internes), `css/style.css`
  ×2 (`height: 44px` = repli avant `calc(env(safe-area…))`), `index.html` barre de profil (clavier géré en JS, CSP
  sans attribut inline).
  `qui: KARMA · action: les marquer « Accepté » dans l'interface Sonar locale
  · fini: 0 bug ouvert sur le projet MyKTAMap · depuis: 09/10/2026 · taille: XS`
- **Ménage des branches et des copies** — 8 branches `g*` non mergées, copie de travail restée sur une branche déjà
  mergée, PR Dependabot en attente (les PR de sécurité ne sont pas lues).
  `qui: KARMA · action: supprimer les branches mortes, fusionner ou fermer chaque PR Dependabot
  · fini: aucune branche morte, 0 PR Dependabot ouverte · depuis: 20/10/2026 · taille: XS`

## Ensuite

- **Mettre à jour le plan (assistant)** — décidé en QCM : de la session et des calques au Générateur en mode Modifier,
  puis nouvelle version du plan. Les lots préalables (calques effacés, ajouts intégrés, export en modification) sont
  intégrés. Décisions : `docs/ETUDE_MAJ_PLAN.md`.
  `qui: Claude · action: lot après le guide utilisateur de l'installation (une feature phare à la fois)
  · fini: assistant intégré, doc d'architecture à jour · depuis: 19/10/2026 · taille: L`
- **Changer le niveau d'un objet** — sur la fiche d'un POI, d'un tracé, d'une zone ou d'une structure de session,
  choisir son niveau (fixé à la création aujourd'hui). Pièges et périmètre : `docs/ETUDE_MAJ_PLAN.md` § Niveau d'un
  objet.
  `qui: Claude · action: lot (QCM fait le 20/10, décisions dans l'étude)
  · fini: niveau modifiable et annulable, garde-fou étendu · depuis: 19/10/2026 · taille: M · lot: niveau-objet`
- **Pastille hors-ligne : coût et états non mesurés** — 🔬 coût de `SwInspector.etat()` sur un vieux téléphone (3-7 ms
  sur PC) ; états orange et thème clair jamais vus en navigateur.
  `qui: Claude · action: mesurer au harnais en CPU ralenti, capturer les états orange et clair
  · fini: mesure notée dans perf-memory.md, captures vues · depuis: 03/10/2026 · taille: S`
- **PDF « HD » plafonné en silence** — ⚪ sur iPhone le PDF réduit sa résolution sous 16,7 Mpx (`exporter.js >
  _publicGenererCanvas`) sans le dire ; l'export image propose déjà « 📱 Max iPhone ».
  `qui: Claude · action: dire à l'utilisateur la résolution réellement produite
  · fini: message affiché quand le plafond agit · depuis: 17/10/2026 · taille: S`
- **Test appareil : lockout temporisé** — PIN et gate : 5 codes faux → compte à rebours → retour du pavé
  (`security-legal.md` §36.3).
  `qui: KARMA · action: jouer le parcours sur un téléphone · fini: parcours vu conforme, ou bug ouvert
  · depuis: 13/09/2026 · taille: XS`
- **Test appareil : stockage saturé** — bandeau persistant + 💾 Exporter tant que la sauvegarde échoue.
  `qui: KARMA · action: saturer un téléphone de test · fini: bandeau et export vus, ou bug ouvert · depuis: 13/09/2026
  · taille: S`
- **Test appareil : Mode Secours sur iPhone** — « Suivre mon parcours » (permission des capteurs dans le geste),
  recalage à la validation d'une étape (question au-delà de 30 m), écran XL avec un long itinéraire, « Retour
  impératif ».
  `qui: KARMA · action: jouer les 4 gestes sur iPhone · fini: 4 gestes vus conformes, ou bugs ouverts
  · depuis: 30/09/2026 · taille: S`
- **Test appareil : photos et export** — réimport d'une session ZIP ; refus au-delà de 5 photos ; analyse d'un gros
  plan depuis l'accueil (Safari ≥ 16.4) ; export image d'un plan tuilé hors-ligne.
  `qui: KARMA · action: jouer les 4 cas sur iPhone · fini: 4 cas vus conformes, ou bugs ouverts · depuis: 12/10/2026
  · taille: S`
- **Test appareil : balayage Secours** — temps de « Découper en secteurs » sur un vieux téléphone ; « Suivre mon
  parcours » en balayage (un écart rejoint le circuit là où l'équipe en était, pas au début).
  `qui: KARMA · action: chronométrer le découpage, faire un écart sur le terrain
  · fini: durée notée, reprise vue au bon endroit · depuis: 15/10/2026 · taille: S`
- **Test appareil : export KMZ « Très nette »** — « Nette » validé sur iPhone ; « Très nette » (16 images) jamais
  essayé.
  `qui: KARMA · action: exporter en « Très nette » et ouvrir dans Google Earth · fini: KMZ ouvert, ou bug ouvert
  · depuis: 15/10/2026 · taille: XS`
- **Test appareil : ouverture de plans sur iPhone** — plus de clics répétés ; si le journal montre souvent « copie
  gardée relue », quelque chose réécrit encore les copies.
  `qui: KARMA · action: ouvrir plusieurs plans puis envoyer le journal · fini: journal lu, aucune réécriture en boucle
  · depuis: 14/10/2026 · taille: XS`
- **Test appareil : chiffres du guide** — repris sans vérification : stockage par appareil (~50 Mo Safari, ~1 Go app
  installée), chemin d'installation sur Chrome Android.
  `qui: KARMA · action: relever les deux chiffres et le chemin sur appareil
  · fini: guide confirmé ou corrigé dans les 3 langues · depuis: 14/10/2026 · taille: XS`
- **Données des plans (DATA, KARMA seul)** — taguer les vrais accès (`entree_plan`), donner un niveau aux POI d'accès
  et aux tracés sans niveau, 3ᵉ point de calage GPS ; régénérer les plans d'avant v1.97.9 (pas d'`iconsEmbarquees` →
  21 sondes 404).
  `qui: KARMA · action: reprendre les plans dans le Générateur · fini: accès tagués, plans régénérés (0 sonde 404)
  · depuis: 13/09/2026 · taille: M`
- **Noms réels restants** — 🟡 le nom du département est neutralisé (`check-noms-reels.js`) ; d'autres noms de lieu ou
  de plan réels restent dans `README.md`, des commentaires `js/` et `docs/architecture/`. Liste remise hors dépôt.
  `qui: KARMA · action: trancher nom par nom sur la liste hors dépôt · fini: chaque nom remplacé ou gardé par décision
  · depuis: 05/10/2026 · taille: S`

## Plus tard

- **Sonar : jetons à régénérer** — ils expirent vers le 06/01/2027 : au-delà, `sonar-scan.ps1` sort en code 1 et
  `merge-main.ps1` demande `DEROGE`.
  `qui: KARMA · action: régénérer un Project Analysis Token avant le 06/01/2027
  · fini: scan Sonar vert avec le nouveau jeton · depuis: 09/10/2026 · taille: XS`
- **Mot de passe d'installation oublié** — ⚪ seul l'effacement des données du site lève le verrou ; pas de voie de
  secours.
  `qui: KARMA · action: confirmer « pas de voie de secours » ou en demander une
  · fini: décision écrite dans security-legal.md · depuis: 04/10/2026 · taille: XS`
- **Secours : deux interventions simultanées sur un même plan** — 🔬 jamais vérifié.
  `qui: Claude · action: jouer deux interventions au harnais sur le même plan
  · fini: comportement constaté, bug ouvert s'il y a lieu · depuis: 06/10/2026 · taille: S`

## Entrant

- **Objet supprimé qui reste affiché** — parfois, un POI ou un tracé supprimé ne disparaît qu'au rechargement de la
  page (vu en pro, peut-être aussi en community). 🔬 hypothèse, non reproduit ; conditions à préciser (plan ☁️,
  autre compte connecté, après une annulation ?).
  `qui: KARMA · action: dire dans quel cas c'est arrivé · fini: reproduit puis corrigé · depuis: 20/10/2026 · taille: S`

