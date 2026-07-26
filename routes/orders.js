/**
 * POST /api/v1/orders           — passer une commande (multi-service, multi-provider)
 * GET  /api/v1/orders/:id       — statut d'une commande
 *
 * Ce endpoint remplace et généralise POST /api/v1/recharge.
 * Il fonctionne avec tous les services et fournisseurs enregistrés.
 */
const express = require('express');
const supabase = require('../lib/supabase');
const requireApiKey = require('../middleware/requireApiKey');
const requireAuth = require('../middleware/requireAuth');
const { getProvider } = require('../lib/providers');

const router = express.Router();

// ─── POST /api/v1/orders ──────────────────────────────────────────────────────
// Header  : X-API-Key: dk_live_...
// Body    : { product_id: uuid, params: { player_id, server?, ... } }
router.post('/', requireApiKey, async (req, res) => {
  if (!supabase) return res.status(503).json({ ok: false, error: 'Base de données non configurée.' });

  const { product_id, params = {} } = req.body;

  if (!product_id) {
    return res.status(400).json({ ok: false, error: 'product_id requis.' });
  }

  const reseller = req.reseller;

  // 1. Récupérer le produit + fournisseur + service
  const { data: produit, error: prodErr } = await supabase
    .from('produits')
    .select('id, nom, code_fournisseur, prix_achat, prix_vente, actif, params_schema, meta, service_id, fournisseur_id, fournisseurs(*)')
    .eq('id', product_id)
    .eq('actif', true)
    .single();

  if (prodErr || !produit) {
    return res.status(404).json({ ok: false, error: 'Produit introuvable ou inactif.' });
  }

  if (!produit.fournisseur_id || !produit.fournisseurs) {
    return res.status(422).json({ ok: false, error: 'Ce produit n\'a pas de fournisseur configuré.' });
  }

  // 2. Valider les params requis selon le params_schema du produit
  const schema = produit.params_schema || [];
  const missingFields = schema
    .filter(f => f.required && !params[f.name])
    .map(f => f.label || f.name);

  if (missingFields.length > 0) {
    return res.status(400).json({
      ok: false,
      error: `Champs requis manquants : ${missingFields.join(', ')}.`,
    });
  }

  // 3. Vérifier le solde
  if (reseller.balance < produit.prix_vente) {
    return res.status(402).json({
      ok: false,
      error: 'Solde insuffisant.',
      solde_htg: (reseller.balance / 100).toFixed(2),
      requis_htg: (produit.prix_vente / 100).toFixed(2),
    });
  }

  // 4. Instancier le provider
  const provider = getProvider(produit.fournisseurs);
  if (!provider) {
    return res.status(503).json({ ok: false, error: `Fournisseur "${produit.fournisseurs.slug}" non supporté.` });
  }
  if (!provider.isReady) {
    return res.status(503).json({ ok: false, error: 'Fournisseur non configuré (clé API manquante).' });
  }

  // 5. Valider le joueur/compte (si le fournisseur le supporte)
  const fournisseurConfig = produit.fournisseurs.config || {};
  if (fournisseurConfig.supports_validate) {
    const validation = await provider.validatePlayer(
      { code_fournisseur: produit.code_fournisseur, ...produit.meta },
      params
    );
    if (!validation.ok) {
      return res.status(422).json({ ok: false, error: validation.error || 'ID joueur invalide.' });
    }
  }

  // 6. Créer la commande + débiter le solde — atomique
  const { data: commandeId, error: cmdErr } = await supabase.rpc('create_commande', {
    p_reseller_id:      reseller.id,
    p_service_id:       produit.service_id,
    p_fournisseur_id:   produit.fournisseur_id,
    p_produit_id:       produit.id,
    p_params:           params,
    p_prix_reseller:    produit.prix_vente,
    p_prix_fournisseur: produit.prix_achat,
  });

  if (cmdErr) {
    console.error('[orders/create] create_commande RPC:', cmdErr.message);
    if (cmdErr.message.includes('SOLDE_INSUFFISANT')) {
      return res.status(402).json({ ok: false, error: 'Solde insuffisant (vérifié en base).' });
    }
    return res.status(500).json({ ok: false, error: 'Erreur lors de la réservation. Réessayez.' });
  }

  // 7. Appeler le fournisseur
  const orderResult = await provider.createOrder(
    { code_fournisseur: produit.code_fournisseur, ...produit.meta },
    params
  );

  if (orderResult.ok) {
    // Succès — mettre à jour la commande
    await supabase
      .from('commandes')
      .update({
        status: 'success',
        ref_fournisseur: orderResult.refFournisseur || null,
        reponse_fournisseur: orderResult.rawResponse || null,
      })
      .eq('id', commandeId);

    return res.json({
      ok: true,
      commande_id: commandeId,
      status: 'success',
      ref_fournisseur: orderResult.refFournisseur,
    });
  } else {
    // Échec — rembourser automatiquement
    await supabase.rpc('refund_commande', {
      p_commande_id: commandeId,
      p_reseller_id: reseller.id,
      p_montant:     produit.prix_vente,
    });

    // Logger la réponse d'échec
    await supabase
      .from('commandes')
      .update({
        status: 'refunded',
        reponse_fournisseur: orderResult.rawResponse || null,
      })
      .eq('id', commandeId);

    console.error(`[orders/create] Fournisseur échec — remboursé. Commande: ${commandeId}`);

    return res.status(502).json({
      ok: false,
      error: orderResult.error || 'La commande a échoué. Votre solde a été remboursé.',
      commande_id: commandeId,
      status: 'refunded',
    });
  }
});

