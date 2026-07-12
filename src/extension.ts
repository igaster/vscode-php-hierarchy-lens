import * as vscode from 'vscode';
import { Indexer } from './index/indexer';
import { RelationService } from './relations/relationService';
import { PhpRelationsCodeLensProvider } from './ui/codeLensProvider';
import { GutterDecorations } from './ui/gutterDecorations';
import { registerNavigation } from './ui/navigation';

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const indexer = new Indexer();
  const rel = new RelationService(indexer.index);
  context.subscriptions.push(indexer);

  registerNavigation(context);

  const codeLens = new PhpRelationsCodeLensProvider(indexer, rel);
  context.subscriptions.push(
    codeLens,
    vscode.languages.registerCodeLensProvider({ language: 'php' }, codeLens),
  );

  const gutter = new GutterDecorations(context.extensionUri, indexer, rel);
  context.subscriptions.push(gutter);

  context.subscriptions.push(
    vscode.commands.registerCommand('phpRelations.reindex', async () => {
      await indexer.rebuild();
      vscode.window.showInformationMessage('PHP Relations: index rebuilt.');
    }),
  );

  // The CodeLens provider and gutter each react to configuration changes
  // internally, so no additional listener is needed here.

  // Render icons for already-open files immediately (self-seeds the index),
  // so they appear on restart without waiting for the workspace scan.
  gutter.refreshAll();

  // The scan enriches cross-file relationships; a failure here must not abort
  // activation or leave the gutter blank (it already rendered above).
  try {
    await indexer.initialize();
  } catch (err) {
    console.error('php-relations: workspace index failed', err);
  }
  gutter.refreshAll();
}

export function deactivate(): void {
  // Disposables are cleaned up via context.subscriptions.
}
