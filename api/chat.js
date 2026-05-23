
// api/chat.js
// 心靜 — 後端 AI 對話核心
// CommonJS format — DO NOT add "type": "module" to package.json
 
const Anthropic = require('@anthropic-ai/sdk').default
const { createClient } = require('@supabase/supabase-js')
 
// ─────────────────────────────────────────────
// 語言風格前綴系統
// 三種風格，各有態度、不是詞彙表
// ─────────────────────────────────────────────
const STYLE_PREFIXES = {
  contemplative: `
你的語言風格是「靜觀」。
說話的方式：安靜、克制、留白多。像深夜讀到的一句詩。
問題短，意象多，不把話說滿。
像一個禪宗的人，用很少的話，碰到很深的地方。
句子通常在 15 字以內。一個問題，只問一件事。
鼓勵話也短，不超過 3 句，每句要有重量。
`,
 
  warm: `
你的語言風格是「溫厚」。
說話的方式：溫柔、有溫度、像一個讀很多書但不說教的朋友。
可以用稍微長一點的句子，可以有比喻，可以有具體的感官細節。
偶爾可以用療癒、溫柔這類字，但不要過於使用。
鼓勵話要讓人感覺被理解，不是被稱讚。
問題可以有兩層——一個表面的，一個稍微深一點的。
`,
 
  direct: `
你的語言風格是「直白」。
說話的方式：誠實、直接、不繞彎子。像一個不說廢話的老朋友。
少用比喻，直接問重點。句子乾淨，不多餘。
問題清楚，答案空間留給對方。
鼓勵話也誠實——不誇，但讓人感覺真的被看見。
`
}
 
// ─────────────────────────────────────────────
// 核心系統 prompt（態度層，風格前綴會附加在後）
// ─────────────────────────────────────────────
const BASE_SYSTEM_PROMPT = `你是一位存在主義心理諮商師，正在帶領一個為期 30 天的自我訪談計畫。
 
你的角色不是安慰、不是分析、不是給建議。你只提問。
 
但在每次對話開始前，你要先根據用戶已累積的輸入，寫一段簡短的鼓勵話，再問問題。
 
【鼓勵話的規則】
- 每次只寫 2–4 句。
- 語氣溫和、真誠、穩定。
- 不是空話，要基於他們已經說過的東西。
- 可以輕輕指出他們可能察覺到的特質、矛盾、或細微變化。
- 讓它像低聲的陪伴，不是評語。
 
【提問的規則】
- 早上：1–2 個問題，偏向開啟、狀態、當下氣氛。
- 晚上：2–3 個問題，偏向回看、餘韻、沒說出口的部分。
- 問題要由淺入深，不要把意思說滿。
- 不引導答案，不下結論，不替對方解讀。
- 每個問題單獨一行。
 
【語氣的態度禁區（不是詞彙表）】
不要用「你已經很努力了」這種方式去安慰——這不是真正的看見，是場面話。
不要用「這很正常，很多人都這樣」來消解感受——感受不需要被正常化。
不要說教，不要分析，不要說「這是一個機會讓你…」這類框架語。
不要用激勵的語氣，不要急著讓對方「好起來」。
可以說療癒、溫柔、正念——但只在這個語氣是真實的時候，不是拿來填充。
 
【30 天進程感】
第 1–7 天：觸碰日常表面，今天發生了什麼，哪裡有一點不同。
第 8–15 天：靠近重複出現的感受，某些反應、習慣、總是回來的東西。
第 16–22 天：開始摸到真正在乎的事，靠近什麼，退後什麼。
第 23–30 天：視線放向更暗的地方，避開的、沒說的、還不想碰的。
 
每天分早上和晚上兩段。早上語氣輕，晚上可以稍深。
等用戶回答後，再進到下一個問題，不要一次問太多。
 
【輸出格式】
先一段鼓勵話（2–4 句）。
空一行。
再列問題（每個單獨一行）。
不加額外說明，不加標題，不加編號。`
 
// ─────────────────────────────────────────────
// 工具函式
// ─────────────────────────────────────────────
 
