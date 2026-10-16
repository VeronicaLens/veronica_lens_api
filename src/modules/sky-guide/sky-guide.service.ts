import type {
  SkyGuideModelPort,
  SkyGuidePositionQuery,
  SkyGuidePositionResult,
} from './sky-guide.model.js';

export class SkyGuideService {
  constructor(private readonly model: SkyGuideModelPort) {}

  async getPositions(query: SkyGuidePositionQuery): Promise<SkyGuidePositionResult> {
    return await this.model.getPositions(query);
  }
}
