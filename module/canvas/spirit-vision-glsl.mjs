/**
 * GLSL (shader code) for Spirit Vision and Death Vision.
 *
 * This file is plain text and numbers only - no Foundry code - so it is safe to tweak.
 * The look of each vision is controlled by the PRESETS further down this file:
 * change a number, reload Foundry (F5), and look at the canvas again.
 *
 * The look is based on the anime: the room is still there and you can still make out
 * its details, but every surface is repainted in a few strong, simple colours, the
 * edges of those colours ripple slowly, and outlines glow.
 *
 * Where it is drawn: Foundry draws the whole scene (map, tiles, tokens) into one picture, then puts that picture
 * on screen. While a token uses Spirit or Death Vision, this shader is the one that puts it on screen. It only
 * recolours what the token can see right now (Foundry's vision mask: lit and in line of sight). Places the player
 * explored earlier keep their real colours, like a memory. Lighting and fog of war are added on top afterwards.
 *
 * How it works, in plain words. For every pixel on screen:
 *  0. Can the token see this pixel right now? If not, leave it as it is.
 *  1. Wobble: move the spot we read colour from a little, using slowly moving noise.
 *     This is what makes the edges of each colour patch ripple.
 *  2. Read the scene at that wobbled spot, plus 4 neighbours around it.
 *  3. Outlines: if the neighbours differ a lot in brightness, we are on an edge.
 *  4. Recolour: turn the colour we read into the nearest "basic" colour
 *     (red, yellow, green, cyan, blue or magenta). Grey and beige things get a
 *     colour from their brightness instead (dark = blue, light = yellow).
 *  5. Keep the details: the brightness comes from the REAL, un-wobbled pixel,
 *     so faces, patterns and furniture stay readable.
 *  6. Add the glowing outlines, optional mist, and darken towards the edges of the screen.
 * The noise is placed on the map (not the screen or the token), so the ripples stay put when anything moves.
 * Token art is busy (faces, armour, frames), so on tokens the ripples and outlines can be turned down
 * (lotmTokenWobble, lotmTokenEdges): the shader is told where the tokens are every frame.
 *
 * Names starting with "lotm" are ours; the others (sampler, tintAlpha, projectionMatrix...) are the names
 * Foundry and PIXI (Foundry's drawing library) use to hand the shader its picture and position.
 *
 * Used by canvas/spirit-vision-shader.mjs (the shader classes). The functions at the bottom are plain maths and
 * string checks (no game / CONFIG / canvas), tested under Node (tests/spirit-vision.test.mjs). The GLSL itself only
 * runs on the graphics card, so check it in Foundry (tests/MANUAL_QA.md, "Spirit Vision and Death Vision").
 */

/**
 * The vertex shader: runs once for each corner of the scene picture and says where on screen it goes.
 * It also passes two positions on to the fragment shader (below) for every pixel in between.
 */
export const SPIRIT_VISION_VERTEX = /* glsl */ `
attribute vec2 aVertexPosition;   // this corner, in screen pixels
attribute vec2 aTextureCoord;     // the same corner in the scene picture (0 to 1)
uniform mat3 projectionMatrix;    // PIXI's: turns screen pixels into the graphics card's -1 to 1
uniform vec2 screenDimensions;    // the screen's width and height, in pixels

varying vec2 vUvs;                // where a pixel is in the scene picture (0 to 1)
varying vec2 vLotmScreen;         // where a pixel is on the screen (0 to 1, from the top left)

void main() {
  vUvs = aTextureCoord;
  vLotmScreen = aVertexPosition / screenDimensions;
  gl_Position = vec4((projectionMatrix * vec3(aVertexPosition, 1.0)).xy, 0.0, 1.0);
}
`;

/**
 * Settings ("uniforms") and helper functions for the fragment shader, which runs once for every pixel.
 */
/** The most tokens the shader is told about (the ones nearest the middle of the screen). */
export const MAX_TOKENS = 32;

