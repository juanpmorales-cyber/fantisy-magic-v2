const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

let W, H, dpr, player;
let enemies = [], projectiles = [], particles = [], floatingTexts = [];
let keys = {}, mouse = {x: 0, y: 0, down: false};
let hp = 100, mana = 100, xp = 0, level = 1, score = 0, kills = 0, wave = 1;
let gameOver = false, paused = false, spawnTimer = 1, waveTimer = 0;
let shake = 0, bannerTimer = 2.5, last = performance.now(), boss = null;
let selectedSpell = 0;

const MAX_HP = 100, MAX_MANA = 100, XP_PER_LEVEL = 100;

const spells = [
  ["Fireball","fire",12,.15],["Arcane Nova","nova",35,.35],["Blink","blink",25,.45],
  ["Frost Bolt","frost",18,.38],["Chain Lightning","lightning",30,1.1],["Meteor","meteor",45,1.5],
  ["Arcane Ward","ward",28,8],["Flame Wave","flamewave",32,1.2],["Blizzard","blizzard",42,2],
  ["Thunder Storm","storm",55,2.4],["Void Orb","void",38,1.4],["Comet","comet",50,1.7],
  ["Healing","heal",30,3],["Tornado","tornado",48,2],["Apocalypse","apocalypse",85,8]
];
let cooldowns = Object.fromEntries(spells.map(s => [s[1],0]));
let shieldTimer = 0;

const monsterTypes = [
  {name:"Imp",color:"#8d3138",glow:"#ff5a5f",hp:60,speed:54,damage:8,radius:19,xp:22},
  {name:"Ghoul",color:"#46634e",glow:"#9dd7a7",hp:95,speed:38,damage:12,radius:23,xp:32},
  {name:"Wraith",color:"#51438b",glow:"#ae9cff",hp:72,speed:72,damage:10,radius:18,xp:30},
  {name:"Demon",color:"#6e2020",glow:"#ff6a42",hp:150,speed:34,damage:18,radius:29,xp:55},
  {name:"Dragon",color:"#3f6330",glow:"#b9ff65",hp:240,speed:28,damage:24,radius:36,xp:90}
];

function resize(){
  dpr=Math.min(devicePixelRatio||1,2); W=innerWidth; H=innerHeight;
  canvas.width=W*dpr; canvas.height=H*dpr; canvas.style.width=W+"px"; canvas.style.height=H+"px";
  ctx.setTransform(dpr,0,0,dpr,0,0);
  if(!mouse.x){mouse.x=W/2;mouse.y=H/2}
}
addEventListener("resize",resize); resize();

addEventListener("keydown",e=>{
  const k=e.key.toLowerCase(); keys[k]=true;
  if(["arrowup","arrowdown","arrowleft","arrowright"," "].includes(k)) e.preventDefault();
  if(gameOver&&k==="r") reset();
  if(!gameOver&&k==="p") paused=!paused;
  if(!gameOver&&k>="1"&&k<="9") selectedSpell=+k-1;
  if(!gameOver&&k==="0") selectedSpell=9;
  if(!gameOver&&k==="q") selectedSpell=10;
  if(!gameOver&&k==="e") selectedSpell=11;
  if(!gameOver&&k==="f") selectedSpell=12;
  if(!gameOver&&k==="g") selectedSpell=13;
  if(!gameOver&&k==="h") selectedSpell=14;
});
addEventListener("keyup",e=>keys[e.key.toLowerCase()]=false);
addEventListener("mousemove",e=>{mouse.x=e.clientX;mouse.y=e.clientY});
addEventListener("mousedown",e=>{if(e.button===0){mouse.down=true;cast("fire")}});
addEventListener("mouseup",e=>{if(e.button===0)mouse.down=false});
addEventListener("blur",()=>{mouse.down=false;keys={}});

