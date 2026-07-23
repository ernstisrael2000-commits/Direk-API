const express = require('express');
const crypto = require('crypto');
const supabase = require('../lib/supabase');
const requireAuth = require('../middleware/requireAuth');

const router = express.Router();

const PAYM_BASE_URL = 'https://plopplop.solutionip.app';
const PAYM_CLIENT_ID = process.env.PAYM_CLIENT_ID;
const PAYM_CLIENT_SECRET = process.env.PAYM_CLIENT_SECRET;
const FRAIS_PERCENT = 1.5; // affiché dans le design

// ─── POST /api/v1/wallet/topup ────────────────────────────────────────────────
// Body : { montant_htg: number }  (entier ou décimal, >= 20 HTG)
router.post('/topup', requireAuth, async (req, res) => {
  if (!supabase) return res.status(503).json({ ok: false, error: 'Base de données non configurée.' });
  if (!PAYM_CLIENT_ID || !PAYM_CLIENT_SECRET) {
    return res.status(503).json({ ok: false, error: 'Passerelle de paiement non configurée.' });
  }

  const { montant_htg } = req.body;
  if (!montant_htg || isNaN(Number(montant_htg))) {
    return res.status(400).json({ ok: false, error: 'Montant invalide.' });
  }

  const montantHTG = parseFloat(montant_htg);
  if (montantHTG < 20) {
    return res.status(400).json({ ok: false, error: 'Montant minimum : 20 HTG.' });
  }

  // Montant en centimes (entier strict)
  const montantCentimes = Math.round(montantHTG * 100);

  // Référence unique pour cette transaction
  const reference = 'WLT_' + crypto.randomBytes(8).toString('hex').toUpperCase();

  // Créer la transaction en état 'pending' avant d'appeler Pay'm
  const { data: transaction, error: txErr } = await supabase
    .from('wallet_transactions')
    .insert({
      reseller_id: req.session.resellerId,
      montant: montantCentimes,
      reference,
      status: 'pending',
    })
    .select('id')
    .single();

  if (txErr) {
    console.error('[wallet/topup] insert:', txErr.message);
    return res.status(500).json({ ok: false, error: 'Erreur lors de la création de la transaction.' });
  }

  // Appel Pay'm
  // ⚠️ "refference_id" — faute de frappe volontaire dans leur API
  let paymResponse;
  try {
    const paymRes = await fetch(`${PAYM_BASE_URL}/api/paiement-marchand`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: PAYM_CLIENT_ID,
        refference_id: reference,        // double f — voulu
        montant: montantHTG,             // HTG entier ou décimal
        payment_method: 'all',           // l'utilisateur choisit sur la page Pay'm
      }),
    });
    paymResponse = await paymRes.json();
  } catch (err) {
    console.error('[wallet/topup] Pay\'m unreachable:', err.message);
    // Marquer la transaction comme expirée si Pay'm est injoignable
    await supabase.from('wallet_transactions').update({ status: 'expired' }).eq('id', transaction.id);
    return res.status(502).json({ ok: false, error: 'Passerelle de paiement injoignable. Réessayez.' });
  }

  if (!paymResponse.url) {
    console.error('[wallet/topup] Réponse Pay\'m inattendue:', paymResponse);
    await supabase.from('wallet_transactions').update({ status: 'expired' }).eq('id', transaction.id);
    return res.status(502).json({ ok: false, error: 'Erreur de la passerelle de paiement.' });
  }

  // Stocker le transaction_id Pay'm
  await supabase
    .from('wallet_transactions')
    .update({ paym_transaction_id: paymResponse.transaction_id || null })
    .eq('id', transaction.id);

  return res.json({
    ok: true,
    reference,
    url: paymResponse.url,
    montant_htg: montantHTG,
    frais_htg: parseFloat((montantHTG * FRAIS_PERCENT / 100).toFixed(2)),
    total_htg: parseFloat((montantHTG * (1 + FRAIS_PERCENT / 100)).toFixed(2)),
  });
});

// ─── POST /api/v1/wallet/verify ───────────────────────────────────────────────
// Body : { reference: string }
// Idempotent — si déjà confirmé, retourne le statut sans recréditer.
router.post('/verify', requireAuth, async (req, res) => {
  if (!supabase) return res.status(503).json({ ok: false, error: 'Base de données non configurée.' });
  if (!PAYM_CLIENT_ID || !PAYM_CLIENT_SECRET) {
    return res.status(503).json({ ok: false, error: 'Passerelle de paiement non configurée.' });
  }

  const { reference } = req.body;
  if (!reference) {
    return res.status(400).json({ ok: false, error: 'Référence manquante.' });
  }

  // Récupérer la transaction
  const { data: tx, error: txErr } = await supabase
    .from('wallet_transactions')
    .select('id, montant, status, reseller_id')
    .eq('reference', reference)
    .eq('reseller_id', req.session.resellerId)
    .single();

  if (txErr || !tx) {
    return res.status(404).json({ ok: false, error: 'Transaction introuvable.' });
  }

  // Idempotence — déjà confirmée
  if (tx.status === 'confirmed') {
    return res.json({ ok: true, status: 'confirmed', montant_htg: (tx.montant / 100).toFixed(2) });
  }
  if (tx.status === 'expired') {
    return res.json({ ok: true, status: 'expired' });
  }

  // Vérifier auprès de Pay'm
  let paymResponse;
  try {
    const paymRes = await fetch(`${PAYM_BASE_URL}/api/paiement-verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: PAYM_CLIENT_ID,
        refference_id: reference, // double f — voulu
      }),
    });
    paymResponse = await paymRes.json();
  } catch (err) {
    console.error('[wallet/verify] Pay\'m unreachable:', err.message);
    return res.status(502).json({ ok: false, error: 'Passerelle injoignable. Réessayez dans quelques secondes.' });
  }

  if (paymResponse.trans_status !== 'ok') {
    return res.json({ ok: true, status: 'pending' });
  }

  // ─── Opération atomique : créditer le solde + confirmer la transaction ───────
  // Utiliser une transaction Postgres via RPC pour garantir l'atomicité
  const { error: rpcErr } = await supabase.rpc('confirm_wallet_topup', {
    p_transaction_id: tx.id,
    p_reseller_id: tx.reseller_id,
    p_montant: tx.montant,
  });

  if (rpcErr) {
    console.error('[wallet/verify] confirm_wallet_topup RPC:', rpcErr.message);
    return res.status(500).json({ ok: false, error: 'Erreur lors de la confirmation. Contactez le support avec la référence : ' + reference });
  }

  return res.json({
    ok: true,
    status: 'confirmed',
    montant_htg: (tx.montant / 100).toFixed(2),
  });
});

module.exports = router;
