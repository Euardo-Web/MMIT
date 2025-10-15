# Thunder - Sistema de Gerenciamento WhatsApp via Z-API

Sistema completo para gerenciamento de instâncias WhatsApp através da API Z-API.

## 🚀 Características

- ✅ Gerenciamento de múltiplas instâncias WhatsApp
- ✅ Integração completa com Z-API
- ✅ Interface web moderna e responsiva
- ✅ Envio de mensagens em massa
- ✅ QR Code para conexão
- ✅ Status em tempo real
- ✅ Webhooks para eventos
- ✅ API RESTful completa

## 📋 Pré-requisitos

- Node.js 16+ 
- Conta na Z-API (https://z-api.io)
- Token e credenciais da Z-API

## 🔧 Instalação

1. Clone o repositório:
```bash
git clone <seu-repositorio>
cd <diretorio>
```

2. Instale as dependências:
```bash
npm install
```

3. Configure as variáveis de ambiente:
```bash
cp .env.example .env
```

Edite o arquivo `.env` com suas credenciais:
```env
PORT=3000
ZAPI_BASE_URL=https://api.z-api.io
ZAPI_TOKEN=seu_token_aqui
NODE_ENV=production
```

4. Inicie o servidor:
```bash
npm start
```

Ou em modo de desenvolvimento:
```bash
npm run dev
```

5. Acesse o sistema:
```
http://localhost:3000
```

## 📚 Estrutura da API

### Instâncias

#### Criar Instância
```http
POST /api/instances
Content-Type: application/json

{
  "name": "Minha Instância",
  "contacts": ["contato1", "contato2"],
  "message": "Mensagem padrão",
  "provider": "zapi"
}
```

#### Listar Instâncias
```http
GET /api/instances
```

#### Obter Instância Específica
```http
GET /api/instances/:instanceId
```

#### Atualizar Instância
```http
PUT /api/instances/:instanceId
Content-Type: application/json

{
  "name": "Nome Atualizado",
  "contacts": ["contato1"],
  "message": "Nova mensagem"
}
```

#### Deletar Instância
```http
DELETE /api/instances/:instanceId
```

### Gerenciamento Z-API

#### Iniciar Instância
```http
POST /api/instances/:instanceId/start
```

#### Parar Instância
```http
POST /api/instances/:instanceId/stop
```

#### Obter QR Code
```http
GET /api/instances/:instanceId/qr
```

#### Verificar Status
```http
GET /api/instances/:instanceId/status
```

#### Enviar Mensagem
```http
POST /api/instances/:instanceId/send
Content-Type: application/json

{
  "to": "5511999999999",
  "message": "Olá, mundo!"
}
```

### Webhooks

O sistema possui um endpoint para receber webhooks da Z-API:

```http
POST /api/zapi/webhook
```

Configure este endpoint na sua conta Z-API para receber eventos em tempo real.

## 🎯 Como Usar

### 1. Criar uma Instância

1. Acesse a página "Instâncias"
2. Clique em "Nova Instância"
3. Preencha o nome e informações
4. Clique em "Salvar"

### 2. Conectar ao WhatsApp

1. Na lista de instâncias, clique em "Iniciar" (▶️)
2. Clique em "QR Code" (QR)
3. Escaneie o QR Code com seu WhatsApp
4. Aguarde a conexão

### 3. Enviar Mensagens

1. Acesse a página "Enviar Mensagens"
2. Selecione a instância conectada
3. Digite o número do destinatário (com DDI)
4. Digite a mensagem
5. Clique em "Enviar"

## 🗂️ Estrutura do Projeto

```
├── server.js              # Servidor principal
├── zapi-adapter.js        # Adaptador Z-API
├── package.json           # Dependências
├── dashboard.html         # Dashboard principal
├── instancias.html        # Gerenciamento de instâncias
├── grupos.html            # Envio de mensagens
├── script.js              # JavaScript do frontend
├── style.css              # Estilos
├── nav-component.js       # Componente de navegação
└── app_new.db            # Banco de dados SQLite
```

## 🔐 Segurança

- **NÃO** commite o arquivo `.env` com credenciais
- Use HTTPS em produção
- Configure CORS adequadamente
- Implemente autenticação se necessário

## 🐛 Troubleshooting

### Erro ao conectar com Z-API
- Verifique suas credenciais no `.env`
- Confirme que o ZAPI_BASE_URL está correto
- Verifique se sua conta Z-API está ativa

### Instância não conecta
- Certifique-se de iniciar a instância antes de obter o QR
- Verifique se o número já não está conectado em outro lugar
- Aguarde alguns segundos entre tentativas

### Mensagens não são enviadas
- Verifique se a instância está conectada
- Confirme o formato do número (com DDI)
- Verifique os logs do servidor

## 📊 Banco de Dados

O sistema usa SQLite com as seguintes tabelas:

- `instances`: Armazena informações das instâncias
- `zapi_mappings`: Mapeia instâncias locais com Z-API

## 🚀 Deploy

### Render.com, Heroku, etc.

1. Configure as variáveis de ambiente na plataforma
2. Faça push do código
3. A plataforma irá instalar dependências e iniciar automaticamente

## 📝 Licença

MIT

## 🤝 Contribuindo

Contribuições são bem-vindas! Por favor:

1. Fork o projeto
2. Crie uma branch (`git checkout -b feature/nova-funcionalidade`)
3. Commit suas mudanças (`git commit -am 'Adiciona nova funcionalidade'`)
4. Push para a branch (`git push origin feature/nova-funcionalidade`)
5. Abra um Pull Request

## 📧 Suporte

Para suporte, abra uma issue no repositório ou entre em contato.

---

Desenvolvido com ❤️ para facilitar o gerenciamento de WhatsApp via API
