/* Cloud Function HTTP — envoie le rappel AirCover du jour (déclenchée par Cloud Scheduler) */

import { http } from '@google-cloud/functions-framework';
import admin from 'firebase-admin';

admin.initializeApp();
const db = admin.firestore();

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const CRON_SECRET = process.env.CRON_SECRET;
const DELAI_JOURS = 14;

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function formatDateShort(dateISO) {
  const d = new Date(dateISO + 'T00:00:00Z');
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' });
}

function formatPrice(n) {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(n);
}

/* Même contenu que buildEmailContent() dans app.js — dupliqué ici car cette
   fonction tourne côté serveur (Node), séparément du code du site (navigateur). */
function buildEmailContent(item) {
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
    item.pieceJointes && item.pieceJointes.length
      ? `Pièces jointes à utiliser (${item.pieceJointes.length}) :\n` + item.pieceJointes.map(p => `- ${p.name} : ${p.url}`).join('\n')
      : 'Pièces jointes : aucune'
  );
  blocks.push(`Merci de soumettre la demande AirCover aujourd'hui même, avant la fin de la fenêtre autorisée par Airbnb.`);
  return blocks.join('\n\n');
}

/* Tant qu'aucun domaine n'est vérifié sur Resend, le plan gratuit interdit
   d'envoyer à une autre adresse que celle du compte Resend lui-même.
   On route donc temporairement tous les rappels vers cette adresse — le
   vrai destinataire prévu reste visible dans le corps de l'email.
   À retirer une fois un domaine vérifié sur resend.com/domains. */
const TEMP_RECIPIENT_OVERRIDE = 'contact@ec-immo.fr';

async function sendEmail(item) {
  const content = item.proprietaire.email === TEMP_RECIPIENT_OVERRIDE
    ? buildEmailContent(item)
    : `[Destinataire réel prévu : ${item.proprietaire.email} — routé temporairement ici, domaine Resend non encore vérifié]\n\n${buildEmailContent(item)}`;

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: 'AirCover Manager <onboarding@resend.dev>',
      to: TEMP_RECIPIENT_OVERRIDE,
      subject: `Rappel — AirCover à déposer aujourd'hui : ${item.titre}`,
      text: content,
    }),
  });
  if (!res.ok) {
    throw new Error(`Resend ${res.status}: ${await res.text()}`);
  }
}

http('sendAircoverReminders', async (req, res) => {
  if (!CRON_SECRET || req.query.key !== CRON_SECRET) {
    res.status(403).send('forbidden');
    return;
  }

  const today = todayISO();
  const snap = await db.collection('aircovers')
    .where('dateAircover', '==', today)
    .where('statutTermine', '==', false)
    .get();

  const sent = [];
  const failed = [];

  for (const docSnap of snap.docs) {
    const item = { id: docSnap.id, ...docSnap.data() };
    if (item.reminderEnvoye) continue;
    try {
      await sendEmail(item);
      await docSnap.ref.update({ reminderEnvoye: true, reminderEnvoyeLe: today });
      sent.push(item.id);
    } catch (err) {
      console.error(`Échec envoi pour ${item.id}:`, err.message);
      failed.push(item.id);
    }
  }

  res.status(200).json({ date: today, sent, failed });
});
