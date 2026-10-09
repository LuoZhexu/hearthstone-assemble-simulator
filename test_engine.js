const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const engine = require("./engine.js");
const sandbox = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(__dirname, "data.js"), "utf8"), sandbox);
const { cards, sources } = sandbox.window.ASSEMBLE_DATA;

assert.equal(sources.length, 13);
assert.ok(cards.length > 250);
assert.equal(new Set(cards.map(card => card.name)).size, cards.length);
assert.ok(cards.every(card => !/拼装/.test(card.top + card.bottom)));
assert.ok(cards.some(card => card.type === "法术"));
assert.ok(cards.some(card => card.type === "武器"));
assert.ok(cards.every(card => card.image === `assets/cards/${card.dbf}.webp`), "all candidate renders should be local");
assert.ok(cards.every(card => card.art === "" && fs.existsSync(path.join(__dirname, card.image))), "all candidate images should exist locally");
assert.ok(sources.every(source => fs.existsSync(path.join(__dirname, source.image))), "source images should exist locally");
const rasha = sources.find(source => source.name === "拉夏");
assert.equal(rasha.resultType, "passive-hero-power");
assert.equal(rasha.resultName, "阳炎耀光");
assert.ok(fs.existsSync(path.join(__dirname, rasha.resultImage)));
assert.deepEqual(Array.from(rasha.poolNames), [
  "讲故事的始祖龟", "原始熊猫人", "死亡寒冰", "石雕工匠", "烬根毁灭者", "昆虫利爪", "魔古将领",
  "战地医师老兵", "艾瑞达欺诈者", "逐月幼龙", "沙漏侍者", "OC91战车", "彩翼灵龙", "大法师安东尼达斯",
]);
const rashaPool = new Set(rasha.poolNames);
assert.equal(engine.getPrimaryPool(cards, rasha, "圣骑士").length, 13, "the weapon is component-only");
assert.equal(new Set(Array.from({ length: 13 }, (_, index) =>
  engine.draw(cards, rasha, "圣骑士", () => (index + 0.5) / 13).primary.name)).size, 13,
"all thirteen minion bodies should be reachable");
const antonidas = cards.find(card => card.name === "大法师安东尼达斯");
const rashaDonors = engine.getDonorPool(cards, rasha, antonidas, "圣骑士");
assert.ok(rashaDonors.length >= 2, "Antonidas can become the passive hero power despite the narrow 14-card pool");
assert.ok(rashaDonors.some(card => card.name === "昆虫利爪"), "Rasha may offer the weapon as a component");
assert.equal(engine.passiveText("扰魔。在你的回合结束时，", "使你的其他随从获得+1/+1。"),
  "在你的回合结束时，使你的随从获得+1/+1。");
assert.equal(engine.passiveText("在一张卡牌进入你的手牌后（通过本随从进入的除外），", "抽一张牌。"),
  "在一张卡牌进入你的手牌后（通过此英雄技能进入的除外），抽一张牌。");
