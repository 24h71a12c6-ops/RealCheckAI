// ========== NAVBAR SCROLL EFFECT ==========
window.addEventListener('scroll', () => {
    const navbar = document.getElementById('navbar');
    if (window.scrollY > 10) {
        navbar.classList.add('scrolled');
    } else {
        navbar.classList.remove('scrolled');
    }
});

// ========== SCROLL REVEAL ANIMATION ==========
const observerOptions = {
    threshold: 0.1,
    rootMargin: "0px 0px -50px 0px"
};

window.runAnalysis = async function runAnalysis() {
    const btn = document.getElementById('analyzeBtn');
    const textEl = document.getElementById('jobDetails');
    const resultDiv = document.getElementById('analysisResult');

    if (!btn || !textEl || !resultDiv) {
        return;
    }

    const original = btn.innerText;
    btn.innerText = '⏳ Processing...';
    btn.disabled = true;

    let finalContent = String(textEl.value || '');

    if (!finalContent.trim()) {
        alert('Please paste job details first!');
        btn.innerText = original;
        btn.disabled = false;
        return;
    }

    const scamSignals = [
        'registration fee', 'security deposit', 'batch code',
        'whatsapp to', 'telegram', 'processing fee',
        'training fee', 'pay to'
    ];

    let score = 0;
    const detected = [];

    scamSignals.forEach(signal => {
        if (finalContent.toLowerCase().includes(signal)) {
            score += 25;
            detected.push(signal);
        }
    });

    const clampedScore = Math.min(score, 100);
    resultDiv.style.display = 'block';

    const badge = document.getElementById('riskBadge');
    const verdict = document.getElementById('verdictText');
    const scoreText = document.getElementById('riskScore');

    if (scoreText) scoreText.innerText = String(clampedScore);

    if (badge && verdict) {
        if (clampedScore >= 50) {
            badge.innerText = '⚠ HIGH RISK';
            badge.style.background = '#fee2e2';
            badge.style.color = '#dc2626';
            verdict.innerText = `Suspicious signals found: ${detected.join(', ')}. Be careful!`;
        } else if (clampedScore > 0) {
            badge.innerText = '🟡 MEDIUM RISK';
            badge.style.background = '#ffedd5';
            badge.style.color = '#ea580c';
            verdict.innerText = `Some common keywords detected (${detected.join(', ')}). Verify before proceeding.`;
        } else {
            badge.innerText = '✅ LOW RISK';
            badge.style.background = '#dcfce7';
            badge.style.color = '#16a34a';
            verdict.innerText = "No obvious scam signals detected. Always verify the company's official domain.";
        }
    }

    btn.innerText = original;
    btn.disabled = false;
};

let firebaseAuth = null;
let firestoreDb = null;
let firebaseReady = false;

// ========== GEMINI AI INTEGRATION ==========
function isQuotaError(message) {
    const normalized = String(message || '').toLowerCase();
    return normalized.includes('quota')
        || normalized.includes('rate limit')
        || normalized.includes('limit: 0')
        || normalized.includes('billing');
}

function setScanModeBadge(label) {
    const badgeEl = document.getElementById('scanModeBadge');
    if (!badgeEl) return;
    const content = String(label || '').trim();
    badgeEl.textContent = content;
    badgeEl.style.display = content ? 'inline-flex' : 'none';
}

function showAnalysisMessage(label, message, modifierClass = '') {
    const verdictEl = document.getElementById('ai-verdict');
    if (!verdictEl) return;
    verdictEl.style.display = 'block';
    verdictEl.innerHTML = `
        <div class="ai-verdict-inner ${modifierClass}">
            <span class="ai-label">${label}</span>
            <p>${String(message || '').replace(/\n/g, '<br>')}</p>
        </div>`;
}

