// itemRegistry.js
// 「原木/木材/枝/伝説の枝/リンゴ/小麦/野菜/牛肉/牛乳/羊毛/羊肉/豚肉/鶏肉/羽/卵/牙/虎皮/
//  土/砂/石/石材/鉄鉱石/鉄/金鉱石/金/水」の25種を基礎アイテムとして厳密定義する。
// これ以外の未定義アイテム(旧バージョンの'bread'や'fish'等)はゲームロジック側から排除済み。
// AIが素材から新アイテム(道具・武器・防具・容器)を動的に創出する際は、
// スタック可否(ツール/装備/容器=不可、素材/食料=可)を自動判定し、
// 16x16の陰影付きドット絵アイコンを動的生成する。

const BASE_ITEMS = [
  '原木', '木材', '枝', '伝説の枝', 'リンゴ', '小麦', '野菜', '牛肉', '牛乳', '羊毛', '羊肉',
  '豚肉', '鶏肉', '羽', '卵', '牙', '虎皮', '土', '砂', '石', '石材', '鉄鉱石', '鉄', '金鉱石', '金', '水',
];
const BASE_ITEM_SET = new Set(BASE_ITEMS);

const MATERIAL_BASE_COLORS = {
  原木: '#6b4a2b', 木材: '#a9793f', 枝: '#8a6a3f', 伝説の枝: '#d4a843', リンゴ: '#c94b4b',
  小麦: '#e0c23c', 野菜: '#4fae5e', 牛肉: '#b5544a', 牛乳: '#f5f2e8', 羊毛: '#f0ece0',
  羊肉: '#c46a5a', 豚肉: '#e8a0a8', 鶏肉: '#e8c4a0', 羽: '#f5f0e0', 卵: '#f5e6c8', 牙: '#eae4d0',
  虎皮: '#e0902c', 土: '#6b4a2b', 砂: '#d8c48a', 石: '#8a8a8a', 石材: '#a0a0a0',
  鉄鉱石: '#a08070', 鉄: '#c0c0c8', 金鉱石: '#b89050', 金: '#e6c23c', 水: '#4a8ac9',
};

// AIが動的に創出したアイテムの定義を保持するレジストリ({id: {category, materials, stackable, atkBonus, defBonus, color}})
const DYNAMIC_ITEM_REGISTRY = {};

// 水入り容器はレシピ経由ではなく給水時に生成されるため、あらかじめカテゴリ登録しておく
registerDynamicItem('水入りバケツ', 'container', 0, 0, MATERIAL_BASE_COLORS['水']);
registerDynamicItem('水入りコップ', 'container', 0, 0, MATERIAL_BASE_COLORS['水']);

function clamp255(v) { return Math.max(0, Math.min(255, v)); }

function shadeColor(hex, amt) {
  const num = parseInt(hex.replace('#', ''), 16);
  const r = clamp255(((num >> 16) & 0xff) + amt);
  const g = clamp255(((num >> 8) & 0xff) + amt);
  const b = clamp255((num & 0xff) + amt);
  return `rgb(${r},${g},${b})`;
}

// アイテムのスタック上限を返す(素材/食料=99、道具/武器/防具/容器=1)
function getItemStackLimit(itemId) {
  if (BASE_ITEM_SET.has(itemId)) return 99;
  const def = DYNAMIC_ITEM_REGISTRY[itemId];
  if (def && def.stackable === false) return 1;
  return 99;
}

function isEquipment(itemId) {
  const def = DYNAMIC_ITEM_REGISTRY[itemId];
  return !!(def && (def.category === 'weapon' || def.category === 'armor'));
}

function getEquipmentBonus(itemId) {
  const def = DYNAMIC_ITEM_REGISTRY[itemId];
  if (!def) return { atk: 0, def: 0 };
  return { atk: def.atkBonus || 0, def: def.defBonus || 0 };
}

// ============ AIによる新アイテムの動的創出(クラフト) ============
// キャラクターの手持ち素材を評価し、道具/武器/防具/容器のいずれかを組み立てる。
// カテゴリごとにスタック可否を自動判定して登録する。

