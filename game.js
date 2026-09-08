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
function mat(c,em=0,rough=.48,metal=.18){return new THREE.MeshStandardMaterial({color:c,emissive:c,emissiveIntensity:em,roughness:rough,metalness:metal});}
function glowMat(c,em=2,opacity=1){return new THREE.MeshStandardMaterial({color:c,emissive:c,emissiveIntensity:em,transparent:opacity<1,opacity,roughness:.3,metalness:.05});}
function addPointLight(parent,color,intensity=2,distance=10){const l=new THREE.PointLight(color,intensity,distance,2);parent.add(l);return l;}
function addRune(pos,color=0x6bdcff,r=1.4){const g=new THREE.Group();const ring=new THREE.Mesh(new THREE.TorusGeometry(r,.025,6,48),new THREE.MeshBasicMaterial({color,transparent:true,opacity:.55}));ring.rotation.x=Math.PI/2;g.add(ring);for(let i=0;i<6;i++){const a=i*Math.PI/3;const s=new THREE.Mesh(new THREE.BoxGeometry(.18,.025,.5),new THREE.MeshBasicMaterial({color,transparent:true,opacity:.45}));s.position.set(Math.cos(a)*r,0.02,Math.sin(a)*r);s.rotation.y=-a;g.add(s);}g.position.copy(pos);scene.add(g);effects.push({type:'rune',obj:g,life:999,max:999});return g;}
function makeCrystal(color=0x64d8ff,scale=1){const g=new THREE.Group();const core=new THREE.Mesh(new THREE.OctahedronGeometry(.42*scale,1),glowMat(color,1.5,.92));core.scale.y=1.8;g.add(core);const shard=new THREE.Mesh(new THREE.ConeGeometry(.18*scale,.9*scale,6),mat(color,.8,.25,.3));shard.position.y=.48*scale;g.add(shard);return g;}
function glowSphere(r,color,em=1.8){return new THREE.Mesh(new THREE.SphereGeometry(r,20,16),mat(color,em));}
function particleBurst(pos,color,count=18,size=.08,speed=5){for(let i=0;i<count;i++){const p=glowSphere(size,color,2);p.position.copy(pos);scene.add(p);effects.push({type:'particle',obj:p,life:.5+Math.random()*.45,max:.95,vel:new THREE.Vector3((Math.random()-.5)*speed,Math.random()*speed,(Math.random()-.5)*speed)});}}
function ringEffect(pos,color,r=2,life=.5){const g=new THREE.TorusGeometry(r,r*.035,8,48);const m=new THREE.MeshBasicMaterial({color,transparent:true,opacity:.9});const o=new THREE.Mesh(g,m);o.rotation.x=Math.PI/2;o.position.copy(pos);scene.add(o);effects.push({type:'ring',obj:o,life,max:life,scale:1});}
function beam(a,b,color,width=.08,life=.22){const v=new THREE.Vector3().subVectors(b,a);const g=new THREE.CylinderGeometry(width,width,v.length(),8);const m=new THREE.MeshBasicMaterial({color,transparent:true,opacity:.9});const o=new THREE.Mesh(g,m);o.position.copy(a).add(b).multiplyScalar(.5);o.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),v.normalize());scene.add(o);effects.push({type:'beam',obj:o,life,max:life});}

