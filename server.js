const express = require('express');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
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

        // Criar tabelas
        db.serialize(() => {
            // Tabela de jobs
            db.run(`
                CREATE TABLE IF NOT EXISTS jobs (
                    id TEXT PRIMARY KEY,
                    status TEXT NOT NULL,
                    result TEXT,
                    error TEXT,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                )
            `);

            // Tabela de instâncias
            db.run(`
                CREATE TABLE IF NOT EXISTS instances (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    contacts TEXT NOT NULL,
                    message TEXT NOT NULL,
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

            // Tabela para mapeamento com provedores externos (Z-API)
            db.run(`
                CREATE TABLE IF NOT EXISTS api_instances (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    instance_id TEXT NOT NULL,
                    provider TEXT NOT NULL DEFAULT 'zapi',
                    api_instance_id TEXT,
                    api_token TEXT,
                    api_response TEXT,
                    webhook_url TEXT,
                    status TEXT DEFAULT 'created',
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                )
            `, (err2) => {
                if (err2) {
                    console.error('Erro ao criar tabela api_instances:', err2);
                }
            });
        });

        db.close();
    });
}

// Funções do banco de dados
function createJob(jobId, status = 'queued') {
    return new Promise((resolve, reject) => {
        const db = new sqlite3.Database(DB_PATH);
        const now = new Date().toISOString();
        
        db.run(
            'INSERT INTO jobs (id, status, created_at, updated_at) VALUES (?, ?, ?, ?)',
            [jobId, status, now, now],
            function(err) {
                if (err) {
                    console.error('Erro ao criar job:', err);
                    reject(err);
                } else {
                    resolve(this.lastID);
                }
            }
        );
        
        db.close();
    });
}

function updateJob(jobId, status, result = null, error = null) {
    return new Promise((resolve, reject) => {
        const db = new sqlite3.Database(DB_PATH);
        const now = new Date().toISOString();
        
        db.run(
            'UPDATE jobs SET status=?, result=?, error=?, updated_at=? WHERE id=?',
            [status, result, error, now, jobId],
            function(err) {
                if (err) {
                    console.error('Erro ao atualizar job:', err);
                    reject(err);
                } else {
                    resolve(this.changes);
                }
            }
        );
        
        db.close();
    });
}

function getJob(jobId) {
    return new Promise((resolve, reject) => {
        const db = new sqlite3.Database(DB_PATH);
        
        db.get('SELECT * FROM jobs WHERE id = ?', [jobId], (err, row) => {
            if (err) {
                console.error('Erro ao obter job:', err);
                reject(err);
            } else {
                resolve(row);
            }
        });
        
        db.close();
    });
}

// Função para obter instância da API
async function getApiInstance(instanceId) {
    const db = new sqlite3.Database(DB_PATH);
    return new Promise((resolve, reject) => {
        db.get('SELECT * FROM api_instances WHERE instance_id = ? ORDER BY created_at DESC LIMIT 1', 
            [instanceId], (err, row) => {
            db.close();
            if (err) {
                reject(err);
            } else {
                resolve(row);
            }
        });
    });
}

// Função para enviar mensagens via API em background
async function backgroundSendMessages(jobId, contacts, message, instanceId) {
    try {
        await updateJob(jobId, 'running');
        
        const apiInstance = await getApiInstance(instanceId);
        if (!apiInstance || !apiInstance.api_instance_id) {
            await updateJob(jobId, 'failed', null, 'Instância da API não disponível');
            return;
        }
        
        console.log(`Enviando mensagens via API para ${contacts.length} contatos`);
        let sent = 0;
        let failed = 0;
        
        for (const contact of contacts) {
            try {
                await zapi.sendMessage(apiInstance.api_instance_id, {
                    to: contact,
                    type: 'text',
                    text: message
                });
                sent++;
                // Rate limiting
                await new Promise(resolve => setTimeout(resolve, 1000));
            } catch (error) {
                console.error(`Erro ao enviar para ${contact}:`, error.message);
                failed++;
            }
        }
        
        if (sent > 0) {
            await updateJob(jobId, 'finished', `Mensagens enviadas para ${sent} contatos (${failed} falharam)`);
        } else {
            await updateJob(jobId, 'failed', null, 'Nenhuma mensagem foi enviada');
        }
        
    } catch (error) {
        console.error('Erro no envio em background:', error);
        await updateJob(jobId, 'failed', null, error.message);
    }
}

// Rotas da API
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'dashboard.html'));
});

// Endpoint para obter QR Code da API
app.get('/api/qr/:instanceId', async (req, res) => {
    try {
        const instanceId = req.params.instanceId;
        const apiInstance = await getApiInstance(instanceId);
        
        if (!apiInstance || !apiInstance.api_instance_id) {
            return res.status(404).json({ 
                error: 'Instância não encontrada',
                message: 'Instância da API não configurada'
            });
        }
        
        const qrData = await zapi.getQRCode(apiInstance.api_instance_id);
        
        if (qrData && qrData.qrcode) {
            // Se for base64, converter para imagem
            if (qrData.qrcode.startsWith('data:image')) {
                const base64Data = qrData.qrcode.split(',')[1];
                const buffer = Buffer.from(base64Data, 'base64');
                
                res.setHeader('Content-Type', 'image/png');
                res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
                return res.send(buffer);
            }
            
            return res.json(qrData);
        }
        
        return res.status(404).json({
            error: 'QR Code não disponível',
            message: 'QR Code ainda não foi gerado pela API'
        });
        
    } catch (error) {
        console.error('❌ Erro ao obter QR Code:', error);
        res.status(500).json({ 
            error: 'Erro ao obter QR Code',
            message: error.message 
        });
    }
});


// Endpoint de health focado na API
app.get('/api/health', async (req, res) => {
    try {
        const health = {
            status: 'ok',
            timestamp: new Date().toISOString(),
            api_status: 'available',
            uptime: process.uptime(),
            instances_count: 0
        };
        
        // Contar instâncias ativas
        const db = new sqlite3.Database(DB_PATH);
        db.get('SELECT COUNT(*) as count FROM instances', (err, row) => {
            if (!err && row) {
                health.instances_count = row.count;
            }
            db.close();
        });
        
        // Verificar se a API está respondendo
        try {
            const testResponse = await fetch(process.env.ZAPI_BASE_URL || 'https://api.z-api.io', {
                method: 'HEAD',
                timeout: 5000
            });
            health.api_status = testResponse.ok ? 'available' : 'error';
        } catch (error) {
            health.api_status = 'unavailable';
            health.api_error = error.message;
        }
        
        res.json(health);
        
    } catch (error) {
        console.error('Erro ao verificar health:', error);
        res.status(500).json({
            status: 'error',
            timestamp: new Date().toISOString(),
            error: error.message
        });
    }
});
// Endpoint para inicializar instância da API
app.post('/api/instance/:instanceId/start', async (req, res) => {
    try {
        const instanceId = req.params.instanceId;
        const apiInstance = await getApiInstance(instanceId);
        
        if (!apiInstance || !apiInstance.api_instance_id) {
            return res.status(404).json({ 
                error: 'Instância não encontrada',
                message: 'Instância da API não configurada'
            });
        }
        
        console.log(`🚀 Inicializando instância da API: ${apiInstance.api_instance_id}`);
        
        const result = await zapi.startInstance(apiInstance.api_instance_id);
        
        // Atualizar status no banco
        const db = new sqlite3.Database(DB_PATH);
        const now = new Date().toISOString();
        db.run('UPDATE api_instances SET status = ?, updated_at = ? WHERE instance_id = ?', 
            ['starting', now, instanceId], (err) => {
            if (err) console.error('Erro ao atualizar status:', err);
            db.close();
        });
        
        res.json({ 
            status: 'starting', 
            message: 'Instância da API está sendo inicializada',
            api_response: result
        });
        
    } catch (error) {
        console.error('Erro ao iniciar instância da API:', error);
        res.status(500).json({ 
            status: 'error', 
            message: error.message 
        });
    }
});

// Endpoint para debug simplificado
app.get('/api/debug', async (req, res) => {
    try {
        const debugInfo = {
            node_version: process.version,
            platform: process.platform,
            uptime: process.uptime(),
            memory: process.memoryUsage(),
            env: {
                NODE_ENV: process.env.NODE_ENV,
                PORT: process.env.PORT,
                ZAPI_BASE_URL: process.env.ZAPI_BASE_URL ? 'configurado' : 'não configurado',
                ZAPI_TOKEN: process.env.ZAPI_TOKEN ? 'configurado' : 'não configurado'
            },
            database: {
                exists: fs.existsSync(path.join(__dirname, 'app_new.db'))
            }
        };
        
        res.json(debugInfo);
        
    } catch (error) {
        res.status(500).json({
            error: 'Erro ao obter informações de debug',
            message: error.message
        });
    }
});

// Endpoint webhook para eventos da Z-API
app.post('/api/zapi/webhook', express.json(), async (req, res) => {
    try {
        const payload = req.body;
        console.log('📥 Webhook Z-API recebido:', payload);

        // Example payload: { event: 'connected', instanceId: 'zapi-xxx', timestamp, number }
        if (!payload || !payload.instanceId) {
            return res.status(400).json({ error: 'Invalid payload' });
        }

        const db = new sqlite3.Database(DB_PATH);
        // find mapping
        db.get('SELECT * FROM api_instances WHERE api_instance_id = ? ORDER BY created_at DESC LIMIT 1', [payload.instanceId], (err, map) => {
            if (err) {
                console.error('Erro ao consultar mapping por webhook:', err);
                db.close();
                return res.status(500).json({ error: 'DB error' });
            }

            if (!map) {
                console.warn('Mapping da API não encontrado para instanceId:', payload.instanceId);
                db.close();
                return res.status(404).json({ error: 'mapping_not_found' });
            }

            // Update instances table status
            const now = new Date().toISOString();
            db.run('UPDATE instances SET updated_at = ? WHERE id = ?', [now, map.instance_id], function(uErr) {
                if (uErr) console.error('Erro ao atualizar instance updated_at:', uErr);
            });

            // Update API instance status based on event
            let newStatus = map.status;
            if (payload.event === 'connected') newStatus = 'connected';
            else if (payload.event === 'disconnected') newStatus = 'disconnected';

            // Save event in mapping api_response (append)
            let respObj = {};
            try { respObj = map.api_response ? JSON.parse(map.api_response) : {}; } catch(e) { respObj = {}; }
            respObj.last_event = payload;
            
            db.run('UPDATE api_instances SET api_response = ?, status = ?, updated_at = ? WHERE id = ?', 
                [JSON.stringify(respObj), newStatus, now, map.id], (sErr) => {
                if (sErr) console.error('Erro ao atualizar mapping api_response:', sErr);
                db.close();
                return res.json({ ok: true });
            });
        });

    } catch (error) {
        console.error('Erro no webhook zapi:', error);
        res.status(500).json({ error: error.message });
    }
});

// Endpoint para verificar status de uma instância específica
app.get('/api/instance/:instanceId/status', async (req, res) => {
    try {
        const instanceId = req.params.instanceId;
        const apiInstance = await getApiInstance(instanceId);
        
        if (!apiInstance || !apiInstance.api_instance_id) {
            return res.json({ 
                connected: false, 
                status: 'not_configured',
                message: 'Instância da API não configurada'
            });
        }
        
        const status = await zapi.getStatus(apiInstance.api_instance_id);
        
        res.json({ 
            connected: status && status.connected === true, 
            status: status ? status.status : 'unknown',
            api_response: status
        });
        
    } catch (error) {
        console.error('Erro ao verificar status:', error);
        res.status(500).json({ 
            connected: false, 
            status: 'error', 
            error: error.message 
        });
    }
});

// Endpoint para parar instância da API
app.post('/api/instance/:instanceId/stop', async (req, res) => {
    try {
        const instanceId = req.params.instanceId;
        const apiInstance = await getApiInstance(instanceId);
        
        if (!apiInstance || !apiInstance.api_instance_id) {
            return res.status(404).json({ 
                error: 'Instância não encontrada',
                message: 'Instância da API não configurada'
            });
        }
        
        console.log(`🛑 Parando instância da API: ${apiInstance.api_instance_id}`);
        await zapi.stopInstance(apiInstance.api_instance_id);
        
        // Atualizar status no banco
        const db = new sqlite3.Database(DB_PATH);
        const now = new Date().toISOString();
        db.run('UPDATE api_instances SET status = ?, updated_at = ? WHERE instance_id = ?', 
            ['stopped', now, instanceId], (err) => {
            if (err) console.error('Erro ao atualizar status:', err);
            db.close();
        });
        
        res.json({ 
            status: 'stopped', 
            message: 'Instância da API parada com sucesso'
        });
        
    } catch (error) {
        console.error('Erro ao parar instância da API:', error);
        res.status(500).json({ 
            status: 'error', 
            message: error.message 
        });
    }
});

// Endpoint para obter contatos via API
app.get('/api/instance/:instanceId/contacts', async (req, res) => {
    try {
        const instanceId = req.params.instanceId;
        console.log(`📞 Solicitação de contatos para instância: ${instanceId}`);
        
        const apiInstance = await getApiInstance(instanceId);
        if (!apiInstance || !apiInstance.api_instance_id) {
            return res.status(404).json({ 
                error: 'Instância não encontrada',
                message: 'Instância da API não configurada'
            });
        }
        
        // Verificar se a instância está conectada
        const status = await zapi.getStatus(apiInstance.api_instance_id);
        if (!status || !status.connected) {
            return res.status(401).json({ 
                error: 'Instância não está conectada',
                message: 'Conecte a instância primeiro escaneando o QR Code'
            });
        }
        
        // Nota: A maioria das APIs de WhatsApp não fornece lista de contatos
        // por questões de privacidade. Retornar lista vazia ou erro apropriado.
        console.log('ℹ️  APIs de WhatsApp geralmente não fornecem lista de contatos');
        res.json({ 
            contacts: [], 
            count: 0,
            message: 'APIs de WhatsApp não fornecem lista de contatos por questões de privacidade'
        });
        
    } catch (error) {
        console.error('❌ Erro ao obter contatos:', error);
        res.status(500).json({ error: error.message });
    }
});

// Endpoint genérico para QR code (redireciona para primeira instância disponível)
app.get('/api/qr', async (req, res) => {
    try {
        // Buscar primeira instância disponível
        const db = new sqlite3.Database(DB_PATH);
        db.get('SELECT * FROM instances ORDER BY created_at DESC LIMIT 1', (err, row) => {
            db.close();
            if (err || !row) {
                return res.status(404).json({
                    error: 'Nenhuma instância encontrada',
                    message: 'Crie uma instância primeiro'
                });
            }
            
            // Redirecionar para QR da instância específica
            res.redirect(`/api/qr/${row.id}`);
        });
        
    } catch (error) {
        console.error('❌ Erro ao processar requisição de QR Code:', error);
        return res.status(500).json({
            error: 'Erro interno',
            message: error.message
        });
    }
});


// Endpoint para enviar mensagens via instância específica
app.post('/api/instance/:instanceId/send', async (req, res) => {
    try {
        const instanceId = req.params.instanceId;
        const { contacts, message } = req.body;
        
        // Validação mais robusta
        if (!contacts || !Array.isArray(contacts) || contacts.length === 0) {
            return res.status(400).json({ error: 'Pelo menos um contato é obrigatório' });
        }
        
        if (!message || typeof message !== 'string' || message.trim().length === 0) {
            return res.status(400).json({ error: 'Mensagem é obrigatória' });
        }
        
        // Verificar se instância existe
        const apiInstance = await getApiInstance(instanceId);
        if (!apiInstance || !apiInstance.api_instance_id) {
            return res.status(404).json({ 
                error: 'Instância não encontrada',
                message: 'Instância da API não configurada'
            });
        }
        
        // Criar job
        const jobId = uuidv4();
        await createJob(jobId, 'queued');
        
        // Iniciar envio em background
        backgroundSendMessages(jobId, contacts, message, instanceId).catch(console.error);
        
        res.status(202).json({ 
            job_id: jobId, 
            status: 'queued',
            instance_id: instanceId
        });
        
    } catch (error) {
        console.error('Erro ao enviar mensagens:', error);
        res.status(500).json({ error: error.message });
    }
});

// Endpoint genérico de envio (usa primeira instância disponível)
app.post('/api/send', async (req, res) => {
    try {
        const { contacts, message } = req.body;
        
        // Validação
        if (!contacts || !Array.isArray(contacts) || contacts.length === 0) {
            return res.status(400).json({ error: 'Pelo menos um contato é obrigatório' });
        }
        
        if (!message || typeof message !== 'string' || message.trim().length === 0) {
            return res.status(400).json({ error: 'Mensagem é obrigatória' });
        }
        
        // Buscar primeira instância disponível
        const db = new sqlite3.Database(DB_PATH);
        db.get('SELECT * FROM instances ORDER BY created_at DESC LIMIT 1', async (err, row) => {
            db.close();
            if (err || !row) {
                return res.status(404).json({
                    error: 'Nenhuma instância encontrada',
                    message: 'Crie uma instância primeiro'
                });
            }
            
            try {
                // Verificar se instância da API existe
                const apiInstance = await getApiInstance(row.id);
                if (!apiInstance || !apiInstance.api_instance_id) {
                    return res.status(404).json({ 
                        error: 'Instância da API não encontrada',
                        message: 'Instância da API não configurada'
                    });
                }
                
                // Criar job
                const jobId = uuidv4();
                await createJob(jobId, 'queued');
                
                // Iniciar envio em background
                backgroundSendMessages(jobId, contacts, message, row.id).catch(console.error);
                
                res.status(202).json({ 
                    job_id: jobId, 
                    status: 'queued',
                    instance_id: row.id
                });
                
            } catch (error) {
                console.error('Erro ao processar envio:', error);
                res.status(500).json({ error: error.message });
            }
        });
        
    } catch (error) {
        console.error('Erro ao enviar mensagens:', error);
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/job/:jobId', async (req, res) => {
    try {
        const job = await getJob(req.params.jobId);
        if (!job) {
            return res.status(404).json({ error: 'Job não encontrado' });
        }
        
        res.json(job);
        
    } catch (error) {
        console.error('Erro ao obter job:', error);
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/instances', (req, res) => {
    const db = new sqlite3.Database(DB_PATH);
    
    db.all('SELECT * FROM instances ORDER BY created_at DESC', (err, rows) => {
        if (err) {
            console.error('Erro ao listar instâncias:', err);
            res.status(500).json({ error: err.message });
            return;
        }
        
        // For each instance, attempt to fetch zapi mapping
        const instances = rows.map(row => ({
            id: row.id,
            name: row.name,
            contacts: row.contacts ? row.contacts.split(',') : [],
            message: row.message,
            provider: row.provider || 'selenium',
            created_at: row.created_at,
            updated_at: row.updated_at
        }));

        // Load API mappings
        if (rows.length > 0) {
            db.all('SELECT * FROM api_instances WHERE instance_id IN (' + rows.map(r => `'${r.id}'`).join(',') + ')', (mErr, maps) => {
                if (!mErr && maps) {
                    const byInstance = {};
                    maps.forEach(m => { byInstance[m.instance_id] = m; });
                    instances.forEach(inst => {
                        if (byInstance[inst.id]) {
                            inst.provider = byInstance[inst.id].provider;
                            inst.api_instance_id = byInstance[inst.id].api_instance_id;
                            inst.api_token = byInstance[inst.id].api_token;
                            inst.api_status = byInstance[inst.id].status;
                        }
                    });
                }

                res.json({ instances });
            });
        } else {
            res.json({ instances });
        }
    });
    
    db.close();
});

app.get('/api/instances/:instanceId', (req, res) => {
    const db = new sqlite3.Database(DB_PATH);
    
    db.get('SELECT * FROM instances WHERE id = ?', [req.params.instanceId], (err, row) => {
        if (err) {
            console.error('Erro ao obter instância:', err);
            res.status(500).json({ error: err.message });
        } else if (!row) {
            res.status(404).json({ error: 'Instância não encontrada' });
        } else {
            const instance = {
                id: row.id,
                name: row.name,
                contacts: row.contacts ? row.contacts.split(',') : [],
                message: row.message,
                provider: row.provider || 'selenium',
                created_at: row.created_at,
                updated_at: row.updated_at
            };

            db.get('SELECT * FROM api_instances WHERE instance_id = ? ORDER BY created_at DESC LIMIT 1', [row.id], (mErr, mapRow) => {
                if (!mErr && mapRow) {
                    instance.api_instance_id = mapRow.api_instance_id;
                    instance.api_token = mapRow.api_token;
                    instance.api_response = mapRow.api_response ? JSON.parse(mapRow.api_response) : null;
                    instance.api_status = mapRow.status;
                }
                res.json(instance);
            });
        }
    });
    
    db.close();
});

app.post('/api/instances', (req, res) => {
    try {
        const { name, contacts, message, provider } = req.body;
        
        // Validação mais robusta
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
            'INSERT INTO instances (id, name, contacts, message, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
            [instanceId, name, contacts.join(','), message, now, now],
            async function(err) {
                if (err) {
                    console.error('Erro ao criar instância:', err);
                    res.status(500).json({ error: err.message });
                    db.close();
                    return;
                }

                // Sempre criar instância na API (Z-API por padrão)
                const finalProvider = provider || 'zapi';
                try {
                    const apiResp = await zapi.createInstance(name);
                    const apiInstanceId = apiResp && (apiResp.instanceId || apiResp.id || apiResp.sessionId) ? (apiResp.instanceId || apiResp.id || apiResp.sessionId) : null;
                    const apiToken = apiResp && apiResp.token ? apiResp.token : (process.env.ZAPI_TOKEN || null);

                    db.run(
                        'INSERT INTO api_instances (instance_id, provider, api_instance_id, api_token, api_response, webhook_url, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
                        [instanceId, finalProvider, apiInstanceId, apiToken, JSON.stringify(apiResp || {}), null, 'created', now, now],
                        function(mapErr) {
                            if (mapErr) console.error('Erro ao salvar mapping da API:', mapErr);
                        }
                    );

                    res.status(201).json({
                        id: instanceId,
                        name: name,
                        contacts: contacts,
                        message: message,
                        provider: finalProvider,
                        api_instance_id: apiInstanceId,
                        api_status: 'created',
                        created_at: now,
                        updated_at: now
                    });
                } catch (e) {
                    console.error('Erro ao criar instância na API:', e);
                    // Criar instância local mesmo se API falhar
                    res.status(201).json({
                        id: instanceId,
                        name: name,
                        contacts: contacts,
                        message: message,
                        provider: finalProvider,
                        api_error: e.message,
                        api_status: 'error',
                        created_at: now,
                        updated_at: now
                    });
                } finally {
                    db.close();
                }
            }
        );
        
    } catch (error) {
        console.error('Erro ao criar instância:', error);
        res.status(500).json({ error: error.message });
    }
});

app.put('/api/instances/:instanceId', (req, res) => {
    try {
        const { name, contacts, message } = req.body;
        
        // Validação mais robusta
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
        
        db.close();
        
    } catch (error) {
        console.error('Erro ao atualizar instância:', error);
        res.status(500).json({ error: error.message });
    }
});

app.delete('/api/instances/:instanceId', (req, res) => {
    const db = new sqlite3.Database(DB_PATH);
    
    db.run('DELETE FROM instances WHERE id = ?', [req.params.instanceId], function(err) {
        if (err) {
            console.error('Erro ao deletar instância:', err);
            res.status(500).json({ error: err.message });
        } else if (this.changes === 0) {
            res.status(404).json({ error: 'Instância não encontrada' });
        } else {
            res.json({ status: 'deleted' });
        }
    });
    
    db.close();
});

// Inicializar servidor
async function startServer() {
    try {
        await initDatabase();
        console.log('Iniciando servidor Express...');
        const server = app.listen(PORT, '0.0.0.0', () => {
            console.log(`Servidor rodando na porta ${PORT}`);
            console.log(`Acesse: http://localhost:${PORT}`);
            // Log basic server info
            console.log('📊 Informações do servidor:');
            console.log(`- Node.js: ${process.version}`);
            console.log(`- Ambiente: ${process.env.NODE_ENV || 'development'}`);
            console.log(`- Diretório: ${process.cwd()}`);
            console.log(`- PID: ${process.pid}`);
        });

        // Connection tracking
        server.on('connection', (socket) => {
            console.log(`📡 Nova conexão TCP: ${socket.remoteAddress}:${socket.remotePort}`);
            socket.on('error', (err) => {
                console.error('Erro na conexão TCP:', err);
            });
        });

        // Track HTTP requests at server level
        server.on('request', (req, res) => {
            const start = Date.now();
            console.log(`📥 ${req.method} ${req.url} iniciado`);
            
            res.on('finish', () => {
                console.log(`📤 ${req.method} ${req.url} finalizado em ${Date.now() - start}ms (${res.statusCode})`);
            });
        });

        server.on('error', (err) => {
            console.error('Erro no servidor HTTP:', err && err.stack ? err.stack : err);
        });

        // Graceful shutdown for SIGTERM as well
        process.on('SIGTERM', async () => {
            console.log('SIGTERM recebido. Parando servidor...');
            try {
                server.close(() => process.exit(0));
            } catch (e) {
                console.error('Erro ao encerrar durante SIGTERM:', e);
                process.exit(1);
            }
        });

    } catch (error) {
        console.error('Erro ao iniciar servidor:', error && error.stack ? error.stack : error);
        // Do not exit immediately; allow diagnostics collection
    }
}

// Graceful shutdown
let isShuttingDown = false;

async function gracefulShutdown(signal) {
    if (isShuttingDown) {
        console.log('Já em processo de shutdown, ignorando sinal:', signal);
        return;
    }
    
    isShuttingDown = true;
    console.log(`\n🛑 Recebido sinal ${signal}, iniciando shutdown graceful...`);
    
    try {
        console.log('Encerrando servidor...');
        process.exit(0);
    } catch (error) {
        console.error('Erro durante shutdown:', error);
        process.exit(1);
    }
}

// Capturar sinais de término
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGHUP', () => gracefulShutdown('SIGHUP'));

startServer();
