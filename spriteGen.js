// spriteGen.js
// 名前・性格プロンプトのテキストを解析し、16x16ドット絵と行動ステータスを自動生成する。

// テンプレート: . 透明 / H 髪 / S 肌 / E 目 / C 服 / P ズボン・靴 / O アウトライン
const CHIBI_TEMPLATE = [
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

// 帽子オーバーレイ（先頭数行に重ねる）
const HAT_OVERLAY = ['...GGGGGGGGGG...', '..GGGGGGGGGGGG..', '..GG........GG..'];

const COLOR_KEYWORDS = {
  赤: '#c94b4b', あか: '#c94b4b', レッド: '#c94b4b',
  青: '#4b7bc9', あお: '#4b7bc9', ブルー: '#4b7bc9',
  緑: '#4fae5e', みどり: '#4fae5e', グリーン: '#4fae5e',
  黄: '#e0c23c', きいろ: '#e0c23c', イエロー: '#e0c23c',
  黒: '#2b2b2b', くろ: '#2b2b2b', ブラック: '#2b2b2b',
  白: '#eeeeee', しろ: '#eeeeee', ホワイト: '#eeeeee',
  茶: '#8a5a35', ちゃ: '#8a5a35', ブラウン: '#8a5a35',
  紫: '#8a4fae', むらさき: '#8a4fae', パープル: '#8a4fae',
  金: '#e6c85c', きん: '#e6c85c', ゴールド: '#e6c85c',
  銀: '#c9c9d4', ぎん: '#c9c9d4',
  ピンク: '#e08bb0', 桃: '#e08bb0',
  オレンジ: '#e08b3c', 橙: '#e08b3c',
};

const SKIN_TONES = ['#f2c9a0', '#e0ac7a', '#c98a55', '#8a5a35'];

const JOB_KEYWORDS = {
  木こり: { gatherBonus: { tree: 1.6 }, hat: false, clothesColor: '#6b4a2b' },
  きこり: { gatherBonus: { tree: 1.6 }, hat: false, clothesColor: '#6b4a2b' },
  魔法使い: { gatherBonus: {}, hat: true, hatColor: '#4b3b8a', clothesColor: '#4b3b8a' },
  商人: { gatherBonus: {}, hat: false, clothesColor: '#b08a3c' },
  農民: { gatherBonus: { tree: 1.1, stone: 1.1 }, hat: false, clothesColor: '#7a9a4a' },
  鉱夫: { gatherBonus: { stone: 1.6 }, hat: false, clothesColor: '#5a5a5a' },
  兵士: { gatherBonus: {}, hat: false, clothesColor: '#8a2b2b' },
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

// プロンプトテキストを解析してドット絵パラメータ＋行動ステータスを生成
function parsePromptToParams(name, prompt) {
  const seed = hashStringToSeed(name + '::' + prompt);
  const rand = mulberry32(seed);

  const foundColors = [];
  for (const key in COLOR_KEYWORDS) {
    if (prompt.includes(key)) foundColors.push(COLOR_KEYWORDS[key]);
  }

  let job = null;
  let jobKey = null;
  for (const key in JOB_KEYWORDS) {
    if (prompt.includes(key)) {
      job = JOB_KEYWORDS[key];
      jobKey = key;
      break;
    }
  }

  const hairColor = foundColors[0] || pickFromArray(rand, ['#3b2b1e', '#8a5a35', '#c94b4b', '#4b3b8a', '#e6c85c', '#2b2b2b']);
  let clothesColor = foundColors[1] || foundColors[0];
  if (!clothesColor) clothesColor = (job && job.clothesColor) || pickFromArray(rand, ['#4b7bc9', '#4fae5e', '#8a2b2b', '#7a9a4a', '#b08a3c']);

  let personality = { speedMul: 1, restThreshold: 20, gatherEffMul: 1, gatherPersist: 1 };
  for (const key in PERSONALITY_KEYWORDS) {
    if (prompt.includes(key)) personality = Object.assign({}, personality, PERSONALITY_KEYWORDS[key]);
  }

  const skinTone = pickFromArray(rand, SKIN_TONES);
  const hasHat = !!(job && job.hat) || prompt.includes('帽子') || prompt.includes('魔法');
  const hatColor = (job && job.hatColor) || pickFromArray(rand, ['#4b3b8a', '#8a2b2b', '#2b2b2b']);

  return {
    name: name || '名無し',
    prompt: prompt || '',
    seed,
    hairColor,
    clothesColor,
    skinTone,
    hasHat,
    hatColor,
    job: jobKey,
    gatherBonus: (job && job.gatherBonus) || {},
    speed: 0.9 * (personality.speedMul || 1),
    restThreshold: personality.restThreshold || 20,
    gatherEffMul: personality.gatherEffMul || 1,
    gatherPersist: personality.gatherPersist || 1,
  };
}

// パラメータから16x16オフスクリーンcanvasのドット絵を構築
function buildSpriteCanvas(params) {
  const size = 16;
  const cnv = document.createElement('canvas');
  cnv.width = size;
  cnv.height = size;
  const ctx = cnv.getContext('2d');
  ctx.imageSmoothingEnabled = false;

  const colorMap = {
    H: params.hairColor,
    S: params.skinTone,
    C: params.clothesColor,
    E: '#1a1a1a',
    P: '#3a3a3a',
    O: '#1a1a1a',
  };

  for (let y = 0; y < size; y++) {
    const row = CHIBI_TEMPLATE[y];
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
          ctx.fillStyle = params.hatColor;
          ctx.fillRect(x, y, 1, 1);
        }
      }
    }
  }

  return cnv;
}