const LOTM_GLSL_HELPERS = /* glsl */ `
// Use the most precise numbers the graphics card has (keeps the slow movement smooth).
#ifdef GL_FRAGMENT_PRECISION_HIGH
  precision highp float;
#else
  precision mediump float;
#endif

// From Foundry: the scene picture, and its tint and see-through-ness (normally all 1).
uniform sampler2D sampler;
uniform vec4 tintAlpha;
varying vec2 vUvs;                 // where this pixel is in the scene picture (0 to 1)
varying vec2 vLotmScreen;          // where this pixel is on the screen (0 to 1, from the top left)

// Set every frame by the shader class (SpiritVisionShader._preRender in canvas/spirit-vision-shader.mjs).
uniform float lotmTime;            // seconds, increases every frame (drives the movement)
uniform vec2  lotmGridUv;          // how big one grid square is on screen (used to read nearby pixels)
uniform vec4  lotmScreenToGrid;    // turns a spot on screen into a spot on the map (see cameraUniforms below)
uniform sampler2D lotmVisionMask;  // Foundry's: what can be seen right now (red 1 = seen, 0 = not), screen-sized
#define LOTM_MAX_TOKENS ${MAX_TOKENS}
uniform vec4  lotmTokens[LOTM_MAX_TOKENS]; // the tokens on show: centre x, y, half width, half height (grid squares)
uniform float lotmTokenCount;      // how many of lotmTokens are in use

// The look. Set by the presets further down this file (SPIRIT_VISION_UNIFORMS, DEATH_VISION_UNIFORMS).
uniform float lotmRecolor;         // 0 = keep the real colours, 1 = fully repainted
uniform float lotmColorSteps;      // how many basic colours (6 = red, yellow, green, cyan, blue, magenta)
uniform float lotmHueShift;        // nudges which basic colour each real colour turns into
uniform float lotmHueDrift;        // how much the colours slowly shift from place to place (0 = never)
uniform float lotmHueDriftScale;   // size of those shifting patches, in grid squares
uniform float lotmHueDriftSway;    // how far each patch sways back and forth, as a share of a patch (0 = still)
uniform float lotmHueDriftSpeed;   // how fast the patches sway (higher = faster)
uniform float lotmBandSoftness;    // 0 = hard jumps between colours, 0.5 = smooth blends
uniform float lotmColorSaturation; // 0 = white, 1 = the most vivid colours
uniform float lotmLightAndShadow;  // 0 = each thing keeps (a basic version of) its own colour,
                                   // 1 = colour comes from light and shadow instead (like the anime)
uniform float lotmDarkHue;         // colour for the darkest parts (0 red, 0.33 green, 0.66 blue)
uniform float lotmLightHue;        // colour for the brightest parts. Above 1 wraps round:
                                   // 1.17 = yellow, reached from blue by way of purple and red
uniform float lotmHueFromBrightness; // light and dark parts of one colour lean towards its neighbouring colours
uniform float lotmMinBrightness;   // the darkest the new colours can get (higher = brighter, more vivid)
uniform float lotmDetailBoost;     // how strongly small details (lines, patterns, faces) show through
uniform float lotmSoftness;        // 0 = sharp details, 1 = soft and dreamy
uniform float lotmBlurSize;        // how far apart the neighbour pixels are, in grid squares
uniform float lotmWobbleSize;      // how far the colour edges ripple, in grid squares
uniform float lotmWobbleScale;     // how big each ripple is, in grid squares
uniform float lotmWobbleSpeed;     // how fast the ripples move
uniform float lotmTokenWobble;     // on token art: how much it ripples (0 = not at all, 1 = like everything else)
uniform float lotmTokenEdges;      // on token art: how strong the outlines are (0 = none, 1 = like everything else)
uniform vec3  lotmEdgeColor;       // colour of the glowing outlines
uniform float lotmEdgeStrength;    // 0 = no outlines, 1 = strong outlines
uniform float lotmEdgeThreshold;   // how sharp a brightness change must be to count as an edge
uniform vec3  lotmTint;            // a colour to push everything towards (Death Vision: pale green)
uniform float lotmTintStrength;    // 0 = no tint, 1 = everything becomes the tint colour
uniform vec3  lotmMistColor;       // colour of the drifting mist
uniform float lotmMistStrength;    // 0 = no mist (and no cost), 1 = thick mist
uniform float lotmMistScale;       // size of one mist cloud, in grid squares
uniform float lotmMistSpeed;       // how fast the mist drifts
uniform float lotmDarken;          // 0 = normal brightness, 1 = black
uniform float lotmVignette;        // how much darker it gets towards the edges of the screen

// The scene's colour at a spot in the picture. The picture stores each colour already multiplied by
// how see-through it is (alpha); dividing by alpha undoes that, so see-through edges don't come out dark.
vec3 lotmSceneAt(vec2 uv) {
  vec4 color = texture2D(sampler, uv);
  return color.a > 0.0 ? color.rgb / color.a : vec3(0.0);
}

// The scene's colour a little way from this pixel. offset is in grid squares on the map.
vec3 lotmSceneNear(vec2 offset) {
  return lotmSceneAt(vUvs + offset * lotmGridUv);
}

// Is this spot on a token? 1 = on one, 0 = not, soft in between. Each token counts as a rounded square the size
// of its art, so both round tokens and square portraits are covered.
float lotmOnToken(vec2 world) {
  float on = 0.0;
  for ( int i = 0; i < LOTM_MAX_TOKENS; i++ ) {
    if ( float(i) >= lotmTokenCount ) break;
    vec4 token = lotmTokens[i];
    vec2 away = abs(world - token.xy) / max(token.zw, vec2(0.001));   // 1 = at the token's edge
    vec2 away4 = away * away * away * away;
    float shape = sqrt(sqrt(away4.x + away4.y));                       // a rounded square
    on = max(on, 1.0 - smoothstep(0.85, 1.05, shape));
  }
  return on;
}

// Brightness of a colour, the way human eyes judge it.
float lotmLum(vec3 color) {
  return dot(color, vec3(0.2126, 0.7152, 0.0722));
}

// "Screen" blend: adds light like two projectors on one wall, never goes past white.
vec3 lotmScreen(vec3 base, vec3 light) {
  return 1.0 - (1.0 - base) * (1.0 - light);
}

// A random-looking number between 0 and 1 for any point (no sin(), so it is stable on all GPUs).
float lotmHash(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

// Smooth noise: blends the random numbers of the 4 nearest grid corners.
float lotmNoise(vec2 p) {
  vec2 cell = floor(p);
  vec2 local = fract(p);
  vec2 blend = local * local * (3.0 - 2.0 * local);
  float a = lotmHash(cell);
  float b = lotmHash(cell + vec2(1.0, 0.0));
  float c = lotmHash(cell + vec2(0.0, 1.0));
  float d = lotmHash(cell + vec2(1.0, 1.0));
  return mix(mix(a, b, blend.x), mix(c, d, blend.x), blend.y);
}

// Layered noise: big soft shapes plus smaller detail on top. This makes edges look natural.
float lotmFbm(vec2 p) {
  float total = 0.0;
  float amount = 0.5;
  for (int layer = 0; layer < 4; layer++) {
    total += amount * lotmNoise(p);
    p = p * 2.03 + vec2(17.0, 9.0);
    amount *= 0.5;
  }
  return total;
}

// Red-green-blue colour -> hue / saturation / brightness (all 0 to 1).
vec3 lotmRgbToHsv(vec3 c) {
  vec4 k = vec4(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0);
  vec4 p = mix(vec4(c.bg, k.wz), vec4(c.gb, k.xy), step(c.b, c.g));
  vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));
  float d = q.x - min(q.w, q.y);
  float tiny = 0.0001; // stops dividing by zero on black pixels
  return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + tiny)), d / (q.x + tiny), q.x);
}

// Hue / saturation / brightness -> red-green-blue colour.
vec3 lotmHsvToRgb(vec3 hsv) {
  vec3 rgb = clamp(abs(mod(hsv.x * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0);
  return hsv.z * mix(vec3(1.0), rgb, hsv.y);
}

// Snap a hue to the nearest of the basic colours, with a soft blend at the border between two.
float lotmBandHue(float hue) {
  float steps = max(lotmColorSteps, 1.0);
  float position = fract(hue + lotmHueShift) * steps;
  float band = floor(position);
  float toNext = smoothstep(0.5 - lotmBandSoftness, 0.5 + lotmBandSoftness, fract(position));
  return fract((band + toNext) / steps);
}
`;

