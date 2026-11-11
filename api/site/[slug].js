import { getTenantBySlug, isKvConfigured } from "../../lib/db-saas.js";

export default async function handler(req, res) {
  const { slug } = req.query;
  if (!slug) return res.status(400).send("Slug manquant");

  if (!(await isKvConfigured())) {
    return res.status(503).send(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Configuration en cours</title></head><body style="font-family:sans-serif;text-align:center;padding:3rem;"><h1>⚙️ Configuration en cours</h1><p>La base de données n'est pas encore configurée sur ce déploiement SaaS.</p></body></html>`);
  }

  const t = await getTenantBySlug(slug);
  if (!t) return res.status(404).send(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>GP introuvable</title></head><body style="font-family:sans-serif;text-align:center;padding:3rem;"><h1>🔍 GP introuvable</h1><p>Aucun GP pour: <strong>${slug}</strong></p><p><a href="/">← Plateforme SaaS</a></p></body></html>`);
  if (t.status === "pending_payment") return res.status(402).send(`<!DOCTYPE html><html><body style="font-family:sans-serif;text-align:center;padding:3rem;"><h1>💳 Abonnement en attente</h1><p>${t.name}</p></body></html>`);

  const base = `https://${req.headers.host}`;
  let html;
  try {
    const r = await fetch(`${base}/templates/gp-template.html`);
    if (!r.ok) throw new Error("Template fetch: " + r.status);
    html = await r.text();
  } catch(e) { return res.status(500).send("Template error: " + e.message); }

  const c = t.config || {};
  const name = c.companyName || t.name || "GP Express";
  const price = c.pricePerKg || 20;
  const cur = c.currency || "USD";

  html = html
    .replaceAll("NOMAT GP", name)
    .replaceAll("NOMAT", name.split(" ")[0])
    .replaceAll("Votre partenaire de transport de confiance", c.tagline || "Votre partenaire de transport")
    .replaceAll("Colis sans frontières", c.tagline || "Colis sans frontères")
    .replaceAll("20$/KG", `${price}$/${cur==="USD"?"KG":cur}`)
    .replaceAll("À partir de 20$/KG", `À partir de ${price}$/${cur==="USD"?"KG":cur}`)
    .replaceAll("+221 77 341 98 04", c.phone || "")
    .replaceAll("+221773419804", (c.phone||"").replace(/[^+\d]/g,""))
    .replaceAll("+221 77 556 12 66", c.phone2 || "")
    .replaceAll("+1 (514) 346 15 38", c.phoneCanada || "")
    .replaceAll("contact@nomatgp.example", c.email || `contact@${slug}.com`)
    .replaceAll("Ouest Foire, Dakar, Sénégal", c.depotAddress || "Dépôt à configurer")
    .replaceAll("373 rue Savard, Chicoutimi, QC, Canada", c.depotAddressCanada || "");

  if (c.logoUrl) html = html.replaceAll('src="logo-nomat-gp.png"', `src="${c.logoUrl}"`);

  html = html.replace("</body>", `<div style="position:fixed;bottom:0;left:0;right:0;text-align:center;padding:6px;font-size:10px;background:rgba(0,0,0,0.7);color:#fff;z-index:9999;">Propulsé par <a href="${base}/" style="color:#f59e0b;text-decoration:none;font-weight:bold;">GP Platform</a></div></body>`);

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "public, max-age=60");
  return res.status(200).send(html);
}
