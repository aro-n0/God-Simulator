/**
 * battle.js - キャラ計算 & ロジック
 * 5役職パッシブ / 前衛・後衛 / 全発動条件プログラム化 / 時止め・先制 / ダメージ計算整数化
 */

if (typeof window.appState === 'undefined') {
  window.appState = {};
}
if (!appState.p1Team) appState.p1Team = [];
if (!appState.p2Team) appState.p2Team = [];
if (!appState.characters) appState.characters = [];
if (!appState.localCharacters) appState.localCharacters = [];

const MAX_TOTAL_POINTS = 200;
const MAX_EVA_POINTS = 150;
const SKILL_COST_MAX = 190;
const BUFF_SKILL_COST_MIN = 110;
const DEF_MULTIPLIER = 2.5;
const RANGED_HIT_RATE = 70;
const HEALER_COOLDOWN_TURNS = 4;   // ヒーラー自動全体回復のクールダウン（1巡=1ターン）

/* ===================================================
   役職（ジョブ）パッシブ定義 — 王道5役職
   =================================================== */
const ROLES = {
  'melee': {
    label: '近接物理',
    icon: '⚔️',
    desc: 'HP・攻撃力 1.2倍。最前線で戦う物理アタッカー。',
    passive: 'HP・攻撃力1.2倍',
    canAttack: true,
    canUseSkill: true
  },
  'ranged': {
    label: '遠距離物理',
    icon: '🏹',
    desc: '必殺ダメージ倍率2.5倍（通常1.5倍）。狙われにくい。',
    passive: '必殺2.5倍 / 狙われにくい',
    canAttack: true,
    canUseSkill: true
  },
  'mage': {
    label: '魔術師',
    icon: '🔮',
    desc: '敵の防御力を50%貫通してダメージ計算。',
    passive: '防御50%貫通',
    canAttack: true,
    canUseSkill: true
  },
  'healer': {
    label: 'ヒーラー',
    icon: '💚',
    desc: '通常攻撃不可。素早さ0固定。攻撃ステータスが回復力(1.4倍)。4ターンに1回自動全体回復。技名・必殺技名入力不可。',
    passive: '回復量1.4倍 / 4Tに1回自動全体回復 / SPD固定0',
    canAttack: false,
    canUseSkill: true,
    fixedSpd: 0,
    lockSkillNames: true
  },
  'tank': {
    label: 'タンク',
    icon: '🛡️',
    desc: 'HP・防御力 1.2倍。狙われやすさ大幅上昇。',
    passive: 'HP・防御力1.2倍 / 狙われやすい',
    canAttack: true,
    canUseSkill: true
  }
};

const ROLE_KEYS = Object.keys(ROLES);

/* ===================================================
   特殊能力（効果種別）日本語ラベル — 全UI共通
   =================================================== */
const EFFECT_TYPE_LABELS = {
  'damage':     '【追加ダメージ】',
  'heal':       '【回復】',
  'buff_atk':   '【攻撃力バフ】',
  'buff_def':   '【防御力バフ】',
  'buff_hp':    '【HPバフ】',
  'buff_spd':   '【素早さバフ】',
  'debuff_def': '【防御力デバフ】',
  'damage_up':  '【被ダメージup】',
  'stun':       '【スタン】',
  'combo':      '【コンボ】',
  'lifesteal':  '【ライフスティール】'
};

function getEffectTypeLabel(type) {
  if (!type) return EFFECT_TYPE_LABELS['damage'];
  const key = String(type).toLowerCase().trim();
  return EFFECT_TYPE_LABELS[key] || `【${type}】`;
}
window.EFFECT_TYPE_LABELS = EFFECT_TYPE_LABELS;
window.getEffectTypeLabel = getEffectTypeLabel;

/* ===================================================
   ビジュアルバトル用イベント出力ヘルパー
   1ターン＝「1P/2Pの生存キャラ全員が1巡行動し終えた瞬間」。
   特殊能力・パッシブの割り込みでは turnCount を絶対に進めない。
   =================================================== */
function vbPush(ev) {
  if (window._vbEvents) window._vbEvents.push(ev);
}

/** 特殊能力の効果を演出用に出力（11種すべて対応） */
function vbEffect(effectType, caster, target, payload) {
  vbPush(Object.assign({
    type: 'effect',
    effect: String(effectType || '').toLowerCase(),
    label: getEffectTypeLabel(effectType),
    turn: window._vbTurn || 0,
    casterId: caster ? caster.id : null,
    casterName: caster ? caster.name : '',
    targetId: target ? target.id : (caster ? caster.id : null),
    targetName: target ? target.name : (caster ? caster.name : '')
  }, payload || {}));
}

/** ダメージ適用＋damage/koイベント出力（通常攻撃・特殊能力共通） */
function vbApplyDamage(attacker, target, amount, meta, logs) {
  if (!target || amount <= 0) return false;
  target.currentHp = Math.max(0, target.currentHp - amount);
  vbPush(Object.assign({
    type: 'damage',
    turn: window._vbTurn || 0,
    attackerId: attacker ? attacker.id : null,
    attackerName: attacker ? attacker.name : '',
    targetId: target.id,
    targetName: target.name,
    amount: amount
  }, meta || {}));
  if (target.currentHp <= 0 && !target._vbKoLogged) {
    target._vbKoLogged = true;
    // ★特殊能力（追加ダメージ/コンボ/反撃など）によるKOも通常攻撃と同じKO演出へ
    vbPush({ type: 'ko', turn: window._vbTurn || 0, fighterId: target.id, fighterName: target.name, team: target.team });
    if (logs) logs.push(`💥 ${target.name} は力尽き倒れた！`);
    if (typeof playSE === 'function') playSE('ko');
    return true;
  }
  return false;
}

/** 回復適用＋healイベント出力 */
function vbApplyHeal(healer, target, amount, logs) {
  if (!target || amount <= 0) return 0;
  const max = target.stats.maxHp || target.stats.hp;
  const before = target.currentHp;
  target.currentHp = Math.min(max, target.currentHp + amount);
  const real = target.currentHp - before;
  vbPush({
    type: 'heal', turn: window._vbTurn || 0,
    healerId: healer ? healer.id : target.id,
    healerName: healer ? healer.name : target.name,
    targetId: target.id, targetName: target.name, amount: real
  });
  return real;
}

function getRoleLabel(roleKey) {
  const r = ROLES[roleKey];
  return r ? `${r.icon} ${r.label}` : '⚔️ 近接物理';
}

/* ===================================================
   ステータス初期化
   =================================================== */
function initStatSliders(prefix = '') {
  const isEdit = prefix === 'edit';
  if (typeof setupStatSync === 'function') {
    setupStatSync(isEdit ? 'edit-' : '', isEdit);
  } else {
    updateStatValues(prefix);
  }
}

function updateStatValues(prefix = '') {
  const isEdit = prefix === 'edit';
  const p = isEdit ? 'edit-' : '';

  let hp = parseInt(document.getElementById(`${p}stat-hp`)?.value) || 0;
  let atk = parseInt(document.getElementById(`${p}stat-atk`)?.value) || 0;
  let def = parseInt(document.getElementById(`${p}stat-def`)?.value) || 0;
  let eva = parseInt(document.getElementById(`${p}stat-eva`)?.value) || 0;

  const roleEl = document.getElementById(`${p}char-role`);
  const roleKey = roleEl ? roleEl.value : 'melee';
  const roleDef = ROLES[roleKey];

  if (roleDef && roleDef.fixedSpd !== undefined) {
    eva = roleDef.fixedSpd;
    const slider = document.getElementById(`${p}stat-eva`);
    const numInput = document.getElementById(`${p}num-stat-eva`);
    if (slider) { slider.value = 0; slider.disabled = true; }
    if (numInput) { numInput.value = 0; numInput.disabled = true; }
  } else {
    const slider = document.getElementById(`${p}stat-eva`);
    const numInput = document.getElementById(`${p}num-stat-eva`);
    if (slider) slider.disabled = false;
    if (numInput) numInput.disabled = false;
    if (eva > MAX_EVA_POINTS) {
      eva = MAX_EVA_POINTS;
      if (slider) slider.value = MAX_EVA_POINTS;
      if (numInput) numInput.value = MAX_EVA_POINTS;
    }
  }

  const currentTotal = hp + atk + def + eva;
  const remaining = MAX_TOTAL_POINTS - currentTotal;

  const remainingEl = document.getElementById(`${p}remaining-points`);
  if (remainingEl) {
    remainingEl.textContent = remaining;
    remainingEl.style.color = remaining < 0 ? '#ef4444' : '#34d399';
  }

  const valHp = document.getElementById(`${p}val-hp`);
  const valAtk = document.getElementById(`${p}val-atk`);
  const valDef = document.getElementById(`${p}val-def`);
  const valEva = document.getElementById(`${p}val-eva`);

  if (valHp) valHp.textContent = `${hp * 5} HP (${hp} pt)`;
  if (valAtk) valAtk.textContent = roleKey === 'healer' ? `${atk} pt (回復力)` : `${atk} pt`;
  if (valDef) valDef.textContent = `${def * DEF_MULTIPLIER} DEF (${def} pt)`;
  if (valEva) valEva.textContent = `SPD:${eva}pt / 回避:${Math.floor(eva / 3)}%`;
}

