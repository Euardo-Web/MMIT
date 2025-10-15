const express = require('express');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const morgan = require('morgan');
const zapi = require('./zapi-adapter');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(morgan('combined'));
app.use(express.static('.'));

// Configurações do banco de dados
const DB_PATH = 'app_new.db';

// Inicializar banco de dados
function initDatabase() {
    return new Promise((resolve, reject) => {
        const db = new sqlite3.Database(DB_PATH, (err) => {
            if (err) {
                console.error('Erro ao conectar com o banco:', err);
                reject(err);
                return;
            }
            console.log('Conectado ao banco SQLite');
        });

        db.serialize(() => {
            // Tabela de instâncias
            db.run(`
                CREATE TABLE IF NOT EXISTS instances (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    contacts TEXT NOT NULL,
                    message TEXT NOT NULL,
                    provider TEXT DEFAULT 'zapi',
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                )
            `);

            // Tabela para mapeamento com Z-API
            db.run(`
                CREATE TABLE IF NOT EXISTS zapi_mappings (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    instance_id TEXT NOT NULL,
                    provider TEXT NOT NULL,
                    zapi_instance_id TEXT,
                    zapi_token TEXT,
                    zapi_response TEXT,
                    webhook_url TEXT,
                    status TEXT DEFAULT 'disconnected',
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                )
            `, (err) => {
                if (err) {
                    console.error('Erro ao criar tabelas:', err);
                    reject(err);
                } else {
                    console.log('Banco de dados inicializado');
                    resolve();
                }
            });
        });

        db.close();
    });
}

// Rotas da API
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'dashboard.html'));
});

// Health check
app.get('/api/health', async (req, res) => {
    try {
        res.json({
            status: 'ok',
            timestamp: new Date().toISOString(),
            uptime: process.uptime(),
            mode: 'zapi'
        });
    } catch (error) {
        console.error('Erro ao verificar health:', error);
        res.status(500).json({
            status: 'error',
            timestamp: new Date().toISOString(),
            error: error.message
        });
    }
});

// Endpoint webhook para eventos da Z-API
app.post('/api/zapi/webhook', express.json(), async (req, res) => {
    try {
        const payload = req.body;
        console.log('📥 Webhook Z-API recebido:', payload);

        if (!payload || !payload.instanceId) {
            return res.status(400).json({ error: 'Invalid payload' });
        }

        const db = new sqlite3.Database(DB_PATH);
        const now = new Date().toISOString();

        db.get('SELECT * FROM zapi_mappings WHERE zapi_instance_id = ? ORDER BY created_at DESC LIMIT 1', 
            [payload.instanceId], 
            (err, map) => {
                if (err) {
                    console.error('Erro ao consultar mapping por webhook:', err);
                    db.close();
                    return res.status(500).json({ error: 'DB error' });
                }

                if (!map) {
                    console.warn('Mapping Z-API não encontrado para instanceId:', payload.instanceId);
                    db.close();
                    return res.status(404).json({ error: 'mapping_not_found' });
                }

                // Update status based on event
                let newStatus = map.status;
                if (payload.event === 'connected' || payload.connected === true) {
                    newStatus = 'connected';
                } else if (payload.event === 'disconnected') {
                    newStatus = 'disconnected';
                }

                // Update mapping
                let respObj = {};
                try { 
                    respObj = map.zapi_response ? JSON.parse(map.zapi_response) : {}; 
                } catch(e) { 
                    respObj = {}; 
                }
                respObj.last_event = payload;
                respObj.last_update = now;

                db.run('UPDATE zapi_mappings SET zapi_response = ?, status = ?, updated_at = ? WHERE id = ?', 
                    [JSON.stringify(respObj), newStatus, now, map.id], 
                    (sErr) => {
                        if (sErr) console.error('Erro ao atualizar mapping zapi_response:', sErr);
                        
                        // Update instance timestamp
                        db.run('UPDATE instances SET updated_at = ? WHERE id = ?', 
                            [now, map.instance_id], 
                            function(uErr) {
                                if (uErr) console.error('Erro ao atualizar instance updated_at:', uErr);
                                db.close();
                                return res.json({ ok: true, status: newStatus });
                            }
                        );
                    }
                );
            }
        );

    } catch (error) {
        console.error('Erro no webhook zapi:', error);
        res.status(500).json({ error: error.message });
    }
});

// ========== ENDPOINTS DE INSTÂNCIAS ==========

