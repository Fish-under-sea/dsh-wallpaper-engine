/** 在隔离用户目录运行真实内置 pet 入口；仅替换离线测试不可用的宿主 peer。 */
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const ENTRY = join(ROOT, 'packages/pet/lib/index.js');
const dataModule = (code) => 'data:text/javascript;base64,' + Buffer.from(code).toString('base64');

export async function createPetHostFixture(source = readFileSync(ENTRY, 'utf8')) {
  const home = mkdtempSync(join(tmpdir(), 'we-pet-host-'));
  const blocked = [];
  const reject = '(...args) => { throw new Error("unexpected external pet service: " + JSON.stringify(args)); }';
  const peers = new Map([
    ['@deepseek-ai/dsh-home-paths', 'export const resolveDshHome = () => ' + JSON.stringify(home) + ';'],
    ['@deepseek-ai/dsh-credentials', 'export const credentialRef = ' + reject + ';'],
    ['@deepseek-ai/dsh-llm', 'export class BlockAssembler { constructor() { throw new Error("unexpected LLM call"); } }\n'
      + ['ReasoningEffortId', 'createAssistantMessage', 'createUserMessage'].map((name) => 'export const ' + name + ' = ' + reject + ';').join('\n')],
    ['@electron/get', 'export const downloadArtifact = ' + reject + ';'],
  ]);
  const code = source.replace(/from\s+(["'])(@[^"']+)\1/g, (match, quote, name) => {
    assert.ok(peers.has(name), '未登记的内置 pet 外部依赖：' + name);
    blocked.push(name);
    return 'from ' + JSON.stringify(dataModule(peers.get(name)));
  }).replace(/import\.meta\.url/g, JSON.stringify(pathToFileURL(ENTRY).href));
  assert.equal(blocked.length, peers.size, '真实入口的 peer 替换必须完整且没有重复');
  // 使用入口自身的 JSONC 解析器；只关闭测试不覆盖的桌面/网络功能。
  const mod = await import(dataModule(code + '\nexport { readJsonc };'));
  const config = mod.readJsonc(join(dirname(ENTRY), '../assets/config.jsonc'));
  config.pets = config.pets.map((pet) => ({ ...pet, display: 'web', balanceEnabled: false, whisperEnabled: false }));
  const userRoot = join(home, 'dsh-we-pet-builtin');
  mkdirSync(userRoot, { recursive: true });
  writeFileSync(join(userRoot, 'main-config.jsonc'), JSON.stringify(config));
  return { home, apply: mod.apply, dispose: () => rmSync(home, { recursive: true, force: true }) };
}
