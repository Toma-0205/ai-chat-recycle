/**
 * Gemini to Notion Knowledge Archiver v4.0 - Content Script
 * プロンプト注入による要約生成 + JSONパース保存
 */

// =============================================================================
// 定数定義
// =============================================================================
const BUTTON_CLASS = 'gemini-to-notion-button';
const PROCESSED_ATTR = 'data-gemini-to-notion-processed';

// =============================================================================
// チャットスレッド全体の抽出
// =============================================================================

function extractEntireThread() {
  const messages = [];
  const conversationSelectors = ['.conversation-container', '.chat-container', '[class*="conversation"]', 'main', '#chat-container'];
  
  let conversationContainer = null;
  for (const selector of conversationSelectors) {
    conversationContainer = document.querySelector(selector);
    if (conversationContainer) break;
  }
  if (!conversationContainer) conversationContainer = document.body;
  
  const messageSelectors = ['[data-message-author-role]', '[data-author]', '.user-message, .model-response', '.message-container', '.chat-message'];
  let messageElements = [];
  
  for (const selector of messageSelectors) {
    const elements = conversationContainer.querySelectorAll(selector);
    if (elements.length > 0) {
      messageElements = Array.from(elements);
      break;
    }
  }
  
  if (messageElements.length === 0) return extractThreadFallback();
  
  messageElements.forEach((element, index) => {
    const role = determineMessageRole(element);
    const content = extractMessageContent(element);
    if (content && content.trim().length > 0) {
      messages.push({ role, content: content.trim(), index });
    }
  });
  
  return messages;
}

function determineMessageRole(element) {
  const authorRole = element.getAttribute('data-message-author-role');
  if (authorRole === '0') return 'user';
  if (authorRole === '1') return 'model';
  
  const author = element.getAttribute('data-author');
  if (author === 'user' || author === 'human') return 'user';
  if (author === 'model' || author === 'assistant') return 'model';
  
  const className = element.className.toLowerCase();
  if (className.includes('user') || className.includes('human')) return 'user';
  if (className.includes('model') || className.includes('response')) return 'model';
  
  return 'unknown';
}

function extractMessageContent(element) {
  const contentSelectors = ['.message-content', '.model-response-text', '.user-query-text', '[class*="content"]', '[class*="text"]'];
  for (const selector of contentSelectors) {
    const contentElement = element.querySelector(selector);
    if (contentElement) return contentElement.innerText || contentElement.textContent;
  }
  return element.innerText || element.textContent;
}

function extractThreadFallback() {
  const messages = [];
  const allTextBlocks = document.querySelectorAll('p, div > span');
  let currentRole = 'user';
  allTextBlocks.forEach((block) => {
    const text = block.innerText || block.textContent;
    if (text && text.trim().length > 20) {
      messages.push({ role: currentRole, content: text.trim() });
      currentRole = currentRole === 'user' ? 'model' : 'user';
    }
  });
  return messages;
}

// =============================================================================
// プロンプト生成と注入
// =============================================================================

function generateSummaryPrompt(messages) {
  const threadText = messages.map(msg => {
    const roleLabel = msg.role === 'user' ? '【ユーザー】' : '【Gemini】';
    return `${roleLabel}\n${msg.content}`;
  }).join('\n\n---\n\n');

  const today = new Date().toISOString().split('T')[0];

  return `あなたは優秀な秘書であり、データアナリストです。提供された「会話履歴」を分析し、Notionデータベースに保存するための情報を以下のJSON形式で出力してください。内容はMECEを徹底し、取りこぼしがないようにしてください。

【出力ルール】

JSON形式のみを出力し、解説や前置きは一切不要です。

title: 会話全体の核心を突いた30文字以内のタイトル。

summary: 全体の要点を3行程度でまとめた概要。

content: 詳細な議事録。全ての質問と回答のペア（ユーザーの質問とGeminiの回答）について、一つずつ漏れなく内容を要約して記載してください。Markdown形式を使用し、後から見返してスレッド全体の流れと詳細が完全に把握できるように整理してください。

todos: 抽出された「次にやるべきこと（TODO）」と「既に完了したこと（DIDs）」を箇条書きで。なければ空文字。

date: 本日の日付（${today}）。

【対象となる会話履歴】
${threadText}`;
}

