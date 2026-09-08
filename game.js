const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

let W = 0, H = 0, dpr = 1;
let player;
let enemies = [];
let projectiles = [];
let effects = [];
let particles = [];
let texts = [];
let keys = {};
let mouse = { x: 0, y: 0, down: false };
let hp = 100, mana = 100, xp = 0, level = 1, score = 0, kills = 0, wave = 1;
let gameOver = false, paused = false;
let spawnTimer = 0.8, waveTimer = 0, shake = 0, bannerTimer = 2.8;
let boss = null;
let shieldTimer = 0;
let stormTimer = 0;
let last = performance.now();
let selectedSpell = 0;
let waveKillsTarget = 10;

const MAX_HP = 100;
const MAX_MANA = 100;
const XP_PER_LEVEL = 120;

const spells = [
  { name:'Fireball', key:'1', id:'fire', cost:10, cd:.22, desc:'Fast explosive projectile', color:'#ff8c32' },
  { name:'Arcane Nova', key:'2', id:'nova', cost:24, cd:1.1, desc:'Purple shockwave around you', color:'#b78cff' },
  { name:'Blink', key:'3', id:'blink', cost:18, cd:1.4, desc:'Teleport with afterimages', color:'#62e7ff' },
  { name:'Frost Bolt', key:'4', id:'frost', cost:12, cd:.55, desc:'Crystal projectile that freezes', color:'#79dfff' },
  { name:'Chain Lightning', key:'5', id:'chain', cost:26, cd:1.25, desc:'Jumps between enemies', color:'#eaff77' },
  { name:'Meteor', key:'6', id:'meteor', cost:34, cd:2.4, desc:'Delayed giant impact', color:'#ff6f34' },
  { name:'Arcane Ward', key:'7', id:'ward', cost:22, cd:7, desc:'Shield that blocks hits', color:'#d6b4ff' },
  { name:'Flame Wave', key:'8', id:'wave', cost:25, cd:1.8, desc:'Burning cone in front of you', color:'#ff5b2e' },
  { name:'Blizzard', key:'9', id:'blizzard', cost:30, cd:3.0, desc:'Snowstorm that slows everyone', color:'#b7efff' },
  { name:'Thunder Storm', key:'0', id:'storm', cost:40, cd:4.2, desc:'Repeated lightning strikes', color:'#fff45e' },
  { name:'Void Orb', key:'Q', id:'void', cost:26, cd:1.7, desc:'Gravity orb that pulls foes', color:'#b14cff' },
  { name:'Comet', key:'E', id:'comet', cost:38, cd:2.8, desc:'Piercing cosmic missile', color:'#ff63de' },
  { name:'Healing', key:'F', id:'heal', cost:30, cd:5, desc:'Restore health and cleanse slow', color:'#69ff92' },
  { name:'Tornado', key:'G', id:'tornado', cost:34, cd:3.4, desc:'Vortex that lifts enemies', color:'#dffcff' },
  { name:'Apocalypse', key:'H', id:'apoc', cost:80, cd:9, desc:'Massive screen-wide destruction', color:'#ff3bf1' }
];
const cooldowns = {};
for (const s of spells) cooldowns[s.id] = 0;

const enemyDefs = {
  Imp:{ color:'#d43f4b', glow:'#ff6b57', hp:48, speed:92, damage:7, radius:14, xp:18, score:30 },
  Ghoul:{ color:'#4e7f59', glow:'#9ce49e', hp:135, speed:39, damage:13, radius:23, xp:30, score:55 },
  Wraith:{ color:'#7058b7', glow:'#d8c7ff', hp:82, speed:76, damage:10, radius:17, xp:28, score:48 },
  Demon:{ color:'#8d2730', glow:'#ff845d', hp:205, speed:47, damage:19, radius:28, xp:52, score:90 },
  Dragon:{ color:'#2e6d3d', glow:'#9cff65', hp:430, speed:25, damage:26, radius:38, xp:100, score:180 }
};

function resize(){
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  W = innerWidth; H = innerHeight;
  canvas.width = W*dpr; canvas.height = H*dpr;
  canvas.style.width = W+'px'; canvas.style.height = H+'px';
  ctx.setTransform(dpr,0,0,dpr,0,0);
  if (!mouse.x) { mouse.x = W/2; mouse.y = H/2; }
}
addEventListener('resize', resize); resize();

function clamp(v,a,b){ return Math.max(a, Math.min(b,v)); }
function distance(a,b,c,d){ return Math.hypot(a-c,b-d); }
function addText(x,y,text,color='#fff',life=1.0){ texts.push({x,y,text,color,life,vy:-24}); }
function spark(x,y,count=10,color='#fff',power=120,life=.7){
  for(let i=0;i<count;i++){
    const a=Math.random()*Math.PI*2, s=20+Math.random()*power;
    particles.push({x,y,vx:Math.cos(a)*s,vy:Math.sin(a)*s,life:life*(.5+Math.random()*.7),max:life,size:2+Math.random()*4,color,kind:'dot'});
  }
}
function ring(x,y,r,color,life=.45,width=4){ effects.push({kind:'ring',x,y,r,start:r*.15,r,max:r,life,maxLife:life,color,width}); }
function flash(x,y,r,color,life=.2){ effects.push({kind:'flash',x,y,r,life,maxLife:life,color}); }
function line(x1,y1,x2,y2,color,life=.16,width=3){ effects.push({kind:'line',x1,y1,x2,y2,life,maxLife:life,color,width}); }
function afterimage(x,y,color){ effects.push({kind:'after',x,y,r:20,life:.55,maxLife:.55,color}); }

function reset(){
  hp=MAX_HP; mana=MAX_MANA; xp=0; level=1; score=0; kills=0; wave=1;
  gameOver=false; paused=false; spawnTimer=.8; waveTimer=0; shake=0; bannerTimer=2.8;
  boss=null; shieldTimer=0; stormTimer=0; selectedSpell=0; waveKillsTarget=10;
  enemies=[]; projectiles=[]; effects=[]; particles=[]; texts=[];
  for(const s of spells) cooldowns[s.id]=0;
  player={x:W/2,y:H/2,r:18,speed:230,facing:0,iframes:0};
  for(let i=0;i<6;i++) spawnEnemy(true);
  updateHud();
}

