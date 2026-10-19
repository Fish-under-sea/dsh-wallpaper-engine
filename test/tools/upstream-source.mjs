/** 固定上游来源归档的准备与校验；不安装、不解压或执行上游代码。 */
import { createHash, randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

function validate(spec, bytes) {
  if (bytes.length !== spec.bytes) throw new Error('upstream source bytes mismatch');
  if (createHash('sha256').update(bytes).digest('hex') !== spec.sha256) throw new Error('upstream source sha256 mismatch');
}

export async function ensureUpstreamSource(spec, { root, fetchImpl = globalThis.fetch }) {
  const target = join(root, spec.tgz);
  let cached;
  try { cached = readFileSync(target); }
  catch (e) { if (e.code !== 'ENOENT') throw e; }
  if (cached !== undefined) { validate(spec, cached); return target; }

  const url = 'https://registry.npmjs.org/' + spec.package + '/-/' + spec.package + '-' + spec.version + '.tgz';
  const response = await fetchImpl(url, { signal: AbortSignal.timeout(120000) });
  if (!response.ok) throw new Error('upstream source HTTP ' + response.status);
  const bytes = Buffer.from(await response.arrayBuffer());
  validate(spec, bytes);
  mkdirSync(dirname(target), { recursive: true });
  const temp = target + '.' + randomUUID() + '.tmp';
  try {
    writeFileSync(temp, bytes, { flag: 'wx' });
    renameSync(temp, target);
  } finally { rmSync(temp, { force: true }); }
  return target;
}
