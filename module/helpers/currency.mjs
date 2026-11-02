/**
 * Money: currencies, prices, purses and deposits.
 *
 * How money is stored
 *   Every amount is a whole number in its currency's smallest coin, so adding and subtracting never rounds:
 *     Loen    pennies   (£1 = 20 soli = 240 pennies; from the rulebook's "Price conversion")
 *     Intis   coppet    (1 verl d'or = 100 coppet)
 *     Feysac  kopek
 *   Item values (gear.value, container.value) are always stored in Loen pennies, because the rulebook prices
 *   everything in gold pounds. They're converted to other currencies only for display.
 *   Cash lives on purse / wallet gear (gear.money) and in the actor's deposits (actor.storedMoney),
 *   one balance per currency: { loen: 1250, intis: 300 }.
 *
 * Exchange rates
 *   The rulebook only uses Loen money. The other currencies' rates are world settings the GM can change
 *   (Game Settings > Configure Settings > System), stated as "how many of its main coin buy one gold pound".
 */

const SYSTEM = "lotm";
const L = "LORD_OF_THE_MYSTERIES.Currency";

/** The reference currency. Item values are stored in its smallest coin (the penny). */
export const BASE_CURRENCY = "loen";

/**
 * The currencies. Add a nation by adding an entry here and its labels in en.json; a rate setting is made for it.
 *   label        Localization key for its name.
 *   defaultRate  How many of its main coin (units[0]) buy one gold pound. Loen is always 1.
 *   rateSource   Where the default came from, shown in the setting's hint.
 *   units        Coins, biggest first. size = how many of the smallest coin it's worth.
 *                aliases = what players can type for it (lower case). The first unit is used for a bare number.
 */
export const CURRENCIES = {
  loen: {
    label: `${L}.Names.loen`,
    defaultRate: 1,
    units: [
      { key: "pound", size: 240, aliases: ["gold pounds", "gold pound", "pounds", "pound", "gp", "£", "l"] },
      { key: "soli",  size: 12,  aliases: ["soli", "solis", "sules", "sule", "sol", "s"] },
      { key: "penny", size: 1,   aliases: ["copper pennies", "pennies", "penny", "pence", "d", "p"] },
    ],
  },
  intis: {
    label: `${L}.Names.intis`,
    defaultRate: 20,          // Placeholder: no source gives a pound / verl d'or rate. Roughly 1 verl d'or = 1 soli.
    rateSource: `${L}.Settings.RateGuess`,
    units: [
      { key: "verl",   size: 100, aliases: ["verl d'or", "verl d’or", "verls", "verl", "vd", "v"] },
      { key: "coppet", size: 1,   aliases: ["coppets", "coppet", "c"] },
    ],
  },
  feysac: {
    label: `${L}.Names.feysac`,
    defaultRate: 5.5,         // Fan wiki: "1 Gold pound = 5.5 Gold hoorn".
    rateSource: `${L}.Settings.RateWiki`,
    units: [
      { key: "hoorn",     size: 100, aliases: ["gold hoorns", "gold hoorn", "hoorns", "hoorn", "h"] },   // Feysilver / kopek ratios are a placeholder:
      { key: "feysilver", size: 10,  aliases: ["feysilvers", "feysilver", "f"] },                        // the wiki only says the system is base ten.
      { key: "kopek",     size: 1,   aliases: ["kopeks", "kopek", "k"] },
    ],
  },
};

/** Where money can be: "stored" (deposits, not on the person) or a purse Item's id. */
export const STORED = "stored";


/* -------------------------------------------- */
/*  Settings                                    */
/* -------------------------------------------- */

/** Setting key for a currency's exchange rate ("intisRate"). */
function rateSetting(key) {
  return `${key}Rate`;
}

/** Re-draw open sheets after a money setting changes, so prices show in the new currency / rate. */
function rerenderSheets() {
  for (const app of foundry.applications.instances.values()) {
    if (app.document instanceof Actor || app.document instanceof Item) app.render();
  }
}

