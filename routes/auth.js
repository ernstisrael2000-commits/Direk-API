/**
 * routes/auth.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Authentification : inscription, connexion, Google OAuth (PKCE), logout.
 *
 * Sécurité appliquée (OWASP Top 10) :
 *   A01 — Access Control  : session régénérée après login (anti-fixation)
 *   A02 — Crypto          : bcrypt coût 14 (adaptatif, OWASP-compliant)
 *   A03 — Injection       : validation stricte de chaque champ entrant
 *   A04 — Insecure Design : architecture deny-by-default
 *   A07 — Auth Failures   : brute-force bloqué par IP + email, messages neutres
 *   A09 — Logging         : toutes les tentatives et erreurs sont tracées
 */

'use strict';

const express  = require('express');
const bcrypt   = require('bcrypt');
const crypto   = require('crypto');
const supabase = require('../lib/supabase');
const { createAuthClient } = require('../lib/supabase-auth');
const requireAuth    = require('../middleware/requireAuth');
const { validateEmail, validatePassword, validateNom, validateTelephone } = require('../lib/validate');
const { recordFailure, checkBlocked, resetAttempts } = require('../lib/loginAttempts');

const router = express.Router();

// ─── Constantes ───────────────────────────────────────────────────────────────

/**
 * Coût bcrypt pour les mots de passe utilisateur.
 * Valeur 14 = ~0.5 s sur un CPU moderne → résistance aux attaques dictionnaire.
 * Augmenter à 15 ou 16 si le matériel le permet (viser ~500 ms – 1 s).
 * OWASP recommande minimum 10 ; 14 est conservateur et production-grade.
 */
const PASSWORD_BCRYPT_COST = 14;

/**
 * Coût bcrypt pour les clés API (générées aléatoirement, donc moins critiques
 * que les mots de passe humains, mais on garde 12 pour la sécurité).
 */
const API_KEY_BCRYPT_COST = 12;

// ─── Utilitaire : générer une clé API ─────────────────────────────────────────
/**
 * Génère une clé API sécurisée avec :
 *   - préfixe `dk_live_` pour identification visuelle rapide
 *   - 32 octets aléatoires (cryptographiquement sûrs) = 256 bits d'entropie
 *   - préfixe de lookup stocké en clair pour un accès O(1) (voir requireApiKey)
 * @returns {{ apiKey: string, apiKeyPrefix: string }}
 */
function generateApiKey() {
  const raw = crypto.randomBytes(32).toString('hex');
  const apiKey = `dk_live_${raw}`;
  // Les 12 premiers chars après "dk_live_" servent de clé de lookup en DB
  const apiKeyPrefix = raw.slice(0, 12);
  return { apiKey, apiKeyPrefix };
}

// ─── Utilitaire : extraction IP réelle ────────────────────────────────────────
function getClientIp(req) {
  return (
    (req.headers['x-forwarded-for'] || '').split(',')[0].trim() ||
    req.socket?.remoteAddress ||
    'unknown'
  );
}

