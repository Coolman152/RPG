(() => {
  const XP_CHOP = 25;
  const CHOP_TIME_MS = 900;
  const TREE_RESPAWN_MS = 6000;

  const TILE = 1.0;
  const LEVEL_H = 0.28;

  const OW_W = 34;
  const OW_H = 34;

  const IN_W = 10;
  const IN_H = 10;

  const SAVE_KEY = "iso_rpg_village_save_v4";

  function defaultState() {
    return {
      map: "spawn_inn",
      player: { tx: 5, tz: 7, speedTilesPerSec: 4.2 },
      path: [],
      moveSeg: null,
      chopping: null,
      pendingDoor: null,
      inv: { logs: 0, coins: 0 },
      skills: { woodcutting: { lvl: 1, xp: 0 } },
      world: {
        trees: [
          { id: "t1", tx: 22, tz: 20, respawnAt: 0, stumpUntil: 0 },
          { id: "t2", tx: 25, tz: 23, respawnAt: 0, stumpUntil: 0 },
          { id: "t3", tx: 28, tz: 19, respawnAt: 0, stumpUntil: 0 },
          { id: "t4", tx: 18, tz: 26, respawnAt: 0, stumpUntil: 0 },
          { id: "t5", tx: 10, tz: 28, respawnAt: 0, stumpUntil: 0 },
        ]
      }
    };
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return defaultState();
      const s = JSON.parse(raw);
      if (!s?.player) return defaultState();
      s.map ??= "spawn_inn";
      s.path ??= [];
      s.moveSeg ??= null;
      s.chopping ??= null;
      s.pendingDoor ??= null;
      s.inv ??= { logs: 0, coins: 0 };
      s.skills ??= { woodcutting: { lvl: 1, xp: 0 } };
      s.world ??= { trees: [] };
      s.world.trees ??= [];
      return s;
    } catch {
      return defaultState();
    }
  }

  let state = loadState();
  function saveState() { localStorage.setItem(SAVE_KEY, JSON.stringify(state)); }
  setInterval(saveState, 5000);

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

  const statsEl = document.getElementById("stats");
  const invEl = document.getElementById("inv");
  const msgEl = document.getElementById("msg");
  let msgUntil = 0;
  function setMsg(text, ms = 1200) { msgEl.textContent = text; msgUntil = performance.now() + ms; }
  function updateUI(extra = "") {
    const wc = state.skills.woodcutting;
    const nextXp = xpForLevel(wc.lvl + 1);
    statsEl.textContent = `Woodcutting: Lvl ${wc.lvl} (${wc.xp} XP) — Next: ${wc.lvl < 99 ? nextXp : "MAX"}${extra ? " — " + extra : ""}`;
    invEl.textContent = `Inventory: Logs ${state.inv.logs} | Coins ${state.inv.coins} • Area: ${state.map}`;
    if (performance.now() > msgUntil) msgEl.textContent = "";
  }

  // Maps
  function makeMap(w, h) {
    return {
      w, h,
      tileType: Array.from({ length: h }, () => Array(w).fill(0)),
      heightMap: Array.from({ length: h }, () => Array(w).fill(0)),
      structures: [],
      doors: [],
      bushes: [],
    };
  }
  const clamp = (v,a,b)=>Math.max(a,Math.min(b,v));
  const inBounds = (m, tx, tz)=>tx>=0&&tz>=0&&tx<m.w&&tz<m.h;
  const tileY = (m, tx, tz)=>inBounds(m,tx,tz)? m.heightMap[tz][tx]*LEVEL_H : 0;
  const tileToWorld = (m, tx, tz)=>({ x:(tx-m.w/2+0.5)*TILE, z:(tz-m.h/2+0.5)*TILE });

  const overworld = makeMap(OW_W, OW_H);

  function genOverworld() {
    const m = overworld;

    for (let z = 0; z < m.h; z++) for (let x = 0; x < m.w; x++) {
      const cx = m.w * 0.46, cz = m.h * 0.46;
      const dx = (x - cx) / (m.w * 0.65), dz = (z - cz) / (m.h * 0.65);
      const d = Math.sqrt(dx*dx + dz*dz);
      const hill = Math.max(0, 1.0 - d);
      let h = clamp(Math.floor(hill * 4), 0, 4);

      const lx = m.w * 0.78, lz = m.h * 0.32;
      const ldx = (x - lx) / 6.0, ldz = (z - lz) / 5.0;
      const lake = (ldx*ldx + ldz*ldz) < 1.0;

      if (lake) { m.tileType[z][x] = 2; m.heightMap[z][x] = 0; }
      else {
        m.heightMap[z][x] = h;
        m.tileType[z][x] = (h >= 4) ? 1 : 0;
      }
    }

    for (let x = 0; x < m.w; x++) { m.tileType[0][x]=1; m.tileType[m.h-1][x]=1; m.heightMap[0][x]=0; m.heightMap[m.h-1][x]=0; }
    for (let z = 0; z < m.h; z++) { m.tileType[z][0]=1; m.tileType[z][m.w-1]=1; m.heightMap[z][0]=0; m.heightMap[z][m.w-1]=0; }

    const villageCenter = { x: 12, z: 12 };
    for (let z = villageCenter.z-6; z <= villageCenter.z+6; z++) {
      for (let x = villageCenter.x-6; x <= villageCenter.x+6; x++) {
        if (!inBounds(m,x,z)) continue;
        if (m.tileType[z][x] === 2) m.tileType[z][x] = 0;
        m.heightMap[z][x] = 1;
        m.tileType[z][x] = 0;
      }
    }

    function setRoad(x,z){
      if(!inBounds(m,x,z)) return;
      m.tileType[z][x] = 3;
      m.heightMap[z][x] = 1;
    }
    for (let x = 6; x <= 18; x++) setRoad(x, 12);
    for (let z = 7; z <= 18; z++) setRoad(12, z);
    for (let x = 18; x < m.w-1; x++) setRoad(x, 12);
    for (let z = 18; z < 26; z++) setRoad(12, z);
    for (let x = 12; x < 20; x++) setRoad(x, 26);

    m.structures = [];
    m.doors = [];
    function addHouse(id, x0, z0, w, d, doorTx, doorTz, interiorId) {
      m.structures.push({ id, x0, z0, w, d, doorTx, doorTz });
      m.doors.push({
        id: "door_" + id,
        kind: "enter",
        tx: doorTx, tz: doorTz,
        fromMap: "overworld",
        toMap: interiorId,
        returnTx: doorTx,
        returnTz: doorTz + 1
      });
    }

    addHouse("inn", 10, 9, 5, 4, 12, 13, "spawn_inn");
    addHouse("house_1", 6, 9, 4, 3, 8, 12, "house_1");
    addHouse("house_2", 14, 9, 4, 3, 16, 12, "house_2");
    addHouse("house_3", 7, 14, 4, 3, 9, 17, "house_3");
    addHouse("house_4", 14, 14, 4, 3, 16, 17, "house_4");

    m.bushes = [
      { tx: 9, tz: 10 }, { tx: 15, tz: 10 }, { tx: 10, tz: 16 }, { tx: 14, tz: 16 },
      { tx: 6, tz: 13 }, { tx: 18, tz: 13 }
    ];
  }

  genOverworld();

  // Interiors
  const interiors = {};
  function genInterior(id, title) {
    const m = makeMap(IN_W, IN_H);
    for (let z=0; z<m.h; z++) for (let x=0; x<m.w; x++) {
      m.tileType[z][x] = 4;
      m.heightMap[z][x] = 0;
    }
    for (let x=0; x<m.w; x++) { m.tileType[0][x]=1; m.tileType[m.h-1][x]=1; }
    for (let z=0; z<m.h; z++) { m.tileType[z][0]=1; m.tileType[z][m.w-1]=1; }

    m.structures = [
      { id: id+"_table", x0: 3, z0: 3, w: 2, d: 1, doorTx: -999, doorTz: -999 },
    ];

    const doorTx = Math.floor(m.w/2);
    const doorTz = m.h - 2;
    m.doors = [{
      id: "exit_"+id,
      kind: "exit",
      tx: doorTx, tz: doorTz,
      fromMap: id,
      toMap: "overworld",
      returnTx: null, returnTz: null
    }];

    m.title = title;
    interiors[id] = m;
  }

  ["spawn_inn","house_1","house_2","house_3","house_4"].forEach((id, idx)=>genInterior(id, id.replace("_"," ").toUpperCase()));
  function linkInteriorExits() {
    for (const d of overworld.doors) {
      const interior = interiors[d.toMap];
      if (!interior) continue;
      const exitDoor = interior.doors.find(x => x.kind === "exit");
      if (exitDoor) { exitDoor.returnTx = d.returnTx; exitDoor.returnTz = d.returnTz; }
    }
  }
  linkInteriorExits();

  function getMap() { return state.map === "overworld" ? overworld : (interiors[state.map] || overworld); }

  // solids
  function treeAlive(t, now=performance.now()) { return now >= t.respawnAt; }
  function stumpAlive(t, now=performance.now()) { return now < t.stumpUntil; }

  function isStructureSolid(m, tx, tz) {
    for (const s of m.structures) {
      if (tx >= s.x0 && tx < s.x0 + s.w && tz >= s.z0 && tz < s.z0 + s.d) {
        if (tx === s.doorTx && tz === s.doorTz) return false;
        return true;
      }
    }
    return false;
  }

  function isSolid(m, tx, tz) {
    if (!inBounds(m, tx, tz)) return true;
    const tt = m.tileType[tz][tx];
    if (tt === 2) return true;
    if (tt === 1 && state.map !== "overworld") return true;
    if (isStructureSolid(m, tx, tz)) return true;
    if (state.map === "overworld") {
      for (const tr of state.world.trees) {
        if (tr.tx === tx && tr.tz === tz && (treeAlive(tr) || stumpAlive(tr))) return true;
      }
    }
    return false;
  }

  function findDoorAt(m, tx, tz) { return m.doors.find(d => d.tx === tx && d.tz === tz) || null; }

  // Three.js
  const canvas = document.getElementById("game");
  const renderer = new THREE.WebGLRenderer({ canvas, antialias:true, alpha:false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,2));
  renderer.setSize(window.innerWidth, window.innerHeight, false);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0f1724);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x223344, 0.95));
  const dir = new THREE.DirectionalLight(0xffffff, 0.9);
  dir.position.set(14, 18, 12);
  scene.add(dir);

  const ISO_PITCH = Math.atan(Math.sqrt(1/2));
  const cam = new THREE.OrthographicCamera(-10,10,10,-10,0.1,800);

  function resize(){
    const w=window.innerWidth,h=window.innerHeight;
    renderer.setSize(w,h,false);
    const aspect=w/h, zoom=1.06, viewSize=13;
    cam.left=-viewSize*aspect/zoom; cam.right=viewSize*aspect/zoom;
    cam.top=viewSize/zoom; cam.bottom=-viewSize/zoom;
    cam.updateProjectionMatrix();
  }
  window.addEventListener("resize", resize);
  resize();

  const mats = {
    grass: new THREE.MeshStandardMaterial({ color:0x1f6f3a, roughness:1, metalness:0 }),
    stone: new THREE.MeshStandardMaterial({ color:0x556175, roughness:1, metalness:0 }),
    water: new THREE.MeshStandardMaterial({ color:0x1a4c7a, roughness:0.9, metalness:0.05, transparent:true, opacity:0.96 }),
    side:  new THREE.MeshStandardMaterial({ color:0x162032, roughness:1, metalness:0 }),
    road:  new THREE.MeshStandardMaterial({ color:0x3a2f26, roughness:1, metalness:0 }),
    floor: new THREE.MeshStandardMaterial({ color:0x2a3647, roughness:1, metalness:0 }),
    stump: new THREE.MeshStandardMaterial({ color:0x6b4a2e, roughness:1, metalness:0 }),
    house: new THREE.MeshStandardMaterial({ color:0x3b4254, roughness:1, metalness:0 }),
    roof:  new THREE.MeshStandardMaterial({ color:0x5b2f2f, roughness:1, metalness:0 }),
    door:  new THREE.MeshStandardMaterial({ color:0x8a5a2a, roughness:1, metalness:0 }),
    bush:  new THREE.MeshStandardMaterial({ color:0x2b7a3a, roughness:1, metalness:0 }),
  };

  const tileTopGeo = new THREE.BoxGeometry(TILE,0.08,TILE);
  const tileSideGeo = new THREE.BoxGeometry(TILE,LEVEL_H,TILE);

  function matForTileType(tt) {
    if (tt === 1) return mats.stone;
    if (tt === 2) return mats.water;
    if (tt === 3) return mats.road;
    if (tt === 4) return mats.floor;
    return mats.grass;
  }

  const worldGroup = new THREE.Group();
  scene.add(worldGroup);
  const tileGroup = new THREE.Group();
  const decoGroup = new THREE.Group();
  const structureGroup = new THREE.Group();
  const resourceGroup = new THREE.Group();
  worldGroup.add(tileGroup, structureGroup, resourceGroup, decoGroup);

  let pickables = [];
  let doorPickables = [];
  let treePickables = [];
  let stumpMeshes = new Map();

  const marker = new THREE.Mesh(
    new THREE.RingGeometry(0.14,0.26,28),
    new THREE.MeshBasicMaterial({ color:0xffffff, transparent:true, opacity:0.7, side:THREE.DoubleSide })
  );
  marker.rotation.x=-Math.PI/2;
  marker.visible=false;
  scene.add(marker);

  const player = new THREE.Group();
  const bodyMat = new THREE.MeshStandardMaterial({ color:0xd7e1ff, roughness:1, metalness:0 });
  const shadowMat = new THREE.MeshBasicMaterial({ color:0x000000, transparent:true, opacity:0.18 });
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.25,0.35,6,12), bodyMat); body.position.y=0.6;
  const shadow = new THREE.Mesh(new THREE.CircleGeometry(0.35,18), shadowMat); shadow.rotation.x=-Math.PI/2; shadow.position.y=0.02;
  player.add(body,shadow);
  scene.add(player);

  const popupGroup = new THREE.Group();
  scene.add(popupGroup);

  function makePopupSprite(text) {
    const c = document.createElement("canvas");
    const ctx = c.getContext("2d");
    c.width = 256; c.height = 128;
    ctx.font = "bold 34px system-ui, -apple-system, Segoe UI, Roboto, Arial";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";

    ctx.fillStyle = "rgba(0,0,0,0.6)";
    ctx.fillRect(22, 62, 12, 26);
    ctx.beginPath(); ctx.arc(28, 52, 20, 0, Math.PI*2); ctx.fill();
    ctx.fillText(text, 58, 64);

    ctx.fillStyle = "rgba(255,255,255,0.95)";
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
    spr.userData = { start: performance.now(), life: 1100 };
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
      spr.position.y += 0.0025 * (1 + (1 - t) * 2);
      spr.material.opacity = 1 - t;
    }
  }

  function clearGroup(g) {
    while (g.children.length) {
      const c = g.children.pop();
      if (c.geometry) c.geometry.dispose?.();
      if (c.material) {
        if (Array.isArray(c.material)) c.material.forEach(m => m.dispose?.());
        else c.material.dispose?.();
      }
    }
  }

  function makeTreeMesh() {
    const g = new THREE.Group();
    const foliageMat = new THREE.MeshStandardMaterial({ color:0x2f8a3a, roughness:1, metalness:0 });
    const trunkMat = new THREE.MeshStandardMaterial({ color:0x7a4a2a, roughness:1, metalness:0 });
    const foliage = new THREE.Mesh(new THREE.SphereGeometry(0.55,18,14), foliageMat);
    foliage.position.y = 1.15;
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.15,0.2,0.9,14), trunkMat);
    trunk.position.y = 0.45;
    g.add(foliage, trunk);
    return g;
  }

  function placePlayerAtTile(tx,tz){
    const m = getMap();
    const p = tileToWorld(m, tx, tz);
    player.position.set(p.x, tileY(m, tx, tz), p.z);
  }

  function rebuildWorld() {
    clearGroup(tileGroup); clearGroup(decoGroup); clearGroup(structureGroup); clearGroup(resourceGroup);
    stumpMeshes = new Map(); pickables = []; doorPickables = []; treePickables = [];

    const m = getMap();

    for (let tz=0; tz<m.h; tz++) for (let tx=0; tx<m.w; tx++) {
      const tt = m.tileType[tz][tx];
      const y = tileY(m, tx, tz);
      const pos = tileToWorld(m, tx, tz);
      const levels = m.heightMap[tz][tx];

      for (let i=0; i<levels; i++) {
        const side = new THREE.Mesh(tileSideGeo, mats.side);
        side.position.set(pos.x, i*LEVEL_H + LEVEL_H/2 - 0.04, pos.z);
        tileGroup.add(side);
      }

      const top = new THREE.Mesh(tileTopGeo, matForTileType(tt));
      top.position.set(pos.x, y+0.02, pos.z);
      top.userData = { kind:"tile", tx, tz };
      tileGroup.add(top);
      pickables.push(top);
    }

    for (const s of m.structures) {
      const centerX = s.x0 + s.w/2 - 0.5;
      const centerZ = s.z0 + s.d/2 - 0.5;
      const wp = tileToWorld(m, centerX, centerZ);
      const baseY = tileY(m, s.x0, s.z0);
      const isFurniture = (s.doorTx < 0);

      if (isFurniture) {
        const box = new THREE.Mesh(new THREE.BoxGeometry(s.w*TILE, 0.45, s.d*TILE), mats.stone);
        box.position.set(wp.x, baseY + 0.25, wp.z);
        structureGroup.add(box);
      } else {
        const bodyM = new THREE.Mesh(new THREE.BoxGeometry(s.w*TILE, 1.2, s.d*TILE), mats.house);
        bodyM.position.set(wp.x, baseY + 0.6, wp.z);
        structureGroup.add(bodyM);

        const roof = new THREE.Mesh(new THREE.ConeGeometry(Math.max(s.w,s.d)*0.65, 0.75, 4), mats.roof);
        roof.position.set(wp.x, baseY + 1.35, wp.z);
        roof.rotation.y = Math.PI/4;
        structureGroup.add(roof);

        const dwp = tileToWorld(m, s.doorTx, s.doorTz);
        const door = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.75, 0.12), mats.door);
        door.position.set(dwp.x, tileY(m, s.doorTx, s.doorTz) + 0.38, dwp.z - 0.38);
        door.userData = { kind:"door", tx: s.doorTx, tz: s.doorTz };
        structureGroup.add(door);
        doorPickables.push(door);
      }
    }

    for (const b of m.bushes || []) {
      const p = tileToWorld(m, b.tx, b.tz);
      const y = tileY(m, b.tx, b.tz);
      const bush = new THREE.Mesh(new THREE.SphereGeometry(0.38, 16, 12), mats.bush);
      bush.position.set(p.x + 0.12, y + 0.35, p.z - 0.08);
      decoGroup.add(bush);
    }

    if (state.map === "overworld") {
      for (const tr of state.world.trees) {
        const tree = makeTreeMesh();
        tree.userData = { kind:"tree", treeId: tr.id, tx: tr.tx, tz: tr.tz };
        resourceGroup.add(tree);
        treePickables.push(tree);

        const stump = new THREE.Mesh(new THREE.CylinderGeometry(0.26,0.30,0.28,16), mats.stump);
        stump.userData = { kind:"stump", treeId: tr.id };
        resourceGroup.add(stump);
        stumpMeshes.set(tr.id, stump);
      }
      syncTreesAndStumps();
    }

    placePlayerAtTile(state.player.tx, state.player.tz);
    marker.visible = false;
  }

  if (state.map !== "overworld" && !interiors[state.map]) state.map = "spawn_inn";
  rebuildWorld();

  function syncTreesAndStumps() {
    if (state.map !== "overworld") return;
    const m = overworld;
    const now = performance.now();
    for (const treeObj of treePickables) {
      const tr = state.world.trees.find(t => t.id === treeObj.userData.treeId);
      if (!tr) continue;
      const alive = treeAlive(tr, now);
      const stumpOn = stumpAlive(tr, now);

      const pos = tileToWorld(m, tr.tx, tr.tz);
      const y = tileY(m, tr.tx, tr.tz);

      treeObj.visible = alive;
      treeObj.position.set(pos.x, y, pos.z);

      const stump = stumpMeshes.get(tr.id);
      if (stump) {
        stump.visible = (!alive) && stumpOn;
        stump.position.set(pos.x, y + 0.12, pos.z);
      }
    }
  }

  // Raycasting / input
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();

  function pickFromEvent(ev) {
    const rect = renderer.domElement.getBoundingClientRect();
    const x=(ev.clientX-rect.left)/rect.width;
    const y=(ev.clientY-rect.top)/rect.height;
    pointer.x = x*2-1;
    pointer.y = -(y*2-1);
    raycaster.setFromCamera(pointer, cam);

    const objects = pickables.concat(doorPickables).concat(treePickables.filter(t=>t.visible));
    const hits = raycaster.intersectObjects(objects, true);
    if (!hits.length) return null;

    for (const h of hits) {
      const o = h.object;
      if (o.userData?.kind === "door") return { kind:"door", tx:o.userData.tx, tz:o.userData.tz };
      let cur = o;
      while (cur && cur !== scene) {
        if (cur.userData?.kind === "tree") return { kind:"tree", treeId: cur.userData.treeId, tx: cur.userData.tx, tz: cur.userData.tz };
        cur = cur.parent;
      }
    }

    const hit = hits[0].object;
    if (hit.userData?.kind === "tile") return { kind:"tile", tx: hit.userData.tx, tz: hit.userData.tz };
    return null;
  }

  const key = (tx,tz)=>tx+","+tz;
  const heuristic = (a,b)=>Math.abs(a.tx-b.tx)+Math.abs(a.tz-b.tz);

  function neighbors(m, n) {
    return [
      { tx:n.tx+1, tz:n.tz }, { tx:n.tx-1, tz:n.tz },
      { tx:n.tx, tz:n.tz+1 }, { tx:n.tx, tz:n.tz-1 },
    ].filter(p => inBounds(m,p.tx,p.tz) && !isSolid(m,p.tx,p.tz));
  }
  function moveCost(m, a, b) {
    const dh = m.heightMap[b.tz][b.tx] - m.heightMap[a.tz][a.tx];
    return 1 + Math.max(0, dh) * 0.5;
  }
  function astar(m, start, goal) {
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
      for(const nb of neighbors(m,cur)){
        const nk=key(nb.tx,nb.tz);
        const tentative=(gScore.get(curK)??Infinity)+moveCost(m,cur,nb);
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

  function setMoveGoal(goalTx, goalTz) {
    const m = getMap();
    if (isSolid(m, goalTx, goalTz)) { setMsg("Can't walk there"); return; }
    const start = { tx: state.player.tx, tz: state.player.tz };
    const goal = { tx: goalTx, tz: goalTz };
    const path = astar(m, start, goal);
    if (!path.length) { setMsg("No path"); return; }
    state.path = path;
    state.moveSeg = null;
    marker.visible = true;
    const wp = tileToWorld(m, goalTx, goalTz);
    marker.position.set(wp.x, tileY(m, goalTx, goalTz) + 0.03, wp.z);
  }

  function bestAdjacentStandTile(m, objTx, objTz) {
    const opts = [
      { tx: objTx+1, tz: objTz },
      { tx: objTx-1, tz: objTz },
      { tx: objTx, tz: objTz+1 },
      { tx: objTx, tz: objTz-1 },
    ].filter(p => inBounds(m,p.tx,p.tz) && !isSolid(m,p.tx,p.tz));
    if (!opts.length) return null;
    const px = state.player.tx, pz = state.player.tz;
    opts.sort((a,b)=> (Math.abs(a.tx-px)+Math.abs(a.tz-pz)) - (Math.abs(b.tx-px)+Math.abs(b.tz-pz)) );
    return opts[0];
  }

  renderer.domElement.addEventListener("pointerdown", (ev) => {
    if (state.chopping) { setMsg("Busy..."); return; }
    const hit = pickFromEvent(ev);
    if (!hit) return;

    const m = getMap();

    if (hit.kind === "door") {
      const door = findDoorAt(m, hit.tx, hit.tz);
      if (!door) { setMsg("Door?"); return; }
      setMoveGoal(hit.tx, hit.tz);
      state.pendingDoor = { doorId: door.id, targetMap: door.toMap };
      setMsg("Entering...");
      return;
    }

    if (hit.kind === "tree" && state.map === "overworld") {
      const tr = state.world.trees.find(t => t.id === hit.treeId);
      if (!tr || !treeAlive(tr)) { setMsg("No tree"); return; }
      const stand = bestAdjacentStandTile(m, tr.tx, tr.tz);
      if (!stand) { setMsg("Can't reach tree"); return; }
      setMoveGoal(stand.tx, stand.tz);
      setMsg("Walk to tree");
      return;
    }

    if (hit.kind === "tile") {
      if (isSolid(m, hit.tx, hit.tz)) { setMsg("Can't walk there"); return; }
      setMoveGoal(hit.tx, hit.tz);
    }
  });

  window.addEventListener("keydown", (e) => {
    const k = e.key.toLowerCase();
    if (k === "e") tryChopNearestTree();
    if (k === "r") {
      localStorage.removeItem(SAVE_KEY);
      state = defaultState();
      rebuildWorld();
      setMsg("Reset");
      updateUI("Reset");
    }
  });

  function adjacentTileDistance(aTx,aTz,bTx,bTz) { return Math.abs(aTx-bTx)+Math.abs(aTz-bTz); }

  function tryChopNearestTree() {
    if (state.map !== "overworld") { setMsg("No trees inside"); return; }
    if (state.chopping) return;

    const now = performance.now();
    let best = null;
    let bestD = 999;

    for (const tr of state.world.trees) {
      if (!treeAlive(tr, now)) continue;
      const d = adjacentTileDistance(state.player.tx, state.player.tz, tr.tx, tr.tz);
      if (d < bestD) { bestD = d; best = tr; }
    }

    if (!best || bestD !== 1) { setMsg("Stand next to a tree"); return; }

    state.path = [];
    state.moveSeg = null;
    state.chopping = { endAt: now + CHOP_TIME_MS, treeId: best.id };
    setMsg("Chopping...");
  }

  function finishChop() {
    const now = performance.now();
    const tr = state.world.trees.find(t => t.id === state.chopping.treeId);
    state.chopping = null;
    if (!tr) return;

    state.inv.logs += 1;
    addXp("woodcutting", XP_CHOP);
    if (Math.random() < 0.35) state.inv.coins += 1;
    spawnXpPopup(XP_CHOP);

    tr.respawnAt = now + TREE_RESPAWN_MS;
    tr.stumpUntil = tr.respawnAt;

    setMsg("You get some logs");
    saveState();
  }

  function checkDoorArrival() {
    if (!state.pendingDoor) return;
    const m = getMap();
    const door = m.doors.find(d => d.id === state.pendingDoor.doorId);
    if (!door) { state.pendingDoor = null; return; }
    if (state.player.tx === door.tx && state.player.tz === door.tz) {
      if (door.kind === "enter") {
        state.map = door.toMap;
        const interior = interiors[state.map];
        const exitDoor = interior.doors.find(x => x.kind === "exit");
        state.player.tx = exitDoor.tx;
        state.player.tz = exitDoor.tz - 1;
      } else {
        state.map = "overworld";
        state.player.tx = door.returnTx ?? 12;
        state.player.tz = door.returnTz ?? 14;
      }
      state.path = [];
      state.moveSeg = null;
      state.pendingDoor = null;
      rebuildWorld();
      setMsg("Welcome");
      saveState();
    }
  }

  function startNextSegment() {
    if (!state.path.length) return;
    const next = state.path[0];
    state.moveSeg = { from:{tx:state.player.tx,tz:state.player.tz}, to:{tx:next.tx,tz:next.tz}, t:0 };
  }

  function stepMovement(dt) {
    if (state.chopping) return;
    if (!state.moveSeg) {
      if (!state.path.length) return;
      startNextSegment();
      if (!state.moveSeg) return;
    }

    const seg = state.moveSeg;
    seg.t += state.player.speedTilesPerSec * dt;
    const t = Math.min(1, seg.t);

    const m = getMap();
    const a = tileToWorld(m, seg.from.tx, seg.from.tz);
    const b = tileToWorld(m, seg.to.tx, seg.to.tz);
    const ay = tileY(m, seg.from.tx, seg.from.tz);
    const by = tileY(m, seg.to.tx, seg.to.tz);

    player.position.x = a.x + (b.x-a.x)*t;
    player.position.z = a.z + (b.z-a.z)*t;
    player.position.y = ay + (by-ay)*t;

    const dx=(b.x-a.x), dz=(b.z-a.z);
    if (Math.abs(dx)+Math.abs(dz)>1e-6) player.rotation.y = Math.atan2(dx,dz);

    if (seg.t >= 1) {
      state.player.tx = seg.to.tx;
      state.player.tz = seg.to.tz;
      state.path.shift();
      if (!state.path.length) { state.moveSeg = null; marker.visible = false; }
      else state.moveSeg = null;
      checkDoorArrival();
    }
  }

  const baseBodyY = body.position.y;
  function animateChop(now) {
    if (!state.chopping) { body.position.y = baseBodyY; return; }
    const phase = (state.chopping.endAt - now) / CHOP_TIME_MS;
    const s = Math.max(0, Math.min(1, 1 - phase));
    body.position.y = baseBodyY + Math.sin(s * Math.PI * 4) * 0.03;
    player.rotation.y += 0.06;
  }

  function updateCamera() {
    const pos = player.position;
    const follow = new THREE.Vector3(pos.x, pos.y, pos.z);
    const offset = new THREE.Vector3(14,14,14);
    cam.position.copy(follow).add(offset);
    cam.rotation.order="YXZ";
    cam.rotation.y=Math.PI/4;
    cam.rotation.x=-ISO_PITCH;
    cam.lookAt(follow);
  }

  let last = performance.now();
  function tick(now) {
    const dt = Math.min(0.033, (now - last) / 1000);
    last = now;

    if (state.chopping && now >= state.chopping.endAt) finishChop();
    stepMovement(dt);
    animateChop(now);

    if (state.map === "overworld") syncTreesAndStumps();
    updatePopups(now);
    updateCamera();
    updateUI();
    renderer.render(scene, cam);

    requestAnimationFrame(tick);
  }

  updateUI();
  requestAnimationFrame(tick);
})();