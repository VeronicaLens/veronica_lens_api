import type { CatalogModelPort } from './catalog.model.js';
import type { CatalogQuery } from './catalog.schemas.js';

export class CatalogService {
  constructor(private readonly model: CatalogModelPort) {}

  async search(query: CatalogQuery) {
    return await this.model.findMany({
      ...(query.q === undefined ? {} : { searchTerm: query.q }),
      ...(query.type === undefined ? {} : { type: query.type }),
      limit: query.limit,
    });
  }
}
