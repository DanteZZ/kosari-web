import Phaser from 'phaser';
import { VIEW_W, VIEW_H } from './constants.js';
import { GameState, SESSION_SHOP, buySessionItem } from '../state/GameState.js';

const PANEL_W = 268;
const SLIDE_MS = 160;

/**
 * CS-style side buy menu — slides from the left, does not pause combat.
 * Number keys 1–N buy while open; mouse clicks also work.
 * @param {Phaser.Scene} scene
 */
export function createSessionShop(scene) {
  const root = scene.add.container(-PANEL_W - 8, 0).setDepth(2500).setScrollFactor(0).setVisible(false);
  root.setData('isUi', true);

  const panelH = Math.min(VIEW_H - 24, 52 + SESSION_SHOP.length * 44 + 36);
  const panel = scene.add
    .rectangle(0, 12, PANEL_W, panelH, 0x121218, 0.92)
    .setOrigin(0, 0)
    .setStrokeStyle(2, 0xf0c040);
  const title = scene.add
    .text(12, 22, 'ЗАКУПКА', {
      fontFamily: 'Russo One, Impact, sans-serif',
      fontSize: '18px',
      color: '#f0c040',
    })
    .setOrigin(0, 0);
  const bal = scene.add
    .text(PANEL_W - 12, 24, '', {
      fontFamily: 'Russo One, Impact, sans-serif',
      fontSize: '14px',
      color: '#ffffff',
    })
    .setOrigin(1, 0);
  const hint = scene.add
    .text(12, panelH - 8, '1–6 купить · B/Esc', {
      fontFamily: 'sans-serif',
      fontSize: '11px',
      color: '#888888',
    })
    .setOrigin(0, 1);

  root.add([panel, title, bal, hint]);

  const rows = [];
  SESSION_SHOP.forEach((item, i) => {
    const y = 56 + i * 44;
    const keyNum = i + 1;
    const btn = scene.add
      .rectangle(8, y, PANEL_W - 16, 38, 0x2a2a32)
      .setOrigin(0, 0)
      .setStrokeStyle(1, 0x555555)
      .setInteractive({ useHandCursor: true });
    const keyBadge = scene.add
      .text(16, y + 19, `${keyNum}`, {
        fontFamily: 'Russo One, Impact, sans-serif',
        fontSize: '15px',
        color: '#f0c040',
      })
      .setOrigin(0, 0.5);
    const label = scene.add
      .text(36, y + 11, '', {
        fontFamily: 'Russo One, Impact, sans-serif',
        fontSize: '13px',
        color: '#eeeeee',
      })
      .setOrigin(0, 0);
    const sub = scene.add
      .text(36, y + 26, '', {
        fontFamily: 'sans-serif',
        fontSize: '10px',
        color: '#999999',
      })
      .setOrigin(0, 0);
    const price = scene.add
      .text(PANEL_W - 16, y + 19, '', {
        fontFamily: 'Russo One, Impact, sans-serif',
        fontSize: '13px',
        color: '#f0c040',
      })
      .setOrigin(1, 0.5);

    const flash = () => {
      btn.setFillStyle(0x4a4a28);
      scene.time.delayedCall(80, () => {
        if (btn.active) btn.setFillStyle(0x2a2a32);
      });
    };

    btn.on('pointerover', () => btn.setFillStyle(0x3a3a48));
    btn.on('pointerout', () => btn.setFillStyle(0x2a2a32));
    btn.on('pointerdown', () => {
      if (tryBuy(item)) flash();
    });

    root.add([btn, keyBadge, label, sub, price]);
    rows.push({ item, label, sub, price, btn, keyNum });
  });

  let open = false;
  let tween = null;

  function refresh() {
    bal.setText(`$ ${GameState.moneyScore}`);
    rows.forEach(({ item, label, sub, price }) => {
      let status = item.desc || '';
      if (item.flag) {
        status = GameState[item.flag] ? '+патроны' : 'купить';
      }
      label.setText(item.title);
      sub.setText(status);
      price.setText(`$ ${item.price}`);
      price.setColor(GameState.moneyScore >= item.price ? '#f0c040' : '#666666');
    });
  }

  function tryBuy(item) {
    if (buySessionItem(item)) {
      scene.sound.play('cash', { volume: 0.45 });
      scene.player?.syncWeapon?.();
      scene.player?.selectWeapon?.(GameState.weaponChoose);
      refresh();
      scene.pushHud?.();
      return true;
    }
    scene.sound.play('beep', { volume: 0.3 });
    return false;
  }

  function setOpen(v) {
    const next = !!v;
    if (next === open && root.visible === next) {
      if (next) refresh();
      return;
    }
    open = next;
    if (tween) {
      tween.stop();
      tween = null;
    }
    if (next) {
      root.setVisible(true);
      refresh();
      tween = scene.tweens.add({
        targets: root,
        x: 8,
        duration: SLIDE_MS,
        ease: 'Cubic.easeOut',
      });
    } else {
      tween = scene.tweens.add({
        targets: root,
        x: -PANEL_W - 8,
        duration: SLIDE_MS,
        ease: 'Cubic.easeIn',
        onComplete: () => root.setVisible(false),
      });
    }
  }

  /** Buy by 1-based slot index while menu is open. */
  function buySlot(slot1based) {
    if (!open) return false;
    const row = rows.find((r) => r.keyNum === slot1based);
    if (!row) return false;
    return tryBuy(row.item);
  }

  return {
    root,
    refresh,
    buySlot,
    isOpen: () => open,
    setVisible(v) {
      setOpen(v);
    },
    layout() {
      // Keep panel height usable on resize
      panel.setSize(PANEL_W, Math.min(VIEW_H - 24, 52 + SESSION_SHOP.length * 44 + 36));
      hint.setY(panel.height - 8);
      if (!open) root.x = -PANEL_W - 8;
    },
    destroy() {
      root.destroy(true);
    },
  };
}
