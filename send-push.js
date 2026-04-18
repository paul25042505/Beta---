// ══════════════════════════════════════════
// 定訓前一天推播腳本
// 每天晚上 8 點執行，找出明天有定訓的紀錄
// ══════════════════════════════════════════

const webpush = require('web-push');
const admin   = require('firebase-admin');

// ── 初始化 Firebase Admin ──
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});
const db = admin.firestore();

// ── 設定 VAPID ──
webpush.setVapidDetails(
  'mailto:paul25042505@gmail.com',
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
);

// ── 計算明天的日期（台灣時間）──
function getTomorrowStr() {
  const now = new Date();
  const tw  = new Date(now.getTime() + 8 * 60 * 60 * 1000);
  tw.setDate(tw.getDate() + 1);
  const y = tw.getUTCFullYear();
  const m = String(tw.getUTCMonth() + 1).padStart(2, '0');
  const d = String(tw.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

async function main() {
  const tomorrow = getTomorrowStr();
  console.log(`檢查明天（${tomorrow}）是否有定訓...`);

  // 查詢 trainDate === 明天 的定訓記錄
  const meetingSnap = await db.collection('trainingSchedule')
    '.where('date', '==', tomorrow)
    .get();

  if (meetingSnap.empty) {
    console.log('明天沒有定訓，不推播。');
    return;
  }

  const meetings = meetingSnap.docs.map(d => d.data());
  const titles   = meetings.map(m => m.title || '定訓').join('、');
  const units    = [...new Set(meetings.map(m => m.unit).filter(Boolean))];
  console.log(`找到明天的定訓：${titles}，分隊：${units.join('、') || '全體'}`);

  // 讀取所有訂閱
  const subsSnap = await db.collection('pushSubscriptions').get();
  if (subsSnap.empty) { console.log('沒有訂閱記錄。'); return; }

  console.log(`共 ${subsSnap.size} 個訂閱，開始推播...`);

  const payload = JSON.stringify({
    title: '🔔 明天有定訓！',
    body:  `${tomorrow} ${titles}，請準時出席`,
    url:   'https://paul25042505.github.io/Emergency-Volunteer-System/#meetingPage',
    tag:   'training-reminder',
  });

  let success = 0, fail = 0;
  const deletePromises = [];

  for (const doc of subsSnap.docs) {
    const sub = doc.data();

    // 若定訓有指定分隊，只推給對應分隊
    if (units.length > 0 && sub.unit && !units.includes(sub.unit)) continue;

    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        payload
      );
      success++;
      console.log(`✅ 成功：${sub.memberName || doc.id}`);
    } catch(err) {
      fail++;
      console.log(`❌ 失敗：${sub.memberName || doc.id}，${err.message}`);
      if (err.statusCode === 410 || err.statusCode === 404) {
        deletePromises.push(db.collection('pushSubscriptions').doc(doc.id).delete());
      }
    }
  }

  if (deletePromises.length > 0) {
    await Promise.all(deletePromises);
    console.log(`已清除 ${deletePromises.length} 個失效訂閱`);
  }

  console.log(`推播完成：成功 ${success}，失敗 ${fail}`);
}

main().catch(err => { console.error('執行失敗：', err); process.exit(1); });