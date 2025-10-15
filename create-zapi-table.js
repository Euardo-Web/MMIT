const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('app_new.db');

db.run(`
CREATE TABLE IF NOT EXISTS zapi_mappings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  instance_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  zapi_instance_id TEXT,
  zapi_token TEXT,
  zapi_response TEXT,
  webhook_url TEXT,
  created_at TEXT NOT NULL
)
`, (err) => {
  if (err) console.error('Erro criando tabela:', err);
  else console.log('zapi_mappings table ensured');
  db.close();
});
