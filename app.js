"use strict";

const SAVE_KEY="player_life_save_v1",META_KEY="player_life_meta_v1",VERSION=2;
const DIFFICULTIES={
  standard:{key:"standard",name:"标准",tag:"已经不轻松",desc:"成长偏慢、伤病更多、门槛更高。默认就比旧版难，适合第一次认真通关。",growth:.8,soft:1,injury:1.3,threshold:2,income:.85,expense:1,decayAge:31,retireAge:35},
  hard:{key:"hard",name:"困难",tag:"硬核",desc:"成长很慢、资源紧张、状态易崩，失败会被雪藏或降薪。需要精打细算每一个执行点。",growth:.64,soft:1.25,injury:1.7,threshold:5,income:.7,expense:1.25,decayAge:30,retireAge:34},
  brutal:{key:"brutal",name:"严酷",tag:"一步错步步错",desc:"巅峰短暂、伤病凶狠、账面永远紧张，一次贪婪可能毁掉整段生涯。大部分存档踢不出职业。",growth:.5,soft:1.6,injury:2.2,threshold:9,income:.55,expense:1.6,decayAge:29,retireAge:33}
};
function diffOf(s){return DIFFICULTIES[s&&s.difficulty]||DIFFICULTIES.standard}
function softFactor(cur,d){let f=cur>=88?.25:cur>=82?.4:cur>=75?.6:cur>=68?.8:1;if(cur>=68)f/=d.soft;return f}
const CORE_STATS=[
  {key:"height",name:"身高",sub:"制空与对抗",icon:"↥"},
  {key:"speed",name:"速度",sub:"持续冲刺",icon:"»"},
  {key:"burst",name:"爆发",sub:"启动与摆脱",icon:"ϟ"},
  {key:"stamina",name:"耐力",sub:"高强度续航",icon:"∞"},
  {key:"will",name:"意志",sub:"抗压与临场稳定",icon:"◆"}
];
const TALENTS=[
  {id:"explosive_start",icon:"ϟ",name:"一步先机",desc:"爆发训练收益+25%，突破第一步成功率提高。",tags:["burst","dribble"]},
  {id:"box_instinct",icon:"◎",name:"禁区嗅觉",desc:"禁区内射门与补射事件更容易转化为进球。",tags:["finish","goal"]},
  {id:"big_heart",icon:"◆",name:"大心脏",desc:"意志类训练收益+18%，世界杯淘汰赛和点球大战表现更稳。",tags:["will","clutch"]},
  {id:"iron_man",icon:"▰",name:"铁人",desc:"疲劳导致的受伤概率降低40%。",tags:["injury","stamina"]},
  {id:"aerial_king",icon:"↥",name:"空霸",desc:"头球、背身与高空对抗发动率提高。",tags:["height","header"]},
  {id:"free_kick",icon:"⌁",name:"任意球专家",desc:"定位球训练收益+30%，比赛中可能直接破门。",tags:["setpiece","goal"]},
  {id:"ambidextrous",icon:"Ⅱ",name:"逆足精通",desc:"弱侧射门不再明显降质，过人路线更多。",tags:["finish","dribble"]},
  {id:"captain",icon:"♛",name:"绿茵领袖",desc:"队友事件与国家队适应更有利，更易成为队长。",tags:["will","team"]},
  {id:"football_iq",icon:"◇",name:"高球商",desc:"录像、战术与助攻类行动收益+25%。",tags:["vision","tactics"]},
  {id:"engine",icon:"∞",name:"永动机",desc:"耐力训练收益+25%，比赛后体能消耗降低。",tags:["stamina","fitness"]},
  {id:"pressure_proof",icon:"▣",name:"抗压体质",desc:"替补、舆论和打压造成的状态损失减半。",tags:["will","media"]},
  {id:"scout_magnet",icon:"◉",name:"伯乐缘",desc:"球探事件与高一级俱乐部报价概率提高。",tags:["scout","transfer"]},
  {id:"language_gift",icon:"A",name:"语言天分",desc:"英语学习收益翻倍，海外适应更快。",tags:["language","overseas"]},
  {id:"childhood_bond",icon:"♥",name:"青梅羁绊",desc:"与林小满相处时关系收益提高，冲突缓冲一次。",tags:["love","will"]},
  {id:"quick_healer",icon:"✚",name:"伤愈加速",desc:"伤停时间减少1个月，康复行动额外恢复。",tags:["recovery","injury"]},
  {id:"super_sub",icon:"↗",name:"超级替补",desc:"替补登场时状态加成，进球概率不低于首发的80%。",tags:["sub","goal"]},
  {id:"home_favorite",icon:"⌂",name:"主场宠儿",desc:"主场比赛状态更好，球迷与声望增长更快。",tags:["home","fame"]},
  {id:"red_shirt",icon:"★",name:"红色战袍",desc:"国家队征召门槛降低，国家队比赛表现小幅提高。",tags:["national","will"]},
  {id:"final_master",icon:"▲",name:"决赛先生",desc:"世界杯决赛表现获得额外加成。",tags:["final","clutch"]},
  {id:"training_rat",icon:"□",name:"训练模范",desc:"正式训练额外提升教练信任，偶尔触发双倍成长。",tags:["training","coach"]}
];

const CSL_CLUBS=[
  ["上海海港",79],["上海申花",78],["成都蓉城",77],["北京国安",76],
  ["山东泰山",75],["天津津门虎",70],["浙江俱乐部",71],["云南玉昆",69],
  ["青岛西海岸",67],["河南俱乐部",68],["大连英博",68],["深圳新鹏城",66],
  ["武汉三镇",66],["青岛海牛",64],["辽宁铁人",65],["重庆铜梁龙",67]
].map(([name,strength],i)=>({id:`csl_${i}`,name,league:"中超",strength,tier:strength>=75?1:strength>=69?2:3}));

const PL_CLUBS=[
  ["Arsenal",91],["Aston Villa",84],["Bournemouth",78],["Brentford",79],["Brighton",81],
  ["Chelsea",88],["Crystal Palace",80],["Coventry City",74],["Everton",79],["Fulham",79],
  ["Hull City",73],["Ipswich Town",74],["Leeds United",76],["Liverpool",92],["Manchester City",92],
  ["Manchester United",85],["Newcastle United",86],["Nottingham Forest",82],["Sunderland",75],["Tottenham Hotspur",84]
].map(([name,strength],i)=>({id:`pl_${i}`,name,league:"英超",strength,tier:strength>=88?1:strength>=81?2:3}));

const CAMPUS_CLUBS=[
  ["重庆南开中学",58],["巴蜀中学",57],["重庆一中",56],["西南大学附中",55],
  ["重庆八中",54],["育才中学",53],["求精中学",51],["复旦中学",50],
  ["重庆外国语学校",52],["江北中学",49]
].map(([name,strength],i)=>({id:`cp_${i}`,name:`${name}校队`,league:"校园联赛",strength,tier:3}));

const NATIONAL_OPPONENTS=[
  {name:"日本",strength:86},{name:"韩国",strength:84},{name:"伊朗",strength:83},{name:"澳大利亚",strength:81},
  {name:"沙特阿拉伯",strength:79},{name:"卡塔尔",strength:78},{name:"乌兹别克斯坦",strength:77},{name:"泰国",strength:69}
];

const PROLOGUE=[
  {kicker:"序章 · 200?年",title:"那只旧足球",portrait:"assets/father.webp",body:["你出生在一个普通却温暖的家庭。父亲工资不高，但总能在周末挤出两个小时，陪你把一只旧足球踢到天黑。","<span class='dialogue'>“我不敢保证你一定能踢出来。但只要你认真，我就站在场边。”</span>"]},
  {kicker:"序章 · 童年",title:"她总比终场哨更早等你",portrait:"assets/lin-xiaoman.webp",body:["林小满住在同一栋楼。你踢球，她写作业；你输了，她把汽水推过来；你赢了，她只说一句“别得意”。","<span class='dialogue'>“以后你去很远的地方比赛，也要告诉我比分。”</span>"]},
  {kicker:"第1章 · 14岁",title:"梯队名单上的最后一个名字",portrait:"assets/coach-zhou.webp",body:["14岁那年，你入选当地知名俱乐部重庆铜梁龙的U16梯队。周骁教练把名单贴在更衣室门口，你的名字在最后一行。","<span class='dialogue'>“进来不代表留下。以后怎么练、要不要休息，都由你自己定。”</span>"]}
];

const ACHIEVEMENTS=[
  {id:"first_action",icon:"◇",name:"第一滴汗",desc:"完成第一次行动"},
  {id:"academy_70",icon:"↗",name:"梯队尖子",desc:"16岁前综合能力达到70"},
  {id:"debut",icon:"▣",name:"职业首秀",desc:"完成一线队首场比赛"},
  {id:"first_goal",icon:"◎",name:"第一粒进球",desc:"职业比赛破门"},
  {id:"hat_trick",icon:"3",name:"帽子戏法",desc:"单场攻入3球"},
  {id:"fifty_goals",icon:"50",name:"五十球",desc:"生涯进球达到50"},
  {id:"hundred_goals",icon:"100",name:"百球先生",desc:"生涯进球达到100"},
  {id:"fifty_assists",icon:"A",name:"传球大师",desc:"生涯助攻达到50"},
  {id:"national",icon:"★",name:"为国而战",desc:"首次入选中国国家队"},
  {id:"national_goal",icon:"红",name:"国字号首球",desc:"国家队比赛破门"},
  {id:"world_cup",icon:"世",name:"世界之巅",desc:"赢得世界杯"},
  {id:"ballon",icon:"●",name:"金球先生",desc:"赢得金球奖"},
  {id:"league_title",icon:"♛",name:"联赛冠军",desc:"赢得顶级联赛"},
  {id:"premier",icon:"PL",name:"登陆英超",desc:"正式加盟英超俱乐部"},
  {id:"injury_return",icon:"✚",name:"伤愈归来",desc:"重伤后重返赛场"},
  {id:"loyal_love",icon:"♥",name:"长久陪伴",desc:"24岁仍与林小满相爱"},
  {id:"deep_bond",icon:"❤",name:"心照不宣",desc:"与林小满关系值达到95"},
  {id:"married",icon:"戒",name:"步入婚姻",desc:"与林小满结婚"},
  {id:"clean_career",icon:"盾",name:"干净的球衣",desc:"完成5个赛季且从未涉赌"},
  {id:"captain_armband",icon:"C",name:"队长袖标",desc:"成为俱乐部或国家队队长"}
];

const ACTIONS=[
  {id:"team_training",phases:["academy","firstteam","overseas","pro"],icon:"▣",name:"按时参加合练",desc:"把最无聊的基本功做得比别人更标准。",effects:["耐力↑","技术↑","教练信任↑"],max:2,run:s=>{gainStat(s,"stamina",.45,"stamina");gainSkill(s,"finishing",.28,"finish");gainSkill(s,"dribble",.25,"training");change(s,"coachFavor",hasTalent(s,"training_rat")?5:3);change(s,"fitness",-8);if(hasTalent(s,"training_rat")&&chance(.18)){gainSkill(s,"vision",.6);log(s,"good","训练模范发动：你留下加练的细节被教练看见。")}}},
  {id:"sprint",phases:["academy","firstteam","overseas","pro","campus"],icon:"»",name:"冲刺与折返",desc:"用乳酸和喘息换来更快的第一步。",effects:["速度↑","爆发↑","伤病风险"],max:2,run:s=>{gainStat(s,"speed",.65,"speed");gainStat(s,"burst",.55,"burst");change(s,"fitness",-13);fatigueInjuryCheck(s,.035)}},
  {id:"shooting",phases:["academy","firstteam","overseas","pro","campus"],icon:"◎",name:"加练射门",desc:"近角、远角、抢点和逆足，各练五十次。",effects:["射术↑","意志↑","体能↓"],max:2,run:s=>{gainSkill(s,"finishing",.78,"finish");gainStat(s,"will",.26,"will");change(s,"fitness",-10)}},
  {id:"tactics",phases:["academy","firstteam","overseas","pro","campus"],icon:"◇",name:"复盘比赛录像",desc:"理解为什么跑位正确，却还是没有接到球。",effects:["视野↑","球商判定↑","状态↑"],max:2,run:s=>{gainSkill(s,"vision",.72,"vision");gainSkill(s,"dribble",.18,"tactics");change(s,"form",3)}},
  {id:"setpiece",phases:["academy","firstteam","overseas","pro","campus"],icon:"⌁",name:"练定位球",desc:"把球摆在草皮同一处，反复练习弧线和落点。",effects:["定位球↑","意志小幅↑"],max:2,run:s=>{gainSkill(s,"setPiece",.8,"setpiece");gainStat(s,"will",.18,"clutch");change(s,"fitness",-7)}},
  {id:"date",phases:["academy","firstteam","campus","pro"],icon:"♥",name:"偷偷去见小满",desc:"训练结束后绕远路，陪她走回家。",effects:["耐力↑","意志↑","感情↑","教练信任可能↓"],max:1,show:s=>["恋人","暧昧"].includes(s.relationship.status),run:s=>{gainStat(s,"stamina",.25,"love");gainStat(s,"will",.42,"love");changeLove(s,hasTalent(s,"childhood_bond")?11:8);change(s,"morale",7);if(chance(.28)){change(s,"coachFavor",-3);log(s,"warn","你迟到了七分钟。周骁没有骂你，只在名单上画了一个圈。")}}},
  {id:"video_call",phases:["overseas","pro"],icon:"◫",name:"和小满通话",desc:"时差、赛程和沉默都要有人先开口。",effects:["感情↑","状态↑","语言时间↓"],max:1,show:s=>["异地","恋人"].includes(s.relationship.status),run:s=>{changeLove(s,hasTalent(s,"childhood_bond")?9:6);change(s,"morale",6);change(s,"coachFavor",-1)}},
  {id:"english",phases:["overseas","pro"],icon:"A",name:"认真学英语",desc:"能听懂战术是一回事，敢在更衣室开口是另一回事。",effects:["语言↑","海外适应↑","意志↑"],max:2,run:s=>{change(s,"language",hasTalent(s,"language_gift")?14:7);gainStat(s,"will",.28,"language");change(s,"form",2)}},
  {id:"family",phases:["academy","firstteam","campus","pro"],icon:"⌂",name:"陪父母吃饭",desc:"父亲不会问你今天进了几个球，只问膝盖还疼不疼。",effects:["家庭↑","意志↑","状态↑"],max:1,run:s=>{change(s,"family",8);gainStat(s,"will",.3,"will");change(s,"morale",6)}},
  {id:"gift",phases:["firstteam","overseas","pro"],icon:"♡",name:"给小满买礼物",desc:"客场回来带点她念叨过的东西，比一句抱歉管用。",effects:["感情↑","心情↑","花钱3万"],max:1,cost:3,show:s=>["恋人","异地","暧昧"].includes(s.relationship.status),run:s=>{addMoney(s,-3);changeLove(s,hasTalent(s,"childhood_bond")?12:9);change(s,"morale",6)}},
  {id:"support_family",phases:["firstteam","overseas","pro"],icon:"¥",name:"贴补家用",desc:"把一部分工资打回家，父亲不用再上夜班。",effects:["家庭↑","心情↑","花钱5万"],max:1,cost:5,run:s=>{addMoney(s,-5);change(s,"family",12);change(s,"morale",4);if(s.debt)s.debt=Math.max(0,s.debt-2)}},
  {id:"together",phases:["firstteam","overseas","campus","pro"],icon:"❤",name:"和小满独处",desc:"关掉手机，把训练和比赛都留在门外，只有你们两个人。",effects:["状态↑","心情↑","体力↓"],max:1,show:s=>s.flags&&s.flags.intimateUnlocked&&["恋人","异地"].includes(s.relationship.status),run:s=>{change(s,"form",8);change(s,"morale",6);change(s,"fitness",-12);changeLove(s,3)}},
  {id:"rest",phases:["academy","firstteam","overseas","campus","pro"],icon:"☾",name:"彻底休息",desc:"关掉手机，拒绝“再练十分钟”的负罪感。",effects:["体能↑↑","伤病恢复","成长较少"],max:2,run:s=>{change(s,"fitness",24);change(s,"morale",5);if(s.injury.months>0){s.injury.months=Math.max(0,s.injury.months-(hasTalent(s,"quick_healer")?2:1));if(!s.injury.months){s.injury.name="";unlock("injury_return");log(s,"good","康复评估通过，你重新回到完整训练。")}}}},
  {id:"street",phases:["academy","campus"],icon:"✦",name:"去踢野球",desc:"没有战术板，只有狭小场地和不服输的对手。",effects:["盘带↑↑","创造力↑","受伤/纪律风险"],max:1,run:s=>{gainSkill(s,"dribble",1,"dribble");gainSkill(s,"vision",.35,"vision");change(s,"coachFavor",-3);change(s,"fitness",-11);fatigueInjuryCheck(s,.05)}},
  {id:"school",phases:["academy","campus"],icon:"书",name:"把功课补上",desc:"别拿踢球当逃避一切的借口。",effects:["学业↑","意志↑","家庭↑"],max:2,run:s=>{change(s,"study",8);gainStat(s,"will",.22,"will");change(s,"family",3)}},
  {id:"campus_match",phases:["campus"],icon:"旗",name:"校队强化赛",desc:"职业通道变窄了，但球场没有消失。",effects:["技术↑","球探关注↑","体能↓"],max:2,run:s=>{gainSkill(s,"finishing",.55,"finish");gainSkill(s,"dribble",.45,"dribble");change(s,"scout",5);change(s,"fitness",-12)}},
  {id:"gym",phases:["firstteam","overseas","pro"],icon:"▰",name:"力量与核心",desc:"前锋不只要快，也要在中卫靠上来时站住。",effects:["身高/对抗↑","耐力↑","爆发↑"],max:2,run:s=>{gainStat(s,"height",.42,"height");gainStat(s,"stamina",.35,"stamina");gainStat(s,"burst",.25,"burst");change(s,"fitness",-13)}},
  {id:"media",phases:["firstteam","overseas","pro"],icon:"●",name:"接受媒体安排",desc:"曝光能涨球迷，但说出去的每句话也会被记着。",effects:["声望↑","金钱↑","专注可能↓"],max:1,run:s=>{change(s,"fame",5);addMoney(s,3+Math.floor(s.fame/20));change(s,"form",chance(.35)?-3:1)}},
  {id:"coach_talk",phases:["firstteam","overseas","pro"],icon:"□",name:"主动找教练谈",desc:"问清楚自己为什么没有首发，以及答案是否可信。",effects:["教练信任↑/↓","出场概率↑","意志↑"],max:1,run:s=>{const ok=chance(.48+s.stats.will/220+(hasTalent(s,"captain")?.1:0));change(s,"coachFavor",ok?8:-3);gainStat(s,"will",.25,"pressure");log(s,ok?"good":"warn",ok?"你带着问题和录像去谈，教练给出了具体要求。":"教练认为你在用谈话绕过训练场上的竞争。")}},
  {id:"recovery",phases:["firstteam","overseas","pro"],icon:"✚",name:"专业康复",desc:"冰浴、理疗和睡眠监测不会上集锦，却能延长职业生涯。",effects:["体能↑","伤病风险↓","花费2万"],max:2,cost:2,run:s=>{change(s,"fitness",18+(hasTalent(s,"quick_healer")?6:0));addMoney(s,-2);s.injury.risk=Math.max(0,s.injury.risk-8);if(s.injury.months>0)s.injury.months=Math.max(0,s.injury.months-1)}},
  {id:"national_role",phases:["pro"],icon:"★",name:"适应多位置",desc:"为国家队练习边锋和影锋职责，俱乐部训练会被分走。",effects:["国家队适配↑","视野↑","俱乐部状态↓"],max:1,show:s=>s.national.called,run:s=>{change(s.national,"adapt",9);gainSkill(s,"vision",.4,"tactics");change(s,"form",-2)}}
];

