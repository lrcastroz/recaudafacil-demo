import { luhnComplete } from './identity';

export type CardBrand = 'VISA' | 'MASTERCARD' | 'DINERS' | 'AMEX' | 'DISCOVER';
export type CardEntry = 'chip' | 'contactless' | 'swipe';

export interface TestCard {
  id: string;
  brand: CardBrand;
  number: string;
  holder: string;
  label: string;
  bank: string;
  /** Código ISO 8583 que devolverá el autorizador si el PIN es correcto */
  responseCode: string;
  color: string;
  contactless: boolean;
}

export const TEST_PIN = '1234';

export const ISO_RESPONSES: Record<string, string> = {
  '00': 'Transacción aprobada',
  '05': 'Transacción no autorizada por el emisor',
  '51': 'Fondos insuficientes',
  '54': 'Tarjeta expirada',
  '55': 'PIN incorrecto',
  '91': 'Emisor no disponible, intente más tarde',
  '96': 'Error del sistema',
};

export const TEST_CARDS: TestCard[] = [
  {
    id: 'visa-ok',
    brand: 'VISA',
    number: '4111111111111111',
    holder: 'MARIA J. ANDRADE',
    label: 'Aprobada',
    bank: 'Banco Andino',
    responseCode: '00',
    color: 'linear-gradient(135deg,#1a3a8f,#2f6fd6)',
    contactless: true,
  },
  {
    id: 'mc-ok',
    brand: 'MASTERCARD',
    number: '5555555555554444',
    holder: 'CARLOS E. VERA',
    label: 'Aprobada',
    bank: 'Banco del Litoral',
    responseCode: '00',
    color: 'linear-gradient(135deg,#1f1f1f,#5a5a5a)',
    contactless: true,
  },
  {
    id: 'diners-ok',
    brand: 'DINERS',
    number: luhnComplete('3600000000000'),
    holder: 'LUCIA PAREDES',
    label: 'Aprobada (sin contactless)',
    bank: 'Diners Club',
    responseCode: '00',
    color: 'linear-gradient(135deg,#55606b,#a9b4bf)',
    contactless: false,
  },
  {
    id: 'visa-51',
    brand: 'VISA',
    number: luhnComplete('400000000000000'),
    holder: 'PEDRO S. LOOR',
    label: 'Fondos insuficientes (51)',
    bank: 'Banco Andino',
    responseCode: '51',
    color: 'linear-gradient(135deg,#0f5132,#2e9e6a)',
    contactless: true,
  },
  {
    id: 'mc-54',
    brand: 'MASTERCARD',
    number: luhnComplete('510510510510510'),
    holder: 'ANA M. CEDEÑO',
    label: 'Expirada (54)',
    bank: 'Cooperativa Sierra',
    responseCode: '54',
    color: 'linear-gradient(135deg,#7c2d12,#d97706)',
    contactless: true,
  },
  {
    id: 'amex-05',
    brand: 'AMEX',
    number: '378282246310005',
    holder: 'JORGE L. MERA',
    label: 'No autorizada (05)',
    bank: 'American Express',
    responseCode: '05',
    color: 'linear-gradient(135deg,#0e7490,#38bdf8)',
    contactless: true,
  },
  {
    id: 'discover-91',
    brand: 'DISCOVER',
    number: '6011111111111117',
    holder: 'ROSA I. TOAPANTA',
    label: 'Emisor no disponible (91)',
    bank: 'Banco Austral',
    responseCode: '91',
    color: 'linear-gradient(135deg,#9a3412,#fb923c)',
    contactless: false,
  },
];

export function findTestCard(id: string): TestCard | undefined {
  return TEST_CARDS.find((c) => c.id === id);
}

export function maskPan(num: string): string {
  return `**** ${num.slice(-4)}`;
}
