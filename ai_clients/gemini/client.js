/**
 * ファイル: ai_clients/gemini/client.js
 * 役割: Gemini固有のDOM抽出とUI注入を担当する。
 * 入力: DOM要素 + フローのコールバック
 * 出力: スレッド抽出データ、プロンプト注入、ボタンの配線。
 * 呼び出し元: content.js（ArchiverRegistry 経由）。
 */
(function (global) {
  const CLIENT_ID = 'gemini';
  const BUTTON_CLASS = 'gemini-to-notion-button';
  const PROCESSED_ATTR = 'data-gemini-to-notion-processed';

  let ui = null;
  let flows = null;
  let log = console;

  function matches(url) {
    return typeof url === 'string' && url.includes('https://gemini.google.com/');
  }

  function init(context) {
    ui = context.ui;
    flows = context.flows;
    log = context.log || console;
    initialize();
  }

  // =============================================================================
  // スレッド抽出（DOM依存）
  // =============================================================================

  function extractThread() {
    const messages = [];

    // DOM依存: より具体的なコンテナを優先し、なければ body にフォールバック。
    const conversationSelectors = [
      '.conversation-container',
      '.chat-container',
      '[class*="conversation"]',
      'main',
      '#chat-container'
    ];

    let conversationContainer = null;
    for (const selector of conversationSelectors) {
      conversationContainer = document.querySelector(selector);
      if (conversationContainer) break;
    }
    if (!conversationContainer) conversationContainer = document.body;

    // DOM依存: メッセージ要素は優先度順に探索する。
    const messageSelectors = [
      '[data-message-author-role]',
      '[data-author]',
      '.user-message, .model-response',
      '.message-container',
      '.chat-message'
    ];

    let messageElements = [];
    for (const selector of messageSelectors) {
      const elements = conversationContainer.querySelectorAll(selector);
      if (elements.length > 0) {
        messageElements = Array.from(elements);
        break;
      }
    }

    if (messageElements.length === 0) {
      log.warn('[Archiver] Gemini: メッセージ検出に失敗したためフォールバック抽出を使用');
      return extractThreadFallback();
    }

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

    const className = (element.className || '').toLowerCase();
    if (className.includes('user') || className.includes('human')) return 'user';
    if (className.includes('model') || className.includes('response')) return 'model';

    return 'unknown';
  }

  function extractMessageContent(element) {
    // DOM依存: より具体的な要素を優先して本文を取得する。
    const contentSelectors = [
      '.message-content',
      '.model-response-text',
      '.user-query-text',
      '[class*="content"]',
      '[class*="text"]'
    ];
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
  // プロンプト注入（DOM依存）
  // =============================================================================

  function injectPrompt(text) {
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
      // 入力欄が見つからないため、クリップボードへフォールバックする。
      log.warn('[Archiver] Gemini: input element not found, clipboard fallback');
      ui.showToast('入力欄が見つかりませんでした。テキストをクリップボードにコピーしました。', 'error');
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
  // Notion引用（現状はGemini専用）
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

    executeSearch();

    searchBtn.addEventListener('click', () => executeSearch(searchInput.value));
    searchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') executeSearch(searchInput.value);
    });
  }

  async function fetchAndInsertPageContent(page) {
    ui.showToast('ページ内容を取得中...', 'success');

    try {
      const response = await chrome.runtime.sendMessage({ action: 'getNotionPage', pageId: page.id });

      if (!response.success) {
        ui.showToast(`取得エラー: ${response.error}`, 'error');
        return;
      }

      const content = `【Notionからの引用】\nタイトル: ${page.title}\n---\n${response.content}\n---`;
      const success = injectPrompt(content);

      if (success) {
        ui.showToast('入力欄に貼り付けました', 'success');
      }
    } catch (error) {
      ui.showToast(`エラー: ${error.message}`, 'error');
    }
  }

  // =============================================================================
  // ボタン注入（DOM依存）
  // =============================================================================

  function injectButtonsToResponses() {
    const selectors = [
      '.model-response',
      '.response-container',
      '[data-message-author-role="1"]',
      '.message-container[data-author="model"]'
    ];

    selectors.forEach(selector => {
      document.querySelectorAll(selector).forEach(response => {
        if (response.hasAttribute(PROCESSED_ATTR)) return;
        if (!response.textContent || response.textContent.trim().length < 5) return;

        response.setAttribute(PROCESSED_ATTR, 'true');

        const btnContainer = document.createElement('div');
        btnContainer.className = 'gemini-to-notion-button-container';

        const importButton = document.createElement('button');
        importButton.className = BUTTON_CLASS;
        importButton.textContent = 'Notionから引用';
        importButton.title = 'Notionからページを選択して引用';
        importButton.style.background = 'linear-gradient(135deg, #2d2d2d, #000000)';
        importButton.addEventListener('click', handleNotionImport);

        const summarizeButton = document.createElement('button');
        summarizeButton.className = BUTTON_CLASS;
        summarizeButton.textContent = 'まとめを作成';
        summarizeButton.title = 'ここまでの会話を要約するプロンプトを入力欄に貼り付けます';
        summarizeButton.style.marginLeft = '8px';
        summarizeButton.style.background = 'linear-gradient(135deg, #7c3aed, #4f46e5)';
        summarizeButton.addEventListener('click', () => flows.handleInjectPrompt({
          client: api,
          ui,
          log,
          button: summarizeButton
        }));

        const saveButton = document.createElement('button');
        saveButton.className = BUTTON_CLASS;
        saveButton.textContent = 'Notionへ保存';
        saveButton.style.marginLeft = '8px';
        saveButton.addEventListener('click', () => flows.handleSaveResponse({
          client: api,
          ui,
          log,
          responseElement: response,
          button: saveButton
        }));

        btnContainer.appendChild(importButton);
        btnContainer.appendChild(summarizeButton);
        btnContainer.appendChild(saveButton);

        const actionsArea = response.querySelector('.response-actions, .message-actions');
        if (actionsArea) actionsArea.appendChild(btnContainer);
        else response.appendChild(btnContainer);
      });
    });
  }

  function removeGlobalButtons() {
    const globalBtn = document.getElementById('gemini-to-notion-summarize-btn');
    if (globalBtn) globalBtn.remove();
  }

  const observer = new MutationObserver(() => {
    clearTimeout(window.geminiToNotionDebounce);
    window.geminiToNotionDebounce = setTimeout(() => {
      injectButtonsToResponses();
      removeGlobalButtons();
    }, 500);
  });

  function initialize() {
    log.info('Gemini client initialized');
    removeGlobalButtons();
    const oldImportBtn = document.getElementById('gemini-to-notion-import-btn');
    if (oldImportBtn) oldImportBtn.remove();

    injectButtonsToResponses();
    observer.observe(document.body, { childList: true, subtree: true });
  }

  function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  function extractResponseText(responseElement) {
    return extractMessageContent(responseElement);
  }

  function extractPromptText(responseElement) {
    const prevElement = responseElement ? responseElement.previousElementSibling : null;
    if (!prevElement) return 'プロンプト不明';
    return extractMessageContent(prevElement) || 'Geminiの回答';
  }

  const api = {
    id: CLIENT_ID,
    displayName: 'Gemini',
    matches,
    init,
    extractThread,
    extractResponseText,
    extractPromptText,
    injectPrompt
  };

  global.ArchiverClients = global.ArchiverClients || {};
  global.ArchiverClients[CLIENT_ID] = api;
})(typeof window !== 'undefined' ? window : globalThis);
