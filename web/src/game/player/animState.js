import {
  PUNCH_R,
  PUNCH_L,
  PUNCH_UPPER_R,
  KICK_KNOCKOUT,
  KICK_BRUCE_L,
  FLIP,
  RECOIL,
} from './anims.js';

function clone(v) {
  return JSON.parse(JSON.stringify(v));
}

function clip(id, label, frames, dur, hand, style) {
  return { id, label, frames: clone(frames), dur, hand, style };
}

/** Mutable animation bank used by game + AnimEditor. */
export const animState = {
  clips: {
    punch_r: clip('punch_r', 'Z1 Правая', PUNCH_R, 0.32, 'r', 'punch'),
    punch_l: clip('punch_l', 'Z2 Левая', PUNCH_L, 0.34, 'l', 'punch'),
    punch_upper_r: clip('punch_upper_r', 'Z3 Аперкот', PUNCH_UPPER_R, 0.42, 'r', 'upper'),
    kick_knockout: clip('kick_knockout', 'X1 Нокаут', KICK_KNOCKOUT, 0.42, 'l', 'knockout'),
    kick_bruce: clip('kick_bruce', 'X2 Брюс Ли', KICK_BRUCE_L, 0.5, 'l', 'bruce'),
    flip: clip('flip', 'Сальто (группировка)', FLIP, 0.85, 'l', 'flip'),
  },
  zOrder: ['punch_r', 'punch_l', 'punch_upper_r'],
  xOrder: ['kick_knockout', 'kick_bruce'],
  /** Clips not in punch combos (editor + runtime oneshots). */
  miscOrder: ['flip'],
  recoil: clone(RECOIL),
};

function allClipIds() {
  return [...animState.zOrder, ...animState.xOrder, ...animState.miscOrder];
}

export function listClips() {
  return allClipIds().map((id) => animState.clips[id]).filter(Boolean);
}

export function getClip(id) {
  return animState.clips[id];
}

export function getPunchCombo(kind) {
  const order = kind === 'z' ? animState.zOrder : animState.xOrder;
  return order.map((id) => {
    const c = animState.clips[id];
    return { frames: c.frames, dur: c.dur, hand: c.hand, style: c.style, id: c.id };
  });
}

/** Somersault oneshot — frames/dur from editor bank. */
export function getFlipClip() {
  const c = animState.clips.flip;
  return {
    frames: c?.frames || FLIP,
    dur: c?.dur ?? 0.85,
  };
}

export function resetAnimState() {
  animState.clips.punch_r = clip('punch_r', 'Z1 Правая', PUNCH_R, 0.32, 'r', 'punch');
  animState.clips.punch_l = clip('punch_l', 'Z2 Левая', PUNCH_L, 0.34, 'l', 'punch');
  animState.clips.punch_upper_r = clip(
    'punch_upper_r',
    'Z3 Аперкот',
    PUNCH_UPPER_R,
    0.42,
    'r',
    'upper',
  );
  animState.clips.kick_knockout = clip(
    'kick_knockout',
    'X1 Нокаут',
    KICK_KNOCKOUT,
    0.42,
    'l',
    'knockout',
  );
  animState.clips.kick_bruce = clip('kick_bruce', 'X2 Брюс Ли', KICK_BRUCE_L, 0.5, 'l', 'bruce');
  animState.clips.flip = clip('flip', 'Сальто (группировка)', FLIP, 0.85, 'l', 'flip');
  animState.miscOrder = ['flip'];
  animState.recoil = clone(RECOIL);
}

export function exportAnimJson() {
  const clips = {};
  for (const id of allClipIds()) {
    const c = animState.clips[id];
    if (!c) continue;
    clips[id] = {
      dur: c.dur,
      hand: c.hand,
      style: c.style,
      frames: c.frames,
    };
  }
  return JSON.stringify(
    {
      zOrder: animState.zOrder,
      xOrder: animState.xOrder,
      miscOrder: animState.miscOrder,
      clips,
    },
    null,
    2,
  );
}

/** Import editor JSON into animState. */
export function importAnimJson(data) {
  if (!data?.clips) return false;
  if (Array.isArray(data.zOrder)) animState.zOrder = [...data.zOrder];
  if (Array.isArray(data.xOrder)) animState.xOrder = [...data.xOrder];
  if (Array.isArray(data.miscOrder)) animState.miscOrder = [...data.miscOrder];
  for (const [id, c] of Object.entries(data.clips)) {
    const prev = animState.clips[id] || { id, label: id };
    animState.clips[id] = {
      id,
      label: prev.label || id,
      dur: c.dur ?? 0.3,
      hand: c.hand ?? 'l',
      style: c.style ?? 'punch',
      frames: clone(c.frames || []),
    };
    if (!allClipIds().includes(id) && !animState.miscOrder.includes(id)) {
      animState.miscOrder.push(id);
    }
  }
  return true;
}