/** Register the money settings. Called from the init hook in lotm.mjs. */
export function registerCurrencySettings() {
  game.settings.register(SYSTEM, "localCurrency", {
    name: `${L}.Settings.Local.Name`,
    hint: `${L}.Settings.Local.Hint`,
    scope: "world",
    config: true,
    type: String,
    choices: Object.fromEntries(Object.entries(CURRENCIES).map(([key, currency]) => [key, currency.label])),
    default: BASE_CURRENCY,
    onChange: rerenderSheets,
  });

  game.settings.register(SYSTEM, "exchangeFee", {
    name: `${L}.Settings.Fee.Name`,
    hint: `${L}.Settings.Fee.Hint`,
    scope: "world",
    config: true,
    type: Number,
    range: { min: 0, max: 50, step: 0.5 },
    default: 0,
    onChange: rerenderSheets,
  });

  for (const [key, currency] of Object.entries(CURRENCIES)) {
    if (key === BASE_CURRENCY) continue;
    game.settings.register(SYSTEM, rateSetting(key), {
      name: `${L}.Settings.Rate.${key}`,
      hint: currency.rateSource ?? `${L}.Settings.RateGuess`,
      scope: "world",
      config: true,
      type: Number,
      default: currency.defaultRate,
      onChange: rerenderSheets,
    });
  }
}

/** The currency the GM says the party is using now. Prices are shown in it. */
export function localCurrency() {
  const key = game.settings.get(SYSTEM, "localCurrency");
  return key in CURRENCIES ? key : BASE_CURRENCY;
}

/** Exchange fee, as a fraction (5% -> 0.05). */
export function exchangeFee() {
  return Math.clamp(Number(game.settings.get(SYSTEM, "exchangeFee")) || 0, 0, 100) / 100;
}

/** How many of this currency's main coin buy one gold pound. */
export function rateOf(key) {
  if (key === BASE_CURRENCY) return 1;
  const rate = Number(game.settings.get(SYSTEM, rateSetting(key)));
  return rate > 0 ? rate : CURRENCIES[key].defaultRate;
}


/* -------------------------------------------- */
/*  Conversion                                  */
/* -------------------------------------------- */

/** Pennies in one gold pound. */
const PENCE_PER_POUND = CURRENCIES.loen.units[0].size;

/** How many of a currency's smallest coin make one gold pound (Intis at 20: 2000 coppet). */
function smallestPerPound(key) {
  return rateOf(key) * CURRENCIES[key].units[0].size;
}

/**
 * Convert an amount between currencies, at the GM's rates. Not rounded: round when showing or storing.
 * @param {number} amount   In the smallest coin of `from`.
 * @param {string} from
 * @param {string} to
 * @returns {number}        In the smallest coin of `to`.
 */
export function convert(amount, from, to) {
  if (from === to) return amount;
  const pence = amount * PENCE_PER_POUND / smallestPerPound(from);
  return pence * smallestPerPound(to) / PENCE_PER_POUND;
}

/** Round down, ignoring floating-point dust (1999.9999999 -> 2000). */
function floorSafe(value) {
  return Math.floor(value + 1e-7);
}

/**
 * What an exchange pays out: the amount is converted, the fee taken, and the result rounded down
 * (the money changer keeps the scraps).
 * @param {number} amount   In the smallest coin of `from`.
 * @param {string} from
 * @param {string} to
 * @returns {{received: number, fee: number}}   received in `to`'s smallest coin; fee in `from`'s smallest coin.
 */
export function exchangeQuote(amount, from, to) {
  const fee = Math.round(amount * exchangeFee());
  const received = floorSafe(convert(amount - fee, from, to));
  return { received: Math.max(0, received), fee };
}


/* -------------------------------------------- */
/*  Showing amounts                             */
/* -------------------------------------------- */

