/**
 * middleware/requireApiKey.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Authentification par clé API (header X-API-Key: dk_live_…).
 *
 * Sécurité :
 *   - Lookup O(1) : on filtre en DB par `api_key_prefix` (12 premiers chars
 *     hex après "dk_live_"), puis on ne fait qu'un seul bcrypt.compare.
 *     L'ancienne approche itérait TOUS les comptes → O(n) bcrypt = DoS + timing.
 *   - Le préfixe stocké en clair n'expose rien de sensible : 12 hex = 6 octets
 *     sur 32 octets totaux, le reste est protégé par le hash bcrypt.
 *   - Message d'erreur neutre (OWASP A07).
 *   - Toutes les tentatives sont loguées (OWASP A09).
 */

'use strict';

const bcrypt   = require('bcrypt');
const supabase = require('../lib/supabase');

async function requireApiKey(req, res, next) {
  if (!supabase) {
    return res.status(503).json({ ok: false, error: 'Base de données non configurée.' });
  }

  const rawKey = req.headers['x-api-key'];

  // ── 1. Vérification du format ──────────────────────────────────────────────
  // Format attendu : "dk_live_" suivi de 64 hex chars (32 octets en hex).
  if (
    typeof rawKey !== 'string' ||
    !rawKey.startsWith('dk_live_') ||
    !/^dk_live_[0-9a-f]{64}$/.test(rawKey)
  ) {
    console.warn('[requireApiKey] Format de clé invalide — ip:', req.ip);
    return res.status(401).json({ ok: false, error: 'Clé API manquante ou invalide.' });
  }

  // ── 2. Extraction du préfixe de lookup ────────────────────────────────────
  // Les 12 premiers caractères hex après "dk_live_" (= 6 octets aléatoires).
  // Assez spécifique pour ne ramener qu'un seul enregistrement (collision
  // quasi-impossible avec 2^48 valeurs possibles par préfixe).
  const prefix = rawKey.slice(8, 20); // chars 8..19

  // ── 3. Lookup ciblé par préfixe (O(1) après migration v3) ───────────────
  // Stratégie de compatibilité :
  //   a) D'abord, cherche les comptes ayant ce préfixe (comptes créés après v3)
  //   b) Si aucun résultat, fallback sur les comptes sans préfixe (comptes v1/v2
  //      qui n'ont pas encore régénéré leur clé). Ce fallback disparaîtra
  //      naturellement quand tous les comptes auront un préfixe.
  let resellers = [];

  const { data: byPrefix, error: errPrefix } = await supabase
    .from('resellers')
    .select('id, nom, email, api_key_hash, api_key_prefix, balance, status')
    .eq('api_key_prefix', prefix)
    .eq('status', 'actif');

  if (errPrefix) {
    console.error('[requireApiKey] Erreur Supabase (lookup prefix):', errPrefix.message);
    return res.status(500).json({ ok: false, error: 'Erreur interne.' });
  }

  if (byPrefix && byPrefix.length > 0) {
    resellers = byPrefix;
  } else {
    // Fallback : comptes sans préfixe (avant migration v3)
    const { data: legacy, error: errLegacy } = await supabase
      .from('resellers')
      .select('id, nom, email, api_key_hash, api_key_prefix, balance, status')
      .is('api_key_prefix', null)
      .eq('status', 'actif');

    if (errLegacy) {
      console.error('[requireApiKey] Erreur Supabase (lookup legacy):', errLegacy.message);
      return res.status(500).json({ ok: false, error: 'Erreur interne.' });
    }
    resellers = legacy || [];
  }

  // ── 4. Comparaison bcrypt ─────────────────────────────────────────────────
  for (const reseller of resellers) {
    const match = await bcrypt.compare(rawKey, reseller.api_key_hash);
    if (match) {
      req.reseller = reseller;
      return next();
    }
  }

  // ── 5. Clé non trouvée ou hash non correspondant ──────────────────────────
  console.warn(`[requireApiKey] Clé invalide — prefix=${prefix} ip=${req.ip}`);
  return res.status(401).json({ ok: false, error: 'Clé API invalide ou compte suspendu.' });
}

module.exports = requireApiKey;