function clamp(n,min=0,max=100){return Math.max(min,Math.min(max,n))}
function rand(min,max){return Math.floor(Math.random()*(max-min+1))+min}
function pick(a){return a[Math.floor(Math.random()*a.length)]}
function chance(p){return Math.random()<p}
function esc(v){return String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}
function hasTalent(s,id){return s.talents.includes(id)}
function talentById(id){return TALENTS.find(t=>t.id===id)}
function change(obj,key,n){obj[key]=clamp((obj[key]??0)+n);return obj[key]}
function changeLove(s,n){if(["分手","反目"].includes(s.relationship.status))return s.relationship.love;const mult=hasTalent(s,"childhood_bond")&&n>0?1.25:1;s.relationship.love=clamp(s.relationship.love+n*mult);return s.relationship.love}
function trainMult(s){return 1+assetTrain(s)}
function gainStat(s,key,n,tag){const d=diffOf(s);let mult=1;if(hasTalent(s,"explosive_start")&&key==="burst")mult+=.25;if(hasTalent(s,"engine")&&key==="stamina")mult+=.25;if(hasTalent(s,"aerial_king")&&key==="height")mult+=.2;if(hasTalent(s,"big_heart")&&key==="will")mult+=.18;if(tag&&hasTalent(s,"training_rat")&&chance(.08))mult+=.5;if(n>0)mult*=d.growth*softFactor(s.stats[key],d)*trainMult(s);s.stats[key]=clamp(s.stats[key]+n*mult,1,99)}
function gainSkill(s,key,n,tag){const d=diffOf(s);let mult=1;if(hasTalent(s,"football_iq")&&["vision","tactics"].includes(tag))mult+=.25;if(hasTalent(s,"free_kick")&&key==="setPiece")mult+=.3;if(hasTalent(s,"box_instinct")&&key==="finishing")mult+=.14;if(hasTalent(s,"ambidextrous")&&["finishing","dribble"].includes(key))mult+=.12;if(n>0){mult*=d.growth*softFactor(s.skills[key],d)*trainMult(s);if(key==="finishing"&&s.flags&&s.flags.outOfPosition)mult*=.7}s.skills[key]=clamp(s.skills[key]+n*mult,1,99)}
function overall(s){return Math.round(s.stats.height*.1+s.stats.speed*.15+s.stats.burst*.18+s.stats.stamina*.12+s.stats.will*.15+s.skills.finishing*.16+s.skills.dribble*.08+s.skills.vision*.04+s.skills.setPiece*.02)}
function ageInfo(s){return{age:14+Math.floor(s.totalMonth/12),month:s.totalMonth%12+1,season:Math.floor(s.totalMonth/12)+1}}
function phaseOf(s){const a=ageInfo(s).age;if(a<16)return"academy";if(a<18)return s.route||"academy";return"pro"}
function currentClub(s){const base=[...CSL_CLUBS,...PL_CLUBS].find(c=>c.name===s.club.name);return base?{...base,...s.club}:{...s.club}}
function log(s,kind,text){s.log.unshift({id:`l${Date.now()}${Math.random()}`,month:s.totalMonth,kind,text});s.log=s.log.slice(0,80)}
function fixtureLabel(s){const a=ageInfo(s);return`${a.age}岁 · 第${a.month}月`}

function createInitialState(name="陈逐风",allocation={height:4,speed:4,burst:4,stamina:4,will:4},talents=[],difficulty="standard"){
  const stats={};CORE_STATS.forEach(x=>stats[x.key]=42+(allocation[x.key]||0)*4);
  const heightCm=Math.min(198,168+(allocation.height||0)*2.4);
  const state={version:VERSION,runId:`r${Date.now()}${Math.random().toString(36).slice(2,7)}`,name:name.trim()||"陈逐风",position:"前锋",totalMonth:0,actionPoints:3,allocation:{...allocation},heightCm:Math.round(heightCm),talents:[...talents],stats,skills:{finishing:48+(allocation.will||0)*.5,dribble:46+(allocation.burst||0)*.5,vision:43,setPiece:41},fitness:90,form:60,morale:76,coachFavor:50,family:86,study:55,language:8,scout:5,fame:3,money:0,salary:0,debt:0,assets:{house:false,gym:false,coach:false},difficulty:DIFFICULTIES[difficulty]?difficulty:"standard",seasonGoal:null,retired:false,peakOverall:0,route:"academy",club:{name:"重庆铜梁龙 U16",league:"中超梯队",strength:58},relationship:{name:"林小满",status:"恋人",love:80,conflictShield:hasTalent({talents},"childhood_bond")?1:0},injury:{name:"",months:0,risk:0},risks:{gambling:0,health:0,media:0},flags:{route16:false,pro18:false,overseasBreakup:false,hivDiagnosed:false,bettingEver:false,captain:false},statsCareer:{matches:0,starts:0,goals:0,assists:0,wins:0,draws:0,losses:0,nationalCaps:0,nationalGoals:0,bestRating:0,hatTricks:0},seasonStats:{matches:0,goals:0,assists:0,wins:0,ratingTotal:0,trophies:0},national:{called:false,adapt:0,caps:0,goals:0,worldCups:0},honours:[],awards:[],transfers:[],offers:[],matches:[],usedEvents:[],recentEvents:[],actionUsage:{},log:[],tab:"actions",lastSeasonAward:null};
  log(state,"story","你进入重庆铜梁龙U16梯队。父亲站在铁丝网外，小满把一瓶水塞进你包里。");
  return state;
}

function fatigueInjuryCheck(s,base){const p=Math.max(0,(base+(50-s.fitness)/500+(s.injury.risk||0)/800-(hasTalent(s,"iron_man")?.025:0))*diffOf(s).injury*assetInjuryFactor(s));if(chance(p))sufferInjury(s,p>.1?2:1)}
function sufferInjury(s,months=1){const list=["脚踝扭伤","腿后肌拉伤","膝关节轻度损伤","腹股沟拉伤"];s.injury.name=pick(list);s.injury.months=Math.max(s.injury.months,Math.max(1,months-(hasTalent(s,"quick_healer")?1:0)));change(s,"form",-7);log(s,"bad",`${s.injury.name}，预计伤停${s.injury.months}个月。`)}

function addMoney(s,n){s.money=Math.round((s.money||0)+n)}
const ASSETS=[
  {id:"home_gym",cat:"训练",icon:"▰",name:"家庭训练房",cost:60,desc:"力量器械、跑步机和恢复设备，练完还能自己加练。",effect:"训练成长 +8%",train:.08,buy:s=>change(s,"fitness",6)},
  {id:"coach",cat:"训练",icon:"□",name:"私人技术教练",cost:130,desc:"退役名宿一对一盯技术细节，比合练更有针对性。",effect:"训练成长 +10% · 教练信任+",train:.10,buy:s=>change(s,"coachFavor",6)},
  {id:"nutritionist",cat:"训练",icon:"◍",name:"营养师团队",cost:100,desc:"按训练量定制饮食，把身体维持在最佳区间。",effect:"训练成长 +5% · 体能+",train:.05,buy:s=>change(s,"fitness",8)},
  {id:"analyst",cat:"训练",icon:"◇",name:"个人数据分析师",cost:120,desc:"逐场拆解跑位与选择，把球商变成看得见的数字。",effect:"训练成长 +6% · 视野+",train:.06,buy:s=>gainSkill(s,"vision",2,"vision")},
  {id:"rehab",cat:"训练",icon:"✚",name:"私人康复团队",cost:200,desc:"理疗、冰浴和睡眠监测全包，把伤病挡在门外。",effect:"伤病概率大幅下降",injuryCut:.55,minAge:19,buy:s=>{change(s,"fitness",10);s.injury.risk=Math.max(0,(s.injury.risk||0)-15)}},
  {id:"science",cat:"训练",icon:"⚛",name:"运动科学中心",cost:450,desc:"顶级团队只围着你一个人转，延长巅峰、压低伤病。",effect:"训练成长 +12% · 伤病再降",train:.12,injuryCut:.75,minAge:22,req:s=>ownedAsset(s,"rehab"),reqText:"需先有私人康复团队",buy:s=>{}},
  {id:"parents_rent",cat:"家庭",icon:"⌂",name:"给父母租套好房",cost:45,desc:"先让爸妈从老破小里搬出来。",effect:"家庭+ · 心情+",buy:s=>{change(s,"family",12);change(s,"morale",6)}},
  {id:"parents_house",cat:"家庭",icon:"⏠",name:"给父母买房",cost:300,desc:"让父亲彻底告别夜班，母亲有个像样的家。",effect:"家庭大幅提升 · 每月心情+",req:s=>ownedAsset(s,"parents_rent"),reqText:"需先给父母租房",buy:s=>{change(s,"family",22);change(s,"morale",12)}},
  {id:"parents_villa",cat:"家庭",icon:"⏦",name:"给父母买大宅",cost:800,desc:"把你能给的最好生活，摆到爸妈面前。",effect:"家庭拉满 · 声望+",req:s=>ownedAsset(s,"parents_house"),reqText:"需先给父母买房",buy:s=>{change(s,"family",30);change(s,"fame",6);change(s,"morale",10)}},
  {id:"car",cat:"生活",icon:"⛟",name:"买一辆车",cost:150,desc:"再也不用挤队里的大巴回家。",effect:"声望+ · 心情+",buy:s=>{change(s,"fame",5);change(s,"morale",6)}},
  {id:"apartment",cat:"生活",icon:"❒",name:"自己的公寓",cost:400,desc:"训练基地之外，终于有个真正属于你的地方。",effect:"心情+ · 净资产+",buy:s=>change(s,"morale",10)},
  {id:"luxury_car",cat:"生活",icon:"◈",name:"梦想中的豪车",cost:600,desc:"停在训练场门口，就是一条街的焦点。",effect:"声望++",req:s=>ownedAsset(s,"car"),reqText:"需先买一辆车",minFame:45,buy:s=>change(s,"fame",12)},
  {id:"mansion",cat:"生活",icon:"⏢",name:"城郊豪宅",cost:1600,desc:"泳池、球场、影音室，你为自己造了一座城堡。",effect:"声望+++ · 心情+",req:s=>ownedAsset(s,"apartment"),reqText:"需先有自己的公寓",minFame:60,buy:s=>{change(s,"fame",18);change(s,"morale",12)}},
  {id:"image_team",cat:"生活",icon:"◐",name:"形象与公关团队",cost:220,desc:"帮你经营公众形象，风波更容易平息。",effect:"每月声望增长 · 抗舆论",minFame:40,buy:s=>{change(s,"fame",6);change(s.risks,"media",-15)}},
  {id:"restaurant",cat:"投资",icon:"◔",name:"投资一家餐厅",cost:250,desc:"给退役后的生活留一条稳定的进账。",effect:"每月被动收入 +6万",passive:6,buy:s=>{}},
  {id:"brand",cat:"投资",icon:"◉",name:"创立个人品牌",cost:650,desc:"把名气变成能持续赚钱的生意。",effect:"每月被动收入 +12万 · 声望+",passive:12,minFame:60,buy:s=>change(s,"fame",8)},
  {id:"academy",cat:"投资",icon:"♟",name:"创办青训学校",cost:1200,desc:"把你走过的路，留给下一批孩子。",effect:"每月被动收入 +20万 · 声望+",passive:20,minAge:24,minFame:55,buy:s=>change(s,"fame",12)},
  {id:"ring",cat:"感情",icon:"◇",name:"给小满买戒指",cost:80,desc:"你想好了，这一次不再让她一个人等。",effect:"感情+ · 解锁婚礼",minAge:20,req:s=>["恋人","异地"].includes(s.relationship.status)&&s.relationship.love>=85,reqText:"需恋爱中且好感≥85",buy:s=>{changeLove(s,8);change(s,"morale",10);s.flags.engaged=true}},
  {id:"wedding",cat:"感情",icon:"♥",name:"和小满办婚礼",cost:350,desc:"父亲把你交到她手里，只说了句“照顾好她”。",effect:"感情拉满 · 家庭+ · 成就",req:s=>s.flags&&s.flags.engaged&&s.relationship.love>=85,reqText:"需先求婚",buy:s=>{changeLove(s,12);change(s,"family",15);change(s,"morale",18);s.flags.married=true;unlock("married")}}
];
const ASSET_CATS=["训练","家庭","生活","投资","感情"];
function ownedAsset(s,id){return !!(s.assets&&s.assets[id])}
function assetTrain(s){let t=0;ASSETS.forEach(a=>{if(a.train&&ownedAsset(s,a.id))t+=a.train});return Math.min(.45,t)}
function assetPassive(s){let p=0;ASSETS.forEach(a=>{if(a.passive&&ownedAsset(s,a.id))p+=a.passive});return p}
function assetInjuryFactor(s){let f=1;ASSETS.forEach(a=>{if(a.injuryCut&&ownedAsset(s,a.id))f*=a.injuryCut});return f}
function assetValue(s){let v=0;ASSETS.forEach(a=>{if(ownedAsset(s,a.id))v+=a.cost});return v}
function assetLocked(s,a){if(a.minAge&&ageInfo(s).age<a.minAge)return`需${a.minAge}岁`;if(a.minFame&&s.fame<a.minFame)return`需声望${a.minFame}`;if(a.req&&!a.req(s))return a.reqText||"未满足前置条件";return null}
function buyAsset(s,id){const it=ASSETS.find(x=>x.id===id);if(!it||ownedAsset(s,id))return false;if(assetLocked(s,it))return false;if((s.money||0)<it.cost)return false;addMoney(s,-it.cost);s.assets=s.assets||{};s.assets[id]=true;it.buy&&it.buy(s);log(s,"good",`你花 ${it.cost} 万拿下了「${it.name}」。`);return true}
function option(text,effect,apply,tone=""){return{text,effect,apply,tone}}