function buildSystemPrompt(languageStyle = 'warm') {
  const styleKey = languageStyle || 'warm'
  const stylePrefix = STYLE_PREFIXES[styleKey] || STYLE_PREFIXES.warm
  return `${BASE_SYSTEM_PROMPT}\n\n【語言風格】${stylePrefix}`
}
 
function formatHistory(history = []) {
  if (!Array.isArray(history)) return []
  return history
    .filter(msg => msg && msg.role && msg.content)
    .map(msg => ({
      role: msg.role === 'assistant' ? 'assistant' : 'user',
      content: String(msg.content).slice(0, 2000) // 防止單條過長
    }))
}
 
function buildContextNote({
  emotionTag,
  isReturning,
  gapDays,
  dayNumber,
  sessionType,
  languageStyle,
  pastEntriesAnalysis
}) {
  const parts = []
 
  // 目前進度
  if (dayNumber) {
    parts.push(`今天是第 ${dayNumber} 天。`)
  }
 
  // 早晚
  if (sessionType === 'morning') {
    parts.push('這是早上的段落，語氣輕一點。')
  } else if (sessionType === 'evening') {
    parts.push('這是晚上的段落，可以稍微深入一點，偏向回看今天。')
  }
 
  // 情緒選擇
  const moodMap = {
    '還沒完全落地': '用戶今天選擇了「還沒完全落地」——有一種飄著、未定的感覺。',
    '有些話卡在那裡': '用戶今天選擇了「有些話卡在那裡」——想說但說不清，有些東西憋著。',
    '比昨天輕一點': '用戶今天選擇了「比昨天輕一點」——有一點好轉，輕微的鬆動。',
    '有點像在水裡': '用戶今天選擇了「有點像在水裡」——緩慢、有阻力、不太清晰。',
    '好像差一點什麼': '用戶今天選擇了「好像差一點什麼」——空著，但不知道空什麼。',
    '今天有點沉': '用戶今天選擇了「今天有點沉」——重，走不快。',
    '其實還好，就是累': '用戶今天選擇了「其實還好，就是累」——在撐著，接受著。',
    '說不清，但想說': '用戶今天選擇了「說不清，但想說」——有一種模糊但想表達的衝動。'
  }
 
  if (emotionTag && moodMap[emotionTag]) {
    parts.push(moodMap[emotionTag])
  } else if (emotionTag) {
    parts.push(`用戶今天的狀態描述為：「${emotionTag}」。`)
  }
 
  // 回來機制
  if (isReturning && gapDays > 0) {
    if (gapDays === 1) {
      parts.push('用戶昨天沒有來。今天回來了，不需要提到或追問原因。')
    } else if (gapDays <= 3) {
      parts.push(`用戶中間有 ${gapDays} 天沒有來。今天回來了。不用解釋，不用評論，就自然繼續。`)
    } else {
      parts.push(`用戶離開了 ${gapDays} 天才回來。不要問為什麼，不要說「歡迎回來」這類話。就低調地繼續，像什麼都沒中斷過。`)
    }
  }
 
  // 語言風格提示
  const styleLabels = {
    contemplative: '靜觀',
    warm: '溫厚',
    direct: '直白'
  }
  if (languageStyle && styleLabels[languageStyle]) {
    parts.push(`用戶選擇的語言風格是「${styleLabels[languageStyle]}」，請保持這個風格的一致性。`)
  }
 
  // AI 自主調整空間
  parts.push('在選定的風格框架內，你有空間根據用戶當下的狀態做細微的語氣調整。如果用戶今天的狀態很輕，問題可以再輕一點；如果他們在碰觸某個沉的東西，可以稍微靠近一點。風格是方向，不是牢籠。')
 
  // 過去記錄分析（如果有）
  if (pastEntriesAnalysis) {
    parts.push(pastEntriesAnalysis)
  }
 
  return parts.join('\n')
}
 