/** "£3 4s 6d", "12 verl d'or 50 coppet". Amount is a whole number in the currency's smallest coin. */
export function formatMoney(amount, key = BASE_CURRENCY) {
  const currency = CURRENCIES[key] ?? CURRENCIES[BASE_CURRENCY];
  const unitText = (unit, n) => game.i18n.format(`${L}.Units.${unit.key}`, { n: n.toLocaleString() });

  let rest = Math.max(0, Math.round(amount));
  if (rest === 0) return unitText(currency.units[0], 0);
  const parts = [];
  for (const unit of currency.units) {
    const n = Math.floor(rest / unit.size);
    rest -= n * unit.size;
    if (n > 0) parts.push(unitText(unit, n));
  }
  return parts.join(" ");
}

/**
 * Show an item value (Loen pennies) in another currency. Rounded to that currency's smallest coin;
 * something worth less than one of them shows as "< 1 coppet" rather than "0".
 * @param {number} pence
 * @param {string} key
 */
export function formatValue(pence, key = localCurrency()) {
  if (key === BASE_CURRENCY) return formatMoney(pence, key);
  const amount = Math.round(convert(pence, BASE_CURRENCY, key));
  if (amount === 0 && pence > 0) {
    return game.i18n.format(`${L}.LessThan`, { amount: formatMoney(1, key) });
  }
  return formatMoney(amount, key);
}

/**
 * The same value in every other currency, for a tooltip: "≈ 20 verl d'or · ≈ 5 gold hoorn 5 feysilver".
 * @param {number} pence
 * @param {string} shown   The currency already on screen, left out of the list.
 */
export function valueTooltip(pence, shown = localCurrency()) {
  return Object.keys(CURRENCIES)
    .filter((key) => key !== shown)
    .map((key) => (key === BASE_CURRENCY ? formatMoney(pence, key) : `≈ ${formatValue(pence, key)}`))
    .join(" · ");
}

/** A balance object ({ loen: 1250, intis: 0 }) as "£5 4s 2d, 3 verl d'or". Empty currencies are skipped. */
export function formatBalances(balances) {
  return Object.keys(CURRENCIES)
    .filter((key) => (balances?.[key] ?? 0) > 0)
    .map((key) => formatMoney(balances[key], key))
    .join(", ");
}

/** A balance object's total worth, in Loen pennies. */
export function balancesInPence(balances) {
  return Object.entries(balances ?? {}).reduce((sum, [key, amount]) =>
    sum + (key in CURRENCIES ? convert(amount ?? 0, key, BASE_CURRENCY) : 0), 0);
}


/* -------------------------------------------- */
/*  Typing amounts                              */
/* -------------------------------------------- */

/**
 * Read a typed amount: "£3 4s 6d", "3 pounds 10 soli", "2.5s", "8d", "12 verl d'or 50 c", or a bare number
 * (counted in the currency's main coin: "5" in Loen is £5).
 * @param {string} text
 * @param {string} key      Which currency the text is in.
 * @returns {number|null}   A whole number in the currency's smallest coin, or null if it can't be read.
 */
export function parseMoney(text, key = BASE_CURRENCY) {
  const currency = CURRENCIES[key];
  if (!currency) return null;
  let rest = String(text ?? "").toLowerCase().replace(/,/g, " ").replace(/\band\b/g, " ").trim();
  if (!rest) return 0;

  // "£3" -> "3 £", so every coin name comes after its number.
  rest = rest.replace(/£\s*(\d+(?:\.\d+)?)/g, "$1 £");

  // Swap each coin name for a placeholder, longest names first, so "s" can't eat the "s" in "soli".
  const aliases = currency.units
    .flatMap((unit, index) => unit.aliases.map((alias) => ({ alias, index })))
    .sort((a, b) => b.alias.length - a.alias.length);
  for (const { alias, index } of aliases) {
    const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    // Letter aliases must stand alone ("d" but not the "d" in "bad"); "£" can touch anything.
    const pattern = /^[a-z]/.test(alias)
      ? new RegExp(`(?<![a-z])${escaped}(?![a-z'’])`, "g")
      : new RegExp(escaped, "g");
    rest = rest.replace(pattern, ` \u0001${index}\u0001 `);
  }

  let total = 0;
  let read = false;
  const token = /(\d+(?:\.\d+)?)\s*(?:\u0001(\d+)\u0001)?/g;
  rest = rest.replace(token, (match, number, unitIndex) => {
    const unit = currency.units[unitIndex === undefined ? 0 : Number(unitIndex)];
    total += Number(number) * unit.size;
    read = true;
    return " ";
  });

  // Anything left (a coin name with no number, a word we don't know) means the text wasn't understood.
  if (!read || rest.replace(/\s+/g, "") !== "") return null;
  return Math.round(total);
}


