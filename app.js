"use strict";

const SAVE_KEY="player_life_save_v1",META_KEY="player_life_meta_v1",VERSION=3;
// 同月重复行动的收益/风险修正。只在 applyAction 执行期间偏离 1，事件与剧情调用 gain 时不受影响。
let actionMult=1,actionInjuryMult=1;
const DIFFICULTIES={
  standard:{key:"standard",name:"标准",tag:"已经不轻松",desc:"成长偏慢、伤病更多、门槛更高。默认就比旧版难，适合第一次认真通关。",growth:.8,soft:1,injury:0.9,threshold:2,income:.85,expense:1,decayAge:31,retireAge:35},
  hard:{key:"hard",name:"困难",tag:"硬核",desc:"成长很慢、资源紧张、状态易崩，失败会被雪藏或降薪。需要精打细算每一个执行点。",growth:.64,soft:1.25,injury:1.2,threshold:5,income:.7,expense:1.25,decayAge:30,retireAge:34},
  brutal:{key:"brutal",name:"严酷",tag:"一步错步步错",desc:"巅峰短暂、伤病凶狠、账面永远紧张，一次贪婪可能毁掉整段生涯。大部分存档踢不出职业。",growth:.5,soft:1.6,injury:1.6,threshold:9,income:.55,expense:1.6,decayAge:29,retireAge:33}
};
function diffOf(s){return DIFFICULTIES[s&&s.difficulty]||DIFFICULTIES.standard}
function softFactor(cur,d,lv=0){const t=lv*5;let f=cur>=88+t?.25:cur>=82+t?.4:cur>=75+t?.6:cur>=68+t?.8:1;if(cur>=68+t)f/=d.soft;return f}
/* ========== 判定内核 ==========
   cond() 把状态与体能压成一个 0.78~1.08 的系数；eff() 是所有判定读取属性的
   唯一入口。任何判定公式都不得再单独掺 form/fitness——那会双重计数。      */