function chooseEnemyType(){
  const pool = wave<3 ? ['Imp','Ghoul','Wraith'] : wave<5 ? ['Imp','Ghoul','Wraith','Demon'] : ['Imp','Ghoul','Wraith','Demon','Dragon'];
  return pool[Math.floor(Math.random()*pool.length)];
}
function spawnEnemy(initial=false){
  const name=chooseEnemyType(); const d=enemyDefs[name]; const side=Math.floor(Math.random()*4); const pad=65;
  let x,y;
  if(side===0){x=-pad;y=Math.random()*H;} else if(side===1){x=W+pad;y=Math.random()*H;} else if(side===2){x=Math.random()*W;y=-pad;} else {x=Math.random()*W;y=H+pad;}
  const scale=1+(wave-1)*.12;
  enemies.push({name,x,y,radius:d.radius,hp:d.hp*scale,maxHp:d.hp*scale,speed:d.speed*(1+Math.min(.45,(wave-1)*.028)),damage:d.damage*(1+wave*.035),xp:d.xp,score:d.score,glow:d.glow,color:d.color,attack:initial?.2:Math.random(),hit:0,slow:1,wobble:Math.random()*6.28,phase:Math.random()*10,shoot:2+Math.random()*2,regen:0});
}
function spawnBoss(){
  if(boss) return;
  const dragon = wave%2===0;
  const maxHp=(dragon?3200:2600)+wave*300;
  const side=Math.floor(Math.random()*4); const p=100; let x,y;
  if(side===0){x=-p;y=H/2}else if(side===1){x=W+p;y=H/2}else if(side===2){x=W/2;y=-p}else{x=W/2;y=H+p;}
  boss={name:dragon?'Ancient Dragon':'Dread Lord',x,y,r:dragon?76:68,hp:maxHp,maxHp,speed:dragon?33:38,damage:dragon?30:24,hit:0,breath:2.5,orb:4,phase:0};
  addText(W/2,H*.22,'👑 '+boss.name.toUpperCase(),'#ffe067',2.5); bannerTimer=3.6; shake=.5;
}

function nearest(range=Infinity){
  return enemies.filter(e=>distance(player.x,player.y,e.x,e.y)<=range).sort((a,b)=>distance(player.x,player.y,a.x,a.y)-distance(player.x,player.y,b.x,b.y));
}
function damageEnemy(e,amount){ if(!e||e.hp<=0) return; e.hp-=amount; e.hit=.16; }
function damageBoss(amount){ if(!boss) return; boss.hp-=amount; boss.hit=.12; }
function killEnemy(e){
  kills++; score+=e.score; xp+=e.xp;
  spark(e.x,e.y,20,e.glow,170,.8); flash(e.x,e.y,e.radius*2.2,e.glow,.16);
  addText(e.x,e.y-e.radius-8,'+'+e.xp+' XP','#ffe998',.8);
}
function levelUp(){
  while(xp>=XP_PER_LEVEL){ xp-=XP_PER_LEVEL; level++; hp=MAX_HP; mana=MAX_MANA; bannerTimer=2.3; spark(player.x,player.y,60,'#ffe46d',250,1); addText(player.x,player.y-50,'LEVEL '+level,'#ffe46d',1.4); }
}
function ready(id,cost,cd){
  if(mana<cost || cooldowns[id]>0) return false;
  mana-=cost; cooldowns[id]=cd; return true;
}