document.addEventListener('DOMContentLoaded', () => {
  loadLocalCharacters();
  if (typeof renderCharacterGallery === 'function') renderCharacterGallery();
  if (typeof renderTeamSlots === 'function') renderTeamSlots();
});

/* ===================================================
   キャラクター作成
   =================================================== */
async function handleCreateCharacter(e) {
  e.preventDefault();

  const hp = parseInt(document.getElementById('stat-hp').value) || 0;
  const atk = parseInt(document.getElementById('stat-atk').value) || 0;
  const def = parseInt(document.getElementById('stat-def').value) || 0;
  let eva = parseInt(document.getElementById('stat-eva').value) || 0;

  const roleEl = document.getElementById('char-role');
  const roleKey = roleEl ? roleEl.value : 'melee';
  const roleDef = ROLES[roleKey];

  if (roleDef && roleDef.fixedSpd !== undefined) {
    eva = roleDef.fixedSpd;
  } else if (eva > MAX_EVA_POINTS) {
    eva = MAX_EVA_POINTS;
  }

  if (hp + atk + def + eva > MAX_TOTAL_POINTS) {
    return alert(`ステータスポイントの合計が ${MAX_TOTAL_POINTS}pt を超えています！`);
  }

  const tagsInput = document.getElementById('char-tags')?.value || '';
  const tags = tagsInput ? tagsInput.split(',').map(t => t.trim()).filter(t => t) : [];
  const customSkill = (typeof selectedSkillData !== 'undefined' && selectedSkillData) ? selectedSkillData : null;

  let normalSkill = document.getElementById('char-normal-skill')?.value.trim() || '通常攻撃';
  let specialSkill = document.getElementById('char-special-skill')?.value.trim() || '奥義';

  if (roleDef && roleDef.lockSkillNames) {
    normalSkill = '回復魔法';
    specialSkill = '大回復魔法';
  }

  const newChar = {
    id: 'char_' + Date.now(),
    name: document.getElementById('char-name').value.trim(),
    job: document.getElementById('char-job')?.value.trim() || '冒険者',
    role: roleKey,
    tags: tags,
    bio: document.getElementById('char-bio')?.value.trim() || '',
    appearance: document.getElementById('char-appearance')?.value.trim() || '',
    normalSkill: normalSkill,
    specialSkill: specialSkill,
    quote: document.getElementById('char-quote')?.value.trim() || '……',
    stats: {
      hp: hp * 5,
      maxHp: hp * 5,
      atk: atk,
      def: Math.floor(def * DEF_MULTIPLIER),
      eva: eva,
      spd: eva
    },
    customSkill: customSkill,
    createdBy: appState.playerName
  };

  if (appState.roomId) {
    if (typeof saveCharacterToFirestore === 'function') {
      await saveCharacterToFirestore(newChar);
      alert(`キャラクター「${newChar.name}」をルームに作成・共有しました！`);
    }
  } else {
    if (!appState.localCharacters) appState.localCharacters = [];
    if (!appState.characters) appState.characters = [];
    appState.localCharacters.push(newChar);
    if (typeof saveLocalCharacters === 'function') saveLocalCharacters();
    appState.characters = [...appState.localCharacters];
    if (typeof renderCharacterGallery === 'function') renderCharacterGallery();
    if (typeof renderTeamSlots === 'function') renderTeamSlots();
    alert(`キャラクター「${newChar.name}」をローカルに保存しました！`);
  }

  document.getElementById('create-form').reset();
  updateStatValues('create');
  if (typeof clearSkillSelection === 'function') clearSkillSelection('');
  if (typeof renderRoleSelector === 'function') renderRoleSelector('');
  applyRoleFormRestrictions('');
}

window.openEditModal = function(id) {
  const charList = appState.characters || appState.localCharacters || [];
  const char = charList.find(c => c.id === id);
  if (!char) return;

  document.getElementById('edit-char-id').value = char.id;
  document.getElementById('edit-char-name').value = char.name;
  document.getElementById('edit-char-job').value = char.job || '冒険者';
  document.getElementById('edit-char-tags').value = Array.isArray(char.tags) ? char.tags.join(', ') : '';

  if (typeof renderElementSelectOptions === 'function') renderElementSelectOptions('edit-');
  const editElemSelect = document.getElementById('edit-char-element');
  if (editElemSelect) editElemSelect.value = char.element || '';
  const editElemColor = document.getElementById('edit-char-element-color');
  if (editElemColor) editElemColor.value = char.elementColor || '';
  if (typeof renderElementConfigUI === 'function') renderElementConfigUI('edit-');

  document.getElementById('edit-char-bio').value = char.bio || '';
  document.getElementById('edit-char-appearance').value = char.appearance || '';
  document.getElementById('edit-char-normal-skill').value = char.normalSkill || '';
  document.getElementById('edit-char-special-skill').value = char.specialSkill || '';
  document.getElementById('edit-char-quote').value = char.quote || '';

  const editRoleEl = document.getElementById('edit-char-role');
  if (editRoleEl) editRoleEl.value = char.role || 'melee';

  if (char.customSkill) {
    selectedEditSkillData = char.customSkill;
    window._editSkillCandidates = [char.customSkill];
    if (typeof renderSkillCandidates === 'function') renderSkillCandidates([char.customSkill], 'edit-', 0);
    if (typeof updateSkillStatusDisplay === 'function') updateSkillStatusDisplay('edit-', char.customSkill);
    if (typeof showSkillNameEditSection === 'function') showSkillNameEditSection('edit-', char.customSkill);
  } else {
    selectedEditSkillData = null;
    window._editSkillCandidates = null;
    if (typeof updateSkillStatusDisplay === 'function') updateSkillStatusDisplay('edit-', null);
    if (typeof showSkillNameEditSection === 'function') showSkillNameEditSection('edit-', null);
  }

  if (typeof renderRoleSelector === 'function') renderRoleSelector('edit-');
  applyRoleFormRestrictions('edit-');

  const hpPt = char.stats.hp ? Math.floor(char.stats.hp / 5) : 0;
  const atkPt = char.stats.atk || 0;
  const defPt = char.stats.def ? Math.floor(char.stats.def / DEF_MULTIPLIER) : 0;
  const evaPt = char.stats.eva || char.stats.spd || 0;

  const statMap = { hp: hpPt, atk: atkPt, def: defPt, eva: evaPt };
  ['hp', 'atk', 'def', 'eva'].forEach(stat => {
    const val = statMap[stat];
    const slider = document.getElementById(`edit-stat-${stat}`);
    const numInput = document.getElementById(`edit-num-stat-${stat}`);
    if (slider) slider.value = val;
    if (numInput) numInput.value = val;
  });

  updateStatValues('edit');
  document.getElementById('edit-modal').style.display = 'flex';
};

window.closeEditModal = function() {
  document.getElementById('edit-modal').style.display = 'none';
};

/* ===================================================
   役職によるフォーム制限（ヒーラー: 技名入力不可・SPD固定）
   =================================================== */
function applyRoleFormRestrictions(prefix = '') {
  const roleEl = document.getElementById(`${prefix}char-role`);
  if (!roleEl) return;
  const roleKey = roleEl.value;
  const roleDef = ROLES[roleKey];
  if (!roleDef) return;

  const normalSkillInput = document.getElementById(`${prefix}char-normal-skill`);
  const specialSkillInput = document.getElementById(`${prefix}char-special-skill`);
  const spdSlider = document.getElementById(`${prefix}stat-eva`);
  const spdNum = document.getElementById(`${prefix}num-stat-eva`);
  const atkLabel = document.querySelector(`label[for="${prefix}stat-atk"]`);

  if (roleDef.lockSkillNames) {
    if (normalSkillInput) { normalSkillInput.disabled = true; normalSkillInput.value = '回復魔法'; }
    if (specialSkillInput) { specialSkillInput.disabled = true; specialSkillInput.value = '大回復魔法'; }
    if (spdSlider) { spdSlider.disabled = true; spdSlider.value = 0; }
    if (spdNum) { spdNum.disabled = true; spdNum.value = 0; }
  } else {
    if (normalSkillInput) normalSkillInput.disabled = false;
    if (specialSkillInput) specialSkillInput.disabled = false;
    if (spdSlider) spdSlider.disabled = false;
    if (spdNum) spdNum.disabled = false;
  }

  if (typeof setupStatSync === 'function') {
    setupStatSync(prefix === 'edit-' ? 'edit-' : '', prefix === 'edit-');
  } else {
    updateStatValues(prefix);
  }
}

/* ===================================================
   役職パッシブ適用（バトル開始時）
   =================================================== */
