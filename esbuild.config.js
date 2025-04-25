module.exports = {
  bundle: true,
  minify: false,
  sourcemap: false,
  external: ['aws-sdk'],
  target: 'node18',
  platform: 'node',
  format: 'cjs',
  
  esbuildConfig: (defaultConfig) => {
    return {
      ...defaultConfig,
    };
  }
};
