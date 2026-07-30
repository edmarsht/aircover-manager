/* AirCover Manager — prototype front-end (localStorage only, pas de backend) */

const USERS_KEY = 'aircover_users_v1';
const ITEMS_KEY = 'aircover_items_v1';
const DELAI_JOURS = 14;

/* ---------- Utilitaires dates ---------- */

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function addDays(dateISO, days) {
  const d = new Date(dateISO + 'T00:00:00');
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function daysBetween(fromISO, toISO) {
  const a = new Date(fromISO + 'T00:00:00');
  const b = new Date(toISO + 'T00:00:00');
  return Math.round((b - a) / 86400000);
}

function formatDateFR(dateISO) {
  if (!dateISO) return '—';
  const d = new Date(dateISO + 'T00:00:00');
  return d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

function formatDateShort(dateISO) {
  if (!dateISO) return '—';
  const d = new Date(dateISO + 'T00:00:00');
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function formatPrice(n) {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(n);
}

function initials(name) {
  return name.split(' ').filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join('');
}

function uid(prefix) {
  return prefix + '_' + Math.random().toString(36).slice(2, 9);
}

/* ---------- Statut ---------- */

function getStatus(item) {
  if (item.statutTermine) return { key: 'done', label: 'Terminé' };
  const diff = daysBetween(todayISO(), item.dateAircover);
  if (diff < 0) return { key: 'late', label: 'En retard' };
  if (diff === 0) return { key: 'today', label: "À faire aujourd'hui" };
  return { key: 'upcoming', label: `Dans ${diff} j` };
}

/* ---------- Stockage : utilisateurs (propriétaires de tâche) ---------- */

function loadUsers() {
  const raw = localStorage.getItem(USERS_KEY);
  if (raw) return JSON.parse(raw);
  const seed = [
    { id: uid('u'), nom: 'Edouard Toulet', email: 'edtoulet@gmail.com' },
    { id: uid('u'), nom: 'Camille Martin', email: 'camille.martin@example.com' },
  ];
  saveUsers(seed);
  return seed;
}

function saveUsers(users) {
  localStorage.setItem(USERS_KEY, JSON.stringify(users));
}

function addUser(nom, email) {
  const users = loadUsers();
  const existing = users.find(u => u.email.toLowerCase() === email.toLowerCase());
  if (existing) return existing;
  const user = { id: uid('u'), nom, email };
  users.push(user);
  saveUsers(users);
  return user;
}

/* ---------- Stockage : aircovers ---------- */

function loadItems() {
  const raw = localStorage.getItem(ITEMS_KEY);
  if (raw) return JSON.parse(raw);
  const seeded = seedItems();
  saveItems(seeded);
  return seeded;
}

function saveItems(items) {
  localStorage.setItem(ITEMS_KEY, JSON.stringify(items));
}

function getItem(id) {
  return loadItems().find(i => i.id === id);
}

function upsertItem(item) {
  const items = loadItems();
  const idx = items.findIndex(i => i.id === item.id);
  if (idx >= 0) items[idx] = item; else items.unshift(item);
  saveItems(items);
}

function deleteItem(id) {
  saveItems(loadItems().filter(i => i.id !== id));
}

/* ---------- Données de test ---------- */

function seedItems() {
  const users = loadUsers();
  const [edouard, camille] = users;
  const today = todayISO();

  return [
    {
      id: uid('ac'),
      titre: 'Canapé taché par le locataire',
      description: "Le locataire a laissé des taches de vin rouge sur le canapé du salon, visibles sur les photos jointes. Nettoyage professionnel nécessaire.",
      details: "Le nettoyage a été fait par pressing local, facture jointe. Le tissu est un velours clair très sensible aux taches.",
      prix: 180,
      dateDepart: addDays(today, -14),
      locataire: 'Marc Dubreuil',
      dateAircover: today,
      proprietaire: edouard,
      pieceJointes: [
        { name: 'photo-tache-canape.jpg' },
        { name: 'facture-pressing.pdf' },
      ],
      statutTermine: false,
      emailEnvoye: true,
      emailEnvoyeLe: addDays(today, -14),
      createdAt: new Date(Date.now() - 14 * 86400000).toISOString(),
    },
    {
      id: uid('ac'),
      titre: 'Télécommande climatisation perdue',
      description: "La télécommande de la climatisation du séjour a disparu après le séjour. Introuvable malgré recherche complète de l'appartement.",
      details: "Remplacement standard chez le fournisseur, référence modèle Daikin BRC1E63.",
      prix: 65,
      dateDepart: addDays(today, -20),
      locataire: 'Sophie Renard',
      dateAircover: addDays(today, -6),
      proprietaire: edouard,
      pieceJointes: [{ name: 'photo-clim.jpg' }],
      statutTermine: true,
      emailEnvoye: true,
      emailEnvoyeLe: addDays(today, -20),
      createdAt: new Date(Date.now() - 20 * 86400000).toISOString(),
    },
    {
      id: uid('ac'),
      titre: 'Rideau occultant chambre 2 déchiré',
      description: "Le rideau occultant de la deuxième chambre a été déchiré sur toute sa longueur, probablement en le fermant trop brusquement.",
      details: '',
      prix: 45,
      dateDepart: addDays(today, -8),
      locataire: 'Julien Perrot',
      dateAircover: addDays(today, 6),
      proprietaire: camille,
      pieceJointes: [],
      statutTermine: false,
      emailEnvoye: false,
      emailEnvoyeLe: null,
      createdAt: new Date(Date.now() - 8 * 86400000).toISOString(),
    },
    {
      id: uid('ac'),
      titre: 'Vaisselle manquante (4 verres, 1 assiette)',
      description: "À l'état des lieux de sortie, il manque 4 verres à pied et une assiette du service principal.",
      details: 'Service Ikea 365+, rachat facile en magasin, facture à venir.',
      prix: 28,
      dateDepart: addDays(today, -16),
      locataire: 'Amandine Roy',
      dateAircover: addDays(today, -2),
      proprietaire: edouard,
      pieceJointes: [{ name: 'etat-des-lieux-sortie.pdf' }],
      statutTermine: false,
      emailEnvoye: true,
      emailEnvoyeLe: addDays(today, -16),
      createdAt: new Date(Date.now() - 16 * 86400000).toISOString(),
    },
  ];
}

/* ---------- Contenu de l'email simulé ---------- */

function buildEmailContent(item) {
  const blocks = [];
  blocks.push(`À : ${item.proprietaire.email}`);
  blocks.push(`Objet : Rappel — AirCover à déposer aujourd'hui : ${item.titre}`);
  blocks.push(`Bonjour ${item.proprietaire.nom},`);
  blocks.push(`C'est le jour J : le délai de ${DELAI_JOURS} jours après le départ du locataire arrive à échéance. Voici les informations à reporter dans la demande AirCover sur Airbnb :`);
  blocks.push(
    [
      `Titre : ${item.titre}`,
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