/**
 * The fragment shader: the helpers above, then main(), which works out the colour of one pixel.
 */
export const SPIRIT_VISION_FRAGMENT = LOTM_GLSL_HELPERS + /* glsl */ `
void main() {
  vec4 lotmPicture = texture2D(sampler, vUvs);
  if ( lotmPicture.a <= 0.0 ) {    // nothing drawn here
    gl_FragColor = vec4(0.0);
    return;
  }

  // 0. Only where the token can see right now. Explored places it can't see keep their real colours.
  float lotmSeen = texture2D(lotmVisionMask, vLotmScreen).r;
  if ( lotmSeen <= 0.0 ) {
    gl_FragColor = lotmPicture * tintAlpha;   // Foundry's picture, unchanged (and no work wasted)
    return;
  }

  vec3 lotmPixel = lotmPicture.rgb / lotmPicture.a;  // this pixel's real colour

  // Where this pixel is on the map, in grid squares, so the ripples stay attached to the map.
  vec2 lotmWorld = vLotmScreen * lotmScreenToGrid.xy + lotmScreenToGrid.zw;

  // Is it on a token's art? (Its ripples and outlines are turned down below.)
  float lotmTokenArt = lotmOnToken(lotmWorld);

  // 1. Wobble: two moving noise values (left/right and up/down) between -1 and 1.
  float lotmT = lotmTime * lotmWobbleSpeed;
  vec2 lotmWobblePoint = lotmWorld / max(lotmWobbleScale, 0.001);
  vec2 lotmWobble = vec2(
    lotmFbm(lotmWobblePoint + vec2(0.0, lotmT)),
    lotmFbm(lotmWobblePoint + vec2(5.2, 1.3 - lotmT))
  ) * 2.0 - 1.0;
  vec2 lotmAt = lotmWobble * lotmWobbleSize * mix(1.0, lotmTokenWobble, lotmTokenArt);

  // 2. Read the scene at the wobbled spot and at 4 neighbours (left, right, up, down).
  vec2 lotmStep = vec2(lotmBlurSize, 0.0);
  vec3 lotmMid   = lotmSceneNear(lotmAt);
  vec3 lotmLeft  = lotmSceneNear(lotmAt - lotmStep.xy);
  vec3 lotmRight = lotmSceneNear(lotmAt + lotmStep.xy);
  vec3 lotmUp    = lotmSceneNear(lotmAt - lotmStep.yx);
  vec3 lotmDown  = lotmSceneNear(lotmAt + lotmStep.yx);
  vec3 lotmBlurred = (lotmMid * 2.0 + lotmLeft + lotmRight + lotmUp + lotmDown) / 6.0;

  // 3. Outlines: how much does brightness change from left to right and from top to bottom?
  vec2 lotmChange = vec2(lotmLum(lotmRight) - lotmLum(lotmLeft), lotmLum(lotmDown) - lotmLum(lotmUp));
  float lotmEdge = smoothstep(lotmEdgeThreshold, lotmEdgeThreshold * 3.0, length(lotmChange));
  lotmEdge *= mix(1.0, lotmTokenEdges, lotmTokenArt);

  // 4. Recolour into the basic colours.
  //    The drift slowly nudges hues up and down from place to place. Colours that sit near the
  //    border between two basic colours flip back and forth, so those borders ripple too.
  vec2 lotmDriftPoint = lotmWorld / max(lotmHueDriftScale, 0.001);
  float lotmSwayTime = lotmTime * lotmHueDriftSpeed;
  float lotmSwayStep = lotmNoise(lotmDriftPoint * 0.5) * 6.2831853;   // when this area sways (0 to one full turn)
  vec2 lotmSway = vec2(sin(lotmSwayTime + lotmSwayStep), cos(lotmSwayTime * 0.8 + lotmSwayStep)) * lotmHueDriftSway;
  float lotmDrift = (lotmFbm(lotmDriftPoint + lotmSway) - 0.47) * 2.0 * lotmHueDrift;
  vec3 lotmHsv = lotmRgbToHsv(lotmBlurred);
  float lotmLean = (lotmHsv.z - 0.5) * lotmHueFromBrightness;
  vec3 lotmOwnColor = lotmHsvToRgb(vec3(lotmBandHue(lotmHsv.x + lotmLean + lotmDrift), lotmColorSaturation, 1.0));
  //    Light-and-shadow colour: dark parts get lotmDarkHue, bright parts lotmLightHue, the rest in between.
  float lotmLightHueHere = mix(lotmDarkHue, lotmLightHue, sqrt(lotmLum(lotmBlurred)));
  vec3 lotmLightColor = lotmHsvToRgb(vec3(lotmBandHue(lotmLightHueHere + lotmDrift), lotmColorSaturation, 1.0));
  //    Which one to use? Grey, beige and black things always use the light-and-shadow colour
  //    (they have no colour of their own); for everything else lotmLightAndShadow decides.
  float lotmColorful = smoothstep(0.1, 0.35, lotmHsv.y) * smoothstep(0.05, 0.2, lotmHsv.z);
  vec3 lotmPaint = mix(lotmLightColor, lotmOwnColor, lotmColorful * (1.0 - lotmLightAndShadow));
  lotmPaint = mix(lotmPaint, lotmTint, lotmTintStrength);

  // 5. Brightness. The new colours stay bright so they glow; the real scene only nudges them.
  //    sqrt() lifts dark parts more than light ones, so a dark wooden floor still gets a strong colour.
  float lotmSharpLum = lotmLum(lotmPixel);
  float lotmAreaLum = lotmLum(lotmBlurred);
  float lotmBrightness = mix(lotmMinBrightness, 1.0, sqrt(mix(lotmSharpLum, lotmAreaLum, lotmSoftness)));
  //    Keep the details: how much darker or lighter is this exact pixel than the area around it?
  lotmBrightness += (lotmSharpLum - lotmAreaLum) * lotmDetailBoost;
  vec3 lotmResult = mix(lotmPixel, lotmPaint * clamp(lotmBrightness, 0.0, 1.0), lotmRecolor);

  // 6. Outlines, painted in their own colour (not blended towards white).
  lotmResult = mix(lotmResult, lotmEdgeColor, lotmEdge * lotmEdgeStrength);

  // 7. Optional drifting mist (Death Vision). Skipped completely when the strength is 0.
  if ( lotmMistStrength > 0.0 ) {
    float lotmMistT = lotmTime * lotmMistSpeed;
    vec2 lotmMistPoint = lotmWorld / max(lotmMistScale, 0.001);
    vec2 lotmSwirl = vec2(lotmFbm(lotmMistPoint + vec2(0.0, lotmMistT)), lotmFbm(lotmMistPoint + vec2(5.2, -lotmMistT)));
    float lotmMist = smoothstep(0.42, 0.72,
      lotmFbm(lotmMistPoint * 1.6 - 1.7 * lotmSwirl + vec2(-lotmMistT * 0.25, lotmMistT * 0.15)));
    lotmResult = mix(lotmResult, lotmScreen(lotmResult, lotmMistColor), lotmMist * lotmMistStrength);
  }

  // 8. Darken overall, and a little more towards the edges of the screen.
  float lotmNearScreenEdge = smoothstep(0.4, 1.0, distance(vLotmScreen, vec2(0.5)) * 2.0);
  lotmResult *= (1.0 - lotmDarken) * (1.0 - lotmVignette * lotmNearScreenEdge);

  // Fade into the real colours where the edge of sight is soft.
  lotmResult = mix(lotmPixel, lotmResult, lotmSeen);

  // Put back the see-through-ness, and Foundry's tint.
  gl_FragColor = vec4(lotmResult * lotmPicture.a, lotmPicture.a) * tintAlpha;
}
`;