async function callGemini(text, localResult) {
    const verdictEl = document.getElementById('ai-verdict');
    if (!verdictEl) return;
    verdictEl.style.display = 'block';
    verdictEl.innerHTML = '<div class="spinner"></div>';
    try {
        const response = await fetch('/api/gemini-analyze', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ extractedText: text })
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || `API error ${response.status}`);
        setScanModeBadge('');
        const aiText = data.verdict;
        verdictEl.innerHTML = `<div class="ai-verdict-inner"><span class="ai-label">🧠 AI Verdict</span><p>${aiText.replace(/\n/g, '<br>')}</p></div>`;
    } catch (err) {
        if (localResult) {
            renderLocalHeuristic(localResult);
        }

        setScanModeBadge('Basic Scan');

        if (isQuotaError(err.message)) {
            showAnalysisMessage('Basic Scan', 'AI quota reached, so RealCheck is showing the local heuristic scan result for now.');
            return;
        }

        showAnalysisMessage('Basic Scan', `AI analysis unavailable, so the local heuristic result is being shown instead. ${err.message || ''}`.trim(), 'basic-scan-note');
    }
}

async function initFirebase() {
    if (firebaseReady || !window.firebase) return firebaseReady;

    try {
        const response = await fetch('/api/firebase-config');
        if (!response.ok) {
            throw new Error(`Firebase config error: ${response.status}`);
        }

        const firebaseConfig = await response.json();

        if (!window.firebase.apps.length) {
            window.firebase.initializeApp(firebaseConfig);
        }

        firebaseAuth = window.firebase.auth();
        firestoreDb = window.firebase.firestore();

        // Keep a signed-in session for Firestore rules that require auth.
        if (!firebaseAuth.currentUser) {
            try {
                await firebaseAuth.signInAnonymously();
            } catch (authError) {
                console.warn('Anonymous Firebase sign-in failed:', authError.message);
            }
        }

        firebaseReady = true;
    } catch (error) {
        console.warn('Firebase initialization skipped:', error.message);
    }

    return firebaseReady;
}

async function saveAnalysisToFirestore(payload, result) {
    if (!firebaseReady || !firestoreDb) return;

    try {
        const user = firebaseAuth ? firebaseAuth.currentUser : null;
        const uid = user ? user.uid : null;

        if (!uid) return;

        await firestoreDb.collection('analyses').add({
            uid,
            rawText: payload.rawText || '',
            jobMessage: payload.rawText || payload.message || '',
            recruiterEmail: result.recruiter_email || payload.email || '',
            companyWebsite: result.company_website || payload.website || '',
            risk: result.risk || 'Low',
            score: Number.isFinite(result.score) ? result.score : 0,
            reasons: Array.isArray(result.reasons) ? result.reasons : [],
            createdAt: window.firebase.firestore.FieldValue.serverTimestamp()
        });
    } catch (error) {
        console.warn('Could not save analysis to Firestore:', error.message);
    }
}

const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            entry.target.classList.add('visible');
            observer.unobserve(entry.target);
        }
    });
}, observerOptions);

document.querySelectorAll('.reveal').forEach(el => {
    observer.observe(el);
});

// ========== HERO AI ANALYZER ==========
const analyzeBtn = document.getElementById('analyzeBtn');
const analyzerInputEl = document.getElementById('analyzerInput');
const resultCardEl = document.getElementById('resultCard');
if (analyzeBtn && analyzerInputEl && resultCardEl) {
    analyzeBtn.addEventListener('click', function() {
        const input = analyzerInputEl.value.trim();
        const btn = this;
        const resultCard = resultCardEl;
        
        if (!input) {
            alert("Please paste an offer or upload a document to scan.");
            return;
        }
        
        // Simulate loading
        const originalText = btn.innerHTML;
        btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Analyzing...';
        btn.disabled = true;
        
        setTimeout(() => {
            btn.innerHTML = originalText;
            btn.disabled = false;
            resultCard.style.display = 'block';
        }, 1500);
    });
}

// ========== FILE UPLOAD MOCK ==========
const fileUpload = document.getElementById('fileUpload');
if (fileUpload) {
    fileUpload.addEventListener('change', function(e) {
        const fileName = e.target.files[0]?.name;
        if (fileName) {
            document.getElementById('analyzerInput').value = `[Document Uploaded: ${fileName}]\n\nPlease wait for analysis...`;
        }
    });
}

