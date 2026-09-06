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

function appearanceSignature(a) {
  return [a.skinTone, a.hairColor, a.clothesColor, a.hairStyle, a.hasHat ? a.hatColor : 'nohat'].join('|');
}

// 名前・性格プロンプト・外見・基礎ステータスをまとめて被りなくランダム生成する(ダイスボタン用)
function randomizeFullCharacter(excludeNames, excludeSignatures) {
  excludeNames = excludeNames || new Set();
  excludeSignatures = excludeSignatures || new Set();

  let name = generateRandomName();
  let nameTries = 0;
  while (excludeNames.has(name) && nameTries < 40) {
    name = generateRandomName();
    nameTries++;
  }

  const jobKeys = Object.keys(JOB_KEYWORDS);
  const personalityKeys = Object.keys(PERSONALITY_KEYWORDS);
  const job = jobKeys[Math.floor(Math.random() * jobKeys.length)];
  const personality = personalityKeys[Math.floor(Math.random() * personalityKeys.length)];
  const prompt = `${personality}な${job}`;

  let appearance = randomizeAppearance();
  let sig = appearanceSignature(appearance);
  let appTries = 0;
  while (excludeSignatures.has(sig) && appTries < 40) {
    appearance = randomizeAppearance();
    sig = appearanceSignature(appearance);
    appTries++;
  }

  const stats = rollBaseStats();
  return { name, prompt, appearance, stats };
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

// ============ 超巨大ランドマーク用アイコン ============

function buildGiantTreeIcon() {
  const size = 40;
  const cnv = document.createElement('canvas');
  cnv.width = size; cnv.height = size;
  const ctx = cnv.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  _px(ctx, 3, 3, 34, 34, '#0c2810');
  _px(ctx, 1, 8, 38, 24, '#0c2810');
  _px(ctx, 8, 0, 24, 9, '#0c2810');
  _px(ctx, 6, 6, 28, 27, '#173a1c');
  _px(ctx, 10, 10, 20, 19, '#245c2b');
  _px(ctx, 14, 13, 12, 12, '#357f3d');
  _px(ctx, 17, 15, 6, 6, '#4fae5e');
  // 途方もない幹(年輪を強調)
  _px(ctx, 15, 30, 10, 10, '#2c1c10');
  _px(ctx, 17, 32, 6, 6, '#3d2a16');
  _px(ctx, 19, 34, 2, 2, '#523a1e');
  return cnv;
}

function buildScorchedGiantTreeIcon() {
  const size = 40;
  const cnv = document.createElement('canvas');
  cnv.width = size; cnv.height = size;
  const ctx = cnv.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  _px(ctx, 6, 6, 28, 30, '#1a1512');
  _px(ctx, 10, 10, 20, 22, '#2b2420');
  _px(ctx, 14, 14, 12, 14, '#3a322c');
  // 焼け跡の裂け目(灰色のひび)
  _px(ctx, 18, 8, 3, 24, '#4a4038');
  _px(ctx, 22, 20, 3, 12, '#4a4038');
  return cnv;
}

function buildFireIcon() {
  const size = 10;
  const cnv = document.createElement('canvas');
  cnv.width = size; cnv.height = size;
  const ctx = cnv.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  _px(ctx, 2, 4, 6, 6, '#c94b1a');
  _px(ctx, 3, 2, 4, 6, '#e0902c');
  _px(ctx, 4, 0, 2, 4, '#f0c23c');
  return cnv;
}

// ============ 動物アイコン(種別が一目でわかる簡易ドット絵) ============

function buildAnimalIcon(type) {
  const size = 16;
  const cnv = document.createElement('canvas');
  cnv.width = size; cnv.height = size;
  const ctx = cnv.getContext('2d');
  ctx.imageSmoothingEnabled = false;

  switch (type) {
    case 'chicken':
      _px(ctx, 4, 6, 8, 7, '#f2ecd8');
      _px(ctx, 9, 4, 5, 5, '#f2ecd8');
      _px(ctx, 11, 3, 3, 2, '#c94b1a');
      _px(ctx, 13, 5, 2, 1, '#e0a83c');
      _px(ctx, 5, 12, 2, 2, '#e0a83c');
      _px(ctx, 8, 12, 2, 2, '#e0a83c');
      break;
    case 'cow':
      _px(ctx, 2, 5, 12, 8, '#f5f5f2');
      _px(ctx, 3, 6, 4, 3, '#2b2b2b');
      _px(ctx, 9, 9, 4, 3, '#2b2b2b');
      _px(ctx, 4, 3, 3, 3, '#f5f5f2');
      _px(ctx, 3, 2, 1, 2, '#e8e8e8');
      _px(ctx, 6, 2, 1, 2, '#e8e8e8');
      _px(ctx, 3, 13, 2, 2, '#d8d8d8');
      _px(ctx, 10, 13, 2, 2, '#d8d8d8');
      break;
    case 'pig':
      _px(ctx, 3, 6, 10, 7, '#f0b8c0');
      _px(ctx, 5, 4, 6, 3, '#f0b8c0');
      _px(ctx, 6, 7, 4, 3, '#e89aa4');
      _px(ctx, 7, 8, 1, 1, '#a85a62');
      _px(ctx, 9, 8, 1, 1, '#a85a62');
      _px(ctx, 3, 13, 2, 2, '#d89aa2');
      _px(ctx, 9, 13, 2, 2, '#d89aa2');
      break;
    case 'tiger':
      _px(ctx, 2, 5, 12, 8, '#e0902c');
      _px(ctx, 3, 6, 2, 6, '#2b2b2b');
      _px(ctx, 7, 5, 2, 7, '#2b2b2b');
      _px(ctx, 11, 6, 2, 6, '#2b2b2b');
      _px(ctx, 4, 3, 6, 3, '#e0902c');
      _px(ctx, 4, 2, 1, 2, '#2b2b2b');
      _px(ctx, 9, 2, 1, 2, '#2b2b2b');
      break;
    case 'sheep':
      _px(ctx, 2, 4, 12, 9, '#f5f2e8');
      _px(ctx, 3, 3, 4, 3, '#f5f2e8');
      _px(ctx, 8, 3, 4, 3, '#f5f2e8');
      _px(ctx, 5, 6, 5, 4, '#e8e2cc');
      _px(ctx, 5, 8, 3, 3, '#4a4038');
      _px(ctx, 3, 13, 2, 2, '#4a4038');
      _px(ctx, 10, 13, 2, 2, '#4a4038');
      break;
    default:
      _px(ctx, 4, 4, 8, 8, '#cccccc');
  }
  return cnv;
}
