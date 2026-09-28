// The one ApiError envelope (D-0037 §4, D-0053 §5). `requestId` is `req_<uuid>` and is also sent
// as the `x-request-id` header on every response, success or error (D-0053 §5).
import type { ApiErrorCode } from "@workoutlab/shared";

export function newRequestId(): string {
  return `req_${crypto.randomUUID()}`;
}

export class ApiErrorResponse extends Error {
  readonly status: number;
  readonly code: ApiErrorCode;

  constructor(status: number, code: ApiErrorCode, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function badRequest(message: string): ApiErrorResponse {
  return new ApiErrorResponse(400, "invalid_request", message);
}

export function unauthorized(message = "Missing or invalid access token"): ApiErrorResponse {
  return new ApiErrorResponse(401, "unauthorized", message);
}

export function notFound(message: string): ApiErrorResponse {
  return new ApiErrorResponse(404, "not_found", message);
}

export function profileMissing(message = "Finish onboarding first"): ApiErrorResponse {
  return new ApiErrorResponse(422, "profile_missing", message);
}

export function internalError(): ApiErrorResponse {
  return new ApiErrorResponse(500, "internal", "Something went wrong");
}

/** Builds the JSON body of an ApiError (D-0037 §4). */
export function errorBody(err: ApiErrorResponse, requestId: string): unknown {
  return { error: { code: err.code, message: err.message, requestId } };
}
