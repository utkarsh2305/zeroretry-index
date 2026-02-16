/**
 * Welcome Page — Interactive onboarding demo for ZeroRetry Index
 * Shows a browser mockup with a simulated AI chat and the ZeroRetry sidebar
 */

// ============================================================================
// Color Palette
// ============================================================================

const C = {
  // Chrome browser frame
  chrome: '#202124',
  chromeLight: '#292B2E',
  chromeBorder: '#3C3E42',
  tab: '#292B2E',
  tabActive: '#35363A',
  urlBar: '#35363A',

  // Text
  white: '#E8EAED',
  muted: '#9AA0A6',
  dim: '#5F6368',

  // Accent (ZeroRetry green)
  accent: '#6EE7B7',
  accentDim: '#34D399',
  accentGlow: 'rgba(110,231,183,0.12)',

  // Surfaces
  surface: '#16161A',
  surfaceHover: '#1E1E24',
  border: '#2A2A32',
  bg: '#0D0D0F',

  // Text variants
  text: '#E4E4E7',
  textMuted: '#71717A',

  // Chat page colors
  chatBg: '#343541',
  chatUserBg: '#343541',
  chatAiBg: '#444654',
  chatSidebarBg: '#202123',

  // Sidebar
  sidebarBg: '#ffffff',
  sidebarBorder: '#e5e7eb',
  sidebarText: '#111827',
  sidebarMuted: '#6b7280',
  sidebarAccent: '#2563eb',

  // Highlights
  highlight: 'rgba(37, 99, 235, 0.12)',
  starActive: '#f59e0b',
  starInactive: '#d1d5db',
};

// ============================================================================
// Types
// ============================================================================

interface Scenario {
  id: number;
  title: string;
  desc: string;
}

interface ChatMsg {
  role: 'user' | 'assistant';
  text: string;
  id: string;
}

// ============================================================================
// Data
// ============================================================================

const SCENARIOS: Scenario[] = [
  {
    id: 0,
    title: 'Browse normally',
    desc: 'When you open any supported AI chat (ChatGPT, Claude, Gemini, etc.), the ZeroRetry Index sidebar automatically appears. It builds a live table of contents from your conversation.',
  },
  {
    id: 1,
    title: 'Navigate with index',
    desc: 'Click any entry in the index to instantly jump to that message in the chat. No more scrolling through long conversations to find what you need.',
  },
  {
    id: 2,
    title: 'Star important messages',
    desc: 'Click the star icon next to any index entry to save it. Starred items persist across sessions and can be organized into projects with tags.',
  },
  {
    id: 3,
    title: 'Continue on another AI',
    desc: 'Expand a saved item to hand off your conversation to a different AI platform. ZeroRetry builds a context prompt and copies it to your clipboard.',
  },
];

const CHAT_MESSAGES: ChatMsg[] = [
  { role: 'user', text: 'Help me design a REST API for a task management app', id: 'msg-1' },
  { role: 'assistant', text: 'I\'d be happy to help you design a REST API for a task management app. Here\'s a comprehensive design:\n\nCore Resources:\n• /api/tasks - CRUD operations for tasks\n• /api/projects - Group tasks into projects\n• /api/users - User management\n\nEach task should have: id, title, description, status, priority, assignee, due_date, created_at, updated_at.', id: 'msg-2' },
  { role: 'user', text: 'What about authentication? Should I use JWT or session-based?', id: 'msg-3' },
  { role: 'assistant', text: 'For a REST API, JWT (JSON Web Tokens) is generally the better choice:\n\n1. Stateless — no server-side session storage needed\n2. Scalable — works across multiple servers\n3. Mobile-friendly — easy to use from any client\n\nImplementation: POST /api/auth/login returns an access token (15min) + refresh token (7 days). Include the access token in the Authorization header.', id: 'msg-4' },
  { role: 'user', text: 'Can you add rate limiting and error handling patterns?', id: 'msg-5' },
  { role: 'assistant', text: 'Absolutely! Here are the key patterns:\n\nRate Limiting:\n• 100 requests/minute for authenticated users\n• 20 requests/minute for public endpoints\n• Return 429 Too Many Requests with Retry-After header\n\nError Response Format:\n{ "error": { "code": "VALIDATION_ERROR", "message": "...", "details": [...] } }\n\nUse standard HTTP status codes: 200, 201, 400, 401, 403, 404, 429, 500.', id: 'msg-6' },
];

