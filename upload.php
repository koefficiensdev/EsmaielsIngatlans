<?php
declare(strict_types=1);

header('Content-Type: application/json');

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode([
        'success' => false,
        'message' => 'Only POST is allowed.'
    ]);
    exit;
}

$allowedMimeTypes = [
    'image/jpeg' => 'jpg',
    'image/png' => 'png',
    'image/webp' => 'webp',
    'image/gif' => 'gif'
];

$maxFileSize = 8 * 1024 * 1024;
$userId = isset($_POST['userId']) ? preg_replace('/[^a-zA-Z0-9_-]/', '', (string) $_POST['userId']) : 'anonymous';

if (!isset($_FILES['images'])) {
    echo json_encode([
        'success' => true,
        'imageUrls' => []
    ]);
    exit;
}

$uploadRoot = __DIR__ . DIRECTORY_SEPARATOR . 'uploads';
$userDirectory = $uploadRoot . DIRECTORY_SEPARATOR . $userId;

if (!is_dir($userDirectory) && !mkdir($userDirectory, 0775, true) && !is_dir($userDirectory)) {
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'message' => 'Could not create upload directory.'
    ]);
    exit;
}

$fileCount = is_array($_FILES['images']['name']) ? count($_FILES['images']['name']) : 0;
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
    if (!isset($allowedMimeTypes[$mimeType])) {
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

echo json_encode([
    'success' => true,
    'imageUrls' => $savedUrls,
    'errors' => $errors
]);