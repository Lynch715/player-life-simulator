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
// 关键时刻的 tip 是玩家做不可撤销选择前读到的唯一线索：说「依赖X」就必须
// 真的吃 X。这里不只是查旧词，而是把 tip 和 o.stat 对起来，杜绝以后再漂移。
const ATTR_CN=Object.fromEntries(G.ATTRS.map(a=>[a.key,a.name]));
G.MOMENTS.forEach(m=>m.options.forEach(o=>{
  const dep=/依赖([^\s，,。]+)/.exec(o.tip||"");
  if(!dep)return;
  assert.equal(dep[1],ATTR_CN[o.stat],
    `MOMENT ${m.id} 选项「${o.text}」提示依赖「${dep[1]}」，实际判定却吃 ${o.stat}（${ATTR_CN[o.stat]}）`);
}));
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

// ===== 创建页承诺的成年身高必须兑现 =====
// HEIGHT_TIERS[].cm 是「成年身高」，14 岁从更矮处起步，靠 14→18 每年 2~4cm
// 长到那个数。曾经 tier.cm 被当成 14 岁身高，再叠 4 年发育，三档全部超标——
// 高个每次都顶死在 200cm 硬上限，卡面写的 191 完全没有意义。
for(const tier of ["short","mid","tall"]){
  const promised=G.HEIGHT_TIERS[tier].cm;
  const start=G.createInitialState("起步",allocation,[],"standard",tier);
  assert.ok(start.heightCm<promised,`${tier}: 14 岁身高 ${start.heightCm} 应低于成年承诺 ${promised}`);
  assert.equal(start.heightMax,promised,`${tier}: 发育上限就是卡面承诺的成年身高`);
  let maxSeen=0;
  for(let i=0;i<40;i++){
    const t=G.createInitialState("发育",allocation,[],"standard",tier);
    const orig=Math.random;let x=i*7919+13;Math.random=()=>((x=(x*1664525+1013904223)>>>0)/4294967296);
    try{for(let m=0;m<60&&!t.retired;m++){G.setState(t);G.advanceMonth()}}catch(e){}finally{Math.random=orig}
    maxSeen=Math.max(maxSeen,t.heightCm);
  }
  assert.ok(maxSeen<=promised,`${tier}: 成年身高 ${maxSeen} 超过了卡面承诺的 ${promised}`);
  assert.ok(maxSeen>=promised-4,`${tier}: 成年身高 ${maxSeen} 离承诺 ${promised} 太远，发育量不够`);
}
assert.match(code,/成年 \$\{t\.cm\}cm/,"身高卡明确标注这是成年身高，而不是 14 岁身高");
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

// ===== 每条训练都必须真的推动它宣称的属性 =====
const TRAIN_EXPECT={
  train_box:{main:"SHO",also:["PAS","WIL"]},
  train_burst:{main:"PAC",also:["DRI"]},
  train_target:{main:"PHY",also:["WIL"]},
  train_play:{main:"PAS",also:["DRI"]},
  train_press:{main:"DEF",also:["PHY"]}
};
for(const [id,exp] of Object.entries(TRAIN_EXPECT)){
  const a=G.ACTIONS.find(x=>x.id===id);
  assert.ok(a,`${id} exists`);
  const t=G.createInitialState("训练探针",allocation,[],"standard","mid");
  ATTR_KEYS.forEach(k=>t.attrs[k]=50);
  const before={...t.attrs};
  a.run(t);
  assert.ok(t.attrs[exp.main]>before[exp.main]+0.1,`${id} clearly raises ${exp.main}`);
  exp.also.forEach(k=>assert.ok(t.attrs[k]>=before[k],`${id} does not hurt ${k}`));
  assert.ok(t.fitness<90,`${id} costs stamina`);
}
// 合并属性只能涨一次：Task 1 保留了成对调用，导致 PAC/PHY/PAS 训练收益翻倍
for(const [id,main] of [["train_burst","PAC"],["train_target","PHY"],["train_play","PAS"]]){
  const t=G.createInitialState("翻倍探针",allocation,[],"standard","mid");
  ATTR_KEYS.forEach(k=>t.attrs[k]=50);
  const b=t.attrs[main];
  G.ACTIONS.find(x=>x.id===id).run(t);
  assert.ok(t.attrs[main]-b<0.9,`${id} must raise ${main} once, not twice (got +${(t.attrs[main]-b).toFixed(2)})`);
}
// DEF 有且只有一个专属训练入口
const defTrainers=G.ACTIONS.filter(a=>{
  const t=G.createInitialState("d",allocation,[],"standard","mid");
  ATTR_KEYS.forEach(k=>t.attrs[k]=50);const b=t.attrs.DEF;
  try{a.run(t)}catch(e){return false}
  return t.attrs.DEF>b+0.1;
});
assert.equal(defTrainers.length,1,"exactly one action is the DEF growth path");
assert.equal(defTrainers[0].id,"train_press");
// 前场逆抢计入支点中锋，流派总数不变
assert.equal(G.ACTIONS.find(x=>x.id==="train_press").style,"target");
assert.equal(G.STYLES.length,4,"no fifth style route was added");

// ===== 小满互动：陪伴回血、独处消耗 =====
function runAction(id,patch){
  const t=G.createInitialState("小满探针",allocation,[],"standard","mid");
  ATTR_KEYS.forEach(k=>t.attrs[k]=50);
  t.form=50;t.fitness=50;t.flags.intimateUnlocked=true;Object.assign(t,patch||{});
  const before={form:t.form,fitness:t.fitness,WIL:t.attrs.WIL,love:t.relationship.love};
  G.ACTIONS.find(x=>x.id===id).run(t);
  return {form:t.form-before.form,fitness:t.fitness-before.fitness,
          WIL:t.attrs.WIL-before.WIL,love:t.relationship.love-before.love};
}
const love=runAction("love_time");
assert.ok(love.form>0,"陪小满 lifts form");
assert.ok(love.fitness>0,"陪小满 restores stamina — she makes you rest");
assert.ok(love.WIL>0,"陪小满 grows will");
assert.ok(love.love>0,"陪小满 deepens the relationship");

const alone=runAction("together");
assert.ok(alone.form>love.form,"独处 is the bigger form swing");
assert.ok(alone.fitness<0,"独处 costs stamina");
assert.ok(alone.WIL>0,"独处 grows will");

