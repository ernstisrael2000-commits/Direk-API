/**
 * Middleware — vérifie le header Authorization: Bearer ADMIN_SECRET
 */
function requireAdmin(req, res, next) {
  const adminSecret = process.env.ADMIN_SECRET;
  if (!adminSecret) {
    return res.status(500).json({ ok: false, error: 'ADMIN_SECRET non configuré.' });
  }
  const auth = req.headers['authorization'] || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token || token !== adminSecret) {
    return res.status(403).json({ ok: false, error: 'Accès refusé.' });
  }
  next();
}

module.exports = requireAdmin;
