#!/usr/bin/env node
/* eslint-disable no-console */
// =====================================================================
// check-lexique-icones.js — garde-fou pré-commit BLOQUANT (rejoué en CI) : lexique des icônes de l'Aide IA
// =====================================================================
// docs/applications/AI_CONTEXT.md cite les boutons par leur emoji, alors que l'app les dessine en icônes au trait
// (js/ktaIcones.js). Une IA qui lit le fichier écrirait l'emoji comme s'il était à l'écran : un lexique en tête du
// fichier donne, pour chaque emoji de bouton cité, le nom du bouton et le dessin de son icône.
// Le lexique se GÉNÈRE : chaque emploi classé « bouton » par KtaIcones.classerDoc (champ `icone` non nul) donne
// une paire emoji → icône ; LEXIQUE ci-dessous lui donne un nom et un dessin, écrits une fois, en français.
// Contrôle : (1) chaque paire citée hors du lexique a son entrée dans LEXIQUE ; (2) la section entre les marques
// `kta:lexique-icones` est exactement celle que ce script produit (une citation ajoutée ou retirée = lexique à
// régénérer). Régénérer : node scripts/check-lexique-icones.js --ecrire
// ⚠️ contrat : les marques restent des commentaires HTML (l'app les retire avant l'affichage) et la section reste
//   avant le premier marqueur de profil (commune à tous les profils).
// =====================================================================

const fs = require("fs");
const path = require("path");

const RACINE = path.resolve(__dirname, "..");
const FICHIER = path.join(RACINE, "docs", "applications", "AI_CONTEXT.md");
const KtaIcones = require(path.join(RACINE, "js", "ktaIcones.js"));

const DEBUT = "<!-- kta:lexique-icones:debut — généré par scripts/check-lexique-icones.js --ecrire -->";
const FIN = "<!-- kta:lexique-icones:fin -->";
// Le lexique se pose juste après cette ligne (bandeau « Document généré… ») quand il n'existe pas encore.
const ANCRE = "> Document généré le **{{DATE}}**";

// Dessin de chaque icône (nom Lucide ou « m-… »), en quelques mots.
const DESSINS = {
  "ambulance": "ambulance", "battery": "pile", "bell": "cloche", "book-open": "livre ouvert",
  "bot": "tête de robot", "box": "cube", "camera": "appareil photo", "chart-column": "histogramme",
  "check": "coche", "circle-help": "point d'interrogation dans un cercle", "clapperboard": "clap de cinéma",
  "cloud": "nuage", "cloud-download": "nuage et flèche vers le bas", "cloud-fog": "nuage et brume",
  "code-xml": "chevrons de code", "compass": "boussole", "database": "pile de disques",
  "drafting-compass": "compas de dessin", "eraser": "gomme", "file-text": "page de texte",
  "flame": "flamme", "flashlight": "lampe torche", "folder-input": "dossier et flèche entrante",
  "folder-open": "dossier ouvert", "footprints": "empreintes de pas", "gauge": "jauge à aiguille",
  "globe": "globe", "graduation-cap": "toque de diplômé", "grid-2x2": "grille de quatre carrés",
  "hard-drive": "disque dur", "history": "horloge et flèche de retour", "house": "maison", "image": "image encadrée",
  "key-round": "clé", "keyboard": "clavier", "library": "livres rangés", "life-buoy": "bouée", "link": "maillons de chaîne",
  "list": "liste à puces", "locate-fixed": "viseur", "lock-open": "cadenas ouvert", "m-echelle": "échelle",
  "m-galerie": "deux lignes ondulées", "m-niveaux": "deux étages décalés", "m-pilier": "pilier en blocs",
  "m-zone": "carré hachuré", "magnet": "aimant", "map": "carte pliée", "map-pin": "épingle de carte",
  "map-pin-check": "épingle de carte cochée", "maximize": "quatre coins d'agrandissement", "megaphone": "mégaphone",
  "monitor-cog": "écran et roue dentée", "move": "croix de flèches", "navigation": "flèche de navigation",
  "notebook-pen": "carnet et stylo", "package-plus": "carton et signe plus", "palette": "palette de peintre",
  "panels-top-left": "fenêtre à panneaux", "pencil": "crayon", "pickaxe": "pioche", "play": "triangle de lecture",
  "plus": "signe plus", "pocket-knife": "couteau de poche", "puzzle": "pièce de puzzle", "radio": "ondes radio",
  "redo-2": "flèche vers l'avant", "refresh-cw": "deux flèches en cercle", "repeat": "flèches en boucle",
  "rocket": "fusée", "rotate-ccw": "flèche qui tourne à gauche", "rotate-cw": "flèche qui tourne à droite",
  "route": "chemin entre deux points", "ruler": "règle", "satellite": "satellite", "save": "disquette",
  "scroll": "parchemin", "search": "loupe", "settings": "roue dentée", "shield": "bouclier",
  "signpost": "panneau indicateur", "sigma": "sigma (somme)", "siren": "gyrophare", "square": "carré vide",
  "square-check": "case cochée", "square-dashed": "carré en pointillé", "star": "étoile", "table": "tableau",
  "telescope": "télescope", "trash-2": "corbeille", "trophy": "trophée", "undo-2": "flèche de retour",
  "unplug": "prise débranchée", "user": "silhouette", "users": "deux silhouettes", "venetian-mask": "masque",
  "vibrate": "téléphone qui vibre", "volume-2": "haut-parleur", "waypoints": "points reliés", "wrench": "clé plate",
  "zoom-in": "loupe et signe plus",
};

