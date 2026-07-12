import * as assert from 'assert';
import { PhpIndex } from '../../src/index/phpIndex';
import { analyzeFile } from '../../src/index/astWalker';

const CODE = `<?php
interface DummyInterface {
    public function interfaceMethod();
}
class BaseClasss implements DummyInterface {
    public function interfaceMethod() {}
    public function otherMethod() {}
}
class ChildClasss extends BaseClasss implements DummyInterface {
    public function interfaceMethod() {}
    public function otherMethod() {}
}
`;

function names(types: { name: string }[]): string[] {
  return types.map((t) => t.name).sort();
}

describe('PhpIndex', () => {
  function build(): PhpIndex {
    const index = new PhpIndex();
    index.setFile('/proj/a.php', analyzeFile(CODE, '/proj/a.php').types);
    return index;
  }

  it('looks up types by FQN case-insensitively', () => {
    const index = build();
    assert.strictEqual(index.getType('baseclasss')?.name, 'BaseClasss');
    assert.strictEqual(index.getType('BASECLASSS')?.name, 'BaseClasss');
  });

  it('lists direct implementors of an interface', () => {
    const index = build();
    assert.deepStrictEqual(names(index.directImplementors('DummyInterface')), ['BaseClasss', 'ChildClasss']);
  });

  it('lists direct subclasses of a class', () => {
    const index = build();
    assert.deepStrictEqual(names(index.directSubclasses('BaseClasss')), ['ChildClasss']);
  });

  it('returns empty arrays for types with no relations', () => {
    const index = build();
    assert.deepStrictEqual(index.directSubclasses('ChildClasss'), []);
    assert.deepStrictEqual(index.directImplementors('BaseClasss'), []);
  });

  it('forgets a file\'s symbols when it is removed', () => {
    const index = build();
    index.removeFile('/proj/a.php');
    assert.strictEqual(index.getType('BaseClasss'), undefined);
    assert.deepStrictEqual(index.directImplementors('DummyInterface'), []);
  });

  it('replaces a file\'s symbols on re-set', () => {
    const index = build();
    index.setFile('/proj/a.php', analyzeFile('<?php class BaseClasss {}', '/proj/a.php').types);
    assert.deepStrictEqual(index.directImplementors('DummyInterface'), []);
    assert.strictEqual(index.getType('BaseClasss')?.name, 'BaseClasss');
  });

  it('keeps relationships across files and preserves other files when one is re-seeded', () => {
    const index = new PhpIndex();
    index.setFile('/proj/base.php', analyzeFile('<?php class Base {}', '/proj/base.php').types);
    index.setFile('/proj/child.php', analyzeFile('<?php class Child extends Base {}', '/proj/child.php').types);
    assert.deepStrictEqual(names(index.directSubclasses('Base')), ['Child']);

    // Re-seeding base.php (as the CodeLens/gutter providers do every render) must
    // not drop the cross-file edge contributed by child.php.
    index.setFile('/proj/base.php', analyzeFile('<?php class Base {}', '/proj/base.php').types);
    assert.deepStrictEqual(names(index.directSubclasses('Base')), ['Child']);
  });
});
