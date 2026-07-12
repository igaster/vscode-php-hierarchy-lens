import * as vscode from 'vscode';
import { Range as CoreRange } from '../index/types';

/** Serializable location shape passed as a command argument. */
export interface PlainLocation {
  uri: string;
  range: {
    start: { line: number; character: number };
    end: { line: number; character: number };
  };
}

export function coreRangeToVsRange(r: CoreRange): vscode.Range {
  return new vscode.Range(r.start.line, r.start.character, r.end.line, r.end.character);
}

export function targetToPlainLocation(t: { filePath: string; range: CoreRange }): PlainLocation {
  return {
    uri: vscode.Uri.file(t.filePath).toString(),
    range: {
      start: { line: t.range.start.line, character: t.range.start.character },
      end: { line: t.range.end.line, character: t.range.end.character },
    },
  };
}

export function plainToVsLocation(p: PlainLocation): vscode.Location {
  return new vscode.Location(
    vscode.Uri.parse(p.uri),
    new vscode.Range(
      p.range.start.line,
      p.range.start.character,
      p.range.end.line,
      p.range.end.character,
    ),
  );
}
