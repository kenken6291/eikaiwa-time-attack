/* ============================================================
   Speak in 3 — フロントエンド
   GASウェブアプリのURLをここに設定してください
   ============================================================ */
const GAS_URL = "https://script.google.com/macros/s/AKfycbwaIg_BJ5AP_rAwYknfQY69pyssjs90YAohZMo8daOjtNQzE1IH6PY-gKGrGYSSS0619Q/exec";
let RESPONSE_LIMIT_SEC = 3; // タイムアタックの制限時間（秒）— 画面上のセレクトで変更可能

document.getElementById("wait-time-select").addEventListener("change", (e) => {
  RESPONSE_LIMIT_SEC = Number(e.target.value);
});

/* ============================================================
   会員認証
   ============================================================ */
let auth = { sessionToken: null, nickname: null };

function rawCallBackend(action, payload){
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 20000); // 20秒でタイムアウト
  return fetch(GAS_URL, {
    method: "POST",
    headers: { "Content-Type": "text/plain" },
    body: JSON.stringify({ action, ...payload }),
    signal: controller.signal
  }).then(async res => {
    if (!res.ok) throw new Error("サーバーエラー: " + res.status);
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    return data;
  }).catch(err => {
    if (err.name === "AbortError") throw new Error("サーバーの応答がありませんでした（タイムアウト）");
    throw err;
  }).finally(() => clearTimeout(timeoutId));
}

function showAuthMsg(id, text, ok){
  const el = document.getElementById(id);
  el.textContent = text;
  el.classList.toggle("ok", !!ok);
}

/* --- タブ切り替え --- */
document.querySelectorAll(".auth-tab").forEach(tab => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".auth-tab").forEach(t => t.classList.remove("active"));
    document.querySelectorAll(".auth-form").forEach(f => f.classList.remove("active"));
    tab.classList.add("active");
    document.querySelector(`.auth-form[data-tab="${tab.dataset.tab}"]`).classList.add("active");
  });
});

/* --- パスワード表示/非表示切り替え --- */
document.querySelectorAll(".pw-toggle").forEach(btn => {
  btn.addEventListener("click", () => {
    const input = document.getElementById(btn.dataset.target);
    const showing = input.type === "text";
    input.type = showing ? "password" : "text";
    btn.textContent = showing ? "表示" : "非表示";
  });
});

/* --- ログイン --- */
document.getElementById("login-form").addEventListener("submit", async e => {
  e.preventDefault();
  showAuthMsg("login-msg", "");
  const email = document.getElementById("login-email").value.trim();
  const password = document.getElementById("login-password").value;
  try{
    const data = await rawCallBackend("login", { email, password });
    if (data.mustChangePassword){
      auth.sessionToken = data.sessionToken; // 強制変更フォームで使う
      switchAuthTab("forced");
      return;
    }
    completeLogin(data.sessionToken, data.nickname);
  }catch(err){
    showAuthMsg("login-msg", err.message);
  }
});

/* --- 新規登録 --- */
document.getElementById("register-form").addEventListener("submit", async e => {
  e.preventDefault();
  showAuthMsg("register-msg", "");
  const nickname = document.getElementById("register-nickname").value.trim();
  const email = document.getElementById("register-email").value.trim();
  try{
    await rawCallBackend("register", { nickname, email });
    showAuthMsg("register-msg", "登録しました。メールに届いた仮パスワードでログインしてください。", true);
    document.getElementById("register-form").reset();
  }catch(err){
    showAuthMsg("register-msg", err.message);
  }
});

/* --- パスワード再発行 --- */
document.getElementById("forgot-form").addEventListener("submit", async e => {
  e.preventDefault();
  showAuthMsg("forgot-msg", "");
  const email = document.getElementById("forgot-email").value.trim();
  try{
    await rawCallBackend("forgotPassword", { email });
    showAuthMsg("forgot-msg", "仮パスワードを再発行しました。メールをご確認ください。", true);
    document.getElementById("forgot-form").reset();
  }catch(err){
    showAuthMsg("forgot-msg", err.message);
  }
});

/* --- 初回ログイン時の強制パスワード変更 --- */
document.getElementById("forced-pw-form").addEventListener("submit", async e => {
  e.preventDefault();
  showAuthMsg("forced-pw-msg", "");
  const p1 = document.getElementById("forced-new-password").value;
  const p2 = document.getElementById("forced-new-password2").value;
  if (p1 !== p2){ showAuthMsg("forced-pw-msg", "新しいパスワードが一致しません"); return; }
  try{
    await rawCallBackend("changePassword", { sessionToken: auth.sessionToken, newPassword: p1 });
    const me = await rawCallBackend("checkSession", { sessionToken: auth.sessionToken });
    document.getElementById("forced-pw-form").reset();
    completeLogin(auth.sessionToken, me.nickname);
  }catch(err){
    showAuthMsg("forced-pw-msg", err.message);
  }
});

function switchAuthTab(tabName){
  document.querySelectorAll(".auth-tab").forEach(t => t.classList.remove("active"));
  document.querySelectorAll(".auth-form").forEach(f => f.classList.remove("active"));
  const tabBtn = document.querySelector(`.auth-tab[data-tab="${tabName}"]`);
  if (tabBtn) tabBtn.classList.add("active");
  document.querySelector(`.auth-form[data-tab="${tabName}"]`).classList.add("active");
}

function completeLogin(sessionToken, nickname){
  auth.sessionToken = sessionToken;
  auth.nickname = nickname;
  localStorage.setItem("speakin3_session", sessionToken);
  document.getElementById("account-nickname").textContent = nickname;
  document.getElementById("auth-screen").hidden = true;
  document.getElementById("app-screen").hidden = false;
  goToView("theme");
  restoreProgress(); // 進行中のテーマ・単語・四択があれば復元し、どのステップからでも共有されるようにする
}

function logout(){
  if (auth.sessionToken) rawCallBackend("logout", { sessionToken: auth.sessionToken }).catch(() => {});
  auth = { sessionToken: null, nickname: null };
  localStorage.removeItem("speakin3_session");
  clearProgress();
  document.getElementById("app-screen").hidden = true;
  document.getElementById("auth-screen").hidden = false;
  switchAuthTab("login");
}