function cond(s){return clamp(1+(s.form-55)/500+(s.fitness-72)/600,.78,1.08)}
const COND_SENS={PHY:1.4,PAC:1.3,DEF:1.2,DRI:1.0,SHO:.7,PAS:.6,WIL:.4};
function eff(s,k){return s.attrs[k]*(1+(cond(s)-1)*COND_SENS[k])}
function atk(s){return eff(s,"SHO")*.35+eff(s,"PAC")*.25+eff(s,"DRI")*.20+eff(s,"PAS")*.20}
function def(s){return eff(s,"DEF")*.60+eff(s,"PHY")*.25+eff(s,"WIL")*.15}
const ATTRS=[
  {key:"PAC",name:"速度",sub:"冲刺与启动",icon:"»",w:.21},
  {key:"SHO",name:"射门",sub:"终结与打门",icon:"◎",w:.25},
  {key:"PAS",name:"传球",sub:"视野与定位球",icon:"▣",w:.08},
  {key:"DRI",name:"盘带",sub:"控球与过人",icon:"✦",w:.14},
  {key:"DEF",name:"防守",sub:"逆抢与协防",icon:"▰",w:.05},
  {key:"PHY",name:"身体",sub:"对抗与续航",icon:"▲",w:.13},
  {key:"WIL",name:"意志",sub:"抗压与临场",icon:"◆",w:.14}
];
const ATTR_KEYS=ATTRS.map(a=>a.key);
// 创建页点数预算只有这一份：显示、加减按钮守卫、重开重置都从这里取，避免两份常数漂移。
const START_ALLOC={PAC:4,SHO:4,PAS:3,DRI:3,DEF:3,PHY:3,WIL:4},ALLOC_BUDGET=Object.values(START_ALLOC).reduce((a,b)=>a+b,0);
// 身高档位是一张受校验的表：矮个与高个互为镜像，未知档位一律回落到 mid。
const HEIGHT_TIERS={short:{name:"矮个",cm:174,adj:{PHY:-5,PAC:3,DRI:2}},mid:{name:"中等",cm:182,adj:{}},tall:{name:"高个",cm:191,adj:{PHY:5,PAC:-3,DRI:-2}}};
const TALENTS=[
  {id:"explosive_start",icon:"ϟ",name:"一步先机",desc:"速度与盘带训练收益+25%，突破第一步成功率提高。",tags:["PAC","DRI"]},
  {id:"box_instinct",icon:"◎",name:"禁区嗅觉",desc:"禁区内射门与补射事件更容易转化为进球。",tags:["SHO","goal"]},
  {id:"big_heart",icon:"◆",name:"大心脏",desc:"意志成长+18%，世界杯淘汰赛和点球大战表现更稳。",tags:["WIL","clutch"]},
  {id:"iron_man",icon:"▰",name:"铁人",desc:"疲劳导致的受伤概率降低40%。",tags:["injury","PHY"]},
  {id:"aerial_king",icon:"↥",name:"空霸",desc:"头球、背身与高空对抗发动率提高。",tags:["PHY","header"]},
  {id:"free_kick",icon:"⌁",name:"任意球专家",desc:"传球训练收益+30%，比赛中可能直接破门。",tags:["PAS","goal"]},
  {id:"ambidextrous",icon:"Ⅱ",name:"逆足精通",desc:"弱侧射门不再明显降质，过人路线更多。",tags:["SHO","DRI"]},
  {id:"captain",icon:"♛",name:"绿茵领袖",desc:"队友事件与国家队适应更有利，更易成为队长。",tags:["WIL","team"]},
  {id:"football_iq",icon:"◇",name:"高球商",desc:"录像、战术与助攻类行动收益+25%。",tags:["PAS","tactics"]},
  {id:"engine",icon:"∞",name:"永动机",desc:"身体训练收益+25%，比赛后体能消耗降低。",tags:["PHY","fitness"]},
  {id:"pressure_proof",icon:"▣",name:"抗压体质",desc:"替补、舆论和打压造成的状态损失减半。",tags:["WIL","media"]},
  {id:"scout_magnet",icon:"◉",name:"伯乐缘",desc:"球探事件与高一级俱乐部报价概率提高。",tags:["scout","transfer"]},
  {id:"language_gift",icon:"A",name:"语言天分",desc:"英语学习收益翻倍，海外适应更快。",tags:["language","overseas"]},
  {id:"childhood_bond",icon:"♥",name:"青梅羁绊",desc:"与林小满相处时关系收益提高，冲突缓冲一次。",tags:["love","WIL"]},
  {id:"quick_healer",icon:"✚",name:"伤愈加速",desc:"伤停时间减少1个月，康复行动额外恢复。",tags:["recovery","injury"]},
  {id:"super_sub",icon:"↗",name:"超级替补",desc:"替补登场时状态加成，进球概率不低于首发的80%。",tags:["sub","goal"]},
  {id:"home_favorite",icon:"⌂",name:"主场宠儿",desc:"主场比赛状态更好，球迷与声望增长更快。",tags:["home","fame"]},
  {id:"red_shirt",icon:"★",name:"红色战袍",desc:"国家队征召门槛降低，国家队比赛表现小幅提高。",tags:["national","WIL"]},
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
// 世预赛（亚洲区）对手池
const WC_QUAL_POOL=[
  {name:"日本",strength:85},{name:"韩国",strength:83},{name:"伊朗",strength:82},{name:"澳大利亚",strength:80},
  {name:"沙特阿拉伯",strength:78},{name:"卡塔尔",strength:76},{name:"伊拉克",strength:73},{name:"阿联酋",strength:72},
  {name:"阿曼",strength:69},{name:"越南",strength:67},{name:"巴林",strength:66}
];
// 世界杯决赛圈：小组赛对手池（中上游）
const WC_GROUP_POOL=[
  {name:"墨西哥",strength:82},{name:"塞内加尔",strength:81},{name:"日本",strength:82},{name:"美国",strength:80},
  {name:"韩国",strength:80},{name:"瑞士",strength:81},{name:"喀麦隆",strength:79},{name:"哥伦比亚",strength:82},
  {name:"波兰",strength:80},{name:"澳大利亚",strength:78},{name:"摩洛哥",strength:83},{name:"加纳",strength:78}
];
// 世界杯决赛圈：淘汰赛对手池（强队）
const WC_ELITE_POOL=[
  {name:"巴西",strength:93},{name:"法国",strength:93},{name:"阿根廷",strength:92},{name:"英格兰",strength:90},
  {name:"西班牙",strength:89},{name:"葡萄牙",strength:89},{name:"德国",strength:88},{name:"荷兰",strength:87},
  {name:"意大利",strength:86},{name:"克罗地亚",strength:85},{name:"比利时",strength:85},{name:"乌拉圭",strength:84}
];

const PROLOGUE=[
  {kicker:"序章 · 200?年",title:"那只旧足球",portrait:"assets/father.webp",body:[
    "你爸从工具箱里翻出那只球时，手上的机油还没洗掉。球皮磨花了大半，logo只剩一半，他拿抹布擦了两下，递给你：<span class='dialogue'>“拿去，楼下练。”</span>",
    "他站在路灯底下给你数数。数到一百就咳嗽，咳完接着数。后来你才知道，那只球是厂里发的劳保福利，他本来想换一个保温饭盒。",
    "你颠了三年，直到球面那块最破的皮彻底掉下来，露出里面黑色的胆。你没扔，塞进书包最底层，一直带到梯队。"]},
  {kicker:"序章 · 童年",title:"她总比终场哨更早等你",portrait:"assets/lin-xiaoman.webp",body:[
    "小满坐在铁丝网外面写作业。你训练结束的时候，操场灯刚好灭，她合上练习册站起来，裙摆上压出几道折痕。",
    "她从来不提前说会来，但你每次出场都能看见她。有一回你问她等了多久，她说<span class='dialogue'>“没看表，正好写完一张卷子。”</span>",
    "后来你才知道，她每天提前半小时下课，绕半个校区走过来。你问她为什么，她说：<span class='dialogue'>“终场哨太响了，怕你听不见有人等你。”</span>",
    "（那句话你没有回答。但你在替补席上坐着的每一场，都会下意识往铁丝网那边看一眼。）"]},
  {kicker:"第1章 · 14岁",title:"梯队名单上的最后一个名字",portrait:"assets/coach-zhou.webp",body:[
    "名单贴在三楼走廊的公告栏上，玻璃框里用A4纸打印的。",
    "你从最后一个名字开始看——不是，再往上一个——不是，再往上——直到手指停在倒数第三个位置。你的名字。入选。",
    "你站在公告栏前面没动，旁边有人挤着往里看，有人已经掏出手机打电话。你把手放下来，指腹上沾了一层旧报纸的灰。",
    "那天晚上你爸没有多说什么，只在饭桌上多放了一双筷子，说<span class='dialogue'>“你妈那份”</span>。"]}
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
  {id:"captain_armband",icon:"C",name:"队长袖标",desc:"成为俱乐部或国家队队长"},
  {id:"classic_match",icon:"★",name:"经典之战",desc:"打出一场评分8.5以上、或高风险选择全部命中的比赛"}
];

const ACTIONS=[
  {id:"train_box",style:"box",phases:["academy","firstteam","overseas","campus","pro"],icon:"◎",name:"抢点终结",desc:"一筐球摆在禁区弧顶，射门、补射、逆足，再把定位球放在同一处反复打。",effects:["射门↑↑","传球↑","意志↑","体能↓"],max:2,run:s=>{gain(s,"SHO",.75,"finish");gain(s,"PAS",.3,"setpiece");gain(s,"WIL",.22,"will");change(s,"fitness",-10)}},
  {id:"train_burst",style:"burst",phases:["academy","firstteam","overseas","campus","pro"],icon:"»",name:"速度突破",desc:"折返冲刺、启动步、连续变向——用乳酸换那更快的第一步。",effects:["速度↑↑","盘带↑","体能↓"],max:2,run:s=>{gain(s,"PAC",.8,"speed");gain(s,"DRI",.4,"dribble");change(s,"fitness",-13);fatigueInjuryCheck(s,.022)}},
  {id:"train_target",style:"target",phases:["academy","firstteam","overseas","campus","pro"],icon:"▲",name:"对抗支点",desc:"负重、卡位、争顶，跟队里最壮的中卫一次次撞在一起。",effects:["身体↑↑","意志↑","体能↓"],max:2,run:s=>{gain(s,"PHY",.8,"physical");gain(s,"WIL",.3,"will");change(s,"fitness",-13);fatigueInjuryCheck(s,.022)}},
  {id:"train_play",style:"play",phases:["academy","firstteam","overseas","campus","pro"],icon:"▣",name:"回撤组织",desc:"跟着全队跑位置串联，赛后再把录像一帧帧倒回去看自己该往哪儿撤。",effects:["传球↑↑","盘带↑","教练信任↑","状态↑"],max:2,run:s=>{gain(s,"PAS",.8,"vision");gain(s,"DRI",.35,"tactics");change(s,"coachFavor",hasTalent(s,"training_rat")?5:3);change(s,"form",3);change(s,"fitness",-6);if(hasTalent(s,"training_rat")&&chance(.18)){gain(s,"PAS",.5);log(s,"good","训练模范发动：你留下加练的细节被教练看见。")}}},
  {id:"train_press",style:"target",phases:["academy","firstteam","overseas","campus","pro"],icon:"▰",name:"前场逆抢",desc:"丢球后的三秒最值钱。反复练回追角度、封传球线、把对方后卫逼到边线。",effects:["防守↑↑","身体↑","教练信任↑","体能↓↓"],max:2,run:s=>{gain(s,"DEF",.8,"defend");gain(s,"PHY",.3,"physical");change(s,"coachFavor",2);change(s,"fitness",-14);fatigueInjuryCheck(s,.024)}},
  {id:"love_time",phases:["academy","firstteam","overseas","campus","pro"],icon:"♥",name:"陪小满",desc:"同城就绕远路陪她走一段，异地就隔着屏幕把今天讲给对方听。",effects:["感情↑","状态↑","意志↑","体能↑"],max:1,show:s=>["恋人","暧昧","异地"].includes(s.relationship.status),run:s=>{const away=s.relationship.status==="异地";changeLove(s,hasTalent(s,"childhood_bond")?10:7);change(s,"form",4);change(s,"fitness",4);gain(s,"WIL",.3,"love");if(!away&&chance(.25)){change(s,"coachFavor",-3);log(s,"warn","你迟到了七分钟。周骁没有骂你，只在名单上画了一个圈。")}else if(away)change(s,"coachFavor",-1)}},
  {id:"gift",phases:["firstteam","overseas","pro"],icon:"♡",name:"给小满买礼物",desc:"客场回来带点她念叨过的东西，比一句抱歉管用。",effects:["感情↑↑","状态↑","花钱3万"],max:1,cost:3,show:s=>["恋人","异地","暧昧"].includes(s.relationship.status),run:s=>{addMoney(s,-3);changeLove(s,hasTalent(s,"childhood_bond")?12:9);change(s,"form",4)}},
  {id:"together",phases:["firstteam","overseas","campus","pro"],icon:"❤",name:"和小满独处",desc:"关掉手机，把训练和比赛都留在门外，只有你们两个人。",effects:["状态↑↑","意志↑","体力↓"],max:1,show:s=>s.flags&&s.flags.intimateUnlocked&&["恋人","异地"].includes(s.relationship.status),run:s=>{change(s,"form",12);gain(s,"WIL",.3,"love");change(s,"fitness",-12);changeLove(s,3)}},
  {id:"home",phases:["academy","firstteam","overseas","campus","pro"],icon:"⌂",name:"顾家",desc:"陪父母吃顿饭；手头宽裕就打点钱回去，让父亲少上几天夜班。",effects:["家庭↑","意志↑","状态↑"],max:1,run:s=>{change(s,"family",9);gain(s,"WIL",.28,"will");change(s,"form",4);if(s.debt)s.debt=Math.max(0,s.debt-2)}},
  {id:"recover",phases:["academy","firstteam","overseas","campus","pro"],icon:"✚",name:"恢复",desc:"睡到自然醒，加上冰浴、理疗和睡眠监测——不上集锦，却让身体更耐用。",effects:["体能↑↑","状态↑","伤病恢复"],max:2,run:s=>{change(s,"fitness",22+(hasTalent(s,"quick_healer")?6:0));change(s,"form",3);s.injury.risk=Math.max(0,(s.injury.risk||0)-6);if(s.injury.months>0){s.injury.months=Math.max(0,s.injury.months-(hasTalent(s,"quick_healer")?2:1));if(!s.injury.months){s.injury.name="";unlock("injury_return");log(s,"good","康复评估通过，你重新回到完整训练。")}}}},
  {id:"english",phases:["overseas","pro"],icon:"A",name:"认真学英语",desc:"能听懂战术是一回事，敢在更衣室开口是另一回事。",effects:["语言↑","海外适应↑","意志↑"],max:2,run:s=>{change(s,"language",hasTalent(s,"language_gift")?14:7);gain(s,"WIL",.28,"language");change(s,"form",2)}},
  {id:"street",phases:["academy","campus"],icon:"✦",name:"去踢野球",desc:"没有战术板，只有狭小场地和不服输的对手。",effects:["盘带↑↑","传球↑","受伤/纪律风险"],max:1,run:s=>{gain(s,"DRI",1,"dribble");gain(s,"PAS",.35,"vision");change(s,"coachFavor",-3);change(s,"fitness",-11);fatigueInjuryCheck(s,.032)}},  {id:"campus_match",phases:["campus"],icon:"旗",name:"校队强化赛",desc:"职业通道变窄了，但球场没有消失。",effects:["射门↑","盘带↑","声望↑"],max:2,run:s=>{gain(s,"SHO",.55,"finish");gain(s,"DRI",.45,"dribble");change(s,"fame",5);change(s,"fitness",-12)}},
  {id:"media",phases:["firstteam","overseas","pro"],icon:"●",name:"接受媒体安排",desc:"曝光能涨球迷，但说出去的每句话也会被记着。",effects:["声望↑","金钱↑","专注可能↓"],max:1,run:s=>{change(s,"fame",5);addMoney(s,3+Math.floor(s.fame/20));change(s,"form",chance(.35)?-3:1)}},
  {id:"coach_talk",phases:["firstteam","overseas","pro"],icon:"□",name:"主动找教练谈",desc:"问清楚自己为什么没有首发，以及答案是否可信。",effects:["教练信任↑/↓","出场概率↑","意志↑"],max:1,run:s=>{const ok=chance(.48+s.attrs.WIL/220+(hasTalent(s,"captain")?.1:0));change(s,"coachFavor",ok?8:-3);gain(s,"WIL",.25,"pressure");log(s,ok?"good":"warn",ok?"你带着问题和录像去谈，教练给出了具体要求。":"教练认为你在用谈话绕过训练场上的竞争。")}},
  {id:"national_role",phases:["pro"],icon:"★",name:"适应多位置",desc:"为国家队练习边锋和影锋职责，俱乐部训练会被分走。",effects:["国家队适配↑","传球↑","俱乐部状态↓"],max:1,show:s=>s.national.called,run:s=>{change(s.national,"adapt",9);gain(s,"PAS",.4,"tactics");change(s,"form",-2)}}
];

// 行动组合：同一个月里凑齐指定行动会额外触发一次，每月每种只触发一次。
// all=全部要有，any=至少有一个，cond=额外条件。
const COMBOS=[
  {id:"sci_train",name:"科学训练",any:["train_burst","train_target"],all:["recover"],
   text:"力量课刚下就进了理疗室，冰浴、拉伸、睡眠监测一样没落。肌肉还没来得及把疲劳记住。",
   run:s=>{s.injury.risk=Math.max(0,(s.injury.risk||0)-8);change(s,"fitness",5)}},
  {id:"goal_study",name:"门前研究",all:["train_box","train_play"],
   text:"练完抢点再把录像倒回去看，慢放到第三遍你才发现——问题不在脚下，在启动前那两步。",
   run:s=>{addStyleExp(s,"box",8);addStyleExp(s,"play",8)}},
  {id:"life_balance",name:"生活平衡",any:["train_box","train_burst","train_target","train_play"],all:["love_time"],
   text:"训练和她之间不必二选一。这个月你把两头都顾上了，走进球场的时候心是稳的。",
   run:s=>{change(s,"form",4);changeLove(s,4)}},
  {id:"star_effect",name:"明星效应",all:["media"],cond:s=>s.matches[0]&&s.matches[0].rating>=7.5,
   text:"上一场的高光还挂在热搜上，这次露面的分量翻了一倍。",
   run:s=>{change(s,"fame",5)}}
];
// 流派：天赋是出生特质，流派是后天踢法。两者独立累积，互不排斥。
const STYLES=[
  {key:"box",name:"禁区杀手",icon:"◎",desc:"抬高射门的成长上限",attrs:["SHO"],
   levels:["射门类关键时刻成功率 +5%","解锁比赛选项「抢前点」","落后时的绝杀机会成功率再 +8%，进球评分更高"]},
  {key:"burst",name:"爆点前锋",icon:"»",desc:"抬高速度与盘带的成长上限",attrs:["PAC","DRI"],
   levels:["单刀与逼抢场景成功率 +6%","解锁比赛选项「强行突破」","过人成功后额外 12% 概率直接形成进球"]},
  {key:"target",name:"支点中锋",icon:"▲",desc:"抬高身体与防守的成长上限",attrs:["PHY","DEF"],
   levels:["头球争顶场景出现率提高","解锁比赛选项「背身护球」","支点选项成功后必定为队友创造机会"]},
  {key:"play",name:"组织型前锋",icon:"▣",desc:"抬高传球的成长上限",attrs:["PAS"],
   levels:["助攻转化率 +8%","解锁比赛选项「回撤直塞」","球队整体实力 +2"]}
];
const STYLE_NUMERALS=["Ⅰ","Ⅱ","Ⅲ"];
function styleLevel(exp){return exp>=120?3:exp>=60?2:exp>=20?1:0}
function styleOf(s,key){return styleLevel((s.styles&&s.styles[key])||0)}
function styleNext(exp){return exp>=120?120:exp>=60?120:exp>=20?60:20}
function addStyleExp(s,key,n){
  if(!s.styles)s.styles={box:0,burst:0,target:0,play:0};
  if(!(key in s.styles))return;
  const before=styleLevel(s.styles[key]);
  s.styles[key]=Math.max(0,s.styles[key]+n);
  const after=styleLevel(s.styles[key]);
  if(after>before){const st=STYLES.find(x=>x.key===key);
    log(s,"good",`流派进阶：${st.name} ${STYLE_NUMERALS[after-1]}级——${st.levels[after-1]}。`);
    toast(`${st.name} 升到 ${STYLE_NUMERALS[after-1]} 级`)}
}
function topStyle(s){const st=s.styles||{};const k=Object.keys(st).sort((a,b)=>(st[b]||0)-(st[a]||0))[0];return k&&st[k]>0?k:null}

function checkCombos(s){
  if(!Array.isArray(s.combosHit))s.combosHit=[];
  const has=id=>(s.actionUsage[id]||0)>0;
  COMBOS.forEach(c=>{
    if(s.combosHit.includes(c.id))return;
    if(c.all&&!c.all.every(has))return;
    if(c.any&&!c.any.some(has))return;
    if(c.cond&&!c.cond(s))return;
    s.combosHit.push(c.id);c.run(s);
    log(s,"good",`行动组合「${c.name}」：${c.text}`);
    toast(`行动组合：${c.name}`);
  });
}

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
function gain(s,key,n,tag){
  if(!(key in s.attrs)){console.warn("gain: 未知属性",key);return}
  const d=diffOf(s);let mult=1;
  // 天赋只放大正收益：放在 if(n>0) 之外会让「训练模范」把扣分也加重。
  if(n>0){
    if(hasTalent(s,"explosive_start")&&(key==="PAC"||key==="DRI"))mult+=.25;
    if(hasTalent(s,"engine")&&key==="PHY")mult+=.25;
    if(hasTalent(s,"aerial_king")&&key==="PHY")mult+=.2;
    if(hasTalent(s,"big_heart")&&key==="WIL")mult+=.18;
    if(hasTalent(s,"football_iq")&&(key==="PAS"||tag==="tactics"))mult+=.25;
    if(hasTalent(s,"free_kick")&&key==="PAS")mult+=.3;
    if(hasTalent(s,"box_instinct")&&key==="SHO")mult+=.14;
    if(hasTalent(s,"ambidextrous")&&(key==="SHO"||key==="DRI"))mult+=.12;
    if(tag&&hasTalent(s,"training_rat")&&chance(.08))mult+=.5;
    mult*=d.growth*softFactor(s.attrs[key],d,styleCapLevel(s,key))*trainMult(s)*actionMult;
    if(key==="SHO"&&s.flags&&s.flags.outOfPosition)mult*=.7;
  }
  s.attrs[key]=clamp(s.attrs[key]+n*mult,1,99);
}
/* 流派等级抬高对应属性的成长软上限，每级 +5。WIL 不归任何流派——
   它只从剧情选择、压力事件和小满那里长，练不出来。 */
function styleCapLevel(s,key){
  if(!s||!s.styles)return 0;
  let lv=0;
  for(const st of STYLES)if(st.attrs&&st.attrs.includes(key))lv=Math.max(lv,styleOf(s,st.key));
  return lv;
}
function overall(s){return Math.round(ATTRS.reduce((t,a)=>t+s.attrs[a.key]*a.w,0))}
/* 卡面 OVR 读裸值；教练选人读 effOverall——同一张权重表，但经 eff() 一次，
   于是状态与体能经内核影响首发，而不是再掺一个 form 散项。 */
function effOverall(s){return ATTRS.reduce((t,a)=>t+eff(s,a.key)*a.w,0)}
function ageInfo(s){return{age:14+Math.floor(s.totalMonth/12),month:s.totalMonth%12+1,season:Math.floor(s.totalMonth/12)+1}}
function phaseOf(s){const a=ageInfo(s).age;if(a<16)return"academy";if(a<18)return s.route||"academy";return"pro"}
function currentClub(s){const base=[...CSL_CLUBS,...PL_CLUBS].find(c=>c.name===s.club.name);return base?{...base,...s.club}:{...s.club}}
function log(s,kind,text){s.log.unshift({id:`l${Date.now()}${Math.random()}`,month:s.totalMonth,kind,text});s.log=s.log.slice(0,80)}
function fixtureLabel(s){const a=ageInfo(s);return`${a.age}岁 · 第${a.month}月`}

function createInitialState(name="陈逐风",allocation=START_ALLOC,talents=[],difficulty="standard",heightTier="mid"){
  const attrs={};ATTRS.forEach(x=>attrs[x.key]=clamp(42+(allocation[x.key]||0)*4,1,99));
  const tier=Object.hasOwn(HEIGHT_TIERS,heightTier)?heightTier:"mid";
  Object.entries(HEIGHT_TIERS[tier].adj).forEach(([k,v])=>attrs[k]=clamp(attrs[k]+v,1,99));
  /* HEIGHT_TIERS[].cm 是创建页向玩家承诺的「成年身高」。14 岁得从更矮的地方
     起步，再靠 14→18 每年 2~4cm 的发育长到那个数——所以这里减 10，并把
     heightMax 记在存档里当发育上限，让承诺兑现。 */
  const heightCm=HEIGHT_TIERS[tier].cm-10,heightMax=HEIGHT_TIERS[tier].cm;
  const state={version:VERSION,runId:`r${Date.now()}${Math.random().toString(36).slice(2,7)}`,name:name.trim()||"陈逐风",position:"前锋",totalMonth:0,actionPoints:3,allocation:{...allocation},heightCm,heightTier:tier,heightMax,talents:[...talents],attrs,fitness:90,form:60,coachFavor:50,family:86,language:8,fame:3,money:0,salary:0,debt:0,assets:{house:false,gym:false,coach:false},difficulty:DIFFICULTIES[difficulty]?difficulty:"standard",seasonGoal:null,challenge:null,matchPlan:"box",styles:{box:0,burst:0,target:0,play:0},pendingMatch:null,combosHit:[],retired:false,peakOverall:0,route:"academy",club:{name:"重庆铜梁龙 U16",league:"中超梯队",strength:58},relationship:{name:"林小满",status:"恋人",love:80,conflictShield:hasTalent({talents},"childhood_bond")?1:0},injury:{name:"",months:0,risk:0},risks:{gambling:0},flags:{route16:false,pro18:false,overseasBreakup:false,hivDiagnosed:false,bettingEver:false,captain:false,father_alive:true},statsCareer:{matches:0,starts:0,goals:0,assists:0,wins:0,draws:0,losses:0,nationalCaps:0,nationalGoals:0,bestRating:0,hatTricks:0},seasonStats:{matches:0,goals:0,assists:0,wins:0,ratingTotal:0,trophies:0},national:{called:false,adapt:0,caps:0,goals:0,worldCups:0},honours:[],awards:[],transfers:[],offers:[],matches:[],usedEvents:[],recentEvents:[],actionUsage:{},log:[],tab:"actions",lastSeasonAward:null};
  log(state,"story","你进入重庆铜梁龙U16梯队。父亲站在铁丝网外，小满把一瓶水塞进你包里。");
  return state;
}

function fatigueInjuryCheck(s,base){const p=Math.max(0,(base*actionInjuryMult+(50-s.fitness)/500+(s.injury.risk||0)/800-(hasTalent(s,"iron_man")?.025:0))*diffOf(s).injury*assetInjuryFactor(s));if(chance(p))sufferInjury(s,p>.1?2:1)}
function sufferInjury(s,months=1){const list=["脚踝扭伤","腿后肌拉伤","膝关节轻度损伤","腹股沟拉伤"];s.injury.name=pick(list);s.injury.months=Math.max(s.injury.months,Math.max(1,months-(hasTalent(s,"quick_healer")?1:0)));if(s.injury.months>=3)s.flags.serious_injury=true;change(s,"form",-7);log(s,"bad",`${s.injury.name}，预计伤停${s.injury.months}个月。`);enqueueDecision({title:"你受伤了",body:`<p class="dialogue">${s.injury.name}，预计伤停 ${s.injury.months} 个月。</p><p>伤停期间无法高强度训练和比赛，只能做休息、康复、顾家、陪小满这类行动。</p>`,options:[option("知道了","",()=>{})]},"伤病")}

function addMoney(s,n){s.money=Math.round((s.money||0)+n)}
const ASSETS=[
  {id:"home_gym",cat:"训练",icon:"▰",name:"家庭训练房",cost:60,desc:"力量器械、跑步机和恢复设备，练完还能自己加练。",effect:"训练成长 +8%",train:.08,buy:s=>change(s,"fitness",6)},
  {id:"coach",cat:"训练",icon:"□",name:"私人技术教练",cost:130,desc:"退役名宿一对一盯技术细节，比合练更有针对性。",effect:"训练成长 +10% · 教练信任+",train:.10,buy:s=>change(s,"coachFavor",6)},
  {id:"nutritionist",cat:"训练",icon:"◍",name:"营养师团队",cost:100,desc:"按训练量定制饮食，把身体维持在最佳区间。",effect:"训练成长 +5% · 体能+",train:.05,buy:s=>change(s,"fitness",8)},
  {id:"analyst",cat:"训练",icon:"◇",name:"个人数据分析师",cost:120,desc:"逐场拆解跑位与选择，把球商变成看得见的数字。",effect:"训练成长 +6% · 视野+",train:.06,buy:s=>gain(s,"PAS",2,"vision")},
  {id:"rehab",cat:"训练",icon:"✚",name:"私人康复团队",cost:200,desc:"理疗、冰浴和睡眠监测全包，把伤病挡在门外。",effect:"伤病概率大幅下降",injuryCut:.55,minAge:19,buy:s=>{change(s,"fitness",10);s.injury.risk=Math.max(0,(s.injury.risk||0)-15)}},
  {id:"science",cat:"训练",icon:"⚛",name:"运动科学中心",cost:450,desc:"顶级团队只围着你一个人转，延长巅峰、压低伤病。",effect:"训练成长 +12% · 伤病再降",train:.12,injuryCut:.75,minAge:22,req:s=>ownedAsset(s,"rehab"),reqText:"需先有私人康复团队",buy:s=>{}},
  {id:"parents_rent",cat:"家庭",icon:"⌂",name:"给父母租套好房",cost:45,desc:"先让爸妈从老破小里搬出来。",effect:"家庭+ · 状态+4",buy:s=>{change(s,"family",12);change(s,"form",4)}},
  {id:"parents_house",cat:"家庭",icon:"⏠",name:"给父母买房",cost:300,desc:"让父亲彻底告别夜班，母亲有个像样的家。",effect:"家庭大幅提升 · 状态+7",req:s=>ownedAsset(s,"parents_rent"),reqText:"需先给父母租房",buy:s=>{change(s,"family",22);change(s,"form",7)}},
  {id:"parents_villa",cat:"家庭",icon:"⏦",name:"给父母买大宅",cost:800,desc:"把你能给的最好生活，摆到爸妈面前。",effect:"家庭拉满 · 声望+ · 状态+6",req:s=>ownedAsset(s,"parents_house"),reqText:"需先给父母买房",buy:s=>{change(s,"family",30);change(s,"fame",6);change(s,"form",6)}},
  {id:"car",cat:"生活",icon:"⛟",name:"买一辆车",cost:150,desc:"再也不用挤队里的大巴回家。",effect:"声望+ · 状态+4",buy:s=>{change(s,"fame",5);change(s,"form",4)}},
  {id:"apartment",cat:"生活",icon:"❒",name:"自己的公寓",cost:400,desc:"训练基地之外，终于有个真正属于你的地方。",effect:"状态+6 · 净资产+",buy:s=>change(s,"form",6)},
  {id:"luxury_car",cat:"生活",icon:"◈",name:"梦想中的豪车",cost:600,desc:"停在训练场门口，就是一条街的焦点。",effect:"声望++",req:s=>ownedAsset(s,"car"),reqText:"需先买一辆车",minFame:45,buy:s=>change(s,"fame",12)},
  {id:"mansion",cat:"生活",icon:"⏢",name:"城郊豪宅",cost:1600,desc:"泳池、球场、影音室，你为自己造了一座城堡。",effect:"声望+++ · 状态+7",req:s=>ownedAsset(s,"apartment"),reqText:"需先有自己的公寓",minFame:60,buy:s=>{change(s,"fame",18);change(s,"form",7)}},
  {id:"image_team",cat:"生活",icon:"◐",name:"形象与公关团队",cost:220,desc:"专人替你经营公众形象，把该说的话说到位。",effect:"每月声望增长 · 声望+14",minFame:40,buy:s=>{change(s,"fame",14)}},
  {id:"restaurant",cat:"投资",icon:"◔",name:"投资一家餐厅",cost:250,desc:"给退役后的生活留一条稳定的进账。",effect:"每月被动收入 +6万",passive:6,buy:s=>{}},
  {id:"brand",cat:"投资",icon:"◉",name:"创立个人品牌",cost:650,desc:"把名气变成能持续赚钱的生意。",effect:"每月被动收入 +12万 · 声望+",passive:12,minFame:60,buy:s=>change(s,"fame",8)},
  {id:"academy",cat:"投资",icon:"♟",name:"创办青训学校",cost:1200,desc:"把你走过的路，留给下一批孩子。",effect:"每月被动收入 +20万 · 声望+",passive:20,minAge:24,minFame:55,buy:s=>change(s,"fame",12)},
  {id:"ring",cat:"感情",icon:"◇",name:"给小满买戒指",cost:80,desc:"你想好了，这一次不再让她一个人等。",effect:"感情+ · 状态+6 · 解锁婚礼",minAge:20,req:s=>["恋人","异地"].includes(s.relationship.status)&&s.relationship.love>=85,reqText:"需恋爱中且好感≥85",buy:s=>{changeLove(s,8);change(s,"form",6);s.flags.engaged=true}},
  {id:"wedding",cat:"感情",icon:"♥",name:"和小满办婚礼",cost:350,desc:"父亲把你交到她手里，只说了句“照顾好她”。",effect:"感情拉满 · 家庭+ · 状态+11 · 成就",req:s=>s.flags&&s.flags.engaged&&s.relationship.love>=85,reqText:"需先求婚",buy:s=>{changeLove(s,12);change(s,"family",15);change(s,"form",11);s.flags.married=true;unlock("married")}}
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
  {id:"academy_ankle",once:true,phase:["academy"],title:"队医说“可以上”，你的脚踝说不行",body:"<p>队医捏着你脚踝按了两下，问了三个问题：疼不疼、能不能发力、能不能变向。你回了三个“能”。他点点头，在报告上写“可参赛”。</p><p>周骁在你旁边系鞋带，头没抬：<span class='dialogue'>“首发名单只等你一句话。”</span></p><p>你站起来走了两步，左脚落地那一下，脚踝里有一根筋像被拨了一下，不尖锐，但你知道它在。</p><p>小满发来一条消息：<span class='dialogue'>“膝盖以下的部分还连着吗？”</span>你没回。你把护踝拉紧了两格，走进通道。</p>",portrait:"assets/coach-zhou.webp",options:s=>[
    option("咬牙首发","声望+8；可能抓住机会，也可能伤停2—4个月",()=>{change(s,"fame",8);change(s,"coachFavor",4);if(chance(hasTalent(s,"iron_man")?.28:.48))sufferInjury(s,rand(2,4));else{change(s,"form",6);log(s,"good","你撑过了比赛，但这不是一个可以反复使用的答案。")}},"danger"),
    option("主动退出名单","体能+12；教练信任-5，意志+1",()=>{change(s,"fitness",12);change(s,"coachFavor",-5);gain(s,"WIL",1,"will")})]},
  {id:"xiaoman_exam",once:true,phase:["academy"],title:"她的考试，和你的选拔赛在同一天",body:"<p>小满把准考证放在你桌上，什么也没说。你拿起来看了一眼——考试时间下午两点，你的选拔赛两点半开球。</p><p>她已经在门口穿鞋了，背对着你说：<span class='dialogue'>“不用送，我坐公交。”</span></p><p>你捏着那张纸，纸张边缘被她的手指攥出了细小的折痕。你想起初中那次你发烧，她在校医室陪了你一下午，自己错过了模考。</p><p>她直起腰，拉开门，回头看了你一眼。那一眼很短，没有期待，没有暗示，只是确认你还在。然后她笑了一下：<span class='dialogue'>“赢了再跟我说。”</span></p><p>门关上了。你低头看那张准考证，才发现背面用铅笔写了一行很小的字：<span class='dialogue'>“别迟到就好——你的比赛。”</span></p>",portrait:"assets/lin-xiaoman.webp",options:s=>[
    option("送她去考场再赶比赛","感情+10；体能-10，比赛状态存在波动",()=>{changeLove(s,10);change(s,"fitness",-10);change(s,"form",chance(.5)?3:-4);log(s,"story","你在考场门口转身跑向公交站时，听见她在背后喊了一句“跑慢点！”你回头，她已经进去了，隔着玻璃朝你摆手。")}),
    option("提前去球场热身","声望+9，状态+5；感情-10",()=>{change(s,"fame",9);change(s,"form",5);changeLove(s,-10);log(s,"story","比赛前你收到一条短信，只有两个字：“写完了。”你没回，把手机锁进柜子。")})]},
  {id:"father_boots",once:true,phase:["academy"],title:"父亲买了一双你不敢穿坏的球鞋",body:"<p>鞋盒放在你床上，不是快递包装，是店里的手提袋。你打开，一双顶级款刺客——你上周在店里隔着玻璃看过的那双。你拎起来试了一下，刚好合脚。鞋仓里还垫着旧报纸，你爸的习惯。</p><p>你走出房间，他坐在客厅里修遥控器，头没抬：<span class='dialogue'>“旧鞋我扔了。底都磨穿了，穿着容易受伤。”</span></p><p>你没有拆穿——那双旧鞋你上周自己藏起来了，根本没给他看见过。他一定是翻了你柜子。</p><p>你把新鞋放回鞋盒，又把旧鞋从柜子里翻出来：大底已经开胶，鞋头那块皮磨得发白，是你练颠球磨出来的。你没有穿新鞋，但你把鞋盒放在床头，放了很久。</p>",portrait:"assets/father.webp",options:s=>[
    option("收下新鞋，把旧鞋留作纪念","速度+1，家庭+5；父亲继续加班",()=>{gain(s,"PAC",1,"burst");change(s,"family",5);s.risks.familyFatigue=(s.risks.familyFatigue||0)+7}),
    option("退掉鞋，换成普通款","家庭+8，意志+1；本月训练状态-3",()=>{change(s,"family",8);gain(s,"WIL",1,"will");change(s,"form",-3)})]},
  {id:"teammate_blame",phase:["academy","firstteam","overseas"],title:"队友把丢球算在你头上",body:"<p>训练赛最后三十秒，你在前场被断，对方打了一个反击，1比0。</p><p>更衣室里没人说话。水声，鞋钉敲地板的声音。直到有人——不是最大声的那个，但也不是最小声的——从柜子那头丢过来一句：<span class='dialogue'>“有些人，集锦够用了，比赛够呛。”</span></p><p>所有人都听见了。有人低头看手机，有人假装在解鞋带。你站在柜子前面，背对着所有人，能感觉到背后的视线。你在等他再说一句。</p><p>他没有说。他等你说。</p>",portrait:"assets/coach-zhou.webp",options:s=>[
    option("当场顶回去","意志+1，队内地位可能上升；教练信任波动",()=>{gain(s,"WIL",1,"pressure");change(s,"coachFavor",chance(.5)?5:-5);log(s,"story","你转过身。没等你开口，队长先站起来挡在你面前：“丢球是全队的事，有话说清楚。”更衣室安静了三秒，有人把柜门关上了。")}),
    option("承认丢球，要求一起复盘","传球+1，教练信任+5；状态-3",()=>{gain(s,"PAS",1,"vision");change(s,"coachFavor",5);change(s,"form",-3);log(s,"story","你说：“那个球是我的。但我想全队一起看录像，那个反击是怎么打穿中场的。”靠窗的队友把手机放下了。")})]},
  {id:"mystery_supplement",phase:["academy","firstteam","overseas","pro"],title:"一瓶“绝对查不出来”的补剂",body:"<p>训练结束后，一个平时不怎么跟你说话的人从包里拿出一瓶东西，放在你凳子上。没有完整中文标签，瓶身是哑光白，上面只有一行英文，没写成分。</p><p>他说：<span class='dialogue'>“体能师配的，恢复快，绝对查不出来。”</span>你问他多少钱。他说不用钱，<span class='dialogue'>“你先试，有用再说。”</span></p><p>他走之后你拿起那瓶东西晃了一下，液体，没有味道。瓶口封膜完好，但封膜下面的压印不太平整。</p><p>队医办公室的门还亮着。走廊里没有人。你把这瓶东西放进了柜子，没有扔，也没有用。</p>",options:s=>[
    option("拒绝并报告队医","教练信任+4，队友关系受损；伤病风险-8",()=>{change(s,"coachFavor",4);s.injury.risk=clamp((s.injury.risk||0)-8);log(s,"good","队医把补剂封存了。你没走捷径，也没把前途交到一个陌生人手里。")}),
    option("只拿去检测，不供出队友","花费4万；意志+1，教练无变化",()=>{addMoney(s,-4);gain(s,"WIL",1,"will");s.injury.risk=clamp((s.injury.risk||0)-4)})]},
  {id:"viral_clip",once:true,phase:["academy","campus"],title:"十秒过人视频突然有了二十万播放",body:"<p>你是在训练结束后刷到的。不知道谁拍的，镜头晃了一下，只截了你穿裆过人和远射入网那十秒，前面三次丢球全部剪掉了。</p><p>评论区有人说“国足有救了”，有人说“集锦型球员”，有人在吵你的动作像谁。经纪人私信进来了，措辞很专业：<span class='dialogue'>“你好，我是某经纪公司，是否有意向聊一下职业规划？”</span></p><p>周骁也发来一条消息，没有链接，只有一句话：<span class='dialogue'>“谁允许训练的时候拍的？”</span></p><p>你放下手机。那十秒还在自动循环播放。你盯着屏幕上那个过人的自己，觉得有点陌生——那个动作你做出来的时候根本没想那么多。</p>",options:s=>[
    option("顺势经营个人账号","声望+10；话题会跟着你",()=>{change(s,"fame",10)}),
    option("删除视频并向球队说明","教练信任+8；错过曝光，意志+1",()=>{change(s,"coachFavor",8);gain(s,"WIL",1,"pressure")})]},
  {id:"growth_pain",once:true,phase:["academy"],title:"一个夏天，你突然长高了六厘米",body:"<p>你撞到了门框。不是开玩笑那种撞，是真的没估好高度，额头磕在上沿，整个人往后倒了一步。</p><p>队医量完身高，在表上改了数字。新的体重跟不上新的身高——你在禁区里接一个半高球，身体已经做出了转身的动作，脚却还在原地。</p><p>教练在笔记上写了两行，训练结束后把你叫到一边：<span class='dialogue'>“两条路。要么去禁区里待着，背身拿球，靠身高吃饭；要么花三个月重新建立协调性，但这段时候你可能连替补席都坐不上。”</span></p><p>你站在门口，出门的时候又低了低头。</p>",portrait:"assets/coach-zhou.webp",options:s=>[
    option("改造成支点中锋","身体+2，射门+1；速度-1",()=>{s.heightMax=(s.heightMax||200)+6;s.heightCm=Math.min(s.heightMax,s.heightCm+6);gain(s,"PHY",2,"height");gain(s,"SHO",1,"finish");s.attrs.PAC=clamp(s.attrs.PAC-1,1,99)}),
    option("花时间重建协调性","盘带+2，速度+1；未来2个月教练信任-4",()=>{s.heightMax=(s.heightMax||200)+6;s.heightCm=Math.min(s.heightMax,s.heightCm+6);gain(s,"DRI",2,"dribble");gain(s,"PAC",1,"burst");change(s,"coachFavor",-4)})]},
  {id:"rain_final",once:true,phase:["academy"],title:"暴雨里的决赛，父亲却没有出现",body:"<p>开球前你在球员通道里往外看了一眼。雨很大，看台上的人稀稀拉拉，都缩在雨衣里。你一个位置一个位置扫过去——中间区域，第四排，他通常坐的那个位置。空的。</p><p>上半场你踢得很急，两次越位。中场休息你拿起手机，没有消息。</p><p>终场哨响，2比1，你助攻了一个。你站在雨里没有动，水从头发上往下流。小满从看台上跑下来，隔着铁丝网，伞也顾不上打，衣服湿透了。她喘着气：<span class='dialogue'>“你爸来之前接到电话，厂里机器出问题了，他折回去了。他让我跟你说——”</span></p><p>雨很大，她的声音几乎被盖过去：<span class='dialogue'>“他说他看了直播。你那个助攻，他看到了。”</span></p><p>你站在原地，雨水顺着下巴往下滴。你没说好，也没说不好。铁丝网那边，小满站在那里陪你淋着。</p>",portrait:"assets/lin-xiaoman.webp",options:s=>[
    option("给父亲打电话，说你赢了","家庭+10，意志+1；不追问缺席",()=>{change(s,"family",10);gain(s,"WIL",1,"will")}),
    option("把失望说出来","家庭-6；长期压力下降，状态+4",()=>{change(s,"family",-6);change(s,"form",4);s.risks.familyFatigue=Math.max(0,(s.risks.familyFatigue||0)-6)})]},
  {id:"firstteam_veteran",once:true,phase:["firstteam","pro"],title:"老队员要你训练后留下来捡球",body:"<p>训练刚结束，一瓶水从长凳那头滚到你脚下。<span class='dialogue'>“新人都这样。球收好，圈收好，垃圾带出去。”</span></p><p>说话的人已经换好拖鞋了。他比你大六岁，一线队出场次数比你多两位数。他不是在跟你商量。</p><p>你蹲下来，把那瓶水捡起来放在凳子上。更衣室里有人在笑，不是恶意，更像是一种——“看你怎么选”的等待。</p>",options:s=>[
    option("先做一个月，再靠表现说话","教练信任+6，体能-8；意志-1",()=>{change(s,"coachFavor",6);change(s,"fitness",-8);s.attrs.WIL=clamp(s.attrs.WIL-1,1,99);log(s,"story","你收了球。一个月后你在一线队训练里给他送了一脚直塞，他进了，回头看了你一眼，什么也没说。")}),
    option("拒绝，把时间用来加练","意志+1，射门+1；短期首发概率下降",()=>{gain(s,"WIL",1,"pressure");gain(s,"SHO",1,"finish");change(s,"coachFavor",-5);log(s,"story","你去加练了。第二天你到训练场时，发现球已经被人收好了。你没有去问是谁。")})]},
  {id:"bench_promise",phase:["firstteam","overseas","pro"],title:"教练说“下场一定给你机会”",body:"<p>这句话你听到第三遍了。第一次是主场大胜之后，他说“下场轮换”；第二次是杯赛之前，他说“这场让你踢”。结果两次你都在替补席坐满90分钟，第二次甚至连热身都没叫到你。</p><p>这次他是主动找你的：<span class='dialogue'>“我知道你在等。我也在等一个让你上的时机。”</span>你看着他，点了头。</p><p>走出门的时候你收到一条消息——隔壁俱乐部的助教通过熟人递话：<span class='dialogue'>“如果你公开表达想走，我们这边推动租借。”</span></p><p>你锁掉手机。训练场上的灯还亮着。</p>",portrait:"assets/coach-zhou.webp",options:s=>[
    option("继续沉默训练","教练信任+7，意志+1；声望不变",()=>{change(s,"coachFavor",7);gain(s,"WIL",1,"pressure")}),
    option("通过媒体释放离队意愿","声望-1，转会报价概率上升",()=>{change(s,"fame",-1);s.flags.wantsMove=true})]},
  {id:"parents_hospital",once:true,maxMoney:60,phase:["firstteam","overseas","pro"],minAge:16,title:"父亲的住院押金",body:"<p>缴费单上的数字你看了两遍。你现在的工资够一部分，但缺口不小。队医说你爸需要长期治疗，不是一次性的。</p><p>电话响了，一个没有保存的号码。对面自称是朋友的朋友，知道你家里情况，说可以借20万，不打欠条，不催还。条件很简单——下一场比赛，你的射正数不要超过一次。<span class='dialogue'>“不影响胜负，没人会知道。”</span></p><p>你挂掉电话，站在医院走廊里。ICU的门关着，你爸在里面。护士说你可以在外面等，也可以先回去训练。</p><p>你坐在塑料椅上。走廊很长，灯管有一根在闪。你知道这笔钱是什么性质，也知道——不接它，你爸的治疗可能拖不到你发下个赛季的工资。</p><p>走廊尽头，电梯门开了一下，又关上。</p>",portrait:"assets/father.webp",options:s=>[
    option("拒绝，向俱乐部申请预支","家庭+8，俱乐部信任-5；欠下12万",()=>{change(s,"family",8);change(s,"coachFavor",-5);addMoney(s,-12);s.debt=(s.debt||0)+12;log(s,"story","财务说需要审核，下周五才给答复。你在走廊坐了很久，最后站起来，去缴费窗口先付了一部分。")}),
    option("联系公益与队友筹款","声望-7，家庭+6；隐私被公开",()=>{change(s,"fame",-7);change(s,"family",6);log(s,"story","周骁第一个转了账，附言写的是“不用还，以后请我吃饭就行”。你盯着那行字看了很久。")}),
    option("接受那笔“借款”","立刻+20万；涉赌暗雷大幅上升，可能毁掉生涯",()=>{addMoney(s,20);s.flags.bettingEver=true;change(s.risks,"gambling",38);log(s,"bad","你收下了这笔见不得光的钱。眼下风平浪静，但你心里清楚它迟早要还。");log(s,"story","回到病房时你爸醒了，他看着你，没问钱的事，只说了一句：“你眼睛怎么红了。”你说外面风大。")},"danger")],weight:1.25},
  {id:"language_wall",once:true,phase:["overseas"],title:"你听错了教练的最后一句话",body:"<p>最后十分钟，教练朝你喊了一句话。你听见了“wide”和“hold”，理解为拉边保护领先。你拉边了。球从你这一侧被断，反击，扳平。</p><p>更衣室里没有人用中文。没有人骂你，但也没有人替你说话。队长——不是跟你一个国家的——走过来拍了拍你的肩膀，什么也没说，然后走了。</p><p>你坐在柜子前面，翻译发来一条消息：<span class='dialogue'>“他让你压进禁区，不是拉边。”</span>你盯着那条消息看了很久。你听懂了每一个词，但你听错了意思。</p><p>更衣室里的人在聊别的事了。你坐在那里，系好鞋带又解开，反复了两次。</p>",options:s=>[
    option("公开承担责任，增加英语课","语言+18，教练信任-2；意志+1",()=>{change(s,"language",hasTalent(s,"language_gift")?30:18);change(s,"coachFavor",-2);gain(s,"WIL",1,"pressure")}),
    option("让翻译解释是指令不清","教练信任-10，状态+4",()=>{change(s,"coachFavor",-10);change(s,"form",4)})]},
  {id:"lonely_christmas",once:true,notMarried:true,phase:["overseas"],title:"圣诞夜，视频那头没有人说话",body:"<p>你这边下午三点，圣诞夜刚过了一半。她那边凌晨一点，窗外还在下雪。</p><p>视频接通的时候她没露脸，屏幕上是宿舍的天花板，灯关着，只有手机屏幕的光映出一小片轮廓。她的声音闷在枕头里：<span class='dialogue'>“没事，我就是……把手机开着，你要说话的话我听得见。”</span></p><p>你问她今天怎么过的。她说去了一趟超市，买了半只烤鸡，自己煮了一碗面，<span class='dialogue'>“跟平时差不多”</span>。</p><p>你沉默了一会儿，说：<span class='dialogue'>“我这边的圣诞树已经摆出来了。”</span>她轻轻笑了一声，像是怕吵醒室友：<span class='dialogue'>“那你替我看一眼。”</span></p><p>你从窗边往外看，街上有人戴着圣诞帽在跑。你想跟她说这些，但觉得说出来都太轻了。最后你只说：<span class='dialogue'>“挺好的。”</span></p><p>她没有回话。过了很久你才听见她均匀的呼吸声——她举着手机睡着了。你盯着屏幕上那一片黑暗，没有挂断。</p>",portrait:"assets/lin-xiaoman.webp",condition:s=>s.relationship.status==="异地",options:s=>[
    option("承认自己很想家","感情+12，意志+1；第二天训练状态-4",()=>{changeLove(s,12);gain(s,"WIL",1,"love");change(s,"form",-4)}),
    option("说一切都很好","维持专注，状态+5；感情-12",()=>{change(s,"form",5);changeLove(s,-12)})]},
  {id:"overseas_party",once:true,phase:["overseas"],minAge:17,title:"队友说，放松也是职业的一部分",body:"<p>周六晚上，没有比赛。更衣室里换好衣服，有人拍了拍你的肩膀：<span class='dialogue'>“一起走，所有人都去。”</span>所有人。你去还是不去，都在被观察。</p><p>你站在衣柜前，手机日历上写着明天的恢复计划——冰浴、拉伸、轻量激活。队医用荧光笔画了三条线。</p><p>队友已经在门口等了，回头看了你一眼，笑了一下：<span class='dialogue'>“不来也没事。但来比较好——你知道的。”</span></p><p>他说“你知道的”的时候，语气很轻，像是在教你一个没有人写在纸上的规则。</p>",options:s=>[
    option("去，但设好离场时间","状态+5；体能-8，夜生活累积隐患",()=>{change(s,"form",5);change(s,"fitness",-8);s.clubNights=(s.clubNights||0)+1;log(s,"story","你坐了一个小时，喝了两杯汽水。离场时有人喊“这么早？”你摆摆手说明天有恢复计划。有人笑了一声，但笑里没有恶意。")}),
    option("拒绝，独自留在基地","体能+10；状态-4，意志+1",()=>{change(s,"fitness",10);change(s,"form",-4);gain(s,"WIL",1,"pressure");log(s,"story","你回到房间，洗完澡，坐床上刷了会儿手机。零点时你听到楼下有车回来，有人在笑，有人用你的母语喊了句什么，没听清。")})]},
  {id:"agent_contract",once:true,phase:["firstteam","overseas","pro"],minAge:17,portrait:"assets/brother-wang-v1.webp",title:"经纪人把“保证首发”写进了口头承诺",body:"<p>会面约在一家安静得连水声都听得见的咖啡馆。你的经纪人王哥把合同推过来，封面很干净，里面密密麻麻的条款。</p><p>他说可以给你更高的工资，可以帮你运作转会，可以让你进国字号名单：<span class='dialogue'>“我跟你们教练很熟，他说了你就是未来核心。”</span>你说的每一句话他都点头。你说你要保证出场时间，他说<span class='dialogue'>“当然，这是我谈的前提。”</span></p><p>你翻到签字页。八年。肖像权、转会决定权、商业开发权全部打包。你问“保证首发”能不能写进合同。他笑了一下，很短，但很职业：<span class='dialogue'>“兄弟，这个写了也没用，教练换了你找谁去？”</span></p><p>他说的是实话。他的笑容也是实话。</p>",options:s=>[
    option("签长约，换取眼前资源","声望+9，报价+1；未来转会抽成高",()=>{change(s,"fame",9);s.agent={type:"aggressive",cut:18};generateOffers(s,1);log(s,"story","你签字的时候，他接了个电话，对着那头说“搞定了”。你低头看着自己的签名，墨迹还没干。")}),
    option("请独立律师，只签两年","花费6万，意志+1；资源增长较慢",()=>{addMoney(s,-6);gain(s,"WIL",1,"pressure");s.agent={type:"careful",cut:8};log(s,"story","他听完你的决定，笑容没消失，但嘴角的角度变了：“行，那先做两年看看。到时候你身价翻倍了，可别忘了老哥。”")})]},
  {id:"xiaoman_private",once:true,notMarried:true,phase:["firstteam","pro"],minAge:17,title:"球迷拍到了你和小满",body:"<p>照片是在商场门口拍的。你戴着口罩，她扎着马尾，你们之间隔了半个身位，她正偏头跟你说话。</p><p>评论不到两小时就破了五百。有人在扒她的学校、专业，有人说<span class='dialogue'>“穿成这样怎么配得上”</span>，有人贴了她在食堂吃饭的照片——不知道什么时候拍的。俱乐部打来电话，建议你<span class='dialogue'>“暂时不要公开回应”</span>，让热度自己降下去。</p><p>你翻到小满的对话框。她已经知道了，发来一条：<span class='dialogue'>“我没事，你别看评论。”</span></p><p>你打电话过去，她接得很快。第一句话是：<span class='dialogue'>“那些话我不在乎。”</span>顿了一下，又说：<span class='dialogue'>“但我在乎你会不会因为我在乎而乱做决定。”</span></p><p>你没有回答。她等了一会儿，轻声说：<span class='dialogue'>“你自己选。选完别后悔就行。”</span></p>",portrait:"assets/lin-xiaoman.webp",condition:s=>["恋人","异地"].includes(s.relationship.status),options:s=>[
    option("承认恋情，要求停止打扰她","感情+15，声望波动；商业机会-1",()=>{changeLove(s,15);change(s,"fame",chance(.55)?5:-6);s.flags.publicLove=true;log(s,"story","你发完声明三分钟后，她发来一条语音，声音有点哑：“你傻不傻。”然后是很长的沉默，“傻完了记得回来。”")}),
    option("按俱乐部口径否认","声望+3；感情-20，可能留下裂缝",()=>{change(s,"fame",3);changeLove(s,-20);s.relationship.denied=true;log(s,"story","你打完电话之后，她的头像暗了很久。晚上你收到一条消息：“我理解。”后面没有别的了。")})]},
  {id:"girlfriend_offer",once:true,notMarried:true,phase:["firstteam","campus","pro"],minAge:18,title:"小满拿到了外地研究生名额",body:"<p>她把录取通知书放在桌子中间，正面朝你。你看了一眼那个城市——高铁四个半小时，航班一小时四十分钟，不算远，也不算近。</p><p>她没有看你，手指搁在杯子边上，来回摩挲杯沿：<span class='dialogue'>“我不是在考验你，也不是要你留我。我只是想告诉你。”</span></p><p>你问她想去吗。她终于抬起头，目光直直地看着你：<span class='dialogue'>“我想去。那个研究方向，全国只有这个组在做。”</span>她说这句话的时候眼睛是亮的。</p><p>她没有说“你怎么办”，没有说“我们怎么办”。她只是告诉你，她想往前走一步。你沉默了很久，她也没有催，只是把杯子端起来喝了一口，等你说完该说的话。</p>",portrait:"assets/lin-xiaoman.webp",condition:s=>s.relationship.status==="恋人",options:s=>[
    option("支持她去，开始异地","感情+8，状态-4；关系转为异地",()=>{changeLove(s,8);change(s,"form",-4);s.relationship.status="异地";log(s,"story","她听完你的话，低下头，过了很久才说：“那我买票了。”声音很平静，但你注意到她握着杯子的手指稍微用了点力。")}),
    option("希望她留下","当前感情+4；长期冲突+18",()=>{changeLove(s,4);s.relationship.conflict=(s.relationship.conflict||0)+18;log(s,"story","你话还没说完她就摇了摇头，表情没有愤怒，只有一点失望：“那你能把刚才那句话再说一遍吗？看着我说。”你说不出口了。")})]},
  {id:"match_fixing",once:true,maxMoney:60,phase:["pro"],minAge:18,title:"他们只要一个无关胜负的角球",body:"<p>消息是通过一个你不太熟的号码发来的。对方知道你父亲在哪家医院、住哪一床、欠了多少。</p><p>他说比赛结果不变，只需要你在上半场把球碰出底线一次。一个角球。不影响胜负，没有人会注意。他发了一个数字，够你付清剩下的押金，后面跟了一句：<span class='dialogue'>“决定权在你。”</span></p><p>你放下手机。病房里你爸在睡觉，心电图的声音平稳地一跳一跳。你握了握拳头，指甲掐进掌心里。</p><p>然后你给那个号码回了一条消息。你回的是什么，只有你自己知道。</p>",options:s=>[
    option("保存证据并报告俱乐部","短期被调查和雪藏；职业风险大幅下降",()=>{change(s,"coachFavor",-8);change(s,"form",-8);change(s.risks,"gambling",-30);s.flags.reportedFixing=true;log(s,"story","你把截图发给了合规部门。之后三天没有任何回复。第四天，那个号码发来一个大拇指的表情——然后再也没有出现过。")}),
    option("删除消息，什么也不说","本月没有损失；暗雷仍可能回来",()=>{change(s.risks,"gambling",6);log(s,"story","你删掉之后去洗了把脸。镜子里的你跟平时一样。你对着镜子站了一会儿，然后回病房了。")}),
    option("按他说的做","获得35万；涉赌风险+45，成就与国家队可能永久失去",()=>{addMoney(s,35);s.flags.bettingEver=true;change(s.risks,"gambling",45);log(s,"story","上半场第三十分钟，对方一次没威胁的传中，你伸脚蹭了一下，球出了底线。角球。没人注意到你是故意的。半场结束你走进通道，手心全是汗。")},"danger")]},
  {id:"health_test",once:true,phase:["pro"],minAge:18,title:"一次健康筛查的结果需要复核",body:"<p>队医把你叫到办公室，门关上了。他说话很慢，每一个字都像提前打过草稿——初筛有一项指标需要复核，不一定严重，但需要你去正规医疗机构做一次完整检查。</p><p>他把转诊单推过来，指了指地址：<span class='dialogue'>“这家医院，我帮您约好了时间。”</span>你问如果复查结果不好会怎样。他说：<span class='dialogue'>“先查，查完再说。不管结果是什么，隐私受法律保护，治疗和继续工作都有规范路径可循。”</span></p><p>你把转诊单叠好放进口袋。站起来时他补了一句：<span class='dialogue'>“高强度训练先缓一缓，等结果出来再调整计划。”</span></p><p>你走出门，走廊尽头的队友在喊你热身。你摸了摸口袋里那张纸，然后迈开步子跑过去——但你的速度比平时慢了一点，只有你自己知道。</p>",condition:s=>(s.clubNights||0)>=4&&!s.flags.healthTested,options:s=>[
    option("立即复核并暂停高强度训练","体能-8；伤病风险-18，获得正规支持",()=>{s.flags.healthTested=true;change(s,"fitness",-8);if(chance(.16)){s.flags.hivDiagnosed=true;s.healthCare=80;log(s,"story","复核确诊HIV。医生说明：规范抗病毒治疗可长期控制病毒，确诊不是职业与人生的终点。") }else{s.injury.risk=clamp((s.injury.risk||0)-18);log(s,"good","复核结果排除了感染。你接受了更完整的性健康咨询。")}}),
    option("推迟一个月，先保住首发","状态+5；伤病风险+12，声望-3",()=>{change(s,"form",5);s.injury.risk=clamp((s.injury.risk||0)+12);change(s,"fame",-3)},"danger")]},
  {id:"hiv_treatment",once:true,phase:["pro"],minAge:18,title:"治疗不会替你踢球，但能让你继续生活",body:"<p>医生的语气很平，像是在念一份操作手册：<span class='dialogue'>“目前HIV感染已经有规范的治疗方案，只要坚持服药、定期复查，病毒可以被长期抑制。不影响正常生活，不影响工作。”</span></p><p>他把处方笺推过来：<span class='dialogue'>“保密是医疗常规。你的病史只会留在本院的系统里，不会有第二个人知道。”</span>你低头看那张处方笺，上面的药名你从来没有听说过。</p><p>你问了一句：<span class='dialogue'>“如果我间断服药呢？”</span>医生的表情第一次有了变化，很轻，像是失望也像是遗憾：<span class='dialogue'>“耐药之后，治疗选择会越来越少。”</span></p><p>你收好处方笺，站起来之前又坐了回去。诊室的白炽灯很亮，外面走廊里有人在打电话，笑着说明天去哪里吃饭。你坐了很久，医生没有催你。</p>",condition:s=>s.flags.hivDiagnosed&&(s.healthCare||0)<100,options:s=>{const rich=(s.money||0)>=500,arr=[];if(rich)arr.push(option("按医嘱规范治疗（花500万）","病毒长期抑制，身体不再被拖累；意志+2",()=>{addMoney(s,-500);s.healthCare=100;s.flags.hivIntermittent=false;gain(s,"WIL",2,"will");log(s,"good","你负担起了规范治疗。按医嘱服药、定期复查，训练照常。")}));arr.push(option(rich?"省下这笔钱，间断治疗":"负担不起500万，只能间断治疗","每月体能-30、伤病风险上升，直到你能规范治疗",()=>{s.flags.hivIntermittent=true;log(s,"bad","药断断续续地吃。身体一天天被拖垮，你只能盼着哪天付得起规范治疗。")},"danger"));return arr}},
  {id:"national_wrong_position",phase:["pro"],minAge:18,title:"国家队要你踢不熟悉的右边翼卫",body:"<p>教练在战术板上点了一下右路的位置：<span class='dialogue'>“你速度快，能解决边路问题。回去看录像，明天合练就按这个打。”</span></p><p>你没有马上回答。你练了十年的位置是前锋，突前、策应、抢点——所有比赛习惯都建立在这个位置上。右边翼卫要回防、要套边、要在攻守转换里不停折返。助理教练在旁边补了一句：<span class='dialogue'>“国家队需要你在这个位置上做出贡献。”</span></p><p>走出战术室，你收到俱乐部教练的消息：<span class='dialogue'>“听说他们要你踢边翼卫？你的训练计划需要调整吗？”</span></p><p>你站在走廊里。一边是国家队的窗口——拒绝了可能再也没有下一次；一边是你花了十年打磨的身体记忆。你把手机锁屏，走廊尽头有人喊你去看录像。</p>",condition:s=>s.national.called,options:s=>[
    option("接受位置，为国出战","国家队适应+15，意志+1；射门成长放缓",()=>{change(s.national,"adapt",15);gain(s,"WIL",1,"national");s.flags.outOfPosition=true;log(s,"story","你花两周恶补边翼卫的跑位录像。第一场热身赛送了两次传中，一次到位，一次出了底线。教练拍你肩说“适应得不错”——你没告诉他，你每晚都在房间对着战术板画跑位。")}),
    option("说明自己只能踢前锋","射门+1；国家队信任-12",()=>{gain(s,"SHO",1,"finish");s.national.adapt=clamp(s.national.adapt-12);log(s,"story","你跟教练谈完，他说“我理解你的想法”，然后把你从首发名单里划掉了。你在看台上看完了那场比赛——你的替补在右翼卫踢了七十二分钟，数据一般，但没有失误。")})]},
  {id:"national_injury",phase:["pro"],minAge:18,title:"国家队队医建议打封闭",body:"<p>世界杯预选赛，四十八小时后。你的脚踝肿了一圈，但X光片没有显示结构性损伤。国家队队医蹲下来按了两下，站起来说：<span class='dialogue'>“打一针封闭，可以上。比赛完了再处理。”</span></p><p>俱乐部的邮件已经在邮箱里躺着，措辞很明确：<span class='dialogue'>“我方球员目前处于疲劳恢复期，不建议在未经完整评估的情况下进行高强度比赛。”</span></p><p>你坐在治疗床边，队医在等你回答。走廊里传来队友热身时球鞋摩擦地板的声音。教练不知道什么时候站在了门口，看着你说了一句：<span class='dialogue'>“国家需要你。”</span></p><p>他说完就走了。你没来得及问——他说的“国家”是指那件球衣，还是指他自己这场不能输的比赛。</p>",condition:s=>s.national.called,options:s=>[
    option("打封闭首发","国家队声望+10；25%伤停3—6个月",()=>{change(s,"fame",10);if(chance(hasTalent(s,"iron_man")?.14:.25))sufferInjury(s,rand(3,6));log(s,"story","针扎进去时你咬了一下牙。比赛你踢了六十三分钟，有一次助攻。赛后你脚踝肿得脱不下鞋，队医用剪刀把鞋带剪断才取下来。")}),
    option("拒绝冒险，回俱乐部治疗","体能+10；国家队适应-10，职业寿命更稳",()=>{change(s,"fitness",10);change(s.national,"adapt",-10);log(s,"story","你第二天飞回了俱乐部。飞机上你关掉手机，不看新闻。落地开机后消息栏躺着几十条未读，你一条也没点开，直接开车去了队医那里报到。")})]},
  {id:"transfer_loyalty",phase:["pro"],minAge:19,title:"豪门报价，和一份队长承诺",body:"<p>两份东西几乎同时摆在桌上。左边是一份报价单，数字后面跟着好几个零，俱乐部名字你从小就在电视上看过。右边是现任主教练的短信：<span class='dialogue'>“下赛季，队长袖标是你的。”</span></p><p>经纪人说豪门不能保证首发，但平台不是一个级别。主教练这边工资只有一半，但给你袖标，给你战术地位。</p><p>你坐在宿舍里，两样东西摊在桌面上，中间放着一瓶喝了一半的水。你想起周骁说过的一句话：<span class='dialogue'>“有人要你是因为你能用，有人要你是因为你是你。”</span></p><p>窗外的天快黑了。你把两份文件收进抽屉，哪一个都没回。</p>",options:s=>[
    option("留下争取队长袖标","教练信任+15，可能成为队长；错过本期报价",()=>{change(s,"coachFavor",15);if(overall(s)>=82||hasTalent(s,"captain")){s.flags.captain=true;unlock("captain_armband")};s.offers=[]}),
    option("要求经纪人推动转会","生成2份高一级报价；教练信任-12",()=>{generateOffers(s,2,true);change(s,"coachFavor",-12)})]},
  {id:"brand_vs_rest",once:true,maxMoney:60,phase:["pro"],minAge:18,title:"一天广告拍摄，等于三个月康复费",body:"<p>品牌方档期只能排在休息日。经纪人打电话来：<span class='dialogue'>“机会难得，这个曝光量不拿白不拿。”</span></p><p>队医在旁边听到了，等你挂了电话，递过来一张恢复计划表：<span class='dialogue'>“你需要完整休息。连续训练和比赛之后，身体窗口期只有这几天。”</span>你看着他，他没再说第二句，把表放在桌上就走了。</p><p>你查了一下银行余额。父亲的住院账单还有一部分挂着。一天拍摄，三个月康复费的缺口。</p><p>你站在饮水机前面，接了一杯水，没喝，看着它慢慢凉下来。</p>",options:s=>[
    option("接下拍摄","收入+22万，声望+6；体能-14，伤病风险+8",()=>{addMoney(s,22);change(s,"fame",6);change(s,"fitness",-14);s.injury.risk+=8;log(s,"story","拍摄那天你站了七个小时，换了四套衣服。晚上回基地，小腿有点发紧。你冰敷了二十分钟才去睡。")}),
    option("拒绝，完成恢复","体能+20，状态+3；没有额外收入",()=>{change(s,"fitness",20);change(s,"form",3);log(s,"story","你回绝之后经纪人沉默了几秒，说“那我帮你推到下个月”。队医不知道这件事，但你第二天出现在恢复室时他什么也没问，只是把训练计划往前推了一页。")})]},
  {id:"captain_cover",phase:["pro"],minAge:20,title:"队友酒驾，队长要不要替他先挡住媒体",body:"<p>队友是凌晨被拦的。消息到中午还没上新闻，但俱乐部内部已经知道了。</p><p>你作为队长被叫进办公室，公关总监把一张稿纸推过来：<span class='dialogue'>“你先发个声，说队内问题已经处理了，维护一下集体形象。”</span>你问了一句：<span class='dialogue'>“警方通报出来了吗？”</span>公关总监看了你一眼：<span class='dialogue'>“还没有。但等通报出来再回应就晚了。”</span></p><p>玻璃窗外训练场上队友们在热身，那个酒驾的人也在场上。你不知道他酒驾的时候车上有没有别人，也不知道他知不知道你正在替他做决定。</p><p>稿纸上的字很简短——“队内问题已经解决，我们是一个团结的集体。”你拿起那张纸，没有签字。</p>",condition:s=>s.flags.captain||hasTalent(s,"captain"),options:s=>[
    option("拒绝背书，只谈球队纪律","教练信任-6；公众声望+10",()=>{change(s,"coachFavor",-6);change(s,"fame",10);log(s,"story","你在镜头前说“在结果出来之前，任何个人观点都代表不了这个集体”。回更衣室的路上，那个队友从你身边经过，没有看你。")}),
    option("按俱乐部稿件发言","教练信任+6；声望-9",()=>{change(s,"coachFavor",6);change(s,"fame",-9);log(s,"story","你说完稿子上的话，放下手机，发现评论区已经炸了——“队长出来洗地了。”你没有再打开手机。")})]},
  {id:"xiaoman_interview",once:true,notMarried:true,phase:["pro"],minAge:20,title:"小满接受了一次关于你的采访",body:"<p>原稿发到你手上的时候，标题是深度采访的格式。小满在里面说你<span class='dialogue'>“把一个普通人的情绪全部交给了比赛”</span>，说<span class='dialogue'>“和他生活很累，因为他把所有东西都吞下去，到球场才倒出来”</span>。</p><p>她还说了你第一次签职业合同那天晚上给她打电话，什么也没说，就在电话那头喘气。她用的是“喘气”，不是“哭”。</p><p>见报那天标题被改了：《球星女友控诉多年牺牲：他把所有情绪都给了比赛》。评论区又炸了，有人骂她蹭热度，有人说“赚那么多钱还矫情”。</p><p>你打电话给她，她接起来第一句是：<span class='dialogue'>“标题不是我起的。”</span>沉默了一会儿，又说：<span class='dialogue'>“但那些话是我说的，我不后悔。你要否认就否认，我不需要你帮我解释。”</span></p><p>她的语气很平静，但你知道她不是无所谓。她只是把选择权又丢回给了你，然后自己去扛剩下的。</p>",portrait:"assets/lin-xiaoman.webp",condition:s=>["恋人","异地"].includes(s.relationship.status),options:s=>[
    option("先和她谈，再共同澄清","感情+8；声望+1",()=>{changeLove(s,8);change(s,"fame",1);log(s,"story","见面时她第一句话是：“你不用道歉。我只是觉得，有些话总要有人说出来。”那天晚上你们坐在操场边的台阶上，说了很久。")}),
    option("让经纪人单方面否认","声望+3；感情-18，冲突+15",()=>{change(s,"fame",3);changeLove(s,-18);s.relationship.conflict=(s.relationship.conflict||0)+15;log(s,"story","声明发出去半小时后，你收到她最后一条消息：“原来你连跟我一起面对都觉得麻烦。”之后对话框里再也没有出现过她的头像。")})]},
  {id:"red_card_choice",phase:["firstteam","overseas","pro"],title:"队友被恶意铲倒，全队都在看你",body:"<p>对方中卫那一脚踩在你队友脚踝上，他没出声，但在地上翻了一圈才站起来。裁判只给了黄牌。队长经过你身边时丢了一句：<span class='dialogue'>“别冲动。”</span></p><p>下一个回合，球到了你脚下。你背身拿球，那个中卫贴上来，胸口顶住你的后腰，下巴搁在你肩膀上，用只有你们两个人听得见的音量说：<span class='dialogue'>“你想怎么样？”</span></p><p>看台上有人在吹口哨，有人在喊。你的手已经攥起来了。球在你脚下，他在你身后，裁判在十米外。</p><p>所有人在等你选。</p>",options:s=>[
    option("用下一次进攻回应","意志+1，状态+4；需要压住情绪",()=>{gain(s,"WIL",1,"clutch");change(s,"form",4);log(s,"story","你把球做出去，前插，接球，不跟他纠缠。两分钟后你用一个变向把他晃倒在地，然后把球传了出去。你没看他，但你知道他在看你。")}),
    option("替队友强硬出头","意志+1，教练信任-4；40%停赛1个月",()=>{gain(s,"WIL",1,"team");change(s,"coachFavor",-4);if(chance(.4)){s.suspension=1;log(s,"warn","你的报复动作被追加停赛1个月。")}})]},
  {id:"study_contract",phase:["campus"],title:"职业试训，和小满的毕业答辩",body:"<p>重庆铜梁龙只给一次三天试训。最后一天，正好是小满的毕业答辩。</p><p>她比你先知道这件事。你还在纠结要不要告诉她的时候，她已经把你的训练日程表打印出来贴在书桌上了：<span class='dialogue'>“三天，第一天适应，第二天对抗，第三天比赛。你第三天早上答辩前出发，来得及赶上下午的对抗。”</span></p><p>你问她答辩几点。她说上午十点。<span class='dialogue'>“你不用回来。”</span>语气跟说“今天可能要下雨”一样平常，<span class='dialogue'>“我准备了很久，不是让你回来听的。”</span>但你听得出来，这句话不是“不需要”，而是“不能说需要”。</p><p>那天晚上你躺在床上，她在隔壁房间背稿。你听见她偶尔停下来，深呼吸，再从头开始。</p><p>第二天早上你起来时，桌上放着一份早餐和一张纸条：<span class='dialogue'>“答辩顺利的话，我中午在校门口等你。”</span>她没有写“如果你在的话”。</p>",portrait:"assets/lin-xiaoman.webp",options:s=>[
    option("参加全部试训","声望+18，职业机会大增；感情-14",()=>{change(s,"fame",18);changeLove(s,-14);log(s,"story","比赛结束后你才看到——她发来一张照片：学士服，手里一束花，一个人站在答辩教室门口笑着，配文“过了”。你拿着手机站了很久。")}),
    option("提前离队赶回答辩","感情+15，意志+1；试训成功率下降",()=>{changeLove(s,15);gain(s,"WIL",1,"love");change(s,"fame",-6);log(s,"story","你出现在答辩教室后门时，她刚好念到致谢。她看见你，顿了一拍，继续往下念。结束后她在走廊拉住你，眼睛红了：“你不该回来的。”但拉着你袖子的手没松开。")})]},
  {id:"reconcile",once:true,phase:["firstteam","overseas","campus","pro"],minAge:19,title:"很久没亮的号码又亮了",body:"<p>对话框沉到很下面了。你没有删过聊天记录，但也很久没有往上翻过。</p><p>那天晚上消息弹出来的时候，你刚洗完澡，屏幕上只有一行预览：<span class='dialogue'>“我到你在的城市了，明天下午走。有空的话，一起吃个饭？”</span></p><p>你盯着那条消息看了很久。上一次见面是多久之前了？你甚至想不起最后一次说话的语气。你点进去，看见上一条消息还是她发的——“我理解。”后面什么都没有了。</p><p>你打了一行字：“几点，哪儿？”又删掉。又打：“好久不见。”又删掉。最后你发了一个字：<span class='dialogue'>“好。”</span>她回得很快：<span class='dialogue'>“那我把地址发你。”</span></p><p>地址发过来了，是一家你以前常去的面馆。她什么都没多说，但你知道，那个地方，吃一顿饭的时间比一顿饭本身要长。</p>",portrait:"assets/lin-xiaoman.webp",condition:s=>s.relationship.status==="分手",options:s=>[
    option("赴约，试着重新开始","有机会复合；也可能只是好好告别",()=>{if(chance(.55)){s.relationship.status=phaseOf(s)==="overseas"?"异地":"恋人";s.relationship.love=42;s.relationship.conflict=0;s.flags.breakupQueued=false;change(s,"form",5);log(s,"good","你们决定重新试试。这次你不想再拿比赛当借口。")}else{change(s,"form",-2);gain(s,"WIL",1,"will");log(s,"story","一顿饭聊了很多，笑着笑着都明白，回不去了。")}}),
    option("婉拒，把力气留给赛场","状态+4，射门+1；关系仍为分手",()=>{change(s,"form",4);gain(s,"SHO",1,"finish");log(s,"story","从那以后，你每次进球后都会不自觉地往看台某个方向看——即使知道她不在那里。")})]},
  {id:"contract_renewal",phase:["pro"],minAge:19,title:"续约合同摆到了桌上",body:"<p>俱乐部开出的条件是三年，工资涨幅不大，但有绩效奖金。经纪人看了一眼数字，在桌子底下给你发消息：<span class='dialogue'>“这个数低了，我可以再压一压，但可能会惹恼管理层。”</span></p><p>对面的经理在等你签字，笔已经放在纸上了：<span class='dialogue'>“俱乐部很看重你，希望把你作为长期计划的一部分。”</span></p><p>你拿起笔，没有马上签。经理看着你，脸上的笑容很职业，他在等你做选择——涨薪或者安稳。</p><p>经纪人还在看你。你突然意识到，这个房间里没有一个人是在替你想“踢球”这件事。</p>",options:s=>[
    option("强硬要求涨薪","月薪上调；教练信任-8，声望-4",()=>{s.salary=Math.round((s.salary||4)*1.35);change(s,"coachFavor",-8);change(s,"fame",-4);log(s,"story","经理听完你的要求，把笔收了回去：“那我需要跟上面汇报。”他站起来时椅子腿蹭了一下地板。经纪人随后发来消息：“有戏，但接下来三个月你可能要多等一会儿了。”")}),
    option("接受平稳续约","月薪小涨，教练信任+6；错过一次要价机会",()=>{s.salary=Math.round((s.salary||4)*1.1);change(s,"coachFavor",6);log(s,"story","你签完字，经理跟你握了手，手心是热的：“合作愉快。”走出门时你收到一条消息——另一家俱乐部：”听说你续了？好吧，祝好。”")})]},
  {id:"young_rival",phase:["firstteam","pro"],minAge:18,title:"俱乐部签来一个同位置的新星",body:"<p>他比你小一岁，签进来的时候俱乐部官宣配了两张海报。媒体拿你俩比，标题写的是“新老交替还是良性竞争？”</p><p>训练第一天，他在你对面踢。第一次对抗，他用速度生吃了你一次；第二次你卡住位置没让他转身；第三次他主动过来跟你碰了一下拳头。</p><p>晚上你刷手机，看到他的采访：<span class='dialogue'>“我很尊重前辈，我来是学习的。”</span></p><p>你把手机扣在桌上。你知道那句话说得很得体，也知道他说的是真话。比假话更难消化。</p>",options:s=>[
    option("用更狠的训练回应","射门+1，速度+1；体能-12，伤病风险上升",()=>{gain(s,"SHO",1,"finish");gain(s,"PAC",1,"burst");change(s,"fitness",-12);s.injury.risk+=6}),
    option("找教练谈清自己的定位","教练信任波动；意志+1",()=>{const ok=chance(.5);change(s,"coachFavor",ok?7:-7);gain(s,"WIL",1,"pressure")})]},
  {id:"loan_offer",phase:["pro"],minAge:19,title:"一份去小球队踢主力的租借",body:"<p>报价摆在桌上：二级联赛，保级队，踢满整个赛季，保证首发。对面教练亲自打了电话：<span class='dialogue'>“我需要你这种类型的球员，你来了就是战术核心。”</span></p><p>你现在的俱乐部能赢球，能打漂亮的比赛，能跟顶级球员一起训练。但你上不了场——你已经连续七场坐在替补席上，总出场时间四十一分钟。</p><p>经纪人把报价推过来：<span class='dialogue'>“这不是降级，这是去踢球。”</span></p><p>你没有回答。你看着窗外训练场上，一线队在打分组对抗，球从一个半场转移到另一个半场，没有人停下来等你。</p>",condition:s=>s.coachFavor<45,options:s=>[
    option("接受租借，去踢球","出场大增、成长加快；声望-4，月薪略降",()=>{change(s,"coachFavor",60-s.coachFavor);change(s,"form",6);change(s,"fame",-4);s.salary=Math.max(2,Math.round((s.salary||4)*.85));log(s,"story","你降薪去了保级队，但终于每周都能上场。")}),
    option("留下继续抢位置","维持平台；出场少，状态-5",()=>{change(s,"form",-5)})]},
  {id:"sponsor_line",phase:["pro"],minAge:19,portrait:"assets/brother-wang-v1.webp",title:"一个来路不明的博彩赞助",body:"<p>报价是市场价的三倍。条件只有一个：在社交媒体上发一条内容，穿他们提供的装备，不需要提品牌名字，只需要“无意间露出”。</p><p>合规部门的邮件抄送了你，措辞很谨慎：<span class='dialogue'>“此类合作在联赛框架内属于灰色地带，建议谨慎评估。”</span>王哥打来电话，语气兴奋：<span class='dialogue'>“这个数你不接就被人接了。到时候人家上了你却没上，你别后悔。”</span></p><p>你没有马上回答。你看着赞助方案上的品牌名，顺手搜了一下，发现它的母公司注册在一家你从没听过的小岛上。</p><p>你合上电脑。夜色里，手机屏幕又亮了，一条催促消息：<span class='dialogue'>“考虑得怎么样了？”</span></p>",options:s=>[
    option("拒绝，选干净的品牌","意志+1，声望+4；少赚一笔",()=>{change(s,"fame",4);gain(s,"WIL",1,"will");log(s,"story","你回复“不接”之后，对方没再发消息。两周后你看到那个报价出现在另一个球员的账号上。你划过那条帖子，没有点赞。")}),
    option("签下高额代言","立刻+30万；涉赌风险+30，埋下隐患",()=>{addMoney(s,30);s.flags.bettingEver=true;change(s.risks,"gambling",30);log(s,"story","你发出那条合作内容后，评论区第一条是“你也接这个了？取关。”你把它删了。但钱已经到账了。")},"danger")]},
  {id:"overseas_culture",once:true,phase:["overseas"],title:"更衣室的玩笑你听不懂",body:"<p>不是听不懂单词。是所有人都笑了，你晚了三秒才反应过来那个梗是什么——等你反应过来的时候，笑点已经过了。</p><p>有人注意到了你的延迟，善意地跟你解释了一遍前因后果。你点了点头，笑了一下。但那个笑是表演性的，你知道，他也知道。</p><p>正式训练还没开始。更衣室里大家在换衣服、聊天，开那个你听不懂的玩笑。你系好鞋带，比平时多系了一圈。</p><p>下一次他们再笑的时候，你没有再等那个延迟，低头把护腿板塞进袜子里。你是队里唯一一个没有笑的，但没有人注意到——因为你没有停下手里的动作，你一直在绑鞋带。</p>",options:s=>[
    option("硬着头皮融进去","状态+5，语言+6；体能-6",()=>{change(s,"form",5);change(s,"language",6);change(s,"fitness",-6)}),
    option("专注训练，少社交","射门+1，体能+6；状态-4",()=>{gain(s,"SHO",1,"finish");change(s,"fitness",6);change(s,"form",-4)})]},
  {id:"academy_cut",once:true,phase:["academy"],minAge:15,title:"梯队年底要裁掉三个人",body:"<p>周骁在食堂里跟你说的，声音压得很低：<span class='dialogue'>“名单我看到了。年底压缩名单，淘汰三个。”</span>他没有说你在不在上面，但他看着你的眼神已经说明他不知道怎么开口。</p><p>你问他另外两个是谁。他说了一个名字，然后停了一下：<span class='dialogue'>“反正，你自己心里有数。”</span></p><p>那天晚上你加练到操场关灯。保安大爷站在门口等你，手里晃着钥匙串：<span class='dialogue'>“又没人给你开门了是不是。”</span></p><p>你没有回答。你弯腰系鞋带，手指有点抖。</p>",portrait:"assets/coach-zhou.webp",options:s=>[
    option("加倍训练证明自己","射门+1，身体+1；体能-14，伤病风险上升",()=>{gain(s,"SHO",1,"finish");gain(s,"PHY",1,"stamina");change(s,"fitness",-14);s.injury.risk+=6}),
    option("找教练要一个明确标准","教练信任+6，声望+4；状态-3",()=>{change(s,"coachFavor",6);change(s,"fame",4);change(s,"form",-3)})]}
,
// ===== 新增剧情事件（批量整合）=====
{
  id:"academy_captain_test",
  phase:["academy"],once:true,
  title:"队长袖标扔在你脚下",
  portrait:"assets/coach-zhou.webp",
  body:"<p>训练赛结束，周骁把袖标往地上一丢。<span class='dialogue'>“谁捡起来戴上，下一场谁就是队长。”</span></p><p>几个队友看了你一眼，没人动。袖标躺在泥里。</p>",
  options:s=>[
    option("弯腰捡起来戴上","声望+8，队长身份",()=>{change(s,"fame",8);s.flags.captain=true;log(s,"story","你捡起了袖标。")}),
    option("一脚踢回教练脚边","意志+1，但可能得罪教练",()=>{gain(s,"WIL",1,"story");change(s,"coachFavor",-5);log(s,"story","你把袖标踢了回去。")})
  ]
},
{
  id:"academy_father_money",
  phase:["academy"],once:true,
  title:"牛皮信封",
  portrait:"assets/father.webp",
  body:"<p>你爸来梯队送棉被，临走从裤兜掏出一个牛皮纸信封，塞进你枕头底下。<span class='dialogue'>“别让你妈知道。”</span></p><p>你打开一看，是他半个月的夜班费。</p>",
  options:s=>[
    option("把钱塞回他帆布袋里","家庭+10",()=>{change(s,"family",10);log(s,"story","你把钱还了回去。")}),
    option("收下，说声‘回头还’","资金+15万，但家庭-5",()=>{addMoney(s,15);change(s,"family",-5);log(s,"story","你收下了那笔夜班费。")})
  ]
},
{
  id:"academy_first_goal",
  phase:["academy"],once:true,
  title:"第一粒正式比赛进球",
  portrait:"assets/player.webp",
  body:"<p>U15联赛，你接直塞单刀破门。球场边没什么人喝彩，只有铁丝网外一个穿工装的身影默默转身走了。</p><p>那个人你认识。</p>",
  options:s=>[
    option("冲到场边朝他挥手","家庭+8，情感回忆",()=>{change(s,"family",8);log(s,"story","你朝那个背影使劲挥手。")}),
    option("默默比赛，后面再说","意志+1",()=>{gain(s,"WIL",1,"story");log(s,"story","你咽下情绪，跑回中圈。")})
  ]
},
{
  id:"firstteam_overwork",
  phase:["firstteam","pro"],
  title:"连续加班加练",
  portrait:"assets/coach-zhou.webp",
  body:"<p>周骁让你每天加练两小时射门。你已经连续三周没休息过一天。膝盖开始酸胀。</p><p>队医写了个纸条：<span class='dialogue'>“建议轮休一场。”</span>周骁把它揉成一团。</p>",
  options:s=>[
    option("跟教练申请轮休","伤病风险-15，但教练信任-5",()=>{s.injury.risk=clamp((s.injury.risk||0)-15);change(s,"coachFavor",-5);log(s,"story","你递了轮休申请。")}),
    option("咬牙撑住，打封闭继续","教练信任+8；伤病风险+20",()=>{change(s,"coachFavor",8);if(!s.flags.health_warn){s.flags.health_warn=true;log(s,"warn","医生皱眉看着你的膝盖。")}s.injury.risk=clamp((s.injury.risk||0)+20)})
  ]
},
{
  id:"firstteam_gambling_approach",
  phase:["firstteam"],once:true,
  title:"“方便喝杯咖啡吗？”",
  portrait:"assets/player.webp",
  body:"<p>一个自称“球迷”的人在基地外等你，递来一杯咖啡，随口聊了几句。临走塞给你一张名片：<span class='dialogue'>“哥几个凑钱玩球，输赢都跟你无关。就是给点内幕消息。”</span></p><p>名片背面只有一个手机号。</p>",
  options:s=>[
    option("当场撕掉","降低赌博风险至0",()=>{s.risks.gambling=0;log(s,"good","你撕了名片，扔进垃圾桶。")}),
    option("先留着，不联系","赌博风险+5",()=>{change(s.risks,"gambling",5);log(s,"story","名片夹进了手机壳后面。")}),
    option("收下，并约了下次见面","赌博风险+30；资金+10万",()=>{addMoney(s,10);change(s.risks,"gambling",30);log(s,"bad","你接过了那杯咖啡。")},"danger")
  ]
},
{
  id:"firstteam_lin_xiaoman_conflict",
  phase:["firstteam","pro"],notMarried:true,once:true,
  title:"她站在铁丝网外",
  portrait:"assets/lin-xiaoman.webp",
  body:"<p>林小满淋着雨看完训练，等你出来。<span class='dialogue'>“你上次说请假陪我去面试，你没来。”</span></p><p>她的语气很平静，像在陈述比分。</p>",
  options:s=>[
    option("道歉，解释训练任务","感情+5，但显得敷衍",()=>{changeLove(s,5);log(s,"story","你说对不起。她说：没事。")}),
    option("沉默，给她一把伞","感情+2，自尊心持平",()=>{changeLove(s,2);log(s,"story","你递了伞，她推开了。")}),
    option("“你该理解我”","感情-10",()=>{changeLove(s,-10);log(s,"bad","她说：那也要我变成你的球迷才行吗？")},"danger")
  ]
},
{
  id:"pro_big_club_offer",
  phase:["pro"],once:true,condition:s=>s.fame>=50,
  title:"两个电话",
  portrait:"assets/brother-wang-v1.webp",
  body:"<p>王哥打来两个电话：一个来自欧洲中游俱乐部，出场时间有保证；一个来自国内顶级豪门，薪水翻倍但竞争激烈。</p><p>他说：<span class='dialogue'>“你爸那边……要不要再想想？”</span></p>",
  options:s=>[
    option("去欧洲","资金-20万，声望+30；出国线开启",()=>{addMoney(s,-20);change(s,"fame",30);s.flags.go_abroad=true;log(s,"story","你买了单程票。")}),
    option("留国内豪门","资金+80万；竞争压力增大",()=>{addMoney(s,80);change(s,"fame",10);log(s,"story","你签了国内的大合同。")})
  ]
},
{
  id:"pro_father_hospital",
  phase:["pro"],once:true,condition:s=>s.family<40,
  title:"急诊室走廊",
  portrait:"assets/father.webp",
  body:"<p>你爸急性心梗住院。你妈在电话里说：<span class='dialogue'>“你不用回来，比赛重要。”</span></p><p>可你听出她在哭。</p>",
  options:s=>[
    option("请假连夜回去","家庭+20，体能-20，比赛缺阵",()=>{change(s,"family",20);change(s,"fitness",-20);sufferInjury(s,1);log(s,"story","你出现在了病房门口。")}),
    option("拜托表妹照顾，打完客场再说","家庭-10，职业态度+3",()=>{change(s,"family",-10);gain(s,"WIL",3,"story");log(s,"bad","你挂掉电话，发了一条朋友圈。")})
  ]
},
{
  id:"pro_gambling_debt",
  phase:["pro"],condition:s=>s.risks.gambling>=30,
  title:"“上次那事，该结了”",
  portrait:"assets/player.webp",
  body:"<p>你在基地停车场被两辆车堵住。副驾驶摇下窗，那人笑了笑。<span class='dialogue'>“兄弟，上次那些消息不够准啊……帮忙补个数？”</span></p><p>他伸出三根手指。不是三万。是三十万。</p>",
  options:s=>[
    option("老实给钱","资金-30万",()=>{addMoney(s,-30);log(s,"bad","你付了钱，但留下转账记录。")},"danger"),
    option("报警","警方介入；赌博风险清零；足球名声受损-20",()=>{s.risks.gambling=0;change(s,"fame",-20);log(s,"story","你拨了110。")})
  ]
},
{
  id:"pro_corner_choice",
  phase:["pro"],condition:s=>s.national.called===true,
  title:"一个无关胜负的角球",
  portrait:"assets/coach-zhou.webp",
  body:"<p>世预赛最后一场，已经提前出线。补时阶段，你赢得一个角球。所有人都在等时间走完。</p><p>你想起了很久以前一个承诺——无关胜负，只关底线。</p>",
  options:s=>[
    option("一脚踢出界，耗完时间","职业表现+1",()=>{gain(s,"WIL",1,"story");log(s,"story","你安稳地结束了比赛。")}),
    option("去争那个角球，哪怕没必要","体能-15，意志+5",()=>{change(s,"fitness",-15);gain(s,"WIL",5,"story");log(s,"story","你冲向门前。有人记住了这一刻。")})
  ]
},
{
  id:"pro_media_storm",
  phase:["pro"],weight:2,
  title:"摄像头后面的眼睛",
  portrait:"assets/player.webp",
  body:"<p>一场比赛你发挥失常，赛后某大V剪辑了你三次失误，配文：<span class='dialogue'>“这是他真实水平？”</span></p><p>转发量一小时内破万。</p>",
  options:s=>[
    option("公开发长文回应","若声望>80则舆论平息，否则更糟",()=>{if(s.fame>80){change(s,"fame",5);log(s,"good","多数球迷选择相信你。")}else{change(s,"fame",-15);log(s,"bad","你被骂得更凶了。")}}),
    option("沉默，下一场用表现打脸","意志+2，舆情不加不减",()=>{gain(s,"WIL",2,"story");log(s,"story","你没有回应。三天后训练场加练到深夜。")})
  ]
},
{
  id:"pro_injury_knock",
  phase:["pro"],weight:2,
  title:"不经意的碰撞",
  portrait:"assets/player.webp",
  body:"<p>队内对抗赛，你跟后卫对脚。小腿一阵发麻。队医跑过来问：<span class='dialogue'>“有声音吗？”</span></p><p>你摇了摇腿说没事。但那一下的声音，你自己听到了。</p>",
  options:s=>[
    option("立刻要求检查","伤停1周，伤病风险-20",()=>{sufferInjury(s,1);s.injury.risk=clamp((s.injury.risk||0)-20);log(s,"story","你没有逞强。")}),
    option("轻伤不下火线","可能恶化；得周骁信任+5",()=>{if(chance(.3)){sufferInjury(s,rand(2,4));log(s,"bad","那一脚最终让你躺了几个月。")}else{change(s,"coachFavor",5);log(s,"story","你咬牙撑完了训练。")}})
  ]
},
{
  id:"pro_training_rival",
  phase:["pro"],weight:1,
  title:"更衣室里的新面孔",
  portrait:"assets/player.webp",
  body:"<p>俱乐部签了一个年轻前锋，你的号码被分走了半个训练区域。他看你的眼神像看一棵旧草。</p><p>你的位置没有铁打一说。</p>",
  options:s=>[
    option("主动带他练习，示好","声望+5",()=>{change(s,"fame",5);log(s,"story","你朝他伸出手说：欢迎。")}),
    option("加练得更凶，位置要靠抢","意志+3",()=>{gain(s,"WIL",3,"story");log(s,"story","你一个人练到所有灯都熄灭。")})
  ]
},
{
  id:"pro_marriage_proposal",
  phase:["pro"],notMarried:true,once:true,condition:s=>s.relationship.love>=80,
  title:"后备箱里的玫瑰",
  portrait:"assets/lin-xiaoman.webp",
  body:"<p>林小满生日那天，你开车，她坐副驾。后备箱里是你偷偷准备的玫瑰和戒指，车程还有一公里到家。</p>",
  options:s=>[
    option("靠边停车，求婚","结婚线开启；感情+20",()=>{s.flags.married=true;changeLove(s,20);log(s,"good","她哭了。你给她戴上戒指。")}),
    option("再等等，还不是时候","感情不变；错过一次机会",()=>{log(s,"story","你握紧方向盘，开过了那个路口。")})
  ]
},
{
  id:"pro_old_football",
  phase:["pro"],once:true,
  title:"旧足球的线断了",
  portrait:"assets/father.webp",
  body:"<p>训练回来，你发现背包夹层里的那只旧足球表面的线崩开了一条。你爸很多年前缝过的位置，开了。</p><p>你坐在床边，拿着那只球。</p>",
  options:s=>[
    option("找鞋匠重新缝好","意志+2；保存这只球",()=>{gain(s,"WIL",2,"story");log(s,"story","你花了三十块钱，缝好了。")}),
    option("把它收进柜子最深处的箱子","家庭回忆+5，但再也不会用了",()=>{change(s,"family",5);log(s,"story","你把它放进了箱底。")})
  ]
},
{
  id:"pro_lin_pregnant_b",
  phase:["pro"],once:true,condition:s=>s.flags.married===true,
  title:"两条杠",
  portrait:"assets/lin-xiaoman.webp",
  body:"<p>林小满把验孕棒放在茶几上，等你回来。你看了一眼，坐下了。她看着你：<span class='dialogue'>“你要是没准备好，我们可以再谈谈。”</span></p><p>她的声音很平静，像在说一件别人的事。但你知道她不是不在乎。</p>",
  options:s=>[
    option("蹲下来，把手放在她肚子上","感情+15，家庭+10；确定成为父亲",()=>{changeLove(s,15);change(s,"family",10);s.flags.father=true;log(s,"good","她握住了你的手腕。")}),
    option("说‘让我想一想，下周再聊’","感情-5，家庭-5",()=>{changeLove(s,-5);change(s,"family",-5);log(s,"story","她轻轻点了点头，把验孕棒收进了抽屉。")})
  ]
},
{
  id:"pro_injury_comeback",
  phase:["pro"],once:true,condition:s=>s.flags.serious_injury&&!(s.injury.months>0),
  title:"复出前的最后一趟训练",
  portrait:"assets/player.webp",
  body:"<p>伤愈后第一次合练。你站在场边系鞋带，手腕有点抖。不是怕，是太久没碰球了。草坪的味道让你想起很多东西。</p><p>场边的哨声响了。</p>",
  options:s=>[
    option("深呼吸，第一个踏进球场","意志+5；正式复出",()=>{gain(s,"WIL",5,"story");log(s,"story","你踏上了草坪。一切都没变。")}),
    option("先在边路慢跑两圈找感觉","谨慎，状态+3",()=>{change(s,"form",3);log(s,"story","你慢慢进入了节奏。")})
  ]
},
{
  id:"pro_worldcup_qualified_b",
  phase:["pro"],once:true,condition:s=>s.flags.worldcup_qualified===true,
  title:"出线之夜·更衣室",
  portrait:"assets/player.webp",
  body:"<p>裁判哨响。你们赢了。更衣室成了疯子集中营。有人把冰桶扣在教练头上，有人在哭。你靠在自己的柜门上，低着头，大口喘气。</p><p>你的手机亮了——你爸的短信：<span class='dialogue'>“踢得好。”</span></p><p>就三个字。</p>",
  options:s=>[
    option("拨回去","家庭+10，情感高潮",()=>{change(s,"family",10);log(s,"good","你爸没接。你妈说他在客厅抹眼泪。")}),
    option("回一条：还不够","意志+3，保持饥饿",()=>{gain(s,"WIL",3,"story");log(s,"story","你又拿起战术手册翻了两页，才加入庆祝。")})
  ]
},
{
  id:"pro_lin_wedding",
  phase:["pro"],once:true,condition:s=>s.flags.married===true&&s.flags.wedding_done===undefined,
  title:"把婚礼定在休赛期",
  portrait:"assets/lin-xiaoman.webp",
  body:"<p>林小满在电话里说：<span class='dialogue'>“婚纱店说那天档期空着。你要能请假，就定那天。”</span></p><p>你打开手机日历——那天正好有一场热身赛邀请，对手是韩国俱乐部。</p>",
  options:s=>[
    option("推掉热身赛","婚礼如期举行，感情+20",()=>{changeLove(s,20);s.flags.wedding_done=true;log(s,"good","她穿着婚纱等你。你差点迟到。")}),
    option("推迟婚礼，去打比赛","感情-15，职业态度+5",()=>{changeLove(s,-15);gain(s,"WIL",5,"story");s.flags.wedding_done=true;log(s,"bad","你在酒店大堂给她打了一个很长的电话。")})
  ]
},
{
  id:"pro_retirement_decision",
  phase:["pro"],once:true,condition:s=>ageInfo(s).age>=34,
  title:"最后一场主场比赛",
  portrait:"assets/player.webp",
  body:"<p>俱乐部为你办了一个简短的仪式——最后一场主场比赛，赛前给你送了纪念球衣。看台上有人举着你刚进一线队时的照片。那一年你十八岁，瘦得像根竹竿。</p><p>你绕着球场走了一圈，听到很多人的声音。</p>",
  options:s=>[
    option("在球场中央跪下，亲吻草皮","仪式感，意志+5",()=>{gain(s,"WIL",5,"story");log(s,"story","全场起立鼓掌。你站起来的时候，眼眶是红的。")}),
    option("绕场一周，把护腕扔上看台","与球迷告别，家庭+5",()=>{change(s,"family",5);log(s,"story","一个小孩抢到了护腕，举着它尖叫。")})
  ]
},
{
  id:"pro_mentor_death",
  phase:["pro"],once:true,
  title:"周骁的电话没人接",
  portrait:"assets/coach-zhou.webp",
  body:"<p>你打了三次周骁的电话，没人接。最后是他儿子回的消息：<span class='dialogue'>“我爸昨天走了，心梗。他手机里有你的未接来电，我替他回了。”</span></p><p>你坐在车里，没有熄火。</p>",
  options:s=>[
    option("参加葬礼，站最后一排","情感+10，正式告别",()=>{change(s,"family",10);log(s,"story","你放了一朵白花在墓碑前。风很大。")}),
    option("自己踢一场比赛纪念他","意志+5，孤独的告别",()=>{gain(s,"WIL",5,"story");log(s,"story","你一个人在训练场踢了两个小时。")})
  ]
},
{
  id:"pro_father_pass_away",
  phase:["pro"],once:true,condition:s=>s.family<=20&&s.flags.father_alive,
  title:"电话在凌晨三点响",
  portrait:"assets/father.webp",
  body:"<p>凌晨三点的电话从不带来好消息。你妈在电话那头只说了一句：<span class='dialogue'>“儿，你爸走了。”</span></p><p>然后她挂了。你听着忙音，躺了很久才起来订票。</p><p>衣柜最上层，那只旧足球还在。</p>",
  options:s=>[
    option("带那只球回家参加葬礼","家庭+20；关系闭环",()=>{change(s,"family",20);s.flags.father_alive=false;s.flags.football_back_home=true;log(s,"story","你把球放在他旁边。一起带去的还有那双他买的鞋。")}),
    option("把球留在基地，继续训练","意志+8；回避性处理",()=>{gain(s,"WIL",8,"story");s.flags.father_alive=false;log(s,"story","你那天练到所有灯都灭掉。")})
  ]
},
{
  id:"pro_father_pass_b",
  phase:["pro"],once:true,condition:s=>s.family>20&&s.flags.father_alive,
  title:"同一个电话",
  portrait:"assets/father.webp",
  body:"<p>凌晨三点的电话。你妈的声音比你想的平静：<span class='dialogue'>“你爸让我别吵你比赛。但他走了四个小时了，我想你应该知道。”</span></p><p>你下周有世预赛。</p>",
  options:s=>[
    option("请假回家处理丧事","家庭+15，缺席一场",()=>{change(s,"family",15);s.flags.father_alive=false;sufferInjury(s,1);log(s,"story","你跪在灵堂前，一句话都说不出来。")}),
    option("踢完世预赛再回去","意志+10；但家庭永久受损",()=>{gain(s,"WIL",10,"story");s.flags.father_alive=false;change(s,"family",-5);log(s,"story","你进了球，没有庆祝。赛后你对着镜头说：爸，这是给你的。")})
  ]
},
{
  id:"pro_legend_ending",
  phase:["pro"],once:true,condition:s=>s.fame>=95&&s.flags.worldcup_qualified,
  title:"金球奖之夜",
  portrait:"assets/player.webp",
  body:"<p>你坐在巴黎的颁奖礼现场。主持人念出你的名字时，你脑子里一片空白。走上台的路很长，大约十五米。你想起那只旧足球，想起重庆的雨，想起周骁，想起你爸的夜班费。</p><p>奖杯很重。</p>",
  options:s=>[
    option("把旧足球带上领奖台","情感闭环，声望+5",()=>{change(s,"fame",5);log(s,"good","你从口袋里掏出那只旧足球，举过奖杯。全场起立。")}),
    option("把奖杯献给父亲","家庭+10，情感完成",()=>{change(s,"family",10);log(s,"good","你说：这是我爸的奖杯。")})
  ]
},
{
  id:"pro_silent_ending",
  phase:["pro"],once:true,condition:s=>s.fame<=30&&ageInfo(s).age>=30,
  title:"没有掌声的夜晚",
  portrait:"assets/player.webp",
  body:"<p>又一场替补席上度过的比赛。你收拾更衣室柜子的时候，发现角落里有一只遗落的旧护腿板——不记得是谁的了。你把东西装进塑料袋，从侧门走出去。</p><p>没有记者。没有人等你。</p>",
  options:s=>[
    option("给梯队打个电话，问问带队的事","意志+3；开始想退路",()=>{gain(s,"WIL",3,"story");log(s,"story","对面说：随时欢迎你回来。")}),
    option("回家给小满做顿饭","状态+3，家庭+5",()=>{change(s,"form",3);change(s,"family",5);log(s,"story","很久没这么早回家了。")})
  ]
}
,
// ===== 新角色：刘队（队长）与苏晚（赞助商千金）=====
{
  id:"pro_captain_liu",
  phase:["firstteam","pro"],once:true,
  title:"队长把你留了下来",
  portrait:"assets/leader-liu-v1.webp",
  body:"<p>训练结束，所有人都进了更衣室，只有刘队叫住你。他是这支队的队长，踢了十二年，膝盖上两道疤。<span class='dialogue'>“你有天赋，但你护球太软。”</span>他把球踩在脚下，<span class='dialogue'>“这一行，软的人先被淘汰。”</span></p><p>他没有骂你，语气甚至很平。但你听得出来，他是在给你留一条路。</p>",
  options:s=>[
    option("留下来跟他加练","身体+1，教练信任+5；体能-8",()=>{gain(s,"PHY",1,"story");change(s,"coachFavor",5);change(s,"fitness",-8);log(s,"story","刘队陪你练到天黑，一句多余的话都没有。")}),
    option("说自己有自己的踢法","意志+1；刘队没再多说",()=>{gain(s,"WIL",1,"story");log(s,"story","他点点头，转身走了。你分不清那是尊重还是失望。")})
  ]
},
{
  id:"pro_captain_liu_armband",
  phase:["pro"],once:true,condition:s=>s.fame>=65&&!s.flags.captain,
  title:"刘队把袖标交给你",
  portrait:"assets/leader-liu-v1.webp",
  body:"<p>刘队要退役了。最后一次队内会议，他当着全队把队长袖标摘下来，走到你面前。<span class='dialogue'>“别学我，我把自己踢废了才懂事。”</span>他把袖标塞进你手里，<span class='dialogue'>“这支队，以后看你的。”</span></p><p>更衣室很安静。所有人都在看你。</p>",
  options:s=>[
    option("郑重接过","成为队长；声望+10，意志+2",()=>{s.flags.captain=true;change(s,"fame",10);gain(s,"WIL",2,"story");log(s,"good","你戴上了袖标。刘队拍了拍你的后脑勺。")}),
    option("说自己还不够格","成为队长；声望+3",()=>{change(s,"fame",3);s.flags.captain=true;log(s,"story","他说：不够格也得扛。没人天生够格。")})
  ]
},
{
  id:"pro_qianjin_meet",
  phase:["pro"],once:true,notMarried:true,condition:s=>s.fame>=50,
  title:"赞助商晚宴上的那位小姐",
  portrait:"assets/qianjin.webp",
  body:"<p>俱乐部赞助商的晚宴。你穿着不太合身的西装站在角落，一个女孩端着香槟走过来。<span class='dialogue'>“你就是那个从来不笑的前锋？”</span>她是赞助商的女儿，苏晚，商学院刚毕业，说话像在谈一桩生意。</p><p>临走她递给你一张名片，背面是一个私人号码。<span class='dialogue'>“我爸的钱，能让你少走十年弯路。有兴趣，就打给我。”</span></p>",
  options:s=>[
    option("客气地收下，回头再说","声望+3；留了个念想",()=>{change(s,"fame",3);s.flags.met_suwan=true;log(s,"story","你把名片收进内袋，没有承诺什么。")}),
    option("说自己习惯自己走","意志+2；她挑了下眉",()=>{gain(s,"WIL",2,"story");s.flags.met_suwan=true;log(s,"story","苏晚笑了：“有意思。”她转身汇入人群。")})
  ]
},
{
  id:"pro_qianjin_choice",
  phase:["pro"],once:true,notMarried:true,condition:s=>s.flags.met_suwan&&["恋人","异地"].includes(s.relationship.status),
  title:"两条路，一条捷径",
  portrait:"assets/qianjin.webp",
  body:"<p>苏晚约你在江边的会所见面。她把一份资源摊在桌上：顶级康复团队、海外俱乐部的引荐、现成的代言合约。<span class='dialogue'>“跟着我，这些都是现成的。”</span>她顿了一下，看着你，<span class='dialogue'>“我要的也不多。”</span></p><p>手机在口袋里震了一下，是小满：<span class='dialogue'>“今天训练累不累？”</span>两条信息，两种人生，摆在同一张桌上。</p>",
  options:s=>[
    option("接过资源，和苏晚走近","资金+60万，声望+5；小满感情-25",()=>{addMoney(s,60);change(s,"fame",5);changeLove(s,-25);s.flags.with_suwan=true;log(s,"bad","你回了苏晚的消息，没有回小满的那条。")},"danger"),
    option("把名片还回去，回小满的消息","感情+15，意志+2；错过那条捷径",()=>{changeLove(s,15);gain(s,"WIL",2,"story");log(s,"story","你站起来说谢谢，然后给小满打电话：我这就回去。")})
  ]
}
];

function eventEligible(e,s){const a=ageInfo(s).age,p=phaseOf(s);return(!e.phase||e.phase.includes(p))&&(!e.minAge||a>=e.minAge)&&(!e.maxAge||a<=e.maxAge)&&(!e.maxMoney||(s.money||0)<e.maxMoney)&&(!e.minMoney||(s.money||0)>=e.minMoney)&&(!e.notMarried||!(s.flags&&s.flags.married))&&(!e.requireMarried||(s.flags&&s.flags.married))&&(!e.condition||e.condition(s))}
function chooseRandomEvent(s,rng=Math.random){let pool=EVENTS.filter(e=>eventEligible(e,s)&&!s.usedEvents.includes(e.id)&&!s.recentEvents.includes(e.id));if(!pool.length){s.usedEvents=s.usedEvents.filter(id=>{const ev=EVENTS.find(x=>x.id===id);return !ev||!eventEligible(ev,s)||ev.once});pool=EVENTS.filter(e=>eventEligible(e,s)&&!s.usedEvents.includes(e.id)&&!s.recentEvents.includes(e.id))}if(!pool.length)return null;const weighted=[];pool.forEach(e=>{const n=Math.max(1,Math.round((e.weight||1)*3));for(let i=0;i<n;i++)weighted.push(e)});const e=weighted[Math.floor(rng()*weighted.length)];s.usedEvents.push(e.id);s.recentEvents=[e.id,...s.recentEvents].slice(0,5);return e}

const STORY_BEATS={
  6:s=>({title:"铁丝网外的两个人",portrait:"assets/lin-xiaoman.webp",body:`<p>那个夏天你第一次跟队合练。结束的时候天已经黑透，你提着鞋往门口走，远远看见铁丝网外面站着两个人。</p><p>小满抱着一个保温杯，旁边站着周骁。周骁先看见你，朝你抬了抬下巴：<span class="dialogue">“你妹等你半天了。”</span></p><p>小满没理他，把保温杯递过来：<span class="dialogue">“绿豆汤，你妈让我带的。”</span>你接过来，烫的。周骁在旁边笑了一声：<span class="dialogue">“我站这儿八分钟了，她一句话没跟我说。”</span></p><p>你拧开盖子喝了一口，小满低下头，发绳松了，她重新扎。三个人站在路灯底下，谁也没说一起走。</p>`,options:[
    option("答应每周留一个晚上给她","感情+12；每月第一次训练收益略降",()=>{changeLove(s,12);s.flags.weeklyPromise=true}),
    option("告诉她，现在不能做保证","意志+1；感情-8，但没有空头承诺",()=>{gain(s,"WIL",1,"will");changeLove(s,-8)})]}),
  12:s=>({title:"父亲第一次承认他也害怕",portrait:"assets/father.webp",body:`<p>你们坐在医院走廊的塑料椅上。你爸刚拿到体检报告，没给你看，叠好塞进裤兜。你问他怎么样，他说<span class="dialogue">“没事，老毛病。”</span></p><p>沉默了一会儿，他突然开口：<span class="dialogue">“你踢球那会儿，我老怕你受伤。后来怕你踢不出来。现在……”</span>他顿了一下，手指在膝盖上反复搓，<span class="dialogue">“怕你看不起我。”</span></p><p>你没接话。走廊尽头的电视在播夜场集锦，声音开得很小。他又补了一句：<span class="dialogue">“我这辈子没做成什么事。你不一样。”</span></p>`,options:[
    option("把下一场球票放进他口袋","家庭+12，状态+3",()=>{change(s,"family",12);change(s,"form",3)}),
    option("请他少加班，比赛以后还有","家庭+7；父亲疲劳风险下降",()=>{change(s,"family",7);s.risks.familyFatigue=Math.max(0,(s.risks.familyFatigue||0)-12)})]}),
  18:s=>({title:"周年约会撞上邀请赛",portrait:"assets/lin-xiaoman.webp",body:`<p>你们约好了那天去吃那家她提了半年的酸菜鱼。出发前两小时，教练临时通知：晚上七点，邀请赛，首发。</p><p>你给她发消息，她回得很快：<span class="dialogue">“几场？我改签位子。”</span>你说那家店很难排。她说她已经排过一次了，座位能留到八点。</p><p>你打完上半场赶过去的时候，她面前摆了两副碗筷，鱼片凉了，上面凝了一层白色的油。她把火重新打开：<span class="dialogue">“还能吃，你别站门口。”</span></p><p>你没有解释比赛。她没有问输赢。</p>`,options:[
    option("比赛后连夜去见她","声望+8，体能-12；感情+8",()=>{change(s,"fame",8);change(s,"fitness",-12);changeLove(s,8)}),
    option("放弃邀请赛，陪她过完这天","感情+16；声望-10，教练信任-5",()=>{changeLove(s,16);change(s,"fame",-10);change(s,"coachFavor",-5)})]}),
  30:s=>phaseOf(s)==="overseas"?({title:"隔着时差的晚安",portrait:"assets/lin-xiaoman.webp",body:`<p>你这边下午三点，她那边凌晨一点。视频接通的时候她整个人埋在枕头里，只露半张脸。她说没事，就是手机开着睡，万一你那边想说话，她能听见。</p><p>你问她最近累不累，她说月考又没考好，卷子还没订正完。然后她笑了一下，眼睛还闭着：<span class="dialogue">“但比你好一点。起码我不用倒着时差踢球。”</span></p><p>你让她挂电话睡觉。她说：<span class="dialogue">“你先挂。”</span>你挂了，过一会儿又发了一条：晚安。</p><p>她没有回。第二天早上你看到一条消息，时间戳是凌晨三点——她也回了晚安。</p>`,options:[option("认真跟她说说今天","感情+8，状态+3；睡得更晚，体能-4",()=>{changeLove(s,8);change(s,"form",3);change(s,"fitness",-4)}),option("太累了，明天再回","状态+4；感情-6",()=>{change(s,"form",4);changeLove(s,-6)})]})
  :({title:"第一份职业工资",portrait:"assets/father.webp",body:`<p>工资到账那天你站在ATM机前看了三遍数字。取了一万，信封分两叠。</p><p>你爸收到钱没有回消息。晚上你回家，发现桌上多了一把新锁——你那间卧室的门锁早就坏了，他修了好几年都没顾上。</p><p>小满在楼梯口等你，问你领到工资是什么感觉。你想了想说：<span class="dialogue">“终于能请你吃那家酸菜鱼了。”</span>她没笑，低下头，过了半天才说：<span class="dialogue">“你不用急着请我。你先把自己稳住。”</span></p><p>她把那个“你”字咬得很轻，像在说一件很容易碎的东西。</p>`,options:[option("拿出一半给父母","家庭+14；现金-8万",()=>{change(s,"family",14);addMoney(s,-8)}),option("先建立康复与学习账户","体能+8，语言+6，意志+0.4；家庭+4",()=>{change(s,"fitness",8);change(s,"language",6);gain(s,"WIL",.4,"will");change(s,"family",4)})]}),
  36:s=>phaseOf(s)==="campus"?({title:"看台没有职业合同，仍然有她",portrait:"assets/lin-xiaoman.webp",body:`<p>你没拿到职业合同的那天，学校联赛的看台上只坐了不到两百人。你踢完90分钟，0比0，没有人注意，没有镜头。你坐在更衣室里没出来，直到保洁阿姨来关灯。</p><p>小满站在门口，手上拎着一个塑料袋。她蹲下来，把袋子打开——一碗绿豆汤，还是烫的。你说：<span class="dialogue">“我没签上。”</span></p><p>她说：<span class="dialogue">“我看见你踢了。最后那个拦截，你滑出去的时候根本没想会不会受伤。”</span></p><p>你端起碗喝了一口。她坐在你旁边，没有说“下次一定行”，没有说“你已经很好了”。她只是坐在那儿，等你喝完。</p>`,options:[option("重新冲击职业试训","声望+15，感情+8；体能-10",()=>{change(s,"fame",15);changeLove(s,8);change(s,"fitness",-10)}),option("把意志与足球都走完","意志+1，感情+12；职业成长变慢",()=>{gain(s,"WIL",1,"will");changeLove(s,12)})]})
  :({title:"那条没有发出去的消息",portrait:"assets/lin-xiaoman.webp",body:`<p>你签了职业合同那天晚上，手机里翻到小满的对话框。上一次聊天是四个月前，她生日你发了一句“生日快乐”，她回了“谢谢”。</p><p>光标在输入框里闪了很久。你想告诉她你签了，想问她最近怎么样，想说那句“铁丝网外面还有人吗”。最后你打了一行字——“今天签合同了。”删掉。又打——“好久没联系了。”删掉。</p><p>你把手机锁屏，屏幕黑掉之前，你看见对话框最底下是她半年前发来的最后一条消息：<span class="dialogue">“我准备高考了，你也加油。”</span></p><p>你没有回那条消息。她也没有再发过。</p>`,options:[option("把真实压力说出来","感情+12，状态+6；媒体活动取消一次",()=>{changeLove(s,12);change(s,"form",6);change(s,"fame",-2)}),option("把手机扣下，第二天继续训练","教练信任+5；感情-10，意志+1",()=>{change(s,"coachFavor",5);changeLove(s,-10);gain(s,"WIL",1,"pressure")})]}),
  42:s=>({title:"父亲病床边的终场哨",portrait:"assets/father.webp",body:`<p>你赶到病房的时候，你爸刚做完一轮透析。他闭着眼，脸上只剩一层皮贴着骨头。你坐在床边，不知道该说什么。</p><p>沉默了很久，他突然开口，声音哑得几乎听不见：<span class="dialogue">“今天……有比赛？”</span>你说推迟了。他摇了摇头：<span class="dialogue">“别推。我这一辈子，就是推得太多了。”</span></p><p>他转过头看着你，目光浑浊，但焦距是准的：<span class="dialogue">“上场去。我等你回来再说。”</span></p><p>你没有走，一直坐到护士来换药。你走到门口时他好像睡着了，你听见他在背后说了一句很轻的话——<span class="dialogue">“踢给爸看。”</span></p>`,options:[option("承担治疗，拒绝灰色资金","现金-18万，家庭+15；意志+2",()=>{addMoney(s,-18);change(s,"family",15);gain(s,"WIL",2,"will")}),option("让父母接受保险与社会援助","家庭+8；声望-3",()=>{change(s,"family",8);change(s,"fame",-3)})]}),
  48:s=>({title:"18岁，转会市场开放",portrait:"assets/coach-zhou.webp",body:`周骁把你14岁时的训练表还给你。上面密密麻麻都是红圈。<span class="dialogue">“从今天起，没人再拿年轻当借口。想去更好的球队，就拿比赛说话。”</span>`,options:[option("把训练表折好收进包里","意志+2，教练信任+8",()=>{gain(s,"WIL",2,"will");change(s,"coachFavor",8)}),option("问他：我离最好的前锋还差什么","射门+1，传球+1；状态-2",()=>{gain(s,"SHO",1,"finish");gain(s,"PAS",1,"vision");change(s,"form",-2)})]})
};

function loveSupport(s){if(!["恋人","异地"].includes(s.relationship.status))return 0;const l=s.relationship.love;return l>=85?7:l>=65?5:l>=45?3:l>=25?1:0}
function poisson(lambda,rng=Math.random){let l=Math.exp(-Math.max(.08,lambda)),p=1,k=0;do{k++;p*=rng()}while(p>l&&k<9);return k-1}
function rndFloat(rng,min,max){return min+rng()*(max-min)}
function opponentPool(s){const c=currentClub(s);if(c.league==="英超")return PL_CLUBS.filter(x=>x.name!==c.name);if(s.club.league==="英超梯队")return PL_CLUBS.filter(x=>x.name!==s.club.name.replace(" U18","")).map(x=>({...x,name:`${x.name} U18`,strength:x.strength-11,league:"英超梯队"}));if(s.club.league==="中超梯队")return CSL_CLUBS.filter(x=>!s.club.name.includes(x.name)).map(x=>({...x,name:`${x.name} U16`,strength:x.strength-10,league:"中超梯队"}));if(s.club.league==="校园联赛")return CAMPUS_CLUBS.filter(x=>x.name!==s.club.name);return CSL_CLUBS.filter(x=>x.name!==c.name)}
/* 时间线文案分四档：goal=真的进了，assist=真的做成了助攻，near=这球做成了但没换来比分，fail=没做成。
   判定成功和转化成比分是两次掷骰，"成功"远多于"进球"——near 这一档就是给它们的，
   少了它就会出现比分没动、简报却在描述进球的矛盾。缺档时回落到 near：
   宁可把一脚好球说小，也不能凭空报一个记分牌上没有的进球。 */
const MATCH_ACTION_LINES={
  dribble:{
    assist:["边路连续变向甩开防守，倒三角回敲，队友推射空门。","在肋部加速穿过两人的缝隙，横敲给插上的队友一脚打进。"],
    near:["连续两次变向过掉边卫，最后的传中被回追的后腰挡了出去。","在肋部加速甩开盯防，等到起脚时角度已经被封死。"],
    fail:["试图从边路强行突破，被对手提前卡住线路。","第一脚触球稍大，突破机会被边后卫破坏。"]
  },
  finish:{
    goal:["禁区内抢到第二点，低射钻进远角！","反越位成功，冷静推射越过门将！"],
    near:["跟上第二点果断起脚，门将封住近角，球弹出底线。","反越位形成单刀，推射被出击的门将用腿挡下。"],
    fail:["获得单刀，但最后一脚擦着立柱偏出。","禁区前沿起脚，皮球被门将托出横梁。"]
  },
  header:{
    goal:["高高跃起压住中卫，头球砸进网窝！","后点冲顶改变方向，门将来不及反应！"],
    near:["高高跃起压住中卫，头球顶得很正，却被门将稳稳抱住。","后点冲顶蹭到方向，皮球贴着立柱滑出底线。"],
    fail:["抢到落点但头球高出，制空优势没有变成比分。","被中卫贴住身体，头球没有顶上力量。"]
  },
  setpiece:{
    goal:["任意球越过人墙急速下坠，直挂死角！","定位球弧线绕过人墙，门将只能目送入网！"],
    near:["任意球绕过人墙直奔死角，门将指尖把球托上横梁。","定位球送到了最危险的位置，禁区里却没人抢到第一点。"],
    fail:["任意球越过人墙，却被门将侧扑封出。","定位球打在人墙外侧，错过改写比分的机会。"]
  },
  pass:{
    assist:["回撤吸引防守后送出直塞，队友单刀推空门得手。","抢下第二点送出横传，队友完成破门。"],
    near:["直塞穿透了整条防线，队友的射门被门将挡了出来。","回撤接球后送出过顶球，队友抢点慢了半拍。"],
    fail:["想法很清楚，但直塞力量稍大滑出底线。","反击中传球慢了半拍，越位旗随即举起。"]
  }
};
function matchActionText(type,outcome){const rows=MATCH_ACTION_LINES[type]||MATCH_ACTION_LINES.finish;return pick(rows[outcome]||rows.near)}

/* ========== 赛前职责：常驻设置，强制三选一，不消耗执行点 ========== */
const MATCH_PLANS=[
  {id:"box",name:"专注禁区",icon:"◎",desc:"把自己钉在禁区里等球。进球率上去了，参与组织的机会就少了。",
   effects:["进球率↑","助攻率↓","依赖 SHO"]},
  {id:"deep",name:"回撤组织",icon:"▣",desc:"退到中场接球再前插。评分更稳，但离球门远了一点。",
   effects:["助攻率↑","评分更稳","依赖 PAS"]},
  {id:"press",name:"疯狂逼抢",icon:"»",desc:"从对方门将脚下就开始压。DEF 够高才压得住，球队更容易赢；不够就是白跑一趟，还掉体能。",
   effects:["依赖 DEF","体能↓↓","伤病↑"]}
];
function planOf(s){return MATCH_PLANS.find(p=>p.id===s.matchPlan)||MATCH_PLANS[0]}

/* ========== 关键时刻场景库 ==========
   stat=关键属性；risk="safe"|"none"|"bold"；style=命中则加流派经验；
   need=需要的流派二级解锁；on成功/失败的后果由 outcome 字段描述。       */
const MOMENT_RISK={safe:.08,none:0,bold:-.15};
const ATTR_OF={finish:"SHO",dribble:"DRI",header:"PHY",setpiece:"PAS",pass:"PAS"};
const MOMENTS=[
  {id:"counter_break",title:"反越位单刀",min:55,max:75,
   body:"第{minute}分钟，你贴着越位线启动，回身时已经甩开中卫两个身位。门将出击的角度还没站好——整座球场只剩你和他。",
   options:[
     {text:"冷静推射",tip:"成功率稳定，依赖射门",stat:"SHO",risk:"safe",style:"box",goal:true,up:.35,down:-.2,
      win:"你把重心压住，脚弓一推，皮球贴着草皮钻进远角。",fail:"你选了最稳的一脚，可惜球擦着立柱滑出底线。"},
     {text:"过掉门将",tip:"成功率低，成功后评分大涨，依赖盘带",stat:"DRI",risk:"bold",style:"burst",goal:true,up:.8,down:-.5,
      win:"你一个扣球晃倒门将，把球稳稳推进空门。看台先是安静了半秒，然后炸了。",fail:"你想多带一步，门将扑在你脚下把球没收。机会没了。"},
     {text:"横传队友",tip:"容易成功，可能获得助攻与教练信任",stat:"PAS",risk:"safe",style:"play",assist:true,up:.3,down:-.2,favor:2,
      win:"你没有贪功，一脚横敲，队友面对空门推空门。",fail:"传球慢了半拍，回追的后卫把线路封死。"},
     {text:"强行突破",tip:"爆点前锋Ⅱ · 硬吃门将，成功即进球",stat:"PAC",risk:"bold",style:"burst",need:"burst",goal:true,up:.9,down:-.45,
      win:"你根本没减速，用速度直接从门将身侧撞了过去，倒地之前把球捅进网窝。",fail:"你和门将撞在一起，球权和机会一起飞了。"}]},

  {id:"box_scramble",title:"禁区混战",min:20,max:85,cond:s=>s.matchPlan==="box"||styleOf(s,"box")>=1,
   body:"第{minute}分钟，角球开到近点，门将击球脱手。皮球在人堆里弹了两下，落点就在你身前一米。",
   options:[
     {text:"稳住等落点",tip:"依赖意志，稳但收益小",stat:"WIL",risk:"safe",style:"box",goal:true,up:.25,down:-.15,
      win:"你没有急着捅，等球落下来才推射，皮球从两条腿的缝里钻进球门。",fail:"你等得太久，后卫先一步把球捅出禁区。"},
     {text:"贴身垫射",tip:"依赖射门",stat:"SHO",risk:"none",style:"box",goal:true,up:.6,down:-.3,
      win:"你伸脚就捅，球从门将腋下滚进去。不好看，但进了。",fail:"你伸脚够到了球，方向却完全不对。"},
     {text:"做球给后插上",tip:"依赖传球",stat:"PAS",risk:"none",style:"play",assist:true,up:.3,down:-.2,
      win:"你用脚后跟一磕，后插上的队友迎球爆射。",fail:"你想做球，队友却没跟上你的想法。"},
     {text:"抢前点",tip:"禁区杀手Ⅱ · 抢在所有人之前",stat:"SHO",risk:"bold",style:"box",need:"box",goal:true,up:.85,down:-.35,
      win:"你比所有人都早半步冲到前点，脚尖一戳改变了球的方向。门将根本没反应过来。",fail:"你冲得太早，球从你身后飞了过去。"}]},

  {id:"wing_duel",title:"边路一对一",min:15,max:80,
   body:"第{minute}分钟，球在边线附近落到你脚下。防守你的边后卫压得很近，身后是大片空当。",
   options:[
     {text:"底线传中",tip:"依赖传球",stat:"PAS",risk:"safe",style:"play",assist:true,up:.3,down:-.2,
      win:"你把球送到底线，回敲的弧线正好绕过第一落点。",fail:"传中被前点的中卫解围。"},
     {text:"强行内切",tip:"依赖盘带，风险高",stat:"DRI",risk:"bold",style:"burst",goal:true,up:.7,down:-.4,
      win:"你连续两次变向切进肋部，起脚打远角。",fail:"第一脚触球稍大，边后卫提前卡住了线路。"},
     {text:"回做保球权",tip:"依赖意志，稳妥",stat:"WIL",risk:"safe",up:.15,down:-.1,
      win:"你把球稳稳回做，全队重新组织。教练在场边点了下头。",fail:"回做的球力量不够，被对手抢断。"}]},

  {id:"aerial_duel",title:"角球争顶",min:25,max:85,cond:s=>s.attrs.PHY>=60||styleOf(s,"target")>=1,
   body:"第{minute}分钟，角球旗附近，队友举手示意。你在禁区里找位置，身边的中卫比你高半个头。",
   options:[
     {text:"后点包抄",tip:"依赖身体",stat:"PHY",risk:"none",style:"target",goal:true,up:.55,down:-.2,
      win:"你绕到后点，几乎无人盯防，头球轻轻一蹭改变了方向。",fail:"你抢到了落点，头球却高出横梁。"},
     {text:"抢前点冲顶",tip:"依赖身体，风险高",stat:"PHY",risk:"bold",style:"target",goal:true,up:.8,down:-.25,
      win:"你从中卫身前挤了出去，高高跃起把球砸进网窝。",fail:"被中卫贴住身体，你没能顶上力量。"},
     {text:"做墙掩护",tip:"为队友创造空间",stat:"WIL",risk:"safe",style:"target",assist:true,up:.25,down:-.1,favor:2,
      win:"你把中卫牢牢挡在身后，队友从你身边跑出来完成攻门。",fail:"你的掩护被裁判判成推人。"}]},

  {id:"free_kick",title:"禁区前沿任意球",min:20,max:88,cond:s=>s.attrs.PAS>=55||hasTalent(s,"free_kick"),
   body:"第{minute}分钟，你在禁区前沿被放倒。人墙正在排，队友把球摆好，抬头看你。",
   options:[
     {text:"直接射门",tip:"依赖传球，风险高",stat:"PAS",risk:"bold",style:"box",goal:true,up:.9,down:-.3,
      win:"皮球越过人墙急速下坠，直挂死角。门将连动都没动。",fail:"球越过了人墙，却被门将侧扑封出。"},
     {text:"传中找中锋",tip:"依赖传球",stat:"PAS",risk:"none",style:"play",assist:true,up:.35,down:-.2,
      win:"你把弧线吊到后点，中锋高高跃起。",fail:"传球被人墙里冲出来的后卫解围。"},
     {text:"短传配合",tip:"依赖传球，稳妥",stat:"PAS",risk:"safe",style:"play",up:.15,down:-.1,
      win:"你和队友做了个短传二过一，虽然没进球，但全队的节奏起来了。",fail:"短传配合被对手识破。"}]},

  {id:"hold_up",title:"背身拿球",min:10,max:80,
   body:"第{minute}分钟，长传找到你。中卫从背后死死贴住，你的第一脚触球必须做决定。",
   options:[
     {text:"回敲组织",tip:"依赖传球",stat:"PAS",risk:"safe",style:"play",assist:true,up:.25,down:-.15,
      win:"你把球回敲给插上的中场，他一脚直塞撕开了防线。",fail:"回敲的力量不对，球被断在中场。"},
     {text:"扛住等支援",tip:"依赖身体，稳妥",stat:"PHY",risk:"safe",style:"target",up:.15,down:-.1,
      win:"你用身体把球护了整整六秒，直到两名队友跑到位。",fail:"你被顶得失去重心，球滚出边线。"},
     {text:"转身强突",tip:"依赖速度，风险高",stat:"PAC",risk:"bold",style:"burst",goal:true,up:.7,down:-.4,
      win:"你一个转身直接把中卫甩在原地，杀进禁区完成攻门。",fail:"你想转身，中卫的脚已经先一步伸到了球上。"},
     {text:"背身护球",tip:"支点中锋Ⅱ · 用身体做支点",stat:"PHY",risk:"safe",style:"target",need:"target",teamGoal:true,up:.3,down:-.1,favor:3,
      win:"你像一根钉子一样把中卫顶在身后，全队顺着你这个支点压了上来。",fail:"你护住了球，却被吹了个背身犯规。"}]},

  {id:"late_chase",title:"落后追分",min:78,max:88,forced:true,
   body:"第{minute}分钟，比分还落后。替补席已经站起来了一半人，主教练在场边挥手让全队压上。这可能是最后一次机会。",
   options:[
     {text:"组织最后一攻",tip:"依赖传球",stat:"PAS",risk:"none",style:"play",assist:true,up:.4,down:-.25,
      win:"你没有自己来，一脚过顶球找到了后点完全无人盯防的队友。",fail:"你想找人，但所有人都被盯死了。"},
     {text:"单点强攻",tip:"依赖射门，风险高",stat:"SHO",risk:"bold",style:"box",goal:true,up:1.2,down:-.4,
      win:"你在人堆里硬生生找到一个射门角度，皮球擦着门柱内侧进了。",fail:"你的射门被封堵，反弹出禁区。"},
     {text:"后插上远射",tip:"依赖传球，成功即经典",stat:"PAS",risk:"bold",style:"box",goal:true,classic:true,up:1.2,down:-.35,
      win:"三十米外，你没有任何犹豫地抡了一脚。球在空中划出一道下坠的弧线，砸在网窝上沿。",fail:"你抡了一脚，球飞进了看台。"}]},

  {id:"defend_lead",title:"领先保胜果",min:78,max:88,forced:true,
   body:"第{minute}分钟，你们还领先着。对手把中卫都压到了前场，场面越来越乱。",
   options:[
     {text:"回撤参与防守",tip:"依赖身体，教练最想看到的",stat:"PHY",risk:"safe",style:"target",up:.3,down:-.1,favor:4,fitCost:5,
      win:"你退到本方禁区前沿参与卡位，最后十分钟跑了整整两公里。教练在场边看着你。",fail:"你回撤了，但跑动已经跟不上节奏。"},
     {text:"打反击扩大比分",tip:"依赖速度",stat:"PAC",risk:"none",style:"burst",goal:true,up:.8,down:-.25,
      win:"抢断之后你一个人带球奔袭四十米，从容推射空门。",fail:"反击的最后一传被回追的后卫破坏。"},
     {text:"控球拖时间",tip:"依赖盘带",stat:"DRI",risk:"safe",style:"burst",up:.2,down:-.2,favor:2,
      win:"你在角旗区把球护得死死的，对手围了三个人也断不下来。",fail:"你想护球，却被断了个正着。"}]},

  {id:"press_trigger",title:"高位逼抢",min:10,max:70,cond:s=>s.matchPlan==="press",
   body:"第{minute}分钟，对方门将拿球准备开球。你已经启动了——这是你自己选的踢法。",
   options:[
     {text:"封堵传球线路",tip:"依赖传球",stat:"PAS",risk:"none",style:"play",assist:true,up:.3,down:-.15,favor:3,fitCost:5,
      win:"你切断了门将和后卫之间那条线，逼得他大脚开出，队友轻松拿到二点球。",fail:"你封错了方向，对手从你身后把球做了出去。"},
     {text:"上抢门将出球",tip:"依赖速度，风险高",stat:"PAC",risk:"bold",style:"burst",goal:true,up:1,down:-.3,fitCost:8,
      win:"你在门将出脚的瞬间把球封了下来，皮球弹进空门。全场哗然。",fail:"你扑了个空，对手就地打起反击。"},
     {text:"保留体力回位",tip:"依赖身体，稳妥",stat:"PHY",risk:"safe",up:.1,down:-.1,fitGain:4,
      win:"你判断这次抢不到，果断收住脚步慢跑回位，把力气留给下半场。",fail:"你回位慢了，防线被拉开一个口子。"}]},

  {id:"through_ball",title:"面向球门接球",min:15,max:80,cond:s=>s.matchPlan==="deep"||styleOf(s,"play")>=1,
   body:"第{minute}分钟，你在中圈附近拿球，第一次抬头就发现——对方防线压得很高，身后全是空当。",
   options:[
     {text:"稳妥横传",tip:"依赖传球，不冒险",stat:"PAS",risk:"safe",style:"play",up:.15,down:-.1,
      win:"你把球转移到另一侧，防线被扯动了一下。",fail:"横传力量不够，被中场拦下。"},
     {text:"自己带球推进",tip:"依赖盘带，风险高",stat:"DRI",risk:"bold",style:"burst",goal:true,up:.5,down:-.3,
      win:"你连过两人杀到禁区弧顶，起脚攻门。",fail:"你带球过半场，第三个人把你断了。"},
     {text:"直接远射",tip:"依赖射门，风险高",stat:"SHO",risk:"bold",style:"box",goal:true,up:.75,down:-.3,
      win:"你根本没往前带，抬脚就是一记三十米重炮，直挂上角。",fail:"你抡了一脚，球高出横梁很多。"},
     {text:"回撤直塞",tip:"组织型Ⅱ · 一脚打穿防线",stat:"PAS",risk:"none",style:"play",need:"play",assist:true,teamGoal:true,up:.6,down:-.2,
      win:"你回撤两步把中卫引出来，然后一脚贴地直塞穿过整条防线。队友单刀。",fail:"直塞的力量大了半分，滑出了底线。"}]}
];

function momentOptions(s,m){return m.options.filter(o=>!o.need||styleOf(s,o.need)>=2)}
function momentSuccessRate(s,m,o,opp,behind){
  let p=.35+(eff(s,o.stat)-opp)*.008+MOMENT_RISK[o.risk];
  if(hasTalent(s,"box_instinct")&&o.stat==="SHO")p+=.06;
  if(hasTalent(s,"explosive_start")&&(o.stat==="DRI"||o.stat==="PAC"))p+=.06;
  if(hasTalent(s,"aerial_king")&&o.stat==="PHY")p+=.08;
  if(hasTalent(s,"free_kick")&&o.stat==="PAS")p+=.1;
  if(hasTalent(s,"football_iq")&&o.stat==="PAS")p+=.05;
  if(hasTalent(s,"big_heart")&&behind)p+=.05;
  if(styleOf(s,"box")>=1&&o.stat==="SHO")p+=.05;
  if(styleOf(s,"burst")>=1&&(m.id==="counter_break"||m.id==="press_trigger"))p+=.06;
  if(styleOf(s,"box")>=3&&m.id==="late_chase"&&o.stat==="SHO")p+=.08;
  return clamp(p,.15,.85);
}
// 抽两个关键时刻：第一个偏上半场，第二个偏下半场。late_chase/defend_lead 只走强制路径。
function pickMoments(s,rng){
  const pool=MOMENTS.filter(m=>!m.forced&&(!m.cond||m.cond(s)));
  const weighted=m=>m.id==="aerial_duel"&&styleOf(s,"target")>=1?[m,m]:[m];
  const early=pool.filter(m=>m.min<=70).flatMap(weighted);
  const late=pool.filter(m=>m.max>=55).flatMap(weighted);
  const fallback=MOMENTS.find(m=>m.id==="wing_duel");
  const first=early.length?early[Math.floor(rng()*early.length)]:fallback;
  const lateOpts=late.filter(m=>m.id!==first.id);
  const second=lateOpts.length?lateOpts[Math.floor(rng()*lateOpts.length)]:fallback;
  return [first,second].map((m,i)=>({id:m.id,minute:i===0?Math.round(m.min+rng()*(Math.min(m.max,70)-m.min)):Math.round(Math.max(m.min,55)+rng()*(m.max-Math.max(m.min,55)))}));
}

/* prepareMatch 只产出纯 JSON 数据，不修改 s——这样整个待决状态可以直接存档。 */
function prepareMatch(s,rng=Math.random,opts={}){
  const club=currentClub(s),opp=opts.opponent||pick(opponentPool(s));
  const a=ageInfo(s),home=opts.home??rng()>.48,injured=s.injury.months>0||s.suspension>0;
  const plan=opts.plan||s.matchPlan||"box";
  const starts=!injured&&rng()<startChance(s,{club}),plays=!injured&&(starts||rng()<.74+(hasTalent(s,"super_sub")?.15:0));
  const role=starts?"首发":plays?"替补":"未出场";
  const talentBonus=(hasTalent(s,"big_heart")&&opts.important?4:0)+(hasTalent(s,"home_favorite")&&home?3:0)+(hasTalent(s,"super_sub")&&!starts&&plays?4:0)+(hasTalent(s,"final_master")&&opts.final?5:0);
  const myAtk=atk(s)+talentBonus+rndFloat(rng,-12,12),myDef=def(s);
  let clubEdge=(club.strength-opp.strength)+(home?3:-2);
  if(plays)clubEdge+=(myAtk-club.strength)*.14+(myDef-club.strength)*.06;
  if(plan==="press")clubEdge+=(myDef-55)*.10;
  if(styleOf(s,"play")>=3)clubEdge+=2;
  const myXg=clamp(1.25+clubEdge/18,0.25,3.6),oppXg=clamp(1.12-clubEdge/22,0.25,3.3);
  let gf=poisson(myXg,rng),ga=poisson(oppXg,rng);
  if(opts.mustDecide&&gf===ga){if(rng()<.5)gf++;else ga++}
  const timeline=[{minute:5,text:home?"主场看台先把节奏推了起来。":"客场开局，对手试图用高压逼抢制造错误。",kind:"turn"}];
  let goals=0,assists=0,keyWins=0,failures=0;
  const goalBonus=plan==="box"?.08:plan==="deep"?-.06:0;
  const assistBonus=(plan==="deep"?.1:plan==="box"?-.1:0)+(styleOf(s,"play")>=1?.08:0);
  if(plays){
    const minuteStart=starts?8:rand(55,68);
    const attempts=Math.max(1,(starts?rand(4,6):rand(2,4))-2);   // 留两个名额给关键时刻
    const types=plan==="box"?["finish","finish","dribble","finish"]:["dribble","finish","pass","finish"];
    if(hasTalent(s,"aerial_king"))types.push("header","header");else types.push("header");
    if(hasTalent(s,"free_kick")||s.attrs.PAS>68)types.push("setpiece");
    for(let i=0;i<attempts;i++){
      const type=types[Math.floor(rng()*types.length)],stat=eff(s,ATTR_OF[type]||"SHO");
      let p=.25+(stat-45)/90+talentBonus/100;
      if(type==="finish"&&hasTalent(s,"box_instinct"))p+=.09;if(type==="header"&&hasTalent(s,"aerial_king"))p+=.13;if(type==="setpiece"&&hasTalent(s,"free_kick"))p+=.16;if(type==="dribble"&&hasTalent(s,"explosive_start"))p+=.08;
      const success=rng()<clamp(p,.16,.88);if(success)keyWins++;else failures++;
      const isGoal=success&&["finish","header","setpiece"].includes(type)&&goals<gf&&rng()<clamp(.38+(eff(s,"SHO")-52)/100+goalBonus,.28,.82);
      const isAssist=success&&["pass","dribble"].includes(type)&&assists+goals<gf&&rng()<clamp(.26+(eff(s,"PAS")-45)/150+assistBonus,.18,.63);
      const minute=Math.min(88,Math.round(minuteStart+i*(80-minuteStart)/attempts+rndFloat(rng,0,6)));
      if(isGoal){goals++;timeline.push({minute,text:matchActionText(type,"goal"),kind:"goal"})}
      else if(isAssist){assists++;timeline.push({minute,text:`助攻：${matchActionText(type,"assist")}`,kind:"good"})}
      else timeline.push({minute,text:matchActionText(type,success?"near":"fail"),kind:success?"good":"turn"});
    }
  }else timeline.push({minute:62,text:injured?"你在看台上观看比赛，康复计划没有允许冒险。":"教练完成最后一次换人，你仍留在替补席。",kind:"bad"});
  let injuryChance=plays?Math.max(.005,(.016+(45-s.fitness)/500+(s.injury.risk||0)/900-(hasTalent(s,"iron_man")?.015:0))*diffOf(s).injury*assetInjuryFactor(s)):0;
  if(plan==="press")injuryChance*=1.6;
  return {opponent:opp.name,oppStrength:opp.strength,club:club.name,league:club.league,home,starts,plays,role,injured,
    clubEdge,gf,ga,goals,assists,keyWins,failures,timeline,plan,assistBonus,
    injuredInMatch:rng()<injuryChance,
    moments:plays?pickMoments(s,rng):[],choices:[],
    month:s.totalMonth,season:a.season,round:(s.seasonStats.matches||0)+1,
    competition:opts.competition||`${club.league}第${(s.seasonStats.matches||0)+1}轮`,
    ability:Math.round(overall(s)),condition:Math.round((s.form+s.fitness)/2),randomShown:Math.round(rndFloat(rng,1,100))};
}

/* finishMatch 结算已作答的关键时刻，未作答的按稳妥选项自动判定。同样不修改 s。 */
function finishMatch(s,pending,rng=Math.random){
  const p={...pending,timeline:pending.timeline.slice()};
  let ratingDelta=0,boldTotal=0,boldWon=0,classic=false,fitExtra=0,favorExtra=0,overflow=0;
  // 关键时刻的进球必须挂进球队比分：先认领模型已经算出来的进球。
  // 只有高风险选择才能创造球队 xG 之外的进球，每场至多一个——
  // 稳妥选择只是把已有的机会转化掉，不该凭空把比分吹上天。
  const claimGoal=bold=>{if(p.goals<p.gf){p.goals++;return true}if(bold&&overflow<1){overflow++;p.gf++;p.goals++;return true}return false};
  const claimAssist=bold=>{if(p.goals+p.assists<p.gf){p.assists++;return true}if(bold&&overflow<1){overflow++;p.gf++;p.assists++;return true}return false};
  p.moments.forEach((slot,i)=>{
    const m=MOMENTS.find(x=>x.id===slot.id);if(!m)return;
    const opts=momentOptions(s,m);
    const choiceIdx=p.choices[i];
    const o=opts[choiceIdx]!==undefined?opts[choiceIdx]:opts.find(x=>x.risk==="safe")||opts[0];
    const behind=p.gf<p.ga;
    const ok=rng()<momentSuccessRate(s,m,o,p.oppStrength,behind);
    if(o.risk==="bold")boldTotal++;
    if(ok){
      boldWon+=o.risk==="bold"?1:0;p.keyWins++;
      let up=o.up,denied=false;
      const bold=o.risk==="bold";
      if(o.goal){
        if(claimGoal(bold)){
          if(styleOf(s,"box")>=3&&m.id==="late_chase"&&o.stat==="SHO")up+=.3;
          if(styleOf(s,"burst")>=3&&o.stat==="DRI"&&rng()<.12&&claimGoal(bold))
            p.timeline.push({minute:Math.min(89,slot.minute+2),text:"过掉人之后你顺势又补了一脚——这球也进了。",kind:"goal"});
        }else denied=true;
      }else if(o.assist&&!claimAssist(bold))denied=true;
      if(!denied&&(o.teamGoal||(styleOf(s,"target")>=3&&o.style==="target"))&&overflow<1&&rng()<.45){
        overflow++;p.gf++;
        p.timeline.push({minute:Math.min(89,slot.minute+1),text:"你做的球被队友转化成了进球。",kind:"goal"});
      }
      if(o.classic&&!denied)classic=true;
      if(denied)up*=.5;
      ratingDelta+=up;favorExtra+=o.favor||0;fitExtra+=(o.fitGain||0)-(o.fitCost||0);
      if(o.style)addStyleExp(s,o.style,5);
      p.timeline.push({minute:slot.minute,
        text:denied?`【${o.text}】${o.goal?"你完成了这次攻门，但球在门线前被解围，比分没有变化。":"你把球做到位了，队友却没能把它转化成进球。"}`:`【${o.text}】${o.win}`,
        kind:denied?"turn":o.goal?"goal":"good"});
    }else{
      p.failures++;
      ratingDelta+=o.down*(hasTalent(s,"pressure_proof")?.5:1);
      fitExtra-=(o.fitCost||0)+3;
      p.timeline.push({minute:slot.minute,text:`【${o.text}】${o.fail}`,kind:"turn"});
      if(o.risk==="bold"&&rng()<.35){p.ga++;
        p.timeline.push({minute:Math.min(89,slot.minute+2),text:"丢球之后对手立刻打起反击，我们的防线还没站好——他们扳回一球。",kind:"bad"})}
    }
  });
  if(p.injuredInMatch)p.timeline.push({minute:rand(63,87),text:"一次对抗后你没有立刻站起来，队医示意换人。",kind:"bad"});
  p.timeline.push({minute:90,text:`终场：${p.club} ${p.gf}-${p.ga} ${p.opponent}。`,kind:p.gf>p.ga?"goal":p.gf<p.ga?"bad":"turn"});
  p.timeline.sort((x,y)=>x.minute-y.minute);
  const jitter=p.plan==="deep"?rndFloat(rng,-.30,.30):rndFloat(rng,-.48,.48);
  const rating=p.plays?clamp(6.05+p.goals*.92+p.assists*.55+p.keyWins*.11-p.failures*.07+ratingDelta+jitter,4.7,10):0;
  // 经典要稀有才叫经典：单场9分以上，或两次关键时刻都选了高风险且都成功。
  if(rating>=9||(boldTotal>=2&&boldWon===boldTotal))classic=true;
  return {id:`m${Date.now()}${Math.random()}`,month:p.month,season:p.season,round:p.round,competition:p.competition,
    club:p.club,opponent:p.opponent,home:p.home,role:p.role,gf:p.gf,ga:p.ga,goals:p.goals,assists:p.assists,
    rating:Number(rating.toFixed(1)),timeline:p.timeline,injured:p.injuredInMatch,plan:p.plan,
    classic:p.plays&&classic,fitExtra:(p.plan==="press"?-6:0)+fitExtra,favorExtra,
    model:{ability:p.ability,condition:p.condition,random:p.randomShown,clubEdge:Math.round(p.clubEdge)}};
}

// 非交互包装器：国家队/未出场/测试统计都走这里，签名与返回结构保持不变。
function simulateMatchCore(s,rng=Math.random,opts={}){
  return finishMatch(s,prepareMatch(s,rng,opts),rng);
}

function applyMatch(s,report){
  const pp=hasTalent(s,"pressure_proof")?.5:1;
  s.matches.unshift(report);s.matches=s.matches.slice(0,60);if(report.role==="未出场"){if(!(s.injury.months>0||(s.suspension||0)>0))change(s,"form",Math.round(-1.8*pp));return}
  const c=s.statsCareer,ss=s.seasonStats;c.matches++;ss.matches++;if(report.role==="首发")c.starts++;c.goals+=report.goals;c.assists+=report.assists;ss.goals+=report.goals;ss.assists+=report.assists;ss.ratingTotal+=report.rating;
  // 一场球只结算一次状态：胜负和个人表现合并成一笔，别对同一场比赛的 form 连开两枪。
  let dForm;if(report.gf>report.ga){c.wins++;ss.wins++;dForm=5}else if(report.gf===report.ga){c.draws++;dForm=1}else{c.losses++;dForm=Math.round(-4*pp)}
  c.bestRating=Math.max(c.bestRating,report.rating);if(report.goals>=3){c.hatTricks++;unlock("hat_trick")};if(report.goals>0)unlock("first_goal");unlock("debut");if(c.goals>=50)unlock("fifty_goals");if(c.goals>=100)unlock("hundred_goals");if(c.assists>=50)unlock("fifty_assists");
  change(s,"fame",report.goals*1.3+report.assists*.7+(report.rating>=8?2:0));change(s,"fitness",-(hasTalent(s,"engine")?8:12)+(report.fitExtra||0));change(s,"form",dForm+(report.rating>=7?2:Math.round(-1.2*pp)));change(s,"coachFavor",(report.rating>=7.5?4:report.rating<6?-3:1)+(report.favorExtra||0));
  if(report.classic)unlock("classic_match");
  if(report.injured)sufferInjury(s,rand(1,4));
  log(s,report.gf>report.ga?"good":report.gf<report.ga?"bad":"story",`${report.competition}：${report.club} ${report.gf}-${report.ga} ${report.opponent}。你${report.role}，${report.goals}球${report.assists}助，评分${report.rating||"—"}。`)
}

function routeChoice16(s){
  const d=diffOf(s),o=overall(s),eligibleLocal=o>=63+d.threshold||s.fame>=44+d.threshold,eligibleOverseas=o>=72+d.threshold||(o>=68+d.threshold&&hasTalent(s,"scout_magnet"));
  const options=[];
  if(eligibleLocal)options.push(option("签下重庆铜梁龙一线队合同","留在国内，与小满继续交往；竞争、工资和家庭压力同时开始",()=>setRoute(s,"firstteam")));
  if(eligibleOverseas)options.push(option("接受 Manchester United U18 邀请","更高平台与成长上限；立即出国，与小满转为异地",()=>setRoute(s,"overseas"),"gold"));
  options.push(option(eligibleLocal?"放弃职业合同，回校园":"接受落选，回到校园","与小满留在一起，学业更稳定；18岁仍可通过校队试训重返职业",()=>setRoute(s,"campus")));
  return{title:eligibleOverseas?"三扇门，只能走进一扇":eligibleLocal?"一纸合同，和另一种生活":"一线队名单上没有你的名字",portrait:eligibleOverseas?"assets/lin-xiaoman.webp":"assets/coach-zhou.webp",body:`<p>16岁评估：综合能力 <b>${o}</b>，声望 <b>${Math.round(s.fame)}</b>，教练信任 <b>${Math.round(s.coachFavor)}</b>。${eligibleOverseas?"英格兰豪门梯队给出邀请，但不接受远程报到。小满没有哭，只问你是否已经决定。":eligibleLocal?"俱乐部给出一份低薪青年合同。校园与职业的路从今天开始分开。":"周骁说你的成长还没有结束，但俱乐部不能为“也许”保留位置。"}</p><p>你爸没有替你做决定，只在饭桌上说了一句：<span class="dialogue">“自己选。选完别回头。”</span>小满什么也没说，只在你出门时把一包葱油味饼干塞进你书包——你最喜欢的那种。</p>`,options}
}
function setRoute(s,route){s.route=route;s.flags.route16=true;if(route==="firstteam"){s.club={name:"重庆铜梁龙",league:"中超",strength:67};s.salary=4;s.relationship.status="恋人";addMoney(s,5);change(s,"fame",5);log(s,"story","你升入重庆铜梁龙一线队，与小满留在同一座城市。")}
  if(route==="overseas"){s.club={name:"Manchester United U18",league:"英超梯队",strength:74};s.salary=3;s.relationship.status="异地";s.language=clamp(s.language+5);change(s,"fame",8);change(s,"form",-2);log(s,"story","你飞往英格兰的青训营。临行前你和小满约好试试异地，谁也没提“分手”——从此隔着七个小时的时差。")}
  if(route==="campus"){s.club={name:"重庆市第七中学校队",league:"校园联赛",strength:55};s.salary=0;s.relationship.status="恋人";changeLove(s,8);log(s,"story","你回到校园。小满坐在你旁边，但她要求你不要把她当作放弃职业的理由。")}}

function enterProAt18(s){if(s.flags.pro18)return;s.flags.pro18=true;
  if(s.route==="overseas"){const promote=overall(s)>=73+diffOf(s).threshold&&s.language>=35;s.club=promote?{name:"Manchester United",league:"英超",strength:85}:{name:"Hull City",league:"英超",strength:73};s.salary=promote?22:10;s.route="pro";if(s.club.league==="英超")unlock("premier");log(s,"story",promote?"你得到英超一线队合同。平台更大，容错更小。":"豪门没有给出一线队位置，Hull City 提供了真正的职业比赛。")}
  else if(s.route==="firstteam"){s.route="pro";s.club={name:"重庆铜梁龙",league:"中超",strength:67};s.salary=7;log(s,"story","18岁，你不再占用青年名额。俱乐部开始用成年人的标准衡量你。")}
  else{const d=diffOf(s),success=overall(s)>=61+d.threshold||s.fame>=93+d.threshold;s.route="pro";s.relationship.status="恋人";
    if(!success&&d.threshold>=5&&overall(s)<54+d.threshold){s.flags.washedOut=true;log(s,"bad","一圈职业试训下来，没有一家队愿意签你。绿茵这条路，到此为止。");return}
    const club=success?{name:"重庆铜梁龙",league:"中超",strength:67}:{name:"辽宁铁人",league:"中超",strength:65};s.club=club;s.salary=success?6:4;
    enqueueDecision({title:"18岁 · 迟到两年的试训",portrait:"assets/coach-zhou.webp",body:`<p>你两年没摸过职业训练的节奏了。校园联赛的强度跟梯队完全是两个世界，你自己知道。这封试训邀请是你争取来的——你剪了自己的比赛录像发出去，只有${esc(club.name)}回了一个字：来。</p><p>你背着包走进训练基地。路过一号场时，一线队在打对抗，球速比你习惯的快很多。你停了一步，然后继续走。看台上，小满和父亲都来了。</p><p>三号场的教练看了你一眼，把手里的名单翻了一页——上面印着十几个试训球员的名字。<span class="dialogue">${success?"“绕了两年，你还是挤了回来。这回，站稳了。”":"“不是最风光的起点，但你终于重新站上了职业赛场。”"}</span></p>`,options:[option("握紧这次机会","职业生涯正式开始",()=>{})]},"18岁 · 重返职业");
    log(s,"story",success?`校队踢了两年，你在18岁赢得试训并重返${club.name}。`:`一次次试训后，${club.name}给了你一纸轮换合同，你绕远路回到了职业足球。`)}
  generateOffers(s,2)
}

function generateOffers(s,count=2,upgrade=false){if(ageInfo(s).age<18&&!s.flags.pro18)return[];const o=overall(s),current=currentClub(s);let pool=[...CSL_CLUBS,...PL_CLUBS].filter(c=>c.name!==current.name);pool=pool.filter(c=>{if(c.league==="英超"&&o<76+diffOf(s).threshold&&!hasTalent(s,"scout_magnet"))return false;if(upgrade&&c.strength<=current.strength)return false;return Math.abs(c.strength-(o+5))<=18});if(!pool.length)pool=[...CSL_CLUBS].filter(c=>c.name!==current.name);pool=pool.sort(()=>Math.random()-.5).slice(0,count);s.offers=pool.map(c=>({id:`o${Date.now()}${Math.random()}`,club:c.name,league:c.league,strength:c.strength,role:o>=c.strength+2?"核心":o>=c.strength-5?"轮换":"替补竞争",salary:Math.max(8,Math.round((c.strength-55)*1.4+s.fame/8)),fee:Math.max(120,Math.round((o-50)*38+s.fame*8)),months:2}));return s.offers}
function acceptOffer(s,id){const offer=s.offers.find(o=>o.id===id);if(!offer)return;const from=s.club.name;s.club={name:offer.club,league:offer.league,strength:offer.strength};s.salary=offer.salary;s.transfers.unshift({month:s.totalMonth,from,to:offer.club,fee:offer.fee,role:offer.role});const cut=s.agent?s.agent.cut/100:0;addMoney(s,Math.round((offer.salary*.8+offer.fee*.05)*(1-cut)));if(cut)log(s,"story",`经纪人按${s.agent.cut}%抽成，签约金到手打了折。`);s.flags.wantsMove=false;s.offers=[];change(s,"coachFavor",offer.role==="核心"?65-s.coachFavor:50-s.coachFavor);change(s,"fame",offer.league==="英超"?10:4);if(offer.league==="英超")unlock("premier");log(s,"story",`转会完成：${from} → ${offer.club}，角色为${offer.role}。`);if(s.route==="pro"&&ageInfo(s).age>=18){makeSeasonGoal(s);if(s.seasonGoal)log(s,"story",`新东家给了新的赛季目标：${s.seasonGoal.text}。`)}}

function nationalSelectionCheck(s){if(s.national.called||ageInfo(s).age<18)return false;const avg=s.seasonStats.matches?s.seasonStats.ratingTotal/s.seasonStats.matches:0;const threshold=(hasTalent(s,"red_shirt")?71:74)+diffOf(s).threshold;if(overall(s)>=threshold&&avg>=6.7+diffOf(s).threshold*.02){s.national.called=true;s.national.adapt=35;unlock("national");log(s,"story","中国国家队征召函抵达俱乐部。父亲把那张截图保存了三次。") ;return true}return false}
function simulateNationalMatch(s,rng=Math.random,worldCup=false){const opp=pick(NATIONAL_OPPONENTS),player=overall(s),china=70+(player-70)*.45+(s.national.adapt||0)*.05+(hasTalent(s,"red_shirt")?2:0),edge=china-opp.strength+rndFloat(rng,-9,9),gf=poisson(clamp(1.1+edge/18,.2,3.2),rng),ga=poisson(clamp(1.15-edge/22,.2,3.1),rng),goals=gf>0&&rng()<clamp(.28+(player-65)/85,.2,.72)?Math.min(gf,rng()<.16?2:1):0,assists=gf-goals>0&&rng()<.32?1:0,report={opponent:opp.name,gf,ga,goals,assists,worldCup};s.national.caps++;s.statsCareer.nationalCaps++;s.national.goals+=goals;s.statsCareer.nationalGoals+=goals;if(goals)unlock("national_goal");change(s,"fitness",-12);change(s,"fame",goals*3+(gf>ga?2:0));log(s,gf>ga?"good":gf<ga?"bad":"story",`国家队${gf}-${ga}${opp.name}。你贡献${goals}球${assists}助。`);return report}

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

/* ========== 三场挑战：赛季目标之下的短反馈层，16岁起开启 ========== */
const CHALLENGE_TIERS=[
  {tier:"steady",name:"稳妥目标",tone:"",reward:"教练信任+4，状态+3",
   goals:[{kind:"avgRating",target:6.8,text:"三场平均评分达到6.8"},
          {kind:"starts",target:2,text:"至少两场获得首发"},
          {kind:"noLow",target:6,text:"三场都不出现低于6分的评分"}],
   win:s=>{change(s,"coachFavor",4);change(s,"form",3);return"教练信任+4，状态+3"},
   lose:s=>{change(s,"form",-2);return"状态-2"}},
  {tier:"attack",name:"进攻目标",tone:"gold",reward:"声望+3，教练信任+6，奖金",
   goals:[{kind:"contrib",target:2,text:"三场制造2个进球"},
          {kind:"keyGoal",target:1,text:"至少打进1个关键进球"},
          {kind:"braceGA",target:1,text:"完成一次单场传射"}],
   win:s=>{change(s,"fame",3);change(s,"coachFavor",6);const b=Math.max(5,Math.round((s.salary||4)*1.5));addMoney(s,b);return`声望+3，教练信任+6，奖金${b}万`},
   lose:s=>{change(s,"form",-3);return"状态-3"}},
  {tier:"daring",name:"冒险目标",tone:"danger",reward:"声望+6，教练信任+10，高额奖金与流派经验",
   goals:[{kind:"goals",target:3,text:"三场打进3球"},
          {kind:"highRating",target:8.5,text:"至少获得一次8.5分"},
          {kind:"winStreak",target:3,text:"帮助球队取得三连胜"}],
   win:s=>{change(s,"fame",6);change(s,"coachFavor",10);const b=Math.max(12,Math.round((s.salary||4)*3));addMoney(s,b);const t=topStyle(s);if(t)addStyleExp(s,t,15);return`声望+6，教练信任+10，奖金${b}万`},
   lose:s=>{change(s,"form",-4);return"状态-4"}}
];
function newChallengeAcc(){return{ratings:[],starts:0,goals:0,assists:0,keyGoals:0,braces:0,wins:0,best:0}}
function challengeMet(c){
  const a=c.acc,avg=a.ratings.length?a.ratings.reduce((x,y)=>x+y,0)/a.ratings.length:0;
  switch(c.kind){
    case"avgRating":return avg>=c.target;
    case"starts":return a.starts>=c.target;
    case"noLow":return a.ratings.length>0&&a.ratings.every(r=>r>=c.target);
    case"contrib":return a.goals+a.assists>=c.target;
    case"keyGoal":return a.keyGoals>=c.target;
    case"braceGA":return a.braces>=c.target;
    case"goals":return a.goals>=c.target;
    case"highRating":return a.best>=c.target;
    case"winStreak":return a.wins>=c.target;
  }
  return false;
}
function challengeProgressText(c){
  const a=c.acc,avg=a.ratings.length?(a.ratings.reduce((x,y)=>x+y,0)/a.ratings.length).toFixed(1):"—";
  switch(c.kind){
    case"avgRating":return`当前均分 ${avg}`;
    case"starts":return`首发 ${a.starts}/${c.target}`;
    case"noLow":return a.ratings.length?`已过 ${a.ratings.length} 场，未失手`:"尚未出场";
    case"contrib":return`${Math.min(a.goals+a.assists,c.target)}/${c.target}`;
    case"keyGoal":return`${Math.min(a.keyGoals,c.target)}/${c.target}`;
    case"braceGA":return`${Math.min(a.braces,c.target)}/${c.target}`;
    case"goals":return`${Math.min(a.goals,c.target)}/${c.target}`;
    case"highRating":return`最高 ${a.best?a.best.toFixed(1):"—"} / ${c.target}`;
    case"winStreak":return`连胜 ${a.wins}/${c.target}`;
  }
  return"";
}
function challengeBannerText(c){return`教练挑战：${c.text}\n进度：${challengeProgressText(c)}｜剩余${Math.max(0,3-c.played)}场`}
// 只有真正出场的比赛才消耗挑战场次——伤停和坐板凳不该把挑战耗光。
function challengeProgress(s,report){
  const c=s.challenge;if(!c||report.role==="未出场")return;
  const a=c.acc;
  a.ratings.push(report.rating);
  if(report.role==="首发")a.starts++;
  a.goals+=report.goals;a.assists+=report.assists;
  a.best=Math.max(a.best,report.rating);
  if(report.goals>=1&&report.assists>=1)a.braces++;
  if(report.goals>0&&(report.timeline.some(t=>t.kind==="goal"&&t.minute>=75)||Math.abs(report.gf-report.ga)<=1))a.keyGoals++;
  if(report.gf>report.ga)a.wins++;
  c.played++;
  if(c.played>=3)settleChallenge(s);
}
function settleChallenge(s){
  const c=s.challenge;if(!c)return;
  const tier=CHALLENGE_TIERS.find(t=>t.tier===c.tier),met=challengeMet(c);
  const effect=met?tier.win(s):tier.lose(s);
  log(s,met?"good":"warn",met?`完成教练挑战（${c.text}）：${effect}。`:`没完成教练挑战（${c.text}）：${effect}。教练没多说什么。`);
  enqueueDecision({title:met?"教练挑战达成":"教练挑战未完成",
    body:`<p>${esc(c.text)}</p><p>最终进度：<b>${esc(challengeProgressText(c))}</b></p><p>${met?`兑现奖励：<b>${esc(effect)}</b>`:`代价：<b>${esc(effect)}</b>。信任没有额外扣减——下一轮重新来过。`}</p>`,
    options:[option(met?"收下":"知道了","",()=>{})]},"三场挑战");
  s.challenge=null;
}
function queueChallengeChoice(s){
  const picks=CHALLENGE_TIERS.map(t=>({def:t,goal:pick(t.goals)}));
  enqueueDecision({title:"教练给了你未来三场的目标",
    body:`<p>周期是三场比赛——只有你真正出场的比赛才算数，伤停不会消耗场次。</p><p class="dialogue">“别跟我谈赛季。先把接下来三场踢明白。”</p>`,
    options:picks.map(p=>option(`${p.def.name}：${p.goal.text}`,p.def.reward,
      ()=>{s.challenge={id:`c${Date.now()}${Math.random().toString(36).slice(2,5)}`,tier:p.def.tier,kind:p.goal.kind,target:p.goal.target,text:p.goal.text,played:0,acc:newChallengeAcc()};
           log(s,"story",`接下未来三场的教练挑战：${p.goal.text}。`)},p.def.tone))},"三场挑战");
}
function seasonAwardCheck(s,rng=Math.random){const ss=s.seasonStats,avg=ss.matches?ss.ratingTotal/ss.matches:0,score=overall(s)*.48+ss.goals*1.15+ss.assists*.65+ss.trophies*7+(s.club.league==="英超"?6:0)+(s.national.goals||0)*.25+avg*1.6+rndFloat(rng,-5,6),ballon=score>=92+diffOf(s).threshold*1.5,leagueTitle=ss.matches>=7&&ss.wins/ss.matches>=.7&&overall(s)>=currentClub(s).strength-2&&rng()<.48-diffOf(s).threshold*.02;
  if(leagueTitle){const title=`${s.club.league}冠军`;s.honours.unshift({title,season:ageInfo(s).season,icon:"♛",detail:s.club.name});ss.trophies++;unlock("league_title")}
  if(ballon){s.awards.unshift({title:"金球奖",season:ageInfo(s).season,score:Math.round(score)});s.honours.unshift({title:"金球奖",season:ageInfo(s).season,icon:"●",detail:`评选指数 ${Math.round(score)}`});unlock("ballon");change(s,"fame",15)}
  const result={score:Math.round(score),ballon,leagueTitle,avg:Number(avg.toFixed(1)),goals:ss.goals,assists:ss.assists};s.lastSeasonAward=result;s.seasonStats={matches:0,goals:0,assists:0,wins:0,ratingTotal:0,trophies:0};updateRanking(s);return result}

function careerScore(s){const c=s.statsCareer;return Math.round(overall(s)*18+c.goals*24+c.assists*15+c.nationalGoals*30+s.honours.length*140+s.awards.length*220+s.fame*5+(s.money||0)*2+assetValue(s)*2-(s.debt||0)*6-(s.flags.bettingEver?420:0))}
function applyAging(s){const d=diffOf(s),age=ageInfo(s).age;if(age<d.decayAge)return;const yrs=age-d.decayAge+1,m=d.soft;const drop=base=>Math.max(0,(base+yrs*.7)*m*rndFloat(Math.random,.6,1.3));
  s.attrs.PAC=clamp(s.attrs.PAC-drop(1.55),1,99);s.attrs.PHY=clamp(s.attrs.PHY-drop(.6),1,99);
  if(yrs>=3)s.attrs.DRI=clamp(s.attrs.DRI-drop(.9),1,99);
  s.attrs.WIL=clamp(s.attrs.WIL+.4,1,99);
  log(s,"story",`${age}岁，身体开始走下坡路，你越来越靠经验和跑位吃饭。`)}
function shouldRetire(s){const d=diffOf(s),age=ageInfo(s).age;if(s.flags&&s.flags.washedOut)return"washout";if(age>=d.retireAge)return"age";if(age>=d.decayAge+2&&overall(s)<48)return"decline";if(age>=d.decayAge&&(s.suspension||0)>=18)return"banned";return null}
function endingGrade(s){const c=s.statsCareer,peak=s.peakOverall||overall(s);if(s.flags.gamblingRuined)return{tier:"涉赌禁赛",line:"终场哨响在调查结果公布那天，不是在球场上。你坐在一张没有铺桌布的桌子前，对面的人问：<span class='dialogue'>“最后再确认一次——你认识这个号码吗？”</span>你认识。你一直认识，只是花了十几年假装不认识。<br><br>你没有回答，但你的沉默本身就是回答。门关上之前你想打一个电话——你爸、小满、周骁——但号码拨出去之前你就知道，他们不会接了。不是不想接，是你从来没给过他们接的理由。你挂了电话，把手机放在桌上。门关上了，灯灭了。"};if(s.awards.length&&s.national.worldCups&&s.honours.some(h=>h.title==="世界杯冠军"))return{tier:"传奇",line:"你把中国前锋的名字写进了世界杯的历史。最后一球踢完那天你没有哭，只绕着球场走了一圈，摸了一下每根门柱。<br><br>回到更衣室，你从包底拿出那块泛黄的旧足球皮——塞在包里十几年了，你从没跟任何人说过它的来历。你把它重新放回去，拉上拉链。走出去时，看台上还有最后一盏灯没关。"};
  if(s.awards.length||peak>=88)return{tier:"巨星",line:"你站上过这项运动的最高处。数据、奖杯和那些逆转之夜，足够被反复讲很多年。"};
  if(c.goals>=100||s.honours.length>=2||peak>=82)return{tier:"顶级职业球员",line:"你没成为唯一的主角，但踢了很多年。最后一场不是什么决赛，就是一场普通的联赛，你踢了75分钟被换下，下场时拍了拍替补你的人的背。<br><br>你把那双旧球鞋放进纸袋里——没有扔，只是不再穿了。走出基地大门时你回头看了一眼，保安大爷换了人，不认识你，问你找谁。你说：<span class='dialogue'>“不找谁，走错了。”</span>"};
  if(c.matches>=60||peak>=72)return{tier:"合格职业球员",line:"你靠自律和不服输熬过了一次次替补和伤病。退役的消息只在本地媒体发了一条豆腐块大小的简报，最后一场你坐在替补席上没有上场。<br><br>终场哨响时你站起来，跟每一个队友击了掌。教练拍拍你的肩膀说“不容易”。走出体育场时天已经黑了，那根你踢了二十年的铁丝网，在夜色里几乎看不见了。"};
  if(c.matches>0)return{tier:"短暂的职业生涯",line:"职业足球没给你太多时间，但你确实站上过那片草皮。退役发布会只开了十五分钟，最后一个问题是“如果重来一次，你还会踢球吗”，你沉默三秒说“会的”，但没有人看你的眼睛。<br><br>你留了一件训练服挂在柜子里，没有带走。它后来被保洁收走了，没有人会知道它是谁的。"};
  return{tier:"未竟的绿茵梦",line:"你没能真正踢进职业赛场，但那只旧足球陪你走过的日子，不会因此作废。"}}
function buildEnding(s){const c=s.statsCareer,a=ageInfo(s),g=endingGrade(s),love=s.relationship.status;
  const loveEnd=love==="恋人"?`你回到家的时候厨房灯亮着，餐桌上放着一碗绿豆汤，还是烫的。<span class="dialogue">“洗完手再喝。”</span>她在厨房里说，没有抬头。你坐下来了——这是你这么多年来第一次，不用再赶时间。`:love==="异地"?`你收到一条消息：<span class="dialogue">“今天的比赛我看了。那个拖时间有点丢人，不像是你。”</span>你笑了一下，回了两个字：老了。她回了一个表情，没再多说。你们的对话框还留着，上一次聊天是两个月前的生日。`:`你路过那家面馆，透过玻璃看见里面靠窗的位置坐着一个长发的人。你停了一步，然后继续走了。你没有回头，也不知道那是不是她。但你知道，就算是她，你也不会进去了。`;
  let coda=s.national.called?`退役后你把那封征召信从包底翻出来过一次，折痕快把纸磨穿了。你没告诉任何人，只是读了一遍，重新叠好放回去。<br><br>有一天你收拾东西时发现它不见了，你没有找，只是在原地坐了一会儿。很多年后，有人在你老家那间卧室的墙缝里发现一张泛黄的纸，上面还看得清几个字——<span class="dialogue">“经研究决定……征召……”</span>字迹被潮气洇花了，但那张纸被叠得很整齐，像是有人曾经很认真地保管过它。`:"";
  if(s.flags&&s.flags.worldChampion)coda=`有一年夏天，你们赢到了最后一场。那只奖杯你只抱了很短的时间就要交回去，但那天晚上它的重量，后来很多年你都还记得。<br><br>`+coda;
  return{grade:g.tier,line:g.line,loveEnd,coda,age:a.age,peak:s.peakOverall||overall(s),score:careerScore(s),
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

let S=null,modalQueue=[],modalBusy=false,prologueIndex=0,prologueClickAt=0,creatorAllocation={...START_ALLOC},creatorHeight="mid",creatorTalents=[],creatorDifficulty="standard",rerollsLeft=1,toastTimer=null;
const $=id=>document.getElementById(id);
function saveGame(){if(!S)return false;try{localStorage.setItem(SAVE_KEY,JSON.stringify(S));return true}catch(e){return false}}
/* v2(stats+skills 九个数) → v3(attrs 七项)。属性算不出数（NaN）就整档作废返回 null，
   由 loadGame 回退到「清档重开」，绝不让半初始化的档进游戏——renderAll 直接读 S.attrs[k]。
   form 只是每月都在重算的软数值，缺了就按 v2 的初始值补，不值得为它丢掉整个生涯。
   注意：下面的 morale/teamFit 是 v2「磁盘上」的字段名，游戏里这两个概念都已经删掉了。
   它们只在这个函数里出现——把旧档读进来、折进 form、然后删掉，别照着它们在别处新建变量。 */
function migrateV2toV3(d){
  try{
    if(!d||typeof d!=="object"||!d.stats||!d.skills)return null;
    const st=d.stats,sk=d.skills,num=v=>typeof v==="number"&&Number.isFinite(v)?v:NaN,
      soft=(v,dflt)=>typeof v==="number"&&Number.isFinite(v)?v:dflt;
    const attrs={
      PAC:(num(st.speed)+num(st.burst))/2,
      SHO:num(sk.finishing),
      PAS:num(sk.vision)*.65+num(sk.setPiece)*.35,
      DRI:num(sk.dribble),
      PHY:(num(st.height)+num(st.stamina))/2,
      WIL:num(st.will),
      DEF:20+num(st.stamina)*.35+num(st.will)*.15
    };
    for(const k of ATTR_KEYS){
      if(!Number.isFinite(attrs[k]))return null;
      attrs[k]=clamp(attrs[k],1,99);
    }
    const out={...d,version:3,attrs};
    out.form=clamp(Math.round(soft(d.form,60)*.65+soft(d.morale,76)*.35));
    if(!Number.isFinite(out.form))return null;
    delete out.stats;delete out.skills;delete out.morale;delete out.teamFit;delete out.allocation;
    if(!out.heightTier)out.heightTier="mid";
    if(!Number.isFinite(out.heightCm))out.heightCm=182;
    if(!Number.isFinite(out.heightMax))out.heightMax=Math.max(out.heightCm,HEIGHT_TIERS[out.heightTier]?.cm||191);
    return out;
  }catch(e){return null}
}
// 只补同版本存档缺失的字段，被删掉的旧训练 id 残留在 actionUsage 里无害。
// v2 的 stats/skills 形状由 loadGame 先交给 migrateV2toV3 摊平，normalizeSave 自己不造 attrs。
function normalizeSave(d){
  if(!d||typeof d!=="object")return d;
  d.matchPlan=MATCH_PLANS.some(p=>p.id===d.matchPlan)?d.matchPlan:"box";
  d.styles=Object.assign({box:0,burst:0,target:0,play:0},d.styles||{});
  if(d.challenge===undefined)d.challenge=null;
  if(d.pendingMatch===undefined)d.pendingMatch=null;
  if(!Array.isArray(d.combosHit))d.combosHit=[];
  /* 球探字段已删，后门改读 fame。老档不迁移的话，一个攒了一年球探关注的
     存档会在16岁突然撞墙——而且不升 VERSION，它不会被清档。 */
  if("scout" in d){d.fame=clamp((d.fame||0)+((d.scout||5)-5));delete d.scout}
  delete d.study;
  if(d.risks){delete d.risks.health;delete d.risks.media;if(typeof d.risks.gambling!=="number")d.risks.gambling=0}
  return d;
}
function loadGame(){try{const raw=localStorage.getItem(SAVE_KEY);if(!raw)return null;let data=JSON.parse(raw);
  if(data.version===2){data=migrateV2toV3(data);if(!data){localStorage.removeItem(SAVE_KEY);return null}}
  if(data.version!==VERSION)return null;return normalizeSave(data)}catch(e){return null}}
function toast(text){if(typeof document==="undefined")return;const el=$("toast");if(!el)return;el.textContent=text;el.classList.add("show");clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove("show"),1800)}

/* 月度小结是本月的收尾，必须守住队尾。事件选项的 apply() 还会再塞东西进来
   （比如选了「立刻要求检查」→ sufferInjury → 「你受伤了」），
   直接 push 会排到小结后面，变成「小结说你伤了」再「通知你伤了」的倒序。 */
function enqueueDecision(d,kicker="关键抉择"){if(!d)return;
  const i=modalQueue.findIndex(m=>m.kicker==="月度小结");
  if(i>=0)modalQueue.splice(i,0,{...d,kicker});else modalQueue.push({...d,kicker});
  pumpModal()}
// 插到队首：让世界杯的逐场链条连续播放，不被赛季奖项等其它弹窗打断
function enqueueFront(d,kicker="关键抉择"){if(!d)return;modalQueue.unshift({...d,kicker});pumpModal()}
function pumpModal(){if(modalBusy||!modalQueue.length||typeof document==="undefined")return;modalBusy=true;const d=modalQueue.shift(),mask=$("modalMask"),modal=$("modal"),wrap=$("modalPortraitWrap");$("modalKicker").textContent=d.kicker||"关键抉择";$("modalTitle").textContent=d.title||"抉择";$("modalBody").innerHTML=(typeof d.body==="function"?d.body(S):d.body)||"";
  if(d.portrait){wrap.classList.remove("hidden");$("modalPortrait").src=d.portrait;modal.classList.remove("no-portrait")}else{wrap.classList.add("hidden");modal.classList.add("no-portrait")}
  const opts=typeof d.options==="function"?d.options(S):d.options;$("modalOptions").innerHTML="";(opts||[option("继续","",()=>{})]).forEach((o,i)=>{const b=document.createElement("button");b.className=`option-button ${o.tone||""}`;b.innerHTML=`<b>${esc(o.text)}</b>${o.effect?`<span>${esc(o.effect)}</span>`:""}`;b.addEventListener("click",()=>{b.disabled=true;try{o.apply?.()}finally{mask.classList.add("hidden");modalBusy=false;saveGame();renderAll();setTimeout(pumpModal,80)}});$("modalOptions").appendChild(b)});mask.classList.remove("hidden");const first=$("modalOptions").querySelector("button");if(first)setTimeout(()=>first.focus(),30)}
function trapModalFocus(e){if(e.key!=="Tab"||$("modalMask").classList.contains("hidden"))return;const f=[...$("modalOptions").querySelectorAll("button:not([disabled])")];if(!f.length)return;const first=f[0],last=f[f.length-1];if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus()}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus()}}

