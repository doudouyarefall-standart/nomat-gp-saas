// api/bictorys/checkout.js — POST : initie un paiement Bictorys
// Body attendu : { reference } (la référence de la réservation)
// Redirige l'utilisateur vers la page de paiement Bictorys

import { getBookingByReference, updateBooking, isKvConfigured } from "../../lib/db.js";
import { initiateCheckout } from "../../lib/bictorys.js";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();

  if (req.method !== "POST") {
    return res.status(405).json({ error: "POST only" });
  }

  const kvOk = await isKvConfigured();
  if (!kvOk) {
    return res.status(503).json({
      error: "Base de données non configurée.",
      code: "KV_NOT_CONFIGURED",
    });
  }

  try {
    const { reference } = req.body || {};
    if (!reference) {
      return res.status(400).json({ error: "Référence manquante" });
    }

    // Récupère la réservation
    const booking = await getBookingByReference(reference);
    if (!booking) {
      return res.status(404).json({ error: "Réservation introuvable" });
    }

    // Si déjà payé, refuse
    if (booking.statutPaiement === "PAYE") {
      return res
        .status(400)
        .json({ error: "Cette réservation est déjà payée." });
    }

    // Calcule le montant à payer (50% si MI_MI et pas encore d'acompte, sinon 100%)
    let montantAPayer = booking.montantTotal;
    if (
      booking.modalitePaiement === "MI_MI" &&
      booking.statutPaiement === "ACOMPTE_VERSE"
    ) {
      // 2e paiement = 50% restant
      montantAPayer = booking.montantTotal / 2;
    } else if (booking.modalitePaiement === "MI_MI") {
      // 1er paiement = 50%
      montantAPayer = booking.montantTotal / 2;
    }

    // Initie le checkout Bictorys
    const checkout = await initiateCheckout({
      reference: booking.reference,
      amount: montantAPayer,
      currency: "USD",
      customerEmail: booking.expediteurEmail || "client@nomatgp.example",
      customerName: booking.expediteurNom,
      description: `Envoi NOMAT GP ${booking.reference} — ${booking.poids}kg → ${booking.villeDestination}`,
    });

    // Si mode démo (pas de clé API)
    if (checkout.demo) {
      // Simule un paiement réussi en mode démo
      await updateBooking(reference, {
        statutPaiement: "PAYE",
        bictorysTransactionId: checkout.transactionId,
        bictorysDemo: true,
      });

      return res.status(200).json({
        success: true,
        demo: true,
        message:
          "Paiement simulé (BICTORYS_API_KEY non configuré). Configurez votre clé API Bictorys sur Vercel pour activer les vrais paiements.",
        transactionId: checkout.transactionId,
        statutPaiement: "PAYE",
      });
    }

    // Mode réel : renvoie l'URL de checkout Bictorys
    // Le frontend redirigera l'utilisateur vers cette URL
    return res.status(200).json({
      success: true,
      checkoutUrl: checkout.checkoutUrl,
      transactionId: checkout.transactionId,
    });
  } catch (error) {
    console.error("[BICTORYS_CHECKOUT_ERROR]", error);
    return res.status(500).json({
      error: "Erreur lors de l'initiation du paiement.",
      details: error.message,
    });
  }
}
