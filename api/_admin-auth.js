/**
 * Acesso ao painel administrativo. Variáveis de ambiente: ADMIN_PASSWORD (senha do painel) e
 * ADMIN_SESSION_SECRET (texto aleatório longo, usado para assinar a sessão). Sem elas o painel fica desligado.
 */
const crypto = require('crypto');

const SESSION_HOURS = 12;
const configured = () => Boolean(process.env.ADMIN_PASSWORD && String(process.env.ADMIN_SESSION_SECRET || '').length >= 32);
const mac = (body) => crypto.createHmac('sha256', process.env.ADMIN_SESSION_SECRET).update(body).digest('base64url');
const sameText = (a, b) => {
  const x = crypto.createHash('sha256').update(String(a)).digest();
  const y = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(x, y);
};

const passwordMatches = (password) => configured() && sameText(password, process.env.ADMIN_PASSWORD);

function createSession() {
  const body = Buffer.from(JSON.stringify({ sub: 'admin', exp: Date.now() + SESSION_HOURS * 3600_000 })).toString('base64url');
  return `${body}.${mac(body)}`;
}

function readSession(token) {
  if (!configured() || typeof token !== 'string' || !token.includes('.')) return null;
  const [body, signature] = token.split('.');
  if (!signature || !sameText(signature, mac(body))) return null;
  try {
    const session = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    return session.exp > Date.now() ? session : null;
  } catch (_) { return null; }
}

// Devolve a sessão ou já responde 401/503.
function requireAdmin(req, res) {
  if (!configured()) { res.status(503).json({ error: 'Painel não configurado: cadastre ADMIN_PASSWORD e ADMIN_SESSION_SECRET na Netlify.' }); return null; }
  const session = readSession(String(req.headers?.authorization || '').replace(/^Bearer\s+/i, ''));
  if (!session) { res.status(401).json({ error: 'Sessão expirada. Entre novamente.' }); return null; }
  return session;
}

module.exports = { configured, passwordMatches, createSession, readSession, requireAdmin };