function init3D(){
 scene=new THREE.Scene();
 scene.background=new THREE.Color(0x03060b);
 scene.fog=new THREE.FogExp2(0x08120f,.014);
 camera=new THREE.PerspectiveCamera(52,innerWidth/innerHeight,.1,220);
 camera.position.set(0,25,22);camera.lookAt(0,0,0);
 renderer=new THREE.WebGLRenderer({canvas,antialias:true,powerPreference:'high-performance'});
 renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.setSize(innerWidth,innerHeight);
 renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
 renderer.outputColorSpace=THREE.SRGBColorSpace;
 renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.12;
 clock=new THREE.Clock();
 scene.add(new THREE.HemisphereLight(0x8cc9ff,0x09120b,1.8));
 const moon=new THREE.DirectionalLight(0xbfdcff,2.6);moon.position.set(-18,32,10);moon.castShadow=true;moon.shadow.mapSize.set(2048,2048);moon.shadow.camera.left=-40;moon.shadow.camera.right=40;moon.shadow.camera.top=40;moon.shadow.camera.bottom=-40;scene.add(moon);
 const warm=new THREE.PointLight(0xff8a42,2.4,34,2);warm.position.set(0,8,0);scene.add(warm);
 const ground=new THREE.Mesh(new THREE.CircleGeometry(worldSize*.78,96),new THREE.MeshStandardMaterial({color:0x0d2119,roughness:.98,metalness:0}));ground.rotation.x=-Math.PI/2;ground.receiveShadow=true;scene.add(ground);
 const inner=new THREE.Mesh(new THREE.CircleGeometry(20,96),new THREE.MeshStandardMaterial({color:0x13291f,roughness:.92,metalness:0}));inner.rotation.x=-Math.PI/2;inner.position.y=.012;inner.receiveShadow=true;scene.add(inner);
 const path=new THREE.Mesh(new THREE.RingGeometry(13.5,14.4,64),new THREE.MeshStandardMaterial({color:0x334738,roughness:.8,metalness:.05}));path.rotation.x=-Math.PI/2;path.position.y=.02;scene.add(path);
 for(let i=0;i<12;i++){const a=i*Math.PI*2/12;addRune(new THREE.Vector3(Math.cos(a)*12.5,.045,Math.sin(a)*12.5),i%3===0?0xc05cff:0x4fdfff,1.05);}
 for(let i=0;i<44;i++){
   const a=Math.random()*Math.PI*2,r=15+Math.random()*15,x=Math.cos(a)*r,z=Math.sin(a)*r;
   const rock=new THREE.Mesh(new THREE.DodecahedronGeometry(.25+Math.random()*.55,1),mat(0x25352c,.05,.95,.02));rock.position.set(x,.2+Math.random()*.25,z);rock.rotation.set(Math.random()*2,Math.random()*2,Math.random()*2);rock.scale.y=.6+Math.random();rock.castShadow=true;scene.add(rock);
 }
 // Crystal grove perimeter
 for(let i=0;i<18;i++){const a=(i/18)*Math.PI*2+.15,r=20+Math.random()*5;const c=makeCrystal(i%2?0x53d9ff:0xa06bff,.9+Math.random()*.7);c.position.set(Math.cos(a)*r,.2,Math.sin(a)*r);c.rotation.y=Math.random()*6;c.children.forEach(m=>m.castShadow=true);scene.add(c);addPointLight(c,i%2?0x3bdcff:0x8d4dff,.5,5);}
 // Ancient pillars
 for(let i=0;i<8;i++){const a=i*Math.PI/4+.2,r=18.5;const g=new THREE.Group();const base=new THREE.Mesh(new THREE.CylinderGeometry(.8,1,1,8),mat(0x303b34,.05,.82));base.position.y=.5;g.add(base);const col=new THREE.Mesh(new THREE.CylinderGeometry(.42,.55,3.6,8),mat(0x4a5148,.05,.7));col.position.y=2.3;g.add(col);const cap=new THREE.Mesh(new THREE.ConeGeometry(.8,.55,8),mat(0x697267,.05,.65));cap.position.y=4.35;g.add(cap);g.position.set(Math.cos(a)*r,0,Math.sin(a)*r);g.rotation.y=-a;g.traverse(o=>{if(o.isMesh)o.castShadow=true;});scene.add(g);}
 // Stars / motes overhead
 for(let i=0;i<120;i++){const p=glowSphere(.025+Math.random()*.035,Math.random()>.5?0x5ad9ff:0xb88cff,2.5);p.position.set((Math.random()-.5)*70,8+Math.random()*20,(Math.random()-.5)*70);scene.add(p);}
 // Player: layered robe, hood, face, staff, gems
 playerMesh=new THREE.Group();
 const robe=new THREE.Mesh(new THREE.ConeGeometry(.92,1.55,10),mat(0x261b59,.65,.36,.22));robe.position.y=.78;robe.castShadow=true;playerMesh.add(robe);
 const belt=new THREE.Mesh(new THREE.TorusGeometry(.64,.07,8,24),mat(0xd6ae58,.25,.32,.45));belt.rotation.x=Math.PI/2;belt.position.y=.72;playerMesh.add(belt);
 const head=new THREE.Mesh(new THREE.SphereGeometry(.53,24,16),mat(0xf0c2a3,.05,.65,.03));head.position.y=1.65;head.castShadow=true;playerMesh.add(head);
 const hood=new THREE.Mesh(new THREE.SphereGeometry(.65,20,14,0,Math.PI*2,0,Math.PI*.7),mat(0x17102d,.8,.42,.18));hood.position.y=1.72;hood.castShadow=true;playerMesh.add(hood);
 const eyeL=glowSphere(.055,0x69eaff,3);eyeL.position.set(-.17,1.68,-.48);const eyeR=eyeL.clone();eyeR.position.x=.17;playerMesh.add(eyeL,eyeR);
 const staff=new THREE.Group();const staffWood=new THREE.Mesh(new THREE.CylinderGeometry(.065,.095,3.2,10),mat(0x5a351f,.05,.75,.08));staffWood.rotation.z=.12;staffWood.position.y=1.25;staff.add(staffWood);const staffGem=makeCrystal(0xb66cff,.42);staffGem.position.set(.16,2.9,0);staff.add(staffGem);addPointLight(staffGem,0x9b5cff,1.6,5);staff.position.x=.95;playerMesh.add(staff);
 const cloak=new THREE.Mesh(new THREE.ConeGeometry(1.02,1.55,10,1,true),new THREE.MeshStandardMaterial({color:0x3a2a8b,transparent:true,opacity:.52,roughness:.45,metalness:.08,side:THREE.DoubleSide}));cloak.position.y=.82;cloak.rotation.y=Math.PI;playerMesh.add(cloak);
 scene.add(playerMesh);
 playerRing=new THREE.Mesh(new THREE.TorusGeometry(1.2,.045,10,72),new THREE.MeshBasicMaterial({color:0x61e7ff,transparent:true,opacity:.72}));playerRing.rotation.x=Math.PI/2;scene.add(playerRing);
 // soft circles below player
 const aura=new THREE.Mesh(new THREE.CircleGeometry(1.55,48),new THREE.MeshBasicMaterial({color:0x4db9ff,transparent:true,opacity:.10,depthWrite:false}));aura.rotation.x=-Math.PI/2;aura.position.y=.025;playerMesh.add(aura);
 reset();
}

