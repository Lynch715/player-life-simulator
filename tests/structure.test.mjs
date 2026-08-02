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

const ATTR_KEYS=["PAC","SHO","PAS","DRI","DEF","PHY","WIL"];

// 天赋 tag 必须指向真实属性，否则 gain() 里的加成永远不会触发
const TAG_WHITELIST=new Set([...ATTR_KEYS,"injury","fitness","goal","clutch","team","tactics","language","overseas","love","header","training","scout","money","media","transfer","recovery","sub","home","fame","national","final","coach"]);
G.TALENTS.forEach(t=>t.tags.forEach(tag=>
  assert.ok(TAG_WHITELIST.has(tag),`talent ${t.id} has unknown tag "${tag}"`)));
const attrTagged=G.TALENTS.filter(t=>t.tags.some(x=>ATTR_KEYS.includes(x)));
assert.ok(attrTagged.length>=8,"most talents should hang off a real attribute");

const allocation={PAC:4,SHO:4,PAS:3,DRI:3,DEF:3,PHY:3,WIL:4};
const state=G.createInitialState("测试前锋",allocation,G.TALENTS.slice(0,3).map(x=>x.id),"standard","mid");

// 七项属性是唯一一层，旧的两层结构必须消失
assert.equal(G.ATTRS.length,7,"exactly seven core attributes");
assert.deepEqual([...G.ATTRS.map(x=>x.key)],ATTR_KEYS,"attribute order drives the radar chart vertices");
assert.equal(Math.abs(G.ATTRS.reduce((t,x)=>t+x.w,0)-1)<1e-9,true,"OVR weights sum to exactly 1");
assert.equal("stats" in state,false,"the old stats layer is gone");
assert.equal("skills" in state,false,"the old skills layer is gone");
ATTR_KEYS.forEach(k=>assert.ok(Number.isFinite(state.attrs[k]),`${k} is a real number`));
assert.equal(Object.keys(state.attrs).length,7,"no stray attribute keys");
assert.equal(Object.values(state.allocation).reduce((a,b)=>a+b,0),24,"creation spends 24 points across seven attributes");
assert.equal(state.actionPoints,3);
assert.equal(state.position,"前锋");
assert.equal(G.ageInfo(state).age,14);
assert.equal(state.relationship.status,"恋人");
assert.equal("clutch" in state.attrs,false,"key moments are derived rather than a separate attribute");
const shoBefore=state.attrs.SHO;

// ===== 防漏改：没有任何代码路径还在碰旧属性 =====
// 循环 30 次：不少 run 体内部按 chance() 分叉，只跑一次会漏掉一半的倒霉分支。
for(let i=0;i<30;i++)G.ACTIONS.forEach(a=>{
  const t=G.createInitialState("漏网探针",allocation,[],"standard","mid");
  t.flags.intimateUnlocked=true;t.money=999;
  const keysBefore=Object.keys(t.attrs).sort().join(",");
  try{a.run(t)}catch(e){assert.fail(`ACTION ${a.id} threw: ${e.message}`)}
  assert.equal(Object.keys(t.attrs).sort().join(","),keysBefore,
    `${a.id} invented or dropped an attribute key`);
  ATTR_KEYS.forEach(k=>assert.ok(Number.isFinite(t.attrs[k]),
    `${a.id} left ${k} as ${t.attrs[k]}`));
  assert.equal("stats" in t,false,`${a.id} resurrected the stats layer`);
  assert.equal("skills" in t,false,`${a.id} resurrected the skills layer`);
});
// 86 个 gain() 调用点里有 60 个在 EVENTS 中，只扫 ACTIONS 等于放过大半。
G.EVENTS.filter(e=>e.options).forEach(e=>{
  const probe=()=>{const t=G.createInitialState("漏网探针",allocation,[],"standard","mid");t.flags.intimateUnlocked=true;t.money=999;return t};
  const count=(typeof e.options==="function"?e.options(probe()):e.options).length;
  for(let i=0;i<count;i++){
    const t=probe(),opts=typeof e.options==="function"?e.options(t):e.options;
    if(!opts[i]||!opts[i].apply)continue;
    try{opts[i].apply()}catch(err){assert.fail(`EVENT ${e.id} 选项 ${i} 抛错: ${err.message}`)}
    assert.equal(Object.keys(t.attrs).sort().join(","),ATTR_KEYS.slice().sort().join(","),`EVENT ${e.id} 选项 ${i} 增删了属性键`);
    ATTR_KEYS.forEach(k=>assert.ok(Number.isFinite(t.attrs[k]),`EVENT ${e.id} 选项 ${i} 把 ${k} 变成 ${t.attrs[k]}`));
  }
});
G.MOMENTS.forEach(m=>m.options.forEach(o=>
  assert.ok(ATTR_KEYS.includes(o.stat),
    `MOMENT ${m.id} option "${o.text}" points at stale stat "${o.stat}"`)));
