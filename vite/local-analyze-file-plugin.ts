/**
 * En `npm run dev` (Vite seul), le proxy vers :8888 échoue si Netlify Dev n’est pas lancé.
 * On exécute la même handler que netlify/functions/analyzeFile.js dans le process Node de Vite.
 */
import type { Plugin } from "vite";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

export function localAnalyzeFilePlugin(): Plugin {
  return {
    name: "local-netlify-analyzeFile",
    enforce: "pre",
    configureServer(server) {
      const root = path.resolve(__dirname, "..");
      const handlerPath = path.join(root, "netlify/functions/analyzeFile.js");

      // URL dédiée : évite le proxy `/.netlify/functions` → :8888 (ECONNREFUSED si Vite seul).
      const localPath = "/__vite-local/analyzeFile";

      server.middlewares.use(async (req, res, next) => {
        const pathname = req.url?.split("?")[0] ?? "";
        if (pathname !== localPath) {
          return next();
        }

        if (req.method === "OPTIONS") {
          res.statusCode = 204;
          res.setHeader("Access-Control-Allow-Origin", "*");
          res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
          res.setHeader("Access-Control-Allow-Headers", "Content-Type");
          res.end();
          return;
        }

        if (req.method !== "POST") {
          return next();
        }

        const chunks: Buffer[] = [];
        try {
          await new Promise<void>((resolve, reject) => {
            req.on("data", (c: Buffer) => chunks.push(c));
            req.on("end", () => resolve());
            req.on("error", reject);
          });

          const rawBody = Buffer.concat(chunks);
          const { handler } = require(handlerPath) as {
            handler: (event: {
              httpMethod: string;
              headers: Record<string, string>;
              body: string;
              isBase64Encoded: boolean;
            }) => Promise<{ statusCode: number; headers?: Record<string, string>; body: string }>;
          };

          const headers: Record<string, string> = {};
          for (const [k, v] of Object.entries(req.headers)) {
            if (v === undefined) continue;
            headers[k] = Array.isArray(v) ? v.join(",") : v;
          }

          const result = await handler({
            httpMethod: "POST",
            headers,
            body: rawBody.toString("base64"),
            isBase64Encoded: true,
          });

          res.statusCode = result.statusCode ?? 500;
          if (result.headers) {
            Object.entries(result.headers).forEach(([k, v]) => {
              if (v != null) res.setHeader(k, String(v));
            });
          }
          res.end(result.body ?? "");
        } catch (e) {
          console.error("[vite] local analyzeFile:", e);
          res.statusCode = 500;
          res.setHeader("Content-Type", "application/json");
          res.setHeader("Access-Control-Allow-Origin", "*");
          res.end(
            JSON.stringify({
              error: "Failed to analyze file",
              message: e instanceof Error ? e.message : String(e),
            })
          );
        }
      });
    },
  };
}
