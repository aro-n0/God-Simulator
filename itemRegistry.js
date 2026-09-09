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

function buildItemIcon(itemId) {
  const size = 16;
  const cnv = document.createElement('canvas');
  cnv.width = size; cnv.height = size;
  const ctx = cnv.getContext('2d');
  ctx.imageSmoothingEnabled = false;

  const dynDef = DYNAMIC_ITEM_REGISTRY[itemId];
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