function spawnEnemy(initial=false){
 const names=wave<3?['Imp','Ghoul','Wraith']:wave<5?['Imp','Ghoul','Wraith','Demon']:['Imp','Ghoul','Wraith','Demon','Dragon'];
 const name=names[Math.floor(Math.random()*names.length)],d=enemyDefs[name], side=Math.floor(Math.random()*4), pad=2;
 let x=0,z=0;if(side===0){x=-worldSize/2-pad;z=(Math.random()-.5)*worldSize}else if(side===1){x=worldSize/2+pad;z=(Math.random()-.5)*worldSize}else if(side===2){x=(Math.random()-.5)*worldSize;z=-worldSize/2-pad}else{x=(Math.random()-.5)*worldSize;z=worldSize/2+pad}
 const s=1+(wave-1)*.12;const g=new THREE.Group();
 if(name==='Imp'){
   const body=new THREE.Mesh(new THREE.SphereGeometry(.58,18,14),mat(d.color,1.1,.42,.12));body.scale.set(1,.9,1);body.position.y=.6;g.add(body);
   const belly=new THREE.Mesh(new THREE.SphereGeometry(.34,14,10),mat(0xf06b52,.35,.6,.05));belly.position.set(0,.48,.42);g.add(belly);
   for(const sx of [-.2,.2]){const eye=glowSphere(.09,0xfff2a0,4);eye.position.set(sx,.73,.49);g.add(eye);}
   for(const sx of [-.45,.45]){const ear=new THREE.Mesh(new THREE.ConeGeometry(.16,.5,6),mat(0x8b1f34,.7,.55,.05));ear.position.set(sx,.95,.05);ear.rotation.z=sx*.6;g.add(ear);}
   for(const sx of [-.34,.34]){const leg=new THREE.Mesh(new THREE.CylinderGeometry(.09,.13,.55,7),mat(0x5a1d2a,.2));leg.position.set(sx,.17,0);g.add(leg);}
 }
 if(name==='Ghoul'){
   const body=new THREE.Mesh(new THREE.CapsuleGeometry(.7,.9,8,14),mat(d.color,.25,.82,.02));body.position.y=.9;body.castShadow=true;g.add(body);
   const head=new THREE.Mesh(new THREE.SphereGeometry(.58,18,14),mat(0x8fa45d,.15,.8,.02));head.position.y=1.85;g.add(head);
   for(const sx of [-.18,.18]){const eye=glowSphere(.075,0xd7ff80,2.5);eye.position.set(sx,1.92,.52);g.add(eye);}
   for(const sx of [-.72,.72]){const arm=new THREE.Mesh(new THREE.CapsuleGeometry(.14,.8,6,8),mat(0x466b4c,.1));arm.position.set(sx,.95,0);arm.rotation.z=sx*.35;g.add(arm);}
 }
 if(name==='Wraith'){
   const aura=new THREE.Mesh(new THREE.SphereGeometry(.82,24,16),new THREE.MeshStandardMaterial({color:d.color,transparent:true,opacity:.15,emissive:d.color,emissiveIntensity:2,roughness:.2,side:THREE.DoubleSide}));aura.position.y=1.25;g.add(aura);
   const body=new THREE.Mesh(new THREE.ConeGeometry(.72,1.9,14,1,true),new THREE.MeshStandardMaterial({color:d.color,transparent:true,opacity:.62,emissive:d.color,emissiveIntensity:1.6,roughness:.25,side:THREE.DoubleSide}));body.position.y=1.1;g.add(body);
   const face=new THREE.Mesh(new THREE.SphereGeometry(.48,16,12),new THREE.MeshBasicMaterial({color:0xc8b8ff,transparent:true,opacity:.42}));face.position.set(0,1.75,-.06);g.add(face);
   for(const sx of [-.16,.16]){const eye=glowSphere(.065,0xffffff,5);eye.position.set(sx,1.78,.39);g.add(eye);}
 }
 if(name==='Demon'){
   const body=new THREE.Mesh(new THREE.CapsuleGeometry(.72,1.05,8,12),mat(d.color,.55,.48,.16));body.position.y=1;g.add(body);
   const chest=new THREE.Mesh(new THREE.SphereGeometry(.78,18,12),mat(0x45131f,.35,.5,.2));chest.scale.set(1,.75,.75);chest.position.set(0,1.1,.25);g.add(chest);
   for(const sx of [-.6,.6]){const horn=new THREE.Mesh(new THREE.ConeGeometry(.2,.9,7),mat(0xe0a06d,.6,.4,.1));horn.position.set(sx,.2+1.75,.02);horn.rotation.z=sx*.5;g.add(horn);}
   const eyeL=glowSphere(.08,0xffdc74,4);eyeL.position.set(-.18,1.72,.58);const eyeR=eyeL.clone();eyeR.position.x=.18;g.add(eyeL,eyeR);
 }
 if(name==='Dragon'){
   const body=new THREE.Mesh(new THREE.SphereGeometry(1.35,24,18),mat(d.color,1.2,.42,.2));body.scale.set(1.45,.82,1.1);body.position.y=1.25;g.add(body);
   const neck=new THREE.Mesh(new THREE.CylinderGeometry(.45,.65,1.3,12),mat(0x2d6f31,.8,.48,.15));neck.position.set(0,1.95,-.6);neck.rotation.x=-.4;g.add(neck);
   const head=new THREE.Mesh(new THREE.CapsuleGeometry(.5,.8,6,10),mat(0x5ba14d,1,.45,.16));head.position.set(0,2.35,-1.12);head.rotation.x=Math.PI/2;g.add(head);
   for(const sx of [-1.25,1.25]){const wing=new THREE.Mesh(new THREE.ConeGeometry(1.1,2.6,5),mat(0x1b4b24,.55,.54,.1));wing.position.set(sx,2,.05);wing.rotation.z=sx>0?-.75:.75;wing.scale.y=1.2;g.add(wing);}
   for(const sx of [-.22,.22]){const eye=glowSphere(.11,0xd8ff72,5);eye.position.set(sx,2.48,-1.55);g.add(eye);}
   for(const sx of [-.6,.6]){const horn=new THREE.Mesh(new THREE.ConeGeometry(.12,.65,6),mat(0xe1c4a1,.25,.5,.12));horn.position.set(sx,2.75,-1.05);horn.rotation.z=sx*.3;g.add(horn);}
 }
 g.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true;}});g.position.set(x,.02,z);scene.add(g);
 enemies.push({name,x,z,mesh:g,hp:d.hp*s,maxHp:d.hp*s,speed:d.speed*(1+Math.min(.45,(wave-1)*.028)),damage:d.damage*(1+wave*.035),r:d.r,xp:d.xp,score:d.score,slow:1,hit:0,shoot:2+Math.random()*2,phase:Math.random()*6});
}
function spawnBoss(){if(boss)return;const dragon=wave%2===0;const maxHp=(dragon?4800:3900)+wave*420;const g=new THREE.Group();
 const core=new THREE.Mesh(new THREE.SphereGeometry(dragon?2.25:1.85,28,20),mat(dragon?0x2f8c45:0x761f70,1.5,.36,.22));core.scale.y=.74;g.add(core);
 const chest=new THREE.Mesh(new THREE.SphereGeometry(dragon?1.55:1.25,22,16),mat(dragon?0x5aa95b:0xb23c96,.55,.42,.18));chest.scale.set(1,.7,.7);chest.position.set(0,1.05,0);g.add(chest);
 for(const sx of [-1,1]){const wing=new THREE.Mesh(new THREE.ConeGeometry(dragon?1.8:1.6,dragon?4.2:3.8,5),mat(dragon?0x174d22:0x37133e,.9,.45,.12));wing.position.set(sx*(dragon?2.4:2.1),1.6,0);wing.rotation.z=sx>0?-.66:.66;g.add(wing);}
 for(const sx of [-.72,.72]){const eye=glowSphere(.18,dragon?0xd6ff71:0xff89e8,6);eye.position.set(sx,1.0,-1.72);g.add(eye);} 
 if(!dragon){for(const sx of [-.75,.75]){const h=new THREE.Mesh(new THREE.ConeGeometry(.22,.95,7),mat(0xc986b4,1,.4,.1));h.position.set(sx,2.55,.05);h.rotation.z=sx*.35;g.add(h);}}
 else {const snout=new THREE.Mesh(new THREE.CapsuleGeometry(.55,1.0,6,10),mat(0x61a95d,1,.4,.15));snout.rotation.x=Math.PI/2;snout.position.set(0,1.6,-1.9);g.add(snout);for(const sx of [-.28,.28]){const horn=new THREE.Mesh(new THREE.ConeGeometry(.14,.8,6),mat(0xe1c89e,.4,.48,.1));horn.position.set(sx,2.9,-1.1);horn.rotation.z=sx*.3;g.add(horn);}}
 const aura=new THREE.Mesh(new THREE.TorusGeometry(dragon?3.7:3.0,.08,10,72),new THREE.MeshBasicMaterial({color:dragon?0x6fff8b:0xff58c8,transparent:true,opacity:.32}));aura.rotation.x=Math.PI/2;aura.position.y=.05;g.add(aura);
 g.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true;}});g.position.set((Math.random()>.5?1:-1)*22,.4,(Math.random()>.5?1:-1)*22);scene.add(g);addPointLight(g,dragon?0x57ff75:0xff3bc9,2.6,14);boss={name:dragon?'Ancient Dragon':'Dread Lord',x:g.position.x,z:g.position.z,mesh:g,hp:maxHp,maxHp,speed:dragon?1.35:1.55,damage:dragon?38:33,r:dragon?2.3:2,xp:260,score:1800,phase:0,breath:1.2,orb:3.5};bannerTimer=3.4;}
