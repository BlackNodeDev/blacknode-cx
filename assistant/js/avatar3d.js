/* BlackNode live 3D avatar: one shared three.js renderer + AnimationMixer state controller.
   Loaded on demand by app.js; any failure here leaves the poster fallback in place. */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

export const THREE_VERSION = THREE.REVISION;
const DRACO_PATH = `https://cdn.jsdelivr.net/npm/three@0.${THREE.REVISION}.0/examples/jsm/libs/draco/gltf/`;
const EYE_RE = /eye|iris|pupil|cornea|sclera/i;

function hasWebGL() {
  try { const c = document.createElement('canvas'); return !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl'))); } catch (e) { return false; }
}

/** Decide whether a glTF material is already plain white, and if not, build a soft white one. */
function whiten(mat, cfg) {
  if (!mat || EYE_RE.test(mat.name || '')) return mat;                       // separate eye material: keep it
  const mode = cfg.mode || 'auto';
  if (mode === 'keep') return mat;
  const white = new THREE.Color(cfg.color || '#f6f4f1');
  const rough = cfg.roughness ?? 0.6;
  const fancy = !!(mat.emissiveMap || (mat.emissive && mat.emissive.getHex() !== 0) || mat.clearcoat > 0 || mat.iridescence > 0 || mat.metalness > 0.3);
  const c = mat.color || new THREE.Color(1, 1, 1); const lum = 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
  // Keep a plain base-colour texture (the original white skin with its painted eyes) unless told "white".
  const keepMap = mode === 'auto' && mat.map && !fancy && lum > 0.6;
  const out = new THREE.MeshStandardMaterial({
    name: (mat.name || 'mat') + '-white', color: keepMap ? c : white, map: keepMap ? mat.map : null,
    normalMap: keepMap ? mat.normalMap : null, roughness: rough, metalness: 0, side: mat.side
  });
  if (mode === 'auto' && !fancy && !mat.map && lum > 0.85 && mat.roughness >= 0.4 && mat.metalness < 0.1) return mat; // already plain white
  return out;
}

export async function createAvatar3D(opts) {
  const { container, url, cfg = {}, reduceMotion = () => false, isShown = () => true, onState = () => {} } = opts;
  if (!hasWebGL()) throw new Error('webgl-unavailable');
  const t0 = performance.now();
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power', premultipliedAlpha: true });
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = cfg.exposure ?? 1.0;
  const canvas = renderer.domElement; canvas.className = 'av-canvas'; canvas.setAttribute('aria-hidden', 'true');

  const scene = new THREE.Scene();
  const cam = new THREE.PerspectiveCamera(cfg.fov || 24, 1, 0.01, 50);
  // soft key + fill + cool rim (keeps white white; no coloured cast on the body)
  scene.add(new THREE.HemisphereLight(0xffffff, 0x2a2233, 1.15));
  const key = new THREE.DirectionalLight(0xffffff, 2.1); key.position.set(-1.2, 1.6, 2.4); scene.add(key);
  const fill = new THREE.DirectionalLight(0xf3eeff, 0.55); fill.position.set(1.8, 0.4, 1.6); scene.add(fill);
  const rim = new THREE.DirectionalLight(0xe9dcff, 1.6); rim.position.set(1.4, 1.8, -2.4); scene.add(rim);
  const rim2 = new THREE.DirectionalLight(0xffffff, 0.8); rim2.position.set(-1.6, 0.8, -2.0); scene.add(rim2);

  const loader = new GLTFLoader();
  const draco = new DRACOLoader(); draco.setDecoderPath(DRACO_PATH); loader.setDRACOLoader(draco);
  loader.setMeshoptDecoder(MeshoptDecoder);
  let bytes = 0;
  const gltf = await new Promise((res, rej) => loader.load(url, res, e => { if (e && e.loaded) bytes = e.loaded; }, rej));
  const tLoaded = performance.now();
  const model = gltf.scene; scene.add(model);
  const mats = new Set(); let replaced = 0;
  model.traverse(o => {
    if (!o.isMesh) return; o.frustumCulled = false;
    const conv = m => { const n = whiten(m, cfg.material || {}); if (n !== m) replaced++; mats.add(n.name); return n; };
    o.material = Array.isArray(o.material) ? o.material.map(conv) : conv(o.material);
  });

  // ---- animation controller ----
  const mixer = new THREE.AnimationMixer(model);
  const clips = gltf.animations || [];
  const byName = {}; for (const c of clips) byName[c.name.toLowerCase()] = c;
  const clipMap = cfg.clips || {};
  const actions = {};
  const actionFor = s => {
    const want = String(clipMap[s] || s).toLowerCase();
    const clip = byName[want] || clips.find(c => c.name.toLowerCase().includes(want)) || byName[String(clipMap.idle || 'idle').toLowerCase()] || clips[0];
    if (!clip) return null;
    if (!actions[clip.name]) { const a = mixer.clipAction(clip); a.setLoop(THREE.LoopRepeat, Infinity); actions[clip.name] = a; }
    return actions[clip.name];
  };
  const fade = (cfg.crossFade ?? 0.4);
  let cur = null, curState = null;

  // ---- framing: camera locked on the head bone, damped so blends stay smooth ----
  let head = null, neck = null; model.traverse(o => { if (o.isBone || o.type === 'Bone' || o.isObject3D) { const n = (o.name || '').toLowerCase(); if (!head && /^head$|head$/.test(n) && !/top|end/.test(n)) head = o; if (!neck && /neck/.test(n)) neck = o; } });
  model.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(model, true);
  const size = box.getSize(new THREE.Vector3());
  const fr = Object.assign({ y: 0.0, height: 0.62, follow: 0.12, yaw: 0 }, cfg.frame || {});
  const headP = new THREE.Vector3(), target = new THREE.Vector3(), aim = new THREE.Vector3();
  const headTop = box.max.y;
  const readTarget = out => {
    if (head) head.getWorldPosition(headP); else headP.set(0, box.max.y - size.y * 0.25, 0);
    // centre between the head bone and the crown, nudged by manifest frame.y (fraction of model height)
    out.set(headP.x * 0.6, (headP.y + headTop) / 2 + fr.y * size.y, headP.z * 0.5);
    return out;
  };
  const viewH = fr.height * size.y; // world height visible in the circle
  const dist = (viewH / 2) / Math.tan(THREE.MathUtils.degToRad(cam.fov / 2));
  const placeCam = () => { cam.position.set(aim.x + Math.sin(fr.yaw) * dist, aim.y + dist * 0.06, aim.z + Math.cos(fr.yaw) * dist); cam.lookAt(aim); };

  // ---- sizing ----
  let w = 0, h = 0;
  const resize = () => {
    const r = container.getBoundingClientRect(); const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const nw = Math.max(1, Math.round(container.clientWidth || r.width)), nh = Math.max(1, Math.round(container.clientHeight || r.height));
    if (nw === w && nh === h && renderer.getPixelRatio() === dpr) return;
    w = nw; h = nh; renderer.setPixelRatio(dpr); renderer.setSize(w, h, false); cam.aspect = w / h; cam.updateProjectionMatrix();
  };
  container.appendChild(canvas); resize();
  new ResizeObserver(resize).observe(container);

  // ---- loop: paused when hidden/offscreen/not shown; single still frame when reduce-motion ----
  let lastT = 0; let raf = 0, poll = 0, onScreen = true, frames = 0, fpsT = performance.now(), fps = 0, lastShownCheck = 0, shown = true, cost = 0;
  const io = new IntersectionObserver(es => { onScreen = es.some(e => e.isIntersecting); kick(); }, { threshold: 0 }); io.observe(container);
  const running = () => document.visibilityState === 'visible' && onScreen && shown && !reduceMotion();
  const renderOnce = (dt = 0) => {
    if (dt) mixer.update(dt);
    model.updateMatrixWorld(true); readTarget(target);
    aim.lerp(target, dt ? Math.min(1, fr.follow * dt * 60) : 1); placeCam();
    renderer.render(scene, cam);
  };
  const tick = now => {
    raf = 0;
    if (now - lastShownCheck > 400) { lastShownCheck = now; shown = isShown(); }
    if (!running()) { schedulePoll(); return; }
    const dt = Math.min(Math.max(0, (now - lastT) / 1000), 0.1); lastT = now;
    const c0 = performance.now(); renderOnce(dt); cost = cost * 0.9 + (performance.now() - c0) * 0.1; frames++;
    if (now - fpsT >= 1000) { fps = Math.round(frames * 1000 / (now - fpsT)); frames = 0; fpsT = now; }
    raf = requestAnimationFrame(tick);
  };
  // when paused only because the host is faded out (e.g. chip hidden on another tab), re-check cheaply
  function schedulePoll() { if (poll || document.visibilityState !== 'visible' || !onScreen || reduceMotion()) return; poll = setTimeout(() => { poll = 0; kick(); }, 400); }
  function kick() {
    shown = isShown(); lastShownCheck = performance.now();
    if (raf || !running()) { if (!raf && reduceMotion()) still(); else if (!raf) schedulePoll(); return; }
    lastT = performance.now(); raf = requestAnimationFrame(tick);
  }
  const still = () => { // reduce motion: hold a calm pose, no blending
    if (cur) { mixer.stopAllAction(); cur.reset().play(); cur.time = Math.min(1, cur.getClip().duration / 3); }
    mixer.update(0); renderOnce(0);
  };
  document.addEventListener('visibilitychange', kick);

  function setState(s) {
    const next = actionFor(s); if (!next) return;
    curState = s;
    if (next === cur) { onState(s); return; }
    if (reduceMotion()) { cur = next; still(); onState(s); return; }
    next.enabled = true; next.setEffectiveTimeScale(1); next.setEffectiveWeight(1); next.reset().play();
    if (cur) cur.crossFadeTo(next, fade, false); else next.fadeIn(0.001);
    cur = next; onState(s); kick();
  }

  // ---- per-state stills for thumbnails / poster fallback (rendered once, off the live canvas) ----
  function snapshots(px = 160) {
    const rt = new THREE.WebGLRenderTarget(px, px, { colorSpace: THREE.SRGBColorSpace, samples: 4 });
    const prev = { aim: aim.clone(), aspect: cam.aspect };
    const buf = new Uint8Array(px * px * 4), out = {};
    const c2 = document.createElement('canvas'); c2.width = c2.height = px; const g = c2.getContext('2d'); const id = g.createImageData(px, px);
    const savedCur = cur;
    for (const s of ['idle', 'thinking', 'talking', 'working', 'happy']) {
      const a = actionFor(s); if (!a) continue;
      mixer.stopAllAction(); a.reset().play(); a.setEffectiveWeight(1);
      mixer.setTime(Math.min(1.2, a.getClip().duration * 0.3));
      model.updateMatrixWorld(true); readTarget(aim); cam.aspect = 1; cam.updateProjectionMatrix(); placeCam();
      renderer.setRenderTarget(rt); renderer.setClearColor(0x000000, 0); renderer.clear(); renderer.render(scene, cam);
      renderer.readRenderTargetPixels(rt, 0, 0, px, px, buf);
      for (let y = 0; y < px; y++) id.data.set(buf.subarray((px - 1 - y) * px * 4, (px - y) * px * 4), y * px * 4);
      g.putImageData(id, 0, 0); out[s] = c2.toDataURL('image/png');
    }
    renderer.setRenderTarget(null); rt.dispose();
    mixer.stopAllAction(); cur = null; aim.copy(prev.aim); cam.aspect = prev.aspect; cam.updateProjectionMatrix();
    if (savedCur) { const s = curState; curState = null; setState(s || 'idle'); }
    return out;
  }

  renderOnce(0);
  const info = {
    three: THREE.REVISION, clips: clips.map(c => ({ name: c.name, duration: +c.duration.toFixed(2) })), materials: [...mats], replacedMaterials: replaced,
    loadMs: Math.round(tLoaded - t0), readyMs: Math.round(performance.now() - t0), bytes, verts: 0, hasHead: !!head
  };
  model.traverse(o => { if (o.isMesh) info.verts += o.geometry.attributes.position.count; });
  return {
    canvas, info, setState, snapshots, kick,
    get fps() { return fps; }, get running() { return !!raf; }, get state() { return curState; },
    weights() { return Object.fromEntries(Object.entries(actions).filter(([, a]) => a.isRunning()).map(([k, a]) => [k, +a.getEffectiveWeight().toFixed(3)]).filter(([, v]) => v > 0.001)); },
    get frameMs() { return +cost.toFixed(2); },
    dispose() { cancelAnimationFrame(raf); clearTimeout(poll); io.disconnect(); renderer.dispose(); canvas.remove(); }
  };
}
