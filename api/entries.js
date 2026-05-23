module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.json({
    status: 'ok',
    message: '函式正常運作！',
    env_supabase: !!process.env.SUPABASE_URL,
    env_anthropic: !!process.env.ANTHROPIC_API_KEY,
  })
}