function clamp(v,a,b){return Math.max(a,Math.min(b,v))}
function dist(a,b,c,d){return Math.hypot(a-c,b-d)}
function addFloat(x,y,text,color="#fff"){floatingTexts.push({x,y,text,color,life:1})}
function burst(x,y,count=14,color="#ffbe48",power=130){
  for(let i=0;i<count;i++){let a=Math.random()*Math.PI*2,s=30+Math.random()*power;
    particles.push({x,y,vx:Math.cos(a)*s,vy:Math.sin(a)*s,life:.45+Math.random()*.55,size:2+Math.random()*4,color})}
}
function ring(x,y,max,color="#b58cff"){particles.push({type:"ring",x,y,radius:8,max,life:.55,color})}
function bolt(x1,y1,x2,y2,color="#d9f3ff"){particles.push({type:"bolt",x1,y1,x2,y2,life:.22,color})}

function reset(){
  hp=MAX_HP;mana=MAX_MANA;xp=0;level=1;score=0;kills=0;wave=1;
  gameOver=false;paused=false;spawnTimer=1;waveTimer=0;shake=0;bannerTimer=2.5;boss=null;shieldTimer=0;
  cooldowns=Object.fromEntries(spells.map(s=>[s[1],0]));
  enemies=[];projectiles=[];particles=[];floatingTexts=[];
  player={x:W/2,y:H/2,r:18,speed:220,facing:0};
  for(let i=0;i<5;i++)spawnEnemy(true); updateHud();
}

function spawnEnemy(initial=false){
  let type=monsterTypes[Math.floor(Math.random()*monsterTypes.length)];
  if(wave<3) type=monsterTypes[Math.floor(Math.random()*3)];
  let side=Math.floor(Math.random()*4),pad=50,x,y;
  if(side===0){x=-pad;y=Math.random()*H}else if(side===1){x=W+pad;y=Math.random()*H}
  else if(side===2){x=Math.random()*W;y=-pad}else{x=Math.random()*W;y=H+pad}
  let scale=1+(wave-1)*.1;
  enemies.push({...type,x,y,hp:Math.round(type.hp*scale),maxHp:Math.round(type.hp*scale),
    speed:type.speed*(1+Math.min(.3,(wave-1)*.025)),attack:initial?.7:Math.random(),hit:0,slow:1,wobble:Math.random()*6.28});
}

function spawnBoss(){
  if(boss)return;
  let side=Math.floor(Math.random()*4),x,y,p=80;
  if(side===0){x=-p;y=H/2}else if(side===1){x=W+p;y=H/2}else if(side===2){x=W/2;y=-p}else{x=W/2;y=H+p}
  const maxHp=900+wave*180;
  boss={x,y,r:58,hp:maxHp,maxHp,name:wave%2?"Dread Lord":"Ancient Dragon",speed:26,attack:2,spell:3,hit:0};
  addFloat(W/2,H*.25,"👑 BOSS INCOMING!","#ffcf5c"); bannerTimer=3; shake=.3;
}

function ready(type,cost,cd){
  if(mana<cost||cooldowns[type]>0)return false;
  mana-=cost;cooldowns[type]=cd;return true;
}

function nearestEnemies(range=99999){
  return enemies.filter(e=>dist(player.x,player.y,e.x,e.y)<=range).sort((a,b)=>dist(player.x,player.y,a.x,a.y)-dist(player.x,player.y,b.x,b.y));
}

