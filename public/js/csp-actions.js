(() => {
  'use strict';

  const EVENTS = ['click', 'submit', 'input', 'change', 'keydown', 'mouseover', 'mouseout', 'error'];
  const DATA_PREFIX = 'data-csp-on';

  window.addEventListener('error', (event) => {
    console.warn('[GameGlitz] Unhandled frontend error:', event.error || event.message);
  });

  window.addEventListener('unhandledrejection', (event) => {
    console.warn('[GameGlitz] Unhandled frontend rejection:', event.reason);
  });

  function attrName(eventName) {
    return `${DATA_PREFIX}${eventName}`;
  }

  function toast(type, message) {
    const ggToast = window.GG && window.GG.Toast;
    const fn = ggToast && ggToast[type];
    if (typeof fn === 'function') {
      fn.call(ggToast, message);
      return;
    }
    if (type === 'error') window.alert(message);
  }

  function unescapeJsString(value) {
    return String(value || '')
      .replace(/\\'/g, "'")
      .replace(/\\"/g, '"')
      .replace(/\\n/g, '\n')
      .replace(/\\u2713/g, '✓');
  }

  function getPath(path) {
    return String(path || '').split('.').reduce((obj, key) => (obj ? obj[key] : undefined), window);
  }

  function splitArgs(raw) {
    const args = [];
    let current = '';
    let quote = '';
    let depth = 0;

    for (let i = 0; i < raw.length; i += 1) {
      const ch = raw[i];
      const prev = raw[i - 1];
      if (quote) {
        current += ch;
        if (ch === quote && prev !== '\\') quote = '';
        continue;
      }
      if (ch === "'" || ch === '"') {
        quote = ch;
        current += ch;
        continue;
      }
      if (ch === '(' || ch === '[' || ch === '{') depth += 1;
      if (ch === ')' || ch === ']' || ch === '}') depth -= 1;
      if (ch === ',' && depth === 0) {
        args.push(current.trim());
        current = '';
        continue;
      }
      current += ch;
    }

    if (current.trim()) args.push(current.trim());
    return args;
  }

  function parseArg(raw, el, event) {
    const value = String(raw || '').trim();
    const quoted = value.match(/^(['"])([\s\S]*)\1$/);
    if (quoted) return unescapeJsString(quoted[2]);
    if (value === 'this') return el;
    if (value === 'event') return event;
    if (value === 'this.value') return el.value;
    if (value === 'true') return true;
    if (value === 'false') return false;
    if (/^-?\d+(\.\d+)?$/.test(value)) return Number(value);

    const dataset = value.match(/^this\.dataset\.([a-zA-Z0-9_$-]+)$/);
    if (dataset) return el.dataset[dataset[1]];

    return value;
  }

  function callFunction(path, rawArgs, el, event) {
    const fn = getPath(path);
    if (typeof fn !== 'function') return undefined;
    const ownerPath = path.split('.').slice(0, -1).join('.');
    const owner = ownerPath ? getPath(ownerPath) : window;
    const args = splitArgs(rawArgs).map((arg) => parseArg(arg, el, event));
    return fn.apply(owner || window, args);
  }

  function applyAssignments(action, el) {
    const textMatch = action.match(/this\.textContent\s*=\s*'((?:\\'|[^'])*)'/);
    if (textMatch) el.textContent = unescapeJsString(textMatch[1]);

    if (/this\.disabled\s*=\s*true/.test(action)) el.disabled = true;

    const opacity = action.match(/this\.style\.opacity\s*=\s*'([^']+)'/);
    if (opacity) el.style.opacity = opacity[1];

    const transform = action.match(/this\.style\.transform\s*=\s*'([^']+)'/);
    if (transform) el.style.transform = transform[1];
  }

  function handleToastAction(action) {
    const toastMatch = action.match(/(?:window\.GG&&GG\.Toast\)?|GG\.Toast)\.?(info|success|error)\('((?:\\'|[^'])*)'\)/);
    if (!toastMatch) return false;
    toast(toastMatch[1], unescapeJsString(toastMatch[2]));
    return true;
  }

  function handleEmailSubscribe(el, action) {
    if (!/previousElementSibling|cta-input/.test(action)) return false;

    const input = /cta-input/.test(action)
      ? el.parentElement?.querySelector('.cta-input')
      : el.previousElementSibling;
    const email = String(input?.value || '').trim();
    const valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

    if (!valid) {
      toast('error', /studio email/.test(action) ? 'Please enter a valid studio email.' : 'Please enter a valid email.');
      return true;
    }

    if (input) input.value = '';
    el.disabled = true;
    el.style.opacity = '0.6';
    el.textContent = /Applied/.test(action) || /Application submitted/.test(action) ? 'Applied ✓' : 'Subscribed ✓';
    toast('success', /Application submitted/.test(action)
      ? 'Application submitted! We will contact you soon.'
      : (/notified/.test(action) ? "You'll be notified when esports events are announced!" : 'You are now subscribed!'));
    return true;
  }

  function handleSpecialClick(el, event, action) {
    if (action.includes('saleToggle') && action.includes('filterBar')) {
      event.preventDefault();
      document.getElementById('saleToggle')?.click();
      document.getElementById('filterBar')?.scrollIntoView({ behavior: 'smooth' });
      return true;
    }

    const hideById = action.match(/document\.getElementById\('([^']+)'\)\.style\.display\s*=\s*'none'/);
    if (hideById) {
      const target = document.getElementById(hideById[1]);
      if (target) target.style.display = 'none';
      return true;
    }

    if (action === 'window.print()') {
      window.print();
      return true;
    }

    if (action === 'window.location.reload()') {
      window.location.reload();
      return true;
    }

    if (action.startsWith('window.scrollTo(')) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return true;
    }

    if (action.includes("window.location.href='account.html'")) {
      handleToastAction(action);
      window.setTimeout(() => { window.location.href = 'account.html'; }, 1000);
      return true;
    }

    if (handleEmailSubscribe(el, action)) return true;

    if (handleToastAction(action)) {
      applyAssignments(action, el);
      return true;
    }

    return false;
  }

  function handleKeydown(el, event, action) {
    const guarded = action.match(/^if\(event\.key===('Enter'|"Enter")(?:\|\|event\.key===(' '|"\s"))?\)([\w$.]+)\(([\s\S]*)\)$/);
    if (guarded) {
      const wantsSpace = !!guarded[2];
      if (event.key !== 'Enter' && !(wantsSpace && event.key === ' ')) return undefined;
      event.preventDefault();
      return callFunction(guarded[3], guarded[4], el, event);
    }
    return runAction(el, event, action);
  }

  function handleHover(el, action) {
    if (/borderColor='var\(--border-glow\)'/.test(action)) {
      el.style.borderColor = 'var(--border-glow)';
      el.style.boxShadow = 'var(--shadow-glow)';
      return true;
    }
    if (/borderColor='var\(--border-default\)'/.test(action)) {
      el.style.borderColor = 'var(--border-default)';
      el.style.boxShadow = 'none';
      return true;
    }
    if (/translateY\(-1px\)/.test(action)) {
      el.style.transform = 'translateY(-1px)';
      return true;
    }
    if (/this\.style\.transform='none'/.test(action)) {
      el.style.transform = 'none';
      return true;
    }
    return false;
  }

  function handleError(el, action) {
    const src = action.match(/this\.src\s*=\s*'([^']+)'/);
    if (src && el.getAttribute('src') !== src[1]) {
      el.removeAttribute(attrName('error'));
      el.removeAttribute('onerror');
      el.src = src[1];
      return true;
    }

    if (/this\.style\.display\s*=\s*'none'/.test(action)) {
      el.style.display = 'none';
      return true;
    }

    const ownBackground = action.match(/this\.style\.background\s*=\s*'([^']+)'/);
    if (ownBackground) {
      el.style.background = ownBackground[1];
      return true;
    }

    const parentBackground = action.match(/this\.parentElement\.style\.background\s*=\s*'([^']+)'/);
    if (parentBackground && el.parentElement) {
      el.parentElement.style.background = parentBackground[1];
      return true;
    }

    const placeholder = action.match(/class=\\?'([^'\\]+)\\?'/);
    if (placeholder) {
      const div = document.createElement('div');
      div.className = placeholder[1];
      div.textContent = '🎮';
      if (/outerHTML/.test(action)) el.replaceWith(div);
      else if (el.parentElement) el.parentElement.replaceChildren(div);
      return true;
    }

    return false;
  }

  function runAction(el, event, rawAction) {
    const action = String(rawAction || '').trim().replace(/^return\s+/, '').replace(/;$/, '');
    const shouldPrevent = /return\s+false;?$/.test(rawAction);

    if (event.type === 'error') return handleError(el, action);
    if (event.type === 'mouseover' || event.type === 'mouseout') return handleHover(el, action);
    if (event.type === 'keydown') return handleKeydown(el, event, action);
    if (event.type === 'click' && handleSpecialClick(el, event, action)) return shouldPrevent ? false : true;

    const fnCall = action.match(/^([\w$.]+)\(([\s\S]*)\)$/);
    if (fnCall) {
      const result = callFunction(fnCall[1], fnCall[2], el, event);
      return shouldPrevent ? false : result;
    }

    if (handleToastAction(action)) {
      applyAssignments(action, el);
      return shouldPrevent ? false : true;
    }

    if (shouldPrevent) return false;
    return undefined;
  }

  function findActionTarget(start, eventName) {
    const data = attrName(eventName);
    const legacy = `on${eventName}`;
    let node = start;

    while (node && node.nodeType === 1) {
      const action = node.getAttribute(data) || node.getAttribute(legacy);
      if (action) return { element: node, action, hadLegacy: node.hasAttribute(legacy) };
      node = node.parentElement;
    }

    return null;
  }

  function convertElementHandlers(el) {
    if (!el || el.nodeType !== 1) return;
    for (const eventName of EVENTS) {
      const legacy = `on${eventName}`;
      const data = attrName(eventName);
      if (el.hasAttribute(legacy) && !el.hasAttribute(data)) {
        el.setAttribute(data, el.getAttribute(legacy));
        el.removeAttribute(legacy);
      }
    }
  }

  function convertInlineHandlers(root) {
    const selector = EVENTS.map((eventName) => `[on${eventName}]`).join(',');
    if (root.nodeType === 1) convertElementHandlers(root);
    root.querySelectorAll?.(selector).forEach(convertElementHandlers);
  }

  function handleEvent(event) {
    const match = findActionTarget(event.target, event.type);
    if (!match) return;

    if (match.hadLegacy) {
      convertElementHandlers(match.element);
      event.stopPropagation();
    }

    const result = runAction(match.element, event, match.action);
    if (result === false || /return\s+false;?$/.test(match.action)) {
      event.preventDefault();
    }
  }

  for (const eventName of EVENTS) {
    document.addEventListener(eventName, handleEvent, eventName === 'error' || eventName === 'click');
  }

  const startObserver = () => {
    convertInlineHandlers(document);
    new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        mutation.addedNodes.forEach((node) => convertInlineHandlers(node));
      }
    }).observe(document.documentElement, { childList: true, subtree: true });
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', startObserver, { once: true });
  } else {
    startObserver();
  }
})();
