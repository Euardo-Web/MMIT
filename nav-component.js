class NavBar extends HTMLElement {
    constructor() {
        super();
        
        this.pages = [
            { path: 'dashboard.html', icon: 'dashboard', text: 'Dashboard' },
            // created a dedicated page file for Grupos; if you prefer a different path, update it here
            { path: 'grupos.html', icon: 'groups', text: 'Grupos' },
            { path: 'instancias.html', icon: 'dns', text: 'Instâncias' },
            { path: 'file-mensagens.html', icon: 'message', text: 'Fila de Mensagens' },
            { path: 'estatistica.html', icon: 'bar_chart', text: 'Estatísticas' },
            { path: 'logs.html', icon: 'info', text: 'Logs' },
            { path: 'configuracoes.html', icon: 'settings', text: 'Configurações' }
        ];
    }

    connectedCallback() {
        const currentPage = window.location.pathname.split('/').pop() || 'dashboard.html';
        
        // Add styles for fixed sidebar
        const style = document.createElement('style');
        style.textContent = `
            nav-bar {
                position: sticky;
                top: 0;
                height: 100vh;
                z-index: 1000;
            }
            nav-bar .sidebar {
                height: 100vh;
                overflow-y: auto;
            }
            nav-bar .sidebar-nav {
                flex: 1;
                overflow-y: auto;
            }
            nav-bar .sidebar-footer {
                padding: 15px;
            }
            nav-bar .sidebar-nav::-webkit-scrollbar {
                width: 6px;
            }
            nav-bar .sidebar-nav::-webkit-scrollbar-thumb {
                background-color: rgba(0, 0, 0, 0.2);
                border-radius: 3px;
            }
            nav-bar .sidebar-nav::-webkit-scrollbar-track {
                background-color: rgba(0, 0, 0, 0.05);
            }
        `;
        document.head.appendChild(style);
        
        this.innerHTML = `
            <aside class="sidebar" role="navigation" aria-label="Sidebar">
                <div class="sidebar-header">
                    <img src="thunder.png" alt="" class="logo">
                    <div class="app-info">
                        <strong>THUNDER</strong>
                        <small>Sistema de Automação v2.0</small>
                    </div>
                </div>
                <nav class="sidebar-nav">
                    <ul>
                        ${this.pages.map(page => `
                            <li>
                                <a href="${page.path}" data-path="${page.path}" tabindex="0">
                                    <span class="material-icons" aria-hidden="true">${page.icon}</span>
                                    <span class="nav-text">${page.text}</span>
                                </a>
                            </li>
                        `).join('')}
                    </ul>
                </nav>
                <div class="sidebar-footer">
                    <p><small>Sistema Thunder-Atrio</small></p>
                    <p><small>© 2024 - Thunder v2.0</small></p>
                </div>
            </aside>
        `;

        // after rendering, wire up events
        requestAnimationFrame(() => this._enhanceNavigation(currentPage));
    }

    _enhanceNavigation(currentPage) {
        const links = Array.from(this.querySelectorAll('.sidebar-nav a'));

        const setActive = (path) => {
            links.forEach(a => {
                const li = a.closest('li');
                if (!li) return;
                if (a.dataset.path === path) {
                    li.classList.add('active');
                    a.setAttribute('aria-current', 'page');
                } else {
                    li.classList.remove('active');
                    a.removeAttribute('aria-current');
                }
            });
        };

        // initial active state
        setActive(currentPage);

        // navigate on click. we let the browser do a full navigation since these are separate HTML files
        links.forEach(a => {
            a.addEventListener('click', (e) => {
                // normal modifier keys should allow opening in new tab
                if (e.ctrlKey || e.metaKey || e.shiftKey || e.button !== 0) return;
                // allow default navigation
                // but before leaving, set active visually (gives immediate feedback)
                setActive(a.dataset.path);
                // no preventDefault: perform full navigation to other html file
            });

            // keyboard: Enter to follow, ArrowUp/Down to move
            a.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    a.click();
                } else if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    const idx = links.indexOf(a);
                    const next = links[idx + 1] || links[0];
                    next.focus();
                } else if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    const idx = links.indexOf(a);
                    const prev = links[idx - 1] || links[links.length - 1];
                    prev.focus();
                }
            });
        });

        // handle browser history navigation to update active state
        window.addEventListener('popstate', () => {
            const page = window.location.pathname.split('/').pop() || 'dashboard.html';
            setActive(page);
        });
    }
}

customElements.define('nav-bar', NavBar);