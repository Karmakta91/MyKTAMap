// Harness "surface d'API" : CHARGE reellement les modules IIFE et verifie que
// chaque methode annoncee existe.
//
// Pourquoi : `node -c` ne valide QUE la syntaxe. Un `WALLPAPER_MAX_PX` supprime
// mais encore reference dans le bloc d'exports passe `node -c` sans broncher et
// casse au chargement dans le navigateur (ReferenceError). C'est exactement le
// bug remonte par KARMA le 01/08 -- et le meme patch rate avait aussi fait
// SAUTER setWallpaperCadrage des exports, sans aucun signal.
const fs = require("fs");
const vm = require("vm");

let ko = 0;
const t = (n, c) => { console.log((c ? "✅" : "❌") + " " + n); if (!c) ko++; };

function charger(fichier, nomGlobal) {
  const win = {
    console: { log(){}, warn(){}, error(){} },
    indexedDB: { open() { return { onupgradeneeded: null, onsuccess: null, onerror: null }; } },
    I18n: { t: k => k, has: () => false },
    document: { createElement: () => ({ getContext: () => ({ drawImage(){} }), toBlob(){} }) },
    URL: { createObjectURL: () => "blob:x", revokeObjectURL(){} },
    Image: function(){},
    navigator: {}
  };
  win.window = win;
  const ctx = vm.createContext(win);
  try {
    vm.runInContext("var window = this; var document = this.document; var indexedDB = this.indexedDB;"
                    + fs.readFileSync(fichier, "utf8"), ctx);
  } catch (e) {
    t(fichier + " se charge sans erreur", false);
    console.log("   ↳ " + e.name + " : " + e.message);
    return null;
  }
  t(fichier + " se charge sans erreur", true);
  return win[nomGlobal];
}

// ───────── userProfile.js ─────────
const UP = charger("js/userProfile.js", "UserProfile");
if (UP) {
  const ATTENDU = [
    "init", "get", "getPhotoBlob", "getPhotoObjectUrl", "setSurnom", "setPhoto",
    "removePhoto", "clear", "onChange", "getInitial", "getAvatarColor",
    // 🖼️ v1.74.0 — fond d'ecran
    "setWallpaper", "removeWallpaper", "getWallpaperBlob", "getWallpaperObjectUrl",
    "setWallpaperVoile", "setWallpaperCadrage", "setWallpaperFit"
  ];
  ATTENDU.forEach(function(m) {
    t("UserProfile." + m + "() exposee", typeof UP[m] === "function");
  });
  ["PALETTE", "DB_NAME", "WALLPAPER_MAX_SHORT", "WALLPAPER_MAX_LONG"].forEach(function(c) {
    t("UserProfile." + c + " exposee", UP[c] !== undefined);
  });

  // L'etat par defaut doit porter les champs du fond d'ecran, sinon l'UI lit
  // `undefined` et les curseurs partent a la mauvaise valeur.
  const snap = UP.get();
  ["hasWallpaper", "wallVoile", "wallPosX", "wallPosY", "wallFit"].forEach(function(k) {
    t("get() expose " + k, Object.prototype.hasOwnProperty.call(snap, k));
  });
  t("voile par defaut = 55", snap.wallVoile === 55);
  t("cadrage par defaut centre", snap.wallPosX === 50 && snap.wallPosY === 50);
}

console.log(ko === 0 ? "\n🎉 tout passe" : "\n⚠️ " + ko + " echec(s)");
process.exit(ko === 0 ? 0 : 1);
