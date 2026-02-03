import { describe, it, expect } from 'vitest';
import { extractJsonFromText } from '../../shared/json/extract.js';

// これらのテストは抽出仕様そのものを定義する。

describe('extractJsonFromText', () => {
  it('extracts JSON from a ```json``` code block (highest priority)', () => {
    const input = 'before\n```json\n{"a":1}\n```\nafter';
    const result = extractJsonFromText(input);
    // 他に波括弧があっても ```json``` ブロックを最優先とする。
    expect(result.ok).toBe(true);
    expect(result.data).toEqual({ a: 1 });
  });

  it('extracts the first {...} block when surrounded by text', () => {
    const input = 'prefix {"ok":true} suffix';
    const result = extractJsonFromText(input);
    // ```json``` が無い場合は最初の { ... } を採用する。
    expect(result.ok).toBe(true);
    expect(result.data).toEqual({ ok: true });
  });

  it('ignores non-json code fences and still extracts {...}', () => {
    const input = '```js\nconst x = 1;\n```\n{"n":2}';
    const result = extractJsonFromText(input);
    // ```json``` 以外のコードブロックは無視する。
    expect(result.ok).toBe(true);
    expect(result.data).toEqual({ n: 2 });
  });

  it('returns ok:false for invalid JSON', () => {
    const input = '{"broken": }';
    const result = extractJsonFromText(input);
    // 破損JSONは失敗として扱い、黙って成功させない。
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('invalid_json');
  });

  it('locks behavior to the first JSON object when multiple exist', () => {
    const input = '{"first":1} and then {"second":2}';
    const result = extractJsonFromText(input);
    // 挙動を決定的にするため、最初のブロックを採用する。
    expect(result.ok).toBe(true);
    expect(result.data).toEqual({ first: 1 });
  });
});
