  // ---------------------------------------------------------------
  // Boot
  // ---------------------------------------------------------------
  async function boot() {
    loadVersion();
    if (!state.token) {
      showAuth();
      return;
    }
    try {
      const { user } = await api('/auth/me');
      state.user = user;
      renderHud();
      showApp();
      loadMap();
    } catch (_err) {
      state.token = null;
      localStorage.removeItem(TOKEN_KEY);
      showAuth();
    }
  }

  async function loadVersion() {
    try {
      const res = await fetch(API + '/health');
      const data = await res.json();
      if (data.version) {
        document.getElementById('version-tag').textContent = `WordQuest v${data.version}`;
      }
    } catch (_err) {
      // ไม่ต้องทำอะไรถ้าดึงเวอร์ชันไม่ได้ ไม่ใช่ส่วนสำคัญของแอป
    }
  }

  boot();
})();
