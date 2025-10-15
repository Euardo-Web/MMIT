# 🚀 Como Fazer Deploy no OnRender

## ⚠️ IMPORTANTE: Limitações do WhatsApp Web em Servidores

O WhatsApp Web **requer autenticação via QR Code** a cada nova sessão. Em servidores como OnRender (especialmente no plano gratuito que reinicia frequentemente), isso significa:

1. **Você precisará escanear o QR Code toda vez que o servidor reiniciar**
2. **Não há interface gráfica** - o bot roda em modo headless
3. **O QR Code não pode ser visualizado diretamente** - use o endpoint de debug

### 📸 Como Ver o QR Code no OnRender

Após o deploy, acesse:
```
https://seu-app.onrender.com/api/debug/qr
```

Este endpoint retorna uma imagem do QR Code que você deve escanear com seu WhatsApp.

---

## 🔧 Opções de Deploy

### Opção 1: Usando render.yaml (Recomendado)

1. **Faça commit do arquivo `render.yaml`**:
   ```bash
   git add render.yaml
   git commit -m "Adicionar configuração do OnRender"
   git push
   ```

2. **No painel do OnRender**:
   - Vá para [dashboard.render.com](https://dashboard.render.com)
   - Clique em "New +" → "Web Service"
   - Conecte seu repositório GitHub/GitLab
   - O OnRender detectará automaticamente o `render.yaml`
   - Clique em "Create Web Service"

### Opção 2: Usando Dockerfile

1. **Faça commit do Dockerfile**:
   ```bash
   git add Dockerfile
   git commit -m "Adicionar Dockerfile"
   git push
   ```

2. **No painel do OnRender**:
   - Vá para [dashboard.render.com](https://dashboard.render.com)
   - Clique em "New +" → "Web Service"
   - Conecte seu repositório
   - Em "Environment", selecione **"Docker"**
   - Clique em "Create Web Service"

### Opção 3: Build Script Manual

1. **Configurar no OnRender**:
   - Environment: **Node**
   - Build Command: `bash build.sh`
   - Start Command: `NODE_ENV=production node server.js`

---

## 🔍 Verificando o Deploy

### 1. Logs do Build
Após iniciar o deploy, verifique os logs para confirmar que:
- ✅ Chrome foi instalado com sucesso
- ✅ Dependências do Node.js foram instaladas
- ✅ Servidor iniciou na porta correta

### 2. Testar a API
```bash
# Health check
curl https://seu-app.onrender.com/api/health

# Ver o QR Code
curl https://seu-app.onrender.com/api/debug/qr --output qr.png
```

### 3. Logs do Servidor
Procure por estas mensagens nos logs:
```
🔧 Modo headless: ATIVADO
📦 Ambiente: production
🖥️ Display: nenhum (headless obrigatório)
✅ Driver criado com sucesso!
📸 Screenshot salvo em /app/whatsapp_qr_debug.png
```

---

## 🐛 Solução de Problemas Comuns

### Erro: "Chrome not found"

**Causa**: Chrome não foi instalado durante o build.

**Solução**:
1. Verifique os logs de build
2. Se usar `render.yaml`, certifique-se que os comandos `apt-get` foram executados
3. Se usar Dockerfile, reconstrua a imagem

### Erro: "start() retornou falso"

**Causa**: Falha ao inicializar o Chrome em modo headless.

**Possíveis soluções**:
1. **Verificar flags do Chrome**: O código já está otimizado, mas você pode adicionar mais flags se necessário
2. **Aumentar timeout**: Edite `server.js` linha 161 para aumentar o timeout
3. **Verificar memória**: OnRender free tier tem 512MB RAM - Chrome pode precisar de mais

### Erro: "session not created"

**Causa**: Incompatibilidade entre ChromeDriver e Chrome.

**Solução**:
O código usa `selenium-webdriver` que baixa o ChromeDriver automaticamente. Se ainda assim houver erro:
1. Atualize as dependências: `npm update selenium-webdriver`
2. Ou fixe uma versão específica no `package.json`

### QR Code não aparece

**Solução**:
1. Acesse `/api/debug/qr` para ver o screenshot
2. Aguarde pelo menos 30-45 segundos após o bot iniciar
3. Verifique os logs para mensagens do tipo "📱 QR Code detectado!"

---

## 📝 Variáveis de Ambiente

Configure no painel do OnRender:

| Variável | Valor | Descrição |
|----------|-------|-----------|
| `NODE_ENV` | `production` | Ativa modo headless automaticamente |
| `PORT` | Automático | OnRender define automaticamente |

---

## 💡 Dicas para Produção

### 1. Persistência de Sessão
⚠️ **OnRender free tier não tem disco persistente**. Cada restart = novo QR Code.

**Soluções**:
- Upgrade para plano pago com disco persistente
- Implementar autenticação via API (requer modificar o código)

### 2. Manter o Serviço Ativo
OnRender free tier "dorme" após 15 minutos de inatividade.

**Soluções**:
- Usar um serviço de ping (ex: UptimeRobot) para fazer requests a cada 10 minutos
- Upgrade para plano pago

### 3. Logs
Ative logs detalhados adicionando ao `.env`:
```
DEBUG=selenium-webdriver:*
```

---

## 🆘 Suporte

Se continuar com problemas:

1. **Verifique os logs** do OnRender em tempo real
2. **Teste localmente** com `NODE_ENV=production node server.js`
3. **Acesse o debug endpoint**: `/api/debug/qr`

---

## ⚡ Comandos Úteis

```bash
# Deploy manual (se conectado via CLI)
render deploy

# Ver logs em tempo real
render logs -f

# SSH no container (planos pagos)
render shell
```

---

## 🔗 Links Úteis

- [Documentação OnRender - Docker](https://render.com/docs/docker)
- [OnRender - Build Command](https://render.com/docs/build-command)
- [Selenium WebDriver Docs](https://www.selenium.dev/documentation/webdriver/)
