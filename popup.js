/**
 * Gemini to Notion Knowledge Archiver - Popup Script
 * ステータス表示
 */

const credentialStatusEl = document.getElementById('credentialStatus');

async function updateStatus() {
  try {
    // 認証情報のチェック
    const credentialCheck = await chrome.runtime.sendMessage({ action: 'getCredentials' });
    
    if (credentialCheck.hasCredentials) {
      credentialStatusEl.textContent = 'Notion設定済み ✓';
      credentialStatusEl.classList.remove('not-configured');
      credentialStatusEl.classList.add('configured');
    } else {
      credentialStatusEl.textContent = 'Notion設定が未完了です';
      credentialStatusEl.classList.remove('configured');
      credentialStatusEl.classList.add('not-configured');
    }
  } catch (error) {
    console.error('ステータス更新エラー:', error);
  }
}

// 初期化
document.addEventListener('DOMContentLoaded', updateStatus);
