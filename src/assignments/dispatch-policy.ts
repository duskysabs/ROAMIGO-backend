import { Injectable } from '@nestjs/common';

@Injectable()
export class DispatchPolicy {
  readonly responseWindowMinutes: number;

  constructor() {
    const configured = process.env.DRIVER_RESPONSE_WINDOW_MINUTES ?? '120';
    if (!/^\d+$/.test(configured) || Number(configured) < 1 || Number(configured) > 10080) {
      throw new Error('DRIVER_RESPONSE_WINDOW_MINUTES must be an integer between 1 and 10080');
    }
    this.responseWindowMinutes = Number(configured);
  }

  deadline(dispatchedAt: Date) {
    return new Date(dispatchedAt.getTime() + this.responseWindowMinutes * 60000);
  }
}
