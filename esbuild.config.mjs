import esbuild from "esbuild";
import builtins from "builtin-modules";

const args = process.argv.slice(2);
const production = args.includes("production");
const watch = args.includes("--watch");

const context = await esbuild.context({
  entryPoints: ["src/main.ts"],
  bundle: true,
  external: ["obsidian", ...builtins],
  format: "cjs",
  target: "es2020",
  outfile: "main.js",
  logLevel: "info",
  sourcemap: !production
});

if (watch) {
  await context.watch();
  console.log("Watching...");
} else {
  await context.rebuild();
  await context.dispose();
}
