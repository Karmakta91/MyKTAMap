# Étude — Guidage de l'itinéraire (« dans X m, tourner à gauche »)

> Étude menée avec KARMA les 26 et 27/09/2026. Toutes les décisions ci-dessous sont **tranchées** ;
> elles font foi pour l'implémentation (`js/itiGuidage.js` et les modules qu'il touche).

## Le besoin

Tracker actif + itinéraire calculé → un bandeau en haut de l'écran dit quoi faire :
« dans 40 m, tourner à droite », « continuer tout droit sur 150 m ». Sans annoncer un virage à chaque segment
dessiné : il faut une logique de croisements.

## Ce qui rend le problème différent d'un GPS routier

- **Pas de GPS.** La position vient du podomètre et de la boussole (PDR). Elle dérive, surtout en longueur
  (la longueur de pas estimée se trompe facilement de 10 à 20 %).
- **Le guidage ne fonctionne que sur les tracés.** L'itinéraire est calculé sur le réseau dessiné ; hors tracé
  on redirige **à vol d'oiseau vers le tracé le plus proche** — sur le JPG, les obstacles ne se mesurent pas.
- **Les tracés ne représentent pas toutes les ouvertures réelles** (chambre à piliers) : compter les
  croisements (« la 3e à gauche ») tromperait. On parle **toujours en mètres**.
- La navigation intelligente (`smartNav`, calage de la position sur les galeries) est désactivée par défaut
  et réglée plan par plan : sans elle, les mètres sont approximatifs.

## Décisions

