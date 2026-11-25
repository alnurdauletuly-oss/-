const planetVertexSource = `
  attribute vec2 a_position;
  varying vec2 v_position;
  void main() {
    v_position = a_position;
    gl_Position = vec4(a_position, 0.0, 1.0);
  }
`;

const planetFragmentSource = `
  precision mediump float;
  varying vec2 v_position;
  uniform vec3 u_angles;
  uniform vec3 u_tint;
  uniform float u_rings;
  const vec3 light = vec3(-0.961, 0.138, -0.239);

  void main() {
    vec2 p = v_position * vec2(2.67, 1.27);
    float distance = length(p);
    bool globe = distance < 1.0;
    float front = sqrt(max(0.0, 1.0 - dot(p, p)));
    vec3 ringNormal = normalize(vec3(-0.29 + u_angles.z * 0.17, 0.96, 0.31 + u_angles.y * 0.30));
    float ringZ = -dot(p, ringNormal.xy) / ringNormal.z;
    vec3 ringPoint = vec3(p, ringZ);
    float ringRadius = length(ringPoint);
    float ringAlpha = smoothstep(1.20, 1.28, ringRadius) * (1.0 - smoothstep(2.42, 2.50, ringRadius));
    float bands = 0.58 + 0.14 * sin(ringRadius * 48.0) + 0.10 * sin(ringRadius * 123.0)
      + 0.07 * sin(ringRadius * 251.0);
    bands *= 1.0 - 0.91 * (smoothstep(1.97, 2.00, ringRadius) - smoothstep(2.05, 2.08, ringRadius));
    bands *= 1.0 - 0.70 * (smoothstep(2.30, 2.32, ringRadius) - smoothstep(2.35, 2.37, ringRadius));
    float shadowDistance = length(cross(ringPoint, light));
    float litRing = dot(ringPoint, light) < 0.0 ? mix(0.20, 1.0, smoothstep(0.90, 1.10, shadowDistance)) : 1.0;
    vec3 ringColor = vec3(0.55, 0.52, 0.48) * bands * litRing;
    ringAlpha *= 0.80 * bands * u_rings;
    vec4 color = vec4(ringColor, ringAlpha);

    if (globe) {
      vec3 normal = vec3(p, front);
      float cosine = dot(normal, light);
      float sun = pow(max(cosine, 0.0), 0.72);
      float latitude = dot(normal, ringNormal);
      float longitude = atan(normal.x, normal.z) + u_angles.x;
      float cloud = sin(latitude * 41.0 + 0.55 * sin(longitude * 3.0 + latitude * 12.0))
        + 0.38 * sin(latitude * 107.0 + longitude * 2.0) + 0.16 * sin(latitude * 211.0 - longitude * 3.0);
      vec3 warm = mix(vec3(0.52, 0.30, 0.22), vec3(0.94, 0.72, 0.56), 0.53 + 0.23 * cloud);
      float rim = pow(1.0 - front, 5.0) * smoothstep(-0.13, 0.62, cosine);
      vec3 body = vec3(0.015, 0.013, 0.017) + warm * u_tint * sun * 0.96 + vec3(0.28, 0.38, 0.70) * rim;
      color = vec4(body, 1.0);
      if (ringZ > front) color.rgb = mix(body, ringColor, ringAlpha);
    } else if (distance < 1.09) {
      float glow = (1.0 - smoothstep(0.0, 0.09, distance - 1.0))
        * smoothstep(0.10, 0.86, dot(normalize(p), normalize(light.xy)));
      vec3 blue = vec3(0.32, 0.48, 0.86);
      float atmosphere = glow * 0.44 * (1.0 - ringAlpha);
      float opacity = ringAlpha + atmosphere;
      color = vec4((ringColor * ringAlpha + blue * atmosphere) / max(opacity, 0.001), opacity);
    }

    gl_FragColor = color;
  }
`;

function planetRenderer(canvas) {
  const gl = canvas.getContext('webgl', {alpha:true, premultipliedAlpha:false});
  if (!gl) return null;
  const compile = (type, source) => {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    return gl.getShaderParameter(shader, gl.COMPILE_STATUS) ? shader : null;
  };
  const vertex = compile(gl.VERTEX_SHADER, planetVertexSource);
  const fragment = compile(gl.FRAGMENT_SHADER, planetFragmentSource);
  if (!vertex || !fragment) return null;
  const program = gl.createProgram();
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return null;
  gl.useProgram(program);
  const vertices = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, vertices);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, 1,1]), gl.STATIC_DRAW);
  const position = gl.getAttribLocation(program, 'a_position');
  gl.enableVertexAttribArray(position);
  gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
  const angles = gl.getUniformLocation(program, 'u_angles');
  const tint = gl.getUniformLocation(program, 'u_tint');
  const rings = gl.getUniformLocation(program, 'u_rings');
  return (longitude, pitch, roll, type = 0) => {
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.uniform3f(angles, longitude, pitch, roll);
    const colors = [[1,1,1], [0.42,1.22,1.8], [1.3,0.7,0.48], [0.72,0.85,1.5]];
    gl.uniform3fv(tint, colors[type]);
    gl.uniform1f(rings, type === 0 ? 1 : type === 3 ? 0.65 : 0);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  };
}