// ========== REGISTRATION FORM SUBMISSION ==========
const reportForm = document.getElementById('reportForm');
if (reportForm) {
    reportForm.addEventListener('submit', function(e) {
        e.preventDefault();
        const btn = this.querySelector('button[type="submit"]');
        const originalText = btn.innerText;
        
        btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Submitting...';
        btn.disabled = true;
        
        setTimeout(() => {
            this.style.display = 'none';
            const reportSuccess = document.getElementById('reportSuccess');
            if (reportSuccess) {
                reportSuccess.style.display = 'block';
            }
        }, 1000);
    });
}

// ========== SKILL ROADMAP DATA ==========
const skillRoadmap = {
    "Web Developer": [
        { skill: "HTML/CSS",         title: "HTML & CSS Full Course",      videoId: "mU6anWqZJcc", channel: "Apna College" },
        { skill: "JavaScript",       title: "Modern JS Tutorial",           videoId: "jS4aFq5-91M", channel: "SuperSimpleDev" },
        { skill: "React",            title: "React JS Crash Course",        videoId: "bMknfKXIFA8", channel: "Traversy Media" }
    ],
    "Data Analyst": [
        { skill: "Excel",            title: "Advanced Excel Tutorial",      videoId: "Vl0hux8aHY0", channel: "Leila Gharani" },
        { skill: "SQL",              title: "SQL Full Course",               videoId: "HXV3zePRqGY", channel: "freeCodeCamp" },
        { skill: "Python",           title: "Python for Data Science",      videoId: "rfscVS0vtbw", channel: "freeCodeCamp" }
    ],
    "AI/ML Engineer": [
        { skill: "Python",           title: "Python for AI",                videoId: "NWONeJKn6kc", channel: "CodeWithHarry" },
        { skill: "Maths",            title: "Linear Algebra for ML",        videoId: "u0TIDZ-I690", channel: "3Blue1Brown" },
        { skill: "Neural Networks",  title: "Deep Learning Specialization", videoId: "aircAruvnKk", channel: "3Blue1Brown" }
    ]
};

function displayCourses(missing, courseList) {
    courseList.innerHTML = '';
    if (missing.length === 0) {
        courseList.innerHTML = '<p class="success-msg">You are job-ready for this role! 🎉</p>';
        return;
    }
    missing.forEach(item => {
        const thumbUrl = `https://img.youtube.com/vi/${item.videoId}/maxresdefault.jpg`;
        const ytUrl    = `https://www.youtube.com/watch?v=${item.videoId}`;
        courseList.innerHTML += `
            <div class="course-card">
                <div class="video-preview" onclick="window.open('${ytUrl}','_blank')">
                    <img src="${thumbUrl}" alt="${item.title}" class="thumb"
                         onerror="this.src='https://img.youtube.com/vi/${item.videoId}/hqdefault.jpg'">
                    <div class="play-overlay"><i class="fas fa-play"></i></div>
                </div>
                <div class="course-info">
                    <span class="course-badge">FREE COURSE</span>
                    <h4>${item.skill}: ${item.title}</h4>
                    <p>by ${item.channel}</p>
                    <button onclick="window.open('${ytUrl}','_blank')" class="yt-btn">
                        <i class="fab fa-youtube"></i> Watch on YouTube
                    </button>
                </div>
            </div>`;
    });
}

