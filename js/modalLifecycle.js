/*!
 * MyKTAMap (c) 2026 Flavien VIDAL (alias KARMA)
 * https://myktamap.fr — Licence CC BY-NC-SA 4.0
 * Usage commercial interdit sans accord ecrit prealable. Voir LICENSE.
 */

// =========================
// 🧰 ModalLifecycle — helper de cycle de vie pour modales
// =========================
// Sprint v1.44.0 — Refonte modales (audit V2 a confirmé 6 patterns récurrents).
//
// Cause racine du sprint v1.43.26/27 : chaque modale réinvente son open/close
// artisanal, sans tracking unifié des timers / listeners / blob URLs / boutons
// async. Résultat : memory leaks discrets, race conditions sur close pendant
// await, theming light cassé partout.
//
// Ce module fournit un helper opt-in qui s'attache à un overlay existant et
// tracke ses ressources jusqu'au close(). Pas de réécriture massive : chaque
// modale opt-in à son rythme. Modales non-migrées continuent de marcher.
//
// USAGE TYPIQUE :
// ---------------
//   function ouvrirMaModale() {
//     const overlay = document.createElement("div");
//     overlay.className = "kta-readme-modal-overlay";
//     overlay.innerHTML = "...";
//     document.documentElement.appendChild(overlay);
//
//     const lc = window.ModalLifecycle.attach(overlay, {
//       onClose: function() { console.log("modale fermée"); }
//     });
//
//     // Pattern A — Esc cleanup auto
//     lc.bindEscape(closeFn);
//
//     // Memory leak — listeners cleanup auto au close()
//     lc.on(document.getElementById("kta-mon-bouton"), "click", function() {
//       lc.close();
//     });
//
//     // Event delegation (pour les éléments dynamiques re-rendus via innerHTML)
//     lc.delegate(overlay, "click", "[data-action]", function(e) { ... });
//
//     // Pattern 1 — timers tracking auto
//     lc.setTimeout(function() { /* ne s'exécute pas si fermé */ }, 1800);
//
//     // Pattern C — guards async sans modale fermée
//     try {
//       const data = await lc.guard(fetchSomething());
//       if (!lc.alive) return;   // ou utiliser le throw du guard
//       updateUI(data);
//     } catch(e) {
//       if (e instanceof window.ModalLifecycle.ModalClosedError) return;
//       throw e;
//     }
//
//     // Pattern D — bouton async sans disabled
//     const btn = document.getElementById("kta-go");
//     lc.on(btn, "click", async function() {
//       const release = lc.lockButton(btn, { text: "⏳ Loading…" });
//       try { await doWork(); }
//       finally { release(); }
//     });
//
//     // Pattern 5 — blob URL auto-revoke
//     const url = lc.createObjectURL(myBlob);
//     img.src = url;
//
//     // Au close : tous timers cleared, tous listeners removed, tous blob
//     // URLs revoked, onClose handlers appelés. Idempotent : close() × N = OK.
//     function fermer() { lc.close(); overlay.remove(); }
//   }
//
// GARANTIES :
// -----------
// ✅ close() 100% idempotent
// ✅ Tous setTimeout/setInterval tracked → cleared au close
// ✅ Tous listeners tracked via .on() / .delegate() → removed au close
// ✅ Tous blob URLs créés via .createObjectURL() → revoked au close
// ✅ .alive = false dès que close() appelé OU overlay détaché du DOM
// ✅ Zéro dépendance, compatible vanilla JS sans framework
// =========================

