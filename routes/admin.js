const express = require('express');
const supabase = require('../lib/supabase');
const requireAdmin = require('../middleware/requireAdmin');

const router = express.Router();

// Toutes les routes admin nécessitent le secret admin
router.use(requireAdmin);

// ─── GET /api/v1/admin/products ───────────────────────────────────────────────
router.get('/products', async (req, res) => {
  if (!supabase) return res.status(503).json({ ok: false, error: 'Base de données non configurée.' });

  const { data, error } = await supabase
    .from('produits')
    .select('*')
    .order('fournisseur')
    .order('prix_vente');

  if (error) return res.status(500).json({ ok: false, error: error.message });

  const products = data.map(p => ({
    ...p,
    prix_achat_htg: (p.prix_achat / 100).toFixed(2),
    prix_vente_htg: (p.prix_vente / 100).toFixed(2),
    marge_htg: ((p.prix_vente - p.prix_achat) / 100).toFixed(2),
  }));

  return res.json({ ok: true, products });
});

// ─── POST /api/v1/admin/products ──────────────────────────────────────────────
// Body : { fournisseur, nom, code_fournisseur, prix_achat_htg, prix_vente_htg, actif? }
router.post('/products', async (req, res) => {
  if (!supabase) return res.status(503).json({ ok: false, error: 'Base de données non configurée.' });

  const { fournisseur, nom, code_fournisseur, prix_achat_htg, prix_vente_htg, actif = true } = req.body;

  if (!fournisseur || !nom || !code_fournisseur || prix_achat_htg == null || prix_vente_htg == null) {
    return res.status(400).json({ ok: false, error: 'Tous les champs sont requis.' });
  }

  const prix_achat = Math.round(parseFloat(prix_achat_htg) * 100);
  const prix_vente = Math.round(parseFloat(prix_vente_htg) * 100);

  if (prix_achat <= 0 || prix_vente <= 0 || prix_vente < prix_achat) {
    return res.status(400).json({ ok: false, error: 'Prix invalides (vente doit être >= achat).' });
  }

  const { data, error } = await supabase
    .from('produits')
    .insert({ fournisseur, nom, code_fournisseur, prix_achat, prix_vente, actif })
    .select()
    .single();

  if (error) {
    if (error.code === '23505') return res.status(409).json({ ok: false, error: 'Ce code produit existe déjà.' });
    return res.status(500).json({ ok: false, error: error.message });
  }

  return res.status(201).json({ ok: true, product: data });
});

// ─── PUT /api/v1/admin/products/:id ──────────────────────────────────────────
router.put('/products/:id', async (req, res) => {
  if (!supabase) return res.status(503).json({ ok: false, error: 'Base de données non configurée.' });

  const { id } = req.params;
  const { fournisseur, nom, code_fournisseur, prix_achat_htg, prix_vente_htg, actif } = req.body;

  const updates = {};
  if (fournisseur !== undefined) updates.fournisseur = fournisseur;
  if (nom !== undefined) updates.nom = nom;
  if (code_fournisseur !== undefined) updates.code_fournisseur = code_fournisseur;
  if (prix_achat_htg !== undefined) updates.prix_achat = Math.round(parseFloat(prix_achat_htg) * 100);
  if (prix_vente_htg !== undefined) updates.prix_vente = Math.round(parseFloat(prix_vente_htg) * 100);
  if (actif !== undefined) updates.actif = actif;

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

// ─── PATCH /api/v1/admin/products/:id/toggle ─────────────────────────────────
router.patch('/products/:id/toggle', async (req, res) => {
  if (!supabase) return res.status(503).json({ ok: false, error: 'Base de données non configurée.' });

  const { id } = req.params;

  const { data: current, error: fetchErr } = await supabase
    .from('produits')
    .select('actif')
    .eq('id', id)
    .single();

  if (fetchErr || !current) return res.status(404).json({ ok: false, error: 'Produit introuvable.' });

  const { data, error } = await supabase
    .from('produits')
    .update({ actif: !current.actif })
    .eq('id', id)
    .select()
    .single();

  if (error) return res.status(500).json({ ok: false, error: error.message });

  return res.json({ ok: true, product: data });
});

// ─── DELETE /api/v1/admin/products/:id ───────────────────────────────────────
router.delete('/products/:id', async (req, res) => {
  if (!supabase) return res.status(503).json({ ok: false, error: 'Base de données non configurée.' });

  const { id } = req.params;

  // Vérifier qu'aucune transaction active n'existe pour ce produit
  const { count } = await supabase
    .from('api_transactions')
    .select('id', { count: 'exact', head: true })
    .eq('produit_id', id)
    .in('status', ['reserved', 'success']);

  if (count > 0) {
    return res.status(409).json({ ok: false, error: 'Impossible de supprimer : des transactions existent pour ce produit. Désactivez-le plutôt.' });
  }

  const { error } = await supabase.from('produits').delete().eq('id', id);
  if (error) return res.status(500).json({ ok: false, error: error.message });

  return res.json({ ok: true });
});

// ─── GET /api/v1/admin/resellers ─────────────────────────────────────────────
router.get('/resellers', async (req, res) => {
  if (!supabase) return res.status(503).json({ ok: false, error: 'Base de données non configurée.' });

  const { data, error } = await supabase
    .from('resellers')
    .select('id, nom, email, balance, status, created_at')
    .order('created_at', { ascending: false });

  if (error) return res.status(500).json({ ok: false, error: error.message });

  const resellers = data.map(r => ({
    ...r,
    balance_htg: (r.balance / 100).toFixed(2),
  }));

  return res.json({ ok: true, resellers });
});

// ─── PATCH /api/v1/admin/resellers/:id/status ────────────────────────────────
router.patch('/resellers/:id/status', async (req, res) => {
  if (!supabase) return res.status(503).json({ ok: false, error: 'Base de données non configurée.' });

  const { id } = req.params;
  const { status } = req.body;

  if (!['actif', 'suspendu'].includes(status)) {
    return res.status(400).json({ ok: false, error: 'Statut invalide (actif | suspendu).' });
  }

  const { data, error } = await supabase
    .from('resellers')
    .update({ status })
    .eq('id', id)
    .select('id, nom, email, status')
    .single();

  if (error) return res.status(500).json({ ok: false, error: error.message });
  if (!data) return res.status(404).json({ ok: false, error: 'Reseller introuvable.' });

  return res.json({ ok: true, reseller: data });
});

module.exports = router;
