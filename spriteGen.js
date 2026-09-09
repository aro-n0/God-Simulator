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
  大工: { gatherBonus: { tree: 1.6, big_tree: 1.6 } },
  魔法使い: { gatherBonus: {} },
  商人: { gatherBonus: {} },
  農民: { gatherBonus: { tree: 1.1, stone: 1.1 }, farmBonus: 1.5 },
  鉱夫: { gatherBonus: { stone: 1.6, ore: 1.6 } },
  兵士: { gatherBonus: {}, huntBonus: 1.5 },
  漁師: { gatherBonus: {}, canFish: true },
  鍛冶師: { gatherBonus: { stone: 1.3, ore: 1.3 } },
  料理人: { gatherBonus: {} },
  酪農家: { gatherBonus: {} },
  狩人: { gatherBonus: {}, huntBonus: 1.6 },
  医師: { gatherBonus: {} },
  建築士: { gatherBonus: { tree: 1.2, stone: 1.2 } },
  吟遊詩人: { gatherBonus: {} },
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
  } else if (type === 'wheat') {
    // 麦: 縦の茎+穂先が扇状に広がる金色の穂
    _px(ctx, 5, 4, 2, 6, '#8a6a2c');
    _px(ctx, 2, 5, 2, 5, '#6e5424');
    _px(ctx, 8, 5, 2, 5, '#6e5424');
    _px(ctx, 3, 0, 6, 5, '#e0c23c');
    _px(ctx, 1, 2, 3, 4, '#e6cc55');
    _px(ctx, 8, 2, 3, 4, '#e6cc55');
  } else if (type === 'apple') {
    // リンゴ: 緑の樹冠に赤い実が複数実る様子
    _px(ctx, 3, 1, 6, 6, '#3f8a44');
    _px(ctx, 2, 3, 2, 2, '#c94b4b');
    _px(ctx, 8, 3, 2, 2, '#c94b4b');
    _px(ctx, 5, 6, 2, 2, '#c94b4b');
    _px(ctx, 5, 0, 1, 2, '#5a3d24');
  } else {
    // 野菜: 丸く重なる葉が広がるキャベツ状の株
    _px(ctx, 2, 3, 8, 6, '#2f6a34');
    _px(ctx, 3, 1, 6, 4, '#4fae5e');
    _px(ctx, 4, 4, 4, 4, '#8ae06e');
  }
  return cnv;
}

// ============ 超巨大ランドマーク用アイコン ============

// 超巨大樹(リゼロ・フリューゲル大樹を彷彿とさせる、雲を突き抜ける圧倒的な巨木)
function buildGiantTreeIcon() {
  const size = 64;
  const cnv = document.createElement('canvas');
  cnv.width = size; cnv.height = size;
  const ctx = cnv.getContext('2d');
  ctx.imageSmoothingEnabled = false;

  // 幾重にも層を重ねた広大な樹冠(外側は暗く、内側にいくほど明るい)
  _px(ctx, 2, 2, 60, 56, '#08200c');
  _px(ctx, 6, 6, 52, 48, '#0f3013');
  _px(ctx, 11, 4, 42, 14, '#0f3013');
  _px(ctx, 10, 10, 44, 40, '#173a1c');
  _px(ctx, 15, 15, 34, 32, '#1f4a24');
  _px(ctx, 20, 19, 24, 24, '#2c6531');
  _px(ctx, 24, 22, 16, 17, '#3f8a44');
  _px(ctx, 27, 24, 10, 10, '#57ab5c');

  // 雲を突き抜ける様子を示す白い雲霧の切れ端
  _px(ctx, 4, 8, 12, 5, 'rgba(255,255,255,0.55)');
  _px(ctx, 44, 3, 14, 6, 'rgba(255,255,255,0.5)');
  _px(ctx, 2, 24, 9, 4, 'rgba(255,255,255,0.4)');
  _px(ctx, 50, 20, 10, 4, 'rgba(255,255,255,0.4)');

  // 途方もない幹(年輪と根を強調)
  _px(ctx, 24, 46, 16, 16, '#2c1c10');
  _px(ctx, 27, 49, 10, 10, '#3d2a16');
  _px(ctx, 30, 52, 4, 4, '#523a1e');
  _px(ctx, 16, 58, 8, 4, '#2c1c10');
  _px(ctx, 40, 58, 8, 4, '#2c1c10');
  return cnv;
}

