/* AirCover Manager — Firebase (Firestore + Storage) */

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getFirestore, collection, doc, getDoc, getDocs, addDoc, setDoc, deleteDoc, query, where,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import {
  getStorage, ref, uploadBytes, getDownloadURL,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";
import {
  getAuth, onAuthStateChanged, signOut,
  createUserWithEmailAndPassword, signInWithEmailAndPassword, sendPasswordResetEmail,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyClWz2WINX3tgbgivkhh3osJKDXmp8Df64",
  authDomain: "aircover-manager.firebaseapp.com",
  projectId: "aircover-manager",
  storageBucket: "aircover-manager.firebasestorage.app",
  messagingSenderId: "1044378959875",
  appId: "1:1044378959875:web:16187e0c42899738920e36",
};

const firebaseApp = initializeApp(firebaseConfig);
export const db = getFirestore(firebaseApp);
export const storage = getStorage(firebaseApp);
export const auth = getAuth(firebaseApp);

export const DELAI_JOURS = 14;

/* ---------- Authentification ---------- */

/* Résout la promesse avec l'utilisateur connecté, ou redirige vers login.html sinon.
   À appeler en tout début de script sur chaque page protégée. */
export function requireAuth() {
  return new Promise((resolve) => {
    onAuthStateChanged(auth, (user) => {
      if (!user) {
        location.href = '/login.html';
        return;
      }
      resolve(user);
    });
  });
}

export async function logout() {
  await signOut(auth);
  location.href = '/login.html';
}

export async function signup(email, password) {
  const cleanEmail = email.trim().toLowerCase();
  const cred = await createUserWithEmailAndPassword(auth, cleanEmail, password);
  await setDoc(doc(db, 'accounts', cred.user.uid), { email: cleanEmail, collaboratorUids: [] });
  return cred.user;
}

export async function login(email, password) {
  const cred = await signInWithEmailAndPassword(auth, email.trim().toLowerCase(), password);
  return cred.user;
}

export async function resetPassword(email) {
  await sendPasswordResetEmail(auth, email.trim().toLowerCase());
}

async function getAccount(uid) {
  const snap = await getDoc(doc(db, 'accounts', uid));
  return snap.exists() ? snap.data() : { email: '', collaboratorUids: [] };
}

/* uid du compte courant + ses collaborateurs : sert à filtrer les listes (aircovers,
   appartements, contacts) pour n'afficher que l'espace privé + les espaces partagés. */
async function myAccessibleUids() {
  const uid = auth.currentUser.uid;
  const account = await getAccount(uid);
  return [uid, ...(account.collaboratorUids || [])];
}

/* ---------- Collaboration (invitations) ---------- */

export async function createInvite(toEmail) {
  const user = auth.currentUser;
  await addDoc(collection(db, 'invites'), {
    fromUid: user.uid,
    fromEmail: user.email,
    toEmail: toEmail.trim().toLowerCase(),
    status: 'pending',
    createdAt: new Date().toISOString(),
  });
}

export async function loadSentInvites() {
  const user = auth.currentUser;
  const snap = await getDocs(query(collection(db, 'invites'), where('fromEmail', '==', user.email)));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function loadReceivedInvites() {
  const user = auth.currentUser;
  const snap = await getDocs(query(collection(db, 'invites'), where('toEmail', '==', user.email)));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

/* L'acceptation n'écrit que sur le compte de l'utilisateur courant (règles Firestore :
   chacun ne peut modifier que son propre compte). Le lien de collaboration est
   symétrique par construction des règles de sécurité (voir firestore.rules, fonction
   `linked`) : inutile d'écrire aussi sur le compte de l'invitant. */
export async function acceptInvite(inviteId) {
  const user = auth.currentUser;
  const inviteSnap = await getDoc(doc(db, 'invites', inviteId));
  if (!inviteSnap.exists()) return;
  const invite = inviteSnap.data();
  if (invite.toEmail !== user.email.toLowerCase() || invite.status !== 'pending') return;

  const account = await getAccount(user.uid);
  const collaboratorUids = Array.from(new Set([...(account.collaboratorUids || []), invite.fromUid]));
  await setDoc(doc(db, 'accounts', user.uid), { email: user.email, collaboratorUids }, { merge: true });
  await setDoc(doc(db, 'invites', inviteId), { status: 'accepted' }, { merge: true });
}

export async function declineInvite(inviteId) {
  await setDoc(doc(db, 'invites', inviteId), { status: 'declined' }, { merge: true });
}

/* Rend le site installable en PWA (icône d'accueil sur mobile). */
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

/* ---------- Consentement cookies (RGPD/CNIL) ---------- */

/* À renseigner une fois la propriété GA4 créée dans Google Analytics
   (format "G-XXXXXXXXXX"). Tant que c'est vide, rien n'est chargé même
   si le consentement a été donné. */
const GA_MEASUREMENT_ID = '';

function loadAnalytics() {
  if (!GA_MEASUREMENT_ID || document.getElementById('ga-script')) return;
  const script = document.createElement('script');
  script.id = 'ga-script';
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`;
  document.head.appendChild(script);
  window.dataLayer = window.dataLayer || [];
  function gtag() { window.dataLayer.push(arguments); }
  window.gtag = gtag;
  gtag('js', new Date());
  gtag('config', GA_MEASUREMENT_ID);
}

function initCookieConsent() {
  const consent = localStorage.getItem('cookieConsent');
  if (consent === 'accepted') {
    loadAnalytics();
    return;
  }
  if (consent === 'declined') return;

  const banner = document.createElement('div');
  banner.className = 'cookie-banner';
  banner.innerHTML = `
    <p>Ce site utilise des cookies de mesure d'audience (Google Analytics) pour comprendre son usage. Tu peux accepter ou refuser.</p>
    <div class="cookie-banner-actions">
      <button type="button" class="btn btn-ghost" id="cookie-decline">Refuser</button>
      <button type="button" class="btn btn-primary" id="cookie-accept">Accepter</button>
    </div>
  `;
  document.body.appendChild(banner);

  document.getElementById('cookie-accept').addEventListener('click', () => {
    localStorage.setItem('cookieConsent', 'accepted');
    loadAnalytics();
    banner.remove();
  });
  document.getElementById('cookie-decline').addEventListener('click', () => {
    localStorage.setItem('cookieConsent', 'declined');
    banner.remove();
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initCookieConsent);
} else {
  initCookieConsent();
}

/* ---------- Utilitaires dates ---------- */

/* Formate une Date en "YYYY-MM-DD" à partir de ses composantes locales.
   Ne surtout pas utiliser toISOString() ici : elle convertit en UTC, ce qui
   décale la date d'un jour dans les fuseaux en avance sur UTC (ex: Paris l'été). */
function toLocalISODate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function todayISO() {
  return toLocalISODate(new Date());
}

export function addDays(dateISO, days) {
  const d = new Date(dateISO + 'T00:00:00');
  d.setDate(d.getDate() + days);
  return toLocalISODate(d);
}

export function daysBetween(fromISO, toISO) {
  const a = new Date(fromISO + 'T00:00:00');
  const b = new Date(toISO + 'T00:00:00');
  return Math.round((b - a) / 86400000);
}

export function formatDateFR(dateISO) {
  if (!dateISO) return '—';
  const d = new Date(dateISO + 'T00:00:00');
  return d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

export function formatDateShort(dateISO) {
  if (!dateISO) return '—';
  const d = new Date(dateISO + 'T00:00:00');
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export function formatPrice(n) {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(n);
}

export function initials(name) {
  return name.split(' ').filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join('');
}

/* ---------- Statut ---------- */

export function getStatus(item) {
  if (item.statutTermine) return { key: 'done', label: 'Terminé' };
  if (item.aircoverFait) return { key: 'waiting', label: 'En attente' };
  const diff = daysBetween(todayISO(), item.dateAircover);
  if (diff < 0) return { key: 'late', label: `En retard (${-diff} j)` };
  if (diff === 0) return { key: 'today', label: "À faire aujourd'hui" };
  return { key: 'upcoming', label: `Dans ${diff} j` };
}

/* Marque l'AirCover comme déposé sur Airbnb : passe en "En attente" du versement
   jusqu'à ce que le montant perçu soit renseigné (voir saveEdit dans detail.html). */
export async function markAircoverFait(id) {
  await updateItem(id, { aircoverFait: true, aircoverFaitLe: todayISO() });
}

/* Clôturé sans confirmation d'envoi sur un canal qui aurait dû fonctionner.
   Email et SMS sont désormais envoyés à l'équipe (Edouard + Christopher), plus
   l'email en copie à l'entreprise — indépendamment du propriétaire assigné à
   la tâche. Le SMS n'est tenté que pour les comptes autorisés (voir
   functions/index.js) ; pour les autres, smsEnvoye reste à false sans que ce
   soit un échec, mais tous les comptes utilisés aujourd'hui sont autorisés. */
export function reminderFailures(item) {
  if (!item.statutTermine) return [];
  const failures = [];
  if (!item.reminderEnvoye) failures.push('email');
  if (!item.smsEnvoye) failures.push('sms');
  return failures;
}

export function reminderFailed(item) {
  return reminderFailures(item).length > 0;
}

/* ---------- Firestore : utilisateurs (propriétaires de tâche) ---------- */

export async function loadUsers() {
  const uids = await myAccessibleUids();
  const snap = await getDocs(query(collection(db, 'users'), where('ownerUid', 'in', uids)));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function addUser(nom, email, telephone) {
  const users = await loadUsers();
  const existing = users.find(u => u.email.toLowerCase() === email.toLowerCase());
  if (existing) {
    const changes = {};
    if (nom) changes.nom = nom;
    if (telephone !== undefined) changes.telephone = telephone;
    if (Object.keys(changes).length) {
      await setDoc(doc(db, 'users', existing.id), changes, { merge: true });
    }
    return { ...existing, ...changes };
  }
  const docRef = await addDoc(collection(db, 'users'), { nom, email, telephone: telephone || '', ownerUid: auth.currentUser.uid });
  return { id: docRef.id, nom, email, telephone: telephone || '' };
}

export async function updateUser(id, data) {
  await setDoc(doc(db, 'users', id), data, { merge: true });
}

export async function deleteUser(id) {
  await deleteDoc(doc(db, 'users', id));
}

/* ---------- Firestore : appartements ---------- */

export async function loadApartments() {
  const uids = await myAccessibleUids();
  const snap = await getDocs(query(collection(db, 'apartments'), where('ownerUid', 'in', uids)));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function addApartment(nom) {
  const apartments = await loadApartments();
  const existing = apartments.find(a => a.nom.toLowerCase() === nom.toLowerCase());
  if (existing) return existing;
  const docRef = await addDoc(collection(db, 'apartments'), { nom, ownerUid: auth.currentUser.uid });
  return { id: docRef.id, nom };
}

export async function updateApartment(id, data) {
  await setDoc(doc(db, 'apartments', id), data, { merge: true });
}

export async function deleteApartment(id) {
  await deleteDoc(doc(db, 'apartments', id));
}

/* ---------- Firestore : aircovers ---------- */

export async function loadItems() {
  const uids = await myAccessibleUids();
  const snap = await getDocs(query(collection(db, 'aircovers'), where('ownerUid', 'in', uids)));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function getItem(id) {
  try {
    const snap = await getDoc(doc(db, 'aircovers', id));
    if (!snap.exists()) return null;
    return { id: snap.id, ...snap.data() };
  } catch (err) {
    if (err.code === 'permission-denied') return null;
    throw err;
  }
}

export async function createItem(data) {
  const docRef = await addDoc(collection(db, 'aircovers'), { ...data, ownerUid: auth.currentUser.uid });
  return docRef.id;
}

export async function updateItem(id, data) {
  await setDoc(doc(db, 'aircovers', id), data, { merge: true });
}

export async function deleteItem(id) {
  await deleteDoc(doc(db, 'aircovers', id));
}

/* ---------- Storage : pièces jointes ---------- */

export async function uploadAttachment(itemId, file) {
  const path = `aircovers/${itemId}/${Date.now()}_${file.name}`;
  const fileRef = ref(storage, path);
  await uploadBytes(fileRef, file);
  const url = await getDownloadURL(fileRef);
  return { name: file.name, url, isImage: file.type.startsWith('image/'), path };
}

/* ---------- Lightbox pièce jointe (plein écran + téléchargement) ---------- */

async function downloadAttachment(url, name) {
  try {
    const res = await fetch(url);
    const blob = await res.blob();
    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(blobUrl);
  } catch (err) {
    window.open(url, '_blank');
  }
}

export function openLightbox({ url, name, isImage }) {
  const safeName = document.createElement('div');
  safeName.textContent = name;
  const escapedName = safeName.innerHTML;

  const overlay = document.createElement('div');
  overlay.className = 'lightbox-overlay';
  overlay.innerHTML = `
    <div class="lightbox-toolbar">
      <span class="lightbox-name">${escapedName}</span>
      <div class="lightbox-actions">
        <button type="button" class="lightbox-btn" data-action="download">⬇️ Télécharger</button>
        <button type="button" class="lightbox-btn" data-action="close">✕</button>
      </div>
    </div>
    <div class="lightbox-body">
      ${isImage
        ? `<img class="lightbox-img" src="${url}" alt="${escapedName}">`
        : `<div class="lightbox-file-card"><div class="lightbox-file-icon">📄</div><div>${escapedName}</div></div>`}
    </div>
  `;
  document.body.appendChild(overlay);
  document.body.style.overflow = 'hidden';

  function close() {
    overlay.remove();
    document.body.style.overflow = '';
    document.removeEventListener('keydown', onKey);
  }

  function onKey(e) {
    if (e.key === 'Escape') close();
  }

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay || e.target.closest('[data-action="close"]')) close();
    if (e.target.closest('[data-action="download"]')) downloadAttachment(url, name);
  });
  document.addEventListener('keydown', onKey);
}

/* ---------- Contenu de l'email simulé ---------- */

/* Doit rester synchronisé avec TEAM_NOTIFY / COPY_RECIPIENT dans functions/index.js
   (équipe restreinte à Edouard + Christopher pour le moment). */
const TEAM_EMAILS = ['edtoulet@gmail.com', 'christopher.malmezac@gmail.com'];
const COPY_RECIPIENT = 'contact@ec-immo.fr';

export function buildEmailContent(item) {
  const blocks = [];
  blocks.push(`À : ${TEAM_EMAILS.join(', ')}`);
  blocks.push(`Cc : ${COPY_RECIPIENT}`);
  blocks.push(`Objet : Rappel — AirCover à déposer aujourd'hui : ${item.titre}`);
  blocks.push(`Bonjour,`);
  blocks.push(`C'est le jour J : le délai de ${DELAI_JOURS} jours après le départ du locataire arrive à échéance. Voici les informations à reporter dans la demande AirCover sur Airbnb :`);
  blocks.push(
    [
      `Titre : ${item.titre}`,
      `Assigné à : ${item.proprietaire.nom} (${item.proprietaire.email})`,
      `Appartement concerné : ${item.appartement || '—'}`,
      `Locataire concerné : ${item.locataire}`,
      `Date de départ du locataire : ${formatDateShort(item.dateDepart)}`,
      `Jour limite pour faire l'AirCover : ${formatDateShort(item.dateAircover)}`,
      `Montant demandé : ${formatPrice(item.prix)}`,
    ].join('\n')
  );
  blocks.push(`Description du problème :\n${item.description || '(aucune description)'}`);
  if (item.details) {
    blocks.push(`Détails complémentaires :\n${item.details}`);
  }
  blocks.push(
    item.pieceJointes.length
      ? `Pièces jointes à utiliser (${item.pieceJointes.length}) :\n` + item.pieceJointes.map(p => '- ' + p.name).join('\n')
      : 'Pièces jointes : aucune'
  );
  blocks.push(`Merci de soumettre la demande AirCover aujourd'hui même, avant la fin de la fenêtre autorisée par Airbnb.`);
  return blocks.join('\n\n');
}
