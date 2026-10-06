import type { Server } from 'socket.io';
import type { ClientToServerEvents, ServerToClientEvents } from '@totem/shared';
import { getTotem } from '../transactions';
import { TotemController } from './TotemController';

type IO = Server<ClientToServerEvents, ServerToClientEvents>;

export class TotemHub {
  private controllers = new Map<string, TotemController>();

  constructor(private io: IO) {}

  get(totemId: string | undefined): TotemController | undefined {
    if (!totemId) return undefined;
    let c = this.controllers.get(totemId);
    if (!c && getTotem(totemId)) {
      c = new TotemController(this.io, totemId);
      this.controllers.set(totemId, c);
    }
    return c;
  }

  all(): TotemController[] {
    return [...this.controllers.values()];
  }
}
