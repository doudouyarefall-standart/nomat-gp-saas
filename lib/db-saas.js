import { kv } from "@vercel/kv";

const T = "saas:tenant:";
const SLUG = "saas:tenant:slug:";
const ALL = "saas:tenants:all";

export async function createTenant(t) {
  if (!t.id || !t.slug) throw new Error("id+slug required");
  const ex = await kv.get(SLUG + t.slug);
  if (ex) throw new Error("Slug déjà pris: " + t.slug);
  const now = new Date().toISOString();
  const full = { ...t, plan: t.plan||"trial", status: t.status||"active", createdAt: now, updatedAt: now, config: t.config || defCfg(t.name) };
  await kv.set(T + t.id, JSON.stringify(full));
  await kv.set(SLUG + t.slug, t.id);
  await kv.zadd(ALL, { score: Date.now(), member: t.id });
  return full;
}
export async function getTenantById(id) {
  const d = await kv.get(T + id); if (!d) return null;
  return typeof d === "string" ? JSON.parse(d) : d;
}
export async function getTenantBySlug(slug) {
  const id = await kv.get(SLUG + slug); if (!id) return null;
  return getTenantById(id);
}
export async function updateTenant(id, u) {
  const e = await getTenantById(id); if (!e) throw new Error("not found");
  const up = { ...e, ...u, updatedAt: new Date().toISOString() };
  await kv.set(T + id, JSON.stringify(up));
  return up;
}
export async function listTenants(lim=100) {
  const ids = await kv.zrange(ALL, 0, lim-1, { rev: true });
  if (!ids?.length) return [];
  return (await Promise.all(ids.map(id => getTenantById(id)))).filter(Boolean);
}
export async function saveTenantBooking(tid, b) {
  await kv.set(`${T}${tid}:booking:${b.reference}`, JSON.stringify(b));
  await kv.set(`${T}${tid}:track:${b.trackingNumber}`, b.reference);
  await kv.zadd(`${T}${tid}:all`, { score: Date.now(), member: b.reference });
  return b;
}
export async function getTenantBooking(tid, ref) {
  const d = await kv.get(`${T}${tid}:booking:${ref}`);
  if (!d) return null; return typeof d === "string" ? JSON.parse(d) : d;
}
export async function getTenantBookingByTrack(tid, track) {
  const ref = await kv.get(`${T}${tid}:track:${track}`); if (!ref) return null;
  return getTenantBooking(tid, ref);
}
export async function listTenantBookings(tid, lim=50) {
  const refs = await kv.zrange(`${T}${tid}:all`, 0, lim-1, { rev: true });
  if (!refs?.length) return [];
  return (await Promise.all(refs.map(r => getTenantBooking(tid, r)))).filter(Boolean);
}
export async function createSession(tid, email) {
  const sid = 'sess_' + Math.random().toString(36).substring(2,15) + Math.random().toString(36).substring(2,15);
  const s = { sessionId: sid, tenantId: tid, email, createdAt: new Date().toISOString(), expiresAt: new Date(Date.now()+7*24*60*60*1000).toISOString() };
  await kv.set(`saas:session:${sid}`, JSON.stringify(s), { ex: 7*24*60*60 });
  return s;
}
export async function getSession(sid) {
  if (!sid) return null;
  const d = await kv.get(`saas:session:${sid}`); if (!d) return null;
  return typeof d === "string" ? JSON.parse(d) : d;
}
export function genTid() { return 't_' + Math.random().toString(36).substring(2,10) + Date.now().toString(36); }
export function slugify(n) { return n.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').substring(0,40); }
export async function isKvConfigured() { try { await kv.ping(); return true; } catch { return false; } }

function defCfg(name) {
  return {
    companyName: name, tagline: "Votre partenaire de transport de confiance",
    pricePerKg: 20, currency: "USD",
    routes: [{ origin: "Dakar", originCountry: "Sénégal", destinations: ["New York","Montréal"] }],
    departureDays: ["Mardi","Jeudi"], phone: "", phone2: "", phoneCanada: "",
    email: "", depotAddress: "", depotAddressCanada: "",
    primaryColor: "#f59e0b", accentColor: "#dc2626", logoUrl: null,
  };
}
