const { createClient } = require('@supabase/supabase-js');
const ws = require('ws');

// Normalise l'URL : retire tout chemin après le domaine (ex: /rest/v1/ ajouté par erreur)
const rawUrl = process.env.SUPABASE_URL || '';
const supabaseUrl = rawUrl ? (() => {
  try {
    const u = new URL(rawUrl);
    return `${u.protocol}//${u.host}`;
  } catch { return rawUrl.replace(/\/$/, ''); }
})() : '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.warn('[Supabase] SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY manquant — base de données non connectée.');
}

const supabase = supabaseUrl && supabaseKey
  ? createClient(supabaseUrl, supabaseKey, {
      auth: { persistSession: false },
      realtime: { transport: ws },
    })
  : null;

module.exports = supabase;
