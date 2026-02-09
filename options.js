/**
 * Gemini to Notion v4.0 - Options Script
 */
const notionApiKeyInput = document.getElementById('notionApiKey');
const notionDatabaseIdInput = document.getElementById('notionDatabaseId');
const saveBtn = document.getElementById('saveBtn');
const activeClientSelect = document.getElementById('activeClientId');
const saveClientBtn = document.getElementById('saveClientBtn');
const saveAutoBtn = document.getElementById('saveAutoBtn');
const clientStatus = document.getElementById('clientStatus');
const advancedSettings = document.getElementById('advancedSettings');
const toast = document.getElementById('toast');

function showToast(message) {
  toast.textContent = message;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 3000);
}

function getConfigOrNotify() {
  if (!window.ArchiverConfig) {
    showToast('クライアント設定に必要なモジュールが見つかりません');
    return null;
  }
  return window.ArchiverConfig;
}

async function loadSettings() {
  const result = await chrome.storage.local.get(['notionApiKey', 'notionDatabaseId']);
  if (result.notionApiKey) notionApiKeyInput.value = result.notionApiKey;
  if (result.notionDatabaseId) notionDatabaseIdInput.value = result.notionDatabaseId;

  // activeClientId は共有設定なので、利用可能ならヘルパー経由で取得する。
  if (window.ArchiverConfig) {
    const activeClientId = await window.ArchiverConfig.getActiveClientId();
    if (activeClientId && activeClientId !== 'auto') {
      activeClientSelect.value = activeClientId;
      if (advancedSettings) advancedSettings.open = true;
    }
    if (clientStatus) {
      clientStatus.textContent = `現在: ${activeClientId || 'auto'}`;
    }
  }
}

async function saveSettings() {
  const notionApiKey = notionApiKeyInput.value.trim();
  const notionDatabaseId = notionDatabaseIdInput.value.trim();
  
  if (!notionApiKey || !notionDatabaseId) {
    showToast('すべてのフィールドを入力してください');
    return;
  }
  
  await chrome.storage.local.set({ notionApiKey, notionDatabaseId });
  showToast('設定を保存しました ✓');
  
  // 保存後、チャットに戻るか確認（カスタムダイアログ）
  showReturnToChatDialog();
}

saveBtn.addEventListener('click', saveSettings);
saveAutoBtn.addEventListener('click', async () => {
  const config = getConfigOrNotify();
  if (!config) return;
  await config.setActiveClientId('auto');
  if (clientStatus) clientStatus.textContent = '現在: auto';
  showToast('Autoに設定しました ✓');
});
saveClientBtn.addEventListener('click', async () => {
  const config = getConfigOrNotify();
  if (!config) return;
  await config.setActiveClientId(activeClientSelect.value);
  if (clientStatus) clientStatus.textContent = `現在: ${activeClientSelect.value}`;
  showToast('手動設定を保存しました ✓');
});

function showReturnToChatDialog() {
  const overlay = document.createElement('div');
  overlay.className = 'gemini-to-notion-dialog-overlay';
  overlay.style.zIndex = '10000';
  
  overlay.innerHTML = `
    <div class="gemini-to-notion-dialog" style="max-width: 400px;">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
        <h3 style="margin: 0;">設定を保存しました</h3>
        <button id="return-dialog-close" style="background: none; border: none; font-size: 24px; cursor: pointer; color: #999; padding: 0; line-height: 1;">×</button>
      </div>
      <p style="margin-bottom: 20px; color: #ccc;">チャットに戻りますか？</p>
      <div class="dialog-actions" style="justify-content: flex-end;">
        <button id="return-dialog-ok" class="dialog-btn confirm">OK</button>
      </div>
    </div>
  `;
  
  document.body.appendChild(overlay);
  
  const closeBtn = document.getElementById('return-dialog-close');
  const okBtn = document.getElementById('return-dialog-ok');
  
  closeBtn.addEventListener('click', () => overlay.remove());
  okBtn.addEventListener('click', () => {
    window.close();
  });
  
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) overlay.remove();
  });
}

document.addEventListener('DOMContentLoaded', loadSettings);
