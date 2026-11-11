// Gera a mensagem de venda. Com ANTHROPIC_API_KEY usa IA; sem chave, usa modelos que se alternam.
const KEY = process.env.ANTHROPIC_API_KEY;
const MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-5-5';

const brl = (v) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export async function gerarCopy(p, nicho, link) {
  if (KEY) {
    try {
      return await copyIA(p, nicho, link);
    } catch (e) {
      console.warn('[copy] IA falhou, usando modelo pronto:', e.message);
    }
  }
  return copyModelo(p, link);
}

async function copyIA(p, nicho, link) {
  const prompt = `Escreva UMA mensagem de oferta para grupo de WhatsApp de promoções (nicho: ${nicho?.nome || 'geral'}).
Produto: ${p.nome}
Preço atual: ${brl(p.preco)}${p.precoOriginal ? ` (antes ${brl(p.precoOriginal)}, ${p.desconto}% OFF)` : ''}
${p.nota ? `Avaliação: ${p.nota} estrelas, ${p.vendas || 0} vendidos.` : ''}
Regras: máximo 6 linhas curtas; primeira linha é um gancho forte em CAIXA ALTA com 1 emoji; uma linha com o benefício principal; uma linha com preço "de/por"; uma linha de urgência honesta (sem inventar estoque ou prazo); última linha exatamente: 🛒 ${link}
Não use travessões. Não use hashtags. Responda só com a mensagem.`;
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model: MODEL, max_tokens: 400, messages: [{ role: 'user', content: prompt }] }),
  });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error?.message || r.status);
  let txt = j.content.map((c) => c.text || '').join('').trim().replace(/[—–]/g, ',');
  if (!txt.includes(link)) txt += `\n🛒 ${link}`;
  return txt;
}

const GANCHOS = ['🔥 ACHADO DO DIA', '⚡ PREÇO DESPENCOU', '🚨 OFERTA RELÂMPAGO', '💥 BAIXOU DEMAIS', '✅ VALE CADA CENTAVO'];

function copyModelo(p, link) {
  const g = GANCHOS[Math.floor(Math.random() * GANCHOS.length)];
  const preco = p.precoOriginal
    ? `De ~${brl(p.precoOriginal)}~ por *${brl(p.preco)}* (${p.desconto}% OFF)`
    : `Por apenas *${brl(p.preco)}*`;
  const prova = p.nota ? (p.vendas > 0 ? `⭐ ${p.nota} | +${p.vendas.toLocaleString('pt-BR')} vendidos` : `⭐ ${p.nota}`) : '';
  return `${g}\n\n*${p.nome}*\n\n💰 ${preco}${prova ? `\n${prova}` : ''}\n\n🛒 ${link}`;
}
