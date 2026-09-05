/* main.js（全文更新：screenState='menu'追加、title/menu表示制御・通貨表示切替、settings戻り先追跡、null安全なイベント登録、スキルツリー終了時の遷移修正） */
const SAVE_SLOT_PREFIX='neonDecaySlot_';
const SAVE_SLOT_COUNT=5;
function slotKey(i){ return SAVE_SLOT_PREFIX+i; }
function listSaveSlots(){
  const slots=[];
  for(let i=0;i<SAVE_SLOT_COUNT;i++){
    const raw=localStorage.getItem(slotKey(i));
    slots.push(raw? JSON.parse(raw) : null);
  }
  return slots;
}
let currentSlotIndex=null;
function defaultSave(){
  return { slotName:'', lastPlayed:0, tokens:0, skillStars:0, maxWave:0, tokenLevels:{}, totalTokensEarned:0,
    slots:[{name:'スロット1',build:{}},{name:'スロット2',build:{}},{name:'スロット3',build:{}},{name:'スロット4',build:{}},{name:'スロット5',build:{}}],
    activeSlot:0, milestonesClaimed:[], settings:{bgm:0.35,se:0.7} };
}
function saveGame(){
  if(currentSlotIndex==null) return;
  gameData.lastPlayed=Date.now();
  localStorage.setItem(slotKey(currentSlotIndex), JSON.stringify(gameData));
}
function loadSlot(i){
  const raw=localStorage.getItem(slotKey(i));
  currentSlotIndex=i;
  gameData = raw? Object.assign(defaultSave(), JSON.parse(raw)) : defaultSave();
  if(!gameData.slotName) gameData.slotName='セーブ'+(i+1);
  saveGame();
}
function deleteSlot(i){ localStorage.removeItem(slotKey(i)); renderSaveSlotDialog(); }
let gameData=defaultSave();

const canvas=document.getElementById('game');
const ctx=canvas.getContext('2d');
let W=0,H=0;
function resize(){ canvas.width=window.innerWidth; canvas.height=window.innerHeight; W=canvas.width; H=canvas.height; }
window.addEventListener('resize',resize); resize();

function roundRectPath(c,x,y,w,h,r){ c.beginPath(); c.moveTo(x+r,y); c.arcTo(x+w,y,x+w,y+h,r); c.arcTo(x+w,y+h,x,y+h,r); c.arcTo(x,y+h,x,y,r); c.arcTo(x,y,x+w,y,r); c.closePath(); }
function norm(v){ const l=Math.hypot(v[0],v[1])||1; return [v[0]/l,v[1]/l]; }
function drawRoundedPolygon(cx,cy,radius,sides,rotation,cornerRadius){
  const pts=[]; for(let i=0;i<sides;i++){ const a=rotation+i*(Math.PI*2/sides); pts.push([cx+Math.cos(a)*radius,cy+Math.sin(a)*radius]); }
  ctx.beginPath();
  for(let i=0;i<pts.length;i++){
    const p0=pts[i],p1=pts[(i+1)%pts.length],p2=pts[(i+2)%pts.length];
    const v1=norm([p0[0]-p1[0],p0[1]-p1[1]]), v2=norm([p2[0]-p1[0],p2[1]-p1[1]]);
    const cut=Math.min(cornerRadius,radius*0.5);
    const s=[p1[0]+v1[0]*cut,p1[1]+v1[1]*cut], en=[p1[0]+v2[0]*cut,p1[1]+v2[1]*cut];
    if(i===0) ctx.moveTo(s[0],s[1]); else ctx.lineTo(s[0],s[1]);
    ctx.quadraticCurveTo(p1[0],p1[1],en[0],en[1]);
  }
  ctx.closePath();
}
function dist(x1,y1,x2,y2){ return Math.hypot(x1-x2,y1-y2); }
function pointToSegDist(px,py,x1,y1,x2,y2){
  const dx=x2-x1,dy=y2-y1; const len2=dx*dx+dy*dy||1;
  let t=((px-x1)*dx+(py-y1)*dy)/len2; t=Math.max(0,Math.min(1,t));
  return dist(px,py,x1+t*dx,y1+t*dy);
}
function damageTarget(e,amount,isCrit){
  e.hp-=amount; e.hitFlash=0.12; AudioEngine.SE.hitEnemy(); spawnParticles(e.x,e.y,e.color||'#fff',4);
  spawnDamageNumber(e.x,e.y,amount,!!isCrit);
  if(e.hp<=0 && !e.dead){
    e.dead=true;
    const isBossPart = game.boss && (e===game.boss || (game.boss.children&&game.boss.children.includes(e)) || (game.boss.segs&&game.boss.segs.includes(e)));
    if(!isBossPart){ game.kills++; AudioEngine.SE.enemyDie(); spawnParticles(e.x,e.y,e.color,16); spawnChestMaybe(e.x,e.y); }
  }
}
function spawnDamageNumber(x,y,amount,isCrit){
  game.floatingTexts.push({x,y:y-10,text:Math.round(amount).toString(),isCrit,life:0.9,maxLife:0.9,vy:-46});
  if(isCrit){
    game.floatingTexts.push({x,y:y-34,text:'CRITICAL!',isCrit:true,critLabel:true,life:0.9,maxLife:0.9,vy:-46});
    AudioEngine.SE.critical();
  }
}
function spawnChestMaybe(x,y){
  if(Math.random()<0.005){
    const val=Math.min(200, 20+game.wave*4+Math.floor(Math.random()*10));
    game.chests.push({x,y,r:16,phase:Math.random()*Math.PI*2,value:val});
  }
}
function spawnParticles(x,y,color,count){
  for(let i=0;i<count;i++){
    const ang=Math.random()*Math.PI*2, spd=60+Math.random()*180;
    game.particles.push({x,y,vx:Math.cos(ang)*spd,vy:Math.sin(ang)*spd,life:0.4+Math.random()*0.4,maxLife:0.6,color,size:2+Math.random()*3});
  }
}
function screenShake(a){ game.shake=Math.max(game.shake,a); }
function waveEnemyCount(wave){ return Math.round(10+(wave-1)*4.4); }
function grantTokens(amount){ gameData.tokens+=amount; gameData.totalTokensEarned=(gameData.totalTokensEarned||0)+amount; }

