/**
 * ファイル: shared/flows/exportFlow.js
 * 役割: クライアントアダプタを使って「プロンプト注入 + 保存フロー」を統括する。
 * 入力: { client, ui, log, button, responseElement }
 * 出力: UIの副作用 + chrome.runtime メッセージ。
 * 呼び出し元: ai_clients/STAR/client.js
 */
(function (global) {
  const BUTTON_TEXT = {
    defaultSave: 'Notionへ保存',
    checking: '確認中...',
    saving: '保存中...',
    injecting: '抽出中...',
    injected: '✓ 貼付完了',
    saved: '✓ 保存済み'
  };

  function setButtonState(button, { text, disabled }) {
    if (!button) return;
    if (typeof text === 'string') button.textContent = text;
    if (typeof disabled === 'boolean') button.disabled = disabled;
  }

  function resetButton(button, text = BUTTON_TEXT.defaultSave) {
    if (!button) return;
    button.textContent = text;
    button.disabled = false;
  }

  function buildSummaryPrompt(messages) {
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

  async function handleInjectPrompt({ client, ui, log, button }) {
    const originalText = button ? button.textContent : '';
    setButtonState(button, { text: BUTTON_TEXT.injecting, disabled: true });

    setTimeout(() => {
      const messages = client.extractThread();
      if (!messages || messages.length === 0) {
        // フォールバック: DOMセレクタが合わず、プロンプト生成ができない。
        log.warn('[Archiver] No messages found during extraction');
        ui.showToast('会話が見つかりませんでした', 'error');
        resetButton(button, originalText);
        return;
      }

      const prompt = buildSummaryPrompt(messages);
      const success = client.injectPrompt(prompt);

      if (success) {
        ui.showToast('入力欄にプロンプトを貼り付けました。送信してください。', 'success');
        setButtonState(button, { text: BUTTON_TEXT.injected });
        setTimeout(() => {
          resetButton(button, originalText);
        }, 2000);
      } else {
        // 注入失敗（入力欄未検出）。クリップボードにコピー済み。
        log.warn('[Archiver] Prompt injection failed, clipboard fallback used');
        resetButton(button, originalText);
      }
    }, 100);
  }

  async function handleSaveResponse({ client, ui, log, responseElement, button }) {
    setButtonState(button, { text: BUTTON_TEXT.checking, disabled: true });

    try {
      const credentialCheck = await chrome.runtime.sendMessage({ action: 'getCredentials' });
      if (!credentialCheck.hasCredentials) {
        // Notionの認証情報が未設定のため中断する。
        log.warn('[Archiver] Notion credentials missing');
        // ui.showToast('Notion設定が未完了です。オプション画面から設定してください。', 'error');
        if (ui.showConnectDialog) {
          ui.showConnectDialog();
        } else {
          ui.showToast('Notion設定が未完了です。オプション画面から設定してください。', 'error');
        }
        resetButton(button);
        return;
      }

      const contentText = client.extractResponseText(responseElement);
      if (!contentText || !contentText.trim()) {
        // 応答テキストが取得できない（DOMセレクタ不一致の可能性）。
        log.warn('[Archiver] Empty response text, aborting save');
        ui.showToast('テキストが空です', 'error');
        resetButton(button);
        return;
      }

      const extracted = global.ArchiverJson.extractJsonFromText(contentText);
      let data = extracted.ok ? extracted.data : null;

      if (!data) {
        // フォールバック: JSONが無い/壊れているため最低限のペイロードで保存する。
        log.warn('[Archiver] JSON extraction failed:', extracted.reason);
        const promptText = client.extractPromptText(responseElement) || 'Geminiの回答';
        data = {
          title: promptText.substring(0, 50),
          summary: contentText.substring(0, 100) + '...',
          content: contentText,
          todos: '',
          date: new Date().toISOString().split('T')[0]
        };
      }

      ui.showEditablePreviewDialog(data, async (finalData) => {
        setButtonState(button, { text: BUTTON_TEXT.saving });
        const result = await chrome.runtime.sendMessage({
          action: 'saveToNotion',
          data: finalData
        });

        if (result.success) {
          ui.showToast('Notionに保存しました ✓', 'success', result.pageUrl);
          if (button) {
            button.textContent = BUTTON_TEXT.saved;
            button.classList.add('saved');
          }
        } else {
          log.error('[Archiver] Notion save failed:', result.error);
          ui.showToast(`保存エラー: ${result.error}`, 'error');
          resetButton(button);
        }
      });

      resetButton(button);
    } catch (error) {
      log.error('[Archiver] Save flow error:', error);
      ui.showToast(`エラー: ${error.message}`, 'error');
      resetButton(button);
    }
  }

  global.ArchiverFlows = {
    buildSummaryPrompt,
    handleInjectPrompt,
    handleSaveResponse
  };
})(typeof window !== 'undefined' ? window : globalThis);
