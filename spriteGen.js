// spriteGen.js
// 16x16ドット絵のシルエット(テンプレート)・配色パレット・生成/解析ロジック。
// 外見(ランダム生成/手動カラー)とステータス(プロンプト解析)は分離して扱う。

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

// ヘアスタイルごとの行オーバーライド（シルエットの差分）
const HAIRSTYLE_OVERRIDES = {
  short: {},
  bald: {
    0: '................',
    1: '...SSSSSSSSSS...',
    2: '..SSSSSSSSSSSS..',
    3: '..SSSSSSSSSSSS..',
  },
  long: {
    8: '..HCCCCCCCCCCH..',
    9: '.HCCCCCCCCCCCCH.',
  },
};

const HAT_OVERLAY = ['...GGGGGGGGGG...', '..GGGGGGGGGGGG..', '..GG........GG..'];

// 人間らしい自然な色調のみに制限したパレット（肌・髪）
const NATURAL_SKIN_TONES = ['#ffe0bd', '#f2c9a0', '#e0ac7a', '#c98a55', '#a86b3c', '#8a5a35', '#6b4226', '#4a2c17'];
const NATURAL_HAIR_COLORS = ['#1b1b1b', '#3b2b1e', '#5a3d24', '#8a5a35', '#c99b57', '#e6c85c', '#9a4b2b', '#9a9a9a', '#e8e8e8'];
const CLOTHES_COLOR_CHOICES = ['#4b7bc9', '#4fae5e', '#8a2b2b', '#7a9a4a', '#b08a3c', '#8a4fae', '#c9a13c', '#3c8ac9'];
const HAT_COLOR_CHOICES = ['#4b3b8a', '#8a2b2b', '#2b2b2b', '#3c6b8a'];
const HAIRSTYLE_CHOICES = ['short', 'short', 'long', 'long', 'bald'];

const JOB_KEYWORDS = {
  木こり: { gatherBonus: { tree: 1.6 } },
  きこり: { gatherBonus: { tree: 1.6 } },
  魔法使い: { gatherBonus: {} },
  商人: { gatherBonus: {} },
  農民: { gatherBonus: { tree: 1.1, stone: 1.1 } },
  鉱夫: { gatherBonus: { stone: 1.6 } },
  兵士: { gatherBonus: {} },
};

const PERSONALITY_KEYWORDS = {
  頑固: { speedMul: 0.9, restThreshold: 15, gatherPersist: 1.4 },
  元気: { speedMul: 1.3, restThreshold: 25 },
  のんびり: { speedMul: 0.7, restThreshold: 35 },
  ドジ: { gatherEffMul: 0.7 },
  真面目: { gatherEffMul: 1.3 },
  怠け: { gatherEffMul: 0.6, restThreshold: 40 },
  優しい: { restThreshold: 30 },
  慎重: { speedMul: 0.85 },
};

const LIKE_POOL = ['昼寝', 'おしゃべり', '焚き火', '晴れの日', '甘いもの', '散歩', '歌うこと', '星空', '川遊び', '焼き芋'];
const DISLIKE_POOL = ['雨', '虫', '早起き', '大きな音', '辛いもの', '寒さ', '暑さ', '力仕事', '待つこと', '暗い場所'];

function hashStringToSeed(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (Math.imul(31, h) + str.charCodeAt(i)) | 0;
  }
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

// プロンプトテキストから職業・性格ステータスと初期の好き嫌いを解析する（外見は含まない）
function deriveStatsFromPrompt(name, prompt) {
  name = name || '名無し';
  prompt = prompt || '';
  const seed = hashStringToSeed(name + '::' + prompt + '::' + Date.now());
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

  let personality = { speedMul: 1, restThreshold: 20, gatherEffMul: 1, gatherPersist: 1 };
  for (const key in PERSONALITY_KEYWORDS) {
    if (prompt.includes(key)) personality = Object.assign({}, personality, PERSONALITY_KEYWORDS[key]);
  }

  return {
    name,
    prompt,
    seed,
    job: jobKey,
    gatherBonus: (job && job.gatherBonus) || {},
    speed: 0.9 * (personality.speedMul || 1),
    restThreshold: personality.restThreshold || 20,
    gatherEffMul: personality.gatherEffMul || 1,
    gatherPersist: personality.gatherPersist || 1,
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

// パラメータから16x16オフスクリーンcanvasのドット絵を構築
function buildSpriteCanvas(params) {
  const size = 16;
  const cnv = document.createElement('canvas');
  cnv.width = size;
  cnv.height = size;
  const ctx = cnv.getContext('2d');
  ctx.imageSmoothingEnabled = false;

  const template = getTemplateForStyle(params.hairStyle || 'short');
  const colorMap = {
    H: params.hairColor,
    S: params.skinTone,
    C: params.clothesColor,
    E: '#1a1a1a',
    P: '#3a3a3a',
    O: '#1a1a1a',
  };

  for (let y = 0; y < size; y++) {
    const row = template[y];
    for (let x = 0; x < size; x++) {
      const ch = row[x];
      const color = colorMap[ch];
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
