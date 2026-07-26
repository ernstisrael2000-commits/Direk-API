/**
 * lib/loginAttempts.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Protection brute-force en mémoire pour les tentatives de connexion.
 *
 * OWASP A07 : Authentication Failures — limiter et bloquer les tentatives.
 *
 * Stratégie double-clé :
 *   - Par IP  : bloque un attaquant qui essaie plusieurs comptes
 *   - Par email : bloque un attaquant qui change d'IP (proxy rotation)
 *
 * Note : en multi-instance, utiliser Redis à la place.
 * Pour une instance unique (Replit), l'in-memory est suffisant.
 */

'use strict';

const MAX_ATTEMPTS   = 5;    // tentatives avant blocage
const LOCKOUT_MS     = 15 * 60 * 1000;  // 15 minutes de blocage
const WINDOW_MS      = 15 * 60 * 1000;  // fenêtre de comptage

// Map<clé, { count, firstAttempt, lockedUntil }>
const store = new Map();

/**
 * Génère les deux clés de suivi pour une tentative.
 */
function keys(ip, email) {
  return [`ip:${ip}`, `email:${email.toLowerCase().trim()}`];
}

/**
 * Enregistre une tentative échouée.
 * @returns {{ blocked: boolean, remainingMs: number }} — si bloqué, combien de temps reste-t-il
 */
function recordFailure(ip, email) {
  const now = Date.now();
  for (const key of keys(ip, email)) {
    let entry = store.get(key);
    if (!entry || now - entry.firstAttempt > WINDOW_MS) {
      entry = { count: 0, firstAttempt: now, lockedUntil: 0 };
    }
    entry.count += 1;
    if (entry.count >= MAX_ATTEMPTS) {
      entry.lockedUntil = now + LOCKOUT_MS;
    }
    store.set(key, entry);
  }
  return checkBlocked(ip, email);
}

/**
 * Vérifie si l'IP ou l'email est actuellement bloqué.
 * @returns {{ blocked: boolean, remainingMs: number }}
 */
function checkBlocked(ip, email) {
  const now = Date.now();
  let maxRemaining = 0;
  for (const key of keys(ip, email)) {
    const entry = store.get(key);
    if (!entry) continue;
    if (entry.lockedUntil > now) {
      maxRemaining = Math.max(maxRemaining, entry.lockedUntil - now);
    }
  }
  return { blocked: maxRemaining > 0, remainingMs: maxRemaining };
}

/**
 * Réinitialise les compteurs après une connexion réussie.
 */
function resetAttempts(ip, email) {
  for (const key of keys(ip, email)) {
    store.delete(key);
  }
}

/**
 * Nettoyage périodique pour éviter les fuites mémoire.
 * Lance un timer toutes les 30 minutes.
 */
function startCleanup() {
  setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of store.entries()) {
      // Supprimer les entrées expirées (fenêtre dépassée ET lockout terminé)
      if (now - entry.firstAttempt > WINDOW_MS && entry.lockedUntil < now) {
        store.delete(key);
      }
    }
  }, 30 * 60 * 1000).unref(); // .unref() ne bloque pas l'arrêt du process
}

startCleanup();

module.exports = { recordFailure, checkBlocked, resetAttempts };
