/**
 * Datos semilla del demo: servicios básicos de luz (CentroSur), agua potable
 * (ETAPA EP en Cuenca y EPMAPA-SD en Santo Domingo) e internet (ETAPA EP y Yiga5).
 * Incluye cuentas con planillas pendientes, tótems con inventario de efectivo e
 * histórico de transacciones para que el panel administrador tenga contenido.
 */
import { TEST_CARDS, buildAccessKey, cedulaCheckDigit, maskName } from '@totem/shared';
import type { ServiceType } from '@totem/shared';
import { all as db_all, get, run, tx } from './db';
import { DEFAULT_SETTINGS, RECYCLABLE_BILLS } from './settings';

interface BillerSeed {
  code: string;
  name: string;
  shortName: string;
  service: ServiceType;
  region: string;
  /** Ciudad de los suscriptores (direcciones y provincia de las cédulas) */
  city: keyof typeof ADDRESSES;
  idLabel: string;
  idHint: string;
  idPattern: string;
  color: string;
}

const BILLERS: BillerSeed[] = [
  {
    code: 'CENTROSUR',
    name: 'Empresa Eléctrica Regional Centro Sur',
    shortName: 'CentroSur',
    service: 'LUZ',
    region: 'Cuenca · Azuay, Cañar y Morona Santiago',
    city: 'Cuenca',
    idLabel: 'Código Único Eléctrico Nacional (CUEN)',
    idHint: '10 dígitos, ubicado en la parte superior de su planilla',
    idPattern: '^\\d{10}$',
    color: '#f59e0b',
  },
  {
    code: 'ETAPA_AGUA',
    name: 'ETAPA EP - Agua Potable y Saneamiento',
    shortName: 'ETAPA Agua',
    service: 'AGUA',
    region: 'Cuenca',
    city: 'Cuenca',
    idLabel: 'Número de cuenta',
    idHint: '6 dígitos',
    idPattern: '^\\d{6}$',
    color: '#0284c7',
  },
  {
    code: 'EPMAPA_SD',
    name: 'EPMAPA-SD - Agua Potable y Alcantarillado de Santo Domingo',
    shortName: 'EPMAPA-SD',
    service: 'AGUA',
    region: 'Santo Domingo de los Tsáchilas',
    city: 'Santo Domingo',
    idLabel: 'Número de cuenta',
    idHint: '7 dígitos, ubicado en su planilla de agua',
    idPattern: '^\\d{7}$',
    color: '#0e7490',
  },
  {
    code: 'ETAPA_TEL',
    name: 'ETAPA EP - Internet y Telefonía',
    shortName: 'ETAPA Internet',
    service: 'TELEFONO',
    region: 'Cuenca',
    city: 'Cuenca',
    idLabel: 'Número de teléfono fijo del servicio',
    idHint: '9 dígitos que empiezan con 07 (ej. 072845678)',
    idPattern: '^07\\d{7}$',
    color: '#7c3aed',
  },
  {
    code: 'YIGA5',
    name: 'Yiga5 - Internet por fibra óptica',
    shortName: 'Yiga5',
    service: 'TELEFONO',
    region: 'Guayas y Santa Elena',
    city: 'Guayaquil',
    idLabel: 'Cédula del titular del servicio',
    idHint: '10 dígitos',
    idPattern: '^\\d{10}$',
    color: '#db2777',
  },
];

type AccountStatus = 'ACTIVA' | 'SUSPENDIDA' | 'ERROR_CONSULTA';

interface AccountSeed {
  identifier: string;
  holder: string;
  pending: number;
  status?: AccountStatus;
  credit?: number;
}

