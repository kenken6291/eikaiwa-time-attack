/* ============================================================
   Speak in 3 — フロントエンド（多言語＋話し相手アバター対応）
   ※ partner.js を先に読み込むこと
   GASウェブアプリのURLは config.js で設定してください
   ============================================================ */
/** フロントエンドのバージョン — ファイルを更新したらここも更新する */
const APP_VERSION = "2.5.0";
/** この画面が必要とするサーバー（GAS）の最低バージョン。これより古いときだけ警告する */
const REQUIRED_SERVER_VERSION = "2.5.0";
const APP_UPDATED = "2026-10-26";

const GAS_URL = String(window.GAS_URL || "");
function gasUrlMissing(){ return !GAS_URL || GAS_URL.includes("XXXX"); }
let RESPONSE_LIMIT_SEC = 3; // タイムアタックの制限時間（秒）— 画面上のセレクトで変更可能

document.getElementById("wait-time-select").addEventListener("change", (e) => {
  RESPONSE_LIMIT_SEC = Number(e.target.value);
});

/* ============================================================
   会員認証
   ============================================================ */
let auth = { sessionToken: null, nickname: null };

function rawCallBackend(action, payload){
  if (gasUrlMissing()) return Promise.reject(new Error("config.js の GAS_URL を設定してください"));
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
  setLang(state.lang);
  Partner.refresh().then(() => Partner.load(state.lang)).catch(() => {}); // マイ／みんなの話し相手を読み込む
  // 初めてログインした端末では、使い方を自動で表示する
  let seen = null;
  try{ seen = localStorage.getItem(HELP_SEEN_KEY); }catch(e){}
  if (!seen) setTimeout(openHelp, 400);
}

