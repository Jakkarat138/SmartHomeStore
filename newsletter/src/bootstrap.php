<?php
declare(strict_types=1);

use PHPMailer\PHPMailer\Exception as MailException;
use PHPMailer\PHPMailer\PHPMailer;

require dirname(__DIR__) . '/vendor/autoload.php';

function env_value(string $key, string $default = ''): string
{
    $value = getenv($key);
    return $value === false ? $default : trim($value);
}

function json_response(array $payload, int $status = 200): never
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function require_internal_request(): void
{
    $expected = env_value('NEWSLETTER_SHARED_SECRET');
    $received = (string) ($_SERVER['HTTP_X_NEWSLETTER_SECRET'] ?? '');
    if ($expected === '' || !hash_equals($expected, $received)) {
        json_response(['error' => 'ไม่ได้รับอนุญาตให้เรียกบริการนี้'], 403);
    }
}

function database(): PDO
{
    static $pdo = null;
    if ($pdo instanceof PDO) {
        return $pdo;
    }

    $host = env_value('DB_HOST', 'mysql');
    $port = env_value('DB_PORT', '3306');
    $name = env_value('DB_NAME', 'smart_home_store');
    $user = env_value('DB_USER', 'smart_user');
    $password = env_value('DB_PASSWORD', 'smart_password');
    $dsn = "mysql:host={$host};port={$port};dbname={$name};charset=utf8mb4";

    $pdo = new PDO($dsn, $user, $password, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES => false,
    ]);
    return $pdo;
}

function public_http_url(string $key, string $default): string
{
    $url = rtrim(env_value($key, $default), '/');
    if (!filter_var($url, FILTER_VALIDATE_URL) || !in_array(parse_url($url, PHP_URL_SCHEME), ['http', 'https'], true)) {
        throw new RuntimeException("ค่า {$key} ต้องเป็น URL แบบ http หรือ https");
    }
    return $url;
}

