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

$email = strtolower(trim((string) ($payload['email'] ?? '')));
$firstName = trim((string) ($payload['firstName'] ?? ''));
$lastName = trim((string) ($payload['lastName'] ?? ''));

if (!filter_var($email, FILTER_VALIDATE_EMAIL) || strlen($email) > 191) {
    json_response(['error' => 'กรุณากรอกอีเมลให้ถูกต้อง'], 422);
}
if (mb_strlen($firstName) > 100 || mb_strlen($lastName) > 100) {
    json_response(['error' => 'ชื่อหรือนามสกุลยาวเกินไป'], 422);
}

try {
    send_member_registration_email($email, $firstName, $lastName);
    json_response(['message' => 'ส่งอีเมลต้อนรับสมาชิกสำเร็จ'], 201);
} catch (Throwable $error) {
    error_log('member_welcome_email_failed: ' . $error->getMessage());
    json_response(['error' => 'ยังส่งอีเมลต้อนรับสมาชิกไม่ได้'], 503);
}