/**
 * SPIRIT VISION - the Seer's view, as in the anime: the room repainted in strong basic
 * colours with rippling edges, glowing cyan outlines, and details still readable.
 * Lit areas lean yellow, shadowed areas lean red, grey stone and dark corners go blue-purple.
 */
export const SPIRIT_VISION_UNIFORMS = {
  lotmRecolor: 0.9,
  lotmColorSteps: 6,
  lotmHueShift: 0.04,
  lotmHueDrift: 0.07,
  lotmHueDriftScale: 1,
  lotmHueDriftSway: 0.2,      // patches sway about a third of their size...
  lotmHueDriftSpeed: 0.6,     // ...once every 10 seconds or so
  lotmBandSoftness: 0.12,
  lotmColorSaturation: 0.8,
  lotmLightAndShadow: 0.0,    // things keep a basic version of their own colour...
  lotmDarkHue: 0.58,          // ...except grey/beige/black things: shadows -> blue
  lotmLightHue: 1.17,         //    light parts -> yellow (by way of purple and red for the middle)
  lotmHueFromBrightness: 0.15, // shadowed parts lean one colour round (wood: yellow -> red)
  lotmMinBrightness: 0.45,
  lotmDetailBoost: 1.75,
  lotmSoftness: 0.35,
  lotmBlurSize: 0.05,
  lotmWobbleSize: 0.06,
  lotmWobbleScale: 0.95,
  lotmWobbleSpeed: 0.25,
  lotmTokenWobble: 0.0,       // token art doesn't ripple...
  lotmTokenEdges: 0.2,        // ...and has only faint outlines
  lotmEdgeColor: [0.25, 0.7, 1.0], // cyan-blue
  lotmEdgeStrength: 0.75,
  lotmEdgeThreshold: 0.09,
  lotmTint: [1.0, 1.0, 1.0],
  lotmTintStrength: 0.0,
  lotmMistColor: [1.0, 1.0, 1.0],
  lotmMistStrength: 0.0,      // no mist
  lotmMistScale: 4.0,
  lotmMistSpeed: 0.08,
  lotmDarken: 0.0,
  lotmVignette: 0.35
};