function planetFallback(canvas) {
  const context = canvas.getContext('2d');
  if (!context) return null;
  return (longitude, pitch, roll, type = 0) => {
    const {width, height} = canvas;
    context.setTransform(width / 5.34, 0, 0, height / 2.54, width / 2, height / 2);
    context.clearRect(-2.67, -1.27, 5.34, 2.54);
    const ring = front => {
      context.save();
      context.rotate(-0.30 + roll * 0.17);
      const edge = 0.36 + pitch * 0.23;
      for (let index = 0; index < 25; index++) {
        if ([15,16,21].includes(index)) continue;
        const size = 1.23 + index * 0.049;
        context.beginPath();
        context.ellipse(0, 0, size, size * edge, 0, front ? 0 : Math.PI, front ? Math.PI : 2 * Math.PI);
        context.strokeStyle = `rgba(162,151,140,${0.14 + 0.12 * Math.sin(index * 1.7) ** 2})`;
        context.lineWidth = 0.054;
        context.stroke();
      }
      context.restore();
    };
    if (type === 0 || type === 3) ring(false);
    const surface = context.createRadialGradient(-1.08, -0.18, 0.10, -0.92, -0.12, 1.5);
    surface.addColorStop(0, '#d4b0a7');
    surface.addColorStop(0.16, ['#a16449','#387c9f','#b45737','#777ba8'][type]);
    surface.addColorStop(0.51, '#130d11');
    surface.addColorStop(0.78, '#040306');
    context.beginPath();
    context.arc(0, 0, 1, 0, 2 * Math.PI);
    context.fillStyle = surface;
    context.fill();
    context.save();
    context.clip();
    context.strokeStyle = 'rgba(240,178,150,.14)';
    context.lineWidth = 0.012;
    for (let index = 0; index < 14; index++) {
      const y = -0.9 + index * 0.13;
      context.beginPath();
      context.moveTo(-0.98, y + 0.05 * Math.sin(longitude + index));
      context.bezierCurveTo(-0.8, y - 0.09, -0.57, y, -0.44, y + 0.05);
      context.stroke();
    }
    context.restore();
    if (type === 0 || type === 3) ring(true);
  };
}

