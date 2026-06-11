/**
 * player-progress.js
 * プレイヤーの進捗データをlocalStorageで管理するロジック。
 * Lv2解放処理（ジャンル制覇 / 距離帯初到達）を担う。
 */

(function () {
const STORAGE_KEY = 'sirotabi_progress';
const GENRE_UNLOCK_COUNT = 15; // 同ジャンル累計訪問でLv2解放

// ── デフォルト進捗データ ──────────────────────────────────────
function defaultProgress() {
  return {
    genreCount:      {},   // { '歴史': 3, '美術': 15 }
    unlockedGenres:  [],   // Lv2解放済みジャンル
    reachedTiers:    [],   // 到達済み距離帯 ['nearby', 'local', ...]
    lv3Museums:      [],   // 両軸重なり（遠い×専門ジャンル）でLv3になった館ID
    onceOnlyObtained: [],  // 初回限定お土産の入手済みID（例: 'sv_aquarium_tank'）
  };
}

// ── 読み込み / 保存 ───────────────────────────────────────────
function loadProgress() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultProgress();
    return { ...defaultProgress(), ...JSON.parse(raw) };
  } catch {
    return defaultProgress();
  }
}

function saveProgress(progress) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
}

// ── 訪問を記録し、Lv2解放を判定 ──────────────────────────────
// museum: toGameMuseum() の返り値
// 戻り値: { progress, newGenreUnlocked, newTierReached, becameLv3 }
function recordVisit(museum) {
  const progress = loadProgress();
  const result = {
    progress,
    newGenreUnlocked: null,
    newTierReached:   null,
    becameLv3:        false,
  };

  const genre = museum.genre;
  const tier  = museum.distanceTier;

  // ジャンル訪問カウント加算
  progress.genreCount[genre] = (progress.genreCount[genre] ?? 0) + 1;

  // ジャンル制覇チェック（累計15回でLv2解放）
  if (
    progress.genreCount[genre] >= GENRE_UNLOCK_COUNT &&
    !progress.unlockedGenres.includes(genre)
  ) {
    progress.unlockedGenres.push(genre);
    result.newGenreUnlocked = genre;
  }

  // 距離帯初到達チェック
  if (tier && !progress.reachedTiers.includes(tier)) {
    progress.reachedTiers.push(tier);
    result.newTierReached = tier;
  }

  // Lv3判定（ジャンル解放済み × 遠距離帯以上に初到達）
  const isFarEnough = ['far', 'remote'].includes(tier);
  const isGenreUnlocked = progress.unlockedGenres.includes(genre);
  const isLv3Already = progress.lv3Museums.includes(museum.id);

  if (isFarEnough && isGenreUnlocked && !isLv3Already) {
    progress.lv3Museums.push(museum.id);
    result.becameLv3 = true;
  }

  saveProgress(progress);
  result.progress = progress;
  return result;
}

// ── 初回限定お土産の入手判定 ──────────────────────────────────
// 水槽（sv_aquarium_tank）など、1人1回しか入手できないお土産を処理する。
// 戻り値: 入手できた場合 true（同時に入手済みとして記録）、入手済みなら false
function tryObtainOnceOnly(souvenirId) {
  const progress = loadProgress();
  if (progress.onceOnlyObtained.includes(souvenirId)) return false;
  progress.onceOnlyObtained.push(souvenirId);
  saveProgress(progress);
  return true;
}

// 抽選前のフィルタ用：初回限定お土産を候補から除外する
// souvenirIds: 候補ID配列 / allSouvenirs: souvenirs.json の内容
function filterObtainableSouvenirs(souvenirIds, allSouvenirs) {
  const progress = loadProgress();
  return souvenirIds.filter(id => {
    const def = allSouvenirs[id];
    return !(def?.onceOnly && progress.onceOnlyObtained.includes(id));
  });
}

// ── 館のレベルを取得 ──────────────────────────────────────────
function getMuseumLevel(museumId, genre, distanceTier, progress) {
  if (progress.lv3Museums.includes(museumId)) return 3;
  const genreUnlocked = progress.unlockedGenres.includes(genre);
  const tierUnlocked  = progress.reachedTiers.includes(distanceTier);
  if (genreUnlocked || tierUnlocked) return 2;
  return 1;
}

// ── エクスポート ──────────────────────────────────────────────
window.PlayerProgress = {
  loadProgress,
  saveProgress,
  recordVisit,
  getMuseumLevel,
  tryObtainOnceOnly,
  filterObtainableSouvenirs,
  GENRE_UNLOCK_COUNT,
};
})();
