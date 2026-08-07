import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Response } from 'express';
import { Prisma } from '@fabriq/database';
import type { ApiError } from '@fabriq/shared';

/**
 * Global exception filter producing the standard error envelope:
 *   { success: false, error: { code, message, details? } }
 * Maps Prisma known errors to friendly HTTP semantics.
 */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<Response>();
    const status = this.resolveStatus(exception);
    const error = this.resolveError(exception, status);

    if (status >= 500) {
      this.logger.error(
        `${error.code}: ${error.message}`,
        exception instanceof Error ? exception.stack : undefined,
      );
    }

    res.status(status).json({ success: false, data: null, error });
  }

  private resolveStatus(exception: unknown): number {
    if (exception instanceof HttpException) return exception.getStatus();
    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      switch (exception.code) {
        case 'P2002':
          return HttpStatus.CONFLICT;
        case 'P2025':
          return HttpStatus.NOT_FOUND;
        default:
          return HttpStatus.BAD_REQUEST;
      }
    }
    return HttpStatus.INTERNAL_SERVER_ERROR;
  }

  private resolveError(exception: unknown, status: number): ApiError {
    if (exception instanceof HttpException) {
      const body = exception.getResponse();
      if (typeof body === 'string') {
        return { code: exception.name, message: body };
      }
      const b = body as { message?: string | string[]; error?: string };
      return {
        code: b.error ?? exception.name,
        message: Array.isArray(b.message) ? b.message.join('; ') : (b.message ?? exception.message),
      };
    }
    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      if (exception.code === 'P2002') {
        return { code: 'UNIQUE_CONSTRAINT', message: 'A record with the same unique value already exists.' };
      }
      if (exception.code === 'P2025') {
        return { code: 'NOT_FOUND', message: 'The requested record does not exist.' };
      }
      return { code: 'DATABASE_ERROR', message: exception.message };
    }
    if (exception instanceof Error) {
      return { code: 'INTERNAL_ERROR', message: exception.message };
    }
    return { code: 'INTERNAL_ERROR', message: 'Unexpected server error' };
  }
}
