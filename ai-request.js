import { supabase } from './supabase-client.js';

const REQUEST_TIMEOUT_MS = 47000;
const inFlight = new Map();

export class ElioAiError extends Error {
  constructor(code = 'AI_UNAVAILABLE', message = 'Elio couldn’t complete that request. Please try again.', retryable = false) {
    super(message);
    this.name = 'ElioAiError';
    this.code = code;
    this.retryable = retryable;
  }
}

const cleanText = (value, max) => String(value || '').trim().replace(/\u0000/g, '').slice(0, max);
const messageForCode = code => ({
  AUTHENTICATION_REQUIRED: 'Your session has expired. Please sign in again.',
  INVALID_INPUT: 'Please check your request and try again.',
  RATE_LIMITED: 'Elio is receiving a lot of requests. Please try again shortly.',
  AI_NOT_CONFIGURED: 'Elio’s AI service is not configured yet.',
  AI_TIMEOUT: 'Elio is taking too long to respond. Please try again.',
  AI_UNAVAILABLE: 'Elio couldn’t complete that request. Please try again.',
  INVALID_AI_RESPONSE: 'Elio couldn’t complete that request. Please try again.'
}[code] || 'Elio couldn’t complete that request. Please try again.');

async function normalizeFailure(error, data) {
  // On non-2xx, supabase.functions.invoke returns the raw Response as
  // error.context with data null — extract its parsed body so the
  // specific code (AI_NOT_CONFIGURED, ONBOARDING_REQUIRED, …) is never
  // lost. Versions that already supply parsed JSON are handled too.
  const contextBody = await responseContextBody(error);
  const body = data?.error || contextBody?.error || (contextBody && typeof contextBody === 'object' ? contextBody : {});
  const status = Number(error?.context?.status || error?.status || data?.status || body?.status || 0);
  const code = typeof body?.code === 'string' ? body.code : status === 401 ? 'AUTHENTICATION_REQUIRED' : status === 400 ? 'INVALID_INPUT' : status === 429 ? 'RATE_LIMITED' : status === 504 ? 'AI_TIMEOUT' : 'AI_UNAVAILABLE';
  return new ElioAiError(code, messageForCode(code), ['AI_UNAVAILABLE', 'AI_TIMEOUT'].includes(code));
}

// error.context is a Response object on current supabase-js; read its
// body once. Falls back to the value itself when a version already
// provides parsed JSON, and to null when the body is gone.
async function responseContextBody(error) {
  const context = error?.context;
  if (!context) return null;
  if (typeof context.json === 'function' && typeof context.bodyUsed === 'boolean') {
    try { return await context.json(); } catch { return null; }
  }
  return context;
}

export function requireText(value, max, label = 'request') {
  const text = cleanText(value, max);
  if (!text) throw new ElioAiError('INVALID_INPUT', `Please enter a ${label}.`);
  if (String(value || '').trim().length > max) throw new ElioAiError('INVALID_INPUT', `Please keep the ${label} under ${max.toLocaleString()} characters.`);
  return text;
}

export async function invokeAi(functionName, body, validate) {
  const key = `${functionName}:${JSON.stringify(body)}`;
  if (inFlight.has(key)) return inFlight.get(key);
  const request = (async () => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const { data, error } = await supabase.functions.invoke(functionName, { body, signal: controller.signal });
      if (error || data?.error) throw await normalizeFailure(error, data);
      return validate(data);
    } catch (error) {
      if (error instanceof ElioAiError) throw error;
      if (error?.name === 'AbortError') throw new ElioAiError('AI_TIMEOUT', messageForCode('AI_TIMEOUT'), true);
      throw await normalizeFailure(error);
    } finally {
      clearTimeout(timeout);
      inFlight.delete(key);
    }
  })();
  inFlight.set(key, request);
  return request;
}
