/**
 * extract-game-museums.mjs
 * 全国ミュージアムマップの museums.json から、sirotabiの旅先選定に必要な
 * 最小フィールドだけを抽出して data/game-museums-data.json を生成する。
 *
 * 使い方:
 *   node scripts/extract-game-museums.mjs [museums.jsonのパス]
 *   省略時は ../../../_review_museum-map/data/museums.json を参照する。
 *
 * 運用: museums.json が更新されたらこのスクリプトを再実行してコミットする。
 * 将来、オンライン時バックグラウンド更新（ハイブリッド方式）へ移行する際も
 * このファイル形式（meta + museums）をそのまま配信フォーマットとして使う。
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

const sourcePath = process.argv[2]
  ?? join(__dirname, '..', '..', '..', '..', '_review_museum-map', 'data', 'museums.json');
const outPath = join(__dirname, '..', 'data', 'game-museums-data.json');

const raw = JSON.parse(readFileSync(sourcePath, 'utf8'));
const museums = Array.isArray(raw) ? raw : raw.museums;

const slim = museums.map(m => ({
  id: m.id,
  name: m.name,
  prefecture: m.prefecture,
  // genreが配列の場合は先頭を使う（謎のパラダイス優先の並びを想定）
  genre: Array.isArray(m.genre) ? m.genre[0] : (m.genre ?? '総合'),
}));

const output = {
  meta: {
    generatedAt: new Date().toISOString(),
    source: 'museum-map museums.json',
    count: slim.length,
    schemaVersion: 1,
  },
  museums: slim,
};

writeFileSync(outPath, JSON.stringify(output), 'utf8');
console.log(`生成完了: ${outPath}`);
console.log(`件数: ${slim.length} / サイズ: ${(JSON.stringify(output).length / 1024).toFixed(0)}KB`);
