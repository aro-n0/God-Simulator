// spriteGen.js
// 16x16ドット絵キャラクタースプライト、資源(木/巨木/岩/鉱石/農作物)の上から見た詳細アイコン、
// 職業・性格キーワード解析、ステータス(STR/AGI/INT/CHA)ロール、名前・タグ生成を担う。

// ベーステンプレート: . 透明 / H 髪 / S 肌 / E 目 / C 服 / P ズボン・靴 / O アウトライン
const BASE_TEMPLATE = [
  '....HHHHHHHH....',
  '...HHHHHHHHHH...',
  '..HHHHHHHHHHHH..',
  '..HHSSSSSSSSHH..',
  '..HSSSSSSSSSSH..',
  '..HSSEESSEESSH..',
  '..HSSSSSSSSSSH..',
  '..HHSSSSSSSSHH..',
  '...CCCCCCCCCC...',
  '..CCCCCCCCCCCC..',
  '..CCCCCCCCCCCC..',
  '..CCCCCCCCCCCC..',
  '...CCC....CCC...',
  '...PPP....PPP...',
  '...PPP....PPP...',
  '...OOO....OOO...',
];

const HAIRSTYLE_OVERRIDES = {
  short: {},
  bald: { 0: '................', 1: '...SSSSSSSSSS...', 2: '..SSSSSSSSSSSS..', 3: '..SSSSSSSSSSSS..' },
  long: { 8: '..HCCCCCCCCCCH..', 9: '.HCCCCCCCCCCCCH.' },
};

const HAT_OVERLAY = ['...GGGGGGGGGG...', '..GGGGGGGGGGGG..', '..GG........GG..'];

const NATURAL_SKIN_TONES = ['#ffe0bd', '#f2c9a0', '#e0ac7a', '#c98a55', '#a86b3c', '#8a5a35', '#6b4226', '#4a2c17'];
const NATURAL_HAIR_COLORS = ['#1b1b1b', '#3b2b1e', '#5a3d24', '#8a5a35', '#c99b57', '#e6c85c', '#9a4b2b', '#9a9a9a', '#e8e8e8'];
const CLOTHES_COLOR_CHOICES = ['#4b7bc9', '#4fae5e', '#8a2b2b', '#7a9a4a', '#b08a3c', '#8a4fae', '#c9a13c', '#3c8ac9'];
const HAT_COLOR_CHOICES = ['#4b3b8a', '#8a2b2b', '#2b2b2b', '#3c6b8a'];
const HAIRSTYLE_CHOICES = ['short', 'short', 'long', 'long', 'bald'];

const JOB_KEYWORDS = {
  木こり: { gatherBonus: { tree: 1.6, big_tree: 1.6 } },
  きこり: { gatherBonus: { tree: 1.6, big_tree: 1.6 } },
  魔法使い: { gatherBonus: {} },
  商人: { gatherBonus: {} },
  農民: { gatherBonus: { tree: 1.1, stone: 1.1 }, farmBonus: 1.5 },
  鉱夫: { gatherBonus: { stone: 1.6, ore: 1.6 } },
  兵士: { gatherBonus: {}, huntBonus: 1.5 },
  漁師: { gatherBonus: {}, canFish: true },
};

const PERSONALITY_KEYWORDS = {
  頑固: { speedMul: 0.9, restThreshold: 15, gatherPersist: 1.4 },
  元気: { speedMul: 1.3, restThreshold: 25 },
  のんびり: { speedMul: 0.7, restThreshold: 35 },
  ドジ: { gatherEffMul: 0.7 },
  真面目: { gatherEffMul: 1.3 },
  怠け: { gatherEffMul: 0.6, restThreshold: 40 },
  優しい: { restThreshold: 30, socialMul: 1.4 },
  慎重: { speedMul: 0.85 },
};

const LIKE_POOL = ['昼寝', 'おしゃべり', '焚き火', '晴れの日', '甘いもの', '散歩', '歌うこと', '星空', '川遊び', '焼き芋'];
const DISLIKE_POOL = ['雨', '虫', '早起き', '大きな音', '辛いもの', '寒さ', '暑さ', '力仕事', '待つこと', '暗い場所'];
const GIVEN_NAME_POOL = ['ハルト', 'ユイ', 'ソラ', 'アカリ', 'レン', 'ミオ', 'カイ', 'ツムギ', 'ノゾミ', 'イブキ', 'サクラ', 'ヒナタ', 'アオイ', 'リン', 'ユズ', 'コウ'];

function hashStringToSeed(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (Math.imul(31, h) + str.charCodeAt(i)) | 0;
  return h >>> 0;
}

function pickFromArray(rand, arr) {
  return arr[Math.floor(rand() * arr.length)];
}

