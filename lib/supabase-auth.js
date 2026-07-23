/**
 * Crée un client Supabase Auth (anon key + PKCE) avec stockage dans la session Express.
 * Utilisé uniquement pour les flux OAuth (Google).
 * Le client service role (lib/supabase.js) gère toutes les opérations DB.
 */
const { createClient } = require('@supabase/supabase-js');
const ws = require('ws');

function createAuthClient(session) {
  const rawUrl = process.env.SUPABASE_URL || '';
  const url = rawUrl ? (() => {
    try { const u = new URL(rawUrl); return `${u.protocol}//${u.host}`; }
    catch { return rawUrl.replace(/\/$/, ''); }
  })() : '';
  const key = process.env.SUPABASE_ANON_KEY;

  if (!url || !key) return null;

  return createClient(url, key, {
    auth: {
      flowType: 'pkce',
      persistSession: false,
      storage: {
        getItem:    (k) => session[`_sb_${k}`] ?? null,
        setItem:    (k, v) => { session[`_sb_${k}`] = v; },
        removeItem: (k) => { delete session[`_sb_${k}`]; },
      },
    },
    realtime: { transport: ws },
  });
}

module.exports = { createAuthClient };
