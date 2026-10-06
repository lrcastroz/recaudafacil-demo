import type { DeviceStatus } from '@totem/shared';
import type { KioskActions, KioskConfig, KioskState } from '../useKiosk';

export interface ScreenProps {
  state: KioskState;
  actions: KioskActions;
  config: KioskConfig;
  device: DeviceStatus | null;
}
