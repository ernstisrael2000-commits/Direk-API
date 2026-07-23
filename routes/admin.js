const express = require('express');
const supabase = require('../lib/supabase');
const requireAdmin = require('../middleware/requireAdmin');
const { listRegistered } = require('../lib/providers');

const router = express.Router();

// Toutes les routes admin nécessitent le secret admin
router.use(requireAdmin);

// ════════════════════════════════════════════════════════════════
// PRODUITS
// ════════════════════════════════════════════════════════════════

// ─── GET /api/v1/admin/products ───────────────────────────────
router.get('/products', async (req, res) => {
  if (!supabase) return res.status(503).json({ ok: false, error: 'Base de données non configurée.' });

  const { data, error } = await supabase
    .from('produits')
    .select('*, services(nom, slug), fournisseurs(nom, slug)')
    .order('prix_vente');

  if (error) return res.status(500).json({ ok: false, error: error.message });

  return res.json({
    ok: true,
    products: data.map(p => ({
      ...p,
      prix_achat_htg:  (p.prix_achat / 100).toFixed(2),
      prix_vente_htg:  (p.prix_vente / 100).toFixed(2),
      marge_htg:       ((p.prix_vente - p.prix_achat) / 100).toFixed(2),
      service_nom:     p.services?.nom || null,
      fournisseur_nom: p.fournisseurs?.nom || null,
    })),
  });
});

// ─── POST /api/v1/admin/products ──────────────────────────────
router.post('/products', async (req, res) => {
  if (!supabase) return res.status(503).json({ ok: false, error: 'Base de données non configurée.' });

  const {
    service_id, fournisseur_id,
    nom, code_fournisseur,
    prix_achat_htg, prix_vente_htg,
    params_schema = [], meta = {},
    actif = true,
  } = req.body;

  if (!nom || !code_fournisseur || prix_achat_htg == null || prix_vente_htg == null) {
    return res.status(400).json({ ok: false, error: 'nom, code_fournisseur, prix_achat_htg et prix_vente_htg sont requis.' });
  }

  const prix_achat = Math.round(parseFloat(prix_achat_htg) * 100);
  const prix_vente = Math.round(parseFloat(prix_vente_htg) * 100);

  if (prix_achat <= 0 || prix_vente <= 0 || prix_vente < prix_achat) {
    return res.status(400).json({ ok: false, error: 'Prix invalides (vente >= achat > 0).' });
  }

  const { data, error } = await supabase
    .from('produits')
    .insert({ service_id, fournisseur_id, nom, code_fournisseur, prix_achat, prix_vente, params_schema, meta, actif })
    .select()
    .single();

  if (error) {
    if (error.code === '23505') return res.status(409).json({ ok: false, error: 'Ce code produit existe déjà.' });
    return res.status(500).json({ ok: false, error: error.message });
  }

  return res.status(201).json({ ok: true, product: data });
});

// ─── PUT /api/v1/admin/products/:id ──────────────────────────
router.put('/products/:id', async (req, res) => {
  if (!supabase) return res.status(503).json({ ok: false, error: 'Base de données non configurée.' });

  const { id } = req.params;
  const allowed = ['service_id', 'fournisseur_id', 'nom', 'code_fournisseur', 'params_schema', 'meta', 'actif'];
  const updates = {};

  for (const key of allowed) {
    if (req.body[key] !== undefined) updates[key] = req.body[key];
  }
  if (req.body.prix_achat_htg !== undefined) updates.prix_achat = Math.round(parseFloat(req.body.prix_achat_htg) * 100);
  if (req.body.prix_vente_htg !== undefined) updates.prix_vente = Math.round(parseFloat(req.body.prix_vente_htg) * 100);

  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ ok: false, error: 'Aucun champ à mettre à jour.' });
  }

  const { data, error } = await supabase
    .from('produits')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) return res.status(500).json({ ok: false, error: error.message });
  if (!data) return res.status(404).json({ ok: false, error: 'Produit introuvable.' });

  return res.json({ ok: true, product: data });
});

