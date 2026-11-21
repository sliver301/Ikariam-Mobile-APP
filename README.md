<p align="center"><img src="docs/icon.png" width="128" alt="Ikariam Mobile icon"></p>

# Ikariam Mobile

An Android app for playing the browser game **Ikariam** comfortably on a phone, especially in portrait.

It is a dedicated browser: it loads the real Ikariam website and only changes how the page is laid out and how touch
input reaches it. It never clicks, sends or loads anything on its own; every game action comes from the player's own
tap. It is an unofficial fan project and is not affiliated with Gameforge.

## Features

**Phone-first layout (portrait)**
- Main panel (city / island / world, resources) at the top, the four advisors as a big panel at the bottom.
- Game windows scaled to the screen width, opening under the main panel; the side box (upgrade button etc.) below.
- Window text about 25% bigger; bigger side icons and top link row; the game's footer and shop timer removed.
- Full screen, behind the status bar and camera cut-out.

**Touch controls**
- Tap = click. Hold = mouse hover (shows the game's info, e.g. income on gold). Hold and move = drag.
- City and island maps: one-finger pan kept inside the city / island, with extra room at the top to pull the top
  buildings down to your thumb. Pinch or double-tap zooms the map only, never the bars.
- Windows and side panels can be dragged by their title bar, and the app remembers where you left each one.
- Two fingers inside a window (e.g. a battle report) zoom its content up to 4x around the fingers, inside the
  window (the window and the rest of the app stay as they are). Zoomed content pans with one finger; a double-tap on
  empty space resets it. Windows always open unzoomed.
- Window lists scroll with a swipe (with a little fling).
- Side menus: first tap expands an item, second tap opens it, a tap elsewhere collapses it.
- Android Back closes the window / pop-up on top; with nothing open it shows the app menu
  (settings, reload, lobby, help, log out, exit).

**Other**
- Login is kept between sessions; the Gameforge lobby's "Play" pop-up is handled.
- Landscape mode is also supported (big native text editor for chat there).

## Project layout

```
app/src/main/java/com/islam/ikariamtouch/   Android side (WebView, back button, menu, settings)
app/src/main/assets/enhance.js               Page script: layout, touch handling, map camera
art/                                         Scripts to build an AI-extended city background
build.bat                                    Local build script
```

## Building

Requirements: JDK 17+ (Android Studio's bundled JBR works), Android SDK (compileSdk 37), Gradle 9.6.

```
gradle assembleDebug
```

or edit the paths in `build.bat` and run it. The APK is written to `app/build/outputs/apk/debug/app-debug.apk`.

## Extended city background (optional)

When the city is pulled down, the area above it shows extra ground. By default this is a mirrored copy of the city's
top edge. A nicer, AI-generated extension can be added locally (the game's images are not included in this repo):

1. With the app running on a phone (USB debugging), collect the city's ground tiles into `art/source/`
   (see `art/source/urls.json` format in `art/install_generated.ps1`).
2. `art/make_gemini_inputs.ps1` builds `art/for_gemini/canvas_extend_up_grey.png`.
3. Ask an image model to fill the grey area by extending the landscape upward; save the result in `art/generated/`.
4. `art/install_generated.ps1 -Picture art/generated/<file>` installs it into the app; rebuild.

All city layouts (phases 1–5, normal and capital) share the same top edge, so one picture covers every city; the
installer registers all of them (from `art/source/layouts/layouts.json`).

## App icon

`art/make_icon.ps1` builds the launcher icon (picture + "mobile" banner) at 1024 px and writes the adaptive-icon
foreground and `docs/icon.png`.

## Disclaimer

Ikariam and its artwork are trademarks / property of Gameforge 4D GmbH. This project only provides a browser
wrapper for personal use; please follow the game's terms of service.
