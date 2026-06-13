import { useState, useEffect, useRef } from "react";
/* ════════════════════════════════════════════════════════════
   DBSCG ARENA v5 — Combat cinématique détaillé
   CONTRE → BLOCK → COMBO (alterné) → CLASH animé.
   Import d'illustrations (script Python) + deck builder conservés.
   ════════════════════════════════════════════════════════════ */
const CARD_CODE_RE = /([A-Z]{1,4}\d{0,3}-\d{2,4}(?:_[A-Za-z0-9]+)?)/i;
const POOL = [
  { id: "D1",  name: "Avant-garde Saiyan", cost: 1, power: 10000, combo: 5000,  hue: 8,   kw: [] },
  { id: "D2",  name: "Éclaireur Namek",    cost: 1, power: 5000,  combo: 10000, hue: 140, kw: [] },
  { id: "D11", name: "Méditant du Ki",     cost: 1, power: 5000,  combo: 5000,  hue: 265, kw: [], fx: "draw1" },
  { id: "D16", name: "Duelliste Doré",     cost: 2, power: 10000, combo: 10000, hue: 48,  kw: [] },
  { id: "D3",  name: "Garde Android",      cost: 2, power: 15000, combo: 5000,  hue: 215, kw: ["Blocker"] },
  { id: "D10", name: "Sentinelle Ailée",   cost: 2, power: 10000, combo: 5000,  hue: 190, kw: ["Blocker"] },
  { id: "D14", name: "Spectre Azur",       cost: 2, power: 15000, combo: 0,     hue: 225, kw: [] },
  { id: "D4",  name: "Pisteur du Vide",    cost: 2, power: 10000, combo: 5000,  hue: 45,  kw: [], fx: "draw1" },
  { id: "D5",  name: "Brute Cosmique",     cost: 3, power: 20000, combo: 5000,  hue: 28,  kw: [] },
  { id: "D8",  name: "Chasseur de Têtes",  cost: 3, power: 15000, combo: 5000,  hue: 320, kw: [], fx: "ko2" },
  { id: "D6",  name: "Exécuteur Sombre",   cost: 4, power: 25000, combo: 0,     hue: 280, kw: ["Critical"] },
  { id: "D12", name: "Lame du Crépuscule", cost: 4, power: 20000, combo: 5000,  hue: 300, kw: [], fx: "draw1" },
  { id: "D7",  name: "Frappeur Jumeau",    cost: 5, power: 25000, combo: 5000,  hue: 0,   kw: ["Double Strike"] },
  { id: "D13", name: "Titan Émeraude",     cost: 5, power: 30000, combo: 0,     hue: 150, kw: [] },
  { id: "D9",  name: "Colosse Final",      cost: 6, power: 35000, combo: 0,     hue: 350, kw: ["Double Strike", "Critical"] },
  { id: "E1",  name: "Barrière d'Énergie", cost: 1, type: "EXTRA", hue: 200, fx: "negate" },
  { id: "E2",  name: "Vague de Ki",        cost: 2, type: "EXTRA", hue: 55,  fx: "koRested" },
  { id: "E3",  name: "Sphère de Soin",     cost: 2, type: "EXTRA", hue: 130, fx: "heal1" },
];
const LEADERS = {
  L1: { id: "L1", name: "Champion Vermillon", awName: "Champion Vermillon · Éveillé", power: 10000, awPower: 15000, hue: 8,   awTxt: "Éveil : pioche 2" },
  L2: { id: "L2", name: "Stratège Azur",      awName: "Stratège Azur · Éveillé",      power: 10000, awPower: 15000, hue: 220, awTxt: "Éveil : pioche 3" },
  L3: { id: "L3", name: "Sage Émeraude",      awName: "Sage Émeraude · Éveillé",      power: 10000, awPower: 15000, hue: 145, awTxt: "Éveil : pioche 1 + réactive tes énergies" },
};
const FX_TXT = { draw1: "Entrée : pioche 1", ko2: "Entrée : KO adverse coût ≤2", negate: "[Contre] Annule une attaque", koRested: "KO adverse au repos ≤20K", heal1: "Récupère 1 vie (depuis le deck)" };
const PREBUILT = [
  { name: "Assaut Vermillon", desc: "Aggro pur — pression dès le tour 1", leader: "L1",
    cards: { D1: 4, D16: 4, D11: 4, D4: 4, D5: 4, D8: 4, D6: 4, D7: 4, D9: 2, D12: 4, E2: 4, E1: 4, D2: 4 } },
  { name: "Muraille Azur", desc: "Contrôle — Blockers, contres et soins", leader: "L2",
    cards: { D3: 4, D10: 4, D14: 4, D2: 4, D11: 4, D4: 4, E1: 4, E2: 4, E3: 4, D6: 4, D12: 4, D13: 4, D9: 2 } },
  { name: "Tempête Émeraude", desc: "Milieu de partie — gros combos et Titans", leader: "L3",
    cards: { D2: 4, D13: 4, D5: 4, D16: 4, D11: 4, D1: 4, D8: 4, D7: 4, E3: 4, E2: 4, D12: 4, D10: 4, D9: 2 } },
];
const shuffle = (a) => { const r = [...a]; for (let i = r.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [r[i], r[j]] = [r[j], r[i]]; } return r; };
const byId = (id) => POOL.find((c) => c.id === id);
const deckToCards = (deck) => shuffle(Object.entries(deck.cards).flatMap(([id, n]) => Array(n).fill(0).map(() => ({ ...byId(id) }))));
const deckSize = (cards) => Object.values(cards).reduce((a, b) => a + b, 0);
const mkPlayer = (deck) => { const d = deckToCards(deck); return { leaderId: deck.leader, deck: d.slice(14), hand: d.slice(0, 6), life: d.slice(6, 14), energy: [], battle: [], drop: [], awakened: false, leaderRested: false }; };
const activeEnergy = (p) => p.energy.filter((e) => !e.rested).length;
const leaderPower = (p) => (p.awakened ? LEADERS[p.leaderId].awPower : LEADERS[p.leaderId].power);
const leaderName = (p) => (p.awakened ? LEADERS[p.leaderId].awName : LEADERS[p.leaderId].name);
const clone = (s) => JSON.parse(JSON.stringify(s));
const other = (s) => (s === "P" ? "A" : "P");
function freshGame(playerDeck, aiDeck) {
  return { turnNo: 1, active: "P", phase: "CHARGE", players: { P: mkPlayer(playerDeck), A: mkPlayer(aiDeck) }, combat: null, winner: null, fx: null, log: ["Le duel commence. À toi de jouer !"] };
}
function pay(p, n) { let left = n; p.energy = p.energy.map((e) => (!e.rested && left-- > 0 ? { ...e, rested: true } : e)); }
function draw(g, side, n) {
  const p = g.players[side];
  for (let i = 0; i < n; i++) {
    if (!p.deck.length) { g.winner = other(side); g.log.push(`${side === "P" ? "Ton deck" : "Le deck adverse"} est vide — fin du duel.`); return; }
    p.hand.push(p.deck.shift());
  }
}
function awakenSide(g, side) {
  const p = g.players[side]; if (p.awakened || p.life.length > 4) return false;
  p.awakened = true;
  if (p.leaderId === "L1") draw(g, side, 2);
  if (p.leaderId === "L2") draw(g, side, 3);
  if (p.leaderId === "L3") { draw(g, side, 1); p.energy = p.energy.map((e) => ({ ...e, rested: false })); }
  g.log.push(`⚡ ${side === "P" ? "TON LEADER" : "Le Leader adverse"} S'ÉVEILLE ! ${LEADERS[p.leaderId].awTxt}`);
  return true;
}
function lifeDamage(g, side, hits, critical) {
  const p = g.players[side];
  for (let i = 0; i < hits; i++) {
    if (!p.life.length) break;
    const c = p.life.shift();
    if (critical) { p.drop.push(c); g.log.push(`💥 Critical ! ${c.name} part à la défausse.`); }
    else { p.hand.push(c); g.log.push(`💔 ${side === "P" ? "Tu perds" : "L'IA perd"} 1 vie (${c.name} → main).`); }
    if (!p.life.length) { g.winner = other(side); g.log.push(side === "P" ? "💀 Plus de vie… Défaite." : "🏆 L'IA n'a plus de vie — VICTOIRE !"); return; }
  }
  if (side === "A") awakenSide(g, "A");
}
function applyFx(g, side, c) {
  const me = g.players[side], opp = g.players[other(side)];
  if (c.fx === "draw1") { draw(g, side, 1); g.log.push(`${c.name} : pioche 1.`); }
  if (c.fx === "heal1") { if (me.deck.length && me.life.length < 8) { me.life.push(me.deck.shift()); g.log.push(`💚 ${c.name} : +1 vie.`); } }
  if (c.fx === "ko2") {
    const i = opp.battle.reduce((b, x, ix) => (x.cost <= 2 && (b < 0 || x.power > opp.battle[b].power) ? ix : b), -1);
    if (i >= 0) { const [ko] = opp.battle.splice(i, 1); opp.drop.push(ko); g.log.push(`${c.name} met KO ${ko.name} !`); }
  }
  if (c.fx === "koRested") {
    const i = opp.battle.reduce((b, x, ix) => (x.rested && x.power <= 20000 && (b < 0 || x.power > opp.battle[b].power) ? ix : b), -1);
    if (i >= 0) { const [ko] = opp.battle.splice(i, 1); opp.drop.push(ko); g.log.push(`Vague de Ki balaie ${ko.name} !`); }
    else g.log.push("Vague de Ki : aucune cible au repos.");
  }
}
function startTurn(g, side) {
  g.turnNo++; g.active = side; g.phase = "CHARGE";
  const p = g.players[side];
  p.energy = p.energy.map((e) => ({ ...e, rested: false }));
  p.battle = p.battle.map((b) => ({ ...b, rested: false }));
  p.leaderRested = false;
  draw(g, side, 1);
  g.log.push(side === "P" ? `— Tour ${g.turnNo} : à toi —` : `— Tour ${g.turnNo} : IA —`);
}
/* ════ SYSTÈME DE COMBAT ════ */
const canCounter = (p) => p.hand.some((c) => c.fx === "negate") && activeEnergy(p) >= 1;
const hasBlocker = (p) => p.battle.some((b) => b.kw?.includes("Blocker") && !b.rested);
function startCombat(g, atkSide, atkSel, targetIdx) {
  const atkP = g.players[atkSide];
  let atkName, atkPow, atkId, atkHue, dbl = false, crit = false;
  if (atkSel === "L") {
    atkP.leaderRested = true;
    atkName = leaderName(atkP); atkPow = leaderPower(atkP);
    atkId = atkP.awakened ? atkP.leaderId + "b" : atkP.leaderId; atkHue = LEADERS[atkP.leaderId].hue;
  } else {
    const b = atkP.battle[atkSel]; b.rested = true;
    atkName = b.name; atkPow = b.power; atkId = b.id; atkHue = b.hue;
    dbl = b.kw?.includes("Double Strike"); crit = b.kw?.includes("Critical");
  }
  g.combat = {
    atkSide, atkName, atkPow, atkId, atkHue, dbl, crit,
    targetIdx, blockerIdx: null, atkCombos: [], defCombos: [],
    comboTurn: other(atkSide), passes: 0, negated: false, step: "COUNTER",
  };
  g.log.push(`⚔️ ${atkName} déclare une attaque !`);
  const defP = g.players[other(atkSide)];
  if (!canCounter(defP)) { g.combat.step = hasBlocker(defP) ? "BLOCK" : "COMBO"; }
}
function doCounter(g, useIt) {
  const cb = g.combat; const defP = g.players[other(cb.atkSide)];
  if (useIt) {
    const ei = defP.hand.findIndex((c) => c.fx === "negate");
    if (ei >= 0 && activeEnergy(defP) >= 1) {
      pay(defP, 1); const [c] = defP.hand.splice(ei, 1); defP.drop.push(c);
      cb.negated = true; cb.step = "CLASH";
      g.log.push("🛡 Barrière d'Énergie ! L'attaque va être annulée…");
      return;
    }
  }
  cb.step = hasBlocker(defP) ? "BLOCK" : "COMBO";
}
function doBlock(g, idx) {
  const cb = g.combat; const defP = g.players[other(cb.atkSide)];
  if (idx != null) {
    cb.blockerIdx = idx; defP.battle[idx].rested = true;
    g.log.push(`🛡 ${defP.battle[idx].name} s'interpose (Blocker) !`);
  }
  cb.step = "COMBO"; cb.comboTurn = other(cb.atkSide); cb.passes = 0;
}
function doCombo(g, side, handIdx) {
  const cb = g.combat; const p = g.players[side];
  if (handIdx != null && p.hand[handIdx]?.combo) {
    const [c] = p.hand.splice(handIdx, 1);
    (side === cb.atkSide ? cb.atkCombos : cb.defCombos).push(c);
    cb.passes = 0;
    g.log.push(`${side === "P" ? "Tu combotes" : "L'IA combote"} avec ${c.name} (+${c.combo}).`);
  } else cb.passes++;
  cb.comboTurn = other(cb.comboTurn);
  if (cb.passes >= 2) cb.step = "CLASH";
}
function combatTotals(g) {
  const cb = g.combat; if (!cb) return { atk: 0, def: 0, defName: "", defId: null, defHue: 200 };
  const defP = g.players[other(cb.atkSide)];
  const atk = cb.atkPow + cb.atkCombos.reduce((t, c) => t + (c.combo || 0), 0);
  let base, defName, defId, defHue;
  if (cb.blockerIdx != null) { const b = defP.battle[cb.blockerIdx]; base = b.power; defName = b.name; defId = b.id; defHue = b.hue; }
  else if (cb.targetIdx === "L") { base = leaderPower(defP); defName = leaderName(defP); defId = defP.awakened ? defP.leaderId + "b" : defP.leaderId; defHue = LEADERS[defP.leaderId].hue; }
  else { const t = defP.battle[cb.targetIdx]; base = t?.power ?? 0; defName = t?.name ?? "?"; defId = t?.id; defHue = t?.hue ?? 200; }
  const def = base + cb.defCombos.reduce((t, c) => t + (c.combo || 0), 0);
  return { atk, def, defName, defId, defHue };
}
function clashVerdict(g) {
  const cb = g.combat; if (!cb) return null;
  if (cb.negated) return { txt: "ATTAQUE ANNULÉE", cls: "neg" };
  const { atk, def } = combatTotals(g);
  if (atk < def) return { txt: "GARDE RÉUSSIE", cls: "guard" };
  if (cb.blockerIdx != null) return { txt: "BLOCKER SACRIFIÉ", cls: "guard" };
  if (cb.targetIdx === "L") {
    if (cb.crit && cb.dbl) return { txt: "💥 DOUBLE STRIKE CRITICAL !!", cls: "crit" };
    if (cb.crit) return { txt: "💥 CRITICAL !!", cls: "crit" };
    if (cb.dbl) return { txt: "💥 DOUBLE STRIKE !!", cls: "crit" };
    return { txt: "TOUCHÉ DIRECT !", cls: "hit" };
  }
  return { txt: "K.O. !!", cls: "hit" };
}
function resolveClash(g) {
  const cb = g.combat; if (!cb) return;
  const atkP = g.players[cb.atkSide], defP = g.players[other(cb.atkSide)];
  const { atk, def } = combatTotals(g);
  cb.atkCombos.forEach((c) => atkP.drop.push(c));
  cb.defCombos.forEach((c) => defP.drop.push(c));
  if (cb.negated) { g.log.push("🛡 Attaque ANNULÉE."); g.combat = null; return; }
  g.log.push(`CLASH : ${atk.toLocaleString()} vs ${def.toLocaleString()}`);
  if (atk >= def) {
    if (cb.blockerIdx != null) { const [ko] = defP.battle.splice(cb.blockerIdx, 1); defP.drop.push(ko); g.log.push(`${ko.name} est KO en bloquant.`); }
    else if (cb.targetIdx === "L") lifeDamage(g, other(cb.atkSide), cb.dbl ? 2 : 1, cb.crit);
    else { const [ko] = defP.battle.splice(cb.targetIdx, 1); defP.drop.push(ko); g.log.push(`${ko.name} est KO !`); }
    g.fx = "shake";
  } else g.log.push("L'attaque est repoussée — puissance insuffisante.");
  g.combat = null;
}
/* ════ Sous-composants (hors du render principal) ════ */
function CountUp({ to }) {
  const [v, setV] = useState(0);
  const prev = useRef(0);
  useEffect(() => {
    let raf; const t0 = performance.now(); const from = prev.current;
    const tick = (t) => {
      const k = Math.min(1, (t - t0) / 600);
      const val = Math.round(from + (to - from) * (1 - Math.pow(1 - k, 3)));
      setV(val);
      if (k < 1) raf = requestAnimationFrame(tick); else prev.current = to;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [to]);
  return <>{v.toLocaleString("fr-FR")}</>;
}
export default function DBSCGArena() {
  const [screen, setScreen] = useState("MENU");
  const [imgCfg, setImgCfg] = useState({ template: "", ext: {}, urls: {} });
  const [localImgs, setLocalImgs] = useState({});
  const [localMeta, setLocalMeta] = useState(null);
  const [customDecks, setCustomDecks] = useState([]);
  const [g, setG] = useState(null);
  const [sel, setSel] = useState(null);
  const [builder, setBuilder] = useState({ name: "Mon deck", leader: "L1", cards: {}, editIdx: null });
  const [bulk, setBulk] = useState("");
  const [saveMsg, setSaveMsg] = useState("");
  const logRef = useRef(null);
  useEffect(() => { logRef.current?.scrollTo(0, 1e6); }, [g?.log?.length]);
  useEffect(() => { if (g?.fx) { const t = setTimeout(() => setG((p) => p ? { ...p, fx: null } : p), 500); return () => clearTimeout(t); } }, [g?.fx]);
  const imgSrc = (id) => {
    const code = imgCfg.ext[id] || id;
    if (localImgs[code]) return localImgs[code];
    if (localImgs[id]) return localImgs[id];
    if (imgCfg.urls[id]) return imgCfg.urls[id];
    if (imgCfg.template && imgCfg.template.includes("{id}")) return imgCfg.template.replaceAll("{id}", code);
    return null;
  };
  const handleAssets = async (e) => {
    const files = Array.from(e.target.files || []);
    const imgs = {}; let meta = null;
    for (const f of files) {
      if (/cards\.json$/i.test(f.name)) { try { meta = JSON.parse(await f.text()); } catch (err) {} continue; }
      if (!/\.(webp|png|jpe?g|gif)$/i.test(f.name)) continue;
      const m = f.name.match(CARD_CODE_RE);
      if (m) imgs[m[1].toUpperCase()] = URL.createObjectURL(f);
    }
    setLocalImgs((prev) => ({ ...prev, ...imgs }));
    if (meta) setLocalMeta(meta);
    setSaveMsg(`✓ ${Object.keys(imgs).length} images importées${meta ? " + cards.json" : ""}`);
    setTimeout(() => setSaveMsg(""), 3000);
  };
  const autoMap = () => {
    const codes = shuffle(Object.keys(localImgs).filter((c) => !c.includes("_")));
    if (!codes.length) { setSaveMsg("⚠ Importe d'abord le dossier"); setTimeout(() => setSaveMsg(""), 2500); return; }
    const allIds = [...Object.keys(LEADERS), ...Object.keys(LEADERS).map((k) => k + "b"), ...POOL.map((c) => c.id)];
    const ext = { ...imgCfg.ext };
    allIds.forEach((id, i) => { ext[id] = codes[i % codes.length]; });
    persistImgs({ ...imgCfg, ext });
  };
  useEffect(() => { (async () => {
    try { const r = await window.storage.get("dbscg-imgcfg"); if (r) setImgCfg(JSON.parse(r.value)); } catch (e) {}
    try { const r = await window.storage.get("dbscg-decks"); if (r) setCustomDecks(JSON.parse(r.value)); } catch (e) {}
  })(); }, []);
  const persistImgs = async (next) => { setImgCfg(next); try { await window.storage.set("dbscg-imgcfg", JSON.stringify(next)); setSaveMsg("✓ Enregistré"); } catch (e) { setSaveMsg("⚠ Échec"); } setTimeout(() => setSaveMsg(""), 2000); };
  const persistDecks = async (next) => { setCustomDecks(next); try { await window.storage.set("dbscg-decks", JSON.stringify(next)); } catch (e) {} };
  const mut = (fn) => setG((prev) => { if (!prev || prev.winner) return prev; const s = clone(prev); fn(s); return s; });
  /* IA : tour normal */
  useEffect(() => {
    if (!g || g.winner || g.active !== "A" || g.combat || screen !== "GAME") return;
    const t = setTimeout(() => setG((prev) => {
      if (!prev || prev.winner || prev.combat || prev.active !== "A") return prev;
      const s = clone(prev); const ai = s.players.A;
      if (s.phase === "CHARGE") {
        if (ai.hand.length > 1 && ai.energy.length < 8) { const [c] = ai.hand.splice(ai.hand.length - 1, 1); ai.energy.push({ ...c, rested: false }); s.log.push("L'IA charge une énergie."); }
        s.phase = "MAIN"; return s;
      }
      const en = activeEnergy(ai);
      const pi = ai.hand.reduce((b, c, i) => {
        const ok = c.cost <= en && (c.type !== "EXTRA" || c.fx === "koRested" || (c.fx === "heal1" && ai.life.length < 6)) && (c.type === "EXTRA" || ai.battle.length < 6);
        return ok && (b < 0 || c.cost > ai.hand[b].cost) ? i : b;
      }, -1);
      if (pi >= 0) {
        const [c] = ai.hand.splice(pi, 1); pay(ai, c.cost);
        if (c.type === "EXTRA") { applyFx(s, "A", c); ai.drop.push(c); }
        else { ai.battle.push({ ...c, rested: false, turnPlayed: s.turnNo }); s.log.push(`L'IA invoque ${c.name}.`); applyFx(s, "A", c); }
        return s;
      }
      const ati = ai.battle.findIndex((b) => !b.rested && b.turnPlayed < s.turnNo);
      if (ati >= 0) { startCombat(s, "A", ati, "L"); return s; }
      if (!ai.leaderRested) { startCombat(s, "A", "L", "L"); return s; }
      s.log.push("L'IA termine son tour."); startTurn(s, "P"); return s;
    }), 750);
    return () => clearTimeout(t);
  }, [g, screen]);
  /* IA : combat + résolution CLASH */
  useEffect(() => {
    if (!g || !g.combat || g.winner || screen !== "GAME") return;
    const cb = g.combat;
    if (cb.step === "CLASH") {
      const t = setTimeout(() => mut((s) => resolveClash(s)), 2100);
      return () => clearTimeout(t);
    }
    const decider = cb.step === "COMBO" ? cb.comboTurn : other(cb.atkSide);
    if (decider !== "A") return;
    const t = setTimeout(() => mut((s) => {
      const c = s.combat; if (!c) return;
      const ai = s.players.A;
      if (c.step === "COUNTER") { doCounter(s, c.targetIdx === "L" && ai.life.length <= 2); return; }
      if (c.step === "BLOCK") {
        let pick = null;
        if (c.targetIdx === "L" && ai.life.length <= 5) {
          pick = ai.battle.reduce((b, x, i) => (x.kw?.includes("Blocker") && !x.rested && (b < 0 || x.power > ai.battle[b].power) ? i : b), -1);
          if (pick < 0) pick = null;
        }
        doBlock(s, pick); return;
      }
      if (c.step === "COMBO") {
        const tot = combatTotals(s);
        const aiIsAtk = c.atkSide === "A";
        const behind = aiIsAtk ? tot.atk < tot.def : (tot.def < tot.atk && (c.targetIdx !== "L" || ai.life.length <= 4));
        if (behind) {
          const hi = ai.hand.reduce((b, x, i) => (x.combo && (b < 0 || x.combo > ai.hand[b].combo) ? i : b), -1);
          if (hi >= 0) { doCombo(s, "A", hi); return; }
        }
        doCombo(s, "A", null);
      }
    }), 850);
    return () => clearTimeout(t);
  }, [g, screen]);
  const charge = (i) => mut((s) => { const p = s.players.P; const [c] = p.hand.splice(i, 1); p.energy.push({ ...c, rested: false }); s.phase = "MAIN"; s.log.push(`Tu charges ${c.name} en énergie.`); });
  const playCard = (i) => mut((s) => {
    const p = s.players.P; const c = p.hand[i];
    if (c.cost > activeEnergy(p) || (c.type === "EXTRA" && c.fx === "negate")) return;
    p.hand.splice(i, 1); pay(p, c.cost);
    if (c.type === "EXTRA") { applyFx(s, "P", c); p.drop.push(c); }
    else { p.battle.push({ ...c, rested: false, turnPlayed: s.turnNo }); s.log.push(`Tu invoques ${c.name}.`); applyFx(s, "P", c); }
  });
  const declareAttack = (targetIdx) => mut((s) => {
    const p = s.players.P;
    if (sel === "L") { if (p.leaderRested) return; }
    else { const b = p.battle[sel]; if (!b || b.rested || b.turnPlayed >= s.turnNo) return; }
    startCombat(s, "P", sel, targetIdx);
  });
  useEffect(() => { if (g?.combat) setSel(null); }, [g?.combat]);
  const endTurn = () => mut((s) => { s.log.push("Tu termines ton tour."); startTurn(s, "A"); });
  const startGame = (deck) => { const aiDeck = PREBUILT[Math.floor(Math.random() * PREBUILT.length)]; setG(freshGame(deck, aiDeck)); setSel(null); setScreen("GAME"); };
  /* Rendu carte (sans state interne → ok en closure) */
  const Card = ({ c, small, rested, onClick, selected, dim, badge }) => (
    <div onClick={onClick} className={`cd ${small ? "sm" : ""} ${rested ? "rest" : ""} ${selected ? "sel" : ""} ${dim ? "dim" : ""}`} style={{ "--h": c.hue ?? 200 }}>
      {imgSrc(c.id) ? <img src={imgSrc(c.id)} alt="" className="art" onError={(e) => { e.target.style.display = "none"; }} /> : <div className="art ph" />}
      <div className="nm">{c.name}</div>
      {c.cost != null && <div className="cost">{c.cost}</div>}
      {c.power != null && <div className="pw">{(c.power / 1000) | 0}K</div>}
      {c.combo > 0 && <div className="cb">+{(c.combo / 1000) | 0}K</div>}
      {c.kw?.length > 0 && <div className="kws">{c.kw.map((k) => (k === "Blocker" ? "🛡" : k === "Critical" ? "✸" : "⚔⚔")).join(" ")}</div>}
      {badge && <div className="bdg">{badge}</div>}
    </div>
  );
  const FighterCard = ({ id, hue, name }) => (
    <div className="cd fight" style={{ "--h": hue }}>
      {imgSrc(id) ? <img src={imgSrc(id)} alt="" className="art" onError={(e) => { e.target.style.display = "none"; }} /> : <div className="art ph" />}
      <div className="nm">{name}</div>
    </div>
  );
  const LeaderCard = ({ pl, side, onClick, selected, targetable }) => {
    const L = LEADERS[pl.leaderId];
    const key = pl.awakened ? pl.leaderId + "b" : pl.leaderId;
    return (
      <div onClick={onClick} className={`cd ldr ${pl.leaderRested ? "rest" : ""} ${selected ? "sel" : ""} ${targetable ? "tgt" : ""} ${pl.awakened ? "awk" : ""}`} style={{ "--h": L.hue }}>
        {imgSrc(key) ? <img src={imgSrc(key)} alt="" className="art" onError={(e) => { e.target.style.display = "none"; }} /> : <div className="art ph" />}
        <div className="nm">{leaderName(pl)}</div>
        <div className="pw">{(leaderPower(pl) / 1000) | 0}K</div>
        <div className="bdg">LEADER {side === "A" ? "IA" : ""}</div>
      </div>
    );
  };
  const Orbs = ({ n }) => <div className="orbs">{Array.from({ length: 8 }).map((_, i) => <span key={i} className={`orb ${i < n ? "on" : ""}`} />)}</div>;
  /* ════ MENU ════ */
  if (screen === "MENU") return (
    <div className="arena menu"><style>{CSS}</style>
      <div className="title">DBSCG <span>ARENA</span></div>
      <div className="subtitle">Choisis ton deck et entre dans l'arène</div>
      {Object.keys(localImgs).length > 0 && <div className="okline">✓ {Object.keys(localImgs).length} illustrations locales chargées</div>}
      <div className="glbl" style={{ marginTop: 8 }}>DECKS PRÉCONSTRUITS</div>
      {PREBUILT.map((d, i) => (
        <button key={i} className="deckrow" style={{ "--h": LEADERS[d.leader].hue }} onClick={() => startGame(d)}>
          <div className="dleader" style={{ "--h": LEADERS[d.leader].hue }}>{imgSrc(d.leader) ? <img src={imgSrc(d.leader)} alt="" onError={(e) => { e.target.style.display = "none"; }} /> : null}</div>
          <div className="dinfo"><div className="dname">{d.name}</div><div className="ddesc">{d.desc} · Leader : {LEADERS[d.leader].name}</div></div>
          <div className="dplay">JOUER ▶</div>
        </button>
      ))}
      <div className="glbl" style={{ marginTop: 10 }}>MES DECKS</div>
      {customDecks.length === 0 && <div className="empty">Aucun deck personnalisé — construis-en un !</div>}
      {customDecks.map((d, i) => (
        <div key={i} className="deckrow" style={{ "--h": LEADERS[d.leader].hue }}>
          <div className="dleader" style={{ "--h": LEADERS[d.leader].hue }}>{imgSrc(d.leader) ? <img src={imgSrc(d.leader)} alt="" onError={(e) => { e.target.style.display = "none"; }} /> : null}</div>
          <div className="dinfo" onClick={() => startGame(d)}><div className="dname">{d.name}</div><div className="ddesc">{deckSize(d.cards)} cartes · {LEADERS[d.leader].name}</div></div>
          <button className="mini" onClick={() => { setBuilder({ name: d.name, leader: d.leader, cards: { ...d.cards }, editIdx: i }); setScreen("BUILDER"); }}>✎</button>
          <button className="mini" onClick={() => persistDecks(customDecks.filter((_, x) => x !== i))}>✕</button>
          <button className="dplay" onClick={() => startGame(d)}>▶</button>
        </div>
      ))}
      <div className="menubtns">
        <button className="btn big" onClick={() => { setBuilder({ name: "Mon deck", leader: "L1", cards: {}, editIdx: null }); setScreen("BUILDER"); }}>🛠 Construire un deck</button>
        <button className="btn big" onClick={() => setScreen("IMAGES")}>🖼 Illustrations</button>
      </div>
    </div>
  );
  /* ════ IMAGES ════ */
  if (screen === "IMAGES") {
    const allIds = [...Object.keys(LEADERS), ...Object.keys(LEADERS).map((k) => k + "b"), ...POOL.map((c) => c.id)];
    const labelOf = (id) => LEADERS[id]?.name ?? (id.endsWith("b") && LEADERS[id.slice(0, -1)] ? LEADERS[id.slice(0, -1)].name + " (Éveillé)" : byId(id)?.name ?? id);
    const codes = Object.keys(localImgs);
    return (
      <div className="arena menu"><style>{CSS}</style>
        <div className="topbar"><button className="btn" onClick={() => setScreen("MENU")}>← Menu</button><div className="ptitle">🖼 Illustrations (privé)</div>{saveMsg && <span className="psub">{saveMsg}</span>}</div>
        <div className="grp box">
          <div className="glbl">A · IMPORT LOCAL — dossier dbscg_assets du script Python</div>
          <input type="file" multiple webkitdirectory="" className="inp" onChange={handleAssets} />
          <input type="file" multiple accept=".webp,.png,.jpg,.jpeg,.json" className="inp" onChange={handleAssets} />
          <div className="psub">{codes.length ? `✓ ${codes.length} images chargées${localMeta ? " · cards.json OK" : ""}` : "Sélectionne le contenu de dbscg_assets/ (cards/ + cards.json)."}</div>
          {codes.length > 0 && <button className="btn on" onClick={autoMap}>🔀 Auto-mapper les cartes du jeu</button>}
          <div className="psub">ℹ️ Import valable pour la session. Le mapping des codes est, lui, sauvegardé.</div>
        </div>
        <div className="grp box">
          <div className="glbl">B · MODÈLE D'URL — persistant</div>
          <div className="psub"><code>cd dbscg_assets &amp;&amp; python -m http.server 8000</code></div>
          <input className="inp" value={imgCfg.template} onChange={(e) => setImgCfg({ ...imgCfg, template: e.target.value })} placeholder="http://localhost:8000/cards/{id}.webp" />
        </div>
        <div className="grp box"><div className="glbl">C · IMPORT JSON (id → URL)</div>
          <textarea className="ta" value={bulk} onChange={(e) => setBulk(e.target.value)} placeholder='{"D1":"https://..."}' />
          <button className="btn" onClick={() => { try { persistImgs({ ...imgCfg, urls: { ...imgCfg.urls, ...JSON.parse(bulk) } }); setBulk(""); } catch (err) { setSaveMsg("⚠ JSON invalide"); setTimeout(() => setSaveMsg(""), 2000); } }}>Importer</button>
        </div>
        <div className="glbl">D · MAPPING PAR CARTE</div>
        <div className="imgrid">
          {allIds.map((id) => (
            <div key={id} className="imrow">
              <div className="imthumb" style={{ "--h": (LEADERS[id] ?? LEADERS[id.slice(0, -1)] ?? byId(id))?.hue ?? 200 }}>{imgSrc(id) ? <img src={imgSrc(id)} alt="" onError={(e) => { e.target.style.display = "none"; }} /> : null}</div>
              <div className="iminfo">
                <div className="imname">{labelOf(id)} <span className="imid">{id}</span></div>
                <div className="imins">
                  <input className="inp xs" list="codelist" value={imgCfg.ext[id] ?? ""} placeholder="Code ext. (FB01-001)" onChange={(e) => setImgCfg({ ...imgCfg, ext: { ...imgCfg.ext, [id]: e.target.value.toUpperCase() } })} />
                  <input className="inp xs" value={imgCfg.urls[id] ?? ""} placeholder="URL directe (surcharge)" onChange={(e) => setImgCfg({ ...imgCfg, urls: { ...imgCfg.urls, [id]: e.target.value } })} />
                </div>
              </div>
            </div>
          ))}
        </div>
        <datalist id="codelist">{codes.slice(0, 400).map((c) => <option key={c} value={c} />)}</datalist>
        <button className="btn end big" onClick={() => persistImgs(imgCfg)}>💾 Enregistrer tout</button>
      </div>
    );
  }
  /* ════ BUILDER ════ */
  if (screen === "BUILDER") {
    const total = deckSize(builder.cards);
    const valid = total >= 50 && total <= 60;
    const saveDeck = () => {
      const d = { name: builder.name || "Sans nom", leader: builder.leader, cards: { ...builder.cards } };
      const next = builder.editIdx != null ? customDecks.map((x, i) => (i === builder.editIdx ? d : x)) : [...customDecks, d];
      persistDecks(next); setScreen("MENU");
    };
    return (
      <div className="arena menu"><style>{CSS}</style>
        <div className="topbar"><button className="btn" onClick={() => setScreen("MENU")}>← Menu</button><div className="ptitle">🛠 Deck Builder</div></div>
        <input className="inp" value={builder.name} onChange={(e) => setBuilder({ ...builder, name: e.target.value })} placeholder="Nom du deck" />
        <div className="grp"><div className="glbl">LEADER</div>
          <div className="combos">{Object.values(LEADERS).map((L) => (
            <button key={L.id} className={`btn ${builder.leader === L.id ? "on" : ""}`} onClick={() => setBuilder({ ...builder, leader: L.id })}>{L.name}</button>
          ))}</div>
          <div className="psub">{LEADERS[builder.leader].awTxt}</div>
        </div>
        <div className="grp"><div className="glbl">CARTES — {total}/50 à 60 · max 4 copies</div>
          {POOL.map((c) => {
            const n = builder.cards[c.id] || 0;
            return (
              <div key={c.id} className="brow" style={{ "--h": c.hue }}>
                <div className="imthumb" style={{ "--h": c.hue }}>{imgSrc(c.id) ? <img src={imgSrc(c.id)} alt="" onError={(e) => { e.target.style.display = "none"; }} /> : null}</div>
                <div className="binfo">
                  <div className="bname">{c.name} <span className="imid">{c.type === "EXTRA" ? "EXTRA" : `${(c.power / 1000) | 0}K`}{c.combo ? ` · +${(c.combo / 1000) | 0}K` : ""}</span></div>
                  <div className="bsub">Coût {c.cost}{c.kw?.length ? " · " + c.kw.join(", ") : ""}{c.fx ? " · " + FX_TXT[c.fx] : ""}</div>
                </div>
                <button className="mini" onClick={() => n > 0 && setBuilder({ ...builder, cards: { ...builder.cards, [c.id]: n - 1 } })}>−</button>
                <div className="bcount">{n}</div>
                <button className="mini" onClick={() => n < 4 && total < 60 && setBuilder({ ...builder, cards: { ...builder.cards, [c.id]: n + 1 } })}>+</button>
              </div>
            );
          })}
        </div>
        <div className="menubtns">
          <button className="btn big" disabled={total === 0} onClick={saveDeck}>💾 Enregistrer</button>
          <button className="btn end big" disabled={!valid} onClick={() => { saveDeck(); startGame({ name: builder.name, leader: builder.leader, cards: builder.cards }); }}>{valid ? "▶ Jouer" : `Encore ${Math.max(0, 50 - total)}`}</button>
        </div>
      </div>
    );
  }
  /* ════ JEU ════ */
  const P = g.players.P, A = g.players.A;
  const isP = g.active === "P" && !g.winner && !g.combat;
  const cb = g.combat;
  const totals = cb ? combatTotals(g) : null;
  const verdict = cb?.step === "CLASH" ? clashVerdict(g) : null;
  const decider = cb && cb.step !== "CLASH" ? (cb.step === "COMBO" ? cb.comboTurn : other(cb.atkSide)) : null;
  const STEPS = ["COUNTER", "BLOCK", "COMBO", "CLASH"];
  const STEP_FR = { COUNTER: "CONTRE", BLOCK: "BLOCK", COMBO: "COMBO", CLASH: "CLASH" };
  return (
    <div className={`arena ${g.fx === "shake" ? "shake" : ""}`}><style>{CSS}</style>
      <div className="row top">
        <div className="pstats"><div className="pname">ADVERSAIRE</div><Orbs n={A.life.length} /><div className="meta">🖐 {A.hand.length} · 🎴 {A.deck.length} · ⚡ {activeEnergy(A)}/{A.energy.length}</div></div>
        <LeaderCard pl={A} side="A" targetable={isP && sel != null} onClick={() => isP && sel != null && declareAttack("L")} />
      </div>
      <div className="zone">
        {A.battle.map((b, i) => (<Card key={i} c={b} small rested={b.rested} dim={!(isP && sel != null && b.rested)} onClick={() => isP && sel != null && b.rested && declareAttack(i)} />))}
        {!A.battle.length && <div className="empty">Aucune Battle Card adverse</div>}
      </div>
      <div className="scan"><div className="scanline" /><div className="log" ref={logRef}>{g.log.slice(-30).map((l, i) => <div key={i}>{l}</div>)}</div></div>
      <div className="zone">
        {P.battle.map((b, i) => (<Card key={i} c={b} small rested={b.rested} selected={sel === i} badge={b.turnPlayed >= g.turnNo ? "Zzz" : null}
          onClick={() => { if (isP && g.phase === "MAIN" && !b.rested && b.turnPlayed < g.turnNo) setSel(sel === i ? null : i); }} />))}
        {!P.battle.length && <div className="empty">Invoque des Battle Cards depuis ta main</div>}
      </div>
      <div className="row bot">
        <LeaderCard pl={P} side="P" selected={sel === "L"} onClick={() => { if (isP && g.phase === "MAIN" && !P.leaderRested) setSel(sel === "L" ? null : "L"); }} />
        <div className="pstats"><div className="pname">TOI</div><Orbs n={P.life.length} /><div className="meta">🎴 {P.deck.length} · ⚡ {activeEnergy(P)}/{P.energy.length}</div>
          {!P.awakened && P.life.length <= 4 && !g.winner && <button className="btn awkbtn" onClick={() => mut((s) => awakenSide(s, "P"))}>⚡ ÉVEIL</button>}
        </div>
      </div>
      <div className="phasebar">
        {g.winner ? (<><span className="ph-t">{g.winner === "P" ? "🏆 VICTOIRE" : "💀 DÉFAITE"}</span><button className="btn" onClick={() => setScreen("MENU")}>Menu</button></>)
        : cb ? (<span className="ph-t">⚔️ COMBAT — étape : {STEP_FR[cb.step]}</span>)
        : !isP ? (<span className="ph-t">Tour de l'IA…</span>)
        : g.phase === "CHARGE" ? (<><span className="ph-t">CHARGE — touche une carte pour la mettre en énergie</span><button className="btn" onClick={() => mut((s) => { s.phase = "MAIN"; })}>Passer</button></>)
        : (<><span className="ph-t">{sel != null ? "Cible : Leader IA ou carte au repos" : "MAIN — joue, attaque, ou finis"}</span>
            {sel != null && <button className="btn" onClick={() => setSel(null)}>Annuler</button>}
            <button className="btn end" onClick={endTurn}>Fin de tour</button></>)}
      </div>
      <div className="hand">
        {P.hand.map((c, i) => {
          const playable = isP && (g.phase === "CHARGE" || (g.phase === "MAIN" && c.cost <= activeEnergy(P) && c.fx !== "negate"));
          return <Card key={i} c={c} dim={!playable && g.phase !== "CHARGE"} onClick={() => { if (!isP) return; if (g.phase === "CHARGE") charge(i); else if (g.phase === "MAIN") playCard(i); }} />;
        })}
      </div>
      {cb && (
        <div className={`overlay combatbg ${cb.step === "CLASH" ? "clashing" : ""}`}>
          <div className="combatwrap">
            <div className="steps">
              {STEPS.map((st) => <div key={st} className={`stepchip ${cb.step === st ? "on" : ""}`}>{STEP_FR[st]}</div>)}
            </div>
            <div className="duel">
              <div className={`side atk ${cb.atkSide === "P" ? "mine" : ""}`}>
                <div className="sidelbl">{cb.atkSide === "P" ? "TON ATTAQUE" : "ATTAQUE ADVERSE"}</div>
                <FighterCard id={cb.atkId} hue={cb.atkHue} name={cb.atkName} />
                <div className="bigpow atkp"><CountUp to={totals.atk} /></div>
                <div className="kwchips">
                  {cb.crit && <span className="chip crit">CRITICAL</span>}
                  {cb.dbl && <span className="chip crit">DOUBLE STRIKE</span>}
                </div>
                <div className="combostack">
                  {cb.atkCombos.map((c, i) => <div key={i} className="combomini" style={{ "--h": c.hue }}>+{(c.combo / 1000) | 0}K</div>)}
                </div>
              </div>
              <div className="vs">VS</div>
              <div className={`side def ${cb.atkSide === "A" ? "mine" : ""}`}>
                <div className="sidelbl">{cb.atkSide === "A" ? "TA DÉFENSE" : "DÉFENSE ADVERSE"}</div>
                <FighterCard id={totals.defId} hue={totals.defHue} name={totals.defName} />
                <div className="bigpow defp"><CountUp to={totals.def} /></div>
                <div className="combostack">
                  {cb.defCombos.map((c, i) => <div key={i} className="combomini" style={{ "--h": c.hue }}>+{(c.combo / 1000) | 0}K</div>)}
                </div>
              </div>
            </div>
            {verdict && <div className={`verdict ${verdict.cls}`}>{verdict.txt}</div>}
            <div className="combatactions">
              {cb.step === "CLASH" ? (
                <div className="aithink">Résolution du combat…</div>
              ) : decider === "A" ? (
                <div className="aithink">L'adversaire réfléchit<span className="dots"><i>.</i><i>.</i><i>.</i></span></div>
              ) : cb.step === "COUNTER" ? (
                <>
                  <div className="actlbl">🛡 Fenêtre de CONTRE — à toi de réagir</div>
                  <div className="combos">
                    {canCounter(P) && <button className="btn neg" onClick={() => mut((s) => doCounter(s, true))}>🛡 Barrière (1⚡) — Annuler</button>}
                    <button className="btn" onClick={() => mut((s) => doCounter(s, false))}>Ne pas contrer ▶</button>
                  </div>
                </>
              ) : cb.step === "BLOCK" ? (
                <>
                  <div className="actlbl">🛡 Étape de BLOCK — intercepter ?</div>
                  <div className="combos">
                    {P.battle.map((b, i) => b.kw?.includes("Blocker") && !b.rested ? (
                      <button key={i} className="btn neg" onClick={() => mut((s) => doBlock(s, i))}>🛡 {b.name} ({(b.power / 1000) | 0}K)</button>) : null)}
                    <button className="btn" onClick={() => mut((s) => doBlock(s, null))}>Ne pas bloquer ▶</button>
                  </div>
                </>
              ) : (
                <>
                  <div className="actlbl">🔥 COMBO — joue une carte ou passe ({cb.comboTurn === cb.atkSide ? "côté attaque" : "côté défense"})</div>
                  <div className="combos">
                    {P.hand.map((c, i) => c.combo ? (
                      <button key={i} className="btn comboBtn" style={{ "--h": c.hue }} onClick={() => mut((s) => doCombo(s, "P", i))}>+{(c.combo / 1000) | 0}K {c.name}</button>) : null)}
                    <button className="btn end" onClick={() => mut((s) => doCombo(s, "P", null))}>Passer ▶</button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
      {g.winner && (
        <div className="overlay"><div className="panel center">
          <div className="bigend">{g.winner === "P" ? "🏆 VICTOIRE" : "💀 DÉFAITE"}</div>
          <div className="combos"><button className="btn end" onClick={() => setScreen("MENU")}>Menu</button></div>
        </div></div>
      )}
    </div>
  );
}
const CSS = `
*{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
.arena{min-height:100vh;background:radial-gradient(1200px 600px at 50% -10%,#1a2342 0%,#0a0e1c 55%,#070a14 100%);color:#e9ecf5;font-family:ui-sans-serif,system-ui,-apple-system,sans-serif;display:flex;flex-direction:column;padding:10px 8px 14px;gap:8px;max-width:560px;margin:0 auto}
.arena.shake{animation:shake .45s}
@keyframes shake{0%,100%{transform:none}20%{transform:translate(-6px,2px)}40%{transform:translate(5px,-3px)}60%{transform:translate(-4px,-2px)}80%{transform:translate(3px,2px)}}
.menu{gap:10px}
.title{font-size:34px;font-weight:900;letter-spacing:.14em;text-align:center;margin-top:18px;font-style:italic}
.title span{color:#ff8a00;text-shadow:0 0 18px #ff8a0088}
.subtitle{text-align:center;color:#8a93b8;font-size:12px;margin-bottom:6px}
.okline{text-align:center;color:#7fd49a;font-size:11px;font-weight:700}
.topbar{display:flex;align-items:center;gap:10px}
.box{background:#0c1124aa;border:1px solid #26315a;border-radius:12px;padding:11px}
code{background:#070a14;border:1px solid #26315a;border-radius:4px;padding:1px 5px;font-size:10.5px;color:#19c2ff}
.deckrow{display:flex;align-items:center;gap:10px;background:linear-gradient(120deg,hsl(var(--h) 45% 16%),#10152a 70%);border:1px solid hsl(var(--h) 55% 40% / .6);border-radius:12px;padding:9px 10px;color:#e9ecf5;text-align:left;cursor:pointer;width:100%}
.dleader{width:42px;height:58px;border-radius:6px;background:radial-gradient(30px 30px at 50% 35%,hsl(var(--h) 75% 55% / .6),#0d1226);overflow:hidden;flex:0 0 auto;border:1px solid hsl(var(--h) 55% 45% / .7)}
.dleader img{width:100%;height:100%;object-fit:cover}
.dinfo{flex:1;min-width:0}
.dname{font-weight:900;font-size:14px;letter-spacing:.03em}
.ddesc{font-size:10.5px;color:#aab2d0;margin-top:2px}
.dplay{font-size:11px;font-weight:900;color:#ff8a00;letter-spacing:.08em;background:none;border:none;cursor:pointer}
.mini{background:#1c2440;border:1px solid #3a4778;color:#e9ecf5;border-radius:7px;width:30px;height:30px;font-weight:900;cursor:pointer;flex:0 0 auto}
.menubtns{display:flex;gap:8px;margin-top:8px}
.btn.big{flex:1;padding:13px;font-size:13px}
.inp{background:#0c1124;border:1px solid #3a4778;color:#e9ecf5;border-radius:8px;padding:9px 10px;font-size:12.5px;width:100%}
.inp.xs{font-size:11px;padding:7px 8px}
.ta{background:#0c1124;border:1px solid #3a4778;color:#e9ecf5;border-radius:8px;padding:9px 10px;font-size:11px;width:100%;min-height:60px;font-family:ui-monospace,monospace}
.imgrid{display:flex;flex-direction:column;gap:8px}
.imrow{display:flex;gap:9px;align-items:flex-start}
.imthumb{width:38px;height:52px;border-radius:5px;background:radial-gradient(26px 26px at 50% 35%,hsl(var(--h) 75% 55% / .55),#0d1226);border:1px solid hsl(var(--h) 55% 45% / .6);overflow:hidden;flex:0 0 auto}
.imthumb img{width:100%;height:100%;object-fit:cover}
.iminfo{flex:1;min-width:0}
.imname{font-size:11.5px;font-weight:800;margin-bottom:3px}
.imid{color:#5b6488;font-weight:600;font-size:10px}
.imins{display:flex;gap:6px;flex-direction:column}
.brow{display:flex;align-items:center;gap:8px;background:#10152acc;border:1px solid hsl(var(--h) 50% 35% / .45);border-radius:10px;padding:6px 8px}
.binfo{flex:1;min-width:0}
.bname{font-size:12px;font-weight:800}
.bsub{font-size:10px;color:#8a93b8;margin-top:1px}
.bcount{width:22px;text-align:center;font-weight:900;font-size:14px;color:#ff8a00}
.row{display:flex;align-items:center;gap:12px}
.row.top{justify-content:space-between}
.row.bot{justify-content:space-between;flex-direction:row-reverse}
.pname{font-weight:800;letter-spacing:.22em;font-size:11px;color:#8a93b8}
.meta{font-size:11px;color:#aab2d0;margin-top:4px}
.orbs{display:flex;gap:3px;margin-top:4px}
.orb{width:13px;height:13px;border-radius:50%;background:#1c2440;border:1px solid #2c3760}
.orb.on{background:radial-gradient(circle at 35% 30%,#ffd28a,#ff8a00 55%,#a34a00);box-shadow:0 0 8px #ff8a0088;border-color:#ff8a00}
.zone{display:flex;gap:6px;overflow-x:auto;min-height:96px;padding:4px 2px;align-items:center}
.empty{font-size:11px;color:#5b6488;font-style:italic;padding:4px 6px}
.cd{position:relative;flex:0 0 auto;width:78px;height:108px;border-radius:9px;border:1px solid hsl(var(--h) 60% 45% / .7);background:linear-gradient(165deg,hsl(var(--h) 45% 22%),#10152a 70%);overflow:hidden;transition:transform .15s,box-shadow .15s;cursor:pointer;user-select:none}
.cd.sm{width:64px;height:90px}
.cd.ldr{width:86px;height:118px;border-width:2px}
.cd.fight{width:104px;height:144px;border-width:2px;cursor:default}
.cd.awk{box-shadow:0 0 14px #ff8a0099;border-color:#ff8a00}
.cd.rest{transform:rotate(90deg) scale(.82);opacity:.85;margin:0 10px}
.cd.sel{box-shadow:0 0 0 2px #ff8a00,0 0 16px #ff8a0088;transform:translateY(-6px)}
.cd.tgt{box-shadow:0 0 0 2px #e8442e,0 0 16px #e8442e88}
.cd.dim{opacity:.45}
.art{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
.art.ph{background:radial-gradient(80px 80px at 50% 32%,hsl(var(--h) 75% 55% / .55),transparent 70%),repeating-linear-gradient(45deg,transparent 0 8px,hsl(var(--h) 50% 30% / .15) 8px 9px)}
.nm{position:absolute;bottom:16px;left:0;right:0;padding:2px 4px;font-size:8.5px;font-weight:700;line-height:1.1;text-align:center;background:linear-gradient(transparent,#000c)}
.cd.fight .nm{bottom:0;font-size:9.5px;padding:4px}
.cost{position:absolute;top:3px;left:3px;width:18px;height:18px;border-radius:50%;background:radial-gradient(circle at 35% 30%,#ffd28a,#ff8a00 60%,#a34a00);color:#1a0e00;font-weight:900;font-size:11px;display:flex;align-items:center;justify-content:center}
.pw{position:absolute;bottom:2px;left:4px;font-size:11px;font-weight:900;font-style:italic;color:#fff;text-shadow:0 0 6px hsl(var(--h) 90% 60%)}
.cb{position:absolute;bottom:2px;right:4px;font-size:9px;font-weight:800;color:#19c2ff}
.kws{position:absolute;top:3px;right:4px;font-size:10px}
.bdg{position:absolute;top:24px;left:0;right:0;text-align:center;font-size:8px;font-weight:800;letter-spacing:.18em;color:#ff8a00;text-shadow:0 0 6px #000}
.scan{position:relative;border:1px solid #26315a;border-radius:10px;background:#0c1124cc;overflow:hidden}
.scanline{position:absolute;inset:0;background:repeating-linear-gradient(0deg,transparent 0 3px,#1a234233 3px 4px);pointer-events:none}
.log{height:80px;overflow-y:auto;padding:8px 12px;font-size:11.5px;line-height:1.55;color:#bfc7e6;font-family:ui-monospace,monospace}
.log div:last-child{color:#fff;font-weight:700}
.phasebar{display:flex;align-items:center;gap:8px;background:#10152a;border:1px solid #26315a;border-radius:10px;padding:8px 10px;min-height:46px}
.ph-t{flex:1;font-size:11.5px;font-weight:700;letter-spacing:.04em;color:#dfe5ff}
.btn{background:#1c2440;border:1px solid #3a4778;color:#e9ecf5;border-radius:8px;padding:8px 12px;font-size:11.5px;font-weight:800;cursor:pointer;letter-spacing:.03em}
.btn:disabled{opacity:.4}
.btn.end{background:linear-gradient(160deg,#e8442e,#a31f10);border-color:#ff7b66}
.btn.on{background:#ff8a00;color:#1a0e00;border-color:#ffd28a}
.btn.neg{background:linear-gradient(160deg,#19c2ff,#0e5fa8);border-color:#7fdcff}
.btn.comboBtn{background:linear-gradient(160deg,hsl(var(--h) 60% 35%),hsl(var(--h) 60% 20%));border-color:hsl(var(--h) 70% 55%)}
.btn.awkbtn{margin-top:6px;background:linear-gradient(160deg,#ff8a00,#a34a00);color:#1a0e00;border-color:#ffd28a;animation:pulse 1.2s infinite}
@keyframes pulse{0%,100%{box-shadow:0 0 0 0 #ff8a0066}50%{box-shadow:0 0 0 8px transparent}}
.hand{display:flex;gap:7px;overflow-x:auto;padding:6px 2px 2px;min-height:118px}
.overlay{position:fixed;inset:0;background:#05070fd9;display:flex;align-items:flex-end;justify-content:center;z-index:50;padding:14px}
.panel{width:100%;max-width:520px;background:#10152a;border:1px solid #3a4778;border-radius:14px;padding:14px;display:flex;flex-direction:column;gap:10px;max-height:80vh;overflow-y:auto}
.panel.center{align-items:center;text-align:center;margin:auto}
.ptitle{font-weight:900;font-size:14px;letter-spacing:.04em}
.psub{font-size:12px;color:#aab2d0;line-height:1.45}
.grp{display:flex;flex-direction:column;gap:6px}
.glbl{font-size:10px;font-weight:800;letter-spacing:.18em;color:#8a93b8}
.combos{display:flex;flex-wrap:wrap;gap:6px;justify-content:center}
.bigend{font-size:30px;font-weight:900;letter-spacing:.08em;text-shadow:0 0 24px #ff8a0088;padding:10px 0}
.combatbg{align-items:center;background:linear-gradient(115deg,#3a0a0acc 0%,#05070ff2 38%,#05070ff2 62%,#062338cc 100%),#05070f}
.combatbg.clashing{animation:flashbg .5s}
@keyframes flashbg{0%{filter:brightness(2.2)}100%{filter:brightness(1)}}
.combatwrap{width:100%;max-width:520px;display:flex;flex-direction:column;gap:14px;align-items:stretch}
.steps{display:flex;gap:6px;justify-content:center}
.stepchip{font-size:10px;font-weight:900;letter-spacing:.16em;padding:6px 10px;border-radius:999px;border:1px solid #2c3760;color:#5b6488;background:#0c1124}
.stepchip.on{color:#1a0e00;background:linear-gradient(160deg,#ffd28a,#ff8a00);border-color:#ffd28a;box-shadow:0 0 14px #ff8a0077}
.duel{display:flex;align-items:flex-start;justify-content:center;gap:10px}
.side{display:flex;flex-direction:column;align-items:center;gap:6px;flex:1;min-width:0}
.sidelbl{font-size:9px;font-weight:900;letter-spacing:.18em;color:#8a93b8}
.side.atk .sidelbl{color:#ff9b7a}
.side.def .sidelbl{color:#7fdcff}
.bigpow{font-size:30px;font-weight:900;font-style:italic;letter-spacing:.02em;line-height:1}
.bigpow.atkp{color:#ff8a00;text-shadow:0 0 16px #ff8a0099}
.bigpow.defp{color:#19c2ff;text-shadow:0 0 16px #19c2ff99}
.vs{font-size:26px;font-weight:900;font-style:italic;color:#fff;text-shadow:0 0 18px #ff8a00;align-self:center;padding-top:48px}
.kwchips{display:flex;gap:4px;flex-wrap:wrap;justify-content:center;min-height:16px}
.chip{font-size:8.5px;font-weight:900;letter-spacing:.1em;padding:3px 7px;border-radius:999px}
.chip.crit{background:#e8442e;color:#fff;box-shadow:0 0 10px #e8442e88}
.combostack{display:flex;gap:4px;flex-wrap:wrap;justify-content:center;min-height:22px}
.combomini{font-size:9.5px;font-weight:900;padding:3px 7px;border-radius:6px;background:linear-gradient(160deg,hsl(var(--h) 60% 35%),hsl(var(--h) 60% 18%));border:1px solid hsl(var(--h) 70% 55%);color:#fff}
.verdict{text-align:center;font-size:24px;font-weight:900;font-style:italic;letter-spacing:.06em;animation:verdictIn .55s .55s both}
.verdict.crit{color:#ff4d2e;text-shadow:0 0 22px #ff4d2e}
.verdict.hit{color:#ff8a00;text-shadow:0 0 22px #ff8a00}
.verdict.guard{color:#19c2ff;text-shadow:0 0 22px #19c2ff}
.verdict.neg{color:#7fdcff;text-shadow:0 0 22px #19c2ff}
@keyframes verdictIn{0%{opacity:0;transform:scale(2.4)}60%{opacity:1;transform:scale(.92)}100%{opacity:1;transform:scale(1)}}
.combatactions{background:#10152acc;border:1px solid #2c3760;border-radius:14px;padding:12px;display:flex;flex-direction:column;gap:9px;min-height:74px;justify-content:center}
.actlbl{font-size:11px;font-weight:800;text-align:center;color:#dfe5ff;letter-spacing:.04em}
.aithink{text-align:center;font-size:12px;color:#8a93b8;font-weight:700}
.dots i{animation:blink 1.2s infinite;font-style:normal}
.dots i:nth-child(2){animation-delay:.2s}.dots i:nth-child(3){animation-delay:.4s}
@keyframes blink{0%,100%{opacity:.2}50%{opacity:1}}
@media (prefers-reduced-motion: reduce){.cd,.btn.awkbtn,.arena.shake,.verdict,.combatbg.clashing{transition:none;animation:none}}
`;
