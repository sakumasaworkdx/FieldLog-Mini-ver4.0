const $ = (id) => document.getElementById(id);
let db, currentGeo = null, currentFile = null, currentHeading = null, currentDirName = "-", liveHeading = null;

// DB初期化
const req = indexedDB.open("offline_survey_pwa_db", 2);
req.onupgradeneeded = (e) => {
    const d = e.target.result;
    if (!d.objectStoreNames.contains("surveys")) d.createObjectStore("surveys", { keyPath: "id" });
    if (!d.objectStoreNames.contains("lists")) d.createObjectStore("lists", { keyPath: "id" });
};
req.onsuccess = (e) => { db = e.target.result; renderTable(); loadLists(); };

// リアルタイムGPS & 方位
navigator.geolocation.watchPosition(p => {
    currentGeo = p;
    $("liveGPS").textContent = `${p.coords.latitude.toFixed(4)},${p.coords.longitude.toFixed(4)}`;
}, null, {enableHighAccuracy:true});

window.addEventListener("deviceorientationabsolute", (e) => {
    let h = e.webkitCompassHeading || (360 - e.alpha);
    if (h !== undefined) {
        liveHeading = Math.round(h);
        $("liveHeading").textContent = liveHeading + "°";
    }
}, true);

// 記録ボタン（待ち時間ゼロ）
$("btnGeo").onclick = () => {
    if(!currentGeo) return alert("GPS信号待機中...");
    $("lat").textContent = currentGeo.coords.latitude.toFixed(6);
    $("lng").textContent = currentGeo.coords.longitude.toFixed(6);
    if(liveHeading !== null) {
        currentHeading = liveHeading;
        currentDirName = ["北","北北東","北東","東北東","東","東南東","南東","南南東","南","南南西","南西","西南西","西","西北西","北西","北北西"][Math.round(currentHeading/22.5)%16];
        $("heading").textContent = `${currentHeading}° (${currentDirName})`;
    }
    $("geoCheck").textContent = "✅";
};

// 写真撮影
$("photoInput").onchange = (e) => {
    currentFile = e.target.files[0];
    if(currentFile) {
        $("photoCheck").textContent = "✅";
        $("imgPreview").src = URL.createObjectURL(currentFile);
        $("previewContainer").style.display = "block";
    }
};

// --- ここから一括DL修正版 ---
$("btnDownloadAll").onclick = async () => {
    if (!window.JSZip) return alert("ライブラリが読み込めていません。ネット環境を確認してください");
    const tx = db.transaction("surveys", "readonly");
    tx.objectStore("surveys").getAll().onsuccess = async (e) => {
        const data = e.target.result;
        if (!data.length) return alert("データがありません");
        
        const zip = new JSZip();
        let csv = "\ufeffID,日時,緯度,経度,方位,地点,小区分,項目,備考,写真\n";

        for (const r of data) {
            csv += `${r.id},${r.createdAt},${r.lat},${r.lng},${r.headingName},${r.location},${r.subLocation},${r.item},"${r.memo}",${r.photoName}\n`;
            if (r.photoBlob && r.photoBlob.size > 0) {
                zip.file(r.photoName, r.photoBlob);
            }
        }
        zip.file("data.csv", csv);
        const content = await zip.generateAsync({type:"blob"});
        const a = document.createElement("a");
        a.href = URL.createObjectURL(content);
        a.download = `survey_${Date.now()}.zip`;
        a.click();
    };
};

// 保存・リスト・削除系ロジック（以下、あなたのv3.7と同様に継続...）