function pickUniqueRandom(rand, pool, count) {
  const copy = pool.slice();
  const result = [];
  for (let i = 0; i < count && copy.length; i++) {
    const idx = Math.floor(rand() * copy.length);
    result.push(copy.splice(idx, 1)[0]);
  }
  return result;
}

function generateRandomName() {
  return pickFromArray(Math.random, GIVEN_NAME_POOL) || GIVEN_NAME_POOL[Math.floor(Math.random() * GIVEN_NAME_POOL.length)];
}

// 外見（シルエット・配色）をランダム生成する
function randomizeAppearance(seed) {
  const rand = mulberry32(seed != null ? seed >>> 0 : Math.floor(Math.random() * 0xffffffff));
  return {
    skinTone: pickFromArray(rand, NATURAL_SKIN_TONES),
    hairColor: pickFromArray(rand, NATURAL_HAIR_COLORS),
    clothesColor: pickFromArray(rand, CLOTHES_COLOR_CHOICES),
    hairStyle: pickFromArray(rand, HAIRSTYLE_CHOICES),
    hasHat: rand() < 0.25,
    hatColor: pickFromArray(rand, HAT_COLOR_CHOICES),
  };
}

// STR/AGI/INT/CHA を1-10でロール（ダイスボタン用）
function rollBaseStats(seed) {
  const rand = mulberry32(seed != null ? seed >>> 0 : Math.floor(Math.random() * 0xffffffff));
  const roll = () => 2 + Math.floor(rand() * 8); // 2-9を基本域に
  return { str: roll(), agi: roll(), int: roll(), cha: roll() };
}

// プロンプトテキストから職業・性格ステータスと初期の好き嫌いを解析する（外見・基礎ステータスは含まない）
function deriveStatsFromPrompt(name, prompt) {
  name = name || '名無し';
  prompt = prompt || '';
  const seed = hashStringToSeed(name + '::' + prompt + '::' + Date.now() + '::' + Math.random());
  const rand = mulberry32(seed);

  let job = null;
  let jobKey = null;
  for (const key in JOB_KEYWORDS) {
    if (prompt.includes(key)) {
      job = JOB_KEYWORDS[key];
      jobKey = key;
      break;
    }
  }

  let personality = { speedMul: 1, restThreshold: 20, gatherEffMul: 1, gatherPersist: 1, socialMul: 1 };
  let personalityLabel = null;
  for (const key in PERSONALITY_KEYWORDS) {
    if (prompt.includes(key)) {
      personality = Object.assign({}, personality, PERSONALITY_KEYWORDS[key]);
      personalityLabel = key;
    }
  }

  return {
    name,
    prompt,
    seed,
    job: jobKey,
    personalityLabel,
    gatherBonus: (job && job.gatherBonus) || {},
    canFish: !!(job && job.canFish),
    huntBonus: (job && job.huntBonus) || 1,
    farmBonus: (job && job.farmBonus) || 1,
    speed: 0.9 * (personality.speedMul || 1),
    restThreshold: personality.restThreshold || 20,
    gatherEffMul: personality.gatherEffMul || 1,
    gatherPersist: personality.gatherPersist || 1,
    socialMul: personality.socialMul || 1,
    likes: pickUniqueRandom(rand, LIKE_POOL, 1 + Math.floor(rand() * 2)),
    dislikes: pickUniqueRandom(rand, DISLIKE_POOL, 1 + Math.floor(rand() * 2)),
  };
}

function getTemplateForStyle(style) {
  const rows = BASE_TEMPLATE.slice();
  const overrides = HAIRSTYLE_OVERRIDES[style] || {};
  for (const idx in overrides) rows[idx] = overrides[idx];
  return rows;
}

// パラメータから16x16オフスクリーンcanvasのドット絵キャラクターを構築
function buildSpriteCanvas(params) {
  const size = 16;
  const cnv = document.createElement('canvas');
  cnv.width = size;
  cnv.height = size;
  const ctx = cnv.getContext('2d');
  ctx.imageSmoothingEnabled = false;

  const template = getTemplateForStyle(params.hairStyle || 'short');
  const colorMap = {
    H: params.hairColor, S: params.skinTone, C: params.clothesColor,
    E: '#1a1a1a', P: '#3a3a3a', O: '#1a1a1a',
  };

  for (let y = 0; y < size; y++) {
    const row = template[y];
    for (let x = 0; x < size; x++) {
      const color = colorMap[row[x]];
      if (color) {
        ctx.fillStyle = color;
        ctx.fillRect(x, y, 1, 1);
      }
    }
  }

  if (params.hasHat) {
    for (let y = 0; y < HAT_OVERLAY.length; y++) {
      const row = HAT_OVERLAY[y];
      for (let x = 0; x < size; x++) {
        if (row[x] === 'G') {
          ctx.fillStyle = params.hatColor || '#2b2b2b';
          ctx.fillRect(x, y, 1, 1);
        }
      }
    }
  }
  return cnv;
}

