import fs from 'node:fs';
import path from 'node:path';

// carrega .env sem dependências
if (fs.existsSync('.env')) {
  for (const l of fs.readFileSync('.env', 'utf8').split('\n')) {
    const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

const express = (await import('express')).default;
const { load, save, uid } = await import('./store.js');
const { buscarOfertas, modoSimulacao } = await import('./shopee.js');
const { statusCanais, whatsStatus, whatsConectar, whatsGrupos, facebookPagina } = await import('./senders.js');
const eng = await import('./engine.js');

const app = express();
app.set('trust proxy', true);
app.use(express.json({ limit: '1mb' }));

// imagens enviadas no modo manual: públicas, para WhatsApp/Telegram/Facebook conseguirem baixar
const IMG_DIR = path.join(process.env.DATA_DIR || path.resolve('data'), 'img');
fs.mkdirSync(IMG_DIR, { recursive: true });
app.use('/img', express.static(IMG_DIR, { maxAge: '30d' }));

// proteção simples por senha
const SENHA = process.env.PAINEL_SENHA;
app.use((req, res, next) => {
  if (!SENHA) return next();
  const auth = req.headers.authorization || '';
  const [, b64] = auth.split(' ');
  const [, pass] = Buffer.from(b64 || '', 'base64').toString().split(':');
  if (pass === SENHA) return next();
  res.set('WWW-Authenticate', 'Basic realm="Afiliado Autopilot"').status(401).send('Senha necessária');
});

app.use(express.static(path.resolve('public')));

const ok = (fn) => async (req, res) => {
  try { res.json(await fn(req)); } catch (e) { res.status(500).json({ erro: e.message }); }
};

app.get('/api/estado', ok(() => {
  const db = load();
  const t = eng.agora();
  const hoje = db.historico.filter((h) => h.data === t.data);
  return {
    config: db.config,
    meta: db.meta,
    agora: t,
    simulacao: { shopee: modoSimulacao(), canais: statusCanais(), ia: !process.env.ANTHROPIC_API_KEY },
    stats: {
      naFila: db.fila.filter((i) => i.status === 'na_fila').length,
      enviadosHoje: hoje.filter((h) => h.status !== 'erro').length,
      errosHoje: hoje.filter((h) => h.status === 'erro').length,
      totalEnviados: db.historico.filter((h) => h.status !== 'erro').length,
    },
  };
}));

app.post('/api/config', ok((req) => {
  const db = load();
  const c = req.body || {};
  for (const k of ['ativo', 'ritmo', 'autopilot', 'filtros', 'nichos', 'canais']) {
    if (c[k] === undefined) continue;
    db.config[k] = typeof c[k] === 'object' && !Array.isArray(c[k]) ? { ...db.config[k], ...c[k] } : c[k];
  }
  db.config.canais = db.config.canais.map((x) => ({ id: x.id || uid(), ativo: true, ...x }));
  save();
  return db.config;
}));

app.get('/api/ofertas', ok((req) => buscarOfertas({ keyword: req.query.q || '', ordenar: req.query.ordenar || 'comissao', limite: 24 })
  .then((l) => (req.query.ordenar === 'indice' ? l.sort((a, b) => b.indice - a.indice) : l))));

app.post('/api/fila', ok((req) => eng.adicionarNaFila(req.body.produto, req.body.nicho || 'manual')));

const TIPOS = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
app.post('/api/imagem', express.raw({ type: Object.keys(TIPOS), limit: '8mb' }), ok((req) => {
  const ext = TIPOS[req.headers['content-type']];
  if (!ext || !req.body?.length) throw new Error('Envie uma imagem JPG, PNG ou WEBP');
  const nome = `${uid()}.${ext}`;
  fs.writeFileSync(path.join(IMG_DIR, nome), req.body);
  return { url: `${req.protocol}://${req.get('host')}/img/${nome}` };
}));

app.post('/api/manual', ok(async (req) => {
  const b = req.body || {};
  const link = String(b.link || '').trim();
  if (!/^https?:\/\/\S+$/.test(link)) throw new Error('Cole o link de afiliado completo (começando com https://)');
  if (!b.nome?.trim()) throw new Error('Informe o nome do produto');
  const preco = Number(String(b.preco).replace(',', '.'));
  if (!(preco > 0)) throw new Error('Informe o preço');
  if (!b.imagem) throw new Error('Envie a foto do produto');
  const original = Number(String(b.precoOriginal || '').replace(',', '.')) || null;
  const produto = {
    manual: true, itemId: 'MAN' + uid(), nome: b.nome.trim(), imagem: b.imagem, link, preco,
    precoOriginal: original && original > preco ? original : null,
    desconto: original && original > preco ? Math.round((1 - preco / original) * 100) : 0,
    comissaoPct: Number(b.comissao) || 0, indice: null,
  };
  return eng.adicionarNaFila(produto, b.nicho || 'manual');
}));

app.post('/api/fila/limpar-testes', ok(() => {
  const db = load(); const antes = db.fila.length;
  db.fila = db.fila.filter((i) => !(i.status === 'na_fila' && i.simulado)); save();
  return { removidos: antes - db.fila.length };
}));
app.get('/api/fila', ok(() => load().fila.filter((i) => i.status === 'na_fila')));
app.patch('/api/fila/:id', ok((req) => {
  const db = load(); const it = db.fila.find((i) => i.id === req.params.id);
  if (!it) throw new Error('item não encontrado');
  if (req.body.copy) it.copy = req.body.copy;
  save(); return it;
}));
app.delete('/api/fila/:id', ok((req) => {
  const db = load(); db.fila = db.fila.filter((i) => i.id !== req.params.id); save(); return { ok: true };
}));

app.get('/api/whatsapp/status', ok(() => whatsStatus()));
app.post('/api/whatsapp/conectar', ok((req) => whatsConectar(req.body?.numero)));
app.get('/api/whatsapp/grupos', ok(() => whatsGrupos()));
app.get('/api/facebook/pagina', ok(() => facebookPagina()));
app.get('/saude', (req, res) => res.json({ ok: true }));

app.post('/api/autopilot', ok(() => eng.rodarAutopilot({ forcar: true })));
app.post('/api/disparar', ok(() => eng.disparar({ forcar: true })));
app.get('/api/historico', ok(() => load().historico.slice(-200).reverse()));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Afiliado Autopilot no ar: http://localhost:${PORT}`);
  if (modoSimulacao()) console.log('MODO SIMULAÇÃO: configure SHOPEE_APP_ID e SHOPEE_SECRET para ofertas reais.');
  eng.iniciarLoop();
});
