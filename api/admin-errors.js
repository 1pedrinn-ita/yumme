const { sql, ensureSchema, audit } = require('./_db');
const { requireAdmin } = require('./_admin-auth');

// Erros de integração (PagPix, Correios, checkout) e trilha de auditoria recente.
module.exports = async function handler(req, res) {
  if (!requireAdmin(req, res)) return;
  try {
    await ensureSchema();
    if (req.method === 'POST') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
      const id = parseInt(body.id, 10);
      if (!id) return res.status(400).json({ error: 'Informe o erro.' });
      await sql`UPDATE integration_errors SET resolved = TRUE WHERE id = ${id}`;
      await audit('admin', 'erro_resolvido', { details: { id }, req });
    } else if (req.method !== 'GET') {
      return res.status(405).json({ error: 'Método não permitido' });
    }
    const errors = await sql`SELECT id, source, order_reference, message, details, resolved, created_at FROM integration_errors ORDER BY resolved, created_at DESC LIMIT 100`;
    const auditTrail = await sql`SELECT actor, action, order_reference, details, ip, created_at FROM audit_log ORDER BY created_at DESC LIMIT 100`;
    return res.status(200).json({ errors, audit: auditTrail });
  } catch (error) {
    console.error('[admin] errors error', error);
    return res.status(500).json({ error: 'Não foi possível carregar os erros.' });
  }
};