// ─── PATCH /api/v1/admin/products/:id/toggle ─────────────────
router.patch('/products/:id/toggle', async (req, res) => {
  if (!supabase) return res.status(503).json({ ok: false, error: 'Base de données non configurée.' });

  const { data: current, error: fetchErr } = await supabase
    .from('produits').select('actif').eq('id', req.params.id).single();

  if (fetchErr || !current) return res.status(404).json({ ok: false, error: 'Produit introuvable.' });

  const { data, error } = await supabase
    .from('produits').update({ actif: !current.actif }).eq('id', req.params.id).select().single();

  if (error) return res.status(500).json({ ok: false, error: error.message });
  return res.json({ ok: true, product: data });
});

// ─── DELETE /api/v1/admin/products/:id ───────────────────────
router.delete('/products/:id', async (req, res) => {
  if (!supabase) return res.status(503).json({ ok: false, error: 'Base de données non configurée.' });

  const { count } = await supabase
    .from('commandes')
    .select('id', { count: 'exact', head: true })
    .eq('produit_id', req.params.id)
    .in('status', ['reserved', 'success']);

  if (count > 0) {
    return res.status(409).json({ ok: false, error: 'Des commandes actives existent pour ce produit. Désactivez-le plutôt.' });
  }

  const { error } = await supabase.from('produits').delete().eq('id', req.params.id);
  if (error) return res.status(500).json({ ok: false, error: error.message });
  return res.json({ ok: true });
});

// ════════════════════════════════════════════════════════════════
// SERVICES
// ════════════════════════════════════════════════════════════════

// ─── GET /api/v1/admin/services ───────────────────────────────
router.get('/services', async (req, res) => {
  if (!supabase) return res.status(503).json({ ok: false, error: 'Base de données non configurée.' });

  const { data, error } = await supabase
    .from('services').select('*').order('ordre');

  if (error) return res.status(500).json({ ok: false, error: error.message });
  return res.json({ ok: true, services: data });
});

// ─── POST /api/v1/admin/services ──────────────────────────────
router.post('/services', async (req, res) => {
  if (!supabase) return res.status(503).json({ ok: false, error: 'Base de données non configurée.' });

  const { nom, description, slug, image_url, ordre = 0, status = 'actif' } = req.body;
  if (!nom || !slug) return res.status(400).json({ ok: false, error: 'nom et slug requis.' });

  const { data, error } = await supabase
    .from('services').insert({ nom, description, slug, image_url, ordre, status }).select().single();

  if (error) {
    if (error.code === '23505') return res.status(409).json({ ok: false, error: 'Ce slug existe déjà.' });
    return res.status(500).json({ ok: false, error: error.message });
  }
  return res.status(201).json({ ok: true, service: data });
});

// ─── PUT /api/v1/admin/services/:id ──────────────────────────
router.put('/services/:id', async (req, res) => {
  if (!supabase) return res.status(503).json({ ok: false, error: 'Base de données non configurée.' });

  const allowed = ['nom', 'description', 'slug', 'image_url', 'ordre', 'status'];
  const updates = {};
  for (const key of allowed) {
    if (req.body[key] !== undefined) updates[key] = req.body[key];
  }
  if (Object.keys(updates).length === 0) return res.status(400).json({ ok: false, error: 'Aucun champ.' });

  const { data, error } = await supabase
    .from('services').update(updates).eq('id', req.params.id).select().single();

  if (error) return res.status(500).json({ ok: false, error: error.message });
  if (!data) return res.status(404).json({ ok: false, error: 'Service introuvable.' });
  return res.json({ ok: true, service: data });
});

// ════════════════════════════════════════════════════════════════
// FOURNISSEURS
// ════════════════════════════════════════════════════════════════

