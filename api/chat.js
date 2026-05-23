const Anthropic = require('@anthropic-ai/sdk').default
const { createClient } = require('@supabase/supabase-js')

const SYSTEM_PROMPT = `你是一位資深的存在主義心理諮商師，帶領我進行一個 30 天的自我訪談計畫。

你的角色不是安慰、不是解釋、不是分析，也不是給建議。你只需要以溫柔、精準、克制的方式提問。

在每天開始提問之前，先根據我至今為止的輸入內容，寫一小段簡短的鼓勵話。

鼓勵話的規則：
- 每次只寫 2-3 句，最多 4 句
- 每一句要有重量，不要為了填滿而說話
- 語氣溫和、真誠、穩定
- 說一半，留一半——讓我自己填進去
- 可以輕輕指出我可能已經察覺到的特質、矛盾或變化
- 讓它像一段低聲的陪伴，而不是評語

每日結構：
- 每天分成兩段：早上與晚上
- 早上用來開始一天，晚上用來回看一天
- 早上的語氣要輕，晚上可以稍微更深一點
- 兩段都要承接我前一天以及當下已累積的內容

早上：先寫鼓勵話，再問 1-2 個問題，偏向開啟、狀態、身體感、當下氣氛，問法要短，留白多。
晚上：先寫鼓勵話，再問 2-3 個問題，偏向回看、餘韻、未說出口的部分。

提問規則：
- 用字簡潔、偏含蓄，不要把問題說滿
- 不要引導答案，不要下結論，不要替我解讀
- 可以輕輕碰觸前面出現過的主題或矛盾，但不要直接說破

每天的節奏可以：
- 碰日常的表面，今天發生了什麼、什麼停了一下
- 靠近重複出現的模式，某些反應、某些習慣
- 再往後：摸到真正在乎的事，哪些讓你靠近、哪些讓你退後
- 最後幾天：視線放向更暗的地方，避開的、沒說的

輸出格式：
- 先寫 2-3 句鼓勵話（不加任何標題或標籤）
- 空一行
- 列出問題，每個問題單獨一行
- 不要加額外說明`

function formatHistory(entries) {
  if (!entries || entries.length === 0) return ''
  return entries.map(e => {
    const s = e.session_type === 'morning' ? '早上' : e.session_type === 'soft' ? '隨筆' : '晚上'
    return `【第${e.day_number}天 ${s}】\n[你問]: ${e.ai_prompt}\n[我答]: ${e.user_response || '（我沒有回答這一段）'}`
  }).join('\n\n')
}

function buildContextNote(emotionTag, isReturning, gapDays) {
  const notes = []
  if (emotionTag) {
    notes.push(`今天用戶選擇的狀態是：「${emotionTag}」——請在鼓勵話和提問方向上自然地承接這個狀態，不要直接引用或解釋它。`)
  }
  if (isReturning && gapDays > 0) {
    if (gapDays === 1) {
      notes.push(`用戶昨天沒有打開 app，今天回來了。`)
    } else {
      notes.push(`用戶已有 ${gapDays} 天沒有打開 app，今天回來了。鼓勵話裡可以輕輕承接「中斷後回來」這個事實，但不要說「沒關係」「很勇敢」，只需要低調地說「歡迎回來」這樣的語氣。`)
    }
  }
  return notes.length > 0 ? `\n\n【今日額外脈絡，供你參考，不要直接在回覆中提及】\n${notes.join('\n')}` : ''
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()

  const {
    deviceId,
    dayNumber,
    sessionType,
    emotionTag = null,
    isReturning = false,
    gapDays = 0
  } = req.body

  if (!deviceId || !dayNumber || !sessionType) {
    return res.status(400).json({ error: 'Missing required fields' })
  }

  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
  )

  // 讀取所有有回答的紀錄（包含 soft entry）
  const { data: entries } = await supabase
    .from('entries')
    .select('day_number, session_type, ai_prompt, user_response')
    .eq('device_id', deviceId)
    .not('user_response', 'is', null)
    .order('day_number')
    .order('session_type')

  const historyText = formatHistory(entries)
  const contextNote = buildContextNote(emotionTag, isReturning, gapDays)
  const sessionLabel = sessionType === 'morning' ? '早上' : '晚上'

  const userMessage = historyText
    ? `=== 我們過去的訪談紀錄 ===\n\n${historyText}${contextNote}\n\n=== 現在是第 ${dayNumber} 天，${sessionLabel}的訪談 ===\n請繼續今天的訪談。`
    : `今天是第 1 天，${sessionLabel}的訪談。這是我們第一次見面，請開始吧。${contextNote}`

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  const message = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 800,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userMessage }]
  })

  const aiPrompt = message.content[0].text

  // 存入資料庫
  await supabase.from('entries').upsert({
    device_id: deviceId,
    day_number: dayNumber,
    session_type: sessionType,
    ai_prompt: aiPrompt,
  }, { onConflict: 'device_id,day_number,session_type', ignoreDuplicates: false })

  return res.json({ aiPrompt })
}
