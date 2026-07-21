export const backgroundShaderOptions = [
  { value: "none", label: "None" },
  { value: "aurora", label: "Aurora" },
  { value: "waves", label: "Flowing waves" },
  { value: "plasma", label: "Soft plasma" },
];

let shaderRuntime = null;

export function renderShaderOverlay(effect, width, height, options = {}) {
  if (!effect || effect === "none" || typeof document === "undefined") return null;
  const runtime = shaderRuntime || (shaderRuntime = createRuntime());
  if (!runtime) return null;
  const { canvas, gl, program, uniforms } = runtime;
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
  gl.viewport(0, 0, width, height);
  gl.useProgram(program);
  gl.uniform2f(uniforms.resolution, width, height);
  gl.uniform1f(uniforms.time, Math.max(0, Number(options.time) || 0) * Math.max(0, Number(options.speed) || 1));
  gl.uniform1f(uniforms.intensity, Math.max(0, Math.min(1, Number(options.intensity) || 0.5)));
  gl.uniform1i(uniforms.effect, effect === "waves" ? 1 : effect === "plasma" ? 2 : 0);
  gl.uniform3fv(uniforms.colorA, hexToRgb(options.colorA || "#2454d6"));
  gl.uniform3fv(uniforms.colorB, hexToRgb(options.colorB || "#0c8b7f"));
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  return canvas;
}

function createRuntime() {
  const canvas = document.createElement("canvas");
  const gl = canvas.getContext("webgl", { alpha: true, premultipliedAlpha: true, preserveDrawingBuffer: true });
  if (!gl) return null;
  const vertex = compile(gl, gl.VERTEX_SHADER, `
    attribute vec2 position;
    void main() { gl_Position = vec4(position, 0.0, 1.0); }
  `);
  const fragment = compile(gl, gl.FRAGMENT_SHADER, `
    precision mediump float;
    uniform vec2 resolution;
    uniform float time;
    uniform float intensity;
    uniform int effect;
    uniform vec3 colorA;
    uniform vec3 colorB;
    void main() {
      vec2 uv = gl_FragCoord.xy / resolution.xy;
      vec2 p = (gl_FragCoord.xy * 2.0 - resolution.xy) / min(resolution.x, resolution.y);
      float value;
      if (effect == 1) {
        value = 0.5 + 0.5 * sin(p.x * 6.0 + sin(p.y * 4.0 - time * 0.8) + time);
        value *= 0.72 + 0.28 * cos(p.y * 5.0 + time * 0.45);
      } else if (effect == 2) {
        value = sin(p.x * 3.2 + time) + sin(p.y * 4.1 - time * 0.7) + sin((p.x + p.y) * 3.0 + time * 0.4);
        value = 0.5 + 0.1667 * value;
      } else {
        float ribbon = sin((uv.x * 1.4 + uv.y * 0.7) * 8.0 + time * 0.65);
        float glow = exp(-2.7 * abs(p.y - 0.28 * ribbon));
        value = clamp(glow + 0.22 * sin(uv.x * 7.0 - time * 0.35), 0.0, 1.0);
      }
      vec3 color = mix(colorA, colorB, clamp(value, 0.0, 1.0));
      float alpha = clamp((0.18 + value * 0.62) * intensity, 0.0, 0.88);
      gl_FragColor = vec4(color * alpha, alpha);
    }
  `);
  if (!vertex || !fragment) return null;
  const program = gl.createProgram();
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return null;
  gl.useProgram(program);
  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  const position = gl.getAttribLocation(program, "position");
  gl.enableVertexAttribArray(position);
  gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  return {
    canvas,
    gl,
    program,
    uniforms: {
      resolution: gl.getUniformLocation(program, "resolution"),
      time: gl.getUniformLocation(program, "time"),
      intensity: gl.getUniformLocation(program, "intensity"),
      effect: gl.getUniformLocation(program, "effect"),
      colorA: gl.getUniformLocation(program, "colorA"),
      colorB: gl.getUniformLocation(program, "colorB"),
    },
  };
}

function compile(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  return gl.getShaderParameter(shader, gl.COMPILE_STATUS) ? shader : null;
}

function hexToRgb(value) {
  const hex = String(value).replace("#", "");
  const normalized = hex.length === 3 ? [...hex].map((part) => part + part).join("") : hex.padEnd(6, "0").slice(0, 6);
  return [0, 2, 4].map((offset) => parseInt(normalized.slice(offset, offset + 2), 16) / 255);
}