function injectPromptToInput(text) {
  const inputSelectors = [
    'rich-textarea > [contenteditable]', 
    '.ql-editor', 
    '[contenteditable="true"]', 
    'textarea',
    '#prompt-textarea'
  ];
  
  let inputElement = null;
  for (const selector of inputSelectors) {
    inputElement = document.querySelector(selector);
    if (inputElement) break;
  }
  
  if (!inputElement) {
    showToast('入力欄が見つかりませんでした。テキストをクリップボードにコピーしました。', 'error');
    navigator.clipboard.writeText(text);
    return false;
  }
  
  inputElement.focus();
  document.execCommand('selectAll', false, null);
  document.execCommand('insertText', false, text);
  inputElement.dispatchEvent(new Event('input', { bubbles: true }));
  
  return true;
}

// =============================================================================
// Notionインポート (v5.0 Import機能)
// =============================================================================

async function handleNotionImport() {
  const overlay = document.createElement('div');
  overlay.className = 'gemini-to-notion-dialog-overlay';
  overlay.innerHTML = `
    <div class="gemini-to-notion-dialog import-dialog">
      <h3>Notionから引用</h3>
      
      <div class="import-search-container">
        <input type="text" id="import-search-input" placeholder="タイトルで検索..." />
        <button id="import-search-btn" class="dialog-btn confirm">検索</button>
      </div>

      <div id="import-list" class="import-list">
        <div class="loading-spinner">読み込み中...</div>
      </div>
      <div class="dialog-actions">
        <button class="dialog-btn cancel">閉じる</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  overlay.querySelector('.cancel').addEventListener('click', () => overlay.remove());
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) overlay.remove();
  });

  const listContainer = document.getElementById('import-list');
  const searchInput = document.getElementById('import-search-input');
  const searchBtn = document.getElementById('import-search-btn');

  const executeSearch = async (query = '') => {
    listContainer.innerHTML = '<div class="loading-spinner">読み込み中...</div>';
    
    try {
      const response = await chrome.runtime.sendMessage({ action: 'searchNotion', query });
      
      if (!response.success) {
        listContainer.innerHTML = `<div class="error-msg">エラー: ${response.error}</div>`;
        return;
      }
      
      if (response.results.length === 0) {
        listContainer.innerHTML = '<div class="empty-msg">ページが見つかりませんでした</div>';
        return;
      }

      listContainer.innerHTML = '';
      response.results.forEach(page => {
        const item = document.createElement('div');
        item.className = 'import-item';
        item.innerHTML = `
          <div class="import-title">${escapeHtml(page.title)}</div>
          <div class="import-date">${new Date(page.lastEdited).toLocaleDateString()}</div>
        `;
        item.addEventListener('click', () => {
          overlay.remove();
          fetchAndInsertPageContent(page);
        });
        listContainer.appendChild(item);
      });

    } catch (error) {
      if (listContainer) listContainer.innerHTML = `<div class="error-msg">通信エラー: ${error.message}</div>`;
    }
  };

  // Initial load
  executeSearch();

  // Search handlers
  searchBtn.addEventListener('click', () => executeSearch(searchInput.value));
  searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') executeSearch(searchInput.value);
  });
}

async function fetchAndInsertPageContent(page) {
  showToast('ページ内容を取得中...', 'success');
  
  try {
    const response = await chrome.runtime.sendMessage({ action: 'getNotionPage', pageId: page.id });
    
    if (!response.success) {
      showToast(`取得エラー: ${response.error}`, 'error');
      return;
    }

    const content = `【Notionからの引用】\nタイトル: ${page.title}\n---\n${response.content}\n---`;
    const success = injectPromptToInput(content);
    
    if (success) {
      showToast('入力欄に貼り付けました', 'success');
    }
    
  } catch (error) {
    showToast(`エラー: ${error.message}`, 'error');
  }
}

// =============================================================================
// JSONパースと保存
// =============================================================================

function parseJsonFromResponse(text) {
  if (!text) return null;
  
  let jsonText = text.trim();
  const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  
  if (jsonMatch && jsonMatch[1]) {
    jsonText = jsonMatch[1];
  } else {
    const braceMatch = text.match(/\{[\s\S]*\}/);
    if (braceMatch) {
      jsonText = braceMatch[0];
    }
  }
  
  try {
    return JSON.parse(jsonText);
  } catch (e) {
    console.error('JSON Parse Error:', e);
    return null;
  }
}

// =============================================================================
// トースト
// =============================================================================

function showToast(message, type = 'success', linkUrl = null) {
  const existingToast = document.querySelector('.gemini-to-notion-toast');
  if (existingToast) existingToast.remove();
  
  const toast = document.createElement('div');
  toast.className = `gemini-to-notion-toast ${type}`;
  
  const textSpan = document.createElement('span');
  textSpan.textContent = message;
  toast.appendChild(textSpan);
  
  if (linkUrl) {
    const link = document.createElement('a');
    link.href = linkUrl;
    link.target = '_blank';
    link.textContent = ' ↗ 開く';
    link.style.color = '#fff';
    link.style.textDecoration = 'underline';
    link.style.marginLeft = '8px';
    link.style.fontWeight = 'bold';
    toast.appendChild(link);
  }
  
  document.body.appendChild(toast);
  
  requestAnimationFrame(() => toast.classList.add('show'));
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 300);
  }, 10000);
}

// =============================================================================
// プレビューダイアログ
// =============================================================================

function showEditablePreviewDialog(data, onSave) {
  const existingDialog = document.querySelector('.gemini-to-notion-dialog-overlay');
  if (existingDialog) existingDialog.remove();
  
  const overlay = document.createElement('div');
  overlay.className = 'gemini-to-notion-dialog-overlay';
  
  const dialog = document.createElement('div');
  dialog.className = 'gemini-to-notion-dialog editable-preview';
  
  dialog.innerHTML = `
    <h3>📓 Notionへ保存 - 内容確認</h3>
    
    <div class="form-group">
      <label>名前（タイトル）</label>
      <input type="text" id="preview-title" value="${escapeHtml(data.title || '')}">
    </div>
    
    <div class="form-group">
      <label>概要</label>
      <textarea id="preview-summary" rows="3">${escapeHtml(data.summary || '')}</textarea>
    </div>
    
    <div class="form-group">
      <label>やること</label>
      <textarea id="preview-todos" rows="3">${escapeHtml(data.todos || '')}</textarea>
    </div>
    
    <div class="form-group">
      <label>時期</label>
      <input type="date" id="preview-date" value="${data.date || new Date().toISOString().split('T')[0]}">
    </div>
    
    <div class="form-group">
      <label>回答（議事録・本文）</label>
      <textarea id="preview-content" rows="8">${escapeHtml(data.content || '')}</textarea>
    </div>
    
    <div class="dialog-actions">
      <button class="dialog-btn cancel">キャンセル</button>
      <button class="dialog-btn confirm">Notionに保存</button>
    </div>
  `;
  
  overlay.appendChild(dialog);
  document.body.appendChild(overlay);
  
  dialog.querySelector('.cancel').addEventListener('click', () => overlay.remove());
  dialog.querySelector('.confirm').addEventListener('click', () => {
    const editedData = {
      title: document.getElementById('preview-title').value,
      summary: document.getElementById('preview-summary').value,
      todos: document.getElementById('preview-todos').value,
      date: document.getElementById('preview-date').value,
      content: document.getElementById('preview-content').value
    };
    overlay.remove();
    onSave(editedData);
  });
  
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) overlay.remove();
  });
}

function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// =============================================================================
// ハンドラー
// =============================================================================

function handleInjectPrompt(button) {
  const originalText = button.textContent;
  button.textContent = '抽出中...';
  button.disabled = true;
  
  setTimeout(() => {
    const messages = extractEntireThread();
    if (messages.length === 0) {
      showToast('会話が見つかりませんでした', 'error');
      button.textContent = originalText;
      button.disabled = false;
      return;
    }
    
    const prompt = generateSummaryPrompt(messages);
    const success = injectPromptToInput(prompt);
    
    if (success) {
      showToast('入力欄にプロンプトを貼り付けました。送信してください。', 'success');
      button.textContent = '✓ 貼付完了';
      setTimeout(() => {
        button.textContent = originalText;
        button.disabled = false;
      }, 2000);
    } else {
      button.textContent = originalText;
      button.disabled = false;
    }
  }, 100);
}

async function handleSaveResponse(responseElement, button) {
  button.disabled = true;
  button.textContent = '確認中...';
  
  try {
    const credentialCheck = await chrome.runtime.sendMessage({ action: 'getCredentials' });
    if (!credentialCheck.hasCredentials) {
      showToast('Notion設定が未完了です。オプション画面から設定してください。', 'error');
      button.disabled = false;
      button.textContent = 'Notionへ保存';
      return;
    }
    
    const contentText = extractMessageContent(responseElement);
    if (!contentText.trim()) {
      showToast('テキストが空です', 'error');
      button.disabled = false;
      button.textContent = 'Notionへ保存';
      return;
    }
    
    let data = parseJsonFromResponse(contentText);
    
    if (!data) {
      const prevElement = responseElement.previousElementSibling;
      let promptText = 'プロンプト不明';
      if (prevElement) {
        promptText = extractMessageContent(prevElement) || 'Geminiの回答';
      }
      
      data = {
        title: promptText.substring(0, 50),
        summary: contentText.substring(0, 100) + '...',
        content: contentText,
        todos: '',
        date: new Date().toISOString().split('T')[0]
      };
    }
    
    showEditablePreviewDialog(data, async (finalData) => {
      button.textContent = '保存中...';
      const result = await chrome.runtime.sendMessage({
        action: 'saveToNotion',
        data: finalData
      });
      
      if (result.success) {
        showToast('Notionに保存しました ✓', 'success', result.pageUrl);
        button.textContent = '✓ 保存済み';
        button.classList.add('saved');
      } else {
        showToast(`保存エラー: ${result.error}`, 'error');
        button.disabled = false;
        button.textContent = 'Notionへ保存';
      }
    });
    
    button.disabled = false;
    button.textContent = 'Notionへ保存';
    
  } catch (error) {
    showToast(`エラー: ${error.message}`, 'error');
    button.disabled = false;
    button.textContent = 'Notionへ保存';
  }
}

// =============================================================================
// ボタン挿入
// =============================================================================

function insertButtonsToResponses() {
  const selectors = ['.model-response', '.response-container', '[data-message-author-role="1"]', '.message-container[data-author="model"]'];
  
  selectors.forEach(selector => {
    document.querySelectorAll(selector).forEach(response => {
      // 処理済みチェック
      if (response.hasAttribute(PROCESSED_ATTR)) return;
      
      // テキストがあるかチェック
      if (!response.textContent || response.textContent.trim().length < 5) return;
      
      response.setAttribute(PROCESSED_ATTR, 'true');
      
      // 1. ボタンコンテナ
      const btnContainer = document.createElement('div');
      btnContainer.className = 'gemini-to-notion-button-container';
      
      // 2. 「Notionから引用」ボタン (v5.1: インライン配置に変更)
      const importButton = document.createElement('button');
      importButton.className = BUTTON_CLASS;
      importButton.textContent = 'Notionから引用';
      importButton.title = 'Notionからページを選択して引用';
      importButton.style.background = 'linear-gradient(135deg, #2d2d2d, #000000)';
      importButton.addEventListener('click', handleNotionImport);

      // 3. 「まとめを作成」ボタン
      const summarizeButton = document.createElement('button');
      summarizeButton.className = BUTTON_CLASS;
      summarizeButton.textContent = 'まとめを作成';
      summarizeButton.title = 'ここまでの会話を要約するプロンプトを入力欄に貼り付けます';
      summarizeButton.style.marginLeft = '8px'; // マージン付与
      summarizeButton.style.background = 'linear-gradient(135deg, #7c3aed, #4f46e5)';
      summarizeButton.addEventListener('click', () => handleInjectPrompt(summarizeButton));

      // 4. 「Notionへ保存」ボタン
      const saveButton = document.createElement('button');
      saveButton.className = BUTTON_CLASS;
      saveButton.textContent = 'Notionへ保存';
      saveButton.style.marginLeft = '8px'; // マージン付与
      saveButton.addEventListener('click', () => handleSaveResponse(response, saveButton));
      
      // 順序: 引用 → まとめ → 保存
      btnContainer.appendChild(importButton);
      btnContainer.appendChild(summarizeButton);
      btnContainer.appendChild(saveButton);
      
      // 挿入場所を決定
      const actionsArea = response.querySelector('.response-actions, .message-actions');
      if (actionsArea) actionsArea.appendChild(btnContainer);
      else response.appendChild(btnContainer);
    });
  });
}

function removeGlobalButtons() {
  // 以前のグローバルボタン（右下固定）があれば削除する
  const globalBtn = document.getElementById('gemini-to-notion-summarize-btn');
  if (globalBtn) globalBtn.remove();
}

// DOM監視
const observer = new MutationObserver(() => {
  clearTimeout(window.geminiToNotionDebounce);
  window.geminiToNotionDebounce = setTimeout(() => {
    insertButtonsToResponses();
    removeGlobalButtons(); // 古いのがあれば消す
  }, 500);
});

function initialize() {
  console.log('Gemini to Notion v5.1: Content script initialized');
  removeGlobalButtons(); // 古いのがあれば消す (importボタン含む)
  // 固定ボタンがあった場合は削除 (v5.0の名残)
  const oldImportBtn = document.getElementById('gemini-to-notion-import-btn');
  if (oldImportBtn) oldImportBtn.remove();
  
  insertButtonsToResponses();
  observer.observe(document.body, { childList: true, subtree: true });
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initialize);
else initialize();
