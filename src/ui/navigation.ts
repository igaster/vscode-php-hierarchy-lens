import * as vscode from 'vscode';
import { PlainLocation, plainToVsLocation } from './vscodeConvert';

export const SHOW_LOCATIONS_COMMAND = 'phpRelations.showLocations';

/**
 * Command shared by CodeLens clicks and gutter hover links. With one target it
 * jumps directly; with several it opens a peek window (DevSense-style).
 *
 * Arguments are plain JSON so the same command works when invoked from a
 * `command:` hover URI (which serializes its arguments).
 */
export function registerNavigation(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand(
      SHOW_LOCATIONS_COMMAND,
      (originUri: string, originPos: { line: number; character: number }, plain: PlainLocation[]) => {
        const locations = (plain ?? []).map(plainToVsLocation);
        if (locations.length === 0) {
          return;
        }
        if (locations.length === 1) {
          void vscode.window.showTextDocument(locations[0].uri, {
            selection: locations[0].range,
          });
          return;
        }
        const position = new vscode.Position(originPos.line, originPos.character);
        void vscode.commands.executeCommand(
          'editor.action.peekLocations',
          vscode.Uri.parse(originUri),
          position,
          locations,
          'peek',
        );
      },
    ),
  );
}