function html(string $value): string
{
    return htmlspecialchars($value, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
}

function smtp_mailer(string $email, string $displayName, string $subject): PHPMailer
{
    $mail = new PHPMailer(true);
    $mail->isSMTP();
    $mail->Host = env_value('SMTP_HOST', 'mailpit');
    $mail->Port = (int) env_value('SMTP_PORT', '1025');
    $mail->Timeout = 12;

    $smtpUsername = env_value('SMTP_USERNAME');
    if ($smtpUsername !== '') {
        $mail->SMTPAuth = true;
        $mail->Username = $smtpUsername;
        $mail->Password = env_value('SMTP_PASSWORD');
    } else {
        $mail->SMTPAuth = false;
    }

    $encryption = strtolower(env_value('SMTP_ENCRYPTION', 'none'));
    if ($encryption === 'tls') {
        $mail->SMTPSecure = PHPMailer::ENCRYPTION_STARTTLS;
    } elseif (in_array($encryption, ['ssl', 'smtps'], true)) {
        $mail->SMTPSecure = PHPMailer::ENCRYPTION_SMTPS;
    } else {
        $mail->SMTPAutoTLS = false;
        $mail->SMTPSecure = '';
    }

    $mail->CharSet = PHPMailer::CHARSET_UTF8;
    $mail->setFrom(env_value('MAIL_FROM', 'no-reply@smart-home-store.local'), env_value('MAIL_FROM_NAME', 'Smart Home Store'));
    $mail->addAddress($email, $displayName);
    $mail->isHTML(true);
    $mail->Subject = $subject;
    return $mail;
}

function draw_centered_text(GdImage $image, string $text, string $font, int $size, int $baseline, int $color, int $maxWidth): void
{
    while ($size > 24) {
        $box = imagettfbbox($size, 0, $font, $text);
        if ($box !== false && ($box[2] - $box[0]) <= $maxWidth) {
            break;
        }
        $size -= 2;
    }
    $box = imagettfbbox($size, 0, $font, $text);
    if ($box === false) {
        throw new RuntimeException('ไม่สามารถคำนวณขนาดข้อความบนรูปได้');
    }
    $textWidth = $box[2] - $box[0];
    $x = (int) ((imagesx($image) - $textWidth) / 2);
    imagettftext($image, $size, 0, $x, $baseline, $color, $font, $text);
}

function create_member_registration_poster(string $fullName): string
{
    if (!extension_loaded('gd')) {
        throw new RuntimeException('PHP GD ยังไม่พร้อมใช้งาน');
    }
    $source = '/var/www/assets/member-registration-base.jpg';
    if (!is_file($source)) {
        throw new RuntimeException('ไม่พบรูปต้นแบบอีเมลสมาชิก');
    }

    $thaiFonts = glob('/usr/share/fonts/truetype/noto/NotoSansThai*Bold.ttf') ?: [];
    $thaiFont = $thaiFonts[0] ?? '';
    $latinFont = '/usr/share/fonts/truetype/noto/NotoSans-Bold.ttf';
    if (!is_file($latinFont)) {
        $latinFont = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf';
    }
    if (!is_file($thaiFont) || !is_file($latinFont)) {
        throw new RuntimeException('ไม่พบฟอนต์สำหรับสร้างรูปอีเมล');
    }
    $nameFont = preg_match('/\p{Thai}/u', $fullName) === 1 ? $thaiFont : $latinFont;

    $image = imagecreatefromjpeg($source);
    if (!$image instanceof GdImage) {
        throw new RuntimeException('เปิดรูปต้นแบบอีเมลสมาชิกไม่ได้');
    }

    imagealphablending($image, true);
    imageantialias($image, true);

    // ใช้แถบพื้นหลังสะอาดจากแผงเดิมมาปิดชื่อ "Per" ที่อยู่ในรูปตัวอย่าง
    // แล้ววาดชื่อจริงของสมาชิกใหม่ทุกครั้งที่ส่งอีเมล
    $coverX = 230;
    $coverY = 315;
    $coverWidth = 665;
    // ปิดข้อความทั้งหมดจากภาพตัวอย่างเดิม รวมถึงข้อความ "สมัครรับข่าวสาร"
    // เพื่อให้อีเมลสมัครสมาชิกมีเนื้อหาคนละชุดกับอีเมลข่าวสารอย่างชัดเจน
    $coverHeight = 445;
    $strip = imagecreatetruecolor(2, $coverHeight);
    imagecopy($strip, $image, 0, 0, 258, $coverY, 2, $coverHeight);
    imagecopyresampled($image, $strip, $coverX, $coverY, 0, 0, $coverWidth, $coverHeight, 2, $coverHeight);
    imagedestroy($strip);

    $white = imagecolorallocate($image, 255, 255, 255);
    $cyan = imagecolorallocate($image, 68, 222, 248);
    $line = imagecolorallocate($image, 139, 207, 229);
    $muted = imagecolorallocate($image, 214, 235, 247);
    draw_centered_text($image, 'ยินดีต้อนรับ', $thaiFont, 62, 420, $white, 620);
    draw_centered_text($image, $fullName, $nameFont, 50, 510, $cyan, 620);
    draw_centered_text($image, 'สมัครสมาชิกสำเร็จ', $thaiFont, 34, 570, $white, 620);
    imageline($image, 526, 612, 596, 612, $line);
    draw_centered_text($image, 'บัญชีของคุณพร้อมใช้งานแล้ว', $thaiFont, 25, 665, $muted, 620);
    draw_centered_text($image, 'เลือกซื้ออุปกรณ์บ้านอัจฉริยะได้ทันที', $thaiFont, 23, 710, $muted, 620);

    $temporary = tempnam(sys_get_temp_dir(), 'member-poster-');
    if ($temporary === false) {
        imagedestroy($image);
        throw new RuntimeException('สร้างไฟล์รูปชั่วคราวไม่ได้');
    }
    $output = $temporary . '.jpg';
    @unlink($temporary);
    if (!imagejpeg($image, $output, 94)) {
        imagedestroy($image);
        throw new RuntimeException('บันทึกรูปอีเมลสมาชิกไม่ได้');
    }
    imagedestroy($image);
    return $output;
}

function send_welcome_email(string $email, string $firstName, string $unsubscribeToken): void
{
    $shopUrl = public_http_url('SHOP_URL', 'http://localhost:3000');
    $publicUrl = public_http_url('NEWSLETTER_PUBLIC_URL', 'http://localhost:8081');
    $posterPath = '/var/www/assets/email-newsletter-poster-hd.jpg';
    $unsubscribeUrl = $publicUrl . '/unsubscribe.php?token=' . rawurlencode($unsubscribeToken);
    $privacyUrl = $shopUrl . '/privacy';
    $displayName = $firstName !== '' ? $firstName : 'สมาชิกใหม่';

    $mail = smtp_mailer($email, $displayName, 'ขอบคุณที่สมัครรับข่าวสาร | Smart Home Store');
    $mail->addCustomHeader('List-Unsubscribe', '<' . $unsubscribeUrl . '>');
    if (!is_file($posterPath)) {
        throw new RuntimeException('Newsletter poster image was not found.');
    }
    $mail->addEmbeddedImage($posterPath, 'newsletter-poster', 'smart-home-newsletter.jpg', 'base64', 'image/jpeg');

    $safeName = html($displayName);
    $safeShop = html($shopUrl);
    $safeUnsubscribe = html($unsubscribeUrl);
    $safePrivacy = html($privacyUrl);
    $mail->Body = <<<HTML
<!doctype html>
<html lang="th">
<head>
  <meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
  <style>@media only screen and (max-width:700px){.outer-pad{padding:12px 6px!important}.greeting{padding:22px 8px!important}.greeting h1{font-size:16px!important;white-space:nowrap!important}.cta{padding:14px 26px!important}}</style>
</head>
<body style="margin:0;padding:0;background:#edf3f8;font-family:Tahoma,Arial,sans-serif;color:#10243e">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0">ขอบคุณที่สมัครรับข่าวสารจาก Smart Home Store — ยินดีต้อนรับคุณ {$safeName}</div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;background:#edf3f8">
    <tr><td class="outer-pad" align="center" style="padding:28px 12px">
      <table role="presentation" width="680" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:680px;background:#ffffff;border:1px solid #dce6f0;border-radius:22px;overflow:hidden;box-shadow:0 18px 50px rgba(15,40,70,.10)">
        <tr><td class="greeting" align="center" style="padding:28px 30px 24px;background:#ffffff">
          <p style="margin:0 0 6px;font-size:11px;font-weight:bold;letter-spacing:2px;color:#1688d4">SMART HOME STORE</p>
          <h1 style="margin:0;font-size:24px;line-height:1.5;letter-spacing:-.3px;white-space:nowrap;color:#10243e">ยินดีต้อนรับคุณ <span style="color:#1768ff">{$safeName}</span></h1>
          <p style="margin:7px 0 0;font-size:13px;line-height:1.8;color:#72839a">ขอบคุณที่สมัครรับข่าวสาร เตรียมพบกับสินค้าใหม่และสิทธิพิเศษสำหรับคุณ</p>
        </td></tr>
        <tr><td align="center" style="padding:0;background:#ffffff">
          <a href="{$safeShop}/products" target="_blank" style="display:block;text-decoration:none">
            <img src="cid:newsletter-poster" width="680" alt="ขอบคุณที่สมัครรับข่าวสารจาก Smart Home Store — กดเพื่อเลือกซื้อสินค้า" style="display:block;width:100%;max-width:680px;height:auto;border:0;margin:0 auto">
          </a>
        </td></tr>
        <tr><td align="center" style="padding:26px 24px 22px;background:#ffffff">
          <table role="presentation" cellspacing="0" cellpadding="0" border="0"><tr><td bgcolor="#1768ff" style="border-radius:12px;box-shadow:0 10px 24px rgba(23,104,255,.22)"><a class="cta" href="{$safeShop}/products" target="_blank" style="display:inline-block;padding:16px 40px;color:#ffffff;font-size:16px;font-weight:bold;text-decoration:none;border-radius:12px">เลือกซื้อสินค้า&nbsp;&nbsp;→</a></td></tr></table>
          <p style="margin:14px 0 0;font-size:11px;color:#8795a8">คุณสามารถกดที่รูปด้านบนเพื่อเข้าสู่หน้าสินค้าได้เช่นกัน</p>
        </td></tr>
        <tr><td align="center" bgcolor="#f7f9fc" style="padding:23px 28px;font-size:11px;line-height:1.9;color:#8795a8">
          <strong style="color:#52657c">Smart Home Store</strong><br>ชีวิตง่ายขึ้นด้วยเทคโนโลยี<br>
          คุณได้รับอีเมลนี้เพราะสมัครรับข่าวสารจากเว็บไซต์ของเรา<br>
          <a href="{$safeShop}" style="color:#1768ff;text-decoration:none">เยี่ยมชมเว็บไซต์</a>&nbsp;&nbsp;·&nbsp;&nbsp;<a href="{$safeUnsubscribe}" style="color:#65758a;text-decoration:underline">ยกเลิกรับข่าวสาร</a>&nbsp;&nbsp;·&nbsp;&nbsp;<a href="{$safePrivacy}" style="color:#65758a;text-decoration:underline">นโยบายความเป็นส่วนตัว</a>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>
HTML;

    $mail->AltBody = "ยินดีต้อนรับคุณ {$displayName}\n\nขอบคุณที่สมัครรับข่าวสารจาก Smart Home Store\nเลือกซื้อสินค้า: {$shopUrl}/products\nยกเลิกการรับข่าวสาร: {$unsubscribeUrl}";
    $mail->send();
}

function send_member_registration_email(string $email, string $firstName, string $lastName): void
{
    $shopUrl = public_http_url('SHOP_URL', 'http://localhost:3000');
    $privacyUrl = $shopUrl . '/privacy';
    $displayName = trim($firstName . ' ' . $lastName);
    if ($displayName === '') {
        $displayName = 'สมาชิกใหม่';
    }

    $mail = smtp_mailer($email, $displayName, 'สมัครสมาชิกสำเร็จ — ยินดีต้อนรับสู่ Smart Home Store');
    $safeName = html($displayName);
    $safeShop = html($shopUrl);
    $safePrivacy = html($privacyUrl);
    $posterPath = create_member_registration_poster($displayName);
    $mail->addEmbeddedImage($posterPath, 'member-registration-poster', 'member-registration.jpg', 'base64', 'image/jpeg');

    $mail->Body = <<<HTML
<!doctype html>
<html lang="th">
<head>
  <meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
  <style>@media only screen and (max-width:700px){.outer-pad{padding:12px 6px!important}.greeting{padding:22px 8px!important}.greeting h1{font-size:16px!important;white-space:nowrap!important}.cta{padding:14px 26px!important}}</style>
</head>
<body style="margin:0;padding:0;background:#edf3f8;font-family:Tahoma,Arial,sans-serif;color:#10243e">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0">สมัครสมาชิกสำเร็จ — ยินดีต้อนรับคุณ {$safeName} สู่ Smart Home Store</div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;background:#edf3f8">
    <tr><td class="outer-pad" align="center" style="padding:28px 12px">
      <table role="presentation" width="680" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:680px;background:#ffffff;border:1px solid #dce6f0;border-radius:22px;overflow:hidden;box-shadow:0 18px 50px rgba(15,40,70,.10)">
        <tr><td class="greeting" align="center" style="padding:28px 30px 24px;background:#ffffff">
          <p style="margin:0 0 6px;font-size:11px;font-weight:bold;letter-spacing:2px;color:#1688d4">WELCOME TO SMART HOME STORE</p>
          <h1 style="margin:0;font-size:24px;line-height:1.5;letter-spacing:-.3px;white-space:nowrap;color:#10243e">ยินดีต้อนรับคุณ <span style="color:#1768ff">{$safeName}</span></h1>
          <p style="margin:7px 0 0;font-size:13px;line-height:1.8;color:#72839a">บัญชีของคุณพร้อมใช้งานแล้ว เลือกซื้ออุปกรณ์สำหรับบ้านอัจฉริยะได้ทันที</p>
        </td></tr>
        <tr><td align="center" style="padding:0;background:#ffffff">
          <a href="{$safeShop}/products" target="_blank" style="display:block;text-decoration:none">
            <img src="cid:member-registration-poster" width="680" alt="สมัครสมาชิก Smart Home Store สำเร็จ — กดเพื่อเลือกซื้อสินค้า" style="display:block;width:100%;max-width:680px;height:auto;border:0;margin:0 auto">
          </a>
        </td></tr>
        <tr><td align="center" style="padding:26px 24px 22px;background:#ffffff">
          <table role="presentation" cellspacing="0" cellpadding="0" border="0"><tr><td bgcolor="#1768ff" style="border-radius:12px;box-shadow:0 10px 24px rgba(23,104,255,.22)"><a class="cta" href="{$safeShop}/products" target="_blank" style="display:inline-block;padding:16px 40px;color:#ffffff;font-size:16px;font-weight:bold;text-decoration:none;border-radius:12px">เลือกซื้อสินค้า&nbsp;&nbsp;→</a></td></tr></table>
          <p style="margin:14px 0 0;font-size:11px;color:#8795a8">กดที่รูปด้านบนหรือปุ่มนี้เพื่อเข้าสู่หน้าสินค้า</p>
        </td></tr>
        <tr><td align="center" bgcolor="#f7f9fc" style="padding:23px 28px;font-size:11px;line-height:1.9;color:#8795a8">
          <strong style="color:#52657c">Smart Home Store</strong><br>ชีวิตง่ายขึ้นด้วยเทคโนโลยี<br>
          อีเมลนี้เป็นการยืนยันการสร้างบัญชีสมาชิกของคุณ<br>
          <a href="{$safeShop}/login" style="color:#1768ff;text-decoration:none">เข้าสู่ระบบ</a>&nbsp;&nbsp;·&nbsp;&nbsp;<a href="{$safeShop}" style="color:#65758a;text-decoration:none">เยี่ยมชมเว็บไซต์</a>&nbsp;&nbsp;·&nbsp;&nbsp;<a href="{$safePrivacy}" style="color:#65758a;text-decoration:underline">นโยบายความเป็นส่วนตัว</a>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>
HTML;

    $mail->AltBody = "ยินดีต้อนรับคุณ {$displayName}\n\nสมัครสมาชิก Smart Home Store สำเร็จ บัญชีของคุณพร้อมใช้งานแล้ว\nเลือกซื้อสินค้า: {$shopUrl}/products\nเข้าสู่ระบบ: {$shopUrl}/login";
    try {
        $mail->send();
    } finally {
        @unlink($posterPath);
    }
}

function send_order_confirmation_email(array $order): void
{
    $shopUrl = public_http_url('SHOP_URL', 'http://localhost:3000');
    $displayName = trim((string) ($order['firstName'] ?? '') . ' ' . (string) ($order['lastName'] ?? ''));
    if ($displayName === '') {
        $displayName = 'ลูกค้า';
    }

    $orderNumber = (string) $order['orderNumber'];
    $orderUrl = $shopUrl . '/orders/' . rawurlencode($orderNumber);
    $paymentLabels = [
        'PROMPTPAY' => 'พร้อมเพย์ QR',
        'CARD' => 'บัตรเครดิต/เดบิต',
        'WALLET' => 'วอลเล็ต',
    ];
    $paymentMethod = (string) ($order['paymentMethod'] ?? '');
    $paymentLabel = $paymentLabels[$paymentMethod] ?? 'ไม่ระบุ';
    $paymentReference = trim((string) ($order['paymentReference'] ?? '')) ?: '-';
    $grandTotal = (float) $order['grandTotal'];
    $discount = (float) ($order['discount'] ?? 0);
    $shipping = (float) ($order['shipping'] ?? 0);

    $itemRows = '';
    $plainItems = [];
    foreach ($order['items'] as $item) {
        $name = (string) $item['name'];
        $quantity = (int) $item['quantity'];
        $price = (float) $item['price'];
        $lineTotal = $price * $quantity;
        $safeName = html($name);
        $safeQuantity = html((string) $quantity);
        $safeLineTotal = html(number_format($lineTotal, 2));
        $itemRows .= <<<HTML
<tr>
  <td style="padding:14px 0;border-bottom:1px solid #e7edf4;color:#10243e">{$safeName}<br><span style="font-size:12px;color:#7a8ba0">จำนวน {$safeQuantity}</span></td>
  <td align="right" style="padding:14px 0;border-bottom:1px solid #e7edf4;font-weight:bold;color:#10243e">฿{$safeLineTotal}</td>
</tr>
HTML;
        $plainItems[] = "- {$name} x{$quantity}: ฿" . number_format($lineTotal, 2);
    }

    $safeName = html($displayName);
    $safeShop = html($shopUrl);
    $safeOrderNumber = html($orderNumber);
    $safeOrderUrl = html($orderUrl);
    $safePaymentLabel = html($paymentLabel);
    $safePaymentReference = html($paymentReference);
    $safeGrandTotal = html(number_format($grandTotal, 2));
    $safeDiscount = html(number_format($discount, 2));
    $safeShipping = $shipping > 0 ? '฿' . html(number_format($shipping, 2)) : 'ฟรี';
    $orderedAt = (new DateTimeImmutable('now', new DateTimeZone('Asia/Bangkok')))->format('d/m/Y H:i น.');

    $mail = smtp_mailer((string) $order['email'], $displayName, "ยืนยันคำสั่งซื้อ {$orderNumber} | Smart Home Store");
    $logoPath = '/var/www/assets/smart-home-store-logo.png';
    if (!is_file($logoPath)) {
        throw new RuntimeException('Smart Home Store logo was not found.');
    }
    $mail->addEmbeddedImage($logoPath, 'smart-home-store-logo', 'smart-home-store-logo.png', 'base64', 'image/png');
    $mail->Body = <<<HTML
<!doctype html>
<html lang="th">
<head>
  <meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="color-scheme" content="light only"><meta name="supported-color-schemes" content="light only">
  <style>:root{color-scheme:light only}@media only screen and (max-width:700px){.outer-pad{padding:12px 6px!important}.email-body{padding:24px 18px!important}.hero-title{font-size:25px!important}.order-meta td{display:block!important;width:auto!important;text-align:left!important;padding:10px 14px!important}.step-label{font-size:9px!important}.cta{display:block!important;padding:15px 20px!important}}</style>
</head>
<body style="margin:0;padding:0;background-color:#edf3f8;font-family:Tahoma,Arial,sans-serif;color:#10243e;color-scheme:light only">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0">เราได้รับคำสั่งซื้อ {$safeOrderNumber} ของคุณแล้ว ยอดรวม ฿{$safeGrandTotal}</div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;background:#edf3f8">
    <tr><td class="outer-pad" align="center" style="padding:28px 12px">
      <table role="presentation" width="680" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:680px;background-color:#ffffff;border:1px solid #dce6f0;border-radius:22px;overflow:hidden;box-shadow:0 18px 50px rgba(15,40,70,.10)">
        <tr><td align="center" style="padding:20px 28px;background-color:#ffffff;border-bottom:1px solid #e7edf5">
          <a href="{$safeShop}" target="_blank" style="display:inline-block;text-decoration:none"><img src="cid:smart-home-store-logo" width="210" alt="Smart Home Store" style="display:block;width:210px;max-width:72%;height:auto;border:0;margin:0 auto"></a>
        </td></tr>
        <tr><td align="center" style="padding:38px 28px;background-color:#eaf2ff;color:#10243e">
          <div style="display:inline-block;width:62px;height:62px;line-height:62px;border:4px solid #ffffff;border-radius:50%;background-color:#1768ff;box-shadow:0 10px 24px rgba(23,104,255,.25);color:#ffffff;font-size:30px;font-weight:bold">✓</div>
          <p style="margin:18px 0 7px;font-size:11px;font-weight:bold;letter-spacing:2px;color:#1768ff">ORDER CONFIRMED</p>
          <h1 class="hero-title" style="margin:0;font-size:30px;line-height:1.4;color:#10243e">สั่งซื้อสำเร็จแล้ว</h1>
          <p style="margin:9px 0 0;font-size:14px;line-height:1.8;color:#64748b">ขอบคุณคุณ <strong style="color:#1768ff">{$safeName}</strong><br>เราได้รับคำสั่งซื้อของคุณเรียบร้อยแล้ว</p>
        </td></tr>
        <tr><td class="email-body" style="padding:30px 36px;background-color:#ffffff">
          <table class="order-meta" role="presentation" width="100%" cellspacing="0" cellpadding="0" style="width:100%;margin-bottom:24px;background-color:#f7faff;border:1px solid #e3ecf8;border-radius:14px">
            <tr><td style="padding:16px"><span style="font-size:12px;color:#7a8ba0">เลขคำสั่งซื้อ</span><br><strong style="font-size:18px;color:#1768ff">{$safeOrderNumber}</strong></td><td align="right" style="padding:16px"><span style="font-size:12px;color:#7a8ba0">วันที่สั่งซื้อ</span><br><strong>{$orderedAt}</strong></td></tr>
          </table>
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="width:100%;margin:0 0 28px"><tr>
            <td align="center" width="25%"><span style="display:inline-block;width:30px;height:30px;line-height:30px;border-radius:50%;background-color:#1768ff;color:#ffffff;font-weight:bold">✓</span><br><span class="step-label" style="font-size:10px;font-weight:bold;color:#1768ff">ยืนยันแล้ว</span></td>
            <td align="center" width="25%"><span style="display:inline-block;width:30px;height:30px;line-height:30px;border-radius:50%;background-color:#eef2f7;color:#8b98aa;font-weight:bold">2</span><br><span class="step-label" style="font-size:10px;color:#8b98aa">กำลังเตรียม</span></td>
            <td align="center" width="25%"><span style="display:inline-block;width:30px;height:30px;line-height:30px;border-radius:50%;background-color:#eef2f7;color:#8b98aa;font-weight:bold">3</span><br><span class="step-label" style="font-size:10px;color:#8b98aa">กำลังจัดส่ง</span></td>
            <td align="center" width="25%"><span style="display:inline-block;width:30px;height:30px;line-height:30px;border-radius:50%;background-color:#eef2f7;color:#8b98aa;font-weight:bold">4</span><br><span class="step-label" style="font-size:10px;color:#8b98aa">ส่งสำเร็จ</span></td>
          </tr></table>
          <h2 style="margin:0 0 6px;font-size:18px;color:#10243e">รายการสินค้า</h2>
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0">{$itemRows}</table>
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-top:18px;font-size:14px">
            <tr><td style="padding:5px 0;color:#64748b">ส่วนลด</td><td align="right" style="padding:5px 0;color:#16a36f">-฿{$safeDiscount}</td></tr>
            <tr><td style="padding:5px 0;color:#64748b">ค่าจัดส่ง</td><td align="right" style="padding:5px 0">{$safeShipping}</td></tr>
            <tr><td style="padding:13px 0 5px;border-top:1px solid #dce6f0;font-weight:bold">ยอดชำระทั้งหมด</td><td align="right" style="padding:13px 0 5px;border-top:1px solid #dce6f0;font-size:24px;font-weight:bold;color:#1768ff">฿{$safeGrandTotal}</td></tr>
          </table>
          <div style="margin-top:22px;padding:17px;border:1px solid #dfe9f5;border-radius:14px;background-color:#f7faff;font-size:13px;line-height:1.8;color:#52657c"><strong style="color:#10243e">การชำระเงิน</strong><br>{$safePaymentLabel}<br>เลขอ้างอิง: {$safePaymentReference}<br><span style="color:#0d9468">● ชำระเงินแล้ว (ระบบจำลอง)</span></div>
          <div style="text-align:center;margin-top:26px"><a class="cta" href="{$safeOrderUrl}" target="_blank" style="display:inline-block;padding:16px 38px;border-radius:12px;background-color:#1768ff;color:#ffffff;font-size:15px;font-weight:bold;text-decoration:none;box-shadow:0 10px 24px rgba(23,104,255,.22)">ติดตามสถานะคำสั่งซื้อ&nbsp;&nbsp;→</a><p style="margin:12px 0 0;font-size:11px;color:#8a98aa">ดูรายการสินค้าและสถานะล่าสุดได้ทุกเวลา</p></div>
        </td></tr>
        <tr><td align="center" style="padding:23px 28px;background-color:#f7f9fc;font-size:11px;line-height:1.9;color:#8795a8"><strong style="color:#52657c">Smart Home Store</strong><br>ชีวิตง่ายขึ้นด้วยเทคโนโลยี<br>อีเมลนี้ถูกส่งอัตโนมัติหลังยืนยันคำสั่งซื้อ<br><a href="{$safeShop}" style="color:#1768ff;text-decoration:none">เยี่ยมชมเว็บไซต์</a>&nbsp;&nbsp;·&nbsp;&nbsp;<a href="{$safeShop}/profile" style="color:#65758a;text-decoration:none">บัญชีของฉัน</a></td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>
HTML;

    $mail->AltBody = "สั่งซื้อสำเร็จแล้ว\nเลขคำสั่งซื้อ: {$orderNumber}\n\n" . implode("\n", $plainItems) . "\n\nส่วนลด: ฿" . number_format($discount, 2) . "\nค่าจัดส่ง: " . ($shipping > 0 ? '฿' . number_format($shipping, 2) : 'ฟรี') . "\nยอดรวม: ฿" . number_format($grandTotal, 2) . "\nวิธีชำระเงิน: {$paymentLabel}\nเลขอ้างอิง: {$paymentReference}\nดูคำสั่งซื้อ: {$orderUrl}";
    $mail->send();
}
