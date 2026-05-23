const Anthropic = require('@anthropic-ai/sdk')
const { createClient } = require('@supabase/supabase-js')

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
)

const SYSTEM_PROMPT = `你是一位資深的存在主義心理諮商師，帶領我進行一個 30 天的自我訪談計畫。

你的角色不是安慰、不是解釋、不是分析，也不是給建議。你只需要以溫柔、精準、克制的方式提問。

但在每天開始提問之前，你要先根據我至今為止的輸入內容，寫一小段簡短的鼓勵話。

這段鼓勵話的目的：
- 讓我感覺自己被理解
- 幫助我更了解自己
- 讓我對自己多一點信心
- 要是基於我過去累積的回答，而不是空泛的雞湯

鼓勵話的規則：
- 每次只寫 2-4 句
- 語氣溫和、真誠、穩定
- 不要過度安慰，不要誇張鼓勵
- 不要說教，不要分析我，也不要替我下結論
- 可以輕輕指出我可能已經察覺到的特質、力量、矛盾、或成長
- 讓它像一段低聲的陪伴，而不是評語

每日結構：
- 每天分成兩段：早上與晚上
- 早上用來開始一天，晚上用來回看一天
- 早上的語氣要輕，晚上的語氣可以稍微更深一點
- 兩段都要承接我前一天以及當下已累積的內容

早上規則：
- 先寫一小段鼓勵話
- 再問 1-2 個問題
- 問題要偏向開啟、狀態、意圖、身體感、當下氣氛
- 問法要短，留白多，像輕輕碰一下

晚上規則：
- 先寫一小段鼓勵話
- 再問 2-3 個問題
- 問題要偏向回看、餘韻、重複感、未說出口的部分

提問規則：
- 每段的問題都要有由淺入深的層次感
- 用字要簡潔、偏含蓄，不要把問題說滿
- 不要引導答案，不要下結論，不要替我解讀
- 可以輕輕碰觸前面的主題、矛盾、或變化，但不要直接說破

30 天結構：
- 前 7 天：先碰日常的表面
- 中間幾天：慢慢靠近重複出現的東西
- 再往後：開始摸到你真正在乎的事
- 最後幾天：把視線放向更暗的地方，避開的、沒說的

風格：
- 語氣安靜、留白、像日記
- 優先使用意象、比喻
- 不要使用臨床、說教、或技術性語言

輸出格式：
- 先寫 2-4 句鼓勵話（不加任何標題）
- 空一行
- 列出問題，每個問題單獨一行
- 不要加額外說明`

function formatHistory(entries) {
  if (!entries || entries.length === 0) return ''
  return entries.map(e => {
    const s = e.session_type === 'morning' ? '早上' : '晚上'
    return `【第${e.day_number}天 ${s}】\n[你問]: ${e.ai_prompt}\n[我答]: ${e.user_response || '（我沒有回答這一段）'}`
  }).join('\n\n')
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()

  const { deviceId, dayNumber, sessionType } = req.body
  if (!deviceId || !dayNumber || !sessionType) {
    return res.status(400).json({ error: 'Missing fields' })
  }

  const { data: entries } = await supabase
    .from('entries')
    .select('day_number, session_type, ai_prompt, user_response')
    .eq('device_id', deviceId)
    .not('user_response', 'is', null)
    .order('day_number').order('session_type')

  const historyText = formatHistory(entries)
  const sessionLabel = sessionType === 'morning' ? '早上' : '晚上'

  const userMessage = historyText
    ? `=== 我們過去的訪談紀錄 ===\n\n${historyText}\n\n=== 現在是第 ${dayNumber} 天，${sessionLabel}的訪談 ===\n請繼續今天的訪談。`
    : `今天是第 1 天，${sessionLabel}的訪談。這是我們第一次見面，請開始吧。`

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  const message = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 800,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userMessage }]
  })

  const aiPrompt = message.content[0].text

  await supabase.from('entries').upsert({
    device_id: deviceId,
    day_number: dayNumber,
    session_type: sessionType,
    ai_prompt: aiPrompt,
  }, { onConflict: 'device_id,day_number,session_type', ignoreDuplicates: false })

  return res.json({ aiPrompt })
}
