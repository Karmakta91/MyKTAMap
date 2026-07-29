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
// 🆕 v1.25.3 (KARMA "rajoute le du coup aussi on onbarding si c'est pas fait") :
// ajout carte 13 "🚨 Mode Secours" → 22 → 23 cards. Insérée juste après les
// modes urgence (carte 12) pour bien différencier les 3 modes "urgence" :
// ⛑️ Je suis perdu (moi) / 🚨 Panique (moi) / 🚨 Mode Secours (équipe).
//
// 🆕 v1.40.32 (KARMA "on doit pouvoir enrichir le On Boarding avec la partie
// OSM et Histoire (peut être d'autres oublis)") : 23 → 25 cards.
// - Nouvelle carte 23 « 🌍 Vue OSM » (v1.39+) — plan projeté sur OpenStreetMap
// - Nouvelle carte 24 « 📖 Mode Histoire » (v1.34.19+) — note libre + PDF embed
// - Carte 12 (Modes urgence) enrichie avec 🚨 Sortie d'urgence (v1.35.0)
// - Carte 25 (ex-23 ⚙️ Config) enrichie avec 🎤 Commande vocale (v1.34.0) +
//   🪫 Vibration haptique (v1.34.26).
//
// Plan des 25 cartes :
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
//   12. ⛑️🚨 Modes urgence (Perdu / Panique / Sortie d'urgence)   ← enrichi v1.40.32
//   13. 🚨 Mode Secours (coordination équipes)
//   14. 🔍 Recherche unifiée Ctrl+K
//   15. ⭐ Favoris
//   16. 🗺️ Itinéraire pathfinder + évitements
//   17. 📐 Mesures + 📏 Distance totale
//   18. 🏗️ Multi-niveau M-LVL
//   19. 📊 Stats globales + 🔥 Heatmap
//   20. 💾 Exports session JSON / KMZ / GPX
//   21. 🖼️ Exports images PNG / PDF
//   22. 🛡️ Sauvegardes auto + Undo Ctrl+Z
//   23. 🌍 Vue OSM (modale + widget HOME)                         ← v1.40.32
//   24. 📖 Mode Histoire (note libre + PDF embed)                 ← v1.40.32
//   25. ⚙️ Config & outils annexes (+ 🎤 Vocale, 🪫 Vibration)    ← enrichi v1.40.32
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
  // 🆕 v1.25.3 : 22 → 23 cards (ajout carte 13 « 🚨 Mode Secours » après modes urgence).
  // 🆕 v1.69.0 : 25 → 26 cards (ajout carte 25 « 📔 Mon carnet », après Mode Histoire).
  // ⚠️ PARITÉ FR/EN OBLIGATOIRE : toute carte ajoutée à CARDS doit l'être aussi à
  // CARDS_EN, au MÊME rang (le compteur « n/N » et la navigation sont partagés).
  const CARDS = [
    // ═══════════════════════════════════════════════════════════════════════
    // SECTION A : ACCUEIL & CONFIANCE (1-2)
    // ═══════════════════════════════════════════════════════════════════════

    // ─── 1/23 — Bienvenue ───
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

    // ─── 2/23 — Privacy & offline ───
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

    // ─── 3/23 — Charger un plan existant ───
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

    // ─── 4/23 — Créer un plan : Mode Simple ───
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

    // ─── 5/23 — Créer un plan : Mode Avancé ───
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

    // ─── 6/23 — Points POI ───
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

    // ─── 7/23 — Tracés ───
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

    // ─── 8/23 — Zones ───
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

    // ─── 9/23 — Structures ───
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

    // ─── 10/23 — Légende personnalisable ───
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

    // ─── 11/23 — Tracker + Replay ───
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

    // ─── 12/23 — Modes urgence ───
    {
      emoji: "⛑️",
      titre: "Modes urgence (Perdu / Panique / Sortie)",
      texte:
        "<p>3 modes complémentaires, en <strong>fin du flyout Tracker</strong> avec fond rouge distinctif :</p>" +
        "<ul>" +
          "<li>⛑️ <strong>Je suis perdu</strong> : tu sais à peu près où tu es passé mais pas où tu es " +
            "<em>maintenant</em>. L'app calcule une <strong>zone probable</strong> (cercle de recherche) " +
            "à partir de ta dernière position connue + le temps écoulé + la vitesse moyenne estimée. Tu " +
            "peux affiner en ajoutant des indices visuels (« j'ai vu une grosse plaque rouge », " +
            "« il y avait un pilier ici »).</li>" +
          "<li>🚨 <strong>Mode urgence XL (panique)</strong> : tu sais où tu es (le tracker l'affiche) " +
            "mais tu paniques et tu as besoin d'infos vitales en GROS. Affiche en plein écran tes coords " +
            "GPS + cap boussole + niveau batterie, masque tout le reste de l'UI. Conserve ton autonomie.</li>" +
          // 🆕 v1.40.32 — Ajout du 3e mode urgence (Sortie d'urgence v1.35.0, oublié à l'onboarding)
          "<li>🚨 <strong>Sortie d'urgence</strong> <em>(v1.35+)</em> : tu veux <strong>sortir vite</strong>. " +
            "L'app calcule via pathfinder l'itinéraire optimal depuis ta position vers la <strong>sortie " +
            "la plus proche</strong> — un POI d'accès surface (cavage, puits ou escalier ouvert : tags " +
            "<code>cao</code> / <code>peo</code> / <code>eso</code>) ou tagué <code>entrée</code> (on " +
            "peut ressortir par où l'on est entré). Affiche distance + ETA + itinéraire tracé. Idéal " +
            "quand la batterie baisse, la marée monte, ou un orage approche en surface.</li>" +
        "</ul>" +
        "<p>💡 <strong>3 cas d'usage différents</strong> :</p>" +
        "<ul>" +
          "<li>⛑️ = je ne sais PAS où je suis → calcul d'une zone de recherche</li>" +
          "<li>🚨 panique = je sais où je suis → affichage XL pour communiquer la position</li>" +
          "<li>🚨 sortie = je sais où je suis → me guide vers la sortie la plus proche</li>" +
        "</ul>" +
        "<p>🔆 <strong>Wake Lock</strong> : pendant le mode urgence, l'écran ne s'éteint plus (API Wake " +
        "Lock du navigateur). Tu peux aussi l'activer en permanence depuis ⚙️ Configuration → " +
        "« Garder l'écran allumé ».</p>",
      hint: "Les modes urgence ne remplacent JAMAIS un appel aux secours. C'est un outil d'appoint pour communiquer ta position aux secours."
    },

    // ─── 13/23 — Mode Secours (coordination équipes de recherche) ───
    // 🆕 v1.25.3 — Ajout post-audit doc Phase 3 (KARMA "rajoute le du coup
    // aussi on onbarding si c'est pas fait"). Carte dense couvrant les 2 états
    // CRÉATION + EXÉCUTION pour bien différencier des 2 modes urgence
    // précédents (⛑️ Je suis perdu et 🚨 panique = TOI, vs 🚨 Mode Secours =
    // QUELQU'UN D'AUTRE est perdu et tu organises les secours).
    {
      emoji: "🚨",
      titre: "Mode Secours (coordination d'équipes de recherche)",
      texte:
        "<p>⚠️ <strong>3 modes \"urgence\" distincts</strong> dans MyKTAMap, ne pas confondre :</p>" +
        "<ul>" +
          "<li>⛑️ <strong>Je suis perdu</strong> = TOI tu te cherches</li>" +
          "<li>🚨 <strong>Mode panique</strong> = TOI tu paniques (cf. carte précédente)</li>" +
          "<li>🚨 <strong>Mode Secours</strong> = QUELQU'UN D'AUTRE est perdu, tu coordonnes la recherche</li>" +
        "</ul>" +
        "<p>Accès : sidebar → flyout 🧭 Tracker → bouton rouge <strong>🚨 Mode Secours</strong>.</p>" +
        "<p>Le scénario a <strong>2 états distincts</strong> :</p>" +
        "<p>📝 <strong>État 1 — CRÉATION</strong> (planning à froid OU sur le moment) :</p>" +
        "<ul>" +
          "<li>Créer un scénario nommé (« Recherche Marc 26/05 »)</li>" +
          "<li>Ajouter des équipes (palette OTAN Alpha/Bravo/Charlie...) avec parcours " +
            "<strong>entrée + intermédiaires + sortie</strong> + zone de recherche + itinéraire " +
            "auto-calculé (Pathfinder évite les chevauchements entre équipes)</li>" +
          "<li>Auto pré-remplissage depuis ⛑️ Lost Mode (dernière position connue + zone d'incertitude)</li>" +
          "<li>Multi-niveau M-LVL supporté (auto 1 équipe par étage si besoin)</li>" +
          "<li>Export <strong>3 formats</strong> : PDF imprimable A4 avec carte miniature + KMZ géolocalisé " +
            "cross-app (Google Earth / OsmAnd) + <code>.mkmsec.json</code> autonome pour partage cross-appareil</li>" +
        "</ul>" +
        "<p>🚀 <strong>État 2 — EXÉCUTION TERRAIN</strong> (incident déclenché, vue Live temps réel) :</p>" +
        "<ul>" +
          "<li>Bouton <strong>« 🚀 Lancer le plan de secours »</strong> + modale sélection rôle</li>" +
          "<li><strong>👤 Opérateur surface</strong> : PC chef, vue d'ensemble cards multi-équipes + statut " +
            "+ dernière obs + bouton « 🚨 Prendre la main » avec retour automatique</li>" +
          "<li><strong>🚨 Équipier</strong> : sur le terrain, stepper visuel cliquable + observations + " +
            "<strong>7 statuts rapides</strong> (RAS / Suspect / Bloqué / Indice / Aide demandée / " +
            "Demi-tour forcé / <strong>Victime trouvée</strong> = card rouge clignotante côté PC) + " +
            "photos (max 5/étape, IDB local dédié)</li>" +
          "<li><strong>🚑 Secouriste libre</strong> : renfort sans équipe pré-assignée, notes en vrac " +
            "chronologiques avec timestamps</li>" +
          "<li>Timer global avec pause juste · Bandeau « 📦 PLAN TERMINÉ » après arrêt</li>" +
        "</ul>" +
        "<p>📤 <strong>Rapport au fil des étapes</strong> à tout moment (bouton dans chaque vue Live) : " +
        "PDF imprimable / <code>.mkmsec.report.json</code> autonome / texte presse-papier. " +
        "3 scopes selon ton rôle (global opérateur / équipier seul / notes secouriste).</p>",
      hint: "Phase 3 single-device pour l'instant. Pour partager observations entre opérateur surface et équipiers terrain, passe par .mkmsec.report.json (mail / clé USB / AirDrop)."
    },

    // ═══════════════════════════════════════════════════════════════════════
    // SECTION E : NAVIGATION & RECHERCHE (14-16)
    // ═══════════════════════════════════════════════════════════════════════

    // ─── 14/23 — Recherche unifiée Ctrl+K ───
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

    // ─── 15/23 — Favoris ───
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

    // ─── 16/23 — Itinéraire pathfinder ───
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
        "<p>⚙️ <strong>Modes de vitesse</strong> (impactent le temps estimé) : 🤕 Blessé 2 km/h / 🐌 Lente " +
        "3 km/h / 🚶 Normale 5 km/h / 🏃 Rapide 7 km/h. +15 min de pause par waypoint intermédiaire.</p>" +
        "<p>📊 Label <strong>distance + temps estimé</strong> en bas-gauche de la carte. Tracé cyan néon " +
        "avec halo SVG drop-shadow.</p>"
    },

    // ─── 17/23 — Mesures ───
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

    // ─── 18/23 — Multi-niveau ───
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

    // ─── 19/23 — Stats globales + Heatmap ───
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

    // ─── 20/23 — Exports session JSON / KMZ / GPX ───
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

    // ─── 21/23 — Exports images PNG / PDF ───
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

    // ─── 22/23 — Sauvegardes auto + Undo ───
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

    // ─── 23/26 — Vue OSM (v1.39+) ───
    // 🆕 v1.40.32 — Ajout post-livraison Vue OSM (KARMA "on doit pouvoir
    // enrichir le On Boarding avec la partie OSM et Histoire"). Carte dense
    // couvrant les 2 contextes (modale plan + widget HOME) + opt-in strict +
    // garantie offline-first préservée.
    {
      emoji: "🌍",
      titre: "Vue OSM — ton plan projeté sur OpenStreetMap",
      texte:
        "<p>Si ton plan est <strong>géoréférencé GPS</strong> (calibration 2 points lat/lng), tu peux " +
        "le projeter sur <strong>OpenStreetMap</strong> pour voir où il est dans le monde réel — utile " +
        "pour situer l'entrée d'un site, repérer la voirie en surface, briefer un secours qui ne connaît " +
        "pas la cavité.</p>" +
        "<p>🌍 <strong>2 contextes d'utilisation</strong> :</p>" +
        "<ul>" +
          "<li><strong>Modale plein écran</strong> (depuis le mode carte) : bouton 🌍 dans la sidebar → " +
            "modale Vue OSM avec ton plan en overlay transparent (slider opacité), tes POI, tes tracés, " +
            "tes zones et structures. Tuiles V2 du plan + filtres par catégorie + multi-niveau M-LVL.</li>" +
          "<li><strong>Widget HOME</strong> : mini-carte intégrée à ta page d'accueil avec sélecteur de " +
            "plan + bouton ⛶ plein écran. Tu vois tes plans georef du tour d'œil sans devoir charger.</li>" +
        "</ul>" +
        "<p>📍 <strong>Bouton « Ma position GPS »</strong> dans les 2 contextes : fix ponctuel à la " +
        "demande (pas de watch continu = 0 impact batterie), marker bleu cyan + cercle de précision. " +
        "Garde-fou : refus si tu es à des km du plan (ex : plan Catacombes Paris quand tu es à Lyon).</p>" +
        "<p>🏷️ <strong>Filtre par tag</strong> : chips dans le bandeau (POI par catégorie). Cohérent " +
        "avec le filtre du mode carte mais indépendant (filtre OSM local à la modale ou au widget).</p>" +
        "<p>🛡️ <strong>Opt-in strict</strong> : Vue OSM contacte <code>tile.openstreetmap.org</code> " +
        "pour les tuiles cartographiques. C'est <strong>désactivé par défaut</strong> (philosophie " +
        "offline-first). Active-le dans <strong>⚙️ Configuration → 🌐 Autoriser la Vue OSM</strong>. " +
        "Tes données plan ne quittent JAMAIS ton navigateur — seules les tuiles publiques OSM sont " +
        "demandées, comme n'importe quel client web standard. Modes <em>hors-ligne strict</em> et " +
        "<em>incognito</em> bloquent automatiquement la Vue OSM par cohérence.</p>",
      hint: "Attribution © OpenStreetMap contributors affichée dans le coin des cartes — obligation ODbL respectée. Sans calibration GPS du plan, la Vue OSM n'est pas disponible (rien à projeter)."
    },

    // ─── 24/26 — Mode Histoire (v1.34.19+) ───
    // 🆕 v1.40.32 — Ajout post-livraison Mode Histoire (oublié à l'onboarding
    // depuis v1.34.19). Carte présente la note libre + PDF embed comme une
    // feature de session : tu racontes le plan, tu l'illustre par un PDF.
    {
      emoji: "📖",
      titre: "Mode Histoire — Note libre + PDF du plan",
      texte:
        "<p>Le <strong>Mode Histoire</strong> te permet de raconter ton plan : contexte historique, " +
        "anecdotes, sources, témoignages, mode d'emploi spécifique au site.</p>" +
        "<p>📖 <strong>2 formats complémentaires</strong> :</p>" +
        "<ul>" +
          "<li><strong>Note libre</strong> (éditeur Markdown inline) : titres, listes, liens, gras / " +
            "italique, blocs code. Sauvegarde auto, persistée localement par plan.</li>" +
          "<li><strong>Documents PDF</strong> <em>(v1.69.0 : jusqu'à 10 par plan)</em> : importe tes " +
            "PDF (topo originale, plan IGN historique, compte-rendu de sortie, étude géologique…). " +
            "Ils s'empilent — un nouvel import n'écrase plus le précédent — et une liste te laisse " +
            "passer de l'un à l'autre. Stockage IndexedDB, affichage intégré (iframe sandboxée). " +
            "Le PDF livré dans le ZIP par l'auteur du plan apparaît en tête (📕, non supprimable) " +
            "et ne t'empêche plus d'ajouter les tiens.</li>" +
        "</ul>" +
        "<p>📖 <strong>Accès</strong> : bouton <strong>📖</strong> dans la sidebar (à côté des stats), " +
        "même taille que les autres chips header. Visible quand le plan a une note OU un PDF associé. " +
        "Sinon, le bouton ouvre directement la modale d'édition pour démarrer.</p>" +
        "<p>💾 <strong>Inclus dans tes exports</strong> : la note libre et le PDF Histoire sont " +
        "embarqués dans les exports <strong>MKMSESSION</strong> (Full session ZIP) — tu peux donc " +
        "transmettre tout le contexte avec ta session.</p>" +
        "<p>🔇 <strong>100% local</strong> : le PDF reste en IndexedDB sur ton appareil, jamais " +
        "transmis nulle part. Si tu changes d'appareil, importe-le depuis ton MKMSESSION.</p>",
      hint: "Idéal pour les plans hérités d'un ancien collègue : tu peux raconter l'histoire du site et joindre la topo originale dans un seul \"sac\" exportable."
    },

    // ─── 25/26 — Le Carnet (v1.69.0) ───
    {
      emoji: "📔",
      titre: "Mon carnet — l'historique de tes sorties",
      texte:
        "<p>La sauvegarde auto garde <strong>l'état courant</strong> d'un plan. Le " +
        "<strong>carnet</strong>, lui, garde <strong>l'histoire</strong> : chaque fois que tu explores " +
        "un plan, une <strong>sortie</strong> est archivée. Effacer une session ne supprime pas les " +
        "sorties déjà rangées.</p>" +
        "<p>📔 <strong>Une sortie contient</strong> : la date, la durée réellement passée dans l'app, " +
        "la distance parcourue au tracker, les points / tracés / zones ajoutés, les photos prises, le " +
        "tracé de ton déplacement, et une <strong>note libre</strong> que tu peux écrire même des " +
        "semaines plus tard.</p>" +
        "<p>🚶 <strong>Terrain ou 🖥️ travail sur plan ?</strong> Le carnet fait la différence tout seul : " +
        "si le tracker a enregistré du déplacement, c'est une <strong>sortie terrain</strong> ; si tu " +
        "n'as fait qu'annoter sans bouger (préparation à la maison), c'est du <strong>travail sur " +
        "plan</strong>, rangé à part. Les <strong>totaux ne comptent que le terrain</strong>. L'app " +
        "s'est trompée (sortie faite tracker éteint) ? Un bouton de la fiche corrige le classement.</p>" +
        "<p>📔 <strong>Où</strong> : tuile <strong>📔 Mon carnet</strong> sur l'accueil, dans la carte " +
        "« 🧰 Outils » (visible aussi sur mobile). Depuis un plan : modale <strong>Session</strong> " +
        "→ section <strong>📔 Sortie en cours</strong>, avec <strong>🏁 Clôturer ma sortie</strong> pour " +
        "la ranger tout de suite.</p>" +
        "<p>📖 <strong>2e onglet : Récits</strong> — tes notes libres et tes PDF de plan (Mode Histoire) " +
        "réunis <strong>tous plans confondus</strong>, lisibles et modifiables <strong>sans charger le " +
        "plan</strong>.</p>" +
        "<p>🔇 <strong>100 % local</strong> : rien n'est envoyé. Une sortie très courte et sans trace " +
        "n'est pas conservée, et le carnet part vide — il ne peut pas reconstituer tes sorties d'avant " +
        "la v1.69.0.</p>",
      hint: "Le carnet répond à « qu'est-ce que j'ai fait le 12 juillet ? » — une question à laquelle l'app ne savait pas répondre avant."
    },

    // ─── 26/26 — Outils annexes ───
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
        // 🆕 v1.40.32 — Mention commande vocale (oubliée à l'onboarding depuis v1.34.0)
        "<p>🎤 <strong>Commande vocale</strong> <em>(v1.34+)</em> : bouton micro flottant en bas-droite " +
        "du mode carte. Dis « <em>aller à [POI]</em> », « <em>activer tracker</em> », « <em>sortie d'urgence</em> » " +
        "et l'app exécute. Utilise la Web Speech API native du navigateur, <strong>aucun audio</strong> " +
        "ne quitte ton appareil. Auto-stop après commande exécutée pour économiser la batterie. iOS Safari " +
        "supporté (avec libération propre du micro au stop).</p>" +
        // 🆕 v1.40.32 — Mention vibration haptique + thème clair (déjà mentionnés mais brièvement)
        "<p>🪫 <strong>Vibration haptique</strong> <em>(v1.34.26+)</em> : toggle dans Configuration. " +
        "Vibre sur 5 events critiques (arrivée à destination, mode urgence, etc.). Discret, non intrusif.</p>" +
        "<p>📋 <strong>Rapports de crash</strong> : si l'app a été tuée par l'OS (OOM mobile typiquement), " +
        "le rapport est archivé dans 📊 Inspecteur mémoire → section Derniers crashs. Copiable pour " +
        "envoi à l'auteur via la page de contact.</p>" +
        "<p>🔎 <strong>Barre de recherche de l'accueil</strong> <em>(v1.69.0)</em> : au centre de " +
        "l'en-tête, elle cherche un point dans <strong>tous tes plans</strong> sans en ouvrir " +
        "aucun — Entrée ou 🔎 pour lancer.</p>" +
        "<p>📚 <strong>Aide intégrée</strong> (sidebar gauche → 📚) : doc complète de chaque fonction. " +
        "Si tu te demandes « comment fait-on X ? », c'est là.</p>" +
        "<p><strong>Bonne exploration ! 🚀</strong></p>",
      hint: "Tu peux rejouer ce tutoriel à tout moment via le bouton 🎓 en haut de la modale 📖 Documentation."
    }
  ];

  // 🆕 v1.44.6 — Version ANGLAISE de l'onboarding (parité 1:1 avec CARDS FR).
  // Même logique que la doc bilingue (interfaceDocs.js) : la langue active est
  // lue depuis la clé localStorage partagée `myktamap_readme_lang` ("fr"|"en"),
  // togglée via le bouton 🇫🇷/🇬🇧 du header du tutoriel (cohérent avec la modale
  // Documentation). Traduction fidèle, mêmes emojis, même structure, mêmes
  // codes/raccourcis (Ctrl+K, etc.) que la version FR.
  const CARDS_EN = [
    // ─── 1/26 — Welcome ───
    {
      emoji: "🌟",
      titre: "Welcome to MyKTAMap",
      texte:
        "<p><strong>MyKTAMap</strong> is an <strong>underground mapping</strong> application built " +
        "for the field: quarries, catacomb galleries, underground and industrial sites.</p>" +
        "<p>You work on a <strong>plan image</strong> (scanned paper map, drawing, photo). " +
        "No GPS needed, no network needed — the app runs fully offline once loaded.</p>" +
        "<p>📜 <strong>License</strong>: CC BY-NC-SA 4.0 — non-commercial use, share-alike. " +
        "The code is public on GitHub (<code>Karmakta91/MyKTAMap</code>). This guarantee applies " +
        "<strong>ONLY</strong> to the official domain <code>myktamap.fr</code>.</p>" +
        "<p>This short tour helps you discover the app in a few minutes. You can skip it at any time " +
        "and replay it via <strong>📖 Documentation → 🎓 button</strong> in the modal header.</p>",
      hint: "Navigate with the ◂ ▸ arrows or the ← → / Space keys on your keyboard."
    },

    // ─── 2/26 — Privacy & offline ───
    {
      emoji: "🛡️",
      titre: "100% offline, 100% private",
      texte:
        "<p>MyKTAMap is a <strong>strictly client-side</strong> PWA:</p>" +
        "<ul>" +
          "<li>❌ <strong>No backend server</strong>, no remote database</li>" +
          "<li>❌ <strong>No tracking cookies</strong>, no telemetry, no analytics</li>" +
          "<li>❌ <strong>No account</strong>, no authentication, no cloud sync</li>" +
          "<li>✅ Your annotations, sessions, plans and favorites stay <strong>locally</strong> in " +
            "your browser (LocalStorage + IndexedDB)</li>" +
          "<li>✅ Only requests sent: same-origin (app assets) and a " +
            "<code>gstatic.com/generate_204</code> ping to detect connectivity</li>" +
        "</ul>" +
        "<p>🔒 <strong>Check it yourself</strong>: open <strong>⚙️ Configuration → 🔒 Network audit</strong> " +
        "to see the LIVE log of every request the app sends. Also enable " +
        "<strong>\"Strict offline mode\"</strong> which blocks any non-whitelisted request " +
        "directly in the browser.</p>" +
        "<p>📜 <strong>Server-side CSP header</strong> (Nginx): <code>connect-src 'self' https://www.gstatic.com</code> " +
        "— your browser ITSELF would refuse any exfiltration to an external domain, even if an " +
        "attacker injected malicious JS.</p>"
    },

    // ─── 3/26 — Load an existing plan ───
    {
      emoji: "🗂️",
      titre: "Load an existing plan",
      texte:
        "<p>From the <strong>home page</strong>, several ways to load an already available plan:</p>" +
        "<ul>" +
          "<li><strong>📚 My plans</strong>: list of every plan you have already imported or created. " +
            "Persisted in IndexedDB → you find them again on next launch without re-dropping anything.</li>" +
          "<li><strong>📦 Drop MyKTAMap ZIP</strong>: drop a <code>.zip</code> file in the drop zone. " +
            "This is the native format — direct loading, full roundtrip (tags, levels, photos, " +
            "custom legend preserved).</li>" +
          "<li><strong>📥 Drop KMZ / GPX</strong>: the same drop zone also accepts <code>.kmz</code> " +
            "files (Google Earth, OsmAnd) and <code>.gpx</code> (TopoDroid, Strava, Garmin). " +
            "The app automatically converts them into a rebuilt MyKTAMap ZIP.</li>" +
          "<li><strong>🌐 Server auto-discovery</strong>: if the app is installed on a server that " +
            "exposes <code>data/index.json</code>, public plans are listed there automatically.</li>" +
        "</ul>" +
        "<p>💡 <strong>Imported KMZ / GPX</strong>: ideally <strong>exported from MyKTAMap</strong> " +
        "(100% preserved roundtrip). Otherwise, info missing from the standard format (MyKTAMap tags, " +
        "M-LVL levels, etc.) is replaced by defaults. For a GPX with no image, the app generates a " +
        "blank canvas auto-calibrated on the file's GPS bounds.</p>"
    },

    // ─── 4/26 — Create a plan: Simple Mode ───
    {
      emoji: "🏗️",
      titre: "Create a plan — Simple Mode",
      texte:
        "<p>Want to start a new plan? Click <strong>🏗️ Generate a plan</strong> on the " +
        "home page. <strong>Simple Mode</strong> is the default option on first launch.</p>" +
        "<p>You get a ready-to-use MyKTAMap ZIP in <strong>30 seconds</strong> with just:</p>" +
        "<ul>" +
          "<li>🖼️ <strong>A plan image</strong> (scan, photo, drawing) or a <strong>blank canvas</strong> " +
            "(4 standard sizes + 4 color choices: sepia / white / grey / black)</li>" +
          "<li>🏷️ <strong>A name</strong> and a <strong>version</strong> (the rest is auto-filled)</li>" +
          "<li>🏗️ Optional: <strong>🏗️ Multi-level plan</strong> checkbox for a multi-storey quarry</li>" +
          "<li>🧱 Optional: <strong>🧱 V2 tiled</strong> checkbox if plan ≥ 4000×4000 px (recommended for mobile perf)</li>" +
        "</ul>" +
        "<p>Built-in icons (shafts, rooms, crawlways, hazards…) are auto-loaded. " +
        "No need to touch data layers, tracking or GPS calibration — the app provides sensible " +
        "default values.</p>",
      hint: "To switch to Advanced Mode: the \"🎨 Advanced\" button at the top of the generator."
    },

    // ─── 5/26 — Create a plan: Advanced Mode ───
    {
      emoji: "🎨",
      titre: "Create a plan — Advanced Mode",
      texte:
        "<p>The generator's <strong>Advanced Mode</strong> gives you full control over every " +
        "technical parameter of the plan:</p>" +
        "<ul>" +
          "<li>🖼️ <strong>Image layers</strong>: stack several PNGs (e.g. raw plan + legend + " +
            "scanned paper annotations) with configurable order and visibility</li>" +
          "<li>📊 <strong>Data layers</strong>: embed point/path/zone/structure JSON files into the " +
            "plan (e.g. shafts.json, vehicles.json). Read-only at runtime, filterable by layer in " +
            "the map's Layers modal.</li>" +
          "<li>🚶 <strong>Tracking configuration</strong>: tracker start position, px↔m scale, " +
            "step length, threshold, cooldown</li>" +
          "<li>🎨 <strong>Custom icons</strong>: replace the default icons, add 50×50 PNGs " +
            "for new tags</li>" +
          "<li>🌐 <strong>GPS georeferencing</strong>: 2 points (plan ↔ GPS) that enable KMZ/GPX " +
            "export and GPS coordinates display in popups</li>" +
          "<li>🏷️ <strong>Plan-level legend</strong>: customize labels + masks + custom entries " +
            "embedded IN the plan ZIP (= cross-user sharing)</li>" +
        "</ul>" +
        "<p>If you edit an existing plan (drop ZIP in the generator → Edit mode), the form is " +
        "<strong>pre-filled</strong> with current values and automatically forces Advanced Mode.</p>"
    },

    // ─── 6/26 — Points POI ───
    {
      emoji: "📍",
      titre: "Points of interest (POI)",
      texte:
        "<p><strong>Right sidebar → ✏️ (direct click = enables add mode)</strong></p>" +
        "<p>Click the ✏️ icon to start add mode (the button gets highlighted). " +
        "Then each click on the map drops a new marker. Click ✏️ again to exit " +
        "the mode. A modal opens for each point with:</p>" +
        "<ul>" +
          "<li><strong>Name</strong> (= unique identifier, used by exports and the pathfinder)</li>" +
          "<li><strong>Tags</strong>: typed icon among the built-ins (ventilation shaft, room, crawlway, " +
            "passage, hazard, electricity…) or your plan's custom tags</li>" +
          "<li><strong>State</strong>: not inspected / OK / dangerous (tints the icon)</li>" +
          "<li><strong>Description</strong> multiline: free textarea, shown in the popup + embedded " +
            "in KMZ / GPX / JSON exports</li>" +
          "<li>📸 <strong>POI photos</strong>: up to 5 photos per point. Compressed locally " +
            "(canvas → JPEG q85 max 1920px), stored in IndexedDB. <strong>Never sent to the Internet</strong>.</li>" +
        "</ul>" +
        "<p><strong>A point's popup</strong> (click on the marker):</p>" +
        "<ul>" +
          "<li>🌐 <strong>GPS coordinates</strong> if plan is calibrated — copyable to clipboard in one click</li>" +
          "<li>📸 <strong>Photo thumbnails</strong> clickable → fullscreen viewer (pinch-zoom, swipe)</li>" +
          "<li>🗺️ <strong>Go there</strong>: starts a route from your position to this point</li>" +
          "<li>⭐ <strong>Favorite</strong>: marks this point as important</li>" +
          "<li>✏️ <strong>Edit</strong> / 🗑️ <strong>Delete</strong></li>" +
        "</ul>"
    },

    // ─── 7/26 — Paths ───
    {
      emoji: "🛣️",
      titre: "Paths (routes and trails)",
      texte:
        "<p><strong>Right sidebar → 🛣️ Paths → Main / Secondary / Trail</strong></p>" +
        "<p>Click-click on the map to draw a polyline. Click the active icon again to " +
        "<strong>validate</strong> the path. 3 predefined types with distinct colors:</p>" +
        "<ul>" +
          "<li>🟩 <strong>Main</strong>: large known galleries, main axes</li>" +
          "<li>🟪 <strong>Secondary</strong>: junction galleries, less frequented</li>" +
          "<li>🟨 <strong>Trail</strong>: narrow passages, shortcuts, exploratory paths</li>" +
        "</ul>" +
        "<p>Paths are used by the <strong>pathfinder (Dijkstra)</strong> to compute automatic " +
        "routes between 2 points (see card 16). <strong>Intersections</strong> are " +
        "detected automatically (colored circles at crossings — color of the lowest-priority path).</p>" +
        "<p><strong>💬 Note on a path</strong>: button in the popup → multiline textarea, embedded " +
        "in exports. Ideal to annotate a gallery (state, hazards, landmarks).</p>" +
        "<p><strong>📏 Path distance</strong>: visible in 📊 Session details, or via the " +
        "<strong>📏 Total distance</strong> tool (cumulative magenta highlight).</p>"
    },

    // ─── 8/26 — Zones ───
    {
      emoji: "⬛",
      titre: "Zones (Water, rubble, inaccessible…)",
      texte:
        "<p><strong>Right sidebar → ⬛ Zones → Water / Rubble / Collapse / Inaccessible</strong></p>" +
        "<p>Click on the map to place the vertices of a polygon. Click the 1st vertex again to " +
        "close the zone. 4 predefined types:</p>" +
        "<ul>" +
          "<li>💧 <strong>Water</strong>: puddle, lake, flooded area (blue)</li>" +
          "<li>⬛ <strong>Rubble</strong>: scree, partial blockage, debris (grey)</li>" +
          "<li>🟥 <strong>Collapse</strong>: dangerous area, fallen vault (red)</li>" +
          "<li>⛔ <strong>Inaccessible</strong>: physically unreachable or forbidden area " +
            "(red/black 45° hatching)</li>" +
        "</ul>" +
        "<p>⚠️ <strong>Inaccessible zone — pathfinder effect</strong>: these zones <strong>BLOCK</strong> " +
        "route computation. The pathfinder will refuse any path segment crossing an inaccessible " +
        "zone. Even at the current active level in multi-level mode (inter-level junctions " +
        "pass over without being blocked — vertical transit points).</p>" +
        "<p>💬 <strong>Note on a zone</strong>: popup → textarea. Embedded in exports.</p>"
    },

    // ─── 9/26 — Structures ───
    {
      emoji: "🏛️",
      titre: "Structures (pillars, walls, faces)",
      texte:
        "<p><strong>Right sidebar → 🏛️ Structures</strong></p>" +
        "<p>Cataphile structures are the <strong>built / carved elements</strong> of the " +
        "quarry. 5 predefined sub-types:</p>" +
        "<ul>" +
          "<li>🟡 <strong>Pillar (upper mass)</strong> (yellow polygon): upper support pillar</li>" +
          "<li>🟠 <strong>Pillar (lower mass)</strong> (orange polygon): lower pillar</li>" +
          "<li>🔵 <strong>Wall</strong> (dark blue polygon): retaining wall, rubble barrier</li>" +
          "<li>🟨 <strong>Working face (upper)</strong> (thick yellow polyline): extraction limit</li>" +
          "<li>🟧 <strong>Working face (lower)</strong> (thick orange polyline)</li>" +
        "</ul>" +
        "<p><strong>Polygon vs polyline difference</strong>:</p>" +
        "<ul>" +
          "<li>Pillars + Wall = <strong>closed</strong> polygons (≥ 3 vertices) with fill color</li>" +
          "<li>Faces = <strong>open</strong> polylines (≥ 2 vertices) without fill</li>" +
        "</ul>" +
        "<p>💬 <strong>Note on a structure</strong>: popup → textarea. Embedded in exports.</p>" +
        "<p>📊 <strong>Count stats</strong>: visible in 📊 Session details with breakdown by type.</p>"
    },

    // ─── 10/26 — Customizable legend ───
    {
      emoji: "🏷️",
      titre: "Customizable legend",
      texte:
        "<p>You can <strong>customize the legend</strong>: rename types, hide the ones you " +
        "don't use, or even <strong>add your own drawable types</strong>.</p>" +
        "<p>🎯 <strong>3-level cascade</strong>:</p>" +
        "<ol>" +
          "<li><strong>Session</strong>: edits made from the map (🗺️ Legend modal → ✏️ Edit). " +
            "Persisted locally with the current session.</li>" +
          "<li><strong>Plan</strong>: edits made from the <strong>Advanced Mode generator</strong>. " +
            "Embedded IN the plan ZIP → shared with all users of this plan.</li>" +
          "<li><strong>MyKTAMap default</strong>: built-in values (Main, Water, Upper-mass pillar, etc.)</li>" +
        "</ol>" +
        "<p>📋 <strong>Usage examples</strong>:</p>" +
        "<ul>" +
          "<li>Rename \"Water\" → \"Bottom lake\" for YOUR plan</li>" +
          "<li>Hide \"Lower-mass pillar\" if the quarry has none</li>" +
          "<li>Add a new \"⚠️ Toxic gas\" type (red hatched polygon) to flag specific areas</li>" +
        "</ul>" +
        "<p>🌍 <strong>KMZ + GPX roundtrip</strong>: the plan's custom legend travels with exports " +
        "and is restored on re-import → even a recipient who opens your KMZ/GPX in MyKTAMap will find " +
        "your renamings and your custom types.</p>"
    },

    // ─── 11/26 — Tracker + Replay ───
    {
      emoji: "🧭",
      titre: "Position tracker (PDR) + Replay",
      texte:
        "<p>The <strong>🧭 Tracker</strong> mode (right sidebar flyout) uses your phone's motion " +
        "sensors (accelerometer, magnetometer) to estimate your position in real time — without GPS " +
        "(= useful underground).</p>" +
        "<p><strong>Tracker flyout sub-actions</strong>:</p>" +
        "<ul>" +
          "<li>▶️ <strong>Play / Stop</strong>: starts PDR (Pedestrian Dead Reckoning) step detection. " +
            "The marker moves according to your orientation and detected steps.</li>" +
          "<li>🧭 <strong>Compass</strong>: rotating visual widget that counter-rotates to keep North " +
            "up. Lets you verify the heading is correct.</li>" +
          "<li>📍 <strong>Recalibrate</strong>: click on the map to <strong>teleport</strong> the marker " +
            "to where you actually are. <strong>Use it every ~50 m</strong> to correct cumulative " +
            "drift.</li>" +
          "<li>🗺️ <strong>Route</strong>: opens the modal to compute a route from your current " +
            "position.</li>" +
          "<li>🎬 <strong>Replay</strong>: review your tracking session afterwards. Timeline slider + " +
            "play/pause + speed 0.5× to 10× + CSV export of timestamped positions.</li>" +
          "<li>🔥 <strong>Heatmap</strong>: cumulative multi-session foot-traffic density (see card 19).</li>" +
        "</ul>" +
        "<p>⚠️ <strong>EXPERIMENTAL</strong>: drift is unavoidable (imprecise sensors + metal " +
        "structures that throw off the magnetometer). It's a debug/curiosity tool, <strong>NOT a " +
        "backup GPS</strong>. To locate yourself in a tense situation, use the ⛑️ I'm lost mode " +
        "(next card).</p>"
    },

    // ─── 12/26 — Emergency modes ───
    {
      emoji: "⛑️",
      titre: "Emergency modes (Lost / Panic / Exit)",
      texte:
        "<p>3 complementary modes, at the <strong>end of the Tracker flyout</strong> with a distinctive red background:</p>" +
        "<ul>" +
          "<li>⛑️ <strong>I'm lost</strong>: you roughly know where you've been but not where you are " +
            "<em>now</em>. The app computes a <strong>probable area</strong> (search circle) " +
            "from your last known position + elapsed time + estimated average speed. You " +
            "can refine it by adding visual clues (\"I saw a big red plaque\", " +
            "\"there was a pillar here\").</li>" +
          "<li>🚨 <strong>XL emergency mode (panic)</strong>: you know where you are (the tracker shows it) " +
            "but you're panicking and need vital info BIG. Displays your GPS coordinates + compass " +
            "heading + battery level fullscreen, hiding the rest of the UI. Saves your battery.</li>" +
          "<li>🚨 <strong>Emergency exit</strong> <em>(v1.35+)</em>: you want to <strong>get out fast</strong>. " +
            "The app computes via pathfinder the optimal route from your position to the <strong>nearest " +
            "exit</strong> — a surface-access POI (open cavage, shaft or stairway: tags " +
            "<code>cao</code> / <code>peo</code> / <code>eso</code>) or tagged <code>entrée</code> (you " +
            "can leave the way you came in). Shows distance + ETA + drawn route. Ideal when the battery is " +
            "dropping, the tide is rising, or a storm is approaching above.</li>" +
        "</ul>" +
        "<p>💡 <strong>3 different use cases</strong>:</p>" +
        "<ul>" +
          "<li>⛑️ = I do NOT know where I am → compute a search area</li>" +
          "<li>🚨 panic = I know where I am → XL display to communicate the position</li>" +
          "<li>🚨 exit = I know where I am → guides me to the nearest exit</li>" +
        "</ul>" +
        "<p>🔆 <strong>Wake Lock</strong>: during emergency mode, the screen no longer turns off (browser " +
        "Wake Lock API). You can also enable it permanently from ⚙️ Configuration → " +
        "\"Keep screen on\".</p>",
      hint: "Emergency modes NEVER replace a call to rescue services. It's a backup tool to communicate your position to rescuers."
    },

    // ─── 13/26 — Rescue Mode ───
    {
      emoji: "🚨",
      titre: "Rescue Mode (search team coordination)",
      texte:
        "<p>⚠️ <strong>3 distinct \"emergency\" modes</strong> in MyKTAMap, don't confuse them:</p>" +
        "<ul>" +
          "<li>⛑️ <strong>I'm lost</strong> = YOU are looking for yourself</li>" +
          "<li>🚨 <strong>Panic mode</strong> = YOU are panicking (see previous card)</li>" +
          "<li>🚨 <strong>Rescue Mode</strong> = SOMEONE ELSE is lost, you coordinate the search</li>" +
        "</ul>" +
        "<p>Access: sidebar → 🧭 Tracker flyout → red <strong>🚨 Rescue Mode</strong> button.</p>" +
        "<p>The scenario has <strong>2 distinct states</strong>:</p>" +
        "<p>📝 <strong>State 1 — CREATION</strong> (cold planning OR on the spot):</p>" +
        "<ul>" +
          "<li>Create a named scenario (\"Search for Marc 05/26\")</li>" +
          "<li>Add teams (NATO palette Alpha/Bravo/Charlie...) with " +
            "<strong>entry + intermediate + exit</strong> route + search area + auto-computed " +
            "route (Pathfinder avoids overlaps between teams)</li>" +
          "<li>Auto pre-fill from ⛑️ Lost Mode (last known position + uncertainty area)</li>" +
          "<li>Multi-level M-LVL supported (auto 1 team per floor if needed)</li>" +
          "<li>Export <strong>3 formats</strong>: printable A4 PDF with mini-map + cross-app " +
            "geolocated KMZ (Google Earth / OsmAnd) + standalone <code>.mkmsec.json</code> for cross-device sharing</li>" +
        "</ul>" +
        "<p>🚀 <strong>State 2 — FIELD EXECUTION</strong> (incident triggered, real-time Live view):</p>" +
        "<ul>" +
          "<li><strong>\"🚀 Launch the rescue plan\"</strong> button + role selection modal</li>" +
          "<li><strong>👤 Surface operator</strong>: command post, overview of multi-team cards + status " +
            "+ last obs + \"🚨 Take over\" button with automatic return</li>" +
          "<li><strong>🚨 Team member</strong>: in the field, clickable visual stepper + observations + " +
            "<strong>7 quick statuses</strong> (All clear / Suspect / Blocked / Clue / Help requested / " +
            "Forced turnaround / <strong>Victim found</strong> = blinking red card on the PC side) + " +
            "photos (max 5/step, dedicated local IDB)</li>" +
          "<li><strong>🚑 Free responder</strong>: reinforcement with no pre-assigned team, chronological " +
            "free-form notes with timestamps</li>" +
          "<li>Global timer with fair pause · \"📦 PLAN ENDED\" banner after stopping</li>" +
        "</ul>" +
        "<p>📤 <strong>Report along the steps</strong> at any time (button in each Live view): " +
        "printable PDF / standalone <code>.mkmsec.report.json</code> / clipboard text. " +
        "3 scopes depending on your role (global operator / team member only / responder notes).</p>",
      hint: "Phase 3 single-device for now. To share observations between surface operator and field team members, use .mkmsec.report.json (email / USB key / AirDrop)."
    },

    // ─── 14/26 — Unified search Ctrl+K ───
    {
      emoji: "🔍",
      titre: "Unified search (Ctrl+K)",
      texte:
        "<p><strong>Universal shortcut</strong>: <code>Ctrl+K</code> (Cmd+K on Mac) — opens the search " +
        "bar from anywhere in the app. Toggle click again to close.</p>" +
        "<p>🎯 <strong>Searches 4 categories simultaneously</strong>:</p>" +
        "<ul>" +
          "<li>📍 <strong>Points</strong>: by name, ID, tag, description</li>" +
          "<li>🛣️ <strong>Paths</strong>: by label, type, level</li>" +
          "<li>⬛ <strong>Zones</strong>: by label, type, level</li>" +
          "<li>🏛️ <strong>Structures</strong>: by label, type, level</li>" +
        "</ul>" +
        "<p>📑 <strong>Results grouped by category</strong>, scored by relevance. Live " +
        "auto-completion on every key pressed.</p>" +
        "<p>🎛️ <strong>Cumulative filters</strong> (chips above the list):</p>" +
        "<ul>" +
          "<li>By <strong>category</strong> (points / paths / zones / structures)</li>" +
          "<li>By <strong>layer</strong> (My annotations, shafts.json, etc.)</li>" +
          "<li>By <strong>tag</strong> (ventilation shaft, room, crawlway…)</li>" +
        "</ul>" +
        "<p>✨ <strong>Click on a result</strong>:</p>" +
        "<ul>" +
          "<li>Point → centers the map + opens the popup + yellow circle 3s</li>" +
          "<li>Path / Zone / Structure → centers + yellow flash 4s overlay</li>" +
        "</ul>"
    },

    // ─── 15/26 — Favorites ───
    {
      emoji: "⭐",
      titre: "Favorites (quick POIs)",
      texte:
        "<p>Mark your <strong>important points of interest</strong> as favorites to access them in 1 click.</p>" +
        "<p>📝 <strong>How to add a favorite</strong>:</p>" +
        "<ul>" +
          "<li>Click on a marker → popup → ⭐ <strong>Favorite</strong> button (toggle)</li>" +
          "<li>The star fills ⭐ and the point appears in the ⭐ Favorites group</li>" +
        "</ul>" +
        "<p>📂 <strong>Accessing favorites</strong>:</p>" +
        "<ul>" +
          "<li><strong>Left sidebar → ⭐ Favorites group</strong> (just after M-LVL if active). " +
            "Dynamic list updated on every add/remove.</li>" +
          "<li>Click a favorite → centers the map on the point + orange flash 3s + popup open</li>" +
        "</ul>" +
        "<p>📤 <strong>JSON Export / Import</strong>: from 📊 Session details, you can export " +
        "your favorites list as JSON then import it on another device (phone → computer, or share " +
        "with a friend). Lightweight format, independent of the plan.</p>" +
        "<p>💡 <strong>Typical use cases</strong>:</p>" +
        "<ul>" +
          "<li>Quarry main entrance (= \"base\")</li>" +
          "<li>Meeting point with a group</li>" +
          "<li>Bivouac room, drinking-water point</li>" +
          "<li>Trap / recently collapsed passage (to avoid)</li>" +
        "</ul>" +
        "<p>🔒 <strong>Storage</strong>: <code>localStorage[\"myktamap_favoris_v1\"]</code> indexed by " +
        "planId. Full snapshots of points = resilience even if the point is moved or deleted.</p>"
    },

    // ─── 16/26 — Route pathfinder ───
    {
      emoji: "🗺️",
      titre: "Route pathfinder",
      texte:
        "<p>Computes the <strong>shortest path</strong> between N waypoints following the existing " +
        "path network (<strong>Dijkstra</strong> algorithm + crossing enrichment).</p>" +
        "<p>🎯 <strong>3 ways to add a waypoint</strong>:</p>" +
        "<ul>" +
          "<li>🔍 <strong>Autocomplete</strong> in the route modal (search points by name/tag)</li>" +
          "<li>🏷️ <strong>Exact ID entry</strong> + Add button</li>" +
          "<li>📍 <strong>Click on the map</strong> (cyan floating mode)</li>" +
          "<li>🧭 <strong>My position</strong>: takes your current tracker position as the start point</li>" +
        "</ul>" +
        "<p>🚫 <strong>Avoidance preferences (optional)</strong>:</p>" +
        "<ul>" +
          "<li><strong>Points</strong>: \"do NOT go through this shaft\"</li>" +
          "<li><strong>Tags</strong>: \"avoid all hazard-type passages\"</li>" +
          "<li><strong>Avoidance radius</strong>: margin around avoided points (0-500 px, default 100)</li>" +
        "</ul>" +
        "<p>⛔ <strong>Inaccessible zones</strong> are automatically bypassed (hard constraint). " +
        "Point/tag avoidances are <strong>soft</strong> constraints — if no path exists " +
        "without them, the pathfinder still computes a path and flags that it had to go through them.</p>" +
        "<p>⚙️ <strong>Speed modes</strong> (affect the estimated time): 🤕 Injured 2 km/h / 🐌 Slow " +
        "3 km/h / 🚶 Normal 5 km/h / 🏃 Fast 7 km/h. +15 min break per intermediate waypoint.</p>" +
        "<p>📊 <strong>Distance + estimated time</strong> label at the bottom-left of the map. Neon cyan path " +
        "with SVG drop-shadow halo.</p>"
    },

    // ─── 17/26 — Measurements ───
    {
      emoji: "📐",
      titre: "Measurements (distance, area, total)",
      texte:
        "<p><strong>3 complementary measurement tools</strong>:</p>" +
        "<p>📐 <strong>Distance measurement</strong> (right sidebar → 📐 Measure → 📐 Distance)</p>" +
        "<ul>" +
          "<li>Click-click to place vertices, dashed magenta polyline</li>" +
          "<li>Live label <code>123.4 m</code> or <code>1.23 km</code> beyond 1 km</li>" +
          "<li>Angles between segments displayed</li>" +
          "<li>Persisted in session (available again on reload)</li>" +
        "</ul>" +
        "<p>⬛ <strong>Area measurement</strong> (right sidebar → 📐 Measure → ⬛ Area)</p>" +
        "<ul>" +
          "<li>Click to place polygon vertices. Shoelace algorithm.</li>" +
          "<li>Live label <code>1234 m²</code> or <code>1.23 ha</code> beyond 1 hectare</li>" +
          "<li>2 EXCLUSIVE modes (distance OR area) — switching resets the points</li>" +
        "</ul>" +
        "<p>📏 <strong>Total path distance</strong> (right sidebar → 🛣️ Paths → 📏)</p>" +
        "<ul>" +
          "<li>Highlights in <strong>cumulative magenta</strong> all paths of a given type</li>" +
          "<li>Computes the total distance per type + grand total</li>" +
          "<li>Filterable: ☑ Main / ☑ Secondary / ☑ Trail</li>" +
          "<li>Includes ALL paths (session + embedded data layers, visible or hidden)</li>" +
        "</ul>" +
        "<p>The <code>px/m</code> scale is set in the plan's tracking config (or default 1 px = 1 m).</p>"
    },

    // ─── 18/26 — Multi-level ───
    {
      emoji: "🏗️",
      titre: "Multi-level (M-LVL)",
      texte:
        "<p>If you map a quarry with <strong>several stacked floors</strong>, the " +
        "multi-level mode is essential. <strong>Enabled at plan creation time</strong> " +
        "(generator → \"🏗️ Multi-level plan\" checkbox) or manual <code>plan-config.json</code> edit.</p>" +
        "<p>📍 <strong>\"Active level\" button</strong> (left sidebar) — yellow badge with the number:</p>" +
        "<ul>" +
          "<li>Click → management modal (active level single-select + visible levels multi-select)</li>" +
          "<li>Active level = where new annotations are drawn</li>" +
          "<li>Visible levels = what you see displayed (Quick actions \"All\" / \"Active only\")</li>" +
          "<li>Negative levels supported (basements -1, -2…). Extensible via − and + buttons</li>" +
        "</ul>" +
        "<p>🪜 <strong>Inter-level junctions</strong> (right sidebar → 🛣️ Paths → 🪜):</p>" +
        "<ul>" +
          "<li>Special path connecting 2 points on different levels (stairs, slope, internal shaft)</li>" +
          "<li>Always visible regardless of the level filter (= otherwise impossible to navigate between floors)</li>" +
          "<li>Magenta dashed style with round markers at the ends</li>" +
          "<li>The pathfinder uses them naturally to move from one level to another</li>" +
        "</ul>" +
        "<p>📤 <strong>Exports respect the level filter</strong>: you can draw on 5 floors and " +
        "export only the 2 in the middle. Per-level breakdown in 📊 Global stats.</p>",
      hint: "If your quarry is single-level, ignore this feature — left for advanced use only."
    },

    // ─── 19/26 — Global stats + Heatmap ───
    {
      emoji: "📊",
      titre: "Global stats + Heatmap",
      texte:
        "<p>📊 <strong>Plan global stats</strong> (accessible from 📊 Session details → 📊 View " +
        "global statistics):</p>" +
        "<ul>" +
          "<li>Totals per category (points / paths / zones / structures)</li>" +
          "<li>Breakdown by tag (how many ventilation shafts, how many rooms, etc.)</li>" +
          "<li>Cumulative total distance + total area</li>" +
          "<li>If multi-level: per-level breakdown</li>" +
          "<li><strong>4 native inline SVG pie charts</strong>: point tags / path types / " +
            "zone types / structure types distribution</li>" +
          "<li>📤 <strong>A4 PDF tech-sheet export</strong> + 📊 <strong>CSV ZIP export</strong> " +
            "(4 UTF-8 files + README, Excel-FR compatible <code>;</code> separator)</li>" +
        "</ul>" +
        "<p>🔥 <strong>Heatmap</strong> (Tracker flyout → 🔥) — visual foot-traffic density:</p>" +
        "<ul>" +
          "<li>6 checkable sources: tracker timeline / session points / session paths / session zones / " +
            "session structures / 4 data-layer sub-sources (points / paths / zones / structures, " +
            "visible or not)</li>" +
          "<li>Radius sliders (10-120 px) + Intensity (0.2-3×)</li>" +
          "<li>Interpolation along segments (real continuous trails, not isolated blobs)</li>" +
          "<li>Auto normalization: densest pixel = red, least dense = blue (adapts to your data)</li>" +
          "<li>Tracker timeline filter: skip recalibrations (teleports), pauses >5min</li>" +
        "</ul>" +
        "<p>💡 <strong>Multi-session</strong> accumulation: the tracker timeline is persisted between " +
        "restarts → your heatmap builds up as you explore.</p>"
    },

    // ─── 20/26 — Session exports JSON / KMZ / GPX ───
    {
      emoji: "💾",
      titre: "Session exports — JSON, KMZ, GPX",
      texte:
        "<p><strong>💾 Save session</strong> modal (left sidebar → ⬆) with 4 tabs:</p>" +
        "<p>📄 <strong>Session JSON tab</strong> — re-importable into MyKTAMap:</p>" +
        "<ul>" +
          "<li><strong>Full mode</strong>: everything in one file (points + paths + zones + structures + " +
            "measurements + tracker timeline + optional POI photos)</li>" +
          "<li><strong>Advanced mode</strong>: granularity by layer, by tag, by type, choice to include " +
            "or not the photos / tracker / measurements</li>" +
          "<li>Output: <code>.json</code> or <code>.zip</code> (if photos checked)</li>" +
        "</ul>" +
        "<p>🌍 <strong>KMZ tab</strong> — for Google Earth, OsmAnd, Avenza, ArcGIS Earth, Locus:</p>" +
        "<ul>" +
          "<li>Requires plan GPS calibration (2 plan↔GPS points, set in the generator)</li>" +
          "<li>Embeds the plan image + all Placemarks (points/lines/polygons) + per-tag icon style</li>" +
          "<li>The <strong>plan-level custom legend travels with the KMZ</strong> via an extra file " +
            "<code>myktamap-extras.json</code> (ignored by third-party apps, restored on MyKTAMap re-import)</li>" +
        "</ul>" +
        "<p>📤 <strong>GPX tab</strong> — for TopoDroid, OsmAnd, Strava, Garmin:</p>" +
        "<ul>" +
          "<li>Universal GPX 1.1 format, full MyKTAMap roundtrip (tags via <code>&lt;sym&gt;</code>, " +
            "M-LVL levels via <code>&lt;cmt&gt;</code>, descriptions, custom legend via <code>&lt;extensions&gt;</code>)</li>" +
          "<li>Reuses the KMZ calibration — if you configured KMZ, GPX works too</li>" +
        "</ul>" +
        "<p>🔄 <strong>Conversion tab</strong> — converts your session to/from a data layer " +
        "(<code>devmap-data</code>) ready to integrate into another plan-config.json. Tracker " +
        "intentionally excluded (= frozen, read-only data layer).</p>"
    },

    // ─── 21/26 — Image exports PNG / PDF ───
    {
      emoji: "🖼️",
      titre: "Image exports (PNG, printable PDF)",
      texte:
        "<p><strong>🖼️ Image export</strong> modal (left sidebar → 🖼️) with 2 modes:</p>" +
        "<p>⚡ <strong>Quick mode</strong>:</p>" +
        "<ul>" +
          "<li>Captures exactly what you see on the map (current layer visibility)</li>" +
          "<li>1 click → downloaded PNG file</li>" +
          "<li>Ideal to quickly share a view</li>" +
        "</ul>" +
        "<p>🎨 <strong>Advanced mode</strong>:</p>" +
        "<ul>" +
          "<li>Granular filters: by image layer, by data layer, by point tag, by path/" +
            "zone/structure type, by M-LVL level</li>" +
          "<li>Include the legend or not (4 styles: opaque / semi / watermark / print)</li>" +
          "<li>Format: PNG or JPG, custom resolution, 4 legend positions (4 corners)</li>" +
        "</ul>" +
        "<p>📄 <strong>Printable PDF export</strong>:</p>" +
        "<ul>" +
          "<li>5 formats × 2 orientations: A0/A1/A2/A3/A4 portrait OR landscape</li>" +
          "<li>Plan + annotations + 4-corner legend overlay + optional header (title + metas)</li>" +
          "<li>Layer filters identical to advanced PNG</li>" +
          "<li>Dedicated \"print\" style (white background, max contrast, readable when printed)</li>" +
        "</ul>" +
        "<p>💡 <strong>Typical use cases</strong>: A2/A3 print for the field (waterproof paper), " +
        "PNG for Discord/email, PDF for long-term archiving or formal sharing.</p>"
    },

    // ─── 22/26 — Auto-backups + Undo ───
    {
      emoji: "🛡️",
      titre: "Backups & Undo — safety net",
      texte:
        "<p>The app has <strong>3 levels of protection</strong> against data loss:</p>" +
        "<p>💾 <strong>Per-plan auto-save</strong> (localStorage slot <code>myktamap_session_v1_&lt;planId&gt;</code>):</p>" +
        "<ul>" +
          "<li>Silent save every 1.5 s (adaptive throttle if CPU busy)</li>" +
          "<li>1 slot per plan = each plan keeps ITS session independently</li>" +
          "<li>On next launch, your session is <strong>auto-restored</strong> without intervention</li>" +
        "</ul>" +
        "<p>📦 <strong>10 IndexedDB backups per plan</strong> (FIFO):</p>" +
        "<ul>" +
          "<li>Automatic snapshot every 5 min AND before a destructive action (clear session, reset, etc.)</li>" +
          "<li>Visible in 📊 Session details → 📦 Recent backups</li>" +
          "<li>Click ↻ <strong>Restore</strong> on a snapshot = reverts to that state (the app reloads " +
            "the right plan + state automatically)</li>" +
          "<li>Manual: 📆 Snapshot now button to freeze an important state</li>" +
        "</ul>" +
        "<p>⏪ <strong>Undo / Redo Ctrl+Z / Ctrl+Y</strong>:</p>" +
        "<ul>" +
          "<li>50 actions historized in RAM</li>" +
          "<li>Covers: add/edit/delete of points, paths, zones, structures</li>" +
          "<li>Also accessible via the ⏪ ⏩ buttons in the ⏪ History group of the left sidebar</li>" +
          "<li>Reset on plan switch (clean history per plan)</li>" +
        "</ul>" +
        "<p>💡 <strong>If something goes wrong</strong>: DevTools → Application → IndexedDB → " +
        "<code>myktamap_backups</code> contains ALL your sessions of all plans, even deleted ones. " +
        "You can always recover by manually exporting the JSON.</p>"
    },

    // ─── 23/26 — OSM View ───
    {
      emoji: "🌍",
      titre: "OSM View — your plan projected on OpenStreetMap",
      texte:
        "<p>If your plan is <strong>GPS georeferenced</strong> (2-point lat/lng calibration), you can " +
        "project it onto <strong>OpenStreetMap</strong> to see where it is in the real world — useful " +
        "to locate a site entrance, spot the surface roads, brief a rescue team unfamiliar with " +
        "the cavity.</p>" +
        "<p>🌍 <strong>2 usage contexts</strong>:</p>" +
        "<ul>" +
          "<li><strong>Fullscreen modal</strong> (from map mode): 🌍 button in the sidebar → " +
            "OSM View modal with your plan as a transparent overlay (opacity slider), your POIs, your paths, " +
            "your zones and structures. Plan V2 tiles + category filters + multi-level M-LVL.</li>" +
          "<li><strong>HOME widget</strong>: mini-map embedded in your home page with a plan selector " +
            "+ ⛶ fullscreen button. You see your georeferenced plans at a glance without loading.</li>" +
        "</ul>" +
        "<p>📍 <strong>\"My GPS position\" button</strong> in both contexts: on-demand single fix " +
        "(no continuous watch = 0 battery impact), cyan-blue marker + accuracy circle. " +
        "Safeguard: refuses if you are kilometers from the plan (e.g. Paris Catacombs plan while you're in Lyon).</p>" +
        "<p>🏷️ <strong>Tag filter</strong>: chips in the banner (POI by category). Consistent " +
        "with the map mode filter but independent (OSM filter local to the modal or widget).</p>" +
        "<p>🛡️ <strong>Strict opt-in</strong>: OSM View contacts <code>tile.openstreetmap.org</code> " +
        "for the map tiles. It's <strong>disabled by default</strong> (offline-first " +
        "philosophy). Enable it in <strong>⚙️ Configuration → 🌐 Allow OSM View</strong>. " +
        "Your plan data NEVER leaves your browser — only the public OSM tiles are " +
        "requested, like any standard web client. <em>Strict offline</em> and " +
        "<em>incognito</em> modes automatically block OSM View for consistency.</p>",
      hint: "© OpenStreetMap contributors attribution shown in the corner of the maps — ODbL obligation respected. Without plan GPS calibration, OSM View is not available (nothing to project)."
    },

    // ─── 24/26 — History Mode ───
    {
      emoji: "📖",
      titre: "History Mode — Free note + plan PDF",
      texte:
        "<p><strong>History Mode</strong> lets you tell the story of your plan: historical context, " +
        "anecdotes, sources, testimonies, site-specific instructions.</p>" +
        "<p>📖 <strong>2 complementary formats</strong>:</p>" +
        "<ul>" +
          "<li><strong>Free note</strong> (inline Markdown editor): headings, lists, links, bold / " +
            "italic, code blocks. Auto-save, persisted locally per plan.</li>" +
          "<li><strong>PDF documents</strong> <em>(v1.69.0: up to 10 per plan)</em>: import your " +
            "PDFs (original survey, historical IGN map, trip report, geological study…). They stack " +
            "up — a new import no longer overwrites the previous one — and a list lets you switch " +
            "between them. IndexedDB storage, embedded display (sandboxed iframe). The PDF shipped " +
            "in the ZIP by the plan author sits on top (📕, not deletable) and no longer prevents " +
            "you from adding your own.</li>" +
        "</ul>" +
        "<p>📖 <strong>Access</strong>: <strong>📖</strong> button in the sidebar (next to the stats), " +
        "same size as the other header chips. Visible when the plan has a note OR an associated PDF. " +
        "Otherwise, the button directly opens the edit modal to get started.</p>" +
        "<p>💾 <strong>Included in your exports</strong>: the free note and the History PDF are " +
        "embedded in <strong>MKMSESSION</strong> exports (Full session ZIP) — so you can " +
        "transmit all the context with your session.</p>" +
        "<p>🔇 <strong>100% local</strong>: the PDF stays in IndexedDB on your device, never " +
        "transmitted anywhere. If you switch devices, import it from your MKMSESSION.</p>",
      hint: "Ideal for plans inherited from a former colleague: you can tell the story of the site and attach the original survey in a single exportable \"bag\"."
    },

    // ─── 25/26 — The Logbook (v1.69.0) ───
    {
      emoji: "📔",
      titre: "My logbook — the history of your trips",
      texte:
        "<p>Auto-save keeps the <strong>current state</strong> of a plan. The <strong>logbook</strong> " +
        "keeps the <strong>history</strong>: every time you explore a plan, a <strong>trip</strong> is " +
        "archived. Clearing a session does not delete trips already filed.</p>" +
        "<p>📔 <strong>A trip contains</strong>: the date, the time actually spent in the app, the " +
        "distance travelled with the tracker, the points / paths / zones added, the photos taken, the " +
        "path you walked, and a <strong>free-form note</strong> you can write even weeks later.</p>" +
        "<p>🚶 <strong>Field trip or 🖥️ desk work?</strong> The logbook tells them apart on its own: if " +
        "the tracker recorded movement it is a <strong>field trip</strong>; if you only annotated " +
        "without moving (prep at home) it is <strong>desk work</strong>, filed separately. " +
        "<strong>Totals count field trips only</strong>. Got it wrong (a trip made with the tracker " +
        "off)? A button on the trip sheet fixes the classification.</p>" +
        "<p>📔 <strong>Where</strong>: the <strong>📔 My logbook</strong> tile on the home screen, in the " +
        "« 🧰 Tools » card (visible on mobile too). From a plan: <strong>Session</strong> modal → " +
        "<strong>📔 Trip in progress</strong>, with <strong>🏁 Close my trip</strong> to file it right " +
        "away.</p>" +
        "<p>📖 <strong>2nd tab: Stories</strong> — your free notes and plan PDFs (History Mode) gathered " +
        "<strong>across all plans</strong>, readable and editable <strong>without loading the " +
        "plan</strong>.</p>" +
        "<p>🔇 <strong>100% local</strong>: nothing is uploaded. A very short trip that left no trace is " +
        "not kept, and the logbook starts empty — it cannot reconstruct your trips from before " +
        "v1.69.0.</p>",
      hint: "The logbook answers \"what did I do on July 12th?\" — a question the app simply could not answer before."
    },

    // ─── 26/26 — Additional tools ───
    {
      emoji: "⚙️",
      titre: "Configuration & additional tools",
      texte:
        "<p>To go further, the app has many additional tools:</p>" +
        "<p>⚙️ <strong>⚙️ Loader Configuration</strong> (button on the home page):</p>" +
        "<ul>" +
          "<li>🖼️ <strong>Tiling Mode</strong>: performance preset (auto / quality / balanced / performance / off)</li>" +
          "<li>🚀 <strong>ULTRA Mode</strong>: 6 fine-grain toggles for large plans (decimation, " +
            "skip animations, viewport culling, etc.)</li>" +
          "<li>📊 <strong>Memory inspector</strong>: full transparency on what is stored locally " +
            "(localStorage, IndexedDB, PWA Cache). 📋 Copy report button.</li>" +
          "<li>🔒 <strong>Network audit</strong>: LIVE log of every request sent + " +
            "\"strict offline\" mode that blocks anything non-whitelisted</li>" +
          "<li>🎨 <strong>Light theme</strong>: dark/light toggle, persisted locally</li>" +
          "<li>🔆 <strong>Wake Lock</strong>: keeps the screen on (useful in a cavity)</li>" +
          "<li>🔄 <strong>Soft force update</strong>: purges the PWA cache without touching your data</li>" +
          "<li>💥 <strong>Reset everything</strong>: full wipe (localStorage + IDB + caches). " +
            "Double confirmation required.</li>" +
        "</ul>" +
        "<p>⚙️ <strong>⚙️ Map mode settings</strong> (left sidebar): per-plan preferences (debug, " +
        "performance, M-LVL if applicable, etc.).</p>" +
        "<p>🔐 <strong>Optional local access code</strong>: 4-6 digit PIN + Face ID / Touch ID / " +
        "Windows Hello (WebAuthn). Protection at app startup, ideal if you lend your phone.</p>" +
        "<p>🎤 <strong>Voice command</strong> <em>(v1.34+)</em>: floating mic button at the bottom-right " +
        "of map mode. Say \"<em>go to [POI]</em>\", \"<em>enable tracker</em>\", \"<em>emergency exit</em>\" " +
        "and the app executes. Uses the browser's native Web Speech API, <strong>no audio</strong> " +
        "leaves your device. Auto-stop after the command runs to save battery. iOS Safari " +
        "supported (with proper mic release on stop).</p>" +
        "<p>🪫 <strong>Haptic vibration</strong> <em>(v1.34.26+)</em>: toggle in Configuration. " +
        "Vibrates on 5 critical events (arrival at destination, emergency mode, etc.). Discreet, non-intrusive.</p>" +
        "<p>📋 <strong>Crash reports</strong>: if the app was killed by the OS (mobile OOM typically), " +
        "the report is archived in 📊 Memory inspector → Latest crashes section. Copyable to " +
        "send to the author via the contact page.</p>" +
        "<p>🔎 <strong>Home search bar</strong> <em>(v1.69.0)</em>: centered in the header, it searches " +
        "a point across <strong>all your plans</strong> without opening any — Enter or 🔎 to run " +
        "it.</p>" +
        "<p>📚 <strong>Built-in help</strong> (left sidebar → 📚): full documentation of each feature. " +
        "If you wonder \"how do I do X?\", that's where it is.</p>" +
        "<p><strong>Happy exploring! 🚀</strong></p>",
      hint: "You can replay this tutorial at any time via the 🎓 button at the top of the 📖 Documentation modal."
    }
  ];

  // 🆕 v1.44.6 — Libellés UI bilingues (header, boutons, aria). Même clé de
  // langue que la doc (myktamap_readme_lang).
  const UI_STRINGS = {
    fr: {
      headerTitle:  "🎓 Tutoriel — Premier lancement",
      skip:         "Passer le tutoriel",
      prev:         "◂ Précédent",
      next:         "Suivant ▸",
      finish:       "✓ Terminer",
      close:        "Fermer",
      langToggle:   "🇬🇧 English",
      langTitle:    "Switch to English",
      gotoCard:     "Aller à la carte "
    },
    en: {
      headerTitle:  "🎓 Tutorial — First launch",
      skip:         "Skip tutorial",
      prev:         "◂ Previous",
      next:         "Next ▸",
      finish:       "✓ Finish",
      close:        "Close",
      langToggle:   "🇫🇷 Français",
      langTitle:    "Passer en français",
      gotoCard:     "Go to card "
    }
  };

  // 🆕 v1.44.6 / v1.45.0 — Langue de l'onboarding. Clé LOCALE myktamap_readme_lang
  // (partagée avec la doc), DISTINCTE de la langue globale myktamap_app_lang.
  // Langues dispo = contenus traduits réellement présents (tableaux CARDS_*).
  // Ajouter une langue (ru…) = CARDS_RU + UI_STRINGS.ru + son code ici. Générique.
  const LANG_STORAGE_KEY = "myktamap_readme_lang";
  const ONBOARD_AVAILABLE_LANGS = ["fr", "en"];

  // Langue à présélectionner : choix manuel mémorisé s'il est dispo, sinon défaut
  // dérivé de la langue de l'app (I18n.resolveContentLang). On NE persiste PAS le
  // défaut → tant qu'aucun clic manuel, l'onboarding suit l'app (KARMA Q1:A).
  function _getLang() {
    try {
      const saved = localStorage.getItem(LANG_STORAGE_KEY);
      if (ONBOARD_AVAILABLE_LANGS.indexOf(saved) >= 0) return saved;
    } catch(e) {}
    if (window.I18n && typeof window.I18n.resolveContentLang === "function") {
      return window.I18n.resolveContentLang(ONBOARD_AVAILABLE_LANGS);
    }
    const navLang = (navigator.language || navigator.userLanguage || "").toLowerCase();
    const guess = navLang.split("-")[0];
    return (ONBOARD_AVAILABLE_LANGS.indexOf(guess) >= 0) ? guess : "fr";
  }
  function _setLang(lang) {
    if (ONBOARD_AVAILABLE_LANGS.indexOf(lang) < 0) return;
    try { localStorage.setItem(LANG_STORAGE_KEY, lang); } catch(e) {}
  }

  // Drapeau d'une langue (via I18n) + langue SUIVANTE dans le cycle (le toggle
  // unique cycle fr→en→…→fr ; avec 2 langues = simple bascule, mais générique N).
  function _langFlag(code) {
    const meta = (window.I18n && window.I18n.available)
      ? window.I18n.available().filter(function(l){ return l.code === code; })[0] : null;
    return meta ? meta.flag : code.toUpperCase();
  }
  function _nextLang() {
    const i = ONBOARD_AVAILABLE_LANGS.indexOf(_lang);
    return ONBOARD_AVAILABLE_LANGS[(i + 1) % ONBOARD_AVAILABLE_LANGS.length];
  }

  let _lang = _getLang();
  const _CARDS_BY_LANG = { fr: CARDS, en: CARDS_EN };
  function _cards() { return _CARDS_BY_LANG[_lang] || CARDS; }
  function _t(key)  { return (UI_STRINGS[_lang] || UI_STRINGS.fr)[key]; }

  let _currentIdx = 0;

  // ────────── HELPERS ──────────

  function isFirstLaunch() {
    // 🕵️ v1.31.9-fix1 — Skip onboarding en mode incognito. Cohérent avec
    // le pattern "no traces" : pas d'auto-trigger du tutoriel (l'user peut
    // toujours l'ouvrir manuellement via le menu Aide s'il veut). Sans ce
    // guard, le shim Storage retourne null → isFirstLaunch retourne true →
    // tutoriel s'affiche à CHAQUE boot incognito → bruit UX.
    if (window.IncognitoMode && window.IncognitoMode.active) return false;
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
      +     '<span class="kta-readme-modal-titre" id="kta-tutorial-titre">' + _t("headerTitle") + '</span>'
      // 🆕 v1.44.6 — Toggle langue 🇫🇷/🇬🇧 (même logique que la modale Documentation)
      +     '<button type="button" class="kta-btn kta-btn-ghost kta-tutorial-lang" id="kta-tutorial-lang" '
      +       'title="' + _t("langTitle") + '">' + _langFlag(_nextLang()) + '</button>'
      +     '<button type="button" class="kta-panneau-close" id="kta-tutorial-close" aria-label="' + _t("close") + '">✕</button>'
      +   '</div>'
      +   '<div class="kta-readme-modal-corps kta-tutorial-corps" id="kta-tutorial-corps">'
      +     '<!-- Card content dynamic -->'
      +   '</div>'
      +   '<div class="kta-tutorial-footer">'
      +     '<div class="kta-tutorial-progress" id="kta-tutorial-progress">'
      +       '<!-- Pastilles de progression dynamiques -->'
      +     '</div>'
      +     '<div class="kta-tutorial-actions">'
      +       '<button type="button" class="kta-btn kta-btn-ghost"   id="kta-tutorial-skip">' + _t("skip") + '</button>'
      +       '<button type="button" class="kta-btn kta-btn-ghost"   id="kta-tutorial-prev">' + _t("prev") + '</button>'
      +       '<button type="button" class="kta-btn kta-btn-primary" id="kta-tutorial-next">' + _t("next") + '</button>'
      +     '</div>'
      +   '</div>'
      + '</div>';
  }

  function _renderCard(idx) {
    const cards = _cards();
    const card  = cards[idx];
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
      for (let i = 0; i < cards.length; i++) {
        const isActive  = (i === idx);
        const cls = "kta-tutorial-dot" + (isActive ? " kta-tutorial-dot-active" : "");
        dots += '<button type="button" class="' + cls + '" data-card-idx="' + i + '" aria-label="' + _t("gotoCard") + (i + 1) + '"></button>';
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
    const lastIdx = _cards().length - 1;
    if (prevBtn) prevBtn.style.visibility = (_currentIdx === 0) ? "hidden" : "visible";
    if (nextBtn) {
      const isLast = (_currentIdx === lastIdx);
      nextBtn.textContent = isLast ? _t("finish") : _t("next");
    }
    if (skipBtn) {
      // Cacher "Passer" sur la dernière carte (= bouton Terminer suffit)
      skipBtn.style.visibility = (_currentIdx === lastIdx) ? "hidden" : "visible";
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
    if (_currentIdx < _cards().length - 1) {
      _currentIdx++;
      _renderCard(_currentIdx);
      _updateNavButtons();
    } else {
      // Dernière carte → Terminer
      _finish();
    }
  }

  // 🆕 v1.44.6 / v1.45.0 — Cycle vers la langue suivante en live (re-render
  // header + carte courante, persiste dans la clé locale). Avec 2 langues = une
  // bascule FR⇄EN ; générique N langues. On reste sur le même index de carte
  // (parité 1:1 entre tableaux CARDS_*, l'utilisateur ne perd pas sa place).
  function _toggleLang() {
    _lang = _nextLang();
    _setLang(_lang);
    // Re-render header (titre + libellés boutons)
    const titre = document.getElementById("kta-tutorial-titre");
    if (titre) titre.textContent = _t("headerTitle");
    const langBtn = document.getElementById("kta-tutorial-lang");
    if (langBtn) { langBtn.textContent = _langFlag(_nextLang()); langBtn.title = _t("langTitle"); }
    const skipBtn = document.getElementById("kta-tutorial-skip");
    if (skipBtn) skipBtn.textContent = _t("skip");
    const prevBtn = document.getElementById("kta-tutorial-prev");
    if (prevBtn) prevBtn.textContent = _t("prev");
    // Clamp l'index si la langue cible a moins de cartes (parité 1:1 garantie,
    // mais défensif si divergence future)
    if (_currentIdx > _cards().length - 1) _currentIdx = _cards().length - 1;
    _renderCard(_currentIdx);
    _updateNavButtons();
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

  // 🆕 v1.56.0 — Callback de fermeture (onClose) pour le séquenceur de premier
  // lancement (js/firstRunFlow.js). Appelé UNE FOIS à la fermeture du tutoriel
  // (✕ / Passer). Défini après le fermer() initial pour ne pas se déclencher à
  // tort à la ré-ouverture.
  let _tutorialOnClose = null;

  function ouvrir(onClose) {
    fermer();
    _tutorialOnClose = (typeof onClose === "function") ? onClose : null;
    _currentIdx = 0;
    // 🆕 v1.44.6 — Resync la langue depuis la clé partagée (l'user a pu la
    // changer dans la modale Documentation entre 2 ouvertures du tutoriel).
    _lang = _getLang();

    const overlay = document.createElement("div");
    overlay.id        = MODAL_ID;
    overlay.className = "kta-readme-modal-overlay";
    overlay.innerHTML = _buildModalHtml();
    document.documentElement.appendChild(overlay);

    // 🆕 v1.44.6 — Bind toggle langue
    const langBtn = document.getElementById("kta-tutorial-lang");
    if (langBtn) langBtn.addEventListener("click", _toggleLang);

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
    // 🆕 v1.56.0 — notifie le séquenceur (une seule fois)
    const cb = _tutorialOnClose;
    _tutorialOnClose = null;
    if (cb) { try { cb(); } catch(e) { console.warn("[Tutorial] onClose :", e); } }
  }

  // ────────── EXPORT ──────────
  window.Tutorial = {
    ouvrir:         ouvrir,
    fermer:         fermer,
    isFirstLaunch:  isFirstLaunch,
    markAsSeen:     markAsSeen,
    // Pour Memory Inspector / debug
    _LS_KEY:        LS_KEY,
    _CARDS_COUNT:   CARDS.length,
    _CARDS_COUNT_EN: CARDS_EN.length  // 🆕 v1.44.6 — parité 1:1 attendue avec CARDS
  };
})();
