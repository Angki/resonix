import { EventEmitter } from 'events';

export interface ScanCompletedEvent {
  startedAt?: Date;
  finishedAt: Date;
  cancelled: boolean;
  errorsCount: number;
  tracksAdded: number;
  tracksUpdated: number;
}

export const healthEvents = new EventEmitter();
healthEvents.setMaxListeners(20);