/* -------------------------------------------- */
/*  Balances on an actor                        */
/* -------------------------------------------- */

/** Purse / wallet Items on the actor. */
export function purses(actor) {
  return actor?.items.filter((item) => item.type === "gear" && item.system.isPurse) ?? [];
}

/** Is this purse on the character (not in a bag that was left behind)? */
function purseCarried(actor, purse) {
  return actor.system.carrying?.gear?.[purse.id]?.place !== "leftBehind";
}

/** One location's balance in one currency. */
function balanceAt(actor, location, key) {
  if (location === STORED) return actor.system.storedMoney?.[key] ?? 0;
  return actor.items.get(location)?.system.money?.[key] ?? 0;
}

/** A location's name for the dialog and chat. */
function locationName(actor, location) {
  if (location === STORED) return game.i18n.localize("LORD_OF_THE_MYSTERIES.Money.Stored");
  return actor.items.get(location)?.name ?? "?";
}

/**
 * Everything the Inventory tab's money panel shows.
 * @param {Actor} actor
 */
export function buildMoneyView(actor) {
  const local = localCurrency();
  const keys = Object.keys(CURRENCIES);
  const onPerson = Object.fromEntries(keys.map((key) => [key, 0]));
  let leftBehindPence = 0;   // cash in purses left in a bag somewhere: not on the person, but still theirs

  const purseRows = purses(actor).map((purse) => {
    const carried = purseCarried(actor, purse);
    const money = purse.system.money ?? {};
    if (carried) for (const key of keys) onPerson[key] += money[key] ?? 0;
    else leftBehindPence += balancesInPence(money);
    return {
      id: purse.id,
      uuid: purse.uuid,
      name: purse.name,
      img: purse.img,
      carried,
      balance: formatBalances(money) || game.i18n.localize("LORD_OF_THE_MYSTERIES.Money.Empty"),
    };
  });

  const stored = actor.system.storedMoney ?? {};
  const depositsMissing = !actor.system.storedMoney;   // old actor data model: see runTransaction
  const worth = balancesInPence(onPerson) + leftBehindPence + balancesInPence(stored);

  return {
    purses: purseRows,
    noPurse: purseRows.length === 0,
    onPerson: formatBalances(onPerson) || game.i18n.localize("LORD_OF_THE_MYSTERIES.Money.Empty"),
    stored: depositsMissing
      ? game.i18n.localize("LORD_OF_THE_MYSTERIES.Money.DepositsMissing")
      : (formatBalances(stored) || game.i18n.localize("LORD_OF_THE_MYSTERIES.Money.Empty")),
    worth: formatValue(worth, local),
    worthTooltip: valueTooltip(worth, local),
    localLabel: game.i18n.localize(CURRENCIES[local].label),
  };
}


/* -------------------------------------------- */
/*  Receive / Pay / Move / Exchange             */
/* -------------------------------------------- */

const escape = (text) => Handlebars.escapeExpression(text);

/** <option> list. */
function options(entries, selected) {
  return entries.map(([value, label]) =>
    `<option value="${escape(value)}"${value === selected ? " selected" : ""}>${escape(label)}</option>`).join("");
}