// Four reusable worlds share the starfield clock and scroll impulse. Only visible
// worlds render; entering another section suspends the entire layer.
function createPlanet() {
  const layer = document.createElement('div');
  layer.className = 'planet-field';
  layer.hidden = true;
  document.body.append(layer);
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const names = ['Сатурн', 'Ледяная планета', 'Медная планета', 'Сиреневая планета'];
  let anchor = null, elapsed = 0, nextArrival = 0.2, cursor = 0;
  let protectedAreas = [], boundsAt = -1;
  const worlds = names.map((name, type) => {
    const view = document.createElement('div');
    view.className = 'planet-view';
    view.hidden = true;
    let canvas = document.createElement('canvas');
    let draw = planetRenderer(canvas);
    if (!draw) { canvas = document.createElement('canvas'); draw = planetFallback(canvas); }
    if (!draw) return null;
    canvas.setAttribute('aria-hidden', 'true');
    const control = document.createElement('button');
    control.className = 'planet-control';
    control.type = 'button';
    control.setAttribute('aria-label', `Переместить — ${name}`);
    control.title = 'Перетащите планету в любую сторону. Стрелки — перемещение.';
    view.append(canvas);
    document.body.append(control);
    control.hidden = true;
    layer.append(view);
    const world = {view, canvas, control, draw, type, active:false, age:0, x:0, y:0,
      depth:0, rotation:type * 1.7, pitch:0, spin:0, bank:0, gesture:null, dragged:false, vx:0, vy:0, releaseTime:0};
    control.addEventListener('pointerdown', event => {
      if (!event.isPrimary || event.button !== 0) return;
      world.gesture = {id:event.pointerId, x:event.clientX, y:event.clientY,
        originX:world.x, originY:world.y, rotation:world.rotation, pitch:world.pitch,
        lastX:event.clientX, lastY:event.clientY, time:event.timeStamp, started:false};
      world.dragged = false;
      world.vx = world.vy = 0;
      world.releaseTime = 0;
      control.setPointerCapture(event.pointerId);
    });
    control.addEventListener('pointermove', event => {
      const g = world.gesture;
      if (!g || g.id !== event.pointerId) return;
      const dx = event.clientX - g.x, dy = event.clientY - g.y;
      if (!g.started) {
        if (Math.hypot(dx, dy) < 4) return;
        g.started = true;
        document.body.append(world.view);
        world.view.classList.add('is-held');
      }
      const seconds = Math.max(0.008, (event.timeStamp - g.time) / 1000);
      world.vx = Math.max(-650 / innerWidth, Math.min(650 / innerWidth, (event.clientX - g.lastX) / innerWidth / seconds));
      world.vy = Math.max(-650 / innerHeight, Math.min(650 / innerHeight, (event.clientY - g.lastY) / innerHeight / seconds));
      g.lastX = event.clientX; g.lastY = event.clientY; g.time = event.timeStamp;
      moveWorld(world, g.originX + dx / innerWidth, g.originY + dy / innerHeight);
      world.rotation = g.rotation + dx * 0.012;
      world.pitch = Math.max(-0.65, Math.min(0.65, g.pitch + dy * 0.006));
      paint(world);
    });
    control.addEventListener('pointerup', event => {
      const g = world.gesture;
      if (!g || g.id !== event.pointerId) return;
      world.dragged = g.started;
      if (event.timeStamp - g.time > 100) world.vx = world.vy = 0;
      world.gesture = null;
      if (g.started && !reduced.matches) world.releaseTime = 0.85;
      else settle(world);
    });
    for (const name of ['pointercancel', 'lostpointercapture']) control.addEventListener(name, () => {
      if (world.gesture) { world.gesture = null; world.dragged = true; settle(world); }
    });
    control.addEventListener('keydown', event => {
      const direction = {ArrowLeft:[-1,0], ArrowRight:[1,0], ArrowUp:[0,-1], ArrowDown:[0,1]}[event.key];
      if (!direction) return;
      event.preventDefault();
      const step = event.shiftKey ? 40 : 16;
      moveWorld(world, world.x + direction[0] * step / innerWidth, world.y + direction[1] * step / innerHeight);
      paint(world);
    });
    control.addEventListener('click', event => {
      if (!world.dragged || !event.detail) {
        if (reduced.matches) { world.rotation += 0.6; paint(world); }
        else world.spin += 1.8;
      }
      world.dragged = false;
    });
    return world;
  }).filter(Boolean);

  function moveWorld(world, x, y) {
    world.x = Math.max(24 / innerWidth, Math.min(1 - 24 / innerWidth, x));
    world.y = Math.max(24 / innerHeight, Math.min(1 - 24 / innerHeight, y));
    world.routeX = (world.x - 0.5) * world.depth;
    world.routeY = (world.y - 0.44) * world.depth - world.driftY;
  }

  function settle(world) {
    world.vx = world.vy = world.releaseTime = 0;
    world.view.classList.remove('is-held');
    layer.append(world.view);
  }

  function spawn(world) {
    settle(world);
    world.active = true;
    world.age = 0;
    world.depth = 7;
    const left = world.type % 2 === 1;
    world.routeX = (left ? -1 : 1) * [0.82, 1.04, 1.12, 0.92][world.type];
    world.routeY = [-0.72, -0.48, -0.35, -0.90][world.type];
    world.driftY = 0;
    world.x = 0.5 + world.routeX / world.depth;
    world.y = 0.44 + world.routeY / world.depth;
    if (reduced.matches) { world.x = 0.81; world.y = 0.22; }
    world.view.hidden = false;
    world.control.hidden = false;
  }

  function paint(world) {
    const mobile = innerWidth < 700;
    const base = Math.min(innerWidth * (mobile ? 0.58 : 0.31), 490);
    const scale = reduced.matches ? 0.75 : 1.7 / world.depth;
    const width = Math.round(base);
    world.view.style.width = `${width}px`;
    world.view.style.transform = `translate3d(${world.x * innerWidth - width / 2}px, ${world.y * innerHeight - width / 2 / 2.102}px, 0) scale(${scale})`;
    const fadeIn = Math.min(1, world.age / 0.8);
    const fadeOut = Math.min(1, Math.max(0, (world.depth - 0.55) / 0.5));
    world.control.style.width = `${Math.max(44, width * scale * 0.37)}px`;
    world.control.style.left = `${world.x * innerWidth}px`;
    world.control.style.top = `${world.y * innerHeight}px`;
    world.control.style.opacity = `${fadeIn * fadeOut}`;
    // The decorative flight never intercepts a card, field or navigation control.
    const radius = Math.max(44, width * scale * 0.37) / 2;
    const cx = world.x * innerWidth, cy = world.y * innerHeight;
    if (elapsed - boundsAt > 0.2 || boundsAt < 0) {
      const protectedElements = document.querySelectorAll('.today-card, .module-card, .site-nav, .mobile-nav, .today-hero h1, .today-lead, .today-date, a, button:not(.planet-control), input, textarea, select');
      protectedAreas = [...protectedElements].map(element => element.getBoundingClientRect());
      boundsAt = elapsed;
    }
    const blocked = protectedAreas.some(r => {
      return r.width && r.height && cx + radius > r.left && cx - radius < r.right &&
        cy + radius > r.top && cy - radius < r.bottom;
    });
    const safe = world.gesture || (!blocked && cx > 0 && cx < innerWidth && cy > 0 && cy < innerHeight);
    world.control.style.pointerEvents = safe ? 'auto' : 'none';
    world.control.tabIndex = safe ? 0 : -1;
    world.view.style.opacity = reduced.matches ? '0.85' : `${fadeIn * fadeOut * 0.92}`;
    const ratio = Math.min(devicePixelRatio || 1, mobile ? 1.4 : 1.65);
    // Fixed backing size avoids reallocating GPU memory during the flight.
    const w = Math.round(width * ratio), h = Math.round(w / 2.102);
    if (world.canvas.width !== w || world.canvas.height !== h) { world.canvas.width = w; world.canvas.height = h; }
    world.draw(world.rotation, world.pitch + Math.sin(world.rotation * 0.23) * 0.12, world.bank, world.type);
  }

  function tick(event) {
    if (!anchor || document.hidden || reduced.matches) return;
    const {dt, boost, bank} = event.detail;
    elapsed += dt;
    if (elapsed >= nextArrival && worlds.length) {
      const next = Array.from({length:worlds.length}, (_, i) => (cursor + i) % worlds.length)
        .find(index => !worlds[index].active);
      if (next !== undefined) {
        spawn(worlds[next]);
        cursor = (next + 1) % worlds.length;
        nextArrival = elapsed + 5 + Math.random() * 3;
      } else nextArrival = elapsed + 0.5;
    }
    for (const world of worlds) {
      if (!world.active) continue;
      if (!world.gesture && world.releaseTime > 0) {
        moveWorld(world, world.x + world.vx * dt, world.y + world.vy * dt);
        world.vx *= Math.exp(-dt * 7); world.vy *= Math.exp(-dt * 7);
        world.releaseTime -= dt;
        if (world.releaseTime <= 0) settle(world);
      } else if (!world.gesture && !world.control.matches(':focus-visible')) {
        world.age += dt;
        // Perspective projection: distance drives both size and the outward
        // path. The shared starfield boost moves the camera forward faster.
        world.depth = Math.max(0.55, world.depth - dt * (0.31 + boost * 3.2));
        world.driftY -= bank * dt * 0.16;
        world.x = 0.5 + world.routeX / world.depth;
        world.y = 0.44 + (world.routeY + world.driftY) / world.depth;
      }
      world.bank += (bank * 0.35 - world.bank) * (1 - Math.exp(-dt * 5));
      if (!world.gesture) world.rotation += dt * (0.22 + world.spin);
      world.spin *= Math.exp(-dt * 2.8);
      if (world.depth <= 0.56 || world.x < -0.4 || world.x > 1.4 || world.y < -0.5 || world.y > 1.5) {
        world.active = false;
        world.view.hidden = true;
        world.control.hidden = true;
        world.gesture = null;
      } else paint(world);
    }
  }
  window.addEventListener('jospat-space-frame', tick);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) worlds.forEach(world => { world.gesture = null; settle(world); });
  });
  window.addEventListener('scroll', () => { boundsAt = -1; }, {passive:true});
  window.addEventListener('resize', () => { boundsAt = -1; if (anchor) worlds.filter(w => w.active).forEach(paint); });
  reduced.addEventListener('change', () => {
    worlds.forEach(world => { world.gesture = null; settle(world); world.active = false; world.view.hidden = true; world.control.hidden = true; });
    elapsed = 0; nextArrival = 0.2;
    if (anchor && reduced.matches && worlds[0]) { spawn(worlds[0]); paint(worlds[0]); }
  });
  return nextAnchor => {
    anchor = nextAnchor;
    boundsAt = -1;
    layer.hidden = !anchor;
    worlds.forEach(world => {
      if (!anchor) { world.gesture = null; settle(world); }
      world.control.hidden = !anchor || !world.active;
    });
    if (anchor && reduced.matches && worlds[0]) { spawn(worlds[0]); paint(worlds[0]); }
  };
}
