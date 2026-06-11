/**
 * shadow-multi.js
 * 疑似マルチプレイヤー（シャドウマルチ）のロジック。
 * NPCが他プレイヤーのワンコを演じる。サーバー接続なし・localStorage完結。
 *
 * 出現タイミング：
 *   - ログイン時：低確率（LOGIN_CHANCE）
 *   - ペット帰還時：RETURN_INTERVAL 回に1回
 *
 * 頻度制限：
 *   - 同一NPCは COOLDOWN_DAYS 日空ける
 *   - 同行（companion）は同時1体まで
 */

(function () {
const SM_STORAGE_KEY = 'sirotabi_shadow_multi';
const LOGIN_CHANCE     = 0.05;   // ログイン時の出現確率（5%）
const RETURN_INTERVAL  = 15;     // 帰還 N 回に1回出現
const COOLDOWN_DAYS    = 3;      // 同一NPCの再訪クールダウン（日）

// ── デフォルトデータ ──────────────────────────────────────────
function defaultSMState() {
  return {
    returnCount:    0,           // 帰還累計カウント
    lastVisitedAt:  {},          // { npcId: timestamp } 直近訪問日時
    currentGuest:   null,        // 現在滞在中のゲスト { npc, arrivedAt, actions }
    companionId:    null,        // 同行中のNPC ID（旅中のみ）
  };
}

// ── 読み込み / 保存 ───────────────────────────────────────────
function loadSMState() {
  try {
    const raw = localStorage.getItem(SM_STORAGE_KEY);
    if (!raw) return defaultSMState();
    return { ...defaultSMState(), ...JSON.parse(raw) };
  } catch {
    return defaultSMState();
  }
}

function saveSMState(s) {
  localStorage.setItem(SM_STORAGE_KEY, JSON.stringify(s));
}

// ── 日付シードによるNPC選出 ───────────────────────────────────
// guestDogs: guest-dogs.json の配列
// 今日の日付文字列（YYYY-MM-DD）をシードにしてNPCを選ぶ
function selectNpcByDateSeed(guestDogs, dateStr) {
  const seed = parseInt(dateStr.replace(/-/g, ''), 10);
  return guestDogs[seed % guestDogs.length];
}

// ── クールダウン判定 ──────────────────────────────────────────
function isOnCooldown(npcId, lastVisitedAt) {
  const last = lastVisitedAt[npcId];
  if (!last) return false;
  const diffDays = (Date.now() - last) / (1000 * 60 * 60 * 24);
  return diffDays < COOLDOWN_DAYS;
}

// ── 今日の日付文字列 ──────────────────────────────────────────
function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// ── ログイン時の出現判定 ──────────────────────────────────────
// 戻り値: 出現するNPC または null
function checkLoginVisit(guestDogs) {
  if (Math.random() > LOGIN_CHANCE) return null;
  const s = loadSMState();
  if (s.currentGuest) return null;            // すでにゲストがいる
  const npc = selectNpcByDateSeed(guestDogs, todayStr());
  if (isOnCooldown(npc.id, s.lastVisitedAt)) return null;
  return npc;
}

// ── 帰還時の出現判定 ──────────────────────────────────────────
// 戻り値: 出現するNPC または null
function checkReturnVisit(guestDogs) {
  const s = loadSMState();
  s.returnCount += 1;
  saveSMState(s);
  if (s.returnCount % RETURN_INTERVAL !== 0) return null;
  if (s.currentGuest) return null;
  const npc = selectNpcByDateSeed(guestDogs, todayStr());
  if (isOnCooldown(npc.id, s.lastVisitedAt)) return null;
  return npc;
}

// ── ゲスト到着を記録 ─────────────────────────────────────────
function arriveGuest(npc) {
  const s = loadSMState();
  s.currentGuest = {
    npc,
    arrivedAt: Date.now(),
    actions: { souvenirGiven: false, branchGiven: false, companionUsed: false },
  };
  s.lastVisitedAt[npc.id] = Date.now();
  saveSMState(s);
}

// ── インタラクション：お土産をもらう ─────────────────────────
// 戻り値: お土産アイテムID（ランダム）または null
function receiveSouvenir(allSouvenirs) {
  const s = loadSMState();
  if (!s.currentGuest || s.currentGuest.actions.souvenirGiven) return null;
  const commons = Object.entries(allSouvenirs)
    .filter(([, v]) => v.rarity === 'common' && v.genre !== 'all')
    .map(([k]) => k);
  const picked = commons[Math.floor(Math.random() * commons.length)];
  s.currentGuest.actions.souvenirGiven = true;
  saveSMState(s);
  return picked;
}

// ── インタラクション：えだをもらう ───────────────────────────
// 戻り値: もらえたえだの本数（0の場合はすでに受け取り済み）
function receiveBranch() {
  const s = loadSMState();
  if (!s.currentGuest || s.currentGuest.actions.branchGiven) return 0;
  s.currentGuest.actions.branchGiven = true;
  saveSMState(s);
  return 1;    // 1本固定（バランス調整はここで変更）
}

// ── インタラクション：同行を依頼 ─────────────────────────────
// 戻り値: 同行を受け入れた場合 true
function requestCompanion() {
  const s = loadSMState();
  if (!s.currentGuest) return false;
  if (s.currentGuest.actions.companionUsed) return false;
  if (s.companionId) return false;    // すでに同行中
  s.companionId = s.currentGuest.npc.id;
  s.currentGuest.actions.companionUsed = true;
  saveSMState(s);
  return true;
}

// ── 旅終了時に同行ボーナスを計算 ─────────────────────────────
// distanceTier: 'nearby' | 'local' | 'regional' | 'far' | 'remote'
// 戻り値: ボーナスえだ本数
function resolveCompanionBonus(distanceTier) {
  const s = loadSMState();
  if (!s.companionId) return 0;
  const bonusMap = { nearby: 1, local: 2, regional: 3, far: 4, remote: 5 };
  const bonus = bonusMap[distanceTier] ?? 1;
  s.companionId = null;
  saveSMState(s);
  return bonus;
}

// ── ゲスト退場 ────────────────────────────────────────────────
function dismissGuest() {
  const s = loadSMState();
  s.currentGuest = null;
  saveSMState(s);
}

// ── 現在のゲストを取得 ────────────────────────────────────────
function getCurrentGuest() {
  return loadSMState().currentGuest;
}

// ── エクスポート ──────────────────────────────────────────────
window.ShadowMulti = {
  checkLoginVisit,
  checkReturnVisit,
  arriveGuest,
  receiveSouvenir,
  receiveBranch,
  requestCompanion,
  resolveCompanionBonus,
  dismissGuest,
  getCurrentGuest,
};
})();
