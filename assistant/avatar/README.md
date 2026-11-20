# BlackNode avatar clips

The chat avatar is a 56px circle at the top centre of Chat. It holds two stacked
`<video autoplay loop muted playsinline>` layers (`current` and `next`). When the
assistant changes state, the app loads the new state's clip into the `next` layer
and crossfades the two layers over 500ms (opacity). A status pill under the circle
shows the live task ("Thinking…", "Writing reply", "Generating feed"…). Tapping the
avatar opens the Working on / Finished / Next sheet.

Everything is driven by **`manifest.json`** in this folder. No code changes are
needed to swap in new renders.

## States (one clip per state)

| State      | When the app shows it                                  | Feel of the loop                                       |
|------------|--------------------------------------------------------|--------------------------------------------------------|
| `idle`     | Nothing happening                                      | Calm breathing, slow blink, tiny bob                   |
| `thinking` | Message sent, waiting for first token; listening       | Head tilt, eyes look up/side, puzzle seams shimmer     |
| `talking`  | Reply is streaming; text-to-speech is playing          | Mouth/snout moves, small nods, lively eyes             |
| `working`  | Writing code, generating a feed edition or ideas       | Focused, busy (typing / tinkering / puzzle pieces shift) |
| `happy`    | Task just finished (shows ~2.4s, then back to idle)    | Little bounce, side nubs wiggle, eyes smile            |

## Clip spec

- **Square**, 512×512 px (1024×1024 is fine; it is downscaled to 56px CSS, 112px on 2x screens).
- **Duration** 3–4 s, **seamless loop**: the last frame must flow straight into the first. No fade in or out.
- **Frame rate** 30 fps (24 is fine).
- **Framing**: character centred, head and body inside the middle ~80% of the frame.
  The circle crops the corners, so keep the ear nubs and side nubs clear of the corners.
  Same camera, scale and centre in every state so the crossfade does not jump.
- **Background**: solid near-black `#0b0b10`, **or** transparent (alpha) WebM.
- **No audio track** (the videos are muted anyway; strip audio to keep files small).
- **Files per state** (both, so every browser gets one):
  - `idle.mp4`, `thinking.mp4`, `talking.mp4`, `working.mp4`, `happy.mp4` — H.264, yuv420p, `+faststart`
  - `idle.webm`, `thinking.webm`, … — VP9 (use VP9 alpha if you render with transparency)
- **Size target**: under ~400 KB per file.
- **Poster** (optional, per state): a 512×512 JPG/PNG of the first frame, e.g. `idle.jpg`.
  Until then every state uses `poster.jpg` (the 3D-styled BlackNode puzzle mascot).

### Encoding commands

```bash
# MP4 (H.264), from a PNG sequence or a master file
ffmpeg -i idle_master.mov -vf "scale=512:512:flags=lanczos,format=yuv420p" -an \
  -c:v libx264 -crf 22 -preset slow -movflags +faststart idle.mp4
# WebM (VP9), opaque
ffmpeg -i idle_master.mov -vf "scale=512:512:flags=lanczos" -an \
  -c:v libvpx-vp9 -b:v 0 -crf 34 -row-mt 1 idle.webm
# WebM (VP9) with alpha, from a PNG sequence with transparency
ffmpeg -framerate 30 -i idle_%04d.png -vf "scale=512:512:flags=lanczos" -an \
  -c:v libvpx-vp9 -pix_fmt yuva420p -b:v 0 -crf 34 idle.webm
```

## Dropping clips in

1. Copy the files into this folder (`app/avatar/`).
2. In `manifest.json`, set the paths for each state you delivered, for example:

```json
"idle": { "video": "idle.mp4", "webm": "idle.webm", "poster": "idle.jpg", "motion": "bob", "label": "" }
```

3. Reload the app (or Settings → Avatar → Reload clips). Settings → Avatar shows
   `video` or `poster` under each state so you can check which clips loaded.

How it behaves:

- `webm` is tried first, then `video` (MP4). If both fail to load, that state falls back
  to its poster with the CSS motion named in `motion` (`bob`, `tilt`, `talk`, `glow`, `bounce`).
- Leave `video`/`webm` as `null` for states that are not rendered yet. Do not point them at
  files that don't exist, because the browser logs a 404.
- `transitionMs` at the top of the manifest sets the crossfade time (default 500).
- `label` is the default status-pill text for that state; the app replaces it with
  live task text while it works.
- `frame` (optional) crops a full-body clip so the face fills the 56px circle:
  `{ "scale": 1.75, "x": 0.5, "y": 0.49 }` zooms the clip 1.75× and moves the point
  (x, y), given as fractions of the frame (0..1, top-left origin), to the circle centre.
  Aim the point just above the eyes. The same framing is applied to the poster and to
  the thumbnails in Settings and the status sheet. Omit `frame` (or use scale 1) for
  clips that are already head-and-shoulders.

## Current framing (full-body 512×512 clips)

| State    | scale | x    | y    | Note |
|----------|-------|------|------|------|
| idle     | 1.75  | 0.50 | 0.49 | |
| thinking | 1.75  | 0.42 | 0.46 | head tilts to the left of frame |
| talking  | 1.75  | 0.50 | 0.49 | |
| working  | 1.60  | 0.50 | 0.63 | head is bowed for the whole loop, so at 56px it reads mostly as the top of the head; a re-render with the chin raised a little would read better |
| happy    | 1.75  | 0.50 | 0.47 | |
