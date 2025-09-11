import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#f4f7ff',
          100: '#e8efff',
          200: '#c9d9ff',
          300: '#a8c1ff',
          400: '#6f98ff',
          500: '#3a6dff',
          600: '#2453db',
          700: '#1b41ad',
          800: '#183a8b',
          900: '#142f6e',
        },
      },
      boxShadow: {
        soft: '0 10px 40px rgba(0,0,0,0.08)',
      },
      borderRadius: {
        xl2: '1.25rem',
      },
    },
  },
  plugins: [],
}
export default config