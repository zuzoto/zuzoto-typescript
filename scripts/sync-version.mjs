#!/usr/bin/env node

import { readFileSync, writeFileSync } from "fs";

const pkg = JSON.parse(readFileSync("package.json", "utf-8"));
const content = `export const VERSION = "${pkg.version}";\n`;
writeFileSync("src/version.ts", content);
console.log(`synced version.ts → ${pkg.version}`);