const EVENTS=[
  {id:"academy_ankle",phase:["academy"],title:"队医说“可以上”，你的脚踝说不行",body:"青年联赛关键场前，队医判断没有结构性损伤。周骁说首发名单只等你一句话。小满看到你走路时轻微躲着右脚。",portrait:"assets/coach-zhou.webp",options:s=>[
    option("咬牙首发","球探关注+8；可能抓住机会，也可能伤停2—4个月",()=>{change(s,"scout",8);change(s,"coachFavor",4);if(chance(hasTalent(s,"iron_man")?.28:.48))sufferInjury(s,rand(2,4));else{change(s,"form",6);log(s,"good","你撑过了比赛，但这不是一个可以反复使用的答案。")}},"danger"),
    option("主动退出名单","体能+12；教练信任-5，意志+1",()=>{change(s,"fitness",12);change(s,"coachFavor",-5);gainStat(s,"will",1,"will")})]},
  {id:"xiaoman_exam",phase:["academy"],title:"她的考试，和你的选拔赛在同一天",body:"小满要参加一场决定重点班名额的考试。她没有要求你陪，只把准考证落在你桌上。与此同时，省队球探临时把观察赛提前。",portrait:"assets/lin-xiaoman.webp",options:s=>[
    option("送她去考场再赶比赛","感情+10；体能-10，比赛状态存在波动",()=>{changeLove(s,10);change(s,"fitness",-10);change(s,"form",chance(.5)?3:-4)}),
    option("提前去球场热身","球探+9，状态+5；感情-10",()=>{change(s,"scout",9);change(s,"form",5);changeLove(s,-10)})]},
  {id:"father_boots",phase:["academy"],title:"父亲买了一双你不敢穿坏的球鞋",body:"你知道这双鞋差不多是父亲半个月的加班费。旧鞋还能穿，只是大底已经开胶。",portrait:"assets/father.webp",options:s=>[
    option("收下新鞋，把旧鞋留作纪念","爆发+1，家庭+5；父亲继续加班",()=>{gainStat(s,"burst",1,"burst");change(s,"family",5);s.risks.familyFatigue=(s.risks.familyFatigue||0)+7}),
    option("退掉鞋，换成普通款","家庭+8，意志+1；本月训练状态-3",()=>{change(s,"family",8);gainStat(s,"will",1,"will");change(s,"form",-3)})]},
  {id:"teammate_blame",phase:["academy","firstteam","overseas"],title:"队友把丢球算在你头上",body:"训练赛最后一分钟，你的前场丢球引发反击。更衣室里，队友故意当着教练的面说：“有些人只顾着做集锦。”",portrait:"assets/coach-zhou.webp",options:s=>[
    option("当场顶回去","意志+1，队内地位可能上升；教练信任波动",()=>{gainStat(s,"will",1,"pressure");change(s,"coachFavor",chance(.5)?5:-5)}),
    option("承认丢球，要求一起复盘","视野+1，教练信任+5；状态-3",()=>{gainSkill(s,"vision",1,"vision");change(s,"coachFavor",5);change(s,"form",-3)})]},
  {id:"mystery_supplement",phase:["academy","firstteam","overseas","pro"],title:"一瓶“绝对查不出来”的补剂",body:"自称体能师的人通过队友递来一瓶没有完整中文标签的补剂。他保证不含禁药，只需要现金，也不会留下购买记录。",options:s=>[
    option("拒绝并报告队医","教练信任+4，队友关系受损；职业风险下降",()=>{change(s,"coachFavor",4);change(s.risks,"health",-8);log(s,"good","队医把补剂封存了。你没走捷径，也没把前途交到一个陌生人手里。")}),
    option("只拿去检测，不供出队友","花费4万；意志+1，教练无变化",()=>{addMoney(s,-4);gainStat(s,"will",1,"will");change(s.risks,"health",-4)})]},
  {id:"viral_clip",phase:["academy","campus"],title:"十秒过人视频突然有了二十万播放",body:"同学剪掉你前面三次丢球，只留下穿裆和远射。经纪人开始私信，周骁则问是谁允许拍摄训练。",options:s=>[
    option("顺势经营个人账号","声望+10，球探+4；媒体风险+8",()=>{change(s,"fame",10);change(s,"scout",4);change(s.risks,"media",8)}),
    option("删除视频并向球队说明","教练信任+8；错过曝光，意志+1",()=>{change(s,"coachFavor",8);gainStat(s,"will",1,"pressure")})]},
  {id:"growth_pain",phase:["academy"],title:"一个夏天，你突然长高了六厘米",body:"头球更有威胁了，但你的转身和触球像借来的身体。教练提出两种完全不同的训练方案。",portrait:"assets/coach-zhou.webp",options:s=>[
    option("改造成支点中锋","身高/对抗+2，射术+1；速度-1",()=>{s.heightCm=Math.min(200,s.heightCm+6);gainStat(s,"height",2,"height");gainSkill(s,"finishing",1,"finish");s.stats.speed=clamp(s.stats.speed-1)}),
    option("花时间重建协调性","盘带+2，爆发+1；未来2个月教练信任-4",()=>{s.heightCm=Math.min(200,s.heightCm+6);gainSkill(s,"dribble",2,"dribble");gainStat(s,"burst",1,"burst");change(s,"coachFavor",-4)})]},
  {id:"rain_final",phase:["academy"],title:"暴雨里的决赛，父亲却没有出现",body:"开球前你一直看向看台。他答应过会来。终场后，小满告诉你，父亲在赶来的路上接到工厂电话，又折了回去。",portrait:"assets/lin-xiaoman.webp",options:s=>[
    option("给父亲打电话，说你赢了","家庭+10，意志+1；不追问缺席",()=>{change(s,"family",10);gainStat(s,"will",1,"will")}),
    option("把失望说出来","家庭-6；长期压力下降，状态+6",()=>{change(s,"family",-6);change(s,"morale",6);s.risks.familyFatigue=Math.max(0,(s.risks.familyFatigue||0)-6)})]},
  {id:"firstteam_veteran",phase:["firstteam","pro"],title:"老队员要你训练后留下来捡球",body:"他说新人都这样过来。你知道这是更衣室秩序，也知道顺从一次可能就会有下一次。",options:s=>[
    option("先做一个月，再靠表现说话","队内适应+8，体能-8；意志-1",()=>{s.teamFit=clamp((s.teamFit||45)+8);change(s,"fitness",-8);s.stats.will=clamp(s.stats.will-1)}),
    option("拒绝，把时间用来加练","意志+1，射术+1；短期首发概率下降",()=>{gainStat(s,"will",1,"pressure");gainSkill(s,"finishing",1,"finish");change(s,"coachFavor",-5)})]},
  {id:"bench_promise",phase:["firstteam","overseas","pro"],title:"教练说“下场一定给你机会”",body:"这是他第三次这样说。另一家俱乐部的助教暗示，只要你公开表达不满，他们就会推动租借。",portrait:"assets/coach-zhou.webp",options:s=>[
    option("继续沉默训练","教练信任+7，意志+1；声望不变",()=>{change(s,"coachFavor",7);gainStat(s,"will",1,"pressure")}),
    option("通过媒体释放离队意愿","声望+5，转会报价概率上升；媒体风险+12",()=>{change(s,"fame",5);change(s.risks,"media",12);s.flags.wantsMove=true})]},
  {id:"parents_hospital",phase:["firstteam","overseas","pro"],minAge:16,title:"父亲的住院押金",body:"父亲因为长期加班倒在车间。你现在的工资只够一部分。有人提出“借”你20万，条件是下一场你的射正数不要超过一次。",portrait:"assets/father.webp",options:s=>[
    option("拒绝，向俱乐部申请预支","家庭+8，俱乐部信任-5；欠下12万",()=>{change(s,"family",8);change(s,"coachFavor",-5);addMoney(s,-12);s.debt=(s.debt||0)+12}),
    option("联系公益与队友筹款","声望-3，家庭+6；隐私被公开",()=>{change(s,"fame",-3);change(s,"family",6);change(s.risks,"media",8)}),
    option("接受那笔“借款”","立刻+20万；涉赌暗雷大幅上升，可能毁掉生涯",()=>{addMoney(s,20);s.flags.bettingEver=true;change(s.risks,"gambling",38);log(s,"bad","你收下了这笔见不得光的钱。眼下风平浪静，但你心里清楚它迟早要还。")},"danger")],weight:1.25},
  {id:"language_wall",phase:["overseas"],title:"你听错了教练的最后一句话",body:"最后十分钟，教练要求你拉边保护领先。你却以为他让你压进禁区，球队被反击扳平。更衣室里没有人用中文。",options:s=>[
    option("公开承担责任，增加英语课","语言+18，教练信任-2；意志+1",()=>{change(s,"language",hasTalent(s,"language_gift")?30:18);change(s,"coachFavor",-2);gainStat(s,"will",1,"pressure")}),
    option("让翻译解释是指令不清","教练信任-8，状态+4；队内适应下降",()=>{change(s,"coachFavor",-8);change(s,"form",4);s.teamFit=clamp((s.teamFit||45)-6)})]},
  {id:"lonely_christmas",phase:["overseas"],title:"圣诞夜，视频那头没有人说话",body:"你和小满隔着七个小时的时差。她刚结束考试，你刚被排除出比赛名单。两个人都在等对方先说“没事”。",portrait:"assets/lin-xiaoman.webp",condition:s=>s.relationship.status==="异地",options:s=>[
    option("承认自己很想家","感情+12，意志+1；第二天训练状态-4",()=>{changeLove(s,12);gainStat(s,"will",1,"love");change(s,"form",-4)}),
    option("说一切都很好","维持专注，状态+5；感情-12",()=>{change(s,"form",5);changeLove(s,-12)})]},
  {id:"overseas_party",phase:["overseas"],minAge:17,title:"队友说，放松也是职业的一部分",body:"周末没有比赛。队友包下夜店，说所有新人都要去。缺席会显得不合群，参加意味着打乱三天恢复计划。",options:s=>[
    option("去，但设好离场时间","队内适应+8；体能-8，健康风险小幅上升",()=>{s.teamFit=clamp((s.teamFit||45)+8);change(s,"fitness",-8);change(s.risks,"health",4)}),
    option("拒绝，独自留在基地","体能+10；队内适应-7，意志+1",()=>{change(s,"fitness",10);s.teamFit=clamp((s.teamFit||45)-7);gainStat(s,"will",1,"pressure")})]},
  {id:"agent_contract",phase:["firstteam","overseas","pro"],minAge:17,title:"经纪人把“保证首发”写进了口头承诺",body:"他能带来更高工资，也要求你把肖像、转会和商业开发全部交给他八年。书面合同里没有“保证首发”四个字。",options:s=>[
    option("签长约，换取眼前资源","声望+9，报价+1；未来转会抽成高",()=>{change(s,"fame",9);s.agent={type:"aggressive",cut:18};generateOffers(s,1)}),
    option("请独立律师，只签两年","花费6万，意志+1；资源增长较慢",()=>{addMoney(s,-6);gainStat(s,"will",1,"pressure");s.agent={type:"careful",cut:8}})]},
  {id:"xiaoman_private",phase:["firstteam","pro"],minAge:17,title:"球迷拍到了你和小满",body:"照片里没有越界内容，但评论已经开始审视她的学校、衣服和家庭。俱乐部建议你否认恋情。",portrait:"assets/lin-xiaoman.webp",condition:s=>["恋人","异地"].includes(s.relationship.status),options:s=>[
    option("承认恋情，要求停止打扰她","感情+15，声望波动；商业机会-1",()=>{changeLove(s,15);change(s,"fame",chance(.55)?5:-6);s.flags.publicLove=true}),
    option("按俱乐部口径否认","媒体风险-6；感情-20，可能留下裂缝",()=>{change(s.risks,"media",-6);changeLove(s,-20);s.relationship.denied=true})]},
  {id:"girlfriend_offer",phase:["firstteam","campus","pro"],minAge:18,title:"小满拿到了外地研究生名额",body:"她说她不是在考验你，也不是要你留她。她只是第一次认真跟你聊起自己以后想怎么走。",portrait:"assets/lin-xiaoman.webp",condition:s=>s.relationship.status==="恋人",options:s=>[
    option("支持她去，开始异地","感情+8，状态-4；关系转为异地",()=>{changeLove(s,8);change(s,"form",-4);s.relationship.status="异地"}),
    option("希望她留下","当前感情+4；长期冲突+18",()=>{changeLove(s,4);s.relationship.conflict=(s.relationship.conflict||0)+18})]},
  {id:"match_fixing",phase:["pro"],minAge:18,title:"他们只要一个无关胜负的角球",body:"中间人说比赛结果不变，只需要你在上半场把球碰出底线一次。他知道你父亲住院，也知道你的旧债。",options:s=>[
    option("保存证据并报告俱乐部","短期被调查和雪藏；职业风险大幅下降",()=>{change(s,"coachFavor",-8);change(s,"form",-8);change(s.risks,"gambling",-30);s.flags.reportedFixing=true}),
    option("删除消息，什么也不说","本月没有损失；暗雷仍可能回来",()=>{change(s.risks,"gambling",6)}),
    option("按他说的做","获得35万；涉赌风险+45，成就与国家队可能永久失去",()=>{addMoney(s,35);s.flags.bettingEver=true;change(s.risks,"gambling",45)},"danger")]},
  {id:"health_test",phase:["pro"],minAge:18,title:"一次健康筛查的结果需要复核",body:"队医说明，初筛结果不等于确诊，需要到正规机构复核。无论结果如何，隐私、治疗与继续工作都受到法律和医学规范保护。",condition:s=>s.risks.health>=18&&!s.flags.healthTested,options:s=>[
    option("立即复核并暂停高强度训练","体能-8；健康风险大幅下降，获得正规支持",()=>{s.flags.healthTested=true;change(s,"fitness",-8);if(chance(.16)){s.flags.hivDiagnosed=true;s.healthCare=80;log(s,"story","复核确诊HIV。医生说明：规范抗病毒治疗可长期控制病毒，确诊不是职业与人生的终点。") }else{change(s.risks,"health",-18);log(s,"good","复核结果排除了感染。你接受了更完整的性健康咨询。")}}),
    option("推迟一个月，先保住首发","状态+5；健康与隐私风险上升",()=>{change(s,"form",5);change(s.risks,"health",12);change(s.risks,"media",5)},"danger")]},
  {id:"hiv_treatment",phase:["pro"],minAge:18,title:"治疗不会替你踢球，但能让你继续生活",body:"医生给出规范治疗方案。只要按医嘱服药并复诊，病毒可以被长期抑制。经纪人却担心药物记录被媒体发现。",condition:s=>s.flags.hivDiagnosed&&s.healthCare<100,options:s=>[
    option("按医嘱治疗并设立隐私边界","花费与时间增加；健康管理+20，意志+2",()=>{addMoney(s,-5);s.healthCare=clamp((s.healthCare||0)+20);gainStat(s,"will",2,"will")}),
    option("为了赛程间断治疗","短期体能+4；长期健康风险显著上升",()=>{change(s,"fitness",4);change(s.risks,"health",25);s.healthCare=clamp((s.healthCare||0)-15)},"danger")]},
  {id:"national_wrong_position",phase:["pro"],minAge:18,title:"国家队要你踢不熟悉的右边翼卫",body:"教练认为你的速度能解决边路问题。拒绝可能失去这次窗口，接受则会影响俱乐部的前锋训练。",condition:s=>s.national.called,options:s=>[
    option("接受位置，为国出战","国家队适应+15，意志+1；射术成长放缓",()=>{change(s.national,"adapt",15);gainStat(s,"will",1,"national");s.flags.outOfPosition=true}),
    option("说明自己只能踢前锋","射术+1；国家队信任-12",()=>{gainSkill(s,"finishing",1,"finish");s.national.adapt=clamp(s.national.adapt-12)})]},
  {id:"national_injury",phase:["pro"],minAge:18,title:"国家队队医建议打封闭",body:"世界杯预选赛就在48小时后。俱乐部邮件明确表示反对，国家队教练说“国家需要你”。",condition:s=>s.national.called,options:s=>[
    option("打封闭首发","国家队声望+10；25%伤停3—6个月",()=>{change(s,"fame",10);if(chance(hasTalent(s,"iron_man")?.14:.25))sufferInjury(s,rand(3,6))}),
    option("拒绝冒险，回俱乐部治疗","体能+10；国家队适应-10，职业寿命更稳",()=>{change(s,"fitness",10);change(s.national,"adapt",-10)})]},
  {id:"transfer_loyalty",phase:["pro"],minAge:19,title:"豪门报价，和一份队长承诺",body:"当前俱乐部愿意给你队长袖标，但工资只有对方的一半。豪门不能保证首发，却能让你站上更大的舞台。",options:s=>[
    option("留下争取队长袖标","教练信任+15，可能成为队长；错过本期报价",()=>{change(s,"coachFavor",15);if(overall(s)>=82||hasTalent(s,"captain")){s.flags.captain=true;unlock("captain_armband")};s.offers=[]}),
    option("要求经纪人推动转会","生成2份高一级报价；教练信任-12",()=>{generateOffers(s,2,true);change(s,"coachFavor",-12)})]},
  {id:"brand_vs_rest",phase:["pro"],minAge:18,title:"一天广告拍摄，等于三个月康复费",body:"品牌只在休赛日有档期。队医说你需要完整休息，经纪人提醒家里的债还没还清。",options:s=>[
    option("接下拍摄","收入+22万，声望+6；体能-14，伤病风险+8",()=>{addMoney(s,22);change(s,"fame",6);change(s,"fitness",-14);s.injury.risk+=8}),
    option("拒绝，完成恢复","体能+20，状态+3；没有额外收入",()=>{change(s,"fitness",20);change(s,"form",3)})]},
  {id:"captain_cover",phase:["pro"],minAge:20,title:"队友酒驾，队长要不要替他先挡住媒体",body:"俱乐部希望你作为核心球员先说“队内问题已经解决”，但警方通报还没出来。",condition:s=>s.flags.captain||hasTalent(s,"captain"),options:s=>[
    option("拒绝背书，只谈球队纪律","短期更衣室-8；公众信任+10",()=>{s.teamFit=clamp((s.teamFit||55)-8);change(s,"fame",10)}),
    option("按俱乐部稿件发言","队内适应+8；若后续反转，媒体风险+18",()=>{s.teamFit=clamp((s.teamFit||55)+8);change(s.risks,"media",18)})]},
  {id:"xiaoman_interview",phase:["pro"],minAge:20,title:"小满接受了一次关于你的采访",body:"她没有泄露隐私，只说“和一个把全部情绪交给比赛的人生活很累”。标题却变成了《球星女友控诉多年牺牲》。",portrait:"assets/lin-xiaoman.webp",condition:s=>["恋人","异地"].includes(s.relationship.status),options:s=>[
    option("先和她谈，再共同澄清","感情+8；声望短期-4，媒体风险下降",()=>{changeLove(s,8);change(s,"fame",-4);change(s.risks,"media",-10)}),
    option("让经纪人单方面否认","声望+3；感情-18，冲突+15",()=>{change(s,"fame",3);changeLove(s,-18);s.relationship.conflict=(s.relationship.conflict||0)+15})]},
  {id:"red_card_choice",phase:["firstteam","overseas","pro"],title:"队友被恶意铲倒，全队都在看你",body:"裁判只给了黄牌。对方中卫下一次靠近时故意撞了你的肩，观众在等一次回应。",options:s=>[
    option("用下一次进攻回应","意志+1，状态+4；需要压住情绪",()=>{gainStat(s,"will",1,"clutch");change(s,"form",4)}),
    option("替队友强硬出头","队内适应+10；40%停赛1个月",()=>{s.teamFit=clamp((s.teamFit||50)+10);if(chance(.4)){s.suspension=1;log(s,"warn","你的报复动作被追加停赛1个月。")}})]},
  {id:"study_contract",phase:["campus"],title:"职业试训，和小满的毕业答辩",body:"重庆铜梁龙只给一次三天试训，最后一天正好是小满的毕业答辩。她说自己可以，但你听得出那不是“不需要”。",portrait:"assets/lin-xiaoman.webp",options:s=>[
    option("参加全部试训","球探+18，职业机会大增；感情-14",()=>{change(s,"scout",18);changeLove(s,-14)}),
    option("提前离队赶回答辩","感情+15，意志+1；试训成功率下降",()=>{changeLove(s,15);gainStat(s,"will",1,"love");change(s,"scout",-6)})]},
  {id:"reconcile",phase:["firstteam","overseas","campus","pro"],minAge:19,title:"很久没亮的号码又亮了",body:"分开这么久，小满第一次主动发消息，说正好路过你踢球的城市，问要不要吃个饭。你清楚，真要走这一步，两个人都得重新学着相处。",portrait:"assets/lin-xiaoman.webp",condition:s=>s.relationship.status==="分手",options:s=>[
    option("赴约，试着重新开始","有机会复合；也可能只是好好告别",()=>{if(chance(.55)){s.relationship.status=phaseOf(s)==="overseas"?"异地":"恋人";s.relationship.love=42;s.relationship.conflict=0;s.flags.breakupQueued=false;change(s,"morale",8);log(s,"good","你们决定重新试试。这次你不想再拿比赛当借口。")}else{change(s,"morale",-4);gainStat(s,"will",1,"will");log(s,"story","一顿饭聊了很多，笑着笑着都明白，回不去了。")}}),
    option("婉拒，把力气留给赛场","状态+4，射术+1；关系仍为分手",()=>{change(s,"form",4);gainSkill(s,"finishing",1,"finish")})]},
  {id:"contract_renewal",phase:["pro"],minAge:19,title:"续约合同摆到了桌上",body:"俱乐部想续约。经纪人说现在逼一逼能拿到更高薪水，但也可能惹恼管理层，把你挂上转会名单。",options:s=>[
    option("强硬要求涨薪","月薪上调；教练信任-8，媒体风险+8",()=>{s.salary=Math.round((s.salary||4)*1.35);change(s,"coachFavor",-8);change(s.risks,"media",8)}),
    option("接受平稳续约","月薪小涨，教练信任+6；错过一次要价机会",()=>{s.salary=Math.round((s.salary||4)*1.1);change(s,"coachFavor",6)})]},
  {id:"young_rival",phase:["firstteam","pro"],minAge:18,title:"俱乐部签来一个同位置的新星",body:"他比你年轻，身价更高，媒体已经开始拿你俩比。教练说位置得靠训练和比赛自己去抢。",options:s=>[
    option("用更狠的训练回应","射术+1，爆发+1；体能-12，伤病风险上升",()=>{gainSkill(s,"finishing",1,"finish");gainStat(s,"burst",1,"burst");change(s,"fitness",-12);s.injury.risk+=6}),
    option("找教练谈清自己的定位","教练信任波动；意志+1",()=>{const ok=chance(.5);change(s,"coachFavor",ok?7:-7);gainStat(s,"will",1,"pressure")})]},
  {id:"loan_offer",phase:["pro"],minAge:19,title:"一份去小球队踢主力的租借",body:"你在现在的队里长期坐板凳。一家保级队愿意租你去当主力，代价是离开豪门的光环，去打最脏最累的比赛。",condition:s=>s.coachFavor<45,options:s=>[
    option("接受租借，去踢球","出场大增、成长加快；声望-4，月薪略降",()=>{change(s,"coachFavor",60-s.coachFavor);change(s,"form",6);change(s,"fame",-4);s.salary=Math.max(2,Math.round((s.salary||4)*.85));log(s,"story","你降薪去了保级队，但终于每周都能上场。")}),
    option("留下继续抢位置","维持平台；出场少，状态-5",()=>{change(s,"form",-5)})]},
  {id:"sponsor_line",phase:["pro"],minAge:19,title:"一个来路不明的博彩赞助",body:"一家海外博彩公司想签你做区域代言，报价高得离谱。合规部门提醒，这类合作在联赛属于灰色地带。",options:s=>[
    option("拒绝，选干净的品牌","意志+1，声望+4；少赚一笔",()=>{change(s,"fame",4);gainStat(s,"will",1,"will")}),
    option("签下高额代言","立刻+30万；涉赌风险+30，埋下隐患",()=>{addMoney(s,30);s.flags.bettingEver=true;change(s.risks,"gambling",30)},"danger")]},
  {id:"overseas_culture",phase:["overseas"],title:"更衣室的玩笑你听不懂",body:"队友之间的梗、俚语和小圈子把你隔在外面。有人善意地拉你一把，也有人拿你的口音开玩笑。",options:s=>[
    option("硬着头皮融进去","队内适应+9，语言+6；体能-6",()=>{s.teamFit=clamp((s.teamFit||45)+9);change(s,"language",6);change(s,"fitness",-6)}),
    option("专注训练，少社交","射术+1，体能+6；队内适应-6",()=>{gainSkill(s,"finishing",1,"finish");change(s,"fitness",6);s.teamFit=clamp((s.teamFit||45)-6)})]},
  {id:"academy_cut",phase:["academy"],minAge:15,title:"梯队年底要裁掉三个人",body:"周骁把话挑明：这批梯队年底要压缩名单，位置最不稳的几个人里，有你。",portrait:"assets/coach-zhou.webp",options:s=>[
    option("加倍训练证明自己","射术+1，耐力+1；体能-14，伤病风险上升",()=>{gainSkill(s,"finishing",1,"finish");gainStat(s,"stamina",1,"stamina");change(s,"fitness",-14);s.injury.risk+=6}),
    option("找教练要一个明确标准","教练信任+6，球探+4；状态-3",()=>{change(s,"coachFavor",6);change(s,"scout",4);change(s,"form",-3)})]}
];