function intimateCheck(s){if(s.flags.intimateUnlocked||ageInfo(s).age<18)return;if(!["恋人","异地"].includes(s.relationship.status))return;if(s.relationship.love<100)return;if(s.flags.intimateCooldown&&s.totalMonth-s.flags.intimateCooldown<6)return;
  enqueueDecision({title:"那个没有回家的夜晚",portrait:"assets/lin-xiaoman.webp",body:`<p>那天赢了一场客场比赛，你进了制胜球。回到市区已经快凌晨一点，大巴停在基地门口。你给她发消息：“我到了。”她回得很快：<span class="dialogue">“我在门口。”</span></p><p>你走出来，看到她站在路灯下面，穿着那件你落在她那里的旧外套。她没问你赢没赢，因为她在看台上。十一月的夜风很凉，她把拉链往上拉了一格：<span class="dialogue">“我不想一个人回宿舍了。”</span></p><p>你没有说话，她也没有再说第二遍。那天晚上的时间走得很慢，慢到你记得每一个细节——窗帘缝里漏进来的路灯光，她呼吸的节奏，天亮之前她轻轻翻了一个身，没有醒。</p><p>此后很多年，你仍然记得那天晚上的每一个细节。但你从来没有跟任何人提起过。</p>`,options:[
    option("把她拥进怀里，这一夜属于彼此","关系更进一步；此后可选“和小满独处”，状态↑体力↓",()=>{s.flags.intimateUnlocked=true;change(s,"form",17);change(s,"fitness",-14);log(s,"story","天亮时她还睡在你臂弯里，头发散在枕头上。你第一次觉得，除了足球，生活里还有别的东西值得。")}),
    option("按住冲动，先陪她说说话","感情+4，状态+4；保持现在的节奏",()=>{s.flags.intimateCooldown=s.totalMonth;changeLove(s,4);change(s,"form",4);log(s,"story","你们聊到很晚，最后靠着彼此睡着了。有些事不必赶在今晚。")})]},"两个人");}
