/**
 * Password validation for admin accounts.
 * Enforces strong password requirements.
 */

const MIN_LENGTH = 12;

interface PasswordValidation {
  valid: boolean;
  errors: string[];
}

/**
 * Validate password strength.
 * Requirements: 12+ chars, uppercase, lowercase, number, special character.
 */
export function validatePassword(password: string): PasswordValidation {
  const errors: string[] = [];

  if (password.length < MIN_LENGTH) {
    errors.push(`Must be at least ${MIN_LENGTH} characters`);
  }
  if (!/[A-Z]/.test(password)) {
    errors.push('Must contain at least one uppercase letter');
  }
  if (!/[a-z]/.test(password)) {
    errors.push('Must contain at least one lowercase letter');
  }
  if (!/[0-9]/.test(password)) {
    errors.push('Must contain at least one number');
  }
  if (!/[^A-Za-z0-9]/.test(password)) {
    errors.push('Must contain at least one special character');
  }

  return { valid: errors.length === 0, errors };
}
