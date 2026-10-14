// The page loads its data file first (pokemon.js), which supplies the roster, pictures, pools,
// starting lineups and EDITION details.
(() => {
  "use strict";

  // Logical canvas size: the original graphic's 1536x1024 field plus a strip of headroom on top so
  // tall safeties keep their heads on the image. Drawn at 2x for crisp exports.
  const W = 1536;
  const FIELD_H = 1024;
  const TOP_PAD = 40;
  const H = FIELD_H + TOP_PAD;
  const SCALE = 2;
  const FONT = '"Roboto Condensed", "Arial Narrow", Arial, sans-serif';
  const OFF_COLOR = "#f2c230";
  const DEF_COLOR = "#5bc0f8";
  const K_COLOR = "#c4b5fd"; // special teams (the kicker)

  // Spots in the base formation (3-4 defense, fullback offense), on the original 1024-tall field.
  // Each slot: label centre (lx, ly), sprite box size (s). Sprites stand on top of their label
  // unless an explicit sprite centre x (sx) / foot line (sb) is given. "look" is the direction a
  // player should face so everyone looks toward the middle of the field (center column: as drawn).
  const BASE_SLOTS = [
    // Defense
    { id: "S1", pos: "S", side: "D", lx: 528, ly: 112, s: 96, look: "R" },
    { id: "S2", pos: "S", side: "D", lx: 1012, ly: 112, s: 96, look: "L" },
    { id: "CB1", pos: "CB", side: "D", lx: 180, ly: 312, s: 132, look: "R" },
    { id: "OLB1", pos: "OLB", side: "D", lx: 398, ly: 262, s: 116, look: "R" },
    { id: "ILB1", pos: "ILB", side: "D", lx: 626, ly: 262, s: 116, look: "R" },
    { id: "ILB2", pos: "ILB", side: "D", lx: 912, ly: 262, s: 116, look: "L" },
    { id: "OLB2", pos: "OLB", side: "D", lx: 1135, ly: 262, s: 116, look: "L" },
    { id: "CB2", pos: "CB", side: "D", lx: 1373, ly: 315, s: 132, look: "L" },
    { id: "DE1", pos: "DE", side: "D", lx: 550, ly: 416, s: 124, look: "R" },
    { id: "NT", pos: "NT", side: "D", lx: 767, ly: 416, s: 140 },
    { id: "DE2", pos: "DE", side: "D", lx: 982, ly: 418, s: 124, look: "L" },
    // Offense
    { id: "WR1", pos: "WR", side: "O", lx: 157, ly: 626, s: 128, look: "R" },
    { id: "LT", pos: "LT", side: "O", lx: 372, ly: 623, s: 132, look: "R" },
    { id: "LG", pos: "LG", side: "O", lx: 512, ly: 623, s: 132, look: "R" },
    { id: "C", pos: "C", side: "O", lx: 670, ly: 618, s: 132 },
    { id: "RG", pos: "RG", side: "O", lx: 860, ly: 620, s: 132, look: "L" },
    { id: "RT", pos: "RT", side: "O", lx: 1032, ly: 622, s: 132, look: "L" },
    { id: "TE", pos: "TE", side: "O", lx: 1193, ly: 627, s: 132, look: "L" },
    { id: "WR2", pos: "WR", side: "O", lx: 1388, ly: 626, s: 128, look: "L" },
    { id: "QB", pos: "QB", side: "O", lx: 771, ly: 752, s: 120 },
    { id: "FB", pos: "FB", side: "O", lx: 821, ly: 819, s: 122, sx: 690, sb: 878 },
    { id: "HB", pos: "HB", side: "O", lx: 766, ly: 989, s: 122 },
  ];
  // Other schemes move and relabel some spots. A spot keeps its id in every scheme, so a lineup
  // carries over: the 4-3 turns the NT and one ILB into tackles and the other ILB into the middle
  // linebacker (the safeties and outside linebackers shift to keep everyone in view), and the slot
  // offense sends the fullback out as a slot receiver.
  const SCHEME_SPOTS = {
    "43": {
      S1: { lx: 340 }, S2: { lx: 1196 },
      OLB1: { lx: 548 }, ILB1: { pos: "MLB", lx: 767, s: 120, look: null }, OLB2: { lx: 985 },
      DE1: { lx: 440 }, NT: { pos: "DT", lx: 657, s: 132, look: "R" },
      ILB2: { pos: "DT", lx: 877, ly: 416, s: 132 }, DE2: { lx: 1094 },
    },
    // With no fullback, the lone back is the RB and lines up a touch closer.
    slot: { FB: { pos: "WR", lx: 268, ly: 748, s: 124, look: "R", sx: null, sb: null }, HB: { pos: "RB", ly: 966 } },
  };
  // The builder's optional kicker, in the bottom-right corner.
  const KICKER = { id: "K", pos: "K", side: "K", lx: 1295, ly: 925, s: 112, look: "L" };
  // Every spot any formation uses, in share-link order.
  const SPOT_IDS = [...BASE_SLOTS.map((s) => s.id), KICKER.id];
  const BASE_IDS = new Set(BASE_SLOTS.map((s) => s.id));
  // Formation: defense "34" or "43", offense "fb" (fullback) or "slot" (slot receiver), and the
  // kicker on or off (builder only).
  const DEFAULT_SCHEME = { def: "34", off: "fb", k: false };
  const isScheme = (sc) => Boolean(sc) && (sc.def === "34" || sc.def === "43") && (sc.off === "fb" || sc.off === "slot");
  const LABEL_H = 42;
  // Visible-area target: a 1.6 m Pokémon covers about (slot size × SPRITE_MASS)² pixels.
  const SPRITE_MASS = 0.76;
  // Backstop only: no sprite may rise past this far below the top edge. With the headroom strip
  // the regular size caps already keep every sprite well clear of it.
  const TOP_MARGIN = 6;

  // Each pool keeps its own saved lineup (Gen 1 keeps the original key so lineups carry over).
  // Keys start with the edition's prefix; changing it would lose everyone's saved lineups.
  const STORAGE_KEYS = Object.fromEntries(Object.keys(GENERATIONS).map((g) =>
    [g, `${EDITION.key}-lineup-${g === "1" ? "" : g === "all" ? "all-" : `gen${g}-`}v1`]));
  const STYLE_KEY = `${EDITION.key}-style-v1`;
  const GEN_KEY = `${EDITION.key}-gen-v1`;
  const MODE_KEY = `${EDITION.key}-mode-v1`;
  const DRAFT_KEY = `${EDITION.key}-draft-v1`;
  const DRAFT_STATS_KEY = `${EDITION.key}-draft-stats-v1`;
  const SCHEME_KEY = `${EDITION.key}-formation-v1`;
  const LEGENDS_KEY = `${EDITION.key}-legends-v1`;
  // The builder's shiny choices: { v, plain: { pool ("1"…"9" or "all", "L" with Legendaries): { t, ids } } }, the
  // players each pool's lineup shows in their usual colors though the account has them shiny. Syncs (saves.js).
  const SHINY_KEY = `${EDITION.key}-shiny-v1`;
  // The two challenges each keep their own run and lifetime stats (the 17–0 Challenge keeps the
  // original keys).
  const CHALLENGES = {
    "17-0": { name: "17–0 Challenge", runKey: DRAFT_KEY, statsKey: DRAFT_STATS_KEY },
    151: { name: "151 Challenge", runKey: `${EDITION.key}-151-v1`, statsKey: `${EDITION.key}-151-stats-v1` },
  };
  // Lineups with Legendaries switched on are saved apart from the plain ones, so switching never
  // throws anyone out.
  const lineupKey = (g, withLegends) => (withLegends ? STORAGE_KEYS[g].replace(/-v1$/, "-legends-v1") : STORAGE_KEYS[g]);

  // The spots on the field right now (they follow the formation in view).
  let SLOTS = [];
  let SLOT_BY_ID = new Map();
  function setSlots(scheme) {
    const spots = scheme.k ? [...BASE_SLOTS, KICKER] : BASE_SLOTS;
    SLOTS = spots.map((base) => {
      const slot = { ...base, ...(SCHEME_SPOTS[scheme.def] || {})[base.id], ...(SCHEME_SPOTS[scheme.off] || {})[base.id] };
      // Move below the headroom strip; sprites stand on their label unless placed explicitly.
      slot.ly += TOP_PAD;
      slot.sb = slot.sb != null ? slot.sb + TOP_PAD : slot.ly - LABEL_H / 2 - 2;
      slot.sx = slot.sx ?? slot.lx;
      return slot;
    });
    SLOT_BY_ID = new Map(SLOTS.map((sl) => [sl.id, sl]));
  }

  // ---------- State ----------
  // "#challenge" (or "#17-0" / "#draft") opens straight into the 17–0 Challenge, "#retro" into its
  // Retro (Gen 1–4) variant and "#151" into the 151 Challenge; "#board" opens the leaderboard (the
  // menu on the other pages links to it); any other hash is a shared lineup.
  const CHALLENGE_HASHES = ["#challenge", "#17-0", "#draft", "#retro", "#151"];
  const BOARD_HASH = "#board";
  const hashGame = (hash) => (hash === "#151" ? "151" : "17-0");
  const wantsDraft = CHALLENGE_HASHES.includes(location.hash.toLowerCase());
  const wantsBoard = location.hash.toLowerCase() === BOARD_HASH;
  const fromHash = wantsDraft || wantsBoard ? null : parseHash(location.hash.slice(1));
  let gen = fromHash ? fromHash.gen : loadSavedGen();
  // Builder: Legendaries on or off (a shared lineup brings its own setting).
  let legends = fromHash ? fromHash.legends : loadSavedLegends();
  let lineup = fromHash ? fromHash.lineup : loadSavedLineup(gen, legends);
  let style = (fromHash && fromHash.style) || loadSavedStyle();
  // The builder's formation (a shared lineup shows the sharer's).
  let builderScheme = (fromHash && fromHash.scheme) || loadSavedScheme();
  // Shinies (see "Shinies" below): the species the signed-in account has found shiny (shown shiny in the builder),
  // this pool's players switched back to their usual colors, and finds still being revealed (usual colors till then).
  let owned = new Set();
  let plain = new Set();
  const revealing = new Set();
  // Builder vs. Draft Mode. A shared lineup link always opens in the builder.
  // The 17–0 Challenge needs its game files (pokedata.js, draft.js). If either failed to load, the
  // builder still works and the challenge's button stays hidden.
  const CHALLENGE_OK = typeof DRAFT !== "undefined" && typeof POKEDATA !== "undefined";
  // The saved mode is "builder", "draft" (the 17–0 Challenge) or "151" (the 151 Challenge).
  const savedMode = loadSavedMode();
  let mode = CHALLENGE_OK && (wantsDraft || (!fromHash && (savedMode === "draft" || savedMode === "151"))) ? "draft" : "builder";
  // Which challenge Draft Mode plays, and each one's run.
  let game = wantsDraft ? hashGame(location.hash.toLowerCase()) : savedMode === "151" ? "151" : "17-0";
  const runs = CHALLENGE_OK ? { "17-0": loadDraft("17-0"), 151: loadDraft("151") } : null;
  let draft = CHALLENGE_OK ? runs[game] : null;
  if (CHALLENGE_OK && location.hash.toLowerCase() === "#retro") offerRetro();
  if (mode === "draft") lineup = draft.lineup;
  if (wantsDraft && CHALLENGE_OK) {
    try { localStorage.setItem(MODE_KEY, modeValue()); } catch (_) { /* ignore */ }
    history.replaceState(null, "", location.pathname + location.search);
  }

  function loadSavedMode() {
    try { return localStorage.getItem(MODE_KEY); } catch (_) { return null; }
  }
  function modeValue() {
    return mode === "draft" && game === "151" ? "151" : mode;
  }

  function loadSavedScheme() {
    try {
      const saved = JSON.parse(localStorage.getItem(SCHEME_KEY) || "null");
      if (isScheme(saved)) return { def: saved.def, off: saved.off, k: saved.k === true };
    } catch (_) { /* storage unavailable or corrupt */ }
    return { ...DEFAULT_SCHEME };
  }

  // The formation on the field: the builder's, or the challenge run's (which has no kicker).
  function viewScheme() {
    return mode === "draft" ? { def: draft.scheme.def, off: draft.scheme.off, k: false } : builderScheme;
  }

  // ---------- Draft run state (the 17–0 Challenge) ----------
  // A run: 22 rounds, each with a rolled region + type; one type reroll and one region reroll per run.
  // A run starts with picking its Pokémon (all nine generations, or Retro: Gen 1–4) and formation,
  // locked in once it starts. Each roll is decided (and saved) up front, then revealed by the rolling
  // animation; until then it shows as unrolled, so reloading can't change it.
  // A 151 Challenge run (game: "151") rolls one Pokémon a round (its roll is { id }), has five
  // Pokémon rerolls instead and no Legendary limit.
  // Started signed in (any account), a run is a leaderboard run: it gets an id and the server deals it from
  // then on (its seed stays secret, and the server keeps the rolls, the step it's on, the final
  // result and its ranks); see api/app.mjs. Any other run keeps its own seed and is played on this
  // device.
  function newDraft(g, scheme = DEFAULT_SCHEME, variant = "all") {
    const seed = crypto.getRandomValues(new Uint32Array(1))[0] | 0;
    const run = { v: 1, seed, round: 0, revealed: false, started: false, scheme: { def: scheme.def, off: scheme.off }, lineup: {}, pending: null };
    if (g === "151") return { ...run, game: "151", roll: DRAFT.rollMon(seed, 0, new Set()), rerolls: { mon: DRAFT.MON_REROLLS } };
    return { ...run, variant, roll: DRAFT.roll(seed, 0, new Set(), false, variant), rerolls: { type: 1, gen: 1 } };
  }

  // Picks a 17–0 run's variant before it starts; its first roll comes from that variant's regions.
  function setVariant(variant) {
    if (game !== "17-0" || draft.started || draft.variant === variant || !Object.prototype.hasOwnProperty.call(DRAFT.VARIANTS, variant)) return;
    draft.variant = variant;
    draft.roll = DRAFT.roll(draft.seed, 0, new Set(), false, variant);
    saveDraft();
  }

  // A "#retro" link sets up a Retro 17–0 run: the next one if the last run is finished, or this one
  // if it hasn't started. A run in progress is left alone.
  function offerRetro() {
    const run = runs["17-0"];
    if (run.round >= DRAFT.ROUNDS) {
      runs["17-0"] = newDraft("17-0", run.scheme, "retro");
    } else if (!run.started && run.variant !== "retro") {
      run.variant = "retro";
      run.roll = DRAFT.roll(run.seed, 0, new Set(), false, "retro");
    } else {
      return;
    }
    saveRun("17-0");
    if (game === "17-0") draft = runs["17-0"];
  }

  function validDraft(d, g) {
    if (!d || d.v !== 1 || !Number.isInteger(d.round) || d.round < 0 || d.round > DRAFT.ROUNDS) return false;
    if (d.id == null ? !Number.isInteger(d.seed) : typeof d.id !== "string" || !Number.isInteger(d.step)) return false;
    if ((d.game || "17-0") !== g) return false;
    if (!d.lineup || typeof d.lineup !== "object" || Object.keys(d.lineup).length !== d.round) return false;
    if (g === "17-0" && !Object.prototype.hasOwnProperty.call(DRAFT.VARIANTS, d.variant)) return false;
    const gens = g === "151" ? ["1"] : DRAFT.VARIANTS[d.variant];
    const seen = new Set();
    for (const [slot, id] of Object.entries(d.lineup)) {
      if (!BASE_IDS.has(slot) || !Number.isInteger(id) || id < 1 || id > POKEMON_NAMES.length || !gens.includes(genOf(id)) || seen.has(id)) return false;
      seen.add(id);
    }
    const rr = d.rerolls;
    if (!rr || typeof rr !== "object") return false;
    if (g === "151" ? !Number.isInteger(rr.mon) || rr.mon < 0 || rr.mon > DRAFT.MON_REROLLS : ![0, 1].includes(rr.type) || ![0, 1].includes(rr.gen)) return false;
    if (!isScheme(d.scheme) || typeof d.started !== "boolean") return false;
    if (!d.started && (d.round > 0 || d.revealed || d.pending != null)) return false;
    if (d.round === DRAFT.ROUNDS) return d.pending == null && (d.id == null || validResult(d.result));
    if (d.revealed === false && d.pending != null) return false;
    const r = d.roll;
    // 151: the rolled Pokémon (one not on the team yet) is the one waiting to be placed.
    if (g === "151") return Boolean(r) && Number.isInteger(r.id) && r.id >= 1 && genOf(r.id) === "1" && !seen.has(r.id) && (d.pending == null || d.pending === r.id);
    // An unfinished run needs a roll that still has Pokémon left, and any picked-but-unplaced
    // Pokémon must come from that roll.
    if (!r || !gens.includes(r.gen) || !TYPE_NAMES.includes(r.type)) return false;
    const options = DRAFT.available(r.gen, r.type, seen);
    if (!options.length) return false;
    return d.pending == null || options.some((p) => p.id === d.pending);
  }

  function validResult(r) {
    return Boolean(r) && Number.isInteger(r.score) && Number.isInteger(r.wins) && Array.isArray(r.games) && r.games.length === DRAFT.GAMES;
  }

  // A run that has used its Legendaries (possible in runs saved before the limit) gets a fresh roll
  // if its current one only has Legendaries left, and can't keep a Legendary waiting to be placed.
  function fitLegendLimit(run) {
    if (run.game === "151" || run.id) return run; // no Legendary limit; the server deals online runs
    const taken = Object.values(run.lineup);
    if (run.round >= DRAFT.ROUNDS || DRAFT.legendsIn(taken) < DRAFT.MAX_LEGENDS) return run;
    const takenSet = new Set(taken);
    if (run.pending != null && LEGENDARIES.has(run.pending)) run.pending = null;
    if (!DRAFT.available(run.roll.gen, run.roll.type, takenSet, true).length) {
      run.roll = DRAFT.roll(run.seed, run.round, takenSet, true, run.variant);
      run.revealed = false;
      run.pending = null;
    }
    return run;
  }

  function loadDraft(g) {
    try {
      const saved = JSON.parse(localStorage.getItem(CHALLENGES[g].runKey) || "null");
      // Runs saved before formations existed played the 3-4 with a fullback; before Retro, every
      // 17–0 run used all nine generations.
      const d = saved && typeof saved === "object"
        ? { scheme: { def: "34", off: "fb" }, ...(g === "17-0" ? { variant: "all" } : {}), ...saved, revealed: saved.revealed !== false }
        : null;
      if (d && typeof d.started !== "boolean") d.started = d.round > 0 || d.revealed || d.pending != null;
      if (validDraft(d, g)) return fitLegendLimit({ ...d, scheme: { def: d.scheme.def, off: d.scheme.off } });
    } catch (_) { /* storage unavailable or corrupt */ }
    return newDraft(g);
  }

  // A pool's saved lineup. The first time Legendaries are switched on, that lineup starts as a copy
  // of the plain one.
  function loadSavedLineup(g, withLegends) {
    try {
      for (const key of withLegends ? [lineupKey(g, true), lineupKey(g, false)] : [lineupKey(g, false)]) {
        const saved = JSON.parse(localStorage.getItem(key) || "null");
        if (saved && typeof saved === "object") return sanitize(saved, g, withLegends);
      }
    } catch (_) { /* storage unavailable */ }
    return { ...DEFAULT_LINEUPS[g] };
  }

  function loadSavedLegends() {
    try { return localStorage.getItem(LEGENDS_KEY) === "1"; } catch (_) { return false; }
  }

  // The builder's current pool: this generation, with or without Legendaries.
  const builderPool = () => POOLS[legends ? "legends" : "plain"][gen];

  // Pools are keyed "1"–"9" and "all".
  function isGen(g) {
    return typeof g === "string" && Object.prototype.hasOwnProperty.call(GENERATIONS, g);
  }

  function loadSavedGen() {
    try {
      const saved = localStorage.getItem(GEN_KEY);
      if (isGen(saved)) return saved;
    } catch (_) { /* storage unavailable */ }
    return DEFAULT_GEN;
  }

  // Own-property check so names like "__proto__" or "constructor" from a hash aren't accepted.
  function isStyle(name) {
    return typeof name === "string" && Object.prototype.hasOwnProperty.call(SPRITE_STYLES, name);
  }

  function loadSavedStyle() {
    try {
      const saved = localStorage.getItem(STYLE_KEY);
      if (isStyle(saved)) return saved;
    } catch (_) { /* storage unavailable */ }
    return DEFAULT_STYLE;
  }

  // Keep only valid, non-duplicate Pokémon from pool g (single-generation pools never mix), and
  // Legendaries only when they're switched on. Spots the current formation doesn't show (a benched
  // kicker) are kept too.
  function sanitize(obj, g, withLegends) {
    const out = {};
    const used = new Set();
    for (const spot of SPOT_IDS) {
      const id = Number(obj[spot]);
      const p = ROSTER_BY_ID.get(id);
      if (p && (g === "all" || p.gen === g) && (withLegends || !p.legendary) && !used.has(id)) {
        out[spot] = id;
        used.add(id);
      }
    }
    return out;
  }

  // Share hash: base-36 dex numbers for the 22 spots ("0" = empty; a 23rd when the kicker is on),
  // then "~style", "~pool" (1–9 or all) and "~formation" ("34f", "43s", "34fk": defense, offense
  // and kicker, plus "L" when Legendaries are on).
  const schemeCode = (sc) => `${sc.def}${sc.off === "slot" ? "s" : "f"}${sc.k ? "k" : ""}`;
  function encodeHash() {
    const spots = builderScheme.k ? SPOT_IDS : SPOT_IDS.slice(0, BASE_SLOTS.length);
    const ids = spots.map((spot) => (lineup[spot] ? lineup[spot].toString(36) : "0")).join("-");
    return `${ids}~${viewStyle()}~${gen}~${schemeCode(builderScheme)}${legends ? "L" : ""}`;
  }

  function parseHash(str) {
    if (!str) return null;
    const [ids, styleName, genPart, schemePart] = str.split("~");
    const parts = ids.split("-");
    if (parts.length !== BASE_SLOTS.length && parts.length !== SPOT_IDS.length) return null;
    const nums = parts.map((part) => parseInt(part, 36));
    // Links made before Gen 2 existed have no pool; tell it from the Pokémon in them.
    let g = genPart;
    if (!isGen(g)) {
      const first = nums.find((n) => ROSTER_BY_ID.has(n));
      g = first ? genOf(first) : DEFAULT_GEN;
    }
    const obj = {};
    nums.forEach((n, i) => { obj[SPOT_IDS[i]] = n; });
    // Links made before formations existed are the 3-4 with a fullback; before the Legendaries
    // switch, without them.
    const m = /^(34|43)([fs])(k?)(L?)$/.exec(schemePart || "");
    const scheme = m ? { def: m[1], off: m[2] === "s" ? "slot" : "fb", k: m[3] === "k" } : { ...DEFAULT_SCHEME, k: parts.length === SPOT_IDS.length };
    const withLegends = Boolean(m && m[4]);
    return { gen: g, lineup: sanitize(obj, g, withLegends), style: isStyle(styleName) ? styleName : null, scheme, legends: withLegends };
  }

  function save() {
    try {
      localStorage.setItem(lineupKey(gen, legends), JSON.stringify(lineup));
      localStorage.setItem(STYLE_KEY, style);
      localStorage.setItem(GEN_KEY, gen);
      localStorage.setItem(SCHEME_KEY, JSON.stringify(builderScheme));
      localStorage.setItem(LEGENDS_KEY, legends ? "1" : "0");
    } catch (_) { /* ignore */ }
    if (location.hash) history.replaceState(null, "", location.pathname + location.search);
  }

  // The style actually drawn: the chosen one, or Pixel when this pool has no sprites in it
  // (Retro only exists for Gen 1–2). The choice itself is kept for when you switch back.
  function viewStyle() {
    return styleCovers(style, stylePool()) ? style : "pixel";
  }

  // Draft lineups mix every generation, so they follow the same sprite rules as the "All" pool.
  // (The 151 Challenge's are all Gen 1, so Retro sprites work there.)
  function stylePool() {
    return mode === "draft" ? (game === "151" ? "1" : "all") : gen;
  }

  function saveStyle() {
    try { localStorage.setItem(STYLE_KEY, style); } catch (_) { /* ignore */ }
    // Viewing a shared lineup: keep the link, just update its style.
    if (location.hash) history.replaceState(null, "", `#${encodeHash()}`);
  }

  function slotOf(pokemonId) {
    return SLOTS.find((s) => lineup[s.id] === pokemonId);
  }

  // ---------- Artwork loading (trimmed to visible pixels) ----------
  const art = new Map(); // "style:id" -> { status, canvas, tries, failedAt, retryAfter }
  const artFailures = new Map(); // "style:id" -> failed load cycles so far (drives the backoff)
  const AUTO_RETRY_CYCLES = 3;

  // shiny: draw this one shiny (by default as the field shows it: isShiny).
  function getArt(id, shiny = isShiny(id)) {
    const st = viewStyle();
    const key = `${st}:${id}${shiny ? ":s" : ""}`;
    let entry = art.get(key);
    // A sprite that failed earlier (e.g. a brief network hiccup) gets another chance on a later
    // render, waiting longer after each failed cycle (5s, 10s, 20s ... up to 2 min).
    if (entry && entry.status === "error" && performance.now() - entry.failedAt > entry.retryAfter) {
      art.delete(key);
      entry = null;
    }
    if (entry) return entry;
    entry = { status: "loading", canvas: null, tries: 0, failedAt: 0, retryAfter: 0, key };
    art.set(key, entry);
    loadArt(entry, shiny ? shinyUrl(st, id) : spriteUrl(st, id));
    return entry;
  }

  // User asked again (e.g. Download): retry failed sprites right away instead of waiting out the backoff.
  function retryFailedArt() {
    for (const slot of SLOTS) {
      const key = `${viewStyle()}:${lineup[slot.id]}${isShiny(lineup[slot.id]) ? ":s" : ""}`;
      const entry = art.get(key);
      if (entry && entry.status === "error") art.delete(key);
    }
  }

  function loadArt(entry, url) {
    const img = new Image();
    img.onload = () => {
      entry.canvas = trimImage(img);
      entry.status = "ready";
      artFailures.delete(entry.key);
      scheduleRender();
    };
    img.onerror = () => {
      entry.tries += 1;
      if (entry.tries < 3) {
        setTimeout(() => loadArt(entry, url), 800 * entry.tries);
        return;
      }
      const cycles = (artFailures.get(entry.key) || 0) + 1;
      artFailures.set(entry.key, cycles);
      entry.status = "error";
      entry.failedAt = performance.now();
      entry.retryAfter = Math.min(5000 * 2 ** (cycles - 1), 120000);
      scheduleRender();
      // Only nudge a re-render for the first few cycles; after that, retries wait for the next render.
      if (cycles <= AUTO_RETRY_CYCLES) setTimeout(scheduleRender, entry.retryAfter + 100);
    };
    img.src = url;
  }

  function trimImage(img) {
    const c = document.createElement("canvas");
    c.width = img.naturalWidth;
    c.height = img.naturalHeight;
    const cx = c.getContext("2d", { willReadFrequently: true });
    cx.drawImage(img, 0, 0);
    let data;
    try {
      data = cx.getImageData(0, 0, c.width, c.height).data;
    } catch (_) {
      return c;
    }
    let minX = c.width, minY = c.height, maxX = -1, maxY = -1, opaque = 0;
    for (let y = 0; y < c.height; y++) {
      for (let x = 0; x < c.width; x++) {
        if (data[(y * c.width + x) * 4 + 3] > 12) {
          opaque++;
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }
    if (maxX < 0) return c;
    const t = document.createElement("canvas");
    t.width = maxX - minX + 1;
    t.height = maxY - minY + 1;
    t.getContext("2d").drawImage(c, minX, minY, t.width, t.height, 0, 0, t.width, t.height);
    t.opaque = opaque; // visible pixel count, used to size sprites by how much they cover
    return t;
  }

  // ---------- Field ----------
  // Field coordinates: y = 0 is the top of the original field; the headroom strip is y < 0.
  const leftSide = (y) => 152 - (140 * y) / FIELD_H;
  const rightSide = (y) => 1384 + (140 * y) / FIELD_H;
  const widthScale = (y) => (rightSide(y) - leftSide(y)) / (rightSide(455) - leftSide(455));
  // Five-yard lines, spaced wider toward the bottom for a bit of perspective.
  const YARD_LINES = [-92, 28, 148, 290, 455, 665, 880, 1100];

  function mulberry32(a) {
    return () => {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function buildFieldLayer() {
    const c = document.createElement("canvas");
    c.width = W * SCALE;
    c.height = H * SCALE;
    const g = c.getContext("2d");
    g.scale(SCALE, SCALE);
    g.translate(0, TOP_PAD); // draw in field coordinates; the strip above the field is y < 0
    const top = -TOP_PAD;

    // Base turf
    const base = g.createLinearGradient(0, top, 0, FIELD_H);
    base.addColorStop(0, "#438530");
    base.addColorStop(0.5, "#478b31");
    base.addColorStop(1, "#3c7a2a");
    g.fillStyle = base;
    g.fillRect(0, top, W, H);

    // Mowing stripes between yard lines
    for (let i = 0; i < YARD_LINES.length - 1; i++) {
      const y0 = YARD_LINES[i];
      const y1 = YARD_LINES[i + 1];
      const mid = (y0 + y1) / 2;
      g.fillStyle = i % 2 ? "rgba(255,255,255,0.025)" : "rgba(0,0,0,0.035)";
      g.fillRect(0, y0, W, mid - y0);
      g.fillStyle = i % 2 ? "rgba(0,0,0,0.035)" : "rgba(255,255,255,0.025)";
      g.fillRect(0, mid, W, y1 - mid);
    }

    // Grass texture
    const rand = mulberry32(22);
    for (let i = 0; i < 26000; i++) {
      const x = rand() * W;
      const y = top + rand() * H;
      const light = rand() > 0.5;
      g.fillStyle = light
        ? `rgba(140,200,90,${0.05 + rand() * 0.08})`
        : `rgba(10,40,5,${0.05 + rand() * 0.1})`;
      g.fillRect(x, y, 1 + rand() * 1.5, 2 + rand() * 3);
    }

    // Vignette
    const cy = top + H / 2;
    const vig = g.createRadialGradient(W / 2, cy, H * 0.35, W / 2, cy, W * 0.75);
    vig.addColorStop(0, "rgba(0,0,0,0)");
    vig.addColorStop(1, "rgba(0,0,0,0.28)");
    g.fillStyle = vig;
    g.fillRect(0, top, W, H);

    g.strokeStyle = "rgba(255,255,255,0.82)";
    g.lineCap = "round";

    const line = (x0, y0, x1, y1, w) => {
      g.lineWidth = w;
      g.beginPath();
      g.moveTo(x0, y0);
      g.lineTo(x1, y1);
      g.stroke();
    };

    // Sidelines + outer boundary
    const y0 = top - 10;
    const y1 = FIELD_H + 10;
    line(leftSide(y0), y0, leftSide(y1), y1, 6);
    line(rightSide(y0), y0, rightSide(y1), y1, 6);
    line(leftSide(y0) - 140, y0, leftSide(y1) - 140, y1, 4);
    line(rightSide(y0) + 140, y0, rightSide(y1) + 140, y1, 4);

    // Yard lines
    for (const y of YARD_LINES) {
      line(leftSide(y), y, rightSide(y), y, 3.5 + widthScale(y) * 1.2);
    }

    // One-yard ticks along sidelines, outer boundary, inbound hashes and centre
    for (let i = 0; i < YARD_LINES.length - 1; i++) {
      const y0 = YARD_LINES[i];
      const y1 = YARD_LINES[i + 1];
      for (let k = 1; k <= 4; k++) {
        const y = y0 + ((y1 - y0) * k) / 5;
        const s = widthScale(y);
        const tick = 20 * s;
        const w = 2.5 * s + 0.5;
        line(leftSide(y) + 6, y, leftSide(y) + 6 + tick, y, w);
        line(rightSide(y) - 6, y, rightSide(y) - 6 - tick, y, w);
        line(leftSide(y) - 140 + 4, y, leftSide(y) - 140 + 4 + tick, y, w);
        line(rightSide(y) + 140 - 4, y, rightSide(y) + 140 - 4 - tick, y, w);
        const hashOff = 133 * s;
        const hashW = 9 * s;
        line(W / 2 - hashOff - hashW, y, W / 2 - hashOff + hashW, y, w);
        line(W / 2 + hashOff - hashW, y, W / 2 + hashOff + hashW, y, w);
        line(W / 2 - 4 * s, y, W / 2 + 4 * s, y, w);
      }
    }
    return c;
  }

  // ---------- Drawing ----------
  const canvas = document.getElementById("field");
  canvas.width = W * SCALE;
  canvas.height = H * SCALE;
  const ctx = canvas.getContext("2d");
  let fieldLayer = null;

  // On the field (or another canvas, c: the share card). Built from arcs, since canvas roundRect() is missing
  // before iOS 16.
  function roundRect(x, y, w, h, r, c = ctx) {
    c.beginPath();
    c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r);
    c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r);
    c.arcTo(x, y, x + w, y, r);
    c.closePath();
  }

  function spriteRect(slot, img, pixelated, id) {
    const s = slot.s;
    // Size by visible area rather than bounding box, so a wide-but-flat sprite (Metapod) doesn't
    // look as big as a tall one (Kabutops); then scale by the Pokémon's real-world height.
    const mass = Math.sqrt(img.opaque || img.width * img.height * 0.55);
    let fit = ((s * SPRITE_MASS) / mass) * sizeFactor(id);
    // Keep very tall or wide sprites from towering over or spilling into their neighbours.
    // ...and from running off the top of the field (the safeties stand close to the top edge).
    const maxH = slot.sb - TOP_MARGIN;
    fit = Math.min(fit, (s * 1.2) / img.height, (s * 1.2) / img.width, maxH / img.height);
    if (pixelated) {
      // Whole-number scaling on device-pixel boundaries keeps every sprite pixel the same size.
      // Round to the nearest multiple, but never more than ~6% past the target size or the top edge.
      let k = Math.max(1, Math.round(fit * SCALE));
      if (k > 1 && k > fit * SCALE * 1.06) k -= 1;
      while (k > 1 && img.height * k > maxH * SCALE) k -= 1;
      const wd = img.width * k;
      const hd = img.height * k;
      const xd = Math.round(slot.sx * SCALE - wd / 2);
      const yd = Math.round(slot.sb * SCALE) - hd;
      return { x: xd / SCALE, y: yd / SCALE, w: wd / SCALE, h: hd / SCALE };
    }
    const w = img.width * fit;
    const h = img.height * fit;
    return { x: slot.sx - w / 2, y: slot.sb - h, w, h };
  }

  function drawShadow(cx, cy, rx) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(1, 0.22);
    const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, rx);
    grad.addColorStop(0, "rgba(0,0,0,0.45)");
    grad.addColorStop(0.6, "rgba(0,0,0,0.22)");
    grad.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(0, 0, rx, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // Loaded sprite + where it goes, or null while the slot is empty / still loading.
  function readySprite(slot) {
    const id = lineup[slot.id];
    if (!id) return null;
    const entry = getArt(id);
    if (entry.status !== "ready") return null;
    const pixelated = SPRITE_STYLES[viewStyle()].pixelated;
    return { id, entry, pixelated, r: spriteRect(slot, entry.canvas, pixelated, id) };
  }

  function drawGroundShadow(slot) {
    const sp = readySprite(slot);
    if (sp) drawShadow(slot.sx, slot.sb - 2, Math.max(sp.r.w * 0.5, 30));
  }

  function drawSprite(slot) {
    const id = lineup[slot.id];
    if (!id) {
      drawEmpty(slot);
      return;
    }
    const sp = readySprite(slot);
    if (!sp) {
      drawPlaceholder(slot, getArt(id).status === "error");
      return;
    }
    const { entry, pixelated, r } = sp;
    // Mirror sprites that face away from the middle of the field.
    const facing = spriteFacing(viewStyle(), id);
    const mirror = Boolean(slot.look) && facing !== "F" && facing !== slot.look;
    ctx.save();
    ctx.imageSmoothingEnabled = !pixelated;
    ctx.shadowColor = "rgba(0,0,0,0.35)";
    ctx.shadowBlur = 8;
    ctx.shadowOffsetY = 3;
    if (mirror) {
      ctx.translate(r.x + r.w, r.y);
      ctx.scale(-1, 1);
      ctx.drawImage(entry.canvas, 0, 0, r.w, r.h);
    } else {
      ctx.drawImage(entry.canvas, r.x, r.y, r.w, r.h);
    }
    ctx.restore();
    if (exporting && isShiny(id)) drawShinyMark(r);
  }

  // A shiny on the saved image and the share card: two small stars at its shoulder, so it reads as shiny there too
  // (on screen its sparkles twinkle instead: updateSparks).
  let exporting = false;
  function drawShinyMark(r) {
    const R = Math.max(8, Math.min(14, r.w * 0.12));
    const x = Math.min(r.x + r.w * 0.94, W - R - 2);
    const y = Math.max(r.y + R * 0.4, R + 2);
    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,0.6)";
    ctx.shadowBlur = 4;
    starPath(ctx, x, y, R);
    ctx.fillStyle = "#ffd34d";
    ctx.fill();
    starPath(ctx, x - R * 1.15, y + R * 1.05, R * 0.55);
    ctx.fillStyle = "#fff7d0";
    ctx.fill();
    ctx.restore();
  }
  function starPath(c, x, y, R) {
    const r = R * 0.3;
    c.beginPath();
    c.moveTo(x, y - R);
    c.lineTo(x + r, y - r);
    c.lineTo(x + R, y);
    c.lineTo(x + r, y + r);
    c.lineTo(x, y + R);
    c.lineTo(x - r, y + r);
    c.lineTo(x - R, y);
    c.lineTo(x - r, y - r);
    c.closePath();
  }

  // On screen each shiny player on the field has three small stars twinkling around it (broadcast.css .shy-sparks),
  // positioned in fractions of the field so they follow it at any size. Rebuilt only when they move.
  const sparksEl = document.createElement("div");
  sparksEl.className = "shy-sparks";
  sparksEl.setAttribute("aria-hidden", "true");
  canvas.after(sparksEl);
  const SPARK_SPOTS = [[0.93, 0.1, 22, 0], [0.05, 0.42, 15, 0.9], [0.86, 0.8, 13, 1.7]]; // x, y (of the sprite), size, delay
  let sparksSig = "";
  function updateSparks() {
    const boxes = [];
    for (const slot of SLOTS) {
      const id = lineup[slot.id];
      if (!id || !isShiny(id)) continue;
      const sp = readySprite(slot);
      if (sp) boxes.push(sp.r);
    }
    const sig = boxes.map((r) => [r.x, r.y, r.w, r.h].map(Math.round).join()).join(";");
    if (sig === sparksSig) return;
    sparksSig = sig;
    sparksEl.replaceChildren(...boxes.flatMap((r, n) => SPARK_SPOTS.map(([fx, fy, size, delay]) => {
      const el = document.createElement("i");
      el.style.left = `${((r.x + r.w * fx) / W) * 100}%`;
      el.style.top = `${((r.y + r.h * fy) / H) * 100}%`;
      el.style.width = `${(size / W) * 100}%`;
      el.style.animationDelay = `${delay + n * 0.43}s`;
      return el;
    })));
  }

  function drawEmpty(slot) {
    const r = slot.s * 0.36;
    const cy = slot.sb - slot.s * 0.45;
    ctx.save();
    ctx.setLineDash([8, 7]);
    ctx.lineWidth = 3;
    ctx.strokeStyle = "rgba(255,255,255,0.55)";
    ctx.fillStyle = "rgba(0,0,0,0.18)";
    ctx.beginPath();
    ctx.arc(slot.sx, cy, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.lineWidth = 5;
    ctx.strokeStyle = "rgba(255,255,255,0.8)";
    ctx.beginPath();
    ctx.moveTo(slot.sx - r * 0.4, cy);
    ctx.lineTo(slot.sx + r * 0.4, cy);
    ctx.moveTo(slot.sx, cy - r * 0.4);
    ctx.lineTo(slot.sx, cy + r * 0.4);
    ctx.stroke();
    ctx.restore();
  }

  function drawPlaceholder(slot, failed) {
    const cy = slot.sb - slot.s * 0.45;
    ctx.save();
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.beginPath();
    ctx.arc(slot.sx, cy, slot.s * 0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.fillStyle = "#fff";
    ctx.font = `700 26px ${FONT}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(failed ? "!" : "…", slot.sx, cy);
    ctx.restore();
  }

  function labelName(slot) {
    const id = lineup[slot.id];
    return id ? nameOf(id).toUpperCase() : "EMPTY";
  }

  // Long names (e.g. "IRON JUGULIS") shrink to fit their tag instead of widening it into neighbours.
  const NAME_MAX_W = 124;
  function setNameFont(name) {
    ctx.font = `700 17px ${FONT}`;
    const w = ctx.measureText(name).width;
    if (w <= NAME_MAX_W) return w;
    ctx.font = `700 ${Math.max(12, Math.floor((17 * NAME_MAX_W) / w))}px ${FONT}`;
    return Math.min(w, NAME_MAX_W);
  }

  // How well a Pokémon fits a spot (0–100). The 17–0 Challenge never shows these numbers, so
  // where each Pokémon belongs stays the player's call; only the Team Score is revealed.
  const fitOf = (id, slotId) => Math.round(DRAFT.positionScore(id, slotId, draft.scheme));

  function drawLabelBox(slot) {
    const name = labelName(slot);
    const w = Math.max(112, setNameFont(name) + 30);
    const x = slot.lx - w / 2;
    const y = slot.ly - LABEL_H / 2;

    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,0.45)";
    ctx.shadowBlur = 8;
    ctx.shadowOffsetY = 2;
    roundRect(x, y, w, LABEL_H, 5);
    ctx.fillStyle = "rgba(9,13,17,0.94)";
    ctx.fill();
    ctx.restore();

    roundRect(x + 0.75, y + 0.75, w - 1.5, LABEL_H - 1.5, 4.5);
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = "rgba(255,255,255,0.22)";
    ctx.stroke();
  }

  function drawLabelText(slot) {
    const id = lineup[slot.id];
    const name = labelName(slot);
    ctx.save();
    // Soft dark halo keeps the text legible where a neighbour's wing or limb overlaps the tag.
    ctx.shadowColor = "rgba(0,0,0,0.85)";
    ctx.shadowBlur = 3;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = id ? "#ffffff" : "rgba(255,255,255,0.55)";
    setNameFont(name);
    ctx.fillText(name, slot.lx, slot.ly - 9);
    ctx.fillStyle = slot.side === "D" ? DEF_COLOR : slot.side === "K" ? K_COLOR : OFF_COLOR;
    ctx.font = `700 15px ${FONT}`;
    ctx.fillText(slot.pos, slot.lx, slot.ly + 10);
    ctx.restore();
  }

  // Finished 17–0 Challenge runs get the game's name, record and Team Score in the strip above the
  // field. The banner stays narrower than the gap between the two safeties, whose heads can reach
  // into that strip.
  const BANNER_MAX_W = 360;
  let hideBanner = false; // the share card has its own, bigger header
  function drawRecordBanner() {
    const res = draftResult();
    if (!res || hideBanner) return;
    const perfect = res.wins === DRAFT.GAMES;
    const name = game === "151" ? "151 CHALLENGE" : draft.variant === "retro" ? "17–0 CHALLENGE · RETRO" : "17–0 CHALLENGE";
    const rest = `   ${res.wins}–${res.losses}  ·  TEAM SCORE ${res.score}`;
    ctx.save();
    let size = 19;
    ctx.font = `800 ${size}px ${FONT}`;
    while (size > 12 && ctx.measureText(name + rest).width + 36 > BANNER_MAX_W) {
      size -= 1;
      ctx.font = `800 ${size}px ${FONT}`;
    }
    const nameW = ctx.measureText(name).width;
    const w = ctx.measureText(name + rest).width + 36;
    const h = 30;
    const x = W / 2 - w / 2;
    const y = 6;
    ctx.shadowColor = "rgba(0,0,0,0.45)";
    ctx.shadowBlur = 8;
    roundRect(x, y, w, h, 15);
    ctx.fillStyle = "rgba(9,13,17,0.94)";
    ctx.fill();
    ctx.shadowColor = "transparent";
    roundRect(x + 0.75, y + 0.75, w - 1.5, h - 1.5, 14.5);
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = perfect ? OFF_COLOR : "rgba(255,255,255,0.25)";
    ctx.stroke();
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillStyle = OFF_COLOR;
    ctx.fillText(name, x + 18, y + h / 2 + 1);
    ctx.fillStyle = perfect ? OFF_COLOR : "#ffffff";
    ctx.fillText(rest, x + 18 + nameW, y + h / 2 + 1);
    ctx.restore();
  }

  // Builder lineups carry the site's address, small and faint, in the bottom-right corner (they get
  // posted around; the challenges' images have their own banner). It sits just inside the sideline,
  // clear of the yard-line ticks.
  function drawWatermark() {
    ctx.save();
    ctx.font = `800 36px ${FONT}`;
    ctx.textAlign = "right";
    ctx.textBaseline = "alphabetic";
    ctx.fillStyle = "rgba(0,0,0,0.38)";
    ctx.fillText("all22pokemon.com", W - 74, H - 24);
    ctx.restore();
  }

  function render() {
    if (!fieldLayer) fieldLayer = buildFieldLayer();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(fieldLayer, 0, 0);
    ctx.setTransform(SCALE, 0, 0, SCALE, 0, 0);
    // Ground shadows, tag boxes, sprites (so wings and limbs aren't hidden), then tag text on top
    // so no sprite covers a name. Back rows first so lower players overlap the ones behind them.
    const order = [...SLOTS].sort((a, b) => a.sb - b.sb);
    for (const slot of order) drawGroundShadow(slot);
    for (const slot of order) drawLabelBox(slot);
    for (const slot of order) drawSprite(slot);
    for (const slot of order) drawLabelText(slot);
    if (mode === "draft") drawRecordBanner();
    else drawWatermark();
    updateSparks();
  }

  let renderQueued = false;
  function scheduleRender() {
    if (renderQueued) return;
    renderQueued = true;
    requestAnimationFrame(() => {
      renderQueued = false;
      render();
    });
  }

  // ---------- Hotspots (click / keyboard / drag) ----------
  const hotspotsEl = document.getElementById("hotspots");
  const hotspotEls = new Map();

  function hotspotBounds(slot) {
    const labelW = 128;
    const top = slot.sb - slot.s;
    const left = Math.min(slot.sx - slot.s * 0.55, slot.lx - labelW / 2);
    const right = Math.max(slot.sx + slot.s * 0.55, slot.lx + labelW / 2);
    const bottom = slot.ly + LABEL_H / 2;
    return { left, top, width: right - left, height: bottom - top, tagLeft: slot.lx - labelW / 2, tagWidth: labelW };
  }

  // (Re)builds the tap targets for the spots in the current formation.
  function buildHotspots() {
    hotspotsEl.replaceChildren();
    hotspotEls.clear();
    for (const slot of SLOTS) {
      const b = hotspotBounds(slot);
      const el = document.createElement("button");
      el.className = "hotspot";
      el.type = "button";
      el.dataset.slot = slot.id;
      Object.assign(el.style, {
        left: `${(b.left / W) * 100}%`,
        top: `${(b.top / H) * 100}%`,
        width: `${(b.width / W) * 100}%`,
        height: `${(b.height / H) * 100}%`,
      });
      // Its name tag takes taps over any other spot reaching across it (the fullback's spot covers the
      // bottom of the QB's tag): broadcast.css puts this box, in fractions of the spot's, above every spot.
      el.style.setProperty("--tag-l", (b.tagLeft - b.left) / b.width);
      el.style.setProperty("--tag-w", b.tagWidth / b.width);
      el.style.setProperty("--tag-h", LABEL_H / b.height);
      el.addEventListener("pointerdown", onPointerDown);
      // Opening from "click" (not pointerup) matters on touchscreens: the tap's click is
      // dispatched after pointerup and would otherwise land on the freshly opened picker.
      el.addEventListener("click", () => {
        if (mode === "draft") { draftSlotClick(slot.id); return; }
        // Swallow only the click that ends a drag on this same slot.
        const swallow = dragClick && dragClick.slot === slot.id && performance.now() < dragClick.until;
        dragClick = null;
        if (swallow) return;
        openPicker(slot.id);
      });
      hotspotsEl.appendChild(el);
      hotspotEls.set(slot.id, el);
    }
    updateHotspotLabels();
  }

  function updateHotspotLabels() {
    for (const slot of SLOTS) {
      const id = lineup[slot.id];
      let label;
      if (mode === "builder") label = `${slot.pos}: ${id ? nameOf(id) : "empty"}. Change player`;
      else if (id) label = `${slot.pos}: ${nameOf(id)}, locked in`;
      else if (!draft.started) label = `${slot.pos}: open`;
      else if (draft.pending) label = `${slot.pos}: open. Place ${nameOf(draft.pending)} here`;
      else label = `${slot.pos}: open. ${draft.revealed ? "Choose a Pokémon" : "Roll this round"}`;
      hotspotEls.get(slot.id).setAttribute("aria-label", label);
    }
  }

  let drag = null;
  let dragClick = null; // { slot, until } for the click a mouse drag fires on its source slot

  function onPointerDown(e) {
    if (mode === "draft") return; // drafted players are locked in place
    if (e.button !== 0 || drag) return; // ignore a second finger while dragging
    dragClick = null;
    const el = e.currentTarget;
    drag = { pointerId: e.pointerId, from: el.dataset.slot, el, startX: e.clientX, startY: e.clientY, active: false, ghost: null, over: null };
    el.setPointerCapture(e.pointerId);
    el.addEventListener("pointermove", onPointerMove);
    el.addEventListener("pointerup", onPointerUp);
    el.addEventListener("pointercancel", onPointerCancel);
  }

  function onPointerMove(e) {
    if (!drag || e.pointerId !== drag.pointerId) return;
    const dist = Math.hypot(e.clientX - drag.startX, e.clientY - drag.startY);
    if (!drag.active && dist > 8 && lineup[drag.from]) {
      drag.active = true;
      drag.el.classList.add("dragging");
      const ghost = document.createElement("img");
      ghost.className = "ghost";
      ghost.alt = "";
      ghost.src = (isShiny(lineup[drag.from]) ? shinyUrl : spriteUrl)(viewStyle(), lineup[drag.from]);
      ghost.classList.toggle("pixelated", SPRITE_STYLES[viewStyle()].pixelated);
      document.body.appendChild(ghost);
      drag.ghost = ghost;
    }
    if (!drag.active) return;
    drag.ghost.style.left = `${e.clientX}px`;
    drag.ghost.style.top = `${e.clientY}px`;
    const target = slotAtPoint(e.clientX, e.clientY);
    if (target !== drag.over) {
      if (drag.over) hotspotEls.get(drag.over).classList.remove("drop-target");
      drag.over = target && target !== drag.from ? target : null;
      if (drag.over) hotspotEls.get(drag.over).classList.add("drop-target");
    }
  }

  function slotAtPoint(x, y) {
    const els = document.elementsFromPoint(x, y);
    const hit = els.find((el) => el.classList && el.classList.contains("hotspot"));
    return hit ? hit.dataset.slot : null;
  }

  function endDrag() {
    if (!drag) return;
    drag.el.removeEventListener("pointermove", onPointerMove);
    drag.el.removeEventListener("pointerup", onPointerUp);
    drag.el.removeEventListener("pointercancel", onPointerCancel);
    drag.el.classList.remove("dragging");
    if (drag.ghost) drag.ghost.remove();
    if (drag.over) hotspotEls.get(drag.over).classList.remove("drop-target");
    drag = null;
  }

  function onPointerUp(e) {
    if (!drag || e.pointerId !== drag.pointerId) return;
    const { from, over, active } = drag;
    endDrag();
    if (!active) return; // a plain tap: the click handler opens the picker
    dragClick = { slot: from, until: performance.now() + 400 };
    if (over) swapSlots(from, over);
  }

  function onPointerCancel(e) {
    if (!drag || e.pointerId !== drag.pointerId) return;
    endDrag();
  }

  // ---------- Lineup mutations ----------
  function commit() {
    if (mode !== "builder") return; // Draft Mode keeps its own run state
    save();
    savePlain();
    updateHotspotLabels();
    scheduleRender();
  }

  function swapSlots(a, b) {
    const tmp = lineup[a];
    if (lineup[b]) lineup[a] = lineup[b]; else delete lineup[a];
    if (tmp) lineup[b] = tmp; else delete lineup[b];
    commit();
  }

  // Picking someone already on the field swaps the two; a benched kicker (kicker off) just leaves.
  function assign(slotId, pokemonId) {
    const other = Object.keys(lineup).find((spot) => lineup[spot] === pokemonId && spot !== slotId);
    if (other) {
      if (SLOT_BY_ID.has(other) && lineup[slotId]) lineup[other] = lineup[slotId]; else delete lineup[other];
    } else {
      plain.delete(pokemonId); // a new pick the account has shiny shows shiny
    }
    lineup[slotId] = pokemonId;
    commit();
  }

  // ---------- Stats ----------
  // A Pokémon's types, base stats and weight; null if pokedata.js didn't load (the builder works without them).
  const dataOf = (id) => (typeof POKEDATA !== "undefined" && POKEDATA[id - 1]) || null;
  const STAT_KEYS = [["hp", "HP"], ["atk", "Atk"], ["def", "Def"], ["spa", "SpA"], ["spd", "SpD"], ["spe", "Spe"]];
  const statClass = (v) => (v >= 120 ? "hi" : v < 60 ? "lo" : "");

  // A Pokémon's base stats as a row of cells (greener when high, dimmer when low).
  const statCells = (d) => STAT_KEYS.map(([k, label]) => `<span class="${statClass(d[k])}" data-tip="${k}"><i>${label}</i>${d[k]}</span>`).join("");
  // Size counts too (weight above all for linemen and backs, height for receivers and corners),
  // shown in feet and pounds like a US Pokédex (and a football roster): 6′11″, 1,014.1 lbs.
  const heightText = (id) => {
    const inches = Math.round((HEIGHT_DM[id - 1] * 10) / 2.54);
    return `${Math.floor(inches / 12)}′${String(inches % 12).padStart(2, "0")}″`;
  };
  const weightText = (id) => `${(POKEDATA[id - 1].kg * 2.20462).toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} lbs`;

  // ---------- Player card: hover a player on the field (or press and hold one on a touchscreen) ----------
  // Their types, base stats and size, never how well they fit the spot (the challenges keep that hidden).
  const playerCard = document.createElement("div");
  playerCard.className = "player-card";
  playerCard.id = "player-card";
  playerCard.setAttribute("role", "tooltip");
  playerCard.hidden = true;
  document.body.appendChild(playerCard);
  let cardFor = null; // the hotspot it's showing
  let cardTimer = 0;
  let cardHeld = false; // shown by a press and hold: it stays up until the next touch
  let holdClick = null; // that hotspot, whose click (the press's release) is skipped

  function showCard(el) {
    clearTimeout(cardTimer);
    const slot = SLOT_BY_ID.get(el.dataset.slot);
    const id = slot && lineup[slot.id];
    const d = id && dataOf(id);
    if (!d || (drag && drag.active) || document.querySelector("dialog[open]")) { hideCard(); return; }
    const p = POKEMON_BY_ID.get(id);
    playerCard.innerHTML = `<span class="pl-top"><span class="pos-chip ${{ D: "def", O: "off", K: "st" }[slot.side]}">${slot.pos}</span><b class="nm"></b>` +
      `${p && p.legendary ? '<span class="leg" title="Legendary or Mythical">★</span>' : ""}<span class="num">#${String(id).padStart(3, "0")}</span></span>` +
      `<span class="cand-types">${d.types.map((t) => `<span class="type t-${t}">${capital(t)}</span>`).join("")}</span>` +
      `<span class="cand-stats">${statCells(d)}</span>` +
      `<span class="pl-size">${heightText(id)} · ${weightText(id)}</span>`;
    playerCard.querySelector(".nm").textContent = nameOf(id);
    playerCard.hidden = false;
    if (cardFor && cardFor !== el) cardFor.removeAttribute("aria-describedby");
    cardFor = el;
    el.setAttribute("aria-describedby", playerCard.id);
    // Above the player (below them when there's no room), inside the window.
    const r = el.getBoundingClientRect();
    const w = playerCard.offsetWidth;
    const h = playerCard.offsetHeight;
    const above = r.top - h - 6;
    playerCard.style.left = `${Math.max(8, Math.min(r.left + r.width / 2 - w / 2, innerWidth - w - 8))}px`;
    playerCard.style.top = `${above >= 8 ? above : Math.max(8, Math.min(r.bottom + 6, innerHeight - h - 8))}px`;
  }

  function hideCard() {
    clearTimeout(cardTimer);
    cardHeld = false;
    if (!cardFor) return;
    cardFor.removeAttribute("aria-describedby");
    cardFor = null;
    playerCard.hidden = true;
  }

  const hotspotAt = (target) => (target instanceof Element ? target.closest(".hotspot") : null);
  // Mouse: a moment's pause before the first card (so crossing the field doesn't flash one), then it
  // follows the pointer from player to player.
  hotspotsEl.addEventListener("pointerover", (e) => {
    if (e.pointerType !== "mouse" || drag) return;
    const el = hotspotAt(e.target);
    if (!el || el === cardFor) return;
    clearTimeout(cardTimer);
    if (cardFor) showCard(el);
    else cardTimer = setTimeout(() => showCard(el), 120);
  });
  hotspotsEl.addEventListener("pointerout", (e) => {
    if (e.pointerType === "mouse" && !hotspotAt(e.relatedTarget)) hideCard();
  });
  // Keyboard: the focused player's card.
  hotspotsEl.addEventListener("focusin", (e) => {
    const el = hotspotAt(e.target);
    if (el && el.matches(":focus-visible")) showCard(el);
  });
  hotspotsEl.addEventListener("focusout", () => {
    if (!cardHeld) hideCard();
  });
  // Touch: press and hold a player (without moving) for their card. Letting go leaves it up and
  // skips the tap's usual job (the picker, or a challenge's note); the next touch puts it away.
  let hold = null;
  hotspotsEl.addEventListener("pointerdown", (e) => {
    hideCard();
    holdClick = null;
    const el = hotspotAt(e.target);
    if (e.pointerType === "mouse" || !el || !lineup[el.dataset.slot]) return;
    hold = { pointerId: e.pointerId, x: e.clientX, y: e.clientY };
    cardTimer = setTimeout(() => {
      hold = null;
      showCard(el);
      if (cardFor !== el) return;
      cardHeld = true;
      holdClick = el;
    }, 450);
  });
  hotspotsEl.addEventListener("pointermove", (e) => {
    if (hold && e.pointerId === hold.pointerId && Math.hypot(e.clientX - hold.x, e.clientY - hold.y) > 8) {
      hold = null;
      clearTimeout(cardTimer);
    }
    if (cardHeld && drag && drag.active) hideCard(); // held, then dragged: a move after all
  });
  for (const type of ["pointerup", "pointercancel"]) {
    hotspotsEl.addEventListener(type, () => {
      hold = null;
      if (!cardHeld) clearTimeout(cardTimer);
    });
  }
  hotspotsEl.addEventListener("click", (e) => {
    if (holdClick && hotspotAt(e.target) === holdClick) e.stopPropagation();
    holdClick = null;
  }, true);
  // A long press can bring up a context menu instead.
  hotspotsEl.addEventListener("contextmenu", (e) => {
    if (hotspotAt(e.target)) e.preventDefault();
  });
  document.addEventListener("pointerdown", (e) => {
    if (cardHeld && !hotspotAt(e.target)) hideCard();
  }, true);
  addEventListener("scroll", () => cardFor && hideCard(), true);
  addEventListener("resize", () => cardFor && hideCard());

  // ---------- Picker ----------
  const picker = document.getElementById("picker");
  const pickerGrid = document.getElementById("picker-grid");
  const pickerSearch = document.getElementById("picker-search");
  const pickerPos = document.getElementById("picker-pos");
  const pickerHeading = document.getElementById("picker-heading");
  let pickerSlot = null;
  const monEls = [];
  // Search ignores case and accents ("flabebe" finds Flabébé, "pokemon" finds the Pokémon fighters), and
  // which apostrophe was typed (phones type ’: "farfetch’d" finds Farfetch'd).
  const fold = (s) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[‘’]/g, "'").toLowerCase();

  // Every pop-up opens through showDialog so the guards further down know when it appeared.
  let dialogOpenedAt = 0;
  function showDialog(dialog) {
    dialog.showModal();
    dialogOpenedAt = performance.now();
  }

  // (Re)build the picker for the current generation's pool.
  function buildPickerGrid() {
    pickerGrid.textContent = "";
    monEls.length = 0;
    const frag = document.createDocumentFragment();
    for (const p of builderPool()) {
      const el = document.createElement("button");
      el.type = "button";
      el.className = "mon";
      el.dataset.id = p.id;
      const d = dataOf(p.id);
      el.innerHTML = `<img loading="lazy" alt="" src="${tileIcon(p.id)}" width="72" height="72"><span class="num">#${p.num || String(p.id).padStart(3, "0")}</span><span class="nm"></span>` +
        (p.legendary ? '<span class="leg" title="Legendary or Mythical">★</span>' : "") +
        // Base stats and size on every tile, so a spot can be filled by the numbers.
        (d ? `<span class="ms">${STAT_KEYS.map(([k, label]) => `<span class="${statClass(d[k])}"><i>${label}</i>${d[k]}</span>`).join("")}</span>` +
          `<span class="msz"><span>${heightText(p.id)}</span><span>${weightText(p.id)}</span></span>` : "");
      el.querySelector(".nm").textContent = p.name;
      const img = el.querySelector("img");
      el.classList.toggle("shy", owned.has(p.id));
      el.addEventListener("click", () => {
        assign(pickerSlot, p.id);
        picker.close();
      });
      monEls.push({ el, img, p, shiny: owned.has(p.id), search: fold(`${p.name} ${p.num || p.id}${p.series ? ` ${p.series}` : ""}`) });
      frag.appendChild(el);
    }
    const empty = document.createElement("p");
    empty.className = "empty-msg";
    empty.hidden = true;
    empty.textContent = `No ${EDITION.units} match that search.`;
    frag.appendChild(empty);
    pickerGrid.appendChild(frag);
  }

  function filterPicker() {
    // "#025", "025" and "25" all find #25 (as a number, "025" would only match #1025)
    const q = fold(pickerSearch.value.trim()).replace(/^#/, "").replace(/^0+(?=\d)/, "");
    let shown = 0;
    for (const m of monEls) {
      const match = !q || m.search.includes(q);
      m.el.hidden = !match;
      if (match) shown++;
    }
    pickerGrid.querySelector(".empty-msg").hidden = shown > 0;
  }

  function openPicker(slotId) {
    pickerSlot = slotId;
    const slot = SLOT_BY_ID.get(slotId);
    pickerPos.textContent = slot.pos;
    const side = { D: ["def", "Defense"], O: ["off", "Offense"], K: ["st", "Kicker"] }[slot.side];
    pickerPos.className = `pos-chip ${side[0]}`;
    pickerHeading.textContent = `${side[1]}: pick a ${EDITION.unit}`;
    for (const m of monEls) {
      const at = slotOf(m.p.id);
      m.el.classList.toggle("current", lineup[slotId] === m.p.id);
      let tag = m.el.querySelector(".tag");
      if (at) {
        if (!tag) {
          tag = document.createElement("span");
          m.el.appendChild(tag);
        }
        tag.className = `tag ${{ D: "def", O: "off", K: "st" }[at.side]}`;
        tag.textContent = at.pos;
      } else if (tag) {
        tag.remove();
      }
    }
    pickerSearch.value = "";
    filterPicker();
    syncShinyToggle();
    showDialog(picker);
    pickerGrid.scrollTop = 0;
    // Avoid popping the on-screen keyboard on touch devices.
    if (window.matchMedia("(pointer: fine)").matches) pickerSearch.focus();
  }

  pickerSearch.addEventListener("input", filterPicker);
  pickerSearch.addEventListener("keydown", (e) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    // Ignore a held/doubled Enter from the keypress that opened the picker.
    if (e.repeat || !pickerSearch.value.trim() || performance.now() - dialogOpenedAt < 450) return;
    const first = monEls.find((m) => !m.el.hidden);
    if (first) first.el.click();
  });
  document.getElementById("picker-remove").addEventListener("click", () => {
    delete lineup[pickerSlot];
    commit();
    picker.close();
  });
  // A double-tap/double-click on a slot (or a tap just as a pop-up appears) would otherwise land
  // on whatever tile sits under the finger in the freshly opened pop-up. A press that starts right
  // after opening is ignored (timed from the press, since its click only fires on release), as is
  // any click the OS reports as part of a double-click. Keyboard / Enter clicks (detail 0) still work.
  let swallowDialogClick = false;
  const dialogOf = (e) => (e.target instanceof Element ? e.target.closest("dialog[open]") : null);
  document.addEventListener("pointerdown", (e) => {
    swallowDialogClick = Boolean(dialogOf(e)) && performance.now() - dialogOpenedAt < 450;
    if (swallowDialogClick) e.preventDefault(); // also stops focus jumping to the search box
  }, true);
  document.addEventListener("click", (e) => {
    if (!dialogOf(e) || e.detail === 0) return;
    const age = performance.now() - dialogOpenedAt;
    if (swallowDialogClick || age < 450 || (e.detail > 1 && age < 1500)) {
      e.stopPropagation();
      e.preventDefault();
    }
    swallowDialogClick = false;
  }, true);

  // Backdrop: only a press that starts and ends outside the panel closes it (not clicks on the
  // panel's own padding, and not a text-selection drag that ends past its edge).
  function closeOnBackdrop(dialog) {
    if (!dialog) return; // pop-ups this page doesn't have
    let startedOutside = false;
    const outside = (e) => {
      const r = dialog.getBoundingClientRect();
      return e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom;
    };
    dialog.addEventListener("pointerdown", (e) => { startedOutside = outside(e); });
    dialog.addEventListener("click", (e) => {
      if (e.target === dialog && startedOutside && outside(e)) dialog.close();
      startedOutside = false;
    });
  }
  closeOnBackdrop(picker);

  // ---------- Toolbar ----------
  const toastEl = document.getElementById("toast");
  let toastTimer = 0;
  function toast(msg) {
    const host = document.querySelector("dialog[open]") || document.body;
    if (toastEl.parentNode !== host) host.appendChild(toastEl);
    toastEl.textContent = msg;
    toastEl.classList.add("show");
    clearTimeout(toastTimer);
    // Long enough to read: longer messages stay up longer.
    toastTimer = setTimeout(() => toastEl.classList.remove("show"), Math.max(2200, msg.length * 55));
  }

  function allArtReady() {
    return SLOTS.every((s) => !lineup[s.id] || getArt(lineup[s.id]).status !== "loading");
  }

  async function waitForArt(timeoutMs = 8000) {
    const start = performance.now();
    while (!allArtReady() && performance.now() - start < timeoutMs) {
      await new Promise((r) => setTimeout(r, 100));
    }
  }

  async function downloadImage() {
    await document.fonts.ready;
    retryFailedArt();
    await waitForArt();
    const missing = SLOTS.some((s) => lineup[s.id] && getArt(lineup[s.id]).status !== "ready");
    if (missing) {
      toast("Some sprites didn't load. Check your connection and try again.");
      scheduleRender();
      return;
    }
    exporting = true; // shinies get their stars on the image
    render();
    exporting = false;
    try {
      canvas.toBlob((blob) => {
        if (!blob) { toast("Couldn't create the image, try again."); return; }
        saveBlob(blob, downloadName());
        toast("Lineup saved!");
      }, "image/jpeg", 0.95);
    } catch (_) {
      toast("Couldn't export (artwork blocked). Try reloading.");
    }
    scheduleRender();
  }

  function saveBlob(blob, name) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name;
    // Inside an open pop-up the rest of the page is inert, so the link goes in the pop-up.
    (document.querySelector("dialog[open]") || document.body).appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }

  function downloadName() {
    if (mode === "draft") {
      const res = draftResult();
      const base = game === "151" ? "pokemon-151-challenge" : `pokemon-17-0-challenge${draft.variant === "retro" ? "-retro" : ""}`;
      return res ? `${base}-${res.wins}-${res.losses}.jpg` : `${base}.jpg`;
    }
    return EDITION.fileName(gen);
  }

  document.getElementById("btn-download").addEventListener("click", downloadImage);

  document.getElementById("btn-share").addEventListener("click", async () => {
    const url = `${location.origin}${location.pathname}#${encodeHash()}`;
    try {
      await navigator.clipboard.writeText(url);
      toast("Share link copied!");
    } catch (_) {
      window.prompt("Copy this link:", url);
    }
  });

  document.getElementById("btn-random").addEventListener("click", () => {
    const pool = builderPool().map((p) => p.id);
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    lineup = {};
    SLOTS.forEach((s, i) => { lineup[s.id] = pool[i]; });
    commit();
  });

  document.getElementById("btn-reset").addEventListener("click", () => {
    lineup = { ...DEFAULT_LINEUPS[gen] };
    commit();
  });

  document.getElementById("btn-clear").addEventListener("click", () => {
    if (!confirm("Clear every position?")) return;
    lineup = {};
    commit();
  });

  // ---------- Sprite style ----------
  const styleInputs = [...document.querySelectorAll('input[name="sprite-style"]')];

  function setStyle(next) {
    if (!isStyle(next)) return;
    style = next;
    syncStyleInputs();
    for (const m of monEls) m.img.src = tileIcon(m.p.id);
    if (mode === "draft") updateDraftPanel(); // the waiting pick's thumbnail
    scheduleRender();
  }

  // Show the style actually drawn, and grey out styles the current pool doesn't have.
  function syncStyleInputs() {
    const shown = viewStyle();
    for (const input of styleInputs) {
      const available = styleCovers(input.value, stylePool());
      input.disabled = !available;
      input.checked = input.value === shown;
      input.closest("label").title = available ? "" : "Retro sprites only go up to Gen 2";
    }
    const retroOff = styleInputs.some((input) => input.value === "retro" && input.disabled);
    for (const id of ["retro-note-b", "retro-note-d"]) {
      const note = document.getElementById(id);
      if (note) note.hidden = !retroOff;
    }
  }

  for (const input of styleInputs) {
    input.addEventListener("change", () => {
      if (!input.checked) return;
      setStyle(input.value);
      saveStyle();
    });
  }

  // ---------- Generation ----------
  const genInputs = [...document.querySelectorAll('input[name="gen"]')];
  const genPoolEl = document.getElementById("gen-pool");

  // Sync the switch, subtitle and picker to the current generation.
  function applyGen() {
    for (const input of genInputs) input.checked = input.value === gen;
    if (legendsInput) legendsInput.checked = legends;
    if (genPoolEl) genPoolEl.textContent = (legends && GENERATIONS[gen].poolLegends) || GENERATIONS[gen].pool;
    if (legendNoteEl) legendNoteEl.textContent = legends ? ", Legendaries included" : ", no Legendaries";
    buildPickerGrid();
  }

  // Switch draft pools. Each generation has its own saved lineup, so nothing is lost. A shared
  // lineup being viewed is never saved over the visitor's own; the link is simply dropped.
  function switchGen(next) {
    if (!isGen(next) || next === gen) return;
    gen = next;
    lineup = loadSavedLineup(gen, legends);
    plain = loadPlain();
    try { localStorage.setItem(GEN_KEY, gen); } catch (_) { /* ignore */ }
    if (location.hash) history.replaceState(null, "", location.pathname + location.search);
    applyGen();
    setStyle(style); // picker thumbnails for the new pool
    updateHotspotLabels();
    scheduleRender();
  }

  // Legendaries on/off: like switching generations, each setting keeps its own saved lineup.
  const legendsInput = document.getElementById("legends");
  const legendNoteEl = document.getElementById("legend-note");
  legendsInput?.addEventListener("change", () => {
    legends = legendsInput.checked;
    lineup = loadSavedLineup(gen, legends);
    plain = loadPlain();
    try { localStorage.setItem(LEGENDS_KEY, legends ? "1" : "0"); } catch (_) { /* ignore */ }
    if (location.hash) history.replaceState(null, "", location.pathname + location.search);
    applyGen();
    setStyle(style); // picker thumbnails for the new pool
    updateHotspotLabels();
    scheduleRender();
  });

  for (const input of genInputs) {
    input.addEventListener("change", () => {
      if (input.checked) switchGen(input.value);
    });
  }

  window.addEventListener("hashchange", () => {
    if (location.hash.toLowerCase() === BOARD_HASH) {
      history.replaceState(null, "", location.pathname + location.search);
      if (CHALLENGE_OK) openBoard();
      return;
    }
    if (CHALLENGE_HASHES.includes(location.hash.toLowerCase())) {
      const hash = location.hash.toLowerCase();
      history.replaceState(null, "", location.pathname + location.search);
      if (!CHALLENGE_OK) return;
      const next = hashGame(hash);
      if (hash === "#retro") {
        const before = runs["17-0"];
        offerRetro();
        if (runs["17-0"] !== before && game === "17-0" && seasonDlg.open) seasonDlg.close();
      }
      if (mode === "draft" && game === next) {
        lineup = draft.lineup;
        applyMode();
        return;
      }
      setMode("draft", next);
      return;
    }
    const next = parseHash(location.hash.slice(1));
    if (next) {
      // A shared lineup always opens in the builder (without changing the saved mode).
      if (mode !== "builder") {
        mode = "builder";
        clearTimeout(autoOpenTimer);
      }
      gen = next.gen;
      lineup = next.lineup;
      builderScheme = next.scheme;
      legends = next.legends;
      plain = new Set();
      applyGen();
      setStyle(next.style || style);
      syncFormationInputs();
      applyMode();
    }
  });

  // ---------- Draft Mode ----------
  const $ = (id) => document.getElementById(id);
  const fieldWrap = $("field-wrap");
  const pickDlg = $("draft-pick");
  const seasonDlg = $("season");
  // The wide-screen layout (broadcast.css): pop-ups as windows, the season's details open beside the card.
  const WIDE = window.matchMedia("(min-width: 1000px) and (min-height: 560px)");
  // 22 ticks under the scorebug, one per round.
  const tickEls = [];
  if (CHALLENGE_OK && $("dp-ticks")) {
    for (let i = 0; i < DRAFT.ROUNDS; i++) tickEls.push($("dp-ticks").appendChild(document.createElement("i")));
  }
  const candGrid = $("cand-grid");
  const capital = (t) => t.charAt(0).toUpperCase() + t.slice(1);
  const takenIds = () => new Set(Object.values(draft.lineup));
  const openSlots = () => SLOTS.filter((s) => !draft.lineup[s.id]);
  const draftDone = () => draft.round >= DRAFT.ROUNDS;
  // Legendaries placed so far; once the run has its MAX_LEGENDS, no more can be picked.
  const legendsUsed = () => DRAFT.legendsIn(Object.values(draft.lineup));
  const legendsFull = () => legendsUsed() >= DRAFT.MAX_LEGENDS;
  const recordText = (wins) => `${wins}–${DRAFT.GAMES - wins}`;
  closeOnBackdrop(pickDlg);
  closeOnBackdrop(seasonDlg);

  function saveRun(g) {
    try { localStorage.setItem(CHALLENGES[g].runKey, JSON.stringify(runs[g])); } catch (_) { /* ignore */ }
  }
  function saveDraft() {
    runs[game] = draft;
    saveRun(game);
  }

  // A finished run's Team Score and season: the server's for an online run; worked out from the lineup
  // and seed (and never stored) for one played on this device.
  let resultCache = null;
  function draftResult() {
    if (!draftDone()) return null;
    if (draft.result) return draft.result;
    if (!resultCache || resultCache.draft !== draft) {
      const team = DRAFT.teamScore(draft.lineup, draft.scheme, game === "151" ? "151" : draft.variant);
      resultCache = { draft, value: { ...team, ...DRAFT.simulateSeason(team.score, draft.seed, game) } };
    }
    return resultCache.value;
  }

  // Lifetime stats for finished runs, per challenge.
  function loadStats(g) {
    const n = (v, max) => (Number.isInteger(v) && v >= 0 ? Math.min(v, max) : 0);
    try {
      const s = JSON.parse(localStorage.getItem(CHALLENGES[g].statsKey) || "null");
      if (s && typeof s === "object") {
        return { runs: n(s.runs, 1e9), perfect: n(s.perfect, 1e9), bestScore: n(s.bestScore, 1000), bestWins: n(s.bestWins, DRAFT.GAMES) };
      }
    } catch (_) { /* storage unavailable or corrupt */ }
    return { runs: 0, perfect: 0, bestScore: 0, bestWins: 0 };
  }
  const statsBy = CHALLENGE_OK ? { "17-0": loadStats("17-0"), 151: loadStats("151") } : null;
  let stats = CHALLENGE_OK ? statsBy[game] : null;
  function recordRun(res) {
    draft.counted = true;
    stats.runs += 1;
    if (res.wins === DRAFT.GAMES) stats.perfect += 1;
    stats.bestScore = Math.max(stats.bestScore, res.score);
    stats.bestWins = Math.max(stats.bestWins, res.wins);
    try { localStorage.setItem(CHALLENGES[game].statsKey, JSON.stringify(stats)); } catch (_) { /* ignore */ }
    trackEvent("Season Finished", { game: gameLabel(), wins: res.wins });
  }

  // ----- The server -----
  // Signed-in players' runs are leaderboard runs: the server deals them (see api/app.mjs). Anyone
  // else's run, or one started without a connection, is played on this device and isn't posted.
  let busy = false; // waiting on the server: taps on the run wait too
  // The server takes a move no sooner than this after dealing its roll (people never move faster).
  const MIN_MOVE_MS = 1000;
  let dealtAt = 0; // when the current online roll arrived
  // A reply that never comes (a connection that died on the way) is given up after this long, so the
  // page says so and the move can be tried again, instead of ignoring every tap while it waits.
  const API_TIMEOUT_MS = 20000;

  async function api(action, body) {
    const quit = new AbortController();
    const timer = setTimeout(() => quit.abort(), API_TIMEOUT_MS);
    const res = await fetch(`/api/app?a=${action}`, body
      ? { method: "POST", headers: { "Content-Type": "application/json", ...shinyTestHeader() }, body: JSON.stringify(body), signal: quit.signal }
      : { cache: "no-store", signal: quit.signal }).finally(() => clearTimeout(timer));
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw Object.assign(new Error(data.error || `HTTP ${res.status}`), { status: res.status, data });
    return data;
  }

  // Takes what the server decides about a run (its rolls, picks, rerolls, step and result). Returns
  // whether the run moved on since the page last saw it.
  function adoptServer(run, s) {
    const moved = run.step !== s.step || run.id !== s.id;
    // The lineup object is the one the field draws (lineup), so it's updated in place.
    for (const slot of Object.keys(run.lineup)) if (!(slot in s.lineup)) delete run.lineup[slot];
    Object.assign(run.lineup, s.lineup);
    Object.assign(run, { id: s.id, step: s.step, round: s.round, roll: s.roll, rerolls: { ...s.rerolls }, result: s.result || null, post: s.post || null, shiny: Array.isArray(s.shiny) ? s.shiny : [] });
    delete run.seed;
    if (moved) {
      run.pending = null;
      run.revealed = false;
      dealtAt = performance.now();
    }
    return moved;
  }

  // Catches a run up with the server's copy (a reply lost to a bad connection, another tab). A copy
  // older than the page's (a slow reply) is ignored.
  function catchUp(g, s) {
    const run = runs[g];
    if (!run || run.id !== s.id || s.step < run.step) return;
    const moved = adoptServer(run, s);
    saveRun(g);
    if (run === draft) {
      if (moved) pickDlg.close(); // it showed the old roll's Pokémon
      if (draftDone() && !run.counted) recordRun(draftResult());
      refreshDraft();
    }
  }

  // An online run the server no longer has (they expire after a day), or one replaced by another
  // run the player started (in the other challenge, another tab or another device), finishes on
  // this device.
  function playOnThisDevice(g, message) {
    const run = runs[g];
    delete run.id;
    delete run.step;
    delete run.uid;
    run.result = null;
    run.seed = crypto.getRandomValues(new Uint32Array(1))[0] | 0;
    if (run.round < DRAFT.ROUNDS) {
      const taken = new Set(Object.values(run.lineup));
      run.roll = g === "151" ? DRAFT.rollMon(run.seed, run.round, taken) : DRAFT.roll(run.seed, run.round, taken, DRAFT.legendsIn([...taken]) >= DRAFT.MAX_LEGENDS, run.variant);
      run.pending = null;
      run.revealed = false;
    }
    saveRun(g);
    if (run === draft) {
      pickDlg.close(); // it showed the old roll's Pokémon
      refreshDraft();
    }
    if (message) toast(message);
  }

  // One move in the current online run. The reply is the run as the server now has it, or null
  // if it didn't go through (the page catches up or says why, and the move can be tried again).
  async function serverMove(action, body) {
    if (busy) return null;
    // Signed out in another tab: the run finishes on this device instead (see checkRunAccount).
    if (!hasSignedInFlag()) {
      signedOut();
      checkRunAccount();
      return null;
    }
    const g = game;
    const run = draft;
    busy = true;
    refreshDraft();
    try {
      const early = MIN_MOVE_MS + 100 - (performance.now() - dealtAt);
      if (early > 0) await wait(early);
      const s = await patiently(() => api(action, { id: run.id, step: run.step, ...body }));
      return draft === run && run.id ? s : null; // (not if it finished on this device meanwhile)
    } catch (err) {
      if (err.data && err.data.run) catchUp(g, err.data.run);
      else if (err.status === 410) playOnThisDevice(g, "You started another leaderboard run, so this one finishes on this device and won't count.");
      else if (err.status === 404) playOnThisDevice(g, "The server lost this run, so it finishes on this device and won't count.");
      else toast(err.status ? "That didn't go through. Try again." : "Connection problem. Try again.");
      return null;
    } finally {
      busy = false;
      refreshDraft();
    }
  }

  // Sends a request again, once, if the server says it came too soon (and how long to wait).
  async function patiently(send) {
    try {
      return await send();
    } catch (err) {
      if (err.status !== 429 || !err.data || !err.data.wait) throw err;
      await wait(err.data.wait + 100);
      return send();
    }
  }

  // On load: catch up with any online run still in play.
  async function syncRun(g) {
    const run = runs[g];
    if (!run || !run.id || run.result) return;
    try {
      catchUp(g, await api(`run&id=${encodeURIComponent(run.id)}`));
    } catch (err) {
      if ((err.status === 404 || err.status === 410) && runs[g] === run) playOnThisDevice(g, "");
    }
  }

  // How many people play each challenge: Vercel Web Analytics custom events (cookieless), tagged
  // with the game. Events sent before the analytics script loads wait in its queue; if the script
  // is blocked, nothing is sent and play carries on as normal.
  window.va = window.va || ((...args) => (window.vaq = window.vaq || []).push(args));
  function trackEvent(name, data) {
    try { window.va("event", { name, data }); } catch (_) { /* analytics never gets in the way of play */ }
  }
  const gameLabel = () => (game === "151" ? "151" : draft.variant === "retro" ? "17-0 Retro" : "17-0");

  function setRegionChip(el, gen) {
    const small = document.createElement("small");
    small.textContent = `Gen ${gen}`;
    el.replaceChildren(DRAFT.REGIONS[gen], small);
    el.className = "chip region";
  }
  function setTypeChip(el, type) {
    el.textContent = capital(type);
    el.className = `chip type t-${type}`;
  }
  // Placeholder chip for a round that hasn't been rolled yet (pulses while the reels spin).
  function setBlankChip(el, label) {
    el.textContent = label;
    el.className = `chip blank${rolling ? " spinning" : ""}`;
  }

  function updateDraftPanel() {
    const done = draftDone();
    // Which pieces show (the scorebug, ticks, buttons under the field...): the state, for broadcast.css.
    document.body.dataset.dp = done ? "done" : !draft.started ? "setup" : draft.pending ? "placing" : "turn";
    const roundNo = Math.min(draft.round + 1, DRAFT.ROUNDS);
    for (const el of document.querySelectorAll(".bug-n")) el.textContent = roundNo;
    tickEls.forEach((t, i) => {
      t.classList.toggle("done", i < draft.round);
      t.classList.toggle("now", i === draft.round && draft.started && !done);
    });
    $("bug-legends").textContent = `${legendsUsed()}/${DRAFT.MAX_LEGENDS}`;
    $("bug-rerolls").textContent = draft.rerolls.mon || 0;
    $("retro-badge").hidden = !(draft.started && game === "17-0" && draft.variant === "retro");
    // Only touch the live region when the text changes, so screen readers announce each new round once.
    const roundText = (done ? "Season complete" : !draft.started ? "New run" : `Round ${draft.round + 1} of ${DRAFT.ROUNDS}`) +
      (draft.started && game === "17-0" && draft.variant === "retro" ? " · Retro" : "");
    if ($("dp-round").textContent !== roundText) $("dp-round").textContent = roundText;
    $("dp-bar").style.width = `${(100 * draft.round) / DRAFT.ROUNDS}%`;
    $("dp-restart").hidden = done || !draft.started;
    $("dp-setup").hidden = draft.started;
    $("dp-turn").hidden = done || !draft.started || Boolean(draft.pending);
    $("dp-placing").hidden = done || !draft.pending;
    $("dp-done").hidden = !done;
    if (!draft.started) {
      syncSetupInputs();
      updateBoardLine();
    }
    $("dp-start").disabled = busy;
    $("dp-start").textContent = busy && !draft.started ? "Starting…" : "Start run";
    if (!done && draft.started) {
      const choose = $("dp-choose");
      choose.disabled = rolling || busy;
      if (game === "151") {
        choose.textContent = rolling ? "Rolling…" : "Roll a Pokémon";
        $("dp-rerolls").textContent = draft.pending ? `Round ${roundNo} of ${DRAFT.ROUNDS}` : monRerollsText();
      } else {
        if (draft.revealed) {
          setRegionChip($("dp-region"), draft.roll.gen);
          setTypeChip($("dp-type"), draft.roll.type);
        } else {
          setBlankChip($("dp-region"), "Region ?");
          setBlankChip($("dp-type"), "Type ?");
        }
        choose.textContent = rolling ? "Rolling…" : draft.revealed ? "Choose a Pokémon" : "Roll region & type";
        // (Legendaries used: in the scorebug)
        const left = [draft.rerolls.type && "type", draft.rerolls.gen && "region"].filter(Boolean);
        const rerollsLine = left.length ? `Rerolls left: ${left.join(" and ")}` : "No rerolls left";
        $("dp-rerolls").textContent = draft.pending ? `Round ${roundNo} of ${DRAFT.ROUNDS} · ${rerollsLine}` : rerollsLine;
      }
    }
    if (draft.pending) {
      drawThumb($("dp-pick-img"), draft.pending);
      $("dp-pick-name").textContent = nameOf(draft.pending);
      const pd = POKEDATA[draft.pending - 1];
      $("dp-pick-types").innerHTML = pd.types.map((t) => `<span class="type t-${t}">${capital(t)}</span>`).join("");
      // 151: no list to pick from, so the rolled Pokémon's number, stats and size show here.
      if (game === "151") {
        const d = pd;
        $("dp-pick-num").textContent = `#${String(draft.pending).padStart(3, "0")}`;
        $("dp-pick-stats").innerHTML = `${statCells(d)}<span class="size"><b data-tip="height"><i>Height</i> ${heightText(draft.pending)}</b> · <b data-tip="weight"><i>Weight</i> ${weightText(draft.pending)}</b></span>`;
        $("dp-reroll").disabled = !draft.rerolls.mon;
        $("dp-reroll-left").textContent = draft.rerolls.mon ? `${draft.rerolls.mon} left` : "used";
      }
    }
    const res = draftResult();
    if (res) {
      $("dp-record").textContent = recordText(res.wins);
      $("dp-record").classList.toggle("perfect", res.wins === DRAFT.GAMES);
      $("dp-score").textContent = res.score;
      // The season, game by game: a square per game (green wins, red losses; all gold on a perfect season)
      const squares = $("dp-squares");
      squares.classList.toggle("perfect", res.wins === DRAFT.GAMES);
      squares.setAttribute("aria-label", `${res.wins} wins, ${DRAFT.GAMES - res.wins} losses`);
      squares.replaceChildren(...res.games.map((g) => {
        const sq = document.createElement("i");
        if (!g.win) sq.className = "loss";
        return sq;
      }));
    }
    $("st-score").textContent = stats.runs ? stats.bestScore : "–";
    const bestRecord = $("st-record");
    if (stats.perfect) {
      // How many perfect seasons, in smaller type so the count fits its cell
      const times = document.createElement("small");
      times.textContent = `×${stats.perfect}`;
      bestRecord.replaceChildren("17–0 ", times);
    } else {
      bestRecord.textContent = stats.runs ? recordText(stats.bestWins) : "–";
    }
    bestRecord.classList.toggle("perfect", stats.perfect > 0);
    $("st-runs").textContent = stats.runs;
  }

  const monRerollsText = () => {
    const n = draft.rerolls.mon;
    return n ? `${n} ${n === 1 ? "reroll" : "rerolls"} left` : "No rerolls left";
  };

  // Open spots pulse while a pick waits to be placed; drafted players are locked.
  function updateSlotStates() {
    const placing = mode === "draft" && Boolean(draft.pending);
    for (const slot of SLOTS) {
      const el = hotspotEls.get(slot.id);
      el.classList.toggle("open-slot", placing && !lineup[slot.id]);
      el.classList.toggle("locked", mode === "draft" && Boolean(lineup[slot.id]));
    }
  }

  function refreshDraft() {
    updateDraftPanel();
    updateSlotStates();
    updateHotspotLabels();
    scheduleRender();
  }

  // Thumbnails are trimmed to their visible pixels, so a small sprite isn't lost in its frame's
  // empty space. Pixel sprites scale by whole numbers where they can.
  const thumbCache = new Map(); // url -> Promise<trimmed canvas>
  function trimmedThumb(url) {
    let p = thumbCache.get(url);
    if (!p) {
      p = new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(trimImage(img));
        img.onerror = reject;
        img.src = url;
      });
      p.catch(() => thumbCache.delete(url)); // let a later draw try again
      thumbCache.set(url, p);
    }
    return p;
  }
  function drawThumb(cv, id) {
    const st = viewStyle();
    const pixelated = SPRITE_STYLES[st].pixelated;
    cv.dataset.id = id;
    cv.getContext("2d").clearRect(0, 0, cv.width, cv.height);
    trimmedThumb(iconUrl(st, id)).then((t) => {
      if (cv.dataset.id !== String(id)) return; // reused for another Pokémon meanwhile
      const g = cv.getContext("2d");
      const box = cv.width * 0.92;
      let k = Math.min(box / t.width, box / t.height);
      if (pixelated && k >= 2) k = Math.floor(k);
      const w = Math.round(t.width * k);
      const h = Math.round(t.height * k);
      g.clearRect(0, 0, cv.width, cv.height);
      g.imageSmoothingEnabled = !pixelated;
      g.drawImage(t, Math.round((cv.width - w) / 2), Math.round((cv.height - h) / 2), w, h);
    }, () => {});
  }

  // ----- Pick pop-up -----
  function openDraftPick() {
    if (mode !== "draft" || draftDone() || rolling || !draft.started) return;
    if (!draft.revealed) {
      revealRoll("both");
      return;
    }
    if (game === "151") return; // the roll is the pick
    fillDraftPick();
    if (!pickDlg.open) showDialog(pickDlg);
    candGrid.scrollTop = 0;
  }

  function fillDraftPick() {
    const { gen, type } = draft.roll;
    const taken = takenIds();
    const open = openSlots();
    $("dlg-heading").textContent = `Round ${draft.round + 1} of ${DRAFT.ROUNDS}`;
    setRegionChip($("dlg-region"), gen);
    setTypeChip($("dlg-type"), type);
    for (const kind of ["type", "gen"]) {
      const left = draft.rerolls[kind];
      const options = kind === "type" ? DRAFT.typesFor(gen, taken, legendsFull()) : DRAFT.gensFor(type, taken, legendsFull(), draft.variant);
      const btn = $(`reroll-${kind}`);
      btn.disabled = !left || options.length < 2;
      btn.querySelector("small").textContent = left ? "1 left" : "used";
      btn.title = left && options.length < 2 ? `No other ${kind === "type" ? "types" : "regions"} left to roll` : "";
    }
    const cands = DRAFT.available(gen, type, taken);
    const full = legendsFull();
    const legendNote = cands.some((p) => p.legendary)
      ? full
        ? ` Legendary limit reached (${DRAFT.MAX_LEGENDS} of ${DRAFT.MAX_LEGENDS}), so ★ Legendaries are off for the rest of the run.`
        : ` ★ Legendaries: ${legendsUsed()} of ${DRAFT.MAX_LEGENDS} used.`
      : "";
    // Past the limit, Legendaries still show (locked) but aren't counted as choices.
    const choices = full ? cands.filter((p) => !p.legendary).length : cands.length;
    $("dlg-hint").textContent = `${choices} ${DRAFT.REGIONS[gen]} ${capital(type)}-type Pokémon to choose from. ` +
      `Pick one, then place it in any of your ${open.length} open ${open.length === 1 ? "spot" : "spots"}.${legendNote}`;
    const frag = document.createDocumentFragment();
    for (const p of cands) frag.appendChild(candCard(p, full && p.legendary));
    candGrid.replaceChildren(frag);
  }

  // locked: a Legendary after the run's limit is reached (shown, but can't be picked).
  function candCard(p, locked) {
    const d = POKEDATA[p.id - 1];
    const el = document.createElement("button");
    el.type = "button";
    el.className = "cand";
    el.disabled = locked;
    el.classList.toggle("locked", locked);
    el.classList.toggle("current", draft.pending === p.id);
    el.innerHTML = `<canvas class="thumb" width="128" height="128" aria-hidden="true"></canvas>` +
      `<span class="cand-main">` +
      `<span class="cand-name"><span class="nm"></span>${p.legendary ? '<span class="leg" title="Legendary or Mythical">★</span>' : ""}<span class="num">#${String(p.id).padStart(3, "0")}</span></span>` +
      `<span class="cand-types">${d.types.map((t) => `<span class="type t-${t}">${capital(t)}</span>`).join("")}</span>` +
      `<span class="cand-stats">${statCells(d)}</span>` +
      `<span class="cand-foot">${locked ? "Legendary limit reached" : `<span><span data-tip="height">${heightText(p.id)}</span> · <span data-tip="weight">${weightText(p.id)}</span></span>`}</span>` +
      `</span>`;
    el.querySelector(".nm").textContent = p.name;
    drawThumb(el.querySelector("canvas"), p.id);
    if (p.legendary) el.setAttribute("aria-label", `${p.name} (Legendary${locked ? ", limit reached" : ""})`);
    el.addEventListener("click", () => choosePick(p.id));
    return el;
  }

  function choosePick(id) {
    draft.pending = id;
    saveDraft();
    pickDlg.close();
    refreshDraft();
    // Keyboard users land on the first open spot; on phones the field can sit below the panel,
    // so bring it into view for the placement tap.
    const first = SLOTS.find((s) => !draft.lineup[s.id]);
    if (first) hotspotEls.get(first.id).focus({ preventScroll: true });
    fieldWrap.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }

  // kind: "type" or "gen" (17–0), or "mon" (151, which has five).
  async function useReroll(kind) {
    if (draftDone() || rolling || busy || !draft.rerolls[kind]) return;
    if (draft.id) {
      const s = await serverMove("reroll", { kind });
      if (!s) return;
      adoptServer(draft, s);
    } else {
      const taken = takenIds();
      const used = kind === "mon" ? DRAFT.MON_REROLLS - draft.rerolls.mon : 0;
      const next = kind === "mon"
        ? DRAFT.rerollMon(draft.roll, draft.seed ^ 0x7e1011, draft.round * DRAFT.MON_REROLLS + used, taken)
        : kind === "type"
          ? DRAFT.rerollType(draft.roll, draft.seed ^ 0x2e7011, draft.round, taken, legendsFull())
          : DRAFT.rerollGen(draft.roll, draft.seed ^ 0x6e9e11, draft.round, taken, legendsFull(), draft.variant);
      if (!next) return;
      draft.roll = next;
      draft.rerolls[kind] -= 1;
    }
    draft.pending = null;
    draft.revealed = false;
    saveDraft();
    pickDlg.close();
    revealRoll(kind);
  }
  $("reroll-type")?.addEventListener("click", () => useReroll("type"));
  $("reroll-gen")?.addEventListener("click", () => useReroll("gen"));
  $("dp-reroll")?.addEventListener("click", () => useReroll("mon"));

  // ----- Rolling reveal -----
  // A slot-machine pop-up in the middle of the field spins the region and type reels and lands on
  // the round's roll (already decided and saved). Rerolls spin just the reel that changes. Tapping
  // the pop-up (or Escape) skips to the result.
  const rollPop = $("roll-pop");
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  let rolling = false;
  let rollToken = 0; // bumped to abandon a reveal that's on screen
  let rollReels = [];

  function reelItem(kind, value) {
    const el = document.createElement("div");
    el.className = "reel-item";
    if (kind === "mon") {
      const img = document.createElement("img");
      img.alt = "";
      img.src = iconUrl(viewStyle(), value);
      img.classList.toggle("pixelated", SPRITE_STYLES[viewStyle()].pixelated);
      const name = document.createElement("b");
      name.textContent = nameOf(value);
      el.classList.add("mon");
      el.append(img, name);
    } else if (kind === "gen") {
      const name = document.createElement("b");
      name.textContent = DRAFT.REGIONS[value];
      const sub = document.createElement("small");
      sub.textContent = `Gen ${value}`;
      el.append(name, sub);
    } else {
      const pill = document.createElement("span");
      pill.className = `type t-${value}`;
      pill.textContent = capital(value);
      el.append(pill);
    }
    return el;
  }

  const KANTO_IDS = CHALLENGE_OK ? DRAFT.POOL["1"].map((p) => p.id) : [];

  // What the reel shows on its way to the result: random values, never the same one twice in a
  // row, and not the result itself just before it lands.
  function reelValues(kind, result, count) {
    const pool = kind === "mon" ? KANTO_IDS : kind === "gen" ? DRAFT.VARIANTS[draft.variant] : TYPE_NAMES;
    const out = [];
    for (let i = 0; i < count; i++) {
      let v;
      do v = pool[Math.floor(Math.random() * pool.length)];
      while (v === out[i - 1] || (i >= count - 3 && v === result));
      out.push(v);
    }
    out.push(result);
    return out;
  }

  // Fills one reel and, if it spins, scrolls it down to the result. Resolves when it has landed.
  function spinReel(win, kind, result, duration, spin) {
    const strip = document.createElement("div");
    strip.className = "reel-strip";
    const values = spin ? reelValues(kind, result, Math.round(duration / 65)) : [result];
    for (const v of values) strip.appendChild(reelItem(kind, v));
    win.replaceChildren(strip);
    win.classList.remove("landed");
    win.classList.toggle("held", !spin);
    if (!spin) return { anim: null, done: Promise.resolve() };
    // Percent of the strip's own height, so it lands exactly even while the card scales in.
    const anim = strip.animate(
      [{ transform: "translateY(0)" }, { transform: `translateY(${(-100 * (values.length - 1)) / values.length}%)` }],
      { duration, easing: "cubic-bezier(0.12, 0.7, 0.16, 1)", fill: "forwards" },
    );
    const done = anim.finished.then(() => win.classList.add("landed"), () => {});
    return { anim, done };
  }

  // Shows the pop-up for the current roll. Resolves true once it has landed and been on screen a
  // moment, false if it was abandoned.
  async function playRoll(kind) {
    const token = ++rollToken;
    const { gen, type } = draft.roll;
    $("roll-title").textContent = `Round ${draft.round + 1} of ${DRAFT.ROUNDS}`;
    rollPop.classList.remove("out", "skipped");
    rollPop.hidden = false;
    const still = reducedMotion.matches;
    rollReels = game === "151"
      ? [spinReel($("reel-mon"), "mon", draft.roll.id, 1700, !still)]
      : [
        spinReel($("reel-gen"), "gen", gen, 1100, !still && kind !== "type"),
        spinReel($("reel-type"), "type", type, kind === "both" ? 1700 : 1100, !still && kind !== "gen"),
      ];
    await Promise.all(rollReels.map((r) => r.done));
    if (token !== rollToken) return false;
    await wait(still ? 900 : rollPop.classList.contains("skipped") ? 350 : 700);
    if (token !== rollToken) return false;
    rollPop.classList.add("out");
    await wait(180);
    if (token !== rollToken) return false;
    hideRollPop();
    return true;
  }

  function skipRoll() {
    rollPop.classList.add("skipped");
    for (const r of rollReels) if (r.anim) r.anim.finish();
  }

  function hideRollPop() {
    for (const r of rollReels) if (r.anim) r.anim.cancel();
    rollReels = [];
    rollPop.hidden = true;
    rollPop.classList.remove("out", "skipped");
  }

  // Stops a reveal that's on screen (switching modes, starting over). The roll stays saved and
  // unrevealed, so the next reveal lands on the same result.
  function cancelRoll() {
    if (!rolling) return;
    rollToken += 1;
    rolling = false;
    hideRollPop();
  }

  async function revealRoll(kind) {
    if (rolling || mode !== "draft" || draftDone() || draft.revealed || !draft.started) return;
    rolling = true;
    refreshDraft();
    // Phones: make sure the field (where the reels spin) is on screen.
    fieldWrap.scrollIntoView({ block: "nearest", behavior: "smooth" });
    if (!(await playRoll(kind))) return;
    rolling = false;
    draft.revealed = true;
    if (game === "151") {
      // The rolled Pokémon is the pick: straight on to placing it.
      draft.pending = draft.roll.id;
      saveDraft();
      refreshDraft();
      $("roll-sr").textContent = `Round ${draft.round + 1}: ${nameOf(draft.pending)}. Pick an open spot for it.`;
      const first = SLOTS.find((s) => !draft.lineup[s.id]);
      if (first) hotspotEls.get(first.id).focus({ preventScroll: true });
      return;
    }
    saveDraft();
    refreshDraft();
    $("roll-sr").textContent = `Round ${draft.round + 1}: ${DRAFT.REGIONS[draft.roll.gen]}, ${capital(draft.roll.type)} type.`;
    // Not on top of the Leaderboard opened during the spin (Choose a Pokémon brings it up after).
    if (!document.querySelector("dialog[open]")) openDraftPick();
  }

  rollPop?.addEventListener("click", skipRoll);
  document.addEventListener("keydown", (e) => {
    if (rolling && e.key === "Escape") skipRoll();
  });

  // ----- Placing -----
  let autoOpenTimer = 0;

  function draftSlotClick(slotId) {
    if (rolling) {
      skipRoll();
      return;
    }
    if (busy) return;
    if (!draft.started) {
      toast(game === "151" ? "Pick your formation, then press Start run" : "Pick your Pokémon and formation, then press Start run");
      return;
    }
    const id = draft.lineup[slotId];
    if (id) {
      toast(`${nameOf(id)} is locked in at ${SLOT_BY_ID.get(slotId).pos}`);
      return;
    }
    if (draftDone()) return;
    if (draft.pending) place(slotId);
    else openDraftPick();
  }

  async function place(slotId) {
    let find = null;
    if (draft.id) {
      // The server checks the pick, then deals the next roll (or scores the finished team). The pick may turn out
      // shiny (decided by the server as it locks in): find says so, and it's revealed before anything else happens.
      primeAudio();
      const s = await serverMove("pick", { slot: slotId, pick: draft.pending });
      if (!s) return restAudio();
      find = s.find || null;
      if (find) revealing.add(find.p); // its usual colors until the reveal lands
      else restAudio();
      adoptServer(draft, s);
    } else {
      // signed out, the pick's shiny roll comes from the server in the background (rollPick): the run doesn't wait
      if (CHALLENGE_OK && !hasSignedInFlag()) rollPick(draft.pending, slotId, draft.round);
      draft.lineup[slotId] = draft.pending;
      draft.round += 1;
      draft.roll = draftDone() ? null : game === "151"
        ? DRAFT.rollMon(draft.seed, draft.round, takenIds())
        : DRAFT.roll(draft.seed, draft.round, takenIds(), legendsFull(), draft.variant);
    }
    draft.pending = null;
    draft.revealed = false;
    saveDraft();
    if (draftDone()) recordRun(draftResult());
    refreshDraft();
    if (find) await showFind(find, slotId);
    // A beat to see the new player's rating, then straight on to the next roll (or the season).
    clearTimeout(autoOpenTimer);
    autoOpenTimer = setTimeout(() => {
      if (mode !== "draft" || document.querySelector("dialog[open]")) return;
      if (draftDone()) openSeason();
      else revealRoll("both");
    }, draftDone() ? 900 : 450);
  }

  function startNewRun() {
    if (draft.round > 0 && !draftDone() && !confirm("Start a new run? Your picks so far will be lost.")) return;
    clearTimeout(autoOpenTimer);
    cancelRoll();
    // A new run starts by picking its Pokémon and formation (last run's are pre-selected).
    draft = newDraft(game, draft.scheme, draft.variant);
    if (mode === "draft") lineup = draft.lineup;
    saveDraft();
    if (seasonDlg.open) seasonDlg.close();
    refreshDraft();
    applyLayout();
    $("draft-panel").scrollIntoView({ block: "nearest", behavior: "smooth" });
  }

  // ----- Pokémon and formation for the run -----
  // Picked before round 1 and locked in once the run starts; the field previews the formation meanwhile.
  const setupInputs = [...document.querySelectorAll('input[name="c-var"], input[name="c-def"], input[name="c-off"]')];
  const setupValue = (key) => (key === "var" ? draft.variant : draft.scheme[key]);

  function syncSetupInputs() {
    for (const input of setupInputs) input.checked = setupValue(input.name.slice(2)) === input.value;
  }

  for (const input of setupInputs) {
    input.addEventListener("change", () => {
      if (!input.checked || draft.started) return;
      // While Start run waits on the server, the run's Pokémon and formation are already sent.
      if (busy) {
        syncSetupInputs();
        return;
      }
      const key = input.name.slice(2);
      if (key === "var") {
        setVariant(input.value);
        return;
      }
      draft.scheme = { ...draft.scheme, [key]: input.value };
      saveDraft();
      applyLayout();
    });
  }

  // Starting a run: signed in, the server deals it for the leaderboard; otherwise (or without a
  // connection) it's played on this device.
  $("dp-start")?.addEventListener("click", async () => {
    if (draft.started || mode !== "draft" || busy) return;
    const run = draft;
    const g = game; // this challenge, even if the player switches to the other one meanwhile
    busy = true;
    refreshDraft();
    let online = null;
    let note = "";
    // No one, with the signed-in flag still set, means asking who's signed in failed: ask again.
    const user = await whoAmI(me === null && hasSignedInFlag());
    // Gone to the other challenge while that was asked: start nothing (a new leaderboard run would
    // end the one there).
    if (draft !== run) {
      busy = false;
      return refreshDraft();
    }
    if (user) {
      try {
        online = await patiently(() => api("start", { game: g, variant: run.variant, def: run.scheme.def, off: run.scheme.off }));
      } catch (err) {
        if (err.status === 401) signedOut();
        note = err.status === 401 ? "You're signed out, so this run won't count for the leaderboard."
          : err.status === 403 ? "This account can't play for the leaderboard, so this run won't count."
          : err.status === 429 ? "Too many new runs from here right now, so this one won't count for the leaderboard."
          : "Couldn't reach the server, so this run won't count for the leaderboard.";
      }
    } else if (hasSignedInFlag()) {
      note = "Couldn't reach the server, so this run won't count for the leaderboard.";
    }
    busy = false;
    if (draft !== run || run.started) return refreshDraft();
    if (online) {
      adoptServer(run, online);
      // The account it counts for: the server says whose session started it (this page's `me` can be
      // stale when another tab switched accounts); an older server doesn't, so the page's guess.
      run.uid = online.uid || user.id;
    }
    run.started = true;
    saveDraft();
    if (note) toast(note);
    trackEvent("Run Started", { game: gameLabel() });
    refreshDraft();
    revealRoll("both");
  });

  $("dp-choose")?.addEventListener("click", openDraftPick);
  $("dp-change")?.addEventListener("click", openDraftPick);
  $("dp-restart")?.addEventListener("click", startNewRun);
  $("dp-new")?.addEventListener("click", startNewRun);
  $("dp-season")?.addEventListener("click", openSeason);
  $("season-new")?.addEventListener("click", startNewRun);
  $("season-share")?.addEventListener("click", shareResults);
  $("dp-share")?.addEventListener("click", shareResults);

  // ----- Season results -----
  const VERDICTS = [
    [17, "Undefeated. A perfect season!"],
    [15, "So close to perfect."],
    [12, "Playoff team."],
    [9, "Winning season."],
    [6, "Rebuilding year."],
    [1, "Rough season."],
    [0, "Winless. It can only go up from here."],
  ];

  function openSeason() {
    const res = draftResult();
    if (!res) return;
    updatePostUi();
    whoAmI().then(updatePostUi);
    const perfect = res.wins === DRAFT.GAMES;
    $("season-heading").textContent = perfect ? "Perfect season!" : "Season results";
    const fits = SLOTS.map((s) => ({ pos: s.pos, id: draft.lineup[s.id], v: fitOf(draft.lineup[s.id], s.id) })).sort((a, b) => b.v - a.v);
    const top = fits[0];
    const low = fits[fits.length - 1];
    $("season-notes").textContent = `Best fit: ${nameOf(top.id)} at ${top.pos}. Weakest link: ${nameOf(low.id)} at ${low.pos}.`;
    $("season-details").open = WIDE.matches;
    const rows = res.games.map((g, k) => {
      const li = document.createElement("li");
      li.className = g.win ? "win" : "loss";
      li.innerHTML = `<span class="wk">${k + 1}</span><span class="res">${g.win ? "W" : "L"}</span><span class="sc">${g.us}–${g.them}</span><span class="opp"></span><span class="ors"></span>`;
      li.querySelector(".opp").textContent = g.opponent;
      li.querySelector(".ors").textContent = g.rating;
      li.querySelector(".ors").title = "Opponent rating";
      return li;
    });
    $("season-games").replaceChildren(...rows);
    // The results are the share card itself: screenshot it, press and hold it, or tap Share.
    const img = $("season-card");
    const shinies = runShinies();
    img.alt = `${recordText(res.wins)} season, Team Score ${res.score} out of 1000. ${VERDICTS.find(([w]) => res.wins >= w)[1]}` +
      (shinies.length ? ` A shiny run: ${shinies.map((id) => `shiny ${nameOf(id)}`).join(", ")}.` : "");
    $("season-foil").classList.remove("holo");
    img.classList.add("loading");
    img.removeAttribute("src");
    const touch = window.matchMedia("(pointer: coarse)").matches;
    const hint = $("season-hint");
    hint.textContent = touch ? "Press and hold the card to save it to Photos, or take a screenshot." : "Right-click the card to copy or save it.";
    if (!seasonDlg.open) showDialog(seasonDlg);
    seasonDlg.querySelector(".season-body").scrollTop = 0;
    const forDraft = draft;
    prepareShareCard().then((card) => {
      if (draft !== forDraft) return;
      if (!card) {
        hint.textContent = "Couldn't draw the card. Check your connection and open the results again.";
        return;
      }
      img.src = card.url;
      img.classList.remove("loading");
      $("season-foil").classList.toggle("holo", shinies.length > 0);
    });
  }

  // ----- Share card -----
  // A 1200×1500 picture for social posts: the game's name, the record and Team Score, the week by
  // week results and the lineup, with the site's address. It's built as the results open, so a tap
  // on Share can hand it straight to the phone's share sheet.
  const CARD_W = 1200;
  const CARD_H = 1500;
  const FORMATION_NAMES = { "34": "3-4 defense", "43": "4-3 defense", fb: "Fullback", slot: "Slot WR" };
  // { draft, promise of { blob, url } for the card as a JPEG (null if it couldn't be made) }. The url
  // is a data: URL so the results can show it (the page's security policy doesn't allow blob: images).
  let shareCard = null;

  function prepareShareCard() {
    if (!shareCard || shareCard.draft !== draft) {
      const promise = buildShareCard().then(
        (card) => new Promise((resolve) => {
          const url = card.toDataURL("image/jpeg", 0.92);
          card.toBlob((blob) => resolve(blob ? { blob, url } : null), "image/jpeg", 0.92);
        }),
        () => null,
      );
      shareCard = { draft, promise };
      promise.then((card) => { if (!card && shareCard && shareCard.promise === promise) shareCard = null; });
    }
    return shareCard.promise;
  }

  // ----- A shiny run's card: holo foil -----
  // A finished run that found shinies (its list from the server, as the run adopted it) gets a foil card. Baked into
  // the share card, still: the foil's colors in soft diagonal streaks, a sheen and a fine sparkle texture under every
  // word, a rainbow frame and a label (SHINY CHARIZARD, or 3 SHINIES). On the results, a moving foil over it as well
  // (broadcast.css .season-foil.holo). Plain linear gradients and paths only, so older iPhones draw it like the rest
  // of the card. A run without shinies draws exactly as before.
  function runShinies() {
    if (!draft || !Array.isArray(draft.shiny) || !draft.shiny.length) return [];
    const placed = new Set(Object.values(draft.lineup || {}));
    return [...new Set(draft.shiny)].filter((id) => placed.has(id));
  }
  const shinyLabel = (ids) => (ids.length === 1 ? `SHINY ${nameOf(ids[0]).toUpperCase()}` : `${ids.length} SHINIES`);
  const FOIL = ["255, 138, 214", "255, 214, 102", "128, 255, 204", "120, 196, 255", "196, 150, 255"]; // pink, gold, mint, sky, violet
  // the foil's colors, `cycles` times over from (x0, y0) to (x1, y1)
  function foilGradient(g, x0, y0, x1, y1, alpha, cycles) {
    const grad = g.createLinearGradient(x0, y0, x1, y1);
    const n = FOIL.length * cycles;
    for (let i = 0; i <= n; i++) grad.addColorStop(i / n, `rgba(${FOIL[i % FOIL.length]}, ${alpha})`);
    return grad;
  }
  // the same scatter every time the same run's card is drawn
  function seeded(seed) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = Math.imul(a ^ (a >>> 15), a | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  // the foil's colors as soft streaks, `cycles` times over from (x0, y0) to (x1, y1), with the dark card between them
  function foilStreaks(g, x0, y0, x1, y1, alpha, cycles) {
    const grad = g.createLinearGradient(x0, y0, x1, y1);
    const n = FOIL.length * cycles;
    for (let i = 0; i < n; i++) {
      const c = FOIL[i % FOIL.length];
      grad.addColorStop(i / n, `rgba(${c}, 0)`);
      grad.addColorStop((i + 0.5) / n, `rgba(${c}, ${alpha})`);
      grad.addColorStop((i + 1) / n, `rgba(${c}, 0)`);
    }
    return grad;
  }
  // stars in the card's open spaces (between its words, at any record, score, title or label)
  const FOIL_STARS = [[600, 40, 9], [130, 38, 6], [1080, 168, 8], [615, 250, 11], [720, 452, 7], [560, 1448, 8]];
  // Under everything: the streaks, a soft sheen, and the sparkle texture.
  function drawFoil(g) {
    g.save();
    g.fillStyle = foilStreaks(g, 0, 0, CARD_W, CARD_H * 0.8, 0.18, 2);
    g.fillRect(0, 0, CARD_W, CARD_H);
    const sheen = g.createLinearGradient(0, 0, CARD_W * 0.8, CARD_H * 0.5);
    for (const [at, a] of [[0, 0], [0.4, 0], [0.5, 0.1], [0.6, 0], [1, 0]]) sheen.addColorStop(at, `rgba(255, 255, 255, ${a})`);
    g.fillStyle = sheen;
    g.fillRect(0, 0, CARD_W, CARD_H);
    const rand = seeded(draft.seed ^ 0x5a1e);
    for (let i = 0; i < 360; i++) {
      const tint = rand() < 0.6 ? "255, 255, 255" : FOIL[Math.floor(rand() * FOIL.length)];
      g.fillStyle = `rgba(${tint}, ${(0.1 + rand() * 0.35).toFixed(2)})`;
      const d = rand() < 0.85 ? 1.5 : 2.5;
      g.fillRect(rand() * CARD_W, rand() * CARD_H, d, d);
    }
    for (const [x, y, r] of FOIL_STARS) {
      starPath(g, x, y, r);
      g.fillStyle = "rgba(255, 236, 170, 0.8)";
      g.fill();
    }
    g.restore();
  }
  // Over everything: the frame, the foil's colors round the edge with a fine light line inside.
  function drawFoilFrame(g) {
    g.save();
    g.lineWidth = 12;
    g.strokeStyle = foilGradient(g, 0, 0, CARD_W, CARD_H, 0.95, 2);
    g.strokeRect(6, 6, CARD_W - 12, CARD_H - 12);
    roundRect(17, 17, CARD_W - 34, CARD_H - 34, 18, g);
    g.lineWidth = 2;
    g.strokeStyle = "rgba(255, 255, 255, 0.5)";
    g.stroke();
    g.restore();
  }
  // The label, top right: a foil sticker between two stars. Narrowed (smaller type) for a long name.
  function drawShinyLabel(g, ids, right, top) {
    const label = shinyLabel(ids);
    const STAR = 10;
    const PAD = 22;
    let size = 30;
    g.font = `800 ${size}px ${FONT}`;
    while (size > 20 && g.measureText(label).width + 2 * (PAD + 2 * STAR + 12) > 600) g.font = `800 ${--size}px ${FONT}`;
    const tw = g.measureText(label).width;
    const h = 52;
    const w = tw + 2 * (PAD + 2 * STAR + 12);
    const x = right - w;
    g.save();
    roundRect(x, top, w, h, h / 2, g);
    g.fillStyle = foilGradient(g, x, top, x + w, top + h, 1, 1);
    g.fill();
    const gloss = g.createLinearGradient(0, top, 0, top + h);
    gloss.addColorStop(0, "rgba(255, 255, 255, 0.5)");
    gloss.addColorStop(0.5, "rgba(255, 255, 255, 0.08)");
    gloss.addColorStop(1, "rgba(255, 255, 255, 0)");
    g.fillStyle = gloss;
    g.fill();
    g.lineWidth = 2;
    g.strokeStyle = "rgba(255, 255, 255, 0.85)";
    g.stroke();
    g.fillStyle = "#1c1405";
    for (const cx of [x + PAD + STAR, x + w - PAD - STAR]) {
      starPath(g, cx, top + h / 2, STAR);
      g.fill();
    }
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText(label, x + w / 2, top + h / 2 + 1);
    g.restore();
  }

  async function buildShareCard() {
    const res = draftResult();
    if (!res) throw new Error("no result");
    await document.fonts.ready;
    retryFailedArt();
    await waitForArt();
    const perfect = res.wins === DRAFT.GAMES;
    const shinies = runShinies();
    const holo = shinies.length > 0;
    const card = document.createElement("canvas");
    card.width = CARD_W;
    card.height = CARD_H;
    const g = card.getContext("2d");
    const X0 = 64;
    const X1 = CARD_W - 64;
    const text = (str, x, y, font, color, align = "left") => {
      g.font = font;
      g.fillStyle = color;
      g.textAlign = align;
      if (holo) {
        // on the foil, a soft shadow keeps each word crisp
        g.save();
        g.shadowColor = "rgba(0, 0, 0, 0.6)";
        g.shadowBlur = 10;
        g.fillText(str, x, y);
        g.restore();
      } else {
        g.fillText(str, x, y);
      }
      return g.measureText(str).width;
    };

    // Background with the site's soft glows.
    g.fillStyle = "#0b0b0e";
    g.fillRect(0, 0, CARD_W, CARD_H);
    for (const [x, rgb] of [[0, "74, 222, 128"], [CARD_W, "45, 212, 191"]]) {
      const glow = g.createRadialGradient(x, 0, 0, x, 0, 760);
      glow.addColorStop(0, `rgba(${rgb}, 0.16)`);
      glow.addColorStop(1, `rgba(${rgb}, 0)`);
      g.fillStyle = glow;
      g.fillRect(0, 0, CARD_W, 620);
    }
    if (holo) drawFoil(g);
    g.textBaseline = "alphabetic";

    // Title
    text("POKÉMON ALL-22", X0, 96, `700 28px Inter, ${FONT}`, "#a1a1aa");
    const title = game === "151" ? "151 CHALLENGE" : "17–0 CHALLENGE";
    g.font = `800 66px Inter, ${FONT}`;
    const gold = g.createLinearGradient(X0, 0, X0 + g.measureText(title).width, 0);
    gold.addColorStop(0, "#fde047");
    gold.addColorStop(1, "#f59e0b");
    const titleW = text(title, X0, 166, g.font, gold);
    if (game === "17-0" && draft.variant === "retro") {
      const label = "RETRO · GEN 1–4";
      g.font = `800 26px Inter, ${FONT}`;
      const w = g.measureText(label).width + 40;
      roundRect(X0 + titleW + 24, 121, w, 52, 26, g);
      g.lineWidth = 3;
      g.strokeStyle = "#f59e0b";
      g.stroke();
      text(label, X0 + titleW + 44, 156, g.font, "#fde047");
    }
    if (holo) drawShinyLabel(g, shinies, X1, 58);

    // Record, verdict, formation
    text(recordText(res.wins), X0 - 6, 372, `800 220px ${FONT}`, perfect ? OFF_COLOR : "#ffffff");
    text(VERDICTS.find(([w]) => res.wins >= w)[1], X0, 424, `600 34px Inter, ${FONT}`, "#d4d4d8");
    text(`${FORMATION_NAMES[draft.scheme.def]} · ${FORMATION_NAMES[draft.scheme.off]}`, X0, 466, `600 26px Inter, ${FONT}`, "#71717a");

    // Team Score, right-aligned
    text("TEAM SCORE", X1, 216, `700 24px Inter, ${FONT}`, "#71717a", "right");
    g.font = `600 36px Inter, ${FONT}`;
    const outOf = g.measureText("/1000").width;
    text("/1000", X1, 348, g.font, "#71717a", "right");
    text(String(res.score), X1 - outOf - 10, 348, `800 150px ${FONT}`, "#ffffff", "right");
    text(`Offense ${res.offense}  ·  Defense ${res.defense}`, X1, 400, `600 26px Inter, ${FONT}`, "#a1a1aa", "right");

    // Week by week: one square per game.
    const size = 56;
    const gap = (X1 - X0 - DRAFT.GAMES * size) / (DRAFT.GAMES - 1);
    res.games.forEach((game, k) => {
      roundRect(X0 + k * (size + gap), 500, size, size, 10, g);
      g.fillStyle = perfect ? OFF_COLOR : game.win ? "#4ade80" : "#f87171";
      g.fill();
    });

    // The lineup (without its own banner; shinies with their stars), edge to edge.
    hideBanner = true;
    exporting = true;
    render();
    hideBanner = false;
    exporting = false;
    const fieldH = (CARD_W * H) / W;
    g.drawImage(canvas, 0, 588, CARD_W, fieldH);
    scheduleRender(); // the on-screen field gets its banner back

    // Footer
    text("Can you go 17–0?", X0, 1474, `800 38px Inter, ${FONT}`, "#ffffff");
    text("all22pokemon.com", X1, 1474, `700 34px Inter, ${FONT}`, "#4ade80", "right");
    if (holo) drawFoilFrame(g);
    return card;
  }

  function shareText(res) {
    const squares = res.games.map((game) => (game.win ? "🟩" : "🟥")).join("");
    const retro = game === "17-0" && draft.variant === "retro";
    const name = game === "151" ? "the 151 Challenge" : retro ? "the Retro 17–0 Challenge" : "the 17–0 Challenge";
    const head = res.wins === DRAFT.GAMES
      ? `I went 17–0 in ${name}! 🏆`
      : `I went ${recordText(res.wins)} in ${name} 🏈`;
    return `${head}\nTeam Score ${res.score}/1000\n${squares}\nCan you go 17–0? https://all22pokemon.com/#${game === "151" ? "151" : retro ? "retro" : "challenge"}`;
  }

  // Phones and tablets: the share sheet (X, Messages, Instagram, Save Image to Photos…) with the card
  // and a short post. Where a phone can't share files, the card on screen can be pressed and held
  // instead (a downloaded .jpg would land in Files, not Photos). Computers: their share menu has no
  // social apps, so the card is saved and the post copied.
  async function shareResults() {
    const res = draftResult();
    if (!res) return;
    const post = shareText(res);
    const touch = window.matchMedia("(pointer: coarse)").matches;
    const copy = () => (navigator.clipboard ? navigator.clipboard.writeText(post).then(() => true, () => false) : Promise.resolve(false));
    // Copy straight away, while the click still counts as the user's (some browsers insist).
    const copied = touch ? null : copy();
    const card = await prepareShareCard();
    if (!card) {
      toast("Couldn't make the card. Check your connection and try again.");
      return;
    }
    const base = game === "151" ? "151-challenge" : `17-0-challenge${draft.variant === "retro" ? "-retro" : ""}`;
    const file = new File([card.blob], `${base}-${res.wins}-${res.losses}.jpg`, { type: "image/jpeg" });
    if (touch) {
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        try {
          await navigator.share({ files: [file], text: post });
          return;
        } catch (err) {
          if (err && err.name === "AbortError") return; // closed the share sheet
        }
      }
      if (!seasonDlg.open) openSeason();
      toast("Press and hold the card to save it to Photos");
      return;
    }
    saveBlob(card.blob, file.name);
    toast((await copied) ? "Card saved and post copied!" : "Card saved!");
  }

  // ----- Leaderboard -----
  // 17–0, Retro 17–0 and 151 boards, each for today (US Eastern days) and all-time, one entry per
  // player (their best run). Signed in (an account through Google, Discord or X; see /account), every
  // run is a leaderboard run, posted when it ends; the server keeps the session in a cookie for 180
  // days. The public board shows each player's tag (k) rather than their account id; ?a=me gives the
  // signed-in player theirs, and admins get the ids from ?a=flags.
  const boardDlg = $("board");
  const boardButtons = [...document.querySelectorAll("[data-board]")];
  const boardInputs = [...document.querySelectorAll('input[name="lb-g"], input[name="lb-s"]')];
  const BOARD_NAMES = { "17-0": "17–0 Challenge", retro: "Retro 17–0 Challenge", 151: "151 Challenge" };
  const FLAG_RUNS = 300; // admins see a flag on players who start more runs than this in a day
  const TRASH_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg>';
  const RENAME_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="8" r="3.5"/><path d="M3 20a6 6 0 0 1 12 0M16 9l5 5M21 9l-5 5"/></svg>';
  // The top three get a trophy (gold, silver, bronze by the row's color) in place of their number.
  const TROPHY = '<svg class="br-trophy" viewBox="0 0 24 24" aria-hidden="true">' +
    '<path class="tr-handles" d="M7 5H4.8a2.4 2.4 0 0 0 2.5 4.2M17 5h2.2a2.4 2.4 0 0 1-2.5 4.2"/>' +
    '<path class="tr-body" d="M7 3h10v6a5 5 0 0 1-10 0zM10.6 13.6h2.8v3.2h-2.8zM7 18.2A1.2 1.2 0 0 1 8.2 17h7.6a1.2 1.2 0 0 1 1.2 1.2V21H7z"/>' +
    '<path class="tr-shine" d="M9.3 5.2v3.3a2.8 2.8 0 0 0 1.3 2.4"/></svg>';
  let me; // the signed-in player once asked (null: signed out)
  // How a player is named in a line ("Signed in as", the admin's questions): their X handle when they signed in with
  // X, else their display name, so once either way.
  const whoOf = (user) => (user.u ? `@${user.u}` : user.n);
  // An account made with X starts with its handle as its name: a board row then shows it once, not "Name @Name".
  const nameIsHandle = (e) => Boolean(e.u) && String(e.n || "").toLowerCase() === String(e.u).toLowerCase();
  let boardView = { g: "17-0", s: "today" };
  let boardToken = 0;
  closeOnBackdrop(boardDlg);

  // The session cookie is out of the page's reach; this flag beside it says whether to ask at all.
  const SIGNED_IN_FLAG = "a22in";
  const hasSignedInFlag = () => document.cookie.split(";").some((c) => c.trim() === `${SIGNED_IN_FLAG}=1`);
  function signedOut() {
    me = null;
    setOwned(null);
    document.cookie = `${SIGNED_IN_FLAG}=; Path=/; Max-Age=0; SameSite=Lax; Secure`;
    if (window.ALL22_PROFILE) window.ALL22_PROFILE.update(); // the header's account button says "Sign in" again
  }

  async function whoAmI(fresh = false) {
    if (me === undefined || fresh) {
      if (!hasSignedInFlag()) {
        me = null;
      } else {
        try {
          me = (await api("me")).user;
          if (!me) signedOut();
          else setOwned(me.shiny);
        } catch (_) {
          if (me === undefined) me = null;
        }
      }
      checkRunAccount();
    }
    return me;
  }

  // A leaderboard run counts for the account that started it: signed out (here or in another tab) or
  // signed in as someone else, it finishes on this device rather than post under that account.
  // Returns whether one did.
  function checkRunAccount() {
    if (!runs || me === undefined) return false;
    const out = me === null && !hasSignedInFlag();
    let ended = false;
    for (const g of Object.keys(runs)) {
      const run = runs[g];
      if (!run.id || run.result || !(out || (me && run.uid && run.uid !== me.id))) continue;
      const which = run === draft && mode === "draft" ? "this run" : `your ${CHALLENGES[g].name} run`;
      playOnThisDevice(g, `${out ? "Signed out" : `Signed in as ${whoOf(me)} now`}, so ${which} finishes on this device and won't count.`);
      ended = true;
    }
    return ended;
  }
  // Back on the page with a leaderboard run unfinished and signed out in another tab meanwhile (the
  // cookie flag says so with no request; another account signed in elsewhere is caught at the next load).
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && runs && !hasSignedInFlag() && Object.values(runs).some((r) => r.id && !r.result)) whoAmI(true);
  });
  const runBoard = (run, g) => (g === "151" ? "151" : run.variant === "retro" ? "retro" : "17-0");
  // The new account features (saves.js decides: its ACCOUNTS_ON switch, on for everyone, or one browser's own choice
  // with /account?beta=0 or ?beta=1): signing in on the account page (Google, Discord or X), My teams, the footer's
  // Account link. Off, the builder is as it was before them: "Sign in with X", straight to X.
  const ACCOUNTS = window.ALL22_ACCOUNTS === true;
  const signInUrl = () => (ACCOUNTS ? `/account?return=${encodeURIComponent(location.pathname)}` : `/api/auth/x/start?return=${encodeURIComponent(location.pathname)}`);
  const SIGN_IN = ACCOUNTS ? "Sign in" : "Sign in with X";
  if (ACCOUNTS) {
    $("board-fine").textContent = "Signed in, every run you finish is posted, and the board keeps your best. It shows your display name (and your X handle and picture if you signed in with X). X and Discord accounts need to be at least 30 days old.";
    $("footer-account").hidden = false;
  }
  // A posted run's ranks. Each board keeps a player's best run, so where this run isn't it, the rank
  // is their best's and the label says so (in place of "See Leaderboard", so it's no longer).
  function postedText(p) {
    const today = p.today ? `#${p.today.rank} today · ` : "";
    const all = `#${p.all.rank} all-time`;
    if (p.today && p.today.best === false) return `Your best: ${today}${all}`;
    if (p.all.best === false) return `${today}Your best: ${all}`;
    return `${today}${all} · See Leaderboard`;
  }

  // fresh: past the CDN's copy (just after posting a run), for every board and tab shown until it closes.
  function openBoard(g = runBoard(draft, game), s = boardView.s, fresh = false) {
    boardView = { g, s, fresh };
    for (const input of boardInputs) input.checked = input.value === (input.name === "lb-g" ? g : s);
    if (!boardDlg.open) showDialog(boardDlg);
    updateCta();
    loadBoard(fresh);
    showWho();
  }

  const boardPage = (page, fresh) => api(`board&g=${boardView.g}&s=${boardView.s}${page ? `&p=${page}` : ""}${fresh ? `&t=${Date.now()}` : ""}`);

  async function loadBoard(fresh) {
    const token = ++boardToken;
    const { g, s } = boardView;
    stopMore();
    $("board-note").textContent = "Loading…";
    let data;
    try {
      data = await boardPage(0, fresh);
    } catch (_) {
      if (token === boardToken) $("board-note").textContent = "Couldn't load the leaderboard. Check your connection and try again.";
      return;
    }
    const user = await whoAmI();
    if (token !== boardToken) return;
    const count = data.entries.length;
    $("board-note").textContent = count
      ? `${BOARD_NAMES[g]}: ${s === "today" ? "today's top runs (resets at midnight Eastern)" : "the top runs of all time"}${data.total > count ? `, of ${data.total.toLocaleString("en-US")} players` : ""}.`
      : `No ${BOARD_NAMES[g]} runs ${s === "today" ? "today" : "yet"}. ${SIGN_IN} and finish one to be first.`;
    $("board-list").replaceChildren(...data.entries.map((e) => boardRow(e, user)));
    $("board-list").scrollTop = 0;
    if (user && user.admin && count) flagBusyPlayers(token, 0);
    if (data.more) watchForMore(token, 1, fresh);
  }

  // A board's top 300 come 100 at a time: the next 100 load when the list is scrolled near its end
  // (or its "Show more" is tapped).
  let moreObserver = null;
  function stopMore() {
    if (moreObserver) moreObserver.disconnect();
    moreObserver = null;
    $("board-list").querySelector(".board-more")?.remove();
  }

  // auto: load as soon as it's scrolled into view (not after a failure, so it can't retry in a loop).
  function watchForMore(token, page, fresh, { auto = true, label = "Show more" } = {}) {
    stopMore();
    const list = $("board-list");
    const more = document.createElement("li");
    more.className = "board-more";
    const button = document.createElement("button");
    button.type = "button";
    button.className = "dp-link";
    button.textContent = label;
    button.addEventListener("click", () => loadMore(token, page, fresh, more));
    more.appendChild(button);
    list.appendChild(more);
    if (auto && "IntersectionObserver" in window) {
      moreObserver = new IntersectionObserver((seen) => {
        if (seen.some((x) => x.isIntersecting)) loadMore(token, page, fresh, more);
      }, { root: list, rootMargin: "0px 0px 300px 0px" });
      moreObserver.observe(more);
    }
  }

  async function loadMore(token, page, fresh, more) {
    if (more.dataset.loading) return;
    more.dataset.loading = "1";
    if (moreObserver) moreObserver.disconnect();
    moreObserver = null;
    more.textContent = "Loading more…";
    let data;
    try {
      data = await boardPage(page, fresh);
    } catch (_) {
      if (token === boardToken) watchForMore(token, page, fresh, { auto: false, label: "Couldn't load more. Try again" });
      return;
    }
    const user = await whoAmI();
    if (token !== boardToken) return;
    stopMore();
    $("board-list").append(...data.entries.map((e) => boardRow(e, user)));
    if (user && user.admin && data.entries.length) flagBusyPlayers(token, page);
    if (data.more) watchForMore(token, page + 1, fresh);
  }

  function boardRow(e, user) {
    const li = document.createElement("li");
    const rank = Number(e.rank);
    const podium = rank >= 1 && rank <= 3;
    li.className = `board-row${podium ? ` top${rank}` : ""}${user && user.k === e.k ? " me" : ""}`;
    li.dataset.k = e.k;
    const wins = Number(e.w) || 0;
    li.innerHTML = `<span class="br-rank">${podium ? `${TROPHY}<span class="sr-only">${rank}</span>` : rank}</span><span class="br-pic" aria-hidden="true"></span>` +
      `<span class="br-name"><b></b><small></small></span>` +
      `<span class="br-rec${wins === DRAFT.GAMES ? " perfect" : ""}" title="Record">${wins}–${Number(e.l) || 0}</span>` +
      `<span class="br-score" title="Team Score">${Number(e.s) || 0}</span>`;
    const pic = li.querySelector(".br-pic");
    // The X picture, for players who signed in with X (others have none: the board shows no other pictures).
    if (e.u && /^https:\/\/pbs\.twimg\.com\//.test(e.a || "")) {
      const img = document.createElement("img");
      img.src = e.a;
      img.alt = "";
      img.loading = "lazy";
      img.referrerPolicy = "no-referrer";
      pic.appendChild(img);
    } else {
      // The first character, whole: a name that starts with an emoji isn't split in half.
      pic.textContent = [...String(e.n || e.u || "?")][0].toUpperCase();
    }
    li.querySelector(".br-name b").textContent = e.n || e.u;
    // the @handle only for players signed in with X, and only when it isn't their name again
    if (e.u && !nameIsHandle(e)) li.querySelector(".br-name small").textContent = `@${e.u}`;
    else li.querySelector(".br-name small").remove();
    if (user && user.admin) {
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "dp-link br-remove";
      remove.innerHTML = TRASH_ICON;
      remove.title = `Remove ${whoOf(e)}`;
      remove.setAttribute("aria-label", `Remove ${whoOf(e)}`);
      remove.addEventListener("click", () => removeEntry(e, li));
      const rename = document.createElement("button");
      rename.type = "button";
      rename.className = "dp-link br-remove br-rename";
      rename.innerHTML = RENAME_ICON;
      rename.title = `Reset ${whoOf(e)}'s name`;
      rename.setAttribute("aria-label", `Reset ${whoOf(e)}'s name`);
      rename.addEventListener("click", () => resetName(e, li));
      li.append(rename, remove);
    }
    return li;
  }

  // Admins: the account ids behind a page of the board (for removing a player), and a flag on players who
  // start far more runs than a person plays (likely bots).
  async function flagBusyPlayers(token, page) {
    let players;
    try {
      players = (await api(`flags&g=${boardView.g}&s=${boardView.s}&p=${page}`)).players;
    } catch (_) {
      return;
    }
    if (token !== boardToken) return;
    for (const li of $("board-list").children) {
      const c = players[li.dataset.k];
      if (c) li.dataset.id = c.id;
      if (!c || Math.max(c.today, c.yesterday) <= FLAG_RUNS || li.querySelector(".br-flag")) continue;
      const flag = document.createElement("p");
      flag.className = "br-flag";
      flag.textContent = `⚑ Started ${c.today} runs today, ${c.yesterday} yesterday`;
      li.appendChild(flag);
    }
  }

  // Admins only (the server checks too): an offensive name goes back to "Trainer" and four digits, on the account and
  // on every board.
  async function resetName(e, li) {
    if (!li.dataset.id) {
      toast("Still loading that player. Try again in a moment.");
      return;
    }
    if (!confirm(`Reset ${whoOf(e)}'s display name to "Trainer" and four digits?`)) return;
    try {
      const out = await api("resetname", { player: li.dataset.id });
      toast(`Name reset to ${out.name}`);
    } catch (_) {
      toast("Couldn't reset that name.");
    }
    loadBoard(true);
  }

  // Admins only (the server checks too).
  async function removeEntry(e, li) {
    if (!li.dataset.id) {
      toast("Still loading that player. Try again in a moment.");
      return;
    }
    if (!confirm(`Remove ${whoOf(e)} from the ${BOARD_NAMES[boardView.g]} boards?`)) return;
    const ban = confirm(`Also ban ${whoOf(e)} from the leaderboard?`);
    try {
      await api("remove", { board: boardView.g, player: li.dataset.id, ban });
      toast(`Removed ${whoOf(e)}`);
    } catch (_) {
      toast("Couldn't remove that entry.");
    }
    loadBoard(true);
  }

  // Under the board: who's signed in (and a way out), or how to sign in.
  async function showWho() {
    const user = await whoAmI();
    const who = $("board-who");
    if (user) {
      const out = document.createElement("button");
      out.type = "button";
      out.className = "dp-link";
      out.textContent = "Sign out";
      out.addEventListener("click", signOut);
      if (ACCOUNTS) {
        const account = document.createElement("a");
        account.href = signInUrl();
        account.textContent = "Account";
        who.replaceChildren(`Signed in as ${whoOf(user)} · `, account, " · ", out);
      } else {
        who.replaceChildren(`Signed in as ${whoOf(user)} · `, out);
      }
    } else {
      const link = document.createElement("a");
      link.href = signInUrl();
      link.textContent = SIGN_IN;
      who.replaceChildren(link, " to play for the leaderboard.");
    }
  }

  async function signOut() {
    // anything this device hasn't sent to the account yet goes first
    if (window.ALL22_SAVES) await window.ALL22_SAVES.flush().catch(() => {});
    try {
      await api("logout", {});
    } catch (_) { /* the cookie expires on its own */ }
    signedOut();
    const ended = checkRunAccount();
    showWho();
    updatePostUi();
    if (CHALLENGE_OK) refreshDraft();
    loadBoard(true);
    if (!ended) toast("Signed out");
  }

  // Before a run: whether it counts for the leaderboard (and, signed out, that signing in is also how a run's shinies
  // are kept: one found signed out is only held a day).
  function updateBoardLine() {
    const line = $("dp-lb");
    if (!line) return;
    if (me === undefined) {
      line.replaceChildren();
    } else if (me) {
      line.textContent = `Leaderboard run · ${whoOf(me)}`;
    } else {
      const link = document.createElement("a");
      link.href = signInUrl();
      link.textContent = SIGN_IN;
      line.replaceChildren(link, ACCOUNTS ? " for the leaderboard and to keep your shinies" : " for the leaderboard");
    }
  }

  // The results' leaderboard button: a posted run's ranks (and a way to the board), or, after a run
  // played signed out, signing in for the next ones.
  function updatePostUi() {
    const button = $("post-run");
    if (!button || !draft) return;
    const online = Boolean(draft.id && draft.result);
    const posted = online && Boolean(draft.post);
    const offerSignIn = !online && me === null;
    button.hidden = !posted && !offerSignIn;
    button.classList.toggle("posted", posted);
    // a run played signed out that found shinies still waiting for this browser: signing in keeps them
    const found = offerSignIn && document.cookie.split(";").some((c) => c.trim() === "a22shf=1") ? runShinies().length : 0;
    $("post-label").textContent = posted ? postedText(draft.post)
      : found ? `${SIGN_IN} to keep your ${found > 1 ? "shinies" : "shiny"}` : `${SIGN_IN} to play for the leaderboard`;
    const note = $("post-note");
    note.hidden = !button.hidden || !draftDone() || me === undefined;
    note.textContent = online ? "This account can't post to the leaderboard." : "This run was played on this device, so it isn't on the leaderboard.";
  }

  // Back from signing in: say who signed in (or why not).
  async function afterSignIn(result) {
    if (result !== "signed-in") {
      toast(result === "signin-cancelled" ? "Sign-in cancelled."
        : result === "signin-too-new" ? (ACCOUNTS ? "That account is too new to sign in here: X and Discord accounts need to be at least 30 days old." : "To play for the leaderboard, your X account needs to be at least 30 days old.")
        : result === "linked" ? "Linked."
        : result === "link-taken" ? "That sign-in already belongs to another account here."
        : result === "signin-elsewhere" ? "That sign-in didn't finish in this browser. Try again here."
        : `Couldn't sign in${ACCOUNTS ? "" : " with X"}. Try again.`);
      whoAmI().then(refreshDraft); // brings back the panel's sign-in link
      return;
    }
    const user = await whoAmI(true);
    if (!user) {
      toast(`Couldn't sign in${ACCOUNTS ? "" : " with X"}. Try again.`);
      refreshDraft();
      return;
    }
    toast(`Signed in as ${whoOf(user)}. Your runs now count for the leaderboard.`);
    refreshDraft();
    updatePostUi();
  }

  for (const input of boardInputs) {
    input.addEventListener("change", () => {
      if (!input.checked) return;
      boardView = { ...boardView, [input.name === "lb-g" ? "g" : "s"]: input.value };
      loadBoard(boardView.fresh);
    });
  }
  for (const btn of boardButtons) btn.addEventListener("click", () => openBoard());
  $("post-run")?.addEventListener("click", () => {
    if (draft.post) openBoard(runBoard(draft, game), draft.post.today ? "today" : "all", true);
    else location.href = signInUrl();
  });

  // ---------- My teams ----------
  // Up to TEAMS_MAX named lineups per generation, each with its formation and Legendaries setting, listed in a
  // pop-up (the control column never scrolls): save the lineup on the field, open, rename or delete one. Kept in
  // this browser like the lineups ({ v, teams: [{ id, name, lineup, scheme, legends, c: made, t: changed }],
  // gone: { id: when it was deleted } }); signed in, they sync to the account (saves.js), and a deleted team
  // stays deleted on every device.
  const TEAMS_MAX = 20;
  const teamsDlg = $("teams");
  if (ACCOUNTS && $("btn-teams")) $("btn-teams").hidden = false; // a new account feature (see ACCOUNTS)
  const teamsKey = (g) => `${EDITION.key}-teams-${g}-v1`;
  const PENCIL_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4"/></svg>';
  const validTeam = (t) => Boolean(t) && typeof t.id === "string" && typeof t.name === "string" && Boolean(t.lineup) && typeof t.lineup === "object" && isScheme(t.scheme);
  function loadTeams(g = gen) {
    try {
      const o = JSON.parse(localStorage.getItem(teamsKey(g)) || "null");
      if (o && Array.isArray(o.teams)) return { v: 1, teams: o.teams.filter(validTeam), gone: o.gone && typeof o.gone === "object" ? o.gone : {} };
    } catch (_) { /* storage unavailable or corrupt */ }
    return { v: 1, teams: [], gone: {} };
  }
  function saveTeams(teams, g = gen) {
    try {
      localStorage.setItem(teamsKey(g), JSON.stringify(teams));
      return true;
    } catch (_) {
      return false;
    }
  }
  // Team names: up to 30 characters, no control or invisible characters.
  const cleanTeamName = (s) => [...String(s || "").replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\u2066-\u2069]/g, "").replace(/\s+/g, " ").trim()].slice(0, 30).join("");
  function nextTeamName(teams) {
    for (let n = teams.teams.length + 1; ; n++) if (!teams.teams.some((t) => t.name.toLowerCase() === `team ${n}`)) return `Team ${n}`;
  }
  const newTeamId = () => Array.from(crypto.getRandomValues(new Uint32Array(2)), (n) => n.toString(36)).join("");
  const sameLineup = (a, b) => SPOT_IDS.every((spot) => (a[spot] || 0) === (b[spot] || 0));
  const poolName = () => (document.querySelector(`input[name="gen"][value="${gen}"]`)?.getAttribute("aria-label") || "").replace(", ", " · ");
  function teamSummary(t) {
    const spots = t.scheme.k ? SPOT_IDS : SPOT_IDS.slice(0, BASE_SLOTS.length);
    const filled = spots.filter((spot) => t.lineup[spot]).length;
    return [`${filled}/${spots.length}`, t.scheme.def === "43" ? "4-3" : "3-4", t.scheme.off === "slot" ? "Slot" : "FB", t.scheme.k && "Kicker", t.legends && "Legendaries"].filter(Boolean).join(" · ");
  }

  function renderTeams() {
    const teams = loadTeams();
    $("teams-pool").textContent = poolName();
    const list = $("teams-list");
    list.replaceChildren(...[...teams.teams].sort((a, b) => (b.t || 0) - (a.t || 0)).map((t) => {
      const li = document.createElement("li");
      li.className = "team-row";
      li.innerHTML = '<span class="team-info"><b></b><small></small></span>' +
        '<button type="button" class="btn outline team-open">Open</button>' +
        `<button type="button" class="team-icon team-rename">${PENCIL_ICON}</button>` +
        `<button type="button" class="team-icon team-delete">${TRASH_ICON}</button>`;
      li.querySelector("b").textContent = t.name;
      li.querySelector("small").textContent = teamSummary(t);
      li.querySelector(".team-open").setAttribute("aria-label", `Open ${t.name}`);
      for (const [cls, label, fn] of [[".team-rename", "Rename", renameTeam], [".team-delete", "Delete", deleteTeam]]) {
        const b = li.querySelector(cls);
        b.title = `${label} ${t.name}`;
        b.setAttribute("aria-label", `${label} ${t.name}`);
        b.addEventListener("click", () => fn(t.id));
      }
      li.querySelector(".team-open").addEventListener("click", () => openTeam(t.id));
      return li;
    }));
    $("teams-empty").hidden = teams.teams.length > 0;
    const full = teams.teams.length >= TEAMS_MAX;
    $("teams-save-btn").disabled = full;
    $("teams-note").textContent = full
      ? `That's ${TEAMS_MAX} teams for this generation. Delete one to save another.`
      : `Saves the lineup on the field with its formation. Up to ${TEAMS_MAX} teams for each generation${hasSignedInFlag() ? ", saved to your account too" : ""}.`;
  }

  function openTeams() {
    if (mode !== "builder") return;
    renderTeams();
    $("teams-name").value = "";
    $("teams-name").placeholder = nextTeamName(loadTeams());
    showDialog(teamsDlg);
  }
  $("btn-teams")?.addEventListener("click", openTeams);
  closeOnBackdrop(teamsDlg);

  $("teams-save")?.addEventListener("submit", (e) => {
    e.preventDefault();
    if (mode !== "builder") return;
    const teams = loadTeams();
    const name = cleanTeamName($("teams-name").value) || nextTeamName(teams);
    const same = teams.teams.find((t) => t.name.toLowerCase() === name.toLowerCase());
    if (same && !confirm(`Replace “${same.name}” with the lineup on the field?`)) return;
    if (!same && teams.teams.length >= TEAMS_MAX) return;
    const now = Date.now();
    const kept = sanitize(lineup, gen, legends);
    const usual = [...plain].filter((id) => Object.values(kept).includes(id)); // its players shown in their usual colors
    const team = {
      id: same ? same.id : newTeamId(), name, lineup: kept,
      scheme: { def: builderScheme.def, off: builderScheme.off, k: builderScheme.k === true }, legends, c: same ? same.c : now, t: now,
      ...(usual.length ? { plain: usual } : {}),
    };
    teams.teams = same ? teams.teams.map((t) => (t.id === same.id ? team : t)) : [...teams.teams, team];
    if (!saveTeams(teams)) {
      toast("Couldn't save: this browser's storage is full or blocked.");
      return;
    }
    $("teams-name").value = "";
    $("teams-name").placeholder = nextTeamName(teams);
    renderTeams();
    toast(same ? `Saved over “${name}”` : `Saved “${name}”`);
  });

  // Opens a team: it becomes the builder's lineup for this generation (with its formation and Legendaries).
  function openTeam(id) {
    const teams = loadTeams();
    const t = teams.teams.find((x) => x.id === id);
    if (!t || mode !== "builder") return;
    const current = sanitize(lineup, gen, legends);
    const kept = !Object.keys(current).length || sameLineup(current, DEFAULT_LINEUPS[gen]) || teams.teams.some((x) => sameLineup(x.lineup, current));
    if (!kept && !confirm(`Open “${t.name}”? The lineup on the field isn't saved in My teams.`)) return;
    legends = t.legends === true;
    builderScheme = { def: t.scheme.def, off: t.scheme.off, k: t.scheme.k === true };
    lineup = sanitize(t.lineup, gen, legends);
    plain = new Set(Array.isArray(t.plain) ? t.plain.filter((id) => Number.isInteger(id)) : []);
    save(); // also drops a shared lineup's link
    savePlain();
    applyGen();
    setStyle(style);
    syncFormationInputs();
    applyLayout();
    teamsDlg.close();
    toast(`Opened “${t.name}”`);
  }
  function renameTeam(id) {
    const teams = loadTeams();
    const t = teams.teams.find((x) => x.id === id);
    if (!t) return;
    const name = cleanTeamName(prompt("Rename this team:", t.name));
    if (!name || name === t.name) return;
    t.name = name;
    t.t = Date.now();
    saveTeams(teams);
    renderTeams();
  }
  function deleteTeam(id) {
    const teams = loadTeams();
    const t = teams.teams.find((x) => x.id === id);
    if (!t || !confirm(`Delete “${t.name}”?`)) return;
    teams.teams = teams.teams.filter((x) => x.id !== id);
    teams.gone[id] = Date.now();
    saveTeams(teams);
    renderTeams();
    toast(`Deleted “${t.name}”`);
  }

  // ---------- Saves from the account ----------
  // saves.js brought in the account's copy of some keys (signed in on another device, or switched accounts on
  // this one): pick up what this page shows. A shared lineup being viewed stays on screen.
  window.addEventListener("all22:saves", (e) => {
    const keys = e.detail.keys || [];
    if (keys.some((k) => /^pokemon-all22-(lineup-|style-|gen-|formation-|legends-|shiny-)/.test(k)) && !location.hash) {
      gen = loadSavedGen();
      legends = loadSavedLegends();
      style = loadSavedStyle();
      builderScheme = loadSavedScheme();
      if (mode === "builder") {
        lineup = loadSavedLineup(gen, legends);
        plain = loadPlain();
      }
      applyGen();
      setStyle(style);
      syncFormationInputs();
      applyLayout();
    }
    if (CHALLENGE_OK && keys.some((k) => /-stats-v1$/.test(k))) {
      statsBy["17-0"] = loadStats("17-0");
      statsBy[151] = loadStats("151");
      stats = statsBy[game];
      refreshDraft();
    }
    if (teamsDlg && teamsDlg.open) renderTeams();
    // a team this device had, kept in My teams before the account's newer copy took its place (saves.js)
    const kept = e.detail.kept || [];
    if (kept.length) toast(kept.length > 1 ? `${kept.length} teams from this device are in My teams.` : `Your team from this device is in My teams as “${kept[0]}”.`);
  });

  // ---------- Shinies ----------
  // A shiny turns up one pick in 1,365, decided by the server as the pick locks in (api/_lib/shiny.mjs): here, a pick
  // placed in a leaderboard run (signed in), or in a run played signed out (rollPick, below). Its reveal (shiny.js,
  // loaded with shiny.css only when one comes) plays before the next roll, and the run shows it shiny from then on
  // (its shiny list). The builder shows every species the account has found shiny (?a=me, owned) shiny by default; a
  // small switch in the picker shows a lineup's player in their usual colors instead (plain, per pool, saved with the
  // lineup and in My teams, synced to the account). Nothing here can make a shiny: the server's collection decides
  // what's owned.
  function isShiny(id) {
    if (!id || revealing.has(id)) return false;
    if (mode === "draft") return Boolean(draft && Array.isArray(draft.shiny) && draft.shiny.includes(id));
    return owned.has(id) && !plain.has(id);
  }
  const tileIcon = (id) => (owned.has(id) ? shinyIconUrl : iconUrl)(viewStyle(), id);
  function refreshShinyTiles() {
    for (const m of monEls) {
      const has = owned.has(m.p.id);
      if (has === m.shiny) continue;
      m.shiny = has;
      m.el.classList.toggle("shy", has);
      m.img.src = tileIcon(m.p.id);
    }
    if (picker.open) syncShinyToggle();
  }

  // This pool's players shown in their usual colors (SHINY_KEY). Only the ones in the lineup are kept.
  const poolCode = () => `${gen}${legends ? "L" : ""}`;
  function readChoices() {
    try {
      const o = JSON.parse(localStorage.getItem(SHINY_KEY) || "null");
      if (o && o.plain && typeof o.plain === "object" && !Array.isArray(o.plain)) return o;
    } catch (_) { /* storage unavailable or corrupt */ }
    return { v: 1, plain: {} };
  }
  function loadPlain() {
    const e = readChoices().plain[poolCode()];
    return new Set(e && Array.isArray(e.ids) ? e.ids.filter((id) => Number.isInteger(id)) : []);
  }
  function savePlain() {
    if (location.hash) return; // a shared lineup being viewed isn't the visitor's own
    const ids = [...plain].filter((id) => Object.values(lineup).includes(id)).sort((a, b) => a - b);
    plain = new Set(ids);
    const o = readChoices();
    const had = o.plain[poolCode()];
    if (had ? JSON.stringify(had.ids) === JSON.stringify(ids) : !ids.length) return;
    o.plain[poolCode()] = { t: Date.now(), ids };
    try { localStorage.setItem(SHINY_KEY, JSON.stringify(o)); } catch (_) { /* ignore */ }
  }

  // The picker's switch: shown only for a player the account has shiny.
  const shinyToggle = document.getElementById("picker-shiny");
  function syncShinyToggle() {
    if (!shinyToggle) return;
    const id = pickerSlot ? lineup[pickerSlot] : null;
    const can = mode === "builder" && Boolean(id) && owned.has(id);
    shinyToggle.hidden = !can;
    if (!can) return;
    const on = !plain.has(id);
    shinyToggle.setAttribute("aria-pressed", String(on));
    shinyToggle.title = on ? `${nameOf(id)} shows shiny. Switch off for the usual colors.` : `Show ${nameOf(id)} shiny`;
  }
  shinyToggle?.addEventListener("click", () => {
    const id = lineup[pickerSlot];
    if (mode !== "builder" || !id || !owned.has(id)) return;
    if (plain.has(id)) plain.delete(id);
    else plain.add(id);
    savePlain();
    syncShinyToggle();
    scheduleRender();
  });

  // What the account has (from ?a=me), with this device's last copy for the first paint (never synced).
  const SEEN_KEY = "all22-shiny-seen-v1";
  function seedOwned() {
    try {
      const c = JSON.parse(localStorage.getItem(SEEN_KEY) || "null");
      if (c && Array.isArray(c.ids)) owned = new Set(c.ids.filter((id) => Number.isInteger(id)));
    } catch (_) { /* nothing seen yet */ }
  }
  function setOwned(ids) {
    const next = new Set(Array.isArray(ids) ? ids : []);
    const same = next.size === owned.size && [...next].every((id) => owned.has(id));
    owned = next;
    try {
      if (Array.isArray(ids)) localStorage.setItem(SEEN_KEY, JSON.stringify({ ids: [...next] }));
      else localStorage.removeItem(SEEN_KEY);
    } catch (_) { /* ignore */ }
    if (!same) {
      refreshShinyTiles();
      scheduleRender();
    }
  }
  // A find made signed out, claimed now that this browser is signed in (profile.js).
  addEventListener("all22:shiny-claimed", (e) => {
    const claimed = (e.detail && e.detail.claimed) || [];
    if (!claimed.length) return;
    setOwned([...owned, ...claimed.map((c) => c.p)]);
    toast(claimed.length > 1 ? `${claimed.length} shinies are in your Shiny Collection now.` : `Shiny ${claimed[0].name} is in your Shiny Collection now.`);
  });

  // The local test hook (never on the live site): ?shinytest=1 on localhost or 127.0.0.1 makes this browser's picks
  // ask the local server for a shiny (api/_lib/shiny.mjs shinyTest), ?shinytest=0 for none, ?shinytest=off stops.
  const LOCAL = location.hostname === "localhost" || location.hostname === "127.0.0.1";
  if (LOCAL) {
    const t = new URLSearchParams(location.search).get("shinytest");
    try {
      if (t === "1" || t === "0") localStorage.setItem("all22-shiny-test", t);
      else if (t === "off") localStorage.removeItem("all22-shiny-test");
    } catch (_) { /* ignore */ }
  }
  function shinyTestHeader() {
    if (!LOCAL) return {};
    try {
      const t = localStorage.getItem("all22-shiny-test");
      return t === "1" || t === "0" ? { "X-Shiny-Test": t } : {};
    } catch (_) { return {}; }
  }

  // Phones only start sound inside a tap: the tap that places a leaderboard pick readies it (for a shiny's sound),
  // and it rests again when there's nothing to play.
  function primeAudio() {
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      if (!window.ALL22_AUDIO) window.ALL22_AUDIO = new AC();
      if (window.ALL22_AUDIO.state === "suspended") window.ALL22_AUDIO.resume().catch(() => {});
    } catch (_) { /* no sound, then */ }
  }
  function restAudio() {
    const a = window.ALL22_AUDIO;
    if (a && a.state === "running") a.suspend().catch(() => {});
  }

  // shiny.js and shiny.css, once, when a find comes in.
  let shinyLib = null;
  function loadShiny() {
    if (!shinyLib) {
      shinyLib = new Promise((resolve, reject) => {
        if (window.ALL22_SHINY) return resolve(window.ALL22_SHINY);
        const css = document.createElement("link");
        css.rel = "stylesheet";
        css.href = "shiny.css";
        const js = document.createElement("script");
        js.src = "shiny.js";
        let n = 0;
        const loaded = () => {
          if (++n < 2) return;
          if (window.ALL22_SHINY) resolve(window.ALL22_SHINY);
          else reject(new Error("shiny.js"));
        };
        css.onload = loaded;
        js.onload = loaded;
        css.onerror = js.onerror = () => reject(new Error("shiny files"));
        document.head.append(css, js);
      });
      shinyLib.catch(() => { shinyLib = null; });
    }
    return shinyLib;
  }

  // Where a spot's player stands on screen (the reveal's sprite lands there): its sprite's box.
  function slotScreenRect(slotId) {
    const slot = SLOT_BY_ID.get(slotId);
    const box = canvas.getBoundingClientRect();
    if (!slot || !box.width) return null;
    const k = box.width / W;
    const sp = readySprite(slot);
    const r = sp ? sp.r : { x: slot.sx - slot.s * 0.4, y: slot.sb - slot.s * 0.8, w: slot.s * 0.8, h: slot.s * 0.8 };
    return { left: box.left + r.x * k, top: box.top + r.y * k, width: r.w * k, height: r.h * k, right: box.left + (r.x + r.w) * k, bottom: box.top + (r.y + r.h) * k };
  }

  // A challenge find: the reveal (then the run goes on). Counted in Vercel Analytics ("Shiny Found"). The find is kept
  // (a leaderboard run's, signed in) or held for this browser (a run played signed out: find.claim).
  async function showFind(find, slotId, { round = draft.round, target = () => slotScreenRect(slotId) } = {}) {
    const signedIn = find.claim === undefined;
    trackEvent("Shiny Found", { where: find.w === "151" ? "151" : "17–0", signedIn });
    if (find.kept) setOwned([...owned, find.p]);
    const settle = () => {
      revealing.delete(find.p);
      scheduleRender();
    };
    let lib = null;
    try { lib = await loadShiny(); } catch (_) { /* no reveal: the words */ }
    if (!lib) {
      settle();
      toast(`Shiny ${nameOf(find.p)}! One in 1,365.`);
      return;
    }
    const st = viewStyle();
    await lib.reveal({
      id: find.p, name: nameOf(find.p), style: st, pixelated: SPRITE_STYLES[st].pixelated, info: find, sound: "site",
      context: `${CHALLENGES[find.w === "151" ? "151" : "17-0"].name} · Round ${round}`, target, onSettle: settle,
      // "See your collection": the account page's, which leads back here (the run is saved, and picks up again);
      // signed out, "Sign in to keep it" first (and back here, where the find is claimed)
      collection: { href: `/account?return=${encodeURIComponent(location.pathname)}#shiny` },
      ...(signedIn ? {} : { signIn: { href: signInUrl(), stay: false } }), // (the run's results say it again)
    });
    setTimeout(restIfIdle, 2500);
  }

  // ---------- Shinies in runs played signed out ----------
  // Such a run stays on this device, and each pick it locks in asks the server for its roll in the background (api/
  // app.mjs ?a=roll), so the run never waits: a shiny comes back as a find held a day for this browser, which signing
  // in keeps (profile.js claims it). It's revealed as soon as it lands, whatever's on screen, and the run notes it
  // (draft.shiny) for its field and its card, which are this device's own (a collection changes only by a claim). An
  // answer slower than ROLL_WAIT_MS, or none, and the pick just isn't shiny; nothing is asked again.
  const ROLL_WAIT_MS = 8000;
  // Rolls still being asked. On a slow connection the next pick can go before the last one's answer comes, so the
  // sound rests only once none is out and no reveal is on (an answer mustn't cut a shiny's cue short).
  let rollsOut = 0;
  function restIfIdle() {
    if (!rollsOut && !revealing.size) restAudio();
  }
  function rollPick(p, slotId, round) {
    const run = draft;
    const g = game;
    const ctrl = typeof AbortController === "function" ? new AbortController() : null;
    const timer = ctrl ? setTimeout(() => ctrl.abort(), ROLL_WAIT_MS) : 0;
    primeAudio(); // (in the tap: a shiny's cue can play)
    rollsOut += 1;
    fetch("/api/app?a=roll", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...shinyTestHeader() },
      body: JSON.stringify({ game: g, variant: g === "17-0" ? run.variant : undefined, p, round }),
      ...(ctrl ? { signal: ctrl.signal } : {}),
    })
      .then((res) => (res.status === 200 ? res.json() : null))
      .catch(() => null)
      .then((out) => {
        clearTimeout(timer);
        rollsOut -= 1;
        const find = out && out.find;
        if (find && find.p === p && find.w === g) foundSignedOut(find, run, g, slotId, round + 1);
        else restIfIdle();
      });
  }
  async function foundSignedOut(find, run, g, slotId, round) {
    const here = () => mode === "draft" && game === g && draft === run;
    // the run (still this browser's) shows it shiny from the reveal on, and its card goes holo
    if (runs[g] === run) {
      run.shiny = [...new Set([...(Array.isArray(run.shiny) ? run.shiny : []), find.p])];
      saveRun(g);
      if (run === shareCard?.draft) shareCard = null;
    }
    revealing.add(find.p);
    await showFind(find, slotId, { round, target: () => (here() ? slotScreenRect(slotId) : null) });
    // what the reveal held up: the next roll or pick, the season, or the season's card again (now holo)
    if (!here() || rolling || pickDlg.open) return;
    if (draftDone()) {
      if (seasonDlg.open || !document.querySelector("dialog[open]")) openSeason();
    } else if (!draft.pending && !document.querySelector("dialog[open]")) openDraftPick();
  }

  // ---------- Mode ----------
  // The gold button plays the 17–0 Challenge and the red one the 151 Challenge; inside either, the
  // gold button's spot leads back to the builder.
  // ---------- Mode menu (Builder / 17–0 / 151 / Fantasy Draft / Leaderboard) ----------
  const builderButtons = [...document.querySelectorAll("[data-mode-builder]")];
  const ctaButtons = [...document.querySelectorAll("[data-cta]")];
  const cta151Buttons = [...document.querySelectorAll("[data-cta151]")];

  // The menu's current cell: the mode in view, or the Leaderboard while it's open.
  function updateCta() {
    for (const btn of [...ctaButtons, ...cta151Buttons, ...boardButtons]) btn.hidden = !CHALLENGE_OK;
    const board = Boolean(boardDlg && boardDlg.open);
    const mark = (list, on) => {
      for (const el of list) {
        if (on) el.setAttribute("aria-current", "page");
        else el.removeAttribute("aria-current");
      }
    };
    mark(builderButtons, !board && mode === "builder");
    mark(ctaButtons, !board && mode === "draft" && game === "17-0");
    mark(cta151Buttons, !board && mode === "draft" && game === "151");
    mark(boardButtons.filter((b) => b.classList.contains("mode")), board);
  }

  function applyMode() {
    const draftMode = mode === "draft";
    // Pop-ups belong to one mode (a shared link can switch modes while one is open).
    for (const d of draftMode ? [picker] : [pickDlg, seasonDlg, boardDlg]) if (d && d.open) d.close();
    if (!draftMode) cancelRoll();
    document.body.classList.toggle("mode-draft", draftMode);
    document.body.classList.toggle("game-151", draftMode && game === "151");
    updateCta();
    const name = CHALLENGE_OK ? CHALLENGES[game].name : "";
    $("title-mode").innerHTML = draftMode ? (game === "151" ? '<span class="n151">151</span> Challenge' : '<span class="n170">17–0</span> Challenge') : "Lineup builder";
    // The Sprites row: in the team sheet in the builder, under How it works in a challenge.
    const spritesRow = $("sprites-row");
    const spritesHome = draftMode ? $("rules-sprites") : document.querySelector(".team-sheet");
    if (spritesRow && spritesHome && spritesRow.parentNode !== spritesHome) spritesHome.appendChild(spritesRow);
    document.title = draftMode ? `${name} · Pokémon All-22` : EDITION.title;
    $("draft-panel")?.setAttribute("aria-label", name);
    hotspotsEl.classList.toggle("draft", draftMode);
    if (CHALLENGE_OK) updateDraftPanel();
    applyLayout();
  }

  // Lays the field out for the formation in view (spots, tap targets, picture).
  function applyLayout() {
    setSlots(viewScheme());
    buildHotspots();
    updateSlotStates();
    scheduleRender();
  }

  // Builder and each challenge keep their own lineup; switching never touches the others.
  function setMode(next, nextGame = game) {
    if ((next !== "builder" && next !== "draft") || (next === "draft" && !CHALLENGE_OK)) return;
    if (next === mode && (next === "builder" || nextGame === game)) return;
    if (mode === "draft" && next === "draft") {
      // Straight from one challenge to the other: put the first one's reveal and pop-ups away.
      cancelRoll();
      for (const d of [pickDlg, seasonDlg]) if (d.open) d.close();
    }
    mode = next;
    if (mode === "draft") {
      game = nextGame;
      draft = runs[game];
      stats = statsBy[game];
    }
    clearTimeout(autoOpenTimer);
    if (mode === "builder") {
      // A shared lineup's formation and Legendaries setting go with it.
      builderScheme = loadSavedScheme();
      legends = loadSavedLegends();
      syncFormationInputs();
      applyGen();
    }
    lineup = mode === "draft" ? draft.lineup : loadSavedLineup(gen, legends);
    if (mode === "builder") plain = loadPlain();
    try { localStorage.setItem(MODE_KEY, modeValue()); } catch (_) { /* ignore */ }
    if (location.hash) history.replaceState(null, "", location.pathname + location.search);
    setStyle(style); // Retro sprites only cover some pools
    applyMode();
  }

  for (const btn of builderButtons) btn.addEventListener("click", () => setMode("builder"));
  for (const btn of ctaButtons) btn.addEventListener("click", () => setMode("draft", "17-0"));
  for (const btn of cta151Buttons) btn.addEventListener("click", () => setMode("draft", "151"));
  boardDlg?.addEventListener("close", updateCta);

  // ---------- Formation (builder) ----------
  // Defense 3-4 / 4-3, offense fullback / slot receiver, kicker off / on.
  const formationInputs = [...document.querySelectorAll('input[name="b-def"], input[name="b-off"], input[name="b-k"]')];
  const formValue = (sc, key) => (key === "k" ? (sc.k ? "1" : "0") : sc[key]);

  function syncFormationInputs() {
    for (const input of formationInputs) input.checked = input.value === formValue(builderScheme, input.name.slice(2));
  }

  for (const input of formationInputs) {
    input.addEventListener("change", () => {
      if (!input.checked) return;
      const key = input.name.slice(2);
      builderScheme = { ...builderScheme, [key]: key === "k" ? input.value === "1" : input.value };
      try { localStorage.setItem(SCHEME_KEY, JSON.stringify(builderScheme)); } catch (_) { /* ignore */ }
      // Switching the kicker on for a lineup without one brings in this generation's default kicker.
      const kicker = DEFAULT_LINEUPS[gen].K;
      if (key === "k" && builderScheme.k && !lineup.K && !location.hash && kicker && !Object.values(lineup).includes(kicker)) {
        lineup.K = kicker;
        save();
      }
      // Viewing a shared lineup: keep the link, with the new formation.
      if (location.hash) history.replaceState(null, "", `#${encodeHash()}`);
      applyLayout();
    });
  }

  // ---------- Boot ----------
  if (hasSignedInFlag()) seedOwned();
  if (!fromHash) plain = loadPlain();
  setSlots(viewScheme());
  applyGen();
  setStyle(style);
  syncFormationInputs();
  applyMode();
  render();
  if (CHALLENGE_OK) {
    for (const g of Object.keys(runs)) syncRun(g);
    // Back from signing in (#signed-in, #signin-too-new, #signin-failed, #signin-cancelled, #signin-elsewhere;
    // #linked or #link-taken from linking another sign-in).
    const signIn = location.hash.slice(1);
    if (["signed-in", "signin-too-new", "signin-failed", "signin-cancelled", "signin-elsewhere", "linked", "link-taken"].includes(signIn)) {
      history.replaceState(null, "", location.pathname + location.search);
      afterSignIn(signIn);
    } else {
      whoAmI().then(refreshDraft);
    }
    if (wantsBoard) {
      history.replaceState(null, "", location.pathname + location.search);
      openBoard();
    }
  } else if (hasSignedInFlag()) {
    whoAmI(); // the builder's shinies
  }
  document.fonts.load(`700 17px ${FONT}`).then(scheduleRender, () => {});
  document.fonts.ready.then(scheduleRender);
})();
