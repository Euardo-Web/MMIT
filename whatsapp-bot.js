const { Builder, By, Key, until } = require('selenium-webdriver');
const chrome = require('selenium-webdriver/chrome');
const { Options } = require('selenium-webdriver/chrome');
const path = require('path');
const fs = require('fs');

class WhatsAppBot {
    // Função estática para verificar processos
    static async checkProcesses() {
        const { execSync } = require('child_process');
        console.log('🔍 Verificando processos...');
        
        try {
            // No Windows, usar tasklist
            const processes = execSync('tasklist /FI "IMAGENAME eq chrome.exe" /FI "IMAGENAME eq chromedriver.exe"', { encoding: 'utf8' });
            console.log('Processos encontrados:\n', processes);
            
            return processes;
        } catch (e) {
            console.warn('⚠️ Erro ao verificar processos:', e.message);
            return null;
        }
    }

    constructor(headless = null, waitTimeout = 60000) {
        this.driver = null;
        this.waitTimeout = waitTimeout;
        this.qrDelayMs = 8000; // Aumentado para 8 segundos
        
        // Auto-detectar headless
        if (headless === null) {
            this.headless = !process.env.DISPLAY || process.env.NODE_ENV === 'production';
        } else {
            this.headless = headless;
        }
        
        this.isLoggedIn = false;
        this.qrCodeData = null; // Armazenar dados do QR
        console.log(`🔧 Modo headless: ${this.headless ? 'ATIVADO' : 'DESATIVADO'}`);
    }

    async start() {
        try {
            console.log('🔧 Iniciando WhatsApp Bot...');
            
            // Verificar processos antes de iniciar
            await WhatsAppBot.checkProcesses();
            console.log(`📦 Ambiente: ${process.env.NODE_ENV || 'development'}`);
            
            // Limpar screenshots antigos
            this.cleanupOldScreenshots();
            
            // Configurar Chrome
            const options = new Options();
            
            // Flags essenciais
            options.addArguments('--no-sandbox');
            options.addArguments('--disable-dev-shm-usage');
            options.addArguments('--disable-gpu');
            options.addArguments('--disable-software-rasterizer');
            options.addArguments('--disable-blink-features=AutomationControlled');
            options.addArguments('--disable-web-security');
            options.addArguments('--window-size=1920,1080'); // Tamanho maior para garantir QR visível
            // Minimizar logs/relatórios de crash
            options.addArguments('--disable-breakpad');
            options.addArguments('--enable-logging=stderr');
            options.addArguments('--v=0');
            // Reduzir subsistemas de rede que podem gerar mensagens Google APIs/GCM
            options.addArguments('--disable-features=NetworkService');
            options.addArguments('--disable-background-networking');
            options.addArguments('--disable-sync');
            options.addArguments('--disable-component-update');
            options.addArguments('--disable-client-side-phishing-detection');
            
            if (this.headless) {
                console.log('🖥️  Executando em modo headless');
                options.addArguments('--headless=new');
                options.addArguments('--disable-extensions');
                options.addArguments('--remote-debugging-port=9222');
            } else {
                options.addArguments('--start-maximized');
            }
            
            // User data dir para persistir sessão
            // Allow overriding via environment variable to avoid issues with paths
            // that contain spaces or non-ASCII characters (e.g. OneDrive "Área de Trabalho").
            const os = require('os');
            const envProfile = process.env.CHROME_USER_DATA_DIR || process.env.WABOT_CHROME_PROFILE;
            const safeDefault = path.join(process.env.LOCALAPPDATA || os.tmpdir(), 'whatsapp-bot-profile');
            const userDataDir = envProfile ? envProfile : safeDefault;

            try {
                if (!fs.existsSync(userDataDir)) {
                    fs.mkdirSync(userDataDir, { recursive: true });
                }
                options.addArguments(`user-data-dir=${userDataDir}`);
                console.log('👤 Usando perfil do Chrome em:', userDataDir);
                if (!envProfile) {
                    console.log('ℹ️  (Usando caminho seguro por padrão. To force a custom path set CHROME_USER_DATA_DIR)');
                }
            } catch (e) {
                console.warn('⚠️ Não foi possível configurar user-data-dir:', e.message);
            }
            
            // Criar driver
            console.log('🚀 Criando driver...');

            // Suporte opcional para configurar caminho do chromedriver e do binário do Chrome
            const chromedriverPath = process.env.CHROMEDRIVER_PATH;
            const chromeBinaryPath = process.env.CHROME_BINARY_PATH || process.env.CHROME_BIN;
            if (chromeBinaryPath) {
                try {
                    options.setChromeBinaryPath && options.setChromeBinaryPath(chromeBinaryPath);
                    // Some selenium versions use options.setBinaryPath
                    if (typeof options.setBinaryPath === 'function') {
                        options.setBinaryPath(chromeBinaryPath);
                    }
                    console.log('🔧 Usando binário do Chrome em:', chromeBinaryPath);
                } catch (e) {
                    console.warn('⚠️ Não foi possível setar chrome binary path:', e.message);
                }
            }

            let builder = new Builder().forBrowser('chrome').setChromeOptions(options);

            if (chromedriverPath) {
                try {
                    const serviceBuilder = new chrome.ServiceBuilder(chromedriverPath);
                    builder = builder.setChromeService(serviceBuilder);
                    console.log('🔧 Usando chromedriver em:', chromedriverPath);
                } catch (e) {
                    console.warn('⚠️ Falha ao configurar chromedriver customizado:', e.message);
                }
            }

            this.driver = await builder.build();
            
            console.log('✅ Driver criado!');
            
            // Remover detecção de webdriver
            await this.driver.executeScript(`
                Object.defineProperty(navigator, 'webdriver', {get: () => undefined});
                delete navigator.__webdriver_script_fn;
            `);
            
            // Abrir WhatsApp Web
            console.log('🌐 Abrindo WhatsApp Web...');
            await this.driver.get('https://web.whatsapp.com');
            
            // Aguardar página carregar completamente
            console.log('⏳ Aguardando página carregar...');
            await this.waitForPageLoad();
            
            // Verificar status e capturar QR
            await this.checkAndCaptureQR();
            
            return true;
            
        } catch (error) {
            console.error('❌ Erro ao iniciar bot:', error.message);
            console.error(error.stack);
            
            if (this.driver) {
                try {
                    await this.driver.quit();
                } catch (e) {
                    console.error('Erro ao fechar driver:', e.message);
                }
                this.driver = null;
            }
            return false;
        }
    }

