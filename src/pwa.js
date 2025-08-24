import api from './api'

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) outputArray[i] = rawData.charCodeAt(i);
  return outputArray;
}

export async function initPWA(authStore) {
  if (!('serviceWorker' in navigator)) return;
  window.addEventListener('load', async () => {
    try {
      const registration = await navigator.serviceWorker.register('/sw.js');
      console.log('[PWA] Service Worker registered:', registration.scope);

      // 推送通知：仅在已登录的情况下尝试订阅
      if (authStore?.isAuthenticated?.value) {
        await maybeSubscribePush(registration);
      }
    } catch (err) {
      console.warn('[PWA] SW register failed', err);
    }
  });
}

async function maybeSubscribePush(registration) {
  if (!('Notification' in window) || !('PushManager' in window)) return;

  // 如果用户尚未授予权限，尝试请求一次（可根据你的交互策略调整为点击按钮时再请求）
  let permission = Notification.permission;
  if (permission === 'default') {
    try { permission = await Notification.requestPermission(); } catch { /* noop */ }
  }
  if (permission !== 'granted') return;

  try {
    const { data } = await api.get('/push/publicKey');
    const vapidKey = data?.key || import.meta.env.VITE_VAPID_PUBLIC_KEY || '';
    if (!vapidKey) return;

    const existing = await registration.pushManager.getSubscription();
    if (existing) return; // 已订阅

    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidKey)
    });

    await api.post('/push/subscribe', subscription);
    console.log('[PWA] push subscribed');
  } catch (e) {
    console.warn('[PWA] push subscribe failed', e);
  }
}