function cast(id){
  if(gameOver||paused||!player) return;
  const s=spells.find(v=>v.id===id); if(!s||!ready(id,s.cost,s.cd)) return;
  const a=Math.atan2(mouse.y-player.y,mouse.x-player.x); player.facing=a;
  const tx=mouse.x, ty=mouse.y;
  if(id==='fire'){
    projectiles.push({kind:'fire',x:player.x+Math.cos(a)*28,y:player.y+Math.sin(a)*28,vx:Math.cos(a)*680,vy:Math.sin(a)*680,r:9,damage:36+level*4,life:1.4});
  } else if(id==='nova'){
    const r=155+level*4; let hit=0;
    for(const e of enemies){if(distance(player.x,player.y,e.x,e.y)<=r+e.radius){damageEnemy(e,62+level*5);hit++;}}
    ring(player.x,player.y,r,'#b78cff',.65,6); flash(player.x,player.y,r*.7,'#cfb6ff',.12); spark(player.x,player.y,75,'#b78cff',260,.8); shake=.18;
    addText(player.x,player.y-52,'ARCANE NOVA ×'+hit,'#dbc8ff');
  } else if(id==='blink'){
    const ox=player.x,oy=player.y; afterimage(ox,oy,'#61e7ff');
    player.x=clamp(player.x+Math.cos(a)*210,32,W-32); player.y=clamp(player.y+Math.sin(a)*210,32,H-32);
    afterimage(player.x,player.y,'#61e7ff'); ring(player.x,player.y,48,'#6befff',.35,3); spark(ox,oy,22,'#61e7ff',160,.5); spark(player.x,player.y,22,'#61e7ff',160,.5);
  } else if(id==='frost'){
    projectiles.push({kind:'frost',x:player.x+Math.cos(a)*28,y:player.y+Math.sin(a)*28,vx:Math.cos(a)*540,vy:Math.sin(a)*540,r:10,damage:34+level*3,life:2.3});
  } else if(id==='chain'){
    let targets=nearest(500).slice(0,4+Math.floor(level/5)); let sx=player.x, sy=player.y;
    for(const e of targets){damageEnemy(e,58+level*5);line(sx,sy,e.x,e.y,'#f5ff72',.24,4);spark(e.x,e.y,15,'#f5ff72',130,.35);sx=e.x;sy=e.y;}
    addText(player.x,player.y-48,'CHAIN '+targets.length,'#f5ff72'); shake=.12;
  } else if(id==='meteor'){
    const x=clamp(tx,70,W-70), y=clamp(ty,80,H-70);
    projectiles.push({kind:'meteor',x,y,timer:1.05,life:1.05,r:28,damage:120+level*12,impact:110});
    effects.push({kind:'target',x,y,r:100,life:1.05,maxLife:1.05,color:'#ff7a36'});
  } else if(id==='ward'){
    shieldTimer=5.0; ring(player.x,player.y,42,'#d8b7ff',.8,5); ring(player.x,player.y,54,'#8ee7ff',.8,2); spark(player.x,player.y,35,'#d8b7ff',180,.8);
  } else if(id==='wave'){
    const range=250, cone=.95; let hit=0;
    for(const e of enemies){
      const d=distance(player.x,player.y,e.x,e.y); const da=Math.atan2(e.y-player.y,e.x-player.x);
      let diff=Math.atan2(Math.sin(da-a),Math.cos(da-a));
      if(d<range && Math.abs(diff)<cone){ damageEnemy(e,92+level*7); e.burn=2.8; hit++; }
    }
    effects.push({kind:'cone',x:player.x,y:player.y,a,r:range,angle:cone,life:.42,maxLife:.42,color:'#ff6b2e'}); spark(player.x+Math.cos(a)*100,player.y+Math.sin(a)*100,70,'#ff6b2e',260,.55); shake=.17;
    addText(player.x,player.y-52,'FLAME WAVE ×'+hit,'#ff8c55');
  } else if(id==='blizzard'){
    effects.push({kind:'blizzard',x:tx,y:ty,r:190,life:3.2,maxLife:3.2,color:'#b7efff'});
    for(let i=0;i<70;i++){const ang=Math.random()*Math.PI*2, rr=Math.random()*180; particles.push({x:tx+Math.cos(ang)*rr,y:ty+Math.sin(ang)*rr,vx:(Math.random()-.5)*30,vy:20+Math.random()*50,life:1.5+Math.random()*1.7,max:3,size:2+Math.random()*4,color:'#d9f8ff',kind:'snow'});}
  } else if(id==='storm'){
    stormTimer=3.5; effects.push({kind:'stormfield',x:tx,y:ty,r:200,life:3.5,maxLife:3.5,color:'#ffe65b'});
  } else if(id==='void'){
    projectiles.push({kind:'void',x:player.x+Math.cos(a)*28,y:player.y+Math.sin(a)*28,vx:Math.cos(a)*320,vy:Math.sin(a)*320,r:18,damage:125+level*10,life:3.1,pull:90});
  } else if(id==='comet'){
    projectiles.push({kind:'comet',x:player.x+Math.cos(a)*40,y:player.y+Math.sin(a)*40,vx:Math.cos(a)*560,vy:Math.sin(a)*560,r:16,damage:170+level*13,life:1.8});
  } else if(id==='heal'){
    const gain=42+level*5; hp=Math.min(MAX_HP,hp+gain); for(const e of enemies) if(distance(player.x,player.y,e.x,e.y)<75) damageEnemy(e,45+level*2);
    ring(player.x,player.y,72,'#67ff96',.8,5); ring(player.x,player.y,35,'#c3ffd1',.6,2); spark(player.x,player.y,45,'#67ff96',170,1); addText(player.x,player.y-42,'HEALED +'+gain,'#8dffad');
  } else if(id==='tornado'){
    effects.push({kind:'tornado',x:tx,y:ty,r:95,life:2.6,maxLife:2.6,color:'#e9ffff'});
  } else if(id==='apoc'){
    for(const e of enemies) damageEnemy(e,350+level*20);
    damageBoss(750+level*50); effects.push({kind:'apoc',x:W/2,y:H/2,r:0,life:1.4,maxLife:1.4,color:'#ff47ef'}); spark(player.x,player.y,180,'#ff47ef',480,1.4); shake=.65;
    addText(W/2,H*.34,'APOCALYPSE','#ff7cf5',1.6);
  }
}

function autoCastSelected(){ cast(spells[selectedSpell].id); }

function hitPlayer(amount){
  if(player.iframes>0) return;
  if(shieldTimer>0){ addText(player.x,player.y-34,'BLOCKED','#e4ceff',.65); spark(player.x,player.y,8,'#e6ccff',110,.3); return; }
  hp-=amount; player.iframes=.25; shake=Math.max(shake,.14); spark(player.x,player.y,12,'#ff5555',100,.35); addText(player.x,player.y-30,'-'+Math.ceil(amount),'#ff7c7c');
  if(hp<=0){ hp=0; gameOver=true; }
}

