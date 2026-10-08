/*
 * 保護猫DB PWA v2 設定
 *
 * Supabase:
 *   Project Settings > API
 *
 * Google:
 *   Google Cloud ConsoleでOAuth 2.0「ウェブアプリケーション」を作成し、
 *   このPWAを公開するURLを承認済みJavaScript生成元へ追加してください。
 *
 * Google Driveは drive.file スコープのみを使用します。
 * Service AccountやGoogleの秘密鍵はブラウザへ入れません。
 */
window.CAT_DB_CONFIG = {
  supabaseUrl: "https://byktxquvkxyfynomaqtf.supabase.co",
  supabaseAnonKey: "sb_publishable_s8ZqZ6-c0Fo_vFUhAws9WQ_Oxh4rOZq",
  googleClientId: "275049495695-5h0u604uhjprpqmnfm75hohqvnhg7vpd.apps.googleusercontent.com"
};
