#!/usr/bin/env node
/** 真配置→真素材→宿主广播决策→真实petLinkSay，不能只验证复制了PNG。 */
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { provisionAssets } from '../packages/pet-link/lib/provision.js';
const root = fileURLToPath(new URL('../', import.meta.url));
const host = fs.readFileSync(path.join(root, 'packages/pet/lib/index.js'), 'utf8');
const region = name => {
  const begin = host.indexOf('//#region src/host/' + name + '.ts');
  const end = host.indexOf('//#endregion', begin);
  assert.ok(begin >= 0 && end > begin, '必须执行真实宿主模块：' + name);
  return host.slice(begin, end);
};
const env = { existsSync: fs.existsSync, readFileSync: fs.readFileSync, readdirSync: fs.readdirSync,
  renameSync: fs.renameSync, mkdirSync: fs.mkdirSync, writeFileSync: fs.writeFileSync, join: path.join, dirname: path.dirname };
const { readAllConfig, decideBroadcast } = new Function(...Object.keys(env),
  region('memes') + '\n' + region('config') + '\n' + region('broadcast') + '\nreturn {readAllConfig,decideBroadcast};')(...Object.values(env));
const dir = fs.mkdtempSync(path.join(tmpdir(), 'we-pet-meme-broadcast-'));
assert.equal(path.dirname(dir), path.resolve(tmpdir()), '清理目标必须是本测试创建的临时目录');
const paths = { defaultFile: path.join(root, 'packages/pet/assets/config.jsonc'), userFile: path.join(dir, 'main-config.jsonc'),
  petDir: path.join(dir, 'pet'), extDir: path.join(dir, 'animation-ext') };
try {
  provisionAssets(dir);
  const cfg = readAllConfig(paths);
  const petId = cfg.main.pets[0].id;
  const memeDirs = () => [path.join(dir, 'memes'), path.join(root, 'packages/pet/assets/memes')];
  const tuner = fs.readFileSync(path.join(root, 'packages/pet-link/src/pet-link-tuner.js'), 'utf8');
  const pet = fs.readFileSync(path.join(root, 'packages/pet-link/src/pet-link.js'), 'utf8');
  const calls = [];
  const mod = new Function('weT', 'location', 'apiFetch', tuner + '\n' + pet + '\nreturn {say:petLinkSay,images:PET_BUBBLE_SPECS.map(s=>s.image)};')(
    text => text, { origin: 'http://fixture.invalid' }, async (_url, init) => {
      const body = JSON.parse(init.body); calls.push(body);
      return { ok: true, data: decideBroadcast({ cfg, requested: petId, text: body.text, image: body.image, memeDirs }) };
    });
  assert.equal(new Set(mod.images).size, 5);
  for (const image of mod.images) {
    assert.ok(fs.existsSync(path.join(dir, 'memes', image + '.png')), '资源实际存在：' + image);
    const decision = decideBroadcast({ cfg, requested: petId, text: '联动测试', image, memeDirs });
    assert.deepEqual(decision, { ok: true, petId, text: '联动测试', image }, '联动图必须已登记并被宿主接受：' + image);
    calls.length = 0;
    assert.equal(await mod.say('联动测试', image), true);
    assert.deepEqual(calls, [{ text: '联动测试', image }], '带图成功后不能补纯文字覆盖图片：' + image);
  }
  calls.length = 0;
  assert.equal(await mod.say('仍须送达', '池外图'), true);
  assert.deepEqual(calls, [{ text: '仍须送达', image: '池外图' }, { text: '仍须送达' }], '未知图仍降级，不放宽宿主校验');
  const custom = '{\n  // 用户配置不能被联动修复覆盖\n  "memes": {"我自己的图":"自定义"}, "customFlag": 42\n}\n';
  fs.writeFileSync(paths.userFile, custom);
  const overridden = readAllConfig(paths);
  assert.deepEqual(overridden.main.memes, { 我自己的图: '自定义' }, '仍尊重显式覆盖的用户表情包池');
  assert.equal(fs.readFileSync(paths.userFile, 'utf8'), custom);
  console.log('PASS 五张联动表情包经真实配置与素材池接收，只发送一次带图气泡；未知图降级且不覆盖用户配置');
} finally {
  assert.ok(path.basename(dir).startsWith('we-pet-meme-broadcast-'));
  fs.rmSync(dir, { recursive: true, force: true });
}