function update(dt){
  if(gameOver||paused) return;
  for(const s of spells) cooldowns[s.id]=Math.max(0,cooldowns[s.id]-dt);
  shieldTimer=Math.max(0,shieldTimer-dt); bannerTimer=Math.max(0,bannerTimer-dt); shake=Math.max(0,shake-dt); player.iframes=Math.max(0,player.iframes-dt);
  mana=Math.min(MAX_MANA,mana+(10+level*.6)*dt);

  let dx=(keys.d||keys.arrowright?1:0)-(keys.a||keys.arrowleft?1:0);
  let dy=(keys.s||keys.arrowdown?1:0)-(keys.w||keys.arrowup?1:0);
  const len=Math.hypot(dx,dy)||1; const speed=player.speed*(keys.shift?1.55:1);
  player.x=clamp(player.x+dx/len*speed*dt,28,W-28); player.y=clamp(player.y+dy/len*speed*dt,28,H-28);
  player.facing=Math.atan2(mouse.y-player.y,mouse.x-player.x);
  if(mouse.down) cast('fire');

  // spawn and waves
  spawnTimer-=dt;
  const perWave=6+Math.floor(wave*1.8);
  if(!boss && spawnTimer<=0){
    const count=Math.min(2,1+Math.floor(wave/7));
    for(let i=0;i<count;i++) spawnEnemy();
    spawnTimer=Math.max(.2,1.2-wave*.03);
  }
  if(!boss && wave>=5 && wave%5===0 && enemies.length<=2){ spawnBoss(); }
  if(!boss && kills>=waveKillsTarget){ wave++; waveKillsTarget += 8+wave*2; bannerTimer=2.4; addText(W/2,H*.22,'WAVE '+wave,'#ffe391',1.4); spark(W/2,H/2,65,'#ffe391',240,1); }

  if(stormTimer>0){
    stormTimer-=dt;
    if(Math.random()<dt*5){
      const target=nearest(520)[0];
      if(target){ damageEnemy(target,78+level*7); line(target.x-20,target.y-220,target.x,target.y,'#fff36a',.22,5); spark(target.x,target.y,18,'#fff36a',170,.4); flash(target.x,target.y,40,'#fff36a',.1); }
    }
  }

  for(const p of projectiles){
    p.life-=dt;
    if(p.kind==='fire'||p.kind==='frost'||p.kind==='void'||p.kind==='comet'){
      p.x+=p.vx*dt; p.y+=p.vy*dt;
      if(p.kind==='fire'){particles.push({x:p.x,y:p.y,vx:-p.vx*.04,vy:-p.vy*.04,life:.22,max:.22,size:3+Math.random()*3,color:'#ff7d31',kind:'dot'});}
      if(p.kind==='frost'){particles.push({x:p.x,y:p.y,vx:0,vy:25,life:.3,max:.3,size:2+Math.random()*2,color:'#aef7ff',kind:'dot'});}
      if(p.kind==='void'){
        for(const e of enemies){ const d=distance(p.x,p.y,e.x,e.y); if(d<85){ const pull=(1-d/85)*p.pull; e.x+=(p.x-e.x)/Math.max(d,1)*pull*dt; e.y+=(p.y-e.y)/Math.max(d,1)*pull*dt; }}
      }
      if(p.kind==='comet'){particles.push({x:p.x,y:p.y,vx:-p.vx*.06,vy:-p.vy*.06,life:.3,max:.3,size:3+Math.random()*3,color:'#ff72df',kind:'dot'});}
      if(p.x<-80||p.x>W+80||p.y<-80||p.y>H+80) p.life=0;
      for(const e of enemies){ if(p.life>0 && distance(p.x,p.y,e.x,e.y)<p.r+e.radius){
        damageEnemy(e,p.damage);
        if(p.kind==='frost'){e.slow=.38; e.frozen=.65; ring(e.x,e.y,e.radius+7,'#baf7ff',.32,2);}
        if(p.kind==='fire'){flash(p.x,p.y,48,'#ff7b32',.12); ring(p.x,p.y,46,'#ff9d45',.22,3); for(const other of enemies) if(distance(p.x,p.y,other.x,other.y)<48) damageEnemy(other,p.damage*.45); p.life=0; spark(p.x,p.y,24,'#ff7b32',150,.45);}
        else if(p.kind==='void'){ring(p.x,p.y,55,'#b14cff',.3,3);spark(p.x,p.y,18,'#b14cff',120,.45);p.life=0;}
        else if(p.kind==='comet'){for(const other of enemies) if(distance(p.x,p.y,other.x,other.y)<72) damageEnemy(other,p.damage*.55); flash(p.x,p.y,70,'#ff62df',.16); spark(p.x,p.y,35,'#ff62df',190,.6); p.life=0;}
        else p.life=0;
        break;
      }}
    } else if(p.kind==='meteor'){
      p.timer-=dt;
      if(p.timer<=0 && !p.done){
        p.done=true; let hit=0;
        for(const e of enemies) if(distance(p.x,p.y,e.x,e.y)<p.impact+e.radius){damageEnemy(e,p.damage);hit++;}
        damageBossAt(p.x,p.y,p.damage,p.impact);
        flash(p.x,p.y,125,'#ff7d39',.2); ring(p.x,p.y,130,'#ff9a4b',.42,7); spark(p.x,p.y,100,'#ff6d32',300,.9); shake=.35;
        addText(p.x,p.y-50,'METEOR ×'+hit,'#ffbb73');
      }
    }
  }
  projectiles=projectiles.filter(p=>p.life>0);

  // blizzard, tornado and nearby damage
  for(const ef of effects){
    if(ef.kind==='blizzard'){
      for(const e of enemies) if(distance(ef.x,ef.y,e.x,e.y)<ef.r+e.radius){ damageEnemy(e,(16+level*.8)*dt); e.slow=.46; e.frozen=Math.max(e.frozen||0,.12); }
    }
    if(ef.kind==='tornado'){
      for(const e of enemies){ const d=distance(ef.x,ef.y,e.x,e.y); if(d<ef.r+e.radius){ const pull=80*(1-d/(ef.r+10)); e.x+=(ef.x-e.x)/Math.max(d,1)*pull*dt; e.y+=(ef.y-e.y)/Math.max(d,1)*pull*dt; e.hp-=(45+level*2)*dt; e.float=1; }}
    }
  }

  for(const e of enemies){
    e.hit=Math.max(0,e.hit-dt); e.attack-=dt; e.wobble+=dt*2; e.slow=Math.min(1,(e.slow||1)+dt*.5); e.frozen=Math.max(0,(e.frozen||0)-dt); e.burn=Math.max(0,(e.burn||0)-dt);
    if(e.burn>0) e.hp-=12*dt;
    if(e.name==='Ghoul' && e.hp<e.maxHp*.65) e.hp=Math.min(e.maxHp,e.hp+5*dt);
    const d=distance(player.x,player.y,e.x,e.y); const ang=Math.atan2(player.y-e.y,player.x-e.x);
    let move=e.speed*e.slow;
    if(e.name==='Wraith') move*=1.08+Math.sin(e.wobble*1.5)*.08;
    if(e.name==='Imp') { e.phase+=dt*4; }
    if(e.name==='Demon' && e.attack<=0 && d<470){
      e.attack=2.8; projectiles.push({kind:'enemyfire',x:e.x,y:e.y,vx:Math.cos(ang)*230,vy:Math.sin(ang)*230,r:7,damage:e.damage*.7,life:3});
    }
    if(e.name==='Dragon' && e.attack<=0 && d<500){ e.attack=3.4; for(let k=-1;k<=1;k++){const aa=ang+k*.22;projectiles.push({kind:'enemyfire',x:e.x,y:e.y,vx:Math.cos(aa)*260,vy:Math.sin(aa)*260,r:8,damage:e.damage*.8,life:3});} }
    if(d>e.radius+player.r+3 && e.frozen<=0){ e.x+=Math.cos(ang)*move*dt; e.y+=Math.sin(ang)*move*dt; }
    if(d<e.radius+player.r+5) hitPlayer(e.damage*dt*2.4);
  }

  // enemy projectiles
  for(const p of projectiles){ if(p.kind==='enemyfire'){ p.x+=p.vx*dt; p.y+=p.vy*dt; p.life-=dt; particles.push({x:p.x,y:p.y,vx:0,vy:0,life:.18,max:.18,size:3,color:'#ff7048',kind:'dot'}); if(distance(p.x,p.y,player.x,player.y)<p.r+player.r){hitPlayer(p.damage);p.life=0;} } }
  projectiles=projectiles.filter(p=>p.life>0);

  for(const e of enemies){ if(e.hp<=0){ killEnemy(e); } }
  enemies=enemies.filter(e=>e.hp>0);

  // boss behavior
  if(boss){
    boss.hit=Math.max(0,boss.hit-dt); boss.phase+=dt; boss.breath-=dt; boss.orb-=dt;
    const d=distance(player.x,player.y,boss.x,boss.y), ang=Math.atan2(player.y-boss.y,player.x-boss.x);
    if(d>180){boss.x+=Math.cos(ang)*boss.speed*dt;boss.y+=Math.sin(ang)*boss.speed*dt;}
    if(d<boss.r+player.r+12) hitPlayer(boss.damage*dt*2.2);
    if(boss.breath<=0){
      boss.breath=boss.name==='Ancient Dragon'?2.2:2.8;
      const count=boss.name==='Ancient Dragon'?7:5;
      for(let i=0;i<count;i++){const aa=ang+(i-(count-1)/2)*.11;projectiles.push({kind:'enemyfire',x:boss.x,y:boss.y,vx:Math.cos(aa)*290,vy:Math.sin(aa)*290,r:10,damage:boss.damage,life:3.2});}
      line(boss.x,boss.y,player.x,player.y,'#ff5e48',.28,8); shake=.16;
    }
    if(boss.orb<=0){ boss.orb=4.2; for(let i=0;i<4;i++){const aa=Math.PI*2*i/4+boss.phase;projectiles.push({kind:'enemyfire',x:boss.x,y:boss.y,vx:Math.cos(aa)*180,vy:Math.sin(aa)*180,r:9,damage:boss.damage*.75,life:5});} }
    if(boss.hp<=0){ score+=1500+wave*150; xp+=500; addText(W/2,H*.35,boss.name+' DEFEATED!','#ffe067',2); spark(boss.x,boss.y,160,'#ffe067',420,1.6); ring(boss.x,boss.y,170,'#ffe067',.8,8); boss=null; wave++; waveKillsTarget+=12; bannerTimer=3; }
  }

  levelUp();
  // ambient drops / rewards
  if(Math.random()<dt*.35){ const ang=Math.random()*Math.PI*2, rr=120+Math.random()*160; particles.push({x:player.x+Math.cos(ang)*rr,y:player.y+Math.sin(ang)*rr,vx:0,vy:-8,life:1.5,max:1.5,size:1+Math.random()*2,color:'#b7c9b9',kind:'dot'}); }
  updateParticles(dt); updateEffects(dt); updateTexts(dt); updateHud();
}