/* --- アカウントメニュー --- */
document.getElementById("account-btn").addEventListener("click", () => {
  document.getElementById("account-menu").hidden = !document.getElementById("account-menu").hidden;
});
document.addEventListener("click", (e) => {
  const menu = document.getElementById("account-menu");
  if (!menu.hidden && !menu.contains(e.target) && e.target.id !== "account-btn") menu.hidden = true;
});
document.getElementById("menu-logout-btn").addEventListener("click", () => {
  document.getElementById("account-menu").hidden = true;
  if (confirm("ログアウトしますか？")) logout();
});
document.getElementById("menu-nickname-btn").addEventListener("click", () => {
  document.getElementById("account-menu").hidden = true;
  openNicknameModal();
});
document.getElementById("menu-password-btn").addEventListener("click", () => {
  document.getElementById("account-menu").hidden = true;
  openPasswordModal();
});

/* --- 汎用モーダル --- */
function openModal(html){
  document.getElementById("modal-card").innerHTML = html;
  document.getElementById("modal-overlay").hidden = false;
}
function closeModal(){
  document.getElementById("modal-overlay").hidden = true;
  document.getElementById("modal-card").innerHTML = "";
}
document.getElementById("modal-overlay").addEventListener("click", (e) => {
  if (e.target.id === "modal-overlay") closeModal();
});

function openNicknameModal(){
  openModal(`
    <h3>ニックネーム変更</h3>
    <div class="field">
      <input type="text" id="modal-nickname" value="${escapeHtml(auth.nickname || "")}" maxlength="20">
    </div>
    <p class="auth-msg" id="modal-msg"></p>
    <div class="modal-actions">
      <button class="btn-secondary" id="modal-cancel">キャンセル</button>
      <button class="btn-primary" id="modal-save">保存</button>
    </div>
  `);
  document.getElementById("modal-cancel").addEventListener("click", closeModal);
  document.getElementById("modal-save").addEventListener("click", async () => {
    const nickname = document.getElementById("modal-nickname").value.trim();
    if (!nickname){ showAuthMsg("modal-msg", "ニックネームを入力してください"); return; }
    try{
      const data = await callBackend("changeNickname", { nickname });
      auth.nickname = data.nickname;
      document.getElementById("account-nickname").textContent = data.nickname;
      closeModal();
    }catch(err){
      showAuthMsg("modal-msg", err.message);
    }
  });
}

function openPasswordModal(){
  openModal(`
    <h3>パスワード変更</h3>
    <div class="field">
      <div class="pw-field">
        <input type="password" id="modal-old-pw" placeholder="現在のパスワード">
        <button type="button" class="pw-toggle" data-target="modal-old-pw">表示</button>
      </div>
      <div class="pw-field">
        <input type="password" id="modal-new-pw" placeholder="新しいパスワード（8文字以上）" minlength="8">
        <button type="button" class="pw-toggle" data-target="modal-new-pw">表示</button>
      </div>
      <div class="pw-field">
        <input type="password" id="modal-new-pw2" placeholder="新しいパスワード（確認）" minlength="8">
        <button type="button" class="pw-toggle" data-target="modal-new-pw2">表示</button>
      </div>
    </div>
    <p class="auth-msg" id="modal-msg"></p>
    <div class="modal-actions">
      <button class="btn-secondary" id="modal-cancel">キャンセル</button>
      <button class="btn-primary" id="modal-save">変更する</button>
    </div>
  `);
  document.querySelectorAll("#modal-card .pw-toggle").forEach(btn => {
    btn.addEventListener("click", () => {
      const input = document.getElementById(btn.dataset.target);
      const showing = input.type === "text";
      input.type = showing ? "password" : "text";
      btn.textContent = showing ? "表示" : "非表示";
    });
  });
  document.getElementById("modal-cancel").addEventListener("click", closeModal);
  document.getElementById("modal-save").addEventListener("click", async () => {
    const oldPw = document.getElementById("modal-old-pw").value;
    const p1 = document.getElementById("modal-new-pw").value;
    const p2 = document.getElementById("modal-new-pw2").value;
    if (p1 !== p2){ showAuthMsg("modal-msg", "新しいパスワードが一致しません"); return; }
    try{
      await callBackend("changePassword", { oldPassword: oldPw, newPassword: p1 });
      showAuthMsg("modal-msg", "変更しました", true);
      setTimeout(closeModal, 900);
    }catch(err){
      showAuthMsg("modal-msg", err.message);
    }
  });
}

/* --- 保存済みセッションの復元 --- */
(async function restoreSession(){
  const saved = localStorage.getItem("speakin3_session");
  if (!saved) return;
  try{
    const me = await rawCallBackend("checkSession", { sessionToken: saved });
    if (me.ok) completeLogin(saved, me.nickname);
    else localStorage.removeItem("speakin3_session");
  }catch(err){
    localStorage.removeItem("speakin3_session");
  }
})();

let state = {
  theme: "",
  transcriptSummary: "", // 音声フリートークを整理した文章（テキスト入力テーマの場合は空）
  words: [],
  quiz: [],
  quizIndex: 0,
  quizScore: 0,
  talkHistory: [], // { role: 'ai'|'you', text: string, timedOut?: bool }
  sessionId: null
};

/* ---------- 画面遷移 ---------- */
const STEP_ORDER = ["theme","study","quiz","normal","talk","review"];
function goToView(step){
  document.querySelectorAll(".view").forEach(v => v.classList.remove("active"));
  document.getElementById("view-" + step).classList.add("active");
  const idx = STEP_ORDER.indexOf(step);
  document.querySelectorAll("#stepper li").forEach((li,i) => {
    li.classList.toggle("active", i === idx);
    li.classList.toggle("done", i < idx);
  });
  updateNavVisibility();
}

/* ---------- 下部ナビ（前へ戻る／次へ進む／最初から）---------- */
function currentStep(){
  return document.querySelector(".view.active").id.replace("view-", "");
}
function updateNavVisibility(){
  const step = currentStep();
  // 前へ戻る/最初から/次へ進む は「タイムアタック会話」の中でのみ使う
  document.getElementById("bottom-nav").hidden = (step !== "talk");
}
function stopActiveStepProcesses(){
  if (typeof isRecording !== "undefined" && isRecording) stopRecording();
  clearInterval(countdownTimer);
  clearInterval(themeTimerInterval);
  clearInterval(normalTimerInterval);
  if (recognizer){ try{ recognizer.stop(); }catch(e){} }
  if (themeRecognizer){ try{ themeRecognizer.stop(); }catch(e){} }
  if (normalRecognizer){ try{ normalRecognizer.stop(); }catch(e){} }
  synth && synth.cancel();
}

/* ---------- ステッパー（テーマ/単語・例文/四択テスト/会話/ふりかえり）を直接クリックで移動 ---------- */
document.querySelectorAll("#stepper li").forEach(li => {
  li.addEventListener("click", () => jumpToStep(li.dataset.step));
});

