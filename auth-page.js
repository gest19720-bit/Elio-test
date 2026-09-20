import { signIn, signUp, redirectIfAuthenticated } from './auth.js';
import { friendlyError } from './supabase.js';

const safeReturnTo = () => {
  const value = new URLSearchParams(location.search).get('return_to') || '';
  return value.startsWith('/') && !value.startsWith('//') ? value : '';
};

const form = document.querySelector('[data-auth-form]');
if (form) {
  if (!safeReturnTo()) redirectIfAuthenticated();
  form.addEventListener('submit', async event => {
    event.preventDefault();
    const button = form.querySelector('button[type="submit"]');
    const message = document.querySelector('[data-message]');
    button.disabled = true; message.textContent = 'Elio is getting things ready…'; message.className = 'auth-message';
    try {
      if (form.dataset.authForm === 'signup') {
        const fullName = form.fullName.value.trim();
        const result = await signUp({ fullName, email: form.email.value.trim(), password: form.password.value });
        if (result.session) window.location.href = 'onboarding.html';
        else { message.textContent = 'Check your email to confirm your account, then sign in to continue.'; button.disabled = false; }
      } else { await signIn(form.email.value.trim(), form.password.value); window.location.href = safeReturnTo() || 'app/dashboard.html'; }
    } catch (error) { message.textContent = friendlyError(error, 'We could not complete that request. Please check your details and try again.'); message.className = 'auth-message'; button.disabled = false; }
  });
}
