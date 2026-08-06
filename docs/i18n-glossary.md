# 汉化术语表（Chinese localisation glossary）

所有面向玩家的字符串统一使用简体中文。**代码标识符、id、sprite key、注释保持英文不变**。

## 硬性规则

> 本文与任何派工说明冲突时，以本文为准。

1. 只改字符串**字面量**：`name`、`desc`、`description`、升级的 `name`/`desc`、日志文本。
2. **绝不修改** `id`、`sprite`、`icon`、`slot`、`tags`、`flag`、buff id、召唤 id、数值、逻辑。
3. `desc` 是函数，必须保留插值：`` s => `造成 ${s.st('damage')} 点火焰伤害。` ``
4. 句末用中文句号「。」。**数字、拉丁字符与中文之间加一个半角空格**（例：`造成 ${s.st('damage')} 点火焰伤害。`、`半径 ${s.radius} 格`）。术语一律照下表，不得自创。
5. 文案风格：简洁、硬核、带原作那种冷幽默。怪物 `description` 一句话，交代威胁与打法。
6. 不要出现「你」的滥用；描述法术效果时用第三人称陈述（例：「使目标冰冻 3 回合。」）。

## 核心名词

| 英文 | 中文 |
| --- | --- |
| Rift Wizard | 裂隙巫师 |
| realm | 领域 |
| rift / portal | 裂隙 / 传送门 |
| spell | 法术 |
| spellbook | 法术书 |
| charge(s) | 充能 |
| skill point / SP | 技能点 / SP |
| upgrade | 升级 |
| artifact | 神器 |
| component | 材料 |
| slot | 槽位 |
| craft / fuse | 锻造 / 熔铸 |
| summon (动词/名词) | 召唤 / 召唤物 |
| minion | 随从 |
| boss | 首领 |
| cloud | 云雾 |
| chasm | 深渊 |
| line of sight | 视线 |
| turn | 回合 |
| radius | 半径 |
| range | 射程 |
| duration | 持续 |
| resistance | 抗性 |
| immune | 免疫 |
| shield | 护盾 |
| stationary | 固定不动 |
| flying | 飞行 |

## 伤害类型

physical 物理 · fire 火焰 · lightning 闪电 · ice 冰霜 · dark 黑暗 · holy 神圣 · arcane 奥术 · poison 毒素

## 法术标签

sorcery 咒法 · enchantment 附魔 · conjuration 召唤 · fire 火焰 · lightning 闪电 · ice 冰霜 · nature 自然 · arcane 奥术 · dark 黑暗 · holy 神圣 · word 言灵 · orb 法球 · dragon 巨龙 · translocation 位移 · metallic 金属 · eye 眼魔 · chaos 混乱 · blood 血魔

## 生物标签

living 生者 · undead 亡灵 · demon 恶魔 · construct 构造体 · nature 自然 · holy 神圣 · dragon 巨龙 · elemental 元素 · chaos 混乱 · arcane 奥术 · metallic 金属 · slime 软泥 · spider 蛛形 · eye 眼魔 · boss 首领

## 状态效果（buff id → 中文名）

| id | 中文名 |
| --- | --- |
| stunned | 眩晕 |
| frozen | 冰冻 |
| petrified | 石化 |
| glassified | 琉璃化 |
| poisoned | 中毒 |
| burning | 燃烧 |
| bleeding | 流血 |
| berserk | 狂暴 |
| blind | 失明 |
| rooted | 缠绕 |
| regen | 再生 |
| shielded | 护盾 |
| hasted | 急速 |
| swift | 迅捷 |
| ironskin | 铁肤 |
| holy_armor | 圣光护甲 |
| frost_ward | 霜护 |
| arcane_ward | 奥术护盾 |
| conductance | 导电 |
| melted | 熔蚀 |
| cursed | 诅咒 |
| soul_marked | 灵魂印记 |
| doomed | 厄运 |
| flame_aura | 烈焰灵光 |
| storm_aura | 雷暴灵光 |
| frost_aura | 寒霜灵光 |
| toxic_aura | 剧毒灵光 |
| enchanted | 强化 |
| vigor | 活力 |
| channeling | 引导中 |