/**
 * DEATH VISION - the Corpse Collector's view: the same repainting, but every colour is
 * drained into the Death pathway's pale green, with pale outlines and thin creeping mist.
 */
export const DEATH_VISION_UNIFORMS = {
  lotmRecolor: 0.9,
  lotmColorSteps: 6,
  lotmHueShift: 0.04,
  lotmHueDrift: 0.0,
  lotmHueDriftScale: 2.5,
  lotmHueDriftSway: 0.3,      // patches sway about a third of their size...
  lotmHueDriftSpeed: 0.6,     // ...once every 10 seconds or so
  lotmBandSoftness: 0.12,
  lotmColorSaturation: 0.4,
  lotmLightAndShadow: 0.0,
  lotmDarkHue: 0.38,
  lotmLightHue: 0.38,
  lotmHueFromBrightness: 0.0,
  lotmMinBrightness: 0.0,
  lotmDetailBoost: 0.8,
  lotmSoftness: 0.2,
  lotmBlurSize: 0.05,
  lotmWobbleSize: 0.04,       // barely rippling: the dead are still
  lotmWobbleScale: 1.2,
  lotmWobbleSpeed: 0.1,
  lotmTokenWobble: 0.0,
  lotmTokenEdges: 0.2,
  lotmEdgeColor: [0.55, 1.0, 0.7],
  lotmEdgeStrength: 0.45,
  lotmEdgeThreshold: 0.09,
  lotmTint: [0.72, 1.0, 0.82], // pale green
  lotmTintStrength: 1.0,
  lotmMistColor: [0.65, 1.0, 0.78],
  lotmMistStrength: 0.75,
  lotmMistScale: 4.0,
  lotmMistSpeed: 0.08,
  lotmDarken: 0.35,
  lotmVignette: 0.4
};



