import { apiErrorSchema, type ApiErrorBody } from '@auth-app/shared';

/** An HTTP error from the API, or a network failure (status 0). */
export class ApiError extends Error {
  readonly status: number;
  readonly messages: string[];
  readonly body?: ApiErrorBody;

  constructor(status: number, messages: string[], body?: ApiErrorBody) {
    super(messages[0] ?? `Request failed with status ${status}`);
    this.name = 'ApiError';
    this.status = status;
    this.messages = messages;
    this.body = body;
  }

  static async fromResponse(response: Response): Promise<ApiError> {
    const parsed = apiErrorSchema.safeParse(await response.json().catch(() => null));
    if (!parsed.success) return new ApiError(response.status, []);
    const { message } = parsed.data;
    return new ApiError(response.status, Array.isArray(message) ? message : [message], parsed.data);
  }

  static network(cause: unknown): ApiError {
    const error = new ApiError(0, [
      'Cannot reach the server. Check your connection and try again.',
    ]);
    error.cause = cause;
    return error;
  }
}