// Nom du bouton, par paire « emoji icône » (emoji sans U+FE0F) : un même emoji désigne parfois deux boutons.
const NOMS = {
  "⚙ settings": "Réglages / Configuration", "📍 map-pin-check": "Je suis ici", "✏ pencil": "Édition",
  "⬛ m-zone": "Zones", "🧭 navigation": "Tracker", "📐 ruler": "Mesure", "⛑ life-buoy": "Je suis perdu",
  "🏗 drafting-compass": "Générateur", "⏪ undo-2": "Annuler", "🏛 m-pilier": "Structures", "🛣 m-galerie": "Tracés",
  "🔄 refresh-cw": "Convertir / Mettre à jour", "🔆 maximize": "Affichage XL", "⬆ save": "Enregistrer / Exporter",
  "☁ database": "Plan d'une installation reliée", "🚀 rocket": "Performance", "🚑 ambulance": "Mode Secours",
  "📖 book-open": "Documentation", "❓ circle-help": "Aide", "⛏ pickaxe": "Volume exploité / Hauteur",
  "📏 sigma": "Distance totale", "♦ square-dashed": "Surface", "📔 notebook-pen": "Mon carnet",
  "👤 user": "Profil / rôle", "🧰 pocket-knife": "Outils", "🗺 list": "Légende", "🤖 bot": "Aide IA",
  "🔍 search": "Rechercher", "⭐ star": "Favori", "🚨 siren": "Sortie d'urgence / Alertes", "🧹 eraser": "Effacer",
  "💥 trash-2": "Tout réinitialiser", "📚 library": "Mes plans", "🧱 grid-2x2": "Convertir en V2 tuilé",
  "🪧 signpost": "Guidage / Feuille de route", "🌫 cloud-fog": "Niveaux en transparence", "🧭 route": "Y aller",
  "🌀 waypoints": "Liaisons entre plans", "🗺 map": "Vue OSM / Plan", "✏ square-dashed": "Effacer par zone",
  "🧭 compass": "Boussole", "📖 file-text": "Récits", "🧊 box": "Vue 3D", "🎬 clapperboard": "Replay",
  "🧩 puzzle": "Fonctionnalités optionnelles", "📸 camera": "Mes photos", "🔐 key-round": "Code d'accès",
  "🛠 code-xml": "Mode Développeur", "📊 table": "Éditeur de données", "📌 move": "Repositionner",
  "⏹ square": "Terminer / Arrêter", "📖 scroll": "Mode Histoire", "🔎 search": "Recherche multi-plans",
  "🔧 wrench": "Dépannage", "🔔 bell": "Notifications", "🗺 route": "Itinéraire", "🎨 palette": "Affichage",
  "🔦 flashlight": "Faisceau / Lumière", "🧭 signpost": "Suivre mon parcours", "📦 package-plus": "Ajouter un plan",
  "🔋 battery": "Niveau de batterie", "🏠 house": "Réglés depuis l'accueil", "🌍 map": "Vue OSM",
  "📊 chart-column": "Statistiques", "➕ plus": "Ajouter", "⬇ folder-open": "Charger / Import",
  "🌍 globe": "Export KMZ / plans géoréférencés", "💾 hard-drive": "Mémoriser le plan dans l'app",
  "📦 folder-input": "Importer plusieurs plans", "🪟 panels-top-left": "Ancrer les panneaux d'outils",
  "🔊 volume-2": "Lire la note", "🔥 flame": "Heatmap", "📳 vibrate": "Vibrations",
  "🔧 unplug": "Outil Kill SW", "🗑 trash-2": "Supprimer", "🎓 graduation-cap": "Visite guidée",
  "🎯 locate-fixed": "Ma position", "🔓 lock-open": "Suspendre le verrou", "👣 footprints": "Détection des pas",
  "⌨ keyboard": "Raccourcis clavier", "🏆 trophy": "Hauts faits", "🖼 image": "Export image",
  "🔭 telescope": "Portée", "🔃 rotate-cw": "Plan orienté", "📢 megaphone": "Rappel général",
  "📌 link": "Lier une photo au point", "♻ rotate-ccw": "Recréer le point", "📉 m-niveaux": "Niveaux",
  "🔧 gauge": "État du cache", "🔁 repeat": "Recaler sur un autre scan", "🧲 magnet": "Magnétisme",
  "📡 radio": "Partager ma position", "💾 save": "Exporter la session", "🌐 cloud": "Plans du site",
  "📊 gauge": "État mémoire", "☑ square-check": "Sélectionner", "📍 map-pin": "Points",
  "➕ zoom-in": "Boutons de zoom", "📍 navigation": "Navigation & tracker", "🛰 satellite": "Capteurs",
  "🌐 globe": "Géoréférencement GPS", "🕵 venetian-mask": "Mode incognito", "🔒 shield": "Confidentialité",
  "▶ play": "Reprendre", "🛠 monitor-cog": "Système & maintenance", "📥 cloud-download": "Hors ligne",
  "✅ check": "Valider", "🏗 m-niveaux": "Niveau d'un lot", "🪜 m-echelle": "Jonction", "⏪ history": "Historique",
  "⏩ redo-2": "Rétablir", "🚨 users": "Équipe",
};