function eventEligible(e,s){const a=ageInfo(s).age,p=phaseOf(s);return(!e.phase||e.phase.includes(p))&&(!e.minAge||a>=e.minAge)&&(!e.maxAge||a<=e.maxAge)&&(!e.condition||e.condition(s))}
function chooseRandomEvent(s,rng=Math.random){let pool=EVENTS.filter(e=>eventEligible(e,s)&&!s.usedEvents.includes(e.id)&&!s.recentEvents.includes(e.id));if(!pool.length){s.usedEvents=s.usedEvents.filter(id=>!EVENTS.some(e=>e.id===id&&eventEligible(e,s)));pool=EVENTS.filter(e=>eventEligible(e,s)&&!s.recentEvents.includes(e.id))}if(!pool.length)return null;const weighted=[];pool.forEach(e=>{const n=Math.max(1,Math.round((e.weight||1)*3));for(let i=0;i<n;i++)weighted.push(e)});const e=weighted[Math.floor(rng()*weighted.length)];s.usedEvents.push(e.id);s.recentEvents=[e.id,...s.recentEvents].slice(0,5);return e}

const STORY_BEATS={
  6:s=>({title:"铁丝网外的两个人",portrait:"assets/lin-xiaoman.webp",body:`训练结束已经九点。父亲在远处和周骁说话，小满把伞向你这边偏。<span class="dialogue">“我不怕你忙。我怕你以后只在输了球的时候才想起我。”</span>`,options:[
    option("答应每周留一个晚上给她","感情+12；每月第一次训练收益略降",()=>{changeLove(s,12);s.flags.weeklyPromise=true}),
    option("告诉她，现在不能做保证","意志+1；感情-8，但没有空头承诺",()=>{gainStat(s,"will",1,"will");changeLove(s,-8)})]}),
  12:s=>({title:"父亲第一次承认他也害怕",portrait:"assets/father.webp",body:`你问他为什么每场梯队比赛都站在最后一排。他沉默很久。<span class="dialogue">“我站前面就忍不住替你喊。可你的球得你自己踢，我不能在看台上指挥你。”</span>`,options:[
    option("把下一场球票放进他口袋","家庭+12，状态+3",()=>{change(s,"family",12);change(s,"form",3)}),
    option("请他少加班，比赛以后还有","家庭+7；父亲疲劳风险下降",()=>{change(s,"family",7);s.risks.familyFatigue=Math.max(0,(s.risks.familyFatigue||0)-12)})]}),
  18:s=>({title:"周年约会撞上邀请赛",portrait:"assets/lin-xiaoman.webp",body:`省级邀请赛与你们约好的一周年同一天。小满把准备了很久的礼物塞进你的训练包。<span class="dialogue">“去踢吧。但回来以后，别把一句对不起当作全部。”</span>`,options:[
    option("比赛后连夜去见她","球探+8，体能-12；感情+8",()=>{change(s,"scout",8);change(s,"fitness",-12);changeLove(s,8)}),
    option("放弃邀请赛，陪她过完这天","感情+16；球探-10，教练信任-5",()=>{changeLove(s,16);change(s,"scout",-10);change(s,"coachFavor",-5)})]}),
  30:s=>phaseOf(s)==="overseas"?({title:"分手后的第一场好比赛",portrait:"assets/lin-xiaoman.webp",body:`你在青年杯进了两球。几小时后，小满发来一句“祝贺”，没有称呼，也没有追问近况。你们已经分手，这条消息不是复合的暗号。<span class="dialogue">“我希望你真的踢出来，也希望我们都能过自己的生活。”</span>`,options:[option("认真道谢，不越过边界","意志+2，状态+3；保留体面的回忆",()=>{gainStat(s,"will",2,"will");change(s,"form",3);s.relationship.status="分手";s.relationship.love=0}),option("不回复，把情绪留在训练场","射术+1；状态-5，关系仍为分手",()=>{gainSkill(s,"finishing",1,"finish");change(s,"form",-5);s.relationship.status="分手";s.relationship.love=0})]})
  :({title:"第一份职业工资",portrait:"assets/father.webp",body:`你把工资卡递给父亲，他没有接。小满坐在旁边笑。<span class="dialogue">“帮家里是好事，但你不用靠养家来证明自己长大了。”</span>`,options:[option("拿出一半给父母","家庭+14；现金-8万",()=>{change(s,"family",14);addMoney(s,-8)}),option("先建立康复与学习账户","体能+8，语言/学业+6；家庭+4",()=>{change(s,"fitness",8);change(s,"language",6);change(s,"study",6);change(s,"family",4)})]}),
  36:s=>phaseOf(s)==="campus"?({title:"看台没有职业合同，仍然有她",portrait:"assets/lin-xiaoman.webp",body:`校际联赛只有几百名观众。小满在终场后拿着你的外套。<span class="dialogue">“我喜欢看你踢球，跟上不上电视没关系。但你要还想回去踢，别拿我当借口。”</span>`,options:[option("重新冲击职业试训","球探+15，感情+8；体能-10",()=>{change(s,"scout",15);changeLove(s,8);change(s,"fitness",-10)}),option("把学业与足球都走完","学业+15，感情+12；职业成长变慢",()=>{change(s,"study",15);changeLove(s,12)})]})
  :({title:"那条没有发出去的消息",portrait:"assets/lin-xiaoman.webp",body:`凌晨两点，你写了很长一段话，又全部删掉。小满只发来一句：<span class="dialogue">“你难受就说出来，别每次都要我猜。”</span>`,options:[option("把真实压力说出来","感情+12，状态+6；媒体活动取消一次",()=>{changeLove(s,12);change(s,"form",6);change(s,"fame",-2)}),option("把手机扣下，第二天继续训练","教练信任+5；感情-10，意志+1",()=>{change(s,"coachFavor",5);changeLove(s,-10);gainStat(s,"will",1,"pressure")})]}),
  42:s=>({title:"父亲病床边的终场哨",portrait:"assets/father.webp",body:`检查结果不算最坏，但他必须停止长期夜班。你第一次意识到，支持你的人也会老。<span class="dialogue">“别为了我的医药费，踢一场你以后不敢回看的球。”</span>`,options:[option("承担治疗，拒绝灰色资金","现金-18万，家庭+15；意志+2",()=>{addMoney(s,-18);change(s,"family",15);gainStat(s,"will",2,"will")}),option("让父母接受保险与社会援助","家庭+8；隐私/媒体风险+6",()=>{change(s,"family",8);change(s.risks,"media",6)})]}),
  48:s=>({title:"18岁，转会市场开放",portrait:"assets/coach-zhou.webp",body:`周骁把你14岁时的训练表还给你。上面密密麻麻都是红圈。<span class="dialogue">“从今天起，没人再拿年轻当借口。想去更好的球队，就拿比赛说话。”</span>`,options:[option("把训练表折好收进包里","意志+2，教练信任+8",()=>{gainStat(s,"will",2,"will");change(s,"coachFavor",8)}),option("问他：我离最好的前锋还差什么","射术+1，视野+1；状态-2",()=>{gainSkill(s,"finishing",1,"finish");gainSkill(s,"vision",1,"vision");change(s,"form",-2)})]})
};

function loveSupport(s){if(!["恋人","异地"].includes(s.relationship.status))return 0;const l=s.relationship.love;return l>=85?7:l>=65?5:l>=45?3:l>=25?1:0}
function weightedStatScore(s){return overall(s)*.58+s.form*.18+s.fitness*.12+s.morale*.08+s.coachFavor*.04+loveSupport(s)}
function poisson(lambda,rng=Math.random){let l=Math.exp(-Math.max(.08,lambda)),p=1,k=0;do{k++;p*=rng()}while(p>l&&k<9);return k-1}
function rndFloat(rng,min,max){return min+rng()*(max-min)}
function opponentPool(s){const c=currentClub(s);if(c.league==="英超")return PL_CLUBS.filter(x=>x.name!==c.name);if(s.club.league==="英超梯队")return PL_CLUBS.filter(x=>x.name!==s.club.name.replace(" U18","")).map(x=>({...x,name:`${x.name} U18`,strength:x.strength-11,league:"英超梯队"}));if(s.club.league==="中超梯队")return CSL_CLUBS.filter(x=>!s.club.name.includes(x.name)).map(x=>({...x,name:`${x.name} U16`,strength:x.strength-10,league:"中超梯队"}));if(s.club.league==="校园联赛")return CAMPUS_CLUBS.filter(x=>x.name!==s.club.name);return CSL_CLUBS.filter(x=>x.name!==c.name)}
function matchActionText(type,success,s){const rows={
  dribble:success?["边路接球后连续变向，甩开防守送出倒三角。","在肋部突然加速，穿过两人之间的缝隙。"]:["试图从边路强行突破，被对手提前卡住线路。","第一脚触球稍大，突破机会被边后卫破坏。"],
  finish:success?["禁区内抢到第二点，低射钻进远角！","反越位成功，冷静推射越过门将！"]:["获得单刀，但最后一脚擦着立柱偏出。","禁区前沿起脚，皮球被门将托出横梁。"],
  header:success?["高高跃起压住中卫，头球砸进网窝！","后点冲顶改变方向，门将来不及反应！"]:["抢到落点但头球高出，制空优势没有变成比分。","被中卫贴住身体，头球没有顶上力量。"],
  setpiece:success?["任意球越过人墙急速下坠，直挂死角！","定位球弧线绕过人墙，门将只能目送入网！"]:["任意球越过人墙，却被门将侧扑封出。","定位球打在人墙外侧，错过改写比分的机会。"],
  pass:success?["回撤吸引防守后送出直塞，队友形成单刀。","抢下第二点送出横传，队友完成破门。"]:["想法很清楚，但直塞力量稍大滑出底线。","反击中传球慢了半拍，越位旗随即举起。"]
};return pick(rows[type])}

function simulateMatchCore(s,rng=Math.random,opts={}){
  const club=currentClub(s),opp=opts.opponent||pick(opponentPool(s));
  const a=ageInfo(s),home=opts.home??rng()>.48,injured=s.injury.months>0||s.suspension>0;
  const rawStart=.42+(overall(s)-club.strength)/50+(s.coachFavor-50)/170+(s.form-50)/220+((s.teamFit||50)-50)/300+(hasTalent(s,"super_sub")?-.04:0);
  const starts=!injured&&rng()<clamp(rawStart,.15,.9),plays=!injured&&(starts||rng()<.74+(hasTalent(s,"super_sub")?.15:0));
  const role=starts?"首发":plays?"替补":"未出场";
  const talentBonus=(hasTalent(s,"big_heart")&&opts.important?4:0)+(hasTalent(s,"home_favorite")&&home?3:0)+(hasTalent(s,"super_sub")&&!starts&&plays?4:0)+(hasTalent(s,"final_master")&&opts.final?5:0);
  const playerLevel=weightedStatScore(s)+talentBonus+rndFloat(rng,-12,12);
  const clubEdge=(club.strength-opp.strength)+(home?3:-2)+(plays?(playerLevel-club.strength)*.16:0);
  const myXg=clamp(1.25+clubEdge/18,0.25,3.6),oppXg=clamp(1.12-clubEdge/22,0.25,3.3);
  let gf=poisson(myXg,rng),ga=poisson(oppXg,rng);
  if(opts.mustDecide&&gf===ga){if(rng()<.5)gf++;else ga++}
  const timeline=[{minute:5,text:home?"主场看台先把节奏推了起来。":"客场开局，对手试图用高压逼抢制造错误。",kind:"turn"}];
  let goals=0,assists=0,keyWins=0,failures=0;
  if(plays){
    const minuteStart=starts?8:rand(55,68),attempts=starts?rand(4,6):rand(2,4),types=["dribble","finish","pass","finish"];
    if(hasTalent(s,"aerial_king"))types.push("header","header");else types.push("header");
    if(hasTalent(s,"free_kick")||s.skills.setPiece>68)types.push("setpiece");
    for(let i=0;i<attempts;i++){
      const type=types[Math.floor(rng()*types.length)],stat=type==="finish"?s.skills.finishing:type==="dribble"?((s.stats.burst+s.skills.dribble)/2):type==="header"?s.stats.height:type==="setpiece"?s.skills.setPiece:s.skills.vision;
      let p=.25+(stat-45)/110+(s.form-50)/260+talentBonus/100;
      if(type==="finish"&&hasTalent(s,"box_instinct"))p+=.09;if(type==="header"&&hasTalent(s,"aerial_king"))p+=.13;if(type==="setpiece"&&hasTalent(s,"free_kick"))p+=.16;if(type==="dribble"&&hasTalent(s,"explosive_start"))p+=.08;
      const success=rng()<clamp(p,.16,.83);if(success)keyWins++;else failures++;
      let isGoal=success&&["finish","header","setpiece"].includes(type)&&goals<gf&&rng()<clamp(.36+(stat-55)/130,.28,.76);
      let isAssist=success&&["pass","dribble"].includes(type)&&assists+goals<gf&&rng()<clamp(.26+(s.skills.vision-45)/150,.18,.63);
      if(isGoal){goals++;timeline.push({minute:Math.min(88,Math.round(minuteStart+i*(80-minuteStart)/attempts+rndFloat(rng,0,6))),text:matchActionText(type,true,s),kind:"goal"})}
      else if(isAssist){assists++;timeline.push({minute:Math.min(88,Math.round(minuteStart+i*(80-minuteStart)/attempts+rndFloat(rng,0,6))),text:`助攻：${matchActionText(type,true,s)}`,kind:"good"})}
      else timeline.push({minute:Math.min(88,Math.round(minuteStart+i*(80-minuteStart)/attempts+rndFloat(rng,0,6))),text:matchActionText(type,success,s),kind:success?"good":"turn"});
    }
  }else timeline.push({minute:62,text:injured?"你在看台上观看比赛，康复计划没有允许冒险。":"教练完成最后一次换人，你仍留在替补席。",kind:"bad"});
  const injuryChance=plays?Math.max(.008,(.025+(45-s.fitness)/350+(s.injury.risk||0)/900-(hasTalent(s,"iron_man")?.015:0))*diffOf(s).injury*assetInjuryFactor(s)):0;
  const injuredInMatch=rng()<injuryChance;
  if(injuredInMatch)timeline.push({minute:rand(63,87),text:"一次对抗后你没有立刻站起来，队医示意换人。",kind:"bad"});
  timeline.push({minute:90,text:`终场：${club.name} ${gf}-${ga} ${opp.name}。`,kind:gf>ga?"goal":gf<ga?"bad":"turn"});
  timeline.sort((x,y)=>x.minute-y.minute);
  const rating=plays?clamp(6.05+goals*.92+assists*.55+keyWins*.11-failures*.07+rndFloat(rng,-.48,.48),4.7,10):0;
  const report={id:`m${Date.now()}${Math.random()}`,month:s.totalMonth,season:a.season,round:(s.seasonStats.matches||0)+1,competition:opts.competition||(`${club.league}第${(s.seasonStats.matches||0)+1}轮`),club:club.name,opponent:opp.name,home,role,gf,ga,goals,assists,rating:Number(rating.toFixed(1)),timeline,injured:injuredInMatch,model:{ability:Math.round(overall(s)),condition:Math.round((s.form+s.fitness)/2),random:Math.round(rndFloat(rng,1,100)),clubEdge:Math.round(clubEdge)}};
  return report;
}

