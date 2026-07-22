import { access, readFile } from "node:fs/promises";
import { resolve } from "node:path";

const projectRoot = resolve(import.meta.dirname, "..");
const requiredFiles = [
  "public/index.html",
  "public/styles.css",
  "public/app.js",
  "public/_headers",
  "public/_redirects",
  "docs/CLOUDFLARE_PAGES_SETUP.md",
  "docs/PRODUCT_RESET.md"
];

for (const relativePath of requiredFiles) {
  await access(resolve(projectRoot, relativePath));
}

const inspectedFiles = [
  "public/index.html",
  "public/styles.css",
  "public/app.js",
  "package.json"
];

const forbiddenPatterns = [
  /firebase/i,
  /gstatic\.com\/firebasejs/i,
  /FIREBASE_TOKEN/i
];

for (const relativePath of inspectedFiles) {
  const content = await readFile(resolve(projectRoot, relativePath), "utf8");
  for (const pattern of forbiddenPatterns) {
    if (pattern.test(content)) {
      throw new Error(`${relativePath} still contains legacy hosting/runtime code matching ${pattern}`);
    }
  }
}

const html = await readFile(resolve(projectRoot, "public/index.html"), "utf8");
if (!html.includes('<meta name="viewport"')) {
  throw new Error("public/index.html is missing a viewport meta tag");
}
if (!html.includes('<script src="/app.js" defer></script>')) {
  throw new Error("public/index.html must load the external app script with defer");
}

console.log("Cloudflare foundation validation passed.");
