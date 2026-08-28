module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/server/tests/**/*.test.js'],
  collectCoverageFrom: [
    'server/**/*.js',
    '!server/database/**',
    '!server/node_modules/**'
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html']
};
