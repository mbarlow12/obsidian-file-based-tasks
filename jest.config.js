module.exports = {
    preset: 'ts-jest',
    testEnvironment: 'jsdom',
    setupFilesAfterEnv: ['./src/File/setupCrypto.ts', './test/mockObsidian.ts'],
}