function logout(){
  if (auth.sessionToken) rawCallBackend("logout", { sessionToken: auth.sessionToken }).catch(() => {});
  auth = { sessionToken: null, nickname: null };
  localStorage.removeItem("speakin3_session");
  clearProgress();
  Partner.reset();
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
document.getElementById("menu-partner-btn").addEventListener("click", () => {
  document.getElementById("account-menu").hidden = true;
  Partner.openPicker();
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
  const card = document.getElementById("modal-card");
  const wasPartner = !!document.getElementById("pm-root");
  document.getElementById("modal-overlay").hidden = true;
  card.innerHTML = "";
  card.classList.remove("wide");
  if (wasPartner) Partner.onModalClosed();
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

if (gasUrlMissing()) showAuthMsg("login-msg", "config.js の GAS_URL を設定してください");

/* ============================================================
   バージョン情報（画面＋サーバー）
   ============================================================ */
let serverVersion = null; // { version, updated, model } / 取得失敗時は { error }

/** "2.10.0" と "2.9.1" のようなバージョン番号を比べる（a<b なら負） */
function compareVersion(a, b){
  const pa = String(a || "0").split(".").map(Number), pb = String(b || "0").split(".").map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++){
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d) return d;
  }
  return 0;
}
function serverTooOld(){
  return !!(serverVersion && !serverVersion.error && compareVersion(serverVersion.version, REQUIRED_SERVER_VERSION) < 0);
}

function versionText(){
  const app = `画面 v${APP_VERSION}（${APP_UPDATED}）`;
  let srv = "サーバー 確認中…";
  if (serverVersion){
    srv = serverVersion.error ? "サーバー 不明（旧版の可能性）" : `サーバー v${serverVersion.version}（${serverVersion.updated}）`;
  }
  return `${app} ／ ${srv}`;
}
function renderVersion(){
  document.querySelectorAll("[data-version]").forEach(el => {
    el.textContent = versionText();
    const mismatch = serverTooOld();
    el.classList.toggle("warn", !!(mismatch || (serverVersion && serverVersion.error)));
    el.title = mismatch ? `サーバーが古いです（v${REQUIRED_SERVER_VERSION}以上が必要）。GASを新バージョンでデプロイしてください。` : "";
  });
}
async function loadServerVersion(){
  renderVersion();
  if (gasUrlMissing()) return;
  try{
    const data = await rawCallBackend("getVersion", {});
    serverVersion = data.version ? data : { error: true };
  }catch(err){
    serverVersion = { error: true };
  }
  renderVersion();
}
function openVersionModal(){
  const s = serverVersion || {};
  const mismatch = serverTooOld();
  openModal(`
    <h3>バージョン情報</h3>
    <table class="version-table">
      <tr><th>アプリ</th><td>Speak in 3</td></tr>
      <tr><th>画面</th><td>v${escapeHtml(APP_VERSION)}（${escapeHtml(APP_UPDATED)}）</td></tr>
      <tr><th>サーバー</th><td>${s.version ? `v${escapeHtml(s.version)}（${escapeHtml(s.updated || "")}）` : (s.error ? "取得できません（GASが旧版の可能性）" : "確認中…")}</td></tr>
      ${s.model ? `<tr><th>AIモデル</th><td>${escapeHtml(s.model)}</td></tr>` : ""}
      <tr><th>対応言語</th><td>${LANG_ORDER.map(c => LANGS[c].flag + " " + LANGS[c].label).join("、")}</td></tr>
    </table>
    ${mismatch ? `<p class="auth-msg">サーバーが古いです（v${escapeHtml(REQUIRED_SERVER_VERSION)}以上が必要）。GASを「新バージョン」でデプロイしたか確認してください。</p>` : ""}
    <div class="modal-actions"><button class="btn-primary" id="modal-cancel">閉じる</button></div>
  `);
  document.getElementById("modal-cancel").addEventListener("click", closeModal);
}
/* ============================================================
   使い方
   ============================================================ */
const HELP_SEEN_KEY = "speakin3_help_seen";

function helpHTML(){
  return `
    <h3>使い方</h3>
    <p class="help-lead">Speak in 3 は、日本語で話した話題から外国語の教材を作り、写真の話し相手と会話して練習するアプリです。上から順に進めれば大丈夫です。</p>

    <details class="help-sec" open>
      <summary>① 練習の流れ（6ステップ）</summary>
      <ol class="help-steps">
        <li><b>テーマ</b>：「練習する言語」を選び、マイクを押して日本語で自由に話します（最大3分）。もう一度押すと終了。「この内容でAIに教材を作らせる」を押します。話すのが苦手なら、下の欄にテーマ（例：カフェでの注文）を入力してもOKです。</li>
        <li><b>単語・例文</b>：AIが選んだ言語の単語6個と例文を作ります。🔊で発音を聞けます。</li>
        <li><b>四択テスト</b>：5問のクイズで単語を確認します。</li>
        <li><b>通常会話</b>：会話時間（1〜10分）を選び、話し相手とのんびり会話します。話し相手が話し終わったら、マイクに向かって答えてください。少し黙ると「話し終わった」と判断されます。</li>
        <li><b>タイムアタック会話</b>：話し相手の質問に、決めた秒数（標準3秒）以内に答え始める練習です。間に合わないと話し相手が困り顔になり、やさしく言い直してくれます。下のボタンで「前へ戻る（同じ質問をもう一度）」「次へ進む（スキップ）」「最初から」ができます。</li>
        <li><b>ふりかえり</b>：AIが点数・文法・より自然な言い方・まとめを日本語で教えてくれます。記録は自動で保存されます。</li>
      </ol>
      <p class="help-tip">上の「テーマ／単語・例文／…」のボタンを押すと、好きなステップへ移動できます。</p>
    </details>

    <details class="help-sec">
      <summary>② 言語の選び方</summary>
      <p>テーマ画面の「練習する言語」で、${LANG_ORDER.map(c => LANGS[c].flag + LANGS[c].label).join("・")}から選べます。教材を作ったあとに言語を変えると、会話は新しい言語になりますが、単語・例文は前の言語のままです。新しい言語の教材にしたいときは、テーマをもう一度話すか入力してください。</p>
      <p>「応答までの待ち時間」で、タイムアタックの制限時間（1〜8秒）を変えられます。慣れないうちは5秒や8秒がおすすめです。</p>
    </details>

    <details class="help-sec">
      <summary>③ 話し相手を切り替える</summary>
      <p>テーマ画面の「切り替え・設定」、会話画面の⚙、または右上のメニュー「話し相手の切り替え・設定」を押すと、話し相手を選べます。</p>
      <ul>
        <li><b>標準</b>：イラストの話し相手です。言語ごとに名前と色が変わります。</li>
        <li><b>マイ話し相手</b>：あなただけが使える話し相手を10人まで登録できます。どの端末からログインしても使えます。</li>
        <li><b>みんなの話し相手</b>：管理者が用意した、全員が使える話し相手（10人まで）です。</li>
      </ul>
      <p>使いたい話し相手の写真をタップすると切り替わります（✓が付きます）。</p>
    </details>

    <details class="help-sec">
      <summary>④ 話し相手を作る（写真・詳細設定）</summary>
      <ol class="help-steps">
        <li>「マイ話し相手」で「＋新しく追加」を押します。</li>
        <li>名前を入力します（会話の中でもこの名前を名乗ります）。</li>
        <li>写真の枠（＋）を押して写真を選びます。表情は「普通・笑顔・困り顔・驚き」、それぞれに「顔・瞬き・しゃべり」の3枚、合計12枚まで登録できます。</li>
        <li>「詳細設定」で、性別・年代・性格・話し方・会話の難しさ・出身・趣味・プロフィール・話す速さ・声の高さ・声を決めて「詳細設定を保存」を押します。</li>
        <li>「この話し相手を使う」を押せば完了です。「試しに話す」で動きと声を確認できます。</li>
      </ol>
      <p class="help-tip">あとから変更するときは、「話し相手を選ぶ」画面で話し相手の ✎、または下の「⚙ 詳細設定」を押します。</p>
      <ul>
        <li><b>顔</b>＝目を開けて口を閉じた写真、<b>瞬き</b>＝目を閉じた写真、<b>しゃべり</b>＝口を開けた写真です。</li>
        <li>最低限「普通」の「顔」が1枚あれば動きます。足りない表情は「普通」の写真で代用します。</li>
        <li>写真は正方形に切り抜かれます。スマホを固定して、同じ位置・同じ明るさで続けて撮ると、切り替えが自然になります。</li>
        <li>「まとめて選ぶ」では、ファイル名で自動的に振り分けます（例：neutral.jpg／neutral_blink.jpg／joy_talk.jpg／困り顔_瞬き.jpg）。</li>
        <li>人物の写真は、本人の了解を得たものを使ってください。</li>
      </ul>
    </details>

    <details class="help-sec">
      <summary>⑤ 声の設定（端末の声／Geminiの声）</summary>
      <p>テーマ画面の「読み上げの声」で選べます。</p>
      <ul>
        <li><b>端末の声</b>：スマホやパソコンに入っている声です。すぐに読み上げますが、言語によっては機械的な声になります。</li>
        <li><b>Geminiの声</b>：AIが作る、人に近い自然な声です。表情（笑顔・困り顔など）に合わせて話し方も変わります。作るのに数秒かかり、うまく作れないときは自動で端末の声に切り替わります。</li>
      </ul>
      <p>Geminiの声は、話し相手の詳細設定の「Geminiの声」で30種類から選べます（「自動」は性別に合わせます）。話す速さ・声の高さの設定も、だいたいの雰囲気として反映されます。</p>
      <p>話し相手の編集画面の「声」で、いま練習している言語の声を選べます（話し相手ごと・言語ごと・端末ごとに覚えます）。</p>
      <p>「声が見つかりません」と出たときは、端末にその言語の読み上げ音声がありません。</p>
      <ul>
        <li><b>Android</b>：設定 →（システム →）言語と入力 → テキスト読み上げ → Google音声サービスの設定で、言語の音声データをインストール</li>
        <li><b>iPhone</b>：設定 → アクセシビリティ → 読み上げコンテンツ → 声 から言語を追加</li>
        <li><b>Windows</b>：設定 → 時刻と言語 → 音声認識（または言語）で、その言語の音声を追加</li>
      </ul>
    </details>

    <details class="help-sec">
      <summary>⑥ 過去の記録</summary>
      <p>テーマ画面の「過去の記録から選ぶ」で、これまでの練習（国旗で言語がわかります）を見られます。「もう一度話す」で同じ単語・例文から練習し直し、「評価を見る」でふりかえりを表示、「編集」でテーマ名の変更、「削除」で記録の削除ができます。記録はあなたにだけ表示されます。</p>
    </details>

    <details class="help-sec">
      <summary>⑦ うまくいかないとき</summary>
      <ul>
        <li><b>マイクが反応しない</b>：ブラウザのマイク許可を確認してください。音声認識は Chrome（Android・パソコン）や Safari（iPhone）で使えます。</li>
        <li><b>自分の声ではなく話し相手の声を拾ってしまう</b>：イヤホンを使うと安定します。</li>
        <li><b>写真が表示されない</b>：通信が遅いと時間がかかります。少し待つか、話し相手を選び直してください。</li>
        <li><b>「タイムアウト」「混雑」と出る</b>：AIが混み合っています。少し待ってからもう一度お試しください。</li>
        <li><b>Geminiの声が鳴らない</b>：一度画面をタップしてから始めてください（ブラウザが自動再生を止めることがあります）。マナーモード・音量も確認してください。</li>
        <li><b>画面下のバージョン表示が赤い</b>：サーバー側が古い可能性があります。管理者にお知らせください。</li>
      </ul>
    </details>

    <div class="modal-actions"><button class="btn-primary" id="help-close">閉じる</button></div>
  `;
}

function openHelp(){
  openModal(helpHTML());
  document.getElementById("modal-card").classList.add("wide");
  document.getElementById("help-close").addEventListener("click", closeModal);
  try{ localStorage.setItem(HELP_SEEN_KEY, "1"); }catch(e){}
}

document.getElementById("menu-help-btn").addEventListener("click", () => {
  document.getElementById("account-menu").hidden = true;
  openHelp();
});
document.querySelectorAll("[data-open-help]").forEach(b => b.addEventListener("click", openHelp));

document.getElementById("menu-version-btn").addEventListener("click", () => {
  document.getElementById("account-menu").hidden = true;
  openVersionModal();
});
document.querySelectorAll("[data-version]").forEach(el => el.addEventListener("click", openVersionModal));
loadServerVersion();

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

const LANG_KEY = "speakin3_lang";
let state = {
  lang: (() => { try{ return localStorage.getItem(LANG_KEY) || "en"; }catch(e){ return "en"; } })(), // 練習する言語（会話・読み上げ・音声認識）
  materialLang: "",    // 単語・例文・四択を作ったときの言語
  theme: "",
  transcriptSummary: "", // 音声フリートークを整理した文章（テキスト入力テーマの場合は空）
  words: [],
  quiz: [],
  quizIndex: 0,
  quizScore: 0,
  talkHistory: [], // { role: 'ai'|'you', text: string, timedOut?: bool }
  sessionId: null
};

/* ============================================================
   言語の切り替え ＆ 話し相手アバター
   ============================================================ */
const langSelect = document.getElementById("lang-select");
const avatarTheme = new Partner.Avatar(document.getElementById("theme-avatar"));
const avatarNormal = new Partner.Avatar(document.getElementById("normal-avatar"));
const avatarTalk = new Partner.Avatar(document.getElementById("talk-avatar"));

langSelect.addEventListener("change", e => setLang(e.target.value));

function setLang(code){
  if (!LANGS[code]) code = "en";
  state.lang = code;
  langSelect.value = code;
  try{ localStorage.setItem(LANG_KEY, code); }catch(e){}
  Partner.load(code);
  updateLangNote();
}
function L(){ return getLang(state.lang); }
function partnerName(){ return Partner.name(state.lang); }

function updateLangNote(){
  const note = document.getElementById("lang-note");
  if (state.words.length && state.materialLang && state.materialLang !== state.lang){
    note.textContent = `※ いまの単語・例文は${getLang(state.materialLang).label}で作られています。${L().label}の教材にするには、もう一度テーマを話すか入力してください（会話は${L().label}で行います）。`;
    note.hidden = false;
  } else {
    note.hidden = true;
  }
}

document.getElementById("theme-partner-btn").addEventListener("click", () => Partner.openPicker());
document.querySelectorAll("[data-open-partner]").forEach(b => b.addEventListener("click", () => {
  stopActiveStepProcesses();
  Partner.openPicker();
}));

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
  stopSpeech();
  Partner.stopTalkingAll();
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
  stopSpeech();

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
  Partner.setEmotionAll("neutral");
  addLogRow("timeout", "この質問をスキップしました");
  state.talkHistory.push({ role: "you", text: "(skipped by user)", skipped: true });
  continueConversation();
}

