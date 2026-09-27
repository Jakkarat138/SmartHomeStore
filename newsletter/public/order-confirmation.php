<?php
declare(strict_types=1);

require dirname(__DIR__) . '/src/bootstrap.php';

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    header('Allow: POST');
    json_response(['error' => 'รองรับเฉพาะคำขอ POST'], 405);
}

require_internal_request();

try {
    $payload = json_decode((string) file_get_contents('php://input'), true, 64, JSON_THROW_ON_ERROR);
} catch (JsonException) {
    json_response(['error' => 'ข้อมูล JSON ไม่ถูกต้อง'], 400);
}

if (!is_array($payload)) {
    json_response(['error' => 'ข้อมูลไม่ถูกต้อง'], 400);
}

$email = strtolower(trim((string) ($payload['email'] ?? '')));
$firstName = trim((string) ($payload['firstName'] ?? ''));
$lastName = trim((string) ($payload['lastName'] ?? ''));
$orderNumber = trim((string) ($payload['orderNumber'] ?? ''));
$items = $payload['items'] ?? [];
$grandTotal = filter_var($payload['grandTotal'] ?? null, FILTER_VALIDATE_FLOAT);
$discount = filter_var($payload['discount'] ?? 0, FILTER_VALIDATE_FLOAT);
$shipping = filter_var($payload['shipping'] ?? 0, FILTER_VALIDATE_FLOAT);
$paymentMethod = trim((string) ($payload['paymentMethod'] ?? ''));
$paymentReference = trim((string) ($payload['paymentReference'] ?? ''));

if (!filter_var($email, FILTER_VALIDATE_EMAIL) || strlen($email) > 191) {
    json_response(['error' => 'อีเมลไม่ถูกต้อง'], 422);
}
if ($orderNumber === '' || strlen($orderNumber) > 30 || !preg_match('/^[A-Z0-9-]+$/', $orderNumber)) {
    json_response(['error' => 'เลขคำสั่งซื้อไม่ถูกต้อง'], 422);
}
if (!is_array($items) || $items === [] || count($items) > 100 || $grandTotal === false || $grandTotal < 0) {
    json_response(['error' => 'รายละเอียดคำสั่งซื้อไม่ถูกต้อง'], 422);
}

$cleanItems = [];
foreach ($items as $item) {
    if (!is_array($item)) {
        json_response(['error' => 'รายการสินค้าไม่ถูกต้อง'], 422);
    }
    $name = trim((string) ($item['name'] ?? ''));
    $quantity = filter_var($item['quantity'] ?? null, FILTER_VALIDATE_INT);
    $price = filter_var($item['price'] ?? null, FILTER_VALIDATE_FLOAT);
    if ($name === '' || mb_strlen($name) > 255 || $quantity === false || $quantity < 1 || $price === false || $price < 0) {
        json_response(['error' => 'รายการสินค้าไม่ถูกต้อง'], 422);
    }
    $cleanItems[] = ['name' => $name, 'quantity' => $quantity, 'price' => $price];
}

try {
    send_order_confirmation_email([
        'email' => $email,
        'firstName' => $firstName,
        'lastName' => $lastName,
        'orderNumber' => $orderNumber,
        'items' => $cleanItems,
        'grandTotal' => (float) $grandTotal,
        'discount' => max(0, (float) ($discount === false ? 0 : $discount)),
        'shipping' => max(0, (float) ($shipping === false ? 0 : $shipping)),
        'paymentMethod' => $paymentMethod,
        'paymentReference' => $paymentReference,
    ]);
    json_response(['message' => 'ส่งอีเมลยืนยันคำสั่งซื้อสำเร็จ'], 201);
} catch (Throwable $error) {
    error_log('order_confirmation_email_failed: ' . $error->getMessage());
    json_response(['error' => 'ยังส่งอีเมลยืนยันคำสั่งซื้อไม่ได้'], 503);
}
