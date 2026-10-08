/* 保護猫DB PWA v1
 * Supabase CRUD + RLS + レスポンシブUI + 印刷/PDF + PWA
 * Google Drive連携は次フェーズで追加可能な設計。
 */
(() => {
  "use strict";

  const cfg = window.CAT_DB_CONFIG || {};
  const $ = id => document.getElementById(id);
  const state = {
    supabase: null,
    user: null,
    profile: null,
    cats: [],
    selectedCat: null,
    editing: false,
    deferredInstall: null,
    googleToken: null,
    googleTokenClient: null
  };

  const STATUS_LABEL = {
    protected: "保護中", adopted: "譲渡済", deceased: "死亡", missing: "行方不明", other: "その他"
  };
  const SEX_LABEL = { male: "オス", female: "メス", unknown: "不明" };
  const NEUTER_LABEL = { intact: "未手術", neutered: "去勢済", spayed: "避妊済", unknown: "不明" };
  const TEST_LABEL = { positive: "陽性", negative: "陰性", unknown: "不明", not_tested: "未検査" };

  function today() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
  }

  function esc(value) {
    return String(value ?? "").replace(/[&<>"']/g, c => ({
      "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;"
    }[c]));
  }

  function formatDate(value) {
    if (!value) return "—";
    const [y,m,d] = String(value).split("-");
    return y && m && d ? `${y}/${m}/${d}` : value;
  }

  function show(view) {
    ["login-view","setup-view","app-view"].forEach(id => $(id).classList.add("hidden"));
    $(view).classList.remove("hidden");
  }

  function panel(name) {
    ["list-panel","detail-panel","cat-form-panel","observation-panel"].forEach(id => $(id).classList.add("hidden"));
    $(name).classList.remove("hidden");
  }

  function toast(msg) {
    const el = $("toast");
    el.textContent = msg;
    el.classList.add("show");
    setTimeout(() => el.classList.remove("show"), 2600);
  }

  function message(id, text, type="") {
    const el = $(id);
    el.textContent = text;
    el.className = `message ${type}`;
  }

  function hasConfig() {
    return Boolean(cfg.supabaseUrl && cfg.supabaseAnonKey);
  }

  function saveConfig(url, key) {
    localStorage.setItem("catdb.supabaseUrl", url.trim());
    localStorage.setItem("catdb.supabaseAnonKey", key.trim());
  }

  function loadConfig() {
    if (!cfg.supabaseUrl) cfg.supabaseUrl = localStorage.getItem("catdb.supabaseUrl") || "";
    if (!cfg.supabaseAnonKey) cfg.supabaseAnonKey = localStorage.getItem("catdb.supabaseAnonKey") || "";
  }

  async function initSupabase() {
    loadConfig();
    if (!hasConfig()) {
      show("setup-view");
      $("config-url").value = cfg.supabaseUrl;
      $("config-key").value = cfg.supabaseAnonKey;
      $("connection-status").textContent = "Supabase未設定";
      return false;
    }
    if (!window.supabase?.createClient) {
      message("config-message", "Supabaseライブラリを読み込めません。ネットワークを確認してください。", "error");
      show("setup-view");
      return false;
    }
    state.supabase = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey);
    $("connection-status").textContent = "Supabase接続準備完了";
    return true;
  }

  async function loadSession() {
    if (!state.supabase) return;
    const { data, error } = await state.supabase.auth.getSession();
    if (error) throw error;
    state.user = data.session?.user || null;
    if (!state.user) {
      show("login-view");
      return;
    }
    await loadProfile();
    show("app-view");
    $("user-label").textContent = `${state.profile?.display_name || state.user.email || ""} / ${state.profile?.role || "viewer"}`;
    await loadCats();
  }

  async function loadProfile() {
    const { data, error } = await state.supabase
      .from("profiles")
      .select("id,display_name,role,active")
      .eq("id", state.user.id)
      .single();
    if (error) throw error;
    if (!data.active) throw new Error("このアカウントは無効になっています。");
    state.profile = data;
  }

  function canEdit() {
    return ["admin","staff"].includes(state.profile?.role);
  }

  async function loadCats() {
    const { data, error } = await state.supabase
      .from("cats")
      .select("id,management_no,name,sex,breed,rescued_date,estimated_age_text,status,rescue_location,main_photo_file_id")
      .is("deleted_at", null)
      .order("management_no", { ascending: true });
    if (error) {
      $("connection-status").textContent = "DBエラー";
      throw error;
    }
    state.cats = data || [];
    renderCatList();
    $("connection-status").textContent = `接続中・${state.cats.length}匹`;
  }

  function filteredCats() {
    const q = $("search-input").value.trim().toLowerCase();
    const status = $("status-filter").value;
    return state.cats.filter(cat => {
      const hay = `${cat.management_no} ${cat.name} ${cat.breed} ${cat.rescue_location}`.toLowerCase();
      return (!q || hay.includes(q)) && (!status || cat.status === status);
    });
  }

  function renderCatList() {
    const list = $("cat-list");
    const cats = filteredCats();
    if (!cats.length) {
      list.innerHTML = `<div class="empty">該当する猫がありません。</div>`;
      return;
    }
    list.innerHTML = cats.map(cat => `
      <article class="cat-card">
        <div class="cat-thumb">🐱</div>
        <div>
          <div class="cat-name">${esc(cat.name || "名前未登録")}</div>
          <div class="cat-meta">${esc(cat.management_no)} ・ ${esc(SEX_LABEL[cat.sex] || "不明")} ・ ${esc(cat.breed || "品種未登録")}</div>
          <div class="cat-meta">保護日 ${esc(formatDate(cat.rescued_date))}</div>
        </div>
        <button class="secondary open-cat" data-id="${esc(cat.id)}" type="button">詳細</button>
      </article>
    `).join("");
    list.querySelectorAll(".open-cat").forEach(btn =>
      btn.addEventListener("click", () => openCat(btn.dataset.id))
    );
  }

  async function openCat(id) {
    const { data, error } = await state.supabase
      .from("cats")
      .select("*")
      .eq("id", id)
      .single();
    if (error) return toast(error.message);

    const [vaccinations, virusTests, surgeries, observations, transfers, deaths, files] = await Promise.all([
      state.supabase.from("vaccinations").select("*").eq("cat_id", id).order("vaccination_date", {ascending:false}),
      state.supabase.from("virus_tests").select("*").eq("cat_id", id).order("test_date", {ascending:false}),
      state.supabase.from("surgeries").select("*").eq("cat_id", id).order("surgery_date", {ascending:false}),
      state.supabase.from("observations").select("*").eq("cat_id", id).order("observation_date", {ascending:false}).order("created_at", {ascending:false}),
      state.supabase.from("transfers").select("*").eq("cat_id", id).order("transfer_date", {ascending:false}),
      state.supabase.from("deaths").select("*").eq("cat_id", id).order("death_date", {ascending:false}),
      state.supabase.from("cat_files").select("*").eq("cat_id", id).order("is_main_photo", {ascending:false}).order("taken_at", {ascending:false})
    ]);

    state.selectedCat = {
      ...data,
      vaccinations: vaccinations.data || [],
      virusTests: virusTests.data || [],
      surgeries: surgeries.data || [],
      observations: observations.data || [],
      transfers: transfers.data || [],
      deaths: deaths.data || [],
      files: files.data || []
    };
    renderDetail();
    panel("detail-panel");
  }

  function latest(arr) { return arr?.[0] || null; }

  function renderDetail() {
    const c = state.selectedCat;
    const vaccine = latest(c.vaccinations);
    const test = latest(c.virusTests);
    const surgery = latest(c.surgeries);
    const mainFile = c.files.find(f => f.is_main_photo) || c.files[0];
    const img = mainFile?.file_url
      ? `<img class="detail-photo" src="${esc(mainFile.file_url)}" alt="${esc(c.name)}の写真">`
      : `<div class="detail-photo" aria-label="写真未登録" style="display:grid;place-items:center;font-size:64px">🐱</div>`;

    $("cat-detail").innerHTML = `
      <div class="detail-grid">
        <div>${img}</div>
        <div>
          <h2>${esc(c.name || "名前未登録")} <span class="status">${esc(STATUS_LABEL[c.status])}</span></h2>
          <p class="muted">${esc(c.management_no)}</p>
          <div class="info-grid">
            <div class="key">性別</div><div>${esc(SEX_LABEL[c.sex])}</div>
            <div class="key">品種等</div><div>${esc(c.breed || "—")}</div>
            <div class="key">保護日</div><div>${esc(formatDate(c.rescued_date))}</div>
            <div class="key">推定年齢</div><div>${esc(c.estimated_age_text || "—")}</div>
            <div class="key">保護場所</div><div>${esc(c.rescue_location || "—")}</div>
            <div class="key">不妊・去勢</div><div>${esc(NEUTER_LABEL[c.neuter_status])}</div>
            <div class="key">ワクチン</div><div>${vaccine ? `${esc(vaccine.vaccine_type)} / ${esc(formatDate(vaccine.vaccination_date))}` : "—"}</div>
            <div class="key">FIV</div><div>${test ? esc(TEST_LABEL[test.fiv_result]) : "—"}</div>
            <div class="key">FeLV</div><div>${test ? esc(TEST_LABEL[test.felv_result]) : "—"}</div>
            <div class="key">手術</div><div>${surgery ? `${esc(surgery.surgery_type)} / ${esc(formatDate(surgery.surgery_date))}` : "—"}</div>
          </div>
        </div>
      </div>

      <h3 class="section-title">保護時の状況</h3>
      <div class="panel">${esc(c.rescue_details || "未登録")}</div>

      <h3 class="section-title">観察日記
        ${canEdit() ? '<button id="add-observation" class="primary" type="button">＋ 追加</button>' : ""}
      </h3>
      <div class="timeline">
        ${c.observations.length ? c.observations.map(o => `
          <div class="timeline-item">
            <div class="timeline-date">${esc(formatDate(o.observation_date))}</div>
            <div><strong>体調：</strong>${esc(o.condition || "—")}　<strong>食欲：</strong>${esc(o.appetite || "—")}</div>
            <div><strong>排便：</strong>${esc(o.stool || "—")}　<strong>排尿：</strong>${esc(o.urine || "—")}</div>
            <div><strong>様子：</strong>${esc(o.behavior || "—")}</div>
            <div>${esc(o.memo || "")}</div>
            ${o.weight_kg ? `<div class="muted">体重 ${esc(o.weight_kg)} kg${o.temperature_c ? ` / 体温 ${esc(o.temperature_c)} ℃` : ""}</div>` : ""}
          </div>
        `).join("") : '<div class="empty">観察日記はまだありません。</div>'}
      </div>

      <h3 class="section-title">医療履歴</h3>
      <div class="timeline">
        ${c.vaccinations.map(v => `<div class="timeline-item"><div class="timeline-date">${esc(formatDate(v.vaccination_date))}</div><strong>ワクチン</strong> ${esc(v.vaccine_type)} ${esc(v.veterinary_hospital)}</div>`).join("")}
        ${c.virusTests.map(t => `<div class="timeline-item"><div class="timeline-date">${esc(formatDate(t.test_date))}</div><strong>検査</strong> FIV ${esc(TEST_LABEL[t.fiv_result])} / FeLV ${esc(TEST_LABEL[t.felv_result])}</div>`).join("")}
        ${c.surgeries.map(s => `<div class="timeline-item"><div class="timeline-date">${esc(formatDate(s.surgery_date))}</div><strong>手術</strong> ${esc(s.surgery_type)} ${esc(s.veterinary_hospital)}</div>`).join("")}
        ${(!c.vaccinations.length && !c.virusTests.length && !c.surgeries.length) ? '<div class="empty">医療履歴はありません。</div>' : ""}
      </div>

      ${canEdit() ? `
      <h3 class="section-title">Google Drive / 写真</h3>
      <div class="drive-box">
        <p>v1ではGoogle Driveのファイル情報をDBに保存する設計です。Drive OAuth・アップロードUIは次フェーズで接続します。</p>
        <div class="file-grid">
          ${c.files.map(f => f.file_url ? `<div class="file-card"><img src="${esc(f.file_url)}" alt="${esc(f.file_name)}"><small>${esc(f.file_name)}</small></div>` : "").join("")}
        </div>
      </div>` : ""}

      <h3 class="section-title">譲渡・死亡情報</h3>
      <div class="info-grid">
        <div class="key">譲渡</div><div>${c.transfers.length ? esc(formatDate(c.transfers[0].transfer_date)) : "未登録"}</div>
        <div class="key">死亡</div><div>${c.deaths.length ? `${esc(formatDate(c.deaths[0].death_date))} / ${esc(c.deaths[0].cause || "原因未登録")}` : "—"}</div>
      </div>
    `;
    const dc = $("drive-controls");
    if (dc) {
      dc.classList.toggle("hidden", !canEdit());
      renderDriveFiles();
    }
    const add = $("add-observation");
    if (add) add.addEventListener("click", openObservationForm);
  }

  function openCatForm(cat=null) {
    state.editing = Boolean(cat);
    $("cat-form-title").textContent = cat ? "猫情報を編集" : "猫を登録";
    $("cat-id").value = cat?.id || "";
    $("management-no").value = cat?.management_no || "";
    $("cat-name").value = cat?.name || "";
    $("cat-sex").value = cat?.sex || "unknown";
    $("cat-breed").value = cat?.breed || "雑種";
    $("rescued-date").value = cat?.rescued_date || "";
    $("estimated-birth-date").value = cat?.estimated_birth_date || "";
    $("estimated-age").value = cat?.estimated_age_text || "";
    $("cat-status").value = cat?.status || "protected";
    $("neuter-status").value = cat?.neuter_status || "unknown";
    $("rescue-location").value = cat?.rescue_location || "";
    $("rescue-details").value = cat?.rescue_details || "";
    $("current-note").value = cat?.current_note || "";
    message("cat-form-message","");
    panel("cat-form-panel");
  }

  async function saveCat(e) {
    e.preventDefault();
    if (!canEdit()) return message("cat-form-message","閲覧権限では編集できません。","error");

    const id = $("cat-id").value || null;
    const payload = {
      management_no: $("management-no").value.trim() || null,
      name: $("cat-name").value.trim(),
      sex: $("cat-sex").value,
      breed: $("cat-breed").value.trim(),
      rescued_date: $("rescued-date").value || null,
      estimated_birth_date: $("estimated-birth-date").value || null,
      estimated_age_text: $("estimated-age").value.trim(),
      status: $("cat-status").value,
      neuter_status: $("neuter-status").value,
      rescue_location: $("rescue-location").value.trim(),
      rescue_details: $("rescue-details").value.trim(),
      current_note: $("current-note").value.trim(),
      updated_by: state.user.id
    };

    if (!payload.name) return message("cat-form-message","名前を入力してください。","error");

    let result;
    if (id) {
      result = await state.supabase.from("cats").update(payload).eq("id", id).select().single();
    } else {
      payload.created_by = state.user.id;
      result = await state.supabase.from("cats").insert(payload).select().single();
    }
    if (result.error) return message("cat-form-message", result.error.message, "error");

    toast(id ? "猫情報を更新しました" : `猫を登録しました（${result.data.management_no}）`);
    await loadCats();
    await openCat(result.data.id);
  }

  function openObservationForm() {
    if (!state.selectedCat || !canEdit()) return;
    $("obs-date").value = today();
    ["obs-condition","obs-appetite","obs-stool","obs-urine","obs-behavior","obs-weight","obs-temperature","obs-memo"].forEach(id => $(id).value = "");
    message("observation-message","");
    panel("observation-panel");
  }

  async function saveObservation(e) {
    e.preventDefault();
    if (!state.selectedCat || !canEdit()) return;
    const payload = {
      cat_id: state.selectedCat.id,
      observation_date: $("obs-date").value,
      observer_id: state.user.id,
      condition: $("obs-condition").value.trim(),
      appetite: $("obs-appetite").value.trim(),
      stool: $("obs-stool").value.trim(),
      urine: $("obs-urine").value.trim(),
      behavior: $("obs-behavior").value.trim(),
      weight_kg: $("obs-weight").value ? Number($("obs-weight").value) : null,
      temperature_c: $("obs-temperature").value ? Number($("obs-temperature").value) : null,
      memo: $("obs-memo").value.trim()
    };
    if (!payload.observation_date) return message("observation-message","観察日を入力してください。","error");
    const { error } = await state.supabase.from("observations").insert(payload);
    if (error) return message("observation-message", error.message, "error");
    toast("観察日記を保存しました");
    await openCat(state.selectedCat.id);
  }


  // ---------------- Google Drive ----------------

  function driveConfigured() {
    return Boolean(window.CAT_DB_CONFIG?.googleClientId);
  }

  function setDriveMessage(text, type="") {
    const el = $("drive-message");
    if (el) {
      el.textContent = text;
      el.className = `message ${type}`;
    }
  }

  function initGoogleDrive() {
    if (!driveConfigured()) return;
    if (!window.google?.accounts?.oauth2) {
      setTimeout(initGoogleDrive, 700);
      return;
    }
    state.googleTokenClient = google.accounts.oauth2.initTokenClient({
      client_id: window.CAT_DB_CONFIG.googleClientId,
      scope: "https://www.googleapis.com/auth/drive.file",
      callback: (response) => {
        if (response.error) {
          setDriveMessage(`Google接続エラー: ${response.error}`, "error");
          return;
        }
        state.googleToken = response.access_token;
        setDriveMessage("Google Driveに接続しました。", "success");
        $("google-connect-button").textContent = "Google Drive接続済み";
      }
    });
  }

  function ensureGoogleToken() {
    return new Promise((resolve, reject) => {
      if (state.googleToken) return resolve(state.googleToken);
      if (!state.googleTokenClient) {
        initGoogleDrive();
        return reject(new Error("Google Client IDが未設定です。config.jsを設定してください。"));
      }
      const oldCallback = state.googleTokenClient.callback;
      state.googleTokenClient.callback = (response) => {
        state.googleTokenClient.callback = oldCallback;
        if (response.error) return reject(new Error(response.error));
        state.googleToken = response.access_token;
        resolve(state.googleToken);
      };
      state.googleTokenClient.requestAccessToken({prompt:"consent"});
    });
  }

  async function driveApi(path, options={}) {
    const token = await ensureGoogleToken();
    const headers = new Headers(options.headers || {});
    headers.set("Authorization", `Bearer ${token}`);
    return fetch(`https://www.googleapis.com/drive/v3/${path}`, {...options, headers});
  }

  async function getOrCreateDriveFolder(cat) {
    const folderName = `${cat.management_no}_${cat.name || "名前未登録"}`;
    const q = `name = '${folderName.replace(/'/g, "\\'")}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
    const search = await driveApi(`files?q=${encodeURIComponent(q)}&spaces=drive&fields=files(id,name,webViewLink)`);
    if (!search.ok) throw new Error(`Driveフォルダ検索失敗: ${await search.text()}`);
    const found = await search.json();
    if (found.files?.length) return found.files[0];

    const create = await driveApi("files", {
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body: JSON.stringify({
        name: folderName,
        mimeType:"application/vnd.google-apps.folder"
      })
    });
    if (!create.ok) throw new Error(`Driveフォルダ作成失敗: ${await create.text()}`);
    return await create.json();
  }

  async function uploadPhotoToDrive(file, cat) {
    if (!file.type.startsWith("image/")) throw new Error("画像ファイルを選択してください。");
    const folder = await getOrCreateDriveFolder(cat);
    const metadata = {
      name: `${new Date().toISOString().replace(/[:.]/g,"-")}_${file.name}`,
      parents: [folder.id],
      description: `保護猫DB ${cat.management_no} ${cat.name || ""}`
    };
    const boundary = "catdb_" + crypto.randomUUID();
    const body = new Blob([
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n`,
      JSON.stringify(metadata), "\r\n",
      `--${boundary}\r\nContent-Type: ${file.type || "application/octet-stream"}\r\n\r\n`,
      file, "\r\n",
      `--${boundary}--`
    ]);
    const response = await driveApi("upload/drive/v3/files?uploadType=multipart&fields=id,name,mimeType,webViewLink", {
      method:"POST",
      headers:{"Content-Type": `multipart/related; boundary=${boundary}`},
      body
    });
    if (!response.ok) throw new Error(`Driveアップロード失敗: ${await response.text()}`);
    return await response.json();
  }

  async function saveDriveMetadata(cat, driveFile, file, isMain) {
    const payload = {
      cat_id: cat.id,
      drive_file_id: driveFile.id,
      drive_folder_id: driveFile.parents?.[0] || "",
      file_name: driveFile.name || file.name,
      mime_type: driveFile.mimeType || file.type,
      file_url: driveFile.webViewLink || `https://drive.google.com/file/d/${driveFile.id}/view`,
      category: "photo",
      taken_at: today(),
      is_main_photo: Boolean(isMain),
      uploaded_by: state.user.id
    };

    if (isMain) {
      // DBの部分ユニークインデックスにより1枚だけ代表写真。
      // 既存代表写真を先に解除する。
      await state.supabase.from("cat_files")
        .update({is_main_photo:false})
        .eq("cat_id", cat.id)
        .eq("is_main_photo", true);
    }

    const {data, error} = await state.supabase.from("cat_files").insert(payload).select().single();
    if (error) throw error;

    if (isMain) {
      await state.supabase.from("cats")
        .update({main_photo_file_id:data.id, updated_by:state.user.id})
        .eq("id",cat.id);
    }
    return data;
  }

  async function uploadSelectedPhotos(files) {
    if (!state.selectedCat) return;
    try {
      await ensureGoogleToken();
      setDriveMessage(`${files.length}枚をアップロード中…`);
      for (let i=0; i<files.length; i++) {
        const driveFile = await uploadPhotoToDrive(files[i], state.selectedCat);
        // 最初の画像を代表写真にする
        await saveDriveMetadata(state.selectedCat, driveFile, files[i], i === 0 && state.selectedCat.files.length === 0);
      }
      toast("Google Driveへ写真を保存しました");
      await openCat(state.selectedCat.id);
      renderDriveFiles();
    } catch (e) {
      setDriveMessage(e.message || String(e), "error");
    }
  }

  function renderDriveFiles() {
    const box = $("drive-files");
    if (!box || !state.selectedCat) return;
    box.innerHTML = (state.selectedCat.files || []).map(f => `
      <div class="file-card">
        <a href="${esc(f.file_url)}" target="_blank" rel="noopener">
          <div class="cat-thumb">📷</div>
          <small>${esc(f.file_name)}</small>
        </a>
      </div>
    `).join("") || '<div class="muted">写真はまだありません。</div>';
  }

  // ---------------- 保健所提出用PDF ----------------

  function buildHealthForm(cat) {
    const vaccine = latest(cat.vaccinations);
    const test = latest(cat.virusTests);
    const surgery = latest(cat.surgeries);
    const main = cat.files.find(f => f.is_main_photo) || cat.files[0];
    const photo = main?.file_url
      ? `<img class="health-photo" src="${esc(main.file_url)}" alt="${esc(cat.name)}">`
      : `<div class="health-photo" style="display:grid;place-items:center;font-size:42pt">🐱</div>`;
    const observationText = (cat.observations || []).map(o => {
      const parts = [
        formatDate(o.observation_date),
        o.condition ? `体調：${o.condition}` : "",
        o.appetite ? `食欲：${o.appetite}` : "",
        o.stool ? `排便：${o.stool}` : "",
        o.urine ? `排尿：${o.urine}` : "",
        o.behavior ? `様子：${o.behavior}` : "",
        o.weight_kg ? `体重：${o.weight_kg}kg` : "",
        o.temperature_c ? `体温：${o.temperature_c}℃` : "",
        o.memo || ""
      ].filter(Boolean);
      return parts.join(" / ");
    }).join("\n");

    return `
      <div class="health-form">
        <div class="health-header">
          <div>保護猫</div>
          <div>管理番号</div>
          <div>${esc(cat.management_no)}</div>
        </div>
        <div class="health-body">
          <div class="health-left">
            ${photo}
            <div class="health-info-row"><div>名前</div><div>${esc(cat.name || "")}</div></div>
            <div class="health-info-row"><div>性別</div><div>${esc(SEX_LABEL[cat.sex])}</div></div>
            <div class="health-info-row"><div>保護日</div><div>${esc(formatDate(cat.rescued_date))}</div></div>
            <div class="health-info-row"><div>品種等</div><div>${esc(cat.breed || "")}</div></div>
            <div class="health-info-row"><div>保護時年齢・生まれ（推定）</div><div>${esc(cat.estimated_age_text || formatDate(cat.estimated_birth_date))}</div></div>
            <div class="health-info-row"><div>ワクチン</div><div>${vaccine ? `${esc(vaccine.vaccine_type)}　${esc(formatDate(vaccine.vaccination_date))}` : ""}</div></div>
            <div class="health-info-row"><div>不妊去勢手術日</div><div>${surgery ? esc(formatDate(surgery.surgery_date)) : ""}</div></div>
            <div class="health-info-row"><div>ウイルス検査日</div><div>${test ? esc(formatDate(test.test_date)) : ""}</div></div>
            <div class="health-info-row"><div>FIV</div><div>${test ? esc(TEST_LABEL[test.fiv_result]) : ""}</div></div>
            <div class="health-info-row"><div>FeLV</div><div>${test ? esc(TEST_LABEL[test.felv_result]) : ""}</div></div>
            <div class="health-observation-title">保護した時の状況・体調など　観察日記</div>
            <div class="health-observation">${esc(cat.rescue_details || "")}${observationText ? "\n\n" + esc(observationText) : ""}</div>
            <div class="health-footer">（死亡した場合は死亡日、原因） ${cat.deaths?.[0] ? `${esc(formatDate(cat.deaths[0].death_date))}　${esc(cat.deaths[0].cause || "")}` : ""}</div>
          </div>
          <div class="health-right">
            <div class="health-right-title">譲渡日　譲渡先</div>
            <div class="health-transfer-lines">
              ${cat.transfers?.[0] ? `<div style="padding:3mm">譲渡日：${esc(formatDate(cat.transfers[0].transfer_date))}<br>譲渡先：${esc(cat.transfers[0].recipient_name || "")}</div>` : ""}
            </div>
          </div>
        </div>
        <div style="font-size:9pt;padding-top:2mm">管理番号：${esc(cat.management_no)}</div>
      </div>
    `;
  }

  function printHealthForm() {
    if (!state.selectedCat) return;
    const oldTitle = document.title;
    const oldBody = document.body.innerHTML;
    const form = buildHealthForm(state.selectedCat);
    document.title = `保護猫_${state.selectedCat.management_no}_${state.selectedCat.name || ""}`;
    document.body.innerHTML = `<div class="health-actions"><button onclick="window.location.reload()">戻る</button></div>${form}`;
    window.print();
    setTimeout(() => {
      document.body.innerHTML = oldBody;
      document.title = oldTitle;
      // Rebind all events after restoring body.
      setupEvents();
      renderDetail();
      panel("detail-panel");
      initGoogleDrive();
    }, 500);
  }

  function setupEvents() {
    $("config-form").addEventListener("submit", async e => {
      e.preventDefault();
      cfg.supabaseUrl = $("config-url").value.trim();
      cfg.supabaseAnonKey = $("config-key").value.trim();
      saveConfig(cfg.supabaseUrl, cfg.supabaseAnonKey);
      try {
        if (!await initSupabase()) return;
        await loadSession();
        message("config-message","接続しました。","success");
      } catch (err) {
        message("config-message", err.message || String(err), "error");
      }
    });

    $("login-form").addEventListener("submit", async e => {
      e.preventDefault();
      message("login-message","ログイン中…");
      const { data, error } = await state.supabase.auth.signInWithPassword({
        email: $("login-email").value.trim(),
        password: $("login-password").value
      });
      if (error) return message("login-message", error.message, "error");
      state.user = data.user;
      await loadProfile();
      show("app-view");
      $("user-label").textContent = `${state.profile?.display_name || state.user.email} / ${state.profile?.role}`;
      await loadCats();
    });

    $("new-cat-button").addEventListener("click", () => openCatForm());
    $("refresh-button").addEventListener("click", () => loadCats().catch(err => toast(err.message)));
    $("logout-button").addEventListener("click", async () => {
      await state.supabase.auth.signOut();
      state.user = null; state.profile = null; state.cats = [];
      show("login-view");
    });
    $("search-input").addEventListener("input", renderCatList);
    $("status-filter").addEventListener("change", renderCatList);
    $("back-button").addEventListener("click", () => panel("list-panel"));
    $("edit-cat-button").addEventListener("click", () => openCatForm(state.selectedCat));
    $("cancel-cat-button").addEventListener("click", () => panel("detail-panel"));
    $("cancel-cat-button-2").addEventListener("click", () => panel("detail-panel"));
    $("cat-form").addEventListener("submit", saveCat);
    $("back-to-detail-button").addEventListener("click", () => panel("detail-panel"));
    $("cancel-observation-button").addEventListener("click", () => panel("detail-panel"));
    $("observation-form").addEventListener("submit", saveObservation);
    $("print-button").addEventListener("click", printHealthForm);
    $("google-connect-button").addEventListener("click", async () => {
      try {
        await ensureGoogleToken();
        setDriveMessage("Google Driveに接続しました。", "success");
      } catch (e) { setDriveMessage(e.message || String(e), "error"); }
    });
    $("photo-input").addEventListener("change", e => {
      const files = [...e.target.files];
      if (files.length) uploadSelectedPhotos(files);
      e.target.value = "";
    });
  }

  function setupInstall() {
    window.addEventListener("beforeinstallprompt", e => {
      e.preventDefault();
      state.deferredInstall = e;
      $("install-button").classList.remove("hidden");
    });
    $("install-button").addEventListener("click", async () => {
      if (!state.deferredInstall) return;
      state.deferredInstall.prompt();
      await state.deferredInstall.userChoice;
      state.deferredInstall = null;
      $("install-button").classList.add("hidden");
    });
  }

  async function init() {
    setupEvents();
    setupInstall();
    initGoogleDrive();

    if ("serviceWorker" in navigator) {
      try { await navigator.serviceWorker.register("./sw.js"); } catch (_) {}
    }

    try {
      const ok = await initSupabase();
      if (ok) await loadSession();
    } catch (err) {
      show("login-view");
      message("login-message", err.message || String(err), "error");
    }
  }

  init();
})();