function applyMatch(s,report){
  const pp=hasTalent(s,"pressure_proof")?.5:1;
  s.matches.unshift(report);s.matches=s.matches.slice(0,60);if(report.role==="未出场"){if(!(s.injury.months>0||(s.suspension||0)>0))change(s,"morale",Math.round(-3*pp));return}
  const c=s.statsCareer,ss=s.seasonStats;c.matches++;ss.matches++;if(report.role==="首发")c.starts++;c.goals+=report.goals;c.assists+=report.assists;ss.goals+=report.goals;ss.assists+=report.assists;ss.ratingTotal+=report.rating;
  if(report.gf>report.ga){c.wins++;ss.wins++;change(s,"form",5)}else if(report.gf===report.ga){c.draws++;change(s,"form",1)}else{c.losses++;change(s,"form",Math.round(-4*pp))}
  c.bestRating=Math.max(c.bestRating,report.rating);if(report.goals>=3){c.hatTricks++;unlock("hat_trick")};if(report.goals>0)unlock("first_goal");unlock("debut");if(c.goals>=50)unlock("fifty_goals");if(c.goals>=100)unlock("hundred_goals");if(c.assists>=50)unlock("fifty_assists");
  change(s,"fame",report.goals*1.3+report.assists*.7+(report.rating>=8?2:0));change(s,"fitness",-(hasTalent(s,"engine")?12:16));change(s,"morale",report.rating>=7?3:Math.round(-2*pp));change(s,"coachFavor",report.rating>=7.5?4:report.rating<6?-3:1);
  if(report.injured)sufferInjury(s,rand(1,4));
  log(s,report.gf>report.ga?"good":report.gf<report.ga?"bad":"story",`${report.competition}：${report.club} ${report.gf}-${report.ga} ${report.opponent}。你${report.role}，${report.goals}球${report.assists}助，评分${report.rating||"—"}。`)
}

function routeChoice16(s){
  const d=diffOf(s),o=overall(s),eligibleLocal=o>=63+d.threshold||s.scout>=28+d.threshold,eligibleOverseas=o>=72+d.threshold||(o>=68+d.threshold&&hasTalent(s,"scout_magnet"));
  const options=[];
  if(eligibleLocal)options.push(option("签下重庆铜梁龙一线队合同","留在国内，与小满继续交往；竞争、工资和家庭压力同时开始",()=>setRoute(s,"firstteam")));
  if(eligibleOverseas)options.push(option("接受 Manchester United U18 邀请","更高平台与成长上限；立即出国，并与小满正式分手",()=>setRoute(s,"overseas"),"gold"));
  options.push(option(eligibleLocal?"放弃职业合同，回校园":"接受落选，回到校园","与小满留在一起，学业更稳定；18岁仍可通过校队试训重返职业",()=>setRoute(s,"campus")));
  return{title:eligibleOverseas?"三扇门，只能走进一扇":eligibleLocal?"一纸合同，和另一种生活":"一线队名单上没有你的名字",portrait:eligibleOverseas?"assets/lin-xiaoman.webp":"assets/coach-zhou.webp",body:`16岁评估：综合能力 <b>${o}</b>，球探关注 <b>${Math.round(s.scout)}</b>，教练信任 <b>${Math.round(s.coachFavor)}</b>。${eligibleOverseas?"英格兰豪门梯队给出邀请，但不接受远程报到。小满没有哭，只问你是否已经决定。":eligibleLocal?"俱乐部给出一份低薪青年合同。校园与职业的路从今天开始分开。":"周骁说你的成长还没有结束，但俱乐部不能为“也许”保留位置。"}`,options}
}
function setRoute(s,route){s.route=route;s.flags.route16=true;if(route==="firstteam"){s.club={name:"重庆铜梁龙",league:"中超",strength:67};s.salary=4;s.relationship.status="恋人";addMoney(s,5);change(s,"fame",5);log(s,"story","你升入重庆铜梁龙一线队，与小满留在同一座城市。")}
  if(route==="overseas"){s.club={name:"Manchester United U18",league:"英超梯队",strength:74};s.salary=3;s.relationship.status="分手";s.relationship.love=0;s.flags.overseasBreakup=true;s.language=clamp(s.language+5);change(s,"fame",8);log(s,"story","你飞往英格兰。登机前，你和小满正式分手，没有约定等待。")}
  if(route==="campus"){s.club={name:"重庆市第七中学校队",league:"校园联赛",strength:55};s.salary=0;s.relationship.status="恋人";change(s,"study",12);changeLove(s,8);log(s,"story","你回到校园。小满坐在你旁边，但她要求你不要把她当作放弃职业的理由。")}}

function enterProAt18(s){if(s.flags.pro18)return;s.flags.pro18=true;
  if(s.route==="overseas"){const promote=overall(s)>=73+diffOf(s).threshold&&s.language>=35;s.club=promote?{name:"Manchester United",league:"英超",strength:85}:{name:"Hull City",league:"英超",strength:73};s.salary=promote?22:10;s.route="pro";if(s.club.league==="英超")unlock("premier");log(s,"story",promote?"你得到英超一线队合同。平台更大，容错更小。":"豪门没有给出一线队位置，Hull City 提供了真正的职业比赛。")}
  else if(s.route==="firstteam"){s.route="pro";s.club={name:"重庆铜梁龙",league:"中超",strength:67};s.salary=7;log(s,"story","18岁，你不再占用青年名额。俱乐部开始用成年人的标准衡量你。")}
  else{const d=diffOf(s),success=overall(s)>=61+d.threshold||s.scout>=38+d.threshold;s.route="pro";s.relationship.status="恋人";
    if(!success&&d.threshold>=5&&overall(s)<54+d.threshold){s.flags.washedOut=true;log(s,"bad","一圈职业试训下来，没有一家队愿意签你。绿茵这条路，到此为止。");return}
    const club=success?{name:"重庆铜梁龙",league:"中超",strength:67}:{name:"辽宁铁人",league:"中超",strength:65};s.club=club;s.salary=success?6:4;
    enqueueDecision({title:"18岁 · 迟到两年的试训",portrait:"assets/coach-zhou.webp",body:`两年前你没进职业队，回到校园一边读书一边踢球。有人劝你放弃，你还是每个周末往球场跑。这一次，${esc(club.name)}给了你三天试训的机会——看台上，小满和父亲都来了。<span class="dialogue">${success?"“绕了两年，你还是挤了回来。这回，站稳了。”":"“不是最风光的起点，但你终于重新站上了职业赛场。”"}</span>`,options:[option("握紧这次机会","职业生涯正式开始",()=>{})]},"18岁 · 重返职业");
    log(s,"story",success?`校队踢了两年，你在18岁赢得试训并重返${club.name}。`:`一次次试训后，${club.name}给了你一纸轮换合同，你绕远路回到了职业足球。`)}
  generateOffers(s,2)
}

function generateOffers(s,count=2,upgrade=false){if(ageInfo(s).age<18&&!s.flags.pro18)return[];const o=overall(s),current=currentClub(s);let pool=[...CSL_CLUBS,...PL_CLUBS].filter(c=>c.name!==current.name);pool=pool.filter(c=>{if(c.league==="英超"&&o<76+diffOf(s).threshold&&!hasTalent(s,"scout_magnet"))return false;if(upgrade&&c.strength<=current.strength)return false;return Math.abs(c.strength-(o+5))<=18});if(!pool.length)pool=[...CSL_CLUBS].filter(c=>c.name!==current.name);pool=pool.sort(()=>Math.random()-.5).slice(0,count);s.offers=pool.map(c=>({id:`o${Date.now()}${Math.random()}`,club:c.name,league:c.league,strength:c.strength,role:o>=c.strength+2?"核心":o>=c.strength-5?"轮换":"替补竞争",salary:Math.max(8,Math.round((c.strength-55)*1.4+s.fame/8)),fee:Math.max(120,Math.round((o-50)*38+s.fame*8)),months:2}));return s.offers}
function acceptOffer(s,id){const offer=s.offers.find(o=>o.id===id);if(!offer)return;const from=s.club.name;s.club={name:offer.club,league:offer.league,strength:offer.strength};s.salary=offer.salary;s.transfers.unshift({month:s.totalMonth,from,to:offer.club,fee:offer.fee,role:offer.role});const cut=s.agent?s.agent.cut/100:0;addMoney(s,Math.round((offer.salary*.8+offer.fee*.05)*(1-cut)));if(cut)log(s,"story",`经纪人按${s.agent.cut}%抽成，签约金到手打了折。`);s.flags.wantsMove=false;s.offers=[];change(s,"coachFavor",offer.role==="核心"?65-s.coachFavor:50-s.coachFavor);change(s,"fame",offer.league==="英超"?10:4);if(offer.league==="英超")unlock("premier");log(s,"story",`转会完成：${from} → ${offer.club}，角色为${offer.role}。`);if(s.route==="pro"&&ageInfo(s).age>=18){makeSeasonGoal(s);if(s.seasonGoal)log(s,"story",`新东家给了新的赛季目标：${s.seasonGoal.text}。`)}}

function nationalSelectionCheck(s){if(s.national.called||ageInfo(s).age<18)return false;const avg=s.seasonStats.matches?s.seasonStats.ratingTotal/s.seasonStats.matches:0;const threshold=(hasTalent(s,"red_shirt")?71:74)+diffOf(s).threshold;if(overall(s)>=threshold&&avg>=6.7+diffOf(s).threshold*.02){s.national.called=true;s.national.adapt=35;unlock("national");log(s,"story","中国国家队征召函抵达俱乐部。父亲把那张截图保存了三次。") ;return true}return false}
function simulateNationalMatch(s,rng=Math.random,worldCup=false){const opp=pick(NATIONAL_OPPONENTS),player=overall(s),china=70+(player-70)*.45+(s.national.adapt||0)*.05+(hasTalent(s,"red_shirt")?2:0),edge=china-opp.strength+rndFloat(rng,-9,9),gf=poisson(clamp(1.1+edge/18,.2,3.2),rng),ga=poisson(clamp(1.15-edge/22,.2,3.1),rng),goals=gf>0&&rng()<clamp(.28+(player-65)/85,.2,.72)?Math.min(gf,rng()<.16?2:1):0,assists=gf-goals>0&&rng()<.32?1:0,report={opponent:opp.name,gf,ga,goals,assists,worldCup};s.national.caps++;s.statsCareer.nationalCaps++;s.national.goals+=goals;s.statsCareer.nationalGoals+=goals;if(goals)unlock("national_goal");change(s,"fitness",-12);change(s,"fame",goals*3+(gf>ga?2:0));log(s,gf>ga?"good":gf<ga?"bad":"story",`国家队${gf}-${ga}${opp.name}。你贡献${goals}球${assists}助。`);return report}

function simulateWorldCup(s,rng=Math.random){s.national.worldCups++;const stages=["小组赛1","小组赛2","小组赛3","十六强","八强","半决赛","决赛"],opps=[{name:"墨西哥",strength:83},{name:"塞内加尔",strength:82},{name:"丹麦",strength:84},{name:"葡萄牙",strength:90},{name:"巴西",strength:93},{name:"法国",strength:94},{name:"阿根廷",strength:92}],results=[];let alive=true;for(let i=0;i<stages.length&&alive;i++){const opp=opps[i],team=72+(overall(s)-72)*.62+(s.national.adapt||0)*.06+(hasTalent(s,"red_shirt")?2:0)+(hasTalent(s,"big_heart")&&i>=3?2:0)+(hasTalent(s,"final_master")&&i===6?4:0),edge=team-opp.strength+rndFloat(rng,-10,10),gf=poisson(clamp(1.1+edge/16,.18,3.4),rng),ga=poisson(clamp(1.15-edge/20,.18,3.2),rng);let won=gf>ga;if(i>=3&&gf===ga)won=rng()<clamp(.42+edge/40+(hasTalent(s,"big_heart")?.08:0),.18,.82);results.push({stage:stages[i],opp:opp.name,gf,ga,won,pen:i>=3&&gf===ga});if(i>=3&&!won)alive=false;if(i<3&&i===2&&results.filter(x=>x.gf>x.ga).length<1)alive=false}const champion=results.length===7&&results[6].won;if(champion){s.honours.unshift({title:"世界杯冠军",season:ageInfo(s).season,icon:"世",detail:"中国国家队"});s.seasonStats.trophies++;unlock("world_cup");change(s,"fame",25);log(s,"good","中国队赢得世界杯。你把父亲送你的旧足球带上领奖台。")};return{results,champion}}

function makeSeasonGoal(s){if(ageInfo(s).age<18||s.route!=="pro"){s.seasonGoal=null;return}
  const o=overall(s),club=currentClub(s),roll=Math.random();let goal;
  if(club.tier===3||o<club.strength-4)goal={kind:"survive",target:6,text:`帮${s.club.name}至少赢下6场，别掉进降级区`};
  else if(roll<.5){const t=Math.max(6,Math.round((o-58)/3)+(s.club.league==="英超"?2:0));goal={kind:"goals",target:t,text:`本赛季至少打进${t}球`}}
  else goal={kind:"rating",target:7,text:"本赛季平均评分不低于7.0"};
  goal.season=ageInfo(s).season;s.seasonGoal=goal;log(s,"story",`教练组给了本赛季目标：${goal.text}。`)}
function goalProgressText(s){const g=s.seasonGoal;if(!g)return"";const ss=s.seasonStats,avg=ss.matches?(ss.ratingTotal/ss.matches).toFixed(1):"—";return g.kind==="goals"?`${g.text}（已进${ss.goals}球）`:g.kind==="rating"?`${g.text}（当前${avg}）`:`${g.text}（已赢${ss.wins}场）`}
function evaluateSeasonGoal(s){const g=s.seasonGoal;if(!g)return null;const ss=s.seasonStats,avg=ss.matches?ss.ratingTotal/ss.matches:0;let met=false;
  if(g.kind==="goals")met=ss.goals>=g.target;else if(g.kind==="rating")met=avg>=g.target&&ss.matches>=6;else if(g.kind==="survive")met=ss.wins>=g.target;
  if(met){change(s,"coachFavor",10);change(s,"fame",4);const bonus=Math.round((s.salary||4)*2);addMoney(s,bonus);log(s,"good",`完成赛季目标（${g.text}），拿到 ${bonus} 万奖金，教练更信任你。`)}
  else{s.goalFails=(s.goalFails||0)+1;change(s,"coachFavor",-12);change(s,"form",-8);log(s,"bad",`没完成赛季目标（${g.text}），你被挤出核心轮换。`);
    if(g.kind==="survive"){s.club.strength=Math.max(58,s.club.strength-6);s.salary=Math.max(2,Math.round((s.salary||4)*.75));log(s,"bad",`${s.club.name}降级，球队实力和你的薪水一起缩水。`)}
    if(s.goalFails>=2){s.salary=Math.max(2,Math.round((s.salary||4)*.8));s.goalFails=0;generateOffers(s,2);log(s,"bad","连续两季不达标，俱乐部下调了你的合同，还暗示你可以走人。")}}
  return{goal:g,met}}
function seasonAwardCheck(s,rng=Math.random){const ss=s.seasonStats,avg=ss.matches?ss.ratingTotal/ss.matches:0,score=overall(s)*.48+ss.goals*1.15+ss.assists*.65+ss.trophies*7+(s.club.league==="英超"?6:0)+(s.national.goals||0)*.25+avg*1.6+rndFloat(rng,-5,6),ballon=score>=92+diffOf(s).threshold*1.5,leagueTitle=ss.matches>=7&&ss.wins/ss.matches>=.7&&overall(s)>=currentClub(s).strength-2&&rng()<.48-diffOf(s).threshold*.02;
  if(leagueTitle){const title=`${s.club.league}冠军`;s.honours.unshift({title,season:ageInfo(s).season,icon:"♛",detail:s.club.name});ss.trophies++;unlock("league_title")}
  if(ballon){s.awards.unshift({title:"金球奖",season:ageInfo(s).season,score:Math.round(score)});s.honours.unshift({title:"金球奖",season:ageInfo(s).season,icon:"●",detail:`评选指数 ${Math.round(score)}`});unlock("ballon");change(s,"fame",15)}
  const result={score:Math.round(score),ballon,leagueTitle,avg:Number(avg.toFixed(1)),goals:ss.goals,assists:ss.assists};s.lastSeasonAward=result;s.seasonStats={matches:0,goals:0,assists:0,wins:0,ratingTotal:0,trophies:0};updateRanking(s);return result}

