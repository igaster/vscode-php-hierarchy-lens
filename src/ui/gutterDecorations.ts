import * as fs from 'fs';
import * as vscode from 'vscode';
import { analyzeDocument } from '../index/documentCache';
import { Indexer } from '../index/indexer';
import { RelationService } from '../relations/relationService';
import { GutterIconStyle, readConfig } from './config';
import { applyOpacity } from './iconTemplating';
import { buildIndicators, Indicator } from './indicators';
import { SHOW_LOCATIONS_COMMAND } from './navigation';
import { targetToPlainLocation } from './vscodeConvert';

type IconKind = 'up' | 'down' | 'both';

/**
 * Renders PHPStorm-style up/down icons in the gutter. The glyph set is chosen by
 * `phpRelations.gutterIcons.style` and its opacity by `phpRelations.gutterIcons.opacity`;
 * changing either recreates the decoration types (a decoration type's icon path
 * is fixed at creation). Icons aren't independently clickable in VS Code, so each
 * carries a hover with a `command:` link that opens the same peek as the CodeLens.
 */
export class GutterDecorations implements vscode.Disposable {
  private types: Record<IconKind, vscode.TextEditorDecorationType>;
  private currentStyle: GutterIconStyle;
  private currentOpacity: number;
  private readonly disposables: vscode.Disposable[] = [];
  private readonly pendingTimers = new Set<ReturnType<typeof setTimeout>>();

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly indexer: Indexer,
    private readonly rel: RelationService,
  ) {
    const config = readConfig();
    this.currentStyle = config.gutterIconStyle;
    this.currentOpacity = config.gutterIconOpacity;
    this.types = this.createTypes(this.currentStyle, this.currentOpacity);

    this.disposables.push(
      indexer.onDidChange(() => this.refreshAll()),
      vscode.window.onDidChangeVisibleTextEditors(() => this.scheduleRefreshAll()),
      vscode.window.onDidChangeActiveTextEditor(() => this.scheduleRefreshAll()),
      vscode.workspace.onDidChangeConfiguration((e) => {
        if (e.affectsConfiguration('phpRelations')) {
          this.onConfigChange();
        }
      }),
    );
  }

  /**
   * Refresh now and again on the next tick. Decorations set synchronously during
   * an active-editor change can be dropped before the editor finishes activating
   * (a VS Code timing issue on tab switches); the deferred pass re-reads the
   * *current* visible editors — VS Code may have swapped the editor instance, so
   * we must not hold onto the one from the event.
   */
  private scheduleRefreshAll(): void {
    this.refreshAll();
    const timer = setTimeout(() => {
      this.pendingTimers.delete(timer);
      this.refreshAll();
    }, 0);
    this.pendingTimers.add(timer);
  }

  /**
   * Resolve the gutter icon Uri for a glyph at a given opacity.
   *
   * Gutter icons render reliably only from inside the extension directory, so:
   *  - the default opacity (0.5, already baked into the bundled SVGs) uses the
   *    bundled file directly — no writes;
   *  - other opacities are written as generated copies under the extension dir
   *    (a space-free, VS Code-trusted location), keyed by style+opacity so
   *    distinct settings never clash and repeat lookups reuse the cached file.
   * Any failure falls back to the bundled icon so icons are never missing.
   */
  private iconUri(style: GutterIconStyle, name: IconKind, opacity: number): vscode.Uri {
    const source = vscode.Uri.joinPath(this.extensionUri, 'media', 'icons', style, `${name}.svg`);
    if (Math.abs(opacity - 0.5) < 1e-9) {
      return source;
    }
    try {
      const tag = opacity.toFixed(2).replace('.', '_');
      const dir = vscode.Uri.joinPath(this.extensionUri, 'generated-icons', `${style}-${tag}`);
      fs.mkdirSync(dir.fsPath, { recursive: true });
      const dest = vscode.Uri.joinPath(dir, `${name}.svg`);
      if (!fs.existsSync(dest.fsPath)) {
        const svg = applyOpacity(fs.readFileSync(source.fsPath, 'utf8'), opacity);
        fs.writeFileSync(dest.fsPath, svg);
      }
      return dest;
    } catch {
      return source;
    }
  }

  private createTypes(
    style: GutterIconStyle,
    opacity: number,
  ): Record<IconKind, vscode.TextEditorDecorationType> {
    const icon = (name: IconKind): vscode.TextEditorDecorationType =>
      vscode.window.createTextEditorDecorationType({
        gutterIconPath: this.iconUri(style, name, opacity),
        gutterIconSize: 'contain',
      });
    return { up: icon('up'), down: icon('down'), both: icon('both') };
  }

  /** Rebuild decoration types if the icon style or opacity changed, then re-render. */
  private onConfigChange(): void {
    const { gutterIconStyle: style, gutterIconOpacity: opacity } = readConfig();
    if (style !== this.currentStyle || opacity !== this.currentOpacity) {
      for (const t of Object.values(this.types)) {
        t.dispose();
      }
      this.types = this.createTypes(style, opacity);
      this.currentStyle = style;
      this.currentOpacity = opacity;
    }
    this.refreshAll();
  }

  refreshAll(): void {
    for (const editor of vscode.window.visibleTextEditors) {
      this.refresh(editor);
    }
  }

  refresh(editor: vscode.TextEditor): void {
    try {
      this.applyDecorations(editor);
    } catch (err) {
      console.error('php-relations: gutter refresh failed', err);
    }
  }

  private applyDecorations(editor: vscode.TextEditor): void {
    const config = readConfig();
    if (!config.enable || !config.gutterIcons || editor.document.languageId !== 'php') {
      this.clear(editor);
      return;
    }

    // Seed the index with the current buffer so gutter icons render even before
    // (or if) the workspace scan completes — mirrors the CodeLens provider and
    // keeps the two views consistent.
    const file = analyzeDocument(
      editor.document.uri.fsPath,
      editor.document.version,
      editor.document.getText(),
    );
    this.indexer.index.setFile(editor.document.uri.fsPath, file.types);

    const byLine = new Map<number, Indicator[]>();
    for (const indicator of buildIndicators(file, this.rel, config.indicators)) {
      const line = indicator.anchor.start.line;
      const list = byLine.get(line);
      if (list) {
        list.push(indicator);
      } else {
        byLine.set(line, [indicator]);
      }
    }

    const buckets: Record<IconKind, vscode.DecorationOptions[]> = { up: [], down: [], both: [] };
    for (const [line, indicators] of byLine) {
      const hasUp = indicators.some((i) => i.direction === 'up');
      const hasDown = indicators.some((i) => i.direction === 'down');
      const kind: IconKind = hasUp && hasDown ? 'both' : hasUp ? 'up' : 'down';
      // VS Code gutter icons have no hover/click events, and a decoration's
      // hoverMessage only fires over its *text* range. An empty range shows no
      // hover at all, so cover the whole declaration line — hovering anywhere on
      // the line (next to the icon) then reveals the popup.
      buckets[kind].push({
        range: editor.document.lineAt(line).range,
        hoverMessage: config.hover
          ? this.buildHover(editor.document.uri.fsPath, indicators, config.hoverLimit)
          : undefined,
      });
    }

    editor.setDecorations(this.types.up, buckets.up);
    editor.setDecorations(this.types.down, buckets.down);
    editor.setDecorations(this.types.both, buckets.both);
  }

  private buildHover(filePath: string, indicators: Indicator[], maxItems: number): vscode.MarkdownString {
    const uri = vscode.Uri.file(filePath).toString();
    const md = new vscode.MarkdownString();
    md.isTrusted = true;

    const link = (args: unknown, text: string): string =>
      `[${text}](command:${SHOW_LOCATIONS_COMMAND}?${encodeURIComponent(JSON.stringify(args))})`;

    indicators.forEach((indicator, i) => {
      if (i > 0) {
        md.appendMarkdown('\n\n---\n\n');
      }
      const arrow = indicator.direction === 'up' ? '↑' : '↓';
      // Header: the count, clickable to peek all targets at once.
      const allArgs = [uri, indicator.anchor.start, indicator.targets.map(targetToPlainLocation)];
      md.appendMarkdown(`${arrow} ${link(allArgs, `**${indicator.title}**`)}\n\n`);

      // One clickable, named link per target (jumps straight there).
      const shown = indicator.targets.slice(0, maxItems);
      for (const target of shown) {
        const oneArg = [uri, indicator.anchor.start, [targetToPlainLocation(target)]];
        // Backticks keep FQN backslashes literal (otherwise markdown eats them).
        md.appendMarkdown(`- ${link(oneArg, `\`${target.label}\``)}\n`);
      }
      const hidden = indicator.targets.length - shown.length;
      if (hidden > 0) {
        md.appendMarkdown(`- …and ${hidden} more\n`);
      }
    });

    return md;
  }

  private clear(editor: vscode.TextEditor): void {
    editor.setDecorations(this.types.up, []);
    editor.setDecorations(this.types.down, []);
    editor.setDecorations(this.types.both, []);
  }

  dispose(): void {
    for (const timer of this.pendingTimers) {
      clearTimeout(timer);
    }
    this.pendingTimers.clear();
    for (const t of Object.values(this.types)) {
      t.dispose();
    }
    for (const d of this.disposables) {
      d.dispose();
    }
  }
}
