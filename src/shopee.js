// Integração com a Shopee Affiliate Open API (GraphQL).
// Sem credenciais, roda em MODO SIMULAÇÃO com produtos fictícios para testar o fluxo.
import crypto from 'node:crypto';

const ENDPOINT = process.env.SHOPEE_ENDPOINT || 'https://open-api.affiliate.shopee.com.br/graphql';
const APP_ID = process.env.SHOPEE_APP_ID;
const SECRET = process.env.SHOPEE_SECRET;

export const modoSimulacao = () => !(APP_ID && SECRET);

// sortType da API: 1 relevância, 2 mais vendidos, 3 maior preço, 4 menor preço, 5 maior comissão
export const ORDENACAO = { relevancia: 1, vendidos: 2, precoMaior: 3, precoMenor: 4, comissao: 5 };

async function gql(query) {
  const payload = JSON.stringify({ query });
  const ts = Math.floor(Date.now() / 1000);
  const assinatura = crypto.createHash('sha256').update(`${APP_ID}${ts}${payload}${SECRET}`).digest('hex');
  const r = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `SHA256 Credential=${APP_ID}, Timestamp=${ts}, Signature=${assinatura}`,
    },
    body: payload,
  });
  const j = await r.json();
  if (j.errors?.length) throw new Error('Shopee API: ' + j.errors.map((e) => e.message).join('; '));
  return j.data;
}

function normalizar(n) {
  const preco = Number(n.priceMin ?? n.price ?? 0);
  const desconto = Number(n.priceDiscountRate ?? 0);
  return {
    itemId: String(n.itemId),
    nome: n.productName,
    imagem: n.imageUrl,
    loja: n.shopName,
    preco,
    precoOriginal: desconto > 0 && desconto < 100 ? +(preco / (1 - desconto / 100)).toFixed(2) : null,
    desconto,
    comissaoPct: +(Number(n.commissionRate ?? 0) * 100).toFixed(1),
    comissaoValor: Number(n.commission ?? 0),
    vendas: Number(n.sales ?? 0),
    nota: Number(n.ratingStar ?? 0),
    linkProduto: n.productLink,
    linkOferta: n.offerLink,
  };
}

// Índice próprio para ranquear oportunidades (o "Maior índice" do vídeo)
export function indice(p) {
  const com = Math.min(p.comissaoPct / 20, 1); // 20% de comissão = nota máxima
  const ven = Math.min(Math.log10(p.vendas + 1) / 4, 1); // 10 mil vendas = máximo
  const des = Math.min(p.desconto / 60, 1);
  const nota = Math.max(0, (p.nota - 4) / 1);
  return Math.round((com * 0.4 + ven * 0.3 + des * 0.2 + nota * 0.1) * 100);
}

export async function buscarOfertas({ keyword = '', ordenar = 'comissao', pagina = 1, limite = 20 } = {}) {
  if (modoSimulacao()) return simular(keyword, limite);
  const q = `{ productOfferV2(keyword: ${JSON.stringify(keyword)}, sortType: ${ORDENACAO[ordenar] || 5}, page: ${pagina}, limit: ${limite}) {
    nodes { itemId productName commissionRate commission price priceMin priceMax sales imageUrl shopName productLink offerLink ratingStar priceDiscountRate }
    pageInfo { page limit hasNextPage } } }`;
  const d = await gql(q);
  return d.productOfferV2.nodes.map(normalizar).map((p) => ({ ...p, indice: indice(p) }));
}

export async function gerarLinkCurto(urlOrigem, subIds = []) {
  if (modoSimulacao()) return `https://s.shopee.com.br/SIM${Math.random().toString(36).slice(2, 8)}`;
  const subs = subIds.slice(0, 5).map((s) => JSON.stringify(String(s).replace(/[^a-zA-Z0-9]/g, '').slice(0, 30)));
  const q = `mutation { generateShortLink(input: { originUrl: ${JSON.stringify(urlOrigem)}, subIds: [${subs.join(',')}] }) { shortLink } }`;
  const d = await gql(q);
  return d.generateShortLink.shortLink;
}

// ---------- simulação ----------
function simular(keyword, limite) {
  const base = keyword || 'produto';
  return Array.from({ length: limite }, (_, i) => {
    const preco = +(15 + Math.random() * 180).toFixed(2);
    const desconto = Math.floor(Math.random() * 55);
    const p = {
      itemId: `SIM${base.replace(/\W/g, '')}${i}`,
      nome: `${base.replace(/\b\w/g, (c) => c.toUpperCase())} Modelo ${String.fromCharCode(65 + i)} Premium`,
      imagem: `https://picsum.photos/seed/${encodeURIComponent(base + i)}/600/600`,
      loja: 'Loja Simulada',
      preco,
      precoOriginal: desconto ? +(preco / (1 - desconto / 100)).toFixed(2) : null,
      desconto,
      comissaoPct: +(3 + Math.random() * 15).toFixed(1),
      comissaoValor: 0,
      vendas: Math.floor(Math.random() * 8000),
      nota: +(4 + Math.random()).toFixed(1),
      linkProduto: 'https://shopee.com.br/',
      linkOferta: 'https://shopee.com.br/',
    };
    p.comissaoValor = +((p.preco * p.comissaoPct) / 100).toFixed(2);
    p.indice = indice(p);
    return p;
  });
}