const keys={};
window.addEventListener('keydown',e=>{ keys[e.key.toLowerCase()]=true; });
window.addEventListener('keyup',e=>{ keys[e.key.toLowerCase()]=false; });

let screenState='title';
let previousScreen='title';
let game=null;
let lastTime=0;

function startRun(){
  W=canvas.width; H=canvas.height;
  game={player:makePlayer(),enemies:[],bullets:[],particles:[],chests:[],swings:[],lightnings:[],fireballs:[],drones:[],
    floatingTexts:[],chestPopup:null,
    wave:1,waveTimer:0,waveDuration:26,spawnTimer:0,spawnQueue:waveEnemyCount(1),kills:0,elapsed:0,shake:0,running:true,
    tokensThisRun:0,starsThisRun:0,boss:null,bossActive:false,hitStop:0,legendCooldowns:{crosscut:0,shotgun:0,lifedrain:0}};
  game.player.x=W/2; game.player.y=H/2;
  screenState='game'; syncScreenDom();
  showWaveBanner(1); AudioEngine.SE.waveStart();
  lastTime=performance.now(); requestAnimationFrame(loop);
}
function showWaveBanner(w){ const el=document.getElementById('waveBanner'); if(!el) return; el.textContent='WAVE '+w; el.classList.remove('show'); void el.offsetWidth; el.classList.add('show'); }
function showStarBanner(n){ const el=document.getElementById('starBanner'); if(!el) return; el.textContent=`🌟 スキルスター +${n} 獲得！`; el.classList.remove('show'); void el.offsetWidth; el.classList.add('show'); }

function loop(now){
  if(!game||!game.running) return;
  let rawDt=(now-lastTime)/1000; lastTime=now; rawDt=Math.min(rawDt,0.05);
  let dt=rawDt;
  if(game.hitStop>0){ game.hitStop-=rawDt; dt=rawDt*0.08; }
  update(dt); render();
  requestAnimationFrame(loop);
}

