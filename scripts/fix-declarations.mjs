// tsc rewrites relative .ts imports to .js in emitted JavaScript but not in declaration files.
import fs from "node:fs";

for (const file of fs.readdirSync("dist", { recursive: true, encoding: "utf8" })) {
  if (!file.endsWith(".d.ts")) continue;
  const path = `dist/${file}`;
  fs.writeFileSync(path, fs.readFileSync(path, "utf8").replace(/(from "\.{1,2}\/[^"]+)\.ts"/g, '$1.js"'));
}
