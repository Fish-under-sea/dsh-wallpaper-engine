import { createHash } from 'node:crypto';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * prepared.js —— 桌宠联动的**就绪面**（P1：内置 provider）。
 *
 * 这个文件以前回答的是「外部 dsh-pet 是否已被打补丁装好」：读 `$DSH_HOME/dsh-pet/pet-link-install.json`
 * 的补丁指纹、比对 `<profile>/node_modules/dsh-pet` 的版本。P1 之后桌宠是**内置子包**
 * `dsh-we-pet-builtin`（`packages/pet`），那条外部链已退役 —— 再拿外部安装记录当就绪条件，
 * 结果是「内置包明明在，capability 却恒报不可用」，或反过来「外部旧安装恰好还在，就冒认通过」。
 *
 * 所以这里改成**内置就绪面**，回答三件可复算的事：
 *   ① 内置包在位且身份/版本对（`dsh-we-pet-builtin@0.3.7`）—— 解析根与宿主同一落脚处；
 *   ② 它的两半产物字节与 `client.build.json` 里登记的锚点逐字相等（受控派生的证据，
 *      与 `scripts/build-client.mjs` 的 `assertPrebuiltBundle` 同一个锚点，两处对账同一份）；
 *   ③ 联动资源（九动画 + 五气泡）在**内置资源面**齐全 —— 发行包里就带着，不需要用户准备。
 *
 * 返回形状不变：`{ available, reason }`（`test/verify-pet-package.mjs` 与
 * `test/verify-pet-hotplug-integration.mjs` 的断言依赖它）。reason 文案仍然逐字稳定 ——
 * 浏览器半边的降级文案与负控都按这几个字符串对账。
 */

export const PET_NAMES = Object.freeze([
  '通用-右侧螃蟹步-dshwe', '通用-左侧螃蟹步-dshwe',
  '侧边栏-蓄力准备往后拉-dshwe', '侧边栏-后拉接疲态结束-dshwe',
  '吉祥物-跳抓眩晕落地起身-dshwe', '彩蛋-侧边栏-半身转向踢腿-dshwe',
  '彩蛋-侧边栏-被弹飞-dshwe', '彩蛋-侧边栏-落地-dshwe', '彩蛋-吉祥物-哈气-dshwe',
]);
const MEMES = ['累瘫鲸鱼的两碗饭', '蓝发鲸尾女仆拒绝换壁纸', '暴怒鲸尾女仆贴纸', '吓哭了', '？！欺负一只肥鱼！？'];
/** 表情素材名（导出给 provision.js 用同一份真源，避免两处各抄一遍）。 */
export const MEME_NAMES = Object.freeze(MEMES);

/** 内置桌宠的固定派生身份与版本（与 `test/tools/subpackage-shapes.mjs` 的登记同值）。 */
export const PET_PACKAGE_NAME = 'dsh-we-pet-builtin';
export const PET_PACKAGE_VERSION = '0.3.7';
/** 内置桌宠的独立数据根（不与外部 `dsh-pet` 共享，见 P1 身份隔离）。 */
export const PET_DATA_DIR = PET_PACKAGE_NAME;
/** 浏览器半边使用的桥接基址（与 `src/pet-link.js` 的 PET_BASE 同一真源）。 */
export const PET_BASE_PATH = '/dsh-we-pet-builtin';

const hashes = new Map();
function fileHash(path) {
  const stat = statSync(path, { bigint: true });
  if (!stat.isFile()) throw new Error('不是文件');
  const key = `${stat.dev}:${stat.ino}:${stat.size}:${stat.mtimeNs}:${stat.ctimeNs}`;
  const cached = hashes.get(path);
  if (cached && cached.key === key) return cached.hash;
  const hash = createHash('sha256').update(readFileSync(path)).digest('hex');
  if (hashes.size > 128) hashes.clear();
  hashes.set(path, { key, hash });
  return hash;
}

/**
 * 解析内置桌宠包根。**与宿主同一落脚处**（宿主按裸包名解析行，P1 在 `<profile>/node_modules`），
 * 解析不到时退回本仓 `packages/pet`（开发期自链）—— 两条路都指向同一份字节。
 * @param {string} [profile] profile 目录（宿主解析根）
 * @returns {string|null}
 */