function cast(type){
  if(gameOver||paused||!player)return;
  const s=spells.find(x=>x[1]===type); if(!s||!ready(type,s[2],s[3]))return;
  const a=Math.atan2(mouse.y-player.y,mouse.x-player.x); player.facing=a;

  if(type==="fire") projectiles.push({kind:"fire",x:player.x+Math.cos(a)*28,y:player.y+Math.sin(a)*28,vx:Math.cos(a)*610,vy:Math.sin(a)*610,r:8,damage:34+level*3,life:1.8});
  if(type==="nova"){let r=140+level*4,h=0;for(const e of enemies)if(dist(player.x,player.y,e.x,e.y)<r+e.radius){e.hp-=52+level*5;e.hit=.2;h++}burst(player.x,player.y,56,"#b58cff",230);ring(player.x,player.y,r);addFloat(player.x,player.y-40,`ARCANE NOVA ×${h}`,"#d8c4ff");shake=.18}
  if(type==="blink"){let ox=player.x,oy=player.y;player.x=clamp(player.x+Math.cos(a)*170,30,W-30);player.y=clamp(player.y+Math.sin(a)*170,30,H-30);burst(ox,oy,25,"#7de7ff",140);burst(player.x,player.y,25,"#7de7ff",140)}
  if(type==="frost") projectiles.push({kind:"frost",x:player.x+Math.cos(a)*28,y:player.y+Math.sin(a)*28,vx:Math.cos(a)*500,vy:Math.sin(a)*500,r:9,damage:28+level*2,life:2.1});
  if(type==="lightning"){let ts=nearestEnemies(380).slice(0,3+Math.floor(level/4));for(const e of ts){e.hp-=42+level*4;e.hit=.25;bolt(player.x,player.y,e.x,e.y);burst(e.x,e.y,12,"#c3f0ff",120)}addFloat(player.x,player.y-40,`CHAIN LIGHTNING ×${ts.length}`,"#d9f3ff");shake=.1}
  if(type==="meteor"){let x=clamp(mouse.x,50,W-50),y=clamp(mouse.y,50,H-50);projectiles.push({kind:"meteor",x,y,timer:.7,life:.7,r:18,damage:95+level*8});ring(x,y,95,"#ff9e4a")}
  if(type==="ward"){shieldTimer=4;burst(player.x,player.y,35,"#e8c8ff",180);ring(player.x,player.y,60,"#d7b6ff")}
  if(type==="flamewave"){let r=190;for(const e of enemies)if(dist(player.x,player.y,e.x,e.y)<r+e.radius){e.hp-=70+level*5;e.hit=.2}burst(player.x,player.y,90,"#ff6b2d",260);ring(player.x,player.y,r,"#ff6b2d");shake=.2}
  if(type==="blizzard"){for(const e of enemies)if(dist(player.x,player.y,e.x,e.y)<260){e.hp-=55+level*3;e.slow=.2}burst(player.x,player.y,80,"#8eeaff",220);ring(player.x,player.y,260,"#8eeaff")}
  if(type==="storm"){for(let i=0;i<7;i++){setTimeout(()=>{if(gameOver)return;let ts=nearestEnemies(450);if(ts[0]){ts[0].hp-=70+level*5;bolt(player.x,player.y,ts[0].x,ts[0].y,"#fff36b");burst(ts[0].x,ts[0].y,16,"#fff36b",140)}},i*180)}}
  if(type==="void"){projectiles.push({kind:"void",x:player.x+Math.cos(a)*35,y:player.y+Math.sin(a)*35,vx:Math.cos(a)*300,vy:Math.sin(a)*300,r:16,damage:110+level*7,life:3})}
  if(type==="comet"){projectiles.push({kind:"comet",x:clamp(mouse.x,60,W-60),y:clamp(mouse.y,60,H-60),timer:.9,life:.9,r:20,damage:150+level*10});ring(mouse.x,mouse.y,120,"#ff75d1")}
  if(type==="heal"){hp=Math.min(MAX_HP,hp+45+level*4);burst(player.x,player.y,35,"#75ff9b",160);addFloat(player.x,player.y-35,"HEALED","#8cffae")}
  if(type==="tornado"){for(const e of enemies)if(dist(player.x,player.y,e.x,e.y)<250){e.hp-=85+level*6;e.x+=(e.x-player.x)*.18;e.y+=(e.y-player.y)*.18}burst(player.x,player.y,70,"#d8f7ff",230);ring(player.x,player.y,250,"#d8f7ff")}
  if(type==="apocalypse"){for(const e of enemies)e.hp-=260+level*15;if(boss)boss.hp-=450+level*25;burst(player.x,player.y,180,"#ff3df2",420);ring(player.x,player.y,Math.max(W,H),"#ff3df2");shake=.45}
}

function damagePlayer(amount){
  if(shieldTimer>0){addFloat(player.x,player.y-28,"BLOCKED","#ecd7ff");return}
  hp-=amount;shake=Math.max(shake,.12);burst(player.x,player.y,10,"#ff6868",90);addFloat(player.x,player.y-28,`-${amount}`,"#ff8a8a");
}

