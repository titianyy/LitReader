import { readFile, writeFile, mkdir } from "node:fs/promises";
import { execFileSync } from "node:child_process";

await mkdir("build", { recursive: true });
const tsc = process.env.TSC_PATH || "./node_modules/.bin/tsc";
execFileSync(tsc, ["src/litreader.ts", "--target", "ES2022", "--module", "ES2022", "--moduleResolution", "node", "--lib", "ES2022,DOM,DOM.Iterable", "--strict", "--skipLibCheck", "--outDir", "build"], { stdio: "inherit" });
const css = await readFile("src/styles.css", "utf8");
const featureCss = await readFile("src/features.css", "utf8");
const moduleJs = await readFile("build/litreader.js", "utf8");
// WKWebView does not reliably execute inline ES modules loaded from a local file.
// The standalone page has no imports, so removing its two export keywords makes
// the embedded code a classic script while the compiled module stays testable.
const classicJs = moduleJs.replace(/^export /gm, "");
const executableJs = `(() => {\n${classicJs}\n})();`;
const js = executableJs;
const body = await readFile("src/template.html", "utf8");
const html = body.replace("/*__STYLES__*/", `${css}\n${featureCss}`).replace("/*__APP__*/", js);
await writeFile("LitReader.html", html);
await mkdir("public", { recursive: true });
await writeFile("public/LitReader.html", html);
console.log("Built LitReader.html");