const BOSS_STAR_REWARD={10:2,20:2,30:3,40:3,50:5};
function triggerBoss(wave){
  game.bullets=[];
  game.boss=createBoss(wave); game.bossActive=true;
  const wrap=document.getElementById('bossHpWrap'); if(wrap) wrap.classList.remove('hidden');
  const nameEl=document.getElementById('bossName'); if(nameEl) nameEl.textContent=game.boss.name;
  AudioEngine.SE.bossAppear(); AudioEngine.startBGM(true);
  showWaveBanner('WAVE '+wave+' — BOSS');
}
function endBoss(){
  const wave=game.boss.wave;
  dissolveBoss(); AudioEngine.SE.bossDie();
  const wrap=document.getElementById('bossHpWrap'); if(wrap) wrap.classList.add('hidden');
  if(!gameData.milestonesClaimed.includes(wave)){
    gameData.milestonesClaimed.push(wave);
    const reward=BOSS_STAR_REWARD[wave]||1;
    gameData.skillStars+=reward; game.starsThisRun+=reward;
    saveGame(); AudioEngine.SE.starGain(); showStarBanner(reward);
  }
  game.boss=null; game.bossActive=false;
  AudioEngine.startBGM(false);
  if(wave>=50){ triggerGameClear(); return; }
  game.wave=wave+1; game.waveTimer=0; game.waveDuration=Math.max(14,26-game.wave*0.4);
  game.spawnQueue=(game.spawnQueue||0)+waveEnemyCount(game.wave);
  showWaveBanner(game.wave); AudioEngine.SE.waveStart();
}
function triggerGameClear(){
  game.running=false; AudioEngine.SE.gameClear(); AudioEngine.stopBGM();
  gameData.maxWave=Math.max(gameData.maxWave,50); saveGame();
  setText('clearTime',fmtTime(game.elapsed));
  setText('clearKills',game.kills);
  setText('clearTokens',game.tokensThisRun);
  setText('clearStars',game.starsThisRun);
  setTimeout(()=>{ screenState='gameclear'; syncScreenDom(); },1200);
}
function fmtTime(t){ return String(Math.floor(t/60)).padStart(2,'0')+':'+String(Math.floor(t%60)).padStart(2,'0'); }
function setText(id,val){ const el=document.getElementById(id); if(el) el.textContent=val; }

function update(dt){
  const p=game.player;
  game.elapsed+=dt;
  if(game.shake>0) game.shake=Math.max(0,game.shake-dt*40);

  if(!game.bossActive){
    game.waveTimer+=dt; game.spawnTimer+=dt;
    if(game.waveTimer>=game.waveDuration){
      const nextWave=game.wave+1;
      if(BOSS_TABLE[nextWave]){ game.wave=nextWave; triggerBoss(nextWave); }
      else {
        game.waveTimer=0; game.wave=nextWave; game.waveDuration=Math.max(14,26-game.wave*0.4);
        game.spawnQueue=(game.spawnQueue||0)+waveEnemyCount(game.wave);
        showWaveBanner(game.wave); AudioEngine.SE.waveStart();
      }
    }
    const spawnInterval=Math.max(0.5,1.5-game.wave*0.02);
    if(game.spawnTimer>=spawnInterval && (game.spawnQueue||0)>0){
      game.spawnTimer=0; game.spawnQueue--; game.enemies.push(spawnEnemy(game.wave));
    }
  }

  const prevX=p.x, prevY=p.y;
  updatePlayer(dt);
  p.moveVX=(p.x-prevX)/Math.max(dt,0.0001); p.moveVY=(p.y-prevY)/Math.max(dt,0.0001);

  game.swings.forEach(s=>s.life-=dt); game.swings=game.swings.filter(s=>s.life>0);
  game.lightnings.forEach(l=>l.life-=dt); game.lightnings=game.lightnings.filter(l=>l.life>0);
  game.fireballs.forEach(f=>{ f.life-=dt; f.r=f.maxR*(1-f.life/f.maxLife); }); game.fireballs=game.fireballs.filter(f=>f.life>0);

  updateEnemies(dt);
  if(game.bossActive && game.boss){
    updateBoss(dt);
    if(bossIsDefeated(game.boss)){ endBoss(); }
    else {
      const cur=bossTotalHp(game.boss), mx=bossMaxHp(game.boss);
      const bar=document.getElementById('bossHpInner'); if(bar) bar.style.width=Math.max(0,cur/mx*100)+'%';
    }
  }

  for(const b of game.bullets){
    b.x+=b.vx*dt; b.y+=b.vy*dt;
    b.dead=(b.x<-50||b.x>W+50||b.y<-50||b.y>H+50);
    if(b.owner==='enemy' && !b.dead){
      if(dist(b.x,b.y,p.x,p.y)<b.r+p.r){ damagePlayer(b.dmg); b.dead=true; }
    } else if(b.owner==='player' && !b.dead){
      let targets=[...game.enemies];
      if(game.bossActive && game.boss){
        const bossTargets = game.boss.type==='splitter'?[game.boss,...game.boss.children]:(game.boss.type==='centipede'?game.boss.segs:[game.boss]);
        targets=targets.concat(bossTargets.filter(t=>!t.dead));
      }
      for(const e of targets){
        if(b.hitSet.has(e)) continue;
        if(dist(b.x,b.y,e.x,e.y)<b.r+e.r){ damageTarget(e,b.dmg); tryApplyStatus(e); b.hitSet.add(e); if(!b.pierce){ b.dead=true; break; } }
      }
    }
  }
  game.bullets=game.bullets.filter(b=>!b.dead);

  for(const pt of game.particles){ pt.x+=pt.vx*dt; pt.y+=pt.vy*dt; pt.vx*=0.92; pt.vy*=0.92; pt.life-=dt; }
  game.particles=game.particles.filter(pt=>pt.life>0);

  for(const c of game.chests){
    c.phase+=dt*3;
    if(dist(c.x,c.y,p.x,p.y)<c.r+p.r+10){
      c.collected=true;
      const gained=Math.round(c.value*p.base.tokenMul);
      grantTokens(gained);
      game.tokensThisRun+=gained;
      AudioEngine.SE.chestFanfare();
      spawnParticles(c.x,c.y,'#f4ff00',40);
      game.chestPopup={text:'+'+gained+' TOKENS!',timer:1.8,maxTimer:1.8};
    }
  }
  game.chests=game.chests.filter(c=>!c.collected);

  game.floatingTexts.forEach(t=>{ t.y+=t.vy*dt; t.vy*=0.94; t.life-=dt; });
  game.floatingTexts=game.floatingTexts.filter(t=>t.life>0);
  if(game.chestPopup){ game.chestPopup.timer-=dt; if(game.chestPopup.timer<=0) game.chestPopup=null; }

  if(!game.legendCooldowns) game.legendCooldowns={crosscut:0,shotgun:0,lifedrain:0};
  Object.keys(game.legendCooldowns).forEach(k=>{ if(game.legendCooldowns[k]>0) game.legendCooldowns[k]=Math.max(0,game.legendCooldowns[k]-dt); });
  renderLegendButtons();

  updateHUD();
  if(p.hp<=0) endRun();
}

