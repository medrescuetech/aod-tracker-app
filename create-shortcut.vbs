' Create Windows Shortcut for AOD Tracker
Set WshShell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

' Get the script directory
strPath = fso.GetParentFolderName(WScript.ScriptFullName)
strBatFile = strPath & "\start-clinic-server.bat"
strIconPath = strPath & "\public\favicon.ico"

' Check if batch file exists
If Not fso.FileExists(strBatFile) Then
    MsgBox "Error: start-clinic-server.bat not found!" & vbCrLf & vbCrLf & _
           "Please ensure you're running this from the AOD Tracker folder.", _
           vbCritical, "AOD Tracker Setup"
    WScript.Quit 1
End If

' Create Desktop Shortcut
strDesktop = WshShell.SpecialFolders("Desktop")
Set oLink = WshShell.CreateShortcut(strDesktop & "\AOD Tracker Server.lnk")
oLink.TargetPath = strBatFile
oLink.WorkingDirectory = strPath
oLink.WindowStyle = 1  ' Normal window
oLink.Description = "Start AOD Tracker Clinic Server"

' Try to use custom icon, fallback to default
If fso.FileExists(strIconPath) Then
    oLink.IconLocation = strIconPath & ",0"
Else
    oLink.IconLocation = "%SystemRoot%\system32\SHELL32.dll,14"
End If

oLink.Save

' Create Start Menu Shortcut
strStartMenu = WshShell.SpecialFolders("StartMenu")
Set oLink2 = WshShell.CreateShortcut(strStartMenu & "\Programs\AOD Tracker Server.lnk")
oLink2.TargetPath = strBatFile
oLink2.WorkingDirectory = strPath
oLink2.WindowStyle = 1
oLink2.Description = "Start AOD Tracker Clinic Server"
If fso.FileExists(strIconPath) Then
    oLink2.IconLocation = strIconPath & ",0"
Else
    oLink2.IconLocation = "%SystemRoot%\system32\SHELL32.dll,14"
End If
oLink2.Save

' Create Startup folder shortcut (auto-start on boot)
strStartup = WshShell.SpecialFolders("Startup")
Set oLink3 = WshShell.CreateShortcut(strStartup & "\AOD Tracker Server.lnk")
oLink3.TargetPath = strBatFile
oLink3.WorkingDirectory = strPath
oLink3.WindowStyle = 1
oLink3.Description = "Start AOD Tracker Clinic Server"
If fso.FileExists(strIconPath) Then
    oLink3.IconLocation = strIconPath & ",0"
Else
    oLink3.IconLocation = "%SystemRoot%\system32\SHELL32.dll,14"
End If
'oLink3.Save  ' Uncomment this line to enable auto-start on boot

MsgBox "Shortcuts created successfully!" & vbCrLf & vbCrLf & _
       "Desktop: AOD Tracker Server" & vbCrLf & _
       "Start Menu: AOD Tracker Server" & vbCrLf & vbCrLf & _
       "Double-click the desktop shortcut to start the server.", _
       vbInformation, "AOD Tracker Setup"
