// Fantasy Draft page (/draft): make or join a league, draft in snake order with friends (or
// computer teams), then watch the season the server played. The server (api/fantasy.mjs) keeps
// every league; this page polls it and draws what it says. Pokémon data comes from pokemon.js,
// pokedata.js and draft.js; stat tips from tips.js.
(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const make = (tag, cls, text) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  };

  // ---------- Modes and settings (the server checks them too) ----------
  const MODES = {
    kanto: { name: "Kanto", gens: ["1"], hint: "The original 151" },
    retro: { name: "Retro", gens: ["1", "2", "3", "4"], hint: "Gen 1–4, Kanto to Sinnoh" },
    wild: { name: "Wild", gens: DRAFT.GENS, hint: "All 1,025 Pokémon" },
  };
  for (const g of DRAFT.GENS.slice(1)) MODES[`gen${g}`] = { name: `Gen ${g}`, gens: [g], hint: `The ${DRAFT.REGIONS[g]} Pokémon` };
  const MIN_TEAMS = 3;
  const MAX_TEAMS = 6;
  const SLOT_IDS = Object.keys(DRAFT.SLOT_ROLE);
  const spotsFor = (kicker) => (kicker ? [...SLOT_IDS, "K"] : SLOT_IDS);
  const poolOf = (mode, legends) => MODES[mode].gens.flatMap((g) => DRAFT.POOL[g]).filter((p) => legends || !p.legendary).map((p) => p.id);
  const maxTeams = (mode, legends, kicker) => Math.min(MAX_TEAMS, Math.floor(poolOf(mode, legends).length / spotsFor(kicker).length));
  const SCHEME_NAMES = { 34: "3-4", 43: "4-3", fb: "Fullback", slot: "Slot" };
  const schemeText = (s) => `${SCHEME_NAMES[s.def]} · ${SCHEME_NAMES[s.off]}`;

  // ---------- Fields: drawn exactly like the builder's (field.js) ----------
  const slotsFor = AllField.slotsFor;
  const posOf = (slotId, scheme) => (slotsFor(scheme, true).find((s) => s.id === slotId) || {}).pos || slotId;
  // Sprites in the style picked in the builder (Retro only has Gen 1–2, so other pools get Pixel).
  const SAVED_STYLE = (() => {
    try {
      const style = localStorage.getItem(`${EDITION.key}-style-v1`);
      if (style && SPRITE_STYLES[style]) return style;
    } catch (_) { /* ignore */ }
    return DEFAULT_STYLE;
  })();
  const styleFor = (mode) => (MODES[mode].gens.every((g) => styleCovers(SAVED_STYLE, g)) ? SAVED_STYLE : "pixel");
  const leagueStyle = () => (league ? styleFor(league.set.mode) : DEFAULT_STYLE);
  // Wide screens show your field beside the pool, so a pick goes straight onto it (no sheet).
  const wideQuery = matchMedia("(min-width: 1000px)");

  // The same lineup as a list, by side (skill positions first): easier to read on a phone. Shinies get a star.
  const LIST_ORDER = ["QB", "HB", "FB", "WR1", "WR2", "TE", "LT", "LG", "C", "RG", "RT", "DE1", "NT", "DE2", "OLB1", "ILB1", "ILB2", "OLB2", "CB1", "CB2", "S1", "S2", "K"];
  function rosterList(team, scheme, kicker) {
    const shiny = shinySet();
    const list = make("div", "fd-roster");
    for (const [side, title] of [["O", "Offense"], ["D", "Defense"], ["K", "Kicker"]]) {
      const slots = slotsFor(scheme, kicker).filter((s) => s.side === side).sort((a, b) => LIST_ORDER.indexOf(a.id) - LIST_ORDER.indexOf(b.id));
      if (!slots.length) continue;
      const col = make("div", "fd-roster-side");
      col.append(make("h4", null, title));
      for (const slot of slots) {
        const row = make("div", `fd-roster-row${team[slot.id] ? "" : " empty"}${shiny.has(team[slot.id]) ? " shiny" : ""}`);
        row.append(make("b", null, slot.pos), make("span", null, team[slot.id] ? nameOf(team[slot.id]) : "—"));
        col.append(row);
      }
      list.append(col);
    }
    return list;
  }

  // ---------- Small helpers ----------
  // Vercel Web Analytics custom events. Each one is sent once per league, from the page that made
  // or hosts it, so they count leagues rather than players.
  window.va = window.va || ((...args) => (window.vaq = window.vaq || []).push(args));
  function trackEvent(name, data) {
    try { window.va("event", { name, data }); } catch (_) { /* analytics never gets in the way */ }
  }
  const humansIn = (lg) => lg.seats.filter((x) => !x.cpu).length;
  const toastEl = $("toast");
  let toastTimer = 0;
  function toast(msg) {
    const host = document.querySelector("dialog[open]") || document.body;
    if (toastEl.parentNode !== host) host.appendChild(toastEl);
    toastEl.textContent = msg;
    toastEl.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove("show"), Math.max(2200, msg.length * 55));
  }
  const heightText = (id) => {
    const inches = Math.round((HEIGHT_DM[id - 1] * 10) / 2.54);
    return `${Math.floor(inches / 12)}′${String(inches % 12).padStart(2, "0")}″`;
  };
  const weightText = (id) => `${(POKEDATA[id - 1].kg * 2.20462).toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} lbs`;
  const STAT_KEYS = [["hp", "HP"], ["atk", "Atk"], ["def", "Def"], ["spa", "SpA"], ["spd", "SpD"], ["spe", "Spe"]];
  const setHtml = (el, html) => {
    if (el.dataset.html !== html) {
      el.innerHTML = html;
      el.dataset.html = html;
    }
  };
  const fold = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const capital = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  const escapeHtml = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  // ---------- Shinies ----------
  // A pick a player makes themselves can turn out shiny, decided by the server as it's made (api/_lib/shiny.mjs). Their
  // page plays the reveal (shiny.js, loaded with shiny.css only when one comes); everyone else in the room gets a short
  // "SHINY!" strip as it comes in, the chat line shines, and every field shows it shiny (league.shinies). Signed in, it's
  // kept in the picker's Shiny Collection; signed out, it's held a day for their browser to claim by signing in.
  const revealing = new Set(); // finds still being revealed here: their usual colors till then
  const announced = new Set(); // the league's picks already announced on this page (by index)
  let announcedFor = null; // the league those are for
  const shinySet = () => new Set(((league && league.shinies) || []).filter((id) => !revealing.has(id)));
  // New shiny picks since the last look (not ones already there when the league opened): the strip.
  function announceShinies() {
    if (announcedFor !== league.code) {
      announcedFor = league.code;
      announced.clear();
      league.picks.forEach((x, i) => { if (x.shiny) announced.add(i); });
      return;
    }
    const mine = me();
    league.picks.forEach((x, i) => {
      if (!x.shiny || announced.has(i)) return;
      announced.add(i);
      const seat = league.seats.find((t) => t.id === x.s);
      const style = leagueStyle();
      const team = mine && x.s === mine.id ? "You" : seat ? seat.name : "A team";
      loadShiny().then((lib) => lib.ticker({ id: x.p, name: nameOf(x.p), team, style, pixelated: SPRITE_STYLES[style].pixelated }), () => {});
    });
  }

  // Your own find: the reveal. Counted in Vercel Analytics ("Shiny Found").
  async function showFind(find, slot) {
    trackEvent("Shiny Found", { where: "Fantasy", signedIn: find.kept !== undefined });
    const settle = () => {
      revealing.delete(find.p);
      if (league) render();
    };
    let lib = null;
    try { lib = await loadShiny(); } catch (_) { /* no reveal: the words */ }
    if (!lib) {
      settle();
      toast(`Shiny ${nameOf(find.p)}! One in 8,192.`);
      return;
    }
    const style = leagueStyle();
    const n = league ? league.picks.findIndex((x) => x.p === find.p) + 1 : 0;
    // phones: the field is on the My team tab, so the sprite flies there
    const tab = () => {
      const r = document.querySelector('.fd-tabs [data-tab="team"]')?.getBoundingClientRect();
      return r && r.width ? r : null;
    };
    await lib.reveal({
      id: find.p, name: nameOf(find.p), style, pixelated: SPRITE_STYLES[style].pixelated, info: find, sound: "fantasy",
      context: n ? `Fantasy Draft · Pick ${n}` : "Fantasy Draft", target: () => myField.rectOf(slot) || tab(), onSettle: settle,
      // signing in mid-draft happens in another tab, so the draft carries on here (and so does a look at the collection)
      signIn: { href: `/account?return=${encodeURIComponent(location.pathname + location.search)}`, newTab: true },
      collection: { href: "/account#shiny", newTab: true },
    });
  }
  // A find made signed out, claimed now that this browser is signed in (profile.js).
  addEventListener("all22:shiny-claimed", (e) => {
    const claimed = (e.detail && e.detail.claimed) || [];
    if (claimed.length) toast(claimed.length > 1 ? `${claimed.length} shinies are in your Shiny Collection now.` : `Shiny ${claimed[0].name} is in your Shiny Collection now.`);
  });

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
  // The local test hook (never on the live site): ?shinytest=1 on localhost or 127.0.0.1 makes this browser's picks ask
  // the local server for a shiny (api/_lib/shiny.mjs shinyTest); ?shinytest=0 stops.
  const LOCAL = location.hostname === "localhost" || location.hostname === "127.0.0.1";
  if (LOCAL) {
    const t = new URLSearchParams(location.search).get("shinytest");
    try { if (t === "1" || t === "0") localStorage.setItem("all22-shiny-test", t); } catch (_) { /* ignore */ }
  }
  function shinyTestHeader() {
    if (!LOCAL) return {};
    try { return localStorage.getItem("all22-shiny-test") === "1" ? { "X-Shiny-Test": "1" } : {}; } catch (_) { return {}; }
  }

  // ---------- Season stats ----------
  // The server keeps each player's season totals (the final included) as a list of numbers per spot,
  // in this order for the spot's group (STAT_COLS in api/_lib/fantasy.mjs). Leagues played before
  // there were stats have none, and the stats wait for the results, like the Team Scores.
  const STAT_COLS = {
    qb: ["passYds", "passTd", "int", "rushYds", "rushTd"],
    rb: ["rushYds", "rushTd", "rec", "recYds", "recTd"],
    rec: ["rec", "recYds", "recTd"],
    ol: ["sacksAllowed"],
    front: ["tackles", "sacks", "int", "td"],
    db: ["tackles", "int", "pd", "td"],
    k: ["fgm", "fga", "xpm", "xpa"],
  };
  const STAT_GROUP = { QB: "qb", HB: "rb", FB: "rb", WR: "rec", TE: "rec", SLOT: "rec", OL: "ol", DE: "front", NT: "front", DT: "front", OLB: "front", ILB: "front", MLB: "front", CB: "db", S: "db" };
  // What a player's line shows: [label, column (or made/tried), only when it isn't 0].
  const STAT_CELLS = {
    qb: [["Pass yds", "passYds"], ["TD", "passTd"], ["Int", "int"], ["Rush yds", "rushYds"], ["Rush TD", "rushTd", true]],
    rb: [["Rush yds", "rushYds"], ["TD", "rushTd"], ["Rec", "rec"], ["Rec yds", "recYds"], ["Rec TD", "recTd", true]],
    rec: [["Rec", "rec"], ["Yds", "recYds"], ["TD", "recTd"]],
    ol: [["Sacks allowed", "sacksAllowed"]],
    front: [["Tackles", "tackles"], ["Sacks", "sacks"], ["Int", "int", true], ["TD", "td", true]],
    db: [["Tackles", "tackles"], ["Int", "int"], ["Pass def", "pd"], ["TD", "td", true]],
    k: [["FG", "fgm/fga"], ["XP", "xpm/xpa"]],
  };
  const seasonStats = () => (league && league.status === "season" && league.season && league.season.stats && !inBroadcast() ? league.season.stats : null);
  const gamesPlayed = (id) => [...league.season.weeks.flat(), league.season.final].filter((g) => g.h === id || g.a === id).length;
  // A player's season as [label, value] cells, or null (no stats yet, or none kept for this league).
  function statLine(seatId, slotId) {
    const stats = seasonStats();
    const line = stats && stats[seatId] && stats[seatId][slotId];
    if (!line) return null;
    const seat = league.seats.find((x) => x.id === seatId);
    const group = slotId === "K" ? "k" : seat && STAT_GROUP[DRAFT.roleOf(slotId, seat)];
    if (!group) return null;
    const val = (name) => line[STAT_COLS[group].indexOf(name)] || 0;
    return STAT_CELLS[group].filter(([, cols, optional]) => !optional || val(cols)).map(([label, cols]) => [label, cols.split("/").map((c) => val(c).toLocaleString("en-US")).join("/")]);
  }

  // ---------- Player cards (field.js shows them) ----------
  // The builder's card: position, types, base stats and size, never how well they fit the spot. Once
  // the season is over it adds the player's season. seatOf() is the team the field shows.
  const statClass = (v) => (v >= 120 ? "hi" : v < 60 ? "lo" : "");
  const cardOf = (seatOf) => (slot, id) => {
    const d = POKEDATA[id - 1];
    if (!d) return null;
    const seatId = seatOf();
    const season = seatId ? statLine(seatId, slot.id) : null;
    return `<span class="pl-top"><span class="pos-chip ${{ D: "def", O: "off", K: "st" }[slot.side]}">${slot.pos}</span><b class="nm">${escapeHtml(nameOf(id))}</b>` +
      `${LEGENDARIES.has(id) ? '<span class="leg" title="Legendary or Mythical">★</span>' : ""}<span class="num">#${String(id).padStart(3, "0")}</span></span>` +
      `<span class="cand-types">${d.types.map((t) => `<span class="type t-${t}">${capital(t)}</span>`).join("")}</span>` +
      `<span class="cand-stats">${STAT_KEYS.map(([k, label]) => `<span class="${statClass(d[k])}" data-tip="${k}"><i>${label}</i>${d[k]}</span>`).join("")}</span>` +
      `<span class="pl-size">${heightText(id)} · ${weightText(id)}</span>` +
      (season ? `<span class="pl-season"><span class="pl-season-head">Season · ${gamesPlayed(seatId)} games</span>` +
        `<span class="pl-season-line">${season.map(([label, v]) => `<span><i>${label}</i>${v}</span>`).join("")}</span></span>` : "");
  };

  async function api(action, body) {
    const res = await fetch(`/api/fantasy?a=${action}`, body
      ? { method: "POST", headers: { "Content-Type": "application/json", ...shinyTestHeader() }, body: JSON.stringify(body) }
      : { cache: "no-store" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw Object.assign(new Error(data.error || `HTTP ${res.status}`), { status: res.status, data });
    return data;
  }

  // Seats this browser holds ({ code: { seat, token, at } }), and the last team name and formation.
  const SEATS_KEY = "fd-seats-v1";
  const TEAM_KEY = "fd-team-v1";
  const readJSON = (k, fallback) => {
    try { return JSON.parse(localStorage.getItem(k) || "null") || fallback; } catch (_) { return fallback; }
  };
  const writeJSON = (k, v) => {
    try { localStorage.setItem(k, JSON.stringify(v)); } catch (_) { /* ignore */ }
  };
  function mySeats() {
    const seats = readJSON(SEATS_KEY, {});
    const cutoff = Date.now() - 8 * 86400000;
    for (const [c, s] of Object.entries(seats)) if (!s || s.at < cutoff) delete seats[c];
    return seats;
  }
  const seatFor = (c) => mySeats()[c] || null;
  function rememberSeat(c, seat, token) {
    const seats = mySeats();
    seats[c] = { seat, token, at: Date.now() };
    writeJSON(SEATS_KEY, seats);
  }
  function forgetSeat(c) {
    const seats = mySeats();
    delete seats[c];
    writeJSON(SEATS_KEY, seats);
  }
  const lastTeam = () => ({ name: "", def: "34", off: "fb", ...readJSON(TEAM_KEY, {}) });

  // ---------- Team name + formation forms ----------
  let formCount = 0;
  function buildTeamForm(box, team) {
    const n = ++formCount;
    box.innerHTML = `<div class="fd-name-row"><label class="lbl" for="tn-${n}">Team name</label>` +
      `<input class="fd-input" id="tn-${n}" name="name" maxlength="20" autocomplete="off" placeholder="e.g. Pallet Town Pidgeys" required /></div>` +
      `<div class="row"><span class="lbl">Defense</span><div class="opts def fd-o2 fd-w80" role="radiogroup" aria-label="Defense">` +
      `<label><input type="radio" name="def-${n}" value="34" /><span>3-4</span></label><label><input type="radio" name="def-${n}" value="43" /><span>4-3</span></label></div></div>` +
      `<div class="row"><span class="lbl">Offense</span><div class="opts off fd-o2 fd-w80" role="radiogroup" aria-label="Offense">` +
      `<label><input type="radio" name="off-${n}" value="fb" /><span>Fullback</span></label><label><input type="radio" name="off-${n}" value="slot" /><span>Slot</span></label></div></div>`;
    fillTeamForm(box, team);
  }
  // A team name the word filter keeps out can't be sent (the browser says why); the server decides.
  function checkTeamName(input) {
    input.setCustomValidity(window.ALL22_WORDS && !window.ALL22_WORDS.isClean(input.value) ? "That team name isn't allowed. Pick another one." : "");
  }
  function fillTeamForm(box, team) {
    box.querySelector('input[name="name"]').value = team.name || "";
    checkTeamName(box.querySelector('input[name="name"]'));
    for (const input of box.querySelectorAll('input[type="radio"]')) input.checked = input.value === (input.name.startsWith("def") ? team.def : team.off);
  }
  function readTeamForm(box) {
    const val = (prefix) => (box.querySelector(`input[name^="${prefix}-"]:checked`) || {}).value;
    const team = { name: box.querySelector('input[name="name"]').value.trim(), def: val("def"), off: val("off") };
    writeJSON(TEAM_KEY, team);
    return team;
  }
  for (const box of document.querySelectorAll("[data-team-form]")) {
    buildTeamForm(box, lastTeam());
    const name = box.querySelector('input[name="name"]');
    name.addEventListener("input", () => checkTeamName(name));
  }

  // ---------- Routing: /draft is home, /draft?c=CODE a league ----------
  const VIEWS = ["fd-home", "fd-lobby", "fd-room", "fd-season"];
  function showView(id) {
    for (const v of VIEWS) $(v).hidden = v !== id;
    $("fd-loading").hidden = true;
    document.body.dataset.view = id;
    renderChat();
  }
  const codeFromUrl = () => {
    const c = (new URLSearchParams(location.search).get("c") || "").toUpperCase();
    return /^[A-HJ-NP-Z2-9]{5}$/.test(c) ? c : null;
  };
  let code = codeFromUrl();
  function goLeague(c) {
    history.pushState(null, "", `/draft?c=${c}`);
    openLeague(c);
  }
  function goHome() {
    history.pushState(null, "", "/draft");
    closeLeague();
    showHome();
  }
  addEventListener("popstate", () => {
    const c = codeFromUrl();
    if (c) openLeague(c);
    else {
      closeLeague();
      showHome();
    }
  });

  // ---------- Home ----------
  const createForm = $("fd-create");
  const modeSelect = $("c-mode");
  for (const [key, m] of Object.entries(MODES)) modeSelect.append(new Option(m.name, key));
  function createSettings() {
    const f = createForm.elements;
    const radio = (name) => (createForm.querySelector(`input[name="${name}"]:checked`) || {}).value;
    return {
      mode: f.mode.value, size: Number(radio("size")), order: radio("order"), timer: Number(radio("timer")),
      legends: radio("legends") === "1", kicker: radio("kicker") === "1", pub: radio("pub") === "1",
    };
  }
  // Team counts follow the mode: only as many as the pool can fill.
  function sizeChoices(box, name, mode, legends, kicker, current) {
    const max = maxTeams(mode, legends, kicker);
    box.replaceChildren();
    for (let n = MIN_TEAMS; n <= MAX_TEAMS; n++) {
      const label = make("label");
      const input = make("input");
      input.type = "radio";
      input.name = name;
      input.value = String(n);
      input.disabled = n > max;
      label.append(input, make("span", null, String(n)));
      label.classList.toggle("off", n > max);
      box.append(label);
    }
    const pick = Math.min(Math.max(current || 4, MIN_TEAMS), Math.max(max, MIN_TEAMS));
    const input = box.querySelector(`input[value="${pick}"]`);
    if (input && !input.disabled) input.checked = true;
    return max;
  }
  function updateCreateForm() {
    const s = createSettings();
    const max = sizeChoices($("c-size"), "size", s.mode, s.legends, s.kicker, s.size || 4);
    const pool = poolOf(s.mode, s.legends).length;
    $("c-mode-hint").textContent = max < MIN_TEAMS
      ? `${MODES[s.mode].hint}: only ${pool} Pokémon with these settings, not enough for ${MIN_TEAMS} teams.`
      : `${MODES[s.mode].hint}: ${pool} Pokémon, enough for up to ${max} teams.`;
    $("c-pub-hint").textContent = s.pub ? "Public: listed below so anyone can hop in." : "Private: only people with the link or code can join.";
    createForm.querySelector('button[type="submit"]').disabled = max < MIN_TEAMS;
  }
  createForm.addEventListener("change", updateCreateForm);
  modeSelect.value = "kanto";
  updateCreateForm();

  createForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const team = readTeamForm(createForm.querySelector("[data-team-form]"));
    const button = createForm.querySelector('button[type="submit"]');
    button.disabled = true;
    try {
      const out = await api("create", { settings: createSettings(), ...team });
      trackEvent("Fantasy League Created", { mode: out.league.set.mode, teams: out.league.set.size });
      rememberSeat(out.league.code, out.seat, out.token);
      adopt(out.league);
      goLeague(out.league.code);
    } catch (err) {
      toast(err.message);
    } finally {
      button.disabled = false;
    }
  });

  $("fd-join").addEventListener("submit", (e) => {
    e.preventDefault();
    const c = $("j-code").value.trim().toUpperCase();
    if (!/^[A-HJ-NP-Z2-9]{5}$/.test(c)) {
      toast("Codes are 5 letters and numbers");
      return;
    }
    goLeague(c);
  });

  const settingsText = (s) => [
    MODES[s.mode].name, `${s.size} teams`, s.timer ? `${s.timer}s picks` : "no pick timer",
    s.legends ? "Legendaries on" : "no Legendaries", ...(s.kicker ? ["kickers"] : []),
  ].join(" · ");

  let lobbyTimer = 0;
  async function loadLobbies() {
    clearTimeout(lobbyTimer);
    if (code) return;
    const list = $("fd-lobby-list");
    try {
      const { lobbies } = await api("lobbies");
      list.replaceChildren(...(lobbies.length ? lobbies.map((l) => {
        const li = make("li", "fd-lobby-row");
        const info = make("div");
        info.append(make("b", null, `${MODES[l.mode].name} · ${l.joined}/${l.size} teams`), make("small", null, settingsText(l).split(" · ").slice(2).join(" · ")));
        const join = make("button", "btn white", "Join");
        join.type = "button";
        join.addEventListener("click", () => goLeague(l.code));
        li.append(info, join);
        return li;
      }) : [make("li", "fd-empty", "No open lobbies right now. Start a public league and it'll show up here.")]));
    } catch (_) {
      list.replaceChildren(make("li", "fd-empty", "Couldn't load lobbies. Check your connection."));
    }
    if (!document.hidden) lobbyTimer = setTimeout(loadLobbies, 8000);
  }
  $("fd-lobbies-refresh").addEventListener("click", loadLobbies);

  function showHome() {
    code = null;
    $("fd-head-code").textContent = "";
    document.title = "Pokémon Fantasy Draft · All-22";
    showView("fd-home");
    renderMine();
    loadLobbies();
  }
  // Your leagues (the seats this browser holds; signed in, they follow you to your other devices).
  function renderMine() {
    const mine = Object.entries(mySeats()).sort((a, b) => b[1].at - a[1].at);
    $("fd-mine").hidden = !mine.length;
    $("fd-mine-list").replaceChildren(...mine.slice(0, 8).map(([c, s]) => {
      const li = make("li", "fd-lobby-row");
      const info = make("div");
      info.append(make("b", null, `League ${c}`), make("small", null, `Joined ${new Date(s.at).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}`));
      const open = make("button", "btn white", "Open");
      open.type = "button";
      open.addEventListener("click", () => goLeague(c));
      li.append(info, open);
      return li;
    }));
  }

  // ---------- A league: polling and drawing ----------
  let league = null;
  let offset = 0; // server clock minus ours
  let pollTimer = 0;
  let polling = false;
  const serverNow = () => Date.now() + offset;
  const me = () => (league && seatFor(league.code) ? league.seats.find((s) => s.id === seatFor(league.code).seat) || null : null);
  const seatName = (id) => (league.seats.find((s) => s.id === id) || {}).name || "?";
  const myAuth = () => ({ code: league.code, ...seatFor(league.code) });

  function adopt(next) {
    if (!next || (league && league.code === next.code && next.ver < league.ver)) return;
    if (next.now) offset = next.now - Date.now();
    league = next;
  }

  async function openLeague(c) {
    code = c;
    league = null;
    closeSheets();
    $("fd-head-code").textContent = c;
    $("fd-loading").hidden = false;
    for (const v of VIEWS) $(v).hidden = true;
    teamFields.clear();
    gameView = null;
    renderChat();
    await poll();
  }
  function closeLeague() {
    code = null;
    league = null;
    clearTimeout(pollTimer);
    stopTicker();
    closeSheets();
  }
  // Leaving a league (Back, often a swipe on a phone) with the pick sheet or a team's pop-up open
  // mustn't leave them, or the sheet's backdrop, over the next view.
  function closeSheets() {
    closePlace();
    if (teamDlg.open) teamDlg.close();
  }

  async function poll() {
    clearTimeout(pollTimer);
    if (!code || polling) return;
    polling = true;
    const asked = code;
    try {
      const out = await api(`state&code=${asked}&v=${league && league.code === asked ? league.ver : -1}`);
      if (asked !== code) {
        pollTimer = setTimeout(poll); // another league opened meanwhile, and its first poll found this one running
        return;
      }
      if (out.now) offset = out.now - Date.now();
      if (out.league) {
        adopt(out.league);
        render();
      }
    } catch (err) {
      if (asked === code && err.status === 404) {
        forgetSeat(asked);
        toast("That league doesn't exist or has expired.");
        goHome();
        return;
      }
    } finally {
      polling = false;
    }
    if (code) {
      const s = league && league.status;
      const delay = document.hidden ? 8000 : s === "draft" ? 1200 : s === "lobby" ? 2000 : 3000; // the season: chat stays lively
      pollTimer = setTimeout(poll, delay);
    }
  }
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) {
      if (code) poll();
      else loadLobbies();
    }
  });

  // Sends a move; the reply is the league as it now stands. "Busy" (someone else's move was being
  // saved) means nothing happened, so it tries again a moment later.
  async function act(action, extra = {}) {
    for (let attempt = 0; ; attempt++) {
      try {
        const out = await api(action, { ...myAuth(), ...extra });
        if (out.find) {
          revealing.add(out.find.p); // its usual colors until the reveal lands
          announced.add(out.league.picks.findIndex((x) => x.p === out.find.p));
        }
        adopt(out.league);
        render();
        return out;
      } catch (err) {
        if (err.status === 409 && /busy/.test(err.message) && attempt < 3) {
          await new Promise((r) => setTimeout(r, 150 * (attempt + 1)));
          continue;
        }
        toast(err.message);
        if (err.status === 403 && !me()) render();
        poll();
        return null;
      }
    }
  }

  function render() {
    if (!league) return;
    if (league.status !== "lobby") announceShinies();
    document.title = `${league.status === "draft" && league.onClock && me() && league.onClock === me().id ? "Your pick! · " : ""}League ${league.code} · Pokémon Fantasy Draft`;
    if (league.status === "lobby") {
      stopTicker();
      renderLobby();
    } else if (league.status === "draft") {
      renderRoom();
      startTicker();
    } else {
      if (selectedMon) closePlace(); // the draft ended (a timeout) while a pick was being placed
      renderSeason();
      startTicker();
    }
    if (teamDlg.open && league.teams[dlgTeam]) openTeam(dlgTeam);
    renderChat();
  }

  // ---------- Lobby ----------
  let editingSettings = false;
  function renderLobby() {
    showView("fd-lobby");
    const mine = me();
    const host = Boolean(mine && mine.host);
    const s = league.set;
    $("l-code").textContent = league.code;
    $("l-summary").textContent = `${settingsText(s)} · ${s.order === "set" ? "host sets the order" : "random order"} · ${s.pub ? "public" : "private"}`;
    $("l-edit").hidden = !host;
    $("l-settings").hidden = !host || !editingSettings;
    $("l-count").textContent = `${league.seats.length}/${s.size}`;
    $("l-order-note").textContent = s.order === "set" ? "Draft order, top to bottom" : "Draft order is random";
    const seats = $("l-seats");
    seats.replaceChildren();
    league.seats.forEach((seat, i) => {
      const li = make("li", `fd-seat${mine && seat.id === mine.id ? " me" : ""}`);
      const info = make("div", "fd-seat-info");
      const name = make("b", null, seat.name);
      const tags = [seat.host && "Host", mine && seat.id === mine.id && "You", seat.cpu && "Computer"].filter(Boolean);
      for (const t of tags) name.append(make("span", `fd-badge${t === "Computer" ? " cpu" : t === "You" ? " you" : " host"}`, t));
      info.append(name, make("small", null, schemeText(seat)));
      li.append(make("span", "fd-seat-n", String(i + 1)), info);
      if (host) {
        const tools = make("div", "fd-seat-tools");
        if (s.order === "set") {
          for (const [op, label, icon] of [["up", "Move up", "M6 15l6-6 6 6"], ["down", "Move down", "M6 9l6 6 6-6"]]) {
            const b = make("button", "fd-icon");
            b.type = "button";
            b.setAttribute("aria-label", `${label}: ${seat.name}`);
            b.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${icon}"/></svg>`;
            b.disabled = (op === "up" && i === 0) || (op === "down" && i === league.seats.length - 1);
            b.addEventListener("click", () => act("seats", { op, target: seat.id }));
            tools.append(b);
          }
        }
        if (seat.id !== mine.id) {
          const b = make("button", "fd-icon danger");
          b.type = "button";
          b.setAttribute("aria-label", `Remove ${seat.name}`);
          b.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg>';
          b.addEventListener("click", () => act("seats", { op: "kick", target: seat.id }));
          tools.append(b);
        }
        li.append(tools);
      }
      seats.append(li);
    });
    for (let i = league.seats.length; i < s.size; i++) {
      const li = make("li", "fd-seat open");
      li.append(make("span", "fd-seat-n", String(i + 1)), make("span", "fd-seat-info", "Open seat"));
      seats.append(li);
    }
    const full = league.seats.length >= s.size;
    $("l-host-tools").hidden = !host || full;
    // Your team (or a way in).
    $("l-mine").hidden = !mine;
    // Forms keep unsaved changes (Safari doesn't focus a tapped radio, so focus alone doesn't tell).
    const edited = (form) => form.contains(document.activeElement) || form.dataset.edited === editKey();
    if (mine && !edited($("l-mine"))) fillTeamForm($("l-mine").querySelector("[data-team-form]"), mine);
    $("l-join").hidden = Boolean(mine) || full;
    $("l-start").hidden = !host;
    $("l-start").disabled = !full;
    $("l-leave").hidden = !mine;
    const left = s.size - league.seats.length;
    $("l-note").textContent = !mine && full ? "This league is full. You can watch the draft from here once it starts."
      : left ? `Waiting for ${left} more team${left === 1 ? "" : "s"}.${host ? " Share the code, or fill the seats with computer teams." : ""}`
      : host ? "Everyone's in. Start when you're ready." : "Everyone's in. Waiting for the host to start the draft.";
    if (host && editingSettings && !edited($("l-settings"))) buildSettingsForm();
  }

  $("l-share").addEventListener("click", async () => {
    const url = `${location.origin}/draft?c=${league.code}`;
    const text = `Join my Pokémon fantasy draft (${MODES[league.set.mode].name}). Code ${league.code}`;
    if (navigator.share && window.matchMedia("(pointer: coarse)").matches) {
      try {
        await navigator.share({ title: "Pokémon All-22 Fantasy Draft", text, url });
        return;
      } catch (err) {
        if (err && err.name === "AbortError") return;
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      toast("Link copied");
    } catch (_) {
      toast(url);
    }
  });
  $("l-edit").addEventListener("click", () => {
    editingSettings = !editingSettings;
    if (editingSettings) buildSettingsForm();
    renderLobby();
  });
  function buildSettingsForm() {
    const form = $("l-settings");
    const s = league.set;
    form.innerHTML = '<div class="fd-set-head"><h2>Settings</h2></div><div class="fd-cell fd-cell-mode"><label class="lbl" for="e-mode">Pokémon</label><select class="fd-select" id="e-mode" name="mode"></select></div>' +
      '<div class="fd-cell"><span class="lbl">Teams</span><div class="opts fd-o4 fd-w44" role="radiogroup" aria-label="Teams" id="e-size"></div></div>' +
      '<div class="fd-cell"><span class="lbl">Draft order</span><div class="opts fd-o2 fd-w92" role="radiogroup" aria-label="Draft order">' +
      '<label><input type="radio" name="e-order" value="random" /><span>Random</span></label><label><input type="radio" name="e-order" value="set" /><span>Host sets</span></label></div></div>' +
      '<div class="fd-cell"><span class="lbl">Pick timer</span><div class="opts fd-o4 fd-w50" role="radiogroup" aria-label="Pick timer">' +
      ["30", "60", "90", "0"].map((t) => `<label><input type="radio" name="e-timer" value="${t}" /><span>${t === "0" ? "Off" : `${t}s`}</span></label>`).join("") + "</div></div>" +
      // the options in Start a league's order
      [["legends", "Legendaries", [["1", "On"], ["0", "Off"]]], ["kicker", "Kicker", [["0", "Off"], ["1", "On"]]], ["pub", "Lobby", [["0", "Private"], ["1", "Public"]]]].map(([k, label, opts]) =>
        `<div class="fd-cell"><span class="lbl">${label}</span><div class="opts${k === "kicker" ? " kick" : ""} fd-o2${k === "pub" ? " fd-w92" : ""}" role="radiogroup" aria-label="${label}">` +
        opts.map(([v, text]) => `<label><input type="radio" name="e-${k}" value="${v}" /><span>${text}</span></label>`).join("") + "</div></div>").join("") +
      '<div class="fd-set-foot"><button type="submit" class="btn violet">Save settings</button></div>';
    const sel = form.querySelector("#e-mode");
    for (const [key, m] of Object.entries(MODES)) sel.append(new Option(m.name, key));
    sel.value = s.mode;
    const check = (name, v) => { const i = form.querySelector(`input[name="${name}"][value="${v}"]`); if (i) i.checked = true; };
    check("e-order", s.order);
    check("e-timer", String(s.timer));
    check("e-legends", s.legends ? "1" : "0");
    check("e-kicker", s.kicker ? "1" : "0");
    check("e-pub", s.pub ? "1" : "0");
    const refresh = () => {
      const v = readSettingsForm();
      sizeChoices(form.querySelector("#e-size"), "e-size", v.mode, v.legends, v.kicker, v.size || s.size);
    };
    sizeChoices(form.querySelector("#e-size"), "e-size", s.mode, s.legends, s.kicker, s.size);
    delete form.dataset.edited;
    form.onchange = () => {
      form.dataset.edited = editKey();
      refresh();
    };
  }
  function readSettingsForm() {
    const form = $("l-settings");
    const radio = (name) => (form.querySelector(`input[name="${name}"]:checked`) || {}).value;
    return {
      mode: form.querySelector("#e-mode").value, size: Number(radio("e-size")), order: radio("e-order"), timer: Number(radio("e-timer")),
      legends: radio("e-legends") === "1", kicker: radio("e-kicker") === "1", pub: radio("e-pub") === "1",
    };
  }
  $("l-settings").addEventListener("submit", async (e) => {
    e.preventDefault();
    if (await act("settings", { settings: readSettingsForm() })) {
      editingSettings = false;
      toast("Settings saved");
      renderLobby();
    }
  });
  $("l-cpu").addEventListener("click", () => act("seats", { op: "cpu" }));
  $("l-fill").addEventListener("click", () => act("seats", { op: "fill" }));
  let starting = false; // a double tap shouldn't also say "the draft has already started"
  $("l-start").addEventListener("click", async () => {
    if (starting) return;
    starting = true;
    const out = await act("start");
    starting = false;
    if (out && out.league.status === "draft") trackEvent("Fantasy League Started", { mode: out.league.set.mode, humans: humansIn(out.league) });
  });
  $("l-leave").addEventListener("click", async () => {
    if (!confirm(league.status === "lobby" ? "Leave this league?" : "Leave the draft? Your team will keep drafting on its own.")) return;
    const c = league.code;
    const out = await act("leave", { lobby: league.status === "lobby" });
    if (out && league.status === "lobby") {
      forgetSeat(c);
      goHome();
    }
  });
  // Unsaved edits belong to this seat in this league (leaving and joining again, or being removed and
  // joining again, starts from the new team).
  const editKey = () => `${league.code}:${(me() || {}).id || ""}`;
  $("l-mine").addEventListener("change", () => {
    $("l-mine").dataset.edited = editKey();
  });
  $("l-mine").addEventListener("submit", async (e) => {
    e.preventDefault();
    const team = readTeamForm($("l-mine").querySelector("[data-team-form]"));
    if (await act("team", team)) {
      delete $("l-mine").dataset.edited;
      toast("Saved");
    }
  });
  let joining = false; // a double tap shouldn't also say "another team already has that name"
  $("l-join").addEventListener("submit", async (e) => {
    e.preventDefault();
    if (joining) return;
    joining = true;
    const team = readTeamForm($("l-join").querySelector("[data-team-form]"));
    try {
      const out = await api("join", { code: league.code, ...team });
      rememberSeat(out.league.code, out.seat, out.token);
      adopt(out.league);
      render();
      toast(`You're in as ${team.name}`);
    } catch (err) {
      toast(err.message);
    } finally {
      joining = false;
    }
  });

  // ---------- The pick sound (a Discord request) ----------
  // A two-note chime when you come on the clock and one short tick with 10 seconds left on your pick. Made with Web
  // Audio, so there's nothing to download. On unless switched off in the room (remembered in this browser). Browsers
  // only let a page make sound after a tap or a key press, so the audio starts on the first one.
  const SOUND_KEY = "fd-sound-v1";
  let soundOn = true;
  try { soundOn = localStorage.getItem(SOUND_KEY) !== "0"; } catch (_) { /* storage unavailable: on */ }
  let actx = null;
  function audioCtx() {
    if (!actx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      try { actx = window.ALL22_AUDIO = new AC(); } catch (_) { return null; }
    }
    return actx;
  }
  const unlockAudio = () => {
    const a = audioCtx();
    if (a && a.state === "suspended") a.resume().catch(() => {});
    removeEventListener("pointerdown", unlockAudio);
    removeEventListener("keydown", unlockAudio);
  };
  addEventListener("pointerdown", unlockAudio);
  addEventListener("keydown", unlockAudio);
  // Phones only start sound inside a tap's click (a pointerdown isn't enough on an iPhone): the tap that places your
  // pick readies it, so a shiny's reveal has its cue (and the chimes play from then on).
  function readySound() {
    if (!soundOn) return;
    const a = audioCtx();
    if (a && a.state !== "running") a.resume().catch(() => {});
  }
  function tone(freq, start, len, peak) {
    const a = audioCtx();
    if (!a) return;
    if (a.state === "suspended") { a.resume().then(() => { if (a.state === "running") tone(freq, start, len, peak); }).catch(() => {}); return; }
    try {
      const t = a.currentTime + start, osc = a.createOscillator(), gain = a.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(peak, t + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + len);
      osc.connect(gain).connect(a.destination);
      osc.start(t);
      osc.stop(t + len + 0.02);
    } catch (_) { /* sound never gets in the way of the draft */ }
  }
  function pickSound() {
    if (!soundOn) return;
    tone(784, 0, 0.32, 0.2);
    tone(1047, 0.14, 0.45, 0.2);
  }
  function warnSound() {
    if (soundOn) tone(1320, 0, 0.09, 0.12);
  }
  function renderSound() {
    const b = $("r-sound");
    b.setAttribute("aria-pressed", String(soundOn));
    b.setAttribute("aria-label", soundOn ? "Pick sound on" : "Pick sound off");
    b.title = `Sound when it's your pick: ${soundOn ? "on" : "off"}`;
  }
  $("r-sound").addEventListener("click", () => {
    soundOn = !soundOn;
    try { localStorage.setItem(SOUND_KEY, soundOn ? "1" : "0"); } catch (_) { /* this visit only */ }
    renderSound();
    pickSound(); // a sample when it's switched on
  });
  renderSound();

  // ---------- Draft room ----------
  let tab = "pick";
  let selectedMon = null; // a Pokémon chosen in the list, waiting for a spot
  let selectedFor = 0; // the pick it was chosen for
  let selectedSlot = null; // one of your players, chosen to move
  let lastOnClock = null;
  let warnedFor = -1; // the pick the 10-second warning sounded for
  const poolRows = new Map(); // id -> row element (built once per pool)
  let poolKey = "";

  const typeSelect = $("r-type");
  typeSelect.append(new Option("All types", ""), ...TYPE_NAMES.map((t) => new Option(capital(t), t)));
  const SORTS = [["dex", "Dex #"], ["name", "Name"], ["total", "Total stats"], ...STAT_KEYS.map(([k, l]) => [k, l]), ["kg", "Weight"], ["ht", "Height"]];
  $("r-sort").append(...SORTS.map(([v, l]) => new Option(`Sort: ${l}`, v)));
  $("r-search").addEventListener("input", () => drawPool());
  typeSelect.addEventListener("change", () => drawPool());
  $("r-sort").addEventListener("change", () => drawPool());

  for (const btn of document.querySelectorAll(".fd-tabs [data-tab]")) {
    btn.addEventListener("click", () => {
      tab = btn.dataset.tab;
      renderTabs();
    });
  }
  function renderTabs() {
    for (const btn of document.querySelectorAll(".fd-tabs [data-tab]")) btn.setAttribute("aria-selected", String(btn.dataset.tab === tab));
    for (const p of document.querySelectorAll("#fd-room [data-panel]")) p.classList.toggle("active", p.dataset.panel === tab);
  }

  function myTurn() {
    const mine = me();
    return Boolean(league && league.status === "draft" && mine && league.onClock === mine.id);
  }
  const roundOf = (n) => Math.floor(n / league.order.length) + 1;
  // The team picking at overall pick n (snake order).
  function seatAtPick(n) {
    const k = league.order.length;
    const round = Math.floor(n / k);
    const i = n % k;
    return league.order[round % 2 === 0 ? i : k - 1 - i];
  }

  function renderRoom() {
    showView("fd-room");
    const mine = me();
    const spots = spotsFor(league.set.kicker).length;
    const n = league.picks.length;
    const cell = (label, k, of) => `<small>${label}</small><b>${k}<small aria-hidden="true">/${of}</small><span class="sr-only"> of ${of}</span></b>`;
    setHtml($("r-round"), cell("Round", roundOf(n), spots));
    setHtml($("r-pick"), cell("Pick", n + 1, league.total));
    const up = league.onClock;
    const upSeat = league.seats.find((s) => s.id === up);
    const yours = myTurn();
    const auto = (seat) => seat.cpu || seat.gone || seat.away;
    $("r-up").textContent = yours ? (mine.away ? "The computer is picking for you…" : "You're on the clock!") : upSeat ? `${upSeat.name} ${auto(upSeat) ? "is picking…" : "is on the clock"}` : "";
    $("r-away").hidden = !(mine && mine.away);
    $("r-clock").classList.toggle("mine", yours && !mine.away);
    $("r-skip").hidden = !(mine && mine.host && upSeat && !auto(upSeat) && up !== mine.id && !league.set.timer);
    // The pick you were placing has been made for you: say why.
    if (selectedMon && mine && n > selectedFor) {
      const made = league.picks[selectedFor];
      if (made && made.s === mine.id && made.auto) toast(league.set.timer ? "Time ran out, so the computer picked for you." : "The host picked for you.");
      selectedFor = n;
    }
    if (up !== lastOnClock) {
      // (also the draft's first pick, when the room first shows)
      if (yours && !mine.away && (lastOnClock !== null || n === 0)) {
        toast("You're on the clock!");
        if (navigator.vibrate) navigator.vibrate(160);
        pickSound();
        tab = "pick";
      }
      if (!yours) closePlace();
      lastOnClock = up;
    }
    $("r-mine-count").textContent = mine ? `${Object.keys(league.teams[mine.id] || {}).length}/${spots}` : "";
    renderTabs();
    drawPool();
    drawMyTeam();
    drawLeague();
    fitRoom();
    if (selectedMon && !yours) closePlace();
    if (selectedMon && taken().has(selectedMon)) closePlace();
  }

  // Wide screens: where the room's columns start (under the header and the pick clock, whose height
  // can vary), so the side columns can end at the bottom of the window.
  function fitRoom() {
    const top = document.querySelector(".fd-room-cols").getBoundingClientRect().top + window.scrollY;
    document.documentElement.style.setProperty("--room-top", `${Math.round(top)}px`);
  }
  addEventListener("resize", () => {
    if (league && league.status === "draft") fitRoom();
  });

  const taken = () => new Set(league.picks.map((p) => p.p));

  function poolRow(id) {
    const d = POKEDATA[id - 1];
    const li = make("li", "fd-mon");
    const btn = make("button", "fd-mon-btn");
    btn.type = "button";
    const img = make("img", "fd-mon-img");
    img.src = iconUrl(leagueStyle(), id);
    img.alt = "";
    img.loading = "lazy";
    const main = make("span", "fd-mon-main");
    const head = make("span", "fd-mon-head");
    head.append(make("b", null, nameOf(id)));
    if (LEGENDARIES.has(id)) head.append(make("span", "leg", "★"));
    head.append(make("span", "num", `#${String(id).padStart(3, "0")}`));
    const types = make("span", "cand-types");
    types.innerHTML = d.types.map((t) => `<span class="type t-${t}">${capital(t)}</span>`).join("");
    const size = make("span", "fd-mon-size");
    size.innerHTML = `<span data-tip="height">${heightText(id)}</span> · <span data-tip="weight">${weightText(id)}</span>`;
    head.append(size);
    main.append(head, types);
    const stats = make("span", "cand-stats fd-mon-stats");
    stats.innerHTML = STAT_KEYS.map(([k, label]) => `<span class="${d[k] >= 120 ? "hi" : d[k] < 60 ? "lo" : ""}" data-tip="${k}"><i>${label}</i>${d[k]}</span>`).join("");
    btn.append(img, main, stats);
    btn.addEventListener("click", () => chooseMon(id));
    li.append(btn);
    li.dataset.id = id;
    return li;
  }

  function drawPool() {
    if (!league || league.status !== "draft") return;
    const key = `${league.set.mode}:${league.set.legends}:${leagueStyle()}`;
    const pool = poolOf(league.set.mode, league.set.legends);
    if (key !== poolKey) {
      poolRows.clear();
      for (const id of pool) poolRows.set(id, poolRow(id));
      poolKey = key;
    }
    const gone = taken();
    const q = fold($("r-search").value.trim());
    const type = typeSelect.value;
    const sort = $("r-sort").value || "dex";
    const val = (id) => {
      const d = POKEDATA[id - 1];
      if (sort === "total") return d.hp + d.atk + d.def + d.spa + d.spd + d.spe;
      if (sort === "kg") return d.kg;
      if (sort === "ht") return HEIGHT_DM[id - 1];
      return d[sort];
    };
    let ids = pool.filter((id) => !gone.has(id) && (!type || POKEDATA[id - 1].types.includes(type)) && (!q || fold(nameOf(id)).includes(q)));
    if (sort === "name") ids.sort((a, b) => nameOf(a).localeCompare(nameOf(b)));
    else if (sort !== "dex") ids.sort((a, b) => val(b) - val(a) || a - b);
    const list = $("r-pool");
    const rows = ids.map((id) => poolRows.get(id));
    for (const row of rows) row.classList.toggle("sel", Number(row.dataset.id) === selectedMon);
    // Only touch the list when its contents change (keeps the scroll position steady).
    const sig = ids.join(",");
    if (list.dataset.sig !== sig) {
      // Usually a pick just took rows out: remove those, since putting a long list back in lays out
      // every row again (slow on phones in the bigger pools).
      const keep = new Set(rows);
      const left = [...list.children].filter((row) => keep.has(row));
      if (left.length === rows.length && left.every((row, i) => row === rows[i])) {
        for (const row of [...list.children]) if (!keep.has(row)) row.remove();
      } else list.replaceChildren(...rows);
      list.dataset.sig = sig;
    }
    $("r-pool-note").textContent = myTurn() ? `Your pick: ${wideQuery.matches ? "click a Pokémon, then a glowing spot on your field" : "tap a Pokémon, then a glowing spot"}. ${ids.length} available.`
      : `${ids.length} Pokémon available. Browse while you wait.`;
  }

  function chooseMon(id) {
    selectedMon = selectedMon === id ? null : id;
    selectedSlot = null;
    drawPool();
    if (!selectedMon) return closePlace();
    if (!myTurn()) {
      toast(me() ? "Not your pick yet. You can look around while you wait." : "You're watching this league, so you can look around but not pick.");
      selectedMon = null;
      drawPool();
      return;
    }
    selectedFor = league.picks.length;
    openPlace();
  }

  const openSpots = (team) => new Set(spotsFor(league.set.kicker).filter((s) => !team[s]));
  const mySeatId = () => (me() || {}).id;
  const myField = AllField.create({ onTap: tapMySpot, onMove: moveMine, card: cardOf(mySeatId), label: "Your lineup" });
  const placeField = AllField.create({ onTap: placeTap, card: cardOf(mySeatId), label: "Your lineup" });
  $("r-field").append(myField.el);
  $("r-place-spots").append(placeField.el);

  // Where the chosen Pokémon goes: your field with the open spots lit up (on a phone, in a sheet
  // over the list; on a wide screen, the field beside it).
  function openPlace() {
    if (wideQuery.matches) return drawMyTeam();
    const mine = me();
    const team = league.teams[mine.id] || {};
    $("r-place-title").textContent = `Where does ${nameOf(selectedMon)} play?`;
    const d = POKEDATA[selectedMon - 1];
    $("r-place-card").innerHTML = `<img class="fd-place-img" alt="" width="52" height="52" src="${iconUrl(leagueStyle(), selectedMon)}" />` +
      `<span class="fd-place-main"><b></b><span class="cand-types">${d.types.map((t) => `<span class="type t-${t}">${capital(t)}</span>`).join("")}</span></span>`;
    $("r-place-card").querySelector("b").textContent = nameOf(selectedMon);
    placeField.update({ team, scheme: { def: mine.def, off: mine.off }, kicker: league.set.kicker, style: leagueStyle(), open: openSpots(team), shiny: shinySet() });
    $("r-place").hidden = false;
    document.body.classList.add("fd-placing");
  }
  function closePlace() {
    selectedMon = null;
    $("r-place").hidden = true;
    document.body.classList.remove("fd-placing");
    if (league && league.status === "draft") {
      drawPool();
      drawMyTeam();
    }
  }
  $("r-place-cancel").addEventListener("click", closePlace);
  $("r-place-x").addEventListener("click", closePlace);
  // Away (the computer is picking for you): any tap or key press means you're back.
  let backing = false;
  function imBack() {
    const mine = me();
    if (backing || !league || league.status !== "draft" || !mine || !mine.away) return;
    backing = true;
    act("back").finally(() => {
      backing = false;
    });
  }
  for (const type of ["pointerdown", "keydown"]) addEventListener(type, imBack, { capture: true, passive: true });
  $("r-back").addEventListener("click", imBack);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && selectedMon) closePlace();
  });
  // One skip per tap: a double tap's second tap mustn't skip the next team too, even when the first
  // one's reply (and the button for the next team) is already back by then.
  let skipAt = -Infinity;
  $("r-skip").addEventListener("click", async () => {
    if (performance.now() - skipAt < 1000) return;
    skipAt = performance.now();
    await act("skip", { n: league.picks.length });
    skipAt = performance.now();
  });
  function placeTap(slot) {
    const mine = me();
    if (mine && (league.teams[mine.id] || {})[slot]) return toast("That spot is taken. Tap a glowing one.");
    placeAt(slot);
  }
  async function placeAt(slot) {
    const p = selectedMon;
    const mine = me();
    if (!p || !mine) return;
    readySound();
    closePlace();
    const out = await changeMine((team) => {
      team[slot] = p;
      league.picks = [...league.picks, { s: mine.id, p, slot }];
    }, "pick", { p, slot, n: league.picks.length });
    if (out && out.find) showFind(out.find, slot);
    else if (out) toast(`${nameOf(p)} is yours`);
    if (out) $("fd-sr").textContent = `You drafted ${nameOf(p)}${out.find ? ", a shiny" : ""}.`;
  }

  // Your own changes (team, picks, chat lines) show right away; the server's reply confirms them, or
  // they're undone if it says no.
  async function optimistic(change, action, extra) {
    const ver = league.ver;
    const before = { teams: league.teams, picks: league.picks, chat: league.chat };
    change();
    league.ver = ver + 0.5; // a poll answered before the server saw the change is older, so it's ignored
    render();
    const out = await act(action, extra);
    if (!out && league.ver === ver + 0.5) {
      Object.assign(league, before);
      league.ver = ver;
      render();
    }
    return out;
  }
  function changeMine(change, action, extra) {
    const id = me().id;
    return optimistic(() => {
      const team = { ...(league.teams[id] || {}) };
      change(team);
      league.teams = { ...league.teams, [id]: team };
    }, action, extra);
  }
  function moveMine(from, to) {
    selectedSlot = null;
    if (!league || league.status !== "draft" || !me()) return;
    changeMine((team) => {
      [team[from], team[to]] = [team[to], team[from]];
      if (!team[from]) delete team[from];
    }, "move", { from, to });
  }

  function drawMyTeam() {
    const mine = me();
    document.querySelector(".fd-team-panel").classList.toggle("watching", !mine);
    if (!mine) {
      $("r-team-name").textContent = "Watching";
      $("r-team-count").textContent = "";
      $("r-team-note").textContent = "You're not in this league, so you're watching.";
      $("r-field").hidden = true;
      $("r-roster").replaceChildren();
      return;
    }
    const team = league.teams[mine.id] || {};
    const scheme = { def: mine.def, off: mine.off };
    const placing = Boolean(selectedMon && myTurn() && wideQuery.matches);
    if (selectedSlot && !team[selectedSlot]) selectedSlot = null;
    $("r-team-name").textContent = mine.name;
    $("r-team-count").textContent = `${Object.keys(team).length} of ${spotsFor(league.set.kicker).length} spots`;
    for (const input of document.querySelectorAll('input[name="r-def"], input[name="r-off"]')) input.checked = input.value === (input.name === "r-def" ? mine.def : mine.off);
    $("r-team-note").textContent = placing ? `Where does ${nameOf(selectedMon)} play? Click a glowing spot.`
      : selectedSlot ? `Moving ${nameOf(team[selectedSlot])}: tap where they should play.`
      : "Drag a player to another spot to move them.";
    $("r-field").hidden = false;
    myField.update({ team, scheme, kicker: league.set.kicker, style: leagueStyle(), open: placing ? openSpots(team) : null, selected: selectedSlot, shiny: shinySet() });
    $("r-roster").replaceChildren(rosterList(team, scheme, league.set.kicker));
  }
  // Tapping your field: places the chosen Pokémon on a wide screen, otherwise picks a player to
  // move and then where they go (dragging does the same in one go).
  function tapMySpot(slot) {
    const mine = me();
    if (!mine) return;
    const team = league.teams[mine.id] || {};
    if (selectedMon && myTurn()) {
      if (!team[slot]) return placeAt(slot);
      if (wideQuery.matches) return toast("That spot is taken. Click a glowing one.");
    }
    if (!selectedSlot) {
      if (!team[slot]) return;
      selectedSlot = slot;
      drawMyTeam();
      return;
    }
    const from = selectedSlot;
    selectedSlot = null;
    if (from === slot) return drawMyTeam();
    moveMine(from, slot);
  }
  for (const input of document.querySelectorAll('input[name="r-def"], input[name="r-off"]')) {
    input.addEventListener("change", () => {
      if (input.checked) act("team", input.name === "r-def" ? { def: input.value } : { off: input.value });
    });
  }

  function drawLeague() {
    const n = league.picks.length;
    const next = $("r-next");
    next.replaceChildren();
    for (let k = n; k < Math.min(league.total, n + 6); k++) {
      const id = seatAtPick(k);
      const li = make("li", `${k === n ? "now" : ""}${me() && id === me().id ? " me" : ""}`);
      li.append(make("span", "fd-pk", `#${k + 1}`), make("span", "fd-next-name", seatName(id)));
      if (k === n) li.append(make("span", "fd-now", "On the clock"));
      next.append(li);
    }
    const spots = spotsFor(league.set.kicker).length;
    $("r-teams").replaceChildren(...league.order.map((id) => {
      const seat = league.seats.find((s) => s.id === id);
      const count = Object.keys(league.teams[id] || {}).length;
      const li = make("li");
      const b = make("button", `fd-team-row${me() && id === me().id ? " me" : ""}`);
      b.type = "button";
      const last = [...league.picks].reverse().find((p) => p.s === id);
      const info = make("span", "fd-team-row-info");
      const name = make("b", null, seat.name);
      if (me() && id === me().id) name.append(make("span", "fd-badge you", "You"));
      if (seat.cpu) name.append(make("span", "fd-badge cpu", "CPU"));
      if (seat.gone || seat.away) name.append(make("span", "fd-badge away", "Away"));
      info.append(name, make("small", last && last.shiny ? "shiny" : null, last ? `Last: ${last.shiny ? "✦ Shiny " : ""}${nameOf(last.p)} (${posOf(last.slot, seat)})` : schemeText(seat)));
      b.append(info, make("span", "fd-team-row-n", `${count}/${spots}`));
      b.insertAdjacentHTML("beforeend", '<svg class="fd-chev" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>');
      b.addEventListener("click", () => openTeam(id));
      li.append(b);
      return li;
    }));
  }

  // Another team's lineup in a pop-up (kept up to date while it's open). Once the season is over it
  // also has the team's season stats (your own team's too, from the results' Season stats button).
  const teamDlg = $("fd-team-dlg");
  const dlgField = AllField.create({ card: cardOf(() => dlgTeam), label: "Lineup" });
  let dlgTeam = null;
  let dlgView = "stats"; // "stats" or "lineup", once there are stats
  function openTeam(id, view) {
    if (view) dlgView = view;
    dlgTeam = id;
    const seat = league.seats.find((s) => s.id === id);
    const team = league.teams[id] || {};
    $("fd-team-dlg-title").textContent = seat.name;
    const score = league.season && league.season.scores[id];
    const shown = league.status === "season" && score && !inBroadcast();
    $("fd-team-dlg-sub").textContent = `${schemeText(seat)}${shown ? ` · Team Score ${score.score} (Offense ${score.offense}, Defense ${score.defense})` : ` · ${Object.keys(team).length} of ${spotsFor(league.set.kicker).length} spots filled`}`;
    const stats = seasonStats();
    const withStats = Boolean(stats && stats[id]);
    $("fd-team-dlg-tabs").hidden = !withStats;
    for (const b of $("fd-team-dlg-tabs").children) b.setAttribute("aria-selected", String(b.dataset.view === dlgView));
    const body = $("fd-team-dlg-body");
    if (withStats && dlgView === "stats") {
      const sig = `${seasonKey}:${id}:${leagueStyle()}`;
      if (body.dataset.stats !== sig) { // rebuilt only when it changes (keeps the scroll position)
        AllField.hideCard();
        body.replaceChildren(statsList(id));
        body.dataset.stats = sig;
      }
    } else {
      delete body.dataset.stats;
      dlgField.update({ team, scheme: { def: seat.def, off: seat.off }, kicker: league.set.kicker, style: leagueStyle(), shiny: shinySet() });
      if (body.firstChild === dlgField.el) body.lastChild.replaceWith(rosterList(team, seat, league.set.kicker)); // keeps the scroll position
      else body.replaceChildren(dlgField.el, rosterList(team, seat, league.set.kicker));
    }
    if (!teamDlg.open) {
      body.scrollTop = 0;
      teamDlg.showModal();
    }
  }
  teamDlg.addEventListener("click", (e) => {
    if (e.target === teamDlg) teamDlg.close();
  });
  teamDlg.addEventListener("close", () => AllField.hideCard());
  for (const b of $("fd-team-dlg-tabs").children) {
    b.addEventListener("click", () => {
      if (b.dataset.view === dlgView) return;
      openTeam(dlgTeam, b.dataset.view);
      $("fd-team-dlg-body").scrollTop = 0;
    });
  }

  // A team's season, player by player: offense, defense, then the kicker, each with their numbers.
  function statsList(id) {
    const seat = league.seats.find((s) => s.id === id);
    const team = league.teams[id] || {};
    const box = make("div", "fd-stats");
    const final = league.season.final;
    box.append(make("p", "fd-hint fd-stats-note", `Season totals: ${gamesPlayed(id)} games${final.h === id || final.a === id ? ", the final included" : ""}.`));
    for (const [side, title] of [["O", "Offense"], ["D", "Defense"], ["K", "Kicker"]]) {
      const slots = slotsFor(seat, league.set.kicker).filter((s) => s.side === side).sort((a, b) => LIST_ORDER.indexOf(a.id) - LIST_ORDER.indexOf(b.id));
      if (!slots.length) continue;
      const col = make("section", `fd-stats-side side-${side.toLowerCase()}`);
      col.append(make("h4", null, title));
      for (const slot of slots) {
        const p = team[slot.id];
        if (!p) continue;
        const row = make("div", "fd-stat-row");
        const img = make("img", "fd-stat-img");
        img.src = (shinySet().has(p) ? shinyIconUrl : iconUrl)(leagueStyle(), p);
        img.alt = "";
        img.loading = "lazy";
        const main = make("div", "fd-stat-main");
        const top = make("div", "fd-stat-top");
        top.append(make("b", null, slot.pos), make("span", null, nameOf(p)));
        const cells = make("div", "fd-stat-cells");
        for (const [label, v] of statLine(id, slot.id) || []) {
          const cell = make("span");
          cell.append(make("b", null, v), make("i", null, label));
          cells.append(cell);
        }
        main.append(top, cells);
        row.append(img, main);
        col.append(row);
      }
      box.append(col);
    }
    return box;
  }

  // Ticker: the pick clock in the draft, the broadcast in the season.
  let ticker = 0;
  let dueAsked = 0;
  function startTicker() {
    if (!ticker) ticker = setInterval(tick, 250);
    tick();
  }
  function stopTicker() {
    clearInterval(ticker);
    ticker = 0;
  }
  function tick() {
    if (!league) return;
    if (league.status === "draft") {
      const left = league.deadline ? Math.max(0, league.deadline - serverNow()) : null;
      const el = $("r-timer");
      el.hidden = left == null;
      if (left != null) {
        const s = Math.ceil(left / 1000);
        el.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
        el.classList.toggle("low", s <= 10 && myTurn());
        if (s <= 10 && s > 0 && myTurn() && !me().away && warnedFor !== league.picks.length) {
          warnedFor = league.picks.length;
          warnSound();
        }
        // A due pick: ask right away rather than at the next poll (once per pick). A player's own pick
        // is due a moment after their clock shows 0:00 (the server's grace for a last-second pick).
        const due = league.due || league.deadline;
        if (serverNow() >= due && !polling && dueAsked !== due) {
          dueAsked = due;
          poll();
        }
      }
    } else if (league.status === "season") {
      renderSeason();
    }
  }

  // ---------- Season ----------
  let skipped = false; // "Skip to results" (this page only)
  let seasonKey = "";
  const broadcastEnd = (s) => s.start + s.weeks.length * s.pace.week + s.pace.final;
  const inBroadcast = () => league && league.season && !skipped && serverNow() < broadcastEnd(league.season);

  // Scoring plays for a game's final score (touchdowns and field goals, now and then a safety or
  // two-point try), spread over four quarters: the running score at the end of each quarter.
  function quarters(score, seed) {
    let r = seed >>> 0;
    const rnd = () => ((r = (Math.imul(r ^ (r >>> 15), 0x2c1b3c6d) + 0x9e3779b9) >>> 0) / 4294967296);
    const plays = [];
    let left = score;
    while (left > 0) {
      const opts = [7, 7, 3, 3, 6, 2].filter((p) => p <= left && (left - p === 0 || left - p >= 2));
      const p = opts.length ? opts[Math.floor(rnd() * opts.length)] : left;
      plays.push(p);
      left -= p;
    }
    const q = [0, 0, 0, 0];
    for (const p of plays) q[Math.floor(rnd() * 4)] += p;
    let run = 0;
    return q.map((x) => (run += x));
  }

  function standingsUpTo(weeks, upto, partialFinal) {
    // Every regular-season game in: the server's own table, whose last tie-break (Team Score) the live
    // table leaves out (it would give away the scores mid-broadcast), so a full tie can't re-sort later.
    if (upto > weeks.length - 1 || (upto === weeks.length - 1 && partialFinal)) return league.season.standings;
    const rows = Object.fromEntries(league.order.map((id) => [id, { id, w: 0, l: 0, pf: 0, pa: 0 }]));
    const games = [];
    weeks.forEach((week, i) => {
      if (i > upto || (i === upto && !partialFinal)) return;
      for (const g of week) {
        const [win, lose] = g.hs > g.as ? [g.h, g.a] : [g.a, g.h];
        rows[win].w++;
        rows[lose].l++;
        rows[g.h].pf += g.hs; rows[g.h].pa += g.as;
        rows[g.a].pf += g.as; rows[g.a].pa += g.hs;
        games.push(g);
      }
    });
    // Ties go the server's way (standingsOf in api/_lib/fantasy.mjs): head-to-head, then point difference.
    const h2h = (a, b) => games.filter((g) => (g.h === a && g.a === b) || (g.h === b && g.a === a))
      .reduce((n, g) => n + ((g.hs > g.as ? g.h : g.a) === a ? 1 : -1), 0);
    return Object.values(rows).sort((a, b) => b.w - a.w || h2h(b.id, a.id) || (b.pf - b.pa) - (a.pf - a.pa));
  }

  // Each team's field for the broadcast (a team plays at most one game a week, so one each).
  const teamFields = new Map();
  function teamField(id) {
    let f = teamFields.get(id);
    if (!f) {
      f = AllField.create({ card: cardOf(() => id), label: `${seatName(id)} lineup` });
      teamFields.set(id, f);
    }
    const seat = league.seats.find((x) => x.id === id);
    f.update({ team: league.teams[id] || {}, scheme: { def: seat.def, off: seat.off }, kicker: league.set.kicker, style: leagueStyle(), shiny: shinySet() });
    return f;
  }

  // A game on the broadcast: the scoreboard (scores climbing quarter by quarter, popping when they
  // change) over both teams' lineups. Built once; update(progress) moves it along (1 = final).
  function gameCard(g, k, big = false) {
    const mine = me();
    const card = make("div", `fd-game${big ? " big" : ""}${mine && (g.h === mine.id || g.a === mine.id) ? " mine" : ""}`);
    const board = make("div", "fd-game-board");
    const sides = [[g.a, quarters(g.as, k * 2 + 2), g.as], [g.h, quarters(g.hs, k * 2 + 1), g.hs]].map(([id, path, final]) => {
      const row = make("div", `fd-game-row${mine && id === mine.id ? " me" : ""}`);
      const num = make("b", "fd-game-score", "0");
      row.append(make("span", "fd-game-team", seatName(id)));
      if (mine && id === mine.id) row.append(make("span", "fd-badge you", "You"));
      row.append(num);
      board.append(row);
      return { id, path, final, row, num, shown: null };
    });
    const clock = make("span", "fd-game-clock");
    board.append(clock);
    const fields = make("div", "fd-game-fields");
    for (const side of sides) {
      const fig = make("figure", "fd-game-field");
      fig.append(make("figcaption", null, seatName(side.id)), teamField(side.id).el);
      fields.append(fig);
    }
    card.append(board, fields);
    // Other teams' games keep their lineups folded away (a shorter page), a tap from opening.
    if (!big && !card.classList.contains("mine")) {
      fields.hidden = true;
      const more = make("div", "fd-game-more");
      const btn = make("button", "text-btn", "Show lineups");
      btn.type = "button";
      btn.setAttribute("aria-expanded", "false");
      btn.addEventListener("click", () => {
        fields.hidden = !fields.hidden;
        btn.textContent = fields.hidden ? "Show lineups" : "Hide lineups";
        btn.setAttribute("aria-expanded", String(!fields.hidden));
      });
      more.append(btn);
      card.append(more);
    }
    const top = Math.max(g.hs, g.as);
    function update(progress) {
      const q = Math.min(4, Math.floor(progress * 4));
      const done = progress >= 1;
      for (const side of sides) {
        const score = done ? side.path[3] : q === 0 ? 0 : side.path[q - 1];
        if (score !== side.shown) {
          if (side.shown !== null && score > side.shown) {
            side.num.classList.remove("pop");
            void side.num.offsetWidth; // restart the animation
            side.num.classList.add("pop");
          }
          side.num.textContent = String(score);
          side.shown = score;
        }
        side.row.classList.toggle("won", done && side.final === top);
      }
      clock.textContent = done ? "Final" : `Q${q + 1}`;
      clock.classList.toggle("final", done);
    }
    return { el: card, update };
  }

  // The games on screen: rebuilt when the week (or the final) changes, otherwise just updated.
  let gameView = null;
  function showGames(key, list, progress, big = false) {
    const id = `${seasonKey}:${key}`;
    if (!gameView || gameView.id !== id) {
      AllField.hideCard(); // a card on last week's fields
      gameView = { id, cards: list.map(([g, k]) => gameCard(g, k, big)) };
      $("s-games").replaceChildren(...gameView.cards.map((c) => c.el));
    }
    for (const c of gameView.cards) c.update(progress);
  }

  // One "Fantasy Season Finished" per season (a replay counts again), from the host's page, once the
  // results show (the end of the broadcast, or Skip to results).
  const TRACKED_KEY = "fd-tracked-v1";
  const trackedNow = new Set();
  function trackSeason() {
    const mine = me();
    const key = `${league.code}:${league.replays || 0}`;
    if (!mine || !mine.host || trackedNow.has(key)) return;
    trackedNow.add(key);
    const done = readJSON(TRACKED_KEY, []);
    if (done.includes(key)) return;
    writeJSON(TRACKED_KEY, [...done, key].slice(-50));
    trackEvent("Fantasy Season Finished", { mode: league.set.mode, humans: humansIn(league) });
  }

  function renderSeason() {
    const s = league.season;
    if (!s) return;
    showView("fd-season");
    const t = serverNow() - s.start;
    const W = s.weeks.length;
    const key = `${league.code}:${league.replays || 0}`;
    if (key !== seasonKey) {
      seasonKey = key;
      skipped = false;
    }
    const live = !skipped && t < W * s.pace.week + s.pace.final;
    if ($("s-live").hidden === live) AllField.hideCard(); // the broadcast is over (or back, for a replay)
    $("s-live").hidden = !live;
    $("s-champ").hidden = live;
    $("s-actions").hidden = live;
    $("s-score-head").hidden = live;
    let table;
    if (live && t < 0) {
      setHtml($("s-title"), `Kickoff in <span class="v">${Math.ceil(-t / 1000)}</span>`);
      setBar(0, 0);
      $("s-sub").textContent = `The draft is done. ${W} weeks: everyone plays everyone twice, then the top two play for the title.`;
      showGames("w0", s.weeks[0].map((g, i) => [g, i]), 0);
      table = standingsUpTo(s.weeks, -1, false);
    } else if (live && t < W * s.pace.week) {
      const w = Math.floor(t / s.pace.week);
      const p = (t - w * s.pace.week) / s.pace.week;
      const progress = Math.min(1, p / 0.8);
      setHtml($("s-title"), `Week <span class="v">${w + 1}</span> of ${W}`);
      setBar(w, p);
      const playing = new Set(s.weeks[w].flatMap((g) => [g.h, g.a]));
      const bye = league.order.filter((id) => !playing.has(id));
      $("s-sub").textContent = bye.length ? `Bye: ${bye.map(seatName).join(", ")}` : "";
      showGames(`w${w}`, s.weeks[w].map((g, i) => [g, w * 8 + i]), progress);
      table = standingsUpTo(s.weeks, w, progress >= 1);
    } else if (live) {
      const p = (t - W * s.pace.week) / s.pace.final;
      const progress = Math.min(1, p / 0.85);
      setHtml($("s-title"), "Championship");
      setBar(W, p);
      $("s-sub").textContent = `${seatName(s.standings[0].id)} vs ${seatName(s.standings[1].id)}`;
      showGames("final", [[s.final, 999]], progress, true);
      table = s.standings; // the regular season's final order: the top two are the ones in the final
    } else {
      trackSeason();
      table = s.standings;
      const champ = s.champion;
      const row = s.standings.find((r) => r.id === champ);
      $("s-champ-name").textContent = seatName(champ);
      const fin = s.final;
      const [cs, os] = fin.h === champ ? [fin.hs, fin.as] : [fin.as, fin.hs];
      $("s-champ-sub").textContent = `${row.w}–${row.l} season · won the final ${cs}–${os} over ${seatName(fin.h === champ ? fin.a : fin.h)}`;
      $("s-champ").classList.toggle("me", Boolean(me() && champ === me().id));
      const seat = league.seats.find((x) => x.id === champ);
      champField.update({ team: league.teams[champ] || {}, scheme: { def: seat.def, off: seat.off }, kicker: league.set.kicker, style: leagueStyle(), shiny: shinySet() });
      $("s-rematch").hidden = !(me() && me().host);
      $("s-stats").hidden = !(me() && s.stats && s.stats[me().id]);
    }
    $("s-table-title").textContent = live ? "Standings" : "Final standings";
    const body = $("s-table");
    const sig = `${live}:${table.map((r) => `${r.id}${r.w}${r.l}${r.pf}`).join()}`;
    if (body.dataset.sig !== sig) {
      body.dataset.sig = sig;
      body.replaceChildren(...table.map((r, i) => {
        const tr = make("tr", me() && r.id === me().id ? "me" : "");
        const name = make("td", "fd-tn");
        const b = make("button", "fd-linkish", seatName(r.id));
        b.type = "button";
        b.addEventListener("click", () => openTeam(r.id));
        name.append(b);
        tr.append(make("td", null, String(i + 1)), name, make("td", null, `${r.w}–${r.l}`), make("td", null, String(r.pf)), make("td", null, String(r.pa)));
        if (!live) tr.append(make("td", "fd-score", String(s.scores[r.id].score)));
        return tr;
      }));
    }
  }
  // The season's progress: a segment for each week, then one for the final; the one being played fills up.
  function setBar(seg, p) {
    const bar = $("s-bar");
    const n = league.season.weeks.length + 1;
    if (bar.children.length !== n) bar.replaceChildren(...Array.from({ length: n }, () => make("i")));
    [...bar.children].forEach((el, i) => el.style.setProperty("--f", `${(i < seg ? 1 : i === seg ? Math.max(0, Math.min(1, p)) : 0) * 100}%`));
  }
  const champField = AllField.create({ card: cardOf(() => league && league.season && league.season.champion), label: "The champion's lineup" });
  $("s-champ-field").append(champField.el);
  $("s-stats").addEventListener("click", () => openTeam(me().id, "stats"));
  $("s-skip").addEventListener("click", () => {
    skipped = true;
    renderSeason();
  });
  $("s-rematch").addEventListener("click", async () => {
    if (confirm("Play the season again with the same teams? Everyone in the league will watch the new one.")) await act("rematch");
  });

  // ---------- Share card ----------
  $("s-share").addEventListener("click", async () => {
    const blob = await shareCard();
    const s = league.season;
    const text = `${seatName(s.champion)} won our Pokémon fantasy draft (${MODES[league.set.mode].name})! 🏆\nDraft your own: https://all22pokemon.com/draft`;
    const file = new File([blob], `fantasy-draft-${league.code}.jpg`, { type: "image/jpeg" });
    if (window.matchMedia("(pointer: coarse)").matches && navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file], text });
        return;
      } catch (err) {
        if (err && err.name === "AbortError") return;
      }
    }
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = file.name;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    try { await navigator.clipboard.writeText(text); toast("Card saved and post copied!"); } catch (_) { toast("Card saved!"); }
  });

  // The share card: the champion and their field, then the final standings (taller with more teams).
  async function shareCard() {
    await document.fonts.ready;
    const s = league.season;
    const fieldCanvas = await champField.ready();
    const FONT = '"Roboto Condensed", "Arial Narrow", Arial, sans-serif';
    const W = 1200;
    const FIELD = { x: 48, y: 456, w: 1104, h: Math.round((1104 * 1064) / 1536) };
    const ROW = 56;
    const tableY = FIELD.y + FIELD.h + 72;
    const H = tableY + 24 + s.standings.length * ROW + 112;
    const c = document.createElement("canvas");
    c.width = W;
    c.height = H;
    const g = c.getContext("2d");
    g.fillStyle = "#0b0b0e";
    g.fillRect(0, 0, W, H);
    for (const [x, rgb] of [[0, "74, 222, 128"], [W, "45, 212, 191"]]) {
      const glow = g.createRadialGradient(x, 0, 0, x, 0, 760);
      glow.addColorStop(0, `rgba(${rgb}, 0.16)`);
      glow.addColorStop(1, `rgba(${rgb}, 0)`);
      g.fillStyle = glow;
      g.fillRect(0, 0, W, 760); // the glow's whole radius, so it fades out with no edge
    }
    const text = (str, x, y, font, color, align = "left") => {
      g.font = font;
      g.fillStyle = color;
      g.textAlign = align;
      g.fillText(str, x, y);
    };
    const roundRect = (x, y, w, h, r) => {
      g.beginPath();
      g.moveTo(x + r, y);
      g.arcTo(x + w, y, x + w, y + h, r);
      g.arcTo(x + w, y + h, x, y + h, r);
      g.arcTo(x, y + h, x, y, r);
      g.arcTo(x, y, x + w, y, r);
      g.closePath();
    };
    const gold = g.createLinearGradient(64, 0, 820, 0);
    gold.addColorStop(0, "#fde047");
    gold.addColorStop(1, "#f59e0b");
    text("POKÉMON FANTASY DRAFT", 64, 96, `800 52px Inter, ${FONT}`, gold);
    text(`${MODES[league.set.mode].name.toUpperCase()} · ${league.order.length} TEAMS`, 64, 140, `700 24px Inter, ${FONT}`, "#71717a");
    // The champion: a gold banner with a trophy, then the team's name, big.
    const TROPHY = [new Path2D("M8 4h8v5a4 4 0 0 1-8 0z"), new Path2D("M8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4M12 13v4M8 20h8M10 17h4")];
    const trophy = (x, y, size, color, width) => {
      g.save();
      g.translate(x, y);
      g.scale(size / 24, size / 24);
      g.strokeStyle = color;
      g.lineWidth = width;
      g.lineCap = "round";
      g.lineJoin = "round";
      for (const p of TROPHY) g.stroke(p);
      g.restore();
    };
    const bY = 176;
    const bH = 108;
    g.font = `900 64px Inter, ${FONT}`;
    g.letterSpacing = "12px";
    const bW = 44 + 66 + 24 + g.measureText("CHAMPION").width + 32;
    const halo = g.createRadialGradient(48 + bW / 2, bY + bH / 2, 0, 48 + bW / 2, bY + bH / 2, bW * 0.8);
    halo.addColorStop(0, "rgba(245, 158, 11, 0.34)");
    halo.addColorStop(1, "rgba(245, 158, 11, 0)");
    g.fillStyle = halo;
    g.fillRect(0, 0, W, bY + bH / 2 + bW * 0.8); // all of the halo, so it has no hard edges
    const bannerGold = g.createLinearGradient(48, 0, 48 + bW, 0);
    bannerGold.addColorStop(0, "#fde047");
    bannerGold.addColorStop(1, "#f59e0b");
    g.save();
    g.shadowColor = "rgba(245, 158, 11, 0.55)";
    g.shadowBlur = 36;
    roundRect(48, bY, bW, bH, bH / 2);
    g.fillStyle = bannerGold;
    g.fill();
    g.restore();
    trophy(48 + 44, bY + (bH - 66) / 2, 66, "#1c1303", 2.4);
    g.fillStyle = "#1c1303";
    g.textAlign = "left";
    g.fillText("CHAMPION", 48 + 44 + 66 + 24, bY + bH / 2 + 23);
    g.letterSpacing = "0px";
    const champ = seatName(s.champion);
    let size = 104;
    g.font = `800 ${size}px ${FONT}`;
    while (g.measureText(champ).width > 1080 && size > 40) g.font = `800 ${(size -= 4)}px ${FONT}`;
    text(champ, 58, 392, g.font, "#ffffff");
    const fin = s.final;
    const [cs, os] = fin.h === s.champion ? [fin.hs, fin.as] : [fin.as, fin.hs];
    const row = s.standings.find((r) => r.id === s.champion);
    text(`${row.w}–${row.l} season · won the final ${cs}–${os}`, 64, 436, `600 28px Inter, ${FONT}`, "#d4d4d8");
    // The champion's lineup, as drawn on the page.
    g.save();
    roundRect(FIELD.x, FIELD.y, FIELD.w, FIELD.h, 18);
    g.clip();
    g.drawImage(fieldCanvas, FIELD.x, FIELD.y, FIELD.w, FIELD.h);
    g.restore();
    roundRect(FIELD.x + 1, FIELD.y + 1, FIELD.w - 2, FIELD.h - 2, 17);
    g.strokeStyle = "rgba(242, 194, 48, 0.55)";
    g.lineWidth = 2;
    g.stroke();
    text("FINAL STANDINGS", 64, tableY, `700 22px Inter, ${FONT}`, "#71717a");
    text("W–L", 900, tableY, `700 22px Inter, ${FONT}`, "#71717a", "right");
    text("SCORE", 1136, tableY, `700 22px Inter, ${FONT}`, "#71717a", "right");
    let y = tableY + 24;
    s.standings.forEach((r, i) => {
      y += ROW;
      const won = r.id === s.champion;
      g.fillStyle = won ? "rgba(242,194,48,0.16)" : i % 2 ? "rgba(255,255,255,0.03)" : "rgba(255,255,255,0.06)";
      g.fillRect(48, y - 40, 1104, ROW - 4);
      if (won) {
        g.fillStyle = "#f2c230";
        g.fillRect(48, y - 40, 6, ROW - 4);
      }
      text(String(i + 1), 84, y, `800 34px ${FONT}`, won ? "#f2c230" : "#a1a1aa", "center");
      let name = seatName(r.id);
      g.font = `700 32px Inter, ${FONT}`;
      while (g.measureText(name).width > 600 && name.length > 3) name = `${name.slice(0, -2)}…`;
      text(name, 130, y, g.font, won ? "#f2c230" : "#ffffff");
      if (won) trophy(130 + g.measureText(name).width + 16, y - 30, 34, "#f2c230", 2.4);
      text(`${r.w}–${r.l}`, 900, y, `800 34px ${FONT}`, "#ffffff", "right");
      text(String(s.scores[r.id].score), 1136, y, `800 34px ${FONT}`, "#d4d4d8", "right");
    });
    text("Draft your league:", 64, H - 52, `800 32px Inter, ${FONT}`, "#ffffff");
    text("all22pokemon.com/draft", 1136, H - 52, `700 32px Inter, ${FONT}`, "#4ade80", "right");
    return new Promise((resolve) => c.toBlob(resolve, "image/jpeg", 0.92));
  }

  // ---------- Chat ----------
  // Everyone in a league can talk (the server keeps the latest 100 lines with the league), and the
  // draft's picks show in the same timeline. Phones dock it at the bottom of the screen; wide
  // screens put it in the view's side column. Minimized, it shows the newest line and how many
  // lines from others came in since you last looked.
  const chatEl = $("fd-chat");
  const chatList = $("chat-list");
  const chatInput = $("chat-input");
  const CHAT_MIN_KEY = "fd-chat-min-v1";
  const CHAT_SLOTS = { "fd-lobby": "l-chat-slot", "fd-room": "r-chat-slot", "fd-season": "s-chat-slot" };
  let chatMin = readJSON(CHAT_MIN_KEY, false) === true; // wide screens: folded away (remembered)
  let chatSheet = false; // phones: opened as a sheet over the page (starts closed, as a bar)
  const chatClosed = () => (wideQuery.matches ? chatMin : !chatSheet);
  let chatKeys = []; // the lines on screen
  let chatSeen = { code: null, at: 0 }; // newest line from others that was on screen with the chat open
  let pendingId = 0;

  // The timeline: chat lines, every pick, and when the draft started and finished.
  function chatLines() {
    const lines = [];
    if (league.started && league.order) {
      lines.push({ key: "start", at: league.started, kind: "sys", text: `The draft is on! ${seatName(league.order[0])} picks first.` });
    }
    league.picks.forEach((p, i) => lines.push({ key: `p${i}${p.shiny ? "s" : ""}`, at: p.at || league.started || 0, kind: "pick", p, i }));
    if (league.status === "season" && league.picks.length) {
      lines.push({ key: "done", at: league.picks[league.picks.length - 1].at + 1, kind: "sys", text: "That's the draft! The season kicks off." });
    }
    (league.chat || []).filter((m) => m.sys || chatGate() === "ok").forEach((m, i) => lines.push(m.sys
      ? { key: `n${m.at}${m.t}`, at: m.at, kind: "sys", text: m.t, i }
      : { key: m.pending ? `q${m.pending}` : `m${m.at}${m.s}`, at: m.at, kind: "msg", m, i }));
    const order = { sys: 0, pick: 1, msg: 2 };
    lines.sort((a, b) => a.at - b.at || order[a.kind] - order[b.kind] || (a.i || 0) - (b.i || 0));
    return lines.slice(-200);
  }
  const speaker = (m) => (league.seats.find((x) => x.id === m.s) || { name: m.n || "?" }).name;
  function lineText(line) {
    if (line.kind === "msg") return `${speaker(line.m)}: ${line.m.t}`;
    if (line.kind === "pick") {
      const seat = league.seats.find((x) => x.id === line.p.s) || { name: "?", def: "34", off: "fb", cpu: true };
      return `#${line.i + 1} ${seat.name} took ${line.p.shiny ? "a shiny " : ""}${nameOf(line.p.p)} (${posOf(line.p.slot, seat)})${line.p.auto && !seat.cpu ? " (auto)" : ""}`;
    }
    return line.text;
  }
  function chatItem(line) {
    if (line.kind === "msg") {
      const mine = me();
      const li = make("li", `fd-msg${mine && line.m.s === mine.id ? " me" : ""}${line.m.pending ? " pending" : ""}`);
      li.append(make("b", null, speaker(line.m)), make("span", null, line.m.t));
      return li;
    }
    if (line.kind === "pick") {
      const li = make("li", `fd-chat-pick${line.p.shiny ? " shiny" : ""}`);
      const img = make("img");
      img.src = (line.p.shiny ? shinyIconUrl : iconUrl)(leagueStyle(), line.p.p);
      img.alt = "";
      img.loading = "lazy";
      li.append(img, make("span", null, lineText(line)));
      if (line.p.shiny) li.append(make("b", "fd-shiny-tag", "✦ Shiny"));
      return li;
    }
    return make("li", "fd-chat-sys", line.text);
  }

  // Phones: docked at the bottom of the screen. Wide screens: in the current view's side column.
  function placeChat() {
    const slot = wideQuery.matches ? $(CHAT_SLOTS[document.body.dataset.view]) : null;
    const home = slot || document.body;
    if (chatEl.parentElement !== home) {
      home.append(chatEl);
      chatKeys = []; // redraw (and scroll to the newest line) in the new spot
    }
  }

  // League chat is for players 13 and older: a signed-in account that passed the age question, or this
  // browser's answer to the same neutral question (age.js), asked once. Until it's answered the chat shows only
  // the picks, with the question in place of the message box; under 13, a short note instead.
  let chatAccountOk = false;
  const chatGate = () => (chatAccountOk ? "ok" : window.ALL22_AGE ? window.ALL22_AGE.chatAnswer() || "ask" : "no");
  function answerChatAge({ month, year }) {
    window.ALL22_AGE.rememberChat(window.ALL22_AGE.oldEnough(month, year));
    chatKeys = []; // redraw, now with the messages (or without the box)
    renderChat();
    if (chatGate() === "ok") chatInput.focus();
  }
  if (document.cookie.split(";").some((c) => c.trim() === "a22in=1")) {
    fetch("/api/app?a=me", { cache: "no-store" }).then((r) => r.json()).then((data) => {
      if (!data.user || !data.user.age) return;
      chatAccountOk = true;
      chatKeys = [];
      renderChat();
    }).catch(() => {});
  }

  function renderChat() {
    const open = Boolean(league) && Object.hasOwn(CHAT_SLOTS, document.body.dataset.view);
    if (!open) chatSheet = false;
    const closed = chatClosed();
    chatEl.hidden = !open;
    document.body.classList.toggle("fd-chat-on", open);
    document.body.classList.toggle("fd-chat-min", open && closed);
    document.body.classList.toggle("fd-chat-sheet", open && !closed && !wideQuery.matches);
    if (!open) return;
    placeChat();
    chatEl.classList.toggle("min", closed);
    $("chat-toggle").setAttribute("aria-expanded", String(!closed));
    const lines = chatLines();
    const keys = lines.map((l) => l.key);
    const grows = chatKeys.length > 0 && chatKeys.length <= keys.length && chatKeys.every((k, i) => k === keys[i]);
    if (!lines.length) {
      const gated = chatGate();
      chatList.replaceChildren(make("li", "fd-chat-empty", gated === "ask" ? "Answer below to chat with your league." : gated === "no" ? "Picks show here during the draft." : me() ? "Say hi to your league!" : "No messages yet."));
    } else if (!grows) {
      chatList.replaceChildren(...lines.map(chatItem));
    } else if (keys.length > chatKeys.length) {
      chatList.append(...lines.slice(chatKeys.length).map(chatItem));
    }
    if (!grows || (chatPinned && keys.length > chatKeys.length)) pinChat();
    chatKeys = keys;
    // Unread: lines from others newer than the last ones seen with the chat open.
    const mine = me();
    const gate = chatGate();
    $("chat-form").hidden = gate !== "ok";
    $("chat-age").hidden = gate !== "ask";
    $("chat-off").hidden = gate !== "no";
    if (gate === "ask" && !$("chat-age").firstChild) window.ALL22_AGE.build($("chat-age"), { onAnswer: answerChatAge });
    const fromOthers = gate !== "ok" ? [] : (league.chat || []).filter((m) => !m.pending && !m.sys && !(mine && m.s === mine.id));
    const newest = fromOthers.length ? fromOthers[fromOthers.length - 1].at : 0;
    if (chatSeen.code !== league.code) chatSeen = { code: league.code, at: newest };
    if (!closed) chatSeen.at = Math.max(chatSeen.at, newest);
    const unread = fromOthers.filter((m) => m.at > chatSeen.at).length;
    $("chat-badge").hidden = !unread;
    $("chat-badge").textContent = unread > 9 ? "9+" : String(unread);
    $("chat-peek").textContent = lines.length ? lineText(lines[lines.length - 1]) : "";
    chatInput.disabled = !mine;
    $("chat-send").disabled = !mine;
    chatInput.placeholder = mine ? "Message your league" : "Join the league to chat";
    sizeChat();
  }
  // Whether the list shows its newest line. Kept through layout changes (the list's box shrinks or
  // grows as the view around it fills in after a scroll), so new lines keep scrolling into view.
  let chatPinned = true;
  let chatAutoTop = -1; // where the page itself last scrolled the list to
  function pinChat() {
    chatList.scrollTop = chatList.scrollHeight;
    chatAutoTop = chatList.scrollTop;
    chatPinned = true;
  }
  chatList.addEventListener("scroll", () => {
    chatPinned = chatList.scrollTop === chatAutoTop || chatList.scrollHeight - chatList.scrollTop - chatList.clientHeight < 48;
  }, { passive: true });
  new ResizeObserver(() => {
    if (chatPinned) pinChat();
  }).observe(chatList);
  // The page leaves room at the bottom for the docked chat (phones).
  const sizeChat = () => document.documentElement.style.setProperty("--chat-h", `${chatEl.hidden ? 0 : chatEl.offsetHeight}px`);

  $("chat-toggle").addEventListener("click", () => {
    if (wideQuery.matches) {
      chatMin = !chatMin;
      writeJSON(CHAT_MIN_KEY, chatMin);
    } else {
      chatSheet = !chatSheet;
    }
    renderChat();
    if (!chatClosed()) pinChat();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && chatSheet && !wideQuery.matches) {
      chatSheet = false;
      renderChat();
    }
  });
  $("chat-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const text = chatInput.value.replace(/\s+/g, " ").trim().slice(0, 200);
    const mine = me();
    if (!text || !mine || !league) return;
    chatInput.value = "";
    // shown at once as the server will keep it (any filtered words masked)
    const line = { s: mine.id, n: mine.name, t: window.ALL22_WORDS ? window.ALL22_WORDS.maskWords(text) : text, at: serverNow(), pending: ++pendingId };
    const out = await optimistic(() => {
      league.chat = [...(league.chat || []), line];
    }, "say", { text });
    if (!out && !chatInput.value) chatInput.value = text; // not sent: give the words back
  });
  wideQuery.addEventListener("change", () => renderChat());
  new ResizeObserver(sizeChat).observe(chatEl);

  // Saves that came in from the account (saves.js): your leagues, and your last team name and formation.
  window.addEventListener("all22:saves", (e) => {
    const keys = e.detail.keys || [];
    if (keys.includes(SEATS_KEY)) {
      if (document.body.dataset.view === "fd-home") renderMine();
      else if (league) render();
    }
    if (keys.includes(TEAM_KEY)) {
      for (const box of document.querySelectorAll("[data-team-form]")) if (!box.contains(document.activeElement)) fillTeamForm(box, lastTeam());
    }
  });

  // ---------- Start ----------
  if (code) openLeague(code);
  else showHome();
})();
