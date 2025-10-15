const { Builder } = require('selenium-webdriver');
const chrome = require('selenium-webdriver/chrome');
const { Options } = require('selenium-webdriver/chrome');
const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');

async function diagnose() {
    console.log('🔍 Diagnóstico do WhatsApp Bot');
    console.log('='.repeat(60));
    
    // Informações do ambiente
    console.log('\n📦 AMBIENTE:');
    console.log('  Platform:', process.platform);
    console.log('  Node.js:', process.version);
    console.log('  NODE_ENV:', process.env.NODE_ENV || 'não definido (development)');
    console.log('  DISPLAY:', process.env.DISPLAY || 'nenhum (modo headless obrigatório)');
    console.log('  OnRender?:', process.env.RENDER ? 'Sim' : 'Não');
    
    // 1. Verificar dependências do Node.js
    console.log('\n📚 DEPENDÊNCIAS NODE.JS:');
    const requiredPackages = [
        'selenium-webdriver',
        'express',
        'sqlite3',
        'cors',
        'uuid'
    ];
    
    let allPackagesOk = true;
    for (const pkg of requiredPackages) {
        try {
            require(pkg);
            console.log(`  ✅ ${pkg}: OK`);
        } catch (e) {
            console.log(`  ❌ ${pkg}: FALTANDO`);
            allPackagesOk = false;
        }
    }
    
    if (!allPackagesOk) {
        console.log('\n  💡 Execute: npm install');
        return;
    }
    
    // 2. Verificar Chrome
    console.log('\n🌐 GOOGLE CHROME:');
    let chromeFound = false;
    
    if (process.platform === 'win32') {
        // Windows
        const chromePaths = [
            'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
            'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
            process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, 'Google\\Chrome\\Application\\chrome.exe') : null
        ].filter(Boolean);
        
        for (const chromePath of chromePaths) {
            if (fs.existsSync(chromePath)) {
                console.log('  ✅ Chrome encontrado:', chromePath);
                chromeFound = true;
                break;
            }
        }
    } else {
        // Linux/Mac
        const chromeCommands = [
            'google-chrome --version',
            'google-chrome-stable --version',
            'chromium --version',
            'chromium-browser --version'
        ];
        
        for (const cmd of chromeCommands) {
            try {
                const version = execSync(cmd, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] }).trim();
                console.log(`  ✅ Chrome encontrado: ${version}`);
                chromeFound = true;
                break;
            } catch (error) {
                // Continuar tentando
            }
        }
    }
    
    if (!chromeFound) {
        console.log('  ❌ Chrome não encontrado');
        console.log('  💡 SOLUÇÃO:');
        if (process.platform === 'win32') {
            console.log('     Windows: https://www.google.com/chrome/');
        } else if (process.platform === 'linux') {
            console.log('     Linux: sudo apt-get install google-chrome-stable');
            console.log('     OnRender: Use render.yaml ou Dockerfile');
        } else {
            console.log('     Mac: brew install --cask google-chrome');
        }
        return;
    }
    
    // 3. Verificar ChromeDriver
    console.log('\n🚗 CHROMEDRIVER:');
    const chromedriverPath = path.join(__dirname, 'chromedriver.exe');
    if (fs.existsSync(chromedriverPath)) {
        console.log('  ✅ ChromeDriver local encontrado');
    } else {
        console.log('  ℹ️  ChromeDriver local não encontrado');
        console.log('     selenium-webdriver fará download automático');
    }
    
    // 4. Verificar arquivos do projeto
    console.log('\n📁 ARQUIVOS DO PROJETO:');
    const files = {
        'server.js': 'Servidor principal',
        'whatsapp-bot.js': 'Classe do bot',
        'package.json': 'Dependências',
        'chrome-profile': 'Perfil do Chrome (criado automaticamente)',
        'app_new.db': 'Banco de dados (criado automaticamente)'
    };
    
    for (const [file, desc] of Object.entries(files)) {
        const filePath = path.join(__dirname, file);
        if (fs.existsSync(filePath)) {
            console.log(`  ✅ ${file}: ${desc}`);
        } else {
            console.log(`  ℹ️  ${file}: ${desc} (não existe ainda)`);
        }
    }
    
    // 5. Testar criação do driver
    console.log('\n🧪 TESTE DE CRIAÇÃO DO DRIVER:');
    let driver = null;
    try {
        const options = new Options();
        
        // Flags essenciais
        options.addArguments('--no-sandbox');
        options.addArguments('--disable-dev-shm-usage');
        options.addArguments('--disable-gpu');
        options.addArguments('--disable-software-rasterizer');
        
        // Headless se não houver DISPLAY
        const useHeadless = !process.env.DISPLAY || process.env.NODE_ENV === 'production';
        if (useHeadless) {
            console.log('  🖥️  Usando modo headless (sem interface gráfica)');
            options.addArguments('--headless=new');
        }
        
        options.addArguments('--window-size=1280,720');
        options.addArguments('--disable-blink-features=AutomationControlled');
        options.excludeSwitches('enable-automation');
        
        console.log('  🔧 Criando driver do Chrome...');
        driver = await new Builder()
            .forBrowser('chrome')
            .setChromeOptions(options)
            .build();
        console.log('  ✅ Driver criado com sucesso!');
        
        // 6. Testar navegação
        console.log('\n🌐 TESTE DE NAVEGAÇÃO:');
        await driver.get('https://www.google.com');
        const title = await driver.getTitle();
        console.log('  ✅ Navegação funcionando!');
        console.log('  📄 Título da página:', title);
        
        // 7. Testar screenshot (importante para o QR Code)
        console.log('\n📸 TESTE DE SCREENSHOT:');
        const testScreenshotPath = path.join(__dirname, 'test_screenshot.png');
        const screenshot = await driver.takeScreenshot();
        fs.writeFileSync(testScreenshotPath, screenshot, 'base64');
        console.log('  ✅ Screenshot salvo em:', testScreenshotPath);
        
        // Limpar screenshot de teste
        setTimeout(() => {
            try {
                fs.unlinkSync(testScreenshotPath);
            } catch (e) {}
        }, 5000);
        
    } catch (error) {
        console.log('  ❌ Erro ao criar driver:', error.message);
        console.log('\n  💡 POSSÍVEIS SOLUÇÕES:');
        console.log('     - Verifique se o Chrome está instalado corretamente');
        console.log('     - Feche todas as janelas do Chrome');
        if (process.platform === 'win32') {
            console.log('     - Execute como administrador');
            console.log('     - Desative temporariamente o antivírus');
        }
        if (process.platform === 'linux') {
            console.log('     - Instale dependências: sudo apt-get install -y libgbm1 libnss3');
        }
        return;
    } finally {
        if (driver) {
            try {
                await driver.quit();
                console.log('  ✅ Driver fechado com sucesso');
            } catch (e) {
                console.log('  ⚠️  Erro ao fechar driver:', e.message);
            }
        }
    }
    
    // 8. Verificar processos Chrome
    if (process.platform === 'win32') {
        console.log('\n🔍 PROCESSOS CHROME (Windows):');
        try {
            const { exec } = require('child_process');
            exec('tasklist /FI "IMAGENAME eq chrome.exe"', (error, stdout) => {
                if (stdout && stdout.includes('chrome.exe')) {
                    console.log('  ⚠️  Há processos Chrome rodando');
                } else {
                    console.log('  ✅ Nenhum processo Chrome rodando');
                }
            });
        } catch (e) {
            // Ignorar erro
        }
    }
    
    // Resumo final
    console.log('\n' + '='.repeat(60));
    console.log('\n✅ DIAGNÓSTICO COMPLETO!');
    console.log('\n📝 PRÓXIMOS PASSOS:');
    console.log('  1. Execute: npm start');
    console.log('  2. Acesse: http://localhost:3000');
    console.log('  3. Escaneie o QR Code do WhatsApp');
    
    if (process.env.RENDER || process.env.NODE_ENV === 'production') {
        console.log('\n🌐 MODO PRODUÇÃO (OnRender):');
        console.log('  - QR Code disponível em: /api/debug/qr');
        console.log('  - Leia: DEPLOY_ONRENDER.md');
    }
    
    console.log('\n');
}

diagnose().catch(error => {
    console.error('\n❌ Erro durante diagnóstico:', error);
    console.error('\n💡 Se o erro persistir, verifique:');
    console.error('   - Dependências instaladas: npm install');
    console.error('   - Chrome instalado e atualizado');
    console.error('   - Permissões de execução');
    process.exit(1);
});
