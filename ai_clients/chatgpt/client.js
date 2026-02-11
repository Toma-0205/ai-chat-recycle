/**
 * ファイル: ai_clients/chatgpt/client.js
 * 役割: ChatGPTページ用のスタブアダプタ（手動切替の検証用）。
 * 入力: URL + context
 * 出力: ログ/トーストのみ（DOM抽出は未実装）。
 * 呼び出し元: content.js（ArchiverRegistry 経由）。
 */
(function (global) {
  const CLIENT_ID = 'chatgpt';
  const INJECTED_ATTR = 'data-archiver-injected';
  const UI_ATTR = 'data-archiver-ui';
  const BUTTON_CLASS = 'gemini-to-notion-button';
  const BUTTON_CONTAINER_CLASS = 'gemini-to-notion-button-container';

  let ui = null;
  let flows = null;
  let log = console;
  const STUB_BUTTON_ID = 'notion-archiver-chatgpt-stub-btn';
  let observer = null;
  let debounceTimer = null;

  function safeToast(message, type = 'success') {
    if (ui && ui.showToast) {
      ui.showToast(message, type);
    }
  }

  function matches(url) {
    return typeof url === 'string' && (
      url.includes('https://chatgpt.com/') ||
      url.includes('https://chat.openai.com/')
    );
  }

  function init(context) {
    ui = context.ui;
    flows = context.flows;
    log = context.log || console;

    // スタブ動作: 注入と手動切替が動いていることだけ確認する。
    log.info('[Archiver] ChatGPT client active (stub)');
    injectButtons();
    startObserver();
  }

  // 未実装: ChatGPTのDOM抽出 + プロンプト注入を実装する。
  function extractThread() {
    const messages = [];
    const main = document.querySelector('main') || document.querySelector('[role="main"]');
    if (!main) {
      log.warn('[Archiver] ChatGPT extractThread: main not found');
      return [];
    }

    const messageElements = collectMessageElements(main);
    if (messageElements.length === 0) {
      log.warn('[Archiver] ChatGPT extractThread: message elements not found');
      return [];
    }

    let fallbackRole = 'user';
    let usedFallback = false;

    messageElements.forEach((element, index) => {
      if (element.closest(`[${UI_ATTR}="1"]`)) return;

      const text = extractMessageText(element);
      if (!text) return;

      let role = getMessageRole(element);
      if (!role) {
        usedFallback = true;
        role = fallbackRole;
        fallbackRole = fallbackRole === 'user' ? 'assistant' : 'user';
        log.info(`[Archiver] ChatGPT extractThread: fallback推定 role=${role} index=${index}`);
      }

      messages.push({ role, text, content: text });
    });

    if (usedFallback) {
      log.warn('[Archiver] ChatGPT extractThread: role判定に data-message-author-role が無いため fallback推定 を使用');
    }

    return messages;
  }

  function extractResponseText(source) {
    const { block, reason } = findResponseBlock(source);
    if (!block) {
      log.warn(`[Archiver] ChatGPT extractResponseText failed: reason=${reason || 'block_not_found'}`);
      return '';
    }

    const text = extractBlockText(block);
    if (!text) {
      log.warn('[Archiver] ChatGPT extractResponseText failed: reason=empty_text');
      return '';
    }

    log.info(`[Archiver] ChatGPT extractResponseText ok length=${text.length}`);
    return text;
  }

  function extractPromptText() {
    log.warn('[Archiver] ChatGPT extractPromptText is not implemented yet');
    return '';
  }

  function injectPrompt(promptText) {
    const promptEditable = document.querySelector('#prompt-textarea[contenteditable="true"]');
    if (promptEditable) {
      log.log('[Archiver] ChatGPT injectPrompt: using #prompt-textarea[contenteditable]');
      promptEditable.focus();
      // ProseMirror系は textContent だけだと反映されないことがあるため execCommand も併用。
      promptEditable.textContent = promptText;
      try {
        document.execCommand('selectAll', false, null);
        document.execCommand('insertText', false, promptText);
      } catch (error) {
        log.warn('[Archiver] ChatGPT injectPrompt: execCommand failed', error);
      }
      promptEditable.dispatchEvent(new Event('input', { bubbles: true }));
      safeToast('入力欄に入れた', 'success');
      return true;
    }

    const textareaList = Array.from(document.querySelectorAll('textarea'));
    const textarea = textareaList.find(el => {
      const style = window.getComputedStyle(el);
      return style.display !== 'none';
    });
    if (textarea) {
      log.log('[Archiver] ChatGPT injectPrompt: using textarea');
      textarea.value = promptText;
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
      textarea.focus();
      safeToast('入力欄に入れた', 'success');
      return true;
    }

    const editable = document.querySelector('[contenteditable="true"]');
    if (editable) {
      log.log('[Archiver] ChatGPT injectPrompt: using contenteditable');
      editable.focus();
      editable.textContent = promptText;
      try {
        document.execCommand('selectAll', false, null);
        document.execCommand('insertText', false, promptText);
      } catch (error) {
        log.warn('[Archiver] ChatGPT injectPrompt: execCommand failed', error);
      }
      editable.dispatchEvent(new Event('input', { bubbles: true }));
      safeToast('入力欄に入れた', 'success');
      return true;
    }

    log.warn('[Archiver] ChatGPT injectPrompt: input element not found, clipboard fallback');
    navigator.clipboard.writeText(promptText);
    safeToast('クリップボードにコピーした', 'info');
    return false;
  }

  // =============================================================================
  // Notion引用（Geminiと同等のUI/挙動）
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

  function injectButtons() {
    const assistantBlocks = findAssistantBlocks();
    if (!assistantBlocks.length) return;

    assistantBlocks.forEach((block) => {
      if (isAlreadyInjected(block)) return;
      if (!block.textContent || block.textContent.trim().length < 10) return;

      const btnContainer = document.createElement('div');
      btnContainer.className = BUTTON_CONTAINER_CLASS;
      btnContainer.setAttribute(UI_ATTR, '1');
      // Match ChatGPT message width to avoid drifting outside the prose area.
      btnContainer.style.maxWidth = '640px';
      btnContainer.style.marginLeft = 'auto';
      btnContainer.style.marginRight = 'auto';

      const importButton = document.createElement('button');
      importButton.className = BUTTON_CLASS;
      importButton.textContent = 'Notionから引用';
      importButton.title = 'Notionからページを選択して引用';
      importButton.style.background = 'linear-gradient(135deg, #2d2d2d, #000000)';
      importButton.addEventListener('click', handleNotionImport);

      const summarizeButton = document.createElement('button');
      summarizeButton.className = BUTTON_CLASS;
      summarizeButton.textContent = 'まとめ作成';
      summarizeButton.title = 'まとめ作成';
      summarizeButton.addEventListener('click', () => {
        log.info('[Archiver] ChatGPT clicked: summarize');
        if (!flows || !flows.handleInjectPrompt) {
          log.warn('[Archiver] ChatGPT summarize failed: reason=flow_unavailable');
          safeToast('フローが見つかりません', 'error');
          return;
        }

        flows.handleInjectPrompt({
          client: api,
          ui,
          log,
          button: summarizeButton,
          onResult: (result) => {
            if (!result || !result.ok) {
              if (result && result.reason === 'thread_not_found') {
                log.warn('[Archiver] ChatGPT summarize failed: reason=thread取得失敗');
                return;
              }

              if (result && result.reason === 'clipboard_fallback') {
                log.warn('[Archiver] ChatGPT summarize failed: reason=注入失敗');
                log.warn('[Archiver] ChatGPT summarize failed: reason=clipboard_fallback');
                return;
              }

              log.warn('[Archiver] ChatGPT summarize failed: reason=unknown');
              return;
            }

            const length = result.length || 0;
            log.info(`[Archiver] ChatGPT summarize injected length=${length}`);
          }
        });
      });

      const saveButton = document.createElement('button');
      saveButton.className = BUTTON_CLASS;
      saveButton.textContent = 'Notionへ保存';
      saveButton.title = 'Notionへ保存';
      saveButton.addEventListener('click', (event) => {
        if (!flows || !flows.handleSaveResponse) {
          log.warn('[Archiver] ChatGPT save failed: reason=flow_unavailable');
          safeToast('フローが見つかりません', 'error');
          return;
        }

        const { block, reason } = findResponseBlock(event);
        if (!block) {
          log.warn(`[Archiver] ChatGPT save failed: reason=${reason || 'block_not_found'}`);
          safeToast('返信ブロックが見つかりません', 'error');
          return;
        }

        flows.handleSaveResponse({
          client: api,
          ui,
          log,
          responseElement: block,
          button: saveButton
        });
      });

      btnContainer.appendChild(importButton);
      btnContainer.appendChild(summarizeButton);
      btnContainer.appendChild(saveButton);

      block.appendChild(btnContainer);
      block.setAttribute(INJECTED_ATTR, '1');
    });
  }

  function findAssistantBlocks() {
    const primary = Array.from(
      document.querySelectorAll('[data-message-author-role="assistant"]'),
    );
    if (primary.length > 0) return normalizeMessageBlocks(primary);

    const main = document.querySelector('main') || document.querySelector('[role="main"]');
    if (!main) return [];

    const candidates = Array.from(
      main.querySelectorAll('article, section, div'),
    );

    const likelyMessages = candidates.filter((el) => isLikelyMessage(el));
    return normalizeMessageBlocks(likelyMessages);
  }

  function collectMessageElements(main) {
    const uiSelector = `[${UI_ATTR}="1"]`;
    const roleElements = Array.from(
      main.querySelectorAll('[data-message-author-role]'),
    ).filter((el) => !el.closest(uiSelector));
    if (roleElements.length > 0) return roleElements;

    const candidates = Array.from(
      main.querySelectorAll('article, section, div'),
    ).filter((el) => !el.closest(uiSelector));

    return candidates.filter((el) => isLikelyMessage(el));
  }

  function getMessageRole(element) {
    const authorRole = element.getAttribute('data-message-author-role');
    if (authorRole === 'user') return 'user';
    if (authorRole === 'assistant') return 'assistant';
    if (authorRole === 'system') return 'assistant';
    return null;
  }

  function findResponseBlock(source) {
    let target = null;
    if (source && source.target instanceof Element) {
      target = source.target;
    } else if (source instanceof Element) {
      target = source;
    } else if (source && source.nodeType === 1) {
      target = source;
    }

    if (!target) {
      return { block: null, reason: 'target_not_found' };
    }

    const assistantBlock = target.closest('[data-message-author-role="assistant"]');
    if (assistantBlock) {
      return { block: assistantBlock, reason: 'assistant_role' };
    }

    const articleBlock = target.closest('article');
    if (articleBlock) {
      return { block: articleBlock, reason: 'closest_article' };
    }

    const main = document.querySelector('main') || document.querySelector('[role="main"]');
    let current = target;
    while (current && current !== main) {
      if (isLikelyMessage(current)) {
        return { block: current, reason: 'likely_message' };
      }
      current = current.parentElement;
    }

    return { block: null, reason: 'no_fallback_match' };
  }

  function extractBlockText(block) {
    const clone = block.cloneNode(true);
    clone.querySelectorAll(`[${UI_ATTR}="1"]`).forEach((el) => el.remove());
    const text = (clone.innerText || clone.textContent || '').trim();
    return text.replace(/\s+/g, ' ').trim();
  }

  function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  function extractMessageText(element) {
    const uiSelector = `[${UI_ATTR}="1"]`;
    const parts = [];
    const walker = document.createTreeWalker(
      element,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode(node) {
          if (!node || !node.parentElement) return NodeFilter.FILTER_REJECT;
          if (node.parentElement.closest(uiSelector)) return NodeFilter.FILTER_REJECT;
          if (!node.textContent || !node.textContent.trim()) return NodeFilter.FILTER_REJECT;
          return NodeFilter.FILTER_ACCEPT;
        }
      }
    );

    let current = walker.nextNode();
    while (current) {
      parts.push(current.textContent.trim());
      current = walker.nextNode();
    }

    if (parts.length === 0) return '';
    return parts.join(' ').replace(/\s+/g, ' ').trim();
  }

  function isAlreadyInjected(block) {
    if (!block || block.nodeType !== 1) return true;
    if (block.getAttribute(INJECTED_ATTR) === '1') return true;
    if (block.querySelector(`[${UI_ATTR}="1"]`)) return true;

    const injectedAncestor = block.closest(`[${INJECTED_ATTR}="1"]`);
    if (injectedAncestor && injectedAncestor !== block) return true;

    if (block.closest(`[${UI_ATTR}="1"]`)) return true;
    return false;
  }

  function normalizeMessageBlocks(blocks) {
    const uniqueBlocks = [];
    const seen = new Set();

    blocks.forEach((block) => {
      if (!block || seen.has(block)) return;
      seen.add(block);
      uniqueBlocks.push(block);
    });

    return uniqueBlocks.filter((block) => {
      return !uniqueBlocks.some((other) => other !== block && other.contains(block));
    });
  }

  function isLikelyMessage(el) {
    if (!el || el.nodeType !== 1) return false;
    if (el.closest('form')) return false;
    if (el.querySelector('textarea, [contenteditable="true"]')) return false;
    const text = (el.textContent || '').trim();
    if (text.length < 80) return false;
    return true;
  }

  function startObserver() {
    if (observer) return;
    observer = new MutationObserver(() => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        injectButtons();
      }, 300);
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  const api = {
    id: CLIENT_ID,
    displayName: 'ChatGPT',
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