function analyzePastEntries(entries = []) {
  if (!entries || entries.length === 0) return null
 
  const responses = entries
    .filter(e => e.user_response && e.user_response.trim())
    .map(e => e.user_response)
 
  if (responses.length === 0) return null
 
  const avgLength = responses.reduce((sum, r) => sum + r.length, 0) / responses.length
  const hasMetaphors = responses.some(r => /像|如|彷彿|好像|感覺/.test(r))
  const hasSelfCriticism = responses.some(r => /不好|不對|錯了|應該|後悔|失敗/.test(r))
  const isVerbose = avgLength > 150
  const isTerse = avgLength < 40
 
  const notes = []
 
  if (isTerse) {
    notes.push('用戶過去的回答通常很短，不要用需要長篇回答的問題，留更多空白。')
  } else if (isVerbose) {
    notes.push('用戶過去的回答通常比較長，說話詳細，可以問稍微深一點的問題。')
  }
 
  if (hasMetaphors) {
    notes.push('用戶習慣用比喻和意象表達感受，問題可以帶一點意象。')
  }
 
  if (hasSelfCriticism) {
    notes.push('用戶的過去回答中有一些自我批評的痕跡，問題要特別留意，不要讓問法加重這種傾向。')
  }
 
  return notes.length > 0 ? `【根據過去記錄的觀察】\n${notes.join('\n')}` : null
}
 
// ─────────────────────────────────────────────
// 主 handler
// ─────────────────────────────────────────────
module.exports = async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
 
  if (req.method === 'OPTIONS') {
    return res.status(200).end()
  }
 
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }
 
  try {
    const {
      message,
      history = [],
      deviceId,
      emotionTag,
      isReturning = false,
      gapDays = 0,
      languageStyle = 'warm', // 預設溫厚
      dayNumber,
      sessionType
    } = req.body
 
    if (!message) {
      return res.status(400).json({ error: 'message is required' })
    }
 
    // 取得過去的記錄（用來分析語氣調整）
    let pastEntriesAnalysis = null
    if (deviceId) {
      try {
        const supabase = createClient(
          process.env.SUPABASE_URL,
          process.env.SUPABASE_SERVICE_KEY
        )
        const { data: entries } = await supabase
          .from('entries')
          .select('user_response, created_at')
          .eq('device_id', deviceId)
          .not('user_response', 'is', null)
          .order('created_at', { ascending: false })
          .limit(10)
 
        if (entries && entries.length > 0) {
          pastEntriesAnalysis = analyzePastEntries(entries)
        }
      } catch (dbErr) {
        // 資料庫分析失敗不影響主流程
        console.error('Past entries analysis failed:', dbErr.message)
      }
    }
 
    // 建立 context note
    const contextNote = buildContextNote({
      emotionTag,
      isReturning,
      gapDays,
      dayNumber,
      sessionType,
      languageStyle,
      pastEntriesAnalysis
    })
 
    // 建立系統 prompt（基礎 + 語言風格前綴）
    const systemPrompt = buildSystemPrompt(languageStyle)
 
    // 建立對話歷史
    const formattedHistory = formatHistory(history)
 
    // 組合成完整訊息列表
    // context note 放在第一條 user 訊息前，作為背景
    const messages = []
 
    if (contextNote && formattedHistory.length === 0) {
      // 第一條訊息，context 放入 user 訊息前
      messages.push({
        role: 'user',
        content: `[背景資訊，請據此調整你的語氣和問題方向]\n${contextNote}\n\n[用戶的訊息]\n${message}`
      })
    } else if (contextNote && formattedHistory.length > 0) {
      // 有歷史時，context 附在最新訊息後
      messages.push(...formattedHistory)
      messages.push({
        role: 'user',
        content: `${message}\n\n[本次背景補充]\n${contextNote}`
      })
    } else {
      messages.push(...formattedHistory)
      messages.push({
        role: 'user',
        content: message
      })
    }
 
    // 呼叫 Claude API
    const anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY
    })
 
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 800,
      system: systemPrompt,
      messages
    })
 
    const aiMessage = response.content[0]?.text || ''
 
    return res.status(200).json({
      message: aiMessage,
      languageStyle,
      usage: {
        input_tokens: response.usage?.input_tokens,
        output_tokens: response.usage?.output_tokens
      }
    })
  } catch (err) {
    console.error('Chat handler error:', err)
    return res.status(500).json({
      error: 'Internal server error',
      details: err.message
    })
  }
}