/** 会話タイムアタックだけを最初からやり直す（テーマ・単語・四択はそのまま） */
function restartConversationOnly(){
  clearInterval(countdownTimer);
  if (recognizer){ try{ recognizer.stop(); }catch(e){} }
  stopSpeech();
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
    else if (h.timedOut) addLogRow("timeout", `${RESPONSE_LIMIT_SEC}秒以内に応答できませんでした`);
    else if (h.skipped) addLogRow("timeout", "この質問をスキップしました");
    else addLogRow("you", h.text);
  });
}

/* ---------- GAS呼び出し（text/plainでPOSTしCORSを回避）---------- */
async function callBackend(action, payload, timeoutMs = 12000){
  if (gasUrlMissing()) throw new Error("config.js の GAS_URL を設定してください");
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
    const lang = state.lang;
    const data = await callBackend("generateStudySetFromTranscript",
      { transcript, lang, langName: getLang(lang).label }, 40000);
    state.materialLang = lang;
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
    const lang = state.lang;
    const data = await callBackend("generateStudySet",
      { theme, lang, langName: getLang(lang).label }, 40000);
    state.materialLang = lang;
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
      lang: state.lang,
      materialLang: state.materialLang,
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
      state.lang = saved.lang || state.lang;
      state.materialLang = saved.materialLang || saved.lang || "en";
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
  grid.innerHTML = state.words.map((w, i) => `
    <div class="word-card">
      <button type="button" class="say-btn" data-say="${i}" aria-label="読み上げ">🔊</button>
      <div class="en">${escapeHtml(w.en)}</div>
      <div class="ja">${escapeHtml(w.ja)}</div>
      <div class="ex">${escapeHtml(w.example_en)}</div>
      <div class="ex-ja">${escapeHtml(w.example_ja)}</div>
    </div>
  `).join("");
  document.getElementById("to-quiz-btn").hidden = state.words.length === 0;
  grid.querySelectorAll("[data-say]").forEach(btn => btn.addEventListener("click", () => {
    const w = state.words[Number(btn.dataset.say)];
    if (w) speak(`${w.en}. ${w.example_en || ""}`, { lang: state.materialLang || state.lang });
  }));
  updateLangNote();
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

  Partner.setEmotionAll("joy");
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
    stopSpeech();
    endNormalConversation();
  }
}

