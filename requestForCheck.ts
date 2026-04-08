import FormData from 'form-data';
import fetch from 'node-fetch';
import {ApiResponse, ChequeData} from "../../types";



export async function sendChequeRequest(data: ChequeData): Promise<ApiResponse> {
    const form = new FormData();

    // Явно задаем boundary
    const boundary = '----WebKitFormBoundaryGjANwe9elEkXYd58';

    // Добавляем поля в форму
    Object.entries(data).forEach(([key, value]) => {
        form.append(key, value || '');
    });

    try {
        const response = await fetch('https://proverka-cheka.online/process.php', {
            method: 'POST',
            body: form,
            headers: {
                ...form.getHeaders(),
                // Переопределяем content-type с нужным boundary
                'Content-Type': `multipart/form-data; boundary=${boundary}`,
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
            },
        });

        if (!response.ok) {
            return {
                status: 'error',
                error: `HTTP error! status: ${response.status}`,
            };
        }

        const data = await response.text();
        return {
            status: 'ok',
            data: data,
        }
    } catch (error) {
        console.error('Request failed:', error);
        return {
            status: 'error',
            error: error instanceof Error ? error.message : 'Unknown error',
        };
    }
}

// Пример использования остается без изменений
const chequeData: ChequeData = {
    fn: '7384440800215290',
    fd: '2271',
    fp: '1305261358',
    total: '1250.00',
    date: '2025-03-03',
    time: '13:00',
};

sendChequeRequest(chequeData)
    .then(response => console.log('Response:', response))
    .catch(error => console.error('Error:', error));
