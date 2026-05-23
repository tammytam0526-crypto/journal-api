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
      .from('profiles').select('*').eq('device_id', deviceId).single()
    if (error || !data) return res.status(404).json({ error: 'Not found' })
    return res.json(data)
  }

  if (req.method === 'POST') {
    const { deviceId, startDate } = req.body
    const { data, error } = await supabase
      .from('profiles')
      .upsert({ device_id: deviceId, start_date: startDate || new Date().toISOString().split('T')[0] })
      .select().single()
    if (error) return res.status(500).json({ error: error.message })
    return res.json(data)
  }
}
