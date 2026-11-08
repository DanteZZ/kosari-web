import { startPenalty, prePenalty, stepPenalty, penaltyText } from './penalty.js';
import { startBench, preBench, stepBench, benchText } from './bench.js';
import { startStealth, stepStealth, stealthText } from './stealth.js';
import { startPose, prePose, stepPose, poseText } from './pose.js';
import { startTrading, preTrading, stepTrading, tradingText } from './trading.js';

/**
 * Arena minigames (map arena `mini: { type, ... }`), run before the arena's
 * waves. Each one:
 *   start(world, box, cfg) → sets world.mini
 *   pre(world)             → optional: reads the controls before input is latched
 *   step(world)            → after the fighters moved; sets mini.done at the end
 *   text(mini)             → HUD line
 * When it is done the director starts the waves — or, with `mini.skipWaves`,
 * clears the arena at once; `mini.extra` adds spawns to the first wave.
 */
export const MINIS = {
  penalty: { start: startPenalty, pre: prePenalty, step: stepPenalty, text: penaltyText },
  bench: { start: startBench, pre: preBench, step: stepBench, text: benchText },
  stealth: { start: startStealth, step: stepStealth, text: stealthText },
  pose: { start: startPose, pre: prePose, step: stepPose, text: poseText },
  trading: { start: startTrading, pre: preTrading, step: stepTrading, text: tradingText },
};