function breakupCheck(s){if(!["恋人","异地"].includes(s.relationship.status))return;const conflict=s.relationship.conflict||0;if((s.relationship.conflictShield||0)>0&&conflict>=45&&s.relationship.love>=22){s.relationship.conflictShield--;s.relationship.conflict=30;log(s,"good","青梅羁绊缓冲了一次激烈的争执，你们没有走到分手。");return}
  if((s.relationship.love<22||conflict>=45)&&!s.flags.breakupQueued){s.flags.breakupQueued=true;enqueueDecision({title:conflict>=55?"她不想再替你解释":"有些等待不会自动变成理解",portrait:"assets/lin-xiaoman.webp",body:`<p>对话框停留在三天前。她发的最后一条消息是：“你什么时候有空，我们谈一下。”你回了：“这周赛程太满了，下周吧。”她没有回“好”，也没有回“不行”，什么都没回。</p><p>三天里你没有再收到她的消息。今天你回到宿舍，发现门缝下面塞着一个信封，手写的。你拆开的时候手指很稳，你以为是解释，是吵架，是抱怨。</p><p>但你读到的是：<span class="dialogue">“我不怪你。但我不再等你了。”</span>没有指责，没有控诉。只有这八个字，写在横线纸上，字迹工整，像是写过一遍草稿之后才誊上来的。</p>`,options:[
    option("接受分手，停止纠缠","关系变为分手；意志+2，状态-12",()=>{s.relationship.status="分手";s.relationship.love=0;gain(s,"WIL",2,"will");change(s,"form",-12)}),
    option("公开承担问题并接受边界","冲突-20，感情+8；声望-6、训练状态-5",()=>{s.relationship.conflict=Math.max(0,conflict-20);changeLove(s,8);change(s,"fame",-6);change(s,"form",-5);s.flags.breakupQueued=false})]});}
}

