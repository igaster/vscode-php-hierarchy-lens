import * as vscode from 'vscode';
import { IndicatorOptions } from './indicators';

export type GutterIconStyle = 'arrows' | 'triangles' | 'chevrons' | 'circles';

const ICON_STYLES: GutterIconStyle[] = ['arrows', 'triangles', 'chevrons', 'circles'];

export interface PhpRelationsConfig {
  enable: boolean;
  codeLens: boolean;
  gutterIcons: boolean;
  gutterIconStyle: GutterIconStyle;
  gutterIconOpacity: number;
  hover: boolean;
  hoverLimit: number;
  indicators: IndicatorOptions;
}

function clamp(n: number, min: number, max: number): number {
  if (Number.isNaN(n)) {
    return max;
  }
  return Math.min(max, Math.max(min, n));
}

/** Read the current `phpRelations.*` settings into a plain object. */
export function readConfig(): PhpRelationsConfig {
  const c = vscode.workspace.getConfiguration('phpRelations');
  const style = c.get<string>('gutterIcons.style', 'triangles');
  return {
    enable: c.get<boolean>('enable', true),
    codeLens: c.get<boolean>('codeLens.enable', true),
    gutterIcons: c.get<boolean>('gutterIcons.enable', true),
    gutterIconStyle: (ICON_STYLES.includes(style as GutterIconStyle)
      ? style
      : 'triangles') as GutterIconStyle,
    // Stored as an integer percentage (10–100) to avoid locale decimal-separator
    // issues in the settings UI; exposed here as a 0–1 fraction.
    gutterIconOpacity: clamp(c.get<number>('gutterIcons.opacity', 50), 10, 100) / 100,
    hover: c.get<boolean>('gutterIcons.hover', true),
    hoverLimit: Math.round(clamp(c.get<number>('gutterIcons.hoverLimit', 15), 1, 200)),
    indicators: {
      implementations: c.get<boolean>('indicators.implementations', true),
      inheritors: c.get<boolean>('indicators.inheritors', true),
      overrides: c.get<boolean>('indicators.overrides', true),
      parent: c.get<boolean>('indicators.parent', true),
      traitUsages: c.get<boolean>('indicators.traitUsages', true),
    },
  };
}
