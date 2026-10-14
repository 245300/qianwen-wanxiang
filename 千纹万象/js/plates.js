/* ============ 真迹纹库（plates.js） ============
 * 母题单元全部为公版真迹图版：
 *   Owen Jones《Examples of Chinese Ornament》(1867)
 *   选自南肯辛顿博物馆（今 V&A）等藏品彩色图版，公有领域，
 *   经维基共享资源（Wikimedia Commons）获取，本地化存储于 assets/patterns/。
 * 字段：num 图版号 / cat 谱系 / name 雅称 / origin 原书器物考 / meaning 寓意 / poetic 签语素材
 * 谱系沿用 categories.js（文字吉语类暂无对应图版，前端自动隐藏空谱系）。
 * 命名与器物考据依据 Jones 原书图版说明（Description of the plates, pp.9–15），
 * 中文雅称与寓意为团队考据转译，详见 docs/参考文献与图鉴考据.md。
 */

const PLATE_CREDIT = "图版：Owen Jones《Examples of Chinese Ornament》(1867) · 公有领域 · 经维基共享资源获取";

const Plates = [
  { num: 2,   cat: "plant",    name: "青花缠枝",   origin: "青花瓷器（南肯辛顿博物馆藏）", meaning: "缠枝回环，生生不息", poetic: "一枝缠绕百枝开，绵延不断是春来。" },
  { num: 3,   cat: "geometry", name: "青花拱帘",   origin: "青花瓷盆 · 四梨形开光", meaning: "四方安定，门庭有仪", poetic: "四瓣拱出一帘幽，门里春秋岁月长。" },
  { num: 4,   cat: "plant",    name: "暗地繁花",   origin: "彩绘瓷器（深地浅花）", meaning: "暗地生花，愈暗愈明", poetic: "莫道暗地无颜色，一花开处满目春。" },
  { num: 5,   cat: "plant",    name: "青花满花",   origin: "青花瓷器（深地缠枝）", meaning: "花开满地，富足盈门", poetic: "满地花开不记年，青花深处有人家。" },
  { num: 6,   cat: "geometry", name: "蓝彩垂璎",   origin: "青花瓷缸口沿垂饰", meaning: "璎珞垂门，吉祥临门", poetic: "璎珞垂垂自天来，一串吉祥一串心。" },
  { num: 7,   cat: "geometry", name: "联珠团窠",   origin: "青花瓷盘（波斯风团窠）", meaning: "珠联璧合，团圆美满", poetic: "联珠作界窠中花，圆满原来不须多。" },
  { num: 8,   cat: "plant",    name: "青花缠瓶",   origin: "青花瓷瓶（连续缠枝）", meaning: "缠枝绕瓶，平安绵长", poetic: "缠枝绕尽瓶身转，转到平安第几重。" },
  { num: 9,   cat: "geometry", name: "青花边饰",   origin: "青花瓷瓶口沿边饰二式", meaning: "边饰成规，进退有度", poetic: "一线描成千古式，边边角角亦文章。" },
  { num: 10,  cat: "geometry", name: "珐琅彩带",   origin: "掐丝珐琅瓶边饰", meaning: "彩带当风，仪态万方", poetic: "彩带临风舞未央，一层花色一层光。" },
  { num: 11,  cat: "plant",    name: "珐琅团花",   origin: "掐丝珐琅碗（三足大花）", meaning: "三花聚顶，兴旺发达", poetic: "三足鼎立一团春，珐琅色里见精神。" },
  { num: 12,  cat: "plant",    name: "织锦斜花",   origin: "织物纹样", meaning: "锦上添花，日进斗金", poetic: "锦机声里花斜出，织进人间富贵来。" },
  { num: 13,  cat: "plant",    name: "珐琅炉花",   origin: "掐丝珐琅香炉（等边三角布花）", meaning: "香火绵延，子孙兴旺", poetic: "炉烟起处万花开，三角安排自天裁。" },
  { num: 14,  cat: "plant",    name: "珐琅开光",   origin: "掐丝珐琅瓶（半周展开）", meaning: "开光见喜，四时有成", poetic: "开光一扇见春深，半壁花光半壁云。" },
  { num: 15,  cat: "plant",    name: "珐琅大花",   origin: "掐丝珐琅碗（完形大花）", meaning: "大器大成，花开见福", poetic: "大手笔开大花，一瓣一心皆福田。" },
  { num: 16,  cat: "geometry", name: "珐琅边饰",   origin: "掐丝珐琅瓶边饰", meaning: "器有所依，边有所饰", poetic: "好花须有好边陪，规矩之中见天工。" },
  { num: 19,  cat: "plant",    name: "印纹团窠",   origin: "素胎印纹瓷盘（Jones 论陶人印纹）", meaning: "印纹成章，匠心可循", poetic: "陶人一印千年后，犹见当时手上春。" },
  { num: 20,  cat: "plant",    name: "彩瓷团窠",   origin: "彩绘瓷盘（团窠组合）", meaning: "团团圆圆，和合美满", poetic: "团花不语自成圆，圆里乾坤日月宽。" },
  { num: 21,  cat: "geometry", name: "青花边谱",   origin: "青花瓷器边饰汇编", meaning: "式样成谱，源流有自", poetic: "一谱收尽千年式，边饰之中有源流。" },
  { num: 22,  cat: "geometry", name: "龟背锦地",   origin: "青花瓷器（盘心与龟背锦地）", meaning: "龟甲长寿，锦地生辉", poetic: "龟纹六出寿而康，锦地铺开岁月长。" },
  { num: 23,  cat: "plant",    name: "青花团菊",   origin: "青花瓷瓶（对称秋菊）", meaning: "团菊对开，安康久远", poetic: "陶家一朵东篱菊，开在瓶身亦傲霜。" },
  { num: 24,  cat: "plant",    name: "青花菊涛",   origin: "青花瓷缸（白线暗刻）", meaning: "菊隐东篱，涛声不息", poetic: "白线暗描秋菊瘦，一缸涛色半缸云。" },
  { num: 25,  cat: "plant",    name: "青花暗缠",   origin: "青花瓷器（暗地缠枝）", meaning: "暗香浮动，绵延不绝", poetic: "暗地缠枝暗地香，不绝如缕是春光。" },
  { num: 26,  cat: "plant",    name: "青花繁花",   origin: "青花瓷瓶（自然花式）", meaning: "繁花似锦，生机盎然", poetic: "繁花照眼分明处，自在生机不必裁。" },
  { num: 27,  cat: "geometry", name: "青花盘心",   origin: "青花瓷器（盘心与边饰）", meaning: "心有中心，行有方向", poetic: "盘心一点是初心，边饰千回是远行。" },
  { num: 28,  cat: "plant",    name: "青花藤蔓",   origin: "青花瓷瓶（藤蔓碎片式）", meaning: "藤蔓牵延，好事连连", poetic: "藤蔓牵延不觉远，一节一节是好运。" },
  { num: 29,  cat: "cloudwater", name: "珐琅山海", origin: "掐丝珐琅碗内外（海马踏浪、蝙蝠祥云，陆海空三才纹）", meaning: "海马逐浪，蝠鸟翔云", poetic: "山海入纹天地宽，海马祥云共往还。" },
  { num: 30,  cat: "plant",    name: "珐琅盆花",   origin: "掐丝珐琅盆（精工细作）", meaning: "精工出细活，花开自结果", poetic: "丝掐成花色成诗，一盆春色一盆功。" },
  { num: 31,  cat: "plant",    name: "珐琅花带",   origin: "掐丝珐琅瓶（花带三式）", meaning: "花带成行，井然有致", poetic: "花带成行次第开，井然之间见安排。" },
  { num: 32,  cat: "artifact", name: "珐琅方瓶",   origin: "掐丝珐琅方瓶（器形残片）", meaning: "方正如仪，器度不凡", poetic: "方瓶有棱花有骨，器度端方自不凡。" },
  { num: 33,  cat: "artifact", name: "珐琅圆瓶",   origin: "掐丝珐琅圆瓶（残片二式）", meaning: "圆融周全，大气自成", poetic: "圆瓶一身花事满，圆融周全是襟怀。" },
  { num: 34,  cat: "artifact", name: "珐琅瓶肩",   origin: "掐丝珐琅圆瓶（口沿残片）", meaning: "肩能担事，圆满之始", poetic: "瓶肩挑起满身花，担事原来是担当。" },
  { num: 35,  cat: "plant",    name: "珐琅缠枝带", origin: "掐丝珐琅碗（连续主茎）", meaning: "主茎一贯，善始善终", poetic: "一根主茎穿花过，善始善终是真章。" },
  { num: 37,  cat: "plant",    name: "珐琅华彩",   origin: "掐丝珐琅碗（纯中式构图）", meaning: "华彩纷呈，自成一格", poetic: "华彩满身皆是意，自成一格不须同。" },
  { num: 38,  cat: "animal",   name: "珐琅四蝠",   origin: "掐丝珐琅盘（四蝠展翅相连）", meaning: "福从天降，四方来福", poetic: "四蝠展翅共团圞，福到人间四季安。" },
  { num: 39,  cat: "geometry", name: "珐琅回纹",   origin: "掐丝珐琅瓶（回纹诸式）", meaning: "富贵不断头，绵延不绝", poetic: "回纹一转一重天，富贵绵绵不断头。" },
  { num: 40,  cat: "animal",   name: "珐琅蝠边",   origin: "掐丝珐琅瓶（蝠纹边饰）", meaning: "福在眼前，边福边至", poetic: "蝠影翩翩上边栏，福在眼前不觉远。" },
  { num: 41,  cat: "plant",    name: "琉红暗纹",   origin: "彩绘瓷瓶（拟印度漆器）", meaning: "暗纹沉静，大音希声", poetic: "沉红一匹无花纹，静气之内有雷声。" },
  { num: 42,  cat: "plant",    name: "金地暗花",   origin: "彩绘瓷瓶（中式花式）", meaning: "金玉其内，不炫而彰", poetic: "金地暗花不炫目，内里有光人自知。" },
  { num: 43,  cat: "geometry", name: "锦地圆窗",   origin: "彩绘葫芦瓶（连续茎锦地）", meaning: "锦地开窗，步步生莲", poetic: "锦地为纸窗为花，一窗一景一人家。" },
  { num: 44,  cat: "plant",    name: "彩瓶碎花",   origin: "彩绘瓷瓶（碎片三角式）", meaning: "碎花成锦，聚沙成塔", poetic: "碎花不必畏零散，聚作满瓶锦绣看。" },
  { num: 45,  cat: "plant",    name: "双式折花",   origin: "彩绘瓷瓶（连续与碎片对照）", meaning: "一式两法，各有其妙", poetic: "连续碎片两相照，各有各的好文章。" },
  { num: 46,  cat: "plant",    name: "彩瓶红花",   origin: "彩绘瓷瓶（红花三角布列）", meaning: "红花满瓶，红火满堂", poetic: "红花不问主人谁，开满瓶身便是春。" },
  { num: 47,  cat: "plant",    name: "彩瓶折枝",   origin: "彩绘瓷瓶（珐琅式构图）", meaning: "折枝有致，取舍有道", poetic: "折得一枝斜入画，取舍之间见性情。" },
  { num: 48,  cat: "plant",    name: "素雅缠枝",   origin: "彩绘瓷瓶（波斯印度混合风）", meaning: "素雅当先，和而不同", poetic: "素雅原来不动声，和而不同自雍容。" },
  { num: 49,  cat: "plant",    name: "红地缠枝",   origin: "铜胎画珐琅贝壳盘", meaning: "红地生花，热烈圆满", poetic: "红地生花热似火，圆满原来要热烈。" },
  { num: 50,  cat: "plant",    name: "绿地红花",   origin: "彩绘瓷瓶（多心碎片式）", meaning: "绿地红花，相映成趣", poetic: "绿肥红瘦不相争，相映方成一段春。" },
  { num: 51,  cat: "plant",    name: "锦地花卉",   origin: "彩绘瓷瓶（碎片式）", meaning: "锦上花繁，岁岁丰盈", poetic: "锦地花繁秋有信，一年丰盈一年来。" },
  { num: 52,  cat: "geometry", name: "织样四品",   origin: "掐丝珐琅与彩绘瓷（四品锦样）", meaning: "四品成谱，博观约取", poetic: "四品并陈供博览，约取一格入新裁。" },
  { num: 53,  cat: "plant",    name: "黄地百花",   origin: "铜胎画珐琅瓶（自然花式）", meaning: "黄地百花，富贵满堂", poetic: "黄地百花真富贵，一堂春色不须寻。" },
  { num: 54,  cat: "plant",    name: "彩盆花片",   origin: "彩绘瓷盆（同类构图）", meaning: "花片成幅，细水长流", poetic: "花片拼成一幅春，细水长流是日子。" },
  { num: 55,  cat: "plant",    name: "五彩缠枝",   origin: "五彩织物纹样", meaning: "五彩纷呈，热闹吉祥", poetic: "五色丝线五色心，缠出一幅太平春。" },
  { num: 56,  cat: "animal",   name: "彩瓶蜻蜓",   origin: "彩绘瓷瓶（蜻蜓三角布列）", meaning: "蜻蜓点水，青云直上", poetic: "蜻蜓点点过花梢，点得青云路不遥。" },
  { num: 57,  cat: "plant",    name: "珐琅碎金",   origin: "铜胎画珐琅瓶（碎片式）", meaning: "碎金满地，积少成多", poetic: "碎金满地君莫笑，积少成多自有山。" },
  { num: 58,  cat: "plant",    name: "青花缠菊",   origin: "青花瓷罐（离散式）", meaning: "菊开离散，各自安好", poetic: "离散原来是布局，一花一处自安然。" },
  { num: 59,  cat: "geometry", name: "珐琅拱边",   origin: "铜胎画珐琅瓶（拱形边饰）", meaning: "拱边如塔，步步向上", poetic: "拱边层层如塔起，步步向上不回头。" },
  { num: 60,  cat: "geometry", name: "圆窗盘心",   origin: "彩绘瓷盘（优雅盘心）", meaning: "圆窗居中，定海神针", poetic: "万纹围绕中窗定，一窗定住满盘春。" },
  { num: 62,  cat: "plant",    name: "青花莲纹",   origin: "彩绘瓷瓶（同期珐琅风格）", meaning: "莲出清波，一路连科", poetic: "莲花朵朵向清波，一路连科一路歌。" },
  { num: 63,  cat: "geometry", name: "珐琅透雕",   origin: "掐丝珐琅大盘口沿（透雕残片）", meaning: "镂空见巧，虚实相生", poetic: "镂空处见巧心思，虚实相生方是高。" },
  { num: 64,  cat: "myth",     name: "游龙边饰",   origin: "掐丝珐琅器边饰（下边饰龙纹，异兽浮游填空）", meaning: "游龙浮游，气韵生动", poetic: "游龙一行生万象，异兽浮游自成章。" },
  { num: 65,  cat: "plant",    name: "彩瓶花带",   origin: "彩绘瓷瓶（纯中式构图）", meaning: "花带平铺，从容不迫", poetic: "花带平铺不慌忙，从容开到岁寒时。" },
  { num: 66,  cat: "plant",    name: "绿地散花",   origin: "彩绘瓷瓶（同前风格）", meaning: "绿地散花，随遇而安", poetic: "绿地散花无定处，随遇而安处处春。" },
  { num: 67,  cat: "plant",    name: "粉彩百花",   origin: "彩绘瓷器（繁密花式）", meaning: "百花齐放，百家争春", poetic: "百花齐放春满园，各自芬芳各自妍。" },
  { num: 68,  cat: "plant",    name: "珐琅颈花",   origin: "掐丝珐琅瓶（颈部花带）", meaning: "颈上一带，画龙点睛", poetic: "一带花开瓶颈上，画龙点睛在当处。" },
  { num: 71,  cat: "plant",    name: "墨地红花",   origin: "彩绘瓷罐（横向主茎）", meaning: "墨地红花，浓淡相宜", poetic: "墨地浓时花更艳，浓淡相宜是文章。" },
  { num: 72,  cat: "plant",    name: "瓷盘团花",   origin: "彩绘瓷盘（圆形团花与波带）", meaning: "圆满意足，花好月圆", poetic: "一轮团花当一轮月，照见人间圆满时。" },
  { num: 75,  cat: "plant",    name: "素地青花",   origin: "彩绘瓷瓶（混合风格）", meaning: "素地青花，简即是繁", poetic: "素到极处花自明，简到极处便是繁。" },
  { num: 76,  cat: "plant",    name: "红花锦簇",   origin: "彩绘瓷瓶（连续主茎）", meaning: "花团锦簇，兴旺红火", poetic: "花团锦簇开无主，兴旺原来是自家。" },
  { num: 77,  cat: "plant",    name: "白地疏枝",   origin: "彩绘瓷瓶（碎片式 · 纯中式）", meaning: "白地清雅，君子之交", poetic: "白地清雅花君子，淡到无痕交自长。" },
  { num: 78,  cat: "plant",    name: "素瓶异花",   origin: "彩绘瓷瓶（波斯印度风）", meaning: "异域同春，美美与共", poetic: "异域花开一瓶春，美美与共大不同。" },
  { num: 79,  cat: "plant",    name: "绕底缠枝",   origin: "彩绘瓷瓶（主茎绕底而上）", meaning: "蜿蜒向上，节节高升", poetic: "主茎绕底盘旋上，节节高升不问年。" },
  { num: 80,  cat: "plant",    name: "珐琅异花",   origin: "铜胎画珐琅瓶（印度式）", meaning: "他山之石，可以攻玉", poetic: "他山之石来入瓶，攻玉还须自己磨。" },
  { num: 81,  cat: "plant",    name: "珐琅大缸",   origin: "掐丝珐琅大缸（琼斯誉为至臻）", meaning: "大器晚成，气象万千", poetic: "大缸能容千斛水，花纹自有一乾坤。" },
  { num: 82,  cat: "plant",    name: "米色团花",   origin: "彩绘瓷瓶（碎片式）", meaning: "米色温润，细水长流", poetic: "米色温润不张扬，细水长流日子长。" },
  { num: 83,  cat: "plant",    name: "红地涡卷",   origin: "彩绘瓷瓶（浮雕涡卷地）", meaning: "涡卷层叠，繁而不乱", poetic: "涡卷层层花叠起，层叠有致是繁华。" },
  { num: 84,  cat: "plant",    name: "白地散花",   origin: "彩绘瓷瓶（更离散式）", meaning: "散而不乱，形散神聚", poetic: "形散神聚方为妙，一片花心一片天。" },
  { num: 85,  cat: "plant",    name: "双联花卉",   origin: "彩绘瓷盆与瓶（上下两幅）", meaning: "一幅两景，各美其美", poetic: "一幅之中两重景，各美其美美与共。" },
  { num: 86,  cat: "myth",     name: "青花四龙",   origin: "青花瓷盘（四龙守迷宫式）", meaning: "四龙守境，镇宅辟邪", poetic: "四龙各守一方土，守得人间岁月安。" },
  { num: 87,  cat: "plant",    name: "粉彩牡丹",   origin: "彩绘瓷瓶（印度式 · 繁密）", meaning: "牡丹雍容，花开富贵", poetic: "牡丹开到倾国色，富贵原来是从容。" },
  { num: 88,  cat: "plant",    name: "珐琅花边",   origin: "掐丝珐琅（星形小碟等）", meaning: "花边一道，余韵悠长", poetic: "花边一道收长卷，余韵悠悠不尽春。" },
  { num: 90,  cat: "plant",    name: "朱绿花影",   origin: "彩绘瓷瓶（豪放印度风）", meaning: "朱绿相撞，大胆成章", poetic: "朱绿相撞不相克，大胆原来成大章。" },
  { num: 91,  cat: "plant",    name: "珐琅托花",   origin: "掐丝珐琅小盘（花满其隙）", meaning: "花满其隙，密而有序", poetic: "花满其隙密而安，密处原来见功夫。" },
  { num: 92,  cat: "plant",    name: "白地牡丹",   origin: "彩绘瓷瓶（连续主茎 · 豪放）", meaning: "白地牡丹，清贵之极", poetic: "白地牡丹清贵相，不施粉黛动人心。" },
  { num: 93,  cat: "geometry", name: "彩拱花带",   origin: "彩绘瓷瓶（离散花 · 拱带）", meaning: "拱带承花，托举有力", poetic: "拱带承花稳如山，托举原来也是美。" },
  { num: 94,  cat: "cloudwater", name: "红地云拱", origin: "彩绘瓷罐（碎片式 · 豪放）", meaning: "云拱红地，如日方升", poetic: "云拱托起一轮日，如日方升在东方。" },
  { num: 96,  cat: "plant",    name: "翠地碎金",   origin: "彩绘瓷瓶（奇构 · 色阶相济）", meaning: "翠地碎金，浓淡相济", poetic: "浓到深处淡处明，翠地碎金两相成。" },
  { num: 97,  cat: "plant",    name: "素地花径",   origin: "彩绘瓷瓶（微浮雕 · 模铸）", meaning: "花径通幽，模铸有痕", poetic: "花径一条通幽处，模铸千年有回声。" },
  { num: 99,  cat: "plant",    name: "白地绿叶",   origin: "彩绘瓷瓶（连续主茎）", meaning: "绿叶白地，相得益彰", poetic: "白地绿叶两相宜，平平淡淡见真心。" },
  { num: 100, cat: "plant",    name: "折枝花果",   origin: "彩绘瓷瓶（花果均衡）", meaning: "花果平衡，硕果累累", poetic: "一枝花果两平衡，硕果累累压满枝。" },

  /* ===== 补充 · Owen Jones 补图（第 16~18/36/61/69/70/73/74/89/95/98 号图版，原书 100 幅补齐） ===== */
  { num: 17,  cat: "geometry", name: "青花中心谱", origin: "青花瓷器（盘心与锦地边饰）", meaning: "中心有主，边饰有成", poetic: "盘心一朵定乾坤，四周锦地自成章。" },
  { num: 18,  cat: "plant",    name: "青花折枝谱", origin: "青花瓷器（折枝花式）", meaning: "折枝入画，一枝独秀", poetic: "一折一枝一世界，亭亭独秀是此花。" },
  { num: 36,  cat: "plant",    name: "珐琅缸花",   origin: "掐丝珐琅大罐（偏中式构图）", meaning: "大罐丰花，藏富于器", poetic: "大罐能藏花几重，藏富于器是家风。" },
  { num: 61,  cat: "plant",    name: "青绿瓶花谱", origin: "彩绘瓷瓶（青绿花式）", meaning: "青绿相和，气象清和", poetic: "青绿一调花满地，清和气里自生辉。" },
  { num: 69,  cat: "plant",    name: "绿地牡丹架", origin: "彩绘瓷瓶（三角连续主茎）", meaning: "牡丹有架，花开有度", poetic: "牡丹一架层层上，花开有度岁华新。" },
  { num: 70,  cat: "plant",    name: "彩堆花卉谱", origin: "彩绘瓷瓶（豪放花式）", meaning: "彩花堆叠，热闹升平", poetic: "彩花堆叠不嫌多，一盏升平一盏歌。" },
  { num: 73,  cat: "plant",    name: "珐琅团窠谱", origin: "掐丝珐琅器（团窠式）", meaning: "团窠纳福，福自中来", poetic: "团窠一开福自生，团圆深处是人间。" },
  { num: 74,  cat: "plant",    name: "朱橘花枝谱", origin: "彩绘瓷器（朱橘花枝）", meaning: "朱橘花枝，好景常新", poetic: "朱橘一枝扶花影，好景长留人长乐。" },
  { num: 89,  cat: "geometry", name: "青彩边饰谱", origin: "彩绘瓷器（青彩边饰）", meaning: "边饰有序，美而有序", poetic: "边饰一道序井然，美在分寸之间藏。" },
  { num: 95,  cat: "plant",    name: "翠地花堆谱", origin: "彩绘瓷瓶（翠地稠花）", meaning: "翠地稠花，繁而不乱", poetic: "翠地稠花千朵叠，繁而不乱是家风。" },
  { num: 98,  cat: "artifact", name: "乌金错盘",   origin: "错金银铜盘（Inlaid bronze dish）", meaning: "乌金错采，宝光内蕴", poetic: "乌金一片错云霞，宝光内蕴不轻发。" },

  /* ===== 补充 · 新征集（公域/CC，多为织物绣品与器物纹样） =====
     注：原 208 蜀锦双凤、209 饕餮纹钺、210 饕餮纹尊、212 银元宝、213 如意纹
     五条已连同图版一并撤下（图版素材经复核后不再采用），故编号在此处跳号；
     2026-10-11 作者整图：又撤下 206 青花龙纹盘、207 龙纹瓷盘、215 花卉纹瓶、
     218 云龙织片、222 缂金蟒团、226 绣苑生灵、227 云水龙扇、228 海岳立水补、
     229 天马踏浪锦 共九条（图版文件已删除）；216/217/219/220/221/223/225/230
     八条图版同日更换为新版高清图（文件名不变）。
     后续如补入新图版，沿用 231 起的编号，不要回收旧号，
     以免已收藏/已分享的纹样密码或链接指向错图。 */
  { num: 201, cat: "animal",   name: "锦鸡补子",   origin: "明清文官补服绣（锦鸡），英国 CBL 藏", meaning: "补服加身，文采斐然", poetic: "锦鸡一补文光起，衣上云章步步高。", file: "assets/patterns/fill01.jpg", credit: "锦鸡补子（CBL 藏）· 公有领域 · 维基共享资源" },
  { num: 202, cat: "animal",   name: "豹纹补子",   origin: "明清武官补服绣（豹），英国 CBL 藏", meaning: "豹隐山林，威而不露", poetic: "豹纹深处藏山壑，威而不露自昂藏。", file: "assets/patterns/fill02.jpg", credit: "豹纹补子（CBL 藏）· 公有领域 · 维基共享资源" },
  { num: 203, cat: "animal",   name: "虎纹补子",   origin: "明清武官补服绣（虎），大都会艺术博物馆藏", meaning: "虎踞一方，镇守安详", poetic: "一虎当关万千稳，镇守安详岁月长。", file: "assets/patterns/fill03.jpg", credit: "虎纹补子 · 大都会艺术博物馆 · CC0" },
  { num: 204, cat: "animal",   name: "云兔纹锦",   origin: "明代织锦（兔在云间），大都会艺术博物馆藏", meaning: "玉兔在云，月华满地", poetic: "玉兔穿云月正圆，清辉一匹到人间。", file: "assets/patterns/fill04.jpg", credit: "云兔纹锦 · 大都会艺术博物馆 · CC0" },
  { num: 205, cat: "myth",     name: "狮纹补子",   origin: "清代二品武官补服绣（狮），大都会艺术博物馆藏", meaning: "狮吼生威，百兽率服", poetic: "金狮一吼百兽伏，耿耿威光护锦袍。", file: "assets/patterns/fill05.jpg", credit: "狮纹补子 · 大都会艺术博物馆 · CC0" },
  { num: 211, cat: "animal",   name: "虎纹补子·二", origin: "明清武官补服绣（虎），大都会艺术博物馆藏", meaning: "虎威赫赫，秋毫无犯", poetic: "威风赫赫一斑斑，秋毫无犯是威严。", file: "assets/patterns/fill14.jpg", credit: "虎纹补子·二 · 大都会艺术博物馆 · CC0" },
  { num: 214, cat: "cloudwater", name: "云肩海山", origin: "元代至明初云肩绣（海、石、牡丹），克里夫兰艺术博物馆藏", meaning: "海山入绣，襟怀万里", poetic: "云肩一挑海与山，万里襟怀一绣间。", file: "assets/patterns/fill18.jpg", credit: "云肩绣海石牡丹 · 克里夫兰艺术博物馆 · CC0" },

  /* ===== 补充 · 瑞兽/动物/云水织绣平面纹样（2026-09-29 第三批征集，均 CC0，纹样本体为织物/刺绣平面） ===== */
  { num: 216, cat: "myth",     name: "龙凤呈祥锦", origin: "元代织锦（龙凤纹），克利夫兰艺术博物馆藏", meaning: "龙凤呈祥，天作之合", poetic: "龙凤一锦两呈祥，天作之合岁月长。", file: "assets/patterns/fill19.jpg", credit: "元代龙凤纹织锦 · 克利夫兰艺术博物馆 · CC0" },
  { num: 217, cat: "myth",     name: "火珠戏龙锦", origin: "宋或更早织锦（群龙逐火珠纹），克利夫兰艺术博物馆藏", meaning: "群龙夺珠，奋发有为", poetic: "群龙争逐一火珠，奋进人间百业苏。", file: "assets/patterns/fill20.jpg", credit: "中古群龙纹织锦 · 克利夫兰艺术博物馆 · CC0" },
  { num: 219, cat: "myth",     name: "花间龙帐锦", origin: "宋元织锦帐料（花间龙纹），克利夫兰艺术博物馆藏", meaning: "花藏龙影，藏威于丽", poetic: "花间藏得龙一分，威仪不露自成尊。", file: "assets/patterns/fill22.jpg", credit: "宋元花间龙纹织锦 · 克利夫兰艺术博物馆 · CC0" },
  { num: 220, cat: "myth",     name: "虎鹿龙纹锦", origin: "中古织锦（猛虎逐鹿·龙纹），克利夫兰艺术博物馆藏", meaning: "虎鹿同川，生生不息", poetic: "虎逐鹿奔龙在天，生生不息古锦传。", file: "assets/patterns/fill23.jpg", credit: "中古虎鹿龙纹织锦 · 克利夫兰艺术博物馆 · CC0" },
  { num: 221, cat: "myth",     name: "缂丝团龙",   origin: "明代缂丝团龙纹（16 世纪），大都会艺术博物馆藏", meaning: "团龙拱珠，周而复始", poetic: "金梭织出团龙样，一转乾坤岁月长。", file: "assets/patterns/fill24.jpg", credit: "明代缂丝团龙 · 大都会艺术博物馆 · CC0" },
  { num: 223, cat: "myth",     name: "瑞兽卷云绣", origin: "清代刺绣卷套（瑞兽纹），大都会艺术博物馆藏", meaning: "瑞兽守卷，文脉有护", poetic: "瑞兽一尊护卷云，文脉绵延自有神。", file: "assets/patterns/fill26.jpg", credit: "清代瑞兽纹刺绣卷套 · 大都会艺术博物馆 · CC0" },
  { num: 224, cat: "animal",   name: "一品鹤补",   origin: "明清文官一品补服绣（仙鹤），大都会艺术博物馆藏", meaning: "鹤鸣九皋，位极文班", poetic: "一品文禽是鹤灵，九皋清唳入青云。", file: "assets/patterns/fill27.jpg", credit: "文一品仙鹤补子 · 大都会艺术博物馆 · CC0" },
  { num: 225, cat: "animal",   name: "鸳鸯文补",   origin: "明清文官补服绣（鸳鸯·鸂鶒），大都会艺术博物馆藏", meaning: "鸳鸯同栖，和美成双", poetic: "鸳鸯七品亦成双，和美人间岁月香。", file: "assets/patterns/fill28.jpg", credit: "文七品鸂鶒（鸳鸯）补子 · 大都会艺术博物馆 · CC0" },
  { num: 230, cat: "myth",     name: "八仙庆寿绣", origin: "清代金线刺绣挂屏（八仙庆寿），大都会艺术博物馆藏", meaning: "八仙齐聚，福寿双全", poetic: "八仙过海各献宝，福寿双全庆寿高。", file: "assets/patterns/fill33.jpg", credit: "清代八仙庆寿金线刺绣 · 大都会艺术博物馆 · CC0" },
];
