(function () {
  const render = message => {
    if (document.body.classList.contains('elio-ready')) return;
    document.body.classList.add('elio-ready');
    document.body.innerHTML = `<main class="main-content"><section class="card"><div class="empty"><div class="mascot">e</div><h3>Elio could not start.</h3><p>${message}</p><button class="btn btn-secondary" onclick="location.reload()" style="margin-top:18px">Try again</button></div></section></main>`;
  };

  window.elioBootFailed = error => {
    const detail = error?.message ? ` Startup error: ${error.message}` : '';
    render(`The app module could not load (startup check v4).${detail} Check the browser console if more detail is needed.`);
  };
  window.addEventListener('error', event => {
    if (event.filename && /app\.js|supabase\.js|vendor\/supabase/i.test(event.filename)) window.elioBootFailed(event.error || new Error(event.message || 'The application module failed to execute.'));
  });
  window.addEventListener('unhandledrejection', event => window.elioBootFailed(event.reason || new Error('The application module rejected during startup.')));
  try {
    import(new URL('../js/app.js', window.location.href).href).catch(window.elioBootFailed);
  } catch (error) {
    window.elioBootFailed(error);
  }

  window.setTimeout(() => {
    if (!document.body.classList.contains('elio-ready')) render('Elio is still waiting for its startup code. Check the browser console and Network tab for the first failed request.');
  }, 16000);
}());
