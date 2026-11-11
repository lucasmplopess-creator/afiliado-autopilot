// Envio para os canais. Sem credenciais, o envio é SIMULADO (registrado no histórico).
const EVO_URL = process.env.EVOLUTION_URL?.replace(/\/$/, '');
const EVO_KEY = process.env.EVOLUTION_APIKEY;
const EVO_INST = process.env.EVOLUTION_INSTANCE;
const TG = process.env.TELEGRAM_BOT_TOKEN;
const FB_TOKEN = process.env.FACEBOOK_PAGE_TOKEN;
const FB_VER = process.env.FACEBOOK_API_VERSION || 'v23.0';

export function statusCanais() {
  return { whatsapp: !!(EVO_URL && EVO_KEY && EVO_INST), telegram: !!TG, facebook: !!FB_TOKEN };
}

// ---------- gestão do WhatsApp (Evolution API v2) ----------
async function evo(caminho, opt = {}) {
  if (!statusCanais().whatsapp) throw new Error('Evolution API não configurada (EVOLUTION_URL, EVOLUTION_APIKEY, EVOLUTION_INSTANCE)');
  const r = await fetch(`${EVO_URL}${caminho}`, {
    ...opt,
    headers: { apikey: EVO_KEY, 'Content-Type': 'application/json' },
    body: opt.body ? JSON.stringify(opt.body) : undefined,
  });
  const txt = await r.text();
  let j; try { j = JSON.parse(txt); } catch { j = { raw: txt }; }
  if (!r.ok) throw Object.assign(new Error(j?.response?.message?.toString() || j?.message || `HTTP ${r.status}`), { status: r.status });
  return j;
}

export async function whatsStatus() {
  if (!statusCanais().whatsapp) return { configurado: false, estado: 'nao_configurado' };
  try {
    const j = await evo(`/instance/connectionState/${EVO_INST}`);
    return { configurado: true, estado: j?.instance?.state || j?.state || 'desconhecido' };
  } catch (e) {
    return { configurado: true, estado: e.status === 404 ? 'sem_instancia' : 'erro', erro: e.message };
  }
}

export async function whatsConectar(numero) {
  const num = String(numero || '').replace(/\D/g, '');
  try {
    await evo('/instance/create', { method: 'POST', body: { instanceName: EVO_INST, integration: 'WHATSAPP-BAILEYS', qrcode: true } });
  } catch (e) {
    if (!/already|exist|in use|403/i.test(e.message + e.status)) throw e; // instância já existe: segue
  }
  const j = await evo(`/instance/connect/${EVO_INST}${num ? `?number=${num}` : ''}`);
  return { codigoPareamento: j.pairingCode || null, qr: j.base64 || null };
}

export async function whatsGrupos() {
  const j = await evo(`/group/fetchAllGroups/${EVO_INST}?getParticipants=false`);
  return (Array.isArray(j) ? j : []).map((g) => ({ id: g.id, nome: g.subject, membros: g.size ?? null }))
    .sort((a, b) => (b.membros || 0) - (a.membros || 0));
}

import { modoSimulacao } from './shopee.js';

export async function enviar(canal, item) {
  // trava de segurança: sem Shopee real, nada sai para grupos reais
  if (modoSimulacao()) return { simulado: true };
  if (canal.tipo === 'whatsapp') return enviarWhatsApp(canal.destino, item);
  if (canal.tipo === 'telegram') return enviarTelegram(canal.destino, item);
  if (canal.tipo === 'facebook') return enviarFacebook(canal.destino, item);
  throw new Error('Tipo de canal desconhecido: ' + canal.tipo);
}

async function enviarWhatsApp(destino, item) {
  if (!statusCanais().whatsapp) return { simulado: true };
  const headers = { apikey: EVO_KEY, 'Content-Type': 'application/json' };
  const r = await fetch(`${EVO_URL}/message/sendMedia/${EVO_INST}`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ number: destino, mediatype: 'image', mimetype: 'image/jpeg', media: item.imagem, caption: item.copy, fileName: 'oferta.jpg' }),
  });
  if (!r.ok) {
    // fallback: só texto
    const r2 = await fetch(`${EVO_URL}/message/sendText/${EVO_INST}`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ number: destino, text: item.copy }),
    });
    if (!r2.ok) throw new Error(`WhatsApp ${r2.status}: ${await r2.text()}`);
  }
  return { simulado: false };
}

async function enviarTelegram(destino, item) {
  if (!TG) return { simulado: true };
  const caption = item.copy.replace(/~/g, '').slice(0, 1024);
  const r = await fetch(`https://api.telegram.org/bot${TG}/sendPhoto`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: destino, photo: item.imagem, caption }),
  });
  if (!r.ok) throw new Error(`Telegram ${r.status}: ${await r.text()}`);
  return { simulado: false };
}

// ---------- Facebook (Graph API oficial, Página) ----------
async function fb(caminho, params = {}, metodo = 'GET') {
  const u = new URL(`${process.env.FACEBOOK_GRAPH_URL || 'https://graph.facebook.com'}/${FB_VER}/${caminho}`);
  const body = new URLSearchParams({ ...params, access_token: FB_TOKEN });
  const r = metodo === 'GET'
    ? await fetch(`${u}?${body}`)
    : await fetch(u, { method: 'POST', body });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.error) throw new Error(`Facebook: ${j.error?.message || r.status}`);
  return j;
}

// Facebook não entende *negrito* e ~riscado~ do WhatsApp: limpa a formatação
const textoFacebook = (t) => t.replace(/~([^~]+)~/g, '$1').replace(/\*([^*]+)\*/g, '$1');

async function enviarFacebook(paginaId, item) {
  if (!FB_TOKEN) return { simulado: true };
  const id = paginaId || 'me';
  const message = textoFacebook(item.copy);
  try {
    await fb(`${id}/photos`, { url: item.imagem, message }, 'POST');
  } catch (e) {
    // sem foto (imagem inválida): publica texto com link
    await fb(`${id}/feed`, { message, link: item.link }, 'POST');
  }
  return { simulado: false };
}

export async function facebookPagina() {
  if (!FB_TOKEN) throw new Error('Token da Página não configurado (FACEBOOK_PAGE_TOKEN)');
  const j = await fb('me', { fields: 'id,name,followers_count' });
  return { id: j.id, nome: j.name, seguidores: j.followers_count ?? null };
}
