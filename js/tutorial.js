/*!
 * MyKTAMap — Tutoriel premier-lancement
 * (c) 2026 Flavien VIDAL (alias KARMA)
 * Site : https://myktamap.fr
 *
 * Licence : CC BY-NC-SA 4.0
 */

// =========================
// TUTORIAL.JS — Onboarding cards séquentielles (depuis v1.21.0, étendu v1.21.3)
// =========================
// Affiché AUTOMATIQUEMENT au tout premier lancement (détecté via flag
// localStorage `myktamap_tutorial_seen_v1`). Réaffichable à tout moment
// depuis le bouton 🎓 dans le header de la modale 📖 Documentation
// (cf. interface.js > afficherReadme — depuis v1.21.3 ; auparavant
// accessible via 📚 Aide > sous-action « 🎓 (Re)voir le tutoriel »).
//
// 🆕 v1.21.3 (KARMA "rajoute des diapo, pour décrire mieu chaque fonction") :
// passage de 8 cards à 22 cards focalisées. Chaque card couvre UN sujet précis
// au lieu d'empiler 4-6 features par diapo. Lecture plus digeste, nouveau
// utilisateur découvre la richesse de l'app sans submergement.
//
// Plan des 22 cartes :
//   1. 🌟 Bienvenue
//   2. 🛡️ Privacy & offline-first
//   3. 🗂️ Charger un plan existant
//   4. 🏗️ Créer un plan — Mode Simple
//   5. 🏗️ Créer un plan — Mode Avancé
//   6. 📍 Points POI + photos
//   7. 🛣️ Tracés (Principal / Secondaire / Chemin)
//   8. ⬛ Zones (+ inaccessible bloque pathfinder)
//   9. 🏛️ Structures (piliers / murs / fronts)
//   10. 🏷️ Légende personnalisable (cascade 3 niveaux)
//   11. 🧭 Tracker PDR + Replay
//   12. ⛑️🚨 Modes urgence
//   13. 🔍 Recherche unifiée Ctrl+K
//   14. ⭐ Favoris
//   15. 🗺️ Itinéraire pathfinder + évitements
//   16. 📐 Mesures + 📏 Distance totale
//   17. 🏗️ Multi-niveau M-LVL
//   18. 📊 Stats globales + 🔥 Heatmap
//   19. 💾 Exports session JSON / KMZ / GPX
//   20. 🖼️ Exports images PNG / PDF
//   21. 🛡️ Sauvegardes auto + Undo Ctrl+Z
//   22. ⚙️ Config & outils annexes
//
// API : window.Tutorial = { ouvrir, fermer, isFirstLaunch, markAsSeen }
//
// Auto-lancement : déclenché par main.js > _splashEnd → si isFirstLaunch
// retourne true, on appelle ouvrir() après ~600ms (le temps que les modales
// de splash queue soient flushées par OOMGuard, pour éviter le chevauchement).
// =========================

