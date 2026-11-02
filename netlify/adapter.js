// Adapta os handlers de /api (formato Vercel: req, res) para Netlify Functions.
module.exports = (handler) => async (event) => {
  const body = event.body && event.isBase64Encoded ? Buffer.from(event.body, 'base64').toString('utf8') : event.body;
  return new Promise((resolve, reject) => {
    const res = {
      statusCode: 200,
      status(code) { this.statusCode = code; return this; },
      json(data) {
        // Respostas da API nunca ficam em cache (têm dados de pedido).
        resolve({ statusCode: this.statusCode, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }, body: JSON.stringify(data) });
        return this;
      },
    };
    const req = { method: event.httpMethod, headers: event.headers || {}, query: event.queryStringParameters || {}, body: body || {} };
    Promise.resolve(handler(req, res)).catch(reject);
  });
};
