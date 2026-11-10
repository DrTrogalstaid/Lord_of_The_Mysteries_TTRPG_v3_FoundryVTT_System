/**
 * Real Handlebars for tests whose code renders the system's chat card and dialog templates (helpers/render.mjs).
 * Import it after setting globalThis.game (its i18n is used by {{localize}} and {{lotmLang}}).
 *
 *   import "./support/templates.mjs";
 *
 * It sets globalThis.Handlebars, registers every template under templates/ as a partial named by its Foundry path
 * (systems/lotm/templates/...), the way Foundry's loadTemplates does, and registers the helpers the templates use:
 * Foundry's own (localize, eq, ...) and the system's (lotmLang, lotmHTML).
 * Needs `npm install` once (the handlebars package).
 */

import Handlebars from "handlebars";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
globalThis.Handlebars = Handlebars;

// Foundry's helpers, as far as the templates use them.
Handlebars.registerHelper("localize", (key, options) => {
  const data = options?.hash ?? {};
  return Object.keys(data).length ? game.i18n.format(key, data) : game.i18n.localize(key);
});
Handlebars.registerHelper("eq", (a, b) => a === b);
Handlebars.registerHelper("ne", (a, b) => a !== b);
Handlebars.registerHelper("not", (a) => !a);

for (const file of fs.readdirSync(path.join(root, "templates"), { recursive: true })) {
  if (!file.endsWith(".hbs")) continue;
  const source = fs.readFileSync(path.join(root, "templates", file), "utf8");
  Handlebars.registerPartial(`systems/lotm/templates/${file.split(path.sep).join("/")}`, Handlebars.compile(source));
}

const { registerRenderHelpers } = await import("../../module/helpers/render.mjs");
registerRenderHelpers();
