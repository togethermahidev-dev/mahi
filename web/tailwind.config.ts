import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        offblack: '#1A1A17',
        offwhite: '#E8E8E3',
        bgdark: '#1C1C19',
        'mahi-green': '#5DB075',
        'mahi-amber': '#D4963A',
      },
      fontFamily: {
        josefin: ['Josefin Sans', 'sans-serif'],
      },
    },
  },
  plugins: [],
};

export default config;