assert.ok(!/\bCORE_STATS\b/.test(code),"CORE_STATS is retired");
assert.ok(!/\bgainStat\b|\bgainSkill\b/.test(code),"the two growth functions merged into gain()");
assert.ok(!/\.(stats|skills)\s*[.[]/.test(code),"no source path still reads the old two-tier model");

// ===== 合并属性的衰退系数 =====
// 两个旧属性合成一个新属性时，衰退率必须取合并后的等效值，不能只搬其中一边。
// PAC=(speed+burst)/2，旧衰退 1.6 与 1.5 → (1.6+1.5)/2=1.55
// PHY=(height+stamina)/2，旧模型 height 根本不衰退 → (0+1.2)/2=.6
// 用固定 Math.random 跑真实衰退：源码正则只能证明「写了」，证明不了「只写了一次」。
const aged=G.createInitialState("老将",allocation,[],"standard","mid");
aged.totalMonth=(31-14)*12;                      // standard 的 decayAge=31，yrs=1
ATTR_KEYS.forEach(k=>aged.attrs[k]=80);
const beforeAge={...aged.attrs},origRandom=Math.random;
Math.random=()=>.5;try{G.applyAging(aged)}finally{Math.random=origRandom}
assert.equal(+(beforeAge.PAC-aged.attrs.PAC).toFixed(6),+((1.55+.7)*.95).toFixed(6),"PAC 按 speed+burst 的合并速率衰退，且只掉一次");
assert.equal(+(beforeAge.PHY-aged.attrs.PHY).toFixed(6),+((.6+.7)*.95).toFixed(6),"PHY 按 stamina 的一半衰退，因为 height 从不衰退");
assert.equal(beforeAge.SHO,aged.attrs.SHO,"射门不随年龄衰退");

// ===== 创建页点数预算 =====
// 显示用的常数和加减按钮守卫用的常数必须是同一个，否则加点按钮会被永久锁死、
// 玩家一旦调整分配就再也无法开始游戏。
assert.equal(G.ALLOC_BUDGET,24,"seven attributes are allocated from 24 points");
assert.equal(Object.values(G.START_ALLOC).reduce((a,b)=>a+b,0),G.ALLOC_BUDGET,"the default allocation spends exactly the budget");
assert.deepEqual([...Object.keys(G.START_ALLOC)].sort(),[...ATTR_KEYS].sort(),"default allocation covers exactly the seven attributes");

G.ACTIONS.find(x=>x.id==="train_box").run(state);
assert.ok(state.attrs.SHO>shoBefore,"finishing training raises SHO");
const pasBefore=state.attrs.PAS;
G.ACTIONS.find(x=>x.id==="train_box").run(state);
assert.ok(state.attrs.PAS>pasBefore,"finishing training also feeds PAS via set pieces");

// 天赋只应放大收益，不应放大惩罚
const plain=G.createInitialState("素人",allocation,[],"standard","mid");
const gifted=G.createInitialState("天才",allocation,["box_instinct","ambidextrous"],"standard","mid");
const p0=plain.attrs.SHO,g0=gifted.attrs.SHO;
G.gain(plain,"SHO",-1,"finish");G.gain(gifted,"SHO",-1,"finish");
assert.equal(p0-plain.attrs.SHO,g0-gifted.attrs.SHO,"talents must not amplify a penalty");
// 未知 key 必须被挡下：否则 clamp(undefined+n) 会写进 NaN 并凭空造一个属性键
const typo=G.createInitialState("错字",allocation,[],"standard","mid");
const origWarn=console.warn;console.warn=()=>{};try{G.gain(typo,"WILL",5,"will")}finally{console.warn=origWarn}
assert.equal("WILL" in typo.attrs,false,"a misspelled key must not invent an attribute");
assert.deepEqual(Object.keys(typo.attrs).sort(),[...ATTR_KEYS].sort(),"the attribute set stays closed");

// 身高档位：矮个与高个互为镜像，未知档位回落 mid，起始属性受 99 上限约束
const shortP=G.createInitialState("矮个",allocation,[],"standard","short"),tallP=G.createInitialState("高个",allocation,[],"standard","tall");
assert.ok(shortP.attrs.PAC>tallP.attrs.PAC&&shortP.attrs.DRI>tallP.attrs.DRI,"矮个 PAC/DRI 起步更高");
assert.ok(tallP.attrs.PHY>shortP.attrs.PHY,"高个 PHY 起步更高");
assert.ok(tallP.heightCm>shortP.heightCm,"身高档位决定 heightCm");
assert.deepEqual(Object.entries(G.HEIGHT_TIERS.short.adj).map(([k,v])=>[k,-v]).sort(),Object.entries(G.HEIGHT_TIERS.tall.adj).sort(),"矮个与高个的属性修正必须互为镜像");
assert.equal(G.createInitialState("乱码档位",allocation,[],"standard","constructor").heightTier,"mid","an unknown height tier falls back to mid");
assert.ok(G.createInitialState("超额",{PAC:24},[],"standard","mid").attrs.PAC<=99,"starting attributes respect the 99 ceiling");

// 四条流派各有一个专项训练，天赋与流派保持独立
assert.equal(G.STYLES.length,4,"four playing-style routes");
assert.equal(new Set(G.STYLES.map(x=>x.key)).size,4,"style keys are unique");
G.STYLES.forEach(st=>{
  assert.equal(st.levels.length,3,`${st.key} has three levels`);
  assert.ok(G.ACTIONS.some(a=>a.style===st.key),`${st.key} has a dedicated training action`);
});
assert.equal(G.styleLevel(0),0);
assert.equal(G.styleLevel(19),0);
assert.equal(G.styleLevel(20),1);
assert.equal(G.styleLevel(59),1);
assert.equal(G.styleLevel(60),2);
assert.equal(G.styleLevel(120),3);
assert.equal("styles" in state&&state.styles.box===0,true,"new careers start with zero style experience");
assert.equal(state.matchPlan,"box","a match role is always set, there is no neutral option");
assert.equal(G.MATCH_PLANS.length,3,"exactly three match roles to choose from");

const seen=[];
for(let i=0;i<6;i++){
  const e=G.chooseRandomEvent(state,()=>.13+i*.1);
  assert.ok(e,"eligible academy event expected");
  seen.push(e.id);
}
assert.equal(new Set(seen).size,seen.length,"recent random events should not repeat");

const elite=G.createInitialState("精英",allocation,["scout_magnet","big_heart","box_instinct"]);
ATTR_KEYS.forEach(k=>elite.attrs[k]=88);
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

const qual=G.simulateQualifiers(elite,seeded(42));
assert.equal(qual.matches.length,8,"world cup qualifiers run an 8-match Asian campaign");
assert.equal(typeof qual.qualified,"boolean","qualification is a pass/fail gate");
const draw=G.wcDraw(seeded(7));
assert.equal(draw.group.length,3,"finals draw yields three group opponents");
assert.equal(draw.ko.length,4,"finals draw yields four knockout opponents");
assert.ok(draw.ko[0].strength<=draw.ko[3].strength,"knockout opponents escalate in strength");
const wcMatch=G.wcMatchSim(elite,draw.ko[0],"稳守",4,seeded(9));
assert.ok(typeof wcMatch.won==="boolean"&&wcMatch.gf>=0,"a single world cup match resolves with a winner and score");

// 关键时刻：成功率永远夹在 15%~85%，任何职责/属性组合都能凑齐两个场景
const weak=G.createInitialState("弱鸡",allocation,[]);
ATTR_KEYS.forEach(k=>weak.attrs[k]=1);
weak.form=0;weak.fitness=0;
for(const m of G.MOMENTS)for(const o of m.options){
  const lo=G.momentSuccessRate(weak,m,o,99,true),hi=G.momentSuccessRate(elite,m,o,1,false);
  assert.ok(lo>=0.15&&lo<=0.85,`${m.id}/${o.text} floor stays inside 15%-85%`);
  assert.ok(hi>=0.15&&hi<=0.85,`${m.id}/${o.text} ceiling stays inside 15%-85%`);
}
for(const plan of G.MATCH_PLANS){
  weak.matchPlan=plan.id;
  const slots=G.pickMoments(weak,seeded(3));
  assert.equal(slots.length,2,`${plan.id} always yields two key moments`);
  slots.forEach(sl=>{
    const m=G.MOMENTS.find(x=>x.id===sl.id);
    assert.ok(m,"每个时刻都指向一个真实场景");
    assert.ok(G.momentOptions(weak,m).length>=3,`${m.id} keeps at least three options before style unlocks`);
  });
}
// 待决比赛必须能存档——中途刷新页面不能丢掉整个月
// 比对序列化结果而不是 deepEqual：app.js 跑在 vm 沙箱里，跨 realm 的原型天然不同。
// 函数或 undefined 一旦混进来，round-trip 后的键就会消失，这里立刻会炸。
const pending=G.prepareMatch(elite,seeded(11));
assert.equal(JSON.stringify(JSON.parse(JSON.stringify(pending))),JSON.stringify(pending),"a pending match is plain serialisable data");
assert.equal(pending.moments.length,2,"a played match reserves two key moments");

// 三场挑战：未出场不消耗场次
const chal=G.createInitialState("挑战者",allocation,[]);
chal.challenge={id:"t1",tier:"steady",kind:"starts",target:2,text:"至少两场获得首发",played:0,acc:G.newChallengeAcc()};
G.challengeProgress(chal,{role:"未出场",rating:0,goals:0,assists:0,gf:0,ga:1,timeline:[]});
assert.equal(chal.challenge.played,0,"a match you did not play never burns a challenge slot");
G.challengeProgress(chal,{role:"首发",rating:7.2,goals:1,assists:0,gf:2,ga:1,timeline:[{minute:80,kind:"goal"}]});
assert.equal(chal.challenge.played,1,"an appearance advances the challenge");
assert.equal(chal.challenge.acc.keyGoals,1,"a late goal in a one-goal game counts as decisive");
G.CHALLENGE_TIERS.forEach(t=>{
  assert.equal(t.goals.length,3,`${t.tier} offers three goals`);
  assert.equal(new Set(t.goals.map(g=>g.kind)).size,3,`${t.tier} goals are distinct`);
});

// 老存档补字段后可以直接续玩
const legacy=G.normalizeSave({});
assert.equal(legacy.matchPlan,"box");
assert.equal(JSON.stringify(legacy.styles),JSON.stringify({box:0,burst:0,target:0,play:0}));
assert.equal(legacy.challenge,null);
assert.equal(legacy.pendingMatch,null);
assert.equal(legacy.combosHit.length,0);
assert.equal(G.normalizeSave({matchPlan:"press"}).matchPlan,"press","a valid stored role survives normalisation");
assert.equal(G.normalizeSave({matchPlan:"nonsense"}).matchPlan,"box","a bogus role falls back to the default");
// v2 存档的形状与 v3 不兼容（stats/skills → attrs），normalizeSave 自己不会造 attrs，
// 所以 v2 必须先过 migrateV2toV3；否则玩家点“继续游戏”会直接抛 TypeError。
assert.equal(G.VERSION,3,"the attrs migration is a breaking save-shape change");
assert.equal(G.normalizeSave({}).attrs,undefined,"normalizeSave does not synthesise attrs, so a v2 save must go through migration first");

// ===== 存档迁移 v2 → v3 =====
function v2Save(o){
  return {version:2,stats:{height:o.height,speed:o.speed,burst:o.burst,stamina:o.stamina,will:o.will},
    skills:{finishing:o.finishing,dribble:o.dribble,vision:o.vision,setPiece:o.setPiece},
    form:60,morale:76,teamFit:63,matchPlan:"box"};
}
const oldOVR=o=>Math.round(o.height*.1+o.speed*.15+o.burst*.18+o.stamina*.12+o.will*.15
  +o.finishing*.16+o.dribble*.08+o.vision*.04+o.setPiece*.02);
const BUILDS={
  "新手14岁":{height:58,speed:58,burst:58,stamina:58,will:58,finishing:50,dribble:48,vision:43,setPiece:41},
  "均衡型":{height:58,speed:70,burst:72,stamina:65,will:68,finishing:72,dribble:64,vision:55,setPiece:48},
  "支点型":{height:82,speed:55,burst:58,stamina:78,will:75,finishing:76,dribble:52,vision:50,setPiece:45},
  "速度型":{height:45,speed:85,burst:88,stamina:62,will:60,finishing:70,dribble:80,vision:52,setPiece:40},
  "巅峰32岁":{height:70,speed:88,burst:90,stamina:84,will:92,finishing:93,dribble:86,vision:78,setPiece:70}
};
for(const [label,o] of Object.entries(BUILDS)){
  const m=G.migrateV2toV3(v2Save(o));
  assert.ok(m,`${label}: migrates to a usable save`);
  assert.equal(m.version,3,`${label}: version bumped`);
  ATTR_KEYS.forEach(k=>{
    assert.ok(Number.isFinite(m.attrs[k]),`${label}: ${k} is finite`);
    assert.ok(m.attrs[k]>=1&&m.attrs[k]<=99,`${label}: ${k} in range`);
  });
  assert.equal("stats" in m,false,`${label}: old stats dropped`);
  assert.equal("skills" in m,false,`${label}: old skills dropped`);
  assert.equal("morale" in m,false,`${label}: morale folded into form`);
  assert.equal("teamFit" in m,false,`${label}: teamFit discarded`);
  assert.ok(Math.abs(G.overall(m)-oldOVR(o))<=2,
    `${label}: OVR drift ${G.overall(m)-oldOVR(o)} exceeds ±2`);
}
// 损坏的档不能带着 NaN 进游戏
assert.equal(G.migrateV2toV3({version:2,stats:{height:"坏"},skills:{}}),null,"corrupt save migrates to null");
assert.equal(G.migrateV2toV3(null),null,"null in, null out");

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
