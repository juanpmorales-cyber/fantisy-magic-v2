const THREE_SRC = null;
// Arcane Survivors V5 — 3D rewrite using Three.js from the CDN.
const canvas = document.getElementById('game');
let scene, camera, renderer, clock;
let player, playerMesh, playerRing;
let enemies = [], projectiles = [], effects = [], pickups = [];
let keys = {}, mouse = { x: 0, y: 0, down: false };
let hp = 100, mana = 100, xp = 0, level = 1, score = 0, kills = 0, wave = 1;
let gameOver = false, paused = false, spawnTimer = .8, waveTimer = 0, bannerTimer = 2.8;
let selectedSpell = 0, shieldTimer = 0, stormTimer = 0, nextWaveAt = 10;
let boss = null, arenaTime = 0;
const MAX_HP=100, MAX_MANA=100, XP_PER_LEVEL=120;
const worldSize = 56;

const spells = [
 {name:'Fireball',key:'1',id:'fire',cost:10,cd:.25,desc:'Exploding flame shot',color:0xff7a20},
 {name:'Arcane Nova',key:'2',id:'nova',cost:24,cd:1.1,desc:'Purple shockwave around you',color:0xb88cff},
 {name:'Blink',key:'3',id:'blink',cost:18,cd:1.4,desc:'Teleport + afterimages',color:0x69eaff},
 {name:'Frost Bolt',key:'4',id:'frost',cost:12,cd:.55,desc:'Crystal projectile + slow',color:0x82e8ff},
 {name:'Chain Lightning',key:'5',id:'chain',cost:26,cd:1.25,desc:'Electric chain jump',color:0xf0ff65},
 {name:'Meteor',key:'6',id:'meteor',cost:34,cd:2.4,desc:'Falling meteor crater',color:0xff6330},
 {name:'Arcane Ward',key:'7',id:'ward',cost:22,cd:7,desc:'Shield that blocks hits',color:0xd2a6ff},
 {name:'Flame Wave',key:'8',id:'wave',cost:25,cd:1.8,desc:'Burning cone',color:0xff4d28},
 {name:'Blizzard',key:'9',id:'blizzard',cost:30,cd:3,desc:'Snowstorm + slow field',color:0x9feaff},
 {name:'Thunder Storm',key:'0',id:'storm',cost:40,cd:4.2,desc:'Multiple lightning strikes',color:0xffff55},
 {name:'Void Orb',key:'Q',id:'void',cost:26,cd:1.7,desc:'Gravity orb',color:0x9b41ff},
 {name:'Comet',key:'E',id:'comet',cost:38,cd:2.8,desc:'Cosmic piercing missile',color:0xff55cf},
 {name:'Healing',key:'F',id:'heal',cost:30,cd:5,desc:'Restore health',color:0x61ff8a},
 {name:'Tornado',key:'G',id:'tornado',cost:34,cd:3.4,desc:'Pull + lift enemies',color:0xd8fbff},
 {name:'Apocalypse',key:'H',id:'apoc',cost:80,cd:9,desc:'Huge area annihilation',color:0xff30e5}
];
const cooldowns = Object.fromEntries(spells.map(s=>[s.id,0]));
const enemyDefs = {
 Imp:{hp:48,speed:4.2,damage:7,r:.55,xp:18,score:30,color:0xd83b49},
 Ghoul:{hp:140,speed:1.9,damage:13,r:.9,xp:30,score:55,color:0x4f8057},
 Wraith:{hp:84,speed:3.5,damage:10,r:.7,xp:28,score:48,color:0x7557ba},
 Demon:{hp:205,speed:2.2,damage:19,r:1.15,xp:52,score:90,color:0x842536},
 Dragon:{hp:500,speed:1.5,damage:28,r:1.5,xp:100,score:180,color:0x3c7c37}
};
const keyToIndex={'1':0,'2':1,'3':2,'4':3,'5':4,'6':5,'7':6,'8':7,'9':8,'0':9,'q':10,'e':11,'f':12,'g':13,'h':14};

function hex(c){ return '#'+c.toString(16).padStart(6,'0'); }
function clamp(v,a,b){return Math.max(a,Math.min(b,v));}
function dist(a,b){return Math.hypot(a.x-b.x,a.z-b.z);}
function xpNeed(){return XP_PER_LEVEL + (level-1)*25;}
function addText(text,color='#fff'){const el=document.createElement('div');el.className='float-text';el.textContent=text;el.style.color=color;document.body.appendChild(el);setTimeout(()=>el.remove(),850);}

