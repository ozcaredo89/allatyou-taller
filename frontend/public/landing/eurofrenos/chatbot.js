/**
 * Eurofrenos — Asistente Virtual IA (Chatbot de Cotizaciones)
 * Módulo independiente en Vanilla JS para Landing Page (Cero dependencias de framework)
 * Especificación espejo 1:1 con PublicAIChatbot.tsx
 * Cumplimiento: Cloudflare Turnstile (Anti-replay rotation), Ley 1581 de 2012 (Habeas Data)
 */
(function () {
  'use strict';

  // ─── 1. Lectura de Configuración ───────────────────────────────────────────
  const scriptTag = document.currentScript || document.querySelector('script[data-empresa-slug]');
  const config = {
    empresaSlug: scriptTag?.getAttribute('data-empresa-slug') || 'eurofrenos',
    workshopName: scriptTag?.getAttribute('data-workshop-name') || 'Eurofrenos Cali',
    phoneNumber: scriptTag?.getAttribute('data-phone') || '573103793785',
    primaryColor: scriptTag?.getAttribute('data-primary-color') || '#da291c',
    turnstileSiteKey: scriptTag?.getAttribute('data-turnstile-sitekey') || (window.EUROFRENOS_AI_CONFIG?.turnstileSiteKey || ''),
    apiUrl: scriptTag?.getAttribute('data-api-url') || (window.EUROFRENOS_AI_CONFIG?.apiUrl || (
      (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
        ? 'http://localhost:3001/api'
        : 'https://taller.allatyou.com/api'
    ))
  };

  // ─── 2. Estado de la Aplicación ────────────────────────────────────────────
  const state = {
    abierto: false,
    mensajes: [],
    cargando: false,
    leadModalAbierto: false,
    leadLoading: false,
    leadExito: false,
    ultimaCotizacion: '',
    telefonoTaller: config.phoneNumber,
    turnstileWidgetId: null,
    turnstileReady: false
  };

  // ─── 3. Helpers de Formato y Parsers (Spec Mirror de PublicAIChatbot.tsx) ───
  function parsearMensaje(text) {
    const regex = /\[SUGERENCIA:\s*(.*?)\]/g;
    const sugerencias = [];
    const matches = [...text.matchAll(regex)];
    matches.forEach(m => sugerencias.push(m[1].trim()));
    const textoLimpio = text.replace(regex, '').trim();
    return { texto: textoLimpio, sugerencias };
  }

  function generarLinkWA(phone, mensaje) {
    const tel = (phone || config.phoneNumber).replace(/\D/g, '');
    const numCompleto = tel.startsWith('57') ? tel : `57${tel}`;
    return `https://wa.me/${numCompleto}?text=${encodeURIComponent(mensaje)}`;
  }

  function sanitizarHTML(str) {
    const temp = document.createElement('div');
    temp.textContent = str;
    return temp.innerHTML;
  }

  function renderizarTextoConFormato(texto) {
    // Escapar HTML base para prevenir XSS
    let safe = sanitizarHTML(texto);

    // Formato de negritas: **texto**
    safe = safe.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');

    // Detección y resaltado de la Regla de Oro
    const tieneReglaDeOro = safe.includes('⚠️') || safe.toLowerCase().includes('orientativa');

    if (tieneReglaDeOro) {
      const partes = safe.split(/(⚠️[^⚠️]*)/g);
      return partes.map(p => {
        if (p.startsWith('⚠️')) {
          return `<div class="ai-regla-de-oro">${p}</div>`;
        }
        return `<span>${p}</span>`;
      }).join('');
    }

    return safe;
  }

  // ─── 4. Inyección de Estilos CSS ───────────────────────────────────────────
  function inyectarEstilos() {
    if (document.getElementById('ai-chatbot-styles')) return;

    const style = document.createElement('style');
    style.id = 'ai-chatbot-styles';
    style.textContent = `
      :root {
        --ai-primary: ${config.primaryColor};
        --ai-primary-hover: #b91c1c;
        --ai-bg: #ffffff;
        --ai-surface: #f8fafc;
        --ai-slate-800: #1e293b;
        --ai-slate-600: #475569;
        --ai-slate-400: #94a3b8;
        --ai-slate-200: #e2e8f0;
      }

      /* ── FAB Flotante ── */
      .ai-chatbot-fab {
        position: fixed;
        bottom: 28px;
        right: 28px;
        z-index: 1000;
        width: 62px;
        height: 62px;
        border-radius: 50%;
        border: none;
        background: var(--ai-primary);
        color: white;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        box-shadow: 0 10px 32px rgba(218, 41, 28, 0.45);
        transition: transform 0.25s cubic-bezier(0.34, 1.56, 0.64, 1), box-shadow 0.25s ease;
        animation: ai-fab-pulse 2.8s infinite;
      }
      .ai-chatbot-fab:hover {
        transform: scale(1.08);
        box-shadow: 0 14px 40px rgba(218, 41, 28, 0.6);
      }
      .ai-chatbot-fab svg {
        width: 30px;
        height: 30px;
        fill: currentColor;
        transition: transform 0.2s ease;
      }
      .ai-chatbot-fab.abierto svg.ai-icon-chat { display: none; }
      .ai-chatbot-fab.abierto svg.ai-icon-close { display: block; }
      .ai-chatbot-fab:not(.abierto) svg.ai-icon-chat { display: block; }
      .ai-chatbot-fab:not(.abierto) svg.ai-icon-close { display: none; }

      @keyframes ai-fab-pulse {
        0%, 100% { box-shadow: 0 8px 30px rgba(218, 41, 28, 0.4); }
        50% { box-shadow: 0 8px 45px rgba(218, 41, 28, 0.7); }
      }

      .ai-fab-badge {
        position: absolute;
        top: -3px;
        right: -3px;
        background: #0f172a;
        color: #ffffff;
        font-size: 11px;
        font-weight: 800;
        min-width: 22px;
        height: 22px;
        padding: 0 4px;
        border-radius: 11px;
        display: flex;
        align-items: center;
        justify-content: center;
        border: 2px solid #ffffff;
        box-shadow: 0 2px 8px rgba(0,0,0,0.25);
        animation: ai-badge-bounce 1s ease infinite alternate;
      }
      @keyframes ai-badge-bounce {
        from { transform: scale(1); }
        to { transform: scale(1.15); }
      }

      /* ── Ventana del Chatbot ── */
      .ai-chatbot-window {
        position: fixed;
        bottom: 104px;
        right: 28px;
        z-index: 1001;
        width: 390px;
        max-width: calc(100vw - 36px);
        height: 580px;
        max-height: calc(100vh - 130px);
        background: #ffffff;
        border-radius: 24px;
        box-shadow: 0 24px 80px rgba(15, 23, 42, 0.22), 0 4px 20px rgba(0,0,0,0.08);
        display: flex;
        flex-direction: column;
        overflow: hidden;
        transform-origin: bottom right;
        transition: transform 0.28s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.22s ease;
        font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        border: 1px solid rgba(226, 232, 240, 0.8);
      }
      .ai-chatbot-window.ai-cerrado {
        transform: scale(0.65) translateY(30px);
        opacity: 0;
        pointer-events: none;
      }

      /* ── Header ── */
      .ai-header {
        padding: 16px 18px;
        background: linear-gradient(135deg, var(--ai-primary) 0%, #991b1b 100%);
        color: white;
        display: flex;
        align-items: center;
        gap: 12px;
        flex-shrink: 0;
      }
      .ai-header-avatar {
        width: 40px;
        height: 40px;
        background: rgba(255, 255, 255, 0.2);
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 20px;
        flex-shrink: 0;
        border: 1px solid rgba(255, 255, 255, 0.3);
      }
      .ai-header-info { flex: 1; min-width: 0; }
      .ai-header-info h4 {
        margin: 0;
        font-size: 14.5px;
        font-weight: 700;
        font-family: 'Clash Display', 'Inter', sans-serif;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        letter-spacing: 0.2px;
      }
      .ai-header-info p {
        margin: 2px 0 0;
        font-size: 11.5px;
        opacity: 0.9;
        display: flex;
        align-items: center;
        gap: 6px;
      }
      .ai-online-dot {
        width: 8px;
        height: 8px;
        background: #4ade80;
        border-radius: 50%;
        display: inline-block;
        box-shadow: 0 0 6px #4ade80;
        animation: ai-online-blink 2s ease infinite;
      }
      @keyframes ai-online-blink {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.4; }
      }
      .ai-header-close {
        background: rgba(255, 255, 255, 0.15);
        border: none;
        color: white;
        width: 32px;
        height: 32px;
        border-radius: 50%;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 18px;
        transition: background 0.15s, transform 0.15s;
        flex-shrink: 0;
      }
      .ai-header-close:hover {
        background: rgba(255, 255, 255, 0.3);
        transform: scale(1.05);
      }

      /* ── Área de Mensajes ── */
      .ai-messages-area {
        flex: 1;
        overflow-y: auto;
        padding: 18px 14px;
        display: flex;
        flex-direction: column;
        gap: 14px;
        background: #f8fafc;
        scroll-behavior: smooth;
      }
      .ai-messages-area::-webkit-scrollbar { width: 5px; }
      .ai-messages-area::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 3px; }

      .ai-msg {
        display: flex;
        align-items: flex-end;
        gap: 8px;
        max-width: 100%;
      }
      .ai-msg-user { flex-direction: row-reverse; }
      .ai-msg-bot { flex-direction: row; }

      .ai-msg-avatar {
        width: 30px;
        height: 30px;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 14px;
        flex-shrink: 0;
        box-shadow: 0 2px 8px rgba(0,0,0,0.12);
        color: white;
        background: var(--ai-primary);
      }
      .ai-msg-avatar-bot {
        background: linear-gradient(135deg, var(--ai-primary) 0%, #991b1b 100%);
      }

      .ai-bubble {
        max-width: 82%;
        padding: 11px 14px;
        border-radius: 18px;
        font-size: 13.5px;
        line-height: 1.5;
        word-break: break-word;
      }
      .ai-bubble-user {
        background: var(--ai-primary);
        color: white;
        border-bottom-right-radius: 4px;
        box-shadow: 0 2px 10px rgba(218, 41, 28, 0.25);
      }
      .ai-bubble-bot {
        background: #ffffff;
        color: #1e293b;
        border-bottom-left-radius: 4px;
        box-shadow: 0 2px 10px rgba(0,0,0,0.06);
        border: 1px solid #e2e8f0;
      }
      .ai-bubble p { margin: 0; white-space: pre-wrap; }

      /* ── Regla de Oro ── */
      .ai-regla-de-oro {
        background: #fffbeb;
        border: 1px solid #fcd34d;
        border-radius: 10px;
        padding: 9px 12px;
        font-size: 12px;
        color: #78350f;
        line-height: 1.45;
        margin-top: 6px;
      }

      /* ── Sugerencias (Chips) ── */
      .ai-sugerencias {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
        margin-top: 10px;
      }
      .ai-sug-btn {
        font-size: 12px;
        padding: 5px 12px;
        border-radius: 20px;
        border: 1.5px solid var(--ai-primary);
        background: #ffffff;
        color: var(--ai-primary);
        cursor: pointer;
        transition: all 0.18s ease;
        font-weight: 600;
        text-align: left;
        line-height: 1.3;
      }
      .ai-sug-btn:hover {
        background: var(--ai-primary);
        color: #ffffff;
        transform: translateY(-1px);
        box-shadow: 0 2px 8px rgba(218, 41, 28, 0.25);
      }

      /* ── Typing Indicator ── */
      .ai-typing {
        display: flex;
        align-items: center;
        gap: 5px;
        padding: 12px 16px;
      }
      .ai-typing span {
        width: 7px;
        height: 7px;
        border-radius: 50%;
        background: var(--ai-primary);
        display: block;
        animation: ai-bounce 1.2s infinite ease-in-out;
      }
      .ai-typing span:nth-child(1) { animation-delay: 0s; }
      .ai-typing span:nth-child(2) { animation-delay: 0.2s; }
      .ai-typing span:nth-child(3) { animation-delay: 0.4s; }
      @keyframes ai-bounce {
        0%, 60%, 100% { transform: translateY(0); opacity: 0.4; }
        30% { transform: translateY(-5px); opacity: 1; }
      }

      /* ── Footer ── */
      .ai-footer {
        padding: 12px 14px;
        background: #ffffff;
        border-top: 1px solid #e2e8f0;
        flex-shrink: 0;
      }
      .ai-footer-actions {
        display: flex;
        gap: 8px;
        margin-bottom: 10px;
      }
      .ai-btn-action {
        flex: 1;
        font-size: 12px;
        font-weight: 700;
        padding: 8px 10px;
        border-radius: 12px;
        border: none;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 6px;
        transition: transform 0.15s, opacity 0.15s;
        text-decoration: none;
      }
      .ai-btn-action:hover {
        transform: translateY(-1px);
        opacity: 0.92;
      }
      .ai-btn-lead-trigger {
        background: #0f172a;
        color: #ffffff;
      }
      .ai-btn-wa-trigger {
        background: #22c55e;
        color: #ffffff;
      }

      .ai-input-form {
        display: flex;
        gap: 8px;
        align-items: center;
      }
      .ai-input-field {
        flex: 1;
        padding: 10px 15px;
        border-radius: 24px;
        border: 1.5px solid #e2e8f0;
        font-size: 13.5px;
        outline: none;
        transition: border-color 0.15s, box-shadow 0.15s;
        background: #f8fafc;
        font-family: inherit;
      }
      .ai-input-field:focus {
        border-color: var(--ai-primary);
        background: #ffffff;
        box-shadow: 0 0 0 3px rgba(218, 41, 28, 0.12);
      }
      .ai-send-btn {
        width: 40px;
        height: 40px;
        border-radius: 50%;
        border: none;
        background: var(--ai-primary);
        color: #ffffff;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 16px;
        transition: transform 0.15s, opacity 0.15s;
        flex-shrink: 0;
      }
      .ai-send-btn:hover:not(:disabled) { transform: scale(1.08); }
      .ai-send-btn:disabled { opacity: 0.45; cursor: not-allowed; }

      .ai-disclaimer {
        text-align: center;
        font-size: 10px;
        color: #94a3b8;
        margin: 6px 0 0;
      }

      /* ── Modal de Leads (Habeas Data) ── */
      .ai-modal-backdrop {
        position: fixed;
        inset: 0;
        background: rgba(15, 23, 42, 0.6);
        z-index: 10005;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 16px;
        backdrop-filter: blur(4px);
        animation: ai-fade-in 0.2s ease;
      }
      @keyframes ai-fade-in { from { opacity: 0; } to { opacity: 1; } }

      .ai-modal-box {
        background: #ffffff;
        border-radius: 22px;
        width: 100%;
        max-width: 420px;
        overflow: hidden;
        box-shadow: 0 28px 70px rgba(0,0,0,0.3);
        position: relative;
        animation: ai-scale-up 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);
        font-family: 'Inter', -apple-system, sans-serif;
      }
      @keyframes ai-scale-up {
        from { transform: scale(0.9); opacity: 0; }
        to { transform: scale(1); opacity: 1; }
      }

      .ai-modal-head {
        padding: 18px 20px;
        background: linear-gradient(135deg, var(--ai-primary) 0%, #991b1b 100%);
        color: #ffffff;
        display: flex;
        align-items: center;
        justify-content: space-between;
      }
      .ai-modal-head h3 {
        margin: 0;
        font-size: 16px;
        font-weight: 700;
        font-family: 'Clash Display', 'Inter', sans-serif;
      }
      .ai-modal-head p { margin: 2px 0 0; font-size: 12px; opacity: 0.9; }

      .ai-modal-close-btn {
        background: rgba(255, 255, 255, 0.2);
        border: none;
        color: #ffffff;
        width: 28px;
        height: 28px;
        border-radius: 50%;
        cursor: pointer;
        font-size: 14px;
        display: flex;
        align-items: center;
        justify-content: center;
      }

      .ai-modal-body {
        padding: 18px 20px 22px;
        display: flex;
        flex-direction: column;
        gap: 12px;
      }
      .ai-form-group {
        display: flex;
        flex-direction: column;
        gap: 4px;
      }
      .ai-form-group label {
        font-size: 12px;
        font-weight: 700;
        color: #475569;
      }
      .ai-form-group input {
        padding: 9px 12px;
        border-radius: 10px;
        border: 1.5px solid #e2e8f0;
        font-size: 13.5px;
        outline: none;
        transition: border-color 0.15s;
        font-family: inherit;
      }
      .ai-form-group input:focus {
        border-color: var(--ai-primary);
      }
      .ai-form-row {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 10px;
      }

      .ai-legal-check {
        display: flex;
        align-items: flex-start;
        gap: 8px;
        font-size: 11.5px;
        color: #475569;
        line-height: 1.4;
        cursor: pointer;
        margin-top: 4px;
      }
      .ai-legal-check input {
        margin-top: 2px;
        flex-shrink: 0;
        accent-color: var(--ai-primary);
      }

      .ai-modal-submit {
        margin-top: 6px;
        padding: 12px;
        border-radius: 12px;
        border: none;
        background: var(--ai-primary);
        color: #ffffff;
        font-size: 14px;
        font-weight: 700;
        cursor: pointer;
        transition: opacity 0.15s, transform 0.15s;
      }
      .ai-modal-submit:hover:not(:disabled) {
        transform: translateY(-1px);
        opacity: 0.95;
      }
      .ai-modal-submit:disabled { opacity: 0.5; cursor: not-allowed; }

      /* ── Hero CTA Especial ── */
      .btn-ai-hero {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        padding: 16px 28px;
        border-radius: 40px;
        font-size: 15px;
        font-weight: 700;
        background: #0f172a;
        color: #ffffff;
        border: 1px solid rgba(255, 255, 255, 0.15);
        cursor: pointer;
        transition: all 0.2s ease;
        box-shadow: 0 4px 16px rgba(15, 23, 42, 0.2);
        font-family: inherit;
      }
      .btn-ai-hero:hover {
        background: var(--ai-primary);
        transform: translateY(-2px);
        box-shadow: 0 8px 24px rgba(218, 41, 28, 0.35);
      }

      /* ── Responsividad en Móvil ── */
      @media (max-width: 460px) {
        .ai-chatbot-window {
          bottom: 0;
          right: 0;
          width: 100vw;
          height: 100dvh;
          max-height: 100dvh;
          max-width: 100vw;
          border-radius: 0;
        }
        .ai-chatbot-fab {
          bottom: 20px;
          right: 20px;
          width: 56px;
          height: 56px;
        }
        .wa-float {
          bottom: 88px !important;
          right: 20px !important;
          width: 56px !important;
          height: 56px !important;
        }
      }
    `;
    document.head.appendChild(style);
  }

  // ─── 5. Gestor de Cloudflare Turnstile Explícito y Resiliente ───────────────
  function montarTurnstileContainer() {
    if (document.getElementById('ai-turnstile-container')) return;
    const div = document.createElement('div');
    div.id = 'ai-turnstile-container';
    div.style.position = 'absolute';
    div.style.left = '-9999px';
    div.style.opacity = '0';
    div.style.pointerEvents = 'none';
    document.body.appendChild(div);
  }

  function inicializarTurnstile() {
    if (!config.turnstileSiteKey) {
      console.warn('[AI Chatbot] Turnstile siteKey no proporcionado. Modo sin Turnstile activo.');
      return;
    }

    montarTurnstileContainer();

    const checkSDK = setInterval(() => {
      if (window.turnstile) {
        clearInterval(checkSDK);
        try {
          state.turnstileWidgetId = window.turnstile.render('#ai-turnstile-container', {
            sitekey: config.turnstileSiteKey,
            size: 'invisible',
            execution: 'execute'
          });
          state.turnstileReady = true;
          console.log('[AI Chatbot] Cloudflare Turnstile inicializado en modo explícito.');
        } catch (err) {
          console.error('[AI Chatbot] Error al renderizar widget Turnstile:', err);
        }
      }
    }, 150);

    // Timeout de 8s para detener el polling del SDK
    setTimeout(() => clearInterval(checkSDK), 8000);
  }

  /**
   * Obtiene un token Turnstile 100% fresco antes de cada petición (anti-replay).
   * Implementa timeout de 8s y captura callbacks de error y expiración.
   */
  function obtenerTokenFresco() {
    return new Promise((resolve) => {
      if (!config.turnstileSiteKey || !window.turnstile || state.turnstileWidgetId === null) {
        resolve(null);
        return;
      }

      let resuelto = false;
      const timeoutId = setTimeout(() => {
        if (!resuelto) {
          resuelto = true;
          console.warn('[AI Turnstile] Timeout (8s) al esperar token fresco.');
          resolve(null);
        }
      }, 8000);

      try {
        window.turnstile.reset(state.turnstileWidgetId);
        window.turnstile.render('#ai-turnstile-container', {
          sitekey: config.turnstileSiteKey,
          size: 'invisible',
          execution: 'execute',
          callback: (token) => {
            if (!resuelto) {
              resuelto = true;
              clearTimeout(timeoutId);
              resolve(token);
            }
          },
          'error-callback': () => {
            if (!resuelto) {
              resuelto = true;
              clearTimeout(timeoutId);
              console.warn('[AI Turnstile] Error callback invocado por Cloudflare.');
              resolve(null);
            }
          },
          'expired-callback': () => {
            if (!resuelto) {
              resuelto = true;
              clearTimeout(timeoutId);
              console.warn('[AI Turnstile] Token expirado antes de uso.');
              resolve(null);
            }
          }
        });
        window.turnstile.execute(state.turnstileWidgetId);
      } catch (e) {
        if (!resuelto) {
          resuelto = true;
          clearTimeout(timeoutId);
          console.error('[AI Turnstile] Excepción al ejecutar challenge:', e);
          resolve(null);
        }
      }
    });
  }

  // ─── 6. Construcción del DOM del Widget ────────────────────────────────────
  let dom = {};

  function construirWidget() {
    inyectarEstilos();

    // 1. FAB
    const fab = document.createElement('button');
    fab.className = 'ai-chatbot-fab';
    fab.setAttribute('aria-label', 'Abrir Asesor Virtual IA');
    fab.setAttribute('title', `Cotiza con ${config.workshopName}`);
    fab.innerHTML = `
      <svg class="ai-icon-chat" viewBox="0 0 24 24">
        <path d="M12 2C6.48 2 2 6.48 2 12c0 1.82.49 3.53 1.34 5L2 22l5.25-1.31C8.68 21.49 10.29 22 12 22c5.52 0 10-4.48 10-10S17.52 2 12 2zm1 14h-2v-2h2v2zm0-4h-2V7h2v5z"/>
      </svg>
      <svg class="ai-icon-close" viewBox="0 0 24 24" style="display:none;">
        <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
      </svg>
      <span class="ai-fab-badge" style="display:none;">1</span>
    `;

    // 2. Ventana de Chat
    const win = document.createElement('div');
    win.className = 'ai-chatbot-window ai-cerrado';
    win.setAttribute('role', 'dialog');
    win.setAttribute('aria-label', `Chat con Asesor Virtual de ${config.workshopName}`);
    win.innerHTML = `
      <div class="ai-header">
        <div class="ai-header-avatar">🔧</div>
        <div class="ai-header-info">
          <h4>Asesor Virtual — ${config.workshopName}</h4>
          <p><span class="ai-online-dot"></span> Cotizaciones orientativas • En línea</p>
        </div>
        <button class="ai-header-close" aria-label="Cerrar chat">✕</button>
      </div>

      <div class="ai-messages-area" role="log" aria-live="polite"></div>

      <div class="ai-footer">
        <div class="ai-footer-actions">
          <button class="ai-btn-action ai-btn-lead-trigger">
            📅 Agendar cita
          </button>
          <a href="${generarLinkWA(config.phoneNumber, 'Hola, me comunico desde su página web para cotizar.')}" target="_blank" rel="noopener noreferrer" class="ai-btn-action ai-btn-wa-trigger">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
            </svg>
            WhatsApp
          </a>
        </div>
        <form class="ai-input-form">
          <input type="text" class="ai-input-field" placeholder="Describe el problema de tu vehículo..." maxlength="500" />
          <button type="submit" class="ai-send-btn" aria-label="Enviar mensaje">➤</button>
        </form>
        <p class="ai-disclaimer">Cotizaciones orientativas · ${config.workshopName} · Powered by IA</p>
      </div>
    `;

    // 3. Modal de Lead
    const modalBackdrop = document.createElement('div');
    modalBackdrop.className = 'ai-modal-backdrop';
    modalBackdrop.style.display = 'none';
    modalBackdrop.innerHTML = `
      <div class="ai-modal-box">
        <div class="ai-modal-head">
          <div>
            <h3>📅 Agendar Cita en Taller</h3>
            <p>${config.workshopName}</p>
          </div>
          <button class="ai-modal-close-btn" aria-label="Cerrar modal">✕</button>
        </div>
        <form class="ai-modal-body">
          <div class="ai-form-group">
            <label>Tu nombre</label>
            <input type="text" name="nombre" placeholder="Ej: Juan García" />
          </div>
          <div class="ai-form-group">
            <label>Teléfono / WhatsApp *</label>
            <input type="tel" name="telefono" placeholder="Ej: 3101234567" required />
          </div>
          <div class="ai-form-row">
            <div class="ai-form-group">
              <label>Marca del vehículo</label>
              <input type="text" name="vehiculo_marca" placeholder="Ej: Chevrolet" />
            </div>
            <div class="ai-form-group">
              <label>Línea / Modelo</label>
              <input type="text" name="vehiculo_linea" placeholder="Ej: Spark 2019" />
            </div>
          </div>
          <label class="ai-legal-check">
            <input type="checkbox" name="acepta_terminos" required />
            <span>
              Autorizo el tratamiento de mis datos personales conforme a la <strong>Ley 1581 de 2012</strong> y la política de privacidad de ${config.workshopName} para ser contactado sobre este servicio. *
            </span>
          </label>
          <button type="submit" class="ai-modal-submit">📞 Solicitar que me contacten</button>
        </form>
      </div>
    `;

    document.body.appendChild(fab);
    document.body.appendChild(win);
    document.body.appendChild(modalBackdrop);

    dom = {
      fab,
      badge: fab.querySelector('.ai-fab-badge'),
      win,
      closeBtn: win.querySelector('.ai-header-close'),
      messagesArea: win.querySelector('.ai-messages-area'),
      form: win.querySelector('.ai-input-form'),
      input: win.querySelector('.ai-input-field'),
      sendBtn: win.querySelector('.ai-send-btn'),
      leadTrigger: win.querySelector('.ai-btn-lead-trigger'),
      modalBackdrop,
      modalBox: modalBackdrop.querySelector('.ai-modal-box'),
      modalCloseBtn: modalBackdrop.querySelector('.ai-modal-close-btn'),
      modalForm: modalBackdrop.querySelector('.ai-modal-body'),
      modalSubmitBtn: modalBackdrop.querySelector('.ai-modal-submit')
    };

    vincularEventos();
    inicializarTurnstile();
  }

  // ─── 7. Renderizado Reactivo de Mensajes y UI ─────────────────────────────
  function scrollAlFinal() {
    if (dom.messagesArea) {
      dom.messagesArea.scrollTop = dom.messagesArea.scrollHeight;
    }
  }

  function renderizarMensajes() {
    if (!dom.messagesArea) return;

    dom.messagesArea.innerHTML = '';

    state.mensajes.forEach(msg => {
      const esUsuario = msg.role === 'user';
      const parsed = parsearMensaje(msg.parts[0]?.text || '');

      const msgDiv = document.createElement('div');
      msgDiv.className = `ai-msg ${esUsuario ? 'ai-msg-user' : 'ai-msg-bot'}`;

      const avatar = document.createElement('div');
      avatar.className = `ai-msg-avatar ${esUsuario ? 'ai-msg-avatar-user' : 'ai-msg-avatar-bot'}`;
      avatar.textContent = esUsuario ? '👤' : '🔧';

      const bubble = document.createElement('div');
      bubble.className = `ai-bubble ${esUsuario ? 'ai-bubble-user' : 'ai-bubble-bot'}`;
      bubble.innerHTML = renderizarTextoConFormato(parsed.texto);

      // Si el bot incluyó sugerencias interactivas
      if (!esUsuario && parsed.sugerencias.length > 0) {
        const sugsDiv = document.createElement('div');
        sugsDiv.className = 'ai-sugerencias';
        parsed.sugerencias.forEach(sug => {
          const btn = document.createElement('button');
          btn.className = 'ai-sug-btn';
          btn.textContent = sug;
          btn.addEventListener('click', () => enviarMensaje(sug));
          sugsDiv.appendChild(btn);
        });
        bubble.appendChild(sugsDiv);
      }

      msgDiv.appendChild(avatar);
      msgDiv.appendChild(bubble);
      dom.messagesArea.appendChild(msgDiv);
    });

    // Indicador de escritura
    if (state.cargando) {
      const typingDiv = document.createElement('div');
      typingDiv.className = 'ai-msg ai-msg-bot';
      typingDiv.innerHTML = `
        <div class="ai-msg-avatar ai-msg-avatar-bot">🔧</div>
        <div class="ai-bubble ai-bubble-bot ai-typing">
          <span></span><span></span><span></span>
        </div>
      `;
      dom.messagesArea.appendChild(typingDiv);
    }

    scrollAlFinal();
  }

  function toggleChat(abrir) {
    state.abierto = typeof abrir === 'boolean' ? abrir : !state.abierto;

    if (state.abierto) {
      dom.win.classList.remove('ai-cerrado');
      dom.fab.classList.add('abierto');
      dom.badge.style.display = 'none';

      // Mensaje de saludo inicial
      if (state.mensajes.length === 0) {
        state.mensajes.push({
          role: 'model',
          parts: [{
            text: `¡Hola! 👋 Soy el Asesor Virtual de **${config.workshopName}**.\n\n¿En qué problema o mantenimiento de tu vehículo te puedo ayudar hoy? Cuéntame los síntomas y te daré una estimación de costos.\n[SUGERENCIA: ¿Cuánto cuesta un cambio de pastillas de freno?]\n[SUGERENCIA: ¿Cuánto vale un cambio de aceite para mi vehículo?]\n[SUGERENCIA: ¿Tienen servicio de scanner computarizado?]`
          }],
          timestamp: new Date()
        });
        renderizarMensajes();
      }

      setTimeout(() => dom.input?.focus(), 300);
    } else {
      dom.win.classList.add('ai-cerrado');
      dom.fab.classList.remove('abierto');
    }
  }

  // ─── 8. Envío de Mensaje con Rotación de Turnstile y Feedback Instantáneo ───
  async function enviarMensaje(texto) {
    if (!texto || !texto.trim() || state.cargando) return;

    const textoLimpio = texto.trim();
    dom.input.value = '';
    dom.input.disabled = true;
    dom.sendBtn.disabled = true;

    // 1. Agregar mensaje del usuario a la UI
    state.mensajes.push({
      role: 'user',
      parts: [{ text: textoLimpio }],
      timestamp: new Date()
    });

    // 2. Feedback instantáneo: activar typing indicator al presionar enviar
    state.cargando = true;
    renderizarMensajes();

    try {
      // 3. Obtener token Turnstile fresco (anti-replay)
      const turnstileToken = await obtenerTokenFresco();

      const headers = { 'Content-Type': 'application/json' };
      if (turnstileToken) {
        headers['cf-turnstile-token'] = turnstileToken;
      }

      // Preparar payload de mensajes sanitizado (máximo 10)
      const payloadMessages = state.mensajes.slice(-10).map(m => ({
        role: m.role,
        parts: m.parts
      }));

      const res = await fetch(`${config.apiUrl}/ai/public/chat`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          empresa_slug: config.empresaSlug,
          messages: payloadMessages,
          cf_turnstile_token: turnstileToken
        })
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `HTTP ${res.status}`);
      }

      const data = await res.json();

      if (data.telefono_taller) {
        state.telefonoTaller = data.telefono_taller;
      }

      // Detectar cotización para ofrecer agendamiento de lead
      const tieneCotizacion = /(\$[\d.,]+|[\d.,]+ COP|costo|valor|estimad)/i.test(data.text || '');
      if (tieneCotizacion) {
        state.ultimaCotizacion = data.text || '';
        if (!state.leadExito) {
          setTimeout(() => {
            if (!state.leadModalAbierto && !state.leadExito) {
              abrirModalLead(true);
            }
          }, 3500);
        }
      }

      state.mensajes.push({
        role: 'model',
        parts: [{ text: data.text || 'No se recibió respuesta.' }],
        timestamp: new Date()
      });

    } catch (err) {
      console.warn('[AI Public Chatbot] Error en petición de chat:', err);

      const msgFallback = `Lo siento, el asistente no está disponible en este momento. 😔\n\nContáctanos directamente al **${state.telefonoTaller}** por WhatsApp o llamada y con gusto te brindamos atención inmediata.`;

      state.mensajes.push({
        role: 'model',
        parts: [{ text: msgFallback }],
        timestamp: new Date()
      });
    } finally {
      state.cargando = false;
      dom.input.disabled = false;
      dom.sendBtn.disabled = false;
      renderizarMensajes();
      dom.input.focus();
    }
  }

  // ─── 9. Captura de Prospectos (Leads - Ley 1581 de 2012) ───────────────────
  function abrirModalLead(abrir) {
    state.leadModalAbierto = abrir;
    dom.modalBackdrop.style.display = abrir ? 'flex' : 'none';
    if (abrir) {
      dom.modalForm.querySelector('input[name="nombre"]')?.focus();
    }
  }

  async function registrarLead(e) {
    e.preventDefault();
    if (state.leadLoading) return;

    const formData = new FormData(dom.modalForm);
    const nombre = formData.get('nombre')?.toString().trim();
    const telefono = formData.get('telefono')?.toString().trim();
    const vehiculo_marca = formData.get('vehiculo_marca')?.toString().trim();
    const vehiculo_linea = formData.get('vehiculo_linea')?.toString().trim();
    const acepta_terminos = formData.get('acepta_terminos') === 'on';

    if (!telefono) {
      alert('Por favor ingresa tu número de teléfono o WhatsApp.');
      return;
    }
    if (!acepta_terminos) {
      alert('Debes autorizar el tratamiento de datos personales para continuar.');
      return;
    }

    state.leadLoading = true;
    dom.modalSubmitBtn.disabled = true;
    dom.modalSubmitBtn.textContent = 'Enviando solicitud...';

    try {
      const ultimoMotivo = state.mensajes.find(m => m.role === 'user')?.parts[0]?.text || 'Cotización desde Landing Page';

      const res = await fetch(`${config.apiUrl}/ai/public/lead`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          empresa_slug: config.empresaSlug,
          nombre: nombre || null,
          telefono,
          vehiculo_marca: vehiculo_marca || null,
          vehiculo_linea: vehiculo_linea || null,
          motivo_consulta: ultimoMotivo,
          cotizacion_estimada: state.ultimaCotizacion.slice(0, 500) || null,
          acepta_terminos: true,
          origen_url: window.location.href
        })
      });

      if (!res.ok) throw new Error('Error al registrar prospecto');

      state.leadExito = true;
      abrirModalLead(false);

      state.mensajes.push({
        role: 'model',
        parts: [{
          text: `✅ ¡Excelente! Hemos registrado tu solicitud de cita. El equipo técnico de **${config.workshopName}** te contactará muy pronto al número **${telefono}**.\n\n¿Tienes alguna otra consulta sobre tu vehículo?`
        }],
        timestamp: new Date()
      });
      renderizarMensajes();

    } catch (err) {
      console.error('[AI Public Lead] Error al registrar lead:', err);
      alert('Hubo un inconveniente al enviar tus datos. Por favor escríbenos directamente por WhatsApp.');
    } finally {
      state.leadLoading = false;
      dom.modalSubmitBtn.disabled = false;
      dom.modalSubmitBtn.textContent = '📞 Solicitar que me contacten';
    }
  }

  // ─── 10. Vinculación de Eventos ───────────────────────────────────────────
  function vincularEventos() {
    dom.fab.addEventListener('click', () => toggleChat());
    dom.closeBtn.addEventListener('click', () => toggleChat(false));

    dom.form.addEventListener('submit', (e) => {
      e.preventDefault();
      enviarMensaje(dom.input.value);
    });

    dom.leadTrigger.addEventListener('click', () => abrirModalLead(true));
    dom.modalCloseBtn.addEventListener('click', () => abrirModalLead(false));
    dom.modalBackdrop.addEventListener('click', (e) => {
      if (e.target === dom.modalBackdrop) abrirModalLead(false);
    });
    dom.modalForm.addEventListener('submit', registrarLead);

    // Escape para cerrar
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        if (state.leadModalAbierto) abrirModalLead(false);
        else if (state.abierto) toggleChat(false);
      }
    });

    // Exponer función global para abrir el chat desde botones de la landing
    window.abrirChatbotIA = function () {
      toggleChat(true);
    };
  }

  // ─── 11. Inicialización Automática en DOM Ready ───────────────────────────
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', construirWidget);
  } else {
    construirWidget();
  }

})();