async function startNormalConversation(){
  document.getElementById("normal-ai-line").textContent = "準備中…";
  try{
    const data = await callBackendWithRetry("normalChatReply", chatPayload([]), 0);
    if (data.ttsError) noteTtsFallback(data.ttsError);
    await pushNormalAiLine(data.reply, data.audio);
  }catch(err){
    await pushNormalAiLine(L().normalStart(state.theme));
  }
}

function addNormalLogRow(role, text){
  const log = document.getElementById("normal-log");
  const row = document.createElement("div");
  row.className = "row " + role;
  row.textContent = (role === "ai" ? partnerName() + ": " : "あなた: ") + text;
  log.appendChild(row);
  log.scrollTop = log.scrollHeight;
}

async function pushNormalAiLine(raw, audio){
  const { text, emotion } = Partner.parseReply(raw);
  Partner.setEmotionAll(emotion);
  document.getElementById("normal-ai-line").textContent = text;
  normalHistory.push({ role: "ai", text });
  addNormalLogRow("ai", text);
  await speak(text, { audio, emotion });
  if (normalTimeUp){ endNormalConversation(); return; }
  await settleAfterSpeak(); // 読み上げの残響がマイクに入らないよう少し待つ
  beginNormalListen();
}

function beginNormalListen(){
  if (!SpeechRecognition){
    document.getElementById("normal-you-line").textContent = "この端末は音声認識に対応していません。";
    return;
  }
  stopSpeech(); // Android等でTTSが完全に止まっていない状態を防ぐ保険
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
    r.lang = L().speech;
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
    const data = await callBackendWithRetry("normalChatReply", chatPayload(normalHistory), 1);
    if (data.ttsError) noteTtsFallback(data.ttsError);
    await pushNormalAiLine(data.reply, data.audio);
  }catch(err){
    await pushNormalAiLine(L().again);
  }
}

