# Afiliado Autopilot

Robô de divulgação de afiliados Shopee que trabalha sozinho: busca as melhores ofertas, gera o link de afiliado, escreve a legenda e dispara nos seus grupos de WhatsApp e Telegram, respeitando o ritmo que você definir.

Réplica funcional do sistema mostrado no vídeo de referência.

---

## 1. O que o vídeo mostra e como foi replicado

| Tela do vídeo | O que faz | No Afiliado Autopilot |
|---|---|---|
| **Produtos** (busca ofertas da Shopee, filtros Maior índice, Maior desconto, Mais vendidos, Maior comissão) | Encontra produtos com potencial de venda | Aba **Produtos** + índice próprio (comissão 40%, vendas 30%, desconto 20%, nota 10%) |
| **Ritmo dos disparos** (produtos por disparo, grupos por disparo, teto de mensagens/dia, dias da semana, janela de horário) | Controla volume para não ser banido | Aba **Ritmo dos disparos**, com os mesmos campos + intervalo e rodízio de grupos |
| **Agendamentos** (fila com status "Concluído") | Disparos automáticos em grupos de WhatsApp | Aba **Fila** + **Histórico** com status enviado, simulado ou erro |
| **Canais & Templates** | Onde publicar | Aba **Canais** (WhatsApp e Telegram) |
| "Conectei, configurei e ele trabalha sozinho" | Piloto automático 24h | Motor que repõe a fila a cada 30 min e dispara a cada minuto checado |
| **Imagens IA** (cenários "na mão", "no sofá", "na cozinha") | Foto de produto mais vendedora | Fase 2 (ver roadmap). Hoje usa a foto oficial do produto |

---

## 2. Estratégia de operação

**Fase 1: Base (semana 1)**
1. Ativar conta de afiliado e a Open API da Shopee.
2. Criar 1 grupo de WhatsApp e 1 canal de Telegram por nicho (gamer, ferramentas, festas).
3. Rodar com ritmo conservador: 1 produto a cada 45 min, das 09h às 22h, teto de 40 mensagens/dia.

**Fase 2: Tração (semanas 2 a 4)**
1. Olhar o painel "Minha Renda" da Shopee e cortar palavras de busca que não convertem.
2. Subir para 2 a 3 grupos por nicho e usar rodízio (grupos por disparo = 1).
3. Divulgar os grupos em Reels/TikTok com conteúdo de "achadinhos" para encher os grupos.

**Fase 3: Escala**
1. Imagens de cenário com IA, cupons e relatórios por canal (subIds já vêm marcados por nicho).
2. Transformar em SaaS com assinatura, como o app do vídeo faz.

**Regra de ouro anti bloqueio no WhatsApp:** número dedicado e aquecido, no máximo 1 mensagem a cada 30 a 45 min por grupo, nada de disparo em contato privado.

---

## 3. Como colocar no ar (24h)

### 3.1 Credenciais
| Serviço | Onde pegar | Variáveis |
|---|---|---|
| Shopee Afiliados | affiliate.shopee.com.br → Open API | `SHOPEE_APP_ID`, `SHOPEE_SECRET` |
| WhatsApp | Evolution API (gratuita, self hosted). Conecte o número lendo o QR Code | `EVOLUTION_URL`, `EVOLUTION_APIKEY`, `EVOLUTION_INSTANCE` |
| Telegram | @BotFather → /newbot. Adicione o bot como admin do canal | `TELEGRAM_BOT_TOKEN` |
| IA das legendas (opcional) | console.anthropic.com | `ANTHROPIC_API_KEY` |

### 3.2 Hospedagem no Railway (dá para fazer pelo celular)
1. Entre em railway.com com sua conta do GitHub.
2. **New Project → Deploy from GitHub repo →** `afiliado-autopilot`.
3. No serviço criado: **Settings → Volumes → Add Volume**, caminho `/app/data`.
4. **Variables**: `DATA_DIR=/app/data`, `PAINEL_SENHA=...`, `TZ_APP=America/Sao_Paulo` e as chaves que você já tiver.
5. **Settings → Networking → Generate Domain**. Esse é o endereço do seu painel (usuário: qualquer, senha: `PAINEL_SENHA`).

### 3.3 WhatsApp com Evolution API
1. No mesmo projeto do Railway: **Create → Template →** pesquise "Evolution API" e faça o deploy.
2. Nas variáveis da Evolution, anote `AUTHENTICATION_API_KEY` e gere o domínio dela.
3. No serviço do robô, preencha `EVOLUTION_URL` (domínio da Evolution com https), `EVOLUTION_APIKEY` (a chave anotada) e `EVOLUTION_INSTANCE=robo`.
4. Abra o painel → **Canais → WhatsApp do robô** → digite o número → **Gerar código de conexão**.
5. No celular do robô: WhatsApp → Aparelhos conectados → Conectar com número de telefone → digite o código.
6. Toque em **Buscar meus grupos** e adicione os grupos com 1 toque.

### 3.4 Ligar o robô
1. **Nichos e filtros**: ajuste palavras e filtros.
2. **Painel** → "Abastecer fila agora" e confira as legendas na **Fila** (dá para editar tocando no texto).
3. Toque em **Pausado** no topo para virar **Trabalhando 24h**.

**Trava de segurança:** enquanto a Shopee estiver em modo simulação (sem `SHOPEE_APP_ID` e `SHOPEE_SECRET`), nada é enviado aos grupos reais.

## 4. Observação importante
Os nomes de campos da Open API da Shopee (`productOfferV2`, `generateShortLink`) seguem a documentação pública do programa no Brasil. Se a Shopee alterar algo, o ajuste fica concentrado em `src/shopee.js`.

## 5. Roadmap
1. Imagens de cenário com IA por produto
2. Relatório de conversões via `conversionReport` da API
3. Multiusuário com login e planos de assinatura (versão SaaS para revenda)
