// lib/db.js — Helper Vercel KV pour stocker les réservations NOMAT GP
// Setup : sur Vercel Dashboard → Storage → Create KV → link to project
// Les variables KV_REST_API_URL et KV_REST_API_TOKEN seront auto-injectées.

import { kv } from "@vercel/kv";

// Préfixe de clé pour les réservations
const PREFIX = "nomat:booking:";
const TRACKING_INDEX = "nomat:tracking:"; // trackingNumber → reference
const ALL_INDEX = "nomat:all"; // sorted set of references by createdAt

/**
 * Sauvegarde une réservation en base
 * @param {Object} booking - { reference, trackingNumber, expediteurNom, ... }
 */
export async function saveBooking(booking) {
  if (!booking.reference) throw new Error("reference required");
  // Stocke l'objet booking
  await kv.set(PREFIX + booking.reference, JSON.stringify(booking));
  // Index : trackingNumber → reference (pour recherche par tracking)
  if (booking.trackingNumber) {
    await kv.set(TRACKING_INDEX + booking.trackingNumber, booking.reference);
  }
  // Index global : ajout à la sorted set par timestamp
  await kv.zadd(ALL_INDEX, { score: Date.now(), member: booking.reference });
  return booking;
}

/**
 * Récupère une réservation par référence
 */
export async function getBookingByReference(reference) {
  const data = await kv.get(PREFIX + reference);
  if (!data) return null;
  return typeof data === "string" ? JSON.parse(data) : data;
}

/**
 * Récupère une réservation par numéro de suivi
 */
export async function getBookingByTracking(trackingNumber) {
  const reference = await kv.get(TRACKING_INDEX + trackingNumber);
  if (!reference) return null;
  return getBookingByReference(reference);
}

/**
 * Met à jour une réservation (merge)
 */
export async function updateBooking(reference, updates) {
  const existing = await getBookingByReference(reference);
  if (!existing) throw new Error("Booking not found: " + reference);
  const updated = { ...existing, ...updates, updatedAt: new Date().toISOString() };
  await kv.set(PREFIX + reference, JSON.stringify(updated));
  return updated;
}

/**
 * Liste toutes les réservations (les plus récentes d'abord)
 * @param {number} limit - max 100
 */
export async function listBookings(limit = 50) {
  const references = await kv.zrange(ALL_INDEX, 0, limit - 1, { rev: true });
  if (!references || references.length === 0) return [];
  const bookings = await Promise.all(
    references.map((ref) => getBookingByReference(ref))
  );
  return bookings.filter(Boolean);
}

/**
 * Compte le nombre total de réservations
 */
export async function countBookings() {
  return await kv.zcard(ALL_INDEX);
}

/**
 * Vérifie si KV est configuré
 */
export async function isKvConfigured() {
  try {
    await kv.ping();
    return true;
  } catch {
    return false;
  }
}
