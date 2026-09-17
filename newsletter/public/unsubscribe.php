<?php
declare(strict_types=1);

require dirname(__DIR__) . '/src/bootstrap.php';

$token = strtolower(trim((string) ($_GET['token'] ?? '')));
$valid = false;
if (preg_match('/^[a-f0-9]{64}$/', $token) === 1) {
    try {
        $statement = database()->prepare("UPDATE newsletter_subscribers SET status='UNSUBSCRIBED',unsubscribed_at=CURRENT_TIMESTAMP WHERE unsubscribe_token=? AND status='ACTIVE'");
        $statement->execute([$token]);
        $valid = $statement->rowCount() > 0;
    } catch (Throwable $error) {
        error_log('newsletter_unsubscribe_failed: ' . $error->getMessage());
    }
}

$shopUrl = html(public_http_url('SHOP_URL', 'http://localhost:3000'));
$title = $valid ? 'ยกเลิกการรับข่าวสารแล้ว' : 'ลิงก์ไม่ถูกต้องหรือถูกใช้งานแล้ว';
$message = $valid ? 'เราจะไม่ส่งข่าวสารและโปรโมชันไปยังอีเมลนี้อีก' : 'หากต้องการความช่วยเหลือ กรุณาติดต่อ Smart Home Store';
?>
<!doctype html>
<html lang="th">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title><?= html($title) ?></title></head>
<body style="margin:0;display:grid;min-height:100vh;place-items:center;background:#f3f6fa;font-family:Tahoma,Arial,sans-serif;color:#10243e">
  <main style="width:min(520px,calc(100% - 32px));box-sizing:border-box;border:1px solid #dfe7f1;border-radius:24px;background:white;padding:42px;text-align:center;box-shadow:0 20px 60px rgba(7,28,54,.09)">
    <div style="margin:auto;display:grid;width:64px;height:64px;place-items:center;border-radius:50%;background:#eaf2ff;color:#1768ff;font-size:28px">✓</div>
    <h1 style="margin:22px 0 10px;font-size:28px"><?= html($title) ?></h1>
    <p style="margin:0;color:#64748b;line-height:1.8"><?= html($message) ?></p>
    <a href="<?= $shopUrl ?>" style="display:inline-block;margin-top:26px;border-radius:12px;background:#1768ff;padding:14px 24px;color:white;font-weight:bold;text-decoration:none">กลับไปยัง Smart Home Store</a>
  </main>
</body>
</html>
