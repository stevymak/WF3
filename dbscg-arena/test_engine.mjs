/* ════════════════════════════════════════════════════════════════════
   Tests HEADLESS du moteur de DBSCG Arena (volet B).
   Aucune dépendance React/DOM : on extrait la LOGIQUE PURE directement
   depuis dbscg-arena.jsx (tout ce qui précède les sous-composants React),
   on l'importe, puis on rejoue des scénarios reproductibles.
   → Source unique de vérité = le .jsx. Pas de duplication.

   Lancer :  node test_engine.mjs
   ════════════════════════════════════════════════════════════════════ */
import { readFile, writeFile, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import assert from "node:assert/strict";

const SRC = new URL("./dbscg-arena.jsx", import.meta.url);
const MARKER = "/* ════ Sous-composants";

// ── Extraction de la logique pure ─────────────────────────────────────
const raw = await readFile(SRC, "utf8");
const cut = raw.indexOf(MARKER);
assert.ok(cut > 0, "Marqueur de fin de logique pure introuvable dans le .jsx");
let logic = raw.slice(0, cut)
  // retire l'import React (inutile et non résolvable côté Node)
  .replace(/^import\s+\{[^}]*\}\s+from\s+["']react["'];?\s*$/m, "");
// expose tout ce dont les tests ont besoin
logic += `
export { POOL, LEADERS, PREBUILT, FX_TXT, shuffle, byId, deckToCards, deckSize,
  mkPlayer, activeEnergy, leaderPower, leaderName, clone, other, freshGame,
  pay, draw, awakenSide, lifeDamage, applyFx, startTurn, canCounter, hasBlocker,
  startCombat, doCounter, doBlock, doCombo, combatTotals, clashVerdict, resolveClash };
`;
const dir = await mkdtemp(join(tmpdir(), "dbscg-"));
const modPath = join(dir, "engine.mjs");
await writeFile(modPath, logic);
const E = await import(pathToFileURL(modPath).href);

// ── Fabriques d'état déterministes (on évite shuffle/Math.random) ─────
const card = (o) => ({ hue: 200, kw: [], ...o });
const mkP = (over = {}) => ({
  leaderId: "L1", deck: [], hand: [], life: [], energy: [], battle: [], drop: [],
  awakened: false, leaderRested: false, ...over,
});
const mkG = (P, A, over = {}) => ({
  turnNo: 2, active: "P", phase: "MAIN", players: { P, A },
  combat: null, winner: null, fx: null, log: [], ...over,
});
const energies = (n, restedCount = 0) =>
  Array.from({ length: n }, (_, i) => ({ id: "E", rested: i < restedCount }));

// ── Mini-framework ────────────────────────────────────────────────────
let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); console.log(`  PASS  ${name}`); passed++; }
  catch (e) { console.log(`  FAIL  ${name}\n        ${e.message}`); failed++; }
}

/* ═══════════════════ ÉNERGIE & PIOCHE ═══════════════════ */
test("pay() repose exactement N énergies actives", () => {
  const p = mkP({ energy: energies(3) });
  E.pay(p, 2);
  assert.equal(E.activeEnergy(p), 1);
  assert.equal(p.energy.filter((e) => e.rested).length, 2);
});

test("pay() ne touche pas aux énergies déjà au repos", () => {
  const p = mkP({ energy: energies(3, 1) }); // 1 déjà rested
  E.pay(p, 1);
  assert.equal(E.activeEnergy(p), 1); // 2 actives -> 1 payée -> 1 active
});

test("draw() transfère du deck vers la main", () => {
  const g = mkG(mkP({ deck: [card({ id: "A" }), card({ id: "B" })] }), mkP());
  E.draw(g, "P", 1);
  assert.equal(g.players.P.hand.length, 1);
  assert.equal(g.players.P.hand[0].id, "A");
  assert.equal(g.players.P.deck.length, 1);
});

test("draw() sur deck vide => défaite (deck-out)", () => {
  const g = mkG(mkP({ deck: [] }), mkP());
  E.draw(g, "P", 1);
  assert.equal(g.winner, "A");
});

/* ═══════════════════ ÉVEIL (AWAKEN) ═══════════════════ */
test("awakenSide() s'active à 4 vies ou moins et pioche (L1 = +2)", () => {
  const g = mkG(mkP({ life: Array(4).fill(card({})), deck: [card({}), card({}), card({})] }), mkP());
  const ok = E.awakenSide(g, "P");
  assert.equal(ok, true);
  assert.equal(g.players.P.awakened, true);
  assert.equal(g.players.P.hand.length, 2, "L1 pioche 2 à l'éveil");
});

