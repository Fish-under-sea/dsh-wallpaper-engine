/** 官方 pet 联动客户端入口；主包只消费登记门面，运行期通过本页 Cordis 服务读取实况。 */
const PET_LINK_HOST_REQUIRED = [
  'weT', 'apiUrl', 'apiFetch', 'wallSidebarOpen', 'wallSidebarClose', 'wallSidebarToggle', 'registerPetLink',
];
for (const key of PET_LINK_HOST_REQUIRED) {
  if (!(key in host)) throw new Error('[wallpaper-engine-pet-link] 主 bundle 键集缺少 "' + key + '"');
}
const { weT, apiUrl, apiFetch, wallSidebarOpen, wallSidebarClose, wallSidebarToggle, registerPetLink } = host;
let petLinkContext = null;
const petLink = createOfficialPetPerformer({
  translate: weT,
  getContext: () => petLinkContext,
  async fetchTargets() {
    const response = await apiFetch(apiUrl('/pet-link/official'));
    return response.data || { ok: false, reason: response.error || 'transport-error' };
  },
  async request(payload) {
    const response = await apiFetch(apiUrl('/pet-link/official'), {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
    });
    return response.data || { ok: false, reason: response.error || 'transport-error' };
  },
  bubbleUrl: index => apiUrl('/pet-link/official/assets/m' + index + '.png'),
  ropePoint() {
    const rope = document.querySelector('.we-rope');
    const box = rope?.getBoundingClientRect();
    return box ? { x: (box.left + box.width / 2) / window.innerWidth, y: box.bottom / window.innerHeight } : null;
  },
  moveRope(px) {
    const rope = document.querySelector('.we-rope');
    if (rope) rope.style.setProperty('--we-rope-pull', px + 'px');
  },
  restoreRope() { document.querySelector('.we-rope')?.style.removeProperty('--we-rope-pull'); },
  fallback() {
    if (typeof wallSidebarToggle === 'function') return wallSidebarToggle('mascot') === true;
    if (typeof wallSidebarOpen === 'function') return wallSidebarOpen('mascot') === true;
    return false;
  },
});
const petTuner = createOfficialPetTuner(petLink, { translate: weT });
Object.assign(petLink.tuner, petTuner);
const petLinkWarmup = petLink.warmup;
petLink.warmup = () => { petTuner.install(); return petLinkWarmup(); };
const petLinkDispose = petLink.dispose;
petLink.dispose = () => { petTuner.dispose(); petLinkDispose(); };
registerPetLink(petLink);

exports.inject = [];
exports.apply = ctx => {
  petLinkContext = ctx;
  petLink.warmup();
  ctx.effect(() => () => {
    if (petLinkContext === ctx) { petLink.dispose(); petLinkContext = null; }
  });
};