function applyRolePassive(fighter) {
  const role = fighter.role || 'melee';

  switch (role) {
    case 'melee':
      fighter.stats.maxHp = Math.floor(fighter.stats.maxHp * 1.2);
      fighter.stats.hp = fighter.stats.maxHp;
      fighter.currentHp = fighter.stats.maxHp;
      fighter.stats.atk = Math.floor(fighter.stats.atk * 1.2);
      break;
    case 'ranged':
      fighter.specialMultiplier = 2.5;
      fighter.targetWeight = 0.5;
      break;
    case 'mage':
      fighter.defPenetration = 0.5;
      break;
    case 'healer':
      fighter.isHealer = true;
      fighter.healMultiplier = 1.4;
      fighter.targetWeight = 0.5;
      fighter.stats.spd = 0;
      fighter.stats.eva = 0;
      break;
    case 'tank':
      fighter.stats.maxHp = Math.floor(fighter.stats.maxHp * 1.2);
      fighter.stats.hp = fighter.stats.maxHp;
      fighter.currentHp = fighter.stats.maxHp;
      fighter.stats.def = Math.floor(fighter.stats.def * 1.2);
      fighter.targetWeight = 3.0;
      break;
    default:
      break;
  }

  fighter.formation = fighter.formation || 'front';
  if (fighter.formation === 'front') {
    fighter.physicalDamageReduction = 0.10;
    fighter.stats.def = Math.floor(fighter.stats.def * 1.1);
  } else {
    fighter.targetWeight = (fighter.targetWeight || 1) * 0.5;
  }
}

/* ===================================================
   ダメージ計算（整数化・役職・前衛後衛対応）
   =================================================== */
function calculateDamage(attacker, target, isSpecial) {
  let atk = attacker.stats.atk || 0;
  let def = target.stats.def || 0;

  if (attacker.defPenetration) {
    def = Math.floor(def * (1 - attacker.defPenetration));
  }

  const specialMult = attacker.specialMultiplier || 1.5;
  atk = Math.floor(atk * (isSpecial ? specialMult : 1.0));

  let damage;
  if (def >= atk) {
    damage = Math.floor(atk * 0.1);
  } else {
    damage = Math.floor(def * 0.1 + (atk - def));
  }

  if (target.physicalDamageReduction && !isSpecial) {
    damage = Math.floor(damage * (1 - target.physicalDamageReduction));
  }

  if (target.damageUpMultiplier && target.damageUpMultiplier > 1) {
    damage = Math.floor(damage * target.damageUpMultiplier);
  }

  return Math.max(1, Math.floor(damage));
}

/* ===================================================
   全発動条件プログラム化
   =================================================== */
const SKILL_CONDITIONS = {
  ON_BATTLE_START: 'on_battle_start',
  ON_ATTACK_START: 'on_attack_start',
  EVERY_N_TURNS: 'every_n_turns',
  HP_BELOW: 'hp_below',
  HP_ABOVE: 'hp_above',
  ON_DAMAGE_TAKEN: 'on_damage_taken',
  ON_KILL: 'on_kill',
  TURN_AFTER: 'turn_after',
  TURN_BEFORE: 'turn_before',
  FIRST_TURN: 'first_turn',
  ALWAYS: 'always',
  ALIVE: 'alive',
  ON_DEATH: 'on_death'
};

function parseConditionType(conditionStr) {
  if (!conditionStr) return SKILL_CONDITIONS.ALWAYS;
  const c = conditionStr.trim().toLowerCase();

  if (c === '常時' || c === 'なし' || c === '無条件' || c === 'always' || c === '') return SKILL_CONDITIONS.ALWAYS;
  if (c.includes('生存中') || c.includes('生きている時') || c.includes('alive')) return SKILL_CONDITIONS.ALIVE;
  if (c.includes('死亡時') || c.includes('倒された時') || c.includes('on_death')) return SKILL_CONDITIONS.ON_DEATH;
  if (c.includes('バトル開始') || c.includes('戦闘開始') || c.includes('on_battle_start')) return SKILL_CONDITIONS.ON_BATTLE_START;
  if (c.includes('攻撃開始') || c.includes('on_attack_start') || c.includes('攻撃時')) return SKILL_CONDITIONS.ON_ATTACK_START;
  if (c.includes('被弾') || c.includes('被打撃') || c.includes('on_damage_taken') || c.includes('被ダメージ')) return SKILL_CONDITIONS.ON_DAMAGE_TAKEN;
  if (c.includes('撃破時') || c.includes('on_kill') || c.includes('敵を倒')) return SKILL_CONDITIONS.ON_KILL;
  if (c.includes('先制') || c.includes('第1ターン') || c.includes('1ターン目') || c.includes('first_turn')) return SKILL_CONDITIONS.FIRST_TURN;

  const everyMatch = c.match(/(\d+)\s*ターン毎|every\s*(\d+)/);
  if (everyMatch) return { type: SKILL_CONDITIONS.EVERY_N_TURNS, n: parseInt(everyMatch[1] || everyMatch[2]) };

  if (c.includes('hp') && (c.includes('以下') || c.includes('below'))) {
    const m = c.match(/hp\s*(\d+)\s*%?/);
    if (m && !isNaN(parseInt(m[1]))) return { type: SKILL_CONDITIONS.HP_BELOW, threshold: parseInt(m[1]) };
  }
  if (c.includes('hp') && (c.includes('以上') || c.includes('above'))) {
    const m = c.match(/hp\s*(\d+)\s*%?/);
    if (m && !isNaN(parseInt(m[1]))) return { type: SKILL_CONDITIONS.HP_ABOVE, threshold: parseInt(m[1]) };
  }

  const turnAfterMatch = c.match(/(\d+)\s*ターン(?:以降|経過後|以上|後)/);
  if (turnAfterMatch) return { type: SKILL_CONDITIONS.TURN_AFTER, n: parseInt(turnAfterMatch[1]) };

  const turnBeforeMatch = c.match(/(\d+)\s*ターン(?:以内|未満)/);
  if (turnBeforeMatch) return { type: SKILL_CONDITIONS.TURN_BEFORE, n: parseInt(turnBeforeMatch[1]) };

  return SKILL_CONDITIONS.ALWAYS;
}

function checkSkillCondition(skill, attacker, target, currentTurn, triggerEvent) {
  if (!skill) return true;
  const condition = skill.condition || '常時';
  const parsed = parseConditionType(condition);

  if (parsed === SKILL_CONDITIONS.ALWAYS) return true;
  if (parsed === SKILL_CONDITIONS.ALIVE) return attacker.currentHp > 0;
  if (parsed === SKILL_CONDITIONS.ON_DEATH) return triggerEvent === 'on_death';
  if (parsed === SKILL_CONDITIONS.ON_BATTLE_START) return triggerEvent === 'on_battle_start';
  if (parsed === SKILL_CONDITIONS.ON_ATTACK_START) return triggerEvent === 'on_attack_start';
  if (parsed === SKILL_CONDITIONS.ON_DAMAGE_TAKEN) return triggerEvent === 'on_damage_taken';
  if (parsed === SKILL_CONDITIONS.ON_KILL) return triggerEvent === 'on_kill';
  if (parsed === SKILL_CONDITIONS.FIRST_TURN) return currentTurn === 1;

  if (typeof parsed === 'object') {
    switch (parsed.type) {
      case SKILL_CONDITIONS.EVERY_N_TURNS:
        return currentTurn % parsed.n === 0;
      case SKILL_CONDITIONS.HP_BELOW: {
        const maxHp = attacker.stats.maxHp || attacker.stats.hp || 1;
        return (attacker.currentHp / maxHp) * 100 <= parsed.threshold;
      }
      case SKILL_CONDITIONS.HP_ABOVE: {
        const maxHp = attacker.stats.maxHp || attacker.stats.hp || 1;
        return (attacker.currentHp / maxHp) * 100 >= parsed.threshold;
      }
      case SKILL_CONDITIONS.TURN_AFTER:
        return currentTurn >= parsed.n;
      case SKILL_CONDITIONS.TURN_BEFORE:
        return currentTurn < parsed.n;
    }
  }

  return true;
}

/* ===================================================
   特殊フラグ解析: 時止め / 先制攻撃
   =================================================== */
function parseSpecialFlags(skill) {
  if (!skill) return {};
  const flags = {};
  const condition = (skill.condition || '').toLowerCase();
  const desc = (skill.description || '').toLowerCase();
  const name = (skill.name || '').toLowerCase();

  if (condition.includes('時止') || desc.includes('時止') || name.includes('時止') ||
      condition.includes('time_stop') || desc.includes('time_stop')) {
    flags.isTimeStop = true;
  }
  if (condition.includes('先制') || desc.includes('先制') || name.includes('先制') ||
      condition.includes('first_strike') || desc.includes('first_strike')) {
    flags.isFirstStrike = true;
  }
  return flags;
}

/* ===================================================
   カスタムスキル実行
   =================================================== */
