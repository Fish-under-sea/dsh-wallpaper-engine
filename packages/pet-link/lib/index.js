import { homedir } from 'node:os';
import { join } from 'node:path';
import { registerPetLinkRoutes } from './routes/pet-link.js';
import { PET_DATA_DIR, PET_PACKAGE_NAME } from './prepared.js';
import { provisionAssets } from './provision.js';

export const name = 'dsh-plugin-wallpaper-engine-pet-link';
export const inject = ['webServer', 'wallpaperEngineHost'];

/** `$DSH_HOME` 或 `<home>/.dsh` —— 与 `lib/routes/pet-link.js` 的就绪面同一口径（两处漂移即判红）。 */
export function dshHomePath(env = process.env) {
  return env.DSH_HOME || join(env.USERPROFILE || env.HOME || homedir(), '.dsh');
}

/**
 * 数据根（`<home>/dsh-we-pet-builtin`）。**只在能证明 home 时**返回：宿主给的 `paths.home`
 * 优先，其次 `DSH_HOME`。两条都没有 ⇒ null（判据夹具 / CI 环境不往真实用户目录写东西）。
 */
export function petDataRootOf(host, env = process.env) {
  const home = (host && host.paths && typeof host.paths.home === 'string' && host.paths.home)
    || (typeof env.DSH_HOME === 'string' && env.DSH_HOME ? env.DSH_HOME : '');
  return home ? join(home, PET_DATA_DIR) : null;
}

/**
 * 从宿主服务领取本子包的最小键集，并（P1）把**内置资源**落进本插件自己的数据根。
 *
 * 首次桌宠装载仍由既有安装器显式完成；这里做的是内置 provider 的**就绪准备**：
 * 九动画 / 五气泡的字节随包发，池子按「只追加」合进 `animation-ext/leash-bridge-ext.json`。
 * 数据根 = `$DSH_HOME/dsh-we-pet-builtin`（本插件产品数据面，**不动**外部 `dsh-pet` 目录）。
 */
export function apply(ctx, config) {
  config ??= {};
  const host = ctx.wallpaperEngineHost;
  if (!host) throw new Error('[wallpaper-engine] pet-link 缺少 wallpaperEngineHost 服务');
  const keys = host.keys('pet-link', ctx);
  // 资源准备失败**不阻断装载**：就绪面会如实报 available:false + 原因（用户看到降级而不是白屏）。
  // 抛错会让整行组件消失，比"桌宠暂不可用"严重得多。
  // 数据根只在能证明 home 时才写（宿主 paths.home 优先，其次 DSH_HOME）：判据夹具 / CI 环境
  // 不该往真实用户目录里写东西。
  const dataRoot = petDataRootOf(host);
  if (dataRoot) provisionAssets(dataRoot);
  return keys.handOffTeardown(ctx, keys.runComponent('pet-link', ctx, config, keys, applyImpl));
}

export function applyImpl(ctx, config = {}, c) {
  const { base } = c;
  const disposers = [];
  let active = true;
  const dispose = () => {
    if (!active) return;
    active = false;
    for (const off of disposers.splice(0).reverse()) {
      try { off(); } catch { /* 继续归还其余注册。 */ }
    }
  };
  const webServer = ctx.webServer;
  try {
    registerPetLinkRoutes(webServer, { disposers, base }, {
      isLinkEnabled: () => config.linkEnabled !== false,
    });
  } catch (error) {
    dispose();
    throw error;
  }
  return dispose;
}

/** 诊断用：内置 provider 的身份（`verify-pet-builtin` 与报告引用同一份字面量）。 */
export const builtinProvider = Object.freeze({ packageName: PET_PACKAGE_NAME, dataDir: PET_DATA_DIR });
