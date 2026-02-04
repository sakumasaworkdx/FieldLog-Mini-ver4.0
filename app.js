const $ = (id) => document.getElementById(id);
let db, currentGeo = null, currentFile = null, currentHeading = null, currentDirName = "-";
// リアルタイム表示用の変数
let liveHeading = null;

const req = indexedDB.open("offline_survey_pwa_db", 2);
req.onupgradeneeded = (e) => {
    const d = e.target.result;
    if (!d.objectStoreNames.contains("surveys")) d.createObjectStore("surveys", { keyPath: "id" });
    if (!d.objectStoreNames.contains("lists")) d.createObjectStore("lists", { keyPath: "id" });
};
req.onsuccess = (e) => { db = e.target.result; renderTable(); loadLists(); };

function getDirectionName(deg) {
    if (deg === null || deg === undefined || deg === "-") return "-";
    const directions = ["北", "北北東", "北東", "東北東", "東", "東南東", "南東", "南南東", "南", "南南西", "南西", "西南西", "西", "西北西", "北西", "北北西"];
    const index = Math.round(deg / 22.5) % 16;
    return directions[index];
}

// --- リアルタイム方位監視 ---
function updateLiveHeading(e) {
    let h = e.webkitCompassHeading || (360 - e.alpha);
    if (h !== undefined) {
        liveHeading = Math.round(h);
        const liveDir = getDirectionName(liveHeading);
        if($("liveHeading")) $("liveHeading").textContent = `${liveHeading}° (${liveDir})`;
    }
}
window.addEventListener("deviceorientationabsolute", updateLiveHeading, true) || 
window.addEventListener("deviceorientation", updateLiveHeading, true);

// --- リアルタイムGPS監視 ---
navigator.geolocation.watchPosition((p) => {
    const c = p.coords;
    if($("liveGPS")) $("liveGPS").textContent = `${c.latitude.toFixed(4)},${c.longitude.toFixed(4)} (±${Math.round(c.accuracy)}m)`;
    // 常に最新の座標を内部的に保持
    currentGeo = p; 
}, (err) => {}, { enableHighAccuracy: true });

// --- ボタンを押したときだけ「確定」させる ---
$("btnGeo").onclick = async () => {
    if (!currentGeo) { alert("GPS取得を待ってください"); return; }
    
    // 現在のリアルタイム値を確定値として反映
    $("lat").textContent = currentGeo.coords.latitude.toFixed(6);
    $("lng").textContent = currentGeo.coords.longitude.toFixed(6);
    
    if (liveHeading !== null) {
        currentHeading = liveHeading;
        currentDirName = getDirectionName(currentHeading);
        $("heading").textContent = `${currentHeading}° (${currentDirName})`;
    }
    $("geoCheck").textContent = "✅";
};

// --- 以下、あなたのv3.7のロジックを100%継承 ---

$("photoInput").onchange = (e) => {
    currentFile = e.target.files[0];
    if(currentFile) {
        $("photoCheck").textContent = "✅";
        const reader = new FileReader();
        reader.onload = (re) => {
            $("imgPreview").src = re.target.result;
            $("previewContainer").style.display = "block";
        };
        reader.readAsDataURL(currentFile);
    }
};

