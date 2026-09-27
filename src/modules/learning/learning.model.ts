import type { SupabaseClient } from '@supabase/supabase-js';

import { AppError } from '../../shared/errors/app-error.js';

export interface LearningTrack {
  id: string;
  slug: string;
  title: string;
  description: string;
  sortOrder: number;
}

export interface Lesson {
  id: string;
  trackId: string;
  slug: string;
  title: string;
  content: string;
  sortOrder: number;
}

export type LearningProgressStatus = 'not_started' | 'in_progress' | 'completed';

export interface LessonProgress {
  lessonId: string;
  status: LearningProgressStatus;
  progressPercent: number;
  completedAt: string | null;
}

export interface UpsertLessonProgressInput {
  lessonId: string;
  status: LearningProgressStatus;
  progressPercent: number;
}

export interface LearningModelPort {
  listTracks(client: SupabaseClient): Promise<LearningTrack[]>;
  listLessons(client: SupabaseClient, trackId: string): Promise<Lesson[]>;
  listProgress(client: SupabaseClient, userId: string): Promise<LessonProgress[]>;
  upsertProgress(
    client: SupabaseClient,
    userId: string,
    input: UpsertLessonProgressInput,
  ): Promise<LessonProgress>;
}

interface LearningTrackRow {
  id: string;
  slug: string;
  title: string;
  description: string;
  sort_order: number;
}

interface LessonRow {
  id: string;
  track_id: string;
  slug: string;
  title: string;
  content: string;
  sort_order: number;
}

interface LessonProgressRow {
  lesson_id: string;
  status: LearningProgressStatus;
  progress_percent: number;
  completed_at: string | null;
}

export class SupabaseLearningModel implements LearningModelPort {
  async listTracks(client: SupabaseClient): Promise<LearningTrack[]> {
    const { data, error } = await client
      .from('learning_tracks')
      .select('id, slug, title, description, sort_order')
      .eq('published', true)
      .order('sort_order', { ascending: true });
    if (error) throw providerError('Learning tracks could not be loaded');

    return ((data ?? []) as LearningTrackRow[]).map(mapTrack);
  }

  async listLessons(client: SupabaseClient, trackId: string): Promise<Lesson[]> {
    const { data, error } = await client
      .from('lessons')
      .select('id, track_id, slug, title, content, sort_order')
      .eq('track_id', trackId)
      .eq('published', true)
      .order('sort_order', { ascending: true });
    if (error) throw providerError('Lessons could not be loaded');

    return ((data ?? []) as LessonRow[]).map(mapLesson);
  }

  async listProgress(client: SupabaseClient, userId: string): Promise<LessonProgress[]> {
    const { data, error } = await client
      .from('user_learning_progress')
      .select('lesson_id, status, progress_percent, completed_at')
      .eq('user_id', userId);
    if (error) throw providerError('Learning progress could not be loaded');

    return ((data ?? []) as LessonProgressRow[]).map(mapProgress);
  }

  async upsertProgress(
    client: SupabaseClient,
    userId: string,
    input: UpsertLessonProgressInput,
  ): Promise<LessonProgress> {
    const completedAt = input.status === 'completed' ? new Date().toISOString() : null;
    const { data, error } = await client
      .from('user_learning_progress')
      .upsert(
        {
          user_id: userId,
          lesson_id: input.lessonId,
          status: input.status,
          progress_percent: input.progressPercent,
          completed_at: completedAt,
        },
        { onConflict: 'user_id,lesson_id' },
      )
      .select('lesson_id, status, progress_percent, completed_at')
      .single();
    if (error || !data) throw providerError('Learning progress could not be saved');

    return mapProgress(data);
  }
}

function mapTrack(row: LearningTrackRow): LearningTrack {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    description: row.description,
    sortOrder: row.sort_order,
  };
}

function mapLesson(row: LessonRow): Lesson {
  return {
    id: row.id,
    trackId: row.track_id,
    slug: row.slug,
    title: row.title,
    content: row.content,
    sortOrder: row.sort_order,
  };
}

function mapProgress(row: LessonProgressRow): LessonProgress {
  return {
    lessonId: row.lesson_id,
    status: row.status,
    progressPercent: row.progress_percent,
    completedAt: row.completed_at,
  };
}

function providerError(message: string): AppError {
  return new AppError(503, 'LEARNING_CONTENT_UNAVAILABLE', message);
}