function analyzeGap() {
    const skillsEl   = document.getElementById('current-skills');
    const roleEl     = document.getElementById('target-role');
    const resultsEl  = document.getElementById('analysis-results');
    const courseList = document.getElementById('course-list');
    const gapForm    = document.querySelector('.skill-gap-form');

    const currentSkills = skillsEl ? skillsEl.value : '';
    const targetRole    = roleEl  ? roleEl.value  : '';

    if (!currentSkills.trim()) { alert('Please enter your current skills.'); return; }
    if (!resultsEl || !courseList) return;

    const skillsLower = currentSkills.toLowerCase();
    const required    = skillRoadmap[targetRole] || [];
    const missing     = required.filter(item => !skillsLower.includes(item.skill.toLowerCase()));

    displayCourses(missing, courseList);

    if (gapForm) gapForm.style.display = 'none';
    resultsEl.style.display = 'block';
    resultsEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

window.analyzeGap = analyzeGap;

// ========== SPLASH SCREEN & REGISTRATION LOGIC ==========
document.addEventListener('DOMContentLoaded', () => {
    const splash = document.getElementById('splashScreen');
    const regPopupOverlay = document.getElementById('regPopupOverlay');
    const closePopupBtn = document.getElementById('closePopupBtn');
    const ctaRegisterBtn = document.getElementById('ctaRegisterBtn');
    const regPopupForm = document.getElementById('regPopupForm');
    const isRegistered = localStorage.getItem('realcheck_user_v2');

    initFirebase();

    // 1. Splash Screen Fade Out after 3 seconds
    setTimeout(() => {
        if (splash) {
            splash.style.opacity = '0';
            splash.style.visibility = 'hidden';
            splash.style.pointerEvents = 'none';
        }
    }, 3000);

    // Modal controls
    if (closePopupBtn) {
        closePopupBtn.addEventListener('click', () => {
            regPopupOverlay.classList.remove('show');
        });
    }

    if (ctaRegisterBtn) {
        ctaRegisterBtn.addEventListener('click', () => {
            regPopupOverlay.classList.add('show');
        });
    }

    window.addEventListener('click', (e) => {
        if (e.target === regPopupOverlay) {
            regPopupOverlay.classList.remove('show');
        }
    });

    // Handle Registration Submit
    if (regPopupForm) {
        regPopupForm.addEventListener('submit', async (e) => {
            e.preventDefault();

            const popupInputs = regPopupForm.querySelectorAll('.popup-input');
            const fullName = popupInputs[0]?.value?.trim() || '';
            const email = popupInputs[1]?.value?.trim() || '';
            const password = popupInputs[2]?.value || '';
            const confirmPassword = popupInputs[3]?.value || '';

            if (password && confirmPassword && password !== confirmPassword) {
                alert('Password and confirm password do not match.');
                return;
            }

            // Attempt Firebase email signup if available.
            if (firebaseReady && firebaseAuth && firestoreDb && email && password) {
                try {
                    const cred = await firebaseAuth.createUserWithEmailAndPassword(email, password);
                    await firestoreDb.collection('users').doc(cred.user.uid).set({
                        name: fullName,
                        email,
                        provider: 'password',
                        createdAt: window.firebase.firestore.FieldValue.serverTimestamp()
                    }, { merge: true });
                } catch (authError) {
                    console.warn('Firebase registration issue:', authError.message);
                }
            }
            
            // Save state
            localStorage.setItem('realcheck_user_v2', 'registered');
            
            // 1. Close Popup
            regPopupOverlay.classList.remove('show');
            

        });
    }

    // ========== SCAM ANALYZER (DUAL-INPUT: TEXT + OCR) ==========

    let _analyzerMode = 'text-tab';

    window.switchTab = function switchTab(tabId, event) {
        _analyzerMode = tabId;
        document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        const tabEl = document.getElementById(tabId);
        if (tabEl) tabEl.classList.add('active');
        if (event && event.currentTarget) event.currentTarget.classList.add('active');
    };

    window.previewImage = function previewImage(event) {
        const file = event.target.files[0];
        const preview = document.getElementById('img-preview');
        if (!file || !preview) return;
        const reader = new FileReader();
        reader.onload = (e) => {
            preview.src = e.target.result;
            preview.style.display = 'block';
        };
        reader.readAsDataURL(file);
    };

    function buildLocalHeuristicResult(text) {
        const scamWords = [
            'registration fee', 'training fee', 'security deposit',
            'whatsapp to', 'telegram to', 'batch code',
            'pay to apply', 'joining fee', 'guaranteed salary',
            'earn from home', 'no experience needed'
        ];

        const lowerText = String(text || '').toLowerCase();
        let score = 0;
        const found = [];

        scamWords.forEach(word => {
            if (lowerText.includes(word)) {
                score = Math.min(score + 20, 100);
                found.push(word);
            }
        });

        const riskLevel = score >= 60 ? 'High' : score >= 30 ? 'Medium' : 'Low';

        return {
            score,
            found,
            riskLevel,
            statusText: score >= 40 ? '⚠ High Risk: Suspicious Offer' : '✅ Low Risk: Looks Legitimate',
            statusColor: score >= 40 ? '#f87171' : '#4ade80',
            detailsText: `Risk Score: ${score}% | Detected Signals: ${found.length > 0 ? found.join(', ') : 'None'}`
        };
    }

    function renderLocalHeuristic(result) {
        const resultDiv  = document.getElementById('detection-result');
        const statusEl   = document.getElementById('result-status');
        const detailsEl  = document.getElementById('risk-details');
        const riskBadge  = document.getElementById('riskBadge');
        const riskScore  = document.getElementById('riskScore');
        const reasonsList= document.getElementById('reasonsList');

        if (!resultDiv) return;

        if (riskBadge) {
            riskBadge.className = result.riskLevel === 'High' ? 'risk-badge risk-high'
                : result.riskLevel === 'Medium' ? 'risk-badge risk-medium'
                : 'risk-badge risk-low';
            riskBadge.textContent = `${result.riskLevel} Risk`;
        }
        if (riskScore) riskScore.textContent = String(result.score);

        if (statusEl) {
            statusEl.innerHTML = result.statusText;
            statusEl.style.color = result.statusColor;
        }

        if (detailsEl) {
            detailsEl.textContent = result.detailsText;
        }

        if (reasonsList) {
            reasonsList.innerHTML = '';
            if (result.found.length > 0) {
                result.found.forEach(w => {
                    const li = document.createElement('li');
                    li.textContent = w;
                    reasonsList.appendChild(li);
                });
            } else {
                const li = document.createElement('li');
                li.textContent = 'No obvious scam signals detected.';
                reasonsList.appendChild(li);
            }
        }

        resultDiv.style.display = 'block';
        resultDiv.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    function detectScamLogic(text) {
        const localResult = buildLocalHeuristicResult(text);
        renderLocalHeuristic(localResult);
        return localResult;
    }

    window.startAnalysis = async function startAnalysis() {
        const resultDiv = document.getElementById('detection-result');
        const analyzeBtn = document.querySelector('.analyze-now-btn');
        const originalLabel = analyzeBtn ? analyzeBtn.textContent : '';

        if (analyzeBtn) {
            analyzeBtn.textContent = '⏳ Processing...';
            analyzeBtn.disabled = true;
        }
        if (resultDiv) resultDiv.style.display = 'none';
        setScanModeBadge('');
        const verdictReset = document.getElementById('ai-verdict');
        if (verdictReset) {
            verdictReset.style.display = 'none';
            verdictReset.innerHTML = '';
        }

        try {
            if (_analyzerMode === 'text-tab') {
                const textEl = document.getElementById('job-text');
                const text = textEl ? textEl.value.trim() : '';
                if (!text) { alert('Please paste some job details first.'); return; }
                const localResult = detectScamLogic(text);
                await callGemini(text, localResult);

                // Also hit the backend for deeper analysis
                try {
                    const resp = await fetch('/api/analyze-job', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ rawText: text })
                    });
                    if (resp.ok) {
                        const result = await resp.json();
                        const riskBadge = document.getElementById('riskBadge');
                        const riskScore = document.getElementById('riskScore');
                        const reasonsList = document.getElementById('reasonsList');
                        if (riskBadge) {
                            riskBadge.className = `risk-badge risk-${String(result.risk || 'Low').toLowerCase()}`;
                            riskBadge.textContent = `${String(result.risk || 'Low')} Risk`;
                        }
                        if (riskScore) riskScore.textContent = Number.isFinite(result.score) ? String(result.score) : '0';
                        if (reasonsList) {
                            reasonsList.innerHTML = '';
                            const reasons = Array.isArray(result.reasons) ? result.reasons : [];
                            reasons.forEach(r => { const li = document.createElement('li'); li.textContent = r; reasonsList.appendChild(li); });
                        }
                        await initFirebase();
                        await saveAnalysisToFirestore({ rawText: text }, result);
                    }
                } catch (_) { /* backend unreachable — local result already shown */ }

            } else {
                const fileInput = document.getElementById('job-image');
                if (!fileInput || fileInput.files.length === 0) {
                    alert('Please upload an image first!');
                    return;
                }
                if (typeof Tesseract === 'undefined') {
                    alert('OCR library is loading. Please wait a moment and try again.');
                    return;
                }
                const { data: { text } } = await Tesseract.recognize(fileInput.files[0], 'eng', {
                    logger: () => {}
                });
                const localResult = detectScamLogic(text);
                await callGemini(text, localResult);
            }
        } finally {
            if (analyzeBtn) {
                analyzeBtn.textContent = originalLabel;
                analyzeBtn.disabled = false;
            }
        }
    };

    // ========== REMOTE JOBS LOADER ==========
    const dummyRemoteJobs = [
        {
            position: 'Frontend Developer Intern',
            company: 'TechVision AI',
            location: 'Remote',
            description: 'Work on responsive UI components, reusable frontend modules, and collaborate with designers to improve user experience.',
            apply_url: '#',
            salary: '₹15,000 / month',
            tags: ['Internship', 'Frontend', 'JavaScript'],
            riskScore: 12,
            status: 'Safe',
            role: 'internship'
        },
        {
            position: 'Backend Node.js Developer',
            company: 'SecureNet Systems',
            location: 'Hyderabad, India',
            description: 'Build APIs, optimize database queries, and manage backend services focused on reliability and security.',
            apply_url: '#',
            salary: '₹8 - 12 LPA',
            tags: ['Backend', 'Node.js', 'APIs'],
            riskScore: 85,
            status: 'Suspicious',
            role: 'backend developer'
        },
        {
            position: 'Data Analyst',
            company: 'DataFlow Corp',
            location: 'Remote',
            description: 'Analyze campaign and user data, prepare dashboards, and generate actionable insights for product teams.',
            apply_url: '#',
            salary: '₹6 - 8 LPA',
            tags: ['SQL', 'Excel', 'Analytics'],
            riskScore: 25,
            status: 'Safe',
            role: 'data analyst'
        }
    ];

    let allRemoteJobs = [];
    let currentDisplayedJobs = [];
    let currentJobsDomain = 'all';
    let jobsExpanded = false;

    const jobModal = document.getElementById('jobModal');
    const jobModalBody = document.getElementById('modal-body');
    const closeJobModalBtn = document.getElementById('closeJobModal');

    function getRemoteJobsEndpoints() {
        const endpoints = ['http://localhost:5000/api/remote-jobs', '/api/remote-jobs'];
        return [...new Set(endpoints)];
    }

    function getJobsContainer() {
        return document.getElementById('jobs-container') || document.getElementById('jobsContainer');
    }

    function normalizeJob(job) {
        return {
            position: job.position || job.job_title || 'Untitled Role',
            company: job.company || job.company_name || 'Unknown Company',
            location: job.location || 'Remote',
            description: job.description || job.job_description || '',
            apply_url: job.apply_url || job.url || '#',
            salary: job.salary || null,
            tags: Array.isArray(job.tags) ? job.tags : [],
            riskScore: Number.isFinite(job.riskScore) ? job.riskScore : (Number.isFinite(job.risk_score) ? job.risk_score : 0),
            status: job.status || 'Safe',
            role: (job.role || '').toLowerCase()
        };
    }

    function escapeHtml(value) {
        return String(value || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    function formatJobDescription(description) {
        const raw = String(description || '').trim();
        if (!raw) return 'No description provided by the employer.';
        return raw;
    }

    function showJobDetails(jobIndex) {
        const job = currentDisplayedJobs[jobIndex];
        if (!job || !jobModal || !jobModalBody) return;

        jobModalBody.innerHTML = `
            <div class="modal-header">
                <h2 style="color: var(--navy);">${escapeHtml(job.position)}</h2>
                <span class="company-tag">${escapeHtml(job.company)}</span>
            </div>
            <hr>
            <div class="job-full-details">
                <p><strong>Location:</strong> ${escapeHtml(job.location)}</p>
                <p><strong>Category:</strong> ${escapeHtml(job.role || 'general')}</p>
                <div class="description-box">
                    ${formatJobDescription(job.description)}
                </div>
                <center>
                    <a href="${escapeHtml(job.apply_url)}" target="_blank" rel="noopener noreferrer" class="apply-btn-large apply-btn-main">Apply on RemoteOK</a>
                </center>
            </div>
        `;

        jobModal.style.display = 'flex';
    }

    function closeModal() {
        if (jobModal) {
            jobModal.style.display = 'none';
        }
    }

    window.openModal = showJobDetails;
    window.closeModal = closeModal;

    function getFilteredRemoteJobs(domain) {
        if (domain === 'all') {
            return allRemoteJobs;
        }

        return allRemoteJobs.filter((job) => {
            const role = String(job.role || '').toLowerCase();
            const position = String(job.position || '').toLowerCase();
            return role === domain || position.includes(domain);
        });
    }

    function getInitialVisibleJobsCount() {
        const container = getJobsContainer();
        if (!container) return 6;

        const columns = getComputedStyle(container)
            .gridTemplateColumns
            .split(' ')
            .filter(Boolean)
            .length;

        const safeColumns = Math.max(columns || 1, 1);
        return safeColumns * 2;
    }

    function updateShowMoreButton(totalCount) {
        const showMoreJobsBtn = document.getElementById('showMoreJobsBtn');
        if (!showMoreJobsBtn) return;

        const shouldShow = !jobsExpanded && totalCount > getInitialVisibleJobsCount();
        showMoreJobsBtn.style.display = shouldShow ? 'inline-flex' : 'none';
    }

    async function loadRemoteJobs() {
        const container = getJobsContainer();
        if (!container) return;

        for (const endpoint of getRemoteJobsEndpoints()) {
            try {
                const res = await fetch(endpoint);
                if (!res.ok) {
                    throw new Error(`API ${res.status}`);
                }

                const data = await res.json();
                if (Array.isArray(data) && data.length > 0) {
                    allRemoteJobs = data.map(normalizeJob);
                    renderRemoteJobs('all');
                    return;
                }
            } catch (err) {
                console.warn(`Jobs fetch failed for ${endpoint}:`, err.message);
            }
        }

        console.warn('Using dummy jobs because API data was unavailable or empty.');
        allRemoteJobs = dummyRemoteJobs.map(normalizeJob);
        renderRemoteJobs('all');
    }

    function renderRemoteJobs(domain) {
        const container = getJobsContainer();
        if (!container) return;

        const filtered = getFilteredRemoteJobs(domain);
        const visibleJobs = jobsExpanded ? filtered : filtered.slice(0, getInitialVisibleJobsCount());
        currentDisplayedJobs = visibleJobs;

        if (filtered.length === 0) {
            container.innerHTML = '<div class="jobs-empty">No jobs found for this category right now.</div>';
            updateShowMoreButton(0);
            return;
        }

        container.innerHTML = visibleJobs.map((job, index) => {
            const tagClass = job.riskScore >= 60 ? 'danger' : job.riskScore >= 30 ? 'warning' : 'safe';
            const tagsHtml = (job.tags || []).slice(0, 4)
                .map(t => `<span class="job-tag-pill">${t}</span>`)
                .join('');
            const salaryHtml = job.salary
                ? `<span class="job-dynamic-salary">${job.salary}</span>`
                : '<span></span>';
            return `
                            <div class="job-dynamic-card job-card" data-job-index="${index}" onclick="openModal(${index})">
                <div class="job-dynamic-header">
                  <h3>${job.position}</h3>
                  <span class="risk-tag ${tagClass}">${job.status}</span>
                </div>
                                <p class="job-dynamic-company" style="color: var(--orange);"><i class="fa-solid fa-building"></i> ${job.company}</p>
                <p class="job-dynamic-location"><i class="fa-solid fa-location-dot"></i> ${job.location}</p>
                ${tagsHtml ? `<div class="job-dynamic-tags">${tagsHtml}</div>` : ''}
                <div class="job-dynamic-footer">
                  ${salaryHtml}
                  <div class="job-card-actions">
                                        <button type="button" class="btn btn-secondary btn-sm view-job-btn view-btn" data-job-index="${index}">View Details</button>
                    <a href="${job.apply_url}" target="_blank" rel="noopener noreferrer" class="btn btn-primary btn-sm">Apply on RemoteOK</a>
                  </div>
                </div>
              </div>`;
        }).join('');

        container.querySelectorAll('.view-job-btn').forEach((btn) => {
            btn.addEventListener('click', (event) => {
                event.stopPropagation();
                const index = Number(btn.getAttribute('data-job-index'));
                showJobDetails(index);
            });
        });

        container.querySelectorAll('.job-dynamic-card').forEach((card) => {
            card.addEventListener('click', (event) => {
                if (event.target.closest('a') || event.target.closest('button')) return;
                const index = Number(card.getAttribute('data-job-index'));
                showJobDetails(index);
            });
        });

        updateShowMoreButton(filtered.length);
    }

    if (closeJobModalBtn) {
        closeJobModalBtn.addEventListener('click', () => {
            closeModal();
        });
    }

    window.addEventListener('click', (event) => {
        if (event.target === jobModal) {
            closeModal();
        }
    });

    window.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && jobModal && (jobModal.style.display === 'block' || jobModal.style.display === 'flex')) {
            closeModal();
        }
    });

    document.querySelectorAll('.domain-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.domain-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
                                currentJobsDomain = btn.dataset.domain;
                                jobsExpanded = false;
                                renderRemoteJobs(currentJobsDomain);
        });
    });

                        const showMoreJobsBtn = document.getElementById('showMoreJobsBtn');
                        if (showMoreJobsBtn) {
                            showMoreJobsBtn.addEventListener('click', () => {
                                jobsExpanded = true;
                                renderRemoteJobs(currentJobsDomain);
                            });
                        }

                        window.addEventListener('resize', () => {
                            if (!jobsExpanded && allRemoteJobs.length > 0) {
                                renderRemoteJobs(currentJobsDomain);
                            }
                        });

    async function loadJobs() {
        await loadRemoteJobs();
    }

    window.loadJobs = loadJobs;
    loadJobs();

    // ========== SKILL GAP ANALYZER ==========
    const skillGapForm = document.querySelector('.skill-gap-form');
    const skillGapBackBtn = document.getElementById('skillGapBackBtn');

    if (skillGapBackBtn) {
        skillGapBackBtn.addEventListener('click', () => {
            const resultsEl  = document.getElementById('analysis-results');
            const courseList = document.getElementById('course-list');
            const skillsEl  = document.getElementById('current-skills');
            const roleEl    = document.getElementById('target-role');
            if (resultsEl)  resultsEl.style.display = 'none';
            if (courseList) courseList.innerHTML = '';
            if (skillsEl)   skillsEl.value = '';
            if (roleEl)     roleEl.selectedIndex = 0;
            if (skillGapForm) skillGapForm.style.display = 'grid';
            if (resultsEl) {
                const card = resultsEl.closest('.skill-gap-card');
                if (card) card.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        });
    }
});