function makeLabel(text,color='#fff',size=48){const c=document.createElement('canvas');c.width=512;c.height=128;const x=c.getContext('2d');x.clearRect(0,0,c.width,c.height);x.font=`bold ${size}px Georgia`;x.textAlign='center';x.textBaseline='middle';x.fillStyle=color;x.shadowColor=color;x.shadowBlur=15;x.fillText(text,256,64);const t=new THREE.CanvasTexture(c);const m=new THREE.SpriteMaterial({map:t,transparent:true,depthWrite:false});const s=new THREE.Sprite(m);s.scale.set(6,1.5,1);return s;}
function mat(c,em=0){return new THREE.MeshStandardMaterial({color:c,emissive:c,emissiveIntensity:em,roughness:.55,metalness:.12});}
function glowSphere(r,color,em=1.8){return new THREE.Mesh(new THREE.SphereGeometry(r,20,16),mat(color,em));}
function particleBurst(pos,color,count=18,size=.08,speed=5){for(let i=0;i<count;i++){const p=glowSphere(size,color,2);p.position.copy(pos);scene.add(p);effects.push({type:'particle',obj:p,life:.5+Math.random()*.45,max:.95,vel:new THREE.Vector3((Math.random()-.5)*speed,Math.random()*speed,(Math.random()-.5)*speed)});}}
function ringEffect(pos,color,r=2,life=.5){const g=new THREE.TorusGeometry(r,r*.035,8,48);const m=new THREE.MeshBasicMaterial({color,transparent:true,opacity:.9});const o=new THREE.Mesh(g,m);o.rotation.x=Math.PI/2;o.position.copy(pos);scene.add(o);effects.push({type:'ring',obj:o,life,max:life,scale:1});}
function beam(a,b,color,width=.08,life=.22){const v=new THREE.Vector3().subVectors(b,a);const g=new THREE.CylinderGeometry(width,width,v.length(),8);const m=new THREE.MeshBasicMaterial({color,transparent:true,opacity:.9});const o=new THREE.Mesh(g,m);o.position.copy(a).add(b).multiplyScalar(.5);o.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),v.normalize());scene.add(o);effects.push({type:'beam',obj:o,life,max:life});}

function init3D(){
 scene=new THREE.Scene();scene.background=new THREE.Color(0x050811);scene.fog=new THREE.Fog(0x050811,25,85);
 camera=new THREE.PerspectiveCamera(55,innerWidth/innerHeight,.1,200);camera.position.set(0,24,20);camera.lookAt(0,0,0);
 renderer=new THREE.WebGLRenderer({canvas,antialias:true});renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.setSize(innerWidth,innerHeight);renderer.shadowMap.enabled=true;
 clock=new THREE.Clock();
 scene.add(new THREE.HemisphereLight(0x9fdcff,0x0b1020,1.4));const sun=new THREE.DirectionalLight(0xfff2cf,2.1);sun.position.set(10,25,12);sun.castShadow=true;scene.add(sun);
 const ground=new THREE.Mesh(new THREE.PlaneGeometry(worldSize,worldSize),new THREE.MeshStandardMaterial({color:0x122016,roughness:.95,metalness:0}));ground.rotation.x=-Math.PI/2;ground.receiveShadow=true;scene.add(ground);
 const grid=new THREE.GridHelper(worldSize,28,0x3a5d4e,0x1b2d28);grid.position.y=.01;scene.add(grid);
 for(let i=0;i<30;i++){const rock=new THREE.Mesh(new THREE.DodecahedronGeometry(.25+Math.random()*.5),mat(0x334437));rock.position.set((Math.random()-.5)*50, .2, (Math.random()-.5)*50);scene.add(rock);}
 playerMesh=new THREE.Group();
 const body=new THREE.Mesh(new THREE.CylinderGeometry(.55,.72,1.4,8),mat(0x3c2b83,.4));body.castShadow=true;playerMesh.add(body);
 const head=new THREE.Mesh(new THREE.SphereGeometry(.52,16,12),mat(0xf3c8a7));head.position.y=1.15;playerMesh.add(head);
 const hat=new THREE.Mesh(new THREE.ConeGeometry(.8,1.2,5),mat(0x1f173e,.45));hat.position.y=1.8;playerMesh.add(hat);
 const staff=new THREE.Mesh(new THREE.CylinderGeometry(.06,.08,2.8,8),mat(0x6e412d));staff.position.set(.8,.9,0);staff.rotation.z=.12;playerMesh.add(staff);
 const orb=glowSphere(.18,0xb66cff,2.8);orb.position.set(.8,2.25,0);playerMesh.add(orb);
 scene.add(playerMesh);
 playerRing=new THREE.Mesh(new THREE.TorusGeometry(1.15,.035,8,48),new THREE.MeshBasicMaterial({color:0x61e7ff,transparent:true,opacity:.65}));playerRing.rotation.x=Math.PI/2;scene.add(playerRing);
 reset();
}

