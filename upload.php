<?php
declare(strict_types=1);

header('Content-Type: application/json');
header('X-Content-Type-Options: nosniff');

function respond(int $statusCode, array $payload): void
{
    http_response_code($statusCode);
    echo json_encode($payload);
    exit;
}

function extractFirebaseApiKey(string $configPath): ?string
{
    if (!is_file($configPath)) {
        return null;
    }

    $contents = file_get_contents($configPath);
    if ($contents === false) {
        return null;
    }

    if (preg_match('/apiKey:\s*"([^"]+)"/', $contents, $matches) === 1) {
        return $matches[1];
    }

    return null;
}

function verifyFirebaseUser(string $idToken, string $apiKey): ?string
{
    $endpoint = 'https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=' . rawurlencode($apiKey);
    $body = json_encode(['idToken' => $idToken]);
    if ($body === false) {
        return null;
    }

    $context = stream_context_create([
        'http' => [
            'method' => 'POST',
            'header' => "Content-Type: application/json\r\n",
            'content' => $body,
            'timeout' => 12
        ]
    ]);

    $response = @file_get_contents($endpoint, false, $context);
    if ($response === false) {
        return null;
    }

    $decoded = json_decode($response, true);
    if (!is_array($decoded) || empty($decoded['users'][0]['localId'])) {
        return null;
    }

    return (string) $decoded['users'][0]['localId'];
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    respond(405, [
        'success' => false,
        'message' => 'Only POST is allowed.'
    ]);
}

$allowedMimeTypes = [
    'image/jpeg' => 'jpg',
    'image/png' => 'png',
    'image/webp' => 'webp',
    'image/gif' => 'gif'
];

$maxFileSize = 8 * 1024 * 1024;
$maxFiles = 15;
$userId = isset($_POST['userId']) ? preg_replace('/[^a-zA-Z0-9_-]/', '', (string) $_POST['userId']) : '';
$authHeader = $_SERVER['HTTP_AUTHORIZATION'] ?? '';
$idToken = '';
if (preg_match('/^Bearer\s+(.+)$/', $authHeader, $matches) === 1) {
    $idToken = trim((string) $matches[1]);
}

$apiKey = extractFirebaseApiKey(__DIR__ . DIRECTORY_SEPARATOR . 'assets' . DIRECTORY_SEPARATOR . 'js' . DIRECTORY_SEPARATOR . 'firebase-config.js');
if ($userId === '' || $idToken === '' || $apiKey === null) {
    respond(401, [
        'success' => false,
        'message' => 'Unauthorized upload request.'
    ]);
}

$verifiedUserId = verifyFirebaseUser($idToken, $apiKey);
if ($verifiedUserId === null || $verifiedUserId !== $userId) {
    respond(403, [
        'success' => false,
        'message' => 'Upload authentication failed.'
    ]);
}

if (!isset($_FILES['images'])) {
    respond(200, [
        'success' => true,
        'imageUrls' => []
    ]);
}

$uploadRoot = __DIR__ . DIRECTORY_SEPARATOR . 'uploads';
$userDirectory = $uploadRoot . DIRECTORY_SEPARATOR . $userId;

if (!is_dir($userDirectory) && !mkdir($userDirectory, 0775, true) && !is_dir($userDirectory)) {
    respond(500, [
        'success' => false,
        'message' => 'Could not create upload directory.'
    ]);
}

$fileCount = is_array($_FILES['images']['name']) ? count($_FILES['images']['name']) : 0;
$fileCount = min($fileCount, $maxFiles);
$savedUrls = [];
$errors = [];

for ($index = 0; $index < $fileCount; $index++) {
    $tmpName = $_FILES['images']['tmp_name'][$index] ?? '';
    $originalName = $_FILES['images']['name'][$index] ?? 'image';
    $fileSize = (int) ($_FILES['images']['size'][$index] ?? 0);
    $fileError = (int) ($_FILES['images']['error'][$index] ?? UPLOAD_ERR_NO_FILE);

    if ($fileError !== UPLOAD_ERR_OK) {
        $errors[] = $originalName . ': upload failed.';
        continue;
    }

    if ($fileSize <= 0 || $fileSize > $maxFileSize) {
        $errors[] = $originalName . ': invalid file size.';
        continue;
    }

    $mimeType = mime_content_type($tmpName);
    $imageInfo = @getimagesize($tmpName);
    if (!isset($allowedMimeTypes[$mimeType]) || $imageInfo === false) {
        $errors[] = $originalName . ': unsupported file type.';
        continue;
    }

    $extension = $allowedMimeTypes[$mimeType];
    $baseName = pathinfo($originalName, PATHINFO_FILENAME);
    $safeBaseName = preg_replace('/[^a-zA-Z0-9_-]/', '-', $baseName);
    $safeBaseName = trim((string) $safeBaseName, '-');
    if ($safeBaseName === '') {
        $safeBaseName = 'image';
    }

    try {
        $fileName = time() . '-' . bin2hex(random_bytes(6)) . '-' . $safeBaseName . '.' . $extension;
    } catch (Exception $exception) {
        $fileName = time() . '-' . uniqid('', true) . '-' . $safeBaseName . '.' . $extension;
    }

    $destination = $userDirectory . DIRECTORY_SEPARATOR . $fileName;
    if (!move_uploaded_file($tmpName, $destination)) {
        $errors[] = $originalName . ': could not save file.';
        continue;
    }

    $savedUrls[] = 'uploads/' . rawurlencode($userId) . '/' . rawurlencode($fileName);
}

respond(200, [
    'success' => true,
    'imageUrls' => $savedUrls,
    'errors' => $errors
]);