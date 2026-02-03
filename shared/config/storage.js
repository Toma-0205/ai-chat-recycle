/**
 * ファイル: shared/config/storage.js
 * 役割: chrome.storage.local の設定を集約する。
 * 入力: keys（activeClientId）
 * 出力: 既定値を含む保存済み設定。
 * 呼び出し元: content.js（実行時）と options.js（設定UI）。
 */
(function (global) {
  const DEFAULTS = {
    activeClientId: 'auto'
  };

  async function getActiveClientId() {
    if (!global.chrome || !global.chrome.storage) {
    // 拡張機能コンテキスト外（テストや通常ページ）では既定値を返す。
      return DEFAULTS.activeClientId;
    }
    const result = await chrome.storage.local.get(['activeClientId']);
    return result.activeClientId || DEFAULTS.activeClientId;
  }

  async function setActiveClientId(activeClientId) {
    if (!global.chrome || !global.chrome.storage) return;
    await chrome.storage.local.set({ activeClientId });
  }

  global.ArchiverConfig = {
    DEFAULTS,
    getActiveClientId,
    setActiveClientId
  };
})(typeof window !== 'undefined' ? window : globalThis);
