// 暫時診斷用 — 確認環境變數
if (req.query.debug === 'env') {
  return res.json({
    hasSupabaseUrl: !!process.env.SUPABASE_URL,
    hasSupabaseKey: !!process.env.SUPABASE_SERVICE_KEY,
    hasAnthropicKey: !!process.env.ANTHROPIC_API_KEY,
    // 只顯示前 10 個字，確認是否有值
    supabaseUrlPrefix: (process.env.SUPABASE_URL || '').substring(0, 15),
  })
}
const { createClient } = require('@supabase/supabase-js')

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
)

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()

  if (req.method === 'GET') {
    const { deviceId } = req.query
    const { data, error } = await supabase
      .from('entries').select('*')
      .eq('device_id', deviceId)
      .order('day_number').order('session_type')
    if (error) return res.status(500).json({ error: error.message })
    return res.json(data)
  }

  if (req.method === 'POST') {
    const { deviceId, dayNumber, sessionType, userResponse } = req.body
    const { data, error } = await supabase.from('entries')
      .update({
        user_response: userResponse,
        updated_at: new Date().toISOString()
      })
      .eq('device_id', deviceId)
      .eq('day_number', dayNumber)
      .eq('session_type', sessionType)
      .select().single()
    if (error) return res.status(500).json({ error: error.message })
    return res.json({ success: true, data })
  }
}
