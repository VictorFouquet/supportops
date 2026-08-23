/** Base for errors that map to a deliberate HTTP response. */
export abstract class DomainError extends Error {}

/** Login failed — org, email, or password did not match. Always a 401, never says which. */
export class InvalidCredentialsError extends DomainError {
  constructor() {
    super('Invalid credentials');
    this.name = 'InvalidCredentialsError';
  }
}

/** A requested resource does not exist in the caller's organization. Maps to 404. */
export class NotFoundError extends DomainError {
  constructor(message = 'Not found') {
    super(message);
    this.name = 'NotFoundError';
  }
}

/** A uniqueness constraint would be violated. Maps to 409. */
export class ConflictError extends DomainError {
  constructor(message = 'Conflict') {
    super(message);
    this.name = 'ConflictError';
  }
}

/** The caller is not permitted to perform this specific action on this data. Maps to 403. */
export class ForbiddenActionError extends DomainError {
  constructor(message = 'Forbidden') {
    super(message);
    this.name = 'ForbiddenActionError';
  }
}
