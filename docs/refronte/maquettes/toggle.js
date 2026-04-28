/* Toggle desktop/mobile + scene navigation */

document.querySelectorAll('[data-view]').forEach(btn => {
  btn.addEventListener('click', () => {
    const view = btn.dataset.view;
    document.querySelectorAll('[data-view]').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    document.querySelectorAll('.scene.active .viewport-desktop, .scene.active .viewport-mobile').forEach(v => v.classList.remove('show'));
    const sel = view === 'desktop' ? '.scene.active .viewport-desktop' : '.scene.active .viewport-mobile';
    const target = document.querySelector(sel);
    if (target) target.classList.add('show');
  });
});

document.querySelectorAll('[data-scene]').forEach(btn => {
  btn.addEventListener('click', () => {
    const scene = btn.dataset.scene;
    if (!scene) return;
    document.querySelectorAll('[data-scene]').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    document.querySelectorAll('.scene').forEach(s => s.classList.remove('active'));
    const target = document.querySelector(`.scene[data-scene="${scene}"]`);
    if (target) target.classList.add('active');
    const label = btn.textContent.trim();
    const labelEl = document.getElementById('current-label');
    if (labelEl) labelEl.textContent = label;
    document.querySelectorAll('[data-view]').forEach(b => b.classList.remove('active'));
    const deskBtn = document.querySelector('[data-view="desktop"]');
    if (deskBtn) deskBtn.classList.add('active');
    document.querySelectorAll('.viewport-desktop, .viewport-mobile').forEach(v => v.classList.remove('show'));
    const activeScene = document.querySelector('.scene.active');
    if (activeScene) {
      const firstDesktop = activeScene.querySelector('.viewport-desktop');
      if (firstDesktop) firstDesktop.classList.add('show');
    }
  });
});
