const fs = require('fs');
const path = require('path');

const src = path.join(__dirname, '..', 'node_modules', 'monaco-editor', 'min', 'vs');
const dest = path.join(__dirname, '..', 'public', 'monaco-editor', 'min', 'vs');

function copyDirSync(srcDir, destDir) {
  if (!fs.existsSync(srcDir)) {
    console.warn(`[copy-monaco] Source not found: ${srcDir} — skipping (run npm install first).`);
    return;
  }

  fs.mkdirSync(destDir, { recursive: true });

  for (const entry of fs.readdirSync(srcDir, { withFileTypes: true })) {
    const srcPath = path.join(srcDir, entry.name);
    const destPath = path.join(destDir, entry.name);

    if (entry.isDirectory()) {
      copyDirSync(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

// Only copy if destination doesn't already exist or is stale
if (!fs.existsSync(dest)) {
  console.log('[copy-monaco] Copying Monaco Editor files to public/...');
  copyDirSync(src, dest);
  console.log('[copy-monaco] Done.');
} else {
  console.log('[copy-monaco] Monaco Editor files already exist in public/. Skipping.');
}
