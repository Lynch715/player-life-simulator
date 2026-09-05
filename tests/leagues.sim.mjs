// 联赛体系重构的无头回归：强力球员在欧洲/中超各跑多个赛季，
// 检查洲际资格、四轮洲际赛制、同月多场（最多三场、槽位不重复）、榜面自洽。
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import {fileURLToPath} from "node:url";
const here=path.dirname(fileURLToPath(import.meta.url));
const code=fs.readFileSync(path.join(here,"..","app.js"),"utf8");
const sandbox={console,Date,Math,setTimeout,clearTimeout,window:{},globalThis:{}};
vm.createContext(sandbox);vm.runInContext(code,sandbox);
const G=sandbox.window.PlayerLife;
const ATTR_KEYS=G.ATTR_KEYS;
const allocation={PAC:4,SHO:4,PAS:3,DRI:3,DEF:3,PHY:3,WIL:4};
const drive=async t=>{const q=G.getModalQueue();let n=0;
  while(n++<800){if(!q.length){await new Promise(r=>setTimeout(r,0));if(!q.length)break}
    const m=q.shift();const o=typeof m.options==="function"?m.options(t):m.options;
    if(o&&o[0]&&o[0].apply)try{o[0].apply()}catch(e){console.error("option threw",m.title,e.message)}}};

async function runCareer(label,club,months,attr=90){
  const t=G.createInitialState(label,allocation,[],"standard","mid");
  ATTR_KEYS.forEach(k=>t.attrs[k]=attr);
  t.totalMonth=48;t.flags.pro18=true;t.flags.route16=true;t.route="pro";
  t.club={...club};t.salary=20;
  G.ensureSchedule(t);G.setState(t);G.clearModalQueue();
  const seen={cont:new Set(),contStages:new Set(),cupStage1Seasons:0,contSeasons:0,months:new Map()};
  for(let i=0;i<months&&!t.retired;i++){
    G.setState(t);
    if(t.pendingMatch){G.resumeMatchFlow(t)}
    G.advanceMonth();await drive(t);
    if(t.pendingMatch){G.resumeMatchFlow(t);await drive(t)}
    // 赛程自检：同月最多三场，槽位不重复；大赛月只有那一场；过去的月份没有 upcoming
    if(t.schedule){const byM={},keys=new Set();t.schedule.fixtures.forEach(f=>{if(["club","clubcup","continental","national","wcq","cup"].includes(f.type)){byM[f.month]=(byM[f.month]||0)+1;const k=`${f.month}#${f.slot??0}`;assert.ok(!keys.has(k),`${label}: ${k} 槽位重复`);keys.add(k)}});
      Object.entries(byM).forEach(([m,n])=>assert.ok(n<=3,`${label}: 第${m}月有${n}场比赛`));
      t.schedule.fixtures.forEach(f=>{if(f.type==="cup")assert.equal(byM[f.month],1,`${label}: 大赛月 ${f.month} 还排了别的比赛`);
        if(f.month<t.totalMonth&&f.type!=="award")assert.notEqual(f.status,"upcoming",`${label}: 第${f.month}月 ${f.competition} 成了幽灵场次`)})}
    if(t.contCup&&t.contCup.alive&&t.contCup.comp){seen.cont.add(t.contCup.comp)}
    if(t.contCup&&t.contCup.results)t.contCup.results.forEach(r=>seen.contStages.add(r.stage));
    if(t.league){t.league.teams.forEach(x=>assert.ok(x.p<=t.league.rounds,`${label}: ${x.name} 打了${x.p}场 > ${t.league.rounds}轮`))}
  }
  return {t,seen};
}

