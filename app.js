const $ = (id) => document.getElementById(id);
let db, currentGeo = null, currentFile = null, currentHeading = null, currentDirName = "-", liveHeading = null;

// --- 1. DB初期化 (確実にストアを作成) ---
const req = indexedDB.open("offline_survey_pwa_db", 2);
req.onupgradeneeded = (e) => {
    const d = e.target.result;
    if (!d.objectStoreNames.contains("surveys")) d.createObjectStore("surveys", { keyPath: "id" });
    if (!d.objectStoreNames.contains("lists")) d.createObjectStore("lists", { keyPath: "id" });
};
req.onsuccess = (e) => { 
    db = e.target.result; 
    renderTable(); 
    loadLists(); 
};

// --- 2. リアルタイム監視 ---
const getDir = (deg) => {
    if (deg === null) return "-";
    const d = ["北","北北東","北東","東北東","東","東南東","南東","南南東","南","南南西","南西","西南西","西","西北西","北西","北北西"];
    return d[Math.round(deg / 22.5) % 16];
};

navigator.geolocation.watchPosition(p => {
    currentGeo = p;
    $("liveGPS").textContent = `${p.coords.latitude.toFixed(4)},${p.coords.longitude.toFixed(4)}`;
}, null, {enableHighAccuracy:true});

window.addEventListener("deviceorientationabsolute", (e) => {
    let h = e.webkitCompassHeading || (360 - e.alpha);
    if (h !== undefined) { 
        liveHeading = Math.round(h); 
        $("liveHeading").textContent = liveHeading + "° (" + getDir(liveHeading) + ")"; 
    }
}, true);

// --- 3. 記録・写真 ---
$("btnGeo").onclick = () => {
    if(!currentGeo) return alert("GPS受信中...");
    $("lat").textContent = currentGeo.coords.latitude.toFixed(6);
    $("lng").textContent = currentGeo.coords.longitude.toFixed(6);
    currentHeading = liveHeading;
    currentDirName = getDir(currentHeading);
    $("heading").textContent = `${currentHeading}° (${currentDirName})`;
    $("geoCheck").textContent = "✅";
};

$("photoInput").onchange = (e) => {
    currentFile = e.target.files[0];
    if(currentFile) {
        $("photoCheck").textContent = "✅";
        $("imgPreview").src = URL.createObjectURL(currentFile);
        $("previewContainer").style.display = "block";
    }
};

// --- 4. CSV読み込み (ABC列独立読込) ---
$("listCsvInput").onchange = async (e) => {
    if (!db) return alert("DB準備中...");
    const file = e.target.files[0];
    if (!file) return;

    const text = await file.text();
    const rows = text.split(/\r?\n/).filter(r => r.trim() !== "");
    
    const tx = db.transaction("lists", "readwrite");
    const store = tx.objectStore("lists");
    await store.clear();

    rows.forEach((row, idx) => {
        const c = row.split(",").map(v => v.replace(/["']/g, "").trim());
        store.put({ id: idx, a: c[0]||"", b: c[1]||"", c: c[2]||"" });
    });

    tx.oncomplete = () => { 
        alert("CSV読込完了: " + rows.length + "件"); 
        loadLists(); 
    };
    tx.onerror = () => alert("CSV保存エラー");
};

async function loadLists() {
    if (!db) return;
    const tx = db.transaction("lists", "readonly");
    tx.objectStore("lists").getAll().onsuccess = (e) => {
        const d = e.target.result;
        const upd = (id, vals, lbl) => {
            const items = [...new Set(vals)].filter(v => v !== "");
            $(id).innerHTML = `<option value="">${lbl}</option>` + 
                items.map(v => `<option value="${v}">${v}</option>`).join("");
        };
        upd("selLocation", d.map(x => x.a), "地点を選択");
        upd("selSubLocation", d.map(x => x.b), "小区分を選択");
        upd("selItem", d.map(x => x.c), "項目を選択");
    };
}

// --- 5. データ保存 ---
$("btnSave").onclick = () => {
    if (!$("selLocation").value && !currentFile) return alert("保存するデータがありません");
    const id = Date.now();
    const rec = {
        id: id, createdAt: new Date().toLocaleString('ja-JP'),
        lat: $("lat").textContent, lng: $("lng").textContent,
        heading: currentHeading || 0, headingName: currentDirName,
        location: $("selLocation").value, subLocation: $("selSubLocation").value,
        item: $("selItem").value, memo: $("memo").value,
        photoName: currentFile ? `img_${id}.jpg` : "no_image.jpg",
        photoBlob: currentFile || new Blob([])
    };
    const tx = db.transaction("surveys", "readwrite");
    tx.objectStore("surveys").put(rec).onsuccess = () => {
        alert("保存完了");
        $("photoCheck").textContent = ""; $("memo").value = "";
        $("previewContainer").style.display = "none";
        renderTable();
    };
};

// --- 6. 一括DL (JSZip) ---
$("btnDownloadAll").onclick = async () => {
    if (typeof JSZip === "undefined") return alert("JSZipが読み込まれていません。./jszip.min.jsを確認してください。");
    db.transaction("surveys", "readonly").objectStore("surveys").getAll().onsuccess = async (e) => {
        const data = e.target.result;
        if (!data.length) return alert("データがありません");
        const zip = new JSZip();
        let csv = "\ufeff日時,緯度,経度,方位,地点,小区分,項目,備考,写真\n";
        for (const r of data) {
            csv += `${r.createdAt},${r.lat},${r.lng},${r.headingName},${r.location},${r.subLocation},${r.item},"${r.memo}",${r.photoName}\n`;
            if (r.photoBlob && r.photoBlob.size > 0) zip.file(r.photoName, r.photoBlob);
        }
        zip.file("data.csv", csv);
        const blob = await zip.generateAsync({type:"blob"});
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = `survey_data_${Date.now()}.zip`;
        a.click();
    };
};

function renderTable() {
    if (!db) return;
    db.transaction("surveys", "readonly").objectStore("surveys").getAll().onsuccess = (e) => {
        $("list").innerHTML = e.target.result.sort((a,b)=>b.id-a.id).map(r => `
            <tr><td>${r.location}</td><td style="color:#0f0; text-align:right;">${r.photoBlob.size>0?"◯":"-"}</td></tr>
        `).join("");
    };
}

$("btnDeleteAll").onclick = () => {
    if(confirm("全データを削除しますか？")) {
        db.transaction("surveys", "readwrite").objectStore("surveys").clear().onsuccess = () => renderTable();
    }
};
