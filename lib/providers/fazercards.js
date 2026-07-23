const BaseProvider = require('./base');

const BASE_URL = 'https://api.fzr.cards/api/v2';

class FazerCardsProvider extends BaseProvider {
  /**
   * Valide l'ID joueur auprès de FazerCards.
   * params doit contenir : { player_id, [server] }
   * productMeta doit contenir : { code_fournisseur }
   */
  async validatePlayer(productMeta, params) {
    if (!this.isReady) {
      return { ok: false, error: 'Fournisseur FazerCards non configuré (clé API manquante).' };
    }

    const qs = new URLSearchParams({
      product: productMeta.code_fournisseur,
      player_id: params.player_id,
      ...(params.server ? { server: params.server } : {}),
    });

    try {
      const res = await fetch(`${BASE_URL}/topups/validate-id?${qs}`, {
        headers: { 'X-API-Key': this.apiKey },
        signal: AbortSignal.timeout(10_000),
      });
      const data = await res.json();
      return {
        ok: !!data.ok,
        playerName: data.username || data.name || null,
        rawResponse: data,
        error: data.ok ? undefined : (data.message || 'ID joueur invalide.'),
      };
    } catch (err) {
      console.error('[FazerCards] validatePlayer:', err.message);
      return { ok: false, error: 'Impossible de valider l\'ID joueur. Réessayez.' };
    }
  }

  /**
   * Crée une commande de recharge chez FazerCards.
   * params doit contenir : { player_id, [server] }
   * productMeta doit contenir : { code_fournisseur }
   */
  async createOrder(productMeta, params) {
    if (!this.isReady) {
      return { ok: false, error: 'Fournisseur FazerCards non configuré (clé API manquante).' };
    }

    try {
      const res = await fetch(`${BASE_URL}/topups/order`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': this.apiKey,
        },
        body: JSON.stringify({
          product: productMeta.code_fournisseur,
          player_id: params.player_id,
          ...(params.server ? { server: params.server } : {}),
        }),
        signal: AbortSignal.timeout(30_000),
      });
      const data = await res.json();
      const refFournisseur = data.order_id || data.id || null;
      return {
        ok: !!data.ok,
        refFournisseur,
        rawResponse: data,
        error: data.ok ? undefined : (data.message || 'La recharge a échoué chez le fournisseur.'),
      };
    } catch (err) {
      console.error('[FazerCards] createOrder:', err.message);
      return { ok: false, rawResponse: { error: err.message }, error: 'Fournisseur injoignable. Réessayez.' };
    }
  }
}

module.exports = FazerCardsProvider;
