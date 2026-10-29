import { getTenantBySlug, getTenantById, updateTenant, getSession, createSession } from "../../lib/db-saas.js";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, PATCH, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-Session-Id");
  if (req.method === "OPTIONS") return res.status(200).end();

  const { slug } = req.query;

  if (req.method === "GET") {
    const t = await getTenantBySlug(slug);
    if (!t) return res.status(404).json({ error: "GP introuvable: " + slug });
    if (t.status === "pending_payment") return res.status(402).json({ error: "Abonnement en attente" });
    return res.status(200).json({ success: true, tenant: { id: t.id, slug: t.slug, name: t.name, config: t.config, plan: t.plan, status: t.status } });
  }

  if (req.method === "POST" && req.body?.action === "login") {
    const { email, password } = req.body;
    const t = await getTenantBySlug(slug);
    if (!t || t.email !== email) return res.status(401).json({ error: "Identifiants incorrects" });
    if (t.passwordHash !== Buffer.from(password).toString('base64')) return res.status(401).json({ error: "Identifiants incorrects" });
    const s = await createSession(t.id, email);
    return res.status(200).json({ success: true, session: s.sessionId, tenantId: t.id, dashboardUrl: `/saas/dashboard.html?session=${s.sessionId}` });
  }

  if (req.method === "PATCH") {
    const sid = req.headers["x-session-id"];
    const s = await getSession(sid);
    if (!s) return res.status(401).json({ error: "Session invalide" });
    const t = await getTenantById(s.tenantId);
    if (!t || t.slug !== slug) return res.status(403).json({ error: "Non autorisé" });
    const newCfg = { ...t.config, ...(req.body?.config || req.body || {}) };
    const up = await updateTenant(t.id, { config: newCfg });
    return res.status(200).json({ success: true, config: up.config });
  }
  return res.status(405).json({ error: "Method not allowed" });
}
