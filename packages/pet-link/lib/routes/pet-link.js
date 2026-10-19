import { randomUUID } from 'node:crypto';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { checkPetPrepared, PET_BASE_PATH, PET_NAMES } from '../prepared.js';

export const DEPS = ['disposers', 'base'];

/** 每次组件会话独立发放短期资格；旧处理器在退出后也只能回答不可用。 */
export function registerPetLinkRoutes(webServer, c, options = {}) {
  const { disposers, base: BASE } = c;
  const generation = randomUUID();
  let active = true;
  disposers.push(() => { active = false; });
  disposers.push(webServer.register({
    kind: 'exact',
    path: `${BASE}/pet-link/capability`,
    handler: (req, res) => {
      const method = (req.method || 'GET').toUpperCase();
      if (method !== 'GET' && method !== 'HEAD') {
        res.statusCode = 405;
        res.setHeader('Cache-Control', 'no-store');
        res.end();
        return;
      }
      const home = process.env.DSH_HOME || join(homedir(), '.dsh');
      const profile = process.env.DSH_PROFILE_DIR || join(home, 'profiles', 'desktop');
      const linkEnabled = active && (!options.isLinkEnabled || options.isLinkEnabled());
      // P1：就绪面 = **内置 provider**（内置包身份/版本 + 两半产物字节锚点 + 内置资源面九动画五气泡）。
      // 不再读外部 `dsh-pet/pet-link-install.json` 的补丁指纹 —— 那条外部链已退役。
      const prepared = active && linkEnabled ? checkPetPrepared(home, profile)
        : { available: false, reason: active ? '桌宠联动已关闭' : '桌宠桥接会话已退出' };
      const payload = { protocol: 1, generation, enabled: active, linkEnabled,
        ttlMs: 1500, target: 'main', petBase: PET_BASE_PATH, names: PET_NAMES, ...prepared };
      if (method === 'HEAD') {
        res.statusCode = 200;
        res.setHeader('Cache-Control', 'no-store');
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.end();
      } else {
        res.statusCode = 200;
        res.setHeader('Cache-Control', 'no-store');
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.end(JSON.stringify(payload));
      }
    },
  }));
}
