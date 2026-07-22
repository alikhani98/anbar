import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: [
          "Vazirmatn",
          "IRANSans",
          "Tahoma",
          "Arial",
          "sans-serif"
        ],
      },
    },
  },
  plugins: [],
} satisfies Config;