test("awakenSide() refuse au-dessus de 4 vies", () => {
  const g = mkG(mkP({ life: Array(5).fill(card({})) }), mkP());
  assert.equal(E.awakenSide(g, "P"), false);
  assert.equal(g.players.P.awakened, false);
});

test("awakenSide() L3 réactive les énergies", () => {
  const g = mkG(mkP({ leaderId: "L3", life: Array(3).fill(card({})), deck: [card({})], energy: energies(2, 2) }), mkP());
  E.awakenSide(g, "P");
  assert.equal(E.activeEnergy(g.players.P), 2, "L3 défatigue toutes les énergies");
});

test("leaderPower() reflète l'éveil", () => {
  const p = mkP({ leaderId: "L1", awakened: false });
  assert.equal(E.leaderPower(p), 10000);
  p.awakened = true;
  assert.equal(E.leaderPower(p), 15000);
});

/* ═══════════════════ DÉGÂTS DE VIE ═══════════════════ */
test("lifeDamage() envoie la vie en main (non-critical)", () => {
  const g = mkG(mkP(), mkP({ life: [card({ id: "L1c" }), card({ id: "L2c" })] }));
  E.lifeDamage(g, "A", 1, false);
  assert.equal(g.players.A.life.length, 1);
  assert.equal(g.players.A.hand.length, 1);
  assert.equal(g.players.A.hand[0].id, "L1c");
});

test("lifeDamage() critical envoie la vie à la défausse", () => {
  const g = mkG(mkP(), mkP({ life: [card({ id: "x" }), card({ id: "y" })] }));
  E.lifeDamage(g, "A", 1, true);
  assert.equal(g.players.A.drop.length, 1);
  assert.equal(g.players.A.hand.length, 0);
});

test("lifeDamage() à 0 vie => victoire de l'attaquant", () => {
  const g = mkG(mkP(), mkP({ life: [card({})] }));
  E.lifeDamage(g, "A", 1, false);
  assert.equal(g.winner, "P");
});

test("lifeDamage() Double Strike inflige 2 dégâts", () => {
  const g = mkG(mkP(), mkP({ life: [card({}), card({}), card({})] }));
  E.lifeDamage(g, "A", 2, false);
  assert.equal(g.players.A.life.length, 1);
});

test("lifeDamage() sur l'IA déclenche son éveil à 4 vies", () => {
  const g = mkG(mkP(), mkP({ leaderId: "L2", life: Array(5).fill(card({})), deck: Array(5).fill(card({})) }));
  E.lifeDamage(g, "A", 1, false); // 5 -> 4
  assert.equal(g.players.A.awakened, true, "l'IA s'éveille automatiquement");
});

/* ═══════════════════ EFFETS (FX) ═══════════════════ */
test("applyFx ko2 : KO la plus forte créature coût ≤ 2", () => {
  const opp = mkP({ battle: [card({ id: "low", cost: 1, power: 5000 }), card({ id: "hi", cost: 2, power: 15000 }), card({ id: "big", cost: 3, power: 30000 })] });
  const g = mkG(mkP(), opp);
  E.applyFx(g, "P", { name: "Chasseur", fx: "ko2" });
  assert.deepEqual(g.players.A.battle.map((c) => c.id), ["low", "big"]);
  assert.equal(g.players.A.drop[0].id, "hi");
});

test("applyFx koRested : ne touche que les créatures au repos ≤ 20K", () => {
  const opp = mkP({ battle: [card({ id: "a", power: 20000, rested: true }), card({ id: "b", power: 25000, rested: true }), card({ id: "c", power: 10000, rested: false })] });
  const g = mkG(mkP(), opp);
  E.applyFx(g, "P", { name: "Vague", fx: "koRested" });
  assert.equal(g.players.A.drop[0].id, "a", "cible repos & power<=20K le plus fort");
});

test("applyFx heal1 : +1 vie depuis le deck si < 8", () => {
  const me = mkP({ life: Array(3).fill(card({})), deck: [card({ id: "top" })] });
  const g = mkG(me, mkP());
  E.applyFx(g, "P", { name: "Soin", fx: "heal1" });
  assert.equal(g.players.P.life.length, 4);
  assert.equal(g.players.P.deck.length, 0);
});

