(function () {
  "use strict";

  const STORAGE_KEY = "dating_health_records_v1";
  const LANG_KEY = "dating_health_language_v1";

  // 等你确认阈值后，把这里改成具体数字：已出现多少条特征词后禁止“喝杯酒/套套话”。
  const PROBE_FEATURE_LIMIT = null;
  const PROBE_RANDOM_AVAILABILITY_RATE = 0.82;
  const VISIBLE_TAG_COUNT = 3;
  const HIDDEN_TAG_COUNT = 1;
  const OBVIOUS_HEALTHY_RATE = 0.05;

  const I18N = {
    zh: {
      appTitle: "日抛模拟器",
      desireLabel: "🔥 生理欲望",
      loadLabel: "🧠 心理负荷",
      panicWarning: "",
      coffeeTitle: "现场测试",
      coffeeUse: "检测当前对象",
      restTitle: "去医院检查",
      restCost: "欲望+20 / 负荷清零",
      taskHeading: "约会对象",
      probeButton: "喝杯酒/套套话",
      probeMeta: "（欲望+3）",
      oralCondomAction: "戴套口交",
      oralCondomMeta: "负荷+3 | 欲望-4",
      sexCondomAction: "戴套性交",
      sexCondomMeta: "负荷+8 | 欲望-8",
      oralRawAction: "无套口交",
      oralRawMeta: "负担+20 | 性欲-14",
      sexRawAction: "无套性交",
      sexRawMeta: "负担+32 | 欲望-24",
      skipAction: "癞蛤蟆想吃天鹅肉",
      skipMeta: "欲望+10 / 负荷+2",
      refuseAction: "",
      introTitle: "日抛模拟器",
      introLine1: "",
      introLine2: "",
      introLine3: "",
      startButton: "开始游戏",
      helpButton: "",
      helpTitle: "",
      winTitle: "",
      winRule1: "",
      winRule2: "",
      loseTitle: "",
      loseRule1: "",
      loseRule2: "",
      loseRule3: "",
      coreTitle: "",
      coreRule: "",
      gotIt: "",
      viewHistory: "查看详细复盘",
      nextButton: "下一回合",
      restartButton: "重新开始",
      historyTitle: "详细约会记录",
      backSummary: "返回结算页面",
      hiddenInfo: "线索未明",
      panicHidden: "",
      probeUnavailable: "现在不适合继续套话",
      probeTitle: "又套出一点细节",
      probeMessage: "对方补了一句，看似更清楚，却也更难完全放心。",
      actionFeedbackTitle: "这一轮结束",
      actionFeedbackMessage: "你做出了选择，记录已经留下。",
      leaveGoodTitle: "",
      leaveGoodMessage: "",
      collapseTitle: "CPU 被焦虑烧穿了",
      collapseMessage: "心理负荷涨到 100，你已经没法继续冷静判断。今晚先到此为止。",
      expiredTitle: "约会结束",
      expiredMessage: "你撑过了全部回合，复盘里保留了每次判断。",
      goodWinTitle: "欲望已关机，智商已重启",
      goodWinMessage: "你冷静下来了，游戏结算。",
      statsTitle: "生涯结果",
      survivedTurns: "回合",
      emptyHistory: "暂无复盘记录",
      recordAction: "选择",
      recordDebt: "风险记录",
      copied: "复盘已复制"
    },
    en: {}
  };

  I18N.en = { ...I18N.zh };

  const ACTIONS = {
    light: { desire: -4, load: 3, exposure: 0.06, labelKey: "oralCondomAction" },
    steady: { desire: -8, load: 8, exposure: 0.1, labelKey: "sexCondomAction" },
    shortcut: { desire: -14, load: 20, exposure: 0.34, labelKey: "oralRawAction" },
    rush: { desire: -24, load: 32, exposure: 0.62, labelKey: "sexRawAction" }
  };

  const ACTION_RISK_CAPS = {
    light: { HIV: 0.03, SYPHILIS: 0.14, GONORRHEA: 0.18, HPV: 0.16 },
    steady: { HIV: 0.06, SYPHILIS: 0.22, GONORRHEA: 0.18, HPV: 0.3 },
    shortcut: { HIV: 0.12, SYPHILIS: 0.35, GONORRHEA: 0.45, HPV: 0.38 },
    rush: { HIV: 0.2, SYPHILIS: 0.5, GONORRHEA: 0.42, HPV: 0.65 }
  };

  const DISEASE_LABELS = {
    HIV: "艾滋病",
    SYPHILIS: "梅毒",
    GONORRHEA: "淋病",
    HPV: "尖锐湿疣"
  };

  const ACTION_LABELS = {
    light: "戴套口交",
    steady: "戴套性交",
    shortcut: "无套口交",
    rush: "无套性交",
    skip: "跳过",
    refuse: "拒绝/离开",
    chat: "套话",
    test: "现场测试",
    hospital: "医院检查"
  };

  function clue(text, disease, scores, targets = "both") {
    const score = Math.max(...Object.values(scores));
    return {
      text,
      disease,
      targets: Array.isArray(targets) ? targets : [targets],
      scores,
      score,
      risk: true,
      color: colorForScore(score),
      drawWeight: drawWeightForScore(score)
    };
  }

  function neutral(text, color = "tag-neutral") {
    return {
      text,
      risk: false,
      color,
      drawWeight: color === "tag-warn" ? 1.6 : 2.4
    };
  }

  function healthy(text, matches = []) {
    return {
      text,
      matches,
      normal: true,
      risk: false,
      color: "tag-safe",
      drawWeight: 1
    };
  }

  function role(text, roleRisk, targets = "both") {
    return {
      text,
      roleRisk,
      targets: Array.isArray(targets) ? targets : [targets],
      risk: false,
      color: colorForRoleRisk(roleRisk),
      drawWeight: drawWeightForRoleRisk(roleRisk)
    };
  }

  function colorForScore(score) {
    if (score >= 80) return "tag-bad";
    if (score >= 55) return "tag-risk";
    if (score >= 35) return "tag-warn";
    return "tag-neutral";
  }

  function colorForRoleRisk(score) {
    if (score >= 76) return "tag-bad";
    if (score >= 58) return "tag-risk";
    if (score >= 36) return "tag-warn";
    if (score <= 15) return "tag-safe";
    return "tag-neutral";
  }

  function drawWeightForScore(score) {
    if (score >= 85) return 0.45;
    if (score >= 75) return 0.75;
    if (score >= 60) return 1.25;
    if (score >= 40) return 2.1;
    return 3.6;
  }

  function drawWeightForRoleRisk(score) {
    if (score >= 76) return 0.7;
    if (score >= 58) return 0.95;
    if (score >= 36) return 1.2;
    return 1.45;
  }

  const DATE_LINES = [
    "“你这么看着我，我会误会的。”",
    "“靠近一点，我不喜欢隔着这么远说话。”",
    "“别一直想风险，先看看我。”",
    "“你紧张的时候，反而挺可爱。”",
    "“今晚别太理性，好吗？”",
    "“你要是害怕，我可以慢一点。”",
    "“别急着判断我，先感受一下。”",
    "“你越犹豫，我越想逗你。”",
    "“灯暗一点，你会更放松。”",
    "“我猜你不是第一次心动又不敢承认。”",
    "“别盯着线索，看我。”",
    "“你问得越认真，我越想让你忘掉问题。”",
    "“你可以拒绝，但你真的舍得吗？”",
    "“我喜欢你这种明明想要、还装冷静的人。”",
    "“今晚只要开心一点，不好吗？”",
    "“别把气氛弄得像审问。”",
    "“你靠近一点，我告诉你一个秘密。”",
    "“你越防备，我越想知道你在怕什么。”",
    "“别紧张，我又不会吃了你。”",
    "“你现在走，可能会一直想我。”",
    "“我看得出来，你不是完全没兴趣。”",
    "“你眼神已经出卖你了。”",
    "“再喝一点，你会诚实很多。”",
    "“别把每件事都想成最坏的结果。”",
    "“你要是愿意，我今晚可以只属于你。”",
    "“你不用马上决定，先别离我太远。”",
    "“你越装镇定，我越想拆穿你。”",
    "“你明明已经动摇了。”",
    "“我喜欢被认真选择的感觉。”",
    "“你可以慢慢确认，但别让我等太久。”",
    "“你不说话的时候，更像是在邀请我。”",
    "“我今天只想见你，不想聊那些扫兴的事。”",
    "“你怕的是我，还是你自己？”",
    "“别总想着后果，偶尔也该想想现在。”",
    "“我保证，今晚会让你记很久。”",
    "“如果你相信直觉，现在应该留下。”",
    "“你不靠近，我怎么让你放心？”",
    "“你越谨慎，我越想证明给你看。”",
    "“别急着逃，故事才刚开始。”",
    "“你今晚看起来，很适合犯一点错。”",
    "“你可以装作不想，但我不一定会信。”",
    "“别把我当成题目，我不是让你考试的。”",
    "“你想问什么都可以，只要你别走。”",
    "“如果你还在犹豫，那说明我还有机会。”",
    "“你现在的表情，比答案有意思多了。”"
  ];

  const ROLE_CLUES = [
    role("考研压力怪", 22),
    role("健身教练", 42),
    role("篮球运动员", 34, "male"),
    role("芭蕾舞者", 18, "female"),
    role("夜班护士", 24),
    role("急诊医生", 22),
    role("实习医生", 20),
    role("医学生", 18),
    role("牙医", 16),
    role("心理咨询师", 14),
    role("理疗师", 28),
    role("瑜伽老师", 26, "female"),
    role("舞蹈老师", 30),
    role("酒吧驻唱", 48),
    role("乐队主唱", 52),
    role("乐队鼓手", 44),
    role("独立摄影师", 38),
    role("短视频博主", 42),
    role("擦边主播", 66),
    role("美妆博主", 28, "female"),
    role("剧本杀主持", 34),
    role("密室NPC", 30),
    role("调酒师", 54),
    role("夜店常客", 70),
    role("DJ学徒", 58),
    role("纹身师", 36),
    role("咖啡师", 20),
    role("甜品店店员", 14),
    role("空乘", 32),
    role("飞行员", 34, "male"),
    role("高铁乘务员", 24),
    role("旅游博主", 46),
    role("留学生", 32),
    role("海归精英", 34),
    role("投行新人", 40),
    role("销售冠军", 44),
    role("保险顾问", 30),
    role("房产中介", 32),
    role("创业失败者", 28),
    role("小公司老板", 36, "male"),
    role("程序员", 18),
    role("游戏策划", 20),
    role("电竞陪练", 22),
    role("漫画社社长", 18),
    role("Cosplayer", 34),
    role("摄影棚模特", 44),
    role("服装设计师", 24),
    role("美术生", 24),
    role("音乐学院学生", 34),
    role("体育学院学生", 36),
    role("游泳教练", 34),
    role("拳击教练", 32),
    role("滑板少年", 28, "male"),
    role("机车玩家", 34, "male"),
    role("露营爱好者", 18),
    role("徒步领队", 20),
    role("宠物店店员", 12),
    role("花店老板", 14, "female"),
    role("书店店员", 10),
    role("图书馆常客", 10),
    role("文艺青年", 24),
    role("诗歌爱好者", 18),
    role("失眠打工人", 20),
    role("加班社畜", 18),
    role("夜班保安", 16, "male"),
    role("便利店夜班员", 16),
    role("刚分手的人", 48),
    role("暧昧高手", 68),
    role("嘴甜骗子", 74),
    role("高冷慢热型", 18),
    role("过度热情型", 54),
    role("控制欲很强的人", 44),
    role("自称很干净的人", 64),
    role("拒绝被追问的人", 72),
    role("喜欢转移话题的人", 58),
    role("边界感模糊的人", 76),
    role("看起来很乖的人", 18),
    role("经历很多的人", 42),
    role("社交软件重度用户", 78),
    role("24小时在线的人", 72),
    role("刚结束上一段关系的人", 46),
    role("长期单身的人", 14),
    role("朋友很多的人", 34),
    role("总说自己忙的人", 28),

    role("寂寞男大", 36, "male"),
    role("宅男", 16, "male"),
    role("金融男", 42, "male"),
    role("体育学院男生", 36, "male"),
    role("音乐学院男生", 34, "male"),
    role("二次元宅男", 16, "male"),
    role("健身房猛男", 48, "male"),
    role("社交软件男神", 72, "male"),
    role("自称专一的前任哥", 52, "male"),
    role("嘴很甜的学长", 58, "male"),
    role("刚失恋的男生", 48, "male"),
    role("总说自己很忙的男人", 36, "male"),

    role("寂寞女大", 36, "female"),
    role("宅女", 16, "female"),
    role("金融女", 38, "female"),
    role("体育学院女生", 34, "female"),
    role("音乐学院女生", 34, "female"),
    role("二次元宅女", 16, "female"),
    role("健身房辣妹", 48, "female"),
    role("社交软件女神", 72, "female"),
    role("自称专一的前任姐", 52, "female"),
    role("很会撒娇的学姐", 56, "female"),
    role("刚失恋的女生", 48, "female"),
    role("总说自己很忙的女人", 36, "female")
  ];

  const OBVIOUS_HEALTHY_ROLES = [
    role("体检自律派", 4),
    role("晨跑队长", 4),
    role("健康管理师", 4),
    role("马拉松爱好者", 4),
    role("规律作息模范", 4),
    role("运动打卡达人", 4),
    role("边界感清晰的人", 4),
    role("长期稳定关系空窗期", 4)
  ];

  const OBVIOUS_HEALTHY_CLUES = [
    healthy("本月刚做完正规体检"),
    healthy("检测报告日期很近"),
    healthy("主动展示正规检测记录"),
    healthy("健康 App 连续打卡很久"),
    healthy("作息记录非常规律"),
    healthy("运动记录稳定完整"),
    healthy("明确拒绝无保护行为"),
    healthy("随身带着未拆封安全套"),
    healthy("愿意先确认边界再继续"),
    healthy("认真解释检测窗口期"),
    healthy("不劝酒也不催促"),
    healthy("社交圈长期稳定"),
    healthy("近期没有新的亲密对象"),
    healthy("卫生用品分开放得很清楚"),
    healthy("房间整洁且没有可疑药物"),
    healthy("愿意把灯打开让你确认")
  ];

  const FEATURE_CLUES = [
    clue("持续低烧", "HIV", { HIV: 42, SYPHILIS: 10 }),
    clue("身体有皮疹", "HIV", { HIV: 34, SYPHILIS: 24 }),
    clue("口腔溃疡", "HIV", { HIV: 30, SYPHILIS: 28 }),
    clue("口腔出现白色斑块", "HIV", { HIV: 74 }),
    clue("无精打采", "HIV", { HIV: 18 }),
    clue("盗汗", "HIV", { HIV: 52 }),
    clue("颈部淋巴结肿大", "HIV", { HIV: 45, SYPHILIS: 16 }),
    clue("腋下淋巴结肿大", "HIV", { HIV: 45, SYPHILIS: 12 }),
    clue("咽喉痛", "HIV", { HIV: 18, GONORRHEA: 10 }),
    clue("扁桃体肿", "HIV", { HIV: 22 }),
    clue("肌肉或关节酸痛", "HIV", { HIV: 22 }),
    clue("反复腹泻", "HIV", { HIV: 35 }),
    clue("近期明显消瘦", "HIV", { HIV: 62 }),
    clue("持续咳嗽伴盗汗", "HIV", { HIV: 68 }),

    clue("生殖器附近出现无痛硬疮", "SYPHILIS", { SYPHILIS: 92 }),
    clue("肛周出现圆形溃疡", "SYPHILIS", { SYPHILIS: 75 }),
    clue("口腔出现圆形溃疡", "SYPHILIS", { SYPHILIS: 68, HIV: 12 }),
    clue("腹股沟出现肿块", "SYPHILIS", { SYPHILIS: 46 }),
    clue("手掌出现红疹", "SYPHILIS", { SYPHILIS: 76 }),
    clue("脚底出现红疹", "SYPHILIS", { SYPHILIS: 76 }),
    clue("口腔出现溃疡", "SYPHILIS", { SYPHILIS: 30, HIV: 22 }),
    clue("身体出现斑疹", "SYPHILIS", { SYPHILIS: 48, HIV: 14 }),
    clue("躯干出现不痒红疹", "SYPHILIS", { SYPHILIS: 58 }),
    clue("红疹颜色偏红褐色", "SYPHILIS", { SYPHILIS: 55 }),
    clue("发热伴淋巴结肿大", "SYPHILIS", { SYPHILIS: 42, HIV: 25 }),
    clue("喉咙痛伴疲惫", "SYPHILIS", { SYPHILIS: 20, HIV: 16 }),
    clue("头发斑片状稀疏", "SYPHILIS", { SYPHILIS: 62 }),
    clue("之前有个疮自己好了", "SYPHILIS", { SYPHILIS: 55 }),
    clue("阴部出现潮湿扁平斑块", "SYPHILIS", { SYPHILIS: 82 }),
    clue("肛周出现潮湿扁平斑块", "SYPHILIS", { SYPHILIS: 82 }),
    clue("大热天穿高领长袖", "SYPHILIS", { SYPHILIS: 34, HIV: 10 }),

    clue("内裤出现黄色污渍", "GONORRHEA", { GONORRHEA: 82 }),
    clue("内裤出现黄绿色污渍", "GONORRHEA", { GONORRHEA: 90 }),
    clue("厕所门口听到叫声", "GONORRHEA", { GONORRHEA: 18 }),
    clue("感觉瘙痒难耐", "GONORRHEA", { GONORRHEA: 30, HPV: 18 }),
    clue("下腹部隐隐不适", "GONORRHEA", { GONORRHEA: 35 }),
    clue("下腹或盆腔疼痛", "GONORRHEA", { GONORRHEA: 48 }),
    clue("非经期少量出血", "GONORRHEA", { GONORRHEA: 50 }, "female"),
    clue("亲密接触后疼痛", "GONORRHEA", { GONORRHEA: 45 }),
    clue("睾丸或阴囊胀痛", "GONORRHEA", { GONORRHEA: 58 }, "male"),
    clue("肛门瘙痒", "GONORRHEA", { GONORRHEA: 35, HPV: 18 }),
    clue("肛门分泌物", "GONORRHEA", { GONORRHEA: 72 }),
    clue("排便疼痛", "GONORRHEA", { GONORRHEA: 50 }),
    clue("肛周少量出血", "GONORRHEA", { GONORRHEA: 45, HPV: 20 }),
    clue("近期嗓子疼但不像普通感冒", "GONORRHEA", { GONORRHEA: 24, HIV: 14 }),

    clue("生殖器周围出现小肉粒", "HPV", { HPV: 82 }),
    clue("肛门周围出现小凸起", "HPV", { HPV: 78 }),
    clue("出现菜花状赘生物", "HPV", { HPV: 96 }),
    clue("阴部瘙痒难耐", "HPV", { HPV: 34, GONORRHEA: 12 }),
    clue("摩擦时容易出血", "HPV", { HPV: 46 }),
    clue("小凸起成簇排列", "HPV", { HPV: 72 }),
    clue("表面粗糙有颗粒感", "HPV", { HPV: 62 }),
    clue("柔软带蒂的小赘生物", "HPV", { HPV: 76 }),
    clue("扁平小疣", "HPV", { HPV: 60 }),
    clue("赘生物最近变多", "HPV", { HPV: 70 }),
    clue("坚持不开灯", "HPV", { HPV: 26, SYPHILIS: 14 })
  ];

  const NEUTRAL_CLUES = [
    neutral("对方一直把手机扣在桌面上"),
    neutral("身上香水味很重"),
    neutral("聊天节奏忽快忽慢"),
    neutral("洗手间去了很久"),
    neutral("刚见面就催你别想太多", "tag-warn"),
    neutral("对健康话题一笑带过", "tag-warn"),
    neutral("主动倒酒转移话题", "tag-warn"),
    neutral("照片和本人状态差很多"),
    neutral("桌上有几张看不清的检查单", "tag-warn"),
    neutral("说上次体检是很久以前", "tag-warn"),
    neutral("刚洗完澡但显得慌张"),
    neutral("衣服很整洁但精神紧绷"),
    neutral("说最近应酬很多"),
    neutral("不断确认你会不会后悔"),
    neutral("手机里弹出陌生人的暧昧消息", "tag-warn"),
    neutral("坚持只开一盏小灯", "tag-warn"),
    neutral("说自己不喜欢被问太细", "tag-warn"),
    neutral("床头有一盒没拆封的套"),
    neutral("窗台放着未开封的药盒", "tag-warn"),
    neutral("喝酒后话变得含糊"),
    neutral("提到最近睡眠很差"),
    neutral("一直把外套拉得很紧"),
    neutral("问到检测记录时换了话题", "tag-warn"),
    neutral("反复强调自己很干净", "tag-warn")
  ];

  const EXCELLENT_NORMAL_CLUES = [
    healthy("爱运动"),
    healthy("每周固定跑步"),
    healthy("有长期健身习惯"),
    healthy("作息很规律"),
    healthy("很少熬夜"),
    healthy("不抽烟"),
    healthy("很少喝酒"),
    healthy("饮食清淡"),
    healthy("每年体检"),
    healthy("最近刚做过体检"),
    healthy("有规律睡眠记录"),
    healthy("体脂和心率记录很稳定"),
    healthy("周末常去爬山"),
    healthy("喜欢游泳"),
    healthy("坚持瑜伽"),
    healthy("经常骑行"),
    healthy("饭后会散步"),
    healthy("不喜欢夜店"),
    healthy("很少参加酒局"),
    healthy("健康 App 记录很完整"),
    healthy("随身带消毒湿巾"),
    healthy("进门先洗手"),
    healthy("房间很干净"),
    healthy("床品看起来刚换过"),
    healthy("洗漱用品分开放"),
    healthy("毛巾和浴巾分开放"),
    healthy("指甲修剪整齐"),
    healthy("身上没有异味"),
    healthy("衣服干净整洁"),
    healthy("鞋柜和衣柜很有秩序"),
    healthy("不共用私人用品"),
    healthy("有独立牙刷杯"),
    healthy("洗手台很整洁"),
    healthy("垃圾桶及时清理"),
    healthy("常备基础药品但不过度用药"),
    healthy("主动说不确定就先不继续"),
    healthy("没有劝酒，也没有催你做决定"),
    healthy("愿意认真回答健康和检测问题"),
    healthy("随身带着未拆封的安全套"),
    healthy("说最近没有新的亲密对象"),
    healthy("能说清上次检测的大概时间"),
    healthy("手机里保存着正规检测机构记录"),
    healthy("愿意把灯打开，不躲避观察"),
    healthy("边界感很清楚，反复确认你是否愿意"),
    healthy("不拿“干净”开玩笑，而是认真谈保护"),
    healthy("不催促无套"),
    healthy("明确拒绝危险行为"),
    healthy("愿意先聊天再决定"),
    healthy("尊重你的犹豫"),
    healthy("会主动确认你是否愿意"),
    healthy("会看安全套有效期"),
    healthy("不回避健康问题"),
    healthy("提到窗口期时没有表现出不耐烦"),
    healthy("主动提出先去做检测再继续"),
    healthy("社交圈很固定"),
    healthy("长期单身且没有频繁约会"),
    healthy("不常用陌生社交软件"),
    healthy("社交软件动态很少"),
    healthy("不喜欢临时约见陌生人"),
    healthy("和朋友关系稳定"),
    healthy("不炫耀情史"),
    healthy("不急着推进关系"),
    healthy("对边界感很重视"),
    healthy("说话不油腻"),
    healthy("不用甜言蜜语施压"),
    healthy("不劝酒"),
    healthy("不用激将法"),
    healthy("能接受被拒绝"),
    healthy("你说慢一点，对方立刻停下"),
    healthy("不把检查当成冒犯"),
    healthy("认真听完你的担心"),
    healthy("没有试图转移健康话题"),
    healthy("不制造“今晚必须”的压力"),
    healthy("约会节奏很舒适"),
    healthy("愿意把选择权交给你"),
    healthy("不急着身体接触"),
    healthy("说可以改天再见"),
    healthy("让你先确认安全感"),
    healthy("看起来精神状态很好"),
    healthy("皮肤状态很干净"),
    healthy("说最近在调整作息"),
    healthy("手机里有运动打卡"),
    healthy("冰箱里都是正常食物"),
    healthy("桌上放着体检报告袋"),
    healthy("包里有未拆封口罩和湿巾"),
    healthy("朋友圈多是运动和工作"),
    healthy("最近在备赛或训练"),
    healthy("生活看起来很有秩序"),

    healthy("职业防护习惯很强", ["医生", "护士", "医学生", "牙医"]),
    healthy("值班后先洗手消毒再靠近", ["医生", "护士", "急诊", "医学生"]),
    healthy("能清楚解释检测窗口期", ["医生", "护士", "医学生", "心理咨询师"]),
    healthy("体检记录整理得很完整", ["空乘", "飞行员", "高铁", "运动员", "健身", "舞蹈", "芭蕾"]),
    healthy("训练记录和作息都很规律", ["健身", "篮球", "运动员", "体育学院", "游泳", "拳击", "瑜伽", "舞蹈", "芭蕾"]),
    healthy("比赛前刚做过队内体检", ["篮球", "运动员", "体育学院", "游泳", "拳击"]),
    healthy("演出前的身体检查刚结束", ["舞蹈", "芭蕾", "音乐学院", "摄影棚模特"]),
    healthy("飞行体检记录日期很近", ["空乘", "飞行员"]),
    healthy("出差前刚完成单位体检", ["高铁", "销售", "投行", "金融", "保险", "房产"]),
    healthy("长期固定作息，很少临时赴约", ["程序员", "书店", "图书馆", "花店", "咖啡师", "甜品店"]),
    healthy("社交圈很固定，最近很少约见陌生人", ["宅", "书店", "图书馆", "宠物店", "花店"]),
    healthy("工作室里贴着卫生消毒流程", ["纹身师", "摄影师", "摄影棚", "美妆", "服装设计师"]),
    healthy("演出后台常备个人卫生用品", ["酒吧驻唱", "乐队", "DJ", "剧本杀", "密室"]),
    healthy("旅行前后都有做常规体检", ["旅游", "留学生", "海归"]),
    healthy("约会前主动说明最近身体状态正常", ["刚分手", "长期单身", "考研", "加班", "失眠"]),
    healthy("说可以先聊天，不需要今晚推进", ["高冷慢热型", "看起来很乖的人", "长期单身的人"]),
    healthy("没有回避你的边界问题", ["暧昧高手", "嘴甜骗子", "过度热情型", "控制欲很强的人"]),
    healthy("愿意把社交软件动态给你看", ["社交软件", "24小时在线", "短视频", "主播", "博主"]),
    healthy("运动员体检刚通过", ["运动员", "篮球", "体育学院"]),
    healthy("健身教练训练记录完整", ["健身教练", "健身房"]),
    healthy("瑜伽老师作息很稳定", ["瑜伽"]),
    healthy("舞蹈生近期刚做演出体检", ["舞蹈", "芭蕾"]),
    healthy("空乘体检记录日期很近", ["空乘"]),
    healthy("飞行员定期体检合格", ["飞行员"]),
    healthy("医学生知道检测窗口期", ["医学生"]),
    healthy("护士职业防护习惯很强", ["护士"]),
    healthy("医生能清楚解释检测流程", ["医生"]),
    healthy("牙医很注意消毒流程", ["牙医"]),
    healthy("游泳教练有规律训练安排", ["游泳"]),
    healthy("拳击教练赛前体检正常", ["拳击"]),
    healthy("徒步领队健康记录完整", ["徒步"]),
    healthy("旅游博主旅行前后会体检", ["旅游博主"]),
    healthy("纹身师工作室消毒流程清楚", ["纹身师"])
  ];

  const FEMALE_AVATARS = Array.from({ length: 10 }, (_, index) => createAnimeAvatar("female", index));
  const MALE_AVATARS = Array.from({ length: 10 }, (_, index) => createAnimeAvatar("male", index));

  const els = {
    compliance: document.querySelector("#compliance-modal"),
    complianceConsent: document.querySelector("#disclaimer-consent"),
    complianceContinue: document.querySelector("#continue-intro-btn"),
    gender: document.querySelector("#gender-modal"),
    genderButtons: [...document.querySelectorAll(".gender-option")],
    game: document.querySelector("#game-container"),
    intro: document.querySelector("#intro-modal"),
    help: document.querySelector("#help-modal"),
    feedback: document.querySelector("#feedback-overlay"),
    turn: document.querySelector("#turn-count"),
    homeButton: document.querySelector("#home-button"),
    languageToggle: document.querySelector("#language-toggle"),
    introLanguageToggle: document.querySelector("#intro-language-toggle"),
    start: document.querySelector("#start-game-btn"),
    helpButton: document.querySelector("#help-button"),
    closeHelp: document.querySelector("#close-help"),
    gotIt: document.querySelector("#got-it"),
    desireVal: document.querySelector("#backlog-val"),
    desireBar: document.querySelector("#backlog-bar"),
    loadVal: document.querySelector("#anxiety-val"),
    loadBar: document.querySelector("#anxiety-bar"),
    panicWarning: document.querySelector("#panic-warning"),
    gameContent: document.querySelector("#game-content"),
    toolRow: document.querySelector(".tool-row"),
    coffeeCard: document.querySelector("#coffee-card"),
    coffeeCount: document.querySelector("#item-coffee"),
    restButton: document.querySelector("#rest-button"),
    avatar: document.querySelector("#avatar-image"),
    taskStatus: document.querySelector("#task-status"),
    line: document.querySelector("#flirt-text"),
    tags: document.querySelector("#tags-container"),
    buttons: [...document.querySelectorAll("[data-action]")],
    feedbackIcon: document.querySelector("#feedback-icon"),
    feedbackTitle: document.querySelector("#feedback-title"),
    feedbackMessage: document.querySelector("#feedback-message"),
    debtReport: document.querySelector("#debt-report"),
    statsReport: document.querySelector("#stats-report"),
    summaryView: document.querySelector("#summary-view"),
    historyView: document.querySelector("#history-view"),
    viewHistory: document.querySelector("#view-history-btn"),
    historyList: document.querySelector("#history-list"),
    backSummary: document.querySelector("#back-summary-btn"),
    next: document.querySelector("#next-btn"),
    restart: document.querySelector("#restart-btn"),
    toast: document.querySelector("#toast")
  };

  let language = localStorage.getItem(LANG_KEY) || "zh";
  let state = freshState();
  let lastFeedback = null;
  let toastTimer = 0;

  function freshState() {
    return {
      role: null,
      turn: 1,
      desire: 50,
      load: 0,
      ended: false,
      fieldTests: 1,
      avatarDeck: [],
      currentDate: null,
      history: [],
      riskRecords: [],
      actionCounts: { chat: 0, light: 0, steady: 0, shortcut: 0, rush: 0, skip: 0, refuse: 0, test: 0, hospital: 0 }
    };
  }

  function createAnimeAvatar(kind, index) {
    const palettes = kind === "female"
      ? [
          ["#ffd5e7", "#f472b6", "#7c3aed", "#f9a8d4"],
          ["#fce7f3", "#fb7185", "#0ea5e9", "#fda4af"],
          ["#ffe4e6", "#c084fc", "#22c55e", "#f0abfc"],
          ["#fde68a", "#f97316", "#8b5cf6", "#f9a8d4"],
          ["#e0f2fe", "#38bdf8", "#ec4899", "#bae6fd"],
          ["#fae8ff", "#a855f7", "#06b6d4", "#f5d0fe"],
          ["#fff7ed", "#fb923c", "#3b82f6", "#fed7aa"],
          ["#fdf2f8", "#db2777", "#14b8a6", "#fbcfe8"],
          ["#ecfeff", "#0891b2", "#f43f5e", "#a5f3fc"],
          ["#fef3c7", "#d97706", "#7c3aed", "#fde68a"]
        ]
      : [
          ["#dbeafe", "#2563eb", "#111827", "#93c5fd"],
          ["#e0f2fe", "#0284c7", "#7c2d12", "#7dd3fc"],
          ["#f1f5f9", "#475569", "#020617", "#cbd5e1"],
          ["#dcfce7", "#16a34a", "#1e3a8a", "#86efac"],
          ["#ede9fe", "#7c3aed", "#172554", "#c4b5fd"],
          ["#fee2e2", "#dc2626", "#111827", "#fca5a5"],
          ["#ccfbf1", "#0f766e", "#312e81", "#5eead4"],
          ["#ffedd5", "#ea580c", "#0f172a", "#fdba74"],
          ["#e2e8f0", "#334155", "#581c87", "#94a3b8"],
          ["#cffafe", "#0891b2", "#1f2937", "#67e8f9"]
        ];
    const [bg, hair, eye, accent] = palettes[index % palettes.length];
    const hairPath = kind === "female"
      ? `<path d="M56 130 C20 96 32 34 96 30 C160 34 173 96 136 132 C124 88 68 88 56 130Z" fill="${hair}"/>
         <path d="M45 69 C55 32 104 18 136 43 C116 52 89 56 58 102Z" fill="${accent}" opacity=".9"/>`
      : `<path d="M50 86 C52 38 91 24 129 38 C151 48 157 68 149 94 C126 74 86 74 50 86Z" fill="${hair}"/>
         <path d="M55 58 C78 28 126 28 148 62 C119 52 90 50 55 58Z" fill="${accent}" opacity=".75"/>`;
    const accessory = kind === "female"
      ? `<circle cx="140" cy="82" r="12" fill="${accent}"/><path d="M133 76 L122 65 L128 91Z" fill="${accent}"/>`
      : `<path d="M55 132 L137 132 L126 160 L66 160Z" fill="${accent}"/>`;

    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 192 144">
        <defs>
          <linearGradient id="g${kind}${index}" x1="0" x2="1" y1="0" y2="1">
            <stop offset="0" stop-color="${bg}"/>
            <stop offset="1" stop-color="#0f172a"/>
          </linearGradient>
          <filter id="s${kind}${index}" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="6" stdDeviation="5" flood-color="#020617" flood-opacity=".35"/>
          </filter>
        </defs>
        <rect width="192" height="144" rx="18" fill="url(#g${kind}${index})"/>
        <circle cx="38" cy="32" r="18" fill="#fff" opacity=".16"/>
        <circle cx="160" cy="108" r="26" fill="#fff" opacity=".1"/>
        <g filter="url(#s${kind}${index})">
          ${hairPath}
          <ellipse cx="96" cy="78" rx="44" ry="48" fill="#ffd7c7"/>
          <path d="M64 86 C70 100 82 108 96 108 C110 108 122 100 128 86" fill="#ffc7b7" opacity=".45"/>
          <ellipse cx="78" cy="78" rx="8" ry="10" fill="${eye}"/>
          <ellipse cx="114" cy="78" rx="8" ry="10" fill="${eye}"/>
          <circle cx="81" cy="74" r="3" fill="#fff"/>
          <circle cx="117" cy="74" r="3" fill="#fff"/>
          <path d="M87 101 Q96 108 105 101" fill="none" stroke="#be123c" stroke-width="3" stroke-linecap="round"/>
          <path d="M68 66 Q78 58 88 64" fill="none" stroke="${hair}" stroke-width="4" stroke-linecap="round"/>
          <path d="M104 64 Q116 58 126 66" fill="none" stroke="${hair}" stroke-width="4" stroke-linecap="round"/>
          ${accessory}
        </g>
      </svg>`;

    return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
  }

  function t(key) {
    return I18N[language][key] || I18N.zh[key] || "";
  }

  function text(value) {
    if (!value) return "";
    if (typeof value === "string") return value;
    return value[language] || value.zh || "";
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function chance(probability) {
    return Math.random() < probability;
  }

  function sample(items, fallback = "") {
    if (!items.length) return fallback;
    return items[Math.floor(Math.random() * items.length)];
  }

  function shuffle(items) {
    const copy = [...items];
    for (let index = copy.length - 1; index > 0; index -= 1) {
      const swapIndex = Math.floor(Math.random() * (index + 1));
      [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
    }
    return copy;
  }

  function setLanguage(nextLanguage) {
    language = nextLanguage;
    localStorage.setItem(LANG_KEY, language);
    document.documentElement.lang = language === "zh" ? "zh-CN" : "en";
    document.title = t("appTitle");
    els.homeButton.title = language === "zh" ? "返回主页" : "Back home";
    els.homeButton.setAttribute("aria-label", els.homeButton.title);
    els.languageToggle.textContent = language === "zh" ? "EN" : "中";
    els.introLanguageToggle.textContent = language === "zh" ? "EN" : "中";
    document.querySelectorAll("[data-i18n]").forEach((node) => {
      node.textContent = t(node.dataset.i18n);
    });
    updateEmptyContentVisibility();
    renderAll();
    if (lastFeedback && !els.feedback.classList.contains("hidden")) {
      renderFeedback(lastFeedback);
    }
  }

  function chooseRole(role) {
    state = freshState();
    state.role = role;
    state.avatarDeck = buildAvatarDeck(role);
    startGame();
  }

  function buildAvatarDeck(role) {
    return shuffle(role === "male" ? FEMALE_AVATARS : MALE_AVATARS);
  }

  function drawAvatar() {
    if (!state.avatarDeck.length) {
      state.avatarDeck = buildAvatarDeck(state.role || "male");
    }
    return state.avatarDeck.pop();
  }

  function startGame() {
    const preservedRole = state.role || "male";
    const preservedDeck = state.avatarDeck.length ? state.avatarDeck : buildAvatarDeck(preservedRole);
    state = freshState();
    state.role = preservedRole;
    state.avatarDeck = preservedDeck;
    state.currentDate = generateDate();
    lastFeedback = null;
    els.gender.classList.add("hidden");
    els.intro.classList.add("hidden");
    els.feedback.classList.add("hidden");
    els.game.classList.remove("hidden");
    renderAll();
  }

  function returnToIntro() {
    state = freshState();
    els.game.classList.add("hidden");
    els.feedback.classList.add("hidden");
    els.help.classList.add("hidden");
    els.intro.classList.add("hidden");
    els.gender.classList.remove("hidden");
    renderAll();
  }

  function generateDate() {
    if (chance(OBVIOUS_HEALTHY_RATE)) {
      const roleTag = createTag(sample(OBVIOUS_HEALTHY_ROLES, OBVIOUS_HEALTHY_ROLES[0]), true);
      const tags = generateObviousHealthyTags(roleTag);
      return {
        avatar: drawAvatar(),
        line: sample(DATE_LINES, ""),
        role: roleTag,
        canProbe: false,
        obviousHealthy: true,
        tags
      };
    }

    const rolePool = getRolePoolForDate();
    const roleTag = createTag(weightedPick(rolePool, new Set()) || sample(rolePool, null), true);
    const tags = generateTags(roleTag);
    return {
      avatar: drawAvatar(),
      line: sample(DATE_LINES, ""),
      role: roleTag,
      canProbe: canProbeThisRound(tags) && chance(PROBE_RANDOM_AVAILABILITY_RATE),
      tags
    };
  }

  function generateObviousHealthyTags(roleTag) {
    const selected = roleTag ? [roleTag] : [];
    const used = new Set(selected.map((tag) => tag.text));
    const totalTags = VISIBLE_TAG_COUNT + HIDDEN_TAG_COUNT;

    while (selected.length < totalTags) {
      if (!addTagFromPool(selected, used, OBVIOUS_HEALTHY_CLUES, true)) break;
    }

    return selected;
  }

  function getRolePoolForDate() {
    const targetGender = state.role === "male" ? "female" : "male";
    return ROLE_CLUES.filter((item) => item.targets.includes("both") || item.targets.includes(targetGender));
  }

  function getFeaturePoolForDate() {
    const targetGender = state.role === "male" ? "female" : "male";
    return FEATURE_CLUES.filter((item) => item.targets.includes("both") || item.targets.includes(targetGender));
  }

  function generateTags(roleTag) {
    const selected = roleTag ? [roleTag] : [];
    const used = new Set(selected.map((tag) => tag.text));
    const roleRisk = roleTag?.roleRisk || 0;
    const featurePool = getFeaturePoolForDate();
    const visibleFeatureChance = clamp(0.18 + roleRisk / 220, 0.18, 0.58);
    const hiddenFeatureChance = clamp(0.42 + roleRisk / 210, 0.42, 0.86);
    const excellentNormalChance = clamp(0.12 - roleRisk / 900, 0.03, 0.12);
    const hiddenExcellentNormalChance = clamp(excellentNormalChance / 2, 0.015, 0.05);
    const excellentNormalPool = getExcellentNormalPool(roleTag);

    addTagFromPool(selected, used, featurePool, true);

    while (selected.filter((tag) => tag.revealed).length < VISIBLE_TAG_COUNT) {
      const normalCandidate = chance(excellentNormalChance);
      const normalAdded = normalCandidate && addTagFromPool(selected, used, excellentNormalPool, true);
      if (normalAdded) continue;

      const featureCandidate = chance(visibleFeatureChance);
      const added = featureCandidate
        ? addTagFromPool(selected, used, featurePool, true)
        : addTagFromPool(selected, used, NEUTRAL_CLUES, true);
      if (!added && !addTagFromPool(selected, used, NEUTRAL_CLUES, true)) break;
    }

    while (selected.filter((tag) => !tag.revealed).length < HIDDEN_TAG_COUNT) {
      const normalCandidate = chance(hiddenExcellentNormalChance);
      const normalAdded = normalCandidate && addTagFromPool(selected, used, excellentNormalPool, false);
      if (normalAdded) continue;

      const featureCandidate = chance(hiddenFeatureChance);
      const added = featureCandidate
        ? addTagFromPool(selected, used, featurePool, false)
        : addTagFromPool(selected, used, NEUTRAL_CLUES, false);
      if (!added && !addTagFromPool(selected, used, featurePool, false)) break;
    }

    if (!roleTag) return shuffle(selected);
    return [roleTag, ...shuffle(selected.filter((tag) => tag !== roleTag))];
  }

  function getExcellentNormalPool(roleTag) {
    const roleText = roleTag?.text || "";
    return EXCELLENT_NORMAL_CLUES.filter((item) => {
      if (!item.matches.length) return true;
      return item.matches.some((keyword) => roleText.includes(keyword));
    });
  }

  function addTagFromPool(selected, used, pool, revealed) {
    const source = weightedPick(pool, used);
    if (!source) return false;
    used.add(source.text);
    selected.push(createTag(source, revealed));
    return true;
  }

  function weightedPick(items, used) {
    const pool = items.filter((item) => !used.has(item.text));
    const total = pool.reduce((sum, item) => sum + (item.drawWeight || 1), 0);
    if (!pool.length || total <= 0) return null;

    let roll = Math.random() * total;
    for (const item of pool) {
      roll -= item.drawWeight || 1;
      if (roll <= 0) return item;
    }
    return pool[pool.length - 1];
  }

  function createTag(source, revealed) {
    return {
      text: source.text,
      disease: source.disease || "",
      roleRisk: source.roleRisk || 0,
      targets: source.targets || [],
      normal: Boolean(source.normal),
      scores: source.scores || {},
      score: source.score || 0,
      risk: Boolean(source.risk),
      color: source.color || "tag-neutral",
      revealed
    };
  }

  function canProbeThisRound(tags) {
    if (!tags.some((tag) => !tag.revealed)) return false;
    if (PROBE_FEATURE_LIMIT === null) return true;
    return tags.filter((tag) => tag.revealed && tag.risk).length < PROBE_FEATURE_LIMIT;
  }

  function renderAll() {
    updateStatsUI();
    renderDate();
    renderButtons();
    renderToolButtons();
  }

  function updateEmptyContentVisibility() {
    const hasCoffee = Boolean(t("coffeeTitle") || t("coffeeUse"));
    const hasRest = Boolean(t("restTitle") || t("restCost"));
    setElementHidden(els.coffeeCard, !hasCoffee);
    setElementHidden(els.restButton, !hasRest);
    setElementHidden(els.toolRow, !hasCoffee && !hasRest);
    setElementHidden(els.helpButton, !t("helpButton"));
    setElementHidden(document.querySelector("#btn-refuse"), !t("refuseAction"));
  }

  function setElementHidden(element, hidden) {
    if (!element) return;
    element.hidden = hidden;
    element.classList.toggle("hidden", hidden);
    element.style.display = hidden ? "none" : "";
  }

  function updateStatsUI() {
    els.turn.textContent = String(state.turn).padStart(2, "0");
    els.desireVal.textContent = `${state.desire}%`;
    els.desireBar.style.width = `${state.desire}%`;
    els.loadVal.textContent = `${state.load}%`;
    els.loadBar.style.width = `${state.load}%`;
    els.coffeeCount.textContent = `x${state.fieldTests}`;

    const panic = state.load >= 80;
    els.panicWarning.classList.toggle("hidden", !panic || !t("panicWarning"));
    els.gameContent.classList.toggle("panic-mode", panic);
    if (panic) {
      els.loadBar.classList.remove("anxiety-fill");
      els.loadBar.style.background = "#8b5cf6";
    } else {
      els.loadBar.classList.add("anxiety-fill");
      els.loadBar.style.background = "";
    }
  }

  function renderDate() {
    const current = state.currentDate;
    if (!current) return;

    els.avatar.src = current.avatar || "";
    els.avatar.alt = current.avatar ? t("taskHeading") : "";
    els.line.textContent = text(current.line);
    els.taskStatus.classList.toggle("hidden", !current.tags.some((tag) => tag.revealed && tag.risk));
    els.tags.innerHTML = "";

    current.tags.forEach((tag, index) => {
      const node = document.createElement("div");
      node.className = tag.revealed ? `tag-badge ${tag.color || "tag-neutral"}` : "tag-badge tag-hidden";
      node.style.animationDelay = `${index * 45}ms`;
      node.textContent = tag.revealed ? text(tag.text) : t("hiddenInfo");
      els.tags.append(node);
    });
  }

  function renderButtons() {
    resetActionButtons();
    if (!state.currentDate || state.ended) {
      els.buttons.forEach((button) => {
        button.disabled = true;
      });
      return;
    }

    const probe = document.querySelector("#btn-chat");
    probe.disabled = !state.currentDate.canProbe;
    probe.title = state.currentDate.canProbe ? "" : t("probeUnavailable");
  }

  function renderToolButtons() {
    const disabled = !state.currentDate || state.ended;
    els.coffeeCard.disabled = disabled || state.fieldTests <= 0;
    els.coffeeCard.title = state.fieldTests <= 0 ? "现场测试已用完" : "";
    els.restButton.disabled = disabled || (state.load <= 0 && state.riskRecords.length <= 0);
    els.restButton.title = state.load <= 0 && state.riskRecords.length <= 0 ? "当前心理负荷为 0" : "";
  }

  function resetActionButtons() {
    els.buttons.forEach((button) => {
      button.disabled = false;
      button.title = "";
    });
  }

  function revealOneHiddenTag() {
    const hidden = state.currentDate.tags.filter((tag) => !tag.revealed);
    if (!hidden.length) return null;
    const tag = sample(hidden, null);
    if (tag) tag.revealed = true;
    return tag;
  }

  function revealAllHiddenTags() {
    state.currentDate.tags.forEach((tag) => {
      tag.revealed = true;
    });
  }

  function addToolResultTag(textValue, color) {
    if (!state.currentDate || state.currentDate.tags.some((tag) => tag.text === textValue)) return;
    state.currentDate.tags.push(createTag({
      text: textValue,
      risk: false,
      color,
      scores: {},
      drawWeight: 1
    }, true));
  }

  function takeFieldTest() {
    if (state.ended || !state.currentDate || state.fieldTests <= 0) return;

    state.fieldTests -= 1;
    state.actionCounts.test += 1;
    revealAllHiddenTags();
    const riskProfile = getDateRiskProfile(state.currentDate.tags);
    if (hasDiseaseRisk(riskProfile)) {
      addToolResultTag("现场测试：结果可疑", "tag-risk");
      state.load = clamp(state.load + 5, 0, 100);
      showToast("现场测试结果可疑，不能替代确诊");
    } else {
      addToolResultTag("现场测试：暂未异常", "tag-safe");
      state.load = clamp(state.load - 8, 0, 100);
      showToast("现场测试暂未异常，仍建议正规检测");
    }

    renderAll();
    checkEndAfterAction();
  }

  function takeHospitalCheck() {
    if (state.ended || !state.currentDate || (state.load <= 0 && state.riskRecords.length <= 0)) return;

    state.actionCounts.hospital += 1;
    state.desire = clamp(state.desire + 20, 0, 100);
    state.load = 0;
    revealAllHiddenTags();
    if (state.riskRecords.length > 0) {
      addToolResultTag("医院检查：确诊", "tag-bad");
      endGame("diagnosed");
      return;
    }

    addToolResultTag("医院检查：暂未确诊", "tag-safe");
    showToast("去医院检查：欲望+20，心理负荷清零");
    renderAll();
    checkEndAfterAction();
  }

  function takeAction(actionType) {
    if (state.ended || !state.currentDate) return;

    if (actionType === "chat") {
      takeProbeAction();
      return;
    }

    if (actionType === "refuse") {
      takeRefuseAction();
      return;
    }

    if (actionType === "skip") {
      takeSkipAction();
      return;
    }

    resolveSexualAction(actionType);
  }

  function takeProbeAction() {
    if (!state.currentDate.canProbe) return;

    state.actionCounts.chat += 1;
    state.desire = clamp(state.desire + 5, 0, 100);
    revealOneHiddenTag();
    state.currentDate.canProbe = false;
    els.feedback.classList.add("hidden");
    renderAll();

    if (checkEndAfterAction()) return;
  }

  function takeRefuseAction() {
    const beforeStats = getStatSnapshot();
    state.actionCounts.refuse += 1;
    const riskProfile = getDateRiskProfile(state.currentDate.tags);
    const outcome = getAvoidOutcome(riskProfile);
    const afterStats = getStatSnapshot();
    state.history.push({
      avatar: state.currentDate.avatar,
      tags: cloneTags(state.currentDate.tags),
      action: t("refuseAction"),
      actionType: "refuse",
      outcome,
      risk: false,
      riskProfile
    });

    showFeedback(buildRoundFeedback("refuse", outcome, riskProfile, false, beforeStats, afterStats));
  }

  function takeSkipAction() {
    const beforeStats = getStatSnapshot();
    state.actionCounts.skip += 1;
    state.desire = clamp(state.desire + 10, 0, 100);
    state.load = clamp(state.load + 2, 0, 100);
    const riskProfile = getDateRiskProfile(state.currentDate.tags);
    const outcome = getAvoidOutcome(riskProfile);
    const afterStats = getStatSnapshot();
    state.history.push({
      avatar: state.currentDate.avatar,
      tags: cloneTags(state.currentDate.tags),
      action: t("skipAction"),
      actionType: "skip",
      outcome,
      risk: false,
      riskProfile
    });

    if (checkEndAfterAction()) return;
    showFeedback(buildRoundFeedback("skip", outcome, riskProfile, false, beforeStats, afterStats));
  }

  function resolveSexualAction(actionType) {
    const action = ACTIONS[actionType];
    if (!action) return;

    const beforeStats = getStatSnapshot();
    state.actionCounts[actionType] += 1;
    state.desire = clamp(state.desire + action.desire, 0, 100);
    state.load = clamp(state.load + action.load, 0, 100);

    const riskProfile = getDateRiskProfile(state.currentDate.tags);
    const infection = getInfectionResult(actionType, riskProfile);
    const gotRisk = infection.infected;
    const outcome = getContactOutcome(actionType, riskProfile, gotRisk);
    const historyRiskProfile = gotRisk && infection.disease
      ? {
          ...riskProfile,
          primaryDisease: infection.disease,
          diseases: [...new Set([...(riskProfile.diseases || []), infection.disease])]
        }
      : riskProfile;
    if (gotRisk) {
      state.riskRecords.push({
        turn: state.turn,
        action: t(action.labelKey),
        disease: infection.disease,
        diseases: infection.diseases,
        route: "接触传播",
        avatar: state.currentDate.avatar,
        tags: cloneTags(state.currentDate.tags)
      });
    }

    state.history.push({
      avatar: state.currentDate.avatar,
      tags: cloneTags(state.currentDate.tags),
      action: t(action.labelKey),
      actionType,
      outcome,
      risk: gotRisk,
      riskProfile: historyRiskProfile
    });

    if (checkEndAfterAction()) return;

    showFeedback(buildRoundFeedback(actionType, outcome, historyRiskProfile, gotRisk, beforeStats, getStatSnapshot()));
  }

  function cloneTags(tags) {
    return tags.map((tag) => ({
      text: text(tag.text),
      revealed: tag.revealed,
      color: tag.color,
      risk: Boolean(tag.risk),
      normal: Boolean(tag.normal),
      disease: tag.disease || "",
      roleRisk: tag.roleRisk || 0,
      score: tag.score || 0,
      scores: { ...(tag.scores || {}) }
    }));
  }

  function getDateRiskProfile(tags) {
    const diseaseScores = {};
    const normalCount = tags.filter((tag) => tag.normal).length;

    tags.forEach((tag) => {
      Object.entries(tag.scores || {}).forEach(([disease, score]) => {
        diseaseScores[disease] = Math.max(diseaseScores[disease] || 0, score);
      });
    });

    const ranked = Object.entries(diseaseScores)
      .sort(([, left], [, right]) => right - left)
      .map(([disease, score]) => ({ disease, score, label: DISEASE_LABELS[disease] || disease }));
    const rawScore = ranked[0]?.score || 0;
    const score = clamp(rawScore - normalCount * 8, 0, 100);
    const diseases = ranked.filter((item) => item.score >= 35).map((item) => item.label);

    return {
      score,
      rawScore,
      normalCount,
      primaryDisease: ranked[0]?.label || "",
      diseases,
      diseaseScores
    };
  }

  function getAdjustedDiseaseScore(riskProfile, disease) {
    const rawScore = riskProfile.diseaseScores?.[disease] || 0;
    return clamp(rawScore - riskProfile.normalCount * 8, 0, 100);
  }

  function getInfectionOptions(actionType, riskProfile) {
    const caps = ACTION_RISK_CAPS[actionType] || {};
    return Object.entries(caps)
      .map(([disease, cap]) => {
        const score = getAdjustedDiseaseScore(riskProfile, disease);
        return {
          disease,
          label: DISEASE_LABELS[disease] || disease,
          probability: clamp((score / 100) * cap, 0, cap)
        };
      })
      .filter((item) => item.probability > 0);
  }

  function getInfectionResult(actionType, riskProfile) {
    const options = getInfectionOptions(actionType, riskProfile);
    const combinedChance = clamp(
      1 - options.reduce((remain, item) => remain * (1 - item.probability), 1),
      0,
      0.92
    );

    if (!options.length || !chance(combinedChance)) {
      return { infected: false, chance: combinedChance, disease: "", diseases: [] };
    }

    const totalWeight = options.reduce((sum, item) => sum + item.probability, 0);
    let cursor = Math.random() * totalWeight;
    let selected = options[0];
    for (const option of options) {
      cursor -= option.probability;
      if (cursor <= 0) {
        selected = option;
        break;
      }
    }

    const diseases = [...new Set([...(riskProfile.diseases || []), selected.label])];
    return {
      infected: true,
      chance: combinedChance,
      disease: selected.label,
      diseases
    };
  }

  function hasDiseaseRisk(riskProfile) {
    return Boolean(riskProfile.diseases?.length);
  }

  function getAvoidOutcome(riskProfile) {
    if (hasDiseaseRisk(riskProfile)) return "死里逃生";
    if (riskProfile.rawScore >= 25 || riskProfile.score >= 25) return "正确离开";
    return "遗憾错过";
  }

  function getContactOutcome(actionType, riskProfile, gotRisk) {
    if (gotRisk) return "被ta感染";
    if (actionType === "shortcut" || actionType === "rush") {
      return hasDiseaseRisk(riskProfile) || riskProfile.score >= 45 ? "死里逃生" : "理智享受";
    }
    return "理智享受";
  }

  function getOutcomeClass(outcome) {
    if (outcome === "被ta感染") return "outcome-bad";
    if (outcome === "死里逃生" || outcome === "遗憾错过") return "outcome-warn";
    return "outcome-good";
  }

  function escapeHTML(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function getStatSnapshot() {
    return {
      desire: state.desire,
      load: state.load
    };
  }

  function formatDelta(value) {
    if (value > 0) return `+${value}`;
    return String(value);
  }

  function renderDeltaCell(label, before, after, reverse = false) {
    const delta = after - before;
    const good = reverse ? delta < 0 : delta > 0;
    const bad = reverse ? delta > 0 : delta < 0;
    const tone = good ? "delta-good" : bad ? "delta-bad" : "delta-flat";
    return `
      <div class="feedback-delta ${tone}">
        <span>${escapeHTML(label)}</span>
        <strong>${escapeHTML(formatDelta(delta))}</strong>
        <small>${before}% → ${after}%</small>
      </div>
    `;
  }

  function getJudgmentText(actionType, outcome, riskProfile, gotRisk) {
    const isProtected = actionType === "light" || actionType === "steady";
    const isUnprotected = actionType === "shortcut" || actionType === "rush";
    const risky = hasDiseaseRisk(riskProfile) || riskProfile.score >= 45;

    if (gotRisk) return "这次不是单纯焦虑，风险已经进入复盘。后续去医院检查会直接触发确诊结算。";
    if (outcome === "死里逃生") {
      if (actionType === "skip" || actionType === "refuse") return "你避开了一次明显风险，这种离开比侥幸更有价值。";
      if (isProtected) return "防护帮你压低了风险，但这些线索仍然不值得轻视。";
      return "你这次靠运气躲过去了，但无保护选择本身已经很危险。";
    }
    if (outcome === "正确离开") return "线索还没有完全坐实，但谨慎离开让你保留了主动权。";
    if (outcome === "遗憾错过") return "目前线索没有形成明确风险，你可能错过了一个相对正常的人。";
    if (isProtected && risky) return "防护降低了风险，但对象的线索让你很难完全放心。";
    if (isProtected) return "这次选择相对克制，风险没有进一步扩大。";
    if (isUnprotected && risky) return "冲动让你贴近了高风险线索，侥幸不能当成策略。";
    if (isUnprotected) return "这次没有出事，但无保护选择会让后面的容错越来越低。";
    return "你做出了选择，记录已经留下。";
  }

  function getNextLabel(actionType, outcome, riskProfile, gotRisk) {
    if (gotRisk) return "查看身体反应";
    if (outcome === "死里逃生") return "压住心跳继续";
    if (outcome === "遗憾错过") return "带着遗憾继续";
    if (actionType === "shortcut" || actionType === "rush") return "硬着头皮继续";
    if ((actionType === "light" || actionType === "steady") && (hasDiseaseRisk(riskProfile) || riskProfile.score >= 45)) {
      return "带着疑虑继续";
    }
    return "继续下一场约会";
  }

  function buildRoundFeedback(actionType, outcome, riskProfile, gotRisk, beforeStats, afterStats) {
    const judgment = getJudgmentText(actionType, outcome, riskProfile, gotRisk);
    return {
      title: t("actionFeedbackTitle"),
      icon: "",
      end: false,
      nextLabel: getNextLabel(actionType, outcome, riskProfile, gotRisk),
      message: `
        <div class="round-feedback">
          <div class="feedback-delta-grid">
            ${renderDeltaCell("生理欲望", beforeStats.desire, afterStats.desire, true)}
            ${renderDeltaCell("心理负荷", beforeStats.load, afterStats.load, true)}
          </div>
          <div class="judgment-card">
            <span>判断反馈</span>
            <p>${escapeHTML(judgment)}</p>
          </div>
        </div>
      `
    };
  }

  function checkEndAfterAction() {
    if (state.load >= 100) {
      endGame("collapse");
      return true;
    }
    if (state.desire >= 100) {
      endGame("desireOverflow");
      return true;
    }
    if (state.desire <= 0) {
      endGame("goodWin");
      return true;
    }
    return false;
  }

  function advanceRound() {
    if (state.ended) return;

    state.turn += 1;
    state.currentDate = generateDate();
    els.feedback.classList.add("hidden");
    renderAll();
  }

  function endGame(type) {
    if (state.ended) return;
    state.ended = true;
    saveRecord(type);

    const hasInfection = state.riskRecords.length > 0;
    const endMap = hasInfection
      ? {
          collapse: { title: "CPU 被焦虑烧穿了", message: "心理负荷爆表，游戏结束。复盘显示，你在风险里留下了代价。", icon: "🥀" },
          desireOverflow: { title: "脑子下线，欲望上线", message: "生理欲望涨到顶点，判断被冲动接管。复盘显示，你在风险里留下了代价。", icon: "🥀" },
          expired: { title: "糟糕的胜利", message: "你走完了全部约会，但身体风险没有完全躲开。", icon: "🥀" },
          goodWin: { title: "糟糕的胜利", message: "欲望被清空了，可健康并没有完全保住。", icon: "🥀" },
          diagnosed: { title: "确诊，游戏结束", message: "医院检查确认了之前留下的风险。下面是本局统计和详细复盘。", icon: "🧾" }
        }
      : {
          collapse: { title: t("collapseTitle"), message: t("collapseMessage"), icon: "🧠" },
          desireOverflow: { title: "脑子下线，欲望上线", message: "生理欲望达到 100，你已经无法继续冷静判断。游戏被迫结束。", icon: "🔥" },
          expired: { title: t("expiredTitle"), message: t("expiredMessage"), icon: "✅" },
          goodWin: { title: t("goodWinTitle"), message: t("goodWinMessage"), icon: "✅" },
          diagnosed: { title: "医院检查完成", message: "没有触发感染结算。现实中仍请以正规检测为准。", icon: "✅" }
        };

    showFeedback({ ...endMap[type], end: true, type });
    renderAll();
  }

  function saveRecord(type) {
    const summary = getRunStats();
    const records = readRecords();
    records.unshift({
      type,
      date: new Date().toISOString(),
      role: state.role,
      turns: state.turn,
      desire: state.desire,
      load: state.load,
      risk: state.riskRecords.length,
      history: state.history.length,
      summary
    });
    localStorage.setItem(STORAGE_KEY, JSON.stringify(records.slice(0, 10)));
  }

  function readRecords() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    } catch (error) {
      return [];
    }
  }

  function showFeedback(feedback) {
    lastFeedback = feedback;
    renderFeedback(feedback);
    els.feedback.classList.remove("hidden");
  }

  function renderFeedback(feedback) {
    els.feedbackIcon.textContent = feedback.icon || "";
    els.feedbackTitle.textContent = feedback.title || "";
    els.feedbackMessage.innerHTML = feedback.message || "";
    els.feedbackMessage.classList.toggle("hidden", !feedback.message);
    els.summaryView.classList.remove("hidden");
    els.historyView.classList.add("hidden");
    els.debtReport.classList.add("hidden");
    els.statsReport.classList.add("hidden");

    if (feedback.end) {
      els.next.classList.add("hidden");
      els.restart.classList.remove("hidden");
      els.viewHistory.classList.remove("hidden");
      renderStatsReport();
      renderHistoryList();
    } else {
      els.next.classList.remove("hidden");
      els.next.textContent = feedback.nextLabel || t("nextButton");
      els.restart.classList.add("hidden");
      els.viewHistory.classList.add("hidden");
      els.next.onclick = advanceRound;
    }
  }

  function renderStatsReport() {
    const stats = getRunStats();
    const diagnosis = stats.infected
      ? `
        <div class="diagnosis-card">
          <p><strong>确诊：</strong>${escapeHTML(stats.diagnosis)}</p>
          <p><strong>途径：</strong>${escapeHTML(stats.route)}</p>
        </div>
      `
      : `
        <div class="diagnosis-card diagnosis-safe">
          <p><strong>确诊：</strong>未触发感染结算</p>
          <p><strong>提示：</strong>这只是游戏模拟，现实请以正规检测为准。</p>
        </div>
      `;

    els.statsReport.classList.remove("hidden");
    els.statsReport.innerHTML = `
      <div class="settlement-panel">
        <h3>${t("statsTitle")}</h3>
        <div class="result-grid">
          <div class="result-cell"><span>✅ 理智享受</span><strong>${stats.rationalEnjoy}</strong></div>
          <div class="result-cell"><span>🛡️ 正确离开</span><strong>${stats.correctLeave}</strong></div>
          <div class="result-cell"><span>😰 死里逃生</span><strong>${stats.deadEscape}</strong></div>
          <div class="result-cell"><span>👋 遗憾错过</span><strong>${stats.missed}</strong></div>
          <div class="result-cell result-wide result-danger"><span>☠️ 被感染次数</span><strong>${stats.infected}</strong></div>
        </div>
        <h3>行为统计（次数）</h3>
        <div class="action-stat-grid">
          <div><span>无套性交</span><strong>${stats.actions.rush}</strong></div>
          <div><span>无套口交</span><strong>${stats.actions.shortcut}</strong></div>
          <div><span>戴套性交</span><strong>${stats.actions.steady}</strong></div>
          <div><span>戴套口交</span><strong>${stats.actions.light}</strong></div>
          <div><span>现场测试</span><strong>${stats.actions.test}</strong></div>
          <div><span>医院检查</span><strong>${stats.actions.hospital}</strong></div>
          <div class="action-wide"><span>癞蛤蟆想吃天鹅肉</span><strong>${stats.actions.skip}</strong></div>
        </div>
        <div class="survival-row"><span>⏱️ 存活回合</span><strong>${stats.survivedTurns}</strong></div>
      </div>
      ${diagnosis}
    `;
  }

  function renderHistoryList() {
    els.historyList.innerHTML = "";
    if (!state.history.length) {
      els.historyList.innerHTML = `<p>${t("emptyHistory")}</p>`;
      return;
    }

    state.history.forEach((item) => {
      const node = document.createElement("div");
      const tags = item.tags.length
        ? item.tags.map((tag) => `<span>${tag.revealed ? escapeHTML(tag.text) : t("hiddenInfo")}</span>`).join("")
        : "";
      const carried = item.riskProfile?.diseases?.length ? item.riskProfile.diseases.join("、") : "未形成明确风险";
      const outcome = item.outcome || "已记录";

      node.className = "history-item";
      node.innerHTML = `
        <div class="history-avatar">${item.avatar ? `<img src="${item.avatar}" alt="">` : ""}</div>
        <div class="history-main">
          <div class="history-tags">${tags}</div>
          <div class="history-action">${t("recordAction")}: ${escapeHTML(item.action)}</div>
          <div class="history-disease">携带风险：${escapeHTML(carried)}</div>
        </div>
        <div class="history-outcome ${getOutcomeClass(outcome)}">${escapeHTML(outcome)}</div>
      `;
      els.historyList.append(node);
    });
  }

  function getRunStats() {
    const countOutcome = (name) => state.history.filter((item) => item.outcome === name).length;
    const diseases = [...new Set(state.riskRecords.flatMap((record) => record.diseases?.length ? record.diseases : [record.disease]).filter(Boolean))];
    return {
      rationalEnjoy: countOutcome("理智享受"),
      correctLeave: countOutcome("正确离开"),
      deadEscape: countOutcome("死里逃生"),
      missed: countOutcome("遗憾错过"),
      infected: state.riskRecords.length,
      diagnosis: diseases.length ? diseases.join("、") : "无",
      route: state.riskRecords.length ? "接触传播" : "无",
      survivedTurns: state.history.length,
      actions: {
        light: state.actionCounts.light || 0,
        steady: state.actionCounts.steady || 0,
        shortcut: state.actionCounts.shortcut || 0,
        rush: state.actionCounts.rush || 0,
        skip: state.actionCounts.skip || 0,
        refuse: state.actionCounts.refuse || 0,
        chat: state.actionCounts.chat || 0,
        test: state.actionCounts.test || 0,
        hospital: state.actionCounts.hospital || 0
      }
    };
  }

  function showHistory() {
    renderHistoryList();
    els.summaryView.classList.add("hidden");
    els.historyView.classList.remove("hidden");
  }

  function showSummary() {
    els.historyView.classList.add("hidden");
    els.summaryView.classList.remove("hidden");
  }

  function showToast(message) {
    if (!message) return;
    window.clearTimeout(toastTimer);
    els.toast.textContent = message;
    els.toast.classList.add("visible");
    toastTimer = window.setTimeout(() => els.toast.classList.remove("visible"), 1700);
  }

  function copyRecap() {
    const lines = [
      `${t("appTitle")} - ${lastFeedback ? lastFeedback.title : ""}`,
      `${t("desireLabel").replace("🔥 ", "")}: ${state.desire}`,
      `${t("loadLabel").replace("🧠 ", "")}: ${state.load}`,
      ""
    ];
    state.history.forEach((item, index) => {
      lines.push(`${index + 1}. ${item.action}`);
    });
    navigator.clipboard?.writeText(lines.join("\n")).then(() => showToast(t("copied")));
  }

  function bindEvents() {
    els.complianceConsent.addEventListener("change", () => {
      els.complianceContinue.disabled = !els.complianceConsent.checked;
    });
    els.complianceContinue.addEventListener("click", () => {
      if (!els.complianceConsent.checked) return;
      els.compliance.classList.add("hidden");
      els.gender.classList.remove("hidden");
    });
    els.genderButtons.forEach((button) => {
      button.addEventListener("click", () => chooseRole(button.dataset.role));
    });
    els.start.addEventListener("click", () => startGame());
    els.homeButton.addEventListener("click", returnToIntro);
    els.restart.addEventListener("click", returnToIntro);
    els.helpButton.addEventListener("click", () => els.help.classList.remove("hidden"));
    els.closeHelp.addEventListener("click", () => els.help.classList.add("hidden"));
    els.gotIt.addEventListener("click", () => els.help.classList.add("hidden"));
    els.languageToggle.addEventListener("click", () => setLanguage(language === "zh" ? "en" : "zh"));
    els.introLanguageToggle.addEventListener("click", () => setLanguage(language === "zh" ? "en" : "zh"));
    els.coffeeCard.addEventListener("click", takeFieldTest);
    els.restButton.addEventListener("click", takeHospitalCheck);
    els.buttons.forEach((button) => button.addEventListener("click", () => takeAction(button.dataset.action)));
    els.viewHistory.addEventListener("click", showHistory);
    els.backSummary.addEventListener("click", showSummary);
    els.feedbackTitle.addEventListener("dblclick", copyRecap);
  }

  bindEvents();
  setLanguage(language);
})();