function executeCustomSkill(attacker, target, skill, currentTurn, triggerEvent) {
  const result = {
    activated: false,
    skillName: skill.name || 'カスタム技',
    bonusDamage: 0,
    heal: 0,
    buffAtk: 0,
    buffDef: 0,
    debuffDef: 0,
    damageUp: 0,
    stun: false,
    isTimeStop: false,
    isFirstStrike: false,
    skipTargetTurn: false,
    duration: skill.duration || 0
  };

  if (!checkSkillCondition(skill, attacker, target, currentTurn, triggerEvent)) {
    return result;
  }

  const probability = Math.min(100, Math.max(0, skill.probability || 100));
  if (Math.random() * 100 > probability) {
    return result;
  }
  result.activated = true;

  const flags = parseSpecialFlags(skill);
  result.isTimeStop = !!flags.isTimeStop;
  result.isFirstStrike = !!flags.isFirstStrike;
  if (result.isTimeStop) result.skipTargetTurn = true;

  const effectType = (skill.effectType || 'damage').toLowerCase();
  result.effectType = effectType;
  result.effectLabel = getEffectTypeLabel(effectType);
  const effectValue = Math.max(0, skill.effectValue || 0);
  const valueType = (skill.valueType || 'flat').toLowerCase();
  const atkVal = attacker.stats.atk || 0;
  const maxHpVal = attacker.stats.maxHp || attacker.stats.hp || 1;
  const defVal = attacker.stats.def || 0;
  const spdVal = attacker.stats.spd || attacker.stats.eva || 0;
  const targetDef = (target && target.stats && target.stats.def) || 0;

  const MAX_DAMAGE_CAP = Math.floor(atkVal * 3.0);
  const MAX_BUFF_PCT = 50;
  const MAX_HEAL_CAP = Math.floor(maxHpVal * 0.5);
  const MAX_BUFF_HP_CAP = Math.floor(maxHpVal * 0.5);
  const MAX_BUFF_SPD_CAP = Math.floor(spdVal * 0.5);

  // Element affinity bonus (1.5x damage if attacker's element beats target's element)
  let elementMultiplier = 1.0;
  if (target && attacker.element && target.element) {
    const elemData = (typeof getElementAffinity === 'function') ? getElementAffinity(attacker.element, target.element) : null;
    if (elemData && elemData > 0) elementMultiplier = 1.5;
  }

  switch (effectType) {
    case 'damage':
      if (valueType === 'percent') {
        result.bonusDamage = Math.floor(atkVal * effectValue / 100 * elementMultiplier);
      } else {
        result.bonusDamage = Math.floor((effectValue + atkVal * 0.5) * elementMultiplier);
      }
      result.bonusDamage = Math.min(result.bonusDamage, MAX_DAMAGE_CAP);
      break;
    case 'heal':
      if (valueType === 'percent') {
        result.heal = Math.floor(maxHpVal * effectValue / 100);
      } else {
        result.heal = Math.floor(effectValue * (attacker.healMultiplier || 1));
      }
      result.heal = Math.min(result.heal, MAX_HEAL_CAP);
      if (_mudBattleActive) result.heal = Math.floor(result.heal * 0.5);
      break;
    case 'buff_atk':
      if (valueType === 'percent') {
        result.buffAtk = Math.floor(atkVal * Math.min(effectValue, MAX_BUFF_PCT) / 100);
      } else {
        result.buffAtk = Math.min(effectValue, Math.floor(atkVal * MAX_BUFF_PCT / 100));
      }
      break;
    case 'buff_def':
      if (valueType === 'percent') {
        result.buffDef = Math.floor(defVal * Math.min(effectValue, MAX_BUFF_PCT) / 100);
      } else {
        result.buffDef = Math.min(effectValue, Math.floor(defVal * MAX_BUFF_PCT / 100));
      }
      break;
    case 'debuff_def':
      if (valueType === 'percent') {
        result.debuffDef = Math.floor(targetDef * Math.min(effectValue, MAX_BUFF_PCT) / 100);
      } else {
        result.debuffDef = Math.min(effectValue, Math.floor(targetDef * MAX_BUFF_PCT / 100));
      }
      break;
    case 'buff_hp':
      if (valueType === 'percent') {
        result.buffHp = Math.floor(maxHpVal * Math.min(effectValue, MAX_BUFF_PCT) / 100);
      } else {
        result.buffHp = Math.min(effectValue, MAX_BUFF_HP_CAP);
      }
      break;
    case 'buff_spd':
      if (valueType === 'percent') {
        result.buffSpd = Math.floor(spdVal * Math.min(effectValue, MAX_BUFF_PCT) / 100);
      } else {
        result.buffSpd = Math.min(effectValue, MAX_BUFF_SPD_CAP);
      }
      break;
    case 'damage_up':
      result.damageUp = Math.min(1.0, effectValue / 100);
      break;
    case 'stun':
      result.stun = true;
      result.bonusDamage = Math.min(Math.floor(effectValue * 0.3), MAX_DAMAGE_CAP);
      break;
    case 'combo':
      if (valueType === 'percent') {
        result.bonusDamage = Math.floor(atkVal * effectValue / 100 * 2 * elementMultiplier);
      } else {
        result.bonusDamage = Math.floor((effectValue * 2 + atkVal * 0.3) * elementMultiplier);
      }
      result.bonusDamage = Math.min(result.bonusDamage, MAX_DAMAGE_CAP);
      break;
    case 'lifesteal':
      result.bonusDamage = Math.min(Math.floor((atkVal + effectValue) * 0.5), MAX_DAMAGE_CAP);
      result.heal = Math.min(Math.floor((atkVal + effectValue) * 0.3), MAX_HEAL_CAP);
      if (_mudBattleActive) result.heal = Math.floor(result.heal * 0.5);
      break;
    default:
      result.bonusDamage = Math.min(Math.floor(effectValue + atkVal * 0.5), MAX_DAMAGE_CAP);
  }

  return result;
}

/* ===================================================
   ターゲット選択
   =================================================== */
function selectTarget(enemies) {
  const candidates = enemies.filter(f => f.currentHp > 0);
  if (candidates.length === 0) return null;

  const weighted = [];
  candidates.forEach(f => {
    let weight = f.targetWeight || 1;
    if (f.formation === 'front') weight *= 1.5;
    else weight *= 0.5;
    const intWeight = Math.max(1, Math.floor(weight * 10));
    for (let i = 0; i < intWeight; i++) weighted.push(f);
  });

  return weighted[Math.floor(Math.random() * weighted.length)];
}

/* ===================================================
   ヒーラー自動全体回復
   =================================================== */
const ELEMENT_DEFAULTS = {
  names: ['炎', '水', '風', '土', '光', '闇'],
  colors: ['#ef4444', '#3b82f6', '#10b981', '#a16207', '#facc15', '#7c3aed'],
  affinities: { '炎': '風', '風': '土', '土': '水', '水': '炎', '光': '闇', '闇': '光' }
};

function getElementAffinity(attackerElement, defenderElement) {
  if (!attackerElement || !defenderElement) return 0;
  const elemConfig = (typeof getElementConfig === 'function') ? getElementConfig() : null;
  const affinities = (elemConfig && elemConfig.affinities) ? elemConfig.affinities : ELEMENT_DEFAULTS.affinities;
  if (affinities[attackerElement] === defenderElement) return 1;
  return 0;
}

/**
 * ヒーラー自動全体回復（4ターン=4巡に1回）
 * クールダウンは「1巡（全生存キャラの行動完了）」ごとにのみ1減算される。
 */
function healerAutoHeal(fighter, allies, turn, logs) {
  if (!fighter.isHealer || fighter.currentHp <= 0) return;
  if (fighter.healCooldown === undefined) fighter.healCooldown = HEALER_COOLDOWN_TURNS - 1;
  if (fighter.healCooldown > 0) return;

  fighter.healCooldown = HEALER_COOLDOWN_TURNS; // 再セット（4ターンに1回）

  const wounded = allies.filter(a => a.currentHp > 0 && a.currentHp < (a.stats.maxHp || a.stats.hp));
  if (wounded.length === 0) return;

  let healAmount = Math.floor((fighter.stats.atk || 0) * (fighter.healMultiplier || 1.4));
  if (_mudBattleActive) healAmount = Math.floor(healAmount * 0.5);

  wounded.forEach(target => {
    const real = vbApplyHeal(fighter, target, healAmount, logs);
    vbEffect('heal', fighter, target, { amount: real, hp: target.currentHp, maxHp: target.stats.maxHp || target.stats.hp });
    logs.push(`💚 [${fighter.team}] ${fighter.name} の自動全体回復（クールダウン${HEALER_COOLDOWN_TURNS}ターン）！ ${target.name} のHPを ${real} 回復！ (残HP: ${target.currentHp})`);
  });
}

/** 1巡完了時のみ呼ばれる：クールダウンを1減算する唯一の場所 */
function tickCooldowns(fighters) {
  fighters.forEach(f => {
    if (f.currentHp <= 0) return;
    if (f.healCooldown === undefined) f.healCooldown = HEALER_COOLDOWN_TURNS - 1;
    if (f.healCooldown > 0) f.healCooldown -= 1;
  });
}

/* ===================================================
   バトルシミュレーション本体
   =================================================== */
let _mudBattleActive = false;

