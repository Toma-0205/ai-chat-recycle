/**
 * Gemini to Notion Knowledge Archiver v4.2 - Background Service Worker
 * プロパティ依存を排除した保存ロジック（エラー回避版）
 */

const NOTION_API_ENDPOINT = 'https://api.notion.com/v1/pages';
const NOTION_API_VERSION = '2022-06-28';

// =============================================================================
// Notion API ページ作成
// =============================================================================

function textToNotionBlocks(text) {
  if (!text) return [];
  const paragraphs = text.split(/\n\n+/);
  return paragraphs.map(paragraph => {
    const truncatedText = paragraph.trim().substring(0, 2000);
    return {
      object: 'block', type: 'paragraph',
      paragraph: { rich_text: [{ type: 'text', text: { content: truncatedText } }] }
    };
  }).filter(block => block.paragraph.rich_text[0].text.content.length > 0);
}

async function createNotionPage(data) {
  const { notionApiKey, notionDatabaseId } = await chrome.storage.local.get(['notionApiKey', 'notionDatabaseId']);
  
  if (!notionApiKey || !notionDatabaseId) {
    throw new Error('Notion API KeyまたはDatabase IDが設定されていません。');
  }
  
  // ページ本文のブロック構築
  // プロパティではなく本文に情報を集約する（スキーマエラー回避のため）
  const children = [
    // 概要セクション
    { object: 'block', type: 'heading_2', heading_2: { rich_text: [{ type: 'text', text: { content: '📝 概要' } }] } },
    { object: 'block', type: 'paragraph', paragraph: { rich_text: [{ type: 'text', text: { content: data.summary || '（概要なし）' } }] } },
    
    // TODOセクション
    { object: 'block', type: 'heading_2', heading_2: { rich_text: [{ type: 'text', text: { content: '✅ やること' } }] } },
    { object: 'block', type: 'paragraph', paragraph: { rich_text: [{ type: 'text', text: { content: data.todos || '特になし' } }] } },
    
    // 日付情報
    { object: 'block', type: 'paragraph', paragraph: { rich_text: [{ type: 'text', text: { content: `📅 日付: ${data.date || new Date().toISOString().split('T')[0]}` }, annotations: { color: "gray" } }] } },
    
    { object: 'block', type: 'divider', divider: {} },

    // 議事録（本文）セクション
    { object: 'block', type: 'heading_2', heading_2: { rich_text: [{ type: 'text', text: { content: '📋 議事録・詳細' } }] } },
    ...textToNotionBlocks(data.content)
  ];
  
  // プロパティ（最低限の構成）
  // 多くのデータベースでタイトルプロパティは 'Name' か '名前' か 'title'
  // まずは 'ID' からデータベース情報を取得してプロパティ名を確認するのがベストだが、
  // 簡易的に 'Name' (英語デフォルト) と '名前' (日本語デフォルト) の両方を試すわけにはいかない（APIエラーになる）
  // したがって、ユーザーに最も一般的な 'Name' を使用するか、汎用的なペイロード構築が必要。
  
  // タイトルプロパティのキーを特定するのは難しいため、
  // ここでは最も安全な策として、タイトルのみを設定し、他のカスタムプロパティ（回答、概要など）は除外する。
  // 本文(children)にあらゆる情報を詰め込むことで、プロパティ不足エラーを回避する。
  
  // 注意: タイトルのキーがデータベースによって異なる（'Name', '名前', 'Title'など）
  // APIでデータベース情報を取得してタイトルキーを特定するロジックを追加
  
  let titleKey = 'Name'; // デフォルト
  
  try {
    // データベース情報を取得してプロパティ名を確認
    const dbResponse = await fetch(`https://api.notion.com/v1/databases/${notionDatabaseId}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${notionApiKey}`,
        'Notion-Version': NOTION_API_VERSION
      }
    });
    
    if (dbResponse.ok) {
      const dbData = await dbResponse.json();
      // titleタイプのプロパティを探す
      const titleProp = Object.entries(dbData.properties).find(([key, prop]) => prop.type === 'title');
      if (titleProp) {
        titleKey = titleProp[0]; // '名前' や 'Name' などを取得
      }
    }
  } catch (e) {
    console.error('Database info fetch error:', e);
    // エラー時はデフォルト 'Name' またはユーザーの環境に合わせて '名前' をトライ
    // 日本語環境のユーザーが多いと想定して '名前' をフォールバックにする手もあるが
    // 既存のエラーが '回答 is not a property...' なので、タイトル以外のプロパティが原因。
    // タイトルのキー自体はエラーに出ていない可能性があるが、念のため動的取得する。
  }

  const properties = {};
  properties[titleKey] = {
    title: [{ text: { content: (data.title || 'Gemini会話まとめ').substring(0, 100) } }]
  };
  
  // カスタムプロパティ（回答、概要、時期、やること）は
  // ユーザーのデータベースに存在しないことが確定したため、設定しない。
  // 全て本文 (children) に入れたのでデータロスはない。

  const payload = {
    parent: { database_id: notionDatabaseId },
    properties,
    children
  };
  
  const response = await fetch(NOTION_API_ENDPOINT, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${notionApiKey}`,
      'Content-Type': 'application/json',
      'Notion-Version': NOTION_API_VERSION
    },
    body: JSON.stringify(payload)
  });
  
  const responseData = await response.json();
  
  if (!response.ok) {
    const errorMessage = responseData.message || responseData.code || `HTTP ${response.status}`;
    // タイトルキーが間違っている場合の再試行ロジック（簡易）
    if (errorMessage.includes('property that exists')) {
       throw new Error(`保存エラー: データベースのプロパティ（列）が一致しません。本文にまとめて保存しようとしましたが、タイトル列の特定にも失敗している可能性があります。\n詳細: ${errorMessage}`);
    }
    throw new Error(`Notion保存エラー: ${errorMessage}`);
  }
  
  return { success: true, pageId: responseData.id, pageUrl: responseData.url };
}

// =============================================================================
// メッセージハンドラー
// =============================================================================

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'saveToNotion') {
    createNotionPage(message.data)
      .then(result => sendResponse(result))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }
  
  if (message.action === 'getCredentials') {
    chrome.storage.local.get(['notionApiKey', 'notionDatabaseId'])
      .then(credentials => {
        sendResponse({ hasCredentials: !!(credentials.notionApiKey && credentials.notionDatabaseId) });
      });
    return true;
  }
});

console.log('Gemini to Notion Knowledge Archiver v4.2: Background service worker initialized');