function updateHUD(){
  const p=game.player;
  const hpBar=document.getElementById('hpBar'); if(hpBar) hpBar.style.width=Math.max(0,(p.hp/p.maxHp*100))+'%';
  setText('hpText',Math.max(0,Math.ceil(p.hp))+'/'+Math.round(p.maxHp));
  setText('waveText',game.wave);
  setText('killText',game.kills);
  setText('runTokenText',game.tokensThisRun);
  setText('timeText',fmtTime(game.elapsed));
}
function endRun(){
  game.running=false; AudioEngine.SE.gameOver(); AudioEngine.stopBGM();
  const wrap=document.getElementById('bossHpWrap'); if(wrap) wrap.classList.add('hidden');
  const tokensEarned=Math.round((game.wave*15+game.kills*1)*game.player.base.tokenMul+game.tokensThisRun);
  grantTokens(tokensEarned);
  gameData.maxWave=Math.max(gameData.maxWave,game.wave); saveGame();
  setText('statWave',game.wave);
  setText('statKills',game.kills);
  setText('statTime',fmtTime(game.elapsed));
  setText('statTokens',tokensEarned);
  setText('statStars',game.starsThisRun);
  setTimeout(()=>{ screenState='gameover'; syncScreenDom(); },500);
}

function render(){
  ctx.save(); ctx.clearRect(0,0,W,H);
  ctx.strokeStyle='rgba(0,255,242,0.06)'; ctx.lineWidth=1;
  for(let x=0;x<W;x+=48){ ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,H); ctx.stroke(); }
  for(let y=0;y<H;y+=48){ ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(W,y); ctx.stroke(); }
  let shakeX=0,shakeY=0;
  if(game.shake>0){ shakeX=(Math.random()-0.5)*game.shake; shakeY=(Math.random()-0.5)*game.shake; ctx.translate(shakeX,shakeY); }

  for(const c of game.chests){
    const glow=10+Math.sin(c.phase)*6;
    ctx.save(); ctx.shadowColor='#f4ff00'; ctx.shadowBlur=glow; ctx.fillStyle='#f4ff00';
    roundRectPath(ctx,c.x-c.r,c.y-c.r,c.r*2,c.r*2,5); ctx.fill(); ctx.strokeStyle='#fff'; ctx.lineWidth=2; ctx.stroke(); ctx.restore();
  }
  for(const pt of game.particles){ ctx.globalAlpha=Math.max(0,pt.life/pt.maxLife); ctx.fillStyle=pt.color; ctx.beginPath(); ctx.arc(pt.x,pt.y,pt.size,0,Math.PI*2); ctx.fill(); }
  ctx.globalAlpha=1;

  drawEnemies();
  if(game.bossActive && game.boss){ drawTelegraphs(); drawBoss(); }

  for(const b of game.bullets){ ctx.save(); ctx.shadowColor=b.color; ctx.shadowBlur=14; ctx.fillStyle=b.color; ctx.beginPath(); ctx.arc(b.x,b.y,b.r,0,Math.PI*2); ctx.fill(); ctx.restore(); }
  for(const l of game.lightnings){
    const a=l.life/l.maxLife;
    ctx.save(); ctx.globalAlpha=a; ctx.strokeStyle=l.type==='laser'?'#00fff2':'#d1c4ff'; ctx.lineWidth=l.type==='laser'?5:3;
    ctx.shadowColor=ctx.strokeStyle; ctx.shadowBlur=16; ctx.beginPath(); ctx.moveTo(l.x1,l.y1); ctx.lineTo(l.x2,l.y2); ctx.stroke(); ctx.restore();
  }
  for(const f of game.fireballs){
    const a=f.life/f.maxLife;
    ctx.save(); ctx.globalAlpha=a*0.5; ctx.fillStyle='#ff6a2b'; ctx.shadowColor='#ff6a2b'; ctx.shadowBlur=24;
    ctx.beginPath(); ctx.arc(f.x,f.y,f.r,0,Math.PI*2); ctx.fill(); ctx.restore();
  }
  for(const s of game.swings){
    const a=s.life/s.maxLife;
    ctx.save(); ctx.globalAlpha=a*0.6; ctx.strokeStyle=s.boxer?'#ff2b4d':'#00fff2'; ctx.lineWidth=6;
    ctx.shadowColor=ctx.strokeStyle; ctx.shadowBlur=18; ctx.beginPath(); ctx.arc(s.x,s.y,s.range*0.7,s.angle-0.9,s.angle+0.9); ctx.stroke(); ctx.restore();
  }
  drawMothership();
  drawPlayer();

  for(const t of game.floatingTexts){
    const a=Math.max(0,t.life/t.maxLife);
    ctx.save(); ctx.globalAlpha=a; ctx.textAlign='center'; ctx.textBaseline='middle';
    if(t.critLabel){ ctx.font='bold 26px Consolas'; ctx.fillStyle='#f4ff00'; ctx.shadowColor='#f4ff00'; ctx.shadowBlur=18; }
    else if(t.isCrit){ ctx.font='bold 30px Consolas'; ctx.fillStyle='#f4ff00'; ctx.shadowColor='#f4ff00'; ctx.shadowBlur=16; }
    else { ctx.font='bold 16px Consolas'; ctx.fillStyle='#c4f5ff'; ctx.shadowColor='#00fff2'; ctx.shadowBlur=10; }
    ctx.fillText(t.text, t.x, t.y);
    ctx.restore();
  }
  ctx.restore();

  if(game.chestPopup){
    const cp=game.chestPopup;
    const prog=1-cp.timer/cp.maxTimer;
    const scale = prog<0.2? (prog/0.2) : (cp.timer<0.4? cp.timer/0.4 : 1);
    ctx.save();
    ctx.globalAlpha=Math.min(1,cp.timer/0.4+0.3);
    ctx.translate(W/2,H*0.32);
    ctx.scale(Math.max(0.4,scale),Math.max(0.4,scale));
    ctx.textAlign='center'; ctx.textBaseline='middle';
    ctx.font='bold 42px Consolas'; ctx.fillStyle='#f4ff00'; ctx.shadowColor='#f4ff00'; ctx.shadowBlur=26;
    ctx.fillText(cp.text,0,0);
    ctx.restore();
  }
}

