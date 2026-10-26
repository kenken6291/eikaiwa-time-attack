/**
 * Speak in 3 — 外国語会話タイムアタック バックエンド
 * 対応言語：英語(en) / スペイン語(es) / 中国語(zh) / ポルトガル語(pt) / 韓国語(ko) / フランス語(fr) / ドイツ語(de)
 * 会話の返答には話し相手の表情（neutral / joy / sad / surprised）を付けて返す
 *
 * 【事前準備】
 * 1. プロジェクトの設定 > スクリプト プロパティ に以下を追加
 *    - GEMINI_API_KEY : GeminiのAPIキー
 *    - SHEET_ID        : 会員・ログ保存用スプレッドシートのID（logs / members の2シートを自動作成）
 *    - DRIVE_FOLDER_ID : 会話ログ保存用Googleドライブのフォルダ ID
 *    - PEPPER          : パスワードハッシュ化用の任意の固定文字列（例: 長いランダム文字列。無くても動くが設定推奨）
 *    - ADMIN_EMAILS    : 「みんなの話し相手」を登録・編集できる管理者のメールアドレス（会員登録したもの。複数はカンマ区切り）
 *    - PARTNER_FOLDER_ID : （任意）話し相手の写真を保存するフォルダID。未設定なら DRIVE_FOLDER_ID 内に「partners」フォルダを自動作成
 * 2. デプロイ > 新しいデプロイ > ウェブアプリ
 *    実行ユーザー: 自分 / アクセスできるユーザー: 全員
 * 3. 発行されたURLを config.js の GAS_URL に貼り付け
 * 4. コードを変更したら必ず「新しいデプロイ」を作成し直すこと（同じURLを維持するなら
 *    デプロイの管理 > 編集 > バージョン「新規」を選択）
 * 5. 初回実行時にGmail送信の承認ダイアログが出るので許可すること
 */

/** サーバー（GAS）のバージョン — コードを変更したらここも更新する */
const GAS_VERSION = "2.2.0";
const GAS_UPDATED = "2026-10-26";

const PROPS = PropertiesService.getScriptProperties();
const GEMINI_MODEL = "gemini-3.6-flash";
const SESSION_TTL_SEC = 6 * 60 * 60; // セッション有効期限 6時間
const SENDER_EMAIL = "my60smyrules@gmail.com"; // 会員登録・パスワード再発行メールの送信元
const SENDER_NAME = "Speak in 3";

/* ============================================================
   学習言語
   ============================================================ */
const LANGS = {
  en: { ja: "英語",         en: "English",              native: "English",   note: "" },
  es: { ja: "スペイン語",   en: "Spanish",              native: "Español",   note: "" },
  zh: { ja: "中国語",       en: "Mandarin Chinese",     native: "中文",      note: "Use Simplified Chinese characters. Do not add pinyin unless asked." },
  pt: { ja: "ポルトガル語", en: "Brazilian Portuguese", native: "Português", note: "" },
  ko: { ja: "韓国語",       en: "Korean",               native: "한국어",    note: "Write in Hangul, using polite 해요-style speech." },
  fr: { ja: "フランス語",   en: "French",               native: "Français",  note: "" },
  de: { ja: "ドイツ語",     en: "German",               native: "Deutsch",   note: "" }
};
function getLang(code) { return LANGS[code] || LANGS.en; }
const EMOTIONS = ["neutral", "joy", "sad", "surprised"];

/**
 * 旧バージョンのフロントエンドが送信テキストの末尾に付けていた指示文を取り除く
 * （ブラウザに古い script.js が残っていても、プロンプトが崩れないようにするため）
 */
function stripLegacyDirective(text) {
  let s = String(text || "");
  const markers = ["\n\n【最重要", "\n\nあなたの名前は「", "\n【表情タグ】"];
  markers.forEach(m => {
    const i = s.indexOf(m);
    if (i >= 0) s = s.slice(0, i);
  });
  return s.trim();
}

/**
 * 会員登録・パスワード再発行メールを送信する共通関数。
 * SENDER_EMAIL からの送信には、そのアドレスがスクリプト実行アカウントの
 * Gmail「送信元アドレス（送信エイリアス）」として確認済みである必要がある。
 * （Gmail設定 > アカウントとインポート > 名前 > 他のメールアドレスを追加）
 * 未確認の場合は自動的にスクリプト実行アカウントからの送信にフォールバックする。
 */
function sendAppEmail(to, subject, body) {
  try{
    GmailApp.sendEmail(to, subject, body, { from: SENDER_EMAIL, name: SENDER_NAME });
  }catch(e){
    // SENDER_EMAILが送信エイリアスとして未確認の場合はここで失敗するため、
    // スクリプト実行アカウントからの送信にフォールバックする
    MailApp.sendEmail({ to, subject, body, name: SENDER_NAME });
  }
}

