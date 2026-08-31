import type { HealthModel } from './health.model.js';

export class HealthService {
  constructor(private readonly healthModel: HealthModel) {}

  check() {
    return {
      status: 'ok' as const,
      ...this.healthModel.getSnapshot(),
    };
  }
}
