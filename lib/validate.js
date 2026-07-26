/**
 * lib/validate.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Validation et sanitisation centralisées de toutes les entrées utilisateur.
 *
 * OWASP A03 : Injection — valider type, format, longueur, caractères autorisés.
 * OWASP A07 : Authentication Failures — complexité mot de passe stricte.
 *
 * Règle fondamentale : NE JAMAIS faire confiance au client.
 * Toute donnée entrante est considérée hostile jusqu'à preuve du contraire.
 */

'use strict';

// ─── Email ────────────────────────────────────────────────────────────────────
// RFC 5321 : max 254 chars. Regex restrictive (pas de sous-domaines exotiques).
const EMAIL_RE = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*\.[a-zA-Z]{2,}$/;

/**
 * Valide et normalise un email.
 * @returns {{ ok: true, value: string } | { ok: false, error: string }}
 */
function validateEmail(raw) {
  if (typeof raw !== 'string') return { ok: false, error: 'Email invalide.' };
  const v = raw.trim().toLowerCase();
  if (v.length === 0)   return { ok: false, error: 'Email requis.' };
  if (v.length > 254)   return { ok: false, error: 'Email trop long (max 254 caractères).' };
  if (!EMAIL_RE.test(v)) return { ok: false, error: 'Format d\'email invalide.' };
  // Bloquer les points ou tirets consécutifs dans la partie locale
  const [local] = v.split('@');
  if (/\.{2,}|-{2,}/.test(local)) return { ok: false, error: 'Format d\'email invalide.' };
  return { ok: true, value: v };
}

// ─── Mot de passe ─────────────────────────────────────────────────────────────
// OWASP Authentication Cheat Sheet :
//   - min 12 chars (compromis usabilité / sécurité)
//   - au moins 1 majuscule, 1 minuscule, 1 chiffre, 1 caractère spécial
//   - max 128 chars (limite DoS sur bcrypt)
const PASSWORD_RULES = {
  minLength: 12,
  maxLength: 128,
  hasUpper:   /[A-Z]/,
  hasLower:   /[a-z]/,
  hasDigit:   /[0-9]/,
  hasSpecial: /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?`~]/,
};

/**
 * Valide un mot de passe selon les règles OWASP.
 * @returns {{ ok: true } | { ok: false, error: string }}
 */
function validatePassword(raw) {
  if (typeof raw !== 'string') return { ok: false, error: 'Mot de passe invalide.' };
  if (raw.length < PASSWORD_RULES.minLength)
    return { ok: false, error: `Le mot de passe doit faire au moins ${PASSWORD_RULES.minLength} caractères.` };
  if (raw.length > PASSWORD_RULES.maxLength)
    return { ok: false, error: `Le mot de passe ne peut pas dépasser ${PASSWORD_RULES.maxLength} caractères.` };
  if (!PASSWORD_RULES.hasUpper.test(raw))
    return { ok: false, error: 'Le mot de passe doit contenir au moins une majuscule.' };
  if (!PASSWORD_RULES.hasLower.test(raw))
    return { ok: false, error: 'Le mot de passe doit contenir au moins une minuscule.' };
  if (!PASSWORD_RULES.hasDigit.test(raw))
    return { ok: false, error: 'Le mot de passe doit contenir au moins un chiffre.' };
  if (!PASSWORD_RULES.hasSpecial.test(raw))
    return { ok: false, error: 'Le mot de passe doit contenir au moins un caractère spécial (!@#$%…).' };
  return { ok: true };
}

// ─── Nom ──────────────────────────────────────────────────────────────────────
// Autorise lettres (accents inclus), espaces, tirets, apostrophes.
// Bloque tout ce qui pourrait être du HTML/SQL/script.
const NOM_RE = /^[\p{L}\p{M}'\- ]{1,80}$/u;

/**
 * Valide et sanitise un nom de personne / entreprise.
 * @returns {{ ok: true, value: string } | { ok: false, error: string }}
 */
function validateNom(raw) {
  if (typeof raw !== 'string') return { ok: false, error: 'Nom invalide.' };
  const v = raw.trim();
  if (v.length === 0)  return { ok: false, error: 'Nom requis.' };
  if (!NOM_RE.test(v)) return { ok: false, error: 'Le nom contient des caractères non autorisés (lettres, espaces, tirets, apostrophes uniquement, max 80 chars).' };
  return { ok: true, value: v };
}

// ─── Téléphone ────────────────────────────────────────────────────────────────
// Format haïtien / international : chiffres, +, espaces, tirets. Max 20 chars.
const TEL_RE = /^\+?[\d\s\-]{7,20}$/;

/**
 * Valide un numéro de téléphone (optionnel).
 * @returns {{ ok: true, value: string|null } | { ok: false, error: string }}
 */
function validateTelephone(raw) {
  if (raw === null || raw === undefined || raw === '') return { ok: true, value: null };
  if (typeof raw !== 'string') return { ok: false, error: 'Numéro de téléphone invalide.' };
  const v = raw.trim();
  if (v.length === 0)   return { ok: true, value: null };
  if (!TEL_RE.test(v)) return { ok: false, error: 'Format de téléphone invalide (chiffres, +, tirets uniquement).' };
  return { ok: true, value: v };
}

// ─── Helpers texte générique ──────────────────────────────────────────────────

/**
 * Vérifie qu'une chaîne est bien une chaîne non vide après trim.
 */
function isNonEmptyString(val) {
  return typeof val === 'string' && val.trim().length > 0;
}

module.exports = {
  validateEmail,
  validatePassword,
  validateNom,
  validateTelephone,
  isNonEmptyString,
  PASSWORD_RULES,
};
