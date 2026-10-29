// api/bictorys/webhook.js — POST : reçoit les notifications de paiement Bictorys
// Bictorys appelle cette URL quand un paiement est finalisé (succès, échec, etc.)

import { getBookingByReference, updateBooking, isKvConfigured } from "../../lib/db.js";
import { verifyWebhookSignature, mapBictorysStatus } from "../../lib/bictorys.js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "POST only" });
  }

  const kvOk = await isKvConfigured();
  if (!kvOk) {
    console.error("[BICTORYS_WEBHOOK] KV not configured");
    return res.status(503).json({ error: "DB not configured" });
  }

  try {
    // Récupère le body brut + la signature
    const body =
      typeof req.body === "string" ? req.body : JSON.stringify(req.body);
    const signature = req.headers["bictorys-signature"] || "";

    // Vérifie la signature (si configurée)
    const signatureValid = verifyWebhookSignature(signature, body);
    if (!signatureValid) {
      console.error("[BICTORYS_WEBHOOK] Invalid signature");
      return res.status(401).json({ error: "Invalid signature" });
    }

    const payload = typeof req.body === "object" ? req.body : JSON.parse(body);

    // Format webhook Bictorys (à confirmer dans la doc) :
    // { event: "payment.success", data: { reference, transaction_id, status, amount } }
    const reference = payload.data?.reference || payload.reference;
    const bictorysStatus =
      payload.data?.status || payload.status || payload.event;
    const transactionId =
      payload.data?.transaction_id || payload.transaction_id || payload.id;

    if (!reference) {
      console.error("[BICTORYS_WEBHOOK] No reference in payload", payload);
      return res.status(400).json({ error: "No reference" });
    }

    // Mappe le statut
    const mappedStatus = mapBictorysStatus(bictorysStatus);

    // Récupère la réservation
    const booking = await getBookingByReference(reference);
    if (!booking) {
      console.error("[BICTORYS_WEBHOOK] Booking not found:", reference);
      return res.status(404).json({ error: "Booking not found" });
    }

    // Met à jour le statut de paiement
    let newStatutPaiement = booking.statutPaiement;
    if (mappedStatus === "PAYE") {
      // Si MI_MI et acompte déjà versé → mark fully paid
      if (
        booking.modalitePaiement === "MI_MI" &&
        booking.statutPaiement === "ACOMPTE_VERSE"
      ) {
        newStatutPaiement = "PAYE";
      } else {
        newStatutPaiement = "PAYE";
      }
    } else if (mappedStatus === "ANNULE") {
      newStatutPaiement = "ANNULE";
    }

    await updateBooking(reference, {
      statutPaiement: newStatutPaiement,
      bictorysTransactionId: transactionId,
      bictorysEvent: payload.event,
      bictorysWebhookReceivedAt: new Date().toISOString(),
    });

    console.log(
      `[BICTORYS_WEBHOOK] OK — ${reference} → ${newStatutPaiement} (Bictorys: ${bictorysStatus})`
    );

    // Réponse 200 obligatoire pour que Bictorys ne retry pas
    return res.status(200).json({ received: true, status: newStatutPaiement });
  } catch (error) {
    console.error("[BICTORYS_WEBHOOK_ERROR]", error);
    return res.status(500).json({ error: "Webhook error" });
  }
}