// Listar instâncias
app.get('/api/instances', (req, res) => {
    const db = new sqlite3.Database(DB_PATH);
    
    db.all('SELECT * FROM instances ORDER BY created_at DESC', (err, rows) => {
        if (err) {
            console.error('Erro ao listar instâncias:', err);
            db.close();
            res.status(500).json({ error: err.message });
            return;
        }
        
        const instances = rows.map(row => ({
            id: row.id,
            name: row.name,
            contacts: row.contacts ? row.contacts.split(',') : [],
            message: row.message,
            provider: row.provider || 'zapi',
            created_at: row.created_at,
            updated_at: row.updated_at
        }));

        // Load mappings
        if (rows.length === 0) {
            db.close();
            return res.json({ instances });
        }

        const instanceIds = rows.map(r => `'${r.id}'`).join(',');
        db.all(`SELECT * FROM zapi_mappings WHERE instance_id IN (${instanceIds}) ORDER BY created_at DESC`, 
            (mErr, maps) => {
                db.close();
                
                if (!mErr && maps) {
                    const byInstance = {};
                    maps.forEach(m => { 
                        if (!byInstance[m.instance_id]) {
                            byInstance[m.instance_id] = m;
                        }
                    });
                    
                    instances.forEach(inst => {
                        if (byInstance[inst.id]) {
                            inst.zapi_instance_id = byInstance[inst.id].zapi_instance_id;
                            inst.zapi_token = byInstance[inst.id].zapi_token;
                            inst.status = byInstance[inst.id].status || 'disconnected';
                        }
                    });
                }

                res.json({ instances });
            }
        );
    });
});

// Obter instância específica
app.get('/api/instances/:instanceId', (req, res) => {
    const db = new sqlite3.Database(DB_PATH);
    
    db.get('SELECT * FROM instances WHERE id = ?', [req.params.instanceId], (err, row) => {
        if (err) {
            console.error('Erro ao obter instância:', err);
            db.close();
            res.status(500).json({ error: err.message });
        } else if (!row) {
            db.close();
            res.status(404).json({ error: 'Instância não encontrada' });
        } else {
            const instance = {
                id: row.id,
                name: row.name,
                contacts: row.contacts ? row.contacts.split(',') : [],
                message: row.message,
                provider: row.provider || 'zapi',
                created_at: row.created_at,
                updated_at: row.updated_at
            };

            db.get('SELECT * FROM zapi_mappings WHERE instance_id = ? ORDER BY created_at DESC LIMIT 1', 
                [row.id], 
                (mErr, mapRow) => {
                    db.close();
                    
                    if (!mErr && mapRow) {
                        instance.zapi_instance_id = mapRow.zapi_instance_id;
                        instance.zapi_token = mapRow.zapi_token;
                        instance.status = mapRow.status || 'disconnected';
                        instance.zapi_response = mapRow.zapi_response ? JSON.parse(mapRow.zapi_response) : null;
                    }
                    res.json(instance);
                }
            );
        }
    });
});

