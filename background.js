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

// =============================================================================
// Helper: タイトルプロパティのキー特定
// =============================================================================

async function getTitlePropertyKey(notionApiKey, notionDatabaseId) {
  try {
    const dbResponse = await fetch(`https://api.notion.com/v1/databases/${notionDatabaseId}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${notionApiKey}`,
        'Notion-Version': NOTION_API_VERSION
      }
    });
    
    if (dbResponse.ok) {
      const dbData = await dbResponse.json();
      const titleProp = Object.entries(dbData.properties).find(([key, prop]) => prop.type === 'title');
      if (titleProp) {
        return titleProp[0]; 
      }
    }
  } catch (e) {
    console.error('Database info fetch error:', e);
  }
  return 'Name'; // default
}

async function createNotionPage(data) {
  const { notionApiKey, notionDatabaseId } = await chrome.storage.local.get(['notionApiKey', 'notionDatabaseId']);
  
  if (!notionApiKey || !notionDatabaseId) {
    throw new Error('Notion API KeyまたはDatabase IDが設定されていません。');
  }
  
  // ページ本文のブロック構築
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
  
  const titleKey = await getTitlePropertyKey(notionApiKey, notionDatabaseId);

  const properties = {};
  properties[titleKey] = {
    title: [{ text: { content: (data.title || 'Gemini会話まとめ').substring(0, 100) } }]
  };
  
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
    if (errorMessage.includes('property that exists')) {
       throw new Error(`保存エラー: データベースのプロパティ（列）が一致しません。\n詳細: ${errorMessage}`);
    }
    throw new Error(`Notion保存エラー: ${errorMessage}`);
  }
  
  return { success: true, pageId: responseData.id, pageUrl: responseData.url };
}

// =============================================================================
// Notion API ページ取得・検索 (v5.0 Import機能)
// =============================================================================

async function searchNotionPages(query = '') {
  const { notionApiKey, notionDatabaseId } = await chrome.storage.local.get(['notionApiKey', 'notionDatabaseId']);
  if (!notionApiKey || !notionDatabaseId) throw new Error('MISSING_CREDENTIALS');

  const payload = {
    page_size: 20, // v5.4: 20件に増加
    sorts: [{ timestamp: 'last_edited_time', direction: 'descending' }]
  };

  if (query && query.trim().length > 0) {
    // タイトルプロパティ名を特定してフィルタリング
    const titleKey = await getTitlePropertyKey(notionApiKey, notionDatabaseId);
    payload.filter = {
      property: titleKey,
      title: {
        contains: query.trim()
      }
    };
  }

  const response = await fetch(`https://api.notion.com/v1/databases/${notionDatabaseId}/query`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${notionApiKey}`,
      'Notion-Version': NOTION_API_VERSION,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const errorData = await response.json();
    const status = response.status;
    
    // HTTPステータスコードに応じて詳細なエラーメッセージを返す
    if (status === 401) {
      throw new Error('INVALID_API_KEY');
    } else if (status === 404) {
      throw new Error('INVALID_DATABASE_ID');
    } else if (status === 403) {
      throw new Error('NO_DATABASE_ACCESS');
    } else {
      throw new Error(errorData.message || 'Failed to fetch pages');
    }
  }

  const data = await response.json();
  return data.results.map(page => {
    let title = '無題のページ';
    const titleProp = Object.values(page.properties).find(prop => prop.type === 'title');
    if (titleProp && titleProp.title && titleProp.title.length > 0) {
      title = titleProp.title.map(t => t.plain_text).join('');
    }
    
    return {
      id: page.id,
      title: title || '無題のページ',
      lastEdited: page.last_edited_time,
      url: page.url
    };
  });
}

async function getNotionPageBlocks(pageId) {
  const { notionApiKey } = await chrome.storage.local.get(['notionApiKey']);
  if (!notionApiKey) throw new Error('Notion API Key Not Found');

  const response = await fetch(`https://api.notion.com/v1/blocks/${pageId}/children?page_size=100`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${notionApiKey}`,
      'Notion-Version': NOTION_API_VERSION
    }
  });

  if (!response.ok) throw new Error('Failed to fetch page content');

  const data = await response.json();
  
  // ブロックをテキストに変換（簡易実装）
  return data.results.map(block => {
    if (block.type === 'paragraph' && block.paragraph.rich_text.length > 0) {
      return block.paragraph.rich_text.map(t => t.plain_text).join('');
    }
    if (block.type === 'heading_1' || block.type === 'heading_2' || block.type === 'heading_3') {
      const text = block[block.type].rich_text.map(t => t.plain_text).join('');
      return `\n[${block.type.replace('heading_', 'H')}] ${text}`;
    }
    if (block.type === 'bulleted_list_item') {
      return '• ' + block.bulleted_list_item.rich_text.map(t => t.plain_text).join('');
    }
    return ''; // その他のブロックは一旦無視
  }).filter(line => line.length > 0).join('\n');
}

// =============================================================================
// メッセージハンドラー
// =============================================================================

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'saveToNotion') {
    createNotionPage(message.data)
      .then(result => sendResponse(result))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true; // 非同期レスポンスのためにtrueを返す
  }
  
  if (message.action === 'getCredentials') {
    chrome.storage.local.get(['notionApiKey', 'notionDatabaseId'])
      .then(credentials => {
        sendResponse({ hasCredentials: !!(credentials.notionApiKey && credentials.notionDatabaseId) });
      });
    return true;
  }

  // v5.0 Import機能
  if (message.action === 'searchNotion') {
    searchNotionPages(message.query)
      .then(results => sendResponse({ success: true, results }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }

  if (message.action === 'getNotionPage') {
    getNotionPageBlocks(message.pageId)
      .then(content => sendResponse({ success: true, content }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }

  if (message.action === 'openOptionsPage') {
    chrome.runtime.openOptionsPage();
    return true;
  }
});

console.log('Gemini to Notion Knowledge Archiver v1.0: Background service worker initialized');
