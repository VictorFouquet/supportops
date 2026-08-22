/** Base for errors that map to a deliberate HTTP response. */
export abstract class DomainError extends Error {}

/** Login failed — org, email, or password did not match. Always a 401, never says which. */
export class InvalidCredentialsError extends DomainError {
  constructor() {
    super('Invalid credentials');
    this.name = 'InvalidCredentialsError';
  }
}