(function() {
  "use strict";

  const LS_KEY  = "myktamap_tutorial_seen_v1";
  const MODAL_ID = "kta-tutorial-modal";

  // Cartes : chaque entrée = { emoji, titre, texte (HTML autorisé), hint optionnel }
  // ⚠️ Pas de fetch d'images externes — tout est emoji / texte pour rester offline-first.
  // 🆕 v1.21.3 : passage 8 → 22 cards (KARMA "rajoute des diapo pour décrire mieu
  // chaque fonction"). Découpe granulaire : 1 sujet = 1 carte = lecture digeste.
  const CARDS = [
    // ═══════════════════════════════════════════════════════════════════════
    // SECTION A : ACCUEIL & CONFIANCE (1-2)
    // ═══════════════════════════════════════════════════════════════════════

    // ─── 1/22 — Bienvenue ───
    {
      emoji: "🌟",
      titre: "Bienvenue sur MyKTAMap",
      texte:
        "<p><strong>MyKTAMap</strong> est une application de <strong>cartographie souterraine</strong> conçue " +
        "pour le terrain : carrières, galeries cataphiles, sites souterrains et industriels.</p>" +
        "<p>Tu travailles sur une <strong>image de plan</strong> (plan papier scanné, dessin, photo). " +
        "Pas besoin de GPS, pas besoin de réseau — l'app fonctionne entièrement hors-ligne une fois chargée.</p>" +
        "<p>📜 <strong>Licence</strong> : CC BY-NC-SA 4.0 — usage non commercial, partage à l'identique. " +
        "Le code est public sur GitHub (<code>Karmakta91/MyKTAMap</code>). Cette garantie s'applique " +
        "<strong>UNIQUEMENT</strong> au domaine officiel <code>myktamap.fr</code>.</p>" +
        "<p>Ce petit tour t'aide à découvrir l'app en quelques minutes. Tu peux le passer à tout moment " +
        "et le rejouer via <strong>📖 Documentation → bouton 🎓</strong> dans le header de la modale.</p>",
      hint: "Tu peux naviguer avec les flèches ◂ ▸ ou les touches ← → / Espace de ton clavier."
    },

    // ─── 2/22 — Privacy & offline ───
    {
      emoji: "🛡️",
      titre: "100 % hors-ligne, 100 % privé",
      texte:
        "<p>MyKTAMap est une PWA <strong>strictement client-side</strong> :</p>" +
        "<ul>" +
          "<li>❌ <strong>Aucun serveur backend</strong>, aucune base de données distante</li>" +
          "<li>❌ <strong>Aucun cookie de tracking</strong>, aucune télémétrie, aucun analytics</li>" +
          "<li>❌ <strong>Aucun compte</strong>, aucune authentification, aucune sync cloud</li>" +
          "<li>✅ Tes annotations, sessions, plans et favoris restent <strong>localement</strong> dans " +
            "ton navigateur (LocalStorage + IndexedDB)</li>" +
          "<li>✅ Seules requêtes émises : same-origin (assets de l'app) et un ping " +
            "<code>gstatic.com/generate_204</code> pour détecter la connectivité</li>" +
        "</ul>" +
        "<p>🔒 <strong>Vérifie toi-même</strong> : ouvre <strong>⚙️ Configuration → 🔒 Audit réseau</strong> " +
        "pour voir le journal LIVE de toutes les requêtes émises par l'app. Active aussi le " +
        "<strong>« Mode hors-ligne strict »</strong> qui bloque toute requête non-whitelistée " +
        "directement côté navigateur.</p>" +
        "<p>📜 <strong>Header CSP côté serveur</strong> (Nginx) : <code>connect-src 'self' https://www.gstatic.com</code> " +
        "— ton navigateur LUI-MÊME refuserait toute exfiltration vers un domaine externe, même si un " +
        "attaquant injectait du JS malveillant.</p>"
    },

    // ═══════════════════════════════════════════════════════════════════════
    // SECTION B : DÉMARRER (3-5)
    // ═══════════════════════════════════════════════════════════════════════

    // ─── 3/22 — Charger un plan existant ───
    {
      emoji: "🗂️",
      titre: "Charger un plan existant",
      texte:
        "<p>Depuis la <strong>page d'accueil</strong>, plusieurs façons de charger un plan déjà disponible :</p>" +
        "<ul>" +
          "<li><strong>📚 Mes plans</strong> : liste de tous les plans que tu as déjà importés ou créés. " +
            "Persistés dans IndexedDB → tu les retrouves au prochain lancement sans rien re-déposer.</li>" +
          "<li><strong>📦 Drop ZIP MyKTAMap</strong> : dépose un fichier <code>.zip</code> dans la zone " +
            "drop. C'est le format natif — chargement direct, roundtrip complet (tags, niveaux, photos, " +
            "légende personnalisée préservés).</li>" +
          "<li><strong>📥 Drop KMZ / GPX</strong> : la même zone drop accepte aussi les fichiers " +
            "<code>.kmz</code> (Google Earth, OsmAnd) et <code>.gpx</code> (TopoDroid, Strava, Garmin). " +
            "L'app les convertit automatiquement en ZIP MyKTAMap reconstruit.</li>" +
          "<li><strong>🌐 Auto-discovery serveur</strong> : si l'app est installée sur un serveur qui " +
            "expose <code>data/index.json</code>, les plans publics y sont listés automatiquement.</li>" +
        "</ul>" +
        "<p>💡 <strong>KMZ / GPX importés</strong> : idéalement <strong>exportés depuis MyKTAMap</strong> " +
        "(roundtrip 100 % préservé). Sinon, les infos absentes du format standard (tags MyKTAMap, niveaux " +
        "M-LVL, etc.) sont remplacées par des défauts. Pour GPX qui n'a pas d'image, l'app génère un " +
        "canvas vierge auto-calibré sur les bounds GPS du fichier.</p>"
    },

    // ─── 4/22 — Créer un plan : Mode Simple ───
    {
      emoji: "🏗️",
      titre: "Créer un plan — Mode Simple",
      texte:
        "<p>Tu veux démarrer un nouveau plan ? Clique sur <strong>🏗️ Générer un plan</strong> dans la " +
        "page d'accueil. Le <strong>Mode Simple</strong> est l'option par défaut au premier lancement.</p>" +
        "<p>Tu obtiens un ZIP MyKTAMap prêt à l'usage en <strong>30 secondes</strong> avec juste :</p>" +
        "<ul>" +
          "<li>🖼️ <strong>Une image de plan</strong> (scan, photo, dessin) ou un <strong>canvas vierge</strong> " +
            "(4 dimensions standard + 4 couleurs au choix : sépia / blanc / gris / noir)</li>" +
          "<li>🏷️ <strong>Un nom</strong> et une <strong>version</strong> (le reste est auto-rempli)</li>" +
          "<li>🏗️ Optionnel : case <strong>🏗️ Plan multi-niveau</strong> si carrière à étages</li>" +
          "<li>🧱 Optionnel : case <strong>🧱 V2 tuilé</strong> si plan ≥ 4000×4000 px (recommandé pour perf mobile)</li>" +
        "</ul>" +
        "<p>Les icônes built-in (puits, salles, chatières, dangers…) sont auto-chargées. " +
        "Pas besoin de toucher aux calques de données, tracking ou GPS calibrage — l'app fournit des " +
        "valeurs par défaut raisonnables.</p>",
      hint: "Pour basculer en Mode Avancé : bouton « 🎨 Avancé » en haut du générateur."
    },

    // ─── 5/22 — Créer un plan : Mode Avancé ───
    {
      emoji: "🎨",
      titre: "Créer un plan — Mode Avancé",
      texte:
        "<p>Le <strong>Mode Avancé</strong> du générateur te donne le contrôle total sur tous les " +
        "paramètres techniques du plan :</p>" +
        "<ul>" +
          "<li>🖼️ <strong>Calques d'image</strong> : superpose plusieurs PNG (ex: plan brut + légende + " +
            "annotations papier scannées) avec ordre et visibilité configurables</li>" +
          "<li>📊 <strong>Calques de données (data layers)</strong> : embarque des JSON de points/tracés/" +
            "zones/structures dans le plan (ex: puits.json, vehicules.json). Lecture seule au runtime, " +
            "filtrables par calque dans la modale Layers de la carte.</li>" +
          "<li>🚶 <strong>Configuration tracking</strong> : start position du tracker, échelle px↔m, " +
            "step length, threshold, cooldown</li>" +
          "<li>🎨 <strong>Icônes custom</strong> : remplace les icônes par défaut, ajoute des PNG 50×50 " +
            "pour de nouveaux tags</li>" +
          "<li>🌐 <strong>Géoréférencement GPS</strong> : 2 points (plan ↔ GPS) qui permettent l'export " +
            "KMZ/GPX et l'affichage des coords GPS dans les popups</li>" +
          "<li>🏷️ <strong>Légende plan-level</strong> : personnalisation des libellés + masques + entrées " +
            "custom embarquées DANS le ZIP plan (= partage cross-utilisateur)</li>" +
        "</ul>" +
        "<p>Si tu modifies un plan existant (drop ZIP dans le générateur → mode Modifier), le formulaire " +
        "est <strong>pré-rempli</strong> avec les valeurs actuelles et force automatiquement le Mode Avancé.</p>"
    },

    // ═══════════════════════════════════════════════════════════════════════
    // SECTION C : ANNOTER (6-10)
    // ═══════════════════════════════════════════════════════════════════════

    // ─── 6/22 — Points POI ───
    {
      emoji: "📍",
      titre: "Points d'intérêt (POI)",
      texte:
        "<p><strong>Sidebar droite → ✏️ (clic direct = active le mode ajout)</strong></p>" +
        "<p>Clic sur l'icône ✏️ pour démarrer le mode ajout (la pastille devient surlignée). " +
        "Ensuite, chaque clic sur la carte pose un nouveau marker. Re-clic sur ✏️ pour sortir " +
        "du mode. Une modale s'ouvre à chaque point avec :</p>" +
        "<ul>" +
          "<li><strong>Nom</strong> (= identifiant unique, sert aux exports et au pathfinder)</li>" +
          "<li><strong>Tags</strong> : icône typée parmi les built-ins (puits aération, salle, chatière, " +
            "passage, danger, électricité…) ou tags custom de ton plan</li>" +
          "<li><strong>État</strong> : non inspecté / OK / dangereux (colore l'icône)</li>" +
          "<li><strong>Description</strong> multiligne : textarea libre, affichée dans la popup + embarquée " +
            "dans les exports KMZ / GPX / JSON</li>" +
          "<li><strong>📸 Photos POI</strong> : jusqu'à 5 photos par point. Compressées localement " +
            "(canvas → JPEG q85 max 1920px), stockées en IndexedDB. <strong>Jamais envoyées sur Internet</strong>.</li>" +
        "</ul>" +
        "<p><strong>Popup d'un point</strong> (clic sur le marker) :</p>" +
        "<ul>" +
          "<li>🌐 <strong>Coords GPS</strong> si plan calibré — copiables au presse-papier d'un clic</li>" +
          "<li>📸 <strong>Miniatures photos</strong> cliquables → viewer plein écran (pinch-zoom, swipe)</li>" +
          "<li>🗺️ <strong>Y aller</strong> : démarre un itinéraire depuis ta position vers ce point</li>" +
          "<li>⭐ <strong>Favori</strong> : marque ce point comme important</li>" +
          "<li>✏️ <strong>Modifier</strong> / 🗑️ <strong>Supprimer</strong></li>" +
        "</ul>"
    },

    // ─── 7/22 — Tracés ───
    {
      emoji: "🛣️",
      titre: "Tracés (routes et chemins)",
      texte:
        "<p><strong>Sidebar droite → 🛣️ Tracés → Principal / Secondaire / Chemin</strong></p>" +
        "<p>Clique-clique sur la carte pour dessiner une polyline. Re-clic sur l'icône active pour " +
        "<strong>valider</strong> le tracé. 3 types pré-définis avec couleurs distinctes :</p>" +
        "<ul>" +
          "<li>🟩 <strong>Principal</strong> : grandes galeries connues, axes principaux</li>" +
          "<li>🟪 <strong>Secondaire</strong> : galeries de jonction, moins fréquentées</li>" +
          "<li>🟨 <strong>Chemin</strong> : passages étroits, raccourcis, tracés exploratoires</li>" +
        "</ul>" +
        "<p>Les tracés sont utilisés par le <strong>pathfinder (Dijkstra)</strong> pour calculer des " +
        "itinéraires automatiques entre 2 points (cf. carte 15). Les <strong>croisements</strong> sont " +
        "détectés automatiquement (cercles colorés aux intersections — couleur du tracé le moins prioritaire).</p>" +
        "<p><strong>💬 Note sur un tracé</strong> : bouton dans la popup → textarea multiligne, embarquée " +
        "dans les exports. Idéal pour annoter une galerie (état, dangers, repères).</p>" +
        "<p><strong>📏 Distance d'un tracé</strong> : visible dans 📊 Détails session, ou via l'outil " +
        "<strong>📏 Distance totale</strong> (surlignage magenta cumulé).</p>"
    },

    // ─── 8/22 — Zones ───
    {
      emoji: "⬛",
      titre: "Zones (Eau, remblais, inaccessible…)",
      texte:
        "<p><strong>Sidebar droite → ⬛ Zones → Eau / Remblais / Effondrement / Inaccessible</strong></p>" +
        "<p>Clique sur la carte pour placer les sommets d'un polygone. Re-clic sur le 1er sommet pour " +
        "fermer la zone. 4 types pré-définis :</p>" +
        "<ul>" +
          "<li>💧 <strong>Eau</strong> : flaque, lac, zone inondée (bleu)</li>" +
          "<li>⬛ <strong>Remblais</strong> : éboulis, blocage partiel, gravats (gris)</li>" +
          "<li>🟥 <strong>Effondrement</strong> : zone dangereuse, voûte tombée (rouge)</li>" +
          "<li>⛔ <strong>Inaccessible</strong> : zone physiquement inatteignable ou interdite " +
            "(hachures rouge/noir 45°)</li>" +
        "</ul>" +
        "<p>⚠️ <strong>Zone Inaccessible — effet pathfinder</strong> : ces zones <strong>BLOQUENT</strong> " +
        "le calcul d'itinéraire. Le pathfinder refusera tout segment de tracé qui traverse une zone " +
        "inaccessible. Même au niveau actif courant en mode multi-niveau (les jonctions interniveau " +
        "passent au-dessus sans être bloquées — points en transit vertical).</p>" +
        "<p>💬 <strong>Note sur une zone</strong> : popup → textarea. Embarquée dans les exports.</p>"
    },

    // ─── 9/22 — Structures ───
    {
      emoji: "🏛️",
      titre: "Structures (piliers, murs, fronts)",
      texte:
        "<p><strong>Sidebar droite → 🏛️ Structures</strong></p>" +
        "<p>Les structures cataphiles sont les <strong>éléments construits / sculptés</strong> de la " +
        "carrière. 5 sous-types pré-définis :</p>" +
        "<ul>" +
          "<li>🟡 <strong>Pilier 1ère masse</strong> (polygone jaune) : pilier supérieur de soutènement</li>" +
          "<li>🟠 <strong>Pilier 2ème masse</strong> (polygone orange) : pilier inférieur</li>" +
          "<li>🔵 <strong>Mur</strong> (polygone bleu foncé) : mur de soutènement, barrage de gravats</li>" +
          "<li>🟨 <strong>Front de taille 1ère</strong> (polyline jaune épaisse) : limite d'extraction</li>" +
          "<li>🟧 <strong>Front de taille 2ème</strong> (polyline orange épaisse)</li>" +
        "</ul>" +
        "<p><strong>Différence polygone vs polyline</strong> :</p>" +
        "<ul>" +
          "<li>Piliers + Mur = polygones <strong>fermés</strong> (≥ 3 sommets) avec couleur de remplissage</li>" +
          "<li>Fronts = polylines <strong>ouvertes</strong> (≥ 2 sommets) sans remplissage</li>" +
        "</ul>" +
        "<p>💬 <strong>Note sur une structure</strong> : popup → textarea. Embarquée dans les exports.</p>" +
        "<p>📊 <strong>Stats de comptage</strong> : visibles dans 📊 Détails session avec breakdown par type.</p>"
    },

    // ─── 10/22 — Légende personnalisable ───
    {
      emoji: "🏷️",
      titre: "Légende personnalisable",
      texte:
        "<p>Tu peux <strong>personnaliser la légende</strong> : renommer les types, masquer ceux que tu " +
        "n'utilises pas, ou même <strong>ajouter tes propres types dessinables</strong>.</p>" +
        "<p>🎯 <strong>Cascade 3 niveaux</strong> :</p>" +
        "<ol>" +
          "<li><strong>Session</strong> : modifs faites depuis la map (modale 🗺️ Légende → ✏️ Modifier). " +
            "Persistées localement avec la session courante.</li>" +
          "<li><strong>Plan</strong> : modifs faites depuis le <strong>Générateur Mode Avancé</strong>. " +
            "Embarquées DANS le ZIP plan → partagées avec tous les utilisateurs de ce plan.</li>" +
          "<li><strong>Défaut MyKTAMap</strong> : valeurs built-in (Principal, Eau, Pilier 1ère, etc.)</li>" +
        "</ol>" +
        "<p>📋 <strong>Exemples d'usage</strong> :</p>" +
        "<ul>" +
          "<li>Renommer « Eau » → « Lac du fond » pour TON plan</li>" +
          "<li>Masquer « Pilier 2ème masse » si la carrière n'en a pas</li>" +
          "<li>Ajouter un nouveau type « ⚠️ Gaz toxique » (polygone hachuré rouge) pour signaler des zones spécifiques</li>" +
        "</ul>" +
        "<p>🌍 <strong>Roundtrip KMZ + GPX</strong> : la légende personnalisée du plan voyage avec les exports " +
        "et est restaurée au ré-import → même un destinataire qui ouvre ton KMZ/GPX dans MyKTAMap retrouvera " +
        "tes renommages et tes customs.</p>"
    },

    // ═══════════════════════════════════════════════════════════════════════
    // SECTION D : TRACKER & URGENCE (11-12)
    // ═══════════════════════════════════════════════════════════════════════

    // ─── 11/22 — Tracker + Replay ───
    {
      emoji: "🧭",
      titre: "Tracker de position (PDR) + Replay",
      texte:
        "<p>Le mode <strong>🧭 Tracker</strong> (flyout sidebar droite) utilise les capteurs de mouvement " +
        "de ton téléphone (accéléromètre, magnétomètre) pour estimer ta position en temps réel — sans GPS " +
        "(= utile en souterrain).</p>" +
        "<p><strong>Sous-actions du flyout Tracker</strong> :</p>" +
        "<ul>" +
          "<li>▶️ <strong>Play / Stop</strong> : démarre la détection de pas PDR (Pedestrian Dead Reckoning). " +
            "Le marker se déplace selon ton orientation et les pas détectés.</li>" +
          "<li>🧭 <strong>Boussole</strong> : widget visuel rotatif qui contre-tourne pour garder le Nord " +
            "en haut. Permet de vérifier que le heading est correct.</li>" +
          "<li>📍 <strong>Recalage</strong> : clic sur la carte pour <strong>téléporter</strong> le marker " +
            "à l'endroit où tu es réellement. <strong>À utiliser tous les ~50 m</strong> pour corriger la " +
            "dérive cumulative.</li>" +
          "<li>🗺️ <strong>Itinéraire</strong> : ouvre la modale pour calculer un trajet depuis ta position " +
            "actuelle.</li>" +
          "<li>🎬 <strong>Replay</strong> : visualise ta session de tracking après-coup. Slider timeline + " +
            "play/pause + vitesse 0.5× à 10× + export CSV des positions datées.</li>" +
          "<li>🔥 <strong>Heatmap</strong> : densité de fréquentation cumulée multi-sessions (cf. carte 18).</li>" +
        "</ul>" +
        "<p>⚠️ <strong>EXPÉRIMENTAL</strong> : la dérive est inévitable (capteurs imprécis + armatures " +
        "métalliques qui faussent le magnétomètre). C'est un outil de debug/curiosité, <strong>PAS un GPS " +
        "de secours</strong>. Pour te localiser en situation tendue, utilise le mode ⛑️ Je suis perdu " +
        "(carte suivante).</p>"
    },

    // ─── 12/22 — Modes urgence ───
    {
      emoji: "⛑️",
      titre: "Modes urgence (Je suis perdu / Panique)",
      texte:
        "<p>2 modes complémentaires, en <strong>fin du flyout Tracker</strong> avec fond rouge distinctif :</p>" +
        "<ul>" +
          "<li>⛑️ <strong>Je suis perdu</strong> : tu sais à peu près où tu es passé mais pas où tu es " +
            "<em>maintenant</em>. L'app calcule une <strong>zone probable</strong> (cercle de recherche) " +
            "à partir de ta dernière position connue + le temps écoulé + la vitesse moyenne estimée. Tu " +
            "peux affiner en ajoutant des indices visuels (« j'ai vu une grosse plaque rouge », " +
            "« il y avait un pilier ici »).</li>" +
          "<li>🚨 <strong>Mode urgence XL (panique)</strong> : tu sais où tu es (le tracker l'affiche) " +
            "mais tu paniques et tu as besoin d'infos vitales en GROS. Affiche en plein écran tes coords " +
            "GPS + cap boussole + niveau batterie, masque tout le reste de l'UI. Conserve ton autonomie.</li>" +
        "</ul>" +
        "<p>💡 <strong>Différence essentielle</strong> :</p>" +
        "<ul>" +
          "<li>⛑️ = je ne sais PAS où je suis → calcul d'une zone</li>" +
          "<li>🚨 = je sais où je suis → affichage XL pour communiquer la position</li>" +
        "</ul>" +
        "<p>🔆 <strong>Wake Lock</strong> : pendant le mode urgence, l'écran ne s'éteint plus (API Wake " +
        "Lock du navigateur). Tu peux aussi l'activer en permanence depuis ⚙️ Configuration → " +
        "« Garder l'écran allumé ».</p>",
      hint: "Les modes urgence ne remplacent JAMAIS un appel aux secours. C'est un outil d'appoint pour communiquer ta position aux secours."
    },

    // ═══════════════════════════════════════════════════════════════════════
    // SECTION E : NAVIGATION & RECHERCHE (13-15)
    // ═══════════════════════════════════════════════════════════════════════

    // ─── 13/22 — Recherche unifiée Ctrl+K ───
    {
      emoji: "🔍",
      titre: "Recherche unifiée (Ctrl+K)",
      texte:
        "<p><strong>Raccourci universel</strong> : <code>Ctrl+K</code> (Cmd+K sur Mac) — ouvre la barre de " +
        "recherche depuis n'importe où dans l'app. Toggle re-clic pour fermer.</p>" +
        "<p>🎯 <strong>Cherche dans 4 catégories simultanément</strong> :</p>" +
        "<ul>" +
          "<li>📍 <strong>Points</strong> : par nom, ID, tag, description</li>" +
          "<li>🛣️ <strong>Tracés</strong> : par label, type, niveau</li>" +
          "<li>⬛ <strong>Zones</strong> : par label, type, niveau</li>" +
          "<li>🏛️ <strong>Structures</strong> : par label, type, niveau</li>" +
        "</ul>" +
        "<p>📑 <strong>Résultats groupés par catégorie</strong>, scoring par pertinence. Auto-complétion " +
        "en live à chaque touche tapée.</p>" +
        "<p>🎛️ <strong>Filtres cumulatifs</strong> (chips au-dessus de la liste) :</p>" +
        "<ul>" +
          "<li>Par <strong>catégorie</strong> (points / tracés / zones / structures)</li>" +
          "<li>Par <strong>calque</strong> (Mes annotations, puits.json, etc.)</li>" +
          "<li>Par <strong>tag</strong> (puits aération, salle, chatière…)</li>" +
        "</ul>" +
        "<p>✨ <strong>Clic sur un résultat</strong> :</p>" +
        "<ul>" +
          "<li>Point → centre la carte + ouvre la popup + cercle jaune 3s</li>" +
          "<li>Tracé / Zone / Structure → centre + flash jaune 4s en overlay</li>" +
        "</ul>"
    },

    // ─── 14/22 — Favoris ───
    {
      emoji: "⭐",
      titre: "Favoris (POI rapides)",
      texte:
        "<p>Marque tes <strong>points d'intérêt importants</strong> comme favoris pour y accéder en 1 clic.</p>" +
        "<p>📝 <strong>Comment ajouter un favori</strong> :</p>" +
        "<ul>" +
          "<li>Clic sur un marker → popup → bouton ⭐ <strong>Favori</strong> (toggle)</li>" +
          "<li>L'étoile devient pleine ⭐ et le point apparaît dans le groupe ⭐ Favoris</li>" +
        "</ul>" +
        "<p>📂 <strong>Accès aux favoris</strong> :</p>" +
        "<ul>" +
          "<li><strong>Sidebar gauche → groupe ⭐ Favoris</strong> (juste après M-LVL si actif). Liste " +
            "dynamique mise à jour à chaque ajout/retrait.</li>" +
          "<li>Clic sur un favori → centre la carte sur le point + flash orange 3s + popup ouverte</li>" +
        "</ul>" +
        "<p>📤 <strong>Export / Import JSON</strong> : depuis 📊 Détails session, tu peux exporter " +
        "ta liste de favoris en JSON puis l'importer sur un autre appareil (téléphone → ordi, ou partage " +
        "avec un copain). Format léger, indépendant du plan.</p>" +
        "<p>💡 <strong>Cas d'usage typiques</strong> :</p>" +
        "<ul>" +
          "<li>Entrée principale de la carrière (= « base »)</li>" +
          "<li>Point de rendez-vous avec un groupe</li>" +
          "<li>Salle de bivouac, point d'eau potable</li>" +
          "<li>Passage piège / récemment effondré (à éviter)</li>" +
        "</ul>" +
        "<p>🔒 <strong>Stockage</strong> : <code>localStorage[\"myktamap_favoris_v1\"]</code> indexé par " +
        "planId. Snapshots complets des points = résilience même si le point est déplacé ou supprimé.</p>"
    },

    // ─── 15/22 — Itinéraire pathfinder ───
    {
      emoji: "🗺️",
      titre: "Itinéraire pathfinder",
      texte:
        "<p>Calcule le <strong>plus court chemin</strong> entre N waypoints en suivant le réseau de " +
        "tracés existants (algorithme <strong>Dijkstra</strong> + enrichissement croisements).</p>" +
        "<p>🎯 <strong>3 méthodes pour ajouter un waypoint</strong> :</p>" +
        "<ul>" +
          "<li>🔍 <strong>Autocomplete</strong> dans la modale itinéraire (recherche points par nom/tag)</li>" +
          "<li>🏷️ <strong>Saisie ID exact</strong> + bouton Ajouter</li>" +
          "<li>📍 <strong>Clic sur la carte</strong> (mode flottant cyan)</li>" +
          "<li>🧭 <strong>Ma position</strong> : prend ta position tracker actuelle comme point de départ</li>" +
        "</ul>" +
        "<p>🚫 <strong>Préférences d'évitement (optionnel)</strong> :</p>" +
        "<ul>" +
          "<li><strong>Points</strong> : « ne PAS passer par ce puits »</li>" +
          "<li><strong>Tags</strong> : « éviter tous les passages de type danger »</li>" +
          "<li><strong>Rayon d'évitement</strong> : marge autour des points évités (0-500 px, default 100)</li>" +
        "</ul>" +
        "<p>⛔ Les <strong>zones inaccessibles</strong> sont automatiquement contournées (contrainte dure). " +
        "Les évitements points/tags sont des contraintes <strong>souples</strong> — si aucun chemin n'existe " +
        "sans eux, le pathfinder calcule quand même un chemin et signale qu'il a dû passer dedans.</p>" +
        "<p>⚙️ <strong>Modes de vitesse</strong> (impactent le temps estimé) : 🍺 Bourré 2 km/h / 🐌 Lente " +
        "3 km/h / 🚶 Normale 5 km/h / 🏃 Rapide 7 km/h. +15 min de pause par waypoint intermédiaire.</p>" +
        "<p>📊 Label <strong>distance + temps estimé</strong> en bas-gauche de la carte. Tracé cyan néon " +
        "avec halo SVG drop-shadow.</p>"
    },

    // ─── 16/22 — Mesures ───
    {
      emoji: "📐",
      titre: "Mesures (distance, surface, total)",
      texte:
        "<p><strong>3 outils de mesure complémentaires</strong> :</p>" +
        "<p>📐 <strong>Mesure de distance</strong> (sidebar droite → 📐 Mesure → 📐 Distance)</p>" +
        "<ul>" +
          "<li>Clic-clic pour placer des sommets, polyline en pointillés magenta</li>" +
          "<li>Label live <code>123.4 m</code> ou <code>1.23 km</code> au-delà de 1 km</li>" +
          "<li>Angles entre segments affichés</li>" +
          "<li>Persisté en session (re-disponible au reload)</li>" +
        "</ul>" +
        "<p>⬛ <strong>Mesure de surface</strong> (sidebar droite → 📐 Mesure → ⬛ Surface)</p>" +
        "<ul>" +
          "<li>Clic pour placer les sommets d'un polygone. Algo Shoelace.</li>" +
          "<li>Label live <code>1234 m²</code> ou <code>1.23 ha</code> au-delà de 1 hectare</li>" +
          "<li>2 modes EXCLUSIFS (distance OU surface) — basculer reset les points</li>" +
        "</ul>" +
        "<p>📏 <strong>Distance totale des tracés</strong> (sidebar droite → 🛣️ Tracés → 📏)</p>" +
        "<ul>" +
          "<li>Surligne en <strong>magenta cumulé</strong> tous les tracés d'un type donné</li>" +
          "<li>Calcule la distance totale par type + total général</li>" +
          "<li>Filtrable : ☑ Principal / ☑ Secondaire / ☑ Chemin</li>" +
          "<li>Inclut TOUS les tracés (session + data layers embedded, visibles ou masqués)</li>" +
        "</ul>" +
        "<p>L'échelle <code>px/m</code> est définie dans la config tracking du plan (ou par défaut 1 px = 1 m).</p>"
    },

    // ═══════════════════════════════════════════════════════════════════════
    // SECTION F : MULTI-NIVEAU & STATS (17-18)
    // ═══════════════════════════════════════════════════════════════════════

    // ─── 17/22 — Multi-niveau ───
    {
      emoji: "🏗️",
      titre: "Multi-niveau (M-LVL)",
      texte:
        "<p>Si tu cartographies une carrière à <strong>plusieurs étages empilés</strong>, le mode " +
        "multi-niveau est essentiel. <strong>Activation au moment de la création</strong> du plan " +
        "(générateur → case « 🏗️ Plan multi-niveau ») ou édition manuelle <code>plan-config.json</code>.</p>" +
        "<p>📍 <strong>Bouton « Niveau actif »</strong> (sidebar gauche) — pastille jaune avec le numéro :</p>" +
        "<ul>" +
          "<li>Clic → modale de gestion (niveau actif single-select + niveaux visibles multi-select)</li>" +
          "<li>Niveau actif = celui où sont dessinées les nouvelles annotations</li>" +
          "<li>Niveaux visibles = ce que tu vois affiché (Quick actions « Tous » / « Actif seul »)</li>" +
          "<li>Niveaux négatifs supportés (sous-sols -1, -2…). Extensible via boutons − et +</li>" +
        "</ul>" +
        "<p>🪜 <strong>Jonctions interniveau</strong> (sidebar droite → 🛣️ Tracés → 🪜) :</p>" +
        "<ul>" +
          "<li>Tracé spécial qui relie 2 points sur des niveaux différents (escalier, pente, puits interne)</li>" +
          "<li>Toujours visible quel que soit le filtre niveau (= sinon impossible de naviguer entre étages)</li>" +
          "<li>Style magenta dashed avec marqueurs ronds aux extrémités</li>" +
          "<li>Le pathfinder les emprunte naturellement pour passer d'un niveau à un autre</li>" +
        "</ul>" +
        "<p>📤 <strong>Exports respectent le filtre niveau</strong> : tu peux dessiner sur 5 étages et " +
        "n'exporter que les 2 du milieu. Breakdown par niveau dans 📊 Stats globales.</p>",
      hint: "Si ta carrière est mono-niveau, ignore cette feature — laissée pour l'usage avancé uniquement."
    },

    // ─── 18/22 — Stats globales + Heatmap ───
    {
      emoji: "📊",
      titre: "Stats globales + Heatmap",
      texte:
        "<p>📊 <strong>Stats globales du plan</strong> (accessible depuis 📊 Détails session → 📊 Voir " +
        "les statistiques globales) :</p>" +
        "<ul>" +
          "<li>Totaux par catégorie (points / tracés / zones / structures)</li>" +
          "<li>Breakdown par tag (combien de puits aération, combien de salles, etc.)</li>" +
          "<li>Distance totale cumulée + surface totale</li>" +
          "<li>Si multi-niveau : breakdown par niveau</li>" +
          "<li><strong>4 camemberts SVG</strong> natifs inline : répartition tags points / types tracés / " +
            "types zones / types structures</li>" +
          "<li>📤 <strong>Export PDF fiche technique A4</strong> + 📊 <strong>Export CSV ZIP</strong> " +
            "(4 fichiers UTF-8 + README, compat Excel FR séparateur <code>;</code>)</li>" +
        "</ul>" +
        "<p>🔥 <strong>Heatmap</strong> (flyout Tracker → 🔥) — densité visuelle de fréquentation :</p>" +
        "<ul>" +
          "<li>6 sources cochables : tracker timeline / points session / tracés session / zones session / " +
            "structures session / 4 sous-sources data layers (points / tracés / zones / structures, " +
            "visibles ou non)</li>" +
          "<li>Sliders Rayon (10-120 px) + Intensité (0.2-3×)</li>" +
          "<li>Interpolation le long des segments (vraies traînées continues, pas blobs isolés)</li>" +
          "<li>Normalisation auto : pixel le plus dense = rouge, le moins dense = bleu (s'adapte à tes données)</li>" +
          "<li>Filtre timeline tracker : skip recalages (téléportations), pauses >5min</li>" +
        "</ul>" +
        "<p>💡 Cumul <strong>multi-sessions</strong> : la timeline tracker est persistée entre les " +
        "redémarrages → ta heatmap se construit au fil de tes explorations.</p>"
    },

    // ═══════════════════════════════════════════════════════════════════════
    // SECTION G : EXPORTS (19-20)
    // ═══════════════════════════════════════════════════════════════════════

    // ─── 19/22 — Exports session JSON / KMZ / GPX ───
    {
      emoji: "💾",
      titre: "Exports session — JSON, KMZ, GPX",
      texte:
        "<p>Modale <strong>💾 Enregistrer session</strong> (sidebar gauche → ⬆) avec 4 onglets :</p>" +
        "<p>📄 <strong>Onglet Session JSON</strong> — réimportable dans MyKTAMap :</p>" +
        "<ul>" +
          "<li><strong>Mode Full</strong> : tout en un fichier (points + tracés + zones + structures + " +
            "mesures + tracker timeline + photos POI optionnelles)</li>" +
          "<li><strong>Mode Avancé</strong> : granularité par calque, par tag, par type, choix d'inclure ou " +
            "non les photos / le tracker / la mesure</li>" +
          "<li>Output : <code>.json</code> ou <code>.zip</code> (si photos cochées)</li>" +
        "</ul>" +
        "<p>🌍 <strong>Onglet KMZ</strong> — pour Google Earth, OsmAnd, Avenza, ArcGIS Earth, Locus :</p>" +
        "<ul>" +
          "<li>Nécessite calibrage GPS du plan (2 points plan↔GPS, configurés dans le générateur)</li>" +
          "<li>Embed l'image plan + tous les Placemarks (points/lignes/polygones) + style icônes par tag</li>" +
          "<li>La <strong>légende personnalisée plan-level voyage avec le KMZ</strong> via fichier annexe " +
            "<code>myktamap-extras.json</code> (ignoré par les apps tierces, restauré au ré-import MyKTAMap)</li>" +
        "</ul>" +
        "<p>📤 <strong>Onglet GPX</strong> — pour TopoDroid, OsmAnd, Strava, Garmin :</p>" +
        "<ul>" +
          "<li>Format universel GPX 1.1, roundtrip MyKTAMap complet (tags via <code>&lt;sym&gt;</code>, " +
            "niveaux M-LVL via <code>&lt;cmt&gt;</code>, descriptions, légende custom via <code>&lt;extensions&gt;</code>)</li>" +
          "<li>Réutilise le calibrage KMZ — si tu as configuré KMZ, GPX marche aussi</li>" +
        "</ul>" +
        "<p>🔄 <strong>Onglet Conversion</strong> — convertit ta session vers/depuis un data layer " +
        "(<code>devmap-data</code>) prêt à intégrer dans un autre plan-config.json. Tracker volontairement " +
        "exclu (= data layer figé, lecture seule).</p>"
    },

    // ─── 20/22 — Exports images PNG / PDF ───
    {
      emoji: "🖼️",
      titre: "Exports images (PNG, PDF imprimable)",
      texte:
        "<p>Modale <strong>🖼️ Export image</strong> (sidebar gauche → 🖼️) avec 2 modes :</p>" +
        "<p>⚡ <strong>Mode rapide</strong> :</p>" +
        "<ul>" +
          "<li>Capture exactement ce que tu vois sur la carte (visibilité actuelle des calques)</li>" +
          "<li>1 clic → fichier PNG téléchargé</li>" +
          "<li>Idéal pour partager rapidement une vue</li>" +
        "</ul>" +
        "<p>🎨 <strong>Mode avancé</strong> :</p>" +
        "<ul>" +
          "<li>Filtres granulaires : par calque image, par calque data, par tag de point, par type de tracé/" +
            "zone/structure, par niveau M-LVL</li>" +
          "<li>Inclure ou non la légende (4 styles : opaque / semi / filigrane / impression)</li>" +
          "<li>Format : PNG ou JPG, résolution custom, 4 positions de légende (4 coins)</li>" +
        "</ul>" +
        "<p>📄 <strong>Export PDF imprimable</strong> :</p>" +
        "<ul>" +
          "<li>5 formats × 2 orientations : A0/A1/A2/A3/A4 portrait OU paysage</li>" +
          "<li>Plan + annotations + légende overlay 4-coins + header optionnel (titre + métas)</li>" +
          "<li>Filtres calques identiques au PNG avancé</li>" +
          "<li>Style « print » dédié (fond blanc, contraste max, lisible imprimé)</li>" +
        "</ul>" +
        "<p>💡 <strong>Cas d'usage typiques</strong> : impression A2/A3 pour le terrain (papier waterproof), " +
        "PNG pour Discord/email, PDF pour archivage long-terme ou partage formel.</p>"
    },

    // ═══════════════════════════════════════════════════════════════════════
    // SECTION H : SÉCURITÉ DES DONNÉES & OUTILS (21-22)
    // ═══════════════════════════════════════════════════════════════════════

    // ─── 21/22 — Sauvegardes auto + Undo ───
    {
      emoji: "🛡️",
      titre: "Sauvegardes & Undo — filet de sécurité",
      texte:
        "<p>L'app a <strong>3 niveaux de protection</strong> contre la perte de données :</p>" +
        "<p>💾 <strong>Auto-save par plan</strong> (slot localStorage <code>myktamap_session_v1_&lt;planId&gt;</code>) :</p>" +
        "<ul>" +
          "<li>Sauvegarde silencieuse toutes les 1.5 s (throttle adaptatif si CPU busy)</li>" +
          "<li>1 slot par plan = chaque plan garde SA session indépendamment</li>" +
          "<li>Au prochain lancement, ta session est <strong>auto-restaurée</strong> sans intervention</li>" +
        "</ul>" +
        "<p>📦 <strong>10 Backups IndexedDB par plan</strong> (FIFO) :</p>" +
        "<ul>" +
          "<li>Snapshot automatique toutes les 5 min ET avant action destructive (clear session, reset, etc.)</li>" +
          "<li>Visibles dans 📊 Détails session → 📦 Backups récents</li>" +
          "<li>Clic ↻ <strong>Restaurer</strong> sur un snapshot = revient à cet état (l'app reload " +
            "automatiquement le bon plan + state)</li>" +
          "<li>Manuel : bouton 📆 Snapshot maintenant pour figer un état important</li>" +
        "</ul>" +
        "<p>⏪ <strong>Undo / Redo Ctrl+Z / Ctrl+Y</strong> :</p>" +
        "<ul>" +
          "<li>50 actions historisées en RAM</li>" +
          "<li>Couvre : ajout/modification/suppression de points, tracés, zones, structures</li>" +
          "<li>Aussi accessible via boutons ⏪ ⏩ dans le groupe ⏪ Historique de la sidebar gauche</li>" +
          "<li>Reset au plan switch (historique propre par plan)</li>" +
        "</ul>" +
        "<p>💡 <strong>En cas de pépin</strong> : DevTools → Application → IndexedDB → " +
        "<code>myktamap_backups</code> contient TOUTES tes sessions de tous les plans, même supprimés. " +
        "Tu peux toujours récupérer en exportant manuellement le JSON.</p>"
    },

    // ─── 22/22 — Outils annexes ───
    {
      emoji: "⚙️",
      titre: "Configuration & outils annexes",
      texte:
        "<p>Pour aller plus loin, l'app a beaucoup d'outils annexes :</p>" +
        "<p>⚙️ <strong>⚙️ Configuration loader</strong> (bouton dans la page d'accueil) :</p>" +
        "<ul>" +
          "<li>🖼️ <strong>Mode Tiling</strong> : preset performance (auto / quality / balanced / performance / off)</li>" +
          "<li>🚀 <strong>Mode ULTRA</strong> : 6 toggles fine-grain pour gros plans (décimation, " +
            "skip animations, viewport culling, etc.)</li>" +
          "<li>📊 <strong>Inspecteur mémoire</strong> : transparence totale sur ce qui est stocké localement " +
            "(localStorage, IndexedDB, Cache PWA). Bouton 📋 Copier le rapport.</li>" +
          "<li>🔒 <strong>Audit réseau</strong> : journal LIVE de toutes les requêtes émises + mode " +
            "« hors-ligne strict » qui bloque tout non-whitelisté</li>" +
          "<li>🎨 <strong>Thème clair</strong> : toggle dark/light, persisté localement</li>" +
          "<li>🔆 <strong>Wake Lock</strong> : garde l'écran allumé (utile en cavité)</li>" +
          "<li>🔄 <strong>Force update douce</strong> : purge le cache PWA sans toucher à tes données</li>" +
          "<li>💥 <strong>Tout réinitialiser</strong> : wipe complet (localStorage + IDB + caches). " +
            "Double confirmation requise.</li>" +
        "</ul>" +
        "<p>⚙️ <strong>⚙️ Réglages map mode</strong> (sidebar gauche) : préférences par plan (debug, " +
        "performance, M-LVL si applicable, etc.).</p>" +
        "<p>🔐 <strong>Code d'accès local optionnel</strong> : PIN 4-6 chiffres + Face ID / Touch ID / " +
        "Windows Hello (WebAuthn). Protection au démarrage de l'app, idéal si tu prêtes ton téléphone.</p>" +
        "<p>📋 <strong>Rapports de crash</strong> : si l'app a été tuée par l'OS (OOM mobile typiquement), " +
        "le rapport est archivé dans 📊 Inspecteur mémoire → section Derniers crashs. Copiable pour " +
        "envoi à l'auteur via la page de contact.</p>" +
        "<p>📚 <strong>Aide intégrée</strong> (sidebar gauche → 📚) : doc complète de chaque fonction. " +
        "Si tu te demandes « comment fait-on X ? », c'est là.</p>" +
        "<p><strong>Bonne exploration ! 🚀</strong></p>",
      hint: "Tu peux rejouer ce tutoriel à tout moment via le bouton 🎓 en haut de la modale 📖 Documentation."
    }
  ];

  let _currentIdx = 0;

  // ────────── HELPERS ──────────

  function isFirstLaunch() {
    try { return !localStorage.getItem(LS_KEY); } catch(e) { return false; }
  }

  function markAsSeen() {
    try { localStorage.setItem(LS_KEY, "1"); } catch(e) {}
  }

  function _escapeHtml(s) {
    return String(s || "").replace(/[&<>"']/g, function(c) {
      return ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", "\"":"&quot;", "'":"&#39;" })[c];
    });
  }

  // ────────── RENDER ──────────

  function _buildModalHtml() {
    return ''
      + '<div class="kta-readme-modal-boite kta-tutorial-boite">'
      +   '<div class="kta-readme-modal-header kta-tutorial-header">'
      +     '<span class="kta-readme-modal-titre">🎓 Tutoriel — Premier lancement</span>'
      +     '<button type="button" class="kta-panneau-close" id="kta-tutorial-close" aria-label="Fermer">✕</button>'
      +   '</div>'
      +   '<div class="kta-readme-modal-corps kta-tutorial-corps" id="kta-tutorial-corps">'
      +     '<!-- Card content dynamic -->'
      +   '</div>'
      +   '<div class="kta-tutorial-footer">'
      +     '<div class="kta-tutorial-progress" id="kta-tutorial-progress">'
      +       '<!-- Pastilles de progression dynamiques -->'
      +     '</div>'
      +     '<div class="kta-tutorial-actions">'
      +       '<button type="button" class="kta-btn kta-btn-ghost"   id="kta-tutorial-skip">Passer le tutoriel</button>'
      +       '<button type="button" class="kta-btn kta-btn-ghost"   id="kta-tutorial-prev">◂ Précédent</button>'
      +       '<button type="button" class="kta-btn kta-btn-primary" id="kta-tutorial-next">Suivant ▸</button>'
      +     '</div>'
      +   '</div>'
      + '</div>';
  }

  function _renderCard(idx) {
    const card  = CARDS[idx];
    const corps = document.getElementById("kta-tutorial-corps");
    if (!card || !corps) return;

    let html = '<div class="kta-tutorial-card">';
    html += '<div class="kta-tutorial-card-emoji" aria-hidden="true">' + card.emoji + '</div>';
    html += '<div class="kta-tutorial-card-titre">' + _escapeHtml(card.titre) + '</div>';
    // texte = HTML autorisé volontairement (cards hardcodées, contenu de confiance)
    html += '<div class="kta-tutorial-card-texte">' + card.texte + '</div>';
    if (card.hint) {
      html += '<div class="kta-tutorial-card-hint">' + _escapeHtml(card.hint) + '</div>';
    }
    html += '</div>';
    corps.innerHTML = html;

    // Progression : pastilles cliquables (navigation directe)
    const prog = document.getElementById("kta-tutorial-progress");
    if (prog) {
      let dots = "";
      for (let i = 0; i < CARDS.length; i++) {
        const isActive  = (i === idx);
        const cls = "kta-tutorial-dot" + (isActive ? " kta-tutorial-dot-active" : "");
        dots += '<button type="button" class="' + cls + '" data-card-idx="' + i + '" aria-label="Aller à la carte ' + (i + 1) + '"></button>';
      }
      prog.innerHTML = dots;
      // Bind nav directe (utile si l'user veut revenir vite à une carte)
      prog.querySelectorAll(".kta-tutorial-dot").forEach(function(b) {
        b.addEventListener("click", function() {
          const i = parseInt(b.dataset.cardIdx, 10);
          if (!isNaN(i)) { _currentIdx = i; _renderCard(_currentIdx); _updateNavButtons(); }
        });
      });
    }
  }

  function _updateNavButtons() {
    const prevBtn = document.getElementById("kta-tutorial-prev");
    const nextBtn = document.getElementById("kta-tutorial-next");
    const skipBtn = document.getElementById("kta-tutorial-skip");
    if (prevBtn) prevBtn.style.visibility = (_currentIdx === 0) ? "hidden" : "visible";
    if (nextBtn) {
      const isLast = (_currentIdx === CARDS.length - 1);
      nextBtn.textContent = isLast ? "✓ Terminer" : "Suivant ▸";
    }
    if (skipBtn) {
      // Cacher "Passer" sur la dernière carte (= bouton Terminer suffit)
      const isLast = (_currentIdx === CARDS.length - 1);
      skipBtn.style.visibility = isLast ? "hidden" : "visible";
    }
  }

  function _onPrev() {
    if (_currentIdx > 0) {
      _currentIdx--;
      _renderCard(_currentIdx);
      _updateNavButtons();
    }
  }

  function _onNext() {
    if (_currentIdx < CARDS.length - 1) {
      _currentIdx++;
      _renderCard(_currentIdx);
      _updateNavButtons();
    } else {
      // Dernière carte → Terminer
      _finish();
    }
  }

  function _finish() {
    markAsSeen();
    fermer();
  }

  function _onKey(e) {
    if (e.key === "Escape" || e.key === "Esc") { fermer(); return; }
    if (e.key === "ArrowRight") { _onNext(); return; }
    if (e.key === "ArrowLeft")  { _onPrev(); return; }
    if (e.key === "Enter")      { _onNext(); return; }
  }

  // ────────── API PUBLIQUE ──────────

  function ouvrir() {
    fermer();
    _currentIdx = 0;

    const overlay = document.createElement("div");
    overlay.id        = MODAL_ID;
    overlay.className = "kta-readme-modal-overlay";
    overlay.innerHTML = _buildModalHtml();
    document.documentElement.appendChild(overlay);

    document.getElementById("kta-tutorial-close").addEventListener("click", function() {
      // Fermeture explicite via ✕ = considère comme "skip" (marque seen pour ne pas re-popup)
      markAsSeen();
      fermer();
    });
    overlay.addEventListener("click", function(e) {
      // Pas de close sur backdrop (= éviter dismiss accidentel pendant la lecture)
      // L'user doit cliquer ✕ ou "Passer" explicitement.
    });
    document.addEventListener("keydown", _onKey);

    document.getElementById("kta-tutorial-prev").addEventListener("click", _onPrev);
    document.getElementById("kta-tutorial-next").addEventListener("click", _onNext);
    document.getElementById("kta-tutorial-skip").addEventListener("click", function() {
      markAsSeen();
      fermer();
    });

    _renderCard(_currentIdx);
    _updateNavButtons();
  }

  function fermer() {
    document.removeEventListener("keydown", _onKey);
    const ex = document.getElementById(MODAL_ID);
    if (ex && ex.parentNode) ex.parentNode.removeChild(ex);
  }

  // ────────── EXPORT ──────────
  window.Tutorial = {
    ouvrir:         ouvrir,
    fermer:         fermer,
    isFirstLaunch:  isFirstLaunch,
    markAsSeen:     markAsSeen,
    // Pour Memory Inspector / debug
    _LS_KEY:        LS_KEY,
    _CARDS_COUNT:   CARDS.length
  };
})();