// User messages only (for the index)
const USER_MESSAGES = CHAT_MESSAGES.filter(m => m.role === 'user');

// ============================================================================
// State
// ============================================================================

let activeScenario = 0;
let highlightedMsgId: string | null = null;
let starredIds = new Set<string>();
let expandedSavedId: string | null = null;

// ============================================================================
// Utility
// ============================================================================

function el(tag: string, styles?: Record<string, string>, attrs?: Record<string, string>): HTMLElement {
  const e = document.createElement(tag);
  if (styles) Object.assign(e.style, styles);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      e.setAttribute(k, v);
    }
  }
  return e;
}

function text(tag: string, content: string, styles?: Record<string, string>): HTMLElement {
  const e = el(tag, styles);
  e.textContent = content;
  return e;
}

// ============================================================================
// Components
// ============================================================================

function buildTitle(): HTMLElement {
  const container = el('div', {
    textAlign: 'center',
    marginBottom: '20px',
  });

  const logo = el('div', {
    width: '40px',
    height: '40px',
    borderRadius: '10px',
    background: `linear-gradient(135deg, ${C.accent}, ${C.accentDim})`,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '20px',
    fontWeight: '800',
    color: C.bg,
    margin: '0 auto 12px',
  });
  logo.textContent = 'ZR';

  const h1 = text('h1', 'Welcome to ZeroRetry Index', {
    color: C.white,
    fontSize: '22px',
    fontWeight: '700',
    margin: '0 0 6px',
    letterSpacing: '-0.02em',
  });

  const sub = text('p', 'Index, navigate, and continue AI conversations across platforms. Click through the scenarios below.', {
    color: C.muted,
    fontSize: '13px',
    margin: '0',
    maxWidth: '500px',
    lineHeight: '1.5',
  });
  sub.style.margin = '0 auto';

  container.appendChild(logo);
  container.appendChild(h1);
  container.appendChild(sub);
  return container;
}

function buildScenarioButtons(onSelect: (id: number) => void): HTMLElement {
  const container = el('div', {
    display: 'flex',
    gap: '6px',
    marginBottom: '20px',
    flexWrap: 'wrap',
    justifyContent: 'center',
  });

  SCENARIOS.forEach(s => {
    const btn = el('button', {
      padding: '8px 16px',
      background: activeScenario === s.id ? C.accentGlow : C.surface,
      border: `1px solid ${activeScenario === s.id ? C.accentDim : C.border}`,
      borderRadius: '8px',
      cursor: 'pointer',
      color: activeScenario === s.id ? C.accent : C.muted,
      fontSize: '12px',
      fontWeight: '600',
      transition: 'all 0.2s',
      fontFamily: 'inherit',
    });
    btn.textContent = `${s.id + 1}. ${s.title}`;
    btn.addEventListener('click', () => onSelect(s.id));
    btn.addEventListener('mouseenter', () => {
      if (activeScenario !== s.id) btn.style.borderColor = C.dim;
    });
    btn.addEventListener('mouseleave', () => {
      if (activeScenario !== s.id) btn.style.borderColor = C.border;
    });
    container.appendChild(btn);
  });

  return container;
}

