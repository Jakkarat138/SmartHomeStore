<?php
declare(strict_types=1);

require dirname(__DIR__) . '/src/bootstrap.php';

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    header('Allow: POST');
    json_response(['error' => 'รองรับเฉพาะคำขอ POST'], 405);
}

require_internal_request();

try {
    $payload = json_decode((string) file_get_contents('php://input'), true, 16, JSON_THROW_ON_ERROR);
} catch (JsonException) {
    json_response(['error' => 'ข้อมูล JSON ไม่ถูกต้อง'], 400);
}

if (!is_array($payload)) {
    json_response(['error' => 'ข้อมูลไม่ถูกต้อง'], 400);
}

if (trim((string) ($payload['company'] ?? '')) !== '') {
    json_response(['message' => 'สมัครรับข่าวสารเรียบร้อยแล้ว'], 201);
}

$email = strtolower(trim((string) ($payload['email'] ?? '')));
$firstName = trim((string) ($payload['firstName'] ?? ''));
$consent = filter_var($payload['consent'] ?? false, FILTER_VALIDATE_BOOLEAN);

if (!filter_var($email, FILTER_VALIDATE_EMAIL) || strlen($email) > 191) {
    json_response(['error' => 'กรุณากรอกอีเมลให้ถูกต้อง'], 422);
}
if (mb_strlen($firstName) > 100) {
    json_response(['error' => 'ชื่อยาวเกินไป'], 422);
}
if (!$consent) {
    json_response(['error' => 'กรุณายินยอมรับข่าวสารก่อนสมัคร'], 422);
}

$pdo = null;
try {
    $pdo = database();
    $pdo->beginTransaction();
    $select = $pdo->prepare('SELECT id,status,last_welcome_sent_at FROM newsletter_subscribers WHERE email = ? FOR UPDATE');
    $select->execute([$email]);
    $subscriber = $select->fetch();

    if ($subscriber && $subscriber['status'] === 'ACTIVE' && $subscriber['last_welcome_sent_at'] !== null) {
        $pdo->commit();
        json_response(['message' => 'อีเมลนี้สมัครรับข่าวสารอยู่แล้ว', 'alreadySubscribed' => true]);
    }

    $token = bin2hex(random_bytes(32));
    if ($subscriber) {
        $update = $pdo->prepare("UPDATE newsletter_subscribers SET first_name=?,status='ACTIVE',consent_version='2026-09',consented_at=CURRENT_TIMESTAMP,unsubscribed_at=NULL,unsubscribe_token=? WHERE id=?");
        $update->execute([$firstName !== '' ? $firstName : null, $token, $subscriber['id']]);
        $subscriberId = (int) $subscriber['id'];
    } else {
        $insert = $pdo->prepare("INSERT INTO newsletter_subscribers (email,first_name,status,consent_version,consented_at,unsubscribe_token,source) VALUES (?,?,'ACTIVE','2026-09',CURRENT_TIMESTAMP,?,'WEBSITE')");
        $insert->execute([$email, $firstName !== '' ? $firstName : null, $token]);
        $subscriberId = (int) $pdo->lastInsertId();
    }
    $pdo->commit();

    send_welcome_email($email, $firstName, $token);
    $sent = $pdo->prepare('UPDATE newsletter_subscribers SET last_welcome_sent_at=CURRENT_TIMESTAMP WHERE id=?');
    $sent->execute([$subscriberId]);
    json_response(['message' => 'สมัครรับข่าวสารสำเร็จ กรุณาตรวจสอบอีเมลของคุณ'], 201);
} catch (Throwable $error) {
    if ($pdo instanceof PDO && $pdo->inTransaction()) {
        $pdo->rollBack();
    }
    error_log('newsletter_subscribe_failed: ' . $error->getMessage());
    json_response(['error' => 'ยังส่งอีเมลไม่ได้ กรุณาลองใหม่อีกครั้ง'], 503);
}
