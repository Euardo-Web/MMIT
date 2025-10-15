// Simple mock Z-API for local testing
// Endpoints:
// POST /instances -> create instance { instanceId, token }
// POST /instances/:id/start -> start instance (returns qrcode)
// GET /instances/:id/qrcode -> returns { qrcode }
// POST /webhook -> (not used) endpoint to receive manual webhooks

const express = require('express');
const bodyParser = require('body-parser');
const app = express();
app.use(bodyParser.json({ limit: '1mb' }));

const port = 4000;
const instances = {}; // in-memory

function makeId() { return 'zapi-' + Math.random().toString(36).slice(2,10); }

app.post('/instances', (req, res) => {
  const name = req.body.name || 'no-name';
  const id = makeId();
  const token = 'tok-' + Math.random().toString(36).slice(2,8);
  instances[id] = { id, token, name, status: 'created' };
  console.log('[mock] created instance', id);
  res.json({ instanceId: id, token });
});

app.post('/instances/:id/start', (req, res) => {
  const id = req.params.id;
  const inst = instances[id];
  if (!inst) return res.status(404).json({ error: 'not found' });
  inst.status = 'starting';
  // generate a fake QR (small base64 PNG placeholder)
  const qrcode = 'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAABJ0lEQVQ4T6WTvUoDQRDHf2cQkW0h4oUgS' +
    'IQgk1E0sLdwUS0kITEp4gk1s7s7u92c2+2e2Zk5M7sxj5szkz3nmfOe8/x8yGQ3gI6xjI3jKcQzqA1i3' +
    'o3sQxqk7g9GgY8A8gF6gK+gLeAN6gJ6gG6gINaA7qA9qgXqgM6gO6gP6gY6gX6gE6gH6gJ6gL6gN6gP6' ;
  // Not a real PNG; for demo it's fine
  setTimeout(() => {
    // simulate sending webhook 'connected' to application if configured
    const webhookUrl = process.env.MOCK_WEBHOOK_URL || 'http://localhost:3000/api/zapi/webhook';
    const payload = { event: 'connected', instanceId: id, timestamp: new Date().toISOString(), number: '5511999999999' };
    console.log('[mock] sending webhook to', webhookUrl, payload);
    // fire and forget
    fetch(webhookUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }).catch(e => console.error('[mock] webhook error', e));
    inst.status = 'connected';
  }, 2000);

  res.json({ status: 'starting', message: 'Instance starting', qrcode: qrcode });
});

app.get('/instances/:id/qrcode', (req, res) => {
  const id = req.params.id;
  if (!instances[id]) return res.status(404).json({ error: 'not found' });
  res.json({ qrcode: 'data:image/png;base64,' + (instances[id].qrcode || 'FAKEBASE64') });
});

app.post('/webhook', (req, res) => {
  // manual webhook forwarder
  console.log('[mock] received webhook call:', req.body);
  res.json({ ok: true });
});

app.listen(port, () => console.log('[mock] Z-API mock listening on ' + port));
