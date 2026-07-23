const express = require('express');
const supabase = require('../lib/supabase');
const requireApiKey = require('../middleware/requireApiKey');

const router = express.Router();

const FAZER_BASE_URL = 'https://api.fzr.cards/api/v2';
const FAZER_API_KEY = process.env.FAZERCARDS_API_KEY;

// ─── POST /api/v1/recharge ────────────────────────────────────────────────────
// Header  : X-API-Key: dk_live_...
// Body    : { product_code: string, player_id: string }
// Réponse : { ok, transaction_id, status, ref_fournisseur? }
router.post('/', requireApiKey, async (req, res) => {
  if (!supabase) return res.status(503).json({ ok: false, error: 'Base de données non configurée.' });
  if (!FAZER_API_KEY) return res.status(503).json({ ok: false, error: 'Fournisseur de recharges non configuré.' });

  const { product_code, player_id } = req.body;
  if (!product_code || !player_id) {
    return res.status(400).json({ ok: false, error: 'product_code et player_id requis.' });
  }

  const reseller = req.reseller; // posé par requireApiKey

  // 1. Récupérer le produit
  const { data: produit, error: prodErr } = await supabase
    .from('produits')
    .select('id, nom, code_fournisseur, prix_achat, prix_vente, actif')
    .eq('code_fournisseur', product_code)
    .eq('actif', true)
    .single();

  if (prodErr || !produit) {
    return res.status(404).json({ ok: false, error: 'Produit introuvable ou inactif.' });
  }

  // 2. Vérifier le solde (centimes)
  if (reseller.balance < produit.prix_vente) {
    return res.status(402).json({
      ok: false,
      error: 'Solde insuffisant.',
      solde_htg: (reseller.balance / 100).toFixed(2),
      requis_htg: (produit.prix_vente / 100).toFixed(2),
    });
  }

  // 3. Valider l'ID joueur auprès de FazerCards
  try {
    const validateRes = await fetch(
      `${FAZER_BASE_URL}/topups/validate-id?product=${product_code}&player_id=${encodeURIComponent(player_id)}`,
      { headers: { 'X-API-Key': FAZER_API_KEY } }
    );
    const validateData = await validateRes.json();
    if (!validateData.ok) {
      return res.status(422).json({ ok: false, error: 'ID joueur invalide.', detail: validateData });
    }
  } catch (err) {
    console.error('[recharge] validate-id error:', err.message);
    return res.status(502).json({ ok: false, error: 'Impossible de valider l\'ID joueur. Réessayez.' });
  }

  // 4. Créer la transaction en état 'reserved' + débiter le solde — atomique via RPC
  const { data: txData, error: txErr } = await supabase.rpc('create_recharge_transaction', {
    p_reseller_id: reseller.id,
    p_produit_id: produit.id,
    p_joueur_id: player_id,
    p_prix_reseller: produit.prix_vente,
    p_prix_fournisseur: produit.prix_achat,
  });

  if (txErr) {
    console.error('[recharge] create_recharge_transaction RPC:', txErr.message);
    return res.status(500).json({ ok: false, error: 'Erreur lors de la réservation. Réessayez.' });
  }

  const transactionId = txData;

  // 5. Appeler FazerCards
  let fazerResponse;
  try {
    const fazerRes = await fetch(`${FAZER_BASE_URL}/topups/order`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': FAZER_API_KEY,
      },
      body: JSON.stringify({
        product: product_code,
        player_id,
      }),
    });
    fazerResponse = await fazerRes.json();
  } catch (err) {
    console.error('[recharge] FazerCards order error:', err.message);
    fazerResponse = null;
  }

  // 6. Succès ou remboursement automatique
  if (fazerResponse && fazerResponse.ok) {
    await supabase
      .from('api_transactions')
      .update({ status: 'success', ref_fournisseur: fazerResponse.order_id || fazerResponse.id || null })
      .eq('id', transactionId);

    return res.json({
      ok: true,
      transaction_id: transactionId,
      status: 'success',
      ref_fournisseur: fazerResponse.order_id || fazerResponse.id,
    });
  } else {
    // Remboursement automatique — atomique via RPC
    await supabase.rpc('refund_recharge_transaction', {
      p_transaction_id: transactionId,
      p_reseller_id: reseller.id,
      p_montant: produit.prix_vente,
    });

    console.error('[recharge] FazerCards échec — remboursé. Tx:', transactionId, 'Réponse:', fazerResponse);

    return res.status(502).json({
      ok: false,
      error: 'La recharge a échoué. Votre solde a été remboursé.',
      transaction_id: transactionId,
      status: 'refunded',
    });
  }
});

module.exports = router;
