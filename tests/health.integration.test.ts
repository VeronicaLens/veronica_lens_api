import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { createApp } from '../src/app.js';

describe('GET /api/v1/health', () => {
  it('returns the API health status', async () => {
    const response = await request(createApp({ enableLogger: false })).get('/api/v1/health');

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      data: {
        status: 'ok',
        database: 'not_checked',
      },
    });
  });
});