    cleanupOldScreenshots() {
        const files = [
            'whatsapp_qr_debug.png',
            'whatsapp_qr_debug_noqrcode.png',
            'whatsapp_page.html'
        ];
        
        files.forEach(file => {
            try {
                const filePath = path.join(process.cwd(), file);
                if (fs.existsSync(filePath)) {
                    fs.unlinkSync(filePath);
                }
            } catch (e) {
                // Ignorar
            }
        });
    }

    async waitForPageLoad() {
        const maxWait = 30;
        for (let i = 0; i < maxWait; i++) {
            try {
                const ready = await this.driver.executeScript('return document.readyState');
                if (ready === 'complete') {
                    console.log('✅ Página carregada');
                    return true;
                }
            } catch (e) {
                // Continuar tentando
            }
            await this.driver.sleep(1000);
        }
        console.warn('⚠️  Página não carregou completamente');
        return false;
    }

    async checkAndCaptureQR() {
        try {
            console.log('🔍 Verificando status de login...');
            
            // Aguardar um pouco para elementos carregarem
            await this.driver.sleep(3000);
            
            // Verificar se já está logado
            if (await this.isAlreadyLoggedIn()) {
                this.isLoggedIn = true;
                console.log('✅ WhatsApp Web já está logado!');
                return true;
            }
            
            // Procurar QR Code com múltiplas tentativas
            console.log('📱 Procurando QR Code...');
            const qrFound = await this.findAndCaptureQR();
            
            if (qrFound) {
                console.log('✅ QR Code capturado com sucesso!');
                console.log('📸 Screenshot salvo em: whatsapp_qr_debug.png');
                console.log('🌐 Acesse a página de QR Code para escanear');
                console.log('');
                console.log('📲 INSTRUÇÕES PARA CONECTAR:');
                console.log('   1. Abra o WhatsApp no seu celular');
                console.log('   2. Toque em Menu (⋮) > Dispositivos conectados');
                console.log('   3. Toque em "Conectar um dispositivo"');
                console.log('   4. Escaneie o QR Code exibido');
                console.log('');
                
                // Não aguardar login de forma bloqueante - deixar a página fazer polling
                return true;
            } else {
                console.warn('⚠️  QR Code não encontrado após todas as tentativas');
                await this.saveDebugInfo();
                return false;
            }
            
        } catch (error) {
            console.error('❌ Erro ao verificar/capturar QR:', error.message);
            await this.saveDebugInfo();
            return false;
        }
    }

    async isAlreadyLoggedIn() {
        const selectors = [
            "[data-testid='chat-list']",
            "#side",
            "[data-testid='conversation-panel-wrapper']"
        ];
        
        for (const selector of selectors) {
            try {
                const element = await this.driver.findElement(By.css(selector));
                if (element) {
                    const isDisplayed = await element.isDisplayed().catch(() => false);
                    if (isDisplayed) {
                        return true;
                    }
                }
            } catch (e) {
                continue;
            }
        }
        
        return false;
    }