/** "£1 = 20 verl d'or = 5.5 gold hoorn · Exchange fee 2%" for the dialog. */
function ratesLine() {
  const rates = Object.entries(CURRENCIES).map(([key, currency]) =>
    game.i18n.format(`${L}.Units.${currency.units[0].key}`, { n: rateOf(key).toLocaleString() }));
  const fee = game.i18n.format("LORD_OF_THE_MYSTERIES.Money.FeeLine", { fee: (exchangeFee() * 100).toLocaleString() });
  return `${rates.join(" = ")} · ${fee}`;
}

/**
 * Open the dialog for a money transaction and carry it out.
 *   receive   Add money to a purse or deposits.
 *   pay       Take money out of a purse or deposits.
 *   move      Move money between purses / deposits (same currency, no fee).
 *   exchange  Change one currency into another in the same purse / deposits (exchange fee taken).
 * @param {Actor} actor
 * @param {"receive"|"pay"|"move"|"exchange"} mode
 */
export async function openMoneyDialog(actor, mode) {
  const M = "LORD_OF_THE_MYSTERIES.Money";
  const localize = (key) => game.i18n.localize(key);

  // Places money can be: carried purses first, then left-behind ones, then deposits.
  const places = purses(actor)
    .sort((a, b) => Number(!purseCarried(actor, a)) - Number(!purseCarried(actor, b)))
    .map((purse) => [purse.id, purseCarried(actor, purse) ? purse.name : `${purse.name} (${localize(`${M}.LeftBehind`)})`]);
  places.push([STORED, localize(`${M}.Stored`)]);
  const firstPlace = places[0][0];

  const currencyOptions = Object.entries(CURRENCIES).map(([key, currency]) => [key, localize(currency.label)]);
  const local = localCurrency();
  const otherCurrency = Object.keys(CURRENCIES).find((key) => key !== local) ?? local;

  const field = (label, html) => `<div class="form-group"><label>${localize(label)}</label><div class="form-fields">${html}</div></div>`;
  const select = (name, entries, selected) => `<select name="${name}">${options(entries, selected)}</select>`;

  const rows = [];
  if (mode === "pay" || mode === "move") rows.push(field(`${M}.From`, select("from", places, firstPlace)));
  if (mode === "exchange") rows.push(field(`${M}.Where`, select("from", places, firstPlace)));
  if (mode === "receive") rows.push(field(`${M}.To`, select("to", places, firstPlace)));
  if (mode === "move") rows.push(field(`${M}.To`, select("to", places, STORED)));
  rows.push(field(mode === "exchange" ? `${M}.ExchangeFrom` : `${M}.Currency`, select("currency", currencyOptions, local)));
  rows.push(field(`${M}.Amount`, `<input type="text" name="amount" placeholder="${escape(localize(`${M}.AmountPlaceholder`))}" autofocus>`));
  if (mode === "exchange") rows.push(field(`${M}.ExchangeTo`, select("toCurrency", currencyOptions, otherCurrency)));
  rows.push(field(`${M}.Note`, `<input type="text" name="note" placeholder="${escape(localize(`${M}.NotePlaceholder`))}">`));
  if (mode === "exchange") rows.push(`<p class="hint">${escape(ratesLine())}</p>`);
  rows.push(`<p class="hint">${escape(localize(`${M}.AmountHint`))}</p>`);

  const data = await foundry.applications.api.DialogV2.prompt({
    window: { title: localize(`${M}.Modes.${mode}`) },
    classes: ["lotm", "money-dialog"],
    content: rows.join(""),
    ok: {
      label: localize(`${M}.Modes.${mode}`),
      callback: (event, button) => new foundry.applications.ux.FormDataExtended(button.form).object,
    },
    rejectClose: false,
  });
  if (!data) return;
  return runTransaction(actor, mode, data);
}