/** Cuentas fijas por empresa, para que los códigos del guion no cambien entre reinicios. */
const ACCOUNTS: Record<string, AccountSeed[]> = {
  CENTROSUR: [
    { identifier: '0122436833', holder: 'ANA QUISHPE ALVARADO', pending: 2 },
    { identifier: '0162157448', holder: 'GABRIELA CEDEÑO MERA', pending: 1 },
    { identifier: '0195063866', holder: 'JUAN CEDEÑO MOREIRA', pending: 3 },
    { identifier: '0194349550', holder: 'XAVIER PAREDES BRAVO', pending: 1 },
    { identifier: '0171538842', holder: 'ROSA GUAMAN ORTIZ', pending: 2 },
    { identifier: '0145872310', holder: 'MARIA ANDRADE VERA', pending: 1, credit: 150 },
    { identifier: '0166819152', holder: 'ANDRES NARANJO CEDEÑO', pending: 0 },
    { identifier: '0137264519', holder: 'DIANA QUISHPE PAREDES', pending: 1, status: 'SUSPENDIDA' },
    { identifier: '0158803326', holder: 'LUIS QUISHPE PAREDES', pending: 1, status: 'ERROR_CONSULTA' },
  ],
  ETAPA_AGUA: [
    { identifier: '377611', holder: 'XAVIER VILLACIS PAREDES', pending: 2 },
    { identifier: '395248', holder: 'SANDRA ZAMBRANO ALVARADO', pending: 1 },
    { identifier: '332461', holder: 'XAVIER ANDRADE VILLACIS', pending: 3 },
    { identifier: '346453', holder: 'ROSA GUAMAN ZAMBRANO', pending: 1 },
    { identifier: '318204', holder: 'CARLOS MOLINA BRAVO', pending: 2, credit: 150 },
    { identifier: '367278', holder: 'LUIS MOREIRA QUISHPE', pending: 0 },
    { identifier: '354190', holder: 'JORGE ALVARADO GUAMAN', pending: 2, status: 'SUSPENDIDA' },
  ],
  ETAPA_TEL: [
    { identifier: '071317436', holder: 'ANDRES PAREDES PAREDES', pending: 2 },
    { identifier: '078368027', holder: 'ROSA ZAMBRANO NARANJO', pending: 1 },
    { identifier: '077087941', holder: 'ANDRES ANDRADE CEDEÑO', pending: 3 },
    { identifier: '079317943', holder: 'PABLO NARANJO TOAPANTA', pending: 1 },
    { identifier: '072845678', holder: 'VERONICA SALAZAR CHAVEZ', pending: 2 },
    { identifier: '077318373', holder: 'ANA CEDEÑO TOAPANTA', pending: 0 },
    { identifier: '074512983', holder: 'MIGUEL LOOR MOREIRA', pending: 1, status: 'SUSPENDIDA' },
  ],
  EPMAPA_SD: [
    { identifier: '2304518', holder: 'MARIA CEVALLOS ZAMBRANO', pending: 2 },
    { identifier: '2311742', holder: 'JOSE AGUIRRE LOOR', pending: 1 },
    { identifier: '2290365', holder: 'KARINA MOREIRA VERA', pending: 3 },
    { identifier: '2287014', holder: 'LUIS ALCIVAR MERA', pending: 1, credit: 150 },
    { identifier: '2275590', holder: 'PEDRO ZAMBRANO CEDEÑO', pending: 0 },
    { identifier: '2268831', holder: 'ROSA TOAPANTA CHAVEZ', pending: 1, status: 'SUSPENDIDA' },
  ],
  // Yiga5 identifica al cliente por la cédula del titular (cédulas válidas de Guayas)
  YIGA5: [
    { identifier: '0912345675', holder: 'CARLOS VERA MOLINA', pending: 1 },
    { identifier: '0928451038', holder: 'GABRIELA SALAZAR ORTIZ', pending: 2 },
    { identifier: '0907164826', holder: 'JORGE MOREIRA BRAVO', pending: 3 },
    { identifier: '0933805194', holder: 'PATRICIA CHAVEZ LOOR', pending: 0 },
    { identifier: '0919572644', holder: 'FERNANDO NARANJO VERA', pending: 1, status: 'SUSPENDIDA' },
    { identifier: '0944028711', holder: 'DIANA ALVARADO CEDEÑO', pending: 1, status: 'ERROR_CONSULTA' },
  ],
};

const ADDRESSES = {
  Cuenca: [
    'Calle Larga 7-45 y Borrero',
    'Av. Remigio Crespo 3-87 y Guayas',
    'Av. Ordóñez Lasso, Edif. Altamira, Dpto. 3B',
    'Calle Bolívar 9-28 y Padre Aguirre',
    'Av. 10 de Agosto y Francisco Moscoso',
    'Av. de las Américas y Av. Gil Ramírez Dávalos',
    'Urb. Los Cerezos, calle Los Álamos 2-30, Totoracocha',
    'Av. Solano 5-112 y Av. 12 de Abril',
    'Sector Misicata, vía a Baños km 4',
    'Calle Gran Colombia 15-60 y Tarqui',
  ],
  'Santo Domingo': [
    'Av. Quito y Río Toachi',
    'Av. Tsáchila y Yanuncay',
    'Coop. Santa Martha, calle 3',
    'Urb. Los Rosales, Av. Abraham Calazacón',
    'Av. Chone km 2, sector Las Palmas',
  ],
  Guayaquil: [
    'Cdla. Kennedy Norte Mz. 12 V. 8',
    'Urb. La Joya, Etapa Ópalo, Mz. 5 V. 22',
    'Cdla. Sauces 6, Mz. 270 V. 4',
    'Vía a la Costa km 14, Urb. Puerto Azul',
    'Av. León Febres Cordero, Urb. La Romareda',
  ],
};

