/**
 * game-museums.js
 * museums.json（全国ミュージアムマップ）を実行時にsirotabi用データへ変換するロジック。
 * souvenirs.json / luggage.json / prefectures.json を参照する。
 */

(function () {
// ── 定数 ─────────────────────────────────────────────────────
const DISTANCE_TIERS = [
  { maxKm:  50,  tier: 'nearby',    travelHours:  2, label: '近隣' },
  { maxKm: 150,  tier: 'local',     travelHours:  6, label: '県内/隣県' },
  { maxKm: 300,  tier: 'regional',  travelHours: 12, label: '隣県またぎ' },
  { maxKm: 600,  tier: 'far',       travelHours: 18, label: '遠方' },
  { maxKm: Infinity, tier: 'remote', travelHours: 24, label: '超遠方' },
];

// ジャンル別お土産IDマップ
const GENRE_SOUVENIRS = {
  '歴史':       ['sv_kamon_seal', 'sv_komonjo', 'sv_utsuwa', 'sv_sword'],
  '美術':       ['sv_painting', 'sv_kakejiku', 'sv_sculpture'],
  '民俗':       ['sv_folkcraft', 'sv_costume', 'sv_minggu'],
  '文学':       ['sv_book'],
  '科学技術':   ['sv_element', 'sv_planetarium', 'sv_globe'],
  '自然科学':   ['sv_mineral', 'sv_herbarium', 'sv_fossil', 'sv_feather', 'sv_leucochloridium'],
  '水族館':     ['sv_aquarium_tank', 'sv_fish', 'sv_aquatic_plant'], // 水槽はonceOnly（入手済みはPlayerProgress側で除外）
  '植物園':     ['sv_watering_can', 'sv_flower'],
  '動物園':     ['sv_stuffed_animal'],
  '謎のパラダイス': ['sv_mystery_stone', 'sv_pager', 'sv_one_sock', 'sv_stag_beetle'],
  '総合':       null, // null = 全ジャンルからランダム
};

// ジャンル別必要荷物IDマップ
const GENRE_LUGGAGE = {
  '歴史':       'lg_notebook',
  '美術':       'lg_sketchbook',
  '民俗':       'lg_furoshiki',
  '文学':       'lg_bunkobon',
  '科学技術':   'lg_tools',
  '自然科学':   'lg_loupe',
  '水族館':     'lg_water_bottle',
  '植物園':     'lg_gloves',
  '動物園':     'lg_snack',
  '謎のパラダイス': 'lg_lantern',
  '総合':       'lg_backpack',
};

// ── ハーバーサイン距離計算 ────────────────────────────────────
function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) *
    Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ── 距離帯判定 ────────────────────────────────────────────────
function getDistanceTier(km) {
  return DISTANCE_TIERS.find(t => km <= t.maxKm);
}

// ── お土産リスト取得 ──────────────────────────────────────────
// hasLuggage: 荷物を持っているか。falseの場合は低レアのみ返す
function getSouvenirIds(genre, allSouvenirs, hasLuggage = true) {
  let ids;

  if (genre === '総合' || !GENRE_SOUVENIRS[genre]) {
    // 総合または未知ジャンル: 全ジャンルから common のみ
    ids = Object.entries(allSouvenirs)
      .filter(([, v]) => v.genre !== 'all' && v.rarity === 'common')
      .map(([k]) => k);
  } else {
    ids = GENRE_SOUVENIRS[genre] ?? [];
  }

  // 絵葉書は常に含める
  const base = ['sv_postcard_common'];

  if (!hasLuggage) {
    // 荷物なし: common のみ
    const commons = ids.filter(id => allSouvenirs[id]?.rarity === 'common');
    return [...base, ...commons];
  }

  return [...base, ...ids];
}

// ── 必要荷物ID取得 ────────────────────────────────────────────
function getRequiredLuggageId(genre) {
  return GENRE_LUGGAGE[genre] ?? 'lg_backpack';
}

// ── museum.json の1件をgame-museum形式に変換 ─────────────────
// userPrefecture: ユーザーの居住都道府県スラッグ（例: 'tokyo'）
// prefectureData: prefectures.json の内容
// allSouvenirs:   souvenirs.json の内容
// playerLuggage:  プレイヤーが持っている荷物IDの配列
function toGameMuseum(museum, userPrefecture, prefectureData, allSouvenirs, playerLuggage = []) {
  const userCoord = prefectureData[userPrefecture];
  const museumPref = museum.prefecture;
  const museumCoord = prefectureData[museumPref];

  let distanceTier = null;
  let travelHours = 24;

  if (userCoord && museumCoord) {
    const km = haversineKm(userCoord.lat, userCoord.lng, museumCoord.lat, museumCoord.lng);
    distanceTier = getDistanceTier(km);
    travelHours = distanceTier.travelHours;
  }

  const genre = museum.genre ?? '総合';
  const requiredLuggage = getRequiredLuggageId(genre);
  const hasLuggage = playerLuggage.includes(requiredLuggage);

  // 荷物なし + 遠距離 → 近隣のみに制限
  const effectiveTier = (!hasLuggage && distanceTier?.tier !== 'nearby')
    ? DISTANCE_TIERS[0]
    : distanceTier;

  const souvenirIds = getSouvenirIds(genre, allSouvenirs, hasLuggage);

  return {
    id: museum.id,
    name: museum.name,
    prefecture: museumPref,
    genre,
    level: 1,                          // Lv2以上はプレイヤー進捗で別途判定
    travelHours: effectiveTier?.travelHours ?? travelHours,
    distanceTier: effectiveTier?.tier ?? 'remote',
    requiredLuggage,
    hasLuggage,
    souvenirIds,
  };
}

// ── エクスポート ──────────────────────────────────────────────
// ブラウザ（ES modules未使用）環境向けにグローバルに公開
window.GameMuseums = {
  haversineKm,
  getDistanceTier,
  getSouvenirIds,
  getRequiredLuggageId,
  toGameMuseum,
  DISTANCE_TIERS,
  GENRE_SOUVENIRS,
  GENRE_LUGGAGE,
};
})();
