const Anthropic = require('@anthropic-ai/sdk')
const { createClient } = require('@supabase/supabase-js')

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
)

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()

  const { deviceId } = req.query
  const { data: entries } = await supabase
    .from('entries').select('*')
    .eq('device_id', deviceId)
    .order('day_number').order('session_type')

  const historyText = entries.map(e => {
    const s = e.session_type === 'morning' ? '早上' : '晚上'
    return `【第${e.day_number}天 ${s}】\n你問：${e.ai_prompt}\n我答：${e.user_response || '（未作答）'}`
  }).join('\n\n')

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  const message = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 2000,
    messages: [{
      role: 'user',
      content: `你陪伴我走完了 30 天的自我訪談計畫。以下是所有對話紀錄：\n\n${historyText}\n\n請根據這 30 天的所有內容，為我寫一份自我畫像報告。要求：用第二人稱（你）、流動的文字、三到四個自然段落、輕輕指出我沒有說破的東西、結尾留一個問題，600-900字。`
    }]
  })

  return res.json({ reportMarkdown: message.content[0].text })
}
