/* 一次性标定脚本：16岁分流的后门阈值从 scout 换成 fame，阈值必须重新量。
 *
 * 今天的门槛：overall>=63+d.threshold || scout>=28+d.threshold
 * 改动后 scout 被删，每一次 change(s,"scout",N) 变成等量的 change(s,"fame",N)。
 * 所以新版的 fame ≈ 旧版 fame + (旧版 scout - 起始5)，clamp 到 100。
 * 这让我们能在「当前代码」上一次跑出两个分布，求出等宽的新阈值。
 *
 * 跑法：node tests/calibrate-route16.mjs
 */
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import {fileURLToPath} from "node:url";

const here=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(here,"..");
const code=fs.readFileSync(path.join(root,"app.js"),"utf8");

// 可复现的 LCG，免得每次跑出不同的阈值
// 注入到 sandbox 的 Math.random，让 app.js 内部所有 Math.random() 调用都走 LCG
let seed=20260803;
const lcg=()=>((seed=(seed*1664525+1013904223)>>>0)/4294967296);
// 用 Proxy 包一层：拦截 .random，其余透传到原生 Math
const sandboxMath=new Proxy(Math,{get(t,p){return p==="random"?lcg:t[p]}});

const sandbox={console,Date,Math:sandboxMath,setTimeout,clearTimeout,window:{},globalThis:{}};
vm.createContext(sandbox);
vm.runInContext(code,sandbox);
const G=sandbox.window.PlayerLife;

const allocation={PAC:4,SHO:4,PAS:3,DRI:3,DEF:3,PHY:3,WIL:4};
const N=600;
const clamp=(n)=>Math.max(0,Math.min(100,n));

/* 俱乐部比赛流程是异步的：关键时刻选项里是 setTimeout(()=>stepKeyMoment(s),0)。
   梯队期每3个月一场，同步 while 循环消费完第一个关键时刻就因队列空退出，
   比赛永远不结算——分数全是错的。必须让出宏任务等定时器排进来。 */
async function drive(t,cap=400){
  const q=G.getModalQueue();let n=0;
  while(n++<cap){
    if(!q.length){await new Promise(r=>setTimeout(r,0));if(!q.length)break}
    const m=q.shift();
    const opts=typeof m.options==="function"?m.options(t):m.options;
    if(!opts||!opts.length)continue;
    const c=opts[Math.floor(lcg()*opts.length)]||opts[0];
    if(c&&c.apply)try{c.apply()}catch(e){}
  }
}

const rand=lcg;

(async()=>{
const rows=[];
for(let i=0;i<N;i++){
  const t=G.createInitialState(`标定${i}`,allocation,
    G.TALENTS.slice(i%18,i%18+3).map(x=>x.id),"standard","mid");
  G.setState(t);G.clearModalQueue();
  for(let m=0;m<24&&!t.retired;m++){
    // 随机花掉本月执行点，模拟真实玩家
    const avail=G.ACTIONS.filter(a=>a.phases.includes(G.phaseOf(t)));
    for(let k=0;k<3&&avail.length;k++){
      const a=avail[Math.floor(rand()*avail.length)];
      try{a.run(t)}catch(e){}
    }
    G.setState(t);
    try{G.advanceMonth()}catch(e){}
    await drive(t);
  }
  rows.push({scout:t.scout,fame:t.fame});
}

const D=G.DIFFICULTIES.standard.threshold;
const oldGate=28+D;
const passOld=rows.filter(r=>r.scout>=oldGate).length/N;
const fameNew=rows.map(r=>clamp(r.fame+(r.scout-5))).sort((a,b)=>a-b);

// 求 T 使 P(fameNew>=T) 最接近 passOld
let best=null;
for(let T=0;T<=100;T++){
  const p=fameNew.filter(v=>v>=T).length/N;
  const d=Math.abs(p-passOld);
  if(!best||d<best.d)best={T,p,d};
}

const pct=(x)=>(x*100).toFixed(1)+"%";
const scoutSorted=rows.map(r=>r.scout).sort((a,b)=>a-b);
console.log(`样本 N=${N}，标准难度 threshold=${D}`);
console.log(`旧后门 scout>=${oldGate} 通过率：${pct(passOld)}`);
console.log(`旧 scout 分位：p50=${scoutSorted[Math.floor(N/2)]} p90=${scoutSorted[Math.floor(N*.9)]} max=${scoutSorted[N-1]}`);
console.log(`新 fame 分位：p50=${fameNew[Math.floor(N/2)]} p90=${fameNew[Math.floor(N*.9)]} max=${fameNew[N-1]}`);
console.log(`==> 等宽的新阈值：fame >= ${best.T} + d.threshold（通过率 ${pct(best.p)}）`);
console.log(`   setRoute 那道 scout>=38 的门按同比例换算：fame >= ${Math.round(best.T*38/28)} + d.threshold`);
})();
