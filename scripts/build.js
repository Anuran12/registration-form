const { copyFileSync, cpSync, mkdirSync } = require('node:fs');
const { join, resolve } = require('node:path');

const projectRoot = resolve(__dirname, '..');
const outputDirectory = join(projectRoot, 'public');
const htmlFiles = [
  'index.html',
  'registration-completed.html',
  'submission.html',
  'thank-you.html',
];
const assetDirectories = ['assets', 'src'];

mkdirSync(outputDirectory, { recursive: true });

for (const filename of htmlFiles) {
  copyFileSync(join(projectRoot, filename), join(outputDirectory, filename));
}

for (const directory of assetDirectories) {
  cpSync(join(projectRoot, directory), join(outputDirectory, directory), {
    recursive: true,
    force: true,
  });
}

console.log('Static site built in public/');
