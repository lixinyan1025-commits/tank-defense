import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const outputDirectory = resolve('dist');
const entryPath = resolve(outputDirectory, 'index.html');
let html = await readFile(entryPath, 'utf8');

const scriptMatch = html.match(/<script\b[^>]*\bsrc="([^"]+)"[^>]*><\/script>/i);
const styleMatch = html.match(/<link\b[^>]*\brel="stylesheet"[^>]*\bhref="([^"]+)"[^>]*>/i);

if (!scriptMatch || !styleMatch) {
  throw new Error('Built JavaScript or stylesheet reference was not found in dist/index.html.');
}

const toBuiltPath = (url) => resolve(outputDirectory, url.replace(/^\/tank-defense\//, '').replace(/^\.\//, ''));
const [javascript, stylesheet, favicon] = await Promise.all([
  readFile(toBuiltPath(scriptMatch[1]), 'utf8'),
  readFile(toBuiltPath(styleMatch[1]), 'utf8'),
  readFile(resolve(outputDirectory, 'favicon.svg'), 'utf8'),
]);

const faviconData = `data:image/svg+xml;base64,${Buffer.from(favicon).toString('base64')}`;
const inlineStyle = `<style>\n${stylesheet}\n</style>`;
const inlineScript = `<script type="module">\n${javascript.replace(/<\/script/gi, '<\\/script')}\n</script>`;
html = html
  .replace(/<link\b[^>]*\brel="icon"[^>]*>/i, `<link rel="icon" href="${faviconData}" type="image/svg+xml" />`)
  .replace(styleMatch[0], () => inlineStyle)
  .replace(scriptMatch[0], () => inlineScript)
  .replace('《坦克防线》——守护浪尖核心的像素复古网页坦克游戏。', '《坦克防线》单文件 HTML 版——守护浪尖核心的像素复古网页坦克游戏。');

const standalonePath = resolve(outputDirectory, 'tank-defense.html');
await writeFile(standalonePath, html, 'utf8');
console.log(`Standalone HTML created: ${standalonePath}`);
