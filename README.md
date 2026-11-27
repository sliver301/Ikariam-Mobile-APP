<p align="center"><img src="docs/banner.jpg" width="100%" alt="Ikariam Mobile"></p>

<p align="center"><b>English</b> &nbsp;|&nbsp; <a href="README.ar.md"><b>العربية</b></a></p>

# <img src="docs/icon.png" width="40" align="center" alt=""> Ikariam Mobile

An Android app for playing the browser game **Ikariam** comfortably on a phone, especially in portrait.

It is a dedicated browser: it loads the real Ikariam website and only changes how the page is laid out and how
touch reaches it. Every game action comes from your own tap. It is an unofficial fan project and is not affiliated
with Gameforge.

## Download

**[Download the latest APK](https://github.com/sliver301/Ikariam-Mobile-APP/releases/latest)**, open it on your
phone and allow installing from that app when Android asks. Android 12 or newer. Log in with your Gameforge account
as usual and pick your server; the app remembers it.

**Updates:** the app checks this page when it opens and offers to download and install a newer release for you.
Version numbers follow the game: app 1.17.6.1 is made for game version 17.6.1. When the game moves to a new version,
the app tells you once, in case something looks different until the app catches up.

## Screenshots

<p align="center">
<img src="docs/screenshots/ar_1_city.jpg" width="30%" alt="City">
<img src="docs/screenshots/ar_2_wheel.jpg" width="30%" alt="Town wheel">
<img src="docs/screenshots/ar_3_social.jpg" width="30%" alt="Social column">
</p>
<p align="center">
<img src="docs/screenshots/ar_4_window.jpg" width="30%" alt="A building window">
<img src="docs/screenshots/ar_5_more.jpg" width="30%" alt="More">
<img src="docs/screenshots/ar_6_settings.jpg" width="30%" alt="App settings">
</p>

<sub>On an Arabic server; the town and player names are made up. The app is mirrored and in English on English
servers (see the video).</sub>

## Touch tutorial videos

<p align="center">
<a href="https://github.com/sliver301/Ikariam-Mobile-APP/releases/download/v1.1/Ikariam-Mobile-tutorial-en.mp4"><img src="docs/screenshots/video_en.jpg" width="30%" alt="Tutorial video, English"></a>
&nbsp;&nbsp;
<a href="https://github.com/sliver301/Ikariam-Mobile-APP/releases/download/v1.1/Ikariam-Mobile-tutorial-ar.mp4"><img src="docs/screenshots/video_ar.jpg" width="30%" alt="Tutorial video, Arabic"></a>
</p>
<p align="center">English (left) and Arabic (right), 75 seconds each. The app also has the tutorial built in.</p>

## Features

**Made for your thumb (portrait)**
- A slim strip on top (gold, ships, Ambrosia, citizens, action points, resources, the server clock); the town bar,
  City / Island / World / More and the advisors at the bottom, in reach of your thumb.
- **Town wheel:** slide the town bar, or flick it to spin through your towns; it rests with one town in the middle
  and never switches by itself. Tap the ringed town, or the town just beside it, to go there at once. Your own town stays marked, and a tag above
  the bar takes you back. Small notches can be felt while it turns (can be turned off).
- **Town menu and Social** buttons: press to show or hide the column, or slide up and let go on the item you want.
  In an alliance, Social holds the alliance chat and alliance message on top of your friends.
- Game windows fill the screen's width; windows and side panels can be dragged by their top bar and remember where
  you left them. The alliance chat is full width with text twice the game's size.
- **More:** the shop, inventory, switch server (straight to any server you play on this phone), the game's links and
  **App settings**: a window in the game's style with layout, rotation, the switches, reload, lobby, the tutorial
  and more.
- Any server, any language: the app follows the language you choose in the game's Options (27 languages), mirrored
  for Arabic and Hebrew.
- Town list > Edit order: your own town order, saved to the game's custom sorting so it applies everywhere.
- A classic layout (game panel on top) and landscape are available too.

**Touch controls**
- Tap = click. Hold = the game's hover info (on gold or a resource it shows large, just above the town bar; any
  touch or Back closes it). Hold and move = drag.
- The island view and the world map open with your town / island in the middle of the screen.
- Drag the city and island with one finger; pinch or double-tap zooms the map only, never the bars.
- Two fingers inside a window (for example a battle report) zoom its content.
- Number boxes open the number pad (always English digits), with the cursor after the last digit.
- Rearrange buildings: drag a building to a green place; Save saves, Back cancels.
- Back closes what is on top; with nothing open, Back twice leaves the app.

**News alerts (optional, on by default)**
- Every minute it checks each server you are logged in to for advisor news (towns, military, research, diplomacy)
  and vibrates (no sound). Tap the alert to open that server at that advisor.
- It never logs in by itself. If you were logged out (for example by playing on a PC), it says so once, with a
  Reconnect button.
- Note: background checks may not be allowed by the game's rules; use at your own risk. Turn them off in App
  settings.

**Touch tutorial**
- Offered once after installing, and always under More > App settings. It plays on a saved copy of a town (no
  personal details), full screen, and cannot touch your account. Back twice ends it.

## For developers

```
app/src/main/java/com/islam/ikariamtouch/   Android side (WebView, back button, settings, alerts, tutorial)
app/src/main/assets/enhance.js               Page script: layout, touch handling, map camera, town wheel
app/src/main/assets/i18n.txt                 The app's own words in every language
app/src/main/assets/tutorial/                The tutorial's captions (its saved town is built locally)
art/                                         Scripts to build the extended city background
build.bat                                    Local build script
```

Requirements: JDK 17+ (Android Studio's bundled JBR works), Android SDK (compileSdk 37), Gradle 9.6. Run
`gradle assembleDebug` or edit the paths in `build.bat`; the APK is written to
`app/build/outputs/apk/debug/app-debug.apk`.

The game's own pictures and pages are not in this repository: the extended city background
(`app/src/main/assets/art/`) and the tutorial's saved town (`app/src/main/assets/tutorial/tut_*.html`) are built
locally from a running game, and a build without them falls back to a mirrored city edge and the written help. The
release APK includes them.

**Extended city background:** with the app running on a phone (USB debugging), collect the city's ground tiles into
`art/source/`, run `art/make_gemini_inputs.ps1`, have an image model fill the grey area upward, save the result in
`art/generated/` and install it with `art/install_generated.ps1 -Picture art/generated/<file>`.

The app icon is original artwork (`art/make_icon.py` builds it from `art/icon_source.png`).

## Disclaimer

Ikariam and its artwork are trademarks / property of Gameforge 4D GmbH. This project only provides a browser
wrapper for personal use; please follow the game's terms of service.
