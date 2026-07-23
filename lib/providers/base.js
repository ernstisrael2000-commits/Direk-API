/**
 * Interface de base pour tous les fournisseurs d'API.
 * Chaque fournisseur doit implémenter validatePlayer() et createOrder().
 */
class BaseProvider {
  /**
   * @param {object} config - Config issue de la table `fournisseurs` (colonnes + config jsonb)
   */
  constructor(config) {
    this.config = config;
    this.apiKey = process.env[config.api_key_env];
    if (!this.apiKey) {
      console.warn(`[Provider:${config.slug}] Variable d'env ${config.api_key_env} non définie.`);
    }
  }

  get isReady() {
    return !!this.apiKey;
  }

  /**
   * Valide un ID joueur / compte avant de passer commande.
   * @returns {{ ok: boolean, playerName?: string, error?: string }}
   */
  async validatePlayer(productMeta, params) {
    throw new Error(`${this.constructor.name}.validatePlayer() non implémenté`);
  }

  /**
   * Crée une commande chez le fournisseur.
   * @returns {{ ok: boolean, refFournisseur?: string, rawResponse: object, error?: string }}
   */
  async createOrder(productMeta, params) {
    throw new Error(`${this.constructor.name}.createOrder() non implémenté`);
  }
}

module.exports = BaseProvider;