function nearest(range=Infinity){return enemies.filter(e=>Math.hypot(player.x-e.x,player.z-e.z)<=range).sort((a,b)=>Math.hypot(player.x-a.x,player.z-a.z)-Math.hypot(player.x-b.x,player.z-b.z));}
function damageEnemy(e,n){if(!e||e.hp<=0)return;e.hp-=n;e.hit=.14;}
function damageBoss(n){if(!boss)return;boss.hp-=n;if(boss.hp<=0){score+=1500;xp+=200;kills++;particleBurst(boss.mesh.position,0xffe16b,90,.12,10);scene.remove(boss.mesh);boss=null;ringEffect(player.mesh?playerMesh.position:playerMesh.position,0xffe16b,5,1);}}
function hurt(n){if(shieldTimer>0)return;hp-=n;flashDamage();if(hp<=0){hp=0;gameOver=true;}}
function flashDamage(){document.body.classList.remove('hurt');void document.body.offsetWidth;document.body.classList.add('hurt');}
function levelUp(){while(xp>=xpNeed()){xp-=xpNeed();level++;hp=MAX_HP;mana=MAX_MANA;particleBurst(playerMesh.position,0xffe46d,70,.08,7);addText('LEVEL '+level,'#ffe46d');}}
function ready(s){if(mana<s.cost||cooldowns[s.id]>0)return false;mana-=s.cost;cooldowns[s.id]=s.cd;return true;}
function targetPoint(){const v=new THREE.Vector3((mouse.x/innerWidth)*2-1,-(mouse.y/innerHeight)*2+1,.5);v.unproject(camera);const dir=v.sub(camera.position).normalize();const t=-camera.position.y/dir.y;return camera.position.clone().add(dir.multiplyScalar(t));}
function spawnProjectile(kind,pos,dir,damage,speed,life,r){
 let mesh;
 if(kind==='fire'){mesh=new THREE.Mesh(new THREE.SphereGeometry(r*1.25,18,14),glowMat(0xff7b28,2.4));const core=new THREE.Mesh(new THREE.SphereGeometry(r*.62,14,10),glowMat(0xffe7a0,3));mesh.add(core);}
 else if(kind==='frost'){mesh=new THREE.Mesh(new THREE.OctahedronGeometry(r*1.45,1),glowMat(0x90ecff,2));mesh.rotation.y=.6;}
 else if(kind==='comet'){mesh=new THREE.Mesh(new THREE.SphereGeometry(r*1.4,18,14),glowMat(0xff55d8,2.8));mesh.add(new THREE.Mesh(new THREE.TorusGeometry(r*1.35,.035,8,24),new THREE.MeshBasicMaterial({color:0xffa5ef,transparent:true,opacity:.8})))}
 else {mesh=new THREE.Mesh(new THREE.SphereGeometry(r,14,12),glowMat(spells.find(s=>s.id===kind)?.color||0xffc766,1.8));}
 mesh.position.copy(pos);mesh.castShadow=true;scene.add(mesh);projectiles.push({kind,mesh,vel:dir.normalize().multiplyScalar(speed),damage,life,r});
}
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
function updateProjectiles(dt){for(let i=projectiles.length-1;i>=0;i--){const p=projectiles[i];p.life-=dt;p.mesh.position.addScaledVector(p.vel,dt);if(p.kind==='fire')particleBurst(p.mesh.position,Math.random()>.35?0xff7a20:0xffd060,2,.035,1.5);if(p.kind==='frost')particleBurst(p.mesh.position,0x9feaff,2,.028,1.0);if(p.kind==='comet')particleBurst(p.mesh.position,Math.random()>.4?0xff55cf:0x8f8cff,2,.04,2.0);
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