function riskSettlement(s){
  if(s.risks.gambling>=55&&!s.flags.gamblingExploded&&chance(.25)){s.flags.gamblingExploded=true;enqueueDecision({title:"那笔钱终于出现在调查材料里",body:"<p>你已经快忘了那笔钱的事了。你换了手机，删了那条消息，告诉自己那只是一个角球——不影响比分，只有你自己知道你是故意的。但你不知道的是，那场比赛还有三个人做了跟你一样的事。</p><p>调查来得毫无征兆。周一早上你被叫进办公室，里面坐着两个人，桌上摊着打印出来的通话记录。那个你不认识的人开口了，语气很平：<span class='dialogue'>“你认识这个号码吗？”</span></p><p>你认识。那个号码你删过，但你没有忘记过。你的心脏跳得很快，但你听到自己说出口的声音是稳的：<span class='dialogue'>“我不记得了。”</span></p><p>他看了你一眼，没有反驳，把材料翻了一页：<span class='dialogue'>“我们还有时间。你可以再想想。”</span>你坐在椅子上，表面平静，但脚趾在鞋子里紧紧抠着鞋底，只有你自己知道。</p>",options:[option("主动交代并配合调查","停赛6个月，声望-25；保留重返球场的可能",()=>{s.suspension=6;change(s,"fame",-25);change(s.risks,"gambling",-35);s.awards=[]}),option("否认到底","50%证据不足；否则停赛24个月并失去国家队",()=>{if(chance(.5)){change(s.risks,"gambling",-15);log(s,"warn","调查暂未形成结论，但暗雷没有消失。")}else{s.suspension=24;s.national.called=false;change(s,"fame",-55);s.flags.gamblingRuined=true;log(s,"bad","更多转账与通讯记录被确认，你被长期禁赛。")}},"danger")]})}
  if(s.flags.hivDiagnosed&&s.flags.hivIntermittent){change(s,"fitness",-30);s.injury.risk=clamp((s.injury.risk||0)+8)}
}

