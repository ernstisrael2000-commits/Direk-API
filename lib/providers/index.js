/**
 * Registre des adaptateurs fournisseurs.
 * Pour ajouter un nouveau fournisseur :
 * 1. Créer lib/providers/<slug>.js qui extend BaseProvider
 * 2. L'enregistrer ici avec son slug
 * 3. Créer l'entrée dans la table `fournisseurs` avec le même slug
 */
const FazerCardsProvider = require('./fazercards');

const REGISTRY = {
  fazercards: FazerCardsProvider,
  // smilecoin: SmilecoinProvider,  ← ajouter ici les futurs fournisseurs
};

/**
 * Retourne une instance du provider à partir d'une ligne de la table `fournisseurs`.
 * @param {object} fournisseurRow - Ligne complète de la table fournisseurs
 * @returns {BaseProvider|null}
 */
function getProvider(fournisseurRow) {
  const Cls = REGISTRY[fournisseurRow.slug];
  if (!Cls) {
    console.error(`[providers] Aucun adaptateur pour le slug "${fournisseurRow.slug}"`);
    return null;
  }
  return new Cls(fournisseurRow);
}

/**
 * Liste les slugs enregistrés (pour diagnostic admin).
 */
function listRegistered() {
  return Object.keys(REGISTRY);
}

module.exports = { getProvider, listRegistered };
