import { analyzeFile } from './astWalker';
import { FileSymbols } from './types';

/**
 * Parse cache for open documents, keyed by file path + document version.
 *
 * The CodeLens provider, the gutter renderer, and the on-change indexer all
 * analyze the active buffer, often for the same unchanged version within a
 * single settle. Caching by version collapses those into one parse. A small cap
 * bounds memory for long sessions with many files.
 */
const MAX_ENTRIES = 64;
const cache = new Map<string, { version: number; symbols: FileSymbols }>();

export function analyzeDocument(filePath: string, version: number, code: string): FileSymbols {
  const hit = cache.get(filePath);
  if (hit && hit.version === version) {
    return hit.symbols;
  }
  const symbols = analyzeFile(code, filePath);
  cache.delete(filePath);
  cache.set(filePath, { version, symbols });
  if (cache.size > MAX_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) {
      cache.delete(oldest);
    }
  }
  return symbols;
}

export function forgetDocument(filePath: string): void {
  cache.delete(filePath);
}
