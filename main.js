(() => {
  const XP_CHOP = 25;
  const XP_MINE = 22;
  const MINE_TIME_MS = 1000;
  const ROCK_RESPAWN_MS = 6500;
  const XP_FISH = 20;
  const CHOP_TIME_MS = 900;
  const FISH_TIME_MS = 1100;
  const TREE_RESPAWN_MS = 6000;

  const TILE = 1.0;
  const LEVEL_H = 0.28;

  const OW_W = 34;
  const OW_H = 34;

  const IN_W = 10;
  const IN_H = 10;

  const INVENTORY_CAPACITY = 20;
  const BANK_VIEW_SLOTS = 30;

  const SAVE_KEY = "logger_save_0_0_1";
  const USERNAME_KEY = "logger_username_v1";

  // Username
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

  // Items
  const ITEM_DEFS = {
    log:   { name: "Logs", icon: "🪵", stackable: true },
    fish:  { name: "Raw Fish", icon: "🐟", stackable: true },
    ore_copper: { name: "Copper Ore", icon: "🟠", stackable: true },
    ore_tin:    { name: "Tin Ore", icon: "⚪️", stackable: true },
    ore_iron:   { name: "Iron Ore", icon: "🔩", stackable: true },
    axe:   { name: "Bronze Axe", icon: "🪓", stackable: false },
    rod:   { name: "Fishing Rod", icon: "🎣", stackable: false },
    pick:  { name: "Bronze Pickaxe", icon: "⛏️", stackable: false },
  };

  const SHOP_STOCK = [
    { itemId: "axe", price: 10, desc: "Required to chop trees." },
    { itemId: "rod", price: 12, desc: "Required to fish at spots." },
    { itemId: "pick", price: 11, desc: "Required to mine rocks." },
  ];

  const BUY_PRICES = { log: 2, fish: 3 };

  // Skills
    const SKILL_ORDER = [
    "Attack","Defence","Ranged","Magic","Construction","Constitution",
    "Crafting","Mining","Smithing","Fishing","Cooking","Woodcutting","Farming"
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

  // Save / Load
  function defaultState() {
    const skills = { woodcutting: { lvl: 1, xp: 0 }, fishing: { lvl: 1, xp: 0 }, constitution: { lvl: 1, xp: 0 } };
    ensureAllSkills(skills);
    return {
      map: "spawn_inn",
      player: { tx: 5, tz: 7, speedTilesPerSec: 4.2 },
      path: [],
      moveSeg: null,
      action: null, // { kind, endAt, targetId }
      pendingDoor: null,
      pendingNpc: null,
      inv: { items: [], coins: 25 },  // items = stack list: [{id, qty}]

      bank: { items: [] }, // items = stack list: [{id, qty}]

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
          { id: "f1", tx: 25, tz: 10 },
          { id: "f2", tx: 24, tz: 12 },
          { id: "f3", tx: 27, tz: 12 },
        ]
      },
      ui: { activeTab: null, selectedSkill: "woodcutting", modal: null, modalNpcId: null }
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
      s.pendingNpc ??= null;
      s.inv ??= { items: [], coins: 0 };
      s.inv.items ??= [];
      s.inv.coins ??= 0;
      s.bank ??= { items: [] };
      s.bank.items ??= [];
      s.skills ??= { woodcutting: { lvl: 1, xp: 0 }, fishing: { lvl: 1, xp: 0 }, constitution: { lvl: 1, xp: 0 } };
      ensureAllSkills(s.skills);
      s.world ??= { trees: [], fishingSpots: [] };
      s.world.trees ??= [];
      s.world.rocks ??= [];
      s.world.fishingSpots ??= [];
      s.world.rocks ??= [];
      s.ui ??= { activeTab: null, selectedSkill: "woodcutting", modal: null, modalNpcId: null };
      s.ui.activeTab ??= null;
      s.ui.selectedSkill ??= "woodcutting";
      s.ui.modal ??= null;
      s.inv.items = normalizeStacks(s.inv.items);
      s.bank.items = normalizeStacks(s.bank.items);
      s.ui.modalNpcId ??= null;
      return s;
    } catch {
      return defaultState();
    }
  }

  let state = loadState();
  function saveState() { localStorage.setItem(SAVE_KEY, JSON.stringify(state)); }
  setInterval(saveState, 5000);

  // Inventory / Bank helpers (STACKS)
// inv.items and bank.items store stacks: { id: string, qty: number }
// - Resources stack (logs, fish, etc.)
// - Tools do NOT stack (each tool consumes a slot)

function normalizeStacks(list) {
  // Accept legacy formats and normalize to [{id, qty}]
  if (!Array.isArray(list)) return [];
  if (list.length === 0) return [];
  if (typeof list[0] === "string") {
    // legacy array of itemIds
    const out = [];
    for (const id of list) {
      const def = ITEM_DEFS[id];
      if (!def) continue;
      if (def.stackable) {
        const s = out.find(x => x.id === id);
        if (s) s.qty += 1;
        else out.push({ id, qty: 1 });
      } else {
        out.push({ id, qty: 1 });
      }
    }
    return out;
  }
  // already stacks
  return list
    .filter(x => x && typeof x.id === "string" && typeof x.qty === "number")
    .map(x => ({ id: x.id, qty: Math.max(1, Math.floor(x.qty)) }));
}

function stacksUsed(list) { return list.length; }

const invUsed = () => stacksUsed(state.inv.items);
const invFree = () => INVENTORY_CAPACITY - invUsed();

function findStack(list, id) { return list.find(s => s.id === id) || null; }

const hasItem = (id) => {
  const def = ITEM_DEFS[id];
  if (!def) return false;
  const s = findStack(state.inv.items, id);
  return !!s && s.qty > 0;
};

function addItemToList(list, id, qty=1) {
  const def = ITEM_DEFS[id];
  if (!def) return false;
  qty = Math.max(1, Math.floor(qty));
  if (def.stackable) {
    const s = findStack(list, id);
    if (s) { s.qty += qty; return true; }
    // new stack needs a slot
    list.push({ id, qty });
    return true;
  } else {
    // each qty is a new slot
    for (let i=0; i<qty; i++) list.push({ id, qty: 1 });
    return true;
  }
}

function removeItemFromList(list, id, qty=1) {
  const def = ITEM_DEFS[id];
  if (!def) return false;
  qty = Math.max(1, Math.floor(qty));
  if (def.stackable) {
    const s = findStack(list, id);
    if (!s || s.qty < qty) return false;
    s.qty -= qty;
    if (s.qty <= 0) {
      const idx = list.indexOf(s);
      if (idx >= 0) list.splice(idx, 1);
    }
    return true;
  } else {
    // remove qty separate tool entries
    let removed = 0;
    for (let i=list.length-1; i>=0 && removed<qty; i--) {
      if (list[i].id === id) { list.splice(i,1); removed++; }
    }
    return removed === qty;
  }
}

function addItemToInv(id, qty=1) {
  const def = ITEM_DEFS[id];
  if (!def) return false;
  // Capacity check: stackable needs 1 slot if new stack; non-stack needs qty slots
  if (def.stackable) {
    const exists = !!findStack(state.inv.items, id);
    if (!exists && invFree() <= 0) return false;
    return addItemToList(state.inv.items, id, qty);
  } else {
    if (invFree() < qty) return false;
    return addItemToList(state.inv.items, id, qty);
  }
}

function removeOneFromInv(id) { return removeItemFromList(state.inv.items, id, 1); }

const addCoins = (n) => (state.inv.coins += n);
const spendCoins = (n) => {
  if (state.inv.coins < n) return false;
  state.inv.coins -= n;
  return true;
};

// Bank
function bankUsed() { return stacksUsed(state.bank.items); }
function addItemToBank(id, qty=1) { return addItemToList(state.bank.items, id, qty); }
function removeOneFromBank(id) { return removeItemFromList(state.bank.items, id, 1); }

// UI elements
  const btnSkills = document.getElementById("btnSkills");
  const btnInv = document.getElementById("btnInv");
  const btnZoomIn = document.getElementById("btnZoomIn");
  const btnZoomOut = document.getElementById("btnZoomOut");
  const panelSkills = document.getElementById("panelSkills");
  const panelInv = document.getElementById("panelInv");
  const skillsListEl = document.getElementById("skillsList");
  const skillNameEl = document.getElementById("skillName");
  const skillMetaEl = document.getElementById("skillMeta");
  const skillBarFillEl = document.getElementById("skillBarFill");
  const invGridEl = document.getElementById("invGrid");
  const invMetaEl = document.getElementById("invMeta");
  const coinsEl = document.getElementById("coins");
  const coinsHudEl = document.getElementById("coinsHud");
  const contextEl = document.getElementById("context");
  const msgEl = document.getElementById("msg");

  // Modal overlay
  const modalOverlay = document.getElementById("modalOverlay");
  const modalTitleEl = document.getElementById("modalTitle");
  const btnCloseModal = document.getElementById("btnCloseModal");
  const modalShopEl = document.getElementById("modalShop");
  const modalSellEl = document.getElementById("modalSell");
  const modalBankEl = document.getElementById("modalBank");
  const shopListEl = document.getElementById("shopList");
  const sellListEl = document.getElementById("sellList");
  const btnSellAll = document.getElementById("btnSellAll");
  const sellInfoEl = document.getElementById("sellInfo");
  const bankInvMetaEl = document.getElementById("bankInvMeta");
  const bankInvGridEl = document.getElementById("bankInvGrid");
  const bankMetaEl = document.getElementById("bankMeta");
  const bankGridEl = document.getElementById("bankGrid");

  let msgUntil = 0;
  const setMsg = (t, ms=1400) => { msgEl.textContent = t; msgUntil = performance.now()+ms; };

  function setTab(tabName) {
    state.ui.activeTab = (state.ui.activeTab === tabName) ? null : tabName;
    panelSkills.classList.toggle("hidden", state.ui.activeTab !== "skills");
    panelInv.classList.toggle("hidden", state.ui.activeTab !== "inv");
    btnSkills.classList.toggle("active", state.ui.activeTab === "skills");
    btnInv.classList.toggle("active", state.ui.activeTab === "inv");
    saveState();
    updateHUD();
  }
  btnSkills.addEventListener("click", () => setTab("skills"));
  btnInv.addEventListener("click", () => setTab("inv"));
  if (btnZoomIn) btnZoomIn.addEventListener("click", () => { camZoom *= 1.12; applyZoom(); });
  if (btnZoomOut) btnZoomOut.addEventListener("click", () => { camZoom /= 1.12; applyZoom(); });

  const skillDisplayName = (k) => (k === "constitution" ? "Constitution" : (k.charAt(0).toUpperCase()+k.slice(1)));
  const iconForSkill = (k) => (k==="woodcutting"?"🪓":k==="fishing"?"🎣":k==="mining"?"⛏️":k==="cooking"?"🍳":k==="magic"?"✨":"★");

  function renderSkillsList() {
    skillsListEl.innerHTML = "";
    for (const key of SKILL_ORDER.map(s=>s.toLowerCase())) {
      const sk = state.skills[key];
      const row = document.createElement("div");
      row.className = "skillRow" + (state.ui.selectedSkill===key?" active":"");
      row.addEventListener("click", () => { state.ui.selectedSkill=key; renderSkillsList(); renderSkillDetail(); saveState(); });

      const left = document.createElement("div"); left.className="left";
      const icon = document.createElement("div"); icon.className="skillIcon"; icon.textContent = iconForSkill(key);
      const name = document.createElement("div"); name.className="skillNameTxt"; name.textContent = skillDisplayName(key);
      left.append(icon,name);

      const lvl = document.createElement("div"); lvl.className="skillLvl"; lvl.textContent = "Lvl "+sk.lvl;
      row.append(left,lvl);
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
    skillMetaEl.innerHTML = `Level: <b>${sk.lvl}</b><br/>XP: <b>${sk.xp}</b><br/>XP to next: <b>${sk.lvl<99?toNext:0}</b>`;
    skillBarFillEl.style.width = (sk.lvl>=99?100:pct*100)+"%";
  }

  function renderInventoryGrid(gridEl, stacks, capacity, onClick=null) {
    gridEl.innerHTML = "";
    const slots = [...stacks];
    while (slots.length < capacity) slots.push(null);

    for (const st of slots.slice(0, capacity)) {
      const wrap = document.createElement("div"); 
      wrap.className = "invSlotWrap";

      const slot = document.createElement("div"); 
      slot.className = "invSlot" + (st ? "" : " empty");

      if (!st) {
        slot.textContent = "·";
      } else {
        const def = ITEM_DEFS[st.id];
        slot.textContent = def?.icon || "❓";

        // qty badge for stacks with qty > 1 OR stackable resources
        if ((def?.stackable && st.qty >= 1) || st.qty > 1) {
          const badge = document.createElement("div");
          badge.className = "qtyBadge";
          badge.textContent = String(st.qty);
          wrap.appendChild(badge);
        }

        if (onClick) {
          slot.style.cursor = "pointer";
          slot.addEventListener("click", () => onClick(st.id));
        }
      }

      wrap.appendChild(slot);
      gridEl.appendChild(wrap);
    }
  }

  function renderInvPanel() {
    invMetaEl.textContent = `Slots: ${invUsed()} / ${INVENTORY_CAPACITY}`;
    coinsEl.textContent = `Coins: 🪙 ${state.inv.coins}`;
    renderInventoryGrid(invGridEl, state.inv.items, INVENTORY_CAPACITY, null);
  }

  // Modal
  function closeModal() {
    state.ui.modal = null;
    state.ui.modalNpcId = null;
    modalOverlay.classList.add("hidden");
    modalOverlay.style.display = "none";
    modalShopEl.classList.add("hidden");
    modalSellEl.classList.add("hidden");
    modalBankEl.classList.add("hidden");
    saveState();
    updateHUD();
  }

  function openModal(kind, title, npcId) {
    state.ui.modal = kind;
    state.ui.modalNpcId = npcId;
    modalTitleEl.textContent = title;
    modalOverlay.classList.remove("hidden");
    modalOverlay.style.display = "flex";
    modalShopEl.classList.toggle("hidden", kind !== "shop");
    modalSellEl.classList.toggle("hidden", kind !== "sell");
    modalBankEl.classList.toggle("hidden", kind !== "bank");
    renderModal();
    saveState();
  }

  btnCloseModal.addEventListener("click", closeModal);
  // tap outside card closes
  modalOverlay.addEventListener("pointerdown", (e) => {
    if (e.target === modalOverlay) closeModal();
  });

  function renderShop() {
    shopListEl.innerHTML = "";
    for (const s of SHOP_STOCK) {
      const def = ITEM_DEFS[s.itemId];
      const row = document.createElement("div"); row.className="shopItem";
      const left = document.createElement("div"); left.className="shopLeft";
      const icon = document.createElement("div"); icon.className="shopIcon"; icon.textContent=def.icon;
      const txt = document.createElement("div"); txt.innerHTML = `<div class="shopName">${def.name}</div><div class="shopSub">${s.desc}</div>`;
      left.append(icon,txt);

      const btn = document.createElement("button"); btn.className="actionBtn"; btn.type="button";
      btn.textContent = `Buy (${s.price} 🪙)`;
      btn.disabled = (state.inv.coins < s.price) || (invFree() <= 0);
      btn.addEventListener("click", () => {
        if (invFree() <= 0) return setMsg("Inventory full");
        if (!spendCoins(s.price)) return setMsg("Not enough coins");
        addItemToInv(s.itemId);
        setMsg(`Bought ${def.name}`);
        renderModal(); renderInvPanel(); updateHUD(); saveState();
      });

      row.append(left,btn);
      shopListEl.appendChild(row);
    }
  }

  function renderSell(buysId) {
    sellListEl.innerHTML = "";
    const def = ITEM_DEFS[buysId];
    const price = BUY_PRICES[buysId] ?? 0;
    const st = state.inv.items.find(s=>s.id===buysId);
    const count = st ? st.qty : 0;
    sellInfoEl.textContent = `${def.icon} ${def.name} — ${price} coins each — You have ${count}`;

    const row = document.createElement("div"); row.className="shopItem";
    const left = document.createElement("div"); left.className="shopLeft";
    const icon = document.createElement("div"); icon.className="shopIcon"; icon.textContent=def.icon;
    const txt = document.createElement("div"); txt.innerHTML = `<div class="shopName">Sell ${def.name}</div><div class="shopSub">Sell 1 or Sell all.</div>`;
    left.append(icon,txt);

    const btn = document.createElement("button"); btn.className="actionBtn"; btn.type="button";
    btn.textContent = `Sell 1 (+${price} 🪙)`;
    btn.disabled = count <= 0;
    btn.addEventListener("click", () => {
      if (!removeOneFromInv(buysId)) return;
      addCoins(price);
      setMsg(`Sold 1 ${def.name}`);
      renderModal(); renderInvPanel(); updateHUD(); saveState();
    });

    row.append(left,btn);
    sellListEl.appendChild(row);

    btnSellAll.onclick = () => {
      const st2 = state.inv.items.find(s=>s.id===buysId);
      const n = st2 ? st2.qty : 0;
      if (n <= 0) return setMsg("Nothing to sell");
      removeItemFromList(state.inv.items, buysId, n);
      addCoins(n*price);
      setMsg(`Sold ${n} ${def.name}`);
      renderModal(); renderInvPanel(); updateHUD(); saveState();
    };
  }

  function renderBank() {
    bankInvMetaEl.textContent = `Slots: ${invUsed()} / ${INVENTORY_CAPACITY}`;
    bankMetaEl.textContent = `Items: ${state.bank.items.length} (showing ${BANK_VIEW_SLOTS})`;

    renderInventoryGrid(bankInvGridEl, state.inv.items, INVENTORY_CAPACITY, (itemId) => {
      if (!removeOneFromInv(itemId)) return;
      addItemToBank(itemId);
      setMsg(`Deposited ${ITEM_DEFS[itemId].name}`);
      renderModal(); renderInvPanel(); updateHUD(); saveState();
    });

    renderInventoryGrid(bankGridEl, state.bank.items, BANK_VIEW_SLOTS, (itemId) => {
      if (invFree() <= 0) return setMsg("Inventory full");
      if (!removeOneFromBank(itemId)) return;
      addItemToInv(itemId);
      setMsg(`Withdrew ${ITEM_DEFS[itemId].name}`);
      renderModal(); renderInvPanel(); updateHUD(); saveState();
    });
  }

  function renderModal() {
    if (!state.ui.modal) return;
    if (state.ui.modal === "shop") renderShop();
    if (state.ui.modal === "sell") {
      const npc = getNpcById(state.ui.modalNpcId);
      if (npc?.kind === "buyer_logs") renderSell("log");
      if (npc?.kind === "buyer_fish") renderSell("fish");
    }
    if (state.ui.modal === "bank") renderBank();
  }

  function updateHUD() {
    coinsHudEl.textContent = `🪙 ${state.inv.coins}`;
    if (state.ui.activeTab === "skills") { renderSkillsList(); renderSkillDetail(); }
    if (state.ui.activeTab === "inv") renderInvPanel();
    if (state.ui.modal) renderModal();
    // ensure overlay hidden state matches
    modalOverlay.classList.toggle("hidden", !state.ui.modal);
  }

  // restore panels on boot
  panelSkills.classList.add("hidden");
  panelInv.classList.add("hidden");
  btnSkills.classList.remove("active");
  btnInv.classList.remove("active");
  if (state.ui.activeTab === "skills") { state.ui.activeTab=null; setTab("skills"); }
  if (state.ui.activeTab === "inv") { state.ui.activeTab=null; setTab("inv"); }
  // don't restore modal automatically to avoid "stuck" UI
  state.ui.modal = null; state.ui.modalNpcId = null;
  modalOverlay.classList.add("hidden");
  modalOverlay.style.display = "none";

  // Maps
  function makeMap(w, h) {
    return { w, h,
      tileType: Array.from({ length: h }, () => Array(w).fill(0)),
      heightMap: Array.from({ length: h }, () => Array(w).fill(0)),
      structures: [],
      doors: [],
      bushes: [],
      npcs: []
    };
  }

  const clamp = (v,a,b)=>Math.max(a,Math.min(b,v));
  const inBounds = (m, tx, tz)=>tx>=0&&tz>=0&&tx<m.w&&tz<m.h;
  const tileY = (m, tx, tz)=>inBounds(m,tx,tz)? m.heightMap[tz][tx]*LEVEL_H : 0;
  const tileToWorld = (m, tx, tz)=>({ x:(tx-m.w/2+0.5)*TILE, z:(tz-m.h/2+0.5)*TILE });

  const overworld = makeMap(OW_W, OW_H);

  function genOverworld() {
    const m = overworld;
    for (let z=0; z<m.h; z++) for (let x=0; x<m.w; x++) {
      const cx=m.w*0.46, cz=m.h*0.46;
      const dx=(x-cx)/(m.w*0.65), dz=(z-cz)/(m.h*0.65);
      const d=Math.sqrt(dx*dx+dz*dz);
      const hill=Math.max(0,1.0-d);
      let h=clamp(Math.floor(hill*4),0,4);

      const lx=m.w*0.78, lz=m.h*0.32;
      const ldx=(x-lx)/6.0, ldz=(z-lz)/5.0;
      const lake=(ldx*ldx+ldz*ldz)<1.0;

      if(lake){ m.tileType[z][x]=2; m.heightMap[z][x]=0; }
      else { m.heightMap[z][x]=h; m.tileType[z][x]=(h>=4)?1:0; }
    }
    for (let x=0; x<m.w; x++){ m.tileType[0][x]=1; m.tileType[m.h-1][x]=1; m.heightMap[0][x]=0; m.heightMap[m.h-1][x]=0; }
    for (let z=0; z<m.h; z++){ m.tileType[z][0]=1; m.tileType[z][m.w-1]=1; m.heightMap[z][0]=0; m.heightMap[z][m.w-1]=0; }

    // village flat
    const vc={x:12,z:12};
    for(let z=vc.z-6; z<=vc.z+6; z++){
      for(let x=vc.x-6; x<=vc.x+6; x++){
        if(!inBounds(m,x,z)) continue;
        if(m.tileType[z][x]===2) m.tileType[z][x]=0;
        m.heightMap[z][x]=1;
        m.tileType[z][x]=0;
      }
    }
    const setRoad=(x,z)=>{ if(!inBounds(m,x,z))return; m.tileType[z][x]=3; m.heightMap[z][x]=1; };
    for(let x=6; x<=18; x++) setRoad(x,12);
    for(let z=7; z<=18; z++) setRoad(12,z);
    for(let x=18; x<m.w-1; x++) setRoad(x,12);
    // Ensure NPC stand tiles are land
    m.tileType[11][11]=0; m.heightMap[11][11]=1;
    m.tileType[16][7]=0; m.heightMap[16][7]=1;
    m.tileType[15][19]=0; m.heightMap[15][19]=1;

    m.structures=[]; m.doors=[];
    function addHouse(id,x0,z0,w,d,doorTx,doorTz,interiorId){
      m.structures.push({id,x0,z0,w,d,doorTx,doorTz});
      m.doors.push({ id:"door_"+id, kind:"enter", tx:doorTx, tz:doorTz, fromMap:"overworld", toMap:interiorId, returnTx:doorTx, returnTz:doorTz+1 });
    }
    addHouse("inn",10,9,5,4,12,13,"spawn_inn");
    addHouse("house_1",6,9,4,3,8,12,"house_1");
    addHouse("house_2",14,9,4,3,16,12,"house_2");
    addHouse("house_3",7,14,4,3,9,17,"house_3");
    addHouse("house_4",14,14,4,3,16,17,"house_4");

    m.bushes=[{tx:9,tz:10},{tx:15,tz:10},{tx:10,tz:16},{tx:14,tz:16},{tx:6,tz:13},{tx:18,tz:13}];

    m.npcs=[
      { id:"npc_shop", kind:"shop", name:"Tool Trader", tx:11, tz:11, icon:"🧰" },
      { id:"npc_logbuyer", kind:"buyer_logs", name:"Lumber Buyer", tx:7, tz:16, icon:"🪵" },
      { id:"npc_fishbuyer", kind:"buyer_fish", name:"Fishmonger", tx:19, tz:15, icon:"🐟" },
    ];
    const doorTx=Math.floor(m.w/2), doorTz=m.h-2;
    m.doors=[{ id:"exit_"+id, kind:"exit", tx:doorTx, tz:doorTz, fromMap:id, toMap:"overworld", returnTx:null, returnTz:null }];

    m.npcs=[];
    if(id==="spawn_inn") m.npcs.push({ id:"npc_banker", kind:"bank", name:"Banker", tx:3, tz:4, icon:"🏦" });

    m.title=title;
    interiors[id]=m;
  }
  ["spawn_inn","house_1","house_2","house_3","house_4"].forEach(id=>genInterior(id, id.replace("_"," ").toUpperCase()));

  // link exits
  for (const d of overworld.doors) {
    const interior = interiors[d.toMap];
    if (!interior) continue;
    const exitDoor = interior.doors.find(x=>x.kind==="exit");
    if (exitDoor) { exitDoor.returnTx = d.returnTx; exitDoor.returnTz = d.returnTz; }
  }

  const getMap = () => (state.map==="overworld"?overworld:(interiors[state.map]||overworld));
  const getNpcById = (id) => (getMap().npcs||[]).find(n=>n.id===id) || null;

  // Solids
  const treeAlive = (t, now=performance.now()) => now >= t.respawnAt;
  const stumpAlive = (t, now=performance.now()) => now < t.stumpUntil;
  const rockAlive = (r, now=performance.now()) => now >= r.respawnAt;
  const stubAlive = (r, now=performance.now()) => now < r.stubUntil;

  function isStructureSolid(m, tx, tz) {
    for (const s of m.structures) {
      if (tx>=s.x0 && tx<s.x0+s.w && tz>=s.z0 && tz<s.z0+s.d) {
        if (tx===s.doorTx && tz===s.doorTz) return false;
        return true;
      }
    }
    return false;
  }
  function isNpcSolid(m, tx, tz) {
    for (const n of (m.npcs||[])) if (n.tx===tx && n.tz===tz) return true;
    return false;
  }
  function isSolid(m, tx, tz) {
    if (!inBounds(m,tx,tz)) return true;
    const tt = m.tileType[tz][tx];
    if (tt===2) return true;
    if (tt===1 && state.map!=="overworld") return true;
    if (isStructureSolid(m,tx,tz)) return true;
    if (isNpcSolid(m,tx,tz)) return true;
    if (state.map==="overworld") {
      for (const tr of state.world.trees) {
        if (tr.tx===tx && tr.tz===tz && (treeAlive(tr) || stumpAlive(tr))) return true;
      }
      for (const rk of (state.world.rocks||[])) {
        if (rk.tx===tx && rk.tz===tz && (rockAlive(rk) || stubAlive(rk))) return true;
      }
    }
    return false;
  }

  const findDoorAt = (m,tx,tz)=>m.doors.find(d=>d.tx===tx&&d.tz===tz) || null;
  const adj = (aTx,aTz,bTx,bTz)=>Math.abs(aTx-bTx)+Math.abs(aTz-bTz);

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

    let camZoom = 1.06; // higher = closer
  function applyZoom() {
    camZoom = Math.max(0.6, Math.min(2.2, camZoom));
    resize();
  }

  function resize(){
    const w=window.innerWidth,h=window.innerHeight;
    renderer.setSize(w,h,false);
    const aspect=w/h, zoom=camZoom, viewSize=13;
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

  const matForTileType = (tt)=> tt===1?mats.stone:tt===2?mats.water:tt===3?mats.road:tt===4?mats.floor:mats.grass;

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
  let rockPickables = [];
  let npcPickables = [];
  let fishPickables = [];
  let stumpMeshes = new Map();
  let rockStubMeshes = new Map();

  // Marker
  const marker = new THREE.Mesh(new THREE.RingGeometry(0.14,0.26,28), new THREE.MeshBasicMaterial({ color:0xffffff, transparent:true, opacity:0.7, side:THREE.DoubleSide }));
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

  // Text sprite
  function makeTextSprite(text, style={}) {
    const c = document.createElement("canvas");
    const ctx = c.getContext("2d");
    c.width = style.w ?? 512; c.height = style.h ?? 128;
    ctx.clearRect(0,0,c.width,c.height);
    ctx.font = style.font || "bold 64px system-ui, -apple-system, Segoe UI, Roboto, Arial";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.lineWidth = style.outlineWidth ?? 12;
    ctx.strokeStyle = style.outline ?? "rgba(0,0,0,0.75)";
    ctx.strokeText(text, c.width/2, c.height/2);
    ctx.fillStyle = style.fill ?? "rgba(255,255,255,0.95)";
    ctx.fillText(text, c.width/2, c.height/2);

    const tex = new THREE.CanvasTexture(c);
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.generateMipmaps = false;

    const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent:true }));
    spr.scale.set(style.scaleX ?? 3.8, style.scaleY ?? 0.95, 1);
    return spr;
  }
  const nameTag = makeTextSprite(username, { scaleX: 3.8, scaleY: 0.95 });
  nameTag.position.set(0, 2.1, 0);
  player.add(nameTag);

  // XP popups
  const popupGroup = new THREE.Group();
  scene.add(popupGroup);
  function makePopupSprite(text) {
    const c = document.createElement("canvas");
    const ctx = c.getContext("2d");
    c.width = 320; c.height = 128;
    ctx.font = "bold 34px system-ui, -apple-system, Segoe UI, Roboto, Arial";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "rgba(0,0,0,0.6)";
    ctx.fillText(text, 14, 64);
    ctx.fillStyle = "rgba(255,255,255,0.95)";
    ctx.fillText(text, 12, 62);

    const tex = new THREE.CanvasTexture(c);
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.generateMipmaps = false;

    const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent:true }));
    spr.scale.set(2.9, 1.1, 1);
    return spr;
  }
  function spawnXpPopup(amount, icon) {
    const spr = makePopupSprite(`${icon} +${amount} XP`);
    spr.position.copy(player.position);
    spr.position.y += 1.85;
    spr.userData = { start: performance.now(), life: 1100 };
    popupGroup.add(spr);
  }
  function updatePopups(now) {
    for (let i=popupGroup.children.length-1; i>=0; i--) {
      const spr = popupGroup.children[i];
      const t = (now - spr.userData.start) / spr.userData.life;
      if (t >= 1) {
        popupGroup.remove(spr);
        if (spr.material?.map) spr.material.map.dispose();
        if (spr.material) spr.material.dispose();
        continue;
      }
      spr.position.y += 0.0024 * (1 + (1 - t) * 2);
      spr.material.opacity = 1 - t;
    }
  }

  // Helpers
  function clearGroup(g) {
    while (g.children.length) {
      const c = g.children.pop();
      if (c.geometry) c.geometry.dispose?.();
      if (c.material) {
        if (Array.isArray(c.material)) c.material.forEach(m=>m.dispose?.());
        else c.material.dispose?.();
      }
    }
  }

  function makeRockMesh(kind='copper') {
    const g = new THREE.Group();
    const color = kind==='iron' ? 0x6c7a87 : kind==='tin' ? 0xc9d1d9 : 0xd9893d;
    const mat = new THREE.MeshStandardMaterial({ color, roughness: 1, metalness: 0 });
    const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(0.34, 0), mat);
    rock.position.y = 0.22;
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.32,0.36,0.08,18), new THREE.MeshStandardMaterial({ color:0x2a3647, roughness:1, metalness:0 }));
    base.position.y = 0.04;
    g.add(base, rock);
    return g;
  }

  function makeTreeMesh() {
    const g = new THREE.Group();
    const foliageMat = new THREE.MeshStandardMaterial({ color:0x2f8a3a, roughness:1, metalness:0 });
    const trunkMat = new THREE.MeshStandardMaterial({ color:0x7a4a2a, roughness:1, metalness:0 });
    const foliage = new THREE.Mesh(new THREE.SphereGeometry(0.55,18,14), foliageMat); foliage.position.y=1.15;
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.15,0.2,0.9,14), trunkMat); trunk.position.y=0.45;
    g.add(foliage,trunk);
    return g;
  }

  function makeDoorModel(labelText="DOOR") {
    const g = new THREE.Group();
    const frame = new THREE.Mesh(new THREE.BoxGeometry(0.92, 0.95, 0.14), mats.doorFrame);
    frame.position.y = 0.55;
    const door = new THREE.Mesh(new THREE.BoxGeometry(0.74, 0.85, 0.10), mats.door);
    door.position.y = 0.50;
    door.position.z = 0.03;
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.045, 12, 10), new THREE.MeshStandardMaterial({ color: 0xf2d56b, roughness:0.6, metalness:0.35 }));
    knob.position.set(0.22, 0.48, 0.08);

    // brighter sign for visibility
    const sign = new THREE.Mesh(
      new THREE.BoxGeometry(0.46, 0.20, 0.06),
      new THREE.MeshStandardMaterial({ color: 0x9ddcff, roughness:0.6, metalness:0.05, emissive:0x1b3c55, emissiveIntensity: 0.85 })
    );
    sign.position.set(0, 0.97, 0.03);

    const text = makeTextSprite(labelText, { w: 512, h: 128, font:"bold 56px system-ui", scaleX:1.8, scaleY:0.45, fill:"rgba(0,0,0,0.9)", outline:"rgba(0,0,0,0)" });
    text.position.set(0, 0.97, 0.08);

    g.add(frame, door, knob, sign, text);
    return g;
  }

  function makeNpcMesh(npc) {
    const g = new THREE.Group();
    const color =
      npc.kind === "bank" ? 0x46c3ff :
      npc.kind === "shop" ? 0xffc24a :
      npc.kind === "buyer_logs" ? 0x7cd992 :
      npc.kind === "buyer_fish" ? 0xff7aa8 :
      0xbfd3ff;

    const mat = new THREE.MeshStandardMaterial({ color, roughness:1, metalness:0 });
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.22, 0.35, 6, 12), mat);
    body.position.y = 0.55;
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.26,0.26,0.08,18), new THREE.MeshStandardMaterial({ color: 0x2a3647, roughness:1, metalness:0 }));
    base.position.y = 0.04;
    g.add(base, body);

    const label = makeTextSprite(`${npc.icon} ${npc.name}`, { font:"bold 52px system-ui", scaleX:4.6, scaleY:0.9 });
    label.position.set(0, 1.85, 0);
    g.add(label);

    g.userData = { kind:"npc", npcId: npc.id, tx: npc.tx, tz: npc.tz };
    return g;
  }

  function makeFishingSpotMesh(spot) {
    const g = new THREE.Group();
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.18,0.32,24), new THREE.MeshBasicMaterial({ color:0x9ddcff, transparent:true, opacity:0.75, side:THREE.DoubleSide }));
    ring.rotation.x = -Math.PI/2;
    ring.position.y = 0.04;
    const bobber = new THREE.Mesh(new THREE.SphereGeometry(0.08, 14, 10), new THREE.MeshStandardMaterial({ color:0xff4a4a, roughness:0.8, metalness:0 }));
    bobber.position.set(0.12, 0.12, -0.08);
    const txt = makeTextSprite("🎣", { font:"bold 64px system-ui", scaleX:1.3, scaleY:0.8 });
    txt.position.set(0, 0.65, 0);
    g.add(ring, bobber, txt);
    g.userData = { kind:"fishspot", spotId: spot.id, tx: spot.tx, tz: spot.tz };
    return g;
  }

  function placePlayerAtTile(tx,tz){
    const m=getMap();
    const p=tileToWorld(m,tx,tz);
    player.position.set(p.x, tileY(m,tx,tz), p.z);
  }

  function rebuildWorld() {
    clearGroup(tileGroup); clearGroup(decoGroup); clearGroup(structureGroup); clearGroup(resourceGroup); clearGroup(npcGroup);
    pickables=[]; doorPickables=[]; treePickables=[]; rockPickables=[]; npcPickables=[]; fishPickables=[]; stumpMeshes=new Map(); rockStubMeshes=new Map();

    const m = getMap();

    // Tiles
    for (let tz=0; tz<m.h; tz++) for (let tx=0; tx<m.w; tx++) {
      const tt=m.tileType[tz][tx];
      const y=tileY(m,tx,tz);
      const pos=tileToWorld(m,tx,tz);
      const levels=m.heightMap[tz][tx];

      for (let i=0; i<levels; i++) {
        const side=new THREE.Mesh(tileSideGeo, mats.side);
        side.position.set(pos.x, i*LEVEL_H + LEVEL_H/2 - 0.04, pos.z);
        tileGroup.add(side);
      }
      const top=new THREE.Mesh(tileTopGeo, matForTileType(tt));
      top.position.set(pos.x, y+0.02, pos.z);
      top.userData={ kind:"tile", tx, tz };
      tileGroup.add(top);
      pickables.push(top);
    }

    // Structures (houses)
    for (const s of m.structures) {
      const centerX=s.x0+s.w/2-0.5, centerZ=s.z0+s.d/2-0.5;
      const wp=tileToWorld(m, centerX, centerZ);
      const baseY=tileY(m, s.x0, s.z0);
      const isFurniture = (s.doorTx < 0);
      if (isFurniture) {
        const box=new THREE.Mesh(new THREE.BoxGeometry(s.w*TILE,0.45,s.d*TILE), mats.stone);
        box.position.set(wp.x, baseY+0.25, wp.z);
        structureGroup.add(box);
      } else {
        const bodyM=new THREE.Mesh(new THREE.BoxGeometry(s.w*TILE,1.2,s.d*TILE), mats.house);
        bodyM.position.set(wp.x, baseY+0.6, wp.z);
        structureGroup.add(bodyM);

        const roof=new THREE.Mesh(new THREE.ConeGeometry(Math.max(s.w,s.d)*0.65,0.75,4), mats.roof);
        roof.position.set(wp.x, baseY+1.35, wp.z);
        roof.rotation.y=Math.PI/4;
        structureGroup.add(roof);
      }
    }

    // Doors: ALWAYS render a door model for each door in m.doors (fixes interior visibility)
    for (const d of m.doors) {
      const dwp = tileToWorld(m, d.tx, d.tz);
      const label = (d.kind === "exit") ? "EXIT" : "DOOR";
      const doorModel = makeDoorModel(label);

      // Place at appropriate edge of tile so it looks like a doorway
      const baseY = tileY(m, d.tx, d.tz) + 0.05;

      let zOff = -0.46;
      let rotY = 0;

      if (state.map !== "overworld" && d.kind === "exit") {
        // Interior exit is on the bottom wall; place on south edge
        zOff = +0.46;
        rotY = Math.PI;
      }

      doorModel.position.set(dwp.x, baseY, dwp.z + zOff);
      doorModel.rotation.y = rotY;
      doorModel.userData = { kind:"door", tx:d.tx, tz:d.tz };
      structureGroup.add(doorModel);
      doorPickables.push(doorModel);

      // Extra: floor marker at interior door tile
      if (state.map !== "overworld" && d.kind === "exit") {
        const ring = new THREE.Mesh(
          new THREE.RingGeometry(0.22,0.34,26),
          new THREE.MeshBasicMaterial({ color:0x9ddcff, transparent:true, opacity:0.75, side:THREE.DoubleSide })
        );
        ring.rotation.x = -Math.PI/2;
        ring.position.set(dwp.x, tileY(m, d.tx, d.tz) + 0.03, dwp.z);
        decoGroup.add(ring);
      }
    }

    // Bushes
    for (const b of m.bushes || []) {
      const p=tileToWorld(m,b.tx,b.tz);
      const y=tileY(m,b.tx,b.tz);
      const bush=new THREE.Mesh(new THREE.SphereGeometry(0.38,16,12), mats.bush);
      bush.position.set(p.x+0.12, y+0.35, p.z-0.08);
      decoGroup.add(bush);
    }

    // Trees / stumps / fishing in overworld
    if (state.map==="overworld") {
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

      // Rocks / stubs
      for (const rk of (state.world.rocks||[])) {
        const rock = makeRockMesh(rk.kind);
        rock.userData = { kind:"rock", rockId: rk.id, tx: rk.tx, tz: rk.tz };
        resourceGroup.add(rock);
        rockPickables.push(rock);

        const stub = new THREE.Mesh(new THREE.CylinderGeometry(0.26,0.30,0.18,16), new THREE.MeshStandardMaterial({ color:0x3a3f46, roughness:1, metalness:0 }));
        stub.userData = { kind:"rockstub", rockId: rk.id };
        resourceGroup.add(stub);
        rockStubMeshes.set(rk.id, stub);
      }
      syncRocksAndStubs();

      for (const sp of (state.world.fishingSpots||[])) {
        const mesh = makeFishingSpotMesh(sp);
        const wp = tileToWorld(overworld, sp.tx, sp.tz);
        mesh.position.set(wp.x, tileY(overworld, sp.tx, sp.tz)+0.02, wp.z);
        npcGroup.add(mesh);
        fishPickables.push(mesh);
      }
    }

    // NPCs
    for (const npc of (m.npcs || [])) {
      const mesh = makeNpcMesh(npc);
      const wp=tileToWorld(m,npc.tx,npc.tz);
      mesh.position.set(wp.x, tileY(m,npc.tx,npc.tz), wp.z);
      npcGroup.add(mesh);
      npcPickables.push(mesh);
    }

    placePlayerAtTile(state.player.tx, state.player.tz);
    marker.visible=false;
  }

  if (state.map !== "overworld" && !interiors[state.map]) state.map = "spawn_inn";
  rebuildWorld();

  function syncRocksAndStubs() {
    if (state.map!=="overworld") return;
    const m=overworld;
    const now=performance.now();
    for (const rockObj of rockPickables) {
      const rk=(state.world.rocks||[]).find(r=>r.id===rockObj.userData.rockId);
      if(!rk) continue;
      const alive=rockAlive(rk,now);
      const stubOn=stubAlive(rk,now);
      const pos=tileToWorld(m,rk.tx,rk.tz);
      const y=tileY(m,rk.tx,rk.tz);
      rockObj.visible=alive;
      rockObj.position.set(pos.x,y,pos.z);
      const stub=rockStubMeshes.get(rk.id);
      if(stub){
        stub.visible = (!alive) && stubOn;
        stub.position.set(pos.x, y+0.08, pos.z);
      }
    }
  }

  function syncTreesAndStumps() {
    if (state.map!=="overworld") return;
    const m=overworld;
    const now=performance.now();
    for (const treeObj of treePickables) {
      const tr=state.world.trees.find(t=>t.id===treeObj.userData.treeId);
      if(!tr) continue;
      const alive=treeAlive(tr,now);
      const stumpOn=stumpAlive(tr,now);
      const pos=tileToWorld(m,tr.tx,tr.tz);
      const y=tileY(m,tr.tx,tr.tz);
      treeObj.visible=alive;
      treeObj.position.set(pos.x,y,pos.z);
      const stump=stumpMeshes.get(tr.id);
      if (stump) {
        stump.visible=(!alive)&&stumpOn;
        stump.position.set(pos.x,y+0.12,pos.z);
      }
    }
  }

  // Raycast
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  function pickFromEvent(ev) {
    const rect=renderer.domElement.getBoundingClientRect();
    const x=(ev.clientX-rect.left)/rect.width;
    const y=(ev.clientY-rect.top)/rect.height;
    pointer.x = x*2-1;
    pointer.y = -(y*2-1);
    raycaster.setFromCamera(pointer, cam);

    const objects = pickables.concat(doorPickables).concat(treePickables.filter(t=>t.visible)).concat(npcPickables).concat(fishPickables);
    const hits = raycaster.intersectObjects(objects, true);
    if (!hits.length) return null;

    for (const h of hits) {
      let cur=h.object;
      while (cur && cur!==scene) {
        if (cur.userData?.kind==="door") return { kind:"door", tx:cur.userData.tx, tz:cur.userData.tz };
        if (cur.userData?.kind==="tree") return { kind:"tree", treeId:cur.userData.treeId, tx:cur.userData.tx, tz:cur.userData.tz };
        if (cur.userData?.kind==="rock") return { kind:"rock", rockId:cur.userData.rockId, tx:cur.userData.tx, tz:cur.userData.tz };
        if (cur.userData?.kind==="npc") return { kind:"npc", npcId:cur.userData.npcId, tx:cur.userData.tx, tz:cur.userData.tz };
        if (cur.userData?.kind==="fishspot") return { kind:"fishspot", spotId:cur.userData.spotId, tx:cur.userData.tx, tz:cur.userData.tz };
        cur=cur.parent;
      }
    }
    const hit = hits[0].object;
    if (hit.userData?.kind==="tile") return { kind:"tile", tx:hit.userData.tx, tz:hit.userData.tz };
    return null;
  }

  // A*
  const key = (tx,tz)=>tx+","+tz;
  const heuristic = (a,b)=>Math.abs(a.tx-b.tx)+Math.abs(a.tz-b.tz);
  function neighbors(m,n){
    return [
      {tx:n.tx+1,tz:n.tz},{tx:n.tx-1,tz:n.tz},{tx:n.tx,tz:n.tz+1},{tx:n.tx,tz:n.tz-1},
    ].filter(p=>inBounds(m,p.tx,p.tz) && !isSolid(m,p.tx,p.tz));
  }
  function moveCost(m,a,b){
    const dh=m.heightMap[b.tz][b.tx]-m.heightMap[a.tz][a.tx];
    return 1 + Math.max(0,dh)*0.5;
  }
  function astar(m,start,goal){
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
    const m=getMap();
    if (isSolid(m,goalTx,goalTz)) return setMsg("Can't walk there");
    const path=astar(m,{tx:state.player.tx,tz:state.player.tz},{tx:goalTx,tz:goalTz});
    if(!path.length) return setMsg("No path");
    state.path=path;
    state.moveSeg=null;
    marker.visible=true;
    const wp=tileToWorld(m,goalTx,goalTz);
    marker.position.set(wp.x, tileY(m,goalTx,goalTz)+0.03, wp.z);
  }

  function bestAdjacent(m, tx, tz) {
    const opts = [
      {tx:tx+1,tz:tz},{tx:tx-1,tz:tz},{tx:tx,tz:tz+1},{tx:tx,tz:tz-1},
    ].filter(p=>inBounds(m,p.tx,p.tz) && !isSolid(m,p.tx,p.tz));
    if(!opts.length) return null;
    const px=state.player.tx,pz=state.player.tz;
    opts.sort((a,b)=> (Math.abs(a.tx-px)+Math.abs(a.tz-pz)) - (Math.abs(b.tx-px)+Math.abs(b.tz-pz)) );
    return opts[0];
  }

  // Context action for E
  function getContextAction() {
    const m=getMap();
    if (state.ui.modal) return null; // don't show / interact while modal open

    for (const n of (m.npcs||[])) {
      if (adj(state.player.tx,state.player.tz,n.tx,n.tz)===1) {
        if (n.kind==="shop") return {type:"npc", npc:n, label:"Trade"};
        if (n.kind==="bank") return {type:"npc", npc:n, label:"Bank"};
        if (n.kind==="buyer_logs") return {type:"npc", npc:n, label:"Sell Logs"};
        if (n.kind==="buyer_fish") return {type:"npc", npc:n, label:"Sell Fish"};
        return {type:"npc", npc:n, label:"Talk"};
      }
    }
    for (const d of m.doors) {
      if (adj(state.player.tx,state.player.tz,d.tx,d.tz)===1) return {type:"door", door:d, label:"Enter/Exit"};
    }
    if (state.map==="overworld") {
      for (const sp of (state.world.fishingSpots||[])) {
        if (adj(state.player.tx,state.player.tz,sp.tx,sp.tz)===1) return {type:"fish", spot:sp, label:"Fish"};
      }
      const now=performance.now();
      for (const tr of state.world.trees) {
        if (!treeAlive(tr,now)) continue;
        if (adj(state.player.tx,state.player.tz,tr.tx,tr.tz)===1) return {type:"tree", tree:tr, label:"Chop Tree"};
      }
    }
    return null;
  }

  function doInteract() {
    if (state.action) return setMsg("Busy...");
    if (state.ui.modal) return; // modal uses X / tap outside

    const ctx=getContextAction();
    if(!ctx) return setMsg("Nothing to interact with");

    if(ctx.type==="npc"){
      const n=ctx.npc;
      if(n.kind==="shop") openModal("shop","Tool Trader",n.id);
      if(n.kind==="bank") openModal("bank","Bank",n.id);
      if(n.kind==="buyer_logs") openModal("sell","Lumber Buyer",n.id);
      if(n.kind==="buyer_fish") openModal("sell","Fishmonger",n.id);
      return;
    }
    if(ctx.type==="door"){
      setMoveGoal(ctx.door.tx, ctx.door.tz);
      state.pendingDoor = { doorId: ctx.door.id };
      return setMsg("Entering...");
    }
    if(ctx.type==="tree"){
      if(!hasItem("axe")) return setMsg("You need an Axe");
      state.path=[]; state.moveSeg=null;
      state.action = { kind:"chop", endAt: performance.now()+CHOP_TIME_MS, targetId: ctx.tree.id };
      return setMsg("Chopping...");
    }
    if(ctx.type==="fish"){
      if(!hasItem("rod")) return setMsg("You need a Fishing Rod");
      state.path=[]; state.moveSeg=null;
      state.action = { kind:"fish", endAt: performance.now()+FISH_TIME_MS, targetId: ctx.spot.id };
      return setMsg("Fishing...");
    }
    if(ctx.type==="rock"){
      if(!hasItem("pick")) return setMsg("You need a Pickaxe");
      state.path=[]; state.moveSeg=null;
      state.action = { kind:"mine", endAt: performance.now()+MINE_TIME_MS, targetId: ctx.rock.id };
      return setMsg("Mining...");
    }
  }

  // Pointer down
  renderer.domElement.addEventListener("wheel", (ev) => {
    // Zoom with trackpad/mouse wheel
    ev.preventDefault();
    const delta = Math.sign(ev.deltaY);
    if (delta > 0) camZoom /= 1.08; else camZoom *= 1.08;
    applyZoom();
  }, { passive: false });

  renderer.domElement.addEventListener("pointerdown", (ev) => {
    if (state.action) return setMsg("Busy...");
    if (state.ui.modal) return; // don't click world through modal

    const hit=pickFromEvent(ev);
    if(!hit) return;
    const m=getMap();

    if(hit.kind==="npc"){
      const npc=(m.npcs||[]).find(n=>n.id===hit.npcId);
      if(!npc) return;
      const stand=bestAdjacent(m,npc.tx,npc.tz);
      if(!stand) return setMsg("Can't reach");
      setMoveGoal(stand.tx, stand.tz);
      state.pendingNpc = { npcId: npc.id };
      return setMsg("Approaching...");
    }

    if(hit.kind==="door"){
      const door=findDoorAt(m, hit.tx, hit.tz);
      if(!door) return;
      setMoveGoal(hit.tx, hit.tz);
      state.pendingDoor = { doorId: door.id };
      return setMsg("Entering...");
    }

    if(hit.kind==="fishspot"){
      const sp=(state.world.fishingSpots||[]).find(s=>s.id===hit.spotId) || (state.world.fishingSpots||[]).find(s=>s.tx===hit.tx&&s.tz===hit.tz);
      if(!sp) return;
      const stand=bestAdjacent(overworld, sp.tx, sp.tz);
      if(!stand) return setMsg("Can't reach");
      setMoveGoal(stand.tx, stand.tz);
      return setMsg("Walk to fishing spot");
    }

    if(hit.kind==="rock" && state.map==="overworld"){
      const rk=(state.world.rocks||[]).find(r=>r.id===hit.rockId);
      if(!rk || !rockAlive(rk)) return setMsg("No rock");
      const stand=bestAdjacent(m, rk.tx, rk.tz);
      if(!stand) return setMsg("Can't reach rock");
      setMoveGoal(stand.tx, stand.tz);
      return setMsg("Walk to rock");
    }

    if(hit.kind==="tree" && state.map==="overworld"){
      const tr=state.world.trees.find(t=>t.id===hit.treeId);
      if(!tr || !treeAlive(tr)) return setMsg("No tree");
      const stand=bestAdjacent(m, tr.tx, tr.tz);
      if(!stand) return setMsg("Can't reach tree");
      setMoveGoal(stand.tx, stand.tz);
      return setMsg("Walk to tree");
    }

    if(hit.kind==="tile"){
      if(isSolid(m, hit.tx, hit.tz)) return setMsg("Can't walk there");
      setMoveGoal(hit.tx, hit.tz);
    }
  });

  // Keyboard
  window.addEventListener("keydown", (e) => {
    const k=e.key.toLowerCase();
    if(k==="e") doInteract();
    if(k==="escape") closeModal();
    if(k==="+" || k==="="){ camZoom *= 1.12; applyZoom(); }
    if(k==="-" || k==="_"){ camZoom /= 1.12; applyZoom(); }
    if(k==="r"){
      localStorage.removeItem(SAVE_KEY);
      state=defaultState();
      closeModal();
      rebuildWorld();
      setMsg("Reset");
      updateHUD();
    }
  });

  // Actions
  function addXp(skillKey, amount) {
    const sk=state.skills[skillKey];
    sk.xp += amount;
    while (sk.lvl < 99 && sk.xp >= xpForLevel(sk.lvl+1)) { sk.lvl++; addCoins(1); }
  }

  function finishChop() {
    const now=performance.now();
    const tr=state.world.trees.find(t=>t.id===state.action.targetId);
    state.action=null;
    if(!tr) return;

    const added=addItemToInv("log");
    setMsg(added ? "You get some logs" : "Inventory full (log dropped)");
    addXp("woodcutting", XP_CHOP);
    spawnXpPopup(XP_CHOP, "🪵");
    if(Math.random()<0.35) addCoins(1);

    tr.respawnAt = now + TREE_RESPAWN_MS;
    tr.stumpUntil = tr.respawnAt;

    saveState(); updateHUD();
  }

  function finishMine() {
    const now=performance.now();
    const rk=(state.world.rocks||[]).find(r=>r.id===state.action.targetId);
    state.action=null;
    if(!rk) return;

    const itemId = rk.kind === "iron" ? "ore_iron" : rk.kind === "tin" ? "ore_tin" : "ore_copper";
    const added = addItemToInv(itemId);
    setMsg(added ? `You mine ${ITEM_DEFS[itemId].name}` : "Inventory full (ore dropped)");
    addXp("mining", XP_MINE);
    spawnXpPopup(XP_MINE, "⛏️");
    if (Math.random() < 0.25) addCoins(1);

    rk.respawnAt = now + ROCK_RESPAWN_MS;
    rk.stubUntil = rk.respawnAt;

    saveState(); updateHUD();
  }

  function finishFish() {
    state.action=null;
    const added=addItemToInv("fish");
    setMsg(added ? "You catch a fish" : "Inventory full (fish dropped)");
    addXp("fishing", XP_FISH);
    spawnXpPopup(XP_FISH, "🐟");
    if(Math.random()<0.25) addCoins(1);

    saveState(); updateHUD();
  }

  // Arrival triggers
  function checkDoorArrival() {
    if(!state.pendingDoor) return;
    const m=getMap();
    const door=m.doors.find(d=>d.id===state.pendingDoor.doorId);
    if(!door){ state.pendingDoor=null; return; }

    if(state.player.tx===door.tx && state.player.tz===door.tz){
      if(door.kind==="enter"){
        state.map = door.toMap;
        const interior=interiors[state.map];
        const exitDoor=interior.doors.find(x=>x.kind==="exit");
        state.player.tx = exitDoor.tx;
        state.player.tz = exitDoor.tz - 1;
      } else {
        state.map = "overworld";
        state.player.tx = door.returnTx ?? 12;
        state.player.tz = door.returnTz ?? 14;
      }
      state.path=[]; state.moveSeg=null; state.pendingDoor=null;
      rebuildWorld();
      setMsg("Welcome");
      saveState(); updateHUD();
    }
  }

  function checkNpcArrival() {
    if(!state.pendingNpc) return;
    const m=getMap();
    const npc=(m.npcs||[]).find(n=>n.id===state.pendingNpc.npcId);
    if(!npc){ state.pendingNpc=null; return; }
    if(adj(state.player.tx,state.player.tz,npc.tx,npc.tz)===1){
      if(npc.kind==="shop") openModal("shop","Tool Trader",npc.id);
      if(npc.kind==="bank") openModal("bank","Bank",npc.id);
      if(npc.kind==="buyer_logs") openModal("sell","Lumber Buyer",npc.id);
      if(npc.kind==="buyer_fish") openModal("sell","Fishmonger",npc.id);
      state.pendingNpc=null;
      updateHUD();
    }
  }

  // Movement
  function startNextSegment() {
    if(!state.path.length) return;
    const next=state.path[0];
    state.moveSeg={ from:{tx:state.player.tx,tz:state.player.tz}, to:{tx:next.tx,tz:next.tz}, t:0 };
  }

  function stepMovement(dt) {
    if(state.action) return;
    if(!state.moveSeg){
      if(!state.path.length) return;
      startNextSegment();
      if(!state.moveSeg) return;
    }
    const seg=state.moveSeg;
    seg.t += state.player.speedTilesPerSec * dt;
    const t=Math.min(1, seg.t);

    const m=getMap();
    const a=tileToWorld(m, seg.from.tx, seg.from.tz);
    const b=tileToWorld(m, seg.to.tx, seg.to.tz);
    const ay=tileY(m, seg.from.tx, seg.from.tz);
    const by=tileY(m, seg.to.tx, seg.to.tz);

    player.position.x = a.x + (b.x-a.x)*t;
    player.position.z = a.z + (b.z-a.z)*t;
    player.position.y = ay + (by-ay)*t;

    const dx=(b.x-a.x), dz=(b.z-a.z);
    if(Math.abs(dx)+Math.abs(dz)>1e-6) player.rotation.y = Math.atan2(dx,dz);

    if(seg.t>=1){
      state.player.tx=seg.to.tx;
      state.player.tz=seg.to.tz;
      state.path.shift();
      state.moveSeg=null;
      if(!state.path.length) marker.visible=false;

      checkDoorArrival();
      checkNpcArrival();
    }
  }

  // Action animation
  const baseBodyY=body.position.y;
  function animateAction(now) {
    if(!state.action){ body.position.y=baseBodyY; return; }
    const total = state.action.kind==="fish" ? FISH_TIME_MS : (state.action.kind==="mine" ? MINE_TIME_MS : CHOP_TIME_MS);
    const s = Math.max(0, Math.min(1, 1 - (state.action.endAt - now)/total));
    body.position.y = baseBodyY + Math.sin(s*Math.PI*4)*0.03;
    player.rotation.y += (state.action.kind==="fish")?0.04:(state.action.kind==="mine"?0.05:0.06);
  }

  function updateCamera() {
    const pos=player.position;
    const follow=new THREE.Vector3(pos.x,pos.y,pos.z);
    const offset=new THREE.Vector3(14,14,14);
    cam.position.copy(follow).add(offset);
    cam.rotation.order="YXZ";
    cam.rotation.y=Math.PI/4;
    cam.rotation.x=-ISO_PITCH;
    cam.lookAt(follow);
  }

  // Main loop
  let last=performance.now();
  function tick(now){
    const dt=Math.min(0.033,(now-last)/1000);
    last=now;

    if(state.action && now>=state.action.endAt){
      if(state.action.kind==="chop") finishChop();
      if(state.action.kind==="mine") finishMine();
      if(state.action.kind==="fish") finishFish();
    }

    stepMovement(dt);
    animateAction(now);
    if(state.map==="overworld") { syncTreesAndStumps(); syncRocksAndStubs(); }
    updatePopups(now);

    const ctx=getContextAction();
    contextEl.textContent = ctx ? `E to ${ctx.label}` : "";
    if(performance.now()>msgUntil) msgEl.textContent="";

    updateHUD();
    updateCamera();
    renderer.render(scene,cam);
    requestAnimationFrame(tick);
  }

  // init UI
  renderSkillsList();
  renderSkillDetail();
  renderInvPanel();
  updateHUD();
  requestAnimationFrame(tick);
})();