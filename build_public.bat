@echo off
rem Builds the APK for public release: same app, but WITHOUT the local extended city background
rem (app\src\main\assets\art, made from the game's own pictures). Without it the app shows the
rem built-in mirrored ground above the city. Output: IkariamMobile-public.apk
set "PROJ=D:\Programs\02 - APK Development\IkariamMobile"
rem (held next to the project, on the same drive: folders can't be moved across drives)
set "HOLD=%PROJ%\..\ikm_art_hold"
if exist "%HOLD%" (
  echo A held copy of the background already exists in %HOLD% from an earlier run.
  echo Move it back to app\src\main\assets\art first, then run this again.
  exit /b 1
)
if exist "%PROJ%\app\src\main\assets\art" move "%PROJ%\app\src\main\assets\art" "%HOLD%" >nul
rem Start from a fresh APK: quick builds update the old file in place, which can leave the removed
rem picture's bytes inside it.
if exist "%PROJ%\app\build\outputs\apk\debug" rmdir /s /q "%PROJ%\app\build\outputs\apk\debug"
call "%PROJ%\build.bat"
copy /y "%PROJ%\app\build\outputs\apk\debug\app-debug.apk" "%PROJ%\IkariamMobile-public.apk" >nul
rem and the same for the next normal build, which puts the picture back
rmdir /s /q "%PROJ%\app\build\outputs\apk\debug"
if exist "%HOLD%" move "%HOLD%" "%PROJ%\app\src\main\assets\art" >nul
echo PUBLIC APK: %PROJ%\IkariamMobile-public.apk
