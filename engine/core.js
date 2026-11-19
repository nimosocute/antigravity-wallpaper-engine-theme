(() => {
  const THEMES = /*__THEMES_PLACEHOLDER__*/{};
  const THEME_KEYS = Object.keys(THEMES);
  const DEFAULT_THEME_KEY = THEME_KEYS[0] || 'Default';

  const STORAGE_THEME = 'agy_theme_v3';
  const STORAGE_BUBBLE = 'agy_bubble_v3';
  const STORAGE_INPUT = 'agy_input_v3';
  const STORAGE_DIMMING = 'agy_dimming_v3';
  const STORAGE_WP_ENABLED = 'agy_wp_enabled_v3';
  const STORAGE_CUSTOM_WP = 'agy_custom_wp_v3';
  const STORAGE_USER_AVATAR = 'agy_user_avatar_v3';
  const STORAGE_AGENT_AVATAR = 'agy_agent_avatar_v3';
  const STORAGE_GLASS_BLUR = 'agy_glass_blur_v3';
  const STORAGE_AVATAR_SIZE = 'agy_avatar_size_v3';
  const STORAGE_AVATAR_RADIUS = 'agy_avatar_radius_v3';
  const STORAGE_LIVE_WP = 'agy_live_wp_v3';
  const STORAGE_LIVE_PAUSE_BLUR = 'agy_live_pause_blur_v3';
  const STORAGE_LIVE_AUDIO = 'agy_live_audio_v3';

  const CHECK_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`;

  const INPUT_STYLES = {
    'sync': {
      label: 'Synced Ornament Frame',
      desc: 'Follows the active theme borders & decorative SVG ornament'
    },
    'double_gold': {
      label: 'Amber Gold Double Border',
      desc: 'Warm metallic double border with corner filigree'
    },
    'glass': {
      label: 'Translucent Crystal Glass',
      desc: 'Lets more of your background artwork shine through'
    },
    'minimal': {
      label: 'Minimal Clean',
      desc: 'Sleek subtle border without top decorative stickers'
    }
  };

  function getState() {
    const init = window.__AGY_INITIAL_CONFIG__ || {};
    const rawTheme = localStorage.getItem(STORAGE_THEME) || init.themeName || DEFAULT_THEME_KEY;
    const themeName = THEMES[rawTheme] ? rawTheme : DEFAULT_THEME_KEY;
    const rawBubble = localStorage.getItem(STORAGE_BUBBLE) || init.bubbleName || themeName;
    const bubbleName = THEMES[rawBubble] ? rawBubble : themeName;
    const inputStyle = localStorage.getItem(STORAGE_INPUT) || init.inputStyle || 'sync';
    const dimming = parseInt(localStorage.getItem(STORAGE_DIMMING) || (init.dimming !== undefined ? init.dimming : '69'), 10);
    const wpEnabled = localStorage.getItem(STORAGE_WP_ENABLED) !== null
      ? localStorage.getItem(STORAGE_WP_ENABLED) !== 'false'
      : (init.wpEnabled !== undefined ? init.wpEnabled : true);
    const customWp = localStorage.getItem(STORAGE_CUSTOM_WP) || init.customWp || '';
    const userAvatar = localStorage.getItem(STORAGE_USER_AVATAR) ?? init.userAvatar ?? '';
    const agentAvatar = localStorage.getItem(STORAGE_AGENT_AVATAR) ?? init.agentAvatar ?? '';
    const rawBlur = localStorage.getItem(STORAGE_GLASS_BLUR) ?? init.glassBlur;
    const glassBlur = rawBlur !== undefined && rawBlur !== null && rawBlur !== '' ? parseInt(rawBlur, 10) : 3;
    const rawAvSize = localStorage.getItem(STORAGE_AVATAR_SIZE) ?? init.avatarSize;
    const avatarSize = rawAvSize !== undefined && rawAvSize !== null && rawAvSize !== '' ? parseInt(rawAvSize, 10) : 32;
    const rawAvRad = localStorage.getItem(STORAGE_AVATAR_RADIUS) ?? init.avatarRadius;
    const avatarRadius = rawAvRad !== undefined && rawAvRad !== null && rawAvRad !== '' ? parseInt(rawAvRad, 10) : 50;
    let liveWp = null;
    try {
      const rawLive = localStorage.getItem(STORAGE_LIVE_WP);
      if (rawLive !== null) {
        liveWp = rawLive ? JSON.parse(rawLive) : null;
      } else if (init.liveWp && typeof init.liveWp === 'object') {
        liveWp = init.liveWp;
      }
    } catch (e) {
      liveWp = null;
    }
    const livePauseBlur = localStorage.getItem(STORAGE_LIVE_PAUSE_BLUR) !== null
      ? localStorage.getItem(STORAGE_LIVE_PAUSE_BLUR) === 'true'
      : Boolean(init.livePauseBlur);
    const liveAudio = localStorage.getItem(STORAGE_LIVE_AUDIO) !== null
      ? localStorage.getItem(STORAGE_LIVE_AUDIO) === 'true'
      : Boolean(init.liveAudio);
    return { themeName, bubbleName, inputStyle, dimming, wpEnabled, customWp, userAvatar, agentAvatar, glassBlur, avatarSize, avatarRadius, liveWp, livePauseBlur, liveAudio };
  }

  function buildMediaUrl(id, relFile) {
    const base = window.__AGY_MEDIA_BASE__ || '';
    if (!base || !id || !relFile) return '';
    const encoded = String(relFile).split('/').map(seg => encodeURIComponent(seg)).join('/');
    return `${base}/we/${encodeURIComponent(id)}/${encoded}`;
  }

  function stopVideoElement(vid) {
    if (!vid) return;
    try {
      if (vid.srcObject && typeof vid.srcObject.getTracks === 'function') {
        vid.srcObject.getTracks().forEach(t => { try { t.stop(); } catch (e) {} });
      }
      vid.srcObject = null;
      vid.pause();
      vid.removeAttribute('src');
      vid.load();
    } catch (e) {}
  }

  function stopStandaloneSceneEngine() {
    if (window.__AGY_SCENE_ENGINE__) {
      try {
        window.__AGY_SCENE_ENGINE__.destroy();
      } catch (e) {}
      window.__AGY_SCENE_ENGINE__ = null;
    }
  }

  function mountStandaloneSceneEngine(layer, live, mediaUrl) {
    stopStandaloneSceneEngine();

    const glCanvas = document.createElement('canvas');
    glCanvas.id = 'agy-live-wp-webgl';
    glCanvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none;display:block;background:#070910 url("' + mediaUrl + '") center/cover no-repeat;';
    layer.appendChild(glCanvas);

    const ptCanvas = document.createElement('canvas');
    ptCanvas.id = 'agy-live-wp-particles';
    ptCanvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none;display:block;';
    layer.appendChild(ptCanvas);

    let destroyed = false;
    let rafId = 0;
    let gl = null;
    let prog = null;
    let tex = null;
    let imgAspect = 16 / 9;
    let texReady = false;

    const cfg = {
      windStrength: 0.65,
      waterStrength: 0.25,
      shimmerStrength: 0.45,
      particles: ['dust', 'star']
    };

    let targetMX = 0, targetMY = 0, curMX = 0, curMY = 0;
    const onMouseMove = (e) => {
      const w = window.innerWidth || 1920;
      const h = window.innerHeight || 1080;
      targetMX = ((e.clientX / w) - 0.5) * 2.0;
      targetMY = ((e.clientY / h) - 0.5) * 2.0;
    };
    window.addEventListener('mousemove', onMouseMove, { passive: true });

    function resizeCanvases() {
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      const cw = Math.max(640, Math.round((layer.clientWidth || window.innerWidth || 1920) * dpr));
      const ch = Math.max(360, Math.round((layer.clientHeight || window.innerHeight || 1080) * dpr));
      if (glCanvas.width !== cw || glCanvas.height !== ch) {
        glCanvas.width = cw;
        glCanvas.height = ch;
        if (gl) gl.viewport(0, 0, cw, ch);
      }
      const pw = Math.max(640, layer.clientWidth || window.innerWidth || 1920);
      const ph = Math.max(360, layer.clientHeight || window.innerHeight || 1080);
      if (ptCanvas.width !== pw || ptCanvas.height !== ph) {
        ptCanvas.width = pw;
        ptCanvas.height = ph;
      }
    }
    resizeCanvases();
    window.addEventListener('resize', resizeCanvases, { passive: true });

    try {
      gl = glCanvas.getContext('webgl2', { alpha: false, antialias: false, depth: false, stencil: false, powerPreference: 'high-performance' })
        || glCanvas.getContext('webgl', { alpha: false, antialias: false, depth: false, stencil: false });
      if (gl) {
        const vsSrc = `
          attribute vec2 a_pos;
          varying vec2 v_uv;
          void main() {
            v_uv = vec2(a_pos.x * 0.5 + 0.5, 0.5 - a_pos.y * 0.5);
            gl_Position = vec4(a_pos, 0.0, 1.0);
          }
        `;
        const fsSrc = `
          precision highp float;
          varying vec2 v_uv;
          uniform sampler2D u_tex;
          uniform float u_time;
          uniform vec2 u_mouse;
          uniform float u_canvasAspect;
          uniform float u_imgAspect;
          uniform float u_wind;
          uniform float u_water;
          uniform float u_shimmer;

          void main() {
            // Object-fit: cover aspect ratio mapping
            vec2 uv = v_uv;
            if (u_canvasAspect > u_imgAspect) {
              float scale = u_imgAspect / u_canvasAspect;
              uv.y = (uv.y - 0.5) * scale + 0.5;
            } else {
              float scale = u_canvasAspect / u_imgAspect;
              uv.x = (uv.x - 0.5) * scale + 0.5;
            }

            // Smooth overscan (4.2%) for camera breathing & mouse depth parallax
            uv = (uv - 0.5) * 0.958 + 0.5;
            float radial = length(v_uv - 0.5);
            vec2 breathe = vec2(sin(u_time * 0.55) * 0.0045, cos(u_time * 0.42) * 0.0038);
            vec2 parallax = u_mouse * (0.0085 + radial * 0.006) + breathe;
            uv += parallax;

            // Organic multi-harmonic foliage / hair / cloth wind sway
            float w1 = sin(uv.y * 7.5 + u_time * 1.65 + uv.x * 3.2);
            float w2 = cos(uv.x * 9.0 - u_time * 1.25 + uv.y * 5.0);
            float w3 = sin((uv.x + uv.y) * 14.0 + u_time * 2.3);
            float edgeMask = smoothstep(0.02, 0.25, uv.x) * smoothstep(0.98, 0.75, uv.x);
            vec2 windDisp = vec2(w1 * 0.0028 + w3 * 0.0011, w2 * 0.0018) * u_wind * (0.55 + 0.45 * edgeMask);

            // Lower-field water / reflection ripple displacement
            float waterZone = smoothstep(0.45, 0.92, v_uv.y);
            float ripX = sin(uv.y * 38.0 - u_time * 3.1 + uv.x * 12.0) * 0.0032;
            float ripY = cos(uv.x * 28.0 + u_time * 2.6 + uv.y * 22.0) * 0.0018;
            vec2 waterDisp = vec2(ripX, ripY) * u_water * waterZone;

            vec2 finalUv = clamp(uv + windDisp + waterDisp, 0.001, 0.999);
            vec4 col = texture2D(u_tex, finalUv);

            // Dynamic specular highlight shimmer & living light pulse
            float luma = dot(col.rgb, vec3(0.299, 0.587, 0.114));
            float hi = smoothstep(0.62, 0.94, luma);
            float pulse = 0.5 + 0.5 * sin(u_time * 2.1 + uv.x * 8.0 - uv.y * 6.0);
            col.rgb += col.rgb * hi * pulse * 0.16 * u_shimmer;

            gl_FragColor = vec4(col.rgb, 1.0);
          }
        `;
        const compile = (type, src) => {
          const s = gl.createShader(type);
          gl.shaderSource(s, src);
          gl.compileShader(s);
          return gl.getShaderParameter(s, gl.COMPILE_STATUS) ? s : null;
        };
        const vs = compile(gl.VERTEX_SHADER, vsSrc);
        const fs = compile(gl.FRAGMENT_SHADER, fsSrc);
        if (vs && fs) {
          prog = gl.createProgram();
          gl.attachShader(prog, vs);
          gl.attachShader(prog, fs);
          gl.linkProgram(prog);
          gl.useProgram(prog);

          const buf = gl.createBuffer();
          gl.bindBuffer(gl.ARRAY_BUFFER, buf);
          gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);
          const loc = gl.getAttribLocation(prog, 'a_pos');
          gl.enableVertexAttribArray(loc);
          gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
        }
      }
    } catch (e) {}

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      if (destroyed || !gl || !prog) return;
      imgAspect = (img.naturalWidth || 1920) / Math.max(1, img.naturalHeight || 1080);
      tex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
      texReady = true;
    };
    img.src = mediaUrl;

    const pCtx = ptCanvas.getContext('2d');
    let particles = [];
    function rebuildParticles() {
      const types = cfg.particles.length ? cfg.particles : ['dust', 'star'];
      const w = ptCanvas.width || 1920;
      const h = ptCanvas.height || 1080;
      particles = [];
      types.forEach(kind => {
        if (kind === 'lightshaft') return;
        const count = kind === 'rain' ? 95 : kind === 'snow' ? 65 : kind === 'star' ? 55 : 42;
        for (let i = 0; i < count; i++) {
          particles.push({
            kind,
            x: Math.random() * w,
            y: Math.random() * h,
            r: kind === 'petal' ? (3 + Math.random() * 4.5) : kind === 'rain' ? (12 + Math.random() * 14) : (1.2 + Math.random() * 2.6),
            vx: kind === 'rain' ? -1.8 : kind === 'petal' ? (0.45 + Math.random() * 0.9) : ((Math.random() - 0.5) * 0.55),
            vy: kind === 'ember' ? (-0.55 - Math.random() * 1.1) : kind === 'rain' ? (11 + Math.random() * 7) : kind === 'snow' || kind === 'petal' ? (0.45 + Math.random() * 0.95) : ((Math.random() - 0.5) * 0.35),
            phase: Math.random() * Math.PI * 2,
            alpha: 0.25 + Math.random() * 0.65
          });
        }
      });
    }
    rebuildParticles();

    const base = window.__AGY_MEDIA_BASE__ || '';
    if (base) {
      fetch(`${base}/api/we/scene-manifest?id=${encodeURIComponent(live.id)}`)
        .then(r => r.json())
        .then(data => {
          if (destroyed || !data || !data.ok) return;
          cfg.windStrength = Number(data.windStrength) || 0.65;
          cfg.waterStrength = Number(data.waterStrength) || 0.25;
          cfg.shimmerStrength = Number(data.shimmerStrength) || 0.45;
          if (Array.isArray(data.particles) && data.particles.length) {
            cfg.particles = data.particles;
            rebuildParticles();
          }
        })
        .catch(() => {});
    }

    const t0 = performance.now();
    function renderFrame(now) {
      if (destroyed) return;
      const st = getState();
      if (document.hidden || (st.livePauseBlur && !document.hasFocus())) {
        rafId = 0;
        return;
      }
      const t = (now - t0) * 0.001;
      curMX += (targetMX - curMX) * 0.05;
      curMY += (targetMY - curMY) * 0.05;

      if (gl && prog && texReady) {
        gl.useProgram(prog);
        gl.uniform1f(gl.getUniformLocation(prog, 'u_time'), t);
        gl.uniform2f(gl.getUniformLocation(prog, 'u_mouse'), curMX, curMY);
        gl.uniform1f(gl.getUniformLocation(prog, 'u_canvasAspect'), glCanvas.width / Math.max(1, glCanvas.height));
        gl.uniform1f(gl.getUniformLocation(prog, 'u_imgAspect'), imgAspect);
        gl.uniform1f(gl.getUniformLocation(prog, 'u_wind'), cfg.windStrength);
        gl.uniform1f(gl.getUniformLocation(prog, 'u_water'), cfg.waterStrength);
        gl.uniform1f(gl.getUniformLocation(prog, 'u_shimmer'), cfg.shimmerStrength);
        gl.drawArrays(gl.TRIANGLES, 0, 6);
      }

      if (pCtx) {
        const w = ptCanvas.width;
        const h = ptCanvas.height;
        pCtx.clearRect(0, 0, w, h);

        if (cfg.particles.includes('lightshaft')) {
          pCtx.save();
          pCtx.globalCompositeOperation = 'screen';
          for (let i = 0; i < 3; i++) {
            const sway = Math.sin(t * 0.35 + i * 1.7) * 90;
            const x0 = w * (0.18 + i * 0.28) + sway;
            const grad = pCtx.createLinearGradient(x0, 0, x0 + 220, h * 0.85);
            const a = (0.045 + 0.025 * Math.sin(t * 0.7 + i)) * cfg.shimmerStrength;
            grad.addColorStop(0, `rgba(255, 240, 200, ${a.toFixed(4)})`);
            grad.addColorStop(1, 'rgba(255, 240, 200, 0)');
            pCtx.fillStyle = grad;
            pCtx.beginPath();
            pCtx.moveTo(x0 - 70, 0);
            pCtx.lineTo(x0 + 90, 0);
            pCtx.lineTo(x0 + 380, h);
            pCtx.lineTo(x0 + 60, h);
            pCtx.closePath();
            pCtx.fill();
          }
          pCtx.restore();
        }

        for (let i = 0; i < particles.length; i++) {
          const p = particles[i];
          p.x += p.vx + Math.sin(t * 1.2 + p.phase) * (p.kind === 'petal' || p.kind === 'snow' ? 0.45 : 0.15);
          p.y += p.vy;
          if (p.x < -20) p.x = w + 15;
          if (p.x > w + 20) p.x = -15;
          if (p.y < -20) p.y = h + 15;
          if (p.y > h + 20) p.y = -15;

          const twinkle = 0.55 + 0.45 * Math.sin(t * (p.kind === 'star' ? 2.6 : 1.5) + p.phase);
          const a = p.alpha * twinkle;

          if (p.kind === 'rain') {
            pCtx.strokeStyle = `rgba(186, 230, 253, ${(a * 0.42).toFixed(3)})`;
            pCtx.lineWidth = 1.1;
            pCtx.beginPath();
            pCtx.moveTo(p.x, p.y);
            pCtx.lineTo(p.x + p.vx * 1.4, p.y + p.r);
            pCtx.stroke();
          } else if (p.kind === 'petal') {
            pCtx.save();
            pCtx.translate(p.x, p.y);
            pCtx.rotate(t * 1.1 + p.phase);
            pCtx.fillStyle = `rgba(255, 210, 225, ${(a * 0.75).toFixed(3)})`;
            pCtx.beginPath();
            pCtx.ellipse(0, 0, p.r, p.r * 0.55, 0, 0, Math.PI * 2);
            pCtx.fill();
            pCtx.restore();
          } else if (p.kind === 'ember') {
            pCtx.fillStyle = `rgba(251, 146, 60, ${(a * 0.88).toFixed(3)})`;
            pCtx.beginPath();
            pCtx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
            pCtx.fill();
          } else if (p.kind === 'snow') {
            pCtx.fillStyle = `rgba(248, 250, 252, ${(a * 0.8).toFixed(3)})`;
            pCtx.beginPath();
            pCtx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
            pCtx.fill();
          } else {
            pCtx.fillStyle = p.kind === 'star'
              ? `rgba(224, 242, 254, ${(a * 0.85).toFixed(3)})`
              : `rgba(254, 243, 199, ${(a * 0.55).toFixed(3)})`;
            pCtx.beginPath();
            pCtx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
            pCtx.fill();
          }
        }
      }

      rafId = requestAnimationFrame(renderFrame);
    }

    rafId = requestAnimationFrame(renderFrame);

    window.__AGY_SCENE_ENGINE__ = {
      resume() {
        if (!destroyed && !rafId) {
          rafId = requestAnimationFrame(renderFrame);
        }
      },
      pause() {
        if (rafId) {
          cancelAnimationFrame(rafId);
          rafId = 0;
        }
      },
      destroy() {
        destroyed = true;
        if (rafId) cancelAnimationFrame(rafId);
        window.removeEventListener('mousemove', onMouseMove);
        window.removeEventListener('resize', resizeCanvases);
        try {
          if (gl && tex) gl.deleteTexture(tex);
          if (gl && prog) gl.deleteProgram(prog);
        } catch (e) {}
      }
    };
  }

  function syncLiveWallpaper(st, mainTheme, overlayRgb, overlayAlpha) {
    const shell = document.querySelector('.agy-shell');
    const existing = document.getElementById('agy-live-wp-layer');
    const live = st.wpEnabled && st.liveWp && st.liveWp.id && st.liveWp.relFile ? st.liveWp : null;
    const mediaUrl = live ? buildMediaUrl(live.id, live.relFile) : '';

    if (!shell || !live || !mediaUrl) {
      stopStandaloneSceneEngine();
      if (existing) {
        stopVideoElement(existing.querySelector('video'));
        existing.remove();
        const base = window.__AGY_MEDIA_BASE__ || '';
        if (base) fetch(`${base}/api/we/activate-scene?id=close`).catch(() => {});
      }
      return false;
    }

    let layer = existing;
    if (!layer || layer.parentNode !== shell) {
      stopStandaloneSceneEngine();
      if (layer) {
        stopVideoElement(layer.querySelector('video'));
        layer.remove();
      }
      layer = document.createElement('section');
      layer.id = 'agy-live-wp-layer';
      layer.setAttribute('aria-hidden', 'true');
      shell.insertBefore(layer, shell.firstChild);
    }

    const isDx11Scene = live.category === 'scene' || live.type === 'image';
    const wpCfg = (live && live.settings && typeof live.settings === 'object') ? live.settings : {};
    const effVol = wpCfg.volume !== undefined ? Number(wpCfg.volume) : 0;
    const dxPropsObj = { ...(wpCfg.customValues || {}) };
    if (wpCfg.audioRecording !== undefined) dxPropsObj.__audioprocessing = Boolean(wpCfg.audioRecording);
    if (wpCfg.schemeColor) dxPropsObj.__schemecolor = String(wpCfg.schemeColor);
    const customValsJson = JSON.stringify(dxPropsObj);
    const mediaKey = `${live.category || live.type}|${live.id}|${mediaUrl}|${isDx11Scene ? customValsJson : ''}`;
    if (layer.dataset.mediaKey !== mediaKey) {
      stopStandaloneSceneEngine();
      stopVideoElement(layer.querySelector('video'));
      layer.dataset.mediaKey = mediaKey;
      layer.innerHTML = '';

      if (live.type === 'web') {
        const iframe = document.createElement('iframe');
        iframe.id = 'agy-live-wp-web';
        iframe.src = mediaUrl;
        iframe.setAttribute('sandbox', 'allow-scripts allow-same-origin');
        iframe.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;border:0;pointer-events:none;display:block;';
        layer.appendChild(iframe);
      } else if (isDx11Scene) {
        const previewUrl = live.previewFile ? buildMediaUrl(live.id, live.previewFile) : mediaUrl;
        layer.style.background = '#070910 url("' + previewUrl + '") center/cover no-repeat';
        const video = document.createElement('video');
        video.id = 'agy-live-wp-video';
        video.poster = previewUrl;
        video.autoplay = true;
        video.muted = true;
        video.playsInline = true;
        video.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;object-fit:cover;pointer-events:none;display:block;opacity:0;transition:opacity 0.22s ease;';
        layer.appendChild(video);

        const base = window.__AGY_MEDIA_BASE__ || '';
        const reqKey = mediaKey;
        if (base && navigator.mediaDevices && typeof navigator.mediaDevices.getUserMedia === 'function') {
          const propsParam = Object.keys(dxPropsObj).length
            ? `&props=${encodeURIComponent(customValsJson)}`
            : '';
          const volParam = `&volume=${Math.max(0, Math.min(100, Math.round(Number.isFinite(effVol) ? effVol : 0)))}`;
          fetch(`${base}/api/we/activate-scene?id=${encodeURIComponent(live.id)}${propsParam}${volParam}&_t=${Date.now()}`)
            .then(r => r.json())
            .then(async (data) => {
              const curLayer = document.getElementById('agy-live-wp-layer');
              if (!curLayer || curLayer.dataset.mediaKey !== reqKey) return;
              if (!data || !data.ok || !data.sourceId) {
                const sc = curLayer.querySelector('#agy-live-wp-scrim');
                const vOld = curLayer.querySelector('#agy-live-wp-video');
                if (vOld) vOld.remove();
                mountStandaloneSceneEngine(curLayer, live, mediaUrl);
                if (sc) curLayer.appendChild(sc);
                return;
              }
              const curVid = curLayer.querySelector('#agy-live-wp-video');
              if (!curVid) return;
              try {
                const stream = await navigator.mediaDevices.getUserMedia({
                  audio: false,
                  video: {
                    mandatory: {
                      chromeMediaSource: 'desktop',
                      chromeMediaSourceId: data.sourceId,
                      minWidth: 1920,
                      maxWidth: 2560,
                      minHeight: 1080,
                      maxHeight: 1440,
                      minFrameRate: 30,
                      maxFrameRate: 60
                    }
                  }
                });
                if (curLayer.dataset.mediaKey !== reqKey) {
                  stream.getTracks().forEach(t => t.stop());
                  return;
                }
                stopVideoElement(curVid);
                curVid.onplaying = () => {
                  setTimeout(() => {
                    if (curVid.isConnected) curVid.style.opacity = '1';
                  }, 120);
                };
                curVid.srcObject = stream;
                const p = curVid.play();
                if (p && typeof p.catch === 'function') p.catch(() => {});
              } catch (e) {
                const sc = curLayer.querySelector('#agy-live-wp-scrim');
                curVid.remove();
                mountStandaloneSceneEngine(curLayer, live, mediaUrl);
                if (sc) curLayer.appendChild(sc);
              }
            })
            .catch(() => {});
        } else {
          mountStandaloneSceneEngine(layer, live, mediaUrl);
        }
      } else {
        const video = document.createElement('video');
        video.id = 'agy-live-wp-video';
        video.src = mediaUrl;
        video.autoplay = true;
        video.loop = true;
        video.muted = true;
        video.playsInline = true;
        video.preload = 'auto';
        video.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;object-fit:cover;pointer-events:none;display:block;';
        layer.appendChild(video);
        const playPromise = video.play();
        if (playPromise && typeof playPromise.catch === 'function') {
          playPromise.catch(() => {});
        }
      }

      const scrim = document.createElement('div');
      scrim.id = 'agy-live-wp-scrim';
      scrim.style.cssText = 'position:absolute;inset:0;pointer-events:none;';
      layer.appendChild(scrim);
    }

    const fitMode = wpCfg.fit || 'cover';
    const posX = wpCfg.posX !== undefined ? Number(wpCfg.posX) : 50;
    const posY = wpCfg.posY !== undefined ? Number(wpCfg.posY) : 50;
    const flipH = Boolean(wpCfg.flip);
    const speedPct = wpCfg.speed !== undefined ? Number(wpCfg.speed) : 100;
    const volPct = wpCfg.volume !== undefined ? Number(wpCfg.volume) : 0;
    const mouseParallax = wpCfg.mouseParallax !== undefined ? Boolean(wpCfg.mouseParallax) : true;
    const imgFilter = wpCfg.imageFilter || 'none';
    const showCol = Boolean(wpCfg.showColor);
    const brs = showCol && wpCfg.brightness !== undefined ? Number(wpCfg.brightness) : 100;
    const con = showCol && wpCfg.contrast !== undefined ? Number(wpCfg.contrast) : 100;
    const sat = showCol && wpCfg.saturate !== undefined ? Number(wpCfg.saturate) : 100;
    const hue = showCol && wpCfg.hue !== undefined ? Number(wpCfg.hue) : 0;

    const filterParts = [];
    if (brs !== 100) filterParts.push(`brightness(${brs}%)`);
    if (con !== 100) filterParts.push(`contrast(${con}%)`);
    if (sat !== 100) filterParts.push(`saturate(${sat}%)`);
    if (hue !== 0) filterParts.push(`hue-rotate(${hue}deg)`);
    if (imgFilter === 'sepia') filterParts.push('sepia(82%)');
    else if (imgFilter === 'grayscale') filterParts.push('grayscale(100%)');
    else if (imgFilter === 'invert') filterParts.push('invert(100%)');
    else if (imgFilter === 'crt') filterParts.push('contrast(118%) saturate(130%) brightness(94%)');
    const filterCss = filterParts.length ? filterParts.join(' ') : 'none';

    window.__AGY_WE_PARALLAX_ON__ = mouseParallax;
    window.__AGY_WE_FLIP_H__ = flipH;
    if (!window.__AGY_WE_PARALLAX_BOUND__) {
      window.__AGY_WE_PARALLAX_BOUND__ = true;
      window.addEventListener('mousemove', (ev) => {
        const el = document.querySelector('#agy-live-wp-layer > #agy-live-wp-video, #agy-live-wp-layer > #agy-live-wp-webgl, #agy-live-wp-layer > #agy-live-wp-web');
        if (!el) return;
        const sx = window.__AGY_WE_FLIP_H__ ? -1 : 1;
        if (!window.__AGY_WE_PARALLAX_ON__) {
          el.style.transform = sx === -1 ? 'scaleX(-1)' : 'none';
          return;
        }
        const nx = (ev.clientX / Math.max(1, window.innerWidth)) - 0.5;
        const ny = (ev.clientY / Math.max(1, window.innerHeight)) - 0.5;
        const tx = (-nx * 14).toFixed(1);
        const ty = (-ny * 10).toFixed(1);
        el.style.transform = `scale(${1.022 * sx}, 1.022) translate(${tx}px, ${ty}px)`;
      }, { passive: true });
    }

    const mediaEl = layer.querySelector('#agy-live-wp-video, #agy-live-wp-webgl, #agy-live-wp-web');
    if (mediaEl) {
      mediaEl.style.objectFit = fitMode;
      mediaEl.style.objectPosition = `${posX}% ${posY}%`;
      if (mouseParallax) {
        mediaEl.style.transform = `scale(${1.022 * (flipH ? -1 : 1)}, 1.022)`;
      } else {
        mediaEl.style.transform = flipH ? 'scaleX(-1)' : 'none';
      }
      mediaEl.style.filter = filterCss;
      mediaEl.style.imageRendering = imgFilter === 'pixelate' ? 'pixelated' : 'auto';
    }

    if (isDx11Scene) {
      const targetVol = Math.max(0, Math.min(100, Math.round(Number.isFinite(effVol) ? effVol : 68)));
      if (window.__AGY_LAST_WE_VOL__ !== targetVol) {
        window.__AGY_LAST_WE_VOL__ = targetVol;
        if (window.__AGY_VOL_TIMER__) clearTimeout(window.__AGY_VOL_TIMER__);
        window.__AGY_VOL_TIMER__ = setTimeout(() => {
          const base = window.__AGY_MEDIA_BASE__ || '';
          if (base) fetch(`${base}/api/we/set-volume?volume=${targetVol}`).catch(() => {});
        }, 50);
      }
    }

    const scrim = layer.querySelector('#agy-live-wp-scrim');
    if (scrim) {
      const secondaryGlowStop = mainTheme.secondaryGlow
        ? `, radial-gradient(circle at 22% 72%, ${mainTheme.secondaryGlow} 0%, transparent 55%)`
        : '';
      scrim.style.background = mainTheme.clearBackdrop
        ? `rgba(${overlayRgb}, ${overlayAlpha})`
        : `radial-gradient(circle at 75% 40%, ${mainTheme.glow} 0%, transparent 65%)${secondaryGlowStop}, linear-gradient(180deg, rgba(${overlayRgb}, ${(overlayAlpha * 0.85).toFixed(3)}) 0%, rgba(${overlayRgb}, ${overlayAlpha.toFixed(3)}) 100%)`;
    }

    const vid = layer.querySelector('video');
    if (vid) {
      const normVol = Math.max(0, Math.min(1, (Number.isFinite(volPct) ? volPct : 68) / 100));
      try { vid.volume = normVol; } catch (e) {}
      vid.muted = !st.liveAudio || normVol === 0;
      if (!vid.srcObject && Number.isFinite(speedPct) && speedPct >= 10 && speedPct <= 300) {
        try { vid.playbackRate = speedPct / 100; } catch (e) {}
      }
      const shouldPause = document.hidden || (st.livePauseBlur && !document.hasFocus());
      if (shouldPause && !vid.paused) {
        try { vid.pause(); } catch (e) {}
      } else if (!shouldPause && vid.paused) {
        const p = vid.play();
        if (p && typeof p.catch === 'function') p.catch(() => {});
      }
    }
    return true;
  }

  // Downscale user/agent avatar uploads to 192x192 WebP once so theme_config.json stays tiny
  function compressAvatarFile(file, callback) {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        try {
          const size = 192;
          const canvas = document.createElement('canvas');
          canvas.width = size;
          canvas.height = size;
          const ctx = canvas.getContext('2d');
          const natW = img.naturalWidth || size;
          const natH = img.naturalHeight || size;
          const side = Math.min(natW, natH);
          const sx = Math.max(0, Math.floor((natW - side) / 2));
          const sy = Math.max(0, Math.floor((natH - side) / 2));
          ctx.drawImage(img, sx, sy, side, side, 0, 0, size, size);
          const out = canvas.toDataURL('image/webp', 0.88);
          callback(out && out.startsWith('data:image/webp') ? out : canvas.toDataURL('image/png'));
        } catch (e) {
          callback(String(reader.result || ''));
        }
      };
      img.onerror = () => callback(String(reader.result || ''));
      img.src = String(reader.result || '');
    };
    reader.readAsDataURL(file);
  }

  // Downscale custom wallpaper uploads to max 2560px WebP so localStorage (5MB limit) never throws QuotaExceededError
  function compressWallpaperFile(file, callback) {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        try {
          const maxDim = 2560;
          let w = img.naturalWidth || 1920;
          let h = img.naturalHeight || 1080;
          if (Math.max(w, h) > maxDim) {
            const scale = maxDim / Math.max(w, h);
            w = Math.max(1, Math.round(w * scale));
            h = Math.max(1, Math.round(h * scale));
          }
          const canvas = document.createElement('canvas');
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, w, h);
          const out = canvas.toDataURL('image/webp', 0.88);
          callback(out && out.startsWith('data:image/webp') ? out : String(reader.result || ''));
        } catch (e) {
          callback(String(reader.result || ''));
        }
      };
      img.onerror = () => callback(String(reader.result || ''));
      img.src = String(reader.result || '');
    };
    reader.readAsDataURL(file);
  }

  function scheduleSaveConfig(st) {
    if (!window.agySaveThemeConfig) return;
    if (window.__AGY_SAVE_CFG_TIMER__) clearTimeout(window.__AGY_SAVE_CFG_TIMER__);
    window.__AGY_SAVE_CFG_TIMER__ = setTimeout(() => {
      window.__AGY_SAVE_CFG_TIMER__ = 0;
      try {
        window.agySaveThemeConfig(JSON.stringify(st));
      } catch (e) {}
    }, 120);
  }

  // Pre-bake L-shaped header/sidebar glass blur once per theme/dimming change to avoid per-frame GPU backdrop readback
  function syncPrebakedGlass(wpUrl, overlayRgb, overlayAlpha, tintBg, blurStr) {
    const shell = document.querySelector('.agy-shell');
    if (!wpUrl) {
      if (shell) shell.style.removeProperty('--agy-l-glass-bg');
      return;
    }
    const key = `${wpUrl.slice(0, 64)}|${wpUrl.length}|${overlayRgb}|${overlayAlpha.toFixed(3)}|${tintBg}|${blurStr}`;
    window.__AGY_BLUR_CACHE__ = window.__AGY_BLUR_CACHE__ || {};
    const cached = window.__AGY_BLUR_CACHE__[key];
    if (cached) {
      if (shell) shell.style.setProperty('--agy-l-glass-bg', 'url("' + cached + '")');
      return;
    }
    const img = new Image();
    img.onload = () => {
      try {
        const w = 640;
        const h = Math.max(180, Math.round((img.naturalHeight || 1440) * (w / (img.naturalWidth || 2560))));
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        const pxMatch = String(blurStr !== undefined ? blurStr : '3px').match(/(\d+(?:\.\d+)?)/);
        const scaledBlur = Math.max(0, Math.min(16, Math.round((pxMatch ? parseFloat(pxMatch[1]) : 3) * 0.75)));
        ctx.filter = scaledBlur > 0 ? `blur(${scaledBlur}px)` : 'none';
        ctx.drawImage(img, -12, -12, w + 24, h + 24);
        ctx.filter = 'none';
        ctx.fillStyle = `rgba(${overlayRgb}, ${overlayAlpha})`;
        ctx.fillRect(0, 0, w, h);
        if (tintBg) {
          ctx.fillStyle = tintBg;
          ctx.fillRect(0, 0, w, h);
        }
        const baked = canvas.toDataURL('image/webp', 0.85);
        window.__AGY_BLUR_CACHE__[key] = baked;
        const curShell = document.querySelector('.agy-shell');
        if (curShell) curShell.style.setProperty('--agy-l-glass-bg', 'url("' + baked + '")');
      } catch (e) {}
    };
    img.src = wpUrl;
  }

  function applyTheme(overrides = {}) {
    const st = { ...getState(), ...overrides };
    try {
      localStorage.setItem(STORAGE_THEME, st.themeName);
      localStorage.setItem(STORAGE_BUBBLE, st.bubbleName);
      localStorage.setItem(STORAGE_INPUT, st.inputStyle);
      localStorage.setItem(STORAGE_DIMMING, String(st.dimming));
      localStorage.setItem(STORAGE_WP_ENABLED, String(st.wpEnabled));
      if (overrides.customWp !== undefined) {
        localStorage.setItem(STORAGE_CUSTOM_WP, overrides.customWp);
      }
      if (overrides.userAvatar !== undefined) {
        localStorage.setItem(STORAGE_USER_AVATAR, overrides.userAvatar);
      }
      if (overrides.agentAvatar !== undefined) {
        localStorage.setItem(STORAGE_AGENT_AVATAR, overrides.agentAvatar);
      }
      if (overrides.glassBlur !== undefined) {
        localStorage.setItem(STORAGE_GLASS_BLUR, String(overrides.glassBlur));
      }
      if (overrides.avatarSize !== undefined) {
        localStorage.setItem(STORAGE_AVATAR_SIZE, String(overrides.avatarSize));
      }
      if (overrides.avatarRadius !== undefined) {
        localStorage.setItem(STORAGE_AVATAR_RADIUS, String(overrides.avatarRadius));
      }
      if (overrides.liveWp !== undefined) {
        localStorage.setItem(STORAGE_LIVE_WP, overrides.liveWp ? JSON.stringify(overrides.liveWp) : '');
      } else if (st.liveWp && localStorage.getItem(STORAGE_LIVE_WP) === null) {
        localStorage.setItem(STORAGE_LIVE_WP, JSON.stringify(st.liveWp));
      }
      if (overrides.livePauseBlur !== undefined) {
        localStorage.setItem(STORAGE_LIVE_PAUSE_BLUR, String(Boolean(overrides.livePauseBlur)));
      }
      if (overrides.liveAudio !== undefined) {
        localStorage.setItem(STORAGE_LIVE_AUDIO, String(Boolean(overrides.liveAudio)));
      }
    } catch (e) {}

    scheduleSaveConfig(st);

    const mainTheme = THEMES[st.themeName] || THEMES[DEFAULT_THEME_KEY];
    const bubbleTheme = THEMES[st.bubbleName] || mainTheme;
    const wpUrl = st.customWp || mainTheme.wallpaper || '';

    const oldLegacy = document.getElementById('antigravity-ho-ly-chibi-theme');
    if (oldLegacy) oldLegacy.remove();

    let styleEl = document.getElementById('antigravity-custom-theme-active');
    if (!styleEl) {
      styleEl = document.createElement('style');
      styleEl.id = 'antigravity-custom-theme-active';
      document.head.appendChild(styleEl);
    }

    const overlayAlpha = mainTheme.clearBackdrop
      ? Math.min(0.92, Math.max(0.0, ((st.dimming - 10) / 82) * 0.85))
      : Math.min(0.92, Math.max(0.12, (st.dimming / 100) * 0.78));
    const overlayRgb = mainTheme.overlayRgb || '10, 7, 6';
    const bgPosition = mainTheme.bgPosition || 'center center';
    const secondaryGlowStop = mainTheme.secondaryGlow
      ? `, radial-gradient(circle at 22% 72%, ${mainTheme.secondaryGlow} 0%, transparent 55%)`
      : '';

    const isLiveWpActive = syncLiveWallpaper(st, mainTheme, overlayRgb, overlayAlpha);
    const shellForWp = document.querySelector('.agy-shell');
    if (shellForWp) {
      if (!isLiveWpActive && st.wpEnabled && wpUrl) {
        if (window.__AGY_LAST_STATIC_WP__ !== wpUrl) {
          window.__AGY_LAST_STATIC_WP__ = wpUrl;
          shellForWp.style.setProperty('--agy-static-wp', `url("${wpUrl}")`);
        }
      } else if (window.__AGY_LAST_STATIC_WP__) {
        window.__AGY_LAST_STATIC_WP__ = '';
        shellForWp.style.removeProperty('--agy-static-wp');
      }
    }

    let bgLayers = '';
    if (wpUrl) {
      bgLayers = mainTheme.clearBackdrop
        ? `linear-gradient(180deg, rgba(${overlayRgb}, ${overlayAlpha}) 0%, rgba(${overlayRgb}, ${overlayAlpha}) 100%), var(--agy-static-wp, none)`
        : `radial-gradient(circle at 75% 40%, ${mainTheme.glow} 0%, transparent 65%)${secondaryGlowStop}, linear-gradient(180deg, rgba(${overlayRgb}, ${overlayAlpha * 0.85}) 0%, rgba(${overlayRgb}, ${overlayAlpha}) 100%), var(--agy-static-wp, none)`;
    } else {
      bgLayers = mainTheme.pureBg || `radial-gradient(circle at 75% 30%, ${mainTheme.glow} 0%, transparent 60%), linear-gradient(160deg, rgba(${overlayRgb}, 0.96) 0%, #070910 100%)`;
    }

    const shellBgRule = isLiveWpActive
      ? 'background-color: #070910 !important; background-image: none !important;'
      : `background-image: ${bgLayers} !important; background-size: cover !important; background-position: ${bgPosition} !important; background-repeat: no-repeat !important; image-rendering: auto !important;`;

    const wpCss = st.wpEnabled ? `
      .agy-shell {
        position: relative !important;
        ${shellBgRule}
      }
      #agy-live-wp-layer {
        position: absolute !important;
        inset: 0 !important;
        z-index: 0 !important;
        pointer-events: none !important;
        overflow: hidden !important;
      }
      body[data-has-browser-hole="true"] .agy-shell[data-agy-hole-active="1"] #agy-live-wp-layer {
        clip-path: var(--agy-hole-clip, none) !important;
      }
      ${isLiveWpActive ? `
      .agy-shell > div {
        position: relative;
        z-index: 2;
      }
      ` : ''}
      /* Keep transparent scrollers on GPU composited-scrolling layers */
      .agy-shell .overflow-y-auto {
        will-change: scroll-position;
      }
      .agy-sheet,
      .agy-inset-shell,
      .browser-hole-opaque,
      [data-main-content-body="true"],
      [data-side-panel-body="true"],
      [class*="agy-inset-shell"],
      [class*="--shell-canvas"],
      .agy-shell div.absolute.bottom-0.pointer-events-none,
      .agy-shell [class*="z-50"] .pointer-events-none.right-full,
      .agy-shell .bg-background:not(.settings-modal-container):not(.settings-modal-container *):not(#agy-custom-theme-modal-backdrop *) {
        background: transparent !important;
        background-color: transparent !important;
        background-image: none !important;
      }
      /* Browser split-pane hole cutout: keep wallpaper & L-glass visible outside [data-browser-hole] without covering live BrowserView */
      ${isLiveWpActive ? '' : `
      body[data-has-browser-hole="true"] .agy-shell[data-agy-hole-active="1"]::after {
        content: "";
        position: absolute;
        inset: 0;
        z-index: 0;
        pointer-events: none;
        background-image: ${bgLayers};
        background-size: cover;
        background-position: ${bgPosition};
        background-repeat: no-repeat;
        clip-path: var(--agy-hole-clip, none);
        will-change: transform;
      }
      `}
      body[data-has-browser-hole="true"] .agy-shell[data-agy-hole-active="1"] > :not([data-has-browser-hole="true"]):not([data-browser-hole]:not([data-browser-hole="false"])):not(.settings-modal-container),
      body[data-has-browser-hole="true"] .agy-shell[data-agy-hole-active="1"] .browser-hole-opaque:not([data-has-browser-hole="true"]),
      body[data-has-browser-hole="true"] .agy-shell[data-agy-hole-active="1"] [data-pane-id]:not([data-has-browser-hole="true"]),
      body[data-has-browser-hole="true"] .agy-shell[data-agy-hole-active="1"] [data-tiling-pane]:not([data-has-browser-hole="true"]),
      body[data-has-browser-hole="true"] .agy-shell[data-agy-hole-active="1"] [data-main-content-header]:not([data-has-browser-hole="true"]),
      body[data-has-browser-hole="true"] .agy-shell[data-agy-hole-active="1"] [data-side-panel-strip]:not([data-has-browser-hole="true"]) {
        background: transparent !important;
        background-color: transparent !important;
        background-image: none !important;
      }
      body[data-has-browser-hole="true"] .agy-shell[data-agy-hole-active="1"] :is([data-main-content-body], [data-side-panel-body]):not([data-has-browser-hole="true"]) {
        box-shadow: none !important;
      }
      body[data-has-browser-hole="true"] .agy-shell[data-agy-hole-active="1"] [data-split-sash] {
        background: rgba(56, 189, 248, 0.14) !important;
        background-image: none !important;
      }
    ` : `
      .agy-shell {
        background: #111113 !important;
      }
    `;

    const defaultCornerSvg = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 40 40'%3E%3Cpath d='M2 20 L2 6 Q2 2 6 2 L20 2' stroke='%23fbbf24' stroke-width='1.5' fill='none' opacity='0.65'/%3E%3Ccircle cx='6' cy='6' r='2' fill='%23fbbf24' opacity='0.75'/%3E%3C/svg%3E";
    const cornerFiligreeUrl = bubbleTheme.cornerSvg || defaultCornerSvg;

    const bubbleStickerCss = bubbleTheme.sticker ? (bubbleTheme.isOrnament ? `
      .group\\/user-input-step {
        padding-top: 18px !important;
      }
      .agy-user-bubble-frame::before {
        content: "";
        position: absolute;
        top: ${bubbleTheme.stickerTop}px;
        right: ${bubbleTheme.stickerRight}px;
        width: ${bubbleTheme.stickerW}px;
        height: ${bubbleTheme.stickerH}px;
        background-image: url("${bubbleTheme.sticker}");
        background-size: contain;
        background-position: center;
        background-repeat: no-repeat;
        z-index: 25;
        pointer-events: none;
        transition: transform 0.2s ease;
      }
    ` : `
      .group\\/user-input-step {
        padding-top: ${Math.max(36, Math.abs(bubbleTheme.stickerTop) + 8)}px !important;
      }
      .agy-user-bubble-frame::before {
        content: "";
        position: absolute;
        top: ${bubbleTheme.stickerTop}px;
        right: ${bubbleTheme.stickerRight}px;
        width: ${bubbleTheme.stickerW}px;
        height: ${bubbleTheme.stickerH}px;
        background-image: url("${bubbleTheme.sticker}");
        background-size: contain;
        background-position: bottom center;
        background-repeat: no-repeat;
        z-index: 25;
        pointer-events: none;
        transition: transform 0.2s ease;
      }
    `) : `
      .agy-user-bubble-frame::before { display: none !important; }
    `;

    const showInputSticker = st.inputStyle !== 'minimal' && bubbleTheme.sticker;
    const inputStickerCss = showInputSticker ? (bubbleTheme.isOrnament ? `
      .surface-composer {
        margin-top: 16px !important;
        overflow: visible !important;
      }
      .surface-composer::before {
        content: "";
        position: absolute;
        top: ${bubbleTheme.stickerTop}px;
        right: 16px;
        width: ${bubbleTheme.stickerW + 8}px;
        height: ${bubbleTheme.stickerH + 2}px;
        background-image: url("${bubbleTheme.sticker}");
        background-size: contain;
        background-position: center;
        background-repeat: no-repeat;
        z-index: 30;
        pointer-events: none;
      }
      .surface-composer::after {
        content: "";
        position: absolute;
        bottom: 3px;
        left: 4px;
        width: 16px;
        height: 16px;
        background-image: url("${cornerFiligreeUrl}");
        background-size: contain;
        background-repeat: no-repeat;
        transform: rotate(180deg);
        z-index: 25;
        pointer-events: none;
        opacity: 0.78;
      }
    ` : `
      .surface-composer {
        margin-top: 28px !important;
        overflow: visible !important;
      }
      .surface-composer::before {
        content: "";
        position: absolute;
        top: ${bubbleTheme.stickerTop - 4}px;
        right: 16px;
        width: ${bubbleTheme.stickerW + 6}px;
        height: ${bubbleTheme.stickerH + 6}px;
        background-image: url("${bubbleTheme.sticker}");
        background-size: contain;
        background-position: bottom center;
        background-repeat: no-repeat;
        z-index: 30;
        pointer-events: none;
      }
      .surface-composer::after { display: none !important; }
    `) : `
      .surface-composer::before,
      .surface-composer::after { display: none !important; }
    `;

    const inputCardBg =
      st.inputStyle === 'glass'
        ? (bubbleTheme.inputGlassBg || 'rgba(20, 15, 13, 0.52)')
        : st.inputStyle === 'double_gold'
        ? 'linear-gradient(145deg, rgba(44, 28, 20, 0.90) 0%, rgba(24, 15, 12, 0.92) 100%)'
        : (bubbleTheme.inputCardBg || 'rgba(28, 19, 16, 0.88)');

    const inputOuterBorder =
      st.inputStyle === 'double_gold'
        ? 'linear-gradient(135deg, #f59e0b 0%, rgba(217, 119, 6, 0.35) 50%, #fbbf24 100%)'
        : bubbleTheme.frameBg;

    const sidebarBg = mainTheme.sidebarBg || 'rgba(14, 10, 8, 0.68)';
    const sidebarHoverBg = mainTheme.sidebarHoverBg || 'rgba(255, 255, 255, 0.08)';
    const btnBg = mainTheme.btnBg || 'rgba(48, 30, 22, 0.62)';
    const modalBg = mainTheme.modalBg || 'rgba(14, 12, 12, 0.96)';
    const innerBubbleBorder = bubbleTheme.isScroll
      ? '2px solid #78350f'
      : (bubbleTheme.innerBorder || '1px solid rgba(255, 255, 255, 0.06)');

    const isLight = Boolean(mainTheme.isLight);
    const uiInk = mainTheme.uiTextColor || (isLight ? '#0f172a' : 'rgba(248, 250, 252, 0.96)');
    const uiMutedInk = mainTheme.uiMutedColor || (isLight ? '#334155' : 'rgba(241, 245, 249, 0.92)');
    const uiShadow = isLight ? 'none' : '0 1px 4px rgba(0, 0, 0, 0.92), 0 0 8px rgba(0, 0, 0, 0.68)';
    const pillBg = mainTheme.pillBg || (isLight ? 'rgba(255, 255, 255, 0.78)' : 'rgba(6, 11, 24, 0.78)');
    const pillHoverBg = mainTheme.pillHoverBg || (isLight ? 'rgba(255, 255, 255, 0.94)' : 'rgba(10, 18, 38, 0.92)');
    const pillText = mainTheme.pillTextColor || (isLight ? '#0f172a' : '#f8fafc');
    const pillBorder = mainTheme.pillBorder || (isLight ? 'rgba(15, 23, 42, 0.16)' : 'rgba(255, 255, 255, 0.16)');
    const preCodeBg = isLight ? `rgba(${overlayRgb}, 0.72)` : `rgba(${overlayRgb}, 0.56)`;

    const effectiveUserAvatar = st.userAvatar === 'none' ? '' : (st.userAvatar || mainTheme.userAvatar || '');
    const effectiveAgentAvatar = st.agentAvatar === 'none' ? '' : (st.agentAvatar || mainTheme.agentAvatar || '');
    const avSize = Math.min(52, Math.max(22, Number(st.avatarSize) || 32));
    const avAgentSize = Math.max(22, avSize - 2);
    const avRadius = Math.min(50, Math.max(0, Number.isFinite(Number(st.avatarRadius)) ? Number(st.avatarRadius) : 50));

    const avatarCss = `
      ${effectiveUserAvatar ? `
      .agy-shell [data-testid="user-message"] {
        position: relative !important;
        padding-right: ${avSize + 10}px !important;
      }
      .agy-shell [data-testid="user-message"]::after {
        content: "";
        position: absolute;
        right: 0;
        bottom: 6px;
        width: ${avSize}px;
        height: ${avSize}px;
        border-radius: ${avRadius}%;
        background-image: url("${effectiveUserAvatar}");
        background-size: cover;
        background-position: center;
        border: 1.5px solid ${mainTheme.primary};
        box-shadow: 0 2px 10px rgba(0, 0, 0, 0.4), 0 0 8px ${mainTheme.glow};
        pointer-events: none;
      }
      ` : ''}
      ${effectiveAgentAvatar ? `
      .agy-shell [data-testid="agent-response"] {
        position: relative !important;
        padding-left: ${avAgentSize + 22}px !important;
        min-height: ${avAgentSize + 20}px !important;
      }
      .agy-shell [data-testid="agent-response"]::before {
        content: "";
        position: absolute;
        top: 12px;
        left: 12px;
        width: ${avAgentSize}px;
        height: ${avAgentSize}px;
        border-radius: ${avRadius}%;
        background-image: url("${effectiveAgentAvatar}");
        background-size: cover;
        background-position: center;
        border: 1.5px solid ${mainTheme.secondary || mainTheme.primary};
        box-shadow: 0 2px 10px rgba(0, 0, 0, 0.4), 0 0 8px ${mainTheme.secondaryGlow || mainTheme.glow};
        pointer-events: none;
      }
      ` : ''}
    `;

    const sidebarEnhanceCss = (mainTheme.sidebarEnhanceText || isLight) ? `
      .agy-shell .bg-sidebar a,
      .agy-shell .bg-sidebar span,
      .agy-shell .bg-sidebar button {
        color: ${isLight ? uiInk : 'inherit'};
        text-shadow: ${isLight ? 'none' : '0 1px 3px rgba(0, 0, 0, 0.88)'};
      }
      .agy-shell .bg-sidebar .text-muted-foreground,
      .agy-shell .bg-sidebar .text-secondary-foreground {
        color: ${uiMutedInk} !important;
      }
    ` : '';

    const aiCardCss = mainTheme.aiCardBg ? `
      /* Translucent reading card for AI responses (zero live backdrop-filter for max 120fps scroll) */
      .agy-shell [data-testid="agent-response"] {
        background: ${mainTheme.aiCardBg} !important;
        ${isLight ? `color: ${uiInk} !important;` : ''}
        backdrop-filter: none !important;
        border: 1px solid ${mainTheme.aiCardBorder || (isLight ? 'rgba(15, 23, 42, 0.12)' : 'rgba(255, 255, 255, 0.1)')} !important;
        border-radius: 14px !important;
        padding: 12px 16px !important;
        box-shadow: ${isLight ? '0 4px 14px rgba(15, 23, 42, 0.08)' : '0 4px 14px rgba(0, 0, 0, 0.28)'} !important;
        box-sizing: border-box !important;
        overflow: hidden !important;
      }
      .agy-shell [data-testid="agent-response"] .md-table-bleed,
      .agy-shell [data-testid="agent-response"] .md-table-host {
        width: 100% !important;
        min-width: 0 !important;
        max-width: 100% !important;
        margin-left: 0 !important;
        margin-right: 0 !important;
        margin-inline: 0 !important;
        left: auto !important;
        right: auto !important;
        transform: none !important;
        box-sizing: border-box !important;
      }
      .agy-shell [data-testid="agent-response"] .md-table-scroll,
      .agy-shell [data-testid="agent-response"] :has(> table):not(.md-table-frame) {
        display: block !important;
        width: 100% !important;
        min-width: 0 !important;
        max-width: 100% !important;
        overflow-x: auto !important;
        overflow-y: hidden !important;
        padding-left: 0 !important;
        padding-right: 0 !important;
        padding-bottom: 2px !important;
        box-sizing: border-box !important;
        /* Keep standard scrollbar-width: auto so Chromium does not disable ::-webkit-scrollbar */
        scrollbar-width: auto !important;
        scrollbar-color: auto !important;
      }
      .agy-shell [data-testid="agent-response"] .md-table-frame {
        /* .md-table-frame sits INSIDE .md-table-scroll; forcing width:100% + overflow:hidden hid overflow from .md-table-scroll */
        width: fit-content !important;
        min-width: 100% !important;
        max-width: none !important;
        margin: 0 !important;
        transform: none !important;
        box-sizing: border-box !important;
      }
      .agy-shell [data-testid="agent-response"] .md-table-scroll::-webkit-scrollbar,
      .agy-shell [data-testid="agent-response"] :has(> table):not(.md-table-frame)::-webkit-scrollbar {
        height: 8px !important;
        display: block !important;
      }
      .agy-shell [data-testid="agent-response"] .md-table-scroll::-webkit-scrollbar-track,
      .agy-shell [data-testid="agent-response"] :has(> table):not(.md-table-frame)::-webkit-scrollbar-track {
        background: ${isLight ? 'rgba(15, 23, 42, 0.06)' : 'rgba(255, 255, 255, 0.06)'} !important;
        border-radius: 9999px !important;
      }
      .agy-shell [data-testid="agent-response"] .md-table-scroll::-webkit-scrollbar-thumb,
      .agy-shell [data-testid="agent-response"] :has(> table):not(.md-table-frame)::-webkit-scrollbar-thumb {
        background: ${isLight ? 'rgba(15, 23, 42, 0.34)' : 'rgba(148, 163, 184, 0.48)'} !important;
        border-radius: 9999px !important;
      }
      .agy-shell [data-testid="agent-response"] .md-table-scroll::-webkit-scrollbar-thumb:hover,
      .agy-shell [data-testid="agent-response"] :has(> table):not(.md-table-frame)::-webkit-scrollbar-thumb:hover {
        background: ${isLight ? 'rgba(15, 23, 42, 0.54)' : 'rgba(148, 163, 184, 0.72)'} !important;
      }
      .agy-shell [data-testid="agent-response"] table {
        width: 100% !important;
        min-width: 100% !important;
        max-width: none !important;
        margin: 0 !important;
        table-layout: auto !important;
        box-sizing: border-box !important;
      }
      .agy-shell [data-testid="agent-response"] :is(th, td) {
        max-width: none !important;
        white-space: normal !important;
        word-break: normal !important;
        overflow-wrap: break-word !important;
        padding: 8px 12px !important;
      }
      .agy-shell [data-testid="agent-response"] :is(td, th) .inline-pill-wrap {
        min-width: 0 !important;
      }
      ${isLight ? `
      .agy-shell [data-main-content-body="true"],
      .agy-shell [data-testid="agent-response"] :is(p, li, span, code, h1, h2, h3, h4, strong, td, th) {
        color: ${uiInk};
      }
      ` : ''}
      .agy-shell [data-main-content-body="true"] h1,
      .agy-shell [data-main-content-body="true"] h2 {
        text-shadow: ${isLight ? 'none' : '0 2px 10px rgba(0, 0, 0, 0.85)'};
      }
    ` : '';

    const useUnifiedGlass = Boolean(st.wpEnabled && (wpUrl || isLiveWpActive) && mainTheme.unifiedGlass);
    if (useUnifiedGlass && typeof syncShellMetrics === 'function') {
      syncShellMetrics();
    }
    if (useUnifiedGlass && !isLiveWpActive) {
      const effectiveBlur = Number.isFinite(st.glassBlur) ? `${st.glassBlur}px` : (mainTheme.headerBlur || '3px');
      syncPrebakedGlass(wpUrl, overlayRgb, overlayAlpha, mainTheme.headerBg || '', effectiveBlur);
    } else {
      syncPrebakedGlass(null);
    }

    const sidePanelCss = st.wpEnabled ? `
      /* Frosted pre-baked glass + dark/light reading scrim for right-side Artifact / Text / Diff split panels */
      ${useUnifiedGlass ? `
      .agy-shell[data-agy-side-glass="1"]::before {
        clip-path: polygon(
          evenodd,
          0 0,
          100% 0,
          100% var(--agy-hdr-h, 75px),
          var(--agy-sidebar-w, 256px) var(--agy-hdr-h, 75px),
          var(--agy-sidebar-w, 256px) 100%,
          0 100%,
          0 0,
          var(--agy-side-l, 100%) var(--agy-side-t, 75px),
          var(--agy-side-r, 100%) var(--agy-side-t, 75px),
          var(--agy-side-r, 100%) var(--agy-side-b, 100%),
          var(--agy-side-l, 100%) var(--agy-side-b, 100%),
          var(--agy-side-l, 100%) var(--agy-side-t, 75px)
        ) !important;
      }
      ` : ''}
      body:not([data-has-browser-hole="true"]) .agy-shell [data-side-panel-body="true"]:not([data-has-browser-hole="true"]):not(:has([data-browser-hole]:not([data-browser-hole="false"]))) {
        background: ${mainTheme.aiCardBg || `rgba(${overlayRgb}, 0.72)`} !important;
        ${isLight ? `color: ${uiInk} !important;` : ''}
        backdrop-filter: none !important;
        border-left: 1px solid ${mainTheme.aiCardBorder || (isLight ? 'rgba(15, 23, 42, 0.14)' : 'rgba(255, 255, 255, 0.14)')} !important;
        box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.04) !important;
      }
      body:not([data-has-browser-hole="true"]) .agy-shell [data-side-panel-body="true"]:not([data-has-browser-hole="true"]):not(:has([data-browser-hole]:not([data-browser-hole="false"]))) pre {
        background: ${preCodeBg} !important;
        border: 1px solid ${mainTheme.aiCardBorder || (isLight ? 'rgba(15, 23, 42, 0.14)' : 'rgba(255, 255, 255, 0.14)')} !important;
        border-radius: 10px !important;
      }
      .agy-shell [data-side-panel-body="true"] :is(h1, h2, h3, h4) {
        ${isLight ? `color: ${uiInk} !important;` : ''}
        text-shadow: ${isLight ? 'none' : '0 1px 6px rgba(0, 0, 0, 0.85)'};
      }
    ` : '';

    const headerCss = mainTheme.headerBg ? `
      /* Frosted top titlebar & seamless L-shaped unified glass (zero live backdrop-filter) */
      ${useUnifiedGlass ? `
      .agy-shell {
        position: relative !important;
      }
      .agy-shell > div:first-of-type {
        position: relative !important;
        z-index: 3 !important;
      }
      .agy-shell > div:not(:first-of-type) {
        position: relative !important;
        z-index: 2 !important;
      }
      .agy-shell::before {
        content: "";
        position: absolute;
        inset: 0;
        z-index: 1;
        pointer-events: none;
        background-color: ${mainTheme.headerBg};
        background-image: var(--agy-l-glass-bg, none);
        background-size: cover;
        background-position: ${bgPosition};
        background-repeat: no-repeat;
        backdrop-filter: none !important;
        will-change: transform;
        clip-path: polygon(
          0 0,
          100% 0,
          100% var(--agy-hdr-h, 75px),
          var(--agy-sidebar-w, 256px) var(--agy-hdr-h, 75px),
          var(--agy-sidebar-w, 256px) 100%,
          0 100%
        );
      }
      .agy-shell [class*="@container/titlebar"] {
        background: transparent !important;
        backdrop-filter: none !important;
        border-bottom: 1px solid ${mainTheme.headerBorder || 'rgba(56, 189, 248, 0.10)'} !important;
      }
      ` : `
      .agy-shell [class*="@container/titlebar"] {
        background: ${mainTheme.headerBg} !important;
        backdrop-filter: none !important;
        border-bottom: 1px solid ${mainTheme.headerBorder || 'rgba(56, 189, 248, 0.15)'} !important;
      }
      `}
      .agy-shell [class*="@container/titlebar"] [data-testid="breadcrumb-segment"],
      .agy-shell [class*="@container/titlebar"] [data-testid="pane-titlebar-toolbar"] button,
      .agy-shell [class*="@container/titlebar"] [data-testid="pane-titlebar-toolbar"] span {
        color: ${uiInk} !important;
        text-shadow: ${uiShadow};
      }
      .agy-shell [class*="@container/titlebar"] [data-testid="pane-titlebar-toolbar"] button.border {
        background: ${isLight ? 'rgba(255, 255, 255, 0.56)' : 'rgba(6, 11, 24, 0.36)'} !important;
        border-color: ${pillBorder} !important;
      }
    ` : '';

    const sidebarOuterCss = useUnifiedGlass ? `
      .agy-shell aside,
      .agy-shell [data-sidebar="true"],
      .agy-shell .bg-sidebar {
        background: transparent !important;
        backdrop-filter: none !important;
      }
    ` : `
      .agy-shell aside,
      .agy-shell [data-sidebar="true"],
      .agy-shell .bg-sidebar {
        background: ${sidebarBg} !important;
        backdrop-filter: none !important;
      }
    `;

    styleEl.textContent = `
      ${wpCss}

      /* Translucent themed sidebar (unified via ::before when unifiedGlass is active) */
      ${sidebarOuterCss}
      .agy-shell .bg-sidebar .bg-sidebar,
      .agy-shell [data-sidebar="true"] .bg-sidebar,
      .agy-shell .bg-sidebar [class*="group/headerbtn"],
      .agy-shell .bg-sidebar [class*="group/section-header"] {
        background: transparent !important;
        backdrop-filter: none !important;
      }
      /* Preserve virtual list positioning; hide sticky headers only while scrolled */
      .agy-shell .bg-sidebar .agy-scrolled > .w-full.relative > .bg-sidebar[style*="position: sticky"] {
        opacity: 0 !important;
        pointer-events: none !important;
        transition: opacity 0.14s ease !important;
      }
      .agy-shell .bg-sidebar [class*="group/headerbtn"]:hover,
      .agy-shell .bg-sidebar a:hover {
        background: ${sidebarHoverBg} !important;
      }
      ${sidebarEnhanceCss}
      ${aiCardCss}
      ${sidePanelCss}
      ${avatarCss}
      ${headerCss}

      /* "+ New Conversation" button glow */
      .agy-button-custom.border.border-border {
        background: ${btnBg} !important;
        border-color: ${mainTheme.borderColor} !important;
        box-shadow: 0 2px 12px rgba(0, 0, 0, 0.3) !important;
      }

      /* User Chat Bubble Double-Border Frame & Ornament */
      .agy-user-bubble-frame {
        background: ${bubbleTheme.frameBg} !important;
        border-radius: ${bubbleTheme.isScroll ? '6px' : '14px'} !important;
        box-shadow: 0 4px 18px rgba(0, 0, 0, 0.45), 0 0 12px ${bubbleTheme.glow} !important;
        position: relative !important;
        overflow: visible !important;
        padding: 1.2px !important;
      }

      .agy-user-bubble-frame::after {
        content: "";
        position: absolute;
        top: 3px;
        left: 3px;
        width: ${bubbleTheme.isOrnament ? '16px' : '14px'};
        height: ${bubbleTheme.isOrnament ? '16px' : '14px'};
        background-image: url("${cornerFiligreeUrl}");
        background-size: contain;
        background-repeat: no-repeat;
        pointer-events: none;
        opacity: ${bubbleTheme.isOrnament ? '0.85' : '0.65'};
      }

      .agy-user-bubble {
        background: ${bubbleTheme.bg} !important;
        border-radius: ${bubbleTheme.isScroll ? '5px' : '13px'} !important;
        padding: 8px 16px !important;
        color: ${bubbleTheme.textColor} !important;
        border: ${innerBubbleBorder} !important;
        overflow: visible !important;
        font-weight: 450 !important;
      }

      .agy-user-bubble * {
        color: ${bubbleTheme.textColor} !important;
      }

      /* Double-Border Input Composer */
      .surface-composer {
        background: ${inputOuterBorder} !important;
        border-radius: 16px !important;
        padding: 1.5px !important;
        box-shadow: 0 6px 24px rgba(0, 0, 0, 0.5), 0 0 14px ${bubbleTheme.glow} !important;
        position: relative !important;
      }

      .surface-composer-card {
        background: ${inputCardBg} !important;
        backdrop-filter: none !important;
        border-radius: 14.5px !important;
        border: ${bubbleTheme.innerBorder || '1px solid rgba(255, 255, 255, 0.07)'} !important;
      }

      /* High-contrast pill badges for top composer bar (adaptive light/dark theme) */
      .surface-composer [data-testid="project-selector-trigger"],
      .surface-composer [data-testid="branch-pill-trigger"],
      .surface-composer [aria-label="Select Environment"],
      .surface-composer > :not(.surface-composer-card) [data-testid="input-box-bottom-toolbar"] button,
      .surface-composer > :not(.surface-composer-card) [data-testid="input-box-bottom-toolbar"] [role="button"] {
        background: ${pillBg} !important;
        color: ${pillText} !important;
        border: 1px solid ${pillBorder} !important;
        border-radius: 9999px !important;
        font-weight: 500 !important;
        box-shadow: 0 1px 6px rgba(0, 0, 0, 0.25) !important;
        margin: 1px 2px !important;
        transition: background-color 0.15s ease, border-color 0.15s ease !important;
      }
      .surface-composer [data-testid="branch-pill-trigger"],
      .surface-composer [aria-label="Select Environment"],
      .surface-composer > :not(.surface-composer-card) [data-testid="input-box-bottom-toolbar"] button:not([data-testid="project-selector-trigger"]),
      .surface-composer > :not(.surface-composer-card) [data-testid="input-box-bottom-toolbar"] [role="button"]:not([data-testid="project-selector-trigger"]) {
        padding-left: 8px !important;
        padding-right: 7px !important;
        gap: 4px !important;
      }
      .surface-composer [data-testid="project-selector-trigger"]:hover,
      .surface-composer [data-testid="branch-pill-trigger"]:hover,
      .surface-composer [aria-label="Select Environment"]:hover,
      .surface-composer > :not(.surface-composer-card) [data-testid="input-box-bottom-toolbar"] button:hover,
      .surface-composer > :not(.surface-composer-card) [data-testid="input-box-bottom-toolbar"] [role="button"]:hover {
        background: ${pillHoverBg} !important;
        border-color: ${mainTheme.borderColor} !important;
        color: ${pillText} !important;
      }
      .surface-composer [data-testid="project-selector-trigger"] *,
      .surface-composer [data-testid="branch-pill-trigger"] *,
      .surface-composer [aria-label="Select Environment"] *,
      .surface-composer > :not(.surface-composer-card) [data-testid="input-box-bottom-toolbar"] button *,
      .surface-composer > :not(.surface-composer-card) [data-testid="input-box-bottom-toolbar"] [role="button"] * {
        color: ${pillText} !important;
      }
      .surface-composer > :not(.surface-composer-card) [data-testid="input-box-bottom-toolbar"] .ml-auto > * {
        background: ${pillBg} !important;
        color: ${pillText} !important;
        border-radius: 9999px !important;
        padding: 2px 8px !important;
      }

      ${bubbleStickerCss}
      ${inputStickerCss}

      @media (max-width: 640px) {
        .agy-user-bubble-frame::before,
        .surface-composer::before {
          transform: scale(0.78);
          transform-origin: bottom right;
        }
      }

      .settings-modal-container {
        background: ${modalBg} !important;
        border: 1px solid ${mainTheme.borderColor} !important;
        box-shadow: 0 12px 48px rgba(0, 0, 0, 0.75), 0 0 24px ${mainTheme.glow} !important;
        backdrop-filter: none !important;
      }

      #agy-custom-theme-modal-dialog {
        background: ${modalBg} !important;
        border-color: ${mainTheme.borderColor} !important;
        box-shadow: 0 24px 64px rgba(0, 0, 0, 0.9), 0 0 32px ${mainTheme.glow} !important;
      }
      #agy-custom-theme-modal-header {
        background: ${mainTheme.modalHeaderBg || 'rgba(22, 16, 14, 0.85)'} !important;
      }
      #agy-custom-theme-badge {
        color: ${mainTheme.primary} !important;
        border-color: ${mainTheme.borderColor} !important;
        background: ${mainTheme.glow} !important;
      }
      #agy-custom-theme-sidebar-btn svg {
        color: ${mainTheme.primary} !important;
      }
    `;

    syncTitleBarOverlay(st);
    scheduleTitleBarSync(st);
  }

  function syncTitleBarOverlay(stOverride) {
    const st = stOverride || getState();
    const activeTh = THEMES[st.themeName] || THEMES[DEFAULT_THEME_KEY] || {};
    if (window.electronNative && typeof window.electronNative.setTitleBarOverlay === 'function') {
      try {
        window.electronNative.setTitleBarOverlay({
          color: st.wpEnabled ? '#00000000' : '#111114',
          symbolColor: (st.wpEnabled && activeTh.isLight) ? '#0f172a' : '#f8fafc'
        });
      } catch (e) {}
    }
  }

  function clearTitleBarTimers() {
    if (Array.isArray(window.__AGY_TBO_TIMERS__)) {
      window.__AGY_TBO_TIMERS__.forEach(id => clearTimeout(id));
    }
    window.__AGY_TBO_TIMERS__ = [];
  }

  function scheduleTitleBarSync(stOverride) {
    clearTitleBarTimers();
    const st = stOverride || getState();
    syncTitleBarOverlay(st);
    [300, 900, 2000, 4000, 7000].forEach(ms => {
      window.__AGY_TBO_TIMERS__.push(setTimeout(() => syncTitleBarOverlay(), ms));
    });
  }

  function removeCustomTheme() {
    clearTitleBarTimers();
    if (window.__AGY_SCROLL_AC__) {
      try { window.__AGY_SCROLL_AC__.abort(); } catch (e) {}
    }
    const styleEl = document.getElementById('antigravity-custom-theme-active');
    if (styleEl) styleEl.remove();
    const navBtn = document.getElementById('agy-custom-theme-sidebar-btn');
    if (navBtn) navBtn.remove();
    const settingsBtn = document.getElementById('agy-custom-theme-settings-btn');
    if (settingsBtn) settingsBtn.remove();
    const modal = document.getElementById('agy-custom-theme-modal-backdrop');
    if (modal) modal.remove();
    const liveLayer = document.getElementById('agy-live-wp-layer');
    if (liveLayer) {
      stopStandaloneSceneEngine();
      stopVideoElement(liveLayer.querySelector('video'));
      liveLayer.remove();
    }
    const shell = document.querySelector('.agy-shell');
    if (shell) {
      delete shell.dataset.agyHoleActive;
      shell.style.removeProperty('--agy-hole-clip');
      shell.style.removeProperty('--agy-l-glass-bg');
      shell.style.removeProperty('--agy-static-wp');
    }
    window.__AGY_LAST_STATIC_WP__ = '';
    if (window.electronNative && typeof window.electronNative.setTitleBarOverlay === 'function') {
      try {
        window.electronNative.setTitleBarOverlay({ color: '#111114', symbolColor: '#f8fafc' });
      } catch (e) {}
    }
  }

  window.__ANTIGRAVITY_APPLY_CUSTOM_THEME__ = applyTheme;
  window.__ANTIGRAVITY_REMOVE_CUSTOM_THEME__ = removeCustomTheme;
  window.__ANTIGRAVITY_OPEN_THEME_MODAL__ = openCustomThemeModal;

  applyTheme();

  function openCustomThemeModal() {
    let backdrop = document.getElementById('agy-custom-theme-modal-backdrop');
    if (!backdrop) {
      backdrop = document.createElement('div');
      backdrop.id = 'agy-custom-theme-modal-backdrop';
      backdrop.style.cssText = `
        position: fixed;
        inset: 0;
        z-index: 99999;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 32px;
        background: rgba(4, 6, 12, 0.78);
        backdrop-filter: none;
      `;

      backdrop.innerHTML = `
        <div id="agy-custom-theme-modal-dialog" style="background: rgba(16, 12, 11, 0.97); border: 1.2px solid rgba(212, 148, 106, 0.35); border-radius: 18px; width: 95vw; max-width: 1260px; height: 90vh; max-height: 920px; display: flex; flex-direction: column; overflow: hidden; box-shadow: 0 24px 64px rgba(0, 0, 0, 0.9), 0 0 32px rgba(224, 142, 85, 0.25); font-family: system-ui, -apple-system, sans-serif;">
          <div id="agy-custom-theme-modal-header" style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px; padding: 14px 24px; border-bottom: 1px solid rgba(255, 255, 255, 0.08); background: rgba(22, 16, 14, 0.85);">
            <div style="display: flex; align-items: center; gap: 14px; flex-wrap: wrap;">
              <div style="display: flex; align-items: center; gap: 10px;">
                <span style="font-size: 16.5px; font-weight: 600; color: #f4f4f5; letter-spacing: -0.2px;">Custom Theme Studio</span>
                <span id="agy-custom-theme-badge" style="font-size: 11px; padding: 2px 8px; border-radius: 9999px; background: rgba(224, 142, 85, 0.2); color: #e08e55; font-weight: 500; border: 1px solid rgba(224, 142, 85, 0.3);">${THEME_KEYS.length} Presets</span>
              </div>
              <div style="display: flex; align-items: center; gap: 6px; background: rgba(0, 0, 0, 0.36); padding: 3px; border-radius: 10px; border: 1px solid rgba(255, 255, 255, 0.1);">
                <button id="agy-tab-we-btn" type="button" style="padding: 5px 13px; border-radius: 7px; border: none; font-size: 12.5px; font-weight: 600; cursor: pointer; background: rgba(224, 142, 85, 0.24); color: #ffffff; transition: all 0.15s ease;">🎬 Wallpaper Engine Gallery</button>
                <button id="agy-tab-studio-btn" type="button" style="padding: 5px 13px; border-radius: 7px; border: none; font-size: 12.5px; font-weight: 500; cursor: pointer; background: transparent; color: #a1a1aa; transition: all 0.15s ease;">🎨 Theme & UI Controls</button>
              </div>
            </div>
            <div style="display: flex; align-items: center; gap: 8px;">
              <button id="agy-kill-restore-btn" type="button" title="Immediately restore default original Antigravity UI and stop theme daemon for this session" style="padding: 5px 11px; border-radius: 8px; background: rgba(245, 158, 11, 0.16); border: 1px solid rgba(245, 158, 11, 0.45); color: #fcd34d; font-size: 12px; font-weight: 600; cursor: pointer; white-space: nowrap;">⚡ Restore Original UI</button>
              <button id="agy-kill-uninstall-btn" type="button" title="Completely kill daemon, unregister sidecar, and restore default Antigravity permanently" style="padding: 5px 11px; border-radius: 8px; background: rgba(239, 68, 68, 0.18); border: 1px solid rgba(239, 68, 68, 0.5); color: #fca5a5; font-size: 12px; font-weight: 600; cursor: pointer; white-space: nowrap;">💀 Kill & Uninstall All</button>
              <button id="agy-theme-modal-close-btn" type="button" style="background: rgba(255, 255, 255, 0.06); border: 1px solid rgba(255, 255, 255, 0.1); color: #d4d4d8; cursor: pointer; width: 30px; height: 30px; border-radius: 8px; font-size: 15px; display: flex; align-items: center; justify-content: center; transition: all 0.15s ease;">✕</button>
            </div>
          </div>
          <div id="agy-theme-modal-body" style="flex: 1; overflow-y: auto; height: 100%;"></div>
        </div>
      `;

      document.body.appendChild(backdrop);

      backdrop.addEventListener('click', (e) => {
        if (e.target === backdrop) backdrop.style.display = 'none';
      });
      backdrop.querySelector('#agy-theme-modal-close-btn').addEventListener('click', () => {
        backdrop.style.display = 'none';
      });
      const killRestoreBtn = backdrop.querySelector('#agy-kill-restore-btn');
      if (killRestoreBtn) {
        killRestoreBtn.addEventListener('click', () => {
          const base = window.__AGY_MEDIA_BASE__ || '';
          if (base) {
            fetch(`${base}/api/theme/kill?mode=session`).catch(() => {});
          }
          removeCustomTheme();
        });
      }
      const killUninstallBtn = backdrop.querySelector('#agy-kill-uninstall-btn');
      if (killUninstallBtn) {
        killUninstallBtn.addEventListener('click', () => {
          const base = window.__AGY_MEDIA_BASE__ || '';
          if (base) {
            fetch(`${base}/api/theme/kill?mode=uninstall`).catch(() => {});
          }
          removeCustomTheme();
        });
      }
      window.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && backdrop.style.display !== 'none') {
          backdrop.style.display = 'none';
        }
      });
    }

    backdrop.style.display = 'flex';
    const body = backdrop.querySelector('#agy-theme-modal-body');
    renderThemePanels(body);
  }

  function renderThemePanels(container) {
    const st = getState();
    const mainTheme = THEMES[st.themeName] || THEMES[DEFAULT_THEME_KEY];
    const effUserAv = st.userAvatar === 'none' ? '' : (st.userAvatar || mainTheme.userAvatar || '');
    const effAgentAv = st.agentAvatar === 'none' ? '' : (st.agentAvatar || mainTheme.agentAvatar || '');

    container.innerHTML = `
      <div id="agy-view-we" style="display: flex; flex-direction: column; height: 100%; padding: 18px 24px 22px 24px; box-sizing: border-box; color: #f4f4f5;">
        <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px; padding: 12px 16px; margin-bottom: 14px; border-radius: 12px; border: 1px solid ${mainTheme.borderColor}; background: ${mainTheme.cardBg || 'rgba(22, 16, 14, 0.72)'};">
          <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
            <div id="agy-we-cat-bar" style="display: flex; align-items: center; gap: 5px; flex-wrap: wrap;">
              <button type="button" class="agy-we-cat-pill" data-cat="all" style="padding: 4px 10px; border-radius: 9999px; border: 1px solid #f4f4f5; background: rgba(255,255,255,0.16); color: #ffffff; font-size: 12px; font-weight: 600; cursor: pointer;">All</button>
              <button type="button" class="agy-we-cat-pill" data-cat="video" style="padding: 4px 10px; border-radius: 9999px; border: 1px solid rgba(255,255,255,0.14); background: rgba(255,255,255,0.05); color: #d4d4d8; font-size: 12px; cursor: pointer;">Video 60fps</button>
              <button type="button" class="agy-we-cat-pill" data-cat="scene" style="padding: 4px 10px; border-radius: 9999px; border: 1px solid rgba(255,255,255,0.14); background: rgba(255,255,255,0.05); color: #d4d4d8; font-size: 12px; cursor: pointer;">Scene 4K</button>
              <button type="button" class="agy-we-cat-pill" data-cat="web" style="padding: 4px 10px; border-radius: 9999px; border: 1px solid rgba(255,255,255,0.14); background: rgba(255,255,255,0.05); color: #d4d4d8; font-size: 12px; cursor: pointer;">Web</button>
            </div>
            <span id="agy-we-status" style="font-size: 12px; color: #a1a1aa; margin-left: 4px;">Scanning Steam Workshop...</span>
          </div>
          <div style="display: flex; align-items: center; gap: 10px; flex-wrap: wrap;">
            <label style="display: flex; align-items: center; gap: 5px; font-size: 12px; color: #a1a1aa;">
              Dim
              <input id="agy-we-dim-slider" type="range" min="15" max="92" value="${st.dimming}" style="width: 82px; cursor: pointer; accent-color: #ffffff; height: 5px;" />
              <span id="agy-we-dim-val" style="min-width: 30px; text-align: right;">${st.dimming}%</span>
            </label>
            <label title="Auto-pause live video when Antigravity window loses focus to save 100% GPU" style="display: flex; align-items: center; gap: 5px; font-size: 12px; color: #d4d4d8; cursor: pointer;">
              <input id="agy-we-pause-blur" type="checkbox" ${st.livePauseBlur ? 'checked' : ''} style="accent-color: ${mainTheme.primary}; cursor: pointer;" />
              Eco Pause
            </label>
            <label title="Enable audio track on video wallpapers" style="display: flex; align-items: center; gap: 5px; font-size: 12px; color: #d4d4d8; cursor: pointer;">
              <input id="agy-we-audio" type="checkbox" ${st.liveAudio ? 'checked' : ''} style="accent-color: ${mainTheme.primary}; cursor: pointer;" />
              Sound
            </label>
            <select id="agy-we-sort" style="background: rgba(0,0,0,0.45); border: 1px solid rgba(255,255,255,0.16); border-radius: 8px; padding: 5px 8px; color: #f4f4f5; font-size: 12px; cursor: pointer; outline: none;">
              <option value="newest">Sort: Newest</option>
              <option value="title">Sort: Name (A–Z)</option>
            </select>
            <input id="agy-we-search" type="text" placeholder="Search wallpapers..." style="background: rgba(0,0,0,0.45); border: 1px solid rgba(255,255,255,0.18); border-radius: 8px; padding: 5px 11px; color: #f4f4f5; font-size: 12px; width: 175px; outline: none;" />
            <button id="agy-we-refresh-btn" type="button" title="Rescan Wallpaper Engine folder for newly downloaded wallpapers" style="padding: 5px 10px; border-radius: 8px; background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.16); color: #f4f4f5; font-size: 12px; cursor: pointer; white-space: nowrap;">↻ Refresh</button>
            <button id="agy-we-off-btn" type="button" style="padding: 5px 10px; border-radius: 8px; background: ${st.liveWp ? 'rgba(239, 68, 68, 0.16)' : 'rgba(255,255,255,0.08)'}; border: 1px solid ${st.liveWp ? 'rgba(239, 68, 68, 0.4)' : 'rgba(255,255,255,0.16)'}; color: ${st.liveWp ? '#fca5a5' : '#d4d4d8'}; font-size: 12px; cursor: pointer; white-space: nowrap;">
              ${st.liveWp ? 'Stop Live' : 'Static Mode'}
            </button>
          </div>
        </div>
        <div style="flex: 1; display: flex; gap: 14px; min-height: 0; overflow: hidden;">
          <div id="agy-we-grid" style="flex: 1; display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); grid-auto-rows: max-content; gap: 11px; overflow-y: auto; padding-right: 6px;"></div>
          <aside id="agy-we-inspector" style="width: 326px; flex-shrink: 0; border-radius: 10px; border: 1px solid rgba(255,255,255,0.1); background: #1c1d21; padding: 12px 14px 16px 14px; overflow-y: auto; display: flex; flex-direction: column; gap: 10px; color: #e4e6eb; box-sizing: border-box;"></aside>
        </div>
      </div>

      <div id="agy-theme-scroll-container" style="display: none; padding: 24px 32px 48px 32px; max-width: 1100px; margin: 0 auto; overflow-y: auto; height: 100%; box-sizing: border-box; color: #f4f4f5;">
        <div style="border: 1px solid ${mainTheme.borderColor}; background: ${mainTheme.cardBg || 'rgba(22, 16, 14, 0.72)'}; border-radius: 12px; padding: 16px 20px; margin-bottom: 14px; display: flex; flex-direction: column; gap: 12px;">
          <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px;">
            <div>
              <div style="font-size: 14.5px; font-weight: 600; color: #f4f4f5; margin-bottom: 2px;">Wallpaper, Pre-Baked Blur & Config</div>
              <div style="font-size: 12.5px; color: #a1a1aa;">Balance artwork clarity, 120fps pre-baked frosted glass blur, or share config JSON.</div>
            </div>
            <div style="display: flex; align-items: center; gap: 10px; flex-wrap: wrap;">
              <label style="display: flex; align-items: center; gap: 6px; font-size: 12.5px; color: #d4d4d8; cursor: pointer;">
                <input id="agy-wp-toggle" type="checkbox" ${st.wpEnabled ? 'checked' : ''} style="accent-color: ${mainTheme.primary}; cursor: pointer;" />
                Backdrop
              </label>
              <label style="display: flex; align-items: center; gap: 6px; font-size: 12px; color: #a1a1aa;">
                Dim
                <input id="agy-dim-slider" type="range" min="15" max="92" value="${st.dimming}" style="width: 96px; cursor: pointer; accent-color: #ffffff; height: 5px;" />
                <span id="agy-dim-val" style="min-width: 32px; text-align: right;">${st.dimming}%</span>
              </label>
              <label style="display: flex; align-items: center; gap: 6px; font-size: 12px; color: #a1a1aa;">
                Blur
                <input id="agy-blur-slider" type="range" min="0" max="16" value="${st.glassBlur}" style="width: 78px; cursor: pointer; accent-color: ${mainTheme.primary}; height: 5px;" />
                <span id="agy-blur-val" style="min-width: 30px; text-align: right;">${st.glassBlur}px</span>
              </label>
              <label style="padding: 5px 10px; border-radius: 8px; background: rgba(255, 255, 255, 0.08); border: 1px solid ${mainTheme.borderColor}; color: #f4f4f5; font-size: 12px; cursor: pointer; white-space: nowrap;">
                Custom Image
                <input id="agy-wp-upload" type="file" accept="image/*" style="display: none;" />
              </label>
              <button id="agy-export-btn" type="button" style="padding: 5px 10px; border-radius: 8px; background: rgba(255, 255, 255, 0.08); border: 1px solid rgba(255, 255, 255, 0.16); color: #f4f4f5; font-size: 12px; cursor: pointer; white-space: nowrap;">
                Export JSON
              </button>
              <button id="agy-import-toggle" type="button" style="padding: 5px 10px; border-radius: 8px; background: rgba(255, 255, 255, 0.08); border: 1px solid rgba(255, 255, 255, 0.16); color: #f4f4f5; font-size: 12px; cursor: pointer; white-space: nowrap;">
                Import JSON
              </button>
              <button id="agy-reset-btn" type="button" style="padding: 5px 10px; border-radius: 8px; background: rgba(239, 68, 68, 0.14); border: 1px solid rgba(239, 68, 68, 0.35); color: #fca5a5; font-size: 12px; cursor: pointer; white-space: nowrap;">
                Reset
              </button>
            </div>
          </div>
          <div id="agy-import-box" style="display: none; flex-direction: column; gap: 8px; padding-top: 8px; border-top: 1px solid rgba(255,255,255,0.08);">
            <textarea id="agy-import-text" rows="3" placeholder='Paste exported theme config JSON here (e.g. {"themeName":"WLOP Cosmic","dimming":45,...})' style="width: 100%; box-sizing: border-box; background: rgba(0,0,0,0.35); color: #f4f4f5; border: 1px solid ${mainTheme.borderColor}; border-radius: 8px; padding: 8px 10px; font-family: monospace; font-size: 12px; resize: vertical;"></textarea>
            <div style="display: flex; justify-content: flex-end; align-items: center; gap: 8px;">
              <span id="agy-import-msg" style="font-size: 12px; color: #fca5a5;"></span>
              <button id="agy-import-apply" type="button" style="padding: 5px 12px; border-radius: 7px; background: ${mainTheme.primary}; color: #090d16; font-weight: 600; font-size: 12px; border: none; cursor: pointer;">Apply JSON</button>
            </div>
          </div>
        </div>

        <div style="border: 1px solid ${mainTheme.borderColor}; background: ${mainTheme.cardBg || 'rgba(22, 16, 14, 0.72)'}; border-radius: 12px; padding: 14px 20px; margin-bottom: 24px; display: flex; flex-direction: column; gap: 10px;">
          <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px;">
            <div>
              <div style="font-size: 14px; font-weight: 600; color: #f4f4f5; margin-bottom: 2px;">Chat Avatars (User & AI Agent)</div>
              <div style="font-size: 12px; color: #a1a1aa;">Profile badges rendered beside chat messages (auto-compressed WebP).</div>
            </div>
            <div style="display: flex; align-items: center; gap: 16px; flex-wrap: wrap;">
              <div style="display: flex; align-items: center; gap: 8px;">
                <div id="agy-user-av-preview" style="width: 30px; height: 30px; border-radius: ${st.avatarRadius}%; border: 1.5px solid ${mainTheme.primary}; background: rgba(255,255,255,0.06) ${effUserAv ? `url('${effUserAv}') center/cover no-repeat` : ''}; display: flex; align-items: center; justify-content: center; font-size: 11px; color: #a1a1aa;">${effUserAv ? '' : 'U'}</div>
                <label style="padding: 4px 10px; border-radius: 7px; background: rgba(255, 255, 255, 0.08); border: 1px solid ${mainTheme.borderColor}; color: #f4f4f5; font-size: 12px; cursor: pointer; white-space: nowrap;">
                  User
                  <input id="agy-user-av-upload" type="file" accept="image/*" style="display: none;" />
                </label>
                <button id="agy-user-av-clear" type="button" style="padding: 4px 8px; border-radius: 7px; background: transparent; border: 1px solid rgba(255, 255, 255, 0.14); color: #a1a1aa; font-size: 11.5px; cursor: pointer;">Off</button>
              </div>
              <div style="display: flex; align-items: center; gap: 8px;">
                <div id="agy-agent-av-preview" style="width: 30px; height: 30px; border-radius: ${st.avatarRadius}%; border: 1.5px solid ${mainTheme.secondary || mainTheme.primary}; background: rgba(255,255,255,0.06) ${effAgentAv ? `url('${effAgentAv}') center/cover no-repeat` : ''}; display: flex; align-items: center; justify-content: center; font-size: 11px; color: #a1a1aa;">${effAgentAv ? '' : 'AI'}</div>
                <label style="padding: 4px 10px; border-radius: 7px; background: rgba(255, 255, 255, 0.08); border: 1px solid ${mainTheme.borderColor}; color: #f4f4f5; font-size: 12px; cursor: pointer; white-space: nowrap;">
                  Agent
                  <input id="agy-agent-av-upload" type="file" accept="image/*" style="display: none;" />
                </label>
                <button id="agy-agent-av-clear" type="button" style="padding: 4px 8px; border-radius: 7px; background: transparent; border: 1px solid rgba(255, 255, 255, 0.14); color: #a1a1aa; font-size: 11.5px; cursor: pointer;">Off</button>
              </div>
            </div>
          </div>
          <div style="display: flex; align-items: center; gap: 20px; flex-wrap: wrap; padding-top: 6px; border-top: 1px solid rgba(255,255,255,0.07);">
            <label style="display: flex; align-items: center; gap: 8px; font-size: 12px; color: #a1a1aa;">
              Size
              <input id="agy-av-size" type="range" min="22" max="52" value="${st.avatarSize}" style="width: 100px; cursor: pointer; accent-color: ${mainTheme.primary}; height: 5px;" />
              <span id="agy-av-size-val" style="min-width: 34px;">${st.avatarSize}px</span>
            </label>
            <label style="display: flex; align-items: center; gap: 8px; font-size: 12px; color: #a1a1aa;">
              Corner Radius
              <input id="agy-av-rad" type="range" min="0" max="50" value="${st.avatarRadius}" style="width: 100px; cursor: pointer; accent-color: ${mainTheme.primary}; height: 5px;" />
              <span id="agy-av-rad-val" style="min-width: 34px;">${st.avatarRadius}%</span>
            </label>
          </div>
        </div>

        <div style="margin-bottom: 28px;">
          <div style="font-size: 15px; font-weight: 600; color: #ffffff; margin-bottom: 4px;">User Chat Bubble</div>
          <div style="font-size: 12.5px; color: #a1a1aa; margin-bottom: 14px;">Mix and match bubble frame & ornament independently from the active wallpaper.</div>
          <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px;">
            ${THEME_KEYS.map(name => {
              const th = THEMES[name];
              const isSelected = name === st.bubbleName;
              const stickerTop = th.isOrnament ? Math.round((th.stickerTop || 0) * 0.85) : Math.round((th.stickerTop || 0) * 0.74);
              const stickerW = Math.round((th.stickerW || 0) * 0.78);
              const stickerH = th.isOrnament ? Math.round((th.stickerH || 0) * 0.8) : Math.round((th.stickerH || 0) * 0.78);
              return `
                <div class="agy-bubble-card" data-name="${name}" style="position: relative; border-radius: 12px; border: ${isSelected ? '1.5px solid #f4f4f5' : '1px solid rgba(255, 255, 255, 0.12)'}; background: ${isSelected ? 'rgba(42, 34, 30, 0.68)' : 'rgba(14, 12, 12, 0.78)'}; padding: 24px 18px 14px 18px; cursor: pointer; display: flex; flex-direction: column; justify-content: space-between; min-height: 112px; transition: border-color 0.15s ease, background-color 0.15s ease;">
                  <div style="display: flex; justify-content: center; align-items: center; width: 100%; margin-top: 6px; margin-bottom: 10px;">
                    <div style="position: relative; width: 192px; height: 46px; padding: 1.2px; border-radius: ${th.isScroll ? '6px' : '12px'}; background: ${th.frameBg}; box-shadow: 0 4px 14px rgba(0,0,0,0.45), 0 0 10px ${th.glow};">
                      <div style="position: relative; width: 100%; height: 100%; background: ${th.bg}; border: ${th.innerBorder || '1px solid ' + th.borderColor}; border-radius: ${th.isScroll ? '4px' : '11px'}; display: flex; align-items: center; padding: 0 16px;">
                        ${th.sticker ? `<div style="position: absolute; top: ${stickerTop}px; right: 8px; width: ${stickerW}px; height: ${stickerH}px; background-image: url('${th.sticker}'); background-size: contain; background-position: ${th.isOrnament ? 'center' : 'bottom center'}; background-repeat: no-repeat; pointer-events: none;"></div>` : ''}
                        <span style="font-size: 13.5px; font-weight: 500; color: ${th.textColor};">Hello ✨</span>
                      </div>
                    </div>
                  </div>
                  <div style="display: flex; justify-content: space-between; align-items: center;">
                    <span style="font-size: 13.5px; font-weight: 500; color: #e4e4e7;">${name}</span>
                    <div class="agy-card-check-slot">${isSelected ? CHECK_SVG : ''}</div>
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        </div>

        <div style="margin-bottom: 28px;">
          <div style="font-size: 15px; font-weight: 600; color: #ffffff; margin-bottom: 4px;">Composer Style</div>
          <div style="font-size: 12.5px; color: #a1a1aa; margin-bottom: 14px;">Customize the chat input frame without affecting keyboard shortcuts or attachments.</div>
          <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px;">
            ${Object.entries(INPUT_STYLES).map(([key, item]) => {
              const isSelected = key === st.inputStyle;
              const activeBubbleTh = THEMES[st.bubbleName] || mainTheme;
              const previewStickerStyle = activeBubbleTh.isOrnament
                ? 'top: -12px; right: 10px; width: 72px; height: 22px; background-position: center;'
                : 'top: -22px; right: 10px; width: 32px; height: 28px; background-position: bottom center;';
              const previewInnerBg = key === 'glass'
                ? (activeBubbleTh.inputGlassBg || 'rgba(20, 15, 13, 0.45)')
                : (activeBubbleTh.inputCardBg || 'rgba(26, 18, 15, 0.92)');
              return `
                <div class="agy-input-card" data-style="${key}" style="border-radius: 12px; border: ${isSelected ? '1.5px solid #f4f4f5' : '1px solid rgba(255, 255, 255, 0.12)'}; background: ${isSelected ? 'rgba(42, 34, 30, 0.68)' : 'rgba(14, 12, 12, 0.78)'}; padding: 16px 18px; cursor: pointer; display: flex; flex-direction: column; gap: 12px; transition: border-color 0.15s ease, background-color 0.15s ease;">
                  <div class="agy-input-preview-outer" style="position: relative; margin-top: 8px; padding: 1.5px; border-radius: 10px; background: ${key === 'double_gold' ? 'linear-gradient(135deg, #f59e0b, #fbbf24)' : activeBubbleTh.frameBg};">
                    <div class="agy-input-preview-sticker" style="position: absolute; ${previewStickerStyle} background-image: url('${activeBubbleTh.sticker || ''}'); background-size: contain; background-repeat: no-repeat; display: ${key !== 'minimal' && activeBubbleTh.sticker ? 'block' : 'none'}; pointer-events: none;"></div>
                    <div class="agy-input-preview-inner" style="background: ${previewInnerBg}; border-radius: 9px; padding: 8px 12px; font-size: 12px; color: #a1a1aa; display: flex; justify-content: space-between; align-items: center;">
                      <span>Ask anything, @ to mention...</span>
                      <span class="agy-input-preview-turbo" style="color: ${activeBubbleTh.primary}; font-size: 11px;">Send →</span>
                    </div>
                  </div>
                  <div style="display: flex; justify-content: space-between; align-items: center;">
                    <div>
                      <div style="font-size: 13.5px; font-weight: 500; color: #e4e4e7;">${item.label}</div>
                      <div style="font-size: 11.5px; color: #a1a1aa;">${item.desc}</div>
                    </div>
                    <div class="agy-card-check-slot">${isSelected ? CHECK_SVG : ''}</div>
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        </div>

        <div>
          <div style="font-size: 15px; font-weight: 600; color: #ffffff; margin-bottom: 4px;">Theme Presets (${THEME_KEYS.length})</div>
          <div style="font-size: 12.5px; color: #a1a1aa; margin-bottom: 14px;">Complete backdrop, palette, unified L-glass, and matching ornaments.</div>
          <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px;">
            ${THEME_KEYS.map(name => {
              const th = THEMES[name];
              const isSelected = name === st.themeName;
              const thumbBg = th.wallpaper
                ? `linear-gradient(180deg, rgba(0,0,0,0.15), rgba(14,12,12,0.85)), url('${th.wallpaper}')`
                : (th.pureBg || th.bg);
              const thumbOrnamentStyle = th.isOrnament
                ? 'right: 10px; bottom: 8px; width: 76px; height: 24px; background-position: center;'
                : 'right: 12px; bottom: 4px; width: 42px; height: 38px; background-position: bottom center;';
              return `
                <div class="agy-preset-card" data-name="${name}" style="border-radius: 12px; border: ${isSelected ? '1.5px solid #f4f4f5' : '1px solid rgba(255, 255, 255, 0.12)'}; background: rgba(14, 12, 12, 0.82); overflow: hidden; cursor: pointer; display: flex; flex-direction: column; transition: border-color 0.15s ease;">
                  <div style="height: 68px; width: 100%; background-image: ${thumbBg}; background-size: cover; background-position: ${th.bgPosition || 'center'}; position: relative; display: flex; align-items: flex-end; padding: 8px 14px;">
                    ${th.sticker ? `<div style="position: absolute; ${thumbOrnamentStyle} background-image: url('${th.sticker}'); background-size: contain; background-repeat: no-repeat; pointer-events: none;"></div>` : ''}
                    <span style="font-size: 13.5px; font-weight: 600; color: #fff;">${name}</span>
                  </div>
                  <div style="padding: 10px 14px; display: flex; justify-content: space-between; align-items: center;">
                    <span style="font-size: 12px; color: #a1a1aa;">${th.concept || ''}</span>
                    <div class="agy-card-check-slot">${isSelected ? CHECK_SVG : ''}</div>
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        </div>
      </div>
    `;

    function updateInputPreviews(bName) {
      const activeTh = THEMES[bName] || THEMES[DEFAULT_THEME_KEY];
      container.querySelectorAll('.agy-input-card').forEach(card => {
        const key = card.dataset.style;
        const outer = card.querySelector('.agy-input-preview-outer');
        if (outer) {
          outer.style.background = key === 'double_gold'
            ? 'linear-gradient(135deg, #f59e0b, #fbbf24)'
            : activeTh.frameBg;
        }
        const inner = card.querySelector('.agy-input-preview-inner');
        if (inner) {
          inner.style.background = key === 'glass'
            ? (activeTh.inputGlassBg || 'rgba(20, 15, 13, 0.45)')
            : (activeTh.inputCardBg || 'rgba(26, 18, 15, 0.92)');
        }
        const sticker = card.querySelector('.agy-input-preview-sticker');
        if (sticker) {
          if (key !== 'minimal' && activeTh.sticker) {
            sticker.style.display = 'block';
            sticker.style.backgroundImage = `url('${activeTh.sticker}')`;
            if (activeTh.isOrnament) {
              sticker.style.top = '-12px';
              sticker.style.width = '72px';
              sticker.style.height = '22px';
              sticker.style.backgroundPosition = 'center';
            } else {
              sticker.style.top = '-22px';
              sticker.style.width = '32px';
              sticker.style.height = '28px';
              sticker.style.backgroundPosition = 'bottom center';
            }
          } else {
            sticker.style.display = 'none';
          }
        }
        const turbo = card.querySelector('.agy-input-preview-turbo');
        if (turbo) {
          turbo.style.color = activeTh.primary;
        }
      });
    }

    const viewWe = container.querySelector('#agy-view-we');
    const viewStudio = container.querySelector('#agy-theme-scroll-container');
    const tabWeBtn = document.getElementById('agy-tab-we-btn');
    const tabStudioBtn = document.getElementById('agy-tab-studio-btn');

    function switchModalTab(tab) {
      const isWe = tab === 'we';
      if (viewWe) viewWe.style.display = isWe ? 'flex' : 'none';
      if (viewStudio) viewStudio.style.display = isWe ? 'none' : 'block';
      if (tabWeBtn) {
        tabWeBtn.style.background = isWe ? 'rgba(224, 142, 85, 0.24)' : 'transparent';
        tabWeBtn.style.color = isWe ? '#ffffff' : '#a1a1aa';
        tabWeBtn.style.fontWeight = isWe ? '600' : '500';
      }
      if (tabStudioBtn) {
        tabStudioBtn.style.background = !isWe ? 'rgba(224, 142, 85, 0.24)' : 'transparent';
        tabStudioBtn.style.color = !isWe ? '#ffffff' : '#a1a1aa';
        tabStudioBtn.style.fontWeight = !isWe ? '600' : '500';
      }
    }
    if (tabWeBtn) tabWeBtn.onclick = () => switchModalTab('we');
    if (tabStudioBtn) tabStudioBtn.onclick = () => switchModalTab('studio');
    switchModalTab('we');

    const slider = container.querySelector('#agy-dim-slider');
    const valLabel = container.querySelector('#agy-dim-val');
    const weDimSlider = container.querySelector('#agy-we-dim-slider');
    const weDimVal = container.querySelector('#agy-we-dim-val');
    function onDimInput(v) {
      if (slider) slider.value = v;
      if (valLabel) valLabel.textContent = v + '%';
      if (weDimSlider) weDimSlider.value = v;
      if (weDimVal) weDimVal.textContent = v + '%';
      applyTheme({ dimming: v });
    }
    if (slider) slider.addEventListener('input', (e) => onDimInput(parseInt(e.target.value, 10)));
    if (weDimSlider) weDimSlider.addEventListener('input', (e) => onDimInput(parseInt(e.target.value, 10)));

    const wpToggle = container.querySelector('#agy-wp-toggle');
    wpToggle.addEventListener('change', (e) => {
      applyTheme({ wpEnabled: e.target.checked });
    });

    const wpUpload = container.querySelector('#agy-wp-upload');
    wpUpload.addEventListener('change', (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      compressWallpaperFile(file, (dataUrl) => {
        applyTheme({ customWp: dataUrl, wpEnabled: true, liveWp: null });
        updateWeOffButton(null);
        renderWeCards(weSearch ? weSearch.value : '');
        const toggle = container.querySelector('#agy-wp-toggle');
        if (toggle) toggle.checked = true;
      });
    });

    const userAvUpload = container.querySelector('#agy-user-av-upload');
    const userAvPreview = container.querySelector('#agy-user-av-preview');
    const userAvClear = container.querySelector('#agy-user-av-clear');
    const agentAvUpload = container.querySelector('#agy-agent-av-upload');
    const agentAvPreview = container.querySelector('#agy-agent-av-preview');
    const agentAvClear = container.querySelector('#agy-agent-av-clear');

    function syncAvPreview(el, url, fallbackText) {
      if (!el) return;
      if (url) {
        el.style.backgroundImage = `url("${url}")`;
        el.style.backgroundSize = 'cover';
        el.style.backgroundPosition = 'center';
        el.textContent = '';
      } else {
        el.style.backgroundImage = 'none';
        el.textContent = fallbackText;
      }
    }

    if (userAvUpload) {
      userAvUpload.addEventListener('change', (e) => {
        const file = e.target.files && e.target.files[0];
        if (!file) return;
        compressAvatarFile(file, (dataUrl) => {
          applyTheme({ userAvatar: dataUrl });
          syncAvPreview(userAvPreview, dataUrl, 'U');
        });
      });
    }
    if (userAvClear) {
      userAvClear.addEventListener('click', () => {
        applyTheme({ userAvatar: 'none' });
        syncAvPreview(userAvPreview, '', 'U');
      });
    }
    if (agentAvUpload) {
      agentAvUpload.addEventListener('change', (e) => {
        const file = e.target.files && e.target.files[0];
        if (!file) return;
        compressAvatarFile(file, (dataUrl) => {
          applyTheme({ agentAvatar: dataUrl });
          syncAvPreview(agentAvPreview, dataUrl, 'AI');
        });
      });
    }
    if (agentAvClear) {
      agentAvClear.addEventListener('click', () => {
        applyTheme({ agentAvatar: 'none' });
        syncAvPreview(agentAvPreview, '', 'AI');
      });
    }

    const blurSlider = container.querySelector('#agy-blur-slider');
    const blurLabel = container.querySelector('#agy-blur-val');
    if (blurSlider) {
      blurSlider.addEventListener('input', (e) => {
        const v = parseInt(e.target.value, 10);
        if (blurLabel) blurLabel.textContent = v + 'px';
        applyTheme({ glassBlur: v });
      });
    }

    const avSizeSlider = container.querySelector('#agy-av-size');
    const avSizeVal = container.querySelector('#agy-av-size-val');
    if (avSizeSlider) {
      avSizeSlider.addEventListener('input', (e) => {
        const v = parseInt(e.target.value, 10);
        if (avSizeVal) avSizeVal.textContent = v + 'px';
        applyTheme({ avatarSize: v });
      });
    }

    const avRadSlider = container.querySelector('#agy-av-rad');
    const avRadVal = container.querySelector('#agy-av-rad-val');
    if (avRadSlider) {
      avRadSlider.addEventListener('input', (e) => {
        const v = parseInt(e.target.value, 10);
        if (avRadVal) avRadVal.textContent = v + '%';
        if (userAvPreview) userAvPreview.style.borderRadius = v + '%';
        if (agentAvPreview) agentAvPreview.style.borderRadius = v + '%';
        applyTheme({ avatarRadius: v });
      });
    }

    const exportBtn = container.querySelector('#agy-export-btn');
    const importToggle = container.querySelector('#agy-import-toggle');
    const importBox = container.querySelector('#agy-import-box');
    const importText = container.querySelector('#agy-import-text');
    const importApply = container.querySelector('#agy-import-apply');
    const importMsg = container.querySelector('#agy-import-msg');

    if (exportBtn) {
      exportBtn.addEventListener('click', () => {
        const json = JSON.stringify(getState(), null, 2);
        if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
          navigator.clipboard.writeText(json).then(() => {
            exportBtn.textContent = 'Copied ✓';
            setTimeout(() => { exportBtn.textContent = 'Export JSON'; }, 1500);
          }).catch(() => {
            if (importBox && importText) {
              importBox.style.display = 'flex';
              importText.value = json;
              importText.select();
            }
          });
        } else if (importBox && importText) {
          importBox.style.display = 'flex';
          importText.value = json;
          importText.select();
        }
      });
    }
    if (importToggle && importBox) {
      importToggle.addEventListener('click', () => {
        importBox.style.display = importBox.style.display === 'none' ? 'flex' : 'none';
        if (importMsg) importMsg.textContent = '';
      });
    }
    if (importApply && importText) {
      importApply.addEventListener('click', () => {
        try {
          const parsed = JSON.parse(importText.value.trim());
          if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
            throw new Error('Config must be a JSON object');
          }
          const allowed = {};
          const keys = ['themeName', 'bubbleName', 'inputStyle', 'dimming', 'wpEnabled', 'customWp', 'userAvatar', 'agentAvatar', 'glassBlur', 'avatarSize', 'avatarRadius', 'liveWp'];
          keys.forEach((k) => {
            if (parsed[k] !== undefined) allowed[k] = parsed[k];
          });
          applyTheme(allowed);
          renderThemePanels(container);
        } catch (err) {
          if (importMsg) importMsg.textContent = 'Invalid JSON: ' + err.message;
        }
      });
    }

    const resetBtn = container.querySelector('#agy-reset-btn');
    resetBtn.addEventListener('click', () => {
      localStorage.removeItem(STORAGE_CUSTOM_WP);
      localStorage.removeItem(STORAGE_USER_AVATAR);
      localStorage.removeItem(STORAGE_AGENT_AVATAR);
      localStorage.removeItem(STORAGE_GLASS_BLUR);
      localStorage.removeItem(STORAGE_AVATAR_SIZE);
      localStorage.removeItem(STORAGE_AVATAR_RADIUS);
      localStorage.removeItem(STORAGE_THEME);
      localStorage.removeItem(STORAGE_BUBBLE);
      localStorage.removeItem(STORAGE_INPUT);
      localStorage.removeItem(STORAGE_DIMMING);
      localStorage.removeItem(STORAGE_WP_ENABLED);
      localStorage.removeItem(STORAGE_LIVE_WP);
      applyTheme({
        themeName: DEFAULT_THEME_KEY,
        bubbleName: DEFAULT_THEME_KEY,
        inputStyle: 'sync',
        dimming: 69,
        wpEnabled: true,
        customWp: '',
        userAvatar: '',
        agentAvatar: '',
        glassBlur: 3,
        avatarSize: 32,
        avatarRadius: 50,
        liveWp: null
      });
      const defTh = THEMES[DEFAULT_THEME_KEY] || {};
      syncAvPreview(userAvPreview, defTh.userAvatar || '', 'U');
      syncAvPreview(agentAvPreview, defTh.agentAvatar || '', 'AI');
      if (userAvPreview) userAvPreview.style.borderRadius = '50%';
      if (agentAvPreview) agentAvPreview.style.borderRadius = '50%';
      if (slider) slider.value = 69;
      if (valLabel) valLabel.textContent = '69%';
      if (blurSlider) blurSlider.value = 3;
      if (blurLabel) blurLabel.textContent = '3px';
      if (avSizeSlider) avSizeSlider.value = 32;
      if (avSizeVal) avSizeVal.textContent = '32px';
      if (avRadSlider) avRadSlider.value = 50;
      if (avRadVal) avRadVal.textContent = '50%';
      if (wpToggle) wpToggle.checked = true;

      container.querySelectorAll('.agy-preset-card').forEach(c => {
        const isSel = c.dataset.name === DEFAULT_THEME_KEY;
        c.style.border = isSel ? '1.5px solid #f4f4f5' : '1px solid rgba(255, 255, 255, 0.12)';
        const slot = c.querySelector('.agy-card-check-slot');
        if (slot) slot.innerHTML = isSel ? CHECK_SVG : '';
      });
      container.querySelectorAll('.agy-bubble-card').forEach(b => {
        const isSel = b.dataset.name === DEFAULT_THEME_KEY;
        b.style.border = isSel ? '1.5px solid #f4f4f5' : '1px solid rgba(255, 255, 255, 0.12)';
        b.style.background = isSel ? 'rgba(42, 34, 30, 0.68)' : 'rgba(14, 12, 12, 0.78)';
        const slot = b.querySelector('.agy-card-check-slot');
        if (slot) slot.innerHTML = isSel ? CHECK_SVG : '';
      });
      container.querySelectorAll('.agy-input-card').forEach(c => {
        const isSel = c.dataset.style === 'sync';
        c.style.border = isSel ? '1.5px solid #f4f4f5' : '1px solid rgba(255, 255, 255, 0.12)';
        c.style.background = isSel ? 'rgba(42, 34, 30, 0.68)' : 'rgba(14, 12, 12, 0.78)';
        const slot = c.querySelector('.agy-card-check-slot');
        if (slot) slot.innerHTML = isSel ? CHECK_SVG : '';
      });
      updateInputPreviews(DEFAULT_THEME_KEY);
    });

    const weGrid = container.querySelector('#agy-we-grid');
    const weInspector = container.querySelector('#agy-we-inspector');
    const weStatus = container.querySelector('#agy-we-status');
    const weSearch = container.querySelector('#agy-we-search');
    const weSort = container.querySelector('#agy-we-sort');
    const weRefreshBtn = container.querySelector('#agy-we-refresh-btn');
    const weOffBtn = container.querySelector('#agy-we-off-btn');
    const wePauseBlurToggle = container.querySelector('#agy-we-pause-blur');
    const weAudioToggle = container.querySelector('#agy-we-audio');
    const weCatPills = container.querySelectorAll('.agy-we-cat-pill');
    let weAllItems = [];
    let weActiveCat = 'all';

    function renderWeInspector() {
      if (!weInspector) return;
      const curLive = getState().liveWp;
      if (!curLive || !curLive.id) {
        weInspector.innerHTML = `
          <div style="font-size: 14px; font-weight: 600; color: #f4f4f5;">Wallpaper Settings</div>
          <div style="font-size: 12px; color: #9ca3af; line-height: 1.55;">Chọn một hình nền bất kỳ ở danh sách bên trái để hiển thị bảng cấu hình Wallpaper Engine (Thu âm, Màu thanh Taskbar, Âm lượng, Tốc độ, Chuột song song, Căn chỉnh, Vị trí, Lật, Image filter, Tuỳ chỉnh màu & Thuộc tính riêng).</div>
        `;
        return;
      }

      const catalogItem = weAllItems.find(x => x.id === curLive.id) || curLive;
      const customProps = Array.isArray(catalogItem.customProps) ? catalogItem.customProps : [];
      const savedWe = (catalogItem.savedWeProps && typeof catalogItem.savedWeProps === 'object') ? catalogItem.savedWeProps : {};
      const prevUrl = catalogItem.previewFile ? buildMediaUrl(catalogItem.id, catalogItem.previewFile) : '';
      const cfg = (curLive.settings && typeof curLive.settings === 'object') ? curLive.settings : {};

      const audioRecording = cfg.audioRecording !== undefined
        ? Boolean(cfg.audioRecording)
        : (savedWe.audioprocessing !== undefined ? Boolean(savedWe.audioprocessing) : Boolean(catalogItem.supportsAudio));
      const schemeColor = cfg.schemeColor || catalogItem.schemeColor || '#19191d';
      const volume = cfg.volume !== undefined ? Number(cfg.volume) : 0;
      const speed = cfg.speed !== undefined ? Number(cfg.speed) : 100;
      const mouseParallax = cfg.mouseParallax !== undefined ? Boolean(cfg.mouseParallax) : true;
      const fit = cfg.fit || 'cover';
      const posX = cfg.posX !== undefined ? Number(cfg.posX) : 50;
      const posY = cfg.posY !== undefined ? Number(cfg.posY) : 50;
      const flip = Boolean(cfg.flip);
      const imageFilter = cfg.imageFilter || 'none';
      const showColor = Boolean(cfg.showColor);
      const brs = cfg.brightness !== undefined ? Number(cfg.brightness) : 100;
      const con = cfg.contrast !== undefined ? Number(cfg.contrast) : 100;
      const sat = cfg.saturate !== undefined ? Number(cfg.saturate) : 100;
      const hue = cfg.hue !== undefined ? Number(cfg.hue) : 0;
      const customValues = (cfg.customValues && typeof cfg.customValues === 'object') ? cfg.customValues : {};

      const typeLabel = catalogItem.category === 'scene' || catalogItem.category === 'scene-video'
        ? 'Scene'
        : (catalogItem.type === 'video' ? 'Video' : 'Web');
      const resLabel = catalogItem.resolution || '3840 x 2160 - 4K';
      const sizeLabel = catalogItem.sizeMb || '17 MB';
      const authorName = catalogItem.author || 'Workshop Creator';
      const subCount = catalogItem.subCount || 120;
      const tags = Array.isArray(catalogItem.tags) && catalogItem.tags.length
        ? catalogItem.tags
        : [typeLabel, 'G - All ages', ...(customProps.length ? ['Customizable'] : [])];

      let favMap = {};
      try {
        favMap = JSON.parse(localStorage.getItem('agy_we_favs_v1') || '{}') || {};
      } catch (e) {}
      const isFav = Boolean(favMap[catalogItem.id]);

      const weBlue = '#2b7de9';

      weInspector.innerHTML = `
        <style>
          #agy-we-inspector::-webkit-scrollbar { width: 5px; }
          #agy-we-inspector::-webkit-scrollbar-track { background: #16171a; }
          #agy-we-inspector::-webkit-scrollbar-thumb { background: #2b7de9; border-radius: 9999px; }
          #agy-we-inspector .we-row { display: flex; justify-content: space-between; align-items: center; min-height: 28px; gap: 8px; font-size: 12.5px; color: #d8dade; }
          #agy-we-inspector .we-lbl { display: flex; align-items: center; gap: 9px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
          #agy-we-inspector .we-ico { width: 15px; text-align: center; color: #c4c7ce; font-size: 13px; flex-shrink: 0; }
          #agy-we-inspector .we-chk { width: 17px; height: 17px; accent-color: ${weBlue}; cursor: pointer; border-radius: 4px; flex-shrink: 0; }
          #agy-we-inspector .we-rng-wrap { display: flex; align-items: center; gap: 8px; width: 150px; flex-shrink: 0; }
          #agy-we-inspector .we-rng { flex: 1; height: 4px; accent-color: ${weBlue}; cursor: pointer; }
          #agy-we-inspector .we-num { width: 28px; text-align: right; font-size: 12px; color: #e4e6eb; font-variant-numeric: tabular-nums; }
          #agy-we-inspector .we-sel { width: 146px; background: #2b2d33; border: 1px solid rgba(255,255,255,0.12); border-radius: 4px; padding: 4px 8px; color: #e4e6eb; font-size: 12px; outline: none; cursor: pointer; }
        </style>

        <div style="position: relative; height: 162px; width: 100%; border-radius: 6px; overflow: hidden; background: #141519 ${prevUrl ? `url('${prevUrl}') center/cover no-repeat` : ''}; flex-shrink: 0;">
          <div style="position: absolute; inset: 0; background: linear-gradient(180deg, rgba(28,29,33,0) 55%, rgba(28,29,33,0.92) 100%);"></div>
        </div>

        <div style="margin-top: -6px; display: flex; flex-direction: column; gap: 7px;">
          <div style="font-size: 15.5px; font-weight: 600; color: #ffffff; line-height: 1.3; word-break: break-word;">${escapeHtml(catalogItem.title)}</div>

          <div style="display: flex; justify-content: space-between; align-items: center; gap: 8px;">
            <div style="display: flex; align-items: center; gap: 7px; min-width: 0;">
              <div style="width: 22px; height: 22px; border-radius: 50%; background: #2b2d33 ${prevUrl ? `url('${prevUrl}') center/cover no-repeat` : ''}; border: 1px solid rgba(255,255,255,0.2); flex-shrink: 0;"></div>
              <span style="font-size: 13px; color: #3b82f6; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${escapeHtml(authorName)}</span>
            </div>
            <span style="padding: 2px 9px; border-radius: 9999px; background: #2b2d33; color: #d8dade; font-size: 11.5px; font-weight: 500; flex-shrink: 0;">👥 ${subCount}</span>
          </div>

          <div style="display: flex; align-items: center; gap: 6px; font-size: 12px; color: #c4c7ce;">
            <span style="color: #4ade80;">🏆</span>
            <span>${escapeHtml(typeLabel)} &middot; ${escapeHtml(resLabel)} &middot; ${escapeHtml(sizeLabel)}</span>
          </div>

          <div style="display: flex; flex-wrap: wrap; gap: 5px; margin-top: 1px;">
            ${tags.map(tg => `<span style="padding: 2.5px 9px; border-radius: 9999px; background: #2b2d33; color: #c4c7ce; font-size: 11.5px;">${escapeHtml(tg)}</span>`).join('')}
          </div>

          <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 2px;">
            <div style="color: ${weBlue}; font-size: 16px; letter-spacing: 5px; user-select: none;">★★★★★</div>
            <button id="agy-insp-fav-btn" type="button" title="Yêu thích" style="width: 34px; height: 26px; border-radius: 4px; border: none; background: #2b2d33; color: ${isFav ? '#ef4444' : '#ffffff'}; font-size: 13px; cursor: pointer; display: flex; align-items: center; justify-content: center;">♥</button>
          </div>

          <div style="display: flex; align-items: center; gap: 5px; position: relative;">
            <button type="button" style="flex: 1; height: 28px; border-radius: 4px; border: none; background: #2b2d33; color: #e4e6eb; font-size: 12px; font-weight: 500; display: flex; align-items: center; justify-content: center; gap: 5px; cursor: default;">✓ Subscribed</button>
            <button id="agy-insp-steam-btn" type="button" title="Mở trong Steam Workshop" style="width: 32px; height: 28px; border-radius: 4px; border: none; background: #2b2d33; color: #e4e6eb; font-size: 13px; cursor: pointer; display: flex; align-items: center; justify-content: center;">❂</button>
            <button id="agy-insp-menu-btn" type="button" title="Tuỳ chọn thư mục Workshop" style="width: 32px; height: 28px; border-radius: 4px; border: none; background: #2b2d33; color: #e4e6eb; font-size: 13px; cursor: pointer; display: flex; align-items: center; justify-content: center;">☰</button>
            <div id="agy-insp-ctx-menu" style="display: none; position: absolute; right: 0; top: 32px; z-index: 20; background: #25272c; border: 1px solid rgba(255,255,255,0.15); border-radius: 6px; padding: 4px; box-shadow: 0 8px 24px rgba(0,0,0,0.65); min-width: 175px; flex-direction: column; gap: 2px;">
              <button id="agy-insp-open-dir" type="button" style="text-align: left; padding: 6px 10px; border: none; border-radius: 4px; background: transparent; color: #e4e6eb; font-size: 12px; cursor: pointer;">📂 Mở thư mục trong Explorer</button>
              <button id="agy-insp-copy-id" type="button" style="text-align: left; padding: 6px 10px; border: none; border-radius: 4px; background: transparent; color: #e4e6eb; font-size: 12px; cursor: pointer;">📋 Copy Workshop ID (${escapeHtml(catalogItem.id)})</button>
            </div>
          </div>
        </div>

        <div style="display: flex; align-items: center; gap: 8px; margin-top: 6px;">
          <span style="font-size: 13px; font-weight: 500; color: #e4e6eb; white-space: nowrap;">Wallpaper Settings</span>
          <div style="flex: 1; height: 1px; background: #26436c;"></div>
          <button id="agy-insp-reset" type="button" style="padding: 3px 9px; border-radius: 4px; background: #2b2d33; border: none; color: #e4e6eb; font-size: 11.5px; cursor: pointer; display: flex; align-items: center; gap: 4px; white-space: nowrap;">↻ Mặc định</button>
        </div>

        <div style="display: flex; flex-direction: column; gap: 8px;">
          <label class="we-row" style="cursor: pointer;">
            <span class="we-lbl"><span class="we-ico">🎙</span><span>Thu âm</span></span>
            <input id="agy-insp-audiorec" class="we-chk" type="checkbox" ${audioRecording ? 'checked' : ''} />
          </label>

          <label class="we-row" style="cursor: pointer;">
            <span class="we-lbl"><span class="we-ico">🎨</span><span>Màu thanh Taskbar</span></span>
            <input id="agy-insp-schemecolor" type="color" value="${escapeHtml(schemeColor)}" style="width: 38px; height: 22px; padding: 0; border: 1px solid rgba(255,255,255,0.22); border-radius: 4px; background: #141519; cursor: pointer;" />
          </label>

          <div class="we-row">
            <span class="we-lbl"><span class="we-ico">🔊</span><span>Âm lượng</span></span>
            <div class="we-rng-wrap">
              <input id="agy-insp-vol" class="we-rng" type="range" min="0" max="100" value="${volume}" />
              <span id="agy-insp-vol-val" class="we-num">${volume}</span>
            </div>
          </div>

          <div class="we-row">
            <span class="we-lbl"><span class="we-ico">▶</span><span>Tốc độ</span></span>
            <div class="we-rng-wrap">
              <input id="agy-insp-speed" class="we-rng" type="range" min="10" max="200" value="${speed}" />
              <span id="agy-insp-speed-val" class="we-num">${speed}</span>
            </div>
          </div>

          <label class="we-row" style="cursor: pointer;">
            <span class="we-lbl"><span class="we-ico">🖱</span><span>Chuột song song</span></span>
            <input id="agy-insp-parallax" class="we-chk" type="checkbox" ${mouseParallax ? 'checked' : ''} />
          </label>

          <div class="we-row">
            <span class="we-lbl"><span class="we-ico">🖼</span><span>Căn chỉnh</span></span>
            <select id="agy-insp-fit" class="we-sel">
              <option value="cover" ${fit === 'cover' ? 'selected' : ''}>Cover</option>
              <option value="none" ${fit === 'none' ? 'selected' : ''}>Center</option>
              <option value="contain" ${fit === 'contain' ? 'selected' : ''}>Fill (Contain)</option>
              <option value="fill" ${fit === 'fill' ? 'selected' : ''}>Stretch</option>
              <option value="free" ${fit === 'free' ? 'selected' : ''}>Free</option>
            </select>
          </div>

          <div class="we-row">
            <span class="we-lbl"><span class="we-ico">↔</span><span>Vị trí</span></span>
            <div class="we-rng-wrap">
              <input id="agy-insp-posx" class="we-rng" type="range" min="0" max="100" value="${posX}" />
              <span id="agy-insp-posx-val" class="we-num">${posX}</span>
            </div>
          </div>

          <div id="agy-insp-posy-row" class="we-row" style="display: ${fit === 'free' ? 'flex' : 'none'};">
            <span class="we-lbl"><span class="we-ico">↕</span><span>Vị trí dọc</span></span>
            <div class="we-rng-wrap">
              <input id="agy-insp-posy" class="we-rng" type="range" min="0" max="100" value="${posY}" />
              <span id="agy-insp-posy-val" class="we-num">${posY}</span>
            </div>
          </div>

          <label class="we-row" style="cursor: pointer;">
            <span class="we-lbl"><span class="we-ico">⇄</span><span>Lật</span></span>
            <input id="agy-insp-flip" class="we-chk" type="checkbox" ${flip ? 'checked' : ''} />
          </label>

          <div class="we-row">
            <span class="we-lbl"><span class="we-ico">🫧</span><span>Image filter</span></span>
            <select id="agy-insp-imgfilter" class="we-sel">
              <option value="none" ${imageFilter === 'none' ? 'selected' : ''}>None</option>
              <option value="pixelate" ${imageFilter === 'pixelate' ? 'selected' : ''}>Pixelate</option>
              <option value="bilinear" ${imageFilter === 'bilinear' ? 'selected' : ''}>Bilinear</option>
              <option value="sepia" ${imageFilter === 'sepia' ? 'selected' : ''}>Sepia</option>
              <option value="grayscale" ${imageFilter === 'grayscale' ? 'selected' : ''}>Grayscale</option>
              <option value="invert" ${imageFilter === 'invert' ? 'selected' : ''}>Invert</option>
              <option value="crt" ${imageFilter === 'crt' ? 'selected' : ''}>CRT Boost</option>
            </select>
          </div>

          <label class="we-row" style="cursor: pointer;">
            <span class="we-lbl"><span>Hiển thị tuỳ chỉnh màu</span></span>
            <input id="agy-insp-color-toggle" class="we-chk" type="checkbox" ${showColor ? 'checked' : ''} />
          </label>

          <div id="agy-insp-color-box" style="display: ${showColor ? 'flex' : 'none'}; flex-direction: column; gap: 7px; padding: 8px 10px; border-radius: 6px; background: #151619; border: 1px solid rgba(255,255,255,0.07);">
            <div class="we-row">
              <span class="we-lbl"><span class="we-ico">☀</span><span>Độ sáng</span></span>
              <div class="we-rng-wrap">
                <input id="agy-insp-brs" class="we-rng" type="range" min="50" max="150" value="${brs}" />
                <span id="agy-insp-brs-val" class="we-num">${brs}</span>
              </div>
            </div>
            <div class="we-row">
              <span class="we-lbl"><span class="we-ico">◑</span><span>Độ tương phản</span></span>
              <div class="we-rng-wrap">
                <input id="agy-insp-con" class="we-rng" type="range" min="50" max="150" value="${con}" />
                <span id="agy-insp-con-val" class="we-num">${con}</span>
              </div>
            </div>
            <div class="we-row">
              <span class="we-lbl"><span class="we-ico">💧</span><span>Độ bão hoà</span></span>
              <div class="we-rng-wrap">
                <input id="agy-insp-sat" class="we-rng" type="range" min="0" max="200" value="${sat}" />
                <span id="agy-insp-sat-val" class="we-num">${sat}</span>
              </div>
            </div>
            <div class="we-row">
              <span class="we-lbl"><span class="we-ico">🌈</span><span>Đổi tông màu</span></span>
              <div class="we-rng-wrap">
                <input id="agy-insp-hue" class="we-rng" type="range" min="0" max="360" value="${hue}" />
                <span id="agy-insp-hue-val" class="we-num">${hue}</span>
              </div>
            </div>
          </div>
        </div>

        ${customProps.length ? `
          <div style="height: 1px; background: #26436c; margin: 4px 0;"></div>
          <div style="display: flex; flex-direction: column; gap: 8px;">
            ${customProps.map(p => {
              const curVal = customValues[p.key] !== undefined
                ? customValues[p.key]
                : (savedWe[p.key] !== undefined ? savedWe[p.key] : p.value);
              if (p.type === 'bool') {
                return `
                  <label class="we-row" style="cursor: pointer;">
                    <span class="we-lbl" title="${escapeHtml(p.text)}">${escapeHtml(p.text)}</span>
                    <input class="agy-insp-cprop we-chk" data-key="${escapeHtml(p.key)}" data-type="bool" type="checkbox" ${curVal ? 'checked' : ''} />
                  </label>
                `;
              }
              if (p.type === 'slider') {
                const numV = Number(curVal) || 0;
                return `
                  <div class="we-row">
                    <span class="we-lbl" title="${escapeHtml(p.text)}">${escapeHtml(p.text)}</span>
                    <div class="we-rng-wrap">
                      <input class="agy-insp-cprop we-rng" data-key="${escapeHtml(p.key)}" data-type="slider" type="range" min="${p.min}" max="${p.max}" step="${p.step}" value="${numV}" />
                      <span class="we-num">${numV}</span>
                    </div>
                  </div>
                `;
              }
              if (p.type === 'color') {
                const hexV = String(curVal || '#2b7de9').startsWith('#') ? curVal : '#2b7de9';
                return `
                  <label class="we-row" style="cursor: pointer;">
                    <span class="we-lbl" title="${escapeHtml(p.text)}">${escapeHtml(p.text)}</span>
                    <input class="agy-insp-cprop" data-key="${escapeHtml(p.key)}" data-type="color" type="color" value="${escapeHtml(hexV)}" style="width: 38px; height: 22px; padding: 0; border: 1px solid rgba(255,255,255,0.22); border-radius: 4px; background: #141519; cursor: pointer;" />
                  </label>
                `;
              }
              if (p.type === 'combo' && p.options.length) {
                return `
                  <div class="we-row">
                    <span class="we-lbl" title="${escapeHtml(p.text)}">${escapeHtml(p.text)}</span>
                    <select class="agy-insp-cprop we-sel" data-key="${escapeHtml(p.key)}" data-type="combo">
                      ${p.options.map(opt => `<option value="${escapeHtml(opt.value)}" ${String(curVal) === String(opt.value) ? 'selected' : ''}>${escapeHtml(opt.label || opt.value)}</option>`).join('')}
                    </select>
                  </div>
                `;
              }
              return '';
            }).join('')}
          </div>
        ` : ''}

        <div style="display: flex; align-items: center; gap: 8px; margin-top: 6px;">
          <span style="font-size: 13px; font-weight: 500; color: #e4e6eb; white-space: nowrap;">Presets</span>
          <div style="flex: 1; height: 1px; background: #26436c;"></div>
        </div>
        <div style="display: flex; align-items: center; gap: 6px;">
          <button id="agy-insp-preset-load" type="button" style="flex: 1; height: 28px; border-radius: 4px; border: none; background: #2b2d33; color: #e4e6eb; font-size: 12px; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 5px;">📁 Tải</button>
          <button id="agy-insp-preset-save" type="button" style="flex: 1; height: 28px; border-radius: 4px; border: none; background: #2b2d33; color: #e4e6eb; font-size: 12px; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 5px;">💾 Lưu</button>
        </div>
      `;

      function patchLiveSettings(patch, rebuildScene = false) {
        const latest = getState().liveWp;
        if (!latest) return;
        const nextSettings = { ...(latest.settings || {}), ...patch };
        const nextLive = { ...catalogItem, ...latest, settings: nextSettings };
        if (!rebuildScene) {
          const layer = document.getElementById('agy-live-wp-layer');
          if (layer) {
            const isDx11 = nextLive.category === 'scene' || nextLive.type === 'image';
            const mUrl = buildMediaUrl(nextLive.id, nextLive.relFile);
            const dxObj = { ...(nextSettings.customValues || {}) };
            if (nextSettings.audioRecording !== undefined) dxObj.__audioprocessing = Boolean(nextSettings.audioRecording);
            if (nextSettings.schemeColor) dxObj.__schemecolor = String(nextSettings.schemeColor);
            layer.dataset.mediaKey = `${nextLive.category || nextLive.type}|${nextLive.id}|${mUrl}|${isDx11 ? JSON.stringify(dxObj) : ''}`;
          }
        }
        applyTheme({ liveWp: nextLive });
      }

      const favBtn = weInspector.querySelector('#agy-insp-fav-btn');
      if (favBtn) {
        favBtn.addEventListener('click', () => {
          try {
            const m = JSON.parse(localStorage.getItem('agy_we_favs_v1') || '{}') || {};
            m[catalogItem.id] = !m[catalogItem.id];
            localStorage.setItem('agy_we_favs_v1', JSON.stringify(m));
            favBtn.style.color = m[catalogItem.id] ? '#ef4444' : '#ffffff';
          } catch (e) {}
        });
      }

      const steamBtn = weInspector.querySelector('#agy-insp-steam-btn');
      if (steamBtn) {
        steamBtn.addEventListener('click', () => {
          window.open(`steam://url/CommunityFilePage/${encodeURIComponent(catalogItem.id)}`, '_self');
        });
      }

      const menuBtn = weInspector.querySelector('#agy-insp-menu-btn');
      const ctxMenu = weInspector.querySelector('#agy-insp-ctx-menu');
      if (menuBtn && ctxMenu) {
        menuBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          ctxMenu.style.display = ctxMenu.style.display === 'none' ? 'flex' : 'none';
        });
      }
      const openDirBtn = weInspector.querySelector('#agy-insp-open-dir');
      if (openDirBtn) {
        openDirBtn.addEventListener('click', () => {
          const base = window.__AGY_MEDIA_BASE__ || '';
          if (base) fetch(`${base}/api/we/open-folder?id=${encodeURIComponent(catalogItem.id)}`).catch(() => {});
          if (ctxMenu) ctxMenu.style.display = 'none';
        });
      }
      const copyIdBtn = weInspector.querySelector('#agy-insp-copy-id');
      if (copyIdBtn) {
        copyIdBtn.addEventListener('click', () => {
          if (navigator.clipboard) navigator.clipboard.writeText(catalogItem.id).catch(() => {});
          if (ctxMenu) ctxMenu.style.display = 'none';
        });
      }

      const resetInsp = weInspector.querySelector('#agy-insp-reset');
      if (resetInsp) {
        resetInsp.addEventListener('click', () => {
          const latest = getState().liveWp;
          if (!latest) return;
          const resetVals = {};
          customProps.forEach(p => { resetVals[p.key] = p.value; });
          applyTheme({
            liveWp: {
              ...catalogItem,
              settings: {
                audioRecording: Boolean(catalogItem.supportsAudio),
                schemeColor: catalogItem.schemeColor || '#19191d',
                customValues: resetVals
              }
            }
          });
          renderWeInspector();
        });
      }

      const audioRecEl = weInspector.querySelector('#agy-insp-audiorec');
      if (audioRecEl) {
        audioRecEl.addEventListener('change', (e) => {
          patchLiveSettings({ audioRecording: e.target.checked }, true);
        });
      }

      const schemeColEl = weInspector.querySelector('#agy-insp-schemecolor');
      if (schemeColEl) {
        schemeColEl.addEventListener('change', (e) => {
          patchLiveSettings({ schemeColor: e.target.value }, true);
        });
      }

      const volEl = weInspector.querySelector('#agy-insp-vol');
      const volVal = weInspector.querySelector('#agy-insp-vol-val');
      if (volEl) {
        volEl.addEventListener('input', (e) => {
          const v = parseInt(e.target.value, 10);
          if (volVal) volVal.textContent = String(v);
          if (v > 0 && !getState().liveAudio) {
            if (weAudioToggle) weAudioToggle.checked = true;
            applyTheme({ liveAudio: true });
          }
          patchLiveSettings({ volume: v }, false);
        });
      }

      const spEl = weInspector.querySelector('#agy-insp-speed');
      const spVal = weInspector.querySelector('#agy-insp-speed-val');
      if (spEl) {
        spEl.addEventListener('input', (e) => {
          const v = parseInt(e.target.value, 10);
          if (spVal) spVal.textContent = String(v);
          patchLiveSettings({ speed: v }, false);
        });
      }

      const parEl = weInspector.querySelector('#agy-insp-parallax');
      if (parEl) {
        parEl.addEventListener('change', (e) => {
          patchLiveSettings({ mouseParallax: e.target.checked }, false);
        });
      }

      const fitEl = weInspector.querySelector('#agy-insp-fit');
      const posyRow = weInspector.querySelector('#agy-insp-posy-row');
      if (fitEl) {
        fitEl.addEventListener('change', (e) => {
          const val = e.target.value;
          if (posyRow) posyRow.style.display = val === 'free' ? 'flex' : 'none';
          patchLiveSettings({ fit: val === 'free' ? 'cover' : val }, false);
        });
      }

      const pxEl = weInspector.querySelector('#agy-insp-posx');
      const pxVal = weInspector.querySelector('#agy-insp-posx-val');
      if (pxEl) {
        pxEl.addEventListener('input', (e) => {
          const v = parseInt(e.target.value, 10);
          if (pxVal) pxVal.textContent = String(v);
          patchLiveSettings({ posX: v }, false);
        });
      }

      const pyEl = weInspector.querySelector('#agy-insp-posy');
      const pyVal = weInspector.querySelector('#agy-insp-posy-val');
      if (pyEl) {
        pyEl.addEventListener('input', (e) => {
          const v = parseInt(e.target.value, 10);
          if (pyVal) pyVal.textContent = String(v);
          patchLiveSettings({ posY: v }, false);
        });
      }

      const flipEl = weInspector.querySelector('#agy-insp-flip');
      if (flipEl) {
        flipEl.addEventListener('change', (e) => patchLiveSettings({ flip: e.target.checked }, false));
      }

      const imgFilterEl = weInspector.querySelector('#agy-insp-imgfilter');
      if (imgFilterEl) {
        imgFilterEl.addEventListener('change', (e) => patchLiveSettings({ imageFilter: e.target.value }, false));
      }

      const colTog = weInspector.querySelector('#agy-insp-color-toggle');
      const colBox = weInspector.querySelector('#agy-insp-color-box');
      if (colTog && colBox) {
        colTog.addEventListener('change', (e) => {
          colBox.style.display = e.target.checked ? 'flex' : 'none';
          patchLiveSettings({ showColor: e.target.checked }, false);
        });
      }

      ['brs', 'con', 'sat', 'hue'].forEach(k => {
        const mapKey = { brs: 'brightness', con: 'contrast', sat: 'saturate', hue: 'hue' }[k];
        const el = weInspector.querySelector('#agy-insp-' + k);
        const valSpan = weInspector.querySelector('#agy-insp-' + k + '-val');
        if (el) {
          el.addEventListener('input', (e) => {
            const v = parseInt(e.target.value, 10);
            if (valSpan) valSpan.textContent = String(v);
            patchLiveSettings({ [mapKey]: v }, false);
          });
        }
      });

      weInspector.querySelectorAll('.agy-insp-cprop').forEach(el => {
        const pType = el.dataset.type;
        if (pType === 'slider') {
          el.addEventListener('input', () => {
            const numSpan = el.parentElement && el.parentElement.querySelector('.we-num');
            if (numSpan) numSpan.textContent = String(el.value);
          });
        }
        el.addEventListener('change', () => {
          const key = el.dataset.key;
          const val = pType === 'bool' ? el.checked : (pType === 'slider' ? Number(el.value) : el.value);
          const latest = getState().liveWp;
          const prevCustom = (latest && latest.settings && latest.settings.customValues) || {};
          patchLiveSettings({ customValues: { ...prevCustom, [key]: val } }, true);
        });
      });

      const presetSaveBtn = weInspector.querySelector('#agy-insp-preset-save');
      const presetLoadBtn = weInspector.querySelector('#agy-insp-preset-load');
      if (presetSaveBtn) {
        presetSaveBtn.addEventListener('click', () => {
          try {
            const latest = getState().liveWp;
            if (!latest) return;
            const map = JSON.parse(localStorage.getItem('agy_we_presets_v1') || '{}') || {};
            map[catalogItem.id] = latest.settings || {};
            localStorage.setItem('agy_we_presets_v1', JSON.stringify(map));
            presetSaveBtn.textContent = '✓ Đã lưu';
            setTimeout(() => { presetSaveBtn.textContent = '💾 Lưu'; }, 1200);
          } catch (e) {}
        });
      }
      if (presetLoadBtn) {
        presetLoadBtn.addEventListener('click', () => {
          try {
            const map = JSON.parse(localStorage.getItem('agy_we_presets_v1') || '{}') || {};
            const savedCfg = map[catalogItem.id];
            if (savedCfg) {
              applyTheme({ liveWp: { ...catalogItem, settings: savedCfg } });
              renderWeInspector();
            } else {
              presetLoadBtn.textContent = 'Chưa có';
              setTimeout(() => { presetLoadBtn.textContent = '📁 Tải'; }, 1200);
            }
          } catch (e) {}
        });
      }
    }

    if (wePauseBlurToggle) {
      wePauseBlurToggle.addEventListener('change', (e) => {
        applyTheme({ livePauseBlur: e.target.checked });
      });
    }
    if (weAudioToggle) {
      weAudioToggle.addEventListener('change', (e) => {
        applyTheme({ liveAudio: e.target.checked });
      });
    }

    function escapeHtml(str) {
      return String(str || '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
    }

    function updateWeOffButton(activeLive) {
      if (!weOffBtn) return;
      weOffBtn.textContent = activeLive ? 'Stop Live' : 'Static Mode';
      weOffBtn.style.background = activeLive ? 'rgba(239, 68, 68, 0.16)' : 'rgba(255,255,255,0.08)';
      weOffBtn.style.borderColor = activeLive ? 'rgba(239, 68, 68, 0.4)' : 'rgba(255,255,255,0.16)';
      weOffBtn.style.color = activeLive ? '#fca5a5' : '#d4d4d8';
    }

    function updateCatPillCounts() {
      const nAll = weAllItems.length;
      const nVid = weAllItems.filter(x => x.type === 'video').length;
      const nScene = weAllItems.filter(x => x.category === 'scene').length;
      const nWeb = weAllItems.filter(x => x.type === 'web').length;
      const labels = { all: `All (${nAll})`, video: `Video 60fps (${nVid})`, scene: `Scene 4K (${nScene})`, web: `Web (${nWeb})` };
      weCatPills.forEach(p => {
        const c = p.dataset.cat;
        if (labels[c]) p.textContent = labels[c];
        const isSel = c === weActiveCat;
        p.style.border = isSel ? '1px solid #f4f4f5' : '1px solid rgba(255,255,255,0.14)';
        p.style.background = isSel ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.05)';
        p.style.color = isSel ? '#ffffff' : '#d4d4d8';
        p.style.fontWeight = isSel ? '600' : '400';
      });
    }

    weCatPills.forEach(pill => {
      pill.addEventListener('click', () => {
        weActiveCat = pill.dataset.cat || 'all';
        updateCatPillCounts();
        renderWeCards(weSearch ? weSearch.value : '');
      });
    });

    if (weSort) {
      weSort.addEventListener('change', () => renderWeCards(weSearch ? weSearch.value : ''));
    }

    function renderWeCards(filterText) {
      if (!weGrid) return;
      const curLive = getState().liveWp;
      const q = String(filterText || '').trim().toLowerCase();
      let list = weAllItems.filter(it => {
        if (weActiveCat === 'video' && it.type !== 'video') return false;
        if (weActiveCat === 'scene' && it.category !== 'scene') return false;
        if (weActiveCat === 'web' && it.type !== 'web') return false;
        if (q && !it.title.toLowerCase().includes(q) && !it.id.includes(q) && !String(it.category || it.type).includes(q)) return false;
        return true;
      });

      const sortMode = weSort ? weSort.value : 'newest';
      list = list.slice().sort((a, b) => {
        if (sortMode === 'title') return a.title.localeCompare(b.title);
        return (b.mtimeMs || 0) - (a.mtimeMs || 0);
      });

      if (!list.length) {
        weGrid.innerHTML = `<div style="grid-column: 1 / -1; padding: 32px; font-size: 13px; color: #a1a1aa; border: 1px dashed rgba(255,255,255,0.14); border-radius: 12px; text-align: center;">No matching wallpapers found in this category.</div>`;
        return;
      }
      weGrid.innerHTML = list.map(it => {
        const isSel = Boolean(curLive && curLive.id === it.id);
        const prevUrl = it.previewFile ? buildMediaUrl(it.id, it.previewFile) : '';
        let badgeText = 'VIDEO';
        let badgeBg = 'rgba(56, 189, 248, 0.32)';
        let badgeColor = '#7dd3fc';
        if (it.category === 'scene-video') {
          badgeText = 'SCENE 60FPS';
          badgeBg = 'rgba(16, 185, 129, 0.34)';
          badgeColor = '#6ee7b7';
        } else if (it.category === 'scene') {
          badgeText = 'SCENE 4K';
          badgeBg = 'rgba(245, 158, 11, 0.32)';
          badgeColor = '#fcd34d';
        } else if (it.type === 'web') {
          badgeText = 'WEB';
          badgeBg = 'rgba(168, 85, 247, 0.32)';
          badgeColor = '#d8b4fe';
        }
        return `
          <div class="agy-we-card" data-we-id="${escapeHtml(it.id)}" style="border-radius: 11px; border: ${isSel ? '2px solid #fbbf24' : '1px solid rgba(255, 255, 255, 0.12)'}; background: rgba(14, 12, 12, 0.88); overflow: hidden; cursor: pointer; display: flex; flex-direction: column; box-shadow: ${isSel ? '0 0 16px rgba(251, 191, 36, 0.35)' : '0 4px 12px rgba(0,0,0,0.35)'}; transition: transform 0.14s ease, border-color 0.15s ease;">
            <div style="height: 124px; width: 100%; position: relative; background: #141418 ${prevUrl ? `url('${prevUrl}') center/cover no-repeat` : ''};">
              <div style="position: absolute; inset: 0; background: linear-gradient(180deg, rgba(0,0,0,0.05) 0%, rgba(10,10,14,0.78) 100%);"></div>
              <span style="position: absolute; top: 7px; left: 7px; font-size: 10px; font-weight: 700; letter-spacing: 0.3px; padding: 2px 7px; border-radius: 9999px; background: ${badgeBg}; color: ${badgeColor}; border: 1px solid rgba(255,255,255,0.16); backdrop-filter: none;">${badgeText}</span>
              <div class="agy-we-check-slot" style="position: absolute; top: 7px; right: 7px;">${isSel ? CHECK_SVG : ''}</div>
            </div>
            <div style="padding: 9px 11px; font-size: 12.5px; font-weight: 500; color: #f4f4f5; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${escapeHtml(it.title)}">${escapeHtml(it.title)}</div>
          </div>
        `;
      }).join('');

      weGrid.querySelectorAll('.agy-we-card').forEach(card => {
        card.addEventListener('click', () => {
          const id = card.dataset.weId;
          const item = weAllItems.find(x => x.id === id);
          if (!item) return;
          applyTheme({ liveWp: item, wpEnabled: true });
          updateWeOffButton(item);
          if (wpToggle) wpToggle.checked = true;
          renderWeCards(weSearch ? weSearch.value : '');
          renderWeInspector();
        });
      });
      renderWeInspector();
    }

    if (weOffBtn) {
      weOffBtn.addEventListener('click', () => {
        applyTheme({ liveWp: null });
        updateWeOffButton(null);
        renderWeCards(weSearch ? weSearch.value : '');
      });
    }
    if (weSearch) {
      weSearch.addEventListener('input', () => renderWeCards(weSearch.value));
    }

    const mediaBase = window.__AGY_MEDIA_BASE__ || '';
    function loadWeList(force = false) {
      if (!mediaBase || !weGrid) {
        if (weStatus) weStatus.textContent = 'Restart theme daemon to enable local Wallpaper Engine media server.';
        return;
      }
      if (weStatus) weStatus.textContent = 'Scanning Wallpaper Engine folder...';
      fetch(`${mediaBase}/api/we/list?${force ? 'refresh=1&' : ''}_t=${Date.now()}`)
        .then(r => r.json())
        .then(data => {
          weAllItems = Array.isArray(data.items) ? data.items : [];
          updateCatPillCounts();
          if (weStatus) {
            weStatus.textContent = weAllItems.length
              ? `${weAllItems.length} Workshop wallpapers ready`
              : (data.workshopDir ? 'No items found in Workshop directory.' : 'Workshop directory not detected.');
          }
          renderWeCards(weSearch ? weSearch.value : '');
        })
        .catch(() => {
          if (weStatus) weStatus.textContent = 'Could not reach local Wallpaper Engine media server.';
        });
    }
    if (weRefreshBtn) {
      weRefreshBtn.addEventListener('click', () => loadWeList(true));
    }
    loadWeList(false);

    container.querySelectorAll('.agy-preset-card').forEach(card => {
      card.addEventListener('click', () => {
        const name = card.dataset.name;
        applyTheme({ themeName: name, bubbleName: name, customWp: '', liveWp: null });
        updateWeOffButton(null);
        renderWeCards(weSearch ? weSearch.value : '');

        container.querySelectorAll('.agy-preset-card').forEach(c => {
          const isSel = c.dataset.name === name;
          c.style.border = isSel ? '1.5px solid #f4f4f5' : '1px solid rgba(255, 255, 255, 0.12)';
          const slot = c.querySelector('.agy-card-check-slot');
          if (slot) slot.innerHTML = isSel ? CHECK_SVG : '';
        });

        container.querySelectorAll('.agy-bubble-card').forEach(b => {
          const isSel = b.dataset.name === name;
          b.style.border = isSel ? '1.5px solid #f4f4f5' : '1px solid rgba(255, 255, 255, 0.12)';
          b.style.background = isSel ? 'rgba(42, 34, 30, 0.68)' : 'rgba(14, 12, 12, 0.78)';
          const slot = b.querySelector('.agy-card-check-slot');
          if (slot) slot.innerHTML = isSel ? CHECK_SVG : '';
        });

        updateInputPreviews(name);
      });
    });

    container.querySelectorAll('.agy-bubble-card').forEach(card => {
      card.addEventListener('click', () => {
        const name = card.dataset.name;
        applyTheme({ bubbleName: name });

        container.querySelectorAll('.agy-bubble-card').forEach(b => {
          const isSel = b.dataset.name === name;
          b.style.border = isSel ? '1.5px solid #f4f4f5' : '1px solid rgba(255, 255, 255, 0.12)';
          b.style.background = isSel ? 'rgba(42, 34, 30, 0.68)' : 'rgba(14, 12, 12, 0.78)';
          const slot = b.querySelector('.agy-card-check-slot');
          if (slot) slot.innerHTML = isSel ? CHECK_SVG : '';
        });

        updateInputPreviews(name);
      });
    });

    container.querySelectorAll('.agy-input-card').forEach(card => {
      card.addEventListener('click', () => {
        const styleKey = card.dataset.style;
        applyTheme({ inputStyle: styleKey });

        container.querySelectorAll('.agy-input-card').forEach(c => {
          const isSel = c.dataset.style === styleKey;
          c.style.border = isSel ? '1.5px solid #f4f4f5' : '1px solid rgba(255, 255, 255, 0.12)';
          c.style.background = isSel ? 'rgba(42, 34, 30, 0.68)' : 'rgba(14, 12, 12, 0.78)';
          const slot = c.querySelector('.agy-card-check-slot');
          if (slot) slot.innerHTML = isSel ? CHECK_SVG : '';
        });
      });
    });
  }

  function injectMainSidebarButton() {
    if (document.getElementById('agy-custom-theme-sidebar-btn')) return;

    const splitLeft = document.querySelector('[data-testid="sidebar-split"]')?.firstElementChild;
    const candidates = [splitLeft, ...Array.from(document.querySelectorAll('.bg-sidebar'))].filter(Boolean);
    let customSpan = null;
    for (const root of candidates) {
      const spans = Array.from(root.querySelectorAll('span'));
      customSpan = spans.find(s => s.textContent?.trim() === 'Customizations');
      if (customSpan) break;
    }
    if (!customSpan) return;

    const row = customSpan.closest('a, button, div[role="button"], .group\\/headerbtn') || customSpan.parentElement;
    if (!row || !row.parentNode) return;

    const btn = document.createElement('button');
    btn.id = 'agy-custom-theme-sidebar-btn';
    btn.type = 'button';
    btn.className = 'w-full flex items-center gap-2.5 px-3 py-1.5 text-sm font-medium text-muted-foreground hover:text-foreground rounded-lg transition-colors cursor-pointer select-none';
    btn.style.cssText = 'text-align: left;';
    btn.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/></svg>
      <span style="flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">Custom theme</span>
    `;

    row.parentNode.insertBefore(btn, row.nextSibling);

    btn.addEventListener('click', (e) => {
      e.preventDefault();
      window.__ANTIGRAVITY_OPEN_THEME_MODAL__();
    });
  }

  function injectSettingsModalButton() {
    const modal = document.querySelector('.settings-modal-container');
    if (!modal || document.getElementById('agy-custom-theme-settings-btn')) return;

    const headers = Array.from(modal.querySelectorAll('h2, h3'));
    const appearanceHeader = headers.find(h => h.textContent?.trim() === 'Appearance');
    if (!appearanceHeader) return;

    let targetContainer = appearanceHeader.parentElement;
    while (targetContainer && !targetContainer.className.includes('justify-between') && targetContainer !== modal) {
      targetContainer = targetContainer.parentElement;
    }

    if (!targetContainer || !targetContainer.parentNode) return;

    Array.from(targetContainer.parentNode.children).forEach(child => {
      if (child.id === 'agy-custom-theme-settings-btn') child.remove();
    });

    const btn = document.createElement('button');
    btn.id = 'agy-custom-theme-settings-btn';
    btn.type = 'button';
    btn.className = 'select-none rounded px-3 py-1.5 text-sm font-medium transition-colors cursor-pointer text-white';
    btn.style.cssText = 'background: linear-gradient(135deg, #e08e55 0%, #b45309 100%); border: 1px solid rgba(251, 191, 36, 0.4); box-shadow: 0 2px 10px rgba(224, 142, 85, 0.3); margin-top: 8px; margin-bottom: 8px; display: inline-flex; align-items: center; gap: 6px;';
    btn.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/></svg>
      <span>Open Custom Theme Studio</span>
    `;

    targetContainer.parentNode.insertBefore(btn, targetContainer.nextSibling);

    btn.addEventListener('click', () => {
      window.__ANTIGRAVITY_OPEN_THEME_MODAL__();
    });
  }

  function hookSidebarScroll() {
    if (!window.__AGY_SCROLL_AC__) return;
    const scrollers = document.querySelectorAll('.agy-shell .bg-sidebar .overflow-y-auto');
    scrollers.forEach(sc => {
      if (sc.dataset.agyScrollBound) return;
      sc.dataset.agyScrollBound = '1';
      const sync = () => sc.classList.toggle('agy-scrolled', sc.scrollTop > 2);
      sync();
      sc.addEventListener('scroll', sync, { passive: true, signal: window.__AGY_SCROLL_AC__.signal });
    });
  }

  function syncShellMetrics() {
    const shell = document.querySelector('.agy-shell');
    if (!shell) return;
    const split = shell.querySelector('[data-testid="sidebar-split"]');
    const sidebarPane = split ? split.firstElementChild : null;
    const titleBar = shell.querySelector('[class*="@container/titlebar"]');
    const sw = sidebarPane ? Math.round(sidebarPane.getBoundingClientRect().width) : 0;
    const shellRect = shell.getBoundingClientRect();
    const hdrBottom = titleBar ? Math.round(titleBar.getBoundingClientRect().bottom - shellRect.top) : 35;
    shell.style.setProperty('--agy-sidebar-w', sw + 'px');
    shell.style.setProperty('--agy-hdr-h', hdrBottom + 'px');

    const hasHoleAttr = document.body.getAttribute('data-has-browser-hole') === 'true';
    const holeEl = hasHoleAttr ? shell.querySelector('[data-browser-hole]:not([data-browser-hole="false"])') : null;
    if (holeEl) {
      if (window.__AGY_SHELL_RO__ && window.__AGY_HOLE_EL__ !== holeEl) {
        try { window.__AGY_SHELL_RO__.observe(holeEl); } catch (e) {}
        window.__AGY_HOLE_EL__ = holeEl;
      }
      const hRect = holeEl.getBoundingClientRect();
      if (hRect.width > 1 && hRect.height > 1) {
        const l = Math.max(0, Math.round(hRect.left - shellRect.left));
        const t = Math.max(0, Math.round(hRect.top - shellRect.top));
        const r = Math.max(l, Math.round(hRect.right - shellRect.left));
        const b = Math.max(t, Math.round(hRect.bottom - shellRect.top));
        shell.style.setProperty(
          '--agy-hole-clip',
          `polygon(evenodd, 0 0, 100% 0, 100% 100%, 0 100%, 0 0, ${l}px ${t}px, ${r}px ${t}px, ${r}px ${b}px, ${l}px ${b}px, ${l}px ${t}px)`
        );
        shell.dataset.agyHoleActive = '1';
        delete shell.dataset.agySideGlass;
        return;
      }
    }
    window.__AGY_HOLE_EL__ = null;
    delete shell.dataset.agyHoleActive;
    shell.style.removeProperty('--agy-hole-clip');

    const sideBody = shell.querySelector('[data-side-panel-body="true"]');
    if (sideBody) {
      if (window.__AGY_SHELL_RO__ && window.__AGY_SIDE_EL__ !== sideBody) {
        try { window.__AGY_SHELL_RO__.observe(sideBody); } catch (e) {}
        window.__AGY_SIDE_EL__ = sideBody;
      }
      const sRect = sideBody.getBoundingClientRect();
      const hasContent = sideBody.children.length > 0;
      if (hasContent && sRect.width > 24 && sRect.height > 24 && sRect.left < shellRect.right - 8 && sRect.right > shellRect.left + 8) {
        const sl = Math.max(sw, Math.round(sRect.left - shellRect.left));
        const st = Math.max(hdrBottom, Math.round(sRect.top - shellRect.top));
        const sr = Math.min(Math.round(shellRect.width), Math.max(sl, Math.round(sRect.right - shellRect.left)));
        const sb = Math.min(Math.round(shellRect.height), Math.max(st, Math.round(sRect.bottom - shellRect.top)));
        if (sr - sl > 20 && sb - st > 20) {
          shell.style.setProperty('--agy-side-l', sl + 'px');
          shell.style.setProperty('--agy-side-t', st + 'px');
          shell.style.setProperty('--agy-side-r', sr + 'px');
          shell.style.setProperty('--agy-side-b', sb + 'px');
          shell.dataset.agySideGlass = '1';
          return;
        }
      }
    }
    delete shell.dataset.agySideGlass;
  }

  function hookShellMetrics() {
    const shell = document.querySelector('.agy-shell');
    if (!shell) return;
    let needsMeasure = false;
    if (!shell.dataset.agyTboMounted) {
      shell.dataset.agyTboMounted = '1';
      scheduleTitleBarSync();
      needsMeasure = true;
    }
    if (!window.__AGY_SHELL_RO__ && typeof ResizeObserver !== 'undefined') {
      const ro = new ResizeObserver(syncShellMetrics);
      ro.observe(shell);
      const sidebarPane = shell.querySelector('[data-testid="sidebar-split"]')?.firstElementChild;
      if (sidebarPane) ro.observe(sidebarPane);
      window.__AGY_SHELL_RO__ = ro;
      needsMeasure = true;
    }
    const hasHoleAttr = document.body.getAttribute('data-has-browser-hole') === 'true';
    const holeEl = hasHoleAttr ? shell.querySelector('[data-browser-hole]:not([data-browser-hole="false"])') : null;
    const sideBody = shell.querySelector('[data-side-panel-body="true"]');
    const sideCount = sideBody ? sideBody.children.length : 0;
    if (window.__AGY_HOLE_EL__ !== holeEl || window.__AGY_SIDE_EL__ !== sideBody || window.__AGY_SIDE_COUNT__ !== sideCount) {
      window.__AGY_SIDE_COUNT__ = sideCount;
      needsMeasure = true;
    }
    if (needsMeasure) {
      syncShellMetrics();
    }
  }

  function tick() {
    injectMainSidebarButton();
    injectSettingsModalButton();
    hookSidebarScroll();
    hookShellMetrics();
    const st = getState();
    if (st.wpEnabled && st.liveWp && st.liveWp.id && !document.getElementById('agy-live-wp-layer')) {
      applyTheme();
    }
  }

  function scheduleTick() {
    if (window.__AGY_TICK_TIMER__) return;
    window.__AGY_TICK_TIMER__ = setTimeout(() => {
      window.__AGY_TICK_TIMER__ = 0;
      tick();
    }, 180);
  }

  clearTitleBarTimers();
  if (window.__AGY_TICK_RAF__) {
    cancelAnimationFrame(window.__AGY_TICK_RAF__);
    window.__AGY_TICK_RAF__ = 0;
  }
  if (window.__AGY_TICK_TIMER__) {
    clearTimeout(window.__AGY_TICK_TIMER__);
    window.__AGY_TICK_TIMER__ = 0;
  }
  if (window.__AGY_SHELL_RO__) {
    try { window.__AGY_SHELL_RO__.disconnect(); } catch (e) {}
    window.__AGY_SHELL_RO__ = null;
  }
  if (window.__AGY_SCROLL_AC__) {
    try { window.__AGY_SCROLL_AC__.abort(); } catch (e) {}
  }
  window.__AGY_SCROLL_AC__ = new AbortController();
  window.addEventListener('keydown', (e) => {
    if (e.altKey && e.shiftKey && String(e.key).toLowerCase() === 't') {
      e.preventDefault();
      const bd = document.getElementById('agy-custom-theme-modal-backdrop');
      if (bd && bd.style.display !== 'none') bd.style.display = 'none';
      else window.__ANTIGRAVITY_OPEN_THEME_MODAL__();
    }
  }, { signal: window.__AGY_SCROLL_AC__.signal });
  window.addEventListener('load', () => scheduleTitleBarSync(), { signal: window.__AGY_SCROLL_AC__.signal });
  function syncVideoPlaybackState() {
    const st = getState();
    const shouldPause = document.hidden || (st.livePauseBlur && !document.hasFocus());
    if (window.__AGY_SCENE_ENGINE__) {
      if (shouldPause) window.__AGY_SCENE_ENGINE__.pause();
      else window.__AGY_SCENE_ENGINE__.resume();
    }
    const vid = document.getElementById('agy-live-wp-video');
    if (!vid) return;
    if (shouldPause && !vid.paused) {
      try { vid.pause(); } catch (e) {}
    } else if (!shouldPause && vid.paused) {
      const p = vid.play();
      if (p && typeof p.catch === 'function') p.catch(() => {});
    }
  }
  window.addEventListener('focus', () => {
    syncTitleBarOverlay();
    syncVideoPlaybackState();
  }, { signal: window.__AGY_SCROLL_AC__.signal });
  window.addEventListener('blur', () => {
    syncVideoPlaybackState();
  }, { signal: window.__AGY_SCROLL_AC__.signal });
  document.addEventListener('visibilitychange', () => {
    syncVideoPlaybackState();
    if (!document.hidden) syncTitleBarOverlay();
  }, { signal: window.__AGY_SCROLL_AC__.signal });
  document.querySelectorAll('[data-agy-scroll-bound]').forEach(el => delete el.dataset.agyScrollBound);
  document.querySelectorAll('[data-agy-tbo-mounted]').forEach(el => delete el.dataset.agyTboMounted);
  const staleBackdrop = document.getElementById('agy-custom-theme-modal-backdrop');
  const wasModalOpen = Boolean(staleBackdrop && staleBackdrop.style.display !== 'none');
  if (staleBackdrop) staleBackdrop.remove();
  const staleSidebarBtn = document.getElementById('agy-custom-theme-sidebar-btn');
  if (staleSidebarBtn) staleSidebarBtn.remove();
  const staleSettingsBtn = document.getElementById('agy-custom-theme-settings-btn');
  if (staleSettingsBtn) staleSettingsBtn.remove();

  window.__AGY_HOLE_EL__ = null;
  if (window.__AGY_MODAL_OBSERVER__) {
    window.__AGY_MODAL_OBSERVER__.disconnect();
  }
  window.__AGY_MODAL_OBSERVER__ = new MutationObserver(scheduleTick);
  window.__AGY_MODAL_OBSERVER__.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['data-has-browser-hole', 'data-browser-hole']
  });
  tick();
  if (wasModalOpen) {
    openCustomThemeModal();
  }

  return 'Antigravity Custom Theme Engine Ready!';
})();