| # | Sujet | Décision |
|---|---|---|
| 1 | Activation | **Automatique** : le bandeau apparaît dès qu'un tracker actif et un itinéraire coexistent, y compris après un « Y aller » depuis un point. Une croix le masque pour cet itinéraire ; un réglage Auto / Jamais le coupe. |
| 2 | Contenu du bandeau | La prochaine consigne + « puis… » en petit ; un toucher déplie la feuille de route complète. |
| 3 | Distances | **Toujours « dans X m »**, jamais « la 3e à gauche ». |
| L | Sans navigation intelligente | « ~ » devant le chiffre + arrondi par 10 m + une seule suggestion de l'activer, au premier affichage du bandeau. |
| 4 | Voix / vibration | **Aucune** pour le moment. |
| 5 | Périmètre | Tous les lots, branchement urgence obligatoire. |
| A | Urgence | Brancher la **sortie d'urgence** (elle passe par « Y aller ») **et** l'**écran XL de panique** (qui recouvre la carte : il affiche la prochaine consigne en gros). |
| B | Urgence et navigation intelligente | On garde le réglage de l'utilisateur, on ne l'active pas d'office. |
| C | Croix du bandeau en urgence | **Pas de croix** en sortie d'urgence. |
| D | Écart / demi-tour | Prévenir + proposer **[Recalculer d'ici] · [Je suis ici] · [Ignorer]**. Jamais de recalcul automatique. |
| E | Sans navigation intelligente | **[Je suis ici]** mis en avant : la position est douteuse, se resituer passe avant recalculer. |
| F | Après « Ignorer » | Silence **jusqu'au retour sur le chemin**, puis la surveillance reprend. |
| G | Écart en sortie d'urgence | Recalculer vers **la sortie la plus proche d'ici** (pas forcément celle d'origine), avec confirmation. |
| H | Rattachement | La détection d'écart fait partie du bandeau en direct. |
| I | Hors tracé | Viser **le tracé le plus proche** (niveau affiché), puis l'itinéraire part de là. |
| J | Consigne du raccord | « Rejoindre le tracé : ~X m » + flèche relative au téléphone + **ligne pointillée** sur la carte. |
| K | Raccord dans l'itinéraire | Dessiné **et compté** dans **tous** les itinéraires (il ne l'était pas : `snappedPoints` était renvoyé mais lu nulle part). |
| — | Limite du raccord | **50 m** : au-delà, on **avertit sans bloquer**. |
| — | Aucun tracé sur le plan | On **avertit** au lancement (modale, « Y aller », sortie d'urgence) : le guidage n'aurait rien à dire. |

## Logique « quand annoncer »

1. **Croisement = un nœud du graphe du pathfinder d'où partent au moins 3 directions distinctes.** Les
   directions sont regroupées par angle : une arête doublée (l'arête d'origine reste en place quand un nœud de
   croisement est inséré) ou un sommet voisin aligné ne comptent pas pour une direction de plus.
2. ⚠️ **Le croisement se détecte géométriquement, pas par les nœuds traversés.** L'arête d'origine restant
   dans le graphe, un itinéraire qui passe *tout droit* à un croisement peut ne pas traverser le nœud du
   croisement. On retient donc les croisements du graphe **situés sur le tracé** de l'itinéraire.
3. **Angle mesuré sur une fenêtre de quelques mètres** avant et après, pas sur le segment voisin (le dessin à
   la main tremble).
4. **Virage sans croisement : jamais annoncé** (retour KARMA du 27/09/2026 sur les catacombes). Tant qu'il n'y
   a qu'un chemin, suivre la galerie suffit : seul un croisement, là où il y a un choix, produit une consigne
   de virage. *(La première version annonçait les virages francs ; c'était une surinterprétation de
   l'argument « chambre à piliers », qui visait « la 3e à gauche ».)*
5. **Grand carrefour = une zone** (décision KARMA 1:a, 27/09/2026) : sur un plan réel, un grand carrefour
   n'est pas un nœud à 5 branches mais plusieurs croisements proches. Des croisements qui se suivent à
   **≤ 5 m l'un du précédent** (KARMA : « 20 m c'est beaucoup trop ») forment une zone : **une** consigne, posée
   à l'**entrée** de la zone (4), angle mesuré de l'entrée à la sortie, sorties comptées sur un cercle qui
   englobe la zone. À partir de **4 galeries**, un **schéma** du carrefour (rayons, la galerie à prendre en doré,
   l'arrivée en bas) s'affiche dans le bandeau, la feuille de route et l'écran XL (2:a). Un point nommé dans la
   zone ouvre la consigne : « à « … », tourner à gauche » (3:a).
6. **Vocabulaire** : < 25° tout droit · 25–60° légèrement · 60–135° tourner · > 135° demi-tour. Deux sorties à
   moins de 35° l'une de l'autre → « prendre la branche de gauche / droite ».
7. **Repère** : un point nommé à quelques mètres du carrefour enrichit la consigne (« au niveau de … »).
8. **Changement de niveau** : « monter / descendre vers … » au passage d'une jonction.
9. **Seuils de marche** : pré-annonce, puis « maintenant » à l'approche.

## Découpage

| Lot | Contenu |
|---|---|
| 1 | Moteur de consignes + feuille de route statique (modale Itinéraire) ; raccords à vol d'oiseau dessinés et comptés ; alertes 50 m et « aucun tracé ». |
| 2 | Bandeau en direct : avancement, pré-annonce, « maintenant », écart / demi-tour et leurs actions, réglage Auto / Jamais. |
| 3 | ~~Mode Navigation : plan orienté + écran allumé, restaurés à la sortie.~~ **Livré puis retiré le 27/09/2026 (KARMA 3:a)** : un bouton 🧭 sans libellé, doublon de « Plan orienté » (menu Tracker) et de l'écran allumé (Réglages) — son utilité n'était pas lisible. |
| 4 | Urgence : sortie d'urgence (pas de croix, écart → sortie la plus proche) + consigne sur l'écran XL. |

## Inconnues qu'on ne lèvera que sur le terrain

- La part du réseau de chaque plan qui produit des **croisements parasites** (tracés qui se chevauchent sans
  être raccordés) : les seuils de fusion sont à caler sur des plans réels.
- L'**écart réel du compte à rebours**, avec et sans navigation intelligente.
