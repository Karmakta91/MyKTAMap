/*!
 * MyKTAMap (c) 2026 Flavien VIDAL (alias KARMA)
 * https://myktamap.fr — Licence CC BY-NC-SA 4.0
 * Usage commercial interdit sans accord ecrit prealable. Voir LICENSE.
 */
// Pied des pages d'audit (NETWORK_AUDIT.html, NETWORK_AUDIT_HISTORIQUE.html) : mention de licence community ou pro.
// Les pages sont statiques, ouvertes hors de l'app : js/proLicense.js n'y est pas chargé, on refait le minimum.
// Sorti de la page le 07/10/2026 pour la CSP stricte (script-src sans 'unsafe-inline').
(function() {
  "use strict";
  // Lecture cache localStorage synchrone (évite flash)
  try {
    var raw = localStorage.getItem("__mktm_pro_license__");
    if (raw) {
      var data = JSON.parse(raw);
      if (data && data.instance === "pro") {
        document.documentElement.classList.add("kta-instance-pro");
      }
    }
  } catch(e) {}
  // Fetch async pour confirmer
  if (typeof fetch === "function") {
    fetch("/Licence-pro.json?_=" + Date.now(), {
      cache: "no-store",
      credentials: "omit"
    })
      .then(function(r) { return r.ok ? r.json() : null; })
      .then(function(data) {
        if (data && data.instance === "pro") {
          document.documentElement.classList.add("kta-instance-pro");
        } else {
          document.documentElement.classList.remove("kta-instance-pro");
        }
      })
      .catch(function() { /* offline ou erreur : on garde le cache */ });
  }
})();
