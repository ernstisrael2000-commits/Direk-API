/**
 * routes/public.js
 * Routes publiques — accessibles SANS authentification.
 * Utilisées par la page boutique (/boutique) pour afficher
 * le catalogue et les prix aux clients des resellers.
 */
const express  = require('express');
const supabase = require('../lib/supabase');

const router = express.Router();

// ─── GET /api/v1/public/services ─────────────────────────────────────────────
// Liste des services actifs avec leurs produits
router.get('/services', async (req, res) => {
  if (!supabase) return res.status(503).json({ ok: false, error: 'Service indisponible.' });

  const { data, error } = await supabase
    .from('services')
    .select('id, nom, description, slug, ordre')
    .eq('status', 'actif')
    .order('ordre');

  if (error) return res.status(500).json({ ok: false, error: error.message });
  return res.json({ ok: true, services: data });
});

// ─── GET /api/v1/public/services/:slug/products ───────────────────────────────
// Produits d'un service (prix de vente visibles publiquement)
router.get('/services/:slug/products', async (req, res) => {
  if (!supabase) return res.status(503).json({ ok: false, error: 'Service indisponible.' });

  const { slug } = req.params;

  const { data: service, error: svcErr } = await supabase
    .from('services')
    .select('id, nom, slug, description')
    .eq('slug', slug)
    .eq('status', 'actif')
    .single();

  if (svcErr || !service) {
    return res.status(404).json({ ok: false, error: 'Service introuvable.' });
  }

  const { data: produits, error: prodErr } = await supabase
    .from('produits')
    .select('id, nom, prix_vente, params_schema')
    .eq('service_id', service.id)
    .eq('actif', true)
    .order('prix_vente');

  if (prodErr) return res.status(500).json({ ok: false, error: prodErr.message });

  return res.json({
    ok: true,
    service,
    produits: (produits || []).map(p => ({
      id:             p.id,
      nom:            p.nom,
      prix_vente_htg: (p.prix_vente / 100).toFixed(2),
      params_schema:  p.params_schema || [],
    })),
  });
});

module.exports = router;
