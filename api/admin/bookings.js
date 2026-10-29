// api/admin/bookings.js — GET : liste complète pour panneau admin
// PATCH : met à jour le statut d'une réservation

import {
  listBookings,
  getBookingByReference,
  updateBooking,
  isKvConfigured,
} from "../../lib/db.js";

// Vérification simple par mot de passe (header X-Admin-Password)
function checkAuth(req) {
  const pwd = process.env.ADMIN_PASSWORD || "nomat2026";
  const provided = req.headers["x-admin-password"];
  return provided === pwd;
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, PATCH, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-Admin-Password");
  if (req.method === "OPTIONS") return res.status(200).end();

  if (!checkAuth(req)) {
    return res.status(401).json({ error: "Non autorisé" });
  }

  const kvOk = await isKvConfigured();
  if (!kvOk) {
    return res.status(503).json({ error: "DB not configured" });
  }

  // GET : liste
  if (req.method === "GET") {
    try {
      const bookings = await listBookings(100);
      return res.status(200).json({ success: true, bookings });
    } catch (e) {
      console.error("[ADMIN_GET_ERROR]", e);
      return res.status(500).json({ error: "Erreur serveur" });
    }
  }

  // PATCH : mise à jour statut
  if (req.method === "PATCH") {
    try {
      const { reference, statut } = req.body || {};
      if (!reference) return res.status(400).json({ error: "reference required" });
      if (
        !["EN_PREPARATION", "EN_TRANSIT", "EN_DOUANE", "LIVRE", "ANNULE"].includes(
          statut
        )
      ) {
        return res.status(400).json({ error: "Statut invalide" });
      }

      const existing = await getBookingByReference(reference);
      if (!existing) {
        return res.status(404).json({ error: "Réservation introuvable" });
      }

      // Ajoute une entrée à l'historique
      const historique = existing.historique || [];
      const lieuMap = {
        EN_PREPARATION: "Dakar, Sénégal",
        EN_TRANSIT: "En vol — Dakar → New York",
        EN_DOUANE: "New York, USA",
        LIVRE: `${existing.villeDestination}, ${existing.paysDestination}`,
        ANNULE: "Dakar, Sénégal",
      };
      const noteMap = {
        EN_PREPARATION: "Colis en préparation au dépôt.",
        EN_TRANSIT: "Colis embarqué sur le vol.",
        EN_DOUANE: "Dédouanement en cours.",
        LIVRE: "Colis livré au destinataire.",
        ANNULE: "Réservation annulée.",
      };
      historique.push({
        statut,
        date: new Date().toISOString(),
        lieu: lieuMap[statut],
        note: noteMap[statut],
      });

      const updated = await updateBooking(reference, {
        statut,
        historique,
      });

      return res.status(200).json({ success: true, booking: updated });
    } catch (e) {
      console.error("[ADMIN_PATCH_ERROR]", e);
      return res.status(500).json({ error: "Erreur serveur" });
    }
  }

  return res.status(405).json({ error: "Method not allowed" });
}
