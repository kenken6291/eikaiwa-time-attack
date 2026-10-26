/* ============================================================
   Speak in 3 — 多言語対応 ＆ 話し相手（写真アバター）
   ・7言語（英語/スペイン語/中国語/ポルトガル語/韓国語/フランス語/ドイツ語）
   ・話し相手：マイ話し相手（本人だけ・10人）＋みんなの話し相手（全員共通・10人、管理者が登録）
     ＋標準のイラスト。いつでも切り替え可能
   ・写真：普通/笑顔/困り顔/驚き × 顔/瞬き/しゃべり（最大12枚）をサーバー（Googleドライブ）に保存
   ============================================================ */

const LANGS = {
  en: { label: "英語", native: "English", flag: "🇺🇸", speech: "en-US", partner: "Emma",
        start: t => `Let's talk about ${t}. Are you ready?`,
        normalStart: t => `Let's have a relaxed conversation about ${t}. Tell me anything about it.`,
        again: "Sorry, could you say that again?",
        wrap: "Great talking with you! Let's wrap up here.",
        hello: "Hi! I'm your conversation partner. Nice to meet you!" },
  es: { label: "スペイン語", native: "Español", flag: "🇪🇸", speech: "es-ES", partner: "Lucía",
        start: t => `Hablemos de ${t}. ¿Estás listo?`,
        normalStart: t => `Charlemos tranquilamente sobre ${t}. Cuéntame lo que quieras.`,
        again: "Perdón, ¿puedes repetirlo?",
        wrap: "¡Me encantó hablar contigo! Terminamos aquí.",
        hello: "¡Hola! Soy tu compañera de conversación. ¡Mucho gusto!" },
  zh: { label: "中国語", native: "中文", flag: "🇨🇳", speech: "zh-CN", partner: "小雨",
        start: t => `我们来聊聊${t}吧。准备好了吗？`,
        normalStart: t => `我们轻松地聊聊${t}吧。随便说说就好。`,
        again: "不好意思，请再说一遍。",
        wrap: "和你聊天很开心！今天就到这里吧。",
        hello: "你好！我是你的会话伙伴。很高兴认识你！" },
  pt: { label: "ポルトガル語", native: "Português", flag: "🇧🇷", speech: "pt-BR", partner: "Ana",
        start: t => `Vamos falar sobre ${t}. Está pronto?`,
        normalStart: t => `Vamos conversar com calma sobre ${t}. Me conte qualquer coisa.`,
        again: "Desculpe, pode repetir?",
        wrap: "Adorei conversar com você! Vamos terminar por aqui.",
        hello: "Oi! Eu sou sua parceira de conversa. Muito prazer!" },
  ko: { label: "韓国語", native: "한국어", flag: "🇰🇷", speech: "ko-KR", partner: "지민",
        start: t => `${t}에 대해 이야기해 봐요. 준비됐어요?`,
        normalStart: t => `${t}에 대해 편하게 이야기해 봐요. 뭐든지 말해 주세요.`,
        again: "죄송해요, 다시 한번 말해 줄래요?",
        wrap: "이야기해서 즐거웠어요! 여기서 마칠게요.",
        hello: "안녕하세요! 저는 대화 상대예요. 만나서 반가워요!" },
  fr: { label: "フランス語", native: "Français", flag: "🇫🇷", speech: "fr-FR", partner: "Claire",
        start: t => `Parlons de ${t}. Tu es prêt ?`,
        normalStart: t => `Discutons tranquillement de ${t}. Dis-moi ce que tu veux.`,
        again: "Pardon, tu peux répéter ?",
        wrap: "C'était super de parler avec toi ! On s'arrête là.",
        hello: "Salut ! Je suis ta partenaire de conversation. Enchantée !" },
  de: { label: "ドイツ語", native: "Deutsch", flag: "🇩🇪", speech: "de-DE", partner: "Lena",
        start: t => `Lass uns über ${t} sprechen. Bist du bereit?`,
        normalStart: t => `Lass uns entspannt über ${t} plaudern. Erzähl mir, was du willst.`,
        again: "Entschuldigung, kannst du das wiederholen?",
        wrap: "Es hat Spaß gemacht, mit dir zu sprechen! Hören wir hier auf.",
        hello: "Hallo! Ich bin deine Gesprächspartnerin. Freut mich!" }
};
const LANG_ORDER = ["en", "es", "zh", "pt", "ko", "fr", "de"];
function getLang(code){ return LANGS[code] || LANGS.en; }