// ─── POST /api/v1/auth/register ───────────────────────────────────────────────
router.post('/register', async (req, res) => {
  if (!supabase) {
    return res.status(503).json({ ok: false, error: 'Base de données non configurée.' });
  }

  // ── 1. Validation stricte de chaque champ ────────────────────────────────
  const emailResult = validateEmail(req.body.email);
  if (!emailResult.ok) {
    return res.status(400).json({ ok: false, error: emailResult.error });
  }

  const nomResult = validateNom(req.body.nom);
  if (!nomResult.ok) {
    return res.status(400).json({ ok: false, error: nomResult.error });
  }

  const passwordResult = validatePassword(req.body.password);
  if (!passwordResult.ok) {
    return res.status(400).json({ ok: false, error: passwordResult.error });
  }

  const telResult = validateTelephone(req.body.telephone);
  if (!telResult.ok) {
    return res.status(400).json({ ok: false, error: telResult.error });
  }

  const email    = emailResult.value;
  const nom      = nomResult.value;
  const password = req.body.password; // valeur brute — hachée ci-dessous, jamais loguée
  const telephone = telResult.value;

  // ── 2. Unicité de l'email (contrainte DB + vérification applicative) ──────
  // Utilise une requête paramétrée Supabase (pas de concaténation SQL).
  const { data: existing } = await supabase
    .from('resellers')
    .select('id')
    .eq('email', email)
    .maybeSingle();

  if (existing) {
    // Message neutre : ne révèle pas si le compte existe (OWASP A07)
    // Mais ici, l'email étant le login, on peut indiquer l'unicité sans risque.
    return res.status(409).json({ ok: false, error: 'Cet email est déjà associé à un compte.' });
  }

  // ── 3. Hachage adaptatif du mot de passe ─────────────────────────────────
  // bcrypt coût 14 ≈ 2^14 itérations ≈ ~0.5 s : résistant aux GPU/ASIC.
  // La valeur est recalculée à chaque connexion — si on augmente le coût
  // plus tard, les anciens hashes restent valides, seuls les nouveaux
  // logins bénéficieront du coût supérieur (migration transparente).
  const passwordHash = await bcrypt.hash(password, PASSWORD_BCRYPT_COST);

  // ── 4. Génération de la clé API ───────────────────────────────────────────
  const { apiKey, apiKeyPrefix } = generateApiKey();
  const apiKeyHash = await bcrypt.hash(apiKey, API_KEY_BCRYPT_COST);

  // ── 5. Insertion en base ──────────────────────────────────────────────────
  const { data: reseller, error } = await supabase
    .from('resellers')
    .insert({
      nom,
      email,
      telephone,
      password_hash:  passwordHash,
      api_key_hash:   apiKeyHash,
      api_key_prefix: apiKeyPrefix,   // stocké en clair pour lookup O(1)
      balance: 0,
      status:  'actif',
    })
    .select('id, nom, email')
    .single();

  if (error) {
    console.error('[register] Erreur insertion:', error.message);
    // Capturer les doublons au niveau DB (contrainte UNIQUE sur email)
    if (error.code === '23505') {
      return res.status(409).json({ ok: false, error: 'Cet email est déjà associé à un compte.' });
    }
    return res.status(500).json({ ok: false, error: 'Erreur lors de la création du compte.' });
  }

  // ── 6. Session : régénération de l'ID (anti-fixation) ────────────────────
  // OWASP A07 : après authentification réussie, le session ID doit changer.
  req.session.regenerate((err) => {
    if (err) {
      console.error('[register] session.regenerate:', err);
      return res.status(500).json({ ok: false, error: 'Erreur de session.' });
    }
    req.session.resellerId  = reseller.id;
    req.session.resellerNom = reseller.nom;

    console.info(`[register] Nouveau compte : ${email} (id=${reseller.id})`);

    // La clé API n'est retournée qu'UNE SEULE FOIS — le client doit la sauvegarder.
    return res.status(201).json({
      ok:      true,
      reseller: { id: reseller.id, nom: reseller.nom, email: reseller.email },
      apiKey,  // valeur brute, une seule fois
    });
  });
});

