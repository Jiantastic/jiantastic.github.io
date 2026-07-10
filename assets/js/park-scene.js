// Progressive WebGL hero: a real photo is always present in CSS; WebGL adds
// low-cost depth, pointer parallax, water movement, and atmospheric shading.
const canvas = document.getElementById("park-canvas");
const hero = canvas?.closest(".home-hero");

if (canvas && hero) {
  const gl = canvas.getContext("webgl", {
    alpha: true,
    antialias: false,
    depth: false,
    powerPreference: "low-power",
  });

  const vertexSource = `
    attribute vec2 a_position;
    attribute vec2 a_uv;
    varying vec2 v_uv;

    void main() {
      v_uv = a_uv;
      gl_Position = vec4(a_position, 0.0, 1.0);
    }
  `;

  const fragmentSource = `
    precision mediump float;
    uniform sampler2D u_photo;
    uniform vec2 u_pointer;
    uniform vec2 u_resolution;
    uniform float u_image_aspect;
    uniform float u_focus_x;
    uniform float u_time;
    varying vec2 v_uv;

    vec2 coverUv(vec2 screenUv) {
      float canvasAspect = u_resolution.x / max(u_resolution.y, 1.0);
      vec2 uv = screenUv;
      if (canvasAspect > u_image_aspect) {
        float visibleHeight = u_image_aspect / canvasAspect;
        uv.y = (uv.y - 0.5) * visibleHeight + 0.5;
      } else {
        float visibleWidth = canvasAspect / u_image_aspect;
        uv.x = (uv.x - 0.5) * visibleWidth + u_focus_x;
      }
      return uv;
    }

    void main() {
      vec2 uv = coverUv(v_uv);
      uv = (uv - 0.5) * 0.965 + 0.5;

      // Foreground shifts most, mountains least: a readable 2.5D depth cue.
      float foreground = pow(1.0 - v_uv.y, 2.1);
      float midground = smoothstep(0.18, 0.68, 1.0 - v_uv.y);
      uv += u_pointer * (0.007 + foreground * 0.028 + midground * 0.006);

      // Only the lake region receives a minute animated refraction.
      float waterX = smoothstep(0.40, 0.62, v_uv.x);
      float waterY = smoothstep(0.14, 0.27, v_uv.y) * (1.0 - smoothstep(0.55, 0.68, v_uv.y));
      float waterMask = waterX * waterY;
      uv.x += sin(u_time * 0.75 + uv.y * 90.0) * 0.0007 * waterMask;
      uv.y += sin(u_time * 0.52 + uv.x * 72.0) * 0.00045 * waterMask;

      vec3 color = texture2D(u_photo, clamp(uv, 0.001, 0.999)).rgb;

      // Naturalistic depth haze and a subtle optical vignette.
      float distanceHaze = smoothstep(0.56, 1.0, v_uv.y) * 0.09;
      color = mix(color, vec3(0.70, 0.79, 0.80), distanceHaze);
      float edge = smoothstep(0.92, 0.28, distance(v_uv, vec2(0.5)));
      color *= mix(0.88, 1.03, edge);
      gl_FragColor = vec4(color, 1.0);
    }
  `;

  function compile(type, source) {
    const shader = gl?.createShader(type);
    if (!shader) return null;
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      gl.deleteShader(shader);
      return null;
    }
    return shader;
  }

  if (gl) {
    const vertexShader = compile(gl.VERTEX_SHADER, vertexSource);
    const fragmentShader = compile(gl.FRAGMENT_SHADER, fragmentSource);
    const program = gl.createProgram();

    if (vertexShader && fragmentShader && program) {
      gl.attachShader(program, vertexShader);
      gl.attachShader(program, fragmentShader);
      gl.linkProgram(program);

      if (gl.getProgramParameter(program, gl.LINK_STATUS)) {
        const geometry = new Float32Array([
          -1, -1, 0, 0,
           1, -1, 1, 0,
          -1,  1, 0, 1,
          -1,  1, 0, 1,
           1, -1, 1, 0,
           1,  1, 1, 1,
        ]);
        const buffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
        gl.bufferData(gl.ARRAY_BUFFER, geometry, gl.STATIC_DRAW);
        gl.useProgram(program);

        const stride = 4 * Float32Array.BYTES_PER_ELEMENT;
        const positionLocation = gl.getAttribLocation(program, "a_position");
        const uvLocation = gl.getAttribLocation(program, "a_uv");
        gl.enableVertexAttribArray(positionLocation);
        gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, stride, 0);
        gl.enableVertexAttribArray(uvLocation);
        gl.vertexAttribPointer(uvLocation, 2, gl.FLOAT, false, stride, 2 * Float32Array.BYTES_PER_ELEMENT);

        const pointerLocation = gl.getUniformLocation(program, "u_pointer");
        const resolutionLocation = gl.getUniformLocation(program, "u_resolution");
        const imageAspectLocation = gl.getUniformLocation(program, "u_image_aspect");
        const focusLocation = gl.getUniformLocation(program, "u_focus_x");
        const timeLocation = gl.getUniformLocation(program, "u_time");
        const texture = gl.createTexture();
        const photo = new Image();
        const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
        const coarsePointer = window.matchMedia("(pointer: coarse)");
        const pointer = { x: 0, y: 0, targetX: 0, targetY: 0 };
        let visible = !document.hidden;
        let animationFrame = 0;
        let lastFrameAt = 0;

        function resize() {
          const ratio = Math.min(window.devicePixelRatio || 1, 1.5);
          const width = Math.max(1, Math.round(canvas.clientWidth * ratio));
          const height = Math.max(1, Math.round(canvas.clientHeight * ratio));
          if (canvas.width !== width || canvas.height !== height) {
            canvas.width = width;
            canvas.height = height;
          }
          gl.viewport(0, 0, width, height);
          gl.uniform2f(resolutionLocation, width, height);
          gl.uniform1f(focusLocation, width / height < 0.8 ? 0.57 : 0.5);
        }

        function draw(timestamp = 0) {
          if (!visible) return;
          if (!reducedMotion.matches && timestamp - lastFrameAt < 32) {
            animationFrame = requestAnimationFrame(draw);
            return;
          }
          lastFrameAt = timestamp;
          resize();
          pointer.x += (pointer.targetX - pointer.x) * 0.075;
          pointer.y += (pointer.targetY - pointer.y) * 0.075;
          hero.style.setProperty("--look-x", `${(-pointer.x * 10).toFixed(2)}px`);
          hero.style.setProperty("--look-y", `${(pointer.y * 8).toFixed(2)}px`);
          hero.style.setProperty("--badge-x", `${(pointer.x * 17).toFixed(2)}px`);
          hero.style.setProperty("--badge-y", `${(-pointer.y * 13).toFixed(2)}px`);
          gl.uniform2f(pointerLocation, pointer.x, pointer.y);
          gl.uniform1f(timeLocation, reducedMotion.matches ? 0 : timestamp / 1000);
          gl.drawArrays(gl.TRIANGLES, 0, 6);
          if (!reducedMotion.matches) animationFrame = requestAnimationFrame(draw);
        }

        photo.decoding = "async";
        photo.src = "/images/national-park-hero.webp";
        photo.addEventListener("load", () => {
          gl.bindTexture(gl.TEXTURE_2D, texture);
          gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
          gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, photo);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
          gl.uniform1f(imageAspectLocation, photo.naturalWidth / photo.naturalHeight);
          draw();
          document.documentElement.classList.add("has-webgl");
        }, { once: true });

        hero.addEventListener("pointermove", (event) => {
          const bounds = hero.getBoundingClientRect();
          const strength = event.pointerType === "touch" ? 0.55 : 1.2;
          pointer.targetX = ((event.clientX - bounds.left) / bounds.width - 0.5) * strength;
          if (event.pointerType !== "touch") {
            pointer.targetY = (0.5 - (event.clientY - bounds.top) / bounds.height) * 0.9;
          }
          hero.classList.add("is-looking");
        }, { passive: true });
        hero.addEventListener("pointerleave", () => {
          if (coarsePointer.matches) return;
          pointer.targetX = 0;
          pointer.targetY = 0;
        });

        function updateScrollLook() {
          if (!coarsePointer.matches || reducedMotion.matches) return;
          const bounds = hero.getBoundingClientRect();
          const travel = bounds.height + window.innerHeight;
          const progress = Math.min(1, Math.max(0, (window.innerHeight - bounds.top) / travel));
          pointer.targetY = (0.5 - progress) * 0.42;
          pointer.targetX = Math.sin(progress * Math.PI * 1.5) * 0.14;
        }
        updateScrollLook();
        window.addEventListener("scroll", updateScrollLook, { passive: true });

        document.addEventListener("visibilitychange", () => {
          visible = !document.hidden;
          cancelAnimationFrame(animationFrame);
          if (visible) animationFrame = requestAnimationFrame(draw);
        });

        canvas.addEventListener("webglcontextlost", (event) => {
          event.preventDefault();
          document.documentElement.classList.remove("has-webgl");
          cancelAnimationFrame(animationFrame);
        });
      }
    }
  }
}
