// animals.js
// 鶏(肉/羽/卵)・牛(牛乳/肉)・豚(肉)・虎(牙/皮、危険)・羊(羊毛/羊肉)の簡易エンティティ。
// map.animals 配列に格納され、main.jsのゲームループから updateAnimals() で毎フレーム更新される。

const ANIMAL_DEFS = {
  chicken: { amount: 3, respawnTime: 20, drops: ['egg', 'feather'], lethal: false, speed: 0.4 },
  cow: { amount: 3, respawnTime: 25, drops: ['milk'], lethal: false, speed: 0.3 },
  pig: { amount: 3, respawnTime: 30, drops: ['meat'], lethal: true, speed: 0.35 },
  tiger: { amount: 2, respawnTime: 60, drops: ['fang', 'hide'], lethal: true, speed: 0.9, dangerous: true },
  sheep: { amount: 3, respawnTime: 30, drops: ['meat'], lethal: true, speed: 0.32, shearCooldown: 12, woolDrop: 'wool' },
};

const ANIMAL_NAME_JP = { chicken: '鶏', cow: '牛', pig: '豚', tiger: '虎', sheep: '羊' };

// 動物専用の能力タグ(職業表示は不要のため代わりにこちらを表示する)
const ANIMAL_TRAIT_TAGS = {
  chicken: ['早起き', '目ざとい'],
  cow: ['マイペース', 'もぐもぐ'],
  pig: ['食いしんぼう', 'きれい好き'],
  tiger: ['百獣の王', '俊敏'],
  sheep: ['モコモコ(耐寒)', 'のんびり屋'],
};

const ANIMAL_MOOD_POOL = {
  default: ['のんびり過ごしている', '日向ぼっこ中', '辺りを見回している'],
  eating: ['草を食べている', 'もぐもぐ中'],
  wary: ['警戒している', 'すこし怯えている'],
  hunting: ['獲物を探している', '縄張りを見回っている'],
};

let _animalIdCounter = 1;

function makeAnimal(type, x, y) {
  const def = ANIMAL_DEFS[type];
  return {
    id: 'animal_' + _animalIdCounter++,
    type, x, y,
    amount: def.amount,
    maxAmount: def.amount,
    isAnimal: true,
    lethal: def.lethal,
    dangerous: !!def.dangerous,
    respawnTimer: 0,
    shearTimer: 0,
    wanderTarget: null,
    wanderTimer: 0,
    attackCooldown: 0,
  };
}

function getAnimalDisplayName(type) {
  return ANIMAL_NAME_JP[type] || type;
}

function getAnimalTraits(type) {
  return ANIMAL_TRAIT_TAGS[type] || [];
}

function getAnimalMood(animal) {
  if (animal.amount <= 0) return '休んでいる';
  const def = ANIMAL_DEFS[animal.type];
  let pool = ANIMAL_MOOD_POOL.default;
  if (def.dangerous) pool = ANIMAL_MOOD_POOL.hunting;
  else if (animal.type === 'sheep' || animal.type === 'cow') pool = ANIMAL_MOOD_POOL.eating;
  else if (animal.amount < animal.maxAmount) pool = ANIMAL_MOOD_POOL.wary;
  return pool[Math.floor(Math.random() * pool.length)];
}

// 動物の徘徊・被採取後の再湧きを処理する
function updateAnimals(map, dt) {
  for (const a of map.animals) {
    a.attackCooldown = Math.max(0, a.attackCooldown - dt);
    a.shearTimer = Math.max(0, a.shearTimer - dt);

    if (a.amount <= 0) {
      a.respawnTimer -= dt;
      if (a.respawnTimer <= 0) {
        let tries = 0;
        do {
          a.x = Math.floor(Math.random() * map.width);
          a.y = Math.floor(Math.random() * map.height);
          tries++;
        } while (!map.isWalkable(a.x, a.y) && tries < 50);
        a.amount = a.maxAmount;
      }
      continue;
    }

    const def = ANIMAL_DEFS[a.type];
    a.wanderTimer -= dt;
    if (!a.wanderTarget || a.wanderTimer <= 0) {
      const angle = Math.random() * Math.PI * 2;
      const dist = 2 + Math.random() * 4;
      a.wanderTarget = {
        x: Math.max(1, Math.min(map.width - 2, a.x + Math.cos(angle) * dist)),
        y: Math.max(1, Math.min(map.height - 2, a.y + Math.sin(angle) * dist)),
      };
      a.wanderTimer = 4 + Math.random() * 4;
    }
    const dx = a.wanderTarget.x - a.x;
    const dy = a.wanderTarget.y - a.y;
    const d = Math.hypot(dx, dy);
    if (d > 0.1) {
      const step = Math.min(def.speed * dt, d);
      const nx = a.x + (dx / d) * step;
      const ny = a.y + (dy / d) * step;
      if (map.isWalkable(nx, ny)) { a.x = nx; a.y = ny; }
    }
  }
}

// 討伐(致死)による資源獲得。amountが0になれば respawnTimer 開始
function harvestAnimal(animal) {
  const def = ANIMAL_DEFS[animal.type];
  const drop = def.drops[Math.floor(Math.random() * def.drops.length)];
  animal.amount -= 1;
  if (animal.amount <= 0) animal.respawnTimer = def.respawnTime;
  return drop;
}

// 羊毛刈り(非致死・クールダイン制、羊のみ)。刈れない場合はnullを返す
function shearAnimal(animal) {
  if (animal.type !== 'sheep') return null;
  if (animal.shearTimer > 0) return null;
  animal.shearTimer = ANIMAL_DEFS.sheep.shearCooldown;
  return ANIMAL_DEFS.sheep.woolDrop;
}