function runBattleSimulation() {
  if (typeof syncTeamSlots === 'function') syncTeamSlots();

  if (appState.p1Team.length === 0 || appState.p2Team.length === 0) {
    return alert('1P・2Pの両方のチームに1体以上選択してください！');
  }

  const p1Name = appState.p1Name || document.getElementById('p1-team-name-input')?.value || '1Pチーム';
  const p2Name = appState.p2Name || document.getElementById('p2-team-name-input')?.value || '2Pチーム';

  if (typeof playSE === 'function') playSE('battle_start');

  const logBox = document.getElementById('battle-log');
  let logs = [`⚔️ 【${p1Name}】 VS 【${p2Name}】 バトル開始！\n`];

  const charList = appState.characters || appState.localCharacters || [];

  const buildFighters = (teamIds, teamLabel) => {
    return teamIds.map((id, index) => {
      const c = charList.find(char => char.id === id);
      if (!c) return null;
      const formation = index < 5 ? 'front' : 'back';
      const hpVal = c.stats.maxHp || c.stats.hp || 0;
      const fighter = {
        ...JSON.parse(JSON.stringify(c)),
        team: teamLabel === 'p1' ? '1P' : '2P',
        teamIndex: index,
        currentHp: hpVal,
        formation: formation,
        targetWeight: 1,
        specialMultiplier: 1.5,
        skillActivatedThisTurn: false,
        skipNextTurn: false,
        healCooldown: HEALER_COOLDOWN_TURNS - 1,
        _vbKoLogged: false
      };
      applyRolePassive(fighter);
      return fighter;
    }).filter(f => f !== null);
  };

  const p1Fighters = buildFighters(appState.p1Team, 'p1');
  const p2Fighters = buildFighters(appState.p2Team, 'p2');

  // ────────────────────────────────────────────────
  // ビジュアルバトル用イベント収集
  const vbEvents = [];
  window._vbEvents = vbEvents;
  window._vbTurn   = 0;
  const vbInitP1 = p1Fighters.map(f => JSON.parse(JSON.stringify(f)));
  const vbInitP2 = p2Fighters.map(f => JSON.parse(JSON.stringify(f)));
  vbEvents.push({ type: 'battle_start', turn: 0, p1Name, p2Name });
  // ────────────────────────────────────────────────

  logs.push(`--- 📜 選手入場 ---`);
  p1Fighters.forEach(c => logs.push(`[${p1Name}] ${c.name} (${c.job || '冒険者'}) [${getRoleLabel(c.role)}] [${c.formation === 'front' ? '前衛' : '後衛'}] / 「${c.quote || '……'}」`));
  p2Fighters.forEach(c => logs.push(`[${p2Name}] ${c.name} (${c.job || '冒険者'}) [${getRoleLabel(c.role)}] [${c.formation === 'front' ? '前衛' : '後衛'}] / 「${c.quote || '……'}」`));
  logs.push(`-------------------\n`);

  // on_battle_start スキル発動
  [...p1Fighters, ...p2Fighters].forEach(f => {
    if (f.currentHp <= 0 || !f.customSkill) return;
    if (!ROLES[f.role]?.canUseSkill) return;
    const result = executeCustomSkill(f, null, f.customSkill, 1, 'on_battle_start');
    if (result.activated) {
      logs.push(`✨ [${f.team}] ${f.name} の「${result.skillName}」が戦闘開始時に発動！`);
      vbEvents.push({ type: 'skill', turn: 0, casterId: f.id, casterName: f.name, skillName: result.skillName, isBattleStart: true, effect: result.effectType, label: getEffectTypeLabel(result.effectType) });
      if (typeof playSE === 'function') playSE('skill');
      if (result.buffAtk > 0) {
        const b = f.stats.atk || 0;
        f.stats.atk = b + result.buffAtk;
        vbEffect('buff_atk', f, f, { amount: result.buffAtk, from: b, to: f.stats.atk, stat: 'ATK' });
        logs.push(`⚡ ${getEffectTypeLabel('buff_atk')} 攻撃力 ${b} → ${f.stats.atk}！`);
      }
      if (result.buffDef > 0) {
        const b = f.stats.def || 0;
        f.stats.def = b + result.buffDef;
        vbEffect('buff_def', f, f, { amount: result.buffDef, from: b, to: f.stats.def, stat: 'DEF' });
        logs.push(`🛡️ ${getEffectTypeLabel('buff_def')} 防御力 ${b} → ${f.stats.def}！`);
      }
      if (result.buffHp > 0) {
        const b = f.stats.maxHp || f.stats.hp;
        f.stats.maxHp = b + result.buffHp;
        f.currentHp = Math.min(f.stats.maxHp, f.currentHp + result.buffHp);
        vbEffect('buff_hp', f, f, { amount: result.buffHp, from: b, to: f.stats.maxHp, stat: 'MaxHP', hp: f.currentHp, maxHp: f.stats.maxHp });
        logs.push(`❤️ ${getEffectTypeLabel('buff_hp')} 最大HP ${b} → ${f.stats.maxHp}！ (HP: ${f.currentHp}/${f.stats.maxHp})`);
      }
      if (result.buffSpd > 0) {
        const b = f.stats.spd || 0;
        f.stats.spd = b + result.buffSpd;
        vbEffect('buff_spd', f, f, { amount: result.buffSpd, from: b, to: f.stats.spd, stat: 'SPD' });
        logs.push(`💨 ${getEffectTypeLabel('buff_spd')} 素早さ ${b} → ${f.stats.spd}！`);
      }
    }
  });

  let turn = 1;
  const maxTurns = 50;
  _mudBattleActive = false;
  let mudBattleBgmSwitched = false;

  if (typeof SoundManager !== 'undefined' && SoundManager.startBattleBGM) {
    SoundManager.startBattleBGM();
  }

  while (turn <= maxTurns) {
    const activeP1 = p1Fighters.filter(f => f.currentHp > 0);
    const activeP2 = p2Fighters.filter(f => f.currentHp > 0);

    if (activeP1.length === 0 || activeP2.length === 0) break;

    // 泥沼戦演出: 30ターン突破でテンポ1.2倍
    if (turn === 30 && typeof SoundManager !== 'undefined' && SoundManager.setBattleBgmTempo) {
      SoundManager.setBattleBgmTempo(1.2);
      logs.push(`🎵 BGMのテンポが加速した！決着を急げ！`);
    }
    // 40ターン突破で絶望BGM＋ATK1.5倍＋回復半減
    if (turn === 40) {
      _mudBattleActive = true;
      if (!mudBattleBgmSwitched && typeof SoundManager !== 'undefined' && SoundManager.switchToDesperationBGM) {
        SoundManager.switchToDesperationBGM();
        mudBattleBgmSwitched = true;
      }
      logs.push(`😱 40ターン突破！絶望的な決戦BGMへ切り替え！全員のATKが1.5倍に！回復量が半減！`);
      [...p1Fighters, ...p2Fighters].forEach(f => {
        if (f.currentHp > 0) f.stats.atk = Math.floor((f.stats.atk || 0) * 1.5);
      });
    }

    vbEvents.push({ type: 'turn_start', turn });
    window._vbTurn = turn;
    logs.push(`--- Turn ${turn} ---`);

    // ヒーラー自動全体回復
    activeP1.forEach(f => healerAutoHeal(f, p1Fighters, turn, logs));
    activeP2.forEach(f => healerAutoHeal(f, p2Fighters, turn, logs));

    // 行動順ソート (SPD降順)
    const actionQueue = [...activeP1, ...activeP2].sort((a, b) => {
      const spdA = a.stats.spd || a.stats.eva || 0;
      const spdB = b.stats.spd || b.stats.eva || 0;
      if (spdB !== spdA) return spdB - spdA;
      if (a.team !== b.team) return a.team === '1P' ? -1 : 1;
      return a.teamIndex - b.teamIndex;
    });

    const skippedFighters = new Set();

    for (const attacker of actionQueue) {
      if (attacker.currentHp <= 0) continue;
      if (skippedFighters.has(attacker.id)) {
        logs.push(`💫 [${attacker.team}] ${attacker.name} は時止めの影響で行動できない！`);
        skippedFighters.delete(attacker.id);
        continue;
      }

      const enemyTeam = attacker.team === '1P'
        ? p2Fighters.filter(f => f.currentHp > 0)
        : p1Fighters.filter(f => f.currentHp > 0);

      if (enemyTeam.length === 0) break;

      attacker.skillActivatedThisTurn = false;

      // ヒーラー: 回復行動のみ
      if (attacker.isHealer) {
        const allies = attacker.team === '1P' ? p1Fighters : p2Fighters;
        const wounded = allies.filter(a => a.currentHp > 0 && a.currentHp < (a.stats.maxHp || a.stats.hp));
        if (wounded.length > 0) {
          wounded.forEach(target => {
            let healAmount = Math.floor((attacker.stats.atk || 0) * (attacker.healMultiplier || 1.4));
            if (_mudBattleActive) healAmount = Math.floor(healAmount * 0.5);
            const real = vbApplyHeal(attacker, target, healAmount, logs);
            vbEffect('heal', attacker, target, { amount: real, hp: target.currentHp, maxHp: target.stats.maxHp || target.stats.hp });
            logs.push(`💚 [${attacker.team}] ${attacker.name} の回復魔法！ ${target.name} のHPを ${real} 回復！ (残HP: ${target.currentHp})`);
          });
          if (typeof playSE === 'function') playSE('heal');
        } else {
          logs.push(`💚 [${attacker.team}] ${attacker.name} は回復の準備をしている...`);
        }
        continue;
      }

      // on_attack_start スキル判定
      let skillActivated = false;
      let skillResult = null;

      if (attacker.customSkill && ROLES[attacker.role]?.canUseSkill) {
        skillResult = executeCustomSkill(attacker, null, attacker.customSkill, turn, 'on_attack_start');
        if (skillResult.activated) {
          skillActivated = true;
          attacker.skillActivatedThisTurn = true;
          if (typeof playSE === 'function') playSE('skill');
          logs.push(`✨ [${attacker.team}] ${attacker.name} の「${skillResult.skillName}」${getEffectTypeLabel(skillResult.effectType)} が発動！`);
          vbEvents.push({ type: 'skill', turn, casterId: attacker.id, casterName: attacker.name, skillName: skillResult.skillName, effect: skillResult.effectType, label: getEffectTypeLabel(skillResult.effectType) });

          // 時止め処理: 相手チーム全員の次ターンをスキップ
          if (skillResult.isTimeStop) {
            logs.push(`⏸️ 時が止まった！相手チームは次の行動ができない！`);
            const enemyAll = attacker.team === '1P' ? p2Fighters : p1Fighters;
            enemyAll.forEach(e => { if (e.currentHp > 0) skippedFighters.add(e.id); });
          }

          // バフ・デバフ適用
          if (skillResult.buffAtk > 0) {
            const before = attacker.stats.atk || 0;
            attacker.stats.atk = before + skillResult.buffAtk;
            vbEffect('buff_atk', attacker, attacker, { amount: skillResult.buffAtk, from: before, to: attacker.stats.atk, stat: 'ATK', duration: skillResult.duration });
            logs.push(`⚡ ${getEffectTypeLabel('buff_atk')} 攻撃力 ${before} → ${attacker.stats.atk} (+${skillResult.buffAtk} / 持続${skillResult.duration}T)`);
          }
          if (skillResult.buffDef > 0) {
            const before = attacker.stats.def || 0;
            attacker.stats.def = before + skillResult.buffDef;
            vbEffect('buff_def', attacker, attacker, { amount: skillResult.buffDef, from: before, to: attacker.stats.def, stat: 'DEF', duration: skillResult.duration });
            logs.push(`🛡️ ${getEffectTypeLabel('buff_def')} 防御力 ${before} → ${attacker.stats.def} (+${skillResult.buffDef} / 持続${skillResult.duration}T)`);
          }
          if (skillResult.buffHp > 0) {
            const beforeMax = attacker.stats.maxHp || attacker.stats.hp;
            attacker.stats.maxHp = beforeMax + skillResult.buffHp;
            attacker.currentHp = Math.min(attacker.stats.maxHp, attacker.currentHp + skillResult.buffHp);
            vbEffect('buff_hp', attacker, attacker, { amount: skillResult.buffHp, from: beforeMax, to: attacker.stats.maxHp, stat: 'MaxHP', hp: attacker.currentHp, maxHp: attacker.stats.maxHp, duration: skillResult.duration });
            logs.push(`❤️ ${getEffectTypeLabel('buff_hp')} 最大HP ${beforeMax} → ${attacker.stats.maxHp} (HP: ${attacker.currentHp}/${attacker.stats.maxHp})`);
          }
          if (skillResult.buffSpd > 0) {
            const before = attacker.stats.spd || 0;
            attacker.stats.spd = before + skillResult.buffSpd;
            vbEffect('buff_spd', attacker, attacker, { amount: skillResult.buffSpd, from: before, to: attacker.stats.spd, stat: 'SPD', duration: skillResult.duration });
            logs.push(`💨 ${getEffectTypeLabel('buff_spd')} 素早さ ${before} → ${attacker.stats.spd} (+${skillResult.buffSpd} / 持続${skillResult.duration}T)`);
          }
          if (skillResult.heal > 0) {
            const real = vbApplyHeal(attacker, attacker, skillResult.heal, logs);
            const isSteal = skillResult.effectType === 'lifesteal';
            vbEffect(isSteal ? 'lifesteal' : 'heal', attacker, attacker, { amount: real, hp: attacker.currentHp, maxHp: attacker.stats.maxHp || attacker.stats.hp });
            logs.push(`💚 ${getEffectTypeLabel(isSteal ? 'lifesteal' : 'heal')} HPを ${real} 回復！ (残HP: ${attacker.currentHp})`);
          }

          // スキル発動ターンは必殺技・通常攻撃をキャンセル
          // スキル自体にダメージがある場合は適用
          if (skillResult.bonusDamage > 0) {
            const target = selectTarget(enemyTeam);
            if (target) {
              const etype = (skillResult.effectType === 'combo' || skillResult.effectType === 'lifesteal' || skillResult.effectType === 'stun')
                ? skillResult.effectType : 'damage';
              vbEffect(etype, attacker, target, {
                amount: skillResult.bonusDamage,
                hits: etype === 'combo' ? 2 : 1,
                hp: Math.max(0, target.currentHp - skillResult.bonusDamage),
                maxHp: target.stats.maxHp || target.stats.hp
              });
              vbApplyDamage(attacker, target, skillResult.bonusDamage,
                { isSkillDamage: true, effect: etype, skillName: skillResult.skillName }, logs);
              logs.push(`💥 ${getEffectTypeLabel(etype)} ${target.name} に ${skillResult.bonusDamage} ダメージ！ (残HP: ${target.currentHp})`);
            }
          }
          if (skillResult.stun) {
            const target = selectTarget(enemyTeam);
            if (target) {
              skippedFighters.add(target.id);
              vbEffect('stun', attacker, target, { duration: skillResult.duration });
              logs.push(`💫 ${getEffectTypeLabel('stun')} ${target.name} はスタン状態になった！ (持続${skillResult.duration}T)`);
            }
          }
          if (skillResult.debuffDef > 0) {
            const target = selectTarget(enemyTeam);
            if (target) {
              const before = target.stats.def || 0;
              target.stats.def = Math.max(0, before - skillResult.debuffDef);
              vbEffect('debuff_def', attacker, target, { amount: skillResult.debuffDef, from: before, to: target.stats.def, stat: 'DEF', duration: skillResult.duration });
              logs.push(`🔻 ${getEffectTypeLabel('debuff_def')} ${target.name} の防御力 ${before} → ${target.stats.def}！`);
            }
          }
          if (skillResult.damageUp > 0) {
            const target = selectTarget(enemyTeam);
            if (target) {
              target.damageUpMultiplier = 1 + skillResult.damageUp;
              vbEffect('damage_up', attacker, target, { amount: Math.floor(skillResult.damageUp * 100), duration: skillResult.duration });
              logs.push(`🔻 ${getEffectTypeLabel('damage_up')} ${target.name} は被ダメージ ${Math.floor(skillResult.damageUp * 100)}% 上昇の弱体を受けた！`);
            }
          }
          continue;
        }
      }

      // 通常攻撃
      const target = selectTarget(enemyTeam);
      if (!target) continue;

      // 遠距離物理の通常攻撃命中率判定 (70%)
      if (attacker.role === 'ranged') {
        if (Math.random() * 100 > RANGED_HIT_RATE) {
          logs.push(`💨 [${attacker.team}] ${attacker.name} の攻撃！ しかし ${target.name} には届かなかった！(MISS)`);
          if (typeof playSE === 'function') playSE('miss');
          vbEvents.push({ type: 'miss', turn, attackerId: attacker.id, attackerName: attacker.name, targetId: target.id, targetName: target.name });
          continue;
        }
      }

      // 回避判定
      const evaVal = target.stats.eva || target.stats.spd || 0;
      const evaPercent = Math.min(50, Math.floor(evaVal / 3));
      if ((Math.random() * 100) < evaPercent) {
        logs.push(`💨 [${attacker.team}] ${attacker.name} の攻撃！ しかし ${target.name} は素早く身をかわした！(MISS)`);
        if (typeof playSE === 'function') playSE('miss');
        vbEvents.push({ type: 'miss', turn, attackerId: attacker.id, attackerName: attacker.name, targetId: target.id, targetName: target.name });
        continue;
      }

      // on_damage_taken スキル判定（ダメージ計算直前）
      if (target.customSkill && ROLES[target.role]?.canUseSkill && !target.skillActivatedThisTurn) {
        const dtResult = executeCustomSkill(target, attacker, target.customSkill, turn, 'on_damage_taken');
        if (dtResult.activated) {
          target.skillActivatedThisTurn = true;
          if (typeof playSE === 'function') playSE('skill');
          logs.push(`🛡️ [${target.team}] ${target.name} の「${dtResult.skillName}」が被弾時に発動！`);
          if (dtResult.buffDef > 0) {
            const b = target.stats.def || 0;
            target.stats.def = b + dtResult.buffDef;
            vbEffect('buff_def', target, target, { amount: dtResult.buffDef, from: b, to: target.stats.def, stat: 'DEF' });
            logs.push(`🛡️ ${getEffectTypeLabel('buff_def')} 防御力 ${b} → ${target.stats.def}！`);
          }
          if (dtResult.buffAtk > 0) {
            const b = target.stats.atk || 0;
            target.stats.atk = b + dtResult.buffAtk;
            vbEffect('buff_atk', target, target, { amount: dtResult.buffAtk, from: b, to: target.stats.atk, stat: 'ATK' });
            logs.push(`⚡ ${getEffectTypeLabel('buff_atk')} 攻撃力 ${b} → ${target.stats.atk}！`);
          }
          if (dtResult.buffHp > 0) {
            const b = target.stats.maxHp || target.stats.hp;
            target.stats.maxHp = b + dtResult.buffHp;
            target.currentHp = Math.min(target.stats.maxHp, target.currentHp + dtResult.buffHp);
            vbEffect('buff_hp', target, target, { amount: dtResult.buffHp, from: b, to: target.stats.maxHp, stat: 'MaxHP', hp: target.currentHp, maxHp: target.stats.maxHp });
            logs.push(`❤️ ${getEffectTypeLabel('buff_hp')} 最大HP ${b} → ${target.stats.maxHp}！`);
          }
          if (dtResult.buffSpd > 0) {
            const b = target.stats.spd || 0;
            target.stats.spd = b + dtResult.buffSpd;
            vbEffect('buff_spd', target, target, { amount: dtResult.buffSpd, from: b, to: target.stats.spd, stat: 'SPD' });
            logs.push(`💨 ${getEffectTypeLabel('buff_spd')} 素早さ ${b} → ${target.stats.spd}！`);
          }
          if (dtResult.heal > 0) {
            const real = vbApplyHeal(target, target, dtResult.heal, logs);
            vbEffect(dtResult.effectType === 'lifesteal' ? 'lifesteal' : 'heal', target, target, { amount: real, hp: target.currentHp, maxHp: target.stats.maxHp || target.stats.hp });
            logs.push(`💚 HPを ${real} 回復！ (残HP: ${target.currentHp})`);
          }
        }
      }

      const isSpecial = Math.random() < 0.10;
      const skillName = isSpecial ? (attacker.specialSkill || '奥義') : (attacker.normalSkill || '通常攻撃');
      let damage = calculateDamage(attacker, target, isSpecial);

      // Element affinity bonus on normal/special attack
      if (attacker.element && target.element) {
        const elemBonus = (typeof getElementAffinity === 'function') ? getElementAffinity(attacker.element, target.element) : 0;
        if (elemBonus > 0) {
          damage = Math.floor(damage * 1.5);
          logs.push(`🔥 属性相性ボーナス！ ${attacker.element} → ${target.element} (1.5倍)`);
        }
      }

      if (isSpecial) {
        logs.push(`🔥 [${attacker.team}] ${attacker.name} の決めゼリフ「${attacker.quote || '……'}」！`);
        if (typeof playSE === 'function') playSE('special');
      } else {
        if (typeof playSE === 'function') playSE('attack');
      }

      // スキルの追加ダメージ効果 (damage effectType on on_attack_start)
      if (attacker.customSkill && ROLES[attacker.role]?.canUseSkill && !attacker.skillActivatedThisTurn) {
        const dmgSkillResult = executeCustomSkill(attacker, target, attacker.customSkill, turn, 'on_attack_start');
        if (dmgSkillResult.activated && dmgSkillResult.bonusDamage > 0 &&
            ['damage', 'combo', 'lifesteal'].includes(dmgSkillResult.effectType)) {
          const etype = dmgSkillResult.effectType;
          vbEffect(etype, attacker, target, {
            amount: dmgSkillResult.bonusDamage,
            hits: etype === 'combo' ? 2 : 1,
            hp: Math.max(0, target.currentHp - dmgSkillResult.bonusDamage),
            maxHp: target.stats.maxHp || target.stats.hp
          });
          vbApplyDamage(attacker, target, dmgSkillResult.bonusDamage,
            { isSkillDamage: true, effect: etype, skillName: dmgSkillResult.skillName }, logs);
          logs.push(`🟠 ${getEffectTypeLabel(etype)} ${target.name} に ${dmgSkillResult.bonusDamage} 追加ダメージ！ (残HP: ${target.currentHp})`);
          if (dmgSkillResult.heal > 0) {
            const real = vbApplyHeal(attacker, attacker, dmgSkillResult.heal, logs);
            vbEffect('lifesteal', attacker, attacker, { amount: real, hp: attacker.currentHp, maxHp: attacker.stats.maxHp || attacker.stats.hp });
            logs.push(`🩸 ${getEffectTypeLabel('lifesteal')} ${attacker.name} はHPを ${real} 吸収！ (残HP: ${attacker.currentHp})`);
          }
          if (typeof playSE === 'function') playSE('bonus_damage');
        }
      }

      // 追加ダメージで既に撃破済みなら通常攻撃分は処理しない（KO演出は出力済み）
      if (target.currentHp <= 0) continue;

      // Critical hit (10% chance for normal, always for special)
      const isCritical = isSpecial || (Math.random() < 0.10);
      if (isCritical && !isSpecial) {
        damage = Math.floor(damage * 1.5);
        if (typeof playSE === 'function') playSE('critical');
      }

      const killed = vbApplyDamage(attacker, target, damage,
        { isSpecial, isCritical: isCritical && !isSpecial, skillName }, logs);

      const specialTag = isSpecial ? '🔥【必殺技】' : isCritical ? '⚡【クリティカル】' : '⚔️';
      logs.push(`${specialTag} [${attacker.team}] ${attacker.name} の「${skillName}」！ ${target.name} に ${damage} ダメージ！ (残HP: ${target.currentHp})`);

      if (target.currentHp <= 0) {

        // on_kill スキル判定
        if (attacker.customSkill && ROLES[attacker.role]?.canUseSkill && !attacker.skillActivatedThisTurn) {
          const killResult = executeCustomSkill(attacker, null, attacker.customSkill, turn, 'on_kill');
          if (killResult.activated) {
            logs.push(`💀 [${attacker.team}] ${attacker.name} の「${killResult.skillName}」が撃破時に発動！`);
            if (killResult.buffAtk > 0) {
              const b = attacker.stats.atk || 0;
              attacker.stats.atk = b + killResult.buffAtk;
              vbEffect('buff_atk', attacker, attacker, { amount: killResult.buffAtk, from: b, to: attacker.stats.atk, stat: 'ATK' });
              logs.push(`⚡ ${getEffectTypeLabel('buff_atk')} 攻撃力 ${b} → ${attacker.stats.atk}！`);
            }
            if (killResult.buffHp > 0) {
              const b = attacker.stats.maxHp || attacker.stats.hp;
              attacker.stats.maxHp = b + killResult.buffHp;
              attacker.currentHp = Math.min(attacker.stats.maxHp, attacker.currentHp + killResult.buffHp);
              vbEffect('buff_hp', attacker, attacker, { amount: killResult.buffHp, from: b, to: attacker.stats.maxHp, stat: 'MaxHP', hp: attacker.currentHp, maxHp: attacker.stats.maxHp });
              logs.push(`❤️ ${getEffectTypeLabel('buff_hp')} 最大HP ${b} → ${attacker.stats.maxHp}！`);
            }
            if (killResult.buffSpd > 0) {
              const b = attacker.stats.spd || 0;
              attacker.stats.spd = b + killResult.buffSpd;
              vbEffect('buff_spd', attacker, attacker, { amount: killResult.buffSpd, from: b, to: attacker.stats.spd, stat: 'SPD' });
              logs.push(`💨 ${getEffectTypeLabel('buff_spd')} 素早さ ${b} → ${attacker.stats.spd}！`);
            }
            if (killResult.heal > 0) {
              const real = vbApplyHeal(attacker, attacker, killResult.heal, logs);
              vbEffect(killResult.effectType === 'lifesteal' ? 'lifesteal' : 'heal', attacker, attacker, { amount: real, hp: attacker.currentHp, maxHp: attacker.stats.maxHp || attacker.stats.hp });
              logs.push(`💚 HPを ${real} 回復！ (残HP: ${attacker.currentHp})`);
            }
          }
        }

        // on_death スキル判定（死亡したキャラが発動）
        if (target.customSkill && ROLES[target.role]?.canUseSkill && !target.skillActivatedThisTurn) {
          const deathResult = executeCustomSkill(target, attacker, target.customSkill, turn, 'on_death');
          if (deathResult.activated) {
            target.skillActivatedThisTurn = true;
            if (typeof playSE === 'function') playSE('skill');
            logs.push(`💀 [${target.team}] ${target.name} の「${deathResult.skillName}」が死亡時に発動！最期の力が解放される！`);
            if (deathResult.bonusDamage > 0) {
              const enemyOfDying = target.team === '1P' ? p2Fighters.filter(f => f.currentHp > 0) : p1Fighters.filter(f => f.currentHp > 0);
              if (enemyOfDying.length > 0) {
                const deathTarget = enemyOfDying[Math.floor(Math.random() * enemyOfDying.length)];
                const etype = deathResult.effectType === 'combo' ? 'combo' : 'damage';
                vbEffect(etype, target, deathTarget, { amount: deathResult.bonusDamage, hits: etype === 'combo' ? 2 : 1, hp: Math.max(0, deathTarget.currentHp - deathResult.bonusDamage), maxHp: deathTarget.stats.maxHp || deathTarget.stats.hp });
                // ★反撃ダメージでのKOも通常攻撃と同じKO演出
                vbApplyDamage(target, deathTarget, deathResult.bonusDamage, { isSkillDamage: true, effect: etype, skillName: deathResult.skillName }, logs);
                logs.push(`💥 ${getEffectTypeLabel(etype)} ${deathTarget.name} に ${deathResult.bonusDamage} 反撃ダメージ！ (残HP: ${deathTarget.currentHp})`);
              }
            }
            if (deathResult.heal > 0) {
              const alliesOfDying = target.team === '1P' ? p1Fighters : p2Fighters;
              alliesOfDying.forEach(a => {
                if (a.currentHp > 0) {
                  const real = vbApplyHeal(target, a, deathResult.heal, logs);
                  vbEffect('heal', target, a, { amount: real, hp: a.currentHp, maxHp: a.stats.maxHp || a.stats.hp });
                }
              });
              logs.push(`💚 味方全体のHPを ${deathResult.heal} 回復！ ${target.name}の遺言効果！`);
            }
            if (deathResult.buffAtk > 0) {
              const alliesOfDying = target.team === '1P' ? p1Fighters : p2Fighters;
              alliesOfDying.forEach(a => {
                if (a.currentHp > 0) {
                  const b = a.stats.atk || 0;
                  a.stats.atk = b + deathResult.buffAtk;
                  vbEffect('buff_atk', target, a, { amount: deathResult.buffAtk, from: b, to: a.stats.atk, stat: 'ATK' });
                }
              });
              logs.push(`⚡ ${getEffectTypeLabel('buff_atk')} 味方全体の攻撃力 +${deathResult.buffAtk}！`);
            }
          }
        }
      }

    }

    // ───── 1巡（全生存キャラの行動）完了 ─────
    // ここが turnCount を進める唯一の場所。特殊能力・パッシブでは進まない。
    tickCooldowns([...p1Fighters, ...p2Fighters]);
    vbPush({ type: 'turn_end', turn });
    turn++;
    window._vbTurn = turn;
  }

  const p1DeadCount = p1Fighters.filter(f => f.currentHp <= 0).length;
  const p2DeadCount = p2Fighters.filter(f => f.currentHp <= 0).length;
  const p1Survivors = p1Fighters.length - p1DeadCount;
  const p2Survivors = p2Fighters.length - p2DeadCount;

  logs.push('\n===========================');

  let _vbWinner = 'draw', _vbWinnerName = '引き分け';
  if (p1Survivors > 0 && p2Survivors === 0) {
    logs.push(`🏆 勝者: 【${p1Name}】！ (敵チーム全滅)`);
    _vbWinner = '1P'; _vbWinnerName = p1Name;
  } else if (p2Survivors > 0 && p1Survivors === 0) {
    logs.push(`🏆 勝者: 【${p2Name}】！ (敵チーム全滅)`);
    _vbWinner = '2P'; _vbWinnerName = p2Name;
  } else {
    logs.push(`⏱ ${maxTurns}ターン経過！ 死亡判定を行います。`);
    logs.push(`【${p1Name}】 死亡者数: ${p1DeadCount}名`);
    logs.push(`【${p2Name}】 死亡者数: ${p2DeadCount}名`);
    if (p1DeadCount < p2DeadCount) {
      logs.push(`🏆 死亡者数が少ない【${p1Name}】の判定勝ち！`);
      _vbWinner = '1P'; _vbWinnerName = p1Name;
    } else if (p2DeadCount < p1DeadCount) {
      logs.push(`🏆 死亡者数が少ない【${p2Name}】の判定勝ち！`);
      _vbWinner = '2P'; _vbWinnerName = p2Name;
    } else {
      logs.push(`🤝 死亡者数が同数のため、引き分け！`);
    }
  }
  vbEvents.push({ type: 'battle_end', turn, winner: _vbWinner, winnerName: _vbWinnerName });

  if (typeof playSE === 'function') playSE('battle_end');
  if (typeof SoundManager !== 'undefined' && SoundManager.stopBattleBGM) {
    SoundManager.stopBattleBGM();
  }

  if (logBox) {
    logBox.textContent = logs.join('\n');
    logBox.scrollTop = logBox.scrollHeight;
  }

  // ビジュアルバトルデータを保存して初期化
  window._vbEvents = null;
  window._vbTurn   = 0;
  window.lastBattleVbData = {
    p1Fighters: vbInitP1,
    p2Fighters: vbInitP2,
    events:     vbEvents,
    p1Name,
    p2Name
  };
  if (typeof window.initVisualBattle === 'function') {
    window.initVisualBattle(window.lastBattleVbData);
  }
}