/* ═══════════════════ COMBAT : ouverture ═══════════════════ */
test("startCombat : leader attaque, repos + saut à COMBO sans contre/blocker", () => {
  const g = mkG(mkP({ leaderId: "L1" }), mkP({ leaderId: "L2" }));
  E.startCombat(g, "P", "L", "L");
  assert.equal(g.players.P.leaderRested, true);
  assert.equal(g.combat.step, "COMBO", "ni contre ni blocker -> on saute à COMBO");
  assert.equal(g.combat.atkPow, 10000);
});

test("startCombat : étape BLOCK si défenseur a un Blocker actif", () => {
  const def = mkP({ battle: [card({ id: "blk", power: 15000, kw: ["Blocker"], rested: false })] });
  const g = mkG(mkP(), def);
  E.startCombat(g, "P", "L", "L");
  assert.equal(g.combat.step, "BLOCK");
});

test("startCombat : étape COUNTER si défenseur peut annuler", () => {
  const def = mkP({ hand: [card({ fx: "negate" })], energy: energies(1) });
  const g = mkG(mkP(), def);
  E.startCombat(g, "P", "L", "L");
  assert.equal(g.combat.step, "COUNTER");
});

test("startCombat : créature avec Double Strike + Critical porte les flags", () => {
  const atk = mkP({ battle: [card({ id: "boss", power: 35000, kw: ["Double Strike", "Critical"], rested: false, turnPlayed: 1 })] });
  const g = mkG(atk, mkP());
  E.startCombat(g, "P", 0, "L");
  assert.equal(g.combat.dbl, true);
  assert.equal(g.combat.crit, true);
});

/* ═══════════════════ COMBAT : combo alterné ═══════════════════ */
test("doCombo : deux passes consécutives -> CLASH", () => {
  const g = mkG(mkP({ leaderId: "L1" }), mkP({ leaderId: "L2" }));
  E.startCombat(g, "P", "L", "L"); // step COMBO, comboTurn = "A"
  E.doCombo(g, "A", null); // passe (passes=1)
  E.doCombo(g, "P", null); // passe (passes=2) -> CLASH
  assert.equal(g.combat.step, "CLASH");
});

test("doCombo : jouer une carte combo l'ajoute et remet passes à 0", () => {
  const atk = mkP({ leaderId: "L1", hand: [card({ id: "cmb", combo: 5000 })] });
  const g = mkG(atk, mkP({ leaderId: "L2" }));
  E.startCombat(g, "P", "L", "L");
  g.combat.comboTurn = "P"; // force le tour de combo côté attaquant
  E.doCombo(g, "P", 0);
  assert.equal(g.combat.atkCombos.length, 1);
  assert.equal(g.combat.passes, 0);
  assert.equal(g.players.P.hand.length, 0);
});

test("combatTotals : somme correcte des combos des deux côtés", () => {
  const g = mkG(mkP({ leaderId: "L1" }), mkP({ leaderId: "L2" }));
  E.startCombat(g, "P", "L", "L");
  g.combat.atkCombos = [card({ combo: 5000 }), card({ combo: 10000 })];
  g.combat.defCombos = [card({ combo: 5000 })];
  const t = E.combatTotals(g);
  assert.equal(t.atk, 10000 + 15000);
  assert.equal(t.def, 10000 + 5000);
});

/* ═══════════════════ COMBAT : résolution ═══════════════════ */
test("resolveClash : touché direct sur Leader => 1 dégât", () => {
  const def = mkP({ leaderId: "L2", life: [card({}), card({})] });
  const g = mkG(mkP({ leaderId: "L1" }), def);
  E.startCombat(g, "P", "L", "L"); // 10000 vs 10000
  g.combat.step = "CLASH";
  E.resolveClash(g);
  assert.equal(g.players.A.life.length, 1, "atk>=def -> 1 dégât");
  assert.equal(g.combat, null);
});

test("resolveClash : GARDE RÉUSSIE quand atk < def (aucun dégât)", () => {
  const def = mkP({ leaderId: "L2", life: [card({}), card({})] });
  const g = mkG(mkP({ leaderId: "L1" }), def);
  E.startCombat(g, "P", "L", "L");
  g.combat.defCombos = [card({ combo: 5000 })]; // def 15000 > atk 10000
  const v = E.clashVerdict(g);
  assert.equal(v.cls, "guard");
  E.resolveClash(g);
  assert.equal(g.players.A.life.length, 2, "aucun dégât");
});

