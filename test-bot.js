const WhatsAppBot = require('./whatsapp-bot');
const fs = require('fs');
const path = require('path');

async function testBot() {
    console.log('╔══════════════════════════════════════════════════╗');
    console.log('║   WhatsApp Bot - Teste Completo de Diagnóstico  ║');
    console.log('╚══════════════════════════════════════════════════╝');
    console.log('');
    
    const bot = new WhatsAppBot(false, 90000); // headless=false para debug
    let testResults = {
        driverCreated: false,
        pageLoaded: false,
        qrFound: false,
        qrScreenshot: false,
        loginDetected: false,
        contactsLoaded: false
    };
    
    try {
        // Teste 1: Criar driver
        console.log('📝 TESTE 1: Criação do Driver');
        console.log('─────────────────────────────────────────────────');
        const started = await bot.start();
        
        if (!started) {
            console.log('❌ FALHOU: Driver não foi criado');
            console.log('');
            console.log('🔧 Possíveis causas:');
            console.log('   • Google Chrome não instalado');
            console.log('   • ChromeDriver incompatível');
            console.log('   • Porta já em uso');
            console.log('   • Permissões insuficientes');
            console.log('');
            console.log('💡 Solução:');
            console.log('   1. Verifique se Chrome está instalado: google-chrome --version');
            console.log('   2. Reinstale dependências: npm install');
            console.log('   3. Execute como administrador');
            return;
        }
        
        testResults.driverCreated = true;
        console.log('✅ PASSOU: Driver criado com sucesso');
        console.log('');
        
        // Teste 2: Página carregada
        console.log('📝 TESTE 2: Carregamento da Página');
        console.log('─────────────────────────────────────────────────');
        
        if (bot.driver) {
            try {
                const url = await bot.driver.getCurrentUrl();
                const title = await bot.driver.getTitle();
                
                console.log(`✅ URL: ${url}`);
                console.log(`✅ Título: ${title}`);
                testResults.pageLoaded = true;
                console.log('✅ PASSOU: Página carregada');
            } catch (e) {
                console.log('❌ FALHOU: Erro ao acessar página');
                console.log(`   Erro: ${e.message}`);
            }
        }
        console.log('');
        
        // Teste 3: QR Code
        console.log('📝 TESTE 3: Detecção de QR Code');
        console.log('─────────────────────────────────────────────────');
        
        await new Promise(resolve => setTimeout(resolve, 8000)); // Aguardar QR carregar
        
        // Verificar múltiplos seletores
        const qrSelectors = [
            { selector: "canvas[aria-label*='Scan']", name: "Canvas com Scan" },
            { selector: "canvas[aria-label*='scan']", name: "Canvas com scan (minúsculo)" },
            { selector: "[data-ref]", name: "data-ref" },
            { selector: "canvas", name: "Qualquer canvas" },
            { selector: ".qr-wrapper canvas", name: "Canvas em qr-wrapper" }
        ];
        
        for (const { selector, name } of qrSelectors) {
            try {
                const { By } = require('selenium-webdriver');
                const element = await bot.driver.findElement(By.css(selector));
                if (element) {
                    console.log(`✅ QR Code encontrado: ${name} (${selector})`);
                    testResults.qrFound = true;
                    break;
                }
            } catch (e) {
                console.log(`   ⚠️  Não encontrado: ${name}`);
            }
        }
        
        if (!testResults.qrFound) {
            console.log('❌ FALHOU: QR Code não encontrado em nenhum seletor');
            console.log('');
            console.log('🔧 Diagnóstico adicional:');
            
            // Salvar HTML para análise
            try {
                const html = await bot.driver.getPageSource();
                const htmlPath = path.join(process.cwd(), 'whatsapp_debug.html');
                fs.writeFileSync(htmlPath, html);
                console.log(`   📄 HTML salvo em: ${htmlPath}`);
                console.log('   👉 Abra este arquivo e procure por "canvas" ou "qr"');
            } catch (e) {
                console.log(`   ❌ Erro ao salvar HTML: ${e.message}`);
            }
        }
        console.log('');
        
        // Teste 4: Screenshot
        console.log('📝 TESTE 4: Captura de Screenshot');
        console.log('─────────────────────────────────────────────────');
        
        try {
            const screenshot = await bot.driver.takeScreenshot();
            const screenshotPath = path.join(process.cwd(), 'test_screenshot.png');
            fs.writeFileSync(screenshotPath, screenshot, 'base64');
            
            if (fs.existsSync(screenshotPath)) {
                const stats = fs.statSync(screenshotPath);
                console.log(`✅ Screenshot salvo: ${screenshotPath}`);
                console.log(`   Tamanho: ${(stats.size / 1024).toFixed(2)} KB`);
                testResults.qrScreenshot = true;
                
                if (testResults.qrFound) {
                    console.log('   👉 Abra este arquivo para ver o QR Code!');
                }
            }
        } catch (e) {
            console.log(`❌ FALHOU: Erro ao capturar screenshot`);
            console.log(`   Erro: ${e.message}`);
        }
        console.log('');
        
        // Teste 5: Verificar se já está logado
        console.log('📝 TESTE 5: Status de Login');
        console.log('─────────────────────────────────────────────────');
        
        const loginSelectors = [
            { selector: "[data-testid='chat-list']", name: "Lista de chats" },
            { selector: "#side", name: "Barra lateral" },
            { selector: "[data-testid='conversation-panel-wrapper']", name: "Painel de conversa" }
        ];
        
        for (const { selector, name } of loginSelectors) {
            try {
                const { By } = require('selenium-webdriver');
                const element = await bot.driver.findElement(By.css(selector));
                if (element) {
                    console.log(`✅ Login detectado: ${name} encontrado`);
                    testResults.loginDetected = true;
                    bot.isLoggedIn = true;
                    break;
                }
            } catch (e) {
                console.log(`   ⚠️  Não logado: ${name} não encontrado`);
            }
        }
        
        if (!testResults.loginDetected && testResults.qrFound) {
            console.log('⏳ Aguardando você escanear o QR Code...');
            console.log('   Tempo de espera: 60 segundos');
            console.log('');
            
            // Aguardar login por 60 segundos
            for (let i = 0; i < 60; i++) {
                await new Promise(resolve => setTimeout(resolve, 1000));
                
                if (i % 10 === 0 && i > 0) {
                    console.log(`   ⏳ ${i}/60 segundos...`);
                }
                
                // Verificar se logou
                try {
                    const { By } = require('selenium-webdriver');
                    await bot.driver.findElement(By.css("[data-testid='chat-list']"));
                    console.log('✅ Login detectado após scan!');
                    testResults.loginDetected = true;
                    bot.isLoggedIn = true;
                    break;
                } catch (e) {
                    continue;
                }
            }
        }
        console.log('');
        
        // Teste 6: Carregar contatos (só se logado)
        if (testResults.loginDetected) {
            console.log('📝 TESTE 6: Carregamento de Contatos');
            console.log('─────────────────────────────────────────────────');
            
            try {
                const contacts = await bot.getContacts();
                testResults.contactsLoaded = true;
                
                console.log(`✅ PASSOU: ${contacts.length} contatos encontrados`);
                
                if (contacts.length > 0) {
                    console.log('');
                    console.log('📋 Primeiros 10 contatos:');
                    contacts.slice(0, 10).forEach((contact, index) => {
                        console.log(`   ${(index + 1).toString().padStart(2)}. ${contact}`);
                    });
                }
            } catch (e) {
                console.log('❌ FALHOU: Erro ao carregar contatos');
                console.log(`   Erro: ${e.message}`);
            }
        } else {
            console.log('⏭️  TESTE 6: Pulado (não está logado)');
        }
        console.log('');
        
    } catch (error) {
        console.log('');
        console.log('❌ ERRO CRÍTICO DURANTE OS TESTES');
        console.log('─────────────────────────────────────────────────');
        console.log(`Erro: ${error.message}`);
        console.log('');
        console.log('Stack trace:');
        console.log(error.stack);
    } finally {
        // Resumo
        console.log('');
        console.log('╔══════════════════════════════════════════════════╗');
        console.log('║              RESUMO DOS TESTES                   ║');
        console.log('╚══════════════════════════════════════════════════╝');
        console.log('');
        
        const tests = [
            { name: 'Driver criado', result: testResults.driverCreated },
            { name: 'Página carregada', result: testResults.pageLoaded },
            { name: 'QR Code encontrado', result: testResults.qrFound },
            { name: 'Screenshot capturado', result: testResults.qrScreenshot },
            { name: 'Login detectado', result: testResults.loginDetected },
            { name: 'Contatos carregados', result: testResults.contactsLoaded }
        ];
        
        tests.forEach(test => {
            const icon = test.result ? '✅' : '❌';
            console.log(`${icon} ${test.name}`);
        });
        
        const passedTests = tests.filter(t => t.result).length;
        const totalTests = tests.length;
        const percentage = ((passedTests / totalTests) * 100).toFixed(0);
        
        console.log('');
        console.log(`📊 Resultado: ${passedTests}/${totalTests} testes passaram (${percentage}%)`);
        console.log('');
        
        if (percentage < 50) {
            console.log('🚨 STATUS: CRÍTICO - Problemas sérios detectados');
            console.log('   👉 Verifique o TROUBLESHOOTING.md para soluções');
        } else if (percentage < 80) {
            console.log('⚠️  STATUS: PARCIAL - Alguns problemas detectados');
            console.log('   👉 Revise os testes que falharam');
        } else {
            console.log('✅ STATUS: BOM - Bot funcionando corretamente!');
        }
        console.log('');
        
        // Aguardar um pouco antes de fechar para dar tempo de ver os resultados
        console.log('⏳ Fechando bot em 5 segundos...');
        console.log('   (Pressione Ctrl+C para manter aberto)');
        await new Promise(resolve => setTimeout(resolve, 5000));
        
        console.log('🛑 Parando bot...');
        await bot.stop();
        console.log('✅ Bot parado com sucesso');
        console.log('');
    }
}

// Executar teste
testBot().catch(error => {
    console.error('❌ Erro fatal:', error);
    process.exit(1);
});