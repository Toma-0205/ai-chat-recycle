/**
 * ファイル: ai_clients/registry.js
 * 役割: activeClientId からクライアントを解決し、登録済み一覧を返す。
 * 入力: activeClientId, url
 * 出力: { client, resolvedClientId }
 * 呼び出し元: content.js
 */
(function (global) {
  function getClientById(id) {
    const clients = global.ArchiverClients || {};
    return clients[id] || null;
  }

  function listClientIds() {
    const clients = global.ArchiverClients || {};
    return Object.keys(clients);
  }

  function resolveClient(activeClientId, url) {
    if (activeClientId === 'auto') {
      const ids = listClientIds();
      for (const id of ids) {
        const client = getClientById(id);
        if (client && client.matches(url)) {
          return { client, resolvedClientId: id };
        }
      }
      return { client: null, resolvedClientId: 'unsupported' };
    }
    return { client: getClientById(activeClientId), resolvedClientId: activeClientId };
  }

  global.ArchiverRegistry = {
    getClientById,
    listClientIds,
    resolveClient
  };
})(typeof window !== 'undefined' ? window : globalThis);
