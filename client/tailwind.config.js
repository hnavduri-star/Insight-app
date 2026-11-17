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
      boxShadow: {
        soft: '0 10px 30px -12px rgba(2, 8, 30, 0.75), 0 2px 6px rgba(2, 8, 30, 0.35)',
        matte: 'inset 0 1px 0 rgba(232, 240, 255, 0.05), 0 12px 32px -14px rgba(2, 8, 30, 0.8), 0 2px 4px rgba(2, 8, 30, 0.3)',
      },
      fontFamily: {
        // Inter for reading and UI; Fraunces (a warm serif) for headings and the coach's voice.
        sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
        display: ['Fraunces', 'Georgia', 'serif'],
      },
      maxWidth: { app: '480px' },
    },
  },
};