const CRAFT_RECIPES = [
  { material: '鉄', need: 5, name: '鉄の剣', category: 'weapon', atkBonus: 8, defBonus: 0 },
  { material: '鉄', need: 5, name: '鉄の鎧', category: 'armor', atkBonus: 0, defBonus: 8 },
  { material: '石材', need: 5, name: '石の斧', category: 'tool', atkBonus: 2, defBonus: 0 },
  { material: '石材', need: 8, name: '石造りの盾', category: 'armor', atkBonus: 0, defBonus: 5 },
  { material: '木材', need: 6, name: '木の棍棒', category: 'weapon', atkBonus: 3, defBonus: 0 },
  { material: '木材', need: 6, name: '木の盾', category: 'armor', atkBonus: 0, defBonus: 3 },
  { material: '虎皮', need: 2, name: '虎皮のマント', category: 'armor', atkBonus: 0, defBonus: 6 },
  { material: '牙', need: 3, name: '牙の短剣', category: 'weapon', atkBonus: 6, defBonus: 0 },
  // 資格に必須の専用道具(全てスタック不可の道具として登録)
  { material: '鉄', need: 3, name: 'つるはし', category: 'tool', atkBonus: 1, defBonus: 0 },
  { material: '鉄', need: 2, name: 'クワ', category: 'tool', atkBonus: 0, defBonus: 0 },
  { material: '鉄', need: 2, name: 'ハサミ', category: 'tool', atkBonus: 0, defBonus: 0 },
  { material: '鉄', need: 3, name: '調理器具', category: 'tool', atkBonus: 0, defBonus: 0 },
  { material: '伝説の枝', need: 1, name: '杖', category: 'tool', atkBonus: 2, defBonus: 0 },
  { material: '鉄', need: 2, name: 'バケツ', category: 'tool', atkBonus: 0, defBonus: 0 },
  { material: '土', need: 3, name: 'コップ', category: 'tool', atkBonus: 0, defBonus: 0 },
];

// 水を汲むための空の容器(所持していないと水は採取できない)
const WATER_CONTAINERS = { バケツ: '水入りバケツ', コップ: '水入りコップ' };

// カテゴリからスタック可否を自動判定(ツール/装備/容器=不可、素材/食料=可)
function determineStackable(category) {
  return !(category === 'tool' || category === 'weapon' || category === 'armor' || category === 'container');
}

function registerDynamicItem(name, category, atkBonus, defBonus, color) {
  if (!DYNAMIC_ITEM_REGISTRY[name]) {
    DYNAMIC_ITEM_REGISTRY[name] = {
      category, atkBonus: atkBonus || 0, defBonus: defBonus || 0,
      stackable: determineStackable(category),
      color: color || MATERIAL_BASE_COLORS[name] || '#999999',
    };
  }
  return DYNAMIC_ITEM_REGISTRY[name];
}

// characterの所持素材を見て、条件を満たせば1つクラフトする(呼び出し元でクールダウン管理)
function craftDynamicItem(character) {
  for (const recipe of CRAFT_RECIPES) {
    if (character.getItemCount(recipe.material) >= recipe.need) {
      const removed = character.removeFromInventory(recipe.material, recipe.need);
      if (removed < recipe.need) continue;
      registerDynamicItem(recipe.name, recipe.category, recipe.atkBonus, recipe.defBonus, MATERIAL_BASE_COLORS[recipe.material]);
      character.addToInventory(recipe.name, 1);
      return recipe.name;
    }
  }
  return null;
}

// ============ ドット絵アイコンの動的生成(16x16・陰影/ハイライト付き) ============

function _ipx(ctx, x, y, w, h, color) {
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w, h);
}