function jumpToStep(step){
  if (step === currentStep()) return;
  stopActiveStepProcesses();
  goToView(step);

  if (step === "study"){
    if (state.words.length) renderWordGrid();
  } else if (step === "quiz"){
    if (state.quiz.length){
      if (state.quizIndex >= state.quiz.length) state.quizIndex = state.quiz.length - 1;
      renderQuizQuestion();
    } else {
      document.getElementById("quiz-card").innerHTML = "<p>テストがまだ生成されていません。テーマ入力からやり直してください。</p>";
    }
  } else if (step === "normal"){
    document.getElementById("normal-theme-tag").textContent = state.theme;
    if (!state.theme) document.getElementById("normal-ai-line").textContent = "先にテーマを選んでください。";
  } else if (step === "talk"){
    document.getElementById("talk-theme-tag").textContent = state.theme;
    if (state.talkHistory.length === 0){
      if (state.theme) startConversation();
      else document.getElementById("ai-line").textContent = "先にテーマを選んでください。";
    }
  } else if (step === "review"){
    if (document.getElementById("review-card").hidden){
      if (state.talkHistory.length > 0) runEvaluation();
      else{
        document.getElementById("review-loader").hidden = true;
        document.getElementById("review-summary").textContent = "まだ会話がありません。先にタイムアタック会話を行ってください。";
        document.getElementById("review-card").hidden = false;
      }
    }
  }
}

/* --- 会話タイムアタック内の質問ナビゲーション --- */
document.getElementById("nav-back").addEventListener("click", () => {
  goBackQuestion();
});

document.getElementById("nav-next").addEventListener("click", () => {
  skipQuestion();
});

document.getElementById("nav-restart").addEventListener("click", () => {
  if (!confirm("この会話を最初からやり直しますか？ここまでのやり取りは失われます。")) return;
  restartConversationOnly();
});

/** 直近のAIの質問より後のやり取りを取り消し、その質問をもう一度出題する */
function goBackQuestion(){
  clearInterval(countdownTimer);
  if (recognizer){ try{ recognizer.stop(); }catch(e){} }
  synth && synth.cancel();

  let lastAiIdx = -1;
  for (let i = state.talkHistory.length - 1; i >= 0; i--){
    if (state.talkHistory[i].role === "ai"){ lastAiIdx = i; break; }
  }
  if (lastAiIdx === -1) return; // まだAIの発話がない

  const aiText = state.talkHistory[lastAiIdx].text;
  state.talkHistory = state.talkHistory.slice(0, lastAiIdx + 1);
  rebuildTalkLog();
  document.getElementById("ai-line").textContent = aiText;
  document.getElementById("you-line").textContent = "\u00A0";
  speak(aiText).then(() => beginListenWindow());
}

/** 今の質問への回答をスキップし、次の質問へ進む */
function skipQuestion(){
  clearInterval(countdownTimer);
  if (recognizer){ try{ recognizer.stop(); }catch(e){} }
  document.getElementById("you-line").textContent = "（スキップ）";
  addLogRow("timeout", "この質問をスキップしました");
  state.talkHistory.push({ role: "you", text: "(skipped by user)", skipped: true });
  continueConversation();
}

/** 会話タイムアタックだけを最初からやり直す（テーマ・単語・四択はそのまま） */
function restartConversationOnly(){
  clearInterval(countdownTimer);
  if (recognizer){ try{ recognizer.stop(); }catch(e){} }
  synth && synth.cancel();
  state.talkHistory = [];
  document.getElementById("talk-log").innerHTML = "";
  startConversation();
}

/** talkHistory全体から会話ログ表示を再構築する（前へ戻る後などに使用） */
function rebuildTalkLog(){
  const log = document.getElementById("talk-log");
  log.innerHTML = "";
  state.talkHistory.forEach(h => {
    if (h.role === "ai") addLogRow("ai", h.text);
    else if (h.timedOut) addLogRow("timeout", "3秒以内に応答できませんでした");
    else if (h.skipped) addLogRow("timeout", "この質問をスキップしました");
    else addLogRow("you", h.text);
  });
}

/* ---------- GAS呼び出し（text/plainでPOSTしCORSを回避）---------- */
async function callBackend(action, payload, timeoutMs = 12000){
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  let res;
  try{
    res = await fetch(GAS_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: JSON.stringify({ action, sessionToken: auth.sessionToken, ...payload }),
      signal: controller.signal
    });
  }catch(err){
    if (err.name === "AbortError") throw new Error("サーバーの応答がありませんでした（タイムアウト）");
    throw new Error("通信エラー: " + err.message);
  }finally{
    clearTimeout(timeoutId);
  }
  if (!res.ok) throw new Error("サーバーエラー: " + res.status);
  const data = await res.json();
  if (data.error) throw new Error(data.error);
  return data;
}

/* ============================================================
   STEP 1: 音声フリートーク（最大3分）→ AIがテーマを抽出
   ============================================================ */
const TALK_LIMIT_SEC = 180; // 3分
const RecognitionCtor = window.SpeechRecognition || window.webkitSpeechRecognition;
let themeRecognizer = null;
let themeTimerInterval = null;
let themeRecordStart = 0;
let themeTranscriptFinal = "";
let isRecording = false;

const recordBtn = document.getElementById("record-btn");
const recordStatus = document.getElementById("record-status");
const transcriptBox = document.getElementById("transcript-box");
const elapsedEl = document.getElementById("record-elapsed");
const recordBarFill = document.getElementById("record-bar-fill");
const useTranscriptBtn = document.getElementById("use-transcript-btn");

recordBtn.addEventListener("click", () => {
  if (!RecognitionCtor){
    recordStatus.textContent = "この端末は音声認識に対応していません。下のテーマ入力欄をご利用ください。";
    return;
  }
  isRecording ? stopRecording() : startRecording();
});