function spawnEnemy(initial=false){
 const names=wave<3?['Imp','Ghoul','Wraith']:wave<5?['Imp','Ghoul','Wraith','Demon']:['Imp','Ghoul','Wraith','Demon','Dragon'];
 const name=names[Math.floor(Math.random()*names.length)],d=enemyDefs[name], side=Math.floor(Math.random()*4), pad=2;
 let x=0,z=0;if(side===0){x=-worldSize/2-pad;z=(Math.random()-.5)*worldSize}else if(side===1){x=worldSize/2+pad;z=(Math.random()-.5)*worldSize}else if(side===2){x=(Math.random()-.5)*worldSize;z=-worldSize/2-pad}else{x=(Math.random()-.5)*worldSize;z=worldSize/2+pad}
 const s=1+(wave-1)*.12;
 const g=new THREE.Group();
 if(name==='Imp'){const b=new THREE.Mesh(new THREE.SphereGeometry(.55,12,10),mat(d.color,1));b.scale.set(1,.9,1);g.add(b);for(const sx of [-.25,.25]){const eye=glowSphere(.09,0xfff2a0,3);eye.position.set(sx,.12,.5);g.add(eye);}g.rotation.y=Math.random()*6;}
 if(name==='Ghoul'){const b=new THREE.Mesh(new THREE.BoxGeometry(1.2,1.5,.9),mat(d.color,.2));b.position.y=.75;g.add(b);const h=new THREE.Mesh(new THREE.SphereGeometry(.58,12,10),mat(0x90a85d,.2));h.position.y=1.65;g.add(h);}
 if(name==='Wraith'){const b=new THREE.Mesh(new THREE.ConeGeometry(.65,1.7,7),new THREE.MeshStandardMaterial({color:d.color,transparent:true,opacity:.55,emissive:d.color,emissiveIntensity:1.2}));b.position.y=1;g.add(b);}
 if(name==='Demon'){const b=new THREE.Mesh(new THREE.CapsuleGeometry(.65,.9,6,10),mat(d.color,.5));b.position.y=.8;g.add(b);for(const sx of [-.55,.55]){const h=new THREE.Mesh(new THREE.ConeGeometry(.18,.75,6),mat(0xd78663,.4));h.position.set(sx,1.8,.05);h.rotation.z=sx*.45;g.add(h);}}
 if(name==='Dragon'){const b=new THREE.Mesh(new THREE.SphereGeometry(1.2,16,12),mat(d.color,1));b.scale.set(1.3,.75,1);b.position.y=1.2;g.add(b);for(const sx of [-1.3,1.3]){const w=new THREE.Mesh(new THREE.ConeGeometry(.95,2.1,4),mat(0x254c28,.6));w.position.set(sx,1.5,0);w.rotation.z=sx>0?-.55:.55;g.add(w);}const head=new THREE.Mesh(new THREE.ConeGeometry(.55,1.4,6),mat(0x5a9c4a,.8));head.rotation.z=Math.PI/2;head.position.set(0,1.55,-1.1);g.add(head);}
 g.traverse(o=>{if(o.isMesh)o.castShadow=true;});
 g.position.set(x,.02,z);scene.add(g);
 enemies.push({name,x,z,mesh:g,hp:d.hp*s,maxHp:d.hp*s,speed:d.speed*(1+Math.min(.45,(wave-1)*.028)),damage:d.damage*(1+wave*.035),r:d.r,xp:d.xp,score:d.score,slow:1,hit:0,shoot:2+Math.random()*2,phase:Math.random()*6});
}
function spawnBoss(){if(boss)return;const dragon=wave%2===0;const maxHp=(dragon?3200:2600)+wave*300;const g=new THREE.Group();
 const core=new THREE.Mesh(new THREE.SphereGeometry(dragon?1.9:1.6,20,16),mat(dragon?0x3b8a3f:0x6f245d,1.2));core.scale.y=.72;g.add(core);
 for(const sx of [-1,1]){const wing=new THREE.Mesh(new THREE.ConeGeometry(1.4,3.3,4),mat(dragon?0x1c5424:0x3a153f,.8));wing.position.set(sx*2,1.3,0);wing.rotation.z=sx>0?-.6:.6;g.add(wing);}
 for(const sx of [-.65,.65]){const eye=glowSphere(.14,dragon?0xc9ff6a:0xff89c5,4);eye.position.set(sx*.9, .65,-1.45);g.add(eye);}
 g.position.set((Math.random()>.5?1:-1)*25,.4,(Math.random()-.5)*12);scene.add(g);g.traverse(o=>{if(o.isMesh)o.castShadow=true;});
 boss={name:dragon?'Ancient Dragon':'Dread Lord',x:g.position.x,z:g.position.z,mesh:g,r:dragon?2.7:2.3,hp:maxHp,maxHp,speed:dragon?1.7:2.0,damage:dragon?30:24,breath:2.5,orb:4,phase:0};
 document.querySelector('.boss-name').textContent='👑 '+boss.name;bannerTimer=3.5;addText(boss.name.toUpperCase(),'#ffe067');
}
function nearest(range=Infinity){return enemies.filter(e=>Math.hypot(player.x-e.x,player.z-e.z)<=range).sort((a,b)=>Math.hypot(player.x-a.x,player.z-a.z)-Math.hypot(player.x-b.x,player.z-b.z));}
function damageEnemy(e,n){if(!e||e.hp<=0)return;e.hp-=n;e.hit=.14;}
function damageBoss(n){if(!boss)return;boss.hp-=n;if(boss.hp<=0){score+=1500;xp+=200;kills++;particleBurst(boss.mesh.position,0xffe16b,90,.12,10);scene.remove(boss.mesh);boss=null;ringEffect(player.mesh?playerMesh.position:playerMesh.position,0xffe16b,5,1);}}
function hurt(n){if(shieldTimer>0)return;hp-=n;flashDamage();if(hp<=0){hp=0;gameOver=true;}}
function flashDamage(){document.body.classList.remove('hurt');void document.body.offsetWidth;document.body.classList.add('hurt');}
function levelUp(){while(xp>=xpNeed()){xp-=xpNeed();level++;hp=MAX_HP;mana=MAX_MANA;particleBurst(playerMesh.position,0xffe46d,70,.08,7);addText('LEVEL '+level,'#ffe46d');}}
function ready(s){if(mana<s.cost||cooldowns[s.id]>0)return false;mana-=s.cost;cooldowns[s.id]=s.cd;return true;}
function targetPoint(){const v=new THREE.Vector3((mouse.x/innerWidth)*2-1,-(mouse.y/innerHeight)*2+1,.5);v.unproject(camera);const dir=v.sub(camera.position).normalize();const t=-camera.position.y/dir.y;return camera.position.clone().add(dir.multiplyScalar(t));}
function spawnProjectile(kind,pos,dir,damage,speed,life,r){const mesh=new THREE.Mesh(new THREE.SphereGeometry(r,12,10),mat(spells.find(s=>s.id===kind)?.color||0xffffff,1.5));mesh.position.copy(pos);scene.add(mesh);projectiles.push({kind,mesh,vel:dir.normalize().multiplyScalar(speed),damage,life,r});}
function cast(id){if(gameOver||paused)return;const s=spells.find(v=>v.id===id);if(!s||!ready(s))return;const tgt=targetPoint(),dir=new THREE.Vector3(tgt.x-player.x,0,tgt.z-player.z).normalize();player.facing=Math.atan2(dir.x,dir.z);
 if(id==='fire'){spawnProjectile('fire',playerMesh.position.clone().add(new THREE.Vector3(0,1,0)),dir,36+level*4,18,2,0.24);}
 else if(id==='nova'){const r=5+level*.1;for(const e of enemies)if(Math.hypot(player.x-e.x,player.z-e.z)<r+e.r)damageEnemy(e,62+level*5);if(boss&&Math.hypot(player.x-boss.x,player.z-boss.z)<r+boss.r)damageBoss(62+level*5);ringEffect(playerMesh.position,0xb78cff,r,.65);particleBurst(playerMesh.position,0xb78cff,55,.06,5);}
 else if(id==='blink'){const old=playerMesh.position.clone();player.x=clamp(player.x+dir.x*8,-25,25);player.z=clamp(player.z+dir.z*8,-25,25);playerMesh.position.set(player.x,0,player.z);ringEffect(old,0x63e7ff,1.2,.4);ringEffect(playerMesh.position,0x63e7ff,1.6,.4);particleBurst(old,0x63e7ff,20,.05,3);particleBurst(playerMesh.position,0x63e7ff,20,.05,3);}
 else if(id==='frost'){spawnProjectile('frost',playerMesh.position.clone().add(new THREE.Vector3(0,1,0)),dir,34+level*3,14,2.3,.25);}
 else if(id==='chain'){let cur=playerMesh.position.clone().setY(1);let targets=nearest(12).slice(0,4+Math.floor(level/5));for(const e of targets){const ep=e.mesh.position.clone().setY(1);damageEnemy(e,58+level*5);beam(cur,ep,0xf4ff72,.09,.25);particleBurst(ep,0xf4ff72,12,.04,3);cur=ep;}if(boss&&targets.length<3){const ep=boss.mesh.position.clone().setY(1.4);damageBoss(58+level*5);beam(cur,ep,0xf4ff72,.09,.25);}}
 else if(id==='meteor'){const p=targetPoint();const mark=new THREE.Mesh(new THREE.RingGeometry(1.9,2.1,32),new THREE.MeshBasicMaterial({color:0xff6530,transparent:true,opacity:.85}));mark.rotation.x=-Math.PI/2;mark.position.set(p.x,.03,p.z);scene.add(mark);effects.push({type:'meteor',obj:mark,x:p.x,z:p.z,life:1.05,max:1.05,damage:120+level*12});}
 else if(id==='ward'){shieldTimer=5;ringEffect(playerMesh.position,0xd8b7ff,1.5,.8);ringEffect(playerMesh.position,0x7feaff,1.8,.8);}
 else if(id==='wave'){for(const e of enemies){const vx=e.x-player.x,vz=e.z-player.z,d=Math.hypot(vx,vz),ang=Math.atan2(vx,vz),da=Math.atan2(Math.sin(ang-player.facing),Math.cos(ang-player.facing));if(d<9&&Math.abs(da)<.9){damageEnemy(e,92+level*7);e.burn=2.8;}}const cone=new THREE.Mesh(new THREE.ConeGeometry(5,7,20,1,true),new THREE.MeshBasicMaterial({color:0xff5b2e,transparent:true,opacity:.22,side:THREE.DoubleSide}));cone.rotation.x=Math.PI/2;cone.rotation.z=-player.facing;cone.position.copy(playerMesh.position);cone.position.y=1;scene.add(cone);effects.push({type:'cone',obj:cone,life:.32,max:.32});}
 else if(id==='blizzard'){const p=targetPoint();const o=new THREE.Mesh(new THREE.SphereGeometry(5,24,12),new THREE.MeshBasicMaterial({color:0xaeeeff,transparent:true,opacity:.13,wireframe:false}));o.position.set(p.x,1,p.z);scene.add(o);effects.push({type:'field',obj:o,x:p.x,z:p.z,r:5,life:2.3,max:2.3,kind:'blizzard'});}
 else if(id==='storm'){for(let i=0;i<8;i++){setTimeout(()=>{if(gameOver)return;const arr=nearest(16);const e=arr[Math.floor(Math.random()*Math.max(1,arr.length))];const p=e?e.mesh.position.clone():targetPoint();lightningStrike(p,0xffff55,4);if(e)damageEnemy(e,55+level*5);if(boss&&Math.hypot(boss.x-p.x,boss.z-p.z)<4)damageBoss(55+level*5);},i*150);} }
 else if(id==='void'){const p=targetPoint();const o=glowSphere(.7,0x24102f,2.5);o.position.set(p.x,1.4,p.z);scene.add(o);effects.push({type:'void',obj:o,x:p.x,z:p.z,r:4,life:2,max:2});}
 else if(id==='comet'){spawnProjectile('comet',playerMesh.position.clone().add(new THREE.Vector3(0,1.2,0)),dir,125+level*10,25,2,.35);}
 else if(id==='heal'){hp=Math.min(MAX_HP,hp+35+level*4);mana=Math.min(MAX_MANA,mana+15);ringEffect(playerMesh.position,0x62ff8f,2,.8);particleBurst(playerMesh.position,0x62ff8f,45,.06,4);}
 else if(id==='tornado'){const p=targetPoint();const o=new THREE.Mesh(new THREE.ConeGeometry(.4,6,20,1,true),new THREE.MeshBasicMaterial({color:0xdffcff,transparent:true,opacity:.26,wireframe:true}));o.position.set(p.x,3,p.z);scene.add(o);effects.push({type:'tornado',obj:o,x:p.x,z:p.z,r:4,life:2,max:2});}
 else if(id==='apoc'){const p=targetPoint();const o=new THREE.Mesh(new THREE.SphereGeometry(3,32,16),new THREE.MeshBasicMaterial({color:0xff32e8,transparent:true,opacity:.25,wireframe:true}));o.position.set(p.x,2,p.z);scene.add(o);effects.push({type:'apoc',obj:o,x:p.x,z:p.z,r:10,life:1.2,max:1.2,damage:250+level*22});}
}
function lightningStrike(p,color=0xffff55,height=8){const a=new THREE.Vector3(p.x,height,p.z),b=new THREE.Vector3(p.x,0.1,p.z);beam(a,b,color,.11,.22);particleBurst(b,color,20,.05,5);ringEffect(b,color,1.2,.25);}

