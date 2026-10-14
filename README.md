# Pokémon Baseball v6.2 — Batting Order Usability and Scouting Guide

This update is built directly on **v6.1**, with the same **15-player roster**, **90-second fantasy lineup stage**, **162-game seasons**, fatigue and bench substitutions, hidden individual position-fit calculations, awards, seven special events, and existing `pokebase-main/` directory structure. No API or database migration is required.

## What changed

- **Beginner-friendly batting order editor** (appears *only* during the lineup stage): a short explanation of what early, middle, and late batting spots mean; three quick tips; a **Bat #** dropdown that moves any hitter directly to positions 1–9; existing Up/Down buttons; and **Shuffle batting order**. The order still starts randomized and the DH still bats, not the pitcher. Saves and validates through the existing fantasy server, or locally in the Solo Challenge. A convenient **Edit batting order** button is next to the ballpark heading once drafting finishes.
- **Scouting guide on every page**: a single collapsible **Scouting guide** control below the content area. Open/closed state stays as chosen when changing between home, lobby, draft, lineup, results, and solo; it's saved in browser localStorage across refreshes. It does *not* silently close during server updates or page changes.
- **No precise scoring percentages in the guide**: the old numeric position-weight table has been replaced with **key strengths**, **supporting strengths**, qualitative **team importance**, and up to three small type hints per position. The guide explains all original stats, the role of height/weight and HP, fatigue, one-game rest, substitutions, bench composition, hidden ratings, and the effect of batting order. It deliberately does not reveal the game's exact weights or bonuses.
- The actual rating calculations in `engine.js`, statistics, roster size, stamina costs, draft rules, and season behavior remain unchanged.

## Run & test

Run `npm start` from this `pokebase-main` directory to launch the Node server locally and `npm test` to run the complete suite (including `v62-test.js`). Copy the contents of `pokebase-main/` into the root of your existing GitHub repository, preserving the `public/` folder, to redeploy through your current host. Browser history and leagues still use your existing storage behavior; the guide expansion state is per browser.

---

# Pokémon Baseball v6.1 — Roster hover scouting, DH and lineup guidance

This is an incremental update to **v6.0**, retaining the full original `pokebase-main/` directory layout, the 15-Pokémon roster, the server endpoints and the 90-second lineup stage.

- **Hover over a drafted Pokémon** on your field, bench, or saved roster (or focus it with a keyboard when supported) to see a compact popup with its six original stats, type(s), height and weight. Available Pokémon in the draft pool are intentionally *not* hover-scouted; select them deliberately as before. Hidden position fits and old synthesized baseball attributes remain concealed.
- **DH is retained as a starting batting position.** When a fantasy or new solo draft completes, the game places the strongest hitter (internal power/contact profile) at DH, exchanging positions with its previous occupant if necessary. This is only a starting recommendation: players remain free to change it during lineup management.
- **Pitcher fatigue baseline changed from 41 to 45**, before the existing HP adjustment. Other positions stay C 19, fielders 16, DH 11; five or more plate appearances still add one energy to a batter's fatigue cost.
- **Lineup-stage instructions** appear prominently in both game modes, explaining how to swap players, arrange a nine-Pokémon batting order and start the season. Fantasy ready confirmations and the 90-second deadline are unchanged.
- **Season statistics** now use a compact, closed-by-default expandable dropdown in both solo and fantasy results. Full batting/pitching tables, awards and season summary are intact.

## Play and test

```bash
npm start
npm test
```

For Render, keep the repository folder layout and existing `npm start` command. Start a new league to see the initial automatic DH suggestion; older saved leagues are not retroactively rearranged. Roster scouting is for locally rendered Pokémon and requires no network service beyond the existing sprite images. Browser rendering should still be tested at your own desktop/mobile resolution.

---

# Pokémon Baseball v6.0 — Batting Orders, Early-Ready Lineups & Season Honors

**This ZIP keeps the original `pokebase-main/` folder structure and the same 15-Pokémon roster (10 starters, 5 flexible bench).** It can replace the existing Node/Render project. The earlier release notes below are history; the v6 rules take precedence whenever they differ.

## New in 6.0

