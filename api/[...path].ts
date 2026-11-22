import type { Request, Response } from 'express';
import { createApp } from '../server.ts';

/**
 * Single serverless entry for every `/api/*` route.
 *
 * The Express app is built once per cold start and reused across invocations. Vercel's
 * runtime passes the original request path through, so the routes registered in
 * `server.ts` (`/api/health`, `/api/audit`, …) match unchanged.
 */
let appPromise: ReturnType<typeof createApp> | null = null;

export default async function handler(req: Request, res: Response): Promise<void> {
  appPromise ??= createApp();
  const app = await appPromise;
  app(req, res);
}
