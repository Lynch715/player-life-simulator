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

/* 世预赛不再是一屏跑完的纯函数——它现在是排进赛程、逐月踢的六轮。
   旧断言测的是 simulateQualifiers 返回 8 场比赛，那是被取代掉的设计，
   保留它等于把旧管线一直吊着命。改测新管线的排期与出线线。 */
{
  const t=G.createInitialState("世预赛排期",allocation,[],"standard","mid");
  t.totalMonth=84;t.flags.pro18=true;t.route="pro";t.national.called=true;
  t.club={name:"重庆铜梁龙",league:"中超",strength:67};
  G.ensureSchedule(t);
  const q=G.scheduleQualifiers(t,96);
  assert.equal(q.rounds,6,"世预赛是排进赛程的六轮，不再是一屏跑完的八场");
  assert.ok(q.threshold>0&&q.threshold<18,"出线线落在六场十八分的区间内");
  assert.equal(q.played,0,"刚排完还没开踢");
}
const draw=G.cupDraw(seeded(7),G.CUP_CONFIG.world);
assert.equal(draw.group.length,3,"finals draw yields three group opponents");
assert.equal(draw.ko.length,4,"finals draw yields four knockout opponents");
assert.ok(draw.ko[0].strength<=draw.ko[3].strength,"knockout opponents escalate in strength");
const wcMatch=G.cupMatchSim(elite,draw.ko[0],"稳守",4,seeded(9));
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
// 点球是多步交互；若 cupRun 不持久化，第四轮刷一下页面整届世界杯就没了。
assert.ok(!/cupRun=null;\$\("menu"\)/.test(code),"读档不再无条件清空进行中的世界杯");
assert.equal(typeof G.resumeCup,"function","有一个恢复入口");
const wcSave=G.createInitialState("世界杯",allocation,[],"standard","mid");
wcSave.national.cupRun={cup:"world",moments:[],choices:[],stage:4,group:[{name:"A",strength:70}],ko:[{name:"B",strength:80}],
  results:[{opp:"A",gf:1,ga:0,goals:1,assists:0,won:true,pen:false,stage:0}],
  groupWins:1,groupPts:3,alive:true};
const wcRound=JSON.parse(JSON.stringify(wcSave));
assert.equal(JSON.stringify(wcRound.national.cupRun),JSON.stringify(wcSave.national.cupRun),
  "cupRun 是纯 JSON，round-trip 不丢字段");
