import * as assert from 'assert';
import { applyOpacity } from '../../src/ui/iconTemplating';

describe('applyOpacity', () => {
  it('replaces every opacity attribute with the given alpha', () => {
    const svg = '<svg><path opacity="0.8" d="M0 0"/><circle opacity="0.8"/></svg>';
    const out = applyOpacity(svg, 0.5);
    assert.ok(!out.includes('"0.8"'), out);
    assert.strictEqual((out.match(/opacity="0.5"/g) ?? []).length, 2);
  });

  it('handles any prior opacity value, not just 0.8', () => {
    const svg = '<path opacity="0.33"/>';
    assert.strictEqual(applyOpacity(svg, 1), '<path opacity="1"/>');
  });

  it('leaves markup without opacity attributes unchanged', () => {
    const svg = '<svg><path d="M0 0"/></svg>';
    assert.strictEqual(applyOpacity(svg, 0.4), svg);
  });
});