/* -------------------------------------------- */
/*  Auras                                        */
/* -------------------------------------------- */

/**
 * AURAS - the glow around a creature seen with Spirit or Death Vision (SpiritAuraFilter in spirit-vision-shader.mjs).
 * Foundry draws the creature's token through this filter on top of everything else. The filter knocks the token
 * itself out (the recoloured token underneath shows through) and draws, around its outline:
 *   - an inner tint along the inside of the edge, so the aura sits on the token too
 *   - a wide glow in the aura colour, white-hot right at the edge. It adds light to what's underneath (like a
 *     lamp), so it shines even over the bright Spirit Vision colours
 *   - a soft dark fringe beyond the glow, so its outline stands out on any background
 * It breathes slowly (stops in Foundry's Photosensitive Mode).
 */
export const SPIRIT_AURA_UNIFORMS = {
  auraWhiteCore: 0.3,  // how white the glow is right at the creature's edge (0 = pure aura colour)
  auraInner: 0.7,      // strength of the tint along the inside of the edge (0 = none)
  auraFringe: 0.4,     // darkness of the fringe around the glow (0 = none, 1 = black)
  auraPulse: 0.15,     // how much the glow breathes (0 = steady)
  auraCover: 0.8,      // how much the glow hides what's under it (lower = more like added light, less colour)
};

/** How wide the aura is: a share of the token's size, kept between a minimum and a maximum (screen pixels). */
export const AURA_SIZE = { shareOfToken: 0.4, minPixels: 6, maxPixels: 20 };

/**
 * How wide the aura is on screen right now.
 * @param {number} tokenSize   The token's smaller side, in map pixels.
 * @param {number} zoom        canvas.stage.scale.x
 * @returns {number}   Screen pixels.
 */
export function auraWidthOnScreen(tokenSize, zoom) {
  const width = tokenSize * zoom * AURA_SIZE.shareOfToken;
  return Math.min(AURA_SIZE.maxPixels, Math.max(AURA_SIZE.minPixels, width));
}

