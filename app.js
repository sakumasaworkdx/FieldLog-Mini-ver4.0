const $ = (id) => document.getElementById(id);
let db, currentGeo = null, currentFile = null, currentHeading = null, currentDirName = "-", liveHeading = null;

// DB初期化
const req = indexedDB.open("offline_survey_pwa_db", 2);
req.onsuccess = (e) => { db = e.target.result; renderTable(); loadLists(); };

// 16方位
function getDirName(deg) {
    if (deg === null || deg === undefined) return "-";
    const d = ["北","北北東","北東","東北東","東","東南東","南東","南南東","南","南南西","南西","西南西","西","西北西","北西","北北西"];
    return d[Math.round(deg / 22.5) % 16];
}

// リアルタイム監視 (LIVE)
navigator.geolocation.watchPosition(p => {
    currentGeo = p;
    $("liveGPS").textContent = `${p.coords.latitude.toFixed(4)},${p.coords.longitude.toFixed(4)}`;
}, null, {enableHighAccuracy:true});

window.addEventListener("deviceorientationabsolute", (e) => {
    let h = e.webkitCompassHeading || (360 - e.alpha);
    if (h !== undefined) {
        liveHeading = Math.round(h);
        $("liveHeading").textContent = liveHeading + "° (" + getDirName(liveHeading) + ")";
    }
}, true);

// 記録ボタン（即転記）
$("btnGeo").onclick = () => {
    if(!currentGeo) return alert("GPS信号待機中...");
    $("lat").textContent = currentGeo.coords.latitude.toFixed(6);
    $("lng").textContent = currentGeo.coords.longitude.toFixed(6);
    if(liveHeading !== null) {
        currentHeading = liveHeading;
        currentDirName = getDirName(currentHeading);
        $("heading").textContent = `${currentHeading}° (${currentDirName})`;
    }
    $("geoCheck").textContent = "✅";
};

// CSV読み込み (単純にABC列を各プルダウンに)
$("listCsvInput").onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const text = await file.text();
    const rows = text.split(/\r?\n/).map(r => r.trim()).filter(r => r !== "");
    const tx = db.transaction("lists", "readwrite");
    const store = tx.objectStore("lists");
    await store.clear();
    rows.forEach((row, idx) => {
        const cols = row.split(",").map(c => c.replace(/^["']|["']$/g, '').trim());
        store.put({ id: idx, a: cols[0] || "", b: cols[1] || "", c: cols[2] || "" });
    });
    tx.oncomplete = () => { alert("リスト更新完了"); loadLists(); };
};

// リスト表示（単純に全読み込み）
async function loadLists() {
    if (!db) return;
    db.transaction("lists", "readonly").objectStore("lists").getAll().onsuccess = (e) => {
        const data = e.target.result;
        const updateSelect = (id, values, label) => {
            const el = $(id);
            el.innerHTML = `<option value="">${label}</option>`;
            [...new Set(values)].filter(v => v).forEach(v => {
                const opt = document.createElement("option");
                opt.value = opt.textContent = v; el.appendChild(opt);
            });
        };
        updateSelect("selLocation", data.map(d => d.a), "地点を選択");
        updateSelect("selSubLocation", data.map(d => d.b), "小区分を選択");
        updateSelect("selItem", data.map(d => d.c), "項目を選択");
    };
}

// 写真
$("photoInput").onchange = (e) => {
    currentFile = e.target.files[0];
    if(currentFile) {
        $("photoCheck").textContent = "✅";
        $("imgPreview").src = URL.createObjectURL(currentFile);
        $("previewContainer").style.display = "block";
    }
};

// 保存
$("btnSave").onclick = async () => {
    if (!currentFile && $("selLocation").value === "") return alert("データがありません");
    const id = Date.now();
    const rec = {
        id: id, createdAt: new Date().toISOString(),
        lat: $("lat").textContent === "-" ? 0 : parseFloat($("lat").textContent),
        lng: $("lng").textContent === "-" ? 0 : parseFloat($("lng").textContent),
        heading: currentHeading || 0,
        headingName: currentDirName || "-",
        location: $("selLocation").value || "-",
        subLocation: $("selSubLocation").value || "-",
        item: $("selItem").value || "-",
        memo: $("memo").value,
        photoName: currentFile ? `img_${id}.jpg` : "no_image.jpg",
        photoBlob: currentFile || new Blob([])
    };
    db.transaction("surveys", "readwrite").objectStore("surveys").put(rec).onsuccess = () => {
        alert("保存完了");
        currentFile = null; $("previewContainer").style.display = "none";
        $("photoCheck").textContent = ""; $("memo").value = "";
        renderTable();
    };
};

// 一括DL (JSZipオフライン対応)
$("btnDownloadAll").onclick = async () => {
    if (typeof JSZip === 'undefined') return alert("JSZip未読込");
    db.transaction("surveys", "readonly").objectStore("surveys").getAll().onsuccess = async (e) => {
        const data = e.target.result;
        if (!data.length) return alert("データなし");
        const zip = new JSZip();
        let csv = "\ufeffID,日時,緯度,経度,方位,地点,小区分,項目,備考\n";
        for (const r of data) {
            csv += `${r.id},${r.createdAt},${r.lat},${r.lng},${r.headingName},${r.location},${r.subLocation},${r.item},"${r.memo.replace(/"/g,'""')}"\n`;
            if (r.photoBlob.size > 0) zip.file(r.photoName, r.photoBlob);
        }
        zip.file("data.csv", csv);
        const content = await zip.generateAsync({type:"blob"});
        const a = document.createElement("a");
        a.href = URL.createObjectURL(content);
        a.download = `survey_${Date.now()}.zip`;
        a.click();
    };
};

async function renderTable() {
    if (!db) return;
    db.transaction("surveys", "readonly").objectStore("surveys").getAll().onsuccess = (e) => {
        const listEl = $("list"); listEl.innerHTML = "";
        e.target.result.sort((a,b)=>b.id-a.id).forEach(r => {
            const tr = document.createElement("tr");
            tr.innerHTML = `<td style="padding:10px; border-bottom:1px solid #333;">${r.location}</td><td style="color:#0f0; text-align:right;">${r.photoBlob.size>0?"◯":"-"}</td>`;
            listEl.appendChild(tr);
        });
    };
}

// 全削除
$("btnDeleteAll").onclick = () => {
    if (confirm("全削除しますか？")) {
        db.transaction("surveys", "readwrite").objectStore("surveys").clear().onsuccess = () => renderTable();
    }
};
