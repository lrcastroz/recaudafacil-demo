import { useEffect, useMemo, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import type { ClientRole, ClientToServerEvents, DeviceStatus, ServerToClientEvents } from '@totem/shared';

export type TotemSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

/** Conexión Socket.IO que se (re)une a la sala del tótem en cada reconexión. */
export function useTotemSocket(role: ClientRole, totemId?: string) {
  const socket = useMemo<TotemSocket>(() => io({ transports: ['websocket'], autoConnect: false }), []);
  const [connected, setConnected] = useState(false);
  const [status, setStatus] = useState<DeviceStatus | null>(null);

  useEffect(() => {
    const onConnect = () => {
      setConnected(true);
      socket.emit('join', { role, totemId });
    };
    const onDisconnect = () => setConnected(false);
    const onStatus = (s: DeviceStatus) => {
      if (!totemId || s.totemId === totemId) setStatus(s);
    };
    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('device:status', onStatus);
    socket.connect();
    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('device:status', onStatus);
      socket.disconnect();
    };
  }, [socket, role, totemId]);

  return { socket, connected, status };
}

export function emitAck(
  socket: TotemSocket,
  event: 'cash:start' | 'cash:cancel' | 'card:start' | 'card:cancel',
  txId: string,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('El tótem no respondió a tiempo')), 15000);
    socket.emit(event, { txId }, (r) => {
      clearTimeout(timer);
      if (r.ok) resolve();
      else reject(new Error(r.error));
    });
  });
}