const availableDonors = cards.filter(card => card.tags?.["4533"] === 1 && !card.tags?.["4547"]);
assert.equal(availableDonors.length, 244, "preview DBF component tags should be applied");
assert.ok(!availableDonors.some(card => ["原始石牙兽", "泽奥图", "卑劣的脏鼠"].includes(card.name)));
assert.equal(cards.find(card => card.name === "鲜血医师萨安娜").tags["4546"], 1);
assert.equal(cards.find(card => card.name === "锈烂蝰蛇").top, "可交易 战吼：");
assert.equal(cards.find(card => card.name === "毁灭化身").top, "嘲讽 亡语：");
assert.equal(cards.find(card => card.name === "擎天雷龙").bottom.includes("嘲讽随从"), true);
const cabinet = cards.find(card => card.name === "呓语魔橱");
const historian = cards.find(card => card.name === "史书守护者");
assert.equal(engine.meaningful(cabinet, historian, "bottom"), false, "orphaned 则 must be rejected");
const coinDealer = cards.find(card => card.name === "玉莲帮荷官");
const barkGuard = cards.find(card => card.name === "树皮盾哨兵");
assert.equal(coinDealer.tags["217"], 1);
assert.equal(barkGuard.tags["4548"], 1);
for (const half of ["top", "bottom"]) {
  assert.equal(engine.meaningful(coinDealer, barkGuard, half), false, "Deathrattle primary excludes whole 4548 donor");
  assert.equal(engine.meaningful(barkGuard, coinDealer, half), false, "4548 primary excludes whole Deathrattle donor");
}
assert.ok(!engine.getDonorPool(cards, { filter: "any" }, coinDealer, "潜行者").includes(barkGuard));
assert.ok(!engine.getDonorPool(cards, { filter: "any" }, barkGuard, "潜行者").includes(coinDealer));
for (const tag of [4548, 4577, 4930, 4931, 4932, 4975]) {
  assert.equal(engine.tagConflict({ top: "", tags: { [tag]: 1 } }, { top: "", tags: { [tag]: 1 } }), true,
    `two cards in the same mutual-exclusion group ${tag} cannot be paired`);
}
assert.equal(engine.tagConflict({ top: "在你的回合结束时，", tags: { "4577": 1 } }, { top: "", tags: { "4578": 1 } }), true);
assert.equal(engine.tagConflict({ top: "", tags: { "4578": 1 } }, { top: "在你的回合结束时，", tags: { "4577": 1 } }), true);
assert.equal(engine.tagConflict({ top: "战吼：", tags: { "218": 1 } }, { top: "", tags: { "4578": 1 } }), false);
assert.equal(engine.tagConflict({ top: "", tags: { "4578": 1 } }, { top: "", tags: { "4578": 1 } }), false);
const curiousCloud = cards.find(card => card.name === "好奇的积云");
const battlecryBlocked = cards.find(card => card.name === "虚无行者");
assert.equal(engine.tagConflict(curiousCloud, battlecryBlocked), true, "4578 excludes a native end-turn effect");
assert.equal(engine.tagConflict(battlecryBlocked, curiousCloud), true, "4578 exclusion is symmetric");
const deathrattle = { dbf: -1, name: "亡语测试", type: "随从", top: "亡语：", bottom: "抽一张牌。" };
for (const [index, bottom] of ["获得+2/+2。", "获得它们的属性值。", "随机攻击一个敌人。", "召唤一个本随从的复制。"].entries()) {
  const donor = { dbf: -index - 2, name: `无效组件${index}`, type: "随从", top: "战吼：", bottom };
  assert.equal(engine.meaningful(deathrattle, donor, "bottom"), false, `invalid Deathrattle: ${bottom}`);
}
const deathrattleDonor = { dbf: -12, name: "亡语组件", type: "随从", top: "亡语：", bottom: "召唤一只1/1的鱼人。" };
const attackingPrimary = { dbf: -13, name: "攻击测试", type: "随从", top: "在你的回合结束时，", bottom: "随机攻击一个敌人。" };
assert.equal(engine.meaningful(attackingPrimary, deathrattleDonor, "top"), false, "a grafted Deathrattle cannot attack after death");
const delayed = { dbf: -10, name: "延系测试", type: "随从", top: "亡语：抽一张法术牌。延系：", bottom: "抽一张牌。" };
const copyDonor = { dbf: -11, name: "复制测试", type: "随从", top: "战吼：", bottom: "在本回合结束时，召唤一个本随从的复制。" };
assert.equal(engine.meaningful(delayed, copyDonor, "bottom"), true, "a later non-Deathrattle trigger may copy");

let checked = 0;
const eligibleComponentTypes = new Set();
for (const source of sources) {
  const playerClasses = source.cardClass === "中立" ? engine.CLASSES : [source.cardClass === "盗贼" ? "潜行者" : source.cardClass === "萨满" ? "萨满祭司" : source.cardClass];
  for (const playerClass of playerClasses) {
    const primaryPool = engine.getPrimaryPool(cards, source, playerClass);
    assert.ok(primaryPool.every(card => card.type === "随从"), `${source.name}: non-minion body`);
    assert.ok(primaryPool.every(card => !card.tags?.["4546"]), `${source.name}: forbidden body`);
    for (const primary of primaryPool) {
      for (const component of engine.getDonorPool(cards, source, primary, playerClass)) eligibleComponentTypes.add(component.type);
    }
    for (let i = 0; i < 100; i++) {
      const result = engine.draw(cards, source, playerClass);
      assert.ok(engine.firstMatches(result.primary, source, playerClass), `${source.name}: invalid primary`);
      assert.equal(result.primary.type, "随从");
      assert.equal(result.options.length, 2);
      assert.notEqual(result.options[0].donor.name, result.options[1].donor.name);
      assert.equal(engine.tagConflict(result.options[0].donor, result.options[1].donor), false,
        `${source.name}: two options conflict`);
      for (const option of result.options) {
        assert.equal(engine.tagConflict(result.primary, option.donor), false,
          `${source.name}: primary and option conflict`);
        assert.ok(source.filter === "exclusive" ? rashaPool.has(option.donor.name)
          : option.donor.cardClass === "中立" || option.donor.cardClass.includes(playerClass), `${source.name}: invalid class or exclusive pool`);
        assert.ok(["随从", "法术", "武器", "英雄"].includes(option.donor.type));
        assert.equal(option.donor.tags?.["4533"], 1, `${source.name}: component lacks client tag`);
        assert.ok(!option.donor.tags?.["4547"], `${source.name}: primary-only card used as component`);
        assert.ok(engine.donorCostMatches(option.donor, result.primary, source), `${source.name}: invalid cost`);
        assert.equal(option.halves.join(","), "top,bottom");
        assert.ok(option.halves.every(half => engine.meaningful(result.primary, option.donor, half)), `${source.name}: invalid effect`);
        if (/亡语[：:]/.test(result.primary.top)) assert.ok(!["侏儒嚼嚼怪", "石头穴居人"].includes(option.donor.name));
      }
      checked++;
    }
  }
}
assert.ok(eligibleComponentTypes.has("法术"), "spell components must remain eligible");
assert.ok(eligibleComponentTypes.has("武器"), "weapon components must remain eligible");
console.log(`Validated ${checked} sampled Assemble screens across all ${sources.length} cards and neutral class choices.`);
