import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  // Match the SDK's ES2022 output instead of Vite 6's older browser target.
  build: { target: "es2022" },
  server: { port: 5173 },
});
