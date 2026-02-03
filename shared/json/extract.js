/**
 * ファイル: shared/json/extract.js
 * 役割: 自由形式テキストからJSONを抽出する（ブラウザAPI非依存）。
 * 入力: text（string）
 * 出力: { ok: true, jsonText, data } | { ok: false, reason }
 * 呼び出し元: shared/flows/exportFlow.js と tests。
 */
(function (global) {
  function extractJsonFromText(text) {
    if (typeof text !== 'string' || text.trim().length === 0) {
      return { ok: false, reason: 'empty_text' };
    }

    // ルール1: ```json ...``` ブロックがあれば最優先。
    const jsonFenceMatch = text.match(/```json\s*([\s\S]*?)\s*```/i);
    let jsonText = jsonFenceMatch && jsonFenceMatch[1] ? jsonFenceMatch[1] : null;

    // ルール2: JSONフェンスがない場合は最初の {...} を採用。
    if (!jsonText) {
      const braceMatch = text.match(/\{[\s\S]*?\}/);
      if (braceMatch) jsonText = braceMatch[0];
    }

    if (!jsonText) {
      return { ok: false, reason: 'json_not_found' };
    }

    try {
      const data = JSON.parse(jsonText);
      return { ok: true, jsonText, data };
    } catch (error) {
      return { ok: false, reason: 'invalid_json' };
    }
  }

  // ブラウザとNodeテストの両方で参照できるよう公開する。
  if (typeof global !== 'undefined') {
    global.ArchiverJson = global.ArchiverJson || {};
    global.ArchiverJson.extractJsonFromText = extractJsonFromText;
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { extractJsonFromText };
  }
})(typeof window !== 'undefined' ? window : globalThis);