/* ===================================================
   ローカルストレージ
   =================================================== */
function saveLocalCharacters() {
  if (typeof ProfileManager !== 'undefined' && ProfileManager.getActiveProfile()) {
    ProfileManager.saveCharacters(appState.localCharacters || []);
  } else if (appState.localCharacters) {
    localStorage.setItem('my_local_characters', JSON.stringify(appState.localCharacters));
  }
}

function loadLocalCharacters() {
  if (typeof ProfileManager !== 'undefined' && ProfileManager.getActiveProfile()) {
    const chars = ProfileManager.getCharacters();
    appState.localCharacters = chars || [];
    appState.characters = [...appState.localCharacters];
    return;
  }
  const saved = localStorage.getItem('my_local_characters');
  if (saved) {
    try {
      appState.localCharacters = JSON.parse(saved);
      appState.characters = [...appState.localCharacters];
    } catch (e) {
      console.error(e);
    }
  }
}

/* ===================================================
   編集保存・削除
   =================================================== */
window.saveEditCharacter = function(e) {
  if (e) e.preventDefault();
  const id = document.getElementById('edit-char-id').value;

  const charList = appState.characters || appState.localCharacters || [];
  const char = charList.find(c => c.id === id);
  if (!char) return alert('キャラクターが見つかりませんでした');

  char.name = document.getElementById('edit-char-name').value.trim();
  char.job = document.getElementById('edit-char-job').value.trim();

  const editRoleEl = document.getElementById('edit-char-role');
  if (editRoleEl) char.role = editRoleEl.value;

  const roleDef = ROLES[char.role];
  const tagsInput = document.getElementById('edit-char-tags').value;
  char.tags = tagsInput ? tagsInput.split(',').map(t => t.trim()).filter(t => t) : [];

  const editElemSelect = document.getElementById('edit-char-element');
  if (editElemSelect) char.element = editElemSelect.value;
  const editElemColor = document.getElementById('edit-char-element-color');
  if (editElemColor) char.elementColor = editElemColor.value;

  char.bio = document.getElementById('edit-char-bio').value.trim();
  char.quote = document.getElementById('edit-char-quote').value.trim();

  if (roleDef && roleDef.lockSkillNames) {
    char.normalSkill = '回復魔法';
    char.specialSkill = '大回復魔法';
  } else {
    char.normalSkill = document.getElementById('edit-char-normal-skill').value.trim();
    char.specialSkill = document.getElementById('edit-char-special-skill').value.trim();
  }

  const hpPt = parseInt(document.getElementById('edit-num-stat-hp')?.value) || 0;
  const atkPt = parseInt(document.getElementById('edit-num-stat-atk')?.value) || 0;
  const defPt = parseInt(document.getElementById('edit-num-stat-def')?.value) || 0;
  let spdPt = parseInt(document.getElementById('edit-num-stat-eva')?.value) || 0;
  if (roleDef && roleDef.fixedSpd !== undefined) spdPt = roleDef.fixedSpd;

  char.stats = {
    hp: hpPt * 5,
    maxHp: hpPt * 5,
    atk: atkPt,
    def: Math.floor(defPt * DEF_MULTIPLIER),
    spd: spdPt,
    eva: spdPt,
    evaRate: Math.min(30, Math.floor(spdPt * 0.2))
  };
  char.customSkill = (typeof selectedEditSkillData !== 'undefined' && selectedEditSkillData) ? selectedEditSkillData : null;

  if (typeof saveLocalCharacters === 'function') saveLocalCharacters();
  if (typeof renderCharacterGallery === 'function') renderCharacterGallery();
  if (typeof renderTeamSlots === 'function') renderTeamSlots();
  if (typeof closeEditModal === 'function') closeEditModal();
  alert(`「${char.name}」の変更を保存しました！`);
};

window.deleteCharacter = function(id) {
  if (!confirm('本当にこのキャラクターを削除しますか？')) return;

  if (appState.localCharacters) {
    appState.localCharacters = appState.localCharacters.filter(c => c.id !== id);
  }
  if (appState.characters) {
    appState.characters = appState.characters.filter(c => c.id !== id);
  }

  if (typeof saveLocalCharacters === 'function') saveLocalCharacters();
  if (typeof renderCharacterGallery === 'function') renderCharacterGallery();
  if (typeof renderTeamSlots === 'function') renderTeamSlots();
};