// ─── POST /api/v1/auth/login ──────────────────────────────────────────────────
router.post('/login', async (req, res) => {
  if (!supabase) {
    return res.status(503).json({ ok: false, error: 'Base de données non configurée.' });
  }

  const ip = getClientIp(req);

  // ── 1. Validation des entrées ─────────────────────────────────────────────
  const emailResult = validateEmail(req.body.email);
  if (!emailResult.ok) {
    // Pas de brute-force enregistré ici : l'email est clairement malformé.
    return res.status(400).json({ ok: false, error: emailResult.error });
  }
  if (typeof req.body.password !== 'string' || req.body.password.length === 0) {
    return res.status(400).json({ ok: false, error: 'Mot de passe requis.' });
  }
  // Tronquer le mot de passe avant bcrypt (protection DoS : bcrypt = O(2^cost * length))
  const password = req.body.password.slice(0, 128);
  const email    = emailResult.value;

  // ── 2. Vérification brute-force ───────────────────────────────────────────
  const { blocked, remainingMs } = checkBlocked(ip, email);
  if (blocked) {
    const minutes = Math.ceil(remainingMs / 60000);
    console.warn(`[login] Tentative bloquée — ip=${ip} email=${email}`);
    return res.status(429).json({
      ok:    false,
      error: `Trop de tentatives échouées. Réessayez dans ${minutes} minute(s).`,
    });
  }

  // ── 3. Récupération du compte (requête paramétrée) ────────────────────────
  const { data: reseller, error } = await supabase
    .from('resellers')
    .select('id, nom, email, password_hash, status')
    .eq('email', email)
    .maybeSingle();

  // Erreur DB distincte d'un compte introuvable : retourner 500 et loguer.
  // Ne pas laisser une panne Supabase se masquer en "identifiants incorrects".
  if (error && error.code !== 'PGRST116') {
    console.error('[login] Erreur Supabase:', error.message);
    return res.status(500).json({ ok: false, error: 'Erreur interne. Réessayez dans un moment.' });
  }

  // ── 4. Vérification du mot de passe ──────────────────────────────────────
  // On effectue TOUJOURS le bcrypt.compare, même si le compte n'existe pas,
  // pour éviter les attaques temporelles (timing attacks) qui révèlent
  // si un email est enregistré ou non.
  const DUMMY_HASH = '$2b$14$dummy.hash.to.prevent.timing.attack.leaking.email.existence';
  const hashToCompare = reseller?.password_hash || DUMMY_HASH;
  const passwordOk    = await bcrypt.compare(password, hashToCompare);

  if (!reseller || !passwordOk) {
    const { blocked: nowBlocked, remainingMs: rem } = recordFailure(ip, email);
    console.warn(`[login] Échec — ip=${ip} email=${email} raison=${!reseller ? 'compte_inexistant' : 'mauvais_mdp'}`);

    if (nowBlocked) {
      const minutes = Math.ceil(rem / 60000);
      return res.status(429).json({
        ok:    false,
        error: `Compte temporairement verrouillé après plusieurs tentatives. Réessayez dans ${minutes} minute(s).`,
      });
    }

    // Message identique dans les deux cas (OWASP A07 : ne pas révéler lequel est faux)
    return res.status(401).json({ ok: false, error: 'Email ou mot de passe incorrect.' });
  }

  if (reseller.status === 'suspendu') {
    console.warn(`[login] Compte suspendu — id=${reseller.id} email=${email}`);
    return res.status(403).json({ ok: false, error: 'Compte suspendu. Contactez le support.' });
  }

  // ── 5. Connexion réussie : réinitialiser les compteurs, régénérer la session
  resetAttempts(ip, email);

  // Régénération de l'ID de session (anti-fixation — OWASP A07)
  req.session.regenerate((err) => {
    if (err) {
      console.error('[login] session.regenerate:', err);
      return res.status(500).json({ ok: false, error: 'Erreur de session.' });
    }
    req.session.resellerId  = reseller.id;
    req.session.resellerNom = reseller.nom;

    console.info(`[login] Connexion réussie — id=${reseller.id} email=${email} ip=${ip}`);

    return res.json({
      ok:      true,
      reseller: { id: reseller.id, nom: reseller.nom, email: reseller.email },
    });
  });
});

// ─── GET /api/v1/auth/google ──────────────────────────────────────────────────
// Redirige vers Google via Supabase OAuth (PKCE côté serveur)
router.get('/google', async (req, res) => {
  const authClient = createAuthClient(req.session);
  if (!authClient) {
    return res.redirect('/login?error=supabase_non_configure');
  }

  const appUrl = process.env.APP_URL;
  let redirectTo;
  if (appUrl) {
    redirectTo = `${appUrl.replace(/\/$/, '')}/api/v1/auth/callback`;
  } else {
    const host  = req.headers['x-forwarded-host'] || req.headers.host || 'localhost:3000';
    const proto = (req.headers['x-forwarded-proto'] === 'https' || !host.includes('localhost')) ? 'https' : 'http';
    redirectTo  = `${proto}://${host}/api/v1/auth/callback`;
  }

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

  req.session.save((err) => {
    if (err) console.error('[auth/google] session.save:', err);
    res.redirect(data.url);
  });
});

