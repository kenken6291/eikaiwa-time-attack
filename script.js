/* ============================================================
   Speak in 3 — フロントエンド
   GASウェブアプリのURLをここに設定してください
   ============================================================ */
const GAS_URL = "https://script.google.com/macros/s/AKfycbwaIg_BJ5AP_rAwYknfQY69pyssjs90YAohZMo8daOjtNQzE1IH6PY-gKGrGYSSS0619Q/exec";
const RESPONSE_LIMIT_SEC = 3; // タイムアタックの制限時間（秒）

let state = {
  theme: "",
  words: [],
  quiz: [],
  quizIndex: 0,
  quizScore: 0,
  talkHistory: [], // { role: 'ai'|'you', text: string, timedOut?: bool }
  sessionId: null
};

/* ---------- 画面遷移 ---------- */
const STEP_ORDER = ["theme","study","quiz","talk","review"];
function goToView(step){
  document.querySelectorAll(".view").forEach(v => v.classList.remove("active"));
  document.getElementById("view-" + step).classList.add("active");
  const idx = STEP_ORDER.indexOf(step);
  document.querySelectorAll("#stepper li").forEach((li,i) => {
    li.classList.toggle("active", i === idx);
    li.classList.toggle("done", i < idx);
  });
}

/* ---------- GAS呼び出し（text/plainでPOSTしCORSを回避）---------- */
async function callBackend(action, payload){
  const res = await fetch(GAS_URL, {
    method: "POST",
    headers: { "Content-Type": "text/plain" },
    body: JSON.stringify({ action, ...payload })
  });
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
  document.getElementById("study-loader").hidden = false;
  document.getElementById("to-quiz-btn").hidden = true;
  goToView("study");

  try{
    const data = await callBackend("generateStudySetFromTranscript", { transcript });
    state.theme = data.theme || "フリートーク";
    state.words = data.words || [];
    state.quiz = data.quiz || [];
    document.getElementById("study-theme-tag").textContent = state.theme;
    renderWordGrid();
  }catch(err){
    document.getElementById("word-grid").innerHTML =
      `<p style="color:var(--coral)">生成に失敗しました: ${escapeHtml(err.message)}</p>`;
  }finally{
    document.getElementById("study-loader").hidden = true;
  }
}

async function startTheme(theme){
  state.theme = theme;
  state.talkHistory = [];
  state.quizIndex = 0;
  state.quizScore = 0;
  document.getElementById("study-theme-tag").textContent = theme;
  document.getElementById("word-grid").innerHTML = "";
  document.getElementById("study-loader").hidden = false;
  document.getElementById("to-quiz-btn").hidden = true;
  goToView("study");

  try{
    const data = await callBackend("generateStudySet", { theme });
    state.words = data.words || [];
    state.quiz = data.quiz || [];
    renderWordGrid();
  }catch(err){
    document.getElementById("word-grid").innerHTML =
      `<p style="color:var(--coral)">生成に失敗しました: ${escapeHtml(err.message)}</p>`;
  }finally{
    document.getElementById("study-loader").hidden = true;
  }
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
  document.getElementById("to-talk-btn").hidden = true;

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
          document.getElementById("to-talk-btn").hidden = false;
          card.innerHTML = `<p>お疲れさま！ ${state.quizScore} / ${total} 問正解でした。</p>`;
        }
      }, 900);
    });
  });
}
document.getElementById("to-talk-btn").addEventListener("click", () => {
  goToView("talk");
  startConversation();
});

/* ============================================================
   STEP 4: 会話タイムアタック（Web Speech API）
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

async function startConversation(){
  document.getElementById("talk-log").innerHTML = "";
  document.getElementById("you-line").textContent = "\u00A0";
  const opener = `Let's talk about ${state.theme}. Are you ready?`;
  await pushAiLine(opener);
}

async function pushAiLine(text){
  document.getElementById("ai-line").textContent = text;
  state.talkHistory.push({ role: "ai", text });
  addLogRow("ai", text);
  await speak(text);
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
  countdownStart = performance.now();
  const ring = document.getElementById("ring-progress");
  const numEl = document.getElementById("timer-num");
  ring.style.strokeDashoffset = "0";

  recognizer = new SpeechRecognition();
  recognizer.lang = "en-US";
  recognizer.interimResults = false;
  recognizer.maxAlternatives = 1;
  let handled = false;

  recognizer.onresult = (e) => {
    if (handled) return;
    handled = true;
    clearInterval(countdownTimer);
    const said = e.results[0][0].transcript;
    document.getElementById("you-line").textContent = said;
    addLogRow("you", said);
    state.talkHistory.push({ role: "you", text: said });
    document.getElementById("mic-btn").classList.remove("listening");
    continueConversation();
  };
  recognizer.onerror = () => { if (!handled){ handled = true; onTimeout(); } };
  recognizer.onend = () => {
    document.getElementById("mic-btn").classList.remove("listening");
  };

  try{ recognizer.start(); document.getElementById("mic-btn").classList.add("listening"); }
  catch(e){ /* already started */ }

  countdownTimer = setInterval(() => {
    const elapsed = (performance.now() - countdownStart) / 1000;
    const remain = Math.max(0, RESPONSE_LIMIT_SEC - elapsed);
    numEl.textContent = remain.toFixed(1);
    ring.style.strokeDashoffset = String(RING_CIRC * (1 - remain / RESPONSE_LIMIT_SEC));
    if (remain <= 0){
      clearInterval(countdownTimer);
      if (!handled){ handled = true; try{ recognizer.stop(); }catch(e){} onTimeout(); }
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
      history: state.talkHistory
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
    });
    document.getElementById("score-badge").textContent = data.score;
    document.getElementById("review-grammar").textContent = data.grammar_feedback;
    document.getElementById("review-natural").innerHTML =
      (data.natural_expressions || []).map(x => `<li>${escapeHtml(x)}</li>`).join("");
    document.getElementById("review-summary").textContent = data.summary;
    document.getElementById("review-card").hidden = false;

    // ログをスプレッドシート＋Driveに保存
    callBackend("saveLog", {
      theme: state.theme,
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

document.getElementById("restart-btn").addEventListener("click", () => {
  document.getElementById("theme-input").value = "";
  goToView("theme");
});

/* ---------- utility ---------- */
function escapeHtml(str){
  return String(str ?? "").replace(/[&<>"']/g, c => ({
    "&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"
  }[c]));
}