function doPost(e) {
  let result;
  try {
    const req = JSON.parse(e.postData.contents);
    switch (req.action) {
      // --- バージョン情報（ログイン不要） ---
      case "getVersion":
        result = { version: GAS_VERSION, updated: GAS_UPDATED, model: GEMINI_MODEL };
        break;

      // --- 会員認証（ログイン不要） ---
      case "register":
        result = registerMember(req.nickname, req.email);
        break;
      case "login":
        result = loginMember(req.email, req.password);
        break;
      case "forgotPassword":
        result = forgotPassword(req.email);
        break;
      case "checkSession":
        result = checkSession(req.sessionToken);
        break;
      case "logout":
        result = logoutSession(req.sessionToken);
        break;

      // --- ここから下はログイン必須 ---
      case "changePassword":
        result = changePassword(req.sessionToken, req.oldPassword, req.newPassword);
        break;
      case "changeNickname":
        result = changeNickname(req.sessionToken, req.nickname);
        break;
      case "generateStudySet":
        requireSession(req.sessionToken);
        result = generateStudySet(stripLegacyDirective(req.theme), req.lang);
        break;
      case "generateStudySetFromTranscript":
        requireSession(req.sessionToken);
        result = generateStudySetFromTranscript(stripLegacyDirective(req.transcript), req.lang);
        break;
      case "chatReply":
        requireSession(req.sessionToken);
        result = chatReply(req.theme, req.history, stripLegacyDirective(req.context), req.lang, req.partnerName);
        break;
      case "normalChatReply":
        requireSession(req.sessionToken);
        result = normalChatReply(req.theme, req.history, stripLegacyDirective(req.context), req.lang, req.partnerName);
        break;
      case "evaluateConversation":
        requireSession(req.sessionToken);
        result = evaluateConversation(stripLegacyDirective(req.theme), req.history, req.quizScore, req.quizTotal, req.lang);
        break;
      case "saveLog":
        result = saveLog(req);
        break;
      case "listSessions":
        result = listSessions(req.sessionToken);
        break;
      case "loadSession":
        result = { session: loadSession(req.sessionToken, req.index) };
        break;
      case "updateSessionTheme":
        result = updateSessionTheme(req.sessionToken, req.index, req.newTheme);
        break;
      case "deleteSession":
        result = deleteSession(req.sessionToken, req.index);
        break;

      // --- 話し相手（マイ10人＋みんな共通10人）---
      case "listPartners":
        result = listPartners(req.sessionToken);
        break;
      case "savePartner":
        result = savePartner(req.sessionToken, req);
        break;
      case "deletePartner":
        result = deletePartner(req.sessionToken, req.id);
        break;
      case "uploadPartnerPhoto":
        result = uploadPartnerPhoto(req.sessionToken, req.id, req.key, req.dataUrl);
        break;
      case "deletePartnerPhoto":
        result = deletePartnerPhoto(req.sessionToken, req.id, req.key);
        break;
      case "clearPartnerPhotos":
        result = clearPartnerPhotos(req.sessionToken, req.id);
        break;

      default:
        result = { error: "unknown action: " + req.action };
    }
  } catch (err) {
    result = { error: String(err.message || err) };
  }
  return ContentService.createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.TEXT);
}

/* ============================================================
   会員認証
   ============================================================ */
function getMembersSheet() {
  const sheetId = PROPS.getProperty("SHEET_ID");
  if (!sheetId) throw new Error("SHEET_ID が設定されていません");
  const ss = SpreadsheetApp.openById(sheetId);
  let sheet = ss.getSheetByName("members");
  if (!sheet) {
    sheet = ss.insertSheet("members");
    sheet.appendRow(["userId", "email", "nickname", "passwordHash", "salt", "mustChangePassword", "createdAt"]);
  }
  return sheet;
}

function hashPassword(password, salt) {
  const pepper = PROPS.getProperty("PEPPER") || "speakin3-default-pepper";
  const raw = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    password + salt + pepper,
    Utilities.Charset.UTF_8
  );
  return raw.map(b => (b < 0 ? b + 256 : b).toString(16).padStart(2, "0")).join("");
}

function generateTempPassword() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  let out = "";
  for (let i = 0; i < 8; i++) out += chars.charAt(Math.floor(Math.random() * chars.length));
  return out;
}

function findMemberRowByEmail(sheet, email) {
  const values = sheet.getDataRange().getValues();
  for (let i = 1; i < values.length; i++) {
    if (String(values[i][1]).toLowerCase() === String(email).toLowerCase()) {
      return { row: i + 1, data: values[i] };
    }
  }
  return null;
}

function findMemberRowByUserId(sheet, userId) {
  const values = sheet.getDataRange().getValues();
  for (let i = 1; i < values.length; i++) {
    if (values[i][0] === userId) return { row: i + 1, data: values[i] };
  }
  return null;
}

function registerMember(nickname, email) {
  if (!nickname || !nickname.trim()) throw new Error("ニックネームを入力してください");
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("メールアドレスの形式が正しくありません");

  const sheet = getMembersSheet();
  if (findMemberRowByEmail(sheet, email)) {
    throw new Error("このメールアドレスは既に登録されています");
  }

  const userId = Utilities.getUuid();
  const salt = Utilities.getUuid();
  const tempPassword = generateTempPassword();
  const hash = hashPassword(tempPassword, salt);

  sheet.appendRow([userId, email, nickname.trim(), hash, salt, true, new Date()]);

  sendAppEmail(
    email,
    "【Speak in 3】仮パスワードのお知らせ",
    `${nickname} 様\n\n` +
      `Speak in 3 へのご登録ありがとうございます。\n` +
      `以下の仮パスワードでログインし、初回ログイン時に新しいパスワードを設定してください。\n\n` +
      `仮パスワード: ${tempPassword}\n\n` +
      `このメールに心当たりがない場合は破棄してください。`
  );

  return { ok: true };
}

