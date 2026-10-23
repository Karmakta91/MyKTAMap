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

- **Train : v2.19.0 en prod** — mergée le 22/10 (avec, en plus des notes : fermeture du plan avant le tuilage V2,
  icône par défaut, rotation en Présentation, case « Rendre les calques » sans objet visé, Sonar). Reste à vérifier
  en ligne ; la 0.12.0 du pro suit (backlog pro).
  `qui: KARMA · action: CI main verte ; /killsw.html sur myktamap.fr ; etat-sites.ps1 ; CI doc main + deploy-doc.sh
  public ; poster les 2 stories · fini: etat-sites.ps1 vert, doc publique à jour · depuis: 21/10/2026 · taille: S`
- **PR Dependabot en attente** — ce sont des PR (onglet Pull requests), pas des alertes : 0 alerte côté community.
  ✅ vérifié 21/10 : 8 branches `dependabot/*` encore ouvertes, actions GitHub (`setup-node`, `docker/*`) et
  Playwright du smoke ; les workflows sont toujours en `setup-node@v5` / `docker/*@v3`.
  `qui: KARMA · action: fusionner ou fermer chaque PR (CI verte)
  · fini: 0 PR Dependabot ouverte · depuis: 20/10/2026 · taille: XS`

- **Test appareil : ouverture de plans sur iPhone** — plus de clics répétés ; si le journal montre souvent « copie
  gardée relue », quelque chose réécrit encore les copies.
  `qui: KARMA · action: ouvrir plusieurs plans puis envoyer le journal · fini: journal lu, aucune réécriture en boucle
  · depuis: 14/10/2026 · taille: XS`
- **Test appareil : Mode Secours sur iPhone** — « Suivre mon parcours » (permission des capteurs dans le geste),
  recalage à la validation d'une étape (question au-delà de 30 m), écran XL avec un long itinéraire, « Retour
  impératif ».
  `qui: KARMA · action: jouer les 4 gestes sur iPhone · fini: 4 gestes vus conformes, ou bugs ouverts
  · depuis: 30/09/2026 · taille: S`
- **Test appareil : export KMZ « Très nette »** — « Nette » validé sur iPhone ; « Très nette » (16 images) jamais
  essayé.
  `qui: KARMA · action: exporter en « Très nette » et ouvrir dans Google Earth · fini: KMZ ouvert, ou bug ouvert
  · depuis: 15/10/2026 · taille: XS`
- **Test appareil : photos et export** — réimport d'une session ZIP ; refus au-delà de 5 photos ; analyse d'un gros
  plan depuis l'accueil (Safari ≥ 16.4) ; export image d'un plan tuilé hors-ligne.
  `qui: KARMA · action: jouer les 4 cas sur iPhone · fini: 4 cas vus conformes, ou bugs ouverts · depuis: 12/10/2026
  · taille: S`
## Ensuite

- **Petite fuite à chaque ouverture de plan** — ✅ mesuré 22/10 : environ 70 nœuds détachés et 15 écouteurs de plus
  par ouverture, après ramasse-miettes (`perf-memory.md`).
  `qui: Claude · action: trouver les écouteurs non retirés au démontage · fini: dérive nulle sur 10 ouvertures
  · depuis: 22/10/2026 · taille: S`
- **« Reprendre » ne retrouve pas la vue** — centre, zoom et niveau ne sont pas dans la session : le plan rouvre sur
  sa vue par défaut (déjà le cas avant la fermeture au retour à l'accueil).
  `qui: KARMA · action: dire si la vue doit être mémorisée · fini: décision notée · depuis: 22/10/2026 · taille: S`
- **Générateur lent avec un plan ouvert** — plus de 30 min chez KARMA, non reproduit ici (×2 seulement). Le plan est
  fermé avant le tuilage V2 depuis le 22/10 ; si c'est encore lent, décoder l'image source une fois (createImageBitmap).
  `qui: KARMA · action: chronométrer son cas réel en prod · fini: moins d'une minute, ou mesure qui oriente la suite
  · depuis: 22/10/2026 · taille: S`

- **Test appareil : lockout temporisé** — PIN et gate : 5 codes faux → compte à rebours → retour du pavé
  (`security-legal.md` §36.3).
  `qui: KARMA · action: jouer le parcours sur un téléphone · fini: parcours vu conforme, ou bug ouvert
  · depuis: 13/09/2026 · taille: XS`
- **Test appareil : stockage saturé** — bandeau persistant + 💾 Exporter tant que la sauvegarde échoue.
  `qui: KARMA · action: saturer un téléphone de test · fini: bandeau et export vus, ou bug ouvert · depuis: 13/09/2026
  · taille: S`
- **Test appareil : balayage Secours** — temps de « Découper en secteurs » sur un vieux téléphone ; « Suivre mon
  parcours » en balayage (un écart rejoint le circuit là où l'équipe en était, pas au début).
  `qui: KARMA · action: chronométrer le découpage, faire un écart sur le terrain
  · fini: durée notée, reprise vue au bon endroit · depuis: 15/10/2026 · taille: S`
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

- **`security.txt` à renouveler** — ici et dans `MyKTAMap-doc/racine-publique/` (RFC 9116), expire le 22/10/2027 : périmé
  compte comme absent pour les outils de réputation.
  `qui: Claude · action: repousser Expires d'un an (moins d'un an d'avance) · fini: fichier servi, date à jour
  · depuis: 23/10/2026 · taille: XS`
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
- **Échelle typographique** — ✅ vérifié 20/10 : ~35 tailles de texte dans `css/` ; 11 / 11,5 / 12 / 12,5 / 13 px se
  suivent à moins de 5 %. Reste de l'audit d'interface (M1) : 6 rôles proposés (11 méta, 12,5 libellé, 14 corps,
  15 lecture, 18 titre de fenêtre, 24 titre d'écran), plancher de 11 px pour tout texte cliquable.
  `qui: Claude · action: proposer en QCM les jetons de taille et l'ordre des écrans, puis les poser écran par écran
  · fini: tailles en jetons, plus aucune valeur hors échelle dans css/ · depuis: 20/10/2026 · taille: L`
- **Thème clair : nettoyer les surcharges historiques** — ✅ vérifié 20/10 : ~1 780 sélecteurs `.kta-theme-light`
  dans `css/`, dont beaucoup en `!important`, devenus inutiles là où la règle de base est écrite en jetons
  (`docs/architecture/ui.md` §53.3).
  `qui: Claude · action: retirer écran par écran la surcharge que le jeton couvre, captures avant et après
  · fini: plus de surcharge claire de couleur là où un jeton existe · depuis: 20/10/2026 · taille: L`

## Entrant

- **Objet supprimé qui reste affiché** — parfois, un POI ou un tracé supprimé ne disparaît qu'au rechargement de la
  page (vu en pro, peut-être aussi en community). 🔬 hypothèse, non reproduit ; conditions à préciser (plan ☁️,
  autre compte connecté, après une annulation ?).
  `qui: KARMA · action: dire dans quel cas c'est arrivé · fini: reproduit puis corrigé · depuis: 20/10/2026 · taille: S`