const gift=runAction("gift");
assert.ok(gift.form>0&&gift.love>love.love,"礼物 buys more affection than time does");

// ===== 行动的效果文案不得承诺已经不存在的东西 =====
// 玩家是照着 effects 做决策的；文案里留着「心情」「技术」这类已删除的概念，
// 等于让玩家按一张过期的说明书玩。
const DEAD_WORDS=["心情","技术↑","创造力","射术","爆发","耐力","视野","定位球","队内适应"];
G.ACTIONS.forEach(a=>a.effects.forEach(e=>DEAD_WORDS.forEach(w=>
  assert.ok(!e.includes(w),`ACTION ${a.id} 的效果文案「${e}」仍在承诺已删除的「${w}」`))));
G.MATCH_PLANS.forEach(p=>p.effects.forEach(e=>DEAD_WORDS.forEach(w=>
  assert.ok(!e.includes(w),`MATCH_PLAN ${p.id} 的效果文案「${e}」仍在承诺已删除的「${w}」`))));
// 事件选项的第 2 个参数就是玩家点选前读到的效果说明——它骗人的代价比 effects 更大，
// 因为那是一次不可撤销的抉择。这里直接扫源码，覆盖全部 EVENTS 与剧情节点。
const optEffects=[...code.matchAll(/option\("[^"]*","([^"]*)"/g)].map(m=>m[1]);
assert.ok(optEffects.length>50,`sanity: 应该扫到大量 option 效果说明，实际 ${optEffects.length}`);
optEffects.forEach(e=>DEAD_WORDS.forEach(w=>
  assert.ok(!e.includes(w),`某个 option 的效果说明「${e}」仍在承诺已删除的「${w}」`)));
// 训练行动的 run 里也不该再直接写 morale——它已并入状态
G.ACTIONS.forEach(a=>assert.ok(!/change\([^,]+,"morale"/.test(a.run.toString()),
  `ACTION ${a.id} 仍在直接改 morale`));

// ===== 流派抬高对应属性的成长天花板 =====
// 软上限只是把成长「压慢」，不是硬顶——练无限次谁都能到 99。所以要在
// 一个真实的生涯投入量下比较：40 次训练 × 0.75，约等于一条流派练满的代价。
function grindTo(styleExp,key,startAt){
  const t=G.createInitialState("磨练",allocation,[],"standard","mid");
  ATTR_KEYS.forEach(k=>t.attrs[k]=50);
  t.attrs[key]=startAt;t.styles={box:0,burst:0,target:0,play:0,...styleExp};
  for(let i=0;i<40;i++)G.gain(t,key,.75,"grind");
  return t.attrs[key];
}
const noStyle=grindTo({},"SHO",80);
const maxStyle=grindTo({box:120},"SHO",80);
assert.ok(maxStyle-noStyle>5,`style III should push SHO meaningfully higher (${noStyle.toFixed(1)} → ${maxStyle.toFixed(1)})`);
assert.ok(maxStyle>95,`style III should break past 95, got ${maxStyle.toFixed(1)}`);
assert.ok(noStyle<92,`no style should stall below 92, got ${noStyle.toFixed(1)}`);
// 机制本身：同一个属性值下，流派等级越高，softFactor 越大
const sfs=[0,1,2,3].map(lv=>G.softFactor(88,G.DIFFICULTIES.standard,lv));
assert.deepEqual(sfs,[.25,.4,.6,.8],"each style level lifts the growth multiplier one notch");

// 每条流派声明自己抬高哪些属性，且全部是合法 key
assert.deepEqual([...G.STYLES.map(s=>s.key)],["box","burst","target","play"]);
G.STYLES.forEach(st=>{
  assert.ok(Array.isArray(st.attrs)&&st.attrs.length>0,`${st.key} declares its attributes`);
  st.attrs.forEach(k=>assert.ok(ATTR_KEYS.includes(k),`${st.key} attr ${k} is a real key`));
});
// 七项里只有 WIL 不归任何流派
const covered=new Set(G.STYLES.flatMap(s=>s.attrs));
assert.deepEqual(ATTR_KEYS.filter(k=>!covered.has(k)),["WIL"],"only WIL has no style route");
// 流派等级正确映射到 cap level
const t9=G.createInitialState("流派",allocation,[],"standard","mid");
t9.styles={box:120,burst:0,target:60,play:20};
assert.equal(G.styleCapLevel(t9,"SHO"),3,"box III caps SHO at level 3");
assert.equal(G.styleCapLevel(t9,"PHY"),2,"target II caps PHY at level 2");
assert.equal(G.styleCapLevel(t9,"DEF"),2,"target II also caps DEF");
assert.equal(G.styleCapLevel(t9,"PAS"),1,"play I caps PAS at level 1");
assert.equal(G.styleCapLevel(t9,"PAC"),0,"untrained burst leaves PAC uncapped");
assert.equal(G.styleCapLevel(t9,"WIL"),0,"WIL never gets a style cap");
// 流派卡面的 desc 必须说明它抬高哪些属性，否则玩家看不出投资回报
G.STYLES.forEach(st=>assert.ok(/成长上限/.test(st.desc),`${st.key} desc explains the cap it raises`));

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

// ===== 逼抢是有条件的选择 =====
// 本次玩法上最实质的改动：逼抢从无脑 +2.5 变成 (def-55)*.10。
// 同一名球员、同一批随机种子，只改 DEF 与职责，比较净进球差。
function xgUnder(attrsPatch,plan){
  const p=G.createInitialState("逼抢探针",allocation,[],"standard","mid");
  ATTR_KEYS.forEach(k=>p.attrs[k]=70);Object.assign(p.attrs,attrsPatch);
  p.totalMonth=48;p.flags.pro18=true;p.coachFavor=95;p.form=55;p.fitness=72;
  let mine=0,theirs=0;
  for(let i=0;i<60;i++){
    const r=G.prepareMatch(p,seeded(i+100),{plan,opponent:{name:"测试队",strength:70},home:true});
    mine+=r.gf;theirs+=r.ga;
  }
  return mine-theirs;
}
const strongPress=xgUnder({DEF:90},"press"),strongBox=xgUnder({DEF:90},"box");
const weakPress=xgUnder({DEF:30},"press"),weakBox=xgUnder({DEF:30},"box");
assert.ok(strongPress>strongBox,`a high-DEF player gains from pressing (${strongPress} vs ${strongBox})`);
assert.ok(weakPress<weakBox,`a low-DEF player is punished for pressing (${weakPress} vs ${weakBox})`);

const reports=[];
for(let i=0;i<40;i++)reports.push(G.simulateMatchCore(elite,seeded(i+1)));
assert.ok(new Set(reports.map(x=>`${x.gf}-${x.ga}`)).size>4,"match results retain random variance");
assert.ok(reports.some(x=>x.role==="首发")&&reports.some(x=>x.role!=="首发"),"selection is probabilistic");
reports.forEach(r=>assert.ok(r.model.ability&&r.model.condition&&r.model.random));

// 时间线文案：进球句式只能落在真进球上
// 老 bug：判定成功但没换来比分时，else 分支照样输出"低射钻进远角！"——
// 玩家读到"球进了"，比分却没动。用集合成员判定而不是正则，新加的文案自动纳入检查。
assert.ok(G.MATCH_ACTION_LINES,"timeline prose tiers should be exported");
const goalLines=new Set(),assistLines=new Set();
for(const tier of Object.values(G.MATCH_ACTION_LINES)){
  (tier.goal||[]).forEach(x=>goalLines.add(x));
  (tier.assist||[]).forEach(x=>assistLines.add(x));
}
assert.ok(goalLines.size>=6,"each scoring action keeps its own goal prose");
assert.ok(assistLines.size>=4,"each creating action keeps its own assist prose");
let realGoals=0,scorelessWins=0;
for(let i=0;i<200;i++){
  const p=G.prepareMatch(elite,seeded(i+1));
  let goalEntries=0;
  for(const e of p.timeline){
    const assisted=e.text.startsWith("助攻："),body=assisted?e.text.slice(3):e.text;
    if(e.kind==="goal"){goalEntries++;realGoals++;assert.ok(goalLines.has(body),`a goal entry must read as a goal: ${e.text}`);continue}
    assert.equal(goalLines.has(body),false,`a non-goal entry must not read as a goal: ${e.text}`);
    if(assisted){assert.ok(assistLines.has(body),`an assist entry must describe the pass: ${e.text}`);continue}
    assert.equal(assistLines.has(body),false,`only assists may use assist prose: ${e.text}`);
    if(e.kind==="good")scorelessWins++;
  }
  assert.equal(goalEntries,p.goals,"goal entries agree with the goals the model awarded");
}
assert.ok(realGoals>0,"the sample contains real goals");
assert.ok(scorelessWins>0,"the sample contains successful actions that did not score");

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

// ===== 判定内核：有效属性 =====
const probe=G.createInitialState("探针",allocation,[],"standard","mid");
ATTR_KEYS.forEach(k=>probe.attrs[k]=70);

// 基准点：form 55 / fitness 72 时 cond 恰为 1，有效属性等于裸值
probe.form=55;probe.fitness=72;
assert.ok(Math.abs(G.cond(probe)-1)<1e-9,"cond is exactly 1 at the calibration point");
ATTR_KEYS.forEach(k=>assert.ok(Math.abs(G.eff(probe,k)-70)<1e-9,`${k} unmodified at cond=1`));

// 巅峰与崩盘都被 clamp 住
probe.form=100;probe.fitness=100;assert.equal(G.cond(probe),1.08,"cond ceiling");
probe.form=0;probe.fitness=0;assert.equal(G.cond(probe),.78,"cond floor");

// 敏感度方向：体能崩盘时身体掉得比意志狠得多
const phyLow=G.eff(probe,"PHY"),wilLow=G.eff(probe,"WIL");
assert.ok(phyLow<wilLow,"PHY collapses harder than WIL when exhausted");
assert.ok(phyLow<50&&phyLow>45,`PHY 70 should land near 48 at rock bottom, got ${phyLow.toFixed(1)}`);
assert.ok(wilLow>62&&wilLow<66,`WIL 70 should hold near 64 at rock bottom, got ${wilLow.toFixed(1)}`);

// 单调性：状态与体能上升，任何属性的有效值都不下降
ATTR_KEYS.forEach(k=>{
  probe.form=20;probe.fitness=30;const lo=G.eff(probe,k);
  probe.form=90;probe.fitness=95;const hi=G.eff(probe,k);
  assert.ok(hi>lo,`${k} improves with better condition`);
});

// 球队贡献分：权重合计为 1，全 70 时两个分值都回到 70
probe.form=55;probe.fitness=72;
assert.ok(Math.abs(G.atk(probe)-70)<1e-9,"atk weights sum to 1");
assert.ok(Math.abs(G.def(probe)-70)<1e-9,"def weights sum to 1");
// DEF 是防守分的主导项，SHO 完全不参与
probe.attrs.DEF=90;assert.ok(G.def(probe)>70,"DEF drives the defensive contribution");
probe.attrs.DEF=70;probe.attrs.SHO=99;
assert.ok(Math.abs(G.def(probe)-70)<1e-9,"shooting never inflates the defensive score");

// ===== 无双重计数 =====
// eff() 已经吃掉状态与体能。若旧公式的 form/fitness 散项没删干净，
// 状态从 30 拉到 90 会产生远超预期的涨幅。
const dc=G.createInitialState("双计探针",allocation,[],"standard","mid");
ATTR_KEYS.forEach(k=>dc.attrs[k]=70);
const m0=G.MOMENTS.find(x=>x.id==="counter_break"),o0=m0.options[0];
dc.form=30;dc.fitness=60;const rLo=G.momentSuccessRate(dc,m0,o0,60,false);
dc.form=90;dc.fitness=60;const rHi=G.momentSuccessRate(dc,m0,o0,60,false);
const lift=rHi-rLo;
assert.ok(lift>0,"better form still helps");
assert.ok(lift<0.06,`form 30→90 should lift success by <6pp via eff() alone, got ${(lift*100).toFixed(1)}pp`);

// weightedStatScore 已被 atk()/def() 取代
assert.equal(G.weightedStatScore,undefined,"weightedStatScore is gone");

// 关键时刻仍夹在 15%~85%
assert.ok(G.momentSuccessRate(dc,m0,o0,99,true)>=0.15);
assert.ok(G.momentSuccessRate(dc,m0,o0,1,false)<=0.85);

// 源码里不该再有任何 form/fitness 散项混进判定公式
assert.ok(!/s\.form\/1000|s\.fitness\/2000|\(s\.form-50\)\/260|\(s\.form-50\)\/220/.test(code),
  "no ad-hoc form/fitness term survives in a judgement formula");

// ===== 首发概率仍看得见状态 =====
// 删掉 rawStart 里的 (form-50)/220 之后，选人一度对状态完全失明（恒定 42%）。
// 解法不是把散项加回去，而是让 rawStart 读 effOverall——同一张 OVR 权重表，
// 但经 eff() 一次，状态与体能只被计入一遍。
const selBase=()=>{const s=G.createInitialState("选人探针",allocation,[],"standard","mid");
  ATTR_KEYS.forEach(k=>s.attrs[k]=68);s.coachFavor=55;s.totalMonth=72;
  s.club={name:"重庆铜梁龙",league:"中超",strength:70};return s};
const calib=selBase();calib.form=55;calib.fitness=72;
assert.ok(Math.abs(G.effOverall(calib)-G.overall(calib))<1e-9,"effOverall equals the card OVR at the calibration point");
function startRate(f,fit){const s=selBase();s.form=f;s.fitness=fit;let n=0;
  for(let i=1;i<=800;i++){let x=i>>>0;const rng=()=>((x=(x*1664525+1013904223)>>>0)/4294967296);
    if(G.prepareMatch(s,rng).role==="首发")n++}return n/800}
const srLo=startRate(30,50),srMid=startRate(55,72),srHi=startRate(90,95);
assert.ok(srHi>srMid&&srMid>srLo,`selection must track condition, got ${srLo.toFixed(2)}/${srMid.toFixed(2)}/${srHi.toFixed(2)}`);
assert.ok(srHi-srLo>0.12,`condition should swing selection by >12pp, got ${((srHi-srLo)*100).toFixed(0)}pp`);
// 防守型前锋也要被教练看见：DEF 参与选人，否则 DEF 成长毫无回报
const dLo=selBase(),dHi=selBase();dLo.attrs.DEF=30;dHi.attrs.DEF=95;
assert.ok(G.effOverall(dHi)>G.effOverall(dLo),"DEF contributes to how the coach rates you");

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

// ===== 心情已彻底删除，并入状态 =====
// 唯一的例外是 migrateV2toV3：那里的 morale 是 v2「磁盘上」的字段名（和 teamFit 一样），
// 迁移必须读得到它，才能把旧档的心情折进 form 再删掉。除此之外源码里不许再出现。
const migrateSrc=code.slice(code.indexOf("/* v2(stats+skills"),code.indexOf("function normalizeSave"));
assert.ok(migrateSrc.includes("function migrateV2toV3"),"located the v2 migration block");
assert.ok(!/\bmorale\b/.test(code.split(migrateSrc).join("")),"morale is gone from the source outside the v2 save migration");
assert.equal((migrateSrc.match(/\bmorale\b/g)||[]).length,3,"the v2 migration names the legacy key only to read it, drop it, and warn about it");
assert.equal("morale" in state,false,"new careers carry no morale field");
assert.ok(!/心情/.test(code),"no player-facing text still promises 心情");

// ===== teamFit 同样已彻底删除 =====
// 它曾以 ±16.7pp 左右首发概率，却从未初始化、三个默认值不一致（45/50/55）、
// 且零 UI——玩家被一个看不见且有 bug 的变量左右。9 处事件效果已按语义
// 拆到教练信任 / 状态 / 意志上。
assert.ok(!/\bteamFit\b/.test(code.split(migrateSrc).join("")),"teamFit is gone outside the v2 save migration");
assert.equal("teamFit" in state,false,"new careers carry no teamFit field");
assert.ok(!/队内适应/.test(code),"no player-facing text still promises 队内适应");
const html2=fs.readFileSync(path.join(root,"index.html"),"utf8");
assert.ok(!/moraleText|moraleBar|心情/.test(html2),"the morale row is gone from the page");

// 关系好 → 状态基线更高（原本 loveSupport 是隐形战力加成，现在改为长期稳定性）
assert.ok(G.loveSupport,"loveSupport still exists");
const inLove=G.createInitialState("热恋",allocation,[],"standard","mid");
const single=G.createInitialState("分手",allocation,[],"standard","mid");
single.relationship.status="分手";single.relationship.love=0;
assert.ok(G.loveSupport(inLove)>G.loveSupport(single),"a strong relationship lifts the form baseline");

// ===== 状态的均衡点必须等于基线，不能被每月固定 +N 顶上去 =====
// 合并「心情」时最容易犯的错：把原本每月 +N 的小加成 1:1 搬到 form 上。
// form 每月回归 22%，一个固定 +N 会把均衡点推高 N/0.22≈4.5N——曾经实测
// 均值飙到 68，四分之一的月份卡在 cond() 上限，状态管理彻底失去意义。
assert.ok(!/change\(S,"form",\s*\d/.test(code),
  "monthly settlement must not add a flat constant to form — raise the baseline instead");
// 长跑验证：单身无房的均衡点应落在基线 52 附近，而不是 52+18
{
  const t=G.createInitialState("均衡",allocation,[],"standard","mid");
  t.relationship.status="分手";t.relationship.love=0;t.assets.house=false;
  t.form=52;
  const origR=Math.random;let x=99;Math.random=()=>((x=(x*1664525+1013904223)>>>0)/4294967296);
  try{for(let m=0;m<180&&!t.retired;m++){G.setState(t);G.advanceMonth()}}catch(e){}finally{Math.random=origR}
  assert.ok(t.form<66,`form equilibrium drifted to ${t.form}; a flat monthly bonus has crept back in`);
}

// ===== 世界杯必须能跨刷新续上 =====
// 点球是多步交互；若 wcRun 不持久化，第四轮刷一下页面整届世界杯就没了。
assert.ok(!/wcRun=null;\$\("menu"\)/.test(code),"读档不再无条件清空进行中的世界杯");
assert.equal(typeof G.resumeWorldCup,"function","有一个恢复入口");
const wcSave=G.createInitialState("世界杯",allocation,[],"standard","mid");
wcSave.national.wcRun={stage:4,group:[{name:"A",strength:70}],ko:[{name:"B",strength:80}],
  results:[{opp:"A",gf:1,ga:0,goals:1,assists:0,won:true,pen:false,stage:0}],
  groupWins:1,groupPts:3,alive:true};
const wcRound=JSON.parse(JSON.stringify(wcSave));
assert.equal(JSON.stringify(wcRound.national.wcRun),JSON.stringify(wcSave.national.wcRun),
  "wcRun 是纯 JSON，round-trip 不丢字段");
assert.equal(G.normalizeSave(wcRound).national.wcRun.stage,4,"normalizeSave 保留进行中的世界杯");

// ===== 点球：主罚轮次由意志决定 =====
// 赛前的教练决策，取决于你是什么样的球员，而不是此刻多累——所以读裸 WIL。
const pk=(wil)=>{const t=G.createInitialState("点球",allocation,[],"standard","mid");t.attrs.WIL=wil;return G.penaltyKickerRound(t)};
assert.equal(pk(80),5,"意志强的人被交付最后一脚");
assert.equal(pk(65),3,"中段");
assert.equal(pk(40),1,"先踢，卸掉压力");

// ===== 点球：三个选项的真实关系 =====
assert.equal(G.PENALTY_OPTIONS.length,3,"三选一");
G.PENALTY_OPTIONS.forEach(o=>{
  assert.ok(["SHO","WIL"].includes(o.stat),`${o.text} 指向真实属性`);
  assert.ok(o.text&&o.tip,`${o.stat} 选项有文案`);
});
function pRate(sho,wil,fitness,id){
  const t=G.createInitialState("罚球",allocation,[],"standard","mid");
  t.attrs.SHO=sho;t.attrs.WIL=wil;t.form=55;t.fitness=fitness;
  return G.penaltyRate(t,G.PENALTY_OPTIONS.find(o=>o.id===id));
}
// 均衡 build：正常体能稳推最优，体能见底等门将反超
assert.ok(pRate(75,75,72,"steady")>pRate(75,75,72,"wait"),"均衡 build 正常体能下稳推更优");
assert.ok(pRate(75,75,0,"wait")>pRate(75,75,0,"steady"),"均衡 build 体能见底时等门将反超");
// 射手型：两种体能下稳推都最优——极端 build 不该被体能翻盘
assert.ok(pRate(85,60,72,"steady")>pRate(85,60,72,"wait"),"射手型正常体能下稳推最优");
assert.ok(pRate(85,60,0,"steady")>pRate(85,60,0,"wait"),"射手型体能见底时稳推仍最优");
// 抽死角靠附加价值立足，成功率本就低于稳推
assert.ok(pRate(75,75,72,"bold")<pRate(75,75,72,"steady"),"抽死角成功率低于稳推，靠附加取胜");
assert.equal(G.PENALTY_OPTIONS.find(o=>o.id==="bold").bold,true,"抽死角被标为高风险");
// 成功率永远夹在 35%~92%
[[1,1,0],[99,99,100]].forEach(([a,b,f])=>G.PENALTY_OPTIONS.forEach(o=>{
  const r=pRate(a,b,f,o.id);
  assert.ok(r>=.35&&r<=.92,`${o.id} 在极端属性下仍被夹住，实际 ${r}`);
}));

// ===== 点球：队友与对手的成功率 =====
assert.ok(G.teamPenaltyRate(60)<G.teamPenaltyRate(90),"球队越强罚得越准");
assert.ok(G.teamPenaltyRate(1)>=.55&&G.teamPenaltyRate(200)<=.88,"队友成功率被夹在 55%~88%");

// ===== 点球状态机 =====
const soState=G.createInitialState("大战",allocation,[],"standard","mid");
soState.attrs.WIL=80;
const so=G.newShootout(soState,{name:"对手",strength:78});
assert.equal(so.round,1,"从第一轮开始");
assert.equal(so.myRound,5,"WIL 80 主罚第五轮");
assert.equal(so.myScore,0);assert.equal(so.oppScore,0);
assert.equal(so.done,false);
assert.equal(JSON.stringify(JSON.parse(JSON.stringify(so))),JSON.stringify(so),
  "点球状态是纯 JSON，刷新不丢");
let guard=0;
while(!so.done&&so.round<so.myRound&&guard++<20)G.shootoutAdvance(soState,so,()=>.5);
assert.equal(so.round,so.myRound,"推进到玩家那轮就停");
assert.ok(so.kicks.length>0,"前面几轮留下了记录");
so.kicks.forEach(k=>assert.ok(["me","opp"].includes(k.side)&&typeof k.scored==="boolean",
  "每一脚都记了是谁踢的、进没进"));

const soBefore={my:so.myScore,opp:so.oppScore,round:so.round};
const scored=G.shootoutPlayerKick(soState,so,"steady",()=>0);
assert.equal(scored,true,"rng=0 时必进");
assert.equal(so.myScore,soBefore.my+1,"进了就加分");
assert.equal(so.round,soBefore.round+1,"主罚后推进一轮");
const soMiss=G.newShootout(soState,{name:"对手",strength:78});
G.shootoutPlayerKick(soState,soMiss,"steady",()=>0.999);
assert.equal(soMiss.myMiss,true,"罚丢会被记下来");

// ===== 点球结果必须写回那场比赛的胜负 =====
const drawn=G.createInitialState("平局",allocation,[],"standard","mid");
ATTR_KEYS.forEach(k=>drawn.attrs[k]=80);drawn.totalMonth=96;drawn.flags.pro18=true;
let sawNull=false;
for(let i=1;i<=200;i++){
  let x=i>>>0;const rng=()=>((x=(x*1664525+1013904223)>>>0)/4294967296);
  const mm=G.wcMatchSim(drawn,{name:"对手",strength:80},"均衡",4,rng);
  if(mm.gf===mm.ga&&mm.won===null&&mm.pen)sawNull=true;
  else assert.ok(typeof mm.won==="boolean",`非平局场次 won 必须是布尔，实际 ${mm.won}`);
}
assert.ok(sawNull,"淘汰赛平局时 won 置 null 交给点球决出");

// ===== 无头驱动弹窗队列 =====
// 上面全是纯函数断言，碰不到 enqueueFront 之后的任何东西。点球接入时发现的
// 两个 bug（penMatch 在存档后与 results 脱钩、done 那一刻刷新丢掉整场点球）
// 都藏在这一层，纯函数测试永远抓不到。
// 无 document 时 pumpModal 直接返回，弹窗只进队列不消费——正好让测试自己跑完。
const KO_POOL=[{name:"日本",strength:80},{name:"德国",strength:84},{name:"法国",strength:87},{name:"巴西",strength:89}];
function wcProbe(wil,stage=4){
  const t=G.createInitialState("点球探针",allocation,[],"standard","mid");
  ATTR_KEYS.forEach(k=>t.attrs[k]=82);t.attrs.WIL=wil;
  t.totalMonth=96;t.flags.pro18=true;
  const opp=KO_POOL[stage-3];
  t.national.wcRun={stage,group:[],ko:KO_POOL,results:[],groupWins:2,groupPts:6,alive:true};
  const m={opp:opp.name,strength:opp.strength,gf:1,ga:1,goals:0,assists:0,
    won:null,pen:true,mentality:"均衡",stage};
  t.national.wcRun.results.push(m);t.national.wcRun.penMatch=m;
  t.national.wcRun.shootout=G.newShootout(t,opp);
  G.setState(t);G.clearModalQueue();
  return t;
}
// 把队列跑完，沿途记下每一屏标题和当时的赛果快照
function driveModals(t,pick,cap=300){
  const q=G.getModalQueue(),seen=[];let n=0,last=[];
  while(q.length&&n++<cap){
    const m=q.shift();seen.push(m.title);
    const run=t.national.wcRun;
    if(run&&run.results.length)last=run.results.map(x=>({stage:x.stage,won:x.won,pen:x.pen,penScore:x.penScore}));
    const opts=typeof m.options==="function"?m.options(t):m.options;
    const chosen=opts[pick(m,opts)]||opts[0];
    if(chosen&&chosen.apply)chosen.apply();
  }
  return {steps:n,seen,last};
}
const savedS=G.getState();
try{
  // WIL 80 → 主罚第五轮，所以前四屏必须是队友轮次，第五屏才轮到你
  const p1=wcProbe(80);G.resumeWorldCup(p1);
  const r1=driveModals(p1,()=>0);
  assert.ok(r1.steps<300,"点球流程必须终止");
  assert.ok(/轮到你了/.test(r1.seen[4]||""),`WIL 80 应在第五屏主罚，实际流程 ${r1.seen.slice(0,6).join(" / ")}`);
  assert.ok(r1.last.every(x=>x.won!==null),"跑完后不能还有 won===null 的场次");
  assert.ok(r1.last.every(x=>!x.pen||x.penScore),"点球场次必须写回比分");

  // 三种 WIL 各随机点，检查终止性与结果写回
  let nullLeft=0,noTerm=0,penWritten=0,total=0;
  for(const wil of [80,65,40])for(let i=0;i<12;i++){
    const t=wcProbe(wil);G.resumeWorldCup(t);
    const rr=driveModals(t,(m,o)=>Math.floor(Math.random()*o.length));
    total++;
    if(rr.steps>=300)noTerm++;
    if(rr.last.some(x=>x.won===null))nullLeft++;
    if(rr.last.some(x=>x.pen&&x.penScore))penWritten++;
  }
  assert.equal(noTerm,0,"任何点击组合都必须终止");
  assert.equal(nullLeft,0,"任何路径都不能留下 won===null");
  assert.equal(penWritten,total,"每一场点球都要把比分写回 results");

  // 存档往返：penMatch 与 results 会被 JSON 拆成两个对象，
  // 胜负必须写进 results 而不是那个孤儿副本
  const p2=wcProbe(80);
  const rt=JSON.parse(JSON.stringify(p2));
  assert.equal(rt.national.wcRun.penMatch===rt.national.wcRun.results[0],false,
    "存档往返后 penMatch 与 results[0] 必然是两个对象——这是 bug 的来源，先钉住前提");
  G.setState(rt);G.clearModalQueue();
  G.resumeWorldCup(rt);
  const r2=driveModals(rt,()=>0);
  assert.ok(r2.steps>0,"刷新后能重新进入点球，而不是跳过");
  assert.ok(r2.last.every(x=>x.won!==null),"刷新后胜负仍要写回 results，不能写进孤儿副本");

  // 最刁钻的时点：最后一轮把 shootout 判成 done，收尾弹窗刚入队，saveGame 就在
  // pumpModal 的 finally 里触发。此刻刷新，若恢复逻辑带 !done 守卫就会跳过整场
  // 点球、直接进下一轮——胜负永远写不回去。构造这个瞬间。
  const p3=wcProbe(40);                       // WIL 40 → 主罚第一轮，好推进
  const so3=p3.national.wcRun.shootout;
  G.shootoutPlayerKick(p3,so3,"steady",()=>0);
  let g3=0;while(!so3.done&&!so3.sudden&&g3++<20)G.shootoutAdvance(p3,so3,()=>.5);
  if(so3.sudden){so3.won=true;so3.done=true}       // 突然死亡也归一到 done
  assert.equal(so3.done,true,"已构造出 done=true 的瞬间");
  const rt3=JSON.parse(JSON.stringify(p3));        // 此刻刷新
  G.setState(rt3);G.clearModalQueue();
  G.resumeWorldCup(rt3);
  const r3=driveModals(rt3,()=>0);
  assert.ok(/点球/.test(r3.seen[0]||""),
    `done=true 时刷新必须回到点球收尾，实际首屏是「${r3.seen[0]}」——恢复逻辑跳过了整场点球`);
  assert.ok(r3.last.every(x=>x.won!==null),"done=true 时刷新后胜负仍要写回 results");

// ===== 人物必须出现在世界杯 =====
assert.ok(/assets\/father\.webp/.test(code),"出线后父亲出场");
assert.equal(typeof G.wcFinalEve,"function","决赛前夜有专属场景");
const eveLove=G.createInitialState("热恋",allocation,[],"standard","mid");
const eveA=G.wcFinalEve(eveLove);
assert.match(eveA.portrait,/lin-xiaoman/,"恋爱中是小满");
assert.equal(eveA.options.length,2,"决赛前夜是一个带取舍的二选一");
const eveGone=G.createInitialState("分手",allocation,[],"standard","mid");
eveGone.relationship.status="分手";eveGone.relationship.love=0;
assert.match(G.wcFinalEve(eveGone).portrait,/coach-zhou/,"分手后换成周骁，避免尴尬");
const t1=G.createInitialState("选A",allocation,[],"standard","mid");t1.form=50;t1.fitness=50;
G.wcFinalEve(t1).options[0].apply();
assert.ok(t1.form>50&&t1.fitness<50,"给她打电话：状态↑ 体能↓");
const t2=G.createInitialState("选B",allocation,[],"standard","mid");t2.form=50;t2.fitness=50;
G.wcFinalEve(t2).options[1].apply();
assert.ok(t2.fitness>50&&t2.form===50,"早点睡：体能↑ 状态不变");

// ===== 夺冠与淘汰都要有分量 =====
const champ=G.createInitialState("冠军",allocation,[],"standard","mid");
champ.national.wcRun={stage:7,group:[],ko:[],results:[{opp:"巴西",gf:1,ga:0,goals:1,assists:0,won:true,pen:false,stage:6}],groupWins:2,groupPts:6,alive:true};
G.clearModalQueue();G.wcFinish(champ,true);G.clearModalQueue();
assert.equal(champ.flags.worldChampion,true,"夺冠置位生涯标记");
assert.ok(champ.honours.some(h=>/世界杯/.test(h.title)),"荣誉里有世界杯");
const endChamp=G.buildEnding(champ);
assert.match(endChamp.coda,/世界杯|奖杯/,"退役结局为夺冠单独写一段");
const endPlain=G.buildEnding(G.createInitialState("普通",allocation,[],"standard","mid"));
assert.ok(!/大力神|那只奖杯/.test(endPlain.coda),"没夺过冠的结局不该出现夺冠文案");
const out=G.createInitialState("止步",allocation,[],"standard","mid");
out.national.wcRun={stage:5,group:[],ko:[],results:[{opp:"法国",gf:0,ga:1,goals:0,assists:0,won:false,pen:false,stage:4}],groupWins:1,groupPts:4,alive:false,missedDecisivePenalty:false};
const outScene=G.wcOutroScene(out);
assert.ok(outScene.portrait,"淘汰收尾带立绘，不是空收尾");
const missed={...out,national:{...out.national,wcRun:{...out.national.wcRun,missedDecisivePenalty:true}}};
assert.notEqual(G.wcOutroScene(missed).body,outScene.body,"踢飞与常规淘汰的收尾文案不同");
}finally{G.setState(savedS);G.clearModalQueue()}

for(const file of ["index.html","style.css","app.js","assets/player.webp","assets/lin-xiaoman.webp","assets/father.webp","assets/coach-zhou.webp"]){
  assert.ok(fs.existsSync(path.join(root,file)),`${file} should exist`);
}
const html=fs.readFileSync(path.join(root,"index.html"),"utf8");

// ===== 七边形雷达图 =====
const rs=G.createInitialState("雷达",allocation,[],"standard","mid");
ATTR_KEYS.forEach((k,i)=>rs.attrs[k]=40+i*8);   // 40,48,56,64,72,80,88
const svg=G.radarSVG(rs);
assert.match(svg,/^<svg /,"radarSVG returns an svg element");
assert.match(svg,/viewBox="0 0 240 215"/,"fixed viewBox keeps the sidebar layout stable");
ATTR_KEYS.forEach(k=>assert.ok(svg.includes(">"+k+"<"),`${k} label is rendered`));
ATTR_KEYS.forEach(k=>assert.ok(svg.includes(">"+Math.round(rs.attrs[k])+"<"),`${k} value is rendered`));
// 七个顶点，四层网格环
assert.equal((svg.match(/<polygon/g)||[]).length,5,"four grid rings plus one data polygon");
assert.equal((svg.match(/<circle/g)||[]).length,7,"one dot per vertex");
// 所有坐标都落在 viewBox 内，标签不会被裁掉
const rcoords=[...svg.matchAll(/(?:x|cx|x1|x2)="([-\d.]+)"/g)].map(m=>+m[1]);
assert.ok(Math.min(...rcoords)>=0&&Math.max(...rcoords)<=240,`x coords stay inside the viewBox (${Math.min(...rcoords)}~${Math.max(...rcoords)})`);
const rys=[...svg.matchAll(/(?:y|cy|y1|y2)="([-\d.]+)"/g)].map(m=>+m[1]);
assert.ok(Math.min(...rys)>=0&&Math.max(...rys)<=215,`y coords stay inside the viewBox (${Math.min(...rys)}~${Math.max(...rys)})`);
// 极端值也不能戳出边框
const rsMax=G.createInitialState("满值",allocation,[],"standard","mid");
ATTR_KEYS.forEach(k=>rsMax.attrs[k]=99);
const svgMax=G.radarSVG(rsMax);
const rcMax=[...svgMax.matchAll(/(?:x|cx|x1|x2)="([-\d.]+)"/g)].map(m=>+m[1]);
assert.ok(Math.min(...rcMax)>=0&&Math.max(...rcMax)<=240,"a maxed-out player still fits the viewBox");
assert.match(html,/id="radarPanel"/,"sidebar hosts the radar");
assert.match(html,/id="radarOvr"/,"the radar panel headlines OVR");
assert.ok(!html.includes('id="heightCm"'),"height is no longer a sidebar headline");
assert.ok(!html.includes('id="statBars"'),"the old five-bar list is gone");

// ===== 本场职责：分段控件 =====
// 三张大卡在移动端会塌成单列竖排、高度翻三倍。改成一条 segmented +
// 只显示当前选中项的说明行；三段文案仍留在数据里，只是不再同时全渲染。
assert.equal(G.MATCH_PLANS.length,3,"still exactly three match roles");
G.MATCH_PLANS.forEach(p=>assert.ok(p.name&&p.desc&&Array.isArray(p.effects),
  `${p.id} keeps its copy for the description row`));
const css=fs.readFileSync(path.join(root,"style.css"),"utf8");
assert.ok(!css.includes(".plan-grid"),"the three-card grid is gone");
assert.ok(!/\.plan-card/.test(css),"no stale plan-card rules remain");
assert.ok(css.includes(".plan-seg"),"the segmented control is styled");
assert.match(code,/data-plan=/,"role buttons still carry data-plan for the click handler");
assert.ok(!/plan-card|plan-grid/.test(code),"the renderer no longer emits the old card markup");

// ===== 侧栏进度条不留孤儿配色 =====
// 删掉「心情」那一行之后，.mini-track.violet 成了没人引用的死规则。
// 每个定义出来的配色都必须真有地方在用，否则就是删功能时漏掉的尾巴。
const trackVariants=[...css.matchAll(/\.mini-track\.([a-z]+)\s*i\s*\{/g)].map(m=>m[1]);
assert.ok(trackVariants.length>0,"sanity: 至少应扫到一个 mini-track 配色变体");
trackVariants.forEach(v=>assert.ok(
  new RegExp(`class="mini-track[^"]*\\b${v}\\b`).test(html)||new RegExp(`mini-track[^"\`]*\\b${v}\\b`).test(code),
  `style.css 定义了 .mini-track.${v} 却没有任何地方在用——删功能时漏掉的尾巴`));

// ===== 创建页：身高档位独立选择 + 七项 24 点分配 =====
// heightTier 从 Task 1 起就是 createInitialState 的第五个参数，却一直没有 UI 入口，
// 于是那段档位修正是死代码。这里守的是「选得到、传得下去」这条链路。
assert.match(html,/id="heightPicker"/,"creator hosts a height picker");
assert.match(html,/id="pointsLeft">24</,"creator advertises the 24-point budget");
assert.match(html,/把24点分给七项/,"the allocation copy names all seven attributes");
assert.ok(css.includes(".height-picker"),"the height picker is styled");
assert.match(code,/data-height=/,"height cards carry data-height for the click handler");
assert.match(code,/creatorHeight=b\.dataset\.height/,"clicking a card writes the chosen tier back");
assert.match(code,/createInitialState\(name,creatorAllocation,creatorTalents,creatorDifficulty,creatorHeight\)/,
  "startNewGame hands the chosen tier to createInitialState");
assert.equal((code.match(/creatorHeight="mid"/g)||[]).length,3,
  "the tier is declared once and reset on both restart paths");
assert.ok(!/const HEIGHT_TIERS=\[/.test(code),"the picker reads the single HEIGHT_TIERS table, not a copy of it");

assert.match(html,/id="attributeAllocator"/);
assert.match(html,/data-tab="transfer"/);
assert.match(html,/data-tab="national"/);
assert.match(html,/小满关系/,"relationship status should be labeled clearly");
assert.match(code,/assets\/lin-xiaoman\.webp/);
assert.match(code,/这个月你想怎么过/);
assert.ok(!code.includes("拿什么"+"换未来"));
assert.match(code,/关键球”不设单独数值/,"derived key-moment mechanic should be explained");

// ===== 生涯页展示七维与流派属性标注 =====
// 「技术属性（训练成长）」那张卡还停在两层模型上：把 PAS 印成「视野」和「定位球」两行，
// 同一个数字出现两次。改成七项平铺，并给身高一个落脚点（它已经不在侧栏了）。
const careerSrc=code.split("\n").find(l=>l.startsWith("function renderCareer()"));
assert.ok(careerSrc,"renderCareer stays on one line so it can be checked in isolation");
assert.match(careerSrc,/七项主属性/,"career page explains the flat attribute model");
assert.ok(!careerSrc.includes("技术属性（训练成长）"),"the old two-tier wording is gone");
["射术","爆发","耐力","视野","定位球","心情","队内适应"].forEach(w=>
  assert.ok(!careerSrc.includes(w),`the career page no longer names the deleted「${w}」`));
assert.match(careerSrc,/heightCm/,"height still shows somewhere as background info");
assert.match(careerSrc,/体能见底时/,"the career page explains the condition coefficient");
G.STYLES.forEach(st=>assert.ok(Array.isArray(st.attrs)&&st.attrs.every(k=>ATTR_KEYS.includes(k)),
  `${st.key} declares which attributes it lifts`));
assert.ok(careerSrc.includes('<small>${st.attrs.join("·")}</small>'),
  "style cards print those abbreviations straight from STYLES, so the label can't drift");

// README 得和七项模型对上，且不许把已删掉的变量名写回来
const readme=fs.readFileSync(path.join(root,"README.md"),"utf8");
assert.ok(!/心情|队内适应|五维/.test(readme),"README drops the deleted variables");
ATTR_KEYS.forEach(k=>assert.ok(readme.includes(k),`README names ${k}`));
assert.match(readme,/24点/,"README documents the 24-point budget");
assert.match(readme,/身高档位/,"README documents the height tier choice");

// ===== 赛程表：对手必须提前排定 =====
// 改动前对手是月末 pick(opponentPool(s)) 现抽的，「下一场打谁」这个信息
// 在系统里根本不存在。主界面、日程页、赛前预告全部卡在这一点上。
{
  const t=G.createInitialState("赛程",allocation,[],"standard","mid");
  const sc=G.ensureSchedule(t);
  assert.ok(sc&&Array.isArray(sc.fixtures),"ensureSchedule 返回带 fixtures 的赛程");
  assert.ok(sc.fixtures.length>0,"新档第一赛季就该有比赛");
  // 14岁梯队每3个月一场：第1赛季应落在 totalMonth 0,3,6,9
  // ⚠️ 外面那层 [...] 不能省：app.js 跑在 vm 沙箱里，沙箱内数组的原型与
  // 外部 realm 不同，deepStrictEqual 会报 "same structure but not reference-equal"。
  // 测试文件 :39 与 :426 已有同样的处理，照它们的做法。
  assert.deepEqual([...sc.fixtures.filter(f=>f.type==="club").map(f=>f.month)],[0,3,6,9],
    "梯队期每3个月一场，月份节奏必须与旧 shouldPlayMatch 一致");
  sc.fixtures.forEach(f=>{
    assert.ok(typeof f.opponent==="string"&&f.opponent.length>0,"每场都有对手名");
    assert.ok(Number.isFinite(f.strength),"每场都有对手实力");
    assert.equal(typeof f.home,"boolean","每场都有主客");
    assert.equal(f.status,"upcoming","新排的赛程都是未开始");
    assert.equal(f.result,null,"未开始的比赛没有结果");
  });
  // 幂等：签名没变就不该重排
  const again=G.ensureSchedule(t);
  assert.equal(again,sc,"签名未变时 ensureSchedule 必须返回同一个对象，不能每次重排");
}

console.log("模拟球员 architecture test passed");
