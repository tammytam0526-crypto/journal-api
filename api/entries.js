const { createClient } = require('@supabase/supabase-js')

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()

  // 診斷 URL 格式
  if (req.query.debug === 'url') {
    const url = process.env.SUPABASE_URL || ''
    const key = process.env.SUPABASE_SERVICE_KEY || ''
    return res.json({
      urlFirst30: url.substring(0, 30),
      urlLength: url.length,
      startsWithHttps: url.startsWith('https://'),
      hasTrailingSlash: url.endsWith('/'),
      keyFirst10: key.substring(0, 10),   // 應該是 "eyJ" 開頭
      keyLength: key.length,
    })
  }

  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
  )

  if (req.method === 'GET') {
    const { deviceId } = req.query
    if (!deviceId) return res.status(400).json({ error: 'Missing deviceId' })
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
      .update({ user_response: userResponse, updated_at: new Date().toISOString() })
      .eq('device_id', deviceId).eq('day_number', dayNumber).eq('session_type', sessionType)
      .select().single()
    if (error) return res.status(500).json({ error: error.message })
    return res.json({ success: true, data })
  }

  return res.status(405).json({ error: 'Method not allowed' })
}