function buildChatArea(): HTMLElement {
  const container = el('div', {
    flex: '1',
    overflowY: 'auto',
    display: 'flex',
    flexDirection: 'column',
  });

  CHAT_MESSAGES.forEach(msg => {
    const isHighlighted = highlightedMsgId === msg.id;
    const row = el('div', {
      padding: '16px 20px',
      background: isHighlighted
        ? 'rgba(37, 99, 235, 0.15)'
        : msg.role === 'assistant' ? C.chatAiBg : C.chatUserBg,
      borderLeft: isHighlighted ? '3px solid #2563eb' : '3px solid transparent',
      transition: 'all 0.3s ease',
    });
    row.dataset.msgId = msg.id;

    const inner = el('div', {
      maxWidth: '580px',
      margin: '0 auto',
      display: 'flex',
      gap: '12px',
    });

    // Avatar
    const avatar = el('div', {
      width: '28px',
      height: '28px',
      borderRadius: '4px',
      background: msg.role === 'user' ? '#5436DA' : '#19C37D',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontSize: '12px',
      fontWeight: '700',
      color: '#fff',
      flexShrink: '0',
    });
    avatar.textContent = msg.role === 'user' ? 'U' : 'AI';

    // Content
    const content = el('div', { flex: '1' });
    const label = text('div', msg.role === 'user' ? 'You' : 'ChatGPT', {
      fontSize: '13px',
      fontWeight: '600',
      color: C.white,
      marginBottom: '4px',
    });

    const body = el('div', {
      fontSize: '13px',
      color: '#D1D5DB',
      lineHeight: '1.6',
      whiteSpace: 'pre-wrap',
    });
    body.textContent = msg.text;

    content.appendChild(label);
    content.appendChild(body);
    inner.appendChild(avatar);
    inner.appendChild(content);
    row.appendChild(inner);
    container.appendChild(row);
  });

  return container;
}