// Criar instância
app.post('/api/instances', async (req, res) => {
    try {
        const { name, contacts, message, provider } = req.body;
        
        // Validação
        if (!name || typeof name !== 'string' || name.trim().length === 0) {
            return res.status(400).json({ error: 'Nome é obrigatório' });
        }
        
        if (!contacts || !Array.isArray(contacts) || contacts.length === 0) {
            return res.status(400).json({ error: 'Pelo menos um contato é obrigatório' });
        }
        
        if (!message || typeof message !== 'string' || message.trim().length === 0) {
            return res.status(400).json({ error: 'Mensagem é obrigatória' });
        }
        
        const instanceId = uuidv4();
        const now = new Date().toISOString();
        
        const db = new sqlite3.Database(DB_PATH);

        db.run(
            'INSERT INTO instances (id, name, contacts, message, provider, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [instanceId, name, contacts.join(','), message, provider || 'zapi', now, now],
            async function(err) {
                if (err) {
                    console.error('Erro ao criar instância:', err);
                    db.close();
                    res.status(500).json({ error: err.message });
                    return;
                }

                // Se provider é zapi, tentar criar instância remota
                if (provider === 'zapi') {
                    try {
                        const zapiResp = await zapi.createInstance(name);
                        const zapiInstanceId = zapiResp && (zapiResp.instanceId || zapiResp.id || zapiResp.sessionId) ? 
                            (zapiResp.instanceId || zapiResp.id || zapiResp.sessionId) : null;
                        const zapiToken = zapiResp && zapiResp.token ? zapiResp.token : (process.env.ZAPI_TOKEN || null);

                        db.run(
                            'INSERT INTO zapi_mappings (instance_id, provider, zapi_instance_id, zapi_token, zapi_response, webhook_url, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
                            [instanceId, 'zapi', zapiInstanceId, zapiToken, JSON.stringify(zapiResp || {}), null, 'disconnected', now, now],
                            function(mapErr) {
                                db.close();
                                
                                if (mapErr) {
                                    console.error('Erro ao salvar mapping zapi:', mapErr);
                                }

                                res.status(201).json({
                                    id: instanceId,
                                    name: name,
                                    contacts: contacts,
                                    message: message,
                                    provider: 'zapi',
                                    zapi_instance_id: zapiInstanceId,
                                    status: 'disconnected',
                                    created_at: now,
                                    updated_at: now
                                });
                            }
                        );
                    } catch (e) {
                        console.error('Erro ao criar instância zapi:', e);
                        db.close();
                        
                        // Responder mas indicar que a criação no provider falhou
                        res.status(201).json({
                            id: instanceId,
                            name: name,
                            contacts: contacts,
                            message: message,
                            provider: 'zapi',
                            zapi_error: e.message,
                            status: 'error',
                            created_at: now,
                            updated_at: now
                        });
                    }
                } else {
                    db.close();
                    res.status(201).json({
                        id: instanceId,
                        name: name,
                        contacts: contacts,
                        message: message,
                        provider: provider || 'zapi',
                        created_at: now,
                        updated_at: now
                    });
                }
            }
        );
        
    } catch (error) {
        console.error('Erro ao criar instância:', error);
        res.status(500).json({ error: error.message });
    }
});

// Atualizar instância
app.put('/api/instances/:instanceId', (req, res) => {
    try {
        const { name, contacts, message } = req.body;
        
        // Validação
        if (!name || typeof name !== 'string' || name.trim().length === 0) {
            return res.status(400).json({ error: 'Nome é obrigatório' });
        }
        
        if (!contacts || !Array.isArray(contacts) || contacts.length === 0) {
            return res.status(400).json({ error: 'Pelo menos um contato é obrigatório' });
        }
        
        if (!message || typeof message !== 'string' || message.trim().length === 0) {
            return res.status(400).json({ error: 'Mensagem é obrigatória' });
        }
        
        const now = new Date().toISOString();
        
        const db = new sqlite3.Database(DB_PATH);
        db.run(
            'UPDATE instances SET name=?, contacts=?, message=?, updated_at=? WHERE id=?',
            [name, contacts.join(','), message, now, req.params.instanceId],
            function(err) {
                db.close();
                
                if (err) {
                    console.error('Erro ao atualizar instância:', err);
                    res.status(500).json({ error: err.message });
                } else if (this.changes === 0) {
                    res.status(404).json({ error: 'Instância não encontrada' });
                } else {
                    res.json({
                        id: req.params.instanceId,
                        name: name,
                        contacts: contacts,
                        message: message,
                        updated_at: now
                    });
                }
            }
        );
        
    } catch (error) {
        console.error('Erro ao atualizar instância:', error);
        res.status(500).json({ error: error.message });
    }
});

// Deletar instância
app.delete('/api/instances/:instanceId', async (req, res) => {
    const db = new sqlite3.Database(DB_PATH);
    
    // Primeiro, obter mapping para tentar parar instância remota
    db.get('SELECT * FROM zapi_mappings WHERE instance_id = ? ORDER BY created_at DESC LIMIT 1', 
        [req.params.instanceId], 
        async (err, map) => {
            if (!err && map && map.zapi_instance_id) {
                try {
                    await zapi.stopInstance(map.zapi_instance_id);
                    console.log('Instância Z-API parada:', map.zapi_instance_id);
                } catch (e) {
                    console.warn('Erro ao parar instância Z-API:', e.message);
                }
            }

            // Deletar mappings
            db.run('DELETE FROM zapi_mappings WHERE instance_id = ?', [req.params.instanceId], (delErr) => {
                if (delErr) console.error('Erro ao deletar mappings:', delErr);
            });

            // Deletar instância
            db.run('DELETE FROM instances WHERE id = ?', [req.params.instanceId], function(delErr2) {
                db.close();
                
                if (delErr2) {
                    console.error('Erro ao deletar instância:', delErr2);
                    res.status(500).json({ error: delErr2.message });
                } else if (this.changes === 0) {
                    res.status(404).json({ error: 'Instância não encontrada' });
                } else {
                    res.json({ status: 'deleted' });
                }
            });
        }
    );
});