// 主要な素材/食料アイテムの専用ドット絵(汎用の塊シルエットより先に判定される)
const SPECIFIC_ITEM_ICONS = {
  原木: (ctx) => { // 丸太(木口の年輪が見える横倒しの丸太)
    _ipx(ctx, 1, 5, 14, 6, '#5a3d24');
    _ipx(ctx, 1, 5, 14, 1, '#6b4a2b');
    _ipx(ctx, 0, 4, 3, 8, '#a9793f');
    _ipx(ctx, 1, 5, 1, 6, '#8a5a35');
    _ipx(ctx, 13, 4, 3, 8, '#a9793f');
    _ipx(ctx, 14, 6, 1, 4, '#c9a35f');
  },
  枝: (ctx) => {
    _ipx(ctx, 2, 12, 3, 2, '#5a3d24');
    _ipx(ctx, 4, 9, 4, 3, '#6b4a2b');
    _ipx(ctx, 7, 6, 4, 3, '#7a5a35');
    _ipx(ctx, 10, 3, 3, 3, '#8a6a45');
  },
  伝説の枝: (ctx) => {
    _ipx(ctx, 2, 12, 3, 2, '#5a3d24');
    _ipx(ctx, 4, 9, 4, 3, '#8a6a2c');
    _ipx(ctx, 7, 6, 4, 3, '#c9a13c');
    _ipx(ctx, 10, 3, 3, 3, '#f0d060');
  },
  木材: (ctx) => { // 板材
    _ipx(ctx, 2, 3, 12, 3, '#a9793f');
    _ipx(ctx, 2, 7, 12, 3, '#8a6a3f');
    _ipx(ctx, 2, 11, 12, 3, '#a9793f');
    _ipx(ctx, 2, 3, 12, 1, '#c9a35f');
    _ipx(ctx, 2, 7, 12, 1, '#c9a35f');
  },
  石: (ctx) => {
    _ipx(ctx, 3, 6, 10, 7, '#5c5c5c');
    _ipx(ctx, 4, 4, 8, 6, '#7d7d7d');
    _ipx(ctx, 6, 3, 4, 3, '#9a9a9a');
    _ipx(ctx, 5, 10, 3, 2, '#3a3a3a');
  },
  石材: (ctx) => {
    _ipx(ctx, 2, 4, 12, 8, '#a0a0a0');
    _ipx(ctx, 2, 4, 12, 2, '#c0c0c0');
    _ipx(ctx, 2, 10, 12, 2, '#7d7d7d');
    _ipx(ctx, 7, 4, 1, 8, '#7d7d7d');
  },
  砂: (ctx) => {
    _ipx(ctx, 2, 10, 12, 4, '#d8c48a');
    _ipx(ctx, 3, 7, 10, 5, '#e0cf9a');
    _ipx(ctx, 5, 5, 6, 4, '#ecdcae');
  },
  土: (ctx) => {
    _ipx(ctx, 2, 9, 12, 5, '#5a3d24');
    _ipx(ctx, 3, 6, 10, 5, '#6b4a2b');
    _ipx(ctx, 5, 4, 6, 4, '#7a5a35');
  },
  リンゴ: (ctx) => {
    _ipx(ctx, 4, 5, 8, 8, '#c94b4b');
    _ipx(ctx, 9, 6, 3, 5, '#a83a3a');
    _ipx(ctx, 5, 6, 3, 3, '#e06a6a');
    _ipx(ctx, 7, 2, 2, 3, '#5a3d24');
    _ipx(ctx, 9, 2, 3, 2, '#4fae5e');
  },
  野菜: (ctx) => { // にんじん
    _ipx(ctx, 6, 6, 5, 8, '#e0902c');
    _ipx(ctx, 7, 7, 3, 6, '#f0a83c');
    _ipx(ctx, 8, 10, 1, 3, '#c9781c');
    _ipx(ctx, 5, 1, 2, 6, '#4fae5e');
    _ipx(ctx, 8, 0, 2, 6, '#3f8a44');
    _ipx(ctx, 7, 2, 2, 5, '#57ab5c');
  },
  小麦: (ctx) => {
    _ipx(ctx, 7, 6, 2, 9, '#8a6a2c');
    _ipx(ctx, 3, 3, 3, 6, '#e0c23c');
    _ipx(ctx, 10, 3, 3, 6, '#e0c23c');
    _ipx(ctx, 6, 0, 4, 5, '#e6cc55');
    _ipx(ctx, 4, 2, 2, 3, '#f0d060');
    _ipx(ctx, 10, 2, 2, 3, '#f0d060');
  },
  パン: (ctx) => {
    _ipx(ctx, 2, 7, 12, 6, '#c9954a');
    _ipx(ctx, 3, 5, 10, 4, '#e0b06a');
    _ipx(ctx, 5, 6, 6, 2, '#f0c888');
    _ipx(ctx, 5, 9, 2, 2, '#a9793f');
    _ipx(ctx, 9, 9, 2, 2, '#a9793f');
  },
  牛乳: (ctx) => { // 瓶
    _ipx(ctx, 6, 1, 4, 3, '#e8e8e8');
    _ipx(ctx, 5, 4, 6, 2, '#f5f5f2');
    _ipx(ctx, 4, 6, 8, 8, '#f5f5f2');
    _ipx(ctx, 4, 6, 8, 3, '#dfe8f0');
    _ipx(ctx, 5, 7, 2, 2, '#ffffff');
  },
  牛肉: (ctx) => {
    _ipx(ctx, 3, 4, 10, 8, '#b5544a');
    _ipx(ctx, 4, 5, 8, 3, '#d97a6e');
    _ipx(ctx, 5, 9, 6, 2, '#f5f0e0');
    _ipx(ctx, 4, 4, 2, 8, '#8a3a32');
  },
  豚肉: (ctx) => {
    _ipx(ctx, 3, 4, 10, 8, '#e8a0a8');
    _ipx(ctx, 4, 5, 8, 3, '#f0c0c6');
    _ipx(ctx, 5, 9, 6, 2, '#f5f0e0');
    _ipx(ctx, 4, 4, 2, 8, '#c97a82');
  },
  鶏肉: (ctx) => {
    _ipx(ctx, 4, 5, 8, 7, '#e8c4a0');
    _ipx(ctx, 5, 6, 6, 3, '#f0dcc0');
    _ipx(ctx, 6, 3, 4, 3, '#f5e6c8');
    _ipx(ctx, 6, 10, 4, 2, '#d9a878');
  },
  羊肉: (ctx) => {
    _ipx(ctx, 3, 4, 10, 8, '#c46a5a');
    _ipx(ctx, 4, 5, 8, 3, '#dc8a7a');
    _ipx(ctx, 5, 9, 6, 2, '#f5f0e0');
  },
  魚: (ctx) => {
    _ipx(ctx, 3, 6, 8, 4, '#c9d4e0');
    _ipx(ctx, 10, 5, 4, 6, '#a8b8c9');
    _ipx(ctx, 4, 7, 3, 2, '#e8eef2');
    _ipx(ctx, 5, 7, 1, 1, '#2b2b2b');
    _ipx(ctx, 3, 7, 2, 2, '#8a9ba8');
  },
  卵: (ctx) => {
    _ipx(ctx, 5, 4, 6, 9, '#f5e6c8');
    _ipx(ctx, 6, 3, 4, 2, '#faf0d8');
    _ipx(ctx, 6, 9, 3, 3, '#e8d4a8');
  },
  羽: (ctx) => {
    _ipx(ctx, 7, 2, 2, 10, '#e8e8e8');
    _ipx(ctx, 5, 3, 6, 6, '#f5f0e0');
    _ipx(ctx, 6, 4, 4, 4, '#ffffff');
    _ipx(ctx, 7, 11, 2, 3, '#d9c9a8');
  },
  羊毛: (ctx) => {
    _ipx(ctx, 3, 5, 10, 8, '#f0ece0');
    _ipx(ctx, 4, 3, 4, 4, '#f5f2e8');
    _ipx(ctx, 9, 3, 4, 4, '#f5f2e8');
    _ipx(ctx, 5, 10, 6, 2, '#dcd6c4');
  },
  牙: (ctx) => {
    _ipx(ctx, 7, 2, 3, 10, '#eae4d0');
    _ipx(ctx, 8, 2, 1, 10, '#f5f0e0');
    _ipx(ctx, 7, 11, 3, 2, '#c9c0a0');
  },
  虎皮: (ctx) => {
    _ipx(ctx, 2, 3, 12, 10, '#e0902c');
    _ipx(ctx, 4, 4, 2, 3, '#2b2b2b');
    _ipx(ctx, 8, 5, 2, 3, '#2b2b2b');
    _ipx(ctx, 5, 9, 2, 3, '#2b2b2b');
    _ipx(ctx, 10, 8, 2, 3, '#2b2b2b');
  },
  鉄鉱石: (ctx) => {
    _ipx(ctx, 3, 5, 10, 8, '#5c5c5c');
    _ipx(ctx, 4, 4, 8, 6, '#6e6e6e');
    _ipx(ctx, 6, 6, 3, 3, '#a08070');
    _ipx(ctx, 9, 8, 2, 2, '#a08070');
  },
  鉄: (ctx) => {
    _ipx(ctx, 3, 5, 10, 6, '#c0c0c8');
    _ipx(ctx, 4, 6, 8, 4, '#e0e0e8');
    _ipx(ctx, 3, 5, 10, 1, '#f0f0f8');
  },
  金鉱石: (ctx) => {
    _ipx(ctx, 3, 5, 10, 8, '#5c5c5c');
    _ipx(ctx, 4, 4, 8, 6, '#6e6e6e');
    _ipx(ctx, 6, 6, 3, 3, '#e6c85c');
    _ipx(ctx, 9, 8, 2, 2, '#e6c85c');
  },
  金: (ctx) => {
    _ipx(ctx, 3, 5, 10, 6, '#c9a13c');
    _ipx(ctx, 4, 6, 8, 4, '#e6c85c');
    _ipx(ctx, 3, 5, 10, 1, '#f5e07a');
  },
  水: (ctx) => {
    _ipx(ctx, 5, 3, 6, 10, '#4a8ac9');
    _ipx(ctx, 6, 4, 4, 8, '#6ba8e0');
    _ipx(ctx, 7, 5, 2, 3, '#a8d0f0');
  },
};

