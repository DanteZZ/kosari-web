import { GameState, storyFlag, setStoryFlag, logStory } from '../state/GameState.js';
import { stage } from './stage.js';

/**
 * Plays a story scene (story/scenes.js) inside a running cutscene: lines with
 * gestures, the camera on whoever talks, emotes, the phone, and the hero's
 * choices. Resolves with the outcome { end, log } the scene reached.
 *
 *   const out = await runTalk(scene, cine, MEET.povar, { cast: { povar: id } });
 */

const HERO_KEY = { p: 'pocik', s: 'svidetel', a: 'pistoletov', k: 'kama' };
const TAG_COLOR = { Драка: '#ff6a5a', Мир: '#7dffa0', Союз: '#6ad8ff', Пощадить: '#7dffa0', Слава: '#ffd23f', Свобода: '#ff9a3a', Милосердие: '#ff9ad8' };
const MAX_STEPS = 400;

/** Text / gesture written per hero (story H()) or one for everybody. */
export function perHero(v, hero = GameState.hero) {
  if (v && typeof v === 'object' && !Array.isArray(v) && ('pocik' in v || 'kama' in v)) return v[hero] ?? v.pocik;
  return v;
}

function test(cond, scene) {
  if (!cond) return true;
  return cond.split('&').every((c) => {
    c = c.trim();
    const neg = c.startsWith('!');
    if (neg) c = c.slice(1);
    let ok;
    if (c.startsWith('hero:')) ok = GameState.hero === (HERO_KEY[c.slice(5)] || c.slice(5));
    else if (c.startsWith('flag:')) ok = storyFlag(c.slice(5));
    else if (c.startsWith('money>=')) ok = (scene.player?.money || 0) >= Number(c.slice(7));
    else ok = false;
    return neg ? !ok : ok;
  });
}

/** Option text without its leading [Тег]: «[Драка] Лови сам.» → tag Драка, «Лови сам.» */
function splitTag(t) {
  const m = /^\[([^\]]+)\]\s*(.*)$/s.exec(t);
  if (!m) return { tag: null, text: t };
  // A bracket with no text after it is an action: «[Аплодировать]»
  if (!m[2]) return { tag: null, text: t, action: true };
  return { tag: m[1], text: m[2] };
}