## 材料（8 种）

| 字母 | 英文 | 中文 |
| --- | --- | --- |
| U | Umbral Dust | 幽影尘 |
| T | Thornseed | 荆棘种 |
| C | Cinder | 余烬 |
| H | Halo Shard | 圣光碎片 |
| B | Bloodglass | 血玻璃 |
| I | Rime Crystal | 霜晶 |
| S | Sparkstone | 火花石 |
| O | Onyx Cog | 玛瑙齿轮 |

## 装备槽位

head 头部 · robe 长袍 · amulet 项链 · ring 戒指 · gloves 手套 · boots 靴子 · staff 法杖 · relic 圣物

## 生态（biome）

Ruined Halls 残垣厅堂 · Bone Crypt 白骨陵墓 · Cinder Pits 余烬深坑 · Rime Wastes 霜寒荒野 · Fae Thicket 妖精密林 · Void Fracture 虚空裂痕 · Sunlit Reach 曦光之境 · Iron Foundry 钢铁熔炉 · Carnal Warren 血肉洞窟 · Chitin Hollow 甲壳巢穴

## 云雾

Flame Cloud 火焰云 · Poison Cloud 毒云 · Blizzard 暴风雪 · Thundercloud 雷云 · Void Rift 虚空裂缝 · Gloom 幽暗 · Consecration 圣化 · Choking Ash 窒息灰烬

## 法术译名（部分基准，其余按同风格处理）

Fireball 火球 · Fan of Flames 烈焰扇 · Immolate 献火 · Pyrostatic Pulse 焰电脉冲 · Chaos Barrage 混乱弹幕 · Blazerip 烈焰裂空 · Flame Burst 烈焰爆发 · Volcanic Eruption 火山喷发 · Searing Orb 灼热法球 · Rain of Fire 火雨 · Flame Gate 烈焰之门 · Icicle 冰锥 · Lightning Bolt 闪电束 · Freeze 冰封 · Thunder Strike 雷击 · Iceball 冰球 · Chain Lightning 连锁闪电 · Ice Vortex 冰霜涡流 · Lightning Storm 雷暴 · Blizzard 暴风雪 · Storm Burst 风暴爆冲 · Ball Lightning 球状闪电 · Conductance 导电术 · Death Bolt 死亡箭 · Lifedrain 吸取生命 · Heavenly Blast 天罚 · Healing Light 治愈之光 · Touch of Death 死亡之触 · Death Chill 死寂寒意 · Holy Fire 圣焰 · Blinding Light 炫目圣光 · Void Beam 虚空射线 · Wheel of Death 死亡之轮 · Scourge 苦刑 · Choir of Angels 天使圣咏 · Magic Missile 魔法飞弹 · Poison Sting 毒刺 · Annihilate 歼灭 · Toxic Spores 剧毒孢子 · Melt 熔解 · Moon Glaive 月刃 · Petrify 石化术 · Earthquake 地震 · Prison of Thorns 荆棘牢笼 · Disperse 驱散位移 · Mega Annihilate 超级歼灭 · Psychic Seedling 灵能苗 · Wolf 召唤狼 · Earthen Sentinel 大地哨卫 · Giant Bear 巨熊 · Fire Drake 火龙 · Ice Drake 冰龙 · Storm Drake 雷龙 · Imp Swarm 小鬼群 · The Restless Dead 不安亡者 · Spider Queen 蛛后 · Frostfire Hydra 霜火九头蛇 · Siege Golems 攻城魔像 · Blink 闪现 · Teleport 传送 · Aether Swap 以太换位 · Eye of Fire 火焰之眼 · Eye of Lightning 闪电之眼 · Eye of Ice 冰霜之眼 · Eye of Rage 暴怒之眼 · Mystic Power 秘能加持 · Holy Armor 圣光护甲 · Ironize 铁化 · Pain Mirror 痛苦之镜 · Word of Ice 冰霜言灵 · Word of Chaos 混乱言灵
