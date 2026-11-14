// Central Application Bootstrap & Router (js/main.js)
import { store } from './store.js';
import { renderMediaHub } from './media-hub.js';
import { renderSidebarChat, renderFullWumpChat } from './wump-app.js';
import { renderUntitledStudio } from './untitled-app.js';
import { renderVideoConverter } from './video-converter.js';

function renderWorkspace() {
  const mainEl = document.getElementById('nexus-main-view');
  const sidebarEl = document.getElementById('nexus-sidebar-chat');
  const { activeModule } = store.state;

  // Update active navigation tab styling
  document.querySelectorAll('#nexus-nav-tabs .nav-tab').forEach((btn) => {
    if (btn.dataset.module === activeModule) {
      btn.classList.add('active-tab');
    } else {
      btn.classList.remove('active-tab');
    }
  });

  // Render active main view
  if (activeModule === 'media-hub') {
    renderMediaHub(mainEl);
  } else if (activeModule === 'wump') {
    renderFullWumpChat(mainEl);
  } else if (activeModule === 'untitled') {
    renderUntitledStudio(mainEl);
  } else if (activeModule === 'converter') {
    renderVideoConverter(mainEl);
  }

  // Always keep live Watch-Party & Wump sidebar synced
  renderSidebarChat(sidebarEl);
}

document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('#nexus-nav-tabs .nav-tab').forEach((btn) => {
    btn.addEventListener('click', () => {
      store.setActiveModule(btn.dataset.module);
    });
  });

  store.subscribe(() => {
    renderWorkspace();
  });

  renderWorkspace();
});