// ========== ENDPOINTS DE GERENCIAMENTO Z-API ==========

// Iniciar instância Z-API
app.post('/api/instances/:instanceId/start', async (req, res) => {
    try {
        const db = new sqlite3.Database(DB_PATH);
        
        db.get('SELECT * FROM zapi_mappings WHERE instance_id = ? ORDER BY created_at DESC LIMIT 1', 
            [req.params.instanceId], 
            async (err, map) => {
                db.close();
                
                if (err) {
                    console.error('Erro ao consultar mapping:', err);
                    return res.status(500).json({ error: 'Erro de banco de dados' });
                }

                if (!map || !map.zapi_instance_id) {
                    return res.status(404).json({ error: 'Instância Z-API não encontrada' });
                }

                try {
                    const result = await zapi.startInstance(map.zapi_instance_id);
                    
                    // Atualizar status
                    const db2 = new sqlite3.Database(DB_PATH);
                    const now = new Date().toISOString();
                    db2.run('UPDATE zapi_mappings SET status = ?, updated_at = ? WHERE id = ?', 
                        ['connecting', now, map.id], 
                        (updateErr) => {
                            db2.close();
                            if (updateErr) console.error('Erro ao atualizar status:', updateErr);
                        }
                    );

                    res.json({ 
                        status: 'started', 
                        message: 'Instância iniciada com sucesso',
                        result: result
                    });
                } catch (error) {
                    console.error('Erro ao iniciar instância Z-API:', error);
                    res.status(500).json({ error: error.message });
                }
            }
        );
    } catch (error) {
        console.error('Erro ao iniciar instância:', error);
        res.status(500).json({ error: error.message });
    }
});

// Parar instância Z-API
app.post('/api/instances/:instanceId/stop', async (req, res) => {
    try {
        const db = new sqlite3.Database(DB_PATH);
        
        db.get('SELECT * FROM zapi_mappings WHERE instance_id = ? ORDER BY created_at DESC LIMIT 1', 
            [req.params.instanceId], 
            async (err, map) => {
                db.close();
                
                if (err) {
                    console.error('Erro ao consultar mapping:', err);
                    return res.status(500).json({ error: 'Erro de banco de dados' });
                }

                if (!map || !map.zapi_instance_id) {
                    return res.status(404).json({ error: 'Instância Z-API não encontrada' });
                }

                try {
                    const result = await zapi.stopInstance(map.zapi_instance_id);
                    
                    // Atualizar status
                    const db2 = new sqlite3.Database(DB_PATH);
                    const now = new Date().toISOString();
                    db2.run('UPDATE zapi_mappings SET status = ?, updated_at = ? WHERE id = ?', 
                        ['disconnected', now, map.id], 
                        (updateErr) => {
                            db2.close();
                            if (updateErr) console.error('Erro ao atualizar status:', updateErr);
                        }
                    );

                    res.json({ 
                        status: 'stopped', 
                        message: 'Instância parada com sucesso',
                        result: result
                    });
                } catch (error) {
                    console.error('Erro ao parar instância Z-API:', error);
                    res.status(500).json({ error: error.message });
                }
            }
        );
    } catch (error) {
        console.error('Erro ao parar instância:', error);
        res.status(500).json({ error: error.message });
    }
});

// Obter QR Code da instância
app.get('/api/instances/:instanceId/qr', async (req, res) => {
    try {
        const db = new sqlite3.Database(DB_PATH);
        
        db.get('SELECT * FROM zapi_mappings WHERE instance_id = ? ORDER BY created_at DESC LIMIT 1', 
            [req.params.instanceId], 
            async (err, map) => {
                db.close();
                
                if (err) {
                    console.error('Erro ao consultar mapping:', err);
                    return res.status(500).json({ error: 'Erro de banco de dados' });
                }

                if (!map || !map.zapi_instance_id) {
                    return res.status(404).json({ error: 'Instância Z-API não encontrada' });
                }

                try {
                    const qrData = await zapi.getQRCode(map.zapi_instance_id);
                    res.json({ qr: qrData });
                } catch (error) {
                    console.error('Erro ao obter QR Code:', error);
                    res.status(500).json({ error: error.message });
                }
            }
        );
    } catch (error) {
        console.error('Erro ao obter QR Code:', error);
        res.status(500).json({ error: error.message });
    }
});

