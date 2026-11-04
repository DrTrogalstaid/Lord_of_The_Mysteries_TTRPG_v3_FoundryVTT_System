/**
 * The system's Token (the token drawn on the canvas). Registered as CONFIG.Token.objectClass in lotm.mjs.
 *
 * What it adds to Foundry's: spirit auras. While a player looks through a token with Spirit Vision or Death Vision,
 * every creature in range glows in its aura colour, the seeing token included (canvas/spirit-aura.mjs): Health or
 * a set aura colour in Spirit Vision, pale green in Death Vision. It reuses Foundry's "detection filter" (the glow
 * Foundry draws around a creature seen only with See Invisibility), so Foundry does the drawing, on top of the
 * scene, lighting and fog.
 * The aura itself is SpiritAuraFilter (spirit-vision-shader.mjs).
 *
 * Used with canvas/spirit-vision.mjs, which decides who is looking with what.
 */

import {
  areSpiritEffectsReduced,
  isSpiritFilter,
  markAsSpiritFilter,
  spiritAuraColor,
  viewerSpiritVision,
} from "./spirit-vision.mjs";
import { SpiritAuraFilter } from "./spirit-vision-shader.mjs";


export class LordOfTheMysteriesToken extends foundry.canvas.placeables.Token {

  /** This token's own aura glow (each creature can have a different colour). */
  #auraFilter = null;


  /**
   * Foundry runs this whenever it checks again whether this token can be seen.
   * After super._refreshVisibility(), Foundry has decided:
   *   this.visible          can the player see this token at all?
   *   this.detectionFilter  which glow, if any, to draw on it
   * @override
   */
  _refreshVisibility() {
    super._refreshVisibility();
    if (!this.visible || areSpiritEffectsReduced()) return;

    // Another sense chose a glow (See Invisibility): keep it.
    if (this.detectionFilter && !isSpiritFilter(this.detectionFilter)) return;

    const kind = viewerSpiritVision(this);
    if (!kind) return;
    const color = spiritAuraColor(this, kind);
    if (!color) return;

    this.#auraFilter ??= markAsSpiritFilter(SpiritAuraFilter.create({ auraColor: color }));
    this.#auraFilter.uniforms.auraColor = color;
    this.detectionFilter = this.#auraFilter;
  }


  /**
   * Foundry calls this every frame to draw the token's detection filter. Size the aura for the current zoom first.
   * @override
   */
  _renderDetectionFilter(renderer) {
    if (this.detectionFilter instanceof SpiritAuraFilter) this.detectionFilter.fitTo(this);
    super._renderDetectionFilter(renderer);
  }


  /**
   * Becoming Ethereal (or stopping) changes who can see this token, so check vision again.
   * @override
   */
  _onApplyStatusEffect(statusId, active) {
    super._onApplyStatusEffect(statusId, active);
    if (statusId === CONFIG.specialStatusEffects.ETHEREAL) canvas.perception.update({ refreshVision: true });
  }


  /**
   * Clean up the aura glow when the token is removed from the canvas.
   * @override
   */
  _destroy(options) {
    this.#auraFilter?.destroy();
    this.#auraFilter = null;
    super._destroy(options);
  }
}