function startRecording(){
  themeTranscriptFinal = "";
  transcriptBox.hidden = false;
  transcriptBox.textContent = "";
  useTranscriptBtn.hidden = true;
  isRecording = true;
  themeRecordStart = performance.now();
  recordBtn.classList.add("recording");
  recordStatus.textContent = "聞いています…（もう一度タップで終了）";

  themeRecognizer = new RecognitionCtor();
  themeRecognizer.lang = "ja-JP";
  themeRecognizer.continuous = true;
  themeRecognizer.interimResults = true;

  themeRecognizer.onresult = (e) => {
    let interim = "";
    for (let i = e.resultIndex; i < e.results.length; i++){
      const t = e.results[i][0].transcript;
      if (e.results[i].isFinal) themeTranscriptFinal += t;
      else interim += t;
    }
    transcriptBox.textContent = themeTranscriptFinal + interim;
    transcriptBox.scrollTop = transcriptBox.scrollHeight;
  };
  themeRecognizer.onerror = () => { /* 無音などは無視して継続 */ };
  themeRecognizer.onend = () => {
    // ブラウザが自動停止した場合、録音継続中なら再開する
    if (isRecording) {
      try{ themeRecognizer.start(); }catch(e){ /* 既に開始済み */ }
    }
  };

  try{ themeRecognizer.start(); }catch(e){ /* noop */ }

  themeTimerInterval = setInterval(() => {
    const elapsed = Math.floor((performance.now() - themeRecordStart) / 1000);
    const remain = Math.max(0, TALK_LIMIT_SEC - elapsed);
    const mm = String(Math.floor(elapsed / 60));
    const ss = String(elapsed % 60).padStart(2, "0");
    elapsedEl.textContent = `${mm}:${ss}`;
    recordBarFill.style.width = `${Math.min(100, (elapsed / TALK_LIMIT_SEC) * 100)}%`;
    if (remain <= 0) stopRecording();
  }, 250);
}

function stopRecording(){
  isRecording = false;
  clearInterval(themeTimerInterval);
  if (themeRecognizer){ try{ themeRecognizer.stop(); }catch(e){} }
  recordBtn.classList.remove("recording");
  recordStatus.textContent = "録音完了。内容を確認してAIに渡しましょう。";
  useTranscriptBtn.hidden = themeTranscriptFinal.trim().length === 0;
}

useTranscriptBtn.addEventListener("click", () => {
  const transcript = themeTranscriptFinal.trim();
  if (transcript) startThemeFromTranscript(transcript);
});

document.getElementById("theme-form").addEventListener("submit", e => {
  e.preventDefault();
  const theme = document.getElementById("theme-input").value.trim();
  if (theme) startTheme(theme);
});

async function startThemeFromTranscript(transcript){
  state.talkHistory = [];
  state.quizIndex = 0;
  state.quizScore = 0;
  document.getElementById("study-theme-tag").textContent = "テーマを抽出中…";
  document.getElementById("word-grid").innerHTML = "";
  document.getElementById("transcript-summary-card").hidden = true;
  document.getElementById("study-loader").hidden = false;
  document.getElementById("to-quiz-btn").hidden = true;
  goToView("study");

  try{
    const data = await callBackend("generateStudySetFromTranscript", { transcript }, 40000);
    state.theme = data.theme || "フリートーク";
    state.transcriptSummary = data.transcript_summary || "";
    state.words = data.words || [];
    state.quiz = data.quiz || [];
    document.getElementById("study-theme-tag").textContent = state.theme;
    renderTranscriptSummary();
    renderWordGrid();
    persistProgress();
  }catch(err){
    document.getElementById("word-grid").innerHTML =
      `<p style="color:var(--coral)">生成に失敗しました: ${escapeHtml(err.message)}</p>`;
  }finally{
    document.getElementById("study-loader").hidden = true;
  }
}

async function startTheme(theme){
  state.theme = theme;
  state.transcriptSummary = ""; // テキスト直接入力の場合は整理版なし
  state.talkHistory = [];
  state.quizIndex = 0;
  state.quizScore = 0;
  document.getElementById("study-theme-tag").textContent = theme;
  document.getElementById("word-grid").innerHTML = "";
  document.getElementById("transcript-summary-card").hidden = true;
  document.getElementById("study-loader").hidden = false;
  document.getElementById("to-quiz-btn").hidden = true;
  goToView("study");

  try{
    const data = await callBackend("generateStudySet", { theme }, 40000);
    state.words = data.words || [];
    state.quiz = data.quiz || [];
    renderWordGrid();
    persistProgress();
  }catch(err){
    document.getElementById("word-grid").innerHTML =
      `<p style="color:var(--coral)">生成に失敗しました: ${escapeHtml(err.message)}</p>`;
  }finally{
    document.getElementById("study-loader").hidden = true;
  }
}

function renderTranscriptSummary(){
  const card = document.getElementById("transcript-summary-card");
  if (state.transcriptSummary){
    document.getElementById("transcript-summary-text").textContent = state.transcriptSummary;
    card.hidden = false;
  } else {
    card.hidden = true;
  }
}

/* ---------- 進行中のテーマ・単語・四択を端末に保存し、どのステップからでも共有されるようにする ---------- */
function persistProgress(){
  try{
    localStorage.setItem("speakin3_progress", JSON.stringify({
      theme: state.theme,
      transcriptSummary: state.transcriptSummary,
      words: state.words,
      quiz: state.quiz
    }));
  }catch(e){ /* 保存できなくても致命的ではないので無視 */ }
}

function restoreProgress(){
  try{
    const raw = localStorage.getItem("speakin3_progress");
    if (!raw) return;
    const saved = JSON.parse(raw);
    if (saved && saved.theme && !state.theme){
      state.theme = saved.theme;
      state.transcriptSummary = saved.transcriptSummary || "";
      state.words = saved.words || [];
      state.quiz = saved.quiz || [];
      document.getElementById("study-theme-tag").textContent = state.theme;
      document.getElementById("normal-theme-tag").textContent = state.theme;
      renderTranscriptSummary();
      renderWordGrid();
    }
  }catch(e){ /* 壊れたデータは無視 */ }
}

function clearProgress(){
  localStorage.removeItem("speakin3_progress");
}

function renderWordGrid(){
  const grid = document.getElementById("word-grid");
  grid.innerHTML = state.words.map(w => `
    <div class="word-card">
      <div class="en">${escapeHtml(w.en)}</div>
      <div class="ja">${escapeHtml(w.ja)}</div>
      <div class="ex">${escapeHtml(w.example_en)}</div>
      <div class="ex-ja">${escapeHtml(w.example_ja)}</div>
    </div>
  `).join("");
  document.getElementById("to-quiz-btn").hidden = state.words.length === 0;
}
document.getElementById("to-quiz-btn").addEventListener("click", () => {
  goToView("quiz");
  renderQuizQuestion();
});

/* ============================================================
   STEP 3: 四択テスト
   ============================================================ */
