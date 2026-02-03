/**
 * ファイル: ai_clients/chatgpt/client.js
 * 役割: ChatGPTページ用のスタブアダプタ（手動切替の検証用）。
 * 入力: URL + context
 * 出力: ログ/トーストのみ（DOM抽出は未実装）。
 * 呼び出し元: content.js（ArchiverRegistry 経由）。
 */
(function (global) {
  const CLIENT_ID = 'chatgpt';

  let ui = null;
  let log = console;
  const STUB_BUTTON_ID = 'notion-archiver-chatgpt-stub-btn';

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
    log = context.log || console;

    // スタブ動作: 注入と手動切替が動いていることだけ確認する。
    log.info('[Archiver] ChatGPT client active (stub)');
    injectButtons();
  }

  // 未実装: ChatGPTのDOM抽出 + プロンプト注入を実装する。
  function extractThread() {
    log.warn('[Archiver] ChatGPT extractThread is not implemented yet');
    return [];
  }

  function extractResponseText() {
    log.warn('[Archiver] ChatGPT extractResponseText is not implemented yet');
    return '';
  }

  function extractPromptText() {
    log.warn('[Archiver] ChatGPT extractPromptText is not implemented yet');
    return '';
  }

  function injectPrompt() {
    log.warn('[Archiver] ChatGPT injectPrompt is not implemented yet');
    safeToast('ChatGPTの注入処理は未実装です', 'error');
    return false;
  }

  function injectButtons() {
    if (document.getElementById(STUB_BUTTON_ID)) return;

    const button = document.createElement('button');
    button.id = STUB_BUTTON_ID;
    button.textContent = '仮ChatGPT用ボタン';
    button.title = '仮ChatGPT用ボタン';
    button.style.position = 'fixed';
    button.style.right = '16px';
    button.style.bottom = '16px';
    button.style.zIndex = '10001';
    button.style.padding = '8px 12px';
    button.style.borderRadius = '999px';
    button.style.border = '1px solid rgba(255,255,255,0.15)';
    button.style.background = 'rgba(0,0,0,0.75)';
    button.style.color = '#fff';
    button.style.fontSize = '12px';
    button.style.fontWeight = '600';
    button.style.cursor = 'pointer';

    button.addEventListener('click', () => {
      safeToast('スタブボタンをクリックしました', 'success');
    });

    document.body.appendChild(button);
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
