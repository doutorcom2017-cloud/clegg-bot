const express = require('express')
const axios = require('axios')
const app = express()
app.use(express.json())

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
    await axios.post('http://localhost:8080/message/sendText/clegg',
      { number: tel, text: 'Ola ' + nome + '! Em breve retornamos!' },
      { headers: { apikey: 'clegg2024secret' } }
    )
    console.log('Enviado!')
  } catch (err) {
    console.error('Erro:', err.message)
  }
})

app.listen(3000, () => console.log('Bot rodando na porta 3000!'))