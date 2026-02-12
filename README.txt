Isometric 3D RPG — Tilemap Starter (static)

What changed vs the previous starter:
- The world is now a real TILEMAP grid (12x12) with:
  * tile types (grass/stone/water)
  * heights (stacked levels)
  * solid tiles (water blocks movement)
- Tap/click to move now chooses a TILE and snaps movement to tile centers.
- Includes simple A* pathfinding so the player routes around water.

Files:
- index.html
- style.css
- main.js

How to run (recommended):
1) Upload the files to a GitHub repo
2) Enable GitHub Pages (Settings → Pages)
3) Open your Pages URL on iPad

Controls:
- Tap/click a tile to move
- E to gather near the tree
- R to reset save

Edit the map:
- In main.js, edit `tileType` and `heightMap`
  tileType: 0 grass, 1 stone, 2 water (solid)
  heightMap: integers (0..4 in the example)
