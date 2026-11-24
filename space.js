function startStarfield() {
  const canvas = $('starfield');
  const context = canvas?.getContext('2d');
  if (!context) return;

  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const stars = Array.from({length:155}, () => ({
    x:Math.random(), y:Math.random(), depth:Math.random(), phase:Math.random()*Math.PI*2
  }));
  let width = 0, height = 0, scroll = window.scrollY, frame = 0, last = 0;
  let start = performance.now();

  function draw(time) {
    const elapsed = (time - start) / 1000;
    const still = reduced.matches;
    scroll = still ? 0 : scroll + (window.scrollY - scroll) * 0.16;
    context.clearRect(0, 0, width, height);
    const count = width < 700 ? 85 : stars.length;
    for (let index = 0; index < count; index++) {
      const star = stars[index];
      const offset = still ? 0 : elapsed * (2 + star.depth * 3) + scroll * (0.06 + star.depth * 0.14);
      const y = ((star.y * height - offset) % height + height) % height;
      const twinkle = still ? 0 : 0.13 * Math.sin(elapsed * (1 + star.depth) + star.phase);
      context.fillStyle = `rgba(245,250,255,${0.20 + star.depth * 0.40 + twinkle})`;
      context.beginPath();
      context.arc(star.x * width, y, 0.5 + star.depth * 0.85, 0, Math.PI*2);
      context.fill();
    }
    const flight = (elapsed + 6) % 11;
    if (still || flight > 0.95) return;
    const progress = flight / 0.95;
    const x = width * (0.18 + progress * 0.82);
    const y = height * (0.12 + progress * 0.36);
    const glow = Math.sin(progress * Math.PI);
    const trail = context.createLinearGradient(x - 100, y - 43, x, y);
    trail.addColorStop(0, 'transparent');
    trail.addColorStop(1, `rgba(241,250,255,${glow})`);
    context.beginPath();
    context.moveTo(x - 100, y - 43);
    context.lineTo(x, y);
    context.strokeStyle = trail;
    context.lineWidth = 1.5;
    context.stroke();
  }

  function resize() {
    width = canvas.clientWidth;
    height = canvas.clientHeight;
    const ratio = Math.min(devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    draw(performance.now());
  }

  function animate(time) {
    if (time - last >= 32) {
      draw(time);
      last = time;
    }
    frame = requestAnimationFrame(animate);
  }

  function updateMotion() {
    cancelAnimationFrame(frame);
    if (document.hidden || reduced.matches) {
      draw(performance.now());
      return;
    }
    start = performance.now();
    frame = requestAnimationFrame(animate);
  }

  window.addEventListener('resize', resize);
  reduced.addEventListener('change', updateMotion);
  document.addEventListener('visibilitychange', updateMotion);
  resize();
  updateMotion();
}
