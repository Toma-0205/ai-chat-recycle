/**
 * ファイル: shared/ui/toast.js
 * 役割: 画面右下のトースト通知を表示する。
 * 入力: message, type, linkUrl
 * 出力: DOMへのトースト追加/更新。
 * 呼び出し元: content.js（共通UI経由）。
 */
(function (global) {
  function showToast(message, type = 'success', linkUrl = null) {
    const existingToast = document.querySelector('.gemini-to-notion-toast');
    if (existingToast) existingToast.remove();

    const toast = document.createElement('div');
    toast.className = `gemini-to-notion-toast ${type}`;
    // 右下固定のボタンと重ならないよう、トーストを少し上にずらす。
    toast.style.right = '16px';
    toast.style.bottom = '72px';
    // 小型化（控えめ表示）
    toast.style.fontSize = '12px';
    toast.style.padding = '8px 10px';
    toast.style.borderRadius = '12px';
    toast.style.maxWidth = '280px';

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
    }, 1800);
  }

  global.ArchiverUI = global.ArchiverUI || {};
  global.ArchiverUI.showToast = showToast;
})(typeof window !== 'undefined' ? window : globalThis);