function buildScorchedGiantTreeIcon() {
  const size = 64;
  const cnv = document.createElement('canvas');
  cnv.width = size; cnv.height = size;
  const ctx = cnv.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  _px(ctx, 8, 6, 48, 52, '#150f0d');
  _px(ctx, 14, 12, 36, 40, '#241d19');
  _px(ctx, 20, 18, 24, 28, '#332a24');
  _px(ctx, 26, 24, 12, 18, '#463a32');
  // 焼け跡の裂け目(灰色のひび)
  _px(ctx, 30, 10, 4, 44, '#59493f');
  _px(ctx, 38, 30, 4, 24, '#59493f');
  _px(ctx, 22, 34, 4, 18, '#59493f');
  return cnv;
}

// 大穴の中心装飾(実際のクレーター形状はタイル側のholeDepthグラデーションで描画されるため、
// アイコン側は地形とズレて重なり破綻しないよう、最深部のごく小さな発光と亀裂・鉱脈の点描のみに留める)
function buildGiantHoleIcon() {
  const size = 20;
  const cnv = document.createElement('canvas');
  cnv.width = size; cnv.height = size;
  const ctx = cnv.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  const cx = size / 2, cy = size / 2;

  let seed = 91;
  const rand = () => { seed = (seed * 16807) % 2147483647; return (seed % 1000) / 1000; };

  // 最深部の淡い発光
  _px(ctx, cx - 1, cy - 1, 3, 3, 'rgba(150,190,255,0.55)');

  // 断崖の亀裂(中心から放射状に伸びる不規則な短い線)
  ctx.strokeStyle = 'rgba(10,6,3,0.7)';
  ctx.lineWidth = 1;
  for (let i = 0; i < 4; i++) {
    const angle = rand() * Math.PI * 2;
    const len = 5 + rand() * 5;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(angle) * 2, cy + Math.sin(angle) * 2);
    ctx.lineTo(cx + Math.cos(angle) * len, cy + Math.sin(angle) * len * 0.9);
    ctx.stroke();
  }

  // 鉱脈のきらめき(数点)
  const veins = [[3, 5], [15, 4], [2, 14], [16, 15]];
  veins.forEach(([vx, vy]) => _px(ctx, vx, vy, 2, 2, '#e6c85c'));

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
      // 胴体(オレンジ)+縞模様+耳+尻尾+顔立ちを明確化し、一目で虎とわかるように強化
      _px(ctx, 2, 6, 12, 7, '#e0902c');
      _px(ctx, 1, 7, 2, 4, '#e0902c'); // 尻尾の付け根
      _px(ctx, 0, 8, 2, 2, '#e0902c'); // 尻尾の先
      _px(ctx, 4, 3, 7, 4, '#e0902c'); // 頭
      _px(ctx, 3, 2, 2, 2, '#e0902c'); // 左耳
      _px(ctx, 9, 2, 2, 2, '#e0902c'); // 右耳
      _px(ctx, 3, 2, 1, 1, '#2b2b2b');
      _px(ctx, 10, 2, 1, 1, '#2b2b2b');
      // 縞模様
      _px(ctx, 3, 7, 1, 5, '#2b2b2b');
      _px(ctx, 6, 6, 1, 6, '#2b2b2b');
      _px(ctx, 9, 7, 1, 5, '#2b2b2b');
      _px(ctx, 12, 6, 1, 6, '#2b2b2b');
      _px(ctx, 5, 3, 1, 3, '#2b2b2b');
      _px(ctx, 8, 3, 1, 3, '#2b2b2b');
      // 顔(白い口元と目)
      _px(ctx, 5, 5, 4, 2, '#f5efe0');
      _px(ctx, 5, 4, 1, 1, '#f5c542');
      _px(ctx, 8, 4, 1, 1, '#f5c542');
      // 脚
      _px(ctx, 3, 13, 2, 2, '#c97a1c');
      _px(ctx, 10, 13, 2, 2, '#c97a1c');
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


// ============ 建築物アイコン(壁・屋根・ドアの基本構造にテーマ配色を適用) ============

