# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A VS Code extension (`php-relations`) that renders PHPStorm-style **CodeLens** and
**gutter icons** on PHP declarations, showing type/method relationships across the
workspace: interface/abstract-method implementations, class inheritors, method overrides,
the base declaration a method implements/overrides ("prototype"), and trait usage.

It builds its own workspace index by parsing PHP with glayzzle's `php-parser` — it does
**not** delegate to a language server (the equivalent queries are premium-gated in
Intelephense, so delegation would break for free users and duplicate paid ones).

## Commands

```bash
npm run compile        # bundle src/extension.ts -> dist/extension.js via esbuild
npm run watch          # esbuild in watch mode
npm run test:unit      # fast, pure-logic unit tests (mocha, no VS Code) — needs a prior compile-tests
npm test               # integration tests inside a downloaded VS Code host (@vscode/test-cli)
npm run package        # produce php-relations-<version>.vsix (vsce)
npx tsc --noEmit -p tsconfig.json   # typecheck the src tree (esbuild does not typecheck)
```

Run a **single unit test** (compile first — mocha runs the emitted JS in `out/`):

```bash
npm run compile-tests && npx mocha --grep "prototype"
```

`npm test` auto-runs `pretest` (`compile-tests`) which `tsc`-emits both unit and
integration tests to `out/`. Press **F5** in VS Code to launch an Extension Development
Host on the `test/fixtures` workspace (see `.vscode/launch.json`).

## Architecture

The design is split into a **pure, `vscode`-free core** (unit-tested as plain Node) and a
**thin VS Code layer** (integration-tested in a host). Keep this boundary: anything that
imports `vscode` cannot be unit-tested with plain mocha.

Data flow: `Indexer` scans/watches `.php` files → `analyzeFile` parses each into
`IndexedType`s → `PhpIndex` stores them with reverse edges → `RelationService` answers
relationship queries → `buildIndicators` turns a file's declarations into up/down
indicators → `CodeLensProvider` and `GutterDecorations` render them; clicking runs the
`phpRelations.showLocations` command which peeks/jumps.

Core, no `vscode` import (`src/index/*` except `indexer.ts`, `src/relations`, `src/ui/indicators.ts`):
- `index/astWalker.ts` — `analyzeFile(code, path)`: walks the php-parser AST into
  `IndexedType[]` with fully-resolved references. Namespace context and `use` aliases are
  tracked as statements are visited; a `namespace X;` node carries the rest of the file as
  its `children`.
- `index/nameResolver.ts` — resolves a written type reference + php-parser `resolution`
  tag (`fqn`/`qn`/`uqn`/`rn`) to a canonical FQN using namespace + `use` map.
- `index/phpIndex.ts` — forward store keyed by FQN plus reverse maps (subclasses,
  implementors, trait users), rebuilt on every `setFile`/`removeFile`.
- `relations/relationService.ts` — all transitive graph walking (descendants, ancestor
  chains, interface-extends closure) lives here; `PhpIndex` only holds direct edges.
- `ui/indicators.ts` — maps declarations to `{anchor, direction, title, targets}`.

VS Code layer:
- `index/indexer.ts` — initial `findFiles` scan, `FileSystemWatcher`, and live re-index of
  open documents on `onDidChangeTextDocument`; fires a **debounced** `onDidChange`.
- `ui/codeLensProvider.ts`, `ui/gutterDecorations.ts` — both re-run `analyzeFile` on the
  current buffer so anchors match unsaved edits; the CodeLens provider also `setFile`s the
  current doc into the index to stay consistent.
- `ui/navigation.ts` + `ui/vscodeConvert.ts` — the `showLocations` command takes **plain
  JSON** args (not `vscode.Location` objects) so the identical command works from CodeLens
  clicks and from `command:` hover URIs (which serialize their arguments).

## Non-obvious rules to preserve

- **PHP identifiers are case-insensitive.** `PhpIndex` keys everything through `fqnKey()`
  (lowercased, leading `\` stripped). Compare type/method names case-insensitively.
- **Prototype precedence:** `getPrototype` returns an interface contract as
  `relation: 'implements'` in preference to a concrete parent method (`'overrides'`); only
  then does it consider traits. This mirrors PHPStorm's glyphs. See the
  `relationService.test.ts` case "interface contract wins".
- **Private methods** never participate in overrides/prototype.
- **php-parser types are unusable** (the shipped `.d.ts` exports nothing), so `parser.ts`
  `require()`s it with a locally-declared constructor type. AST nodes are treated as `any`
  in `astWalker.ts`; positions are 1-based line / 0-based column and are converted to
  zero-based `Range`s there.

## Tests

- `test/unit/**` — pure logic, run by root `.mocharc.json` against `out/test/unit`. The
  fixture in several files mirrors the screenshot this extension reproduces (DummyInterface
  / BaseClasss / ChildClasss / HelperTrait); the expected counts (2 implementations,
  1 inheritor, 1 override, etc.) are the spec — update them deliberately.
- `test/integration/extension.test.ts` — runs in a real VS Code host via `.vscode-test.mjs`
  (which sets Mocha `ui: 'bdd'` — without it `describe` is undefined). Asserts
  `vscode.executeCodeLensProvider` returns the expected lens titles for `test/fixtures/example.php`.
  Gutter decorations are not queryable via API, so they are covered only through the shared
  `buildIndicators` unit tests.