test("resolveClash : KO d'une créature ciblée quand atk >= def", () => {
  const def = mkP({ battle: [card({ id: "victim", power: 10000 })] });
  const g = mkG(mkP({ leaderId: "L1" }), def);
  E.startCombat(g, "P", "L", 0); // leader 10000 vs créature 10000
  g.combat.step = "CLASH";
  E.resolveClash(g);
  assert.equal(g.players.A.battle.length, 0);
  assert.equal(g.players.A.drop[0].id, "victim");
});

test("resolveClash : Critical sur Leader -> vie à la défausse", () => {
  const atk = mkP({ battle: [card({ id: "crit", power: 25000, kw: ["Critical"], rested: false, turnPlayed: 1 })] });
  const def = mkP({ leaderId: "L2", life: [card({}), card({})] });
  const g = mkG(atk, def);
  E.startCombat(g, "P", 0, "L");
  g.combat.step = "CLASH";
  E.resolveClash(g);
  assert.equal(g.players.A.drop.length, 1, "Critical -> défausse, pas la main");
  assert.equal(g.players.A.hand.length, 0);
});

test("doCounter : Barrière annule, paie 1 énergie, défausse la carte", () => {
  const def = mkP({ leaderId: "L2", hand: [card({ id: "bar", fx: "negate" })], energy: energies(1), life: [card({}), card({})] });
  const g = mkG(mkP({ leaderId: "L1" }), def);
  E.startCombat(g, "P", "L", "L"); // step COUNTER
  E.doCounter(g, true);
  assert.equal(g.combat.negated, true);
  assert.equal(g.combat.step, "CLASH");
  assert.equal(E.activeEnergy(g.players.A), 0, "1 énergie payée");
  E.resolveClash(g);
  assert.equal(g.players.A.life.length, 2, "attaque annulée: aucun dégât");
  assert.ok(g.players.A.drop.some((c) => c.id === "bar"), "Barrière en défausse");
});

test("doBlock : le Blocker intercepte puis est KO si l'attaque passe", () => {
  const def = mkP({ leaderId: "L2", battle: [card({ id: "blk", power: 10000, kw: ["Blocker"] })], life: [card({}), card({})] });
  const g = mkG(mkP({ leaderId: "L1" }), def);
  E.startCombat(g, "P", "L", "L"); // step BLOCK (blocker présent)
  E.doBlock(g, 0);
  assert.equal(g.combat.blockerIdx, 0);
  assert.equal(g.players.A.battle[0].rested, true, "le blocker se met au repos");
  g.combat.step = "CLASH";
  E.resolveClash(g); // 10000 >= 10000 -> blocker KO, leader intact
  assert.equal(g.players.A.battle.length, 0, "blocker KO");
  assert.equal(g.players.A.life.length, 2, "leader protégé");
});

/* ═══════════════════ CAS LIMITES ═══════════════════ */
test("cas limite : combo sans carte jouable -> on ne peut que passer", () => {
  const g = mkG(mkP({ leaderId: "L1", hand: [card({ id: "noCombo", combo: 0 })] }), mkP({ leaderId: "L2" }));
  E.startCombat(g, "P", "L", "L");
  const handBefore = g.players.A.hand.length;
  E.doCombo(g, "A", null); // passe
  assert.equal(g.combat.passes, 1);
  assert.equal(g.players.A.hand.length, handBefore, "rien joué");
});

test("cas limite : doCombo ignore une carte sans valeur de combo", () => {
  const atk = mkP({ leaderId: "L1", hand: [card({ id: "x", combo: 0 })] });
  const g = mkG(atk, mkP({ leaderId: "L2" }));
  E.startCombat(g, "P", "L", "L");
  g.combat.comboTurn = "P";
  E.doCombo(g, "P", 0); // combo=0 -> traité comme un passe
  assert.equal(g.combat.atkCombos.length, 0);
  assert.equal(g.combat.passes, 1);
});

test("cas limite : canCounter faux sans énergie active", () => {
  const p = mkP({ hand: [card({ fx: "negate" })], energy: energies(1, 1) }); // énergie au repos
  assert.equal(E.canCounter(p), false);
});

test("intégrité : decks préconstruits ont 50–60 cartes", () => {
  for (const d of E.PREBUILT) {
    const n = E.deckSize(d.cards);
    assert.ok(n >= 50 && n <= 60, `${d.name} a ${n} cartes (hors 50–60)`);
  }
});

console.log(`\n${passed}/${passed + failed} tests moteur réussis.`);
process.exit(failed ? 1 : 0);
