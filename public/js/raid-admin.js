/*
  v1.27.0 World Raid — แผงผู้ดูแล (หน้า "ผู้ดูแล" → World Raid Boss) · API /api/admin/raid (requireAdmin)
  ทุกการเปลี่ยนแปลงต้องใส่เหตุผล → บันทึก raid_admin_audit_logs (ใคร · เมื่อไร · ค่าก่อน/หลัง)
  ข้อความทุกชิ้นผ่าน esc()
*/
(function () {
  'use strict';
  const app = () => window.EQApp;
  const esc = (x) => String(x === null || x === undefined ? '' : x).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmt = (n) => (n === null || n === undefined ? '—' : Number(n).toLocaleString('en-US'));
  const dt = (d) => (d ? new Date(d).toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' }) : '—');
  const NUM = [['hpCap', 'เพดาน HP'], ['hpFloor', 'HP ต่ำสุด'], ['hpMultiplier', 'ตัวคูณ HP'], ['targetHours', 'เป้าเวลาล้มบอส (ชม.)'], ['cooldownMin', 'คูลดาวน์ก่อนบอสใหม่ (นาที)'],
    ['prepareSec', 'เวลาปรากฏตัว (วินาที)'], ['questionsPerRound', 'ข้อต่อรอบ'], ['roundsPerDay', 'รอบต่อวัน/คน'], ['minAnswerMs', 'เวลาตอบขั้นต่ำ (ms · กันบอท)'],
    ['answerLimitMs', 'เวลาต่อข้อ (ms)'], ['minCorrectForReward', 'ตอบถูกขั้นต่ำเพื่อรับรางวัล'], ['claimDays', 'รับรางวัลย้อนหลังได้ (วัน)'], ['rewardMultiplier', 'ตัวคูณรางวัล'], ['ultimateEverySec', 'ท่าไม้ตาย Phase 3 ทุก (วินาที)'],
    ['playerHp', 'พลังชีวิตผู้เล่น'], ['levelBaseHp', 'HP พื้นฐาน Lv1'], ['levelHpGrowth', 'HP เพิ่มต่อเลเวล (×)'], ['levelDefenseStep', 'เกราะเพิ่มต่อเลเวล (0–0.1)'], ['levelDefenseCap', 'เกราะสูงสุด'], ['levelHitStep', 'แรงตีเพิ่มต่อเลเวล'], ['levelHitCap', 'แรงตีสูงสุด (×)'], ['bossHit1', 'บอสตี Phase 1'], ['bossHit2', 'บอสตี Phase 2'], ['bossHit3', 'บอสตี Phase 3'], ['healEvery', 'ฟื้นพลังทุกตอบถูกติดกัน (ข้อ · 0 = ปิด)'], ['healAmount', 'ฟื้นพลังครั้งละ'], ['hitExp', 'EXP ต่อการตีโดน (0 = ปิด)'], ['hitExpDailyCap', 'เพดาน EXP จากการตีต่อวัน'], ['wordLevelEvery', 'ศัพท์ขึ้น 1 ระดับทุกกี่เลเวลบอส'], ['wordStretchShare', 'สัดส่วนข้อระดับบอส (0–1)']];
  let root = null; let data = null;

  async function load() {
    root = document.getElementById('admin-raid-root'); if (!root) return;
    root.innerHTML = '<p class="admin-row-src">กำลังโหลด…</p>';
    try { data = await app().api('/admin/raid'); render(); } catch (e) { root.innerHTML = `<p class="form-error">${esc(e.message)}</p>`; }
  }
  function render() {
    const d = data; const b = d.boss; const s = d.settings; const m = d.metrics;
    root.innerHTML = `
      ${d.warnings.map((w) => `<p class="form-error">${esc(w)}</p>`).join('')}
      <div class="admin-raid-grid">
        <section><h3>บอสปัจจุบัน</h3>${b ? `<p><b>${esc(b.nameEn)}</b> Lv.${b.level} · ${esc(b.status)} · Phase ${b.phase}</p>
          <p>HP ${fmt(b.hp)} / ${fmt(b.maxHp)} · ผู้ร่วม ${fmt(b.participants)} · ดาเมจรวม ${fmt(b.totalDamage)}</p>
          ${b.shield ? `<p>โล่ ${b.shield.progress}/${b.shield.goal}${b.stunUntil ? ' · มึนอยู่' : ''}</p>` : ''}
          <p class="admin-row-src">การคำนวณ HP: พื้นฐาน ${fmt(d.scaling && d.scaling.base)} · จากสถิติจริง ${fmt(d.scaling && d.scaling.activity)} (บอสย้อนหลัง ${d.scaling ? d.scaling.history : 0} ตัว) · เพดาน ${fmt(d.scaling && d.scaling.cap)}</p>` : '<p>ยังไม่มีบอส</p>'}</section>
        <section><h3>สถิติ 24 ชม.</h3><p>ผู้เล่น ${fmt(d.stats.players24h)} คน · ตอบ ${fmt(d.stats.answers24h)} ข้อ · ตอบเร็วผิดปกติ ${fmt(d.stats.tooFast24h)}</p>
          <p>ล้มบอสแล้ว ${fmt(d.stats.defeated)} ตัว · เวลาเฉลี่ย ${d.stats.avgKillHours === null ? '—' : `${d.stats.avgKillHours} ชม.`}</p></section>
        <section><h3>เซิร์ฟเวอร์ (เครื่องนี้)</h3><p>ตอบ ${fmt(m.answers)} · รอบ ${fmt(m.rounds)} · error ${fmt(m.errors)} · latency p50 ${fmt(m.answerLatencyMs.p50)} / p95 ${fmt(m.answerLatencyMs.p95)} ms</p>
          <p>ดูหน้า Raid ${fmt(m.subscribers)} · ออนไลน์ ${fmt(m.onlineUsers)} · ส่งสถานะ ${fmt(m.broadcasts)} · NOTIFY ${m.busReady ? 'พร้อม' : 'ไม่พร้อม'} · RAM ${fmt(m.memoryMb.rss)} MB</p></section>
      </div>
      <form class="admin-raid-form" data-ra="settings">
        <h3>ตั้งค่า (มีผลทันที · บันทึก Audit Log)</h3>
        <label class="admin-raid-switch"><input type="checkbox" name="enabled" ${s.enabled ? 'checked' : ''}> เปิด World Raid (ปิด = หยุดฉุกเฉิน ข้อมูลอยู่ครบ)</label>
        <label class="admin-raid-switch"><input type="checkbox" name="playerHpOn" ${s.playerHpOn !== false ? 'checked' : ''}> พลังชีวิตผู้เล่น (ตอบผิด/หมดเวลา = บอสตีกลับ · หมด = จบรอบ · ไม่เสีย Coin/EXP/ไอเทม)</label>
        <div class="admin-raid-fields">${NUM.map(([k, n]) => `<label>${esc(n)}<input type="number" step="any" name="${k}" value="${esc(s[k])}"></label>`).join('')}
          <label>ชนิดโจทย์<select name="questionMode"><option value="spell" ${s.questionMode !== 'mixed' ? 'selected' : ''}>พิมพ์คำอังกฤษจากความหมายไทย (ทุกข้อ)</option><option value="mixed" ${s.questionMode === 'mixed' ? 'selected' : ''}>ผสม (ศัพท์ · แกรมม่า · อ่าน · ฟัง · สะกด)</option></select></label>
          <label>ผิวบอสเทศกาล<select name="seasonalSkin"><option value="auto" ${s.seasonalSkin === 'auto' ? 'selected' : ''}>อัตโนมัติตามเทศกาล</option><option value="off" ${s.seasonalSkin === 'off' ? 'selected' : ''}>ปิด</option></select></label>
          <label>บังคับตระกูลบอสตัวถัดไป<select name="forcedFamily"><option value="">ตามเลเวล</option>${d.families.filter((f) => f.ready).map((f) => `<option value="${esc(f.key)}" ${s.forcedFamily === f.key ? 'selected' : ''}>${esc(f.nameEn)}</option>`).join('')}</select></label>
          <label>เลเวลบอสตัวถัดไป<input type="number" name="nextLevel" min="1" value="${esc(s.nextLevel || '')}" placeholder="ตามลำดับ"></label></div>
        <label>เหตุผล (จำเป็น)<input name="reason" required minlength="3" placeholder="เช่น ผู้เล่นน้อย ลด HP"></label>
        <button class="btn-primary" type="submit">บันทึกการตั้งค่า</button>
      </form>
      <form class="admin-raid-form" data-ra="boss">
        <h3>ปรับบอสที่กำลังต่อสู้</h3>
        <div class="admin-raid-fields"><label>คำสั่ง<select name="action"><option value="set_hp">ตั้ง HP ที่เหลือ</option><option value="set_max_hp">ตั้ง Max HP</option>
          <option value="shield_goal">ตั้งเป้าทำลายโล่</option><option value="set_family">เปลี่ยนตระกูลบอส</option><option value="spawn_now">เรียกบอสถัดไปทันที (หลังสรุปผล)</option></select></label>
          <label>ค่า<input name="value" placeholder="ตัวเลข หรือ forest / inferno / frost"></label>
          <label>เหตุผล (จำเป็น)<input name="reason" required minlength="3"></label></div>
        <button class="btn-secondary" type="submit">ดำเนินการ</button>
      </form>
      <div class="admin-raid-tabs">${[['contributions', 'การมีส่วนร่วม'], ['damage-log', 'Damage Log'], ['suspicious', 'กิจกรรมผิดปกติ'], ['audit', 'Audit Log'], ['history', 'ประวัติบอส']].map(([k, n]) => `<button type="button" class="mini-btn ghost" data-ra-view="${k}">${n}</button>`).join('')}</div>
      <div class="admin-raid-table" id="admin-raid-table"></div>`;
  }
  async function view(k) {
    const box = root.querySelector('#admin-raid-table');
    const table = (head, rows) => `<div class="admin-table-wrap"><table class="admin-table"><thead><tr>${head.map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join('')}</tr>`).join('') || `<tr><td colspan="${head.length}">ไม่มีข้อมูล</td></tr>`}</tbody></table></div>`;
    if (k === 'audit') { box.innerHTML = table(['เวลา', 'ผู้ดูแล', 'คำสั่ง', 'ก่อน', 'หลัง', 'เหตุผล'], data.audit.map((a) => [dt(a.created_at), a.username || a.admin_id, a.action, JSON.stringify(a.before), JSON.stringify(a.after), a.reason])); return; }
    if (k === 'history') { box.innerHTML = table(['Lv', 'ตระกูล', 'สถานะ', 'Max HP', 'ดาเมจ', 'ผู้ร่วม', 'เริ่ม', 'ล้ม', 'ชม.'], data.history.map((h) => [h.level, h.family, h.status, fmt(h.max_hp), fmt(h.total_damage), h.participants, dt(h.active_at), dt(h.defeated_at), (h.secs / 3600).toFixed(1)])); return; }
    box.innerHTML = '<p class="admin-row-src">กำลังโหลด…</p>';
    try {
      const r = await app().api(`/admin/raid/${k}`);
      if (k === 'contributions') box.innerHTML = table(['ผู้เล่น', 'ดาเมจ', 'ถูก/ตอบ', 'รอบ', 'Combo', 'Crit', 'โล่', 'CEFR', 'ล่าสุด'], r.rows.map((x) => [x.username, fmt(x.damage), `${x.correct}/${x.answered}`, x.rounds, x.best_combo, x.crits, x.shield_hits, x.cefr, dt(x.last_at)]));
      else if (k === 'damage-log') box.innerHTML = table(['#', 'ผู้เล่น', 'ดาเมจ', 'ชนิด', 'คำถาม', 'เวลาตอบ (ms)', 'HP หลัง', 'Phase', 'เวลา'], r.rows.map((x) => [x.id, x.username, x.amount, x.kind, x.qtype, x.answer_ms, fmt(x.hp_after), x.phase, dt(x.created_at)]));
      else if (k === 'suspicious') box.innerHTML = table(['ผู้เล่น', 'ตอบ', 'ถูก', 'ตอบเร็วผิดปกติ', 'มัธยฐานเวลาตอบ (ms)'], r.rows.map((x) => [x.username, x.answers, x.correct, x.too_fast, x.median_ms]));
    } catch (e) { box.innerHTML = `<p class="form-error">${esc(e.message)}</p>`; }
  }
  document.addEventListener('submit', async (e) => {
    const f = e.target.closest('#admin-raid-root form'); if (!f) return;
    e.preventDefault();
    const fd = new FormData(f); const reason = String(fd.get('reason') || '').trim();
    try {
      if (f.dataset.ra === 'settings') {
        const patch = { enabled: f.querySelector('[name="enabled"]').checked, playerHpOn: f.querySelector('[name="playerHpOn"]').checked, questionMode: fd.get('questionMode'), seasonalSkin: fd.get('seasonalSkin'), forcedFamily: fd.get('forcedFamily') || null, nextLevel: fd.get('nextLevel') ? Number(fd.get('nextLevel')) : null };
        NUM.forEach(([k]) => { const v = fd.get(k); if (v !== '' && Number(v) !== Number(data.settings[k])) patch[k] = Number(v); });
        if (!patch.enabled && data.settings.enabled && !window.confirm('ปิด World Raid ฉุกเฉิน? (ผู้เล่นจะโจมตีไม่ได้จนกว่าจะเปิด · ข้อมูลอยู่ครบ)')) return;
        await app().api('/admin/raid/settings', { method: 'PUT', body: { patch, reason } });
      } else {
        const action = fd.get('action'); const raw = String(fd.get('value') || '').trim();
        await app().api('/admin/raid/boss', { method: 'POST', body: { action, value: action === 'set_family' ? raw : Number(raw), reason } });
      }
      app().toast('บันทึกแล้ว (Audit Log)', 'success');
      load();
    } catch (err) { app().toast(err.message, 'error'); }
  });
  document.addEventListener('click', (e) => { const v = e.target.closest('#admin-raid-root [data-ra-view]'); if (v) view(v.dataset.raView); });
  document.addEventListener('toggle', (e) => { if (e.target.id === 'admin-raid' && e.target.open) load(); }, true);
}());
