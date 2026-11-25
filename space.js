function startStarfield() {
  const canvas = $('starfield');
  const context = canvas?.getContext('2d');
  if (!context) return false;

  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const stars = Array.from({length:155}, () => ({
    x: Math.random(), y: Math.random(), depth: Math.random(), phase: Math.random() * Math.PI * 2
  }));
  const routes = [
    [-0.06, 0.12, 1.06, 0.55], [1.06, 0.17, -0.06, 0.61],
    [0.12, -0.08, 0.85, 1.08], [1.06, 0.78, -0.06, 0.21],
    [-0.06, 0.65, 1.06, 0.47], [0.78, -0.08, 0.24, 1.08]
  ];
  let width = 0, height = 0, frame = 0, lastFrame = 0, elapsed = 0;
  let warp = 0;
  let lastScroll = window.scrollY, boost = 0, bank = 0;
  let comet = null, previousRoute = -1, nextComet = 3;

  function drawStar(star, dt, still, speed) {
    const x = star.x * width, y = star.y * height;
    const dx = x - width * 0.5, dy = y - height * 0.44;
    const expansion = speed * (0.30 + star.depth * 1.18);
    const vx = dx * expansion;
    const drift = (2 + star.depth * 3) * 1.20;
    const vy = dy * expansion - drift - bank * (16 + star.depth * 46);
    const radius = 0.5 + star.depth * 0.85;
    const twinkle = still ? 0 : 0.12 * Math.sin(elapsed * (1 + star.depth) + star.phase);
    const opacity = 0.20 + star.depth * 0.40 + twinkle;
    const travel = Math.hypot(vx, vy);

    if (speed > 0.025 && travel > 20) {
      const trailTime = Math.min(0.17, (22 + speed * 70) / travel) * Math.sqrt(speed);
      const tailX = x - vx * trailTime, tailY = y - vy * trailTime;
      const trail = context.createLinearGradient(tailX, tailY, x, y);
      trail.addColorStop(0, 'rgba(157,194,248,0)');
      trail.addColorStop(1, `rgba(229,241,255,${Math.min(0.78, opacity + speed * 0.18)})`);
      context.beginPath();
      context.moveTo(tailX, tailY);
      context.lineTo(x, y);
      context.strokeStyle = trail;
      context.lineWidth = radius * (1 + speed * 0.32);
      context.stroke();
    }
    context.fillStyle = `rgba(245,250,255,${Math.min(0.9, opacity + speed * 0.12)})`;
    context.beginPath();
    context.arc(x, y, radius, 0, Math.PI * 2);
    context.fill();

    if (still || !dt) return;
    star.x += vx * dt / width;
    star.y += vy * dt / height;
    if (star.x < -0.03 || star.x > 1.03 || star.y < -0.03 || star.y > 1.03) {
      if (speed > 0.08) {
        star.x = 0.14 + Math.random() * 0.72;
        star.y = 0.12 + Math.random() * 0.64;
      } else {
        star.x = (star.x + 1) % 1;
        star.y = (star.y + 1) % 1;
      }
    }
  }

  function drawComet() {
    if (!comet && elapsed >= nextComet) {
      const route = (previousRoute + 1 + Math.floor(Math.random() * (routes.length - 1))) % routes.length;
      const [fromX, fromY, toX, toY] = routes[route];
      const spread = () => (Math.random() - 0.5) * 0.18;
      comet = {
        fromX, fromY: fromY + spread(), toX, toY: toY + spread(),
        duration: 0.85 + Math.random() * 0.58, start: elapsed,
        hue: Math.random() < 0.65 ? '178,213,255' : '255,220,177'
      };
      previousRoute = route;
    }
    if (!comet) return;
    const p = (elapsed - comet.start) / comet.duration;
    if (p >= 1) {
      comet = null;
      nextComet = elapsed + 5 + Math.random() * 6;
      return;
    }
    const dx = (comet.toX - comet.fromX) * width;
    const dy = (comet.toY - comet.fromY) * height;
    const x = comet.fromX * width + dx * p;
    const y = comet.fromY * height + dy * p;
    const tail = Math.min(140, Math.max(45, width * 0.14)) / Math.hypot(dx, dy);
    const tailX = x - dx * tail, tailY = y - dy * tail;
    const opacity = Math.sin(p * Math.PI) ** 0.65;
    const gradient = context.createLinearGradient(tailX, tailY, x, y);
    gradient.addColorStop(0, `rgba(${comet.hue},0)`);
    gradient.addColorStop(0.68, `rgba(${comet.hue},${opacity * 0.29})`);
    gradient.addColorStop(1, `rgba(250,252,255,${opacity})`);
    context.beginPath();
    context.moveTo(tailX, tailY);
    context.lineTo(x, y);
    context.strokeStyle = gradient;
    context.lineWidth = 1.7;
    context.stroke();
    context.beginPath();
    context.arc(x, y, 1.45, 0, Math.PI * 2);
    context.fillStyle = `rgba(250,252,255,${opacity})`;
    context.fill();
  }

  function draw(dt = 0) {
    if (!width || !height) return;
    const still = reduced.matches;
    context.clearRect(0, 0, width, height);
    const speed = still ? 0 : Math.max(boost, warp);
    const count = width < 700 ? 85 : stars.length;
    for (let index = 0; index < count; index++) drawStar(stars[index], dt, still, speed);
    if (!reduced.matches) drawComet();
  }

  function resize() {
    width = canvas.clientWidth;
    height = canvas.clientHeight;
    const ratio = Math.min(devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    draw();
  }

  function animate(time) {
    const dt = lastFrame ? Math.min((time - lastFrame) / 1000, 0.05) : 0;
    lastFrame = time;
    warp = homeEntranceFrame(time);
    if (dt > 0) {
      const speed = (window.scrollY - lastScroll) / dt;
      const target = Math.min(Math.abs(speed) / 1100, 1);
      const rate = target > boost ? 15 : 4.8;
      boost += (target - boost) * (1 - Math.exp(-rate * dt));
      bank += (Math.sign(speed) * target - bank) * (1 - Math.exp(-9 * dt));
      elapsed += dt;
    }
    lastScroll = window.scrollY;
    draw(dt);
    window.dispatchEvent(new CustomEvent('jospat-space-frame', {detail:{dt, boost, bank, warp}}));
    frame = requestAnimationFrame(animate);
  }

  function updateMotion() {
    cancelAnimationFrame(frame);
    boost = 0;
    warp = 0;
    bank = 0;
    lastFrame = 0;
    lastScroll = window.scrollY;
    if (document.hidden || reduced.matches) draw();
    else frame = requestAnimationFrame(animate);
  }

  window.addEventListener('resize', resize);
  reduced.addEventListener('change', updateMotion);
  document.addEventListener('visibilitychange', updateMotion);
  resize();
  updateMotion();
  return true;
}
