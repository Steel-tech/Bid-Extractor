# 🔥 Bid Extractor v1.3.0 - Matrix Edition

> **Extract bid information from RFQ emails with style.** Matrix-themed Chrome extension with priority scoring, dashboard stats, and digital rain animation.

![Version](https://img.shields.io/badge/version-1.3.0-00ff00?style=flat-square)
![Chrome](https://img.shields.io/badge/chrome-extension-00ff00?style=flat-square)
![License](https://img.shields.io/badge/license-proprietary-00ff00?style=flat-square)

---

## 📋 Table of Contents

- [Features](#-features)
- [Installation](#-installation)
- [How to Use](#-how-to-use)
- [Priority Scoring](#-priority-scoring)
- [Supported Platforms](#-supported-platforms)
- [Settings](#-settings)
- [Troubleshooting](#-troubleshooting)
- [Credits](#-credits)

---

## ✨ Features

### Core Functionality
- **Email Extraction** - Automatically extract bid details from RFQ emails
- **Auto-Download** - Save all attachments to organized folders
- **Project Info Sheet** - Generate HTML summary documents
- **Calendar Integration** - Add bid deadlines to Google Calendar, Outlook, or download .ics

### Matrix Edition (v1.3.0)
- **Digital Rain Animation** - Matrix-style falling characters background
- **Priority Scoring** - Smart 0-100 scoring system for bid prioritization
- **Dashboard Stats** - Real-time counters for Due Today, This Week, High Priority
- **Neon Cyberpunk Theme** - Full Matrix green aesthetic with glow effects

---

## 🚀 Installation

### Step 1: Download the Extension

Download or clone the extension folder to your computer.

### Step 2: Open Chrome Extensions

1. Open **Google Chrome**
2. Type `chrome://extensions` in the address bar
3. Press **Enter**

### Step 3: Enable Developer Mode

1. Look for the **"Developer mode"** toggle in the **top-right corner**
2. Click to turn it **ON** (toggle should be blue)

![Developer Mode](https://img.shields.io/badge/Developer_Mode-ON-00ff00?style=flat-square)

### Step 4: Load the Extension

1. Click the **"Load unpacked"** button (top-left area)
2. Navigate to the `bid-extractor` folder on your computer
3. Select the folder and click **"Open"** or **"Select Folder"**

### Step 5: Pin the Extension (Recommended)

1. Click the **puzzle piece icon** 🧩 in the Chrome toolbar (top-right)
2. Find **"Bid Extractor"** in the dropdown list
3. Click the **pin icon** 📌 next to it to keep it always visible

---

### ✅ Installation Complete!

You should now see the Bid Extractor icon in your Chrome toolbar. The extension is ready to use!

---

## 📖 How to Use

### Quick Start Flow

```
1. Open Gmail or Outlook in Chrome
2. Navigate to an RFQ/bid invitation email
3. Click the Bid Extractor icon in your toolbar
4. Click "extract from email" button
5. Review extracted data
6. Files auto-download to organized folder
```

### Detailed Step-by-Step Guide

#### Step 1: Open Your Email
- Go to [Gmail](https://mail.google.com) or [Outlook](https://outlook.com)
- Click on an email containing bid/RFQ information
- Make sure the full email content is loaded (not just preview)

#### Step 2: Launch Bid Extractor
- Click the **Bid Extractor** icon in your Chrome toolbar
- The popup will show **"ready"** status if you're on a supported page
- If it shows an error, refresh the page and try again

#### Step 3: Extract Data
- Click the green **"extract from email"** button
- Wait for extraction (status shows "extracting...")
- Extracted data appears in the preview section

#### Step 4: Review the Information
Check the extracted information:
| Field | Description |
|-------|-------------|
| **project** | Project name from email |
| **gc** | General Contractor name |
| **bid_date** | Deadline (highlighted in yellow) |
| **location** | Project location |
| **scope** | Scope of work |
| **files** | Number of attachments |

#### Step 5: Auto-Generated Files
The extension automatically creates and downloads:

```
Downloads/
└── Bids/
    └── {GC_Name}_{Bid_Date}_{Project_Name}/
        ├── bid_info.txt              # Plain text summary
        ├── Project_Info_Sheet.html   # Professional HTML document
        └── [attachments...]          # All downloaded files
```

**Example:**
```
Bids/
└── Turner_Construction_01-15-2025_Office_Tower/
    ├── bid_info.txt
    ├── Project_Info_Sheet.html
    ├── structural_drawings.pdf
    └── specifications.docx
```

#### Step 6: Add to Calendar (Optional)
- Click **"add to calendar"** button
- Choose your platform:
  - **Google Calendar** - Opens Google Calendar in new tab
  - **Outlook Calendar** - Opens Outlook Calendar in new tab
  - **Download .ics** - Downloads universal calendar file

---

## 🎯 Priority Scoring

The extension calculates a **priority score (0-100)** for each bid to help you focus on what matters most.

### Scoring Breakdown

| Factor | Max Points | How It Works |
|--------|------------|--------------|
| **Deadline Proximity** | 40 | Due today = 40pts, Tomorrow = 38pts, This week = 25pts |
| **GC Reputation** | 20 | Major GCs (Turner, Skanska, McCarthy, etc.) = 20pts |
| **Project Value** | 20 | Keywords like "hospital", "stadium", "data center" = more points |
| **Data Completeness** | 10 | More filled fields = more points |
| **Attachments** | 10 | Having documents attached = serious bid |

### Priority Levels

| Score | Level | Badge | Meaning |
|-------|-------|-------|---------|
| 70-100 | **HIGH** | 🔴 Red (pulsing) | Act NOW |
| 40-69 | **MEDIUM** | 🟠 Orange | Plan this week |
| 0-39 | **LOW** | 🟢 Green | Can wait |

### Dashboard Stats

The dashboard at the top shows real-time counts:
- **Due Today** - Bids with deadline TODAY (pulses red when > 0)
- **This Week** - Bids due within the next 7 days
- **High Priority** - Bids with score 70 or higher

---

## 🌐 Supported Platforms

### Email Providers
| Platform | Status | URL |
|----------|--------|-----|
| Gmail | ✅ Fully Supported | mail.google.com |
| Outlook Web | ✅ Fully Supported | outlook.com |
| Outlook Office 365 | ✅ Fully Supported | outlook.office.com |
| Outlook Office 365 | ✅ Fully Supported | outlook.office365.com |

### Bid Platforms (Link Extraction)
| Platform | Status | What It Does |
|----------|--------|--------------|
| BuildingConnected | ✅ Supported | Extracts project download links |
| PlanHub | ✅ Supported | Extracts project download links |
| Procore | ✅ Supported | Extracts project download links |

---

## ⚙️ Settings

Click the **gear icon** ⚙️ in the popup footer to access settings.

### Download Folder Pattern

Customize how folders are named:

```
Default: Bids/{gc}_{date}_{project}

Available variables:
├── {project}  → Project name
├── {gc}       → General Contractor name
├── {date}     → Bid date (MM-DD-YYYY)
└── {location} → Project location
```

**Examples:**
- `Bids/{gc}_{date}_{project}` → `Bids/Turner_01-15-2025_Office_Tower`
- `RFQ/{date}_{project}` → `RFQ/01-15-2025_Office_Tower`
- `Bids/{gc}/{project}` → `Bids/Turner/Office_Tower`

### Options

| Setting | Description |
|---------|-------------|
| **Auto-download attachments** | Automatically save files when extracting |
| **Create bid_info.txt summary** | Generate a plain text summary file |

---

## 🔧 Troubleshooting

### Common Issues

#### "Refresh Gmail page first" Error
- **Cause**: Content script didn't load properly
- **Fix**: Refresh the Gmail/Outlook page (F5 or Ctrl+R), then try again

#### Extension Shows "Open Gmail or Outlook"
- **Cause**: You're not on a supported email page
- **Fix**: Navigate to mail.google.com or outlook.com

#### Extraction Returns Empty or Wrong Data
- **Cause**: Email format not recognized, or preview mode
- **Fix**:
  1. Open the full email (not just preview pane)
  2. Wait for email to fully load
  3. Try extracting again

#### Downloads Not Working
- **Cause**: Chrome download permissions or blocked popups
- **Fix**:
  1. Go to Chrome Settings → Downloads
  2. Enable "Ask where to save each file" or set a default location
  3. Allow the extension to download multiple files

#### Digital Rain Not Showing
- **Cause**: Hardware acceleration might be disabled
- **Fix**:
  1. Go to Chrome Settings → System
  2. Enable "Use hardware acceleration when available"
  3. Restart Chrome

#### Priority Scores All Zero
- **Cause**: No bid date extracted
- **Fix**: Ensure the email contains a recognizable date format

---

## 📁 Project Structure

```
bid-extractor/
├── manifest.json              # Extension configuration
├── README.md                  # This documentation
├── icons/                     # Extension icons
│   ├── icon16.png
│   ├── icon32.png
│   ├── icon48.png
│   └── icon128.png
└── src/
    ├── popup/                 # Main popup interface
    │   ├── popup.html         # HTML structure + stats dashboard
    │   ├── popup.css          # Matrix theme (996 lines of cyberpunk)
    │   └── popup.js           # Logic, animations, priority scoring
    ├── content/               # Page injection scripts
    │   ├── gmail.js           # Gmail email extraction
    │   ├── outlook.js         # Outlook email extraction
    │   ├── content.css        # Inline button Matrix styling
    │   └── platforms/         # Bid platform extractors
    │       ├── buildingconnected.js
    │       ├── planhub.js
    │       └── procore.js
    └── background/
        └── background.js      # Service worker for downloads
```

---

## 🔄 Version History

### v1.3.0 - Matrix Edition (Current)
- ✨ Full Matrix cyberpunk theme redesign
- ✨ Digital rain background animation
- ✨ Priority scoring system (0-100)
- ✨ Dashboard statistics (Due Today, This Week, High Priority)
- ✨ Priority badges on recent extractions
- ✨ Sorted recent list by priority score
- ✨ Neon green glow effects throughout
- ✨ Scanline overlays
- ✨ Terminal-style lowercase text
- ✨ Glassmorphism card effects

### v1.2.0
- ✨ Project Info Sheet HTML generation
- ✨ Folder naming: GC + Date + Project format
- ✨ Auto-download on extraction

### v1.1.0
- ✨ Calendar integration (Google, Outlook, .ics file)
- ✨ BuildingConnected support
- ✨ PlanHub support
- ✨ Procore support

### v1.0.0
- 🎉 Initial release
- Gmail and Outlook extraction
- Basic download functionality
- Organized folder structure

---

## 🔒 Privacy & Security

### Data Handling
- **100% Local Processing** - All extraction happens entirely in your browser
- **Zero External Servers** - No data is ever sent to any external servers or APIs
- **No Analytics** - We collect absolutely no usage data, telemetry, or tracking
- **No Account Required** - Works completely offline after installation

### What Gets Stored
- **Chrome Local Storage Only** - Extracted bid data is saved only in your browser's local storage
- **Never Synced** - Data is NOT synced to Google or any cloud service
- **You Own Your Data** - Export, delete, or manage your data anytime

### Permissions Explained
| Permission | Why We Need It |
|------------|----------------|
| `activeTab` | Access the current email when you click "Extract" |
| `storage` | Save your extracted bids locally for the dashboard |
| `downloads` | Save attachments and info sheets to your Downloads folder |
| `tabs` | Check if you're on a supported email/bid platform |

### Security
- **Open Source** - Full code available for review on GitHub
- **No Obfuscation** - Clean, readable JavaScript you can audit
- **Minimal Permissions** - Only requests what's absolutely necessary
- **MIT Licensed** - Transparent and permissive licensing

---

## 📜 License

**MIT License** - Open Source

Copyright (c) 2026 Victor Garcia / StructuPath.ai

Permission is hereby granted, free of charge, to any person obtaining a copy of this software to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies. See the [LICENSE](LICENSE) file for full details.

---

## 👤 Credits

<div align="center">

### Created by

# **Victor Garcia**

## 🏗️ [StructuPath.ai](https://structupath.ai)

*Building intelligent tools for the construction industry*

---

![StructuPath](https://img.shields.io/badge/StructuPath.ai-Building_the_Future-00ff00?style=for-the-badge)

</div>

---

## 📞 Support

For support, feature requests, or bug reports:

| Channel | Contact |
|---------|---------|
| **Website** | [structupath.ai](https://structupath.ai) |
| **Issues** | Contact through website |

---

<div align="center">

### 🔥 EXTRACT BIDS. PRIORITIZE SMART. WIN PROJECTS. 🔥

---

**Built with precision by [Victor Garcia](https://structupath.ai) @ StructuPath.ai**

*© 2026 Victor Garcia / StructuPath.ai - MIT License*

</div>