const ACTION_FEEDBACK={
  train_burst:["最后一组冲刺你几乎要吐，但落地那一下，第一步明显更快了。","标志桶之间连续变向，鞋钉刮地的声音一次比一次干脆。"],train_target:["杠铃一次次压下来，你能感觉到，下次中卫再靠上来，你站得住了。","背身、卡位、起跳，撞了一下午，肩膀青了一块，落点却越来越归你。"],
  train_box:["近角、远角、抢点、逆足……你一颗颗把球送进网窝，直到手感发烫。","同一个落点摆了上百次，弧线越来越听你的话。"],
  train_play:["合练结束别人都走了，你又多跑了两趟折返，训练服湿得能拧出水。","录像一帧帧倒回去看，你终于弄明白那个球为什么没接到。"],
  love_time:["你绕远路等在她楼下。小满看到突然冒出来的你，愣了一下，随即笑着跑过来，一头扎进你怀里。","隔着屏幕，你们还是把今天各自的事都讲给了对方听。挂断前谁都不舍得先说再见。"],
  home:["父亲没问你进了几个球，只问膝盖还疼不疼。一顿家常饭，你吃得比哪场庆功宴都踏实。","你顺手把一部分钱打回了家。电话那头父亲沉默了很久，最后只说了句'够了够了'。"],
  recover:["你关掉手机，睡到自然醒，第一次没有为'再练十分钟'感到愧疚。","冰浴、理疗、睡眠监测……这些不会出现在集锦里，却让你的身体更耐用。"],
  english:["更衣室里听不懂的俚语，你一条条记下来，第二天硬着头皮开口，队友笑着给你比了个赞。"],
  street:["野球场没有战术板，只有不服输的对手。你连过三人,笑得像个孩子。"],
  school:["你把落下的功课一页页补上，合上书本时窗外已经黑透了。"],
  campus_match:["校队的比赛只有几百名观众，你还是拼得满身泥，仿佛这就是决赛。"],
  media:["镁光灯下，你学着把每句话说得滴水不漏。采访播出后，粉丝又涨了一批。"],
  coach_talk:["你带着录像和问题去找教练，把该说清楚的都说清楚了。"],
  national_role:["你为国家队练起了边路的防守职责，俱乐部的前锋训练被分走了一部分。"],
  gift:["你把她念叨过很久的那样东西递过去，小满眼睛一下就亮了，嘴上还嫌你乱花钱。"],
  together:["你们把整座城市关在门外。她的吻从你嘴角一路往下，那一晚很长，也很近，天快亮时才睡去。","她把训练服从你身上扒下来，笑你一身汗味，却没有推开你。剩下的时间只属于你们两个人。"]
};
function actionFeedback(a){const arr=ACTION_FEEDBACK[a.id];return arr?pick(arr):`你认真完成了「${a.name}」。`}
function applyAction(id){if(!S||S.actionPoints<=0)return;const a=ACTIONS.find(x=>x.id===id);if(!a||!a.phases.includes(phaseOf(S))||(a.show&&!a.show(S)))return;const used=S.actionUsage[id]||0;if(used>=(a.max||1))return;if(a.cost&&(S.money||0)<a.cost){toast("资金不足，先靠比赛或媒体活动赚钱");return}if(S.injury.months>0&&!['recover','home','english','love_time','gift'].includes(id)){toast("伤停期不能完成高强度行动");return}
  S.actionPoints--;S.actionUsage[id]=used+1;
  actionMult=used>=1?.6:1;actionInjuryMult=used>=1?1.5:1;
  try{a.run(S)}finally{actionMult=1;actionInjuryMult=1}
  if(a.style)addStyleExp(S,a.style,used>=1?6:10);
  unlock("first_action");if(S.flags.weeklyPromise&&id==="train_play"&&used===0){gain(S,"SHO",-.08,"finish")};const fb=actionFeedback(a);S.lastActionFeedback={name:a.name,text:fb,effects:a.effects.join("、")};log(S,"action",fb);checkCombos(S);checkAchievements(S);saveGame();renderAll()}

/* ========== 赛程表 ==========
   对手必须在赛季初就定下来，否则「下一场打谁」这个信息不存在，
   主界面、日程页、赛前预告全都无从谈起。
   月份节奏在这里是唯一定义，shouldPlayMatch 改成查表。 */
function shuffled(arr,rng){const c=[...arr];for(let i=c.length-1;i>0;i--){const j=Math.floor(rng()*(i+1));[c[i],c[j]]=[c[j],c[i]]}return c}
/* 从 max(1,seasonStart) 起：advanceMonth 是先 S.totalMonth++ 再判定有没有比赛
   （app.js:1632 在 :1652 之前），所以第一次判定发生在 totalMonth=1，
   第0月的比赛永远打不到。生成它只会在赛程页留一个永远「未打」的幽灵场次，
   还会让主界面的「下一场·本月末」说谎。旧的 shouldPlayMatch 同样从不打第0月。
   第24、48月是换东家的月份（16岁定去向、18岁进职业队），routeChoice16 /
   enterProAt18 会当场改掉 s.club——那个月排联赛说不通，而且赛前预告走
   enqueueFront 会插到生涯分流剧情前面，让玩家在还不知道自己去哪儿的时候
   先选了「本场职责」，比赛还是按旧俱乐部打的。 */
function matchMonthsOfSeason(s,seasonStart){
  const out=[];
  for(let m=Math.max(1,seasonStart);m<seasonStart+12;m++){
    if(m===24||m===48)continue;                       // 换东家的月份不排联赛
    const age=14+Math.floor(m/12),p=age<16?"academy":age<18?(s.route||"academy"):"pro";
    if(age<16){if(m%3===0)out.push(m)}
    else if(p==="campus"){if(m%2===0)out.push(m)}
    else out.push(m);
  }
  return out;
}
function scheduleSig(s){return{season:ageInfo(s).season,clubKey:s.club.name,route:s.route||"",nationalCalled:!!s.national.called}}
function buildSchedule(s,rng=Math.random){
  const seasonStart=Math.floor(s.totalMonth/12)*12,pool=opponentPool(s);
  let bag=[];
  const fixtures=matchMonthsOfSeason(s,seasonStart).map((month,i)=>{
    if(!bag.length)bag=shuffled(pool,rng);
    const opp=bag.shift()||pick(pool);
    return {month,type:"club",opponent:opp.name,strength:opp.strength,home:i%2===0,
      competition:`${s.club.league}第${i+1}轮`,status:"upcoming",result:null};
  });
  return {...scheduleSig(s),fixtures};
}
/* 只重排未来。转会发生在赛季中途时，已打过的战绩必须留住——
   否则换一次东家就抹掉半个赛季的比分。 */
function ensureSchedule(s,rng=Math.random){
  const sig=scheduleSig(s),sc=s.schedule;
  if(sc&&sc.season===sig.season&&sc.clubKey===sig.clubKey&&sc.route===sig.route&&sc.nationalCalled===sig.nationalCalled)return sc;
  const fresh=buildSchedule(s,rng);
  if(sc){
    const past=sc.fixtures.filter(f=>f.status!=="upcoming"||f.month<s.totalMonth);
    const taken=new Set(past.map(f=>f.month));
    fresh.fixtures=[...past,...fresh.fixtures.filter(f=>!taken.has(f.month))].sort((a,b)=>a.month-b.month);
  }
  s.schedule=fresh;return fresh;
}
function fixtureOfMonth(s){const sc=s.schedule;return sc?sc.fixtures.find(f=>f.month===s.totalMonth&&f.status==="upcoming")||null:null}
function nextFixture(s){const sc=s.schedule;return sc?sc.fixtures.find(f=>f.month>=s.totalMonth&&f.status==="upcoming")||null:null}
/* 还有几次「结束本月」才打到这场。advanceMonth 是先 ++ 再判定，
   所以 month=totalMonth+1 的那场，下一次点「结束本月」就开打——
   那是「本月末」，不是「还有1个月」。差一位会让主界面一直骗玩家。 */
