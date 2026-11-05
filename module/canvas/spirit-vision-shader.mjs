/**
 * The shaders that draw Spirit Vision and Death Vision: the recolour over the whole scene, and the auras.
 *
 * Foundry draws the scene (map, tiles, tokens) into one picture and puts it on screen with a sprite shader.
 * A vision mode can swap that shader for its own (the vision mode's `canvas.shader`, see spirit-vision.mjs).
 * These classes are those shaders: the same job as Foundry's BaseSamplerShader, with our code
 * (spirit-vision-glsl.mjs) doing the recolour on the way. Because it is the whole picture, the effect covers
 * everything the token can see right now, not just its darkvision. Foundry's vision mask says what that is, so
 * places explored earlier (fog of war) keep their real colours. Lighting is still added afterwards.
 *
 * Safety net: if a Foundry update changes its sprite shader so ours no longer fits (isSpriteCodeCompatible),
 * the console says so and Foundry's own shader is used: plain vision instead of a broken canvas.
 *
 * SpiritAuraFilter (at the bottom) is the glow drawn around a creature seen with Spirit or Death Vision.
 *
 * Used by canvas/spirit-vision.mjs (the vision modes and senses) and canvas/token.mjs (auras). The look itself is
 * the presets in spirit-vision-glsl.mjs.
 */

import {
  SPIRIT_VISION_VERTEX,
  SPIRIT_VISION_FRAGMENT,
  SPIRIT_VISION_UNIFORMS,
  DEATH_VISION_UNIFORMS,
  SPIRIT_AURA_VERTEX,
  SPIRIT_AURA_FRAGMENT,
  SPIRIT_AURA_UNIFORMS,
  AURA_SIZE,
  MAX_TOKENS,
  auraWidthOnScreen,
  cameraUniforms,
  tokenAreaUniforms,
  isSpriteCodeCompatible,
} from "./spirit-vision-glsl.mjs";

const { BaseSamplerShader } = foundry.canvas.rendering.shaders;
const { AbstractBaseFilter } = foundry.canvas.rendering.filters;

/** Can our shader code replace Foundry's? Checked once, the first time it's needed. */
let isOurCodeUsable;

function canUseOurCode() {
  if (isOurCodeUsable === undefined) {
    isOurCodeUsable = isSpriteCodeCompatible(BaseSamplerShader._createVertexShader?.());
    if (!isOurCodeUsable) {
      console.warn("LotM | Foundry's sprite shader is different from what Spirit Vision expects, so the spirit / "
        + "death vision colours are switched off. The vision modes themselves still work.");
    }
  }
  return isOurCodeUsable;
}


/**
 * The tokens this player can see, with the size of their art (a token's art can be scaled bigger than its space).
 * @returns {{x: number, y: number, width: number, height: number}[]}   Map pixels.
 */
function visibleTokenAreas() {
  const tokens = canvas.tokens?.placeables ?? [];
  return tokens.filter((token) => token.visible).map((token) => ({
    x: token.center.x,
    y: token.center.y,
    width: token.w * Math.abs(token.document.texture?.scaleX ?? 1),
    height: token.h * Math.abs(token.document.texture?.scaleY ?? 1),
  }));
}


export class SpiritVisionShader extends BaseSamplerShader {
  /**
   * Draw on its own. Foundry normally draws many sprites together in one go ("batching"), and that would
   * skip this shader's code.
   */
  static classPluginName = null;

  /** Foundry may pause sprite shaders to save work; this one keeps animating. */
  static pausable = false;

  /** Starting values for every setting the shader uses: Foundry's, the preset, and the ones updated each frame. */
  static get defaultUniforms() {
    return {
      ...super.defaultUniforms,
      ...SPIRIT_VISION_UNIFORMS,
      screenDimensions: [1, 1],
      lotmVisionMask: null,
      lotmTokens: new Float32Array(MAX_TOKENS * 4),
      lotmTokenCount: 0,
      lotmTime: 0,
      lotmGridUv: [0, 0],
      lotmScreenToGrid: [0, 0, 0, 0],
    };
  }

