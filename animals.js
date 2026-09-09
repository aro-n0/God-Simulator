// animals.js
// 鶏・牛・豚・虎・羊の簡易エンティティ。ドロップ品は厳密定義アイテム一覧に準拠する。
// 通常のふれあい(乳搾り/採卵/毛刈り)は非致死でamountを繰り返し消費でき、
// amountが尽きる最後の一撃だけ食肉がドロップして再湧きする。
// 虎のみ危険な討伐対象で、HP/防御力/攻撃力/攻撃速度を持ち反撃してくる。

const ANIMAL_DEFS = {
  chicken: { amount: 3, respawnTime: 20, drops: ['羽'], meatDrop: '鶏肉', lethal: false, speed: 0.4, def: 0, atk: 0, eggCooldown: 10, eggDrop: '卵' },
  cow: { amount: 3, respawnTime: 25, drops: ['牛乳'], meatDrop: '牛肉', lethal: false, speed: 0.3, def: 1, atk: 0 },
  pig: { amount: 3, respawnTime: 30, drops: [], meatDrop: '豚肉', lethal: true, speed: 0.35, def: 1, atk: 0 },
  sheep: { amount: 3, respawnTime: 30, drops: [], meatDrop: '羊肉', lethal: true, speed: 0.32, shearCooldown: 12, woolDrop: '羊毛', def: 1, atk: 0 },
  tiger: {
    amount: 60, respawnTime: 90, drops: [], meatDrop: null, huntDrops: ['牙', '虎皮'],
    lethal: true, dangerous: true, speed: 0.9, def: 8, atk: 18, atkSpeed: 0.7,
  },
};

const ANIMAL_NAME_JP = { chicken: '鶏', cow: '牛', pig: '豚', tiger: '虎', sheep: '羊' };

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
    def: def.def || 0,
    atk: def.atk || 0,
    atkSpeed: def.atkSpeed || 1,
    attackTimer: 0,
    respawnTimer: 0,
    shearTimer: 0,
    eggTimer: 0,
    wanderTarget: null,
    wanderTimer: 0,
    hunger: type === 'tiger' ? 100 : undefined, // 虎のみ空腹ゲージを持つ(3ゲーム日で100→0)
    huntTarget: null,
  };
}

const ANIMAL_HUNGER_RATE = 100 / (3 * 24 * 60); // 人間と同じ基準速度(3ゲーム日で100→0)

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
    a.attackTimer = Math.max(0, a.attackTimer - dt);
    a.shearTimer = Math.max(0, a.shearTimer - dt);
    a.eggTimer = Math.max(0, a.eggTimer - dt);
    if (a.type === 'tiger') a.hunger = Math.max(0, (a.hunger == null ? 100 : a.hunger) - dt * ANIMAL_HUNGER_RATE);

    if (a.amount <= 0) {
      a.respawnTimer -= dt;
      if (a.respawnTimer <= 0) {
        let tries = 0;
        do {
          a.x = Math.floor(Math.random() * map.width);
          a.y = Math.floor(Math.random() * map.height);
          tries++;
        } while ((!map.isWalkable(a.x, a.y) || map.isWaterTile(a.x, a.y)) && tries < 50);
        a.amount = a.maxAmount;
      }
      continue;
    }

    const def = ANIMAL_DEFS[a.type];
    if (a.huntTarget) continue; // 空腹の虎が捕食対象を追跡中は main.js側の専用ロジックに移動を委ねる
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
      const waterMul = map.isWaterTile(a.x, a.y) ? 0.5 : 1;
      const step = Math.min(def.speed * waterMul * dt, d);
      const nx = a.x + (dx / d) * step;
      const ny = a.y + (dy / d) * step;
      if (map.isWalkable(nx, ny) && !map.isWaterTile(nx, ny)) { a.x = nx; a.y = ny; }
    }
  }
}

// 非致死のふれあい(乳搾り/採卵等)。amountが尽きる最後の一撃は食肉がドロップする
function harvestAnimal(animal) {
  const def = ANIMAL_DEFS[animal.type];
  animal.amount -= 1;
  let drop;
  if (animal.amount <= 0) {
    drop = def.meatDrop || (def.drops.length ? def.drops[0] : null);
    animal.respawnTimer = def.respawnTime;
  } else {
    drop = def.drops.length ? def.drops[Math.floor(Math.random() * def.drops.length)] : def.meatDrop;
  }
  return drop;
}

// 羊毛刈り(非致死・クールダウン制、羊のみ)。刈れない場合はnullを返す
function shearAnimal(animal) {
  if (animal.type !== 'sheep') return null;
  if (animal.shearTimer > 0) return null;
  animal.shearTimer = ANIMAL_DEFS.sheep.shearCooldown;
  return ANIMAL_DEFS.sheep.woolDrop;
}

// 採卵(非致死・クールダウン制、鶏のみ)。生めない場合はnullを返す
function layEgg(animal) {
  if (animal.type !== 'chicken') return null;
  const def = ANIMAL_DEFS.chicken;
  if (animal.eggTimer > 0) return null;
  animal.eggTimer = def.eggCooldown;
  return def.eggDrop;
}

// 虎討伐(危険な討伐対象)。ダメージ計算はmax(0, 攻撃力-防御力)。倒すと牙/虎皮をドロップする
function attackDangerousAnimal(animal, attackerAtk) {
  const damage = Math.max(0, attackerAtk - animal.def);
  animal.amount = Math.max(0, animal.amount - damage);
  if (animal.amount <= 0) {
    const def = ANIMAL_DEFS[animal.type];
    animal.respawnTimer = def.respawnTime;
    return def.huntDrops || [];
  }
  return null;
}
