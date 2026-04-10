/** Общие типы домена и интеграции с проверкой чека (splich). */

/** Позиция из HTML-чека после парсинга */
export type ReceiptPosition = {
  name: string;
  price: number;
  quantity: number;
  total: number;
};

/** Данные чека после парсинга HTML */
export type ReceiptData = {
  institution: string;
  address: string;
  inn: string;
  datetime: string;
  receiptNumber: string;
  shiftNumber: string;
  cashier: string;
  positions: ReceiptPosition[];
  total: number;
  cash: number;
  card: number;
  tax18: number;
  tax10: number;
  kktRegNumber: string;
  fn: string;
  fd: string;
  fpd: string;
};

/** Поля multipart-запроса к сервису проверки чека */
export type ChequeData = {
  fn: string;
  fd: string;
  fp: string;
  total: string;
  date: string;
  time: string;
};

export type ApiResponse =
  | { status: 'ok'; data: string }
  | { status: 'error'; error: string };

/** QR ФН-ФД-ФП (и сумма/время) — вход для загрузки чека */
export type FiscalQrPayload = {
  fn: string;
  fd: string;
  fp: string;
  /** Сумма чека строкой, как в форме (рубли с копейками) */
  total: string;
  date: string;
  time: string;
};

export type TripId = string;
export type ParticipantId = string;
export type ReceiptId = string;
export type LineItemId = string;