function damageBossAt(x,y,amount,r){ if(boss&&distance(x,y,boss.x,boss.y)<r+boss.r) boss.hp-=amount; }

function updateParticles(dt){
  for(const p of particles){p.x+=p.vx*dt;p.y+=p.vy*dt;p.vx*=.985;p.vy*=.985;p.life-=dt;if(p.kind==='snow')p.vy+=6*dt;}
  particles=particles.filter(p=>p.life>0);
}
function updateEffects(dt){ for(const e of effects){ e.life-=dt; if(e.kind==='ring') e.radius += (e.max-e.start)/Math.max(e.maxLife,0.01)*dt*1.7; if(e.kind==='apoc') e.r+=Math.max(W,H)*dt/.9; } effects=effects.filter(e=>e.life>0); }
function updateTexts(dt){ for(const t of texts){t.life-=dt;t.y+=t.vy*dt;t.vy*=.98;} texts=texts.filter(t=>t.life>0); }

function drawBackground(){
  const g=ctx.createRadialGradient(W*.5,H*.4,70,W*.5,H*.55,Math.max(W,H)*.8);
  g.addColorStop(0,'#1c3830'); g.addColorStop(.5,'#0d1c18'); g.addColorStop(1,'#040907'); ctx.fillStyle=g; ctx.fillRect(0,0,W,H);
  ctx.strokeStyle='rgba(165,209,180,.055)'; ctx.lineWidth=1;
  for(let x=0;x<W;x+=64){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,H);ctx.stroke();}
  for(let y=0;y<H;y+=64){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(W,y);ctx.stroke();}
}

function drawPlayer(){
  ctx.save(); ctx.translate(player.x,player.y); ctx.rotate(player.facing);
  ctx.fillStyle='rgba(0,0,0,.3)';ctx.beginPath();ctx.ellipse(0,23,26,8,0,0,Math.PI*2);ctx.fill();
  ctx.shadowBlur=22;ctx.shadowColor='#6d74ff';ctx.fillStyle='#394bc1';ctx.beginPath();ctx.arc(0,0,player.r,0,Math.PI*2);ctx.fill();ctx.shadowBlur=0;
  ctx.fillStyle='#d9b887';ctx.beginPath();ctx.arc(0,-10,10,0,Math.PI*2);ctx.fill();
  ctx.fillStyle='#171c59';ctx.beginPath();ctx.moveTo(-18,-12);ctx.lineTo(0,-40);ctx.lineTo(18,-12);ctx.closePath();ctx.fill();
  ctx.strokeStyle='#f2f0ff';ctx.lineWidth=4;ctx.beginPath();ctx.moveTo(11,0);ctx.lineTo(37,0);ctx.stroke();
  ctx.fillStyle='#8ceeff';ctx.beginPath();ctx.arc(12,0,4,0,Math.PI*2);ctx.fill();ctx.restore();
  if(shieldTimer>0){ctx.strokeStyle='#e2c8ff';ctx.lineWidth=3;ctx.shadowBlur=28;ctx.shadowColor='#b48cff';ctx.beginPath();ctx.arc(player.x,player.y,33+Math.sin(performance.now()/110)*2,0,Math.PI*2);ctx.stroke();ctx.shadowBlur=0;}
}

