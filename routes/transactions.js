const express = require('express');
const supabase = require('../lib/supabase');
const requireAuth = require('../middleware/requireAuth');

const router = express.Router();

// ─── GET /api/v1/transactions ─────────────────────────────────────────────────
// Query params optionnels : ?type=wallet|recharge&status=success|failed&limit=50&offset=0
router.get('/', requireAuth, async (req, res) => {
  if (!supabase) return res.status(503).json({ ok: false, error: 'Base de données non configurée.' });

  const resellerId = req.session.resellerId;
  const { type, status, limit = 50, offset = 0 } = req.query;

  const lim = Math.min(parseInt(limit) || 50, 200);
  const off = parseInt(offset) || 0;

  const results = [];

  // Wallet transactions
  if (!type || type === 'wallet') {
    let q = supabase
      .from('wallet_transactions')
      .select('id, montant, reference, paym_transaction_id, status, created_at')
      .eq('reseller_id', resellerId)
      .order('created_at', { ascending: false })
      .range(off, off + lim - 1);

    if (status) {
      const statusMap = { success: 'confirmed', failed: 'expired' };
      q = q.eq('status', statusMap[status] || status);
    }

    const { data, error } = await q;
    if (!error && data) {
      results.push(...data.map(t => ({
        id: t.id,
        type: 'wallet',
        label: 'Recharge wallet',
        reference: t.reference,
        paym_transaction_id: t.paym_transaction_id,
        montant_centimes: t.montant,
        montant_htg: (t.montant / 100).toFixed(2),
        signe: '+',
        status: t.status,
        created_at: t.created_at,
      })));
    }
  }

  // API transactions
  if (!type || type === 'recharge') {
    let q = supabase
      .from('api_transactions')
      .select('id, produit_id, joueur_id, prix_reseller, status, ref_fournisseur, created_at, produits(nom, fournisseur)')
      .eq('reseller_id', resellerId)
      .order('created_at', { ascending: false })
      .range(off, off + lim - 1);

    if (status) {
      const statusMap = { success: 'success', failed: 'failed' };
      q = q.eq('status', statusMap[status] || status);
    }

    const { data, error } = await q;
    if (!error && data) {
      results.push(...data.map(t => ({
        id: t.id,
        type: 'recharge',
        label: t.produits?.nom || 'Recharge jeu',
        fournisseur: t.produits?.fournisseur,
        joueur_id: t.joueur_id,
        ref_fournisseur: t.ref_fournisseur,
        montant_centimes: t.prix_reseller,
        montant_htg: (t.prix_reseller / 100).toFixed(2),
        signe: '-',
        status: t.status,
        created_at: t.created_at,
      })));
    }
  }

  // Tri global par date
  results.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

  return res.json({ ok: true, transactions: results, count: results.length });
});

module.exports = router;