function buildSidebar(): HTMLElement {
  const sidebar = el('div', {
    width: '260px',
    background: C.sidebarBg,
    borderLeft: `1px solid ${C.sidebarBorder}`,
    display: 'flex',
    flexDirection: 'column',
    flexShrink: '0',
  });

  // Header
  const header = el('div', {
    padding: '10px 12px',
    borderBottom: `1px solid ${C.sidebarBorder}`,
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  });

  const logoIcon = el('div', {
    width: '20px',
    height: '20px',
    borderRadius: '4px',
    background: `linear-gradient(135deg, ${C.accent}, ${C.accentDim})`,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '9px',
    fontWeight: '800',
    color: C.bg,
  });
  logoIcon.textContent = 'ZR';

  const headerTitle = text('span', 'ZeroRetry Index', {
    fontSize: '13px',
    fontWeight: '600',
    color: C.sidebarText,
  });

  header.appendChild(logoIcon);
  header.appendChild(headerTitle);
  sidebar.appendChild(header);

  // Tabs
  const showSaved = activeScenario >= 2;
  const tabs = el('div', {
    display: 'flex',
    borderBottom: `1px solid ${C.sidebarBorder}`,
  });

  const indexTab = text('div', 'Index', {
    flex: '1',
    padding: '8px 0',
    textAlign: 'center',
    fontSize: '12px',
    fontWeight: '600',
    color: !showSaved ? C.sidebarAccent : C.sidebarMuted,
    borderBottom: !showSaved ? `2px solid ${C.sidebarAccent}` : '2px solid transparent',
    cursor: 'pointer',
  });

  const savedTab = text('div', 'Saved', {
    flex: '1',
    padding: '8px 0',
    textAlign: 'center',
    fontSize: '12px',
    fontWeight: '600',
    color: showSaved ? C.sidebarAccent : C.sidebarMuted,
    borderBottom: showSaved ? `2px solid ${C.sidebarAccent}` : '2px solid transparent',
    cursor: 'pointer',
  });

  tabs.appendChild(indexTab);
  tabs.appendChild(savedTab);
  sidebar.appendChild(tabs);

  // Content area
  const contentArea = el('div', {
    flex: '1',
    overflowY: 'auto',
    padding: '4px 0',
  });

  if (!showSaved) {
    // Index view
    USER_MESSAGES.forEach(msg => {
      const isActive = highlightedMsgId === msg.id;
      const row = el('div', {
        display: 'flex',
        alignItems: 'center',
        padding: '8px 12px',
        gap: '8px',
        cursor: 'pointer',
        background: isActive ? C.highlight : 'transparent',
        transition: 'background 0.15s',
      });

      row.addEventListener('mouseenter', () => {
        if (!isActive) row.style.background = '#f3f4f6';
      });
      row.addEventListener('mouseleave', () => {
        if (!isActive) row.style.background = 'transparent';
      });

      // Message preview
      const preview = text('span', msg.text.substring(0, 40) + (msg.text.length > 40 ? '...' : ''), {
        flex: '1',
        fontSize: '12px',
        color: isActive ? C.sidebarAccent : C.sidebarText,
        fontWeight: isActive ? '600' : '400',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
      });

      // Star button
      const isStarred = starredIds.has(msg.id);
      const star = text('span', isStarred ? '\u2605' : '\u2606', {
        fontSize: '16px',
        color: isStarred ? C.starActive : C.starInactive,
        cursor: 'pointer',
        flexShrink: '0',
        transition: 'color 0.2s',
      });

      if (activeScenario >= 2) {
        star.addEventListener('click', (e) => {
          e.stopPropagation();
          if (starredIds.has(msg.id)) {
            starredIds.delete(msg.id);
          } else {
            starredIds.add(msg.id);
          }
          render();
        });
      }

      row.appendChild(preview);
      row.appendChild(star);

      if (activeScenario >= 1) {
        row.addEventListener('click', () => {
          highlightedMsgId = msg.id;
          render();
          // Scroll chat to the message
          setTimeout(() => {
            const target = document.querySelector(`[data-msg-id="${msg.id}"]`);
            if (target) target.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }, 50);
        });
      }

      contentArea.appendChild(row);
    });
  } else {
    // Saved view
    const savedMsgs = CHAT_MESSAGES.filter(m => starredIds.has(m.id) && m.role === 'user');

    if (savedMsgs.length === 0) {
      const empty = text('div', 'No starred items yet. Click a star in the Index tab to save a message.', {
        padding: '20px 16px',
        textAlign: 'center',
        color: C.sidebarMuted,
        fontSize: '12px',
        lineHeight: '1.5',
      });
      contentArea.appendChild(empty);
    } else {
      savedMsgs.forEach(msg => {
        const isExpanded = expandedSavedId === msg.id;
        const card = el('div', {
          margin: '6px 8px',
          borderRadius: '8px',
          border: `1px solid ${C.sidebarBorder}`,
          overflow: 'hidden',
        });

        // Collapsed row
        const row = el('div', {
          display: 'flex',
          alignItems: 'center',
          padding: '10px 12px',
          gap: '8px',
          cursor: 'pointer',
          background: isExpanded ? '#f9fafb' : 'transparent',
        });

        const preview = text('span', msg.text.substring(0, 35) + '...', {
          flex: '1',
          fontSize: '12px',
          color: C.sidebarText,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        });

        const arrow = text('span', isExpanded ? '\u25B2' : '\u25BC', {
          fontSize: '10px',
          color: C.sidebarMuted,
        });

        row.appendChild(preview);
        row.appendChild(arrow);
        row.addEventListener('click', () => {
          expandedSavedId = isExpanded ? null : msg.id;
          render();
        });

        card.appendChild(row);

        // Expanded view (handoff panel)
        if (isExpanded && activeScenario >= 3) {
          const panel = el('div', {
            padding: '12px',
            background: '#f9fafb',
            borderTop: `1px solid ${C.sidebarBorder}`,
          });

          const label = text('div', 'Continue on:', {
            fontSize: '11px',
            fontWeight: '600',
            color: C.sidebarMuted,
            marginBottom: '8px',
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
          });
          panel.appendChild(label);

          const platforms = [
            { name: 'Claude', icon: 'C', color: '#D97706' },
            { name: 'Gemini', icon: 'G', color: '#4285F4' },
            { name: 'Perplexity', icon: 'P', color: '#1FB8CD' },
          ];

          const btnRow = el('div', {
            display: 'flex',
            gap: '6px',
            flexWrap: 'wrap',
          });

          platforms.forEach(p => {
            const btn = el('button', {
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 10px',
              background: '#ffffff',
              border: `1px solid ${C.sidebarBorder}`,
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '11px',
              fontWeight: '500',
              color: C.sidebarText,
              fontFamily: 'inherit',
              transition: 'all 0.15s',
            });

            const icon = el('span', {
              width: '18px',
              height: '18px',
              borderRadius: '4px',
              background: p.color,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '10px',
              fontWeight: '700',
              color: '#fff',
            });
            icon.textContent = p.icon;

            const nameSpan = document.createElement('span');
            nameSpan.textContent = p.name;

            btn.appendChild(icon);
            btn.appendChild(nameSpan);

            btn.addEventListener('mouseenter', () => {
              btn.style.borderColor = p.color;
              btn.style.background = '#f3f4f6';
            });
            btn.addEventListener('mouseleave', () => {
              btn.style.borderColor = C.sidebarBorder;
              btn.style.background = '#ffffff';
            });
            btn.addEventListener('click', (e) => {
              e.stopPropagation();
              btn.textContent = 'Copied!';
              btn.style.background = C.accentGlow;
              btn.style.borderColor = C.accentDim;
              btn.style.color = '#059669';
              setTimeout(() => render(), 1500);
            });

            btnRow.appendChild(btn);
          });

          panel.appendChild(btnRow);

          const hint = text('div', 'Opens the AI and copies a handoff prompt with your conversation context.', {
            fontSize: '10px',
            color: C.sidebarMuted,
            marginTop: '8px',
            lineHeight: '1.4',
          });
          panel.appendChild(hint);

          card.appendChild(panel);
        }

        contentArea.appendChild(card);
      });
    }
  }

  sidebar.appendChild(contentArea);

  // Supported platforms footer
  const footer = el('div', {
    padding: '8px 12px',
    borderTop: `1px solid ${C.sidebarBorder}`,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '6px',
    flexWrap: 'wrap',
  });

  const footerLabel = text('span', 'Works on:', {
    fontSize: '10px',
    color: C.sidebarMuted,
  });
  footer.appendChild(footerLabel);

  ['ChatGPT', 'Claude', 'Gemini', 'Perplexity', 'Grok', 'Copilot'].forEach(name => {
    const badge = text('span', name, {
      fontSize: '9px',
      padding: '2px 6px',
      borderRadius: '10px',
      background: '#f3f4f6',
      color: C.sidebarMuted,
      fontWeight: '500',
    });
    footer.appendChild(badge);
  });

  sidebar.appendChild(footer);
  return sidebar;
}

