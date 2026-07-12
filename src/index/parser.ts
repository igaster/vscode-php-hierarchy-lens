// php-parser ships type declarations that export nothing usable, so we type the
// constructor locally and require it directly.
type PhpEngine = { parseCode(code: string, filename: string): any };
type PhpEngineCtor = new (options: unknown) => PhpEngine;
// eslint-disable-next-line @typescript-eslint/no-var-requires
const Engine = require('php-parser') as PhpEngineCtor;

/**
 * Parse PHP source into a php-parser AST.
 *
 * `suppressErrors` keeps partial/invalid buffers (mid-edit) parseable, and
 * `withPositions` gives us the `loc` data used to anchor CodeLens and gutter icons.
 */
export function parseProgram(code: string, filePath: string): any {
  const engine = new Engine({
    parser: { extractDoc: false, suppressErrors: true },
    ast: { withPositions: true },
  });
  return engine.parseCode(code, filePath);
}
