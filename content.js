/**
 * content.js
 * 役割: content script のエントリ（クライアント選択 + 配線）。
 * 入力: chrome.storage（activeClientId）+ 現在のURL
 * 出力: ページに合致したクライアントを初期化。
 * 呼び出し元: manifest.json の content_scripts。
 */
(() => {
  // 二重注入ガード: content script が複数回読み込まれても初期化は一度だけ行う。
  if (window.__notionArchiverInjected) return;
  window.__notionArchiverInjected = true;

  const log = console;

  function hasRequiredModules() {
    return (
      window.ArchiverRegistry &&
      window.ArchiverConfig &&
      window.ArchiverFlows &&
      window.ArchiverUI
    );
  }

  async function bootstrap() {
    if (!hasRequiredModules()) {
      log.error(
        "[Archiver] registry/config/flows/ui が見つかりません。manifest の読み込み順を確認してください。",
      );
      alert("【Gemini to Notion】\n拡張機能の読み込みに失敗しました。\n正しく動作しない可能性があるため、ページを再読み込みしてください。");
      return;
    }

    const activeClientId = await window.ArchiverConfig.getActiveClientId();
    if (activeClientId === "off") {
      log.info("[Archiver] inactive (off)");
      return;
    }

    const { client, resolvedClientId } = window.ArchiverRegistry.resolveClient(
      activeClientId,
      location.href,
    );

    // デバッグ用: 初期化時に一度だけ現在の選択状態を出す。
    log.log("[Archiver] init", {
      activeClientId,
      resolvedClientId,
      host: location.host,
    });

    if (!client) {
      const host = location.host || "unknown";
      window.ArchiverUI.showToast(`未対応のページです（${host}）`, "error");
      return;
    }

    if (activeClientId === "auto") {
      window.ArchiverUI.showToast(resolvedClientId || "unknown", "success");
    }

    if (!client.matches(location.href)) {
      const pageClientId = resolvedClientId || "unknown";
      window.ArchiverUI.showToast(
        `対象外：設定=${activeClientId} / ページ=${pageClientId}`,
        "error",
      );
      return;
    }

    client.init({
      flows: window.ArchiverFlows,
      ui: {
        showToast: window.ArchiverUI.showToast,
        showEditablePreviewDialog: window.ArchiverUI.openPreviewDialog,
        showConnectDialog: window.ArchiverUI.showConnectDialog,
      },
      log,
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bootstrap);
  } else {
    bootstrap();
  }
})();