function fixtureCountdown(s,fx){return fx?Math.max(0,fx.month-s.totalMonth-1):-1}
function shouldPlayMatch(s){if(s.flags&&s.flags.washedOut)return false;if((s.injury.months||0)>0)return false;return !!fixtureOfMonth(s)}
// 返回 modal 对象而不直接入队——finishMonth 需要把它排在月度小结之前。
function buildMatchReportModal(report){return{kicker:report.classic?"经典之战":"比赛简报",title:`${report.competition} · ${report.club} ${report.gf}-${report.ga} ${report.opponent}`,body:`${report.classic?'<div class="classic-tag">这场球会被记很久</div>':""}<div class="match-score"><span class="match-team">${esc(report.club)}</span><strong>${report.gf} : ${report.ga}</strong><span class="match-team">${esc(report.opponent)}</span></div><p>你${report.role}${report.rating?`，评分 <b>${report.rating}</b>`:""}；${report.goals}球，${report.assists}助攻。</p><div class="timeline-list">${report.timeline.map(t=>`<div class="timeline-row"><b>${t.minute}'</b><span>${esc(t.text)}</span></div>`).join("")}</div><div class="factor-row"><div class="factor"><b>${report.model.ability}</b><span>能力基础 · 约60%</span></div><div class="factor"><b>${report.model.condition}</b><span>状态体能 · 约25%</span></div><div class="factor"><b>${report.model.random}</b><span>临场波动 · 约15%</span></div></div>`,options:[option("收下这场比赛","数据已计入生涯统计",()=>{})]}}
function queueMatchReport(s,report){enqueueDecision(buildMatchReportModal(report),report.classic?"经典之战":"比赛简报")}

function queueEvent(s,e){enqueueDecision({title:e.title,body:e.body,portrait:e.portrait,options:e.options(s)},"两月事件")}
function queueStory(s,beat){enqueueDecision({title:beat.title,body:beat.body,portrait:beat.portrait,options:beat.options},"半年剧情")}
function queueNationalCall(s){enqueueDecision({title:"中国国家男子足球队 · 征召",portrait:"assets/father.webp",body:`<p>通知是以红头文件的形式通过俱乐部转交的。不是电话，不是消息。一张纸，公章，写着你的名字。</p><p>你发了一会儿愣。你从小在电视上看过很多次别人接到征召的场景——有人会哭，会打电话给家人。但你只是坐在那里。你想到的不是荣耀，而是门诊部三楼的收费窗口，想到你爸在病床上说的“踢给爸看”，想到小满最后一次站在漏雨的铁丝网外看你的比赛，她什么时候走的你都不知道。</p><p>你把手机翻到反面扣在桌上，坐了一会儿。然后你站起来，把那张纸叠好，放进背包最里面的夹层——那个你一直放着那只旧足球皮的位置。</p><p>你拉上拉链，走出去。训练场上的灯已经亮了。</p>`,options:[option("接受征召","国家队功能开放；体能管理压力增加",()=>{})]},"国家队")}
function queueNationalReport(r){enqueueDecision({title:`国家队 ${r.gf}-${r.ga} ${r.opponent}`,body:`你代表中国队出场，贡献 <b>${r.goals}</b> 球。${r.gf>r.ga?"终场哨后，整片看台都在唱同一首歌。":r.gf<r.ga?"失利没有让任务结束，下一次集训已经写进日历。":"比分没有分出高下，身体的疲惫却很具体。"}`,options:[option("返回俱乐部","国家队数据已归档",()=>{})]},"为国而战")}function queueAward(r,s,goalResult){const gLine=goalResult?`<p class="dialogue" style="border-color:${goalResult.met?'#28d27d':'#e0564f'}">赛季目标${goalResult.met?"达成":"未达成"}：${esc(goalResult.goal.text)}。${goalResult.met?"奖金与信任到账。":"信任下滑，位置不保。"}</p>`:"";enqueueDecision({title:r.ballon?"金球奖属于你":"年度评选揭晓",body:`本赛季 ${r.goals} 球、${r.assists} 助攻，平均评分 ${r.avg}，评选指数 <b>${r.score}</b>。${r.ballon?"当主持人念出你的名字，你先想到的不是聚光灯，而是父亲手里的旧足球。":"你进入了候选讨论，但奖杯属于另一个赛季表现更完整的人。"}${r.leagueTitle?`<p class="dialogue">同时，你随${esc(s.club.name)}赢得${esc(s.club.league)}冠军。</p>`:""}${gLine}`,options:[option("进入下一赛季","年度数据已经归档",()=>{})]},"年度荣誉")}

// ===== 世界杯：世预赛门槛 + 随机抽签 + 逐场可玩（淘汰赛临场战术）=====
const WC_STAGE_NAMES=["小组赛第1场","小组赛第2场","小组赛第3场","十六强","八强","半决赛","决赛"];
function wcDraw(rng){
  const take=(pool,n)=>{const c=[...pool],out=[];for(let k=0;k<n&&c.length;k++)out.push(c.splice(Math.floor(rng()*c.length),1)[0]);return out};
  return {group:take(WC_GROUP_POOL,3),ko:take(WC_ELITE_POOL,4).sort((a,b)=>a.strength-b.strength)};
}
function simulateQualifiers(s,rng){
  const china=75+(overall(s)-74)*.6+(s.national.adapt||0)*.05+(hasTalent(s,"red_shirt")?2:0);
  const c=[...WC_QUAL_POOL],list=[];
  for(let k=0;k<8;k++)list.push(c.length?c.splice(Math.floor(rng()*c.length),1)[0]:pick(WC_QUAL_POOL));
  const matches=[];let points=0;
  for(const opp of list){
    const edge=china-opp.strength+rndFloat(rng,-11,11);
    const gf=poisson(clamp(1.2+edge/17,.2,3.4),rng),ga=poisson(clamp(1.15-edge/20,.2,3.2),rng);
    if(gf>ga)points+=3;else if(gf===ga)points+=1;
    matches.push({opp:opp.name,gf,ga});
  }
  const threshold=11+diffOf(s).threshold;
  return {matches,points,threshold,qualified:points>=threshold};
}
/* ========== 点球大战 ==========
   三个选项刻意不是「同一条曲线上的三个点」：稳推对 SHO 最敏感、等门将
   走 WIL 且对体能最钝、抽死角成功率最低但成功会被记住。因为点球是二元
   结果，若三者只差成功率，最高的那个必然严格占优、另外两个就是死选项。 */
const PENALTY_OPTIONS=[
  {id:"bold",text:"抽死角",tip:"成功率最低，但这一脚会被记住",stat:"SHO",bold:true},
  {id:"steady",text:"稳稳推一侧",tip:"最不容易出洋相",stat:"SHO"},
  {id:"wait",text:"等门将先动",tip:"最不受体能影响",stat:"WIL"}
];
/* 主罚轮次是赛前的教练决策：取决于你是什么样的球员，而不是此刻多累，
   所以读裸 WIL 而非 eff()。 */
function penaltyKickerRound(s){const w=s.attrs.WIL;return w>=75?5:w>=55?3:1}
/* 稳推与等门将共用 .68 的基准，差别全在斜率与读哪条属性——不是配平出来的，
   是被 cond() 的量程逼出来的：form 55 时 fitness 归零也只把 cond 压到 .88
   （fitness 项量程仅 -0.12），75/75 的 build 因此只掉 6.3 点 effSHO / 3.6 点
   effWIL。要让「体能见底时等门将反超」成立，两者截距差必须小于 1.4/300+1.3/160
   ≈ .0128；给稳推留任何可见的先手都会把反超点推到 cond 够不着的地方。
   截距取平，反超落在 fitness≈34，正好是「体能见底」该有的位置。 */
function penaltyRate(s,o){
  const e=eff(s,o.stat);
  const base=o.id==="bold"?.58+(e-70)/200:o.id==="steady"?.68+(e-70)/160:.68+(e-70)/300;
  return clamp(base+(hasTalent(s,"big_heart")?.06:0),.35,.92);
}
function teamPenaltyRate(strength){return clamp(.72+(strength-74)/200,.55,.88)}
function newShootout(s,opp){
  return {round:1,myScore:0,oppScore:0,kicks:[],myRound:penaltyKickerRound(s),
    oppStrength:opp.strength,oppName:opp.name,sudden:false,done:false,won:null,myMiss:false};
}
/* 推进一轮：先中国后对手。轮到玩家主罚就原地返回，等 UI 拿选择回来。
   五轮打平进突然死亡（单次判定，不做多轮，避免流程冗长）。 */
function shootoutAdvance(s,so,rng){
  if(so.done||so.round===so.myRound)return so;
  const teamStrength=74+(overall(s)-72)*.72+(s.national.adapt||0)*.06;
  const mine=rng()<teamPenaltyRate(teamStrength);
  so.kicks.push({side:"me",round:so.round,scored:mine});
  if(mine)so.myScore++;
  const theirs=rng()<teamPenaltyRate(so.oppStrength);
  so.kicks.push({side:"opp",round:so.round,scored:theirs});
  if(theirs)so.oppScore++;
  so.round++;
  shootoutSettle(so);
  return so;
}
/* 五轮结束后判定；平局则进突然死亡标记，由 wcShootoutStep 收尾。 */
function shootoutSettle(so){
  if(so.round<=5)return;
  if(so.myScore!==so.oppScore){so.done=true;so.won=so.myScore>so.oppScore}
  else so.sudden=true;
}
function shootoutPlayerKick(s,so,optId,rng){
  const o=PENALTY_OPTIONS.find(x=>x.id===optId)||PENALTY_OPTIONS[1];
  const scored=rng()<penaltyRate(s,o);
  so.kicks.push({side:"me",round:so.round,scored,mine:true,opt:o.id});
  if(scored){so.myScore++;if(o.bold)change(s,"fame",4)}else so.myMiss=true;
  const theirs=rng()<teamPenaltyRate(so.oppStrength);
  so.kicks.push({side:"opp",round:so.round,scored:theirs});
  if(theirs)so.oppScore++;
  so.round++;
  shootoutSettle(so);
  return scored;
}
function wcMatchSim(s,opp,mentality,i,rng){
  const men={"稳守":{a:.85,d:.68},"均衡":{a:1,d:1},"强攻":{a:1.28,d:1.32}}[mentality]||{a:1,d:1};
  const team=74+(overall(s)-72)*.72+(s.national.adapt||0)*.06+(hasTalent(s,"red_shirt")?2:0)+(hasTalent(s,"big_heart")&&i>=3?3:0)+(hasTalent(s,"final_master")&&i===6?5:0);
  const edge=team-opp.strength+rndFloat(rng,-10,10);
  const gf=poisson(clamp((1.1+edge/16)*men.a,.18,3.6),rng),ga=poisson(clamp((1.15-edge/20)*men.d,.18,3.4),rng);
  const player=overall(s);
  const goals=gf>0&&rng()<clamp(.30+(player-65)/80,.2,.75)?Math.min(gf,rng()<.18?2:1):0;
  const assists=(gf-goals>0&&rng()<.32)?1:0;
  let won=gf>ga,pen=false;
  if(i>=3&&gf===ga){pen=true;won=null}
  return {opp:opp.name,strength:opp.strength,gf,ga,goals,assists,won,pen,mentality,stage:i};
}
function startWorldCup(s){
  const q=simulateQualifiers(s,Math.random);
  enqueueDecision({title:q.qualified?"世预赛出线！":"世预赛出局",body:`<div class="story-list">${q.matches.map(m=>`<div class="story-log"><time>${m.gf>m.ga?"胜":m.gf===m.ga?"平":"负"}</time><div><h3>中国 ${m.gf}-${m.ga} ${esc(m.opp)}</h3></div></div>`).join("")}</div><p>八场积 <b>${q.points}</b> 分（出线线 ${q.threshold}）。${q.qualified?"中国队闯进世界杯决赛圈！":"差一口气，四年后再来——提升综合能力能带动全队实力。"}</p>`,options:[q.qualified?option("给家里打电话","",()=>enqueueFront({title:"父亲要去看世界杯",portrait:"assets/father.webp",body:`<p>电话响到第七声他才接，背景里有机器的声音——他还在厂里。</p><p>你说队伍出线了。他“嗯”了一声，隔了两秒，问的是：<span class="dialogue">“去那边看一场，要花多少钱。”</span></p><p>你说我给你买票。他说那不用，你比赛要紧。然后又问了一遍：<span class="dialogue">“多少钱。”</span></p>`,options:[option("进入决赛圈抽签","",()=>setupWcFinals(s))]},"世界杯")):option("接受结果","",()=>{})]},"世界杯预选赛");
}
function setupWcFinals(s){
  s.national.worldCups++;
  s.flags.worldcup_qualified=true;
  const d=wcDraw(Math.random);
  s.national.wcRun={stage:0,group:d.group,ko:d.ko,results:[],groupWins:0,groupPts:0,alive:true};
  enqueueFront({title:"世界杯抽签",body:`<p>小组赛对手：<b>${d.group.map(o=>esc(o.name)).join("、")}</b></p><p>若能出线，淘汰赛之路可能是：${d.ko.map(o=>esc(o.name)).join(" → ")}</p><p class="dialogue">小组赛至少赢一场（或积满4分）即可出线；淘汰赛单场定胜负，平局进点球。</p>`,options:[option("开始小组赛","",()=>wcNext(s))]},"世界杯");
}
/* 读档后把进行中的世界杯接回来。只要 shootout 还挂着就回点球，否则回到下一场。
   这里不能再看 done：最后一轮罚完时 done 已是 true，而结果弹窗还没点，
   saveGame() 恰好在这个空档存盘——漏掉它就等于把那场比赛的胜负永远丢在 null。
   done 的收尾由 wcShootoutStep 自己转交给 wcShootoutFinish。
   stage>6 或 alive 为假说明这届已经结束，直接清掉。 */
function resumeWorldCup(s){
  const run=s&&s.national&&s.national.wcRun;
  if(!run||!run.alive){if(run)s.national.wcRun=null;return}
  if(run.stage>6){s.national.wcRun=null;return}
  if(run.shootout){wcShootoutStep(s);return}
  wcNext(s);
}
/* 决赛前夜。两个选择都对——这正是本作一贯的取舍手感，落在最该纠结的时刻。
   分手状态下换成周骁，避免出现一个不该出现的人。 */
function wcFinalEve(s){
  const together=["恋人","异地"].includes(s.relationship.status)||s.flags.married;
  if(together)return {title:"决赛前夜",portrait:"assets/lin-xiaoman.webp",
    body:`<p>酒店的窗帘拉不严，走廊的灯从缝里透进来一条。你把手机拿起来又放下，放下又拿起来。</p><p>屏幕上是她三个小时前发的：<span class="dialogue">“睡了吗。”</span>你没回。</p>`,
    options:[
      option("给她打电话","状态+5，体能-6",()=>{change(s,"form",5);change(s,"fitness",-6)}),
      option("明天再说，先睡","体能+6",()=>{change(s,"fitness",6)})]};
  return {title:"决赛前夜",portrait:"assets/coach-zhou.webp",
    body:`<p>周骁的消息在凌晨一点进来，只有一句：<span class="dialogue">“十四岁那年你在铁丝网外面站了多久，还记得吗。”</span></p><p>你记得。你还记得那天他连头都没回。</p>`,
    options:[
      option("回他一条长的","状态+5，体能-6",()=>{change(s,"form",5);change(s,"fitness",-6)}),
      option("放下手机，先睡","体能+6",()=>{change(s,"fitness",6)})]};
}

/* 点球流程的唯一入口，也是刷新后的恢复点：每次都从当前 shootout 状态
   重新算该显示什么，因此中途刷新能原地接上。 */
function wcShootoutStep(s){
  const run=s.national.wcRun,so=run&&run.shootout;
  if(!so)return wcNext(s);
  const board=()=>`<div class="match-score"><span class="match-team">中国</span><strong>${so.myScore} : ${so.oppScore}</strong><span class="match-team">${esc(so.oppName)}</span></div><p class="dialogue">第 ${Math.min(so.round,5)} 轮${so.sudden?" · 突然死亡":""}</p>`;
  if(so.done)return wcShootoutFinish(s);
  if(so.sudden){
    const p=clamp(.46+(eff(s,"WIL")-70)/260+(hasTalent(s,"big_heart")?.06:0),.25,.75);
    return enqueueFront({title:"突然死亡",body:`${board()}<p>五轮罚完，比分还是平的。谁先罚丢谁出局。</p>`,
      options:[option("走上点球点","一脚定生死",()=>{so.won=Math.random()<p;so.done=true;if(!so.won)so.myMiss=true;wcShootoutFinish(s)})]},"点球大战");
  }
  if(so.round===so.myRound){
    return enqueueFront({title:`第 ${so.round} 轮 · 轮到你了`,
      body:`${board()}<p>裁判把球摆在点球点上，然后退开。走过去的这十几米，看台的声音忽然离你很远。</p>`,
      options:PENALTY_OPTIONS.map(o=>option(o.text,`成功率约 ${Math.round(penaltyRate(s,o)*100)}% · ${o.tip}`,()=>{
        shootoutPlayerKick(s,so,o.id,Math.random);wcShootoutStep(s);
      },o.bold?"danger":""))},"点球大战");
  }
  shootoutAdvance(s,so,Math.random);
  const last=so.kicks.slice(-2);
  enqueueFront({title:`点球大战 · 第 ${Math.min(so.round-1,5)} 轮`,
    body:`${board()}<p>${last[0]&&last[0].scored?"队友稳稳罚进。":"队友那一脚被扑了出来。"}${last[1]&&last[1].scored?"对方也进了。":"对方罚丢了！"}</p>`,
    options:[option("继续","",()=>wcShootoutStep(s))]},"点球大战");
}
/* 点球结束：把胜负写回那场比赛，然后交还给正常的世界杯流程。 */
function wcShootoutFinish(s){
  /* 认准 results 的最后一条，而不是 penMatch：存档往返会把两者拆成两个对象，
     那时写进 penMatch 的胜负是写给一个孤儿副本的，results 里会永远留着 won:null。
     点球期间不会再有别的比赛写进来，最后一条必然就是待决的这场。 */
  const run=s.national.wcRun,so=run.shootout,m=run.results[run.results.length-1]||run.penMatch;
  m.won=so.won;m.penScore=`${so.myScore}-${so.oppScore}`;
  /* wcPlayMatch 里那笔「赢球 +2 声望」是在 won 还是 null 时结算的，补在这里。 */
  if(so.won)change(s,"fame",2);
  if(so.myMiss)run.missedDecisivePenalty=!so.won;
  run.shootout=null;run.penMatch=null;
  const champion=m.stage===6&&m.won;
  enqueueFront({title:so.won?`点球 ${so.myScore}-${so.oppScore}，晋级！`:`点球 ${so.myScore}-${so.oppScore}，出局`,
    body:`<p>${so.won?"最后一个球进网的瞬间，替补席上的人全冲了进来。":"你站在中圈没有动。有人过来拍你的背，你没有抬头。"}</p>`,
    options:[option(champion?"捧起大力神杯":so.won?"继续":"接受结果","",()=>{
      run.stage++;
      if(champion)wcFinish(s,true);
      else if(!so.won){run.alive=false;wcFinish(s,false)}
      else wcNext(s);
    })]},"点球大战");
}
function wcNext(s){const run=s.national.wcRun;if(!run||!run.alive)return;
  if(run.stage===6&&!run.eveShown){run.eveShown=true;const d=wcFinalEve(s);return enqueueFront({...d,options:d.options.map(o=>option(o.text,o.effect,()=>{o.apply();wcNext(s)}))},"决赛前夜")}
  if(run.stage<3)wcPlayMatch(s,"均衡");else wcKnockoutChoice(s);}
function wcKnockoutChoice(s){
  const run=s.national.wcRun,opp=run.ko[run.stage-3];
  enqueueFront({title:`${WC_STAGE_NAMES[run.stage]} · 对阵 ${esc(opp.name)}`,body:`<p>对手 <b>${esc(opp.name)}</b>（实力 ${opp.strength}）。选择本场基调：</p><p class="dialogue">稳守：少丢也少进，利于以弱抗强、拖进点球；全力压上：进球更多但后防更险；均衡：居中。</p>`,options:[option("稳守反击","降低失球与进球，利于爆冷",()=>wcPlayMatch(s,"稳守")),option("攻守均衡","中规中矩",()=>wcPlayMatch(s,"均衡")),option("全力压上","多进球，风险更高",()=>wcPlayMatch(s,"强攻"))]},"世界杯");
}
function wcPlayMatch(s,mentality){
  const run=s.national.wcRun,i=run.stage;
  const opp=i<3?run.group[i]:run.ko[i-3];
  const m=wcMatchSim(s,opp,mentality,i,Math.random);
  s.national.caps++;s.statsCareer.nationalCaps++;s.national.goals+=m.goals;s.statsCareer.nationalGoals+=m.goals;
  if(m.goals)unlock("national_goal");
  change(s,"fitness",-10);change(s,"fame",m.goals*3+(m.won?2:0));
  run.results.push(m);
  if(m.pen&&m.won===null){run.shootout=newShootout(s,{name:m.opp,strength:m.strength});run.penMatch=m;wcShootoutStep(s);return}
  let advance;
  if(i<3){run.groupWins+=(m.gf>m.ga?1:0);run.groupPts+=(m.gf>m.ga?3:m.gf===m.ga?1:0);advance=i<2?true:(run.groupWins>=1||run.groupPts>=4);}
  else advance=m.won;
  const champion=i===6&&m.won;
  const resultLine=i>=3?(m.won?"晋级下一轮！":"止步于此。"):(i===2?(advance?"小组出线！":"小组赛出局。"):(m.gf>m.ga?"拿下三分。":m.gf===m.ga?"逼平对手。":"惜败。"));
  enqueueFront({title:`${WC_STAGE_NAMES[i]} · 中国 ${m.gf}-${m.ga} ${esc(m.opp)}${m.pen?"（点球）":""}`,body:`<div class="match-score"><span class="match-team">中国</span><strong>${m.gf} : ${m.ga}</strong><span class="match-team">${esc(m.opp)}</span></div><p>你贡献 <b>${m.goals}</b> 球 ${m.assists} 助。${resultLine}</p>${(i>=3&&mentality!=="均衡")?`<p class="dialogue">本场基调：${mentality}。</p>`:""}`,options:[option(champion?"捧起大力神杯":advance?"继续":"接受结果","",()=>{run.stage++;if(champion)wcFinish(s,true);else if(!advance){run.alive=false;wcFinish(s,false);}else wcNext(s);})]},"世界杯");
}
/* 淘汰收尾。大多数玩家的世界杯记忆是输，所以这条线不能是空收尾。
   踢飞那一脚会被专门写出来。 */
function wcOutroScene(s){
  const run=s.national.wcRun,age=ageInfo(s).age,again=age+4<=diffOf(s).retireAge;
  const tail=again?`四年后你${age+4}岁。还来得及。`:`四年后你${age+4}岁。你知道那意味着什么。`;
  if(run&&run.missedDecisivePenalty)return {title:"那一脚",portrait:"assets/father.webp",
    body:`<p>更衣室里没有人说话。有人在解鞋带，解了很久也没解开。</p><p>你父亲的消息进来得很晚：<span class="dialogue">“我在电视上看见你走回去了。”</span>就这一句，没有别的。</p><p>${tail}</p>`};
  return {title:"回家的航班",portrait:"assets/lin-xiaoman.webp",
    body:`<p>行李在传送带上转了两圈你才认出自己那个。出口外面人不多，她举着的牌子上什么也没写。</p><p>她说：<span class="dialogue">“我看完了。全部。”</span></p><p>${tail}</p>`};
}

function wcFinish(s,champion){
  const run=s.national.wcRun;
  if(champion){s.honours.unshift({title:"世界杯冠军",season:ageInfo(s).season,icon:"世",detail:"中国国家队"});s.seasonStats.trophies++;unlock("world_cup");change(s,"fame",25);s.flags.worldChampion=true;}
  const short=["小组1","小组2","小组3","十六强","八强","半决赛","决赛"];
  const wcGoals=run.results.reduce((p,x)=>p+x.goals,0);
  enqueueFront({title:champion?"中国队，世界冠军！":"世界杯之旅结束",body:`<div class="story-list">${run.results.map(x=>`<div class="story-log"><time>${short[x.stage]}</time><div><h3>中国 ${x.gf}-${x.ga} ${esc(x.opp)}${x.pen?"（点球）":""}</h3><p>${x.stage>=3?(x.won?"晋级":"止步"):(x.gf>x.ga?"胜":x.gf===x.ga?"平":"负")} · 你 ${x.goals} 球</p></div></div>`).join("")}</div><p>本届你出场 ${run.results.length} 场，打进 <b>${wcGoals}</b> 球。${champion?'<span class="dialogue">七场比赛，你们一场一场赢到了最后。</span>':"四年后，还能再来一次。"}</p>`,options:[option(champion?"走上领奖台":"离开球场","",()=>{
  if(champion)return enqueueFront({title:"大力神杯",portrait:"assets/player.webp",body:`<p>队长把奖杯递过来的时候你没有马上接。你先把手在球衣上擦了两下——手心全是汗，你怕滑。</p><p>金属是凉的。比你想象中重。</p>`,options:[option("找看台","",()=>{
    enqueueFront({title:"看台",portrait:"assets/father.webp",body:`<p>你在人群里一排排地找。找到的时候他正把眼镜摘下来擦，擦了很久。</p><p>旁边那个位置上的人一直在挥手，从终场哨响到现在，没停过。</p>`,options:[option("记住这一届","这一届会写进你的生涯",()=>{s.national.wcRun=null})]},"世界杯冠军");
  })]},"世界杯冠军");
  const sc=wcOutroScene(s);
  enqueueFront({...sc,options:[option("记住这一届","国家队数据已更新",()=>{s.national.wcRun=null})]},"世界杯");
})]},"世界杯");
}
function advanceMonth(force=false){if(!S||modalBusy||S.retired)return;if(S.actionPoints>0&&!force){const n=S.actionPoints;enqueueDecision({title:"还有执行点没有使用",body:`本月还剩 <b>${n}</b> 点。剩下的时间会自动用来休息：<b>体能 +${6*n}</b>、<b>伤病风险 −${3*n}</b>，但不会有任何属性成长。`,options:[option("继续安排本月","返回行动面板",()=>{}),option("休息，进入下个月",`体能+${6*n}，伤病风险−${3*n}`,()=>setTimeout(()=>advanceMonth(true),120))]},"时间确认");return}
  modalBusy=true;
  const _snap=S.monthSnap||{ov:overall(S),fit:S.fitness,form:S.form,love:S.relationship.love,family:S.family,money:S.money||0,age:ageInfo(S).age,inj:S.injury.months||0,st:S.relationship.status};
  if(S.actionPoints>0){const n=S.actionPoints;change(S,"fitness",6*n);S.injury.risk=Math.max(0,(S.injury.risk||0)-3*n);log(S,"story",`本月剩下的 ${n} 点时间没有排训练。你睡够了觉，身体轻了一些。`)}
  S.totalMonth++;S.actionPoints=3;S.actionUsage={};S.combosHit=[];change(S,"fitness",16+Math.max(0,Math.round((60-S.fitness)*0.7)));
  // 每月状态只结算一次：向基线回归，外加恋爱与安家的小幅加成，合成一笔下发。
  // 基线由小满关系抬高——关系好不再折成隐形战力，而是让你的状态长期更稳；分手了，基线掉回 52。
  /* 状态每月回归基线。凡是「让你长期状态更好」的东西都必须抬高 base，
     绝不能写成一个每月固定 +N——那会把均衡点推高 N/0.22≈4.5N。
     合并前这些 +N 喂的是一个没有回归机制的旧字段，所以无害；直接搬到
     form 上会把均衡点顶到 67，四分之一的月份卡在 cond() 上限，
     状态管理就没意义了。关系的收益只走 loveSupport 一条路，不重复计。 */
  const base=52+loveSupport(S)+(S.assets&&S.assets.house?2:0);
  change(S,"form",Math.round((base-S.form)*0.22));
  S.peakOverall=Math.max(S.peakOverall||0,overall(S));S.lastActionFeedback=null;
  if(S.totalMonth%12===0&&ageInfo(S).age<=18){const grow=rand(2,4);S.heightCm=Math.min(S.heightMax||200,S.heightCm+grow);log(S,"story",`身体又长开了一些，你现在${S.heightCm}cm。`)}
  const preSusp=S.suspension||0,preInjury=S.injury.months||0;
  S.offers.forEach(o=>o.months--);S.offers=S.offers.filter(o=>o.months>0);
  const a=ageInfo(S),justTurned16=S.totalMonth===24,justTurned18=S.totalMonth===48;
  if(justTurned16&&!S.flags.route16){enqueueDecision(routeChoice16(S),"16岁 · 生涯分流")}
  if(justTurned18)enterProAt18(S);
  if(a.age>=16&&S.salary>0){const d=diffOf(S),wage=Math.round(S.salary*d.income),expense=Math.round((1.5+S.fame/28)*d.expense);addMoney(S,wage-expense);if(S.debt>0&&S.totalMonth%6===0){S.debt=Math.round(S.debt*1.05);log(S,"warn","欠款利息又滚了一点，早点还清。")}}
  const passive=assetPassive(S);if(passive)addMoney(S,passive);if(S.assets&&S.assets.image_team&&S.totalMonth%3===0)change(S,"fame",1);
  ensureSchedule(S);
  /* 有排定的比赛但上不了场（伤停/雪藏/已退役）：在日程上标记 missed 留痕。
     不标的话这一场会永远停在 upcoming，变成「月份在过去却未开打」的幽灵场次，
     还会被 ensureSchedule 的 past 条件一路带进下个赛季。 */
  {const _fx=fixtureOfMonth(S);
   if(_fx&&(S.retired||!shouldPlayMatch(S))){_fx.status="missed";
     _fx.missReason=(S.injury.months||0)>0?`伤停·${S.injury.name||"伤病"}`:(S.flags&&S.flags.washedOut)?"被雪藏":"未出战"}}
  const _ctx={snap:_snap,preSusp,preInjury,justTurned16,matchReportModal:null};
  if(!S.retired&&shouldPlayMatch(S)){startMatchFlow(S,_ctx);return}
  finishMonth(_ctx);
}

/* 月末段。比赛可能跨越多次点击，所以从 advanceMonth 里拆出来当作续延。 */
function finishMonth(ctx){
  const _snap=ctx.snap,preSusp=ctx.preSusp,preInjury=ctx.preInjury,justTurned16=ctx.justTurned16,a=ageInfo(S);
  if(preSusp>0)S.suspension=Math.max(0,(S.suspension||0)-1);
  if(preInjury>0){S.injury.months=Math.max(0,S.injury.months-1);if(!S.injury.months){S.injury.name="";unlock("injury_return");log(S,"good","自然康复期结束，你重新进入比赛名单。")}}
  if(S.totalMonth%2===0&&!justTurned16){const e=chooseRandomEvent(S);if(e)queueEvent(S,e)}
  if(S.totalMonth%6===0&&STORY_BEATS[S.totalMonth])queueStory(S,STORY_BEATS[S.totalMonth](S));
  if(a.age>=18&&S.totalMonth%6===0&&!S.offers.length)generateOffers(S,S.flags.wantsMove?3:2);
  const calledNow=nationalSelectionCheck(S);if(calledNow)queueNationalCall(S);else if(S.national.called&&S.totalMonth>=96&&S.totalMonth%48===0)startWorldCup(S);else if(S.national.called&&S.totalMonth%6===0)queueNationalReport(simulateNationalMatch(S));
  if(S.totalMonth%12===0){applyAging(S);const goalResult=evaluateSeasonGoal(S);queueAward(seasonAwardCheck(S),S,goalResult);makeSeasonGoal(S)}
  if(a.age>=16&&!S.retired&&!S.challenge&&!(S.flags&&S.flags.washedOut))queueChallengeChoice(S);
  riskSettlement(S);breakupCheck(S);intimateCheck(S);checkAchievements(S);updateRanking(S);
  /* 月度小结排到队尾：它是这个月的总账，必须在本月所有事件都点完之后才结算。
     body 用函数惰性求值——拼成字符串就等于在事件生效前抢跑，
     那些事件造成的属性变化永远进不了这张表。 */
  {const snapAtQueue=_snap;modalQueue.push({title:`${ageInfo(S).age}岁 · 第${ageInfo(S).month}月 · 月度小结`,kicker:"月度小结",body:()=>{const a2=ageInfo(S),rows=[],dd=(l,b,af,u="")=>{const v=Math.round((af-b)*10)/10;if(v)rows.push(`<div class="ms-row"><span>${l}</span><b style="color:${v>0?'var(--green)':'var(--bad)'}">${v>0?'+':''}${v}${u}</b></div>`)};dd("综合能力",snapAtQueue.ov,overall(S));dd("体能",snapAtQueue.fit,S.fitness);dd("状态",snapAtQueue.form,S.form);if(["恋人","异地"].includes(S.relationship.status))dd("小满关系",snapAtQueue.love,S.relationship.love);dd("家庭",snapAtQueue.family,S.family);dd("资金",snapAtQueue.money,S.money||0,"万");const extra=`${a2.age>snapAtQueue.age?`<p>🎂 你满 ${a2.age} 岁了。</p>`:""}${(S.injury.months||0)>snapAtQueue.inj?`<p style="color:var(--bad)">🩹 ${esc(S.injury.name)}，预计伤停 ${S.injury.months} 个月。</p>`:""}${snapAtQueue.st!=="分手"&&S.relationship.status==="分手"?`<p style="color:var(--bad)">💔 你和小满走散了。</p>`:""}`;return `${extra}<div class="month-summary">${rows.join("")||'<div class="ms-row"><span>这个月平平淡淡</span></div>'}</div>`},options:[option("确认，进入下月","",()=>{S.monthSnap={ov:overall(S),fit:S.fitness,form:S.form,love:S.relationship.love,family:S.family,money:S.money||0,age:ageInfo(S).age,inj:S.injury.months||0,st:S.relationship.status}})]})}
  if(ctx.matchReportModal)modalQueue.unshift(ctx.matchReportModal);   // 简报排到月度小结之前
  if(!S.retired){const r=shouldRetire(S);if(r){retirePlayer(S,r);saveGame();return}}
  modalBusy=false;saveGame();renderAll();setTimeout(pumpModal,0)}

/* ========== 比赛流程：赛前预告 → 2个关键时刻 → 结算 → 交回月末段 ========== */
function startMatchFlow(s,ctx){
  const fx=fixtureOfMonth(s);
  if(!fx){finishMonth(ctx);return}
  s.pendingMatch={stage:"preview",fixture:fx,ctx,index:0,pending:null};
  modalBusy=false;
  stepMatchPreview(s);
}
/* 赛前预告：先看清对手，再决定怎么踢。
   三个选项就是本场职责——把行动页那个容易被忘掉的常驻设置搬到
   它真正起作用的时刻，且不比改动前多一次点击。 */
function startChance(s,opts={}){
  const club=opts.club||currentClub(s);
  return clamp(.42+(effOverall(s)-club.strength)/50+(s.coachFavor-50)/170+(hasTalent(s,"super_sub")?-.04:0),.15,.9);
}
function stepMatchPreview(s){
  const pm=s.pendingMatch,fx=pm.fixture,club=currentClub(s);
  const edge=club.strength-fx.strength,st=Math.round(startChance(s)*100);
  const edgeText=edge>=6?"纸面占优":edge<=-6?"纸面下风":"势均力敌";
  enqueueFront({title:`${fx.competition} · ${fx.home?"主场":"客场"}对阵 ${esc(fx.opponent)}`,kicker:"赛前",
    body:`<div class="match-score"><span class="match-team">${esc(club.name)}</span><strong>${club.strength} : ${fx.strength}</strong><span class="match-team">${esc(fx.opponent)}</span></div>`+
      `<p>${edgeText}。你的体能 <b>${Math.round(s.fitness)}</b>、状态 <b>${Math.round(s.form)}</b>，预计首发概率约 <b>${st}%</b>。</p>`+
      (s.seasonGoal?`<p class="dialogue">赛季目标：${esc(goalProgressText(s))}</p>`:"")+
      (s.challenge?`<p class="dialogue">教练挑战：${esc(s.challenge.text)}（${esc(challengeProgressText(s.challenge))}，剩余${Math.max(0,3-s.challenge.played)}场）</p>`:"")+
      `<p>本场你打算怎么踢？</p>`,
    options:MATCH_PLANS.map(p=>option(`${p.icon} ${p.name}`,p.effects.join(" · "),()=>beginMatch(s,p.id)))},"赛前");
}
function beginMatch(s,plan){
  const pm=s.pendingMatch,fx=pm.fixture;
  s.matchPlan=plan;
  pm.pending=prepareMatch(s,Math.random,{opponent:{name:fx.opponent,strength:fx.strength},
    home:fx.home,plan,competition:fx.competition});
  pm.stage="moments";
  if(!pm.pending.plays){resolveMatch(s);return}
  stepKeyMoment(s);
}
// 中断恢复：pumpModal 每次点击都存档，所以刷新页面必须能回到同一步。
function resumeMatchFlow(s){
  if(!s.pendingMatch)return false;
  modalBusy=false;
  if(s.pendingMatch.stage==="preview"||!s.pendingMatch.pending){stepMatchPreview(s);return true}
  if(!s.pendingMatch.pending.plays){resolveMatch(s);return true}
  stepKeyMoment(s);return true;
}
function stepKeyMoment(s){
  const pm=s.pendingMatch;if(!pm)return;
  const slot=pm.pending.moments[pm.index];
  if(!slot){resolveMatch(s);return}
  const m=MOMENTS.find(x=>x.id===slot.id);
  if(!m){pm.index++;stepKeyMoment(s);return}
  const behind=pm.pending.gf<pm.pending.ga,opts=momentOptions(s,m);
  enqueueFront({title:`第${slot.minute}分钟 · ${m.title}`,
    body:`<p>${esc(m.body.replace("{minute}",slot.minute))}</p><p class="dialogue">当前比分 ${pm.pending.club} ${pm.pending.gf}-${pm.pending.ga} ${pm.pending.opponent}。</p>`,
    options:opts.map((o,i)=>{
      const p=Math.round(momentSuccessRate(s,m,o,pm.pending.oppStrength,behind)*100);
      return option(o.text,`成功率约 ${p}% · ${o.tip}`,()=>{
        pm.pending.choices[pm.index]=i;pm.index++;saveGame();
        setTimeout(()=>stepKeyMoment(s),0);
      },o.risk==="bold"?"danger":o.risk==="safe"?"":"gold")
    })},"关键时刻");
}
function resolveMatch(s){
  const pm=s.pendingMatch;if(!pm)return;
  modalBusy=true;
  const ctx=pm.ctx,report=finishMatch(s,pm.pending);
  s.pendingMatch=null;
  applyMatch(s,report);
  /* 必须按 month 回查 s.schedule 里那个活对象，不能直接写 pm.fixture。
     saveGame 把 pendingMatch.fixture 和 schedule.fixtures[i] 序列化成两份，
     读档后它们就是两个对象；此时写 pm.fixture 等于写给一个孤儿副本，
     赛程上那场永远停在 upcoming，还会变成「月份在过去却未开打」的幽灵场次。
     点球的 penMatch 踩过一模一样的坑。 */
  if(pm.fixture){const fx=(s.schedule&&s.schedule.fixtures.find(f=>f.month===pm.fixture.month))||pm.fixture;
    fx.status="played";
    fx.result={gf:report.gf,ga:report.ga,goals:report.goals,assists:report.assists,rating:report.rating}}
  challengeProgress(s,report);
  ctx.matchReportModal={...buildMatchReportModal(report),kicker:report.classic?"经典之战":"比赛简报"};
  finishMonth(ctx);
}

function phaseCopy(s){const a=ageInfo(s).age,p=phaseOf(s);if(a<16)return["梯队成长期","通过训练和比赛争取留队"];if(a<18&&p==="firstteam")return["一线队学徒期","训练、替补和更衣室竞争都要适应"];if(a<18&&p==="overseas")return["海外青训期","先适应语言，再跟上训练强度"];if(a<18&&p==="campus")return["校园重启期","兼顾学业，为18岁的职业试训做准备"];return["职业生涯","转会、国家队和年度荣誉已经开放"]}

/* 七边形能力雷达。顶点顺序即 ATTRS 顺序，从正上方(-90°)顺时针每 360/7 度一个。
   R=64 时标签落在 x 36~204、y 22~193，均在 240×215 的 viewBox 内。 */
function radarSVG(s){
  const R=64,cx=120,cy=108,N=ATTRS.length;
  const pt=(i,k)=>{const t=(-90+i*360/N)*Math.PI/180;return[cx+R*k*Math.cos(t),cy+R*k*Math.sin(t)]};
  const ring=k=>ATTRS.map((_,i)=>pt(i,k).map(v=>v.toFixed(1)).join(",")).join(" ");
  let out=`<svg viewBox="0 0 240 215" width="100%" role="img" aria-label="能力雷达">`;
  [.25,.5,.75,1].forEach(k=>{out+=`<polygon points="${ring(k)}" fill="none" stroke="#ffffff${k===1?"28":"12"}" stroke-width="1"/>`});
  ATTRS.forEach((_,i)=>{const[x,y]=pt(i,1);out+=`<line x1="${cx}" y1="${cy}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}" stroke="#ffffff12" stroke-width="1"/>`});
  const data=ATTRS.map((a,i)=>pt(i,clamp(s.attrs[a.key],1,99)/100));
  out+=`<polygon points="${data.map(p=>p.map(v=>v.toFixed(1)).join(",")).join(" ")}" fill="#28d27d33" stroke="#28d27d" stroke-width="2" stroke-linejoin="round"/>`;
  data.forEach(([x,y])=>{out+=`<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="2.6" fill="#28d27d"/>`});
  ATTRS.forEach((a,i)=>{
    const[x,y]=pt(i,1.34),mid=Math.abs(x-cx)<4,anchor=mid?"middle":(x>cx?"start":"end"),dx=mid?0:(x>cx?2:-2);
    out+=`<text x="${(x+dx).toFixed(1)}" y="${(y-2).toFixed(1)}" fill="#9bb0a5" font-size="8.5" font-weight="800" text-anchor="${anchor}">${a.key}</text>`;
    out+=`<text x="${(x+dx).toFixed(1)}" y="${(y+8).toFixed(1)}" fill="#f5f2e9" font-size="13" font-weight="900" text-anchor="${anchor}">${Math.round(s.attrs[a.key])}</text>`;
  });
  return out+`</svg>`;
}
function renderAll(){if(!S||typeof document==="undefined")return;const a=ageInfo(S),[phase,hint]=phaseCopy(S);$("playerNameText").textContent=S.name;$("clubText").textContent=S.club.name;$("overallText").textContent=overall(S);$("radarOvr").textContent=overall(S);$("ageText").textContent=`${a.age}岁`;$("monthText").textContent=`第${a.month}月`;$("apText").textContent=`${S.actionPoints} / 3`;$("careerSubtitle").textContent=`第${a.season}赛季 · ${phase}`;$("phaseTitle").textContent=phase;$("phaseHint").textContent=`${hint} · ${S.totalMonth%2===0?"两个月后触发抉择":"下个月触发两月抉择"}`;{const el=$("nextMatch");if(el){ensureSchedule(S);const nf=nextFixture(S);
    if(S.injury.months>0)el.innerHTML=`<span class="nm-when">伤停中 · 预计 ${S.injury.months} 个月后复出</span>`;
    else if(!nf)el.innerHTML=`<span class="nm-when">本赛季赛程已打完</span>`;
    else{const n=fixtureCountdown(S,nf);
      el.innerHTML=`下一场 · ${nf.home?"主场":"客场"} vs <b>${esc(nf.opponent)}</b>`+
        `<span class="nm-when">（${esc(nf.competition)}） · ${n<=0?"本月末":`还有 ${n} 个月`}</span>`}}}$("fitnessText").textContent=Math.round(S.fitness);$("formText").textContent=Math.round(S.form);$("loveText").textContent=S.relationship.status==="分手"?"—":Math.round(S.relationship.love);$("fitnessBar").style.width=`${S.fitness}%`;$("formBar").style.width=`${S.form}%`;$("loveBar").style.width=`${S.relationship.love}%`;const moneyEl=$("moneyText");if(moneyEl){moneyEl.textContent=`${Math.round(S.money)}万`;moneyEl.style.color=S.money<0?"var(--bad)":"var(--gold)"}
  $("talentMini").innerHTML=S.talents.map(id=>`<span>${esc(talentById(id)?.name||id)}</span>`).join("");$("radarPanel").innerHTML=radarSVG(S);
  document.querySelectorAll("#gameNav button").forEach(b=>b.classList.toggle("active",b.dataset.tab===S.tab));renderTab();}

function renderTab(){const fn={actions:renderActions,story:renderStory,career:renderCareer,matches:renderMatches,transfer:renderTransfer,assets:renderAssets,national:renderNational,honours:renderHonours,rank:renderRank}[S.tab]||renderActions;fn()}
function renderAssets(){const d=diffOf(S),wage=S.salary>0?Math.round(S.salary*d.income):0,expense=S.salary>0?Math.round((1.5+S.fame/28)*d.expense):0,passive=assetPassive(S),net=wage-expense+passive,tm=Math.round((trainMult(S)-1)*100),inj=Math.round((1-assetInjuryFactor(S))*100);
  const card=it=>{const owned=ownedAsset(S,it.id),lock=owned?null:assetLocked(S,it),broke=!owned&&!lock&&S.money<it.cost,disabled=owned||lock||broke;return`<article class="action-card ${owned?"used":""}"><div class="action-icon">${it.icon}</div><h3>${esc(it.name)}</h3><p>${esc(it.desc)}</p><div class="effect-line"><span>${esc(it.effect)}</span><span>${it.cost}万</span></div><button data-buy="${it.id}" ${disabled?"disabled":""}>${owned?"已拥有":lock?esc(lock):broke?`资金不足 · 需${it.cost}万`:`购买 · ${it.cost}万`}</button></article>`};
  const sections=ASSET_CATS.map(cat=>{const items=ASSETS.filter(a=>a.cat===cat);if(!items.length)return"";return`<div class="section-head"><h2>${esc(cat)}</h2><span>${items.filter(a=>ownedAsset(S,a.id)).length}/${items.length}</span></div><div class="action-grid">${items.map(card).join("")}</div>`}).join("");
  $("panel").innerHTML=`<section class="hero-panel"><span class="eyebrow">MONEY & ASSETS</span><h2>你的账户与资产</h2><p>钱来自合同月薪、比赛奖金、媒体、代言和投资分红；用于礼物、家用、专业康复和下面的资产。资金、资产都计入生涯积分，欠款拉低积分。越贵的东西往往要靠年龄、声望或先置资产解锁——攒钱吧。</p>${heroMetrics([[`${Math.round(S.money)}万`,"个人资金"],[`${net>=0?"+":""}${net}/月`,"每月净收入"],[`+${passive}/月`,"投资被动收入"],[`+${tm}% · -${inj}%`,"训练加成 · 伤病"]])}</section>${sections}<div class="section-head"><h2>赚钱与花钱的入口</h2><span>大多在“行动”页</span></div><article class="info-card"><p>· 赚钱：进球助攻、媒体安排、赛季目标奖金、转会签字费、投资被动收入。<br>· 花钱：给小满买礼物、贴补家用、专业康复，以及本页资产。<br>· 提示：月薪按合同逐月发，生活开销随名气上涨；欠款每半年计息，尽早还清。</p></article>`;
  $("panel").querySelectorAll("[data-buy]").forEach(b=>b.addEventListener("click",()=>{if(buyAsset(S,b.dataset.buy)){toast("到手了");saveGame();renderAll()}else toast("买不了：资金或条件不足")}))}
function heroMetrics(items){return`<div class="metric-grid">${items.map(x=>`<div class="metric"><b>${esc(x[0])}</b><span>${esc(x[1])}</span></div>`).join("")}</div>`}

function renderActions(){const phase=phaseOf(S),available=ACTIONS.filter(a=>a.phases.includes(phase)&&(!a.show||a.show(S)));$("panel").innerHTML=`<section class="hero-panel"><span class="eyebrow">MONTHLY PLAN</span><h2>${esc(S.name)}，这个月你想怎么过？</h2><p>同一种行动每月最多执行${phase==="academy"?"一到两次":"两次"}。天赋会影响成功率和收益，但每种选择都有取舍。<span class="diff-inline">${esc(diffOf(S).name)}难度</span></p>${S.seasonGoal?`<div class="goal-banner"><span class="eyebrow">本赛季目标</span>${esc(goalProgressText(S))}</div>`:""}${S.challenge?`<div class="goal-banner challenge-banner"><span class="eyebrow">教练挑战 · ${esc((CHALLENGE_TIERS.find(t=>t.tier===S.challenge.tier)||{}).name||"")}</span>${esc(S.challenge.text)}<small>进度：${esc(challengeProgressText(S.challenge))}｜剩余${Math.max(0,3-S.challenge.played)}场</small></div>`:""}${heroMetrics([[`${S.actionPoints}/3`,"剩余执行点"],[overall(S),"综合能力"],[Math.round(S.coachFavor),"教练信任"],[S.injury.months?`${S.injury.months}月`:"健康","伤停状态"]])}</section>${S.lastActionFeedback?`<div class="feedback-banner"><span class="eyebrow">${esc(S.lastActionFeedback.name)}</span><p>${esc(S.lastActionFeedback.text)}</p><small>${esc(S.lastActionFeedback.effects)}</small></div>`:""}<div class="section-head"><h2>本场职责</h2><span>默认职责 · 赛前可改</span></div><div class="plan-seg">${MATCH_PLANS.map(p=>`<button class="${S.matchPlan===p.id?"on":""}" data-plan="${p.id}">${p.icon} ${esc(p.name)}</button>`).join("")}</div><div class="plan-seg-desc"><p>${esc(planOf(S).desc)}</p><div class="effect-line">${planOf(S).effects.map(e=>`<span>${esc(e)}</span>`).join("")}</div></div><div class="section-head"><h2>本月行动</h2><span>${available.length}项可选 · 点击即消耗1点</span></div><div class="action-grid">${available.map(a=>{const used=S.actionUsage[a.id]||0,broke=a.cost&&(S.money||0)<a.cost,injuredLock=S.injury.months>0&&!['recover','home','english','love_time','gift'].includes(a.id),disabled=S.actionPoints<=0||used>=a.max||broke||injuredLock;return`<article class="action-card ${used?"used":""}"><div class="action-icon">${a.icon}</div><h3>${esc(a.name)}</h3><p>${esc(a.desc)}</p><div class="effect-line">${a.effects.map(e=>`<span>${esc(e)}</span>`).join("")}</div><button data-action-id="${a.id}" ${disabled?"disabled":""}>${used>=a.max?"本月已完成":broke?`资金不足 · 需${a.cost}万`:injuredLock?"伤停不可用":used>0?"再练一次 · 收益60%":"执行 · 1点"}</button></article>`}).join("")}</div>`;$("panel").querySelectorAll("[data-action-id]").forEach(b=>b.addEventListener("click",()=>applyAction(b.dataset.actionId)));$("panel").querySelectorAll("[data-plan]").forEach(b=>b.addEventListener("click",()=>{S.matchPlan=b.dataset.plan;saveGame();renderAll();toast(`本场职责：${planOf(S).name}`)}))}

function renderStory(){const married=!!(S.flags&&S.flags.married);const relation=married?"你们成家了。她还是有自己的事业，你还是在球场上奔跑，但如今每天回去，有个人在等你。":S.relationship.status==="分手"?"你们已经分开，关系值不再变化，但共同经历仍留在生涯记录里。":S.relationship.status==="异地"?"隔着这么远还没散，可每次谁都不先开口，心就更远一点。":"她有自己的学业和生活，不可能一直围着你的比赛转。";$("panel").innerHTML=`<section class="hero-panel relation-card"><img src="assets/lin-xiaoman.webp" alt="林小满"><div><span class="eyebrow">林小满 · ${esc(married?"已婚":S.relationship.status)}</span><h2>${S.relationship.status==="分手"?"你们回到了各自的人生":`关系值 ${Math.round(S.relationship.love)}`}</h2><p class="quote">${relation}</p><div class="bar-label"><span>亲密与信任</span><b>${Math.round(S.relationship.love)}/100</b></div><div class="bar-wide"><i style="width:${S.relationship.love}%"></i></div>${S.relationship.status!=="分手"?`<div class="effect-line"><span>状态基线 +${loveSupport(S)}</span><span>每月状态 +${S.relationship.love>=65?2:1}</span><span>关系越高，状态越稳</span></div>`:""}</div></section><div class="section-head"><h2>人生记录</h2><span>最近${Math.min(30,S.log.length)}条</span></div><div class="story-list">${S.log.slice(0,30).map(l=>{const ai={age:14+Math.floor(l.month/12),month:l.month%12+1};return`<article class="story-log"><time>${ai.age}岁·${ai.month}月</time><div><h3>${l.kind==="action"?"行动":l.kind==="good"?"好消息":l.kind==="bad"?"代价":"故事"}</h3><p>${esc(l.text)}</p></div></article>`}).join("")}</div>`}

function renderCareer(){const a=ageInfo(S),c=S.statsCareer,winRate=c.matches?Math.round(c.wins/c.matches*100):0;$("panel").innerHTML=`<section class="hero-panel"><span class="eyebrow">CAREER FILE</span><h2>${esc(S.name)} · ${esc(S.position)}</h2><p>${esc(S.club.name)}，${a.age}岁。你能走多远，不只看最高属性；出勤、状态和每次选择也算数。</p>${heroMetrics([[c.matches,"正式比赛"],[c.goals,"生涯进球"],[c.assists,"生涯助攻"],[`${winRate}%`,"胜率"]])}</section><div class="career-grid"><article class="info-card path-card"><h3>生涯时间线</h3><div class="path-line"><b>14岁 · 重庆铜梁龙U16</b><span>进入当地知名俱乐部梯队</span></div><div class="path-line"><b>16岁 · ${S.flags.route16?S.route==="overseas"?"赴英青训":S.route==="campus"?"回到校园":"升入一线队":"尚未发生"}</b><span>${S.flags.route16?S.route==="overseas"?"与小满异地，独自适应海外":S.route==="campus"?"保留感情与学业，等待第二次机会":"在熟悉的城市开始成年足球":"16岁评估后决定去向"}</span></div><div class="path-line"><b>18岁 · ${S.flags.pro18?`效力${esc(S.club.name)}`:"转会市场尚未开放"}</b><span>${S.flags.pro18?"职业合同、转会与国家队系统开放":"继续积累实力、声望与教练信任"}</span></div></article><article class="info-card"><h3>七项主属性</h3><div class="effect-line">${ATTRS.map(a=>`<span>${a.key} ${esc(a.name)} ${Math.round(S.attrs[a.key])}</span>`).join("")}<span>语言 ${Math.round(S.language)}</span><span>声望 ${Math.round(S.fame)}</span><span>身高 ${S.heightCm}cm</span></div><p>七项都是真实数值，行动、比赛结果与进球判定全部由它们决定；状态与体能作为动态系数同时介入——体能见底时身体和速度掉得最狠，意志几乎不受影响。“关键球”不设单独数值，由意志、状态、赛事阶段和相关天赋共同影响。当前生涯积分 <b>${careerScore(S)}</b>。</p></article><article class="info-card style-card"><h3>流派（后天踢法）</h3><p>天赋是出生带来的，流派是练出来的。流派等级抬高对应属性的成长天花板——没有流派兜着的属性练到 88 左右就基本爬不动了。意志不归任何流派，它只从剧情和压力里长。</p>${STYLES.map(st=>{const exp=(S.styles&&S.styles[st.key])||0,lv=styleLevel(exp),next=styleNext(exp),pct=Math.min(100,Math.round(exp/next*100));return `<div class="style-row ${lv?"":"dim"}"><div class="style-head"><b>${st.icon} ${esc(st.name)} <small>${st.attrs.join("·")}</small></b><span class="style-lv">${lv?STYLE_NUMERALS[lv-1]+"级":"未入门"}</span></div><div class="bar-wide"><i style="width:${pct}%"></i></div><div class="bar-label"><span>${esc(lv?st.levels[lv-1]:st.desc)}</span><span>${Math.round(exp)}${lv<3?" / "+next:""}</span></div></div>`}).join("")}</article></div><div class="section-head"><h2>转会履历</h2><span>${S.transfers.length}次</span></div>${S.transfers.length?`<div class="card-list">${S.transfers.map(t=>`<article class="info-card"><h3>${esc(t.from)} → ${esc(t.to)}</h3><p>${14+Math.floor(t.month/12)}岁 · 转会费${t.fee}万 · ${esc(t.role)}</p></article>`).join("")}</div>`:'<div class="empty-state">尚未完成正式转会。</div>'}`}

function matchCard(m){return`<article class="info-card match-card ${m.classic?"classic":""}"><span class="eyebrow">${esc(m.competition)} · ${m.role}</span><div class="match-score"><span class="match-team">${esc(m.club)}</span><strong>${m.gf}:${m.ga}</strong><span class="match-team">${esc(m.opponent)}</span></div><div class="effect-line"><span>评分 ${m.rating||"—"}</span><span>${m.goals}球</span><span>${m.assists}助</span><span>${m.home?"主场":"客场"}</span></div><div class="timeline-list">${m.timeline.slice(-4).map(t=>`<div class="timeline-row"><b>${t.minute}'</b><span>${esc(t.text)}</span></div>`).join("")}</div></article>`}
/* 三种状态各有各的显示：打过的给比分，伤停/雪藏的给原因，未打的给倒计时。
   倒计时必须走 fixtureCountdown——直接写 f.month-cur 会差一位，
   而且 missed 的场次月份在过去，减出来是负的，会渲染成「-5个月后」。 */
function fixtureRow(f,cur,nextMonth){
  const done=f.status==="played"&&f.result,missed=f.status==="missed",r=f.result;
  const cls=done?(r.gf>r.ga?"win":r.gf<r.ga?"loss":""):missed?"miss":"pending";
  const n=fixtureCountdown({totalMonth:cur},f);
  const score=done?`${r.gf} : ${r.ga}`:missed?"未出战":n<=0?"本月末":`${n}个月后`;
  const age=14+Math.floor(f.month/12),mon=f.month%12+1;
  const tail=done?` · 你 ${r.goals}球 ${r.assists}助 · 评分 ${r.rating||"—"}`
    :missed?` · ${esc(f.missReason||"未出战")}`
    :` · 对手实力 ${f.strength}`;
  return `<div class="fixture-row ${f.month===nextMonth?"now":""} ${done||missed?"done":""}">`+
    `<div class="fx-when">${age}岁<br>第${mon}月</div>`+
    `<div class="fx-opp"><b>${f.home?"主":"客"} vs ${esc(f.opponent)}</b>`+
    `<span class="fx-meta">${esc(f.competition)}${tail}</span></div>`+
    `<div class="fx-score ${cls}">${score}</div></div>`;
}
function renderMatches(){
  const c=S.statsCareer;ensureSchedule(S);
  const fx=(S.schedule&&S.schedule.fixtures)||[],played=fx.filter(f=>f.status==="played").length;
  $("panel").innerHTML=`<section class="hero-panel"><span class="eyebrow">FIXTURES</span><h2>强不等于稳赢</h2><p>能力越高，发挥通常越稳；但状态、疲劳、伤停、对手强弱和临场运气都会影响结果。赛程在赛季初就排定，你可以提前为硬仗调整体能与状态。</p>${heroMetrics([[`${played}/${fx.length}`,"本赛季已打"],[c.goals,"生涯进球"],[c.matches,"生涯出场"],[c.bestRating.toFixed?.(1)||c.bestRating,"最佳评分"]])}</section>`+
    `<div class="section-head"><h2>本赛季日程</h2><span>第${ageInfo(S).season}赛季 · ${fx.length}场</span></div>`+
    `<div class="card-list">${fx.length?(()=>{const nf=nextFixture(S);return fx.map(f=>fixtureRow(f,S.totalMonth,nf&&nf.month)).join("")})():'<div class="empty-state">赛程尚未排定。</div>'}</div>`+
    `<div class="section-head"><h2>最近比赛</h2><span>${S.matches.length}场已归档</span></div>`+
    `<div class="card-list">${S.matches.length?S.matches.slice(0,12).map(matchCard).join(""):'<div class="empty-state">结束月份后，第一场简报会出现在这里。</div>'}</div>`;
}

function renderTransfer(){if(ageInfo(S).age<18){$("panel").innerHTML=`<div class="locked-panel"><div class="lock">⌁</div><h2>转会市场将在18岁开放</h2><p>16岁的选择会影响职业起点。即使回到校园，18岁时仍有机会参加职业试训。</p></div>`;return}$("panel").innerHTML=`<section class="hero-panel"><span class="eyebrow">TRANSFER MARKET</span><h2>${esc(S.club.name)} · 身价约 ${Math.max(120,Math.round((overall(S)-50)*38+S.fame*8))}万</h2><p>报价会参考能力、年龄、声望、赛季数据和天赋。球队越强，比赛强度越高，首发也越难拿。个人资金可以用来给小满买礼物、贴补家用和专业康复，也会计入生涯积分。${S.debt?`<br><b>当前欠款 ${S.debt} 万</b>，会拉低生涯积分，记得用工资或“贴补家用”还清。`:""}</p>${heroMetrics([[overall(S),"综合能力"],[Math.round(S.fame),"声望"],[S.offers.length,"有效报价"],[`${Math.round(S.money)}万`,"个人资金"]])}</section><div class="section-head"><h2>收到的报价</h2><button id="askOffers" class="small-button" ${S.actionPoints<1?"disabled":""}>联系经纪人 · 1点</button></div><div class="card-list">${S.offers.length?S.offers.map(o=>`<article class="offer-card"><div><span class="eyebrow">${esc(o.league)} · ${esc(o.role)}</span><h3>${esc(o.club)}</h3><p>俱乐部强度 ${o.strength} · 转会费 ${o.fee}万 · 报价剩余${o.months}个月</p><div class="offer-actions"><button class="small-button" data-offer="${o.id}">接受报价</button></div></div><div class="salary"><b>${o.salary}万</b><br><span class="tag">月薪</span></div></article>`).join(""):'<div class="empty-state">当前没有有效报价。每半年会自动刷新，也可以消耗1点联系经纪人。</div>'}</div>`;$("askOffers")?.addEventListener("click",()=>{if(S.actionPoints<1)return;S.actionPoints--;generateOffers(S,3);log(S,"action","联系经纪人了解转会市场。");saveGame();renderAll()});$("panel").querySelectorAll("[data-offer]").forEach(b=>b.addEventListener("click",()=>{enqueueDecision({title:"确认完成转会？",body:`离开${esc(S.club.name)}后，现有教练信任与首发顺位会重新计算。`,options:[option("签署合同","转会立即生效",()=>acceptOffer(S,b.dataset.offer),"gold"),option("再考虑一下","报价继续保留",()=>{})]},"转会确认")}))}

function renderNational(){if(!S.national.called){const avg=S.seasonStats.matches?S.seasonStats.ratingTotal/S.seasonStats.matches:0;$("panel").innerHTML=`<div class="locked-panel"><div class="lock">★</div><h2>国家队大门尚未打开</h2><p>当前${esc(diffOf(S).name)}难度下，通常需要综合能力达到 ${(hasTalent(S,"red_shirt")?71:74)+diffOf(S).threshold}，并保持赛季平均评分 ${(6.7+diffOf(S).threshold*.02).toFixed(1)} 以上。当前能力 ${overall(S)}，赛季平均 ${avg?avg.toFixed(1):"—"}。</p></div>`;return}$("panel").innerHTML=`<section class="hero-panel"><span class="eyebrow">CHINA NATIONAL TEAM</span><h2>穿上国家队球衣</h2><p>国家队比赛每半年触发。你可能受伤，也可能被安排到不熟悉的位置；实力足够时，还能带队冲过世预赛、征战世界杯。</p>${heroMetrics([[S.national.caps,"国家队出场"],[S.national.goals,"国家队进球"],[Math.round(S.national.adapt),"战术适应"],[S.national.worldCups,"世界杯次数"]])}</section><div class="section-head"><h2>国家队说明</h2><span>每4年一届世界杯</span></div><article class="info-card"><h3>世界杯赛制</h3><p>每4年一届：先打<b>世预赛</b>（八场亚洲区，积分够才出线，全队实力随你的综合能力提升）；出线后<b>随机抽签</b>分组，<b>逐场进行</b>小组赛与淘汰赛；淘汰赛前可选<b>临场基调</b>（稳守／均衡／强攻）左右赔率，一路赢到底即是世界冠军。</p></article><article class="info-card"><h3>当前角色</h3><p>${overall(S)>=90?"世界级核心，球队会围绕你的终结能力组织进攻。":overall(S)>=82?"稳定主力，拥有改变亚洲级强强对话的能力。":"轮换前锋，需要在有限时间内证明自己。"}${S.flags.outOfPosition?" 教练还会把你安排到右侧承担防守职责。":""}</p><div class="effect-line"><span>身披红色战袍</span><span>${hasTalent(S,"red_shirt")?"红色战袍天赋":"常规征召"}</span><span>${S.flags.captain?"国家队队长候选":"竞争队内地位"}</span></div></article>`}

function renderHonours(){const c=S.statsCareer;$("panel").innerHTML=`<section class="hero-panel"><span class="eyebrow">TROPHY ROOM</span><h2>你的奖杯和纪录</h2><p>奖杯、成就和生涯数据都会保存在本地。金球奖会综合赛季进球、助攻、平均评分、联赛级别、国家队表现和团队荣誉。</p>${heroMetrics([[S.honours.length,"奖杯与大赛荣誉"],[S.awards.length,"金球奖"],[c.goals,"生涯进球"],[c.assists,"生涯助攻"]])}</section><div class="section-head"><h2>奖杯陈列室</h2><span>${S.honours.length}件</span></div>${S.honours.length?`<div class="trophy-shelf">${S.honours.map(h=>`<article class="honour-card"><div class="trophy-icon">${esc(h.icon||"♛")}</div><b>${esc(h.title)}</b><span>第${h.season}赛季 · ${esc(h.detail||"")}</span></article>`).join("")}</div>`:'<div class="empty-state">奖杯架还空着。真正的职业生涯刚刚开始。</div>'}<div class="section-head"><h2>成就系统</h2><span>${Object.keys(META.unlocked).length}/${ACHIEVEMENTS.length}</span></div><div class="achievement-grid">${ACHIEVEMENTS.map(a=>`<article class="achievement-card ${META.unlocked[a.id]?"":"locked"}"><div class="ach-icon">${a.icon}</div><div><b>${esc(a.name)}</b><span>${esc(a.desc)}</span></div></article>`).join("")}</div>`}

function renderRank(){updateRanking(S);const rankings=META.rankings;$("panel").innerHTML=`<section class="hero-panel"><span class="eyebrow">LOCAL LEGENDS</span><h2>这台设备上的绿茵传奇</h2><p>排行只保存在本地浏览器，不上传姓名或存档。每个赛季和关键结算都会更新当前生涯的最好成绩。</p>${heroMetrics([[careerScore(S),"当前积分"],[rankings.findIndex(x=>x.runId===S.runId)+1||"—","本地名次"],[META.runs,"开档次数"],[Object.keys(META.unlocked).length,"已解锁成就"]])}</section><div class="section-head"><h2>本地生涯排行</h2><span>最多保留10档</span></div><article class="rank-card"><table class="rank-table"><thead><tr><th>排名</th><th>球员</th><th>俱乐部</th><th>年龄</th><th>进球</th><th>积分</th></tr></thead><tbody>${rankings.map((r,i)=>`<tr class="${r.runId===S.runId?"me":""}"><td>${i+1}</td><td>${esc(r.name)}</td><td>${esc(r.club)}</td><td>${r.age}</td><td>${r.goals}</td><td><b>${r.score}</b></td></tr>`).join("")}</tbody></table></article>`}

function randomTalents(){return TALENTS.slice().sort(()=>Math.random()-.5).slice(0,3).map(t=>t.id)}
function renderCreator(){const left=ALLOC_BUDGET-Object.values(creatorAllocation).reduce((a,b)=>a+b,0);$("pointsLeft").textContent=left;
// 身高卡的 cm 与修正全部从 HEIGHT_TIERS 现算，不另抄一份数字，改表即改界面。
$("heightPicker").innerHTML=Object.entries(HEIGHT_TIERS).map(([k,t])=>`<button class="height-card ${creatorHeight===k?"active":""}" type="button" data-height="${k}"><b>${esc(t.name)}</b><span>成年 ${t.cm}cm</span><p>${Object.entries(t.adj).map(([a,v])=>`${ATTRS.find(x=>x.key===a).name}${v>0?"+":""}${v}`).join(" ")||"七项都不加不减"}</p></button>`).join("");$("heightPicker").querySelectorAll("[data-height]").forEach(b=>b.addEventListener("click",()=>{creatorHeight=b.dataset.height;renderCreator()}));$("attributeAllocator").innerHTML=ATTRS.map(x=>`<div class="allocate-row"><div class="allocate-name"><b>${x.icon} ${x.key} ${x.name}</b><span>${x.sub}</span></div><div class="allocate-track"><i style="width:${creatorAllocation[x.key]*5}%"></i></div><button class="step-btn" data-stat="${x.key}" data-delta="-1" ${creatorAllocation[x.key]<=0?"disabled":""}>−</button><button class="step-btn" data-stat="${x.key}" data-delta="1" ${left<=0?"disabled":""}>＋</button><div class="allocate-value">${creatorAllocation[x.key]}</div></div>`).join("");$("talentDraft").innerHTML=creatorTalents.map(id=>{const t=talentById(id);return`<article class="talent-card"><span class="sigil">${t.icon}</span><b>${esc(t.name)}</b><p>${esc(t.desc)}</p></article>`}).join("");const dp=$("difficultyPicker");if(dp){dp.innerHTML=Object.values(DIFFICULTIES).map(d=>`<button class="diff-card ${creatorDifficulty===d.key?"active":""}" data-diff="${d.key}"><b>${esc(d.name)}</b><span class="diff-tag">${esc(d.tag)}</span><p>${esc(d.desc)}</p></button>`).join("");dp.querySelectorAll("[data-diff]").forEach(b=>b.addEventListener("click",()=>{creatorDifficulty=b.dataset.diff;renderCreator()}))}
$("rerollTalents").disabled=rerollsLeft<=0;$("startGame").disabled=left!==0||creatorTalents.length!==3||!$("playerName").value.trim();$("attributeAllocator").querySelectorAll("[data-stat]").forEach(b=>b.addEventListener("click",()=>{const k=b.dataset.stat,d=Number(b.dataset.delta),remaining=ALLOC_BUDGET-Object.values(creatorAllocation).reduce((a,v)=>a+v,0);if(d>0&&remaining<=0||d<0&&creatorAllocation[k]<=0)return;creatorAllocation[k]+=d;renderCreator()}))}

function renderPrologue(){const p=PROLOGUE[prologueIndex];$("prologuePortrait").src=p.portrait;$("prologueKicker").textContent=p.kicker;$("prologueTitle").textContent=p.title;$("prologueBody").innerHTML=p.body.map(x=>`<p>${x}</p>`).join("");$("prologueProgress").style.width=`${(prologueIndex+1)/PROLOGUE.length*100}%`;$("nextPrologue").innerHTML=prologueIndex===PROLOGUE.length-1?"进入梯队 <span>→</span>":"继续 <span>→</span>"}
function showGame(){$("menu")?.classList.add("hidden");$("creator").classList.add("hidden");$("prologue").classList.add("hidden");$("ending")?.classList.add("hidden");$("game").classList.remove("hidden");if(S.retired){showEnding(S);return}updateRanking(S);saveGame();renderAll();if(S.pendingMatch)setTimeout(()=>resumeMatchFlow(S),60)}
function showEnding(s){const e=buildEnding(s),el=$("ending");if(typeof document==="undefined"||!el)return;$("game").classList.add("hidden");$("modalMask").classList.add("hidden");el.classList.remove("hidden");
  $("endingBody").innerHTML=`<span class="eyebrow">CAREER OVER · ${esc(e.difficulty)}难度</span><h2>${esc(s.name)} · ${e.age}岁挂靴</h2><div class="ending-grade">${esc(e.grade)}</div><p class="ending-line">${e.line}</p>
  <div class="metric-grid">${e.metrics.map(x=>`<div class="metric"><b>${esc(x[0])}</b><span>${esc(x[1])}</span></div>`).join("")}</div>
  <p class="ending-line">生涯最高能力 <b>${e.peak}</b> · 最终生涯积分 <b>${e.score}</b></p>
  <p class="ending-line">${e.loveEnd}</p>${e.coda?`<p class="ending-line">${e.coda}</p>`:""}
  ${e.honours.length?`<div class="section-head"><h2>奖杯陈列</h2><span>${e.honours.length}件</span></div><div class="trophy-shelf">${e.honours.map(h=>`<article class="honour-card"><div class="trophy-icon">${esc(h.icon||"♛")}</div><b>${esc(h.title)}</b><span>第${h.season}赛季 · ${esc(h.detail||"")}</span></article>`).join("")}</div>`:`<p class="ending-line">奖杯架空着，但父亲那只旧足球，一直摆在你家最显眼的位置。</p>`}
  <button id="endingRestart" class="primary-cta" type="button">开启新的生涯 <span>→</span></button>`;
  $("endingRestart").addEventListener("click",()=>{try{localStorage.removeItem(SAVE_KEY)}catch(e){}S=null;modalQueue=[];modalBusy=false;$("continueBtn")?.remove();creatorAllocation={...START_ALLOC};creatorHeight="mid";creatorTalents=randomTalents();rerollsLeft=1;el.classList.add("hidden");$("creator").classList.remove("hidden");renderCreator()})}
function startNewGame(){const name=$("playerName").value.trim();$("continueBtn")?.remove();modalBusy=false;modalQueue=[];S=createInitialState(name,creatorAllocation,creatorTalents,creatorDifficulty,creatorHeight);META.runs=(META.runs||0)+1;saveMeta();saveGame();prologueIndex=0;$("creator").classList.add("hidden");$("prologue").classList.remove("hidden");renderPrologue()}
function requestRestart(){if(!S){location.reload();return}enqueueDecision({title:"重新开始这段生涯？",body:`当前${ageInfo(S).age}岁的进度会被新存档覆盖。本地成就与历史排行会保留。`,options:[option("保留当前进度","返回游戏",()=>{}),option("确认重开","清除当前存档，回到创建球员",()=>{try{localStorage.removeItem(SAVE_KEY)}catch(e){}S=null;modalQueue=[];modalBusy=false;$("continueBtn")?.remove();creatorAllocation={...START_ALLOC};creatorHeight="mid";creatorTalents=randomTalents();rerollsLeft=1;$("game").classList.add("hidden");$("creator").classList.remove("hidden");renderCreator()},"danger")]},"重新开档")}

function init(){
  creatorTalents=randomTalents();renderCreator();
  const saved=loadGame();
  if(saved){$("menuContinue").classList.remove("hidden");$("menuContinue").innerHTML=`继续 · ${esc(saved.name)} · ${ageInfo(saved).age}岁 <span>→</span>`;$("menuContinue").addEventListener("click",()=>{if(!loadGame())return;S=saved;$("menu").classList.add("hidden");showGame();resumeWorldCup(S)})}else{$("menuNew").className="primary-cta"}
  $("menuNew").addEventListener("click",()=>{$("menu").classList.add("hidden");$("creator").classList.remove("hidden");renderCreator()});
  ["gesturestart","gesturechange","gestureend"].forEach(ev=>document.addEventListener(ev,e=>e.preventDefault(),{passive:false}));
  $("playerName").addEventListener("input",renderCreator);$("rerollTalents").addEventListener("click",()=>{if(rerollsLeft<=0)return;creatorTalents=randomTalents();rerollsLeft--;renderCreator()});$("startGame").addEventListener("click",startNewGame);$("nextPrologue").addEventListener("click",()=>{const now=Date.now();if(now-prologueClickAt<300)return;prologueClickAt=now;if(prologueIndex<PROLOGUE.length-1){prologueIndex++;renderPrologue()}else showGame()});
  document.addEventListener("keydown",trapModalFocus);
  $("gameNav").addEventListener("click",e=>{const b=e.target.closest("button[data-tab]");if(!b||!S)return;S.tab=b.dataset.tab;saveGame();renderAll()});$("endMonthBtn").addEventListener("click",()=>advanceMonth());$("saveBtn").addEventListener("click",()=>toast(saveGame()?"进度已保存在本机":"保存失败"));$("restartBtn").addEventListener("click",requestRestart);
}

const API={VERSION,TALENTS,ATTRS,ATTR_KEYS,START_ALLOC,ALLOC_BUDGET,HEIGHT_TIERS,gain,softFactor,ACTIONS,COMBOS,STYLES,MOMENTS,MATCH_PLANS,MATCH_ACTION_LINES,CHALLENGE_TIERS,EVENTS,ACHIEVEMENTS,CSL_CLUBS,PL_CLUBS,DIFFICULTIES,createInitialState,overall,cond,eff,effOverall,atk,def,COND_SENS,loveSupport,ageInfo,phaseOf,chooseRandomEvent,simulateMatchCore,applyMatch,routeChoice16,setRoute,enterProAt18,generateOffers,acceptOffer,nationalSelectionCheck,simulateNationalMatch,simulateQualifiers,wcMatchSim,wcDraw,startWorldCup,seasonAwardCheck,careerScore,applyAging,shouldRetire,buildEnding,makeSeasonGoal,evaluateSeasonGoal,breakupCheck,normalizeSave,migrateV2toV3,radarSVG,prepareMatch,startChance,ensureSchedule,buildSchedule,fixtureOfMonth,nextFixture,fixtureCountdown,fixtureRow,shouldPlayMatch,resumeWorldCup,PENALTY_OPTIONS,penaltyKickerRound,penaltyRate,teamPenaltyRate,wcFinalEve,wcOutroScene,wcFinish,newShootout,shootoutAdvance,shootoutPlayerKick,finishMatch,styleLevel,styleCapLevel,styleOf,addStyleExp,topStyle,momentSuccessRate,momentOptions,pickMoments,challengeProgress,challengeMet,challengeProgressText,newChallengeAcc,checkCombos,ASSETS,buyAsset,assetPassive,assetValue,assetLocked,trainMult,advanceMonth:()=>advanceMonth(true),getState:()=>S,setState:s=>{S=s},
  /* 测试接缝：无 document 时 pumpModal 直接返回，弹窗只进队列不消费，
     于是测试可以自己把队列跑完。必须是取值函数——modalQueue 有 5 处整体
     重新赋值，导出数组引用会拿到悬空的旧数组。 */
  getModalQueue:()=>modalQueue,clearModalQueue:()=>{modalQueue=[];modalBusy=false},resumeMatchFlow};
if(typeof window!=="undefined")window.PlayerLife=API;else if(typeof globalThis!=="undefined")globalThis.PlayerLife=API;
if(typeof document!=="undefined")document.addEventListener("DOMContentLoaded",init);
