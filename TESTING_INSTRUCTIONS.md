# RealCheck AI - Complete Implementation Guide

## ✅ What's Been Completed

### Backend (Node.js/Express API)
- ✅ Express server configured with CORS and JSON parsing
- ✅ Risk scoring system with 4 detection rules:
  1. Payment Keywords (+40 points) - "registration fee", "training fee", etc.
  2. Suspicious Channels (+30 points) - WhatsApp, Telegram, DM for job
  3. Free Email Domain (+25 points) - gmail.com, yahoo.com, outlook.com
  4. New Domain Age (<30 days +40 points) - Via WhoisXML API integration
- ✅ WHOIS domain verification API integrated
- ✅ Graceful error handling for failed API calls
- ✅ POST `/api/analyze-job` endpoint ready
- ✅ Risk levels: Low (0-30), Medium (31-70), High (71+)

### Frontend (HTML/CSS/JavaScript)
- ✅ Professional homepage with multiple sections
- ✅ Navbar with smooth scroll detection  
- ✅ Hero section with call-to-action
- ✅ Scam Detection Analyzer form added to homepage with:
  - Job message/offer textarea
  - Recruiter email input
  - Company website/domain input
  - Submit button
- ✅ CSS styling for analyzer section with:
  - Clean form layout with flexbox
  - Risk badge coloring (Low=Green, Medium=Yellow, High=Red)
  - Smooth animations and transitions
  - Responsive mobile design
- ✅ JavaScript form handler that:
  - Validates user inputs
  - Shows loading state during analysis
  - Sends data to backend API
  - Displays risk results dynamically
  - Allows users to analyze another offer
- ✅ Educational section with red flags and verification guide
- ✅ Jobs listing section
- ✅ Database section
- ✅ User registration popup

## 🚀 How to Test the Application

### Step 1: Start the Backend Server

Open PowerShell or Terminal and run:
```powershell
cd "c:\Users\HP\OneDrive\Documents\RealCheckAI\realcheck-backend"
node server.js
```

You should see: `Server running on port 5000`

### Step 2: Open the Frontend

1. Open `frontend/index.html` in your web browser or use a local dev server
   - Option A: Right-click > Open with > Browser
   - Option B: Use VS Code Live Server extension
   - Option C: Python server: `python -m http.server 8000`

### Step 3: Test the Scam Detector

Navigate to the **Instant Analyzer** section on the homepage (under the hero section).

#### Test Case 1: High Risk (Should be High Risk)
- **Job Message:** "Exciting opportunity! Registration fee of $50 required to secure your position. Limited seats available. Click here to confirm via WhatsApp."
- **Recruiter Email:** `hr@gmail.com`
- **Company Website:** `zencompany.com`
- **Expected Result:** High Risk (70+ points)

#### Test Case 2: Medium Risk (Should be Medium Risk)
- **Job Message:** "Great job opportunity in our growing company. Training fee $25."
- **Recruiter Email:** `recruiter@yahoo.com`
- **Company Website:** `techcompany.com`
- **Expected Result:** Medium Risk (31-70 points)

#### Test Case 3: Low Risk (Should be Low Risk)
- **Job Message:** "We are hiring experienced software engineers. Apply now!"
- **Recruiter Email:** `jobs@microsoft.com`
- **Company Website:** `microsoft.com`
- **Expected Result:** Low Risk (0-30 points)

### Step 4: Verify Results

Results should display:
- ✅ Risk badge (color-coded: Green/Yellow/Red)
- ✅ Risk score out of 100
- ✅ Detailed reasons for the risk assessment
- ✅ Button to analyze another offer

## 📁 File Structure

```
RealCheckAI/
├── frontend/
│   ├── index.html                (Frontend Homepage)
│   ├── style.css                 (Styling for all sections)
│   ├── script.js                 (Form handler & animations)
│   └── assets/                   (Images & resources)
└── realcheck-backend/
    ├── server.js                 (Express app entry point)
    ├── .env                      (API keys & config)
    ├── package.json              (Dependencies)
    ├── routes/
    │   └── analyzeJob.js         (POST /api/analyze-job endpoint)
    └── services/
        └── scamDetector.js       (Core detection logic)
```

## 🔧 Key API Endpoint

### POST `/api/analyze-job`

**Request:**
```json
{
  "message": "Job offer text here",
  "email": "recruiter@example.com",
  "website": "company.com"
}
```

**Response:**
```json
{
  "risk": "High",
  "score": 85,
  "reasons": [
    "Payment keyword detected: \"registration fee\"",
    "Free email domain detected: gmail.com",
    "Newly created domain detected"
  ]
}
```

## ⚙️ Environment Variables (.env)

Located in `realcheck-backend/.env`:
```
PORT=5000
WHOIS_API_KEY=at_w3vQvabNs9LgctyLGIkOPinOosHit
OPENAI_API_KEY=sk-proj-... (not currently used)
```

## 🐛 Troubleshooting

### Issue: "Failed to analyze. Please make sure the backend server is running"
- **Solution:** Check that backend server is running: `node server.js` in the realcheck-backend directory
- **Check:** Open browser console (F12) and verify the API call in Network tab

### Issue: CORS errors
- **Solution:** CORS is already enabled in server.js for all origins
- **Verify:** Check server console for error messages

### Issue: Form validation errors
- **Solution:** Ensure:
  - Job message is not empty
  - Email field has a valid email format
  - Website field is optional but if provided, should be valid domain/URL

### Issue: Domain age always returns null
- **Solution:** WHOIS API may rate-limit or have issues. The code handles this gracefully and continues with other checks.

## 📊 Risk Scoring Breakdown

| Factor | Points | Condition |
|--------|--------|-----------|
| Payment Keywords | +40 | "fee", "guaranteed", "limited seats", etc. |
| Suspicious Channels | +30 | WhatsApp, Telegram, DM for job |
| Free Email | +25 | gmail.com, yahoo.com, outlook.com |
| New Domain | +40 | Domain created less than 30 days ago |
| **Total Max** | **135** | All factors combined |

**Risk Levels:**
- 0-30 points: **Low Risk** (Green)
- 31-70 points: **Medium Risk** (Yellow)
- 71+ points: **High Risk** (Red)

## ✨ Features Included

- 🔐 WHOIS API integration for domain age verification
- 📊 Advanced keyword detection system
- 🎨 Beautiful, responsive UI with animations
- ⚡ Real-time analysis with loading states
- 📱 Mobile-friendly design
- ♿ Accessible form with proper labels
- 🛡️ CORS-enabled backend
- 🔄 Re-analyze functionality
- 📧 Email domain validation
- 🌐 URL/domain extraction and parsing

## 🎯 Next Steps (Optional)

1. **Add more detection rules**: Edit `paymentKeywords` array in `scamDetector.js`
2. **Customize thresholds**: Adjust risk score additions for each rule
3. **Add AI detection**: Uncomment OpenAI integration for additional AI-generated content detection
4. **Database integration**: Connect to MongoDB/PostgreSQL to store analysis history
5. **User authentication**: Add proper login/registration system

---

**Status:** ✅ Production Ready - All components functional and tested
