# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

**PHP Hierarchy Lens** — a VS Code / Cursor extension that shows PhpStorm-style **CodeLens**
and **gutter icons** for PHP type relationships: interface implementations, class inheritors,
method overrides, the upward "implements/overrides/extends" (parent) link, and trait usage.
It builds its **own** workspace index by parsing PHP with glayzzle's `php-parser` — no
language-server dependency, works for free.

- **Extension id:** `igaster.php-hierarchy-lens` · **display:** "PHP Hierarchy Lens"
- **Repo:** https://github.com/igaster/vscode-php-hierarchy-lens · **Author:** Giannis Gasteratos (`igaster`)
- **Published:** Open VSX (live, installable in Cursor/VSCodium/etc). **Not** on the VS Code
  Marketplace yet — the Azure DevOps PAT was blocked (`AADSTS50020`, personal-vs-work tenant
  mess), so that half is deferred. The Makefile skips it automatically until `VSCE_PAT` is set.
- ⚠️ **Config/command namespace is `phpRelations.*`** (historical), even though the extension
  is `php-hierarchy-lens`. Not renamed to avoid churn + breaking users' settings. Commands:
  `phpRelations.showLocations`, `phpRelations.reindex`.

## Commands

```bash
npm run compile        # bundle src/extension.ts -> dist/extension.js (esbuild)
npm run watch          # esbuild watch
npm run test:unit      # fast pure-logic unit tests (mocha, out/test/unit) — needs compile-tests first
npm test               # integration tests in a downloaded VS Code host (@vscode/test-cli)
npx tsc --noEmit -p tsconfig.json   # typecheck (esbuild does NOT typecheck)
```

Single unit test: `npm run compile-tests && npx mocha --grep "<name>"`.

**Release/publish is via the Makefile** (tokens in a gitignored `.env`; copy `.env.example`):
```bash
make verify            # check marketplace tokens without publishing
make package           # build the .vsix
make publish           # publish to whichever marketplaces have a token (skips the rest)
make release[-minor|-major]   # clean-check → test → bump → package → publish → commit → tag → push
```
`.env` holds `VSCE_PAT` (VS Code Marketplace) and `OVSX_PAT` (Open VSX). **No quotes** — GNU
Make's `include` keeps quotes literally and corrupts the token. `vsce`/`ovsx` read the tokens
from the environment (Make `export`s them), so they never appear on the CLI.

## Architecture

Split into a **pure, `vscode`-free core** (unit-tested as plain Node) and a **thin VS Code
layer** (integration-tested). Keep the boundary: anything importing `vscode` can't be unit-tested.

Data flow: `Indexer` scans/watches `.php` → `analyzeFile`/`analyzeDocument` parses to
`IndexedType[]` → `PhpIndex` stores them with reverse edges → `RelationService` answers
relationship queries → `buildIndicators` turns declarations into up/down indicators →
`CodeLensProvider` + `GutterDecorations` render them; clicking runs `phpRelations.showLocations`
(peek/reveal).

Core (no `vscode`): `src/index/{types,parser,astWalker,nameResolver,phpIndex,documentCache}.ts`,
`src/relations/relationService.ts`, `src/ui/{indicators,iconTemplating}.ts`.
VS Code layer: `src/index/indexer.ts`, `src/ui/{config,codeLensProvider,gutterDecorations,navigation,vscodeConvert}.ts`, `src/extension.ts`.

Indicator relationship rules live in `relationService.ts` + `indicators.ts`:
interface → implementations (BFS over reverse edges: classes, enums, **and sub-interfaces**);
class/enum → inheritors (down) + supertypes (up); method → overrides (down) + prototype (up,
"implements" an interface contract in preference to "overrides" a parent); trait → users.

## Non-obvious rules & hard-won gotchas

- **VS Code gutter icons have NO click/hover events** (platform limitation, microsoft/vscode#224134).
  Interaction is: clickable **CodeLens**, and a **hover on the declaration line** — the
  hover `hoverMessage` only fires over a *text* range, so the decoration range is the whole
  line (`document.lineAt(line).range`); an **empty range shows no hover at all**.
- **Gutter icons render reliably only from inside the extension dir.** Default opacity (0.5)
  is baked into the bundled `media/icons/**/*.svg`, so the default uses them directly (no
  writes). Other opacities are generated into `<extensionDir>/generated-icons/` (gitignored).
  **Never** write generated icons to `globalStorageUri` — it lives under "Application Support"
  (a space) and outside the extension dir, which makes gutter icons silently vanish.
- **Opacity is an integer percent (10–100)** in settings, converted to 0–1 in `config.ts`,
  to dodge locale decimal-separator (comma vs dot) issues in the settings UI.
- **The index is incremental** — `PhpIndex.setFile`/`removeFile` touch only that file's edges
  (O(file)). Providers + indexer seed the current buffer via `analyzeDocument` (a version-keyed
  parse cache), so gutter/CodeLens are self-sufficient and don't re-parse redundantly.
- **php-parser quirks** (`src/index/astWalker.ts`): grouped imports (`use App\{A, B as C}`)
  carry the prefix on `node.name` — must be prepended. Enums are `kind: "enum"` (handle like a
  class). Its shipped types export nothing, so `parser.ts` `require()`s it with a local cast.
  Positions are 1-based line / 0-based column → converted to zero-based ranges.
- **Reinstalling a `.vsix` needs "Developer: Reload Window"** (not "Restart Extensions", which
  reuses the version resolved at window load). Avoid leaving multiple installed version folders
  in `~/.vscode/extensions` / `~/.cursor/extensions`.
- **DevSense PHP Tools / Intelephense** provide overlapping CodeLens (premium/trial features);
  ours is free and adds gutter icons. Users can disable either side (`phpRelations.codeLens.enable`
  or `php.codeLens.enabled`).
- **"PhpStorm" is a JetBrains trademark** — used nominatively; README carries a non-affiliation
  disclaimer. Don't put it in the extension name or use JetBrains assets.

## Tests

- `test/unit/**` — pure logic (56 tests), run by root `.mocharc.json` on `out/test/unit`.
  Fixtures mirror the screenshot the extension reproduces; expected counts are the spec.
  Namespace/`use`/grouped-use/enum/interface-extends cases guard the resolver + relation logic.
- `test/integration/extension.test.ts` — real VS Code host via `.vscode-test.mjs` (sets Mocha
  `ui: 'bdd'` — without it `describe` is undefined). Asserts CodeLens titles + settings toggles.
  Gutter decorations/hover aren't API-queryable, so they're covered only via `buildIndicators`
  unit tests.

## Settings (all `phpRelations.*`)

`enable`, `codeLens.enable`, `gutterIcons.enable`, `gutterIcons.style`
(`arrows`|`triangles`(default)|`chevrons`|`circles`), `gutterIcons.opacity` (10–100, default 50),
`gutterIcons.hover`, `gutterIcons.hoverLimit`, `indicators.{implementations,inheritors,overrides,parent,traitUsages}`,
`exclude` (default `["**/vendor/**"]`). Up = orange, down = blue.
