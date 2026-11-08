/* LOGWEAVER Studio — local-first TRPG logbook editor */
(() => {
  'use strict';

  const PRESETS = [
    {id:'classic', name:'클래식 북', desc:'크림빛 종이와 차분한 명조체', paper:'#f4eee6', surface:'#fffaf3', ink:'#403338', muted:'#8b777b', accent:'#a37486', line:'#dfcece', font:'serif', layout:'classic'},
    {id:'night', name:'다크 아카이브', desc:'짙은 자주빛과 고전 기록물', paper:'#25222d', surface:'#302b38', ink:'#eee4ef', muted:'#b5a5b8', accent:'#d2a1c0', line:'#49404f', font:'serif', layout:'classic'},
    {id:'modern', name:'모던 로그', desc:'글 읽기에 집중하는 간결한 편집', paper:'#f1f3f7', surface:'#ffffff', ink:'#273241', muted:'#758092', accent:'#6386ac', line:'#d9dfe7', font:'sans', layout:'minimal'},
    {id:'fantasy', name:'판타지 연대기', desc:'오래된 양피지와 황금 장식', paper:'#e9deca', surface:'#f7edda', ink:'#4f4030', muted:'#8e7c64', accent:'#a47c42', line:'#ccba9a', font:'serif', layout:'classic'},
    {id:'rose', name:'로즈 가든', desc:'로맨틱한 장미빛 편지지', paper:'#f7e9ee', surface:'#fff7f9', ink:'#523a45', muted:'#a28794', accent:'#b16d8d', line:'#ead1dc', font:'serif', layout:'bubble'},
    {id:'forest', name:'포레스트', desc:'따뜻한 녹색의 탐험 기록', paper:'#e9eee4', surface:'#f8faf4', ink:'#354235', muted:'#728072', accent:'#6e8e74', line:'#cdd8cb', font:'serif', layout:'classic'}
  ];
  const FONTS = {
    serif:'Georgia, "Noto Serif KR", "Batang", serif',
    sans:'"Apple SD Gothic Neo", "Malgun Gothic", system-ui, sans-serif',
    rounded:'"Arial Rounded MT Bold", "Apple SD Gothic Neo", "Malgun Gothic", sans-serif'
  };
  const MAX_PREVIEW = 160;
  const byId = id => document.getElementById(id);
  const esc = value => String(value == null ? '' : value).replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const safeColor = (value, fallback) => /^#[0-9a-f]{6}$/i.test(String(value || '')) ? value : fallback;
  const validImage = value => /^data:image\/(?:png|jpeg|jpg|gif|webp);base64,[A-Za-z0-9+/=]+$/i.test(String(value || ''));
  const isPrivateChannel = name => /HO\s*[0-9IVX]+|비밀|사담|secret|private|귓속말|스포|핸드아웃/i.test(String(name));
  const themeById = id => PRESETS.find(t => t.id === id) || PRESETS[0];
  const number = value => Number(value || 0).toLocaleString('ko-KR');
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  function freshProject() {
    return {
      schema:2, title:'새 로그북', subtitle:'우리의 이야기를 기록하다', author:'',
      preface:'', postface:'', coverImage:'',
      preset:'classic', paper:PRESETS[0].paper, accent:PRESETS[0].accent, 
      ink:PRESETS[0].ink, muted:PRESETS[0].muted, surface:PRESETS[0].surface, line:PRESETS[0].line,
      font:'serif', layout:'classic', avatar:46, spacing:19,
      showTime:false, showChannel:false,
      messages:[], images:[], includedChannels:[], channelStyles:{}, chapters:{}, coverObjects:[]
    };
  }

  let project = freshProject();
  let currentPanel = 'templates', previewChannel = '*', previewLimit = MAX_PREVIEW;
  let selectedMessageId = null, selectedCoverId = null, showCover = true;
  let saveTimer = null, toastTimer = null, dbHandle = null, saveBusy = false;

  function toast(message) {
    const el = byId('toast');
    el.textContent = message;
    el.classList.add('visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('visible'), 3500);
  }

  function switchPanel(panel) {
    currentPanel = panel;
    document.querySelectorAll('[data-panel]').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.panel === panel);
    });
    document.querySelectorAll('.side-panel').forEach(el => {
      el.classList.toggle('active', el.id === 'panel-' + panel);
    });
    if (panel === 'cleanup') renderHidden();
    if (panel === 'publish') updateStats();
  }

  function renderPresets() {
    byId('presetGrid').innerHTML = PRESETS.map(t =>
      '<button class="preset-card ' + (project.preset === t.id ? 'active' : '') + '" data-preset="' + t.id + '">' +
      '<span class="preset-art" style="background:' + t.paper + ';color:' + t.ink + '">' +
      '<i style="background:' + t.accent + '"></i><em>Chapter 01</em><i style="background:' + t.line + '"></i></span>' +
      '<span><span class="preset-name">' + esc(t.name) + (project.preset === t.id ? ' ✓' : '') +
      '</span><br><span class="preset-desc">' + esc(t.desc) + '</span></span></button>'
    ).join('');
    byId('presetGrid').querySelectorAll('button').forEach(btn => {
      btn.addEventListener('click', () => applyPreset(btn.dataset.preset));
    });
  }

  function applyPreset(id) {
    const t = themeById(id);
    Object.assign(project, {
      preset:t.id, paper:t.paper, accent:t.accent, ink:t.ink,
      muted:t.muted, surface:t.surface, line:t.line, font:t.font, layout:t.layout,
      avatar:46, spacing:19
    });
    syncDesignInputs();
    renderPresets();
    renderBook();
    markChanged();
    toast(t.name + ' 디자인을 적용했습니다.');
  }

  function cssVars() {
    return [
      '--paper:' + safeColor(project.paper, '#f4eee6'),
      '--surface:' + safeColor(project.surface, '#fffaf2'),
      '--ink:' + safeColor(project.ink, '#403338'),
      '--muted:' + safeColor(project.muted, '#88777b'),
      '--accent:' + safeColor(project.accent, '#a37486'),
      '--line:' + safeColor(project.line, '#ddd0ce'),
      '--font:' + (FONTS[project.font] || FONTS.serif),
      '--avatar:' + clamp(Number(project.avatar) || 46, 28, 78) + 'px',
      '--spacing:' + clamp(Number(project.spacing) || 19, 7, 32) + 'px'
    ].join(';');
  }

  function syncDesignInputs() {
    byId('fontSelect').value = project.font;
    byId('layoutSelect').value = project.layout;
    byId('accentInput').value = safeColor(project.accent, '#a37486');
    byId('paperInput').value = safeColor(project.paper, '#f4eee6');
    byId('accentValue').textContent = project.accent;
    byId('paperValue').textContent = project.paper;
    byId('avatarInput').value = project.avatar;
    byId('spacingInput').value = project.spacing;
    byId('avatarValue').textContent = project.avatar + 'px';
    byId('spacingValue').textContent = project.spacing + 'px';
    byId('timeToggle').checked = !!project.showTime;
    byId('channelToggle').checked = !!project.showChannel;
  }

  function syncProjectInputs() {
    byId('titleInput').value = project.title;
    byId('subtitleInput').value = project.subtitle;
    byId('authorInput').value = project.author;
    byId('prefaceInput').value = project.preface;
    byId('postfaceInput').value = project.postface;
    byId('topProjectName').textContent = project.title || '제목 없음';
    renderCoverObjectEditor();
  }

  function channels() {
    const counts = new Map();
    project.messages.forEach(m => counts.set(m.channel, (counts.get(m.channel) || 0) + 1));
    return [...counts].map(([name, count]) => ({name, count}));
  }

  function includedMessageList() {
    const allowed = new Set(project.includedChannels);
    return project.messages.filter(m => allowed.has(m.channel) && !m.hidden);
  }

  function previewMessageList() {
    const q = byId('searchInput').value.trim().toLowerCase();
    return includedMessageList().filter(m =>
      (previewChannel === '*' || m.channel === previewChannel) &&
      (!q || (m.speaker + ' ' + m.text).toLowerCase().includes(q))
    );
  }

  function channelStyle(name) {
    const custom = project.channelStyles && project.channelStyles[name];
    return custom || (isPrivateChannel(name) ? {mode:'box',color:'#8993a4'} : {mode:'normal',color:'#a37486'});
  }
  function renderChannels() {
    const list = channels();
    byId('channelList').innerHTML = list.length ? list.map(ch =>
      '<label class="channel-item ' + (isPrivateChannel(ch.name) ? 'secret' : '') + '">' +
      '<input type="checkbox" data-channel="' + esc(ch.name) + '" ' +
      (project.includedChannels.includes(ch.name) ? 'checked' : '') + '>' +
      '<span class="channel-name">' + esc(ch.name) + '</span><span class="channel-count">' +
      number(ch.count) + '</span></label>' +
      '<div class="channel-style-controls"><label>표시 <select data-style-channel="' + esc(ch.name) + '">' +
      [['normal','기본 대사'],['box','구분 박스'],['line','왼쪽 색상선'],['muted','차분한 텍스트']].map(v =>
        '<option value="' + v[0] + '"' + (channelStyle(ch.name).mode === v[0] ? ' selected' : '') + '>' + v[1] + '</option>').join('') +
      '</select></label><label>색상 <input type="color" data-color-channel="' + esc(ch.name) + '" value="' +
      safeColor(channelStyle(ch.name).color,'#8993a4') + '"></label></div>'
    ).join('') : '<p class="help-text">로그를 불러오면 채팅 목록이 표시됩니다.</p>';
    byId('channelList').querySelectorAll('input').forEach(input => {
      input.addEventListener('change', () => {
        const c = input.dataset.channel;
        if (input.checked && !project.includedChannels.includes(c)) project.includedChannels.push(c);
        if (!input.checked) project.includedChannels = project.includedChannels.filter(x => x !== c);
        if (previewChannel !== '*' && !project.includedChannels.includes(previewChannel)) previewChannel = '*';
        renderPreviewChannels();
        renderBook();
        markChanged();
      });
    });
    byId('channelList').querySelectorAll('[data-style-channel]').forEach(el => el.addEventListener('change', () => {
      const name = el.dataset.styleChannel;
      project.channelStyles[name] = {mode:el.value,color:channelStyle(name).color};
      renderBook();markChanged();
    }));
    byId('channelList').querySelectorAll('[data-color-channel]').forEach(el => el.addEventListener('input', () => {
      const name = el.dataset.colorChannel;
      project.channelStyles[name] = {mode:channelStyle(name).mode,color:el.value};
      renderBook();markChanged();
    }));
    renderPreviewChannels();
  }

  function renderPreviewChannels() {
    const sel = byId('previewChannel');
    const old = previewChannel;
    sel.innerHTML = '<option value="*">공개할 채팅 전체</option>' +
      channels().filter(c => project.includedChannels.includes(c.name))
        .map(c => '<option value="' + esc(c.name) + '">' + esc(c.name) + '</option>').join('');
    if (![...sel.options].some(o => o.value === old)) previewChannel = '*';
    sel.value = previewChannel;
  }

  function updateStats() {
    const available = includedMessageList();
    const hidden = project.messages.filter(m => m.hidden).length;
    byId('hiddenCount').textContent = number(hidden);
    byId('exportMsgCount').textContent = number(available.length);
    byId('exportChannelCount').textContent = number(project.includedChannels.filter(c => channels().some(ch => ch.name === c)).length);
    byId('messageCount').textContent = project.messages.length ?
      number(available.length) + '개 공개 예정 / ' + number(project.messages.length) + '개 원본' : '아직 불러온 로그가 없습니다.';
    byId('topProjectName').textContent = project.title || '제목 없음';
  }

  function coverHtml(editable) {
    const img = validImage(project.coverImage) ?
      '<img class="cover-image" src="' + esc(project.coverImage) + '" alt="표지 배경">' : '';
    const items = (project.coverObjects || []).map(o => {
      const x = clamp(Number(o.x) || 0, 0, 100);
      const y = clamp(Number(o.y) || 0, 0, 100);
      const size = clamp(Number(o.size) || 28, 12, 110);
      const color = safeColor(o.color, project.accent);
      return '<div class="cover-object ' + (editable && selectedCoverId === o.id ? 'selected' : '') + '" ' +
        (editable ? 'data-cover-id="' + esc(o.id) + '"' : '') +
        ' style="left:' + x + '%;top:' + y + '%;font-size:' + size + 'px;color:' + color +
        ';transform:translate(-50%,-50%)">' + esc(o.text) + '</div>';
    }).join('');
    return '<div class="book-cover">' + img +
      '<span class="cover-kicker">TRPG SESSION ARCHIVE</span>' +
      '<h1 class="cover-title">' + esc(project.title || '제목 없음') + '</h1>' +
      (project.subtitle ? '<p class="cover-subtitle">' + esc(project.subtitle) + '</p>' : '') +
      '<div class="cover-flourish">✦ ─ ✧ ─ ✦</div>' +
      (project.author ? '<div class="cover-author">' + esc(project.author) + '</div>' : '') +
      items + '</div>';
  }

  function imageFor(msg) {
    const src = project.images[msg.icon];
    return validImage(src) ? src : '';
  }

  function messageHtml(m, editable, assetClass) {
    const id = Number(m.id);
    const style = channelStyle(m.channel);
    const mode = ['normal','box','line','muted'].includes(style.mode) ? style.mode : 'normal';
    const accent = safeColor(style.color,'#8993a4');
    if (m.system) {
      return '<div class="log-system channel-mode-' + mode + '" style="--channel-accent:' + accent + '" ' + (editable ? 'data-msg-id="' + id + '"' : '') + '>' + esc(m.text) + '</div>';
    }
    const src = imageFor(m);
    const avatar = assetClass && src ?
      '<span class="log-avatar icon-' + m.icon + '"></span>' :
      '<span class="log-avatar"' + (src ? ' style="background-image:url(&quot;' + src + '&quot;)"' : '') + '>' +
      (src ? '' : '✦') + '</span>';
    const color = safeColor(m.color, project.accent);
    const time = project.showTime && m.time ? '<span class="log-time">' + esc(m.time) + '</span>' : '';
    const channel = project.showChannel ? '<span class="log-channel">' + esc(m.channel) + '</span>' : '';
    return '<article class="log-row channel-mode-' + mode + ' ' + (editable && selectedMessageId === id ? 'is-selected' : '') +
      '" style="--speaker:' + color + ';--channel-accent:' + accent + '" ' + (editable ? 'data-editable="true" data-msg-id="' + id + '"' : '') + '>' +
      avatar + '<div class="log-main"><div class="log-header"><span class="log-name">' +
      esc(m.speaker || '시스템') + '</span>' + time + channel + '</div>' +
      '<div class="log-text">' + esc(m.text) + '</div></div></article>';
  }

  function chapterHtml(text) {
    return '<div class="book-chapter"><span class="chapter-eyebrow">✦ CHAPTER ✦</span>' +
      '<h2 class="chapter-title">' + esc(text) + '</h2><div class="chapter-line"></div></div>';
  }

  function renderBook() {
    const hasMessages = project.messages.length > 0;
    byId('onboarding').hidden = hasMessages;
    byId('bookViewport').hidden = !hasMessages;
    updateStats();
    if (!hasMessages) return;
    const filtered = previewMessageList();
    const shown = filtered.slice(0, previewLimit);
    const rows = shown.map(m =>
      (project.chapters[m.id] ? chapterHtml(project.chapters[m.id]) : '') +
      messageHtml(m, true, false)
    ).join('');
    const markup = '<div class="book-root" id="previewBook" data-layout="' + esc(project.layout) + '" style="' +
      esc(cssVars()) + '">' + (showCover ? coverHtml(true) : '') +
      (showCover && project.preface ? '<div class="book-preface">' + esc(project.preface) + '</div>' : '') +
      '<div class="book-messages">' +
      (rows || '<div class="book-empty">표시할 대사가 없습니다. 채팅 공개 범위나 검색어를 확인해 주세요.</div>') +
      '</div>' + (filtered.length <= previewLimit && project.postface ?
      '<div class="book-postface">' + esc(project.postface) + '</div>' : '') +
      (filtered.length <= previewLimit ? '<div class="book-end">✦ FIN ✦</div>' : '') +
      '</div>';
    byId('bookMount').innerHTML = markup;
    const more = byId('loadMoreBtn');
    more.hidden = filtered.length <= previewLimit;
    if (!more.hidden) more.textContent = '이어서 보기 — ' + number(filtered.length - previewLimit) + '개 남음 ↓';
    byId('bookMount').querySelectorAll('[data-msg-id]').forEach(el => {
      el.addEventListener('click', () => inspectMessage(Number(el.dataset.msgId)));
    });
    initCoverDrag();
  }

  function inspectMessage(id) {
    const m = project.messages.find(x => x.id === id);
    if (!m) return;
    selectedMessageId = id;
    byId('inspectorEmpty').hidden = true;
    byId('inspectorMessage').hidden = false;
    byId('inspector').classList.add('is-open');
    byId('editCharacter').textContent = m.speaker || '시스템 메시지';
    byId('editCharacter').style.color = safeColor(m.color, project.accent);
    byId('editMessageText').value = m.text;
    byId('editMessageChannel').textContent = '채팅: ' + m.channel + (m.time ? ' · ' + m.time : '');
    byId('hideMessageBtn').textContent = m.hidden ? '대사 숨김 해제' : '이 대사 숨기기';
    byId('removeChapterBtn').hidden = !project.chapters[id];
    byId('bookMount').querySelectorAll('.log-row.is-selected').forEach(el => el.classList.remove('is-selected'));
    const row = byId('bookMount').querySelector('.log-row[data-msg-id="' + id + '"]');
    if (row) row.classList.add('is-selected');
  }

  function clearInspector() {
    selectedMessageId = null;
    byId('inspectorEmpty').hidden = false;
    byId('inspectorMessage').hidden = true;
    byId('inspector').classList.remove('is-open');
    byId('bookMount').querySelectorAll('.log-row.is-selected').forEach(el => el.classList.remove('is-selected'));
  }

  function renderHidden() {
    const hidden = project.messages.filter(m => m.hidden);
    byId('hiddenList').innerHTML = hidden.length ? hidden.slice(0, 150).map(m =>
      '<div class="hidden-item"><strong>' + esc(m.speaker || '시스템') + ' · ' + esc(m.channel) +
      '</strong><p>' + esc(m.text.slice(0, 110)) + '</p>' +
      '<button class="btn ghost" data-restore-id="' + m.id + '">↶ 다시 표시</button></div>'
    ).join('') + (hidden.length > 150 ? '<p class="help-text">최근 150개만 표시 중입니다.</p>' : '') :
      '<p class="help-text">아직 숨긴 대사가 없습니다.</p>';
    byId('hiddenList').querySelectorAll('button').forEach(btn =>
      btn.addEventListener('click', () => {
        const msg = project.messages.find(x => x.id === Number(btn.dataset.restoreId));
        if (msg) { msg.hidden = false; markChanged(); renderHidden(); renderBook(); toast('대사를 복원했습니다.'); }
      })
    );
  }

  function renderCoverObjectEditor() {
    const o = project.coverObjects.find(e => e.id === selectedCoverId);
    byId('coverObjectEditor').hidden = !o;
    if (!o) return;
    byId('objectText').value = o.text;
    byId('objectSize').value = o.size;
  }

  function initCoverDrag() {
    const cover = byId('bookMount').querySelector('.book-cover');
    if (!cover) return;
    cover.querySelectorAll('.cover-object').forEach(el => {
      el.addEventListener('pointerdown', ev => {
        const o = project.coverObjects.find(x => x.id === el.dataset.coverId);
        if (!o) return;
        selectedCoverId = o.id;
        switchPanel('cover');
        renderCoverObjectEditor();
        cover.querySelectorAll('.cover-object').forEach(x => x.classList.remove('selected'));
        el.classList.add('selected');
        const rect = cover.getBoundingClientRect();
        const setPos = e => {
          o.x = Math.round(clamp((e.clientX - rect.left) / rect.width * 100, 5, 95) * 10) / 10;
          o.y = Math.round(clamp((e.clientY - rect.top) / rect.height * 100, 5, 95) * 10) / 10;
          el.style.left = o.x + '%'; el.style.top = o.y + '%';
        };
        el.setPointerCapture(ev.pointerId);
        setPos(ev);
        const move = e => setPos(e);
        const stop = () => { el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', stop); el.removeEventListener('pointercancel', stop); markChanged(); };
        el.addEventListener('pointermove', move);
        el.addEventListener('pointerup', stop);
        el.addEventListener('pointercancel', stop);
        ev.preventDefault();
      });
    });
  }

  function createCoverObject(text) {
    const id = 'obj-' + Date.now() + '-' + Math.floor(Math.random() * 9999);
    const o = {id, text, x:50, y:28, size:text === '✦' ? 35 : 23, color:project.accent};
    project.coverObjects.push(o); selectedCoverId = id; showCover = true;
    switchPanel('cover'); renderCoverObjectEditor(); renderBook(); markChanged();
    toast('표지 위에서 장식을 드래그해 보세요.');
  }

  function extractAvatarMap(doc) {
    const styles = [...doc.querySelectorAll('style')].map(x => x.textContent).join('\n');
    const map = new Map();
    const regex = /\.avatar-image-(\d+)\s*\{\s*background-image:\s*url\(\s*["']?(data:image\/(?:png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+)["']?\s*\)/gi;
    let match;
    while ((match = regex.exec(styles)) !== null) map.set(match[1], match[2]);
    return map;
  }

  function textOf(node) {
    if (!node) return '';
    const copy = node.cloneNode(true);
    copy.querySelectorAll('br').forEach(br => br.replaceWith('\n'));
    return copy.textContent.replace(/\r\n/g, '\n').trim();
  }

  function parseLog(html, fallbackChannel, imageIds) {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const avatarMap = extractAvatarMap(doc);
    const assets = new Map();
    const iconId = src => {
      if (!validImage(src)) return -1;
      if (imageIds.has(src)) return imageIds.get(src);
      const index = project.images.length;
      project.images.push(src);
      imageIds.set(src, index);
      return index;
    };
    const resolve = cssId => {
      if (cssId == null || !avatarMap.has(cssId)) return -1;
      if (!assets.has(cssId)) assets.set(cssId, iconId(avatarMap.get(cssId)));
      return assets.get(cssId);
    };
    const result = [];
    const nodes = doc.querySelectorAll('article.message');
    if (nodes.length) {
      nodes.forEach(el => {
        const name = el.querySelector('.speaker');
        const body = el.querySelector('.message-text');
        if (!body) return;
        const channelEl = el.querySelector('.channel-name');
        const channel = (channelEl ? channelEl.textContent : fallbackChannel)
          .trim().replace(/^\[/, '').replace(/\]$/, '') || fallbackChannel || '메인';
        const headerTime = el.querySelector('time.timestamp');
        const avatarEl = el.querySelector('.avatar');
        const avatarClass = avatarEl ? [...avatarEl.classList].find(x => /^avatar-image-\d+$/.test(x)) : null;
        const colorStyle = name ? name.getAttribute('style') || '' : '';
        const color = (colorStyle.match(/--speaker-color\s*:\s*(#[0-9a-f]{6})/i) || [])[1] || project.accent;
        result.push({
          id:result.length, channel, speaker:name ? name.textContent.trim() : '',
          text:textOf(body), color, icon:avatarClass ? resolve(avatarClass.replace('avatar-image-','')) : -1,
          time:headerTime ? headerTime.textContent.trim() : '',
          timestamp:headerTime ? headerTime.getAttribute('datetime') || '' : '',
          system:el.classList.contains('system') || !name, hidden:false
        });
      });
      return result;
    }
    doc.querySelectorAll('p').forEach(el => {
      const n = el.querySelector('.name'), t = el.querySelector('.text');
      if (!n || !t) return;
      result.push({
        id:result.length, channel:fallbackChannel || '메인', speaker:n.textContent.trim(),
        text:textOf(t), color:project.accent, icon:-1, time:'', timestamp:'',
        system:false, hidden:false
      });
    });
    return result;
  }

  function titleFromFilename(name) {
    return name.replace(/^.*[/\\]/, '').replace(/\.(zip|html?|htm)$/i,'')
      .replace(/_html_log(?:\s*\(\d+\))?/i,'').replace(/\[(すべて|전체|all)\]/gi,'')
      .replace(/\s+/g,' ').trim() || '새 로그북';
  }
  function channelFromFilename(name) {
    const m = String(name).match(/\[([^\]]+)\](?:\.html?)?$/i);
    return m ? m[1].trim() : '메인';
  }

  async function handleSourceFiles(files) {
    if (!files.length) return;
    byId('saveStatus').textContent = '로그 분석 중…';
    const htmlFiles = [];
    try {
      for (const file of files) {
        if (/\.zip$/i.test(file.name)) {
          if (!window.JSZip) throw new Error('ZIP 읽기 라이브러리가 로딩되지 않았습니다. 인터넷 연결을 확인해 주세요.');
          const zip = await JSZip.loadAsync(file);
          for (const [name, entry] of Object.entries(zip.files)) {
            if (!entry.dir && /\.html?$/i.test(name) && !name.startsWith('__MACOSX/'))
              htmlFiles.push({name, entry, zip:true});
          }
        } else if (/\.html?$/i.test(file.name)) {
          htmlFiles.push({name:file.name, entry:file, zip:false});
        }
      }
      if (!htmlFiles.length) throw new Error('ZIP 안에서 HTML 로그를 찾지 못했습니다.');
      const aggregate = htmlFiles.find(f => /\[(?:すべて|전체|all)\]/i.test(f.name));
      const chosen = aggregate ? [aggregate] : htmlFiles;
      const next = freshProject();
      next.title = titleFromFilename(aggregate ? aggregate.name : files[0].name);
      project = next;
      const imageIds = new Map(), combined = [];
      for (const file of chosen) {
        const html = file.zip ? await file.entry.async('string') : await file.entry.text();
        const fallback = channelFromFilename(file.name);
        const part = parseLog(html, fallback, imageIds);
        for (const m of part) { m.id = combined.length; combined.push(m); }
      }
      if (!aggregate && chosen.length > 1) {
        combined.forEach((m,i) => m._order = i);
        combined.sort((a,b) => {
          const av = Date.parse(a.timestamp), bv = Date.parse(b.timestamp);
          if (!Number.isFinite(av) || !Number.isFinite(bv)) return a._order - b._order;
          return av - bv || a._order - b._order;
        });
        combined.forEach((m,i) => { m.id = i; delete m._order; });
      }
      if (!combined.length) throw new Error('대사 형식을 읽지 못했습니다. 코코포리아에서 내보낸 HTML인지 확인해 주세요.');
      project.messages = combined;
      project.channelStyles = {};
      project.includedChannels = channels().filter(ch => !isPrivateChannel(ch.name)).map(ch => ch.name);
      selectedMessageId = null; selectedCoverId = null; previewChannel = '*';
      previewLimit = MAX_PREVIEW; showCover = true;
      byId('searchInput').value = '';
      clearInspector();
      syncProjectInputs(); syncDesignInputs(); renderPresets(); renderChannels(); renderBook(); renderHidden();
      markChanged();
      toast(number(combined.length) + '개 대사를 가져왔습니다. ✦');
    } catch (e) {
      console.error(e);
      toast('불러오기 실패: ' + e.message);
      byId('saveStatus').textContent = '오류 발생';
      if (!project.messages.length) { project = freshProject(); renderBook(); }
    }
  }

  function downloadText(content, name, mime) {
    const blob = new Blob([content], {type:mime});
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url; link.download = name.replace(/[\\/:*?"<>|]/g, '_');
    document.body.appendChild(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  function backupProject() {
    downloadText(JSON.stringify(project), (project.title || 'LOGWEAVER') + '_project.json', 'application/json;charset=utf-8');
    toast('편집 프로젝트를 백업했습니다.');
  }

  function validateBackup(raw) {
    if (!raw || !Array.isArray(raw.messages) || !Array.isArray(raw.images)) throw new Error('LOGWEAVER 프로젝트 파일이 아닙니다.');
    const p = Object.assign(freshProject(), raw);
    p.images = raw.images.map(src => validImage(src) ? src : '');
    p.messages = raw.messages.map((m,i) => ({
      id:i, channel:String(m.channel || '메인').slice(0,100),
      speaker:String(m.speaker || '').slice(0,300), text:String(m.text || ''),
      color:safeColor(m.color, '#a37486'),
      icon:Number.isInteger(m.icon) && m.icon >= 0 && m.icon < p.images.length ? m.icon : -1,
      time:String(m.time || ''), timestamp:String(m.timestamp || ''),
      system:!!m.system, hidden:!!m.hidden
    }));
    p.channelStyles = {};
    if (raw.channelStyles && typeof raw.channelStyles === 'object') for (const [name,style] of Object.entries(raw.channelStyles)) {
      if (style && typeof style === 'object') p.channelStyles[String(name).slice(0,100)] = {
        mode:['normal','box','line','muted'].includes(style.mode) ? style.mode : 'normal',
        color:safeColor(style.color,'#8993a4')
      };
    }
    p.chapters = raw.chapters && typeof raw.chapters === 'object' ? raw.chapters : {};
    p.coverObjects = Array.isArray(raw.coverObjects) ? raw.coverObjects.map((o,i) => ({
      id:'obj-' + i, text:String(o.text || '').slice(0,100), x:Number(o.x)||50,y:Number(o.y)||30,
      size:Number(o.size)||25,color:safeColor(o.color,p.accent)
    })) : [];
    p.title = String(raw.title || '새 로그북').slice(0,120);
    p.subtitle = String(raw.subtitle || '').slice(0,2000);
    p.author = String(raw.author || '').slice(0,250);
    p.preface = String(raw.preface || '').slice(0,5000);
    p.postface = String(raw.postface || '').slice(0,5000);
    p.coverImage = validImage(raw.coverImage) ? raw.coverImage : '';
    p.preset = themeById(raw.preset).id;
    p.paper = safeColor(raw.paper, themeById(p.preset).paper);
    p.surface = safeColor(raw.surface, themeById(p.preset).surface);
    p.ink = safeColor(raw.ink, themeById(p.preset).ink);
    p.muted = safeColor(raw.muted, themeById(p.preset).muted);
    p.accent = safeColor(raw.accent, themeById(p.preset).accent);
    p.line = safeColor(raw.line, themeById(p.preset).line);
    p.font = FONTS[raw.font] ? raw.font : 'serif';
    p.layout = ['classic','bubble','minimal'].includes(raw.layout) ? raw.layout : 'classic';
    p.avatar = clamp(Number(raw.avatar)||46,28,78);
    p.spacing = clamp(Number(raw.spacing)||19,7,32);
    p.showTime = !!raw.showTime; p.showChannel = !!raw.showChannel;
    p.includedChannels = Array.isArray(raw.includedChannels) ? raw.includedChannels.map(String) : channels().map(c => c.name);
    return p;
  }

  function acceptBackup(raw) {
    project = validateBackup(raw);
    const existing = new Set(channels().map(x => x.name));
    project.includedChannels = project.includedChannels.filter(x => existing.has(x));
    selectedMessageId = null; selectedCoverId = null; previewChannel = '*';
    previewLimit = MAX_PREVIEW; showCover = true;
    byId('searchInput').value = '';
    clearInspector(); syncProjectInputs(); syncDesignInputs(); renderPresets();
    renderChannels(); renderBook(); renderHidden(); markChanged();
  }

  async function restoreFile(file) {
    try {
      const raw = JSON.parse(await file.text());
      acceptBackup(raw); toast('프로젝트를 불러왔습니다.');
    } catch (e) { toast('복원 실패: ' + e.message); }
  }

  function exportHTML() {
    if (!project.messages.length) return toast('먼저 로그 파일을 불러와 주세요.');
    const rows = includedMessageList();
    if (!rows.length) return toast('내보낼 공개 대사가 없습니다. 채팅 범위를 확인해 주세요.');
    const icons = new Set(rows.filter(m => imageFor(m)).map(m => m.icon));
    const iconStyles = [...icons].map(id =>
      '.book-root .icon-' + id + '{background-image:url("' + project.images[id] + '")}'
    ).join('\n');
    const bookCss = byId('book-style').textContent.replace(/<\/style/gi,'');
    const sharedCss = '*{box-sizing:border-box}body{margin:0;background:#201e24;font-family:system-ui,sans-serif}' +
      '.share-toolbar{display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;padding:12px 20px;background:#26212b;color:#f0dfeb;font-size:12px;position:sticky;top:0;z-index:3}' +
      '.share-toolbar button{background:#ac7898;border:0;border-radius:7px;padding:8px 13px;color:#261b27;cursor:pointer}' +
      '.share-container{max-width:900px;margin:28px auto;box-shadow:0 18px 75px #0005}' +
      '@media(max-width:950px){.share-container{margin:0 auto}}@media print{body{background:#fff}.share-toolbar{display:none}.share-container{margin:0;box-shadow:none;max-width:none}}';
    const content = rows.map(m => (project.chapters[m.id] ? chapterHtml(project.chapters[m.id]) : '') + messageHtml(m,false,true)).join('');
    const html = '<!doctype html><html lang="ko"><head><meta charset="utf-8">' +
      '<meta name="viewport" content="width=device-width, initial-scale=1">' +
      '<title>' + esc(project.title || 'LOGWEAVER') + '</title><style>' + bookCss + '\n' +
      sharedCss + '\n' + iconStyles + '</style></head><body>' +
      '<div class="share-toolbar"><span>✦ ' + esc(project.title) +
      ' · LOGWEAVER</span><button onclick="window.print()">인쇄 / PDF 저장</button></div>' +
      '<main class="share-container"><div class="book-root" data-layout="' + esc(project.layout) +
      '" style="' + esc(cssVars()) + '">' + coverHtml(false) +
      (project.preface ? '<div class="book-preface">' + esc(project.preface) + '</div>' : '') +
      '<div class="book-messages">' + content + '</div>' +
      (project.postface ? '<div class="book-postface">' + esc(project.postface) + '</div>' : '') +
      '<div class="book-end">✦ FIN ✦</div></div></main></body></html>';
    downloadText(html, (project.title || 'LOGWEAVER') + '_logbook.html', 'text/html;charset=utf-8');
    toast(number(rows.length) + '개 공개 대사만 포함해 HTML을 저장했습니다.');
  }

  function markChanged() {
    byId('saveStatus').textContent = '저장 대기 중…';
    updateStats();
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => saveProject(), 1100);
  }

  function openDatabase() {
    return new Promise((resolve,reject) => {
      if (!window.indexedDB) return reject(new Error('IndexedDB 지원 안 됨'));
      const req = indexedDB.open('LOGWEAVER_Studio', 1);
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains('projects')) req.result.createObjectStore('projects');
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async function saveProject() {
    if (saveBusy) { clearTimeout(saveTimer); saveTimer = setTimeout(saveProject, 900); return; }
    if (!dbHandle) { byId('saveStatus').textContent = 'JSON 백업 권장'; return; }
    saveBusy = true;
    try {
      await new Promise((resolve,reject) => {
        const tx = dbHandle.transaction('projects','readwrite');
        tx.objectStore('projects').put(project,'current');
        tx.oncomplete = resolve; tx.onerror = () => reject(tx.error);
      });
      byId('saveStatus').textContent = '✓ 자동 저장됨';
    } catch(e) {
      byId('saveStatus').textContent = '저장 실패 · JSON 백업 권장';
      console.warn('Save error', e);
    } finally { saveBusy = false; }
  }

  async function initStorage() {
    try {
      dbHandle = await openDatabase();
      const raw = await new Promise((resolve,reject) => {
        const tx = dbHandle.transaction('projects','readonly');
        const req = tx.objectStore('projects').get('current');
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
      if (raw && Array.isArray(raw.messages) && raw.messages.length) {
        acceptBackup(raw);
        byId('saveStatus').textContent = '✓ 이전 작업 복원됨';
        toast('이전 작업을 이어서 불러왔습니다.');
      } else byId('saveStatus').textContent = '로컬 자동 저장 준비됨';
    } catch (e) {
      byId('saveStatus').textContent = 'JSON 백업 권장';
      console.warn('Local storage unavailable', e);
    }
  }

  function wireEvents() {
    document.querySelectorAll('[data-panel]').forEach(btn =>
      btn.addEventListener('click', () => switchPanel(btn.dataset.panel))
    );
    ['sourceInput','welcomeInput'].forEach(id => byId(id).addEventListener('change', e => {
      handleSourceFiles([...e.target.files]); e.target.value = '';
    }));
    byId('restoreInput').addEventListener('change', e => {
      if (e.target.files[0]) restoreFile(e.target.files[0]);
      e.target.value = '';
    });
    byId('newProjectBtn').addEventListener('click', () => {
      if (!confirm('현재 작업을 새 프로젝트로 바꾸시겠습니까? 먼저 JSON 백업을 권장합니다.')) return;
      project = freshProject(); selectedMessageId = null; selectedCoverId = null;
      previewLimit = MAX_PREVIEW; previewChannel = '*';
      clearInspector(); syncDesignInputs(); syncProjectInputs(); renderPresets();
      renderChannels(); renderBook(); markChanged();
      toast('새 프로젝트를 시작했습니다.');
    });
    ['backupBtn','backupPanelBtn'].forEach(id => byId(id).addEventListener('click',backupProject));
    ['exportBtn','exportPanelBtn'].forEach(id => byId(id).addEventListener('click',exportHTML));
    byId('resetDesignBtn').addEventListener('click', () => applyPreset(project.preset));
    byId('fontSelect').addEventListener('change', e => {project.font=e.target.value;renderBook();markChanged();});
    byId('layoutSelect').addEventListener('change', e => {project.layout=e.target.value;renderBook();markChanged();});
    byId('accentInput').addEventListener('input', e => {project.accent=e.target.value;byId('accentValue').textContent=e.target.value;renderBook();markChanged();});
    byId('paperInput').addEventListener('input', e => {project.paper=e.target.value;byId('paperValue').textContent=e.target.value;renderBook();markChanged();});
    byId('avatarInput').addEventListener('input', e => {project.avatar=Number(e.target.value);byId('avatarValue').textContent=e.target.value+'px';renderBook();markChanged();});
    byId('spacingInput').addEventListener('input', e => {project.spacing=Number(e.target.value);byId('spacingValue').textContent=e.target.value+'px';renderBook();markChanged();});
    byId('timeToggle').addEventListener('change', e => {project.showTime=e.target.checked;renderBook();markChanged();});
    byId('channelToggle').addEventListener('change', e => {project.showChannel=e.target.checked;renderBook();markChanged();});
    const liveFields = {titleInput:'title',subtitleInput:'subtitle',authorInput:'author',prefaceInput:'preface',postfaceInput:'postface'};
    Object.entries(liveFields).forEach(([id,key]) => byId(id).addEventListener('input', e => {
      project[key] = e.target.value; renderBook(); markChanged();
    }));
    byId('coverInput').addEventListener('change', e => {
      const file = e.target.files[0];
      if (!file) return;
      if (!/^image\/(?:png|jpeg|webp|gif)$/.test(file.type)) return toast('PNG, JPG, WEBP, GIF 이미지만 지원합니다.');
      if (file.size > 8*1024*1024) return toast('표지 이미지가 너무 큽니다. 8MB 이하를 선택해 주세요.');
      const reader = new FileReader();
      reader.onload = () => {
        if (!validImage(reader.result)) return toast('지원하지 않는 이미지입니다.');
        project.coverImage = reader.result; renderBook(); markChanged(); toast('표지 이미지를 적용했습니다.');
      };
      reader.readAsDataURL(file); e.target.value = '';
    });
    byId('clearCoverBtn').addEventListener('click', () => {
      project.coverImage=''; renderBook(); markChanged();
    });
    byId('addTextBtn').addEventListener('click', () => createCoverObject('여기에 문구를 입력하세요'));
    byId('addDecoBtn').addEventListener('click', () => createCoverObject('✦'));
    byId('objectText').addEventListener('input', e => {
      const o=project.coverObjects.find(x=>x.id===selectedCoverId);
      if(o){o.text=e.target.value;renderBook();markChanged();}
    });
    byId('objectSize').addEventListener('input', e => {
      const o=project.coverObjects.find(x=>x.id===selectedCoverId);
      if(o){o.size=Number(e.target.value);renderBook();markChanged();}
    });
    byId('removeObjectBtn').addEventListener('click', () => {
      project.coverObjects=project.coverObjects.filter(x=>x.id!==selectedCoverId);
      selectedCoverId=null;renderCoverObjectEditor();renderBook();markChanged();
    });
    byId('publicOnlyBtn').addEventListener('click', () => {
      project.includedChannels=channels().filter(ch=>!isPrivateChannel(ch.name)).map(ch=>ch.name);
      previewChannel='*';renderChannels();renderBook();markChanged();
    });
    byId('allChannelsBtn').addEventListener('click', () => {
      if (!confirm('비밀 HO 및 사담 탭도 포함될 수 있습니다. 모든 채팅을 공개 대상으로 선택하시겠습니까?')) return;
      project.includedChannels=channels().map(ch=>ch.name);
      renderChannels();renderBook();markChanged();
    });
    byId('searchInput').addEventListener('input', () => {previewLimit=MAX_PREVIEW;renderBook();});
    byId('previewChannel').addEventListener('change', e => {previewChannel=e.target.value;previewLimit=MAX_PREVIEW;renderBook();});
    byId('loadMoreBtn').addEventListener('click', () => {previewLimit+=MAX_PREVIEW;renderBook();});
    byId('toggleCoverBtn').addEventListener('click', () => {
      showCover=!showCover;byId('toggleCoverBtn').textContent=showCover?'표지 접기':'표지 펼치기';renderBook();
    });
    byId('saveMessageBtn').addEventListener('click', () => {
      const m=project.messages.find(x=>x.id===selectedMessageId); if(!m)return;
      m.text=byId('editMessageText').value;renderBook();markChanged();toast('대사를 수정했습니다.');
    });
    byId('hideMessageBtn').addEventListener('click', () => {
      const m=project.messages.find(x=>x.id===selectedMessageId); if(!m)return;
      m.hidden=!m.hidden;const wasHidden=m.hidden;
      clearInspector();renderBook();markChanged();toast(wasHidden?'로그북에서 대사를 숨겼습니다.':'대사를 다시 표시합니다.');
    });
    byId('addChapterBtn').addEventListener('click', () => {
      if(selectedMessageId===null)return;
      const v=prompt('이 대사 앞에 표시할 장면 제목을 입력해 주세요.',project.chapters[selectedMessageId]||'새 장면');
      if(v===null)return;
      if(v.trim()) project.chapters[selectedMessageId]=v.trim();
      else delete project.chapters[selectedMessageId];
      renderBook();markChanged();inspectMessage(selectedMessageId);
    });
    byId('removeChapterBtn').addEventListener('click', () => {
      delete project.chapters[selectedMessageId];renderBook();markChanged();inspectMessage(selectedMessageId);
    });
    byId('closeInspectorBtn').addEventListener('click',clearInspector);
  }

  document.addEventListener('DOMContentLoaded', () => {
    wireEvents();syncDesignInputs();syncProjectInputs();renderPresets();renderChannels();renderBook();
    initStorage();
  });
})();