$("listCsvInput").onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
        const text = await file.text();
        const rows = text.split(/\r?\n/).map(r => r.trim()).filter(r => r !== "");
        const tx = db.transaction("lists", "readwrite");
        const store = tx.objectStore("lists");
        await store.clear();
        rows.forEach((row, idx) => {
            const cols = row.split(",").map(c => c.replace(/^["']|["']$/g, '').trim());
            if (cols.length >= 1) {
                store.put({ id: idx, loc: cols[0] || "", sub: cols[1] || "", item: cols[2] || "" });
            }
        });
        tx.oncomplete = () => { alert("リスト更新完了"); loadLists(); };
    } catch (err) { alert("読み込み失敗"); }
};

async function loadLists() {
    if (!db) return;
    const tx = db.transaction("lists", "readonly");
    tx.objectStore("lists").getAll().onsuccess = (e) => {
        const data = e.target.result;
        const updateSelect = (id, values, label) => {
            const el = $(id);
            el.innerHTML = `<option value="">${label}</option>`;
            const headers = ["地点", "小区分", "項目", "loc", "sub", "item"];
            [...new Set(values)].filter(v => v && !headers.includes(v.toLowerCase())).forEach(v => {
                const opt = document.createElement("option");
                opt.value = opt.textContent = v; el.appendChild(opt);
            });
        };
        updateSelect("selLocation", data.map(d => d.loc), "地点を選択");
        updateSelect("selSubLocation", data.map(d => d.sub), "小区分を選択");
        updateSelect("selItem", data.map(d => d.item), "項目を選択");
    };
}

$("btnSave").onclick = async () => {
    const hasData = currentFile || $("memo").value.trim() !== "" || $("selLocation").value !== "";
    if (!hasData) { alert("保存するデータがありません"); return; }
    const id = Date.now();
    const rec = {
        id: id, createdAt: new Date().toISOString(),
        lat: currentGeo ? currentGeo.coords.latitude : 0,
        lng: currentGeo ? currentGeo.coords.longitude : 0,
        heading: currentHeading || 0,
        headingName: currentDirName || "-",
        location: $("selLocation").value || "-",
        subLocation: $("selSubLocation").value || "-",
        item: $("selItem").value || "-",
        memo: $("memo").value,
        photoName: currentFile ? `img_${id}.jpg` : "no_image.jpg",
        photoBlob: currentFile || new Blob([])
    };
    const tx = db.transaction("surveys", "readwrite");
    tx.objectStore("surveys").put(rec).onsuccess = () => {
        alert("保存完了");
        currentFile = null; $("previewContainer").style.display = "none";
        $("photoCheck").textContent = ""; $("memo").value = "";
        renderTable(); 
    };
};

async function renderTable() {
    if (!db) return;
    const tx = db.transaction("surveys", "readonly");
    tx.objectStore("surveys").getAll().onsuccess = (e) => {
        const listEl = $("list");
        listEl.innerHTML = "";
        e.target.result.sort((a,b) => b.id - a.id).forEach(r => {
            const tr = document.createElement("tr");
            tr.style.fontSize = "11px";
            tr.innerHTML = `<td style="text-align:left;">${r.location}</td><td style="text-align:left;">${r.subLocation}</td><td style="text-align:left;">${r.item}</td><td class="photo-cell" style="cursor:pointer; color:#00bb55; font-weight:bold; font-size:16px;">${r.photoBlob.size > 0 ? "◯" : "-"}</td><td>${r.lat !== 0 ? "◯" : "-"}</td>`;
            if (r.photoBlob.size > 0) {
                tr.querySelector(".photo-cell").onclick = () => {
                    const reader = new FileReader();
                    reader.onload = (re) => {
                        $("imgPreview").src = re.target.result; $("previewContainer").style.display = "block";
                        $("previewLabel").innerHTML = `【履歴】${r.location}<br>方位: ${r.heading}° (${r.headingName}) / ${r.memo || ""}`;
                        window.scrollTo({ top: 0, behavior: 'smooth' });
                    };
                    reader.readAsDataURL(r.photoBlob);
                };
            }
            listEl.appendChild(tr);
        });
    };
}

// 削除と一括ダウンロードも、あなたのv3.7コードをそのまま維持
$("btnDeleteAll").onclick = async () => {
    if (!confirm("【注意】すべての保存履歴を削除します。よろしいですか？")) return;
    const check = prompt("確認のため、ひらがなで「さくじょ」と入力してください");
    if (check !== "さくじょ") { alert("入力中止"); return; }
    const tx = db.transaction("surveys", "readwrite");
    tx.objectStore("surveys").clear().onsuccess = () => { alert("削除完了"); renderTable(); };
};

$("btnDownloadAll").onclick = async () => {
    const tx = db.transaction("surveys", "readonly");
    tx.objectStore("surveys").getAll().onsuccess = async (e) => {
        const data = e.target.result;
        if (!data || data.length === 0) { alert("データなし"); return; }
        const zip = new JSZip();
        let csv = "ID,日時,緯度,経度,方位(度),方位(名称),地点,小区分,項目,備考,写真名\n";
        for (const r of data) {
            csv += `${r.id},${r.createdAt},${r.lat},${r.lng},${r.heading || 0},${r.headingName || "-"},${r.location},${r.subLocation},${r.item},"${(r.memo || "").replace(/"/g, '""')}",${r.photoName}\n`;
            if (r.photoBlob && r.photoBlob.size > 0) {
                const arrayBuffer = await r.photoBlob.arrayBuffer();
                zip.file(r.photoName, arrayBuffer);
            }
        }
        zip.file("data_list.csv", "\ufeff" + csv);
        const content = await zip.generateAsync({ type: "blob" });
        const link = document.createElement("a");
        link.href = URL.createObjectURL(content);
        link.download = `survey_data_${Date.now()}.zip`;
        link.click();
    };
};