function buildBrowserMockup(): HTMLElement {
  const browser = el('div', {
    width: '100%',
    maxWidth: '900px',
    background: C.chrome,
    borderRadius: '12px',
    overflow: 'hidden',
    border: `1px solid ${C.chromeBorder}`,
    boxShadow: '0 24px 60px rgba(0,0,0,0.5)',
    position: 'relative',
  });

  // Tab bar
  const tabBar = el('div', {
    display: 'flex',
    alignItems: 'center',
    background: C.chrome,
    padding: '8px 12px 0',
  });

  // Window controls
  const controls = el('div', {
    display: 'flex',
    gap: '6px',
    marginRight: '16px',
    paddingBottom: '8px',
  });
  ['#FF5F56', '#FFBD2E', '#27C93F'].forEach(color => {
    controls.appendChild(el('div', {
      width: '12px',
      height: '12px',
      borderRadius: '6px',
      background: color,
    }));
  });
  tabBar.appendChild(controls);

  // Active tab
  const activeTab = el('div', {
    padding: '6px 16px 8px',
    background: C.tabActive,
    borderRadius: '8px 8px 0 0',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  });
  const tabIcon = text('span', '\uD83E\uDD16', { fontSize: '13px' });
  const tabLabel = text('span', 'ChatGPT', { color: C.white, fontSize: '12px' });
  const tabClose = text('span', '\u2715', { color: C.dim, fontSize: '12px', cursor: 'pointer' });
  activeTab.appendChild(tabIcon);
  activeTab.appendChild(tabLabel);
  activeTab.appendChild(tabClose);
  tabBar.appendChild(activeTab);

  // Inactive tab
  const inactiveTab = text('div', 'Google Docs', {
    padding: '6px 16px 8px',
    background: 'transparent',
    borderRadius: '8px 8px 0 0',
    color: C.muted,
    fontSize: '12px',
    opacity: '0.6',
  });
  tabBar.appendChild(inactiveTab);

  const newTab = text('div', '+', {
    padding: '6px 8px 8px',
    color: C.dim,
    fontSize: '16px',
    cursor: 'pointer',
  });
  tabBar.appendChild(newTab);
  browser.appendChild(tabBar);

  // URL bar
  const urlBar = el('div', {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    padding: '8px 12px',
    background: C.tabActive,
  });

  const navBtns = el('div', { display: 'flex', gap: '6px' });
  ['\u2190', '\u2192', '\u21BB'].forEach(s => {
    navBtns.appendChild(text('span', s, { color: C.dim, fontSize: '14px' }));
  });
  urlBar.appendChild(navBtns);

  const urlField = el('div', {
    flex: '1',
    padding: '7px 14px',
    background: C.urlBar,
    borderRadius: '20px',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  });
  urlField.appendChild(text('span', '\uD83D\uDD12', { color: C.dim, fontSize: '13px' }));
  urlField.appendChild(text('span', 'chatgpt.com', { color: C.white, fontSize: '13px' }));
  urlBar.appendChild(urlField);

  // Extension icons area
  const extIcons = el('div', {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
  });

  // Filler extension icons
  for (let i = 0; i < 2; i++) {
    extIcons.appendChild(el('div', {
      width: '24px',
      height: '24px',
      borderRadius: '4px',
      background: C.chromeBorder,
      opacity: '0.5',
    }));
  }

  // ZeroRetry extension icon (highlighted)
  const zrIcon = el('div', {
    width: '28px',
    height: '28px',
    borderRadius: '6px',
    background: `linear-gradient(135deg, ${C.accent}, ${C.accentDim})`,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '11px',
    fontWeight: '800',
    color: C.bg,
    position: 'relative',
  });
  zrIcon.textContent = 'ZR';
  extIcons.appendChild(zrIcon);

  // Another filler
  extIcons.appendChild(el('div', {
    width: '24px',
    height: '24px',
    borderRadius: '4px',
    background: C.chromeBorder,
    opacity: '0.5',
  }));

  urlBar.appendChild(extIcons);
  browser.appendChild(urlBar);

  // Page content area (chat + sidebar)
  const pageContent = el('div', {
    height: '380px',
    display: 'flex',
    overflow: 'hidden',
    background: C.chatBg,
  });

  // Chat area
  pageContent.appendChild(buildChatArea());

  // Sidebar
  pageContent.appendChild(buildSidebar());

  browser.appendChild(pageContent);
  return browser;
}