function drawEnemy(e){
  ctx.save(); ctx.translate(e.x,e.y); const bob=Math.sin(e.wobble+(e.name==='Wraith'?performance.now()/400:0))*2; ctx.translate(0,bob); if(e.name==='Wraith')ctx.globalAlpha=.62;
  if(e.hit>0)ctx.shadowBlur=28; else ctx.shadowBlur=14; ctx.shadowColor=e.glow;
  if(e.name==='Imp'){
    ctx.fillStyle=e.hit>0?'#fff':e.color; ctx.beginPath();ctx.arc(0,0,e.radius,0,Math.PI*2);ctx.fill();
    ctx.fillStyle=e.color;ctx.beginPath();ctx.moveTo(-8,-8);ctx.lineTo(-21,-28);ctx.lineTo(-3,-17);ctx.moveTo(8,-8);ctx.lineTo(21,-28);ctx.lineTo(3,-17);ctx.fill();
  } else if(e.name==='Ghoul'){
    ctx.fillStyle=e.hit>0?'#fff':e.color;ctx.beginPath();ctx.roundRect(-e.radius,-e.radius*.7,e.radius*2,e.radius*1.4,8);ctx.fill();
    ctx.fillStyle='#c9ffb3';ctx.fillRect(-10,-6,5,8);ctx.fillRect(5,-6,5,8);
  } else if(e.name==='Wraith'){
    ctx.fillStyle=e.hit>0?'#fff':e.color;ctx.beginPath();ctx.moveTo(0,-e.radius-8);ctx.quadraticCurveTo(e.radius,-4,e.radius,e.radius);ctx.lineTo(e.radius*.45,e.radius-7);ctx.lineTo(0,e.radius+4);ctx.lineTo(-e.radius*.45,e.radius-7);ctx.lineTo(-e.radius,e.radius);ctx.quadraticCurveTo(-e.radius,-4,0,-e.radius-8);ctx.fill();
  } else if(e.name==='Demon'){
    ctx.fillStyle=e.hit>0?'#fff':e.color;ctx.beginPath();ctx.arc(0,2,e.radius,0,Math.PI*2);ctx.fill();
    ctx.beginPath();ctx.moveTo(-12,-15);ctx.lineTo(-32,-38);ctx.lineTo(-17,-20);ctx.moveTo(12,-15);ctx.lineTo(32,-38);ctx.lineTo(17,-20);ctx.fill();
    ctx.fillStyle='#ffcf6b';ctx.fillRect(-11,-6,7,7);ctx.fillRect(4,-6,7,7);
  } else {
    ctx.fillStyle=e.hit>0?'#fff':e.color;ctx.beginPath();ctx.ellipse(0,0,38,28,0,0,Math.PI*2);ctx.fill();
    ctx.fillStyle=e.glow;ctx.beginPath();ctx.moveTo(-24,-6);ctx.lineTo(-55,-24);ctx.lineTo(-34,6);ctx.fill();ctx.beginPath();ctx.moveTo(24,-6);ctx.lineTo(55,-24);ctx.lineTo(34,6);ctx.fill();
    ctx.fillStyle='#fff0a5';ctx.beginPath();ctx.arc(-11,-7,5,0,Math.PI*2);ctx.arc(11,-7,5,0,Math.PI*2);ctx.fill();
  }
  ctx.restore();
  const bw=e.radius*2.4;ctx.fillStyle='rgba(0,0,0,.55)';ctx.fillRect(e.x-bw/2,e.y-e.radius-17,bw,5);ctx.fillStyle=e.glow;ctx.fillRect(e.x-bw/2,e.y-e.radius-17,bw*Math.max(0,e.hp/e.maxHp),5);
}

function drawBoss(){
  if(!boss)return; ctx.save();ctx.translate(boss.x,boss.y);ctx.rotate(Math.sin(boss.phase)*.05);ctx.shadowBlur=40;ctx.shadowColor=boss.name==='Ancient Dragon'?'#b4ff6a':'#ff5b85';
  if(boss.name==='Ancient Dragon'){
    ctx.fillStyle=boss.hit>0?'#fff':'#467d3b';ctx.beginPath();ctx.ellipse(0,0,78,52,0,0,Math.PI*2);ctx.fill();
    ctx.fillStyle='#2c5429';ctx.beginPath();ctx.moveTo(-40,-18);ctx.lineTo(-105,-60);ctx.lineTo(-55,-4);ctx.fill();ctx.beginPath();ctx.moveTo(40,-18);ctx.lineTo(105,-60);ctx.lineTo(55,-4);ctx.fill();
    ctx.fillStyle='#8fff65';ctx.beginPath();ctx.arc(-24,-10,8,0,Math.PI*2);ctx.arc(24,-10,8,0,Math.PI*2);ctx.fill();
  } else {
    ctx.fillStyle=boss.hit>0?'#fff':'#5f2458';ctx.beginPath();ctx.arc(0,0,boss.r,0,Math.PI*2);ctx.fill();
    ctx.fillStyle='#ff9bc8';ctx.beginPath();ctx.arc(-20,-8,9,0,Math.PI*2);ctx.arc(20,-8,9,0,Math.PI*2);ctx.fill();
    ctx.fillStyle='#8d3a6f';ctx.beginPath();ctx.moveTo(-28,-35);ctx.lineTo(-70,-78);ctx.lineTo(-24,-48);ctx.moveTo(28,-35);ctx.lineTo(70,-78);ctx.lineTo(24,-48);ctx.fill();
  }
  ctx.restore();
}

