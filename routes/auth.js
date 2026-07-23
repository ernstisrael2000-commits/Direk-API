const express = require('express');
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const supabase = require('../lib/supabase');
const { createAuthClient } = require('../lib/supabase-auth');
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

// ─── GET /api/v1/auth/google ──────────────────────────────────────────────────
// Redirige vers Google via Supabase OAuth (PKCE côté serveur)
router.get('/google', async (req, res) => {
  const authClient = createAuthClient(req.session);
  if (!authClient) {
    return res.redirect('/login?error=supabase_non_configure');
  }

  const host = req.headers['x-forwarded-host'] || req.headers.host || process.env.REPLIT_DEV_DOMAIN;
  const proto = host.includes('localhost') ? 'http' : 'https';
  const redirectTo = `${proto}://${host}/api/v1/auth/callback`;

  const { data, error } = await authClient.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo,
      scopes: 'email profile',
      queryParams: { access_type: 'offline', prompt: 'select_account' },
      skipBrowserRedirect: true,
    },
  });

  if (error || !data?.url) {
    console.error('[auth/google]', error?.message);
    return res.redirect('/login?error=google_oauth');
  }

  // Sauvegarder la session pour persister le code_verifier PKCE
  req.session.save((err) => {
    if (err) console.error('[auth/google] session.save:', err);
    res.redirect(data.url);
  });
});

// ─── GET /api/v1/auth/callback ────────────────────────────────────────────────
// Reçoit le code OAuth de Supabase, crée/récupère le reseller, ouvre la session
router.get('/callback', async (req, res) => {
  const { code, error: oauthError } = req.query;

  if (oauthError) {
    console.error('[auth/callback] OAuth error:', oauthError);
    return res.redirect('/login?error=google_refuse');
  }
  if (!code) {
    return res.redirect('/login?error=oauth_no_code');
  }
  if (!supabase) {
    return res.redirect('/login?error=supabase_non_configure');
  }

  const authClient = createAuthClient(req.session);
  if (!authClient) {
    return res.redirect('/login?error=supabase_non_configure');
  }

  // Échanger le code contre une session (PKCE — le code_verifier est dans la session)
  const { data: sessionData, error: exchangeError } = await authClient.auth.exchangeCodeForSession(code);

  if (exchangeError || !sessionData?.user) {
    console.error('[auth/callback] exchangeCodeForSession:', exchangeError?.message);
    return res.redirect('/login?error=google_exchange');
  }

  const user = sessionData.user;
  const email = user.email?.toLowerCase().trim();
  const nom = user.user_metadata?.full_name
    || user.user_metadata?.name
    || email?.split('@')[0]
    || 'Reseller';
  const googleId = user.id; // ID Supabase Auth unique par provider

  // Vérifier si un reseller avec cet email existe déjà
  const { data: existing } = await supabase
    .from('resellers')
    .select('id, nom, email, status, google_id')
    .eq('email', email)
    .single();

  let resellerId;
  let resellerNom;

  if (existing) {
    // Compte existant — mettre à jour google_id si pas encore fait
    if (!existing.google_id) {
      await supabase.from('resellers').update({ google_id: googleId }).eq('id', existing.id);
    }
    if (existing.status === 'suspendu') {
      return res.redirect('/login?error=compte_suspendu');
    }
    resellerId = existing.id;
    resellerNom = existing.nom;
  } else {
    // Nouveau compte — créer avec une clé API
    const apiKey = generateApiKey();
    const apiKeyHash = await bcrypt.hash(apiKey, 10);

    const { data: newReseller, error: insertErr } = await supabase
      .from('resellers')
      .insert({
        nom,
        email,
        google_id: googleId,
        api_key_hash: apiKeyHash,
        balance: 0,
        status: 'actif',
      })
      .select('id, nom')
      .single();

    if (insertErr) {
      console.error('[auth/callback] insert reseller:', insertErr.message);
      return res.redirect('/login?error=creation_compte');
    }

    resellerId = newReseller.id;
    resellerNom = newReseller.nom;

    // Stocker temporairement la clé API dans la session (affichée une seule fois)
    req.session.newApiKey = apiKey;
  }

  req.session.resellerId = resellerId;
  req.session.resellerNom = resellerNom;

  req.session.save((err) => {
    if (err) console.error('[auth/callback] session.save:', err);
    res.redirect('/');
  });
});

// ─── GET /api/v1/auth/me ──────────────────────────────────────────────────────
// Vérifie la session courante (utilisé par le frontend au chargement)
router.get('/me', (req, res) => {
  if (req.session && req.session.resellerId) {
    return res.json({ ok: true, resellerId: req.session.resellerId, nom: req.session.resellerNom });
  }
  return res.status(401).json({ ok: false });
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