(function() {
  "use strict";

  // Exception levée par .guard() si la modale a été fermée pendant l'await.
  // Les callers peuvent catch et silently ignorer (= comportement attendu).
  function ModalClosedError(msg) {
    this.name    = "ModalClosedError";
    this.message = msg || "Modal was closed during async operation";
  }
  ModalClosedError.prototype = Object.create(Error.prototype);
  ModalClosedError.prototype.constructor = ModalClosedError;

  /**
   * Attache un cycle de vie à un overlay existant.
   *
   * @param {HTMLElement} overlayEl  Élément racine de la modale
   * @param {Object}      [opts]     Options optionnelles
   * @param {Function}    [opts.onClose]  Callback custom appelé au close()
   * @param {string}      [opts.label]    Label debug (utilisé dans warnings console)
   * @return {Object}  Instance avec API ci-dessous
   */
  function attach(overlayEl, opts) {
    if (!overlayEl) {
      console.warn("[ModalLifecycle] attach() : overlayEl null/undefined");
      return null;
    }
    opts = opts || {};
    const label = opts.label || "ModalLifecycle";

    // État interne
    const _timers     = new Set();   // setTimeout IDs
    const _intervals  = new Set();   // setInterval IDs
    const _listeners  = [];          // [{ target, event, handler, opts }]
    const _blobUrls   = new Set();   // URL.createObjectURL() strings
    const _onCloseFns = [];          // callbacks personnalisés
    let   _closed     = false;

    if (typeof opts.onClose === "function") _onCloseFns.push(opts.onClose);

    const instance = {
      // ---- État ----
      get alive() {
        // Considéré vivant tant que close() pas appelé ET overlay encore dans DOM.
        // Le check isConnected protège contre le cas où l'user a fait
        // overlay.remove() sans appeler instance.close() (mauvaise pratique
        // mais on reste safe).
        return !_closed && overlayEl.isConnected;
      },
      get closed() { return _closed; },
      get el()     { return overlayEl; },

      // ---- Pattern A — Esc cleanup auto ----
      /**
       * Bind le listener keydown Escape sur document. Auto-removed au close().
       * @param {Function} closeFn  Fonction à appeler sur Escape. Défaut : instance.close()
       */
      bindEscape: function(closeFn) {
        const fn = function(e) {
          if (e.key === "Escape") {
            try { (closeFn || instance.close)(); } catch(err) {
              console.warn("[" + label + "] Esc handler failed :", err);
            }
          }
        };
        instance.on(document, "keydown", fn);
        return fn;
      },

      /**
       * Bind le click sur backdrop (e.target === overlayEl = clic en dehors
       * de la boîte modale). Auto-removed au close().
       */
      bindBackdropClick: function(closeFn) {
        instance.on(overlayEl, "click", function(e) {
          if (e.target === overlayEl) {
            try { (closeFn || instance.close)(); } catch(err) {
              console.warn("[" + label + "] Backdrop handler failed :", err);
            }
          }
        });
      },

      // ---- Pattern Memory leak — listeners cleanup auto ----
      /**
       * Wrapper sur addEventListener qui tracke pour auto-removal au close.
       * @param {EventTarget} target   document, élément DOM, window…
       * @param {string}      event    "click", "keydown", "change", etc.
       * @param {Function}    handler
       * @param {Object|bool} [opts]   Options addEventListener (passive, capture…)
       */
      on: function(target, event, handler, eventOpts) {
        if (_closed) {
          console.warn("[" + label + "] .on() called after close — ignored");
          return;
        }
        target.addEventListener(event, handler, eventOpts);
        _listeners.push({ target: target, event: event, handler: handler, opts: eventOpts });
      },

      /**
       * Event delegation propre. Le handler s'exécute seulement si e.target
       * matche le selector ET est dans scope. Idéal pour DOM dynamique
       * (innerHTML rebuild). Auto-removed au close().
       *
       * @param {HTMLElement} scope     Conteneur stable (jamais remplacé)
       * @param {string}      event     "click", "change", etc.
       * @param {string}      selector  CSS selector pour matcher e.target
       * @param {Function}    handler   Reçoit (event), this = élément matché
       */
      delegate: function(scope, event, selector, handler) {
        function delegated(e) {
          if (!e.target || !e.target.closest) return;
          const matched = e.target.closest(selector);
          if (matched && scope.contains(matched)) {
            try { handler.call(matched, e); } catch(err) {
              console.warn("[" + label + "] delegated handler failed :", err);
            }
          }
        }
        instance.on(scope, event, delegated);
        return delegated;
      },

      // ---- Pattern 1 — timers tracking auto ----
      /**
       * setTimeout tracked. Auto-cleared au close(). Skip aussi l'exécution
       * du callback si déjà fermé au moment du fire (race protection).
       */
      setTimeout: function(fn, delay) {
        if (_closed) return null;
        let id;
        id = setTimeout(function() {
          _timers.delete(id);
          if (!_closed) {
            try { fn(); } catch(err) {
              console.warn("[" + label + "] setTimeout handler failed :", err);
            }
          }
        }, delay);
        _timers.add(id);
        return id;
      },

      /**
       * setInterval tracked. Auto-cleared au close().
       */
      setInterval: function(fn, delay) {
        if (_closed) return null;
        const id = setInterval(function() {
          if (_closed) { clearInterval(id); return; }
          try { fn(); } catch(err) {
            console.warn("[" + label + "] setInterval handler failed :", err);
          }
        }, delay);
        _intervals.add(id);
        return id;
      },

      clearTimeout: function(id) {
        if (id == null) return;
        clearTimeout(id);
        _timers.delete(id);
      },

      clearInterval: function(id) {
        if (id == null) return;
        clearInterval(id);
        _intervals.delete(id);
      },

      // ---- Pattern C — guards async ----
      /**
       * Wrap une Promise pour throw ModalClosedError au .then() si la modale
       * a été fermée pendant l'await. Le caller peut catch et silently return.
       *
       *   try {
       *     const data = await lc.guard(fetchData());
       *     // si on arrive ici, la modale est encore vivante
       *     render(data);
       *   } catch(e) {
       *     if (e instanceof window.ModalLifecycle.ModalClosedError) return;
       *     throw e;  // autre erreur, propager
       *   }
       */
      guard: function(promise) {
        return Promise.resolve(promise).then(function(value) {
          if (!instance.alive) {
            throw new ModalClosedError("Modal closed during async op (" + label + ")");
          }
          return value;
        });
      },

      // ---- Pattern D — bouton async sans disabled ----
      /**
       * Disable un bouton + change son texte (optionnel). Retourne une
       * fonction release() à appeler en finally pour restaurer.
       *
       *   const release = lc.lockButton(btn, { text: "⏳ Loading…" });
       *   try { await work(); }
       *   finally { release(); }
       */
      lockButton: function(btn, lockOpts) {
        if (!btn) return function noop() {};
        lockOpts = lockOpts || {};
        const originalDisabled = btn.disabled;
        const originalText     = btn.textContent;
        btn.disabled = true;
        if (lockOpts.text) btn.textContent = lockOpts.text;
        let released = false;
        return function release(releaseOpts) {
          if (released) return;
          released = true;
          // Si modale fermée entre temps, le bouton est probablement détaché
          // du DOM → restore inutile mais inoffensif. Le try/catch protège.
          try {
            btn.disabled = originalDisabled;
            const restoreText = (releaseOpts && releaseOpts.text) || originalText;
            if (restoreText != null) btn.textContent = restoreText;
          } catch(_) {}
        };
      },

      // ---- Pattern 5 — blob URL auto-revoke ----
      /**
       * URL.createObjectURL tracked. Auto-revoked au close().
       */
      createObjectURL: function(blob) {
        const url = URL.createObjectURL(blob);
        _blobUrls.add(url);
        return url;
      },

      /**
       * Revoke explicite. Utile si on veut libérer avant le close() global
       * (ex : image temporaire dans un parcours utilisateur).
       */
      revokeObjectURL: function(url) {
        try { URL.revokeObjectURL(url); } catch(_) {}
        _blobUrls.delete(url);
      },

      // ---- Hooks de close ----
      /**
       * Ajoute un callback custom à exécuter au close(). Cumulable.
       */
      onClose: function(fn) {
        if (typeof fn === "function") _onCloseFns.push(fn);
      },

      // ---- Cleanup global ----
      /**
       * Idempotent : close() × N est sans effet supplémentaire.
       * Ordre des cleanups : timers/intervals → listeners → blob URLs → onClose handlers.
       */
      close: function() {
        if (_closed) return;
        _closed = true;

        // 1. Stop timers (pas de re-clear si déjà clear, c'est OK)
        _timers.forEach(function(id) {
          try { clearTimeout(id); } catch(_) {}
        });
        _timers.clear();

        // 2. Stop intervals
        _intervals.forEach(function(id) {
          try { clearInterval(id); } catch(_) {}
        });
        _intervals.clear();

        // 3. Remove listeners (try/catch chaque pour ne pas court-circuiter
        // les suivants si un removeEventListener throw — rare mais possible
        // sur target détaché)
        _listeners.forEach(function(l) {
          try { l.target.removeEventListener(l.event, l.handler, l.opts); } catch(_) {}
        });
        _listeners.length = 0;

        // 4. Revoke blob URLs
        _blobUrls.forEach(function(url) {
          try { URL.revokeObjectURL(url); } catch(_) {}
        });
        _blobUrls.clear();

        // 5. Run custom onClose handlers (try/catch chaque, ne pas court-circuiter)
        _onCloseFns.forEach(function(fn) {
          try { fn(); } catch(err) {
            console.warn("[" + label + "] onClose handler failed :", err);
          }
        });
        _onCloseFns.length = 0;
      },
    };

    return instance;
  }

  // Expose l'API publique
  window.ModalLifecycle = {
    attach:            attach,
    ModalClosedError:  ModalClosedError,
    // Helper utilitaire : crée un guard standalone pour un overlayEl sans
    // attacher de lifecycle complet (ex : un seul await ponctuel).
    isAlive: function(el) {
      return !!(el && el.isConnected);
    },
  };

  console.log("[ModalLifecycle] Module chargé (v1.44.0).");
})();
