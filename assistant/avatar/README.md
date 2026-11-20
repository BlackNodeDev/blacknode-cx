# BlackNode avatar: live 3D model

The avatar is a rigged glTF model rendered live with three.js (r187, pinned, loaded from jsDelivr)
into the 56px circle (also the floating chip on mobile). An `AnimationMixer` controller maps each
app state to a named clip and crossfades over `crossFade` seconds (0.4) on every state change.

## Files
- `mascot.glb`: the model (skinned mesh + armature + animation clips). Meshopt and Draco are both supported.
- `manifest.json`: model path, clip map, material rule, framing, and per-state labels and posters.
- `poses/<state>.png`: still renders of each state, used for thumbnails and as the fallback when
  WebGL or the model is unavailable (shown with a small CSS motion loop).
- The old `*.mp4 / *.webm / *.png` video loops are no longer used by the app.

## What SplatForge should deliver for `mascot.glb`
- glTF 2.0 binary, Y-up, facing +Z, about 2 units tall, feet near y = -1. One skinned mesh is fine.
- A bone named `Head` (the camera follows it so the face stays centred during gestures).
- Animation clips named `idle`, `thinking`, `talking`, `working`, `happy` (case-insensitive;
  missing clips fall back to `idle`). Seamless loops, 3 to 4 s each, 24 fps or higher.
- Material: plain white skin (base-colour texture with the painted eyes is fine), roughness ~0.6,
  metalness 0, no emissive/clearcoat. Eyes may be a separate material whose name contains `eye`;
  that material is kept as authored. Any material with emissive, clearcoat, iridescence or metal
  is replaced at runtime with soft white `MeshStandardMaterial` (roughness 0.6).
- Budget: under ~1.5 MB and under ~40k vertices (it renders at 56 to 112 device px).
  `scripts/build_mascot_glb.mjs` shows the pipeline: texture swap, simplify 0.3, 1024px JPEG, meshopt.

## manifest.json
```json
{
  "model": "avatar/mascot.glb",          // relative to the app root
  "crossFade": 0.4,                       // seconds
  "material": { "mode": "auto", "color": "#f6f4f1", "roughness": 0.6 },  // auto | white | keep
  "clips": { "idle": "idle", "thinking": "thinking", "talking": "talking", "working": "working", "happy": "happy" },
  "frame": { "y": -0.035, "height": 0.8, "follow": 0.12 },
  "states": { "idle": { "poster": "poses/idle.png", "motion": "bob", "label": "" }, ... }
}
```
- `frame.height`: visible height in the circle as a fraction of the model's height (smaller = closer).
- `frame.y`: shifts the aim point up (+) or down (-) as a fraction of model height.
- `frame.follow`: how quickly the camera follows the head bone (0..1 per frame at 60 fps).
- `material.mode`: `auto` keeps a plain textured white material and replaces "fancy" ones,
  `white` forces flat white (eye materials still kept), `keep` uses the GLB material as-is.

Rendering pauses when the tab is hidden, the avatar is offscreen or faded out, and holds a still
pose when Reduce motion is on (app setting or the OS `prefers-reduced-motion`).
