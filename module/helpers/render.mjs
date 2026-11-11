/**
 * Chat cards and dialog contents come from Handlebars templates (templates/chat/, templates/dialogs/), like the
 * sheets, instead of HTML written out in JavaScript. A template escapes what it shows ({{actor.name}}), so nothing
 * has to be escaped by hand.
 *
 *   renderTemplateSync(path, data)   The HTML of a template. Every template under templates/chat/ and templates/dialogs/
 *                                    is loaded when the world starts (helpers/templates.mjs), so cards and dialogs can
 *                                    be built without waiting. For chat render hooks, which also run while the world
 *                                    is loading, use Foundry's (async) renderTemplate instead.
 *
 *   {{lotmLang "KEY" name=actor.name}}   Lang text with its {placeholders} filled in. The values are escaped; the lang
 *                                        text's own HTML (a <strong>, an <i> icon) is kept. With no values, it's the
 *                                        text as it is. ({{localize}} escapes the whole text, HTML and all.)
 *   {{lotmLang line.key line.data}}      The same, with the values in an object (a list of lines built in code).
 *   {{lotmHTML html}}                    HTML that's already safe (another template's output), as it is. As a
 *                                        lotmLang value: name=(lotmHTML html).
 *
 * In code, for a one-line title or note: formatHTML(key, data) is lotmLang as a string, and safeHTML(html) marks a
 * value that's already HTML (a rolled number) so it isn't escaped again.
 */

/**
 * Render a template that was loaded when the world started.
 * @param {string} path    e.g. "systems/lotm/templates/chat/study.hbs"
 * @param {object} [data]
 * @returns {string}       HTML
 */
export function renderTemplateSync(path, data = {}) {
  const template = Handlebars.partials[path];
  const compiled = typeof template === "string" ? Handlebars.compile(template) : template;
  if (typeof compiled !== "function") throw new Error(`Lord of the Mysteries | template not loaded: ${path}`);
  return compiled(data, { allowProtoMethodsByDefault: true, allowProtoPropertiesByDefault: true });
}


/**
 * Lang text with its placeholders filled in, as HTML: values escaped, the lang text's own HTML kept.
 * @param {string} key
 * @param {object} [data]   Values; a Handlebars.SafeString (safeHTML, langHTML) goes in unescaped.
 * @returns {string}
 */
export function formatHTML(key, data = {}) {
  const values = Object.fromEntries(Object.entries(data).map(([name, value]) => [name, Handlebars.escapeExpression(value)]));
  return Object.keys(values).length ? game.i18n.format(key, values) : game.i18n.localize(key);
}


/**
 * formatHTML marked safe: for a value of another lang line ("loses {loss}" with loss in bold) or a template.
 * @param {string} key
 * @param {object} [data]
 * @returns {Handlebars.SafeString}
 */
export function langHTML(key, data = {}) {
  return new Handlebars.SafeString(formatHTML(key, data));
}


/**
 * Lang lines as paragraphs (templates/chat/paragraphs.hbs), values escaped: a confirm dialog's question, or the lines
 * of a short chat card.
 * @param {...{key: string, data?: object}} lines   Each a lang key and its values (see formatHTML).
 * @returns {string}  HTML
 */
export function paragraphsHTML(...lines) {
  return renderTemplateSync("systems/lotm/templates/chat/paragraphs.hbs", { lines });
}


/**
 * Mark HTML that's already safe (rendered by a template), so it can be a lotmLang value without being escaped again.
 * @param {string} html
 * @returns {Handlebars.SafeString}
 */
export function safeHTML(html) {
  return new Handlebars.SafeString(html ?? "");
}


/** Register {{lotmLang}} and {{lotmHTML}}. Called once from the init hook in lotm.mjs. */
export function registerRenderHelpers() {
  Handlebars.registerHelper("lotmLang", (key, ...args) => {
    const options = args.pop();
    const values = (args[0] && typeof args[0] === "object") ? args[0] : {};
    return langHTML(key, { ...values, ...(options?.hash ?? {}) });
  });
  Handlebars.registerHelper("lotmHTML", safeHTML);
}
