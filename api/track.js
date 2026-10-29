// api/track.js — GET : suivi d'un colis par référence ou tracking number
// Exemple : /api/track?numero=NOMAT-XXXX-XXXX ou /api/track?numero=REF-NOMAT-XXXXXX

import {
  getBookingByReference,
  getBookingByTracking,
  isKvConfigured,
} from "../lib/db.js";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  if (req.method === "OPTIONS") return res.status(200).end();

  if (req.method !== "GET") {
    return res.status(405).json({ error: "GET only" });
  }

  const kvOk = await isKvConfigured();
  if (!kvOk) {
    return res.status(503).json({
      error: "Base de données non configurée.",
      code: "KV_NOT_CONFIGURED",
    });
  }

  const numero = (req.query.numero || "").trim().toUpperCase();
  if (!numero) {
    return res.status(400).json({ error: "Numéro manquant" });
  }

  try {
    // Cherche par tracking OU par référence
    let booking =
      (await getBookingByTracking(numero)) ||
      (await getBookingByReference(numero));

    if (!booking) {
      return res.status(404).json({
        error: "Aucune expédition trouvée pour ce numéro.",
      });
    }

    return res.status(200).json({
      success: true,
      tracking: {
        trackingNumber: booking.trackingNumber,
        reference: booking.reference,
        statut: booking.statut,
        statutPaiement: booking.statutPaiement,
        modalitePaiement: booking.modalitePaiement,
        expediteurNom: booking.expediteurNom,
        destinataireNom: booking.destinataireNom,
        paysDestination: booking.paysDestination,
        villeDestination: booking.villeDestination,
        poids: booking.poids,
        modePaiement: booking.modePaiement,
        montantTotal: booking.montantTotal,
        dateDepart: booking.dateDepart,
        dateCreation: booking.createdAt,
        historique: booking.historique || [],
      },
    });
  } catch (error) {
    console.error("[TRACK_ERROR]", error);
    return res.status(500).json({ error: "Erreur serveur" });
  }
}
