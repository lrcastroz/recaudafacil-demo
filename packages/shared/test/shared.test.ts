import { describe, expect, it } from 'vitest';
import {
  TEST_CARDS,
  breakdownTotal,
  buildAccessKey,
  cedulaCheckDigit,
  computeChange,
  computeTotals,
  detectBrand,
  requires3ds,
  formatMoneyPlain,
  luhnValid,
  maskName,
  mod11CheckDigit,
  validateCedula,
  validateRuc,
} from '../src';

describe('money', () => {
  it('calcula comisión con IVA 15 % sólo sobre la comisión', () => {
    const t = computeTotals(4455, 40, 15);
    expect(t).toEqual({ subtotal: 4455, creditApplied: 0, commission: 40, iva: 6, total: 4501 });
  });

  it('aplica saldo a favor sin exceder el valor de las planillas', () => {
    expect(computeTotals(1000, 40, 15, 250).total).toBe(1000 - 250 + 46);
    expect(computeTotals(1000, 40, 15, 5000).total).toBe(46);
  });

  it('formatea montos para el ticket', () => {
    expect(formatMoneyPlain(450123)).toBe('$ 4.501,23');
    expect(formatMoneyPlain(5)).toBe('$ 0,05');
  });
});

describe('identificación', () => {
  it('valida cédulas con módulo 10', () => {
    expect(validateCedula('1710034065')).toBe(true);
    expect(validateCedula('1710034066')).toBe(false);
    expect(validateCedula('9910034065')).toBe(false); // provincia inválida
    expect(validateCedula('17100340')).toBe(false);
  });

  it('genera dígitos verificadores consistentes', () => {
    const base = '091234567';
    expect(validateCedula(base + cedulaCheckDigit(base))).toBe(true);
  });

  it('valida RUC de persona natural y sociedad', () => {
    expect(validateRuc('1710034065001')).toBe(true);
    expect(validateRuc('1710034065000')).toBe(false);
    expect(validateRuc('1792345678001')).toBe(true);
  });

  it('enmascara el nombre del titular', () => {
    expect(maskName('JUAN CARLOS PEREZ')).toBe('JUAN C***** P****');
  });

  it('todas las tarjetas de prueba pasan Luhn', () => {
    for (const c of TEST_CARDS) expect(luhnValid(c.number), c.id).toBe(true);
  });
});

describe('botón de pagos', () => {
  it('detecta la marca por BIN', () => {
    expect(detectBrand('4111111111111111')).toBe('VISA');
    expect(detectBrand('5555555555554444')).toBe('MASTERCARD');
    expect(detectBrand('2221000000000009')).toBe('MASTERCARD');
    expect(detectBrand('378282246310005')).toBe('AMEX');
    expect(detectBrand('36000000000008')).toBe('DINERS');
    expect(detectBrand('6011111111111117')).toBe('DISCOVER');
    expect(detectBrand('9999')).toBeNull();
  });

  it('exige 3-D Secure sólo a Mastercard y Amex', () => {
    expect(requires3ds('MASTERCARD')).toBe(true);
    expect(requires3ds('AMEX')).toBe(true);
    expect(requires3ds('VISA')).toBe(false);
  });

  it('todas las tarjetas de prueba tienen marca detectable', () => {
    for (const c of TEST_CARDS) expect(detectBrand(c.number), c.id).toBe(c.brand);
  });
});

describe('vuelto', () => {
  it('usa greedy cuando alcanza', () => {
    const b = computeChange(499, { 100: 10, 25: 10, 10: 10, 5: 10, 1: 10 });
    expect(b).toEqual({ 100: 4, 25: 3, 10: 2, 1: 4 });
  });

  it('encuentra combinación cuando greedy falla', () => {
    // 30¢ con sólo 25¢ x1 y 10¢ x3: greedy toma 25 y queda 5 sin solución
    const b = computeChange(30, { 25: 1, 10: 3 });
    expect(b).toEqual({ 10: 3 });
    expect(breakdownTotal(b!)).toBe(30);
  });

  it('devuelve null si no hay cambio suficiente', () => {
    expect(computeChange(75, { 25: 2 })).toBeNull();
    expect(computeChange(1, {})).toBeNull();
  });

  it('cero no requiere vuelto', () => {
    expect(computeChange(0, {})).toEqual({});
  });
});

describe('SRI', () => {
  it('genera clave de acceso de 49 dígitos con verificador módulo 11', () => {
    const key = buildAccessKey({
      date: new Date(2026, 9, 6),
      ruc: '1792345678001',
      environment: '1',
      establishment: '001',
      emissionPoint: '002',
      sequential: 1234,
      numericCode: '12345678',
    });
    expect(key).toHaveLength(49);
    expect(key.startsWith('06102026011792345678001')).toBe(true);
    expect(mod11CheckDigit(key.slice(0, 48))).toBe(Number(key[48]));
  });
});
