/* ============================================================
   TASTE — AUTH (local adapter)
   Same shape as Scene Studio's auth.js (signUp / signIn / signOut /
   currentUser) so the Directus swap later is mechanical: these
   become fetches to /auth/login and /users/register. Passwords are
   SHA-256 hashed before storage — fine for a prototype, replaced
   entirely by Directus auth in production.
   ============================================================ */

import { db, save, uid, session, setSession, profileByUser } from './db.js';

async function sha256(text) {
  const data = new TextEncoder().encode(text);
  const buf = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function signUp(name, email, password) {
  name = name.trim(); email = email.trim().toLowerCase();
  if (!name || !email.includes('@') || password.length < 6) {
    return { success: false, error: 'Name, a valid email, and a password of 6+ characters, please.' };
  }
  const d = db();
  if (d.users.some((u) => u.email === email)) {
    return { success: false, error: 'An account with that email already exists here.' };
  }
  const user = { id: uid(), email, pass: await sha256(password), name };
  d.users.push(user);
  d.profiles.push({
    id: uid(), userId: user.id, name, intro: `Work ${name} has loved:`,
    image: null, createdAt: Date.now(),
  });
  save();
  setSession(user.id);
  return { success: true };
}

export async function signIn(email, password) {
  email = email.trim().toLowerCase();
  const u = db().users.find((u) => u.email === email);
  if (!u || u.demo) return { success: false, error: 'No account found with that email.' };
  if (u.pass !== (await sha256(password))) return { success: false, error: 'Wrong password.' };
  setSession(u.id);
  return { success: true };
}

export function signOut() {
  setSession(null);
}

export function currentUser() {
  const s = session();
  if (!s) return null;
  return db().users.find((u) => u.id === s.userId) ?? null;
}

export function currentProfile() {
  const u = currentUser();
  return u ? profileByUser(u.id) : null;
}
