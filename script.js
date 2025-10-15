// Client helper to call backend API and poll job status
async function sendMessage(form) {
  const mensagem = document.getElementById('mensagem').value.trim();
  const grupos = document.getElementById('grupos').value
    .split('\n')
    .map(s => s.trim())
    .filter(Boolean);

  if (!mensagem || grupos.length === 0) {
    alert('Preencha os campos: grupos (uma por linha) e mensagem');
    return;
  }

  const res = await fetch('/api/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contacts: grupos, message: mensagem })
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    alert('Erro: ' + (err.error || res.statusText));
    return;
  }

  const { job_id } = await res.json();
  document.getElementById('job-status').textContent = 'Enviado, job: ' + job_id;

  // poll job status
  const interval = setInterval(async () => {
    const r = await fetch('/api/job/' + job_id);
    if (!r.ok) return;
    const j = await r.json();
    document.getElementById('job-status').textContent = 'Status: ' + j.status;
    if (j.status === 'finished' || j.status === 'failed') {
      clearInterval(interval);
    }
  }, 2000);
}

document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('send-form');
  if (form) {
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      sendMessage(form);
    });
  }
  
  // Instances management (instancias.html)
  const instancesUl = document.getElementById('instances-ul');
  const newBtn = document.getElementById('new-instance');
  const instForm = document.getElementById('instance-form');
  const instIdInput = document.getElementById('inst-id');
  const instName = document.getElementById('inst-name');
  const instProvider = document.getElementById('inst-provider');
  const instZapiId = document.getElementById('inst-zapi-id');
  const instId1 = document.getElementById('inst-id-1');
  const instId2 = document.getElementById('inst-id-2');
  const instId3 = document.getElementById('inst-id-3');
  const instMensagem = document.getElementById('inst-mensagem');
  const formTitle = document.getElementById('form-title');
  const cancelEdit = document.getElementById('cancel-edit');

  async function loadInstances() {
    try {
      const res = await fetch('/api/instances');
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      }
      const data = await res.json();
      const list = data.instances || [];
      renderInstances(list);
      updateInstanceCount(list.length);
    } catch (error) {
      console.error('Erro ao carregar instâncias:', error);
      showNotification('Erro ao carregar instâncias: ' + error.message, 'error');
    }
  }

  function renderInstances(list) {
    if (!instancesUl) return;
    instancesUl.innerHTML = '';
    
    if (list.length === 0) {
      const li = document.createElement('li');
      li.className = 'instance-item empty';
      li.innerHTML = '<p>Nenhuma instância encontrada. Clique em "Nova" para criar uma.</p>';
      instancesUl.appendChild(li);
      return;
    }
    
    list.forEach(inst => {
      const li = document.createElement('li');
      li.className = 'instance-item';
      const idsText = inst.ids && inst.ids.length > 0 ? ` (${inst.ids.length} IDs)` : ' (0 IDs)';
      const providerText = inst.provider ? `Provider: ${escapeHtml(inst.provider)}` : '';
      const zapiText = inst.zapi_instance_id ? `<div class="muted">Z-API ID: ${escapeHtml(inst.zapi_instance_id)}</div>` : '';
      li.innerHTML = `
        <div class="instance-info">
          <strong>${escapeHtml(inst.name)}</strong>${idsText}
          <small>Criado: ${formatDate(inst.created_at)}</small>
          <div class="muted">${providerText}</div>
          ${zapiText}
        </div>
        <div class="instance-actions">
          <button data-id="${inst.id}" class="btn btn-secondary open-instance">
            <span class="material-icons">edit</span> Editar
          </button>
          <button data-id="${inst.id}" class="btn btn-danger delete-instance">
            <span class="material-icons">delete</span> Excluir
          </button>
        </div>
      `;
      instancesUl.appendChild(li);
    });

    // wire open buttons
    document.querySelectorAll('.open-instance').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const id = btn.dataset.id;
        try {
          const r = await fetch('/api/instances/' + id);
          if (!r.ok) throw new Error(`HTTP ${r.status}: ${r.statusText}`);
          const inst = await r.json();
          openForEdit(inst);
        } catch (error) {
          showNotification('Erro ao carregar instância: ' + error.message, 'error');
        }
      });
    });

    // wire delete buttons
    document.querySelectorAll('.delete-instance').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const id = btn.dataset.id;
        const instanceName = btn.closest('.instance-item').querySelector('strong').textContent;
        if (!confirm(`Tem certeza que deseja excluir a instância "${instanceName}"?`)) return;
        
        try {
          const r = await fetch('/api/instances/' + id, { method: 'DELETE' });
          if (!r.ok) throw new Error(`HTTP ${r.status}: ${r.statusText}`);
          showNotification('Instância excluída com sucesso!', 'success');
          await loadInstances();
        } catch (error) {
          showNotification('Erro ao excluir instância: ' + error.message, 'error');
        }
      });
    });
  }

  function openForEdit(inst) {
    if (!instForm) return;
    instIdInput.value = inst.id || '';
    instName.value = inst.name || '';
    instId1.value = (inst.contacts && inst.contacts[0]) || '';
    instId2.value = (inst.contacts && inst.contacts[1]) || '';
    instId3.value = (inst.contacts && inst.contacts[2]) || '';
    instMensagem.value = inst.message || '';
    // set provider and zapi id if available
    if (instProvider) instProvider.value = inst.provider || 'selenium';
    if (instZapiId) instZapiId.value = inst.zapi_instance_id || '';
    formTitle.textContent = 'Editar Instância';
  }

  function clearForm() {
    if (!instForm) return;
    instIdInput.value = '';
    instName.value = '';
    instId1.value = '';
    instId2.value = '';
    instId3.value = '';
    instMensagem.value = '';
    formTitle.textContent = 'Criar Instância';
  }

  if (newBtn) {
    newBtn.addEventListener('click', (e) => {
      clearForm();
      instName.focus();
    });
  }

  if (cancelEdit) {
    cancelEdit.addEventListener('click', (e) => {
      clearForm();
    });
  }

  if (instForm) {
    instForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const id = instIdInput.value.trim();
      const payload = {
        name: instName.value.trim(),
        contacts: [instId1.value.trim(), instId2.value.trim(), instId3.value.trim()].filter(Boolean),
        message: instMensagem.value.trim()
      };
      if (instProvider && instProvider.value) payload.provider = instProvider.value;
      
      // Client-side validations
      if (!payload.name) {
        showNotification('Nome da instância é obrigatório', 'error');
        instName.focus();
        return;
      }
      if (payload.name.length > 100) {
        showNotification('Nome da instância deve ter no máximo 100 caracteres', 'error');
        instName.focus();
        return;
      }
      if (payload.message.length > 1000) {
        showNotification('Mensagem deve ter no máximo 1000 caracteres', 'error');
        instMensagem.focus();
        return;
      }
      
      // Validate contacts length
      for (let i = 0; i < payload.contacts.length; i++) {
        if (payload.contacts[i].length > 50) {
          showNotification(`Contato ${i + 1} deve ter no máximo 50 caracteres`, 'error');
          [instId1, instId2, instId3][i].focus();
          return;
        }
      }

      try {
        let res;
        if (id) {
          res = await fetch('/api/instances/' + id, { 
            method: 'PUT', 
            headers: {'Content-Type':'application/json'}, 
            body: JSON.stringify(payload) 
          });
          if (!res.ok) {
            const errorData = await res.json().catch(() => ({}));
            throw new Error(errorData.error || `HTTP ${res.status}: ${res.statusText}`);
          }
          showNotification('Instância atualizada com sucesso!', 'success');
        } else {
          res = await fetch('/api/instances', { 
            method: 'POST', 
            headers: {'Content-Type':'application/json'}, 
            body: JSON.stringify(payload) 
          });
          if (!res.ok) {
            const errorData = await res.json().catch(() => ({}));
            throw new Error(errorData.error || `HTTP ${res.status}: ${res.statusText}`);
          }
          showNotification('Instância criada com sucesso!', 'success');
        }
        await loadInstances();
        clearForm();
      } catch (error) {
        console.error('Error saving instance:', error);
        let errorMessage = 'Erro ao salvar instância';
        
        if (error.message.includes('HTTP 400') || error.message.includes('HTTP 500')) {
          errorMessage = error.message.replace(/^HTTP \d+: /, '');
        } else if (error.message.includes('Failed to fetch')) {
          errorMessage = 'Erro de conexão. Verifique sua internet.';
        } else {
          errorMessage = error.message || errorMessage;
        }
        
        showNotification(errorMessage, 'error');
      }
    });
  }

  // helper functions
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) { return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; });
  }

  function formatDate(dateString) {
    if (!dateString) return 'N/A';
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString('pt-BR') + ' ' + date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    } catch {
      return 'Data inválida';
    }
  }

  function updateInstanceCount(count) {
    const countElement = document.querySelector('.dashboard-cards .count');
    if (countElement) {
      countElement.textContent = count;
    }
  }

  function showNotification(message, type = 'info') {
    // Remove existing notifications
    const existing = document.querySelector('.notification');
    if (existing) existing.remove();

    // Create notification element
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.innerHTML = `
      <span class="material-icons">${type === 'success' ? 'check_circle' : type === 'error' ? 'error' : 'info'}</span>
      <span>${message}</span>
      <button class="notification-close">
        <span class="material-icons">close</span>
      </button>
    `;

    // Add to page
    document.body.appendChild(notification);

    // Auto remove after 5 seconds
    setTimeout(() => {
      if (notification.parentNode) {
        notification.remove();
      }
    }, 5000);

    // Close button functionality
    notification.querySelector('.notification-close').addEventListener('click', () => {
      notification.remove();
    });
  }

  // Add refresh functionality
  const refreshBtn = document.querySelector('.btn-secondary');
  if (refreshBtn && refreshBtn.textContent.includes('Atualizar')) {
    refreshBtn.addEventListener('click', async () => {
      refreshBtn.disabled = true;
      refreshBtn.innerHTML = '<span class="material-icons">hourglass_empty</span> Carregando...';
      
      try {
        await loadInstances();
        showNotification('Instâncias atualizadas com sucesso!', 'success');
      } catch (error) {
        showNotification('Erro ao atualizar instâncias: ' + error.message, 'error');
      } finally {
        refreshBtn.disabled = false;
        refreshBtn.innerHTML = '<span class="material-icons">refresh</span> Atualizar';
      }
    });
  }

  // Add functionality to the "Nova Instância" button in header
  const headerNewBtn = document.querySelector('.actions .btn-primary');
  if (headerNewBtn && headerNewBtn.textContent.includes('Nova Instância')) {
    headerNewBtn.addEventListener('click', () => {
      clearForm();
      if (instName) instName.focus();
    });
  }

  // initial load for instances list
  loadInstances();

  // Bot management (grupos.html)
  const initBotBtn = document.getElementById('init-bot');
  const restartBotBtn = document.getElementById('restart-bot');
  const stopBotBtn = document.getElementById('stop-bot');
  const loadGroupsBtn = document.getElementById('load-groups');
  const botStatusText = document.getElementById('bot-status-text');
  const botStatusIndicator = document.getElementById('bot-status-indicator');

  // Check bot status
  async function checkBotStatus() {
    try {
      const res = await fetch('/api/health');
      if (res.ok) {
        const data = await res.json();
        updateBotStatus(data.bot_status);
      }
    } catch (error) {
      updateBotStatus('error');
    }
  }

  // Update bot status display
  function updateBotStatus(status) {
    if (!botStatusText || !botStatusIndicator) return;
    
    const statusMap = {
      'not_started': { text: 'Não Iniciado', class: 'offline', color: '#f44336' },
      'initializing': { text: 'Inicializando...', class: 'pending', color: '#ff9800' },
      'connected': { text: 'Conectado', class: 'online', color: '#4caf50' },
      'disconnected': { text: 'Desconectado', class: 'offline', color: '#f44336' },
      'error': { text: 'Erro', class: 'error', color: '#f44336' }
    };
    
    const statusInfo = statusMap[status] || statusMap['error'];
    botStatusText.textContent = statusInfo.text;
    botStatusIndicator.className = `status-indicator ${statusInfo.class}`;
    botStatusIndicator.style.backgroundColor = statusInfo.color;
  }

  // Initialize bot
  async function initBot() {
    try {
      initBotBtn.disabled = true;
      initBotBtn.innerHTML = '<span class="material-icons">hourglass_empty</span> Inicializando...';
      updateBotStatus('initializing');
      
      const res = await fetch('/api/bot/start', { method: 'POST' });
      const data = await res.json();
      
      if (res.ok) {
        showNotification(data.message, 'success');
        updateBotStatus(data.bot_status);
        
        // Check status periodically
        setTimeout(checkBotStatus, 2000);
        setTimeout(checkBotStatus, 5000);
        setTimeout(checkBotStatus, 10000);
      } else {
        showNotification('Erro: ' + data.message, 'error');
        updateBotStatus('error');
      }
    } catch (error) {
      console.error('Erro ao inicializar bot:', error);
      showNotification('Erro ao inicializar bot: ' + error.message, 'error');
      updateBotStatus('error');
    } finally {
      if (initBotBtn) {
        initBotBtn.disabled = false;
        initBotBtn.innerHTML = '<span class="material-icons">smart_toy</span> Inicializar Bot';
      }
    }
  }

  // Restart bot
  async function restartBot() {
    try {
      restartBotBtn.disabled = true;
      restartBotBtn.innerHTML = '<span class="material-icons">hourglass_empty</span> Reiniciando...';
      updateBotStatus('initializing');
      
      const res = await fetch('/api/bot/restart', { method: 'POST' });
      const data = await res.json();
      
      if (res.ok) {
        showNotification(data.message, 'success');
        updateBotStatus(data.bot_status);
        
        // Check status periodically
        setTimeout(checkBotStatus, 2000);
        setTimeout(checkBotStatus, 5000);
        setTimeout(checkBotStatus, 10000);
      } else {
        showNotification('Erro: ' + data.message, 'error');
        updateBotStatus('error');
      }
    } catch (error) {
      console.error('Erro ao reiniciar bot:', error);
      showNotification('Erro ao reiniciar bot: ' + error.message, 'error');
      updateBotStatus('error');
    } finally {
      if (restartBotBtn) {
        restartBotBtn.disabled = false;
        restartBotBtn.innerHTML = '<span class="material-icons">refresh</span> Reiniciar Bot';
      }
    }
  }

  // Stop bot
  async function stopBot() {
    try {
      stopBotBtn.disabled = true;
      stopBotBtn.innerHTML = '<span class="material-icons">hourglass_empty</span> Parando...';
      
      const res = await fetch('/api/bot/stop', { method: 'POST' });
      const data = await res.json();
      
      if (res.ok) {
        showNotification(data.message, 'success');
        updateBotStatus('not_started');
      } else {
        showNotification('Erro: ' + data.message, 'error');
      }
    } catch (error) {
      console.error('Erro ao parar bot:', error);
      showNotification('Erro ao parar bot: ' + error.message, 'error');
    } finally {
      if (stopBotBtn) {
        stopBotBtn.disabled = false;
        stopBotBtn.innerHTML = '<span class="material-icons">stop</span> Parar Bot';
      }
    }
  }

  // Groups loading (grupos.html)
  async function loadGroups() {
    try {
      loadGroupsBtn.disabled = true;
      loadGroupsBtn.innerHTML = '<span class="material-icons">hourglass_empty</span> Carregando...';
      const res = await fetch('/api/contacts');
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${res.status}: ${res.statusText}`);
      }
      const data = await res.json();
      renderContactsList(data.contacts || []);
      showNotification('Grupos carregados', 'success');
    } catch (err) {
      console.error('Erro ao carregar grupos:', err);
      showNotification('Erro ao carregar grupos: ' + (err.message || err), 'error');
    } finally {
      if (loadGroupsBtn) {
        loadGroupsBtn.disabled = false;
        loadGroupsBtn.innerHTML = '<span class="material-icons">refresh</span> Carregar Grupos';
      }
    }
  }

  // Contacts rendering with search/filter
  const groupsScroll = document.getElementById('groups-scroll');
  const groupSearch = document.getElementById('group-search');
  const clearSearch = document.getElementById('clear-search');

  let contactsCache = [];

  function renderContactsList(contacts) {
    contactsCache = contacts || [];
    const container = document.getElementById('groups-scroll');
    if (!container) return;
    container.innerHTML = '';

    if (!contactsCache || contactsCache.length === 0) {
      const p = document.createElement('p');
      p.className = 'muted';
      p.id = 'groups-empty';
      p.textContent = 'Nenhum grupo/contato encontrado no WhatsApp Web.';
      container.appendChild(p);
      return;
    }

    const ul = document.createElement('ul');
    ul.className = 'groups-ul';

    contactsCache.forEach(name => {
      const li = document.createElement('li');
      li.className = 'group-item';
      li.textContent = name;
      li.title = 'Clique para adicionar ao campo de grupos';
      li.addEventListener('click', () => {
        if (gruposTextarea) {
          const current = gruposTextarea.value.split('\n').map(s => s.trim()).filter(Boolean);
          if (!current.includes(name)) current.push(name);
          gruposTextarea.value = current.join('\n');
        }
      });
      ul.appendChild(li);
    });

    container.appendChild(ul);
  }

  function filterContacts(query) {
    const q = (query || '').toLowerCase().trim();
    if (!q) {
      renderContactsList(contactsCache);
      return;
    }
    const filtered = contactsCache.filter(c => (c || '').toLowerCase().includes(q));
    renderContactsList(filtered);
  }

  if (groupSearch) {
    groupSearch.addEventListener('input', (e) => {
      filterContacts(e.target.value);
    });
  }

  if (clearSearch) {
    clearSearch.addEventListener('click', () => {
      if (groupSearch) groupSearch.value = '';
      filterContacts('');
      if (groupSearch) groupSearch.focus();
    });
  }

  // Event listeners for bot management
  if (initBotBtn) {
    initBotBtn.addEventListener('click', initBot);
  }
  
  if (restartBotBtn) {
    restartBotBtn.addEventListener('click', restartBot);
  }
  
  if (stopBotBtn) {
    stopBotBtn.addEventListener('click', stopBot);
  }
  
  if (loadGroupsBtn) {
    loadGroupsBtn.addEventListener('click', (e) => {
      loadGroups();
    });
  }

  // Check bot status on page load
  if (botStatusText) {
    checkBotStatus();
    // Check status every 10 seconds
    setInterval(checkBotStatus, 10000);
  }
});
