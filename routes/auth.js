const express = require('express');
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const supabase = require('../lib/supabase');
const requireAuth = require('../middleware/requireAuth');

const router = express.Router();

// ─── Utilitaire : générer une clé API ─────────────────────────────────────────
function generateApiKey() {
  return 'dk_live_' + crypto.randomBytes(32).toString('hex');
}

// ─── POST /api/v1/auth/register ───────────────────────────────────────────────
router.post('/register', async (req, res) => {
  if (!supabase) return res.status(503).json({ ok: false, error: 'Base de données non configurée.' });

  const { nom, email, telephone, password } = req.body;
  if (!nom || !email || !password) {
    return res.status(400).json({ ok: false, error: 'Nom, email et mot de passe requis.' });
  }
  if (password.length < 8) {
    return res.status(400).json({ ok: false, error: 'Le mot de passe doit faire au moins 8 caractères.' });
  }

  // Vérifier unicité email
  const { data: existing } = await supabase
    .from('resellers')
    .select('id')
    .eq('email', email.toLowerCase().trim())
    .single();

  if (existing) {
    return res.status(409).json({ ok: false, error: 'Cet email est déjà utilisé.' });
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const apiKey = generateApiKey();
  const apiKeyHash = await bcrypt.hash(apiKey, 10);

  const { data: reseller, error } = await supabase
    .from('resellers')
    .insert({
      nom: nom.trim(),
      email: email.toLowerCase().trim(),
      telephone: telephone || null,
      password_hash: passwordHash,
      api_key_hash: apiKeyHash,
      balance: 0,
      status: 'actif',
    })
    .select('id, nom, email')
    .single();

  if (error) {
    console.error('[register]', error.message);
    return res.status(500).json({ ok: false, error: 'Erreur lors de la création du compte.' });
  }

  // Démarrer la session
  req.session.resellerId = reseller.id;
  req.session.resellerNom = reseller.nom;

  // La clé API n'est renvoyée qu'une seule fois — ici
  return res.status(201).json({
    ok: true,
    reseller: { id: reseller.id, nom: reseller.nom, email: reseller.email },
    apiKey, // affiché une seule fois, puis invisible
  });
});

// ─── POST /api/v1/auth/login ──────────────────────────────────────────────────
router.post('/login', async (req, res) => {
  if (!supabase) return res.status(503).json({ ok: false, error: 'Base de données non configurée.' });

  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ ok: false, error: 'Email et mot de passe requis.' });
  }

  const { data: reseller, error } = await supabase
    .from('resellers')
    .select('id, nom, email, password_hash, status')
    .eq('email', email.toLowerCase().trim())
    .single();

  if (error || !reseller) {
    return res.status(401).json({ ok: false, error: 'Email ou mot de passe incorrect.' });
  }

  if (reseller.status === 'suspendu') {
    return res.status(403).json({ ok: false, error: 'Compte suspendu. Contactez le support.' });
  }

  const passwordOk = await bcrypt.compare(password, reseller.password_hash);
  if (!passwordOk) {
    return res.status(401).json({ ok: false, error: 'Email ou mot de passe incorrect.' });
  }

  req.session.resellerId = reseller.id;
  req.session.resellerNom = reseller.nom;

  return res.json({ ok: true, reseller: { id: reseller.id, nom: reseller.nom, email: reseller.email } });
});

// ─── POST /api/v1/auth/logout ─────────────────────────────────────────────────
router.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.json({ ok: true });
  });
});

// ─── POST /api/v1/auth/regenerate-key ─────────────────────────────────────────
router.post('/regenerate-key', requireAuth, async (req, res) => {
  if (!supabase) return res.status(503).json({ ok: false, error: 'Base de données non configurée.' });

  const apiKey = generateApiKey();
  const apiKeyHash = await bcrypt.hash(apiKey, 10);

  const { error } = await supabase
    .from('resellers')
    .update({ api_key_hash: apiKeyHash })
    .eq('id', req.session.resellerId);

  if (error) {
    console.error('[regenerate-key]', error.message);
    return res.status(500).json({ ok: false, error: 'Erreur lors de la régénération.' });
  }

  // La nouvelle clé n'est renvoyée qu'une seule fois
  return res.json({ ok: true, apiKey });
});

module.exports = router;