function buildItemIcon(itemId) {
  const size = 16;
  const cnv = document.createElement('canvas');
  cnv.width = size; cnv.height = size;
  const ctx = cnv.getContext('2d');
  ctx.imageSmoothingEnabled = false;

  const dynDef = DYNAMIC_ITEM_REGISTRY[itemId];
  if (!dynDef && SPECIFIC_ITEM_ICONS[itemId]) {
    SPECIFIC_ITEM_ICONS[itemId](ctx);
    return cnv;
  }

  const base = (dynDef && dynDef.color) || MATERIAL_BASE_COLORS[itemId] || '#999999';
  const light = shadeColor(base, 55);
  const dark = shadeColor(base, -55);
  const category = dynDef ? dynDef.category : 'material';

  if (category === 'weapon') {
    // 刀身+柄のシルエット
    _ipx(ctx, 7, 1, 2, 9, dark);
    _ipx(ctx, 7, 1, 1, 9, light);
    _ipx(ctx, 6, 10, 4, 2, '#5a3d24');
    _ipx(ctx, 5, 12, 6, 2, '#3a2a18');
  } else if (category === 'armor') {
    // 胸当てのシルエット
    _ipx(ctx, 4, 3, 8, 10, dark);
    _ipx(ctx, 5, 4, 6, 8, base);
    _ipx(ctx, 6, 5, 2, 6, light);
    _ipx(ctx, 3, 3, 2, 3, base);
    _ipx(ctx, 11, 3, 2, 3, base);
  } else if (category === 'tool') {
    // つるはし/斧のシルエット
    _ipx(ctx, 7, 3, 2, 11, '#5a3d24');
    _ipx(ctx, 3, 2, 10, 4, dark);
    _ipx(ctx, 4, 3, 8, 2, light);
  } else if (category === 'container') {
    // 壺/水がめのシルエット
    _ipx(ctx, 4, 3, 8, 2, dark);
    _ipx(ctx, 3, 5, 10, 8, base);
    _ipx(ctx, 4, 6, 3, 6, light);
    _ipx(ctx, 3, 12, 10, 2, dark);
  } else {
    // 素材の塊(丸みのある不定形の塊として陰影付きで表現)
    _ipx(ctx, 3, 5, 10, 8, dark);
    _ipx(ctx, 4, 4, 8, 8, base);
    _ipx(ctx, 5, 3, 6, 3, light);
    _ipx(ctx, 6, 5, 3, 3, light);
  }
  return cnv;
}

// ============ 汎用スロット配列操作(チェスト等の共有ストレージ用) ============
function addToSlotArray(slots, item, qty) {
  if (!item || qty <= 0) return 0;
  const stackLimit = getItemStackLimit(item);
  let remaining = qty;
  for (const slot of slots) {
    if (remaining <= 0) break;
    if (slot && slot.item === item && slot.count < stackLimit) {
      const space = stackLimit - slot.count;
      const add = Math.min(space, remaining);
      slot.count += add;
      remaining -= add;
    }
  }
  for (let i = 0; i < slots.length && remaining > 0; i++) {
    if (!slots[i]) {
      const add = Math.min(stackLimit, remaining);
      slots[i] = { item, count: add };
      remaining -= add;
    }
  }
  return qty - remaining;
}

function removeFromSlotArray(slots, item, qty) {
  let remaining = qty;
  for (const slot of slots) {
    if (remaining <= 0) break;
    if (slot && slot.item === item) {
      const take = Math.min(slot.count, remaining);
      slot.count -= take;
      remaining -= take;
    }
  }
  for (let i = 0; i < slots.length; i++) {
    if (slots[i] && slots[i].count <= 0) slots[i] = null;
  }
  return qty - remaining;
}
