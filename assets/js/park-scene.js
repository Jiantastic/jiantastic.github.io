const canvas = document.getElementById("park-canvas");

if (canvas) {
  const gl = canvas.getContext("webgl", {
    alpha: true,
    antialias: false,
    powerPreference: "low-power",
  });

  if (gl) {
    const vertexSource = `
      attribute vec3 a_position;
      attribute vec3 a_color;
      uniform vec2 u_shift;
      uniform float u_aspect;
      varying vec3 v_color;
      varying float v_depth;

      void main() {
        float depth = clamp((-a_position.z) / 16.0, 0.0, 1.0);
        float perspective = 1.0 / (1.0 + (-a_position.z) * 0.035);
        vec2 position = a_position.xy;
        position.x += u_shift.x * (1.0 - depth) * 0.75;
        position.y += u_shift.y * (1.0 - depth) * 0.35;
        position.x = position.x * perspective / u_aspect;
        position.y = position.y * perspective;
        gl_Position = vec4(position.x, position.y, depth * 2.0 - 1.0, 1.0);
        v_color = a_color;
        v_depth = depth;
      }
    `;

    const fragmentSource = `
      precision mediump float;
      varying vec3 v_color;
      varying float v_depth;

      void main() {
        vec3 haze = vec3(0.59, 0.73, 0.69);
        float fog = smoothstep(0.38, 1.0, v_depth) * 0.48;
        gl_FragColor = vec4(mix(v_color, haze, fog), 1.0);
      }
    `;

    function shader(type, source) {
      const result = gl.createShader(type);
      gl.shaderSource(result, source);
      gl.compileShader(result);
      if (!gl.getShaderParameter(result, gl.COMPILE_STATUS)) {
        gl.deleteShader(result);
        return null;
      }
      return result;
    }

    const vertexShader = shader(gl.VERTEX_SHADER, vertexSource);
    const fragmentShader = shader(gl.FRAGMENT_SHADER, fragmentSource);
    const program = gl.createProgram();

    if (vertexShader && fragmentShader) {
      gl.attachShader(program, vertexShader);
      gl.attachShader(program, fragmentShader);
      gl.linkProgram(program);

      if (gl.getProgramParameter(program, gl.LINK_STATUS)) {
        const vertices = [];

        function triangle(points, color) {
          for (const [x, y, z] of points) vertices.push(x, y, z, ...color);
        }

        function quad(a, b, c, d, color) {
          triangle([a, b, c], color);
          triangle([a, c, d], color);
        }

        // Mountain ridgelines, ordered back to front.
        const ridges = [
          { z: -15, base: -0.62, color: [0.42, 0.54, 0.46], peaks: [[-1.4, 0.2], [-0.85, 0.5], [-0.25, 0.02], [0.28, 0.64], [0.88, 0.08], [1.35, 0.38]] },
          { z: -10, base: -0.72, color: [0.25, 0.39, 0.29], peaks: [[-1.4, -0.05], [-0.95, 0.46], [-0.45, -0.03], [0.05, 0.35], [0.48, -0.1], [0.96, 0.28], [1.4, -0.02]] },
          { z: -5, base: -0.86, color: [0.10, 0.25, 0.17], peaks: [[-1.45, -0.22], [-1.05, 0.12], [-0.65, -0.12], [-0.18, 0.18], [0.22, -0.12], [0.72, 0.16], [1.45, -0.18]] },
        ];

        for (const ridge of ridges) {
          const points = ridge.peaks;
          for (let i = 0; i < points.length - 1; i++) {
            triangle([
              [points[i][0], ridge.base, ridge.z],
              [points[i][0], points[i][1], ridge.z],
              [points[i + 1][0], points[i + 1][1], ridge.z],
            ], ridge.color);
            triangle([
              [points[i][0], ridge.base, ridge.z],
              [points[i + 1][0], points[i + 1][1], ridge.z],
              [points[i + 1][0], ridge.base, ridge.z],
            ], ridge.color);
          }
        }

        // Valley floor and a strip of glacial water.
        quad([-1.5, -0.62, -7], [1.5, -0.62, -7], [1.5, -1.2, 1], [-1.5, -1.2, 1], [0.12, 0.27, 0.17]);
        quad([-0.16, -0.64, -7], [0.15, -0.64, -7], [0.52, -1.2, 1], [-0.48, -1.2, 1], [0.27, 0.55, 0.59]);

        // Simple triangular evergreens create foreground depth without textures.
        const trees = [
          [-1.2, -0.58, -4, 0.3], [-0.96, -0.62, -3, 0.24], [-0.72, -0.68, -2, 0.2],
          [1.18, -0.6, -4, 0.32], [0.94, -0.66, -3, 0.25], [0.74, -0.72, -2, 0.2],
          [-1.38, -0.72, -1, 0.27], [1.4, -0.72, -1, 0.28],
        ];

        for (const [x, y, z, size] of trees) {
          const green = z < -2 ? [0.09, 0.25, 0.16] : [0.055, 0.18, 0.11];
          triangle([[x - size, y, z], [x, y + size * 2.5, z], [x + size, y, z]], green);
          triangle([[x - size * 0.78, y + size * 0.45, z - 0.01], [x, y + size * 3.2, z - 0.01], [x + size * 0.78, y + size * 0.45, z - 0.01]], green);
        }

        const data = new Float32Array(vertices);
        const buffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
        gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
        gl.useProgram(program);

        const stride = 6 * Float32Array.BYTES_PER_ELEMENT;
        const positionLocation = gl.getAttribLocation(program, "a_position");
        const colorLocation = gl.getAttribLocation(program, "a_color");
        const shiftLocation = gl.getUniformLocation(program, "u_shift");
        const aspectLocation = gl.getUniformLocation(program, "u_aspect");
        gl.enableVertexAttribArray(positionLocation);
        gl.vertexAttribPointer(positionLocation, 3, gl.FLOAT, false, stride, 0);
        gl.enableVertexAttribArray(colorLocation);
        gl.vertexAttribPointer(colorLocation, 3, gl.FLOAT, false, stride, 3 * Float32Array.BYTES_PER_ELEMENT);
        gl.enable(gl.DEPTH_TEST);
        gl.clearColor(0, 0, 0, 0);

        const pointer = { x: 0, y: 0, targetX: 0, targetY: 0 };
        let frame = 0;
        let visible = true;
        const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

        function resize() {
          const ratio = Math.min(window.devicePixelRatio || 1, 1.5);
          const width = Math.max(1, Math.round(canvas.clientWidth * ratio));
          const height = Math.max(1, Math.round(canvas.clientHeight * ratio));
          if (canvas.width !== width || canvas.height !== height) {
            canvas.width = width;
            canvas.height = height;
          }
          gl.viewport(0, 0, width, height);
        }

        function draw() {
          resize();
          pointer.x += (pointer.targetX - pointer.x) * 0.045;
          pointer.y += (pointer.targetY - pointer.y) * 0.045;
          gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
          gl.uniform2f(shiftLocation, pointer.x, pointer.y);
          gl.uniform1f(aspectLocation, Math.max(0.68, canvas.width / canvas.height));
          gl.drawArrays(gl.TRIANGLES, 0, data.length / 6);
          if (visible && !reducedMotion.matches) frame = requestAnimationFrame(draw);
        }

        canvas.addEventListener("pointermove", (event) => {
          const bounds = canvas.getBoundingClientRect();
          pointer.targetX = ((event.clientX - bounds.left) / bounds.width - 0.5) * 0.12;
          pointer.targetY = (0.5 - (event.clientY - bounds.top) / bounds.height) * 0.08;
        }, { passive: true });
        canvas.addEventListener("pointerleave", () => {
          pointer.targetX = 0;
          pointer.targetY = 0;
        });

        document.addEventListener("visibilitychange", () => {
          visible = !document.hidden;
          if (visible && !reducedMotion.matches) {
            cancelAnimationFrame(frame);
            draw();
          }
        });

        if (reducedMotion.matches) draw();
        else frame = requestAnimationFrame(draw);
        document.documentElement.classList.add("has-webgl");
      }
    }
  }
}