// ─── GET /api/v1/auth/callback ────────────────────────────────────────────────
// Reçoit le code OAuth de Google via Supabase, crée/récupère le reseller
router.get('/callback', async (req, res) => {
  const { code, error: oauthError } = req.query;

  if (oauthError) {
    console.error('[auth/callback] OAuth error:', oauthError);
    return res.redirect('/login?error=google_refuse');
  }
  if (!code || typeof code !== 'string') {
    return res.redirect('/login?error=oauth_no_code');
  }
  if (!supabase) {
    return res.redirect('/login?error=supabase_non_configure');
  }

  const authClient = createAuthClient(req.session);
  if (!authClient) {
    return res.redirect('/login?error=supabase_non_configure');
  }

  // Échanger le code contre une session (PKCE — code_verifier dans la session)
  const { data: sessionData, error: exchangeError } = await authClient.auth.exchangeCodeForSession(code);

  if (exchangeError || !sessionData?.user) {
    console.error('[auth/callback] exchangeCodeForSession:', exchangeError?.message);
    return res.redirect('/login?error=google_exchange');
  }

  const user    = sessionData.user;
  const email   = user.email?.toLowerCase().trim();
  const googleId = user.id;

  // Vérification que l'email Google est bien vérifié
  if (!user.email_confirmed_at && !user.confirmed_at) {
    console.warn('[auth/callback] Email Google non vérifié:', email);
    return res.redirect('/login?error=email_non_verifie');
  }

  if (!email) {
    console.error('[auth/callback] Email absent du profil Google');
    return res.redirect('/login?error=google_no_email');
  }

  // Valider l'email même s'il vient de Google
  const emailCheck = validateEmail(email);
  if (!emailCheck.ok) {
    console.error('[auth/callback] Email Google invalide:', email);
    return res.redirect('/login?error=email_invalide');
  }

  const nom = (() => {
    const raw = user.user_metadata?.full_name || user.user_metadata?.name || email.split('@')[0];
    // Sanitiser le nom Google : garder uniquement les chars autorisés, tronquer à 80
    return String(raw).replace(/[^\p{L}\p{M}'\- ]/gu, '').slice(0, 80).trim() || 'Reseller';
  })();

  // Vérifier si un reseller avec cet email existe déjà
  const { data: existing } = await supabase
    .from('resellers')
    .select('id, nom, email, status, google_id')
    .eq('email', email)
    .maybeSingle();

  let resellerId;
  let resellerNom;

  if (existing) {
    if (!existing.google_id) {
      await supabase.from('resellers').update({ google_id: googleId }).eq('id', existing.id);
    }
    if (existing.status === 'suspendu') {
      return res.redirect('/login?error=compte_suspendu');
    }
    resellerId  = existing.id;
    resellerNom = existing.nom;
  } else {
    // Nouveau compte Google — générer une clé API
    const { apiKey, apiKeyPrefix } = generateApiKey();
    const apiKeyHash = await bcrypt.hash(apiKey, API_KEY_BCRYPT_COST);

    const { data: newReseller, error: insertErr } = await supabase
      .from('resellers')
      .insert({
        nom,
        email,
        google_id:      googleId,
        api_key_hash:   apiKeyHash,
        api_key_prefix: apiKeyPrefix,
        balance: 0,
        status:  'actif',
      })
      .select('id, nom')
      .single();

    if (insertErr) {
      console.error('[auth/callback] insert reseller:', insertErr.message);
      return res.redirect('/login?error=creation_compte');
    }

    resellerId  = newReseller.id;
    resellerNom = newReseller.nom;

    // Clé API stockée temporairement en session (affichée une seule fois)
    // Elle sera détruite avec la session ou à la prochaine demande
    req.session.newApiKey = apiKey;
  }

  // Régénération de l'ID de session (anti-fixation)
  req.session.regenerate((err) => {
    if (err) {
      console.error('[auth/callback] session.regenerate:', err);
      return res.redirect('/login?error=session_erreur');
    }
    req.session.resellerId  = resellerId;
    req.session.resellerNom = resellerNom;

    console.info(`[auth/callback] Google login — id=${resellerId} email=${email}`);

    req.session.save((saveErr) => {
      if (saveErr) console.error('[auth/callback] session.save:', saveErr);
      res.redirect('/');
    });
  });
});

// ─── GET /api/v1/auth/me ──────────────────────────────────────────────────────
router.get('/me', (req, res) => {
  if (req.session?.resellerId) {
    return res.json({ ok: true, resellerId: req.session.resellerId, nom: req.session.resellerNom });
  }
  return res.status(401).json({ ok: false });
});

// ─── POST /api/v1/auth/logout ─────────────────────────────────────────────────
router.post('/logout', (req, res) => {
  const id = req.session?.resellerId;
  req.session.destroy(() => {
    console.info(`[logout] Déconnexion — id=${id}`);
    res.json({ ok: true });
  });
});

// ─── POST /api/v1/auth/regenerate-key ─────────────────────────────────────────
router.post('/regenerate-key', requireAuth, async (req, res) => {
  if (!supabase) {
    return res.status(503).json({ ok: false, error: 'Base de données non configurée.' });
  }

  const { apiKey, apiKeyPrefix } = generateApiKey();
  const apiKeyHash = await bcrypt.hash(apiKey, API_KEY_BCRYPT_COST);

  const { error } = await supabase
    .from('resellers')
    .update({ api_key_hash: apiKeyHash, api_key_prefix: apiKeyPrefix })
    .eq('id', req.session.resellerId);

  if (error) {
    console.error('[regenerate-key]', error.message);
    return res.status(500).json({ ok: false, error: 'Erreur lors de la régénération.' });
  }

  console.info(`[regenerate-key] Clé régénérée — id=${req.session.resellerId}`);
  return res.json({ ok: true, apiKey });
});

module.exports = router;