const PROVINCE: Record<keyof typeof ADDRESSES, string> = { Cuenca: '01', 'Santo Domingo': '23', Guayaquil: '09' };

const digits = (n: number, r: () => number) =>
  Array.from({ length: n }, () => Math.floor(r() * 10)).join('');

function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(arr: T[], r: () => number): T {
  return arr[Math.floor(r() * arr.length)];
}

function between(min: number, max: number, r: () => number) {
  return Math.round(min + r() * (max - min));
}

/** Cédula válida de la provincia indicada. */
function makeCedula(province: string, r: () => number): string {
  const first9 = province + Math.floor(r() * 6) + digits(6, r);
  return first9 + cedulaCheckDigit(first9);
}

function ymd(d: Date) {
  return d.toISOString().slice(0, 10);
}

/** Planes de Yiga5: tarifa mensual fija, igual en todas las planillas del cliente. */
const YIGA5_PLANS = [
  { mbps: 300, price: 2000 },
  { mbps: 500, price: 2500 },
  { mbps: 700, price: 2800 },
  { mbps: 1000, price: 3500 },
];

function invoiceAmount(service: ServiceType, billerCode: string, r: () => number) {
  if (service === 'LUZ') return between(900, 6500, r);
  if (service === 'AGUA') return between(550, 3800, r);
  if (billerCode === 'YIGA5') return pick(YIGA5_PLANS, r).price;
  return between(1800, 4500, r);
}

function invoiceDetail(service: ServiceType, r: () => number) {
  if (service === 'LUZ') return `Consumo ${between(90, 420, r)} kWh, alumbrado público y tasa de recolección de basura`;
  if (service === 'AGUA') return `Consumo ${between(8, 40, r)} m³, alcantarillado y conservación de fuentes`;
  return `Internet fibra óptica ${pick(['50', '100', '200', '300'], r)} Mbps${r() < 0.5 ? ' + telefonía fija' : ''}`;
}

export interface DemoAccount {
  billerCode: string;
  service: ServiceType;
  identifier: string;
  holder: string;
  pending: number;
  note: string;
}

export const TOTEMS = [
  { id: 'TOT-001', name: 'Tótem C.C. Río Tomebamba', city: 'Cuenca', location: 'C.C. Río Tomebamba, Av. Ordóñez Lasso, Cuenca', establishment: '001', emissionPoint: '101' },
  { id: 'TOT-002', name: 'Tótem Centro Histórico', city: 'Cuenca', location: 'Calle Bolívar y Benigno Malo, junto al Parque Calderón, Cuenca', establishment: '002', emissionPoint: '201' },
  { id: 'TOT-003', name: 'Tótem C.C. El Arenal', city: 'Cuenca', location: 'Mercado El Arenal, Av. de las Américas, Cuenca', establishment: '003', emissionPoint: '301' },
];

/** Canal virtual para los pagos hechos desde el portal web con botón de pagos. */
export const WEB_CHANNEL = {
  id: 'WEB-001',
  name: 'Portal web RecaudaFácil',
  city: 'En línea',
  location: 'Pagos en línea con botón de pagos',
  establishment: '004',
  emissionPoint: '401',
};

/** Registra el canal web si no existe (también en bases creadas antes de esta función). */
export function ensureWebChannel() {
  run(
    `INSERT OR IGNORE INTO totems(id, name, city, location, establishment, emission_point, paper_level, receipt_seq, channel)
     VALUES (?,?,?,?,?,?,100,0,'WEB')`,
    WEB_CHANNEL.id, WEB_CHANNEL.name, WEB_CHANNEL.city, WEB_CHANNEL.location, WEB_CHANNEL.establishment, WEB_CHANNEL.emissionPoint,
  );
}

export function seedIfEmpty() {
  const existing = get<{ n: number }>('SELECT COUNT(*) AS n FROM billers');
  if (existing && existing.n > 0) return false;
  tx(() => seed());
  return true;
}