function drawProjectiles(){
  for(const p of projectiles){
    if(p.kind==='enemyfire'){
      ctx.fillStyle='#ff6949';ctx.shadowBlur=20;ctx.shadowColor='#ff6949';ctx.beginPath();ctx.arc(p.x,p.y,p.r,0,Math.PI*2);ctx.fill();ctx.shadowBlur=0;
      continue;
    }
    if(p.kind==='fire'){
      ctx.save();ctx.translate(p.x,p.y);ctx.rotate(Math.atan2(p.vy,p.vx));ctx.shadowBlur=30;ctx.shadowColor='#ff6c2e';
      ctx.fillStyle='#ff6c2e';ctx.beginPath();ctx.moveTo(15,0);ctx.quadraticCurveTo(-5,-11,-19,0);ctx.quadraticCurveTo(-5,11,15,0);ctx.fill();ctx.fillStyle='#ffe8a3';ctx.beginPath();ctx.arc(2,0,6,0,Math.PI*2);ctx.fill();ctx.restore();
    } else if(p.kind==='frost'){
      ctx.save();ctx.translate(p.x,p.y);ctx.rotate(Math.atan2(p.vy,p.vx));ctx.shadowBlur=24;ctx.shadowColor='#8fefff';ctx.fillStyle='#9ff3ff';ctx.beginPath();ctx.moveTo(15,0);ctx.lineTo(5,-10);ctx.lineTo(-13,-5);ctx.lineTo(-15,0);ctx.lineTo(-13,5);ctx.lineTo(5,10);ctx.closePath();ctx.fill();ctx.fillStyle='#eaffff';ctx.beginPath();ctx.moveTo(15,0);ctx.lineTo(0,-5);ctx.lineTo(-2,0);ctx.lineTo(0,5);ctx.closePath();ctx.fill();ctx.restore();
    } else if(p.kind==='void'){
      ctx.save();ctx.translate(p.x,p.y);ctx.rotate(performance.now()/300);ctx.shadowBlur=30;ctx.shadowColor='#9e45ff';ctx.fillStyle='#1b1029';ctx.beginPath();ctx.arc(0,0,p.r,0,Math.PI*2);ctx.fill();ctx.strokeStyle='#c06bff';ctx.lineWidth=3;for(let i=0;i<3;i++){ctx.beginPath();ctx.arc(0,0,p.r+5+i*3,.6+i,4.6+i);ctx.stroke();}ctx.restore();
    } else if(p.kind==='comet'){
      ctx.save();ctx.translate(p.x,p.y);ctx.rotate(Math.atan2(p.vy,p.vx));ctx.shadowBlur=30;ctx.shadowColor='#ff57de';ctx.fillStyle='#ff76df';ctx.beginPath();ctx.moveTo(23,0);ctx.quadraticCurveTo(-4,-13,-26,-5);ctx.lineTo(-18,0);ctx.lineTo(-26,5);ctx.quadraticCurveTo(-4,13,23,0);ctx.fill();ctx.fillStyle='#fff2ff';ctx.beginPath();ctx.arc(6,0,7,0,Math.PI*2);ctx.fill();ctx.restore();
    } else if(p.kind==='meteor'){
      const t=clamp(p.timer/1.05,0,1);ctx.save();ctx.fillStyle='#ff7b32';ctx.shadowBlur=35;ctx.shadowColor='#ff5d27';
      const yy=p.y-240*t;ctx.beginPath();ctx.arc(p.x,yy,18+18*(1-t),0,Math.PI*2);ctx.fill();ctx.fillStyle='#ffd37a';ctx.beginPath();ctx.arc(p.x,yy,9+7*(1-t),0,Math.PI*2);ctx.fill();ctx.restore();
    }
  }
}

function drawEffects(){
  for(const e of effects){
    const a=clamp(e.life/e.maxLife,0,1);
    if(e.kind==='ring'){ctx.globalAlpha=a;ctx.strokeStyle=e.color;ctx.lineWidth=e.width;ctx.shadowBlur=12;ctx.shadowColor=e.color;ctx.beginPath();ctx.arc(e.x,e.y,e.radius,0,Math.PI*2);ctx.stroke();ctx.shadowBlur=0;}
    else if(e.kind==='flash'){ctx.globalAlpha=a*.35;ctx.fillStyle=e.color;ctx.beginPath();ctx.arc(e.x,e.y,e.r*(1-a*.25),0,Math.PI*2);ctx.fill();}
    else if(e.kind==='line'){ctx.globalAlpha=a;ctx.strokeStyle=e.color;ctx.lineWidth=e.width;ctx.shadowBlur=18;ctx.shadowColor=e.color;ctx.beginPath();ctx.moveTo(e.x1,e.y1);ctx.lineTo((e.x1+e.x2)/2+(Math.random()-.5)*25,(e.y1+e.y2)/2+(Math.random()-.5)*25);ctx.lineTo(e.x2,e.y2);ctx.stroke();ctx.shadowBlur=0;}
    else if(e.kind==='after'){ctx.globalAlpha=a*.5;ctx.strokeStyle=e.color;ctx.lineWidth=4;ctx.beginPath();ctx.arc(e.x,e.y,e.r*(1-a*.2),0,Math.PI*2);ctx.stroke();ctx.globalAlpha=a*.15;ctx.fillStyle=e.color;ctx.beginPath();ctx.arc(e.x,e.y,e.r*(1-a),0,Math.PI*2);ctx.fill();}
    else if(e.kind==='cone'){
      ctx.globalAlpha=a*.85;ctx.fillStyle=e.color;ctx.shadowBlur=20;ctx.shadowColor=e.color;ctx.beginPath();ctx.moveTo(e.x,e.y);ctx.arc(e.x,e.y,e.r,e.a-e.angle,e.a+e.angle);ctx.closePath();ctx.fill();ctx.shadowBlur=0;
    }
    else if(e.kind==='target'){
      ctx.globalAlpha=a;ctx.strokeStyle=e.color;ctx.setLineDash([8,8]);ctx.lineWidth=3;ctx.beginPath();ctx.arc(e.x,e.y,e.r,0,Math.PI*2);ctx.stroke();ctx.setLineDash([]);
    }
    else if(e.kind==='blizzard'){
      ctx.globalAlpha=a*.32;ctx.fillStyle=e.color;ctx.beginPath();ctx.arc(e.x,e.y,e.r,0,Math.PI*2);ctx.fill();ctx.globalAlpha=a*.8;ctx.strokeStyle=e.color;ctx.lineWidth=2;ctx.beginPath();ctx.arc(e.x,e.y,e.r*(.7+.1*Math.sin(performance.now()/160)),0,Math.PI*2);ctx.stroke();
    }
    else if(e.kind==='stormfield'){
      ctx.globalAlpha=a*.22;ctx.fillStyle=e.color;ctx.beginPath();ctx.arc(e.x,e.y,e.r,0,Math.PI*2);ctx.fill();ctx.globalAlpha=a*.7;ctx.strokeStyle=e.color;ctx.lineWidth=3;ctx.setLineDash([4,10]);ctx.beginPath();ctx.arc(e.x,e.y,e.r,0,Math.PI*2);ctx.stroke();ctx.setLineDash([]);
    }
    else if(e.kind==='tornado'){
      ctx.globalAlpha=a*.8;ctx.strokeStyle=e.color;ctx.lineWidth=4;ctx.shadowBlur=16;ctx.shadowColor=e.color;for(let i=0;i<5;i++){const rr=e.r*(.25+i*.14);ctx.beginPath();ctx.arc(e.x,e.y,rr,performance.now()/500+i,performance.now()/500+i+Math.PI*1.45);ctx.stroke();}ctx.shadowBlur=0;
    }
    else if(e.kind==='apoc'){
      ctx.globalAlpha=a*.45;ctx.strokeStyle=e.color;ctx.lineWidth=10;ctx.shadowBlur=35;ctx.shadowColor=e.color;ctx.beginPath();ctx.arc(e.x,e.y,e.r,0,Math.PI*2);ctx.stroke();ctx.lineWidth=2;ctx.beginPath();ctx.arc(e.x,e.y,e.r*.62,0,Math.PI*2);ctx.stroke();ctx.shadowBlur=0;
    }
    ctx.globalAlpha=1;
  }
}

