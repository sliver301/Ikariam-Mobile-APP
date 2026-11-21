@echo off
set "JAVA_HOME=C:\Program Files\Android\Android Studio\jbr"
set "ANDROID_HOME=C:\Users\silly\AppData\Local\Android\Sdk"
set "GRADLE_USER_HOME=D:\Programs\02 - APK Development\tools\gradle-home"
cd /d "D:\Programs\02 - APK Development\IkariamMobile"
call "D:\Programs\02 - APK Development\tools\gradle-9.6.0\bin\gradle.bat" assembleDebug --offline --console=plain
echo BUILD FINISHED, exit code %ERRORLEVEL%
