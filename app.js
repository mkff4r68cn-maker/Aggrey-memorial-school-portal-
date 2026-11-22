(() => {
  'use strict';
  const pages = [...document.querySelectorAll('[data-page]')];
  const navTabs = [...document.querySelectorAll('.nav-tab')];
  const menuBtn = document.getElementById('menuBtn');
  const drawer = document.getElementById('drawer');
  const backdrop = document.getElementById('backdrop');
  const closeDrawerBtn = document.getElementById('closeDrawer');
  const installBtn = document.getElementById('installBtn');
  let installPrompt = null;
  let previousFocus = null;

  function goToPage(pageName) {
    const target = pages.find(p => p.dataset.page === pageName);
    if (!target) return;
    pages.forEach(page => {
      const active = page === target;
      page.classList.toggle('active', active);
      page.hidden = !active;
    });
    navTabs.forEach(tab => {
      const active = tab.dataset.go === pageName;
      tab.classList.toggle('selected', active);
      if (active) tab.setAttribute('aria-current', 'page');
      else tab.removeAttribute('aria-current');
    });
    closeDrawer();
    window.scrollTo({ top: 0, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    target.querySelector('h1')?.focus({ preventScroll: true });
  }

  function openDrawer() {
    previousFocus = document.activeElement;
    drawer.classList.add('open');
    drawer.setAttribute('aria-hidden', 'false');
    drawer.removeAttribute('inert');
    backdrop.hidden = false;
    menuBtn.setAttribute('aria-expanded', 'true');
    closeDrawerBtn.focus();
  }
  function closeDrawer() {
    drawer.classList.remove('open');
    drawer.setAttribute('aria-hidden', 'true');
    drawer.setAttribute('inert', '');
    backdrop.hidden = true;
    menuBtn.setAttribute('aria-expanded', 'false');
    if (previousFocus && typeof previousFocus.focus === 'function') previousFocus.focus();
    previousFocus = null;
  }

  document.addEventListener('click', event => {
    const action = event.target.closest('[data-go]');
    if (action) goToPage(action.dataset.go);
  });
  menuBtn.addEventListener('click', () => menuBtn.getAttribute('aria-expanded') === 'true' ? closeDrawer() : openDrawer());
  closeDrawerBtn.addEventListener('click', closeDrawer);
  backdrop.addEventListener('click', closeDrawer);
  document.addEventListener('keydown', event => {
    if (!drawer.classList.contains('open')) return;
    if (event.key === 'Escape') { closeDrawer(); return; }
    if (event.key === 'Tab') {
      const focusable = [...drawer.querySelectorAll("button:not([disabled]), a[href], [tabindex]:not([tabindex='-1'])")];
      if (!focusable.length) return;
      const first = focusable[0], last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
  });
  document.getElementById('year').textContent = new Date().getFullYear();

  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    installPrompt = event;
    installBtn.hidden = false;
  });
  installBtn.addEventListener('click', async () => {
    if (!installPrompt) return;
    installPrompt.prompt();
    await installPrompt.userChoice;
    installPrompt = null;
    installBtn.hidden = true;
  });
  window.addEventListener('appinstalled', () => { installBtn.hidden = true; installPrompt = null; });


  // Student portal: session-based authentication; records are fetched from the server.
  const studentLoginForm = document.getElementById('studentLoginForm');
  const studentDashboard = document.getElementById('studentDashboard');
  const studentLogout = document.getElementById('studentLogout');
  const portalMessage = document.getElementById('portalMessage');
  const changePanel = document.getElementById('passwordChangePanel');
  let csrfToken = '';
  const api = async (path, options = {}) => {
    const headers = { ...(options.headers || {}) };
    if (options.body) headers['Content-Type'] = 'application/json';
    if (options.method && options.method !== 'GET') headers['X-CSRF-Token'] = csrfToken;
    const response = await fetch(path, { credentials: 'same-origin', ...options, headers });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || 'Request failed. Please try again.');
    return payload;
  };
  const getCsrf = async () => { csrfToken = (await api('/api/csrf')).token; };
  const setPortalMessage = (message, isError = false) => { if (!portalMessage) return; portalMessage.textContent = message; portalMessage.classList.toggle('error', isError); };
  const renderRows = (container, rows, emptyText, renderer) => { if (!container) return; container.replaceChildren(); if (!rows?.length) { const p=document.createElement('p'); p.textContent=emptyText; container.append(p); return; } rows.forEach(row=>container.append(renderer(row))); };
  const renderTimetable = rows => renderRows(document.getElementById('studentTimetable'), rows, 'No timetable entries have been published yet.', row => { const div=document.createElement('div'); div.className='portal-data-row'; const days=['','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday']; div.textContent=`${days[Number(row.weekday)]||'Day'} · ${String(row.start_time||'').slice(0,5)}–${String(row.end_time||'').slice(0,5)} · ${String(row.subject||'')}${row.room?' · '+String(row.room):''}`; return div; });
  const renderResults = rows => renderRows(document.getElementById('studentResults'), rows, 'No published results are available yet.', row => { const div=document.createElement('div'); div.className='portal-data-row'; div.textContent=`${String(row.subject||'')} · ${String(row.term||'')} ${String(row.academic_year||'')} · ${row.grade?'Grade '+String(row.grade):(row.score!=null?'Score '+String(row.score):'Pending')}`; return div; });
  const renderAnnouncements = rows => renderRows(document.getElementById('studentAnnouncements'), rows, 'No published announcements at this time.', row => { const div=document.createElement('div'); div.className='portal-data-row'; const title=document.createElement('strong'); title.textContent=String(row.title||''); const body=document.createElement('p'); body.textContent=String(row.body||''); div.append(title,body); return div; });
  const resetPortalToLogin = (message, isError = false) => {
    studentDashboard.hidden = true;
    studentLoginForm.hidden = false;
    studentLoginForm.reset();
    if (changePanel) changePanel.hidden = true;
    setPortalMessage(message, isError);
  };
  const loadDashboard = async () => {
    const me = await api('/api/auth/me');
    if (me.user.role !== 'student') {
      try { await api('/api/auth/logout', { method: 'POST', body: '{}' }); } catch {}
      resetPortalToLogin('This sign-in is for student accounts only.', true);
      return;
    }
    const profile = me.profile || {};
    document.getElementById('studentName').textContent = profile.full_name || me.user.username;
    document.getElementById('studentIdDisplay').textContent = profile.student_id || me.user.username;
    document.getElementById('studentProgrammeDisplay').textContent = [profile.programme, profile.year_group].filter(Boolean).join(' · ') || 'Not set';
    document.getElementById('studentProfileLine').textContent = [profile.house ? 'House ' + profile.house : '', profile.email || ''].filter(Boolean).join(' · ');
    studentLoginForm.hidden = true;
    studentDashboard.hidden = false;
    const passwordResetRequired = Boolean(me.user.passwordResetRequired);
    if (changePanel) changePanel.hidden = !passwordResetRequired;
    setPortalMessage(passwordResetRequired ? 'Please update your temporary password before viewing student records.' : 'Signed in. Your student records are private to your account.');
    if (passwordResetRequired) {
      renderRows(document.getElementById('studentTimetable'), [], 'Change your temporary password to access your timetable.');
      renderRows(document.getElementById('studentResults'), [], 'Change your temporary password to access published results.');
      renderAnnouncements([]);
      return;
    }
    const [tt, rs, an] = await Promise.allSettled([api('/api/student/timetable'), api('/api/student/results'), api('/api/announcements')]);
    renderTimetable(tt.status === 'fulfilled' ? tt.value.entries : []);
    renderResults(rs.status === 'fulfilled' ? rs.value.results : []);
    renderAnnouncements(an.status === 'fulfilled' ? an.value.announcements : []);
    if ([tt, rs, an].some(result => result.status === 'rejected')) setPortalMessage('Signed in. Some student services are temporarily unavailable; try again shortly.', true);
  };
  if (studentLoginForm && studentDashboard) {
    studentLoginForm.addEventListener('submit', async event => {
      event.preventDefault();
      if (!studentLoginForm.reportValidity()) return;
      const username = document.getElementById('studentId').value.trim(), password = document.getElementById('studentPass').value;
      const btn = studentLoginForm.querySelector('button[type="submit"]');
      btn.disabled = true;
      setPortalMessage('Signing in…');
      try {
        await getCsrf();
        const result = await api('/api/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) });
        csrfToken = result.csrfToken;
        await loadDashboard();
      } catch (error) { setPortalMessage(error.message, true); }
      finally { btn.disabled = false; }
    });
    studentLogout?.addEventListener('click', async () => {
      try { await api('/api/auth/logout', { method: 'POST', body: '{}' }); } catch {}
      resetPortalToLogin('You are signed out.');
      document.getElementById('studentId').focus();
      getCsrf().catch(() => {});
    });
    const pwForm = document.getElementById('passwordChangeForm');
    pwForm?.addEventListener('submit', async event => {
      event.preventDefault();
      if (!pwForm.reportValidity()) return;
      const btn = pwForm.querySelector('button');
      btn.disabled = true;
      try {
        await api('/api/auth/change-password', { method: 'POST', body: JSON.stringify({ currentPassword: document.getElementById('currentPassword').value, newPassword: document.getElementById('newPassword').value }) });
        changePanel.hidden = true;
        pwForm.reset();
        setPortalMessage('Password updated successfully. Student services are now available.');
        await loadDashboard();
      } catch (error) { setPortalMessage(error.message, true); }
      finally { btn.disabled = false; }
    });
    // Restore a valid server session when the app is reopened or refreshed.
    getCsrf().then(() => loadDashboard()).catch(error => { if (error.message !== 'Please sign in.') setPortalMessage('Student portal service is unavailable. Please try again later.', true); });
  }
  api('/api/announcements').then(data=>{const section=document.querySelector('#updates .content-card');if(!section||!data.announcements?.length)return;section.replaceChildren();data.announcements.forEach(item=>{const article=document.createElement('article');article.className='portal-data-row';const h=document.createElement('h3');h.textContent=item.title;const p=document.createElement('p');p.textContent=item.body;article.append(h,p);section.append(article);});}).catch(()=>{});
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
  }
})();
