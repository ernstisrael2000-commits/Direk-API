/**
 * GET /api/v1/services          — liste des services actifs avec produits
 * GET /api/v1/services/:slug    — détail d'un service + ses produits
 */
const express = require('express');
const supabase = require('../lib/supabase');
const requireAuth = require('../middleware/requireAuth');

const router = express.Router();

// ─── GET /api/v1/services ─────────────────────────────────────────────────────
router.get('/', requireAuth, async (req, res) => {
  if (!supabase) return res.status(503).json({ ok: false, error: 'Base de données non configurée.' });

  const { data, error } = await supabase
    .from('services')
    .select('id, nom, description, image_url, slug, ordre')
    .eq('status', 'actif')
    .order('ordre');

  if (error) {
    console.error('[services/list]', error.message);
    return res.status(500).json({ ok: false, error: error.message });
  }

  return res.json({ ok: true, services: data });
});

// ─── GET /api/v1/services/:slug/products ─────────────────────────────────────
router.get('/:slug/products', requireAuth, async (req, res) => {
  if (!supabase) return res.status(503).json({ ok: false, error: 'Base de données non configurée.' });

  const { slug } = req.params;

  // Récupérer le service
  const { data: service, error: svcErr } = await supabase
    .from('services')
    .select('id, nom, slug')
    .eq('slug', slug)
    .eq('status', 'actif')
    .single();

  if (svcErr || !service) {
    return res.status(404).json({ ok: false, error: 'Service introuvable ou inactif.' });
  }

  // Récupérer les produits avec info fournisseur
  const { data: produits, error: prodErr } = await supabase
    .from('produits')
    .select('id, nom, prix_vente, params_schema, meta, fournisseurs(nom, slug)')
    .eq('service_id', service.id)
    .eq('actif', true)
    .order('prix_vente');

  if (prodErr) {
    console.error('[services/products]', prodErr.message);
    return res.status(500).json({ ok: false, error: prodErr.message });
  }

  return res.json({
    ok: true,
    service,
    produits: (produits || []).map(p => ({
      id: p.id,
      nom: p.nom,
      prix_vente_htg: (p.prix_vente / 100).toFixed(2),
      prix_centimes: p.prix_vente,
      params_schema: p.params_schema || [],
      fournisseur: p.fournisseurs?.nom || null,
    })),
  });
});

module.exports = router;
