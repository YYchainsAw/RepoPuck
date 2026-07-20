import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return;
          if (id.includes("@primer/octicons")) return "primer-icons";
          if (id.includes("@primer/react")) return "primer-react";
          if (/[\\/]react(?:-dom)?[\\/]|[\\/]scheduler[\\/]/.test(id)) {
            return "react-vendor";
          }
          if (id.includes("@tauri-apps")) return "tauri-vendor";
          return "vendor";
        },
      },
    },
  },
  optimizeDeps: {
    include: ["react", "react-dom/client"],
  },
  server: {
    host: "0.0.0.0",
    allowedHosts: ["terminal.local"],
    warmup: {
      clientFiles: ["./src/main.tsx"],
    },
  },
  test: {
    environment: "node",
    css: true,
    setupFiles: ["./src/test/setup.ts"],
    server: {
      deps: {
        inline: ["@primer/react"],
      },
    },
  },
});