function seed() {
  const r = mulberry32(20261006);
  const now = new Date();

  for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
    run('INSERT OR REPLACE INTO settings(key, value) VALUES (?, ?)', key, JSON.stringify(value));
  }

  // ---- Tótems e inventario ----
  for (const t of TOTEMS) {
    run(
      'INSERT INTO totems(id, name, city, location, establishment, emission_point, paper_level, receipt_seq) VALUES (?,?,?,?,?,?,?,?)',
      t.id, t.name, t.city, t.location, t.establishment, t.emissionPoint, 100, 0,
    );
    resetInventory(t.id);
  }

  // ---- Empresas, cuentas y planillas ----
  const currentMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  for (const b of BILLERS) {
    run(
      'INSERT INTO billers(code, name, short_name, service, region, id_label, id_hint, id_pattern, color, active) VALUES (?,?,?,?,?,?,?,?,?,1)',
      b.code, b.name, b.shortName, b.service, b.region, b.idLabel, b.idHint, b.idPattern, b.color,
    );

    for (const acc of ACCOUNTS[b.code]) {
      const res = run(
        'INSERT INTO accounts(biller_code, identifier, holder, holder_id, address, status, credit) VALUES (?,?,?,?,?,?,?)',
        b.code, acc.identifier, acc.holder, makeCedula(PROVINCE[b.city], r), pick(ADDRESSES[b.city], r), acc.status ?? 'ACTIVA', acc.credit ?? 0,
      );
      const accountId = Number(res.lastInsertRowid);
      const plan = b.code === 'YIGA5' ? pick(YIGA5_PLANS, r) : null;
      for (let i = acc.pending; i >= 1; i--) {
        const periodDate = new Date(currentMonth.getFullYear(), currentMonth.getMonth() - i, 1);
        const issue = new Date(periodDate.getFullYear(), periodDate.getMonth() + 1, 1);
        const due = new Date(issue.getFullYear(), issue.getMonth(), 20);
        const period = `${periodDate.getFullYear()}-${String(periodDate.getMonth() + 1).padStart(2, '0')}`;
        run(
          'INSERT INTO invoices(account_id, period, issue_date, due_date, amount, detail, status) VALUES (?,?,?,?,?,?,?)',
                    accountId, period, ymd(issue), ymd(due),
          plan ? plan.price : invoiceAmount(b.service, b.code, r),
          plan ? `Plan hogar fibra óptica ${plan.mbps} Mbps con WiFi 6` : invoiceDetail(b.service, r),
          'PENDIENTE',
        );
      }
    }
  }

  seedHistory(r, now);
}

export function resetInventory(totemId: string) {
  run('DELETE FROM cash_inventory WHERE totem_id = ?', totemId);
  // Monedas en hopper: [stock inicial, capacidad]. Las de 50¢ y $1 son más grandes: hopper más chico.
  const coinStock: Record<number, [number, number]> = { 1: [150, 400], 5: [150, 400], 10: [180, 400], 25: [180, 400], 50: [60, 150], 100: [80, 150] };
  for (const [v, [n, cap]] of Object.entries(coinStock)) {
    run('INSERT INTO cash_inventory VALUES (?,?,?,?,?,?)', totemId, 'coin', Number(v), 'hopper', n, cap);
    run('INSERT INTO cash_inventory VALUES (?,?,?,?,?,?)', totemId, 'coin', Number(v), 'cashbox', 0, 2000);
  }
  const recyclerStock: Record<number, number> = { 100: 30, 500: 24, 1000: 20 };
  for (const v of RECYCLABLE_BILLS) {
    run('INSERT INTO cash_inventory VALUES (?,?,?,?,?,?)', totemId, 'bill', v, 'recycler', recyclerStock[v], 60);
  }
  for (const v of [100, 200, 500, 1000, 2000, 5000, 10000]) {
    run('INSERT INTO cash_inventory VALUES (?,?,?,?,?,?)', totemId, 'bill', v, 'cashbox', 0, 600);
  }
}