  /** Our vertex shader (or Foundry's, if ours doesn't fit). */
  static _createVertexShader(...args) {
    return canUseOurCode() ? SPIRIT_VISION_VERTEX : super._createVertexShader(...args);
  }

  /** Our fragment shader (or Foundry's, if ours doesn't fit). */
  static _createFragmentShader(...args) {
    return canUseOurCode() ? SPIRIT_VISION_FRAGMENT : super._createFragmentShader(...args);
  }

  /**
   * Foundry calls this just before drawing, every frame: update the vision mask, the clock, the camera and where
   * the tokens are.
   * The camera values depend only on the pan and zoom, never on the token, so the ripples stay put on the map.
   * @param {SpriteMesh} mesh   The scene picture's sprite.
   * @param {PIXI.Renderer} renderer
   */
  _preRender(mesh, renderer) {
    super._preRender(mesh, renderer); // Foundry's part: the picture and its tint
    const { stage, screenDimensions } = canvas;
    Object.assign(this.uniforms, {
      screenDimensions,
      // What the token can see right now. (Plain white - everything - if Foundry ever moves it.)
      lotmVisionMask: canvas.masks?.vision?.renderTexture ?? PIXI.Texture.WHITE,
      // Seconds, wrapped every hour so the numbers stay small (keeps the movement smooth on all graphics cards).
      // Frozen while Foundry's "Photosensitive Mode" setting is on.
      lotmTime: canvas.photosensitiveMode ? 0 : (canvas.app.ticker.lastTime / 1000) % 3600,
      ...cameraUniforms({
        zoom: stage.scale.x,
        pivot: stage.pivot,
        position: stage.position,
        screen: screenDimensions,
        gridSize: canvas.dimensions.size,
      }),
      ...tokenAreaUniforms(visibleTokenAreas(), { gridSize: canvas.dimensions.size, focus: stage.pivot }),
    });
  }
}


/** Death Vision: the same shader code with the Death Vision preset. */
export class DeathVisionShader extends SpiritVisionShader {
  static get defaultUniforms() {
    return { ...super.defaultUniforms, ...DEATH_VISION_UNIFORMS };
  }
}


/**
 * The aura around a creature. Foundry draws a token's "detection filter" on top of everything else (the scene,
 * lighting and fog), so the aura isn't recoloured by Spirit Vision. token.mjs gives each creature its own, in its
 * aura colour; Spirit Sight and Death Sight each have a plain one too (spirit-vision.mjs).
 *
 *   auraColor   [red, green, blue, strength], each 0 to 1 (spirit-aura.mjs works it out)
 */
export class SpiritAuraFilter extends AbstractBaseFilter {
  /** Room around the token for the aura, in screen pixels. fitTo() keeps it matched to the aura's width. */
  padding = AURA_SIZE.minPixels + 2;

  static get defaultUniforms() {
    return { ...SPIRIT_AURA_UNIFORMS, auraColor: [1, 1, 1, 1], auraWidth: AURA_SIZE.minPixels, auraTime: 0 };
  }

  static _createVertexShader() {
    return SPIRIT_AURA_VERTEX;
  }

  static _createFragmentShader() {
    return SPIRIT_AURA_FRAGMENT;
  }

  /**
   * Size the aura for a token at the current zoom: a share of the token's size on screen.
   * Called by the token just before its aura is drawn (LordOfTheMysteriesToken._renderDetectionFilter).
   * @param {Token} token
   */
  fitTo(token) {
    const width = auraWidthOnScreen(Math.min(token.w, token.h), canvas.stage.scale.x);
    this.uniforms.auraWidth = width;
    this.padding = Math.ceil(width) + 2;
  }

  /**
   * PIXI calls this to draw the filter. Update the clock for the slow breathing (frozen in Photosensitive Mode).
   * @override
   */
  apply(filterManager, input, output, clear) {
    this.uniforms.auraTime = canvas.photosensitiveMode ? 0 : (canvas.app.ticker.lastTime / 1000) % 3600;
    filterManager.applyFilter(this, input, output, clear);
  }
}