- **90-second post-draft lineup stage**, enforced by `server.js`. Humans can adjust their roster, edit their batting order, and click **I'm ready**. If every human participant is ready, the season starts immediately. CPU seats are automatically considered ready. A ready player can click **I'm not ready** to keep editing while others are still preparing. The timer still starts the season if not all players confirm.
- **Nine-batter order editor**, displayed only during the lineup stage (after 15 draft picks, before season start). Each of the team's existing nine non-pitcher starters is copied into a reproducibly shuffled initial order. Move the copied Pokémon up or down. Fantasy batting orders are saved and validated on the server; solo batting orders are saved in browser localStorage. When a fatigued starter rests, the replacement inherits the original batting position. If a player swaps a bench Pokémon into a starting spot, the batting order is reconciled automatically.
- Batting order genuinely changes plate-appearance opportunities and RBI/run production because the simulator cycles through the saved order. A particularly busy batter (five or more plate appearances in a game) consumes **one extra energy point**. Other fatigue baselines were eased slightly: P **41**, C **19**, fielders **16**, DH **11** (previously 43/20/17/12), still scaled by HP.
- **Multi-round playoffs** for leagues of 4–6 teams: wild card where needed, best-of-five semifinals, then the same best-of-seven World Series. Three-team leagues go directly to a best-of-seven World Series. The final results display a browsable bracket and individual series games.
- **Personal records** stored only in the current browser: highest score, most wins, longest winning streak, completed seasons, plus achievement milestones. Browser storage is not an online account.
- **Season honors** generated from recorded season totals: Most Valuable Pokémon, Cy Young, Gold Glove, Silver Slugger, and Rookie of the Year. Gold Glove uses fielding fit, playing time, and recorded individual defensive errors; this is still a simplified fielding metric. For this fan-game, Rookie eligibility is **base-stat total 400 or less**, not official Pokémon evolution stage. Awards appear beside the final results, including Pokémon sprites and short explanations.
- **More readable statistics**: OPS, doubles, triples, fielding errors, caught stealing, stolen-base percentage, pitching wins/losses, quality starts, complete games, games rested, on-screen leaders (home runs, OPS, strikeouts, games played), plain-language stat definitions, and a short season narrative. The 162-game results, fatigue substitutions, World Series, PNG export and existing special events are preserved.
- No database or accounts were added. Render's temporary disk may still lose past leagues on restart. Older saved leagues can lack a batting order; the engine retains its prior automatic order as a fallback.

## Run and test

```bash
npm start
npm test
```

Server defaults to port 3000 (or `PORT` from the host). For Render keep `npm start` as the start command. **Create a new fantasy league to use the 90-second ready phase**; a draft already underway before deployment may still contain older state. Browser tests may be necessary for your exact display resolution; the automated engine and server tests do not establish full visual compatibility.

---

# Pokémon Baseball v5.6 — World Series Broadcast & Share Cards

This is the same `pokebase-main/` project structure as v5. **No migration is required for v5 rosters.** Unfinished leagues and browser-saved solo rosters still use 15 Pokémon (10 starting positions + five flexible bench slots). Standard limitations of locally saved Render league data still apply.

### What changed in v5.6