function updatePlayer(dt){let x=(keys.a||keys.arrowleft?-1:0)+(keys.d||keys.arrowright?1:0),z=(keys.w||keys.arrowup?-1:0)+(keys.s||keys.arrowdown?1:0);const len=Math.hypot(x,z)||1;const sp=(keys.shift?8:5.5);player.x=clamp(player.x+x/len*sp*dt,-25,25);player.z=clamp(player.z+z/len*sp*dt,-25,25);playerMesh.position.set(player.x,0,player.z);playerMesh.rotation.y=player.facing;playerRing.position.set(player.x,0.05,player.z);playerRing.material.color.setHex(shieldTimer>0?0xd8b7ff:0x61e7ff);camera.position.lerp(new THREE.Vector3(player.x*.25,24,player.z*.18+20),.08);camera.lookAt(player.x,0,player.z);if(mouse.down)cast(spells[selectedSpell].id);}
function updateEnemies(dt){for(let i=enemies.length-1;i>=0;i--){const e=enemies[i];if(e.hp<=0){kills++;score+=e.score;xp+=e.xp;particleBurst(e.mesh.position,e.name==='Wraith'?0xd8c7ff:e.name==='Dragon'?0x9cff65:0xff785f,24,.07,4);scene.remove(e.mesh);enemies.splice(i,1);continue;}e.slow=Math.max(.5,e.slow-dt*.08);e.hit=Math.max(0,e.hit-dt);const dx=player.x-e.x,dz=player.z-e.z,d=Math.hypot(dx,dz)||1;let mult=e.speed*e.slow;
 if(e.name==='Wraith')e.mesh.position.y=1.1+Math.sin(arenaTime*3+e.phase)*.35;
 if(e.name==='Demon'&&d<11&&e.shoot<=0){const dir=new THREE.Vector3(dx,0,dz).normalize();spawnProjectile('enemy',e.mesh.position.clone().setY(1),dir,e.damage,8,3,.2);e.shoot=2.2;}
 e.shoot-=dt;if(d>e.r+1.2){e.x+=dx/d*mult*dt;e.z+=dz/d*mult*dt;e.mesh.position.set(e.x,e.name==='Wraith'?1.1:e.name==='Dragon'?.02:.02,e.z);e.mesh.lookAt(player.x,e.mesh.position.y,player.z);}else{hurt(e.damage*dt);}
 if(e.burn>0){e.burn-=dt;damageEnemy(e,18*dt);}if(e.name==='Ghoul')e.hp=Math.min(e.maxHp,e.hp+3*dt);
 }
}
function updateProjectiles(dt){for(let i=projectiles.length-1;i>=0;i--){const p=projectiles[i];p.life-=dt;p.mesh.position.addScaledVector(p.vel,dt);if(p.kind==='fire')particleBurst(p.mesh.position,0xff7a20,1,.035,1.2);if(p.kind==='frost')particleBurst(p.mesh.position,0x9feaff,1,.03,.8);if(p.kind==='comet')particleBurst(p.mesh.position,0xff55cf,2,.04,1.8);
 let hit=false;for(const e of enemies){if(Math.hypot(p.mesh.position.x-e.x,p.mesh.position.z-e.z)<e.r+p.r){damageEnemy(e,p.damage);if(p.kind==='frost')e.slow=.35;if(p.kind==='fire'||p.kind==='comet'){for(const q of enemies)if(Math.hypot(q.x-e.x,q.z-e.z)<2.2)damageEnemy(q,p.damage*.45);ringEffect(e.mesh.position,p.kind==='fire'?0xff6a28:0xff55cf,1.7,.25);}hit=true;break;}}
 if(!hit&&boss&&Math.hypot(p.mesh.position.x-boss.x,p.mesh.position.z-boss.z)<boss.r+p.r){damageBoss(p.damage);hit=true;}
 if(hit||p.life<=0){scene.remove(p.mesh);projectiles.splice(i,1);}}
}
function updateEffects(dt){for(let i=effects.length-1;i>=0;i--){const e=effects[i];e.life-=dt;const f=clamp(e.life/e.max,0,1);if(e.type==='particle'){e.obj.position.addScaledVector(e.vel,dt);e.vel.y-=7*dt;e.obj.scale.setScalar(f);}else if(e.type==='ring'){e.obj.scale.setScalar(1+(1-f)*1.8);e.obj.material.opacity=f*.9;}else if(e.type==='beam'){e.obj.material.opacity=f;}else if(e.type==='meteor'){if(e.life<=0){for(const q of enemies)if(Math.hypot(q.x-e.x,q.z-e.z)<3.1)damageEnemy(q,e.damage);if(boss&&Math.hypot(boss.x-e.x,boss.z-e.z)<3.5)damageBoss(e.damage);particleBurst(e.obj.position,0xff7934,50,.08,6);ringEffect(e.obj.position,0xff7934,3.6,.45);scene.remove(e.obj);effects.splice(i,1);continue;}}else if(e.type==='field'){e.obj.material.opacity=.08+.12*Math.sin(arenaTime*4)**2;for(const q of enemies)if(Math.hypot(q.x-e.x,q.z-e.z)<e.r)q.slow=.35;}else if(e.type==='void'){e.obj.rotation.y+=dt*2;for(const q of enemies){const dx=e.x-q.x,dz=e.z-q.z,d=Math.hypot(dx,dz)||1;if(d<e.r){q.x+=dx/d*dt*3;q.z+=dz/d*dt*3;damageEnemy(q,12*dt);}}if(boss&&Math.hypot(boss.x-e.x,boss.z-e.z)<e.r)damageBoss(12*dt);}else if(e.type==='tornado'){e.obj.rotation.y+=dt*4;for(const q of enemies){const dx=e.x-q.x,dz=e.z-q.z,d=Math.hypot(dx,dz)||1;if(d<e.r){q.x+=dx/d*dt*4;q.z+=dz/d*dt*4;damageEnemy(q,20*dt);}}}else if(e.type==='apoc'){e.obj.scale.setScalar(1+(1-f)*4);for(const q of enemies)if(Math.hypot(q.x-e.x,q.z-e.z)<e.r)damageEnemy(q,e.damage*dt);if(boss&&Math.hypot(boss.x-e.x,boss.z-e.z)<e.r)damageBoss(e.damage*dt);}if(e.life<=0){scene.remove(e.obj);effects.splice(i,1);}}
}
function updateBoss(dt){if(!boss)return;boss.phase+=dt;const dx=player.x-boss.x,dz=player.z-boss.z,d=Math.hypot(dx,dz)||1;boss.x+=dx/d*boss.speed*dt;boss.z+=dz/d*boss.speed*dt;boss.mesh.position.set(boss.x,.4,boss.z);boss.mesh.rotation.y=Math.atan2(dx,dz)+Math.sin(boss.phase)*.2;boss.breath-=dt;boss.orb-=dt;if(boss.breath<=0){const p=playerMesh.position.clone();for(let i=0;i<5;i++){const ang=Math.atan2(dz,dx)+(i-2)*.13;const dir=new THREE.Vector3(Math.cos(ang),0,Math.sin(ang));spawnProjectile('enemy',boss.mesh.position.clone().setY(1),dir,boss.damage,10,2.3,.24);}boss.breath= boss.name==='Ancient Dragon'?2.0:2.7;}if(boss.orb<=0){lightningStrike(playerMesh.position, boss.name==='Ancient Dragon'?0x8dff72:0xff5b9a,9);hurt(boss.damage*.7);boss.orb=4.5;}if(d<boss.r+1.5)hurt(boss.damage*dt);}
function updateWaves(dt){spawnTimer-=dt;waveTimer+=dt;if(!boss&&spawnTimer<=0){const count=Math.min(7,2+wave);for(let i=0;i<count;i++)spawnEnemy();spawnTimer=Math.max(.25,1.1-wave*.025);}if(!boss&&kills>=nextWaveAt){wave++;nextWaveAt+=10+wave*2;bannerTimer=2.3;for(let i=0;i<Math.min(3,wave);i++)spawnEnemy(true);if(wave%5===0)spawnBoss();}levelUp();}
function updateHUD(){document.getElementById('hp').textContent=Math.ceil(hp);document.getElementById('mana').textContent=Math.floor(mana);document.getElementById('level').textContent=level;document.getElementById('xp').textContent=xp;document.getElementById('kills').textContent=kills;document.getElementById('enemies').textContent=enemies.length+(boss?1:0);document.getElementById('score').textContent=score;document.getElementById('hpbar').style.width=(hp/MAX_HP*100)+'%';document.getElementById('manabar').style.width=(mana/MAX_MANA*100)+'%';document.getElementById('xpbar').style.width=(xp/xpNeed()*100)+'%';document.getElementById('bossbar').style.width=(boss?boss.hp/boss.maxHp*100:0)+'%';document.getElementById('selectedSpell').textContent=(selectedSpell+1)+': '+spells[selectedSpell].name;document.querySelector('.boss-name').style.opacity=boss?1:.4;} 
function update(dt){arenaTime+=dt;for(const s of spells)cooldowns[s.id]=Math.max(0,cooldowns[s.id]-dt);mana=Math.min(MAX_MANA,mana+7*dt);shieldTimer=Math.max(0,shieldTimer-dt);updatePlayer(dt);updateEnemies(dt);updateProjectiles(dt);updateEffects(dt);updateBoss(dt);updateWaves(dt);updateHUD();if(bannerTimer>0)bannerTimer-=dt;document.getElementById('banner').classList.toggle('show',bannerTimer>0);document.getElementById('banner').innerHTML=`<div class="banner-title">${boss?'👑 '+boss.name.toUpperCase():'WAVE '+wave}</div><div class="banner-sub">${boss?'Defeat the boss!':'Master the realm.'}</div>`;document.getElementById('overlay').classList.toggle('show',gameOver||paused);if(gameOver){document.getElementById('overlayTitle').textContent='YOU HAVE FALLEN';document.getElementById('overlayText').textContent=`${score} score • ${kills} defeated • Level ${level} • Wave ${wave}`;document.getElementById('restartHint').textContent='Press R to rise again';}else if(paused){document.getElementById('overlayTitle').textContent='PAUSED';document.getElementById('overlayText').textContent='The realm waits for your return.';document.getElementById('restartHint').textContent='Press P to continue';}}
function reset(){hp=MAX_HP;mana=MAX_MANA;xp=0;level=1;score=0;kills=0;wave=1;gameOver=false;paused=false;spawnTimer=.8;waveTimer=0;bannerTimer=2.8;boss=null;shieldTimer=0;nextWaveAt=10;for(const s of spells)cooldowns[s.id]=0;for(const e of enemies)scene?.remove(e.mesh);for(const p of projectiles)scene?.remove(p.mesh);for(const e of effects)scene?.remove(e.obj);enemies=[];projectiles=[];effects=[];player={x:0,z:0,facing:0};if(playerMesh){playerMesh.position.set(0,0,0);playerRing.position.set(0,.05,0);}for(let i=0;i<6;i++)spawnEnemy(true);updateHUD();}

addEventListener('resize',()=>{if(renderer){camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);}});
addEventListener('mousemove',e=>{mouse.x=e.clientX;mouse.y=e.clientY;});
addEventListener('mousedown',e=>{if(e.button===0){mouse.down=true;cast(spells[selectedSpell].id);}});addEventListener('mouseup',e=>{if(e.button===0)mouse.down=false;});
addEventListener('keydown',e=>{const k=e.key.toLowerCase();keys[k]=true;if([' ','arrowup','arrowdown','arrowleft','arrowright'].includes(k))e.preventDefault();if(gameOver&&k==='r')reset();else if(!gameOver&&k==='p')paused=!paused;else if(!gameOver&&keyToIndex[k]!==undefined){selectedSpell=keyToIndex[k];cast(spells[selectedSpell].id);}});addEventListener('keyup',e=>keys[e.key.toLowerCase()]=false);addEventListener('blur',()=>{keys={};mouse.down=false;});

function animate(){requestAnimationFrame(animate);const dt=Math.min(.033,clock.getDelta());if(!paused&&!gameOver)update(dt);renderer.render(scene,camera);}
init3D();animate();
