import type { CardEntry } from '@totem/shared';
import type { TotemSocket } from '../lib/socket';

/** Acciones "físicas" del cliente sobre el hardware del tótem. */
export interface Physical {
  coin: (value: number) => void;
  bill: (value: number) => void;
  card: (cardId: string, entry: CardEntry) => void;
  removeCard: () => void;
  pinKey: (key: string) => void;
  scan: (code: string) => void;
  takeTray: () => void;
}

export function physical(socket: TotemSocket, totemId: string): Physical {
  return {
    coin: (value) => void socket.emit('physical:coin', { totemId, value }),
    bill: (value) => void socket.emit('physical:bill', { totemId, value }),
    card: (cardId, entry) => void socket.emit('physical:card', { totemId, cardId, entry }),
    removeCard: () => void socket.emit('physical:removeCard', { totemId }),
    pinKey: (key) => void socket.emit('physical:pinKey', { totemId, key }),
    scan: (code) => void socket.emit('physical:scan', { totemId, code }),
    takeTray: () => void socket.emit('physical:takeTray', { totemId }),
  };
}

export type DragPayload =
  | { type: 'coin'; value: number }
  | { type: 'bill'; value: number }
  | { type: 'card'; cardId: string }
  | { type: 'planilla'; code: string };

const MIME = 'application/x-totem';
let current: DragPayload | null = null;

export function dragProps(payload: DragPayload) {
  return {
    draggable: true,
    onDragStart: (e: React.DragEvent) => {
      current = payload;
      e.dataTransfer.setData(MIME, JSON.stringify(payload));
      e.dataTransfer.effectAllowed = 'move';
    },
    onDragEnd: () => {
      current = null;
    },
  };
}

/** Zona donde se puede soltar un objeto (ranura, lector...). */
export function dropProps(accept: DragPayload['type'][], onDrop: (p: DragPayload) => void, setOver?: (v: boolean) => void) {
  return {
    onDragOver: (e: React.DragEvent) => {
      if (current && accept.includes(current.type)) {
        e.preventDefault();
        setOver?.(true);
      }
    },
    onDragLeave: () => setOver?.(false),
    onDrop: (e: React.DragEvent) => {
      e.preventDefault();
      setOver?.(false);
      const raw = e.dataTransfer.getData(MIME);
      if (!raw) return;
      const p = JSON.parse(raw) as DragPayload;
      if (accept.includes(p.type)) onDrop(p);
    },
  };
}