document.getElementById("normal-end-btn").addEventListener("click", () => {
  endNormalConversation();
});

function endNormalConversation(){
  normalActive = false;
  clearInterval(normalTimerInterval);
  if (normalRecognizer){ try{ normalRecognizer.stop(); }catch(e){} }
  stopSpeech();
  document.getElementById("normal-mic-indicator").classList.remove("listening");
  Partner.stopTalkingAll();
  Partner.setEmotionAll("joy");
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

/* ============================================================
   読み上げ — 端末の声 ／ Gemini の声（設定で切り替え）
   ============================================================ */
const TTS_ENGINE_KEY = "speakin3_tts_engine";
let ttsEngine = (() => { try{ return localStorage.getItem(TTS_ENGINE_KEY) || "device"; }catch(e){ return "device"; } })();
function useGemini(){ return ttsEngine === "gemini"; }

const ttsSelect = document.getElementById("tts-engine-select");
ttsSelect.value = ttsEngine;
ttsSelect.addEventListener("change", e => {
  ttsEngine = e.target.value === "gemini" ? "gemini" : "device";
  try{ localStorage.setItem(TTS_ENGINE_KEY, ttsEngine); }catch(err){}
  if (useGemini()) ensureAudioCtx(); // ここでの操作を使って音声の再生を許可しておく
});

let speechToken = 0;      // 読み上げを止めたら番号を進め、遅れて届いた音声は再生しない
let audioCtx = null;
let curSource = null;
let lipRAF = 0;
const audioCache = new Map(); // 同じ文章をもう一度読むとき（前へ戻る等）はサーバーを呼ばない

function ensureAudioCtx(){
  try{
    if (!audioCtx){
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      audioCtx = new AC();
    }
    if (audioCtx.state === "suspended") audioCtx.resume().catch(() => {});
    return audioCtx;
  }catch(e){ return null; }
}
// ブラウザの自動再生制限のため、最初の操作で音声の準備をしておく
["pointerdown", "keydown", "touchstart"].forEach(ev =>
  document.addEventListener(ev, ensureAudioCtx, { capture: true, passive: true }));

function stopSpeech(){
  speechToken++;
  if (synth) synth.cancel();
  if (curSource){
    const s = curSource;
    curSource = null;
    try{ s.stop(); }catch(e){}
    if (s._finish) s._finish();
  }
  cancelAnimationFrame(lipRAF);
  Partner.stopTalkingAll();
}

let lastTtsNotice = 0;
function noteTtsFallback(reason){
  const now = Date.now();
  if (now - lastTtsNotice < 60000) return;
  lastTtsNotice = now;
  showToast("Geminiの声を作れなかったため、端末の声で読み上げます" + (reason ? `（${reason}）` : ""));
}
function showToast(text){
  let el = document.getElementById("toast");
  if (!el){
    el = document.createElement("div");
    el.id = "toast";
    el.className = "toast";
    document.body.appendChild(el);
  }
  el.textContent = text;
  el.classList.add("show");
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.remove("show"), 4000);
}

