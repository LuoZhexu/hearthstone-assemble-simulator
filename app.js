(function () {
  "use strict";
  const data = window.ASSEMBLE_DATA;
  const engine = window.AssembleEngine;
  const $ = selector => document.querySelector(selector);
  const el = {
    sourceList: $("#source-list"), mobileSource: $("#source-select-mobile"), sourceName: $("#current-source"), sourceEffect: $("#source-effect"),
    classSelect: $("#class-select"), classLabel: $("#class-label"), fixedClass: $("#fixed-class"), reroll: $("#reroll"),
    left: $("#left-card"), primary: $("#primary-card"), right: $("#right-card"), stage: $(".assembly-stage"),
    centerLabel: $(".label-center"), resultHeading: $("#result-heading"),
    poolStats: $("#pool-stats"), notice: $("#notice"), result: $("#result-section"),
    resultContent: $("#result-content"),
  };
  const state = { source: data.sources[0], playerClass: "法师", draw: null, result: null, rollId: 0 };
  const imageLoads = new Map();
  const imageStatus = new Map();

  function safe(value) {
    return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;").replaceAll("'", "&#39;");
  }
  function displayClass(value) { return value === "潜行者" ? "盗贼" : value === "萨满祭司" ? "萨满" : value; }
  function isPassiveSource() { return state.source.resultType === "passive-hero-power"; }
  function showNotice(message, loading = false) { el.notice.textContent = message; el.notice.hidden = !message; el.notice.classList.toggle("loading", loading); }
  const keywordJoin = /(^|[，,。；;：:、\s])(巨型\+\d+|法术伤害\+\d+|超级风怒|可交易|战吼|亡语|嘲讽|圣盾|突袭|冲锋|潜行|风怒|复生|剧毒|吸血|磁力|回响|扰魔|连击|抉择|延系)(?=[^\s，,。；;：:、！？!?])(?!(?:的|随从|牌|效果))/g;
  function displayText(value) {
    let text = String(value ?? "");
    while (true) {
      const spaced = text.replace(keywordJoin, (_match, before, keyword) => `${before}${keyword} `);
      if (spaced === text) return text;
      text = spaced;
    }
  }
  function joinedText(top, bottom) { return displayText(`${top}${bottom}`); }
  function cardRenderUrl(card) {
    return card.image || "";
  }
  function preloadCard(card) {
    const url = cardRenderUrl(card);
    if (!url) return Promise.resolve(false);
    if (!imageLoads.has(url)) {
      imageLoads.set(url, new Promise(resolve => {
        const image = new Image();
        image.onload = async () => {
          try { if (image.decode) await image.decode(); } catch { /* A loaded image can still be displayed. */ }
          resolve(true);
        };
        image.onerror = () => resolve(false);
        image.src = url;
      }).then(loaded => { imageStatus.set(url, loaded); return loaded; }));
    }
    if (imageStatus.has(url)) return Promise.resolve(imageStatus.get(url));
    return new Promise(resolve => {
      const timeout = setTimeout(() => resolve(false), 5000);
      imageLoads.get(url).then(loaded => { clearTimeout(timeout); resolve(loaded); });
    });
  }
  function afterEffect(card) {
    const effect = { cost: card.cost, attack: card.attack, health: card.health, note: "" };
    switch (state.source.dbf) {
      case 131061: effect.note = "暗影塑形：费用减少（2）点"; break;
      case 130973: effect.note = "凿刻：获得+2/+3"; break;
      case 130565: effect.note = "血肉塑造：手牌中的随从牌获得+2/+2"; break;
      case 129801: effect.note = "融冰而出：每到你的回合结束时，再减（1）费"; break;
      case 129804: effect.note = "至暗深处：同时召唤两名0/3嘲讽守卫"; break;
      case 129821: effect.note = "修补：同时获取一张“超负荷运转”"; break;
    }
    return effect;
  }

  function renderSources() {
    el.sourceList.innerHTML = data.sources.map(source => `<button class="source-item ${source.dbf === state.source.dbf ? "active" : ""}" type="button" data-source="${source.dbf}">
      <img src="${source.image}" alt=""><span><span class="source-name">${safe(source.name)}</span><br><span class="source-class">${safe(displayClass(source.cardClass))} · ${source.cost}费</span></span>
    </button>`).join("");
    el.mobileSource.innerHTML = data.sources.map(source => `<option value="${source.dbf}">${safe(source.name)} · ${safe(displayClass(source.cardClass))}</option>`).join("");
    el.mobileSource.value = String(state.source.dbf);
  }

  function cardHtml(card, kind, options = [], selected = null) {
    const isPrimary = kind !== "donor";
    const hasCombatStats = card.type === "随从" || card.type === "武器";
    const cardType = card.type === "武器" ? "weapon" : card.type === "法术" ? "spell" : card.type === "英雄" ? "hero" : "minion";
    const art = card.art ? `<img class="card-art" src="${safe(card.art)}" alt="${safe(card.name)}插画" onerror="this.classList.add('missing')">` : `<img class="card-art missing" alt="">`;
    const renderUrl = cardRenderUrl(card);
    const hasFullRender = imageStatus.get(renderUrl) === true;
    const fullRender = hasFullRender ? `<img class="full-card-image" src="${safe(renderUrl)}" alt="" aria-hidden="true" onerror="this.parentElement.classList.remove('has-full-render');this.remove()">` : "";
    const part = (half, content) => {
      const text = safe(displayText(content));
      if (isPrimary) {
        if (selected?.donor && selected.half === half) {
          const fromType = selected.donor.type === "法术" ? "spell" : selected.donor.type === "武器" ? "weapon" : selected.donor.type === "英雄" ? "hero" : "minion";
          return `<button class="fragment fragment-restore replaced from-${fromType}" type="button" data-restore="${half}" aria-label="撤回替换的${half === "top" ? "前半" : "后半"}段"><span>${text}<span class="restore-hint">点击撤回此段 ↩</span></span></button>`;
        }
        return `<div class="fragment">${text}</div>`;
      }
      const available = options.includes(half);
      const isSelected = selected?.donor?.dbf === card.dbf && selected.half === half;
      return `<button class="fragment fragment-button ${isSelected ? "selected" : ""}" type="button" data-donor="${card.dbf}" data-half="${half}" aria-label="选择${safe(card.name)}的${half === "top" ? "前半" : "后半"}段：${text}" aria-pressed="${isSelected}" ${available ? "" : "disabled"}>
        <span>${text}${available ? `<span class="pick-hint">${isSelected ? "已拼装到主体 ✓" : "点击替换此段 ↗"}</span>` : ""}</span></button>`;
    };
    return `<article class="card ${isPrimary ? "primary" : ""} ${kind === "assembled" ? "assembled" : ""} ${hasFullRender ? "has-full-render" : ""} type-${cardType}" aria-label="${safe(card.name)}">
      ${fullRender}
      <div class="card-head">${art}<span class="mana">${card.cost}</span></div>
      <div class="card-name">${safe(card.name)}</div>
      <div class="card-text">${safe(joinedText(card.top, card.bottom))}</div>
      <div class="card-meta"><span>${safe(card.race || card.type)}</span><span>·</span><span>${safe(card.rarity)}</span></div>
      <div class="card-stats">${hasCombatStats ? `<span class="stat">${card.attack ?? "–"}</span><span class="rarity-dot ${safe(card.rarity)}" title="${safe(card.rarity)}"></span><span class="stat health" title="${card.type === "武器" ? "耐久度" : "生命值"}">${card.health ?? "–"}</span>` : `<span class="component-kind">${safe(card.type)}</span>`}</div>
      <div class="card-fragments" aria-label="${isPrimary ? "主体的前后两段文字" : "选择组件的前半或后半段文字"}">${part("top", card.top)}${part("bottom", card.bottom)}</div>
    </article>`;
  }

  function renderStage() {
    const drawn = state.draw;
    if (!drawn) { el.left.innerHTML = el.primary.innerHTML = el.right.innerHTML = ""; return; }
    el.left.innerHTML = cardHtml(drawn.options[0].donor, "donor", drawn.options[0].halves, state.result);
    const display = state.result ? { ...drawn.primary, ...afterEffect(drawn.primary), top: state.result.top, bottom: state.result.bottom } : drawn.primary;
    el.primary.innerHTML = cardHtml(display, state.result ? "assembled" : "primary", [], state.result);
    el.right.innerHTML = cardHtml(drawn.options[1].donor, "donor", drawn.options[1].halves, state.result);
    el.poolStats.innerHTML = `<span>主体候选 ${drawn.primaryCount} 张</span><span>当前可配组件 ${drawn.donorCount} 张</span>${isPassiveSource() ? "<span>结果：被动英雄技能</span>" : ""}`;
  }

  function renderResult() {
    if (!state.result) { el.result.hidden = true; return; }
    const { primary, donor, half, top, bottom } = state.result;
    const from = donor ? `替换${half === "top" ? "上" : "下"}半段 · 来自${donor.name}` : "还原";
    if (isPassiveSource()) {
      const text = displayText(engine.passiveText(top, bottom));
      el.resultHeading.textContent = "你的被动英雄技能";
      el.resultContent.innerHTML = `<div class="passive-result">
        <div class="passive-preview" aria-hidden="true"><img src="${safe(state.source.resultImage)}" alt=""><span>${safe(text)}</span></div>
        <div class="passive-details"><strong>${safe(state.source.resultName)} · 被动英雄技能</strong><p>${safe(text)}</p><small>主体：${safe(primary.name)}<br>${safe(from)}</small></div>
      </div>`;
      el.result.hidden = false;
      return;
    }
    el.resultHeading.textContent = "你的新随从";
    const final = afterEffect(primary);
    el.resultContent.innerHTML = `<strong>${safe(primary.name)}　${final.cost}费 ${final.attack}/${final.health}</strong>
      <p>${safe(joinedText(top, bottom))}</p><small>${safe(from)}${final.note ? `<br>额外效果：${safe(final.note)}` : ""}</small>`;
    el.result.hidden = false;
  }

  async function reroll() {
    const rollId = ++state.rollId;
    try {
      const drawn = engine.draw(data.cards, state.source, state.playerClass);
      el.reroll.disabled = true;
      el.reroll.textContent = "正在加载卡图…";
      el.stage.classList.add("loading");
      showNotice("正在准备新组合，卡图加载完成后会一起显示。", true);
      const images = [drawn.primary, ...drawn.options.map(option => option.donor)];
      if (isPassiveSource()) images.push({ image: state.source.resultImage });
      await Promise.all(images.map(preloadCard));
      if (rollId !== state.rollId) return;
      state.draw = drawn;
      state.result = null;
      showNotice("");
      renderStage(); renderResult();
    } catch (error) {
      if (rollId !== state.rollId) return;
      state.draw = null; renderStage(); showNotice(error.message);
    } finally {
      if (rollId === state.rollId) {
        el.reroll.disabled = false;
        el.reroll.textContent = "⟳ 重新拼装";
        el.stage.classList.remove("loading");
      }
    }
  }

  function selectSource(dbf) {
    const source = data.sources.find(card => card.dbf === dbf);
    if (!source) return;
    state.source = source;
    if (source.cardClass !== "中立") state.playerClass = source.cardClass === "盗贼" ? "潜行者" : source.cardClass === "萨满" ? "萨满祭司" : source.cardClass;
    el.classSelect.value = state.playerClass;
    const neutral = source.cardClass === "中立";
    el.classSelect.hidden = !neutral;
    el.classSelect.disabled = !neutral;
    el.fixedClass.hidden = neutral;
    el.fixedClass.textContent = displayClass(state.playerClass);
    el.classLabel.textContent = neutral ? "玩家职业" : "所属职业";
    el.sourceName.textContent = source.name;
    el.sourceEffect.textContent = displayText(source.text);
    el.centerLabel.textContent = isPassiveSource() ? "主体 · 将转化为被动英雄技能" : "主体 · 原型";
    renderSources(); reroll();
  }

  function choose(donorDbf, half) {
    if (!state.draw) return;
    const option = state.draw.options.find(item => item.donor.dbf === donorDbf);
    if (!option || !option.halves.includes(half)) return;
    const parts = engine.outcome(state.draw.primary, option.donor, half);
    state.result = { primary: state.draw.primary, donor: option.donor, half, ...parts };
    renderStage();
    renderResult();
  }

  function restore() {
    if (!state.draw || !state.result) return;
    state.result = null;
    renderStage();
    renderResult();
  }

  el.classSelect.innerHTML = engine.CLASSES.map(name => `<option value="${name}">${displayClass(name)}</option>`).join("");
  el.sourceList.addEventListener("click", event => {
    const button = event.target.closest("[data-source]");
    if (button) selectSource(Number(button.dataset.source));
  });
  el.mobileSource.addEventListener("change", () => selectSource(Number(el.mobileSource.value)));
  $(".assembly-stage").addEventListener("click", event => {
    const restoreButton = event.target.closest("[data-restore]");
    if (restoreButton) { restore(); return; }
    const button = event.target.closest("[data-donor]");
    if (button) choose(Number(button.dataset.donor), button.dataset.half);
  });
  el.classSelect.addEventListener("change", () => { state.playerClass = el.classSelect.value; reroll(); });
  el.reroll.addEventListener("click", reroll);
  $("#again").addEventListener("click", reroll);
  $("#keep-original").addEventListener("click", restore);
  $("#copy-result").addEventListener("click", async () => {
    if (!state.result) return;
    const r = state.result;
    const final = afterEffect(r.primary);
    const text = isPassiveSource()
      ? `${state.source.resultName}｜被动英雄技能｜${displayText(engine.passiveText(r.top, r.bottom))}｜主体：${r.primary.name}｜组件：${r.donor.name}`
      : `${r.primary.name}｜${final.cost}费 ${final.attack}/${final.health}｜${joinedText(r.top, r.bottom)}｜${r.donor ? `组件：${r.donor.name}` : "还原"}${final.note ? `｜额外效果：${final.note}` : ""}`;
    try { await navigator.clipboard.writeText(text); $("#copy-result").textContent = "已复制"; setTimeout(() => $("#copy-result").textContent = "复制结果", 1500); }
    catch { showNotice("复制失败；请从结果区域手动选择文字。"); }
  });

  selectSource(data.sources[0].dbf);
})();