/** 過去の記録のテーマに付ける言語ラベル（英語は従来どおり付けない） */
function themeWithLang(theme, lang){
  if (!lang || lang === "en") return theme;
  return `[${getLang(lang).label}] ${theme}`;
}
function splitLangTheme(raw){
  const s = String(raw || "");
  const m = s.match(/^\[([^\]]+)\]\s*/);
  if (m){
    const code = LANG_ORDER.find(c => LANGS[c].label === m[1]);
    if (code) return { lang: code, theme: s.slice(m[0].length) };
  }
  return { lang: "en", theme: s };
}

const Partner = (() => {
  const EMOS = ["neutral", "joy", "sad", "surprised"];
  const EMO_LABELS = { neutral: "普通", joy: "笑顔", sad: "困り顔", surprised: "驚き" };
  const KINDS = ["base", "blink", "talk"];
  const KIND_LABELS = { base: "顔", blink: "瞬き", talk: "しゃべり" };
  const key = (emo, kind) => kind === "base" ? emo : `${emo}_${kind}`;
  const ALL_KEYS = EMOS.flatMap(e => KINDS.map(k => key(e, k)));
  const LIMIT = 10;
  const CUR_KEY = "speakin3_partner_current";
  const VOICE_KEY = "speakin3_partner_voices";
  const SCOPE_LABEL = { mine: "マイ話し相手", shared: "みんなの話し相手", default: "標準" };
  const PALETTE = {
    en: { bg: "#DBE7FB", hair: "#5A3B2A", skin: "#F3D2BB", shirt: "#3F6FD8" },
    es: { bg: "#FDE3D6", hair: "#2B1D16", skin: "#E8B993", shirt: "#E0543F" },
    zh: { bg: "#FBE0E0", hair: "#1D1A1A", skin: "#F5D7BF", shirt: "#D23A48" },
    pt: { bg: "#DFF4E6", hair: "#3B2416", skin: "#C98F66", shirt: "#2FA36B" },
    ko: { bg: "#EBE3FB", hair: "#241B1B", skin: "#F6DAC6", shirt: "#8A6BD8" },
    fr: { bg: "#E3E8F6", hair: "#B88A4A", skin: "#F4D4BF", shirt: "#2C3E75" },
    de: { bg: "#ECECEC", hair: "#D9B46A", skin: "#F6DCCB", shirt: "#4A4A4A" }
  };
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const store = {
    get(k){ try{ return localStorage.getItem(k); }catch(e){ return null; } },
    set(k, v){ try{ localStorage.setItem(k, v); }catch(e){} }
  };

  /* ---------- 話し相手の一覧（サーバー）と選択中の話し相手 ---------- */
  let data = { mine: [], shared: [], isAdmin: false, loaded: false };
  let currentId = store.get(CUR_KEY) || "default";
  let currentLang = "en";

  const all = () => data.mine.concat(data.shared);
  const find = id => all().find(p => p.id === id) || null;
  const current = () => find(currentId);
  function name(lang){
    const p = current();
    return p ? p.name : getLang(lang || currentLang).partner;
  }
  function scopeOf(id){
    if (data.mine.some(p => p.id === id)) return "mine";
    if (data.shared.some(p => p.id === id)) return "shared";
    return "default";
  }
  function canEdit(p){ return !!p && (p.scope === "mine" || (p.scope === "shared" && data.isAdmin)); }

  async function refresh(){
    const res = await callBackend("listPartners", {}, 20000);
    data = { mine: res.mine || [], shared: res.shared || [], isAdmin: !!res.isAdmin, loaded: true };
    if (currentId !== "default" && !current()) select("default");
    return data;
  }
  function reset(){
    data = { mine: [], shared: [], isAdmin: false, loaded: false };
    load(currentLang);
  }
  function select(id){
    currentId = id || "default";
    store.set(CUR_KEY, currentId);
    load(currentLang);
  }

  /* ---------- 声（端末ごと。話し相手×言語ごとに選べる）---------- */
  const synth = window.speechSynthesis;
  let voicePrefs = {};
  try{ voicePrefs = JSON.parse(store.get(VOICE_KEY) || "{}") || {}; }catch(e){ voicePrefs = {}; }
  const norm = l => String(l || "").toLowerCase().replace("_", "-");
  function voicesFor(lang){
    if (!synth) return [];
    const code = norm(getLang(lang).speech);
    const pre = code.split("-")[0];
    const list = (synth.getVoices() || []).filter(v => norm(v.lang).startsWith(pre));
    return list.sort((a, b) => (norm(b.lang) === code) - (norm(a.lang) === code));
  }
  function voicePref(pid, lang){ return (voicePrefs[pid] && voicePrefs[pid][lang]) || ""; }
  function setVoicePref(pid, lang, uri){
    (voicePrefs[pid] = voicePrefs[pid] || {})[lang] = uri;
    store.set(VOICE_KEY, JSON.stringify(voicePrefs));
  }
  function pickVoiceFor(pid, lang){
    const list = voicesFor(lang);
    const want = voicePref(pid, lang);
    return (want && list.find(v => v.voiceURI === want)) || list[0] || null;
  }
  const pickVoice = lang => pickVoiceFor(currentId, lang);

  function sayWith(pid, lang, text, avatar){
    if (!synth) return;
    synth.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = getLang(lang).speech;
    const v = pickVoiceFor(pid, lang);
    if (v) u.voice = v;
    if (avatar){ avatar.setEmotion("joy"); avatar.startTalking(); }
    const end = () => avatar && avatar.stopTalking();
    u.onend = end; u.onerror = end;
    synth.speak(u);
  }

  /* ---------- アバター ---------- */
  const avatars = new Set();

  function svgFace(lang){
    const p = PALETTE[lang] || PALETTE.en;
    return `
<svg class="pa-svg" viewBox="0 0 200 200" aria-hidden="true">
  <rect width="200" height="200" fill="${p.bg}"/>
  <ellipse cx="100" cy="104" rx="64" ry="72" fill="${p.hair}"/>
  <path d="M26 200 C34 158 70 150 100 150 C130 150 166 158 174 200 Z" fill="${p.shirt}"/>
  <rect x="88" y="132" width="24" height="24" rx="8" fill="${p.skin}"/>
  <ellipse cx="51" cy="104" rx="7" ry="10" fill="${p.skin}"/>
  <ellipse cx="149" cy="104" rx="7" ry="10" fill="${p.skin}"/>
  <ellipse cx="100" cy="100" rx="49" ry="56" fill="${p.skin}"/>
  <path d="M50 96 C48 50 152 50 150 96 C140 72 116 64 102 70 C86 62 62 72 50 96 Z" fill="${p.hair}"/>
  <g class="brows" stroke="${p.hair}" stroke-width="4" stroke-linecap="round" fill="none">
    <path class="brow brow-l" d="M66 82 Q78 76 90 81"/>
    <path class="brow brow-r" d="M110 81 Q122 76 134 82"/>
  </g>
  <g class="eye eye-l"><ellipse cx="78" cy="99" rx="6.5" ry="7.5" fill="#2B2B35"/><circle cx="80.5" cy="96" r="2" fill="#fff"/></g>
  <g class="eye eye-r"><ellipse cx="122" cy="99" rx="6.5" ry="7.5" fill="#2B2B35"/><circle cx="124.5" cy="96" r="2" fill="#fff"/></g>
  <g class="eye-joy" stroke="#2B2B35" stroke-width="3.5" stroke-linecap="round" fill="none">
    <path d="M70 101 Q78 92 86 101"/><path d="M114 101 Q122 92 130 101"/>
  </g>
  <ellipse class="blush" cx="70" cy="117" rx="8" ry="4" fill="#F09A92"/>
  <ellipse class="blush" cx="130" cy="117" rx="8" ry="4" fill="#F09A92"/>
  <path d="M100 104 q-4 9 2 11" stroke="#C99278" stroke-width="2.2" fill="none" stroke-linecap="round"/>
  <path class="m m-neutral" d="M88 129 Q100 135 112 129" stroke="#A5524A" stroke-width="3.2" fill="none" stroke-linecap="round"/>
  <path class="m m-joy" d="M84 125 Q100 144 116 125 Z" fill="#9A3F38"/>
  <path class="m m-sad" d="M88 135 Q100 126 112 135" stroke="#A5524A" stroke-width="3.2" fill="none" stroke-linecap="round"/>
  <ellipse class="m m-surprised" cx="100" cy="132" rx="6" ry="7.5" fill="#8A3D36"/>
  <g class="m m-open"><ellipse cx="100" cy="131" rx="10" ry="8" fill="#8A3D36"/><ellipse cx="100" cy="135.5" rx="6" ry="3" fill="#E07B74"/></g>
</svg>`;
  }

  class Avatar {
    constructor(el){
      this.el = el;
      this.emo = "neutral";
      this._mouthT = null;
      this._blinkT = null;
      el.classList.add("partner-avatar");
      el.dataset.emo = "neutral";
      avatars.add(this);
      this.scheduleBlink();
    }
    render(images, lang){
      if (images && images.neutral){
        this.el.classList.add("photo-mode");
        this.el.innerHTML = EMOS.map(e => {
          const own = !!images[key(e, "base")];
          const src = k => images[key(own ? e : "neutral", k)];
          const talk = src("talk"), blink = src("blink");
          return `<div class="pa-group${talk ? "" : " no-talk"}" data-emo="${e}">
            <img class="pa-base" src="${escapeHtml(src("base"))}" alt="">
            ${talk ? `<img class="pa-talk" src="${escapeHtml(talk)}" alt="">` : ""}
            ${blink ? `<img class="pa-blink" src="${escapeHtml(blink)}" alt="">` : ""}
          </div>`;
        }).join("");
      } else {
        this.el.classList.remove("photo-mode");
        this.el.innerHTML = svgFace(lang);
      }
      this.el.dataset.emo = this.emo;
    }
    setEmotion(e){
      if (!EMOS.includes(e)) e = "neutral";
      this.emo = e;
      this.el.dataset.emo = e;
    }
    startTalking(){
      if (this._mouthT) return;
      this.el.classList.add("talking");
      const tick = () => {
        this.el.classList.toggle("mouth-open", Math.random() < 0.6);
        this._mouthT = setTimeout(tick, 90 + Math.random() * 130);
      };
      tick();
    }
    stopTalking(){
      clearTimeout(this._mouthT);
      this._mouthT = null;
      this.el.classList.remove("talking", "mouth-open");
    }
    scheduleBlink(){
      clearTimeout(this._blinkT);
      this._blinkT = setTimeout(async () => {
        await this.blink();
        if (Math.random() < 0.2){ await sleep(170); await this.blink(); }
        this.scheduleBlink();
      }, 2200 + Math.random() * 3800);
    }
    async blink(){
      this.el.classList.add("blink");
      await sleep(130);
      this.el.classList.remove("blink");
    }
    destroy(){
      this.stopTalking();
      clearTimeout(this._blinkT);
      avatars.delete(this);
    }
  }

  function photosOf(p){ return (p && p.photos && p.photos.neutral) ? p.photos : {}; }

  function load(lang){
    currentLang = lang || currentLang;
    const images = photosOf(current());
    avatars.forEach(a => { if (!a.el.dataset.fixed) a.render(images, currentLang); });
    refreshLabels();
  }
  function refreshLabels(){
    const L = getLang(currentLang);
    document.querySelectorAll("[data-partner-name]").forEach(el => el.textContent = name(currentLang));
    document.querySelectorAll("[data-partner-flag]").forEach(el => el.textContent = L.flag);
    document.querySelectorAll("[data-partner-lang]").forEach(el => el.textContent = L.label);
    document.querySelectorAll("[data-partner-scope]").forEach(el => el.textContent = SCOPE_LABEL[scopeOf(currentId)]);
  }
  const setEmotionAll = e => avatars.forEach(a => a.setEmotion(e));
  const startTalkingAll = () => avatars.forEach(a => { if (!a.el.dataset.fixed) a.startTalking(); });
  const stopTalkingAll = () => avatars.forEach(a => a.stopTalking());

  /* ---------- 返答から表情タグを取り出す（GASが先頭に [joy] などを付けて返す）---------- */
  const TAG_RE = /\[(neutral|joy|sad|surprised|happy|smile|troubled|trouble|surprise)\]/gi;
  const TAG_MAP = { happy: "joy", smile: "joy", troubled: "sad", trouble: "sad", surprise: "surprised" };
  function parseReply(raw){
    let s = String(raw || "");
    let emotion = null;
    const m = s.match(TAG_RE);
    if (m){
      const t = m[0].slice(1, -1).toLowerCase();
      emotion = TAG_MAP[t] || t;
    }
    s = s.replace(TAG_RE, "").replace(/\s{2,}/g, " ").trim();
    if (!emotion) emotion = guessEmotion(s);
    return { text: s, emotion };
  }
  function guessEmotion(s){
    if (/sorry|perdón|lo siento|desculpe|pardon|désolé|entschuldigung|不好意思|对不起|죄송|미안/i.test(s)) return "sad";
    if (/\b(wow|really\?|oh!)|¡vaya|¿en serio|nossa|sério\?|vraiment \?|waouh|wirklich\?|真的吗|哇|정말요?\?|와/i.test(s)) return "surprised";
    if (/[!！]/.test(s) && !/[?？]/.test(s)) return "joy";
    return "neutral";
  }

  /* ---------- 画像の読み込み（正方形に切り抜き・縮小 → dataURL）---------- */
  function fileToSquareDataUrl(file, size = 560){
    return new Promise((res, rej) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        const s = Math.min(img.naturalWidth, img.naturalHeight);
        const sx = (img.naturalWidth - s) / 2;
        const sy = Math.max(0, (img.naturalHeight - s) / 2 - (img.naturalHeight - s) * 0.15); // 縦長は少し上寄りに
        const c = document.createElement("canvas");
        c.width = c.height = Math.min(size, s);
        c.getContext("2d").drawImage(img, sx, sy, s, s, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        res(c.toDataURL("image/jpeg", 0.86));
      };
      img.onerror = () => { URL.revokeObjectURL(url); rej(new Error("画像を読み込めませんでした")); };
      img.src = url;
    });
  }

  /** ファイル名から写真の種類を推測（まとめて登録用） */
  function keyFromFilename(fname){
    const n = String(fname || "").toLowerCase().replace(/\.[a-z0-9]+$/, "");
    let emo = null, kind = "base";
    if (/surpris|odoro|驚/.test(n)) emo = "surprised";
    else if (/joy|smile|laugh|happy|warai|egao|笑/.test(n)) emo = "joy";
    else if (/sad|troub|komari|困/.test(n)) emo = "sad";
    else if (/neutral|normal|futsu|普通/.test(n)) emo = "neutral";
    if (/blink|mabataki|瞬/.test(n)) kind = "blink";
    else if (/talk|mouth|speak|shaberi|しゃべ|口/.test(n)) kind = "talk";
    if (!emo && (kind !== "base" || /^(base|face|kao|顔)/.test(n))) emo = "neutral";
    return emo ? key(emo, kind) : null;
  }

  /* ============================================================
     話し相手を選ぶ／編集する モーダル
     ============================================================ */
  let tab = "mine";
  let editId = null;
  let modalAvatar = null;

  function root(){ return document.getElementById("pm-root"); }
  function msg(t, ok){
    const el = document.getElementById("pm-msg");
    if (el){ el.textContent = t || ""; el.classList.toggle("ok", !!ok); }
  }
  function destroyModalAvatar(){ if (modalAvatar){ modalAvatar.destroy(); modalAvatar = null; } }

  async function openPicker(){
    editId = null;
    tab = scopeOf(currentId) === "shared" ? "shared" : "mine";
    openModal(`<div id="pm-root"><div class="loader"><div class="ring"></div><p>読み込み中…</p></div></div>`);
    document.getElementById("modal-card").classList.add("wide");
    try{ await refresh(); }catch(err){ /* 一覧が取れなくても標準は選べる */ }
    renderPicker();
  }

  function thumbHTML(p){
    const u = p && p.photos && p.photos.neutral;
    return u ? `<img src="${escapeHtml(u)}" alt="" loading="lazy">` : svgFace(currentLang);
  }

  function renderPicker(){
    const r = root(); if (!r) return;
    destroyModalAvatar();
    editId = null;
    const list = tab === "mine" ? data.mine : data.shared;
    const editable = tab === "mine" || data.isAdmin;
    const tile = (p, id) => {
      const sel = currentId === id;
      return `<div class="pm-tile${sel ? " selected" : ""}" data-pick="${escapeHtml(id)}">
        <div class="pm-thumb">${thumbHTML(p)}</div>
        <div class="pm-tile-name">${escapeHtml(p ? p.name : `標準（${getLang(currentLang).partner}）`)}</div>
        ${sel ? `<span class="pm-check">✓</span>` : ""}
        ${p && canEdit(p) ? `<button type="button" class="pm-edit" data-edit="${escapeHtml(id)}" aria-label="編集">✎</button>` : ""}
      </div>`;
    };
    r.innerHTML = `
      <h3>話し相手を選ぶ</h3>
      <div class="auth-tabs pm-tabs">
        <button type="button" class="auth-tab${tab === "mine" ? " active" : ""}" data-tab-pm="mine">マイ話し相手 ${data.mine.length}/${LIMIT}</button>
        <button type="button" class="auth-tab${tab === "shared" ? " active" : ""}" data-tab-pm="shared">みんなの話し相手 ${data.shared.length}/${LIMIT}</button>
      </div>
      <p class="pm-note">${tab === "mine"
        ? "あなただけが使える話し相手です。どの端末からログインしても使えます。"
        : (data.isAdmin ? "全員が使える話し相手です（管理者として編集できます）。" : "管理者が用意した、全員が使える話し相手です。")}</p>
      <div class="pm-tiles">
        ${tab === "mine" ? tile(null, "default") : ""}
        ${list.map(p => tile(p, p.id)).join("")}
        ${editable && list.length < LIMIT ? `<button type="button" class="pm-tile pm-add" id="pm-add"><span>＋</span><div class="pm-tile-name">新しく追加</div></button>` : ""}
      </div>
      ${!data.loaded ? `<p class="pm-note warn">サーバーから話し相手を読み込めませんでした。時間をおいて開き直してください。</p>` : ""}
      ${tab === "shared" && !list.length ? `<p class="pm-note">まだ登録されていません。</p>` : ""}
      <p class="auth-msg" id="pm-msg"></p>
      <div class="modal-actions"><button type="button" class="btn-primary" id="pm-close">閉じる</button></div>
    `;
    r.querySelectorAll("[data-tab-pm]").forEach(b => b.addEventListener("click", () => { tab = b.dataset.tabPm; renderPicker(); }));
    r.querySelectorAll("[data-pick]").forEach(t => t.addEventListener("click", e => {
      if (e.target.closest(".pm-edit")) return;
      select(t.dataset.pick);
      renderPicker();
      const p = current();
      sayWith(currentId, currentLang, getLang(currentLang).hello, null);
      msg(`${p ? p.name : "標準"} に切り替えました`, true);
    }));
    r.querySelectorAll("[data-edit]").forEach(b => b.addEventListener("click", () => openEditor(b.dataset.edit)));
    const add = document.getElementById("pm-add");
    if (add) add.addEventListener("click", async () => {
      add.disabled = true;
      msg("追加しています…");
      try{
        const res = await callBackend("savePartner", { scope: tab, name: `話し相手${list.length + 1}` }, 20000);
        (tab === "mine" ? data.mine : data.shared).push(res.partner);
        openEditor(res.partner.id);
      }catch(err){ msg(err.message); add.disabled = false; }
    });
    document.getElementById("pm-close").addEventListener("click", closeModal);
  }

  function openEditor(id){
    editId = id;
    renderEditor();
  }

  function replacePartner(updated){
    ["mine", "shared"].forEach(s => {
      const i = data[s].findIndex(p => p.id === updated.id);
      if (i >= 0) data[s][i] = updated;
    });
    if (updated.id === currentId) load(currentLang);
  }

  function renderEditor(){
    const r = root(); if (!r) return;
    const p = find(editId);
    if (!p){ renderPicker(); return; }
    const L = getLang(currentLang);
    const voices = voicesFor(currentLang);
    const curVoice = voicePref(p.id, currentLang);
    const photos = p.photos || {};

    r.innerHTML = `
      <button type="button" class="pm-back" id="pm-back">← 一覧へ戻る</button>
      <h3>${escapeHtml(SCOPE_LABEL[p.scope] || "")}を編集</h3>
      <div class="pm-preview">
        <div id="pm-avatar"></div>
        <div class="pm-preview-side">
          <div class="pm-emo-btns">${EMOS.map(e => `<button type="button" class="chip" data-pm-emo="${e}">${EMO_LABELS[e]}</button>`).join("")}</div>
          <button type="button" class="btn-secondary pm-say" id="pm-say">▶ 試しに話す（${escapeHtml(L.label)}）</button>
          <button type="button" class="btn-primary pm-use" id="pm-use">${currentId === p.id ? "✓ 使用中" : "この話し相手を使う"}</button>
        </div>
      </div>
      <div class="pm-row">
        <label for="pm-name">名前</label>
        <input type="text" id="pm-name" maxlength="16" value="${escapeHtml(p.name)}">
      </div>
      <div class="pm-row">
        <label for="pm-voice">声</label>
        <select id="pm-voice">
          <option value="">自動（${escapeHtml(L.label)}）</option>
          ${voices.map(v => `<option value="${escapeHtml(v.voiceURI)}"${v.voiceURI === curVoice ? " selected" : ""}>${escapeHtml(v.name)}（${escapeHtml(v.lang)}）</option>`).join("")}
        </select>
      </div>
      <p class="pm-note">声は言語ごと・端末ごとに選べます（いまの練習言語：${escapeHtml(L.label)}）。</p>
      ${voices.length ? "" : `<p class="pm-note warn">この端末には${escapeHtml(L.label)}の声が見つかりません。端末の音声設定で${escapeHtml(L.label)}の読み上げ音声を追加してください。</p>`}

      <h4 class="pm-sub">写真（表情ごとに 顔・瞬き・しゃべり）</h4>
      <p class="pm-note">「顔」は目を開けて口を閉じた写真、「瞬き」は目を閉じた写真、「しゃべり」は口を開けた写真です。同じ構図で撮るときれいに切り替わります（正方形に切り抜かれます）。普通の「顔」だけでも動きます。</p>
      <div class="pm-grid">
        <div></div>${KINDS.map(k => `<div class="pm-head">${KIND_LABELS[k]}</div>`).join("")}
        ${EMOS.map(e => `
          <div class="pm-emo">${EMO_LABELS[e]}</div>
          ${KINDS.map(k => {
            const kk = key(e, k);
            const u = photos[kk];
            return `<div class="pm-slot${u ? " has" : ""}" data-key="${kk}">
              ${u ? `<img src="${escapeHtml(u)}" alt="" loading="lazy">` : `<span>＋</span>`}
              ${u ? `<button type="button" class="pm-del" data-del="${kk}" aria-label="削除">×</button>` : ""}
            </div>`;
          }).join("")}
        `).join("")}
      </div>
      <input type="file" id="pm-file" accept="image/*" hidden>
      <input type="file" id="pm-bulk" accept="image/*" multiple hidden>
      <div class="pm-bulk-row">
        <button type="button" class="btn-secondary" id="pm-bulk-btn">まとめて選ぶ</button>
        <button type="button" class="btn-secondary pm-danger" id="pm-clear">写真をすべて削除</button>
      </div>
      <p class="pm-note">まとめて選ぶ場合はファイル名で自動振り分けします（例：neutral.jpg / neutral_blink.jpg / joy_talk.jpg / 困り顔_瞬き.jpg）。</p>
      <p class="auth-msg" id="pm-msg"></p>
      <div class="pm-bulk-row">
        <button type="button" class="btn-secondary pm-danger" id="pm-delete">この話し相手を削除</button>
        <button type="button" class="btn-primary" id="pm-done">完了</button>
      </div>
    `;

    destroyModalAvatar();
    modalAvatar = new Avatar(document.getElementById("pm-avatar"));
    modalAvatar.el.dataset.fixed = "1";
    modalAvatar.render(photosOf(p), currentLang);

    const busy = on => r.querySelectorAll("button, input, select").forEach(x => { if (x.id !== "pm-back") x.disabled = on; });

    document.getElementById("pm-back").addEventListener("click", renderPicker);
    document.getElementById("pm-done").addEventListener("click", renderPicker);
    document.getElementById("pm-use").addEventListener("click", () => { select(p.id); renderEditor(); msg(`${p.name} に切り替えました`, true); });
    r.querySelectorAll("[data-pm-emo]").forEach(b => b.addEventListener("click", () => modalAvatar.setEmotion(b.dataset.pmEmo)));
    document.getElementById("pm-say").addEventListener("click", () => sayWith(p.id, currentLang, getLang(currentLang).hello, modalAvatar));

    document.getElementById("pm-name").addEventListener("change", async e => {
      const nm = e.target.value.trim();
      if (!nm){ e.target.value = p.name; return; }
      msg("保存中…");
      try{
        const res = await callBackend("savePartner", { id: p.id, name: nm }, 20000);
        replacePartner(Object.assign({}, p, { name: res.partner.name }));
        refreshLabels();
        msg("名前を保存しました", true);
      }catch(err){ msg(err.message); }
    });
    document.getElementById("pm-voice").addEventListener("change", e => setVoicePref(p.id, currentLang, e.target.value));

    let pendingKey = null;
    const fileInput = document.getElementById("pm-file");
    r.querySelectorAll(".pm-slot").forEach(slot => slot.addEventListener("click", e => {
      if (e.target.closest(".pm-del")) return;
      pendingKey = slot.dataset.key;
      fileInput.value = "";
      fileInput.click();
    }));
    const upload = async (k, file) => {
      const dataUrl = await fileToSquareDataUrl(file);
      const res = await callBackend("uploadPartnerPhoto", { id: p.id, key: k, dataUrl }, 60000);
      replacePartner(res.partner);
    };
    fileInput.addEventListener("change", async () => {
      const f = fileInput.files && fileInput.files[0];
      if (!f || !pendingKey) return;
      busy(true); msg("アップロード中…");
      try{ await upload(pendingKey, f); renderEditor(); msg("保存しました", true); }
      catch(err){ busy(false); msg("保存できませんでした：" + err.message); }
    });
    r.querySelectorAll(".pm-del").forEach(b => b.addEventListener("click", async () => {
      busy(true); msg("削除中…");
      try{
        const res = await callBackend("deletePartnerPhoto", { id: p.id, key: b.dataset.del }, 20000);
        replacePartner(res.partner); renderEditor();
      }catch(err){ busy(false); msg(err.message); }
    }));
    const bulk = document.getElementById("pm-bulk");
    document.getElementById("pm-bulk-btn").addEventListener("click", () => { bulk.value = ""; bulk.click(); });
    bulk.addEventListener("change", async () => {
      const files = Array.from(bulk.files || []);
      if (!files.length) return;
      busy(true);
      let ok = 0; const skipped = [];
      for (const f of files){
        const k = keyFromFilename(f.name);
        if (!k){ skipped.push(f.name); continue; }
        msg(`アップロード中…（${ok + 1}/${files.length}）`);
        try{ await upload(k, f); ok++; }catch(e){ skipped.push(f.name); }
      }
      renderEditor();
      msg(`${ok}枚を登録しました。` + (skipped.length ? ` 登録できなかったファイル：${skipped.join("、")}` : ""), !skipped.length);
    });
    document.getElementById("pm-clear").addEventListener("click", async () => {
      if (!confirm(`${p.name} の写真をすべて削除しますか？`)) return;
      busy(true); msg("削除中…");
      try{
        const res = await callBackend("clearPartnerPhotos", { id: p.id }, 30000);
        replacePartner(res.partner); renderEditor();
      }catch(err){ busy(false); msg(err.message); }
    });
    document.getElementById("pm-delete").addEventListener("click", async () => {
      if (!confirm(`話し相手「${p.name}」を削除しますか？写真もすべて削除されます。`)) return;
      busy(true); msg("削除中…");
      try{
        await callBackend("deletePartner", { id: p.id }, 30000);
        data.mine = data.mine.filter(x => x.id !== p.id);
        data.shared = data.shared.filter(x => x.id !== p.id);
        if (currentId === p.id) select("default");
        renderPicker();
      }catch(err){ busy(false); msg(err.message); }
    });
  }

  function onModalClosed(){
    destroyModalAvatar();
    editId = null;
    synth && synth.cancel();
    load(currentLang);
  }

  if (synth && "onvoiceschanged" in synth){
    synth.addEventListener("voiceschanged", () => {
      const sel = document.getElementById("pm-voice");
      if (sel && sel.options.length <= 1 && editId) renderEditor();
    });
  }

  return {
    Avatar, load, refresh, reset, select, name, pickVoice, parseReply, refreshLabels,
    setEmotionAll, startTalkingAll, stopTalkingAll,
    openPicker, openSettings: openPicker, onModalClosed,
    get lang(){ return currentLang; }
  };
})();