function levelUp(){
  level++;hp=MAX_HP;mana=MAX_MANA;wave=1+Math.floor((level-1)/2);bannerTimer=2.5;
  addFloat(player.x,player.y-48,`LEVEL ${level}!`,"#ffe28a");burst(player.x,player.y,45,"#ffe28a",220);
}

function update(dt){
  if(gameOver||paused)return;
  for(const k of Object.keys(cooldowns))cooldowns[k]=Math.max(0,cooldowns[k]-dt);
  shieldTimer=Math.max(0,shieldTimer-dt);bannerTimer=Math.max(0,bannerTimer-dt);shake=Math.max(0,shake-dt);
  mana=Math.min(MAX_MANA,mana+(9+level*.45)*dt);
  let dx=(keys.d||keys.arrowright?1:0)-(keys.a||keys.arrowleft?1:0),dy=(keys.s||keys.arrowdown?1:0)-(keys.w||keys.arrowup?1:0),len=Math.hypot(dx,dy)||1;
  let speed=player.speed*(keys.shift?1.45:1);player.x=clamp(player.x+dx/len*speed*dt,28,W-28);player.y=clamp(player.y+dy/len*speed*dt,28,H-28);
  player.facing=Math.atan2(mouse.y-player.y,mouse.x-player.x);
  if(mouse.down)cast("fire");

  for(const p of projectiles){
    if(p.kind==="meteor"||p.kind==="comet"){
      p.life-=dt;p.timer-=dt;
      if(p.timer<=0&&!p.exploded){p.exploded=true;let r=p.kind==="meteor"?95:125;for(const e of enemies)if(dist(p.x,p.y,e.x,e.y)<r+e.radius)e.hp-=p.damage; if(boss&&dist(p.x,p.y,boss.x,boss.y)<r+boss.r)boss.hp-=p.damage;burst(p.x,p.y,90,p.kind==="meteor"?"#ff9d45":"#ff75d1",280);ring(p.x,p.y,r,p.kind==="meteor"?"#ff9e4a":"#ff75d1");shake=.25}
    }else{p.x+=p.vx*dt;p.y+=p.vy*dt;p.life-=dt}
  }

  for(const e of enemies){
    e.attack-=dt;e.hit=Math.max(0,e.hit-dt);e.wobble+=dt*4;
    let a=Math.atan2(player.y-e.y,player.x-e.x),d=dist(player.x,player.y,e.x,e.y);
    if(d>player.r+e.radius+5){let sway=Math.sin(e.wobble)*7;e.x+=(Math.cos(a)*e.speed*e.slow+Math.cos(a+Math.PI/2)*sway)*dt;e.y+=(Math.sin(a)*e.speed*e.slow+Math.sin(a+Math.PI/2)*sway)*dt}
    if(d<player.r+e.radius+4&&e.attack<=0){damagePlayer(e.damage);e.attack=1.05}
    e.slow+=(1-e.slow)*Math.min(1,dt*5);
  }

  if(boss){
    boss.attack-=dt;boss.spell-=dt;boss.hit=Math.max(0,boss.hit-dt);
    let a=Math.atan2(player.y-boss.y,player.x-boss.x),d=dist(player.x,player.y,boss.x,boss.y);
    if(d>player.r+boss.r+12){boss.x+=Math.cos(a)*boss.speed*dt;boss.y+=Math.sin(a)*boss.speed*dt}
    if(d<player.r+boss.r+8&&boss.attack<=0){damagePlayer(28+wave*2);boss.attack=1}
    if(boss.spell<=0){boss.spell=3;for(let i=0;i<6;i++){let aa=Math.random()*6.28;projectiles.push({kind:"orb",x:boss.x,y:boss.y,vx:Math.cos(aa)*170,vy:Math.sin(aa)*170,r:9,damage:15+wave,life:3})}}
  }

  for(const f of projectiles){
    if(f.life<=0)continue;
    if(f.kind==="orb"){if(dist(f.x,f.y,player.x,player.y)<f.r+player.r){damagePlayer(f.damage);f.life=0}continue}
    for(const e of enemies)if(e.hp>0&&dist(f.x,f.y,e.x,e.y)<f.r+e.radius){e.hp-=f.damage;e.hit=.12;if(f.kind==="frost")e.slow=.25;f.life=0;burst(f.x,f.y,18,f.kind==="frost"?"#a7edff":e.glow,135);break}
    if(boss&&f.life>0&&dist(f.x,f.y,boss.x,boss.y)<f.r+boss.r){boss.hp-=f.damage;boss.hit=.12;f.life=0;burst(f.x,f.y,22,"#ffcf5c",160)}
  }

  const dead=enemies.filter(e=>e.hp<=0);
  for(const e of dead){xp+=e.xp;score+=e.xp*10;kills++;burst(e.x,e.y,26,e.glow,170);addFloat(e.x,e.y-34,`+${e.xp} XP`,"#b8ffb0")}
  enemies=enemies.filter(e=>e.hp>0);
  if(boss&&boss.hp<=0){score+=1000+wave*250;xp+=250;kills++;burst(boss.x,boss.y,180,"#ffe26b",420);addFloat(boss.x,boss.y-80,"👑 BOSS DEFEATED!","#ffe26b");boss=null;wave++;bannerTimer=3}
  while(xp>=XP_PER_LEVEL){xp-=XP_PER_LEVEL;levelUp()}

  spawnTimer-=dt;
  const maxEnemies=Math.min(24,7+wave*2);
  if(spawnTimer<=0&&enemies.length<maxEnemies){spawnEnemy();spawnTimer=Math.max(.55,2.1-wave*.07)}
  waveTimer+=dt;
  if(!boss&&wave>=3&&wave%5===0&&enemies.length<=2){spawnBoss()}

  projectiles=projectiles.filter(p=>p.life>0&&(p.kind==="meteor"||p.kind==="comet"||p.kind==="orb"||(p.x>-100&&p.x<W+100&&p.y>-100&&p.y<H+100)));
  for(const p of particles){if(p.type==="bolt"||p.type==="ring"){p.life-=dt;if(p.type==="ring")p.radius+=(p.max/.55)*dt}else{p.x+=p.vx*dt;p.y+=p.vy*dt;p.life-=dt;p.vx*=.975;p.vy*=.975}}
  particles=particles.filter(p=>p.life>0);
  for(const t of floatingTexts){t.y-=25*dt;t.life-=dt}floatingTexts=floatingTexts.filter(t=>t.life>0);
  if(hp<=0){hp=0;gameOver=true;burst(player.x,player.y,70,"#ff5a5a",240)}
  updateHud();
}

