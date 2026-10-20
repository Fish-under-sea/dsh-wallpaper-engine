import { registerOfficialPetRoutes } from './routes/official-pet.js';

export const name = 'dsh-plugin-wallpaper-engine-pet-link';
export const inject = ['webServer', 'wallpaperEngineHost'];
export const routeConfigs = Object.freeze([Object.freeze({})]);

/** 官方 pet 是用户独立安装的可选插件；装载时不写它的配置或资源目录。 */
export function apply(ctx, config) {
  const host = ctx.wallpaperEngineHost;
  if (!host) throw new Error('[wallpaper-engine] pet-link 缺少 wallpaperEngineHost 服务');
  const keys = host.keys('pet-link', ctx);
  const deps = Object.freeze({ ...keys, http: host.http });
  return keys.handOffTeardown(ctx, keys.runComponent('pet-link', ctx, config || {}, deps, applyImpl));
}

export function applyImpl(ctx, config = {}, c) {
  const { webServer } = ctx;
  const { base, http } = c;
  const disposers = [];
  let active = true;
  const dispose = () => {
    if (!active) return;
    active = false;
    for (const off of disposers.splice(0).reverse()) {
      try { off(); } catch { /* 继续归还其余注册。 */ }
    }
  };
  try {
    registerOfficialPetRoutes(webServer, { disposers, base, http }, {
      isLinkEnabled: () => config.linkEnabled !== false,
    });
  } catch (error) { dispose(); throw error; }
  return dispose;
}
