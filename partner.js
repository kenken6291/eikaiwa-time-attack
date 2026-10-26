/* ============================================================
   Speak in 3 — 多言語対応 ＆ 話し相手（写真アバター）
   ・7言語（英語/スペイン語/中国語/ポルトガル語/韓国語/フランス語/ドイツ語）
   ・話し相手の写真：普通/笑顔/困り顔/驚き × 顔/瞬き/しゃべり（最大12枚）
     読み込み順：この端末に登録した写真 → partners/<言語コード>/ → partners/common/ → イラスト
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
  const SETTINGS_KEY = "speakin3_partner_settings";
  const PALETTE = {
    en: { bg: "#DBE7FB", hair: "#5A3B2A", skin: "#F3D2BB", shirt: "#3F6FD8" },
    es: { bg: "#FDE3D6", hair: "#2B1D16", skin: "#E8B993", shirt: "#E0543F" },
    zh: { bg: "#FBE0E0", hair: "#1D1A1A", skin: "#F5D7BF", shirt: "#D23A48" },
    pt: { bg: "#DFF4E6", hair: "#3B2416", skin: "#C98F66", shirt: "#2FA36B" },
    ko: { bg: "#EBE3FB", hair: "#241B1B", skin: "#F6DAC6", shirt: "#8A6BD8" },
    fr: { bg: "#E3E8F6", hair: "#B88A4A", skin: "#F4D4BF", shirt: "#2C3E75" },
    de: { bg: "#ECECEC", hair: "#D9B46A", skin: "#F6DCCB", shirt: "#4A4A4A" }
  };

  /* ---------- 設定（名前・声）---------- */
  let settings = {};
  try{ settings = JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}") || {}; }catch(e){ settings = {}; }
  function saveSettings(){ try{ localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); }catch(e){} }
  function conf(lang){ return settings[lang] || (settings[lang] = {}); }
  function name(lang){ return (settings[lang] && settings[lang].name) || getLang(lang).partner; }

  /* ---------- 声 ---------- */
  const synth = window.speechSynthesis;
  const norm = l => String(l || "").toLowerCase().replace("_", "-");
  function voicesFor(lang){
    if (!synth) return [];
    const code = norm(getLang(lang).speech);
    const pre = code.split("-")[0];
    const list = (synth.getVoices() || []).filter(v => norm(v.lang).startsWith(pre));
    // 同じ言語でも地域が一致するものを先頭に
    return list.sort((a, b) => (norm(b.lang) === code) - (norm(a.lang) === code));
  }
  function pickVoice(lang){
    const list = voicesFor(lang);
    const want = settings[lang] && settings[lang].voiceURI;
    return (want && list.find(v => v.voiceURI === want)) || list[0] || null;
  }

  /* ---------- 写真の保存（この端末の IndexedDB）---------- */
  let dbp = null;
  function db(){
    if (dbp) return dbp;
    dbp = new Promise((res, rej) => {
      if (!window.indexedDB){ rej(new Error("IndexedDB未対応")); return; }
      const req = indexedDB.open("speakin3_partner", 1);
      req.onupgradeneeded = () => req.result.createObjectStore("photos");
      req.onsuccess = () => res(req.result);
      req.onerror = () => rej(req.error);
    });
    return dbp;
  }
  async function idb(mode, fn){
    const d = await db();
    return new Promise((res, rej) => {
      const tx = d.transaction("photos", mode);
      const r = fn(tx.objectStore("photos"));
      let out;
      if (r) r.onsuccess = () => { out = r.result; };
      tx.oncomplete = () => res(out);
      tx.onerror = () => rej(tx.error);
    });
  }
  const getPhoto = (lang, k) => idb("readonly", st => st.get(`${lang}:${k}`)).catch(() => null);
  const putPhoto = (lang, k, blob) => idb("readwrite", st => st.put(blob, `${lang}:${k}`));
  const delPhoto = (lang, k) => idb("readwrite", st => st.delete(`${lang}:${k}`));

  const localUrls = {};
  async function localPhotos(lang){
    (localUrls[lang] || []).forEach(u => URL.revokeObjectURL(u));
    localUrls[lang] = [];
    const out = {};
    for (const k of ALL_KEYS){
      const b = await getPhoto(lang, k);
      if (b){ const u = URL.createObjectURL(b); out[k] = u; localUrls[lang].push(u); }
    }
    return out;
  }

  /* ---------- リポジトリ内の写真（partners/<lang>/neutral.jpg など）---------- */
  function probe(url){
    return new Promise(res => {
      const im = new Image();
      im.onload = () => res(url);
      im.onerror = () => res(null);
      im.src = url;
    });
  }
  const repoCache = {};
  async function repoPhotos(dir){
    if (repoCache[dir]) return repoCache[dir];
    const out = {};
    if (await probe(`partners/${dir}/neutral.jpg`)){
      await Promise.all(ALL_KEYS.map(async k => {
        const u = await probe(`partners/${dir}/${k}.jpg`);
        if (u) out[k] = u;
      }));
    }
    repoCache[dir] = out;
    return out;
  }

  async function imagesFor(lang){
    const local = await localPhotos(lang);
    if (local.neutral) return local;
    const repo = await repoPhotos(lang);
    if (repo.neutral) return repo;
    const common = await repoPhotos("common");
    if (common.neutral) return common;
    return {};
  }

  /* ---------- アバター ---------- */
  const avatars = new Set();
  const sleep = ms => new Promise(r => setTimeout(r, ms));

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
            <img class="pa-base" src="${src("base")}" alt="">
            ${talk ? `<img class="pa-talk" src="${talk}" alt="">` : ""}
            ${blink ? `<img class="pa-blink" src="${blink}" alt="">` : ""}
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

  let currentLang = "en";
  async function load(lang){
    currentLang = lang;
    const images = await imagesFor(lang);
    if (lang !== currentLang) return; // 読み込み中に言語が切り替わった
    avatars.forEach(a => { if (!a.el.dataset.fixedLang) a.render(images, lang); });
    refreshLabels();
  }
  function refreshLabels(){
    const L = getLang(currentLang);
    document.querySelectorAll("[data-partner-name]").forEach(el => el.textContent = name(currentLang));
    document.querySelectorAll("[data-partner-flag]").forEach(el => el.textContent = L.flag);
    document.querySelectorAll("[data-partner-lang]").forEach(el => el.textContent = L.label);
  }
  const setEmotionAll = e => avatars.forEach(a => a.setEmotion(e));
  const startTalkingAll = () => avatars.forEach(a => a.startTalking());
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

  /* ---------- 画像の読み込み（正方形に切り抜き・縮小）---------- */
  function fileToSquareJpeg(file, size = 560){
    return new Promise((res, rej) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        const s = Math.min(img.naturalWidth, img.naturalHeight);
        const sx = (img.naturalWidth - s) / 2;
        const sy = Math.max(0, (img.naturalHeight - s) / 2 - (img.naturalHeight - s) * 0.15); // 縦長は少し上寄りに（顔が上にあることが多いため）
        const c = document.createElement("canvas");
        c.width = c.height = Math.min(size, s);
        c.getContext("2d").drawImage(img, sx, sy, s, s, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        c.toBlob(b => b ? res(b) : rej(new Error("画像の変換に失敗しました")), "image/jpeg", 0.86);
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

  /* ---------- 話し相手の設定モーダル ---------- */
  let modalAvatar = null;
  let editLang = "en";

  async function openSettings(lang){
    editLang = lang || currentLang;
    openModal(`<div id="pm-root"></div>`);
    document.getElementById("modal-card").classList.add("wide");
    await renderSettings();
  }

  async function renderSettings(){
    const root = document.getElementById("pm-root");
    if (!root) return;
    const L = getLang(editLang);
    const local = await localPhotos(editLang);
    const voices = voicesFor(editLang);
    const curVoice = (settings[editLang] && settings[editLang].voiceURI) || "";

    root.innerHTML = `
      <h3>話し相手の設定</h3>
      <div class="pm-row">
        <label for="pm-lang">言語</label>
        <select id="pm-lang">${LANG_ORDER.map(c => `<option value="${c}"${c === editLang ? " selected" : ""}>${LANGS[c].flag} ${LANGS[c].label}</option>`).join("")}</select>
      </div>
      <div class="pm-preview">
        <div class="pm-avatar" id="pm-avatar"></div>
        <div class="pm-preview-side">
          <div class="pm-emo-btns">${EMOS.map(e => `<button type="button" class="chip" data-pm-emo="${e}">${EMO_LABELS[e]}</button>`).join("")}</div>
          <button type="button" class="btn-secondary pm-say" id="pm-say">▶ 試しに話す</button>
        </div>
      </div>
      <div class="pm-row">
        <label for="pm-name">名前</label>
        <input type="text" id="pm-name" maxlength="16" value="${escapeHtml(name(editLang))}">
      </div>
      <div class="pm-row">
        <label for="pm-voice">声</label>
        <select id="pm-voice">
          <option value="">自動（${escapeHtml(L.label)}）</option>
          ${voices.map(v => `<option value="${escapeHtml(v.voiceURI)}"${v.voiceURI === curVoice ? " selected" : ""}>${escapeHtml(v.name)}（${escapeHtml(v.lang)}）</option>`).join("")}
        </select>
      </div>
      ${voices.length ? "" : `<p class="pm-note warn">この端末には${escapeHtml(L.label)}の声が見つかりません。端末の音声設定で${escapeHtml(L.label)}の読み上げ音声を追加してください。</p>`}

      <h4 class="pm-sub">写真（表情ごとに 顔・瞬き・しゃべり）</h4>
      <p class="pm-note">「顔」は目を開けて口を閉じた写真、「瞬き」は目を閉じた写真、「しゃべり」は口を開けた写真です。同じ構図で撮るときれいに切り替わります（正方形に切り抜かれます）。普通の「顔」だけでも動きます。</p>
      <div class="pm-grid">
        <div></div>${KINDS.map(k => `<div class="pm-head">${KIND_LABELS[k]}</div>`).join("")}
        ${EMOS.map(e => `
          <div class="pm-emo">${EMO_LABELS[e]}</div>
          ${KINDS.map(k => {
            const kk = key(e, k);
            const u = local[kk];
            return `<div class="pm-slot${u ? " has" : ""}" data-key="${kk}">
              ${u ? `<img src="${u}" alt="">` : `<span>＋</span>`}
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
      <p class="pm-note">まとめて選ぶ場合はファイル名で自動振り分けします（例：neutral.jpg / neutral_blink.jpg / joy_talk.jpg / 困り顔_瞬き.jpg）。写真はこの端末だけに保存されます。</p>
      <p class="auth-msg" id="pm-msg"></p>
      <div class="modal-actions"><button type="button" class="btn-primary" id="pm-close">閉じる</button></div>
    `;

    if (modalAvatar) modalAvatar.destroy();
    modalAvatar = new Avatar(document.getElementById("pm-avatar"));
    modalAvatar.el.dataset.fixedLang = "1";
    modalAvatar.render(local.neutral ? local : await imagesFor(editLang), editLang);

    let pendingKey = null;
    const fileInput = document.getElementById("pm-file");
    const msg = t => { const el = document.getElementById("pm-msg"); if (el) el.textContent = t || ""; };

    document.getElementById("pm-lang").addEventListener("change", e => { editLang = e.target.value; renderSettings(); });
    document.getElementById("pm-name").addEventListener("change", e => {
      conf(editLang).name = e.target.value.trim();
      saveSettings();
      refreshLabels();
    });
    document.getElementById("pm-voice").addEventListener("change", e => {
      conf(editLang).voiceURI = e.target.value;
      saveSettings();
    });
    root.querySelectorAll("[data-pm-emo]").forEach(b => b.addEventListener("click", () => modalAvatar.setEmotion(b.dataset.pmEmo)));
    document.getElementById("pm-say").addEventListener("click", () => {
      if (!synth) return;
      synth.cancel();
      const u = new SpeechSynthesisUtterance(getLang(editLang).hello);
      u.lang = getLang(editLang).speech;
      const v = pickVoice(editLang);
      if (v) u.voice = v;
      modalAvatar.setEmotion("joy");
      modalAvatar.startTalking();
      const end = () => modalAvatar && modalAvatar.stopTalking();
      u.onend = end; u.onerror = end;
      synth.speak(u);
    });
    root.querySelectorAll(".pm-slot").forEach(slot => slot.addEventListener("click", e => {
      if (e.target.closest(".pm-del")) return;
      pendingKey = slot.dataset.key;
      fileInput.value = "";
      fileInput.click();
    }));
    fileInput.addEventListener("change", async () => {
      const f = fileInput.files && fileInput.files[0];
      if (!f || !pendingKey) return;
      try{
        msg("保存中…");
        await putPhoto(editLang, pendingKey, await fileToSquareJpeg(f));
        msg("");
        await afterPhotoChange();
      }catch(err){ msg("保存できませんでした：" + err.message); }
    });
    root.querySelectorAll(".pm-del").forEach(b => b.addEventListener("click", async () => {
      await delPhoto(editLang, b.dataset.del).catch(() => {});
      await afterPhotoChange();
    }));
    const bulk = document.getElementById("pm-bulk");
    document.getElementById("pm-bulk-btn").addEventListener("click", () => { bulk.value = ""; bulk.click(); });
    bulk.addEventListener("change", async () => {
      const files = Array.from(bulk.files || []);
      if (!files.length) return;
      let ok = 0; const skipped = [];
      msg("保存中…");
      for (const f of files){
        const k = keyFromFilename(f.name);
        if (!k){ skipped.push(f.name); continue; }
        try{ await putPhoto(editLang, k, await fileToSquareJpeg(f)); ok++; }catch(e){ skipped.push(f.name); }
      }
      await afterPhotoChange();
      msg(`${ok}枚を登録しました。` + (skipped.length ? ` 振り分けできなかったファイル：${skipped.join("、")}` : ""));
    });
    document.getElementById("pm-clear").addEventListener("click", async () => {
      if (!confirm(`${L.label}の話し相手の写真をすべて削除しますか？`)) return;
      for (const k of ALL_KEYS) await delPhoto(editLang, k).catch(() => {});
      await afterPhotoChange();
    });
    document.getElementById("pm-close").addEventListener("click", () => { closeModal(); });
  }

  async function afterPhotoChange(){
    await renderSettings();
    if (editLang === currentLang) await load(currentLang);
  }

  function onModalClosed(){
    if (modalAvatar){ modalAvatar.destroy(); modalAvatar = null; }
    synth && synth.cancel();
    load(currentLang);
  }

  if (synth && "onvoiceschanged" in synth){
    synth.addEventListener("voiceschanged", () => {
      if (document.getElementById("pm-voice") && document.getElementById("pm-voice").options.length <= 1) renderSettings();
    });
  }

  return {
    Avatar, load, name, pickVoice, parseReply, refreshLabels,
    setEmotionAll, startTalkingAll, stopTalkingAll,
    openSettings, onModalClosed,
    get lang(){ return currentLang; }
  };
})();
