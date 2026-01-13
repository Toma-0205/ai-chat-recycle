/**
 * Gemini to Notion v4.0 - Options Script
 */
const notionApiKeyInput = document.getElementById('notionApiKey');
const notionDatabaseIdInput = document.getElementById('notionDatabaseId');
const saveBtn = document.getElementById('saveBtn');
const toast = document.getElementById('toast');

function showToast(message) {
  toast.textContent = message;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 3000);
}

async function loadSettings() {
  const result = await chrome.storage.local.get(['notionApiKey', 'notionDatabaseId']);
  if (result.notionApiKey) notionApiKeyInput.value = result.notionApiKey;
  if (result.notionDatabaseId) notionDatabaseIdInput.value = result.notionDatabaseId;
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
}

saveBtn.addEventListener('click', saveSettings);
document.addEventListener('DOMContentLoaded', loadSettings);
