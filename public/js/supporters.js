/*
  v1.28.0 บอร์ดผู้สนับสนุน (หน้าแรก) + หน้าผู้ดูแลนำเข้ารายการโดเนท
  ข้อมูล: GET /api/supporters · ผู้ดูแล /api/admin/supporters (สิทธิ์ตรวจที่เซิร์ฟเวอร์)
  ชื่อทุกชื่อผ่าน esc ก่อนแสดง (ชื่อมาจากผู้โดเนทตั้งเอง)
*/
(function () {
  'use strict';
  const App = () => window.EQApp;
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const ICON = (n, c = 'icon icon-sm') => `<svg class="${c}" aria-hidden="true"><use href="/assets/icons/icons.svg#${n}"></use></svg>`;
  const baht = (n) => `${Number(n).toLocaleString('th-TH', { maximumFractionDigits: 2 })} บาท`;
  const SHOW = 5;
  let cache = null; let cacheAt = 0; let expanded = false;

  function rankMark(r) {
    if (r === 1) return `<span class="sp-rank is-1" aria-label="อันดับ 1">${ICON('crown')}</span>`;
    if (r <= 3) return `<span class="sp-rank is-${r}" aria-label="อันดับ ${r}">${ICON('medal')}</span>`;
    return `<span class="sp-rank" aria-label="อันดับ ${r}">${r}</span>`;
  }

  function render() {
    const box = document.getElementById('sp-board');
    if (!box) return;
    const d = cache;
    if (!d || !d.top || !d.top.length) { box.classList.add('hidden'); return; }
    const list = expanded ? d.top : d.top.slice(0, SHOW);
    box.innerHTML = `
      <div class="sp-head">
        <span class="sp-head-ic">${ICON('trophy', 'icon')}</span>
        <div class="sp-head-t"><h2 class="home-card-title" id="sp-title">บอร์ดผู้สนับสนุน</h2>
          <p class="sp-sub">ขอบคุณ ${d.supporters} คนที่ช่วยให้ EnglishQuest ใช้ฟรีต่อไปได้</p></div>
      </div>
      <ol class="sp-list" aria-labelledby="sp-title">${list.map((x) => `
        <li class="sp-row sp-tier-${esc(x.tier)}">${rankMark(x.rank)}
          <span class="sp-name">${esc(x.name)}</span>
          <span class="sp-chip">${esc(x.tierTh)}</span>
          ${d.showAmounts && x.total != null ? `<b class="sp-amt">${baht(x.total)}</b>` : ''}</li>`).join('')}</ol>
      ${d.top.length > SHOW ? `<button class="sp-more" type="button" data-sp-more aria-expanded="${expanded}">${expanded ? 'ย่อ' : `ดูทั้งหมด (${d.top.length})`}</button>` : ''}
      <a class="sp-cta" href="https://ezdn.app/defadisak" target="_blank" rel="noopener noreferrer">${ICON('heart')} ร่วมสนับสนุน</a>
      <p class="sp-note">ชื่อที่ผู้สนับสนุนตั้งเองบน ezdn.app · อยากซ่อนชื่อแจ้งผู้ดูแลได้</p>`;
    box.classList.remove('hidden');
  }

  async function load(force) {
    if (!force && cache && Date.now() - cacheAt < 60000) { render(); return; }
    try { cache = await App().api('/supporters?limit=20'); cacheAt = Date.now(); } catch (_) { cache = null; }
    render();
  }

  window.addEventListener('eq:screen', (e) => { if (e.detail && e.detail.id === 'screen-home') load(false); });
  document.addEventListener('click', (e) => {
    if (e.target.closest && e.target.closest('[data-sp-more]')) { expanded = !expanded; render(); }
  });

  /* ---------------- ผู้ดูแล ---------------- */
  const ACT_TH = { import: 'นำเข้า', hide: 'ซ่อน', unhide: 'แสดง', settings: 'ค่าตั้ง' };
  async function mountAdmin() {
    const box = document.getElementById('admin-sp-root');
    if (!box) return;
    let d;
    try { d = await App().api('/admin/supporters'); } catch (err) { box.innerHTML = `<p class="admin-row-src">${esc(err.message)}</p>`; return; }
    box.innerHTML = `
      <p class="admin-row-src">แอปไม่ได้เชื่อมกับ ezdn.app โดยตรง — พิมพ์บรรทัดละ 1 คน แค่ <b>ชื่อ กับ ยอดเงิน</b> ก็พอ เช่น <code>NongFah 100</code><br>
        ใส่วันเวลาเพิ่มได้ถ้าต้องการกันนำเข้าซ้ำ: <code>NongFah | 100 | 09 พ.ย. 09:28</code> · ไม่ต้องใส่ข้อความโดเนท<br>
        ไม่ใส่วันเวลา = นับเป็นโดเนทใหม่ทุกครั้งที่นำเข้า (กด "ตรวจก่อนนำเข้า" จะเตือนถ้าชื่อ+ยอดนี้มีอยู่แล้ว)</p>
      <label class="sp-adm-l">เหตุผล (บันทึก Audit Log ทุกการแก้ไข)<input class="input" id="sp-adm-reason" maxlength="200" placeholder="เช่น อัปเดตจากหน้า ezdn 26 พ.ย."></label>
      <textarea class="input sp-adm-text" id="sp-adm-text" rows="6" placeholder="ชื่อ ยอดเงิน (บรรทัดละคน) เช่น NongFah 100"></textarea>
      <div class="admin-report-actions">
        <button class="mini-btn ghost" type="button" data-sp-import="dry">ตรวจก่อนนำเข้า</button>
        <button class="mini-btn" type="button" data-sp-import="go">นำเข้า</button>
        <label class="sp-adm-chk"><input type="checkbox" id="sp-adm-amt" ${d.settings.showAmounts ? 'checked' : ''}> แสดงยอดเงินบนบอร์ด</label>
      </div>
      <div id="sp-adm-out" class="admin-row-src" role="status"></div>
      <h4 class="tc-adm-h">รายการ (${d.donations.length})</h4>
      <ul class="sp-adm-list">${d.donations.map((x) => `<li class="${x.hidden ? 'is-hidden' : ''}"><b>${esc(x.name)}</b> ${baht(x.amount)} · ${esc(new Date(x.at).toLocaleString('th-TH'))}${x.channel ? ` · ${esc(x.channel)}` : ''}
        ${x.hidden ? '<span class="admin-tag warn">ซ่อน</span>' : ''} <button class="mini-btn ghost" type="button" data-sp-hide="${x.id}" data-v="${x.hidden ? 0 : 1}">${x.hidden ? 'แสดง' : 'ซ่อน'}</button></li>`).join('') || '<li>ยังไม่มีรายการ</li>'}</ul>
      <details><summary>ประวัติผู้ดูแล</summary><ul class="sp-adm-list">${d.logs.map((l) => `<li>${esc(new Date(l.at).toLocaleString('th-TH'))} · ${esc(l.by || '-')} · ${esc(ACT_TH[l.action] || l.action)} · ${esc(l.detail)} — ${esc(l.reason)}</li>`).join('') || '<li>ยังไม่มี</li>'}</ul></details>`;
  }
  const reason = () => (document.getElementById('sp-adm-reason') || {}).value || '';
  async function adminCall(path, body, okMsg) {
    try { const r = await App().api(path, { method: 'POST', body }); if (okMsg) App().toast(okMsg(r), 'success'); cacheAt = 0; return r; } catch (err) { App().toast(err.message, 'error'); return null; }
  }
  document.addEventListener('click', async (e) => {
    const t = e.target.closest && e.target.closest('[data-sp-import],[data-sp-hide]');
    if (!t || !document.getElementById('admin-sp-root')) return;
    if (t.dataset.spImport) {
      const dry = t.dataset.spImport === 'dry';
      const r = await adminCall('/admin/supporters/import', { text: document.getElementById('sp-adm-text').value, reason: reason(), dryRun: dry });
      const out = document.getElementById('sp-adm-out');
      if (!r || !out) return;
      if (r.dryRun) {
        out.innerHTML = `${r.errors.length ? `<b>พบปัญหา ${r.errors.length} บรรทัด (ยังไม่นำเข้า):</b> ${r.errors.map((x) => `บรรทัด ${x.line}: ${esc(x.error)}`).join(' · ')}<br>` : ''}
          ${(r.maybeDup || []).length ? `<b>ระวังซ้ำ:</b> ${r.maybeDup.map((x) => `${esc(x.name)} ${baht(x.amount)}`).join(' · ')} มีอยู่แล้ว — ถ้าเป็นโดเนทเดิมให้ลบบรรทัดนั้นออก<br>` : ''}
          อ่านได้ ${r.ok} รายการ: ${r.preview.map((x) => `${esc(x.name)} ${baht(x.amount)}${x.at ? ` (${esc(new Date(x.at).toLocaleString('th-TH'))})` : ''}`).join(' · ')}`;
      } else { App().toast(`นำเข้า ${r.added} รายการ${r.duplicates ? ` · ข้ามรายการซ้ำ ${r.duplicates}` : ''}`, 'success'); mountAdmin(); }
    } else if (t.dataset.spHide) {
      if (await adminCall(`/admin/supporters/${t.dataset.spHide}/hidden`, { hidden: t.dataset.v === '1', reason: reason() })) mountAdmin();
    }
  });
  document.addEventListener('change', async (e) => {
    if (e.target && e.target.id === 'sp-adm-amt') {
      const r = await adminCall('/admin/supporters/settings', { showAmounts: e.target.checked, reason: reason() }, (x) => `แสดงยอดเงิน: ${x.showAmounts ? 'เปิด' : 'ปิด'}`);
      if (!r) e.target.checked = !e.target.checked;
    }
  });

  window.EQSupporters = { load, mountAdmin, _state: () => ({ cache, expanded }) };
}());
