/** Design tokens from section 4 of the brief. */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: '#0a1a3f',
        card: '#122b5e',
        ink: '#e8f0ff',
        muted: '#9db3dc',
        primary: '#5ec2ff',
        accent: '#2dd4bf',
        line: '#24407a',
        success: '#22c55e',
        error: '#f87171',
      },
      borderRadius: { card: '18px', btn: '14px', input: '12px' },
      boxShadow: { soft: '0 8px 24px -8px rgba(2, 8, 30, 0.6), 0 2px 6px rgba(2, 8, 30, 0.35)' },
      fontFamily: { sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'] },
      maxWidth: { app: '480px' },
    },
  },
};