// 1. 欧洲豪门：应该进欧冠/欧联，洲际赛事最多 4 轮
{
  const {t,seen}=await runCareer("欧洲探针",{name:"Arsenal",league:"英超",strength:91},12*8,92);
  console.log("欧洲探针 荣誉:",t.honours.map(h=>`${h.title}(S${h.season})`).join(", "));
  console.log("欧洲探针 洲际:",[...seen.cont],"阶段:",[...seen.contStages].sort());
  assert.ok(seen.cont.size>0,"8个赛季 Arsenal 92 能力的球员至少进一次欧战");
  assert.ok([...seen.contStages].every(x=>x<=3),"洲际阶段索引最多到 3");
  const contHon=t.honours.filter(h=>/欧冠|欧联/.test(h.title));
  console.log("欧战冠军次数:",contHon.length);
  assert.ok(!t.honours.some(h=>/亚冠/.test(h.title)),"欧洲球队不该拿亚冠");
}
// 2. 中超：前2进亚冠
{
  const {t,seen}=await runCareer("中超探针",{name:"上海海港",league:"中超",strength:79},12*6,88);
  console.log("中超探针 荣誉:",t.honours.map(h=>`${h.title}(S${h.season})`).join(", "));
  console.log("中超探针 洲际:",[...seen.cont]);
  assert.ok(!seen.cont.has("欧冠")&&!seen.cont.has("欧联"),"中超球队不进欧战");
}
// 3. 转会市场：欧洲各联赛都会出报价；门槛按联赛
{
  const t=G.createInitialState("报价",allocation,[],"standard","mid");
  ATTR_KEYS.forEach(k=>t.attrs[k]=86);
  t.totalMonth=72;t.flags.pro18=true;t.route="pro";t.club={name:"上海海港",league:"中超",strength:79};t.fame=60;
  const leagues=new Set();
  for(let i=0;i<60;i++){G.generateOffers(t,3);t.offers.forEach(o=>leagues.add(o.league))}
  console.log("报价出现过的联赛:",[...leagues]);
  assert.ok(["西甲","德甲","意甲","法甲"].some(l=>leagues.has(l)),"高能力球员该收到新联赛的报价");
  const weak=G.createInitialState("弱报价",allocation,[],"standard","mid");
  weak.totalMonth=72;weak.flags.pro18=true;weak.route="pro";weak.club={name:"辽宁铁人",league:"中超",strength:65};
  for(let i=0;i<40;i++){G.generateOffers(weak,3);weak.offers.forEach(o=>assert.ok(!G.isEuropeanLeague(o.league),`能力不足却收到 ${o.league} 报价`))}
}
// 4. 16岁海外：西班牙目的地 → 西甲梯队 → 18岁进西甲
{
  const t=G.createInitialState("西行",allocation,["scout_magnet"],"standard","mid");
  ATTR_KEYS.forEach(k=>t.attrs[k]=88);t.totalMonth=24;
  const branch=G.routeChoice16(t);
  assert.equal(branch.options.length,3);
  const inv=G.overseasInvites(t);assert.equal(inv.length,3);assert.equal(inv[0].key,"england");
  G.setRoute(t,"overseas","spain");
  assert.equal(t.club.league,"西甲梯队");assert.equal(t.club.name,"巴塞罗那 U19");
  const pool=G.opponentPool(t);assert.equal(pool.length,19,"西甲梯队对手池 19 支");
  assert.ok(pool.every(x=>x.league==="西甲梯队"&&/U19$/.test(x.name)));
  t.totalMonth=48;t.language=60;G.enterProAt18(t);
  assert.equal(t.club.name,"巴塞罗那");assert.equal(t.club.league,"西甲");
  const meta=G.getMeta();assert.ok(meta.unlocked.premier,"登陆五大联赛成就");
  // 德国 18 岁落选 → 圣保利
  const g=G.createInitialState("德行",allocation,[],"standard","mid");
  g.totalMonth=24;G.setRoute(g,"overseas","germany");g.totalMonth=48;g.language=10;G.enterProAt18(g);
  assert.equal(g.club.name,"圣保利");assert.equal(g.club.league,"德甲");
}
// 5. 联赛表：六个联赛球队数与分档
{
  const L=G.LEAGUES;
  assert.equal(Object.keys(L).length,6);
  assert.equal(L["西甲"].clubs.length,20);assert.equal(L["德甲"].clubs.length,18);assert.equal(L["意甲"].clubs.length,20);assert.equal(L["法甲"].clubs.length,18);
  Object.values(L).forEach(l=>assert.ok(l.clubs.some(c=>c.tier===1)&&l.clubs.some(c=>c.tier===3),`${l.key} 三档都要有球队`));
  const names=G.ALL_CLUBS.map(c=>c.name);assert.equal(new Set(names).size,names.length,"球队名不重复");
  // 欧冠池不含自己
  const t=G.createInitialState("池",allocation,[],"standard","mid");t.club={name:"皇家马德里",league:"西甲",strength:92};
  const pool=G.contPool("欧冠",t);assert.ok(pool.length>=12&&!pool.some(c=>c.name==="皇家马德里"));
  assert.ok(G.contPool("欧联",t).every(c=>c.strength<=84));
  assert.ok(G.contPool("亚冠",t).some(c=>c.name==="上海海港"));
}
// 6. 射手榜人名池按联赛语种
{
  for(const [lg,club,re] of [["西甲","皇家马德里",/·/],["德甲","拜仁慕尼黑",/·/],["中超","上海海港",/^[^·]+$/]]){
    const t=G.createInitialState("射手",allocation,[],"standard","mid");
    t.totalMonth=60;t.flags.pro18=true;t.route="pro";t.club={name:club,league:lg,strength:90};
    G.ensureSchedule(t);const L=G.ensureLeague(t);const sc=G.ensureScorers(t,L);
    const one=Object.values(sc)[0].name;assert.match(one,re,`${lg} 射手名 ${one}`);
  }
}
// 7. 同月多场：联赛 + 足协杯 + 世预赛同一个月全部踢完，简报按顺序串起来
{
  const t=G.createInitialState("三赛月",allocation,[],"standard","mid");
  ATTR_KEYS.forEach(k=>t.attrs[k]=88);
  t.totalMonth=86;t.flags.pro18=true;t.flags.route16=true;t.route="pro";t.national.called=true;t.salary=20;
  t.club={name:"上海海港",league:"中超",strength:79};
  G.ensureSchedule(t);G.setState(t);G.clearModalQueue();
  // 找一个有 ≥2 场的月份
  const byM={};t.schedule.fixtures.forEach(f=>{if(f.type!=="award")(byM[f.month]=byM[f.month]||[]).push(f)});
  const target=Object.keys(byM).map(Number).filter(m=>m>t.totalMonth&&byM[m].length>=2).sort((a,b)=>a-b)[0];
  assert.ok(target,"赛季里该有同月多场的月份");
  const titles=[];
  const drive2=async()=>{const q=G.getModalQueue();let n=0;while(n++<800){if(!q.length){await new Promise(r=>setTimeout(r,0));if(!q.length)break}const m=q.shift();titles.push(m.title);const o=typeof m.options==="function"?m.options(t):m.options;if(o&&o[0]&&o[0].apply)try{o[0].apply()}catch(e){console.error("threw",m.title,e.message)}}};
  while(t.totalMonth<target){G.setState(t);if(t.pendingMatch)G.resumeMatchFlow(t);G.advanceMonth();await drive2();if(t.pendingMatch){G.resumeMatchFlow(t);await drive2()}}
  const played=byM[target].map(f=>t.schedule.fixtures.find(x=>x.month===f.month&&(x.slot??0)===(f.slot??0)));
  console.log("多场月",target,played.map(f=>`${f.competition}:${f.status}`).join(" | "));
  played.forEach(f=>assert.ok(f.status==="played"||f.status==="missed",`${f.competition} 停在 ${f.status}`));
  played.forEach(f=>assert.ok(f.result&&Number.isFinite(f.result.gf),`${f.competition} 比分没写回赛程`));
}
console.log("leagues sim passed");
