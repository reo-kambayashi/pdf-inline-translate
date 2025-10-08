import { context, build } from "esbuild";
import { copyFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const projectRoot = __dirname;
const distDir = join(projectRoot, "dist");
const watchMode = process.argv.includes("--watch");

mkdirSync(distDir, { recursive: true });

const buildOptions = {
  entryPoints: ["src/main.ts"],
  bundle: true,
  format: "cjs",
  platform: "browser",
  target: ["es2020"],
  sourcemap: true,
  outfile: join(distDir, "main.js"),
  external: ["obsidian"],
  logLevel: "info",
  plugins: [
    {
      name: "copy-to-root",
      setup(buildCtx) {
        buildCtx.onEnd((result) => {
          if (result.errors.length > 0) {
            return;
          }
          try {
            copyFileSync(join(distDir, "main.js"), join(projectRoot, "main.js"));
          } catch (error) {
            console.error("main.js のコピーに失敗しました:", error);
          }
          try {
            copyFileSync(
              join(distDir, "main.js.map"),
              join(projectRoot, "main.js.map")
            );
          } catch (error) {
            // sourcemap が無いケースは警告のみにする
            console.warn("ソースマップのコピーに失敗しました:", error);
          }
        });
      }
    }
  ]
};

if (watchMode) {
  const run = async () => {
    const ctx = await context(buildOptions);
    await ctx.watch();
    console.log("ウォッチモードでビルドを開始しました。");
  };
  run().catch((error) => {
    console.error(error);
    process.exit(1);
  });
} else {
  build(buildOptions).catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
