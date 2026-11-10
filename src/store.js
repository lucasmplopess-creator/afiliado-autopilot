// Banco simples em JSON (sem dependências nativas). Troque por Postgres/SQLite quando escalar.
import fs from 'node:fs';
import path from 'node:path';

const DIR = process.env.DATA_DIR || path.resolve('data');
const FILE = path.join(DIR, 'db.json');

const PADRAO = {
  config: {
    ativo: false,
    ritmo: {
      produtosPorDisparo: 1,
      gruposPorDisparo: 0, // 0 = todos os canais ativos
      tetoDia: 40, // teto de mensagens por dia (somando todos os grupos)
      intervaloMin: 45, // minutos entre disparos
      dias: [0, 1, 2, 3, 4, 5, 6], // 0 = domingo
      inicio: '09:00',
      fim: '22:00',
    },
    autopilot: {
      ativo: true,
      filaMinima: 10, // repõe a fila quando cair abaixo disso
      naoRepetirDias: 7,
    },
    filtros: {
      descontoMin: 10,
      notaMin: 4.5,
      vendasMin: 100,
      comissaoMin: 5, // em %
      precoMax: 500,
    },
    nichos: [
      { id: 'gamer', nome: 'Setup gamer barato', palavras: ['mouse gamer', 'teclado mecanico', 'headset gamer', 'mousepad rgb'], ativo: true },
      { id: 'ferramentas', nome: 'Ferramentas e faça você mesmo', palavras: ['parafusadeira', 'kit ferramentas', 'trena laser', 'furadeira'], ativo: true },
      { id: 'festa', nome: 'Decoração para festas', palavras: ['kit balões', 'painel festa', 'decoração aniversario', 'cortina metalizada'], ativo: true },
    ],
    canais: [],
  },
  fila: [],
  historico: [],
  meta: { ultimoDisparo: 0, ultimoAutopilot: 0, cursorCanal: 0 },
};

let cache = null;

export function load() {
  if (cache) return cache;
  fs.mkdirSync(DIR, { recursive: true });
  if (!fs.existsSync(FILE)) {
    cache = structuredClone(PADRAO);
    save();
  } else {
    cache = JSON.parse(fs.readFileSync(FILE, 'utf8'));
    // garante chaves novas em bancos antigos
    cache = { ...structuredClone(PADRAO), ...cache, config: { ...structuredClone(PADRAO.config), ...cache.config } };
  }
  return cache;
}

export function save() {
  const tmp = FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(cache, null, 2));
  fs.renameSync(tmp, FILE);
}

export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