export async function runTalk(scene, c, def, ctx = {}) {
  if (!def) return { end: 'fight' };
  // Legacy entry intros: a plain list of [who, text]
  if (Array.isArray(def)) def = { start: def };
  const cast = ctx.cast || {};
  const fighterOf = (who) => {
    if (who === 'hero') return scene.player;
    const id = cast[who];
    if (id != null) return scene.world.fighters.find((f) => f.id === id) || null;
    return scene.world.fighters.find((f) => f.kind === who && !f.dead && !f.removed) || null;
  };
  const people = () => ['hero', ...Object.keys(cast)].map(fighterOf).filter(Boolean);

  // Everybody turns to face each other and lowers the guard
  const hero = scene.player;
  const other = people().find((f) => f !== hero);
  if (other && hero) {
    hero.facing = other.x >= hero.x ? 1 : -1;
    other.facing = -hero.facing;
  }
  for (const f of people()) scene.setGesture(f.id, 'rest');

  let lastSpeaker = null;
  const shoot = async (f) => {
    if (!f) {
      // Off-screen voice: pull back to the whole scene
      const ps = people();
      if (ps.length) {
        const x = ps.reduce((a, p) => a + p.x, 0) / ps.length;
        await c.camTo(x, scene.focusOf(ps[0]).y - 20, 1.08, 420);
      }
      return;
    }
    if (lastSpeaker === f.id) return;
    lastSpeaker = f.id;
    const o = people().find((p) => p !== f);
    // Over the shoulder: the speaker in the frame, the other at its edge
    const lean = o ? Math.sign(o.x - f.x) * 110 : 0;
    await c.camTo(f.x + lean, scene.focusOf(f).y, 1.38, 330);
  };

  const say = async (who, text, gesture) => {
    // Свидетель never says a word: what others would say, he types on his phone
    if (who === 'hero' && GameState.hero === 'svidetel' && text && !/^\*[\s\S]*\*$/.test(text)) {
      text = `*пишет в телефоне и показывает: «${text}»*`;
      gesture = gesture || 'phone';
    }
    const f = fighterOf(who);
    await shoot(f);
    const sp = { ...scene.speakerOf(who) };
    const g = perHero(gesture);
    if (f) {
      if (g) scene.setGesture(f.id, g);
      sp.onTalk = (on) => {
        if (!g) scene.setGesture(f.id, on ? 'talk' : 'rest');
      };
    }
    await c.say(sp, text);
  };

  const headOf = (f) => {
    const v = scene.views.get(f.id);
    return { x: f.x, y: stage.groundY(f.z) - f.y - (v?.bodyH || 300) - 40 };
  };

  let node = def.start || [];
  let i = 0;
  for (let guard = 0; guard < MAX_STEPS; guard += 1) {
    if (i >= node.length) return { end: 'fight' };
    const st = node[i];
    i += 1;
    if (Array.isArray(st)) {
      const [who, text, gesture] = st;
      await say(who, perHero(text), gesture);
      continue;
    }
    if (st.if !== undefined && st.go) {
      if (test(st.if, scene)) {
        node = def[st.go] || [];
        i = 0;
      }
      continue;
    }
    if (st.go) {
      node = def[st.go] || [];
      i = 0;
      continue;
    }
    if (st.set) {
      for (const f of [].concat(st.set)) setStoryFlag(f);
    }
    if (st.money) {
      if (scene.player) scene.player.money = Math.max(0, (scene.player.money || 0) + st.money);
      scene.sound.play('cash', { volume: 0.4 });
    }
    if (st.do) {
      const [who, g] = st.do;
      const f = fighterOf(who);
      if (f) {
        if (g === 'walk') await scene.walkStep(f, 120, 900);
        else scene.setGesture(f.id, g);
      }
    }
    if (st.emote) {
      const [who, sym] = st.emote;
      const f = fighterOf(who);
      if (f) {
        const h = headOf(f);
        c.emote(h.x, h.y, sym);
      }
      await c.wait(380);
    }
    if (st.phone) {
      c.hideBox();
      const known = storyFlag('producer_known');
      let from = perHero(st.phone.from);
      // Once the hero knows, every alias shows its real name
      if (known && st.phone.from && typeof st.phone.from === 'object') from = '@prodakshn';
      if (hero) scene.setGesture(hero.id, 'phone');
      await c.phone(from, perHero(st.phone.msgs) || []);
      if (hero) scene.setGesture(hero.id, 'rest');
    }
    if (st.fx === 'flash') c.flash(0xffffff, 320, 0.9);
    if (st.fx === 'shake') scene.shake(500, 14);
    if (st.fx === 'dim') c.dim(true);
    if (st.fx === 'undim') c.dim(false);
    if (st.wait) await c.wait(st.wait);
    if (st.ask) {
      const opts = st.ask.filter((o) => (!o.only || test(`hero:${o.only}`, scene)) && test(o.if, scene));
      if (!opts.length) continue;
      const shown = opts.map((o) => {
        const raw = perHero(o.t);
        const sp = splitTag(raw);
        const tag = o.tag || sp.tag;
        const cost = o.cost ? `-${o.cost} К` : null;
        return {
          text: cost ? `${sp.text}  (${cost})` : sp.text,
          tag,
          tagColor: TAG_COLOR[tag] || (tag?.startsWith('+') ? '#ffd23f' : null),
          off: o.cost ? (scene.player?.money || 0) < o.cost : false,
          raw,
          action: sp.action,
          spoken: sp.text,
        };
      });
      const k = await c.choose(shown);
      const o = opts[k];
      const pick = shown[k];
      // The hero says what was chosen (actions in brackets are shown as actions)
      // ([Bracket] actions are not said — the gesture that follows shows them)
      if (!o.mute && !pick.action) await say('hero', pick.spoken, o.gesture);
      if (o.cost && scene.player) {
        scene.player.money = Math.max(0, (scene.player.money || 0) - o.cost);
        scene.sound.play('cash', { volume: 0.45 });
      }
      for (const f of [].concat(o.set || [])) setStoryFlag(f);
      if (o.log) logStory(scene.map?.id, o.log);
      if (o.end) return { end: o.end, log: o.log };
      if (o.go) {
        node = def[o.go] || [];
        i = 0;
      }
      continue;
    }
    if (st.end) {
      if (st.log) logStory(scene.map?.id, st.log);
      return { end: st.end, log: st.log };
    }
  }
  return { end: 'fight' };
}
