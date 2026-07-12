import * as assert from 'assert';
import * as path from 'path';
import * as vscode from 'vscode';

let fixtureUri: vscode.Uri;

async function openAndActivate(): Promise<void> {
  const fixture = path.resolve(__dirname, '../../../test/fixtures/example.php');
  fixtureUri = vscode.Uri.file(fixture);
  const doc = await vscode.workspace.openTextDocument(fixtureUri);
  await vscode.window.showTextDocument(doc);

  const ext = vscode.extensions.getExtension('igaster.php-hierarchy-lens');
  assert.ok(ext, 'extension should be discoverable');
  await ext!.activate();
  await new Promise((r) => setTimeout(r, 800));
}

async function lensTitles(): Promise<string[]> {
  const lenses = await vscode.commands.executeCommand<vscode.CodeLens[]>(
    'vscode.executeCodeLensProvider',
    fixtureUri,
  );
  return (lenses ?? []).map((l) => l.command?.title ?? '');
}

async function setConfig(key: string, value: unknown): Promise<void> {
  await vscode.workspace
    .getConfiguration('phpRelations')
    .update(key, value, vscode.ConfigurationTarget.Workspace);
}

describe('PHP Relations integration', () => {
  before(async function () {
    this.timeout(30000);
    await openAndActivate();
  });

  describe('default indicators', () => {
    let titles: string[];
    before(async () => {
      titles = await lensTitles();
    });
    const some = (s: string): boolean => titles.some((t) => t.includes(s));

    it('produces CodeLenses for the fixture', () => {
      assert.ok(titles.length > 0, JSON.stringify(titles));
    });
    it('shows implementation counts', () => assert.ok(some('2 implementations'), JSON.stringify(titles)));
    it('shows class inheritor count', () => assert.ok(some('1 inheritor'), JSON.stringify(titles)));
    it('shows method override count', () => assert.ok(some('1 override'), JSON.stringify(titles)));
    it('shows upward "implements" link', () => assert.ok(some('implements DummyInterface'), JSON.stringify(titles)));
    it('shows upward "overrides" link', () => assert.ok(some('overrides BaseClasss'), JSON.stringify(titles)));
    it('shows trait usage count', () => assert.ok(some('used by 1'), JSON.stringify(titles)));
  });

  describe('settings', () => {
    afterEach(async () => {
      await setConfig('enable', undefined);
      await setConfig('codeLens.enable', undefined);
      await setConfig('indicators.overrides', undefined);
      await setConfig('gutterIcons.style', undefined);
      await setConfig('gutterIcons.opacity', undefined);
      await setConfig('gutterIcons.hover', undefined);
      await setConfig('gutterIcons.hoverLimit', undefined);
    });

    it('toggling the hover popup and its limit does not throw or break lenses', async () => {
      await setConfig('gutterIcons.hover', false);
      await setConfig('gutterIcons.hoverLimit', 3);
      const titles = await lensTitles();
      assert.ok(titles.length > 0, JSON.stringify(titles));
    });

    it('switching gutter icon style rebuilds without breaking lenses', async () => {
      for (const style of ['triangles', 'chevrons', 'circles', 'arrows']) {
        await setConfig('gutterIcons.style', style);
        const titles = await lensTitles();
        assert.ok(titles.length > 0, `style ${style} kept lenses: ${JSON.stringify(titles)}`);
      }
    });

    it('changing gutter icon opacity does not throw or break lenses', async () => {
      for (const opacity of [30, 100, 80]) {
        await setConfig('gutterIcons.opacity', opacity);
        const titles = await lensTitles();
        assert.ok(titles.length > 0, `opacity ${opacity} kept lenses`);
      }
    });

    it('disabling an indicator kind removes only those lenses', async () => {
      await setConfig('indicators.overrides', false);
      const titles = await lensTitles();
      // The downward "N override(s)" count lens is gone...
      assert.ok(!titles.some((t) => /\d+ override/.test(t)), `override count gone: ${JSON.stringify(titles)}`);
      // ...but unrelated kinds remain, including the upward "overrides X" parent link.
      assert.ok(titles.some((t) => t.includes('implementations')), 'implementations remain');
      assert.ok(titles.some((t) => t.includes('overrides BaseClasss')), 'parent link remains');
    });

    it('disabling CodeLens produces no lenses', async () => {
      await setConfig('codeLens.enable', false);
      const titles = await lensTitles();
      assert.strictEqual(titles.length, 0, JSON.stringify(titles));
    });

    it('the master switch disables all lenses', async () => {
      await setConfig('enable', false);
      const titles = await lensTitles();
      assert.strictEqual(titles.length, 0, JSON.stringify(titles));
    });
  });
});
