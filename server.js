const express = require('express');
const path = require('path');
const session = require('express-session');
const rateLimit = require('express-rate-limit');

const app = express();
const PORT = process.env.PORT || 3000;

// ─── Middleware globaux ────────────────────────────────────────────────────────
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Sessions
app.use(session({
  secret: process.env.SESSION_SECRET || 'changeme-en-prod',
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 jours
  },
}));

// ─── Rate limiting ────────────────────────────────────────────────────────────
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 min
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, error: 'Trop de requêtes. Réessayez dans quelques minutes.' },
});

const authLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 min
  max: 10,
  message: { ok: false, error: 'Trop de tentatives. Réessayez dans 1 minute.' },
});

const rechargeLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 min
  max: 60,
  message: { ok: false, error: 'Limite d\'appels API atteinte.' },
});

app.use('/api/', generalLimiter);

// ─── Routes API ───────────────────────────────────────────────────────────────
const authRoutes         = require('./routes/auth');
const dashboardRoutes    = require('./routes/dashboard');
const transactionsRoutes = require('./routes/transactions');
const walletRoutes       = require('./routes/wallet');
const rechargeRoutes     = require('./routes/recharge');   // compat legacy
const productsRoutes     = require('./routes/products');
const servicesRoutes     = require('./routes/services');
const ordersRoutes       = require('./routes/orders');
const adminRoutes        = require('./routes/admin');

app.use('/api/v1/auth',         authLimiter, authRoutes);
app.use('/api/v1/dashboard',    dashboardRoutes);
app.use('/api/v1/transactions', transactionsRoutes);
app.use('/api/v1/wallet',       walletRoutes);
app.use('/api/v1/services',     servicesRoutes);
app.use('/api/v1/orders',       rechargeLimiter, ordersRoutes);
app.use('/api/v1/recharge',     rechargeLimiter, rechargeRoutes);  // conservé pour compat
app.use('/api/v1/products',     productsRoutes);
app.use('/api/v1/admin',        adminRoutes);

// ─── Fichiers statiques ───────────────────────────────────────────────────────
app.use(express.static(path.join(__dirname, 'public')));

// ─── Routes pages frontend ────────────────────────────────────────────────────
app.get('/',           (req, res) => res.sendFile(path.join(__dirname, 'public/index.html')));
app.get('/historique', (req, res) => res.sendFile(path.join(__dirname, 'public/historique.html')));
app.get('/recharge',   (req, res) => res.sendFile(path.join(__dirname, 'public/recharge.html')));
app.get('/api-doc',    (req, res) => res.sendFile(path.join(__dirname, 'public/api-doc.html')));
app.get('/profil',     (req, res) => res.sendFile(path.join(__dirname, 'public/profil.html')));
app.get('/login',      (req, res) => res.sendFile(path.join(__dirname, 'public/login.html')));
app.get('/admin',      (req, res) => res.sendFile(path.join(__dirname, 'public/admin.html')));

// ─── Health check ─────────────────────────────────────────────────────────────
app.get('/api/health', (req, res) => res.json({ ok: true, ts: new Date().toISOString() }));

// ─── 404 API ──────────────────────────────────────────────────────────────────
app.use('/api/', (req, res) => {
  res.status(404).json({ ok: false, error: 'Endpoint introuvable.' });
});

// ─── Gestion d'erreurs globale ────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('[Erreur non gérée]', err);
  res.status(500).json({ ok: false, error: 'Erreur interne du serveur.' });
});

// ─── Démarrage ────────────────────────────────────────────────────────────────
app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Direk API — serveur démarré sur le port ${PORT}`);
  console.log(`   Supabase  : ${process.env.SUPABASE_URL ? '✅ configuré' : '⚠️  non configuré'}`);
  console.log(`   Pay'm     : ${process.env.PAYM_CLIENT_ID ? '✅ configuré' : '⚠️  non configuré'}`);
  console.log(`   FazerCards: ${process.env.FAZERCARDS_API_KEY ? '✅ configuré' : '⚠️  non configuré'}`);
});
