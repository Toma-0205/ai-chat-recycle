/**
 * ファイル: shared/ui/preview.js
 * 役割: Notion保存前のプレビュー/編集ダイアログを表示する。
 * 入力: data, onSave
 * 出力: DOMへのダイアログ追加/削除。
 * 呼び出し元: content.js（共通UI経由）。
 */
(function (global) {
  function openPreviewDialog(data, onSave) {
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

  global.ArchiverUI = global.ArchiverUI || {};
  global.ArchiverUI.openPreviewDialog = openPreviewDialog;
})(typeof window !== 'undefined' ? window : globalThis);
