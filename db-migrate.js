const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('app_new.db');

function pragma(cb) {
  db.all("PRAGMA table_info(instances);", [], (err, rows) => {
    if (err) return cb(err);
    console.log('schema instances:', rows);
    cb(null, rows);
  });
}

function addProviderColumn(cb) {
  db.run("ALTER TABLE instances ADD COLUMN provider TEXT DEFAULT 'selenium';", (err) => {
    if (err) return cb(err);
    console.log('Added provider column');
    cb(null);
  });
}

function listMappings(cb) {
  db.all("SELECT * FROM zapi_mappings LIMIT 5", [], (err, rows) => {
    if (err) return cb(err);
    console.log('zapi_mappings sample:', rows);
    cb(null, rows);
  });
}

pragma((err) => {
  if (err) return console.error('Error reading pragma:', err);
  addProviderColumn((e) => {
    if (e) {
      if (e.message && e.message.includes('duplicate column name')) {
        console.log('provider column already exists');
        listMappings(() => db.close());
      } else {
        console.error('Error adding column:', e);
        db.close();
      }
    } else {
      listMappings(() => db.close());
    }
  });
});