    async findAndCaptureQR() {
        // Múltiplas tentativas com delays progressivos
        const attempts = [
            { delay: 2000, name: 'Primeira tentativa' },
            { delay: 3000, name: 'Segunda tentativa' },
            { delay: 4000, name: 'Terceira tentativa' },
            { delay: 5000, name: 'Quarta tentativa' }
        ];
        
        for (const attempt of attempts) {
            console.log(`🔄 ${attempt.name} (aguardando ${attempt.delay}ms)...`);
            await this.driver.sleep(attempt.delay);
            
            // Verificar se já logou durante a espera
            if (await this.isAlreadyLoggedIn()) {
                this.isLoggedIn = true;
                console.log('✅ Usuário já conectou durante a espera!');
                return true;
            }
            
            // Tentar clicar no botão de recarregar QR se existir
            await this.clickRefreshQR();
            
            // Aguardar um pouco após clicar
            await this.driver.sleep(2000);
            
            // Procurar QR pelos seletores
            const qrSelectors = [
                "canvas[aria-label*='Scan']",
                "canvas[aria-label*='scan']",
                "canvas[aria-label*='QR']",
                "[data-ref]",
                "[data-testid='qrcode']",
                "canvas",
                ".qr-wrapper canvas",
                "[role='img'] canvas"
            ];
            
            for (const selector of qrSelectors) {
                try {
                    const qrElement = await this.driver.findElement(By.css(selector));
                    if (qrElement) {
                        // Verificar se o elemento está visível
                        const isDisplayed = await qrElement.isDisplayed().catch(() => false);
                        if (!isDisplayed) {
                            continue;
                        }
                        
                        console.log(`✅ QR encontrado com seletor: ${selector}`);
                        
                        // Garantir que QR esteja renderizado
                        await this.driver.sleep(1500);
                        
                        // Tirar screenshot
                        const screenshot = await this.driver.takeScreenshot();
                        const screenshotPath = path.join(process.cwd(), 'whatsapp_qr_debug.png');
                        fs.writeFileSync(screenshotPath, screenshot, 'base64');
                        
                        // Verificar se arquivo foi criado
                        if (fs.existsSync(screenshotPath)) {
                            const stats = fs.statSync(screenshotPath);
                            console.log(`📸 Screenshot salvo: ${screenshotPath} (${stats.size} bytes)`);
                            this.qrCodeData = screenshot;
                            return true;
                        }
                    }
                } catch (e) {
                    // Continuar tentando outros seletores
                    continue;
                }
            }
        }
        
        console.error('❌ Não foi possível encontrar o QR Code após todas as tentativas');
        return false;
    }

    async clickRefreshQR() {
        const refreshSelectors = [
            "[data-testid='refresh-large']",
            "[aria-label*='Refresh']",
            "button[aria-label*='QR']"
        ];
        
        for (const selector of refreshSelectors) {
            try {
                const button = await this.driver.findElement(By.css(selector));
                if (button) {
                    await button.click();
                    console.log('🔄 Botão de recarregar QR clicado');
                    return true;
                }
            } catch (e) {
                continue;
            }
        }
        return false;
    }

    async waitForLogin() {
        console.log('⏳ Aguardando login...');
        const maxWait = Math.ceil(this.waitTimeout / 1000);
        
        for (let i = 0; i < maxWait; i++) {
            await this.driver.sleep(1000);
            
            if (i % 10 === 0 && i > 0) {
                console.log(`   Aguardando... ${i}/${maxWait}s`);
            }
            
            if (await this.isAlreadyLoggedIn()) {
                this.isLoggedIn = true;
                console.log('🎉 Login realizado com sucesso!');
                return true;
            }
        }
        
        console.warn('⏰ Timeout ao aguardar login');
        return false;
    }

    async saveDebugInfo() {
        try {
            // Salvar screenshot
            const screenshot = await this.driver.takeScreenshot();
            fs.writeFileSync('whatsapp_qr_debug_noqrcode.png', screenshot, 'base64');
            
            // Salvar HTML da página
            const html = await this.driver.getPageSource();
            fs.writeFileSync('whatsapp_page.html', html);
            
            console.log('🔍 Informações de debug salvas:');
            console.log('   - whatsapp_qr_debug_noqrcode.png');
            console.log('   - whatsapp_page.html');
        } catch (e) {
            console.error('Erro ao salvar debug:', e.message);
        }
    }

