import { getTenantBySlug, saveTenantBooking, listTenantBookings, getSession, isKvConfigured } from "../../../lib/db-saas.js";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-Session-Id");
  if (req.method === "OPTIONS") return res.status(200).end();

  const { slug } = req.query;
  if (!(await isKvConfigured())) return res.status(503).json({ error: "KV not configured" });

  const t = await getTenantBySlug(slug);
  if (!t) return res.status(404).json({ error: "GP introuvable" });
  if (t.status !== "active") return res.status(402).json({ error: "GP inactif" });

  if (req.method === "POST") {
    const b = req.body || {};
    for (const f of ["expediteurNom","expediteurTel","destinataireNom","destinataireTel","destinataireAdresse","poids","modePaiement","dateDepart"])
      if (!b[f]) return res.status(400).json({ error: `Champ manquant: ${f}` });
    const p = Number(b.poids); if (isNaN(p)||p<=0) return res.status(400).json({ error: "Poids invalide" });
    const ref = `REF-${Date.now().toString(36).toUpperCase()}-${Math.floor(Math.random()*9000+1000)}`;
    const tr = `${t.slug.substring(0,4).toUpperCase().replace(/[^A-Z0-9]/g,'X')}-${Math.random().toString(36).substring(2,6).toUpperCase()}-${Math.floor(Math.random()*9000+1000)}`;
    const now = new Date().toISOString();
    const bk = { reference: ref, trackingNumber: tr, tenantId: t.id, tenantSlug: t.slug,
      expediteurNom: b.expediteurNom, expediteurTel: b.expediteurTel, expediteurEmail: b.expediteurEmail||null,
      destinataireNom: b.destinataireNom, destinataireTel: b.destinataireTel, destinataireEmail: b.destinataireEmail||null,
      destinataireAdresse: b.destinataireAdresse, paysDestination: b.paysDestination||"CANADA", villeDestination: b.villeDestination||"Montréal",
      poids: p, description: b.description||null, modePaiement: b.modePaiement, modalitePaiement: b.modalitePaiement||"ENTIER_AVANCE",
      statutPaiement: b.modalitePaiement==="MI_MI"?"ACOMPTE_VERSE":"EN_ATTENTE", statut: "EN_PREPARATION", dateDepart: b.dateDepart,
      montantTotal: p*(t.config?.pricePerKg||20), currency: t.config?.currency||"USD",
      historique: [{ statut:"EN_PREPARATION", date:now, lieu:"Dépôt", note:"Réservation enregistrée." }],
      createdAt: now, updatedAt: now };
    await saveTenantBooking(t.id, bk);
    return res.status(201).json({ success: true, reference: ref, trackingNumber: tr, montantTotal: bk.montantTotal, currency: bk.currency, statutPaiement: bk.statutPaiement });
  }

  if (req.method === "GET") {
    const sid = req.headers["x-session-id"]; const s = await getSession(sid);
    if (!s || s.tenantId !== t.id) return res.status(401).json({ error: "Non autorisé" });
    const bks = await listTenantBookings(t.id, 100);
    return res.status(200).json({ success: true, bookings: bks });
  }
  return res.status(405).json({ error: "Method not allowed" });
}