/** PIXI's standard filter vertex shader, plus the size of one screen pixel for the fragment shader. */
export const SPIRIT_AURA_VERTEX = /* glsl */ `
attribute vec2 aVertexPosition;
uniform mat3 projectionMatrix;
uniform vec4 inputSize;            // PIXI's: the token picture's size (width, height, 1 / width, 1 / height)
uniform vec4 outputFrame;          // PIXI's: where on screen the filter draws

varying vec2 vTextureCoord;        // where a pixel is in the token picture
varying vec2 vAuraOnePixel;        // one screen pixel, in the token picture's coordinates

void main() {
  vec2 position = aVertexPosition * max(outputFrame.zw, vec2(0.0)) + outputFrame.xy;
  gl_Position = vec4((projectionMatrix * vec3(position, 1.0)).xy, 0.0, 1.0);
  vTextureCoord = aVertexPosition * (outputFrame.zw * inputSize.zw);
  vAuraOnePixel = inputSize.zw;
}
`;

/** The aura itself, worked out for every pixel around (and on) the creature. */
export const SPIRIT_AURA_FRAGMENT = /* glsl */ `
#ifdef GL_FRAGMENT_PRECISION_HIGH
  precision highp float;
#else
  precision mediump float;
#endif

uniform sampler2D uSampler;        // PIXI's: the token, drawn by Foundry
uniform vec4 inputClamp;           // PIXI's: the part of uSampler that holds the token
varying vec2 vTextureCoord;
varying vec2 vAuraOnePixel;

uniform vec4  auraColor;           // red, green, blue, and strength (Death Vision: faint for the living)
uniform float auraWidth;           // screen pixels
uniform float auraTime;            // seconds (drives the breathing)
uniform float auraWhiteCore;
uniform float auraInner;
uniform float auraFringe;
uniform float auraPulse;
uniform float auraCover;

const int AURA_DIRECTIONS = 16;
const int AURA_STEPS = 8;

// How solid the token is at a spot (0 = empty, 1 = token).
float auraSolidAt(vec2 uv) {
  return texture2D(uSampler, clamp(uv, inputClamp.xy, inputClamp.zw)).a;
}

void main() {
  float here = auraSolidAt(vTextureCoord);
  float isInside = step(0.5, here);

  // How far is the creature's edge? Look out in 16 directions, in 8 steps up to auraWidth, for the first spot on
  // the other side of the edge (solid if we're outside the creature, empty if we're inside it).
  // 0 = right at the edge, 1 = auraWidth or more away.
  float edge = 1.0;
  for ( int d = 0; d < AURA_DIRECTIONS; d++ ) {
    float angle = 6.2831853 * (float(d) + 0.5) / float(AURA_DIRECTIONS);
    vec2 direction = vec2(cos(angle), sin(angle)) * vAuraOnePixel * auraWidth;
    float before = abs(here - isInside);   // how "other side" the previous spot was (below 0.5 = same side)
    for ( int s = 1; s <= AURA_STEPS; s++ ) {
      float reach = float(s) / float(AURA_STEPS);
      float now = abs(auraSolidAt(vTextureCoord + direction * reach) - isInside);
      if ( now > 0.5 ) {
        // Crossed the edge between the previous step and this one: estimate where.
        float between = (0.5 - before) / max(now - before, 0.001);
        edge = min(edge, reach - (1.0 - between) / float(AURA_STEPS));
        break;
      }
      before = now;
    }
  }

  float breathing = 1.0 - auraPulse + auraPulse * sin(auraTime * 2.0);
  float strength = auraColor.a * breathing;

  // Outside: the glow, strongest at the edge and fading out; then a dark fringe in the outer part.
  float glow = (1.0 - isInside) * pow(1.0 - smoothstep(0.0, 0.75, edge), 1.5);
  float fringe = (0.5 - isInside) * smoothstep(0.155, 0.35, edge) * (0.5 - smoothstep(0.375, 0.5, edge));
  // Inside: a tint along the inside of the edge.
  float inner = isInside * (1.0 - smoothstep(0.0, 0.3, edge)) * auraInner;
  float light = max(glow, inner) * strength;

  // White-hot right at the edge, the aura colour further out.
  vec3 color = mix(auraColor.rgb, vec3(1.0), (1.0 - smoothstep(0.0, 0.2, edge)) * auraWhiteCore);

  // The glow mostly covers what's underneath (so its colour reads) and ADDS the rest as light, so it shines even
  // over bright colours. The fringe only darkens.
  float cover = light * auraCover;
  float dark = fringe * auraFringe * auraColor.a;
  float alpha = cover + dark * (1.0 - cover);
  gl_FragColor = vec4(color * light, alpha);   // colour already multiplied by how much of it there is, as PIXI expects
}
`;