    async getContacts() {
        if (!this.isLoggedIn) {
            throw new Error('Bot não está logado');
        }
        
        try {
            // Aguardar lista de chats
            await this.driver.wait(
                until.elementLocated(By.css("[data-testid='chat-list']")),
                10000
            );
            
            // Scroll para carregar mais contatos
            await this.driver.executeScript(`
                const chatList = document.querySelector('[data-testid="chat-list"]');
                if (chatList) {
                    chatList.scrollTop = chatList.scrollHeight;
                }
            `);
            
            await this.driver.sleep(2000);
            
            // Extrair nomes
            const script = `
                const contacts = new Set();
                const chatItems = document.querySelectorAll('[data-testid="chat-list"] [role="listitem"]');
                
                chatItems.forEach(item => {
                    const nameElement = item.querySelector('span[title]');
                    if (nameElement) {
                        const name = nameElement.getAttribute('title');
                        if (name && name.trim()) {
                            contacts.add(name.trim());
                        }
                    }
                });
                
                return Array.from(contacts);
            `;
            
            const contacts = await this.driver.executeScript(script);
            console.log(`📞 ${contacts.length} contatos encontrados`);
            return contacts;
            
        } catch (error) {
            console.error('Erro ao obter contatos:', error.message);
            throw error;
        }
    }

    async sendMessage(contactName, message) {
        if (!this.isLoggedIn) {
            throw new Error('Bot não está logado');
        }
        
        try {
            console.log(`📤 Enviando para: ${contactName}`);
            
            // Procurar e clicar no contato
            const clickScript = `
                const targetName = "${contactName.replace(/"/g, '\\"')}";
                const chatItems = document.querySelectorAll('[data-testid="chat-list"] [role="listitem"]');
                
                for (let item of chatItems) {
                    const nameElement = item.querySelector('span[title]');
                    if (nameElement) {
                        const name = nameElement.getAttribute('title');
                        if (name && name.trim() === targetName) {
                            item.click();
                            return true;
                        }
                    }
                }
                return false;
            `;
            
            const clicked = await this.driver.executeScript(clickScript);
            if (!clicked) {
                throw new Error(`Contato '${contactName}' não encontrado`);
            }
            
            // Aguardar chat abrir
            await this.driver.sleep(2000);
            
            // Encontrar campo de mensagem
            const messageBox = await this.driver.wait(
                until.elementLocated(By.css("[data-testid='conversation-compose-box-input']")),
                10000
            );
            
            // Digitar e enviar
            await messageBox.click();
            await messageBox.sendKeys(message);
            await this.driver.sleep(500);
            await messageBox.sendKeys(Key.ENTER);
            
            console.log(`✅ Mensagem enviada para ${contactName}`);
            
            // Rate limiting: aguardar entre mensagens
            await this.driver.sleep(3000);
            
            return true;
            
        } catch (error) {
            console.error(`❌ Erro ao enviar para ${contactName}:`, error.message);
            return false;
        }
    }

    async sendMessages(contacts, message) {
        const results = { sent: [], failed: [] };
        
        for (const contact of contacts) {
            try {
                if (await this.sendMessage(contact, message)) {
                    results.sent.push(contact);
                } else {
                    results.failed.push({ contact, error: 'Falha ao enviar' });
                }
            } catch (error) {
                results.failed.push({ contact, error: error.message });
            }
        }
        
        return results;
    }

    getQRCodeData() {
        return this.qrCodeData;
    }

    async stop() {
        if (this.driver) {
            try {
                console.log('🛑 Iniciando parada do bot...');
                
                // Tentar fechar driver normalmente
                await this.driver.quit().catch(e => 
                    console.warn('Aviso ao fechar driver:', e.message)
                );
                
                // Verificar e limpar processos residuais
                const { execSync } = require('child_process');
                console.log('🧹 Verificando processos residuais...');
                
                try {
                    // No Windows, tentar matar processos chrome/chromedriver
                    execSync('taskkill /F /IM chromedriver.exe /T 2>nul', { stdio: 'ignore' });
                    execSync('taskkill /F /IM chrome.exe /T 2>nul', { stdio: 'ignore' });
                    console.log('✅ Processos residuais limpos');
                } catch (e) {
                    // Ignorar erros se processos não existirem
                }
                
                console.log('🛑 Bot parado com sucesso');
            } catch (error) {
                console.error('Erro ao parar bot:', error.message);
            } finally {
                this.driver = null;
                this.isLoggedIn = false;
                this.qrCodeData = null;
            }
        }
    }
}

module.exports = WhatsAppBot;

// Teste simples se executado diretamente
if (require.main === module) {
    const bot = new WhatsAppBot();
    
    async function test() {
        try {
            if (await bot.start()) {
                const contacts = await bot.getContacts();
                console.log(`Contatos encontrados: ${contacts.length}`);
                for (let i = 0; i < Math.min(5, contacts.length); i++) {
                    console.log(`  ${i+1}. ${contacts[i]}`);
                }
                
                if (contacts.length > 0) {
                    // Teste de envio
                    const success = await bot.sendMessage(contacts[0], 'Teste do novo bot');
                    console.log(`Envio: ${success ? 'Sucesso' : 'Falha'}`);
                }
            }
        } finally {
            await bot.stop();
        }
    }
    
    test().catch(console.error);
}