// ─── GET /api/v1/admin/fournisseurs ───────────────────────────
router.get('/fournisseurs', async (req, res) => {
  if (!supabase) return res.status(503).json({ ok: false, error: 'Base de données non configurée.' });

  const { data, error } = await supabase
    .from('fournisseurs').select('id, nom, slug, base_url, api_key_env, status, config, created_at').order('nom');

  if (error) return res.status(500).json({ ok: false, error: error.message });

  // Indiquer si le fournisseur a un adaptateur code enregistré
  const registered = listRegistered();
  return res.json({
    ok: true,
    fournisseurs: data.map(f => ({
      ...f,
      adaptateur_disponible: registered.includes(f.slug),
    })),
  });
});

// ─── POST /api/v1/admin/fournisseurs ──────────────────────────
router.post('/fournisseurs', async (req, res) => {
  if (!supabase) return res.status(503).json({ ok: false, error: 'Base de données non configurée.' });

  const { nom, slug, base_url, api_key_env, config = {}, status = 'actif' } = req.body;
  if (!nom || !slug || !base_url || !api_key_env) {
    return res.status(400).json({ ok: false, error: 'nom, slug, base_url et api_key_env requis.' });
  }

  const registered = listRegistered();
  if (!registered.includes(slug)) {
    return res.status(422).json({
      ok: false,
      error: `Aucun adaptateur code pour le slug "${slug}". Adaptateurs disponibles : ${registered.join(', ')}.`,
    });
  }

  const { data, error } = await supabase
    .from('fournisseurs').insert({ nom, slug, base_url, api_key_env, config, status }).select().single();

  if (error) {
    if (error.code === '23505') return res.status(409).json({ ok: false, error: 'Ce slug existe déjà.' });
    return res.status(500).json({ ok: false, error: error.message });
  }
  return res.status(201).json({ ok: true, fournisseur: data });
});

// ─── PUT /api/v1/admin/fournisseurs/:id ──────────────────────
router.put('/fournisseurs/:id', async (req, res) => {
  if (!supabase) return res.status(503).json({ ok: false, error: 'Base de données non configurée.' });

  const allowed = ['nom', 'base_url', 'api_key_env', 'status', 'config'];
  const updates = {};
  for (const key of allowed) {
    if (req.body[key] !== undefined) updates[key] = req.body[key];
  }
  if (Object.keys(updates).length === 0) return res.status(400).json({ ok: false, error: 'Aucun champ.' });

  const { data, error } = await supabase
    .from('fournisseurs').update(updates).eq('id', req.params.id).select().single();

  if (error) return res.status(500).json({ ok: false, error: error.message });
  if (!data) return res.status(404).json({ ok: false, error: 'Fournisseur introuvable.' });
  return res.json({ ok: true, fournisseur: data });
});

// ════════════════════════════════════════════════════════════════
// RESELLERS
// ════════════════════════════════════════════════════════════════

// ─── GET /api/v1/admin/resellers ─────────────────────────────
router.get('/resellers', async (req, res) => {
  if (!supabase) return res.status(503).json({ ok: false, error: 'Base de données non configurée.' });

  const { data, error } = await supabase
    .from('resellers')
    .select('id, nom, email, balance, status, created_at')
    .order('created_at', { ascending: false });

  if (error) return res.status(500).json({ ok: false, error: error.message });

  return res.json({
    ok: true,
    resellers: data.map(r => ({ ...r, balance_htg: (r.balance / 100).toFixed(2) })),
  });
});

// ─── PATCH /api/v1/admin/resellers/:id/status ────────────────
router.patch('/resellers/:id/status', async (req, res) => {
  if (!supabase) return res.status(503).json({ ok: false, error: 'Base de données non configurée.' });

  const { status } = req.body;
  if (!['actif', 'suspendu'].includes(status)) {
    return res.status(400).json({ ok: false, error: 'Statut invalide (actif | suspendu).' });
  }

  const { data, error } = await supabase
    .from('resellers')
    .update({ status })
    .eq('id', req.params.id)
    .select('id, nom, email, status')
    .single();

  if (error) return res.status(500).json({ ok: false, error: error.message });
  if (!data) return res.status(404).json({ ok: false, error: 'Reseller introuvable.' });
  return res.json({ ok: true, reseller: data });
});

module.exports = router;