function renderQuizQuestion(){
  const total = state.quiz.length;
  const i = state.quizIndex;
  document.getElementById("quiz-progress-text").textContent = `${i+1} / ${total}`;
  document.getElementById("quiz-bar-fill").style.width = `${(i/total)*100}%`;
  document.getElementById("to-normal-btn").hidden = true;

  const q = state.quiz[i];
  const card = document.getElementById("quiz-card");
  card.innerHTML = `<div class="q">${escapeHtml(q.question)}</div>` +
    q.choices.map((c, ci) => `<button class="quiz-opt" data-i="${ci}">${escapeHtml(c)}</button>`).join("");

  card.querySelectorAll(".quiz-opt").forEach(btn => {
    btn.addEventListener("click", () => {
      const chosen = Number(btn.dataset.i);
      card.querySelectorAll(".quiz-opt").forEach((b, ci) => {
        b.disabled = true;
        if (ci === q.answer) b.classList.add("correct");
        else if (ci === chosen) b.classList.add("wrong");
      });
      if (chosen === q.answer) state.quizScore++;
      setTimeout(() => {
        if (state.quizIndex + 1 < total){
          state.quizIndex++;
          renderQuizQuestion();
        } else {
          document.getElementById("quiz-bar-fill").style.width = "100%";
          document.getElementById("to-normal-btn").hidden = false;
          card.innerHTML = `<p>お疲れさま！ ${state.quizScore} / ${total} 問正解でした。</p>`;
        }
      }, 900);
    });
  });
}
document.getElementById("to-normal-btn").addEventListener("click", () => {
  document.getElementById("normal-theme-tag").textContent = state.theme;
  goToView("normal");
});

/* ============================================================
   STEP 4: 通常会話（時間制限内で自由に会話）
   ============================================================ */
let normalHistory = [];
let normalRecognizer = null;
let normalTimerInterval = null;
let normalStart = 0;
let normalDurationSec = 180;
let normalActive = false;
let normalTimeUp = false;

