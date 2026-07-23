/**
 * Middleware — vérifie qu'une session reseller est active.
 * Redirige vers /login si la session est absente (requêtes HTML)
 * ou renvoie 401 JSON pour les requêtes API.
 */
function requireAuth(req, res, next) {
  if (req.session && req.session.resellerId) {
    return next();
  }
  const acceptsJson = (req.headers.accept && req.headers.accept.includes('application/json'))
    || req.originalUrl.startsWith('/api/');
  if (acceptsJson) {
    return res.status(401).json({ ok: false, error: 'Non authentifié. Veuillez vous connecter.' });
  }
  return res.redirect('/login');
}

module.exports = requireAuth;
