/* ============================================================
   Speak in 3 — 設定ファイル
   GASを新しくデプロイしてURLが変わったら、ここだけ書き換えてください
   ============================================================ */
window.GAS_URL = "https://script.google.com/macros/s/AKfycbwaIg_BJ5AP_rAwYknfQY69pyssjs90YAohZMo8daOjtNQzE1IH6PY-gKGrGYSSS0619Q/exec";

/* ------------------------------------------------------------
   Gemini（AI）モデル
   GEMINI_MODEL : 画面で選ばなかった時の既定。空文字 "" = 自動（汎用の最新）
   GEMINI_MODEL_OPTIONS : 画面の「AIモデル」選択肢（value が API のモデルID）
   ※ 選んだモデルが使えない（廃止・未公開・名前違い）時は、
     GAS側で汎用の最新モデルへ自動で切り替わります
   ------------------------------------------------------------ */
window.GEMINI_MODEL = "";
window.GEMINI_MODEL_OPTIONS = [
  { value: "",                  label: "自動モード（汎用の最新）" },
  { value: "gemini-4-hydrogen", label: "4 Hydrogen（日々の暮らしをサポート）" },
  { value: "gemini-4-neon",     label: "4 Neon（Deeper analysis）" },
  { value: "gemini-4-carbon",   label: "4 Carbon（Code & complex work）" },
  { value: "gemini-4-argon",    label: "4 Argon" },
  { value: "gemini-3.8-flash",  label: "3.8 Flash" },
  { value: "gemini-3.5-flash",  label: "3.5 Flash" }
];