// ─── POST /api/v1/orders/web ─────────────────────────────────────────────────
// Accessible via session (dashboard web) — même logique que POST / mais auth par cookie
router.post('/web', requireAuth, async (req, res) => {
  if (!supabase) return res.status(503).json({ ok: false, error: 'Base de données non configurée.' });

  const { product_id, params = {} } = req.body;
  if (!product_id) return res.status(400).json({ ok: false, error: 'product_id requis.' });

  // Charger le reseller depuis la session
  const { data: reseller, error: rErr } = await supabase
    .from('resellers')
    .select('id, nom, balance, status')
    .eq('id', req.session.resellerId)
    .single();

  if (rErr || !reseller) return res.status(401).json({ ok: false, error: 'Session invalide.' });
  if (reseller.status === 'suspendu') return res.status(403).json({ ok: false, error: 'Compte suspendu.' });

  // 1. Produit + fournisseur
  const { data: produit, error: prodErr } = await supabase
    .from('produits')
    .select('id, nom, code_fournisseur, prix_achat, prix_vente, actif, params_schema, meta, service_id, fournisseur_id, fournisseurs(*)')
    .eq('id', product_id)
    .eq('actif', true)
    .single();

  if (prodErr || !produit) return res.status(404).json({ ok: false, error: 'Produit introuvable ou inactif.' });
  if (!produit.fournisseur_id || !produit.fournisseurs) {
    return res.status(422).json({ ok: false, error: 'Ce produit n\'a pas de fournisseur configuré.' });
  }

  // 2. Valider les params requis
  const schema = produit.params_schema || [];
  const missingFields = schema.filter(f => f.required && !params[f.name]).map(f => f.label || f.name);
  if (missingFields.length > 0) {
    return res.status(400).json({ ok: false, error: `Champs requis manquants : ${missingFields.join(', ')}.` });
  }

  // 3. Vérifier le solde
  if (reseller.balance < produit.prix_vente) {
    return res.status(402).json({
      ok: false,
      error: 'Solde insuffisant.',
      solde_htg: (reseller.balance / 100).toFixed(2),
      requis_htg: (produit.prix_vente / 100).toFixed(2),
    });
  }

  // 4. Provider
  const provider = getProvider(produit.fournisseurs);
  if (!provider) return res.status(503).json({ ok: false, error: `Fournisseur "${produit.fournisseurs.slug}" non supporté.` });
  if (!provider.isReady) return res.status(503).json({ ok: false, error: 'Fournisseur non configuré (clé API manquante).' });

  // 5. Validation joueur
  const fournisseurConfig = produit.fournisseurs.config || {};
  if (fournisseurConfig.supports_validate) {
    const validation = await provider.validatePlayer(
      { code_fournisseur: produit.code_fournisseur, ...produit.meta },
      params
    );
    if (!validation.ok) return res.status(422).json({ ok: false, error: validation.error || 'ID joueur invalide.' });
  }

  // 6. Créer commande + débiter (atomique)
  const { data: commandeId, error: cmdErr } = await supabase.rpc('create_commande', {
    p_reseller_id:      reseller.id,
    p_service_id:       produit.service_id,
    p_fournisseur_id:   produit.fournisseur_id,
    p_produit_id:       produit.id,
    p_params:           params,
    p_prix_reseller:    produit.prix_vente,
    p_prix_fournisseur: produit.prix_achat,
  });

  if (cmdErr) {
    console.error('[orders/web] create_commande RPC:', cmdErr.message);
    if (cmdErr.message.includes('SOLDE_INSUFFISANT')) {
      return res.status(402).json({ ok: false, error: 'Solde insuffisant (vérifié en base).' });
    }
    return res.status(500).json({ ok: false, error: 'Erreur lors de la réservation. Réessayez.' });
  }

  // 7. Appeler le fournisseur
  const orderResult = await provider.createOrder(
    { code_fournisseur: produit.code_fournisseur, ...produit.meta },
    params
  );

  if (orderResult.ok) {
    await supabase.from('commandes').update({
      status: 'success',
      ref_fournisseur: orderResult.refFournisseur || null,
      reponse_fournisseur: orderResult.rawResponse || null,
    }).eq('id', commandeId);

    return res.json({
      ok: true,
      commande_id: commandeId,
      status: 'success',
      ref_fournisseur: orderResult.refFournisseur,
      produit_nom: produit.nom,
      montant_htg: (produit.prix_vente / 100).toFixed(2),
    });
  } else {
    await supabase.rpc('refund_commande', {
      p_commande_id: commandeId,
      p_reseller_id: reseller.id,
      p_montant:     produit.prix_vente,
    });
    await supabase.from('commandes').update({
      status: 'refunded',
      reponse_fournisseur: orderResult.rawResponse || null,
    }).eq('id', commandeId);

    console.error(`[orders/web] Fournisseur échec — remboursé. Commande: ${commandeId}`);
    return res.status(502).json({
      ok: false,
      error: orderResult.error || 'La commande a échoué. Votre solde a été remboursé.',
      commande_id: commandeId,
      status: 'refunded',
    });
  }
});

// ─── GET /api/v1/orders/:id ───────────────────────────────────────────────────
// Accessible via session (dashboard) ou clé API
router.get('/:id', async (req, res) => {
  if (!supabase) return res.status(503).json({ ok: false, error: 'Base de données non configurée.' });

  // Authentifier : session ou clé API
  const resellerId = req.session?.resellerId || req.reseller?.id;
  if (!resellerId) {
    return res.status(401).json({ ok: false, error: 'Non authentifié.' });
  }

  const { id } = req.params;

  const { data: commande, error } = await supabase
    .from('commandes')
    .select('id, status, ref_fournisseur, prix_reseller, created_at, produits(nom), services(nom)')
    .eq('id', id)
    .eq('reseller_id', resellerId)
    .single();

  if (error || !commande) {
    return res.status(404).json({ ok: false, error: 'Commande introuvable.' });
  }

  return res.json({
    ok: true,
    commande: {
      id: commande.id,
      status: commande.status,
      service: commande.services?.nom || null,
      produit: commande.produits?.nom || null,
      ref_fournisseur: commande.ref_fournisseur,
      montant_htg: (commande.prix_reseller / 100).toFixed(2),
      created_at: commande.created_at,
    },
  });
});

module.exports = router;
