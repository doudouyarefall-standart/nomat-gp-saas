// lib/bictorys.js — Client API Bictorys (intégrateur de paiement sénégalais)
// TODO [BICTORYS] : Une fois que vous avez votre clé API Bictorys, vérifiez
// l'URL exacte et le format d'authentification dans la doc officielle :
// https://docs.bictorys.com — et ajustez BICTORYS_BASE_URL + headers si besoin.

// URL de base — auto-détectée selon la clé API (test_secret → sandbox, live_secret → prod)
// Sinon utilise BICTORYS_BASE_URL ou la prod par défaut
function detectBaseUrl(apiKey) {
  if (!apiKey) {
    return process.env.BICTORYS_BASE_URL || "https://api.bictorys.com/v1";
  }
  if (apiKey.startsWith("test_secret")) {
    return "https://sandbox-api.bictorys.com/v1";
  }
  if (apiKey.startsWith("live_secret") || apiKey.startsWith("sk_live")) {
    return "https://api.bictorys.com/v1";
  }
  return process.env.BICTORYS_BASE_URL || "https://api.bictorys.com/v1";
}

const BICTORYS_API_KEY = process.env.BICTORYS_API_KEY;
const BICTORYS_BASE_URL = detectBaseUrl(BICTORYS_API_KEY);

if (!BICTORYS_API_KEY) {
  console.warn(
    "[Bictorys] BICTORYS_API_KEY non défini — les paiements seront en mode démo"
  );
} else if (BICTORYS_API_KEY.startsWith("test_secret")) {
  console.log("[Bictorys] Mode SANDBOX activé (clé test_secret détectée)");
} else {
  console.log("[Bictorys] Mode PRODUCTION activé");
}

/**
 * Initialise une intention de paiement Bictorys
 * @param {Object} params
 * @param {string} params.reference - Référence NOMAT (REF-NOMAT-XXXXXX)
 * @param {number} params.amount - Montant en dollars US
 * @param {string} params.currency - Devise (USD par défaut)
 * @param {string} params.customerEmail - Email du client
 * @param {string} params.customerName - Nom du client
 * @param {string} params.description - Description du paiement
 * @returns {Promise<{checkoutUrl: string, transactionId: string}>}
 */
export async function initiateCheckout({
  reference,
  amount,
  currency = "USD",
  customerEmail,
  customerName,
  description,
}) {
  // Mode démo si pas de clé API
  if (!BICTORYS_API_KEY) {
    return {
      checkoutUrl: null,
      transactionId: "demo-" + Date.now(),
      demo: true,
      message:
        "BICTORYS_API_KEY non configuré. Paiement en mode démo — configurez la clé sur Vercel.",
    };
  }

  // URLs de retour (à adapter selon votre domaine Vercel)
  const baseUrl = process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : process.env.NEXT_PUBLIC_SITE_URL || "https://nomat-gp.vercel.app";

  const returnUrl = `${baseUrl}/?payment=success&reference=${reference}`;
  const webhookUrl = `${baseUrl}/api/bictorys/webhook`;

  // Appel API Bictorys
  // Note : le format exact est à confirmer dans la doc Bictorys officielle
  const response = await fetch(`${BICTORYS_BASE_URL}/checkout/initiate`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${BICTORYS_API_KEY}`,
      // Alternative possible : "X-API-KEY": BICTORYS_API_KEY,
    },
    body: JSON.stringify({
      reference,
      amount: Math.round(amount * 100), // Bictorys attend souvent les montants en centimes
      currency,
      description: description || `Envoi NOMAT GP — ${reference}`,
      customer: {
        email: customerEmail,
        name: customerName,
      },
      return_url: returnUrl,
      webhook_url: webhookUrl,
      // Méthodes de paiement acceptées (mobile money + carte)
      channels: ["card", "wave", "orange_money", "djamo"],
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(
      `Bictorys API error ${response.status}: ${errorBody}`
    );
  }

  const data = await response.json();

  // Format de réponse attendu (à ajuster selon doc Bictorys) :
  // { checkout_url: "...", transaction_id: "...", status: "pending" }
  return {
    checkoutUrl: data.checkout_url || data.checkoutUrl || data.url,
    transactionId:
      data.transaction_id || data.transactionId || data.id || data.reference,
    raw: data,
  };
}

/**
 * Vérifie la signature du webhook Bictorys
 * @param {string} signature - Header Bictorys-Signature
 * @param {string} body - Body brut de la requête
 * @returns {boolean}
 */
export function verifyWebhookSignature(signature, body) {
  const secret = process.env.BICTORYS_WEBHOOK_SECRET;
  if (!secret) {
    console.warn(
      "[Bictorys] BICTORYS_WEBHOOK_SECRET non défini — webhook accepté sans vérif"
    );
    return true; // Mode permissif tant que le secret n'est pas configuré
  }

  // TODO [BICTORYS] : Vérifier le format exact de signature (HMAC SHA256 ?)
  // Selon la doc Bictorys, ajuster cette vérification
  try {
    const crypto = require("crypto");
    const expected = crypto
      .createHmac("sha256", secret)
      .update(body)
      .digest("hex");
    return expected === signature;
  } catch {
    return false;
  }
}

/**
 * Mappe le statut Bictorys vers le statut NOMAT GP
 * @param {string} bictorysStatus
 * @returns {string} - "PAYE" | "EN_ATTENTE" | "ANNULE"
 */
export function mapBictorysStatus(bictorysStatus) {
  const s = (bictorysStatus || "").toLowerCase();
  if (["success", "paid", "completed", "successful"].includes(s)) return "PAYE";
  if (["failed", "cancelled", "canceled", "expired"].includes(s)) return "ANNULE";
  return "EN_ATTENTE"; // pending, initiated, etc.
}
