(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.AssembleEngine = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const CLASSES = ["死亡骑士", "恶魔猎手", "德鲁伊", "猎人", "法师", "圣骑士", "牧师", "潜行者", "萨满祭司", "术士", "战士"];
  const blockedDeathrattleDonors = new Set(["侏儒嚼嚼怪", "石头穴居人"]);
  const mutualTags = [4548, 4577, 4930, 4931, 4932, 4975];

  function belongsTo(card, playerClass) {
    const value = card.cardClass || "";
    return value === "中立" || value.includes(playerClass);
  }

  function firstMatches(card, source, playerClass) {
    if (source.filter === "exclusive") return source.poolNames.includes(card.name);
    if (source.filter === "other-class") {
      return card.cardClass !== "中立" && !card.cardClass.includes(playerClass);
    }
    if (!belongsTo(card, playerClass)) return false;
    switch (source.filter) {
      case "fixed": return card.cost === source.filterValue;
      case "max": return card.cost <= source.filterValue;
      case "class": return card.cardClass.includes(source.filterValue);
      case "race": return card.race.includes(source.filterValue);
      case "deathrattle": return /亡语/.test(card.top + card.bottom);
      case "taunt": return /嘲讽/.test(card.top + card.bottom);
      case "end-turn": return /在你的回合结束时|回合结束时/.test(card.top + card.bottom);
      default: return true;
    }
  }

  function donorCostMatches(donor, primary, source) {
    if (source.filter === "exclusive") return true;
    if (source.filter === "max") return donor.cost >= 5;
    if (primary.cost >= 9) return donor.cost >= 8 && donor.cost <= 10;
    return donor.cost >= primary.cost && donor.cost <= primary.cost + 2;
  }

  function hasDeathrattleTrigger(text) {
    return /亡语[：:]/.test(text);
  }

  function endsWithDeathrattleTrigger(text) {
    const deathrattle = Math.max(text.lastIndexOf("亡语："), text.lastIndexOf("亡语:"));
    const laterTrigger = Math.max(text.lastIndexOf("战吼："), text.lastIndexOf("战吼:"),
      text.lastIndexOf("延系："), text.lastIndexOf("延系:"), text.lastIndexOf("连击："), text.lastIndexOf("连击:"));
    return deathrattle >= 0 && deathrattle > laterTrigger;
  }

  function invalidDeathrattleEffect(bottom) {
    const effect = bottom.trim();
    return /^(?:本随从)?获得\s*\+\d|^获得[^。]*属性值|^获得(?:嘲讽|圣盾|潜行|复生)|^使本随从获得|本随从的(?:攻击力|生命值)|随机攻击|攻击随机(?:一个)?敌人|召唤.*本随从的复制|复制本随从|本随从获得(?:嘲讽|圣盾|潜行|复生)|为本随从恢复/.test(effect);
  }

  function isMinion(card) { return card.type === "随从"; }

  function hasTag(card, tag) { return Number(card.tags?.[tag] || 0) !== 0; }

  function hasDeathrattle(card) { return hasTag(card, 217) || hasDeathrattleTrigger(card.top); }

  function hasEndTurnEffect(card) { return /回合结束时/.test(card.top || ""); }

  function tagConflict(a, b) {
    if (mutualTags.some(tag => hasTag(a, tag) && hasTag(b, tag))) return true;
    if ((hasDeathrattle(a) && hasTag(b, 4548)) || (hasTag(a, 4548) && hasDeathrattle(b))) return true;
    if ((hasEndTurnEffect(a) && hasTag(b, 4578)) || (hasTag(a, 4578) && hasEndTurnEffect(b))) return true;
    return false;
  }

  function canBePrimary(card) { return isMinion(card) && !hasTag(card, 4546); }

  function canBeDonor(card) {
    if (!Object.hasOwn(card, "tags")) return true;
    return hasTag(card, 4533) && !hasTag(card, 4547);
  }

  function semanticKey(text) {
    return String(text).replace(/[\s，。；：:、·“”"'（）()]/g, "").replace(/[0-9]/g, "#");
  }

  function outcome(primary, donor, half) {
    return {
      top: half === "top" ? donor.top : primary.top,
      bottom: half === "bottom" ? donor.bottom : primary.bottom,
    };
  }

  function passiveText(top, bottom) {
    const trigger = String(top).replace(/^(?:(?:扰魔|圣盾)\s*[。.]\s*)+/g, "");
    return (trigger + String(bottom))
      .replaceAll("本随从", "此英雄技能")
      .replaceAll("你的其他随从", "你的随从")
      .replaceAll("其他友方随从", "友方随从");
  }

  function meaningful(primary, donor, half) {
    if (!canBePrimary(primary) || !canBeDonor(donor)) return false;
    if (primary.name === donor.name || primary.dbf === donor.dbf) return false;
    if (tagConflict(primary, donor)) return false;
    if (hasDeathrattleTrigger(primary.top) && blockedDeathrattleDonors.has(donor.name)) return false;
    const changed = half === "top" ? donor.top : donor.bottom;
    const original = half === "top" ? primary.top : primary.bottom;
    if (semanticKey(changed) === semanticKey(original)) return false;
    const made = outcome(primary, donor, half);
    // A replacement fragment beginning with a conditional conclusion needs its premise.
    if (/^(则|便|否则)/.test(made.bottom.trim()) && !/(如果|若|当|每有|每当)/.test(made.top)) return false;
    const top = semanticKey(made.top), bottom = semanticKey(made.bottom);
    if (top && top === bottom) return false;
    if (/每当你获得护甲值/.test(made.top) && /^获得护甲值/.test(made.bottom)) return false;
    if (endsWithDeathrattleTrigger(made.top) && invalidDeathrattleEffect(made.bottom)) return false;
    if (/战吼/.test(made.bottom) && /战吼/.test(made.top)) return false;
    return true;
  }

  function getPrimaryPool(cards, source, playerClass) {
    return cards.filter(card => canBePrimary(card) && firstMatches(card, source, playerClass));
  }

  function getDonorPool(cards, source, primary, playerClass) {
    return cards.filter(card => (source.filter === "exclusive" ? source.poolNames.includes(card.name) : belongsTo(card, playerClass))
      && donorCostMatches(card, primary, source)
      && meaningful(primary, card, "top") && meaningful(primary, card, "bottom"));
  }

  function randomItem(list, rng) { return list[Math.floor(rng() * list.length)]; }

  function optionsDiffer(a, b) {
    const aOut = outcome(a.primary, a.donor, a.half);
    const bOut = outcome(b.primary, b.donor, b.half);
    return semanticKey(aOut.top + aOut.bottom) !== semanticKey(bOut.top + bOut.bottom);
  }

  function compatibleDonors(primary, a, b) {
    if (tagConflict(a, b)) return false;
    for (const half of ["top", "bottom"]) {
      for (const otherHalf of ["top", "bottom"]) {
        if (!optionsDiffer({ primary, donor: a, half }, { primary, donor: b, half: otherHalf })) return false;
      }
    }
    return true;
  }

  function hasCompatiblePair(primary, pool) {
    for (let i = 0; i < pool.length; i += 1) {
      for (let j = i + 1; j < pool.length; j += 1) {
        if (compatibleDonors(primary, pool[i], pool[j])) return true;
      }
    }
    return false;
  }

  function draw(cards, source, playerClass, rng = Math.random) {
    const eligible = getPrimaryPool(cards, source, playerClass);
    const possible = eligible.map(primary => ({ primary, pool: getDonorPool(cards, source, primary, playerClass) }))
      .filter(entry => entry.pool.length >= 2 && hasCompatiblePair(entry.primary, entry.pool));
    if (!possible.length) throw new Error("当前职业与卡牌条件下没有可用的拼装组合。");
    const { primary, pool } = randomItem(possible, rng);
    const shuffled = [...pool];
    for (let i = shuffled.length - 1; i > 0; i -= 1) {
      const j = Math.floor(rng() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    let selected = null;
    for (let i = 0; i < shuffled.length && !selected; i += 1) {
      for (let j = i + 1; j < shuffled.length; j += 1) {
        if (compatibleDonors(primary, shuffled[i], shuffled[j])) {
          selected = [shuffled[i], shuffled[j]].map(donor => ({ primary, donor, halves: ["top", "bottom"] }));
          break;
        }
      }
    }
    if (!selected) throw new Error("可用的非重复效果不足两项。");
    return { primary, options: selected, primaryCount: possible.length, donorCount: pool.length };
  }

  return { CLASSES, firstMatches, donorCostMatches, getPrimaryPool, getDonorPool, meaningful, outcome, passiveText, tagConflict, draw };
});
