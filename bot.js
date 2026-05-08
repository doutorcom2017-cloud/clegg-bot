const express = require('express')
const axios = require('axios')
const app = express()
app.use(express.json())

const EVOLUTION_URL = process.env.EVOLUTION_URL || 'http://localhost:8080'
const EVOLUTION_KEY = process.env.EVOLUTION_KEY || 'clegg2024secret'
const INSTANCE = process.env.INSTANCE || 'clegg'
const PORT = process.env.PORT || 3000

console.log('EVOLUTION_URL:', EVOLUTION_URL)

app.post('/webhook/clegg', async (req, res) => {
  res.status(200).send('ok')
  try {
    const body = req.body
    if (body?.data?.key?.fromMe) return
    if (body?.event !== 'messages.upsert') return
    const msg = body?.data?.message?.conversation
    const tel = body?.data?.key?.remoteJid
    const nome = body?.data?.pushName || 'Cliente'
    if (!msg || !tel) return
    console.log('Mensagem de ' + nome + ': ' + msg)
    await axios.post(EVOLUTION_URL + '/message/sendText/' + INSTANCE,
      { number: tel, text: 'Ola ' + nome + '! Em breve retornamos!' },
      { headers: { apikey: EVOLUTION_KEY } }
    )
    console.log('Enviado para ' + nome)
  } catch (err) {
    console.error('Erro:', err.response?.data || err.message)
  }
})

app.get('/', (req, res) => res.send('Clegg Bot v4!'))
app.listen(PORT, () => console.log('Bot v4 porta ' + PORT))