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
    ringAlpha *= 0.80 * bands;
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
      vec3 body = vec3(0.015, 0.013, 0.017) + warm * sun * 0.83 + vec3(0.28, 0.38, 0.70) * rim;
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
  return (longitude, pitch, roll) => {
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.uniform3f(angles, longitude, pitch, roll);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  };
}

function planetFallback(canvas) {
  const context = canvas.getContext('2d');
  if (!context) return null;
  return (longitude, pitch, roll) => {
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
    ring(false);
    const surface = context.createRadialGradient(-1.08, -0.18, 0.10, -0.92, -0.12, 1.5);
    surface.addColorStop(0, '#d4b0a7');
    surface.addColorStop(0.16, '#a16449');
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
    ring(true);
  };
}

function createPlanet() {
  const view = document.createElement('div');
  const control = document.createElement('button');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  let canvas = document.createElement('canvas');
  let draw = planetRenderer(canvas);
  if (!draw) {
    canvas = document.createElement('canvas');
    draw = planetFallback(canvas);
  }
  if (!draw) return null;
  view.className = 'planet-view';
  canvas.setAttribute('aria-hidden', 'true');
  control.type = 'button';
  control.className = 'planet-control';
  control.setAttribute('aria-label', 'Повернуть планету');
  control.title = 'Повернуть планету';
  view.append(canvas, control);
  let anchor = null;
  let visible = false;
  let frame = 0;
  let previous = 0;
  let rotation = 0;
  let pitch = 0;
  let bank = 0;
  let lastScroll = window.scrollY;
  let gesture = null;

  function update(time) {
    frame = 0;
    if (!anchor || !visible || document.hidden) return;
    if (previous && time - previous < 30 && !reduced.matches) {
      schedule();
      return;
    }
    const dt = previous ? Math.min((time - previous) / 1000, 0.066) : 0;
    const scroll = Math.max(0, window.scrollY);
    const speed = dt ? (scroll - lastScroll) / dt : 0;
    if (!reduced.matches) {
      const target = Math.max(-1, Math.min(1, speed / 780));
      bank += (target - bank) * (1 - Math.exp(-dt * 6));
      if (!gesture) rotation = (rotation + dt * 0.16) % (2 * Math.PI);
    }
    lastScroll = scroll;
    previous = time;
    const shift = reduced.matches ? 0 : Math.min(scroll, 290);
    view.style.transform = `translate(${shift * 0.09 + bank * 13}px,${shift * 0.29}px) scale(${1 + shift * 0.00072})`;
    const ratio = Math.min(devicePixelRatio || 1, 1.45);
    const width = Math.max(1, Math.round(canvas.clientWidth * ratio));
    const height = Math.max(1, Math.round(canvas.clientHeight * ratio));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    draw(rotation, pitch, bank);
    if (!reduced.matches) schedule();
  }

  function schedule() {
    if (!frame && anchor && visible && !document.hidden) frame = requestAnimationFrame(update);
  }

  function resetMotion() {
    previous = 0;
    bank = 0;
    lastScroll = window.scrollY;
    schedule();
  }

  const observer = new IntersectionObserver(entries => {
    visible = entries.some(entry => entry.target === anchor && entry.isIntersecting);
    resetMotion();
  });
  window.addEventListener('resize', schedule);
  document.addEventListener('visibilitychange', resetMotion);
  reduced.addEventListener('change', resetMotion);

  control.addEventListener('pointerdown', event => {
    if (!event.isPrimary || event.button !== 0) return;
    gesture = {id:event.pointerId, x:event.clientX, y:event.clientY, rotation, pitch, started:false};
  });
  control.addEventListener('pointermove', event => {
    if (!gesture || gesture.id !== event.pointerId) return;
    const dx = event.clientX - gesture.x;
    const dy = event.clientY - gesture.y;
    if (!gesture.started) {
      if (Math.abs(dx) + Math.abs(dy) < 5 || (event.pointerType === 'touch' && Math.abs(dx) <= Math.abs(dy))) return;
      gesture.started = true;
      control.setPointerCapture(event.pointerId);
    }
    rotation = gesture.rotation + dx * 0.022;
    if (event.pointerType !== 'touch') pitch = Math.max(-0.75, Math.min(0.75, gesture.pitch + dy * 0.008));
    schedule();
  });
  let dragged = false;
  control.addEventListener('pointerup', event => {
    dragged = gesture?.id === event.pointerId && gesture.started;
    gesture = null;
  });
  control.addEventListener('pointercancel', () => { gesture = null; });
  control.addEventListener('pointerleave', () => { if (!gesture?.started) gesture = null; });
  control.addEventListener('click', event => {
    if (!dragged || !event.detail) {
      rotation += 0.6;
      pitch = Math.max(-0.65, Math.min(0.65, Math.sin(rotation) * 0.35));
      schedule();
    }
    dragged = false;
  });

  return nextAnchor => {
    if (nextAnchor === anchor) return;
    observer.disconnect();
    anchor = nextAnchor;
    visible = false;
    if (anchor) {
      anchor.append(view);
      observer.observe(anchor);
    }
  };
}