function buildExplanationPanel(): HTMLElement {
  const panel = el('div', {
    marginTop: '20px',
    maxWidth: '900px',
    width: '100%',
    background: C.surface,
    borderRadius: '12px',
    border: `1px solid ${C.border}`,
    padding: '18px 24px',
  });

  const inner = el('div', {
    display: 'flex',
    gap: '12px',
    alignItems: 'flex-start',
  });

  const icon = el('div', {
    width: '28px',
    height: '28px',
    borderRadius: '8px',
    background: C.accentGlow,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: C.accent,
    fontSize: '14px',
    flexShrink: '0',
  });
  icon.textContent = '?';

  const content = el('div');
  const scenario = SCENARIOS[activeScenario];

  content.appendChild(text('div', `${scenario.id + 1}. ${scenario.title}`, {
    color: C.text,
    fontSize: '14px',
    fontWeight: '600',
    marginBottom: '4px',
  }));

  content.appendChild(text('div', scenario.desc, {
    color: C.textMuted,
    fontSize: '13px',
    lineHeight: '1.6',
  }));

  inner.appendChild(icon);
  inner.appendChild(content);
  panel.appendChild(inner);
  return panel;
}

function buildFeatureGrid(): HTMLElement {
  const grid = el('div', {
    marginTop: '12px',
    maxWidth: '900px',
    width: '100%',
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '10px',
  });

  const features = [
    {
      icon: '\uD83C\uDFAF',
      title: 'What it does',
      color: C.accent,
      items: [
        { label: 'Auto-index', desc: 'builds a live TOC from your chat' },
        { label: 'Quick nav', desc: 'click to jump to any message' },
        { label: 'Star & save', desc: 'bookmark key moments across sessions' },
        { label: 'Cross-AI handoff', desc: 'continue conversations on another platform' },
      ],
    },
    {
      icon: '\uD83D\uDE80',
      title: 'Supported platforms',
      color: '#FBBF24',
      items: [
        { label: 'ChatGPT', desc: 'chatgpt.com' },
        { label: 'Claude', desc: 'claude.ai' },
        { label: 'Gemini', desc: 'gemini.google.com' },
        { label: 'Perplexity, Grok, Copilot', desc: 'and more coming' },
      ],
    },
  ];

  features.forEach(feat => {
    const card = el('div', {
      background: C.surface,
      borderRadius: '12px',
      border: `1px solid ${C.border}`,
      padding: '16px 20px',
    });

    const title = text('div', `${feat.icon} ${feat.title}`, {
      color: feat.color,
      fontSize: '12px',
      fontWeight: '700',
      marginBottom: '10px',
      textTransform: 'uppercase',
      letterSpacing: '0.06em',
    });
    card.appendChild(title);

    feat.items.forEach(item => {
      const row = el('div', {
        marginBottom: '4px',
        color: C.textMuted,
        fontSize: '12px',
        lineHeight: '1.7',
      });
      const strong = text('span', item.label, { color: C.text });
      row.appendChild(strong);
      row.appendChild(document.createTextNode(` \u2014 ${item.desc}`));
      card.appendChild(row);
    });

    grid.appendChild(card);
  });

  return grid;
}

// ============================================================================
// Render
// ============================================================================

function render(): void {
  const app = document.getElementById('app');
  if (!app) return;
  app.innerHTML = '';

  // Set defaults based on scenario
  if (activeScenario === 0) {
    highlightedMsgId = null;
    starredIds.clear();
    expandedSavedId = null;
  } else if (activeScenario === 1) {
    starredIds.clear();
    expandedSavedId = null;
  } else if (activeScenario === 2) {
    // Pre-star first message for demo
    if (starredIds.size === 0) {
      starredIds.add('msg-1');
      starredIds.add('msg-5');
    }
    expandedSavedId = null;
  } else if (activeScenario === 3) {
    if (starredIds.size === 0) {
      starredIds.add('msg-1');
      starredIds.add('msg-5');
    }
    expandedSavedId = 'msg-1';
  }

  app.appendChild(buildTitle());
  app.appendChild(buildScenarioButtons((id) => {
    activeScenario = id;
    render();
  }));
  app.appendChild(buildBrowserMockup());
  app.appendChild(buildExplanationPanel());
  app.appendChild(buildFeatureGrid());
}

// ============================================================================
// Init
// ============================================================================

document.addEventListener('DOMContentLoaded', () => {
  render();
});