const HOUSE_THEMES = {
  wood: { wall: '#a9793f', wallShade: '#8a5a35', roof: '#6b3a2b', roofShade: '#4a2818', door: '#3a2a18' },
  stone: { wall: '#a0a0a0', wallShade: '#7d7d7d', roof: '#5c5c5c', roofShade: '#3a3a3a', door: '#2b2b2b' },
  hide: { wall: '#e0902c', wallShade: '#b5701c', roof: '#6b4a2b', roofShade: '#4a3218', door: '#3a2a18' },
  clay: { wall: '#c9a86b', wallShade: '#a6874f', roof: '#8a5a35', roofShade: '#6b4226', door: '#3a2a18' },
  gold: { wall: '#d8c48a', wallShade: '#b89050', roof: '#e6c23c', roofShade: '#b89020', door: '#3a2a18' },
};

// 家(キャラクターの2倍ほどのサイズを想定した簡易ドット絵。壁+屋根+ドアの基本構造)
function buildHouseIcon(theme) {
  const size = 28;
  const cnv = document.createElement('canvas');
  cnv.width = size; cnv.height = size;
  const ctx = cnv.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  const t = HOUSE_THEMES[theme] || HOUSE_THEMES.wood;

  _px(ctx, 3, 14, 22, 12, t.wallShade);
  _px(ctx, 4, 13, 20, 12, t.wall);
  _px(ctx, 1, 10, 26, 5, t.roofShade);
  _px(ctx, 3, 6, 22, 6, t.roof);
  _px(ctx, 6, 3, 16, 4, t.roof);
  _px(ctx, 12, 18, 5, 8, t.door);
  _px(ctx, 7, 17, 3, 3, '#cde8f5');
  _px(ctx, 18, 17, 3, 3, '#cde8f5');
  if (theme === 'hide') {
    _px(ctx, 6, 15, 2, 9, t.wallShade);
    _px(ctx, 20, 15, 2, 9, t.wallShade);
  }
  return cnv;
}

// 大型建築物(キャラクターの4倍ほどのサイズ。二段屋根・柱・大扉を備えた壮麗な建物)
function buildLargeHouseIcon(theme) {
  const size = 48;
  const cnv = document.createElement('canvas');
  cnv.width = size; cnv.height = size;
  const ctx = cnv.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  const t = HOUSE_THEMES[theme] || HOUSE_THEMES.stone;

  _px(ctx, 4, 24, 40, 22, t.wallShade);
  _px(ctx, 6, 22, 36, 22, t.wall);
  _px(ctx, 1, 16, 46, 8, t.roofShade);
  _px(ctx, 5, 9, 38, 9, t.roof);
  _px(ctx, 11, 3, 26, 8, t.roof);
  _px(ctx, 8, 24, 3, 20, t.roofShade);
  _px(ctx, 37, 24, 3, 20, t.roofShade);
  _px(ctx, 20, 32, 8, 14, t.door);
  _px(ctx, 12, 28, 4, 4, '#cde8f5');
  _px(ctx, 32, 28, 4, 4, '#cde8f5');
  if (theme === 'gold') _px(ctx, 20, 3, 8, 3, '#f5e07a');
  return cnv;
}

function buildCampfireIcon() {
  const size = 14;
  const cnv = document.createElement('canvas');
  cnv.width = size; cnv.height = size;
  const ctx = cnv.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  _px(ctx, 2, 10, 10, 3, '#5c5c5c');
  _px(ctx, 5, 6, 2, 5, '#6b4a2b');
  _px(ctx, 4, 4, 6, 4, '#c94b1a');
  _px(ctx, 5, 2, 4, 4, '#e0902c');
  _px(ctx, 6, 0, 2, 3, '#f0c23c');
  return cnv;
}

// 消火状態(灰と濡れた薪)
function buildCampfireExtinguishedIcon() {
  const size = 14;
  const cnv = document.createElement('canvas');
  cnv.width = size; cnv.height = size;
  const ctx = cnv.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  _px(ctx, 2, 10, 10, 3, '#5c5c5c');
  _px(ctx, 4, 7, 6, 4, '#3a3a3a');
  _px(ctx, 5, 8, 4, 2, '#5a5a5a');
  _px(ctx, 3, 6, 2, 4, '#2b3a2b');
  _px(ctx, 9, 6, 2, 4, '#2b3a2b');
  return cnv;
}
