/**
 * Rewrite every `opacity="…"` attribute in an SVG string to `alpha`.
 *
 * Gutter icons have no runtime opacity API, so the configurable icon alpha is
 * baked into a generated copy of each bundled SVG template.
 */
export function applyOpacity(svg: string, alpha: number): string {
  return svg.replace(/opacity="[^"]*"/g, `opacity="${alpha}"`);
}
