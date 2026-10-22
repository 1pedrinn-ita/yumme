const QRCode = require('qrcode');

const PAGPIX_API = 'https://pagpixhub.com/api/v1';

async function pagpix(path, { method = 'GET', body, idempotencyKey } = {}) {
  const response = await fetch(`${PAGPIX_API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${process.env.PAGPIX_API_KEY}`,
      'Content-Type': 'application/json',
      ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await response.json().catch(() => ({}));
  return { ok: response.ok, status: response.status, data };
}

// A PagPix não envia imagem de QR Code: ela é gerada aqui a partir do copia-e-cola.
const qrImage = (copyPaste) => (copyPaste ? QRCode.toDataURL(copyPaste, { margin: 1, width: 320 }) : null);

module.exports = { pagpix, qrImage };
