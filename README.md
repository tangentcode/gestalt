# @tangentstorm/gestalt

**Gestalt** (GameSketchLib web player) — MIT-licensed SVG sketch + **markup animation** runtime as Custom Elements.

This package is the **player-only** extract from the private `tangentcode/platform` `web/gs/` stack.

| In v1 (this package) | Out of scope (deferred) |
|----------------------|-------------------------|
| `<gs-app>`, `<gs-sketch>` | `GsToolApp` / editor shell |
| `<gs-defs>`, `<gs-anim>`, `<gs-track>`, `<gs-marker>` | `tools/`, `panels/`, `cmds/` |
| Geometry shapes (`gs-rect`, `gs-circle`, …) | `tc-anim-bar` / `tc-timeline` |
| Vendored `sh` helpers | `treeLayout`, importers, PTW, extras |

Package: **`@tangentstorm/gestalt`** · Repo: [tangentcode/gestalt](https://github.com/tangentcode/gestalt)

## Install

```bash
npm install @tangentstorm/gestalt
```

(Or link a local build: `npm pack` → install the `.tgz`.)

## Quick start (markup playback)

```html
<script type="module" src="node_modules/@tangentstorm/gestalt/dist/gestalt.js"></script>

<gs-sketch bg="#222" width="480" height="280" play="bounce">
  <gs-rect id="box" x="40" y="100" w="64" h="64" fc="#4fc3f7"></gs-rect>
  <gs-defs>
    <gs-anim name="bounce" dur="3" rep="0">
      <gs-track for="box" prop="x">0:40; 1.5:360; 3:40</gs-track>
    </gs-anim>
  </gs-defs>
</gs-sketch>
```

- Set `play="anim-name"` on `<gs-sketch>` to autoplay when defs are ready.
- Keyframes live in `<gs-track>` **text content**: `t:value; t:value; …`
- Use `dur` (seconds) and `rep` (`0` = loop forever) on `<gs-anim>`.

## Develop / smoke demo

```bash
npm install
npm run build          # → dist/gestalt.js (+ .d.ts)
npm run pack:check     # npm pack dry-run

# Dev server (opens demos/smoke.html)
npm run dev
# then open http://localhost:5173/demos/smoke.html
```

After `npm run build`, open `demos/smoke-dist.html` via any static server (or `npm run preview` and navigate).

## Layout

```
src/index.ts           # slim player entry (registers CEs)
src/app/GsApp.ts
src/components/        # sketch + anim stack + axes
src/shapes/            # geometry (no ToolApp-coupled shapes)
src/types/ src/utils/
src/sh/                # vendored bin/num/und/qsa/qs/raf
demos/                 # static HTML smoke demos
```

## License

MIT © tangentcode