function ttsCacheKey(text, lang, profile){
  return [lang, profile.gvoice || "", profile.gender || "", profile.rate, profile.pitch, text].join("|");
}
function cacheAudio(key, audio){
  audioCache.set(key, audio);
  if (audioCache.size > 30) audioCache.delete(audioCache.keys().next().value);
}

function b64ToArrayBuffer(b64){
  const bin = atob(b64);
  const u = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  return u.buffer;
}

/** 口パクの対象（指定がなければ画面の話し相手すべて） */
function lipTargets(avatar){
  return {
    start: () => avatar ? avatar.startTalking(true) : Partner.startTalkingAll(true),
    mouth: open => avatar ? avatar.setMouth(open) : Partner.setMouthAll(open),
    stop: () => avatar ? avatar.stopTalking() : Partner.stopTalkingAll()
  };
}

/** Gemini の音声（WAV base64）を再生し、音量に合わせて口を動かす。再生できなければ false */
async function playGeminiAudio(audio, token, avatar){
  const ctx = ensureAudioCtx();
  if (!ctx || !audio || !audio.data) return false;
  if (ctx.state !== "running"){
    try{ await Promise.race([ctx.resume(), new Promise(r => setTimeout(r, 1500))]); }catch(e){}
    if (ctx.state !== "running") return false;
  }
  let buf;
  try{ buf = await ctx.decodeAudioData(b64ToArrayBuffer(audio.data)); }catch(e){ return false; }
  if (token !== speechToken) return true; // 途中で止められた

  const lip = lipTargets(avatar);
  return new Promise(resolve => {
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const an = ctx.createAnalyser();
    an.fftSize = 1024;
    src.connect(an);
    an.connect(ctx.destination);
    curSource = src;

    const data = new Uint8Array(an.fftSize);
    let smooth = 0;
    lip.start();
    const tick = () => {
      an.getByteTimeDomainData(data);
      let sum = 0;
      for (let i = 0; i < data.length; i++){ const x = (data[i] - 128) / 128; sum += x * x; }
      const level = Math.min(1, Math.sqrt(sum / data.length) * 7);
      smooth = smooth * 0.45 + level * 0.55;
      lip.mouth(smooth > 0.18);
      lipRAF = requestAnimationFrame(tick);
    };
    tick();

    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      cancelAnimationFrame(lipRAF);
      clearTimeout(guard);
      lip.stop();
      if (curSource === src) curSource = null;
      resolve(true);
    };
    const guard = setTimeout(finish, buf.duration * 1000 + 2000);
    src.onended = finish;
    src._finish = finish;
    src.start();
  });
}

