import { createTenant, genTid, slugify, listTenants, isKvConfigured, createSession, updateTenant } from "../../lib/db-saas.js";
import { initiateCheckout } from "../../lib/bictorys.js";

const PLANS = {
  trial: { name: "Essai 7 jours", price: 0 },
  basic: { name: "Basique", price: 25 },
  pro: { name: "Pro", price: 50 },
  enterprise: { name: "Entreprise", price: 100 },
};

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();

  const kvOk = await isKvConfigured();
  if (!kvOk) return res.status(503).json({ error: "KV non configuré", code: "KV_NOT_CONFIGURED" });

  if (req.method === "POST") {
    try {
      const b = req.body || {};
      for (const f of ["companyName","email","password","plan"]) if (!b[f]) return res.status(400).json({ error: `Champ manquant: ${f}` });
      if (!PLANS[b.plan]) return res.status(400).json({ error: "Plan invalide" });
      if (b.password.length < 6) return res.status(400).json({ error: "Mot de passe min 6 caractères" });

      const tid = genTid();
      const slug = b.slug ? slugify(b.slug) : slugify(b.companyName);

      if (b.plan === "trial") {
        const t = await createTenant({ id: tid, slug, name: b.companyName, email: b.email, passwordHash: Buffer.from(b.password).toString('base64'), plan: "trial", status: "active", trialEndsAt: new Date(Date.now()+7*24*60*60*1000).toISOString() });
        const s = await createSession(tid, b.email);
        return res.status(201).json({ success: true, tenantId: tid, slug, session: s.sessionId, dashboardUrl: `/saas/dashboard.html?session=${s.sessionId}`, publicSiteUrl: `/s/${slug}` });
      }

      const plan = PLANS[b.plan];
      const co = await initiateCheckout({ reference: `sub_${tid}_${Date.now()}`, amount: plan.price, currency: "USD", customerEmail: b.email, customerName: b.companyName, description: `Abonnement SaaS — ${plan.name}` });

      await createTenant({ id: tid, slug, name: b.companyName, email: b.email, passwordHash: Buffer.from(b.password).toString('base64'), plan: b.plan, status: "pending_payment", subscriptionReference: `sub_${tid}_${Date.now()}` });

      if (co.demo) {
        await updateTenant(tid, { status: "active" });
        const s = await createSession(tid, b.email);
        return res.status(201).json({ success: true, demo: true, tenantId: tid, slug, session: s.sessionId, dashboardUrl: `/saas/dashboard.html?session=${s.sessionId}`, publicSiteUrl: `/s/${slug}` });
      }
      return res.status(200).json({ success: true, checkoutUrl: co.checkoutUrl, tenantId: tid, slug });
    } catch (e) { console.error("[SIGNUP]", e); return res.status(500).json({ error: e.message }); }
  }

  if (req.method === "GET") {
    const tenants = await listTenants(100);
    return res.status(200).json({ success: true, tenants, plans: PLANS });
  }
  return res.status(405).json({ error: "Method not allowed" });
}
