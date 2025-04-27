import { ZodError, ZodIssue } from 'zod';
import { AppError, ValidationError } from '../utils/errors/app-error';

interface ZodValidationError {
  field: string;
  message: string;
  code: string;
  details?: unknown;
}

const getErrorDetails = (issue: ZodIssue): unknown => {
  switch (issue.code) {
    case 'invalid_type':
      return {
        expected: issue.expected,
        received: issue.received
      };
    case 'invalid_string':
      return {
        validation: issue.validation
      };
    case 'too_small':
      return {
        minimum: issue.minimum,
        type: issue.type,
        inclusive: issue.inclusive
      };
    case 'too_big':
      return {
        maximum: issue.maximum,
        type: issue.type,
        inclusive: issue.inclusive
      };
    default:
      return undefined;
  }
};

export const formatZodError = (error: ZodError): ZodValidationError[] => {
  return error.errors.map(issue => ({
    field: issue.path.join('.') || 'unknown',
    message: issue.message,
    code: issue.code,
    details: getErrorDetails(issue)
  }));
};

export const handleZodError = (error: ZodError): AppError => {
  const formattedErrors = formatZodError(error);
  const errorMessage = formattedErrors.map(err => 
    `${err.field}: ${err.message}`
  ).join(', ');

  return new ValidationError(
    errorMessage,
    { validationErrors: formattedErrors }
  );
}; 