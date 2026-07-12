import * as vscode from 'vscode';
import { analyzeFile } from './astWalker';
import { analyzeDocument, forgetDocument } from './documentCache';
import { PhpIndex } from './phpIndex';

const DEBOUNCE_MS = 300;
/** Cap concurrent file reads during the initial scan to avoid FD exhaustion. */
const SCAN_BATCH = 40;

/**
 * Owns the {@link PhpIndex} and keeps it in sync with the workspace: an initial
 * scan of all `.php` files, disk changes via a file watcher, and live in-memory
 * edits of open documents. Fires {@link onDidChange} (debounced) so the UI can refresh.
 */
export class Indexer implements vscode.Disposable {
  readonly index = new PhpIndex();

  private readonly emitter = new vscode.EventEmitter<void>();
  readonly onDidChange = this.emitter.event;

  private readonly disposables: vscode.Disposable[] = [];
  private changeTimer: ReturnType<typeof setTimeout> | undefined;

  async initialize(): Promise<void> {
    await this.scanWorkspace();

    const watcher = vscode.workspace.createFileSystemWatcher('**/*.php');
    watcher.onDidCreate((uri) => void this.indexUri(uri));
    watcher.onDidChange((uri) => void this.indexUri(uri));
    watcher.onDidDelete((uri) => {
      this.index.removeFile(uri.fsPath);
      forgetDocument(uri.fsPath);
      this.scheduleChange();
    });
    this.disposables.push(watcher);

    this.disposables.push(
      vscode.workspace.onDidChangeTextDocument((e) => {
        if (e.document.languageId === 'php') {
          this.indexDocument(e.document);
        }
      }),
    );

    // Index already-open PHP documents from their in-memory text.
    for (const doc of vscode.workspace.textDocuments) {
      if (doc.languageId === 'php') {
        this.indexDocument(doc, false);
      }
    }
    this.scheduleChange();
  }

  /** Rebuild the entire index from disk (used by the reindex command). */
  async rebuild(): Promise<void> {
    await this.scanWorkspace();
    this.scheduleChange();
  }

  private excludeGlob(): vscode.GlobPattern | undefined {
    const patterns = vscode.workspace
      .getConfiguration('phpRelations')
      .get<string[]>('exclude', []);
    if (patterns.length === 0) {
      return undefined;
    }
    return patterns.length === 1 ? patterns[0] : `{${patterns.join(',')}}`;
  }

  private async scanWorkspace(): Promise<void> {
    const files = await vscode.workspace.findFiles('**/*.php', this.excludeGlob());
    // Read/parse in bounded batches so a large monorepo doesn't open thousands
    // of file descriptors at once.
    for (let i = 0; i < files.length; i += SCAN_BATCH) {
      const batch = files.slice(i, i + SCAN_BATCH);
      await Promise.all(batch.map((uri) => this.indexUri(uri, false)));
    }
  }

  private async indexUri(uri: vscode.Uri, fire = true): Promise<void> {
    try {
      const bytes = await vscode.workspace.fs.readFile(uri);
      const code = Buffer.from(bytes).toString('utf8');
      this.index.setFile(uri.fsPath, analyzeFile(code, uri.fsPath).types);
    } catch {
      // Unreadable/deleted mid-scan — ignore.
    }
    if (fire) {
      this.scheduleChange();
    }
  }

  private indexDocument(doc: vscode.TextDocument, fire = true): void {
    try {
      const symbols = analyzeDocument(doc.uri.fsPath, doc.version, doc.getText());
      this.index.setFile(doc.uri.fsPath, symbols.types);
    } catch {
      // Parse failure on an in-progress edit — keep the previous index entry.
    }
    if (fire) {
      this.scheduleChange();
    }
  }

  private scheduleChange(): void {
    if (this.changeTimer) {
      clearTimeout(this.changeTimer);
    }
    this.changeTimer = setTimeout(() => {
      this.changeTimer = undefined;
      this.emitter.fire();
    }, DEBOUNCE_MS);
  }

  dispose(): void {
    if (this.changeTimer) {
      clearTimeout(this.changeTimer);
    }
    this.emitter.dispose();
    for (const d of this.disposables) {
      d.dispose();
    }
  }
}