function careerScore(s){const c=s.statsCareer;return Math.round(overall(s)*18+c.goals*24+c.assists*15+c.nationalGoals*30+s.honours.length*140+s.awards.length*220+s.fame*5+(s.money||0)*2+assetValue(s)*2-(s.debt||0)*6-(s.flags.bettingEver?420:0))}
function applyAging(s){const d=diffOf(s),age=ageInfo(s).age;if(age<d.decayAge)return;const yrs=age-d.decayAge+1,m=d.soft;const drop=base=>Math.max(0,(base+yrs*.7)*m*rndFloat(Math.random,.6,1.3));
  s.stats.speed=clamp(s.stats.speed-drop(1.6),1,99);s.stats.burst=clamp(s.stats.burst-drop(1.5),1,99);s.stats.stamina=clamp(s.stats.stamina-drop(1.2),1,99);
  if(yrs>=3)s.skills.dribble=clamp(s.skills.dribble-drop(.9),1,99);
  s.stats.will=clamp(s.stats.will+.4,1,99);
  log(s,"story",`${age}岁，身体开始走下坡路，你越来越靠经验和跑位吃饭。`)}
function shouldRetire(s){const d=diffOf(s),age=ageInfo(s).age;if(s.flags&&s.flags.washedOut)return"washout";if(age>=d.retireAge)return"age";if(age>=d.decayAge+2&&overall(s)<48)return"decline";if(age>=d.decayAge&&(s.suspension||0)>=18)return"banned";return null}
function endingGrade(s){const c=s.statsCareer,peak=s.peakOverall||overall(s);if(s.awards.length&&s.national.worldCups&&s.honours.some(h=>h.title==="世界杯冠军"))return{tier:"传奇",line:"你把中国前锋的名字写进了世界杯的历史。多年以后，还有小孩穿着印你号码的球衣在铁丝网外踢野球。"};
  if(s.awards.length||peak>=88)return{tier:"巨星",line:"你站上过这项运动的最高处。数据、奖杯和那些逆转之夜，足够被反复讲很多年。"};
  if(c.goals>=100||s.honours.length>=2||peak>=82)return{tier:"顶级职业球员",line:"你没成为唯一的主角，但在最高水平的联赛里稳稳踢了很多年，这本身已经很少有人做到。"};
  if(c.matches>=60||peak>=72)return{tier:"合格职业球员",line:"你靠着自律和不服输，把一次次替补和伤病熬了过去，完成了一段体面的职业生涯。"};
  if(c.matches>0)return{tier:"短暂的职业生涯",line:"职业足球没给你太多时间，但你确实站上过那片草皮。这段路，父亲和小满都看在眼里。"};
  return{tier:"未竟的绿茵梦",line:"你没能真正踢进职业赛场，但那只旧足球陪你走过的日子，不会因此作废。"}}
function buildEnding(s){const c=s.statsCareer,a=ageInfo(s),g=endingGrade(s),love=s.relationship.status;
  const loveEnd=love==="恋人"?`你和小满还在一起。她说，最庆幸的不是你踢出来了，而是你没在路上把自己弄丢。`:love==="异地"?`你和小满隔着城市把关系维持到了最后，两个人都学会了在电话里把重要的话说清楚。`:`你和小满早已走散。偶尔在新闻里看到对方的消息，也只是笑一下，各自安好。`;
  return{grade:g.tier,line:g.line,loveEnd,age:a.age,peak:s.peakOverall||overall(s),score:careerScore(s),
    metrics:[[c.matches,"生涯出场"],[c.goals,"进球"],[c.assists,"助攻"],[c.nationalCaps,"国家队出场"],[s.honours.length,"奖杯/大赛荣誉"],[s.awards.length,"金球奖"]],
    honours:s.honours.slice(),difficulty:diffOf(s).name}}
function retirePlayer(s,reason){s.retired=true;s.retireReason=reason;modalQueue=[];modalBusy=false;if(typeof document!=="undefined")$("modalMask")?.classList.add("hidden");updateRanking(s);const label=reason==="age"?`${ageInfo(s).age}岁，你决定挂靴。`:reason==="banned"?"长期禁赛让你再也回不到从前，你选择离开。":reason==="washout"?"没能踏进职业赛场，你把球鞋收进了柜子。":"身体和状态都告诉你，是时候退役了。";log(s,"story",label);if(typeof document!=="undefined")showEnding(s)}
function defaultMeta(){return{unlocked:{},rankings:[],runs:0}}
function loadMeta(){try{return{...defaultMeta(),...JSON.parse(localStorage.getItem(META_KEY)||"{}")}}catch(e){return defaultMeta()}}
let META=typeof localStorage!=="undefined"?loadMeta():defaultMeta();
function saveMeta(){try{localStorage.setItem(META_KEY,JSON.stringify(META))}catch(e){}}
function unlock(id){if(META.unlocked[id])return;META.unlocked[id]=Date.now();saveMeta();if(typeof document!=="undefined")toast(`成就解锁：${ACHIEVEMENTS.find(a=>a.id===id)?.name||id}`)}
function updateRanking(s){const a=ageInfo(s);const row={runId:s.runId,name:s.name,age:a.age,club:s.club.name,score:careerScore(s),goals:s.statsCareer.goals,awards:s.awards.length,date:new Date().toLocaleDateString("zh-CN")};META.rankings=META.rankings.filter(x=>x.runId!==s.runId);META.rankings.push(row);META.rankings.sort((x,y)=>y.score-x.score);META.rankings=META.rankings.slice(0,10);saveMeta()}
function checkAchievements(s){if(ageInfo(s).age<16&&overall(s)>=70)unlock("academy_70");if(s.statsCareer.goals>=50)unlock("fifty_goals");if(s.statsCareer.goals>=100)unlock("hundred_goals");if(s.statsCareer.assists>=50)unlock("fifty_assists");if(ageInfo(s).age>=24&&s.relationship.status==="恋人"&&s.relationship.love>=70)unlock("loyal_love");if(["恋人","异地"].includes(s.relationship.status)&&s.relationship.love>=95)unlock("deep_bond");if(ageInfo(s).age>=23&&!s.flags.bettingEver)unlock("clean_career")}

let S=null,modalQueue=[],modalBusy=false,prologueIndex=0,prologueClickAt=0,creatorAllocation={height:4,speed:4,burst:4,stamina:4,will:4},creatorTalents=[],creatorDifficulty="standard",rerollsLeft=1,toastTimer=null;
const $=id=>document.getElementById(id);
function saveGame(){if(!S)return false;try{localStorage.setItem(SAVE_KEY,JSON.stringify(S));return true}catch(e){return false}}
function loadGame(){try{const raw=localStorage.getItem(SAVE_KEY);if(!raw)return null;const data=JSON.parse(raw);if(data.version!==VERSION)return null;return data}catch(e){return null}}
function toast(text){if(typeof document==="undefined")return;const el=$("toast");if(!el)return;el.textContent=text;el.classList.add("show");clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove("show"),1800)}

function enqueueDecision(d,kicker="关键抉择"){if(!d)return;modalQueue.push({...d,kicker});pumpModal()}
function pumpModal(){if(modalBusy||!modalQueue.length||typeof document==="undefined")return;modalBusy=true;const d=modalQueue.shift(),mask=$("modalMask"),modal=$("modal"),wrap=$("modalPortraitWrap");$("modalKicker").textContent=d.kicker||"关键抉择";$("modalTitle").textContent=d.title||"抉择";$("modalBody").innerHTML=d.body||"";
  if(d.portrait){wrap.classList.remove("hidden");$("modalPortrait").src=d.portrait;modal.classList.remove("no-portrait")}else{wrap.classList.add("hidden");modal.classList.add("no-portrait")}
  const opts=typeof d.options==="function"?d.options(S):d.options;$("modalOptions").innerHTML="";(opts||[option("继续","",()=>{})]).forEach((o,i)=>{const b=document.createElement("button");b.className=`option-button ${o.tone||""}`;b.innerHTML=`<b>${esc(o.text)}</b>${o.effect?`<span>${esc(o.effect)}</span>`:""}`;b.addEventListener("click",()=>{b.disabled=true;try{o.apply?.()}finally{mask.classList.add("hidden");modalBusy=false;saveGame();renderAll();setTimeout(pumpModal,80)}});$("modalOptions").appendChild(b)});mask.classList.remove("hidden");const first=$("modalOptions").querySelector("button");if(first)setTimeout(()=>first.focus(),30)}
function trapModalFocus(e){if(e.key!=="Tab"||$("modalMask").classList.contains("hidden"))return;const f=[...$("modalOptions").querySelectorAll("button:not([disabled])")];if(!f.length)return;const first=f[0],last=f[f.length-1];if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus()}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus()}}

function intimateCheck(s){if(s.flags.intimateUnlocked||ageInfo(s).age<18)return;if(!["恋人","异地"].includes(s.relationship.status))return;if(s.relationship.love<100)return;if(s.flags.intimateCooldown&&s.totalMonth-s.flags.intimateCooldown<6)return;
  enqueueDecision({title:"那个没有回家的夜晚",portrait:"assets/lin-xiaoman.webp",body:`门在身后合上，你们没有开灯。她的手指扣进你的指缝，凉凉的，又慢慢变热。你低头吻她，她踮起脚回应，比你想的要主动。外套滑落在地板上，皮肤贴着皮肤，她的呼吸打在你耳边。<span class="dialogue">“别停。”</span>窗外的城市很吵，屋里只剩下你们两个人的心跳。`,options:[
    option("把她拥进怀里，这一夜属于彼此","关系更进一步；此后可选“和小满独处”，状态↑体力↓",()=>{s.flags.intimateUnlocked=true;change(s,"form",10);change(s,"morale",12);change(s,"fitness",-14);log(s,"story","天亮时她还睡在你臂弯里，头发散在枕头上。你第一次觉得，除了足球，生活里还有别的东西值得。")}),
    option("按住冲动，先陪她说说话","感情+4；保持现在的节奏",()=>{s.flags.intimateCooldown=s.totalMonth;changeLove(s,4);change(s,"morale",6);log(s,"story","你们聊到很晚，最后靠着彼此睡着了。有些事不必赶在今晚。")})]},"两个人");}
function breakupCheck(s){if(!["恋人","异地"].includes(s.relationship.status))return;const conflict=s.relationship.conflict||0;if((s.relationship.conflictShield||0)>0&&conflict>=45&&s.relationship.love>=22){s.relationship.conflictShield--;s.relationship.conflict=30;log(s,"good","青梅羁绊缓冲了一次激烈的争执，你们没有走到分手。");return}
  if((s.relationship.love<22||conflict>=45)&&!s.flags.breakupQueued){s.flags.breakupQueued=true;enqueueDecision({title:conflict>=55?"她不想再替你解释":"有些等待不会自动变成理解",portrait:"assets/lin-xiaoman.webp",body:`小满把你们这些年的消息翻到最前面。<span class="dialogue">“我不是你输球以后回来充电的地方。这次我不想再听你保证了。”</span>`,options:[
    option("接受分手，停止纠缠","关系变为分手；意志+2，状态-12",()=>{s.relationship.status="分手";s.relationship.love=0;gainStat(s,"will",2,"will");change(s,"form",-12)}),
    option("公开承担问题并接受边界","冲突-20，感情+8；声望-6、训练状态-5",()=>{s.relationship.conflict=Math.max(0,conflict-20);changeLove(s,8);change(s,"fame",-6);change(s,"form",-5);s.flags.breakupQueued=false})]});}
}

function riskSettlement(s){
  if(s.risks.gambling>=55&&!s.flags.gamblingExploded&&chance(.25)){s.flags.gamblingExploded=true;enqueueDecision({title:"那笔钱终于出现在调查材料里",body:"联赛纪律部门通知俱乐部，你与异常投注账户存在资金往来。现在承认会面临停赛，否认则可能在更多证据出现后失去一切。",options:[option("主动交代并配合调查","停赛6个月，声望-25；保留重返球场的可能",()=>{s.suspension=6;change(s,"fame",-25);change(s.risks,"gambling",-35);s.awards=[]}),option("否认到底","50%证据不足；否则停赛24个月并失去国家队",()=>{if(chance(.5)){change(s.risks,"gambling",-15);log(s,"warn","调查暂未形成结论，但暗雷没有消失。")}else{s.suspension=24;s.national.called=false;change(s,"fame",-55);log(s,"bad","更多转账与通讯记录被确认，你被长期禁赛。")}},"danger")]})}
  if(s.risks.media>=65&&chance(.2)){change(s,"fame",-8);change(s.risks,"media",-12);log(s,"warn","一轮集中舆论消耗了你的公众信用。")}
  if(s.flags.hivDiagnosed&&s.healthCare<50){change(s,"fitness",-8);change(s.risks,"health",8)}
}

const ACTION_FEEDBACK={
  team_training:["你把每个传接细节都做到位，教练在场边不动声色地点了下头。","合练结束别人都走了，你又多跑了两趟折返，训练服湿得能拧出水。"],
  sprint:["最后一组冲刺你几乎要吐，但落地那一下，第一步明显更快了。","折返一趟接一趟，大腿像灌了铅，你还是咬着牙冲完了。"],
  shooting:["近角、远角、抢点、逆足……你一颗颗把球送进网窝，直到手感发烫。","加练到天黑，捡球的师傅都劝你回去，你说再来五十脚。"],
  tactics:["录像一帧帧倒回去看，你终于弄明白那个球为什么没接到。","你在战术板上把自己的跑位重画了一遍，恍然大悟。"],
  setpiece:["同一个落点摆了上百次，弧线越来越听你的话。","风向、助跑、触球点，你把定位球拆成了一道数学题。"],
  date:["你绕远路等在她楼下。小满看到突然冒出来的你，愣了一下，随即笑着跑过来，一头扎进你怀里。你们并肩往回走，谁都没提比赛。","训练一结束你就溜了出去，只为陪她走那段十分钟的夜路。她假装嫌你一身汗，手却没松开。"],
  video_call:["屏幕那头隔着七小时时差，你们还是把今天各自的事都讲给了对方听。"],
  english:["更衣室里听不懂的俚语，你一条条记下来，第二天硬着头皮开口，队友笑着给你比了个赞。"],
  family:["父亲没问你进了几个球，只问膝盖还疼不疼。一顿家常饭，你吃得比哪场庆功宴都踏实。"],
  rest:["你关掉手机，睡到自然醒，第一次没有为'再练十分钟'感到愧疚。"],
  street:["野球场没有战术板，只有不服输的对手。你连过三人,笑得像个孩子。"],
  school:["你把落下的功课一页页补上，合上书本时窗外已经黑透了。"],
  campus_match:["校队的比赛只有几百名观众，你还是拼得满身泥，仿佛这就是决赛。"],
  gym:["杠铃一次次压下来，你能感觉到，下次中卫再靠上来，你站得住了。"],
  media:["镁光灯下，你学着把每句话说得滴水不漏。采访播出后，粉丝又涨了一批。"],
  coach_talk:["你带着录像和问题去找教练，把该说清楚的都说清楚了。"],
  recovery:["冰浴、理疗、睡眠监测……这些不会出现在集锦里，却让你的身体更耐用。"],
  national_role:["你为国家队练起了边路的防守职责，俱乐部的前锋训练被分走了一部分。"],
  gift:["你把她念叨过很久的那样东西递过去，小满眼睛一下就亮了，嘴上还嫌你乱花钱。"],
  support_family:["你把一部分工资打回了家。电话那头父亲沉默了很久，最后只说了句'够了够了'。"],
  together:["你们把整座城市关在门外。她的吻从你嘴角一路往下，那一晚很长，也很近，天快亮时才睡去。","她把训练服从你身上扒下来，笑你一身汗味，却没有推开你。剩下的时间只属于你们两个人。"]
};
function actionFeedback(a){const arr=ACTION_FEEDBACK[a.id];return arr?pick(arr):`你认真完成了「${a.name}」。`}
function applyAction(id){if(!S||S.actionPoints<=0)return;const a=ACTIONS.find(x=>x.id===id);if(!a||!a.phases.includes(phaseOf(S))||(a.show&&!a.show(S)))return;const used=S.actionUsage[id]||0;if(used>=(a.max||1))return;if(a.cost&&(S.money||0)<a.cost){toast("资金不足，先靠比赛或媒体活动赚钱");return}if(S.injury.months>0&&!['rest','recovery','school','family','english','video_call','gift','support_family'].includes(id)){toast("伤停期不能完成高强度行动");return}
  S.actionPoints--;S.actionUsage[id]=used+1;a.run(S);unlock("first_action");if(S.flags.weeklyPromise&&id==="team_training"&&used===0){gainSkill(S,"finishing",-.08,"finish")};const fb=actionFeedback(a);S.lastActionFeedback={name:a.name,text:fb,effects:a.effects.join("、")};log(S,"action",fb);checkAchievements(S);saveGame();renderAll()}