function updateHud(){
  const ids={hp:Math.ceil(hp),mana:Math.floor(mana),level,kills,enemies:enemies.length,score};
  for(const [id,v] of Object.entries(ids)){const el=document.getElementById(id);if(el)el.textContent=v}
  const xpEl=document.getElementById("xp");if(xpEl)xpEl.textContent=xp;
  const set=(id,v)=>{const el=document.getElementById(id);if(el)el.style.width=v+"%"};set("hpbar",hp/MAX_HP*100);set("manabar",mana/MAX_MANA*100);set("xpbar",xp/XP_PER_LEVEL*100);
  const s=document.getElementById("selectedSpell");if(s)s.textContent=`${selectedSpell+1}: ${spells[selectedSpell][0]}`;
  const b=document.getElementById("bossbar");if(b)b.style.width=boss?Math.max(0,boss.hp/boss.maxHp*100)+"%":"0%";
}

function drawBackground(){
  let g=ctx.createRadialGradient(W*.5,H*.35,60,W*.5,H*.55,Math.max(W,H)*.75);g.addColorStop(0,"#213b35");g.addColorStop(.5,"#101e1a");g.addColorStop(1,"#050a09");ctx.fillStyle=g;ctx.fillRect(0,0,W,H);
  ctx.strokeStyle="rgba(157,196,166,.08)";for(let x=0;x<W;x+=64){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,H);ctx.stroke()}for(let y=0;y<H;y+=64){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(W,y);ctx.stroke()}
}
function drawEnemy(e){
  ctx.save();ctx.translate(e.x,e.y);ctx.rotate(Math.sin(e.wobble)*.04);ctx.shadowBlur=e.hit>0?28:12;ctx.shadowColor=e.glow;ctx.fillStyle=e.hit>0?"#fff":e.color;
  ctx.beginPath();ctx.arc(0,0,e.radius,0,Math.PI*2);ctx.fill();
  if(e.name==="Imp"){ctx.beginPath();ctx.moveTo(-10,-12);ctx.lineTo(-22,-28);ctx.lineTo(-2,-17);ctx.fill();ctx.beginPath();ctx.moveTo(10,-12);ctx.lineTo(22,-28);ctx.lineTo(2,-17);ctx.fill()}
  if(e.name==="Dragon"){ctx.fillStyle="#d4f58b";ctx.beginPath();ctx.moveTo(-18,-15);ctx.lineTo(-38,-28);ctx.lineTo(-22,-3);ctx.fill();ctx.beginPath();ctx.moveTo(18,-15);ctx.lineTo(38,-28);ctx.lineTo(22,-3);ctx.fill()}
  ctx.fillStyle="#ffe5b0";ctx.beginPath();ctx.arc(-7,-4,3,0,6.28);ctx.arc(7,-4,3,0,6.28);ctx.fill();ctx.restore();
  let bw=e.radius*2.3;ctx.fillStyle="rgba(0,0,0,.55)";ctx.fillRect(e.x-bw/2,e.y-e.radius-15,bw,5);ctx.fillStyle=e.glow;ctx.fillRect(e.x-bw/2,e.y-e.radius-15,bw*Math.max(0,e.hp/e.maxHp),5);
}
function drawBoss(){
  if(!boss)return;ctx.save();ctx.translate(boss.x,boss.y);ctx.shadowBlur=35;ctx.shadowColor="#ffcf5c";ctx.fillStyle=boss.hit>0?"#fff":"#5b214f";ctx.beginPath();ctx.arc(0,0,boss.r,0,6.28);ctx.fill();ctx.fillStyle="#ffe08a";ctx.beginPath();ctx.arc(-17,-8,7,0,6.28);ctx.arc(17,-8,7,0,6.28);ctx.fill();ctx.fillStyle="#f3a44d";ctx.beginPath();ctx.moveTo(-25,-35);ctx.lineTo(-55,-68);ctx.lineTo(-18,-43);ctx.fill();ctx.beginPath();ctx.moveTo(25,-35);ctx.lineTo(55,-68);ctx.lineTo(18,-43);ctx.fill();ctx.restore();
}
function drawPlayer(){
  ctx.save();ctx.translate(player.x,player.y);ctx.rotate(player.facing);ctx.fillStyle="rgba(0,0,0,.35)";ctx.beginPath();ctx.ellipse(0,21,24,8,0,0,6.28);ctx.fill();
  ctx.shadowBlur=22;ctx.shadowColor="#7a6cff";ctx.fillStyle="#3b4bb6";ctx.beginPath();ctx.arc(0,0,player.r,0,6.28);ctx.fill();ctx.shadowBlur=0;
  ctx.fillStyle="#d2b17a";ctx.beginPath();ctx.arc(0,-9,10,0,6.28);ctx.fill();ctx.fillStyle="#171d58";ctx.beginPath();ctx.moveTo(-17,-12);ctx.lineTo(0,-38);ctx.lineTo(17,-12);ctx.closePath();ctx.fill();
  ctx.strokeStyle="#ede8ff";ctx.lineWidth=4;ctx.beginPath();ctx.moveTo(12,0);ctx.lineTo(34,0);ctx.stroke();ctx.fillStyle="#8de7ff";ctx.beginPath();ctx.arc(12,0,4,0,6.28);ctx.fill();ctx.restore();
  if(shieldTimer>0){ctx.strokeStyle="#e8c8ff";ctx.lineWidth=3;ctx.shadowBlur=24;ctx.shadowColor="#b58cff";ctx.beginPath();ctx.arc(player.x,player.y,30+Math.sin(performance.now()/120)*2,0,6.28);ctx.stroke();ctx.shadowBlur=0}
}
function draw(){
  ctx.clearRect(0,0,W,H);ctx.save();if(shake>0)ctx.translate((Math.random()-.5)*10*shake*8,(Math.random()-.5)*10*shake*8);drawBackground();
  for(const p of particles){if(p.type==="bolt"){ctx.globalAlpha=Math.max(0,p.life*5);ctx.strokeStyle=p.color;ctx.lineWidth=3;ctx.shadowBlur=18;ctx.shadowColor=p.color;ctx.beginPath();ctx.moveTo(p.x1,p.y1);ctx.lineTo((p.x1+p.x2)/2+(Math.random()-.5)*28,(p.y1+p.y2)/2+(Math.random()-.5)*28);ctx.lineTo(p.x2,p.y2);ctx.stroke();ctx.shadowBlur=0}
    else if(p.type==="ring"){ctx.globalAlpha=Math.max(0,p.life*1.5);ctx.strokeStyle=p.color;ctx.lineWidth=5;ctx.beginPath();ctx.arc(p.x,p.y,p.radius,0,6.28);ctx.stroke()}
    else{ctx.globalAlpha=Math.max(0,p.life);ctx.fillStyle=p.color;ctx.fillRect(p.x,p.y,p.size,p.size)}}
  ctx.globalAlpha=1;for(const e of enemies)drawEnemy(e);drawBoss();
  for(const f of projectiles){if(f.kind==="meteor"||f.kind==="comet"){ctx.strokeStyle=f.kind==="meteor"?"#ffb45f":"#ff75d1";ctx.lineWidth=3;ctx.setLineDash([7,8]);ctx.beginPath();ctx.arc(f.x,f.y,f.kind==="meteor"?90:120,0,6.28);ctx.stroke();ctx.setLineDash([]);ctx.fillStyle=f.kind==="meteor"?"#ffad42":"#ff55d5";ctx.shadowBlur=28;ctx.beginPath();ctx.arc(f.x,f.y,14+Math.sin(f.timer*14)*3,0,6.28);ctx.fill();ctx.shadowBlur=0}
    else{ctx.fillStyle=f.kind==="frost"?"#9ff2ff":f.kind==="void"?"#b45cff":f.kind==="orb"?"#ff6a6a":"#ffb33d";ctx.shadowBlur=28;ctx.shadowColor=ctx.fillStyle;ctx.beginPath();ctx.arc(f.x,f.y,f.r,0,6.28);ctx.fill();ctx.shadowBlur=0}}
  drawPlayer();ctx.restore();
  for(const t of floatingTexts){ctx.globalAlpha=Math.max(0,t.life);ctx.fillStyle=t.color;ctx.font="bold 15px Georgia,serif";ctx.textAlign="center";ctx.fillText(t.text,t.x,t.y)}ctx.globalAlpha=1;
  const banner=document.getElementById("banner");if(banner){banner.classList.toggle("show",bannerTimer>0);banner.innerHTML=`<div class="banner-title">${boss?"👑 "+boss.name.toUpperCase():level>1&&bannerTimer>0?`LEVEL ${level}`:"THE SHADOWS AWAKEN"}</div><div class="banner-sub">Wave ${wave} • Master the arcane.</div>`}
  const overlay=document.getElementById("overlay");if(overlay){overlay.classList.toggle("show",gameOver||paused);if(gameOver){document.getElementById("overlayTitle").textContent="YOU HAVE FALLEN";document.getElementById("overlayText").innerHTML=`${score} score • ${kills} defeated • Level ${level} • Wave ${wave}`;document.getElementById("restartHint").textContent="Press R to rise again"}else if(paused){document.getElementById("overlayTitle").textContent="PAUSED";document.getElementById("overlayText").textContent="The realm waits for your return.";document.getElementById("restartHint").textContent="Press P to continue"}}
}
function loop(t){let dt=Math.min(.033,(t-last)/1000);last=t;update(dt);draw();requestAnimationFrame(loop)}
reset();requestAnimationFrame(loop);
