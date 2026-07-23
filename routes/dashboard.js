const express = require('express');
const supabase = require('../lib/supabase');
const requireAuth = require('../middleware/requireAuth');

const router = express.Router();

// ─── GET /api/v1/dashboard ────────────────────────────────────────────────────
router.get('/', requireAuth, async (req, res) => {
  if (!supabase) return res.status(503).json({ ok: false, error: 'Base de données non configurée.' });

  const resellerId = req.session.resellerId;

  // Récupérer le reseller
  const { data: reseller, error: rErr } = await supabase
    .from('resellers')
    .select('id, nom, email, balance, status, api_key_hash')
    .eq('id', resellerId)
    .single();

  if (rErr || !reseller) {
    return res.status(404).json({ ok: false, error: 'Compte introuvable.' });
  }

  // 3 dernières transactions (wallet + api mélangées, triées par date)
  const [{ data: walletTx }, { data: apiTx }] = await Promise.all([
    supabase
      .from('wallet_transactions')
      .select('id, montant, reference, status, created_at')
      .eq('reseller_id', resellerId)
      .eq('status', 'confirmed')
      .order('created_at', { ascending: false })
      .limit(3),
    supabase
      .from('api_transactions')
      .select('id, produit_id, joueur_id, prix_reseller, status, created_at, produits(nom)')
      .eq('reseller_id', resellerId)
      .order('created_at', { ascending: false })
      .limit(3),
  ]);

  // Formater et fusionner les transactions
  const wallet = (walletTx || []).map(t => ({
    id: t.id,
    type: 'wallet',
    label: 'Recharge wallet',
    reference: t.reference,
    montant_centimes: t.montant,
    montant_htg: (t.montant / 100).toFixed(2),
    signe: '+',
    status: t.status,
    created_at: t.created_at,
  }));

  const api = (apiTx || []).map(t => ({
    id: t.id,
    type: 'recharge',
    label: t.produits?.nom || 'Recharge jeu',
    joueur_id: t.joueur_id,
    montant_centimes: t.prix_reseller,
    montant_htg: (t.prix_reseller / 100).toFixed(2),
    signe: '-',
    status: t.status,
    created_at: t.created_at,
  }));

  const recentTransactions = [...wallet, ...api]
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    .slice(0, 3);

  // On ne renvoie jamais le hash de la clé API — juste un aperçu tronqué
  const apiKeyPreview = 'dk_live_' + '••••••••••••••••••••••••••••••••';

  return res.json({
    ok: true,
    reseller: {
      id: reseller.id,
      nom: reseller.nom,
      email: reseller.email,
      balance_centimes: reseller.balance,
      balance_htg: (reseller.balance / 100).toFixed(2),
      status: reseller.status,
      apiKeyPreview,
    },
    recentTransactions,
  });
});

module.exports = router;
