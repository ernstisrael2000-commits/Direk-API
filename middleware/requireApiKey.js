const bcrypt = require('bcrypt');
const supabase = require('../lib/supabase');

/**
 * Middleware — authentification par clé API (header X-API-Key: dk_live_...)
 * Utilisé uniquement pour l'endpoint POST /api/v1/recharge (appels externes).
 */
async function requireApiKey(req, res, next) {
  if (!supabase) {
    return res.status(503).json({ ok: false, error: 'Base de données non configurée.' });
  }

  const rawKey = req.headers['x-api-key'];
  if (!rawKey || !rawKey.startsWith('dk_live_')) {
    return res.status(401).json({ ok: false, error: 'Clé API manquante ou invalide.' });
  }

  // Récupérer tous les resellers actifs pour comparer les hashes
  // Optimisation : en production, stocker aussi les 8 premiers chars du hash pour pré-filtrer
  const { data: resellers, error } = await supabase
    .from('resellers')
    .select('id, nom, email, api_key_hash, balance, status')
    .eq('status', 'actif');

  if (error) {
    console.error('[requireApiKey] Erreur Supabase:', error.message);
    return res.status(500).json({ ok: false, error: 'Erreur interne.' });
  }

  for (const reseller of resellers) {
    const match = await bcrypt.compare(rawKey, reseller.api_key_hash);
    if (match) {
      req.reseller = reseller;
      return next();
    }
  }

  return res.status(401).json({ ok: false, error: 'Clé API invalide ou compte suspendu.' });
}

module.exports = requireApiKey;