function loginMember(email, password) {
  if (!email || !password) throw new Error("メールアドレスとパスワードを入力してください");
  const sheet = getMembersSheet();
  const found = findMemberRowByEmail(sheet, email);
  if (!found) throw new Error("メールアドレスまたはパスワードが正しくありません");

  const [userId, , nickname, passwordHash, salt, mustChangePassword] = found.data;
  if (hashPassword(password, salt) !== passwordHash) {
    throw new Error("メールアドレスまたはパスワードが正しくありません");
  }

  const sessionToken = createSession(userId);
  return { ok: true, sessionToken, nickname, mustChangePassword: !!mustChangePassword };
}

function forgotPassword(email) {
  if (!email) throw new Error("メールアドレスを入力してください");
  const sheet = getMembersSheet();
  const found = findMemberRowByEmail(sheet, email);
  if (!found) throw new Error("登録されていないメールアドレスです");

  const salt = Utilities.getUuid();
  const tempPassword = generateTempPassword();
  const hash = hashPassword(tempPassword, salt);

  sheet.getRange(found.row, 4, 1, 3).setValues([[hash, salt, true]]); // passwordHash, salt, mustChangePassword

  sendAppEmail(
    email,
    "【Speak in 3】仮パスワード再発行のお知らせ",
    `仮パスワードを再発行しました。\n\n` +
      `仮パスワード: ${tempPassword}\n\n` +
      `ログイン後、新しいパスワードを設定してください。\n` +
      `このメールに心当たりがない場合は破棄してください。`
  );

  return { ok: true };
}

function createSession(userId) {
  const token = Utilities.getUuid();
  CacheService.getScriptCache().put("session_" + token, userId, SESSION_TTL_SEC);
  return token;
}

function requireSession(sessionToken) {
  if (!sessionToken) throw new Error("ログインが必要です");
  const userId = CacheService.getScriptCache().get("session_" + sessionToken);
  if (!userId) throw new Error("セッションの有効期限が切れました。再度ログインしてください。");
  return userId;
}

function checkSession(sessionToken) {
  try {
    const userId = requireSession(sessionToken);
    const sheet = getMembersSheet();
    const found = findMemberRowByUserId(sheet, userId);
    if (!found) return { ok: false };
    return { ok: true, nickname: found.data[2] };
  } catch (e) {
    return { ok: false };
  }
}

function logoutSession(sessionToken) {
  if (sessionToken) CacheService.getScriptCache().remove("session_" + sessionToken);
  return { ok: true };
}

function changePassword(sessionToken, oldPassword, newPassword) {
  const userId = requireSession(sessionToken);
  if (!newPassword || newPassword.length < 8) throw new Error("新しいパスワードは8文字以上にしてください");

  const sheet = getMembersSheet();
  const found = findMemberRowByUserId(sheet, userId);
  if (!found) throw new Error("会員情報が見つかりません");

  const [, , , passwordHash, salt, mustChangePassword] = found.data;
  if (!mustChangePassword) {
    if (!oldPassword || hashPassword(oldPassword, salt) !== passwordHash) {
      throw new Error("現在のパスワードが正しくありません");
    }
  }

  const newSalt = Utilities.getUuid();
  const newHash = hashPassword(newPassword, newSalt);
  sheet.getRange(found.row, 4, 1, 3).setValues([[newHash, newSalt, false]]);
  return { ok: true };
}

function changeNickname(sessionToken, nickname) {
  const userId = requireSession(sessionToken);
  if (!nickname || !nickname.trim()) throw new Error("ニックネームを入力してください");
  const sheet = getMembersSheet();
  const found = findMemberRowByUserId(sheet, userId);
  if (!found) throw new Error("会員情報が見つかりません");
  sheet.getRange(found.row, 3).setValue(nickname.trim());
  return { ok: true, nickname: nickname.trim() };
}

/**
 * 【初回のみ】GASエディタ上でこの関数を手動実行し、Gmail送信の権限を許可してください。
 * 手順: エディタ上部の関数選択プルダウンで authorizeMailSending を選び、「実行」ボタンを押す
 * → 「承認が必要です」→ アカウント選択 → 「詳細」→「(安全ではないページ)に移動」→「許可」
 * 一度許可すれば、以降はウェブアプリ経由のregister/forgotPasswordからも送信できるようになる。
 */
/**
 * 【初回のみ】GASエディタ上でこの関数を手動実行し、Gmail送信の権限を許可してください。
 * 手順: エディタ上部の関数選択プルダウンで authorizeMailSending を選び、「実行」ボタンを押す
 * → 「承認が必要です」→ アカウント選択 → 「詳細」→「(安全ではないページ)に移動」→「許可」
 * 一度許可すれば、以降はウェブアプリ経由のregister/forgotPasswordからも送信できるようになる。
 * ※ SENDER_EMAIL（my60smyrules@gmail.com）を送信元にするには、そのアドレスが
 *   スクリプト実行アカウントのGmail「送信元アドレス」として確認済みである必要がある。
 */
function authorizeMailSending() {
  sendAppEmail(
    Session.getActiveUser().getEmail(),
    "【Speak in 3】権限確認用テストメール",
    "このメールが届いていれば、Gmail送信の権限が正しく許可されています。\n" +
      "送信元が my60smyrules@gmail.com になっているかも確認してください。"
  );
}

