/* =====================================================================
   แท่นรางวัลกระดานอันดับ (อันดับ 1–3) — v1.18.0 — window.EQPodium
   ใช้ทั้งกระดาน EXP (app.js) และ Ranked (ranked.js)
   - ลำดับใน DOM = 1, 2, 3 (screen reader อ่านถูก) · จัดภาพเป็น 2 | 1 | 3 ด้วย CSS
   - ตัวละครยืนบนแท่น: EQAvatar.fullBody(uid) → ภาพจากโมเดล 3D (เรนเดอร์ทีละตัว) / 2D / รูปโปรไฟล์ (ถ้าเจ้าของไม่ได้เลือกใช้ Avatar)
   - ข้อความทุกชิ้นผ่าน esc()
   ===================================================================== */
(function () {
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const G = () => window.EQG;
  const PLACE_TH = { 1: 'อันดับ 1', 2: 'อันดับ 2', 3: 'อันดับ 3' };

  /**
   * @param {Array<{rank:number,userId:number,name:string,isMe?:boolean,avatar?:string,avatarImage?:string,scoreHtml:string,sub?:string}>} top3
   */
  function html(top3, { label = 'อันดับ 1–3' } = {}) {
    if (!top3 || !top3.length) return '';
    const place = (e) => `<li class="lbp-place lbp-${e.rank}${e.isMe ? ' is-me' : ''}"${e.userId ? ` data-uid="${Number(e.userId)}"` : ''}>
        <div class="lbp-fig" ${e.userId ? `data-lbp-uid="${Number(e.userId)}" data-profile-uid="${Number(e.userId)}"` : ''} data-lbp-name="${esc(e.name)}">
          <span class="lbp-photo">${G().avatar(e.avatar, e.avatarImage || null, '', e.userId)}</span>
        </div>
        <div class="lbp-info">
          <b class="lbp-name leaderboard-username">${esc(e.name)}${e.isMe ? ' <small>(คุณ)</small>' : ''}</b>
          ${e.sub ? `<small class="lbp-sub">${e.sub}</small>` : ''}
          <span class="lbp-score">${e.scoreHtml}</span>
        </div>
        <div class="lbp-block" aria-hidden="true"><span class="lbp-num">${e.rank}</span></div>
        <span class="sr-only">${PLACE_TH[e.rank] || ''}</span>
      </li>`;
    return `<section class="lbp" aria-label="${esc(label)}"><ol class="lbp-row">${top3.slice(0, 3).map(place).join('')}</ol></section>`;
  }

  /** แทนรูปโปรไฟล์ด้วยตัวละครเต็มตัว (ทีละตัวตามลำดับ 1 → 2 → 3) */
  async function hydrate(root) {
    if (!root || !window.EQAvatar || !window.EQAvatar.fullBody) return;
    const figs = [...root.querySelectorAll('.lbp-fig[data-lbp-uid]')]
      .sort((a, b) => Number(a.closest('.lbp-place').className.match(/lbp-(\d)/)[1]) - Number(b.closest('.lbp-place').className.match(/lbp-(\d)/)[1]));
    for (const fig of figs) {
      if (!document.contains(fig)) return;   // ผู้ใช้เปลี่ยนแท็บแล้ว
      fig.classList.add('is-loading');
      let r;
      try { r = await window.EQAvatar.fullBody(fig.dataset.lbpUid, `ตัวละครของ ${fig.dataset.lbpName}`); } catch (_) { r = { kind: 'photo' }; }
      if (!document.contains(fig)) return;
      fig.classList.remove('is-loading');
      if (r.kind === '3d') fig.innerHTML = `<img class="lbp-model" src="${esc(r.src)}" alt="" width="384" height="384" decoding="async">`;
      else if (r.kind === '2d') fig.innerHTML = `<span class="lbp-model lbp-model-2d">${r.html}</span>`;
      fig.classList.add(`is-${r.kind}`);
    }
  }

  window.EQPodium = { html, hydrate };
}());
