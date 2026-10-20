import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
const checks = [
  'verify-pet-package.mjs', 'verify-pet-hotplug-host.mjs', 'verify-pet-hotplug-client.mjs',
  'verify-pet-rope-entry.mjs', 'verify-pet-tuner.mjs', 'verify-pet-official.mjs',
  'verify-pet-sidebar-rebound.mjs', 'verify-pet-sidebar-diag.mjs', 'verify-pet-sidebar-glass.mjs',
];
for (const check of checks) {
  const result = spawnSync(process.execPath, ['test/' + check], { cwd: root, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
}
console.log('PASS 可选桌宠联动完整定点回归');
