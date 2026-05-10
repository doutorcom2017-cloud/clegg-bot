const express = require('express')
const axios = require('axios')
const multer = require('multer')
const xlsx = require('xlsx')
const app = express()
app.use(express.json())

const EVOLUTION_URL = process.env.EVOLUTION_URL || 'http://localhost:8080'
const EVOLUTION_KEY = process.env.EVOLUTION_KEY || 'clegg2024secret'
const INSTANCE = process.env.INSTANCE || 'clegg'
const PORT = process.env.PORT || 3000
const GROQ_KEY = process.env.GROQ_KEY || ''

console.log('Config:', { EVOLUTION_URL, INSTANCE })

// Histórico de conversas em memória
const historicos = {}
const upload = multer({ storage: multer.memoryStorage() })

// ─── Enviar mensagem WhatsApp ─────────────────────────────────────
async function enviarMensagem(telefone, texto) {
  await axios.post(
    `${EVOLUTION_URL}/message/sendText/${INSTANCE}`,
    { number: telefone, text: texto },
    { headers: { apikey: EVOLUTION_KEY } }
  )
}

// ─── Gerar resposta com IA (Groq) ─────────────────────────────────
async function gerarResposta(nome, mensagem, historico) {
  const system = `Você é Leonardo, um consultor especialista em planos de saúde.
Seu objetivo é vender planos de saúde para o cliente chamado ${nome}.

REGRAS IMPORTANTES:
- Seja simpático, natural e direto
- Máximo 3 linhas por resposta
- Nunca diga que é uma IA ou robô
- Ofereça planos individuais, familiares e empresariais
- Operadoras disponíveis: Unimed, Amil, SulAmérica, Bradesco Saúde, Porto Seguro
- Preços a partir de R$89/mês individual, R$180/mês familiar
- Sempre tente avançar na conversa e fechar a venda
- Se o cliente pedir cotação, pergunte: quantidade de pessoas e faixa etária

QUEBRA DE OBJEÇÕES:
- "Tá caro" → Compare com custo de internação sem plano (R$50.000+)
- "Já tenho plano" → Pergunte se está satisfeito, ofereça comparação
- "Não tenho interesse" → Pergunte se tem plano atualmente
- "Vou pensar" → Diga que tem condição especial só essa semana
- "Não tenho dinheiro" → Mostre opção mais barata (R$89/mês)`

  const messages = [
    ...historico.slice(-8),
    { role: 'user', content: mensagem }
  ]

  const resp = await axios.post(
    'https://api.groq.com/openai/v1/chat/completions',
    {
      model: 'llama-3.1-8b-instant',
      max_tokens: 200,
      messages: [{ role: 'system', content: system }, ...messages]
    },
    { headers: { Authorization: `Bearer ${GROQ_KEY}` } }
  )

  return resp.data.choices[0].message.content
}

// ─── Disparo inicial ───────────────────────────────────────────────
async function dispararLead(nome, telefone) {
  const mensagem = `Olá ${nome}! Tudo bem? 😊

Aqui é o Leonardo, consultor de saúde.

Tenho uma proposta de plano de saúde com cobertura completa e parcelas que cabem no bolso — a partir de R$89/mês! 🏥

É pra você sozinho ou vai incluir família também?`

  await enviarMensagem(telefone, mensagem)

  historicos[telefone] = [
    { role: 'assistant', content: mensagem }
  ]

  console.log(`✅ Disparo feito para ${nome} (${telefone})`)
}

// ─── Webhook: receber mensagens ────────────────────────────────────
app.post('/webhook/clegg', async (req, res) => {
  res.status(200).send('ok')
  try {
    const body = req.body
    if (body?.data?.key?.fromMe) return
    if (body?.event !== 'messages.upsert') return

    const msg = body?.data?.message?.conversation ||
                body?.data?.message?.extendedTextMessage?.text
    const tel = body?.data?.key?.remoteJid
    const nome = body?.data?.pushName || 'Cliente'

    if (!msg || !tel) return

    console.log(`📩 [${nome}] ${msg}`)

    if (!historicos[tel]) historicos[tel] = []

    const resposta = await gerarResposta(nome, msg, historicos[tel])

    historicos[tel].push(
      { role: 'user', content: msg },
      { role: 'assistant', content: resposta }
    )

    await enviarMensagem(tel, resposta)
    console.log(`✅ Resposta enviada para ${nome}`)

  } catch (err) {
    console.error('Erro webhook:', err.response?.data || err.message)
  }
})