/** Histórico de los últimos 7 días para dar vida al panel administrador. */
function seedHistory(r: () => number, now: Date) {
  const accounts = db_all<{ id: number; biller_code: string; identifier: string; holder: string; service: ServiceType }>(
    `SELECT a.id, a.biller_code, a.identifier, a.holder, b.service FROM accounts a JOIN billers b ON b.code = a.biller_code
     WHERE a.status = 'ACTIVA'`,
  );
  const seqs: Record<string, number> = {};
  const ecOffsetMs = 5 * 3600 * 1000; // Ecuador UTC-5

  for (let day = 7; day >= 0; day--) {
    for (const t of TOTEMS) {
      const count = between(6, 14, r);
      for (let i = 0; i < count; i++) {
        const localHour = between(7, 20, r);
        const minute = between(0, 59, r);
        const local = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - day, localHour, minute, between(0, 59, r)));
        const created = new Date(local.getTime() + ecOffsetMs);
        if (created > now) continue;

        const acc = pick(accounts, r);
        const subtotal = invoiceAmount(acc.service, acc.biller_code, r) * (r() < 0.25 ? 2 : 1);
        const commission = DEFAULT_SETTINGS.commission;
        const iva = Math.round((commission * DEFAULT_SETTINGS.ivaRate) / 100);
        const total = subtotal + commission + iva;
        const method = r() < 0.64 ? 'EFECTIVO' : 'TARJETA';
        const roll = r();
        const status = roll < 0.9 ? 'PAGADA' : roll < 0.95 ? 'CANCELADA' : roll < 0.98 ? 'REVERSADA' : 'FALLIDA';
        const cashIn = method === 'EFECTIVO' && status === 'PAGADA' ? Math.ceil(total / 500) * 500 : 0;
        const id = `TX${created.getTime().toString(36).toUpperCase()}${Math.floor(r() * 1296).toString(36).toUpperCase().padStart(2, '0')}`;
        let receiptNumber: string | null = null;
        let accessKey: string | null = null;
        if (status === 'PAGADA') {
          seqs[t.id] = (seqs[t.id] ?? 0) + 1;
          receiptNumber = `${t.establishment}-${t.emissionPoint}-${String(seqs[t.id]).padStart(9, '0')}`;
          accessKey = buildAccessKey({
            date: created,
            ruc: DEFAULT_SETTINGS.companyRuc,
            environment: '1',
            establishment: t.establishment,
            emissionPoint: t.emissionPoint,
            sequential: seqs[t.id],
            numericCode: digits(8, r),
          });
        }
        run(
          `INSERT INTO transactions(id, totem_id, biller_code, account_id, identifier, holder_masked, subtotal, credit_applied, commission, iva, total, method, status,
             billing_type, billing_id, billing_name, billing_email, cash_in, change_given, credit_generated, biller_ref, receipt_number, access_key, receipt_text, message, created_at, updated_at)
           VALUES (?,?,?,?,?,?,?,0,?,?,?,?,?,'CONSUMIDOR_FINAL','9999999999999','CONSUMIDOR FINAL','',?,?,0,?,?,?,NULL,NULL,?,?)`,
          id, t.id, acc.biller_code, acc.id, acc.identifier, maskName(acc.holder), subtotal, commission, iva, total, method, status,
          cashIn, cashIn ? cashIn - total : 0,
          status === 'PAGADA' ? `${acc.biller_code}-${digits(7, r)}` : null,
          receiptNumber, accessKey, created.toISOString(), created.toISOString(),
        );
        if (method === 'TARJETA' && status !== 'CANCELADA') {
          const card = pick(TEST_CARDS.filter((c) => c.responseCode === '00'), r);
          run(
            `INSERT INTO card_authorizations(tx_id, brand, last4, holder, entry, amount, response_code, auth_code, batch, reference, status, created_at)
             VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
            id, card.brand, card.number.slice(-4), card.holder, pick(['chip', 'contactless'], r), total, '00',
            digits(6, r), '000' + digits(3, r), digits(6, r), status === 'REVERSADA' ? 'REVERSADA' : 'APROBADA', created.toISOString(),
          );
        }
      }
    }
  }
  for (const t of TOTEMS) run('UPDATE totems SET receipt_seq = ? WHERE id = ?', seqs[t.id] ?? 0, t.id);
}

export function demoAccounts(): DemoAccount[] {
  return db_all<{ biller_code: string; service: ServiceType; identifier: string; holder: string; status: string; credit: number; pending: number }>(
    `SELECT a.biller_code, b.service, a.identifier, a.holder, a.status, a.credit,
       (SELECT COUNT(*) FROM invoices i WHERE i.account_id = a.id AND i.status = 'PENDIENTE') AS pending
     FROM accounts a JOIN billers b ON b.code = a.biller_code
     ORDER BY CASE b.service WHEN 'LUZ' THEN 1 WHEN 'AGUA' THEN 2 ELSE 3 END, a.id`,
  ).map((a) => ({
    billerCode: a.biller_code,
    service: a.service,
    identifier: a.identifier,
    holder: a.holder,
    pending: a.pending,
    note:
      a.status === 'SUSPENDIDA'
        ? 'Cuenta suspendida'
        : a.status === 'ERROR_CONSULTA'
          ? 'Empresa no responde (error de consulta)'
          : a.pending === 0
            ? 'Sin deuda pendiente'
            : a.credit > 0
              ? `${a.pending} planilla(s) + saldo a favor`
              : `${a.pending} planilla(s) pendiente(s)`,
  }));
}
