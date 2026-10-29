// api/bookings.js — POST : crée une nouvelle réservation
// GET : liste toutes les réservations (admin)

import { saveBooking, listBookings, countBookings, isKvConfigured } from "../lib/db.js";

function generateReference() {
  const num = Math.floor(100000 + Math.random() * 900000);
  return `REF-NOMAT-${num}`;
}

function generateTrackingNumber() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const random = Array.from({ length: 6 }, () =>
    chars[Math.floor(Math.random() * chars.length)]
  ).join("");
  const num = Math.floor(1000 + Math.random() * 9000);
  return `NOMAT-${random}-${num}`;
}

export default async function handler(req, res) {
  // CORS headers
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  // Vérifie que KV est configuré
  const kvOk = await isKvConfigured();
  if (!kvOk) {
    return res.status(503).json({
      error:
        "Base de données non configurée. Activez Vercel KV sur votre projet (voir README).",
      code: "KV_NOT_CONFIGURED",
    });
  }

  // === POST : créer une réservation ===
  if (req.method === "POST") {
    try {
      const b = req.body || {};

      // Validation
      const required = [
        "expediteurNom",
        "expediteurTel",
        "destinataireNom",
        "destinataireTel",
        "destinataireAdresse",
        "paysDestination",
        "villeDestination",
        "poids",
        "modePaiement",
        "dateDepart",
      ];
      for (const field of required) {
        if (!b[field]) {
          return res
            .status(400)
            .json({ error: `Champ obligatoire manquant: ${field}` });
        }
      }

      // Validation pays/mode paiement
      if (!["USA", "CANADA"].includes(b.paysDestination)) {
        return res.status(400).json({ error: "Pays invalide" });
      }
      if (
        !["DEPOT", "WAVE", "ORANGE_MONEY", "DJAMO", "CARTE_BANCAIRE"].includes(
          b.modePaiement
        )
      ) {
        return res.status(400).json({ error: "Mode de paiement invalide" });
      }

      const poids = Number(b.poids);
      if (isNaN(poids) || poids <= 0) {
        return res.status(400).json({ error: "Poids invalide" });
      }

      const modalitePaiement = ["ENTIER_AVANCE", "MI_MI"].includes(
        b.modalitePaiement
      )
        ? b.modalitePaiement
        : "ENTIER_AVANCE";

      // Génère référence + tracking
      const reference = generateReference();
      const trackingNumber = generateTrackingNumber();
      const now = new Date().toISOString();

      const booking = {
        reference,
        trackingNumber,
        expediteurNom: b.expediteurNom,
        expediteurTel: b.expediteurTel,
        expediteurEmail: b.expediteurEmail || null,
        destinataireNom: b.destinataireNom,
        destinataireTel: b.destinataireTel,
        destinataireEmail: b.destinataireEmail || null,
        destinataireAdresse: b.destinataireAdresse,
        paysDestination: b.paysDestination,
        villeDestination: b.villeDestination,
        poids,
        description: b.description || null,
        modePaiement: b.modePaiement,
        modalitePaiement,
        statutPaiement:
          modalitePaiement === "MI_MI" ? "ACOMPTE_VERSE" : "EN_ATTENTE",
        statut: "EN_PREPARATION",
        dateDepart: b.dateDepart,
        montantTotal: poids * 20, // 20$/KG
        historique: [
          {
            statut: "EN_PREPARATION",
            date: now,
            lieu: "Dakar, Sénégal",
            note: "Réservation enregistrée. Colis en attente de dépôt.",
          },
        ],
        createdAt: now,
        updatedAt: now,
      };

      await saveBooking(booking);

      return res.status(201).json({
        success: true,
        reference: booking.reference,
        trackingNumber: booking.trackingNumber,
        montantTotal: booking.montantTotal,
        statutPaiement: booking.statutPaiement,
        message: "Réservation enregistrée avec succès.",
      });
    } catch (error) {
      console.error("[BOOKINGS_POST_ERROR]", error);
      return res.status(500).json({ error: "Erreur serveur" });
    }
  }

  // === GET : liste (admin) ===
  if (req.method === "GET") {
    try {
      const bookings = await listBookings(50);
      const total = await countBookings();
      return res.status(200).json({ success: true, bookings, total });
    } catch (error) {
      console.error("[BOOKINGS_GET_ERROR]", error);
      return res.status(500).json({ error: "Erreur serveur" });
    }
  }

  return res.status(405).json({ error: "Method not allowed" });
}