/** 端末の声で読み上げる */
function speakWithDevice(clean, lang, profile, voicePid, avatar, token){
  return new Promise(resolve => {
    if (!synth || token !== speechToken){ resolve(); return; }
    const utter = new SpeechSynthesisUtterance(clean);
    utter.lang = getLang(lang).speech;
    const voice = voicePid ? Partner.pickVoiceFor(voicePid, lang) : Partner.pickVoice(lang);
    if (voice) utter.voice = voice;
    const rate = Number(profile.rate) || 1;
    utter.rate = rate;
    utter.pitch = Number(profile.pitch) || 1;

    const lip = lipTargets(avatar);
    let done = false;
    const perChar = /^(zh|ko)$/.test(lang) ? 380 : 160;
    const safety = setTimeout(() => finish(), 5000 + clean.length * perChar / Math.max(0.5, rate)); // onendが来ない端末への保険
    function finish(){
      if (done) return;
      done = true;
      clearTimeout(safety);
      lip.stop();
      resolve();
    }
    utter.onstart = () => lip.start();
    utter.onend = finish;
    utter.onerror = finish;
    lip.start();
    synth.speak(utter);
  });
}

/**
 * 選んだ言語・話し相手の声で読み上げ、そのあいだ話し相手の口を動かす。
 * opts: { lang, audio（会話APIが一緒に返した音声）, emotion, profile, voicePid, avatar }
 */
