const { neon } = require('@neondatabase/serverless');

const sql = neon(process.env.DATABASE_URL);

// Colunas acrescentadas à tabela orders original (todas opcionais: pedidos antigos continuam válidos).
const ORDER_COLUMNS = {
  paid_at: 'TIMESTAMPTZ',
  access_token_hash: 'TEXT',          // sha256 do token que abre a página de obrigado
  fulfillment_status: 'TEXT',         // etapa logística mais avançada já registrada
  invoice: 'JSONB',                   // nota fiscal: { number, series, key, url, issued_at }
  carrier: 'TEXT',                    // transportadora da etiqueta
  carrier_tracking_code: 'TEXT',      // código oficial da transportadora
  delivery_estimate: 'DATE',          // previsão informada pela transportadora
  logistics_synced_at: 'TIMESTAMPTZ', // última consulta à transportadora
};
// Códigos de "já existe" que podem surgir quando duas funções criam o esquema ao mesmo tempo.
const ALREADY_EXISTS = ['42P07', '42710', '42701', '23505'];

const tolerate = (promise) => promise.catch((error) => { if (!ALREADY_EXISTS.includes(error.code)) throw error; });

let schemaReady = null;
function ensureSchema() {
  if (!schemaReady) {
    schemaReady = (async () => {
      await tolerate(sql`CREATE TABLE IF NOT EXISTS orders (
        id BIGSERIAL PRIMARY KEY, reference TEXT UNIQUE NOT NULL, gateway_transaction_id TEXT, transaction_id TEXT,
        status TEXT NOT NULL DEFAULT 'pending', amount INTEGER NOT NULL, offer_id TEXT, offer JSONB NOT NULL,
        customer JSONB NOT NULL, address JSONB, tracking JSONB, pix_code TEXT, qr_code_base64 TEXT,
        tracking_code TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`);
      // Só altera a tabela se faltar coluna: ALTER TABLE trava a tabela mesmo quando a coluna já existe.
      const existing = new Set((await sql`SELECT column_name FROM information_schema.columns WHERE table_name = 'orders'`).map((row) => row.column_name));
      for (const [column, type] of Object.entries(ORDER_COLUMNS)) {
        if (!existing.has(column)) await tolerate(sql.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS ${column} ${type}`));
      }
      // O banco recusa qualquer código repetido, mesmo com pedidos simultâneos.
      await tolerate(sql`CREATE UNIQUE INDEX IF NOT EXISTS orders_tracking_code_key ON orders (tracking_code)`);
      await tolerate(sql`CREATE UNIQUE INDEX IF NOT EXISTS orders_carrier_tracking_code_key ON orders (carrier_tracking_code)`);
      await tolerate(sql`CREATE TABLE IF NOT EXISTS order_events (
        id BIGSERIAL PRIMARY KEY, order_reference TEXT NOT NULL, code TEXT NOT NULL, description TEXT, location TEXT,
        source TEXT NOT NULL, external_id TEXT NOT NULL, occurred_at TIMESTAMPTZ NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (order_reference, source, external_id)
      )`);
      await tolerate(sql`CREATE INDEX IF NOT EXISTS order_events_reference_idx ON order_events (order_reference, occurred_at)`);
      await tolerate(sql`CREATE TABLE IF NOT EXISTS webhook_events (
        id TEXT PRIMARY KEY, type TEXT, order_reference TEXT, received_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`);
      await tolerate(sql`CREATE TABLE IF NOT EXISTS audit_log (
        id BIGSERIAL PRIMARY KEY, actor TEXT NOT NULL, action TEXT NOT NULL, order_reference TEXT, details JSONB, ip TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`);
      await tolerate(sql`CREATE TABLE IF NOT EXISTS integration_errors (
        id BIGSERIAL PRIMARY KEY, source TEXT NOT NULL, order_reference TEXT, message TEXT NOT NULL, details JSONB,
        resolved BOOLEAN NOT NULL DEFAULT FALSE, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`);
    })().catch((error) => { schemaReady = null; throw error; });
  }
  return schemaReady;
}

const clientIp = (req) => String(req.headers?.['x-nf-client-connection-ip'] || req.headers?.['x-forwarded-for'] || '').split(',')[0].trim().slice(0, 64);

async function audit(actor, action, { reference = null, details = null, req = null } = {}) {
  try {
    await sql`INSERT INTO audit_log (actor, action, order_reference, details, ip) VALUES (${actor}, ${action}, ${reference}, ${details ? JSON.stringify(details) : null}, ${req ? clientIp(req) : null})`;
  } catch (error) { console.error('[audit] falha ao registrar', action, error); }
}

async function logIntegrationError(source, message, { reference = null, details = null } = {}) {
  console.error(`[${source}]`, message, details || '');
  try {
    await sql`INSERT INTO integration_errors (source, order_reference, message, details) VALUES (${source}, ${reference}, ${String(message).slice(0, 500)}, ${details ? JSON.stringify(details) : null})`;
  } catch (error) { console.error('[integration_errors] falha ao registrar', error); }
}

module.exports = { sql, ensureSchema, audit, logIntegrationError, clientIp };