/* ---- 通貨表示（画面3=menu時のみ表示、画面1=titleでは非表示） ---- */
function starIconHtml(){ return `<svg class="star-icon-svg" viewBox="0 0 100 140"><path d="M50 2 C54 2 56 6 58 14 L66 46 C82 48 96 50 98 54 C100 58 96 62 84 70 L64 84 C68 100 72 116 70 122 C68 128 62 128 50 118 C38 128 32 128 30 122 C28 116 32 100 36 84 L16 70 C4 62 0 58 2 54 C4 50 18 48 34 46 L42 14 C44 6 46 2 50 2 Z" fill="url(#starGrad)" stroke="#fff" stroke-width="2" stroke-linejoin="round"/></svg>`; }
function renderGlobalCurrency(){
  const el=document.getElementById('globalCurrency'); if(!el) return;
  el.innerHTML=`<div class="curr-pill">⬡ ${gameData.tokens}</div><div class="curr-pill star">${starIconHtml()} ${gameData.skillStars}</div>`;
}
function onCurrencyChange(){
  renderGlobalCurrency();
  const el=document.getElementById('globalCurrency'); if(!el) return;
  el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop');
}
window.onCurrencyChange=onCurrencyChange;

/* ---- レジェンドボタン ---- */
function renderLegendButtons(){
  const wrap=document.getElementById('legendButtons'); if(!wrap || !game) return;
  wrap.innerHTML='';
  const b=game.player.build;
  const defs=[];
  if(b.legendMage) defs.push({label:'クロスカット',key:'crosscut'});
  if(b.legendGunner) defs.push({label:'破滅の散弾',key:'shotgun'});
  if(b.legendVitality) defs.push({label:'吸血',key:'lifedrain'});
  defs.forEach(d=>{
    const btn=document.createElement('button');
    btn.className='legend-btn';
    const cd=game.legendCooldowns[d.key]||0;
    btn.disabled = cd>0 || (d.key==='lifedrain' && game.player.hp>=game.player.maxHp*0.99);
    btn.innerHTML=`<span>${d.label}</span>${cd>0?`<span class="legend-cd">${cd.toFixed(1)}s</span>`:''}`;
    btn.addEventListener('click',()=>triggerLegendSkill(d.key));
    wrap.appendChild(btn);
  });
}

