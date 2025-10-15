#!/bin/bash

# Script de build para OnRender (alternativa ao render.yaml)
# Este script será executado durante o deploy no OnRender

set -e

echo "🚀 Iniciando build do WhatsApp Bot..."

# Instalar dependências do Node.js
echo "📦 Instalando dependências do Node.js..."
npm install

# Verificar se estamos em ambiente de produção (OnRender)
if [ "$NODE_ENV" = "production" ] || [ ! -z "$RENDER" ]; then
    echo "🌐 Detectado ambiente de produção (OnRender)"
    
    # Instalar Google Chrome e dependências
    echo "📦 Instalando Google Chrome e dependências..."
    
    # Atualizar lista de pacotes
    sudo apt-get update
    
    # Instalar dependências necessárias
    sudo apt-get install -y \
        wget \
        gnupg \
        ca-certificates \
        fonts-liberation \
        libasound2 \
        libatk-bridge2.0-0 \
        libatk1.0-0 \
        libatspi2.0-0 \
        libcups2 \
        libdbus-1-3 \
        libdrm2 \
        libgbm1 \
        libgtk-3-0 \
        libnspr4 \
        libnss3 \
        libwayland-client0 \
        libxcomposite1 \
        libxdamage1 \
        libxfixes3 \
        libxkbcommon0 \
        libxrandr2 \
        xdg-utils \
        libu2f-udev \
        libvulkan1
    
    # Baixar e instalar Chrome
    wget -q -O /tmp/google-chrome-stable_current_amd64.deb https://dl.google.com/linux/direct/google-chrome-stable_current_amd64.deb
    sudo apt-get install -y /tmp/google-chrome-stable_current_amd64.deb
    rm /tmp/google-chrome-stable_current_amd64.deb
    
    # Verificar instalação
    which google-chrome-stable
    google-chrome-stable --version
    
    echo "✅ Chrome instalado com sucesso!"
else
    echo "💻 Ambiente de desenvolvimento - Chrome deve estar instalado localmente"
fi

echo "✅ Build concluído!"
