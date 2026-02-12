/* Isometric 3D Tilemap Starter (Three.js, no build tools)
   What you get:
   - True isometric orthographic camera
   - A tilemap grid with:
       * tile types (grass, stone, water)
       * per-tile height (stacked blocks)
       * solid tiles (water blocks movement)
   - Tap/click a tile to move (snaps to tile centers)
   - Simple A* pathfinding over tiles (4-direction)
   - Player smoothly follows tile heights
   - Tree resource node placed on a tile; gather with E
   - Inventory + XP + autosave
*/

(() => {
  // ---------- Save / Load ----------
  const SAVE_KEY = "iso_rpg_tilemap_save_v1";

  function defaultState() {
    return {
      player: { tx: 2, tz: 2, speedTilesPerSec: 4.2 },
      path: [], // list of {tx,tz}
      inv: { logs: 0, coins: 0 },
      skills: { woodcutting: { lvl: 1, xp: 0 } },
      world: {
        tree: { tx: 9, tz: 6, respawnAt: 0 }
      }
    };
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return defaultState();
      const s = JSON.parse(raw);
      if (!s?.player) return defaultState();
      return s;
    } catch {
      return defaultState();
    }
  }

  function saveState() {
    localStorage.setItem(SAVE_KEY, JSON.stringify(state));
  }

  let state = loadState();
  setInterval(saveState, 5000);

  // ---------- XP curve (simple RS-like approximation) ----------
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

  // ---------- UI ----------
  const statsEl = document.getElementById("stats");
  const invEl = document.getElementById("inv");
  function updateUI(extra = "") {
    const wc = state.skills.woodcutting;
    const nextXp = xpForLevel(wc.lvl + 1);
    statsEl.textContent = `Woodcutting: Lvl ${wc.lvl} (${wc.xp} XP) — Next: ${wc.lvl < 99 ? nextXp : "MAX"}${extra ? " — " + extra : ""}`;
    invEl.textContent = `Inventory: Logs ${state.inv.logs} | Coins ${state.inv.coins}`;
  }

  // ---------- Tilemap data ----------
  // tileType: 0 grass, 1 stone, 2 water
  // height: integer (0..n)
  // solid: true blocks movement
  const TILE = 1.0;
  const H = 0.28; // height per level

  // You can edit these directly to design your world.
  // 12x12 map.
  const tileType = [
    [0,0,0,0,0,0,0,0,0,0,0,0],
    [0,0,0,0,0,0,0,0,0,0,0,0],
    [0,0,0,1,1,1,0,0,0,0,0,0],
    [0,0,0,1,2,1,0,0,0,0,0,0],
    [0,0,0,1,2,1,0,0,0,0,0,0],
    [0,0,0,1,1,1,0,0,0,0,0,0],
    [0,0,0,0,0,0,0,0,0,0,0,0],
    [0,0,0,0,0,0,0,0,0,0,0,0],
    [0,0,0,0,0,0,0,0,0,0,0,0],
    [0,0,0,0,0,0,0,0,0,0,0,0],
    [0,0,0,0,0,0,0,0,0,0,0,0],
    [0,0,0,0,0,0,0,0,0,0,0,0],
  ];

  const heightMap = [
    [0,0,0,0,0,0,0,0,0,0,0,0],
    [0,1,1,1,1,1,1,1,0,0,0,0],
    [0,1,2,2,2,2,2,1,0,0,0,0],
    [0,1,2,3,3,3,2,1,0,0,0,0],
    [0,1,2,3,4,3,2,1,0,0,0,0],
    [0,1,2,3,3,3,2,1,0,0,0,0],
    [0,1,2,2,2,2,2,1,0,0,0,0],
    [0,1,1,1,1,1,1,1,0,0,0,0],
    [0,0,0,0,0,0,0,0,0,0,0,0],
    [0,0,0,0,0,0,0,0,0,0,0,0],
    [0,0,0,0,0,0,0,0,0,0,0,0],
    [0,0,0,0,0,0,0,0,0,0,0,0],
  ];

  const MAP_W = tileType[0].length;
  const MAP_H = tileType.length;

  function inBounds(tx, tz) {
    return tx >= 0 && tz >= 0 && tx < MAP_W && tz < MAP_H;
  }

  function isSolid(tx, tz) {
    if (!inBounds(tx, tz)) return true;
    return tileType[tz][tx] === 2; // water is solid for now
  }

  function tileY(tx, tz) {
    if (!inBounds(tx, tz)) return 0;
    return heightMap[tz][tx] * H;
  }

  function tileToWorld(tx, tz) {
    // center tiles around origin
    const x = (tx - MAP_W / 2 + 0.5) * TILE;
    const z = (tz - MAP_H / 2 + 0.5) * TILE;
    return { x, z };
  }

  function worldToTile(x, z) {
    const tx = Math.floor(x / TILE + MAP_W / 2);
    const tz = Math.floor(z / TILE + MAP_H / 2);
    return { tx, tz };
  }

  // ---------- Three.js Setup ----------
  const canvas = document.getElementById("game");
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(window.innerWidth, window.innerHeight, false);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0f1724);

  // Lighting
  scene.add(new THREE.HemisphereLight(0xffffff, 0x223344, 0.95));
  const dir = new THREE.DirectionalLight(0xffffff, 0.9);
  dir.position.set(8, 12, 6);
  scene.add(dir);

  // Isometric orthographic camera
  const ISO_YAW = Math.PI / 4;
  const ISO_PITCH = Math.atan(Math.sqrt(1/2));
  const cam = new THREE.OrthographicCamera(-6, 6, 6, -6, 0.1, 200);

  function resize() {
    const w = window.innerWidth, h = window.innerHeight;
    renderer.setSize(w, h, false);
    const aspect = w / h;
    const zoom = 1.15;
    const viewSize = 8; // increase to see more map
    cam.left = -viewSize * aspect / zoom;
    cam.right = viewSize * aspect / zoom;
    cam.top = viewSize / zoom;
    cam.bottom = -viewSize / zoom;
    cam.updateProjectionMatrix();
  }
  window.addEventListener("resize", resize);
  resize();

  // ---------- Build Tile Meshes ----------
  const mats = {
    grass: new THREE.MeshStandardMaterial({ color: 0x1f6f3a, roughness: 1, metalness: 0 }),
    stone: new THREE.MeshStandardMaterial({ color: 0x556175, roughness: 1, metalness: 0 }),
    water: new THREE.MeshStandardMaterial({ color: 0x1a4c7a, roughness: 0.9, metalness: 0.05, transparent: true, opacity: 0.95 }),
    side:  new THREE.MeshStandardMaterial({ color: 0x162032, roughness: 1, metalness: 0 }),
  };

  const tileTopGeo = new THREE.BoxGeometry(TILE, 0.08, TILE); // top cap
  const tileSideGeo = new THREE.BoxGeometry(TILE, H, TILE);   // stacked levels

  const tileGroup = new THREE.Group();
  scene.add(tileGroup);

  // Raycastable surfaces for selecting tiles
  const pickables = [];

  function typeToMat(t) {
    if (t === 1) return mats.stone;
    if (t === 2) return mats.water;
    return mats.grass;
  }

  for (let tz = 0; tz < MAP_H; tz++) {
    for (let tx = 0; tx < MAP_W; tx++) {
      const t = tileType[tz][tx];
      const y = tileY(tx, tz);
      const pos = tileToWorld(tx, tz);

      // build stacked sides if height > 0
      const levels = heightMap[tz][tx];
      for (let i = 0; i < levels; i++) {
        const side = new THREE.Mesh(tileSideGeo, mats.side);
        side.position.set(pos.x, i * H + H/2 - 0.04, pos.z);
        tileGroup.add(side);
      }

      // top cap with type color
      const top = new THREE.Mesh(tileTopGeo, typeToMat(t));
      top.position.set(pos.x, y + 0.02, pos.z);
      top.userData = { tx, tz, kind: "tile" };
      tileGroup.add(top);
      pickables.push(top);

      // water surface slight wave: optional (kept static here)
    }
  }

  // ---------- Target marker ----------
  const marker = new THREE.Mesh(
    new THREE.RingGeometry(0.14, 0.26, 28),
    new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.7, side: THREE.DoubleSide })
  );
  marker.rotation.x = -Math.PI / 2;
  marker.visible = false;
  scene.add(marker);

  // ---------- Tree (resource node) placed on a tile ----------
  const tree = new THREE.Group();
  const foliageMat = new THREE.MeshStandardMaterial({ color: 0x2f8a3a, roughness: 1, metalness: 0 });
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x7a4a2a, roughness: 1, metalness: 0 });
  const foliage = new THREE.Mesh(new THREE.SphereGeometry(0.55, 18, 14), foliageMat);
  foliage.position.y = 1.15;
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.2, 0.9, 14), trunkMat);
  trunk.position.y = 0.45;
  tree.add(foliage, trunk);
  scene.add(tree);

  function syncTree() {
    const now = performance.now();
    const available = now >= state.world.tree.respawnAt;
    tree.visible = available;

    const { tx, tz } = state.world.tree;
    const pos = tileToWorld(tx, tz);
    tree.position.set(pos.x, tileY(tx, tz), pos.z);
  }
  syncTree();

  // ---------- Player ----------
  const player = new THREE.Group();
  const bodyMat = new THREE.MeshStandardMaterial({ color: 0xd7e1ff, roughness: 1, metalness: 0 });
  const shadowMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.18 });

  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.25, 0.35, 6, 12), bodyMat);
  body.position.y = 0.6;
  const shadow = new THREE.Mesh(new THREE.CircleGeometry(0.35, 18), shadowMat);
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.02;
  player.add(body, shadow);
  scene.add(player);

  // Move player to saved tile
  function placePlayerAtTile(tx, tz) {
    const pos = tileToWorld(tx, tz);
    player.position.set(pos.x, tileY(tx, tz), pos.z);
  }
  placePlayerAtTile(state.player.tx, state.player.tz);

  // ---------- Raycasting for tile selection ----------
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();

  function pickTileFromEvent(ev) {
    const rect = renderer.domElement.getBoundingClientRect();
    const x = (ev.clientX - rect.left) / rect.width;
    const y = (ev.clientY - rect.top) / rect.height;
    pointer.x = x * 2 - 1;
    pointer.y = -(y * 2 - 1);

    raycaster.setFromCamera(pointer, cam);
    const hits = raycaster.intersectObjects(pickables, false);
    if (!hits.length) return null;

    const hit = hits[0].object;
    return hit.userData ? { tx: hit.userData.tx, tz: hit.userData.tz } : null;
  }

  renderer.domElement.addEventListener("pointerdown", (ev) => {
    const tile = pickTileFromEvent(ev);
    if (!tile) return;

    // ignore solid tiles
    if (isSolid(tile.tx, tile.tz)) {
      updateUI("Can't walk there");
      return;
    }

    const start = { tx: state.player.tx, tz: state.player.tz };
    const path = astar(start, tile);
    if (!path.length) {
      updateUI("No path");
      return;
    }

    state.path = path; // includes destination
    marker.visible = true;
    const p = tileToWorld(tile.tx, tile.tz);
    marker.position.set(p.x, tileY(tile.tx, tile.tz) + 0.03, p.z);
    updateUI();
  });

  window.addEventListener("keydown", (e) => {
    const k = e.key.toLowerCase();
    if (k === "e") tryGatherTree();
    if (k === "r") {
      localStorage.removeItem(SAVE_KEY);
      state = defaultState();
      state.path = [];
      marker.visible = false;
      placePlayerAtTile(state.player.tx, state.player.tz);
      syncTree();
      updateUI("Reset");
    }
  });

  // ---------- A* pathfinding (4-direction, Manhattan) ----------
  function key(tx, tz) { return tx + "," + tz; }
  function heuristic(a, b) { return Math.abs(a.tx - b.tx) + Math.abs(a.tz - b.tz); }

  function neighbors(n) {
    return [
      { tx: n.tx + 1, tz: n.tz },
      { tx: n.tx - 1, tz: n.tz },
      { tx: n.tx, tz: n.tz + 1 },
      { tx: n.tx, tz: n.tz - 1 },
    ].filter(p => inBounds(p.tx, p.tz) && !isSolid(p.tx, p.tz));
  }

  // (Optional) height cost: moving up costs more
  function moveCost(a, b) {
    const dh = heightMap[b.tz][b.tx] - heightMap[a.tz][a.tx];
    return 1 + Math.max(0, dh) * 0.5;
  }

  function astar(start, goal) {
    const startKey = key(start.tx, start.tz);
    const goalKey = key(goal.tx, goal.tz);

    const open = new Map();
    const cameFrom = new Map();
    const gScore = new Map();
    const fScore = new Map();

    gScore.set(startKey, 0);
    fScore.set(startKey, heuristic(start, goal));
    open.set(startKey, start);

    while (open.size) {
      // get node in open with lowest fScore
      let currentKey = null;
      let current = null;
      let bestF = Infinity;

      for (const [k, n] of open) {
        const f = fScore.get(k) ?? Infinity;
        if (f < bestF) { bestF = f; currentKey = k; current = n; }
      }

      if (currentKey === goalKey) {
        // reconstruct
        const path = [];
        let ck = currentKey;
        while (ck !== startKey) {
          const [tx, tz] = ck.split(",").map(Number);
          path.push({ tx, tz });
          ck = cameFrom.get(ck);
          if (!ck) break;
        }
        path.reverse();
        return path;
      }

      open.delete(currentKey);

      for (const nb of neighbors(current)) {
        const nk = key(nb.tx, nb.tz);
        const tentative = (gScore.get(currentKey) ?? Infinity) + moveCost(current, nb);
        if (tentative < (gScore.get(nk) ?? Infinity)) {
          cameFrom.set(nk, currentKey);
          gScore.set(nk, tentative);
          fScore.set(nk, tentative + heuristic(nb, goal));
          if (!open.has(nk)) open.set(nk, nb);
        }
      }
    }
    return [];
  }

  // ---------- Gathering ----------
  function tryGatherTree() {
    const now = performance.now();
    if (now < state.world.tree.respawnAt) return;

    const pTx = state.player.tx, pTz = state.player.tz;
    const tTx = state.world.tree.tx, tTz = state.world.tree.tz;
    const d = Math.abs(pTx - tTx) + Math.abs(pTz - tTz); // tile distance

    if (d <= 1) {
      state.inv.logs += 1;
      addXp("woodcutting", 25);
      state.world.tree.respawnAt = now + 6000;
      if (Math.random() < 0.35) state.inv.coins += 1;
      syncTree();
      saveState();
      updateUI("Chop!");
    } else {
      updateUI("Get closer");
    }
  }

  // ---------- Camera follow ----------
  function updateCamera() {
    const pos = player.position;
    const follow = new THREE.Vector3(pos.x, pos.y, pos.z);
    const offset = new THREE.Vector3(9, 9, 9);
    cam.position.copy(follow).add(offset);
    cam.rotation.order = "YXZ";
    cam.rotation.y = ISO_YAW;
    cam.rotation.x = -ISO_PITCH;
    cam.lookAt(follow);
  }

  // ---------- Movement along path ----------
  function stepMovement(dt) {
    if (!state.path.length) return;

    const next = state.path[0];
    const targetPos = tileToWorld(next.tx, next.tz);
    const tx = targetPos.x;
    const tz = targetPos.z;
    const ty = tileY(next.tx, next.tz);

    const px = player.position.x;
    const pz = player.position.z;

    const dx = tx - px;
    const dz = tz - pz;
    const dist = Math.hypot(dx, dz);

    const speed = state.player.speedTilesPerSec * TILE;

    if (dist < 0.02) {
      // snap, advance
      player.position.set(tx, ty, tz);
      state.player.tx = next.tx;
      state.player.tz = next.tz;
      state.path.shift();
      if (!state.path.length) marker.visible = false;
      return;
    }

    const vx = (dx / dist) * speed;
    const vz = (dz / dist) * speed;

    // integrate
    const nx = px + vx * dt;
    const nz = pz + vz * dt;

    // smooth height: lerp toward target height
    const ny = player.position.y + (ty - player.position.y) * Math.min(1, dt * 10);

    player.position.set(nx, ny, nz);

    // face direction
    player.rotation.y = Math.atan2(dx, dz);
  }

  // ---------- Main loop ----------
  let last = performance.now();
  function tick(now) {
    const dt = Math.min(0.033, (now - last) / 1000);
    last = now;

    stepMovement(dt);
    syncTree();
    updateCamera();
    renderer.render(scene, cam);

    requestAnimationFrame(tick);
  }

  updateUI();
  requestAnimationFrame(tick);
})();
