import { PART_LAYOUT as DEFAULT_LAYOUT, PUPPET_TARGET_H } from './parts.js';

function cloneLayout(src) {
  return JSON.parse(JSON.stringify(src));
}

/** Mutable layout used by BonePuppet + editor. */
export const layoutState = {
  layout: cloneLayout(DEFAULT_LAYOUT),
  targetH: PUPPET_TARGET_H,
};

/** Hot-apply latest PART_LAYOUT (after editor JSON paste into parts.js). */
export function applyDefaultLayout() {
  layoutState.layout = cloneLayout(DEFAULT_LAYOUT);
  layoutState.targetH = PUPPET_TARGET_H;
}

export function resetLayout() {
  layoutState.layout = cloneLayout(DEFAULT_LAYOUT);
  layoutState.targetH = PUPPET_TARGET_H;
}

export function getLayout() {
  return layoutState.layout;
}

/** Merge editor JSON (full layout or { layout, targetH }). */
export function importLayoutJson(data) {
  if (!data || typeof data !== 'object') return false;
  if (data.layout) {
    layoutState.layout = cloneLayout(data.layout);
    if (data.targetH) layoutState.targetH = data.targetH;
  } else {
    layoutState.layout = cloneLayout(data);
  }
  return true;
}

export function exportLayoutJson() {
  return JSON.stringify(
    {
      targetH: layoutState.targetH,
      layout: layoutState.layout,
    },
    null,
    2,
  );
}
