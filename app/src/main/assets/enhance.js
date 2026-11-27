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
  // Too early: a new page has no root element for its first moments. Nothing is installed then (a half
  // installed script was the "opens as a normal browser" bug); the app tries again right after.
  if (!document.documentElement) return;

  // The touch tutorial is a saved copy of a game page (no game scripts, no server): it is drawn the
  // same way, and has no bridge to the app.
  var DEMO = !!cfg.demo && location.protocol === 'file:';
  var A = DEMO ? demoBridge() : (window.IkmAndroid || null);    // native bridge
  // The tutorial's stand-in: More shows the same rows, App settings opens with sample data, and
  // nothing reaches the app.
  function demoBridge() {
    var none = function () {};
    return {
      openAppSettings: function () { setTimeout(function () { if (cfg.demoSettings) api.appSettings(cfg.demoSettings); }, 0); },
      switchServer: none, pickServer: none, appAction: none, saveSettings: none, compose: none,
      menus: none, page: none, seen: none, alive: none, tick: none, haptic: none, notch: none, gameVersion: none
    };
  }
  var GAME_HOST = DEMO || /^s\d+-[a-z]+\.ikariam\.gameforge\.com$/i.test(location.hostname);
  var api = {};                    // becomes window.__ikm once everything is installed (end of file)

  function first(selectors) {
    for (var i = 0; i < selectors.length; i++) {
      var el = document.querySelector(selectors[i]);
      if (el) return el;
    }
    return null;
  }

  // The app's own words, in the language of the server: the app passes them in cfg.words (i18n.txt).
  // English is only the fallback.
  var EN = {
    more: 'More', appSettings: 'App settings', avatar: 'Avatar', shop: 'Shop', editOrder: 'Edit order',
    saveOrder: 'Save order', defaultOrder: 'Default', saving: 'Saving\u2026', orderSaved: 'Town order saved',
    orderFailed: 'The order was not saved. Try again, or use the game\'s Options.',
    friends: 'Friends', cityMenu: 'Town menu', cancel: 'Cancel', close: 'Close', switchServer: 'Switch server', social: 'Social'
  };
  function tr(key) {
    return (cfg.words && cfg.words[key]) || EN[key];
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
    if (!portrait && document.documentElement.classList.contains('ikm-portrait')) { clearShifts(); restoreText(); clearPanelMoves(); }
    document.documentElement.classList.toggle('ikm-portrait', portrait);
    var thumb = portrait && cfg.layout !== 'classic';
    if (thumb !== isThumb()) {               // thumb <-> classic: each has its own panel positions
      document.documentElement.classList.toggle('ikm-thumb', thumb);
      closeSheet();
      clearPanelMoves();
      slideStop();
      Array.prototype.forEach.call(document.querySelectorAll('.templateView'), function (tv) { tv.style.removeProperty('--ikm-winh'); });
    }
    loadPanelPos();
    menuClasses();
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
      // (its place comes from layoutPanel; it must never end up behind a window)
      'html.ikm-portrait #sidebar { top: 300px !important; right: auto !important; left: 50% !important; z-index: 72 !important;' +
        ' transform: translateX(-50%) scale(var(--ikm-ss, 1)); transform-origin: top center; }',
      // a panel's body may hang down behind the bars and menus (only its top bar must stay in
      // bounds): map < windows < side box < side buttons < bars. While a full-width window is being
      // read the side buttons go under the panels, or they would cover its edges.
      'html.ikm-portrait #container .templateView { z-index: 70 !important; }',
      'html.ikm-portrait #container .templateView.focus { z-index: 71 !important; }',
      'html.ikm-portrait #container .slot_menu { z-index: 75 !important; }',
      'html.ikm-portrait.ikm-reading #container .slot_menu { z-index: 65 !important; }',
      'html.ikm-portrait #container #header { z-index: 80 !important; }',
      // X and back: same look, bigger targets (markHitBoxes), the back button further from the X
      'html.ikm-portrait #container .ikm-hit { overflow: visible !important; z-index: 3001 !important; }',     // over the content
      'html.ikm-portrait #container .ikm-hit::before { content: "" !important; display: block !important; position: absolute !important;' +
        ' left: 50% !important; top: 50% !important; right: auto !important; width: 44px !important; height: 44px !important;' +
        ' margin: -22px 0 0 -22px !important; padding: 0 !important; background: transparent !important; cursor: pointer; }',
      'html.ikm-portrait #container .mainHeader .ikm-hit::before { width: 52px !important; height: 52px !important; margin: -26px 0 0 -26px !important; }',
      'html.ikm-portrait #container .mainHeader .back.ikm-hit { translate: 34px 0; }',
      'html.ikm-portrait .direction_ltr #container .mainHeader .back.ikm-hit { translate: -34px 0; }',
      // rearrange buildings: Save and Cancel big and well apart (the box itself is drawn bigger)
      'html.ikm-portrait body.draggable-city #sidebar div:has(> #saveBuildingPositionsExecuteButton) {' +
        ' display: flex; flex-wrap: wrap; justify-content: space-between; padding: 0 8px 6px; }',
      'html.ikm-portrait body.draggable-city #sidebar div:has(> #saveBuildingPositionsExecuteButton) > p { width: 100%; box-sizing: border-box; }',
      'html.ikm-portrait body.draggable-city #sidebar div:has(> #saveBuildingPositionsExecuteButton) > button {' +
        ' min-width: 68px !important; max-width: 46%; min-height: 32px !important; margin: 0 !important; }',
      'html.ikm-moving #sidebar { pointer-events: none !important; opacity: .4; }',
      'html.ikm-moving .ikm-lifted .buildingimg { opacity: .35; }',
      '.ikm-ghost { position: fixed; left: 0; top: 0; z-index: 150001; pointer-events: none; transform-origin: 0 0; background-repeat: no-repeat; }',
      '.ikm-dropring { position: fixed; z-index: 150000; display: none; box-sizing: border-box; pointer-events: none;' +
        ' width: 160px; height: 160px; margin: -80px 0 0 -80px; border: 5px solid #35d13f; border-radius: 50%;' +
        ' background: rgba(53, 209, 63, .28); animation: ikm-blip .55s ease-out infinite; }',
      '@keyframes ikm-blip { 0% { transform: scale(.55); opacity: 1; } 100% { transform: scale(1.12); opacity: .25; } }',
      '.ikm-dropring.ikm-no { border-color: #e03020; background: rgba(224, 48, 32, .22); }',
      // the game\'s confirm box (e.g. demolish) stays above the side box
      'html.ikm-portrait #popupMessage { z-index: 101 !important; }',
      // side box rows the game makes exactly 52 px high (building queue, invitations): the bigger
      // text needs more, so they grow with it instead of cutting the timer
      'html.ikm-portrait #sidebar #constructionList .currentUnit, html.ikm-portrait #sidebar #constructionList .content ul li,' +
        ' html.ikm-portrait #sidebar #invitationList .currentUnit { height: auto !important; min-height: 52px; padding-bottom: 4px; }',
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
      // left-to-right servers: the whole city is the mirror image, so is the picture (it is centred on it)
      'html.ikm-cityflip #locations::after { transform: scaleX(-1); }',
      // The city's own ground art (top two tiles): mirrored too, fading into the jungle a little
      // above the join so the reflection is not noticeable.
      '#city_background_nw::before, #city_background_ne::before { content: ""; position: absolute; left: 0; right: 0;' +
        ' bottom: 100%; height: 100%; background-image: inherit; background-repeat: no-repeat; background-position: 0 0;' +
        ' transform: scaleY(-1); pointer-events: none;' +
        ' -webkit-mask-image: linear-gradient(to bottom, #000 0, #000 18%, transparent 60%);' +
        ' mask-image: linear-gradient(to bottom, #000 0, #000 18%, transparent 60%); }'
    ].concat(thumbCss()).join('\n');
    (document.head || document.documentElement).appendChild(s);
  }

  /* ------------------------------------------------------------ touch → mouse */

  var DRAG_START = 10;   // px a finger must move before it counts as a drag
  var LONG_MS = 450;     // long-press time for hover tooltips
  var LIFT_MS = 220;     // rearranging: hold this long and the building is picked up
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
    if (box) {
      var mc = box.querySelector('.mainContent');
      // zoomed content always pans, also in a window that is just as tall as its text
      if (mc && mc.__ikmView && mc.__ikmView.z > 1.01) return box;
      if (box.scrollHeight > box.clientHeight + 4) return box;
    }
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
    if (isThumb() && !quick.on) setOut(null);
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
    var item = ownMenuItem(el);
    if (item) {
      setOut(item);
    } else {
      mouse('mouseover', x, y, el, 0);
      mouse('mouseenter', x, y, el, 0);
    }
    hovered = el;
  }

  // Thumb: the hover info grows to the town bar's width (as much as fits above it) and sits just
  // above the town bar, the same gap as everything else, so the thumb does not cover it.
  function tipFit() {
    if (!isThumb()) return;
    var tip = Array.prototype.filter.call(document.querySelectorAll('.infoTip'), function (e) { return e.offsetWidth; })[0];
    var bar = document.getElementById('ikm-town');
    if (!tip || !bar) return;
    var br = bar.getBoundingClientRect(), top = 0;
    Array.prototype.forEach.call(document.querySelectorAll('[id^="js_GlobalMenu_"]'), function (e) {
      var r = e.getBoundingClientRect();
      if (r.height && r.top < window.innerHeight / 3) top = Math.max(top, r.bottom);
    });
    var k = Math.min(br.width / tip.offsetWidth, (br.top - PANEL_GAP - top - PANEL_GAP) / tip.offsetHeight);
    var root = document.documentElement.style;
    root.setProperty('--ikm-tipk', Math.max(1, k).toFixed(3));
    root.setProperty('--ikm-tipb', Math.round(window.innerHeight - br.top + PANEL_GAP) + 'px');
  }

  function longPress() {
    if (!g || g.mode !== 'pending') return;
    if (g.lift) { liftBuilding(g.x, g.y); return; }     // rearranging: held = picked up
    if (g.map && rearranging()) return;                 // no hover while rearranging
    g.mode = 'hover';
    hoverAt(g.x, g.y);
    mouse('mousemove', g.x, g.y, null, 0);
    tipFit();
    setTimeout(tipFit, 60);
    setTimeout(tipFit, 300);
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
    var bottomRoom = view === 'world' ? 0 : (isThumb() ? DOCK_TOP + 20 : 90);   // clear of the bottom bars
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
    var key = hit ? hit.file + (hit.flip ? '|flip' : '') : '';
    if (key === artKey) return;
    artKey = key;
    root.classList.toggle('ikm-cityart', !!hit);
    root.classList.toggle('ikm-cityflip', !!(hit && hit.flip));
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
  // Another town picked while a transport was open: the game left it showing the old town as the
  // place the goods leave from. Its window closes; its town list opens again, now for the new town.
  var watchedTown = '';
  function townWatch() {
    var id = currentTownId();
    if (!id) return;
    var was = watchedTown;
    watchedTown = id;
    if (!was || was === id) return;
    var tv = document.querySelector('.templateView[id^="transport"]');
    var x = tv && tv.querySelector('.close');
    if (x) x.click();
    if (closeTransport()) {
      setTimeout(function () {
        var l = document.querySelector('#js_viewCityMenu li.transportLauncher a, #js_viewCityMenu li.transportLauncher');
        if (l) l.click();
      }, 700);
    }
  }
  function camCheck() {
    townWatch();
    cityArt();
    var view = camView();
    var wm = document.getElementById('worldmap');
    if (!view || !wm) { cam.key = ''; return; }
    if (!wm.hasAttribute('data-ikm-cam')) wm.setAttribute('data-ikm-cam', String(++camSeq));
    var key = view + ':' + wm.getAttribute('data-ikm-cam');
    if (key !== cam.key) {
      cam.key = key;
      gameScaleNormal(view);
      camReset();
      focus = { view: view, key: key, until: performance.now() + 6000 };
      cam.town = currentTownId();
    }
    // World map: another town picked (town wheel) = the game jumps to its island: centre that one.
    if (view === 'world' && currentTownId() !== cam.town) {
      cam.town = currentTownId();
      focusAfterJump();
    }
    if (focus) mapFocus();
    mapBar();
  }
  // The game has a zoom of its own (the mouse wheel; it remembers it). On a phone the app zooms, so the
  // game's stays at its normal size: a town opened zoomed far out once it had been turned down.
  function gameScaleNormal(view) {
    if (view !== 'city' && view !== 'island') return;
    try {
      var sc = view === 'city' ? ikariam.worldview_scale_city : ikariam.worldview_scale_island;
      var steps = Math.round((Math.min(1, ikariam.worldview_scale_max || 1) - sc) / 0.05);
      if (!steps) return;
      var r = document.getElementById('worldview').getBoundingClientRect();
      ikariam.getController().scaleWorldMap(steps, r.left + r.width / 2, r.top + r.height / 2);
    } catch (e) { /* the game's own */ }
  }
  function markedIsland() {
    try { return JSON.stringify(window.worldmap && worldmap.markedIslandXY); } catch (e) { return ''; }
  }
  // The game is about to jump to another island: centre it once the game has marked it.
  // `to` = [x, y]: that island is then also selected, as by one tap on it (its info, add / remove).
  function focusAfterJump(to) {
    var now = markedIsland();
    var same = to && now === JSON.stringify([+to[0], +to[1]]);
    focus = { view: 'world', key: cam.key, until: performance.now() + 5000, after: same || to ? undefined : now, select: to || null,
              from: to ? performance.now() + 900 : 0 };
  }
  function tileAt(to) {
    var tiles = document.querySelectorAll('#map1 [id^="tile_"]');
    for (var i = 0; i < tiles.length; i++) if (tiles[i].mapX == to[0] && tiles[i].mapY == to[1]) return tiles[i];
    return null;
  }
  function selectIsland(to) {
    var t = tileAt(to);
    if (!t || !/islandTile/.test(t.className)) return;          // open sea: nothing to select
    try { worldmap.markIsland(t.id); } catch (e) { /* the game's own */ }
  }

  // A map just opened: the Town Hall (town), the player's own town (island) or island (world map) goes to the middle of
  // the map area. The game centres it in its 1024 px frame, which is wider than the phone's screen,
  // so it ended up at the side or off the screen. Given up once the player touches the map.
  var focus = null;
  function mapMiddle() {
    var top = 0;
    Array.prototype.forEach.call(document.querySelectorAll('[id^="js_GlobalMenu_"]'), function (e) {
      var r = e.getBoundingClientRect();
      if (r.height && r.top < window.innerHeight / 3) top = Math.max(top, r.bottom);
    });
    var bar = document.getElementById('ikm-town'), br = bar && bar.getBoundingClientRect();
    var bottom = br && br.height ? br.top : window.innerHeight - (isThumb() ? DOCK_TOP : 90);
    return { x: window.innerWidth / 2, y: (top + bottom) / 2 };
  }
  function focusSpot(view) {
    if (view === 'world') return document.querySelector('#worldmap .islandMarked');
    if (view === 'city') return document.querySelector('#locations #position0');
    var id = currentTownId(), name = '';
    try { name = String(ikariam.model.relatedCityData['city_' + id].name || ''); } catch (e) { /* by id only */ }
    var spots = document.querySelectorAll('#worldmap .cityLocation.own:not(.cityLocationScroll)');
    for (var i = 0; i < spots.length; i++) {
      var s = spots[i];
      if (id && s.innerHTML.indexOf('cityId=' + id) >= 0) return s;
      var label = document.getElementById(s.id + 'Scroll');
      if (name && label && label.textContent.trim() === name) return s;
    }
    return null;
  }
  function mapFocus() {
    if (performance.now() > focus.until || g) { focus = null; return; }
    if (focus.after !== undefined && markedIsland() === focus.after) return;   // the jump has not happened yet
    if (focus.from && performance.now() < focus.from) return;                  // the map is being redrawn
    // a jump to coordinates: that place itself (it may be open sea), else the marked island
    var spot = (focus.select && tileAt(focus.select)) || focusSpot(focus.view), r = spot && spot.getBoundingClientRect();
    if (!r || !r.width) return;                       // not drawn yet: next time
    var m = mapMiddle(), dx = m.x - (r.left + r.right) / 2, dy = m.y - (r.top + r.bottom) / 2;
    var sel = focus.select;
    focus = null;
    if (sel) setTimeout(function () { selectIsland(sel); }, 350);
    if (Math.abs(dx) < 4 && Math.abs(dy) < 4) return;
    if (camView() === 'world') {
      // the game moves the world map (and loads its tiles): drag it, as a finger would
      var steps = Math.ceil(Math.max(Math.abs(dx) / (window.innerWidth * 0.8), Math.abs(dy) / (window.innerHeight * 0.5), 1));
      for (var k = 0; k < steps; k++) {
        var sx = m.x - dx / steps / 2, sy = m.y - dy / steps / 2;
        mouse('mousedown', sx, sy, null, 1);
        for (var j = 1; j <= 4; j++) mouse('mousemove', sx + dx / steps * j / 4, sy + dy / steps * j / 4, null, 1);
        mouse('mouseup', sx + dx / steps, sy + dy / steps, null, 0);
      }
      return;
    }
    cam.tx += dx;
    cam.ty += dy;
    camClamp();
    camApply();
  }

  // World map (thumb): the game's own navigation sits in its bottom bar, which portrait hides. This
  // bar of the app's, under the breadcrumbs, presses it:
  // - X / Y: a tap selects the number (typing replaces it); Next goes to the other box, whichever came
  //   first; once both were typed the key says Go and jumps there (the game's coordinate jump), and the
  //   island is selected as by one tap on it.
  // - the island button: the selected island (its name, your town on it, its resource, coordinates);
  //   it opens the game's island shortcut list (your towns and the islands you saved, kept by the game)
  //   as a list in the game's style.
  // - add / remove: the game's own buttons for the selected island (shown when the game shows them).
  var ISLAND_CACHE = 'ikm.islands.';
  function islandInfo(x, y) {
    var host = location.host, key = x + ':' + y, cache = {};
    try { cache = JSON.parse(localStorage.getItem(ISLAND_CACHE + host) || '{}') || {}; } catch (e) { cache = {}; }
    var a = null;
    try { a = worldmap.islands[x][y]; } catch (e) { a = null; }
    if (a && a.length > 2 && a[1]) {
      var info = [String(a[1]), parseInt(a[2], 10) || 0];
      if (!cache[key] || cache[key][0] !== info[0] || cache[key][1] !== info[1]) {
        cache[key] = info;
        try { localStorage.setItem(ISLAND_CACHE + host, JSON.stringify(cache)); } catch (e) { /* only a convenience */ }
      }
      return info;
    }
    return cache[key] || null;
  }
  var GOOD_ICONS = { 1: 'icon_wine.png', 2: 'icon_marble.png', 3: 'icon_glass.png', 4: 'icon_sulfur.png' };
  function goodIcon(n) {
    var f = GOOD_ICONS[n];
    if (!f) return null;
    var img = mk('img');
    img.src = '/cdn/all/both/' + (document.documentElement.classList.contains('ikm-rtl') ? 'rtl/' : '') + 'resources/' + f;
    img.alt = '';
    img.onerror = function () { if (img.src.indexOf('/rtl/') < 0) img.src = img.src.replace('/both/', '/both/rtl/'); };
    return img;
  }
  // The game's shortcut list: [{x, y, text, own, towns}] (own = one of your towns is on that island),
  // one entry per island (the game lists each town, so an island with four towns came four times).
  function shortcutList() {
    var seen = {}, out = [];
    shortcutEntries().forEach(function (s) {
      var k = s.x + ':' + s.y;
      if (!seen[k]) { seen[k] = s; s.towns = []; out.push(s); }
      if (s.own && s.text && seen[k].towns.indexOf(s.text) < 0) seen[k].towns.push(s.text);
      if (s.own) seen[k].own = true;
    });
    return out;
  }
  function shortcutEntries() {
    var gs = document.getElementById('js_homeCitySelect'), sc = {};
    try { sc = ikariam.getModel().shortcuts || {}; } catch (e) { sc = {}; }
    if (!gs) return [];
    return Array.prototype.map.call(gs.options, function (o) {
      var c = /^(\d+):(\d+)$/.exec(o.value);
      if (!c) return null;
      var x = +c[1], y = +c[2], kind = sc[x] && sc[x][y];
      return { x: x, y: y, text: o.text.replace(/\[\s*\d+\s*:\s*\d+\s*\]/, '').trim(), own: kind == 2 };
    }).filter(Boolean);
  }
  // The resource, the island's name with your towns on it (in brackets, parted by dots) and the
  // coordinates, into `el`. In the list the towns go on their own line(s) under the name.
  function islandLine(el, x, y, fallback, stacked) {
    el.innerHTML = '';
    var entry = shortcutList().filter(function (s) { return s.x == x && s.y == y; })[0];
    var info = islandInfo(x, y), towns = entry && entry.own ? entry.towns : [];
    var saved = entry && !entry.own ? entry : null;
    var name = info ? info[0] : (saved ? saved.text : (fallback || ''));
    if (saved && info && saved.text && saved.text !== info[0]) name = saved.text + ' \u00b7 ' + info[0];
    var icon = info && goodIcon(info[1]);
    if (icon) el.appendChild(icon);
    var text = el.appendChild(mk('span', 'tx' + (stacked ? ' stacked' : '')));
    text.appendChild(mk('b', 'nm', name));
    if (towns.length) {
      var tw = text.appendChild(mk('span', 'towns'));
      tw.appendChild(document.createTextNode('('));
      towns.forEach(function (t, i) {
        if (i) tw.appendChild(mk('span', 'dot', '\u2022'));
        tw.appendChild(mk('span', 'town', t));
      });
      tw.appendChild(document.createTextNode(')'));
    }
    el.appendChild(mk('span', 'xy', '[' + x + ':' + y + ']'));
  }
  function mapBar() {
    var bar = document.getElementById('ikm-mapbar');
    var on = isThumb() && camView() === 'world' && document.getElementById('mapCoordInput');
    if (!on) { if (bar) { bar.hidden = true; closeMapDrop(); } return; }
    if (!bar) bar = makeMapBar();
    bar.hidden = false;
    var top = 0;
    Array.prototype.forEach.call(document.querySelectorAll('#breadcrumbs, #servertime, .servertime, #GF_toolbar'), function (e) {
      var r = e.getBoundingClientRect();
      if (r.height && r.top < window.innerHeight / 3) top = Math.max(top, r.bottom);
    });
    bar.style.top = Math.round(top + PANEL_GAP) + 'px';
    var mx = bar.querySelector('#ikm-mx'), my = bar.querySelector('#ikm-my');
    var editing = document.activeElement === mx || document.activeElement === my;
    // the boxes show the selected island's coordinates (the game keeps them), unless being typed in
    var gx = document.getElementById('inputXCoord'), gy = document.getElementById('inputYCoord');
    if (!editing && gx && gy) {
      if (mx.value !== gx.value) mx.value = gx.value;
      if (my.value !== gy.value) my.value = gy.value;
    }
    var mark = null;
    try { mark = worldmap.markedIslandXY; } catch (e) { mark = null; }
    var x = mark && mark.length === 2 ? mark[0] : parseInt(gx && gx.value, 10), y = mark && mark.length === 2 ? mark[1] : parseInt(gy && gy.value, 10);
    var pick = bar.querySelector('#ikm-mpick .line');
    var sig = x + ':' + y + '|' + shortcutList().map(function (s) { return s.x + ':' + s.y + s.text + s.towns.join(); }).join(',') + '|' + !!islandInfo(x, y);
    if (x > 0 && y > 0 && pick.__ikmSig !== sig) { pick.__ikmSig = sig; islandLine(pick, x, y); }
    var shown = function (id) { var e = document.getElementById(id); return !!(e && e.style.display !== 'none' && e.style.display !== ''); };
    var add = document.getElementById('islandAddButton'), del = document.getElementById('islandRemoveButton');
    bar.querySelector('#ikm-madd').hidden = !shown('islandAddButton');
    bar.querySelector('#ikm-mdel').hidden = !shown('islandRemoveButton');
    if (add) bar.querySelector('#ikm-madd').title = add.title;
    if (del) bar.querySelector('#ikm-mdel').title = del.title;
  }
  function makeMapBar() {
    var bar = document.createElement('div');
    bar.id = 'ikm-mapbar';
    bar.className = 'ikm-ui';
    bar.innerHTML = '<label>X<input id="ikm-mx" type="text" inputmode="numeric" maxlength="3" autocomplete="off" enterkeyhint="next"></label>' +
      '<label>Y<input id="ikm-my" type="text" inputmode="numeric" maxlength="3" autocomplete="off" enterkeyhint="next"></label>' +
      '<input class="stop" type="text" aria-hidden="true" autocomplete="off">' +
      '<button id="ikm-mgo" type="button">\u279C</button>' +
      '<button id="ikm-mpick" type="button"><span class="line"></span><span class="arrow">\u25BE</span></button>' +
      '<button id="ikm-madd" type="button">\u2605</button><button id="ikm-mdel" type="button">\u2715</button>';
    document.body.appendChild(bar);
    var mx = bar.querySelector('#ikm-mx'), my = bar.querySelector('#ikm-my'), stop = bar.querySelector('.stop');
    var other = function (i) { return i === mx ? my : mx; };
    var go = function () {
      var x = parseInt(mx.value, 10), y = parseInt(my.value, 10);
      var gx = document.getElementById('inputXCoord'), gy = document.getElementById('inputYCoord');
      if (!(x > 0 && y > 0) || !gx || !gy) return;
      mx.__typed = my.__typed = false;
      if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
      closeMapDrop();
      gx.value = x; gy.value = y;
      focusAfterJump([x, y]);
      try { ikariam.getMapNavigation().jumpToCoord(); } catch (e) { focus = null; }
    };
    var selectAll = function (i) { setTimeout(function () { try { i.select(); } catch (e) { /* not focused */ } }, 0); };
    [mx, my].forEach(function (i) {
      i.addEventListener('focus', function () {
        // the keyboard's key: Go once the other box was typed in, else Next (to the other box)
        i.enterKeyHint = other(i).__typed ? 'go' : 'next';
        selectAll(i);
        setTimeout(function () { if (document.activeElement === i) selectAll(i); }, 120);
        closeMapDrop();
      });
      i.addEventListener('mouseup', function () { selectAll(i); });
      i.addEventListener('input', function () { i.value = i.value.replace(/\D+/g, ''); i.__typed = true; });
      i.addEventListener('keydown', function (e) {
        if (e.key !== 'Enter') return;
        e.preventDefault();
        if (other(i).__typed || i.enterKeyHint === 'go') go(); else other(i).focus();
      });
      i.addEventListener('blur', function () {
        setTimeout(function () {
          var a = document.activeElement;
          if (a !== mx && a !== my && a !== stop) mx.__typed = my.__typed = false;   // left the boxes: start again
        }, 0);
      });
    });
    // the keyboard's Next from Y lands on this invisible stop: it passes on to X
    stop.addEventListener('focus', function () { mx.focus(); });
    bar.querySelector('#ikm-mgo').addEventListener('click', go);
    bar.querySelector('#ikm-mpick').addEventListener('click', function (e) {
      e.stopPropagation();
      if (document.getElementById('ikm-mapdrop')) closeMapDrop(); else openMapDrop(bar);
    });
    bar.querySelector('#ikm-madd').addEventListener('click', function () {
      closeMapDrop();
      var b2 = document.getElementById('islandAddButton'); if (b2) b2.click();
    });
    bar.querySelector('#ikm-mdel').addEventListener('click', function () {
      closeMapDrop();
      var b2 = document.getElementById('islandRemoveButton'); if (b2) b2.click();
    });
    return bar;
  }
  // The shortcut list, dropping down from the island button: each island with its resource,
  // name (your town on it) and coordinates.
  function openMapDrop(bar) {
    closeMapDrop();
    var list = shortcutList();
    if (!list.length) return;
    var drop = document.createElement('div');
    drop.id = 'ikm-mapdrop';
    drop.className = 'ikm-ui';
    var title = (document.getElementById('mapShortcutInput') || {}).title;
    if (title) drop.appendChild(mk('div', 'hd', title.replace(/-/g, ' ')));
    var mark = null;
    try { mark = worldmap.markedIslandXY; } catch (e) { mark = null; }
    // your towns' islands first, then (under a line) the islands you saved, each with its own delete
    var own = list.filter(function (s) { return s.own; }), saved = list.filter(function (s) { return !s.own; });
    own.concat(saved).forEach(function (s, i) {
      if (i === own.length && own.length && saved.length) drop.appendChild(mk('div', 'sep'));
      var b = mk('div', 'row' + (mark && mark[0] == s.x && mark[1] == s.y ? ' current' : ''));
      b.setAttribute('role', 'button');
      islandLine(b, s.x, s.y, s.text, true);
      if (!s.own) {
        var del = mk('button', 'del', '\u2715');
        del.type = 'button';
        del.title = (document.getElementById('islandRemoveButton') || {}).title || '';
        del.addEventListener('click', function (e) {
          e.stopPropagation();
          closeMapDrop();
          removeShortcut(s);
        });
        b.appendChild(del);
      }
      b.addEventListener('click', function (e) {
        e.stopPropagation();
        closeMapDrop();
        var gs = document.getElementById('js_homeCitySelect');
        if (!gs) return;
        gs.value = s.x + ':' + s.y;
        focusAfterJump([s.x, s.y]);
        try { ikariam.getMapNavigation().jumpToShortcut(); } catch (err) { focus = null; }
      });
      drop.appendChild(b);
    });
    var r = bar.querySelector('#ikm-mpick').getBoundingClientRect();
    drop.style.top = Math.round(bar.getBoundingClientRect().bottom + 4) + 'px';
    document.body.appendChild(drop);
    setTimeout(function () { document.addEventListener('touchstart', dropOutside, true); }, 0);
  }
  // The game's own "remove from the shortcut list", with its own question (Yes / Cancel).
  function removeShortcut(s) {
    var f = function (id, v) { var e = document.getElementById(id); if (e) e.value = v; return !!e; };
    var info = islandInfo(s.x, s.y);
    if (!f('js_shortcutX', s.x) || !f('js_shortcutY', s.y)) return;
    f('js_shortcutFunction', 'removeIslandFromShortcut');
    f('js_shortcutName', s.text || (info && info[0]) || '');
    try { window.confirmShortcutAction(0); } catch (e) { /* the game's own */ }
  }
  function dropOutside(e) {
    var d = document.getElementById('ikm-mapdrop');
    if (d && !d.contains(e.target) && !(e.target.closest && e.target.closest('#ikm-mpick'))) closeMapDrop();
  }
  function closeMapDrop() {
    var d = document.getElementById('ikm-mapdrop');
    document.removeEventListener('touchstart', dropOutside, true);
    if (!d) return false;
    d.parentNode.removeChild(d);
    return true;
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
  // A tap on a town's building goes to its link: the top piece at that point can be the building's
  // picture or a neighbour's (the Pirate Fortress' picture covers its own link), which opens nothing.
  function tapTarget(x, y) {
    var el = document.elementFromPoint(x, y);
    if (!el || !el.closest || !el.closest('#locations') || el.closest('a[href], [onclick]')) return el;
    var all = document.elementsFromPoint(x, y);
    for (var i = 0; i < all.length; i++) {
      var a = all[i].closest && all[i].closest('#locations a[href], #locations [onclick]');
      if (a) return a;
    }
    var b = el.closest('#locations .building'), own = b && b.querySelector('a[href], [onclick]');
    return own || el;
  }
  function tapAt(x, y) {
    var el = tapTarget(x, y);
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
    if (g.lift) { liftBuilding(t.clientX, t.clientY); return; }
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
      var from = (panelBox(g.win) || g.win).getBoundingClientRect();
      g.px0 = from.left; g.py0 = from.top;
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
        if (g.mode === 'windrag') savePanelPos(g.win);
        if (g.mode === 'bdrag') putDown(false);
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
    if (autoOpen && target.closest && !target.closest('#js_viewCityMenu, #ikm-tcity, #js_transportPanel')) retractAuto();
    if (target.closest && target.closest('.ikm-ui')) {   // the app's own bars / lists: plain taps and scrolling
      clearHover();
      g = null;
      return;
    }
    if (hovered) clearHover();                 // any touch ends the hover info (also a touch on it)
    if (isEditable(target)) { g = null; return; }
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
    // A slider (transport, trades...): a touch on its knob takes it at once; one on its track takes it
    // when the finger then moves sideways (up / down still scrolls the window).
    var sl = !map && sliderAt(t.clientX, t.clientY);
    if (sl) {
      g.sl = sl;
      if (sl.onThumb) { if (e.cancelable) e.preventDefault(); sliderGrab(t.clientX); }
    }
    // Inside zoomed window content: one finger pans, a double-tap on empty space resets.
    if (box && isPortrait() && box.classList.contains('mainContentScroll')) {
      var zmc = box.querySelector('.mainContent');
      if (zmc && zmc.__ikmView && zmc.__ikmView.z > 1.01) g.zoomed = zmc;
    }
    if (map) camCheck();
    if (map && g.cam === 'city' && rearranging()) g.lift = buildingUnder(t.clientX, t.clientY);
    g.timer = setTimeout(longPress, g.lift ? LIFT_MS : LONG_MS);
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

    if (g.mode === 'pending' && g.sl && Math.abs(dx) >= 6 && Math.abs(dx) > Math.abs(dy)) {
      clearTimeout(g.timer);
      sliderGrab(t.clientX);
    }
    if (g.mode === 'slider') {
      if (e.cancelable) e.preventDefault();
      sliderMove(t.clientX);
      return;
    }

    if (g.mode === 'bdrag') {                  // a building being moved
      if (e.cancelable) e.preventDefault();
      g.x = t.clientX;
      g.y = t.clientY;
      return;
    }

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
      movePanel(g.win, g.px0 + dx, g.py0 + dy, false);
      updateReading();
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
    if (g.mode === 'bdrag') {
      if (e.cancelable) e.preventDefault();
      putDown(true);
    } else if (g.mode === 'slider') {
      if (e.cancelable) e.preventDefault();
      mouse('mouseup', g.sl.mx, g.sl.my, null, 0);
    } else if (g.mode === 'drag') {
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
        if (ownMenuItem(exp)) setOut(exp); else mouse('mouseover', g.x0, g.y0, g.target, 0);
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
      if (g.mode === 'windrag') savePanelPos(g.win);
      if (g.mode === 'bdrag') putDown(false);
      if (g.mode === 'slider') mouse('mouseup', g.sl.mx, g.sl.my, null, 0);
    }
    g = null;
  }



  /* ------------------------------------------------------------ sliders */

  // The game's sliders are made for a mouse: a knob 14 px wide. Here the knob can be taken from a
  // wide band around it, follows the finger exactly (the window is scaled, the game is not told) and
  // ticks on every step of its number, firmer at both ends.
  function sliderAt(x, y) {
    var best = null, bd = 1e9;
    // every knob in a game window (transport, trades, barracks, shipyard, tavern...), whatever its track is called
    Array.prototype.forEach.call(document.querySelectorAll('.templateView .sliderthumb, #sidebar .sliderthumb'), function (th) {
      var bg = th.closest('.sliderbg') || th.parentElement;
      var r = bg.getBoundingClientRect(), k = th.getBoundingClientRect();
      if (!r.width || !k.width || r.width < 40) return;
      var cy = (r.top + r.bottom) / 2, band = Math.max(26, r.height);
      if (x < r.left - 24 || x > r.right + 24 || Math.abs(y - cy) > band) return;
      var d = Math.abs(y - cy);
      if (d < bd) {
        bd = d;
        var kx = (k.left + k.right) / 2, s = th.closest('.sliderinput') || bg.parentElement;
        best = { el: s, bg: bg, thumb: th, onThumb: Math.abs(x - kx) <= Math.max(44, k.width * 1.5), input: sliderInput(s) };
      }
    });
    return best;
  }
  // The number box that goes with the slider: the nearest one around it (units keep theirs further away).
  function sliderInput(s) {
    var r = s.getBoundingClientRect(), cx = (r.left + r.right) / 2, cy = (r.top + r.bottom) / 2;
    for (var a = s.parentElement, n = 0; a && n < 5; a = a.parentElement, n++) {
      var best = null, bd = 1e9;
      Array.prototype.forEach.call(a.querySelectorAll('input[type=text], input[type=number], input:not([type])'), function (i) {
        var q = i.getBoundingClientRect();
        if (!q.width) return;
        var d = Math.abs((q.top + q.bottom) / 2 - cy) * 2 + Math.abs((q.left + q.right) / 2 - cx) * 0.2;
        if (d < bd) { bd = d; best = i; }
      });
      if (best && bd < 260) return best;
    }
    return null;
  }
  function sliderGrab(x) {
    var sl = g.sl, k = sl.thumb.getBoundingClientRect();
    clearHover();
    g.mode = 'slider';
    sl.scale = (k.width / (sl.thumb.offsetWidth || k.width)) || 1;    // screen px per game px
    sl.mx = (k.left + k.right) / 2;
    sl.my = (k.top + k.bottom) / 2;
    sl.x0 = sl.mx;
    sl.last = sl.input ? sl.input.value : '';
    sl.at = k.left;
    sl.buzzAt = 0;
    mouse('mouseover', sl.mx, sl.my, sl.thumb, 0);
    mouse('mousedown', sl.mx, sl.my, sl.thumb, 1);
    sliderMove(x);                                  // the knob comes to the finger
  }
  function sliderMove(x) {
    var sl = g.sl;
    sl.mx = sl.x0 + (x - sl.x0) / sl.scale;
    mouse('mousemove', sl.mx, sl.my, null, 1);
    // a tick on each step of its number; a slider without a number box ticks every few pixels
    var k0 = sl.thumb.getBoundingClientRect();
    if (sl.input) {
      var v = sl.input.value;
      if (v === sl.last) return;
      sl.last = v;
    } else {
      if (Math.abs(k0.left - sl.at) < 8) return;
      sl.at = k0.left;
    }
    var now = performance.now();
    if (cfg.wheelBuzz === false || !A || !A.notch || now - sl.buzzAt < 28) return;
    var bg = sl.bg.getBoundingClientRect(), k = sl.thumb.getBoundingClientRect();
    A.notch(k.left <= bg.left + 1 || k.right >= bg.right - 1);
    sl.buzzAt = now;
  }

  /* ------------------------------------------------------------ rearrange buildings */

  // The game's "Rearrange Buildings" is made for a mouse, and its drag measures wrong on a zoomed map.
  // Here the finger picks a building up, the map moves along at the screen's edges, and letting go
  // runs the game's own swap. Nothing is sent until the player presses the game's Save.
  var EDGE_SPEED = 0.55;        // px per ms
  var EDGE = 70;                // px from the screen's edges where the map moves along

  function rearranging() {
    return !!(document.body && document.body.classList.contains('draggable-city'));
  }
  function cityPositions() {
    try { return ikariam.backgroundView.screen.data.position; } catch (e) { return null; }
  }
  // The building spot at a point of the map: the game's hit shape first, else the name plate.
  function spotAt(x, y) {
    var top = document.elementFromPoint(x, y);
    if (!top || !onMap(top)) return null;
    var all = document.elementsFromPoint(x, y), spot = null, i;
    for (i = 0; i < all.length && !spot; i++) {
      if (all[i].classList.contains('draggableElement')) spot = all[i].closest('.building');
    }
    for (i = 0; i < all.length && !spot; i++) {
      var item = all[i].closest('#locations .buildingItem'), plate = all[i].closest('#locations .cityScroll');
      if (item) {
        spot = item.closest('.building');
      } else if (plate) {
        var n = /\bposition(\d+)\b/.exec(plate.getAttribute('class') || '');
        if (n) spot = document.getElementById('position' + n[1]);
      }
    }
    if (!spot || !spot.hasAttribute('data-id')) return null;
    return { el: spot, id: parseInt(spot.getAttribute('data-id'), 10) };
  }
  // Where a building stands on the ground: an empty lot's picture, else its spot widened (the game's
  // hit shape starts well above the ground, so the green mark floated over the lot and a drop on the
  // lot's lower half missed).
  function groundRect(b) {
    var img = b.classList.contains('buildingGround') && b.querySelector('.buildingimg'), r;
    if (img && (r = img.getBoundingClientRect()).width) return { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
    r = b.getBoundingClientRect();
    if (!r.width) return null;
    var cx = (r.left + r.right) / 2, cy = (r.top + r.bottom) / 2, w = r.width * 0.75, h = r.height * 0.95;
    return { left: cx - w, top: cy - h, right: cx + w, bottom: cy + h };
  }
  // The spot whose ground is under the finger (the nearest one if grounds overlap), else the game's shapes.
  function dropSpotAt(x, y) {
    var best = null, bd = 1e9;
    Array.prototype.forEach.call(document.querySelectorAll('#locations .building[data-id]'), function (b) {
      var r = groundRect(b);
      if (!r || x < r.left || x > r.right || y < r.top || y > r.bottom) return;
      var dx = (x - (r.left + r.right) / 2) / (r.right - r.left), dy = (y - (r.top + r.bottom) / 2) / (r.bottom - r.top);
      var d = dx * dx + dy * dy;
      if (d < bd) { bd = d; best = { el: b, id: parseInt(b.getAttribute('data-id'), 10), r: r }; }
    });
    return best || spotAt(x, y);
  }
  function canMove(id) {
    var all = cityPositions(), p = all && all[id];
    return !!(p && p.buildingId !== null && p.buildingId !== undefined && !p.isBusy && !p.completed && !p.inConstructionList);
  }
  // The game's own rules, only for the green / red mark: its swap decides.
  function canDrop(from, to) {
    var all = cityPositions();
    if (!all || from === to || !canMove(from) || !all[to]) return false;
    var a = all[from], b = all[to], taken = b.buildingId !== null;
    if (!b.allowedBuildings || b.allowedBuildings.indexOf(a.buildingId) < 0) return false;
    if (taken && (!a.allowedBuildings || a.allowedBuildings.indexOf(b.buildingId) < 0)) return false;
    if (b.isBusy || b.completed || b.inConstructionList) return false;
    var el = document.getElementById('position' + to);
    return !(el && el.classList.contains('lockedPosition'));
  }
  // Touching a movable building: it can be dragged at once, or held and then dragged.
  function buildingUnder(x, y) {
    var s = spotAt(x, y);
    return s && canMove(s.id) ? s : null;
  }
  function liftBuilding(x, y) {
    var d = g.lift;
    clearTimeout(g.timer);
    clearHover();
    g.mode = 'bdrag';
    g.x = x;
    g.y = y;
    document.documentElement.classList.add('ikm-moving');
    d.el.classList.add('ikm-lifted');
    d.ring = document.body.appendChild(mk('div', 'ikm-dropring'));
    d.ghost = document.body.appendChild(mk('div', 'ikm-ghost'));
    var img = d.el.querySelector('.buildingimg'), w = 110, h = 90;
    if (img) {
      var cs = getComputedStyle(img);
      w = parseFloat(cs.width) || w;
      h = parseFloat(cs.height) || h;
      d.ghost.style.backgroundImage = cs.backgroundImage;
      d.ghost.style.backgroundPosition = cs.backgroundPosition;
      d.ghost.style.backgroundSize = cs.backgroundSize;
    }
    d.k = Math.min(1, 170 / w, 150 / h);
    d.ghost.style.width = w + 'px';
    d.ghost.style.height = h + 'px';
    d.w = w;
    d.h = h;
    d.at = performance.now();
    if (A && A.haptic) A.haptic();
    buildingFrame();
  }
  function buildingFrame() {
    if (!g || g.mode !== 'bdrag') return;
    var d = g.lift, W = window.innerWidth, H = window.innerHeight, x = g.x, y = g.y;
    var town = rectOf('ikm-town'), low = town ? town.top : H - 90, high = isThumb() ? STRIP_H + 40 : 120;
    // only once the finger has gone that way: picking up a building at the edge must not move the map
    var vx = x < EDGE && x < g.x0 - DRAG_START ? 1 : x > W - EDGE && x > g.x0 + DRAG_START ? -1 : 0;
    var vy = y < high + EDGE && y < g.y0 - DRAG_START ? 1 : y > low - EDGE && y > g.y0 + DRAG_START ? -1 : 0;
    var now = performance.now(), step = Math.min(50, now - d.at) * EDGE_SPEED;
    d.at = now;
    if (vx || vy) {
      cam.tx += vx * step;
      cam.ty += vy * step;
      camClamp();
      camApply();
    }
    // the picture floats above the finger, so the place under the finger stays in sight
    // the building sits under the thumb
    d.ghost.style.transform = 'translate(' + (x - d.w * d.k / 2).toFixed(1) + 'px,' + (y - d.h * d.k * 0.6).toFixed(1) + 'px) scale(' + d.k.toFixed(3) + ')';
    var to = dropSpotAt(x, y);
    d.to = to && to.id !== d.id ? to : null;
    // a good place under the thumb: a green ring pulses out from behind it, and a firm buzz
    var ok = !!(d.to && canDrop(d.id, d.to.id));
    d.ring.style.display = ok ? 'block' : 'none';
    if (ok) {
      d.ring.style.left = x + 'px';
      d.ring.style.top = y + 'px';
      if (d.okId !== d.to.id) {
        d.okId = d.to.id;
        if (A && A.notch && cfg.wheelBuzz !== false) A.notch(true); else if (A && A.haptic) A.haptic();
      }
    } else {
      d.okId = null;
    }
    d.raf = requestAnimationFrame(buildingFrame);
  }
  function putDown(drop) {
    var d = g && g.lift;
    if (!d || !d.ghost) return;
    cancelAnimationFrame(d.raf);
    var to = drop ? dropSpotAt(g.x, g.y) : null;       // before the box takes touches again
    [d.ghost, d.ring].forEach(function (e) { e.parentNode.removeChild(e); });
    d.ghost = d.ring = null;
    d.el.classList.remove('ikm-lifted');
    document.documentElement.classList.remove('ikm-moving');
    if (!to || to.id === d.id || typeof window.swapPositionsIfPossible !== 'function') return;
    if (!window.swapPositionsIfPossible(d.id, to.id)) return;
    // what the game does after its own drop
    if (typeof window.setDraggables === 'function') window.setDraggables();
    if (typeof window.setDroppables === 'function') window.setDroppables();
    if (A && A.tick) A.tick();
  }
  // Back = the game's own Cancel: nothing moved is saved.
  function cancelRearrange() {
    if (!rearranging()) return false;
    var save = document.getElementById('saveBuildingPositionsExecuteButton');
    var cancel = save && save.parentNode.querySelector('button:not(#saveBuildingPositionsExecuteButton)');
    if (cancel) cancel.click(); else location.reload();
    return true;
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

  /* numbers: the game's amount boxes are plain text boxes, so they got the full (Arabic) keyboard */

  var NOT_NUMBER = /name|ally_?tag|^tag|subject|text(?!field)|msg|message|mail|pass|search(?!.*coord)|note|desc|player|avatar/i;
  var NUMBER_WORD = /amount|count|qty|quantity|number|price|cargo|resource|tradegood|coord|ship|unit|bid|donat|gold|transporter|freighter|textfield_|^(input)?_?[xy]$/i;

  // A box that only takes a number: an amount, a price, coordinates.
  function looksNumeric(el) {
    if (!el || el.tagName !== 'INPUT' || el.readOnly) return false;
    if (el.hasAttribute('data-ikm-number')) return true;
    var t = (el.getAttribute('type') || 'text').toLowerCase();
    if (t === 'number') return true;
    if (t !== 'text' && t !== 'tel') return false;
    var names = [el.id || '', el.getAttribute('name') || ''];
    if (names.some(function (n) { return NOT_NUMBER.test(n); })) return false;
    // Workers and donations (the island's mines and the wonder): whatever the box's size.
    var purpose = el.form ? Array.prototype.map.call(el.form.querySelectorAll('input[type="hidden"]'), function (h) {
      return h.name + '=' + h.value;
    }).join(' ') : '';
    var v0 = englishDigits(el.value || '').replace(/[,.\s]/g, '');
    if ((/donat|worker/i.test(names.join(' ')) || /function=(\w*donat\w*|workerPlan)/i.test(purpose)) && (!v0 || /^\d+$/.test(v0))) return true;
    var small = (el.maxLength > 0 && el.maxLength <= 12) || (el.hasAttribute('size') && el.size <= 8);
    if (!small) {
      var w = el.getBoundingClientRect().width;
      small = w > 0 && w < 100;
    }
    if (!small) return false;
    var v = englishDigits(el.value || '').replace(/[,.\s]/g, '');
    return /^\d+$/.test(v) || (!v && names.some(function (n) { return NUMBER_WORD.test(n); }));
  }
  // Arabic and Persian digits -> English ones, the only ones the game reads.
  function englishDigits(text) {
    return text.replace(/[\u0660-\u0669\u06f0-\u06f9]/g, digitOf);
  }
  function digitOf(c) {
    var n = c.charCodeAt(0);
    return String(n >= 0x06f0 ? n - 0x06f0 : n - 0x0660);
  }
  function markNumber(el) {
    if (!cfg.touchFix || !looksNumeric(el) || el.hasAttribute('data-ikm-number')) return;
    el.setAttribute('data-ikm-number', '');
    el.setAttribute('inputmode', 'numeric');       // the phone's number pad
    el.setAttribute('lang', 'en');
    el.setAttribute('autocomplete', 'off');
  }
  function caretEnd(el) {
    var go = function () {
      if (document.activeElement !== el) return;
      try {
        var n = el.value.length;
        if (el.selectionStart !== n || el.selectionEnd !== n) el.setSelectionRange(n, n);
      } catch (err) { /* type=number has no caret to place */ }
    };
    go();
    setTimeout(go, 0);
    setTimeout(go, 90);
  }
  function markNumbers() {
    Array.prototype.forEach.call(document.querySelectorAll('.templateView input, #sidebar input, .popupMessage input, #multiPopup input'), function (el) {
      if (el !== document.activeElement) markNumber(el);
    });
  }
  // Runs before the game's own listeners, so they only ever see English digits.
  function onTyped(e) {
    var el = e.target;
    if (!el || !el.hasAttribute || !el.hasAttribute('data-ikm-number')) return;
    var v = el.value, fixed = englishDigits(v);
    if (fixed === v) return;
    var at = null;
    try { at = el.selectionStart; } catch (err) { /* type=number has no caret position */ }
    el.value = fixed;
    if (at !== null && document.activeElement === el) el.setSelectionRange(at, at);
  }

  function onFocusIn(e) {
    var el = e.target;
    if (GAME_HOST && isTextField(el)) markNumber(el);
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
  var CLOSE_SEL = '.close, .closeButton, .btnClose, .closeWindow, .ui-dialog-titlebar-close, .popup_window .close_img';
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

  // A game pop-up that asks something (two buttons, or a box to type in, e.g. "save this island"): Back is
  // its Cancel, through the game's own closePopup. (One with a single button is left to closeByText.)
  function closeGamePopup() {
    var pops = Array.prototype.filter.call(document.querySelectorAll('#popupMessage > .popupMessage'), visible);
    var pm = pops[pops.length - 1];
    if (!pm || !pm.id || !(pm.querySelector('#js_popupBtn2') || pm.querySelector('input[type=text], textarea'))) return false;
    try { ikariam.getPopupController().closePopup(pm.id); return true; } catch (e) { return false; }
  }

  // Offer pop-ups close with a text button ("اغلق") instead of an X.
  var CLOSE_WORDS = /^(اغلق|أغلق|إغلاق|اغلاق|close|schließen|ok|موافق)$/i;
  function closeByText() {
    var pops = Array.prototype.slice.call(document.querySelectorAll('#multiPopup, .popupMessage, .popup_window')).filter(visible);
    for (var p = pops.length - 1; p >= 0; p--) {
      var btns = Array.prototype.slice.call(pops[p].querySelectorAll('a, button, input[type=button], .button, [onclick]')).filter(visible);
      for (var i = 0; i < btns.length; i++) {
        var label = (btns[i].value || btns[i].textContent || '').trim();
        if (CLOSE_WORDS.test(label) || label.toLowerCase() === tr('close').toLowerCase()) { btns[i].click(); return true; }
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
    // In a town the side box left without a window is the building queue, which the game keeps
    // open: nothing to close, so Back goes on to the app menu.
    if (document.body.id === 'city') return false;
    try {
      var tv = window.ikariam && ikariam.templateView;
      if (tv && typeof tv.destroySidebars === 'function') { tv.destroySidebars(); return true; }
    } catch (e) { /* fall through */ }
    return false;
  }
  var closeTopByX = api.closeTop;
  api.closeTop = function () {
    if (hovered) { clearHover(); return true; }  // a hover info shown by a long press
    if (closeBubbleForm()) return true;
    if (closeMapDrop()) return true;
    if (closeGamePopup()) return true;
    if (closeAppSettings() || closeSheet() || slideCancel()) return true;
    if (closeTransport()) return true;         // it lies over the windows
    if (autoOpen) { retractAuto(); return true; }
    if (cancelRearrange()) return true;
    return closeByText() || closeTopByX() || closeTownPanel();
  };

  /* ------------------------------------------------------------ thumb layout */

  // Portrait layout "thumb" (the default; "classic" is the one with the game's panel on top):
  // what you only read is a slim strip at the top, what you tap is at the bottom.
  //
  //   top     strip: ships, gold, citizens, action points / five resources; clock + breadcrumbs
  //   bottom  town bar (< town >), dock (city, island, world, More), four advisors
  //
  // The strip, dock buttons and advisors are the game's own elements, only moved, so their
  // numbers, hover info and links keep working. The town bar, More and their two lists are the
  // app's: each entry just presses the game's own (hidden) button when the player taps it.
  var STRIP_H = 62, MENU_Z = 1.45;
  // The four advisor pictures are tiles 90 x 108 that join seamlessly: four of them = the screen's width.
  var ADV_Z = 660 / 360, ADV_H = Math.ceil(108 * ADV_Z);
  var DOCK_H = 76, TOWN_H = 60;
  var TRANSPORT_Z = 1.8;                  // the transport panel (260 px wide in the game)
  var CHAT_LIST_H = 470;                  // the alliance chat's message list: it ends above the town bar
  // The red tiled roof is the top 19 px of the game's 394 px wide advisors picture, here as wide as the screen.
  var ROOF_H = Math.round(19 * 660 / 394);
  var TRIM_H = 12;                        // thin ornament on top of the dock
  var GAME_IMG = '/cdn/all/both/';        // the game's own pictures, on the game server itself
  var DOCK_LOW = ADV_H + ROOF_H;          // from the bottom of the screen
  var DOCK_TOP = DOCK_LOW + DOCK_H + TRIM_H;
  // Our own drawing: a gold Greek key band on red.
  var TRIM_IMG = 'data:image/svg+xml,' + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="12">' +
    '<path fill="#7c1208" d="M0 0h14v12H0z"/><path fill="#e8b84f" d="M0 0h14v1.2H0zM0 10.8h14V12H0z"/>' +
    '<path fill="none" stroke="#f2cd73" stroke-width="1.2" d="M0 8.9H2.6V3.1H11.4V6.9H6.8V5.1M2.6 8.9H14"/></svg>');

  // our own little drawings for the two menu buttons
  var ICON_TOWN = 'data:image/svg+xml,' + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 28 28" fill="#b5862f">' +
    '<path d="M14 2L26 10H2z"/><path d="M4 11h4v10H4zM12 11h4v10h-4zM20 11h4v10h-4zM2 22h24v4H2z"/></svg>');
  var ICON_FRIENDS = 'data:image/svg+xml,' + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 28 28" fill="#b5862f">' +
    '<circle cx="10" cy="9" r="5.5"/><path d="M1 26c0-13 18-13 18 0z"/>' +
    '<circle cx="20.5" cy="8" r="4"/><path d="M18 14c6-2 10 3 10 9h-7c0-4-1-7-3-9z"/></svg>');

  // In an alliance the friends button is the communication button: people and a speech bubble.
  var ICON_SOCIAL = 'data:image/svg+xml,' + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 28 28" fill="#b5862f">' +
    '<circle cx="8" cy="13" r="4.5"/><path d="M0 28c0-11 16-11 16 0z"/>' +
    '<path d="M13 1h13a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-6l-4 4v-4h-3a2 2 0 0 1-2-2V3a2 2 0 0 1 2-2z"/></svg>');

  // Discord's logo (white on its blue), for its square button in More.
  var ICON_DISCORD = 'data:image/svg+xml,' + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 127.14 96.36" fill="#fff"><path d="M107.7 8.07A105.15 105.15 0 0 0 81.47 0a72.06 72.06 0 0 0-3.36 6.83 97.68 97.68 0 0 0-29.11 0A72.37 72.37 0 0 0 45.64 0a105.89 105.89 0 0 0-26.25 8.09C2.79 32.65-1.71 56.6.54 80.21a105.73 105.73 0 0 0 32.17 16.15 77.7 77.7 0 0 0 6.89-11.11 68.42 68.42 0 0 1-10.85-5.18c.91-.66 1.8-1.34 2.66-2a75.57 75.57 0 0 0 64.32 0c.87.71 1.76 1.39 2.66 2a68.68 68.68 0 0 1-10.87 5.19 77 77 0 0 0 6.89 11.1 105.25 105.25 0 0 0 32.19-16.14c2.64-27.38-4.51-51.11-18.9-72.15ZM42.45 65.69C36.18 65.69 31 60 31 53s5-12.74 11.43-12.74S54 46 53.89 53s-5.05 12.69-11.44 12.69Zm42.24 0C78.41 65.69 73.25 60 73.25 53s5-12.74 11.44-12.74S96.23 46 96.12 53s-5.04 12.69-11.43 12.69Z"/></svg>');

  var QUICK_OPEN = '110ms cubic-bezier(.2, .8, .3, 1)';
  var QUICK_CLOSE = '520ms cubic-bezier(.35, 0, .6, 1)';

  function isThumb() {
    return document.documentElement.classList.contains('ikm-thumb');
  }

  function thumbCss() {
    var T = 'html.ikm-thumb ', C = T + '#container ', I = ' !important;';
    // `start` = from the reading side (the right on Arabic servers).
    function at(start, top) {
      return ' position: absolute' + I + ' left: auto' + I + ' right: auto' + I +
        ' inset-inline-start: ' + start + 'px' + I + ' top: ' + top + 'px' + I + ' margin: 0' + I + ' pointer-events: auto;';
    }
    // The same, measured from the far end of the row.
    function atEnd(end, top) {
      return ' position: absolute' + I + ' left: auto' + I + ' right: auto' + I + ' inset-inline-start: auto' + I +
        ' inset-inline-end: ' + end + 'px' + I + ' top: ' + top + 'px' + I + ' margin: 0' + I + ' pointer-events: auto;';
    }
    // A dock tile: a quarter of the width, no gaps. Its picture is cut out of the game's button
    // image (x, y, w, h: the picture inside that image) so it sits on the tile without a frame.
    function dockButton(id, n, rn, x, y, w, h, clip) {
      var sel = T + '#cityNav #' + id, k = 1.3;
      return sel + ' { position: fixed' + I + ' top: auto' + I + ' right: auto' + I +
        ' left: ' + n * 25 + '%' + I + ' bottom: ' + DOCK_LOW + 'px' + I + ' width: 25%' + I + ' height: ' + DOCK_H + 'px' + I +
        ' margin: 0' + I + ' box-sizing: border-box; pointer-events: auto; border-right: 1px solid #d9bd85;' +
        ' background: linear-gradient(#f3e4d3, #fbeec4)' + I + ' }\n' +
        sel + ':active { background: #ecd29b' + I + ' }\n' +
        // the game's own order in both: Arabic  More, city, island, world; mirrored  world, island, city, More
        'html.ikm-rtl.ikm-thumb #cityNav #' + id + ' { left: ' + rn * 25 + '%' + I + ' }\n' +
        sel + ' a { position: relative; display: block' + I + ' width: 100%' + I + ' height: 100%' + I + ' box-sizing: border-box;' +
        ' padding: 50px 0 0' + I + ' line-height: 20px' + I + ' font-size: 16px' + I + ' background-size: 0 0' + I + ' }\n' +
        sel + ' a::before { content: ""; position: absolute; pointer-events: none; background-image: inherit; background-repeat: no-repeat;' +
        ' top: 2px; left: calc(50% - ' + (w * k / 2).toFixed(1) + 'px); width: ' + (w * k).toFixed(1) + 'px; height: ' + (h * k).toFixed(1) + 'px;' +
        ' background-size: ' + (84 * k).toFixed(1) + 'px auto; background-position: ' + (-x * k).toFixed(1) + 'px ' + (-y * k).toFixed(1) + 'px;' + clip + ' }';
    }
    var css = [
      '.ikm-ui, #ikm-ambro { display: none; }',

      // ---- the strip
      T + '#GF_toolbar { display: none' + I + ' }',
      T + '#header { background: none' + I + ' }',
      T + '#topnavi { top: 0' + I + ' left: 0' + I + ' right: 0' + I + ' width: auto' + I + ' height: ' + STRIP_H + 'px' + I +
        ' background: #f2e3c2' + I + ' box-shadow: inset 0 -2px #c9a96a; }',
      T + '#header #topnaviResources, ' + T + '#header #cityResources { position: absolute' + I + ' inset: 0' + I +
        ' width: auto' + I + ' height: auto' + I + ' margin: 0' + I + ' pointer-events: none; }',
      T + '#header #globalResources { position: static' + I + ' width: auto' + I + ' height: auto' + I + ' overflow: visible' + I + ' }',
      T + '#globalResources .ambrosia, ' + T + '#globalResources .ambrosiaNoSpin, ' + T + '#globalResources .inventory { display: none' + I + ' }',
      // row 1, from the reading side: gold (above the wood), then ships, freighters, ambrosia, citizens,
      // action points packed towards the far end
      T + '#header #globalResources .gold a, ' + T + '#header #globalResources .goldBonus a {' + at(2, 2) + ' font-size: 15px; }',
      T + '#header #globalResources .transporters a {' + at(116, 2) + ' font-size: 15px; }',
      T + '#header #globalResources .freighters a {' + at(228, 2) + ' font-size: 15px; }',
      T + '#topnavi #ikm-ambro {' + at(340, 3) + ' display: flex' + I + ' align-items: center; gap: 4px; width: 72px; height: 26px;' +
        ' box-sizing: border-box; padding: 0 4px; border: 1px solid #c9a96a; border-radius: 3px; background: #f8ecd0;' +
        ' color: #542c0f; font: bold 15px/26px Arial, Helvetica, sans-serif; text-decoration: none; white-space: nowrap; overflow: hidden; }',
      T + '#topnavi #ikm-ambro:active { background: #ecd29b; }',
      T + '#topnavi #ikm-ambro i { flex: none; width: 16px; height: 22px;' +
        ' background: url("' + GAME_IMG + 'premium/ambrosia_icon.png") center / contain no-repeat; }',
      T + '#header #cityResources ul.resources li { font-size: 17px' + I + ' pointer-events: auto; }',
      T + '#header #cityResources ul.resources li span { font-size: inherit' + I + ' }',
      T + '#header #cityResources ul.resources li.population {' + at(416, 3) + ' width: 106px' + I + ' padding-inline-start: 46px' + I + ' padding-inline-end: 0' + I + ' }',
      T + '#header #cityResources ul.resources li.actions {' + at(572, 3) + ' width: 44px' + I + ' padding-inline-start: 32px' + I + ' padding-inline-end: 0' + I + ' }',
      T + '#header #cityResources ul.resources li#resources_foreign {' + at(6, 33) + ' width: 610px' + I + ' }'
    ];
    ['wood', 'wine', 'marble', 'glass', 'sulfur'].forEach(function (name, i) {
      css.push(T + '#header #cityResources ul.resources li#resources_' + name + ' {' + at(3 + i * 131, 33) + ' width: 90px' + I + ' padding-inline-start: 38px' + I + ' padding-inline-end: 0' + I + ' }');
    });
    css.push(
      // breadcrumbs (they also carry the "occupied" / "spies" warnings) just under the strip
      T + '#breadcrumbs { top: ' + (STRIP_H + 4) + 'px' + I + ' }',
      // left-to-right servers: the mirror image (breadcrumbs left, clock right)
      T + '.direction_ltr #breadcrumbs { left: 8px' + I + ' right: auto' + I + ' }',
      T + '.direction_ltr #container #ikm-clock { left: auto; right: 4px; }',

      // ---- dock
      T + '#header #cityNav { position: static' + I + ' height: 0' + I + ' pointer-events: none; }',
      T + '#js_citySelectContainer { display: none' + I + ' }',
      T + '#dropDown_js_citySelectContainer { visibility: hidden' + I + ' pointer-events: none' + I + ' }',
      dockButton('js_cityLink', 2, 1, 16, 0, 52, 36,       // the flag pokes out above the button
        ' clip-path: polygon(40% 0, 70% 0, 70% 21%, 100% 21%, 100% 100%, 0 100%, 0 21%, 40% 21%);' +
        ' -webkit-mask-image: linear-gradient(to right, transparent, #000 9%, #000 91%, transparent);'),
      dockButton('js_islandLink', 1, 2, 5, 3, 74, 33,
        ' -webkit-mask-image: radial-gradient(closest-side, #000 86%, transparent);'),
      dockButton('js_worldMapLink', 0, 3, 21, 1, 38, 36,
        ' -webkit-mask-image: radial-gradient(closest-side, #000 88%, transparent);'),
      // advisors edge to edge, under their red roof (drawn from the game's own picture, hence `inherit`)
      T + '#header #advisors { zoom: ' + ADV_Z.toFixed(5) + '; width: 360px' + I + ' height: 108px' + I +
        ' background-size: 0 0' + I + ' overflow: visible' + I + ' }',
      T + '#header #advisors::before { content: ""; display: block; position: absolute; left: 0; width: 100%;' +
        ' top: ' + (-ROOF_H / ADV_Z).toFixed(3) + 'px; height: ' + (ROOF_H / ADV_Z).toFixed(3) + 'px;' +
        ' background-color: #f2e3c2; background-image: inherit; background-repeat: no-repeat; background-position: 0 0; background-size: 100% auto; }',
      T + '#header #advisors ul { margin: 0' + I + ' }',
      // side buttons down in thumb reach (the top is set by thumbLayout, the columns differ in height)
      T + '#js_viewCityMenu, ' + T + '#js_viewFriends { top: var(--ikm-mtop, 400px)' + I + ' }',
      // hover info (a long press on gold, a resource...): as wide as the town bar, just above it
      // (tipFit sets the size and place; any touch or Back hides it)
      T + '.infoTip { position: fixed' + I + ' left: 50%' + I + ' right: auto' + I + ' top: auto' + I +
        ' bottom: var(--ikm-tipb, 420px)' + I + ' margin: 0' + I + ' z-index: 2147483000' + I +
        ' transform: translateX(-50%) scale(var(--ikm-tipk, 1))' + I + ' transform-origin: 50% 100%' + I + ' }',
      // transport: a panel of its own, much bigger but not as wide as a window
      C + '.transportPanel { position: fixed' + I + ' left: 0' + I + ' right: 0' + I + ' top: auto' + I + ' width: 260px' + I +
        ' margin: 0 auto' + I + ' zoom: ' + TRANSPORT_Z + '; bottom: ' + ((DOCK_TOP + TOWN_H + 10) / TRANSPORT_Z).toFixed(1) + 'px' + I + ' }',
      C + '.transportPanel .variableMainContent { max-height: var(--ikm-tph, 375px)' + I + ' overscroll-behavior: contain; touch-action: pan-y; }',
      // a menu retracts into the bottom, behind the bars, and stays there
      T + '#js_viewCityMenu, ' + T + '#js_viewFriends { transition: translate .25s ease, visibility 0s linear 0s; }',
      'html.ikm-thumb:not(.ikm-open-city) #js_viewCityMenu, html.ikm-thumb:not(.ikm-open-friends) #js_viewFriends {' +
        ' translate: 0 640px; visibility: hidden' + I + ' pointer-events: none;' +
        ' transition: translate .25s ease, visibility 0s linear .25s; }',
      // the buttons that open them, each under its own column
      C + '#ikm-tcity, ' + C + '#ikm-tfriends { width: 80px; height: ' + TOWN_H + 'px; bottom: ' + (DOCK_TOP + 2) + 'px; z-index: 82; }',
      C + '#ikm-tcity { left: 3px; }',
      C + '#ikm-tfriends { right: 3px; }',
      'html.ikm-rtl.ikm-thumb #container #ikm-tcity { left: auto; right: 3px; }',
      'html.ikm-rtl.ikm-thumb #container #ikm-tfriends { right: auto; left: 3px; }',
      C + '#ikm-tcity button, ' + C + '#ikm-tfriends button { position: relative; width: 100%; height: 100%; padding: 2px 3px;' +
        ' border: 2px solid #c9a96a; border-radius: 10px; background: #f2e3c2; font-size: 13px; overflow: hidden; }',
      C + '.ikm-ico { display: block; width: 24px; height: 24px; margin: 0 auto 2px; background: center / contain no-repeat; }',
      C + '#ikm-tcity .ikm-ico { background-image: url("' + ICON_TOWN + '"); }',
      C + '#ikm-tfriends .ikm-ico { background-image: url("' + ICON_FRIENDS + '"); }',
      // alliance: the game's two loose buttons go; they are the top of the friends column instead
      T + '#container #js_viewAllyMessage, ' + T + '#container #js_viewChat { display: none' + I + ' }',
      'html.ikm-thumb.ikm-clan #container #ikm-tfriends .ikm-ico { background-image: url("' + ICON_SOCIAL + '"); }',
      C + '#js_viewFriends li.ikm-clan a.image { background-repeat: no-repeat' + I + ' }',
      C + '#js_viewFriends li.ikm-clan.ikm-new { box-shadow: 0 0 0 2px #d51f1f, 0 0 10px #d51f1f; }',
      // the alliance chat: the screen's width under the strip, its text twice the game's size
      T + '#chatWindow #resizablepanel_chat { width: calc(100vw - 16px)' + I + ' height: auto' + I + ' top: 0' + I + ' }',
      T + '#chatWindow #resizablepanel_chat .hd, ' + T + '#chatWindow #resizablepanel_chat .bd { width: auto' + I + ' height: auto' + I + ' }',
      // its title bar: one full-width bar in the game's window style (its own three pieces cannot stretch)
      T + '#chatWindow #chatHeader { position: relative' + I + ' display: block' + I + ' float: none' + I + ' width: auto' + I +
        ' margin: 0' + I + ' top: 0' + I + ' left: 0' + I + ' height: 54px' + I + ' padding: 0' + I +
        ' background: #e3b66a url("' + GAME_IMG + 'layout/bg_maincontentbox_header.jpg") 0 0 / 100% 100% no-repeat' + I + ' }',
      T + '#chatWindow #chatHeader .headerLeft, ' + T + '#chatWindow #chatHeader .headerRight { display: none' + I + ' }',
      T + '#chatWindow #chatHeader .headerMiddle { position: static' + I + ' float: none' + I + ' width: auto' + I + ' height: 54px' + I +
        ' margin: 0' + I + ' background: none' + I + ' }',
      T + '#chatWindow #chatHeader .headerMiddle p { position: static' + I + ' width: auto' + I + ' height: 54px' + I + ' margin: 0' + I +
        ' padding: 0 64px' + I + ' font: bold 22px/54px Arial, Helvetica, sans-serif' + I + ' color: #542c0f' + I +
        ' text-align: center' + I + ' white-space: nowrap' + I + ' overflow: hidden' + I + ' }',
      T + '#chatWindow #chatHeader .headerMiddle p span { position: absolute' + I + ' top: 8px' + I + ' left: auto' + I + ' right: auto' + I +
        ' inset-inline-end: 10px' + I + ' margin: 0' + I + ' line-height: 0' + I + ' }',
      T + '#chatWindow #chatHeader .headerMiddle p span a, ' + T + '#chatWindow #chatHeader .close_img { display: block' + I + ' }',
      T + '#chatWindow #chatHeader .close_img { width: 38px' + I + ' height: 38px' + I + ' margin: 0' + I + ' }',
      T + '#chatWindow .chat_table { width: 100%' + I + ' }',
      T + '#chatWindow .message_chat { width: auto' + I + ' height: ' + CHAT_LIST_H + 'px' + I + ' }',
      T + '#chatWindow .userlist_chat { width: 150px' + I + ' }',
      T + '#chatWindow #js_chatMessages, ' + T + '#chatWindow #js_chatMessages li { width: auto' + I + ' font-size: 24px' + I + ' line-height: 1.3' + I + ' }',
      T + '#chatWindow #js_chatpartners li { width: auto' + I + ' font-size: 19px' + I + ' line-height: 1.4' + I + ' }',
      T + '#chatWindow .chat_input { width: 100%' + I + ' box-sizing: border-box' + I + ' height: 48px' + I + ' font-size: 22px' + I + ' }',
      T + '#chatWindow tr[style*="height"] { height: 60px' + I + ' }',
      T + '#chatWindow .chat_send { font-size: 20px' + I + ' line-height: 40px' + I + ' height: 40px' + I + ' padding: 0 16px' + I + ' }',
      // the alliance message: a roomier box to write in, with bigger letters
      T + '#sendIKMessage_c textarea { font-size: 22px' + I + ' line-height: 1.35' + I + ' height: 300px' + I + ' }',
      C + '#ikm-tfriends.ikm-new button::before { content: ""; position: absolute; top: 4px; left: 6px; width: 12px; height: 12px;' +
        ' border-radius: 50%; background: #d51f1f; box-shadow: 0 0 0 2px #fdf7dd; }',
      C + '#ikm-tcity .ikm-word, ' + C + '#ikm-tfriends .ikm-word { display: block; overflow: hidden; max-height: 26px; line-height: 13px; }',
      C + '#ikm-tcity button::after, ' + C + '#ikm-tfriends button::after { content: "\\25B4"; position: absolute; top: 1px; right: 5px; font-size: 15px; }',
      C + '#ikm-tcity button[aria-expanded="true"], ' + C + '#ikm-tfriends button[aria-expanded="true"] {' +
        ' background: #8b1a1a; border-color: #e8b84f; color: #ffe9a8; }',
      C + '#ikm-tcity button[aria-expanded="true"]::after, ' + C + '#ikm-tfriends button[aria-expanded="true"]::after { content: "\\25BE"; }',
      C + '#ikm-town.single .ikm-hint { display: none; }',
      // press-slide-release on the two buttons: there at once, nothing in the browser's way
      C + '#ikm-tcity, ' + C + '#ikm-tfriends, ' + C + '#ikm-tcity button, ' + C + '#ikm-tfriends button { touch-action: none; }',
      'html.ikm-thumb.ikm-quick.ikm-open-city #js_viewCityMenu, html.ikm-thumb.ikm-quick.ikm-open-friends #js_viewFriends {' +
        ' transition: none' + I + ' }',
      // items: quick out, slow back, each on its own (that is the trailing pyramid)
      C + '#js_viewCityMenu li.expandable { width: 53px' + I + ' transition: width ' + QUICK_CLOSE + I + ' }',
      C + '#js_viewFriends li.slot { left: auto' + I + ' right: 1px' + I + ' transition: width ' + QUICK_CLOSE + I + ' }',
      'html.ikm-rtl.ikm-thumb #container #js_viewFriends li.slot { right: auto' + I + ' left: 1px' + I + ' }',
      C + '#js_viewCityMenu li.expandable.ikm-out, ' + C + '#js_viewFriends li.slot.ikm-out { width: 199px' + I +
        ' transition: width ' + QUICK_OPEN + I + ' }',
      C + '#js_viewCityMenu li.expandable.ikm-passed, ' + C + '#js_viewFriends li.slot.ikm-passed { width: 199px' + I +
        ' transition: none' + I + ' }',
      // the words keep their shape while the item grows: they slide out with it
      C + '#js_viewCityMenu li.expandable .name, ' + C + '#js_viewCityMenu li.expandable .namebox { width: 129px' + I + ' }',
      C + '#js_viewCityMenu li.expandable .namebox { text-align: right' + I + ' }',
      'html.ikm-rtl.ikm-thumb #container #js_viewCityMenu li.expandable .namebox { text-align: left' + I + ' }',
      // friends have no words of their own: the name from the picture's hint
      C + '#js_viewFriends li.slot[data-ikm-name]::after { content: attr(data-ikm-name); position: absolute; left: 60px; top: 0;' +
        ' width: 130px; height: 40px; line-height: 40px; color: #542c0f; font: bold 12px/40px Arial, sans-serif; text-align: left;' +
        ' white-space: nowrap; overflow: hidden; text-overflow: ellipsis; unicode-bidi: plaintext; pointer-events: none; }',
      'html.ikm-rtl.ikm-thumb #container #js_viewFriends li.slot[data-ikm-name]::after { left: auto; right: 60px; text-align: right; }',

      // ---- the app's own bars
      C + '.ikm-ui { display: block; position: fixed; box-sizing: border-box; font-family: Arial, Helvetica, sans-serif; color: #542c0f; }',
      C + '.ikm-ui [hidden], ' + C + '.ikm-ui[hidden] { display: none' + I + ' }',
      C + '.ikm-ui button { box-sizing: border-box; margin: 0; padding: 0 8px; border: 1px solid #c9a96a; border-radius: 6px;' +
        ' background: #fdf7dd; color: #542c0f; font-family: inherit; font-size: 21px; line-height: 1.2; cursor: pointer; }',
      C + '.ikm-ui button:active { background: #ecd29b; }',
      C + '#ikm-dock { left: 0; right: 0; bottom: ' + DOCK_LOW + 'px; height: ' + (DOCK_H + TRIM_H) + 'px; z-index: 79; background: #f2e3c2; }',
      C + '#ikm-dock::before { content: ""; position: absolute; left: 0; right: 0; top: 0; height: ' + TRIM_H + 'px;' +
        ' background: #7c1208 url("' + TRIM_IMG + '") repeat-x 50% 0; }',
      C + '#ikm-more { left: 75%; width: 25%; bottom: ' + DOCK_LOW + 'px; height: ' + DOCK_H + 'px; z-index: 82; }',
      'html.ikm-rtl.ikm-thumb #container #ikm-more { left: 0; }',
      C + '#ikm-more button { width: 100%; height: 100%; border: 0; border-right: 1px solid #d9bd85; border-radius: 0;' +
        ' background: linear-gradient(#f3e4d3, #fbeec4); font-size: 16px; line-height: 20px; }',
      C + '#ikm-more button:active { background: #ecd29b; }',
      C + '#ikm-more button b { display: block; font-size: 38px; line-height: 44px; }',
      // town slider
      C + '#ikm-town { left: 86px; right: 86px; bottom: ' + (DOCK_TOP + 2) + 'px; height: ' + TOWN_H + 'px; z-index: 82;' +
        ' direction: ltr; overflow: hidden; touch-action: none; cursor: pointer; border: 2px solid #c9a96a; border-radius: 10px;' +
        ' background: #f2e3c2; }',
      C + '#ikm-town * { pointer-events: none; }',
      T + '#popupMessage > .popupMessage:not([data-ikm-fit]) { opacity: 0' + I + ' }',
      // a bubble with a form (bubbleForms): in the middle of the map, solid, bigger
      T + '.bubble_tip.ikm-bubbleform { position: fixed' + I + ' left: 50%' + I + ' top: 42%' + I + ' right: auto' + I +
        ' transform: translate(-50%, -50%) scale(var(--ikm-bz, 2))' + I + ' transform-origin: 50% 50%' + I + ' }',
      T + '.bubble_tip.ikm-bubbleform .feedbackTip { opacity: 1' + I + ' }',
      // the world map's navigation bar (mapBar)
      '#ikm-mapbar { position: fixed; left: 8px; right: 8px; height: 52px; z-index: 83; display: flex; align-items: center;' +
        ' gap: 6px; padding: 0 6px; box-sizing: border-box; direction: ltr; background: #f2e3c2; border: 2px solid #c9a96a;' +
        ' border-radius: 10px; color: #542c0f; font: bold 20px sans-serif; box-shadow: 0 2px 6px rgba(0,0,0,.35); }',
      '#ikm-mapbar[hidden], #ikm-mapbar [hidden] { display: none !important; }',
      '#ikm-mapbar input { width: 58px; height: 38px; box-sizing: border-box; border: 1px solid #c9a96a; border-radius: 6px;' +
        ' background: #fdf7dd; color: #542c0f; font: 20px sans-serif; text-align: center; padding: 0; }',
      '#ikm-mapbar label { display: flex; align-items: center; gap: 3px; flex: none; }',
      '#ikm-mapbar .stop { position: absolute; left: 0; top: 0; width: 1px; height: 1px; opacity: 0; border: 0; padding: 0; pointer-events: none; }',
      '#ikm-mapbar #ikm-mpick { flex: 1; width: auto; min-width: 0; display: flex; align-items: center; gap: 5px; padding: 0 6px;' +
        ' color: #542c0f; border-color: #c9a96a; background: #fdf7dd; font: 17px sans-serif; }',
      // resource on the left, coordinates on the right, on every server
      '#ikm-mapbar #ikm-mpick .line, #ikm-mapdrop .row { display: flex; align-items: center; gap: 8px; min-width: 0; flex: 1; direction: ltr; }',
      '#ikm-mapbar #ikm-mpick .arrow { flex: none; font-size: 16px; }',
      '#ikm-mapbar img, #ikm-mapdrop img { width: 24px; height: 24px; object-fit: contain; flex: none; }',
      // the island button: one line (name, then the towns), cut short if long
      '#ikm-mapbar .tx { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; text-align: left; }',
      '#ikm-mapbar .tx .nm, #ikm-mapbar .tx .towns { display: inline; }',
      '#ikm-mapbar .tx .towns { margin-left: 5px; font-weight: normal; }',
      '#ikm-mapbar .tx, #ikm-mapdrop .tx, #ikm-mapbar .towns, #ikm-mapdrop .towns { direction: ltr; unicode-bidi: isolate; }',
      '.ikm-ui .nm { font-weight: bold; unicode-bidi: plaintext; }',
      '.ikm-ui .towns .town { unicode-bidi: plaintext; }',
      '.ikm-ui .towns .dot { display: inline-block; margin: 0 .45em; color: #542c0f; font-size: .8em; vertical-align: .1em; }',
      // the list: the name on its line, the towns under it on as many lines as they need
      '#ikm-mapdrop .tx.stacked { flex: 1; min-width: 0; display: flex; flex-direction: column; align-items: flex-start;' +
        ' text-align: left; padding: 6px 0; line-height: 1.25; }',
      '#ikm-mapdrop .tx.stacked .towns { font-size: 17px; color: #6b4a22; white-space: normal; }',
      '#ikm-mapbar .xy, #ikm-mapdrop .xy { flex: none; color: #8b5a2b; font-size: 15px; direction: ltr; }',
      // the shortcut list (openMapDrop): in the game's colours, under the bar
      '#ikm-mapdrop { position: fixed; left: 8px; right: 8px; z-index: 84; max-height: 60vh; overflow-y: auto; box-sizing: border-box;' +
        ' padding: 6px; background: #f2e3c2; border: 2px solid #c9a96a; border-radius: 10px; box-shadow: 0 4px 12px rgba(0,0,0,.4);' +
        ' display: grid; gap: 5px; overscroll-behavior: contain; }',
      '#ikm-mapdrop .hd { text-align: center; font: bold 18px sans-serif; color: #542c0f; padding: 4px 0 6px;' +
        ' border-bottom: 1px solid #c9a96a; }',
      '#ikm-mapdrop .row { min-height: 56px; padding: 0 12px; border: 1px solid #c9a96a; border-radius: 8px; background: #fdf7dd;' +
        ' color: #542c0f; font: 20px sans-serif; }',
      '#ikm-mapdrop .row.current { background: #ecd29b; border: 2px solid #8b1a1a; }',
      '#ikm-mapdrop .sep { height: 0; margin: 4px 6px; border-top: 2px solid #b5862f; }',
      '#ikm-mapdrop .row .del { flex: none; width: 46px; height: 42px; margin-inline-start: 4px; border: 1px solid #8b1a1a;' +
        ' border-radius: 6px; background: #fff3cf; color: #8b1a1a; font: bold 22px sans-serif; padding: 0; }',
      '#ikm-mapbar button { width: 42px; height: 38px; flex: none; border: 1px solid #8b1a1a; border-radius: 6px;' +
        ' background: #fff3cf; color: #8b1a1a; font: bold 22px sans-serif; padding: 0; }',
      // no town menu (island, world map): the town bar reaches to the screen's edge on that side
      'html.ikm-thumb.ikm-no-tcity:not(.ikm-rtl) #container #ikm-town { left: 3px; }',
      'html.ikm-thumb.ikm-no-tcity.ikm-rtl #container #ikm-town { right: 3px; }',
      'html.ikm-thumb.ikm-no-tfriends:not(.ikm-rtl) #container #ikm-town { right: 3px; }',
      'html.ikm-thumb.ikm-no-tfriends.ikm-rtl #container #ikm-town { left: 3px; }',
      C + '#ikm-town .ikm-track { position: absolute; top: 0; bottom: 0; left: 50%; width: 0; }',
      C + '#ikm-town .ikm-slot { position: absolute; top: 4px; bottom: 4px; left: -76px; width: 152px; box-sizing: border-box;' +
        ' display: flex; align-items: center; justify-content: center; gap: 6px; padding: 0 6px; border: 1px solid transparent;' +
        ' border-radius: 7px; font-size: 19px; color: #947047; }',
      C + '#ikm-town .ikm-slot b { font-weight: normal; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; unicode-bidi: plaintext; }',
      C + '#ikm-town .ikm-slot img { width: 22px; height: 22px; flex: none; object-fit: contain; }',
      C + '#ikm-town .ikm-slot.name { color: #542c0f; background: #fdf7dd; border-color: #c9a96a; font-size: 23px; }',
      C + '#ikm-town .ikm-slot.name b { font-weight: bold; }',
      C + '#ikm-town .ikm-slot.ikm-other { color: #9b3a1c; }',
      C + '#ikm-town .ikm-slot.name.ikm-other { background: #f6dccb; }',
      C + '#ikm-town .ikm-hint { position: absolute; top: 0; bottom: 0; width: 24px; background: #f2e3c2; color: #8b1a1a;' +
        ' font: normal 32px/52px Arial; text-align: center; }',
      C + '#ikm-town .ikm-hint.ikm-l { left: 0; }',
      C + '#ikm-town .ikm-hint.ikm-r { right: 0; }',
      C + '#ikm-town.waiting .ikm-slot.name { border-color: #8b1a1a; }',
      // the town the player is in: always underlined, wherever it is on the strip
      C + '#ikm-town .ikm-slot.ikm-here { box-shadow: inset 0 -4px 0 #b3261a; color: #542c0f; }',
      C + '#ikm-here { left: 50%; transform: translateX(-50%); bottom: ' + (DOCK_TOP + TOWN_H + 8) + 'px; z-index: 83;' +
        ' display: flex; align-items: center; gap: 6px; padding: 3px 14px; border: 2px solid #e8b84f; border-radius: 16px;' +
        ' background: #8b1a1a; color: #ffe9a8; font: bold 18px/26px Arial, Helvetica, sans-serif; white-space: nowrap;' +
        ' box-shadow: 0 2px 6px rgba(0, 0, 0, .35); pointer-events: auto; }',
      C + '#ikm-here b { unicode-bidi: plaintext; }',
      // another town resting in the middle: ringed, a tap goes there
      C + '#ikm-town .ikm-slot.name.ikm-go { border: 3px solid #8b1a1a; background: #fff3cf;' +
        ' animation: ikm-go 1.1s ease-in-out infinite alternate; }',
      '@keyframes ikm-go { from { box-shadow: 0 0 0 0 rgba(139, 26, 26, .55); } to { box-shadow: 0 0 0 5px rgba(139, 26, 26, 0); } }',
      C + '#ikm-clock { left: 4px; top: ' + (STRIP_H + 4) + 'px; z-index: 58; padding: 3px 8px; border-radius: 4px;' +
        ' background: rgba(242, 227, 194, .92); font-size: 18px; direction: ltr; pointer-events: none; }',

      // ---- the two lists (towns / More), opening upward from the bottom
      C + '#ikm-sheet { inset: 0; z-index: 130000; background: rgba(0, 0, 0, .45); }',
      C + '#ikm-sheet .list { position: absolute; left: 0; right: 0; bottom: 0; max-height: 85%; overflow-y: auto;' +
        ' overscroll-behavior: contain; touch-action: pan-y; box-sizing: border-box; padding: 10px 10px 34px;' +
        ' display: grid; grid-template-columns: minmax(0, 1fr); gap: 6px; background: #f2e3c2; border-top: 3px solid #c9a96a; }',
      C + '#ikm-sheet .list.two { grid-template-columns: repeat(2, minmax(0, 1fr)); }',
      C + '#ikm-sheet .list button { min-height: 70px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }',
      C + '#ikm-sheet .list button.town { text-align: start; padding-inline: 18px; font-size: 24px; }',
      C + '#ikm-sheet .list button.current { background: #ecd29b; border: 2px solid #8b1a1a; font-weight: bold; }',
      C + '#ikm-sheet .list button.other { background: #f6dccb; }',
      C + '#ikm-sheet .list button.wide { grid-column: 1 / -1; }',
      C + '#ikm-sheet .list .pair { display: flex; gap: 6px; min-width: 0; }',
      C + '#ikm-sheet .list .pair button.version { flex: 1; min-width: 0; }',
      C + '#ikm-sheet .list .pair button.discord { flex: none; width: 70px; padding: 0; background: #5865f2 url("' + ICON_DISCORD + '")' +
        ' center / 40px no-repeat; border-color: #4752c4; }',
      C + '#ikm-sheet .list button.edit { margin-top: 4px; background: #ecd29b; font-weight: bold; }',
      C + '#ikm-sheet .list.editing { max-height: 94%; }',
      C + '#ikm-sheet .rows { display: grid; grid-template-columns: minmax(0, 1fr); gap: 6px; }',
      C + '#ikm-sheet .row { display: flex; align-items: center; gap: 6px; height: 70px; box-sizing: border-box; padding: 0 5px;' +
        ' border: 1px solid #c9a96a; border-radius: 6px; background: #fdf7dd; }',
      C + '#ikm-sheet .row.moving { border: 2px solid #8b1a1a; background: #ecd29b; }',
      C + '#ikm-sheet .row .grip { width: 66px; flex: none; text-align: center; font-size: 42px; line-height: 66px; touch-action: none; }',
      C + '#ikm-sheet .row .label { flex: 1; min-width: 0; line-height: 66px; font-size: 24px; touch-action: none;' +
        ' white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }',
      C + '#ikm-sheet .long .row .label { touch-action: pan-y; }',
      C + '#ikm-sheet .row button { width: 66px; min-height: 58px; flex: none; }',
      C + '#ikm-sheet .actions { display: flex; gap: 6px; margin-top: 6px; }',
      C + '#ikm-sheet .actions button { flex: 1; }',
      C + '#ikm-sheet .actions button.save { background: #ecd29b; font-weight: bold; }',
      C + '#ikm-sheet .serverlist .title { padding: 4px 0 8px; text-align: center; font-size: 24px; font-weight: bold;' +
        ' border-bottom: 1px solid #c9a96a; }',
      C + '#ikm-sheet .list button.server { display: flex; align-items: center; gap: 16px; min-height: 96px; padding: 0 18px; text-align: start; }',
      C + '#ikm-sheet .list button.server .flag { flex: none; min-width: 62px; font: 50px/1 "Noto Color Emoji", sans-serif; text-align: center; }',
      C + '#ikm-sheet .list button.server .who { flex: 1; min-width: 0; display: flex; flex-direction: column; align-items: flex-start; }',
      C + '#ikm-sheet .list button.server .who b { font-size: 28px; unicode-bidi: plaintext; }',
      C + '#ikm-sheet .list button.server .who small { font-size: 16px; font-weight: normal; color: #947047; }',
      C + '#ikm-sheet .list button.server .online { flex: none; font-size: 19px; font-weight: normal; }',
      C + '#ikm-sheet .list button.server .online.known::before { content: ""; display: inline-block; width: 11px; height: 11px;' +
        ' margin-inline-end: 8px; border-radius: 50%; background: #3f9d2f; }',
      C + '#ikm-note { left: 40px; right: 40px; top: 40%; z-index: 140000; padding: 16px; text-align: center; font-size: 22px;' +
        ' unicode-bidi: plaintext; background: #fdf7dd; border: 2px solid #c9a96a; border-radius: 10px; }',
      C + '#ikm-sheet .list button.red { position: relative; height: 104px; padding: 0 8px; display: flex; align-items: center;' +
        ' justify-content: center; gap: 12px; border: 2px solid #e8b84f; outline: 1px solid #4d0803; color: #ffd75e;' +
        ' font-size: 26px; font-weight: bold; text-shadow: 0 1px 2px #3d0500;' +
        ' background: radial-gradient(circle, #d51f1f 0, #a50c08 48%, #6f0a05 100%); animation: ikm-glow 1.6s ease-in-out infinite alternate; }',
      C + '#ikm-sheet .list button.red .art { flex: none; background-repeat: no-repeat; }',
      // the urn cut out of the first frame of the game's shop picture
      C + '#ikm-sheet .list button.red .art.urn { width: 70px; height: 92px; background-position: -138.6px -7px; background-size: auto 98px;' +
        ' -webkit-mask-image: radial-gradient(closest-side, #000 72%, transparent); }',
      C + '#ikm-sheet .list button.red .art.chest { width: 76px; height: 82px; background-position: center; background-size: contain; }',
      '@keyframes ikm-glow { from { box-shadow: inset 0 0 6px rgba(255, 215, 94, .35), 0 0 3px rgba(213, 31, 31, .5); }' +
        ' to { box-shadow: inset 0 0 22px rgba(255, 215, 94, .8), 0 0 14px rgba(230, 30, 20, .95); } }',
      C + '#ikm-sheet .list img { width: 26px; height: 26px; object-fit: contain; vertical-align: middle; margin-inline-end: 12px; }',

      // ---- More > App settings: a window like the game's (its own header, parchment and buttons)
      C + '#ikm-appset { inset: 0; z-index: 130000; background: rgba(0, 0, 0, .45); }',
      C + '#ikm-appset * { box-sizing: border-box; }',
      C + '#ikm-appset .as-win { position: absolute; left: 8px; right: 8px; top: ' + (STRIP_H + 10) + 'px; max-height: calc(100% - ' +
        (STRIP_H + 30) + 'px); display: flex; flex-direction: column; box-shadow: 0 0 6px #000;' +
        ' background: url("' + GAME_IMG + 'layout/bg_maincontentbox_left.png") left top repeat-y,' +
        ' url("' + GAME_IMG + 'layout/bg_maincontentbox_left.png") right top repeat-y,' +
        ' #f6e7c3 url("' + GAME_IMG + 'layout/bg_maincontentbox.png") repeat; }',
      C + '#ikm-appset .as-hd { position: relative; flex: none; height: 58px; background: #e3b66a url("' + GAME_IMG +
        'layout/bg_maincontentbox_header.jpg") 0 0 / 100% 100% no-repeat; }',
      C + '#ikm-appset .as-hd h3 { margin: 0; padding: 0 70px; font: bold 25px/60px Arial, Helvetica, sans-serif; text-align: center;' +
        ' white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: #542c0f; }',
      C + '#ikm-appset .as-hd button.as-x { position: absolute; top: 7px; inset-inline-end: 10px; width: 44px; height: 44px; min-height: 0;' +
        ' padding: 0; border: 0; border-radius: 0; background: url("' + GAME_IMG + 'interface/window_control_sprite.png")' +
        ' 0 0 / 528px 88px no-repeat; }',
      C + '#ikm-appset .as-hd button.as-x:active { background-position: 0 -44px; }',
      C + '#ikm-appset .as-body { flex: 1; min-height: 0; overflow-y: auto; overscroll-behavior: contain; touch-action: pan-y;' +
        ' padding: 12px 16px 16px; }',
      C + '#ikm-appset .as-server { padding: 0 0 10px; text-align: center; font-size: 19px; color: #7a5a33; unicode-bidi: plaintext; }',
      C + '#ikm-appset .as-btn { min-height: 66px; padding: 4px 10px; border: 3px double #5d4c2f; border-top-color: #c9a584;' +
        ' border-left-color: #c9a584; border-radius: 0; background: #eccf8e url("' + GAME_IMG + 'input/button.png") 0 0 / 100% 100% repeat-x;' +
        ' color: #542c0f; font: bold 21px/1.2 Arial, Helvetica, sans-serif; white-space: normal; }',
      C + '#ikm-appset .as-btn:active { color: #b3713f; border-color: #c9a584; border-top-color: #5d4c2f; border-left-color: #5d4c2f; }',
      C + '#ikm-appset .as-acts { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }',
      C + '#ikm-appset .as-box { margin-top: 16px; padding-bottom: 8px; background: #fbeed0; border: 1px solid #d7b57a; }',
      C + '#ikm-appset .as-box .as-header { display: block; width: 100%; height: 46px; margin: 0; padding: 0 12px; border: 0; border-radius: 0;' +
        ' background: #f9d99c url("' + GAME_IMG + 'layout/bg_contentBox01h_header.png") 0 0 / 100% 100% no-repeat;' +
        ' font: bold 21px/48px Arial, Helvetica, sans-serif; text-align: center; color: #542c0f;' +
        ' white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }',
      C + '#ikm-appset .as-choices { display: flex; flex-wrap: wrap; gap: 8px; padding: 10px 10px 2px; }',
      C + '#ikm-appset .as-choices .as-choice { flex: 1 1 0; min-width: 0; }',
      C + '#ikm-appset .as-choices:not(.as-many) .as-choice { flex-basis: 100%; }',
      C + '#ikm-appset .as-choice.as-on { background: #f6dc9e; border: 3px solid #8b1a1a; color: #8b1a1a; }',
      C + '#ikm-appset .as-choice.as-on::before { content: "\\2714  "; }',
      C + '#ikm-appset .as-toggle { display: flex; align-items: center; gap: 14px; width: 100%; min-height: 70px; padding: 6px 12px;' +
        ' border: 0; border-bottom: 1px solid #e2c68f; border-radius: 0; background: transparent; text-align: start; font-size: 21px; }',
      C + '#ikm-appset .as-toggle:active { background: #f2dca6; }',
      C + '#ikm-appset .as-toggle .as-tick { flex: none; width: 40px; height: 40px; box-sizing: border-box; border: 3px double #5d4c2f;' +
        ' border-top-color: #c9a584; border-left-color: #c9a584; background: #fdf7dd; position: relative; }',
      C + '#ikm-appset .as-toggle.as-on .as-tick { background: #f6dc9e; }',
      C + '#ikm-appset .as-toggle.as-on .as-tick::after { content: "\\2714"; position: absolute; inset: 0; font: bold 28px/34px Arial; text-align: center; color: #8b1a1a; }',
      C + '#ikm-appset .as-toggle .as-label { flex: 1; min-width: 0; line-height: 1.25; }',
      C + '#ikm-appset .as-sleep { display: block; width: calc(100% - 20px); margin: 10px 10px 2px; }',
      C + '#ikm-appset .as-help .as-header::after { content: "  \\25BE"; }',
      C + '#ikm-appset .as-help.as-open .as-header::after { content: "  \\25B4"; }',
      C + '#ikm-appset .as-help p { display: none; margin: 10px 14px 0; font-size: 19px; line-height: 1.35; }',
      C + '#ikm-appset .as-help.as-open p { display: block; }',
      C + '#ikm-appset .as-logout { margin-top: 22px; }',
      C + '#ikm-appset .as-logout > .as-btn { width: 100%; color: #8b1a1a; }',
      C + '#ikm-appset .as-logout.as-asking { padding: 10px; background: #f6dccb; border: 2px solid #8b1a1a; }',
      C + '#ikm-appset .as-logout p { margin: 0 0 10px; font-size: 19px; line-height: 1.35; }',
      C + '#ikm-appset .as-two { display: flex; justify-content: space-between; gap: 40px; }',
      C + '#ikm-appset .as-two .as-btn { flex: 1; }',
      C + '#ikm-appset .as-btn.as-danger { color: #fff; background: #a50c08; text-shadow: 0 1px 2px #3d0500; }',
      C + '#ikm-appset .as-ft { flex: none; display: flex; justify-content: space-between; gap: 60px; padding: 12px 16px 16px;' +
        ' border-top: 1px solid #c9a96a; }',
      C + '#ikm-appset .as-ft .as-btn { flex: 1; min-height: 72px; max-width: 240px; }',
      C + '#ikm-appset .as-ft .as-btn.as-save { font-size: 23px; }',
      C + '#ikm-appset .as-tutorial { display: block; width: 100%; margin-top: 16px; min-height: 76px; font-size: 23px; }',
      C + '#ikm-appset .as-win.as-small { top: 30%; max-height: none; }',
      C + '#ikm-appset .as-text { margin: 10px 4px 6px; font-size: 23px; line-height: 1.45; unicode-bidi: plaintext; }'
    );
    return css;
  }

  function mk(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text) e.textContent = text;
    return e;
  }
  function setText(el, text) {
    if (el.textContent !== text) el.textContent = text;
  }
  function uiBox(id, parent) {
    var e = mk('div', 'ikm-ui');
    e.id = id;
    parent.appendChild(e);
    return e;
  }

  // Press one of the game's own buttons, as a tap would (its mousedown handler prepares the link).
  function press(el) {
    mouse('mousedown', 0, 0, el, 1);
    mouse('mouseup', 0, 0, el, 0);
    el.click();
  }

  function townItems() {
    return Array.prototype.slice.call(document.querySelectorAll('#dropDown_js_citySelectContainer li[selectvalue]'));
  }
  function currentTownId() {
    try { return String(ikariam.model.relatedCityData.selectedCity).replace('city_', ''); } catch (e) { return ''; }
  }
  // The game only listens to its town list while that list is open: press its button, then the town.
  var townBusy = 0;
  function selectTown(item) {
    if (performance.now() < townBusy) return;        // one tap, one switch
    var btn = document.querySelector('#js_citySelectContainer .dropDownButton');
    if (!btn || item.getAttribute('selectvalue') === currentTownId()) return;
    townBusy = performance.now() + 1500;
    btn.click();
    var tries = 0;
    var wait = setInterval(function () {
      if (btn.classList.contains('active')) {
        clearInterval(wait);
        item.click();
      } else if (++tries > 30) {
        clearInterval(wait);
        townBusy = 0;
      }
    }, 30);
  }
  function closeSheet() {
    var s = document.getElementById('ikm-sheet');
    if (!s) return false;
    s.parentNode.removeChild(s);
    return true;
  }
  function openSheet(cls) {
    closeSheet();
    clearHover();
    var s = uiBox('ikm-sheet', document.getElementById('container'));
    s.addEventListener('click', function (e) { if (e.target === s && !s.classList.contains('locked')) closeSheet(); });
    return s.appendChild(mk('div', 'list ' + cls));
  }
  function sheetButton(list, cls, label, action) {
    var b = mk('button', cls, label);
    b.type = 'button';
    b.addEventListener('click', function (e) {
      e.stopPropagation();
      closeSheet();
      action();
    });
    return list.appendChild(b);
  }
  // A town's name with the game's own little icon of its luxury good.
  function townLabel(into, li) {
    var a = li.querySelector('a');
    setText(into, (a ? (a.title || a.textContent) : li.textContent).trim());
    var icon = a && /^url\("([^"]+)"\)/.exec(getComputedStyle(a).backgroundImage);
    if (!icon) return;
    var img = mk('img');
    img.src = icon[1];
    img.alt = '';
    into.insertBefore(img, into.firstChild);
  }
  function openTowns() {
    var items = townItems();
    if (!items.length) return;
    var id = currentTownId(), list = openSheet('towns');
    items.forEach(function (li) {
      var own = li.classList.contains('ownCity');
      var now = li.getAttribute('selectvalue') === id;
      var b = sheetButton(list, 'town' + (own ? '' : ' other') + (now ? ' current' : ''), '', function () { selectTown(li); });
      townLabel(b, li);
    });
    if (ownTowns().length > 1) sheetButton(list, 'edit', '\u270e  ' + tr('editOrder'), function () { editTowns(); });
    var cur = list.querySelector('.current');
    if (cur) cur.scrollIntoView({ block: 'nearest' });
  }
  // The picture of one of the game's elements, as a span.
  function artOf(el, cls) {
    var m = el && /url\("([^"]+)"\)/.exec(getComputedStyle(el).backgroundImage);
    var a = mk('span', 'art ' + cls);
    if (m) a.style.backgroundImage = 'url("' + m[1] + '")';
    return a;
  }
  // More = the shop and inventory as the game's glowing red buttons, the app's own menu and
  // everything from the hidden top row.
  function openMore() {
    var list = openSheet('two more');
    var shop = document.querySelector('#globalResources .ambrosia a, #globalResources .ambrosiaNoSpin a');
    if (shop) {
      var word = shop.textContent.trim();
      var sb = sheetButton(list, 'red shop', word || tr('shop'), function () { press(shop); });   // the game's own word
      sb.insertBefore(artOf(shop, 'urn'), sb.firstChild);
    }
    var inv = document.querySelector('#globalResources .inventory a');
    if (inv) {
      var ib = sheetButton(list, 'red chest', inv.textContent.trim() || '\u25a3', function () { press(inv); });
      ib.insertBefore(artOf(inv, 'chest'), ib.firstChild);
    }
    if (A && A.switchServer) {
      sheetButton(list, 'wide servers', '\u21c4  ' + tr('switchServer'), function () { A.switchServer(); });
    }
    if (A && A.openAppSettings) {
      sheetButton(list, 'wide app', '\u2699  ' + tr('appSettings'), function () { A.openAppSettings(); });
    }
    var logout = null, links = [];
    Array.prototype.forEach.call(document.querySelectorAll('#GF_toolbar li a'), function (a) {
      if (a.querySelector('#servertime') || a.closest('.serverTime')) return;
      if (a.closest('.logout')) { logout = a; return; }
      // word for word the game's own row of links (its avatar picture goes with the player's name)
      var label = a.textContent.replace(/\s+/g, ' ').trim();
      if (label) links.push({ a: a, label: label });
    });
    // An odd number of links left a hole in the grid: Discord becomes a small square with its logo and
    // shares one cell with the version.
    var dc = links.filter(function (l) { return /discord/i.test(l.a.href || '') || /^discord$/i.test(l.label); })[0];
    var ver = links.filter(function (l) { return l.a.closest('.version'); })[0];
    var pair = links.length % 2 === 1 && dc && ver;
    links.forEach(function (l) {
      if (pair && l === ver) return;
      if (pair && l === dc) {
        var cell = list.appendChild(mk('div', 'pair'));
        var d = sheetButton(cell, 'discord', '', function () { press(dc.a); });
        d.title = dc.label;
        d.setAttribute('aria-label', dc.label);
        sheetButton(cell, 'version', ver.label, function () { press(ver.a); });
        return;
      }
      sheetButton(list, '', l.label, function () { press(l.a); });
    });
    if (logout) sheetButton(list, 'wide', logout.textContent.trim() || logout.title, function () { press(logout); });
  }

  // More > Switch server, filled in by the app: flag, name and players online of each server played here.
  api.servers = function (data) {
    if (!isThumb() || !data || !data.rows) return false;
    var list;
    if (data.update) {                   // the counts arrived: only the numbers change, no row moves
      list = document.querySelector('#ikm-sheet .list.serverlist');
      if (!list) return false;
      data.rows.forEach(function (row, i) {
        var n = list.querySelectorAll('button.server .online')[i];
        if (n) { setText(n, row.online); n.classList.toggle('known', !!row.online); }
      });
      return true;
    }
    if (!document.getElementById('container')) return false;
    list = openSheet('serverlist');
    list.appendChild(mk('div', 'title', data.title));
    data.rows.forEach(function (row) {
      var b = sheetButton(list, 'server' + (row.current ? ' current' : ''), '', function () {
        if (A && A.pickServer) A.pickServer(data.pass, row.host);
      });
      b.appendChild(mk('span', 'flag', row.flag));
      var who = b.appendChild(mk('span', 'who'));
      who.appendChild(mk('b', '', row.name));
      who.appendChild(mk('small', '', row.id));
      b.appendChild(mk('span', 'online' + (row.online ? ' known' : ''), row.online || '\u2026'));
    });
    sheetButton(list, 'lobby', data.lobby, function () {
      if (A && A.pickServer) A.pickServer(data.pass, '');
    });
    return true;
  };

  // Once after installing: "Watch the touch-controls tutorial?" in a small window of the same style.
  // Back, the X, a tap outside or "Not now" just close it.
  api.askTutorial = function (data) {
    var c = document.getElementById('container');
    if (!isThumb() || !c || !data || !data.pass) return false;
    closeSheet();
    closeAppSettings();
    clearHover();
    appSet = { pass: data.pass, values: {}, asking: true };
    var shade = uiBox('ikm-appset', c);
    shade.dir = data.rtl ? 'rtl' : 'ltr';
    shade.addEventListener('click', function (e) { if (e.target === shade) closeAppSettings(); });
    var win = shade.appendChild(mk('div', 'as-win as-small'));
    var hd = win.appendChild(mk('div', 'as-hd'));
    hd.appendChild(mk('h3', '', data.title));
    appButton(hd, 'as-x', '', closeAppSettings);
    var body = win.appendChild(mk('div', 'as-body'));
    body.appendChild(mk('p', 'as-text', '▶  ' + data.text));
    var ft = win.appendChild(mk('div', 'as-ft'));
    appButton(ft, 'as-btn', data.no, closeAppSettings);
    appButton(ft, 'as-btn as-save', data.yes, function () { appAct('tutorial'); });
    return true;
  };

  // Back with nothing open: the app asks whether this page has More (then Back twice leaves the app).
  api.hasMore = function () {
    return isThumb() && !!document.querySelector('#ikm-more button');
  };

  // More > App settings: everything of the app's own menu that More has not got, in a window drawn
  // with the game's own window pictures. The app fills it in (words, current values, a pass) and
  // gets the choices back with that pass. Buttons act at once; the settings wait for Save.
  var appSet = null;
  function closeAppSettings() {
    var w = document.getElementById('ikm-appset'), was = appSet;
    appSet = null;
    if (!w) return false;
    w.parentNode.removeChild(w);
    // the tutorial offer closed without Watch (Not now, Back, the X, a tap outside): answered
    if (was && was.asking && A && A.appAction) A.appAction(was.pass, 'tutorialNo');
    return true;
  }
  function appButton(into, cls, label, action) {
    var b = into.appendChild(mk('button', cls, label));
    b.type = 'button';
    b.addEventListener('click', function (e) {
      e.stopPropagation();
      action(b);
    });
    return b;
  }
  function appAct(key, keepOpen) {
    var pass = appSet && appSet.pass;
    if (appSet) appSet.asking = false;
    if (!keepOpen) closeAppSettings();
    if (pass && A && A.appAction) A.appAction(pass, key);
  }
  api.appSettings = function (data) {
    var c = document.getElementById('container');
    if (!isThumb() || !c || !data || !data.pass) return false;
    closeSheet();
    closeAppSettings();
    clearHover();
    appSet = { pass: data.pass, values: {} };
    var shade = uiBox('ikm-appset', c);
    shade.dir = data.rtl ? 'rtl' : 'ltr';
    shade.addEventListener('click', function (e) { if (e.target === shade) closeAppSettings(); });
    var win = shade.appendChild(mk('div', 'as-win'));
    var hd = win.appendChild(mk('div', 'as-hd'));
    hd.appendChild(mk('h3', '', data.title));
    appButton(hd, 'as-x', '', closeAppSettings).setAttribute('aria-label', data.close || tr('close'));
    var body = win.appendChild(mk('div', 'as-body'));
    if (data.server) body.appendChild(mk('div', 'as-server', data.server));

    var acts = body.appendChild(mk('div', 'as-acts'));
    (data.actions || []).forEach(function (a) {
      appButton(acts, 'as-btn', a.label, function () { appAct(a.key); });
    });

    (data.groups || []).forEach(function (g) {
      var box = body.appendChild(mk('div', 'as-box'));
      box.appendChild(mk('div', 'as-header', g.title));
      var row = box.appendChild(mk('div', 'as-choices' + (g.options.length > 3 ? ' as-many' : '')));
      appSet.values[g.key] = g.value;
      g.options.forEach(function (o) {
        appButton(row, 'as-btn as-choice' + (o.value === g.value ? ' as-on' : ''), o.label, function (b) {
          if (!appSet) return;
          appSet.values[g.key] = o.value;
          Array.prototype.forEach.call(row.children, function (k) { k.classList.toggle('as-on', k === b); });
        });
      });
    });

    var tb = body.appendChild(mk('div', 'as-box'));
    tb.appendChild(mk('div', 'as-header', data.togglesTitle));
    (data.toggles || []).forEach(function (t) {
      appSet.values[t.key] = !!t.value;
      var b = appButton(tb, 'as-toggle' + (t.value ? ' as-on' : ''), '', function () {
        if (!appSet) return;
        appSet.values[t.key] = !appSet.values[t.key];
        b.classList.toggle('as-on', appSet.values[t.key]);
      });
      b.appendChild(mk('span', 'as-tick'));
      b.appendChild(mk('span', 'as-label', t.label));
    });
    if (data.sleep) appButton(tb, 'as-btn as-sleep', data.sleep, function () { appAct('sleepChecks', true); });

    if (data.tutorial) {                 // the video tutorial (the written help when the build has none)
      appButton(body, 'as-btn as-tutorial', '▶  ' + data.tutorial, function () { appAct('tutorial'); });
    } else if (data.help && data.help.length) {
      var hb = body.appendChild(mk('div', 'as-box as-help'));
      appButton(hb, 'as-header as-fold', data.helpTitle, function () { hb.classList.toggle('as-open'); });
      data.help.forEach(function (line) { hb.appendChild(mk('p', '', line)); });
    }

    // Log out and clear saved data: last, and only after a second, clearly worded press.
    if (data.logout) {
      var lo = body.appendChild(mk('div', 'as-logout'));
      var ask = function () {
        lo.textContent = '';
        lo.classList.add('as-asking');
        lo.appendChild(mk('p', '', data.logout.text));
        var two = lo.appendChild(mk('div', 'as-two'));
        appButton(two, 'as-btn', data.logout.no, function () { lo.classList.remove('as-asking'); lo.textContent = ''; first(); });
        appButton(two, 'as-btn as-danger', data.logout.yes, function () { appAct(data.logout.key); });
        lo.scrollIntoView({ block: 'nearest' });
      };
      var first = function () { appButton(lo, 'as-btn', data.logout.label, ask); };
      first();
    }

    var ft = win.appendChild(mk('div', 'as-ft'));
    appButton(ft, 'as-btn', data.cancel || tr('cancel'), closeAppSettings);
    appButton(ft, 'as-btn as-save', data.save, function () {
      if (!appSet) return;
      var pass = appSet.pass, values = JSON.stringify(appSet.values);
      closeAppSettings();
      if (A && A.saveSettings) A.saveSettings(pass, values);
    });
    return true;
  };

  function ensureBars() {
    var c = document.getElementById('container');
    if (!c || document.getElementById('ikm-dock')) return;
    uiBox('ikm-dock', c);
    uiBox('ikm-clock', c);
    var more = uiBox('ikm-more', c).appendChild(mk('button'));
    more.type = 'button';
    more.appendChild(mk('b', '', '\u2630'));
    more.appendChild(mk('span', 'ikm-word', tr('more')));
    more.addEventListener('click', openMore);
    initSlider(uiBox('ikm-town', c));
    var tag = uiBox('ikm-here', c);
    tag.hidden = true;
    tag.appendChild(mk('i', '', '◉'));
    tag.appendChild(mk('b'));
    tag.addEventListener('click', function (e) {
      e.stopPropagation();
      if (slide.id !== null) return;
      slideReset();
    });
    ensureToggles(c);
  }
  function clockTick() {
    if (!isThumb()) return;
    var src = document.getElementById('servertime'), out = document.getElementById('ikm-clock');
    var t = src && out && /\d{1,2}:\d\d:\d\d.*$/.exec(src.textContent.trim());
    if (t) setText(out, t[0]);
  }
  // Row 1 of the top strip: the ambrosia count (from the game's shop button, "30 Ambrosia"), with the
  // game's own ambrosia icon. A tap opens the shop, as the shop in More does.
  function ensureAmbrosia() {
    var nav = document.getElementById('topnavi');
    var shopLi = document.querySelector('#globalResources .ambrosia, #globalResources .ambrosiaNoSpin');
    var shop = shopLi && shopLi.querySelector('a');
    var el = document.getElementById('ikm-ambro');
    if (!nav || !shop) { if (el) el.remove(); return; }
    if (!el) {
      el = mk('a');
      el.id = 'ikm-ambro';
      el.href = '#';
      el.appendChild(mk('i'));
      el.appendChild(mk('span'));
      el.addEventListener('click', function (e) {
        e.preventDefault();
        var s = document.querySelector('#globalResources .ambrosia a, #globalResources .ambrosiaNoSpin a');
        if (s) press(s);
      });
      nav.appendChild(el);
    }
    var title = shopLi.getAttribute('title') || shop.getAttribute('title') || '';
    var n = /\d[\d.,٫٬\s]*/.exec(title);
    setText(el.lastChild, n ? n[0].trim() : '');
    if (el.title !== title) el.title = title;
  }
  // Alliance members: the alliance chat and the alliance message are the top two items of the
  // friends column (the game's own buttons, hidden, do the work). Rebuilt if the game redraws it.
  var CLAN = [{ src: 'js_viewChat', cls: 'ikm-clan-chat' }, { src: 'js_viewAllyMessage', cls: 'ikm-clan-msg' }];
  function ensureClan() {
    var col = document.getElementById('js_viewFriends'), ul = col && col.querySelector('ul.friends');
    var first = ul && ul.querySelector('li.slot0'), second = ul && ul.querySelector('li.slot1');
    var step = first && second ? second.offsetTop - first.offsetTop : 44;
    if (!step || step < 30) step = 44;
    var any = false, n = 0;
    CLAN.forEach(function (c) {
      var link = document.querySelector('#' + c.src + ' a');
      var li = ul && ul.querySelector('li.' + c.cls);
      if (!link || !ul || !first) { if (li) li.remove(); return; }
      any = true;
      n++;
      if (!li) {
        li = mk('li', 'slot ikm-clan ' + c.cls);
        var a = li.appendChild(mk('a', 'image'));
        a.href = '#';
        a.addEventListener('click', function (e) {
          e.preventDefault();
          e.stopPropagation();
          var l = document.querySelector('#' + c.src + ' a');
          if (l) l.click();
        });
        ul.insertBefore(li, ul.firstChild);
      }
      // above the column's edit handle (it separates them from the friends): the chat at the very top,
      // the message under it
      // one unbroken column: the handle right on the first friend, the alliance items right on the handle
      var edit = col.querySelector('a.edit'), h = first.offsetHeight || 40, floor;
      if (edit && edit.offsetHeight) {
        var et = (ul.offsetTop + first.offsetTop - edit.offsetHeight) + 'px';
        if (edit.style.top !== et) edit.style.top = et;
        floor = first.offsetTop - edit.offsetHeight;
      } else {
        floor = first.offsetTop;
      }
      var top = (floor - h * (CLAN.length - CLAN.indexOf(c))) + 'px';
      if (li.style.top !== top) li.style.top = top;
      var name = (link.getAttribute('alt') || link.textContent || '').trim();
      if (li.getAttribute('data-ikm-name') !== name) li.setAttribute('data-ikm-name', name);
      var a2 = li.firstChild;
      if (a2.title !== name) a2.title = name;
      // the game's own icon (its 43 x 40 picture fitted into the 34 px frame), lit when there is news
      var cs = getComputedStyle(link), k = 34 / 43;
      var pos = cs.backgroundPosition.split(' ').map(function (v) { return (parseFloat(v) || 0) * k + 'px'; }).join(' ');
      if (a2.style.backgroundImage !== cs.backgroundImage) a2.style.backgroundImage = cs.backgroundImage;
      a2.style.backgroundSize = '34px auto';
      if (a2.style.backgroundPosition !== pos) a2.style.backgroundPosition = pos;
      li.classList.toggle('ikm-new', link.classList.contains('activated'));
    });
    document.documentElement.classList.toggle('ikm-clan', any);
    var box = document.getElementById('ikm-tfriends');
    if (box) box.classList.toggle('ikm-new', !!document.querySelector('#js_viewChat a.activated'));
    return n;
  }
  function thumbLayout() {
    if (!isThumb()) return;
    ensureBars();
    ensureAmbrosia();
    ensureClan();
    clockTick();
    checkSavedOrder();
    document.documentElement.classList.toggle('ikm-rtl', !!document.body && getComputedStyle(document.body).direction === 'rtl');
    var bar = document.getElementById('ikm-town');
    if (bar) {
      bar.hidden = !document.querySelector('#js_citySelectContainer .dropDownButton');
      if (!bar.hidden) slideRefresh();
    }
    updateToggles();
    // each column of side buttons stands on the button that opens it
    var limit = window.innerHeight - DOCK_TOP - TOWN_H - 8;
    ['js_viewCityMenu', 'js_viewFriends'].forEach(function (id) {
      var m = document.getElementById(id);
      if (!m) return;
      var r = m.getBoundingClientRect(), bottom = r.bottom, highest = r.top;
      Array.prototype.forEach.call(m.querySelectorAll('li, .showfriends, .pagedown, .pageup'), function (e) {
        var er = e.getBoundingClientRect();
        if (er.width && er.height) { bottom = Math.max(bottom, er.bottom); highest = Math.min(highest, er.top); }
      });
      var above = r.top - highest;          // items above the column's own top (the alliance ones)
      var top = Math.round(Math.max(STRIP_H + 60 + above, limit - (bottom - r.top)) / MENU_Z) + 'px';
      m.__ikmTop = parseFloat(top) * MENU_Z - above;
      if (m.style.getPropertyValue('--ikm-mtop') !== top) m.style.setProperty('--ikm-mtop', top);
    });
  }

  /* ------------------------------------------------------------ side menus */

  // Thumb layout: the two columns of side buttons are retracted into the bottom until the player
  // opens them with the buttons beside the town bar. They stay that way (across servers and
  // restarts) until pressed again. An open column is a place panels keep out of; a retracted
  // one leaves its space to them.
  var MENUS = [
    { id: 'js_viewCityMenu', box: 'ikm-tcity', state: 'cityMenu', word: 'cityMenu', cls: 'ikm-open-city' },
    { id: 'js_viewFriends', box: 'ikm-tfriends', state: 'friends', word: 'friends', cls: 'ikm-open-friends' }
  ];

  function menuHasItems(m) {
    return !!m && Array.prototype.some.call(m.querySelectorAll('li'), function (li) {
      return getComputedStyle(li).display !== 'none';
    });
  }
  // The columns in the way of panels: classic both, thumb the open ones.
  function blockingMenus() {
    var thumb = isThumb(), out = [];
    MENUS.forEach(function (d) {
      var m = document.getElementById(d.id);
      if (!m) return;
      // (one that retracts by itself only lies over the panels for a moment: nothing moves for it)
      if (thumb && (autoMenu(d) || !cfg[d.state] || !menuHasItems(m))) return;
      var r = m.getBoundingClientRect();
      if (!r.width || !r.height) return;
      // in thumb the column may still be gliding: its resting top is what counts
      out.push({ left: r.left, right: r.right, top: thumb && m.__ikmTop ? m.__ikmTop : r.top });
    });
    return out;
  }
  function menuClasses() {
    MENUS.forEach(function (d) {
      var open = menuOpen(d) || (quick.on && quick.d === d);
      document.documentElement.classList.toggle(d.cls, open);
    });
  }
  function toggleMenu(d) {
    clearHover();
    if (autoMenu(d)) {
      autoOpen = !autoOpen;
      collapseItems();
      menuClasses();
    } else {
      cfg[d.state] = !cfg[d.state];
      menuClasses();
      if (A && A.menus) A.menus(!!cfg.cityMenu, !!cfg.friends);
    }
    portraitLayout();
  }
  function ensureToggles(c) {
    MENUS.forEach(function (d) {
      var box = uiBox(d.box, c), b = box.appendChild(mk('button'));
      b.type = 'button';
      b.appendChild(mk('i', 'ikm-ico'));
      b.appendChild(mk('span', 'ikm-word', tr(d.word)));
      initQuick(box, d);                 // press = show / retract, slide = pick
    });
  }
  function updateToggles() {
    MENUS.forEach(function (d) {
      var box = document.getElementById(d.box);
      if (!box) return;
      box.hidden = !menuHasItems(document.getElementById(d.id));
      document.documentElement.classList.toggle('ikm-no-' + d.box.slice(4), box.hidden);   // the town bar takes its place
      box.firstChild.setAttribute('aria-expanded', menuOpen(d) ? 'true' : 'false');
      var w = box.querySelector('.ikm-word');
      if (w) setText(w, tr(menuWord(d)));
      fitWord(w);
    });
  }
  // In an alliance the friends button holds the alliance chat too: "Social".
  function menuWord(d) {
    return d.state === 'friends' && document.documentElement.classList.contains('ikm-clan') ? 'social' : d.word;
  }
  // Some languages need a longer word: a smaller size rather than a cut-off one.
  function fitWord(el) {
    if (!el || !el.clientWidth) return;
    function cut() { return el.scrollWidth > el.clientWidth || el.scrollHeight > el.clientHeight + 1; }
    if (el.__ikmWord !== el.textContent) {
      el.__ikmWord = el.textContent;
      el.style.fontSize = '';
    } else if (!cut()) {
      return;
    }
    for (var size = parseFloat(el.style.fontSize) || 13; cut() && size > 9; ) {
      size -= 0.5;
      el.style.fontSize = size + 'px';
    }
  }
  // The server's language may only be known after the bars were built.
  function relabel() {
    var more = document.querySelector('#ikm-more .ikm-word');
    if (more) setText(more, tr('more'));
    MENUS.forEach(function (d) {
      var w = document.querySelector('#' + d.box + ' .ikm-word');
      if (w) { setText(w, tr(menuWord(d))); fitWord(w); }
    });
  }

  /* ------------------------------------------------------------ side menus, quick pick */

  // Retract by itself (a setting, on by default): the city menu then lies over the panels while it
  // is open and goes away once something is picked or the player touches elsewhere.
  var autoOpen = false;
  // Both menu buttons: a press shows / retracts, a slide from the button opens out the item beside the
  // finger and letting go there presses it. Letting go on the button (or past the top) picks nothing.
  //
  // Thumb draws this itself. The game's own hover adds a 300 ms animation once for each time it has
  // bound its handler (six times in an old town) and never stops one, so closing lagged up to 1.8 s.
  // Here each item has its own CSS transition: quick out, slow back, turning round wherever it is.
  // The items left behind are each a little further closed than the one before: the trailing pyramid.
  var QUICK_HOLD = 260;
  var quick = { on: false, d: null, id: null, item: null, used: false, moved: false, timer: 0, list: [], top: 0, mid: 0 };

  function autoMenu(d) {
    return d.state === 'cityMenu' && !!cfg.cityAuto;
  }
  function menuOpen(d) {
    return autoMenu(d) ? autoOpen : !!cfg[d.state];
  }
  function retractAuto() {
    if (!autoOpen) return;
    autoOpen = false;
    collapseItems();
    menuClasses();
    updateToggles();
  }
  // A town menu item whose opening out is ours (thumb), else null.
  function ownMenuItem(el) {
    return (isThumb() && el && el.closest && el.closest('#js_viewCityMenu li.expandable')) || null;
  }
  function setOut(li) {
    Array.prototype.forEach.call(document.querySelectorAll('.slot_menu li.ikm-out'), function (e) {
      if (e !== li) e.classList.remove('ikm-out');
    });
    if (li) li.classList.add('ikm-out');
  }
  function itemIsOut(li) {
    return parseFloat(li.style.width) > 60;
  }
  function collapseItems(keep) {
    if (isThumb()) { setOut(keep || null); return; }
    Array.prototype.forEach.call(document.querySelectorAll('#js_viewCityMenu li'), function (li) {
      if (li === keep) return;
      if (itemIsOut(li) || li === hovered) mouse('mouseout', -50, -50, li, 0);
      if (hovered && li.contains(hovered)) hovered = null;
    });
  }
  // Classic (the game's own animation): the menu could leave several items open at once.
  function oneItemOut() {
    if (isThumb()) return;
    var out = Array.prototype.filter.call(document.querySelectorAll('#js_viewCityMenu li'), itemIsOut);
    if (out.length < 2) return;
    collapseItems((hovered && hovered.closest && hovered.closest('#js_viewCityMenu li')) || null);
  }
  function quickShow(box, d) {
    clearTimeout(quick.timer);
    if (quick.on) return;
    clearHover();
    thumbLayout();                       // the column's place, before the heavy work pauses
    quick.on = true;
    quick.d = d;
    quick.item = null;
    document.documentElement.classList.add('ikm-quick');
    menuClasses();
    // where the items rest: measured once, so nothing that animates can move the targets
    var b = box.getBoundingClientRect(), list = [];
    Array.prototype.forEach.call(document.querySelectorAll('#' + d.id + ' li'), function (li) {
      var r = li.getBoundingClientRect();
      if (!r.height || getComputedStyle(li).display === 'none') return;
      if (d.state === 'friends' && !li.classList.contains('ikm-clan')) {
        var a = li.querySelector('a.image');
        li.setAttribute('data-ikm-name', (a && a.getAttribute('title')) || tr('friends'));
      }
      list.push({ li: li, top: r.top, bottom: r.bottom });
    });
    list.sort(function (a, c) { return c.top - a.top; });          // from the button upward
    quick.list = list;
    quick.top = b.top;
    quick.mid = (b.left + b.right) / 2;
    if (A && A.haptic) A.haptic();
  }
  function quickItemAt(x, y) {
    if (y >= quick.top || Math.abs(x - quick.mid) > 330) return null;
    var best = null, gap = 24;
    quick.list.forEach(function (o) {
      var d = y < o.top ? o.top - y : y > o.bottom ? y - o.bottom : 0;
      if (o === quick.item) d -= 5;      // a trembling finger on the line between two keeps the one it has
      if (d < gap) { gap = d; best = o; }
    });
    return best;
  }
  function quickMove(x, y) {
    var now = quickItemAt(x, y);
    if (now === quick.item) return;
    // a fast finger can jump several items in one step: those flash out, then close with the rest
    var from = quick.list.indexOf(quick.item), to = quick.list.indexOf(now), passed = [];
    if (now) {
      for (var i = Math.min(from, to) + 1; i < Math.max(from, to); i++) passed.push(quick.list[i].li);
    }
    if (passed.length) {
      passed.forEach(function (li) { li.classList.add('ikm-passed'); });
      void passed[0].offsetWidth;
      passed.forEach(function (li) { li.classList.remove('ikm-passed'); });
    }
    quick.item = now;
    setOut(now && now.li);
    if (!now) return;
    quick.moved = true;
    if (A && A.tick) A.tick();
  }
  function quickEnd(pick) {
    clearTimeout(quick.timer);
    quick.id = null;
    if (!quick.on) return;
    var d = quick.d, li = pick && quick.item ? quick.item.li : null;
    quick.on = false;
    quick.d = quick.item = null;
    quick.list = [];
    if (d.state === 'cityMenu' && quick.moved) autoOpen = false;
    setOut(null);
    document.documentElement.classList.remove('ikm-quick');
    menuClasses();
    updateToggles();
    if (!li || !li.isConnected) return;
    // the player's finger chose it: the game's own button
    (d.state === 'friends' ? li.querySelector('a.image') || li : li).click();
  }
  function initQuick(box, d) {
    box.addEventListener('pointerdown', function (e) {
      if (quick.id !== null) return;
      quick.id = e.pointerId;
      quick.used = quick.moved = false;
      quick.y = e.clientY;
      try { box.setPointerCapture(e.pointerId); } catch (err) { /* not a live pointer */ }
      quick.timer = setTimeout(function () { quickShow(box, d); }, QUICK_HOLD);
    });
    box.addEventListener('pointermove', function (e) {
      if (quick.id !== e.pointerId) return;
      if (quick.y - e.clientY >= DRAG_START) {             // sliding up starts it at once
        quick.moved = true;
        if (!quick.on) quickShow(box, d);
      }
      if (quick.on) quickMove(e.clientX, e.clientY);
    });
    box.addEventListener('pointerup', function (e) {
      if (quick.id !== e.pointerId) return;
      if (quick.on) quickMove(e.clientX, e.clientY);
      var press = !quick.moved;          // never left the button, however long it was held
      quickEnd(!press);
      quick.used = true;
      if (press) toggleMenu(d);
    });
    box.addEventListener('pointercancel', function (e) {
      if (quick.id === e.pointerId) quickEnd(false);
    });
    box.addEventListener('click', function (e) {           // without a pointer (keyboard, scripts)
      e.stopPropagation();
      if (quick.used) { quick.used = false; return; }
      toggleMenu(d);
    });
  }

  /* ------------------------------------------------------------ transport window */

  // The game's little transport window has an X with nothing behind it: both that X and Back close
  // it here, the way its own button does (a slide).
  function closeTransport() {
    var p = document.getElementById('js_transportPanel');
    if (!p || !visible(p)) return false;
    if (window.jQuery) jQuery(p).stop(true, true).slideUp(200);
    else p.style.display = 'none';
    return true;
  }
  function onAnyClick(e) {
    var t = e.target;
    if (!t || !t.closest) return;
    if (t.closest('#js_transportPanel .close')) {
      closeTransport();
      return;
    }
    // picked: the panel gets out of the way of the window it opens (after the game's own click)
    if (isThumb() && t.closest('#js_transportPanel .transportPanel_actionIcon:not(.disabled)')) setTimeout(closeTransport, 60);
    if (autoOpen && !quick.on && t.closest('#js_viewCityMenu li')) setTimeout(retractAuto, 120);   // picked
  }

  /* ------------------------------------------------------------ X and back: bigger targets */

  // The game's X and back buttons are 18 px. They keep that look; what can be hit is much bigger
  // (an invisible square around each), and a window's back button stands further from its X.
  function markHitBoxes() {
    var sel = '.mainHeader .close, .mainHeader .back, .variableMainHeader .close, .accordionTitle .close,' +
      ' .popup_window .close, .popupMessage .close, .infoTip .close';
    Array.prototype.forEach.call(document.querySelectorAll(sel), function (b) {
      if (b.classList.contains('ikm-hit') || !b.getBoundingClientRect().width) return;
      // only buttons that are already positioned: the square is placed from the button itself
      if (getComputedStyle(b).position !== 'static') b.classList.add('ikm-hit');
    });
  }

  /* ------------------------------------------------------------ game pop-ups */

  // The game places its pop-ups (tutorial, offers, questions) for a 1024 px wide screen, 320 px in
  // from the start: half off a phone. Each is centred when it appears and kept on the screen.
  // A pop-up that is itself the window (its own title bar and body, e.g. the daily bonus) moves as
  // one piece; a holder of several pop-ups moves each of them.
  function popupUnits() {
    var out = [];
    Array.prototype.forEach.call(document.querySelectorAll('#multiPopup, #popupMessage'), function (holder) {
      if (holder.querySelector(':scope > .hd, :scope > .bd')) {
        out.push(holder);
        Array.prototype.forEach.call(holder.children, function (c) { if (c.style.translate) c.style.translate = ''; });
      } else {
        out.push.apply(out, holder.children);
      }
    });
    // the alliance chat (and other small game panels): a pop-up inside a .popup_window
    Array.prototype.forEach.call(document.querySelectorAll('.popup_window .popupMessage'), function (pm) {
      if (out.indexOf(pm) < 0) out.push(pm);
    });
    return out;
  }
  // Does `e` move when `unit` is moved? Not when it is placed against something outside the unit
  // (e.g. the game's hidden town drop-down inside the daily bonus is placed against the page).
  function movesWith(e, unit) {
    if (e === unit) return true;
    var pos = getComputedStyle(e).position;
    if (pos === 'fixed') return false;
    if (pos !== 'absolute') return true;
    var p = e.offsetParent;
    return !!p && unit.contains(p);
  }
  function fitPopups() {
    var W = window.innerWidth, H = window.innerHeight;
    popupUnits().forEach(function (child) { fitPopup(child, W, H, 0); });
  }
  function fitPopup(child, W, H, again) {
    {
      if (child.classList.contains('modalBackground') || /^(SCRIPT|STYLE)$/.test(child.tagName)) return;
      var moved = (child.style.translate || '').split(' ');
      if (Math.abs(parseFloat(moved[0]) || 0) > 2 * W || Math.abs(parseFloat(moved[1]) || 0) > 2 * H) {
        child.style.translate = '';                                   // drifted away somehow: start again
        child.__ikmCentred = 0;
      }
      var l = Infinity, r = -Infinity, t = Infinity, b = -Infinity;
      [child].concat(Array.prototype.slice.call(child.querySelectorAll('*'))).forEach(function (e) {
        var q = e.getBoundingClientRect();
        if (q.width < 3 || q.height < 3) return;
        // parked far away = hidden by the game (e.g. its real drop-down at top: -4000px)
        if (q.left < -2000 || q.left > W + 2000 || q.top < -2000 || q.top > H + 2000) return;
        if (q.width >= W && q.height >= H * 0.9) return;              // a dimmed backdrop
        if (getComputedStyle(e).visibility === 'hidden') return;
        if (!movesWith(e, child)) return;
        l = Math.min(l, q.left); r = Math.max(r, q.right); t = Math.min(t, q.top); b = Math.max(b, q.bottom);
      });
      if (l === Infinity) { child.__ikmCentred = 0; return; }
      // thumb: a small pop-up (save an island, confirm...) grows to be easy to read and press
      var z = parseFloat(child.style.zoom) || 1;
      if (isThumb()) {
        var nat = (r - l) / z, natH = (b - t) / z;
        var want = nat > 60 ? Math.min(POPUP_UP, (W - 2 * PANEL_GAP) / nat, (H * 0.8) / Math.max(natH, 1)) : 1;
        if (want < 1) want = 1;
        if (Math.abs(want - z) > 0.02) {
          child.style.zoom = want === 1 ? '' : want.toFixed(3);
          child.__ikmCentred = 0;
          if (again < 2) fitPopup(child, W, H, again + 1);       // measured again, now
          return;
        }
      }
      child.setAttribute('data-ikm-fit', '1');            // placed: may be seen now (see the observer below)
      var w = Math.round(r - l), dx = 0, dy = 0;
      if (child.__ikmCentred !== w || l < 0 || r > W) dx = r - l > W ? 4 - l : W / 2 - (l + r) / 2;
      if (b > H - 4) dy = H - 4 - b;
      if (t + dy < 4) dy = 4 - t;
      child.__ikmCentred = w;
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return;
      var now = (child.style.translate || '').split(' ');
      // (a zoomed pop-up moves zoom times as far as its translate says)
      child.style.translate = ((parseFloat(now[0]) || 0) + dx / z).toFixed(1) + 'px ' + ((parseFloat(now[1]) || 0) + dy / z).toFixed(1) + 'px';
    }
  }

  /* ------------------------------------------------------------ which server */

  // Tells the app which server's game is running, and its language: the app opens that server next
  // time, checks it for news and speaks its language. The game's "ar" is Argentina, unless the page
  // reads right to left.
  var reported = '', reportedVersion = '';
  function gameVersion() {
    var links = document.querySelectorAll('#GF_toolbar a');
    for (var i = 0; i < links.length; i++) {
      var m = /^\s*v(\d+(?:\.\d+)+)\s*$/.exec(links[i].textContent || '');
      if (m) return m[1];
    }
    return '';
  }
  // The language the game is shown in (its Options can differ from the server's community, e.g.
  // English on an Arabic server): the game loads its skin as /skin/compiled-<code>-city.css, next to
  // compiled-ltr-common / compiled-rtl-common. Its LocalizationStrings keep the server's code.
  function displayLanguage() {
    var links = document.querySelectorAll('link[rel="stylesheet"]');
    for (var i = 0; i < links.length; i++) {
      var m = /\/skin\/compiled-([a-z]{2})-[a-z_]+\.css/i.exec(links[i].href || '');
      if (m) return m[1].toLowerCase();
    }
    return '';
  }
  function reportPage() {
    if (!A || !A.page || !document.body || !document.getElementById('advisors')) return;
    if (!/^(city|island|worldmap_iso)$/.test(document.body.id)) return;
    var code = displayLanguage(), name = '';
    try {
      if (!code) code = String((window.LocalizationStrings || {}).language || '');
      name = String(ikariam.model.serverName || '');
    } catch (e) { /* not ready yet */ }
    if (!code) return;
    if (code === 'ar' && getComputedStyle(document.body).direction === 'rtl') code = 'ae';
    // the live game's version, from its own row of links ("v17.6.1"): the app tells if it changed
    var ver = gameVersion();
    if (ver && ver !== reportedVersion && A.gameVersion) {
      reportedVersion = ver;
      A.gameVersion(ver);
    }
    var sig = code + '|' + name;
    if (sig === reported) return;
    reported = sig;
    A.page(code, name);
  }

  // What the four advisors show while the player is looking: told when it changes (the app announces
  // what is new at once). Not repeated: a page resumed from the background still shows old values for
  // a moment, which must not undo what a check found meanwhile. Every 10 s only "still running".
  var newsSig = '', aliveAt = 0;
  function reportNews() {
    if (!A || !A.seen) return;
    var seen = {}, any = false;
    ['cities', 'military', 'research', 'diplomacy'].forEach(function (key) {
      var a = document.getElementById('js_GlobalMenu_' + key);
      if (a) { seen[key] = a.className; any = true; }
    });
    if (!any) return;
    var now = performance.now();
    if (A.alive && (!aliveAt || now - aliveAt >= 10000)) {
      aliveAt = now;
      A.alive();
    }
    unseenNews(now);
    var sig = JSON.stringify(seen);
    if (sig === newsSig) return;
    newsSig = sig;
    A.seen(sig);
  }

  // News the app read for a notification (the game then counts it as read): until the player has looked
  // at that advisor here, the advisor glows (advisorPictures) and those lines carry the game's own
  // "highlight" again, as if the app had never looked. Looking = that advisor's window was open.
  var unseen = {}, unseenAt = -1e9, unseenShown = {};
  var ADVISOR_VIEWS = { cities: 'tradeAdvisor', military: 'militaryAdvisor', research: 'researchAdvisor', diplomacy: 'diplomacyAdvisor' };
  function unseenNews(now) {
    if (!A || !A.unseen) return;
    if (now - unseenAt > 2500) {
      unseenAt = now;
      try { unseen = JSON.parse(A.unseen() || '{}') || {}; } catch (e) { unseen = {}; }
    }
    Object.keys(ADVISOR_VIEWS).forEach(function (key) {
      var tv = document.querySelector('.templateView[id^="' + ADVISOR_VIEWS[key] + '"]');
      if (!tv) { delete unseenShown[key]; return; }
      var list = unseen[key];
      if (list && list.length) {                      // seen now: remembered for this window only
        var keys = unseenShown[key] || (unseenShown[key] = {});
        list.forEach(function (l) { keys[l.k] = 1; });
        delete unseen[key];
        A.newsSeen(key);
      }
      var mine = unseenShown[key];
      if (!mine) return;
      Array.prototype.forEach.call(tv.querySelectorAll('tr'), function (tr) {
        if (tr.classList.contains('highlight')) return;
        var cells = Array.prototype.filter.call(tr.children, function (c) { return c.tagName === 'TD'; });
        if (cells.length < 2) return;
        var k = cells.map(function (c) { return (c.textContent || '').replace(/[\s ]+/g, ' ').trim(); }).join('|');
        if (mine[k]) tr.classList.add('highlight');
      });
    });
  }

  /* ------------------------------------------------------------ town wheel */

  // The town bar is a wheel of the player's towns in their order, the one you are in in the middle.
  // It follows the finger exactly; a flick spins it on, slowing down, and it always comes to rest with
  // one town in the middle. It never switches by itself: another town resting in the middle is ringed,
  // and a tap on it goes there at once. A tap on a town beside the middle goes there at once too; a tap
  // on the town you are in opens the full list. Back, or the "you are here" tag, turns it back.
  // Felt (a setting): small notches between towns, a firmer one as each town passes the middle.
  var SLIDE_STEP = 160;        // px from one town to the next
  var NOTCHES = 6;             // felt steps from one town to the next
  var FRICTION = 0.00004;      // towns per ms, lost each ms by a spinning wheel
  var slide = { items: [], cur: 0, pos: 0, id: null, moved: false, locked: false, spinning: false, caught: false,
                raf: 0, notch: null, town: null, buzzAt: 0 };

  function slideIndex(i) {
    var n = slide.items.length;
    return n ? ((i % n) + n) % n : 0;
  }
  // The next town is in the reading direction: to the left in Arabic.
  function readDir() {
    return document.documentElement.classList.contains('ikm-rtl') ? -1 : 1;
  }
  function slideRefresh() {
    if (slide.locked && currentTownId() === slide.target) {            // arrived without a page load
      clearTimeout(slide.unlock);
      slide.locked = false;
    }
    if (slide.id !== null || slide.spinning || slide.locked) return;   // in use
    var items = townItems().map(function (li) {          // the player's own, then the occupied ones
      var a = li.querySelector('a');
      var icon = a && /^url\("([^"]+)"\)/.exec(getComputedStyle(a).backgroundImage);
      return { id: townId(li), name: (a ? (a.title || a.textContent) : li.textContent).trim(),
               icon: icon ? icon[1] : '', other: !li.classList.contains('ownCity') };
    });
    var id = currentTownId(), cur = -1;
    items.forEach(function (t, i) { if (t.id === id) cur = i; });
    if (cur < 0) {                     // a town that is not in the menu: shown before the others
      var sel = document.querySelector('#js_citySelectContainer .dropDownButton a');
      items.unshift({ id: id, name: sel ? (sel.title || sel.textContent).trim() : '', icon: '' });
      cur = 0;
    }
    var sig = JSON.stringify(items) + cur + readDir();
    if (sig === slide.sig) return;
    slide.sig = sig;
    slide.items = items;
    slide.cur = slide.pos = cur;
    slide.town = slide.notch = null;
    slideRender();
  }
  function slideAway() {
    return slideIndex(Math.round(slide.pos)) !== slide.cur && !slide.locked;
  }
  function slideRender() {
    var track = document.querySelector('#ikm-town .ikm-track');
    if (!track || !slide.items.length) return;
    var mid = Math.round(slide.pos), one = slide.items.length === 1;
    track.parentNode.classList.toggle('single', one);
    var here = slide.items[slideIndex(slide.cur)], resting = slide.id === null && !slide.spinning;
    Array.prototype.forEach.call(track.children, function (el, k) {
      var i = mid + k - 2, t = slide.items[slideIndex(i)], now = i === mid;
      var d = Math.min(2, Math.abs(i - slide.pos));                    // the further out, the smaller and fainter
      el.style.transform = 'translateX(' + ((i - slide.pos) * SLIDE_STEP * readDir()).toFixed(1) + 'px) scale(' +
        (1 - 0.12 * d).toFixed(3) + ')';
      el.style.opacity = (1 - 0.3 * d).toFixed(2);
      el.style.visibility = one && !now ? 'hidden' : '';
      el.classList.toggle('name', now);
      el.classList.toggle('ikm-other', !!t.other);
      el.classList.toggle('ikm-here', !!here && t.id === here.id);      // the town the player is in
      el.classList.toggle('ikm-go', now && resting && slideAway());      // resting on another town: tap to go
      setText(el.lastChild, t.name);
      var img = el.firstChild;
      img.hidden = !t.icon;
      if (t.icon && img.getAttribute('src') !== t.icon) img.setAttribute('src', t.icon);
    });
    // Away from it: "you are here" above the bar; a tap there turns back and switches nothing.
    var tag = document.getElementById('ikm-here');
    if (tag && here) {
      tag.hidden = !slideAway();
      setText(tag.lastChild, here.name);
    }
  }
  // What the finger feels: a small notch every 1/NOTCHES of a town, a firmer one as a town passes the middle.
  function slideFeel() {
    var t = Math.floor(slide.pos + 1e-6), n = Math.floor(slide.pos * NOTCHES + 1e-6);
    if (slide.town === null) { slide.town = t; slide.notch = n; return; }
    var buzz = cfg.wheelBuzz !== false && A && A.notch, now = performance.now();
    if (t !== slide.town) {
      slide.town = t;
      slide.notch = n;
      if (buzz) { A.notch(true); slide.buzzAt = now; }
    } else if (n !== slide.notch) {
      slide.notch = n;
      if (buzz && now - slide.buzzAt > 28) { A.notch(false); slide.buzzAt = now; }    // never a buzz, however fast
    }
  }
  function slideStop() {
    cancelAnimationFrame(slide.raf);
    clearTimeout(slide.endTimer);
    slide.spinning = false;
  }
  function slideReset() {
    slideStop();
    clearTimeout(slide.unlock);
    slide.locked = false;
    slide.pos = slide.cur;
    slide.town = slide.notch = null;
    slideRender();
  }
  // Back while another town is in the middle = turn back to the one you are in.
  function slideCancel() {
    if (!slideAway() || slide.id !== null) return false;
    slideReset();
    return true;
  }
  // Spin on from where it is at `v` towns per ms, slowing down, to rest exactly on a town.
  function slideSpin(v) {
    slideStop();
    var n = slide.items.length, from = slide.pos;
    var dist = v * Math.abs(v) / (2 * FRICTION);
    dist = Math.max(-2 * n, Math.min(2 * n, dist));
    var to = Math.round(from + dist), span = to - from;
    if (Math.abs(span) < 1e-3) { slide.pos = to; slideFeel(); slideRender(); return; }
    // an ease-out that starts at the finger's own speed
    var dur = Math.abs(v) > 1e-4 ? Math.min(1600, Math.max(200, 3 * Math.abs(span) / Math.abs(v))) : 200;
    slideAnimate(from, to, dur);
  }
  // Moves the wheel from `from` to exactly `to` in `dur` ms, slowing down; a timer makes sure it arrives
  // even when no frames are drawn (a page in the background).
  function slideAnimate(from, to, dur) {
    var span = to - from, began = performance.now();
    slide.spinning = true;
    var end = function () {
      cancelAnimationFrame(slide.raf);
      clearTimeout(slide.endTimer);
      slide.pos = to;
      slide.spinning = false;
      slideFeel();
      slideRender();
    };
    var step = function () {
      var k = Math.min(1, (performance.now() - began) / dur);
      if (k >= 1) { end(); return; }
      slide.pos = from + span * (1 - Math.pow(1 - k, 3));
      slideFeel();
      slideRender();
      slide.raf = requestAnimationFrame(step);
    };
    clearTimeout(slide.endTimer);
    slide.endTimer = setTimeout(end, dur + 60);
    slide.raf = requestAnimationFrame(step);
  }
  function slideCommit(to) {
    var t = slide.items[slideIndex(to)];
    var li = t && townItems().filter(function (e) { return townId(e) === t.id; })[0];
    if (!li || t.id === currentTownId()) { slideReset(); return; }
    slideStop();
    slide.pos = to;
    slideRender();
    slide.locked = true;                  // the game is loading that town
    slide.target = t.id;
    slide.unlock = setTimeout(slideReset, 8000);     // it did not: show the real one again
    townBusy = 0;
    selectTown(li);
  }

  function initSlider(box) {
    var track = box.appendChild(mk('div', 'ikm-track'));
    for (var i = 0; i < 5; i++) {
      var slot = track.appendChild(mk('span', 'ikm-slot'));
      slot.appendChild(mk('img')).alt = '';
      slot.appendChild(mk('b'));
    }
    box.appendChild(mk('i', 'ikm-hint ikm-l', '‹'));
    box.appendChild(mk('i', 'ikm-hint ikm-r', '›'));
    var x0 = 0, pos0 = 0, samples = [];

    box.addEventListener('pointerdown', function (e) {
      if (slide.locked || slide.id !== null) return;
      slide.id = e.pointerId;
      slide.moved = slide.openList = false;
      slide.caught = slide.spinning;                     // a finger on a spinning wheel stops it there
      slideStop();
      x0 = e.clientX;
      pos0 = slide.pos;
      samples = [[performance.now(), slide.pos]];
      if (slide.town === null) slideFeel();
      try { box.setPointerCapture(e.pointerId); } catch (err) { /* not a live pointer */ }
    });
    box.addEventListener('pointermove', function (e) {
      if (slide.id !== e.pointerId || slide.items.length < 2) return;
      var dx = e.clientX - x0;
      if (!slide.moved) {
        if (Math.abs(dx) < DRAG_START) return;
        slide.moved = true;
      }
      slide.pos = pos0 - dx / SLIDE_STEP * readDir();    // exactly under the finger
      var now = performance.now();
      samples.push([now, slide.pos]);
      while (samples.length > 2 && now - samples[0][0] > 100) samples.shift();
      slideFeel();
      slideRender();
    });
    box.addEventListener('pointerup', function (e) {
      if (slide.id !== e.pointerId) return;
      slide.id = null;
      if (!slide.moved) {                                // a press
        if (slide.caught) { slideSpin(0); return; }      // it only stopped the spin: rest on the nearest town
        var r = box.getBoundingClientRect(), base = Math.round(slide.pos);
        var off = slide.items.length < 2 ? 0 :
          Math.max(-2, Math.min(2, Math.round((e.clientX - (r.left + r.right) / 2) / SLIDE_STEP)));
        if (off) {                                       // a press on a town beside the middle: go there now
          slideCommit(base + off * readDir());
          return;
        }
        if (slideIndex(base) !== slide.cur) { slideCommit(base); return; }       // the ringed town: go
        slideReset();
        slide.openList = true;                           // the click opens it (on pointerup the click would close it)
        return;
      }
      var now = performance.now(), last = samples[samples.length - 1], first = samples[0];
      var v = now - last[0] > 80 || last[0] - first[0] < 8 ? 0 : (last[1] - first[1]) / (last[0] - first[0]);
      slideSpin(v);
    });
    box.addEventListener('pointercancel', function (e) {
      if (slide.id !== e.pointerId) return;
      slide.id = null;
      slideSpin(0);
    });
    box.addEventListener('click', function (e) {
      e.stopPropagation();
      if (!slide.openList) return;                       // a slide, or a press on a neighbour
      slide.openList = false;
      if (!slide.locked) openTowns();
    });
  }
  // Glide to exactly that town (a press beside the middle), feeling the notches on the way.
  function slideSpinTo(to) {
    slideStop();
    slideAnimate(slide.pos, to, 160 + 60 * Math.abs(to - slide.pos));
  }

  /* ------------------------------------------------------------ town order */

  // The order is the game's own setting (Options: sort towns by = Custom), kept on the account,
  // so a PC shows it too. Edit in the town list only fills in that form when the player taps
  // Save: it opens the game's Options, puts the rows in the new order and presses the game's
  // own save button and drop-downs. After the reload it says whether the game kept the order.
  var ORDER_CHECK = 'ikm.townOrder';
  var savingOrder = false;

  function ownTowns() {
    return townItems().filter(function (li) { return li.classList.contains('ownCity'); });
  }
  function townId(li) { return li.getAttribute('selectvalue'); }

  function notice(text, ms) {
    var c = document.getElementById('container');
    if (!c) return;
    var n = document.getElementById('ikm-note') || uiBox('ikm-note', c);
    n.hidden = false;
    setText(n, text);
    clearTimeout(n.__ikmTimer);
    if (ms) n.__ikmTimer = setTimeout(function () { n.hidden = true; }, ms);
  }

  function editTowns() {
    var towns = ownTowns();
    if (towns.length < 2) return;
    var start = towns.map(townId).join(',');
    var list = openSheet('towns editing');
    list.parentNode.classList.add('locked');         // a stray tap outside must not lose the changes
    if (towns.length > 10) list.classList.add('long');
    var rows = list.appendChild(mk('div', 'rows'));
    towns.forEach(function (li) {
      var row = rows.appendChild(mk('div', 'row'));
      row.setAttribute('data-town', townId(li));
      var grip = row.appendChild(mk('span', 'grip', '\u2261'));
      var label = row.appendChild(mk('span', 'label'));
      townLabel(label, li);
      [['up', '\u25b2', -1], ['down', '\u25bc', 1]].forEach(function (d) {
        var b = row.appendChild(mk('button', d[0], d[1]));
        b.type = 'button';
        b.addEventListener('click', function (e) {
          e.stopPropagation();
          var other = d[2] < 0 ? row.previousElementSibling : row.nextElementSibling;
          if (other) rows.insertBefore(other, d[2] < 0 ? row.nextSibling : row);
        });
      });
      dragRow(rows, row, grip);
      if (towns.length <= 10) dragRow(rows, row, label);     // few towns: drag by the name as well
    });
    var bar = list.appendChild(mk('div', 'actions'));
    sheetButton(bar, 'cancel', tr('cancel'), function () {});
    // Default = the game's own "sort by age": the oldest town first (town numbers count up).
    var byAge = towns.map(townId).sort(function (a, b) { return a - b; }), restored = false;
    var reset = bar.appendChild(mk('button', 'default', '\u21ba ' + tr('defaultOrder')));
    reset.type = 'button';
    reset.addEventListener('click', function (e) {
      e.stopPropagation();
      restored = true;
      byAge.forEach(function (id) { rows.appendChild(rows.querySelector('[data-town="' + id + '"]')); });
    });
    sheetButton(bar, 'save', tr('saveOrder'), function () {
      var ids = Array.prototype.map.call(rows.children, function (r) { return r.getAttribute('data-town'); });
      var asDefault = restored && ids.join(',') === byAge.join(',');       // moved afterwards = custom again
      if (asDefault || ids.join(',') !== start) saveTownOrder(ids, asDefault);
    });
  }

  // Only the other rows are moved: moving the one under the finger would end the touch.
  function dragRow(rows, row, handle) {
    var id = null;
    handle.addEventListener('pointerdown', function (e) {
      id = e.pointerId;
      try { handle.setPointerCapture(id); } catch (err) { /* not a live pointer */ }
      row.classList.add('moving');
    });
    handle.addEventListener('pointermove', function (e) {
      if (id !== e.pointerId) return;
      var p, n;
      while ((p = row.previousElementSibling) && e.clientY < middle(p)) rows.insertBefore(p, row.nextSibling);
      while ((n = row.nextElementSibling) && e.clientY > middle(n)) rows.insertBefore(n, row);
    });
    function done(e) {
      if (id !== e.pointerId) return;
      id = null;
      row.classList.remove('moving');
    }
    handle.addEventListener('pointerup', done);
    handle.addEventListener('pointercancel', done);
  }
  function middle(el) {
    var r = el.getBoundingClientRect();
    return (r.top + r.bottom) / 2;
  }

  // Calls back once test() holds (true) or after `limit` ms (false).
  function waitFor(test, limit, then) {
    var began = performance.now();
    var t = setInterval(function () {
      var ok = false;
      try { ok = !!test(); } catch (e) { /* not there yet */ }
      if (!ok && performance.now() - began < limit) return;
      clearInterval(t);
      then(ok);
    }, 150);
  }
  function gameIdle(then) {
    var began = performance.now();
    waitFor(function () {
      return performance.now() - began > 900 && !(window.jQuery && jQuery.active);
    }, 12000, then);
  }

  function saveTownOrder(ids, asDefault) {
    if (savingOrder) return;
    savingOrder = true;
    function fail() {
      savingOrder = false;
      notice(tr('orderFailed'), 7000);
    }
    var link = document.querySelector('#GF_toolbar .options a');
    if (!link) { fail(); return; }
    notice(tr('saving'));
    press(link);
    waitFor(function () { return document.querySelector('#sortable') && document.querySelector('#saveCityCustomOrder'); }, 10000, function (found) {
      if (!found) { fail(); return; }
      gameIdle(function (idle) {
        var body = document.querySelector('#sortable'), save = document.querySelector('#saveCityCustomOrder');
        if (!idle || !body || !save) { fail(); return; }
        // exactly the same towns, or nothing is saved
        var have = Array.prototype.map.call(body.children, function (r) { return r.id; });
        if (have.slice().sort().join(',') !== ids.slice().sort().join(',')) { fail(); return; }
        var before = ownTowns().map(townId).join(',');
        if (!asDefault) {
          var byId = {};
          Array.prototype.forEach.call(body.children, function (r) { byId[r.id] = r; });
          ids.forEach(function (id) { body.appendChild(byId[id]); });
          save.click();
        }
        chooseOption('citySortOrderDropdown', asDefault ? 'age' : 'custom', function (ok1) {
          if (!ok1) { fail(); return; }
          chooseOption('citySortOrderDirectionDropdown', 'asc', function (ok2) {
            if (!ok2) { fail(); return; }
            var check = (asDefault ? 'default|' + before + '|' : '') + ids.join(',');
            try { sessionStorage.setItem(ORDER_CHECK, check); } catch (e) { /* blocked */ }
            var view = document.body.id;
            location.href = '/index.php?view=' + (/^(island|worldmap_iso)$/.test(view) ? view : 'city');
          });
        });
      });
    });
  }
  // One of the game's drop-down options; only touched when it is not set that way already.
  function chooseOption(id, value, then) {
    gameIdle(function (idle) {
      var s = document.getElementById(id);
      if (!idle || !s) { then(false); return; }
      if (s.value === value) { then(true); return; }
      s.value = value;
      if (s.value !== value) { then(false); return; }
      s.dispatchEvent(new Event('change', { bubbles: true }));
      gameIdle(then);
    });
  }
  function checkSavedOrder() {
    var want = null;
    try { want = sessionStorage.getItem(ORDER_CHECK); } catch (e) { return; }
    if (!want || savingOrder) return;
    var now = ownTowns().map(townId).join(',');
    if (!now) return;
    try { sessionStorage.removeItem(ORDER_CHECK); } catch (e) { /* blocked */ }
    var p = want.split('|');
    // Default: the game decides what "oldest first" is, so any change away from the old order is right
    var kept = p.length === 3 ? now === p[2] || now !== p[1] : now === want;
    if (kept) notice(tr('orderSaved'), 3000);
    else notice(tr('orderFailed'), 7000);
  }

  // "Exactly the same everywhere": some game windows build their own town lists (port, transport,
  // trade route pickers, overview tables). Their rows are shown in the town menu's order. Only
  // whole rows move: each keeps its own link / value, and the hidden <select>s stay untouched.
  // Any list of the player's towns in a window: a run of neighbouring rows, one per town, that has
  // them all (or all but the current one). Only whole rows stacked on top of each other move; never
  // table cells, columns, tabs, lists with a town twice (news) or the game's own order editor.
  function sortAnyTownLists(order, byName, sortRows) {
    var need = Math.max(3, order.length - 1);
    function nameIn(e) {
      var t = '';
      for (var c = e.firstChild; c; c = c.nextSibling) if (c.nodeType === 3) t += c.textContent;
      t = t.replace(/\s+/g, ' ').trim().replace(/^\[\d+:\d+\]\s*/, '').replace(/\s*\[\d+:\d+\]$/, '');
      if (t && Object.prototype.hasOwnProperty.call(byName, t)) return byName[t];
      var title = e.getAttribute('title');
      if (title && Object.prototype.hasOwnProperty.call(byName, title.trim())) return byName[title.trim()];
      return null;
    }
    Array.prototype.forEach.call(document.querySelectorAll('.templateView .mainContent, #sidebar, #multiPopup, #popupMessage'), function (root) {
      if (root.querySelector('#sortable')) return;             // the game's own order editor
      var key = new Map(), parents = new Set();
      Array.prototype.forEach.call(root.querySelectorAll('*'), function (e) {
        if (/^(SCRIPT|STYLE|OPTION|SELECT)$/.test(e.tagName)) return;
        var id = nameIn(e);
        if (!id) return;
        var cell = e.closest('td, th');
        if (cell && cell.cellIndex > 2) return;                // a town only mentioned in the row
        for (var n = e; n && n !== root; n = n.parentElement) {
          key.set(n, key.has(n) && key.get(n) !== id ? '*' : id);
          parents.add(n.parentElement);
        }
      });
      parents.forEach(function (p) {
        var run = [];
        function flush() {
          var rows = run;
          run = [];
          if (rows.length < need) return;
          var table = rows[0].el.tagName === 'TR';
          if (rows.some(function (r) { return (r.el.tagName === 'TR') !== table; })) return;
          if (table) {
            if (rows.some(function (r) { return r.el.querySelector(':scope > [rowspan]:not([rowspan="1"])'); })) return;
          } else {                                             // only a list going down, not across
            var last = -Infinity;
            for (var i = 0; i < rows.length; i++) {
              var top = rows[i].el.getBoundingClientRect().top;
              if (top <= last + 2) return;
              last = top;
            }
          }
          sortRows(rows);
        }
        Array.prototype.forEach.call(p.children, function (el) {
          var id = key.get(el);
          if (id && id !== '*' && /^(TR|LI|DIV|TABLE)$/.test(el.tagName) && !el.classList.contains('tab')) run.push({ el: el, id: id });
          else flush();
        });
        flush();
      });
    });
  }
  function syncTownLists() {
    var order = ownTowns().map(townId);
    if (order.length < 2) return;
    var rank = {};
    order.forEach(function (id, i) { rank[id] = i; });

    function sortRows(rows) {
      if (rows.length < 2) return;
      var seen = {};
      for (var i = 0; i < rows.length; i++) {
        var id = rows[i].id;
        if (!(id in rank) || seen[id]) return;                  // not a plain list of own towns
        seen[id] = true;
        if (i && rows[i - 1].el.nextElementSibling !== rows[i].el) return;     // rows in between
      }
      var sorted = rows.slice().sort(function (a, b) { return rank[a.id] - rank[b.id]; });
      if (sorted.every(function (r, k) { return r === rows[k]; })) return;
      var parent = rows[0].el.parentNode, after = rows[rows.length - 1].el.nextSibling;
      var striped = rows.map(function (r) { return r.el.classList.contains('alt'); });
      sorted.forEach(function (r, k) {
        parent.insertBefore(r.el, after);
        r.el.classList.toggle('alt', striped[k]);
      });
      if (rows[0].el.tagName === 'LI' && rows[0].el.hasAttribute('selectvalue')) {   // rounded first / last entry
        var kids = parent.children;
        Array.prototype.forEach.call(kids, function (li, k) {
          li.classList.toggle('first-child', k === 0);
          li.classList.toggle('last-child', k === kids.length - 1);
        });
      }
    }
    function listOf(selector, idOf) {
      return Array.prototype.map.call(document.querySelectorAll(selector), function (el) { return { el: el, id: idOf(el) }; });
    }

    function ownOnly(row) { return row.id in rank; }          // occupied towns stay after the player's own
    sortRows(listOf('#port .cities > li.cityBox', function (el) { return el.id.replace('js_cityBox', ''); }).filter(ownOnly));
    sortRows(listOf('#js_transportPanel .transportPanel_city', function (el) { return el.getAttribute('data-city-id'); }).filter(ownOnly));
    Array.prototype.forEach.call(document.querySelectorAll('.dropdownContainer'), function (dd) {
      if (dd.id === 'dropDown_js_citySelectContainer') return;       // the menu itself: that is the order
      var rows = [];
      Array.prototype.forEach.call(dd.querySelectorAll('li[selectvalue]'), function (li) {
        if (townId(li) in rank) rows.push({ el: li, id: townId(li) });
      });
      sortRows(rows);
    });

    // the windows: a row belongs to the town it names
    var byName = {};
    ownTowns().forEach(function (li) {
      var a = li.querySelector('a'), name = (a ? (a.title || a.textContent) : li.textContent).trim();
      name = name.replace(/^\[\d+:\d+\]\s*/, '');         // Options can put the coordinates in front
      byName[name] = name in byName ? null : townId(li);              // two towns with one name: leave alone
    });
    sortAnyTownLists(order, byName, sortRows);
  }
  // A window that just arrived is sorted right away, not at the next round.
  var syncSoon = 0;
  function watchLists() {
    var c = document.getElementById('container');
    if (!c || c.__ikmLists || !window.MutationObserver) return;
    c.__ikmLists = true;
    new MutationObserver(function () {
      if (syncSoon) return;
      syncSoon = setTimeout(function () { syncSoon = 0; syncTownLists(); }, 80);
    }).observe(c, { childList: true, subtree: true });
  }

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
  // Some boxes have a fixed height made for the small text (Town Hall): where the bigger text spills
  // out of one, that box goes back to the game's own size.
  function fitText(root) {
    var all = root.querySelectorAll('*');
    for (var i = all.length - 1; i >= 0; i--) {          // inner boxes first
      var e = all[i];
      if (!e.clientHeight) continue;
      var over = e.scrollHeight - e.clientHeight;
      if (over <= 3 || e.__ikmTried === over) continue;
      if (e.matches('.mainContent, .mainContentScroll, .scroll_area, input, textarea, select')) continue;
      if (getComputedStyle(e).overflowY !== 'visible') continue;
      var marks = Array.prototype.slice.call(e.querySelectorAll('[data-ikm-fs]:not([data-ikm-small])'));
      if (e.hasAttribute('data-ikm-fs') && !e.hasAttribute('data-ikm-small')) marks.push(e);
      if (!marks.length) { e.__ikmTried = over; continue; }
      marks.forEach(function (m) { m.style.setProperty('font-size', m.getAttribute('data-ikm-fs') + 'px', 'important'); });
      var left = e.scrollHeight - e.clientHeight;
      if (left <= Math.max(3, over * 0.35)) {
        marks.forEach(function (m) { m.setAttribute('data-ikm-small', '1'); });
        e.__ikmTried = left;
      } else {                                           // the text was not the reason
        marks.forEach(function (m) {
          m.style.setProperty('font-size', Math.round(parseFloat(m.getAttribute('data-ikm-fs')) * TEXT_SCALE) + 'px', 'important');
        });
        e.__ikmTried = e.scrollHeight - e.clientHeight;
      }
    }
  }
  // The bigger text can spill onto its neighbour in ways no single box shows (Black Market: the tax
  // text ran into the table below). So the visible text itself is measured: where two pieces lie on
  // each other, the smallest block around them goes back to the game's own size, just enough to part them.
  function textRects(el, clips) {
    var clip = clips.get(el);
    if (clip === undefined) {
      clip = null;
      var cs = getComputedStyle(el);
      if (cs.visibility === 'hidden' || parseFloat(cs.opacity) === 0 || parseFloat(cs.fontSize) < 5) clip = false;
      for (var a = el; clip !== false && a && !a.matches('.mainContent, .mainContentScroll, #sidebar'); a = a.parentElement) {
        var s = getComputedStyle(a);
        if (s.display === 'inline' || (s.overflowX === 'visible' && s.overflowY === 'visible')) continue;
        var r = a.getBoundingClientRect();
        clip = clip ? { left: Math.max(clip.left, r.left), top: Math.max(clip.top, r.top),
                        right: Math.min(clip.right, r.right), bottom: Math.min(clip.bottom, r.bottom) }
                    : { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
      }
      clips.set(el, clip);
    }
    var out = [];
    if (clip === false) return out;
    for (var n = el.firstChild; n; n = n.nextSibling) {
      if (n.nodeType !== 3 || !n.textContent.trim()) continue;
      var range = document.createRange();
      range.selectNodeContents(n);
      Array.prototype.forEach.call(range.getClientRects(), function (q) {
        var l = q.left, t = q.top, ri = q.right, b = q.bottom;
        if (clip) {
          l = Math.max(l, clip.left); t = Math.max(t, clip.top);
          ri = Math.min(ri, clip.right); b = Math.min(b, clip.bottom);
        }
        if (ri - l > 3 && b - t > 3 && l > -2000) out.push({ el: el, l: l, t: t, r: ri, b: b });
      });
    }
    return out;
  }
  function rectsClash(a, b) {
    return Math.min(a.r, b.r) - Math.max(a.l, b.l) > 3 &&
      Math.min(a.b, b.b) - Math.max(a.t, b.t) > Math.min(a.b - a.t, b.b - b.t) * 0.32;
  }
  function textClash(a, b) {
    var clips = new Map(), A = textRects(a, clips), B = textRects(b, clips);
    return A.some(function (p) { return B.some(function (q) { return rectsClash(p, q); }); });
  }
  function fontTo(el, scale) {
    el.style.setProperty('font-size', Math.round(parseFloat(el.getAttribute('data-ikm-fs')) * scale) + 'px', 'important');
  }
  // Android draws some scripts (Arabic) taller than a PC does: a box can be too short even at the
  // game's own size. Then just that block gets tighter lines and, step by step, a little smaller text.
  function squeezeApart(root, a, b) {
    var upper = a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? a : b;
    var order = upper === a ? [a, b] : [b, a];
    for (var k = 0; k < 2; k++) {
      var other = order[1 - k], block = order[k];
      if (block.contains(other)) continue;
      for (var i = 0; i < 5; i++) {          // the whole block that holds this text but not the other
        var up = block.parentElement;
        if (!up || up === root || up.contains(other)) break;
        block = up;
      }
      var els = [block].concat(Array.prototype.slice.call(block.querySelectorAll('[data-ikm-fs]')));
      var was = els.map(function (e) {
        return [e.style.getPropertyValue('font-size'), e.style.getPropertyPriority('font-size'),
                e.style.getPropertyValue('line-height'), e.style.getPropertyPriority('line-height'),
                e.hasAttribute('data-ikm-small')];
      });
      var steps = [1, 0.92, 0.85, 0.76];
      for (var s = 0; s < steps.length; s++) {
        els.forEach(function (e) {
          e.style.setProperty('line-height', '1.15', 'important');
          e.setAttribute('data-ikm-tight', '1');
          if (!e.hasAttribute('data-ikm-fs')) return;
          var size = parseFloat(e.getAttribute('data-ikm-fs'));
          e.style.setProperty('font-size', Math.max(Math.min(size, 9), size * steps[s]).toFixed(1) + 'px', 'important');
          e.setAttribute('data-ikm-small', '1');
        });
        if (!textClash(a, b)) return true;
      }
      els.forEach(function (e, n) {
        e.style.setProperty('font-size', was[n][0], was[n][1]);
        e.style.setProperty('line-height', was[n][2], was[n][3]);
        e.removeAttribute('data-ikm-tight');
        if (!was[n][4]) e.removeAttribute('data-ikm-small');
      });
    }
    return false;
  }
  function partTexts(root, a, b) {
    var scopes = [], changed = [];
    [a, b].forEach(function (el) {
      for (var n = el, i = 0; n && n !== root && i < 5; n = n.parentElement, i++) scopes.push(n);
    });
    for (var s = 0; s < scopes.length; s++) {
      var scope = scopes[s];
      var marks = Array.prototype.slice.call(scope.querySelectorAll('[data-ikm-fs]:not([data-ikm-small])'));
      if (scope.hasAttribute('data-ikm-fs') && !scope.hasAttribute('data-ikm-small')) marks.unshift(scope);
      if (!marks.length) continue;
      marks.forEach(function (m) {
        fontTo(m, 1);
        m.setAttribute('data-ikm-small', '1');
        changed.push(m);
      });
      if (!textClash(a, b)) return;
    }
    if (squeezeApart(root, a, b)) return;
    changed.forEach(function (m) {           // the game means them to lie on each other: leave it big
      m.removeAttribute('data-ikm-small');
      fontTo(m, TEXT_SCALE);
    });
  }
  function fixOverlaps(root) {
    if (!root.clientHeight) return;
    function signature() {
      return [root.scrollHeight, root.offsetHeight, root.offsetWidth, root.textContent.length,
              root.querySelectorAll('[data-ikm-fs]').length].join(',');
    }
    var sig = signature(), now = performance.now();
    if (root.__ikmTextSig === sig && now - root.__ikmTextAt < 4000) return;
    var clips = new Map(), boxes = [], pairs = [];
    Array.prototype.forEach.call(root.querySelectorAll('*'), function (e) {
      if (/^(SCRIPT|STYLE|OPTION|TEXTAREA)$/.test(e.tagName) || !hasOwnText(e)) return;
      Array.prototype.push.apply(boxes, textRects(e, clips));
    });
    boxes.sort(function (p, q) { return p.t - q.t; });
    for (var i = 0; i < boxes.length && pairs.length < 40; i++) {
      for (var j = i + 1; j < boxes.length && boxes[j].t < boxes[i].b; j++) {
        if (boxes[i].el !== boxes[j].el && rectsClash(boxes[i], boxes[j])) pairs.push([boxes[i].el, boxes[j].el]);
      }
    }
    pairs.forEach(function (p) {
      if (textClash(p[0], p[1])) partTexts(root, p[0], p[1]);
    });
    // parting two can move a third: after a change, look again at the next pass
    root.__ikmTextTries = pairs.length ? (root.__ikmTextTries || 0) + 1 : 0;
    root.__ikmTextSig = pairs.length && root.__ikmTextTries < 4 ? '' : signature();
    root.__ikmTextAt = now;
  }
  // Text in a slider row (transport: the ship names, "+ 92,000", the capacity and speed rows) was
  // made for the game's own size: bigger, it lies on the slider or pushes the row out of its frame.
  // There it stays as the game has it.
  function sliderText(root) {
    var bars = Array.prototype.map.call(root.querySelectorAll('.sliderinput'), function (s) { return s.getBoundingClientRect(); })
      .filter(function (r) { return r.width; });
    if (!bars.length) return;
    Array.prototype.forEach.call(root.querySelectorAll('[data-ikm-fs]:not([data-ikm-small])'), function (e) {
      var r = e.getBoundingClientRect();
      var onBar = r.width && bars.some(function (b) {
        return r.left < b.right && r.right > b.left && r.top < b.bottom && r.bottom > b.top;
      });
      if (!onBar && !e.closest('.sliderBox')) return;
      e.setAttribute('data-ikm-small', '1');
      fontTo(e, 1);
    });
  }
  function restoreText() {
    Array.prototype.forEach.call(document.querySelectorAll('[data-ikm-tight]'), function (e) {
      e.removeAttribute('data-ikm-tight');
      e.style.removeProperty('line-height');
    });
    Array.prototype.forEach.call(document.querySelectorAll('[data-ikm-fs]'), function (e) {
      e.removeAttribute('data-ikm-fs');
      e.removeAttribute('data-ikm-small');
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
    addStyle();
    applyViewport();
    relabel();
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

  // Portrait: keep the header, windows and side box lined up with whatever the game is
  // showing (sizes change with the toolbar text, the open window, a building queue...).
  var layoutVars = {};
  function setVar(name, value) {
    if (layoutVars[name] === value) return;
    layoutVars[name] = value;
    document.documentElement.style.setProperty(name, value);
  }
  // A finger is sliding over the menus or the town bar: the slow layout work waits, so it stays smooth.
  function fingerBusy() {
    return isThumb() && (quick.on || slide.id !== null);
  }
  function portraitLayout() {
    if (!document.documentElement.classList.contains('ikm-portrait') || fingerBusy()) return;
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
    thumbLayout();
    if (isThumb()) {
      winh = windowRoom() / scale - 31;                    // every window the same height (fitWindow)
      // the transport list scrolls inside when it would reach the strip and the breadcrumbs
      var tproom = (window.innerHeight - DOCK_TOP - TOWN_H - 10 - STRIP_H - 70) / TRANSPORT_Z - 30;
      setVar('--ikm-tph', Math.round(Math.max(150, Math.min(375, tproom))) + 'px');
    }
    setVar('--ikm-winh', Math.round(Math.max(300, winh)) + 'px');
    Array.prototype.forEach.call(document.querySelectorAll('.templateView .mainContent, #sidebar'), enlargeText);
    Array.prototype.forEach.call(document.querySelectorAll('.templateView .mainContent'), fitText);
    Array.prototype.forEach.call(document.querySelectorAll('.templateView .mainContent, #sidebar'), fixOverlaps);
    Array.prototype.forEach.call(document.querySelectorAll('.templateView .mainContent'), sliderText);
    oneItemOut();
    markHitBoxes();
    markNumbers();
    advisorPictures();
    bubbleForms();
    fitPopups();
    // The fight report can be a single line ("your ships were lost"): that window is only as
    // tall as its text (taller again while its content is zoomed).
    var listH = Math.round(Math.max(300, winh));
    Array.prototype.forEach.call(document.querySelectorAll('#militaryAdvisorReportView_c'), function (tv) {
      var mc = tv.querySelector('.mainContentScroll > .mainContent');
      if (!mc || isThumb()) return;            // thumb: fitWindow sets it
      var z = mc.__ikmView ? mc.__ikmView.z : 1;
      var h = Math.min(listH, Math.max(160, Math.ceil(mc.scrollHeight * z) + 8)) + 'px';
      if (tv.style.getPropertyValue('--ikm-winh') !== h) tv.style.setProperty('--ikm-winh', h);
    });
    // Some windows (e.g. the detailed battle report) are wider than the usual 728 px: scale
    // each window by its own widest content so nothing is cut off at the screen edge. One that
    // nearly fits between the side buttons shrinks a little (10% at most) to fit there, and one
    // taller than the space between the bars is scaled down too.
    var between = panelArea(0, true);
    Array.prototype.forEach.call(document.querySelectorAll('.templateView'), function (tv) {
      var box = tv.querySelector('.mainContentBox');
      if (!box) return;
      var w = box.offsetWidth;
      Array.prototype.forEach.call(box.querySelectorAll('.mainContent *'), function (e) {
        if (e.offsetWidth > w && !clippedInside(e, box)) w = e.offsetWidth;    // content wider than its window
      });
      var bw = box.offsetWidth, laneW = between.right - between.left;
      var k = Math.min(1, (window.innerWidth - (isThumb() ? 20 : 8)) / (w + 12));
      // thumb: a big window is exactly as wide as the border, the line the side box stops at
      var wide = isThumb() && bw >= BIG_WINDOW;
      var fixed = isThumb() && !wide && bw && !box.querySelector('.mainContentScroll');
      if (wide) k = (window.innerWidth - 2 * PANEL_GAP) / (w > bw + 12 ? w : bw);
      // a small window whose content never grows (e.g. "resources missing"): bigger, up to the width
      else if (fixed) k = Math.min(SMALL_UP, (window.innerWidth - 2 * PANEL_GAP) / (w > bw + 12 ? w : bw));
      else if (bw && bw * k <= laneW / 0.9) k = Math.min(k, laneW / bw);
      var room = panelArea(Math.floor(bw * k), true);
      // (thumb sets the height of windows with a list itself: scaling those would shrink them twice)
      if (box.offsetHeight && !(isThumb() && box.querySelector('.mainContentScroll'))) {
        k = Math.min(k, (room.bottom - room.top) / box.offsetHeight);
      }
      var s = (Math.floor(k * 100000) / 100000).toFixed(5);      // rounded down, so it still fits
      tv.__ikmScale = parseFloat(s);              // full size; movePanel narrows it when dragged down
      if (g && g.mode === 'windrag' && g.win === tv) return;
      if (tv.style.getPropertyValue('--ikm-ws') !== s) tv.style.setProperty('--ikm-ws', s);
    });
    var sb = document.getElementById('sidebar');
    if (sb && sb.offsetHeight) {
      var lane = panelArea(sb.offsetWidth, false);
      var most = rearranging() ? Math.min(REARRANGE_Z, (window.innerWidth - 2 * PANEL_GAP) / sb.offsetWidth) : 1;
      var ss = Math.min(most, (lane.bottom - lane.top) / sb.offsetHeight).toFixed(3);
      if (sb.style.getPropertyValue('--ikm-ss') !== ss) sb.style.setProperty('--ikm-ss', ss);
    }
    // Windows first: the side box's default place is under the open window.
    Array.prototype.forEach.call(document.querySelectorAll('.templateView'), layoutPanel);
    if (sb && sb.children.length) layoutPanel(sb);
    updateReading();
  }

  // A game "bubble" with a form in it (achievements: compare with another player) is placed by the
  // game next to the mouse, which here is the screen's corner, half off it and see-through: in the
  // thumb layout it opens in the middle of the map, solid and twice as big. Back closes it.
  var BUBBLE_Z = 2.2;
  function bubbleForms() {
    Array.prototype.forEach.call(document.querySelectorAll('.bubble_tip'), function (b) {
      var form = isThumb() && b.offsetWidth && b.querySelector('input:not([type=hidden]), button, form');
      b.classList.toggle('ikm-bubbleform', !!form);
      if (!form) return;
      var k = Math.min(BUBBLE_Z, (window.innerWidth - 2 * PANEL_GAP) / b.offsetWidth);
      b.style.setProperty('--ikm-bz', k.toFixed(3));
    });
  }
  function closeBubbleForm() {
    var b = Array.prototype.filter.call(document.querySelectorAll('.bubble_tip.ikm-bubbleform'), function (e) { return e.offsetWidth; })[0];
    if (!b) return false;
    b.style.display = 'none';
    b.classList.remove('ikm-bubbleform');
    return true;
  }

  // The game sets each advisor's state from the class the server sends; some have no picture in the
  // game's style (an alert on the mayor, say). On a PC the advisors' shared background shows through;
  // here that background is hidden (it only gives the roof), so the tile went see-through and the map
  // showed in its place. Such a tile gets its own picture: the news one for an alert.
  var ADVISOR_PICS = { cities: 'mayor', military: 'general', research: 'scientist', diplomacy: 'diplomat' };
  function advisorPictures() {
    var tiles = {}, base = '';
    Object.keys(ADVISOR_PICS).forEach(function (k) {
      var a = document.getElementById('js_GlobalMenu_' + k);
      if (!a) return;
      tiles[k] = a;
      var img = getComputedStyle(a).backgroundImage;
      if (!a.style.backgroundImage && /advisors\/\w+\.png/.test(img)) base = img;
    });
    if (!base) return;
    Object.keys(tiles).forEach(function (k) {
      var a = tiles[k], c = a.className || '';
      var glow = /active|alert/.test(c) || !!(unseen[k] && unseen[k].length);    // news the app read for you
      var want = ADVISOR_PICS[k] + (/premium/.test(c) ? '_premium' : '') + (glow ? '_active' : '') + '.png';
      var mark = c + '|' + want;
      if (a.__ikmPic === mark) return;
      a.style.removeProperty('background-image');
      var own = getComputedStyle(a).backgroundImage;
      if (own && own !== 'none' && (!glow || /active|alert/.test(c))) { a.__ikmPic = mark; return; }
      a.style.setProperty('background-image', base.replace(/advisors\/\w+\.png/, 'advisors/' + want), 'important');
      a.__ikmPic = mark;
    });
  }

  // Is `e` inside something (below `box`) that cuts off what sticks out? Then its width does not
  // widen the window: e.g. the Pirate Fortress' ranking strip, 1200 px sliding in a 480 px frame.
  function clippedInside(e, box) {
    for (var p = e.parentElement; p && p !== box; p = p.parentElement) {
      if (getComputedStyle(p).overflowX !== 'visible') return true;
    }
    return false;
  }

  /* ------------------------------------------------------------ panel positions */

  // always with a gap. For a narrow panel that area is T-shaped: the full width above each column
  // from a place that moves when the panel grows or shrinks. On every layout pass it is put at
  // that place and then pushed inside the free area: under the main panel, above the bottom bars,
  // always with a gap. For a narrow panel that area is T-shaped: the full width above each column
  // of side buttons, the space between the two columns further down.
  // For a panel the player placed, only its top bar has to be in that area: the rest may hang down
  // behind the bars and menus, out of the way. A panel never placed opens wholly inside it.
  // Pushing does not change what is remembered: the top bar returns to its place when it can.
  var POS_KEY = 'ikm.panelPos2';      // classic layout
  var THUMB_POS_KEY = 'ikm.panelPos2.thumb';
  var OLD_POS_KEY = 'ikm.panelPos';   // offsets saved by 1.0: they cannot be converted, so not read
  var PANEL_GAP = 8;
  var REARRANGE_Z = 1.5;              // the rearrange box
  var TAB_OUT = 17;                   // side buttons' tabs stick out this far from their column
  var WINDOW_ICON = 12;               // a window's round icon sticks out above its header
  var PARK_ZONE = 120;                // classic: a wide window dragged down narrows over this many px
  var BIG_WINDOW = 600;               // thumb: windows this wide (the game's are 728) fill the width
  var WINDOW_UNDER = 264;             // thumb: room under a window with a side box (its upgrade part)
  var SMALL_UP = 1.6;
  var POPUP_UP = 1.8;                 // thumb: a small game pop-up may grow up to this                 // thumb: a small fixed window may grow up to this
  var panelPos = {}, panelPosKey = '';
  function loadPanelPos() {
    var key = isThumb() ? THUMB_POS_KEY : POS_KEY;
    if (key === panelPosKey) return;
    panelPosKey = key;
    try { panelPos = JSON.parse(localStorage.getItem(key) || '{}') || {}; } catch (e) { panelPos = {}; }
  }

  function rectOf(id) {
    var el = document.getElementById(id);
    var r = el && el.getBoundingClientRect();
    return r && r.width && r.height ? r : null;
  }
  // Where a panel `w` px wide may be.
  function panelArea(w, isWindow) {
    var W = window.innerWidth, nav = rectOf('topnavi');
    // the top edge of the bars at the bottom: the town bar, else the dock, else the advisors
    var low = (isThumb() && (rectOf('ikm-town') || rectOf('ikm-dock'))) || rectOf('advisors');
    var a = {
      left: 2, right: W - 2,
      top: (nav ? nav.bottom : 240) + PANEL_GAP,
      bottom: (low ? low.top : window.innerHeight) - PANEL_GAP
    };
    if (isThumb()) { a.left = PANEL_GAP; a.right = W - PANEL_GAP; }
    var l = a.left, r = a.right;
    blockingMenus().forEach(function (m) {
      if (m.left + m.right < W) l = Math.max(l, m.right + TAB_OUT + PANEL_GAP);
      else r = Math.min(r, m.left - TAB_OUT - PANEL_GAP);
    });
    if (isThumb() && isWindow) {      // never over the clock and the breadcrumbs
      var under = rectOf('breadcrumbs') || rectOf('ikm-clock');
      if (under) a.top = Math.max(a.top, under.bottom + PANEL_GAP);
    }
    if (isThumb() && w > r - l && w <= W - 2 * PANEL_GAP) { a.left = PANEL_GAP; a.right = W - PANEL_GAP; }
    if (w <= r - l) {                 // fits between the side buttons
      a.lane = true;
      a.left = l; a.right = r;
      var crumbs = rectOf('breadcrumbs');
      if (crumbs) a.top = Math.max(a.top, crumbs.bottom + PANEL_GAP);
    }
    if (isWindow) a.top += WINDOW_ICON;
    return a;
  }
  // The element whose top edge is the panel's header.
  function panelBox(el) {
    return el.id === 'sidebar' ? el : el.querySelector('.mainContentBox');
  }
  function openWindowBox() {
    return Array.prototype.filter.call(document.querySelectorAll('.templateView .mainContentBox'), visible)[0] || null;
  }
  // Each game window is remembered by its own name; the side panel separately for "with a
  // window" and for the island town panel.
  function panelKey(el) {
    if (el.id === 'sidebar') return 'sidebar:' + (openWindowBox() ? 'window' : (document.body && document.body.id));
    return el.id ? 'win:' + el.id : null;
  }
  // The scale a window is drawn at right now (fitted to the screen width).
  function winScale(tv) {
    return parseFloat(tv.style.getPropertyValue('--ikm-ws')) ||
           parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--ikm-winscale')) || 0.88;
  }
  // Move a panel so its header's left / top is at x / y, or as near as the free area allows.
  // whole: all of the panel has to fit (default places); otherwise only its top bar.
  function movePanel(el, x, y, whole) {
    var box = panelBox(el);
    if (!box) return;
    var isWindow = el.id !== 'sidebar';
    if (isWindow) {
      if (isThumb()) fitWindowThumb(el, box, y); else fitWindow(el, box, y, whole);
    }
    var r = box.getBoundingClientRect();
    if (!r.width || !r.height) return;
    var a = panelArea(r.width, isWindow);
    var keep = whole ? r.height : Math.min(r.height, headerHeight(el));      // how much must be in bounds
    var spot = isThumb() ? thumbSpot(isWindow, r.width, r.height, keep, x, y) : nearestSpot(a, r.width, keep, x, y);
    if (isThumb() && isWindow && box.offsetWidth >= BIG_WINDOW) {     // a big window only moves up and down
      var lane = sideRoom(spot.y, spot.y + r.height);
      spot.x = Math.max(lane.left, (lane.left + lane.right - r.width) / 2);
    }
    var tx = spot.x, ty = spot.y;
    if (Math.abs(tx - r.left) < 0.5 && Math.abs(ty - r.top) < 0.5) return;
    var now = (el.style.translate || '').split(' ');
    el.style.translate = ((parseFloat(now[0]) || 0) + tx - r.left).toFixed(1) + 'px ' +
                         ((parseFloat(now[1]) || 0) + ty - r.top).toFixed(1) + 'px';
  }
  function headerHeight(el) {
    var h = el.querySelector(el.id === 'sidebar' ? '.accordionTitle' : '.mainHeader');
    var r = h && h.getBoundingClientRect();
    return r && r.height ? r.height : 30;
  }
  // A wide window's top bar cannot fit between the side buttons, so a window dragged down narrows
  // smoothly on the way and, once its top bar is beside the buttons, fits between them.
  function fitWindow(el, box, y, whole) {
    var full = el.__ikmScale, bw = box.offsetWidth;
    if (!full || !bw) return;
    var k = full;
    if (!whole) {
      var mid = panelArea(0, true), laneW = mid.right - mid.left, top = Infinity;
      ['js_viewCityMenu', 'js_viewFriends'].forEach(function (id) {
        var m = rectOf(id);
        if (m) top = Math.min(top, m.top - PANEL_GAP);
      });
      if (bw * full > laneW && top < Infinity) {
        var low = Math.max(panelArea(Infinity, true).top, Math.min(mid.bottom, y)) + 25 * full;      // the top bar's lower edge
        var t = Math.max(0, Math.min(1, (low - (top - PARK_ZONE)) / PARK_ZONE));
        k = full + (laneW / bw - full) * t;
      }
    }
    var s = (Math.floor(k * 1000) / 1000).toFixed(3);
    if (el.style.getPropertyValue('--ikm-ws') !== s) el.style.setProperty('--ikm-ws', s);
  }
  // Thumb: every window is this high on screen.
  function windowRoom() {
    var a = panelArea(0, true);
    // with no side box under it, a window has the whole map area (the same small gaps all round)
    return Math.max(300, a.bottom - a.top - (sideBoxShown() ? WINDOW_UNDER : PANEL_GAP));
  }
  function sideBoxShown() {
    var sb = document.getElementById('sidebar');
    if (!sb || !sb.children.length || !visible(sb)) return false;
    return sb.getBoundingClientRect().height > 20;
  }
  // Thumb: the room left to right for something from `top` to `bottom`: an open column of side
  // buttons pushes it aside, a retracted one is free space.
  function sideRoom(top, bottom) {
    var W = window.innerWidth, o = { left: PANEL_GAP, right: W - PANEL_GAP };
    blockingMenus().forEach(function (m) {
      if (bottom <= m.top - PANEL_GAP + 0.5) return;        // wholly above that column
      if (m.left + m.right < W) o.left = Math.max(o.left, m.right + TAB_OUT + PANEL_GAP);
      else o.right = Math.min(o.right, m.left - TAB_OUT - PANEL_GAP);
    });
    return o;
  }
  // Thumb: y keeps the top bar (keep px) between the strip and the town bar; x keeps the whole
  // panel off the open columns.
  function thumbSpot(isWindow, w, h, keep, x, y) {
    var a = panelArea(0, isWindow);
    var py = Math.max(a.top, Math.min(a.bottom - keep, y));
    var side = sideRoom(py, py + h);
    return { x: Math.max(side.left, Math.min(side.right - w, x)), y: py };
  }
  // Thumb: windows all get the same height on screen. An open column narrows them; the list then
  // grows longer inside, so they stay as high.
  function fitWindowThumb(el, box, y) {
    var full = el.__ikmScale, bw = box.offsetWidth;
    if (!full || !bw) return;
    var list = box.querySelector('.mainContentScroll');
    var room = windowRoom(), a = panelArea(0, true);
    var chrome = list ? Math.max(0, box.offsetHeight - list.offsetHeight) : 0;
    var content = null;
    if (list && el.id === 'militaryAdvisorReportView_c') {       // a one-line report is as high as its text
      var mc = list.querySelector('.mainContent');
      if (mc) content = Math.max(160, Math.ceil(mc.scrollHeight * (mc.__ikmView ? mc.__ikmView.z : 1)) + 8);
    }
    var high = !list ? box.offsetHeight * full : content === null ? room : Math.min(room, (content + chrome) * full);
    var top = Math.max(a.top, Math.min(a.bottom - 25, y));
    var side = sideRoom(top, top + high);
    var k = Math.min(full, (side.right - side.left) / bw);
    k = Math.floor(k * 100000) / 100000;
    var v = k.toFixed(5);
    if (el.style.getPropertyValue('--ikm-ws') !== v) el.style.setProperty('--ikm-ws', v);
    if (!list) return;
    var h = Math.round(Math.max(160, room / k - chrome));
    if (content !== null) h = Math.min(h, content);
    if (el.style.getPropertyValue('--ikm-winh') !== h + 'px') el.style.setProperty('--ikm-winh', h + 'px');
  }
  // Classic, a full-width window open: the side buttons go under the panels.
  function updateReading() {
    if (isThumb()) {                     // thumb: panels keep out of the open columns
      document.documentElement.classList.remove('ikm-reading');
      return;
    }
    var mid = panelArea(0, false), laneW = mid.right - mid.left;
    var on = Array.prototype.some.call(document.querySelectorAll('.templateView .mainContentBox'), function (b) {
      return visible(b) && b.getBoundingClientRect().width > laneW + 1;
    });
    document.documentElement.classList.toggle('ikm-reading', on);
  }
  // Nearest place to x / y for a w x h panel inside the free area (a: from panelArea).
  function nearestSpot(a, w, h, x, y) {
    var W = window.innerWidth, H = window.innerHeight;
    var areas = [a];
    if (a.lane) {                            // narrow panel: add the parts above the side buttons
      var sideL = a.left, sideR = a.right, aboveL = a.bottom, aboveR = a.bottom;
      ['js_viewCityMenu', 'js_viewFriends'].forEach(function (id) {
        var m = rectOf(id);
        if (!m) return;
        if (m.left + m.right < W) { sideL = PANEL_GAP; aboveL = Math.min(a.bottom, m.top - PANEL_GAP); }
        else { sideR = W - PANEL_GAP; aboveR = Math.min(a.bottom, m.top - PANEL_GAP); }
      });
      areas.push({ left: sideL, right: a.right, top: a.top, bottom: aboveL },
                 { left: a.left, right: sideR, top: a.top, bottom: aboveR },
                 { left: sideL, right: sideR, top: a.top, bottom: Math.min(aboveL, aboveR) });
    }
    var wx = Math.max(-W, Math.min(2 * W, x)), wy = Math.max(-H, Math.min(2 * H, y));
    var best = null;
    areas.forEach(function (b, i) {
      // The first area always takes it (too big: the left / top edge, the header, wins); the others only if it fits.
      if (i && (w > b.right - b.left + 0.5 || h > b.bottom - b.top + 0.5)) return;
      var px = Math.max(b.left, Math.min(b.right - w, wx)), py = Math.max(b.top, Math.min(b.bottom - h, wy));
      var d = (px - wx) * (px - wx) + (py - wy) * (py - wy);
      if (!best || d < best.d - 0.5) best = { x: px, y: py, d: d };
    });
    return best;
  }
  function layoutPanel(el) {
    if (g && g.mode === 'windrag' && g.win === el) return;     // under the finger right now
    var box = panelBox(el);
    if (!box || !visible(box)) return;
    var p = panelPos[panelKey(el)];
    if (p && isFinite(p.x) && isFinite(p.y)) { movePanel(el, p.x, p.y, false); return; }
    // Never dragged: windows at the top (centred in the thumb layout, right in classic), the side
    // box centred under the open window.
    var thumb = isThumb();
    if (el.id !== 'sidebar') {
      var full = el.__ikmScale || winScale(el), w = box.offsetWidth * full, x = Infinity;
      if (thumb) {                       // centred in the room the open columns leave
        var top = panelArea(0, true).top, room = sideRoom(top, top + windowRoom());
        x = (room.left + room.right - Math.min(w, room.right - room.left)) / 2;
      }
      movePanel(el, x, -Infinity, true);
      return;
    }
    var win = openWindowBox(), r = box.getBoundingClientRect(), y = win ? win.getBoundingClientRect().bottom + PANEL_GAP : -Infinity;
    var cx = window.innerWidth / 2;
    if (thumb) {
      var at = win ? y : panelArea(0, false).top, free = sideRoom(at, at + r.height);
      cx = (free.left + free.right) / 2;
    }
    // thumb, under a window: directly below it, the rest of a long box hanging down out of the way
    movePanel(el, cx - r.width / 2, y, !(thumb && win));
  }
  function savePanelPos(el) {
    var k = panelKey(el), box = panelBox(el);
    if (!k || !box) return;
    var r = box.getBoundingClientRect();
    if (!r.width) return;
    panelPos[k] = { x: Math.round(r.left), y: Math.round(r.top) };
    try { localStorage.setItem(panelPosKey, JSON.stringify(panelPos)); } catch (e) { /* storage full / blocked */ }
  }
  function clearPanelMoves() {
    Array.prototype.forEach.call(document.querySelectorAll('.templateView, #sidebar'), function (el) {
      el.style.translate = '';
    });
  }
  // App menu > Restore panel positions.
  api.resetPanels = function () {
    panelPos = {};
    try { [POS_KEY, THUMB_POS_KEY, OLD_POS_KEY].forEach(function (k) { localStorage.removeItem(k); }); } catch (e) { return false; }
    clearPanelMoves();
    portraitLayout();
    return true;
  };
  function isPortrait() {
    return document.documentElement.classList.contains('ikm-portrait');
  }

  addStyle();
  applyViewport();
  if (GAME_HOST) {
    setInterval(portraitLayout, 400);
    setInterval(clockTick, 1000);
    setInterval(function () { if (!fingerBusy()) { watchLists(); syncTownLists(); } }, 600);
    setInterval(function () { reportPage(); reportNews(); }, 1000);
    setInterval(camCheck, 400);
    // no mouse wheel on a phone: wheel events on the map would only turn the game's own zoom down
    ['wheel', 'mousewheel', 'DOMMouseScroll'].forEach(function (type) {
      window.addEventListener(type, function (e) {
        if (!isPortrait() || !onMap(e.target)) return;
        e.stopImmediatePropagation();
        if (e.cancelable) e.preventDefault();
      }, { capture: true, passive: false });
    });
    // A game pop-up is drawn by the game first (small, at its own place) and placed by the app after:
    // it jumped. Now it is placed as it appears, before the screen shows it, and kept unseen until then.
    (function watchPopups() {
      var holder = document.getElementById('popupMessage');
      if (!holder || !window.MutationObserver) return;
      new MutationObserver(function () {
        fitPopups();
        setTimeout(function () {
          Array.prototype.forEach.call(holder.querySelectorAll(':scope > .popupMessage:not([data-ikm-fit])'), function (pm) {
            pm.setAttribute('data-ikm-fit', '1');           // never left unseen
          });
        }, 500);
      }).observe(holder, { childList: true });
    })();
    // the advisors' glow for news the app read: there as the page shows, not after the first checks
    (function earlyGlow(n) {
      unseenNews(performance.now());
      advisorPictures();
      var done = document.getElementById('js_GlobalMenu_cities') && document.getElementById('js_GlobalMenu_cities').__ikmPic;
      if (!done && n < 60) setTimeout(function () { earlyGlow(n + 1); }, 100);
    })(0);
    setInterval(function () { addStyle(); applyViewport(); }, 2000);     // puts itself back if the page drops it
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
  // A number box: the cursor always goes to the end of the number (Backspace clears it, or type on).
  // Set again a moment later, after the game's own handlers (some select everything on focus).
  ['focusin', 'click', 'mouseup', 'touchend'].forEach(function (t) {
    document.addEventListener(t, function (e) {
      var el = e.target;
      if (el && el.hasAttribute && el.hasAttribute('data-ikm-number')) caretEnd(el);
    }, true);
  });
  if (GAME_HOST) {
    document.addEventListener('pointerdown', function (e) { if (isTextField(e.target)) markNumber(e.target); }, true);
    ['input', 'keyup', 'change', 'focusout'].forEach(function (t) { document.addEventListener(t, onTyped, true); });
  }
  if (GAME_HOST) document.addEventListener('click', onAnyClick, true);
  window.__ikm = api;              // only now: an install that failed is simply done again
})();
