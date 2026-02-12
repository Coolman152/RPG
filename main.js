(() => {
  const SAVE_KEY = "iso_rpg_tilemap_save_v3";

  // --- Tuning knobs ---
  const XP_CHOP = 25;
  const CHOP_TIME_MS = 900;
  const TREE_RESPAWN_MS = 6000;

  const TILE = 1.0;
  const LEVEL_H = 0.28;

  // Expanded map
  const MAP_W = 26;
  const MAP_H = 26;

  function defaultState() {
    return {
      player: { tx: 3, tz: 3, speedTilesPerSec: 4.2 },
      path: [],
      moveSeg: null,
      chopping: null, // { endAt }
      inv: { logs: 0, coins: 0 },
      skills: { woodcutting: { lvl: 1, xp: 0 } },
      world: {
        tree: {
          tx: 14, tz: 12,
          respawnAt: 0,
          stumpUntil: 0 // when > now, stump exists
        }
      }
    };
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return defaultState();
      const s = JSON.parse(raw);
      if (!s?.player) return defaultState();
      s.path ??= [];
      s.moveSeg ??= null;
      s.chopping ??= null;
      s.inv ??= { logs: 0, coins: 0 };
      s.skills ??= { woodcutting: { lvl: 1, xp: 0 } };
      s.world ??= { tree: { tx: 14, tz: 12, respawnAt: 0, stumpUntil: 0 } };
      s.world.tree ??= { tx: 14, tz: 12, respawnAt: 0, stumpUntil: 0 };
      return s;
    } catch {
      return defaultState();
    }
  }

  let state = loadState();
  function saveState() { localStorage.setItem(SAVE_KEY, JSON.stringify(state)); }
  setInterval(saveState, 5000);

  // XP curve
  function xpForLevel(lvl) {
    let total = 0;
    for (let i = 1; i < lvl; i++) total += Math.floor(i + 300 * Math.pow(2, i / 7));
    return Math.floor(total / 4);
  }
  function addXp(skillName, amount) {
    const sk = state.skills[skillName];
    sk.xp += amount;
    while (sk.lvl < 99 && sk.xp >= xpForLevel(sk.lvl + 1)) {
      sk.lvl++;
      state.inv.coins += 1;
    }
  }

  // UI
  const statsEl = document.getElementById("stats");
  const invEl = document.getElementById("inv");
  const msgEl = document.getElementById("msg");
  let msgUntil = 0;
  function setMsg(text, ms = 1200) { msgEl.textContent = text; msgUntil = performance.now() + ms; }
  function updateUI(extra = "") {
    const wc = state.skills.woodcutting;
    const nextXp = xpForLevel(wc.lvl + 1);
    statsEl.textContent = `Woodcutting: Lvl ${wc.lvl} (${wc.xp} XP) — Next: ${wc.lvl < 99 ? nextXp : "MAX"}${extra ? " — " + extra : ""}`;
    invEl.textContent = `Inventory: Logs ${state.inv.logs} | Coins ${state.inv.coins}`;
    if (performance.now() > msgUntil) msgEl.textContent = "";
  }

  // Tilemap generation (procedural)
  const tileType = Array.from({ length: MAP_H }, () => Array(MAP_W).fill(0)); // 0 grass,1 stone,2 water
  const heightMap = Array.from({ length: MAP_H }, () => Array(MAP_W).fill(0));
  const clamp = (v,a,b)=>Math.max(a,Math.min(b,v));

  function genMap() {
    for (let z = 0; z < MAP_H; z++) for (let x = 0; x < MAP_W; x++) {
      const cx = MAP_W * 0.46, cz = MAP_H * 0.46;
      const dx = (x - cx) / (MAP_W * 0.55), dz = (z - cz) / (MAP_H * 0.55);
      const d = Math.sqrt(dx*dx + dz*dz);
      const hill = Math.max(0, 1.0 - d);
      let h = clamp(Math.floor(hill * 6), 0, 6);

      // Lake
      const lx = MAP_W * 0.72, lz = MAP_H * 0.36;
      const ldx = (x - lx) / 5.0, ldz = (z - lz) / 4.0;
      const lake = (ldx*ldx + ldz*ldz) < 1.0;

      if (lake) { tileType[z][x]=2; heightMap[z][x]=0; }
      else { heightMap[z][x]=h; tileType[z][x]=(h>=5)?1:0; }
    }

    // Borders
    for (let x=0;x<MAP_W;x++){ tileType[0][x]=1; tileType[MAP_H-1][x]=1; heightMap[0][x]=0; heightMap[MAP_H-1][x]=0; }
    for (let z=0;z<MAP_H;z++){ tileType[z][0]=1; tileType[z][MAP_W-1]=1; heightMap[z][0]=0; heightMap[z][MAP_W-1]=0; }
  }
  genMap();

  const inBounds=(tx,tz)=>tx>=0&&tz>=0&&tx<MAP_W&&tz<MAP_H;
  const tileY=(tx,tz)=>inBounds(tx,tz)? heightMap[tz][tx]*LEVEL_H : 0;
  const tileToWorld=(tx,tz)=>({ x:(tx-MAP_W/2+0.5)*TILE, z:(tz-MAP_H/2+0.5)*TILE });

  // Tree / Stump availability
  function treeAlive(now=performance.now()) { return now >= state.world.tree.respawnAt; }
  function stumpAlive(now=performance.now()) { return now < state.world.tree.stumpUntil; }

  function isSolid(tx,tz){
    if(!inBounds(tx,tz)) return true;
    if(tileType[tz][tx]===2) return true; // water
    // tree tile solid if tree OR stump exists
    if(tx===state.world.tree.tx && tz===state.world.tree.tz && (treeAlive() || stumpAlive())) return true;
    return false;
  }

  // Ensure tree isn't on water
  function validateTreePos(){
    const t=state.world.tree;
    if(inBounds(t.tx,t.tz) && tileType[t.tz][t.tx]!==2) return;
    for(let z=0;z<MAP_H;z++) for(let x=0;x<MAP_W;x++){
      if(tileType[z][x]!==2){ t.tx=x; t.tz=z; return; }
    }
  }
  validateTreePos();

  // Ensure spawn isn't solid
  function fixSpawn(){
    if(!isSolid(state.player.tx, state.player.tz)) return;
    for(let z=0;z<MAP_H;z++) for(let x=0;x<MAP_W;x++){
      if(!isSolid(x,z)){ state.player.tx=x; state.player.tz=z; return; }
    }
  }
  fixSpawn();

  // Three.js
  const canvas = document.getElementById("game");
  const renderer = new THREE.WebGLRenderer({ canvas, antialias:true, alpha:false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,2));
  renderer.setSize(window.innerWidth, window.innerHeight, false);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0f1724);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x223344, 0.95));
  const dir = new THREE.DirectionalLight(0xffffff, 0.9);
  dir.position.set(12, 16, 10);
  scene.add(dir);

  const ISO_PITCH = Math.atan(Math.sqrt(1/2));
  const cam = new THREE.OrthographicCamera(-10,10,10,-10,0.1,500);

  function resize(){
    const w=window.innerWidth,h=window.innerHeight;
    renderer.setSize(w,h,false);
    const aspect=w/h, zoom=1.08, viewSize=12; // a bit wider for larger map
    cam.left=-viewSize*aspect/zoom; cam.right=viewSize*aspect/zoom;
    cam.top=viewSize/zoom; cam.bottom=-viewSize/zoom;
    cam.updateProjectionMatrix();
  }
  window.addEventListener("resize", resize);
  resize();

  // Materials
  const mats = {
    grass: new THREE.MeshStandardMaterial({ color:0x1f6f3a, roughness:1, metalness:0 }),
    stone: new THREE.MeshStandardMaterial({ color:0x556175, roughness:1, metalness:0 }),
    water: new THREE.MeshStandardMaterial({ color:0x1a4c7a, roughness:0.9, metalness:0.05, transparent:true, opacity:0.96 }),
    side:  new THREE.MeshStandardMaterial({ color:0x162032, roughness:1, metalness:0 }),
    stump: new THREE.MeshStandardMaterial({ color:0x6b4a2e, roughness:1, metalness:0 }),
  };

  const tileTopGeo = new THREE.BoxGeometry(TILE,0.08,TILE);
  const tileSideGeo = new THREE.BoxGeometry(TILE,LEVEL_H,TILE);
  const typeToMat=(t)=> t===1?mats.stone : t===2?mats.water : mats.grass;

  const tileGroup = new THREE.Group();
  scene.add(tileGroup);
  const pickables = []; // for raycasting

  for(let tz=0;tz<MAP_H;tz++) for(let tx=0;tx<MAP_W;tx++){
    const t=tileType[tz][tx];
    const y=tileY(tx,tz);
    const pos=tileToWorld(tx,tz);
    const levels=heightMap[tz][tx];

    for(let i=0;i<levels;i++){
      const side=new THREE.Mesh(tileSideGeo, mats.side);
      side.position.set(pos.x, i*LEVEL_H + LEVEL_H/2 - 0.04, pos.z);
      tileGroup.add(side);
    }
    const top=new THREE.Mesh(tileTopGeo, typeToMat(t));
    top.position.set(pos.x, y+0.02, pos.z);
    top.userData={ tx, tz, kind:"tile" };
    tileGroup.add(top);
    pickables.push(top);
  }

  // Marker
  const marker = new THREE.Mesh(
    new THREE.RingGeometry(0.14,0.26,28),
    new THREE.MeshBasicMaterial({ color:0xffffff, transparent:true, opacity:0.7, side:THREE.DoubleSide })
  );
  marker.rotation.x=-Math.PI/2;
  marker.visible=false;
  scene.add(marker);

  // Tree mesh
  const tree = new THREE.Group();
  const foliageMat = new THREE.MeshStandardMaterial({ color:0x2f8a3a, roughness:1, metalness:0 });
  const trunkMat = new THREE.MeshStandardMaterial({ color:0x7a4a2a, roughness:1, metalness:0 });
  const foliage = new THREE.Mesh(new THREE.SphereGeometry(0.55,18,14), foliageMat); foliage.position.y=1.15;
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.15,0.2,0.9,14), trunkMat); trunk.position.y=0.45;
  tree.add(foliage,trunk);
  tree.userData={ kind:"tree" };
  scene.add(tree);

  // Stump mesh (solid)
  const stump = new THREE.Mesh(new THREE.CylinderGeometry(0.26,0.30,0.28,16), mats.stump);
  stump.userData={ kind:"stump" };
  scene.add(stump);

  function syncTreeAndStump() {
    const now = performance.now();
    const t = state.world.tree;
    const pos = tileToWorld(t.tx, t.tz);
    const y = tileY(t.tx, t.tz);

    const alive = treeAlive(now);
    const stumpOn = stumpAlive(now);

    tree.visible = alive;
    stump.visible = (!alive) && stumpOn;

    tree.position.set(pos.x, y, pos.z);
    stump.position.set(pos.x, y + 0.12, pos.z);
  }
  syncTreeAndStump();

  // Player mesh
  const player = new THREE.Group();
  const bodyMat = new THREE.MeshStandardMaterial({ color:0xd7e1ff, roughness:1, metalness:0 });
  const shadowMat = new THREE.MeshBasicMaterial({ color:0x000000, transparent:true, opacity:0.18 });
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.25,0.35,6,12), bodyMat); body.position.y=0.6;
  const shadow = new THREE.Mesh(new THREE.CircleGeometry(0.35,18), shadowMat); shadow.rotation.x=-Math.PI/2; shadow.position.y=0.02;
  player.add(body,shadow);
  scene.add(player);

  function placePlayerAtTile(tx,tz){
    const p=tileToWorld(tx,tz);
    player.position.set(p.x, tileY(tx,tz), p.z);
  }
  placePlayerAtTile(state.player.tx, state.player.tz);

  // Floating XP pop-up (sprite generated via canvas)
  const popupGroup = new THREE.Group();
  scene.add(popupGroup);

  function makePopupSprite(text) {
    const c = document.createElement("canvas");
    const ctx = c.getContext("2d");
    const w = 256, h = 128;
    c.width = w; c.height = h;

    ctx.clearRect(0,0,w,h);

    // subtle shadow
    ctx.fillStyle = "rgba(0,0,0,0.55)";
    ctx.font = "bold 34px system-ui, -apple-system, Segoe UI, Roboto, Arial";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";

    // draw a tiny "tree" icon (simple)
    // trunk
    ctx.fillRect(22, 62, 12, 26);
    // canopy
    ctx.beginPath();
    ctx.arc(28, 52, 20, 0, Math.PI*2);
    ctx.fill();

    // text
    ctx.fillText(text, 58, 64);

    // foreground in light color
    ctx.fillStyle = "rgba(255,255,255,0.95)";
    // icon recolor
    ctx.fillRect(22, 62, 12, 26);
    ctx.beginPath(); ctx.arc(28, 52, 20, 0, Math.PI*2); ctx.fill();
    ctx.fillText(text, 58, 64);

    const tex = new THREE.CanvasTexture(c);
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.generateMipmaps = false;

    const mat = new THREE.SpriteMaterial({ map: tex, transparent: true });
    const spr = new THREE.Sprite(mat);
    spr.scale.set(2.4, 1.2, 1);
    return spr;
  }

  function spawnXpPopup(amount) {
    const spr = makePopupSprite(`+${amount} XP`);
    spr.position.copy(player.position);
    spr.position.y += 1.8;
    popupGroup.add(spr);

    const start = performance.now();
    const life = 1100;

    spr.userData = { start, life };
  }

  function updatePopups(now) {
    for (let i = popupGroup.children.length - 1; i >= 0; i--) {
      const spr = popupGroup.children[i];
      const t = (now - spr.userData.start) / spr.userData.life;
      if (t >= 1) {
        popupGroup.remove(spr);
        if (spr.material?.map) spr.material.map.dispose();
        if (spr.material) spr.material.dispose();
        continue;
      }
      // float up + fade out
      spr.position.y += 0.0025 * (1 + (1 - t) * 2);
      spr.material.opacity = 1 - t;
    }
  }

  // Raycasting
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();

  function pickFromEvent(ev){
    const rect = renderer.domElement.getBoundingClientRect();
    const x=(ev.clientX-rect.left)/rect.width;
    const y=(ev.clientY-rect.top)/rect.height;
    pointer.x = x*2-1;
    pointer.y = -(y*2-1);
    raycaster.setFromCamera(pointer, cam);

    // include tree (when visible) so you can tap it
    const extras = [];
    if (tree.visible) extras.push(tree);
    const hits = raycaster.intersectObjects(pickables.concat(extras), true);
    if(!hits.length) return null;

    for(const h of hits){
      if(h.object && (h.object===tree || h.object.parent===tree)) {
        return { kind:"tree", tx: state.world.tree.tx, tz: state.world.tree.tz };
      }
    }
    const hit=hits[0].object;
    if(hit.userData?.kind==="tile") return { kind:"tile", tx:hit.userData.tx, tz:hit.userData.tz };
    return null;
  }

  // A*
  const key=(tx,tz)=>tx+","+tz;
  const heuristic=(a,b)=>Math.abs(a.tx-b.tx)+Math.abs(a.tz-b.tz);
  const neighbors=(n)=>[
    {tx:n.tx+1,tz:n.tz},{tx:n.tx-1,tz:n.tz},{tx:n.tx,tz:n.tz+1},{tx:n.tx,tz:n.tz-1}
  ].filter(p=>inBounds(p.tx,p.tz)&&!isSolid(p.tx,p.tz));
  const moveCost=(a,b)=>1+Math.max(0, heightMap[b.tz][b.tx]-heightMap[a.tz][a.tx])*0.5;

  function astar(start,goal){
    const sK=key(start.tx,start.tz), gK=key(goal.tx,goal.tz);
    const open=new Map([[sK,start]]);
    const came=new Map();
    const gScore=new Map([[sK,0]]);
    const fScore=new Map([[sK,heuristic(start,goal)]]);

    while(open.size){
      let curK=null, cur=null, best=Infinity;
      for(const [k,n] of open){
        const f=fScore.get(k)??Infinity;
        if(f<best){ best=f; curK=k; cur=n; }
      }
      if(curK===gK){
        const path=[];
        let ck=curK;
        while(ck!==sK){
          const [tx,tz]=ck.split(",").map(Number);
          path.push({tx,tz});
          ck=came.get(ck);
          if(!ck) break;
        }
        path.reverse();
        return path;
      }
      open.delete(curK);
      for(const nb of neighbors(cur)){
        const nk=key(nb.tx,nb.tz);
        const tentative=(gScore.get(curK)??Infinity)+moveCost(cur,nb);
        if(tentative < (gScore.get(nk)??Infinity)){
          came.set(nk,curK);
          gScore.set(nk,tentative);
          fScore.set(nk,tentative+heuristic(nb,goal));
          if(!open.has(nk)) open.set(nk,nb);
        }
      }
    }
    return [];
  }

  function bestAdjacentStandTile(objTx,objTz){
    const opts=[
      {tx:objTx+1,tz:objTz},{tx:objTx-1,tz:objTz},{tx:objTx,tz:objTz+1},{tx:objTx,tz:objTz-1},
    ].filter(p=>inBounds(p.tx,p.tz)&&!isSolid(p.tx,p.tz));
    if(!opts.length) return null;
    const px=state.player.tx, pz=state.player.tz;
    opts.sort((a,b)=> (Math.abs(a.tx-px)+Math.abs(a.tz-pz)) - (Math.abs(b.tx-px)+Math.abs(b.tz-pz)) );
    return opts[0];
  }

  function setMoveGoal(goalTx,goalTz){
    if(isSolid(goalTx,goalTz)){ setMsg("Can't walk there"); return; }
    const start={tx:state.player.tx,tz:state.player.tz};
    const goal={tx:goalTx,tz:goalTz};
    const path=astar(start,goal);
    if(!path.length){ setMsg("No path"); return; }
    state.path=path; state.moveSeg=null;
    marker.visible=true;
    const wp=tileToWorld(goalTx,goalTz);
    marker.position.set(wp.x, tileY(goalTx,goalTz)+0.03, wp.z);
  }

  renderer.domElement.addEventListener("pointerdown",(ev)=>{
    const hit=pickFromEvent(ev);
    if(!hit) return;
    if(state.chopping){ setMsg("Busy..."); return; }

    if(hit.kind==="tree" && treeAlive()){
      const stand=bestAdjacentStandTile(hit.tx,hit.tz);
      if(!stand){ setMsg("Can't reach tree"); return; }
      setMoveGoal(stand.tx, stand.tz);
      setMsg("Walk to tree");
      return;
    }
    if(hit.kind==="tile"){
      if(isSolid(hit.tx, hit.tz)){ setMsg("Can't walk there"); return; }
      setMoveGoal(hit.tx, hit.tz);
    }
  });

  window.addEventListener("keydown",(e)=>{
    const k=e.key.toLowerCase();
    if(k==="e") tryChopTree();
    if(k==="r"){
      localStorage.removeItem(SAVE_KEY);
      state=defaultState();
      genMap(); validateTreePos(); fixSpawn();
      state.path=[]; state.moveSeg=null; state.chopping=null;
      marker.visible=false;
      placePlayerAtTile(state.player.tx,state.player.tz);
      syncTreeAndStump(); updateUI("Reset"); setMsg("Reset");
    }
  });

  function adjacentToTree(){
    const pTx=state.player.tx, pTz=state.player.tz;
    const tTx=state.world.tree.tx, tTz=state.world.tree.tz;
    return (Math.abs(pTx-tTx)+Math.abs(pTz-tTz))===1;
  }

  function tryChopTree(){
    if(!treeAlive()){ setMsg("Tree is gone"); return; }
    if(state.chopping) return;
    if(!adjacentToTree()){ setMsg("Stand next to the tree"); return; }
    state.path=[]; state.moveSeg=null;
    state.chopping={ endAt: performance.now()+CHOP_TIME_MS };
    setMsg("Chopping...");
  }

  function finishChop(){
    state.chopping=null;

    // rewards
    state.inv.logs += 1;
    addXp("woodcutting", XP_CHOP);
    if(Math.random()<0.35) state.inv.coins += 1;

    // popup
    spawnXpPopup(XP_CHOP);

    // Tree -> stump, then respawn
    const now = performance.now();
    state.world.tree.respawnAt = now + TREE_RESPAWN_MS;
    state.world.tree.stumpUntil = state.world.tree.respawnAt; // stump lasts until tree respawns

    syncTreeAndStump();
    saveState();
    setMsg("You get some logs");
  }

  // Movement (segment-based, smooth height)
  function startNextSegment(){
    if(!state.path.length) return;
    const next=state.path[0];
    state.moveSeg={ from:{tx:state.player.tx,tz:state.player.tz}, to:{tx:next.tx,tz:next.tz}, t:0 };
  }

  function stepMovement(dt){
    if(state.chopping) return;
    if(!state.moveSeg){
      if(!state.path.length) return;
      startNextSegment();
      if(!state.moveSeg) return;
    }
    const seg=state.moveSeg;
    seg.t += state.player.speedTilesPerSec * dt;
    const t=Math.min(1, seg.t);

    const a=tileToWorld(seg.from.tx, seg.from.tz);
    const b=tileToWorld(seg.to.tx, seg.to.tz);
    const ay=tileY(seg.from.tx, seg.from.tz);
    const by=tileY(seg.to.tx, seg.to.tz);

    player.position.x = a.x + (b.x-a.x)*t;
    player.position.z = a.z + (b.z-a.z)*t;
    player.position.y = ay + (by-ay)*t;

    const dx=(b.x-a.x), dz=(b.z-a.z);
    if(Math.abs(dx)+Math.abs(dz)>1e-6) player.rotation.y = Math.atan2(dx,dz);

    if(seg.t>=1){
      state.player.tx=seg.to.tx; state.player.tz=seg.to.tz;
      state.path.shift();
      if(!state.path.length){ state.moveSeg=null; marker.visible=false; }
      else state.moveSeg=null;
    }
  }

  // Camera follow
  function updateCamera(){
    const pos=player.position;
    const follow=new THREE.Vector3(pos.x,pos.y,pos.z);
    const offset=new THREE.Vector3(13,13,13);
    cam.position.copy(follow).add(offset);
    cam.rotation.order="YXZ";
    cam.rotation.y=Math.PI/4;
    cam.rotation.x=-ISO_PITCH;
    cam.lookAt(follow);
  }

  // Chop animation
  const baseBodyY = body.position.y;
  function animateChop(now){
    if(!state.chopping){ body.position.y=baseBodyY; return; }
    const phase=(state.chopping.endAt-now)/CHOP_TIME_MS;
    const s=Math.max(0,Math.min(1,1-phase));
    body.position.y = baseBodyY + Math.sin(s*Math.PI*4)*0.03;
    player.rotation.y += 0.06;
  }

  let last=performance.now();
  function tick(now){
    const dt=Math.min(0.033,(now-last)/1000);
    last=now;

    if(state.chopping && now>=state.chopping.endAt) finishChop();

    stepMovement(dt);
    animateChop(now);
    syncTreeAndStump();
    updatePopups(now);
    updateCamera();
    updateUI();
    renderer.render(scene, cam);

    requestAnimationFrame(tick);
  }

  updateUI();
  requestAnimationFrame(tick);
})();