export function resolvePetPackageRoot(profile) {
  const tries = [];
  if (profile) tries.push(() => createRequire(join(profile, 'cordis.yml')).resolve(`${PET_PACKAGE_NAME}/package.json`));
  tries.push(() => createRequire(import.meta.url).resolve(`${PET_PACKAGE_NAME}/package.json`));
  for (const attempt of tries) {
    try {
      const manifestPath = attempt();
      return join(manifestPath, '..');
    } catch { /* 下一条腿 */ }
  }
  return null;
}

/**
 * 内置联动的资源面根：**发行包自带**（`packages/pet-link/assets`），不是用户目录。
 * 用户目录只承载"用户自己加的东西"，不是"我们承诺在的东西"。
 */
const ASSETS_ROOT = fileURLToPath(new URL('../assets/', import.meta.url));

/**
 * 就绪判据（纯函数式：只读盘，不写盘、不改用户数据）。
 *
 * @param {string} home `$DSH_HOME`（调用方按宿主同口径算出）
 * @param {string} [profile] profile 目录（宿主解析根；缺省只走本仓解析）
 * @returns {{available: boolean, reason: string}}
 */
export function checkPetPrepared(home, profile) {
  try {
    const pkgRoot = resolvePetPackageRoot(profile);
    if (!pkgRoot) return { available: false, reason: '内置桌宠包未安装（' + PET_PACKAGE_NAME + '）' };
    const manifest = JSON.parse(readFileSync(join(pkgRoot, 'package.json'), 'utf8'));
    // 身份与版本分开报：这两类故障的修法不同（装错包 vs 装了别的版本），合成一句会让人查错方向。
    if (manifest.name !== PET_PACKAGE_NAME) {
      return { available: false, reason: '内置桌宠身份不符：期望 ' + PET_PACKAGE_NAME + '，实际 ' + String(manifest.name) };
    }
    if (manifest.version !== PET_PACKAGE_VERSION) {
      return { available: false, reason: '内置桌宠版本不符：期望 ' + PET_PACKAGE_VERSION + '，实际 ' + String(manifest.version) };
    }
    // ② 两半产物的字节锚点：读内置包自己的登记（同一份锚点喂构建期与运行期，不另抄一份）。
    let anchors = null;
    try { anchors = JSON.parse(readFileSync(join(pkgRoot, 'client.build.json'), 'utf8')).prebuilt || null; }
    catch { anchors = null; }
    if (!anchors) return { available: false, reason: '内置桌宠缺少产物登记（client.build.json），安装不完整' };
    const validHash = (value) => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
    const pairs = [
      [anchors.entry, anchors.sha256],
      [anchors.hostEntry, anchors.hostSha256],
    ];
    for (const [rel, want] of pairs) {
      if (typeof rel !== 'string' || !rel || !validHash(want)) {
        return { available: false, reason: '内置桌宠产物登记不完整，请重新安装插件包' };
      }
      const abs = join(pkgRoot, rel);
      if (!existsSync(abs)) return { available: false, reason: '内置桌宠产物缺失：' + rel };
      if (fileHash(abs) !== want) return { available: false, reason: '内置桌宠产物字节与登记锚点不符' };
    }
    // ③ 九动画 + 五气泡：必须在**内置资源面**齐全（发行包自带，不依赖用户准备）。
    for (const name of PET_NAMES) {
      if (!existsSync(join(ASSETS_ROOT, 'webm', name + '.webm'))) {
        return { available: false, reason: '桌宠联动资源缺失或已改变' };
      }
    }
    for (const name of MEMES) {
      if (!existsSync(join(ASSETS_ROOT, 'memes', name + '.png'))) {
        return { available: false, reason: '桌宠联动资源缺失或已改变' };
      }
    }
    // ④ 用户数据根的动画扩展**若存在**，它的目标与池必须覆盖九个名字（用户可能自己加过东西）；
    //    不存在是正常态（首次运行还没合并），不构成不可用。
    const extPath = join(home, PET_DATA_DIR, 'animation-ext', 'leash-bridge-ext.json');
    if (existsSync(extPath)) {
      const ext = JSON.parse(readFileSync(extPath, 'utf8'));
      if (ext.target !== 'main' || !PET_NAMES.every((name) => ext.animations?.events?.DSHWE?.includes(name))) {
        return { available: false, reason: '目标宠物动画池不完整' };
      }
    }
    return { available: true, reason: '' };
  } catch {
    return { available: false, reason: '内置桌宠就绪检查失败（安装或数据面异常）' };
  }
}
