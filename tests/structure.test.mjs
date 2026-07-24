import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import {fileURLToPath} from "node:url";

const here=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(here,"..");
const code=fs.readFileSync(path.join(root,"app.js"),"utf8");
const sandbox={console,Date,Math,setTimeout,clearTimeout,window:{},globalThis:{}};
vm.createContext(sandbox);
vm.runInContext(code,sandbox);
const G=sandbox.window.PlayerLife;

assert.ok(G,"PlayerLife engine should be exported");
assert.equal(G.TALENTS.length,20,"exactly 20 football talents");
assert.equal(new Set(G.TALENTS.map(x=>x.id)).size,20,"talent ids are unique");
assert.ok(G.EVENTS.length>=24,"two-month event pool should resist repetition");
assert.ok(G.ACTIONS.length>=12,"a compact but complete action set across phases");
assert.equal(G.CSL_CLUBS.length,16,"2026 CSL club set");
assert.equal(G.PL_CLUBS.length,20,"2026/27 Premier League club set");
assert.ok(G.CSL_CLUBS.some(x=>x.name==="重庆铜梁龙"));
assert.ok(G.PL_CLUBS.some(x=>x.name==="Manchester United"));

const allocation={height:4,speed:4,burst:4,stamina:4,will:4};
const state=G.createInitialState("测试前锋",allocation,G.TALENTS.slice(0,3).map(x=>x.id));
assert.equal(Object.values(state.allocation).reduce((a,b)=>a+b,0),20);
assert.equal(state.actionPoints,3);
assert.equal(state.position,"前锋");
assert.equal(G.ageInfo(state).age,14);
assert.equal(state.relationship.status,"恋人");
assert.ok(Number.isFinite(state.skills.finishing),"shooting is a real technical attribute");
assert.ok(Number.isFinite(state.skills.setPiece),"set pieces are a real technical attribute");
assert.equal("clutch" in state.skills,false,"key moments are derived rather than a separate attribute");
const finishingBefore=state.skills.finishing;
G.ACTIONS.find(x=>x.id==="train_tech").run(state);
assert.ok(state.skills.finishing>finishingBefore,"technical training increases finishing");
const setPieceBefore=state.skills.setPiece;
G.ACTIONS.find(x=>x.id==="train_tech").run(state);
assert.ok(state.skills.setPiece>setPieceBefore,"technical training increases set-piece ability");

const seen=[];
for(let i=0;i<6;i++){
  const e=G.chooseRandomEvent(state,()=>.13+i*.1);
  assert.ok(e,"eligible academy event expected");
  seen.push(e.id);
}
assert.equal(new Set(seen).size,seen.length,"recent random events should not repeat");

const elite=G.createInitialState("精英",allocation,["scout_magnet","big_heart","box_instinct"]);
Object.keys(elite.stats).forEach(k=>elite.stats[k]=88);
Object.keys(elite.skills).forEach(k=>elite.skills[k]=88);
elite.scout=60;elite.totalMonth=24;
const branch=G.routeChoice16(elite);
assert.equal(branch.options.length,3,"elite 16-year-old gets three hard routes");
assert.ok(branch.options.some(x=>x.text.includes("Manchester United")));
G.setRoute(elite,"overseas");
assert.equal(elite.relationship.status,"异地","overseas route keeps the relationship as long-distance instead of forcing a breakup");
assert.equal(elite.club.league,"英超梯队");

elite.totalMonth=48;elite.language=60;G.enterProAt18(elite);
assert.equal(elite.flags.pro18,true);
assert.equal(elite.club.league,"英超");
assert.ok(elite.offers.length>0,"transfer market opens at 18");
elite.seasonStats={matches:8,goals:10,assists:4,wins:5,ratingTotal:58,trophies:0};
assert.equal(G.nationalSelectionCheck(elite),true,"elite in-form player receives national call");

const late=G.createInitialState("校园前锋",allocation,["childhood_bond","football_iq","engine"]);
late.totalMonth=24;
assert.equal(G.routeChoice16(late).options.length,1,"low evaluation still has a valid campus route");
G.setRoute(late,"campus");
assert.equal(late.relationship.status,"恋人");
late.totalMonth=48;G.enterProAt18(late);
assert.equal(late.flags.pro18,true,"campus route re-enters professional loop at 18");
assert.equal(late.club.league,"中超");

function seeded(seed){let x=seed>>>0;return()=>((x=(x*1664525+1013904223)>>>0)/4294967296)}
const reports=[];
for(let i=0;i<40;i++)reports.push(G.simulateMatchCore(elite,seeded(i+1)));
assert.ok(new Set(reports.map(x=>`${x.gf}-${x.ga}`)).size>4,"match results retain random variance");
assert.ok(reports.some(x=>x.role==="首发")&&reports.some(x=>x.role!=="首发"),"selection is probabilistic");
reports.forEach(r=>assert.ok(r.model.ability&&r.model.condition&&r.model.random));

elite.seasonStats={matches:20,goals:38,assists:13,wins:15,ratingTotal:158,trophies:2};
const award=G.seasonAwardCheck(elite,()=>.5);
assert.equal(award.ballon,true,"world-class season can win Ballon d'Or");

const wc=G.simulateWorldCup(elite,seeded(42));
assert.ok(wc.results.length>=3&&wc.results.length<=7);
assert.ok(typeof wc.champion==="boolean");

for(const file of ["index.html","style.css","app.js","assets/player.webp","assets/lin-xiaoman.webp","assets/father.webp","assets/coach-zhou.webp"]){
  assert.ok(fs.existsSync(path.join(root,file)),`${file} should exist`);
}
const html=fs.readFileSync(path.join(root,"index.html"),"utf8");
assert.match(html,/id="attributeAllocator"/);
assert.match(html,/data-tab="transfer"/);
assert.match(html,/data-tab="national"/);
assert.match(html,/小满关系/,"relationship status should be labeled clearly");
assert.match(code,/assets\/lin-xiaoman\.webp/);
assert.match(code,/这个月你想怎么过/);
assert.ok(!code.includes("拿什么"+"换未来"));
assert.match(code,/关键球”不设单独数值/,"derived key-moment mechanic should be explained");

console.log("模拟球员 architecture test passed");