async function speak(text, opts = {}){
  stopSpeech();
  const token = speechToken;
  const lang = opts.lang || state.lang;
  const profile = opts.profile || Partner.profile();
  const clean = String(text || "").replace(/[*_#`]/g, "").trim();
  if (!clean) return;

  if (useGemini()){
    const key = ttsCacheKey(clean, lang, profile);
    let audio = opts.audio || audioCache.get(key) || null;
    if (!audio){
      try{
        const d = await callBackend("tts", { text: clean, lang, emotion: opts.emotion || "neutral", partnerProfile: profile }, 30000);
        audio = d.audio || null;
      }catch(err){
        noteTtsFallback(err.message);
      }
      if (token !== speechToken) return;
    }
    if (audio){
      cacheAudio(key, audio);
      if (await playGeminiAudio(audio, token, opts.avatar)) return;
      noteTtsFallback("再生できませんでした");
    }
  }
  if (token !== speechToken) return;
  await speakWithDevice(clean, lang, profile, opts.voicePid, opts.avatar, token);
}

/** 会話APIへ送る内容（言語と話し相手の名前も渡し、GAS側で言語・表情を決める） */
function chatPayload(history){
  return {
    theme: state.theme,
    history,
    context: state.transcriptSummary || "",
    lang: state.lang,
    langName: L().label,
    partnerName: partnerName(),
    partnerProfile: Partner.profile(), // 人柄・話し方・会話の難しさ・声
    tts: useGemini()                   // Gemini の声なら返事と一緒に音声も作ってもらう
  };
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
  const norm = s => String(s || "").toLowerCase().replace(/[^\p{L}\p{N} ]/gu, "").trim();
  const u = norm(userText);
  const a = norm(aiText);
  if (!u) return true; // 空はエコー扱いで無視
  if (u.length < 3) return false; // 短すぎる発話は判定しない（誤検知防止）
  return a.includes(u) || u.includes(a);
}

async function startConversation(){
  state.talkHistory = []; // 呼び出し元に関わらず、必ず新しい会話として始める
  document.getElementById("talk-theme-tag").textContent = state.theme;
  document.getElementById("wait-time-label").textContent = RESPONSE_LIMIT_SEC + "秒";
  document.getElementById("talk-log").innerHTML = "";
  document.getElementById("you-line").textContent = "\u00A0";
  document.getElementById("ai-line").textContent = "準備中…";
  Partner.setEmotionAll("joy");
  try{
    const data = await callBackendWithRetry("chatReply", chatPayload([]), 0);
    if (data.ttsError) noteTtsFallback(data.ttsError);
    await pushAiLine(data.reply, data.audio);
  }catch(err){
    await pushAiLine(L().start(state.theme));
  }
}

async function pushAiLine(raw, audio){
  const { text, emotion } = Partner.parseReply(raw);
  Partner.setEmotionAll(emotion);
  document.getElementById("ai-line").textContent = text;
  state.talkHistory.push({ role: "ai", text });
  addLogRow("ai", text);
  await speak(text, { audio, emotion });
  await settleAfterSpeak(); // 読み上げの残響がマイクに入らないよう少し待つ
  beginListenWindow();
}

function addLogRow(role, text){
  const log = document.getElementById("talk-log");
  const row = document.createElement("div");
  row.className = "row " + role;
  row.textContent = (role === "ai" ? partnerName() + ": " : role === "you" ? "あなた: " : "⏱ タイムオーバー: ") + text;
  log.appendChild(row);
  log.scrollTop = log.scrollHeight;
}

function beginListenWindow(){
  if (!SpeechRecognition){
    document.getElementById("you-line").textContent = "この端末は音声認識に対応していません。";
    return;
  }
  stopSpeech(); // Android等でTTSが完全に止まっていない状態を防ぐ保険
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
    r.lang = L().speech;
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
  Partner.setEmotionAll("sad"); // 返事がなくて困った顔
  addLogRow("timeout", `${RESPONSE_LIMIT_SEC}秒以内に応答できませんでした`);
  state.talkHistory.push({ role: "you", text: "(no response — timed out)", timedOut: true });
  continueConversation();
}

async function continueConversation(){
  if (state.talkHistory.filter(h => h.role === "ai").length >= 6){
    // 6往復ほどで自然に会話を終える
    await pushAiLineNoListen(L().wrap);
    return;
  }
  try{
    const data = await callBackendWithRetry("chatReply", chatPayload(state.talkHistory), 1);
    if (data.ttsError) noteTtsFallback(data.ttsError);
    await pushAiLine(data.reply, data.audio);
  }catch(err){
    // Geminiが一時的に混雑していても会話を止めない
    await pushAiLine(L().again);
  }
}

async function callBackendWithRetry(action, payload, retries){
  try{
    return await callBackend(action, payload, payload && payload.tts ? 40000 : 12000);
  }catch(err){
    if (retries > 0){
      await new Promise(r => setTimeout(r, 900));
      return callBackendWithRetry(action, payload, retries - 1);
    }
    throw err;
  }
}
async function pushAiLineNoListen(raw){
  const { text, emotion } = Partner.parseReply(raw);
  Partner.setEmotionAll(emotion);
  document.getElementById("ai-line").textContent = text;
  state.talkHistory.push({ role: "ai", text });
  addLogRow("ai", text);
  await speak(text);
}

document.getElementById("end-talk-btn").addEventListener("click", () => {
  clearInterval(countdownTimer);
  if (recognizer){ try{ recognizer.stop(); }catch(e){} }
  stopSpeech();
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
      lang: state.lang,
      langName: L().label,
      history: state.talkHistory,
      quizScore: state.quizScore,
      quizTotal: state.quiz.length
    }, 40000);
    renderReview(data);

    // ログをスプレッドシート＋Driveに保存（単語・四択・整理済みの話した内容も含めて後で再利用できるようにする）
    callBackend("saveLog", {
      theme: themeWithLang(state.theme, state.lang),
      lang: state.lang,
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
  state.materialLang = "";
  state.transcriptSummary = "";
  state.words = [];
  state.quiz = [];
  state.quizIndex = 0;
  state.quizScore = 0;
  state.talkHistory = [];
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
  listEl.innerHTML = sessions.map(s => {
    const lt = splitLangTheme(s.theme);
    return `
    <div class="past-item">
      <div class="past-item-head">
        <span class="past-date">${escapeHtml(s.date)}</span>
        <span class="past-score">${s.score !== "" && s.score != null ? s.score + "点" : "-"}</span>
      </div>
      <div class="past-theme">${getLang(lt.lang).flag} ${escapeHtml(lt.theme)}</div>
      <div class="past-actions">
        <button class="chip" data-action="reuse" data-index="${s.index}">もう一度話す</button>
        <button class="chip" data-action="view" data-index="${s.index}">評価を見る</button>
        <button class="chip" data-action="edit" data-index="${s.index}" data-theme="${escapeHtml(s.theme)}">編集</button>
        <button class="chip" data-action="delete" data-index="${s.index}">削除</button>
      </div>
    </div>`;
  }).join("");
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

function openEditThemeModal(index, rawTheme){
  const lt = splitLangTheme(rawTheme);
  const currentTheme = lt.theme;
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
      await callBackend("updateSessionTheme", { index, newTheme: themeWithLang(newTheme, lt.lang) });
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

    const lt = splitLangTheme(s.theme);
    state.theme = lt.theme || "";
    state.materialLang = lt.lang;
    setLang(lt.lang);
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