const sansVs = (s) => s.replace(/️/g, "");

// Texte du fichier sans sa section de lexique (elle cite elle-même les emoji).
function horsLexique(t) {
  const a = t.indexOf(DEBUT), b = t.indexOf(FIN);
  if (a < 0 || b < a) return t;
  return t.slice(0, a) + t.slice(b + FIN.length);
}

// → { lignes: [texte], manquants: ["emoji icône"] }
function construire(t) {
  const corps = horsLexique(t);
  const vus = new Map();
  for (const o of KtaIcones.classerDoc(corps)) {
    if (!o.icone) continue;
    const cle = sansVs(o.emoji) + " " + o.icone;
    if (!vus.has(cle)) vus.set(cle, { brut: corps.slice(o.debut, o.fin), icone: o.icone, cle: cle });
  }
  const manquants = [], entrees = [];
  for (const v of vus.values()) {
    const nom = NOMS[v.cle], dessin = DESSINS[v.icone];
    if (!nom || !dessin) { manquants.push(v.cle); continue; }
    entrees.push({ nom: nom, ligne: "- " + v.brut + " **" + nom + "** : " + dessin });
  }
  entrees.sort((x, y) => x.nom.localeCompare(y.nom, "fr") || x.ligne.localeCompare(y.ligne, "fr"));
  return { lignes: entrees.map((e) => e.ligne), manquants: manquants };
}

function section(lignes) {
  return [
    DEBUT,
    "## Lexique des icônes",
    "",
    "> **Consigne pour l'IA** : dans l'app, ces boutons sont des icônes au trait, pas des emoji : cite le bouton " +
      "par son **nom**, puis décris son dessin ; n'écris pas l'emoji comme s'il était à l'écran. Dans ce document, " +
      "l'emoji qui précède un nom de bouton n'est qu'un repère vers la ligne ci-dessous.",
    "",
  ].concat(lignes, ["", FIN]).join("\n");
}

function main() {
  const ecrire = process.argv.includes("--ecrire");
  const brut = fs.readFileSync(FICHIER, "utf8");
  const crlf = brut.includes("\r\n");
  const t = brut.replace(/\r\n/g, "\n");
  const { lignes, manquants } = construire(t);
  if (manquants.length) {
    console.error("❌ [lexique-icones] emoji de bouton cité dans AI_CONTEXT.md sans nom ni dessin "
      + "(scripts/check-lexique-icones.js > NOMS / DESSINS) :");
    manquants.forEach((m) => console.error("   " + m));
    process.exit(1);
  }
  const voulu = section(lignes);
  const a = t.indexOf(DEBUT), b = t.indexOf(FIN);
  const actuel = a >= 0 && b > a ? t.slice(a, b + FIN.length) : null;
  if (actuel === voulu) {
    console.log("✅ [lexique-icones] " + lignes.length + " bouton(s) cité(s), lexique à jour.");
    return;
  }
  if (!ecrire) {
    console.error("❌ [lexique-icones] le lexique en tête de docs/applications/AI_CONTEXT.md n'est pas à jour "
      + (actuel ? "(citations ajoutées, retirées ou lexique modifié à la main)" : "(section absente)")
      + ". Régénérer : node scripts/check-lexique-icones.js --ecrire");
    process.exit(1);
  }
  let neuf;
  if (actuel) neuf = t.slice(0, a) + voulu + t.slice(b + FIN.length);
  else {
    const i = t.indexOf(ANCRE);
    if (i < 0) { console.error("❌ [lexique-icones] ancre du bandeau introuvable : " + ANCRE); process.exit(1); }
    const fl = t.indexOf("\n", i);
    neuf = t.slice(0, fl + 1) + "\n" + voulu + "\n" + t.slice(fl + 1);
  }
  fs.writeFileSync(FICHIER, crlf ? neuf.replace(/\n/g, "\r\n") : neuf);
  console.log("✍️  [lexique-icones] lexique écrit : " + lignes.length + " bouton(s).");
}

if (require.main === module) main();
module.exports = { construire, section, DEBUT, FIN };
