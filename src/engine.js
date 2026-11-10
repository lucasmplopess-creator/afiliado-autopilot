// Motor: piloto automático (repõe a fila) + agendador (respeita o ritmo dos disparos).
import { load, save, uid } from './store.js';
import { buscarOfertas, gerarLinkCurto } from './shopee.js';
import { gerarCopy } from './copy.js';
import { enviar } from './senders.js';

const TZ = process.env.TZ_APP || 'America/Sao_Paulo';
const DIAS = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

export function agora() {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', weekday: 'short', hourCycle: 'h23',
    }).formatToParts(new Date()).map((p) => [p.type, p.value]),
  );
  return { data: `${parts.year}-${parts.month}-${parts.day}`, hhmm: `${parts.hour}:${parts.minute}`, dow: DIAS[parts.weekday] };
}

const log = (...a) => console.log(`[${new Date().toISOString()}]`, ...a);

// ---------- fila ----------
export async function adicionarNaFila(produto, nichoId = 'manual') {
  const db = load();
  const nicho = db.config.nichos.find((n) => n.id === nichoId);
  const link = await gerarLinkCurto(produto.linkOferta || produto.linkProduto, [nichoId, 'autopilot']);
  const copy = await gerarCopy(produto, nicho, link);
  const item = {
    id: uid(), itemId: produto.itemId, nome: produto.nome, imagem: produto.imagem,
    preco: produto.preco, precoOriginal: produto.precoOriginal, desconto: produto.desconto,
    comissaoPct: produto.comissaoPct, indice: produto.indice, link, copy, nicho: nichoId,
    status: 'na_fila', criadoEm: Date.now(),
  };
  db.fila.push(item);
  save();
  return item;
}

function passaFiltros(p, f) {
  return p.desconto >= f.descontoMin && p.nota >= f.notaMin && p.vendas >= f.vendasMin &&
    p.comissaoPct >= f.comissaoMin && (!f.precoMax || p.preco <= f.precoMax);
}

export async function rodarAutopilot({ forcar = false } = {}) {
  const db = load();
  const { autopilot, filtros } = db.config;
  const naFila = db.fila.filter((i) => i.status === 'na_fila').length;
  const faltam = Math.max(0, autopilot.filaMinima - naFila);
  if (!forcar && (!autopilot.ativo || faltam === 0)) return { adicionados: 0, motivo: 'fila cheia ou piloto desligado' };

  const nichos = db.config.nichos.filter((n) => n.ativo && n.palavras.length);
  if (!nichos.length) return { adicionados: 0, motivo: 'nenhum nicho ativo' };

  const limiteRepeticao = Date.now() - autopilot.naoRepetirDias * 86400000;
  const recentes = new Set([
    ...db.historico.filter((h) => h.ts > limiteRepeticao).map((h) => h.itemId),
    ...db.fila.filter((i) => i.status === 'na_fila').map((i) => i.itemId),
  ]);

  const meta = Math.max(faltam, forcar ? nichos.length : 0);
  const porNicho = Math.ceil(meta / nichos.length);
  let adicionados = 0;

  for (const nicho of nichos) {
    const palavra = nicho.palavras[Math.floor(Math.random() * nicho.palavras.length)];
    let ofertas = [];
    try {
      ofertas = await buscarOfertas({ keyword: palavra, ordenar: 'comissao', limite: 40 });
    } catch (e) {
      log('[autopilot] erro na busca', palavra, e.message);
      continue;
    }
    const escolhidas = ofertas
      .filter((p) => !recentes.has(p.itemId) && passaFiltros(p, filtros))
      .sort((a, b) => b.indice - a.indice)
      .slice(0, porNicho);
    for (const p of escolhidas) {
      await adicionarNaFila(p, nicho.id);
      recentes.add(p.itemId);
      adicionados++;
    }
    log(`[autopilot] ${nicho.nome}: "${palavra}" → ${escolhidas.length} produto(s)`);
  }
  db.meta.ultimoAutopilot = Date.now();
  save();
  return { adicionados };
}

// ---------- disparos ----------
export async function disparar({ forcar = false } = {}) {
  const db = load();
  const r = db.config.ritmo;
  const t = agora();

  if (!forcar) {
    if (!db.config.ativo) return { enviados: 0, motivo: 'robô pausado' };
    if (!r.dias.includes(t.dow)) return { enviados: 0, motivo: 'fora dos dias' };
    if (t.hhmm < r.inicio || t.hhmm > r.fim) return { enviados: 0, motivo: 'fora da janela' };
    if (Date.now() - db.meta.ultimoDisparo < r.intervaloMin * 60000) return { enviados: 0, motivo: 'aguardando intervalo' };
  }

  const hoje = db.historico.filter((h) => h.data === t.data && h.status !== 'erro').length;
  let restante = r.tetoDia - hoje;
  if (restante <= 0) return { enviados: 0, motivo: 'teto diário atingido' };

  const ativos = db.config.canais.filter((c) => c.ativo);
  if (!ativos.length) return { enviados: 0, motivo: 'nenhum canal ativo' };

  // rodízio de grupos
  const qtd = r.gruposPorDisparo > 0 ? Math.min(r.gruposPorDisparo, ativos.length) : ativos.length;
  const canais = Array.from({ length: qtd }, (_, i) => ativos[(db.meta.cursorCanal + i) % ativos.length]);
  db.meta.cursorCanal = (db.meta.cursorCanal + qtd) % ativos.length;

  const itens = db.fila.filter((i) => i.status === 'na_fila').slice(0, r.produtosPorDisparo);
  if (!itens.length) return { enviados: 0, motivo: 'fila vazia' };

  let enviados = 0;
  for (const item of itens) {
    for (const canal of canais) {
      if (restante <= 0) break;
      const reg = { id: uid(), ts: Date.now(), data: t.data, hora: t.hhmm, itemId: item.itemId, nome: item.nome, canal: canal.nome, tipo: canal.tipo, link: item.link };
      try {
        const res = await enviar(canal, item);
        reg.status = res.simulado ? 'simulado' : 'enviado';
        enviados++;
        restante--;
      } catch (e) {
        reg.status = 'erro';
        reg.erro = e.message;
      }
      db.historico.push(reg);
      log(`[disparo] ${reg.status} → ${canal.nome}: ${item.nome}`);
      await new Promise((ok) => setTimeout(ok, 1500 + Math.random() * 2500)); // pausa humana entre grupos
    }
    item.status = 'concluido';
    item.enviadoEm = Date.now();
  }
  db.meta.ultimoDisparo = Date.now();
  db.historico = db.historico.slice(-5000);
  save();
  return { enviados };
}

// ---------- loop 24h ----------
export function iniciarLoop() {
  let ocupado = false;
  const ciclo = async () => {
    if (ocupado) return;
    ocupado = true;
    try {
      const db = load();
      if (db.config.ativo) {
        if (Date.now() - db.meta.ultimoAutopilot > 30 * 60000) await rodarAutopilot();
        await disparar();
      }
    } catch (e) {
      log('[loop] erro', e.message);
    } finally {
      ocupado = false;
    }
  };
  setInterval(ciclo, 60000);
  ciclo();
  log('[loop] robô iniciado, checando a cada 1 minuto');
}
