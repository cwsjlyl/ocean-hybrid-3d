/**
 * 香港小學二年級（P2）海洋生態圖鑑與互動問答題庫
 * 語言設計貼合香港小二學生認知程度，支援粵語（zh-HK）及英語（en-US）語音朗讀
 */

export const SPECIES_DATA = [
    {
        id: 'clownfish',
        zh: '小丑魚',
        en: 'Clownfish',
        emoji: '🐠',
        locomotion: 'fish',        // 左右擺尾推進（魚類）
        feedsOnPellets: true,
        size: 2.1,
        mass: 0.35,                // kg
        cruiseSpeed: 2.15,         // m/s
        maxSpeed: 4.1,
        turnRate: 3.3,             // rad/s
        depthRange: [2.0, 8.2],
        count: 5,
        primaryColor: 0xff6b2b,
        secondaryColor: 0xffffff,
        accentColor: 0x1e272e,
        desc: '小丑魚身上有鮮橙色同白色條紋，好鍾意住喺海葵入面，同海葵互相保護、一齊生活。',
        funFact: '🌟 小知識：小丑魚皮膚有一層特別嘅保護黏液，所以唔怕海葵觸手嘅刺細胞！'
    },
    {
        id: 'turtle',
        zh: '綠海龜',
        en: 'Green Sea Turtle',
        emoji: '🐢',
        locomotion: 'turtle',      // 前肢鰭足上下拍動滑翔
        feedsOnPellets: true,
        size: 3.2,
        mass: 115,
        cruiseSpeed: 1.48,
        maxSpeed: 2.65,
        turnRate: 1.45,
        depthRange: [3.6, 12.8],
        count: 3,
        primaryColor: 0x2ecc71,
        secondaryColor: 0x6ab04c,
        accentColor: 0xf6e58d,
        desc: '綠海龜背脊有堅硬圓潤嘅龜殼，用好似翅膀咁嘅前肢喺大海入面優雅滑翔，每隔一段時間要浮上水面呼吸。',
        funFact: '🌟 保育貼士：漂浮嘅膠袋同膠樽好似水母，海龜誤食會生病，所以我哋要積極減塑！'
    },
    {
        id: 'shark',
        zh: '雙髻鯊',
        en: 'Hammerhead Shark',
        emoji: '🦈',
        locomotion: 'fish',        // 左右擺尾推進（軟骨魚類）
        feedsOnPellets: false,
        size: 4.3,
        mass: 220,
        cruiseSpeed: 2.65,
        maxSpeed: 4.4,
        turnRate: 1.65,
        depthRange: [5.8, 15.2],
        count: 2,
        primaryColor: 0x607d8b,
        secondaryColor: 0xeaf0f6,
        accentColor: 0x2d3436,
        desc: '雙髻鯊有獨特嘅「T字形」寬闊頭部，兩隻眼睛分別喺左右兩端，可以睇清楚周圍廣闊嘅海底環境。',
        funFact: '🌟 小知識：雙髻鯊嘅頭部可以感應微弱電流，幫佢搵出藏喺沙底下面嘅小生物！'
    },
    {
        id: 'whale',
        zh: '藍鯨',
        en: 'Blue Whale',
        emoji: '🐋',
        locomotion: 'cetacean',    // 海洋哺乳類：水平尾鰭上下擺動！
        feedsOnPellets: false,
        size: 7.0,
        mass: 85000,
        cruiseSpeed: 1.32,
        maxSpeed: 2.1,
        turnRate: 0.62,
        depthRange: [9.8, 17.6],
        count: 2,
        primaryColor: 0x2980b9,
        secondaryColor: 0xbbe1fa,
        accentColor: 0x1b4f72,
        desc: '藍鯨係地球上體型最大嘅動物！佢屬於海洋哺乳類動物，用肺呼吸，性格非常溫馴。',
        funFact: '🌟 觀察重點：留意藍鯨嘅尾巴係「上下擺動」游水，同一般魚類「左右擺尾」唔一樣㗎！'
    },
    {
        id: 'bluefish',
        zh: '藍刀鯛',
        en: 'Blue Tang',
        emoji: '🐟',
        locomotion: 'fish',
        feedsOnPellets: true,
        size: 1.75,
        mass: 0.3,
        cruiseSpeed: 2.4,
        maxSpeed: 4.5,
        turnRate: 3.6,
        depthRange: [2.2, 10.2],
        count: 5,
        primaryColor: 0x0984e3,
        secondaryColor: 0xfdcb6e,
        accentColor: 0x1e272e,
        desc: '藍刀鯛擁有鮮藍色身體同亮黃色尾巴，經常成群結隊喺珊瑚礁附近游動，食礁石上面多餘嘅海藻。',
        funFact: '🌟 小知識：藍刀鯛幫珊瑚清理海藻，令珊瑚可以吸收充足陽光健康生長！'
    },
    {
        id: 'pinkfish',
        zh: '粉紅珊瑚魚',
        en: 'Pink Anthias',
        emoji: '🐡',
        locomotion: 'fish',
        feedsOnPellets: true,
        size: 1.65,
        mass: 0.25,
        cruiseSpeed: 2.35,
        maxSpeed: 4.4,
        turnRate: 3.8,
        depthRange: [2.4, 11.0],
        count: 5,
        primaryColor: 0xff6b81,
        secondaryColor: 0xffbe76,
        accentColor: 0xffffff,
        desc: '活潑可愛嘅粉紅珊瑚魚鍾意同同伴一齊游水，遇到危險就會敏捷咁躲入珊瑚縫隙入面。',
        funFact: '🌟 小知識：魚群一齊游動不但更安全，仲可以利用水流節省力氣！'
    }
];

