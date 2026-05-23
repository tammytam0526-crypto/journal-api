import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
)

export default async function handler(req, res) {
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
      content: `你陪伴我走完了 30 天的自我訪談計畫。以下是我們所有的對話紀錄：\n\n${historyText}\n\n請根據這 30 天的所有內容，為我寫一份自我畫像報告。\n\n要求：\n- 用第二人稱（你）寫，語氣溫柔如我們一路的對話\n- 不要列清單，不要分析框架，用流動的文字\n- 分成三到四個自然段落，每段聚焦在一個你觀察到的主題\n- 輕輕指出我在這 30 天裡可能沒有說破的東西\n- 結尾留一個問題，作為走向第 31 天的禮物\n- 長度：600-900 字`
    }]
  })

  return res.json({ reportMarkdown: message.content[0].text })
}