/**
 * Carry out a transaction from the dialog's form data. Checks there's enough money, then saves every change
 * at once and posts a line to chat so the GM can see where the money went.
 */
export async function runTransaction(actor, mode, data) {
  const M = "LORD_OF_THE_MYSTERIES.Money";
  const warn = (key, values = {}) => ui.notifications.warn(game.i18n.format(`${M}.Errors.${key}`, values));

  const currency = data.currency;
  if (!(currency in CURRENCIES)) return;

  // Deposits are a field on the actor (storedMoney in base-actor.mjs). If the actor's data model doesn't have it,
  // Foundry would quietly drop the deposit half of the transaction and the money would vanish, so stop first.
  const usesStored = [data.from, data.to].includes(STORED);
  if (usesStored && !actor.system.storedMoney) return warn("NoDeposits");
  const amount = parseMoney(data.amount, currency);
  if (amount === null) return warn("BadAmount", { text: data.amount ?? "" });
  if (amount <= 0) return warn("ZeroAmount");

  // location -> currency -> new balance
  const changes = {};
  const current = (location, key) => changes[location]?.[key] ?? balanceAt(actor, location, key);
  const set = (location, key, value) => { (changes[location] ??= {})[key] = value; };
  const take = (location) => {
    const have = current(location, currency);
    if (have < amount) {
      warn("NotEnough", { place: locationName(actor, location), have: formatMoney(have, currency), need: formatMoney(amount, currency) });
      return false;
    }
    set(location, currency, have - amount);
    return true;
  };

  let message;
  const shown = formatMoney(amount, currency);
  switch (mode) {
    case "receive": {
      set(data.to, currency, current(data.to, currency) + amount);
      message = game.i18n.format(`${M}.Chat.receive`, { amount: shown, place: locationName(actor, data.to) });
      break;
    }
    case "pay": {
      if (!take(data.from)) return;
      message = game.i18n.format(`${M}.Chat.pay`, { amount: shown, place: locationName(actor, data.from) });
      break;
    }
    case "move": {
      if (data.from === data.to) return warn("SamePlace");
      if (!take(data.from)) return;
      set(data.to, currency, current(data.to, currency) + amount);
      message = game.i18n.format(`${M}.Chat.move`, { amount: shown, from: locationName(actor, data.from), to: locationName(actor, data.to) });
      break;
    }
    case "exchange": {
      const to = data.toCurrency;
      if (!(to in CURRENCIES) || to === currency) return warn("SameCurrency");
      const { received, fee } = exchangeQuote(amount, currency, to);
      if (received <= 0) return warn("TooSmall");
      if (!take(data.from)) return;
      set(data.from, to, current(data.from, to) + received);
      message = game.i18n.format(`${M}.Chat.exchange`, {
        amount: shown, received: formatMoney(received, to), fee: formatMoney(fee, currency), place: locationName(actor, data.from),
      });
      break;
    }
    default: return;
  }

  // Save: deposits on the actor, purses as one batch of Item updates. Money is only ever added once
  // the subtraction it pays for has been checked above, and both halves go to fields that exist.
  const actorUpdate = {};
  const itemUpdates = [];
  for (const [location, balances] of Object.entries(changes)) {
    if (location === STORED) {
      for (const [key, value] of Object.entries(balances)) actorUpdate[`system.storedMoney.${key}`] = value;
    } else {
      const update = { _id: location };
      for (const [key, value] of Object.entries(balances)) update[`system.money.${key}`] = value;
      itemUpdates.push(update);
    }
  }
  if (itemUpdates.length) await actor.updateEmbeddedDocuments("Item", itemUpdates);
  if (Object.keys(actorUpdate).length) await actor.update(actorUpdate);

  const note = String(data.note ?? "").trim();
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: `<p class="lotm-money-log"><i class="fa-solid fa-coins"></i> ${escape(message)}${note ? `<br><em>${escape(note)}</em>` : ""}</p>`,
  });
}
