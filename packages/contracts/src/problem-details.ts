import { z } from 'zod';

/**
 * RFC 9457 Problem Details — barcha API xatolarining yagona formati (TZ 7.7).
 * `code` — barqaror mashina kodi; frontend matnni shu kod bo'yicha tanlaydi.
 */
export const problemDetailsSchema = z
  .object({
    type: z.string(),
    title: z.string(),
    status: z.number().int(),
    code: z.string(),
    detail: z.string().optional(),
    instance: z.string().optional(),
    requestId: z.string().optional(),
    errors: z
      .array(
        z.object({
          path: z.string(),
          message: z.string(),
          code: z.string(),
        }),
      )
      .optional(),
  })
  .loose();

export type ProblemDetails = z.infer<typeof problemDetailsSchema>;

export const PROBLEM_JSON_CONTENT_TYPE = 'application/problem+json';
