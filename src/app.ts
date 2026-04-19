import express, { type Request, type Response } from "express";
import pinoHttp from "pino-http";
import { logger } from "./shared/logger/logger.js";
import { toLoggableErrorFields } from "./shared/logger/loggable-error.js";
import { buildCodeReviewRouter } from "./modules/codeReview/interfaces/http/code-review-router.js";

export function buildApp() {
  const app = express();

  app.use(
    express.json({
      verify: (request: Request & { rawBody?: Buffer }, _response, buffer) => {
        request.rawBody = buffer;
      }
    })
  );
  app.use(pinoHttp({ logger }));

  app.get("/health", (_request: Request, response: Response) => {
    response.status(200).json({ status: "ok" });
  });

  app.use(buildCodeReviewRouter());

  app.use((error: unknown, _request: Request, response: Response, _next: unknown) => {
    logger.error(toLoggableErrorFields(error), "unhandled request error");
    response.status(500).json({ message: "internal server error" });
  });

  return app;
}
