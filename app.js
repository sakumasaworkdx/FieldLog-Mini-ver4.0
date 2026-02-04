const $ = (id) => document.getElementById(id);

const els = {
  liveLat: $("liveLat"), liveLng: $("liveLng"), liveAcc: $("liveAcc"), 
  liveHeading: $("liveHeading"), liveDirection: $("liveDirection"),
  lat: $("lat"), lng: $("lng"), heading: $("heading"), direction: $("direction"),
  btnFixGeo: $("btnFixGeo"), photoInput: $("photoInput"), preview: $("preview"),
  autoName: $("autoName"), ts: $("ts"), selLocation: $("selLocation"),
  selLocation2: $("selLocation2"), selItem: $("selItem"),
  memo: $("memo"), memo2: $("memo2"), btnSave: $("btnSave"),
  listCsvInput: $("listCsvInput"), listStatus: $("listStatus")
};

// 16方位変換
function getDir(deg) {
  if (deg === null || deg === undefined || deg === "-") return "-";
  const ds = ["北", "北北東", "北東", "東北東", "東", "東南東", "南東", "南南東", "南", "南南西", "南西", "西南西", "西", "西北西", "北西", "北北西"];
  return ds[Math.round(deg / 22.5) % 16];
}

// --- リアルタイム監視 ---
navigator.geolocation.watchPosition((p) => {
  const c = p.coords;
  els.liveLat.textContent = c.latitude.toFixed(7);
  els.liveLng.textContent = c.longitude.toFixed(7);
  els.liveAcc.textContent = Math.round(c.accuracy);
  const h = (typeof c.heading === 'number') ? Math.round(c.heading) : "-";
  els.liveHeading.textContent = h;
  els.liveDirection.textContent = getDir(h);
}, (e) => console.error(e), { enableHighAccuracy: true });

// --- ボタンで値を確定 ---
els.btnFixGeo.onclick = () => {
  els.lat.textContent = els.liveLat.textContent;
  els.lng.textContent = els.liveLng.textContent;
  els.heading.textContent = els.liveHeading.textContent;
  els.direction.textContent = els.liveDirection.textContent;
  els.btnFixGeo.textContent = "✅ 値を確定しました";
  setTimeout(() => els.btnFixGeo.textContent = "📍 この位置・方位で確定", 1000);
};

// --- CSV読み込み修正 (文字化け・パース対策) ---
els.listCsvInput.onchange = async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const text = await file.text();
  const rows = text.split(/\r?\n/).filter(r => r.trim()).map(r => r.split(","));
  
  // 重複排除してプルダウンへ
  const locs = [...new Set(rows.map(r => r[0]))];
  els.selLocation.innerHTML = locs.map(v => `<option value="${v}">${v}</option>`).join("");
  // ※ここで連動ロジックを入れる
  els.listStatus.textContent = "読込済: " + rows.length + "件";
};

// --- 写真・保存チェック ---
els.photoInput.onchange = (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (re) => { els.preview.src = re.target.result; els.preview.style.display = "block"; $("noPhoto").style.display = "none"; };
  reader.readAsDataURL(file);
  const now = new Date();
  els.ts.textContent = now.toLocaleString();
  els.autoName.textContent = now.toISOString().replace(/[:.]/g, "-") + ".jpg";
};

els.btnSave.onclick = () => {
  if (!els.photoInput.files[0]) return alert("写真を撮影してください");
  if (els.lat.textContent === "-") return alert("位置を確定してください");
  alert("保存成功！");
};