function formatMMSS(totalSec){
  const s = Math.max(0, Math.round(totalSec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

document.getElementById("normal-start-btn").addEventListener("click", () => {
  if (!state.theme){ alert("先にテーマを選んでください"); return; }
  normalDurationSec = Number(document.getElementById("normal-duration-select").value);
  normalTimeUp = false;
  normalActive = true;
  normalHistory = [];

  document.getElementById("normal-total").textContent = formatMMSS(normalDurationSec);
  document.getElementById("normal-elapsed").textContent = "0:00";
  document.getElementById("normal-bar-fill").style.width = "0%";
  document.getElementById("normal-log").innerHTML = "";
  document.getElementById("normal-you-line").textContent = "\u00A0";
  document.getElementById("normal-start-btn").hidden = true;
  document.getElementById("normal-duration-row").hidden = true;
  document.getElementById("to-talk-from-normal-btn").hidden = true;
  document.getElementById("restart-normal-btn").hidden = true;
  document.getElementById("normal-stage").hidden = false;

  normalStart = performance.now();
  normalTimerInterval = setInterval(updateNormalTimer, 250);
  startNormalConversation();
});

function updateNormalTimer(){
  const elapsed = (performance.now() - normalStart) / 1000;
  const remain = Math.max(0, normalDurationSec - elapsed);
  document.getElementById("normal-elapsed").textContent = formatMMSS(Math.min(elapsed, normalDurationSec));
  document.getElementById("normal-bar-fill").style.width = `${Math.min(100, (elapsed / normalDurationSec) * 100)}%`;
  if (remain <= 0 && normalActive){
    normalTimeUp = true;
    clearInterval(normalTimerInterval);
    if (normalRecognizer){ try{ normalRecognizer.stop(); }catch(e){} }
    synth && synth.cancel();
    endNormalConversation();
  }
}

async function startNormalConversation(){
  document.getElementById("normal-ai-line").textContent = "準備中…";
  try{
    const data = await callBackendWithRetry("normalChatReply",
      { theme: state.theme, history: [], context: state.transcriptSummary }, 0);
    await pushNormalAiLine(data.reply);
  }catch(err){
    await pushNormalAiLine(`Let's have a relaxed conversation about ${state.theme}. Tell me anything about it.`);
  }
}

function addNormalLogRow(role, text){
  const log = document.getElementById("normal-log");
  const row = document.createElement("div");
  row.className = "row " + role;
  row.textContent = (role === "ai" ? "AI: " : "あなた: ") + text;
  log.appendChild(row);
  log.scrollTop = log.scrollHeight;
}

async function pushNormalAiLine(text){
  document.getElementById("normal-ai-line").textContent = text;
  normalHistory.push({ role: "ai", text });
  addNormalLogRow("ai", text);
  await speak(text);
  if (normalTimeUp){ endNormalConversation(); return; }
  await settleAfterSpeak(); // 読み上げの残響がマイクに入らないよう少し待つ
  beginNormalListen();
}

function beginNormalListen(){
  if (!SpeechRecognition){
    document.getElementById("normal-you-line").textContent = "この端末は音声認識に対応していません。";
    return;
  }
  synth && synth.cancel(); // Android等でTTSが完全に止まっていない状態を防ぐ保険
  const indicator = document.getElementById("normal-mic-indicator");

  let handled = false;
  let accumulatedFinal = ""; // 複数文をまとめて蓄積する
  let lastActivity = performance.now();
  const SILENCE_END_MS = 1500; // 発話後、この時間無音が続いたら「話し終わった」とみなす
  let silenceCheckInterval = null;

  function finalizeTurn(){
    if (handled) return;
    handled = true;
    clearInterval(silenceCheckInterval);
    if (normalRecognizer){ try{ normalRecognizer.stop(); }catch(e){} } // 確定後は確実に聞き取りを止め、以降の誤発火を防ぐ
    const said = accumulatedFinal.trim();
    document.getElementById("normal-you-line").textContent = said;
    addNormalLogRow("you", said);
    normalHistory.push({ role: "you", text: said });
    indicator.classList.remove("listening");
    continueNormalConversation();
  }

  function createRecognizer(){
    const r = new SpeechRecognition();
    r.lang = "en-US";
    r.interimResults = true;
    r.continuous = true; // 話し始めてすぐ打ち切られないよう、区切らずに聞き続ける
    r.maxAlternatives = 1;

    r.onspeechstart = () => { lastActivity = performance.now(); };

    r.onresult = (e) => {
      if (handled) return;
      let hasActivity = false;
      for (let i = e.resultIndex; i < e.results.length; i++){
        const t = e.results[i][0].transcript;
        if (!t.trim()) continue;
        if (e.results[i].isFinal){
          const lastAi = normalHistory[normalHistory.length - 1];
          if (!accumulatedFinal && lastAi && lastAi.role === "ai" && isLikelyEcho(t, lastAi.text)){
            continue; // AI自身の音声を拾っただけの最初の一言は無視
          }
          accumulatedFinal += (accumulatedFinal ? " " : "") + t.trim();
        }
        hasActivity = true;
      }
      if (hasActivity) lastActivity = performance.now();
    };

    r.onerror = () => {}; // 一時的なエラーはonend側の再試行に任せる

    r.onend = () => {
      indicator.classList.remove("listening");
      if (handled || !normalActive || normalTimeUp) return;
      const silentFor = performance.now() - lastActivity;
      if (accumulatedFinal && silentFor > SILENCE_END_MS){
        finalizeTurn();
        return;
      }
      setTimeout(() => {
        if (handled || !normalActive || normalTimeUp) return;
        normalRecognizer = createRecognizer();
        try{ normalRecognizer.start(); indicator.classList.add("listening"); }catch(e){}
      }, 150);
    };
    return r;
  }

  normalRecognizer = createRecognizer();
  try{ normalRecognizer.start(); indicator.classList.add("listening"); }catch(e){}

  // 話し終えて一定時間（1.5秒）無音が続いたら、複数文が終わったとみなして確定する
  silenceCheckInterval = setInterval(() => {
    if (handled){ clearInterval(silenceCheckInterval); return; }
    if (accumulatedFinal && (performance.now() - lastActivity) > SILENCE_END_MS){
      finalizeTurn();
    }
  }, 200);
}

async function continueNormalConversation(){
  if (normalTimeUp){ endNormalConversation(); return; }
  try{
    const data = await callBackendWithRetry("normalChatReply",
      { theme: state.theme, history: normalHistory, context: state.transcriptSummary }, 1);
    await pushNormalAiLine(data.reply);
  }catch(err){
    await pushNormalAiLine("Sorry, could you say that again?");
  }
}

document.getElementById("normal-end-btn").addEventListener("click", () => {
  endNormalConversation();
});

function endNormalConversation(){
  normalActive = false;
  clearInterval(normalTimerInterval);
  if (normalRecognizer){ try{ normalRecognizer.stop(); }catch(e){} }
  synth && synth.cancel();
  document.getElementById("normal-mic-indicator").classList.remove("listening");
  document.getElementById("normal-ai-line").textContent = "お疲れさま！通常会話はここで終了です。";
  document.getElementById("to-talk-from-normal-btn").hidden = false;
  document.getElementById("restart-normal-btn").hidden = false;
}

document.getElementById("restart-normal-btn").addEventListener("click", () => {
  // 設定画面（会話時間の選択）に戻し、もう一度始められるようにする
  document.getElementById("normal-stage").hidden = true;
  document.getElementById("normal-start-btn").hidden = false;
  document.getElementById("normal-duration-row").hidden = false;
  document.getElementById("to-talk-from-normal-btn").hidden = true;
  document.getElementById("restart-normal-btn").hidden = true;
});

document.getElementById("to-talk-from-normal-btn").addEventListener("click", () => {
  goToView("talk");
  startConversation();
});

/* ============================================================
   STEP 5: 会話タイムアタック（Web Speech API）
   ============================================================ */
const synth = window.speechSynthesis;
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
let recognizer = null;
let countdownTimer = null;
let countdownStart = 0;
const RING_CIRC = 389.6;

function speak(text){
  return new Promise(resolve => {
    if (!synth){ resolve(); return; }
    synth.cancel();
    const utter = new SpeechSynthesisUtterance(text);
    utter.lang = "en-US";
    utter.onend = resolve;
    utter.onerror = resolve;
    synth.speak(utter);
  });
}

/** TTS終了直後は端末のスピーカー音がマイクに残っていることがあるため、少し待ってから聞き取りを始める */
/**
 * TTS終了直後は端末のスピーカー音がマイクに残っていたり、
 * 特にAndroid Chromeでは speechSynthesis の onend が実際の再生完了より早く
 * 発火することがあるため、synth.speaking/pending が収まったことも確認しつつ待つ。
 */
function settleAfterSpeak(){
  return new Promise(resolve => {
    const minWait = 700;
    const maxWait = 2200; // 保険：最大でもこれ以上は待たない
    const start = performance.now();
    function check(){
      const elapsed = performance.now() - start;
      const settled = synth && !synth.speaking && !synth.pending;
      if ((settled && elapsed >= minWait) || elapsed >= maxWait){
        resolve();
      } else {
        setTimeout(check, 100);
      }
    }
    check();
  });
}

/**
 * 認識結果がAI自身の直前の発言をマイクが拾ってしまった「エコー」かどうかを簡易判定する。
 * ハウリング対策：スピーカー音声が別の音声認識に混入するのを防ぐ。
 */
function isLikelyEcho(userText, aiText){
  const norm = s => String(s || "").toLowerCase().replace(/[^a-z0-9 ]/g, "").trim();
  const u = norm(userText);
  const a = norm(aiText);
  if (!u) return true; // 空はエコー扱いで無視
  if (u.length < 3) return false; // 短すぎる発話は判定しない（誤検知防止）
  return a.includes(u) || u.includes(a);
}

async function startConversation(){
  document.getElementById("talk-theme-tag").textContent = state.theme;
  document.getElementById("wait-time-label").textContent = RESPONSE_LIMIT_SEC + "秒";
  document.getElementById("talk-log").innerHTML = "";
  document.getElementById("you-line").textContent = "\u00A0";
  document.getElementById("ai-line").textContent = "準備中…";
  try{
    const data = await callBackendWithRetry("chatReply",
      { theme: state.theme, history: [], context: state.transcriptSummary }, 0);
    await pushAiLine(data.reply);
  }catch(err){
    await pushAiLine(`Let's talk about ${state.theme}. Are you ready?`);
  }
}

async function pushAiLine(text){
  document.getElementById("ai-line").textContent = text;
  state.talkHistory.push({ role: "ai", text });
  addLogRow("ai", text);
  await speak(text);
  await settleAfterSpeak(); // 読み上げの残響がマイクに入らないよう少し待つ
  beginListenWindow();
}

function addLogRow(role, text){
  const log = document.getElementById("talk-log");
  const row = document.createElement("div");
  row.className = "row " + role;
  row.textContent = (role === "ai" ? "AI: " : role === "you" ? "あなた: " : "⏱ タイムオーバー: ") + text;
  log.appendChild(row);
  log.scrollTop = log.scrollHeight;
}

function beginListenWindow(){
  if (!SpeechRecognition){
    document.getElementById("you-line").textContent = "この端末は音声認識に対応していません。";
    return;
  }
  synth && synth.cancel(); // Android等でTTSが完全に止まっていない状態を防ぐ保険
  countdownStart = performance.now();
  const ring = document.getElementById("ring-progress");
  const numEl = document.getElementById("timer-num");
  ring.style.strokeDashoffset = "0";

  let handled = false;
  let speechStarted = false; // 話し始めたら打ち切らず、話し終わるまで待つ
  let accumulatedFinal = ""; // 複数文をまとめて蓄積する
  let lastActivity = 0; // 直近の発話（確定/途中）があった時刻
  const GRACE_EXTRA_SEC = 8; // 話し始めた後に追加で待つ最大秒数（複数文に対応するため長め）
  const SILENCE_END_MS = 1500; // 発話後、この時間無音が続いたら「話し終わった」とみなす

  function finalizeTurn(){
    if (handled) return;
    handled = true;
    clearInterval(countdownTimer);
    if (recognizer){ try{ recognizer.stop(); }catch(e){} }
    const said = accumulatedFinal.trim();
    document.getElementById("you-line").textContent = said;
    addLogRow("you", said);
    state.talkHistory.push({ role: "you", text: said });
    document.getElementById("mic-btn").classList.remove("listening");
    continueConversation();
  }

  function createRecognizer(){
    const r = new SpeechRecognition();
    r.lang = "en-US";
    r.interimResults = true;
    r.continuous = true; // 話し始めてすぐ打ち切られないよう、区切らずに聞き続ける
    r.maxAlternatives = 1;

    r.onspeechstart = () => { speechStarted = true; lastActivity = performance.now(); };

    r.onresult = (e) => {
      let hasActivity = false;
      for (let i = e.resultIndex; i < e.results.length; i++){
        const t = e.results[i][0].transcript;
        if (!t.trim()) continue;
        if (e.results[i].isFinal){
          const lastAi = state.talkHistory[state.talkHistory.length - 1];
          if (!accumulatedFinal && lastAi && lastAi.role === "ai" && isLikelyEcho(t, lastAi.text)){
            continue; // AI自身の音声を拾っただけの最初の一言は無視
          }
          accumulatedFinal += (accumulatedFinal ? " " : "") + t.trim();
        }
        hasActivity = true;
      }
      if (hasActivity){ speechStarted = true; lastActivity = performance.now(); }
    };

    // no-speech等の一時的なエラーでは即タイムアウトにせず、onend側の再試行に任せる
    r.onerror = () => {};

    r.onend = () => {
      document.getElementById("mic-btn").classList.remove("listening");
      if (handled) return;
      const elapsed = (performance.now() - countdownStart) / 1000;
      const limit = speechStarted ? RESPONSE_LIMIT_SEC + GRACE_EXTRA_SEC : RESPONSE_LIMIT_SEC;
      const silentFor = performance.now() - lastActivity;
      if (accumulatedFinal && speechStarted && silentFor > SILENCE_END_MS){
        finalizeTurn(); // 十分な沈黙があり、既に何か話しているのでここで確定
        return;
      }
      if (elapsed < limit){
        // まだ制限時間内（話し始めていれば延長分も含む）なので聞き直す。
        // 直前のマイクセッションが完全に終わるよう少し間を空けてから再起動する（失敗防止）。
        setTimeout(() => {
          if (handled) return;
          recognizer = createRecognizer();
          try{ recognizer.start(); document.getElementById("mic-btn").classList.add("listening"); }catch(e){}
        }, 150);
      }
      // 時間切れの場合はcountdownTimer側で処理される
    };
    return r;
  }

  recognizer = createRecognizer();
  try{ recognizer.start(); document.getElementById("mic-btn").classList.add("listening"); }
  catch(e){ /* already started */ }

  countdownTimer = setInterval(() => {
    const elapsed = (performance.now() - countdownStart) / 1000;
    const limit = speechStarted ? RESPONSE_LIMIT_SEC + GRACE_EXTRA_SEC : RESPONSE_LIMIT_SEC;
    const remain = Math.max(0, limit - elapsed);

    if (!speechStarted){
      numEl.textContent = remain.toFixed(1);
      ring.style.strokeDashoffset = String(RING_CIRC * (1 - remain / RESPONSE_LIMIT_SEC));
    } else {
      numEl.textContent = "…";
      ring.style.strokeDashoffset = "0"; // 話し始めた後はリングを満タン表示のまま維持

      // 話し終えて一定時間（1.5秒）無音が続いたら、複数文が終わったとみなして確定する
      if (accumulatedFinal && (performance.now() - lastActivity) > SILENCE_END_MS){
        finalizeTurn();
        return;
      }
    }

    if (remain <= 0){
      clearInterval(countdownTimer);
      if (handled) return;
      if (accumulatedFinal.trim()){
        finalizeTurn();
      } else {
        handled = true;
        try{ recognizer.stop(); }catch(e){}
        onTimeout();
      }
    }
  }, 80);
}

function onTimeout(){
  document.getElementById("you-line").textContent = "（時間切れ）";
  addLogRow("timeout", "3秒以内に応答できませんでした");
  state.talkHistory.push({ role: "you", text: "(no response — timed out)", timedOut: true });
  continueConversation();
}

async function continueConversation(){
  if (state.talkHistory.filter(h => h.role === "ai").length >= 6){
    // 6往復ほどで自然に会話を終える
    await pushAiLineNoListen("Great talking with you! Let's wrap up here.");
    return;
  }
  try{
    const data = await callBackendWithRetry("chatReply", {
      theme: state.theme,
      history: state.talkHistory,
      context: state.transcriptSummary
    }, 1);
    await pushAiLine(data.reply);
  }catch(err){
    // Geminiが一時的に混雑していても会話を止めない
    await pushAiLine("Sorry, could you say that again?");
  }
}

async function callBackendWithRetry(action, payload, retries){
  try{
    return await callBackend(action, payload);
  }catch(err){
    if (retries > 0){
      await new Promise(r => setTimeout(r, 900));
      return callBackendWithRetry(action, payload, retries - 1);
    }
    throw err;
  }
}
async function pushAiLineNoListen(text){
  document.getElementById("ai-line").textContent = text;
  state.talkHistory.push({ role: "ai", text });
  addLogRow("ai", text);
  await speak(text);
}

document.getElementById("end-talk-btn").addEventListener("click", () => {
  clearInterval(countdownTimer);
  if (recognizer){ try{ recognizer.stop(); }catch(e){} }
  synth && synth.cancel();
  goToView("review");
  runEvaluation();
});

/* ============================================================
   STEP 5: ふりかえり
   ============================================================ */
async function runEvaluation(){
  document.getElementById("review-loader").hidden = false;
  document.getElementById("review-card").hidden = true;
  try{
    const data = await callBackend("evaluateConversation", {
      theme: state.theme,
      history: state.talkHistory,
      quizScore: state.quizScore,
      quizTotal: state.quiz.length
    }, 40000);
    renderReview(data);

    // ログをスプレッドシート＋Driveに保存（単語・四択・整理済みの話した内容も含めて後で再利用できるようにする）
    callBackend("saveLog", {
      theme: state.theme,
      transcriptSummary: state.transcriptSummary,
      words: state.words,
      quiz: state.quiz,
      history: state.talkHistory,
      quizScore: state.quizScore,
      quizTotal: state.quiz.length,
      evaluation: data
    }).catch(() => { /* 保存失敗は画面表示をブロックしない */ });

  }catch(err){
    document.getElementById("review-card").hidden = false;
    document.getElementById("review-summary").textContent = "評価の取得に失敗しました: " + err.message;
  }finally{
    document.getElementById("review-loader").hidden = true;
  }
}

function renderReview(data){
  document.getElementById("score-badge").textContent = data.score ?? "--";
  document.getElementById("review-grammar").textContent = data.grammar_feedback || "";
  document.getElementById("review-natural").innerHTML =
    (data.natural_expressions || []).map(x => `<li>${escapeHtml(x)}</li>`).join("");
  document.getElementById("review-summary").textContent = data.summary || "";

  const transcriptBlock = document.getElementById("review-transcript-block");
  if (state.transcriptSummary){
    document.getElementById("review-transcript-text").textContent = state.transcriptSummary;
    transcriptBlock.hidden = false;
  } else {
    transcriptBlock.hidden = true;
  }

  document.getElementById("review-card").hidden = false;
}

document.getElementById("restart-btn").addEventListener("click", () => {
  document.getElementById("theme-input").value = "";
  state.theme = "";
  state.transcriptSummary = "";
  state.words = [];
  state.quiz = [];
  clearProgress();
  goToView("theme");
});

/* ============================================================
   過去の記録から選ぶ
   ============================================================ */
document.getElementById("show-past-btn").addEventListener("click", togglePastList);

async function togglePastList(){
  const listEl = document.getElementById("past-list");
  if (!listEl.hidden){ listEl.hidden = true; return; }
  listEl.hidden = false;
  await refreshPastList();
}

async function refreshPastList(){
  const listEl = document.getElementById("past-list");
  listEl.innerHTML = `<p class="past-loading">読み込み中…</p>`;
  try{
    const data = await callBackend("listSessions", {});
    renderPastList(data.sessions || []);
  }catch(err){
    listEl.innerHTML = `<p style="color:var(--coral)">読み込みに失敗しました: ${escapeHtml(err.message)}</p>`;
  }
}

function renderPastList(sessions){
  const listEl = document.getElementById("past-list");
  if (sessions.length === 0){
    listEl.innerHTML = `<p class="past-empty">まだ記録がありません。</p>`;
    return;
  }
  listEl.innerHTML = sessions.map(s => `
    <div class="past-item">
      <div class="past-item-head">
        <span class="past-date">${escapeHtml(s.date)}</span>
        <span class="past-score">${s.score !== "" && s.score != null ? s.score + "点" : "-"}</span>
      </div>
      <div class="past-theme">${escapeHtml(s.theme)}</div>
      <div class="past-actions">
        <button class="chip" data-action="reuse" data-index="${s.index}">もう一度話す</button>
        <button class="chip" data-action="view" data-index="${s.index}">評価を見る</button>
        <button class="chip" data-action="edit" data-index="${s.index}" data-theme="${escapeHtml(s.theme)}">編集</button>
        <button class="chip" data-action="delete" data-index="${s.index}">削除</button>
      </div>
    </div>
  `).join("");
  listEl.querySelectorAll(".chip[data-action]").forEach(btn => {
    btn.addEventListener("click", () => {
      const action = btn.dataset.action;
      const index = Number(btn.dataset.index);
      if (action === "edit") openEditThemeModal(index, btn.dataset.theme);
      else if (action === "delete") deletePastSession(index);
      else handlePastAction(action, index);
    });
  });
}

function openEditThemeModal(index, currentTheme){
  openModal(`
    <h3>テーマを編集</h3>
    <div class="field">
      <input type="text" id="modal-theme-edit" value="${escapeHtml(currentTheme)}" maxlength="40">
    </div>
    <p class="auth-msg" id="modal-msg"></p>
    <div class="modal-actions">
      <button class="btn-secondary" id="modal-cancel">キャンセル</button>
      <button class="btn-primary" id="modal-save">保存</button>
    </div>
  `);
  document.getElementById("modal-cancel").addEventListener("click", closeModal);
  document.getElementById("modal-save").addEventListener("click", async () => {
    const newTheme = document.getElementById("modal-theme-edit").value.trim();
    if (!newTheme){ showAuthMsg("modal-msg", "テーマを入力してください"); return; }
    try{
      await callBackend("updateSessionTheme", { index, newTheme });
      closeModal();
      refreshPastList();
    }catch(err){
      showAuthMsg("modal-msg", err.message);
    }
  });
}

async function deletePastSession(index){
  if (!confirm("この記録を削除しますか？元に戻せません。")) return;
  try{
    await callBackend("deleteSession", { index });
    refreshPastList();
  }catch(err){
    alert("削除に失敗しました: " + err.message);
  }
}

async function handlePastAction(action, rowIndex){
  try{
    const data = await callBackend("loadSession", { index: rowIndex });
    const s = data.session;
    if (!s) throw new Error("記録の詳細データが見つかりませんでした");

    state.theme = s.theme || "";
    state.transcriptSummary = s.transcriptSummary || "";
    state.words = s.words || [];
    state.quiz = s.quiz || [];
    state.quizIndex = 0;
    state.quizScore = s.quizScore || 0;
    state.talkHistory = s.history || [];

    if (action === "reuse"){
      // 単語・例文・四択は保存済みデータをそのまま使う（AIを再度呼ばないのでクォータも節約できる）
      document.getElementById("study-theme-tag").textContent = state.theme + "（過去の記録）";
      renderTranscriptSummary();
      renderWordGrid();
      persistProgress();
      goToView("study");
    } else {
      goToView("review");
      renderReview(s.evaluation || {});
    }
  }catch(err){
    alert("読み込みに失敗しました: " + err.message);
  }
}

/* ---------- utility ---------- */
function escapeHtml(str){
  return String(str ?? "").replace(/[&<>"']/g, c => ({
    "&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"
  }[c]));
}