// ============ 資源アイコン(上から見たドット絵風) ============
// キャンバスは小さいピクセル単位で塗ることで「上から見た」樹冠・岩塊らしさを表現する。

function _px(ctx, x, y, w, h, color) {
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w, h);
}

function buildTreeIcon() {
  const size = 16;
  const cnv = document.createElement('canvas');
  cnv.width = size; cnv.height = size;
  const ctx = cnv.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  // 樹冠(複数の緑の塊を重ねて丸いモコモコ感を出す)
  _px(ctx, 3, 2, 10, 10, '#1c4a20');
  _px(ctx, 2, 4, 12, 7, '#1c4a20');
  _px(ctx, 4, 1, 8, 3, '#1c4a20');
  _px(ctx, 4, 3, 8, 8, '#2f6a34');
  _px(ctx, 5, 4, 6, 6, '#3f8a44');
  _px(ctx, 6, 5, 3, 3, '#57ab5c');
  // 幹(中心にわずかに見える濃い茶色)
  _px(ctx, 7, 12, 2, 3, '#4a2f1a');
  return cnv;
}

function buildBigTreeIcon() {
  const size = 24;
  const cnv = document.createElement('canvas');
  cnv.width = size; cnv.height = size;
  const ctx = cnv.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  _px(ctx, 3, 2, 18, 18, '#163a1a');
  _px(ctx, 1, 5, 22, 13, '#163a1a');
  _px(ctx, 5, 0, 14, 5, '#163a1a');
  _px(ctx, 4, 4, 16, 15, '#1f4a24');
  _px(ctx, 6, 6, 12, 11, '#2f6a34');
  _px(ctx, 8, 8, 8, 7, '#3f8a44');
  _px(ctx, 10, 9, 4, 4, '#5cbf62');
  // 巨大な幹(年輪風の同心円で「太さ」を強調)
  _px(ctx, 9, 18, 6, 6, '#3a2414');
  _px(ctx, 10, 19, 4, 4, '#4a3018');
  _px(ctx, 11, 20, 2, 2, '#5c3d20');
  return cnv;
}

function buildRockIcon() {
  const size = 16;
  const cnv = document.createElement('canvas');
  cnv.width = size; cnv.height = size;
  const ctx = cnv.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  _px(ctx, 2, 5, 12, 9, '#5c5c5c');
  _px(ctx, 4, 2, 9, 8, '#6e6e6e');
  _px(ctx, 3, 4, 6, 5, '#4a4a4a');
  _px(ctx, 9, 3, 5, 6, '#7d7d7d');
  // ハイライトと影で立体感
  _px(ctx, 5, 3, 3, 2, '#a0a0a0');
  _px(ctx, 3, 10, 8, 3, '#3a3a3a');
  return cnv;
}

function buildOreIcon() {
  const size = 16;
  const cnv = document.createElement('canvas');
  cnv.width = size; cnv.height = size;
  const ctx = cnv.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  _px(ctx, 1, 1, 14, 14, '#170f0a');
  _px(ctx, 3, 3, 10, 10, '#241811');
  const glints = [[4, 4], [9, 5], [6, 8], [10, 10], [3, 10]];
  glints.forEach(([gx, gy]) => _px(ctx, gx, gy, 2, 2, '#e6c85c'));
  return cnv;
}

function buildCropIcon(type, stage) {
  const size = 12;
  const cnv = document.createElement('canvas');
  cnv.width = size; cnv.height = size;
  const ctx = cnv.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  const soil = '#5a3d24';
  _px(ctx, 1, 8, 10, 3, soil);
  if (stage === 0) {
    _px(ctx, 5, 6, 2, 3, '#4fae5e');
  } else if (stage === 1) {
    _px(ctx, 4, 4, 4, 5, '#4fae5e');
    _px(ctx, 3, 6, 6, 3, '#3f8a44');
  } else if (stage === 2) {
    _px(ctx, 3, 2, 6, 7, '#3f8a44');
    _px(ctx, 4, 1, 4, 3, '#57ab5c');
  } else {
    _px(ctx, 3, 2, 6, 7, '#2f6a34');
    const ripeColor = type === 'wheat' ? '#e0c23c' : type === 'apple' ? '#c94b4b' : '#8ae06e';
    _px(ctx, 2, 0, 8, 4, ripeColor);
  }
  return cnv;
}
