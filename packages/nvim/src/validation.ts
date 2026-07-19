export class ValidationError extends TypeError {
  constructor(
    readonly field: string,
    message: string,
  ) {
    super(message);
    this.name = "ValidationError";
  }
}

export function assertNotEmpty(field: string, value: string): void {
  if (value.trim().length === 0) {
    throw new ValidationError(field, `${field} must not be empty`);
  }
}