function shouldPlayMatch(s){if(s.flags&&s.flags.washedOut)return false;const a=ageInfo(s).age,p=phaseOf(s);if(a<16)return s.totalMonth%3===0;if(p==="campus")return s.totalMonth%2===0;return true}
function queueMatchReport(s,report){enqueueDecision({title:`${report.competition} · ${report.club} ${report.gf}-${report.ga} ${report.opponent}`,body:`<div class="match-score"><span class="match-team">${esc(report.club)}</span><strong>${report.gf} : ${report.ga}</strong><span class="match-team">${esc(report.opponent)}</span></div><p>你${report.role}${report.rating?`，评分 <b>${report.rating}</b>`:""}；${report.goals}球，${report.assists}助攻。</p><div class="timeline-list">${report.timeline.map(t=>`<div class="timeline-row"><b>${t.minute}'</b><span>${esc(t.text)}</span></div>`).join("")}</div><div class="factor-row"><div class="factor"><b>${report.model.ability}</b><span>能力基础 · 约60%</span></div><div class="factor"><b>${report.model.condition}</b><span>状态体能 · 约25%</span></div><div class="factor"><b>${report.model.random}</b><span>临场波动 · 约15%</span></div></div>`,options:[option("收下这场比赛","数据已计入生涯统计",()=>{})]},"比赛简报")}

function queueEvent(s,e){enqueueDecision({title:e.title,body:e.body,portrait:e.portrait,options:e.options(s)},"两月事件")}
function queueStory(s,beat){enqueueDecision({title:beat.title,body:beat.body,portrait:beat.portrait,options:beat.options},"半年剧情")}
function queueNationalCall(s){enqueueDecision({title:"中国国家男子足球队 · 征召",portrait:"assets/father.webp",body:`国家队领队拨通电话时，你以为是广告推销。父亲坐在旁边，一句话也没说，只把电视声音关小。<span class="dialogue">“去吧。穿那件球衣的时候，别怕。”</span>`,options:[option("接受征召","国家队功能开放；体能管理压力增加",()=>{})]},"国家队")}
function queueNationalReport(r){enqueueDecision({title:`国家队 ${r.gf}-${r.ga} ${r.opponent}`,body:`你代表中国队出场，贡献 <b>${r.goals}</b> 球。${r.gf>r.ga?"终场哨后，整片看台都在唱同一首歌。":r.gf<r.ga?"失利没有让任务结束，下一次集训已经写进日历。":"比分没有分出高下，身体的疲惫却很具体。"}`,options:[option("返回俱乐部","国家队数据已归档",()=>{})]},"为国而战")}
function queueWorldCupReport(r){enqueueDecision({title:r.champion?"中国队，世界冠军":"世界杯之旅结束",body:`<div class="story-list">${r.results.map(x=>`<div class="story-log"><time>${x.stage}</time><div><h3>中国 ${x.gf}-${x.ga} ${esc(x.opp)}${x.pen?"（点球）":""}</h3><p>${x.won?"晋级":"止步"}</p></div></div>`).join("")}</div>${r.champion?`<p class="dialogue">终场哨一响，你和队友一起冲进场内。七场比赛，你们真的一场一场赢到了最后。</p>`:"<p>你把这一届的比分记了下来。四年后，还能再来一次。</p>"}`,options:[option("记住这一届","国家队数据已更新",()=>{})]},"世界杯")}
function queueAward(r,s,goalResult){const gLine=goalResult?`<p class="dialogue" style="border-color:${goalResult.met?'#28d27d':'#e0564f'}">赛季目标${goalResult.met?"达成":"未达成"}：${esc(goalResult.goal.text)}。${goalResult.met?"奖金与信任到账。":"信任下滑，位置不保。"}</p>`:"";enqueueDecision({title:r.ballon?"金球奖属于你":"年度评选揭晓",body:`本赛季 ${r.goals} 球、${r.assists} 助攻，平均评分 ${r.avg}，评选指数 <b>${r.score}</b>。${r.ballon?"当主持人念出你的名字，你先想到的不是聚光灯，而是父亲手里的旧足球。":"你进入了候选讨论，但奖杯属于另一个赛季表现更完整的人。"}${r.leagueTitle?`<p class="dialogue">同时，你随${esc(s.club.name)}赢得${esc(s.club.league)}冠军。</p>`:""}${gLine}`,options:[option("进入下一赛季","年度数据已经归档",()=>{})]},"年度荣誉")}

function advanceMonth(force=false){if(!S||modalBusy||S.retired)return;if(S.actionPoints>0&&!force){enqueueDecision({title:"还有执行点没有使用",body:`本月还剩 <b>${S.actionPoints}</b> 点。这些点用不完也不会留到下个月。`,options:[option("继续安排本月","返回行动面板",()=>{}),option("放弃剩余时间","直接进入下个月",()=>setTimeout(()=>advanceMonth(true),120),"danger")]},"时间确认");return}
  S.totalMonth++;S.actionPoints=3;S.actionUsage={};change(S,"fitness",8);change(S,"morale",1);change(S,"form",-1);
  S.peakOverall=Math.max(S.peakOverall||0,overall(S));S.lastActionFeedback=null;
  if(["恋人","异地"].includes(S.relationship.status))change(S,"morale",S.relationship.love>=65?3:1);
  if(S.assets&&S.assets.house)change(S,"morale",2);
  if(S.totalMonth%12===0&&ageInfo(S).age<=18){const grow=rand(2,4);S.heightCm=Math.min(200,S.heightCm+grow);log(S,"story",`身体又长开了一些，你现在${S.heightCm}cm。`)}
  const preSusp=S.suspension||0,preInjury=S.injury.months||0;
  S.offers.forEach(o=>o.months--);S.offers=S.offers.filter(o=>o.months>0);
  const a=ageInfo(S),justTurned16=S.totalMonth===24,justTurned18=S.totalMonth===48;
  if(justTurned16&&!S.flags.route16){enqueueDecision(routeChoice16(S),"16岁 · 生涯分流")}
  if(justTurned18)enterProAt18(S);
  if(a.age>=16&&S.salary>0){const d=diffOf(S),wage=Math.round(S.salary*d.income),expense=Math.round((1.5+S.fame/28)*d.expense);addMoney(S,wage-expense);if(S.debt>0&&S.totalMonth%6===0){S.debt=Math.round(S.debt*1.05);log(S,"warn","欠款利息又滚了一点，早点还清。")}}
  const passive=assetPassive(S);if(passive)addMoney(S,passive);if(S.assets&&S.assets.image_team&&S.totalMonth%3===0)change(S,"fame",1);
  if(!S.retired&&shouldPlayMatch(S)){const report=simulateMatchCore(S);applyMatch(S,report);queueMatchReport(S,report)}
  if(preSusp>0)S.suspension=Math.max(0,(S.suspension||0)-1);
  if(preInjury>0){S.injury.months=Math.max(0,S.injury.months-1);if(!S.injury.months){S.injury.name="";unlock("injury_return");log(S,"good","自然康复期结束，你重新进入比赛名单。")}}
  if(S.totalMonth%2===0&&!justTurned16){const e=chooseRandomEvent(S);if(e)queueEvent(S,e)}
  if(S.totalMonth%6===0&&STORY_BEATS[S.totalMonth])queueStory(S,STORY_BEATS[S.totalMonth](S));
  if(a.age>=18&&S.totalMonth%6===0&&!S.offers.length)generateOffers(S,S.flags.wantsMove?3:2);
  const calledNow=nationalSelectionCheck(S);if(calledNow)queueNationalCall(S);else if(S.national.called&&S.totalMonth%6===0)queueNationalReport(simulateNationalMatch(S));
  if(S.national.called&&S.totalMonth>=96&&S.totalMonth%48===0)queueWorldCupReport(simulateWorldCup(S));
  if(S.totalMonth%12===0){applyAging(S);const goalResult=evaluateSeasonGoal(S);queueAward(seasonAwardCheck(S),S,goalResult);makeSeasonGoal(S)}
  riskSettlement(S);breakupCheck(S);intimateCheck(S);checkAchievements(S);updateRanking(S);
  if(!S.retired){const r=shouldRetire(S);if(r){retirePlayer(S,r);saveGame();return}}
  saveGame();renderAll();pumpModal()}

function phaseCopy(s){const a=ageInfo(s).age,p=phaseOf(s);if(a<16)return["梯队成长期","通过训练和比赛争取留队"];if(a<18&&p==="firstteam")return["一线队学徒期","训练、替补和更衣室竞争都要适应"];if(a<18&&p==="overseas")return["海外青训期","先适应语言，再跟上训练强度"];if(a<18&&p==="campus")return["校园重启期","兼顾学业，为18岁的职业试训做准备"];return["职业生涯","转会、国家队和年度荣誉已经开放"]}

function renderAll(){if(!S||typeof document==="undefined")return;const a=ageInfo(S),[phase,hint]=phaseCopy(S);$("playerNameText").textContent=S.name;$("clubText").textContent=S.club.name;$("overallText").textContent=overall(S);$("heightCm").textContent=`${S.heightCm}cm`;$("ageText").textContent=`${a.age}岁`;$("monthText").textContent=`第${a.month}月`;$("apText").textContent=`${S.actionPoints} / 3`;$("careerSubtitle").textContent=`第${a.season}赛季 · ${phase}`;$("phaseTitle").textContent=phase;$("phaseHint").textContent=`${hint} · ${S.totalMonth%2===0?"两个月后触发抉择":"下个月触发两月抉择"}`;$("fitnessText").textContent=Math.round(S.fitness);$("formText").textContent=Math.round(S.form);$("loveText").textContent=S.relationship.status==="分手"?"—":Math.round(S.relationship.love);$("fitnessBar").style.width=`${S.fitness}%`;$("formBar").style.width=`${S.form}%`;$("loveBar").style.width=`${S.relationship.love}%`;const mEl=$("moraleText"),mBar=$("moraleBar");if(mEl)mEl.textContent=Math.round(S.morale);if(mBar)mBar.style.width=`${S.morale}%`;const moneyEl=$("moneyText");if(moneyEl){moneyEl.textContent=`${Math.round(S.money)}万`;moneyEl.style.color=S.money<0?"var(--bad)":"var(--gold)"}
  $("talentMini").innerHTML=S.talents.map(id=>`<span>${esc(talentById(id)?.name||id)}</span>`).join("");$("statBars").innerHTML=CORE_STATS.map(x=>`<div class="stat-row"><span>${x.name}</span><div class="track"><i style="width:${S.stats[x.key]}%"></i></div><b>${Math.round(S.stats[x.key])}</b></div>`).join("");
  document.querySelectorAll("#gameNav button").forEach(b=>b.classList.toggle("active",b.dataset.tab===S.tab));renderTab();}

function renderTab(){const fn={actions:renderActions,story:renderStory,career:renderCareer,matches:renderMatches,transfer:renderTransfer,assets:renderAssets,national:renderNational,honours:renderHonours,rank:renderRank}[S.tab]||renderActions;fn()}
function renderAssets(){const d=diffOf(S),wage=S.salary>0?Math.round(S.salary*d.income):0,expense=S.salary>0?Math.round((1.5+S.fame/28)*d.expense):0,passive=assetPassive(S),net=wage-expense+passive,tm=Math.round((trainMult(S)-1)*100),inj=Math.round((1-assetInjuryFactor(S))*100);
  const card=it=>{const owned=ownedAsset(S,it.id),lock=owned?null:assetLocked(S,it),broke=!owned&&!lock&&S.money<it.cost,disabled=owned||lock||broke;return`<article class="action-card ${owned?"used":""}"><div class="action-icon">${it.icon}</div><h3>${esc(it.name)}</h3><p>${esc(it.desc)}</p><div class="effect-line"><span>${esc(it.effect)}</span><span>${it.cost}万</span></div><button data-buy="${it.id}" ${disabled?"disabled":""}>${owned?"已拥有":lock?esc(lock):broke?`资金不足 · 需${it.cost}万`:`购买 · ${it.cost}万`}</button></article>`};
  const sections=ASSET_CATS.map(cat=>{const items=ASSETS.filter(a=>a.cat===cat);if(!items.length)return"";return`<div class="section-head"><h2>${esc(cat)}</h2><span>${items.filter(a=>ownedAsset(S,a.id)).length}/${items.length}</span></div><div class="action-grid">${items.map(card).join("")}</div>`}).join("");
  $("panel").innerHTML=`<section class="hero-panel"><span class="eyebrow">MONEY & ASSETS</span><h2>你的账户与资产</h2><p>钱来自合同月薪、比赛奖金、媒体、代言和投资分红；用于礼物、家用、专业康复和下面的资产。资金、资产都计入生涯积分，欠款拉低积分。越贵的东西往往要靠年龄、声望或先置资产解锁——攒钱吧。</p>${heroMetrics([[`${Math.round(S.money)}万`,"个人资金"],[`${net>=0?"+":""}${net}/月`,"每月净收入"],[`+${passive}/月`,"投资被动收入"],[`+${tm}% · -${inj}%`,"训练加成 · 伤病"]])}</section>${sections}<div class="section-head"><h2>赚钱与花钱的入口</h2><span>大多在“行动”页</span></div><article class="info-card"><p>· 赚钱：进球助攻、媒体安排、赛季目标奖金、转会签字费、投资被动收入。<br>· 花钱：给小满买礼物、贴补家用、专业康复，以及本页资产。<br>· 提示：月薪按合同逐月发，生活开销随名气上涨；欠款每半年计息，尽早还清。</p></article>`;
  $("panel").querySelectorAll("[data-buy]").forEach(b=>b.addEventListener("click",()=>{if(buyAsset(S,b.dataset.buy)){toast("到手了");saveGame();renderAll()}else toast("买不了：资金或条件不足")}))}
function heroMetrics(items){return`<div class="metric-grid">${items.map(x=>`<div class="metric"><b>${esc(x[0])}</b><span>${esc(x[1])}</span></div>`).join("")}</div>`}

function renderActions(){const phase=phaseOf(S),available=ACTIONS.filter(a=>a.phases.includes(phase)&&(!a.show||a.show(S)));$("panel").innerHTML=`<section class="hero-panel"><span class="eyebrow">MONTHLY PLAN</span><h2>${esc(S.name)}，这个月你想怎么过？</h2><p>同一种行动每月最多执行${phase==="academy"?"一到两次":"两次"}。天赋会影响成功率和收益，但每种选择都有取舍。<span class="diff-inline">${esc(diffOf(S).name)}难度</span></p>${S.seasonGoal?`<div class="goal-banner"><span class="eyebrow">本赛季目标</span>${esc(goalProgressText(S))}</div>`:""}${heroMetrics([[`${S.actionPoints}/3`,"剩余执行点"],[overall(S),"综合能力"],[Math.round(S.coachFavor),"教练信任"],[S.injury.months?`${S.injury.months}月`:"健康","伤停状态"]])}</section>${S.lastActionFeedback?`<div class="feedback-banner"><span class="eyebrow">${esc(S.lastActionFeedback.name)}</span><p>${esc(S.lastActionFeedback.text)}</p><small>${esc(S.lastActionFeedback.effects)}</small></div>`:""}<div class="section-head"><h2>本月行动</h2><span>${available.length}项可选 · 点击即消耗1点</span></div><div class="action-grid">${available.map(a=>{const used=S.actionUsage[a.id]||0,broke=a.cost&&(S.money||0)<a.cost,injuredLock=S.injury.months>0&&!['rest','recovery','school','family','english','video_call','gift','support_family'].includes(a.id),disabled=S.actionPoints<=0||used>=a.max||broke||injuredLock;return`<article class="action-card ${used?"used":""}"><div class="action-icon">${a.icon}</div><h3>${esc(a.name)}</h3><p>${esc(a.desc)}</p><div class="effect-line">${a.effects.map(e=>`<span>${esc(e)}</span>`).join("")}</div><button data-action-id="${a.id}" ${disabled?"disabled":""}>${used>=a.max?"本月已完成":broke?`资金不足 · 需${a.cost}万`:injuredLock?"伤停不可用":"执行 · 1点"}</button></article>`}).join("")}</div>`;$("panel").querySelectorAll("[data-action-id]").forEach(b=>b.addEventListener("click",()=>applyAction(b.dataset.actionId)))}

function renderStory(){const relation=S.relationship.status==="分手"?"你们已经分开，关系值不再变化，但共同经历仍留在生涯记录里。":S.relationship.status==="异地"?"隔着这么远还没散，可每次谁都不先开口，心就更远一点。":"她有自己的学业和生活，不可能一直围着你的比赛转。";$("panel").innerHTML=`<section class="hero-panel relation-card"><img src="assets/lin-xiaoman.webp" alt="林小满"><div><span class="eyebrow">林小满 · ${esc(S.relationship.status)}</span><h2>${S.relationship.status==="分手"?"你们回到了各自的人生":`关系值 ${Math.round(S.relationship.love)}`}</h2><p class="quote">${relation}</p><div class="bar-label"><span>亲密与信任</span><b>${Math.round(S.relationship.love)}/100</b></div><div class="bar-wide"><i style="width:${S.relationship.love}%"></i></div>${S.relationship.status!=="分手"?`<div class="effect-line"><span>比赛发挥 +${loveSupport(S)}</span><span>每月心情 +${S.relationship.love>=65?3:1}</span><span>关系越高，加成越大</span></div>`:""}</div></section><div class="section-head"><h2>人生记录</h2><span>最近${Math.min(30,S.log.length)}条</span></div><div class="story-list">${S.log.slice(0,30).map(l=>{const ai={age:14+Math.floor(l.month/12),month:l.month%12+1};return`<article class="story-log"><time>${ai.age}岁·${ai.month}月</time><div><h3>${l.kind==="action"?"行动":l.kind==="good"?"好消息":l.kind==="bad"?"代价":"故事"}</h3><p>${esc(l.text)}</p></div></article>`}).join("")}</div>`}

function renderCareer(){const a=ageInfo(S),c=S.statsCareer,winRate=c.matches?Math.round(c.wins/c.matches*100):0;$("panel").innerHTML=`<section class="hero-panel"><span class="eyebrow">CAREER FILE</span><h2>${esc(S.name)} · ${esc(S.position)}</h2><p>${esc(S.club.name)}，${a.age}岁。你能走多远，不只看最高属性；出勤、状态和每次选择也算数。</p>${heroMetrics([[c.matches,"正式比赛"],[c.goals,"生涯进球"],[c.assists,"生涯助攻"],[`${winRate}%`,"胜率"]])}</section><div class="career-grid"><article class="info-card path-card"><h3>生涯时间线</h3><div class="path-line"><b>14岁 · 重庆铜梁龙U16</b><span>进入当地知名俱乐部梯队</span></div><div class="path-line"><b>16岁 · ${S.flags.route16?S.route==="overseas"?"赴英青训":S.route==="campus"?"回到校园":"升入一线队":"尚未发生"}</b><span>${S.flags.route16?S.route==="overseas"?"与小满分手，独自适应海外":S.route==="campus"?"保留感情与学业，等待第二次机会":"在熟悉的城市开始成年足球":"16岁评估后决定去向"}</span></div><div class="path-line"><b>18岁 · ${S.flags.pro18?`效力${esc(S.club.name)}`:"转会市场尚未开放"}</b><span>${S.flags.pro18?"职业合同、转会与国家队系统开放":"继续积累实力、球探与教练信任"}</span></div></article><article class="info-card"><h3>技术属性（训练成长）</h3><div class="effect-line"><span>射术 ${Math.round(S.skills.finishing)}</span><span>盘带 ${Math.round(S.skills.dribble)}</span><span>视野 ${Math.round(S.skills.vision)}</span><span>定位球 ${Math.round(S.skills.setPiece)}</span><span>语言 ${Math.round(S.language)}</span><span>声望 ${Math.round(S.fame)}</span></div><p>射术、盘带、视野和定位球都是真实数值，会参与综合能力和比赛判定。“关键球”不设单独数值，由意志、状态、赛事阶段和相关天赋共同影响。当前生涯积分 <b>${careerScore(S)}</b>。</p></article></div><div class="section-head"><h2>转会履历</h2><span>${S.transfers.length}次</span></div>${S.transfers.length?`<div class="card-list">${S.transfers.map(t=>`<article class="info-card"><h3>${esc(t.from)} → ${esc(t.to)}</h3><p>${14+Math.floor(t.month/12)}岁 · 转会费${t.fee}万 · ${esc(t.role)}</p></article>`).join("")}</div>`:'<div class="empty-state">尚未完成正式转会。</div>'}`}

function matchCard(m){return`<article class="info-card match-card"><span class="eyebrow">${esc(m.competition)} · ${m.role}</span><div class="match-score"><span class="match-team">${esc(m.club)}</span><strong>${m.gf}:${m.ga}</strong><span class="match-team">${esc(m.opponent)}</span></div><div class="effect-line"><span>评分 ${m.rating||"—"}</span><span>${m.goals}球</span><span>${m.assists}助</span><span>${m.home?"主场":"客场"}</span></div><div class="timeline-list">${m.timeline.slice(-4).map(t=>`<div class="timeline-row"><b>${t.minute}'</b><span>${esc(t.text)}</span></div>`).join("")}</div></article>`}
function renderMatches(){const c=S.statsCareer;$("panel").innerHTML=`<section class="hero-panel"><span class="eyebrow">MATCH CENTRE</span><h2>强不等于稳赢</h2><p>能力越高，发挥通常越稳；但状态、疲劳、伤停、对手强弱和临场运气都会影响结果。</p>${heroMetrics([[c.matches,"出场"],[c.starts,"首发"],[c.goals,"进球"],[c.bestRating.toFixed?.(1)||c.bestRating,"最佳评分"]])}</section><div class="section-head"><h2>最近比赛</h2><span>${S.matches.length}场已归档</span></div><div class="card-list">${S.matches.length?S.matches.slice(0,12).map(matchCard).join(""):'<div class="empty-state">梯队正式比赛每3个月一次。结束月份后，第一场简报会出现在这里。</div>'}</div>`}

function renderTransfer(){if(ageInfo(S).age<18){$("panel").innerHTML=`<div class="locked-panel"><div class="lock">⌁</div><h2>转会市场将在18岁开放</h2><p>16岁的选择会影响职业起点。即使回到校园，18岁时仍有机会参加职业试训。</p></div>`;return}$("panel").innerHTML=`<section class="hero-panel"><span class="eyebrow">TRANSFER MARKET</span><h2>${esc(S.club.name)} · 身价约 ${Math.max(120,Math.round((overall(S)-50)*38+S.fame*8))}万</h2><p>报价会参考能力、年龄、声望、赛季数据和天赋。球队越强，比赛强度越高，首发也越难拿。个人资金可以用来给小满买礼物、贴补家用和专业康复，也会计入生涯积分。${S.debt?`<br><b>当前欠款 ${S.debt} 万</b>，会拉低生涯积分，记得用工资或“贴补家用”还清。`:""}</p>${heroMetrics([[overall(S),"综合能力"],[Math.round(S.fame),"声望"],[S.offers.length,"有效报价"],[`${Math.round(S.money)}万`,"个人资金"]])}</section><div class="section-head"><h2>收到的报价</h2><button id="askOffers" class="small-button" ${S.actionPoints<1?"disabled":""}>联系经纪人 · 1点</button></div><div class="card-list">${S.offers.length?S.offers.map(o=>`<article class="offer-card"><div><span class="eyebrow">${esc(o.league)} · ${esc(o.role)}</span><h3>${esc(o.club)}</h3><p>俱乐部强度 ${o.strength} · 转会费 ${o.fee}万 · 报价剩余${o.months}个月</p><div class="offer-actions"><button class="small-button" data-offer="${o.id}">接受报价</button></div></div><div class="salary"><b>${o.salary}万</b><br><span class="tag">月薪</span></div></article>`).join(""):'<div class="empty-state">当前没有有效报价。每半年会自动刷新，也可以消耗1点联系经纪人。</div>'}</div>`;$("askOffers")?.addEventListener("click",()=>{if(S.actionPoints<1)return;S.actionPoints--;generateOffers(S,3);log(S,"action","联系经纪人了解转会市场。");saveGame();renderAll()});$("panel").querySelectorAll("[data-offer]").forEach(b=>b.addEventListener("click",()=>{enqueueDecision({title:"确认完成转会？",body:`离开${esc(S.club.name)}后，现有教练信任与首发顺位会重新计算。`,options:[option("签署合同","转会立即生效",()=>acceptOffer(S,b.dataset.offer),"gold"),option("再考虑一下","报价继续保留",()=>{})]},"转会确认")}))}

function renderNational(){if(!S.national.called){const avg=S.seasonStats.matches?S.seasonStats.ratingTotal/S.seasonStats.matches:0;$("panel").innerHTML=`<div class="locked-panel"><div class="lock">★</div><h2>国家队大门尚未打开</h2><p>当前${esc(diffOf(S).name)}难度下，通常需要综合能力达到 ${(hasTalent(S,"red_shirt")?71:74)+diffOf(S).threshold}，并保持赛季平均评分 ${(6.7+diffOf(S).threshold*.02).toFixed(1)} 以上。当前能力 ${overall(S)}，赛季平均 ${avg?avg.toFixed(1):"—"}。</p></div>`;return}$("panel").innerHTML=`<section class="hero-panel"><span class="eyebrow">CHINA NATIONAL TEAM</span><h2>穿上国家队球衣</h2><p>国家队比赛每半年触发。你可能受伤，也可能被安排到不熟悉的位置；实力足够时，还能带队冲击世界杯。</p>${heroMetrics([[S.national.caps,"国家队出场"],[S.national.goals,"国家队进球"],[Math.round(S.national.adapt),"战术适应"],[S.national.worldCups,"世界杯次数"]])}</section><div class="section-head"><h2>国家队说明</h2><span>世界杯每4年模拟一次</span></div><article class="info-card"><h3>当前角色</h3><p>${overall(S)>=90?"世界级核心，球队会围绕你的终结能力组织进攻。":overall(S)>=82?"稳定主力，拥有改变亚洲级强强对话的能力。":"轮换前锋，需要在有限时间内证明自己。"}${S.flags.outOfPosition?" 教练还会把你安排到右侧承担防守职责。":""}</p><div class="effect-line"><span>身披红色战袍</span><span>${hasTalent(S,"red_shirt")?"红色战袍天赋":"常规征召"}</span><span>${S.flags.captain?"国家队队长候选":"竞争队内地位"}</span></div></article>`}

function renderHonours(){const c=S.statsCareer;$("panel").innerHTML=`<section class="hero-panel"><span class="eyebrow">TROPHY ROOM</span><h2>你的奖杯和纪录</h2><p>奖杯、成就和生涯数据都会保存在本地。金球奖会综合赛季进球、助攻、平均评分、联赛级别、国家队表现和团队荣誉。</p>${heroMetrics([[S.honours.length,"奖杯与大赛荣誉"],[S.awards.length,"金球奖"],[c.goals,"生涯进球"],[c.assists,"生涯助攻"]])}</section><div class="section-head"><h2>奖杯陈列室</h2><span>${S.honours.length}件</span></div>${S.honours.length?`<div class="trophy-shelf">${S.honours.map(h=>`<article class="honour-card"><div class="trophy-icon">${esc(h.icon||"♛")}</div><b>${esc(h.title)}</b><span>第${h.season}赛季 · ${esc(h.detail||"")}</span></article>`).join("")}</div>`:'<div class="empty-state">奖杯架还空着。真正的职业生涯刚刚开始。</div>'}<div class="section-head"><h2>成就系统</h2><span>${Object.keys(META.unlocked).length}/${ACHIEVEMENTS.length}</span></div><div class="achievement-grid">${ACHIEVEMENTS.map(a=>`<article class="achievement-card ${META.unlocked[a.id]?"":"locked"}"><div class="ach-icon">${a.icon}</div><div><b>${esc(a.name)}</b><span>${esc(a.desc)}</span></div></article>`).join("")}</div>`}

function renderRank(){updateRanking(S);const rankings=META.rankings;$("panel").innerHTML=`<section class="hero-panel"><span class="eyebrow">LOCAL LEGENDS</span><h2>这台设备上的绿茵传奇</h2><p>排行只保存在本地浏览器，不上传姓名或存档。每个赛季和关键结算都会更新当前生涯的最好成绩。</p>${heroMetrics([[careerScore(S),"当前积分"],[rankings.findIndex(x=>x.runId===S.runId)+1||"—","本地名次"],[META.runs,"开档次数"],[Object.keys(META.unlocked).length,"已解锁成就"]])}</section><div class="section-head"><h2>本地生涯排行</h2><span>最多保留10档</span></div><article class="rank-card"><table class="rank-table"><thead><tr><th>排名</th><th>球员</th><th>俱乐部</th><th>年龄</th><th>进球</th><th>积分</th></tr></thead><tbody>${rankings.map((r,i)=>`<tr class="${r.runId===S.runId?"me":""}"><td>${i+1}</td><td>${esc(r.name)}</td><td>${esc(r.club)}</td><td>${r.age}</td><td>${r.goals}</td><td><b>${r.score}</b></td></tr>`).join("")}</tbody></table></article>`}

function randomTalents(){return TALENTS.slice().sort(()=>Math.random()-.5).slice(0,3).map(t=>t.id)}
function renderCreator(){const left=20-Object.values(creatorAllocation).reduce((a,b)=>a+b,0);$("pointsLeft").textContent=left;$("attributeAllocator").innerHTML=CORE_STATS.map(x=>`<div class="allocate-row"><div class="allocate-name"><b>${x.icon} ${x.name}</b><span>${x.sub}</span></div><div class="allocate-track"><i style="width:${creatorAllocation[x.key]*5}%"></i></div><button class="step-btn" data-stat="${x.key}" data-delta="-1" ${creatorAllocation[x.key]<=0?"disabled":""}>−</button><button class="step-btn" data-stat="${x.key}" data-delta="1" ${left<=0?"disabled":""}>＋</button><div class="allocate-value">${creatorAllocation[x.key]}</div></div>`).join("");$("talentDraft").innerHTML=creatorTalents.map(id=>{const t=talentById(id);return`<article class="talent-card"><span class="sigil">${t.icon}</span><b>${esc(t.name)}</b><p>${esc(t.desc)}</p></article>`}).join("");const dp=$("difficultyPicker");if(dp){dp.innerHTML=Object.values(DIFFICULTIES).map(d=>`<button class="diff-card ${creatorDifficulty===d.key?"active":""}" data-diff="${d.key}"><b>${esc(d.name)}</b><span class="diff-tag">${esc(d.tag)}</span><p>${esc(d.desc)}</p></button>`).join("");dp.querySelectorAll("[data-diff]").forEach(b=>b.addEventListener("click",()=>{creatorDifficulty=b.dataset.diff;renderCreator()}))}
$("rerollTalents").disabled=rerollsLeft<=0;$("startGame").disabled=left!==0||creatorTalents.length!==3||!$("playerName").value.trim();$("attributeAllocator").querySelectorAll("[data-stat]").forEach(b=>b.addEventListener("click",()=>{const k=b.dataset.stat,d=Number(b.dataset.delta),remaining=20-Object.values(creatorAllocation).reduce((a,v)=>a+v,0);if(d>0&&remaining<=0||d<0&&creatorAllocation[k]<=0)return;creatorAllocation[k]+=d;renderCreator()}))}

function renderPrologue(){const p=PROLOGUE[prologueIndex];$("prologuePortrait").src=p.portrait;$("prologueKicker").textContent=p.kicker;$("prologueTitle").textContent=p.title;$("prologueBody").innerHTML=p.body.map(x=>`<p>${x}</p>`).join("");$("prologueProgress").style.width=`${(prologueIndex+1)/PROLOGUE.length*100}%`;$("nextPrologue").innerHTML=prologueIndex===PROLOGUE.length-1?"进入梯队 <span>→</span>":"继续 <span>→</span>"}
function showGame(){$("creator").classList.add("hidden");$("prologue").classList.add("hidden");$("ending")?.classList.add("hidden");$("game").classList.remove("hidden");if(S.retired){showEnding(S);return}updateRanking(S);saveGame();renderAll()}
function showEnding(s){const e=buildEnding(s),el=$("ending");if(typeof document==="undefined"||!el)return;$("game").classList.add("hidden");$("modalMask").classList.add("hidden");el.classList.remove("hidden");
  $("endingBody").innerHTML=`<span class="eyebrow">CAREER OVER · ${esc(e.difficulty)}难度</span><h2>${esc(s.name)} · ${e.age}岁挂靴</h2><div class="ending-grade">${esc(e.grade)}</div><p class="ending-line">${esc(e.line)}</p>
  <div class="metric-grid">${e.metrics.map(x=>`<div class="metric"><b>${esc(x[0])}</b><span>${esc(x[1])}</span></div>`).join("")}</div>
  <p class="ending-line">生涯最高能力 <b>${e.peak}</b> · 最终生涯积分 <b>${e.score}</b></p>
  <p class="ending-line">${esc(e.loveEnd)}</p>
  ${e.honours.length?`<div class="section-head"><h2>奖杯陈列</h2><span>${e.honours.length}件</span></div><div class="trophy-shelf">${e.honours.map(h=>`<article class="honour-card"><div class="trophy-icon">${esc(h.icon||"♛")}</div><b>${esc(h.title)}</b><span>第${h.season}赛季 · ${esc(h.detail||"")}</span></article>`).join("")}</div>`:`<p class="ending-line">奖杯架空着，但父亲那只旧足球，一直摆在你家最显眼的位置。</p>`}
  <button id="endingRestart" class="primary-cta" type="button">开启新的生涯 <span>→</span></button>`;
  $("endingRestart").addEventListener("click",()=>{try{localStorage.removeItem(SAVE_KEY)}catch(e){}S=null;modalQueue=[];modalBusy=false;$("continueBtn")?.remove();creatorAllocation={height:4,speed:4,burst:4,stamina:4,will:4};creatorTalents=randomTalents();rerollsLeft=1;el.classList.add("hidden");$("creator").classList.remove("hidden");renderCreator()})}
function startNewGame(){const name=$("playerName").value.trim();$("continueBtn")?.remove();modalBusy=false;modalQueue=[];S=createInitialState(name,creatorAllocation,creatorTalents,creatorDifficulty);META.runs=(META.runs||0)+1;saveMeta();saveGame();prologueIndex=0;$("creator").classList.add("hidden");$("prologue").classList.remove("hidden");renderPrologue()}
function requestRestart(){if(!S){location.reload();return}enqueueDecision({title:"重新开始这段生涯？",body:`当前${ageInfo(S).age}岁的进度会被新存档覆盖。本地成就与历史排行会保留。`,options:[option("保留当前进度","返回游戏",()=>{}),option("确认重开","清除当前存档，回到创建球员",()=>{try{localStorage.removeItem(SAVE_KEY)}catch(e){}S=null;modalQueue=[];modalBusy=false;$("continueBtn")?.remove();creatorAllocation={height:4,speed:4,burst:4,stamina:4,will:4};creatorTalents=randomTalents();rerollsLeft=1;$("game").classList.add("hidden");$("creator").classList.remove("hidden");renderCreator()},"danger")]},"重新开档")}

function init(){
  creatorTalents=randomTalents();renderCreator();
  const saved=loadGame();if(saved){const cont=document.createElement("button");cont.id="continueBtn";cont.className="ghost-btn";cont.style.cssText="width:100%;margin-top:10px;min-height:46px";cont.textContent=`继续 ${saved.name} · ${ageInfo(saved).age}岁存档`;cont.addEventListener("click",()=>{if(!loadGame())return;S=saved;showGame()});$("startGame").after(cont)}
  $("playerName").addEventListener("input",renderCreator);$("rerollTalents").addEventListener("click",()=>{if(rerollsLeft<=0)return;creatorTalents=randomTalents();rerollsLeft--;renderCreator()});$("startGame").addEventListener("click",startNewGame);$("nextPrologue").addEventListener("click",()=>{const now=Date.now();if(now-prologueClickAt<300)return;prologueClickAt=now;if(prologueIndex<PROLOGUE.length-1){prologueIndex++;renderPrologue()}else showGame()});
  document.addEventListener("keydown",trapModalFocus);
  $("gameNav").addEventListener("click",e=>{const b=e.target.closest("button[data-tab]");if(!b||!S)return;S.tab=b.dataset.tab;saveGame();renderAll()});$("endMonthBtn").addEventListener("click",()=>advanceMonth());$("saveBtn").addEventListener("click",()=>toast(saveGame()?"进度已保存在本机":"保存失败"));$("restartBtn").addEventListener("click",requestRestart);
}

const API={VERSION,TALENTS,ACTIONS,EVENTS,ACHIEVEMENTS,CSL_CLUBS,PL_CLUBS,DIFFICULTIES,createInitialState,overall,ageInfo,phaseOf,chooseRandomEvent,simulateMatchCore,applyMatch,routeChoice16,setRoute,enterProAt18,generateOffers,acceptOffer,nationalSelectionCheck,simulateNationalMatch,simulateWorldCup,seasonAwardCheck,careerScore,applyAging,shouldRetire,buildEnding,makeSeasonGoal,evaluateSeasonGoal,breakupCheck,ASSETS,buyAsset,assetPassive,assetValue,assetLocked,trainMult,advanceMonth:()=>advanceMonth(true),getState:()=>S,setState:s=>{S=s}};
if(typeof window!=="undefined")window.PlayerLife=API;else if(typeof globalThis!=="undefined")globalThis.PlayerLife=API;
if(typeof document!=="undefined")document.addEventListener("DOMContentLoaded",init);
