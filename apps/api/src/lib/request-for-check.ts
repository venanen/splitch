import type {
  ApiResponse,
  ChequeData,
} from '../../../../packages/types/src/index.js';

/**
 * Запрос HTML чека у внешнего сервиса проверки.
 * URL задаётся через CHECK_VERIFY_URL (например https://proverka-cheka.online/process.php).
 */
export async function sendChequeRequest(data: ChequeData): Promise<ApiResponse> {
  const endpoint =
    process.env.CHECK_VERIFY_URL ?? 'https://proverka-cheka.online/process.php';
  const boundary = '----WebKitFormBoundaryGjANwe9elEkXYd58';

  const bodyParts: string[] = [];
  for (const [key, value] of Object.entries(data)) {
    bodyParts.push(
      `--${boundary}\r\nContent-Disposition: form-data; name="${key}"\r\n\r\n${value ?? ''}\r\n`,
    );
  }
  bodyParts.push(`--${boundary}--\r\n`);
  const body = bodyParts.join('');

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      body,
      headers: {
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
      },
    });

    if (!response.ok) {
      return {
        status: 'error',
        error: `HTTP ${response.status}`,
      };
    }

    const text = await response.text();
    return {
      status: 'ok',
      data: text,
    };
  } catch (error) {
    return {
      status: 'error',
      error: error instanceof Error ? error.message : 'Неизвестная ошибка',
    };
  }
}