// Obter status da instância
app.get('/api/instances/:instanceId/status', async (req, res) => {
    try {
        const db = new sqlite3.Database(DB_PATH);
        
        db.get('SELECT * FROM zapi_mappings WHERE instance_id = ? ORDER BY created_at DESC LIMIT 1', 
            [req.params.instanceId], 
            async (err, map) => {
                db.close();
                
                if (err) {
                    console.error('Erro ao consultar mapping:', err);
                    return res.status(500).json({ error: 'Erro de banco de dados' });
                }

                if (!map || !map.zapi_instance_id) {
                    return res.status(404).json({ error: 'Instância Z-API não encontrada' });
                }

                try {
                    const status = await zapi.getStatus(map.zapi_instance_id);
                    
                    // Atualizar status local se necessário
                    const db2 = new sqlite3.Database(DB_PATH);
                    const now = new Date().toISOString();
                    const newStatus = status.connected ? 'connected' : 'disconnected';
                    
                    db2.run('UPDATE zapi_mappings SET status = ?, updated_at = ? WHERE id = ?', 
                        [newStatus, now, map.id], 
                        (updateErr) => {
                            db2.close();
                            if (updateErr) console.error('Erro ao atualizar status:', updateErr);
                        }
                    );

                    res.json({ 
                        status: newStatus,
                        details: status
                    });
                } catch (error) {
                    console.error('Erro ao obter status:', error);
                    res.status(500).json({ error: error.message });
                }
            }
        );
    } catch (error) {
        console.error('Erro ao obter status:', error);
        res.status(500).json({ error: error.message });
    }
});

// Enviar mensagem via instância
app.post('/api/instances/:instanceId/send', async (req, res) => {
    try {
        const { to, message } = req.body;
        
        if (!to || !message) {
            return res.status(400).json({ error: 'Destinatário e mensagem são obrigatórios' });
        }

        const db = new sqlite3.Database(DB_PATH);
        
        db.get('SELECT * FROM zapi_mappings WHERE instance_id = ? ORDER BY created_at DESC LIMIT 1', 
            [req.params.instanceId], 
            async (err, map) => {
                db.close();
                
                if (err) {
                    console.error('Erro ao consultar mapping:', err);
                    return res.status(500).json({ error: 'Erro de banco de dados' });
                }

                if (!map || !map.zapi_instance_id) {
                    return res.status(404).json({ error: 'Instância Z-API não encontrada' });
                }

                try {
                    const payload = {
                        to: to,
                        text: message,
                        type: 'text'
                    };
                    
                    const result = await zapi.sendMessage(map.zapi_instance_id, payload);
                    
                    res.json({ 
                        status: 'sent', 
                        message: 'Mensagem enviada com sucesso',
                        result: result
                    });
                } catch (error) {
                    console.error('Erro ao enviar mensagem:', error);
                    res.status(500).json({ error: error.message });
                }
            }
        );
    } catch (error) {
        console.error('Erro ao enviar mensagem:', error);
        res.status(500).json({ error: error.message });
    }
});

// Inicializar servidor
async function startServer() {
    try {
        await initDatabase();
        console.log('Iniciando servidor Express...');
        const server = app.listen(PORT, '0.0.0.0', () => {
            console.log(`✅ Servidor rodando na porta ${PORT}`);
            console.log(`🌐 Acesse: http://localhost:${PORT}`);
            console.log('📊 Informações do servidor:');
            console.log(`   - Node.js: ${process.version}`);
            console.log(`   - Modo: Z-API (remoto)`);
            console.log(`   - Ambiente: ${process.env.NODE_ENV || 'development'}`);
            console.log(`   - PID: ${process.pid}`);
        });

        server.on('error', (err) => {
            console.error('❌ Erro no servidor HTTP:', err && err.stack ? err.stack : err);
        });

        // Graceful shutdown
        process.on('SIGTERM', () => {
            console.log('SIGTERM recebido. Parando servidor...');
            server.close(() => process.exit(0));
        });

    } catch (error) {
        console.error('❌ Erro ao iniciar servidor:', error && error.stack ? error.stack : error);
    }
}

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('\n🛑 SIGINT recebido, encerrando servidor...');
    process.exit(0);
});

startServer();