assert.equal(G.normalizeSave(wcRound).national.cupRun.stage,4,"normalizeSave 保留进行中的世界杯");

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
  const mm=G.cupMatchSim(drawn,{name:"对手",strength:80},"均衡",4,rng);
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
  t.national.cupRun={cup:"world",moments:[],choices:[],stage,group:[],ko:KO_POOL,results:[],groupWins:2,groupPts:6,alive:true};
  const m={opp:opp.name,strength:opp.strength,gf:1,ga:1,goals:0,assists:0,
    won:null,pen:true,mentality:"均衡",stage};
  t.national.cupRun.results.push(m);t.national.cupRun.penMatch=m;
  t.national.cupRun.shootout=G.newShootout(t,opp);
  G.setState(t);G.clearModalQueue();
  return t;
}
// 把队列跑完，沿途记下每一屏标题和当时的赛果快照
function driveModals(t,pick,cap=300){
  const q=G.getModalQueue(),seen=[];let n=0,last=[];
  while(q.length&&n++<cap){
    const m=q.shift();seen.push(m.title);
    const run=t.national.cupRun;
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
  const p1=wcProbe(80);G.resumeCup(p1);
  const r1=driveModals(p1,()=>0);
  assert.ok(r1.steps<300,"点球流程必须终止");
  assert.ok(/轮到你了/.test(r1.seen[4]||""),`WIL 80 应在第五屏主罚，实际流程 ${r1.seen.slice(0,6).join(" / ")}`);
  assert.ok(r1.last.every(x=>x.won!==null),"跑完后不能还有 won===null 的场次");
  assert.ok(r1.last.every(x=>!x.pen||x.penScore),"点球场次必须写回比分");

  // 三种 WIL 各随机点，检查终止性与结果写回
  let nullLeft=0,noTerm=0,penWritten=0,total=0;
  for(const wil of [80,65,40])for(let i=0;i<12;i++){
    const t=wcProbe(wil);G.resumeCup(t);
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
  assert.equal(rt.national.cupRun.penMatch===rt.national.cupRun.results[0],false,
    "存档往返后 penMatch 与 results[0] 必然是两个对象——这是 bug 的来源，先钉住前提");
  G.setState(rt);G.clearModalQueue();
  G.resumeCup(rt);
  const r2=driveModals(rt,()=>0);
  assert.ok(r2.steps>0,"刷新后能重新进入点球，而不是跳过");
  assert.ok(r2.last.every(x=>x.won!==null),"刷新后胜负仍要写回 results，不能写进孤儿副本");

  // 最刁钻的时点：最后一轮把 shootout 判成 done，收尾弹窗刚入队，saveGame 就在
  // pumpModal 的 finally 里触发。此刻刷新，若恢复逻辑带 !done 守卫就会跳过整场
  // 点球、直接进下一轮——胜负永远写不回去。构造这个瞬间。
  const p3=wcProbe(40);                       // WIL 40 → 主罚第一轮，好推进
  const so3=p3.national.cupRun.shootout;
  G.shootoutPlayerKick(p3,so3,"steady",()=>0);
  let g3=0;while(!so3.done&&!so3.sudden&&g3++<20)G.shootoutAdvance(p3,so3,()=>.5);
  if(so3.sudden){so3.won=true;so3.done=true}       // 突然死亡也归一到 done
  assert.equal(so3.done,true,"已构造出 done=true 的瞬间");
  const rt3=JSON.parse(JSON.stringify(p3));        // 此刻刷新
  G.setState(rt3);G.clearModalQueue();
  G.resumeCup(rt3);
  const r3=driveModals(rt3,()=>0);
  assert.ok(/点球/.test(r3.seen[0]||""),
    `done=true 时刷新必须回到点球收尾，实际首屏是「${r3.seen[0]}」——恢复逻辑跳过了整场点球`);
  assert.ok(r3.last.every(x=>x.won!==null),"done=true 时刷新后胜负仍要写回 results");

// ===== 人物必须出现在世界杯 =====
assert.ok(/assets\/father\.webp/.test(code),"出线后父亲出场");
assert.equal(typeof G.cupFinalEve,"function","决赛前夜有专属场景");
const eveLove=G.createInitialState("热恋",allocation,[],"standard","mid");
const eveA=G.cupFinalEve(eveLove);
assert.match(eveA.portrait,/lin-xiaoman/,"恋爱中是小满");
assert.equal(eveA.options.length,2,"决赛前夜是一个带取舍的二选一");
const eveGone=G.createInitialState("分手",allocation,[],"standard","mid");
eveGone.relationship.status="分手";eveGone.relationship.love=0;
assert.match(G.cupFinalEve(eveGone).portrait,/coach-zhou/,"分手后换成周骁，避免尴尬");
const t1=G.createInitialState("选A",allocation,[],"standard","mid");t1.form=50;t1.fitness=50;
G.cupFinalEve(t1).options[0].apply();
assert.ok(t1.form>50&&t1.fitness<50,"给她打电话：状态↑ 体能↓");
const t2=G.createInitialState("选B",allocation,[],"standard","mid");t2.form=50;t2.fitness=50;
G.cupFinalEve(t2).options[1].apply();
assert.ok(t2.fitness>50&&t2.form===50,"早点睡：体能↑ 状态不变");

// ===== 夺冠与淘汰都要有分量 =====
const champ=G.createInitialState("冠军",allocation,[],"standard","mid");
champ.national.cupRun={cup:"world",moments:[],choices:[],stage:7,group:[],ko:[],results:[{opp:"巴西",gf:1,ga:0,goals:1,assists:0,won:true,pen:false,stage:6}],groupWins:2,groupPts:6,alive:true};
G.clearModalQueue();G.cupFinish(champ,true);G.clearModalQueue();
assert.equal(champ.flags.worldChampion,true,"夺冠置位生涯标记");
assert.ok(champ.honours.some(h=>/世界杯/.test(h.title)),"荣誉里有世界杯");
const endChamp=G.buildEnding(champ);
assert.match(endChamp.coda,/世界杯|奖杯/,"退役结局为夺冠单独写一段");
const endPlain=G.buildEnding(G.createInitialState("普通",allocation,[],"standard","mid"));
assert.ok(!/大力神|那只奖杯/.test(endPlain.coda),"没夺过冠的结局不该出现夺冠文案");
const out=G.createInitialState("止步",allocation,[],"standard","mid");
out.national.cupRun={cup:"world",moments:[],choices:[],stage:5,group:[],ko:[],results:[{opp:"法国",gf:0,ga:1,goals:0,assists:0,won:false,pen:false,stage:4}],groupWins:1,groupPts:4,alive:false,missedDecisivePenalty:false};
const outScene=G.cupOutroScene(out);
assert.ok(outScene.portrait,"淘汰收尾带立绘，不是空收尾");
const missed={...out,national:{...out.national,cupRun:{...out.national.cupRun,missedDecisivePenalty:true}}};
assert.notEqual(G.cupOutroScene(missed).body,outScene.body,"踢飞与常规淘汰的收尾文案不同");
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
  // 14岁梯队每3个月一场。第0月不排——advanceMonth 先 S.totalMonth++ 再判定
  // （app.js:1632 在 :1652 之前），第一次判定就是 totalMonth=1，第0月永远打不到。
  // ⚠️ 外面那层 [...] 不能省：app.js 跑在 vm 沙箱里，沙箱内数组的原型与
  // 外部 realm 不同，deepStrictEqual 会报 "same structure but not reference-equal"。
  // 测试文件 :39 与 :426 已有同样的处理，照它们的做法。
  assert.deepEqual([...sc.fixtures.filter(f=>f.type==="club").map(f=>f.month)],[3,6,9],
    "梯队期每3个月一场，且不含打不到的第0月");
  assert.ok(!sc.fixtures.some(f=>f.month===0),
    "第0月永远打不到，排了它只会留一个永远未打的幽灵场次，主界面还会跟着说谎");
  /* 只有「能踢的」场次才需要对手——award 是赛季收官的展示标记，
     没有对手也不该有。用 fixtureOfMonth 走的那套判断来筛，保证两边一致。 */
  const playable=sc.fixtures.filter(f=>["club","national","wcq","cup"].includes(f.type));
  assert.ok(playable.length>0,"sanity: 应该有能踢的场次");
  playable.forEach(f=>{
    assert.ok(typeof f.opponent==="string"&&f.opponent.length>0,"每场都有对手名");
    assert.ok(Number.isFinite(f.strength),"每场都有对手实力");
    assert.equal(typeof f.home,"boolean","每场都有主客");
    assert.equal(f.status,"upcoming","新排的赛程都是未开始");
    assert.equal(f.result,null,"未开始的比赛没有结果");
  });
  // 展示用的行绝不能被当成比赛拿去踢
  sc.fixtures.filter(f=>f.type==="award").forEach(f=>{
    assert.equal(G.fixtureOfMonth({...t,totalMonth:f.month,schedule:{...sc,fixtures:[f]}}),null,
      "赛季评选那一行不能被 fixtureOfMonth 当成一场比赛返回——那会让 prepareMatch 拿到空对手");
  });
  // 幂等：签名没变就不该重排
  const again=G.ensureSchedule(t);
  assert.equal(again,sc,"签名未变时 ensureSchedule 必须返回同一个对象，不能每次重排");
}

// ===== 赛程重建：只换未来，已打的战绩必须留住 =====
// ensureSchedule 存在的全部理由就是这个分支——赛季中途转会不能抹掉半个赛季的比分。
// 幂等那条已经有测试了，这条守的是另一半。
{
  const t=G.createInitialState("重建",allocation,[],"standard","mid");
  t.totalMonth=12;t.route="firstteam";
  t.club={name:"重庆铜梁龙",league:"中超",strength:67};
  const before=G.ensureSchedule(t);
  const months=[...before.fixtures.map(f=>f.month)];
  assert.ok(months.length>=2,"sanity: 这个赛季要有至少两场");

  // 打掉前两场，留下真实战绩
  before.fixtures[0].status="played";before.fixtures[0].result={gf:1,ga:0,goals:1,assists:0,rating:7.2};
  before.fixtures[1].status="played";before.fixtures[1].result={gf:2,ga:2,goals:0,assists:1,rating:6.8};
  const playedMonths=[before.fixtures[0].month,before.fixtures[1].month];
  const oldOpponents=[before.fixtures[0].opponent,before.fixtures[1].opponent];

  // 赛季中途转会 → 签名变化 → 触发重建
  t.totalMonth=months[2];
  t.club={name:"上海海港",league:"中超",strength:79};
  const after=G.ensureSchedule(t);
  assert.notEqual(after,before,"签名变了就必须重建，不能返回老对象");

  // 已打的两场：原样保留，对手和比分都不能被换掉
  playedMonths.forEach((m,i)=>{
    const f=after.fixtures.find(x=>x.month===m);
    assert.ok(f,`第${m}月那场打过了，重建后不能消失`);
    assert.equal(f.status,"played",`第${m}月那场的 played 状态不能被重置`);
    assert.equal(f.opponent,oldOpponents[i],`第${m}月的对手不能被换掉——那场已经踢完了`);
    assert.ok(f.result&&Number.isFinite(f.result.gf),`第${m}月的比分必须留住`);
  });

  // 月份不重复、且严格递增
  const after月 = [...after.fixtures.map(f=>f.month)];
  assert.equal(new Set(after月).size,after月.length,`重建后不能出现重复月份：${after月.join(",")}`);
  assert.deepEqual(after月,[...after月].sort((a,b)=>a-b),"赛程必须按月份升序——nextFixture 靠 find 取第一个未来场次");

  // 未来的联赛场次要反映新东家的联赛（award 是展示行，没有轮次，排除掉）
  const future=after.fixtures.filter(f=>f.month>=t.totalMonth&&f.status==="upcoming"&&f.type==="club");
  assert.ok(future.length>0,"转会后还该有未来的联赛");
  assert.ok(future.every(f=>/第\d+轮/.test(f.competition)),"未来的联赛场次都要有轮次标签");
}

/* 俱乐部比赛流程是异步的：关键时刻的选项里是 setTimeout(()=>stepKeyMoment(s),0)。
   同步的 driveModals 消费完第一个关键时刻就会因队列空而退出，比赛永远不结算。
   这个驱动器在队列空时让出一个宏任务，等定时器把下一屏排进来，再继续。 */
async function driveMatch(t,pick,cap=300){
  const q=G.getModalQueue(),seen=[];let n=0;
  while(n++<cap){
    if(!q.length){await new Promise(r=>setTimeout(r,0));if(!q.length)break}
    const m=q.shift();seen.push(m.title);
    const opts=typeof m.options==="function"?m.options(t):m.options;
    const c=opts[pick(m,opts)]||opts[0];
    if(c&&c.apply)c.apply();
  }
  return {steps:n,seen};
}

// ===== 比赛必须打赛程表上那一场，而不是另抽一个对手 =====
// ⚠️ 第48月是进职业队的换东家月份，不排联赛，改用普通职业期月份 49。
{
  const t=G.createInitialState("对上表",allocation,[],"standard","mid");
  t.totalMonth=49;t.flags.pro18=true;t.route="pro";        // 18岁职业期，每月一场
  t.club={name:"重庆铜梁龙",league:"中超",strength:67};
  G.ensureSchedule(t);
  const fx=G.fixtureOfMonth(t);
  assert.ok(fx,"职业期每个月都该有比赛");
  assert.equal(G.shouldPlayMatch(t),true,"有 fixture 就该踢");

  // ⚠️ advanceMonth 里 S.totalMonth++（app.js:1632）在 shouldPlayMatch（:1652）之前，
  // 所以从第49月「结束本月」，踢的是第50月那场。
  G.setState(t);G.clearModalQueue();
  G.advanceMonth();
  await driveMatch(t,()=>0);          // 必须是 driveMatch，不是同步的 driveModals
  assert.equal(t.totalMonth,50,"sanity: 结束本月后月份已经前进");
  const done=t.schedule.fixtures.find(f=>f.month===50);
  assert.ok(done,"第50月该有一场比赛");
  assert.equal(done.status,"played",`第50月那场应标记 played，实际 ${done.status}`);
  assert.ok(done.result&&Number.isFinite(done.result.gf),"结果必须写回赛程表");
  assert.equal(t.schedule.fixtures.find(f=>f.month===49).status,"upcoming",
    "第49月那场没打过（它是「结束本月」之前的当月），不该被误标成已打");
}

// 伤停时不上场
{
  const t=G.createInitialState("伤停",allocation,[],"standard","mid");
  t.totalMonth=48;t.flags.pro18=true;t.route="pro";
  t.club={name:"重庆铜梁龙",league:"中超",strength:67};
  G.ensureSchedule(t);
  t.injury={name:"脚踝扭伤",months:2,risk:0};
  assert.equal(G.shouldPlayMatch(t),false,"伤停不上场");
}

// ===== 刷新之后，比赛结果仍要写回赛程表 =====
// saveGame 把 pendingMatch.fixture 和 schedule.fixtures[i] 序列化成两份，
// 读档后它们是两个对象。写 pm.fixture 等于写给孤儿副本，赛程上那场
// 永远停在 upcoming，还会变成「月份在过去却未开打」的幽灵场次。
// 点球的 penMatch 踩过一模一样的坑。
{
  // prepareMatch 有约 22% 的概率判定球员未出场，那种局面下比赛当场结算、
  // 没有可供「刷新」的待决状态。重试直到拿到一个真的停在关键时刻的存档，
  // 否则这条测试每五次就会随机翻车一次。
  let rt=null;
  for(let attempt=0;attempt<40&&!rt;attempt++){
    const t=G.createInitialState("刷新写回",allocation,[],"standard","mid");
    t.totalMonth=48;t.flags.pro18=true;t.route="pro";
    t.club={name:"重庆铜梁龙",league:"中超",strength:67};
    G.ensureSchedule(t);
    G.setState(t);G.clearModalQueue();
    G.advanceMonth();                       // 进到第49月
    if(t.pendingMatch&&t.pendingMatch.fixture)rt=JSON.parse(JSON.stringify(t));  // 此刻刷新
    G.clearModalQueue();
  }
  assert.ok(rt,"40次尝试都没造出「停在关键时刻」的存档——prepareMatch 的出场判定可能坏了");
  assert.equal(rt.pendingMatch.fixture===rt.schedule.fixtures.find(f=>f.month===rt.pendingMatch.fixture.month),
    false,"sanity: 存档往返后两者必然是两个对象——这正是 bug 的来源，先钉住前提");

  G.setState(rt);G.clearModalQueue();
  G.resumeMatchFlow(rt);
  await driveMatch(rt,()=>0);

  const fx=rt.schedule.fixtures.find(f=>f.month===49);
  assert.equal(fx.status,"played",
    `刷新后比赛结果必须写回 schedule.fixtures，实际 ${fx.status}——写进孤儿副本了`);
  assert.ok(fx.result&&Number.isFinite(fx.result.gf),"刷新后比分也要写回，不能只改状态");
}

// ===== 伤停的场次要在日程上留痕，不能变成幽灵 =====
// status 规格有三种取值 upcoming/played/missed，missed 就是给伤停和雪藏的。
// 不标记的话这一场永远停在 upcoming，变成「月份在过去却未开打」的幽灵场次，
// 还会被 ensureSchedule 的 past 条件一路带进下个赛季。
{
  const t=G.createInitialState("伤停留痕",allocation,[],"standard","mid");
  t.totalMonth=48;t.flags.pro18=true;t.route="pro";
  t.club={name:"重庆铜梁龙",league:"中超",strength:67};
  G.ensureSchedule(t);
  t.injury={name:"膝伤",months:3,risk:0};
  G.setState(t);G.clearModalQueue();
  G.advanceMonth();                      // 进到第49月，伤停打不了
  await driveMatch(t,()=>0);
  const fx=t.schedule.fixtures.find(f=>f.month===49);
  assert.equal(fx.status,"missed",
    `伤停月份的比赛要标 missed，实际 ${fx.status}——留在 upcoming 就是幽灵场次`);
  assert.ok(/伤停/.test(fx.missReason||""),`要记下为什么没打，实际 missReason=${fx.missReason}`);
}

// 长跑之后不该残留任何幽灵场次（月份在过去、状态却是未开打）
{
  const t=G.createInitialState("无幽灵",allocation,[],"standard","mid");
  G.setState(t);G.clearModalQueue();
  for(let m=0;m<60&&!t.retired;m++){
    G.setState(t);G.advanceMonth();
    await driveMatch(t,()=>0,200);
  }
  /* award 是展示行不是比赛，fixtureRow 会把它渲染成「已结算」，不算幽灵。 */
  const ghosts=t.schedule.fixtures.filter(f=>f.month<t.totalMonth&&f.status==="upcoming"&&f.type!=="award");
  assert.equal(ghosts.length,0,
    `跑到第${t.totalMonth}月还残留幽灵场次（月份在过去却未开打）：${[...ghosts.map(f=>f.month)].join(",")}`);
}

// ===== 月度小结必须排在本月事件之后，并反映事件造成的变化 =====
{
  assert.ok(/typeof d\.body\s*===\s*"function"/.test(code),
    "pumpModal 必须支持惰性 body，否则小结拿不到本月事件造成的属性变化");
}
{
  /* 不能只看队列快照：职业期这个月有比赛，finishMonth 要等比赛走完才执行，
     那时小结才入队。必须把整个月驱动完，用 driveMatch 返回的 seen
     （按出现顺序记录的每一屏标题）来判断顺序。 */
  const t=G.createInitialState("小结顺序",allocation,[],"standard","mid");
  t.totalMonth=49;t.flags.pro18=true;t.route="pro";
  t.club={name:"重庆铜梁龙",league:"中超",strength:67};
  G.ensureSchedule(t);G.setState(t);G.clearModalQueue();
  G.advanceMonth();
  const r=await driveMatch(t,()=>0);
  const idx=r.seen.findIndex(x=>/月度小结/.test(x));
  assert.ok(idx>=0,`这个月该有月度小结，实际弹窗顺序：${r.seen.join(" / ")}`);
  assert.equal(idx,r.seen.length-1,
    `月度小结必须是最后一屏，实际排第 ${idx+1}/${r.seen.length}：${r.seen.join(" / ")}`);
}
// 小结的 body 必须是函数——这是改惰性求值的全部理由
{
  const t=G.createInitialState("小结惰性",allocation,[],"standard","mid");
  t.totalMonth=49;t.flags.pro18=true;t.route="pro";
  t.club={name:"重庆铜梁龙",league:"中超",strength:67};
  G.ensureSchedule(t);G.setState(t);G.clearModalQueue();
  G.advanceMonth();
  let summary=null;
  const r=await driveMatch(t,(m,o)=>{if(/月度小结/.test(m.title))summary=m;return 0});
  assert.ok(summary,`没找到月度小结那一屏：${r.seen.join(" / ")}`);
  assert.equal(typeof summary.body,"function",
    "小结的 body 必须是函数——拼成字符串就等于在事件生效前抢跑，事件的属性变化永远进不了这张表");
}

// ===== 赛前预告：看完对手再决定怎么踢 =====
// 「本场职责」原本是行动页上一个常驻设置，很容易忘了改。
// 挪到赛前这一屏当三选一，相比改动前不多一次点击。
{
  // 球员约22%概率未出场，那种局面下 beginMatch 当场结算、pendingMatch 立刻清空。
  // 重试直到拿到一个真的出场的局面，再断言职责传到了 prepareMatch。
  // （不能为了让断言好写就把「未出场当场结算」推迟成异步——那是拿生产行为迁就测试。）
  let checked=false;
  for(let attempt=0;attempt<40&&!checked;attempt++){
    const t=G.createInitialState("预告",allocation,[],"standard","mid");
    t.totalMonth=48;t.flags.pro18=true;t.route="pro";
    t.club={name:"重庆铜梁龙",league:"中超",strength:67};
    G.ensureSchedule(t);
    G.setState(t);G.clearModalQueue();
    G.advanceMonth();
    const fx=t.schedule.fixtures.find(f=>f.month===49);   // advanceMonth 先 ++，踢的是第49月
    const q=G.getModalQueue();
    const preview=q[0];
    assert.ok(preview,"结束本月后队列里第一屏应该是赛前预告");
    assert.ok(new RegExp(fx.opponent.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")).test(preview.title+String(typeof preview.body==="function"?preview.body(t):preview.body)),
      `预告必须写明对手 ${fx.opponent}，实际标题「${preview.title}」`);
    const opts=typeof preview.options==="function"?preview.options(t):preview.options;
    assert.equal(opts.length,G.MATCH_PLANS.length,
      `预告的选项就是本场职责三选一，应有 ${G.MATCH_PLANS.length} 个，实际 ${opts.length}`);

    const plan2=G.MATCH_PLANS[1].id;
    opts[1].apply();
    assert.equal(t.matchPlan,plan2,"选了哪个职责就该写进 matchPlan");
    if(t.pendingMatch&&t.pendingMatch.pending){          // 真的出场了才有得查
      assert.equal(t.pendingMatch.pending.plan,plan2,
        "prepareMatch 必须拿到预告里选的职责，而不是行动页那个旧默认值");
      checked=true;
    }
    G.clearModalQueue();
  }
  assert.ok(checked,"40次尝试都没遇到球员出场的局面——prepareMatch 的出场判定可能坏了");
}
// 首发概率公式只能有一份：预告屏显示的数必须和 prepareMatch 掷骰用的是同一个
{
  assert.equal(typeof G.startChance,"function","首发概率抽成 startChance");
  assert.ok(!/const rawStart=/.test(code),
    "prepareMatch 里那份 rawStart 必须改调 startChance——留两份会漂移，预告说62%实际按另一个数掷骰");
}

// ===== 换东家的月份不排联赛，生涯剧情不被赛前预告插队 =====
// routeChoice16 / enterProAt18 会当场改掉 s.club。那两个月若排了比赛，
// 赛前预告走 enqueueFront 会插到生涯分流剧情前面——玩家还不知道自己去哪儿，
// 就先给一场「旧俱乐部」的比赛选了职责。
{
  const t=G.createInitialState("分流不插队",allocation,[],"standard","mid");
  t.totalMonth=23;G.ensureSchedule(t);G.setState(t);G.clearModalQueue();
  G.advanceMonth();                                  // → 第24月，16岁
  const kickers=G.getModalQueue().map(m=>m.kicker);
  const life=kickers.findIndex(k=>/生涯分流/.test(k||""));
  const pre=kickers.findIndex(k=>k==="赛前");
  assert.ok(life>=0,`第24月该出16岁分流，实际队列：${kickers.join(" / ")}`);
  assert.ok(pre<0||life<pre,
    `生涯分流必须排在赛前预告之前，实际：${kickers.join(" / ")}`);
  assert.ok(!t.schedule.fixtures.some(f=>f.month===24),
    "第24月是换东家的月份，不该排联赛");
}
{
  const t=G.createInitialState("入职不插队",allocation,[],"standard","mid");
  t.totalMonth=47;t.route="firstteam";t.flags.route16=true;
  t.club={name:"重庆铜梁龙",league:"中超",strength:67};
  G.ensureSchedule(t);G.setState(t);G.clearModalQueue();
  G.advanceMonth();                                  // → 第48月，18岁
  assert.ok(!t.schedule.fixtures.some(f=>f.month===48),
    "第48月是进职业队的月份，不该排联赛");
}

// ===== 主界面必须显示下一场的对手与时间 =====
{
  assert.ok(/id="nextMatch"/.test(html),"now-strip 里要有下一场信息的挂载点");
  assert.ok(/nextMatch/.test(code),"renderAll 要填充下一场信息");
  // 移动端有一条 .now-strip span:not(.live-dot){display:none}，
  // 下一场挂在裸 span 上会被整条藏掉，必须有自己的样式规则
  assert.ok(/\.next-match/.test(css),"下一场需要自己的样式类，不能挂裸 span");
}
{
  const t=G.createInitialState("下一场",allocation,[],"standard","mid");
  G.ensureSchedule(t);
  const nf=G.nextFixture(t);
  assert.ok(nf,"新档就该有下一场");
  assert.equal(nf.month,3,"第一场在第3月——第0月打不到，不排");
  t.totalMonth=4;
  assert.equal(G.nextFixture(t).month,6,"第4月时下一场是第6月");
}
// 「还有几个月」必须按玩家点几次「结束本月」来数，不能差一位
{
  const t=G.createInitialState("倒计时",allocation,[],"standard","mid");
  G.ensureSchedule(t);
  // advanceMonth 先 ++ 再判定：totalMonth=5 时下一场在第6月，
  // 点一次「结束本月」就开打——那是「本月末」，不是「还有1个月」。
  t.totalMonth=5;
  const nf=G.nextFixture(t);
  assert.equal(nf.month,6,"sanity");
  assert.equal(G.fixtureCountdown(t,nf),0,"下一次点结束本月就开打 → 倒计时0（显示「本月末」）");
  t.totalMonth=4;
  assert.equal(G.fixtureCountdown(t,G.nextFixture(t)),1,"隔一个月 → 倒计时1");
}

// ===== 日程页：一整季的赛程看得见 =====
{
  assert.ok(/本赛季日程/.test(code),"「比赛」tab 要扩成赛程页，含本赛季日程");
  assert.ok(/>赛程</.test(html),"导航按钮文案改成「赛程」");
  assert.ok(/\.fixture-row/.test(css),"日程行要有样式");
}
// 伤停的场次要显示原因，不能渲染成「-5个月后」
{
  const t=G.createInitialState("日程渲染",allocation,[],"standard","mid");
  t.totalMonth=48;t.flags.pro18=true;t.route="pro";
  t.club={name:"重庆铜梁龙",league:"中超",strength:67};
  G.ensureSchedule(t);
  const fx=t.schedule.fixtures.find(f=>f.month===49);
  assert.ok(fx,"sanity: 第49月有比赛");
  fx.status="missed";fx.missReason="伤停·膝伤";
  const row=G.fixtureRow(fx,60,null);            // 当前已是第60月，这场在过去
  assert.ok(/未出战/.test(row),`伤停场次要显示「未出战」，实际：${row}`);
  assert.ok(/伤停·膝伤/.test(row),"要写明为什么没打");
  assert.ok(!/-\d+个月后/.test(row),`月份在过去的场次不能渲染成负数倒计时：${row}`);
}
// 未打的场次倒计时要和主界面一致（都走 fixtureCountdown，不许差一位）
{
  const t=G.createInitialState("日程倒计时",allocation,[],"standard","mid");
  G.ensureSchedule(t);
  const fx=t.schedule.fixtures.find(f=>f.month===6);
  assert.ok(/本月末/.test(G.fixtureRow(fx,5,6)),"第5月看第6月那场：下一次点结束本月就打 → 本月末");
  assert.ok(/1个月后/.test(G.fixtureRow(fx,4,6)),"第4月看第6月那场：还有1个月");
}

// ===== 球探已删，后门接到声望 =====
{
  // 天赋 tag 里有个 "scout"（scout_magnet 天赋），那是另一回事，排除掉再查
  assert.ok(!/change\(s,"scout"/.test(code),"没有任何地方还在写 scout");
  assert.ok(!/s\.scout|d\.scout/.test(code.replace(/if\("scout" in d\)\{[^}]*\}/,"")),
    "除了 normalizeSave 的迁移逻辑，不该再有地方读 scout");
  const t=G.createInitialState("无球探",allocation,[],"standard","mid");
  assert.equal("scout" in t,false,"新档不该再有 scout 字段");
  // 老档搬运：练了一年球探的档不能在16岁突然撞墙
  const old={version:3,scout:33,fame:12,national:{},attrs:{},styles:{},relationship:{},injury:{},risks:{}};
  const mig=G.normalizeSave(old);
  assert.equal("scout" in mig,false,"normalizeSave 要删掉 scout");
  assert.equal(mig.fame,12+(33-5),"scout 超出起始值的部分要折进 fame");
}
// 后门宽度必须与改动前持平（阈值来自 tests/calibrate-route16.mjs 实测）
{
  assert.ok(/s\.fame>=44\+d\.threshold/.test(code),
    "16岁分流后门改读 fame，阈值 44 是实测出来的，不是估的");
  assert.ok(/s\.fame>=93\+d\.threshold/.test(code),
    "enterProAt18 的校园线回归判定，阈值 93——它在月48才判，人群和16岁那道门完全不同，单独标定过");
}
// 效果文案不能还写着「球探+N」——数值改了标签没改，比不改更糟。
// 只扫 option(...) 那一层的效果标签：天赋描述里的「球探」是正当用词
// （伯乐缘 scout_magnet 仍然生效，它就是「球探盯上你」的意思），
// 注释里的也不该被这条规则波及。
{
  const optionLines=code.split("\n").filter(l=>/option\(/.test(l));
  const bad=optionLines.filter(l=>/球探\s*[+\-−]?\d/.test(l));
  assert.equal(bad.length,0,
    `效果标签里还写着「球探+N」：\n${bad.map(l=>l.trim().slice(0,90)).join("\n")}`);
}

// ===== 三个只写不读的字段清干净 =====
{
  assert.ok(!/["']study["']/.test(code),"study 一处都没被读过，删干净");
  /* normalizeSave 必须点名这两个字段才能把它们从老档里删掉，
     所以扫描前先把那一行摘出去——否则唯一合法的引用会被自己的断言拦下，
     逼得实现方去写 ["heal"+"th"] 这种为了绕检查而故意难读的代码。 */
  const codeSansMigration=code.replace(/if\(d\.risks\)\{[^}]*\}/g,"");
  assert.ok(!/risks\.health|risks,"health"/.test(codeSansMigration),"健康风险只写不读，归到 injury.risk");
  assert.ok(!/risks\.media|risks,"media"/.test(codeSansMigration),"媒体风险只有一条隐形随机扣分，归到声望");
  const t=G.createInitialState("清场",allocation,[],"standard","mid");
  assert.equal("study" in t,false,"新档没有 study");
  assert.deepEqual(Object.keys(t.risks),["gambling"],"risks 只剩赌博一项");
  assert.ok(!/一轮集中舆论消耗了你的公众信用/.test(code),
    "媒体风险≥65 每月20%概率扣声望，是个玩家看不见的骰子，删掉");
}
{
  const optionLines=code.split("\n").filter(l=>/option\(/.test(l));
  const bad=optionLines.filter(l=>/学业\s*[+\-−]?\d|媒体风险|健康风险/.test(l));
  assert.equal(bad.length,0,
    `效果标签里还写着已删除的属性：\n${bad.map(l=>l.trim().slice(0,90)).join("\n")}`);
}
{
  const old={version:3,study:55,fame:10,risks:{gambling:7,health:20,media:40},
    national:{},attrs:{},styles:{},relationship:{},injury:{}};
  const mig=G.normalizeSave(old);
  assert.equal("study" in mig,false,"normalizeSave 要删掉 study");
  assert.deepEqual(Object.keys(mig.risks),["gambling"],"老档的 risks 也要清干净");
  assert.equal(mig.risks.gambling,7,"赌博风险要留住——它是唯一还活着的那个");
}

console.log("模拟球员 architecture test passed");

// ===== 语言只在海外线 16→18 那两年有意义 =====
// language 最后一次被读是 enterProAt18 的晋升判定（overall>=73 && language>=35）。
// 18岁之后它只涨不用，行动继续挂在职业期就是在骗执行点。
{
  const en=G.ACTIONS.find(a=>a.id==="english");
  assert.ok(en,"英语行动还在");
  assert.equal(en.phases.includes("pro"),false,
    "18岁后没有任何代码读 language，这个行动不该继续出现在职业期");
  assert.ok(en.phases.includes("overseas"),"海外线那两年仍然需要它——那时它是真门槛");
  // 写 language 的事件必须都在 overseas 阶段内，否则同样是空转
  const langEvents=G.EVENTS.filter(e=>/change\(s,"language"/.test(String(e.options)));
  langEvents.forEach(e=>assert.deepEqual([...(e.phase||[])],["overseas"],
    `事件 ${e.id} 写 language，但它不是 overseas 专属——18岁后写它没有任何意义`));
}

// ===== 家庭必须真的起作用，而不只是33个事件写完就沉底 =====
{
  assert.equal(typeof G.familySupport,"function","家庭要有一个像 loveSupport 那样的支撑函数");
  const mk=f=>{const t=G.createInitialState("家",allocation,[],"standard","mid");t.family=f;return t};
  assert.ok(G.familySupport(mk(95))>G.familySupport(mk(60)),"家里越稳，支撑越高");
  assert.ok(G.familySupport(mk(10))<0,"家里出事要是负的");
  assert.ok(/base=52\+loveSupport\(S\)\+familySupport\(S\)/.test(code.replace(/\s/g,"")),
    "familySupport 要接进 form 的基线，而不是每月固定加一笔");
  assert.ok(/id="familyText"/.test(html)&&/id="familyBar"/.test(html),"侧栏要有家庭那一行");
}
// 长跑：家里塌了的档，状态均衡点必须明显低于家里稳的档
{
  const run=fam=>{
    const t=G.createInitialState("均衡家",allocation,[],"standard","mid");
    t.relationship.status="分手";t.relationship.love=0;t.assets.house=false;t.form=52;
    const origR=Math.random;let x=7;Math.random=()=>((x=(x*1664525+1013904223)>>>0)/4294967296);
    try{for(let m=0;m<120&&!t.retired;m++){t.family=fam;G.setState(t);G.advanceMonth()}}catch(e){}finally{Math.random=origR}
    return t.form;
  };
  const hi=run(95),lo=run(10);
  /* 基线差是 4-(-3)=7，但观测到的 form 差会小于它：每月的调整是
     Math.round((base-form)*0.22)，|base-form| 小于 2.3 时就舍入成 0，
     均衡点因此卡在离 base 约两点的地方。这是 form 系统本来的量化行为，
     不该反过来调 familySupport 的档位去迁就一个测试常数。 */
  assert.ok(hi-lo>=3,`家里稳(${hi.toFixed(1)}) 与家里塌(${lo.toFixed(1)}) 的状态均衡点差距太小，家庭没真正起作用`);
  assert.ok(hi>lo,"方向必须对：家里稳的均衡点更高");
}

// ===== 关键时刻的并入规则只能有一份 =====
// 稳妥选项只能认领模型已算出的进球，只有高风险能凭空造球且每场至多一个。
// 世界杯要复用这套规则，绝不能在那边写一套近似版——两套必然漂移。
{
  assert.equal(typeof G.resolveMoments,"function","并入规则抽成共享函数");
  const mk=()=>{const t=G.createInitialState("并入",allocation,[],"standard","mid");
    ATTR_KEYS.forEach(k=>t.attrs[k]=80);return t};
  const t=mk();
  const moments=G.pickMoments(t,()=>.5);
  assert.ok(moments.length>0,"sanity: 能抽到关键时刻");

  // 稳妥选项 + 球队 0 球 → 不许凭空造出进球
  const safeIdx=moments.map(slot=>{
    const m=G.MOMENTS.find(x=>x.id===slot.id);
    const opts=G.momentOptions(t,m);
    const i=opts.findIndex(o=>o.risk==="safe");
    return i<0?0:i;
  });
  const p1={gf:0,ga:0,goals:0,assists:0,keyWins:0,failures:0,timeline:[],
    moments,choices:safeIdx,oppStrength:70,plan:"box"};
  G.resolveMoments(t,p1,()=>0);          // rng=0 → 判定一定成功
  assert.equal(p1.gf,0,"稳妥选项不许把球队比分吹上去——只能认领已有的进球");

  // 高风险选项 + 球队 0 球 → 至多造一个
  const boldIdx=moments.map(slot=>{
    const m=G.MOMENTS.find(x=>x.id===slot.id);
    const opts=G.momentOptions(t,m);
    const i=opts.findIndex(o=>o.risk==="bold");
    return i<0?0:i;
  });
  const p2={gf:0,ga:0,goals:0,assists:0,keyWins:0,failures:0,timeline:[],
    moments,choices:boldIdx,oppStrength:70,plan:"box"};
  G.resolveMoments(t,p2,()=>0);
  assert.ok(p2.gf<=1,`高风险每场至多造一个球（overflow<1），实际 gf=${p2.gf}`);

  // 返回值上要挂着结算量，供 finishMatch 继续用
  assert.equal(typeof p2.ratingDelta,"number","ratingDelta 要挂在返回对象上");
  assert.equal(typeof p2.boldTotal,"number","boldTotal 要挂在返回对象上");
}

// ===== 赛事引擎参数化：亚洲杯与世界杯同构，不许复制粘贴 =====
{
  assert.equal(typeof G.resumeCup,"function","恢复入口更名 resumeCup");
  // 迁移注释和 normalizeSave 里读取旧存档字段 "wcRun" 是合法的，
  // 但不允许有新的 wcRun 变量声明、赋值或用作 key（即 .wcRun= 或 wcRun: 或 const wcRun）
  /* normalizeSave 是 wcRun 唯一还该出现的地方——它得点名旧字段才能把老档
     搬成 cupRun。把整个函数摘掉再扫，否则断言会逼实现方写绕检查的混淆代码
     （这个坑本轮已经踩过一次）。 */
  const codeSansNormalize=code.replace(/function normalizeSave[\s\S]*?\n\}/,"");
  assert.ok(!/\bwcRun\b/.test(codeSansNormalize),"wcRun 必须全部更名 cupRun，留一半旧名字比全不改更糟");
  assert.ok(!/function wc[A-Z]/.test(code),"wc* 函数一律更名 cup*");
  // 在飞存档：正打到半决赛的档不能凭空丢掉整届赛事
  const stale={version:3,national:{wcRun:{stage:5,group:[],ko:[],results:[],groupWins:2,groupPts:6,alive:true}},
    attrs:{},styles:{},relationship:{},injury:{},risks:{}};
  const mig=G.normalizeSave(stale);
  assert.ok(mig.national.cupRun,"老档的 wcRun 要迁成 cupRun");
  assert.equal(mig.national.cupRun.cup,"world","迁过来的赛事是世界杯");
  assert.equal(mig.national.cupRun.stage,5,"进度不能丢");
  assert.equal("wcRun" in mig.national,false,"迁完要删掉旧字段，不能留僵尸");
}

// ===== 亚洲杯：对手池分层，难度不靠拍脑袋的补正 =====
{
  assert.ok(G.ASIA_POOL&&G.ASIA_POOL.length>=11,"亚洲球队强度只留一处定义");
  assert.ok(G.AC_GROUP_POOL.length>=3,"小组赛池够抽3个");
  assert.ok(G.AC_ELITE_POOL.length>=4,"淘汰赛池够抽4个");
  assert.ok(Math.max(...G.AC_GROUP_POOL.map(x=>x.strength))<Math.min(...G.AC_ELITE_POOL.map(x=>x.strength)),
    "小组池必须整体弱于淘汰赛池，否则分层没意义");
  assert.equal(G.AC_GROUP_POOL.length+G.AC_ELITE_POOL.length,G.ASIA_POOL.length,"分层是划分，不是新增");
  assert.ok(G.CUP_CONFIG.world&&G.CUP_CONFIG.asian,"两个赛事各有一份配置");
  assert.notEqual(G.CUP_CONFIG.world.honour,G.CUP_CONFIG.asian.honour,"荣誉标题不同");
}
// 难度差别必须来自对手池，不是判定里的补正
{
  const t=G.createInitialState("难度",allocation,[],"standard","mid");
  ATTR_KEYS.forEach(k=>t.attrs[k]=90);
  let seed=1;const rng=()=>((seed=(seed*1664525+1013904223)>>>0)/4294967296);
  const winRate=pool=>{let w=0;for(let i=0;i<600;i++){
    const opp=pool[i%pool.length];const m=G.cupMatchSim(t,opp,"均衡",5,rng);
    if(m.gf>m.ga)w++}return w/600};
  const asia=winRate(G.AC_ELITE_POOL),world=winRate(G.WC_ELITE_POOL);
  assert.ok(asia>world+.12,
    `同一综合下亚洲杯淘汰赛胜率(${(asia*100).toFixed(0)}%)必须明显高于世界杯(${(world*100).toFixed(0)}%)，且差别只来自对手池`);
}

// ===== 大赛日历：三条线两两不撞 =====
{
  assert.equal(G.cupMonthOf(72),"asian","20岁那年是亚洲杯");
  assert.equal(G.cupMonthOf(96),"world","22岁那年是世界杯");
  assert.equal(G.cupMonthOf(120),"asian","24岁");
  assert.equal(G.cupMonthOf(144),"world","26岁");
  assert.equal(G.cupMonthOf(24),null,"16岁太早，亚洲杯要 >=72");
  assert.equal(G.cupMonthOf(108),null,"23岁刻意留空给俱乐部线");
  assert.equal(G.cupMonthOf(156),null,"27岁同样留空");
  // ⚠️ 跨 vm realm 的数组要先 [...] 展开，否则 deepEqual 报 not reference-equal
  const q=[...G.qualifierMonths(96)];
  assert.deepEqual(q,[84,86,88,90,92,94],"世预赛6轮，每两月一场，末轮距世界杯2个月");
  q.forEach(m=>assert.equal(G.cupMonthOf(m),null,`世预赛第${m}月不能撞上大赛月`));
  assert.deepEqual([...G.qualifierMonths(144)],[132,134,136,138,140,142],"下一届同理");
  // 反查
  assert.equal(G.qualifierRoundAt(88).round,3,"第88月是世预赛第3轮");
  assert.equal(G.qualifierRoundAt(88).wcMonth,96,"它属于第96月那届世界杯");
  assert.equal(G.qualifierRoundAt(85),null,"奇数月不是世预赛轮次");
}
// 排进赛程后，大赛月的国家队比赛取代俱乐部比赛
{
  const t=G.createInitialState("大赛日历",allocation,[],"standard","mid");
  t.totalMonth=120;t.flags.pro18=true;t.route="pro";t.national.called=true;
  t.club={name:"重庆铜梁龙",league:"中超",strength:67};
  const sc=G.ensureSchedule(t);
  const f=sc.fixtures.filter(x=>x.month===120);
  assert.equal(f.length,1,"一个月只能有一场，大赛取代俱乐部比赛");
  assert.equal(f[0].type,"cup","第120月是亚洲杯");
  assert.equal(f[0].cup,"asian","标明是哪个赛事");
}
// 世预赛年：那6个月排的是世预赛，不是联赛
{
  const t=G.createInitialState("世预赛年",allocation,[],"standard","mid");
  t.totalMonth=84;t.flags.pro18=true;t.route="pro";t.national.called=true;
  t.club={name:"重庆铜梁龙",league:"中超",strength:67};
  const sc=G.ensureSchedule(t);
  const wcq=sc.fixtures.filter(x=>x.type==="wcq");
  assert.ok(wcq.length>=3,`第84月起这一季应排上世预赛，实际 ${wcq.length} 轮`);
  wcq.forEach(f=>assert.equal(f.wcMonth,96,"都属于第96月那届"));
}
// 没被征召就不排大赛
{
  const t=G.createInitialState("没征召",allocation,[],"standard","mid");
  t.totalMonth=120;t.flags.pro18=true;t.route="pro";t.national.called=false;
  t.club={name:"重庆铜梁龙",league:"中超",strength:67};
  const sc=G.ensureSchedule(t);
  assert.ok(!sc.fixtures.some(x=>x.type==="cup"||x.type==="wcq"),
    "没进过国家队就不该有大赛日程");
}

// ===== 世预赛从一屏幻灯片摊成一整年 =====
{
  assert.equal(typeof G.scheduleQualifiers,"function","排期与结算拆开");
  assert.equal(typeof G.settleQualifiers,"function");
  const t=G.createInitialState("世预赛",allocation,[],"standard","mid");
  ATTR_KEYS.forEach(k=>t.attrs[k]=80);
  t.totalMonth=84;t.flags.pro18=true;t.route="pro";t.national.called=true;
  t.club={name:"重庆铜梁龙",league:"中超",strength:67};
  G.ensureSchedule(t);
  G.scheduleQualifiers(t,96);
  const q=t.national.wcQual;
  assert.ok(q,"世预赛进度必须存档——它跨越6个月");
  assert.equal(q.wcMonth,96);
  assert.equal(q.rounds,6,"排满6轮");
  assert.equal(q.played,0);
  assert.ok(q.threshold>0&&q.threshold<18,`出线线要落在6场18分的区间内，实际 ${q.threshold}`);
  const opps=[...t.schedule.fixtures.filter(f=>f.type==="wcq").map(f=>f.opponent)];
  assert.ok(opps.every(o=>o&&o.length>0),"排完之后每轮都要有对手");
  assert.equal(new Set(opps).size,opps.length,`6轮对手不能重复：${opps.join("/")}`);
}
// 中途才被征召：阈值按剩余轮数折算，否则新晋国脚必然出局
{
  const t=G.createInitialState("晚征召",allocation,[],"standard","mid");
  t.totalMonth=90;t.flags.pro18=true;t.route="pro";t.national.called=true;
  t.club={name:"重庆铜梁龙",league:"中超",strength:67};
  G.ensureSchedule(t);
  G.scheduleQualifiers(t,96);
  const q=t.national.wcQual;
  assert.ok(q.rounds<6,`月90才征召只剩 ${q.rounds} 轮`);
  assert.ok(q.threshold<8,`剩 ${q.rounds} 轮的出线线必须同比缩小，实际 ${q.threshold}`);
}
// 世预赛要走完整比赛管线：预告 → 关键时刻 → 简报，你的进球真的进积分
{
  const t=G.createInitialState("世预赛可玩",allocation,[],"standard","mid");
  ATTR_KEYS.forEach(k=>t.attrs[k]=85);
  t.totalMonth=83;t.flags.pro18=true;t.route="pro";t.national.called=true;
  t.club={name:"重庆铜梁龙",league:"中超",strength:67};
  G.ensureSchedule(t);G.scheduleQualifiers(t,96);
  G.setState(t);G.clearModalQueue();
  G.advanceMonth();                      // → 第84月，世预赛第1轮
  const r=await driveMatch(t,()=>0);
  assert.ok(/世预赛/.test(r.seen.join(" ")),`应该出现世预赛的屏，实际：${r.seen.join(" / ")}`);
  const q=t.national.wcQual;
  assert.equal(q.played,1,"打完一轮，played 要 +1");
  assert.ok(q.points>=0&&q.points<=3,`一轮最多3分，实际 ${q.points}`);
  assert.equal(q.results.length,1,"结果要记进 wcQual");
  const fx=t.schedule.fixtures.find(f=>f.month===84);
  assert.equal(fx.status,"played","赛程上那一轮要标记已打");
}

// ===== 决赛圈：进球必须是你选的，不是骰子掷的 =====
{
  assert.ok(!/stage<3\)cupPlayMatch/.test(code),
    "小组赛不能再写死均衡——三个阶段都该让玩家定基调");
  assert.equal(typeof G.startCupFinals,"function","大赛入口不能还是空壳");
}
// 小组赛第1场就该给基调三选一
{
  const t=G.createInitialState("决赛圈",allocation,[],"standard","mid");
  ATTR_KEYS.forEach(k=>t.attrs[k]=88);
  t.totalMonth=120;t.flags.pro18=true;t.national.called=true;
  t.national.cupRun={cup:"asian",stage:0,group:G.AC_GROUP_POOL.slice(0,3),
    ko:G.AC_ELITE_POOL.slice(0,4),results:[],groupWins:0,groupPts:0,alive:true,moments:[],choices:[]};
  G.setState(t);G.clearModalQueue();
  G.resumeCup(t);
  const q=G.getModalQueue();
  assert.ok(q.length>0,"决赛圈应该有弹窗");
  const opts=typeof q[0].options==="function"?q[0].options(t):q[0].options;
  assert.equal(opts.length,3,`小组赛第1场也该给基调三选一，实际 ${opts.length} 个选项`);
}
// 整届跑完必须终止，且淘汰赛不留悬空胜负
{
  for(const cup of ["asian","world"]){
    const t=G.createInitialState("整届"+cup,allocation,[],"standard","mid");
    ATTR_KEYS.forEach(k=>t.attrs[k]=90);
    t.totalMonth=120;t.flags.pro18=true;t.national.called=true;
    const cfg=G.CUP_CONFIG[cup];
    t.national.cupRun={cup,stage:0,group:cfg.group().slice(0,3),ko:cfg.elite().slice(0,4),
      results:[],groupWins:0,groupPts:0,alive:true,moments:[],choices:[]};
    G.setState(t);G.clearModalQueue();
    G.resumeCup(t);
    const r=await driveMatch(t,(m,o)=>Math.floor(Math.random()*o.length),500);
    assert.ok(r.steps<500,`${cup} 整届必须终止，实际跑了 ${r.steps} 步`);
    const run=t.national.cupRun;
    if(run)run.results.forEach(x=>assert.ok(x.stage<3||x.won!==null,
      `${cup} 淘汰赛第${x.stage}阶段留下了 won===null`));
    G.clearModalQueue();
  }
}
/* 关键时刻的结果必须真的并进这场比赛。
   不要用「全选高风险 vs 全选稳妥，进球数必须不同」来测——那是在断言
   两个随机抽样不相等，本来就会偶尔相等（实测 30 次里挂 3 次），而且
   选项下标同时改掉了本场基调，测的其实是两件事混在一起。
   改成确定性判断：resolveMoments 产出的时间线有没有被挂到这场比赛上。
   claimGoal/overflow 的数值规则已由 resolveMoments 自己的单测钉住。 */
{
  const t=G.createInitialState("并入决赛圈",allocation,[],"standard","mid");
  ATTR_KEYS.forEach(k=>t.attrs[k]=90);
  t.totalMonth=120;t.flags.pro18=true;t.national.called=true;
  t.national.cupRun={cup:"asian",stage:0,group:G.AC_GROUP_POOL.slice(0,3),
    ko:G.AC_ELITE_POOL.slice(0,4),results:[],groupWins:0,groupPts:0,alive:true,moments:[],choices:[]};
  G.setState(t);G.clearModalQueue();
  G.resumeCup(t);
  const q=G.getModalQueue();let n=0,sawMoment=false;
  while(q.length&&n++<40){
    const m=q.shift();
    if(/关键时刻/.test(m.kicker||""))sawMoment=true;
    const o=typeof m.options==="function"?m.options(t):m.options;
    if(!o||!o.length)continue;
    if(o[0]&&o[0].apply)try{o[0].apply()}catch(e){}
    if(((t.national.cupRun||{}).results||[]).length)break;
  }
  assert.ok(sawMoment,"决赛圈每场都该先出一个关键时刻");
  const res=(t.national.cupRun||{}).results||[];
  assert.ok(res.length>0,"应该打完了一场");
  assert.ok(Array.isArray(res[0].momentLines),
    "关键时刻的结果必须挂到这场比赛上（momentLines），否则就是走个过场没并进比分");
  G.clearModalQueue();
}

// ===== 出局与夺冠都要有分量，且亚洲杯不许穿世界杯的衣服 =====
{
  assert.ok(!/差一口气，四年后再来/.test(code),"世预赛出局的旧敷衍文案要换掉");
  assert.ok(/最后一轮的终场哨/.test(code),"世预赛出局要有一个和夺冠等重的场景");
}
{
  // 亚洲杯夺冠：整条收尾链里不许出现大力神杯
  const t=G.createInitialState("亚洲杯收尾",allocation,[],"standard","mid");
  t.national.cupRun={cup:"asian",stage:7,group:[],ko:[],moments:[],choices:[],
    results:[{opp:"日本",gf:2,ga:1,goals:1,assists:0,won:true,stage:6}],
    groupWins:2,groupPts:6,alive:true};
  G.setState(t);G.clearModalQueue();
  G.cupFinish(t,true);
  const q=G.getModalQueue();const seen=[];let n=0;
  while(q.length&&n++<50){const m=q.shift();
    seen.push(m.title+"|"+String(typeof m.body==="function"?m.body(t):m.body)+"|"+(m.kicker||""));
    const o=typeof m.options==="function"?m.options(t):m.options;
    if(o&&o[0]&&o[0].apply)try{o[0].apply()}catch(e){}}
  const all=seen.join(" ");
  assert.ok(!/大力神杯/.test(all),`亚洲杯夺冠不能出现大力神杯——那是世界杯的东西：${seen.map(x=>x.split("|")[0]).join(" / ")}`);
  assert.ok(!/世界冠军/.test(all),"亚洲杯夺冠不能自称世界冠军");
  assert.ok(/亚洲杯/.test(all),"要说清是哪个冠军");
  G.clearModalQueue();
}
{
  // 收尾场景的尾巴：亚洲杯说两年后，世界杯说四年后
  const mk=cup=>{const t=G.createInitialState("尾巴",allocation,[],"standard","mid");
    t.totalMonth=cup==="asian"?120:96;
    t.national.cupRun={cup,stage:7,group:[],ko:[],results:[],moments:[],choices:[],alive:false};
    return G.cupOutroScene(t)};
  assert.ok(/两年后就是世界杯/.test(mk("asian").body),"亚洲杯之后是两年后的世界杯，不是四年");
  assert.ok(/四年后/.test(mk("world").body),"世界杯之后才是四年");
}

// ===== 一届大赛只能开一次 =====
// 出线只是把决赛圈排进日程，真正开踢由那个月的 type:"cup" fixture 触发。
// 曾经两边都开：世预赛结算时先打一遍（还提前两个月），到了世界杯月又打一遍，
// worldCups 计数翻倍，整届比赛玩两次。
{
  const drive=async t=>{const q=G.getModalQueue();let n=0;
    while(n++<600){if(!q.length){await new Promise(r=>setTimeout(r,0));if(!q.length)break}
      const m=q.shift();const o=typeof m.options==="function"?m.options(t):m.options;
      if(o&&o[0]&&o[0].apply)try{o[0].apply()}catch(e){}}};
  const t=G.createInitialState("只开一次",allocation,[],"standard","mid");
  ATTR_KEYS.forEach(k=>t.attrs[k]=90);
  t.totalMonth=83;t.flags.pro18=true;t.route="pro";t.national.called=true;
  t.club={name:"上海海港",league:"中超",strength:79};
  G.ensureSchedule(t);G.setState(t);G.clearModalQueue();
  for(let i=0;i<16;i++){G.setState(t);G.advanceMonth();await drive(t)}
  assert.ok((t.national.worldCups||0)<=1,
    `一届世界杯最多只能计一次，实际 ${t.national.worldCups} 次——多半是世预赛结算和日程 fixture 两边都开了赛`);
  assert.ok(!/setupCupFinals/.test(code),
    "setupCupFinals 是那条重复入口，已经没人用了，不该留着诱导下一个人再接一次");
}

// ===== 国家队友谊赛必须排进赛程，不能凭空冒出来 =====
// 以前它挂在 finishMonth 里、条件是「当月没有俱乐部比赛」——可职业期每个月
// 都有比赛，那条线几乎永远不触发；而且它不在赛程表上，主界面和日程页都
// 预告不到，是凭空弹出的一屏。
{
  const t=G.createInitialState("友谊赛",allocation,[],"standard","mid");
  ATTR_KEYS.forEach(k=>t.attrs[k]=88);
  t.totalMonth=48;t.flags.pro18=true;t.route="pro";t.national.called=true;
  t.club={name:"上海海港",league:"中超",strength:79};
  G.ensureSchedule(t);
  const nat=t.schedule.fixtures.filter(f=>f.type==="national");
  assert.ok(nat.length>0,"被征召后赛程上就该有友谊赛");
  nat.forEach(f=>{
    assert.equal(f.month%6,0,`友谊赛每半年一场，第${f.month}月不该有`);
    assert.ok(f.opponent&&f.strength>0,"友谊赛也要有对手和实力，主界面才预告得出来");
    assert.equal(f.competition,"国家队友谊赛");
  });
  // 没被征召就不该有
  const t2=G.createInitialState("没征召",allocation,[],"standard","mid");
  t2.totalMonth=48;t2.flags.pro18=true;t2.route="pro";
  t2.club={name:"上海海港",league:"中超",strength:79};
  assert.equal(G.ensureSchedule(t2).fixtures.some(f=>f.type==="national"),false,
    "没被征召过就不该有国家队日程");
  // 旧的那条凭空触发的路必须已经拆掉
  assert.ok(!/queueNationalReport\(simulateNationalMatch\(S\)\)/.test(code),
    "友谊赛不该再由 finishMonth 里那条「当月没比赛才打」的死路触发");
}
// 友谊赛打完，结果要写回赛程表（日程页才看得到比分）
{
  const drive=async t=>{const q=G.getModalQueue();let n=0;
    while(n++<400){if(!q.length){await new Promise(r=>setTimeout(r,0));if(!q.length)break}
      const m=q.shift();const o=typeof m.options==="function"?m.options(t):m.options;
      if(o&&o[0]&&o[0].apply)try{o[0].apply()}catch(e){}}};
  const t=G.createInitialState("友谊赛结果",allocation,[],"standard","mid");
  ATTR_KEYS.forEach(k=>t.attrs[k]=88);
  t.totalMonth=53;t.flags.pro18=true;t.route="pro";t.national.called=true;
  t.club={name:"上海海港",league:"中超",strength:79};
  G.ensureSchedule(t);G.setState(t);G.clearModalQueue();
  const capsBefore=t.national.caps;
  G.advanceMonth();await drive(t);
  const f=t.schedule.fixtures.find(x=>x.month===54);
  assert.equal(f.type,"national","sanity: 第54月是友谊赛");
  assert.equal(f.status,"played","打完要标记，否则会变成幽灵场次");
  assert.ok(f.result&&Number.isFinite(f.result.gf),"比分要写回赛程表");
  assert.ok(t.national.caps>capsBefore,"友谊赛也要计国家队出场");
}

// ===== 赛程不能跨赛季无限堆积 =====
// ensureSchedule 会保留「已打过的」场次以免转会抹掉战绩，但少了赛季边界这道闸，
// 每翻一季就把上一季整季留下——实测跑到第60月时「本赛季日程」列出 41 行、
// 跨越第3~71月，而一季最多12场。
{
  const drive=async t=>{const q=G.getModalQueue();let n=0;
    while(n++<400){if(!q.length){await new Promise(r=>setTimeout(r,0));if(!q.length)break}
      const m=q.shift();const o=typeof m.options==="function"?m.options(t):m.options;
      if(o&&o[0]&&o[0].apply)try{o[0].apply()}catch(e){}}};
  const t=G.createInitialState("不堆积",allocation,[],"standard","mid");
  G.setState(t);G.clearModalQueue();
  for(let m=0;m<120&&!t.retired;m++){G.setState(t);G.advanceMonth();await drive(t)}
  const ss=Math.floor(t.totalMonth/12)*12;
  const stray=t.schedule.fixtures.filter(f=>f.month<ss&&f.type!=="wcq");
  assert.equal(stray.length,0,
    `赛程里残留了 ${stray.length} 场上赛季的比赛（月份 ${[...stray.map(f=>f.month)].join(",")}）——` +
    `ensureSchedule 保留过去场次时漏了赛季边界，日程页会把历年比赛全列成「本赛季」`);
  assert.ok(t.schedule.fixtures.length<=14,
    `一季最多12场比赛+1行赛季评选，实际 ${t.schedule.fixtures.length} 行`);
}