/**
 * The camera values the shader needs, worked out again every frame (SpiritVisionShader._preRender).
 * They depend only on the camera (pan and zoom), never on the token, so the ripples stay put on the map.
 *   lotmGridUv        one grid square's size on screen, as a fraction of the screen's width and height
 *                     (used to read pixels a fixed distance away on the map, whatever the zoom)
 *   lotmScreenToGrid  [xScale, yScale, xOffset, yOffset]: a spot on screen (0 to 1 from the top left, like
 *                     vLotmScreen) times the scales, plus the offsets, is that spot on the map in grid squares
 *
 * How the camera works: the map point `pivot` is drawn at screen point `position`, and everything is `zoom` times
 * its size. So screen = (map - pivot) * zoom + position, and map = screen / zoom + pivot - position / zoom.
 * @param {object} camera
 * @param {number} camera.zoom                 canvas.stage.scale.x
 * @param {{x: number, y: number}} camera.pivot     canvas.stage.pivot
 * @param {{x: number, y: number}} camera.position  canvas.stage.position
 * @param {number[]} camera.screen             canvas.screenDimensions: [width, height] in pixels
 * @param {number} camera.gridSize             canvas.dimensions.size: pixels per grid square on the map
 * @returns {{lotmGridUv: number[], lotmScreenToGrid: number[]}}
 */
export function cameraUniforms({ zoom, pivot, position, screen, gridSize }) {
  const [width, height] = screen;
  const squareOnScreen = gridSize * zoom; // one grid square, in screen pixels
  return {
    lotmGridUv: [squareOnScreen / width, squareOnScreen / height],
    lotmScreenToGrid: [
      width / squareOnScreen,
      height / squareOnScreen,
      (pivot.x - position.x / zoom) / gridSize,
      (pivot.y - position.y / zoom) / gridSize,
    ],
  };
}


/**
 * Where the tokens are, for the shader (lotmTokens, lotmTokenCount), worked out every frame
 * (SpiritVisionShader._preRender). Only the MAX_TOKENS nearest the middle of the screen are sent.
 * @param {{x: number, y: number, width: number, height: number}[]} tokens   Centre and art size, in map pixels.
 * @param {object} options
 * @param {number} options.gridSize                 canvas.dimensions.size: pixels per grid square
 * @param {{x: number, y: number}} options.focus    The map point in the middle of the screen (canvas.stage.pivot)
 * @returns {{lotmTokens: Float32Array, lotmTokenCount: number}}
 *   lotmTokens holds 4 numbers per token: centre x, centre y, half width, half height, in grid squares.
 */
export function tokenAreaUniforms(tokens, { gridSize, focus }) {
  const distanceToFocus = (token) => Math.hypot(token.x - focus.x, token.y - focus.y);
  const nearest = [...tokens].sort((a, b) => distanceToFocus(a) - distanceToFocus(b)).slice(0, MAX_TOKENS);
  const lotmTokens = new Float32Array(MAX_TOKENS * 4);
  nearest.forEach((token, i) => {
    lotmTokens.set([token.x / gridSize, token.y / gridSize, token.width / 2 / gridSize, token.height / 2 / gridSize], i * 4);
  });
  return { lotmTokens, lotmTokenCount: nearest.length };
}


/**
 * Our vertex shader uses the same inputs as Foundry's own sprite shader (BaseSamplerShader): the corner positions
 * (aVertexPosition), the picture positions (aTextureCoord) and PIXI's projectionMatrix. If a Foundry update ever
 * renames these, our shader would draw nothing - a black canvas - so the shader class checks Foundry's code first
 * and keeps Foundry's own shader if they're missing.
 * @param {string} foundryVertexCode   The vertex shader code of Foundry's BaseSamplerShader.
 * @returns {boolean}   true when our shader can safely replace Foundry's.
 */
export function isSpriteCodeCompatible(foundryVertexCode) {
  if (typeof foundryVertexCode !== "string") return false;
  return ["aVertexPosition", "aTextureCoord", "projectionMatrix"]
    .every((name) => new RegExp(`\\b${name}\\b`).test(foundryVertexCode));
}
