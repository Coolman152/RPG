(() => {
  // =========================
  // Tunables
  // =========================
  const XP_CHOP = 25;
  const XP_FISH = 20;
  const CHOP_TIME_MS = 900;
  const FISH_TIME_MS = 900;
  const TREE_RESPAWN_MS = 6000;
  const FISH_RESPAWN_MS = 2500;

  const TILE = 1.0;
  const LEVEL_H = 0.28;

  const OW_W = 34;
  const OW_H = 34;

  const IN_W = 10;
  const IN_H = 10;

  const INVENTORY_CAPACITY = 20;

  const SAVE_KEY = "iso_rpg_village_save_v7";
  const USERNAME_KEY = "iso_rpg_username_v1";

  // =========================
  // Username
  // =========================
  function getUsername() {
    let name = localStorage.getItem(USERNAME_KEY);
    if (!name) {
      name = prompt("Choose a username (shown above your character):")?.trim();
      if (!name) name = "Player";
      name = name.slice(0, 16);
      localStorage.setItem(USERNAME_KEY, name);
    }
    return name;
  }
  const username = getUsername();

  // =========================
  // Items
  // =========================
  const ITEM_DEFS = {
    log:        { name: "Logs",        icon: "🪵" },
    fish:       { name: "Fish",        icon: "🐟" },
    axe:        { name: "Bronze Axe",  icon: "🪓", tool: true },
    fishingrod: { name: "Fishing Rod", icon: "🎣", tool: true },
  };

  const SHOP_PRICES = {
    axe: 5,
    fishingrod: 8,
  };

  const BUY_PRICES = {
    log: 1,
    fish: 2,
  };

  // =========================
  // Skills
  // =========================
  const SKILL_ORDER = [
    "Attack","Strength","Defence","Ranged","Prayer","Magic",
    "Runecraft","Construction","Dungeoneering","Hitpoints",
    "Agility","Herblore","Thieving","Crafting","Fletching","Slayer",
    "Hunter","Mining","Smithing","Fishing","Cooking","Firemaking",
    "Woodcutting","Farming"
  ];

  function xpForLevel(lvl) {
    let total = 0;
    for (let i = 1; i < lvl; i++) total += Math.floor(i + 300 * Math.pow(2, i / 7));
    return Math.floor(total / 4);
  }

  function ensureAllSkills(skillsObj) {
    for (const s of SKILL_ORDER) {
      const key = s.toLowerCase();
      if (!skillsObj[key]) skillsObj[key] = { lvl: 1, xp: 0 };
    }
  }

  // =========================
  // Save / Load
  // =========================
  function defaultState() {
    const skills = { woodcutting: { lvl: 1, xp: 0 }, fishing: { lvl: 1, xp: 0 } };
    ensureAllSkills(skills);
    return {
      map: "spawn_inn",
      player: { tx: 5, tz: 7, speedTilesPerSec: 4.2 },
      path: [],
      moveSeg: null,
      action: null, // { type, endAt, id }
      pendingDoor: null,
      inv: { items: [], coins: 10 }, // start with some coins
      bank: { items: [] },
      skills,
      world: {
        trees: [
          { id: "t1", tx: 22, tz: 20, respawnAt: 0, stumpUntil: 0 },
          { id: "t2", tx: 25, tz: 23, respawnAt: 0, stumpUntil: 0 },
          { id: "t3", tx: 28, tz: 19, respawnAt: 0, stumpUntil: 0 },
          { id: "t4", tx: 18, tz: 26, respawnAt: 0, stumpUntil: 0 },
          { id: "t5", tx: 10, tz: 28, respawnAt: 0, stumpUntil: 0 },
        ],
        fishingSpots: [
          { id:"f1", tx: 26, tz: 10, respawnAt: 0 },
          { id:"f2", tx: 27, tz: 12, respawnAt: 0 },
          { id:"f3", tx: 24, tz: 11, respawnAt: 0 },
        ]
      },
      ui: { activeTab: null, selectedSkill: "woodcutting" }
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
      s.action ??= null;
      s.pendingDoor ??= null;

      s.inv ??= { items: [], coins: 0 };
      s.inv.items ??= [];
      s.inv.coins ??= 0;

      s.bank ??= { items: [] };
      s.bank.items ??= [];

      s.skills ??= { woodcutting: { lvl: 1, xp: 0 }, fishing: { lvl: 1, xp: 0 } };
      ensureAllSkills(s.skills);

      s.world ??= { trees: [], fishingSpots: [] };
      s.world.trees ??= [];
      s.world.fishingSpots ??= [];

      s.ui ??= { activeTab: null, selectedSkill: "woodcutting" };
      s.ui.activeTab ??= null;
      s.ui.selectedSkill ??= "woodcutting";

      return s;
    } catch {
      return defaultState();
    }
  }

  let state = loadState();
  function saveState() { localStorage.setItem(SAVE_KEY, JSON.stringify(state)); }
  setInterval(saveState, 5000);

  // =========================
  // Inventory helpers
  // =========================
  function invUsed() { return state.inv.items.length; }
  function invFree() { return INVENTORY_CAPACITY - invUsed(); }
  function hasItem(itemId) { return state.inv.items.includes(itemId); }
  function removeOneItemFromInv(itemId) {
    const idx = state.inv.items.indexOf(itemId);
    if (idx >= 0) { state.inv.items.splice(idx,1); return true; }
    return false;
  }
  function removeOneItemFromBank(itemId) {
    const idx = state.bank.items.indexOf(itemId);
    if (idx >= 0) { state.bank.items.splice(idx,1); return true; }
    return false;
  }

  function addItemToInv(itemId) {
    if (!ITEM_DEFS[itemId]) return false;
    if (invUsed() >= INVENTORY_CAPACITY) return false;
    state.inv.items.push(itemId);
    return true;
  }

  function addItemToBank(itemId) {
    if (!ITEM_DEFS[itemId]) return false;
    state.bank.items.push(itemId);
    return true;
  }

  function addCoins(n) { state.inv.coins += n; }
  function spendCoins(n) { if (state.inv.coins < n) return false; state.inv.coins -= n; return true; }

  // =========================
  // UI elements
  // =========================
  const btnSkills = document.getElementById("btnSkills");
  const btnInv = document.getElementById("btnInv");
  const panelSkills = document.getElementById("panelSkills");
  const panelInv = document.getElementById("panelInv");
  const skillsListEl = document.getElementById("skillsList");
  const skillNameEl = document.getElementById("skillName");
  const skillMetaEl = document.getElementById("skillMeta");
  const skillBarFillEl = document.getElementById("skillBarFill");
  const invGridEl = document.getElementById("invGrid");
  const invMetaEl = document.getElementById("invMeta");
  const coinsEl = document.getElementById("coins");
  const contextEl = document.getElementById("context");
  const msgEl = document.getElementById("msg");

  const modalEl = document.getElementById("modal");
  const modalTitleEl = document.getElementById("modalTitle");
  const modalBodyEl = document.getElementById("modalBody");
  const modalCloseEl = document.getElementById("modalClose");
  modalCloseEl.addEventListener("click", () => closeModal());

  function openModal(title, html) {
    modalTitleEl.textContent = title;
    modalBodyEl.innerHTML = html;
    modalEl.classList.remove("hidden");
  }
  function closeModal() {
    modalEl.classList.add("hidden");
    modalTitleEl.textContent = "";
    modalBodyEl.innerHTML = "";
  }
  modalEl.addEventListener("click", (e) => {
    if (e.target === modalEl) closeModal();
  });

  let msgUntil = 0;
  function setMsg(text, ms = 1200) { msgEl.textContent = text; msgUntil = performance.now() + ms; }

  function setTab(tabName) {
    state.ui.activeTab = (state.ui.activeTab === tabName) ? null : tabName;
    panelSkills.classList.toggle("hidden", state.ui.activeTab !== "skills");
    panelInv.classList.toggle("hidden", state.ui.activeTab !== "inv");
    btnSkills.classList.toggle("active", state.ui.activeTab === "skills");
    btnInv.classList.toggle("active", state.ui.activeTab === "inv");
    saveState();
  }
  btnSkills.addEventListener("click", () => setTab("skills"));
  btnInv.addEventListener("click", () => setTab("inv"));

  function skillDisplayName(key) {
    if (key === "hitpoints") return "Hitpoints";
    return key.charAt(0).toUpperCase() + key.slice(1);
  }

  function renderSkillsList() {
    skillsListEl.innerHTML = "";
    const keys = SKILL_ORDER.map(s => s.toLowerCase());
    for (const key of keys) {
      const sk = state.skills[key];
      const row = document.createElement("div");
      row.className = "skillRow" + (state.ui.selectedSkill === key ? " active" : "");
      row.addEventListener("click", () => {
        state.ui.selectedSkill = key;
        renderSkillsList();
        renderSkillDetail();
        saveState();
      });

      const left = document.createElement("div");
      left.className = "left";
      const icon = document.createElement("div");
      icon.className = "skillIcon";
      icon.textContent = (key === "woodcutting") ? "🪓" :
                         (key === "mining") ? "⛏️" :
                         (key === "fishing") ? "🎣" :
                         (key === "cooking") ? "🍳" :
                         (key === "magic") ? "✨" :
                         "★";
      const name = document.createElement("div");
      name.className = "skillNameTxt";
      name.textContent = skillDisplayName(key);
      left.appendChild(icon);
      left.appendChild(name);

      const lvl = document.createElement("div");
      lvl.className = "skillLvl";
      lvl.textContent = "Lvl " + sk.lvl;

      row.appendChild(left);
      row.appendChild(lvl);
      skillsListEl.appendChild(row);
    }
  }

  function renderSkillDetail() {
    const key = state.ui.selectedSkill;
    const sk = state.skills[key];
    const nextReq = xpForLevel(sk.lvl + 1);
    const prevReq = xpForLevel(sk.lvl);
    const inLevel = sk.xp - prevReq;
    const toNext = Math.max(0, nextReq - sk.xp);
    const denom = Math.max(1, nextReq - prevReq);
    const pct = Math.max(0, Math.min(1, inLevel / denom));

    skillNameEl.textContent = skillDisplayName(key);
    skillMetaEl.innerHTML = `
      Level: <b>${sk.lvl}</b><br/>
      XP: <b>${sk.xp}</b><br/>
      XP to next: <b>${sk.lvl < 99 ? toNext : 0}</b>
    `;
    skillBarFillEl.style.width = (sk.lvl >= 99 ? 100 : pct * 100) + "%";
  }

  function renderInventory() {
    invGridEl.innerHTML = "";
    invMetaEl.textContent = `Slots: ${invUsed()} / ${INVENTORY_CAPACITY}`;
    coinsEl.textContent = `Coins: 🪙 ${state.inv.coins}`;

    const slots = [];
    for (const it of state.inv.items) slots.push(it);
    while (slots.length < INVENTORY_CAPACITY) slots.push(null);

    for (const it of slots) {
      const wrap = document.createElement("div");
      wrap.className = "invSlotWrap";
      const slot = document.createElement("div");
      slot.className = "invSlot" + (it ? "" : " empty");
      slot.textContent = it ? (ITEM_DEFS[it]?.icon || "❓") : "·";
      wrap.appendChild(slot);
      invGridEl.appendChild(wrap);
    }
  }

  function updateUI(contextText = "") {
    contextEl.textContent = contextText || "";
    if (performance.now() > msgUntil) msgEl.textContent = "";
    if (state.ui.activeTab === "skills") { renderSkillsList(); renderSkillDetail(); }
    if (state.ui.activeTab === "inv") { renderInventory(); }
  }

  // restore tabs
  const wantedTab = state.ui.activeTab;
  state.ui.activeTab = null;
  panelSkills.classList.add("hidden"); panelInv.classList.add("hidden");
  btnSkills.classList.remove("active"); btnInv.classList.remove("active");
  if (wantedTab === "skills") setTab("skills");
  if (wantedTab === "inv") setTab("inv");

  // =========================
  // Maps
  // =========================
  function makeMap(w, h) {
    return {
      w, h,
      tileType: Array.from({ length: h }, () => Array(w).fill(0)),
      heightMap: Array.from({ length: h }, () => Array(w).fill(0)),
      structures: [],
      doors: [],
      bushes: [],
      npcs: [],
      spots: [],
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

    // border stone
    for (let x = 0; x < m.w; x++) { m.tileType[0][x]=1; m.tileType[m.h-1][x]=1; m.heightMap[0][x]=0; m.heightMap[m.h-1][x]=0; }
    for (let z = 0; z < m.h; z++) { m.tileType[z][0]=1; m.tileType[z][m.w-1]=1; m.heightMap[z][0]=0; m.heightMap[z][m.w-1]=0; }

    // village flat
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
    for (let x = 18; x < m.w-1; x++) setRoad(x, 12); // to nowhere

    // buildings
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

    // NPCs in overworld
    m.npcs = [
      { id:"shop", tx: 12, tz: 11, name:"Tool Vendor", icon:"🛒", color:0xffd36b, kind:"shop" },
      { id:"buy_logs", tx: 8, tz: 15, name:"Log Buyer", icon:"🪵", color:0x9ddcff, kind:"buyer", item:"log" },
      { id:"buy_fish", tx: 16, tz: 15, name:"Fishmonger", icon:"🐟", color:0x8bf7c4, kind:"buyer", item:"fish" },
    ];

    // Fishing spots (near lake)
    m.spots = [
      { id:"spot1", tx: 25, tz: 11, icon:"🎣", kind:"fishspot" },
      { id:"spot2", tx: 27, tz: 11, icon:"🎣", kind:"fishspot" },
      { id:"spot3", tx: 26, tz: 13, icon:"🎣", kind:"fishspot" },
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

    // Banker in spawn inn
    m.npcs = [];
    if (id === "spawn_inn") {
      m.npcs.push({ id:"banker", tx: 6, tz: 3, name:"Banker", icon:"🏦", color:0xb3a1ff, kind:"bank" });
    }

    m.title = title;
    interiors[id] = m;
  }

  ["spawn_inn","house_1","house_2","house_3","house_4"].forEach((id) => genInterior(id, id.replace("_"," ").toUpperCase()));
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

  // =========================
  // Solids / interact checks
  // =========================
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
    if (tt === 2) return true; // water
    if (tt === 1 && state.map !== "overworld") return true; // interior walls
    if (isStructureSolid(m, tx, tz)) return true;

    // Trees & stumps solid
    if (state.map === "overworld") {
      for (const tr of state.world.trees) {
        if (tr.tx === tx && tr.tz === tz && (treeAlive(tr) || stumpAlive(tr))) return true;
      }
    }
    // NPCs solid (so you can't walk through them)
    for (const npc of (m.npcs || [])) {
      if (npc.tx === tx && npc.tz === tz) return true;
    }
    // Fishing spots are not solid (stand next to them), so no solid there.
    return false;
  }

  function findDoorAt(m, tx, tz) { return m.doors.find(d => d.tx === tx && d.tz === tz) || null; }
  function findNpcAt(m, tx, tz) { return (m.npcs || []).find(n => n.tx === tx && n.tz === tz) || null; }
  function findSpotAt(m, tx, tz) { return (m.spots || []).find(s => s.tx === tx && s.tz === tz) || null; }

  // =========================
  // Three.js setup
  // =========================
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
    doorFrame: new THREE.MeshStandardMaterial({ color:0xe7e2b2, roughness:0.9, metalness:0.05 }),
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
  const npcGroup = new THREE.Group();
  worldGroup.add(tileGroup, structureGroup, resourceGroup, decoGroup, npcGroup);

  let pickables = [];
  let doorPickables = [];
  let treePickables = [];
  let spotPickables = [];
  let npcPickables = [];
  let stumpMeshes = new Map();

  // Marker
  const marker = new THREE.Mesh(
    new THREE.RingGeometry(0.14,0.26,28),
    new THREE.MeshBasicMaterial({ color:0xffffff, transparent:true, opacity:0.7, side:THREE.DoubleSide })
  );
  marker.rotation.x=-Math.PI/2;
  marker.visible=false;
  scene.add(marker);

  // Player
  const player = new THREE.Group();
  const bodyMat = new THREE.MeshStandardMaterial({ color:0xd7e1ff, roughness:1, metalness:0 });
  const shadowMat = new THREE.MeshBasicMaterial({ color:0x000000, transparent:true, opacity:0.18 });
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.25,0.35,6,12), bodyMat); body.position.y=0.6;
  const shadow = new THREE.Mesh(new THREE.CircleGeometry(0.35,18), shadowMat); shadow.rotation.x=-Math.PI/2; shadow.position.y=0.02;
  player.add(body,shadow);
  scene.add(player);

  // Name tag sprite
  function makeTextSprite(text, scaleX=3.8, scaleY=0.95) {
    const c = document.createElement("canvas");
    const ctx = c.getContext("2d");
    c.width = 512; c.height = 128;
    ctx.clearRect(0,0,c.width,c.height);
    ctx.font = "bold 64px system-ui, -apple-system, Segoe UI, Roboto, Arial";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.lineWidth = 12;
    ctx.strokeStyle = "rgba(0,0,0,0.75)";
    ctx.strokeText(text, 256, 64);
    ctx.fillStyle = "rgba(255,255,255,0.95)";
    ctx.fillText(text, 256, 64);

    const tex = new THREE.CanvasTexture(c);
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.generateMipmaps = false;

    const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent:true }));
    spr.scale.set(scaleX, scaleY, 1);
    return spr;
  }
  const nameTag = makeTextSprite(username);
  nameTag.position.set(0, 2.1, 0);
  player.add(nameTag);

  // XP popups
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

  function spawnPopup(text) {
    const spr = makePopupSprite(text);
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

  // Mesh helpers
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

  function makeDoorModel() {
    const g = new THREE.Group();
    const frame = new THREE.Mesh(new THREE.BoxGeometry(0.92, 0.95, 0.14), mats.doorFrame);
    frame.position.y = 0.55;
    const door = new THREE.Mesh(new THREE.BoxGeometry(0.74, 0.85, 0.10), mats.door);
    door.position.y = 0.50;
    door.position.z = 0.03;
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.045, 12, 10), new THREE.MeshStandardMaterial({ color: 0xf2d56b, roughness:0.6, metalness:0.35 }));
    knob.position.set(0.22, 0.48, 0.08);
    const sign = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.18, 0.06), new THREE.MeshStandardMaterial({ color: 0x9ddcff, roughness:0.9, metalness:0.0, emissive:0x133344 }));
    sign.position.set(0, 0.95, 0.03);
    g.add(frame, door, knob, sign);
    return g;
  }

  function makeNpcMesh(npc) {
    const g = new THREE.Group();
    const npcMat = new THREE.MeshStandardMaterial({ color: npc.color ?? 0xffffff, roughness:1, metalness:0 });
    const cap = new THREE.Mesh(new THREE.CapsuleGeometry(0.23,0.35,6,12), npcMat);
    cap.position.y = 0.55;

    // icon above head
    const iconSpr = makeTextSprite(npc.icon || "?", 1.35, 0.55);
    iconSpr.position.set(0, 1.65, 0);

    g.add(cap, iconSpr);
    g.userData = { kind:"npc", id:npc.id, tx:npc.tx, tz:npc.tz };
    return g;
  }

  function makeFishingSpotMesh(spot) {
    const g = new THREE.Group();
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.18, 0.30, 24),
      new THREE.MeshBasicMaterial({ color:0x9ddcff, transparent:true, opacity:0.9, side:THREE.DoubleSide })
    );
    ring.rotation.x = -Math.PI/2;
    ring.position.y = 0.03;

    const bob = new THREE.Mesh(new THREE.SphereGeometry(0.08, 12, 10), new THREE.MeshStandardMaterial({ color:0xff6b8b, roughness:0.7, metalness:0.1 }));
    bob.position.y = 0.12;

    g.add(ring, bob);
    g.userData = { kind:"spot", id:spot.id, tx:spot.tx, tz:spot.tz };
    return g;
  }

  function placePlayerAtTile(tx,tz){
    const m = getMap();
    const p = tileToWorld(m, tx, tz);
    player.position.set(p.x, tileY(m, tx, tz), p.z);
  }

  function rebuildWorld() {
    clearGroup(tileGroup); clearGroup(decoGroup); clearGroup(structureGroup); clearGroup(resourceGroup); clearGroup(npcGroup);
    stumpMeshes = new Map();
    pickables = []; doorPickables = []; treePickables = []; spotPickables = []; npcPickables = [];

    const m = getMap();

    // Tiles
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

    // Structures + doors
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
        const doorModel = makeDoorModel();
        doorModel.position.set(dwp.x, tileY(m, s.doorTx, s.doorTz) + 0.05, dwp.z - 0.46);
        doorModel.userData = { kind:"door", tx: s.doorTx, tz: s.doorTz };
        structureGroup.add(doorModel);
        doorPickables.push(doorModel);
      }
    }

    // Bushes
    for (const b of m.bushes || []) {
      const p = tileToWorld(m, b.tx, b.tz);
      const y = tileY(m, b.tx, b.tz);
      const bush = new THREE.Mesh(new THREE.SphereGeometry(0.38, 16, 12), mats.bush);
      bush.position.set(p.x + 0.12, y + 0.35, p.z - 0.08);
      decoGroup.add(bush);
    }

    // Trees (overworld)
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

    // Fishing spots (overworld)
    if (state.map === "overworld") {
      for (const sp of (m.spots || [])) {
        const mesh = makeFishingSpotMesh(sp);
        const wp = tileToWorld(m, sp.tx, sp.tz);
        mesh.position.set(wp.x, tileY(m, sp.tx, sp.tz), wp.z);
        npcGroup.add(mesh);
        spotPickables.push(mesh);
      }
    }

    // NPCs (all maps)
    for (const npc of (m.npcs || [])) {
      const mesh = makeNpcMesh(npc);
      const wp = tileToWorld(m, npc.tx, npc.tz);
      mesh.position.set(wp.x, tileY(m, npc.tx, npc.tz), wp.z);
      npcGroup.add(mesh);
      npcPickables.push(mesh);
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

  // =========================
  // Raycasting
  // =========================
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();

  function pickFromEvent(ev) {
    const rect = renderer.domElement.getBoundingClientRect();
    const x=(ev.clientX-rect.left)/rect.width;
    const y=(ev.clientY-rect.top)/rect.height;
    pointer.x = x*2-1;
    pointer.y = -(y*2-1);
    raycaster.setFromCamera(pointer, cam);

    const objects = pickables.concat(doorPickables)
      .concat(treePickables.filter(t=>t.visible))
      .concat(spotPickables)
      .concat(npcPickables);

    const hits = raycaster.intersectObjects(objects, true);
    if (!hits.length) return null;

    for (const h of hits) {
      let cur = h.object;
      while (cur && cur !== scene) {
        if (cur.userData?.kind === "door") return { kind:"door", tx:cur.userData.tx, tz:cur.userData.tz };
        if (cur.userData?.kind === "tree") return { kind:"tree", treeId:cur.userData.treeId, tx:cur.userData.tx, tz:cur.userData.tz };
        if (cur.userData?.kind === "npc")  return { kind:"npc", id:cur.userData.id, tx:cur.userData.tx, tz:cur.userData.tz };
        if (cur.userData?.kind === "spot") return { kind:"spot", id:cur.userData.id, tx:cur.userData.tx, tz:cur.userData.tz };
        cur = cur.parent;
      }
    }

    const hit = hits[0].object;
    if (hit.userData?.kind === "tile") return { kind:"tile", tx: hit.userData.tx, tz: hit.userData.tz };
    return null;
  }

  // =========================
  // A* pathfinding
  // =========================
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
    opts.sort((a,b)=> (Math.abs(a.tx-px)+Math.abs(a.tz-pz)) - (Math.abs(a.tz-pz)+Math.abs(b.tz-pz)) );
    return opts[0];
  }

  // =========================
  // Context action for E
  // =========================
  function adjacentManhattan(aTx,aTz,bTx,bTz){ return Math.abs(aTx-bTx)+Math.abs(aTz-bTz); }

  function getContextAction() {
    const m = getMap();

    // NPC adjacent
    for (const npc of (m.npcs || [])) {
      if (adjacentManhattan(state.player.tx, state.player.tz, npc.tx, npc.tz) === 1) {
        if (npc.kind === "shop") return { type:"npc_shop", npc, label:`Talk (${npc.name})` };
        if (npc.kind === "bank") return { type:"npc_bank", npc, label:`Bank (${npc.name})` };
        if (npc.kind === "buyer") return { type:"npc_buyer", npc, label:`Sell to ${npc.name}` };
      }
    }

    // Doors adjacent
    for (const d of m.doors) {
      if (adjacentManhattan(state.player.tx, state.player.tz, d.tx, d.tz) === 1) {
        return { type:"door", door:d, label:"Enter/Exit" };
      }
    }

    // Fishing spots adjacent (overworld)
    if (state.map === "overworld") {
      for (const sp of (m.spots || [])) {
        if (adjacentManhattan(state.player.tx, state.player.tz, sp.tx, sp.tz) === 1) {
          return { type:"fishspot", spot:sp, label:"Fish" };
        }
      }
    }

    // Trees adjacent
    if (state.map === "overworld") {
      const now = performance.now();
      for (const tr of state.world.trees) {
        if (!treeAlive(tr, now)) continue;
        if (adjacentManhattan(state.player.tx, state.player.tz, tr.tx, tr.tz) === 1) {
          return { type:"tree", tree:tr, label:"Chop Tree" };
        }
      }
    }

    return null;
  }

  // =========================
  // NPC interactions (modal)
  // =========================
  function shopModal(npc) {
    const axeOwned = hasItem("axe");
    const rodOwned = hasItem("fishingrod");
    openModal(npc.name, `
      <div class="row">
        <div class="left"><div class="badge">🪓</div><div><b>${ITEM_DEFS.axe.name}</b><br/><span style="opacity:.85">Price: 🪙 ${SHOP_PRICES.axe}</span></div></div>
        <button class="btn" id="buyAxe" ${axeOwned ? "disabled" : ""}>${axeOwned ? "Owned" : "Buy"}</button>
      </div>
      <div class="row">
        <div class="left"><div class="badge">🎣</div><div><b>${ITEM_DEFS.fishingrod.name}</b><br/><span style="opacity:.85">Price: 🪙 ${SHOP_PRICES.fishingrod}</span></div></div>
        <button class="btn" id="buyRod" ${rodOwned ? "disabled" : ""}>${rodOwned ? "Owned" : "Buy"}</button>
      </div>
      <div style="opacity:.85">Coins: 🪙 <b>${state.inv.coins}</b> • Free slots: <b>${invFree()}</b></div>
    `);

    const buyAxeBtn = document.getElementById("buyAxe");
    if (buyAxeBtn) buyAxeBtn.addEventListener("click", () => {
      if (hasItem("axe")) return;
      if (invFree() <= 0) { setMsg("Inventory full"); return; }
      if (!spendCoins(SHOP_PRICES.axe)) { setMsg("Not enough coins"); return; }
      addItemToInv("axe");
      setMsg("Bought an axe");
      saveState();
      shopModal(npc); // refresh modal
      renderInventory();
    });

    const buyRodBtn = document.getElementById("buyRod");
    if (buyRodBtn) buyRodBtn.addEventListener("click", () => {
      if (hasItem("fishingrod")) return;
      if (invFree() <= 0) { setMsg("Inventory full"); return; }
      if (!spendCoins(SHOP_PRICES.fishingrod)) { setMsg("Not enough coins"); return; }
      addItemToInv("fishingrod");
      setMsg("Bought a fishing rod");
      saveState();
      shopModal(npc);
      renderInventory();
    });
  }

  function buyerModal(npc) {
    const itemId = npc.item;
    const price = BUY_PRICES[itemId] || 1;
    const countInv = state.inv.items.filter(x => x === itemId).length;

    openModal(npc.name, `
      <div class="row">
        <div class="left"><div class="badge">${ITEM_DEFS[itemId]?.icon || "❓"}</div>
          <div><b>Sell ${ITEM_DEFS[itemId]?.name || itemId}</b><br/><span style="opacity:.85">Pays: 🪙 ${price} each</span></div>
        </div>
        <button class="btn" id="sellOne" ${countInv<=0 ? "disabled" : ""}>Sell 1</button>
      </div>
      <div class="row">
        <div class="left"><div class="badge">🪙</div><div><b>Sell all</b><br/><span style="opacity:.85">You have: ${countInv}</span></div></div>
        <button class="btn" id="sellAll" ${countInv<=0 ? "disabled" : ""}>Sell All</button>
      </div>
      <div style="opacity:.85">Coins: 🪙 <b>${state.inv.coins}</b></div>
    `);

    const sellOneBtn = document.getElementById("sellOne");
    if (sellOneBtn) sellOneBtn.addEventListener("click", () => {
      if (!removeOneItemFromInv(itemId)) return;
      addCoins(price);
      setMsg(`Sold 1 for ${price} coins`);
      saveState();
      buyerModal(npc);
      renderInventory();
    });

    const sellAllBtn = document.getElementById("sellAll");
    if (sellAllBtn) sellAllBtn.addEventListener("click", () => {
      let sold = 0;
      while (removeOneItemFromInv(itemId)) { sold++; }
      if (sold > 0) addCoins(price * sold);
      setMsg(`Sold ${sold}`);
      saveState();
      buyerModal(npc);
      renderInventory();
    });
  }

  function bankModal(npc) {
    // show bank and inventory icons; tap bank icon to withdraw; tap inv icon to deposit
    function countBy(arr) {
      const m = new Map();
      for (const it of arr) m.set(it, (m.get(it) || 0) + 1);
      return m;
    }
    const invCounts = countBy(state.inv.items);
    const bankCounts = countBy(state.bank.items);

    // Build grids (stack display - still stored as singles, but show with counts)
    function gridHtml(countMap, emptyCount, idPrefix) {
      const entries = [...countMap.entries()];
      let html = `<div class="bankGrid">`;
      for (const [itemId, cnt] of entries) {
        const icon = ITEM_DEFS[itemId]?.icon || "❓";
        html += `<div class="bankSlot" data-item="${itemId}" data-prefix="${idPrefix}" title="${ITEM_DEFS[itemId]?.name || itemId}">${icon}<span style="position:absolute;right:7px;bottom:6px;font-size:12px;font-weight:900;opacity:.9">${cnt}</span></div>`;
      }
      for (let i=0;i<emptyCount;i++) html += `<div class="bankSlot empty">·</div>`;
      html += `</div>`;
      return html;
    }

    const invUnique = [...invCounts.keys()].length;
    const bankUnique = [...bankCounts.keys()].length;

    openModal(npc.name, `
      <div style="opacity:.9;margin-bottom:10px">Tap an item to move <b>1</b> between Inventory ⇄ Bank.</div>
      <div class="row" style="margin-bottom:12px">
        <div class="left"><div class="badge">🎒</div><div><b>Inventory</b><br/><span style="opacity:.85">Slots ${invUsed()}/${INVENTORY_CAPACITY}</span></div></div>
        <button class="btn" id="depositAll" ${invUsed()===0 ? "disabled" : ""}>Deposit All</button>
      </div>
      ${gridHtml(invCounts, Math.max(0, 12-invUnique), "inv")}
      <div class="row" style="margin-top:12px;margin-bottom:12px">
        <div class="left"><div class="badge">🏦</div><div><b>Bank</b><br/><span style="opacity:.85">${state.bank.items.length} items stored</span></div></div>
        <button class="btn" id="withdrawAll" ${state.bank.items.length===0 ? "disabled" : ""}>Withdraw All</button>
      </div>
      ${gridHtml(bankCounts, Math.max(0, 12-bankUnique), "bank")}
      <div style="opacity:.85;margin-top:10px">Coins are always carried: 🪙 <b>${state.inv.coins}</b></div>
    `);

    // deposit all (except coins)
    const depAll = document.getElementById("depositAll");
    if (depAll) depAll.addEventListener("click", () => {
      // move everything from inv to bank (except leave nothing)
      while (state.inv.items.length) {
        const it = state.inv.items.pop();
        addItemToBank(it);
      }
      setMsg("Deposited all");
      saveState();
      bankModal(npc);
      renderInventory();
    });

    // withdraw all (until inventory full)
    const wdAll = document.getElementById("withdrawAll");
    if (wdAll) wdAll.addEventListener("click", () => {
      let moved = 0;
      // try moving items until full or empty
      while (state.bank.items.length && invFree() > 0) {
        const it = state.bank.items.pop();
        addItemToInv(it);
        moved++;
      }
      if (state.bank.items.length && invFree() === 0) setMsg("Inventory full");
      else setMsg(`Withdrew ${moved}`);
      saveState();
      bankModal(npc);
      renderInventory();
    });

    // item click handlers
    modalBodyEl.querySelectorAll(".bankSlot[data-item]").forEach(el => {
      el.addEventListener("click", () => {
        const itemId = el.getAttribute("data-item");
        const prefix = el.getAttribute("data-prefix");
        if (!itemId) return;

        if (prefix === "inv") {
          // deposit 1
          if (removeOneItemFromInv(itemId)) {
            addItemToBank(itemId);
            setMsg("Deposited 1");
            saveState();
            bankModal(npc);
            renderInventory();
          }
        } else {
          // withdraw 1
          if (invFree() <= 0) { setMsg("Inventory full"); return; }
          if (removeOneItemFromBank(itemId)) {
            addItemToInv(itemId);
            setMsg("Withdrew 1");
            saveState();
            bankModal(npc);
            renderInventory();
          }
        }
      });
    });
  }

  function openNpc(npc) {
    if (npc.kind === "shop") shopModal(npc);
    if (npc.kind === "buyer") buyerModal(npc);
    if (npc.kind === "bank") bankModal(npc);
  }

  // =========================
  // Actions (chop/fish)
  // =========================
  function addXp(skillKey, amount) {
    const sk = state.skills[skillKey];
    sk.xp += amount;
    while (sk.lvl < 99 && sk.xp >= xpForLevel(sk.lvl + 1)) {
      sk.lvl++;
      addCoins(1);
    }
  }

  function finishAction() {
    const now = performance.now();
    const a = state.action;
    state.action = null;
    if (!a) return;

    if (a.type === "chop") {
      const tr = state.world.trees.find(t => t.id === a.id);
      if (!tr) return;

      // Needs axe
      if (!hasItem("axe")) { setMsg("You need an axe"); return; }

      // reward
      const ok = addItemToInv("log");
      if (!ok) setMsg("Inventory full");
      else setMsg("You get some logs");

      addXp("woodcutting", XP_CHOP);
      spawnPopup(`+${XP_CHOP} XP`);

      tr.respawnAt = now + TREE_RESPAWN_MS;
      tr.stumpUntil = tr.respawnAt;
      saveState();
      return;
    }

    if (a.type === "fish") {
      if (!hasItem("fishingrod")) { setMsg("You need a fishing rod"); return; }

      const sp = state.world.fishingSpots.find(s => s.id === a.id);
      if (!sp) return;

      // reward
      const ok = addItemToInv("fish");
      if (!ok) setMsg("Inventory full");
      else setMsg("You catch a fish");

      addXp("fishing", XP_FISH);
      spawnPopup(`+${XP_FISH} XP`);

      sp.respawnAt = now + FISH_RESPAWN_MS;
      saveState();
      return;
    }
  }

  // =========================
  // Contextual interaction (E)
  // =========================
  function doInteract() {
    if (state.action) { setMsg("Busy..."); return; }
    if (!modalEl.classList.contains("hidden")) { closeModal(); return; } // E closes modal if open

    const ctx = getContextAction();
    if (!ctx) { setMsg("Nothing to interact with"); return; }

    if (ctx.type === "npc_shop" || ctx.type === "npc_buyer" || ctx.type === "npc_bank") {
      openNpc(ctx.npc);
      return;
    }

    if (ctx.type === "door") {
      setMoveGoal(ctx.door.tx, ctx.door.tz);
      state.pendingDoor = { doorId: ctx.door.id };
      setMsg("Entering...");
      return;
    }

    if (ctx.type === "fishspot") {
      // stand still and fish (spot not solid, so you stay adjacent)
      const now = performance.now();
      // tie to persistent spots list in state.world
      const sp = state.world.fishingSpots.find(s => s.tx === ctx.spot.tx && s.tz === ctx.spot.tz) || state.world.fishingSpots.find(s => s.id === ctx.spot.id);
      if (!sp) { setMsg("No spot"); return; }
      if (now < (sp.respawnAt || 0)) { setMsg("Nothing biting..."); return; }
      state.path = []; state.moveSeg = null;
      state.action = { type:"fish", endAt: now + FISH_TIME_MS, id: sp.id };
      setMsg("Fishing...");
      return;
    }

    if (ctx.type === "tree") {
      // require axe to start
      if (!hasItem("axe")) { setMsg("You need an axe (buy one at the stall)"); return; }
      const now = performance.now();
      state.path = []; state.moveSeg = null;
      state.action = { type:"chop", endAt: now + CHOP_TIME_MS, id: ctx.tree.id };
      setMsg("Chopping...");
      return;
    }
  }

  // =========================
  // Click/tap interactions
  // =========================
  renderer.domElement.addEventListener("pointerdown", (ev) => {
    if (state.action) { setMsg("Busy..."); return; }
    const hit = pickFromEvent(ev);
    if (!hit) return;

    const m = getMap();

    if (hit.kind === "npc") {
      const npc = findNpcAt(m, hit.tx, hit.tz);
      if (!npc) return;
      const stand = bestAdjacentStandTile(m, npc.tx, npc.tz);
      if (!stand) { setMsg("Can't reach"); return; }
      setMoveGoal(stand.tx, stand.tz);
      state.pendingNpc = { id: npc.id };
      setMsg("Approaching...");
      return;
    }

    if (hit.kind === "door") {
      const door = findDoorAt(m, hit.tx, hit.tz);
      if (!door) return;
      setMoveGoal(hit.tx, hit.tz);
      state.pendingDoor = { doorId: door.id };
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

    if (hit.kind === "spot" && state.map === "overworld") {
      const sp = (m.spots || []).find(s => s.id === hit.id && s.tx === hit.tx && s.tz === hit.tz) || (m.spots || []).find(s => s.tx === hit.tx && s.tz === hit.tz);
      if (!sp) return;
      const stand = bestAdjacentStandTile(m, sp.tx, sp.tz);
      if (!stand) { setMsg("Can't reach spot"); return; }
      setMoveGoal(stand.tx, stand.tz);
      setMsg("Walk to fishing spot");
      return;
    }

    if (hit.kind === "tile") {
      if (isSolid(m, hit.tx, hit.tz)) { setMsg("Can't walk there"); return; }
      setMoveGoal(hit.tx, hit.tz);
    }
  });

  // Keys
  window.addEventListener("keydown", (e) => {
    const k = e.key.toLowerCase();
    if (k === "e") doInteract();
    if (k === "r") {
      localStorage.removeItem(SAVE_KEY);
      state = defaultState();
      rebuildWorld();
      setMsg("Reset");
      updateUI();
    }
  });

  // =========================
  // Door transitions
  // =========================
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

  function checkNpcArrival() {
    if (!state.pendingNpc) return;
    const m = getMap();
    const npc = (m.npcs || []).find(n => n.id === state.pendingNpc.id);
    if (!npc) { state.pendingNpc = null; return; }
    if (adjacentManhattan(state.player.tx, state.player.tz, npc.tx, npc.tz) === 1) {
      state.pendingNpc = null;
      openNpc(npc);
    }
  }

  // =========================
  // Movement
  // =========================
  function startNextSegment() {
    if (!state.path.length) return;
    const next = state.path[0];
    state.moveSeg = { from:{tx:state.player.tx,tz:state.player.tz}, to:{tx:next.tx,tz:next.tz}, t:0 };
  }

  function stepMovement(dt) {
    if (state.action) return;
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
      checkNpcArrival();
    }
  }

  // Animations
  const baseBodyY = body.position.y;
  function animateAction(now) {
    if (!state.action) { body.position.y = baseBodyY; return; }
    const duration = (state.action.type === "fish") ? FISH_TIME_MS : CHOP_TIME_MS;
    const phase = (state.action.endAt - now) / duration;
    const s = Math.max(0, Math.min(1, 1 - phase));
    body.position.y = baseBodyY + Math.sin(s * Math.PI * 4) * 0.03;
    player.rotation.y += 0.04;
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

  // =========================
  // Main loop
  // =========================
  let last = performance.now();
  function tick(now) {
    const dt = Math.min(0.033, (now - last) / 1000);
    last = now;

    if (state.action && now >= state.action.endAt) finishAction();

    stepMovement(dt);
    animateAction(now);
    if (state.map === "overworld") syncTreesAndStumps();
    updatePopups(now);

    const ctx = getContextAction();
    const ctxText = ctx ? `E to ${ctx.label}` : "";
    updateUI(ctxText);

    updateCamera();
    renderer.render(scene, cam);

    requestAnimationFrame(tick);
  }

  function updatePopups(now){ updatePopupsImpl(now); }
  function updatePopupsImpl(now){ 
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

  // Init UI
  renderSkillsList();
  renderSkillDetail();
  renderInventory();
  updateUI();

  requestAnimationFrame(tick);
})();