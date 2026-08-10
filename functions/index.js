/* Cloud Function HTTP — envoie le rappel AirCover du jour (déclenchée par Cloud Scheduler) */

import { http } from '@google-cloud/functions-framework';
import admin from 'firebase-admin';

admin.initializeApp();
const db = admin.firestore();

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const CRON_SECRET = process.env.CRON_SECRET;
const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const TWILIO_MESSAGING_SERVICE_SID = process.env.TWILIO_MESSAGING_SERVICE_SID;
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

const COPY_RECIPIENT = 'contact@ec-immo.fr';

/* Équipe restreinte pour le moment : seuls Edouard et Christopher reçoivent les
   rappels jour même (email + SMS), quel que soit le propriétaire assigné à la
   tâche. À étendre le jour où d'autres membres rejoignent. */
const TEAM_NOTIFY = [
  { nom: 'Edouard', email: 'edtoulet@gmail.com', telephone: '0627135723' },
  { nom: 'Christopher', email: 'christopher.malmezac@gmail.com', telephone: '0769620448' },
];

/* Comptes Firebase (accounts/{uid}.email) autorisés à déclencher un SMS.
   Protège contre un compte piraté ou créé par un tiers qui ajouterait des
   tâches en masse avec des numéros de téléphone pour gonfler la facture Twilio. */
const SMS_ALLOWED_ACCOUNT_EMAILS = TEAM_NOTIFY.map(m => m.email.toLowerCase());

async function isSmsAllowedForItem(item) {
  if (!item.ownerUid) return false;
  const accountSnap = await db.collection('accounts').doc(item.ownerUid).get();
  if (!accountSnap.exists) return false;
  const email = (accountSnap.data().email || '').toLowerCase();
  return SMS_ALLOWED_ACCOUNT_EMAILS.includes(email);
}

/* Même contenu que buildEmailContent() dans app.js — dupliqué ici car cette
   fonction tourne côté serveur (Node), séparément du code du site (navigateur). */
function buildEmailContent(item) {
  const blocks = [];
  blocks.push(`À : ${TEAM_NOTIFY.map(m => m.email).join(', ')}`);
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
    item.pieceJointes && item.pieceJointes.length
      ? `Pièces jointes à utiliser (${item.pieceJointes.length}) :\n` + item.pieceJointes.map(p => `- ${p.name} : ${p.url}`).join('\n')
      : 'Pièces jointes : aucune'
  );
  blocks.push(`Merci de soumettre la demande AirCover aujourd'hui même, avant la fin de la fenêtre autorisée par Airbnb.`);
  return blocks.join('\n\n');
}

async function sendEmail(item) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: 'AirCover Manager <aircover@ec-immo.fr>',
      to: TEAM_NOTIFY.map(m => m.email),
      cc: COPY_RECIPIENT,
      subject: `Rappel — AirCover à déposer aujourd'hui : ${item.titre}`,
      text: buildEmailContent(item),
    }),
  });
  if (!res.ok) {
    throw new Error(`Resend ${res.status}: ${await res.text()}`);
  }
}

function buildSmsContent(item) {
  return `Rappel AirCover Manager : un AirCover doit être réalisé aujourd'hui pour l'appartement ${item.appartement || '—'}, voyageur ${item.locataire}.`;
}

/* Numéros français saisis en local (ex: "06 12 34 56 78") → format E.164 attendu par Twilio. */
function toE164France(phone) {
  const digits = phone.replace(/\D/g, '');
  if (digits.startsWith('33')) return `+${digits}`;
  if (digits.startsWith('0')) return `+33${digits.slice(1)}`;
  return `+${digits}`;
}

async function sendSms(item) {
  const body = buildSmsContent(item);
  for (const member of TEAM_NOTIFY) {
    const params = new URLSearchParams({
      To: toE164France(member.telephone),
      MessagingServiceSid: TWILIO_MESSAGING_SERVICE_SID,
      Body: body,
    });
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params,
    });
    if (!res.ok) {
      throw new Error(`Twilio ${res.status}: ${await res.text()}`);
    }
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

  const emailSent = [];
  const emailFailed = [];
  const smsSent = [];
  const smsFailed = [];

  for (const docSnap of snap.docs) {
    const item = { id: docSnap.id, ...docSnap.data() };

    if (!item.reminderEnvoye) {
      try {
        await sendEmail(item);
        await docSnap.ref.update({ reminderEnvoye: true, reminderEnvoyeLe: today });
        emailSent.push(item.id);
      } catch (err) {
        console.error(`Échec email pour ${item.id}:`, err.message);
        emailFailed.push(item.id);
      }
    }

    if (!item.smsEnvoye && (await isSmsAllowedForItem(item))) {
      try {
        await sendSms(item);
        await docSnap.ref.update({ smsEnvoye: true, smsEnvoyeLe: today });
        smsSent.push(item.id);
      } catch (err) {
        console.error(`Échec SMS pour ${item.id}:`, err.message);
        smsFailed.push(item.id);
      }
    }
  }

  res.status(200).json({ date: today, emailSent, emailFailed, smsSent, smsFailed });
});
