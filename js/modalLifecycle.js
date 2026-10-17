/*!
 * MyKTAMap (c) 2026 Flavien VIDAL (alias KARMA)
 * https://myktamap.fr — Licence CC BY-NC-SA 4.0
 * Usage commercial interdit sans accord ecrit prealable. Voir LICENSE.
 */

// =========================
// ModalLifecycle — cycle de vie d'une modale (timers, listeners, blob URLs, async)
// =========================
// Helper opt-in attaché à un overlay existant : il suit ses ressources jusqu'au close(), contre les fuites
// mémoire discrètes et les courses sur un close pendant un await. Les modales non migrées marchent toujours.
//
// USAGE :
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
//     lc.bindEscape(closeFn);                                     // Échap, retiré au close
//     lc.on(document.getElementById("kta-mon-bouton"), "click", function() { lc.close(); });
//     lc.delegate(overlay, "click", "[data-action]", function(e) { ... });   // DOM re-rendu par innerHTML
//     lc.setTimeout(function() { /* ne s'exécute pas si fermé */ }, 1800);
//
//     try {                                                       // async : modale fermée pendant l'await
//       const data = await lc.guard(fetchSomething());
//       updateUI(data);
//     } catch(e) {
//       if (e instanceof window.ModalLifecycle.ModalClosedError) return;
//       throw e;
//     }
//
//     const btn = document.getElementById("kta-go");              // bouton async : pas de double clic
//     lc.on(btn, "click", async function() {
//       const release = lc.lockButton(btn, { text: "⏳ Loading…" });
//       try { await doWork(); }
//       finally { release(); }
//     });
//
//     img.src = lc.createObjectURL(myBlob);                       // révoquée au close
//
//     function fermer() { lc.close(); overlay.remove(); }
//   }
//
// ⚠️ GARANTIES : close() idempotent ; au close, timers et intervals annulés, listeners (.on / .delegate)
// retirés, blob URLs révoquées, onClose appelés ; `.alive` = false dès close() OU overlay détaché du DOM.
// Garde-fou (consultatif) : scripts/check-modal-lifecycle.js
// =========================

(function() {
  "use strict";

  // Levée par .guard() si la modale a été fermée pendant l'await ; l'appelant l'ignore.
  function ModalClosedError(msg) {
    this.name    = "ModalClosedError";
    this.message = msg || "Modal was closed during async operation";
  }
  ModalClosedError.prototype = Object.create(Error.prototype);
  ModalClosedError.prototype.constructor = ModalClosedError;

  /**
   * @param {HTMLElement} overlayEl  Racine de la modale
   * @param {Object}      [opts]     { onClose?: Function, label?: string (debug) }
   * @return {Object}  Instance (API ci-dessous)
   */
  function attach(overlayEl, opts) {
    if (!overlayEl) {
      console.warn("[ModalLifecycle] attach() : overlayEl null/undefined");
      return null;
    }
    opts = opts || {};
    const label = opts.label || "ModalLifecycle";

    const _timers     = new Set();   // setTimeout IDs
    const _intervals  = new Set();   // setInterval IDs
    const _listeners  = [];          // [{ target, event, handler, opts }]
    const _blobUrls   = new Set();   // URL.createObjectURL() strings
    const _onCloseFns = [];          // callbacks personnalisés
    let   _closed     = false;

    if (typeof opts.onClose === "function") _onCloseFns.push(opts.onClose);

    const instance = {
      get alive() {
        // Vivant tant que close() n'est pas appelé ET que l'overlay est dans le DOM (overlay.remove() sans
        // close() reste sûr).
        return !_closed && overlayEl.isConnected;
      },
      get closed() { return _closed; },
      get el()     { return overlayEl; },

      /** Échap sur document ; closeFn par défaut : instance.close(). Retiré au close(). */
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

      /** Clic sur le fond (e.target === overlayEl). Retiré au close(). */
      bindBackdropClick: function(closeFn) {
        instance.on(overlayEl, "click", function(e) {
          if (e.target === overlayEl) {
            try { (closeFn || instance.close)(); } catch(err) {
              console.warn("[" + label + "] Backdrop handler failed :", err);
            }
          }
        });
      },

      /**
       * addEventListener suivi, retiré au close().
       * @param {EventTarget} target · {string} event · {Function} handler · {Object|bool} [eventOpts]
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
       * Délégation : handler appelé si e.target matche `selector` dans `scope` (conteneur stable, jamais
       * remplacé) ; this = élément matché. Retiré au close().
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

      /** setTimeout suivi, annulé au close() ; le callback est aussi sauté s'il part après fermeture. */
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

      /** setInterval suivi, annulé au close(). */
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

      /** Promise qui rejette en ModalClosedError si la modale a été fermée pendant l'await. */
      guard: function(promise) {
        return Promise.resolve(promise).then(function(value) {
          if (!instance.alive) {
            throw new ModalClosedError("Modal closed during async op (" + label + ")");
          }
          return value;
        });
      },

      /** Désactive un bouton (texte optionnel) ; rend release() à appeler en finally. */
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
          // Bouton peut-être détaché si la modale a fermé : restauration inoffensive, sous try/catch.
          try {
            btn.disabled = originalDisabled;
            const restoreText = (releaseOpts && releaseOpts.text) || originalText;
            if (restoreText != null) btn.textContent = restoreText;
          } catch(_) {}
        };
      },

      /** URL.createObjectURL suivie, révoquée au close(). */
      createObjectURL: function(blob) {
        const url = URL.createObjectURL(blob);
        _blobUrls.add(url);
        return url;
      },

      /** Révocation anticipée (avant le close() global). */
      revokeObjectURL: function(url) {
        try { URL.revokeObjectURL(url); } catch(_) {}
        _blobUrls.delete(url);
      },

      /** Callback de fermeture supplémentaire (cumulable). */
      onClose: function(fn) {
        if (typeof fn === "function") _onCloseFns.push(fn);
      },

      /** Idempotent. Ordre : timers/intervals → listeners → blob URLs → onClose. */
      close: function() {
        if (_closed) return;
        _closed = true;

        _timers.forEach(function(id) {
          try { clearTimeout(id); } catch(_) {}
        });
        _timers.clear();

        _intervals.forEach(function(id) {
          try { clearInterval(id); } catch(_) {}
        });
        _intervals.clear();

        // try/catch par listener : un removeEventListener qui lève (cible détachée) ne bloque pas les suivants.
        _listeners.forEach(function(l) {
          try { l.target.removeEventListener(l.event, l.handler, l.opts); } catch(_) {}
        });
        _listeners.length = 0;

        _blobUrls.forEach(function(url) {
          try { URL.revokeObjectURL(url); } catch(_) {}
        });
        _blobUrls.clear();

        // try/catch par handler : un handler en erreur ne bloque pas les suivants.
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

  window.ModalLifecycle = {
    attach:            attach,
    ModalClosedError:  ModalClosedError,
    // Garde ponctuelle pour un overlay sans cycle de vie complet (un seul await).
    isAlive: function(el) {
      return !!(el && el.isConnected);
    },
  };

  console.log("[ModalLifecycle] Module chargé (v1.44.0).");
})();
