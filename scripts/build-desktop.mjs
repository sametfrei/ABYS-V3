import { copyFile, cp, mkdir, rename, rm } from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const runtimeRoot = path.resolve(root, "desktop", "runtime");
const target = path.resolve(runtimeRoot, "app-server");

if (!target.startsWith(`${runtimeRoot}${path.sep}`)) {
  throw new Error(`Unsafe desktop runtime target: ${target}`);
}

function run(command, args, env = process.env) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: root,
      env,
      stdio: "inherit",
      windowsHide: true,
    });
    child.once("error", reject);
    child.once("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} exited with code ${code}`));
    });
  });
}

await run(
  process.execPath,
  [path.join(root, "node_modules", "next", "dist", "bin", "next"), "build"],
  {
  ...process.env,
  BUILD_STANDALONE: "1",
  }
);

await rm(target, { recursive: true, force: true });
await mkdir(target, { recursive: true });
await cp(path.join(root, ".next", "standalone"), target, {
  recursive: true,
  dereference: true,
});
await mkdir(path.join(target, ".next"), { recursive: true });
await cp(path.join(root, ".next", "static"), path.join(target, ".next", "static"), {
  recursive: true,
});
await cp(path.join(root, "public"), path.join(target, "public"), { recursive: true });
await rename(
  path.join(target, "node_modules"),
  path.join(target, "runtime-modules")
);
await Promise.all(
  [".env", ".env.local"].map((name) =>
    rm(path.join(target, name), { force: true })
  )
);
const bundledNodeDirectory = path.join(runtimeRoot, "node");
await mkdir(bundledNodeDirectory, { recursive: true });
await copyFile(process.execPath, path.join(bundledNodeDirectory, "node.exe"));

console.log(`Desktop runtime staged at ${target}`);
