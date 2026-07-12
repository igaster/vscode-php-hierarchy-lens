import * as assert from 'assert';
import { PhpIndex } from '../../src/index/phpIndex';
import { analyzeFile } from '../../src/index/astWalker';
import { RelationService } from '../../src/relations/relationService';
import { buildIndicators, Indicator } from '../../src/ui/indicators';

const CODE = `<?php
interface DummyInterface {
    public function interfaceMethod();
}
class BaseClasss implements DummyInterface {
    use HelperTrait;
    public function interfaceMethod() {}
    public function otherMethod() {}
    private function secret() {}
}
class ChildClasss extends BaseClasss implements DummyInterface {
    public function interfaceMethod() {}
    public function otherMethod() {}
}
trait HelperTrait {
    public function help() {}
}
`;

function context(): { file: ReturnType<typeof analyzeFile>; rel: RelationService } {
  const index = new PhpIndex();
  const file = analyzeFile(CODE, '/proj/a.php');
  index.setFile('/proj/a.php', file.types);
  return { file, rel: new RelationService(index) };
}

function setup(): Indicator[] {
  const { file, rel } = context();
  return buildIndicators(file, rel);
}

function has(inds: Indicator[], direction: 'up' | 'down', title: string): boolean {
  return inds.some((i) => i.direction === direction && i.title === title);
}

describe('buildIndicators', () => {
  it('shows pluralized downward counts', () => {
    const inds = setup();
    assert.ok(has(inds, 'down', '2 implementations'), 'interface + interface method');
    assert.ok(has(inds, 'down', '1 inheritor'), 'BaseClasss');
    assert.ok(has(inds, 'down', '1 override'), 'overridden base methods');
    assert.ok(has(inds, 'down', 'used by 1'), 'HelperTrait');
  });

  it('shows upward prototype links', () => {
    const inds = setup();
    assert.ok(has(inds, 'up', 'implements DummyInterface'), 'method implementing interface');
    assert.ok(has(inds, 'up', 'overrides BaseClasss'), 'method overriding parent');
  });

  it('does not emit indicators for a private method with no relations', () => {
    const inds = setup();
    // `secret` is private and unrelated; no indicator anchored on its line.
    const secretLine = 8; // 0-based line of `private function secret()`
    assert.ok(!inds.some((i) => i.anchor.start.line === secretLine));
  });

  it('points an upward override link at the base method', () => {
    const inds = setup();
    const overrideInd = inds.find((i) => i.direction === 'up' && i.title === 'overrides BaseClasss');
    assert.ok(overrideInd);
    assert.strictEqual(overrideInd.targets.length, 1);
    // base method `otherMethod` is on 0-based line 7
    assert.strictEqual(overrideInd.targets[0].range.start.line, 7);
    assert.strictEqual(overrideInd.targets[0].filePath, '/proj/a.php');
  });

  it('gives every indicator at least one navigation target', () => {
    const inds = setup();
    assert.ok(inds.length > 0);
    assert.ok(inds.every((i) => i.targets.length > 0));
  });

  it('labels each target with a human-readable name for the hover', () => {
    const inds = setup();

    // Interface implementations -> implementing class names.
    const ifaceImpls = inds.find((i) => i.kind === 'implementations' && i.title === '2 implementations');
    assert.ok(ifaceImpls);
    assert.deepStrictEqual(ifaceImpls.targets.map((t) => t.label).sort(), ['BaseClasss', 'ChildClasss']);

    // Upward override link -> the base method as Class::method.
    const overrideUp = inds.find((i) => i.direction === 'up' && i.title === 'overrides BaseClasss');
    assert.ok(overrideUp);
    assert.strictEqual(overrideUp.targets[0].label, 'BaseClasss::otherMethod');
  });

  it('anchors both an up and a down indicator on the same line (drives the "both" gutter icon)', () => {
    const inds = setup();
    // BaseClasss::interfaceMethod is overridden below (down) AND implements the
    // interface (up) — both must land on the same line for the combined icon.
    const byLine = new Map<number, Set<string>>();
    for (const i of inds) {
      const set = byLine.get(i.anchor.start.line) ?? new Set<string>();
      set.add(i.direction);
      byLine.set(i.anchor.start.line, set);
    }
    const hasBothOnOneLine = [...byLine.values()].some((s) => s.has('up') && s.has('down'));
    assert.ok(hasBothOnOneLine, 'expected at least one line with both up and down indicators');
  });

  it('tags every indicator with a kind', () => {
    const inds = setup();
    const kinds = new Set(inds.map((i) => i.kind));
    assert.ok(kinds.has('implementations'));
    assert.ok(kinds.has('inheritors'));
    assert.ok(kinds.has('overrides'));
    assert.ok(kinds.has('parent'));
    assert.ok(kinds.has('traitUsages'));
  });
});

describe('buildIndicators options', () => {
  it('emits all indicator kinds by default', () => {
    const { file, rel } = context();
    const inds = buildIndicators(file, rel);
    assert.ok(inds.some((i) => i.kind === 'overrides'));
    assert.ok(inds.some((i) => i.kind === 'traitUsages'));
  });

  it('omits a disabled indicator kind but keeps the others', () => {
    const { file, rel } = context();
    const inds = buildIndicators(file, rel, { overrides: false });
    assert.ok(!inds.some((i) => i.kind === 'overrides'), 'overrides suppressed');
    assert.ok(inds.some((i) => i.kind === 'implementations'), 'implementations kept');
  });

  it('can disable trait usage indicators independently', () => {
    const { file, rel } = context();
    const inds = buildIndicators(file, rel, { traitUsages: false });
    assert.ok(!inds.some((i) => i.kind === 'traitUsages'));
    assert.ok(inds.some((i) => i.kind === 'parent'));
  });

  it('shows an upward "extends" link on a sub-interface', () => {
    const index = new PhpIndex();
    const file = analyzeFile('<?php interface A {} interface B extends A {}', '/p/a.php');
    index.setFile('/p/a.php', file.types);
    const inds = buildIndicators(file, new RelationService(index));
    assert.ok(inds.some((i) => i.direction === 'up' && i.title === 'extends A'));
  });
});
