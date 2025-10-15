// Script.js simplificado - Apenas gerenciamento de instâncias via Z-API

document.addEventListener('DOMContentLoaded', () => {
  // ========== GERENCIAMENTO DE INSTÂNCIAS ==========
  const instancesUl = document.getElementById('instances-ul');
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
      const idsText = inst.contacts && inst.contacts.length > 0 ? ` (${inst.contacts.length} contatos)` : ' (0 contatos)';
      const providerText = inst.provider ? `Provider: ${escapeHtml(inst.provider)}` : '';
      const zapiText = inst.zapi_instance_id ? `<div class="muted">Z-API ID: ${escapeHtml(inst.zapi_instance_id)}</div>` : '';
      const statusText = inst.status ? `<div class="status-badge ${inst.status}">${inst.status}</div>` : '';
      
      li.innerHTML = `
        <div class="instance-info">
          <strong>${escapeHtml(inst.name)}</strong>${idsText}
          <small>Criado: ${formatDate(inst.created_at)}</small>
          <div class="muted">${providerText}</div>
          ${zapiText}
          ${statusText}
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

    // Wire open buttons
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

    // Wire delete buttons
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
    
    // Preencher contatos nos campos (se existir os elementos)
    if (instId1 && instId2 && instId3) {
      instId1.value = (inst.contacts && inst.contacts[0]) || '';
      instId2.value = (inst.contacts && inst.contacts[1]) || '';
      instId3.value = (inst.contacts && inst.contacts[2]) || '';
    }
    
    instMensagem.value = inst.message || '';
    
    // Set provider and zapi id if available
    if (instProvider) instProvider.value = inst.provider || 'zapi';
    if (instZapiId) instZapiId.value = inst.zapi_instance_id || '';
    
    formTitle.textContent = 'Editar Instância';
  }

  function clearForm() {
    if (!instForm) return;
    instIdInput.value = '';
    instName.value = '';
    
    if (instId1 && instId2 && instId3) {
      instId1.value = '';
      instId2.value = '';
      instId3.value = '';
    }
    
    instMensagem.value = '';
    formTitle.textContent = 'Criar Instância';
  }

  // Event listeners
  const newBtn = document.getElementById('new-instance');
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
      
      let contacts = [];
      if (instId1 && instId2 && instId3) {
        contacts = [instId1.value.trim(), instId2.value.trim(), instId3.value.trim()].filter(Boolean);
      } else {
        // Fallback: usar um placeholder se não houver campos de contato
        contacts = ['placeholder'];
      }
      
      const payload = {
        name: instName.value.trim(),
        contacts: contacts,
        message: instMensagem.value.trim() || 'Mensagem padrão'
      };
      
      if (instProvider && instProvider.value) {
        payload.provider = instProvider.value;
      }
      
      // Validations
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
        showNotification(error.message || 'Erro ao salvar instância', 'error');
      }
    });
  }

  // Helper functions
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) { 
      return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; 
    });
  }

  function formatDate(dateString) {
    if (!dateString) return 'N/A';
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString('pt-BR') + ' ' + 
             date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
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
    const existing = document.querySelector('.notification');
    if (existing) existing.remove();

    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.innerHTML = `
      <span class="material-icons">${type === 'success' ? 'check_circle' : type === 'error' ? 'error' : 'info'}</span>
      <span>${message}</span>
      <button class="notification-close">
        <span class="material-icons">close</span>
      </button>
    `;

    document.body.appendChild(notification);

    setTimeout(() => {
      if (notification.parentNode) {
        notification.remove();
      }
    }, 5000);

    notification.querySelector('.notification-close').addEventListener('click', () => {
      notification.remove();
    });
  }

  // Refresh button
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

  // Header new instance button
  const headerNewBtn = document.querySelector('.actions .btn-primary');
  if (headerNewBtn && headerNewBtn.textContent.includes('Nova Instância')) {
    headerNewBtn.addEventListener('click', () => {
      clearForm();
      if (instName) instName.focus();
    });
  }

  // Initial load
  if (instancesUl) {
    loadInstances();
  }
});
