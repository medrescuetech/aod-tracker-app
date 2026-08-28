# Create EXE from Batch File

## Method 1: Bat To Exe Converter (Free, Recommended)

### Step 1: Download Tool
1. Go to: https://bat-to-exe-converter-x64.en.softonic.com/
   or search "Bat To Exe Converter"
2. Download and install

### Step 2: Convert to EXE
1. Open Bat To Exe Converter
2. **Batch File**: Select `start-clinic-server.bat`
3. **Save As**: `AOD-Tracker-Server.exe`
4. **Options**:
   - ☑️ Include version information
   - ☑️ Request administrator privileges (if needed)
   - Working directory: [leave blank for auto]
5. Click **Convert**

### Step 3: Customize Icon (Optional)
1. In the tool, click **Version Information**
2. Set:
   - File Description: "AOD Tracker Clinic Server"
   - Product Name: "AOD Tracker"
   - Company: [Your Clinic Name]
   - Icon: Browse to `public\favicon.ico` (if exists) or any .ico file

### Result
You get `AOD-Tracker-Server.exe` that:
- ☑️ Double-click to run
- ☑️ Looks professional
- ☑️ Can have custom icon
- ☑️ No command window flashing

---

## Method 2: Advanced EXE (With System Tray)

For a more professional result with system tray icon:

### Using Node.js pkg (Command Line)
```bash
npm install -g pkg

# Create package.json entry
# Then:
pkg . --targets node18-win-x64 --output "AOD Tracker Server.exe"
```

---

## Method 3: PowerShell GUI Wrapper

If you want a proper Windows GUI:

### Create `start-gui.ps1`:
```powershell
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

# Create form
$form = New-Object System.Windows.Forms.Form
$form.Text = "AOD Tracker Server"
$form.Size = New-Object System.Drawing.Size(400, 200)
$form.StartPosition = "CenterScreen"
$form.Icon = [System.Drawing.Icon]::ExtractAssociatedIcon("server\favicon.ico")

# Status label
$label = New-Object System.Windows.Forms.Label
$label.Location = New-Object System.Drawing.Point(10, 20)
$label.Size = New-Object System.Drawing.Size(360, 30)
$label.Text = "Server Status: Starting..."
$label.Font = New-Object System.Drawing.Font("Arial", 12)
$form.Controls.Add($label)

# URL label
$urlLabel = New-Object System.Windows.Forms.LinkLabel
$urlLabel.Location = New-Object System.Drawing.Point(10, 60)
$urlLabel.Size = New-Object System.Drawing.Size(360, 30)
$urlLabel.Text = "Open: http://localhost:8080"
$urlLabel.Font = New-Object System.Drawing.Font("Arial", 10)
$urlLabel.Add_Click({ Start-Process "http://localhost:8080" })
$form.Controls.Add($urlLabel)

# Stop button
$stopBtn = New-Object System.Windows.Forms.Button
$stopBtn.Location = New-Object System.Drawing.Point(150, 110)
$stopBtn.Size = New-Object System.Drawing.Size(100, 30)
$stopBtn.Text = "Stop Server"
$stopBtn.Add_Click({ 
    $label.Text = "Server Status: Stopping..."
    # Kill node process
    Get-Process node -ErrorAction SilentlyContinue | Stop-Process
    $form.Close()
})
$form.Controls.Add($stopBtn)

# Start server
$env:PORT = "8080"
$env:NODE_ENV = "production"
$env:SERVE_FRONTEND = "1"
$job = Start-Job { 
    Set-Location $using:PWD
    node server/index.js 
}

$label.Text = "Server Status: Running on port 8080"

$form.ShowDialog()

# Cleanup
Stop-Job $job
Remove-Job $job
```

---

## Comparison

| Method | Ease | Features | Best For |
|--------|------|----------|----------|
| **Bat To Exe** | ⭐⭐⭐ Easy | Basic EXE, icon | Quick solution |
| **Shortcut** | ⭐⭐⭐ Easiest | No conversion needed | Immediate use |
| **pkg** | ⭐⭐ Medium | Single file, no Node.js needed | Distribution |
| **PowerShell GUI** | ⭐ Complex | System tray, buttons | Advanced users |
| **Electron** | ⭐⭐ Medium | Full desktop app | Professional look |

---

## Recommended: Bat To Exe + Shortcut

1. Run `CREATE-SHORTCUT.bat` → Creates desktop shortcut
2. Optionally convert to EXE using Bat To Exe
3. Staff double-clicks desktop icon → Server starts

This gives you:
- Immediate usability (shortcut)
- Professional look (optional EXE)
- No technical knowledge needed
