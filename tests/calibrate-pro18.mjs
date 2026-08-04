/* 标定 enterProAt18 那道门（校园线18岁回归判定）。
   T7 的标定跑到月24就停了，但这道门在月48才判——人群不对。
   这里在「删 scout 之前的 app.js」上跑到月48，量旧门通过率，再反解等宽的 fame 阈值。 */
import fs from "node:fs";import vm from "node:vm";
/* 必须在「删 scout 之前」的 app.js 上跑——scout 已经不存在了，
   现在的代码量不出旧门的通过率。取法：
     git show 7de5e3c:app.js > /tmp/old-app.js
   7de5e3c 是 T8（删 scout）之前的最后一个 commit。 */
const code=fs.readFileSync("/tmp/old-app.js","utf8");
let seed=20260803;
const lcg=()=>((seed=(seed*1664525+1013904223)>>>0)/4294967296);
const MathProxy=new Proxy(Math,{get:(t,k)=>k==="random"?lcg:t[k]});
const sandbox={console,Date,Math:MathProxy,setTimeout,clearTimeout,window:{},globalThis:{}};
vm.createContext(sandbox);vm.runInContext(code,sandbox);
const G=sandbox.window.PlayerLife;
const alloc={PAC:4,SHO:4,PAS:3,DRI:3,DEF:3,PHY:3,WIL:4};
const clamp=n=>Math.max(0,Math.min(100,n));
async function drive(t,cap=400){const q=G.getModalQueue();let n=0;
  while(n++<cap){if(!q.length){await new Promise(r=>setTimeout(r,0));if(!q.length)break}
    const m=q.shift();const o=typeof m.options==="function"?m.options(t):m.options;
    if(!o||!o.length)continue;const c=o[Math.floor(lcg()*o.length)]||o[0];
    if(c&&c.apply)try{c.apply()}catch(e){}}}
(async()=>{
const N=400,rows=[];
for(let i=0;i<N;i++){
  const t=G.createInitialState(`c${i}`,alloc,G.TALENTS.slice(i%18,i%18+3).map(x=>x.id),"standard","mid");
  G.setState(t);G.clearModalQueue();
  for(let m=0;m<48&&!t.retired;m++){
    // 16岁分流强制走校园线——这道门只对校园线有意义
    if(t.totalMonth===24&&!t.flags.route16){G.setRoute(t,"campus")}
    const avail=G.ACTIONS.filter(a=>a.phases.includes(G.phaseOf(t)));
    for(let k=0;k<3&&avail.length;k++){try{avail[Math.floor(lcg()*avail.length)].run(t)}catch(e){}}
    G.setState(t);try{G.advanceMonth()}catch(e){}
    await drive(t);
  }
  if(t.route==="campus"||t.flags.route16)rows.push({scout:t.scout,fame:t.fame,ov:G.overall(t)});
}
const D=G.DIFFICULTIES.standard.threshold,n=rows.length;
const oldGate=38+D;
const passOld=rows.filter(r=>r.scout>=oldGate).length/n;
const fameNew=rows.map(r=>clamp(r.fame+(r.scout-5))).sort((a,b)=>a-b);
let best=null;
for(let T=0;T<=100;T++){const p=fameNew.filter(v=>v>=T).length/n;const d=Math.abs(p-passOld);
  if(!best||d<best.d)best={T,p,d}}
const pct=x=>(x*100).toFixed(1)+"%";
const ss=rows.map(r=>r.scout).sort((a,b)=>a-b);
console.log(`校园线样本 n=${n}，跑到月48，d.threshold=${D}`);
console.log(`旧 scout 分位：p50=${ss[Math.floor(n/2)]} p90=${ss[Math.floor(n*.9)]} max=${ss[n-1]}`);
console.log(`新 fame 分位：p50=${fameNew[Math.floor(n/2)].toFixed(1)} p90=${fameNew[Math.floor(n*.9)].toFixed(1)} max=${fameNew[n-1].toFixed(1)}`);
console.log(`旧门 scout>=${oldGate} 通过率：${pct(passOld)}`);
console.log(`==> 等宽新门：标准难度下 fame>=${best.T}（通过率 ${pct(best.p)}）→ 写进代码：${best.T-D}`);
})();
