import * as vscode from 'vscode';
import { analyzeDocument } from '../index/documentCache';
import { Indexer } from '../index/indexer';
import { RelationService } from '../relations/relationService';
import { readConfig } from './config';
import { buildIndicators, Indicator } from './indicators';
import { SHOW_LOCATIONS_COMMAND } from './navigation';
import { coreRangeToVsRange, targetToPlainLocation } from './vscodeConvert';

const DIRECTION_PREFIX: Record<Indicator['direction'], string> = {
  down: '$(arrow-down) ',
  up: '$(arrow-up) ',
};

export class PhpRelationsCodeLensProvider implements vscode.CodeLensProvider {
  private readonly emitter = new vscode.EventEmitter<void>();
  readonly onDidChangeCodeLenses = this.emitter.event;

  private readonly disposables: vscode.Disposable[] = [];

  constructor(
    private readonly indexer: Indexer,
    private readonly rel: RelationService,
  ) {
    this.disposables.push(
      indexer.onDidChange(() => this.emitter.fire()),
      // Re-request lenses when switching files so VS Code doesn't briefly show
      // the previous document's (stale) lenses at the new file's line numbers.
      vscode.window.onDidChangeActiveTextEditor(() => this.emitter.fire()),
      vscode.workspace.onDidChangeConfiguration((e) => {
        if (e.affectsConfiguration('phpRelations')) {
          this.emitter.fire();
        }
      }),
    );
  }

  provideCodeLenses(document: vscode.TextDocument): vscode.CodeLens[] {
    const config = readConfig();
    if (!config.enable || !config.codeLens) {
      return [];
    }

    // Analyze the current buffer so lens positions match unsaved edits, and keep
    // the index consistent with what we're rendering. Cached by version so
    // repeated renders of the same buffer don't re-parse.
    const file = analyzeDocument(document.uri.fsPath, document.version, document.getText());
    this.indexer.index.setFile(document.uri.fsPath, file.types);

    const lenses: vscode.CodeLens[] = [];
    for (const indicator of buildIndicators(file, this.rel, config.indicators)) {
      const range = coreRangeToVsRange(indicator.anchor);
      const origin = targetToPlainLocation({
        filePath: document.uri.fsPath,
        range: indicator.anchor,
      });
      lenses.push(
        new vscode.CodeLens(range, {
          title: DIRECTION_PREFIX[indicator.direction] + indicator.title,
          command: SHOW_LOCATIONS_COMMAND,
          arguments: [
            origin.uri,
            indicator.anchor.start,
            indicator.targets.map(targetToPlainLocation),
          ],
        }),
      );
    }
    return lenses;
  }

  dispose(): void {
    this.emitter.dispose();
    for (const d of this.disposables) {
      d.dispose();
    }
  }
}
