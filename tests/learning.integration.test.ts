import type { RequestHandler } from 'express';
import type { SupabaseClient } from '@supabase/supabase-js';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';

import { createApp } from '../src/app.js';
import type { LearningModelPort } from '../src/modules/learning/index.js';

const userId = '40000000-0000-4000-8000-000000000001';

const authenticate: RequestHandler = (req, _res, next) => {
  req.auth = {
    accessToken: 'access-token',
    userId,
    role: 'user',
    supabase: {} as SupabaseClient,
  };
  next();
};

function modelWith(overrides: Partial<LearningModelPort> = {}): LearningModelPort {
  return {
    listTracks: vi.fn().mockResolvedValue([]),
    listLessons: vi.fn().mockResolvedValue([]),
    listProgress: vi.fn().mockResolvedValue([]),
    upsertProgress: vi.fn().mockResolvedValue({
      lessonId: '20000000-0000-4000-8000-000000000001',
      status: 'in_progress',
      progressPercent: 50,
      completedAt: null,
    }),
    ...overrides,
  };
}

describe('learning routes', () => {
  it('lists published tracks', async () => {
    const listTracks = vi.fn().mockResolvedValue([
      {
        id: '10000000-0000-4000-8000-000000000001',
        slug: 'fundamentos-de-astronomia',
        title: 'Fundamentos de astronomia',
        description: 'Trilha introdutória.',
        sortOrder: 10,
      },
    ]);

    const response = await request(
      createApp({
        enableLogger: false,
        authenticateHandler: authenticate,
        learningModel: modelWith({ listTracks }),
      }),
    ).get('/api/v1/learning/tracks');

    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(1);
    expect(listTracks).toHaveBeenCalledWith({});
  });

  it('lists lessons for a track', async () => {
    const listLessons = vi.fn().mockResolvedValue([
      {
        id: '20000000-0000-4000-8000-000000000001',
        trackId: '10000000-0000-4000-8000-000000000001',
        slug: 'orientacao-no-ceu',
        title: 'Orientação no céu',
        content: 'Conteúdo.',
        sortOrder: 10,
      },
    ]);

    const response = await request(
      createApp({
        enableLogger: false,
        authenticateHandler: authenticate,
        learningModel: modelWith({ listLessons }),
      }),
    ).get('/api/v1/learning/tracks/10000000-0000-4000-8000-000000000001/lessons');

    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(1);
    expect(listLessons).toHaveBeenCalledWith(
      {},
      '10000000-0000-4000-8000-000000000001',
    );
  });

  it('rejects an invalid track id', async () => {
    const response = await request(
      createApp({
        enableLogger: false,
        authenticateHandler: authenticate,
        learningModel: modelWith(),
      }),
    ).get('/api/v1/learning/tracks/not-a-uuid/lessons');

    expect(response.status).toBe(400);
  });

  it('returns the authenticated user progress', async () => {
    const listProgress = vi.fn().mockResolvedValue([
      {
        lessonId: '20000000-0000-4000-8000-000000000001',
        status: 'completed',
        progressPercent: 100,
        completedAt: '2026-09-05T12:00:00.000Z',
      },
    ]);

    const response = await request(
      createApp({
        enableLogger: false,
        authenticateHandler: authenticate,
        learningModel: modelWith({ listProgress }),
      }),
    ).get('/api/v1/learning/progress');

    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(1);
    expect(listProgress).toHaveBeenCalledWith({}, userId);
  });

  it('upserts lesson progress', async () => {
    const upsertProgress = vi.fn().mockResolvedValue({
      lessonId: '20000000-0000-4000-8000-000000000001',
      status: 'in_progress',
      progressPercent: 50,
      completedAt: null,
    });

    const response = await request(
      createApp({
        enableLogger: false,
        authenticateHandler: authenticate,
        learningModel: modelWith({ upsertProgress }),
      }),
    )
      .put('/api/v1/learning/lessons/20000000-0000-4000-8000-000000000001/progress')
      .send({ status: 'in_progress', progressPercent: 50 });

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual({
      lessonId: '20000000-0000-4000-8000-000000000001',
      status: 'in_progress',
      progressPercent: 50,
      completedAt: null,
    });
    expect(upsertProgress).toHaveBeenCalledWith({}, userId, {
      lessonId: '20000000-0000-4000-8000-000000000001',
      status: 'in_progress',
      progressPercent: 50,
    });
  });

  it('rejects completed progress that is not 100%', async () => {
    const response = await request(
      createApp({
        enableLogger: false,
        authenticateHandler: authenticate,
        learningModel: modelWith(),
      }),
    )
      .put('/api/v1/learning/lessons/20000000-0000-4000-8000-000000000001/progress')
      .send({ status: 'completed', progressPercent: 40 });

    expect(response.status).toBe(400);
  });
});
