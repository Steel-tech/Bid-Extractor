# Robust Bid Extraction — Design Document

**Date:** 2026-02-18
**Status:** Approved
**Approach:** Smart Section Parser (Approach A)

## Problem

The bid-extractor Chrome extension currently extracts 11 fields from Gmail/Outlook emails using regex patterns, but key data is frequently missing or wrong:

- **Project name** extraction is fragile (depends on "RFQ:" or "Project:" prefixes in subject)
- **GC company** only found when explicitly stated as "General Contractor:" in body
- **Project Manager** name is not extracted at all
- **Email body/notes** are truncated to 2000 chars; notes field is always empty
- **bid_info.txt** is sparse — just field values, no rich content
- **Project_Info_Sheet.html** missing PM, submission instructions, pre-bid meeting, addenda
- **No email thread awareness** — only reads the latest message
- **Clipboard copy** not formatted for external systems (spreadsheets, CRMs)

## Solution

Build a Smart Section Parser that parses the entire email intelligently into structured sections, reads the full email thread, and outputs rich bid_info.txt and Project_Info_Sheet.html with clipboard-ready copy formats.

## Architecture

### New Module: `src/content/email-parser.js`

Core parser that takes raw email text + HTML and returns structured data.

**Signature Block Parser:**
- Detect signature boundaries (`--`, "Best regards", "Sincerely", double line breaks before short lines)
- Extract from signature: name (PM), title, company, email, phone, address
- Use HTML structure (signature divs often have specific classes or are after `<br><br>`)

**Section Identifier:**
- Split email body into logical sections by detecting headers:
  - "Scope of Work", "Bid Requirements", "Submission Instructions", "Pre-Bid Meeting/Conference", "Addenda", "Bond Requirements", "Project Description", "Schedule", "Questions"
- Each section captured as `{ heading, content }` pairs
- Unmatched paragraphs go into `generalNotes`

**Thread Parser:**
- Find thread boundaries: `On ... wrote:`, `From:`, `---------- Forwarded message`, Gmail's `.gmail_quote` div
- Extract each message as `{ sender, date, body }`
- Combine all messages so nothing from the chain is lost

**Metadata Extractor:**
- Bid time (separate from date): "by 2:00 PM", "before 5:00 PM EST"
- Pre-bid meeting: date + time + location + mandatory/optional
- Addenda: "Addendum No. 1", "Addendum #2 issued..."
- Bond requirements: "bid bond", "payment bond", "performance bond"
- Plan room / document access info

### Enhanced Content Scripts (`gmail.js`, `outlook.js`)

- Import and use `email-parser.js`
- Read ALL message bodies in the email thread (not just first)
- Use signature company name as primary GC source
- New fields added to bidInfo object:
  - `projectManager` — from signature name + title, or "Project Manager:" pattern
  - `gcCompany` — separated from `gc`
  - `gcEmail` — GC's email from signature
  - `gcPhone` — phone from signature
  - `bidTime` — extracted separately from bidDate
  - `submissionInstructions` — how/where to submit
  - `preBidMeeting` — `{ date, time, location, mandatory }`
  - `addenda` — array of addendum notices
  - `bondRequirements` — bid bond, performance bond, etc.
  - `generalNotes` — FULL email body text (no truncation)
  - `threadMessages` — array of `{ sender, date, body }`

### Enhanced Outputs

**bid_info.txt** — Rich version with all sections:
- Project details, contact info, scope, submission instructions
- Pre-bid meeting details, bond requirements, addenda list
- Attachments, download links
- Full general notes (entire email body)
- Email thread (all messages)

**Project_Info_Sheet.html** — Enhanced with:
- Project Manager row
- Bid Time next to Bid Date
- Submission Instructions section
- Pre-Bid Meeting section
- Bond Requirements section
- Addenda section
- Full General Notes
- Email Thread section (collapsible)

**Clipboard Copy** — Multiple formats:
- Copy All: full bid_info.txt format
- Copy for Spreadsheet: tab-separated single line
- Copy Notes Only: just the general notes/email body

### Popup UI Updates

- Project Manager field in preview
- Bid Time next to bid date
- GC Company as separate field
- General Notes preview (first 200 chars with expand)
- Thread message count indicator
- Copy dropdown with format options

## Files Changed

| File | Change |
|------|--------|
| `src/content/email-parser.js` | NEW — Core parser module |
| `src/content/gmail.js` | MODIFIED — Use parser, thread reading, new fields |
| `src/content/outlook.js` | MODIFIED — Same enhancements as gmail.js |
| `src/popup/popup.js` | MODIFIED — Enhanced outputs, new preview fields, copy dropdown |
| `src/popup/popup.html` | MODIFIED — New preview fields, copy dropdown UI |
| `src/popup/popup.css` | MODIFIED — Styles for new elements |
| `manifest.json` | MODIFIED — Add email-parser.js to content scripts |

## Out of Scope

- AI/LLM-assisted extraction (future enhancement)
- Blueprint general notes parsing (already handled by OCR)
- Changes to priority scoring algorithm
- Changes to settings/calendar/blueprint viewer
