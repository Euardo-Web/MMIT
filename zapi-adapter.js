// zapi-adapter.js
// Adapter simples para integrar com uma Z-API compatível.
// Usa variáveis de ambiente ZAPI_BASE_URL e ZAPI_TOKEN (Bearer) para autenticação.
// Não assume SDK específico; usa fetch global (Node 18+/22+).

const baseUrl = process.env.ZAPI_BASE_URL || 'https://api.z-api.io';
const token = process.env.ZAPI_TOKEN || '';

function buildHeaders() {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return headers;
}

async function request(path, opts = {}) {
  const url = baseUrl.replace(/\/$/, '') + '/' + path.replace(/^\//, '');
  const res = await fetch(url, {
    ...opts,
    headers: { ...(opts.headers || {}), ...(buildHeaders()) },
    timeout: opts.timeout || 30000
  });

  const text = await res.text();
  let body = null;
  try { body = text ? JSON.parse(text) : null; } catch (e) { body = text; }

  if (!res.ok) {
    const err = new Error(`Z-API request failed: ${res.status} ${res.statusText}`);
    err.status = res.status;
    err.body = body;
    throw err;
  }

  return body;
}

module.exports = {
  // Cria uma instância na Z-API (se a Z-API oferecer esse recurso).
  // name: string, optional payload
  async createInstance(name = '') {
    // Many Z-API providers don't require creating an instance via API; they use pre-provisioned instances.
    // This function calls a conventional endpoint if available. If not available, it returns null.
    try {
      return await request('/instances', {
        method: 'POST',
        body: JSON.stringify({ name })
      });
    } catch (e) {
      // fallback: try /instance
      try {
        return await request('/instance', {
          method: 'POST',
          body: JSON.stringify({ name })
        });
      } catch (err) {
        // If provider doesn't support instance creation via API, propagate null
        return null;
      }
    }
  },

  // Solicitar QR (base64) para a instância zapiInstanceId
  async getQRCode(zapiInstanceId) {
    // try common endpoints
    const paths = [
      `/instances/${zapiInstanceId}/qrcode`,
      `/instance/${zapiInstanceId}/qrcode`,
      `/sessions/${zapiInstanceId}/qrcode`
    ];

    for (const p of paths) {
      try {
        const body = await request(p, { method: 'GET' });
        // Return raw body; callers should inspect
        return body;
      } catch (e) {
        // continue
      }
    }
    throw new Error('QR Code endpoint not available on configured Z-API');
  },

  // Start / initialize instance on Z-API
  async startInstance(zapiInstanceId) {
    const paths = [
      `/instances/${zapiInstanceId}/start`,
      `/instance/${zapiInstanceId}/start`,
      `/sessions/${zapiInstanceId}/start`
    ];
    for (const p of paths) {
      try { return await request(p, { method: 'POST' }); } catch (e) { }
    }
    // fallback: try a ping
    try { return await request(`/instances/${zapiInstanceId}`, { method: 'GET' }); } catch (e) { }
    throw new Error('Unable to start instance via Z-API');
  },

  async stopInstance(zapiInstanceId) {
    const paths = [
      `/instances/${zapiInstanceId}/stop`,
      `/instance/${zapiInstanceId}/stop`,
      `/sessions/${zapiInstanceId}/stop`
    ];
    for (const p of paths) {
      try { return await request(p, { method: 'POST' }); } catch (e) { }
    }
    // fallback: try delete
    try { return await request(`/instances/${zapiInstanceId}`, { method: 'DELETE' }); } catch (e) { }
    throw new Error('Unable to stop instance via Z-API');
  },

  // Send a message using zapi instance
  // payload: { to, type, text, ... }
  async sendMessage(zapiInstanceId, payload = {}) {
    const paths = [
      `/instances/${zapiInstanceId}/send`,
      `/instance/${zapiInstanceId}/send`,
      `/sessions/${zapiInstanceId}/send`,
      `/sendMessage?instance=${zapiInstanceId}`
    ];
    for (const p of paths) {
      try { return await request(p, { method: 'POST', body: JSON.stringify(payload) }); } catch (e) { }
    }
    throw new Error('Unable to send message via Z-API');
  },

  // Check status
  async getStatus(zapiInstanceId) {
    const paths = [
      `/instances/${zapiInstanceId}/status`,
      `/instance/${zapiInstanceId}/status`,
      `/sessions/${zapiInstanceId}/status`,
      `/status?instance=${zapiInstanceId}`
    ];
    for (const p of paths) {
      try { return await request(p, { method: 'GET' }); } catch (e) { }
    }
    throw new Error('Unable to get status via Z-API');
  }
};
