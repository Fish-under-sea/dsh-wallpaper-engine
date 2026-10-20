import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { applyImpl } from '../packages/pet-link/lib/index.js';
import { httpView } from '../lib/subpackage-boot.js';
import { createOfficialPetCoordinator } from '../packages/pet-link/lib/official-provider.js';
import { registerOfficialPetRoutes } from '../packages/pet-link/lib/routes/official-pet.js';

const routes = new Map();
const off = applyImpl({ webServer: { port: 49123,
  register(route) { routes.set(route.path, route); return () => routes.delete(route.path); },
} }, {}, { base: '/wall', http: httpView });
assert.ok(routes.has('/wall/pet-link/official'), '默认即为正式官方桥接');
assert.equal(routes.has('/wall/pet-link/capability'), false, '不存在内置资格入口');
off(); off();
assert.equal(routes.size, 0, '卸载幂等归还全部路由');
await (await import('./tools/official-pet-case.mjs')).verifyOfficialPet({
  createOfficialPetCoordinator, registerOfficialPetRoutes,
  clientSource: readFileSync(new URL('../packages/pet-link/src/official-pet.js', import.meta.url), 'utf8'),
});