/* ---- スキルツリー画面（スロットバー・レンダリング） ---- */
let stLoopRunning=false, stLastTime=0;
function stLoop(now){
  if(screenState!=='skilltree') { stLoopRunning=false; return; }
  const dt=stLastTime? Math.min(0.05,(now-stLastTime)/1000):0.016; stLastTime=now;
  SkillTree.render(dt);
  requestAnimationFrame(stLoop);
}
function renderSlotBar(){
  const bar=document.getElementById('stSlotBar'); if(!bar) return;
  bar.innerHTML='';
  gameData.slots.forEach((s,i)=>{
    const btn=document.createElement('button');
    btn.className='slot-btn'+(i===gameData.activeSlot?' active':'');
    btn.textContent=s.name; btn.title='ダブルクリックで名称変更';
    btn.addEventListener('click',()=>{ gameData.activeSlot=i; saveGame(); renderSlotBar(); });
    btn.addEventListener('dblclick',()=>{ const nn=prompt('スロット名を入力',s.name); if(nn){ s.name=nn.slice(0,12); saveGame(); renderSlotBar(); } });
    bar.appendChild(btn);
  });
}

/* ---- セーブスロットダイアログ ---- */
function fmtDate(ts){
  if(!ts) return '未プレイ';
  const d=new Date(ts);
  return `${d.getFullYear()}/${String(d.getMonth()+1).padStart(2,'0')}/${String(d.getDate()).padStart(2,'0')} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
}
function renderSaveSlotDialog(){
  const slots=listSaveSlots();
  const list=document.getElementById('saveSlotList'); if(!list) return;
  list.innerHTML='';
  slots.forEach((s,i)=>{
    const row=document.createElement('div');
    if(s){
      row.className='save-slot-item';
      const nameSpan=document.createElement('span');
      nameSpan.className='name'; nameSpan.textContent=s.slotName||('セーブ'+(i+1));
      nameSpan.style.cursor='pointer';
      nameSpan.addEventListener('click',(e)=>{
        e.stopPropagation();
        const nn=prompt('セーブ名を入力',s.slotName||('セーブ'+(i+1)));
        if(nn){ s.slotName=nn.slice(0,14); localStorage.setItem(slotKey(i),JSON.stringify(s)); renderSaveSlotDialog(); }
      });
      const info=document.createElement('div'); info.className='save-slot-info';
      info.appendChild(nameSpan);
      const line1=document.createElement('span'); line1.textContent=`最終プレイ: ${fmtDate(s.lastPlayed)}`;
      const line2=document.createElement('span'); line2.textContent=`最高WAVE: ${s.maxWave||0} / トークン: ${s.tokens||0}`;
      const hint=document.createElement('div'); hint.className='save-slot-hint'; hint.textContent='※名前タップで変更可';
      info.appendChild(line1); info.appendChild(line2); info.appendChild(hint);
      row.appendChild(info);
      const actions=document.createElement('div'); actions.className='save-slot-actions';
      const loadBtn=document.createElement('button'); loadBtn.className='neon-btn small';
      loadBtn.textContent='ロード';
      loadBtn.addEventListener('click',()=>{
        loadSlot(i); closeSaveDialog();
        screenState='menu'; syncScreenDom();
      });
      const delBtn=document.createElement('button'); delBtn.className='neon-btn small yellow';
      delBtn.textContent='削除';
      delBtn.addEventListener('click',(e)=>{ e.stopPropagation(); if(confirm('このセーブデータを削除しますか？')) deleteSlot(i); });
      actions.appendChild(loadBtn); actions.appendChild(delBtn);
      row.appendChild(actions);
    } else {
      row.className='save-slot-item empty';
      row.textContent='空きスロット '+(i+1)+' — 新規作成';
      row.addEventListener('click',()=>{
        currentSlotIndex=i; gameData=defaultSave(); gameData.slotName='セーブ'+(i+1);
        saveGame(); closeSaveDialog();
        startRun();
      });
    }
    list.appendChild(row);
  });
}
function openSaveDialog(){ renderSaveSlotDialog(); const el=document.getElementById('saveSlotDialog'); if(el) el.classList.remove('hidden'); }
function closeSaveDialog(){ const el=document.getElementById('saveSlotDialog'); if(el) el.classList.add('hidden'); }

/* ---- 画面遷移管理 ----
   title: 画面1(通貨非表示・3ボタン)
   menu : 画面3(通貨表示・3ボタン)
   game / gameover / gameclear / settings / skilltree はそのまま
*/
function syncScreenDom(){
  ['titleScreen','menuScreen','settingsScreen','gameOverScreen','gameClearScreen'].forEach(id=>{
    const el=document.getElementById(id); if(el) el.classList.add('hidden');
  });
  const hud=document.getElementById('hud'); if(hud) hud.classList.add('hidden');
  const stOverlay=document.getElementById('skilltreeOverlay'); if(stOverlay) stOverlay.classList.add('hidden');
  const panel=document.getElementById('skillNodePanel'); if(panel) panel.classList.add('hidden');
  const legendWrap=document.getElementById('legendButtons'); if(legendWrap) legendWrap.innerHTML='';

  const gc=document.getElementById('globalCurrency');
  if(gc){
    if(screenState==='menu'){ gc.style.display='flex'; renderGlobalCurrency(); }
    else { gc.style.display='none'; }
  }

  if(screenState==='title'){
    const el=document.getElementById('titleScreen'); if(el) el.classList.remove('hidden');
  }
  else if(screenState==='menu'){
    const el=document.getElementById('menuScreen'); if(el) el.classList.remove('hidden');
    setText('menuMaxWave',gameData.maxWave);
  }
  else if(screenState==='settings'){
    const el=document.getElementById('settingsScreen'); if(el) el.classList.remove('hidden');
  }
  else if(screenState==='game'){
    if(hud) hud.classList.remove('hidden');
  }
  else if(screenState==='gameover'){
    const el=document.getElementById('gameOverScreen'); if(el) el.classList.remove('hidden');
  }
  else if(screenState==='gameclear'){
    const el=document.getElementById('gameClearScreen'); if(el) el.classList.remove('hidden');
  }
  else if(screenState==='skilltree'){
    if(stOverlay) stOverlay.classList.remove('hidden');
    renderSlotBar(); SkillTree.reset();
    if(!stLoopRunning){ stLoopRunning=true; stLastTime=0; requestAnimationFrame(stLoop); }
  }
}

/* ---- タッチ・入力配線（要素存在チェック付き） ---- */
canvas.addEventListener('wheel',(e)=>{ if(screenState==='skilltree') SkillTree.onWheel(e); },{passive:false});
canvas.addEventListener('mousedown',(e)=>{ if(screenState==='skilltree') SkillTree.onDown(e); });
canvas.addEventListener('mousemove',(e)=>{ if(screenState==='skilltree') SkillTree.onMove(e); });
window.addEventListener('mouseup',(e)=>{ if(screenState==='skilltree') SkillTree.onUp(e); });
canvas.addEventListener('touchstart',(e)=>{ if(screenState==='skilltree') SkillTree.onTouchStart(e); },{passive:false});
canvas.addEventListener('touchmove',(e)=>{ if(screenState==='skilltree') SkillTree.onTouchMove(e); },{passive:false});
canvas.addEventListener('touchend',(e)=>{ if(screenState==='skilltree') SkillTree.onTouchEnd(e); },{passive:false});
canvas.addEventListener('click',(e)=>{
  if(screenState!=='skilltree') return;
  const rect=canvas.getBoundingClientRect();
  SkillTree.handleTap(e.clientX-rect.left, e.clientY-rect.top);
});

/* ---- ボタンイベント（null安全登録） ---- */
function on(id,ev,fn){ const el=document.getElementById(id); if(el) el.addEventListener(ev,fn); }
function ensureAudio(){ AudioEngine.init(); }

on('btnNewGame','click',()=>{
  ensureAudio(); AudioEngine.SE.click();
  const slots=listSaveSlots();
  const emptyIdx=slots.findIndex(s=>!s);
  if(emptyIdx===-1){ alert('セーブ枠が満杯です。既存データを削除してください。'); openSaveDialog(); return; }
  currentSlotIndex=emptyIdx; gameData=defaultSave(); gameData.slotName='セーブ'+(emptyIdx+1);
  saveGame(); AudioEngine.startBGM(false); startRun();
});
on('btnContinue','click',()=>{ ensureAudio(); AudioEngine.SE.click(); openSaveDialog(); });
on('btnSaveDialogClose','click',()=>{ AudioEngine.SE.click(); closeSaveDialog(); });

on('btnSettings','click',()=>{ ensureAudio(); AudioEngine.SE.click(); previousScreen='title'; screenState='settings'; syncScreenDom(); });
on('btnMenuSettings','click',()=>{ ensureAudio(); AudioEngine.SE.click(); previousScreen='menu'; screenState='settings'; syncScreenDom(); });
on('btnSettingsBack','click',()=>{ AudioEngine.SE.click(); screenState=previousScreen||'title'; syncScreenDom(); });

on('btnPlay','click',()=>{ ensureAudio(); AudioEngine.SE.click(); AudioEngine.startBGM(false); startRun(); });
on('btnMenuSkillTree','click',()=>{ ensureAudio(); AudioEngine.SE.click(); screenState='skilltree'; syncScreenDom(); });

on('btnNext','click',()=>{ AudioEngine.SE.click(); screenState='skilltree'; syncScreenDom(); });
on('btnTreeExit','click',()=>{ AudioEngine.SE.click(); screenState='menu'; syncScreenDom(); });
on('btnClearBack','click',()=>{ AudioEngine.SE.click(); screenState='title'; syncScreenDom(); });

on('btnRespec','click',()=>{
  const slot=gameData.slots[gameData.activeSlot];
  const hasAny = Object.keys(slot.build||{}).length>0 || Object.keys(gameData.tokenLevels||{}).length>0;
  if(!hasAny) return;
  if(!confirm('全スキル（基礎ツリー含む）を初期化し、獲得済みの累計トークンとスターを全額返却します。よろしいですか？')) return;
  respecActiveSlot();
  AudioEngine.SE.skillBuy();
});

on('bgmVol','input',(e)=>{ AudioEngine.setVol(e.target.value/100,gameData.settings.se); gameData.settings.bgm=e.target.value/100; saveGame(); });
on('seVol','input',(e)=>{ AudioEngine.setVol(gameData.settings.bgm,e.target.value/100); gameData.settings.se=e.target.value/100; saveGame(); });
(function initVolSliders(){
  const bgmEl=document.getElementById('bgmVol'); if(bgmEl) bgmEl.value=Math.round((gameData.settings.bgm||0.35)*100);
  const seEl=document.getElementById('seVol'); if(seEl) seEl.value=Math.round((gameData.settings.se||0.7)*100);
})();

/* ---- 起動時: 必ずタイトル画面(画面1)を表示。セーブ有無は問わない ---- */
screenState='title'; previousScreen='title';
syncScreenDom();
