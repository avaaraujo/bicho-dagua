// Teclado, botões de toque e controle de videogame, tudo virando { steer, throttle }.
export function createInput() {
  const keys = new Set();
  const touch = { left: false, right: false, gas: false, brake: false };
  // A/D viram, J acelera, K freia e dá ré. Setas também funcionam.
  const LEFT = ['KeyA', 'ArrowLeft'];
  const RIGHT = ['KeyD', 'ArrowRight'];
  const GAS = ['KeyJ', 'ArrowUp'];
  const BRAKE = ['KeyK', 'ArrowDown'];
  const GAME_KEYS = new Set([...LEFT, ...RIGHT, ...GAS, ...BRAKE]);

  window.addEventListener('keydown', (e) => {
    if (e.target instanceof HTMLInputElement) return;
    if (GAME_KEYS.has(e.code)) e.preventDefault();
    keys.add(e.code);
  });
  window.addEventListener('keyup', (e) => keys.delete(e.code));
  window.addEventListener('blur', () => keys.clear());

  function bindButton(el, prop) {
    const on = (e) => {
      e.preventDefault();
      touch[prop] = true;
      el.classList.add('is-pressed');
      if (e.pointerId !== undefined) el.setPointerCapture?.(e.pointerId);
    };
    const off = () => {
      touch[prop] = false;
      el.classList.remove('is-pressed');
    };
    el.addEventListener('pointerdown', on);
    el.addEventListener('pointerup', off);
    el.addEventListener('pointercancel', off);
    el.addEventListener('lostpointercapture', off);
    el.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  const any = (list) => list.some((k) => keys.has(k));

  return {
    bindTouch(leftEl, rightEl, gasEl, brakeEl) {
      bindButton(leftEl, 'left');
      bindButton(rightEl, 'right');
      bindButton(gasEl, 'gas');
      bindButton(brakeEl, 'brake');
    },
    read() {
      let steer = 0;
      let throttle = 0;
      if (any(LEFT) || touch.left) steer -= 1;
      if (any(RIGHT) || touch.right) steer += 1;
      if (any(GAS) || touch.gas) throttle = 1;
      if (any(BRAKE) || touch.brake) throttle = throttle > 0 ? 0 : -1;
      const pad = navigator.getGamepads?.().find((p) => p && p.connected);
      if (pad) {
        const ax = pad.axes[0] ?? 0;
        if (Math.abs(ax) > 0.18) steer = Math.max(-1, Math.min(1, ax));
        if (pad.buttons[14]?.pressed) steer = -1;
        if (pad.buttons[15]?.pressed) steer = 1;
        if (pad.buttons[0]?.pressed || pad.buttons[7]?.value > 0.2) throttle = Math.max(throttle, pad.buttons[7]?.value || 1);
        if (pad.buttons[1]?.pressed || pad.buttons[6]?.value > 0.2) throttle = -1;
      }
      return { steer, throttle };
    },
  };
}
