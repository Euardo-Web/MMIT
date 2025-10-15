const fs = require('fs');
const sqlite3 = require('sqlite3').verbose();
const fetch = global.fetch || require('node-fetch');

(async () => {
  try {
    const sendUrl = 'https://api.z-api.io/instances/3E8C37F69FAC11A543CF8216DA884E9A/token/FA85F2A5C440A757EAC34A3D/send-text';
    const to = '5516996264212';
    const text = 'oi isso é um tese';

    console.log('Sending to Z-API URL:', sendUrl);

    const body = { phone: to, message: text };

    const res = await fetch(sendUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      // no redirect and timeout handled by fetch implementation
    });

    const textResp = await res.text();
    let jsonResp = null;
    try { jsonResp = textResp ? JSON.parse(textResp) : null; } catch (e) { jsonResp = textResp; }

    console.log('HTTP status:', res.status);
    console.log('Response body:', jsonResp);

    // Insert mapping into DB
    const db = new sqlite3.Database('app_new.db');
    const now = new Date().toISOString();
    const provider = 'zapi';
    const zapi_token = process.env.ZAPI_TOKEN || null;

    const zapi_response = typeof jsonResp === 'string' ? jsonResp : JSON.stringify(jsonResp || {});

    db.run('INSERT INTO zapi_mappings (instance_id, provider, zapi_instance_id, zapi_token, zapi_response, webhook_url, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      ['manual-test-' + Date.now(), provider, null, zapi_token, zapi_response, null, now], function(err) {
        if (err) {
          console.error('DB insert error:', err);
        } else {
          console.log('Inserted mapping id:', this.lastID);
        }
        db.close();
      });

  } catch (error) {
    console.error('Error during send-and-map:', error);
  }
})();