/* ============================================================
   Gemini 呼び出し共通関数
   ============================================================ */
function callGemini(prompt, expectJson) {
  const apiKey = PROPS.getProperty("GEMINI_API_KEY");
  if (!apiKey) throw new Error("GEMINI_API_KEY が設定されていません");

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`;
  const body = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: expectJson
      ? { responseMimeType: "application/json" }
      : {}
  };

  const maxAttempts = 3;
  let lastError;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const res = UrlFetchApp.fetch(url, {
      method: "post",
      contentType: "application/json",
      payload: JSON.stringify(body),
      muteHttpExceptions: true
    });
    const json = JSON.parse(res.getContentText());

    if (!json.error) {
      const text = json.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!text) throw new Error("Geminiから応答がありませんでした");
      return text;
    }

    lastError = json.error.message || "unknown error";
    const isRetryable = res.getResponseCode() === 503 ||
      /high demand|overloaded|unavailable/i.test(lastError);
    if (isRetryable && attempt < maxAttempts) {
      Utilities.sleep(800 * attempt); // 0.8s, 1.6s と間隔を空けて再試行
      continue;
    }
    throw new Error("Gemini API error: " + lastError);
  }
  throw new Error("Gemini API error: " + lastError);
}

/* ============================================================
   単語・例文・四択テスト生成
   ============================================================ */
/** 教材JSONの形式（キー名は従来どおり en / example_en。値は学習言語で入る） */
function studySetFormat(L, withTheme) {
  return `{
${withTheme ? `  "theme": "特定した話題（短い日本語）",
  "transcript_summary": "整理した文章（自然な日本語、3〜6文）",
` : ""}  "words": [
    { "en": "${L.ja}の単語・フレーズ", "ja": "日本語訳", "example_en": "その単語を使った${L.ja}の簡単な例文", "example_ja": "例文の日本語訳" }
    // 6個
  ],
  "quiz": [
    { "question": "日本語の問題文（例: 「〜」を${L.ja}で言うと？）", "choices": ["${L.ja}の選択肢1","選択肢2","選択肢3","選択肢4"], "answer": 0 }
    // 5問。answerは正解のインデックス(0始まり)。正解の位置は問題ごとにばらけさせる
  ]
}`;
}

function studyLangRules(L) {
  return `【学習する言語】${L.ja}（${L.native}）
- 単語（en）・例文（example_en）・四択の選択肢は、必ず${L.ja}で書いてください（キー名は en / example_en のまま変えないこと）。
- 日本語訳（ja / example_ja）と四択の問題文は日本語で書いてください。
- 初級者向けに、日常でよく使う短い単語・表現と、短く簡単な例文にしてください。
${L.note ? "- " + L.note + "\n" : ""}`;
}

function generateStudySet(theme, lang) {
  const L = getLang(lang);
  const prompt = `あなたは${L.ja}会話の初級者（日本人）向けの教材作成AIです。
テーマ「${theme}」に関連する、初級者向けの${L.ja}の単語・例文・四択テストを作成してください。

${studyLangRules(L)}
以下のJSON形式のみで、説明文なしで出力してください。

${studySetFormat(L, false)}`;
  const text = callGemini(prompt, true);
  return JSON.parse(text);
}

/**
 * 3分程度の日本語フリートーク（文字起こし）から、話題（テーマ）を抽出し、
 * その内容に関連づけた単語・例文・四択テストを学習言語で生成する。
 */
function generateStudySetFromTranscript(transcript, lang) {
  if (!transcript || !transcript.trim()) {
    throw new Error("文字起こしが空です");
  }
  const L = getLang(lang);
  const prompt = `あなたは${L.ja}会話の初級者（日本人）向けの教材作成AIです。
以下は、ユーザーが日本語で自由に3分ほど話した内容の文字起こしです（音声認識のため誤字や言い淀み・重複が含まれることがあります）。

--- 文字起こし ---
${transcript}
--- ここまで ---

以下を行ってください。
1. この内容から、ユーザーが話していた話題（テーマ）を短い日本語（5〜10文字程度）で特定する。
2. 文字起こしの誤字脱字・言い淀み・重複を整理し、自然で読みやすい日本語の文章（3〜6文程度）にまとめる。話した内容や具体的なエピソードは削らず、意味を保ったまま整える。
3. その話題に関連する初級者向けの${L.ja}の単語・例文・四択テストを作成する。例文は、できるだけ文字起こしの内容（具体的な状況や気持ち）に寄せる。

${studyLangRules(L)}
以下のJSON形式のみで、説明文なしで出力してください。

${studySetFormat(L, true)}`;
  const text = callGemini(prompt, true);
  return JSON.parse(text);
}

/* ============================================================
   会話 — 話し相手の次の返答（＋表情）を生成
   ============================================================ */
function historyToText(history, partnerName) {
  return (history || []).map(h =>
    (h.role === "ai" ? (partnerName || "Partner") : "Learner") + ": " + h.text
  ).join("\n");
}

function emotionRules() {
  return `Also choose the facial expression you show while saying this line:
- "joy": you are pleased, praising the learner, or sharing something fun
- "surprised": the learner said something unexpected or impressive
- "sad": you look troubled/concerned — e.g. the learner timed out, skipped, seemed confused, or talked about something sad
- "neutral": anything else (calm, normal)`;
}

/** Geminiの {reply, emotion} を整え、フロントが表情を読めるよう reply の先頭に [emotion] を付けて返す */
function finishChatReply(raw, fallbackText) {
  let reply = "", emotion = "neutral";
  try {
    const j = JSON.parse(raw);
    reply = String(j.reply || "").trim();
    emotion = String(j.emotion || "neutral").toLowerCase();
  } catch (e) {
    reply = String(raw || "").trim();
    const m = reply.match(/^\s*\[(neutral|joy|sad|surprised)\]/i);
    if (m) emotion = m[1].toLowerCase();
  }
  reply = reply.replace(/^\s*\[(neutral|joy|sad|surprised)\]\s*/i, "").replace(/^["「]|["」]$/g, "").trim();
  if (!EMOTIONS.includes(emotion)) emotion = "neutral";
  if (!reply) reply = fallbackText;
  return { reply: `[${emotion}] ${reply}`, emotion };
}

/**
 * タイムアタック用の応答生成。短く・毎回質問で返し、テンポよく続けることを優先する。
 */
function chatReply(theme, history, context, lang, partnerName) {
  const L = getLang(lang);
  const name = partnerName || "your partner";
  const transcript = historyToText(history, partnerName);
  const contextBlock = context
    ? `\nBackground — the learner earlier talked (in Japanese) about this topic in detail. Use these specific details naturally when relevant, especially for your opening line:\n${context}\n`
    : "";

  const prompt = `You are ${name}, a friendly ${L.en} conversation partner helping a beginner Japanese learner practice the topic "${theme}".
${contextBlock}
Language rules:
- Speak ONLY in ${L.en} (${L.native}). Never use English${lang === "en" ? " other than plain English" : ""} or Japanese in your line.
${L.note ? "- " + L.note + "\n" : ""}- Keep it very short: 1 sentence (about 12 words or fewer; for Chinese/Korean about 20 characters or fewer), simple beginner vocabulary.
- Always end with a question to keep the conversation going.
If the learner's last line says "(no response — timed out)" or "(skipped by user)", gently encourage them and ask the question again in a simpler way.
If there is no conversation yet (see below), start with a short, specific opening line grounded in the background above (or the topic itself if no background is given).

${emotionRules()}

Conversation so far:
${transcript || "(nothing yet — this is the very first line of the conversation)"}

Output ONLY this JSON, nothing else:
{"reply": "your next line in ${L.en}", "emotion": "neutral | joy | sad | surprised"}`;
  return finishChatReply(callGemini(prompt, true), "?");
}

/**
 * 通常会話用の応答生成。ユーザーが話した具体的な内容にきちんと反応し、
 * 実際の日常会話のように自然にやり取りを続けることを優先する（毎回質問で返す必要はない）。
 */
function normalChatReply(theme, history, context, lang, partnerName) {
  const L = getLang(lang);
  const name = partnerName || "your partner";
  const transcript = historyToText(history, partnerName);
  const contextBlock = context
    ? `\nBackground — the learner earlier talked (in Japanese) about this topic in detail. Ground the conversation in these specific details, especially your opening line, and bring them up naturally as the chat continues:\n${context}\n`
    : "";

  const prompt = `You are ${name}, a warm, attentive ${L.en} conversation partner having a natural, everyday conversation with a beginner Japanese learner about "${theme}".
${contextBlock}
Language rules:
- Speak ONLY in ${L.en} (${L.native}). Never use Japanese${lang === "en" ? "" : " or English"} in your line.
${L.note ? "- " + L.note + "\n" : ""}
Guidelines:
- Read the learner's most recent line (and the background above, if given) carefully and respond directly to what they actually said — reference specific details they mentioned, react to their feelings, or build on their idea. Show clearly that you understood them, not just a generic reply.
- Use simple, beginner-friendly vocabulary, but let the conversation flow like a real casual chat (1-2 short sentences per turn), not a rigid Q&A interview.
- You don't need to end every line with a question — sometimes just comment, agree, share a short related thought, or express interest, the way a friend naturally would.
- Occasionally ask a natural follow-up question to keep the conversation going, but only when it fits naturally.
- Stay related to the topic "${theme}", but let the conversation evolve naturally based on what the learner brings up.
- If there is no conversation yet (see below), start with a short, specific opening line grounded in the background above (or the topic itself if no background is given).
- If the learner's message seems unclear or like a speech-recognition error, respond warmly and gently ask them to say more, without making them feel embarrassed.

${emotionRules()}

Conversation so far:
${transcript || "(nothing yet — this is the very first line of the conversation)"}

Output ONLY this JSON, nothing else:
{"reply": "your next line in ${L.en}", "emotion": "neutral | joy | sad | surprised"}`;
  return finishChatReply(callGemini(prompt, true), "?");
}

/* ============================================================
   会話の評価
   ============================================================ */
function evaluateConversation(theme, history, quizScore, quizTotal, lang) {
  const L = getLang(lang);
  const transcript = (history || []).map(h =>
    (h.role === "ai" ? "相手" : "学習者") + ": " + h.text
  ).join("\n");

  const prompt = `あなたは${L.ja}会話の初級者（日本人）向けの評価AIです。テーマ「${theme}」での以下の${L.ja}の会話ログを評価してください。
評価の対象は「学習者」の発言です。「(no response — timed out)」は時間切れ、「(skipped by user)」はスキップを表します。
音声認識の誤認識と思われる部分は、厳しく減点しすぎないでください。

${transcript}

四択テストの結果: ${quizScore} / ${quizTotal} 問正解

以下のJSON形式のみで、説明文なしで出力してください。
{
  "score": 0から100の総合スコア（数値）,
  "grammar_feedback": "${L.ja}の文法の正確さについての日本語フィードバック（2〜3文）",
  "natural_expressions": ["学習者の発言をもとにした、より自然な${L.ja}の言い回しの提案を2〜4個。各項目は『${L.ja}の例文（日本語での短い説明）』の形にする"],
  "summary": "会話全体の日本語でのまとめ（2〜3文、良かった点と次への一言を含める）"
}`;
  const text = callGemini(prompt, true);
  return JSON.parse(text);
}

/* ============================================================
   ログ保存 — スプレッドシート + Googleドライブ（本人のみ閲覧・編集・削除）
   ============================================================ */
function saveLog(req) {
  const userId = requireSession(req.sessionToken);
  const sheetId = PROPS.getProperty("SHEET_ID");
  const folderId = PROPS.getProperty("DRIVE_FOLDER_ID");
  const now = new Date();

  // 単語・四択・会話ログ・評価をまとめて保存し、後から「もう一度使う」を可能にする
  const sessionJson = JSON.stringify({
    lang: req.lang || "en",
    theme: req.theme,
    transcriptSummary: req.transcriptSummary || "",
    words: req.words || [],
    quiz: req.quiz || [],
    history: req.history || [],
    evaluation: req.evaluation || {},
    quizScore: req.quizScore,
    quizTotal: req.quizTotal
  });

  if (sheetId) {
    const sheet = SpreadsheetApp.openById(sheetId).getSheetByName("logs") ||
      SpreadsheetApp.openById(sheetId).insertSheet("logs");
    if (sheet.getLastRow() === 0) {
      sheet.appendRow(["日時", "テーマ", "四択スコア", "総合スコア", "会話まとめ", "ドライブURL", "セッションJSON", "userId"]);
    }
    // Driveファイルを先に作ってからURLを記録する
    let fileUrl = "";
    if (folderId) {
      fileUrl = saveTranscriptToDrive(folderId, req, now);
    }
    sheet.appendRow([
      now,
      req.theme,
      `${req.quizScore} / ${req.quizTotal}`,
      req.evaluation?.score ?? "",
      req.evaluation?.summary ?? "",
      fileUrl,
      sessionJson,
      userId
    ]);
    return { ok: true, driveUrl: fileUrl };
  }

  // シート未設定でもDriveだけには保存する
  if (folderId) {
    const fileUrl = saveTranscriptToDrive(folderId, req, now);
    return { ok: true, driveUrl: fileUrl };
  }

  return { ok: false, message: "SHEET_ID / DRIVE_FOLDER_ID が未設定のため保存をスキップしました" };
}

/**
 * ログイン中の本人の過去の記録一覧（直近20件、新しい順）を返す。
 * 各行の行番号(index)を返し、loadSession/updateSessionTheme/deleteSession でその行を指定する。
 */
function listSessions(sessionToken) {
  const userId = requireSession(sessionToken);
  const sheetId = PROPS.getProperty("SHEET_ID");
  if (!sheetId) return { sessions: [] };
  const sheet = SpreadsheetApp.openById(sheetId).getSheetByName("logs");
  if (!sheet || sheet.getLastRow() < 2) return { sessions: [] };

  const lastRow = sheet.getLastRow();
  const values = sheet.getRange(2, 1, lastRow - 1, 8).getValues(); // 日時,テーマ,四択,総合,まとめ,URL,JSON,userId

  const sessions = [];
  for (let i = values.length - 1; i >= 0; i--) {
    const [date, theme, , score, , , , rowUserId] = values[i];
    if (!theme || rowUserId !== userId) continue;
    sessions.push({
      index: 2 + i,
      date: Utilities.formatDate(new Date(date), Session.getScriptTimeZone(), "yyyy/MM/dd HH:mm"),
      theme: theme,
      score: score
    });
    if (sessions.length >= 20) break;
  }
  return { sessions };
}

/**
 * 指定した行番号のセッション詳細（単語・四択・会話・評価）を、本人の記録に限り返す。
 */
function loadSession(sessionToken, rowIndex) {
  const userId = requireSession(sessionToken);
  const sheet = getOwnedSessionSheet(userId, rowIndex);
  const json = sheet.getRange(rowIndex, 7).getValue(); // G列: セッションJSON
  if (!json) throw new Error("この記録には詳細データが保存されていません（古い形式の記録の可能性があります）");
  return JSON.parse(json);
}

/**
 * テーマ名を編集する（本人の記録のみ）。スプレッドシートのB列とセッションJSON内のthemeを両方更新する。
 */
function updateSessionTheme(sessionToken, rowIndex, newTheme) {
  const userId = requireSession(sessionToken);
  if (!newTheme || !newTheme.trim()) throw new Error("テーマを入力してください");
  const sheet = getOwnedSessionSheet(userId, rowIndex);

  sheet.getRange(rowIndex, 2).setValue(newTheme.trim()); // B列: テーマ

  const jsonCell = sheet.getRange(rowIndex, 7);
  const raw = jsonCell.getValue();
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      parsed.theme = newTheme.trim();
      jsonCell.setValue(JSON.stringify(parsed));
    } catch (e) { /* JSON壊れている場合はB列のみ更新して継続 */ }
  }
  return { ok: true, theme: newTheme.trim() };
}

/**
 * 記録を削除する（本人の記録のみ）。
 */
function deleteSession(sessionToken, rowIndex) {
  const userId = requireSession(sessionToken);
  const sheet = getOwnedSessionSheet(userId, rowIndex);
  sheet.deleteRow(rowIndex);
  return { ok: true };
}

/**
 * 指定行が本人の所有物であることを確認した上で、そのシートを返す。
 */
function getOwnedSessionSheet(userId, rowIndex) {
  const sheetId = PROPS.getProperty("SHEET_ID");
  if (!sheetId) throw new Error("SHEET_ID が未設定です");
  const sheet = SpreadsheetApp.openById(sheetId).getSheetByName("logs");
  if (!sheet) throw new Error("logsシートが見つかりません");
  if (!rowIndex || rowIndex < 2 || rowIndex > sheet.getLastRow()) throw new Error("記録が見つかりませんでした");

  const rowUserId = sheet.getRange(rowIndex, 8).getValue();
  if (rowUserId !== userId) throw new Error("この記録にアクセスする権限がありません");

  return sheet;
}

function saveTranscriptToDrive(folderId, req, now) {
  const folder = DriveApp.getFolderById(folderId);
  const lines = (req.history || []).map(h =>
    (h.role === "ai" ? "相手" : "You") + ": " + String(h.text || "").replace(/^\[(neutral|joy|sad|surprised)\]\s*/i, "")
  ).join("\n");

  const content =
    `テーマ: ${req.theme}\n` +
    `言語: ${getLang(req.lang).ja}\n` +
    `日時: ${now.toLocaleString("ja-JP")}\n` +
    (req.transcriptSummary ? `\n--- 話した内容（整理版） ---\n${req.transcriptSummary}\n` : "") +
    `\n四択スコア: ${req.quizScore} / ${req.quizTotal}\n\n` +
    `--- 会話ログ ---\n${lines}\n\n` +
    `--- 評価 ---\n` +
    `総合スコア: ${req.evaluation?.score ?? "-"}\n` +
    `文法フィードバック: ${req.evaluation?.grammar_feedback ?? "-"}\n` +
    `自然な表現の提案: ${(req.evaluation?.natural_expressions || []).join(" / ")}\n` +
    `まとめ: ${req.evaluation?.summary ?? "-"}\n`;

  const safeTheme = String(req.theme || "").replace(/[\\/:*?"<>|]/g, "_");
  const fileName = `${now.toISOString().slice(0,10)}_${safeTheme}.txt`;
  const file = folder.createFile(fileName, content, MimeType.PLAIN_TEXT);
  return file.getUrl();
}

/* ============================================================
   話し相手 — マイ話し相手（本人だけ・最大10人）／みんなの話し相手（全員共通・最大10人、管理者が登録）
   写真は表情4種 × 顔/瞬き/しゃべり の最大12枚を Google ドライブに保存し、
   「リンクを知っている全員が閲覧可」にして lh3.googleusercontent.com の URL で表示する
   ============================================================ */
const PARTNER_LIMIT = 10;
const PARTNER_KEYS = ["neutral", "joy", "sad", "surprised"].reduce((a, e) =>
  a.concat([e, e + "_blink", e + "_talk"]), []);

function getPartnersSheet() {
  const sheetId = PROPS.getProperty("SHEET_ID");
  if (!sheetId) throw new Error("SHEET_ID が設定されていません");
  const ss = SpreadsheetApp.openById(sheetId);
  let sheet = ss.getSheetByName("partners");
  if (!sheet) {
    sheet = ss.insertSheet("partners");
    sheet.appendRow(["id", "scope", "ownerUserId", "name", "photosJson", "sort", "updatedAt"]);
  }
  return sheet;
}

function getPartnerFolder() {
  const own = PROPS.getProperty("PARTNER_FOLDER_ID");
  if (own) return DriveApp.getFolderById(own);
  const parentId = PROPS.getProperty("DRIVE_FOLDER_ID");
  if (!parentId) throw new Error("DRIVE_FOLDER_ID（または PARTNER_FOLDER_ID）が設定されていません");
  const parent = DriveApp.getFolderById(parentId);
  const it = parent.getFoldersByName("partners");
  return it.hasNext() ? it.next() : parent.createFolder("partners");
}

function isAdminUser(userId) {
  const emails = String(PROPS.getProperty("ADMIN_EMAILS") || "")
    .split(/[,\s]+/).map(x => x.trim().toLowerCase()).filter(Boolean);
  if (!emails.length) return false;
  const found = findMemberRowByUserId(getMembersSheet(), userId);
  return !!found && emails.includes(String(found.data[1]).toLowerCase());
}

function partnerImgUrl(fileId) { return fileId ? "https://lh3.googleusercontent.com/d/" + fileId : ""; }

function readPartners() {
  const sheet = getPartnersSheet();
  const last = sheet.getLastRow();
  if (last < 2) return [];
  return sheet.getRange(2, 1, last - 1, 7).getValues().map((r, i) => {
    let photos = {};
    try { photos = JSON.parse(r[4] || "{}") || {}; } catch (e) { photos = {}; }
    return { row: i + 2, id: String(r[0]), scope: String(r[1]), owner: String(r[2]), name: String(r[3]),
             photos, sort: Number(r[5]) || 0, updatedAt: r[6] };
  }).filter(p => p.id);
}

function partnerToClient(p) {
  const photos = {};
  Object.keys(p.photos).forEach(k => { if (p.photos[k]) photos[k] = partnerImgUrl(p.photos[k]); });
  return { id: p.id, scope: p.scope, name: p.name, photos };
}

function listPartners(sessionToken) {
  const userId = requireSession(sessionToken);
  const all = readPartners().sort((a, b) => a.sort - b.sort);
  return {
    mine: all.filter(p => p.scope === "mine" && p.owner === userId).map(partnerToClient),
    shared: all.filter(p => p.scope === "shared").map(partnerToClient),
    isAdmin: isAdminUser(userId),
    limit: PARTNER_LIMIT
  };
}

/** 編集権限のある話し相手を返す（マイ＝本人のもの、みんな＝管理者のみ） */
function getEditablePartner(userId, id) {
  const p = readPartners().find(x => x.id === String(id));
  if (!p) throw new Error("話し相手が見つかりません");
  const ok = p.scope === "shared" ? isAdminUser(userId) : p.owner === userId;
  if (!ok) throw new Error("この話し相手を編集する権限がありません");
  return p;
}

function withLock(fn) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try { return fn(); } finally { lock.releaseLock(); }
}

function cleanPartnerName(name) {
  const n = String(name || "").trim().slice(0, 16);
  if (!n) throw new Error("名前を入力してください");
  return n;
}

function savePartner(sessionToken, req) {
  const userId = requireSession(sessionToken);
  return withLock(() => {
    const sheet = getPartnersSheet();
    if (req.id) {
      const p = getEditablePartner(userId, req.id);
      p.name = cleanPartnerName(req.name);
      sheet.getRange(p.row, 4).setValue(p.name);
      sheet.getRange(p.row, 7).setValue(new Date());
      return { partner: partnerToClient(p) };
    }
    const scope = req.scope === "shared" ? "shared" : "mine";
    if (scope === "shared" && !isAdminUser(userId)) throw new Error("みんなの話し相手は管理者だけが登録できます");
    const all = readPartners();
    const count = all.filter(p => scope === "shared" ? p.scope === "shared" : (p.scope === "mine" && p.owner === userId)).length;
    if (count >= PARTNER_LIMIT) throw new Error(`話し相手は${PARTNER_LIMIT}人まで登録できます`);
    const p = { id: Utilities.getUuid(), scope, owner: scope === "mine" ? userId : "", name: cleanPartnerName(req.name), photos: {} };
    sheet.appendRow([p.id, p.scope, p.owner, p.name, "{}", Date.now(), new Date()]);
    return { partner: partnerToClient(p) };
  });
}

function trashFileQuietly(fileId) {
  if (!fileId) return;
  try { DriveApp.getFileById(fileId).setTrashed(true); } catch (e) { /* 既に無い場合は無視 */ }
}

function deletePartner(sessionToken, id) {
  const userId = requireSession(sessionToken);
  return withLock(() => {
    const p = getEditablePartner(userId, id);
    Object.keys(p.photos).forEach(k => trashFileQuietly(p.photos[k]));
    getPartnersSheet().deleteRow(p.row);
    return { ok: true };
  });
}

function uploadPartnerPhoto(sessionToken, id, key, dataUrl) {
  const userId = requireSession(sessionToken);
  if (!PARTNER_KEYS.includes(key)) throw new Error("写真の種類が正しくありません");
  const m = String(dataUrl || "").match(/^data:(image\/(jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/);
  if (!m) throw new Error("画像データが正しくありません");
  if (m[3].length > 4 * 1024 * 1024) throw new Error("画像が大きすぎます");

  return withLock(() => {
    const p = getEditablePartner(userId, id);
    const ext = m[2] === "jpeg" ? "jpg" : m[2];
    const blob = Utilities.newBlob(Utilities.base64Decode(m[3]), m[1], `${p.scope}_${p.id}_${key}.${ext}`);
    const file = getPartnerFolder().createFile(blob);
    try { file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); } catch (e) { /* 共有設定できない環境では表示できない可能性あり */ }
    trashFileQuietly(p.photos[key]);
    p.photos[key] = file.getId();
    const sheet = getPartnersSheet();
    sheet.getRange(p.row, 5).setValue(JSON.stringify(p.photos));
    sheet.getRange(p.row, 7).setValue(new Date());
    return { url: partnerImgUrl(file.getId()), partner: partnerToClient(p) };
  });
}

function deletePartnerPhoto(sessionToken, id, key) {
  const userId = requireSession(sessionToken);
  return withLock(() => {
    const p = getEditablePartner(userId, id);
    trashFileQuietly(p.photos[key]);
    delete p.photos[key];
    getPartnersSheet().getRange(p.row, 5).setValue(JSON.stringify(p.photos));
    return { partner: partnerToClient(p) };
  });
}

function clearPartnerPhotos(sessionToken, id) {
  const userId = requireSession(sessionToken);
  return withLock(() => {
    const p = getEditablePartner(userId, id);
    Object.keys(p.photos).forEach(k => trashFileQuietly(p.photos[k]));
    p.photos = {};
    getPartnersSheet().getRange(p.row, 5).setValue("{}");
    return { partner: partnerToClient(p) };
  });
}
