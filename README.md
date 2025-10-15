# Thunder - Sistema de Automação WhatsApp

Sistema moderno de automação para WhatsApp integrado com APIs externas (Z-API e similares).

## 🚀 Características

- ✅ Interface web moderna e responsiva
- ✅ Integração completa com APIs de WhatsApp (Z-API)
- ✅ Gerenciamento de múltiplas instâncias
- ✅ Sistema de jobs assíncronos para envio de mensagens
- ✅ QR Code automático via API
- ✅ Dashboard completo com estatísticas
- ✅ API REST completa

## 📋 Pré-requisitos

- Node.js 16+
- Conta em uma API de WhatsApp (Z-API recomendada)
- Variáveis de ambiente configuradas

## ⚙️ Instalação

1. Clone o repositório:
```bash
git clone <repo-url>
cd thunder-whatsapp
```

2. Instale as dependências:
```bash
npm install
```

3. Configure as variáveis de ambiente:
```bash
# .env ou variáveis do sistema
ZAPI_BASE_URL=https://api.z-api.io
ZAPI_TOKEN=seu_token_aqui
PORT=3000
```

4. Inicie o servidor:
```bash
npm start
```

5. Acesse: http://localhost:3000

## 🎯 Como Usar

### 1. Criar Instância
- Acesse "Instâncias" no menu
- Clique em "Nova Instância"
- Preencha nome e contatos
- Selecione "Z-API" como provedor

### 2. Conectar WhatsApp
- Acesse "QR Code" no menu
- Escaneie o QR Code com seu WhatsApp
- Aguarde a confirmação de conexão

### 3. Enviar Mensagens
- Acesse "Grupos" no menu
- Digite os contatos (um por linha)
- Digite sua mensagem
- Clique em "Enviar"

## 🔌 API Endpoints

### Instâncias
```
GET    /api/instances                    # Listar instâncias
POST   /api/instances                    # Criar instância
GET    /api/instances/:id                # Obter instância
PUT    /api/instances/:id                # Atualizar instância
DELETE /api/instances/:id                # Deletar instância
```

### Controle de Instâncias
```
POST   /api/instance/:id/start           # Inicializar instância
POST   /api/instance/:id/stop            # Parar instância
GET    /api/instance/:id/status          # Status da instância
```

### QR Code
```
GET    /api/qr                           # QR da primeira instância
GET    /api/qr/:instanceId               # QR de instância específica
```

### Mensagens
```
POST   /api/send                         # Enviar via primeira instância
POST   /api/instance/:id/send            # Enviar via instância específica
GET    /api/job/:jobId                   # Status do job de envio
```

### Contatos
```
GET    /api/instance/:id/contacts        # Listar contatos (limitado por APIs)
```

### Sistema
```
GET    /api/health                       # Health check
GET    /api/debug                        # Informações de debug
POST   /api/zapi/webhook                 # Webhook para eventos da API
```

## 📁 Estrutura do Projeto

```
├── server.js              # Servidor principal
├── zapi-adapter.js        # Adaptador para Z-API
├── dashboard.html         # Dashboard principal
├── grupos.html           # Página de envio de mensagens
├── instancias.html       # Gerenciamento de instâncias
├── qrcode.html           # Página do QR Code
├── script.js             # JavaScript do frontend
├── style.css             # Estilos CSS
├── nav-component.js      # Componente de navegação
└── package.json          # Dependências
```

## 🔧 Configuração da Z-API

1. Crie uma conta na [Z-API](https://z-api.io)
2. Obtenha sua URL base e token
3. Configure as variáveis de ambiente:

```bash
ZAPI_BASE_URL=https://api.z-api.io
ZAPI_TOKEN=seu_token_da_zapi
```

4. Configure webhook (opcional):
```bash
# URL do seu servidor para receber eventos
WEBHOOK_URL=https://seu-servidor.com/api/zapi/webhook
```

## 🚨 Troubleshooting

### API não responde
- Verifique se `ZAPI_BASE_URL` e `ZAPI_TOKEN` estão corretos
- Teste a conectividade: `curl -H "Authorization: Bearer $ZAPI_TOKEN" $ZAPI_BASE_URL`

### QR Code não aparece
- Verifique se a instância foi criada corretamente
- Confirme se a API suporta geração de QR Code
- Aguarde alguns segundos e recarregue

### Mensagens não são enviadas
- Verifique se a instância está conectada
- Confirme se os números estão no formato correto
- Verifique os logs para erros específicos

### Instância não conecta
- Escaneie o QR Code novamente
- Verifique se o WhatsApp está funcionando
- Confirme se a API está respondendo

## 🔄 Migração de Selenium

Se você estava usando a versão anterior com Selenium, esta nova versão:

- ❌ Remove dependência do Chrome/Selenium
- ❌ Remove complexidade de drivers e navegadores
- ✅ Usa APIs estáveis e confiáveis
- ✅ Melhor performance e estabilidade
- ✅ Suporte nativo a múltiplas instâncias
- ✅ Menor uso de recursos do servidor

## 📊 Monitoramento

- **Dashboard**: Visão geral do sistema
- **Logs**: Via interface web ou API `/api/debug`
- **Health Check**: Endpoint `/api/health`
- **Status das Instâncias**: Monitoramento em tempo real

## 🤝 Contribuição

1. Fork o projeto
2. Crie uma branch para sua feature
3. Commit suas mudanças
4. Push para a branch
5. Abra um Pull Request

## 📄 Licença

MIT License - veja LICENSE para detalhes.

## 🆘 Suporte

Para suporte:
1. Verifique a documentação
2. Consulte os logs via `/api/debug`
3. Abra uma issue no repositório