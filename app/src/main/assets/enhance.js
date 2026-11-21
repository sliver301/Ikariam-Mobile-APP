/*
 * Ikariam Mobile – page enhancements.
 * Runs inside the game page. It only changes how the page is displayed and how touch
 * input reaches it. It never clicks, sends or loads anything on its own; every action
 * starts from the player's own finger.
 */
(function () {
  'use strict';

  var cfg = window.__ikmCfg || {};
  if (window.__ikm) { window.__ikm.configure(cfg); return; }   // already installed on this page

  var A = window.IkmAndroid || null;            // native bridge
  var GAME_HOST = /^s\d+-[a-z]+\.ikariam\.gameforge\.com$/i.test(location.hostname);
  var api = {};
  window.__ikm = api;

  function first(selectors) {
    for (var i = 0; i < selectors.length; i++) {
      var el = document.querySelector(selectors[i]);
      if (el) return el;
    }
    return null;
  }

  function visible(el) {
    if (!el) return false;
    var r = el.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) return false;
    var s = getComputedStyle(el);
    return s.visibility !== 'hidden' && s.display !== 'none';
  }

  /* ------------------------------------------------------------ fit to screen */

  // The game has no mobile layout. We tell the browser to lay it out at a fixed desktop
  // width and scale that to the phone screen. Smaller width = bigger game on screen.
  function applyViewport() {
    if (!GAME_HOST) return;
    var w = parseInt(cfg.width, 10) || 1100;
    // The game needs 600 px of height. On a wide phone screen, widen the layout just enough
    // that the whole game fits, so nothing is cut off and the frame never has to scroll.
    var aspect = parseFloat(cfg.aspect) || 0;           // app area width / height
    if (aspect > 1) w = Math.max(w, Math.ceil(602 * aspect));
    // Portrait: lay the game out narrower (so it is drawn bigger) with a two-row header.
    var portrait = aspect > 0 ? aspect < 1 : window.innerHeight > window.innerWidth;
    if (portrait) w = parseInt(cfg.portraitWidth, 10) || 660;
    if (!portrait && document.documentElement.classList.contains('ikm-portrait')) { clearShifts(); restoreText(); }
    document.documentElement.classList.toggle('ikm-portrait', portrait);
    var m = document.querySelector('meta[name="viewport"]');
    if (!m) {
      m = document.createElement('meta');
      m.setAttribute('name', 'viewport');
      (document.head || document.documentElement).appendChild(m);
    }
    // Landscape: no page zoom at all, the frame always stays as is.
    // Portrait: two-finger zoom allowed (never smaller than the full screen). Double-tap zoom
    // stays off everywhere (touch-action: manipulation).
    // The page itself never zooms (both orientations); two fingers on the map zoom the map.
    var c = 'width=' + w + ', user-scalable=no';
    if (m.getAttribute('content') !== c) m.setAttribute('content', c);
  }

  function addStyle() {
    if (!GAME_HOST || document.getElementById('ikm-style')) return;
    var s = document.createElement('style');
    s.id = 'ikm-style';
    s.textContent = [
      'html, body { -webkit-tap-highlight-color: rgba(0,0,0,0); -webkit-touch-callout: none; touch-action: manipulation; }',
      // stop long-press from selecting text all over the map
      'body, body * { -webkit-user-select: none; user-select: none; }',
      'input, textarea, [contenteditable="true"] { -webkit-user-select: text; user-select: text; }',
      // the map is ours: one finger drags it, two fingers zoom it (no browser pan/zoom there)
      '#worldview { touch-action: none; }',

      // ---- portrait layout (html.ikm-portrait): game laid out 660 px wide ----
      // the game forces its frame to 1024 px; let it follow the screen instead
      'html.ikm-portrait #container { min-width: 0 !important; width: auto !important; left: 0 !important; right: 0 !important; }',
      // top link row (Discord, notes, options, help, logout...) a bit bigger
      'html.ikm-portrait #GF_toolbar { left: 0 !important; right: 0 !important; width: auto !important; zoom: 1.25;' +
        ' height: auto !important; background-color: #f2e3c2 !important; border-bottom: 1px solid #c9a96a; }',
      'html.ikm-portrait #GF_toolbar ul { height: auto !important; }',
      // main panel (city/island/world + resources) at the very top, under the link row
      'html.ikm-portrait #topnavi { left: auto !important; right: 4px !important; top: calc(var(--ikm-tb, 48px) - 6px) !important; }',
      'html.ikm-portrait #breadcrumbs { top: calc(var(--ikm-tb, 48px) + 162px) !important; right: 8px !important; left: auto !important; }',
      // the four advisors: one big panel at the very bottom
      'html.ikm-portrait #advisors { position: fixed !important; top: auto !important; bottom: 0 !important; left: 0 !important; right: 0 !important;' +
        ' width: 394px !important; margin: 0 auto !important; zoom: 1.55; }',
      // the game\'s bottom bar (compass + copyright links) is not needed
      'html.ikm-portrait #footer { display: none !important; }',
      // side buttons (city menu / friends slots) bigger, under the main panel
      'html.ikm-portrait #js_viewCityMenu, html.ikm-portrait #js_viewFriends { top: calc(var(--ikm-tb, 48px) + 217px) !important; zoom: 1.45; }',
      // windows: anchored right, scaled to the screen width, just under the main panel
      'html.ikm-portrait .templateView { left: auto !important; right: 2px !important; top: calc(var(--ikm-tb, 48px) + 27px) !important;' +
        ' transform: scale(var(--ikm-ws, var(--ikm-winscale, 0.88))); transform-origin: top right; }',
      'html.ikm-portrait .templateView .mainContentScroll { height: var(--ikm-winh, 600px) !important; }',
      'html.ikm-portrait .templateView .scroll_area { display: none !important; }',
      // the window\'s side box (upgrade button etc.) goes under the window
      'html.ikm-portrait #sidebar { top: var(--ikm-sbtop, 760px) !important; right: auto !important; left: 50% !important; transform: translateX(-50%); }',
      // the shop's sale-timer quick link: removed (it sat over windows' close buttons)
      '#eventDiv { display: none !important; }',

      // ---- extra ground above the map (seen when the city / island is pulled down) ----
      // A mirrored copy of the map's top edge continues the ground with no visible joint.
      // Behind it: the jungle (city) or ocean (island) tile, also mirrored.
      'body#city #worldmap::before { content: ""; position: absolute; left: 0; right: 0;' +
        ' bottom: 100%; height: 1000px; background-image: inherit; background-repeat: inherit; background-position: 0 0;' +
        ' transform: scaleY(-1); pointer-events: none; }',
      // island: open sea, simply the same ocean texture continuing upward (no mirror)
      'body#island #island_ocean::before { content: ""; position: absolute; left: 0; right: 0;' +
        ' bottom: 100%; height: 1000px; background-image: inherit; background-repeat: repeat; background-position: 0 100%;' +
        ' pointer-events: none; }',
      // Generated ground (art/ in the app) above the city, when it fits this city's art: it
      // overlaps the real top edge a little and fades into it. Replaces the mirror.
      'html.ikm-cityart #locations::after { content: ""; position: absolute; pointer-events: none;' +
        ' left: var(--ikm-art-x); top: var(--ikm-art-y); width: var(--ikm-art-w); height: var(--ikm-art-h);' +
        ' background: var(--ikm-art-img) no-repeat 0 0 / 100% 100%; }',
      'html.ikm-cityart #city_background_nw::before, html.ikm-cityart #city_background_ne::before { display: none !important; }',
      // The city's own ground art (top two tiles): mirrored too, fading into the jungle a little
      // above the join so the reflection is not noticeable.
      '#city_background_nw::before, #city_background_ne::before { content: ""; position: absolute; left: 0; right: 0;' +
        ' bottom: 100%; height: 100%; background-image: inherit; background-repeat: no-repeat; background-position: 0 0;' +
        ' transform: scaleY(-1); pointer-events: none;' +
        ' -webkit-mask-image: linear-gradient(to bottom, #000 0, #000 18%, transparent 60%);' +
        ' mask-image: linear-gradient(to bottom, #000 0, #000 18%, transparent 60%); }'
    ].join('\n');
    (document.head || document.documentElement).appendChild(s);
  }

  /* ------------------------------------------------------------ touch → mouse */

  var DRAG_START = 10;   // px a finger must move before it counts as a drag
  var LONG_MS = 450;     // long-press time for hover tooltips
  var g = null;          // the gesture in progress
  var hovered = null;    // element given a fake hover by a long-press

  function mouse(type, x, y, target, buttons) {
    var t = target || document.elementFromPoint(x, y) || document.body;
    var ev = new MouseEvent(type, {
      bubbles: type !== 'mouseenter' && type !== 'mouseleave',
      cancelable: true, view: window,
      clientX: x, clientY: y, screenX: x, screenY: y,
      button: 0, buttons: buttons, detail: 1
    });
    t.dispatchEvent(ev);
    return t;
  }

  function isEditable(el) {
    return !!(el && el.closest && el.closest('input, textarea, select, [contenteditable="true"]'));
  }

  // A list that the browser can scroll by itself (overflow auto/scroll): leave it alone.
  function nativeScroller(el) {
    while (el && el !== document.body && el !== document.documentElement) {
      if (el.nodeType === 1) {
        var s = getComputedStyle(el);
        if ((s.overflowY === 'auto' || s.overflowY === 'scroll') && el.scrollHeight > el.clientHeight + 2) return el;
        if ((s.overflowX === 'auto' || s.overflowX === 'scroll') && el.scrollWidth > el.clientWidth + 2) return el;
      }
      el = el.parentElement;
    }
    return null;
  }

  // Game windows / pop-ups. Lists inside these may have the game's own scrollbar.
  var WINDOW_SEL = '.templateView, .popup_window, .popupMessage, #multiPopup';

  // The game's own scrolling panel inside a window (overflow hidden + custom scrollbar).
  // Only looked for inside windows: the main game frame (#container) must never scroll.
  function customScroller(el) {
    if (!el || !el.closest) return null;
    var box = el.closest('.mainContentScroll');
    if (box && box.scrollHeight > box.clientHeight + 4) return box;
    var win = el.closest(WINDOW_SEL);
    if (!win) return null;
    while (el && el !== win.parentElement) {
      if (el.nodeType === 1 && el.clientHeight > 40) {
        var s = getComputedStyle(el);
        if (s.overflowY === 'hidden' && el.scrollHeight > el.clientHeight + 4 && el.scrollWidth <= el.clientWidth + 4) return el;
      }
      el = el.parentElement;
    }
    return null;
  }

  // The city / island / world map area (not a window on top of it).
  function onMap(el) {
    return !!(el && el.closest && el.closest('#worldview') && !el.closest(WINDOW_SEL));
  }

  function zoomedIn() {
    var vv = window.visualViewport;
    if (!vv) return false;
    return vv.width < document.documentElement.clientWidth * 0.95;
  }

  // Old-style mouse wheel event: this is what Ikariam's scrollbars and map zoom listen to.
  function mousewheel(target, x, y, delta) {
    var ev = new Event('mousewheel', { bubbles: true, cancelable: true });
    var props = { wheelDelta: delta, wheelDeltaY: delta, wheelDeltaX: 0, detail: 0,
                  clientX: x, clientY: y, pageX: x, pageY: y, screenX: x, screenY: y };
    Object.keys(props).forEach(function (k) {
      try { Object.defineProperty(ev, k, { value: props[k] }); } catch (e) { /* ignore */ }
    });
    (target || document.elementFromPoint(x, y) || document.body).dispatchEvent(ev);
  }

  // Ikariam moves a list about 0.37 px per wheel unit, so 1 px of finger = 2.7 units.
  var PX_TO_WHEEL = 2.7;

  function contentPos(box) {
    var c = box.querySelector('.mainContent') || box.firstElementChild;
    return box.scrollTop + ',' + (c ? Math.round(c.getBoundingClientRect().top) : 0);
  }

  // Scroll a game list by dy pixels (positive = content moves up, like a finger moving up).
  function scrollBy(s, dy) {
    s.acc += dy;
    var delta = Math.round(-s.acc * PX_TO_WHEEL);
    if (Math.abs(delta) < 6) return;
    s.acc += delta / PX_TO_WHEEL;     // what remains after this step
    if (s.method === 'shift') { shiftContent(s.box, -delta / PX_TO_WHEEL); return; }
    if (s.method === 'top') { s.box.scrollTop += Math.round(-delta / PX_TO_WHEEL); return; }
    var before = s.method ? null : contentPos(s.box);
    mousewheel(s.target, s.x, s.y, delta);
    if (!s.method) {
      s.method = contentPos(s.box) !== before ? 'wheel' : 'top';
      if (s.method === 'top') s.box.scrollTop += Math.round(-delta / PX_TO_WHEEL);
    }
  }

  // Window content "camera" (portrait). Portrait windows are shorter than the game thinks and
  // the game snaps scrollTop back to 0, so a window's content is moved with a transform: tx/ty
  // position and z zoom, inside the window's clipping box. Scrolling moves ty; two fingers zoom
  // (only the content: the window itself stays put); zoomed content pans with one finger.
  // Kept on the element only, so every window / new content starts unzoomed.
  function cview(mc) {
    if (!mc.__ikmView) mc.__ikmView = { z: 1, tx: 0, ty: 0 };
    return mc.__ikmView;
  }
  function cviewApply(box, mc, v) {
    var W = mc.offsetWidth * v.z, H = mc.offsetHeight * v.z;
    var ox = mc.offsetLeft, bw = box.clientWidth, bh = box.clientHeight;
    v.tx = Math.min(0, Math.max(Math.min(0, bw - 2 * ox - W), v.tx));   // no empty space beside the content
    v.ty = Math.min(0, Math.max(Math.min(0, bh - H), v.ty));            // ... or below it
    mc.style.transformOrigin = '0 0';
    mc.style.transform = (v.z === 1 && !v.tx && !v.ty) ? '' :
      'translate(' + v.tx.toFixed(1) + 'px,' + v.ty.toFixed(1) + 'px) scale(' + v.z.toFixed(3) + ')';
    mc.setAttribute('data-ikm-shift', '1');
  }
  function shiftContent(box, dy) {
    var mc = box.querySelector('.mainContent');
    if (!mc) return;
    var v = cview(mc);
    v.ty -= dy;
    cviewApply(box, mc, v);
  }
  function clearShifts() {
    Array.prototype.forEach.call(document.querySelectorAll('[data-ikm-shift]'), function (el) {
      el.removeAttribute('data-ikm-shift');
      el.style.transform = '';
      el.__ikmView = null;
    });
  }
  // Screen point -> the window box's own (unscaled) coordinates.
  function boxLocal(box, x, y) {
    var r = box.getBoundingClientRect(), s = winScale(box.closest('.templateView'));
    return { x: (x - r.left) / s, y: (y - r.top) / s, s: s };
  }

  // Keep a list gliding for a moment after the finger leaves, like a phone list.
  var fling = null;
  function startFling(s, v) {
    stopFling();
    if (Math.abs(v) < 0.3) return;            // px per ms
    var last = performance.now();
    fling = { s: s, v: v, raf: 0 };
    var step = function (now) {
      if (!fling) return;
      var dt = Math.min(32, now - last); last = now;
      fling.v *= Math.pow(0.995, dt);
      if (Math.abs(fling.v) < 0.05) { fling = null; return; }
      scrollBy(fling.s, fling.v * dt);
      fling.raf = requestAnimationFrame(step);
    };
    fling.raf = requestAnimationFrame(step);
  }
  function stopFling() {
    if (fling) { cancelAnimationFrame(fling.raf); fling = null; }
  }

  function clearHover() {
    if (!hovered) return;
    var r = hovered.getBoundingClientRect();
    mouse('mouseout', r.left - 5, r.top - 5, hovered, 0);
    mouse('mouseleave', r.left - 5, r.top - 5, hovered, 0);
    hovered = null;
  }

  // Holding a finger still = hovering the mouse there: the game shows the same info it shows
  // on a PC hover (e.g. income / costs on the gold). Lifting the finger does not click; the
  // info stays until the next touch somewhere else. Holding and then moving = a drag.
  function hoverAt(x, y) {
    var el = document.elementFromPoint(x, y);
    if (!el || el === hovered) return;
    clearHover();
    mouse('mouseover', x, y, el, 0);
    mouse('mouseenter', x, y, el, 0);
    hovered = el;
  }

  function longPress() {
    if (!g || g.mode !== 'pending') return;
    g.mode = 'hover';
    hoverAt(g.x, g.y);
    mouse('mousemove', g.x, g.y, null, 0);
    if (A && A.haptic) A.haptic();
  }

  /* ------------------------------------------------------------ map camera */

  // City / island: the app pans and zooms the map itself, kept inside the city (or the
  // island's towns) with a little wiggle room, plus extra room at the top so the top
  // buildings can be pulled down to the finger. World map: the game pans it (it loads
  // tiles as you move); the app only adds zoom. The bars and windows never zoom.
  // z/tx/ty: the camera we want; az/atx/aty: what is actually applied to the page right now
  // (needed to measure the map, since on-screen positions include the applied transform).
  var cam = { key: '', z: 1, tx: 0, ty: 0, az: 1, atx: 0, aty: 0 };
  var CAM_MAX = 3;
  var camSeq = 0;

  function camView() {
    var id = document.body && document.body.id;
    if (!document.getElementById('scrollcover')) return null;
    if (id === 'city' || id === 'island') return id;
    if (id === 'worldmap_iso') return 'world';
    return null;
  }
  function camEl() { return document.getElementById('scrollcover'); }
  function camOrigin() {
    var r = document.getElementById('worldview').getBoundingClientRect();
    return { x: r.left, y: r.top };
  }
  function camApply() {
    var el = camEl();
    if (!el) return;
    // The game's map frame clips to its own box; let it overflow so moving the camera never
    // cuts the map off (the outer game area still clips to the screen).
    el.style.setProperty('overflow', 'visible', 'important');
    el.style.transformOrigin = '0 0';
    el.style.transform = (cam.z === 1 && !cam.tx && !cam.ty) ? '' :
      'translate(' + cam.tx.toFixed(1) + 'px,' + cam.ty.toFixed(1) + 'px) scale(' + cam.z.toFixed(4) + ')';
    cam.az = cam.z; cam.atx = cam.tx; cam.aty = cam.ty;
  }
  // A rectangle on screen -> where it would be with no camera transform.
  function camUnproject(r, O) {
    return {
      left: O.x + (r.left - O.x - cam.atx) / cam.az, right: O.x + (r.right - O.x - cam.atx) / cam.az,
      top: O.y + (r.top - O.y - cam.aty) / cam.az, bottom: O.y + (r.bottom - O.y - cam.aty) / cam.az
    };
  }
  function camContent(view, O) {
    if (view === 'city') {
      var loc = document.getElementById('locations');
      if (loc) return camUnproject(loc.getBoundingClientRect(), O);
    }
    if (view === 'island') {
      var spots = document.querySelectorAll('#worldmap .cityLocation');
      if (spots.length) {
        var b = { left: 1e9, top: 1e9, right: -1e9, bottom: -1e9 };
        Array.prototype.forEach.call(spots, function (s) {
          var r = s.getBoundingClientRect();
          if (!r.width) return;
          b.left = Math.min(b.left, r.left); b.top = Math.min(b.top, r.top);
          b.right = Math.max(b.right, r.right); b.bottom = Math.max(b.bottom, r.bottom);
        });
        var u = camUnproject(b, O), m = 150;   // the island's shore around the towns
        return { left: u.left - m, right: u.right + m, top: u.top - m, bottom: u.bottom + m };
      }
    }
    var el = camEl();   // world map: the visible map area itself
    return { left: O.x, top: O.y, right: O.x + el.offsetWidth, bottom: O.y + el.offsetHeight };
  }
  function camClamp() {
    var view = camView();
    if (!view) return;
    var O = camOrigin(), K = camContent(view, O), z = cam.z;
    var L0 = O.x + (K.left - O.x) * z, R0 = O.x + (K.right - O.x) * z;
    var T0 = O.y + (K.top - O.y) * z, B0 = O.y + (K.bottom - O.y) * z;
    var vw = window.innerWidth, vh = window.innerHeight;
    var side = view === 'world' ? 0 : 60;
    var topRoom = view === 'world' ? O.y : vh * 0.42;
    var bottomRoom = view === 'world' ? 0 : 90;
    var a = (vw - side) - R0, b = side - L0;
    cam.tx = Math.min(Math.max(a, b), Math.max(Math.min(a, b), cam.tx));
    a = (vh - bottomRoom) - B0; b = topRoom - T0;
    var lo = Math.min(a, b), hi = Math.max(a, b);
    if (view !== 'world') { lo = Math.min(lo, 0); hi = Math.max(hi, 0); }
    cam.ty = Math.min(hi, Math.max(lo, cam.ty));
  }
  function camReset() {
    // A new map element starts untransformed; read the applied state from the page.
    var el = camEl();
    if (el && !el.style.transform) { cam.az = 1; cam.atx = 0; cam.aty = 0; }
    cam.z = 1; cam.tx = 0; cam.ty = 0;
    camClamp();
    camApply();
  }
  // Generated ground above the city (from the app's art/manifest.json): used only when this
  // city's top ground tiles are the ones the picture was made from.
  var artKey = '';
  function cityArt() {
    var root = document.documentElement;
    var list = cfg.art && cfg.art.cityTop;
    var ne = document.getElementById('city_background_ne'), nw = document.getElementById('city_background_nw');
    var hit = null;
    if (list && ne && nw && document.body && document.body.id === 'city') {
      var a = getComputedStyle(ne).backgroundImage, b = getComputedStyle(nw).backgroundImage;
      for (var i = 0; i < list.length && !hit; i++) {
        var t = list[i].tiles || [];
        if (t.length === 2 && a.indexOf(t[0]) >= 0 && b.indexOf(t[1]) >= 0) hit = list[i];
      }
    }
    var key = hit ? hit.file : '';
    if (key === artKey) return;
    artKey = key;
    root.classList.toggle('ikm-cityart', !!hit);
    if (!hit) return;
    // Picture covers: jungle column | city | jungle column, from `ext` px above the city's top
    // down to `overlap` px into it (that part fades out over the real art).
    root.style.setProperty('--ikm-art-img', 'url(/__ikm/' + hit.file + ')');
    root.style.setProperty('--ikm-art-x', (-hit.side) + 'px');
    root.style.setProperty('--ikm-art-y', (-hit.ext) + 'px');
    root.style.setProperty('--ikm-art-w', hit.width + 'px');
    root.style.setProperty('--ikm-art-h', (hit.ext + hit.overlap) + 'px');
  }

  // New view or new map from the game: start from the game's own position.
  function camCheck() {
    cityArt();
    var view = camView();
    var wm = document.getElementById('worldmap');
    if (!view || !wm) { cam.key = ''; return; }
    if (!wm.hasAttribute('data-ikm-cam')) wm.setAttribute('data-ikm-cam', String(++camSeq));
    var key = view + ':' + wm.getAttribute('data-ikm-cam');
    if (key !== cam.key) { cam.key = key; camReset(); }
  }
  // Zoom to z2 keeping the map point under screen point (mx, my) where it is.
  function camZoomAt(z2, mx, my, anchor) {
    var O = camOrigin();
    var p = anchor || { x: O.x + (mx - O.x - cam.atx) / cam.az, y: O.y + (my - O.y - cam.aty) / cam.az };
    cam.z = Math.max(1, Math.min(CAM_MAX, z2));
    cam.tx = mx - O.x - (p.x - O.x) * cam.z;
    cam.ty = my - O.y - (p.y - O.y) * cam.z;
    camClamp();
    camApply();
  }
  function camAnimateTo(z2, mx, my) {
    var z1 = cam.az, start = performance.now(), O = camOrigin();
    var p = { x: O.x + (mx - O.x - cam.atx) / cam.az, y: O.y + (my - O.y - cam.aty) / cam.az };
    var step = function (now) {
      var k = Math.min(1, (now - start) / 180);
      k = 1 - Math.pow(1 - k, 3);
      camZoomAt(z1 + (z2 - z1) * k, mx, my, p);
      if (k < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  // Taps on the map wait a moment to see whether a second tap follows (double-tap = zoom).
  var lastTap = null, tapTimer = 0;
  function tapAt(x, y) {
    var el = document.elementFromPoint(x, y);
    if (!el) return;
    clearHover();
    mouse('mouseover', x, y, el, 0);
    mouse('mousedown', x, y, el, 1);
    mouse('mouseup', x, y, el, 0);
    mouse('click', x, y, el, 0);
    hovered = el;                              // a later tap elsewhere sends it a mouse-out
  }
  function mapTap(x, y) {
    var now = performance.now();
    if (lastTap && now - lastTap.t < 320 && Math.abs(x - lastTap.x) < 45 && Math.abs(y - lastTap.y) < 45) {
      clearTimeout(tapTimer);
      lastTap = null;
      if (camView()) camAnimateTo(cam.z < 1.6 ? 2.2 : 1, x, y);
      return;
    }
    lastTap = { t: now, x: x, y: y };
    clearTimeout(tapTimer);
    tapTimer = setTimeout(function () { lastTap = null; tapAt(x, y); }, 260);
  }

  // Start a one-finger drag. City / island maps: pan with the camera. Portrait windows are
  // pinned by our layout, so dragging a window's title bar moves it with our own offset.
  function startDrag(t) {
    if (g.zoomed) {                            // zoomed window content: pan it
      var v = cview(g.zoomed);
      g.mode = 'cpan'; g.mc = g.zoomed; g.box = g.zoomed.closest('.mainContentScroll');
      g.tx0 = v.tx; g.ty0 = v.ty; g.s = winScale(g.box.closest('.templateView'));
      return;
    }
    if (g.cam === 'city' || g.cam === 'island') {
      g.mode = 'pan';
      g.tx0 = cam.tx;
      g.ty0 = cam.ty;
      return;
    }
    var hdr = isPortrait() && g.target.closest && g.target.closest('.templateView .mainHeader, .templateView .hd.header');
    // The side box / island town panel: drag it from anywhere on it (taps still click).
    var side = isPortrait() && !hdr && g.target.closest && !isEditable(g.target) && g.target.closest('#sidebar');
    if (hdr || side) {
      g.mode = 'windrag';
      g.win = hdr ? hdr.closest('.templateView') : side;
      g.mt0 = parseFloat(g.win.style.marginTop) || 0;
      g.ml0 = parseFloat(g.win.style.marginLeft) || 0;
      return;
    }
    g.mode = 'drag';
    mouse('mousedown', g.x0, g.y0, g.target, 1);
    dragMove(t.clientX, t.clientY);
    g.x = t.clientX;
    g.y = t.clientY;
  }

  // World map zoomed in by the camera: the game moves the map in its own (unzoomed) pixels,
  // so finger movement is divided by the zoom to keep the map under the finger.
  function dragPoint(x, y) {
    if (g.cam === 'world' && cam.z !== 1) return { x: g.x0 + (x - g.x0) / cam.z, y: g.y0 + (y - g.y0) / cam.z };
    return { x: x, y: y };
  }
  function dragMove(x, y) {
    var p = dragPoint(x, y);
    mouse('mousemove', p.x, p.y, null, 1);
  }

  function dist(a, b) {
    var dx = a.clientX - b.clientX, dy = a.clientY - b.clientY;
    return Math.sqrt(dx * dx + dy * dy);
  }

  function onStart(e) {
    if (!cfg.touchFix || !GAME_HOST) return;
    stopFling();
    if (e.touches.length > 1) {
      if (g) {
        clearTimeout(g.timer);
        if (g.mode === 'drag') { var up = dragPoint(g.x, g.y); mouse('mouseup', up.x, up.y, null, 0); }
      }
      var a = e.touches[0], b = e.touches[1];
      // Two fingers inside a game window's content (portrait): zoom that content inside the
      // window, around the fingers; moving both fingers also pans.
      var boxA = isPortrait() && a.target.closest && a.target.closest('.templateView .mainContentScroll');
      var boxB = isPortrait() && b.target.closest && b.target.closest('.templateView .mainContentScroll');
      var mcA = boxA && boxA === boxB && boxA.querySelector('.mainContent');
      if (mcA) {
        var v0 = cview(mcA);
        var L0 = boxLocal(boxA, (a.clientX + b.clientX) / 2, (a.clientY + b.clientY) / 2);
        g = {
          mode: 'cpinch', box: boxA, mc: mcA, d0: dist(a, b), z0: v0.z,
          // the content point under the fingers' midpoint (content's own unzoomed coordinates)
          c: { x: (L0.x - mcA.offsetLeft - v0.tx) / v0.z, y: (L0.y - mcA.offsetTop - v0.ty) / v0.z }
        };
        if (e.cancelable) e.preventDefault();
        return;
      }
      // Two fingers on the map: zoom the map only (the bars never zoom).
      if (onMap(a.target) && onMap(b.target) && camView()) {
        var O = camOrigin();
        var mx = (a.clientX + b.clientX) / 2, my = (a.clientY + b.clientY) / 2;
        g = {
          mode: 'campinch', d0: dist(a, b), z0: cam.z,
          // the map point under the fingers' midpoint stays under it
          p: { x: O.x + (mx - O.x - cam.tx) / cam.z, y: O.y + (my - O.y - cam.ty) / cam.z }
        };
        if (e.cancelable) e.preventDefault();
      } else {
        g = { mode: 'multi' };
      }
      return;
    }
    var t = e.touches[0];
    var target = e.target;
    if (isEditable(target)) { g = null; return; }
    if (hovered && !hovered.contains(target)) clearHover();
    var map = onMap(target);
    var box = map ? null : customScroller(target);
    g = {
      mode: 'pending',
      x0: t.clientX, y0: t.clientY, x: t.clientX, y: t.clientY,
      target: target,
      map: map,
      cam: map ? camView() : null,
      // One finger: the map always drags and window lists always scroll.
      native: !map && !box && (!!nativeScroller(target) || zoomedIn()),
      box: box,
      t: performance.now(), v: 0
    };
    // Inside zoomed window content: one finger pans, a double-tap on empty space resets.
    if (box && isPortrait() && box.classList.contains('mainContentScroll')) {
      var zmc = box.querySelector('.mainContent');
      if (zmc && zmc.__ikmView && zmc.__ikmView.z > 1.01) g.zoomed = zmc;
    }
    if (map) camCheck();
    g.timer = setTimeout(longPress, LONG_MS);
  }

  function onMove(e) {
    if (!g || g.mode === 'multi') return;

    if (g.mode === 'cpinch') {
      if (e.cancelable) e.preventDefault();
      if (e.touches.length < 2) return;
      var p = e.touches[0], q = e.touches[1];
      var cv = cview(g.mc);
      cv.z = Math.max(1, Math.min(4, g.z0 * dist(p, q) / g.d0));
      // keep the same content point under the fingers' (moving) midpoint
      var Lm = boxLocal(g.box, (p.clientX + q.clientX) / 2, (p.clientY + q.clientY) / 2);
      cv.tx = Lm.x - g.mc.offsetLeft - g.c.x * cv.z;
      cv.ty = Lm.y - g.mc.offsetTop - g.c.y * cv.z;
      cviewApply(g.box, g.mc, cv);
      return;
    }

    if (g.mode === 'cpan') {                   // zoomed window content: one finger pans it
      if (e.cancelable) e.preventDefault();
      var tp = e.touches[0], pv = cview(g.mc);
      pv.tx = g.tx0 + (tp.clientX - g.x0) / g.s;
      pv.ty = g.ty0 + (tp.clientY - g.y0) / g.s;
      cviewApply(g.box, g.mc, pv);
      return;
    }

    if (g.mode === 'campinch') {
      if (e.cancelable) e.preventDefault();
      if (e.touches.length < 2) return;
      var a = e.touches[0], b = e.touches[1];
      var mx = (a.clientX + b.clientX) / 2, my = (a.clientY + b.clientY) / 2;
      camZoomAt(g.z0 * dist(a, b) / g.d0, mx, my, g.p);
      return;
    }
    if (e.touches.length > 1) return;

    var t = e.touches[0];
    var dx = t.clientX - g.x0, dy = t.clientY - g.y0;

    if (g.mode === 'pan') {                    // city / island: move the camera, kept in bounds
      if (e.cancelable) e.preventDefault();
      cam.tx = g.tx0 + dx;
      cam.ty = g.ty0 + dy;
      camClamp();
      camApply();
      return;
    }

    if (g.mode === 'windrag') {                // portrait: we move the window ourselves
      if (e.cancelable) e.preventDefault();
      g.win.style.marginTop = Math.max(-200, Math.min(window.innerHeight - 260, g.mt0 + dy)) + 'px';
      g.win.style.marginLeft = Math.max(-300, Math.min(300, g.ml0 + dx)) + 'px';
      return;
    }

    if (g.mode === 'hover') {                  // held still, now moving: turn it into a drag
      if (e.cancelable) e.preventDefault();
      if (Math.sqrt(dx * dx + dy * dy) < DRAG_START) return;
      clearHover();
      startDrag(t);
      return;
    }

    if (g.native) {                            // browser scrolls by itself
      if (Math.abs(dx) + Math.abs(dy) > DRAG_START) clearTimeout(g.timer);
      return;
    }
    if (e.cancelable) e.preventDefault();       // we handle this drag

    if (g.mode === 'pending') {
      if (Math.sqrt(dx * dx + dy * dy) < DRAG_START) return;
      clearTimeout(g.timer);
      if (g.zoomed) { startDrag(t); return; }  // zoomed content: pan in any direction
      if (g.box && Math.abs(dy) > Math.abs(dx)) {
        g.mode = 'scroll';
        // In portrait the windows are shorter than the game thinks, so scroll them directly.
        var direct = isPortrait() && g.box.classList.contains('mainContentScroll');
        g.scroll = { box: g.box, target: g.target, x: g.x0, y: g.y0, acc: 0, method: direct ? 'shift' : null };
      } else {
        startDrag(t);
        if (g.mode !== 'drag') return;
      }
    }

    var now = performance.now();
    if (g.mode === 'drag') {
      dragMove(t.clientX, t.clientY);
    } else if (g.mode === 'scroll') {
      var step = g.y - t.clientY;
      scrollBy(g.scroll, step);
      var dt = Math.max(1, now - g.t);
      g.v = 0.7 * (step / dt) + 0.3 * g.v;     // smoothed speed for the fling
    }
    g.t = now;
    g.x = t.clientX;
    g.y = t.clientY;
  }

  // Buttons, links, fields and other things that react to a tap (a double-tap on them must not
  // reset the zoom).
  function isInteractive(el) {
    return !!(el && el.closest && el.closest('a, button, input, select, textarea, label, [onclick], .button, .tab'));
  }
  var lastContentTap = null;

  function onEnd(e) {
    if (!g) return;
    clearTimeout(g.timer);
    if (g.mode === 'drag') {
      var up = dragPoint(g.x, g.y);
      mouse('mouseup', up.x, up.y, null, 0);
      if (e.cancelable) e.preventDefault();     // no click at the end of a drag
    } else if (g.mode === 'scroll') {
      if (e.cancelable) e.preventDefault();
      if (performance.now() - g.t < 80) startFling(g.scroll, g.v);
    } else if (g.mode === 'campinch' || g.mode === 'pan' || g.mode === 'windrag' ||
               g.mode === 'cpinch' || g.mode === 'cpan') {
      if (e.cancelable) e.preventDefault();
      if (g.mode === 'windrag') savePanelPos(g.win);
      if (g.mode === 'cpinch') {
        var pz = cview(g.mc);
        if (pz.z < 1.03) { pz.z = 1; pz.tx = 0; cviewApply(g.box, g.mc, pz); }   // pinched back: plain view
        // lifting one of the two fingers ends the gesture; the other finger starts nothing new
        if (e.touches.length) { g = { mode: 'multi' }; return; }
      }
    } else if (g.mode === 'pending' && g.zoomed && !isInteractive(g.target)) {
      // Zoomed window content: double-tap on empty space (not a button / link) resets the zoom.
      var now2 = performance.now();
      if (lastContentTap && now2 - lastContentTap.t < 350 && Math.abs(g.x0 - lastContentTap.x) < 45 &&
          Math.abs(g.y0 - lastContentTap.y) < 45) {
        if (e.cancelable) e.preventDefault();
        var zv = cview(g.zoomed), zbox = g.zoomed.closest('.mainContentScroll');
        zv.ty = zv.ty / zv.z; zv.z = 1; zv.tx = 0;          // back to normal size, about the same place
        cviewApply(zbox, g.zoomed, zv);
        lastContentTap = null;
      } else {
        lastContentTap = { t: now2, x: g.x0, y: g.y0 };
      }
    } else if (g.mode === 'hover') {
      if (e.cancelable) e.preventDefault();     // holding = hover only, no click; info stays visible
    } else if (g.mode === 'pending' && g.map && g.cam) {
      // A tap on the map: wait briefly for a possible second tap (double-tap = zoom).
      if (e.cancelable) e.preventDefault();
      mapTap(g.x0, g.y0);
    } else if (g.mode === 'pending') {
      // Side menus (e.g. the city menu on the right): first tap expands the item (= mouse hover),
      // a second tap on the same item opens it, a tap anywhere else collapses it.
      var exp = g.target.closest && g.target.closest('.expandable');
      if (exp && hovered !== exp) {
        if (e.cancelable) e.preventDefault();
        clearHover();
        mouse('mouseover', g.x0, g.y0, g.target, 0);
        hovered = exp;
      } else if (exp) {
        setTimeout(clearHover, 80);            // opened: collapse the label again
      } else {
        hovered = g.target;                    // a later tap elsewhere sends it a mouse-out
      }
    }
    if (e.touches.length === 0) g = null;
  }

  function onCancel() {
    if (g) {
      clearTimeout(g.timer);
      if (g.mode === 'drag') { var up = dragPoint(g.x, g.y); mouse('mouseup', up.x, up.y, null, 0); }
    }
    g = null;
  }



  /* ------------------------------------------------------------ text editor */

  var fieldSeq = 0;
  var skipFocus = null;

  function isTextField(el) {
    if (!el || el.disabled || el.readOnly) return false;
    if (el.tagName === 'TEXTAREA') return true;
    if (el.tagName !== 'INPUT') return false;
    var t = (el.getAttribute('type') || 'text').toLowerCase();
    return t === 'text' || t === 'search' || t === 'number' || t === 'tel';
  }

  function labelOf(el) {
    if (el.placeholder) return el.placeholder;
    if (el.id && window.CSS && CSS.escape) {
      var l = document.querySelector('label[for="' + CSS.escape(el.id) + '"]');
      if (l) return l.textContent.trim();
    }
    return el.title || '';
  }

  // Small boxes holding a number (troop / resource amounts) get a number keypad.
  function looksNumeric(el) {
    var t = (el.getAttribute('type') || '').toLowerCase();
    if (t === 'number' || t === 'tel') return true;
    if (el.tagName === 'TEXTAREA') return false;
    var v = (el.value || '').replace(/[,.\s]/g, '');
    var small = (el.maxLength > 0 && el.maxLength <= 9) || el.getBoundingClientRect().width < 90;
    return small && /^\d+$/.test(v);
  }

  function onFocusIn(e) {
    var el = e.target;
    if (!cfg.composer || !GAME_HOST || !A || !isTextField(el)) return;
    if (isPortrait()) return;      // portrait: type straight into the game's box with the keyboard
    if (skipFocus === el) return;
    var id = el.getAttribute('data-ikm-id');
    if (!id) { id = 'f' + (++fieldSeq); el.setAttribute('data-ikm-id', id); }
    setTimeout(function () { el.blur(); }, 0);   // native editor takes over the keyboard
    A.compose(JSON.stringify({
      id: id,
      value: el.value || '',
      multiline: el.tagName === 'TEXTAREA',
      numeric: looksNumeric(el),
      max: el.maxLength > 0 ? el.maxLength : 0,
      hint: labelOf(el)
    }));
  }

  function fireKey(el, type) {
    var ev = new KeyboardEvent(type, { key: 'Enter', code: 'Enter', bubbles: true, cancelable: true });
    try {
      Object.defineProperty(ev, 'keyCode', { get: function () { return 13; } });
      Object.defineProperty(ev, 'which', { get: function () { return 13; } });
      Object.defineProperty(ev, 'charCode', { get: function () { return type === 'keypress' ? 13 : 0; } });
    } catch (e) { /* ignore */ }
    return el.dispatchEvent(ev);
  }

  api.fill = function (id, value, send) {
    var el = document.querySelector('[data-ikm-id="' + id + '"]');
    if (!el) return false;
    var proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, value);
    ['input', 'keyup', 'change'].forEach(function (t) { el.dispatchEvent(new Event(t, { bubbles: true })); });
    if (send) {
      // Press the form's own send button if there is one, otherwise press Enter. Only one of the two,
      // so a message is never sent twice.
      var form = el.form;
      var btn = form && form.querySelector('input[type=submit], button[type=submit], button:not([type])');
      if (btn) btn.click();
      else { fireKey(el, 'keydown'); fireKey(el, 'keypress'); fireKey(el, 'keyup'); }
    }
    return true;
  };

  // "Page keyboard": focus the field normally, without the native editor.
  api.focusRaw = function (id) {
    var el = document.querySelector('[data-ikm-id="' + id + '"]');
    if (!el) return false;
    skipFocus = el;
    el.addEventListener('blur', function () { if (skipFocus === el) skipFocus = null; }, { once: true });
    el.focus();
    return true;
  };

  /* ------------------------------------------------------------ navigation bar */

  // Each entry: the game's own buttons to tap (tried in order), then the view to open
  // if none is found. These are the same links the player would tap on a PC.
  var NAV = {
    city:     { sel: ['#js_cityLink a', '#js_cityLink'], view: 'city' },
    island:   { sel: ['#js_islandLink a', '#js_islandLink'], view: 'island' },
    world:    { sel: ['#js_worldMapLink a', '#js_worldMapLink'], view: 'worldmap_iso' },
    towns:    { sel: ['#js_GlobalMenu_cities', '#advCities a'], view: 'tradeAdvisor' },
    military: { sel: ['#js_GlobalMenu_military', '#advMilitary a'], view: 'militaryAdvisor' },
    research: { sel: ['#js_GlobalMenu_research', '#advResearch a'], view: 'researchAdvisor' },
    messages: { sel: ['#js_GlobalMenu_diplomacy', '#advDiplomacy a'], view: 'diplomacyAdvisor' }
  };

  api.go = function (key) {
    var n = NAV[key];
    if (!n) return false;
    var el = first(n.sel);
    if (el) { el.click(); return true; }
    if (typeof window.ajaxHandlerCall === 'function') { window.ajaxHandlerCall('?view=' + n.view); return true; }
    location.href = '/index.php?view=' + n.view;
    return true;
  };

  // Close the game window on top (used by the Close button and the phone's back button).
  var CLOSE_SEL = '.close, .closeButton, .btnClose, .closeWindow, .ui-dialog-titlebar-close';
  api.closeTop = function () {
    var list = Array.prototype.slice.call(document.querySelectorAll(CLOSE_SEL)).filter(visible);
    if (!list.length) return false;
    for (var i = list.length - 1; i >= 0; i--) {
      var r = list[i].getBoundingClientRect();
      var hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      if (hit && (hit === list[i] || list[i].contains(hit) || hit.contains(list[i]))) {
        list[i].click();
        return true;
      }
    }
    list[list.length - 1].click();
    return true;
  };

  // Offer pop-ups close with a text button ("اغلق") instead of an X.
  var CLOSE_WORDS = /^(اغلق|أغلق|إغلاق|اغلاق|close|schließen|ok|موافق)$/i;
  function closeByText() {
    var pops = Array.prototype.slice.call(document.querySelectorAll('#multiPopup, .popupMessage, .popup_window')).filter(visible);
    for (var p = pops.length - 1; p >= 0; p--) {
      var btns = Array.prototype.slice.call(pops[p].querySelectorAll('a, button, input[type=button], .button, [onclick]')).filter(visible);
      for (var i = 0; i < btns.length; i++) {
        var label = (btns[i].value || btns[i].textContent || '').trim();
        if (CLOSE_WORDS.test(label)) { btns[i].click(); return true; }
      }
    }
    return false;
  }
  // Island view: tapping a town opens an info panel (#sidebar) with no X. The game's own
  // window manager closes such panels with destroySidebars().
  function sidebarOpen() {
    var sb = document.getElementById('sidebar');
    return !!(sb && sb.children.length && visible(sb));
  }
  function closeTownPanel() {
    if (!sidebarOpen()) return false;
    try {
      var tv = window.ikariam && ikariam.templateView;
      if (tv && typeof tv.destroySidebars === 'function') { tv.destroySidebars(); return true; }
    } catch (e) { /* fall through */ }
    return false;
  }
  var closeTopByX = api.closeTop;
  api.closeTop = function () {
    return closeByText() || closeTopByX() || closeTownPanel();
  };

  /* ------------------------------------------------------------ bigger window text */

  // Portrait: text in game windows and their side boxes is drawn 25% bigger (same font and
  // style, just larger). Every size is measured before any is changed, so text inside other
  // enlarged text does not grow twice.
  var TEXT_SCALE = 1.25;
  function hasOwnText(e) {
    for (var c = e.firstChild; c; c = c.nextSibling) {
      if (c.nodeType === 3 && c.textContent.trim()) return true;
    }
    return false;
  }
  function enlargeText(root) {
    var todo = [];
    Array.prototype.forEach.call(root.querySelectorAll('*'), function (e) {
      if (e.hasAttribute('data-ikm-fs') || !hasOwnText(e)) return;
      var fs = parseFloat(getComputedStyle(e).fontSize);
      // Added later inside text we already enlarged and just inheriting its size? Then its
      // original size is that text's original size.
      var anc = e.parentElement && e.parentElement.closest('[data-ikm-fs]');
      if (anc && Math.abs(parseFloat(getComputedStyle(anc).fontSize) - fs) < 0.5) {
        fs = parseFloat(anc.getAttribute('data-ikm-fs'));
      }
      todo.push([e, fs]);
    });
    todo.forEach(function (p) {
      p[0].setAttribute('data-ikm-fs', String(p[1]));
      p[0].style.setProperty('font-size', Math.round(p[1] * TEXT_SCALE) + 'px', 'important');
    });
  }
  function restoreText() {
    Array.prototype.forEach.call(document.querySelectorAll('[data-ikm-fs]'), function (e) {
      e.removeAttribute('data-ikm-fs');
      e.style.removeProperty('font-size');
    });
  }

  /* ------------------------------------------------------------ swipe-eating panels */

  // The Gameforge lobby wraps panels in "perfect-scrollbar" (.ps / .scrollbar-container),
  // which cancels every swipe that starts inside it, even when the panel has nothing to
  // scroll. That makes the page scroll only from the empty sides. When such a panel cannot
  // scroll, keep the touch away from it so the page scrolls normally.
  function swipeEater(el) {
    var p = el && el.closest && el.closest('.ps, .scrollbar-container');
    if (!p) return null;
    var canScroll = p.scrollHeight > p.clientHeight + 1 || p.scrollWidth > p.clientWidth + 1;
    return canScroll ? null : p;
  }
  function shieldTouch(e) {
    if (swipeEater(e.target)) e.stopPropagation();   // our own document listeners still run
  }

  /* ------------------------------------------------------------ start */

  api.configure = function (c) {
    cfg = c || cfg;
    applyViewport();
    if (cam.key) { camClamp(); camApply(); }   // screen size changed: keep the map in bounds
  };

  // The game frame (#container) is taller than its box and must always stay at the top;
  // if anything scrolls it (e.g. focusing a field), put it back.
  function guardFrame() {
    var c = document.getElementById('container');
    if (!c || c.__ikmGuard) return;
    c.__ikmGuard = true;
    c.scrollTop = 0;
    c.addEventListener('scroll', function () { if (c.scrollTop !== 0) c.scrollTop = 0; });
    window.addEventListener('scroll', function () { if (window.scrollY || window.scrollX) window.scrollTo(0, 0); });
  }

  // Portrait: keep the two-row header and the side box under the window lined up with
  // whatever the game is showing (sizes change with the toolbar text and the open window).
  var layoutVars = {};
  function setVar(name, value) {
    if (layoutVars[name] === value) return;
    layoutVars[name] = value;
    document.documentElement.style.setProperty(name, value);
  }
  function portraitLayout() {
    if (!document.documentElement.classList.contains('ikm-portrait')) return;
    // The link row wraps onto two lines on a narrow screen: measure its real bottom.
    var tbBottom = 25;
    Array.prototype.forEach.call(document.querySelectorAll('#GF_toolbar li'), function (li) {
      var r = li.getBoundingClientRect();
      if (r.height > 0) tbBottom = Math.max(tbBottom, r.bottom);
    });
    var tb = Math.ceil(tbBottom + 3);
    setVar('--ikm-tb', tb + 'px');
    // Windows are 728 px wide: scale them to fit the screen width.
    var scale = Math.min(1, (window.innerWidth - 8) / 740);
    setVar('--ikm-winscale', scale.toFixed(3));
    // Window list height: window starts under the main panel; leave room under it for the
    // side box (~280 px) and the advisors panel at the bottom (~200 px).
    var advisorsTop = window.innerHeight - 205;
    var winh = ((advisorsTop - 280) - (tb + 177)) / scale - 31;
    setVar('--ikm-winh', Math.round(Math.max(300, winh)) + 'px');
    Array.prototype.forEach.call(document.querySelectorAll('.templateView .mainContent, #sidebar'), enlargeText);
    // Some windows (e.g. the detailed battle report) are wider than the usual 728 px: scale
    // each window by its own widest content so nothing is cut off at the screen edge.
    Array.prototype.forEach.call(document.querySelectorAll('.templateView'), function (tv) {
      var box = tv.querySelector('.mainContentBox');
      if (!box) return;
      var w = box.offsetWidth;
      Array.prototype.forEach.call(box.querySelectorAll('.mainContent *'), function (e) {
        if (e.offsetWidth > w) w = e.offsetWidth;            // content wider than its window
      });
      var s = Math.min(1, (window.innerWidth - 8) / (w + 12)).toFixed(3);
      if (tv.style.getPropertyValue('--ikm-ws') !== s) tv.style.setProperty('--ikm-ws', s);
    });
    // Side box: under the open window; with no window (e.g. island town info) just under
    // the main panel. Kept above the advisors panel when possible.
    var box = document.querySelector('.templateView .mainContentBox');
    var sb = document.getElementById('sidebar');
    var underPanel = tb + 185;
    var sbTop = (box && visible(box)) ? Math.round(box.getBoundingClientRect().bottom + 12) : underPanel;
    if (sb && sb.offsetHeight) sbTop = Math.max(underPanel, Math.min(sbTop, advisorsTop - sb.offsetHeight - 8));
    setVar('--ikm-sbtop', sbTop + 'px');
    // Put each window / panel where the player last dragged it.
    Array.prototype.forEach.call(document.querySelectorAll('.templateView'), restorePanelPos);
    if (sb) {
      if (sb.children.length) restorePanelPos(sb);
      else if (sb.hasAttribute('data-ikm-pos')) {   // emptied: forget, so the next one is placed again
        sb.removeAttribute('data-ikm-pos');
        sb.style.marginTop = ''; sb.style.marginLeft = '';
      }
    }
  }

  // Remembered window / panel positions (portrait), kept on the phone between sessions.
  // Each game window is remembered by its own name; the side panel separately for "under a
  // window" and for the island town panel.
  var POS_KEY = 'ikm.panelPos';
  var panelPos = {};
  try { panelPos = JSON.parse(localStorage.getItem(POS_KEY) || '{}') || {}; } catch (e) { panelPos = {}; }
  function panelKey(el) {
    if (el.id === 'sidebar') {
      var win = document.querySelector('.templateView .mainContentBox');
      return 'sidebar:' + (win && visible(win) ? 'window' : (document.body && document.body.id));
    }
    return el.id ? 'win:' + el.id : null;
  }
  // The scale a window is drawn at right now (fitted to the screen width).
  function winScale(tv) {
    return parseFloat(tv.style.getPropertyValue('--ikm-ws')) ||
           parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--ikm-winscale')) || 0.88;
  }
  function savePanelPos(el) {
    var k = panelKey(el);
    if (!k) return;
    panelPos[k] = { t: parseFloat(el.style.marginTop) || 0, l: parseFloat(el.style.marginLeft) || 0 };
    el.setAttribute('data-ikm-pos', k);
    try { localStorage.setItem(POS_KEY, JSON.stringify(panelPos)); } catch (e) { /* storage full / blocked */ }
  }
  function restorePanelPos(el) {
    var k = panelKey(el);
    if (!k || el.getAttribute('data-ikm-pos') === k) return;
    el.setAttribute('data-ikm-pos', k);
    var p = panelPos[k];
    el.style.marginTop = p ? p.t + 'px' : '';
    el.style.marginLeft = p ? p.l + 'px' : '';
  }
  function isPortrait() {
    return document.documentElement.classList.contains('ikm-portrait');
  }

  addStyle();
  applyViewport();
  if (GAME_HOST) {
    setInterval(portraitLayout, 400);
    setInterval(camCheck, 400);
    guardFrame();
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', guardFrame);
  }
  var opts = { passive: false, capture: true };
  document.addEventListener('touchstart', onStart, opts);
  document.addEventListener('touchmove', onMove, opts);
  document.addEventListener('touchend', onEnd, opts);
  document.addEventListener('touchcancel', onCancel, opts);
  ['touchstart', 'touchmove', 'touchend'].forEach(function (t) {
    document.addEventListener(t, shieldTouch, { passive: true, capture: true });
  });
  document.addEventListener('contextmenu', function (e) {
    if (cfg.touchFix && GAME_HOST) e.preventDefault();
  }, true);
  document.addEventListener('focusin', onFocusIn, true);
})();
