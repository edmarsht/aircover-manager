/* AirCover Manager — Firebase (Firestore + Storage) */

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getFirestore, collection, doc, getDoc, getDocs, addDoc, setDoc, deleteDoc,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import {
  getStorage, ref, uploadBytes, getDownloadURL,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";

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

export const DELAI_JOURS = 14;

/* Rend le site installable en PWA (icône d'accueil sur mobile). */
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

/* ---------- Utilitaires dates ---------- */

export function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export function addDays(dateISO, days) {
  const d = new Date(dateISO + 'T00:00:00');
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
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
  const diff = daysBetween(todayISO(), item.dateAircover);
  if (diff < 0) return { key: 'done', label: 'Terminé' };
  if (diff === 0) return { key: 'today', label: "À faire aujourd'hui" };
  return { key: 'upcoming', label: `Dans ${diff} j` };
}

/* Clôturé sans qu'aucun des deux canaux de rappel n'ait confirmé un envoi
   réussi : le pire scénario vu l'objectif de l'outil, à signaler clairement. */
export function reminderFailed(item) {
  return !!item.statutTermine && !item.reminderEnvoye && !item.smsEnvoye;
}

/* Un AirCover non traité au-delà du jour J bascule automatiquement en "Terminé" :
   passé ce délai, Airbnb ne permet plus de le déposer, donc le suivre comme "en retard" n'a plus d'utilité. */
async function maybeAutoClose(item) {
  if (!item.statutTermine && daysBetween(todayISO(), item.dateAircover) < 0) {
    item.statutTermine = true;
    await updateItem(item.id, { statutTermine: true });
  }
  return item;
}

/* ---------- Firestore : utilisateurs (propriétaires de tâche) ---------- */

export async function loadUsers() {
  const snap = await getDocs(collection(db, 'users'));
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
  const docRef = await addDoc(collection(db, 'users'), { nom, email, telephone: telephone || '' });
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
  const snap = await getDocs(collection(db, 'apartments'));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function addApartment(nom) {
  const apartments = await loadApartments();
  const existing = apartments.find(a => a.nom.toLowerCase() === nom.toLowerCase());
  if (existing) return existing;
  const docRef = await addDoc(collection(db, 'apartments'), { nom });
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
  const snap = await getDocs(collection(db, 'aircovers'));
  const items = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  await Promise.all(items.map(maybeAutoClose));
  return items;
}

export async function getItem(id) {
  const snap = await getDoc(doc(db, 'aircovers', id));
  if (!snap.exists()) return null;
  return maybeAutoClose({ id: snap.id, ...snap.data() });
}

export async function createItem(data) {
  const docRef = await addDoc(collection(db, 'aircovers'), data);
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

export function buildEmailContent(item) {
  const blocks = [];
  blocks.push(`À : ${item.proprietaire.email}`);
  blocks.push(`Objet : Rappel — AirCover à déposer aujourd'hui : ${item.titre}`);
  blocks.push(`Bonjour ${item.proprietaire.nom},`);
  blocks.push(`C'est le jour J : le délai de ${DELAI_JOURS} jours après le départ du locataire arrive à échéance. Voici les informations à reporter dans la demande AirCover sur Airbnb :`);
  blocks.push(
    [
      `Titre : ${item.titre}`,
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
