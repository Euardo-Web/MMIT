#!/bin/bash

echo "========================================"
echo "  WhatsApp Bot - Node.js Version"
echo "========================================"
echo

echo "Verificando Node.js..."
if ! command -v node &> /dev/null; then
    echo "ERRO: Node.js não encontrado!"
    echo "Por favor, instale o Node.js em: https://nodejs.org/"
    exit 1
fi

echo "Node.js encontrado!"
echo

echo "Verificando dependências..."
if [ ! -d "node_modules" ]; then
    echo "Instalando dependências..."
    npm install
    if [ $? -ne 0 ]; then
        echo "ERRO: Falha ao instalar dependências!"
        exit 1
    fi
    echo "Dependências instaladas com sucesso!"
else
    echo "Dependências já instaladas."
fi

echo
echo "Iniciando servidor..."
echo "Acesse: http://localhost:3000"
echo
echo "Pressione Ctrl+C para parar o servidor"
echo

npm start
