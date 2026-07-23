const express = require('express');
const supabase = require('../lib/supabase');
const requireAuth = require('../middleware/requireAuth');

const router = express.Router();

// ─── GET /api/v1/products ─────────────────────────────────────────────────────
// Retourne uniquement les produits actifs (visible par les resellers connectés)
router.get('/', requireAuth, async (req, res) => {
  if (!supabase) return res.status(503).json({ ok: false, error: 'Base de données non configurée.' });

  const { data, error } = await supabase
    .from('produits')
    .select('id, fournisseur, nom, code_fournisseur, prix_vente')
    .eq('actif', true)
    .order('fournisseur')
    .order('prix_vente');

  if (error) {
    console.error('[products] list:', error.message);
    return res.status(500).json({ ok: false, error: 'Erreur lors de la récupération des produits.' });
  }

  const products = data.map(p => ({
    ...p,
    prix_vente_htg: (p.prix_vente / 100).toFixed(2),
  }));

  return res.json({ ok: true, products });
});

module.exports = router;
