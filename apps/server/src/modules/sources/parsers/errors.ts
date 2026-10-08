/**
 * A file that cannot be parsed (damaged, protected, too large). The message is shown to the user as
 * the reason the import failed, so it says what is wrong and what they can do; retrying will not help.
 */
export class SourceParseError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'SourceParseError';
  }
}
