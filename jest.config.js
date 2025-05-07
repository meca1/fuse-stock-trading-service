module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/__tests__/**/*.ts', '**/?(*.)+(spec|test).ts'],
  transform: {
    '^.+\\.ts$': 'ts-jest',
  },
  collectCoverageFrom: ['**/*.ts', '!**/node_modules/**', '!**/dist/**', '!**/coverage/**'],
  coverageDirectory: './coverage',
  moduleFileExtensions: ['ts', 'js', 'json', 'node'],
  moduleNameMapper: {
    '^@middy/core$': '<rootDir>/node_modules/@middy/core',
    '^@middy/http-error-handler$': '<rootDir>/node_modules/@middy/http-error-handler'
  }
};
