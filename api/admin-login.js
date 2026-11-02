const { sql, ensureSchema, audit, clientIp } = require('./_db');
const { configured, passwordMatches, createSession } = require('./_admin-auth');

const MAX_FAILURES = 8; // por IP, a cada 15 minutos
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido' });
  if (!configured()) return res.status(503).json({ error: 'Painel não configurado: cadastre ADMIN_PASSWORD e ADMIN_SESSION_SECRET na Netlify.' });
  try {
    await ensureSchema();
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
    const ip = clientIp(req);
    const [{ failures }] = await sql`SELECT COUNT(*)::int AS failures FROM audit_log WHERE action = 'admin_login_falhou' AND ip = ${ip} AND created_at > NOW() - INTERVAL '15 minutes'`;
    if (failures >= MAX_FAILURES) return res.status(429).json({ error: 'Muitas tentativas. Aguarde 15 minutos e tente de novo.' });
    if (!passwordMatches(String(body.password || ''))) {
      await audit('admin', 'admin_login_falhou', { req });
      await sleep(800);
      return res.status(401).json({ error: 'Senha incorreta.' });
    }
    await audit('admin', 'admin_login', { req });
    return res.status(200).json({ token: createSession(), expiresInHours: 12 });
  } catch (error) {
    console.error('[admin] login error', error);
    return res.status(500).json({ error: 'Não foi possível entrar agora.' });
  }
};
