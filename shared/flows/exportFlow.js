/**
 * ファイル: shared/flows/exportFlow.js
 * 役割: クライアントアダプタを使って「プロンプト注入 + 保存フロー」を統括する。
 * 入力: { client, ui, log, button, responseElement }
 * 出力: UIの副作用 + chrome.runtime メッセージ。
 * 呼び出し元: ai_clients/STAR/client.js
 */
(function (global) {
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
    if (button) {
      button.textContent = '抽出中...';
      button.disabled = true;
    }

    setTimeout(() => {
      const messages = client.extractThread();
      if (!messages || messages.length === 0) {
        // フォールバック: DOMセレクタが合わず、プロンプト生成ができない。
        log.warn('[Archiver] No messages found during extraction');
        ui.showToast('会話が見つかりませんでした', 'error');
        if (button) {
          button.textContent = originalText;
          button.disabled = false;
        }
        return;
      }

      const prompt = buildSummaryPrompt(messages);
      const success = client.injectPrompt(prompt);

      if (success) {
        ui.showToast('入力欄にプロンプトを貼り付けました。送信してください。', 'success');
        if (button) {
          button.textContent = '✓ 貼付完了';
          setTimeout(() => {
            button.textContent = originalText;
            button.disabled = false;
          }, 2000);
        }
      } else {
        // 注入失敗（入力欄未検出）。クリップボードにコピー済み。
        log.warn('[Archiver] Prompt injection failed, clipboard fallback used');
        if (button) {
          button.textContent = originalText;
          button.disabled = false;
        }
      }
    }, 100);
  }

  async function handleSaveResponse({ client, ui, log, responseElement, button }) {
    if (button) {
      button.disabled = true;
      button.textContent = '確認中...';
    }

    try {
      const credentialCheck = await chrome.runtime.sendMessage({ action: 'getCredentials' });
      if (!credentialCheck.hasCredentials) {
        // Notionの認証情報が未設定のため中断する。
        log.warn('[Archiver] Notion credentials missing');
        ui.showToast('Notion設定が未完了です。オプション画面から設定してください。', 'error');
        if (button) {
          button.disabled = false;
          button.textContent = 'Notionへ保存';
        }
        return;
      }

      const contentText = client.extractResponseText(responseElement);
      if (!contentText || !contentText.trim()) {
        // 応答テキストが取得できない（DOMセレクタ不一致の可能性）。
        log.warn('[Archiver] Empty response text, aborting save');
        ui.showToast('テキストが空です', 'error');
        if (button) {
          button.disabled = false;
          button.textContent = 'Notionへ保存';
        }
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
        if (button) button.textContent = '保存中...';
        const result = await chrome.runtime.sendMessage({
          action: 'saveToNotion',
          data: finalData
        });

        if (result.success) {
          ui.showToast('Notionに保存しました ✓', 'success', result.pageUrl);
          if (button) {
            button.textContent = '✓ 保存済み';
            button.classList.add('saved');
          }
        } else {
          log.error('[Archiver] Notion save failed:', result.error);
          ui.showToast(`保存エラー: ${result.error}`, 'error');
          if (button) {
            button.disabled = false;
            button.textContent = 'Notionへ保存';
          }
        }
      });

      if (button) {
        button.disabled = false;
        button.textContent = 'Notionへ保存';
      }
    } catch (error) {
      log.error('[Archiver] Save flow error:', error);
      ui.showToast(`エラー: ${error.message}`, 'error');
      if (button) {
        button.disabled = false;
        button.textContent = 'Notionへ保存';
      }
    }
  }

  global.ArchiverFlows = {
    buildSummaryPrompt,
    handleInjectPrompt,
    handleSaveResponse
  };
})(typeof window !== 'undefined' ? window : globalThis);
