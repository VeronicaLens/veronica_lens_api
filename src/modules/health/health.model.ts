export interface HealthSnapshot {
  checkedAt: string;
  database: 'not_checked';
}

export class HealthModel {
  getSnapshot(): HealthSnapshot {
    return {
      checkedAt: new Date().toISOString(),
      database: 'not_checked',
    };
  }
}
