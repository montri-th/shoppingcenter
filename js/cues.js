/**
 * Non-colour cues of the categorical series landometer-series-10-v8 (LDS 0.9.7 colorRegistry
 * values.series[].cue). One SVG path per cue on a 12 × 12 grid, shared by the DOM pins,
 * the legend, the charts and the GPU icons (Path2D reads the same path data), so a group
 * always carries the same shape wherever its colour appears.
 */
export const CUE_PATHS = Object.freeze({
  circle: 'M1,6a5,5 0 1,0 10,0a5,5 0 1,0 -10,0Z',
  hexagon: 'M6,0.8L10.6,3.4L10.6,8.6L6,11.2L1.4,8.6L1.4,3.4Z',
  diamond: 'M6,0.6L11.4,6L6,11.4L0.6,6Z',
  cross: 'M9.36,0.45L11.55,2.64L8.19,6.00L11.55,9.36L9.36,11.55L6.00,8.19L2.64,11.55L0.45,9.36L3.81,6.00L0.45,2.64L2.64,0.45L6.00,3.81Z',
  star: 'M6.00,0.65L7.44,4.37L11.42,4.59L8.33,7.11L9.35,10.96L6.00,8.80L2.65,10.96L3.67,7.11L0.58,4.59L4.56,4.37Z',
  ring: 'M0.8,6a5.2,5.2 0 1,0 10.4,0a5.2,5.2 0 1,0 -10.4,0ZM3.5,6a2.5,2.5 0 1,0 5,0a2.5,2.5 0 1,0 -5,0Z',
  plus: 'M4.30,0.80L7.70,0.80L7.70,4.30L11.20,4.30L11.20,7.70L7.70,7.70L7.70,11.20L4.30,11.20L4.30,7.70L0.80,7.70L0.80,4.30L4.30,4.30Z',
  dash: 'M2,3.6H10A1.6,1.6 0 0 1 11.6,5.2V6.8A1.6,1.6 0 0 1 10,8.4H2A1.6,1.6 0 0 1 0.4,6.8V5.2A1.6,1.6 0 0 1 2,3.6Z',
});

/** Inline SVG for one cue; colour comes from CSS (`fill: var(--pin-fill)` on the class). */
export function cueSVG(cue, {className = 'cue-shape', title = ''} = {}) {
  const d = CUE_PATHS[cue] || CUE_PATHS.circle;
  return `<svg class="${className}" viewBox="0 0 12 12" aria-hidden="true" focusable="false">${title ? `<title>${title}</title>` : ''}<path d="${d}" fill-rule="evenodd"/></svg>`;
}

/**
 * Draw a cue into an ImageData for a MapLibre symbol icon (non-SDF, theme colours baked in;
 * the icons are re-created with the style on every theme change).
 */
export function cueImage(cue, {fill, stroke, halo, size = 15, pixelRatio = 2} = {}) {
  const px = Math.round(size * pixelRatio);
  const canvas = typeof OffscreenCanvas === 'function' ? new OffscreenCanvas(px, px) : Object.assign(document.createElement('canvas'), {width: px, height: px});
  const ctx = canvas.getContext('2d');
  const path = new Path2D(CUE_PATHS[cue] || CUE_PATHS.circle);
  const scale = (px - 4 * pixelRatio) / 12;
  ctx.translate(2 * pixelRatio, 2 * pixelRatio);
  ctx.scale(scale, scale);
  ctx.lineJoin = 'round';
  ctx.lineWidth = (2.6 * pixelRatio) / scale;
  ctx.strokeStyle = halo;
  ctx.stroke(path);
  ctx.lineWidth = (0.9 * pixelRatio) / scale;
  ctx.strokeStyle = stroke;
  ctx.stroke(path);
  ctx.fillStyle = fill;
  ctx.fill(path, 'evenodd');
  return ctx.getImageData(0, 0, px, px);
}
