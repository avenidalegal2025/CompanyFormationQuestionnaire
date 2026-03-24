const fs = require('fs');
const path = require('path');
const JSZip = require('./node-zip-tool/node_modules/jszip');

async function rebuild() {
  const zipPath = path.join(__dirname, 'ss4-lambda-package.zip');
  const pyPath = path.join(__dirname, 'ss4_lambda_s3_complete.py');

  // Read existing ZIP
  const zipData = fs.readFileSync(zipPath);
  const zip = await JSZip.loadAsync(zipData);

  // Read updated Python file
  const pyContent = fs.readFileSync(pyPath, 'utf8');

  // Replace the lambda file in the ZIP
  zip.file('lambda_function.py', pyContent);

  // Generate new ZIP
  const newZip = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
  fs.writeFileSync(zipPath, newZip);

  console.log(`Rebuilt ZIP: ${zipPath} (${newZip.length} bytes)`);

  // List files in ZIP to verify
  const verify = await JSZip.loadAsync(newZip);
  console.log('Files in ZIP:');
  verify.forEach((relativePath, file) => {
    if (!file.dir) {
      console.log(`  ${relativePath}`);
    }
  });
}

rebuild().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