- Color palette: true charcoal/grayscale menus and panels, cream-white text, deep maroon primary actions, aged-gold secondary actions. The baseball diamond retains natural green grass.
- League lineups unlock for exactly **60 seconds** after the draft, then the 162-game season starts automatically.
- Drag-and-drop now uses **only the Pokémon sprite** as the drag preview, not the entire bench/position card. Solo 151 and 162–0 fields and dugout support both drag swaps and click-two-spots swaps **before** starting a season.
- **162–0 only**: after drafting three Legendary Pokémon, further eligible Legendary selection cards are grayed out and disabled while other Pokémon in the rolled group remain selectable. 151 has no Legendary cap.
- Simulation speed: Fast now uses a ~0.2-second baseline between regular games (Solo still runs at half Fantasy's delay). Special-event pauses still provide time to notice meaningful moments.
- Skipping the fantasy regular-season playback **does not bypass the World Series**: its games appear in a distinct gold-framed championship presentation, one game at a time, before final results.
- Completed Solo and Fantasy rosters now have **Save Image** controls to export a PNG card containing a baseball diamond, all 15 Pokémon, bench, team record, and (for fantasy) the rest of the league's final standings. Cards use existing Pokémon sprites and local canvas drawing, not generated art. Internet access and browser CORS access to existing sprite URLs are needed to include sprite images; the name/position labels still render when images cannot load.
- Tests include the 60-second deadline and v5.6 structure checks. Existing saved league state may still expire on free ephemeral hosts; no database backend was added.

### Changes in 5.6

- **Solo playback now appears above the baseball diamond as soon as Start the season is pressed**, and the page scrolls to it. Before starting the season, any two roster slots can be tapped to swap Pokémon (including bench-to-starter swaps).
- **Solo playback uses half the per-game delay of fantasy playback.** Normal = approximately 0.5 seconds in solo vs. 1.0 second in fantasy; extra pause durations are also halved for solo.
- **Compact fantasy lobby invite:** code/invite control is smaller and aligned far right.
- **Dominant Game replaces the former shutout event:** only a winning team scoring 5 or more against zero triggers the special announcement. Only that game's victorious team name glows bold red. An updated late-game, scoreless-side rally mechanic makes shutouts less frequent. This is a calibrated arcade mechanic, not an MLB statistic.
- **Event Pokémon sprites:** whenever a special event has a real positive Pokémon species ID, its sprite is presented immediately after the current game score alongside the event label, and disappears as soon as the next game displays. The solo computer opponent uses synthetic anonymous player IDs, so opposing anonymous events have labels without a fictitious Pokémon sprite.
- **Watch it again:** after the initial season finishes or the user skips to final results, a `Rewatch simulation` button appears next to `Skip to final results`. Replays restart the stored results from Game 1 and do not recalculate or alter the season. Both fantasy and solo support this.
- **Testing:** `npm test` now includes `v55-test.js`, which checks Dominant Game eligibility and verifies the revised simulation produces fewer shutouts on a fixed sample.

---

# Pokémon Baseball v5 — Compact Drafting, Favorites, Timed Lineups (15-Pokémon Rosters)

A runnable Node.js fantasy baseball website. The archive keeps the **same `pokebase-main/` directory structure** as the GitHub export supplied for editing. The working implementation is `engine.js`, `server.js`, and `public/{app.js,index.html,style.css,pokemon-data.json}`; original reference JavaScript files remain at the repository root, unchanged.

## Start or publish

1. Install Node.js 22 (Node 20+ also works). In the **same folder as `package.json`**, run `npm start`.
2. Browse to `http://localhost:3000/draft`. Create a fantasy league or choose Solo Challenge.
3. To publish: copy the contents of `pokebase-main/` into the **root** of the GitHub repository already connected to Render. Keep `public/` intact. Commit and push. Render Web Service: start command `npm start`; build command `npm install`.
4. Use the existing Render URL to invite friends; no new hostname is needed. A new 15-Pokémon league is required after this upgrade; earlier 10-slot leagues cannot be completed in the new system.

**Persistence warning:** `server.js` stores leagues in `data/leagues.json`. Render's ephemeral free instances can lose this file on a redeploy/restart. Don't promise persistent multi-day leagues until a managed database is added.

## New in v5

- **Same 15-Pokémon roster** (10 starters, 5 bench). All seven prior special events, 5-second CPU turns, two-miss auto-draft, HP-based fatigue, 162-game season and type ratings remain intact.
- **Horizontal draft ribbon** appears above the baseball field with the current team, round, pick clock and a collapsible snake-draft order (all rounds). The pool remains immediately to the right of the diamond on desktop; on small screens it stacks beneath.
- **Favorites in fantasy drafts:** star in the corner of any eligible species card; favorited species sort to the top regardless of the selected sort mode (within the current search results). Favorites persist across refreshes in the same tab during the draft and clear when the league exits drafting. The star is the only symbolic button; remaining navigation labels are plain text.
- **Scouting when off-clock:** anyone can click an available Pokémon to view its six base stats, height, weight and types. Only the on-clock team can assign a Pokémon to an open slot; the server validates all draft picks. Fits remain hidden.
- **Reference guide persists:** once you click Position weights to expand it, it stays expanded through renders, navigation and refreshes until you collapse it yourself.
- **Ten-second sound:** a soft three-tone reminder plays once for the human on the clock when a timed pick falls to 10 seconds. It obeys Sound on/off and browser audio autoplay restrictions. Turn-start sound also remains.
- **Sixty-second lineup phase:** right after the last pick, all players can rearrange their teams for exactly 60 seconds, with a visible countdown. The server automatically begins the season when time expires; no host action is required. Free hosts that go to sleep may delay processing until the next request or wake-up.
- **Recent leagues on homepage:** the browser lists codes for leagues previously joined from that browser and offers Open league; it can display their season results as long as the server still has the saved league. This is not a cloud account or cross-device history.
- **Summary:** Team, Hitting, Pitching and **Fielding** scores out of 1000 shown at the field and (for solo) final results.
- **More compact navy styling:** white body text, yellow secondary buttons and red primary controls, smaller banners/cards, smaller bench, scrollable Pokémon pool, and denser solo/home menus. No generated assets.
- **Fantasy normal playback:** 1.0 second/game, fast 0.5, slow 1.7 seconds; solo playback now takes half those durations. Special events and fatigue still pause longer.

## Previously introduced in v4

- **Roster unchanged from v3:** ten starters (including P and DH) and **five unrestricted bench slots**, for **15 picks per team**. The uploaded `pokebase-main(1).zip` had older ten-slot code; v4 deliberately carries forward the separately supplied v3 15-slot engine instead of reverting it. The outer folder and Render paths remain `pokebase-main/{server.js,engine.js,public/...}`.
- **Clean baseball diamond:** a Pokémon already placed on the field has no opaque background/border or name bar. Its sprite floats over the field with only a small **position label** below it. Empty places remain visible. Bench slot boxes stay below the field.
- **No hover scouting:** hovering, mouse-focusing or moving the pointer over Pokémon doesn't bring up a profile. Deliberately selecting a candidate still shows the six Pokémon base stats, height, weight and colored type badges. Personal fits and the obsolete synthetic baseball attributes remain hidden.
- **Clock and order:** the draft panel glows with a gold call-to-action when your turn starts. It displays nearby picks plus a collapsible **complete snake order** with player names, round and CPU/AUTO indicators. A tiny synthesized two-note sound plays when your turn starts if sound is enabled and the browser permits audio; it can be toggled off in the header. Browsers can block sounds until an interaction.
- **CPU / takeover:** normal CPUs wait **at least 5 seconds per pick**. A human who lets two consecutive timed picks expire is marked **AUTO-DRAFT**; future bot picks also wait five seconds. Manual picks or any real pointer, keyboard or scrolling interaction reset automatic control. Passive polling does not count as interaction. In untimed leagues players cannot miss a deadline, so this automatic takeover doesn't occur.
- **Seven event types:** walk-off home run (targeted 20% when a home-side situation allows a game-ending homer), extra innings (about 15% intentional late rallies, **maximum 15 innings**), pitcher no-hitter (rare, zero hits allowed), grand slam (HR with three occupied bases), comeback win (at least five runs behind earlier), **Dominant Game** (win by at least 5–0), and three-home-run game. The simulated score and player box stats generate their special-event metadata. No-hitters, grand slams, etc. are not simply 20% dice labels. Arcade-style forced-extra-innings situations use credited late-inning walks to reconcile run totals.
- **Slower playback:** normal is **1.0 seconds per game**, fast 0.2 seconds, slow 1.5 seconds; pauses are longer for fatigue or special events. Pausing, stepping and skipping remain available. Extra-innings labels show innings played, walk-off winning scores glow briefly, and no-hit pitchers are featured by the result.
- **Championship results:** once playback finishes, the World Series champion and **4–X** series record are featured beside league chat at the top. Underneath are all teams' roster viewers, final standings, individual batting and pitching stats, best-of-seven results, and a browsable log of every regular-season game.
- **Color and personality:** charcoal/neutral dark gray, deep maroon primary buttons and aged-gold secondary buttons, scoreboard plaques and updated controls. No AI-generated artwork or new image assets.

## Preserved systems from v3

- Exactly **15 Pokémon per team**: nine non-pitching starting roles (C, 1B, 2B, 3B, SS, LF, CF, RF, DH), one starting P, **five unrestricted bench slots** (BN1–BN5). The 15 rounds per team retain the original snake draft, 3–6 teams, CPU seats/expired human turn auto-picks, 30/60/120-second or unlimited timer, invite codes, chat, shiny draft rolls, type/generation pool choices, and post-draft lineup swaps.
- Larger baseball diamond. Five bench cards sit **immediately below in one horizontal row** (scrollable/compact on narrow displays). Both starter and bench cards support click-to-swap; they also accept sprite-only drag-and-drop in Fantasy and Solo (the bench card itself does not move). The original fields remain selectable while drafting. You can place a draft choice into a bench slot.
- Only deliberately selected candidate cards show **exactly six base Pokémon stats, all of its types, height, and weight**. Types have colored badges. The old synthetic POW/CON/FLD/SPD/VEL/CTRL/STA tiles, per-Pokémon fit grids and individual field fit numbers have been removed from the UI. Position fits are intentionally hidden. The **initial team score** is revealed only when all fifteen Pokémon have been selected. The persistent Scouting Rules section still provides general principles and weight percentages but not anyone's personal fit.
- **HP is excluded from position fit** and controls endurance only. Positional fit uses Attack, Defense, Special Attack, Special Defense, Speed, Height, Weight, plus small balanced type bonuses (+0–3, highest applicable type only). All ten position-specific weights are in `POSITION_WEIGHTS.csv`; the type balance was retained from v2.1 and verified by `type-balance-test.js`.
- All Pokémon start at **100 energy**. Every game each participating Pokémon loses energy based on the original HP stat and role: `round(base × 100 / (HP + 25))` (capped at 4–80). Base costs: **P 43**, C 20, other fielders 17, DH 12. Pitchers tire fastest; high HP lasts longer. Performance is slightly reduced when energy falls below 40; energy does not directly add to fit.
- A Pokémon is **tired at 25 energy or lower after a game** and must miss the **next** game, then fully recovers and returns to its original starting spot. The strongest available rested bench Pokémon **for that position** replaces it for that one game. Unused bench Pokémon recover up to 30 energy per game. Bench substitutions are chosen automatically; they can also become tired after playing. When more than five starters would simultaneously need to rest, only the five lowest-energy starters are scheduled for rest, with additional fatigue kept just above the threshold until a backup slot is available. This avoids an impossible game and is disclosed as a capacity safeguard.
- In both Solo and Fantasy games, the server/engine calculates an entire 162-game season, **then the browser plays the saved results back one at a time**. Default normal playback is ~1.0 second per game with a longer pause after tired events; Pause/Resume, Next, Speed and Skip to Results buttons are available. Every game's score, rested players, new tired players and substitutes are shown. The league's live playback displays updated standings. This is **playback of deterministic simulation results, not server-side turn-by-turn simulation**.
- The 162–0 solo challenge retains generation/type rolls, one region and one type reroll, **up to three legendaries (locked legendary offers stay visible in gray)**, while the 151 Challenge has no Legendary cap and five Pokémon rerolls. Each draft now fills 15 slots. Both season results track batting and pitching **by Pokémon identity**, not just by original position: a substitute's at-bats and pitching innings accrue to that specific Pokémon. Regular-season and best-of-seven fantasy finals use fatigue and bench rotations. Game logs contain the active lineup and fatigue/substitution reports.
- Draft and results layouts use independent flexible sections, avoiding the former tall empty sidebars. Detailed seasonal tables now occupy their own full-width section with horizontal overflow; large fields remain visible.

## Position weighting (fit / 100)

Every row has **0% HP** and percentages totaling 100 across the other seven measures. `SpA` is primarily throwing/pitching technique, `SpD` teamwork, `Atk` power, `Def` fielding, `Spe` movement/baserunning, size factors recovery/reach. We retain logarithmic weight normalization to avoid huge Pokémon dominating.

| Position | Attack | Defense | SpA | SpD | Speed | Height | Weight |
|---|---:|---:|---:|---:|---:|---:|---:|
| C | 10% | 26% | 15% | 20% | 8% | 11% | 10% |
| 1B | 26% | 15% | 10% | 11% | 8% | 15% | 15% |
| 2B | 10% | 27% | 11% | 21% | 21% | 6% | 4% |
| 3B | 23% | 26% | 12% | 15% | 12% | 7% | 5% |
| SS | 9% | 30% | 10% | 20% | 24% | 5% | 2% |
| LF | 21% | 19% | 12% | 15% | 22% | 6% | 5% |
| CF | 10% | 26% | 12% | 17% | 29% | 4% | 2% |
| RF | 25% | 22% | 12% | 14% | 17% | 6% | 4% |
| DH | 38% | 5% | 13% | 10% | 23% | 6% | 5% |
| P | 15% | 7% | 40% | 18% | 4% | 9% | 7% |

Team Score remains a **0–1000** weighted average of ten starter position fits with a weak-position penalty (84% weighted fit + 16% lowest-two average; normalized to 0–1000). Bench depth changes game outcomes, but doesn't add points to the initial team score. No real MLB prediction accuracy is claimed: this is an arcade-style simulator.

## Testing

Execute from the project root:

```bash
node type-balance-test.js
node fatigue-test.js
node smoke-test.js
node draft-bot-test.js
node special-events-test.js
```

These verify type parity, all position weights, mandatory one-game rests and automatic replacements, 15-Pokémon roster sizes, 45-pick three-team snake draft, unique species per league, server chat/lineup swaps, 162 games/team, and results by player identity. The engine and HTTP API integration tests pass. Browser navigation was restricted in the latest editing environment, so full graphical verification of the new v4 layouts and remote sprites is still recommended on your deployed site.

## Notes

- The working backend is a conventional Node HTTP server, not a Vercel Functions application. It can run unchanged on a compatible Node hosting service, with the caveat about local persistence above.
- If you previously played on an earlier build, start a **new solo challenge** to avoid mixing saved ten-slot drafts with the new fifteen-slot roster. You can use the **New challenge** button.
- The supplied original football reference code remains in the ZIP for reference only; the website doesn't load it. Changes to `engine.js` and `public/` control the current game.
- Pokémon sprites load from public PokéAPI sprite hosting; names and artwork remain the rights of their owners. This is an unofficial fan project.