// ─── Upload de planilha e disparo em massa ─────────────────────────
app.post('/disparar', upload.single('planilha'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ erro: 'Nenhum arquivo enviado' })

    const workbook = xlsx.read(req.file.buffer, { type: 'buffer' })
    const sheet = workbook.Sheets[workbook.SheetNames[0]]
    const dados = xlsx.utils.sheet_to_json(sheet)

    console.log(`📋 Planilha recebida com ${dados.length} contatos`)

    res.json({ mensagem: `Iniciando disparo para ${dados.length} contatos`, contatos: dados.length })

    // Disparar com intervalo de 3 segundos entre cada um
    for (let i = 0; i < dados.length; i++) {
      const linha = dados[i]
      const nome = linha.nome || linha.Nome || linha.NOME || 'Cliente'
      const telefone = String(linha.telefone || linha.Telefone || linha.TELEFONE || '').replace(/\D/g, '')

      if (!telefone) continue

      await new Promise(r => setTimeout(r, 3000 * i))
      try {
        await dispararLead(nome, `55${telefone}@s.whatsapp.net`)
      } catch (err) {
        console.error(`Erro ao disparar para ${nome}:`, err.message)
      }
    }

  } catch (err) {
    console.error('Erro upload:', err.message)
    res.status(500).json({ erro: err.message })
  }
})

// ─── Página de disparo ─────────────────────────────────────────────
app.get('/', (req, res) => {
  res.send(`
    <html>
    <head>
      <title>Clegg Bot - Disparo de Leads</title>
      <style>
        body { font-family: Arial; max-width: 600px; margin: 50px auto; padding: 20px; }
        h1 { color: #128C7E; }
        input, button { padding: 10px; margin: 10px 0; width: 100%; font-size: 16px; }
        button { background: #128C7E; color: white; border: none; cursor: pointer; border-radius: 5px; }
        button:hover { background: #075E54; }
        .info { background: #f0f0f0; padding: 15px; border-radius: 5px; margin: 20px 0; }
      </style>
    </head>
    <body>
      <h1>🤖 Clegg Bot - Disparo de Leads</h1>
      <div class="info">
        <b>Formato da planilha (.xlsx ou .csv):</b><br>
        Colunas obrigatórias: <b>nome</b> e <b>telefone</b><br>
        Telefone: apenas números com DDD (ex: 11999998888)
      </div>
      <form action="/disparar" method="post" enctype="multipart/form-data">
        <input type="file" name="planilha" accept=".xlsx,.csv" required>
        <button type="submit">🚀 Iniciar Disparo</button>
      </form>
    </body>
    </html>
  `)
})

// Rota para disparo individual
app.post('/disparar-individual', async (req, res) => {
  try {
    const { nome, telefone } = req.body
    if (!nome || !telefone) {
      return res.status(400).json({ erro: 'Nome e telefone são obrigatórios' })
    }

    const mensagem = `Olá ${nome}! Tudo bem? 😊

Aqui é o Leonardo, consultor de saúde.

Tenho uma proposta de plano de saúde com cobertura completa e parcelas que cabem no bolso — a partir de R$89/mês! 🏥

É pra você sozinho ou vai incluir família também?`

    await axios.post(
      `${EVOLUTION_URL}/message/sendText/${INSTANCE}`,
      { number: telefone, text: mensagem },
      { headers: { apikey: EVOLUTION_KEY } }
    )

    res.json({ sucesso: true, mensagem: 'Disparado com sucesso!' })
    console.log(`✅ Disparo enviado para ${nome} (${telefone})`)
  } catch (err) {
    console.error('Erro no disparo individual:', err.message)
    res.status(500).json({ erro: err.message })
  }
})

app.listen(PORT, () => console.log(`🤖 Clegg Bot v5 rodando na porta ${PORT}`))