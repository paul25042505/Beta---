// ══════════════════════════════════════════
// 定訓推播腳本
// 每小時執行，比對定訓排程 + 個人推播時間
// ══════════════════════════════════════════

const webpush = require('web-push');
const admin   = require('firebase-admin');

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

webpush.setVapidDetails(
  'mailto:paul25042505@gmail.com',
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
);

function getTWTimeInfo() {
  const now = new Date();
  const tw  = new Date(now.getTime() + 8 * 60 * 60 * 1000);
  const currentHour = process.env.FORCE_HOUR
    ? parseInt(process.env.FORCE_HOUR)
    : tw.getUTCHours();
  const tomorrow = new Date(tw);
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  const y = tomorrow.getUTCFullYear();
  const m = String(tomorrow.getUTCMonth() + 1).padStart(2, '0');
  const d = String(tomorrow.getUTCDate()).padStart(2, '0');
  return { currentHour, tomorrow: `${y}-${m}-${d}` };
}

async function main() {
  const { currentHour, tomorrow } = getTWTimeInfo();
  console.log(`目前台灣時間：${currentHour}:xx，檢查明天（${tomorrow}）的定訓排程...`);

  // 查詢明天有定訓且有開啟推播的排程
  const snap = await db.collection('trainingSchedule')
    .where('date', '==', tomorrow)
    .where('notify', '==', true)
    .get();

  if (snap.empty) {
    console.log('明天沒有定訓排程，不推播。');
    return;
  }

  const meetings = snap.docs.map(d => d.data());
  const titles   = meetings.map(m => m.topic || '定訓').join('、');
  const units    = [...new Set(meetings.map(m => m.unit).filter(Boolean))];
  console.log(`找到 ${meetings.length} 筆定訓：${titles}，分隊：${units.join('、')}`);

  const payload = JSON.stringify({
    title: '🔔 明天有定訓！',
    body:  `${tomorrow} ${titles}，請準時出席`,
    url:   'https://paul25042505.github.io/Emergency-Volunteer-System/#meetingPage',
    tag:   'training-reminder',
  });

  // 讀取所有訂閱
  const subsSnap = await db.collection('pushSubscriptions').get();
  if (subsSnap.empty) { console.log('沒有訂閱記錄。'); return; }
  console.log(`共 ${subsSnap.size} 個訂閱，篩選符合時間的...`);

  let success = 0, fail = 0, skip = 0;
  const deletePromises = [];

  for (const doc of subsSnap.docs) {
    const sub = doc.data();

    // 若定訓有指定分隊，只推對應分隊
    if (units.length > 0 && sub.unit && !units.includes(sub.unit)) {
      skip++; continue;
    }

    // 比對個人設定的推播時間（預設 [20]）
    const notifyHours = sub.notifyHours && sub.notifyHours.length
      ? sub.notifyHours
      : [20];

    if (!notifyHours.includes(currentHour)) {
      console.log(`  ⏭ 跳過 ${sub.memberName}（設定時間：${notifyHours.join('、')}點，現在是 ${currentHour} 點）`);
      skip++; continue;
    }

    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        payload
      );
      success++;
      console.log(`  ✅ 成功：${sub.memberName || doc.id}`);
    } catch(err) {
      fail++;
      console.log(`  ❌ 失敗：${sub.memberName || doc.id}，${err.message}`);
      if (err.statusCode === 410 || err.statusCode === 404) {
        deletePromises.push(db.collection('pushSubscriptions').doc(doc.id).delete());
      }
    }
  }

  if (deletePromises.length > 0) {
    await Promise.all(deletePromises);
    console.log(`已清除 ${deletePromises.length} 個失效訂閱`);
  }
  console.log(`推播完成：成功 ${success}，失敗 ${fail}，跳過 ${skip}`);
}

main().catch(err => { console.error('執行失敗：', err); process.exit(1); });
