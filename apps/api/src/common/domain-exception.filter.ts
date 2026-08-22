import { Catch, HttpException, type ArgumentsHost, type ExceptionFilter } from '@nestjs/common';
import type { Response } from 'express';
import { DomainError, InvalidCredentialsError } from './domain-errors.js';

/** Translate typed domain errors into HTTP responses; re-throw framework HttpExceptions untouched. */
@Catch()
export class DomainExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();

    if (exception instanceof InvalidCredentialsError) {
      response.status(401).json({ statusCode: 401, message: 'Invalid credentials' });
      return;
    }
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      response.status(status).json(exception.getResponse());
      return;
    }
    if (exception instanceof DomainError) {
      response.status(400).json({ statusCode: 400, message: exception.message });
      return;
    }
    // Unknown/unexpected: do not leak internals.
    response.status(500).json({ statusCode: 500, message: 'Internal server error' });
  }
}
