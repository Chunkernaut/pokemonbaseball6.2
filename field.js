// An All-22 field drawn exactly like the builder's (same turf, yard lines, name tags, sprite sizing,
// facing and shadows, shinies with their sparkles), with a tap target over each spot. Used by the fantasy
// draft page. The builder (app.js) draws with its own copy of this code, so a change to the look goes in both.
const AllField = (() => {
  "use strict";

  const W = 1536;
  const FIELD_H = 1024;
  const TOP_PAD = 40;
  const H = FIELD_H + TOP_PAD;
  const SCALE = 1; // the builder draws at 2x for its image export; on screen 1x is plenty
  const SIZE_SCALE = 2; // ...but pixel sprites are sized for the builder's 2x, so they match it
  const FONT = '"Roboto Condensed", "Arial Narrow", Arial, sans-serif';
  const OFF_COLOR = "#f2c230";
  const DEF_COLOR = "#5bc0f8";
  const K_COLOR = "#c4b5fd";
  const LABEL_H = 42;
  const SPRITE_MASS = 0.76;
  const TOP_MARGIN = 6;
  const NAME_MAX_W = 124;

  const BASE_SLOTS = [
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
  const SCHEME_SPOTS = {
    43: {
      S1: { lx: 340 }, S2: { lx: 1196 },
      OLB1: { lx: 548 }, ILB1: { pos: "MLB", lx: 767, s: 120, look: null }, OLB2: { lx: 985 },
      DE1: { lx: 440 }, NT: { pos: "DT", lx: 657, s: 132, look: "R" },
      ILB2: { pos: "DT", lx: 877, ly: 416, s: 132 }, DE2: { lx: 1094 },
    },
    slot: { FB: { pos: "WR", lx: 268, ly: 748, s: 124, look: "R", sx: null, sb: null }, HB: { pos: "RB", ly: 966 } },
  };
  const KICKER = { id: "K", pos: "K", side: "K", lx: 1295, ly: 925, s: 112, look: "L" };

  // The spots of a formation (defense "34"/"43", offense "fb"/"slot"), plus the kicker if on.
  function slotsFor(scheme, kicker) {
    return (kicker ? [...BASE_SLOTS, KICKER] : BASE_SLOTS).map((base) => {
      const slot = { ...base, ...(SCHEME_SPOTS[scheme.def] || {})[base.id], ...(SCHEME_SPOTS[scheme.off] || {})[base.id] };
      slot.ly += TOP_PAD;
      slot.sb = slot.sb != null ? slot.sb + TOP_PAD : slot.ly - LABEL_H / 2 - 2;
      slot.sx = slot.sx ?? slot.lx;
      return slot;
    });
  }

  // ---------- Artwork, trimmed to its visible pixels (shared by every field on the page) ----------
  const art = new Map(); // "style:id" (":s" for a shiny) -> { status, canvas, tries }
  const redraws = new Set();
  function getArt(style, id, shiny = false) {
    const key = `${style}:${id}${shiny ? ":s" : ""}`;
    let entry = art.get(key);
    if (entry) return entry;
    let settle;
    entry = { status: "loading", canvas: null, tries: 0, done: new Promise((resolve) => (settle = resolve)) };
    art.set(key, entry);
    const load = () => {
      const img = new Image();
      img.onload = () => {
        entry.canvas = trimImage(img);
        entry.status = "ready";
        settle();
        for (const redraw of redraws) redraw();
      };
      img.onerror = () => {
        entry.tries += 1;
        if (entry.tries < 3) setTimeout(load, 800 * entry.tries);
        else {
          entry.status = "error";
          settle();
          for (const redraw of redraws) redraw();
        }
      };
      img.src = shiny ? shinyUrl(style, id) : spriteUrl(style, id);
    };
    load();
    return entry;
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
    t.opaque = opaque;
    return t;
  }

  // ---------- The turf (drawn once) ----------
  const leftSide = (y) => 152 - (140 * y) / FIELD_H;
  const rightSide = (y) => 1384 + (140 * y) / FIELD_H;
  const widthScale = (y) => (rightSide(y) - leftSide(y)) / (rightSide(455) - leftSide(455));
  const YARD_LINES = [-92, 28, 148, 290, 455, 665, 880, 1100];
  function mulberry32(a) {
    return () => {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  let turf = null;
  function buildTurf() {
    const c = document.createElement("canvas");
    c.width = W * SCALE;
    c.height = H * SCALE;
    const g = c.getContext("2d");
    g.scale(SCALE, SCALE);
    g.translate(0, TOP_PAD);
    const top = -TOP_PAD;
    const base = g.createLinearGradient(0, top, 0, FIELD_H);
    base.addColorStop(0, "#438530");
    base.addColorStop(0.5, "#478b31");
    base.addColorStop(1, "#3c7a2a");
    g.fillStyle = base;
    g.fillRect(0, top, W, H);
    for (let i = 0; i < YARD_LINES.length - 1; i++) {
      const y0 = YARD_LINES[i];
      const y1 = YARD_LINES[i + 1];
      const mid = (y0 + y1) / 2;
      g.fillStyle = i % 2 ? "rgba(255,255,255,0.025)" : "rgba(0,0,0,0.035)";
      g.fillRect(0, y0, W, mid - y0);
      g.fillStyle = i % 2 ? "rgba(0,0,0,0.035)" : "rgba(255,255,255,0.025)";
      g.fillRect(0, mid, W, y1 - mid);
    }
    const rand = mulberry32(22);
    for (let i = 0; i < 26000; i++) {
      const x = rand() * W;
      const y = top + rand() * H;
      const light = rand() > 0.5;
      g.fillStyle = light ? `rgba(140,200,90,${0.05 + rand() * 0.08})` : `rgba(10,40,5,${0.05 + rand() * 0.1})`;
      g.fillRect(x, y, 1 + rand() * 1.5, 2 + rand() * 3);
    }
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
    const ya = top - 10;
    const yb = FIELD_H + 10;
    line(leftSide(ya), ya, leftSide(yb), yb, 6);
    line(rightSide(ya), ya, rightSide(yb), yb, 6);
    line(leftSide(ya) - 140, ya, leftSide(yb) - 140, yb, 4);
    line(rightSide(ya) + 140, ya, rightSide(yb) + 140, yb, 4);
    for (const y of YARD_LINES) line(leftSide(y), y, rightSide(y), y, 3.5 + widthScale(y) * 1.2);
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

  // ---------- Player card: hover a player (or press and hold one on a touchscreen) ----------
  // The builder's card (app.js), for every field on the page: one card, shown for one spot at a time.
  // What it says comes from the field's card(slot, id) (fantasy.js: types, base stats, size and, once
  // the season is over, the player's season); never how well they fit the spot.
  const playerCard = document.createElement("div");
  playerCard.className = "player-card";
  playerCard.id = "player-card";
  playerCard.setAttribute("role", "tooltip");
  playerCard.hidden = true;
  let cardFor = null; // the hotspot it's showing
  let cardTimer = 0;
  let cardHeld = false; // shown by a press and hold (or a tap on a field you can't change): up until the next touch
  let holdClick = null; // that hotspot, whose click (the press's release) is skipped
  function showCard(el, html) {
    clearTimeout(cardTimer);
    if (!html) return hideCard();
    // Inside a pop-up the card goes in the pop-up too, or it would sit under it.
    const host = el.closest("dialog[open]") || document.body;
    if (playerCard.parentNode !== host) host.appendChild(playerCard);
    playerCard.innerHTML = html;
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
  const hotspotAt = (target) => (target instanceof Element ? target.closest(".af-hotspots .hotspot") : null);
  document.addEventListener("pointerdown", (e) => {
    if (cardHeld && !hotspotAt(e.target)) hideCard();
  }, true);
  // Scrolling moves the player out from under it (only what holds the field: the chat scrolls as picks come in).
  addEventListener("scroll", (e) => {
    if (cardFor && (e.target === document || (e.target instanceof Element && e.target.contains(cardFor)))) hideCard();
  }, true);
  addEventListener("resize", () => cardFor && hideCard());

  // ---------- A field ----------
  // create({ onTap(slotId), onMove(from, to), card(slot, id), label }) -> { el, update({ team, scheme, kicker, style, open, selected, shiny }), ready(), rectOf(slotId) }
  // onTap: a spot was tapped; onMove: a player was dragged onto another spot; card: a player's card
  // (HTML, or nothing for none); open: a Set of spots to light up; selected: a spot to outline; shiny: a Set of the
  // Pokémon drawn shiny (with sparkles on screen, and stars on an image made with ready()). A field
  // with only a card has nothing to tap: a tap shows the card too, and swipes over it scroll the page.
  function create({ onTap = null, onMove = null, card = null, label = "Lineup" } = {}) {
    const wrap = document.createElement("div");
    wrap.className = "af-field";
    const canvas = document.createElement("canvas");
    canvas.width = W * SCALE;
    canvas.height = H * SCALE;
    canvas.setAttribute("role", "img");
    canvas.setAttribute("aria-label", label);
    const hot = document.createElement("div");
    hot.className = onMove ? "af-hotspots drags" : onTap ? "af-hotspots" : "af-hotspots looks";
    // shinies' sparkles (broadcast.css .shy-sparks), under the tap targets
    const sparks = document.createElement("div");
    sparks.className = "shy-sparks";
    sparks.setAttribute("aria-hidden", "true");
    wrap.append(canvas, sparks, hot);
    const ctx = canvas.getContext("2d");
    let state = { team: {}, scheme: { def: "34", off: "fb" }, kicker: false, style: "pixel", open: null, selected: null, shiny: null };
    const isShiny = (id) => Boolean(id && state.shiny && state.shiny.has(id));
    let marks = false; // stars on the shinies (an image made with ready())
    let slots = slotsFor(state.scheme, false);
    let layoutKey = "";
    const spots = new Map();

    function roundRect(x, y, w, h, r) {
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.arcTo(x + w, y, x + w, y + h, r);
      ctx.arcTo(x + w, y + h, x, y + h, r);
      ctx.arcTo(x, y + h, x, y, r);
      ctx.arcTo(x, y, x + w, y, r);
      ctx.closePath();
    }
    function spriteRect(slot, img, pixelated, id) {
      const s = slot.s;
      const mass = Math.sqrt(img.opaque || img.width * img.height * 0.55);
      let fit = ((s * SPRITE_MASS) / mass) * sizeFactor(id);
      const maxH = slot.sb - TOP_MARGIN;
      fit = Math.min(fit, (s * 1.2) / img.height, (s * 1.2) / img.width, maxH / img.height);
      if (pixelated) {
        let k = Math.max(1, Math.round(fit * SIZE_SCALE));
        if (k > 1 && k > fit * SIZE_SCALE * 1.06) k -= 1;
        while (k > 1 && img.height * k > maxH * SIZE_SCALE) k -= 1;
        const wd = img.width * k;
        const hd = img.height * k;
        const xd = Math.round(slot.sx * SIZE_SCALE - wd / 2);
        const yd = Math.round(slot.sb * SIZE_SCALE) - hd;
        return { x: xd / SIZE_SCALE, y: yd / SIZE_SCALE, w: wd / SIZE_SCALE, h: hd / SIZE_SCALE };
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
    function readySprite(slot) {
      const id = state.team[slot.id];
      if (!id) return null;
      const entry = getArt(state.style, id, isShiny(id));
      if (entry.status !== "ready") return null;
      const pixelated = SPRITE_STYLES[state.style].pixelated;
      return { id, entry, pixelated, r: spriteRect(slot, entry.canvas, pixelated, id) };
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
    function drawSprite(slot) {
      const id = state.team[slot.id];
      if (!id) return drawEmpty(slot);
      const sp = readySprite(slot);
      if (!sp) return drawPlaceholder(slot, getArt(state.style, id, isShiny(id)).status === "error");
      const { entry, pixelated, r } = sp;
      const facing = spriteFacing(state.style, id);
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
      if (marks && isShiny(id)) drawShinyMark(r);
    }
    // A shiny on an image: two small stars at its shoulder (as the builder's saved image has them).
    function drawShinyMark(r) {
      const R = Math.max(8, Math.min(14, r.w * 0.12));
      const x = Math.min(r.x + r.w * 0.94, W - R - 2);
      const y = Math.max(r.y + R * 0.4, R + 2);
      ctx.save();
      ctx.shadowColor = "rgba(0,0,0,0.6)";
      ctx.shadowBlur = 4;
      for (const [cx, cy, size, color] of [[x, y, R, "#ffd34d"], [x - R * 1.15, y + R * 1.05, R * 0.55, "#fff7d0"]]) {
        const k = size * 0.3;
        ctx.beginPath();
        ctx.moveTo(cx, cy - size);
        ctx.lineTo(cx + k, cy - k);
        ctx.lineTo(cx + size, cy);
        ctx.lineTo(cx + k, cy + k);
        ctx.lineTo(cx, cy + size);
        ctx.lineTo(cx - k, cy + k);
        ctx.lineTo(cx - size, cy);
        ctx.lineTo(cx - k, cy - k);
        ctx.closePath();
        ctx.fillStyle = color;
        ctx.fill();
      }
      ctx.restore();
    }
    // Three small stars twinkling around each shiny (as on the builder's field), placed in fractions of the field.
    const SPARK_SPOTS = [[0.93, 0.1, 22, 0], [0.05, 0.42, 15, 0.9], [0.86, 0.8, 13, 1.7]];
    let sparksSig = "";
    function updateSparks() {
      const boxes = [];
      for (const slot of slots) {
        const id = state.team[slot.id];
        if (!isShiny(id)) continue;
        const sp = readySprite(slot);
        if (sp) boxes.push(sp.r);
      }
      const sig = boxes.map((r) => [r.x, r.y, r.w, r.h].map(Math.round).join()).join(";");
      if (sig === sparksSig) return;
      sparksSig = sig;
      sparks.replaceChildren(...boxes.flatMap((r, n) => SPARK_SPOTS.map(([fx, fy, size, delay]) => {
        const el = document.createElement("i");
        el.style.left = `${((r.x + r.w * fx) / W) * 100}%`;
        el.style.top = `${((r.y + r.h * fy) / H) * 100}%`;
        el.style.width = `${(size / W) * 100}%`;
        el.style.animationDelay = `${delay + n * 0.43}s`;
        return el;
      })));
    }
    const labelName = (slot) => (state.team[slot.id] ? nameOf(state.team[slot.id]).toUpperCase() : "EMPTY");
    function setNameFont(name) {
      ctx.font = `700 17px ${FONT}`;
      const w = ctx.measureText(name).width;
      if (w <= NAME_MAX_W) return w;
      ctx.font = `700 ${Math.max(12, Math.floor((17 * NAME_MAX_W) / w))}px ${FONT}`;
      return Math.min(w, NAME_MAX_W);
    }
    function drawLabelBox(slot) {
      const w = Math.max(112, setNameFont(labelName(slot)) + 30);
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
      const id = state.team[slot.id];
      const name = labelName(slot);
      ctx.save();
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
    function render() {
      if (!turf) turf = buildTurf();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.drawImage(turf, 0, 0);
      ctx.setTransform(SCALE, 0, 0, SCALE, 0, 0);
      const order = [...slots].sort((a, b) => a.sb - b.sb);
      for (const slot of order) {
        const sp = readySprite(slot);
        if (sp) drawShadow(slot.sx, slot.sb - 2, Math.max(sp.r.w * 0.5, 30));
      }
      for (const slot of order) drawLabelBox(slot);
      for (const slot of order) drawSprite(slot);
      for (const slot of order) drawLabelText(slot);
      updateSparks();
    }
    // Redraw on the next frame. Background tabs get no frames, so a timer covers those and the
    // field is already up to date when you come back.
    let queued = false;
    function schedule() {
      if (queued) return;
      queued = true;
      const run = () => {
        if (!queued) return;
        queued = false;
        render();
      };
      requestAnimationFrame(run);
      setTimeout(run, 250);
    }
    redraws.add(schedule);

    // Tap targets: the same generous boxes as the builder (sprite plus tag).
    function bounds(slot) {
      const labelW = 128;
      const top = slot.sb - slot.s;
      const left = Math.min(slot.sx - slot.s * 0.55, slot.lx - labelW / 2);
      const right = Math.max(slot.sx + slot.s * 0.55, slot.lx + labelW / 2);
      const bottom = slot.ly + LABEL_H / 2;
      return { left, top, width: right - left, height: bottom - top, tagLeft: slot.lx - labelW / 2, tagWidth: labelW };
    }
    function buildSpots() {
      if (cardFor && hot.contains(cardFor)) hideCard();
      hot.replaceChildren();
      spots.clear();
      if (!onTap && !onMove && !card) return;
      for (const slot of slots) {
        const b = bounds(slot);
        const el = document.createElement("button");
        el.type = "button";
        el.className = "hotspot";
        el.dataset.slot = slot.id;
        Object.assign(el.style, {
          left: `${(b.left / W) * 100}%`,
          top: `${(b.top / H) * 100}%`,
          width: `${(b.width / W) * 100}%`,
          height: `${(b.height / H) * 100}%`,
        });
        // Its name tag takes taps over any other spot reaching across it (the fullback's spot covers the
        // bottom of the QB's tag): fantasy.css puts this box, in fractions of the spot's, above every spot.
        el.style.setProperty("--tag-l", (b.tagLeft - b.left) / b.width);
        el.style.setProperty("--tag-w", b.tagWidth / b.width);
        el.style.setProperty("--tag-h", LABEL_H / b.height);
        el.addEventListener("pointerdown", onPointerDown);
        el.addEventListener("click", () => {
          // Swallow only the click that ends a drag on this same spot.
          const swallow = dragClick && dragClick.slot === slot.id && performance.now() < dragClick.until;
          dragClick = null;
          if (!swallow && onTap) onTap(slot.id);
          else if (!onTap && !onMove && card) {
            openCard(el);
            cardHeld = cardFor === el && !el.matches(":focus-visible"); // a tap's card stays up; a key's goes with the focus
          }
        });
        hot.append(el);
        spots.set(slot.id, el);
      }
    }

    // Dragging a player onto another spot moves them there (swapping with whoever is in it).
    let drag = null;
    let dragClick = null; // { slot, until } for the click a mouse drag fires on its source spot
    function onPointerDown(e) {
      if (!onMove || e.button !== 0 || drag) return; // ignore a second finger while dragging
      const el = e.currentTarget;
      if (!state.team[el.dataset.slot]) return;
      dragClick = null;
      drag = { pointerId: e.pointerId, from: el.dataset.slot, el, startX: e.clientX, startY: e.clientY, active: false, ghost: null, over: null };
      el.setPointerCapture(e.pointerId);
      el.addEventListener("pointermove", onPointerMove);
      el.addEventListener("pointerup", onPointerUp);
      el.addEventListener("pointercancel", onPointerCancel);
    }
    function onPointerMove(e) {
      if (!drag || e.pointerId !== drag.pointerId) return;
      const dist = Math.hypot(e.clientX - drag.startX, e.clientY - drag.startY);
      const id = state.team[drag.from];
      if (!drag.active && dist > 8 && id) {
        drag.active = true;
        drag.el.classList.add("dragging");
        const ghost = document.createElement("img");
        ghost.className = "ghost";
        ghost.alt = "";
        ghost.src = (isShiny(id) ? shinyUrl : spriteUrl)(state.style, id);
        ghost.classList.toggle("pixelated", SPRITE_STYLES[state.style].pixelated);
        document.body.appendChild(ghost);
        drag.ghost = ghost;
      }
      if (!drag.active) return;
      drag.ghost.style.left = `${e.clientX}px`;
      drag.ghost.style.top = `${e.clientY}px`;
      const target = slotAtPoint(e.clientX, e.clientY);
      if (target !== drag.over) {
        if (drag.over) spots.get(drag.over).classList.remove("drop-target");
        drag.over = target && target !== drag.from ? target : null;
        if (drag.over) spots.get(drag.over).classList.add("drop-target");
      }
    }
    function slotAtPoint(x, y) {
      const hit = document.elementsFromPoint(x, y).find((el) => el.classList && el.classList.contains("hotspot") && hot.contains(el));
      return hit ? hit.dataset.slot : null;
    }
    function endDrag() {
      if (!drag) return;
      drag.el.removeEventListener("pointermove", onPointerMove);
      drag.el.removeEventListener("pointerup", onPointerUp);
      drag.el.removeEventListener("pointercancel", onPointerCancel);
      drag.el.classList.remove("dragging");
      if (drag.ghost) drag.ghost.remove();
      if (drag.over && spots.get(drag.over)) spots.get(drag.over).classList.remove("drop-target");
      drag = null;
    }
    function onPointerUp(e) {
      if (!drag || e.pointerId !== drag.pointerId) return;
      const { from, over, active } = drag;
      endDrag();
      if (!active) return; // a plain tap: the click handler has it
      dragClick = { slot: from, until: performance.now() + 400 };
      if (over) onMove(from, over);
    }
    function onPointerCancel(e) {
      if (!drag || e.pointerId !== drag.pointerId) return;
      endDrag();
    }

    // The player card, as on the builder's field.
    function openCard(el) {
      const slot = slots.find((s) => s.id === el.dataset.slot);
      const id = slot && state.team[slot.id];
      showCard(el, id && card && !(drag && drag.active) ? card(slot, id) : null);
    }
    if (card) {
      // Mouse: a moment's pause before the first card (so crossing the field doesn't flash one), then it
      // follows the pointer from player to player.
      hot.addEventListener("pointerover", (e) => {
        if (e.pointerType !== "mouse" || drag) return;
        const el = hotspotAt(e.target);
        if (!el || el === cardFor) return;
        clearTimeout(cardTimer);
        if (cardFor) openCard(el);
        else cardTimer = setTimeout(() => openCard(el), 120);
      });
      hot.addEventListener("pointerout", (e) => {
        if (e.pointerType === "mouse" && !hotspotAt(e.relatedTarget)) hideCard();
      });
      // Keyboard: the focused player's card.
      hot.addEventListener("focusin", (e) => {
        const el = hotspotAt(e.target);
        if (el && el.matches(":focus-visible")) openCard(el);
      });
      hot.addEventListener("focusout", () => {
        if (!cardHeld) hideCard();
      });
      // Touch: press and hold a player (without moving) for their card. Letting go leaves it up and
      // skips the tap's usual job (choosing a player to move, or a spot for a pick); the next touch puts
      // it away. Moving first is a drag (or a scroll) instead.
      let hold = null;
      hot.addEventListener("pointerdown", (e) => {
        hideCard();
        holdClick = null;
        const el = hotspotAt(e.target);
        if (e.pointerType === "mouse" || !el || !state.team[el.dataset.slot]) return;
        hold = { pointerId: e.pointerId, x: e.clientX, y: e.clientY };
        cardTimer = setTimeout(() => {
          hold = null;
          openCard(el);
          if (cardFor !== el) return;
          cardHeld = true;
          holdClick = el;
        }, 450);
      });
      hot.addEventListener("pointermove", (e) => {
        if (hold && e.pointerId === hold.pointerId && Math.hypot(e.clientX - hold.x, e.clientY - hold.y) > 8) {
          hold = null;
          clearTimeout(cardTimer);
        }
        if (cardHeld && drag && drag.active) hideCard(); // held, then dragged: a move after all
      });
      for (const type of ["pointerup", "pointercancel"]) {
        hot.addEventListener(type, () => {
          hold = null;
          if (!cardHeld) clearTimeout(cardTimer);
        });
      }
      hot.addEventListener("click", (e) => {
        if (holdClick && hotspotAt(e.target) === holdClick) e.stopPropagation();
        holdClick = null;
      }, true);
      // A long press can bring up a context menu instead.
      hot.addEventListener("contextmenu", (e) => {
        if (hotspotAt(e.target)) e.preventDefault();
      });
    }

    let drawn = "";
    function update(next) {
      state = { ...state, ...next };
      slots = slotsFor(state.scheme, state.kicker);
      const key = `${state.scheme.def}${state.scheme.off}${state.kicker ? "k" : ""}`;
      if (key !== layoutKey) {
        if (drag) endDrag();
        layoutKey = key;
        buildSpots();
      }
      for (const slot of slots) {
        const el = spots.get(slot.id);
        if (!el) continue;
        const id = state.team[slot.id];
        el.classList.toggle("filled", Boolean(id));
        el.classList.toggle("open-slot", Boolean(state.open && state.open.has(slot.id)));
        el.classList.toggle("picked", state.selected === slot.id);
        el.setAttribute("aria-label", `${slot.pos}: ${id ? nameOf(id) : "open"}`);
      }
      // Only redraw when something on the field changed (the page re-renders on every poll).
      const sig = JSON.stringify([slots.map((s) => state.team[s.id] || 0), key, state.style, slots.map((s) => (isShiny(state.team[s.id]) ? 1 : 0))]);
      if (sig === drawn) return;
      drawn = sig;
      if (cardFor && hot.contains(cardFor)) hideCard(); // the player it showed may have moved
      schedule();
    }
    // The drawn field once every sprite on it has loaded (or given up), e.g. for a share image (with stars on its
    // shinies: the next frame draws the field without them again).
    async function ready() {
      await Promise.all(slots.filter((slot) => state.team[slot.id]).map((slot) => getArt(state.style, state.team[slot.id], isShiny(state.team[slot.id])).done));
      marks = true;
      render();
      marks = false;
      schedule();
      return canvas;
    }
    // Where a spot's player stands on screen (its sprite's box, or the spot's), or null when the field isn't showing.
    function rectOf(slotId) {
      const slot = slots.find((s) => s.id === slotId);
      const box = canvas.getBoundingClientRect();
      if (!slot || !box.width || !box.height) return null;
      const k = box.width / W;
      const sp = readySprite(slot);
      const r = sp ? sp.r : { x: slot.sx - slot.s * 0.4, y: slot.sb - slot.s * 0.8, w: slot.s * 0.8, h: slot.s * 0.8 };
      return { left: box.left + r.x * k, top: box.top + r.y * k, width: r.w * k, height: r.h * k, right: box.left + (r.x + r.w) * k, bottom: box.top + (r.y + r.h) * k };
    }
    return { el: wrap, update, ready, rectOf }; // blank until the first update
  }

  return { create, slotsFor, hideCard };
})();