export const QUIZ_QUESTIONS = [
    {
        id: 1,
        icon: '🐠',
        question: '小丑魚最鍾意住喺邊種海洋生物入面，同佢做最好嘅朋友呢？',
        options: ['海葵', '膠樽', '木桶'],
        answer: 0,
        explanation: '答啱喇！小丑魚身上有保護黏液，可以安全住喺海葵入面，互相幫忙！'
    },
    {
        id: 2,
        icon: '🐋',
        question: '地球上體型最大嘅動物係「藍鯨」，請問藍鯨係用咩器官呼吸㗎？',
        options: ['用魚鰓呼吸', '用肺呼吸', '用尾巴呼吸'],
        answer: 1,
        explanation: '好叻呀！藍鯨係海洋哺乳類動物，同我哋一樣係用「肺」呼吸空氣㗎！'
    },
    {
        id: 3,
        icon: '🐢',
        question: '點解漂浮喺海面嘅塑膠垃圾對「綠海龜」好危險呢？',
        options: ['因為塑膠太重會壓住海床', '因為海龜會誤以為係水母而食落肚', '因為塑膠會變成石頭'],
        answer: 1,
        explanation: '完全正確！膠袋同膠樽喺水入面好似水母，海龜食咗會生病，所以我哋要愛護海洋！'
    },
    {
        id: 4,
        icon: '🦈',
        question: '「雙髻鯊」個頭好似鎚仔咁呈 T 字形，佢兩隻眼睛生喺邊度呢？',
        options: ['生喺尾巴上面', '生喺肚腩下面', '生喺 T 字形頭部嘅左右兩端'],
        answer: 2,
        explanation: '答啱喇！眼睛喺左右兩端，令雙髻鯊可以睇到好廣闊嘅立體海底視野！'
    },
    {
        id: 5,
        icon: '♻️',
        question: '去完海灘玩之後，飲完水嘅空膠樽應該點樣處理最環保？',
        options: ['隨手丟入大海餵魚', '帶走並分類放入塑膠回收箱', '埋喺沙灘入面'],
        answer: 1,
        explanation: '做得好！自己垃圾自己帶走，仲要乾淨回收，一齊做環保小先鋒！'
    },
    {
        id: 6,
        icon: '🪸',
        question: '五顏六色嘅「珊瑚礁」對海底嘅小魚嚟講有咩重要用途？',
        options: ['提供安全嘅屋企同食物', '用嚟整塑膠玩具', '令海水變得混濁'],
        answer: 0,
        explanation: '冇錯喇！珊瑚礁就好似「海底熱帶雨林」，係好多海洋生物嘅溫馨家園！'
    },
    {
        id: 7,
        icon: '👀',
        question: '仔細觀察海底嘅藍鯨同小丑魚，藍鯨游水嗰陣條尾係點樣擺動㗎？',
        options: ['上下擺動', '左右擺動', '完全唔郁'],
        answer: 0,
        explanation: '觀察得好仔細！鯨魚係哺乳類，水平尾鰭係「上下擺動」；而魚類嘅尾巴係「左右擺動」㗎！'
    },
    {
        id: 8,
        icon: '🐟',
        question: '「藍刀鯛」平時食礁石上面過多嘅海藻，咁樣對珊瑚有咩幫助呢？',
        options: ['令珊瑚生病', '幫珊瑚清潔，令珊瑚健康生長', '將珊瑚變成藍色'],
        answer: 1,
        explanation: '答啱喇！藍刀鯛好似珊瑚礁嘅清潔小幫手，維持海洋生態平衡！'
    },
    {
        id: 9,
        icon: '🫧',
        question: '海底冒出嚟嘅空氣泡，點解越往水面升起，體積會慢慢變大少少呢？',
        options: ['因為越近水面水壓越小，氣泡就會膨脹', '因為小魚對住氣泡吹氣', '因為氣泡食咗魚糧'],
        answer: 0,
        explanation: '科學小博士！越深水嘅地方水壓越大，氣泡升近水面時水壓變小，所以體積會自然膨脹！'
    },
    {
        id: 10,
        icon: '🌊',
        question: '作為香港小二學生，喺日常生活做邊件事最能夠保護海洋生物？',
        options: ['自備水樽同環保袋，減少使用即棄塑膠', '買多啲即棄膠餐具', '開大冷氣唔關窗'],
        answer: 0,
        explanation: '太棒喇！自備水樽同環保袋可以源頭減廢，保護海龜、鯨魚同美麗嘅大海！'
    }
];
