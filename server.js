const express = require('express');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const morgan = require('morgan');
const WhatsAppBot = require('./whatsapp-bot');
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

// Instância global do bot
let botInstance = null;
let botLock = false;

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

            // Tabela para mapeamento com provedores externos (ex: Z-API)
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
            `, (err2) => {
                if (err2) {
                    console.error('Erro ao criar tabela zapi_mappings:', err2);
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

// Função para obter instância do bot
function getBotInstance() {
    return new Promise(async (resolve, reject) => {
        if (botLock) {
            // Aguardar um pouco se o bot estiver sendo inicializado
            setTimeout(() => getBotInstance().then(resolve).catch(reject), 1000);
            return;
        }

        if (botInstance) {
            // Verificar se a instância ainda está viva
            try {
                await botInstance.driver.getCurrentUrl();
                resolve(botInstance);
                return;
            } catch (e) {
                console.log('⚠️  Instância anterior não está mais disponível, criando nova...');
                botInstance = null;
            }
        }

        botLock = true;
        try {
            console.log('Criando nova instância do bot...');
            // Tempo de espera para dar tempo do QR renderizar
            botInstance = new WhatsAppBot(null, 60000);

            // Start with a safety timeout
            const startTimeoutMs = 90000; // 90 seconds
            console.log(`Iniciando o bot com timeout de ${startTimeoutMs}ms para criação do driver`);
            
            try {
                const started = await Promise.race([
                    botInstance.start(),
                    new Promise((_, rejectTimeout) => 
                        setTimeout(() => rejectTimeout(new Error('Timeout ao iniciar o driver')), startTimeoutMs)
                    )
                ]);

                if (!started) {
                    console.error('Falha ao iniciar bot - start() retornou falso');
                    try {
                        await botInstance.stop();
                    } catch (stopErr) {
                        console.warn('Erro ao parar instância após falha de start():', stopErr?.message || stopErr);
                    }
                    botInstance = null;
                    reject(new Error('Falha ao iniciar bot - start() retornou falso'));
                    return;
                }
            } catch (startErr) {
                console.error('Erro ao iniciar driver do bot:', startErr?.stack || startErr);
                // cleanup
                try {
                    if (botInstance) await botInstance.stop();
                } catch (stopErr) {
                    console.warn('Erro ao limpar instância do bot após falha:', stopErr?.message || stopErr);
                }
                botInstance = null;
                reject(startErr);
                return;
            }
            
            console.log('✅ Bot iniciado com sucesso!');
            resolve(botInstance);
        } catch (error) {
            console.error('Erro ao criar instância do bot:', error);
            console.error('Possíveis causas:');
            console.error('1. Chrome não está instalado');
            console.error('2. Chromedriver não encontrado');
            console.error('3. Porta já em uso');
            console.error('4. Permissões insuficientes');
            botInstance = null;
            reject(error);
        } finally {
            botLock = false;
        }
    });
}

// Função para enviar mensagens em background
async function backgroundSendMessages(jobId, contacts, message) {
    try {
        await updateJob(jobId, 'running');
        
        const bot = await getBotInstance();
        if (!bot) {
            await updateJob(jobId, 'failed', null, 'Bot não disponível');
            return;
        }
        
        console.log(`Enviando mensagens para ${contacts.length} contatos`);
        const results = await bot.sendMessages(contacts, message);
        
        if (results.sent && results.sent.length > 0) {
            await updateJob(jobId, 'finished', `Mensagens enviadas para ${results.sent.length} contatos`);
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

app.post('/api/qr/refresh', async (req, res) => {
    try {
        if (!botInstance) {
            return res.status(503).json({ 
                error: 'Bot não inicializado',
                message: 'Inicie o bot primeiro'
            });
        }
        
        if (botInstance.isLoggedIn) {
            return res.json({
                status: 'already_logged_in',
                message: 'Bot já está conectado ao WhatsApp'
            });
        }
        
        console.log('🔄 Atualizando QR Code...');
        
        // Tentar clicar no botão de refresh do QR no WhatsApp Web
        const { By } = require('selenium-webdriver');
        try {
            const refreshBtn = await botInstance.driver.findElement(By.css("[data-testid='refresh-large']"));
            if (refreshBtn) {
                await refreshBtn.click();
                console.log('✅ Botão de refresh clicado');
                
                // Aguardar novo QR carregar
                await new Promise(resolve => setTimeout(resolve, 3000));
                
                // Capturar novo screenshot
                const screenshot = await botInstance.driver.takeScreenshot();
                const ssPath = path.join(__dirname, 'whatsapp_qr_debug.png');
                fs.writeFileSync(ssPath, screenshot, 'base64');
                
                return res.json({
                    status: 'refreshed',
                    message: 'QR Code atualizado com sucesso'
                });
            }
        } catch (e) {
            console.log('⚠️  Botão de refresh não encontrado, tentando recarregar página...');
            
            // Alternativa: recarregar a página
            await botInstance.driver.navigate().refresh();
            await new Promise(resolve => setTimeout(resolve, 5000));
            
            const screenshot = await botInstance.driver.takeScreenshot();
            const ssPath = path.join(__dirname, 'whatsapp_qr_debug.png');
            fs.writeFileSync(ssPath, screenshot, 'base64');
            
            return res.json({
                status: 'page_reloaded',
                message: 'Página recarregada, novo QR Code disponível'
            });
        }
        
    } catch (error) {
        console.error('❌ Erro ao atualizar QR Code:', error);
        res.status(500).json({ 
            error: 'Erro ao atualizar QR Code',
            message: error.message 
        });
    }
});


// Melhorar endpoint /api/health com mais informações
app.get('/api/health', async (req, res) => {
    try {
        const health = {
            status: 'ok',
            timestamp: new Date().toISOString(),
            bot_status: 'not_started',
            qr_available: false,
            uptime: process.uptime()
        };
        
        if (botInstance) {
            // Verificar se driver ainda está ativo
            try {
                await botInstance.driver.getCurrentUrl();
                
                if (botInstance.isLoggedIn) {
                    health.bot_status = 'connected';
                } else {
                    health.bot_status = 'initializing';
                }
                
                // Verificar se QR Code está disponível
                const ssPath = path.join(__dirname, 'whatsapp_qr_debug.png');
                health.qr_available = fs.existsSync(ssPath) || !!botInstance.getQRCodeData();
                
                // Tentar verificar se ainda está na página do QR ou já logou
                try {
                    const { By } = require('selenium-webdriver');
                    const chatList = await botInstance.driver.findElement(By.css("[data-testid='chat-list']")).catch(() => null);
                    
                    if (chatList) {
                        health.bot_status = 'connected';
                        botInstance.isLoggedIn = true;
                    } else if (health.qr_available) {
                        // Ainda na tela de QR
                        health.bot_status = 'waiting_qr_scan';
                    }
                } catch (e) {
                    // Não conseguiu verificar elementos específicos
                }
            } catch (driverErr) {
                // Driver não está mais ativo
                console.warn('⚠️  Driver não está mais ativo:', driverErr.message);
                health.bot_status = 'error';
                health.error = 'Driver não está respondendo';
                botInstance = null;
            }
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
// Melhorar endpoint /api/bot/start
app.post('/api/bot/start', async (req, res) => {
    try {
        if (botInstance) {
            // Verificar se realmente está ativo
            try {
                await botInstance.driver.getCurrentUrl();
                
                return res.json({ 
                    status: 'already_started', 
                    message: 'Bot já está inicializado',
                    bot_status: botInstance.isLoggedIn ? 'connected' : 'initializing'
                });
            } catch (e) {
                // Driver morreu, limpar instância
                console.log('⚠️  Driver anterior morreu, criando novo...');
                botInstance = null;
            }
        }
        
        console.log('🚀 Inicializando bot...');
        
        // Responder imediatamente para não travar interface
        res.json({ 
            status: 'starting', 
            message: 'Bot está sendo inicializado. Aguarde...',
            bot_status: 'initializing'
        });
        
        // Inicializar em background
        getBotInstance()
            .then(() => {
                console.log('✅ Bot inicializado com sucesso');
            })
            .catch(error => {
                console.error('❌ Erro ao inicializar bot:', error);
            });
        
    } catch (error) {
        console.error('Erro ao iniciar bot:', error);
        res.status(500).json({ 
            status: 'error', 
            message: error.message 
        });
    }
});

// Adicionar endpoint para obter logs (útil para debug)
const logs = [];
const MAX_LOGS = 100;

// Interceptar console.log para armazenar logs
const originalConsoleLog = console.log;
console.log = function(...args) {
    const timestamp = new Date().toISOString();
    const message = args.map(arg => 
        typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
    ).join(' ');
    
    logs.push({ timestamp, message, level: 'info' });
    if (logs.length > MAX_LOGS) {
        logs.shift();
    }
    
    originalConsoleLog.apply(console, args);
};

const originalConsoleError = console.error;
console.error = function(...args) {
    const timestamp = new Date().toISOString();
    const message = args.map(arg => 
        typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
    ).join(' ');
    
    logs.push({ timestamp, message, level: 'error' });
    if (logs.length > MAX_LOGS) {
        logs.shift();
    }
    
    originalConsoleError.apply(console, args);
};

app.get('/api/logs', (req, res) => {
    const limit = parseInt(req.query.limit) || 50;
    const level = req.query.level; // 'info', 'error', ou undefined para todos
    
    let filteredLogs = logs;
    
    if (level) {
        filteredLogs = logs.filter(log => log.level === level);
    }
    
    res.json({
        logs: filteredLogs.slice(-limit),
        total: filteredLogs.length
    });
});

// Endpoint específico para diagnóstico do QR code
app.get('/api/debug/qr', async (req, res) => {
    try {
        const qrDebugInfo = {
            status: 'checking',
            timestamp: new Date().toISOString(),
            qr_file: {
                exists: false,
                path: '',
                size: 0,
                age: 0
            },
            bot_state: {
                initialized: !!botInstance,
                logged_in: botInstance ? botInstance.isLoggedIn : false
            },
            chrome_info: {}
        };

        // Verificar arquivo do QR
        const ssPath = path.join(__dirname, 'whatsapp_qr_debug.png');
        if (fs.existsSync(ssPath)) {
            const stats = fs.statSync(ssPath);
            qrDebugInfo.qr_file = {
                exists: true,
                path: ssPath,
                size: stats.size,
                age: Date.now() - stats.mtimeMs,
                last_modified: stats.mtime
            };
        }

        // Verificar estado do Chrome/driver
        if (botInstance && botInstance.driver) {
            try {
                const url = await botInstance.driver.getCurrentUrl();
                qrDebugInfo.chrome_info = {
                    current_url: url,
                    headless: botInstance.headless,
                    driver_ok: true
                };
            } catch (e) {
                qrDebugInfo.chrome_info = {
                    error: 'Driver não está respondendo: ' + e.message,
                    driver_ok: false
                };
            }
        }

        res.json(qrDebugInfo);
    } catch (error) {
        res.status(500).json({
            error: 'Erro ao obter diagnóstico do QR',
            message: error.message
        });
    }
});

// Adicionar endpoint para debug info
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
                DISPLAY: process.env.DISPLAY
            },
            bot: {
                exists: !!botInstance,
                isLoggedIn: botInstance ? botInstance.isLoggedIn : false,
                headless: botInstance ? botInstance.headless : null
            },
            files: {
                qr_screenshot: fs.existsSync(path.join(__dirname, 'whatsapp_qr_debug.png')),
                database: fs.existsSync(path.join(__dirname, 'app_new.db')),
                chrome_profile: fs.existsSync(path.join(__dirname, 'chrome-profile'))
            }
        };
        
        // Verificar Chrome
        const { execSync } = require('child_process');
        try {
            const chromeVersion = execSync('google-chrome --version || google-chrome-stable --version', {
                encoding: 'utf8',
                timeout: 3000
            }).trim();
            debugInfo.chrome_version = chromeVersion;
        } catch (e) {
            debugInfo.chrome_version = 'Não encontrado';
        }
        
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
        db.get('SELECT * FROM zapi_mappings WHERE zapi_instance_id = ? ORDER BY created_at DESC LIMIT 1', [payload.instanceId], (err, map) => {
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

            // Update instances table status (provider field exists)
            const now = new Date().toISOString();
            db.run('UPDATE instances SET updated_at = ? WHERE id = ?', [now, map.instance_id], function(uErr) {
                if (uErr) console.error('Erro ao atualizar instance updated_at:', uErr);
            });

            // Save event in mapping zapi_response (append)
            let respObj = {};
            try { respObj = map.zapi_response ? JSON.parse(map.zapi_response) : {}; } catch(e) { respObj = {}; }
            respObj.last_event = payload;
            db.run('UPDATE zapi_mappings SET zapi_response = ? WHERE id = ?', [JSON.stringify(respObj), map.id], (sErr) => {
                if (sErr) console.error('Erro ao atualizar mapping zapi_response:', sErr);
                db.close();
                return res.json({ ok: true });
            });
        });

    } catch (error) {
        console.error('Erro no webhook zapi:', error);
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/status', async (req, res) => {
    try {
        if (!botInstance) {
            return res.json({ connected: false, status: 'not_started' });
        }
        
        if (botInstance.isLoggedIn) {
            return res.json({ connected: true, status: 'connected' });
        }
        
        // Verificação rápida
        try {
            const { By } = require('selenium-webdriver');
            await botInstance.driver.findElement(By.css("[data-testid='chat-list']"));
            botInstance.isLoggedIn = true;
            return res.json({ connected: true, status: 'connected' });
        } catch (e) {
            return res.json({ connected: false, status: 'waiting_login' });
        }
        
    } catch (error) {
        res.status(500).json({ connected: false, status: 'error', error: error.message });
    }
});


app.post('/api/bot/stop', async (req, res) => {
    try {
        if (!botInstance) {
            return res.json({ 
                status: 'not_started', 
                message: 'Bot não está inicializado'
            });
        }
        
        console.log('🛑 Parando bot...');
        await botInstance.stop();
        botInstance = null;
        
        res.json({ 
            status: 'stopped', 
            message: 'Bot parado com sucesso'
        });
        
    } catch (error) {
        console.error('Erro ao parar bot:', error);
        res.status(500).json({ 
            status: 'error', 
            message: error.message 
        });
    }
});

app.post('/api/bot/restart', async (req, res) => {
    try {
        console.log('🔄 Reiniciando bot...');
        
        // Verificar e registrar estado atual
        const initialState = {
            bot_exists: !!botInstance,
            is_logged_in: botInstance ? botInstance.isLoggedIn : false,
            qr_file_exists: fs.existsSync(path.join(__dirname, 'whatsapp_qr_debug.png'))
        };
        console.log('Estado atual:', initialState);
        
        // Parar bot atual se existir
        if (botInstance) {
            console.log('Parando instância atual do bot...');
            await botInstance.stop();
            botInstance = null;
        }
        
        // Limpar arquivos antigos
        console.log('Limpando arquivos temporários...');
        const filesToClean = [
            'whatsapp_qr_debug.png',
            'whatsapp_qr_debug_noqrcode.png',
            'whatsapp_page.html'
        ];
        
        filesToClean.forEach(file => {
            const filePath = path.join(__dirname, file);
            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
                console.log(`Arquivo removido: ${file}`);
            }
        });
        
        // Aguardar um pouco mais para garantir
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        // Inicializar novo bot com timeout maior
        console.log('Iniciando nova instância do bot...');
        const bot = await getBotInstance();
        
        if (bot) {
            res.json({ 
                status: 'restarted', 
                message: 'Bot reiniciado com sucesso',
                bot_status: bot.isLoggedIn ? 'connected' : 'initializing'
            });
        } else {
            res.status(500).json({ 
                status: 'error', 
                message: 'Falha ao reiniciar bot' 
            });
        }
        
    } catch (error) {
        console.error('Erro ao reiniciar bot:', error);
        res.status(500).json({ 
            status: 'error', 
            message: error.message 
        });
    }
});

app.get('/api/contacts', async (req, res) => {
    try {
        console.log('📞 Solicitação de contatos recebida...');
        
        // Verificar se o bot está disponível sem tentar inicializar
        if (!botInstance) {
            return res.status(503).json({ 
                error: 'Bot não inicializado. Acesse a página principal primeiro para inicializar o bot.' 
            });
        }
        
        if (!botInstance.isLoggedIn) {
            return res.status(401).json({ 
                error: 'Bot não está logado no WhatsApp Web. Escaneie o QR Code primeiro.' 
            });
        }
        
        console.log('🔍 Obtendo lista de contatos...');
        const contacts = await botInstance.getContacts();
        
        console.log(`✅ ${contacts.length} contatos obtidos com sucesso`);
        res.json({ contacts: contacts, count: contacts.length });
        
    } catch (error) {
        console.error('❌ Erro ao obter contatos:', error);
        res.status(500).json({ error: error.message });
    }
});

// Substituir o endpoint /api/qr existente por esta versão melhorada:

app.get('/api/qr', async (req, res) => {
    try {
        const ssPath = path.join(__dirname, 'whatsapp_qr_debug.png');
        
        // Se o bot não está inicializado, inicializar automaticamente
        if (!botInstance) {
            console.log('🤖 Bot não inicializado, iniciando automaticamente...');
            try {
                await getBotInstance();
                // Aguardar um pouco para o QR ser capturado
                await new Promise(resolve => setTimeout(resolve, 3000));
            } catch (error) {
                console.error('❌ Erro ao inicializar bot:', error);
                return res.status(503).json({ 
                    error: 'Falha ao inicializar bot',
                    message: error.message
                });
            }
        }
        
        // Verificar se já está conectado
        if (botInstance && botInstance.isLoggedIn) {
            return res.status(200).json({
                error: 'Já conectado',
                message: 'WhatsApp já está conectado',
                status: 'connected'
            });
        }
        
        // Tentar servir screenshot do disco
        if (fs.existsSync(ssPath)) {
            const stats = fs.statSync(ssPath);
            const ageSeconds = (Date.now() - stats.mtimeMs) / 1000;
            
            // Se o QR tem mais de 30 segundos, tentar renovar
            if (ageSeconds > 30) {
                console.log(`⚠️  QR Code antigo (${Math.round(ageSeconds)}s), tentando renovar...`);
                try {
                    const { By } = require('selenium-webdriver');
                    const refreshBtn = await botInstance.driver.findElement(By.css("[data-testid='refresh-large']"));
                    if (refreshBtn) {
                        await refreshBtn.click();
                        await new Promise(resolve => setTimeout(resolve, 3000));
                    }
                } catch (e) {
                    console.log('⚠️  Não foi possível renovar QR Code automaticamente');
                }
            }
            
            console.log(`📸 Servindo QR Code do disco (${stats.size} bytes, idade: ${Math.round(ageSeconds)}s)`);
            
            res.setHeader('Content-Type', 'image/png');
            res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
            res.setHeader('Pragma', 'no-cache');
            res.setHeader('Expires', '0');
            
            return res.sendFile(ssPath);
        }
        
        // Tentar obter da memória do bot
        if (botInstance && botInstance.getQRCodeData) {
            const qrData = botInstance.getQRCodeData();
            if (qrData) {
                console.log('📸 Servindo QR Code da memória');
                const buffer = Buffer.from(qrData, 'base64');
                
                res.setHeader('Content-Type', 'image/png');
                res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
                res.setHeader('Pragma', 'no-cache');
                res.setHeader('Expires', '0');
                
                return res.send(buffer);
            }
        }
        
        // QR Code não disponível
        console.log('⚠️  QR Code não disponível após tentativas');
        return res.status(404).json({ 
            error: 'QR Code não disponível',
            message: 'Aguarde alguns segundos e tente novamente',
            suggestion: 'O QR Code está sendo gerado'
        });
    } catch (error) {
        console.error('❌ Erro ao processar requisição de QR Code:', error);
        return res.status(500).json({
            error: 'Erro interno',
            message: error.message
        });
    }
});


app.post('/api/send', async (req, res) => {
    try {
        const { contacts, message } = req.body;
        
        // Validação mais robusta
        if (!contacts || !Array.isArray(contacts) || contacts.length === 0) {
            return res.status(400).json({ error: 'Pelo menos um contato é obrigatório' });
        }
        
        if (!message || typeof message !== 'string' || message.trim().length === 0) {
            return res.status(400).json({ error: 'Mensagem é obrigatória' });
        }
        
        // Criar job
        const jobId = uuidv4();
        await createJob(jobId, 'queued');
        
        // Iniciar envio em background
        backgroundSendMessages(jobId, contacts, message).catch(console.error);
        
        res.status(202).json({ job_id: jobId, status: 'queued' });
        
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

        // Load mappings
        db.all('SELECT * FROM zapi_mappings WHERE instance_id IN (' + rows.map(r => `'${r.id}'`).join(',') + ')', (mErr, maps) => {
            if (!mErr && maps) {
                const byInstance = {};
                maps.forEach(m => { byInstance[m.instance_id] = m; });
                instances.forEach(inst => {
                    if (byInstance[inst.id]) {
                        inst.provider = byInstance[inst.id].provider;
                        inst.zapi_instance_id = byInstance[inst.id].zapi_instance_id;
                        inst.zapi_token = byInstance[inst.id].zapi_token;
                    }
                });
            }

            res.json({ instances });
        });
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

            db.get('SELECT * FROM zapi_mappings WHERE instance_id = ? ORDER BY created_at DESC LIMIT 1', [row.id], (mErr, mapRow) => {
                if (!mErr && mapRow) {
                    instance.zapi_instance_id = mapRow.zapi_instance_id;
                    instance.zapi_token = mapRow.zapi_token;
                    instance.zapi_response = mapRow.zapi_response ? JSON.parse(mapRow.zapi_response) : null;
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

                // If provider is zapi, attempt to create a remote instance and save mapping
                if (provider && provider === 'zapi') {
                    try {
                        const zapiResp = await zapi.createInstance(name);
                        const zapiInstanceId = zapiResp && (zapiResp.instanceId || zapiResp.id || zapiResp.sessionId) ? (zapiResp.instanceId || zapiResp.id || zapiResp.sessionId) : null;
                        const zapiToken = zapiResp && zapiResp.token ? zapiResp.token : (process.env.ZAPI_TOKEN || null);

                        db.run(
                            'INSERT INTO zapi_mappings (instance_id, provider, zapi_instance_id, zapi_token, zapi_response, webhook_url, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
                            [instanceId, 'zapi', zapiInstanceId, zapiToken, JSON.stringify(zapiResp || {}), null, now],
                            function(mapErr) {
                                if (mapErr) console.error('Erro ao salvar mapping zapi:', mapErr);
                            }
                        );

                        res.status(201).json({
                            id: instanceId,
                            name: name,
                            contacts: contacts,
                            message: message,
                            provider: 'zapi',
                            zapi_instance_id: zapiInstanceId,
                            created_at: now,
                            updated_at: now
                        });
                    } catch (e) {
                        console.error('Erro ao criar instância zapi:', e);
                        // Respond but indicate provider creation failed
                        res.status(201).json({
                            id: instanceId,
                            name: name,
                            contacts: contacts,
                            message: message,
                            provider: 'zapi',
                            zapi_error: e.message,
                            created_at: now,
                            updated_at: now
                        });
                    } finally {
                        db.close();
                    }
                } else {
                    res.status(201).json({
                        id: instanceId,
                        name: name,
                        contacts: contacts,
                        message: message,
                        created_at: now,
                        updated_at: now
                    });
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
                if (botInstance) {
                    await botInstance.stop();
                }
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
        if (botInstance) {
            console.log('Parando instância do bot...');
            await botInstance.stop();
            console.log('Bot parado com sucesso');
        }
        
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