function drawParticles(){
  for(const p of particles){ctx.globalAlpha=clamp(p.life/(p.max||1),0,1);ctx.fillStyle=p.color;ctx.beginPath();ctx.arc(p.x,p.y,p.size,0,Math.PI*2);ctx.fill();}ctx.globalAlpha=1;
}

function updateHud(){
  const vals={hp:Math.ceil(hp),mana:Math.floor(mana),level,kills,enemies:enemies.length+(boss?1:0),score,xp};
  for(const [id,v] of Object.entries(vals)){const el=document.getElementById(id);if(el)el.textContent=v;}
  const pct=(id,v)=>{const el=document.getElementById(id);if(el)el.style.width=clamp(v,0,100)+'%';};
  pct('hpbar',hp/MAX_HP*100);pct('manabar',mana/MAX_MANA*100);pct('xpbar',xp/XP_PER_LEVEL*100);pct('bossbar',boss?boss.hp/boss.maxHp*100:0);
  const sel=document.getElementById('selectedSpell'); if(sel)sel.textContent=(selectedSpell+1)+': '+spells[selectedSpell].name;
  const bname=document.querySelector('.boss-name'); if(bname)bname.textContent=boss?'👑 '+boss.name:'👑 BOSS';
}

function draw(){
  ctx.clearRect(0,0,W,H);ctx.save(); if(shake>0)ctx.translate((Math.random()-.5)*12*shake*8,(Math.random()-.5)*12*shake*8);
  drawBackground();drawEffects();drawParticles();for(const e of enemies)drawEnemy(e);drawBoss();drawProjectiles();drawPlayer();
  ctx.restore();
  for(const t of texts){ctx.globalAlpha=clamp(t.life,0,1);ctx.fillStyle=t.color;ctx.font='bold 16px Georgia,serif';ctx.textAlign='center';ctx.fillText(t.text,t.x,t.y);}ctx.globalAlpha=1;
  const banner=document.getElementById('banner');
  if(banner){banner.classList.toggle('show',bannerTimer>0);banner.innerHTML=`<div class="banner-title">${boss?'👑 '+boss.name.toUpperCase():`WAVE ${wave}`}</div><div class="banner-sub">${boss?'Defeat the boss!':'Survive the night and master all 15 spells.'}</div>`;}
  const overlay=document.getElementById('overlay');
  if(overlay){overlay.classList.toggle('show',gameOver||paused);if(gameOver){document.getElementById('overlayTitle').textContent='YOU HAVE FALLEN';document.getElementById('overlayText').innerHTML=`${score} score • ${kills} defeated • Level ${level} • Wave ${wave}`;document.getElementById('restartHint').textContent='Press R to rise again';} else if(paused){document.getElementById('overlayTitle').textContent='PAUSED';document.getElementById('overlayText').textContent='The realm waits for your return.';document.getElementById('restartHint').textContent='Press P to continue';}}
}

const keyToIndex = { '1':0,'2':1,'3':2,'4':3,'5':4,'6':5,'7':6,'8':7,'9':8,'0':9,'q':10,'e':11,'f':12,'g':13,'h':14 };
addEventListener('keydown',e=>{
  const k=e.key.toLowerCase(); keys[k]=true;
  if(['arrowup','arrowdown','arrowleft','arrowright',' '].includes(k)) e.preventDefault();
  if(gameOver&&k==='r')reset();
  if(!gameOver&&k==='p'){paused=!paused;return;}
  if(!gameOver && keyToIndex[k]!==undefined){selectedSpell=keyToIndex[k]; cast(spells[selectedSpell].id);}
});
addEventListener('keyup',e=>keys[e.key.toLowerCase()]=false);
addEventListener('mousemove',e=>{mouse.x=e.clientX;mouse.y=e.clientY;});
addEventListener('mousedown',e=>{if(e.button===0){mouse.down=true;cast(spells[selectedSpell].id);}});
addEventListener('mouseup',e=>{if(e.button===0)mouse.down=false;});
addEventListener('blur',()=>{keys={};mouse.down=false;});

reset();
function loop(t){const dt=Math.min(.033,(t-last)/1000);last=t;update(dt);draw();requestAnimationFrame(loop);}requestAnimationFrame(loop);
