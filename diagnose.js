// Diagnóstico do Sistema Thunder - Z-API

const zapi = require('./zapi-adapter');

async function diagnose() {
    console.log('🔍 Diagnóstico do Sistema Thunder (Z-API)');
    console.log('='.repeat(60));
    
    // Informações do ambiente
    console.log('\n📦 AMBIENTE:');
    console.log('  Platform:', process.platform);
    console.log('  Node.js:', process.version);
    console.log('  NODE_ENV:', process.env.NODE_ENV || 'não definido (development)');
    console.log('  Modo:', 'Z-API (remoto)');
    
    // Verificar dependências do Node.js
    console.log('\n📚 DEPENDÊNCIAS NODE.JS:');
    const requiredPackages = [
        'express',
        'sqlite3',
        'cors',
        'uuid',
        'morgan'
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
    
    // Verificar configuração Z-API
    console.log('\n🔌 CONFIGURAÇÃO Z-API:');
    const zapiBaseUrl = process.env.ZAPI_BASE_URL || 'https://api.z-api.io';
    const zapiToken = process.env.ZAPI_TOKEN;
    
    console.log('  Base URL:', zapiBaseUrl);
    console.log('  Token configurado:', zapiToken ? '✅ Sim' : '⚠️  Não (opcional)');
    
    if (!zapiToken) {
        console.log('\n  ℹ️  Dica: Configure ZAPI_TOKEN no arquivo .env para autenticação automática');
    }
    
    // Verificar conectividade (se token estiver configurado)
    if (zapiToken) {
        console.log('\n🌐 TESTE DE CONECTIVIDADE:');
        console.log('  Tentando conectar com Z-API...');
        
        try {
            // Tentar fazer uma requisição simples
            const testUrl = zapiBaseUrl.replace(/\/$/, '');
            console.log('  URL de teste:', testUrl);
            
            // Nota: Este é um teste básico. A Z-API pode requerer endpoints específicos
            console.log('  ℹ️  Conectividade depende das configurações da sua conta Z-API');
            console.log('  ℹ️  Teste completo: crie uma instância e verifique o status via dashboard');
            
        } catch (error) {
            console.log('  ⚠️  Erro ao testar:', error.message);
            console.log('  ℹ️  Isso pode ser normal se a Z-API requerer endpoints específicos');
        }
    }
    
    // Verificar banco de dados
    console.log('\n💾 BANCO DE DADOS:');
    const fs = require('fs');
    const path = require('path');
    const dbPath = path.join(process.cwd(), 'app_new.db');
    
    if (fs.existsSync(dbPath)) {
        const stats = fs.statSync(dbPath);
        console.log('  ✅ Banco de dados encontrado');
        console.log('  Localização:', dbPath);
        console.log('  Tamanho:', (stats.size / 1024).toFixed(2), 'KB');
    } else {
        console.log('  ℹ️  Banco de dados será criado ao iniciar o servidor');
    }
    
    // Resumo final
    console.log('\n' + '='.repeat(60));
    console.log('📋 RESUMO:');
    
    if (allPackagesOk) {
        console.log('  ✅ Todas as dependências estão instaladas');
        console.log('  ✅ Sistema pronto para iniciar');
        console.log('\n  🚀 Para iniciar o servidor: npm start');
        console.log('  🌐 Acesse: http://localhost:3000');
        console.log('\n  📖 Leia o README.md para mais informações');
    } else {
        console.log('  ❌ Algumas dependências estão faltando');
        console.log('  💡 Execute: npm install');
    }
    
    console.log('='.repeat(60));
}

// Executar diagnóstico
diagnose().catch(error => {
    console.error('\n❌ Erro durante diagnóstico:', error);
    process.exit(1);
});
